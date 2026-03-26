# Launch Guide — Prod MVP

**Architecture:** ADR-021 / ADR-022 / ADR-023
**Environment:** Single prod only (no dev — see ADR-023)
**Streams:** Shopify (orders, customers, products, inventory, refunds, transactions) + Gorgias tickets

---

## What gets deployed

| Resource | Count | Notes |
|----------|-------|-------|
| S3 bucket | 1 | `data-streams-raw-prod`, versioned, Glacier at 90d |
| Aurora Serverless v2 | 1 cluster + 1 instance | 0.5–8 ACU, public endpoint, SSL |
| Lambda (polling) | 5 | orders (5m), customers (15m), products (30m), inventory (15m), gorgias-tickets (15m) |
| Lambda (webhooks) | 1 | webhook-consumer, SQS-triggered, concurrency=5 |
| EventBridge rules | 5 | One per polling Lambda |
| SQS queues | 2 | Webhook queue + DLQ |
| API Gateway | 1 | HTTP API for webhook ingestion |
| SSM parameters | 7 | Secrets (placeholders, set manually) |
| CloudWatch alarms | 9 | Error alarms per Lambda + DLQ depth |
| IAM roles | 6 | 5 polling + 1 webhook consumer |
| SNS topic | 1 | Alert notifications |
| **Total** | **~65** | |

---

## Prerequisites

- AWS CLI authenticated (`aws sts get-caller-identity`)
- Terraform >= 1.5
- Docker running (Lambda package build)
- psql (database migrations)
- Shopify GraphQL Admin API access token (`shpat_...`)
- Shopify webhook secret (from app settings)
- Gorgias API credentials (email + API key)
- Brandhaus Postgres connection string (for dual-write, optional)

---

## Step 1: Build the Lambda package

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

Verify both handlers are in the zip:

```bash
unzip -l dist/lambda/data-streams.zip | grep -E "stream_runner|webhook_consumer"
```

---

## Step 2: Set your variables

Create `infra/environments/prod-mvp/terraform.tfvars` (gitignored):

```hcl
shopify_store_id   = "your-store"
gorgias_store_id   = "your-store"
db_master_password = "YOUR_PASSWORD_16+_CHARS"
alert_email        = "ops@yourdomain.com"
```

The `store_id` values become API hostnames:
- Shopify: `{store_id}.myshopify.com`
- Gorgias: `{store_id}.gorgias.com`

---

## Step 3: Terraform init + apply

```bash
cd infra/environments/prod-mvp
terraform init
terraform apply
```

Save the outputs:

```bash
terraform output aurora_endpoint      # For connection string
terraform output webhook_api_url      # For webhook registration
```

---

## Step 4: Set SSM secrets

Terraform creates placeholders. Now set the real values.

```bash
ENV=prod

# Shopify access token (GraphQL Admin API)
aws ssm put-parameter \
  --name /data-streams/$ENV/shopify/access_token \
  --type SecureString \
  --value "shpat_YOUR_TOKEN" \
  --overwrite

# Shopify webhook secret (from Shopify app → Notifications → Webhooks)
aws ssm put-parameter \
  --name /data-streams/$ENV/shopify/webhook_secret \
  --type SecureString \
  --value "YOUR_WEBHOOK_SECRET" \
  --overwrite

# Gorgias credentials
aws ssm put-parameter \
  --name /data-streams/$ENV/gorgias/email \
  --type SecureString \
  --value "you@yourdomain.com" \
  --overwrite

aws ssm put-parameter \
  --name /data-streams/$ENV/gorgias/api_key \
  --type SecureString \
  --value "YOUR_GORGIAS_API_KEY" \
  --overwrite

# Postgres connection string (from Aurora endpoint + your password)
aws ssm put-parameter \
  --name /data-streams/$ENV/postgres/connection_string \
  --type SecureString \
  --value "postgresql://datastreams:YOUR_PASSWORD@YOUR_AURORA_ENDPOINT:5432/datastreams?sslmode=require" \
  --overwrite

# Brandhaus connection (optional — only if enabling dual-write)
aws ssm put-parameter \
  --name /data-streams/$ENV/brandhaus/connection_string \
  --type SecureString \
  --value "postgresql://USER:PASS@HOST:5432/brandhaus?sslmode=require" \
  --overwrite
```

---

## Step 5: Run database migrations

```bash
CONN="postgresql://datastreams:YOUR_PASSWORD@YOUR_AURORA_ENDPOINT:5432/datastreams?sslmode=require"

psql "$CONN" \
  -f migrations/001_shopify_orders.sql \
  -f migrations/002_gorgias_tickets.sql \
  -f migrations/003_stream_cursors.sql \
  -f migrations/004_shopify_customers.sql \
  -f migrations/005_shopify_products.sql \
  -f migrations/006_shopify_inventory.sql \
  -f migrations/007_shopify_refunds.sql \
  -f migrations/008_shopify_transactions.sql
```

This creates 10 tables under `shopify.*`, 2 under `gorgias.*`, and 1 under `control.*`.

---

## Step 6: Seed from brandhaus (optional — historical backfill)

If you have existing data in the brandhaus Postgres, seed data-streams from it (zero Shopify API calls):

```bash
export BRANDHAUS_CONNECTION_STRING="postgresql://USER:PASS@HOST:5432/brandhaus?sslmode=require"
export POSTGRES_CONNECTION_STRING="$CONN"
export RAW_BUCKET="data-streams-raw-prod"

# Dry run first
python scripts/seed_from_brandhaus.py --resource all --store-id YOUR_STORE --dry-run

# Then seed for real
python scripts/seed_from_brandhaus.py --resource all --store-id YOUR_STORE
```

Verify counts:

```bash
psql "$CONN" -c "
  SELECT 'orders' as t, count(*) FROM shopify.orders UNION ALL
  SELECT 'customers', count(*) FROM shopify.customers UNION ALL
  SELECT 'products', count(*) FROM shopify.products UNION ALL
  SELECT 'refunds', count(*) FROM shopify.refunds UNION ALL
  SELECT 'transactions', count(*) FROM shopify.transactions;
"
```

---

## Step 7: Smoke test — Shopify streams

Test each Shopify stream manually:

```bash
STORE=YOUR_STORE

# Orders (also extracts refunds + transactions)
aws lambda invoke \
  --function-name data-streams-runner-shopify-orders-prod \
  --cli-binary-format raw-in-base64-out \
  --payload "{\"source\":\"shopify\",\"stream\":\"orders\",\"store_id\":\"$STORE\"}" \
  /dev/stdout

# Customers
aws lambda invoke \
  --function-name data-streams-runner-shopify-customers-prod \
  --cli-binary-format raw-in-base64-out \
  --payload "{\"source\":\"shopify\",\"stream\":\"customers\",\"store_id\":\"$STORE\"}" \
  /dev/stdout

# Products
aws lambda invoke \
  --function-name data-streams-runner-shopify-products-prod \
  --cli-binary-format raw-in-base64-out \
  --payload "{\"source\":\"shopify\",\"stream\":\"products\",\"store_id\":\"$STORE\"}" \
  /dev/stdout

# Inventory
aws lambda invoke \
  --function-name data-streams-runner-shopify-inventory-prod \
  --cli-binary-format raw-in-base64-out \
  --payload "{\"source\":\"shopify\",\"stream\":\"inventory\",\"store_id\":\"$STORE\"}" \
  /dev/stdout
```

Each should return `"status": "success"` with `records_processed > 0`.

**Verify data landed:**

```bash
# S3 raw files
aws s3 ls s3://data-streams-raw-prod/shopify/ --recursive | head -10

# Postgres
psql "$CONN" -c "SELECT * FROM control.stream_cursors;"
```

If a stream fails, check logs:

```bash
aws logs tail /aws/lambda/data-streams-runner-shopify-orders-prod --since 5m --format short
```

---

## Step 8: Smoke test — Gorgias

```bash
aws lambda invoke \
  --function-name data-streams-runner-gorgias-tickets-prod \
  --cli-binary-format raw-in-base64-out \
  --payload '{"source":"gorgias","stream":"tickets","store_id":"YOUR_STORE"}' \
  /dev/stdout
```

Verify:

```bash
aws s3 ls s3://data-streams-raw-prod/gorgias/tickets/ --recursive | head -5
psql "$CONN" -c "SELECT count(*) FROM gorgias.tickets;"
```

---

## Step 9: Register Shopify webhooks

```bash
WEBHOOK_URL=$(cd infra/environments/prod-mvp && terraform output -raw webhook_api_url)

# Dry run
python scripts/register_shopify_webhooks.py \
  --store-id YOUR_STORE \
  --api-url "$WEBHOOK_URL" \
  --access-token "shpat_YOUR_TOKEN" \
  --dry-run

# Register for real
python scripts/register_shopify_webhooks.py \
  --store-id YOUR_STORE \
  --api-url "$WEBHOOK_URL" \
  --access-token "shpat_YOUR_TOKEN"
```

This registers 5 webhook topics: `orders/create`, `orders/updated`, `customers/create`, `customers/update`, `customers/delete`.

Test by updating a customer in Shopify admin, then check:

```bash
aws logs tail /aws/lambda/data-streams-webhook-consumer-prod --since 5m --format short
```

---

## Step 10: Confirm schedules + alarms

EventBridge rules are created as `ENABLED`. All streams are now polling automatically.

After 30 minutes, verify cursors are advancing:

```bash
psql "$CONN" -c "
  SELECT source, stream, store_id, cursor_value, last_status, last_run_at, records_total
  FROM control.stream_cursors
  ORDER BY source, stream;
"
```

Check for errors:

```bash
for stream in shopify-orders shopify-customers shopify-products shopify-inventory gorgias-tickets; do
  echo "--- $stream ---"
  aws logs tail /aws/lambda/data-streams-runner-${stream}-prod --since 30m --format short | grep -i error
done
```

Confirm SNS: check your inbox for the subscription confirmation email. Click the link or alarms won't reach you.

---

## Step 11: Enable dual-write (optional — transition from brandhaus_cron)

Once polling + webhooks are flowing correctly, enable dual-write so data-streams also feeds the existing brandhaus tables:

```bash
for fn in data-streams-runner-shopify-orders-prod \
          data-streams-runner-shopify-customers-prod \
          data-streams-runner-shopify-products-prod \
          data-streams-runner-shopify-inventory-prod \
          data-streams-webhook-consumer-prod; do
  aws lambda update-function-configuration \
    --function-name "$fn" \
    --environment "Variables={RAW_BUCKET=data-streams-raw-prod,ENV=prod,DUAL_WRITE_ENABLED=true,SHOPIFY_STORE_ID=YOUR_STORE,BRANDHAUS_ACCOUNT_ID=1,BRANDHAUS_STORE_ID=2}"
done
```

Run both systems in parallel for a week. When satisfied, stop brandhaus_cron and set `DUAL_WRITE_ENABLED=false`.

---

## You're live

| Stream | Method | Schedule | Latency |
|--------|--------|----------|---------|
| Shopify Orders | Webhook + poll | 5 min | ~5s / 5 min |
| Shopify Customers | Webhook + poll | 15 min | ~5s / 15 min |
| Shopify Products | Poll only | 30 min | 30 min |
| Shopify Inventory | Poll only | 15 min | 15 min |
| Shopify Refunds | Extracted from orders | — | Same as orders |
| Shopify Transactions | Extracted from orders | — | Same as orders |
| Gorgias Tickets | Poll only | 15 min | 15 min |

Data lands in:
- **S3:** `s3://data-streams-raw-prod/{source}/{stream}/...` (immutable raw, gzipped)
- **Postgres:** `shopify.*` and `gorgias.*` schemas (canonical + history tables)
- **Cursors:** `control.stream_cursors`

---

## Troubleshooting

### Lambda times out (15 min)

The stream has more pages than Lambda can process in 15 minutes. Reduce `max_pages_per_run` in the stream YAML temporarily, or adopt the Step Function pagination loop (see ADR-022, Tier 2).

### "No stream config found"

The `source` and `stream` in the EventBridge payload don't match any YAML in `streams/`. Check spelling and that the Lambda zip includes `streams/`.

### Connection refused to Aurora

Aurora is publicly accessible but SSL is required. Ensure the connection string includes `?sslmode=require`. Confirm the security group allows inbound 5432.

### Rate limited (429)

The handler sleeps and retries automatically. If you see repeated 429s, increase the EventBridge schedule interval in the stream YAML.

### Webhook HMAC failures

Check that the webhook secret in SSM matches the one in your Shopify app settings. Webhooks with missing or invalid HMAC are rejected (logged as errors).

### SQS dead-letter queue has messages

Failed webhook processing. Check the webhook consumer logs. The DLQ alarm fires when any messages land there. Investigate, fix, then replay from the DLQ.

### Duplicate records

Not possible — Postgres UNIQUE constraint on `(id, store_id)` prevents duplicates. The upsert-on-newer pattern prevents overwriting newer data with older data.

---

## Next steps

See [ADR-022](docs/adr/022-mvp-implementation-and-scale-up-path.md) for the scale-up path. Adopt components when operational triggers are hit.

### Switch to S3 backend for Terraform state

```hcl
backend "s3" {
  bucket  = "data-streams-terraform-state"
  key     = "prod-mvp/terraform.tfstate"
  region  = "us-east-1"
  encrypt = true
}
```

Then `terraform init -migrate-state`.
