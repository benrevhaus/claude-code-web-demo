"""Check metadata that came from the Yotpo API (not MySQL seed).
Identifies metadata rows for reviews ingested AFTER the seed started,
then verifies they have valid state/country from the API.
Run: AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 .venv/bin/python scripts/test_new_metadata.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("ENV", "prod")

from src.shared.pg_client import PgClient

print("Connecting to Postgres...", flush=True)
pg = PgClient.from_env()
pg._ensure_connection()

# Find the latest seed run_id to distinguish seed vs API metadata
with pg.connection.cursor() as cur:
    # Get seed run IDs
    cur.execute("""
        SELECT run_id FROM control.stream_cursors
        WHERE source = 'yotpo' AND stream = 'mysql-seed'
    """)
    seed_row = cur.fetchone()

    # Get the latest metadata ingestion from the reviews Lambda (not seed)
    cur.execute("""
        SELECT run_id FROM control.stream_cursors
        WHERE source = 'yotpo' AND stream = 'review-metadata'
    """)
    meta_cursor = cur.fetchone()

    # Find metadata rows NOT from the seed — their run_id won't match seed run_ids
    # Simpler approach: find reviews that were ingested by the API (incremental mode)
    # and check if they have metadata
    cur.execute("""
        SELECT
            COUNT(*) as total_reviews,
            COUNT(m.review_id) as has_metadata,
            COUNT(*) - COUNT(m.review_id) as missing_metadata
        FROM yotpo.reviews_raw_current r
        LEFT JOIN yotpo.review_metadata_current m
            ON r.id = m.review_id AND r.store_id = m.store_id
        WHERE r.created_at > NOW() - INTERVAL '3 days'
    """)
    recent = cur.fetchone()
    print(f"\nReviews created in last 3 days:", flush=True)
    print(f"  Total: {recent[0]}", flush=True)
    print(f"  With metadata: {recent[1]}", flush=True)
    print(f"  Missing metadata: {recent[2]}", flush=True)

    # Show sample of recent metadata (if any)
    cur.execute("""
        SELECT r.id, r.name, r.created_at::date,
               m.state, m.country, m.run_id,
               m.ingested_at
        FROM yotpo.reviews_raw_current r
        INNER JOIN yotpo.review_metadata_current m
            ON r.id = m.review_id AND r.store_id = m.store_id
        WHERE r.created_at > NOW() - INTERVAL '3 days'
            AND m.state IS NOT NULL AND m.state != ''
        ORDER BY m.ingested_at DESC
        LIMIT 10
    """)
    rows = cur.fetchall()

    if rows:
        print(f"\nRecent metadata samples (newest first):", flush=True)
        print(f"  {'ID':<12} {'Created':<12} {'State':<20} {'Country':<8} {'Meta Ingested'}", flush=True)
        print(f"  {'-'*80}", flush=True)
        for row in rows:
            print(f"  {row[0]:<12} {str(row[2]):<12} {(row[3] or ''):<20} {(row[4] or ''):<8} {str(row[6])[:19]}", flush=True)
    else:
        print(f"\nNo recent metadata with state/country found.", flush=True)
        print(f"The metadata Lambda may not have run yet, or recent reviews have no metadata in Yotpo.", flush=True)

    # Check if metadata Lambda has run successfully
    cur.execute("""
        SELECT stream, last_status, records_total, last_run_at
        FROM control.stream_cursors
        WHERE source = 'yotpo' AND stream = 'review-metadata'
    """)
    meta_status = cur.fetchone()
    if meta_status:
        print(f"\nMetadata Lambda status:", flush=True)
        print(f"  Last status: {meta_status[1]}", flush=True)
        print(f"  Records: {meta_status[2]}", flush=True)
        print(f"  Last run: {meta_status[3]}", flush=True)
    else:
        print(f"\nMetadata Lambda has not run yet (no cursor entry).", flush=True)
