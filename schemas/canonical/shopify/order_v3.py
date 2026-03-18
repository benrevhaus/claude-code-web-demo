"""Strict canonical model for Shopify Orders (v3).

This is our typed, validated representation. The processor transforms
raw → canonical before upserting to Postgres.
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class LineItem(BaseModel):
    id: Optional[int] = None
    title: Optional[str] = None
    quantity: int = 0
    price: Optional[Decimal] = None
    sku: Optional[str] = None
    variant_id: Optional[int] = None
    product_id: Optional[int] = None
    vendor: Optional[str] = None


class Address(BaseModel):
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


class ShopifyOrderV3(BaseModel):
    """Source canonical Shopify order — strict types, validated."""

    id: int
    store_id: str
    order_number: Optional[str] = None
    email: Optional[str] = None
    financial_status: Optional[str] = None
    fulfillment_status: Optional[str] = None
    total_price: Optional[Decimal] = None
    currency: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    tags: Optional[list[str]] = None
    note: Optional[str] = None
    line_items: Optional[list[LineItem]] = None
    shipping_address: Optional[Address] = None
    billing_address: Optional[Address] = None
