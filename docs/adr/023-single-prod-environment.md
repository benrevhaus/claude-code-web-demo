# ADR-023: Single Production Environment — No Separate Dev

**Status:** Accepted
**Date:** 2026-03-26

---

## Context

The original MVP (ADR-021/022) created parallel `dev-mvp/` and `prod-mvp/` Terraform environments. With Tier 2 (full-store Shopify sync + webhooks), each environment provisions ~62 AWS resources including an Aurora Serverless v2 cluster.

The Aurora minimum (0.5 ACU) costs ~$43/mo just to exist. A dev environment that sits idle 99% of the time is $43/mo of waste. The platform is operated by a solo CTO — there is no team that needs a safe sandbox, no CI/CD pipeline that deploys to dev first, and no QA process that validates in dev before promoting to prod.

The system's design already provides safety without a separate environment:

- **Idempotent upserts** — re-running against prod data is safe (upsert-on-newer pattern)
- **Immutable S3 raw data** — any mistake can be replayed from source
- **Config-driven streams** — adding/changing a stream is YAML + schema, not infra
- **`terraform plan`** — validates infra changes against prod without needing a running dev cluster

## Decision

**Run a single `prod` environment. Do not maintain or deploy `dev-mvp/`.**

- `infra/environments/prod-mvp/main.tf` is the canonical Terraform config
- `infra/environments/dev-mvp/main.tf` is retained as reference only — not deployed, not maintained
- SSM parameter paths use `/data-streams/prod/...`
- The `ENV` Lambda env var is set to `prod`
- All smoke testing, seed scripts, and webhook registration target prod directly

### When to spin up a temporary environment

If a change is genuinely risky (e.g., ALTER TABLE on a large table, new GraphQL query structure), create a temporary Aurora cluster, test against it, and tear it down. Don't pay $43/mo in perpetual Aurora baseline for something needed once a quarter.

## Consequences

- ~$43/mo saved (Aurora baseline for unused dev)
- One fewer Terraform state to manage
- LAUNCH.md, scripts, and docs reference `prod-mvp/` only
- If a team grows and needs environment isolation, revisit this decision then
