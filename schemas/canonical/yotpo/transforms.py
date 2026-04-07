"""Pure transform functions: Yotpo raw → canonical."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from schemas.canonical.yotpo.review_metadata_v1 import YotpoReviewMetadataV1
from schemas.canonical.yotpo.review_v1 import YotpoReviewV1
from schemas.raw.yotpo.review import YotpoReviewRaw
from schemas.raw.yotpo.review_metadata import YotpoReviewMetadataRaw


def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if value is None:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def transform_yotpo_review(raw: YotpoReviewRaw, store_id: str) -> YotpoReviewV1:
    return YotpoReviewV1(
        id=raw.id,
        store_id=store_id,
        score=raw.score,
        title=raw.title,
        content=raw.content,
        sentiment=raw.sentiment,
        votes_up=raw.votes_up or 0,
        votes_down=raw.votes_down or 0,
        product_yotpo_id=raw.product_id,
        domain_key=raw.domain_key,
        reviewer_type=raw.reviewer_type,
        verified_buyer=raw.verified_buyer,
        source_review_id=raw.source_review_id,
        images_data=raw.images_data or [],
        videos_data=raw.videos_data or [],
        deleted=raw.deleted or False,
        name=raw.name,
        email=raw.email,
        created_at=_parse_datetime(raw.created_at),
        updated_at=_parse_datetime(raw.updated_at),
    )


def transform_yotpo_review_metadata(
    raw: YotpoReviewMetadataRaw, store_id: str
) -> YotpoReviewMetadataV1:
    return YotpoReviewMetadataV1(
        review_id=raw.review_id,
        store_id=store_id,
        country=raw.country,
        country_code=raw.country_code,
        state=raw.state,
        state_code=raw.state_code,
        updated_at=_parse_datetime(raw.updated_at),
    )
