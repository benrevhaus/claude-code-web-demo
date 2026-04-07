"""Strict canonical model for GA4 events."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class GA4EventV1(BaseModel):
    id: str
    store_id: str
    event_name: str
    event_timestamp: Optional[datetime] = None
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
