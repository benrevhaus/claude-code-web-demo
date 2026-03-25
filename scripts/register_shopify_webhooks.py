#!/usr/bin/env python3
"""Register Shopify webhook subscriptions via GraphQL Admin API.

Reads the API Gateway endpoint URL and registers webhook subscriptions
for all topics declared in the stream YAML configs.

Idempotent — checks existing subscriptions before creating new ones.

Usage:
    python scripts/register_shopify_webhooks.py \
        --store-id mystore.myshopify.com \
        --api-url https://abc123.execute-api.us-east-1.amazonaws.com

Env vars:
    SHOPIFY_ACCESS_TOKEN  — Shopify Admin API access token
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Map stream topic -> webhook URL topic (slashes to hyphens for path params)
WEBHOOK_TOPICS = {
    "orders/create": "orders-create",
    "orders/updated": "orders-updated",
    "customers/create": "customers-create",
    "customers/update": "customers-update",
    "customers/delete": "customers-delete",
    "refunds/create": "refunds-create",
}

LIST_QUERY = """
query {
  webhookSubscriptions(first: 50) {
    edges {
      node {
        id
        topic
        endpoint {
          ... on WebhookHttpEndpoint {
            callbackUrl
          }
        }
      }
    }
  }
}
""".strip()

CREATE_MUTATION = """
mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $url: URL!) {
  webhookSubscriptionCreate(
    topic: $topic
    webhookSubscription: {
      callbackUrl: $url
      format: JSON
    }
  ) {
    webhookSubscription {
      id
      topic
    }
    userErrors {
      field
      message
    }
  }
}
""".strip()


def graphql_request(store_domain: str, access_token: str, query: str, variables: dict | None = None) -> dict:
    payload = {"query": query}
    if variables:
        payload["variables"] = variables

    request = Request(
        f"https://{store_domain}/admin/api/2024-01/graphql.json",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": access_token,
        },
        method="POST",
    )

    with urlopen(request, timeout=30) as response:
        return json.loads(response.read())


def list_existing_webhooks(store_domain: str, access_token: str) -> dict[str, str]:
    """Returns {topic: callback_url} for existing subscriptions."""
    result = graphql_request(store_domain, access_token, LIST_QUERY)
    existing: dict[str, str] = {}
    for edge in result.get("data", {}).get("webhookSubscriptions", {}).get("edges", []):
        node = edge.get("node", {})
        topic = node.get("topic", "")
        endpoint = node.get("endpoint", {})
        callback = endpoint.get("callbackUrl", "")
        existing[topic] = callback
    return existing


def topic_to_graphql_enum(topic: str) -> str:
    """Convert 'orders/create' to 'ORDERS_CREATE'."""
    return topic.replace("/", "_").upper()


def register_webhooks(store_domain: str, access_token: str, api_url: str, dry_run: bool = False):
    print(f"Store: {store_domain}")
    print(f"API Gateway: {api_url}")
    print()

    # List existing
    existing = list_existing_webhooks(store_domain, access_token)
    print(f"Existing subscriptions: {len(existing)}")
    for topic, url in existing.items():
        print(f"  {topic} -> {url}")
    print()

    # Register missing
    for shopify_topic, url_topic in WEBHOOK_TOPICS.items():
        callback_url = f"{api_url}/webhooks/shopify/{url_topic}"
        graphql_topic = topic_to_graphql_enum(shopify_topic)

        if graphql_topic in existing:
            if existing[graphql_topic] == callback_url:
                print(f"  SKIP {shopify_topic} — already registered with correct URL")
                continue
            else:
                print(f"  WARN {shopify_topic} — registered with different URL: {existing[graphql_topic]}")
                print(f"       Expected: {callback_url}")
                # Don't auto-update — let the user decide

        if dry_run:
            print(f"  DRY-RUN: would register {shopify_topic} -> {callback_url}")
            continue

        print(f"  Registering {shopify_topic} -> {callback_url}...")
        result = graphql_request(
            store_domain,
            access_token,
            CREATE_MUTATION,
            variables={"topic": graphql_topic, "url": callback_url},
        )

        data = result.get("data", {}).get("webhookSubscriptionCreate", {})
        errors = data.get("userErrors", [])
        subscription = data.get("webhookSubscription")

        if errors:
            print(f"    ERROR: {errors}")
        elif subscription:
            print(f"    OK: id={subscription['id']}, topic={subscription['topic']}")
        else:
            print(f"    UNEXPECTED: {result}")

    print("\nDone.")


def main():
    parser = argparse.ArgumentParser(description="Register Shopify webhook subscriptions")
    parser.add_argument("--store-id", required=True, help="Shopify store domain (e.g., mystore.myshopify.com)")
    parser.add_argument("--api-url", required=True, help="API Gateway base URL")
    parser.add_argument("--access-token", default=os.environ.get("SHOPIFY_ACCESS_TOKEN"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.access_token:
        print("Error: Set SHOPIFY_ACCESS_TOKEN env var or use --access-token")
        sys.exit(1)

    domain = args.store_id if "." in args.store_id else f"{args.store_id}.myshopify.com"
    register_webhooks(domain, args.access_token, args.api_url.rstrip("/"), args.dry_run)


if __name__ == "__main__":
    main()
