"""Strict canonical model for Yotpo reviews — source-canonical layer."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class YotpoReviewV1(BaseModel):
    id: int
    store_id: str
    score: Optional[int] = None
    title: Optional[str] = None
    content: Optional[str] = None
    sentiment: Optional[float] = None
    votes_up: int = 0
    votes_down: int = 0
    # Product linkage
    product_yotpo_id: Optional[int] = None
    domain_key: Optional[str] = None
    product_name: Optional[str] = None
    # Review metadata
    reviewer_type: Optional[str] = None
    verified_buyer: Optional[bool] = None
    is_incentivized: bool = False
    incentive_type: Optional[str] = None
    source_review_id: Optional[int] = None
    # Media
    images_data: list[dict[str, Any]] = []
    # Author
    name: Optional[str] = None
    email: Optional[str] = None
    # Status
    deleted: bool = False
    archived: bool = False
    # Timestamps
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
