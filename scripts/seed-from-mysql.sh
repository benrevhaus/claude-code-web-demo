#!/usr/bin/env bash
# One-time seed: backfill reviews + metadata from legacy MySQL.
# Runs locally (your machine can reach MySQL; Lambda can't).
# Processes in batches, resumable — cursor saved in Postgres after each batch.
#
# Usage: AWS_REGION=us-east-1 RAW_BUCKET=data-streams-raw-prod bash scripts/seed-from-mysql.sh [batch_size]
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BATCH_SIZE="${1:-20000}"

APP_KEY=$(aws ssm get-parameter --region "${REGION}" \
  --name /data-streams/prod/yotpo/app_key \
  --with-decryption --query Parameter.Value --output text)

MYSQL_DSN=$(aws ssm get-parameter --region "${REGION}" \
  --name /data-streams/prod/legacy/mysql_connection_string \
  --with-decryption --query Parameter.Value --output text)

echo "=== MySQL seed starting ==="
echo "Batch size: ${BATCH_SIZE}"
echo "Store ID: ${APP_KEY:0:8}..."

# Disable all EventBridge rules to prevent Lambda lock contention
echo "=== Disabling EventBridge rules ==="
RULES=$(aws events list-rules --region "${REGION}" --name-prefix "data-streams-" --query "Rules[].Name" --output text --no-cli-pager)
for rule in ${RULES}; do
  aws events disable-rule --region "${REGION}" --name "${rule}" --no-cli-pager 2>/dev/null
  echo "  Disabled: ${rule}"
done

# Re-enable rules on exit (success, error, or Ctrl+C)
cleanup() {
  echo ""
  echo "=== Re-enabling EventBridge rules ==="
  for rule in ${RULES}; do
    aws events enable-rule --region "${REGION}" --name "${rule}" --no-cli-pager 2>/dev/null
    echo "  Enabled: ${rule}"
  done
}
trap cleanup EXIT

cd "${DIR}"

.venv/bin/python -c "
import os, json, sys
sys.path.insert(0, '.')
os.environ['ENV'] = 'prod'
os.environ['LEGACY_MYSQL_CONNECTION_STRING'] = '''${MYSQL_DSN}'''

from src.lambdas.stream_runner.handler import _handle_mysql_seed

round_num = 0
while True:
    round_num += 1
    print(f'\n=== Round {round_num} ===', flush=True)
    result = _handle_mysql_seed({
        'source': 'yotpo',
        'stream': 'reviews',
        'store_id': '${APP_KEY}',
        'mode': 'mysql_seed',
        'batch_size': ${BATCH_SIZE},
    })
    print(f'  Result: {json.dumps(result)}', flush=True)

    if not result.get('has_more', False):
        print(f'\n=== Seed complete after {round_num} rounds ===', flush=True)
        break
    if result.get('status') == 'error':
        print(f'\n=== Seed stopped on error after {round_num} rounds ===', flush=True)
        sys.exit(1)
"
