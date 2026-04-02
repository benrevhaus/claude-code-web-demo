# ADR-023: Single Production Environment

**Status:** Accepted
**Date:** 2026-03-26

## Context

The platform's operating model prioritizes low-overhead infrastructure and controlled direct changes over maintaining multiple long-lived environments.

## Decision

Run a single production environment by default and create temporary isolated environments only when a change justifies the extra operational cost.

## Invariants

- The canonical deployed environment is production
- Additional environments are temporary and exception-based
- Safety comes from architecture, review, and reversibility rather than permanent duplicate environments
- Docs and scripts should assume one primary deployed environment unless explicitly stated otherwise
- Detailed cost assumptions and provider-specific environment layout live in restricted ops docs
