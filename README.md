# Data Streams

Serverless data ingestion platform for pulling vendor data into S3, validating and transforming it, and writing canonical records to Postgres.

The architecture, contracts, and operational guidance live under [docs/README.md](/Users/codehaus/projects/data-streams/docs/README.md). Start there before changing stream behavior.

## Setup

Requires Python 3.12+.

Install dependencies:

```bash
python3 -m pip install -e '.[dev]'
```

Run tests:

```bash
python3 -m pytest -q
```

## Repo Layout

- `src/` application code for shared libraries and Lambda handlers
- `schemas/` raw and canonical Pydantic models plus transforms
- `streams/` YAML stream definitions
- `infra/` Terraform modules and environment configs
- `docs/` ADRs, specs, and runbooks

## Current Golden Path

The implemented golden path is Shopify orders:

- `streams/shopify-orders.yaml`
- `src/lambdas/poller/handler.py`
- `src/lambdas/processor/handler.py`
- `src/lambdas/finalizer/handler.py`

Use the local end-to-end test to verify the path:

```bash
python3 -m pytest tests/test_e2e_local.py -q
```
