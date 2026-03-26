# ADR-024: Stream Status Lifecycle — draft / ready / live

**Status:** Accepted
**Date:** 2026-03-26

---

## Context

The platform is designed so that schema/transform code and Terraform infrastructure are decoupled. Stream code (YAML config, raw/canonical schemas, transforms, pg_client methods, migrations) can be built and merged to main without deploying any infrastructure. This allows multiple streams to be developed in advance and launched individually when ready.

Without an explicit status marker, there's no way to tell which streams have complete code vs. which are deployed and running. An operator looking at the `streams/` directory can't distinguish "this is safe to launch" from "this is work in progress."

## Decision

Add a `status` field to each stream YAML with three values:

| Status | Meaning | What exists | What's missing |
|--------|---------|-------------|----------------|
| `draft` | Work in progress | Partial — YAML may exist but schemas/transforms/migration may be incomplete | Everything potentially |
| `ready` | Code complete, launch when you want | YAML, raw schema, canonical schema, transform, pg_client methods, schema registry entry, migration file | Terraform resources, SSM secrets (if new vendor), migration not yet run |
| `live` | Deployed and running | Everything | Nothing — data is flowing |

### In the YAML

```yaml
apiVersion: streams/v1
status: ready        # draft | ready | live

source: shopify
stream: customers
...
```

### In the code

`StreamConfig` model parses and validates the field via `StreamStatus` enum. `load_all_stream_configs()` accepts an optional `status_filter` parameter, though the handler currently loads all configs regardless of status (it only needs to find the one matching the event's `source#stream` key).

### Launch checklist: promoting ready → live

1. Run the migration: `psql "$CONN" -f migrations/00N_{resource}.sql`
2. Add Lambda + EventBridge + alarm to `infra/environments/prod-mvp/main.tf`
3. Set SSM secrets (if new vendor)
4. `terraform apply`
5. Smoke test: `aws lambda invoke ...`
6. Update YAML: `status: live`
7. Commit

## Consequences

- Any agent or operator can scan `streams/*.yaml` and immediately know the launch state of every stream
- `draft` streams can be merged to main without risk — they're just code, not infrastructure
- The Lambda zip contains all streams (draft, ready, live) but only live streams have EventBridge triggers firing
- Status changes are tracked in git history, providing an audit trail of when each stream went live
