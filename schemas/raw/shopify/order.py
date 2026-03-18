"""Permissive raw model for Shopify Order API responses.

This model accepts the full vendor payload without strict validation.
extra="allow" ensures we never fail on unknown fields from Shopify.
"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


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


class ShopifyOrdersPageRaw(BaseModel):
    """A page of orders from the Shopify API (REST or parsed from GraphQL)."""

    model_config = ConfigDict(extra="allow")

    orders: list[ShopifyOrderRaw] = []
