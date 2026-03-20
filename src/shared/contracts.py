"""Pydantic input/output contracts for all Lambda runtime roles.

This is the interface boundary. Every Lambda's input/output is defined here.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from src.shared.stream_config import StreamConfig


# --- initializer ---


class InitializerInput(BaseModel):
    source: str
    stream: str
    store_id: str
    max_pages: Optional[int] = None
    cursor_override: Optional[str] = None
    max_pages_override: Optional[int] = None


class InitializerOutput(BaseModel):
    run_id: str
    stream_config: StreamConfig
    store_id: str
    cursor: Optional[str] = None
    page_number: int = 1
    total_records: int = 0
    total_pages: int = 0
    max_pages: int
    status: str = "running"


# --- shopify-poller ---


class PollerInput(BaseModel):
    run_id: str
    stream_config: StreamConfig
    store_id: str
    cursor: Optional[str] = None
    page_number: int = 1


class PollerOutput(BaseModel):
    run_id: str
    s3_key: str
    record_count: int
    next_cursor: Optional[str] = None
    has_more: bool
    http_status: int
    rate_limit_remaining: Optional[int] = None
    rate_limit_reset_at: Optional[datetime] = None


# --- processor ---


class ProcessorInput(BaseModel):
    source: str
    stream: str
    s3_key: str
    run_id: Optional[str] = None
    store_id: str
    trigger: str  # "poll" | "webhook" | "replay"


class ProcessorOutput(BaseModel):
    records_processed: int = 0
    records_skipped: int = 0
    records_failed: int = 0
    schema_version: str = ""
    errors: list[str] = Field(default_factory=list)


# --- run-finalizer ---


class FinalizerInput(BaseModel):
    run_id: str
    stream_config: StreamConfig
    store_id: str
    total_pages: int
    total_records: int
    status: str  # "success" | "partial_failure" | "error"
    error_message: Optional[str] = None
    final_cursor: Optional[str] = None


class FinalizerOutput(BaseModel):
    run_id: str
    freshness_lag_minutes: float
    status: str
