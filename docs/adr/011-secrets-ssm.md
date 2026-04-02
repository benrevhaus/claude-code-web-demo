# ADR-011: Centralized Secret Storage

**Status:** Accepted
**Date:** 2026-03-17

## Context

The platform requires access to external API credentials, database credentials, and webhook secrets without exposing those values in code or deployment state.

## Decision

Use a centralized secret-management system with encrypted values and tightly scoped runtime access.

## Invariants

- Secret values are not committed to the repo
- Secret values are not stored in infrastructure state as real production values
- Runtime services read only the secrets they require
- Secret access is mediated by explicit permissions
- Detailed path conventions, tooling commands, and provider-specific setup live in restricted ops docs
