"""Tests for runtime bootstrap helpers and production clients."""

from __future__ import annotations

import io
import json
from urllib.error import HTTPError

from src.shared.pg_client import PgClient
from src.shared.shopify_client import ShopifyOrdersClient, decode_cursor_state


class _FakeResponse:
    def __init__(self, payload: dict, status: int = 200, headers: dict | None = None):
        self._payload = payload
        self.status = status
        self.headers = headers or {}

    def read(self):
        return json.dumps(self._payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_pg_client_from_env_uses_connection_string(monkeypatch):
    calls = {}

    def fake_connect(conninfo):
        calls["conninfo"] = conninfo
        return object()

    monkeypatch.setenv("POSTGRES_CONNECTION_STRING", "postgresql://user:pass@localhost:5432/app")
    monkeypatch.setattr("src.shared.pg_client.psycopg2.connect", fake_connect)

    client = PgClient.from_env()
    _ = client.connection

    assert calls["conninfo"] == "postgresql://user:pass@localhost:5432/app"


def test_shopify_client_fetch_page_parses_orders_response(monkeypatch):
    payload = {
        "data": {
            "orders": {
                "edges": [
                    {"cursor": "cursor-1", "node": {"id": "gid://shopify/Order/1", "updatedAt": "2024-03-15T10:00:00Z"}},
                    {"cursor": "cursor-2", "node": {"id": "gid://shopify/Order/2", "updatedAt": "2024-03-15T10:05:00Z"}},
                ],
                "pageInfo": {"hasNextPage": True, "endCursor": "cursor-2"},
            }
        },
        "extensions": {
            "cost": {
                "requestedQueryCost": 15,
                "throttleStatus": {"currentlyAvailable": 35, "restoreRate": 10},
            }
        },
    }

    monkeypatch.setenv("SHOPIFY_ACCESS_TOKEN", "test-token")
    monkeypatch.setattr(
        "src.shared.shopify_client.urlopen",
        lambda request, timeout=30: _FakeResponse(
            payload,
            headers={"X-Shopify-Shop-Api-Call-Limit": "5/40"},
        ),
    )

    client = ShopifyOrdersClient()
    page = client.fetch_page(
        store_id="teststore",
        endpoint="orders",
        api_version="2024-01",
        cursor="2024-03-15T09:00:00Z",
        page_size=2,
    )

    assert page.status_code == 200
    assert page.record_count == 2
    assert page.has_more is True
    checkpoint, page_cursor = decode_cursor_state(page.next_cursor)
    assert checkpoint == "2024-03-15T09:00:00Z"
    assert page_cursor == "cursor-2"
    assert page.checkpoint_cursor == "2024-03-15T10:05:00Z"
    assert page.rate_limit_remaining == 35


def test_shopify_client_returns_retry_metadata_on_429(monkeypatch):
    monkeypatch.setenv("SHOPIFY_ACCESS_TOKEN", "test-token")

    def raise_429(request, timeout=30):
        raise HTTPError(
            url=request.full_url,
            code=429,
            msg="Too Many Requests",
            hdrs={"Retry-After": "2"},
            fp=io.BytesIO(b'{"errors":"rate limited"}'),
        )

    monkeypatch.setattr("src.shared.shopify_client.urlopen", raise_429)

    client = ShopifyOrdersClient()
    page = client.fetch_page(
        store_id="teststore.myshopify.com",
        endpoint="orders",
        api_version="2024-01",
        cursor="2024-03-15T09:00:00Z",
        page_size=2,
    )

    assert page.status_code == 429
    assert page.has_more is True
    checkpoint, page_cursor = decode_cursor_state(page.next_cursor)
    assert checkpoint == "2024-03-15T09:00:00Z"
    assert page_cursor is None
    assert page.checkpoint_cursor == "2024-03-15T09:00:00Z"
    assert page.rate_limit_remaining == 0
    assert page.rate_limit_reset_at is not None
