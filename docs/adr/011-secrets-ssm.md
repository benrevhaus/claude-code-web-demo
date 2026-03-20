# ADR-011: SSM Parameter Store for Secrets

**Status:** Accepted
**Date:** 2026-03-17

---

## Context

Lambda functions need access to Shopify API tokens, Postgres credentials, webhook secrets, and other sensitive values. Where do these live?

## Decision

**AWS SSM Parameter Store with SecureString type.**

### Path convention

```
/data-streams/{env}/{source}/{secret_name}

# Examples:
/data-streams/prod/shopify/access_token
/data-streams/prod/shopify/webhook_secret
/data-streams/prod/postgres/connection_string
```

### Access pattern

- Lambda reads secrets at cold start using `boto3` SSM client.
- Secrets are cached in the Lambda execution context (not re-read on every invocation).
- Lambda IAM role grants `ssm:GetParameter` on the specific paths it needs.

### Terraform's role

- Terraform creates the SSM parameter paths with placeholder values.
- **Terraform does NOT set the actual secret values.** Values are set manually via AWS Console or CLI. This prevents secrets from appearing in Terraform state files.

```hcl
resource "aws_ssm_parameter" "shopify_access_token" {
  name  = "/data-streams/${var.env}/shopify/access_token"
  type  = "SecureString"
  value = "PLACEHOLDER"  # Set manually after apply
  lifecycle {
    ignore_changes = [value]  # Don't overwrite manual changes
  }
}
```

## Alternatives Rejected

### AWS Secrets Manager
Rejected. Costs $0.40/secret/month + $0.05/10,000 API calls. SSM SecureString is free for standard tier. Secrets Manager's automatic rotation feature is not needed — our secrets don't rotate on a schedule.

### Environment variables on Lambda
Rejected. Visible in the Lambda console to anyone with Lambda read access. Can leak into logs if the function crashes with a stack trace. SSM with IAM provides proper access control.

### .env files in the repo
Rejected. Obvious security risk. No further discussion needed.

### HashiCorp Vault
Rejected. Massive operational overhead for a solo engineer. SSM Parameter Store is zero-ops.

## Consequences

- Every Lambda's IAM policy explicitly lists which SSM paths it can read.
- Secrets never appear in Terraform state, Lambda environment variables, or application logs.
- Rotating a secret = update the SSM parameter value + trigger Lambda redeployment (to clear cached value).
- The `PLACEHOLDER` pattern means `terraform apply` on a fresh environment requires a follow-up manual step to set real values. This is documented in the launch checklist.
