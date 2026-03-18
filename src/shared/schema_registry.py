"""Schema registry: routes (source, stream) to the correct models and transform.

Adding a new stream = add an entry here + create the schema files.
"""

from typing import Any, Callable

from schemas.canonical.shopify.order_v3 import ShopifyOrderV3
from schemas.canonical.shopify.transforms import transform_shopify_order
from schemas.raw.shopify.order import ShopifyOrderRaw, ShopifyOrdersPageRaw


class SchemaEntry:
    def __init__(
        self,
        raw_model: type,
        raw_page_model: type,
        canonical_model: type,
        transform: Callable,
        pg_table: str,
        version: str,
        record_list_field: str = "orders",
    ):
        self.raw_model = raw_model
        self.raw_page_model = raw_page_model
        self.canonical_model = canonical_model
        self.transform = transform
        self.pg_table = pg_table
        self.version = version
        self.record_list_field = record_list_field


SCHEMA_REGISTRY: dict[tuple[str, str], SchemaEntry] = {
    ("shopify", "orders"): SchemaEntry(
        raw_model=ShopifyOrderRaw,
        raw_page_model=ShopifyOrdersPageRaw,
        canonical_model=ShopifyOrderV3,
        transform=transform_shopify_order,
        pg_table="shopify.orders",
        version="shopify.order.v3",
        record_list_field="orders",
    ),
}


def get_schema(source: str, stream: str) -> SchemaEntry:
    key = (source, stream)
    if key not in SCHEMA_REGISTRY:
        raise ValueError(f"No schema registered for ({source}, {stream})")
    return SCHEMA_REGISTRY[key]
