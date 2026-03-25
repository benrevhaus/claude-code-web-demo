"""Permissive raw model for Shopify Refund (nested in order payloads)."""

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


class ShopifyRefundLineItemRaw(BaseModel):
    model_config = ConfigDict(extra="allow")
    quantity: Optional[int] = None
    line_item_id: Optional[int] = None
    line_item_name: Optional[str] = None
    line_item_sku: Optional[str] = None
    subtotal: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize(cls, data):
        if not isinstance(data, dict): return data
        n = dict(data)
        li = n.get("lineItem") or n.get("line_item") or {}
        if isinstance(li, dict):
            n["line_item_id"] = _gid_to_int(n.get("line_item_id")) or _gid_to_int(li.get("id"))
            n["line_item_name"] = n.get("line_item_name") or li.get("name")
            n["line_item_sku"] = n.get("line_item_sku") or li.get("sku")
        subtotal_set = n.get("subtotalSet") or {}
        shop_money = subtotal_set.get("shopMoney") or {}
        if n.get("subtotal") is None:
            n["subtotal"] = shop_money.get("amount")
        return n


class ShopifyRefundRaw(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: int
    created_at: Optional[str] = None
    note: Optional[str] = None
    total_refunded: Optional[str] = None
    currency: Optional[str] = None
    refund_line_items: Optional[list[ShopifyRefundLineItemRaw]] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_graphql(cls, data):
        if not isinstance(data, dict): return data
        n = dict(data)
        n["id"] = _gid_to_int(n.get("id")) or n.get("id")
        n["created_at"] = n.get("created_at") or n.get("createdAt")
        # totalRefundedSet
        total_set = n.get("totalRefundedSet") or {}
        shop_money = total_set.get("shopMoney") or {}
        if n.get("total_refunded") is None:
            n["total_refunded"] = shop_money.get("amount")
        if n.get("currency") is None:
            n["currency"] = shop_money.get("currencyCode")
        # refundLineItems edges
        rli = n.get("refundLineItems") or n.get("refund_line_items") or {}
        if isinstance(rli, dict) and "edges" in rli:
            n["refund_line_items"] = [e.get("node", {}) for e in rli.get("edges", [])]
        return n
