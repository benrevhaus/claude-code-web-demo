# ADR-050: Gorgias First Deployment Lessons

**Status:** Accepted
**Date:** 2026-04-10

---

## Decision

The Gorgias tickets stream required four code fixes during its first production deployment. This ADR records what went well, what went wrong, and the specific sequence of failures so future stream deployments avoid the same issues.

## What Went Well

### 1. Pre-deployment audit caught real bugs before they hit production

The ADR-driven audit against ADRs 037-044 identified two real issues before the first invocation: the SSM region bug (affected all streams) and the cursor empty-page edge case. The audit also confirmed that PII access control, schema registry, and Terraform were all correct. Without the audit, these would have been production failures instead of pre-deployment fixes.

### 2. Existing code was 90% correct

The Gorgias client, raw models, canonical models, transforms, pg_client methods, schema registry, and Terraform were all built months before this deployment. They required only two field-level fixes (User-Agent header, via field type) to work against the live API. The config-over-code pattern held — no new Lambda code was needed.

### 3. The upsert-on-newer pattern prevented data corruption during debugging

Multiple truncate-and-restart cycles, stale Lambda connections, and pagination fixes all ran against the same table. Zero duplicates at every integrity check. The `ON CONFLICT (id, store_id) DO UPDATE WHERE updated_datetime < EXCLUDED.updated_datetime` pattern absorbed every re-processing scenario without operator intervention.

### 4. Yotpo's ADR corpus directly prevented repeated failures

- SSM region mismatch (ADR-038) — known pattern, credentials set in `us-east-1` from the start
- Lambda code deployment sequence (ADR-040) — deploy script used immediately, no manual zip building
- Lock contention (ADR-046) — detected and resolved in minutes using the documented `pg_stat_activity` query

## What Went Wrong

### 1. User-Agent header blocked by vendor bot protection (2 hours lost)

**Failure:** HTTP 403 on every request with correct credentials.

**Root cause:** Python's `urllib` default User-Agent (`Python-urllib/3.12`) is blocked by Gorgias's bot protection. `curl` and `http.client` work because they use different User-Agent strings.

**Why it took 2 hours:** The debug started by exploring auth methods (Basic auth, Bearer, raw token) instead of testing transport methods (curl vs Python). The auth was correct from the beginning.

**ADR-045 playbook (written after):** Test with curl first. If curl works, the credentials are correct — test the Python HTTP library next. 2-minute fix instead of 2-hour exploration.

**Lesson for future streams:** Always test with curl before writing any Python code. Always set an explicit User-Agent on `urllib` requests. This is now a platform-wide rule.

### 2. Pydantic field type too strict for real API data (5 minutes)

**Failure:** 100 validation errors — `via` field expected `dict` but received string `"zendesk"`.

**Root cause:** The raw model defined `via: Optional[dict[str, Any]]` but Gorgias returns `via: "zendesk"` for tickets imported from Zendesk. The field type should have been `Optional[Any]`.

**Why it was fast to fix:** ADR-040 (Yotpo deployment lessons) established the pattern: validate raw models against real API data, not assumptions. The fix was a one-line type change.

**Lesson for future streams:** Raw models should use `Optional[Any]` for fields where the vendor documentation shows multiple possible types. The `extra="allow"` pattern catches unknown fields but doesn't help when a known field has an unexpected type.

### 3. Ascending-to-descending pagination gap (400K tickets lost)

**Failure:** 336K+ tickets from 2024-2025 were never ingested. Total corpus ~500K, only 82K ingested.

**Root cause:** The client switched from ascending pagination (backfill) to descending pagination (incremental) after the first run. Descending fetches newest-first, creating a gap between the ascending cursor (June 2023) and the newest data (April 2026). Old closed tickets in the gap would never appear in descending results unless recently modified.

**Why it happened:** The ascending/descending logic was designed for incremental delta detection, not for large initial backfills that span multiple runs. It was never tested against a corpus larger than `max_pages_per_run`.

**ADR-049 rule (written after):** Backfill must be ascending until the cursor is within 24 hours of current time. Only then switch to descending for incremental.

### 4. API pagination cursor not persisted across runs (cursor stuck)

**Failure:** After fixing the ascending/descending issue, the cursor didn't advance. Every run re-processed the same data.

**Root cause:** The Gorgias API uses cursor-based pagination (`meta.next_cursor`), not date-range filtering. The client saved only the timestamp checkpoint between runs. The API pagination cursor was lost, so each run started from the beginning of the ascending result set.

**Why it took three iterations:** First attempt assumed date-range filtering existed (`updated_datetime:gte`) — deployed, got 400, then checked the vendor docs. Second attempt persisted the full cursor state including the API cursor. Third attempt confirmed advancement.

**ADR-049 debug rule (added after):** When a cursor isn't advancing, check the vendor's pagination documentation before writing any code fix. Do not assume filtering or pagination capabilities — verify against docs first.

### 5. Lock contention from parallel Lambda invocations (silent hang)

**Failure:** Truncate operation hung for 40+ minutes during a rebuild attempt.

**Root cause:** EventBridge-triggered Lambda invocations held `idle in transaction` connections on the Gorgias tables. The truncate queued behind the lock indefinitely.

**Resolution:** Disable EventBridge rule → kill stale connections → truncate → re-enable. Same pattern as ADR-046 (Yotpo seed lock contention).

**Lesson:** Any destructive table operation (truncate, major schema change) must disable the stream's EventBridge rule first.

## Comparison: Yotpo vs Gorgias Deployment

| Metric | Yotpo | Gorgias |
|--------|-------|---------|
| Code changes needed | 12+ (new client, models, etc.) | 4 (fixes to existing code) |
| ADRs written | 15 (033-047) | 4 (045, 046, 049, 050) |
| Time to first data in Postgres | ~6 hours | ~30 minutes |
| Time to stable incremental | ~36 hours (rebuild + seed) | TBD (backfilling) |
| Failures during deployment | 6 (ADR-040) | 5 |
| Failures caught by prior ADRs | 0 (first stream) | 3 (SSM region, deploy sequence, lock contention) |

The ADR corpus reduced Gorgias deployment failures by catching 3 of 8 potential issues before they became production failures. The remaining 5 were vendor-specific (User-Agent, field type, pagination model) that no amount of prior ADRs could prevent — they required live API testing.

## The Rule for Future Stream Deployments

1. **Run the pre-deployment audit** against the ADR corpus (ADRs 037-049)
2. **Test with curl first** before any Python code touches the vendor API
3. **Set explicit User-Agent** on every `urllib` request
4. **Validate raw models** against a real API response, not documentation
5. **Check vendor pagination docs** before implementing cursor logic
6. **Test pagination** against a corpus larger than `max_pages_per_run`
7. **Persist the full cursor state** including API pagination tokens, not just timestamps
8. **Disable EventBridge** before any destructive table operation

## Business Impact

The Gorgias data stream had a direct, measurable business impact beyond its technical function.

During a CEO-level meeting with Gorgias, the existence of this data stream — the fact that the company was actively building a provider-agnostic ingestion layer for its Gorgias data — changed the vendor's posture. The vendor:

- Offered to pilot new programs that had not previously been on the table
- Offered to push unused credits from the current contract to the next renewal period

Both are significant leverage wins. The data stream demonstrated that the company had the technical capability to own its data independently of the vendor — which is precisely the architectural goal documented in ADR-033 (source-pure streams with generalized publication).

The implication: building data sovereignty infrastructure doesn't just protect against vendor lock-in technically — it changes the negotiating dynamic with the vendor. A vendor that knows you can walk away offers better terms than one that assumes you can't.

This validates the decision (ADR-033) to build generalized publication in phase 1 rather than deferring it. The generalized layer wasn't needed yet technically, but its existence — and the vendor's awareness of it — created immediate business value.

## Freshness Marker

- **Captured:** 2026-04-10
- **Stale when:** the platform adds a pre-deployment validation script that automates the audit steps, or the Gorgias API changes its pagination model, or a future stream deployment discovers a failure category not documented here or in ADRs 037-049, or the Gorgias vendor relationship materially changes.
