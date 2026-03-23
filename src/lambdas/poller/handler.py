"""Poller Lambda handler.

Fetches one page from a provider API, writes raw to S3, returns cursor info.
This handler is THIN — it delegates to shared libs for all logic.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

from src.shared.contracts import PollerInput, PollerOutput
from src.shared.dynamo_control import DynamoControl
from src.shared.gorgias_client import GorgiasTicketsClient
from src.shared.observability import MetricsClient, setup_logging
from src.shared.s3_writer import S3Writer
from src.shared.shopify_client import ShopifyOrdersClient

log = setup_logging("poller")

# Injected dependencies (set by test harness or Lambda environment)
_s3_writer: S3Writer | None = None
_dynamo: DynamoControl | None = None
_metrics: MetricsClient | None = None
_shopify_client = None  # Injected for testability
_gorgias_client = None  # Injected for testability


def _get_s3_writer() -> S3Writer:
    global _s3_writer
    if _s3_writer is None:
        _s3_writer = S3Writer(bucket=os.environ.get("RAW_BUCKET", "data-streams-raw-dev"))
    return _s3_writer


def _get_dynamo() -> DynamoControl:
    global _dynamo
    if _dynamo is None:
        _dynamo = DynamoControl(table_name=os.environ.get("CONTROL_TABLE", "data-streams-control-dev"))
    return _dynamo


def _get_metrics() -> MetricsClient:
    global _metrics
    if _metrics is None:
        _metrics = MetricsClient()
    return _metrics


def handler(event: dict, context=None) -> dict:
    """Lambda entry point. Input/output conform to PollerInput/PollerOutput contracts."""
    inp = PollerInput(**event)
    config = inp.stream_config

    log.info(
        "Polling page",
        run_id=inp.run_id,
        source=config.source,
        stream=config.stream,
        store_id=inp.store_id,
        page=inp.page_number,
        cursor=inp.cursor,
    )

    # Fetch one page from the provider
    client = _get_provider_client(config.source)
    response = client.fetch_page(
        store_id=inp.store_id,
        endpoint=config.endpoint or config.stream,
        api_version=config.api_version,
        cursor=inp.cursor,
        page_size=config.page_size,
    )

    # Write raw payload to S3
    s3 = _get_s3_writer()
    s3_key = s3.build_polling_key(
        source=config.source,
        stream=config.stream,
        store_id=inp.store_id,
        run_id=inp.run_id,
        page_number=inp.page_number,
    )
    s3.write_raw(
        key=s3_key,
        payload=response.body,
        metadata={
            "source": config.source,
            "stream": config.stream,
            "run-id": inp.run_id,
            "page": str(inp.page_number),
            "http-status": str(response.status_code),
            "fetched-at": datetime.now(timezone.utc).isoformat(),
        },
    )

    # Update run record
    dynamo = _get_dynamo()
    dynamo.update_run(
        source=config.source,
        stream=config.stream,
        store_id=inp.store_id,
        run_id=inp.run_id,
        pages=inp.page_number,
    )

    # Emit API health metrics (feeds dashboard widget 6 + 429 storm alarm)
    metrics = _get_metrics()
    metrics.emit_api_health(config.source, config.stream, response.status_code)

    output = PollerOutput(
        run_id=inp.run_id,
        s3_key=s3_key,
        record_count=response.record_count,
        next_cursor=response.next_cursor,
        checkpoint_cursor=response.checkpoint_cursor,
        has_more=response.has_more,
        http_status=response.status_code,
        rate_limit_remaining=response.rate_limit_remaining,
        rate_limit_reset_at=response.rate_limit_reset_at,
    )

    log.info(
        "Page complete",
        run_id=inp.run_id,
        s3_key=s3_key,
        records=response.record_count,
        has_more=response.has_more,
    )

    return output.model_dump(mode="json")


def _default_shopify_client():
    return ShopifyOrdersClient()


def _default_gorgias_client():
    return GorgiasTicketsClient()


def _get_provider_client(source: str):
    if source == "shopify":
        return _shopify_client or _default_shopify_client()
    if source == "gorgias":
        return _gorgias_client or _default_gorgias_client()
    raise ValueError(f"Unsupported poller source: {source}")
