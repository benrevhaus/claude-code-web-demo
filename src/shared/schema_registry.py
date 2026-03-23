"""Schema registry: routes (source, stream) to the correct models and transform.

Adding a new stream = add an entry here + create the schema files.
"""

from typing import Any, Callable, Optional

from schemas.canonical.gorgias.ticket_v1 import GorgiasTicketV1
from schemas.canonical.gorgias.transforms import transform_gorgias_ticket
from schemas.canonical.shopify.order_v3 import ShopifyOrderV3
from schemas.canonical.shopify.transforms import transform_shopify_order
from schemas.raw.gorgias.ticket import GorgiasTicketRaw, GorgiasTicketsPageRaw
from schemas.raw.shopify.order import ShopifyOrderRaw, ShopifyOrdersPageRaw


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
