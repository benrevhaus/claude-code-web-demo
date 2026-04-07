# ADR-034: Yotpo Reviews Infrastructure and Orchestration Decisions

**Status:** Accepted
**Date:** 2026-04-07

---

## Decision

Three infrastructure decisions were made for the Yotpo reviews implementation:

1. **Publication orchestration uses last-writer-wins** — no new Lambda, Step Function, or schedule. The stream_runner that finishes second detects the other stream is fresh and runs the publication pass inline.

2. **Postgres schema namespacing** — source-canonical tables live in `yotpo.*`, generalized publication tables live in `reviews.*`, all within the same Aurora database.

3. **Restricted identity access uses Postgres roles** — a platform-wide `data_operator` role controls `SELECT` on the identity companion table. The broad `data_reader` role cannot access it. Enforced at the database level via migration.

## Intent

The review stream architecture (ADR-033) introduced a coordinated multi-stream publication cycle and a restricted identity companion table. These three decisions resolve the infrastructure ambiguities that ADR-033 and the review specs left open:

- How does the publication pass get triggered when it depends on two independent source streams?
- Where do generalized tables live relative to source-canonical tables in Postgres?
- How is the restricted identity table actually restricted?

## Constraints

- The platform uses a single-Lambda MVP architecture (ADR-021/022) — one stream_runner per stream, each on its own EventBridge schedule.
- No Step Functions or multi-stream orchestration exist today.
- The Aurora instance is shared across all streams (Shopify, Gorgias, GA4, now Yotpo).
- The review specs require that the identity companion table not be queryable by standard analyst connections.

## Why

### 1. Last-writer-wins avoids new orchestration infrastructure

The two Yotpo source streams (`yotpo_reviews` at 15 min, `yotpo_review_metadata` at 60 min) run independently. Adding a Step Function or coordinator Lambda to sequence them would be the first multi-stream orchestration in the platform — significant new complexity for a two-stream publication cycle.

Last-writer-wins keeps the existing pattern: each stream_runner checks whether the other stream's data is fresh enough after its own ingest, and if so, runs the publication pass. No new resources, no new failure modes beyond what freshness alarms already catch.

The trade-off is that if one stream fails repeatedly, publication stalls silently. This is acceptable because the existing freshness alarm pattern already catches stalled streams.

### 2. Same database with schema separation avoids cross-database join pain

The publication pass must read source-canonical tables and write generalized tables in one transaction. Separate databases would require `dblink` or `postgres_fdw` for cross-database joins, plus a second connection string, second connection pool, and second set of IAM/SSM plumbing.

Postgres schemas (`yotpo.*` and `reviews.*`) provide logical separation and permission scoping without breaking joins. This matches how `shopify.*` tables already coexist in the same Aurora instance.

### 3. Database-level role enforcement is cheaper and more durable than application-level access control

A few `GRANT` statements in a migration give permanent enforcement regardless of which application or connection string accesses the database. Application-level enforcement would require every consumer to implement and maintain its own access checks, and any leaked connection string would expose everything.

The platform-wide `data_operator` role is granted only to connections that need private linkage (Customer 360). The `data_reader` role has `SELECT` on all other `reviews.*` tables but not the identity companion.

## Why-Not (Rejected Alternatives)

### New publisher Lambda triggered after both streams complete

Rejected because it introduces the first multi-stream orchestration resource in the platform. The coordination problem is real but small (two streams), and last-writer-wins solves it with zero new infrastructure. A dedicated publisher would be justified if the publication cycle grows to three or more required streams.

### Separate scheduled publication job

Rejected because it adds latency (publication waits for the next schedule tick after both streams are fresh) and a new Lambda to maintain. The inline approach publishes immediately when data is ready.

### Separate Postgres databases for source-canonical vs generalized tables

Rejected because Postgres does not support cross-database joins without extensions. The publication pass needs to read `yotpo.*` and write `reviews.*` in one transaction. Separate databases would add `dblink`/`postgres_fdw` complexity, a second connection string, and a second RDS Proxy configuration for isolation that Postgres schemas already provide.

### Application-level access control for the identity companion

Rejected because it is not durable. Database-level `GRANT` enforcement survives connection string leaks, new applications, and ad-hoc analyst access. Application-level enforcement requires every consumer to implement access checks independently and trusts that no consumer will skip them.

## Assumptions

- Two source streams are sufficient for the Yotpo review publication cycle. If a third required stream is added, last-writer-wins may need revisiting.
- The Aurora instance has sufficient capacity for the additional `yotpo.*` and `reviews.*` tables without scaling changes.
- The existing SSM path wildcard (`/data-streams/prod/*`) in stream_runner IAM policies already covers `/data-streams/prod/yotpo/*`.
- Freshness alarms are sufficient to detect stalled publication caused by a repeatedly failing stream.

## Tribal Context

- The platform has never had multi-stream coordination before. Every stream runs independently. This decision deliberately avoids introducing that complexity for a two-stream case.
- The `reviews.*` schema is the first cross-source publication schema. All prior schemas (`shopify.*`) are source-scoped. This sets a precedent for future generalized publication layers.
- The Postgres role approach was chosen partly because the team is a solo CTO — application-level enforcement across multiple consumers would be harder to maintain than a migration that runs once.

## Terraform Changes

The following resources were added to `infra/environments/prod-mvp/main.tf`:

| Count | Resource | Purpose |
|---|---|---|
| 2 | `aws_iam_role` + `aws_iam_role_policy` | Added to existing `for_each` |
| 2 | `aws_ssm_parameter` | Vendor API credentials (placeholder) |
| 2 | `aws_cloudwatch_log_group` | Lambda log groups, 30-day retention |
| 2 | `aws_lambda_function` | `yotpo-reviews` (15 min) and `yotpo-review-metadata` (60 min) |
| 2 | `aws_cloudwatch_event_rule` + `aws_cloudwatch_event_target` | EventBridge schedules |
| 2 | `aws_lambda_permission` | EventBridge invoke permissions |
| 2 | `aws_cloudwatch_metric_alarm` | Error threshold alarms |
| 1 | `variable` | `yotpo_store_id` |
| 2 | `output` | Lambda function names |

No changes to Aurora, S3, VPC, SQS, webhook infrastructure, or SNS. Postgres schemas and roles are created via SQL migrations, not Terraform.

## Freshness Marker

- **Captured:** 2026-04-07
- **Stale when:** the publication cycle requires three or more coordinated source streams (revisit orchestration), the Aurora instance needs workload isolation beyond schema separation (revisit database topology), or the platform moves to a multi-tenant model where application-level access control becomes necessary.
