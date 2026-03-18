"""Tests for raw → canonical transforms."""

from datetime import datetime, timezone
from decimal import Decimal

import pytest

from schemas.canonical.shopify.transforms import transform_shopify_order
from schemas.raw.shopify.order import ShopifyOrderRaw, ShopifyOrdersPageRaw
from tests.conftest import load_all_order_fixtures, load_fixture


class TestRawModelParsing:
    """Raw model should parse all fixtures without error (permissive)."""

    def test_parse_order_1(self):
        data = load_fixture("shopify/orders/order_1.json")
        order = ShopifyOrderRaw(**data)
        assert order.id == 5678901234
        assert order.email == "alice@example.com"
        assert len(order.line_items) == 2

    def test_parse_order_2(self):
        data = load_fixture("shopify/orders/order_2.json")
        order = ShopifyOrderRaw(**data)
        assert order.id == 5678901235
        assert order.fulfillment_status is None

    def test_parse_order_3_with_extra_fields(self):
        """Order 3 has an extra field — raw model should accept it."""
        data = load_fixture("shopify/orders/order_3.json")
        order = ShopifyOrderRaw(**data)
        assert order.id == 5678901236
        assert order.cancelled_at is not None

    def test_parse_orders_page(self):
        orders = load_all_order_fixtures()
        page = ShopifyOrdersPageRaw(orders=orders)
        assert len(page.orders) == 3


class TestTransform:
    """Transform should produce correct canonical output."""

    def test_transform_order_1(self):
        raw = ShopifyOrderRaw(**load_fixture("shopify/orders/order_1.json"))
        canonical = transform_shopify_order(raw, "teststore")

        assert canonical.id == 5678901234
        assert canonical.store_id == "teststore"
        assert canonical.order_number == "1042"
        assert canonical.email == "alice@example.com"
        assert canonical.total_price == Decimal("149.99")
        assert canonical.currency == "USD"
        assert canonical.tags == ["vip", "repeat-buyer"]
        assert canonical.note == "Please gift wrap"
        assert isinstance(canonical.updated_at, datetime)
        assert len(canonical.line_items) == 2
        assert canonical.line_items[0].sku == "OCT-BLK-M"
        assert canonical.shipping_address.city == "Portland"
        assert canonical.billing_address.country_code == "US"

    def test_transform_order_with_nulls(self):
        raw = ShopifyOrderRaw(**load_fixture("shopify/orders/order_2.json"))
        canonical = transform_shopify_order(raw, "teststore")

        assert canonical.fulfillment_status is None
        assert canonical.billing_address is None
        assert canonical.tags == []  # empty string → empty list

    def test_transform_cancelled_order(self):
        raw = ShopifyOrderRaw(**load_fixture("shopify/orders/order_3.json"))
        canonical = transform_shopify_order(raw, "teststore")

        assert canonical.cancelled_at is not None
        assert canonical.closed_at is not None
        assert canonical.currency == "CAD"

    def test_transform_is_deterministic(self):
        """Same input → same output, always."""
        raw = ShopifyOrderRaw(**load_fixture("shopify/orders/order_1.json"))
        result1 = transform_shopify_order(raw, "teststore")
        result2 = transform_shopify_order(raw, "teststore")
        assert result1.model_dump() == result2.model_dump()
