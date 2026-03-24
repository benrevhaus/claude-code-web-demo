"""Stream runner Lambda handler — MVP single-Lambda architecture (ADR-021/022).

Replaces the 4-Lambda Step Function pipeline with one handler that does the
full loop: fetch all pages → write raw to S3 → transform → upsert Postgres →
save cursor. Triggered directly by EventBridge on a schedule.

Reuses existing shared libs unchanged. No DynamoDB, no inter-Lambda contracts.
"""

from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timezone

from src.shared.gorgias_client import GorgiasTicketsClient
from src.shared.observability import MetricsClient, setup_logging
from src.shared.pg_client import PgClient
from src.shared.s3_writer import S3Writer
from src.shared.schema_registry import get_schema
from src.shared.shopify_client import ShopifyOrdersClient
from src.shared.stream_config import load_all_stream_configs

log = setup_logging("stream-runner")

# Module-level lazy globals (Lambda warm-start reuse)
_s3_writer: S3Writer | None = None
_pg: PgClient | None = None
_metrics: MetricsClient | None = None
_shopify_client = None
_gorgias_client = None


def _get_s3_writer() -> S3Writer:
    global _s3_writer
    if _s3_writer is None:
        _s3_writer = S3Writer(bucket=os.environ.get("RAW_BUCKET", "data-streams-raw-dev"))
    return _s3_writer


def _get_pg() -> PgClient:
    global _pg
    if _pg is None:
        _pg = PgClient.from_env()
    return _pg


def _get_metrics() -> MetricsClient:
    global _metrics
    if _metrics is None:
        _metrics = MetricsClient()
    return _metrics


def _get_provider_client(source: str):
    if source == "shopify":
        return _shopify_client or ShopifyOrdersClient()
    if source == "gorgias":
        return _gorgias_client or GorgiasTicketsClient()
    raise ValueError(f"Unsupported source: {source}")


def handler(event: dict, context=None) -> dict:
    """Lambda entry point. Event: {source, stream, store_id}."""
    source = event["source"]
    stream = event["stream"]
    store_id = event["store_id"]

    # Load config + schema
    configs = load_all_stream_configs()
    stream_key = f"{source}#{stream}"
    config = configs.get(stream_key)
    if not config:
        raise ValueError(f"No stream config found for {stream_key}")

    schema = get_schema(source, stream)
    run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc)

    log.info(
        "Run starting",
        run_id=run_id,
        source=source,
        stream=stream,
        store_id=store_id,
    )

    # Dependencies
    client = _get_provider_client(source)
    s3 = _get_s3_writer()
    pg = _get_pg()
    metrics = _get_metrics()

    # Read cursor from Postgres
    cursor = pg.get_stream_cursor(source, stream, store_id)

    processed = 0
    skipped = 0
    failed = 0
    errors: list[str] = []
    page_number = 0
    last_checkpoint = cursor

    for page_number in range(1, config.max_pages_per_run + 1):
        # Fetch one page
        response = client.fetch_page(
            store_id=store_id,
            endpoint=config.endpoint or config.stream,
            api_version=config.api_version,
            cursor=cursor,
            page_size=config.page_size,
        )

        # Emit API health metric
        metrics.emit_api_health(source, stream, response.status_code)

        # Handle 429 — sleep and retry this page
        if response.status_code == 429:
            wait_seconds = 2.0
            if response.rate_limit_reset_at:
                wait_seconds = max(
                    (response.rate_limit_reset_at - datetime.now(timezone.utc)).total_seconds(),
                    1.0,
                )
            log.warning("Rate limited", wait_seconds=wait_seconds, page=page_number)
            time.sleep(wait_seconds)
            # Retry by not advancing cursor or page — loop will re-fetch with same cursor
            continue

        # Write raw to S3
        s3_key = s3.build_polling_key(
            source=source,
            stream=stream,
            store_id=store_id,
            run_id=run_id,
            page_number=page_number,
        )
        s3.write_raw(
            key=s3_key,
            payload=response.body,
            metadata={
                "source": source,
                "stream": stream,
                "run-id": run_id,
                "page": str(page_number),
                "http-status": str(response.status_code),
                "fetched-at": datetime.now(timezone.utc).isoformat(),
            },
        )

        # Parse raw page and extract records
        try:
            page = schema.raw_page_model(**response.body)
            records = getattr(page, schema.record_list_field, [])
        except Exception as e:
            log.error("Page parse failed", error=str(e), page=page_number)
            errors.append(f"Page {page_number} parse: {e}")
            failed += response.record_count or 1
            if response.checkpoint_cursor:
                last_checkpoint = response.checkpoint_cursor
            if not response.has_more:
                break
            cursor = response.next_cursor
            continue

        # Transform + upsert each record
        upsert_fn = getattr(pg, schema.pg_upsert_method)
        history_fn = getattr(pg, schema.pg_history_method)

        for raw_record in records:
            try:
                canonical = schema.transform(raw_record, store_id)
                updated = upsert_fn(canonical, s3_key, schema.version, run_id)
                if updated:
                    history_fn(canonical, run_id)
                pg.commit()
                processed += 1
            except Exception as e:
                failed += 1
                record_id = getattr(raw_record, "id", "?")
                errors.append(f"Record {record_id}: {e}")
                log.error("Record failed", error=str(e), record_id=record_id)
                pg.rollback()

        # Track checkpoint cursor for cursor advancement
        if response.checkpoint_cursor:
            last_checkpoint = response.checkpoint_cursor

        log.info(
            "Page complete",
            run_id=run_id,
            page=page_number,
            records=response.record_count,
            has_more=response.has_more,
        )

        # Advance cursor for next page, or stop
        if not response.has_more:
            break
        cursor = response.next_cursor

    # Determine status
    if failed > 0 and processed > 0:
        status = "partial_failure"
    elif failed > 0 and processed == 0:
        status = "error"
    else:
        status = "success"

    # Save cursor only on success or partial_failure
    if status in ("success", "partial_failure") and last_checkpoint:
        pg.save_stream_cursor(
            source=source,
            stream=stream,
            store_id=store_id,
            cursor_value=last_checkpoint,
            run_id=run_id,
            status=status,
            pages=page_number,
            records=processed,
        )

    # Emit metrics
    metrics.emit_records(source, stream, processed, skipped, failed)

    duration_seconds = (datetime.now(timezone.utc) - started_at).total_seconds()
    metrics.emit_run_duration(source, stream, duration_seconds)

    if last_checkpoint:
        try:
            checkpoint_dt = datetime.fromisoformat(last_checkpoint.replace("Z", "+00:00"))
            lag_minutes = (datetime.now(timezone.utc) - checkpoint_dt).total_seconds() / 60
            metrics.emit_freshness(source, stream, store_id, lag_minutes)
        except (ValueError, TypeError):
            pass

    result = {
        "run_id": run_id,
        "source": source,
        "stream": stream,
        "store_id": store_id,
        "status": status,
        "pages": page_number,
        "records_processed": processed,
        "records_skipped": skipped,
        "records_failed": failed,
        "duration_seconds": round(duration_seconds, 2),
        "cursor": last_checkpoint,
    }
    if errors:
        result["errors"] = errors[:10]

    log.info("Run complete", **result)
    return result
