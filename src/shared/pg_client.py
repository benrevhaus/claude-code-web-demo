"""Postgres client for upserts and history writes.

This is the ONLY module that talks to Postgres.
"""

import os
import json
from typing import Any, Optional

import psycopg2
from pydantic import BaseModel

from src.shared.ssm import get_env_or_ssm


class PgClient:
    """Postgres operations for the data streams platform.

    Accepts a connection object (or callable that returns one) for testability.
    In production, this is a psycopg2 connection via RDS Proxy.
    """

    def __init__(self, connection: Optional[Any] = None, connection_factory: Optional[Any] = None):
        self._conn = connection
        self._factory = connection_factory

    @classmethod
    def from_env(cls) -> "PgClient":
        """Build a client that lazily connects using env/SSM configuration."""
        env = os.environ.get("ENV", "dev")
        prefix = os.environ.get("PARAM_PREFIX", "data-streams")
        parameter_name = os.environ.get("POSTGRES_CONNECTION_STRING_PARAM", f"/{prefix}/{env}/postgres/connection_string")

        def _connect():
            conninfo = get_env_or_ssm("POSTGRES_CONNECTION_STRING", parameter_name)
            return psycopg2.connect(conninfo)

        return cls(connection_factory=_connect)

    def _ensure_connection(self):
        if self._conn is None:
            if self._factory:
                self._conn = self._factory()
            else:
                raise RuntimeError("No database connection provided")

    @property
    def connection(self):
        self._ensure_connection()
        return self._conn

    def upsert_order(self, order: BaseModel, s3_key: str, schema_version: str, run_id: Optional[str] = None) -> bool:
        """Upsert a canonical order to shopify.orders. Returns True if row was inserted/updated."""
        self._ensure_connection()
        data = order.model_dump()

        sql = """
            INSERT INTO shopify.orders (
                id, store_id, order_number, email, financial_status, fulfillment_status,
                total_price, currency, created_at, updated_at, cancelled_at, closed_at,
                tags, note, line_items, shipping_address, billing_address,
                raw_s3_key, schema_version, run_id
            ) VALUES (
                %(id)s, %(store_id)s, %(order_number)s, %(email)s, %(financial_status)s,
                %(fulfillment_status)s, %(total_price)s, %(currency)s, %(created_at)s,
                %(updated_at)s, %(cancelled_at)s, %(closed_at)s, %(tags)s, %(note)s,
                %(line_items)s, %(shipping_address)s, %(billing_address)s,
                %(raw_s3_key)s, %(schema_version)s, %(run_id)s
            )
            ON CONFLICT (id, store_id) DO UPDATE SET
                order_number = EXCLUDED.order_number,
                email = EXCLUDED.email,
                financial_status = EXCLUDED.financial_status,
                fulfillment_status = EXCLUDED.fulfillment_status,
                total_price = EXCLUDED.total_price,
                currency = EXCLUDED.currency,
                created_at = EXCLUDED.created_at,
                updated_at = EXCLUDED.updated_at,
                cancelled_at = EXCLUDED.cancelled_at,
                closed_at = EXCLUDED.closed_at,
                tags = EXCLUDED.tags,
                note = EXCLUDED.note,
                line_items = EXCLUDED.line_items,
                shipping_address = EXCLUDED.shipping_address,
                billing_address = EXCLUDED.billing_address,
                raw_s3_key = EXCLUDED.raw_s3_key,
                schema_version = EXCLUDED.schema_version,
                ingested_at = NOW(),
                run_id = EXCLUDED.run_id
            WHERE shopify.orders.updated_at < EXCLUDED.updated_at
        """

        params = {
            "id": data["id"],
            "store_id": data["store_id"],
            "order_number": data.get("order_number"),
            "email": data.get("email"),
            "financial_status": data.get("financial_status"),
            "fulfillment_status": data.get("fulfillment_status"),
            "total_price": data.get("total_price"),
            "currency": data.get("currency"),
            "created_at": data.get("created_at"),
            "updated_at": data.get("updated_at"),
            "cancelled_at": data.get("cancelled_at"),
            "closed_at": data.get("closed_at"),
            "tags": data.get("tags"),
            "note": data.get("note"),
            "line_items": json.dumps(data.get("line_items")) if data.get("line_items") else None,
            "shipping_address": json.dumps(data.get("shipping_address")) if data.get("shipping_address") else None,
            "billing_address": json.dumps(data.get("billing_address")) if data.get("billing_address") else None,
            "raw_s3_key": s3_key,
            "schema_version": schema_version,
            "run_id": run_id,
        }

        with self._conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount > 0

    def insert_order_history(self, order: BaseModel, run_id: Optional[str] = None) -> None:
        """Append a history snapshot for an order."""
        self._ensure_connection()
        data = order.model_dump()

        sql = """
            INSERT INTO shopify.orders_history (order_id, store_id, snapshot, changed_at, run_id)
            VALUES (%(order_id)s, %(store_id)s, %(snapshot)s, %(changed_at)s, %(run_id)s)
            ON CONFLICT (order_id, store_id, changed_at) DO NOTHING
        """

        params = {
            "order_id": data["id"],
            "store_id": data["store_id"],
            "snapshot": json.dumps(data, default=str),
            "changed_at": data["updated_at"],
            "run_id": run_id,
        }

        with self._conn.cursor() as cur:
            cur.execute(sql, params)

    def commit(self):
        self._ensure_connection()
        self._conn.commit()

    def rollback(self):
        if self._conn:
            self._conn.rollback()
