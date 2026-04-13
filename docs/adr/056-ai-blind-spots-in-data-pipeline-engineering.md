# ADR-056: AI Blind Spots in Data Pipeline Engineering

**Status:** Accepted
**Date:** 2026-04-13

---

## Decision

This ADR documents the specific categories of errors the AI assistant repeatedly makes during data pipeline development. These are not one-time mistakes — they are systematic blind spots that the operator must actively watch for and correct. This ADR exists so the operator can anticipate them and so future AI sessions can self-check against them.

## Intent

The AI assistant is highly effective at writing code, following patterns, documenting decisions, and maintaining consistency across a large codebase. It is systematically poor at:

1. Reasoning about what data looks like at scale
2. Anticipating how pagination interacts with filters
3. Distinguishing "the code runs without errors" from "the data is correct"
4. Auditing its own work across related components
5. Recognizing when a "small gap" is actually a fundamental design flaw

The operator has had to intervene repeatedly on issues that were obvious from a data perspective but invisible from a code perspective. This ADR catalogs those interventions so they become checkpoints, not discoveries.

## The Blind Spots

### 1. Treating "runs without errors" as "works correctly"

**Pattern:** The AI deploys code, verifies it runs, checks for exceptions, and declares success. It does not independently verify that the output data matches the source.

**Examples:**
- Shopify orders backfill "completed" with cursor at present day. The AI didn't compare total counts until the operator asked. 390K orders were missing.
- Customers backfill was 65% incomplete. The AI only checked customers after the operator asked "are any other endpoints similarly affected?" — after the orders gap was already found.
- Gorgias backfill appeared complete at 82K tickets. Only the operator noticed the total should be 500K+ based on business knowledge.

**What the operator sees that the AI doesn't:** The operator knows the approximate scale of the business. When 2.5M customers appear for a business with 7.2M customers, the operator immediately knows something is wrong. The AI has no business context to trigger that suspicion.

**Checkpoint for future sessions:** After any backfill completes, compare Postgres counts against the vendor API's `count` endpoint. Do not declare backfill complete until counts match within the expected surplus (hard-deleted records).

### 2. Not auditing related components when a bug is found

**Pattern:** The AI finds a bug in one client and fixes it. It does not check whether the same class of bug exists in other clients.

**Examples:**
- The `updated_at:>=checkpoint` filter bug was found in Shopify orders. The AI fixed it and didn't check Shopify customers — which had the same bug with 65% data loss. The operator had to ask.
- The Gorgias pagination direction bug (ADR-049) was found and fixed. The Shopify client had a different variant of the same class of bug (filter instead of direction). The AI didn't cross-check.
- The Yotpo cursor persistence bug was found and fixed. The same bug existed in the Gorgias client's checkpoint logic. The pre-deployment audit caught it, but only because the operator requested the audit.

**What the operator sees that the AI doesn't:** Bugs have classes. A pagination bug in one client means every other client's pagination needs review. The operator thinks in systems; the AI thinks in files.

**Checkpoint for future sessions:** When a bug is found in any client, immediately audit every other client for the same class of bug. Do not wait for the operator to ask. This is now a mandatory step (ADR-055 meta-rule).

### 3. Not understanding pagination at the data level

**Pattern:** The AI writes pagination code that is syntactically correct but produces incomplete results. It does not reason about what records the pagination will miss.

**Examples:**
- The `updated_at:>=checkpoint` filter was added because it seemed logical: "fetch records updated since the last run." The AI did not consider that records with `updated_at` before the checkpoint would be permanently excluded. This is obvious when you think about the data: an order created in 2016 and never modified has `updated_at = 2016`. A checkpoint at 2017 will never see it again.
- The Gorgias ascending-to-descending switch seemed correct: "backfill ascending, then switch to descending for incremental." The AI did not consider the gap between the ascending cursor and the descending starting point.
- The gap repair initially sorted by `UPDATED_AT` while filtering by `created_at`. The AI did not recognize that the sort key determines the page boundaries, and `UPDATED_AT` sort would cause the same collisions regardless of the filter.

**What the operator sees that the AI doesn't:** The operator thinks about records as physical objects with properties. "If I sort by updated_at but filter by created_at, what happens to a 2016 order with updated_at in 2018?" The AI thinks about query syntax, not query results.

**Checkpoint for future sessions:** For any pagination implementation, answer these questions before writing code:
1. What sort order is used?
2. What filter is applied?
3. Can a record exist that passes the filter but is unreachable due to the sort order and page boundaries?
4. If the process is interrupted and resumed, what records could be skipped?

### 4. Optimizing before verifying correctness

**Pattern:** The AI adds optimizations (skip S3 writes, pre-filter IDs, count checks) before the underlying process has been proven to produce correct results.

**Examples:**
- The gap repair was optimized to skip S3 writes before it was verified that the repair found all missing records.
- The count-check optimization was added before discovering that the sort key caused the repair itself to miss records.
- The MySQL seed was optimized for batch commits and progress output before the metadata filter was verified correct.

**What the operator sees that the AI doesn't:** "Make it work, then make it fast." The operator repeatedly has to pull back optimizations to debug correctness issues that the optimization obscured.

**Checkpoint for future sessions:** Do not optimize a new process until it has been run once successfully with verified output counts matching the expected totals.

### 5. Not questioning its own assumptions when results look wrong

**Pattern:** When data doesn't match expectations, the AI's first instinct is to explain why the discrepancy is acceptable rather than investigating whether its code is wrong.

**Examples:**
- The 390K orders gap was initially attributed to "timestamp collisions at page boundaries (~0.5%)." The real cause was a fundamental filter bug. The AI accepted its first hypothesis without testing it.
- The 38 "new" records in May 2016 that didn't change the count — the AI's first response was "those are updates, not inserts" and suggested accepting a ~5% gap. The operator pushed back and the real fix was changing the sort key.
- The early Yotpo metadata showing 0 was explained as "the seed hasn't reached the populated range" — which was true, but only because the metadata filter was wrong (checking `response.metadata` instead of `response.payload`).

**What the operator sees that the AI doesn't:** When the numbers don't add up, the code is wrong. Not "the numbers are acceptable." Not "this is expected behavior." The code is wrong until proven otherwise.

**Checkpoint for future sessions:** When output doesn't match expectations, the default hypothesis is "the code has a bug." Investigate the code before explaining why the discrepancy is acceptable.

## Why This Matters

The AI writes ~95% of the code in this platform. It's fast, consistent, and follows patterns well. But the 5% it gets wrong is concentrated in the areas that matter most: data completeness, pagination correctness, and output verification. These are the areas where a human data engineer's intuition is irreplaceable.

The operator's interventions during this build:
- Caught the Yotpo API response shape mismatch (widget vs merchant endpoint)
- Caught the MySQL product ID mapping error
- Caught the Gorgias 403 (by recognizing it wasn't a credentials issue)
- Caught the orders gap (by knowing the approximate order count)
- Caught the customers gap (by asking "what about other endpoints?")
- Caught the sort key issue in the repair (by insisting on 100% accuracy)
- Directed every optimization to happen after correctness was verified

Without these interventions, the platform would have 65% of its customers, 95% of its orders, and would have declared success.

## The Operational Rule

**The AI builds. The operator verifies.** Every backfill, every repair, every new stream must be count-verified against the source before being declared complete. The AI must not declare success based on "the code ran without errors" — it must declare success based on "the output counts match the source within documented tolerances."

## Assumptions

- Future AI models may improve at reasoning about data at scale, but the blind spots documented here should be treated as persistent until proven otherwise
- The operator's business context (knowing approximate order counts, customer counts, review counts) is essential and cannot be replaced by the AI reading ADRs
- The checkpoints in this ADR should be followed in every future session, not just when the operator remembers to ask

## Freshness Marker

- **Captured:** 2026-04-13
- **Stale when:** the AI demonstrates consistent ability to independently verify data completeness without operator prompting, or the platform adds automated count-verification that eliminates the need for manual checks.
