# ADR-035: PII Boundary Enforcement in the Review Stream Architecture

**Status:** Accepted
**Date:** 2026-04-07

---

## Decision

PII in the review stream architecture is controlled by Postgres schema boundaries and role-based access, not by application-level filtering or column omission alone.

The specific boundaries are:

1. **Source-canonical tables are not readable by the broad analyst role.** The source schema contains raw vendor data including reviewer email addresses and full payload JSON that embeds email. No broad-access role receives SELECT on this schema.

2. **Published broad-access tables never contain identity-binding fields.** Email, normalized email, customer IDs, and source user references are excluded from every column and every JSONB container in the broad-access tables. This is enforced structurally — the publication SQL does not select these fields — and verified by tracing every JSONB dump to confirm no PII is embedded inside container columns.

3. **A restricted identity companion table holds private linkage fields.** Only a dedicated restricted role can read it. The broad analyst role has SELECT revoked on this table explicitly.

4. **Author display name is intentionally broad-access.** It is a storefront-visible field (e.g., "Jane D."), not a legal name or identity-binding key. The generalized contract spec designates it as a required broad-access field.

5. **Raw payload JSON in source-canonical tables contains PII.** The canonical model dump stored as JSONB includes email and name. This is acceptable because the source-canonical schema is not accessible to the broad analyst role.

## Intent

The review stream introduces the platform's first restricted identity companion table and its first schema-level access control boundary. This ADR records the PII boundary model so that:

- future review sources follow the same separation
- future roles are granted correctly
- JSONB payloads are treated with the same scrutiny as typed columns

## Constraints

- The generalized contract spec requires ~50 typed columns plus 4 JSONB containers on the broad-access table. Any of these could silently carry PII if the publication SQL is not carefully constructed.
- Source-canonical tables store full vendor payloads for debugging and migration convenience. These payloads inherently contain whatever the vendor sends, including email.
- Postgres does not support column-level GRANT/REVOKE that would cleanly restrict individual columns within a table. The practical enforcement boundary is schema + table level.
- The platform is operated by a solo CTO. Access control must be durable without continuous application-level enforcement across multiple consumers.

## Why

### 1. Schema-level enforcement is the only durable boundary

Application-level filtering can be bypassed by any new consumer, ad-hoc query tool, or leaked connection string. Schema-level GRANT/REVOKE survives all of these.

### 2. JSONB containers are a silent PII vector

A column named `metadata JSONB` looks harmless. If the publication SQL dumps a canonical model that includes email into that container, the broad-access table silently carries PII. Every JSONB write path must be traced to its source to confirm no identity-binding data is embedded.

### 3. Source-canonical tables must not be broadly readable

The initial implementation granted the broad analyst role SELECT on the source-canonical schema for convenience. This was caught during PII review and removed. The source-canonical layer exists for operator debugging and vendor reconciliation — it is not an analyst surface.

### 4. The restricted identity companion is load-bearing from day one

The companion table is not a future nice-to-have. It exists because downstream systems need private linkage keys on day one, and those keys must not widen the blast radius of the broad-access review table.

## Why-Not (Rejected Alternatives)

### Grant source-canonical tables to the broad analyst role and rely on analysts not querying email columns

Rejected because it treats access control as a social contract rather than a technical boundary. Any query tool, dashboard, or export that touches the source schema would expose PII.

### Store email only in the restricted companion, not in source-canonical tables

Rejected because the source-canonical layer must remain provider-shaped for vendor reconciliation. If the source sends email, the source-canonical table stores email. The protection is that the source schema is not broadly readable, not that PII is scrubbed from it.

### Use column-level REVOKE to hide email within a broadly readable source table

Rejected because Postgres column-level privileges are fragile in practice — they interact poorly with SELECT *, views, and some query tools. Schema-level boundaries are cleaner and more predictable.

### Omit raw_payload JSONB from source-canonical tables to avoid PII in JSONB

Rejected because raw_payload exists for migration convenience. The spec explicitly approves storing full raw JSON in source-canonical tables. The protection is schema-level access control, not payload scrubbing.

## Assumptions

- The broad analyst role (`data_reader`) is the default for analyst connections, dashboards, and downstream application queries against published review data and non-PII tables across all schemas.
- The operator role (`data_operator`) inherits `data_reader` and adds access to PII tables and source-canonical schemas. It is for pipeline debugging and oncall, not for downstream application consumers.
- Customer 360 must not connect as `data_operator`. When Customer 360 is built, a scoped `data_identity` role will be created with grants designed against its actual query needs — specifically the identity companion table and whatever customer/order fields it proves it requires. This role does not exist yet because its grants would be speculative.
- Source-canonical schemas are accessed only by operators, the ingestion pipeline itself, and the publication pass (which runs under the pipeline's own credentials, not the analyst role).
- Future review sources will follow the same schema-level boundary model.

## Tribal Context

- The PII leak was caught during self-review, not by a test. The initial implementation granted the broad analyst role full SELECT on the source-canonical schema because it seemed convenient for debugging. This is the exact mistake this ADR exists to prevent from recurring.
- JSONB containers are the highest-risk PII vector because they don't appear in column listings. The review explicitly traced every `json.dumps()` call path to verify that no JSONB field on a broad-access table contains email or identity-binding data.
- The `author_display_name` field was initially NULL in the broad-access table (a different bug — the source data wasn't being carried through). Fixing that required confirming it was the storefront display name, not a legal name or identity key.

## Freshness Marker

- **Captured:** 2026-04-07
- **Stale when:** the platform introduces column-level security (e.g., via row-level security policies or a different database engine), the broad analyst role is retired in favor of a different access model, or a future review source proves that the schema-level boundary is insufficient for its PII profile.
