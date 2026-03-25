"""Strict canonical model for Shopify Products (v1).

This is our typed, validated representation. The processor transforms
raw -> canonical before upserting to Postgres.
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class Variant(BaseModel):
    id: Optional[int] = None
    title: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    price: Optional[Decimal] = None
    compare_at_price: Optional[Decimal] = None
    inventory_quantity: Optional[int] = None
    weight: Optional[float] = None
    weight_unit: Optional[str] = None


class Image(BaseModel):
    url: Optional[str] = None
    alt_text: Optional[str] = None


class ShopifyProductV1(BaseModel):
    """Source canonical Shopify product — strict types, validated."""

    id: int
    store_id: str
    title: Optional[str] = None
    handle: Optional[str] = None
    body_html: Optional[str] = None
    vendor: Optional[str] = None
    product_type: Optional[str] = None
    status: Optional[str] = None
    tags: Optional[list[str]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    variants: Optional[list[Variant]] = None
    images: Optional[list[Image]] = None
