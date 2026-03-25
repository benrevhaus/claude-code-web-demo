"""Webhook consumer Lambda — processes Shopify webhooks from SQS.

Reads messages from SQS (pushed by API Gateway), validates HMAC,
writes raw to S3, transforms, and upserts to Postgres.
Reuses all shared libs and schema registry from the polling path.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime, timezone

from src.shared.brandhaus_writer import BrandhausWriter, is_dual_write_enabled
from src.shared.observability import MetricsClient, setup_logging
from src.shared.pg_client import PgClient
from src.shared.s3_writer import S3Writer
from src.shared.schema_registry import get_schema
from src.shared.ssm import get_env_or_ssm

log = setup_logging("webhook-consumer")

# Module-level lazy globals (Lambda warm-start reuse)
_s3_writer: S3Writer | None = None
_pg: PgClient | None = None
_metrics: MetricsClient | None = None
_brandhaus: BrandhausWriter | None = None
_webhook_secret: str | None = None

# Topic → (source, stream) routing
# Webhook URLs use hyphens: /webhooks/shopify/orders-create
TOPIC_ROUTING: dict[str, tuple[str, str]] = {
    "orders-create": ("shopify", "orders"),
    "orders-updated": ("shopify", "orders"),
    "customers-create": ("shopify", "customers"),
    "customers-update": ("shopify", "customers"),
    "customers-delete": ("shopify", "customers"),
    "refunds-create": ("shopify", "orders"),  # Refunds come as order payloads
}


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


def _get_brandhaus() -> BrandhausWriter | None:
    global _brandhaus
    if not is_dual_write_enabled():
        return None
    if _brandhaus is None:
        _brandhaus = BrandhausWriter.from_env()
    return _brandhaus


def _get_webhook_secret() -> str:
    global _webhook_secret
    if _webhook_secret is None:
        env = os.environ.get("ENV", "dev")
        prefix = os.environ.get("PARAM_PREFIX", "data-streams")
        param = f"/{prefix}/{env}/shopify/webhook_secret"
        _webhook_secret = get_env_or_ssm("SHOPIFY_WEBHOOK_SECRET", param)
    return _webhook_secret


def _validate_hmac(body: str, expected_hmac: str, secret: str) -> bool:
    """Validate Shopify HMAC-SHA256 signature."""
    computed = base64.b64encode(
        hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8")
    return hmac.compare_digest(computed, expected_hmac)


def handler(event: dict, context=None) -> dict:
    """Lambda entry point. Triggered by SQS event source mapping."""
    records = event.get("Records", [])
    processed = 0
    failed = 0
    errors: list[str] = []

    s3 = _get_s3_writer()
    pg = _get_pg()
    brandhaus = _get_brandhaus()
    metrics = _get_metrics()
    store_id = os.environ.get("SHOPIFY_STORE_ID", "")

    for sqs_record in records:
        try:
            # Extract topic and HMAC from SQS message attributes
            msg_attrs = sqs_record.get("messageAttributes", {})
            topic = (msg_attrs.get("topic", {}).get("stringValue") or "").strip()
            hmac_header = (msg_attrs.get("hmac", {}).get("stringValue") or "").strip()
            raw_body = sqs_record.get("body", "")

            if not topic:
                log.warning("Missing topic in SQS message attributes")
                failed += 1
                continue

            # Route topic to (source, stream)
            route = TOPIC_ROUTING.get(topic)
            if route is None:
                log.warning("Unknown webhook topic", topic=topic)
                failed += 1
                continue
            source, stream = route

            # Validate HMAC
            if hmac_header:
                secret = _get_webhook_secret()
                if not _validate_hmac(raw_body, hmac_header, secret):
                    log.error("HMAC validation failed", topic=topic)
                    failed += 1
                    continue
            else:
                log.warning("No HMAC header — skipping validation", topic=topic)

            # Parse the webhook payload
            payload = json.loads(raw_body)
            webhook_id = str(uuid.uuid4())

            # Write raw to S3
            s3_key = s3.build_webhook_key(
                source=source,
                stream=stream,
                store_id=store_id,
                webhook_id=webhook_id,
            )
            s3.write_raw(
                key=s3_key,
                payload=payload,
                metadata={
                    "source": source,
                    "stream": stream,
                    "topic": topic,
                    "webhook-id": webhook_id,
                    "received-at": datetime.now(timezone.utc).isoformat(),
                },
            )

            # Handle customer deletion specially
            if topic == "customers-delete":
                customer_id = payload.get("id")
                if customer_id and store_id:
                    pg.soft_delete_customer(int(customer_id), store_id)
                    pg.commit()
                    processed += 1
                    log.info("Customer soft-deleted", customer_id=customer_id, topic=topic)
                continue

            # Get schema and process the record
            schema = get_schema(source, stream)

            # Webhook payloads are single records (not pages)
            raw_record = schema.raw_model(**payload)
            canonical = schema.transform(raw_record, store_id)

            upsert_fn = getattr(pg, schema.pg_upsert_method)
            history_fn = getattr(pg, schema.pg_history_method)
            updated = upsert_fn(canonical, s3_key, schema.version, webhook_id)
            if updated:
                history_fn(canonical, webhook_id)

            # Extract sub-streams (refunds/transactions from order webhooks)
            parent_id = getattr(raw_record, "id", None)
            for sub in schema.sub_streams:
                nested_items = getattr(raw_record, sub.extract_field, None) or []
                for nested_raw_data in nested_items:
                    nested_raw = sub.raw_model(**nested_raw_data) if isinstance(nested_raw_data, dict) else nested_raw_data
                    sub_canonical = sub.transform(nested_raw, store_id, parent_id)
                    sub_upsert = getattr(pg, sub.pg_upsert_method)
                    sub_history = getattr(pg, sub.pg_history_method)
                    sub_updated = sub_upsert(sub_canonical, s3_key, sub.schema_version, webhook_id)
                    if sub_updated:
                        sub_history(sub_canonical, webhook_id)
                    if brandhaus and isinstance(nested_raw_data, dict):
                        brandhaus.write_raw(source, sub.extract_field, sub_canonical.id, nested_raw_data)

            # Dual-write to brandhaus
            if brandhaus:
                brandhaus.write_raw(source, stream, raw_record.id, payload)
                brandhaus.commit()

            pg.commit()
            processed += 1

            log.info(
                "Webhook processed",
                topic=topic,
                source=source,
                stream=stream,
                record_id=getattr(raw_record, "id", "?"),
                webhook_id=webhook_id,
            )

        except Exception as e:
            failed += 1
            errors.append(str(e))
            log.error("Webhook processing failed", error=str(e))
            pg.rollback()

    # Emit metrics
    metrics.emit_records("shopify", "webhooks", processed, 0, failed)

    result = {
        "processed": processed,
        "failed": failed,
        "total": len(records),
    }
    if errors:
        result["errors"] = errors[:10]

    log.info("Batch complete", **result)
    return result
