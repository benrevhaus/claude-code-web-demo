"""Compare Gorgias ticket count between API and Postgres. Delete after use.
Run: AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 .venv/bin/python scripts/check_gorgias_count.py
"""
import json
import os
import sys
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("ENV", "prod")

from src.shared.gorgias_client import GorgiasTicketsClient
from src.shared.pg_client import PgClient

# Get total from Gorgias API (fetch 1 ticket to get pagination total)
print("Checking Gorgias API...", flush=True)
client = GorgiasTicketsClient()
page = client.fetch_page(store_id="vitalityextracts", endpoint="tickets", api_version="v1", cursor=None, page_size=1)
# Gorgias doesn't expose total count directly — check by fetching with high cursor
# Instead just report what we have and the newest dates

# Get count from Postgres
print("Checking Postgres...", flush=True)
pg = PgClient.from_env()
pg._ensure_connection()
with pg.connection.cursor() as cur:
    cur.execute("SELECT COUNT(*) FROM gorgias.tickets")
    pg_count = cur.fetchone()[0]
    cur.execute("SELECT MIN(created_datetime), MAX(created_datetime) FROM gorgias.tickets")
    pg_oldest, pg_newest = cur.fetchone()
    cur.execute("SELECT cursor_value FROM control.stream_cursors WHERE source = 'gorgias'")
    cursor = cur.fetchone()

print(f"\nPostgres tickets: {pg_count}", flush=True)
print(f"Date range: {pg_oldest} → {pg_newest}", flush=True)
print(f"Cursor: {cursor[0] if cursor else 'none'}", flush=True)
print(f"\nAPI first page status: {page.status_code}, has_more: {page.has_more}", flush=True)
