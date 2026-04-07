#!/usr/bin/env bash
# Rebuild and deploy Lambda code to all stream runners + webhook consumer.
# Usage: bash scripts/deploy-lambda.sh [function-name]
# If function-name is provided, only that function is updated.
set -euo pipefail

REGION="us-east-1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIP_PATH="${ROOT_DIR}/dist/lambda/data-streams.zip"

echo "=== Building Lambda package ==="
bash "${ROOT_DIR}/scripts/build_lambda_package.sh"

ALL_FUNCTIONS=(
  data-streams-runner-shopify-orders-prod
  data-streams-runner-shopify-customers-prod
  data-streams-runner-shopify-products-prod
  data-streams-runner-shopify-inventory-prod
  data-streams-runner-gorgias-tickets-prod
  data-streams-runner-yotpo-reviews-prod
  data-streams-runner-yotpo-review-metadata-prod
  data-streams-webhook-consumer-prod
)

if [ "${1:-}" != "" ]; then
  FUNCTIONS=("$1")
else
  FUNCTIONS=("${ALL_FUNCTIONS[@]}")
fi

for fn in "${FUNCTIONS[@]}"; do
  echo "=== Deploying ${fn} ==="
  aws lambda update-function-code \
    --region "${REGION}" \
    --function-name "${fn}" \
    --zip-file "fileb://${ZIP_PATH}" \
    --no-cli-pager \
    --query "CodeSha256" \
    --output text
done

echo "=== Done ==="
