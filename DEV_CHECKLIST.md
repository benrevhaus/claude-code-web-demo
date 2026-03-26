# Validation Checklist — Prod MVP

Quick verification after deploying or updating the platform. See LAUNCH.md for the full step-by-step deployment guide.

**Environment:** prod only (ADR-023). All commands target `prod-mvp/`.

---

## Prerequisites

- [ ] AWS CLI authenticated (`aws sts get-caller-identity`)
- [ ] Terraform >= 1.5
- [ ] Docker running
- [ ] psql available

---

## Build + deploy

- [ ] Lambda package built and contains both handlers:
  ```bash
  unzip -l dist/lambda/data-streams.zip | grep -E "stream_runner|webhook_consumer"
  ```
- [ ] `terraform plan` is clean:
  ```bash
  terraform -chdir=infra/environments/prod-mvp plan
  ```
- [ ] `terraform apply` succeeds

---

## SSM secrets (set once, verify exist)

```bash
ENV=prod
for param in \
  /data-streams/$ENV/shopify/access_token \
  /data-streams/$ENV/shopify/webhook_secret \
  /data-streams/$ENV/gorgias/email \
  /data-streams/$ENV/gorgias/api_key \
  /data-streams/$ENV/postgres/connection_string; do
  echo -n "$param: "
  aws ssm get-parameter --name "$param" --query "Parameter.Version" --output text 2>/dev/null || echo "MISSING"
done
```

- [ ] All 5 parameters exist and are not `PLACEHOLDER`
- [ ] Optional: `/data-streams/prod/brandhaus/connection_string` set if dual-write enabled

---

## Database migrations

- [ ] All 8 migrations applied:
  ```bash
  psql "$CONN" -c "\dt shopify.*" -c "\dt gorgias.*" -c "\dt control.*"
  ```
  Expected: `shopify.orders`, `shopify.orders_history`, `shopify.customers`, `shopify.customers_history`, `shopify.products`, `shopify.products_history`, `shopify.inventory_levels`, `shopify.inventory_levels_history`, `shopify.refunds`, `shopify.refunds_history`, `shopify.transactions`, `shopify.transactions_history`, `gorgias.tickets`, `gorgias.tickets_history`, `control.stream_cursors`

---

## Shopify polling streams

Invoke each manually and verify success:

```bash
STORE=YOUR_STORE

for stream in orders customers products inventory; do
  echo "=== shopify/$stream ==="
  aws lambda invoke \
    --function-name data-streams-runner-shopify-${stream}-prod \
    --cli-binary-format raw-in-base64-out \
    --payload "{\"source\":\"shopify\",\"stream\":\"$stream\",\"store_id\":\"$STORE\"}" \
    /dev/stdout 2>/dev/null
  echo
done
```

- [ ] All return `"status": "success"`
- [ ] `records_processed > 0` for orders, customers, products
- [ ] S3 raw files exist:
  ```bash
  aws s3 ls s3://data-streams-raw-prod/shopify/ --recursive | head -5
  ```
- [ ] Postgres rows populated:
  ```bash
  psql "$CONN" -c "
    SELECT 'orders' as t, count(*) FROM shopify.orders UNION ALL
    SELECT 'customers', count(*) FROM shopify.customers UNION ALL
    SELECT 'products', count(*) FROM shopify.products UNION ALL
    SELECT 'inventory', count(*) FROM shopify.inventory_levels UNION ALL
    SELECT 'refunds', count(*) FROM shopify.refunds UNION ALL
    SELECT 'transactions', count(*) FROM shopify.transactions;
  "
  ```
- [ ] Cursors saved:
  ```bash
  psql "$CONN" -c "SELECT source, stream, last_status, cursor_value, last_run_at FROM control.stream_cursors WHERE source='shopify';"
  ```

---

## Gorgias polling stream

```bash
aws lambda invoke \
  --function-name data-streams-runner-gorgias-tickets-prod \
  --cli-binary-format raw-in-base64-out \
  --payload '{"source":"gorgias","stream":"tickets","store_id":"YOUR_STORE"}' \
  /dev/stdout
```

- [ ] Returns `"status": "success"`
- [ ] Postgres: `psql "$CONN" -c "SELECT count(*) FROM gorgias.tickets;"`
- [ ] Cursor: `psql "$CONN" -c "SELECT * FROM control.stream_cursors WHERE source='gorgias';"`

---

## Webhooks

- [ ] Webhooks registered:
  ```bash
  python scripts/register_shopify_webhooks.py \
    --store-id YOUR_STORE \
    --api-url "$(terraform -chdir=infra/environments/prod-mvp output -raw webhook_api_url)" \
    --access-token "shpat_..." \
    --dry-run
  ```
  Should show 5 topics as already registered.
- [ ] Test webhook: update a customer in Shopify admin, then:
  ```bash
  aws logs tail /aws/lambda/data-streams-webhook-consumer-prod --since 5m --format short
  ```
  Should show "Webhook processed" log entry.
- [ ] SQS DLQ is empty:
  ```bash
  aws sqs get-queue-attributes \
    --queue-url "$(aws sqs get-queue-url --queue-name data-streams-webhooks-dlq-prod --query QueueUrl --output text)" \
    --attribute-names ApproximateNumberOfMessagesVisible \
    --query "Attributes.ApproximateNumberOfMessagesVisible" --output text
  ```
  Expected: `0`

---

## Schedules running

After 30 minutes:

- [ ] Cursors are advancing:
  ```bash
  psql "$CONN" -c "SELECT source, stream, last_status, last_run_at, records_total FROM control.stream_cursors ORDER BY source, stream;"
  ```
- [ ] No Lambda errors:
  ```bash
  for fn in shopify-orders shopify-customers shopify-products shopify-inventory gorgias-tickets; do
    echo "--- $fn ---"
    aws logs tail /aws/lambda/data-streams-runner-${fn}-prod --since 30m --format short | grep -i error | head -3
  done
  ```

---

## Alarms

- [ ] SNS subscription confirmed (check email inbox for AWS confirmation)
- [ ] 9 CloudWatch alarms exist:
  ```bash
  aws cloudwatch describe-alarms --alarm-name-prefix data-streams --query "MetricAlarms[].AlarmName" --output table
  ```

---

## CloudWatch metrics

After at least one successful run per stream:

- [ ] `DataStreams/records_processed` has data points
- [ ] `DataStreams/freshness_lag_minutes` has data points
- [ ] `DataStreams/run_duration_seconds` has data points

```bash
aws cloudwatch get-metric-statistics \
  --namespace DataStreams \
  --metric-name records_processed \
  --start-time "$(date -u -v-1H +%Y-%m-%dT%H:%M:%S)" \
  --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
  --period 300 \
  --statistics Sum \
  --dimensions Name=source,Value=shopify Name=stream,Value=orders
```

---

## Dual-write (if enabled)

- [ ] `DUAL_WRITE_ENABLED=true` in Lambda env vars
- [ ] Brandhaus SSM param set: `/data-streams/prod/brandhaus/connection_string`
- [ ] Verify brandhaus tables updating:
  ```sql
  -- Run against brandhaus Postgres
  SELECT order_id, cache_updated_at FROM orders ORDER BY cache_updated_at DESC LIMIT 5;
  ```

---

## Record what you observe

After validation, note:
- Aurora endpoint
- Webhook API Gateway URL
- Any stream that returned 0 records (may need cursor reset)
- Any CloudWatch anomalies
