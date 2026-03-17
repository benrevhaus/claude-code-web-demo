# ADR-005: Step Functions for Polling, SQS for Webhooks

**Status:** Accepted
**Date:** 2026-03-17

---

## Context

We have two ingestion modes: scheduled polling (fetch pages from vendor API) and event-driven webhooks (vendor pushes data to us). Each has different orchestration needs.

## Decision

### Polling: AWS Step Functions

Step Functions orchestrate all polling workflows because polling requires:
- **Pagination** — fetching multiple pages in sequence
- **Rate limit handling** — waiting when throttled (429)
- **Retry with backoff** — on transient failures (5xx)
- **Checkpointing** — recording progress so partial failures don't lose work
- **Long-running flows** — backfills can run for hours without holding compute open
- **Explicit state transitions** — visible in the console, debuggable, auditable

Step Functions are a **stateful durable workflow engine**, not just "chained Lambdas."

### Webhooks: API Gateway → Lambda → SQS → Lambda

Webhooks use a thin synchronous path because webhooks require:
- **Fast acknowledgment** — return 200 to the vendor quickly (Shopify retries on slow responses)
- **No complex orchestration** — it's receive → store → enqueue → process
- **Decoupling** — SQS absorbs spikes and provides retry with DLQ

The webhook-receiver Lambda does three things: validate HMAC, write raw to S3, send SQS message. Then returns 200. The processor Lambda picks up from SQS asynchronously.

### When to use Step Functions vs plain Lambda

| Situation | Use |
|-----------|-----|
| Multi-page API polling | Step Functions |
| Webhook receive + process | SQS → Lambda |
| Replay (re-process from S3) | Step Functions (Phase 2) |
| Backfill (wide-window poll) | Step Functions (reuse poll workflow) |
| One-shot triggered processing | SQS → Lambda |
| Fan-out to many records | SQS → Lambda |
| Anything with >100 executions/minute | SQS → Lambda (Step Functions too expensive) |

**Default:** If it paginates or needs durable state, use Step Functions. Otherwise, use SQS → Lambda.

## Alternatives Rejected

### Step Functions for webhooks
Rejected. Step Functions have per-execution cost ($0.025/1000 transitions). At webhook volume (potentially thousands per day), this adds up. More importantly, webhook processing is a single-step operation — Step Functions add complexity without value.

### EventBridge Pipes
Rejected. Newer AWS service with less tooling maturity. SQS → Lambda is battle-tested and well-understood. EventBridge Pipes would be a premature optimization.

### Webhook processing inline (no SQS)
Rejected. Processing inline in the webhook receiver means: slow responses to Shopify (which triggers retries), no DLQ for failures, no buffering for spikes, and webhook receiver Lambda doing too many things.

### AWS Batch for backfills
Rejected for V1. Step Functions with high `max_pages_per_run` handles backfills adequately. AWS Batch is warranted only for truly massive reprocessing jobs (millions of records). Revisit if backfills regularly exceed Step Function execution limits.

## Consequences

- Every polling stream gets a Step Function state machine (stamped from a template by Terraform).
- Every webhook stream gets an API Gateway route + SQS queue (stamped from a template by Terraform).
- A stream can be both polled AND webhook-driven (belt and suspenders). The `mode` field in the stream spec controls this.
- Step Function executions are visible in the AWS console — this IS the run log for polling streams.
