# Standard Stream Specification

**Version:** streams/v1
**Status:** Accepted
**Date:** 2026-03-17

---

## Overview

Every data stream is defined by a YAML file in `streams/`. The stream spec is the single source of truth for how a stream behaves. It is read by Terraform (to provision infrastructure), by Lambda functions (to configure behavior), and by humans/AI (to understand the stream).

## Schema Definition

```yaml
# Required fields are marked [R], optional fields are marked [O]

apiVersion: streams/v1              # [R] Spec version. Must be "streams/v1".

# --- Identity ---
source: string                      # [R] Vendor identifier (e.g., "shopify", "recharge")
stream: string                      # [R] Entity name within source (e.g., "orders", "customers")
display_name: string                # [R] Human-readable name

# --- Connection ---
mode: enum                          # [R] One of: graphql, rest, webhook, graphql+webhook, rest+webhook
api_version: string                 # [R] Vendor API version string (e.g., "2024-01")
endpoint: string                    # [O] Override URL path. Default: derived from mode + source.

# --- Schedule ---
schedule: string                    # [R for polling modes] EventBridge rate/cron expression
                                    #     Examples: "rate(5 minutes)", "cron(0/15 * * * ? *)"
                                    #     Omit for webhook-only streams.
backfill_enabled: boolean           # [O] Whether backfill can be triggered. Default: false.

# --- Schema ---
schema_version: string              # [R] Source canonical schema ref (e.g., "shopify.order.v3")
normalizes_to: string               # [O] Provider-agnostic target entity (e.g., "commerce_order")
                                    #     Phase 2. Document intent now, processor ignores until built.

# --- Identity & Idempotency ---
idempotency_key: list[string]       # [R] Fields that uniquely identify a record version.
                                    #     Must include a version/time dimension.
                                    #     Example: ["order_id", "updated_at"]
cursor_field: string                # [R for polling] Field used for incremental cursor.
cursor_type: enum                   # [R for polling] One of: datetime, integer, string

# --- Operational ---
freshness_sla_minutes: integer      # [R] Alert if data is older than this. Minimum: 5.
max_pages_per_run: integer          # [O] Safety valve. Default: 500.
page_size: integer                  # [O] Items per API page. Default: 50.
rate_limit_bucket: string           # [O] Shared rate limit group. Default: source name.
                                    #     Streams sharing a bucket coordinate throttle waits.

# --- Webhook (required if mode includes "webhook") ---
webhook_topics: list[string]        # [O] Vendor webhook topics to subscribe.
                                    #     Example: ["orders/create", "orders/updated"]
hmac_header: string                 # [O] Header containing HMAC signature.
                                    #     Default for Shopify: "X-Shopify-Hmac-Sha256"

# --- Metadata ---
owner: string                       # [R] Team or person responsible for this stream.
tags: list[string]                  # [O] Arbitrary tags for filtering/grouping.
```

## Validation Rules

1. `apiVersion` must be `streams/v1`.
2. `source` and `stream` must be lowercase alphanumeric + hyphens only.
3. `mode` must be one of the valid enum values.
4. If `mode` includes polling (graphql, rest), `schedule`, `cursor_field`, and `cursor_type` are required.
5. If `mode` includes webhook, `webhook_topics` should be specified (warning if missing).
6. `idempotency_key` must contain at least one field and should include a temporal dimension.
7. `freshness_sla_minutes` must be >= 5.
8. `schema_version` must match a registered Pydantic model.

## Concrete Example: Shopify Orders

```yaml
apiVersion: streams/v1

source: shopify
stream: orders
display_name: Shopify Orders

mode: graphql+webhook
api_version: "2024-01"

schedule: rate(5 minutes)
backfill_enabled: false

schema_version: shopify.order.v3
normalizes_to: commerce_order

idempotency_key:
  - order_id
  - updated_at
cursor_field: updated_at
cursor_type: datetime

freshness_sla_minutes: 10
max_pages_per_run: 200
page_size: 50
rate_limit_bucket: shopify

webhook_topics:
  - orders/create
  - orders/updated
hmac_header: X-Shopify-Hmac-Sha256

owner: platform
tags:
  - commerce
  - critical
```

## How Stream Specs Are Used

| Consumer | Reads | Uses for |
|----------|-------|----------|
| **Terraform** | `mode`, `schedule`, `webhook_topics` | Provision Step Functions, EventBridge rules, API Gateway routes |
| **shopify-poller** | `api_version`, `cursor_field`, `page_size`, `max_pages_per_run` | API call configuration |
| **processor** | `schema_version`, `idempotency_key` | Schema routing, idempotency check |
| **run-finalizer** | `freshness_sla_minutes` | Freshness computation and alerting |
| **webhook-receiver** | `hmac_header`, `webhook_topics` | HMAC validation, routing |
| **Humans/AI** | Everything | Understanding, extending, debugging |

## Evolving the Spec

To add a new field to the stream spec:
1. Add the field with a default value (backward compatible).
2. Update the Pydantic `StreamConfig` model in `src/shared/stream_config.py`.
3. Update this document.
4. If the field changes infrastructure behavior, update the Terraform module.
5. Bump `apiVersion` only for breaking changes (fields removed or semantics changed).
