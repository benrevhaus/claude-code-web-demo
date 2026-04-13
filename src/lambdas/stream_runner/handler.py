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
        meta_needed = [r for r in mappable_rows if r["id"] not in existing_meta_ids and (r.get("state") not in (None, "") or r.get("country") not in (None, ""))]
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
    # Take Aurora snapshot when seed completes (ADR-043 stage gate)
    if not has_more and status != "error":
        try:
            import boto3
            rds = boto3.client("rds")
            snapshot_id = f"yotpo-seed-complete-{run_id[:8]}"
            rds.create_db_cluster_snapshot(
                DBClusterIdentifier="data-streams-prod",
                DBClusterSnapshotIdentifier=snapshot_id,
            )
            log.info("Seed complete — Aurora snapshot created", snapshot_id=snapshot_id)
            print(f"  Aurora snapshot: {snapshot_id}", flush=True)
        except Exception as snap_err:
            log.warning("Aurora snapshot failed (non-fatal)", error=str(snap_err))
            print(f"  Aurora snapshot failed (non-fatal): {snap_err}", flush=True)

    log.info("MySQL seed batch complete", **result)
    return result


def _handle_gap_sweep(event: dict) -> dict:
    """Sweep for records missed during updated_at backfill by querying created_at ranges.

    Two modes:
      - "gap_sweep" (recurring): sweeps current and previous month only.
        Catches pagination gaps from recent incremental polling.
      - "gap_repair" (one-time): walks through all historical months from
        the beginning. Invoke repeatedly until complete, then delete cursor.

    Cursor tracks: "YYYY-MM" of the last completed month.
    """
    source = event["source"]
    stream = event["stream"]
    store_id = event["store_id"]
    mode = event.get("mode", "gap_sweep")

    run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc)
    now = datetime.now(timezone.utc)

    log.info("Gap sweep starting", run_id=run_id, source=source, stream=stream, store_id=store_id, mode=mode)

    client = _get_provider_client(source, stream)
    s3 = _get_s3_writer()
    pg = _get_pg()
    schema = get_schema(source, stream)

    configs = load_all_stream_configs()
    config = configs.get(f"{source}#{stream}")

    if mode == "gap_repair":
        # One-time historical repair: walk through all months from cursor
        sweep_cursor = pg.get_stream_cursor(source, f"{stream}-repair", store_id)

        if sweep_cursor:
            year, month = int(sweep_cursor[:4]), int(sweep_cursor[5:7])
            if month == 12:
                year += 1
                month = 1
            else:
                month += 1
        else:
            year, month = 2016, 1

        if year > now.year or (year == now.year and month > now.month):
            log.info("Gap repair complete — all months processed")
            return {
                "run_id": run_id, "source": source, "stream": stream,
                "mode": mode, "status": "complete",
                "duration_seconds": round((datetime.now(timezone.utc) - started_at).total_seconds(), 2),
            }
    else:
        # Recurring sweep: previous month and current month
        # Always check last 2 months regardless of cursor
        if now.month == 1:
            year, month = now.year - 1, 12
        else:
            year, month = now.year, now.month - 1

    if year > now.year or (year == now.year and month > now.month):
        log.info("Gap sweep complete — all months processed")
        return {
            "run_id": run_id, "source": source, "stream": stream,
            "mode": "gap_sweep", "status": "complete",
            "duration_seconds": round((datetime.now(timezone.utc) - started_at).total_seconds(), 2),
        }

    month_str = f"{year:04d}-{month:02d}"
    next_month = f"{year:04d}-{month + 1:02d}" if month < 12 else f"{year + 1:04d}-01"
    query_filter = f"created_at:>={month_str}-01 AND created_at:<{next_month}-01"

    log.info("Gap sweep month", month=month_str, query_filter=query_filter)

    # Pre-load existing order IDs for this month to skip S3 writes and upserts
    # for records we already have. Only truly missing records get the full
    # S3 write → transform → upsert pipeline.
    pg._ensure_connection()
    with pg.connection.cursor() as cur:
        table = config.pg_table if hasattr(config, 'pg_table') else schema.pg_table
        # Widen by 1 day on each side to handle timezone differences between
        # Shopify's store-timezone created_at filter and our UTC timestamps.
        # Shopify filters by store timezone; Postgres stores UTC. An order at
        # 2016-06-01T01:00Z (UTC) is "May 31" in US timezones.
        cur.execute(
            f"SELECT id FROM {table} WHERE created_at >= (%s::date - INTERVAL '1 day') AND created_at < (%s::date + INTERVAL '1 day')",
            (f"{month_str}-01", f"{next_month}-01"),
        )
        existing_ids = {row[0] for row in cur.fetchall()}
    log.info("Existing records for month", month=month_str, count=len(existing_ids))

    # Self-contained GraphQL pagination — does NOT use client.fetch_page()
    # because that method applies updated_at filters and loses the month filter.
    from src.shared.shopify_client import STREAM_QUERIES
    import json as _json
    from urllib.request import Request, urlopen as _urlopen
    from urllib.error import HTTPError as _HTTPError

    query_text_original, root_key = STREAM_QUERIES[stream]
    # Replace sortKey: UPDATED_AT with ID for the repair.
    # Sorting by UPDATED_AT or CREATED_AT causes page-boundary collisions when
    # multiple records share the same timestamp. Sorting by ID is collision-free
    # because IDs are unique. This guarantees 100% record coverage.
    query_text = query_text_original.replace("sortKey: UPDATED_AT", "sortKey: ID")
    domain = store_id if "." in store_id else f"{store_id}.myshopify.com"
    access_token = client._get_access_token(domain)
    api_version = config.api_version if config else "2026-04"
    graphql_url = f"https://{domain}/admin/api/{api_version}/graphql.json"

    # Quick check: if our count matches Shopify's count for this month, skip entirely.
    # This avoids paginating through months with zero gaps.
    try:
        count_query = f'query {{ {root_key}Count(limit: null, query: "{query_filter}") {{ count }} }}'
        count_req = Request(
            graphql_url,
            data=_json.dumps({"query": count_query}).encode("utf-8"),
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": access_token,
                "User-Agent": "data-streams/1.0",
            },
            method="POST",
        )
        with _urlopen(count_req, timeout=30) as resp:
            count_body = _json.loads(resp.read())
            api_count = count_body.get("data", {}).get(f"{root_key}Count", {}).get("count")

        if api_count is not None and len(existing_ids) >= api_count:
            log.info("Month complete — skipping", month=month_str, api_count=api_count, pg_count=len(existing_ids))
            # Save cursor and return immediately
            cursor_stream = f"{stream}-repair" if mode == "gap_repair" else f"{stream}-sweep"
            pg.save_stream_cursor(
                source=source, stream=cursor_stream, store_id=store_id,
                cursor_value=month_str, run_id=run_id,
                status="success", pages=0, records=0,
            )
            return {
                "run_id": run_id, "source": source, "stream": stream,
                "mode": mode, "month": month_str,
                "status": "success", "records_new": 0, "records_skipped": len(existing_ids),
                "api_count": api_count, "skipped_month": True,
                "duration_seconds": round((datetime.now(timezone.utc) - started_at).total_seconds(), 2),
            }
    except Exception:
        pass  # If count check fails, proceed with full pagination

    upsert_fn = getattr(pg, schema.pg_upsert_method)
    history_fn = getattr(pg, schema.pg_history_method)

    processed = 0
    skipped = 0
    failed = 0
    errors: list[str] = []
    page_cursor = None
    page_number = 0

    while True:
        page_number += 1
        payload = {
            "query": query_text,
            "variables": {"first": 250, "after": page_cursor, "query": query_filter},
        }
        request = Request(
            graphql_url,
            data=_json.dumps(payload).encode("utf-8"),
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": access_token,
                "User-Agent": "data-streams/1.0",
            },
            method="POST",
        )

        try:
            with _urlopen(request, timeout=60) as resp:
                body = _json.loads(resp.read())
        except _HTTPError as exc:
            if exc.code == 429:
                time.sleep(2.0)
                page_number -= 1
                continue
            raise

        if body.get("errors"):
            log.error("Gap sweep GraphQL error", errors=body["errors"])
            break

        resource = body.get("data", {}).get(root_key, {})
        edges = resource.get("edges", [])
        page_info = resource.get("pageInfo", {})

        if not edges:
            break

        # Parse page
        try:
            page_model = schema.raw_page_model(**body)
            records = getattr(page_model, schema.record_list_field, [])
        except Exception as e:
            log.error("Page parse failed", error=str(e), page=page_number)
            break

        # Filter to only records we don't already have.
        # The repair is INSERT-ONLY — never updates existing records.
        # The regular incremental stream handles updates via upsert-on-newer.
        new_records = [r for r in records if getattr(r, "id", None) not in existing_ids]
        skipped += len(records) - len(new_records)

        if new_records:
            # Write raw to S3 only for pages with new records (preserve lineage)
            s3_key = s3.build_polling_key(source, stream, store_id, run_id, page_number)
            s3.write_raw(key=s3_key, payload=body, metadata={
                "source": source, "stream": stream, "run-id": run_id,
                "mode": mode, "month": month_str, "page": str(page_number),
            })

            for raw_record in new_records:
                try:
                    result = schema.transform(raw_record, store_id)
                    canonical_list = result if schema.transform_returns_list else [result]
                    for canonical in canonical_list:
                        updated = upsert_fn(canonical, s3_key, schema.version, run_id)
                        if updated:
                            history_fn(canonical, run_id)
                            processed += 1
                            # Add to existing set so we don't re-process on next page
                            existing_ids.add(getattr(canonical, "id", None))

                    for sub in schema.sub_streams:
                        nested_items = getattr(raw_record, sub.extract_field, None) or []
                        if not isinstance(nested_items, list):
                            continue
                        for nested_raw_data in nested_items:
                            nested_raw = sub.raw_model(**nested_raw_data) if isinstance(nested_raw_data, dict) else nested_raw_data
                            sub_canonical = sub.transform(nested_raw, store_id, getattr(raw_record, "id", None))
                            sub_upsert = getattr(pg, sub.pg_upsert_method)
                            sub_history = getattr(pg, sub.pg_history_method)
                            sub_upsert(sub_canonical, s3_key, sub.schema_version, run_id)

                    pg.commit()
                except Exception as e:
                    failed += 1
                    errors.append(f"{getattr(raw_record, 'id', '?')}: {e}")
                    pg.rollback()

        if not page_info.get("hasNextPage"):
            break
        page_cursor = page_info.get("endCursor")

    # Save cursor — repair mode tracks progress, sweep mode doesn't need persistence
    cursor_stream = f"{stream}-repair" if mode == "gap_repair" else f"{stream}-sweep"
    pg.save_stream_cursor(
        source=source, stream=cursor_stream, store_id=store_id,
        cursor_value=month_str, run_id=run_id,
        status="success", pages=page_number, records=processed,
    )

    duration = round((datetime.now(timezone.utc) - started_at).total_seconds(), 2)
    result = {
        "run_id": run_id, "source": source, "stream": stream,
        "mode": mode, "month": month_str,
        "status": "success", "records_new": processed, "records_skipped": skipped,
        "records_failed": failed, "pages": page_number,
        "duration_seconds": duration,
    }
    if errors:
        result["errors"] = errors[:10]
    log.info("Gap sweep month complete", **result)
    return result


def handler(event: dict, context=None) -> dict:
    """Lambda entry point. Event: {source, stream, store_id, mode?}."""
    # MySQL seed mode — backfill from legacy database (ADR-041)
    if event.get("mode") == "mysql_seed":
        return _handle_mysql_seed(event)

    # Gap sweep/repair mode — find records missed by updated_at pagination
    if event.get("mode") in ("gap_sweep", "gap_repair"):
        return _handle_gap_sweep(event)

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

    # Detect backfill completion: cursor switched from position to timestamp.
    # Take an Aurora snapshot at this transition (ADR-043/044 rebuild stage gate).
    # Only Yotpo reviews uses this — Gorgias tickets uses simple incremental
    # polling without a backfill-to-incremental mode switch (ADR-044).
    if source == "yotpo" and stream == "reviews" and status == "success":
        from src.shared.yotpo_client import _is_timestamp
        was_position = cursor is not None and not _is_timestamp(cursor.split('"checkpoint":')[0] if '"checkpoint":' in str(cursor) else cursor)
        is_now_timestamp = last_checkpoint is not None and _is_timestamp(last_checkpoint)
        if was_position and is_now_timestamp:
            try:
                import boto3
                rds = boto3.client("rds")
                snapshot_id = f"yotpo-backfill-complete-{run_id[:8]}"
                rds.create_db_cluster_snapshot(
                    DBClusterIdentifier="data-streams-prod",
                    DBClusterSnapshotIdentifier=snapshot_id,
                )
                log.info("Backfill complete — Aurora snapshot created", snapshot_id=snapshot_id)
            except Exception as snap_err:
                log.warning("Aurora snapshot failed (non-fatal)", error=str(snap_err))

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
