"""Compare a random sample of reviews between Postgres and MySQL.
Picks reviews from ~3 months ago that should be stable in both systems.
Run with tunnel active: AWS_REGION=us-east-1 .venv/bin/python scripts/reconcile_sample.py
"""

import json
import os
import sys
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("ENV", "prod")

import pymysql
from src.shared.pg_client import PgClient
from src.shared.ssm import get_env_or_ssm

SAMPLE_SIZE = 1000

# Connect to Postgres
print("Connecting to Postgres...", flush=True)
pg = PgClient.from_env()
pg._ensure_connection()

# Get a random sample of review IDs from ~3 months ago
with pg.connection.cursor() as cur:
    cur.execute("""
        SELECT id, domain_key, score, title, LEFT(content, 100) as content_prefix,
               votes_up, votes_down, verified_buyer, deleted, sentiment,
               name, created_at::text
        FROM yotpo.reviews_raw_current
        WHERE created_at BETWEEN NOW() - INTERVAL '4 months' AND NOW() - INTERVAL '2 months'
        ORDER BY RANDOM()
        LIMIT %s
    """, (SAMPLE_SIZE,))
    pg_rows = {row[0]: row for row in cur.fetchall()}

if not pg_rows:
    print("No reviews found in that date range")
    sys.exit(1)

print(f"Sampled {len(pg_rows)} reviews from Postgres (2-4 months old)", flush=True)

# Connect to MySQL
print("Connecting to MySQL...", flush=True)
dsn = get_env_or_ssm("LEGACY_MYSQL_CONNECTION_STRING", f"/{os.environ.get('PARAM_PREFIX', 'data-streams')}/{os.environ['ENV']}/legacy/mysql_connection_string")
p = urlparse(dsn.replace("mysql+pymysql://", "mysql://"))
mysql_conn = pymysql.connect(
    host=p.hostname, port=p.port or 3306,
    user=p.username, password=p.password,
    database=p.path.lstrip("/"),
    charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
)

ids = list(pg_rows.keys())
placeholders = ",".join(["%s"] * len(ids))

with mysql_conn.cursor() as cur:
    cur.execute(f"""
        SELECT id, product_id, score, title, LEFT(content, 100) as content_prefix,
               votes_up, votes_down, verified_buyer, deleted, sentiment,
               display_name, created_at
        FROM storereviews_reviews
        WHERE id IN ({placeholders})
    """, ids)
    mysql_rows = {row["id"]: row for row in cur.fetchall()}

mysql_conn.close()

print(f"Found {len(mysql_rows)} matching reviews in MySQL", flush=True)
print(f"Missing from MySQL: {len(pg_rows) - len(mysql_rows)}", flush=True)
print()

# Compare field by field
mismatches = 0
field_mismatches = {}
matched = 0

for review_id, pg_row in pg_rows.items():
    if review_id not in mysql_rows:
        continue

    my = mysql_rows[review_id]
    pg_id, pg_dk, pg_score, pg_title, pg_content, pg_vup, pg_vdown, pg_vb, pg_del, pg_sent, pg_name, pg_created = pg_row

    # Note: domain_key is NOT compared — Postgres stores Shopify product ID
    # (from widget endpoint), MySQL stores Yotpo internal product ID.
    # Both are correct but different ID systems.
    # Content is NOT compared for exact match — MySQL is latin1, loses emoji.
    checks = [
        ("score", pg_score, my["score"]),
        ("title", (pg_title or "").strip(), (my["title"] or "").strip()),
        ("votes_up", pg_vup, my["votes_up"]),
        ("votes_down", pg_vdown, my["votes_down"]),
        ("verified_buyer", pg_vb, bool(my["verified_buyer"])),
        ("deleted", pg_del, bool(my["deleted"])),
        ("name", (pg_name or "").strip(), (my["display_name"] or "").strip()),
    ]

    row_ok = True
    for field, pg_val, my_val in checks:
        if str(pg_val) != str(my_val):
            row_ok = False
            mismatches += 1
            field_mismatches.setdefault(field, []).append({
                "id": review_id,
                "postgres": pg_val,
                "mysql": my_val,
            })

    if row_ok:
        matched += 1

print(f"=== RECONCILIATION RESULTS ===")
print(f"Sample size: {len(pg_rows)}")
print(f"Found in both: {len(mysql_rows)}")
print(f"Matched perfectly: {matched}")
print(f"With mismatches: {len(mysql_rows) - matched}")
print(f"Total field mismatches: {mismatches}")
print()

if field_mismatches:
    print("=== MISMATCHES BY FIELD ===")
    for field, examples in sorted(field_mismatches.items()):
        print(f"\n{field}: {len(examples)} mismatches")
        for ex in examples[:3]:
            print(f"  ID {ex['id']}: PG={ex['postgres']!r}  MySQL={ex['mysql']!r}")
else:
    print("PERFECT MATCH — all sampled fields identical between Postgres and MySQL")
