# ADR-058: Why AI Over a Dedicated Engineer for This Project

**Status:** Accepted
**Date:** 2026-04-13

---

## Decision

The data-streams platform is built and operated by a solo CTO with AI assistance rather than a dedicated data engineer. This is a deliberate staffing decision, not a budget constraint. This ADR documents why the AI-assisted model produces better outcomes for this specific project than a traditional hire would.

## Intent

After building three vendor integrations (Yotpo, Gorgias, Shopify) with 57 ADRs, 25M+ rows, and multiple debugging sessions, the strengths and weaknesses of AI as an engineering partner are well-characterized. This ADR compares those against the realistic strengths and weaknesses of a mid-to-senior data engineer hired for this role.

## The AI's Failures on This Project

The AI made significant errors during this build. Documented across ADRs 045, 049, 055, 056, and 057:

1. **Didn't verify data completeness after backfill** — declared success based on "code ran without errors," missing 65% of customers and 5% of orders
2. **Didn't audit related components when a bug was found** — fixed Shopify orders but didn't check customers until asked
3. **Didn't understand pagination at the data level** — wrote filters that silently excluded records, applied wrong sort keys, used wrong timezone boundaries
4. **Optimized before verifying correctness** — added S3 skip, count checks, and batch optimizations before the underlying process was proven correct
5. **Explained away discrepancies instead of investigating** — suggested accepting a ~5% gap as "timestamp collisions" when it was a fundamental filter bug
6. **Took eight iterations to match a simple monthly count** — each layer revealed the next: filter bug → sort collision → timezone boundary → inclusive operator → DST

These are real failures. They cost hours of debugging time. They would be unacceptable in a production data pipeline at a company with dedicated data engineering.

## What a Dedicated Engineer Would Do Differently

A good data engineer would:

- Verify counts against the source after every backfill (basic practice)
- Know that Shopify uses store timezone for date queries (domain knowledge)
- Test pagination against a dataset larger than one page (standard QA)
- Understand DST implications without being told (professional competence)
- Not need the operator to explain why 746 ≠ 779 (the engineer would investigate)

These are legitimate advantages of human expertise that the AI lacks.

## What a Dedicated Engineer Would Do the Same

But a realistic assessment of a mid-to-senior hire for this role reveals the same failure patterns in different forms:

### The same pagination bugs, different timeline

Pagination bugs in vendor API integrations are common across the industry. The `updated_at` filter bug that skipped unmodified records is not obvious — it requires understanding the interaction between GraphQL cursor pagination, query filters, and sort order. A new engineer unfamiliar with Shopify's API would make similar mistakes. The difference: the AI made the mistake and fixed it in the same day. A human engineer would make it in week 2 and might not discover it until month 3 when someone notices the count discrepancy.

### The timezone issue takes everyone by surprise

Shopify's `created_at:<2016-06-01` including June 1st in the store timezone is not documented behavior. It was discovered empirically. A dedicated engineer would encounter the same confusion, likely spend similar debugging time, and might not document the finding as thoroughly as ADR-057.

### The count verification problem is organizational, not technical

A dedicated engineer who doesn't independently verify counts against the source is a real risk. Engineers trust their code. "The tests pass, the data looks right" is a common human failure mode. The AI's version of this ("runs without errors = correct") is the same cognitive shortcut. The fix is the same: mandatory count verification as a process step, not a skill.

### The documentation wouldn't happen

A dedicated engineer would not write 57 ADRs in a week. They would write maybe 3-5 high-level design docs, then move to implementation. The operational scars (ADRs 037-057) — the debugging playbooks, the pagination rules, the timezone reconciliation — would live in Slack threads, Jira comments, or the engineer's memory. When the engineer leaves, that knowledge leaves.

The AI produces the ADR as a side effect of doing the work. The engineer would have to stop engineering to write documentation, which competes with their delivery timeline. In practice, it doesn't happen.

## The Real Comparison

### Hiring timeline

A dedicated data engineer takes 2-6 months to hire (job posting, screening, interviews, offer, notice period). The data-streams platform was built from zero to production in one week.

### Onboarding timeline

A new engineer needs 2-4 weeks to understand the existing codebase, vendor APIs, infrastructure, and business context. The AI reads CLAUDE.md, AGENTS.md, and 57 ADRs in seconds and makes informed decisions immediately.

### Error correction speed

When the AI makes a mistake, it's corrected in the same session — often within minutes. The fix is deployed, tested, and documented before the operator's attention moves elsewhere. A human engineer's mistake goes through code review, a fix PR, staging (if it exists), and deployment. Even in a fast-moving team, that's hours to days.

### Cost comparison

A mid-to-senior data engineer in a US market costs $150,000-$200,000/year in total compensation. The AI costs approximately $200-500/month in API usage for this workload. The AI is 300-1000x cheaper and delivers faster, with more documentation, though with the specific blind spots documented in ADR-056.

### Knowledge retention

When a human engineer leaves, their tribal knowledge goes with them. The ADR corpus remains. A new session with a new AI model reads the same corpus and makes the same quality decisions. The investment in documentation has compounding returns; the investment in a single engineer's experience has a shelf life.

## Where the Model Breaks Down

The AI-assisted model works for this project because:

1. **The operator is technically capable.** The CTO understands data pipelines, vendor APIs, SQL, and infrastructure well enough to catch the AI's mistakes. A non-technical operator could not do this.

2. **The project is greenfield.** Building from scratch with documented patterns is the AI's strength. Maintaining a complex legacy system with undocumented behavior would be harder.

3. **The team is one person.** There's no coordination overhead, no code review delays, no meeting tax. Adding a second person (human or AI) would add communication overhead that might not offset the capability gain.

4. **The ADR corpus exists.** Without the documentation, the AI's mistakes would compound across sessions. With it, each session starts from the accumulated knowledge of all prior sessions.

If any of these conditions change — the operator becomes less available, the system grows beyond one person's cognitive load, the project requires real-time collaboration, or the ADR practice is abandoned — the case for a dedicated engineer strengthens.

## Why the Mistakes Are Acceptable

The AI made every mistake documented in ADR-056. Every one was caught by the operator, fixed in the same session, and documented for future prevention. The total debugging time was approximately 8 hours across the entire build.

A dedicated engineer would make different mistakes at a different cadence. Some would be caught in code review (if there's a reviewer). Some would reach production. Some would go undiscovered for months. The total debugging time would likely be similar or higher, spread over weeks instead of hours.

The key insight: **the AI's mistakes are fast, cheap, and documented. A human's mistakes are slow, expensive, and often undocumented.** The total cost of the AI's errors (8 hours of operator time + 57 ADRs) is less than the cost of one bad hire's first month (onboarding + first mistakes + no documentation).

## The Defensible Position

Not hiring a dedicated data engineer for this project is defensible because:

1. **The platform shipped.** Three vendors, eight streams, 25M+ rows, reconciled against source systems, running in production.

2. **The knowledge is captured.** 57 ADRs document every decision, every failure, and every rule. A new engineer (human or AI) can extend the platform by reading the corpus.

3. **The cost is fractional.** The entire build cost less than one month of a data engineer's salary.

4. **The operator is the bottleneck by design.** ADR-036 documents this explicitly. The platform's evolution depends on one person's judgment. Adding a second person doesn't remove that bottleneck — it adds coordination overhead around it.

5. **The mistakes are bounded.** Every AI failure was caught within hours, fixed, documented, and prevented from recurring. The blast radius of each mistake was limited to operator time, not production data loss.

## Assumptions

- The operator remains technically capable and available to catch AI blind spots
- The ADR corpus continues to be maintained, preventing regression to undocumented tribal knowledge
- AI capabilities continue to improve, potentially reducing the blind spots documented in ADR-056
- The project scope remains within one person's cognitive load
- The business does not require 24/7 on-call engineering support that a solo operator cannot provide

## Freshness Marker

- **Captured:** 2026-04-13
- **Stale when:** the platform's complexity exceeds one person's cognitive load, the operator is no longer available to verify AI output, the business requires dedicated on-call engineering, or AI capabilities improve to the point where the blind spots in ADR-056 are eliminated (making this comparison moot).
