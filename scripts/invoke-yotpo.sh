#!/usr/bin/env bash
# Manually invoke Yotpo reviews Lambda and show result.
# Usage: bash scripts/invoke-yotpo.sh [reviews|review-metadata]
set -euo pipefail

REGION="us-east-1"
STREAM="${1:-reviews}"
FN="data-streams-runner-yotpo-${STREAM}-prod"

APP_KEY=$(aws ssm get-parameter \
  --region "${REGION}" \
  --name /data-streams/prod/yotpo/app_key \
  --with-decryption \
  --query Parameter.Value \
  --output text)

PAYLOAD="{\"source\":\"yotpo\",\"stream\":\"${STREAM}\",\"store_id\":\"${APP_KEY}\"}"
echo "${PAYLOAD}" > /tmp/yotpo-payload.json

echo "=== Invoking ${FN} ==="
aws lambda invoke \
  --region "${REGION}" \
  --function-name "${FN}" \
  --cli-binary-format raw-in-base64-out \
  --cli-read-timeout 900 \
  --payload file:///tmp/yotpo-payload.json \
  /tmp/yotpo-result.json

echo ""
echo "=== Result ==="
cat /tmp/yotpo-result.json
echo ""
