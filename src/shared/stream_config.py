"""Parse stream YAML definitions into validated Pydantic models."""

from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Optional, Union

import yaml
from pydantic import BaseModel, field_validator


class StreamMode(str, Enum):
    GRAPHQL = "graphql"
    REST = "rest"
    WEBHOOK = "webhook"
    GRAPHQL_WEBHOOK = "graphql+webhook"
    REST_WEBHOOK = "rest+webhook"


class CursorType(str, Enum):
    DATETIME = "datetime"
    INTEGER = "integer"
    STRING = "string"


class StreamConfig(BaseModel):
    api_version_spec: str = "streams/v1"
    source: str
    stream: str
    display_name: str
    mode: StreamMode
    api_version: str
    schedule: Optional[str] = None
    backfill_enabled: bool = False
    schema_version: str
    normalizes_to: Optional[str] = None
    idempotency_key: list[str]
    cursor_field: Optional[str] = None
    cursor_type: Optional[CursorType] = None
    freshness_sla_minutes: int
    max_pages_per_run: int = 500
    page_size: int = 50
    rate_limit_bucket: Optional[str] = None
    webhook_topics: Optional[list[str]] = None
    hmac_header: Optional[str] = None
    owner: str
    tags: list[str] = []

    @field_validator("source", "stream")
    @classmethod
    def must_be_lowercase_slug(cls, v: str) -> str:
        import re

        if not re.match(r"^[a-z0-9-]+$", v):
            raise ValueError(f"Must be lowercase alphanumeric + hyphens: {v}")
        return v

    @field_validator("freshness_sla_minutes")
    @classmethod
    def sla_minimum(cls, v: int) -> int:
        if v < 5:
            raise ValueError("freshness_sla_minutes must be >= 5")
        return v

    @field_validator("idempotency_key")
    @classmethod
    def must_have_fields(cls, v: list[str]) -> list[str]:
        if len(v) < 1:
            raise ValueError("idempotency_key must contain at least one field")
        return v

    @property
    def has_polling(self) -> bool:
        return self.mode in (StreamMode.GRAPHQL, StreamMode.REST, StreamMode.GRAPHQL_WEBHOOK, StreamMode.REST_WEBHOOK)

    @property
    def has_webhook(self) -> bool:
        return self.mode in (StreamMode.WEBHOOK, StreamMode.GRAPHQL_WEBHOOK, StreamMode.REST_WEBHOOK)

    @property
    def stream_key(self) -> str:
        return f"{self.source}#{self.stream}"


def load_stream_config(path: Union[str, Path]) -> StreamConfig:
    """Load and validate a stream YAML file."""
    with open(path) as f:
        raw = yaml.safe_load(f)

    # Map YAML field name to model field name
    if "apiVersion" in raw:
        raw["api_version_spec"] = raw.pop("apiVersion")

    return StreamConfig(**raw)


def load_all_stream_configs(streams_dir: Union[str, Path] = "streams") -> dict[str, StreamConfig]:
    """Load all stream configs from a directory. Returns {source#stream: config}."""
    configs = {}
    for path in Path(streams_dir).glob("*.yaml"):
        config = load_stream_config(path)
        configs[config.stream_key] = config
    return configs
