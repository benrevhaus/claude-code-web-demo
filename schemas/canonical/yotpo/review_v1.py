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
    product_yotpo_id: Optional[int] = None
    domain_key: Optional[str] = None
    reviewer_type: Optional[str] = None
    verified_buyer: Optional[bool] = None
    source_review_id: Optional[int] = None
    images_data: list[dict[str, Any]] = []
    videos_data: list[dict[str, Any]] = []
    deleted: bool = False
    name: Optional[str] = None
    email: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
