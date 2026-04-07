"""Check for products where ingested count < Yotpo total.
Delete after use. Output to stdout."""

import json
import os
import sys
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["ENV"] = "prod"

from src.shared.yotpo_client import YotpoClient

client = YotpoClient()
token = client._get_utoken()

# Fetch all bottom_lines
all_bl = []
page = 1
while True:
    url = f"https://api.yotpo.com/v1/apps/{client._app_key}/bottom_lines?count=100&page={page}"
    req = Request(url, headers={"Accept": "application/json", "X-Yotpo-Token": token})
    with urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read())
    bls = body.get("response", {}).get("bottomlines", [])
    all_bl.extend(bls)
    if len(bls) < 100:
        break
    page += 1

# Connect to Postgres and get ingested counts
from src.shared.pg_client import PgClient
pg = PgClient.from_env()
pg._ensure_connection()

with pg.connection.cursor() as cur:
    cur.execute("SELECT domain_key, COUNT(*) FROM yotpo.reviews_raw_current GROUP BY domain_key")
    ingested = {row[0]: row[1] for row in cur.fetchall()}

print(f"{'domain_key':<15} {'product_score':>13} {'yotpo_total':>11} {'ingested':>8} {'gap':>8}")
print("-" * 60)

gaps = []
for bl in sorted(all_bl, key=lambda x: x.get("total_reviews", 0), reverse=True):
    dk = bl.get("domain_key", "")
    total = bl.get("total_reviews", 0)
    ing = ingested.get(dk, 0)
    gap = total - ing
    if gap > 0 or total > 5000:
        gaps.append((dk, bl.get("product_score", 0), total, ing, gap))

for dk, score, total, ing, gap in gaps[:20]:
    print(f"{dk:<15} {score:>13.2f} {total:>11} {ing:>8} {gap:>8}")

print(f"\nProducts with gaps: {len([g for g in gaps if g[4] > 0])}")
print(f"Total missing reviews: {sum(g[4] for g in gaps)}")
