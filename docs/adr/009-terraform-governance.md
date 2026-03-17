# ADR-009: Terraform Module Strategy

**Status:** Accepted
**Date:** 2026-03-17

---

## Context

The platform infrastructure needs to be governed through Terraform. The risk is either under-structuring (chaos inline) or over-structuring (module maze that takes longer to maintain than the application itself).

## Decision

### Three Terraform modules, one environment pattern

**Modules:**

| Module | Responsibility | Changes when |
|--------|---------------|--------------|
| `stream-platform` | Core infrastructure: S3 bucket, DynamoDB table, Postgres, IAM base roles, VPC, SQS, SNS, API Gateway base | Rarely. Infrastructure evolution. |
| `stream-poller` | One Step Function + EventBridge rule for a polling stream. Parameterized by stream config. | Never (template). Instantiated per stream. |
| `stream-webhook` | One API Gateway route + webhook-specific config for a webhook stream. | Never (template). Instantiated per stream. |

**Environment pattern:** Directory per environment, not workspaces.

```
infra/
├── modules/
│   ├── stream-platform/
│   ├── stream-poller/
│   └── stream-webhook/
├── environments/
│   ├── dev/
│   │   └── main.tf      # Reads stream YAMLs, calls modules
│   └── prod/
│       └── main.tf
└── shared/
    └── state.tf          # S3 backend config
```

### The critical trick: Terraform reads stream YAMLs

```hcl
locals {
  stream_files    = fileset("${path.root}/../../../streams", "*.yaml")
  streams         = { for f in local.stream_files :
                      trimsuffix(f, ".yaml") => yamldecode(file(".../${f}")) }
  polling_streams = { for k, v in local.streams : k => v
                      if contains(["graphql", "rest", "graphql+webhook"], v.mode) }
  webhook_streams = { for k, v in local.streams : k => v
                      if contains(["webhook", "graphql+webhook"], v.mode) }
}

module "poller" {
  for_each      = local.polling_streams
  source        = "../../modules/stream-poller"
  stream_config = each.value
  ...
}
```

**Adding a new stream = add a YAML file + terraform apply.** No new HCL.

### Step Function ASL template

The Step Function definition is a **single parameterized ASL JSON template** inside the `stream-poller` module. It uses `templatefile()` to inject stream-specific values (timeouts, max pages, etc.). Not one hand-written ASL per stream.

### State management

- One S3 state backend per environment
- DynamoDB lock table for state locking
- No Terraform workspaces (hidden state that confuses future engineers)
- No remote module versioning yet (everything in-repo)

### Preventing sprawl

| Rule | Why |
|------|-----|
| No hand-written ASL per stream | One template, parameterized |
| No hand-written HCL per stream | `for_each` over stream YAMLs |
| No Terraform workspaces | Directory-per-env is explicit |
| No remote module registry | Over-engineering for one repo |
| Lambda code deployed via `archive_file` | Simple, no separate build pipeline |

## Alternatives Rejected

### Terraform workspaces for environments
Rejected. Workspaces hide which environment you're operating on behind a state switch. Directory-per-environment makes it explicit. Future engineers can't accidentally apply to the wrong environment.

### CDK or Pulumi
Rejected. Terraform is the most widely understood IaC tool, has the largest hiring pool, and doesn't require a programming language runtime for infrastructure. CDK's synthesized CloudFormation is harder to debug.

### Separate Terraform repo
Rejected (see [ADR-006](006-single-repo.md)). Infrastructure and application code change together during stream additions.

### One giant main.tf with no modules
Rejected. Modules provide reusable templates. Without them, every new stream would require copying and pasting HCL blocks.

## When to evolve this

- **Add module versioning** only if/when the repo splits (Phase 3+).
- **Add a CI/CD plan-and-apply pipeline** in Phase 2 (plan on PR, apply on merge).
- **Add remote state data sources** only if repos split and need cross-referencing.

## Consequences

- Terraform plan should always be reviewed before apply.
- Adding a stream is a YAML change + terraform apply, not an infrastructure design exercise.
- The modules are opinionated — they don't expose every possible knob. If a stream needs something the module doesn't support, extend the module, don't work around it.
