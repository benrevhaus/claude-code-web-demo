"""Permissive raw model for Shopify Inventory Items / Levels (GraphQL).

The Shopify GraphQL inventoryItems query returns items with nested
inventoryLevels per location. We flatten this into one record per
(item, location) pair downstream in transforms.

extra="allow" ensures we never fail on unknown fields from Shopify.
"""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, model_validator


def _gid_to_int(value: Any) -> Optional[int]:
    """Extract integer ID from a Shopify GraphQL global ID string."""
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


class ShopifyInventoryQuantityRaw(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: Optional[str] = None
    quantity: Optional[int] = None


class ShopifyInventoryLocationRaw(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[int] = None
    name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize(cls, data):
        if not isinstance(data, dict):
            return data
        n = dict(data)
        n["id"] = _gid_to_int(n.get("id")) or n.get("id")
        return n


class ShopifyInventoryLevelRaw(BaseModel):
    """One inventory level = one (item, location) pair."""

    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    location: Optional[ShopifyInventoryLocationRaw] = None
    quantities: Optional[list[ShopifyInventoryQuantityRaw]] = None
    updated_at: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize(cls, data):
        if not isinstance(data, dict):
            return data
        n = dict(data)
        if "updatedAt" in n:
            n["updated_at"] = n.get("updatedAt")
        return n


class ShopifyInventoryItemRaw(BaseModel):
    """One inventory item with its levels across locations."""

    model_config = ConfigDict(extra="allow")
    id: Optional[int] = None
    sku: Optional[str] = None
    tracked: Optional[bool] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    variant_id: Optional[int] = None
    product_id: Optional[int] = None
    inventory_levels: Optional[list[ShopifyInventoryLevelRaw]] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_graphql(cls, data):
        if not isinstance(data, dict):
            return data
        n = dict(data)
        n["id"] = _gid_to_int(n.get("id")) or n.get("id")
        n["created_at"] = n.get("created_at") or n.get("createdAt")
        n["updated_at"] = n.get("updated_at") or n.get("updatedAt")
        # Extract variant/product IDs
        variant = n.get("variant") or {}
        product = variant.get("product") or {}
        n["variant_id"] = _gid_to_int(n.get("variant_id")) or _gid_to_int(variant.get("id"))
        n["product_id"] = _gid_to_int(n.get("product_id")) or _gid_to_int(product.get("id"))
        # Unwrap inventoryLevels edges
        levels = n.get("inventoryLevels") or n.get("inventory_levels") or {}
        if isinstance(levels, dict) and "edges" in levels:
            n["inventory_levels"] = [e.get("node", {}) for e in levels.get("edges", [])]
        return n


class ShopifyInventoryPageRaw(BaseModel):
    """A page of inventory items from GraphQL."""

    model_config = ConfigDict(extra="allow")
    inventory_items: list[ShopifyInventoryItemRaw] = []

    @model_validator(mode="before")
    @classmethod
    def normalize_graphql_page(cls, data):
        if not isinstance(data, dict):
            return data
        if "inventory_items" in data and isinstance(data["inventory_items"], list):
            return data
        items = data.get("data", {}).get("inventoryItems", {}).get("edges", [])
        return {"inventory_items": [e.get("node", {}) for e in items]}
