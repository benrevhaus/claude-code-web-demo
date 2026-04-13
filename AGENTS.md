# Agents — Data Streams Platform

Instructions for AI agents working on this codebase.

## Before you do anything

**Read ADR-048 first.** ADRs are the primary artifact of this platform — the code is secondary. Before making any architectural decision, search the existing ADRs (`docs/adr/`) for prior decisions on the same topic. The Why-Not sections document rejected alternatives with reasoning. Do not re-explore a path that was already evaluated and rejected.

**After every non-trivial decision or deployment failure**, write an ADR following the YY Method (https://yymethod.com). Required sections: Decision, Intent, Constraints, Why, Why-Not (Rejected Alternatives), Assumptions, Tribal Context, Freshness Marker. The operational ADRs (037-047) that document failures and debugging playbooks are as valuable as the architectural ADRs (001-036). Do not skip them.

**The ADR corpus is the handoff mechanism.** A new agent reading `docs/adr/` should be able to extend the platform without the original operator present. If you make a decision that a future agent would need to understand, it belongs in an ADR.

## Environment rules

- **Single environment: prod only (ADR-023).** There is no dev environment. All Terraform, SSM paths, and deployments target `prod`.
- The canonical Terraform config is `infra/environments/prod-mvp/main.tf`.
- `infra/environments/dev-mvp/main.tf` exists as reference only. **Do not update it, deploy it, or add resources to it.**
- `infra/environments/dev/` and `infra/environments/prod/` are dormant (battle-hardened architecture, ADR-021). Do not modify.
- SSM parameter paths: `/data-streams/prod/...`
- Lambda `ENV` variable: `prod`

## Stream status lifecycle (ADR-024)

Every stream YAML has a `status` field: `draft` → `ready` → `live`.

| Status | Meaning | Safe to merge? | Has Terraform? |
|--------|---------|---------------|----------------|
| `draft` | Schema/transform work in progress | Yes | No |
| `ready` | Code complete — YAML, schemas, transforms, pg_client, migration, registry entry all done | Yes | No |
| `live` | Terraform deployed, EventBridge running, data flowing | Yes | Yes |

**Build code first, add Terraform later.** All streams ship in the Lambda zip regardless of status, but only `live` streams have EventBridge triggers firing.

## Adding a new stream

### Phase 1: Build to `ready` (no infra, no cost)

1. `streams/{source}-{stream}.yaml` — set `status: draft`, then `ready` when done
2. `schemas/raw/{source}/{resource}.py` — permissive raw model (`extra="allow"`, `@model_validator` for GraphQL normalization)
3. `schemas/canonical/{source}/{resource}_v1.py` — strict canonical model
4. `schemas/canonical/{source}/transforms.py` — add `transform_{source}_{resource}()` function
5. `src/shared/schema_registry.py` — add `SchemaEntry` to `SCHEMA_REGISTRY`
6. `src/shared/{source}_client.py` — add API query (GraphQL for Shopify, REST client for other vendors)
7. `src/shared/pg_client.py` — add `upsert_{resource}()` and `insert_{resource}_history()` methods
8. `migrations/00N_{resource}.sql` — DDL under `{source}.*` schema
9. Bump `VERSION` in `pyproject.toml`, append to Change Log in `CLAUDE.md`

### Phase 2: Launch to `live` (when ready to deploy)

1. Run migration: `psql "$CONN" -f migrations/00N_{resource}.sql`
2. Add Lambda + EventBridge + log group + alarm to `infra/environments/prod-mvp/main.tf`
3. Set SSM secrets (if new vendor)
4. `terraform apply`
5. Smoke test: `aws lambda invoke ...`
6. Wait for backfill to complete (cursor switches to incremental — timestamp, no page_cursor)
7. **Verify counts** using `compare-shopify-month.sh` against Shopify API for key months
8. **Run gap repair** (`scripts/run-gap-repair.sh` or `run-customer-repair.sh`) — the UPDATED_AT sort causes ~0.5% page-boundary collisions during backfill. The repair sweeps by created_at with sortKey: ID (collision-free) and fills the gaps. See ADR-055/057.
9. **Verify counts again** — gap should be zero or near-zero (surplus from hard-deleted records is expected)
10. Take Aurora snapshot
11. Update YAML: `status: live`
12. Commit

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
