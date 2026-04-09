"""Check unmapped Yotpo product IDs against MySQL storereviews_products.
Run with tunnel active: AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 .venv/bin/python scripts/check_unmapped_products.py
"""

import os
import sys
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("ENV", "prod")

import pymysql
from src.shared.ssm import get_env_or_ssm

dsn = get_env_or_ssm("LEGACY_MYSQL_CONNECTION_STRING",
    f"/{os.environ.get('PARAM_PREFIX', 'data-streams')}/{os.environ['ENV']}/legacy/mysql_connection_string")
p = urlparse(dsn.replace("mysql+pymysql://", "mysql://"))
conn = pymysql.connect(
    host=p.hostname, port=p.port or 3306,
    user=p.username, password=p.password,
    database=p.path.lstrip("/"),
    charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
)

ids = ['191301', '22500847', '18944752', '24023788', '22500814',
       '36693788', '35666191', '18978421', '35178538', '20216727']

placeholders = ",".join(["%s"] * len(ids))

with conn.cursor() as cur:
    # Use columns the seed user can access on storereviews_reviews
    print("=== Sample reviews for top unmapped IDs ===", flush=True)
    for pid in ids:
        cur.execute("""
            SELECT id, product_id, title, LEFT(content, 80) as content, created_at
            FROM storereviews_reviews
            WHERE product_id = %s
            ORDER BY created_at DESC
            LIMIT 2
        """, (pid,))
        rows = cur.fetchall()
        count_cur = conn.cursor()
        count_cur.execute("SELECT COUNT(*) as c FROM storereviews_reviews WHERE product_id = %s", (pid,))
        total = count_cur.fetchone()["c"]
        print(f"\n  product_id={pid} ({total} reviews):", flush=True)
        for r in rows:
            print(f"    review={r['id']}  title={(r['title'] or '')[:60]}  date={r['created_at']}", flush=True)

conn.close()
