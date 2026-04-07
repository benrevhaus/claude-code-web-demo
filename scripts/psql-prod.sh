#!/usr/bin/env bash
# Connect to prod Aurora using connection string from SSM.
# Usage: bash scripts/psql-prod.sh [-c "SELECT ..."]
# Without args, opens an interactive psql session.
set -euo pipefail

REGION="us-east-1"

CONN=$(aws ssm get-parameter \
  --region "${REGION}" \
  --name /data-streams/prod/postgres/connection_string \
  --with-decryption \
  --query Parameter.Value \
  --output text)

psql "${CONN}" "$@"
