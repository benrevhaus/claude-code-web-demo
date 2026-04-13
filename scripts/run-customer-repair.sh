#!/usr/bin/env bash
# One-time historical gap repair for Shopify customers.
# Invokes gap_repair mode repeatedly until all months are processed.
# Usage: bash scripts/run-customer-repair.sh
set -euo pipefail

REGION="us-east-1"

STORE_ID=$(aws events list-targets-by-rule --region "${REGION}" \
  --rule data-streams-shopify-customers-prod \
  --query "Targets[0].Input" --output text --no-cli-pager | python3 -c "import sys,json; print(json.load(sys.stdin)['store_id'])")

echo "=== Shopify Customers Gap Repair ==="
echo "Store: ${STORE_ID}"
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
  DURATION=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('duration_seconds',0))" 2>/dev/null || echo "?")

  echo "Round ${ROUND}: month=${MONTH} new=${NEW} status=${STATUS} duration=${DURATION}s"

  if [ "${STATUS}" = "complete" ]; then
    echo ""
    echo "=== Customer gap repair complete after ${ROUND} rounds ==="
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
