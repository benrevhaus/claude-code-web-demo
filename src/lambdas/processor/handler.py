"""Processor Lambda handler.

Reads raw from S3 → validates schema → transforms to canonical → upserts Postgres.
Stateless and deterministic: same S3 input → same Postgres output.
"""

from __future__ import annotations

import os

from src.shared.contracts import ProcessorInput, ProcessorOutput
from src.shared.dynamo_control import DynamoControl
from src.shared.observability import MetricsClient, setup_logging
from src.shared.pg_client import PgClient
from src.shared.s3_writer import S3Writer
from src.shared.schema_registry import get_schema
from src.shared.stream_config import load_all_stream_configs

log = setup_logging("processor")

# Injected dependencies
_s3_writer: S3Writer | None = None
_dynamo: DynamoControl | None = None
_pg: PgClient | None = None
_metrics: MetricsClient | None = None


def _get_s3() -> S3Writer:
    global _s3_writer
    if _s3_writer is None:
        _s3_writer = S3Writer(bucket=os.environ.get("RAW_BUCKET", "data-streams-raw-dev"))
    return _s3_writer


def _get_dynamo() -> DynamoControl:
    global _dynamo
    if _dynamo is None:
        _dynamo = DynamoControl(table_name=os.environ.get("CONTROL_TABLE", "data-streams-control-dev"))
    return _dynamo


def _get_pg() -> PgClient:
    global _pg
    if _pg is None:
        _pg = PgClient()  # Will fail without connection — must be injected for local testing
    return _pg


def _get_metrics() -> MetricsClient:
    global _metrics
    if _metrics is None:
        _metrics = MetricsClient()
    return _metrics


def handler(event: dict, context=None) -> dict:
    """Lambda entry point. Input/output conform to ProcessorInput/ProcessorOutput contracts."""
    inp = ProcessorInput(**event)

    log.info(
        "Processing",
        source=inp.source,
        stream=inp.stream,
        s3_key=inp.s3_key,
        trigger=inp.trigger,
    )

    # Look up schema
    schema = get_schema(inp.source, inp.stream)

    # Load stream config for idempotency key fields
    configs = load_all_stream_configs()
    stream_key = f"{inp.source}#{inp.stream}"
    stream_config = configs.get(stream_key)
    if not stream_config:
        raise ValueError(f"No stream config found for {stream_key}")
    if stream_config.schema_version != schema.version:
        raise ValueError(
            f"Stream config schema_version {stream_config.schema_version} does not match registry version {schema.version}"
        )

    # Read raw payload from S3
    s3 = _get_s3()
    raw_payload = s3.read_raw(inp.s3_key)

    # Parse into raw page model
    page = schema.raw_page_model(**raw_payload)
    records = getattr(page, schema.record_list_field, [])

    dynamo = _get_dynamo()
    pg = _get_pg()

    processed = 0
    skipped = 0
    failed = 0
    errors = []

    for raw_record in records:
        try:
            # Transform raw → canonical
            canonical = schema.transform(raw_record, inp.store_id)
            canonical_dict = canonical.model_dump(mode="json")

            # Compute idempotency key
            key_data = schema.build_idempotency_data(canonical_dict, stream_config.idempotency_key)
            key_hash = DynamoControl.compute_idempotency_key(key_data, stream_config.idempotency_key)

            # Check idempotency
            if dynamo.check_idempotency(inp.source, inp.stream, key_hash):
                skipped += 1
                continue

            # Upsert to Postgres
            updated = pg.upsert_order(canonical, inp.s3_key, schema.version, inp.run_id)

            if updated:
                pg.insert_order_history(canonical, inp.run_id)

            pg.commit()

            # Write idempotency key AFTER successful Postgres write
            dynamo.write_idempotency(
                inp.source, inp.stream, key_hash, inp.run_id or "webhook", inp.s3_key
            )

            processed += 1

        except Exception as e:
            failed += 1
            errors.append(f"Record {getattr(raw_record, 'id', '?')}: {e}")
            log.error("Record processing failed", error=str(e), record_id=getattr(raw_record, "id", None))
            pg.rollback()

    # Emit metrics
    metrics = _get_metrics()
    metrics.emit_records(inp.source, inp.stream, processed, skipped, failed)

    output = ProcessorOutput(
        records_processed=processed,
        records_skipped=skipped,
        records_failed=failed,
        schema_version=schema.version,
        errors=errors,
    )

    log.info(
        "Processing complete",
        processed=processed,
        skipped=skipped,
        failed=failed,
    )

    return output.model_dump(mode="json")
