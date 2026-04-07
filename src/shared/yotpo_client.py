"""Yotpo REST client for polling reviews via the widget endpoint.

Two-phase fetch strategy:
  1. bottom_lines endpoint → all product domain_keys (Shopify product IDs)
  2. Widget endpoint per product → reviews with product context (150/page)

The merchant /v1/apps/ endpoint strips product linkage, images, and verified_buyer.
The widget /v1/widget/ endpoint returns all of these, scoped per product.

Auth: app_key + secret_key → utoken via /oauth/token.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from src.shared.ssm import get_env_or_ssm


YOTPO_API_BASE = "https://api.yotpo.com"
YOTPO_CDN_BASE = "https://api-cdn.yotpo.com"

# Widget endpoint max per page
WIDGET_MAX_PER_PAGE = 150


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
    """Fetch Yotpo reviews via bottom_lines + widget per-product strategy.

    The fetch_page() interface is preserved for compatibility with the
    stream_runner handler. Internally, the client manages:
      - A cached product list (domain_keys) fetched from bottom_lines
      - Per-product page iteration via the widget endpoint
      - Cursor state encoding: product_index:page_number within high_water

    The handler sees a flat stream of review pages. The client handles
    the product iteration transparently.
    """

    def __init__(self, app_key: str | None = None, secret_key: str | None = None):
        env = os.environ.get("ENV", "dev")
        prefix = os.environ.get("PARAM_PREFIX", "data-streams")
        app_key_param = f"/{prefix}/{env}/yotpo/app_key"
        secret_key_param = f"/{prefix}/{env}/yotpo/secret_key"
        self._app_key = app_key or get_env_or_ssm("YOTPO_APP_KEY", app_key_param)
        self._secret_key = secret_key or get_env_or_ssm("YOTPO_SECRET_KEY", secret_key_param)
        self._utoken: str | None = None
        self._product_keys: list[str] | None = None

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

    def _fetch_all_product_keys(self) -> list[str]:
        """Paginate bottom_lines to get all domain_keys."""
        if self._product_keys is not None:
            return self._product_keys

        utoken = self._get_utoken()
        all_keys: list[str] = []
        page = 1
        per_page = 100

        while True:
            url = f"{YOTPO_API_BASE}/v1/apps/{self._app_key}/bottom_lines?count={per_page}&page={page}"
            request = Request(
                url,
                headers={"Accept": "application/json", "X-Yotpo-Token": utoken},
            )
            with urlopen(request, timeout=30) as response:
                body = json.loads(response.read())

            bl_response = body.get("response", body)
            bottomlines = bl_response.get("bottomlines", bl_response.get("bottom_lines", []))

            for bl in bottomlines:
                dk = bl.get("domain_key")
                if dk:
                    all_keys.append(str(dk))

            if len(bottomlines) < per_page:
                break
            page += 1

        self._product_keys = all_keys
        return self._product_keys

    def fetch_page(
        self,
        *,
        store_id: str,
        endpoint: str,
        api_version: str,
        cursor: str | None,
        page_size: int,
    ) -> YotpoPage:
        """Fetch one page of reviews, iterating across products transparently.

        Cursor state encodes: product_index:review_page within the product list.
        The handler calls this repeatedly until has_more=False.
        """
        del api_version

        checkpoint, page_cursor, high_water = decode_cursor_state(cursor)

        # Parse cursor: "product_idx:review_page" or start from beginning
        product_idx = 0
        review_page = 1
        if page_cursor:
            parts = page_cursor.split(":", 1)
            try:
                product_idx = int(parts[0])
                review_page = int(parts[1]) if len(parts) > 1 else 1
            except ValueError:
                product_idx = 0
                review_page = 1

        # Get product catalog (cached after first call)
        product_keys = self._fetch_all_product_keys()

        if not product_keys or product_idx >= len(product_keys):
            # No products or past the end — done
            return YotpoPage(
                body={"response": {"reviews": []}},
                status_code=200,
                record_count=0,
                next_cursor=None,
                checkpoint_cursor=high_water or checkpoint,
                has_more=False,
            )

        domain_key = product_keys[product_idx]
        per_page = min(page_size, WIDGET_MAX_PER_PAGE)

        # Fetch reviews for this product via widget endpoint
        widget_url = (
            f"{YOTPO_CDN_BASE}/v1/widget/{self._app_key}"
            f"/products/{domain_key}/reviews.json"
            f"?per_page={per_page}&page={review_page}"
        )
        request = Request(
            widget_url,
            headers={"Accept": "application/json"},
        )

        try:
            with urlopen(request, timeout=30) as response:
                body = json.loads(response.read())
                headers = response.headers
                status_code = response.status
        except HTTPError as exc:
            body = self._read_error_body(exc)
            if exc.code == 429:
                retry_after = int(exc.headers.get("Retry-After", "2"))
                return YotpoPage(
                    body=body,
                    status_code=429,
                    record_count=0,
                    next_cursor=encode_cursor_state(
                        checkpoint, f"{product_idx}:{review_page}", high_water
                    ),
                    checkpoint_cursor=high_water or checkpoint,
                    has_more=True,
                    rate_limit_remaining=0,
                    rate_limit_reset_at=datetime.now(timezone.utc) + timedelta(seconds=retry_after),
                )
            if exc.code == 401:
                self._utoken = None
                raise RuntimeError(f"Yotpo auth failed (401): {body}")
            if 500 <= exc.code < 600:
                raise
            raise RuntimeError(f"Yotpo API returned {exc.code}: {body}")

        # Extract reviews and inject domain_key + product context
        response_data = body.get("response", body)
        reviews = response_data.get("reviews", [])
        products = response_data.get("products", [])

        # Inject domain_key and product context into each review
        # (the widget endpoint puts product info in a separate array, not on each review)
        product_info = products[0] if products else {}
        for review in reviews:
            review["domain_key"] = domain_key
            review["product_yotpo_id"] = product_info.get("id")
            review["product_name"] = product_info.get("name")
            # Flatten user fields to top level for the raw model
            user = review.get("user", {})
            if user:
                review.setdefault("name", user.get("display_name"))
                review.setdefault("reviewer_type", user.get("user_type"))

        # Rebuild body so the raw page model sees reviews with domain_key
        body["response"]["reviews"] = reviews

        # Track timestamps for cursor management
        created_values = [
            r.get("created_at") for r in reviews if r.get("created_at")
        ]
        newest_created = max(created_values, default=None)
        new_high_water = max(
            (v for v in (high_water, newest_created, checkpoint) if v is not None),
            default=None,
        )

        # Determine next cursor: more pages for this product, or move to next product
        pagination = response_data.get("pagination", {})
        total_reviews = pagination.get("total", 0)
        fetched_so_far = review_page * per_page

        if fetched_so_far < total_reviews:
            # More pages for this product
            next_page_cursor = f"{product_idx}:{review_page + 1}"
            has_more = True
        elif product_idx + 1 < len(product_keys):
            # This product done, move to next
            next_page_cursor = f"{product_idx + 1}:1"
            has_more = True
        else:
            # All products done
            next_page_cursor = None
            has_more = False

        # Always set a durable checkpoint so the handler can save progress.
        # For mid-backfill runs that hit max_pages, this encodes the current
        # position (product_index:page) so the next run resumes here.
        if not has_more:
            # Completed all products — checkpoint is the high water timestamp
            durable_checkpoint = new_high_water
        elif next_page_cursor:
            # Mid-backfill — checkpoint is the current position
            durable_checkpoint = encode_cursor_state(checkpoint, next_page_cursor, new_high_water)
        else:
            durable_checkpoint = checkpoint

        next_cursor = None
        if has_more:
            next_cursor = encode_cursor_state(checkpoint, next_page_cursor, new_high_water)

        return YotpoPage(
            body=body,
            status_code=status_code,
            record_count=len(reviews),
            next_cursor=next_cursor,
            checkpoint_cursor=durable_checkpoint,
            has_more=has_more,
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
