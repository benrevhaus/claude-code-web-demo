"""Tests for Gorgias schemas, transforms, and cursor strategy."""

from unittest.mock import patch

from schemas.canonical.gorgias.transforms import transform_gorgias_ticket
from schemas.raw.gorgias.ticket import GorgiasTicketRaw, GorgiasTicketsPageRaw
from src.shared.gorgias_client import GorgiasTicketsClient
from src.shared.gorgias_client import decode_cursor_state, encode_cursor_state
from tests.conftest import load_all_gorgias_ticket_fixtures, load_fixture


class TestGorgiasRawModelParsing:
    def test_parse_ticket_1(self):
        ticket = GorgiasTicketRaw(**load_fixture("gorgias/tickets/ticket_1.json"))
        assert ticket.id == 1001
        assert ticket.subject == "Where is my order?"
        assert ticket.tags[0].name == "vip"

    def test_parse_ticket_2_channel_object(self):
        ticket = GorgiasTicketRaw(**load_fixture("gorgias/tickets/ticket_2.json"))
        assert ticket.id == 1002
        assert ticket.channel == "chat"
        assert ticket.tags[0] == "refund"

    def test_parse_ticket_page(self):
        page = GorgiasTicketsPageRaw(data=load_all_gorgias_ticket_fixtures())
        assert len(page.data) == 2


class TestGorgiasTransform:
    def test_transform_ticket(self):
        raw = GorgiasTicketRaw(**load_fixture("gorgias/tickets/ticket_1.json"))
        canonical = transform_gorgias_ticket(raw, "vitalityextracts")

        assert canonical.id == 1001
        assert canonical.store_id == "vitalityextracts"
        assert canonical.status == "open"
        assert canonical.updated_datetime.isoformat() == "2026-03-01T10:15:00+00:00"
        assert canonical.tags == ["vip", "shipping"]
        assert canonical.customer["email"] == "alice@example.com"


class TestGorgiasCursorState:
    def test_encode_decode_cursor_state(self):
        encoded = encode_cursor_state("2026-03-01T10:00:00Z", "abc123", "2026-03-05T12:00:00Z")
        checkpoint, page_cursor, high_water = decode_cursor_state(encoded)

        assert checkpoint == "2026-03-01T10:00:00Z"
        assert page_cursor == "abc123"
        assert high_water == "2026-03-05T12:00:00Z"

    def test_decode_plain_checkpoint_cursor(self):
        checkpoint, page_cursor, high_water = decode_cursor_state("2026-03-01T10:00:00Z")
        assert checkpoint == "2026-03-01T10:00:00Z"
        assert page_cursor is None
        assert high_water is None


class TestGorgiasCheckpointAdvancement:
    def test_descending_partial_page_does_not_advance_durable_checkpoint(self):
        payload = {
            "data": [
                {"id": 10, "updated_datetime": "2026-03-05T10:00:00Z"},
                {"id": 9, "updated_datetime": "2026-03-05T09:00:00Z"},
            ],
            "meta": {"next_cursor": "next-page"},
        }

        class MockHeaders(dict):
            def get(self, key, default=None):
                return super().get(key, default)

        class MockResponse:
            status = 200
            headers = MockHeaders()

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                import json

                return json.dumps(payload).encode("utf-8")

        client = GorgiasTicketsClient(email="x", api_key="y")
        cursor = encode_cursor_state("2026-03-01T00:00:00Z", None, None)

        with patch("src.shared.gorgias_client.urlopen", return_value=MockResponse()):
            page = client.fetch_page(
                store_id="vitalityextracts",
                endpoint="tickets",
                api_version="v1",
                cursor=cursor,
                page_size=2,
            )

        assert page.has_more is True
        assert page.next_cursor is not None
        assert page.checkpoint_cursor == "2026-03-01T00:00:00Z"

    def test_descending_completed_delta_advances_durable_checkpoint(self):
        payload = {
            "data": [
                {"id": 10, "updated_datetime": "2026-03-05T10:00:00Z"},
                {"id": 9, "updated_datetime": "2026-03-01T00:00:00Z"},
            ],
            "meta": {"next_cursor": "next-page"},
        }

        class MockHeaders(dict):
            def get(self, key, default=None):
                return super().get(key, default)

        class MockResponse:
            status = 200
            headers = MockHeaders()

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                import json

                return json.dumps(payload).encode("utf-8")

        client = GorgiasTicketsClient(email="x", api_key="y")
        cursor = encode_cursor_state("2026-03-01T00:00:00Z", None, None)

        with patch("src.shared.gorgias_client.urlopen", return_value=MockResponse()):
            page = client.fetch_page(
                store_id="vitalityextracts",
                endpoint="tickets",
                api_version="v1",
                cursor=cursor,
                page_size=2,
            )

        assert page.has_more is False
        assert page.next_cursor is None
        assert page.checkpoint_cursor == "2026-03-05T10:00:00Z"
