"""Permissive raw model for Shopify Order API responses.

This model accepts the full vendor payload without strict validation.
extra="allow" ensures we never fail on unknown fields from Shopify.
"""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, model_validator


def _gid_to_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        tail = value.rsplit("/", 1)[-1]
        try:
            return int(tail)
        except ValueError:
            return None
    return None


class ShopifyMoneyRaw(BaseModel):
    model_config = ConfigDict(extra="allow")

    amount: Optional[str] = None
    currency_code: Optional[str] = None


class ShopifyAddressRaw(BaseModel):
    model_config = ConfigDict(extra="allow")

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    address1: Optional[str] = None
    address2: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    province_code: Optional[str] = None
    country: Optional[str] = None
    country_code: Optional[str] = None
    zip: Optional[str] = None
    phone: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_graphql_address(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        if "country_code" not in normalized and "countryCodeV2" in normalized:
            normalized["country_code"] = normalized.get("countryCodeV2")
        return normalized


class ShopifyLineItemRaw(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[int] = None
    title: Optional[str] = None
    quantity: Optional[int] = None
    price: Optional[str] = None
    sku: Optional[str] = None
    variant_id: Optional[int] = None
    product_id: Optional[int] = None
    vendor: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_graphql_line_item(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        normalized = dict(data)
        variant = normalized.get("variant") or {}
        product = variant.get("product") or {}
        original_price = normalized.get("originalUnitPriceSet") or {}
        shop_money = original_price.get("shopMoney") or {}

        normalized["id"] = _gid_to_int(normalized.get("id")) or normalized.get("id")
        normalized["title"] = normalized.get("title") or normalized.get("name")
        normalized["variant_id"] = _gid_to_int(normalized.get("variant_id")) or _gid_to_int(variant.get("id"))
        normalized["product_id"] = _gid_to_int(normalized.get("product_id")) or _gid_to_int(product.get("id"))
        if normalized.get("price") is None:
            normalized["price"] = shop_money.get("amount")
        return normalized


class ShopifyOrderRaw(BaseModel):
    """Raw Shopify order — permissive, allows extra fields."""

    model_config = ConfigDict(extra="allow")

    id: int
    order_number: Optional[int] = None
    name: Optional[str] = None
    email: Optional[str] = None
    financial_status: Optional[str] = None
    fulfillment_status: Optional[str] = None
    total_price: Optional[str] = None
    subtotal_price: Optional[str] = None
    total_tax: Optional[str] = None
    total_discounts: Optional[str] = None
    currency: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    cancelled_at: Optional[str] = None
    closed_at: Optional[str] = None
    tags: Optional[str] = None
    note: Optional[str] = None
    line_items: Optional[list[ShopifyLineItemRaw]] = None
    shipping_address: Optional[ShopifyAddressRaw] = None
    billing_address: Optional[ShopifyAddressRaw] = None
    customer: Optional[dict[str, Any]] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_graphql_order(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        if "currentTotalPriceSet" not in data and "displayFinancialStatus" not in data and "lineItems" not in data:
            return data

        normalized = dict(data)
        total_price_set = normalized.get("currentTotalPriceSet") or {}
        shop_money = total_price_set.get("shopMoney") or {}
        line_items = normalized.get("lineItems") or {}
        shipping_address = normalized.get("shippingAddress")
        billing_address = normalized.get("billingAddress")

        normalized["id"] = _gid_to_int(normalized.get("id")) or normalized.get("id")
        if normalized.get("order_number") is None and normalized.get("name"):
            stripped = str(normalized["name"]).lstrip("#")
            try:
                normalized["order_number"] = int(stripped)
            except (ValueError, TypeError):
                pass
        normalized["financial_status"] = normalized.get("financial_status") or normalized.get("displayFinancialStatus")
        normalized["fulfillment_status"] = normalized.get("fulfillment_status") or normalized.get("displayFulfillmentStatus")
        normalized["total_price"] = normalized.get("total_price") or shop_money.get("amount")
        normalized["currency"] = normalized.get("currency") or shop_money.get("currencyCode")
        normalized["created_at"] = normalized.get("created_at") or normalized.get("createdAt")
        normalized["updated_at"] = normalized.get("updated_at") or normalized.get("updatedAt")
        normalized["cancelled_at"] = normalized.get("cancelled_at") or normalized.get("cancelledAt")
        normalized["closed_at"] = normalized.get("closed_at") or normalized.get("closedAt")
        normalized["shipping_address"] = normalized.get("shipping_address") or shipping_address
        normalized["billing_address"] = normalized.get("billing_address") or billing_address

        if isinstance(normalized.get("tags"), list):
            normalized["tags"] = ", ".join(normalized["tags"])

        if isinstance(line_items, dict) and "edges" in line_items:
            normalized["line_items"] = [edge.get("node", {}) for edge in line_items.get("edges", [])]

        return normalized


class ShopifyOrdersPageRaw(BaseModel):
    """A page of orders from the Shopify API (REST or parsed from GraphQL)."""

    model_config = ConfigDict(extra="allow")

    orders: list[ShopifyOrderRaw] = []

    @model_validator(mode="before")
    @classmethod
    def normalize_graphql_page(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if "orders" in data:
            return data

        orders = (
            data.get("data", {})
            .get("orders", {})
            .get("edges", [])
        )
        return {"orders": [edge.get("node", {}) for edge in orders]}
