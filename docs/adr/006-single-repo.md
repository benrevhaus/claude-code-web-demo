# ADR-006: Single Repo Until Team Scale

**Status:** Accepted
**Date:** 2026-03-17

---

## Context

Should infrastructure (Terraform), application code (Python), stream definitions (YAML), and schemas (Pydantic) live in one repo or multiple?

## Decision

**Single repo.** Everything in one repository until we have 3+ engineers working concurrently.

### Repo structure:

```
data-streams/
├── infra/                     # Terraform
│   ├── modules/
│   ├── environments/
│   └── shared/
├── streams/                   # Stream YAML definitions
├── schemas/                   # Pydantic models
│   ├── raw/
│   └── canonical/
├── src/                       # Lambda code
│   ├── lambdas/
│   └── shared/
├── tests/
├── docs/
├── runbooks/
├── CLAUDE.md
└── README.md
```

### Why single repo works now

- One engineer = zero coordination overhead
- Atomic commits across infra + code + config
- Stream definition + schema + Terraform wiring in one PR
- CI/CD pipeline is simple: one repo, one pipeline
- AI assistants can see the full context in one repo

### When to split

Split into separate repos **only when**:
- 3+ engineers are regularly blocked on merge conflicts in unrelated areas
- Deploy cadence for infra vs application code diverges significantly
- Compliance requires separate access controls for infrastructure

**Expected split (if it happens):**
- `data-streams-infra` — Terraform modules and environment configs
- `data-streams-app` — Lambda code, schemas, stream definitions

Stream definitions and schemas should stay with application code, not infrastructure, because they change together.

## Alternatives Rejected

### Separate repos from day one
Rejected. Creates coordination overhead (cross-repo PRs, version pinning, CI complexity) with zero benefit for a solo engineer.

### Monorepo with Nx/Turborepo tooling
Rejected. Over-tooling. The repo is small enough that `make` or simple shell scripts handle builds.

## Consequences

- One CI/CD pipeline for everything
- One `terraform apply` can deploy infra + code changes together
- Team onboarding is simpler — clone one repo, see everything
- Must be disciplined about directory boundaries (don't let concerns bleed)
