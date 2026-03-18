"""Tests for idempotency key computation."""

from src.shared.dynamo_control import DynamoControl


class TestIdempotencyKey:
    def test_deterministic(self):
        record = {"order_id": "5678901234", "updated_at": "2024-03-15T10:00:00Z"}
        key1 = DynamoControl.compute_idempotency_key(record, ["order_id", "updated_at"])
        key2 = DynamoControl.compute_idempotency_key(record, ["order_id", "updated_at"])
        assert key1 == key2

    def test_different_values_different_keys(self):
        record_a = {"order_id": "5678901234", "updated_at": "2024-03-15T10:00:00Z"}
        record_b = {"order_id": "5678901234", "updated_at": "2024-03-15T11:00:00Z"}
        key_a = DynamoControl.compute_idempotency_key(record_a, ["order_id", "updated_at"])
        key_b = DynamoControl.compute_idempotency_key(record_b, ["order_id", "updated_at"])
        assert key_a != key_b

    def test_key_is_sha256_hex(self):
        record = {"order_id": "123", "updated_at": "2024-01-01T00:00:00Z"}
        key = DynamoControl.compute_idempotency_key(record, ["order_id", "updated_at"])
        assert len(key) == 64  # SHA-256 hex digest
        assert all(c in "0123456789abcdef" for c in key)

    def test_field_order_matters(self):
        """The key_fields list order determines the hash — this is intentional."""
        record = {"order_id": "123", "updated_at": "2024-01-01"}
        key_ab = DynamoControl.compute_idempotency_key(record, ["order_id", "updated_at"])
        key_ba = DynamoControl.compute_idempotency_key(record, ["updated_at", "order_id"])
        assert key_ab != key_ba
