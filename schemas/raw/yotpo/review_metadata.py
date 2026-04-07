"""Raw Yotpo review metadata models — permissive, extra="allow"."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, model_validator


class YotpoReviewMetadataRaw(BaseModel):
    model_config = ConfigDict(extra="allow")

    review_id: int
    country: Optional[str] = None
    country_code: Optional[str] = None
    state: Optional[str] = None
    state_code: Optional[str] = None
    updated_at: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_raw_metadata(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        # Some Yotpo metadata responses nest under "reviewer" or "user_reference"
        if "reviewer" in normalized and isinstance(normalized["reviewer"], dict):
            reviewer = normalized["reviewer"]
            for field in ("country", "country_code", "state", "state_code"):
                if field not in normalized or normalized[field] is None:
                    normalized[field] = reviewer.get(field)
        return normalized


class YotpoReviewMetadataPageRaw(BaseModel):
    model_config = ConfigDict(extra="allow")

    metadata: list[YotpoReviewMetadataRaw] = []

    @model_validator(mode="before")
    @classmethod
    def normalize_page(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if "response" in data and isinstance(data["response"], dict):
            response = data["response"]
            if "metadata" in response:
                return {"metadata": response["metadata"]}
        if "metadata" in data:
            return data
        return {"metadata": []}
