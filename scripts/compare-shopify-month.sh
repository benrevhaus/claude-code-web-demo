#!/usr/bin/env bash
# Compare Shopify order count for a month: API vs Postgres.
# Both use store timezone (America/Los_Angeles) for DST-aware comparison.
# Usage: bash scripts/compare-shopify-month.sh 2016-05
set -euo pipefail

REGION="us-east-1"
MONTH="${1:?Usage: compare-shopify-month.sh YYYY-MM}"
YEAR="${MONTH%-*}"
MON="${MONTH#*-}"

# Calculate last day of month
LAST_DAY=$(python3 -c "
import calendar
y, m = int('${YEAR}'), int('${MON}')
print(f'${MONTH}-{calendar.monthrange(y, m)[1]:02d}')
")

echo "=== Shopify Orders: ${MONTH} ==="
echo "  Range: ${MONTH}-01 through ${LAST_DAY} (store timezone)"
echo ""

# Shopify API count — uses <=last_day (store timezone aware, matches ShopifyQL)
API_COUNT=$(AWS_REGION=${REGION} AWS_DEFAULT_REGION=${REGION} .venv/bin/python -c "
import json, os, sys
from urllib.request import Request, urlopen
sys.path.insert(0, '.')
os.environ['ENV'] = 'prod'
from src.shared.shopify_client import ShopifyGraphQLClient
client = ShopifyGraphQLClient(stream='orders')
domain = 'vitality-extracts.myshopify.com'
token = client._get_access_token(domain)
q = 'query { ordersCount(limit: null, query: \"created_at:>=${MONTH}-01 AND created_at:<=${LAST_DAY}\") { count } }'
req = Request(f'https://{domain}/admin/api/2026-04/graphql.json', data=json.dumps({'query': q}).encode(), headers={'Content-Type': 'application/json', 'X-Shopify-Access-Token': token, 'User-Agent': 'data-streams/1.0'}, method='POST')
with urlopen(req, timeout=30) as resp:
    print(json.loads(resp.read()).get('data', {}).get('ordersCount', {}).get('count', '?'))
")

# Postgres count — store timezone conversion for DST-aware comparison
PG_COUNT=$(bash scripts/psql-prod.sh -t -c "
  SELECT COUNT(*) FROM shopify.orders
  WHERE created_at >= ('${MONTH}-01'::timestamp AT TIME ZONE 'America/Los_Angeles')
  AND created_at < ('${LAST_DAY}'::timestamp AT TIME ZONE 'America/Los_Angeles' + INTERVAL '1 day');
" | tr -d ' ')

echo "  Shopify API:  ${API_COUNT}"
echo "  Postgres:     ${PG_COUNT}"

if [ "${API_COUNT}" = "${PG_COUNT}" ]; then
  echo "  ✓ MATCH"
else
  DIFF=$((PG_COUNT - API_COUNT))
  echo "  ✗ DIFF: ${DIFF} (positive = surplus, negative = gap)"
fi
