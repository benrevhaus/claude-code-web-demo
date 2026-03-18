"""Structured logging and CloudWatch metrics helpers."""

import json
import logging
import time
from typing import Any, Optional

import structlog


def setup_logging(service: str, level: str = "INFO") -> structlog.stdlib.BoundLogger:
    """Configure structlog for Lambda with JSON output."""
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
    )
    logging.basicConfig(level=getattr(logging, level), format="%(message)s")
    return structlog.get_logger(service=service)


class MetricsClient:
    """Emit CloudWatch custom metrics. Uses an injected boto3 client for testability."""

    NAMESPACE = "DataStreams"

    def __init__(self, cloudwatch_client: Optional[Any] = None):
        self._client = cloudwatch_client

    def _ensure_client(self):
        if self._client is None:
            import boto3

            self._client = boto3.client("cloudwatch")

    def put_metric(
        self,
        metric_name: str,
        value: float,
        unit: str = "None",
        dimensions: Optional[dict[str, str]] = None,
    ):
        self._ensure_client()
        dim_list = [{"Name": k, "Value": v} for k, v in (dimensions or {}).items()]
        self._client.put_metric_data(
            Namespace=self.NAMESPACE,
            MetricData=[
                {
                    "MetricName": metric_name,
                    "Value": value,
                    "Unit": unit,
                    "Dimensions": dim_list,
                }
            ],
        )

    def emit_freshness(self, source: str, stream: str, store_id: str, lag_minutes: float):
        self.put_metric(
            "freshness_lag_minutes",
            lag_minutes,
            unit="None",
            dimensions={"source": source, "stream": stream, "store_id": store_id},
        )

    def emit_records(self, source: str, stream: str, processed: int, skipped: int, failed: int):
        dims = {"source": source, "stream": stream}
        self.put_metric("records_processed", processed, unit="Count", dimensions=dims)
        self.put_metric("records_skipped", skipped, unit="Count", dimensions=dims)
        self.put_metric("records_failed", failed, unit="Count", dimensions=dims)
