# Adding a New Stream

**Date:** 2026-03-17

---

## Overview

This guide walks through adding a new data stream to the platform. After V1 is proven, this process should take 2-3 days for a competent engineer.

**Pre-requisite:** Read [ADR-001](../adr/001-architecture-overview.md) and [Stream Spec](../specs/stream-spec.md) first.

---

## Step-by-step

### 1. Define the stream (30 minutes)

Create `streams/{source}-{stream}.yaml` following the [stream spec](../specs/stream-spec.md).

Copy an existing stream definition as your starting point. Fill in:
- Source and stream identifiers
- API mode and version
- Schedule
- Schema version name (you'll create the schema next)
- Idempotency key fields
- Cursor field and type
- Freshness SLA

### 2. Create the schemas (2-4 hours)

#### Raw model (`schemas/raw/{source}/{entity}.py`)

Read the vendor's API documentation. Create a Pydantic model that represents the raw API response. Be **permissive** — use `Optional` liberally, allow extra fields.

```python
from pydantic import BaseModel
from typing import Optional, Any

class ShopifyCustomerRaw(BaseModel):
    class Config:
        extra = "allow"  # Don't fail on unknown fields

    id: int
    email: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]
    # ... all fields from vendor API docs
```

#### Canonical model (`schemas/canonical/{source}/{entity}_v{N}.py`)

Create a **strict** Pydantic model that represents your typed, validated version of this entity.

```python
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ShopifyCustomerV1(BaseModel):
    id: int
    store_id: str
    email: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]
    created_at: datetime
    updated_at: datetime
    # ... only fields you actually need
```

#### Transform function (`schemas/canonical/{source}/transforms.py`)

Write a pure function: `raw_model → canonical_model`.

```python
def transform_shopify_customer(raw: ShopifyCustomerRaw, store_id: str) -> ShopifyCustomerV1:
    return ShopifyCustomerV1(
        id=raw.id,
        store_id=store_id,
        email=raw.email,
        first_name=raw.first_name,
        last_name=raw.last_name,
        created_at=raw.created_at,
        updated_at=raw.updated_at,
    )
```

### 3. Register the schema (15 minutes)

Add an entry to the processor's schema registry (`src/shared/schema_registry.py`):

```python
SCHEMA_REGISTRY[("shopify", "customers")] = {
    "raw_model": ShopifyCustomerRaw,
    "canonical_model": ShopifyCustomerV1,
    "pg_table": "shopify.customers",
    "transform": transform_shopify_customer,
}
```

### 4. Create the Postgres table (30 minutes)

Add a migration SQL file following the pattern in the existing tables.

```sql
CREATE TABLE shopify.customers (
    id BIGINT NOT NULL,
    store_id TEXT NOT NULL,
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    raw_s3_key TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id TEXT,
    PRIMARY KEY (id, store_id)
);

CREATE TABLE shopify.customers_history (
    history_id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    store_id TEXT NOT NULL,
    snapshot JSONB NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id TEXT,
    UNIQUE (customer_id, store_id, changed_at)
);
```

### 5. Write tests (1-2 hours)

#### Fixture data

Save 3+ real API responses in `tests/fixtures/{source}/{stream}/`.

#### Unit tests

```python
def test_transform_customer():
    raw = load_fixture("shopify/customers/customer_1.json")
    raw_model = ShopifyCustomerRaw(**raw)
    canonical = transform_shopify_customer(raw_model, "teststore")
    assert canonical.id == raw["id"]
    assert canonical.store_id == "teststore"
    assert isinstance(canonical.updated_at, datetime)
```

### 6. Deploy (30 minutes)

```bash
# Validate stream spec
python -m src.shared.stream_config validate streams/shopify-customers.yaml

# Terraform plan (creates Step Function + EventBridge rule)
cd infra/environments/dev
terraform plan

# Apply
terraform apply

# Run Postgres migration
psql -f migrations/002_shopify_customers.sql
```

### 7. Verify (1 hour)

1. Trigger a manual Step Function execution.
2. Verify raw payload in S3 at the expected key path.
3. Verify run record in DynamoDB.
4. Verify records in Postgres `shopify.customers` table.
5. Verify cursor updated in DynamoDB.
6. Verify freshness metric in CloudWatch.
7. Let scheduled runs execute for a few hours.
8. Check for duplicates.

---

## What you should NOT need to do

When adding a new stream for an existing source (e.g., another Shopify entity), you should NOT need to:

- Write new Lambda code (processor routes by config)
- Write new Terraform modules (existing modules handle it via `for_each`)
- Modify the Step Function template (it's parameterized)
- Modify the poller Lambda (it's driven by stream config)
- Create new IAM roles (existing roles scope to the bucket/table prefix)

If you find yourself doing any of the above, stop and ask: is the platform skeleton missing something? It may need a small extension to the module or config, not a one-off workaround.

---

## Adding a new SOURCE (not just a new stream)

Adding a completely new vendor (e.g., Recharge) requires more work:

1. **New poller Lambda** — `recharge-poller` that understands Recharge's auth and pagination.
2. **New SSM parameters** — API credentials for the new vendor.
3. **New schemas** — Raw and canonical Pydantic models for Recharge entities.
4. **New Postgres schema** — `CREATE SCHEMA recharge;`
5. **Stream definitions** — YAMLs for each Recharge entity.
6. **Terraform** — May need a new poller module variant if the Step Function pattern differs significantly.

The processor, finalizer, webhook-receiver, DynamoDB table, and S3 bucket are all shared and do not need to change.
