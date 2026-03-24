# ADR-020: Gorgias Secrets Stay in SSM, Not Secrets Manager

**Status:** Accepted
**Date:** 2026-03-23

---

## Context

When adding Gorgias as the second vendor, we evaluated whether Gorgias credentials (email + API key) should live in AWS Secrets Manager instead of SSM Parameter Store. The argument for Secrets Manager: centralize the credential in one place so a key rotation only requires one update, and leverage built-in rotation Lambdas.

## Decision

**Keep Gorgias secrets in SSM Parameter Store**, consistent with Shopify and the existing convention (ADR-011).

### Why

1. **The credential is already centralized.** All Gorgias streams read from the same SSM path (`/data-streams/{env}/gorgias/api_key`). Adding `gorgias-customers` later doesn't create a second copy — the client reads one path regardless of which stream instantiates it.

2. **Gorgias API keys don't auto-rotate.** There is no Gorgias API to programmatically generate or rotate keys. You regenerate them manually in the Gorgias dashboard. Secrets Manager's rotation Lambda feature provides no value here.

3. **Blast radius is vendor-bounded, not storage-bounded.** Whether the key is in SSM or Secrets Manager, if it goes bad, every Gorgias stream breaks. The failure domain is "all things Gorgias," not "all things in this secret store." Moving to Secrets Manager doesn't reduce blast radius.

4. **Consistency beats correctness-at-the-margin.** Shopify uses SSM. Mixing SSM (Shopify) and Secrets Manager (Gorgias) for the same access pattern adds cognitive overhead and splits the operational runbook for zero practical benefit.

5. **Cost.** SSM SecureString is free. Secrets Manager is $0.40/secret/month + API call charges. Trivial individually, but unnecessary.

### When to revisit

Move a vendor to Secrets Manager **if and only if**:

- The vendor supports OAuth with refresh tokens that can be rotated programmatically, OR
- We add a vendor with short-lived credentials that benefit from automatic rotation

At that point, migrate that specific vendor's secrets — don't backport to vendors with static keys.

## SSM path convention (unchanged from ADR-011)

```
/data-streams/{env}/gorgias/email      # Gorgias account email (Basic auth)
/data-streams/{env}/gorgias/api_key    # Gorgias REST API key (Basic auth)
```

All Gorgias stream clients read these two paths. Rotating = update the SSM values + redeploy Lambdas (or wait for cold start cache expiry).

## Alternatives Rejected

### AWS Secrets Manager (single secret with email + key as JSON)
Rejected. No programmatic rotation available for Gorgias. Adds cost and a second secrets access pattern for no functional benefit.

### Secrets Manager for all vendors (migrate Shopify too)
Rejected. Would require changing Shopify client code, Terraform, and IAM policies. Shopify's access token is also a static key with no auto-rotation API. All pain, no gain.

## Consequences

- Gorgias credentials follow the same SSM pattern as all other vendors.
- One operational runbook for secret management across the platform.
- If Gorgias key is compromised: update one SSM param, redeploy Lambdas.
- Future vendors with OAuth/refresh tokens get their own Secrets Manager ADR at that time.
