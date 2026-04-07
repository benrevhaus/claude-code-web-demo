"""Tests for Yotpo raw models, transforms, and cursor management."""

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from schemas.canonical.yotpo.review_metadata_v1 import YotpoReviewMetadataV1
from schemas.canonical.yotpo.review_v1 import YotpoReviewV1
from schemas.canonical.yotpo.transforms import (
    transform_yotpo_review,
    transform_yotpo_review_metadata,
)
from schemas.raw.yotpo.review import YotpoReviewRaw, YotpoReviewsPageRaw
from schemas.raw.yotpo.review_metadata import (
    YotpoReviewMetadataRaw,
    YotpoReviewMetadataPageRaw,
)

FIXTURES = Path(__file__).parent / "fixtures" / "yotpo"


def _load_fixture(path: str) -> dict:
    with open(FIXTURES / path) as f:
        return json.load(f)


# ── Raw model parsing ───────────────────────────────────────────────────

class TestRawReviewParsing:
    def test_parse_review_with_all_fields(self):
        data = _load_fixture("reviews/review_1.json")
        raw = YotpoReviewRaw(**data)
        assert raw.id == 982341771
        assert raw.score == 5
        assert raw.domain_key == "35677700"
        assert raw.verified_buyer is True
        assert len(raw.images_data) == 1
        assert raw.videos_data == []
        assert raw.deleted is False

    def test_parse_review_missing_domain_key(self):
        data = _load_fixture("reviews/review_2.json")
        raw = YotpoReviewRaw(**data)
        assert raw.id == 982341772
        assert raw.domain_key is None
        assert raw.product_id is None
        assert raw.verified_buyer is False

    def test_extra_fields_accepted(self):
        data = _load_fixture("reviews/review_1.json")
        data["unknown_future_field"] = "surprise"
        raw = YotpoReviewRaw(**data)
        assert raw.id == 982341771

    def test_nested_product_normalization(self):
        data = {"id": 100, "product": {"id": 999, "domain_key": "dk-42"}}
        raw = YotpoReviewRaw(**data)
        assert raw.product_id == 999
        assert raw.domain_key == "dk-42"

    def test_page_wrapper(self):
        data = {"reviews": [_load_fixture("reviews/review_1.json")]}
        page = YotpoReviewsPageRaw(**data)
        assert len(page.reviews) == 1
        assert page.reviews[0].id == 982341771

    def test_page_wrapper_nested_response(self):
        data = {"response": {"reviews": [_load_fixture("reviews/review_1.json")]}}
        page = YotpoReviewsPageRaw(**data)
        assert len(page.reviews) == 1

    def test_page_wrapper_empty(self):
        page = YotpoReviewsPageRaw(**{})
        assert page.reviews == []


class TestRawMetadataParsing:
    def test_parse_metadata(self):
        data = _load_fixture("review_metadata/metadata_1.json")
        raw = YotpoReviewMetadataRaw(**data)
        assert raw.review_id == 982341771
        assert raw.country == "United States"
        assert raw.country_code == "US"
        assert raw.state == "California"
        assert raw.state_code == "CA"

    def test_reviewer_normalization(self):
        data = {
            "review_id": 100,
            "reviewer": {"country": "Canada", "country_code": "CA", "state": "Ontario", "state_code": "ON"},
        }
        raw = YotpoReviewMetadataRaw(**data)
        assert raw.country == "Canada"
        assert raw.state_code == "ON"

    def test_metadata_page_wrapper(self):
        data = {"metadata": [_load_fixture("review_metadata/metadata_1.json")]}
        page = YotpoReviewMetadataPageRaw(**data)
        assert len(page.metadata) == 1


# ── Transforms ──────────────────────────────────────────────────────────

class TestReviewTransform:
    def test_basic_transform(self):
        data = _load_fixture("reviews/review_1.json")
        raw = YotpoReviewRaw(**data)
        canonical = transform_yotpo_review(raw, "test-store")

        assert isinstance(canonical, YotpoReviewV1)
        assert canonical.id == 982341771
        assert canonical.store_id == "test-store"
        assert canonical.score == 5
        assert canonical.domain_key == "35677700"
        assert canonical.product_yotpo_id == 44556677
        assert canonical.votes_up == 12
        assert canonical.votes_down == 1
        assert isinstance(canonical.created_at, datetime)
        assert isinstance(canonical.updated_at, datetime)
        assert canonical.images_data == [{"id": 1001, "thumb_url": "https://cdn.yotpo.com/thumb_1.jpg", "original_url": "https://cdn.yotpo.com/original_1.jpg"}]

    def test_transform_missing_fields(self):
        data = _load_fixture("reviews/review_2.json")
        raw = YotpoReviewRaw(**data)
        canonical = transform_yotpo_review(raw, "test-store")

        assert canonical.domain_key is None
        assert canonical.product_yotpo_id is None
        assert canonical.votes_up == 2
        assert canonical.images_data == []


class TestMetadataTransform:
    def test_basic_transform(self):
        data = _load_fixture("review_metadata/metadata_1.json")
        raw = YotpoReviewMetadataRaw(**data)
        canonical = transform_yotpo_review_metadata(raw, "test-store")

        assert isinstance(canonical, YotpoReviewMetadataV1)
        assert canonical.review_id == 982341771
        assert canonical.store_id == "test-store"
        assert canonical.country == "United States"
        assert canonical.country_code == "US"
        assert isinstance(canonical.updated_at, datetime)


# ── Cursor state ────────────────────────────────────────────────────────

class TestCursorState:
    def test_encode_decode_roundtrip(self):
        from src.shared.yotpo_client import encode_cursor_state, decode_cursor_state

        encoded = encode_cursor_state("2026-01-01T00:00:00Z", "2", "2026-01-15T00:00:00Z")
        checkpoint, page_cursor, high_water = decode_cursor_state(encoded)
        assert checkpoint == "2026-01-01T00:00:00Z"
        assert page_cursor == "2"
        assert high_water == "2026-01-15T00:00:00Z"

    def test_decode_none(self):
        from src.shared.yotpo_client import decode_cursor_state

        assert decode_cursor_state(None) == (None, None, None)

    def test_decode_legacy_plain_string(self):
        from src.shared.yotpo_client import decode_cursor_state

        checkpoint, page_cursor, high_water = decode_cursor_state("2026-01-01T00:00:00Z")
        assert checkpoint == "2026-01-01T00:00:00Z"
        assert page_cursor is None
        assert high_water is None

    def test_encode_all_none(self):
        from src.shared.yotpo_client import encode_cursor_state

        assert encode_cursor_state(None, None, None) is None
