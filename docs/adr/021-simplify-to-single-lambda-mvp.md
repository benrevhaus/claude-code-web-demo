# ADR-021: Simplify to Single-Lambda MVP, Preserve Battle-Hardened Design for Scale-Up

**Status:** Accepted
**Date:** 2026-03-24

---

## Context

The platform was designed and built to production-grade standards: 4 Lambdas orchestrated by a 13-state Step Function, DynamoDB control plane, Aurora Serverless v2 with RDS Proxy, VPC with 4 endpoints, two-layer idempotency, parameterized Terraform modules, 9 CloudWatch alarms, and comprehensive observability. Two streams (Shopify Orders, Gorgias Tickets) are fully implemented with schemas, transforms, tests, and Terraform.

The system is architecturally sound — but the gap between "code complete" and "deployed and returning value" has grown too large. The sheer surface area (~187 AWS resources, 2,350 lines of Terraform, 13-state Step Function, 4 Lambda boundaries with Pydantic contracts) creates deployment friction that delays the first record reaching Postgres.

The current codebase and documentation represent months of careful design. We do not want to lose that work. But we need data flowing **this week**, not after a multi-day deployment debugging cycle.

## Decision

**Refactor down to a single-Lambda-per-stream architecture for initial deployment.** Preserve all existing code, documentation, schemas, and Terraform modules in the repository so they can be adopted incrementally as operational reality demands.

### What changes

| Component | Current (battle-hardened) | MVP (ships now) |
|-----------|--------------------------|-----------------|
| Compute | 4 Lambdas (initializer, poller, processor, finalizer) | **1 Lambda per stream** — fetches all pages, transforms, upserts in a single invocation |
| Orchestration | Step Function (13 states) + EventBridge | **EventBridge → Lambda** (direct invocation) |
| Control plane | DynamoDB (runs, cursors, idempotency, freshness) | **Postgres table** (`stream_cursors`) for cursor + last_run metadata |
| Idempotency | Two-layer (DynamoDB 30d TTL + Postgres UNIQUE) | **Postgres UNIQUE constraint only** |
| Networking | VPC + 4 VPC endpoints | **Lambda outside VPC** — Aurora public endpoint with SSL + IAM auth |
| IAM | 4 roles (least-privilege per function type) | **1 role per stream** |
| Terraform | 3 parameterized modules (~2,350 LOC) | **1 flat file per environment** (~300 LOC) |
| Observability | 7-widget dashboard + 9 alarms + structured logging | **CloudWatch Logs + Lambda error alarm** — structured logging retained |
| Contracts | `contracts.py` with 6 Pydantic I/O models | **Removed** — no inter-Lambda boundaries |
| Schema registry | Routing table with SchemaEntry objects | **Direct imports** — `if source == "shopify":` |

### What does NOT change

These are the load-bearing design invariants. They carry forward as-is:

- **Raw data to S3 first.** Every API response is gzipped and written to S3 before any processing. Immutable. Same key pattern.
- **Pydantic raw → canonical → transform pipeline.** Same schemas, same pure transform functions, same validation.
- **Upsert-on-newer.** Same Postgres INSERT...ON CONFLICT logic. Never overwrite newer data.
- **Postgres UNIQUE constraint idempotency.** The safety-net layer that prevents duplicates on replay.
- **Stream YAML definitions.** Same config-driven approach. Adding a stream = YAML + schema + migration.
- **Structured logging (structlog).** Same JSON logs with run context.
- **S3 key paths.** Same `{source}/{stream}/{store_id}/{YYYY}/{MM}/{DD}/{run_id}/page_{NNN}.json.gz` pattern.
- **Postgres table schemas.** Same `shopify.orders`, `shopify.orders_history`, `gorgias.tickets`, `gorgias.tickets_history`. Same columns, same indexes.
- **SSM for secrets.** Same paths, same access pattern.

### What is preserved but dormant

The following code and Terraform remain in the repository, untouched, under their current paths:

- `src/lambdas/initializer/`, `src/lambdas/processor/`, `src/lambdas/finalizer/` — individual Lambda handlers
- `src/shared/contracts.py` — inter-Lambda Pydantic contracts
- `src/shared/dynamo_control.py` — DynamoDB control plane operations
- `infra/modules/stream-platform/` — full VPC + Aurora + DynamoDB + S3 module
- `infra/modules/stream-poller/` — Step Function + multi-Lambda module
- `infra/modules/stream-webhook/` — API Gateway + SQS stub
- `infra/environments/dev/main.tf`, `infra/environments/prod/main.tf` — full environment configs
- All ADRs (001–020), specs, guides, and roadmap docs

This code is **not deleted, not archived, not moved to a branch**. It stays in `main` as the documented target architecture. The MVP is a stepping stone, not a replacement.

## Scale-Up Triggers

Adopt each battle-hardened component when — and only when — a concrete operational trigger is hit:

| Trigger | Then adopt |
|---------|-----------|
| Single Lambda hits 15-min timeout (large backfills or slow vendor APIs) | Step Function pagination loop (already built: `infra/modules/stream-poller/`) |
| Postgres connection errors under concurrent invocations | RDS Proxy (already configured in `stream-platform` module) |
| Need sub-second idempotency checks or DynamoDB TTL-based expiry | DynamoDB idempotency layer (already built: `dynamo_control.py`) |
| 5+ streams sharing infrastructure, Terraform duplication is painful | Parameterized Terraform modules (already built) |
| On-call rotation needs real-time dashboards | CloudWatch dashboard + alarms (already defined in Terraform) |
| Egress costs exceed VPC endpoint cost (~$22/mo per endpoint) | VPC + endpoints (already configured in `stream-platform` module) |
| Webhook volume justifies real-time ingestion | Webhook receiver (already scaffolded: `stream-webhook` module) |
| Run-level audit trail required for compliance | DynamoDB run records + finalizer Lambda |

Each trigger is independent. Adopt them individually, not as a package.

## Alternatives Considered

### Keep the current architecture and push through deployment
Rejected. The deployment surface area is the bottleneck. Every debugging cycle touches 4 Lambdas, a Step Function, DynamoDB, and VPC networking. We need data flowing before we can optimize the pipeline.

### Rewrite from scratch as a simple script
Rejected. The existing schemas, transforms, and Postgres migrations are correct and tested. Throwing them away to rewrite would lose real work. The MVP reuses everything except the orchestration layer.

### Move to ECS Fargate / long-running process
Considered but deferred. Lambda with EventBridge is simpler to deploy and costs $0 at idle. A long-running process makes sense if polling intervals drop below 1 minute or if we need persistent connections, neither of which applies today.

## Consequences

- **Data flows this week.** Single Lambda + EventBridge is deployable in a day.
- **Reduced blast radius for initial deployment.** ~15 AWS resources instead of ~91 per environment.
- **No code is lost.** The battle-hardened system is dormant, not deleted. Every component can be re-activated by wiring it into Terraform.
- **Documentation stays accurate.** The existing docs describe the target architecture. This ADR and the updated roadmap describe the intentional gap between MVP and target.
- **Risk accepted:** Single Lambda timeout (15 min max) limits backfill page count. Acceptable for incremental polling; backfills may need the Step Function.
- **Risk accepted:** No DynamoDB idempotency layer means duplicate rejection relies solely on Postgres UNIQUE constraints. Acceptable — the constraint is the ground-truth layer anyway.
- **Risk accepted:** No VPC means Aurora must accept connections from Lambda's public IP range. Mitigated by SSL + strong credentials + security group rules.

## Philosophical Note

This decision follows the project's own philosophy from `CLAUDE.md`: *"Optimize for fast iteration, clarity, and rebuildability. If uncertain, choose the simplest approach that still works end-to-end."*

The battle-hardened design was built correctly. Shipping it is a separate problem. We solve the shipping problem by reducing scope, not by lowering quality. The MVP has the same data integrity guarantees — it just has fewer moving parts.
