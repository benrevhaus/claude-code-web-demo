#!/usr/bin/env bash
# One-time historical gap repair for Shopify orders.
# Invokes gap_repair mode repeatedly until all months are processed.
# Usage: bash scripts/run-gap-repair.sh
set -euo pipefail

REGION="us-east-1"

APP_KEY=$(aws ssm get-parameter --region "${REGION}" \
  --name /data-streams/prod/shopify/client_id \
  --with-decryption --query Parameter.Value --output text 2>/dev/null || echo "")

# Fall back to store_id from EventBridge if no client_id
if [ -z "${APP_KEY}" ]; then
  STORE_ID=$(aws events list-targets-by-rule --region "${REGION}" \
    --rule data-streams-shopify-orders-prod \
    --query "Targets[0].Input" --output text --no-cli-pager | python3 -c "import sys,json; print(json.load(sys.stdin)['store_id'])")
else
  STORE_ID=$(aws events list-targets-by-rule --region "${REGION}" \
    --rule data-streams-shopify-orders-prod \
    --query "Targets[0].Input" --output text --no-cli-pager | python3 -c "import sys,json; print(json.load(sys.stdin)['store_id'])")
fi

echo "=== Shopify Orders Gap Repair ==="
echo "Store: ${STORE_ID}"
echo "This will process all months from 2016 to present."
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
  DURATION=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('duration_seconds',0))" 2>/dev/null || echo "?")

  echo "Round ${ROUND}: month=${MONTH} new=${NEW} status=${STATUS} duration=${DURATION}s"

  if [ "${STATUS}" = "complete" ]; then
    echo ""
    echo "=== Gap repair complete after ${ROUND} rounds ==="
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
