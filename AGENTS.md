# Agents — Data Streams Platform

Instructions for AI agents working on this codebase.

## Environment rules

- **Single environment: prod only (ADR-023).** There is no dev environment. All Terraform, SSM paths, and deployments target `prod`.
- The canonical Terraform config is `infra/environments/prod-mvp/main.tf`.
- `infra/environments/dev-mvp/main.tf` exists as reference only. **Do not update it, deploy it, or add resources to it.**
- `infra/environments/dev/` and `infra/environments/prod/` are dormant (battle-hardened architecture, ADR-021). Do not modify.
- SSM parameter paths: `/data-streams/prod/...`
- Lambda `ENV` variable: `prod`

## Adding a new Shopify stream

Config over code. No new Lambda code needed:

1. `streams/{source}-{stream}.yaml` — stream config
2. `schemas/raw/shopify/{resource}.py` — permissive raw model (`extra="allow"`, `@model_validator` for GraphQL normalization)
3. `schemas/canonical/shopify/{resource}_v1.py` — strict canonical model
4. `schemas/canonical/shopify/transforms.py` — add `transform_shopify_{resource}()` function
5. `src/shared/schema_registry.py` — add `SchemaEntry` to `SCHEMA_REGISTRY`
6. `src/shared/shopify_client.py` — add GraphQL query constant + entry in `STREAM_QUERIES`
7. `src/shared/pg_client.py` — add `upsert_{resource}()` and `insert_{resource}_history()` methods
8. `migrations/00N_{resource}.sql` — DDL under `shopify.*` schema
9. `infra/environments/prod-mvp/main.tf` — Lambda + EventBridge + log group + alarm
10. Bump `VERSION` in `pyproject.toml`, append to Change Log in `CLAUDE.md`

## Key patterns

- **Raw models** detect GraphQL vs REST format in `@model_validator(mode="before")`. Use `setdefault` (not `or`) for boolean fields to avoid treating `False` as falsy.
- **Inventory** uses `transform_returns_list=True` in the schema registry — the transform returns a list of canonical records per raw record.
- **Sub-streams** (refunds, transactions) are extracted from parent records via `SubStreamDef` in the schema registry. Their transforms take `(raw, store_id, parent_id)`.
- **Brandhaus dual-write** is best-effort, wrapped in try/except. Never rolls back primary Postgres.
- **Webhook consumer** returns `batchItemFailures` for SQS partial failure reporting. Rejects missing HMAC.

## What not to do

- Do not create or maintain a dev environment
- Do not add resources to `dev-mvp/main.tf`
- Do not modify dormant code (`src/lambdas/initializer/`, `src/lambdas/processor/`, `src/lambdas/finalizer/`, `src/shared/contracts.py`, `src/shared/dynamo_control.py`) unless activating a scale-up tier from ADR-022
- Do not use DynamoDB — the MVP control plane is Postgres (`control.stream_cursors`)
