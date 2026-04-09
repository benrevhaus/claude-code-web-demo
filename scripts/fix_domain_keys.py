"""Fix domain_keys using MySQL storereviews_products mapping.
Maps Yotpo internal IDs → Shopify product IDs. Excludes site reviews (product_id=0).
Run: AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 .venv/bin/python scripts/fix_domain_keys.py
"""

import os
import sys
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("ENV", "prod")

import pymysql
from src.shared.pg_client import PgClient
from src.shared.ssm import get_env_or_ssm

# Connect to MySQL for the mapping
print("=== Loading mapping from MySQL storereviews_products ===", flush=True)
dsn = get_env_or_ssm("LEGACY_MYSQL_CONNECTION_STRING",
    f"/{os.environ.get('PARAM_PREFIX', 'data-streams')}/{os.environ['ENV']}/legacy/mysql_connection_string")
p = urlparse(dsn.replace("mysql+pymysql://", "mysql://"))
mysql_conn = pymysql.connect(
    host=p.hostname, port=p.port or 3306,
    user=p.username, password=p.password,
    database=p.path.lstrip("/"),
    charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
)

with mysql_conn.cursor() as cur:
    cur.execute("SELECT id, product_id FROM storereviews_products WHERE product_id > 0")
    mysql_mapping = {str(row["id"]): str(row["product_id"]) for row in cur.fetchall()}

    cur.execute("SELECT id FROM storereviews_products WHERE product_id = 0")
    site_review_ids = {str(row["id"]) for row in cur.fetchall()}

mysql_conn.close()
print(f"  Product mapping: {len(mysql_mapping)} entries", flush=True)
print(f"  Site review product IDs: {len(site_review_ids)}", flush=True)

# Connect to Postgres
print("\n=== Finding rows to fix ===", flush=True)
pg = PgClient.from_env()
pg._ensure_connection()

with pg.connection.cursor() as cur:
    cur.execute("""
        SELECT domain_key, COUNT(*) as reviews
        FROM yotpo.reviews_raw_current
        WHERE LENGTH(domain_key) <= 8
        GROUP BY domain_key
        ORDER BY reviews DESC
    """)
    bad_keys = [(row[0], row[1]) for row in cur.fetchall()]

total_affected = sum(c for _, c in bad_keys)
mappable = [(dk, c) for dk, c in bad_keys if dk in mysql_mapping]
site_reviews = [(dk, c) for dk, c in bad_keys if dk in site_review_ids]
unknown = [(dk, c) for dk, c in bad_keys if dk not in mysql_mapping and dk not in site_review_ids]

print(f"  Total short IDs: {len(bad_keys)} affecting {total_affected} reviews", flush=True)
print(f"  Mappable to Shopify: {len(mappable)} IDs, {sum(c for _, c in mappable)} reviews", flush=True)
print(f"  Site reviews (delete): {len(site_reviews)} IDs, {sum(c for _, c in site_reviews)} reviews", flush=True)
print(f"  Unknown (no mapping): {len(unknown)} IDs, {sum(c for _, c in unknown)} reviews", flush=True)

if mappable:
    print(f"\n  Sample mappings:", flush=True)
    for dk, c in mappable[:5]:
        print(f"    {dk} → {mysql_mapping[dk]} ({c} reviews)", flush=True)

if unknown:
    print(f"\n  Unknown IDs (top 5):", flush=True)
    for dk, c in sorted(unknown, key=lambda x: -x[1])[:5]:
        print(f"    {dk}: {c} reviews", flush=True)

confirm = input(f"\n  Fix {sum(c for _, c in mappable)} reviews, delete {sum(c for _, c in site_reviews)} site reviews? (yes/no): ")
if confirm != "yes":
    print("  Aborted", flush=True)
    sys.exit(0)

# Fix mappable rows
print("\n=== Updating mappable rows ===", flush=True)
total_updated = 0
for i, (yotpo_dk, count) in enumerate(mappable):
    shopify_dk = mysql_mapping[yotpo_dk]
    with pg.connection.cursor() as cur:
        cur.execute("UPDATE yotpo.reviews_raw_current SET domain_key = %s WHERE domain_key = %s", (shopify_dk, yotpo_dk))
        total_updated += cur.rowcount
    pg.commit()
    if (i + 1) % 20 == 0:
        print(f"  {i + 1}/{len(mappable)} IDs updated ({total_updated} rows)", flush=True)
print(f"  Updated: {total_updated} rows", flush=True)

# Delete site reviews
print("\n=== Deleting site reviews ===", flush=True)
total_deleted = 0
for dk, count in site_reviews:
    with pg.connection.cursor() as cur:
        cur.execute("DELETE FROM yotpo.reviews_raw_current WHERE domain_key = %s", (dk,))
        total_deleted += cur.rowcount
    pg.commit()
print(f"  Deleted: {total_deleted} site review rows", flush=True)

# Also clean orphaned metadata
with pg.connection.cursor() as cur:
    cur.execute("DELETE FROM yotpo.review_metadata_current WHERE review_id NOT IN (SELECT id FROM yotpo.reviews_raw_current)")
    orphaned_meta = cur.rowcount
pg.commit()
print(f"  Cleaned: {orphaned_meta} orphaned metadata rows", flush=True)

# Final count
with pg.connection.cursor() as cur:
    cur.execute("SELECT COUNT(*) FROM yotpo.reviews_raw_current")
    reviews = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM yotpo.review_metadata_current")
    metadata = cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT domain_key) FROM yotpo.reviews_raw_current")
    products = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM yotpo.reviews_raw_current WHERE LENGTH(domain_key) <= 8")
    remaining_short = cur.fetchone()[0]

print(f"\n=== Final state ===", flush=True)
print(f"  Reviews: {reviews}", flush=True)
print(f"  Metadata: {metadata}", flush=True)
print(f"  Products: {products}", flush=True)
print(f"  Remaining short IDs: {remaining_short}", flush=True)
print("=== Done ===", flush=True)
