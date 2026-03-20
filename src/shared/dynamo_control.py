"""DynamoDB control plane operations: runs, cursors, idempotency, freshness.

This is the ONLY module that talks to DynamoDB.
"""

import hashlib
import time
from datetime import datetime, timezone
from typing import Any, Optional


class DynamoControl:
    """All DynamoDB control plane operations. Uses an injected boto3 resource for testability."""

    def __init__(self, table_name: str, dynamodb_resource: Optional[Any] = None):
        self.table_name = table_name
        self._resource = dynamodb_resource
        self._table = None

    def _ensure_table(self):
        if self._table is None:
            if self._resource is None:
                import boto3

                self._resource = boto3.resource("dynamodb")
            self._table = self._resource.Table(self.table_name)

    # --- Run records ---

    def create_run(
        self, source: str, stream: str, store_id: str, run_id: str, trigger: str, cursor_start: Optional[str] = None
    ) -> dict:
        self._ensure_table()
        now = datetime.now(timezone.utc).isoformat()
        item = {
            "PK": f"STREAM#{source}#{stream}#{store_id}",
            "SK": f"RUN#{run_id}",
            "status": "running",
            "started_at": now,
            "cursor_start": cursor_start,
            "pages": 0,
            "records": 0,
            "records_failed": 0,
            "trigger": trigger,
        }
        self._table.put_item(Item=item)
        return item

    def get_run(self, source: str, stream: str, store_id: str, run_id: str) -> Optional[dict]:
        self._ensure_table()
        response = self._table.get_item(
            Key={"PK": f"STREAM#{source}#{stream}#{store_id}", "SK": f"RUN#{run_id}"}
        )
        return response.get("Item")

    def update_run(self, source: str, stream: str, store_id: str, run_id: str, **updates) -> None:
        self._ensure_table()
        expr_parts = []
        attr_names = {}
        attr_values = {}
        for i, (k, v) in enumerate(updates.items()):
            alias = f"#k{i}"
            val_alias = f":v{i}"
            expr_parts.append(f"{alias} = {val_alias}")
            attr_names[alias] = k
            attr_values[val_alias] = v

        self._table.update_item(
            Key={"PK": f"STREAM#{source}#{stream}#{store_id}", "SK": f"RUN#{run_id}"},
            UpdateExpression="SET " + ", ".join(expr_parts),
            ExpressionAttributeNames=attr_names,
            ExpressionAttributeValues=attr_values,
        )

    def close_run(
        self,
        source: str,
        stream: str,
        store_id: str,
        run_id: str,
        status: str,
        total_pages: int,
        total_records: int,
        error_message: Optional[str] = None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        updates = {
            "status": status,
            "completed_at": now,
            "pages": total_pages,
            "records": total_records,
        }
        if error_message:
            updates["error_message"] = error_message
        self.update_run(source, stream, store_id, run_id, **updates)

    # --- Cursor ---

    def get_cursor(self, source: str, stream: str, store_id: str) -> Optional[str]:
        self._ensure_table()
        resp = self._table.get_item(
            Key={"PK": f"STREAM#{source}#{stream}#{store_id}", "SK": "CURSOR#current"}
        )
        item = resp.get("Item")
        return item["cursor_value"] if item else None

    def update_cursor(self, source: str, stream: str, store_id: str, cursor_value: str, run_id: str) -> None:
        self._ensure_table()
        now = datetime.now(timezone.utc).isoformat()
        self._table.put_item(
            Item={
                "PK": f"STREAM#{source}#{stream}#{store_id}",
                "SK": "CURSOR#current",
                "cursor_value": cursor_value,
                "updated_at": now,
                "run_id": run_id,
            }
        )

    # --- Idempotency ---

    @staticmethod
    def compute_idempotency_key(record: dict, key_fields: list[str]) -> str:
        parts = [str(record[field]) for field in key_fields]
        key_input = ":".join(parts)
        return hashlib.sha256(key_input.encode()).hexdigest()

    def check_idempotency(self, source: str, stream: str, key_hash: str) -> bool:
        """Returns True if this record has already been processed (should skip)."""
        self._ensure_table()
        resp = self._table.get_item(
            Key={"PK": f"IDEM#{source}#{stream}", "SK": key_hash}
        )
        return "Item" in resp

    def write_idempotency(
        self, source: str, stream: str, key_hash: str, run_id: str, s3_key: str
    ) -> None:
        self._ensure_table()
        now = datetime.now(timezone.utc)
        ttl_epoch = int(now.timestamp()) + (30 * 24 * 60 * 60)  # 30 days
        self._table.put_item(
            Item={
                "PK": f"IDEM#{source}#{stream}",
                "SK": key_hash,
                "processed_at": now.isoformat(),
                "run_id": run_id,
                "s3_key": s3_key,
                "TTL": ttl_epoch,
            }
        )

    # --- Freshness ---

    def update_freshness(
        self, source: str, stream: str, store_id: str, last_record_at: str
    ) -> float:
        """Update freshness status and return lag in minutes."""
        self._ensure_table()
        now = datetime.now(timezone.utc)
        last_record_dt = datetime.fromisoformat(last_record_at.replace("Z", "+00:00"))
        lag_minutes = (now - last_record_dt).total_seconds() / 60.0

        self._table.put_item(
            Item={
                "PK": f"STREAM#{source}#{stream}#{store_id}",
                "SK": "FRESHNESS#current",
                "last_record_at": last_record_at,
                "checked_at": now.isoformat(),
                "lag_minutes": str(round(lag_minutes, 1)),
            }
        )
        return lag_minutes
