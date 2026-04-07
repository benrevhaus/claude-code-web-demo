"""Yotpo REST client for polling reviews and review metadata.

Uses the Yotpo merchant API with app_key + secret_key authentication.
Supports incremental polling via since_updated_at cursor.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from src.shared.ssm import get_env_or_ssm


YOTPO_API_BASE = "https://api.yotpo.com"


@dataclass
class YotpoPage:
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


class YotpoClient:
    """Fetch Yotpo reviews and metadata from the merchant REST API."""

    def __init__(self, app_key: str | None = None, secret_key: str | None = None):
        env = os.environ.get("ENV", "dev")
        prefix = os.environ.get("PARAM_PREFIX", "data-streams")
        app_key_param = f"/{prefix}/{env}/yotpo/app_key"
        secret_key_param = f"/{prefix}/{env}/yotpo/secret_key"
        self._app_key = app_key or get_env_or_ssm("YOTPO_APP_KEY", app_key_param)
        self._secret_key = secret_key or get_env_or_ssm("YOTPO_SECRET_KEY", secret_key_param)
        self._utoken: str | None = None

    def _get_utoken(self) -> str:
        """Authenticate with Yotpo and retrieve an access token."""
        if self._utoken:
            return self._utoken

        url = f"{YOTPO_API_BASE}/oauth/token"
        payload = json.dumps({
            "client_id": self._app_key,
            "client_secret": self._secret_key,
            "grant_type": "client_credentials",
        }).encode("utf-8")

        request = Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=15) as response:
            body = json.loads(response.read())
            self._utoken = body["access_token"]
        return self._utoken

    def fetch_page(
        self,
        *,
        store_id: str,
        endpoint: str,
        api_version: str,
        cursor: str | None,
        page_size: int,
    ) -> YotpoPage:
        del api_version  # Yotpo API versioning is in the URL structure

        checkpoint, page_cursor, high_water = decode_cursor_state(cursor)

        # Build query params
        query: dict[str, str] = {"count": str(page_size)}

        # Use page number for pagination (Yotpo uses 1-based page numbers)
        page_num = 1
        if page_cursor:
            try:
                page_num = int(page_cursor)
            except ValueError:
                page_num = 1

        query["page"] = str(page_num)

        # Incremental: use since_updated_at when we have a checkpoint
        if checkpoint:
            query["since_updated_at"] = checkpoint

        utoken = self._get_utoken()
        url = f"{YOTPO_API_BASE}/v1/apps/{self._app_key}/{endpoint}?{urlencode(query)}"

        request = Request(
            url,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {utoken}",
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
                retry_after = int(exc.headers.get("Retry-After", "5"))
                return YotpoPage(
                    body=body,
                    status_code=429,
                    record_count=0,
                    next_cursor=encode_cursor_state(checkpoint, str(page_num), high_water),
                    checkpoint_cursor=high_water or checkpoint,
                    has_more=True,
                    rate_limit_remaining=0,
                    rate_limit_reset_at=datetime.now(timezone.utc) + timedelta(seconds=retry_after),
                )
            if exc.code == 401:
                # Token expired — clear and let next invocation re-auth
                self._utoken = None
                raise RuntimeError(f"Yotpo auth failed (401): {body}")
            if 500 <= exc.code < 600:
                raise
            raise RuntimeError(f"Yotpo API returned {exc.code}: {body}")

        # Extract records — Yotpo nests under "response.reviews" or "response.metadata"
        response_data = body.get("response", body)
        items = (
            response_data.get("reviews")
            or response_data.get("metadata")
            or response_data.get("data")
            or []
        )

        # Track timestamps for cursor management
        updated_values = [
            item.get("updated_at") for item in items if item.get("updated_at")
        ]
        newest_updated = max(updated_values, default=None)
        new_high_water = max(
            (v for v in (high_water, newest_updated, checkpoint) if v is not None),
            default=None,
        )

        # Yotpo uses page-number pagination; check if we got a full page
        has_more = len(items) >= page_size
        next_page = str(page_num + 1) if has_more else None

        # Checkpoint: on the last page, commit the high water mark
        durable_checkpoint = checkpoint
        if not has_more:
            durable_checkpoint = new_high_water

        next_cursor = None
        if has_more:
            next_cursor = encode_cursor_state(checkpoint, next_page, new_high_water)

        rate_remaining, reset_at = self._parse_rate_limit(headers)

        return YotpoPage(
            body=body,
            status_code=status_code,
            record_count=len(items),
            next_cursor=next_cursor,
            checkpoint_cursor=durable_checkpoint,
            has_more=has_more,
            rate_limit_remaining=rate_remaining,
            rate_limit_reset_at=reset_at,
        )

    @staticmethod
    def _parse_rate_limit(headers) -> tuple[int | None, datetime | None]:
        remaining = None
        reset_at = None
        rate_limit = headers.get("X-Yotpo-Rate-Limit-Remaining")
        if rate_limit:
            try:
                remaining = int(rate_limit)
            except ValueError:
                pass
        retry_after = headers.get("Retry-After")
        if retry_after:
            try:
                reset_at = datetime.now(timezone.utc) + timedelta(seconds=int(retry_after))
            except ValueError:
                pass
        return remaining, reset_at

    @staticmethod
    def _read_error_body(exc: HTTPError) -> dict:
        try:
            return json.loads(exc.read())
        except Exception:
            return {"error": str(exc)}
