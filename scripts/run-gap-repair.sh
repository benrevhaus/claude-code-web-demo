#!/usr/bin/env bash
# One-time historical gap repair for Shopify orders.
# Invokes gap_repair mode repeatedly until all months are processed.
# Shows running totals: Postgres vs Shopify API (business count).
# Usage: bash scripts/run-gap-repair.sh
set -euo pipefail

REGION="us-east-1"

STORE_ID=$(aws events list-targets-by-rule --region "${REGION}" \
  --rule data-streams-shopify-orders-prod \
  --query "Targets[0].Input" --output text --no-cli-pager | python3 -c "import sys,json; print(json.load(sys.stdin)['store_id'])")

echo "=== Shopify Orders Gap Repair ==="
echo "Store: ${STORE_ID}"
echo ""

# Get total Shopify count (business count using <=last_day)
SHOPIFY_TOTAL=$(AWS_REGION=${REGION} AWS_DEFAULT_REGION=${REGION} .venv/bin/python << 'PYEOF'
import json, os, sys, calendar
from urllib.request import Request, urlopen
from datetime import datetime, timezone
sys.path.insert(0, '.')
os.environ['ENV'] = 'prod'
from src.shared.shopify_client import ShopifyGraphQLClient
client = ShopifyGraphQLClient(stream='orders')
domain = 'vitality-extracts.myshopify.com'
token = client._get_access_token(domain)
now = datetime.now(timezone.utc)
last_day = calendar.monthrange(now.year, now.month)[1]
q = 'query { ordersCount(limit: null, query: "created_at:<=' + f'{now.year}-{now.month:02d}-{last_day:02d}' + '") { count } }'
req = Request(f'https://{domain}/admin/api/2026-04/graphql.json', data=json.dumps({'query': q}).encode(), headers={'Content-Type': 'application/json', 'X-Shopify-Access-Token': token, 'User-Agent': 'data-streams/1.0'}, method='POST')
with urlopen(req, timeout=30) as resp:
    body = json.loads(resp.read())
    print(body.get('data', {}).get('ordersCount', {}).get('count', '?'))
PYEOF
)

PG_TOTAL=$(bash scripts/psql-prod.sh -t -c "SELECT COUNT(*) FROM shopify.orders;" | tr -d ' ')

echo "  Shopify total (business): ${SHOPIFY_TOTAL}"
echo "  Postgres total:           ${PG_TOTAL}"
echo "  Gap:                      $((SHOPIFY_TOTAL - PG_TOTAL))"
echo ""

ROUND=0
while true; do
  ROUND=$((ROUND + 1))

  aws lambda invoke --region "${REGION}" \
    --function-name data-streams-runner-shopify-orders-prod \
    --cli-binary-format raw-in-base64-out \
    --cli-read-timeout 900 \
    --payload "{\"source\":\"shopify\",\"stream\":\"orders\",\"store_id\":\"${STORE_ID}\",\"mode\":\"gap_repair\"}" \
    /tmp/repair-result.json --no-cli-pager > /dev/null 2>&1

  RESULT=$(cat /tmp/repair-result.json)
  MONTH=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('month','?'))" 2>/dev/null || echo "?")
  STATUS=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "?")
  NEW=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('records_new',0))" 2>/dev/null || echo "?")
  SKIPPED=$(echo "${RESULT}" | python3 -c "import sys,json; r=json.load(sys.stdin); print('skip' if r.get('skipped_month') else r.get('records_skipped',0))" 2>/dev/null || echo "?")
  DURATION=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('duration_seconds',0))" 2>/dev/null || echo "?")
  PG_MONTH=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pg_month_count','?'))" 2>/dev/null || echo "?")
  API_MONTH=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('api_month_count','?'))" 2>/dev/null || echo "?")

  # Get updated Postgres count
  PG_NOW=$(bash scripts/psql-prod.sh -t -c "SELECT COUNT(*) FROM shopify.orders;" | tr -d ' ')
  GAP=$((SHOPIFY_TOTAL - PG_NOW))

  echo "Round ${ROUND}: month=${MONTH} new=${NEW} ${DURATION}s month=${PG_MONTH}/${API_MONTH} | total=${PG_NOW}/${SHOPIFY_TOTAL} gap=${GAP}"

  if [ "${STATUS}" = "complete" ]; then
    echo ""
    echo "=== Gap repair complete after ${ROUND} rounds ==="
    echo "  Final: Postgres=${PG_NOW} Shopify=${SHOPIFY_TOTAL} Gap=${GAP}"
    break
  fi

  if [ "${STATUS}" = "error" ]; then
    echo ""
    echo "=== Error on round ${ROUND} — check logs ==="
    cat /tmp/repair-result.json
    break
  fi

  sleep 3
done
