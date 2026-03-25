"""Strict canonical model for Shopify Transactions (v1)."""

from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class ShopifyTransactionV1(BaseModel):
    id: int
    order_id: int
    store_id: str
    kind: Optional[str] = None
    status: Optional[str] = None
    amount: Optional[Decimal] = None
    currency: Optional[str] = None
    gateway: Optional[str] = None
    created_at: Optional[datetime] = None
    parent_transaction_id: Optional[int] = None
