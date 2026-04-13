#!/usr/bin/env bash
# One-time historical gap repair for Shopify customers.
# Invokes gap_repair mode repeatedly until all months are processed.
# Shows running totals: Postgres vs Shopify API (business count).
# Usage: bash scripts/run-customer-repair.sh
set -euo pipefail

REGION="us-east-1"

STORE_ID=$(aws events list-targets-by-rule --region "${REGION}" \
  --rule data-streams-shopify-customers-prod \
  --query "Targets[0].Input" --output text --no-cli-pager | python3 -c "import sys,json; print(json.load(sys.stdin)['store_id'])")

echo "=== Shopify Customers Gap Repair ==="
echo "Store: ${STORE_ID}"
echo ""

# Get total Shopify count (business count using <=last_day)
SHOPIFY_TOTAL=$(AWS_REGION=${REGION} AWS_DEFAULT_REGION=${REGION} .venv/bin/python -c "
import json, os, sys, calendar
from urllib.request import Request, urlopen
from datetime import datetime
sys.path.insert(0, '.')
os.environ['ENV'] = 'prod'
from src.shared.shopify_client import ShopifyGraphQLClient
client = ShopifyGraphQLClient(stream='customers')
domain = 'vitality-extracts.myshopify.com'
token = client._get_access_token(domain)
now = datetime.utcnow()
last_day = calendar.monthrange(now.year, now.month)[1]
q = f'query {{ customersCount(limit: null, query: \"created_at:<={now.year}-{now.month:02d}-{last_day:02d}\") {{ count }} }}'
req = Request(f'https://{domain}/admin/api/2026-04/graphql.json', data=json.dumps({'query': q}).encode(), headers={'Content-Type': 'application/json', 'X-Shopify-Access-Token': token, 'User-Agent': 'data-streams/1.0'}, method='POST')
with urlopen(req, timeout=30) as resp:
    print(json.loads(resp.read()).get('data', {}).get('customersCount', {}).get('count', '?'))
")

PG_TOTAL=$(bash scripts/psql-prod.sh -t -c "SELECT COUNT(*) FROM shopify.customers;" | tr -d ' ')

echo "  Shopify total (business): ${SHOPIFY_TOTAL}"
echo "  Postgres total:           ${PG_TOTAL}"
echo "  Gap:                      $((SHOPIFY_TOTAL - PG_TOTAL))"
echo ""

ROUND=0
while true; do
  ROUND=$((ROUND + 1))

  aws lambda invoke --region "${REGION}" \
    --function-name data-streams-runner-shopify-customers-prod \
    --cli-binary-format raw-in-base64-out \
    --cli-read-timeout 900 \
    --payload "{\"source\":\"shopify\",\"stream\":\"customers\",\"store_id\":\"${STORE_ID}\",\"mode\":\"gap_repair\"}" \
    /tmp/customer-repair-result.json --no-cli-pager > /dev/null 2>&1

  RESULT=$(cat /tmp/customer-repair-result.json)
  MONTH=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('month','?'))" 2>/dev/null || echo "?")
  STATUS=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "?")
  NEW=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('records_new',0))" 2>/dev/null || echo "?")
  SKIPPED=$(echo "${RESULT}" | python3 -c "import sys,json; r=json.load(sys.stdin); print('skip' if r.get('skipped_month') else r.get('records_skipped',0))" 2>/dev/null || echo "?")
  DURATION=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('duration_seconds',0))" 2>/dev/null || echo "?")

  # Get updated Postgres count
  PG_NOW=$(bash scripts/psql-prod.sh -t -c "SELECT COUNT(*) FROM shopify.customers;" | tr -d ' ')
  GAP=$((SHOPIFY_TOTAL - PG_NOW))

  echo "Round ${ROUND}: month=${MONTH} new=${NEW} skipped=${SKIPPED} duration=${DURATION}s | Postgres=${PG_NOW}/${SHOPIFY_TOTAL} gap=${GAP}"

  if [ "${STATUS}" = "complete" ]; then
    echo ""
    echo "=== Customer gap repair complete after ${ROUND} rounds ==="
    echo "  Final: Postgres=${PG_NOW} Shopify=${SHOPIFY_TOTAL} Gap=${GAP}"
    break
  fi

  if [ "${STATUS}" = "error" ]; then
    echo ""
    echo "=== Error on round ${ROUND} — check logs ==="
    cat /tmp/customer-repair-result.json
    break
  fi

  sleep 3
done
