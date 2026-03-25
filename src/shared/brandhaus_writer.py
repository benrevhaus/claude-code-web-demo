"""Dual-write layer: upserts raw_json to the existing brandhaus Postgres tables.

During the transition from brandhaus_cron to data-streams, this ensures
downstream consumers (caches_orders pipeline, stores_macrokpis,
brandhaus-vibecode analytics) keep working unchanged.

Controlled by DUAL_WRITE_ENABLED env var (off by default).
"""

from __future__ import annotations

import json
import os
from typing import Any, Optional

from src.shared.ssm import get_env_or_ssm

# All brandhaus tables share this shape:
#   (account_id, store_id, {resource}_id,
#    cache_created_at, cache_created_at_local,
#    cache_updated_at, cache_updated_at_local,
#    cache_deleted_at, cache_deleted_at_local,
#    raw_json)

# Map (source, stream) -> (table_name, id_column_name)
RESOURCE_TABLE_MAP: dict[tuple[str, str], tuple[str, str]] = {
    ("shopify", "orders"): ("orders", "order_id"),
    ("shopify", "customers"): ("customers", "customer_id"),
    ("shopify", "products"): ("products", "product_id"),
    ("shopify", "refunds"): ("refunds", "refund_id"),
    ("shopify", "transactions"): ("transactions", "transaction_id"),
}


def is_dual_write_enabled() -> bool:
    return os.environ.get("DUAL_WRITE_ENABLED", "").lower() in ("true", "1", "yes")


class BrandhausWriter:
    """Writes raw_json to the existing brandhaus Postgres tables."""

    def __init__(self, connection=None, connection_factory=None):
        self._conn = connection
        self._factory = connection_factory

    @classmethod
    def from_env(cls) -> BrandhausWriter:
        """Build a writer that lazily connects using env/SSM configuration."""
        import psycopg2

        env = os.environ.get("ENV", "dev")
        prefix = os.environ.get("PARAM_PREFIX", "data-streams")
        param = f"/{prefix}/{env}/brandhaus/connection_string"

        def _connect():
            conninfo = get_env_or_ssm("BRANDHAUS_CONNECTION_STRING", param)
            return psycopg2.connect(conninfo)

        return cls(connection_factory=_connect)

    def _ensure_connection(self):
        if self._conn is None and self._factory:
            self._conn = self._factory()

    def write_raw(
        self,
        source: str,
        stream: str,
        record_id: int,
        raw_json: dict[str, Any],
        account_id: int | None = None,
        store_id: int | None = None,
    ) -> bool:
        """Upsert raw_json into the corresponding brandhaus table.

        Returns True if a row was inserted or updated.
        """
        route = RESOURCE_TABLE_MAP.get((source, stream))
        if route is None:
            return False

        table_name, id_col = route
        self._ensure_connection()

        # Default account_id and store_id from env if not provided
        if account_id is None:
            account_id = int(os.environ.get("BRANDHAUS_ACCOUNT_ID", "1"))
        if store_id is None:
            store_id = int(os.environ.get("BRANDHAUS_STORE_ID", "2"))

        sql = f"""
            INSERT INTO {table_name} (
                account_id, store_id, {id_col},
                cache_created_at, cache_updated_at, raw_json
            ) VALUES (
                %(account_id)s, %(store_id)s, %(record_id)s,
                NOW(), NOW(), %(raw_json)s
            )
            ON CONFLICT (account_id, store_id, {id_col}) DO UPDATE SET
                cache_updated_at = NOW(),
                raw_json = EXCLUDED.raw_json
        """

        params = {
            "account_id": account_id,
            "store_id": store_id,
            "record_id": record_id,
            "raw_json": json.dumps(raw_json),
        }

        with self._conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount > 0

    def commit(self):
        if self._conn:
            self._conn.commit()

    def rollback(self):
        if self._conn:
            self._conn.rollback()

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None
