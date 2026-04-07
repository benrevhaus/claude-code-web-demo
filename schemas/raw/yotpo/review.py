"""Raw Yotpo review models — permissive, extra="allow"."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, model_validator


class YotpoReviewRaw(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    score: Optional[int] = None
    title: Optional[str] = None
    content: Optional[str] = None
    sentiment: Optional[float] = None
    votes_up: Optional[int] = 0
    votes_down: Optional[int] = 0
    product_id: Optional[int] = None
    domain_key: Optional[str] = None
    sku: Optional[str] = None
    reviewer_type: Optional[str] = None
    verified_buyer: Optional[bool] = None
    source_review_id: Optional[int] = None
    images_data: Optional[list[dict]] = None
    videos_data: Optional[list[dict]] = None
    deleted: Optional[bool] = False
    name: Optional[str] = None
    email: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_raw_review(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        # Normalize nested product association
        if "product" in normalized and isinstance(normalized["product"], dict):
            if "domain_key" not in normalized or normalized["domain_key"] is None:
                normalized["domain_key"] = normalized["product"].get("domain_key")
            if "product_id" not in normalized or normalized["product_id"] is None:
                normalized["product_id"] = normalized["product"].get("id")
        # Ensure media lists are always lists
        if normalized.get("images_data") is None:
            normalized["images_data"] = []
        if normalized.get("videos_data") is None:
            normalized["videos_data"] = []
        return normalized


class YotpoReviewsPageRaw(BaseModel):
    model_config = ConfigDict(extra="allow")

    reviews: list[YotpoReviewRaw] = []

    @model_validator(mode="before")
    @classmethod
    def normalize_page(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        # Yotpo wraps reviews under "reviews" key, sometimes nested in "response"
        if "response" in data and isinstance(data["response"], dict):
            response = data["response"]
            if "reviews" in response:
                return {"reviews": response["reviews"]}
        if "reviews" in data:
            return data
        return {"reviews": []}
