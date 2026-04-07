#!/usr/bin/env bash
# Build, deploy, invoke Yotpo reviews, and check cursor state.
# Usage: bash scripts/deploy-yotpo.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Step 1: Build and deploy all Lambdas ==="
bash "${DIR}/deploy-lambda.sh"

echo ""
echo "=== Step 2: Invoke Yotpo reviews ==="
bash "${DIR}/invoke-yotpo.sh"

echo ""
echo "=== Step 3: Check cursor state ==="
bash "${DIR}/psql-prod.sh" -c "SELECT source, stream, cursor_value, last_status, records_total, last_run_at FROM control.stream_cursors WHERE source = 'yotpo';"
