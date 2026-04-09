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

from src.shared.brandhaus_writer import BrandhausWriter, is_dual_write_enabled
from src.shared.gorgias_client import GorgiasTicketsClient
from src.shared.observability import MetricsClient, setup_logging
from src.shared.yotpo_client import YotpoClient
from src.shared.pg_client import PgClient
from src.shared.s3_writer import S3Writer
from src.shared.schema_registry import get_schema
from src.shared.shopify_client import ShopifyGraphQLClient, get_shopify_client
from src.shared.stream_config import load_all_stream_configs

log = setup_logging("stream-runner")

# Module-level lazy globals (Lambda warm-start reuse)
_s3_writer: S3Writer | None = None
_pg: PgClient | None = None
_metrics: MetricsClient | None = None
_brandhaus: BrandhausWriter | None = None
_shopify_clients: dict[str, ShopifyGraphQLClient] = {}
_gorgias_client = None
_yotpo_client = None


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


def _get_brandhaus() -> BrandhausWriter | None:
    global _brandhaus
    if not is_dual_write_enabled():
        return None
    if _brandhaus is None:
        _brandhaus = BrandhausWriter.from_env()
    return _brandhaus


def _get_metrics() -> MetricsClient:
    global _metrics
    if _metrics is None:
        _metrics = MetricsClient()
    return _metrics


def _get_provider_client(source: str, stream: str = "orders"):
    if source == "shopify":
        if stream not in _shopify_clients:
            _shopify_clients[stream] = get_shopify_client(stream)
        return _shopify_clients[stream]
    if source == "gorgias":
        return _gorgias_client or GorgiasTicketsClient()
    if source == "yotpo":
        return _yotpo_client or YotpoClient()
    raise ValueError(f"Unsupported source: {source}")


def _handle_product_refresh(event: dict) -> dict:
    """Handle Yotpo product refresh: find new products, backfill their reviews."""
    source = event["source"]
    stream = event["stream"]
    store_id = event["store_id"]

    run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc)

    log.info("Product refresh starting", run_id=run_id, source=source, store_id=store_id)

    client = _get_provider_client(source, stream)
    s3 = _get_s3_writer()
    pg = _get_pg()
    schema = get_schema(source, stream)

    new_keys = client.find_new_product_keys(pg)
    log.info("New products found", count=len(new_keys), run_id=run_id)

    if not new_keys:
        return {
            "run_id": run_id, "source": source, "stream": stream,
            "mode": "product_refresh", "status": "success",
            "new_products": 0, "records_processed": 0,
            "duration_seconds": round((datetime.now(timezone.utc) - started_at).total_seconds(), 2),
        }

    processed = 0
    failed = 0
    errors: list[str] = []
    cursor = None
    page_number = 0

    configs = load_all_stream_configs()
    config = configs.get(f"{source}#{stream}")
    max_pages = config.max_pages_per_run if config else 500

    upsert_fn = getattr(pg, schema.pg_upsert_method)
    history_fn = getattr(pg, schema.pg_history_method)

    for page_number in range(1, max_pages + 1):
        response = client.fetch_page_for_products(
            product_keys=new_keys, cursor=cursor, page_size=config.page_size if config else 100,
        )

        if response.status_code == 429:
            time.sleep(2.0)
            continue

        s3_key = s3.build_polling_key(source, stream, store_id, run_id, page_number)
        s3.write_raw(key=s3_key, payload=response.body, metadata={
            "source": source, "stream": stream, "run-id": run_id,
            "mode": "product_refresh", "page": str(page_number),
        })

        try:
            page = schema.raw_page_model(**response.body)
            records = getattr(page, schema.record_list_field, [])
        except Exception as e:
            log.error("Page parse failed", error=str(e), page=page_number)
            errors.append(f"Page {page_number}: {e}")
            if not response.has_more:
                break
            cursor = response.next_cursor
            continue

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
                errors.append(f"Record {getattr(raw_record, 'id', '?')}: {e}")
                pg.rollback()

        if not response.has_more:
            break
        cursor = response.next_cursor

    duration = round((datetime.now(timezone.utc) - started_at).total_seconds(), 2)
    result = {
        "run_id": run_id, "source": source, "stream": stream,
        "mode": "product_refresh", "status": "success" if failed == 0 else "partial_failure",
        "new_products": len(new_keys), "records_processed": processed,
        "records_failed": failed, "pages": page_number,
        "duration_seconds": duration,
    }
    if errors:
        result["errors"] = errors[:10]
    log.info("Product refresh complete", **result)
    return result


def _handle_mysql_seed(event: dict) -> dict:
    """Seed reviews + metadata from legacy MySQL to fill gaps (ADR-041).

    Reads from storereviews_reviews + users + metadata in MySQL,
    writes raw to S3, transforms via standard pipeline, upserts to Postgres.
    Cursor tracks last MySQL review ID processed — resumes across invocations.
    """
    import pymysql

    source = event["source"]
    stream = event["stream"]
    store_id = event["store_id"]
    batch_size = event.get("batch_size", 2000)

    run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc)

    log.info("MySQL seed starting", run_id=run_id, source=source, store_id=store_id)

    s3 = _get_s3_writer()
    pg = _get_pg()
    schema = get_schema(source, stream)
    metadata_schema = get_schema(source, "review-metadata")

    upsert_fn = getattr(pg, schema.pg_upsert_method)
    history_fn = getattr(pg, schema.pg_history_method)
    meta_upsert_fn = getattr(pg, metadata_schema.pg_upsert_method)
    meta_history_fn = getattr(pg, metadata_schema.pg_history_method)

    # Read cursor: last MySQL review ID processed
    cursor_value = pg.get_stream_cursor(source, "mysql-seed", store_id)
    last_id = int(cursor_value) if cursor_value else 0

    # Connect to legacy MySQL
    env = os.environ.get("ENV", "dev")
    prefix = os.environ.get("PARAM_PREFIX", "data-streams")
    from src.shared.ssm import get_env_or_ssm
    mysql_dsn = get_env_or_ssm("LEGACY_MYSQL_CONNECTION_STRING", f"/{prefix}/{env}/legacy/mysql_connection_string")

    # Parse pymysql connection from DSN
    # Format: mysql+pymysql://user:pass@host:port/db
    from urllib.parse import urlparse
    parsed = urlparse(mysql_dsn.replace("mysql+pymysql://", "mysql://"))
    mysql_conn = pymysql.connect(
        host=parsed.hostname,
        port=parsed.port or 3306,
        user=parsed.username,
        password=parsed.password,
        database=parsed.path.lstrip("/"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )

    processed = 0
    metadata_processed = 0
    failed = 0
    errors: list[str] = []
    max_id = last_id
    page_number = 0

    # Get IDs already in Postgres to skip them in MySQL query
    print(f"  Loading existing Postgres IDs...", flush=True)
    pg._ensure_connection()
    with pg.connection.cursor() as cur:
        cur.execute("SELECT id FROM yotpo.reviews_raw_current")
        existing_ids = {row[0] for row in cur.fetchall()}
    # Also load existing metadata IDs to skip
    with pg.connection.cursor() as cur:
        cur.execute("SELECT review_id FROM yotpo.review_metadata_current")
        existing_meta_ids = {row[0] for row in cur.fetchall()}
    print(f"  Postgres: {len(existing_ids)} reviews, {len(existing_meta_ids)} metadata rows", flush=True)

    # Build Yotpo internal ID → Shopify ID mapping from MySQL storereviews_products.
    # MySQL reviews store Yotpo internal product IDs; we need Shopify product IDs.
    print(f"  Loading product ID mapping from MySQL...", flush=True)
    with mysql_conn.cursor() as mysql_cur:
        mysql_cur.execute("SELECT id, product_id FROM storereviews_products WHERE product_id > 0")
        yotpo_to_shopify = {str(row["id"]): str(row["product_id"]) for row in mysql_cur.fetchall()}
        mysql_cur.execute("SELECT id FROM storereviews_products WHERE product_id = 0")
        site_review_product_ids = {str(row["id"]) for row in mysql_cur.fetchall()}
    print(f"  Product mapping: {len(yotpo_to_shopify)} entries, {len(site_review_product_ids)} site review IDs to skip", flush=True)

    try:
        with mysql_conn.cursor() as mysql_cur:
            # Fetch reviews in batches by ID
            mysql_cur.execute(
                """
                SELECT
                    r.id, r.product_id AS domain_key, r.score, r.content, r.title,
                    r.display_name AS name, r.sentiment, r.votes_up, r.votes_down,
                    r.verified_buyer, r.deleted, r.source_review_id, r.images_data,
                    r.user_type AS reviewer_type, r.created_at,
                    u.email,
                    m.state, m.country
                FROM storereviews_reviews r
                LEFT JOIN storereviews_reviews_users u ON r.id = u.review_id
                LEFT JOIN storereviews_reviews_metadata m ON r.id = m.review_id
                WHERE r.id > %s
                ORDER BY r.id ASC
                LIMIT %s
                """,
                (last_id, batch_size),
            )
            rows = mysql_cur.fetchall()

        # Filter out site reviews and rows with unmappable product IDs
        mappable_rows = []
        unmappable_count = 0
        site_review_count = 0
        for r in rows:
            mysql_pid = str(r["domain_key"]) if r["domain_key"] else None
            if not mysql_pid:
                unmappable_count += 1
                continue
            if mysql_pid in site_review_product_ids:
                site_review_count += 1
                continue
            if mysql_pid not in yotpo_to_shopify and len(mysql_pid) <= 8:
                unmappable_count += 1
                continue
            mappable_rows.append(r)
        new_rows = [r for r in mappable_rows if r["id"] not in existing_ids]
        log.info("Batch fetched", total=len(rows), new=len(new_rows), skipped=len(rows) - len(new_rows) - unmappable_count, unmappable=unmappable_count)
        print(f"  MySQL batch: {len(rows)} fetched, {len(new_rows)} new, {site_review_count} site, {unmappable_count} unmappable, {len(mappable_rows) - len(new_rows)} existing", flush=True)

        if not rows:
            log.info("MySQL seed complete — no more rows", last_id=last_id)
            print("  No more rows in MySQL — seed complete", flush=True)
            return {
                "run_id": run_id, "source": source, "mode": "mysql_seed",
                "status": "complete", "records_processed": 0,
                "last_id": last_id,
                "duration_seconds": round((datetime.now(timezone.utc) - started_at).total_seconds(), 2),
            }

        # Track max_id from ALL rows (including skipped) for cursor advancement
        max_id = max(r["id"] for r in rows)

        if not new_rows:
            print(f"  All reviews already exist — backfilling metadata only", flush=True)

        page_number = 1
        s3_key = ""

        # Build a raw page for S3 storage (only if there are new reviews)
        raw_records = []
        for row in new_rows:
            # Normalize MySQL row to match YotpoReviewRaw expectations
            # Map MySQL product_id (Yotpo internal) to Shopify domain_key
            mysql_product_id = str(row["domain_key"]) if row["domain_key"] else None
            shopify_dk = yotpo_to_shopify.get(mysql_product_id, mysql_product_id)

            record = {
                "id": row["id"],
                "domain_key": shopify_dk,
                "score": row["score"],
                "content": row["content"],
                "title": row["title"],
                "name": row["name"],
                "sentiment": float(row["sentiment"]) if row["sentiment"] else None,
                "votes_up": row["votes_up"],
                "votes_down": row["votes_down"],
                "verified_buyer": bool(row["verified_buyer"]),
                "deleted": bool(row["deleted"]),
                "source_review_id": row["source_review_id"],
                "reviewer_type": row["reviewer_type"],
                "email": row["email"],
                "created_at": row["created_at"].isoformat() + "Z" if row["created_at"] else None,
                "is_incentivized": False,
                "images_data": [],
                "product_yotpo_id": None,
                "product_name": None,
            }
            # Parse images_data JSON from MySQL varchar
            if row.get("images_data"):
                try:
                    import json as _json
                    record["images_data"] = _json.loads(row["images_data"])
                except (ValueError, TypeError):
                    record["images_data"] = []

            raw_records.append(record)

        # Write raw batch to S3 (only if new reviews)
        if raw_records:
            s3_key = s3.build_polling_key(source, stream, store_id, run_id, page_number)
            s3.write_raw(key=s3_key, payload={"response": {"reviews": raw_records}}, metadata={
                "source": source, "stream": stream, "run-id": run_id,
                "mode": "mysql_seed", "batch_start_id": str(new_rows[0]["id"]),
                "batch_end_id": str(new_rows[-1]["id"]),
            })

        # Batch commits — larger interval reduces cross-country round trips
        commit_interval = 1000

        for i, record in enumerate(raw_records):
            try:
                raw = schema.raw_model(**record)
                canonical = schema.transform(raw, store_id)
                updated = upsert_fn(canonical, s3_key, schema.version, run_id)
                if updated:
                    history_fn(canonical, run_id)
                processed += 1

                if (i + 1) % commit_interval == 0:
                    pg.commit()
                    elapsed = round((datetime.now(timezone.utc) - started_at).total_seconds(), 1)
                    rate = round((i + 1) / elapsed, 1) if elapsed > 0 else 0
                    print(f"  Reviews: {i + 1}/{len(raw_records)} | {rate}/sec", flush=True)

            except Exception as e:
                failed += 1
                errors.append(f"Review {record.get('id', '?')}: {e}")
                log.error("MySQL seed record failed", error=str(e), review_id=record.get("id"))
                pg.rollback()

        pg.commit()

        # Upsert metadata for rows in the batch that don't already have it.
        # This backfills state/country for the full corpus from MySQL.
        meta_needed = [r for r in mappable_rows if r["id"] not in existing_meta_ids and (r.get("state") or r.get("country"))]
        print(f"  Metadata: {len(meta_needed)} new of {len(mappable_rows)} mappable rows", flush=True)

        # Bulk INSERT metadata in chunks — one SQL statement per chunk
        chunk_size = 1000
        for chunk_start in range(0, len(meta_needed), chunk_size):
            chunk = meta_needed[chunk_start:chunk_start + chunk_size]
            if not chunk:
                break

            values = []
            params = []
            for row in chunk:
                updated = row["created_at"].isoformat() + "Z" if row.get("created_at") else None
                values.append("(%s, %s, %s, %s, %s, %s, %s, %s)")
                params.extend([
                    row["id"], store_id,
                    row.get("country"), row.get("country"),
                    row.get("state"), row.get("state"),
                    updated, run_id,
                ])

            sql = f"""
                INSERT INTO yotpo.review_metadata_current
                    (review_id, store_id, country, country_code, state, state_code, updated_at, run_id)
                VALUES {", ".join(values)}
                ON CONFLICT (review_id, store_id) DO UPDATE SET
                    country = EXCLUDED.country, country_code = EXCLUDED.country_code,
                    state = EXCLUDED.state, state_code = EXCLUDED.state_code,
                    updated_at = EXCLUDED.updated_at, run_id = EXCLUDED.run_id,
                    ingested_at = NOW()
            """
            try:
                with pg.connection.cursor() as cur:
                    cur.execute(sql, params)
                pg.commit()
                metadata_processed += len(chunk)
                elapsed = round((datetime.now(timezone.utc) - started_at).total_seconds(), 1)
                done = chunk_start + len(chunk)
                rate = round(done / elapsed, 1) if elapsed > 0 else 0
                print(f"  Metadata: {done}/{len(meta_needed)} | {rate}/sec", flush=True)
            except Exception as e:
                log.error("Bulk metadata upsert failed", error=str(e))
                pg.rollback()

        print(f"  Metadata done: {metadata_processed} upserted", flush=True)

    finally:
        mysql_conn.close()

    # Save cursor — last MySQL ID processed
    has_more = len(rows) >= batch_size
    status = "success" if failed == 0 else "partial_failure"

    pg.save_stream_cursor(
        source=source, stream="mysql-seed", store_id=store_id,
        cursor_value=str(max_id), run_id=run_id,
        status="running" if has_more else status,
        pages=page_number, records=processed,
    )

    duration = round((datetime.now(timezone.utc) - started_at).total_seconds(), 2)
    result = {
        "run_id": run_id, "source": source, "mode": "mysql_seed",
        "status": status, "has_more": has_more,
        "records_processed": processed, "metadata_processed": metadata_processed,
        "records_failed": failed, "last_id": max_id,
        "duration_seconds": duration,
    }
    if errors:
        result["errors"] = errors[:10]
    log.info("MySQL seed batch complete", **result)
    return result


def handler(event: dict, context=None) -> dict:
    """Lambda entry point. Event: {source, stream, store_id, mode?}."""
    # MySQL seed mode — backfill from legacy database (ADR-041)
    if event.get("mode") == "mysql_seed":
        return _handle_mysql_seed(event)

    # Product refresh mode — daily catalog diff + backfill new products
    if event.get("mode") == "product_refresh":
        return _handle_product_refresh(event)

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
    client = _get_provider_client(source, stream)
    s3 = _get_s3_writer()
    pg = _get_pg()
    brandhaus = _get_brandhaus()
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
                result = schema.transform(raw_record, store_id)
                # Some transforms return a list (e.g., inventory: one item -> multiple levels)
                canonical_list = result if schema.transform_returns_list else [result]
                for canonical in canonical_list:
                    updated = upsert_fn(canonical, s3_key, schema.version, run_id)
                    if updated:
                        history_fn(canonical, run_id)

                # Extract and upsert sub-streams (e.g., refunds/transactions from orders)
                parent_id = getattr(raw_record, "id", None)
                for sub in schema.sub_streams:
                    nested_items = getattr(raw_record, sub.extract_field, None) or []
                    if not isinstance(nested_items, list):
                        continue
                    for nested_raw_data in nested_items:
                        nested_raw = sub.raw_model(**nested_raw_data) if isinstance(nested_raw_data, dict) else nested_raw_data
                        sub_canonical = sub.transform(nested_raw, store_id, parent_id)
                        sub_upsert = getattr(pg, sub.pg_upsert_method)
                        sub_history = getattr(pg, sub.pg_history_method)
                        sub_updated = sub_upsert(sub_canonical, s3_key, sub.schema_version, run_id)
                        if sub_updated:
                            sub_history(sub_canonical, run_id)

                pg.commit()
                processed += 1

                # Dual-write to brandhaus (best-effort — never rolls back primary Postgres)
                if brandhaus:
                    try:
                        raw_dump = raw_record.model_dump(mode="json")
                        brandhaus.write_raw(source, stream, raw_record.id, raw_dump)
                        for sub in schema.sub_streams:
                            for item in getattr(raw_record, sub.extract_field, None) or []:
                                if isinstance(item, dict):
                                    item_id = item.get("id")
                                    if item_id is not None:
                                        brandhaus.write_raw(source, sub.extract_field, int(item_id), item)
                        brandhaus.commit()
                    except Exception as bh_err:
                        log.warning("Brandhaus dual-write failed", error=str(bh_err), record_id=raw_record.id)
                        brandhaus.rollback()

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

    # Yotpo publication: last-writer-wins (ADR-034)
    if source == "yotpo" and status in ("success", "partial_failure"):
        try:
            from src.shared.review_publisher import check_publication_readiness, run_publication_pass
            if check_publication_readiness(pg, source, store_id):
                pub_result = run_publication_pass(pg, store_id, run_id)
                log.info("Publication triggered by stream", stream=stream, **pub_result)
        except Exception as pub_err:
            log.error("Publication pass failed (source ingest succeeded)", error=str(pub_err))

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
