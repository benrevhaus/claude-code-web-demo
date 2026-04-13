#!/usr/bin/env bash
# Compare Shopify order count for a month between API and Postgres.
# Handles DST-aware timezone conversion automatically.
# Usage: bash scripts/compare-shopify-month.sh 2016-05
set -euo pipefail

REGION="us-east-1"
MONTH="${1:?Usage: compare-shopify-month.sh YYYY-MM}"
YEAR="${MONTH%-*}"
MON="${MONTH#*-}"

# Calculate next month
if [ "$MON" = "12" ]; then
  NEXT_MONTH="$((YEAR + 1))-01"
else
  NEXT_MONTH="${YEAR}-$(printf '%02d' $((10#$MON + 1)))"
fi

echo "=== Shopify Orders: ${MONTH} ==="
echo ""

# Shopify API count
API_COUNT=$(AWS_REGION=${REGION} AWS_DEFAULT_REGION=${REGION} .venv/bin/python -c "
import json, os, sys
from urllib.request import Request, urlopen
sys.path.insert(0, '.')
os.environ['ENV'] = 'prod'
from src.shared.shopify_client import ShopifyGraphQLClient
client = ShopifyGraphQLClient(stream='orders')
domain = 'vitality-extracts.myshopify.com'
token = client._get_access_token(domain)
q = 'query { ordersCount(limit: null, query: \"created_at:>=${MONTH}-01 AND created_at:<${NEXT_MONTH}-01\") { count } }'
req = Request(f'https://{domain}/admin/api/2026-04/graphql.json', data=json.dumps({'query': q}).encode(), headers={'Content-Type': 'application/json', 'X-Shopify-Access-Token': token, 'User-Agent': 'data-streams/1.0'}, method='POST')
with urlopen(req, timeout=30) as resp:
    print(json.loads(resp.read()).get('data', {}).get('ordersCount', {}).get('count', '?'))
")

# Postgres counts
COUNTS=$(bash scripts/psql-prod.sh -t -c "
SELECT
  (SELECT COUNT(*) FROM shopify.orders
   WHERE created_at >= ('${MONTH}-01'::timestamp AT TIME ZONE 'America/Los_Angeles')
   AND created_at < (('${NEXT_MONTH}-01'::timestamp + INTERVAL '1 day') AT TIME ZONE 'America/Los_Angeles')
  ) as api_match,
  (SELECT COUNT(*) FROM shopify.orders
   WHERE created_at >= ('${MONTH}-01'::timestamp AT TIME ZONE 'America/Los_Angeles')
   AND created_at < ('${NEXT_MONTH}-01'::timestamp AT TIME ZONE 'America/Los_Angeles')
  ) as business_match;
")

API_MATCH=$(echo "$COUNTS" | awk -F'|' '{print $1}' | tr -d ' ')
BIZ_MATCH=$(echo "$COUNTS" | awk -F'|' '{print $2}' | tr -d ' ')

echo "  Shopify API (ordersCount):     ${API_COUNT}"
echo "  Postgres (API-matching range): ${API_MATCH}"
echo "  Postgres (business/ShopifyQL): ${BIZ_MATCH}"
echo ""

if [ "${API_COUNT}" = "${API_MATCH}" ]; then
  echo "  ✓ API count matches Postgres"
else
  echo "  ✗ GAP: API=${API_COUNT} Postgres=${API_MATCH} Missing=$((API_COUNT - API_MATCH))"
fi
