"""End-to-end local test using moto mocks for S3 and DynamoDB.

Runs the full pipeline: poller → S3 → processor → (mock Postgres) → finalizer.
No AWS credentials needed.
"""

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

import boto3
import pytest
from moto import mock_aws

from schemas.raw.shopify.order import ShopifyOrdersPageRaw
from src.lambdas.finalizer import handler as finalizer_mod
from src.lambdas.poller import handler as poller_mod
from src.lambdas.poller.handler import ShopifyResponse
from src.lambdas.processor import handler as processor_mod
from src.shared.contracts import FinalizerInput, PollerInput, ProcessorInput
from src.shared.dynamo_control import DynamoControl
from src.shared.observability import MetricsClient
from src.shared.pg_client import PgClient
from src.shared.s3_writer import S3Writer
from src.shared.stream_config import load_stream_config
from tests.conftest import load_all_order_fixtures

BUCKET = "data-streams-raw-dev"
TABLE = "data-streams-control-dev"
STORE_ID = "teststore"


@pytest.fixture
def aws_env():
    """Set up mocked S3 and DynamoDB."""
    with mock_aws():
        # Create S3 bucket
        s3_client = boto3.client("s3", region_name="us-east-1")
        s3_client.create_bucket(Bucket=BUCKET)

        # Create DynamoDB table
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        dynamodb.create_table(
            TableName=TABLE,
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        # Build shared dependencies
        s3_writer = S3Writer(bucket=BUCKET, s3_client=s3_client)
        dynamo = DynamoControl(table_name=TABLE, dynamodb_resource=dynamodb)
        metrics = MetricsClient(cloudwatch_client=MagicMock())

        # Mock PgClient that tracks calls without a real database
        pg = MockPgClient()

        yield {
            "s3_client": s3_client,
            "s3_writer": s3_writer,
            "dynamodb": dynamodb,
            "dynamo": dynamo,
            "metrics": metrics,
            "pg": pg,
        }


class MockPgClient:
    """In-memory mock for PgClient — tracks upserts and history writes."""

    def __init__(self):
        self.orders: dict[tuple[int, str], dict] = {}
        self.history: list[dict] = []

    def upsert_order(self, order, s3_key, schema_version, run_id=None):
        data = order.model_dump(mode="json")
        key = (data["id"], data["store_id"])
        existing = self.orders.get(key)
        if existing and existing.get("updated_at", "") >= str(data.get("updated_at", "")):
            return False  # Don't overwrite newer data
        self.orders[key] = {**data, "raw_s3_key": s3_key, "schema_version": schema_version, "run_id": run_id}
        return True

    def insert_order_history(self, order, run_id=None):
        data = order.model_dump(mode="json")
        self.history.append({**data, "run_id": run_id})

    def commit(self):
        pass

    def rollback(self):
        pass


class TestEndToEndLocal:
    """Full pipeline test: poller → processor → finalizer."""

    def test_full_pipeline(self, aws_env):
        config = load_stream_config("streams/shopify-orders.yaml")
        run_id = str(uuid.uuid4())

        # --- Step 1: Poller ---
        # Inject dependencies
        poller_mod._s3_writer = aws_env["s3_writer"]
        poller_mod._dynamo = aws_env["dynamo"]

        # Mock Shopify client that returns our fixtures
        orders = load_all_order_fixtures()
        mock_shopify = MagicMock()
        mock_shopify.fetch_page.return_value = ShopifyResponse(
            body={"orders": orders},
            status_code=200,
            record_count=len(orders),
            next_cursor=None,
            has_more=False,
        )
        poller_mod._shopify_client = mock_shopify

        # Create run record
        aws_env["dynamo"].create_run(
            source="shopify", stream="orders", store_id=STORE_ID,
            run_id=run_id, trigger="poll",
        )

        poller_input = PollerInput(
            run_id=run_id,
            stream_config=config,
            store_id=STORE_ID,
            cursor=None,
            page_number=1,
        )
        poller_result = poller_mod.handler(poller_input.model_dump(mode="json"))

        assert poller_result["http_status"] == 200
        assert poller_result["record_count"] == 3
        assert poller_result["has_more"] is False
        s3_key = poller_result["s3_key"]
        assert s3_key.startswith("shopify/orders/teststore/")
        assert s3_key.endswith(".json.gz")

        # Verify raw payload in S3
        raw_back = aws_env["s3_writer"].read_raw(s3_key)
        assert len(raw_back["orders"]) == 3

        # --- Step 2: Processor ---
        processor_mod._s3_writer = aws_env["s3_writer"]
        processor_mod._dynamo = aws_env["dynamo"]
        processor_mod._pg = aws_env["pg"]
        processor_mod._metrics = aws_env["metrics"]

        processor_input = ProcessorInput(
            source="shopify",
            stream="orders",
            s3_key=s3_key,
            run_id=run_id,
            store_id=STORE_ID,
            trigger="poll",
        )
        proc_result = processor_mod.handler(processor_input.model_dump(mode="json"))

        assert proc_result["records_processed"] == 3
        assert proc_result["records_skipped"] == 0
        assert proc_result["records_failed"] == 0
        assert proc_result["schema_version"] == "shopify.order.v3"

        # Verify mock Postgres state
        assert len(aws_env["pg"].orders) == 3
        assert (5678901234, STORE_ID) in aws_env["pg"].orders
        assert aws_env["pg"].orders[(5678901234, STORE_ID)]["email"] == "alice@example.com"
        assert len(aws_env["pg"].history) == 3

        # --- Step 3: Processor again (idempotency) ---
        proc_result_2 = processor_mod.handler(processor_input.model_dump(mode="json"))

        assert proc_result_2["records_processed"] == 0
        assert proc_result_2["records_skipped"] == 3  # All skipped on retry
        assert proc_result_2["records_failed"] == 0

        # --- Step 4: Finalizer ---
        finalizer_mod._dynamo = aws_env["dynamo"]
        finalizer_mod._metrics = aws_env["metrics"]

        finalizer_input = FinalizerInput(
            run_id=run_id,
            stream_config=config,
            store_id=STORE_ID,
            total_pages=1,
            total_records=3,
            status="success",
            final_cursor="2024-03-15T11:30:00Z",
        )
        fin_result = finalizer_mod.handler(finalizer_input.model_dump(mode="json"))

        assert fin_result["status"] == "success"
        assert fin_result["freshness_lag_minutes"] > 0

        # Verify DynamoDB state
        cursor = aws_env["dynamo"].get_cursor("shopify", "orders", STORE_ID)
        assert cursor == "2024-03-15T11:30:00Z"

    def test_poller_writes_correct_s3_metadata(self, aws_env):
        config = load_stream_config("streams/shopify-orders.yaml")
        run_id = str(uuid.uuid4())

        poller_mod._s3_writer = aws_env["s3_writer"]
        poller_mod._dynamo = aws_env["dynamo"]

        mock_shopify = MagicMock()
        mock_shopify.fetch_page.return_value = ShopifyResponse(
            body={"orders": [load_all_order_fixtures()[0]]},
            status_code=200, record_count=1,
            next_cursor="2024-03-15T10:00:00Z", has_more=True,
        )
        poller_mod._shopify_client = mock_shopify

        aws_env["dynamo"].create_run("shopify", "orders", STORE_ID, run_id, "poll")

        result = poller_mod.handler(PollerInput(
            run_id=run_id, stream_config=config, store_id=STORE_ID, page_number=1,
        ).model_dump(mode="json"))

        assert result["has_more"] is True
        assert result["next_cursor"] == "2024-03-15T10:00:00Z"

        # Verify S3 object exists and is readable
        raw = aws_env["s3_writer"].read_raw(result["s3_key"])
        assert len(raw["orders"]) == 1
