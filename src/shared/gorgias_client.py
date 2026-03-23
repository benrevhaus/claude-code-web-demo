"""Gorgias REST client for polling tickets."""

from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from src.shared.ssm import get_env_or_ssm


@dataclass
class GorgiasPage:
    body: dict
    status_code: int
    record_count: int
    next_cursor: str | None
    checkpoint_cursor: str | None
    has_more: bool
    rate_limit_remaining: int | None = None
    rate_limit_reset_at: datetime | None = None


def encode_cursor_state(
    checkpoint: str | None,
    page_cursor: str | None = None,
    high_water: str | None = None,
) -> str | None:
    if checkpoint is None and page_cursor is None and high_water is None:
        return None
    return json.dumps(
        {"checkpoint": checkpoint, "page_cursor": page_cursor, "high_water": high_water},
        separators=(",", ":"),
    )


def decode_cursor_state(cursor: str | None) -> tuple[str | None, str | None, str | None]:
    if not cursor:
        return None, None, None
    try:
        payload = json.loads(cursor)
    except json.JSONDecodeError:
        return cursor, None, None
    if not isinstance(payload, dict):
        return cursor, None, None
    return payload.get("checkpoint"), payload.get("page_cursor"), payload.get("high_water")


class GorgiasTicketsClient:
    """Fetch Gorgias tickets from the REST API."""

    def __init__(self, email: str | None = None, api_key: str | None = None):
        env = os.environ.get("ENV", "dev")
        prefix = os.environ.get("PARAM_PREFIX", "data-streams")
        email_param = f"/{prefix}/{env}/gorgias/email"
        api_key_param = f"/{prefix}/{env}/gorgias/api_key"
        self._email = email or get_env_or_ssm("GORGIAS_EMAIL", email_param)
        self._api_key = api_key or get_env_or_ssm("GORGIAS_API_KEY", api_key_param)

    def fetch_page(
        self,
        *,
        store_id: str,
        endpoint: str,
        api_version: str,
        cursor: str | None,
        page_size: int,
    ) -> GorgiasPage:
        del api_version

        checkpoint, page_cursor, high_water = decode_cursor_state(cursor)
        domain = store_id if "." in store_id else f"{store_id}.gorgias.com"
        order_by = "updated_datetime:asc" if checkpoint is None else "updated_datetime:desc"

        query = [("limit", str(page_size)), ("order_by", order_by)]
        if page_cursor:
            query.append(("cursor", page_cursor))
        url = f"https://{domain}/api/{endpoint}?{urlencode(query)}"

        request = Request(
            url,
            headers={
                "Accept": "application/json",
                "Authorization": self._basic_auth_header(),
            },
            method="GET",
        )

        try:
            with urlopen(request, timeout=30) as response:
                body = json.loads(response.read())
                headers = response.headers
                status_code = response.status
        except HTTPError as exc:
            body = self._read_error_body(exc)
            if exc.code == 429:
                retry_after = int(exc.headers.get("Retry-After", "1"))
                return GorgiasPage(
                    body=body,
                    status_code=429,
                    record_count=0,
                    next_cursor=encode_cursor_state(checkpoint, page_cursor, high_water),
                    checkpoint_cursor=high_water or checkpoint,
                    has_more=True,
                    rate_limit_remaining=0,
                    rate_limit_reset_at=datetime.now(timezone.utc) + timedelta(seconds=retry_after),
                )
            if 500 <= exc.code < 600:
                raise
            raise RuntimeError(f"Gorgias API returned {exc.code}: {body}")

        items = body.get("data", [])
        next_page_cursor = (body.get("meta") or {}).get("next_cursor")
        oldest_updated = min(
            (item.get("updated_datetime") for item in items if item.get("updated_datetime")),
            default=None,
        )
        newest_updated = max(
            (item.get("updated_datetime") for item in items if item.get("updated_datetime")),
            default=None,
        )
        new_high_water = max(value for value in (high_water, newest_updated, checkpoint) if value is not None) if any(
            value is not None for value in (high_water, newest_updated, checkpoint)
        ) else None

        crossed_checkpoint = bool(checkpoint and oldest_updated and oldest_updated <= checkpoint)
        has_more = bool(next_page_cursor) and not crossed_checkpoint
        durable_checkpoint = checkpoint
        if checkpoint is None or crossed_checkpoint or not next_page_cursor:
            durable_checkpoint = new_high_water
        next_cursor = None
        if has_more:
            next_cursor = encode_cursor_state(checkpoint, str(next_page_cursor), new_high_water)

        rate_remaining, reset_at = self._parse_rate_limit(headers)

        return GorgiasPage(
            body=body,
            status_code=status_code,
            record_count=len(items),
            next_cursor=next_cursor,
            checkpoint_cursor=durable_checkpoint,
            has_more=has_more,
            rate_limit_remaining=rate_remaining,
            rate_limit_reset_at=reset_at,
        )

    def _basic_auth_header(self) -> str:
        token = base64.b64encode(f"{self._email}:{self._api_key}".encode("utf-8")).decode("ascii")
        return f"Basic {token}"

    @staticmethod
    def _parse_rate_limit(headers) -> tuple[int | None, datetime | None]:
        limit_header = headers.get("X-Gorgias-Account-Api-Call-Limit")
        retry_after = headers.get("Retry-After")
        remaining = None
        if limit_header and "/" in limit_header:
            used, burst = limit_header.split("/", 1)
            try:
                remaining = max(int(burst) - int(used), 0)
            except ValueError:
                remaining = None
        reset_at = None
        if retry_after:
            try:
                reset_at = datetime.now(timezone.utc) + timedelta(seconds=int(retry_after))
            except ValueError:
                reset_at = None
        return remaining, reset_at

    @staticmethod
    def _read_error_body(exc: HTTPError) -> dict:
        try:
            return json.loads(exc.read())
        except Exception:
            return {"error": str(exc)}
