"""Pure transform functions: GA4 raw → canonical."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from schemas.canonical.ga4.event_v1 import GA4EventV1
from schemas.raw.ga4.event import GA4EventRaw


def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if value is None:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def transform_ga4_event(raw: GA4EventRaw, store_id: str) -> GA4EventV1:
    return GA4EventV1(
        id=raw.id or "",
        store_id=store_id,
        event_name=raw.event_name,
        event_timestamp=_parse_datetime(raw.event_timestamp),
        client_id=raw.client_id,
        user_id=raw.user_id,
        session_id=raw.session_id,
        measurement_id=raw.measurement_id,
        property_id=raw.property_id,
        source_platform=raw.source_platform,
        page_location=raw.page_location,
        page_referrer=raw.page_referrer,
        gtm_container_id=raw.gtm_container_id,
        params=raw.params,
        items=raw.items,
        user_properties=raw.user_properties,
    )
