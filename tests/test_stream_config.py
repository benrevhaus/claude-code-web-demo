"""Tests for stream config parsing and validation."""

import pytest

from src.shared.stream_config import StreamConfig, StreamMode, load_stream_config


class TestStreamConfigParsing:
    def test_load_shopify_orders_yaml(self):
        config = load_stream_config("streams/shopify-orders.yaml")
        assert config.source == "shopify"
        assert config.stream == "orders"
        assert config.mode == StreamMode.GRAPHQL_WEBHOOK
        assert config.api_version == "2024-01"
        assert config.schedule == "rate(5 minutes)"
        assert config.schema_version == "shopify.order.v3"
        assert config.idempotency_key == ["order_id", "updated_at"]
        assert config.cursor_field == "updated_at"
        assert config.freshness_sla_minutes == 10
        assert config.page_size == 50
        assert config.max_pages_per_run == 200
        assert config.owner == "platform"
        assert "commerce" in config.tags
        assert config.hmac_header == "X-Shopify-Hmac-Sha256"

    def test_has_polling(self):
        config = load_stream_config("streams/shopify-orders.yaml")
        assert config.has_polling is True
        assert config.has_webhook is True

    def test_stream_key(self):
        config = load_stream_config("streams/shopify-orders.yaml")
        assert config.stream_key == "shopify#orders"


class TestStreamConfigValidation:
    def test_rejects_bad_source_name(self):
        with pytest.raises(ValueError, match="lowercase"):
            StreamConfig(
                source="Shopify",  # uppercase not allowed
                stream="orders",
                display_name="Test",
                mode=StreamMode.GRAPHQL,
                api_version="2024-01",
                schema_version="test.v1",
                idempotency_key=["id"],
                freshness_sla_minutes=10,
                owner="test",
            )

    def test_rejects_low_freshness_sla(self):
        with pytest.raises(ValueError, match="freshness_sla_minutes"):
            StreamConfig(
                source="shopify",
                stream="orders",
                display_name="Test",
                mode=StreamMode.GRAPHQL,
                api_version="2024-01",
                schema_version="test.v1",
                idempotency_key=["id"],
                freshness_sla_minutes=2,  # below minimum of 5
                owner="test",
            )

    def test_rejects_empty_idempotency_key(self):
        with pytest.raises(ValueError, match="idempotency_key"):
            StreamConfig(
                source="shopify",
                stream="orders",
                display_name="Test",
                mode=StreamMode.GRAPHQL,
                api_version="2024-01",
                schema_version="test.v1",
                idempotency_key=[],
                freshness_sla_minutes=10,
                owner="test",
            )

    def test_rejects_bad_api_version_spec(self):
        with pytest.raises(ValueError, match="apiVersion must be streams/v1"):
            StreamConfig(
                api_version_spec="streams/v2",
                source="shopify",
                stream="orders",
                display_name="Test",
                mode=StreamMode.GRAPHQL,
                api_version="2024-01",
                schema_version="shopify.order.v3",
                idempotency_key=["order_id", "updated_at"],
                schedule="rate(5 minutes)",
                cursor_field="updated_at",
                cursor_type="datetime",
                freshness_sla_minutes=10,
                owner="test",
            )

    def test_rejects_missing_polling_fields(self):
        with pytest.raises(ValueError, match="schedule is required for polling streams"):
            StreamConfig(
                source="shopify",
                stream="orders",
                display_name="Test",
                mode=StreamMode.GRAPHQL,
                api_version="2024-01",
                schema_version="shopify.order.v3",
                idempotency_key=["order_id", "updated_at"],
                freshness_sla_minutes=10,
                owner="test",
            )

    def test_defaults_rate_limit_bucket_to_source(self):
        config = StreamConfig(
            source="shopify",
            stream="orders",
            display_name="Test",
            mode=StreamMode.GRAPHQL,
            api_version="2024-01",
            schema_version="shopify.order.v3",
            idempotency_key=["order_id", "updated_at"],
            schedule="rate(5 minutes)",
            cursor_field="updated_at",
            cursor_type="datetime",
            freshness_sla_minutes=10,
            owner="test",
        )
        assert config.rate_limit_bucket == "shopify"
