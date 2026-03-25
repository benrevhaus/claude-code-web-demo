"""Strict canonical model for Shopify Inventory Levels (v1).

One row per (inventory_item_id, location_id, store_id) pair.
The processor transforms raw inventory items (with nested levels)
into these flattened records before upserting to Postgres.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ShopifyInventoryLevelV1(BaseModel):
    """One row per (inventory_item, location) pair."""

    inventory_item_id: int
    location_id: int
    store_id: str
    sku: Optional[str] = None
    variant_id: Optional[int] = None
    product_id: Optional[int] = None
    location_name: Optional[str] = None
    available: Optional[int] = None
    committed: Optional[int] = None
    on_hand: Optional[int] = None
    tracked: Optional[bool] = None
    updated_at: Optional[datetime] = None
