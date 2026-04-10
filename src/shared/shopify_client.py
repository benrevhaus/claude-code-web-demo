"""Shopify GraphQL client for polling multiple resource types."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from src.shared.ssm import get_env_or_ssm

# ---------------------------------------------------------------------------
# GraphQL queries — one per resource type
# ---------------------------------------------------------------------------

ORDERS_QUERY = """
query FetchOrders($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, sortKey: UPDATED_AT, reverse: false, query: $query) {
    edges {
      cursor
      node {
        id
        name
        email
        displayFinancialStatus
        displayFulfillmentStatus
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        createdAt
        updatedAt
        cancelledAt
        closedAt
        tags
        note
        shippingAddress {
          firstName
          lastName
          address1
          address2
          city
          province
          provinceCode
          country
          countryCodeV2
          zip
          phone
        }
        billingAddress {
          firstName
          lastName
          address1
          address2
          city
          province
          provinceCode
          country
          countryCodeV2
          zip
          phone
        }
        lineItems(first: 100) {
          edges {
            node {
              id
              name
              quantity
              sku
              vendor
              variant {
                id
                product {
                  id
                }
              }
              originalUnitPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
        refunds(first: 10) {
          edges {
            node {
              id
              createdAt
              note
              totalRefundedSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              refundLineItems(first: 50) {
                edges {
                  node {
                    quantity
                    lineItem {
                      id
                      name
                      sku
                    }
                    subtotalSet {
                      shopMoney {
                        amount
                      }
                    }
                  }
                }
              }
            }
          }
        }
        transactions(first: 50) {
          edges {
            node {
              id
              kind
              status
              amountSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              gateway
              createdAt
              parentTransaction {
                id
              }
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
""".strip()

CUSTOMERS_QUERY = """
query FetchCustomers($first: Int!, $after: String, $query: String) {
  customers(first: $first, after: $after, sortKey: UPDATED_AT, reverse: false, query: $query) {
    edges {
      cursor
      node {
        id
        email
        firstName
        lastName
        phone
        state
        tags
        note
        verifiedEmail
        taxExempt
        createdAt
        updatedAt
        numberOfOrders
        amountSpent {
          amount
          currencyCode
        }
        defaultAddress {
          firstName
          lastName
          address1
          address2
          city
          province
          provinceCode
          country
          countryCodeV2
          zip
          phone
        }
        addresses {
          firstName
          lastName
          address1
          address2
          city
          province
          provinceCode
          country
          countryCodeV2
          zip
          phone
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
""".strip()

PRODUCTS_QUERY = """
query FetchProducts($first: Int!, $after: String, $query: String) {
  products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: false, query: $query) {
    edges {
      cursor
      node {
        id
        title
        handle
        status
        vendor
        productType
        tags
        bodyHtml
        createdAt
        updatedAt
        publishedAt
        variants(first: 50) {
          edges {
            node {
              id
              title
              sku
              barcode
              inventoryQuantity
              priceV2 {
                amount
                currencyCode
              }
              compareAtPriceV2 {
                amount
                currencyCode
              }
              weight
              weightUnit
            }
          }
        }
        images(first: 20) {
          edges {
            node {
              url
              altText
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
""".strip()

INVENTORY_QUERY = """
query FetchInventory($first: Int!, $after: String, $query: String) {
  inventoryItems(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        sku
        tracked
        createdAt
        updatedAt
        variant {
          id
          product {
            id
          }
        }
        inventoryLevels(first: 20) {
          edges {
            node {
              id
              quantities(names: ["available", "committed", "on_hand"]) {
                name
                quantity
              }
              location {
                id
                name
              }
              updatedAt
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
""".strip()

# Map stream name -> (query, response root key in data.{key}.edges)
STREAM_QUERIES: dict[str, tuple[str, str]] = {
    "orders": (ORDERS_QUERY, "orders"),
    "customers": (CUSTOMERS_QUERY, "customers"),
    "products": (PRODUCTS_QUERY, "products"),
    "inventory": (INVENTORY_QUERY, "inventoryItems"),
}


@dataclass
class ShopifyPage:
    body: dict
    status_code: int
    record_count: int
    next_cursor: str | None
    checkpoint_cursor: str | None
    has_more: bool
    rate_limit_remaining: int | None = None
    rate_limit_reset_at: datetime | None = None


def encode_cursor_state(checkpoint: str | None, page_cursor: str | None = None) -> str | None:
    if checkpoint is None and page_cursor is None:
        return None
    return json.dumps({"checkpoint": checkpoint, "page_cursor": page_cursor}, separators=(",", ":"))


def decode_cursor_state(cursor: str | None) -> tuple[str | None, str | None]:
    if not cursor:
        return None, None
    try:
        payload = json.loads(cursor)
    except json.JSONDecodeError:
        return cursor, None
    if not isinstance(payload, dict):
        return cursor, None
    return payload.get("checkpoint"), payload.get("page_cursor")


class ShopifyGraphQLClient:
    """Generic Shopify GraphQL Admin API client — works for any resource type.

    Authentication: supports two modes.
      1. Client credentials (2026 standard): client_id + client_secret → 24h rotating token
      2. Legacy static token: shpat_ access token (backward compatible)

    The client auto-detects which mode to use based on which SSM parameters exist.
    If client_id + client_secret are set, it uses client credentials with auto-refresh.
    If only access_token is set, it uses the static token (legacy).
    """

    def __init__(self, stream: str = "orders", access_token: str | None = None):
        env = os.environ.get("ENV", "dev")
        prefix = os.environ.get("PARAM_PREFIX", "data-streams")

        self._client_id: str | None = None
        self._client_secret: str | None = None
        self._access_token: str | None = access_token
        self._token_expires_at: datetime | None = None

        if not access_token:
            # Try client credentials first (2026 standard)
            try:
                self._client_id = get_env_or_ssm(
                    "SHOPIFY_CLIENT_ID", f"/{prefix}/{env}/shopify/client_id"
                )
                self._client_secret = get_env_or_ssm(
                    "SHOPIFY_CLIENT_SECRET", f"/{prefix}/{env}/shopify/client_secret"
                )
            except Exception:
                # Fall back to legacy static token
                access_token_param = f"/{prefix}/{env}/shopify/access_token"
                self._access_token = get_env_or_ssm("SHOPIFY_ACCESS_TOKEN", access_token_param)

        if stream not in STREAM_QUERIES:
            raise ValueError(f"Unknown Shopify stream: {stream}. Available: {list(STREAM_QUERIES)}")
        self._query, self._root_key = STREAM_QUERIES[stream]

    def _get_access_token(self, store_domain: str) -> str:
        """Get a valid access token, refreshing via client credentials if needed."""
        # If using legacy static token, return it directly
        if self._client_id is None:
            return self._access_token

        # If we have a valid token that hasn't expired, reuse it
        # Refresh 5 minutes before expiry to avoid edge cases
        if self._access_token and self._token_expires_at:
            if datetime.now(timezone.utc) < self._token_expires_at - timedelta(minutes=5):
                return self._access_token

        # Exchange client credentials for a new token
        payload = (
            f"grant_type=client_credentials"
            f"&client_id={self._client_id}"
            f"&client_secret={self._client_secret}"
        )
        request = Request(
            f"https://{store_domain}/admin/oauth/access_token",
            data=payload.encode("utf-8"),
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "data-streams/1.0",
            },
            method="POST",
        )
        with urlopen(request, timeout=15) as response:
            body = json.loads(response.read())
            self._access_token = body["access_token"]
            expires_in = body.get("expires_in", 86399)
            self._token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

        return self._access_token

    def fetch_page(
        self,
        *,
        store_id: str,
        endpoint: str,
        api_version: str,
        cursor: str | None,
        page_size: int,
    ) -> ShopifyPage:
        del endpoint  # GraphQL operation is stream-specific in the query body.

        checkpoint, page_cursor = decode_cursor_state(cursor)
        domain = store_id if "." in store_id else f"{store_id}.myshopify.com"
        query_filter = f"updated_at:>={checkpoint}" if checkpoint else None
        access_token = self._get_access_token(domain)

        payload = {
            "query": self._query,
            "variables": {
                "first": page_size,
                "after": page_cursor,
                "query": query_filter,
            },
        }
        request = Request(
            f"https://{domain}/admin/api/{api_version}/graphql.json",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": access_token,
                "User-Agent": "data-streams/1.0",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=30) as response:
                body = json.loads(response.read())
                status_code = response.status
        except HTTPError as exc:
            body = self._read_error_body(exc)
            if exc.code == 429:
                retry_after = int(exc.headers.get("Retry-After", "1"))
                return ShopifyPage(
                    body=body,
                    status_code=429,
                    record_count=0,
                    next_cursor=encode_cursor_state(checkpoint, page_cursor),
                    checkpoint_cursor=checkpoint,
                    has_more=True,
                    rate_limit_remaining=0,
                    rate_limit_reset_at=datetime.now(timezone.utc) + timedelta(seconds=retry_after),
                )
            if 500 <= exc.code < 600:
                raise
            raise RuntimeError(f"Shopify GraphQL API returned {exc.code}: {body}")

        if body.get("errors"):
            raise RuntimeError(f"Shopify GraphQL errors: {body['errors']}")

        resource = body.get("data", {}).get(self._root_key, {})
        edges = resource.get("edges", [])
        page_info = resource.get("pageInfo", {})
        last_updated_at = edges[-1]["node"].get("updatedAt") if edges else checkpoint

        next_cursor = None
        if page_info.get("hasNextPage") and page_info.get("endCursor"):
            next_cursor = encode_cursor_state(checkpoint, page_info["endCursor"])

        cost = body.get("extensions", {}).get("cost", {})
        throttle = cost.get("throttleStatus", {})

        return ShopifyPage(
            body=body,
            status_code=status_code,
            record_count=len(edges),
            next_cursor=next_cursor,
            checkpoint_cursor=last_updated_at,
            has_more=bool(page_info.get("hasNextPage")),
            rate_limit_remaining=throttle.get("currentlyAvailable"),
            rate_limit_reset_at=self._build_rate_limit_reset_at(cost),
        )

    @staticmethod
    def _build_rate_limit_reset_at(cost: dict) -> datetime | None:
        throttle = cost.get("throttleStatus", {})
        currently_available = throttle.get("currentlyAvailable")
        restore_rate = throttle.get("restoreRate")
        requested_cost = cost.get("requestedQueryCost")
        if currently_available is None or restore_rate in (None, 0) or requested_cost is None:
            return None
        if requested_cost <= currently_available:
            return None
        seconds = (requested_cost - currently_available) / restore_rate
        return datetime.now(timezone.utc) + timedelta(seconds=max(seconds, 0))

    @staticmethod
    def _read_error_body(exc: HTTPError) -> dict:
        try:
            return json.loads(exc.read())
        except Exception:
            return {"error": str(exc)}


# Backwards-compatible alias
ShopifyOrdersClient = ShopifyGraphQLClient


def get_shopify_client(stream: str, access_token: str | None = None) -> ShopifyGraphQLClient:
    """Factory: return a client configured for the given stream."""
    return ShopifyGraphQLClient(stream=stream, access_token=access_token)
