# Launch Guide — MVP (Single-Lambda Architecture)

**Date:** 2026-03-24
**Architecture:** ADR-021 / ADR-022
**Target:** Shopify Orders + Gorgias Tickets flowing into Postgres

---

## Prerequisites

- AWS CLI authenticated (`aws sts get-caller-identity` works)
- Terraform >= 1.5 installed
- Docker running (for Lambda package build)
- psql available (for running migrations)
- Shopify GraphQL Admin API access token
- Gorgias API credentials (email + API key)

---

## Step 1: Build the Lambda package

```bash
./scripts/build_lambda_package.sh
```

This uses Docker to install Python dependencies for the Lambda runtime (linux/amd64), then copies `src/`, `schemas/`, and `streams/` into the zip. Output: `dist/lambda/data-streams.zip` (~25 MB).

If the build script fails because of the Docker entrypoint, run:

```bash
ROOT_DIR="$(pwd)"
BUILD_DIR="${ROOT_DIR}/dist/lambda"
PACKAGE_DIR="${BUILD_DIR}/package"
ZIP_PATH="${BUILD_DIR}/data-streams.zip"

rm -rf "${PACKAGE_DIR}" "${ZIP_PATH}" && mkdir -p "${PACKAGE_DIR}"

docker run --rm --platform linux/amd64 --entrypoint bash \
  -v "${ROOT_DIR}:/workspace" \
  public.ecr.aws/lambda/python:3.12 \
  -lc "pip install --upgrade pip && pip install /workspace -t /workspace/dist/lambda/package"

cp -R src schemas streams "${PACKAGE_DIR}/"
(cd "${PACKAGE_DIR}" && zip -qr "${ZIP_PATH}" .)
```

Verify the stream runner handler is in the zip:

```bash
unzip -l dist/lambda/data-streams.zip | grep stream_runner
```

You should see `src/lambdas/stream_runner/handler.py`.

---

## Step 2: Choose your variable values

You need four values before running Terraform. Decide them now.

| Variable | Description | Example |
|----------|-------------|---------|
| `shopify_store_id` | Your Shopify store slug (or full domain) | `vitalityextracts` |
| `gorgias_store_id` | Your Gorgias subdomain | `vitalityextracts` |
| `db_master_password` | Aurora master password (you choose, 16+ chars, no `/`, `@`, or `"`) | `Kj8m$pLq2nRtYx4w` |
| `alert_email` | Email address for alarm notifications | `ops@yourdomain.com` |

The `store_id` values become API hostnames:
- Shopify: `{store_id}.myshopify.com` (or pass the full domain)
- Gorgias: `{store_id}.gorgias.com`

---

## Step 3: Terraform init + apply

```bash
cd infra/environments/dev-mvp
terraform init
```

Then apply:

```bash
terraform apply \
  -var="shopify_store_id=YOUR_STORE" \
  -var="gorgias_store_id=YOUR_STORE" \
  -var="db_master_password=YOUR_PASSWORD" \
  -var="alert_email=you@yourdomain.com"
```

Or create `infra/environments/dev-mvp/terraform.tfvars` (gitignored) to avoid typing them each time:

```hcl
shopify_store_id   = "vitalityextracts"
gorgias_store_id   = "vitalityextracts"
db_master_password = "YOUR_PASSWORD_HERE"
alert_email        = "ops@yourdomain.com"
```

Then just `terraform apply`.

**This creates 31 AWS resources:**
- S3 bucket (raw data, versioned, lifecycle to Glacier at 90d)
- Aurora Serverless v2 cluster + instance (public endpoint, SSL, 0.5–2 ACU)
- 2 Lambda functions (shopify-orders, gorgias-tickets)
- 2 EventBridge rules (5 min, 15 min)
- 2 IAM roles + policies
- 5 SSM parameter placeholders
- 2 CloudWatch log groups
- 2 Lambda error alarms
- SNS alert topic

**Save the outputs.** You need `aurora_endpoint` for the next steps:

```bash
terraform output aurora_endpoint
```

---

## Step 4: Set SSM secrets

The Terraform creates SSM parameters with `PLACEHOLDER` values. Now set the real ones.

### 4a. Shopify access token

Your Shopify GraphQL Admin API bearer token. Get this from your Shopify Partner Dashboard or custom app.

```bash
aws ssm put-parameter \
  --name /data-streams/dev/shopify/access_token \
  --type SecureString \
  --value "shpat_YOUR_TOKEN_HERE" \
  --overwrite
```

### 4b. Shopify webhook secret

For future webhook use. Set it now so it exists; you can update it later.

```bash
aws ssm put-parameter \
  --name /data-streams/dev/shopify/webhook_secret \
  --type SecureString \
  --value "YOUR_WEBHOOK_SECRET_HERE" \
  --overwrite
```

### 4c. Gorgias credentials

Your Gorgias account email and REST API key. Find the API key in Gorgias → Settings → REST API.

```bash
aws ssm put-parameter \
  --name /data-streams/dev/gorgias/email \
  --type SecureString \
  --value "you@yourdomain.com" \
  --overwrite

aws ssm put-parameter \
  --name /data-streams/dev/gorgias/api_key \
  --type SecureString \
  --value "YOUR_GORGIAS_API_KEY_HERE" \
  --overwrite
```

### 4d. Postgres connection string

Build this from the Aurora endpoint output and the master password you chose in Step 2:

```bash
aws ssm put-parameter \
  --name /data-streams/dev/postgres/connection_string \
  --type SecureString \
  --value "postgresql://datastreams:YOUR_PASSWORD@YOUR_AURORA_ENDPOINT:5432/datastreams?sslmode=require" \
  --overwrite
```

Replace `YOUR_PASSWORD` with the `db_master_password` from Step 2. Replace `YOUR_AURORA_ENDPOINT` with the `aurora_endpoint` from Step 3 output.

---

## Step 5: Run database migrations

Connect to Aurora and run all three migrations in order:

```bash
psql "postgresql://datastreams:YOUR_PASSWORD@YOUR_AURORA_ENDPOINT:5432/datastreams?sslmode=require" \
  -f migrations/001_shopify_orders.sql

psql "postgresql://datastreams:YOUR_PASSWORD@YOUR_AURORA_ENDPOINT:5432/datastreams?sslmode=require" \
  -f migrations/002_gorgias_tickets.sql

psql "postgresql://datastreams:YOUR_PASSWORD@YOUR_AURORA_ENDPOINT:5432/datastreams?sslmode=require" \
  -f migrations/003_stream_cursors.sql
```

Or as a single command:

```bash
CONN="postgresql://datastreams:YOUR_PASSWORD@YOUR_AURORA_ENDPOINT:5432/datastreams?sslmode=require"
psql "$CONN" -f migrations/001_shopify_orders.sql \
             -f migrations/002_gorgias_tickets.sql \
             -f migrations/003_stream_cursors.sql
```

This creates:
- `shopify.orders` + `shopify.orders_history` (current-state table + append-only changelog)
- `gorgias.tickets` + `gorgias.tickets_history` (same pattern)
- `control.stream_cursors` (cursor storage for the MVP, replaces DynamoDB)

---

## Step 6: Smoke test — Shopify

Invoke the Lambda manually to confirm everything is wired:

```bash
aws lambda invoke \
  --function-name data-streams-runner-shopify-orders-dev \
  --cli-binary-format raw-in-base64-out \
  --payload '{"source":"shopify","stream":"orders","store_id":"YOUR_STORE"}' \
  /dev/stdout
```

Replace `YOUR_STORE` with the same `shopify_store_id` from Step 2.

**Expected output** (JSON printed to stdout):

```json
{
  "run_id": "...",
  "source": "shopify",
  "stream": "orders",
  "status": "success",
  "pages": 1,
  "records_processed": 50,
  "records_failed": 0,
  "duration_seconds": 3.14,
  "cursor": "2026-03-24T..."
}
```

If it fails, check CloudWatch Logs:

```bash
aws logs tail /aws/lambda/data-streams-runner-shopify-orders-dev --since 5m --format short
```

### Verify data landed

**S3 raw files:**

```bash
aws s3 ls s3://data-streams-raw-dev/shopify/orders/ --recursive | head -5
```

**Postgres:**

```bash
psql "$CONN" -c "SELECT count(*) FROM shopify.orders;"
psql "$CONN" -c "SELECT count(*) FROM shopify.orders_history;"
psql "$CONN" -c "SELECT * FROM control.stream_cursors;"
```

---

## Step 7: Smoke test — Gorgias

```bash
aws lambda invoke \
  --function-name data-streams-runner-gorgias-tickets-dev \
  --cli-binary-format raw-in-base64-out \
  --payload '{"source":"gorgias","stream":"tickets","store_id":"YOUR_STORE"}' \
  /dev/stdout
```

**Verify:**

```bash
aws s3 ls s3://data-streams-raw-dev/gorgias/tickets/ --recursive | head -5
psql "$CONN" -c "SELECT count(*) FROM gorgias.tickets;"
psql "$CONN" -c "SELECT * FROM control.stream_cursors;"
```

---

## Step 8: Confirm schedules are running

EventBridge rules were created as `ENABLED`. Both streams are now polling automatically:
- Shopify Orders: every 5 minutes
- Gorgias Tickets: every 15 minutes

After 30 minutes, verify cursors are advancing:

```bash
psql "$CONN" -c "SELECT source, stream, store_id, cursor_value, last_status, last_run_at, records_total, pages_total FROM control.stream_cursors;"
```

Check for any Lambda errors:

```bash
aws logs tail /aws/lambda/data-streams-runner-shopify-orders-dev --since 30m --format short | grep -i error
aws logs tail /aws/lambda/data-streams-runner-gorgias-tickets-dev --since 30m --format short | grep -i error
```

---

## Step 9: Confirm alarm routing

Verify the SNS email subscription by checking your inbox for a confirmation email from AWS. You must click the confirmation link or alarms won't reach you.

---

## You're live

Data is flowing. What you have:
- Shopify orders upserted to `shopify.orders` every 5 minutes
- Gorgias tickets upserted to `gorgias.tickets` every 15 minutes
- Raw API responses archived in S3 (immutable, gzipped)
- Cursor tracking in `control.stream_cursors`
- History tables appending every change
- Structured JSON logs in CloudWatch
- Lambda error alarms → SNS → email

---

## Troubleshooting

### Lambda times out (15 min)

The stream has more pages than Lambda can process in 15 minutes. Reduce `max_pages_per_run` in the stream YAML temporarily, or adopt the Step Function pagination loop (see ADR-022, Tier 2).

### "No stream config found"

The `source` and `stream` fields in the EventBridge payload don't match any YAML in `streams/`. Check spelling and that the Lambda zip includes `streams/`.

### Connection refused to Aurora

Aurora is publicly accessible but SSL is required. Ensure the connection string includes `?sslmode=require`. Also confirm the security group allows inbound 5432.

### Rate limited (429)

The handler sleeps and retries automatically. If you see repeated 429s, the polling interval is too aggressive for your API quota. Increase the EventBridge schedule interval.

### Duplicate records

Not possible — the Postgres UNIQUE constraint on `(id, store_id)` prevents duplicates. The upsert-on-newer pattern also prevents overwriting newer data with older data. If you see unexpected duplicates, check that the `updated_at` / `updated_datetime` field is being parsed correctly.

---

## Next steps (when you're ready)

See [ADR-022](docs/adr/022-mvp-implementation-and-scale-up-path.md) for the full scale-up path. Adopt components when operational triggers are hit, not before.

### Switch to S3 backend for Terraform state

Once you create the S3 state bucket (`data-streams-terraform-state`), edit the backend block in `infra/environments/dev-mvp/main.tf`:

```hcl
backend "s3" {
  bucket  = "data-streams-terraform-state"
  key     = "dev-mvp/terraform.tfstate"
  region  = "us-east-1"
  encrypt = true
}
```

Then run `terraform init -migrate-state` to move local state to S3.

### Deploy to production

Same steps using `infra/environments/prod-mvp/`. Differences:
- Aurora scales to 8 ACU (vs 2 in dev)
- Log retention is 30 days (vs 7 in dev)
- `skip_final_snapshot = false` (Aurora takes a snapshot before destruction)
