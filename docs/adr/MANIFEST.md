# ADR Manifest — data-streams

> Load this first. Scan the corpus in one pass, then open full ADRs on demand.

## How To Use

- New session: `CLAUDE.md` -> `docs/README.md` -> this manifest -> relevant ADRs.
- New stream or major architecture change: start with ADRs `021`, `033`, `036`, `048`.
- Production debugging or deployment work: start with ADRs `039` through `050`.
- Follow `Supersedes` and `Depends On` before diverging from an existing pattern.

## Legend

- `Domain`: what class of decision this ADR governs.
- `Use When`: the trigger for opening the full ADR.
- `Depends On`: earlier ADRs that frame this one.

## Platform Foundations

| # | Title | Status | Domain | Use When | Depends On | Supersedes |
|---|-------|--------|--------|----------|------------|------------|
| 001 | Architecture Overview & Principles | Accepted | foundations | Orienting to platform invariants | — | — |
| 002 | Three-Tier Storage Strategy | Accepted | storage | Deciding where data belongs | 001 | — |
| 003 | Three-Layer Schema Model | Accepted | schemas | Adding or reshaping data models | 001, 002 | — |
| 004 | Lambda Runtime Roles (Config Over Bespoke) | Accepted | runtime | Adding provider/runtime boundaries | 001 | — |
| 005 | Step Functions for Polling, SQS for Webhooks | Accepted | orchestration | Evaluating polling vs webhook orchestration | 004 | — |
| 006 | Single Repo Until Team Scale | Accepted | repo-shape | Questioning repo boundaries | 001 | — |
| 007 | DynamoDB Single-Table Design | Accepted | control-plane | Modifying operational metadata storage | 002, 004 | — |
| 008 | GraphQL as Default Shopify API | Accepted | vendor-api | Building Shopify polling streams | 001 | — |
| 009 | Terraform Module Strategy | Accepted | infra | Changing Terraform/module boundaries | 001, 004, 005 | — |
| 010 | Python 3.12 as Sole Runtime | Accepted | runtime | Considering language/runtime changes | 001, 004 | — |
| 011 | Centralized Secret Storage | Accepted | secrets | Changing secret storage/access patterns | 001 | — |
| 012 | AI Leverage Model — Where AI Should and Should Not Operate | Accepted | methodology | Deciding whether AI should generate or decide something | 001, 003, 004 | — |
| 013 | Normalization Layer Deferred to Phase 2 | Accepted | scope, normalization | Asking whether normalized entities belong in phase 1 | 003 | — |
| 014 | Replay From S3, Never Re-Call Vendor APIs | Accepted | replay | Designing replay or recovery flows | 002, 003 | — |
| 015 | CloudWatch-Only Observability for V1 | Accepted | observability | Proposing new monitoring vendors/tools | 001, 004, 005 | — |
| 016 | One Generic Processor, Schema-Driven | Accepted | processing | Adding new processing paths | 003, 004 | — |
| 017 | Idempotency via DynamoDB + Postgres Constraints | Accepted | correctness | Touching deduplication or upsert safety | 007, 016 | — |

## Gorgias Foundations And First Expansion

| # | Title | Status | Domain | Use When | Depends On | Supersedes |
|---|-------|--------|--------|----------|------------|------------|
| 018 | Gorgias Tickets Ingestion Contract | Accepted | stream-contract | Extending or revisiting Gorgias tickets ingestion | 003, 004, 016 | — |
| 019 | Gorgias GET Tickets Rollout | Accepted | implementation | Understanding how ADR-018 was applied in-repo | 018 | — |
| 020 | Gorgias Secrets Stay in SSM, Not Secrets Manager | Accepted | secrets, vendor | Reopening Gorgias credential storage questions | 011, 018 | — |

## MVP Simplification And Operating Shape

| # | Title | Status | Domain | Use When | Depends On | Supersedes |
|---|-------|--------|--------|----------|------------|------------|
| 021 | Simplify to Single-Lambda MVP, Preserve Battle-Hardened Design for Scale-Up | Accepted | simplification, architecture | Debating MVP shape vs full architecture | 004, 005, 009, 016 | — |
| 022 | MVP Implementation Plan and Scale-Up Path | Accepted | execution-plan | Implementing or scaling beyond ADR-021 | 021 | — |
| 023 | Single Production Environment | Accepted | environments | Proposing long-lived non-prod environments | 021 | — |
| 024 | Stream Status Lifecycle — draft / ready / live | Accepted | workflow | Deciding launch readiness or stream lifecycle | 021, 022 | — |
| 025 | Skipped — absorbed into ADR-027/030/031 during GA4 dashboard track | — | bookkeeping | Reconciling numbering/history | — | — |
| 026 | Skipped — GA4 stream introduced directly via webhook consumer + schema registry | — | bookkeeping | Reconciling numbering/history | — | — |

## GA4 And Internal Dashboard Track

| # | Title | Status | Domain | Use When | Depends On | Supersedes |
|---|-------|--------|--------|----------|------------|------------|
| 027 | Build the Initial Data Streams Explorer GA4 View as an Aggregated Local App | Accepted | analytics, ui | Understanding first GA4/dashboard shape | 021 | — |
| 028 | GA4 Dimension Coverage and Variant-Aware Aggregate Grain | Accepted | analytics-model | Modifying GA4 dimensions or grain | 027 | — |
| 029 | Normalize GA4 Event Names and Quarantine Instrumentation Noise | Accepted | analytics-quality | Adding event normalization or quarantine logic | 027, 028 | — |
| 030 | Split the GA4 Dashboard Product Out of Data Streams | Superseded | product-boundary | Understanding the path that was later reversed | 027 | — |
| 031 | Keep Data Streams Explorer in Data Streams as a Read-Only Internal Suite Surface | Accepted | product-boundary | Debating whether the dashboard belongs in-repo | 027, 030 | 030 |
| 032 | Split Parameterized Events by Their Primary GA4 Dimension | Accepted | analytics-model | Changing event-splitting behavior | 028, 029, 031 | — |

## Reviews, Publication, And Decision Transfer

| # | Title | Status | Domain | Use When | Depends On | Supersedes |
|---|-------|--------|--------|----------|------------|------------|
| 033 | Keep Review Source Streams Pure, Publish a Generalized Review Layer | Accepted | review-architecture | Adding or revisiting provider-agnostic reviews | 003, 013, 021 | — |
| 034 | Yotpo Reviews Infrastructure and Orchestration Decisions | Accepted | review-infra | Understanding publication trigger, schema placement, or access control | 033 | — |
| 035 | PII Boundary Enforcement in the Review Stream Architecture | Accepted | security, pii | Touching review access boundaries or private linkage data | 033, 034 | — |
| 036 | Decision Replication and ADR-Driven Autonomy | Accepted | methodology, judgment | Asking what judgment can transfer to corpus/agents | 012, 033, 035 | — |

## Production Lessons And Operational Playbooks

| # | Title | Status | Domain | Use When | Depends On | Supersedes |
|---|-------|--------|--------|----------|------------|------------|
| 037 | Webhook Routing Lambda — Why Direct API Gateway to SQS Failed | Accepted | deployment, webhooks | Reconsidering direct API Gateway to SQS | 005, 021 | — |
| 038 | Production Infrastructure in us-east-1 | Accepted | deployment, region | Questioning region choice or CLI/infra mismatch | 023 | — |
| 039 | Operational Resilience Model — What Heals, What Alerts, What Fails Silently | Accepted | operability | Evaluating expected failure behavior or triage posture | 021, 023 | — |
| 040 | Yotpo First Production Deployment — Lessons and Stabilization | Accepted | deployment-lessons | Launching another production stream | 033, 034, 039 | — |
| 041 | Legacy MySQL Seed for Review Gap Fill | Proposed | legacy-seed | Planning historical gap fill from legacy data | 033, 040 | — |
| 042 | Legacy Seed Operational Lessons | Accepted | legacy-seed, operability | Running local seeds or tunnel-based legacy pulls | 041 | — |
| 043 | Stream Rebuild From Scratch — When and How to Purge and Rehydrate | Accepted | recovery | Choosing rebuild over incremental repair | 033, 040, 042 | — |
| 044 | Automated Stage Gate Snapshots During Rebuild and Seed | Accepted | recovery, snapshots | Adding rollback/snapshot controls around rebuilds | 042, 043 | — |
| 045 | Gorgias User-Agent Block and API Auth Debugging Playbook | Accepted | vendor-debugging | Seeing 403s with known-good credentials | 018, 039 | — |
| 046 | Seed Lock Contention and EventBridge Guard | Accepted | operability, locking | A seed hangs or destructive data ops compete with Lambdas | 042, 044 | — |
| 047 | Parallel Stream Validation Playbook | Accepted | validation | Running multiple streams/backfills simultaneously | 039, 044, 046 | — |
| 048 | Why ADRs Are the Product, Not the Code | Accepted | methodology | Deciding whether documentation overhead is worth it | 036, 040, 047 | — |
| 049 | Backfill Pagination Must Be Ascending Until Current | Accepted | vendor-pagination | Implementing or debugging polling/backfill cursors | 018, 039, 045 | — |
| 050 | Gorgias First Deployment Lessons | Accepted | deployment-lessons, vendor-leverage | Launching new vendor streams or framing business impact from technical sovereignty | 018, 039, 045, 046, 049 | — |
