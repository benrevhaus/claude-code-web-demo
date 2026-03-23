# Runtime Contracts

**Status:** Accepted
**Date:** 2026-03-17

---

## Overview

Each Lambda runtime role has explicit input/output contracts defined as Pydantic models. These contracts are the interface boundary — any engineer or AI implementing a Lambda must conform to these exactly.

All contracts live in `src/shared/contracts.py` as Pydantic models.

---

## initializer

**Purpose:** Load stream config, read the current cursor, create a run record, and seed the Step Function state.
**Invoked by:** Step Functions task state.

### Input

```python
class InitializerInput(BaseModel):
    source: str
    stream: str
    store_id: str
    max_pages: Optional[int]
    cursor_override: Optional[str]
    max_pages_override: Optional[int]
```

### Output

```python
class InitializerOutput(BaseModel):
    run_id: str
    stream_config: StreamConfig
    store_id: str
    cursor: Optional[str]
    checkpoint_cursor: Optional[str]
    page_number: int
    total_records: int
    total_pages: int
    max_pages: int
    status: str
```

### Behavior rules

1. Loads the stream config from `streams/`.
2. Reads the current cursor from DynamoDB unless `cursor_override` is provided.
3. Creates a run record in DynamoDB with status `running`.
4. Returns the initial state accumulator for the polling Step Function.
5. Seeds both:
   - `cursor`: the poller cursor state
   - `checkpoint_cursor`: the last durable datetime checkpoint used for freshness/finalization

---

## poller

**Purpose:** Fetch one page from a provider API, write raw to S3, return cursor.
**Invoked by:** Step Functions task state.

### Input

```python
class PollerInput(BaseModel):
    run_id: str                    # UUID for this run
    stream_config: StreamConfig    # Parsed stream YAML (full object)
    store_id: str                  # Provider tenant/store identifier
    cursor: Optional[str]          # None on first page
    page_number: int               # 1-indexed, for logging
```

### Output

```python
class PollerOutput(BaseModel):
    run_id: str
    s3_key: str                    # Where raw payload was written
    record_count: int              # Items in this page
    next_cursor: Optional[str]     # Opaque pagination state for the next page
    checkpoint_cursor: Optional[str]  # Last order.updated_at seen in this page
    has_more: bool                 # Explicit boolean for Step Function Choice state
    http_status: int               # Vendor API response code
    rate_limit_remaining: Optional[int]    # From response headers
    rate_limit_reset_at: Optional[datetime]  # When rate limit resets
```

### Behavior rules

1. Calls the provider API for one page using `cursor` from input.
2. Writes raw response body to S3 (full JSON, gzipped) using standard key pattern.
3. Updates DynamoDB run record with page count.
4. Returns both:
   - `next_cursor` for in-run pagination
   - `checkpoint_cursor` for final checkpoint/freshness
5. Does NOT decide whether to continue — Step Function decides.
6. On 429: Returns output with `has_more=True` and `rate_limit_reset_at` populated. Does not retry.
7. On 5xx: Raises exception. Step Function retry policy handles retries.
8. On 2xx with empty results: Returns `has_more=False`, `record_count=0`.

### Provider-specific notes

- Shopify uses an encoded cursor state containing a durable timestamp checkpoint and provider page cursor.
- Gorgias tickets use `updated_datetime:asc` for an initial historical crawl, then `updated_datetime:desc` once a checkpoint exists, with the durable checkpoint tracked separately from the provider pagination cursor.

### What this Lambda does NOT do

- Does not process or transform data.
- Does not write to Postgres.
- Does not make pagination decisions (continue/stop).
- Does not implement retry logic (Step Function handles retries).

---

## webhook-receiver

**Purpose:** Validate webhook, write raw to S3, enqueue for processing.
**Invoked by:** API Gateway.

### Input

Raw API Gateway event (HTTP request from Shopify).

### Output

HTTP 200 response (always, after HMAC validation).

### Side effects

1. Validates HMAC signature using secret from SSM.
2. Writes raw request body to S3 (gzipped) using webhook key pattern.
3. Sends SQS message:

```python
class WebhookSQSMessage(BaseModel):
    source: str                # "shopify"
    stream: str                # Derived from webhook topic (e.g., "orders")
    topic: str                 # "orders/updated"
    store_id: str              # From Shopify headers
    s3_key: str                # Where raw was written
    webhook_id: str            # From X-Shopify-Webhook-Id header
    received_at: datetime      # When we received it
    idempotency_key: str       # webhook_id (for SQS dedup)
```

4. Records delivery in DynamoDB webhook log.

### Behavior rules

1. Returns 200 immediately after S3 write + SQS send. Fast path only.
2. On HMAC failure: Logs warning, returns 200 (Shopify retries on non-200, creating noise). Does NOT write to S3 or SQS.
3. Does ZERO business logic. No parsing of the payload beyond extracting headers.

### What this Lambda does NOT do

- Does not process, transform, or validate the payload body.
- Does not write to Postgres.
- Does not call any other APIs.

---

## processor

**Purpose:** Read raw from S3, validate schema, transform to canonical, upsert to Postgres.
**Invoked by:** SQS trigger (webhooks) or Step Functions task (polling).

### Input

```python
class ProcessorInput(BaseModel):
    source: str                # "shopify"
    stream: str                # "orders"
    s3_key: str                # S3 key of raw payload
    run_id: Optional[str]      # None for webhook-triggered
    store_id: str
    trigger: str               # "poll" | "webhook" | "replay"
```

### Output

```python
class ProcessorOutput(BaseModel):
    records_processed: int     # Successfully upserted to Postgres
    records_skipped: int       # Skipped due to idempotency
    records_failed: int        # Failed validation or upsert
    schema_version: str        # Which schema version was used
    errors: list[str]          # Error messages (empty on full success)
```

### Behavior rules (in order)

1. Read raw payload from S3.
2. Determine schema from `(source, stream)` → look up in schema registry.
3. Parse into raw vendor Pydantic model (loose/permissive validation).
4. Transform to source canonical Pydantic model (strict validation).
5. For each record in the payload:
   a. Compute idempotency key hash.
   b. Check DynamoDB. If key exists → increment `records_skipped`, continue.
   c. Upsert to Postgres (single transaction per batch).
   d. Insert history record if data changed.
   e. Write idempotency key to DynamoDB (AFTER successful Postgres write).
6. Emit metrics (records processed, skipped, failed).
7. Return output.

### Critical invariant

**The processor is stateless and deterministic.** Same S3 input → same Postgres output (modulo idempotency skips). This is what makes replay safe.

### What this Lambda does NOT do

- Does not call vendor APIs.
- Does not manage cursors or run state.
- Does not decide what to process next.

---

## run-finalizer

**Purpose:** Close run record, compute freshness, emit metrics.
**Invoked by:** Step Functions task (always runs, even after partial failure).

### Input

```python
class FinalizerInput(BaseModel):
    run_id: str
    stream_config: StreamConfig
    store_id: str
    total_pages: int
    total_records: int
    status: str                # "success" | "partial_failure" | "error"
    error_message: Optional[str]
    final_cursor: Optional[str]  # Last successful cursor value
```

### Output

```python
class FinalizerOutput(BaseModel):
    run_id: str
    freshness_lag_minutes: float
    status: str
```

### Behavior rules

1. Updates DynamoDB run record to terminal state (success/failure/partial).
2. If status is "success" or "partial_failure", updates cursor checkpoint in DynamoDB.
3. Computes freshness: `now() - max(cursor_value)`.
4. Publishes CloudWatch custom metrics:
   - `streams/freshness_lag_minutes`
   - `streams/run_duration_seconds`
5. If freshness exceeds SLA from stream config, metric triggers CloudWatch alarm.

### What this Lambda does NOT do

- Does not process data.
- Does not call vendor APIs.
- Does not write to Postgres.

---

## replay-worker (Phase 2)

**Purpose:** Re-process raw payloads from S3.
**Invoked by:** Replay Step Function.

### Input

```python
class ReplayInput(BaseModel):
    replay_id: str
    source: str
    stream: str
    store_id: str
    s3_keys: list[str]         # Explicit list of raw payloads to reprocess
    reason: str                # Why this replay was requested
```

### Output

```python
class ReplayOutput(BaseModel):
    replay_id: str
    records_reprocessed: int
    records_failed: int
    errors: list[str]
```

### Behavior rules

1. For each S3 key, invoke processor with `trigger="replay"`.
2. Record per-key results in DynamoDB replay record.
3. Idempotency keys ensure no duplicates (processor handles this).
4. Return aggregate results.

### What this Lambda does NOT do

- Does not call vendor APIs (replay is always from S3).
- Does not modify raw S3 data.
