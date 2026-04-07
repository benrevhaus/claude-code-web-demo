"""Raw GA4 event models — permissive, extra="allow".

GA4 events arrive via webhook (GTM server-side → API Gateway → SQS → webhook_consumer).
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, model_validator


class GA4EventRaw(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    event_name: str
    event_timestamp: Optional[str] = None
    client_id: Optional[str] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    measurement_id: Optional[str] = None
    property_id: Optional[str] = None
    source_platform: Optional[str] = None
    page_location: Optional[str] = None
    page_referrer: Optional[str] = None
    gtm_container_id: Optional[str] = None
    params: Optional[dict[str, Any]] = None
    items: Optional[list[dict[str, Any]]] = None
    user_properties: Optional[dict[str, Any]] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_raw_event(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        # Generate deterministic ID if not present
        if not normalized.get("id"):
            import hashlib
            key_parts = [
                str(normalized.get("event_name", "")),
                str(normalized.get("event_timestamp", "")),
                str(normalized.get("client_id", "")),
                str(normalized.get("session_id", "")),
            ]
            normalized["id"] = hashlib.sha256("|".join(key_parts).encode()).hexdigest()[:32]
        return normalized


class GA4EventsPageRaw(BaseModel):
    model_config = ConfigDict(extra="allow")

    events: list[GA4EventRaw] = []

    @model_validator(mode="before")
    @classmethod
    def normalize_page(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        # Webhook delivers single events; wrap in list for page model consistency
        if "events" in data:
            return data
        if "event_name" in data:
            return {"events": [data]}
        return {"events": []}
