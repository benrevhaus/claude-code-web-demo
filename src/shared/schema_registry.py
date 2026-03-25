"""Schema registry: routes (source, stream) to the correct models and transform.

Adding a new stream = add an entry here + create the schema files.
"""

from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from schemas.canonical.gorgias.ticket_v1 import GorgiasTicketV1
from schemas.canonical.gorgias.transforms import transform_gorgias_ticket
from schemas.canonical.shopify.customer_v1 import ShopifyCustomerV1
from schemas.canonical.shopify.inventory_v1 import ShopifyInventoryLevelV1
from schemas.canonical.shopify.order_v3 import ShopifyOrderV3
from schemas.canonical.shopify.product_v1 import ShopifyProductV1
from schemas.canonical.shopify.refund_v1 import ShopifyRefundV1
from schemas.canonical.shopify.transaction_v1 import ShopifyTransactionV1
from schemas.canonical.shopify.transforms import (
    transform_shopify_customer,
    transform_shopify_inventory,
    transform_shopify_order,
    transform_shopify_product,
    transform_shopify_refund,
    transform_shopify_transaction,
)
from schemas.raw.gorgias.ticket import GorgiasTicketRaw, GorgiasTicketsPageRaw
from schemas.raw.shopify.customer import ShopifyCustomerRaw, ShopifyCustomersPageRaw
from schemas.raw.shopify.inventory import ShopifyInventoryItemRaw, ShopifyInventoryPageRaw
from schemas.raw.shopify.order import ShopifyOrderRaw, ShopifyOrdersPageRaw
from schemas.raw.shopify.product import ShopifyProductRaw, ShopifyProductsPageRaw
from schemas.raw.shopify.refund import ShopifyRefundRaw
from schemas.raw.shopify.transaction import ShopifyTransactionRaw


@dataclass
class SubStreamDef:
    """Defines a nested sub-stream to extract from a parent record."""
    extract_field: str  # field name on raw record (e.g., "refunds")
    raw_model: type  # raw model for nested records
    transform: Callable  # transform function (takes raw, store_id, parent_id)
    pg_upsert_method: str
    pg_history_method: str
    schema_version: str


class SchemaEntry:
    def __init__(
        self,
        raw_model: type,
        raw_page_model: type,
        canonical_model: type,
        transform: Callable,
        pg_table: str,
        pg_history_table: str,
        version: str,
        record_list_field: str = "orders",
        idempotency_field_map: Optional[dict[str, str]] = None,
        pg_upsert_method: str = "upsert_record",
        pg_history_method: str = "insert_record_history",
        transform_returns_list: bool = False,
        sub_streams: Optional[list[SubStreamDef]] = None,
    ):
        self.raw_model = raw_model
        self.raw_page_model = raw_page_model
        self.canonical_model = canonical_model
        self.transform = transform
        self.pg_table = pg_table
        self.pg_history_table = pg_history_table
        self.version = version
        self.record_list_field = record_list_field
        self.idempotency_field_map = idempotency_field_map or {}
        self.pg_upsert_method = pg_upsert_method
        self.pg_history_method = pg_history_method
        self.transform_returns_list = transform_returns_list
        self.sub_streams = sub_streams or []

    def build_idempotency_data(self, canonical_record: dict[str, Any], key_fields: list[str]) -> dict[str, str]:
        data: dict[str, str] = {}
        for key_field in key_fields:
            canonical_field = self.idempotency_field_map.get(key_field, key_field)
            if canonical_field not in canonical_record:
                raise KeyError(f"Idempotency field {key_field} maps to missing canonical field {canonical_field}")
            data[key_field] = str(canonical_record[canonical_field])
        return data


SCHEMA_REGISTRY: dict[tuple[str, str], SchemaEntry] = {
    ("shopify", "orders"): SchemaEntry(
        raw_model=ShopifyOrderRaw,
        raw_page_model=ShopifyOrdersPageRaw,
        canonical_model=ShopifyOrderV3,
        transform=transform_shopify_order,
        pg_table="shopify.orders",
        pg_history_table="shopify.orders_history",
        version="shopify.order.v3",
        record_list_field="orders",
        idempotency_field_map={"order_id": "id", "updated_at": "updated_at"},
        pg_upsert_method="upsert_order",
        pg_history_method="insert_order_history",
        sub_streams=[
            SubStreamDef(
                extract_field="refunds",
                raw_model=ShopifyRefundRaw,
                transform=transform_shopify_refund,
                pg_upsert_method="upsert_refund",
                pg_history_method="insert_refund_history",
                schema_version="shopify.refund.v1",
            ),
            SubStreamDef(
                extract_field="transactions",
                raw_model=ShopifyTransactionRaw,
                transform=transform_shopify_transaction,
                pg_upsert_method="upsert_transaction",
                pg_history_method="insert_transaction_history",
                schema_version="shopify.transaction.v1",
            ),
        ],
    ),
    ("shopify", "customers"): SchemaEntry(
        raw_model=ShopifyCustomerRaw,
        raw_page_model=ShopifyCustomersPageRaw,
        canonical_model=ShopifyCustomerV1,
        transform=transform_shopify_customer,
        pg_table="shopify.customers",
        pg_history_table="shopify.customers_history",
        version="shopify.customer.v1",
        record_list_field="customers",
        idempotency_field_map={"customer_id": "id", "updated_at": "updated_at"},
        pg_upsert_method="upsert_customer",
        pg_history_method="insert_customer_history",
    ),
    ("shopify", "products"): SchemaEntry(
        raw_model=ShopifyProductRaw,
        raw_page_model=ShopifyProductsPageRaw,
        canonical_model=ShopifyProductV1,
        transform=transform_shopify_product,
        pg_table="shopify.products",
        pg_history_table="shopify.products_history",
        version="shopify.product.v1",
        record_list_field="products",
        idempotency_field_map={"product_id": "id", "updated_at": "updated_at"},
        pg_upsert_method="upsert_product",
        pg_history_method="insert_product_history",
    ),
    ("shopify", "inventory"): SchemaEntry(
        raw_model=ShopifyInventoryItemRaw,
        raw_page_model=ShopifyInventoryPageRaw,
        canonical_model=ShopifyInventoryLevelV1,
        transform=transform_shopify_inventory,
        pg_table="shopify.inventory_levels",
        pg_history_table="shopify.inventory_levels_history",
        version="shopify.inventory.v1",
        record_list_field="inventory_items",
        idempotency_field_map={"inventory_item_id": "inventory_item_id", "location_id": "location_id"},
        pg_upsert_method="upsert_inventory_level",
        pg_history_method="insert_inventory_level_history",
        transform_returns_list=True,
    ),
    ("gorgias", "tickets"): SchemaEntry(
        raw_model=GorgiasTicketRaw,
        raw_page_model=GorgiasTicketsPageRaw,
        canonical_model=GorgiasTicketV1,
        transform=transform_gorgias_ticket,
        pg_table="gorgias.tickets",
        pg_history_table="gorgias.tickets_history",
        version="gorgias.ticket.v1",
        record_list_field="data",
        idempotency_field_map={"ticket_id": "id", "updated_datetime": "updated_datetime"},
        pg_upsert_method="upsert_ticket",
        pg_history_method="insert_ticket_history",
    ),
}


def get_schema(source: str, stream: str) -> SchemaEntry:
    key = (source, stream)
    if key not in SCHEMA_REGISTRY:
        raise ValueError(f"No schema registered for ({source}, {stream})")
    return SCHEMA_REGISTRY[key]
