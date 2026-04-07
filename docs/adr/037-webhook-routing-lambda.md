# ADR-037: Webhook Routing Lambda — Why Direct API Gateway to SQS Failed

**Status:** Accepted
**Date:** 2026-04-07

---

## Decision

Webhook ingestion uses a thin routing Lambda between API Gateway and SQS instead of a direct API Gateway-to-SQS integration.

The routing Lambda extracts request metadata (source, topic, authentication headers) from the HTTP request and forwards the payload to SQS with proper message attributes. The downstream webhook consumer reads these message attributes unchanged.

## Intent

The original design used a direct HTTP API integration with SQS (`SQS-SendMessage` subtype) to avoid an intermediate Lambda. This was architecturally cleaner — fewer moving parts, lower latency, lower cost. During production deployment, the direct integration proved impossible due to API Gateway limitations that are not surfaced during planning or in documentation.

This ADR records why the direct integration failed, what alternatives were evaluated, and why the routing Lambda was chosen.

## Constraints

- The webhook endpoint receives requests at `POST /webhooks/{source}/{topic}` where source and topic are path parameters.
- Authentication credentials arrive in HTTP headers (HMAC signatures, shared secrets).
- The downstream webhook consumer expects source, topic, HMAC, and secret as SQS message attributes — it routes and validates based on these.
- The SQS queue is shared across all webhook sources. Routing metadata must travel with each message.

## What Failed

The HTTP API `SQS-SendMessage` integration subtype does not support:

1. **Dynamic `MessageAttribute` values from path parameters or headers.** The dotted syntax (`MessageAttribute.source.StringValue = "$request.pathParameters.source"`) is rejected at creation time with a schema validation error.

2. **Removing the `DataType` suffix.** Even without the `DataType` keys, the `StringValue` keys alone are rejected for the same reason.

3. **A single `MessageAttributes` key with a JSON string value.** Passing the entire message attributes structure as a JSON blob is rejected as an invalid selection expression.

4. **String concatenation in `MessageBody`.** Combining multiple `$request.*` expressions into a single `MessageBody` value (e.g., pipe-delimited envelope) is rejected — only one expression is allowed per parameter.

Each of these was attempted in sequence during deployment. All four were rejected by the AWS API at resource creation time, not at request time. The Terraform provider does not validate these constraints during planning, so failures only appear during `terraform apply`.

## Why the Routing Lambda

The routing Lambda adds one component but solves the problem completely:

- It receives the full HTTP request from API Gateway (path parameters, headers, body) via the standard Lambda proxy integration, which works without restrictions.
- It extracts the four routing fields and sends to SQS with native `MessageAttributes` using the SQS SDK, which supports arbitrary attributes.
- The downstream webhook consumer is unchanged — it reads the same message attribute names it always expected.
- The Lambda is stateless, ~40 lines of Python, and runs in under 100ms.

## Why-Not (Rejected Alternatives)

### Keep the direct SQS integration and encode metadata in the message body

Rejected because the `SQS-SendMessage` integration does not allow string concatenation or multiple `$request.*` expressions in a single `MessageBody` parameter. Only one expression per parameter is supported. Even if it worked, it would require the webhook consumer to parse a custom envelope format, creating a non-standard contract between two infrastructure components.

### Switch from HTTP API (v2) to REST API (v1)

Rejected because REST API supports VTL request templates that could solve the attribute mapping problem, but it is significantly more expensive, heavier to configure, and would require rewriting the entire API Gateway module. The routing Lambda achieves the same result with less infrastructure change.

### Remove message attributes entirely and have the consumer infer routing from the payload

Rejected because webhook payloads from different sources have different structures. Inferring source and topic from payload inspection would couple the consumer to every vendor's payload format and eliminate the clean routing contract. The message attribute contract is correct — only the delivery mechanism needed to change.

### Use separate SQS queues per source/topic

Rejected because it would require one queue per webhook topic, one API Gateway route per queue, and the consumer would lose its single-queue fan-in model. The operational complexity is disproportionate to the problem being solved.

## Assumptions

- The routing Lambda's execution time (~50-100ms) and cold start (~200ms) are acceptable additions to webhook latency. Webhooks are not real-time — they are event notifications with retry semantics.
- The routing Lambda's cost is negligible. At typical webhook volumes (hundreds to low thousands per day), the Lambda cost is under $0.01/month.
- The routing Lambda does not need access to secrets, databases, or S3. Its only permission is `sqs:SendMessage` on the webhook queue.

## Tribal Context

- This failure was discovered during the first production deployment of the platform infrastructure. The direct SQS integration was part of the original Terraform design and had never been applied to a real AWS account.
- Four different parameter formats were attempted before concluding that the HTTP API `SQS-SendMessage` integration fundamentally cannot pass dynamic values from path parameters or headers into message attributes.
- The Terraform AWS provider does not surface this limitation during `terraform plan`. The error only appears during `terraform apply` when the API Gateway API is called. This means the constraint is invisible during code review and planning — it can only be caught by deployment.
- The routing Lambda was chosen partly because it required zero changes to the downstream webhook consumer. The consumer's message attribute contract was already correct and tested. Changing the consumer to parse a different format would have introduced risk in a component that was already working.

## Freshness Marker

- **Captured:** 2026-04-07
- **Stale when:** AWS adds support for dynamic `MessageAttribute` values in HTTP API `SQS-SendMessage` integrations (check the [Terraform provider issue #17348](https://github.com/hashicorp/terraform-provider-aws/issues/17348) for status), or the platform moves to a different webhook ingestion pattern (e.g., direct Lambda integration from API Gateway without SQS).
