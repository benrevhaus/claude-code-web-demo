"""Raw Yotpo review models — permissive, extra="allow".

Reviews come from the widget endpoint (/v1/widget/{app_key}/products/{domain_key}/reviews.json)
which returns product context, verified_buyer, images_data, and user info.
The client injects domain_key and flattens user fields before parsing.
"""

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
    # Product linkage — injected by client from product context
    domain_key: Optional[str] = None
    product_id: Optional[int] = None        # Yotpo internal product ID
    product_yotpo_id: Optional[int] = None  # Alias injected by client
    product_name: Optional[str] = None
    # Review metadata
    verified_buyer: Optional[bool] = None
    is_incentivized: Optional[bool] = False
    incentive_type: Optional[str] = None
    source_review_id: Optional[int] = None
    reviewer_type: Optional[str] = None
    # Media — present on widget endpoint, null when no media attached
    images_data: Optional[list[dict]] = None
    # User info — flattened by client from nested user object
    name: Optional[str] = None              # display_name from user object
    # Fields from merchant endpoint (not on widget, but accepted if present)
    email: Optional[str] = None
    sku: Optional[str] = None
    # Status
    deleted: Optional[bool] = False
    archived: Optional[bool] = False
    # Timestamps
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    # Merchant reply
    comment: Optional[dict] = None
    custom_fields: Optional[dict] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_raw_review(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        # Flatten nested user object if present
        user = normalized.get("user")
        if isinstance(user, dict):
            if not normalized.get("name"):
                normalized["name"] = user.get("display_name")
            if not normalized.get("reviewer_type"):
                normalized["reviewer_type"] = user.get("user_type")
        # Ensure media is a list (null from API → empty list)
        if normalized.get("images_data") is None:
            normalized["images_data"] = []
        # product_id from widget → product_yotpo_id for clarity
        if "product_id" in normalized and "product_yotpo_id" not in normalized:
            normalized["product_yotpo_id"] = normalized["product_id"]
        return normalized


class YotpoReviewsPageRaw(BaseModel):
    model_config = ConfigDict(extra="allow")

    reviews: list[YotpoReviewRaw] = []

    @model_validator(mode="before")
    @classmethod
    def normalize_page(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        # Widget response nests under "response.reviews"
        if "response" in data and isinstance(data["response"], dict):
            response = data["response"]
            if "reviews" in response:
                return {"reviews": response["reviews"]}
        if "reviews" in data:
            return data
        return {"reviews": []}
