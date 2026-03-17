# ADR-015: CloudWatch-Only Observability for V1

**Status:** Accepted
**Date:** 2026-03-17

---

## Context

What observability stack should we use?

## Decision

**CloudWatch is the only observability tool for V1.** No Datadog, Grafana, New Relic, or any third-party observability platform.

### Why CloudWatch only

1. **Zero additional infrastructure.** CloudWatch is built into AWS. Lambda, Step Functions, SQS, and DynamoDB all emit metrics natively.
2. **No additional vendor.** One less vendor to manage, one less bill, one less set of credentials.
3. **Sufficient for V1 scale.** We're running 5-10 Step Function executions per hour, processing thousands of records per day. CloudWatch handles this trivially.
4. **One engineer.** The marginal value of a richer observability tool is low when there's one person looking at dashboards.

### What we build in CloudWatch

**Custom metrics** (emitted by our Lambdas):
- `streams/run_duration_seconds` — how long each polling run takes
- `streams/freshness_lag_minutes` — how stale data is vs real-time
- `streams/records_processed` — throughput
- `streams/records_skipped` — idempotency dedup rate
- `streams/records_failed` — error rate
- `streams/http_status` — API response codes (watch for 429, 5xx)
- `streams/pages_fetched` — pagination volume
- `streams/schema_validation_errors` — schema drift detection

**Alarms:**
- Freshness SLA breach (lag > configured SLA for 2 periods)
- Run failure (Step Function execution failed)
- DLQ depth > 0 (messages in dead letter queue)
- Error rate > 5% over 15 minutes
- 429 storm (informational, >10 throttles in 5 minutes)

**Dashboard:** One CloudWatch dashboard (`data-streams-{env}`) with widgets for all streams.

### Structured logging

All Lambdas use `structlog` to emit structured JSON logs. Every log line includes:
- `source`, `stream`, `store_id`
- `run_id` (if applicable)
- `level`, `timestamp`, `message`
- Contextual fields (s3_key, cursor, http_status, etc.)

CloudWatch Logs Insights can query structured logs for debugging.

### When to add a third-party tool

Add Datadog/Grafana **only when**:
- You have 2+ engineers who need to collaborate on incidents
- You need cross-service distributed tracing
- CloudWatch dashboard limitations become painful (they will eventually)
- You need alerting more sophisticated than CloudWatch alarms (PagerDuty integration, escalation policies)

Expected: Phase 3 (after first hire).

## Alternatives Rejected

### Datadog from day one
Rejected. Datadog costs ~$15/host/month minimum and requires an agent or integration setup. The observability benefit over CloudWatch is marginal at V1 scale.

### Grafana + Prometheus
Rejected. Requires running Grafana infrastructure (even managed Grafana has setup overhead). Self-hosted Prometheus is a non-starter for a solo engineer.

### OpenTelemetry instrumentation
Rejected for V1. OTEL is great for portability but adds library weight and configuration complexity. Our custom metrics via `boto3` CloudWatch client are simpler and direct. If we switch to a third-party tool later, we can add OTEL then.

## Consequences

- All observability is in the AWS Console. No separate tool to log into.
- Custom metrics cost $0.30/metric/month. Budget ~$5-10/month for V1 metrics.
- Debugging requires CloudWatch Logs Insights queries (which have a learning curve but are adequate).
- When we eventually add a richer tool, the structured logging investment carries over — structured JSON logs are compatible with any log aggregator.
