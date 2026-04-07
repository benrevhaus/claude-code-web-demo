# ADR-038: Production Infrastructure in us-east-1

**Status:** Accepted
**Date:** 2026-04-07

---

## Decision

The data-streams production infrastructure runs in `us-east-1`, separate from existing company infrastructure in `us-west-1`.

## Intent

This was discovered as an accidental deployment during initial infrastructure provisioning — the Terraform provider was configured for `us-east-1` and the full stack was deployed there before the region mismatch with the CLI default (`us-west-1`) was noticed. Rather than destroy and redeploy, the decision was made to keep `us-east-1`.

## Why

### 1. Clean isolation from existing infrastructure

All data-streams resources live in `us-east-1`. Everything else lives in `us-west-1`. There is zero risk of resource name collisions, security group overlap, or accidental cross-system dependencies. If data-streams has an issue, it cannot affect `us-west-1` resources.

### 2. Easy identification

Everything in `us-east-1` is data-streams. There is no ambiguity about what belongs to which system.

### 3. No cross-region latency penalty for this workload

Data-streams talks to external vendor APIs (Shopify, Yotpo, Gorgias) and receives webhooks from the public internet. None of these are latency-sensitive to AWS region placement. The only internal dependency is Aurora, which is co-located in `us-east-1` with the Lambdas.

### 4. Redeployment cost was not justified

The infrastructure had just been provisioned — Aurora cluster, S3 bucket, all Lambdas, IAM roles, SQS queues, API Gateway. Destroying and recreating in `us-west-1` would have required re-running all migrations, re-setting all SSM secrets, and re-deploying all Lambda code for no functional benefit.

## Why-Not (Rejected Alternatives)

### Destroy and redeploy in us-west-1

Rejected because the full infrastructure was already provisioned and operational. The redeployment would take 30+ minutes (Aurora alone is 10 minutes) with no improvement to functionality, performance, or cost.

### Run in both regions

Rejected because there is no multi-region requirement. The platform is a single-environment system (ADR-023) with no disaster recovery requirement at this stage.

## Assumptions

- No existing company infrastructure in `us-west-1` requires low-latency access to data-streams Aurora or S3.
- The AWS CLI default region must be explicitly overridden with `--region us-east-1` when interacting with data-streams resources directly.
- All SSM parameters, Lambda functions, and Aurora endpoints are in `us-east-1`.

## Tribal Context

- The region mismatch was discovered when the first Lambda invocation returned `ResourceNotFoundException` — the CLI was looking in `us-west-1` while the Lambda was in `us-east-1`.
- SSM parameters were initially set without `--region us-east-1`, which wrote them to `us-west-1`. The Lambdas couldn't find them and fell back to `PLACEHOLDER` values. This happened twice before the pattern was recognized. Any future SSM operations must include `--region us-east-1`.

## Freshness Marker

- **Captured:** 2026-04-07
- **Stale when:** the company consolidates all infrastructure into a single region, adds a multi-region requirement, or discovers a latency-sensitive cross-system dependency between data-streams and `us-west-1` resources.
