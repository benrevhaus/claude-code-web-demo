"""Run-finalizer Lambda handler.

Closes run record, updates cursor, computes freshness, emits CloudWatch metrics.
Always runs — even after partial failure.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

from src.shared.contracts import FinalizerInput, FinalizerOutput
from src.shared.dynamo_control import DynamoControl
from src.shared.observability import MetricsClient, setup_logging

log = setup_logging("run-finalizer")

# Injected dependencies
_dynamo: DynamoControl | None = None
_metrics: MetricsClient | None = None


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
    """Lambda entry point. Input/output conform to FinalizerInput/FinalizerOutput contracts."""
    inp = FinalizerInput(**event)
    config = inp.stream_config

    log.info(
        "Finalizing run",
        run_id=inp.run_id,
        source=config.source,
        stream=config.stream,
        status=inp.status,
    )

    dynamo = _get_dynamo()

    # Close run record
    dynamo.close_run(
        source=config.source,
        stream=config.stream,
        store_id=inp.store_id,
        run_id=inp.run_id,
        status=inp.status,
        total_pages=inp.total_pages,
        total_records=inp.total_records,
        error_message=inp.error_message,
    )

    # Update cursor if run was at least partially successful
    if inp.final_cursor and inp.status in ("success", "partial_failure"):
        dynamo.update_cursor(
            source=config.source,
            stream=config.stream,
            store_id=inp.store_id,
            cursor_value=inp.final_cursor,
            run_id=inp.run_id,
        )

    # Compute freshness
    freshness_lag = 0.0
    if inp.final_cursor:
        freshness_lag = dynamo.update_freshness(
            source=config.source,
            stream=config.stream,
            store_id=inp.store_id,
            last_record_at=inp.final_cursor,
        )

    # Emit CloudWatch metrics (records_processed already emitted by processor per-page)
    metrics = _get_metrics()
    metrics.emit_freshness(config.source, config.stream, inp.store_id, freshness_lag)

    output = FinalizerOutput(
        run_id=inp.run_id,
        freshness_lag_minutes=freshness_lag,
        status=inp.status,
    )

    log.info(
        "Run finalized",
        run_id=inp.run_id,
        freshness_lag=freshness_lag,
        sla=config.freshness_sla_minutes,
        sla_breached=freshness_lag > config.freshness_sla_minutes,
    )

    return output.model_dump(mode="json")
