# Dev Validation Checklist

## 1. Start prerequisites

- Docker daemon running
- Terraform can reach `registry.terraform.io`
- AWS credentials point to the dev account
- `python3.12` and `pip` available

## 2. Build the Lambda artifact

```bash
./scripts/build_lambda_package.sh
ls -lh dist/lambda/data-streams.zip
```

## 3. Initialize and validate Terraform

```bash
terraform -chdir=infra/environments/dev init
terraform -chdir=infra/environments/dev validate
terraform -chdir=infra/environments/dev plan
```

## 4. Apply dev infrastructure

```bash
terraform -chdir=infra/environments/dev apply
```

## 5. Set required SSM secrets in dev

Required paths:

- `/data-streams/dev/shopify/access_token`
- `/data-streams/dev/postgres/connection_string`
- `/data-streams/dev/shopify/webhook_secret` if you want webhook prep in place
- `/data-streams/dev/shopify/api_key` and `/data-streams/dev/shopify/api_secret` can remain if you still want the placeholder paths preserved, but the poller now uses `access_token`

Example:

```bash
aws ssm put-parameter \
  --name /data-streams/dev/shopify/access_token \
  --type SecureString \
  --value 'shpat_...' \
  --overwrite

aws ssm put-parameter \
  --name /data-streams/dev/postgres/connection_string \
  --type SecureString \
  --value 'postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require' \
  --overwrite
```

## 6. Run the database migration

```bash
psql "$POSTGRES_URL" -f migrations/001_shopify_orders.sql
```

Or use the same connection string value you stored in SSM.

## 7. Trigger one manual poll execution

Get the state machine ARN:

```bash
terraform -chdir=infra/environments/dev output step_function_arn
```

Start an execution:

```bash
aws stepfunctions start-execution \
  --state-machine-arn <STEP_FUNCTION_ARN> \
  --input '{"source":"shopify","stream":"orders","store_id":"your-store.myshopify.com","max_pages":2,"cursor_override":null,"max_pages_override":null}'
```

## 8. Verify the execution succeeded

Check:

- Step Functions execution status is `SUCCEEDED`
- Lambda logs exist for initializer, poller, processor, finalizer

## 9. Verify raw data in S3

Confirm at least one object exists under:

```text
shopify/orders/<store_id>/YYYY/MM/DD/<run_id>/page_001.json.gz
```

## 10. Verify DynamoDB control records

Check:

- `RUN#<run_id>` exists with terminal status
- `CURSOR#current` was updated
- `FRESHNESS#current` exists
- idempotency records were written under `IDEM#shopify#orders`

## 11. Verify Postgres writes

Check:

- rows inserted into `shopify.orders`
- rows inserted into `shopify.orders_history`
- `raw_s3_key`, `schema_version`, and `run_id` are populated

## 12. Verify metrics

Check CloudWatch custom metrics:

- `freshness_lag_minutes`
- `run_duration_seconds`
- `records_processed`
- `pages_fetched`
- `http_429_count`
- `http_5xx_count`

## 13. Run one idempotency replay check

Invoke the processor again for the same S3 key and confirm:

- `records_skipped > 0`
- no duplicate Postgres rows

## 14. If all of that passes, enable the EventBridge schedule and watch the next scheduled run

## What to record

- state machine ARN
- one successful execution ARN
- one S3 raw key
- one DynamoDB run key
- one sample `shopify.orders` row ID
- any CloudWatch alarm/metric anomalies
