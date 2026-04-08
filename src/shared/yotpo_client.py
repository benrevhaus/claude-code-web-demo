"""Yotpo REST client for polling reviews.

Two modes:
  BACKFILL: bottom_lines → product catalog, widget endpoint per product (150/page).
    Used when no checkpoint exists or checkpoint is a position cursor.
  INCREMENTAL: merchant endpoint with since_updated_at.
    Used when checkpoint is a timestamp (backfill completed).
    Reviews from this endpoint lack domain_key — but for updates to existing
    reviews, domain_key is already in the database from backfill. New reviews
    on new products land without domain_key and go to publication exceptions
    until a periodic product catalog refresh fills them in.

Auth: app_key + secret_key → utoken via /oauth/token.
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


def _is_timestamp(value: str | None) -> bool:
    """Check if a cursor value looks like a timestamp (not a position cursor)."""
    if not value:
        return False
    # Position cursors look like '{"checkpoint":...}' or contain ':'
    # Timestamps look like '2026-04-07T16:13:32.000Z'
    return value.startswith("20") and "T" in value


class YotpoClient:
    """Fetch Yotpo reviews via backfill (widget) or incremental (merchant) strategy."""

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
                    # Strip Shopify GraphQL GID prefix if present
                    # e.g., "gid://shopify/Product/8153933825" → "8153933825"
                    dk = str(dk)
                    if dk.startswith("gid://"):
                        dk = dk.rsplit("/", 1)[-1]
                    all_keys.append(dk)

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
        """Fetch one page of reviews.

        Automatically selects backfill or incremental mode:
          - No cursor or position cursor → backfill via widget endpoint
          - Timestamp cursor → incremental via merchant endpoint
        """
        del api_version

        checkpoint, page_cursor, high_water = decode_cursor_state(cursor)

        # Determine mode: if checkpoint is a timestamp and no position cursor,
        # we've completed backfill and should use incremental.
        if _is_timestamp(checkpoint) and not page_cursor:
            return self._fetch_incremental(checkpoint, page_size)
        else:
            return self._fetch_backfill(checkpoint, page_cursor, high_water, page_size)

    # ── Backfill mode: widget endpoint per product ───────────────────────

    def _fetch_backfill(
        self,
        checkpoint: str | None,
        page_cursor: str | None,
        high_water: str | None,
        page_size: int,
    ) -> YotpoPage:
        # Parse cursor: "product_idx:review_page"
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

        product_keys = self._fetch_all_product_keys()

        if not product_keys or product_idx >= len(product_keys):
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

        widget_url = (
            f"{YOTPO_CDN_BASE}/v1/widget/{self._app_key}"
            f"/products/{domain_key}/reviews.json"
            f"?per_page={per_page}&page={review_page}"
        )
        request = Request(widget_url, headers={"Accept": "application/json"})

        try:
            with urlopen(request, timeout=30) as response:
                body = json.loads(response.read())
                status_code = response.status
        except HTTPError as exc:
            body = self._read_error_body(exc)
            if exc.code == 429:
                retry_after = int(exc.headers.get("Retry-After", "2"))
                return YotpoPage(
                    body=body, status_code=429, record_count=0,
                    next_cursor=encode_cursor_state(checkpoint, f"{product_idx}:{review_page}", high_water),
                    checkpoint_cursor=encode_cursor_state(checkpoint, f"{product_idx}:{review_page}", high_water),
                    has_more=True, rate_limit_remaining=0,
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

        product_info = products[0] if products else {}
        for review in reviews:
            review["domain_key"] = domain_key
            review["product_yotpo_id"] = product_info.get("id")
            review["product_name"] = product_info.get("name")
            user = review.get("user", {})
            if user:
                review.setdefault("name", user.get("display_name"))
                review.setdefault("reviewer_type", user.get("user_type"))

        body["response"]["reviews"] = reviews

        # Track timestamps
        created_values = [r.get("created_at") for r in reviews if r.get("created_at")]
        newest_created = max(created_values, default=None)
        new_high_water = max(
            (v for v in (high_water, newest_created, checkpoint) if v is not None),
            default=None,
        )

        # Determine next cursor
        pagination = response_data.get("pagination", {})
        total_reviews = pagination.get("total", 0)
        fetched_so_far = review_page * per_page

        if fetched_so_far < total_reviews:
            next_page_cursor = f"{product_idx}:{review_page + 1}"
            has_more = True
        elif product_idx + 1 < len(product_keys):
            next_page_cursor = f"{product_idx + 1}:1"
            has_more = True
        else:
            next_page_cursor = None
            has_more = False

        # Checkpoint: always emit progress
        if not has_more:
            # Backfill complete — switch to timestamp checkpoint for incremental mode
            durable_checkpoint = new_high_water
        elif next_page_cursor:
            durable_checkpoint = encode_cursor_state(checkpoint, next_page_cursor, new_high_water)
        else:
            durable_checkpoint = checkpoint

        next_cursor = None
        if has_more:
            next_cursor = encode_cursor_state(checkpoint, next_page_cursor, new_high_water)

        return YotpoPage(
            body=body, status_code=status_code, record_count=len(reviews),
            next_cursor=next_cursor, checkpoint_cursor=durable_checkpoint,
            has_more=has_more,
        )

    # ── Incremental mode: merchant endpoint with since_updated_at ────────

    def _fetch_incremental(self, checkpoint: str, page_size: int) -> YotpoPage:
        """Fetch reviews updated since checkpoint via the merchant endpoint.

        The merchant endpoint supports since_updated_at but does NOT return
        domain_key or product linkage. For existing reviews, domain_key is
        already in the database from backfill. New reviews on new products
        land without domain_key and go to publication exceptions.
        """
        utoken = self._get_utoken()

        query: dict[str, str] = {
            "count": str(page_size),
            "page": "1",
            "since_updated_at": checkpoint,
        }

        url = f"{YOTPO_API_BASE}/v1/apps/{self._app_key}/reviews?{urlencode(query)}"
        request = Request(
            url,
            headers={"Accept": "application/json", "X-Yotpo-Token": utoken},
        )

        try:
            with urlopen(request, timeout=30) as response:
                body = json.loads(response.read())
                status_code = response.status
        except HTTPError as exc:
            body = self._read_error_body(exc)
            if exc.code == 429:
                retry_after = int(exc.headers.get("Retry-After", "5"))
                return YotpoPage(
                    body=body, status_code=429, record_count=0,
                    next_cursor=encode_cursor_state(checkpoint),
                    checkpoint_cursor=checkpoint,
                    has_more=True, rate_limit_remaining=0,
                    rate_limit_reset_at=datetime.now(timezone.utc) + timedelta(seconds=retry_after),
                )
            if exc.code == 401:
                self._utoken = None
                raise RuntimeError(f"Yotpo auth failed (401): {body}")
            if 500 <= exc.code < 600:
                raise
            raise RuntimeError(f"Yotpo API returned {exc.code}: {body}")

        # Merchant endpoint nests under "response.reviews"
        response_data = body.get("response", body)
        reviews = response_data.get("reviews", [])

        # Track timestamps — merchant endpoint has updated_at
        updated_values = [r.get("updated_at") for r in reviews if r.get("updated_at")]
        newest_updated = max(updated_values, default=None)
        new_checkpoint = newest_updated or checkpoint

        # Merchant endpoint uses page-number pagination
        has_more = len(reviews) >= page_size

        return YotpoPage(
            body=body,
            status_code=status_code,
            record_count=len(reviews),
            next_cursor=encode_cursor_state(new_checkpoint) if has_more else None,
            checkpoint_cursor=new_checkpoint,
            has_more=has_more,
        )

    # ── Product refresh: find new products and backfill their reviews ───

    def find_new_product_keys(self, pg) -> list[str]:
        """Compare bottom_lines catalog against domain_keys in Postgres.
        Returns only domain_keys not yet in yotpo.reviews_raw_current.
        """
        all_keys = self._fetch_all_product_keys()

        pg._ensure_connection()
        with pg.connection.cursor() as cur:
            cur.execute("SELECT DISTINCT domain_key FROM yotpo.reviews_raw_current WHERE domain_key IS NOT NULL")
            existing = {row[0] for row in cur.fetchall()}

        new_keys = [k for k in all_keys if k not in existing]
        return new_keys

    def fetch_page_for_products(
        self,
        *,
        product_keys: list[str],
        cursor: str | None,
        page_size: int,
    ) -> YotpoPage:
        """Backfill reviews for a specific list of products (product refresh mode).
        Same widget endpoint logic as _fetch_backfill, but with a provided product list.
        """
        checkpoint, page_cursor, high_water = decode_cursor_state(cursor)

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

        if not product_keys or product_idx >= len(product_keys):
            return YotpoPage(
                body={"response": {"reviews": []}},
                status_code=200, record_count=0,
                next_cursor=None,
                checkpoint_cursor=high_water or checkpoint,
                has_more=False,
            )

        domain_key = product_keys[product_idx]
        per_page = min(page_size, WIDGET_MAX_PER_PAGE)

        widget_url = (
            f"{YOTPO_CDN_BASE}/v1/widget/{self._app_key}"
            f"/products/{domain_key}/reviews.json"
            f"?per_page={per_page}&page={review_page}"
        )
        request = Request(widget_url, headers={"Accept": "application/json"})

        try:
            with urlopen(request, timeout=30) as response:
                body = json.loads(response.read())
                status_code = response.status
        except HTTPError as exc:
            body = self._read_error_body(exc)
            if exc.code == 429:
                retry_after = int(exc.headers.get("Retry-After", "2"))
                return YotpoPage(
                    body=body, status_code=429, record_count=0,
                    next_cursor=encode_cursor_state(checkpoint, f"{product_idx}:{review_page}", high_water),
                    checkpoint_cursor=encode_cursor_state(checkpoint, f"{product_idx}:{review_page}", high_water),
                    has_more=True, rate_limit_remaining=0,
                    rate_limit_reset_at=datetime.now(timezone.utc) + timedelta(seconds=retry_after),
                )
            if exc.code == 401:
                self._utoken = None
                raise RuntimeError(f"Yotpo auth failed (401): {body}")
            if 500 <= exc.code < 600:
                raise
            raise RuntimeError(f"Yotpo API returned {exc.code}: {body}")

        response_data = body.get("response", body)
        reviews = response_data.get("reviews", [])
        products = response_data.get("products", [])

        product_info = products[0] if products else {}
        for review in reviews:
            review["domain_key"] = domain_key
            review["product_yotpo_id"] = product_info.get("id")
            review["product_name"] = product_info.get("name")
            user = review.get("user", {})
            if user:
                review.setdefault("name", user.get("display_name"))
                review.setdefault("reviewer_type", user.get("user_type"))

        body["response"]["reviews"] = reviews

        pagination = response_data.get("pagination", {})
        total_reviews = pagination.get("total", 0)
        fetched_so_far = review_page * per_page

        if fetched_so_far < total_reviews:
            next_page_cursor = f"{product_idx}:{review_page + 1}"
            has_more = True
        elif product_idx + 1 < len(product_keys):
            next_page_cursor = f"{product_idx + 1}:1"
            has_more = True
        else:
            next_page_cursor = None
            has_more = False

        next_cursor = None
        if has_more:
            next_cursor = encode_cursor_state(checkpoint, next_page_cursor, high_water)

        return YotpoPage(
            body=body, status_code=status_code, record_count=len(reviews),
            next_cursor=next_cursor,
            checkpoint_cursor=next_cursor or (high_water or checkpoint),
            has_more=has_more,
        )

    # ── Shared helpers ───────────────────────────────────────────────────

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
