# ADR-010: Python 3.12 as Sole Runtime

**Status:** Accepted
**Date:** 2026-03-17

---

## Context

What language should the Lambda functions be written in?

## Decision

**Python 3.12. One language. No polyglot.**

### Why Python

1. **Shopify ecosystem.** Best Shopify API libraries are in Python.
2. **AWS SDK.** `boto3` is the most complete and well-documented AWS SDK.
3. **Pydantic.** Our schema validation strategy depends on Pydantic, which is Python-native.
4. **Hiring pool.** Python has the widest hiring pool for data/backend engineers.
5. **AI generation.** Python is the language AI assistants are most reliable at generating.
6. **Lambda cold start.** Python cold starts are acceptable for our workload (not latency-critical).

### Key libraries

| Library | Purpose |
|---------|---------|
| `pydantic` | All data contracts and schema validation |
| `boto3` | S3, DynamoDB, SQS, SSM, CloudWatch |
| `psycopg2-binary` or `asyncpg` | Postgres access |
| `httpx` | HTTP client for Shopify API (async-capable, modern) |
| `structlog` | Structured logging |

### Lambda packaging

- One Lambda Layer for shared dependencies (pydantic, httpx, structlog, psycopg2-binary)
- Individual Lambda deployment packages contain only handler code + shared modules
- Packaged via `terraform archive_file` or a simple `make zip` target

## Alternatives Rejected

### TypeScript/Node.js
Rejected. Faster cold starts but weaker data validation ecosystem (zod exists but is less mature than pydantic for our use case). Smaller hiring pool for data engineering roles.

### Go
Rejected. Fastest cold starts but much more verbose for data transformation code. Smaller ecosystem for API client libraries. Higher barrier for future data-focused engineers.

### Polyglot (TypeScript for webhooks, Python for processing)
Rejected. Two languages = two dependency chains, two build processes, two sets of expertise needed. The minor cold-start benefit for webhook receivers doesn't justify the operational overhead.

## Consequences

- All shared code is importable Python modules under `src/shared/`.
- Testing uses pytest.
- Linting uses ruff (fast, comprehensive Python linter).
- Type hints are used throughout for IDE support and AI readability, but we don't enforce mypy strictly.
