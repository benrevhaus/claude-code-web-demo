"""Tests for the review publication module."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from src.shared.review_publisher import check_publication_readiness


class FakeCursor:
    """Minimal cursor mock for pg tests."""

    def __init__(self, rows=None):
        self._rows = rows or []

    def execute(self, sql, params=None):
        pass

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class FakePg:
    """Minimal PgClient mock."""

    def __init__(self, cursor_rows=None):
        self._cursor_rows = cursor_rows or []
        self._conn = MagicMock()
        self._conn.cursor.return_value = FakeCursor(self._cursor_rows)

    def _ensure_connection(self):
        pass

    @property
    def connection(self):
        return self._conn

    def commit(self):
        pass

    def rollback(self):
        pass


class TestPublicationReadiness:
    def _now(self):
        return datetime.now(timezone.utc)

    def test_both_fresh_returns_true(self):
        now = self._now()
        pg = FakePg(cursor_rows=[
            ("reviews", "success", now - timedelta(minutes=5)),
            ("review-metadata", "success", now - timedelta(minutes=10)),
        ])
        assert check_publication_readiness(pg, "yotpo", "test-store") is True

    def test_missing_stream_returns_false(self):
        now = self._now()
        pg = FakePg(cursor_rows=[
            ("reviews", "success", now - timedelta(minutes=5)),
        ])
        assert check_publication_readiness(pg, "yotpo", "test-store") is False

    def test_no_streams_returns_false(self):
        pg = FakePg(cursor_rows=[])
        assert check_publication_readiness(pg, "yotpo", "test-store") is False

    def test_reviews_stale_returns_false(self):
        now = self._now()
        pg = FakePg(cursor_rows=[
            ("reviews", "success", now - timedelta(minutes=60)),
            ("review-metadata", "success", now - timedelta(minutes=10)),
        ])
        assert check_publication_readiness(pg, "yotpo", "test-store") is False

    def test_metadata_stale_returns_false(self):
        now = self._now()
        pg = FakePg(cursor_rows=[
            ("reviews", "success", now - timedelta(minutes=5)),
            ("review-metadata", "success", now - timedelta(hours=3)),
        ])
        assert check_publication_readiness(pg, "yotpo", "test-store") is False

    def test_reviews_failed_returns_false(self):
        now = self._now()
        pg = FakePg(cursor_rows=[
            ("reviews", "error", now - timedelta(minutes=5)),
            ("review-metadata", "success", now - timedelta(minutes=10)),
        ])
        assert check_publication_readiness(pg, "yotpo", "test-store") is False

    def test_custom_thresholds(self):
        now = self._now()
        pg = FakePg(cursor_rows=[
            ("reviews", "success", now - timedelta(minutes=50)),
            ("review-metadata", "success", now - timedelta(minutes=10)),
        ])
        # Default threshold 30 min would fail, but 60 min passes
        assert check_publication_readiness(pg, "yotpo", "test-store", reviews_threshold_min=60) is True
