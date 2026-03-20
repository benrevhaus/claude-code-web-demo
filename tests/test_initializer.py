"""Tests for the initializer Lambda."""

import boto3
import pytest
from moto import mock_aws

from src.lambdas.initializer import handler as initializer_mod
from src.shared.dynamo_control import DynamoControl

TABLE = "data-streams-control-dev"
STORE_ID = "teststore"


@pytest.fixture
def aws_env():
    with mock_aws():
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

        dynamo = DynamoControl(table_name=TABLE, dynamodb_resource=dynamodb)
        initializer_mod._dynamo = dynamo

        yield {"dynamo": dynamo}

        initializer_mod._dynamo = None


class TestInitializer:
    def test_loads_stream_config_and_creates_run(self, aws_env):
        result = initializer_mod.handler(
            {
                "source": "shopify",
                "stream": "orders",
                "store_id": STORE_ID,
            }
        )

        assert result["stream_config"]["source"] == "shopify"
        assert result["stream_config"]["stream"] == "orders"
        assert result["store_id"] == STORE_ID
        assert result["cursor"] is None
        assert result["page_number"] == 1
        assert result["total_pages"] == 0
        assert result["total_records"] == 0
        assert result["max_pages"] == 200
        assert result["status"] == "running"

        run_item = aws_env["dynamo"]._resource.Table(TABLE).get_item(
            Key={
                "PK": f"STREAM#shopify#orders#{STORE_ID}",
                "SK": f"RUN#{result['run_id']}",
            }
        )["Item"]
        assert run_item["status"] == "running"
        assert run_item["trigger"] == "poll"
        assert run_item["cursor_start"] is None

    def test_uses_saved_cursor_when_present(self, aws_env):
        aws_env["dynamo"].update_cursor(
            source="shopify",
            stream="orders",
            store_id=STORE_ID,
            cursor_value="2024-03-15T11:30:00Z",
            run_id="prior-run",
        )

        result = initializer_mod.handler(
            {
                "source": "shopify",
                "stream": "orders",
                "store_id": STORE_ID,
            }
        )

        assert result["cursor"] == "2024-03-15T11:30:00Z"

    def test_prefers_overrides_for_cursor_and_max_pages(self, aws_env):
        aws_env["dynamo"].update_cursor(
            source="shopify",
            stream="orders",
            store_id=STORE_ID,
            cursor_value="2024-03-15T11:30:00Z",
            run_id="prior-run",
        )

        result = initializer_mod.handler(
            {
                "source": "shopify",
                "stream": "orders",
                "store_id": STORE_ID,
                "cursor_override": "2024-01-01T00:00:00Z",
                "max_pages_override": 5000,
            }
        )

        assert result["cursor"] == "2024-01-01T00:00:00Z"
        assert result["max_pages"] == 5000
