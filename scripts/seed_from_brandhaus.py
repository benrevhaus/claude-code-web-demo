#!/usr/bin/env python3
"""Seed data-streams from existing brandhaus Postgres raw_json.

Reads raw_json payloads from the brandhaus database, writes them to S3
(creating an immutable audit trail), transforms them into canonical models,
and upserts them into the data-streams Postgres tables.

Zero Shopify API calls — all data comes from the existing brandhaus tables.

Usage:
    python scripts/seed_from_brandhaus.py --resource orders
    python scripts/seed_from_brandhaus.py --resource customers
    python scripts/seed_from_brandhaus.py --resource products
    python scripts/seed_from_brandhaus.py --resource all

Env vars:
    BRANDHAUS_CONNECTION_STRING  — brandhaus Postgres connection string
    POSTGRES_CONNECTION_STRING   — data-streams Postgres connection string
    RAW_BUCKET                   — S3 bucket for raw payloads
    ENV                          — dev/prod
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg2
import psycopg2.extras

from src.shared.pg_client import PgClient
from src.shared.s3_writer import S3Writer
from src.shared.schema_registry import get_schema

# brandhaus table → (source, stream, id_column, updated_at_json_path)
RESOURCE_MAP = {
    "orders": ("shopify", "orders", "order_id", "updated_at"),
    "customers": ("shopify", "customers", "customer_id", "updated_at"),
    "products": ("shopify", "products", "product_id", "updated_at"),
    "refunds": ("shopify", "refunds", "refund_id", "created_at"),
    "transactions": ("shopify", "transactions", "transaction_id", "created_at"),
}

BATCH_SIZE = 1000


def get_brandhaus_conn():
    conninfo = os.environ.get("BRANDHAUS_CONNECTION_STRING")
    if not conninfo:
        raise RuntimeError("Set BRANDHAUS_CONNECTION_STRING env var")
    return psycopg2.connect(conninfo)


def seed_resource(
    resource: str,
    brandhaus_conn,
    pg: PgClient,
    s3: S3Writer,
    store_id: str,
    dry_run: bool = False,
):
    source, stream, id_col, updated_at_key = RESOURCE_MAP[resource]
    schema = get_schema(source, stream)

    run_id = f"seed-{resource}-{uuid.uuid4().hex[:8]}"
    print(f"\n{'=' * 60}")
    print(f"Seeding {resource}: run_id={run_id}")
    print(f"{'=' * 60}")

    # Count total rows
    with brandhaus_conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) FROM {resource}")
        total = cur.fetchone()[0]
    print(f"  Total rows in brandhaus.{resource}: {total}")

    if total == 0:
        print("  Nothing to seed.")
        return

    processed = 0
    failed = 0
    max_cursor = None

    # Stream rows in batches using a server-side cursor
    with brandhaus_conn.cursor(name=f"seed_{resource}", cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.itersize = BATCH_SIZE
        cur.execute(f"SELECT {id_col}, raw_json FROM {resource} WHERE raw_json IS NOT NULL ORDER BY {id_col}")

        page_number = 0
        batch = []

        for row in cur:
            record_id = row[id_col]
            raw_json = row["raw_json"]

            if isinstance(raw_json, str):
                raw_json = json.loads(raw_json)

            batch.append((record_id, raw_json))

            if len(batch) >= BATCH_SIZE:
                page_number += 1
                p, f, mc = _process_batch(
                    batch, schema, source, stream, store_id, run_id,
                    page_number, s3, pg, updated_at_key, dry_run,
                )
                processed += p
                failed += f
                if mc:
                    max_cursor = mc if max_cursor is None else max(max_cursor, mc)
                batch = []
                print(f"  Processed {processed}/{total} ({processed * 100 // total}%)")

        # Final partial batch
        if batch:
            page_number += 1
            p, f, mc = _process_batch(
                batch, schema, source, stream, store_id, run_id,
                page_number, s3, pg, updated_at_key, dry_run,
            )
            processed += p
            failed += f
            if mc:
                max_cursor = mc if max_cursor is None else max(max_cursor, mc)

    # Set cursor so incremental polling picks up from here
    if max_cursor and not dry_run:
        pg.save_stream_cursor(
            source=source,
            stream=stream,
            store_id=store_id,
            cursor_value=max_cursor,
            run_id=run_id,
            status="success",
            pages=page_number,
            records=processed,
        )
        print(f"  Cursor set to: {max_cursor}")

    print(f"\n  Done: {processed} processed, {failed} failed")


def _process_batch(
    batch: list[tuple[int, dict]],
    schema,
    source: str,
    stream: str,
    store_id: str,
    run_id: str,
    page_number: int,
    s3: S3Writer,
    pg: PgClient,
    updated_at_key: str,
    dry_run: bool,
) -> tuple[int, int, str | None]:
    """Process a batch of raw_json records. Returns (processed, failed, max_cursor)."""
    processed = 0
    failed = 0
    max_cursor = None

    # Write the batch as a single S3 page
    page_payload = [raw for _, raw in batch]
    s3_key = s3.build_polling_key(
        source=source,
        stream=stream,
        store_id=store_id,
        run_id=run_id,
        page_number=page_number,
    )

    if not dry_run:
        s3.write_raw(
            key=s3_key,
            payload=page_payload,
            metadata={
                "source": source,
                "stream": stream,
                "run-id": run_id,
                "page": str(page_number),
                "seed": "true",
                "fetched-at": datetime.now(timezone.utc).isoformat(),
            },
        )

    upsert_fn = getattr(pg, schema.pg_upsert_method)
    history_fn = getattr(pg, schema.pg_history_method)

    for record_id, raw_json in batch:
        try:
            raw_record = schema.raw_model(**raw_json)
            canonical = schema.transform(raw_record, store_id)

            if not dry_run:
                updated = upsert_fn(canonical, s3_key, schema.version, run_id)
                if updated:
                    history_fn(canonical, run_id)

                # Also process sub-streams (refunds/transactions from orders)
                parent_id = getattr(raw_record, "id", None)
                for sub in schema.sub_streams:
                    nested_items = getattr(raw_record, sub.extract_field, None) or []
                    for nested_raw_data in nested_items:
                        nested_raw = sub.raw_model(**nested_raw_data) if isinstance(nested_raw_data, dict) else nested_raw_data
                        sub_canonical = sub.transform(nested_raw, store_id, parent_id)
                        sub_upsert = getattr(pg, sub.pg_upsert_method)
                        sub_history = getattr(pg, sub.pg_history_method)
                        sub_updated = sub_upsert(sub_canonical, s3_key, sub.schema_version, run_id)
                        if sub_updated:
                            sub_history(sub_canonical, run_id)

                pg.commit()

            # Track max cursor for final cursor position
            cursor_val = getattr(canonical, updated_at_key, None) or getattr(canonical, "created_at", None)
            if cursor_val:
                cursor_str = cursor_val.isoformat() if hasattr(cursor_val, "isoformat") else str(cursor_val)
                if max_cursor is None or cursor_str > max_cursor:
                    max_cursor = cursor_str

            processed += 1
        except Exception as e:
            failed += 1
            print(f"    FAIL record {record_id}: {e}")
            pg.rollback()

    return processed, failed, max_cursor


def main():
    parser = argparse.ArgumentParser(description="Seed data-streams from brandhaus raw_json")
    parser.add_argument("--resource", required=True, choices=list(RESOURCE_MAP) + ["all"])
    parser.add_argument("--store-id", default=os.environ.get("SHOPIFY_STORE_ID", ""))
    parser.add_argument("--dry-run", action="store_true", help="Parse and transform only, don't write")
    args = parser.parse_args()

    brandhaus_conn = get_brandhaus_conn()
    pg = PgClient.from_env()
    s3 = S3Writer(bucket=os.environ.get("RAW_BUCKET", "data-streams-raw-dev"))

    resources = list(RESOURCE_MAP) if args.resource == "all" else [args.resource]

    for resource in resources:
        seed_resource(resource, brandhaus_conn, pg, s3, args.store_id, args.dry_run)

    brandhaus_conn.close()
    print("\nSeed complete.")


if __name__ == "__main__":
    main()
