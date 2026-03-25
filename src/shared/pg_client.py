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

    def upsert_ticket(self, ticket: BaseModel, s3_key: str, schema_version: str, run_id: Optional[str] = None) -> bool:
        """Upsert a canonical ticket to gorgias.tickets. Returns True if row was inserted/updated."""
        self._ensure_connection()
        data = ticket.model_dump()

        sql = """
            INSERT INTO gorgias.tickets (
                id, store_id, external_id, status, subject, channel,
                created_datetime, updated_datetime, closed_datetime, opened_datetime,
                last_message_datetime, last_received_message_datetime, spam,
                via, customer, assignee_user, tags,
                raw_s3_key, schema_version, run_id
            ) VALUES (
                %(id)s, %(store_id)s, %(external_id)s, %(status)s, %(subject)s, %(channel)s,
                %(created_datetime)s, %(updated_datetime)s, %(closed_datetime)s, %(opened_datetime)s,
                %(last_message_datetime)s, %(last_received_message_datetime)s, %(spam)s,
                %(via)s, %(customer)s, %(assignee_user)s, %(tags)s,
                %(raw_s3_key)s, %(schema_version)s, %(run_id)s
            )
            ON CONFLICT (id, store_id) DO UPDATE SET
                external_id = EXCLUDED.external_id,
                status = EXCLUDED.status,
                subject = EXCLUDED.subject,
                channel = EXCLUDED.channel,
                created_datetime = EXCLUDED.created_datetime,
                updated_datetime = EXCLUDED.updated_datetime,
                closed_datetime = EXCLUDED.closed_datetime,
                opened_datetime = EXCLUDED.opened_datetime,
                last_message_datetime = EXCLUDED.last_message_datetime,
                last_received_message_datetime = EXCLUDED.last_received_message_datetime,
                spam = EXCLUDED.spam,
                via = EXCLUDED.via,
                customer = EXCLUDED.customer,
                assignee_user = EXCLUDED.assignee_user,
                tags = EXCLUDED.tags,
                raw_s3_key = EXCLUDED.raw_s3_key,
                schema_version = EXCLUDED.schema_version,
                ingested_at = NOW(),
                run_id = EXCLUDED.run_id
            WHERE gorgias.tickets.updated_datetime < EXCLUDED.updated_datetime
        """

        params = {
            "id": data["id"],
            "store_id": data["store_id"],
            "external_id": data.get("external_id"),
            "status": data.get("status"),
            "subject": data.get("subject"),
            "channel": data.get("channel"),
            "created_datetime": data.get("created_datetime"),
            "updated_datetime": data.get("updated_datetime"),
            "closed_datetime": data.get("closed_datetime"),
            "opened_datetime": data.get("opened_datetime"),
            "last_message_datetime": data.get("last_message_datetime"),
            "last_received_message_datetime": data.get("last_received_message_datetime"),
            "spam": data.get("spam"),
            "via": json.dumps(data.get("via")) if data.get("via") else None,
            "customer": json.dumps(data.get("customer")) if data.get("customer") else None,
            "assignee_user": json.dumps(data.get("assignee_user")) if data.get("assignee_user") else None,
            "tags": data.get("tags"),
            "raw_s3_key": s3_key,
            "schema_version": schema_version,
            "run_id": run_id,
        }

        with self._conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount > 0

    def insert_ticket_history(self, ticket: BaseModel, run_id: Optional[str] = None) -> None:
        """Append a history snapshot for a ticket."""
        self._ensure_connection()
        data = ticket.model_dump()

        sql = """
            INSERT INTO gorgias.tickets_history (ticket_id, store_id, snapshot, changed_at, run_id)
            VALUES (%(ticket_id)s, %(store_id)s, %(snapshot)s, %(changed_at)s, %(run_id)s)
            ON CONFLICT (ticket_id, store_id, changed_at) DO NOTHING
        """

        params = {
            "ticket_id": data["id"],
            "store_id": data["store_id"],
            "snapshot": json.dumps(data, default=str),
            "changed_at": data["updated_datetime"],
            "run_id": run_id,
        }

        with self._conn.cursor() as cur:
            cur.execute(sql, params)

    # ── Shopify Customers ──────────────────────────────────────────────────

    def upsert_customer(self, customer: BaseModel, s3_key: str, schema_version: str, run_id: Optional[str] = None) -> bool:
        self._ensure_connection()
        data = customer.model_dump()
        sql = """
            INSERT INTO shopify.customers (
                id, store_id, email, first_name, last_name, phone, state,
                tags, note, verified_email, tax_exempt, orders_count, total_spent,
                default_address, addresses, created_at, updated_at, deleted_at,
                raw_s3_key, schema_version, run_id
            ) VALUES (
                %(id)s, %(store_id)s, %(email)s, %(first_name)s, %(last_name)s,
                %(phone)s, %(state)s, %(tags)s, %(note)s, %(verified_email)s,
                %(tax_exempt)s, %(orders_count)s, %(total_spent)s,
                %(default_address)s, %(addresses)s, %(created_at)s, %(updated_at)s,
                %(deleted_at)s, %(raw_s3_key)s, %(schema_version)s, %(run_id)s
            )
            ON CONFLICT (id, store_id) DO UPDATE SET
                email = EXCLUDED.email, first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name, phone = EXCLUDED.phone,
                state = EXCLUDED.state, tags = EXCLUDED.tags, note = EXCLUDED.note,
                verified_email = EXCLUDED.verified_email, tax_exempt = EXCLUDED.tax_exempt,
                orders_count = EXCLUDED.orders_count, total_spent = EXCLUDED.total_spent,
                default_address = EXCLUDED.default_address, addresses = EXCLUDED.addresses,
                created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at,
                deleted_at = EXCLUDED.deleted_at,
                raw_s3_key = EXCLUDED.raw_s3_key, schema_version = EXCLUDED.schema_version,
                ingested_at = NOW(), run_id = EXCLUDED.run_id
            WHERE shopify.customers.updated_at < EXCLUDED.updated_at
                OR shopify.customers.updated_at IS NULL
        """
        params = {
            "id": data["id"], "store_id": data["store_id"],
            "email": data.get("email"), "first_name": data.get("first_name"),
            "last_name": data.get("last_name"), "phone": data.get("phone"),
            "state": data.get("state"), "tags": data.get("tags"),
            "note": data.get("note"), "verified_email": data.get("verified_email"),
            "tax_exempt": data.get("tax_exempt"), "orders_count": data.get("orders_count"),
            "total_spent": data.get("total_spent"),
            "default_address": json.dumps(data.get("default_address")) if data.get("default_address") else None,
            "addresses": json.dumps(data.get("addresses")) if data.get("addresses") else None,
            "created_at": data.get("created_at"), "updated_at": data.get("updated_at"),
            "deleted_at": data.get("deleted_at"),
            "raw_s3_key": s3_key, "schema_version": schema_version, "run_id": run_id,
        }
        with self._conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount > 0

    def insert_customer_history(self, customer: BaseModel, run_id: Optional[str] = None) -> None:
        self._ensure_connection()
        data = customer.model_dump()
        sql = """
            INSERT INTO shopify.customers_history (customer_id, store_id, snapshot, changed_at, run_id)
            VALUES (%(customer_id)s, %(store_id)s, %(snapshot)s, %(changed_at)s, %(run_id)s)
            ON CONFLICT (customer_id, store_id, changed_at) DO NOTHING
        """
        params = {
            "customer_id": data["id"], "store_id": data["store_id"],
            "snapshot": json.dumps(data, default=str),
            "changed_at": data["updated_at"], "run_id": run_id,
        }
        with self._conn.cursor() as cur:
            cur.execute(sql, params)

    def soft_delete_customer(self, customer_id: int, store_id: str) -> bool:
        """Set deleted_at on a customer (from customers/delete webhook)."""
        self._ensure_connection()
        sql = """
            UPDATE shopify.customers SET deleted_at = NOW(), ingested_at = NOW()
            WHERE id = %s AND store_id = %s AND deleted_at IS NULL
        """
        with self._conn.cursor() as cur:
            cur.execute(sql, (customer_id, store_id))
            return cur.rowcount > 0

    # ── Shopify Products ─────────────────────────────────────────────────

    def upsert_product(self, product: BaseModel, s3_key: str, schema_version: str, run_id: Optional[str] = None) -> bool:
        self._ensure_connection()
        data = product.model_dump()
        sql = """
            INSERT INTO shopify.products (
                id, store_id, title, handle, body_html, vendor, product_type, status,
                tags, created_at, updated_at, published_at, variants, images,
                raw_s3_key, schema_version, run_id
            ) VALUES (
                %(id)s, %(store_id)s, %(title)s, %(handle)s, %(body_html)s,
                %(vendor)s, %(product_type)s, %(status)s, %(tags)s,
                %(created_at)s, %(updated_at)s, %(published_at)s,
                %(variants)s, %(images)s,
                %(raw_s3_key)s, %(schema_version)s, %(run_id)s
            )
            ON CONFLICT (id, store_id) DO UPDATE SET
                title = EXCLUDED.title, handle = EXCLUDED.handle,
                body_html = EXCLUDED.body_html, vendor = EXCLUDED.vendor,
                product_type = EXCLUDED.product_type, status = EXCLUDED.status,
                tags = EXCLUDED.tags, created_at = EXCLUDED.created_at,
                updated_at = EXCLUDED.updated_at, published_at = EXCLUDED.published_at,
                variants = EXCLUDED.variants, images = EXCLUDED.images,
                raw_s3_key = EXCLUDED.raw_s3_key, schema_version = EXCLUDED.schema_version,
                ingested_at = NOW(), run_id = EXCLUDED.run_id
            WHERE shopify.products.updated_at < EXCLUDED.updated_at
                OR shopify.products.updated_at IS NULL
        """
        params = {
            "id": data["id"], "store_id": data["store_id"],
            "title": data.get("title"), "handle": data.get("handle"),
            "body_html": data.get("body_html"), "vendor": data.get("vendor"),
            "product_type": data.get("product_type"), "status": data.get("status"),
            "tags": data.get("tags"),
            "created_at": data.get("created_at"), "updated_at": data.get("updated_at"),
            "published_at": data.get("published_at"),
            "variants": json.dumps(data.get("variants")) if data.get("variants") else None,
            "images": json.dumps(data.get("images")) if data.get("images") else None,
            "raw_s3_key": s3_key, "schema_version": schema_version, "run_id": run_id,
        }
        with self._conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount > 0

    def insert_product_history(self, product: BaseModel, run_id: Optional[str] = None) -> None:
        self._ensure_connection()
        data = product.model_dump()
        sql = """
            INSERT INTO shopify.products_history (product_id, store_id, snapshot, changed_at, run_id)
            VALUES (%(product_id)s, %(store_id)s, %(snapshot)s, %(changed_at)s, %(run_id)s)
            ON CONFLICT (product_id, store_id, changed_at) DO NOTHING
        """
        params = {
            "product_id": data["id"], "store_id": data["store_id"],
            "snapshot": json.dumps(data, default=str),
            "changed_at": data["updated_at"], "run_id": run_id,
        }
        with self._conn.cursor() as cur:
            cur.execute(sql, params)

    # ── Shopify Inventory ────────────────────────────────────────────────

    def upsert_inventory_level(self, level: BaseModel, s3_key: str, schema_version: str, run_id: Optional[str] = None) -> bool:
        self._ensure_connection()
        data = level.model_dump()
        sql = """
            INSERT INTO shopify.inventory_levels (
                inventory_item_id, location_id, store_id, sku, variant_id, product_id,
                location_name, available, committed, on_hand, tracked, updated_at,
                raw_s3_key, schema_version, run_id
            ) VALUES (
                %(inventory_item_id)s, %(location_id)s, %(store_id)s, %(sku)s,
                %(variant_id)s, %(product_id)s, %(location_name)s,
                %(available)s, %(committed)s, %(on_hand)s, %(tracked)s, %(updated_at)s,
                %(raw_s3_key)s, %(schema_version)s, %(run_id)s
            )
            ON CONFLICT (inventory_item_id, location_id, store_id) DO UPDATE SET
                sku = EXCLUDED.sku, variant_id = EXCLUDED.variant_id,
                product_id = EXCLUDED.product_id, location_name = EXCLUDED.location_name,
                available = EXCLUDED.available, committed = EXCLUDED.committed,
                on_hand = EXCLUDED.on_hand, tracked = EXCLUDED.tracked,
                updated_at = EXCLUDED.updated_at,
                raw_s3_key = EXCLUDED.raw_s3_key, schema_version = EXCLUDED.schema_version,
                ingested_at = NOW(), run_id = EXCLUDED.run_id
            WHERE shopify.inventory_levels.updated_at < EXCLUDED.updated_at
                OR shopify.inventory_levels.updated_at IS NULL
        """
        params = {
            "inventory_item_id": data["inventory_item_id"],
            "location_id": data["location_id"], "store_id": data["store_id"],
            "sku": data.get("sku"), "variant_id": data.get("variant_id"),
            "product_id": data.get("product_id"), "location_name": data.get("location_name"),
            "available": data.get("available"), "committed": data.get("committed"),
            "on_hand": data.get("on_hand"), "tracked": data.get("tracked"),
            "updated_at": data.get("updated_at"),
            "raw_s3_key": s3_key, "schema_version": schema_version, "run_id": run_id,
        }
        with self._conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount > 0

    def insert_inventory_level_history(self, level: BaseModel, run_id: Optional[str] = None) -> None:
        self._ensure_connection()
        data = level.model_dump()
        sql = """
            INSERT INTO shopify.inventory_levels_history (
                inventory_item_id, location_id, store_id, snapshot, changed_at, run_id
            ) VALUES (
                %(inventory_item_id)s, %(location_id)s, %(store_id)s,
                %(snapshot)s, %(changed_at)s, %(run_id)s
            )
            ON CONFLICT (inventory_item_id, location_id, store_id, changed_at) DO NOTHING
        """
        params = {
            "inventory_item_id": data["inventory_item_id"],
            "location_id": data["location_id"], "store_id": data["store_id"],
            "snapshot": json.dumps(data, default=str),
            "changed_at": data["updated_at"], "run_id": run_id,
        }
        with self._conn.cursor() as cur:
            cur.execute(sql, params)

    # ── Shopify Refunds ────────────────────────────────────────────────────

    def upsert_refund(self, refund: BaseModel, s3_key: str, schema_version: str, run_id: Optional[str] = None) -> bool:
        self._ensure_connection()
        data = refund.model_dump()
        sql = """
            INSERT INTO shopify.refunds (
                id, order_id, store_id, created_at, note, total_refunded, currency,
                refund_line_items, raw_s3_key, schema_version, run_id
            ) VALUES (
                %(id)s, %(order_id)s, %(store_id)s, %(created_at)s, %(note)s,
                %(total_refunded)s, %(currency)s, %(refund_line_items)s,
                %(raw_s3_key)s, %(schema_version)s, %(run_id)s
            )
            ON CONFLICT (id, store_id) DO UPDATE SET
                order_id = EXCLUDED.order_id, created_at = EXCLUDED.created_at,
                note = EXCLUDED.note, total_refunded = EXCLUDED.total_refunded,
                currency = EXCLUDED.currency, refund_line_items = EXCLUDED.refund_line_items,
                raw_s3_key = EXCLUDED.raw_s3_key, schema_version = EXCLUDED.schema_version,
                ingested_at = NOW(), run_id = EXCLUDED.run_id
        """
        params = {
            "id": data["id"], "order_id": data["order_id"], "store_id": data["store_id"],
            "created_at": data.get("created_at"), "note": data.get("note"),
            "total_refunded": data.get("total_refunded"), "currency": data.get("currency"),
            "refund_line_items": json.dumps(data.get("refund_line_items")) if data.get("refund_line_items") else None,
            "raw_s3_key": s3_key, "schema_version": schema_version, "run_id": run_id,
        }
        with self._conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount > 0

    def insert_refund_history(self, refund: BaseModel, run_id: Optional[str] = None) -> None:
        self._ensure_connection()
        data = refund.model_dump()
        sql = """
            INSERT INTO shopify.refunds_history (refund_id, store_id, snapshot, changed_at, run_id)
            VALUES (%(refund_id)s, %(store_id)s, %(snapshot)s, %(changed_at)s, %(run_id)s)
            ON CONFLICT (refund_id, store_id, changed_at) DO NOTHING
        """
        params = {
            "refund_id": data["id"], "store_id": data["store_id"],
            "snapshot": json.dumps(data, default=str),
            "changed_at": data.get("created_at"), "run_id": run_id,
        }
        with self._conn.cursor() as cur:
            cur.execute(sql, params)

    # ── Shopify Transactions ─────────────────────────────────────────────

    def upsert_transaction(self, txn: BaseModel, s3_key: str, schema_version: str, run_id: Optional[str] = None) -> bool:
        self._ensure_connection()
        data = txn.model_dump()
        sql = """
            INSERT INTO shopify.transactions (
                id, order_id, store_id, kind, status, amount, currency, gateway,
                created_at, parent_transaction_id,
                raw_s3_key, schema_version, run_id
            ) VALUES (
                %(id)s, %(order_id)s, %(store_id)s, %(kind)s, %(status)s,
                %(amount)s, %(currency)s, %(gateway)s, %(created_at)s,
                %(parent_transaction_id)s,
                %(raw_s3_key)s, %(schema_version)s, %(run_id)s
            )
            ON CONFLICT (id, store_id) DO UPDATE SET
                order_id = EXCLUDED.order_id, kind = EXCLUDED.kind,
                status = EXCLUDED.status, amount = EXCLUDED.amount,
                currency = EXCLUDED.currency, gateway = EXCLUDED.gateway,
                created_at = EXCLUDED.created_at,
                parent_transaction_id = EXCLUDED.parent_transaction_id,
                raw_s3_key = EXCLUDED.raw_s3_key, schema_version = EXCLUDED.schema_version,
                ingested_at = NOW(), run_id = EXCLUDED.run_id
        """
        params = {
            "id": data["id"], "order_id": data["order_id"], "store_id": data["store_id"],
            "kind": data.get("kind"), "status": data.get("status"),
            "amount": data.get("amount"), "currency": data.get("currency"),
            "gateway": data.get("gateway"), "created_at": data.get("created_at"),
            "parent_transaction_id": data.get("parent_transaction_id"),
            "raw_s3_key": s3_key, "schema_version": schema_version, "run_id": run_id,
        }
        with self._conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount > 0

    def insert_transaction_history(self, txn: BaseModel, run_id: Optional[str] = None) -> None:
        self._ensure_connection()
        data = txn.model_dump()
        sql = """
            INSERT INTO shopify.transactions_history (transaction_id, store_id, snapshot, changed_at, run_id)
            VALUES (%(transaction_id)s, %(store_id)s, %(snapshot)s, %(changed_at)s, %(run_id)s)
            ON CONFLICT (transaction_id, store_id, changed_at) DO NOTHING
        """
        params = {
            "transaction_id": data["id"], "store_id": data["store_id"],
            "snapshot": json.dumps(data, default=str),
            "changed_at": data.get("created_at"), "run_id": run_id,
        }
        with self._conn.cursor() as cur:
            cur.execute(sql, params)

    # ── MVP cursor storage (ADR-022) ──────────────────────────────────────

    def get_stream_cursor(self, source: str, stream: str, store_id: str) -> str | None:
        """Read current cursor value from control.stream_cursors."""
        self._ensure_connection()
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT cursor_value FROM control.stream_cursors "
                "WHERE source = %s AND stream = %s AND store_id = %s",
                (source, stream, store_id),
            )
            row = cur.fetchone()
            return row[0] if row else None

    def save_stream_cursor(
        self,
        source: str,
        stream: str,
        store_id: str,
        cursor_value: str | None,
        run_id: str,
        status: str = "success",
        pages: int = 0,
        records: int = 0,
    ) -> None:
        """Upsert cursor + run metadata after a completed run."""
        self._ensure_connection()
        with self._conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO control.stream_cursors
                       (source, stream, store_id, cursor_value, run_id,
                        last_status, last_run_at, pages_total, records_total)
                VALUES (%s, %s, %s, %s, %s, %s, NOW(), %s, %s)
                ON CONFLICT (source, stream, store_id) DO UPDATE SET
                    cursor_value  = EXCLUDED.cursor_value,
                    run_id        = EXCLUDED.run_id,
                    updated_at    = NOW(),
                    last_status   = EXCLUDED.last_status,
                    last_run_at   = NOW(),
                    pages_total   = EXCLUDED.pages_total,
                    records_total = EXCLUDED.records_total
                """,
                (source, stream, store_id, cursor_value, run_id, status, pages, records),
            )
        self._conn.commit()

    # ── Transaction control ─────────────────────────────────────────────

    def commit(self):
        self._ensure_connection()
        self._conn.commit()

    def rollback(self):
        if self._conn:
            self._conn.rollback()
