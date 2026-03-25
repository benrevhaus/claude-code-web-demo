"""Strict canonical model for Shopify Customers (v1).

This is our typed, validated representation. The processor transforms
raw -> canonical before upserting to Postgres.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel


class ShopifyCustomerV1(BaseModel):
    """Source canonical Shopify customer — strict types, validated."""

    id: int
    store_id: str
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    state: Optional[str] = None
    tags: Optional[list[str]] = None
    note: Optional[str] = None
    verified_email: Optional[bool] = None
    tax_exempt: Optional[bool] = None
    orders_count: Optional[int] = None
    total_spent: Optional[Decimal] = None
    default_address: Optional[dict[str, Any]] = None
    addresses: Optional[list[dict[str, Any]]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
