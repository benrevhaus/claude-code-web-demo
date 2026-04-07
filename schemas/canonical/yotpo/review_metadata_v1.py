"""Strict canonical model for Yotpo review metadata — source-canonical layer."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class YotpoReviewMetadataV1(BaseModel):
    review_id: int
    store_id: str
    country: Optional[str] = None
    country_code: Optional[str] = None
    state: Optional[str] = None
    state_code: Optional[str] = None
    updated_at: Optional[datetime] = None
