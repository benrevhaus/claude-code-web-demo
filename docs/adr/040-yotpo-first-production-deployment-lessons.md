# ADR-040: Yotpo First Production Deployment — Lessons and Stabilization

**Status:** Accepted
**Date:** 2026-04-07

---

## Decision

The Yotpo reviews stream was built and deployed to production in a single session. This ADR records the sequence of failures encountered during deployment, the fixes applied, and the lessons that apply to all future stream deployments.

## Intent

Every prior stream (Shopify, Gorgias) was built before the production infrastructure existed. Yotpo was the first stream to go from code to live production data in one continuous sequence. The deployment exposed gaps between "code that passes tests" and "code that runs in production" — none of which were architectural, but all of which were invisible until deployment.

This ADR captures the failure chain so that future stream deployments can anticipate and avoid the same issues.

## What Was Built

- Two-phase REST client (product catalog fetch, then per-product review fetch via widget endpoint)
- Raw and canonical models validated against live API responses
- Source-canonical tables, publication tables, access control roles
- Terraform infrastructure (Lambdas, EventBridge, IAM, SSM, alarms)
- Publication module with last-writer-wins orchestration

## Deployment Failure Sequence

### 1. Vendor API authentication header format

**Symptom:** HTTP 401 from the vendor oauth endpoint.

**Cause:** The client used `Authorization: Bearer {token}` but the vendor requires a vendor-specific header for authentication. The vendor documentation specifies this but it was missed during initial implementation.

**Fix:** Changed the auth header to match vendor documentation.

**Lesson:** Always validate authentication against the live API before writing the rest of the client. A test script that hits the oauth endpoint should be the first thing built, not the last.

### 2. Vendor API response shape mismatch

**Symptom:** The list endpoint returned reviews without product linkage, media, or verified buyer status — fields the spec assumed would be present.

**Cause:** The vendor's bulk list endpoint strips enrichment data that is available on the per-product endpoint. The spec was written based on legacy implementation behavior and vendor documentation, neither of which explicitly stated that the list endpoint omits these fields.

**Fix:** Restructured the client to a two-phase fetch: first retrieve the product catalog (which provides the product-to-identifier mapping), then fetch reviews per product via the enriched endpoint that includes all fields.

**Lesson:** Vendor API documentation describes field existence, not field availability per endpoint. The only reliable way to confirm response shape is to fetch real data from each endpoint and compare. The test script should dump actual response keys before any model code is written.

### 3. Cursor not persisting across runs

**Symptom:** Review count in the database didn't increase after the first run. Every scheduled run reprocessed the same data.

**Cause:** The client's `checkpoint_cursor` was only set to a non-null value when all products were fully paginated (`has_more=False`). Since each run hit the 500-page limit before completing, `checkpoint_cursor` was always `None`. The handler only saves the cursor when the checkpoint is truthy.

**Fix:** Changed the client to always emit a durable checkpoint encoding the current position (product index and page number), not just at completion.

**Lesson:** Cursor persistence must be tested against the `max_pages_per_run` limit, not just against the "all pages fetched" case. Any client that paginates across multiple dimensions (products × pages) must save progress in both dimensions.

### 4. SSM parameters in wrong region

**Symptom:** Lambda returned errors about invalid credentials (`PLACEHOLDER` values) even after credentials were set in SSM.

**Cause:** The operator's CLI default region was different from the deployment region. SSM parameters were written to the wrong region. The Lambdas read from the deployment region and found only the Terraform-created `PLACEHOLDER` values.

**Fix:** Re-set SSM parameters with explicit `--region` flag matching the deployment region.

**Lesson:** SSM is regional. Any documentation or script that sets SSM parameters must include an explicit region flag. The deployment guide and operational scripts now include the region in every command.

### 5. Lambda deployment package stale

**Symptom:** Lambda returned "No stream config found" — the deployed code predated the Yotpo stream YAML and schema files.

**Cause:** The Lambda zip was built months earlier and never updated. Terraform's `ignore_changes = [filename, source_code_hash]` lifecycle rule meant `terraform apply` didn't touch the Lambda code.

**Fix:** Rebuilt the Lambda package with current code and deployed via `aws lambda update-function-code`.

**Lesson:** Lambda code deployment is a separate step from infrastructure deployment. A build-and-deploy script should be a standard part of every deployment sequence, not an afterthought.

### 6. Lambda code update not taking effect

**Symptom:** After `update-function-code`, the Lambda still ran old code (same authentication error).

**Cause:** The warm Lambda instance cached the old code. The code hash didn't change because the build artifact hadn't been regenerated.

**Fix:** Rebuilt the zip from source, redeployed, and forced a cold start by updating an environment variable.

**Lesson:** Always rebuild from source before deploying. Verify the deployed code hash matches the local zip hash. If in doubt, force a cold start.

## Operational Scripts Created

The deployment sequence was painful enough to script. Four scripts were created:

- **`deploy-lambda.sh`** — rebuild and deploy code to all Lambdas (or a single named function)
- **`invoke-yotpo.sh`** — manually invoke Yotpo reviews or metadata Lambda with correct payload from SSM
- **`psql-prod.sh`** — connect to prod Aurora using connection string from SSM
- **`deploy-yotpo.sh`** — orchestrates all three: build, deploy, invoke, check cursor

These scripts include the explicit deployment region in every AWS CLI call.

## What Went Right

- The `extra="allow"` raw model pattern absorbed the API response shape mismatch without crashing. The system ingested data even when the model didn't perfectly match the response.
- The upsert-on-newer pattern (`WHERE updated_at < EXCLUDED.updated_at`) prevented duplicates when the cursor bug caused re-processing.
- S3 raw writes happened before any transform/upsert, so the immutable audit trail was captured even during runs with processing failures.
- The existing test suite (72 tests) caught nothing that broke in production — but it also meant that no regression was introduced during the rapid fix cycle. The tests validated correctness of the code; deployment failures were environmental.

## Assumptions

- Future stream deployments will follow the same sequence: validate credentials → validate API response shape → deploy infrastructure → deploy code → run migrations → set SSM values → invoke manually → verify data → let schedule take over.
- The operational scripts will be maintained as the canonical deployment path.
- The cursor persistence pattern (always emit a durable checkpoint, not just at completion) should be verified for any new client that paginates across multiple dimensions.

## Tribal Context

- Six failures in sequence during first production deployment sounds alarming. In practice, each was diagnosed and fixed in under 15 minutes. The total stabilization time from first `terraform apply` to confirmed production data was approximately 3 hours, including the 4-minute Lambda execution time for the actual review ingestion.
- The most expensive failure in terms of wasted time was the API Gateway message attribute issue (ADR-037), which required four attempts before concluding the integration subtype was fundamentally incompatible. This was a platform-level issue, not Yotpo-specific.
- The cursor persistence bug was the most consequential failure — it would have caused every scheduled run to re-process the entire corpus from the beginning, consuming API quota and Lambda execution time without ingesting new data. It was caught by checking the database count after the second run.
- None of the six failures were caught by the test suite. All were environmental: wrong region, wrong header, wrong endpoint behavior, wrong checkpoint semantics under production pagination limits. This validates ADR-036's observation that the test suite validates code correctness, not deployment correctness.

## Business Impact

The Yotpo data stream serves a dual purpose: technical data sovereignty and vendor negotiating leverage.

The company is planning to exit Yotpo. The generalized publication layer (ADR-033) was built in phase 1 specifically so that downstream systems (Customer 360, analytics, storefront) bind to a provider-agnostic contract, not to Yotpo-native tables. When the replacement vendor arrives, the switch happens at the source-canonical layer — downstream systems don't change.

This capability will be used as leverage in the Yotpo exit negotiation, following the same pattern proven with Gorgias (ADR-050): a vendor that knows the customer owns its data independently and can switch providers without downstream disruption offers better exit terms than one that assumes lock-in.

The Yotpo stream's 254K reviews, reconciled and running incrementally, is proof that the migration path exists and works — not a plan, not a slide deck, but a production system with data flowing.

## Freshness Marker

- **Captured:** 2026-04-07, updated 2026-04-10
- **Stale when:** the platform adds a CI/CD pipeline that automates the build → deploy → verify sequence (making the manual scripts unnecessary), a future stream deployment encounters a failure category not documented here, or the Yotpo exit is complete and the leverage is no longer relevant.
