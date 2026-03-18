"""Write raw vendor payloads to S3 with gzip compression and metadata."""

from __future__ import annotations

import gzip
import json
from datetime import datetime, timezone
from typing import Any, Optional


class S3Writer:
    """Writes raw payloads to S3. Uses an injected boto3 client for testability."""

    def __init__(self, bucket: str, s3_client: Optional[Any] = None):
        self.bucket = bucket
        self._client = s3_client

    def _ensure_client(self):
        if self._client is None:
            import boto3

            self._client = boto3.client("s3")

    def build_polling_key(
        self, source: str, stream: str, store_id: str, run_id: str, page_number: int
    ) -> str:
        now = datetime.now(timezone.utc)
        return (
            f"{source}/{stream}/{store_id}/"
            f"{now.year}/{now.month:02d}/{now.day:02d}/"
            f"{run_id}/page_{page_number:03d}.json.gz"
        )

    def build_webhook_key(
        self, source: str, stream: str, store_id: str, webhook_id: str
    ) -> str:
        now = datetime.now(timezone.utc)
        return (
            f"{source}/{stream}/{store_id}/webhooks/"
            f"{now.year}/{now.month:02d}/{now.day:02d}/"
            f"{webhook_id}.json.gz"
        )

    def write_raw(
        self,
        key: str,
        payload: dict | list,
        metadata: dict[str, str],
    ) -> str:
        """Write a gzipped JSON payload to S3 with object metadata. Returns the S3 key."""
        self._ensure_client()

        body = gzip.compress(json.dumps(payload).encode("utf-8"))

        self._client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=body,
            ContentType="application/json",
            ContentEncoding="gzip",
            Metadata=metadata,
        )
        return key

    def read_raw(self, key: str) -> dict | list:
        """Read and decompress a raw payload from S3."""
        self._ensure_client()

        resp = self._client.get_object(Bucket=self.bucket, Key=key)
        body = resp["Body"].read()

        # Handle both gzipped and non-gzipped
        try:
            decompressed = gzip.decompress(body)
        except gzip.BadGzipFile:
            decompressed = body

        return json.loads(decompressed)
