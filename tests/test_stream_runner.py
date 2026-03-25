"""Tests for the MVP stream_runner Lambda handler.

Uses moto for S3 and a MockPgClient for Postgres (same pattern as test_e2e_local.py).
No AWS credentials needed.
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import boto3
import pytest
from moto import mock_aws

from src.lambdas.stream_runner import handler as runner_mod
from src.shared.observability import MetricsClient
from src.shared.pg_client import PgClient
from src.shared.s3_writer import S3Writer
from src.shared.shopify_client import ShopifyPage
from src.shared.gorgias_client import GorgiasPage
from tests.conftest import load_all_order_fixtures, load_all_gorgias_ticket_fixtures

BUCKET = "data-streams-raw-dev"
STORE_ID = "teststore"


class MockPgClient(PgClient):
    """In-memory PgClient mock that tracks upserts, history, and cursors."""

    def __init__(self):
        super().__init__(connection=None)
        self.orders: dict[tuple, dict] = {}
        self.tickets: dict[tuple, dict] = {}
        self.history: list[dict] = []
        self.cursors: dict[tuple[str, str, str], dict] = {}

    def _ensure_connection(self):
        pass  # No-op for mock

    def upsert_order(self, order, s3_key, schema_version, run_id=None):
        data = order.model_dump(mode="json")
        key = (data["id"], data["store_id"])
        existing = self.orders.get(key)
        if existing and existing.get("updated_at", "") >= str(data.get("updated_at", "")):
            return False
        self.orders[key] = {**data, "raw_s3_key": s3_key, "schema_version": schema_version, "run_id": run_id}
        return True

    def insert_order_history(self, order, run_id=None):
        data = order.model_dump(mode="json")
        self.history.append({**data, "run_id": run_id})

    def upsert_ticket(self, ticket, s3_key, schema_version, run_id=None):
        data = ticket.model_dump(mode="json")
        key = (data["id"], data["store_id"])
        existing = self.tickets.get(key)
        if existing and existing.get("updated_datetime", "") >= str(data.get("updated_datetime", "")):
            return False
        self.tickets[key] = {**data, "raw_s3_key": s3_key, "schema_version": schema_version, "run_id": run_id}
        return True

    def insert_ticket_history(self, ticket, run_id=None):
        data = ticket.model_dump(mode="json")
        self.history.append({**data, "run_id": run_id})

    def get_stream_cursor(self, source, stream, store_id):
        key = (source, stream, store_id)
        entry = self.cursors.get(key)
        return entry["cursor_value"] if entry else None

    def save_stream_cursor(self, source, stream, store_id, cursor_value, run_id, status="success", pages=0, records=0):
        self.cursors[(source, stream, store_id)] = {
            "cursor_value": cursor_value,
            "run_id": run_id,
            "status": status,
            "pages": pages,
            "records": records,
        }

    def commit(self):
        pass

    def rollback(self):
        pass


@pytest.fixture
def s3_env():
    """Set up mocked S3."""
    with mock_aws():
        s3_client = boto3.client("s3", region_name="us-east-1")
        s3_client.create_bucket(Bucket=BUCKET)
        yield S3Writer(bucket=BUCKET, s3_client=s3_client)


@pytest.fixture(autouse=True)
def inject_dependencies(s3_env):
    """Inject test dependencies into the stream_runner module."""
    pg = MockPgClient()
    metrics = MetricsClient(cloudwatch_client=MagicMock())

    runner_mod._s3_writer = s3_env
    runner_mod._pg = pg
    runner_mod._metrics = metrics
    runner_mod._shopify_clients.clear()
    runner_mod._gorgias_client = None

    yield {"s3": s3_env, "pg": pg, "metrics": metrics}

    # Clean up
    runner_mod._s3_writer = None
    runner_mod._pg = None
    runner_mod._metrics = None
    runner_mod._shopify_clients.clear()
    runner_mod._gorgias_client = None


class TestShopifyStreamRunner:

    def test_full_run(self, inject_dependencies):
        pg = inject_dependencies["pg"]
        orders = load_all_order_fixtures()

        mock_client = MagicMock()
        mock_client.fetch_page.return_value = ShopifyPage(
            body={
                "data": {
                    "orders": {
                        "edges": [{"node": order} for order in orders],
                        "pageInfo": {"hasNextPage": False, "endCursor": None},
                    }
                }
            },
            status_code=200,
            record_count=len(orders),
            next_cursor=None,
            checkpoint_cursor="2024-03-15T11:30:00Z",
            has_more=False,
        )
        runner_mod._shopify_clients["orders"] = mock_client

        result = runner_mod.handler({
            "source": "shopify",
            "stream": "orders",
            "store_id": STORE_ID,
        })

        assert result["status"] == "success"
        assert result["records_processed"] == 3
        assert result["records_failed"] == 0
        assert result["pages"] == 1
        assert len(pg.orders) == 3
        assert len(pg.history) == 3

        # Cursor saved
        cursor_entry = pg.cursors.get(("shopify", "orders", STORE_ID))
        assert cursor_entry is not None
        assert cursor_entry["cursor_value"] == "2024-03-15T11:30:00Z"
        assert cursor_entry["status"] == "success"

    def test_multi_page_run(self, inject_dependencies):
        pg = inject_dependencies["pg"]
        orders = load_all_order_fixtures()

        mock_client = MagicMock()
        # Page 1: has_more=True
        mock_client.fetch_page.side_effect = [
            ShopifyPage(
                body={
                    "data": {
                        "orders": {
                            "edges": [{"node": orders[0]}],
                            "pageInfo": {"hasNextPage": True, "endCursor": "cursor-1"},
                        }
                    }
                },
                status_code=200,
                record_count=1,
                next_cursor='{"checkpoint":"2024-03-15T10:00:00Z","page_cursor":"cursor-1"}',
                checkpoint_cursor="2024-03-15T10:00:00Z",
                has_more=True,
            ),
            # Page 2: has_more=False
            ShopifyPage(
                body={
                    "data": {
                        "orders": {
                            "edges": [{"node": orders[1]}],
                            "pageInfo": {"hasNextPage": False, "endCursor": None},
                        }
                    }
                },
                status_code=200,
                record_count=1,
                next_cursor=None,
                checkpoint_cursor="2024-03-15T11:00:00Z",
                has_more=False,
            ),
        ]
        runner_mod._shopify_clients["orders"] = mock_client

        result = runner_mod.handler({
            "source": "shopify",
            "stream": "orders",
            "store_id": STORE_ID,
        })

        assert result["status"] == "success"
        assert result["records_processed"] == 2
        assert result["pages"] == 2
        assert mock_client.fetch_page.call_count == 2

    def test_cursor_not_advanced_on_total_failure(self, inject_dependencies):
        pg = inject_dependencies["pg"]

        mock_client = MagicMock()
        # Return a page with a body that will fail transform (bad data)
        mock_client.fetch_page.return_value = ShopifyPage(
            body={
                "data": {
                    "orders": {
                        "edges": [{"node": {"id": "not-a-gid", "updatedAt": "invalid"}}],
                        "pageInfo": {"hasNextPage": False, "endCursor": None},
                    }
                }
            },
            status_code=200,
            record_count=1,
            next_cursor=None,
            checkpoint_cursor="2024-03-15T12:00:00Z",
            has_more=False,
        )
        runner_mod._shopify_clients["orders"] = mock_client

        result = runner_mod.handler({
            "source": "shopify",
            "stream": "orders",
            "store_id": STORE_ID,
        })

        assert result["status"] == "error"
        assert result["records_failed"] == 1
        assert result["records_processed"] == 0
        # Cursor NOT saved
        assert ("shopify", "orders", STORE_ID) not in pg.cursors

    @patch("time.sleep")
    def test_rate_limit_retry(self, mock_sleep, inject_dependencies):
        orders = load_all_order_fixtures()

        reset_at = datetime.now(timezone.utc)
        mock_client = MagicMock()
        mock_client.fetch_page.side_effect = [
            # First call: 429
            ShopifyPage(
                body={},
                status_code=429,
                record_count=0,
                next_cursor=None,
                checkpoint_cursor=None,
                has_more=True,
                rate_limit_remaining=0,
                rate_limit_reset_at=reset_at,
            ),
            # Second call: success
            ShopifyPage(
                body={
                    "data": {
                        "orders": {
                            "edges": [{"node": orders[0]}],
                            "pageInfo": {"hasNextPage": False, "endCursor": None},
                        }
                    }
                },
                status_code=200,
                record_count=1,
                next_cursor=None,
                checkpoint_cursor="2024-03-15T10:00:00Z",
                has_more=False,
            ),
        ]
        runner_mod._shopify_clients["orders"] = mock_client

        result = runner_mod.handler({
            "source": "shopify",
            "stream": "orders",
            "store_id": STORE_ID,
        })

        assert result["status"] == "success"
        assert result["records_processed"] == 1
        assert mock_sleep.called

    def test_empty_first_run(self, inject_dependencies):
        pg = inject_dependencies["pg"]

        mock_client = MagicMock()
        mock_client.fetch_page.return_value = ShopifyPage(
            body={"data": {"orders": {"edges": [], "pageInfo": {"hasNextPage": False, "endCursor": None}}}},
            status_code=200,
            record_count=0,
            next_cursor=None,
            checkpoint_cursor=None,
            has_more=False,
        )
        runner_mod._shopify_clients["orders"] = mock_client

        result = runner_mod.handler({
            "source": "shopify",
            "stream": "orders",
            "store_id": STORE_ID,
        })

        assert result["status"] == "success"
        assert result["records_processed"] == 0
        assert result["pages"] == 1
        # No cursor to save
        assert ("shopify", "orders", STORE_ID) not in pg.cursors


class TestGorgiasStreamRunner:

    def test_full_run(self, inject_dependencies):
        pg = inject_dependencies["pg"]
        tickets = load_all_gorgias_ticket_fixtures()

        mock_client = MagicMock()
        mock_client.fetch_page.return_value = GorgiasPage(
            body={"data": tickets},
            status_code=200,
            record_count=len(tickets),
            next_cursor=None,
            checkpoint_cursor="2024-03-15T12:00:00Z",
            has_more=False,
        )
        runner_mod._gorgias_client = mock_client

        result = runner_mod.handler({
            "source": "gorgias",
            "stream": "tickets",
            "store_id": STORE_ID,
        })

        assert result["status"] == "success"
        assert result["records_processed"] == len(tickets)
        assert result["records_failed"] == 0
        assert len(pg.tickets) == len(tickets)

        cursor_entry = pg.cursors.get(("gorgias", "tickets", STORE_ID))
        assert cursor_entry is not None
        assert cursor_entry["cursor_value"] == "2024-03-15T12:00:00Z"


class TestMaxPagesRespected:

    def test_exits_at_max_pages(self, inject_dependencies):
        orders = load_all_order_fixtures()

        mock_client = MagicMock()
        # Always return has_more=True — handler must stop at max_pages
        mock_client.fetch_page.return_value = ShopifyPage(
            body={
                "data": {
                    "orders": {
                        "edges": [{"node": orders[0]}],
                        "pageInfo": {"hasNextPage": True, "endCursor": "cursor-N"},
                    }
                }
            },
            status_code=200,
            record_count=1,
            next_cursor='{"checkpoint":"2024-03-15T10:00:00Z","page_cursor":"cursor-N"}',
            checkpoint_cursor="2024-03-15T10:00:00Z",
            has_more=True,
        )
        runner_mod._shopify_clients["orders"] = mock_client

        result = runner_mod.handler({
            "source": "shopify",
            "stream": "orders",
            "store_id": STORE_ID,
        })

        # Shopify config has max_pages_per_run=200
        assert result["pages"] == 200
        assert mock_client.fetch_page.call_count == 200
