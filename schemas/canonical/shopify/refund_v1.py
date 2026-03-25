"""Strict canonical model for Shopify Refunds (v1)."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Optional
from pydantic import BaseModel


class RefundLineItem(BaseModel):
    quantity: Optional[int] = None
    line_item_id: Optional[int] = None
    line_item_name: Optional[str] = None
    line_item_sku: Optional[str] = None
    subtotal: Optional[Decimal] = None


class ShopifyRefundV1(BaseModel):
    id: int
    order_id: int
    store_id: str
    created_at: Optional[datetime] = None
    note: Optional[str] = None
    total_refunded: Optional[Decimal] = None
    currency: Optional[str] = None
    refund_line_items: Optional[list[RefundLineItem]] = None
