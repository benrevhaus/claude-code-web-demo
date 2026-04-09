#!/usr/bin/env bash
# One-time seed: backfill reviews + metadata from legacy MySQL.
# Runs locally (your machine can reach MySQL; Lambda can't).
# Processes in batches, resumable — cursor saved in Postgres after each batch.
#
# Usage: bash scripts/seed-from-mysql.sh [batch_size]
#   Default batch_size: 5000
set -euo pipefail

REGION="us-east-1"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BATCH_SIZE="${1:-20000}"

# Get Yotpo store ID from SSM
APP_KEY=$(aws ssm get-parameter --region "${REGION}" \
  --name /data-streams/prod/yotpo/app_key \
  --with-decryption --query Parameter.Value --output text)

# Get MySQL connection string from SSM
MYSQL_DSN=$(aws ssm get-parameter --region "${REGION}" \
  --name /data-streams/prod/legacy/mysql_connection_string \
  --with-decryption --query Parameter.Value --output text)

echo "=== MySQL seed starting ==="
echo "Batch size: ${BATCH_SIZE}"
echo "Store ID: ${APP_KEY:0:8}..."

cd "${DIR}"

ROUND=0
while true; do
  ROUND=$((ROUND + 1))
  echo ""
  echo "=== Round ${ROUND} ==="

  RESULT=$(.venv/bin/python -c "
import os, json, sys
sys.path.insert(0, '.')
os.environ['ENV'] = 'prod'
os.environ['LEGACY_MYSQL_CONNECTION_STRING'] = '''${MYSQL_DSN}'''
from src.lambdas.stream_runner.handler import _handle_mysql_seed
result = _handle_mysql_seed({
    'source': 'yotpo',
    'stream': 'reviews',
    'store_id': '${APP_KEY}',
    'mode': 'mysql_seed',
    'batch_size': ${BATCH_SIZE},
})
print(json.dumps(result))
")

  echo "${RESULT}" | python3 -m json.tool 2>/dev/null || echo "${RESULT}"

  HAS_MORE=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('has_more', False))")
  STATUS=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status', 'unknown'))")

  if [ "${HAS_MORE}" != "True" ]; then
    echo ""
    echo "=== Seed complete after ${ROUND} rounds ==="
    break
  fi

  if [ "${STATUS}" = "error" ]; then
    echo ""
    echo "=== Seed stopped on error after ${ROUND} rounds ==="
    exit 1
  fi
done
