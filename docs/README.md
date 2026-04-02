# Data Streams Platform — Decision Documents

This directory contains the architecture decisions, specifications, and operational guides for the Data Streams ingestion platform.

These documents capture **intent**, not just implementation. Every decision records what we chose, what we rejected, and why. When extending the platform, read the relevant ADR before diverging from the established pattern.

## How to use these docs

- **Before building a new stream:** Read ADR-001 (Architecture Overview), ADR-006 (Config Over Code), and `specs/stream-spec.md`.
- **Before adding infrastructure:** Read ADR-009 (Terraform Governance) and ADR-004 (Storage Strategy).
- **Before modifying the Step Function:** Read ADR-007 (Orchestration) and `specs/step-function-design.md`.
- **Before onboarding a new engineer:** Have them read docs in this order: README → ADR-001 → `specs/` → `guides/operability.md`.
- **Before asking AI to generate a new stream:** Point it at ADR-012 (AI Leverage Model) and `specs/stream-spec.md`.

## Document Index

### Architecture Decision Records (ADRs)

Numbered, immutable once accepted. If a decision is superseded, a new ADR replaces it with a back-reference.

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](adr/001-architecture-overview.md) | Architecture Overview & Principles | Accepted |
| [ADR-002](adr/002-storage-tiers.md) | Three-Tier Storage Strategy | Accepted |
| [ADR-003](adr/003-schema-layers.md) | Three-Layer Schema Model | Accepted |
| [ADR-004](adr/004-lambda-strategy.md) | Lambda Runtime Roles (Config Over Bespoke) | Accepted |
| [ADR-005](adr/005-orchestration.md) | Step Functions for Polling, SQS for Webhooks | Accepted |
| [ADR-006](adr/006-single-repo.md) | Single Repo Until Team Scale | Accepted |
| [ADR-007](adr/007-dynamodb-single-table.md) | DynamoDB Single-Table Design | Accepted |
| [ADR-008](adr/008-graphql-default.md) | GraphQL as Default Shopify API | Accepted |
| [ADR-009](adr/009-terraform-governance.md) | Terraform Module Strategy | Accepted |
| [ADR-010](adr/010-python-runtime.md) | Python 3.12 as Sole Runtime | Accepted |
| [ADR-011](adr/011-secrets-ssm.md) | SSM Parameter Store for Secrets | Accepted |
| [ADR-012](adr/012-ai-leverage-model.md) | AI Leverage Model — Where AI Should and Should Not Operate | Accepted |
| [ADR-013](adr/013-normalization-deferred.md) | Normalization Layer Deferred to Phase 2 | Accepted |
| [ADR-014](adr/014-replay-model.md) | Replay From S3, Never Re-Call Vendor APIs | Accepted |
| [ADR-015](adr/015-observability-cloudwatch-only.md) | CloudWatch-Only Observability for V1 | Accepted |
| [ADR-016](adr/016-processor-strategy.md) | One Generic Processor, Schema-Driven | Accepted |
| [ADR-017](adr/017-idempotency-strategy.md) | Idempotency via DynamoDB + Postgres Constraints | Accepted |
| [ADR-018](adr/018-gorgias-tickets-ingestion-contract.md) | Gorgias Tickets Ingestion Contract | Accepted |
| [ADR-019](adr/019-gorgias-get-rollout.md) | Gorgias GET Rollout | Accepted |
| [ADR-020](adr/020-gorgias-secrets-ssm-not-secrets-manager.md) | Gorgias Secrets in SSM, Not Secrets Manager | Accepted |
| [ADR-021](adr/021-simplify-to-single-lambda-mvp.md) | Simplify to Single-Lambda MVP, Preserve Battle-Hardened Design for Scale-Up | Accepted |
| [ADR-022](adr/022-mvp-implementation-and-scale-up-path.md) | MVP Implementation Plan and Scale-Up Path | Accepted |
| [ADR-023](adr/023-single-prod-environment.md) | Single Prod Environment | Accepted |
| [ADR-024](adr/024-stream-status-lifecycle.md) | Stream Status Lifecycle — draft / ready / live | Accepted |
| [ADR-025](adr/025-clickhouse-fargate-alb-s3-evaluation.md) | Evaluate ClickHouse + Fargate + ALB + S3 as a Unified Data Streams Platform | Accepted |
| [ADR-026](adr/026-ga4-gtm-immediate-stream.md) | Introduce GA4/GTM Immediately as a Webhook-First Event Stream | Accepted |
| [ADR-027](adr/027-ga4-historical-dashboard-mvp.md) | Build the Initial Data Streams Explorer GA4 View as an Aggregated Local App | Accepted |
| [ADR-028](adr/028-ga4-dimension-coverage-and-variant-grain.md) | GA4 Dimension Coverage and Variant-Aware Aggregate Grain | Accepted |
| [ADR-029](adr/029-ga4-event-name-normalization.md) | Normalize GA4 Event Names and Quarantine Instrumentation Noise | Accepted |
| [ADR-030](adr/030-split-dashboard-from-data-streams.md) | Split the GA4 Dashboard Product Out of Data Streams | Accepted |
| [ADR-031](adr/031-internal-dashboard-suite.md) | Keep Data Streams Explorer in Data Streams as a Read-Only Internal Suite Surface | Accepted |

### Specifications

| Spec | Description |
|------|-------------|
| [Stream Spec](specs/stream-spec.md) | Standard stream definition schema (the YAML contract) |
| [Analytics Contract](specs/analytics-contract.md) | Read contract for internal dashboard consumers over analytical datasets |
| [Runtime Contracts](specs/runtime-contracts.md) | Input/output contracts for every Lambda role |
| [Step Function Design](specs/step-function-design.md) | State machine definitions for polling and replay |
| [Data Model](specs/data-model.md) | DynamoDB entities, S3 key patterns, Postgres schema |
| [Failure Modes](specs/failure-modes.md) | Known failure modes with symptoms, causes, and recovery |

### Guides

| Guide | Description |
|-------|-------------|
| [Operability Standard](guides/operability.md) | Metrics, alarms, dashboards, runbooks, ownership |
| [Adding a New Stream](guides/adding-a-stream.md) | Step-by-step for adding a new data stream |
| [What We Chose Not To Build](guides/not-building.md) | Explicit list of deferred/rejected scope with rationale |

### Roadmap

| Doc | Description |
|-----|-------------|
| [Phased Roadmap](roadmap/phases.md) | Phase 1/2/3 sequencing with exit criteria |
| [V1 Launch Checklist](roadmap/v1-checklist.md) | Concrete checklist for first production stream |
