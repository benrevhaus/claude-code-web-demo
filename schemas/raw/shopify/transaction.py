"""Permissive raw model for Shopify Transaction (nested in order payloads)."""

from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, model_validator


def _gid_to_int(value):
    if value is None: return None
    if isinstance(value, int): return value
    if isinstance(value, str):
        tail = value.rsplit("/", 1)[-1]
        try: return int(tail)
        except ValueError: return None
    return None


class ShopifyTransactionRaw(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: int
    kind: Optional[str] = None
    status: Optional[str] = None
    amount: Optional[str] = None
    currency: Optional[str] = None
    gateway: Optional[str] = None
    created_at: Optional[str] = None
    parent_transaction_id: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_graphql(cls, data):
        if not isinstance(data, dict): return data
        n = dict(data)
        n["id"] = _gid_to_int(n.get("id")) or n.get("id")
        n["created_at"] = n.get("created_at") or n.get("createdAt")
        # amountSet
        amount_set = n.get("amountSet") or {}
        shop_money = amount_set.get("shopMoney") or {}
        if n.get("amount") is None:
            n["amount"] = shop_money.get("amount")
        if n.get("currency") is None:
            n["currency"] = shop_money.get("currencyCode")
        # parentTransaction
        parent = n.get("parentTransaction") or {}
        if n.get("parent_transaction_id") is None and isinstance(parent, dict):
            n["parent_transaction_id"] = _gid_to_int(parent.get("id"))
        return n
