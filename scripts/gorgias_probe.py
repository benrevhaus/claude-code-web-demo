#!/usr/bin/env python3
"""Read-only probe for Gorgias ticket listing behavior.

This script is intentionally conservative:
- single-threaded
- small default page size
- hard request cap
- delay between requests
- rate-limit header logging

Use it to validate real pagination, ordering, and accepted query parameters
against your tenant before building a full historical sync.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

# Allow direct execution via `python3 scripts/gorgias_probe.py`
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_LIMIT = 25
DEFAULT_MAX_REQUESTS = 10
DEFAULT_DELAY_SECONDS = 1.0


@dataclass
class ProbeConfig:
    domain: str
    email: str
    api_key: str
    endpoint: str
    limit: int
    max_requests: int
    delay_seconds: float
    timeout_seconds: int
    params: list[tuple[str, str]]
    stop_at_checkpoint: str | None
    print_body: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Probe Gorgias ticket listing behavior safely.")
    parser.add_argument("--domain", help="Gorgias subdomain, e.g. your-domain")
    parser.add_argument("--email", help="Gorgias login email for Basic auth")
    parser.add_argument("--api-key", help="Gorgias API key for Basic auth")
    parser.add_argument("--ssm-prefix", help="Optional SSM prefix, e.g. /data-streams/prod/gorgias")
    parser.add_argument(
        "--mode",
        choices=("tickets", "view-items"),
        default="tickets",
        help="Probe GET /tickets or GET /views/{view_id}/items",
    )
    parser.add_argument("--view-id", help="Required when --mode=view-items")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="Items per request")
    parser.add_argument(
        "--max-requests",
        type=int,
        default=DEFAULT_MAX_REQUESTS,
        help="Hard cap on total requests for this run",
    )
    parser.add_argument(
        "--delay-seconds",
        type=float,
        default=DEFAULT_DELAY_SECONDS,
        help="Sleep between successful requests",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="Per-request timeout",
    )
    parser.add_argument(
        "--param",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        help="Extra query param to test. Repeatable.",
    )
    parser.add_argument(
        "--stop-at-checkpoint",
        help="Stop once the oldest item on a page is older than this ISO-8601 timestamp",
    )
    parser.add_argument(
        "--print-body",
        action="store_true",
        help="Print response body for the first request. Use sparingly.",
    )
    return parser.parse_args()


def resolve_credentials(args: argparse.Namespace) -> tuple[str, str, str]:
    if args.ssm_prefix:
        from src.shared.ssm import get_env_or_ssm

        prefix = args.ssm_prefix.rstrip("/")
        domain = args.domain or get_env_or_ssm("GORGIAS_DOMAIN", f"{prefix}/domain")
        email = args.email or get_env_or_ssm("GORGIAS_EMAIL", f"{prefix}/email")
        api_key = args.api_key or get_env_or_ssm("GORGIAS_API_KEY", f"{prefix}/api_key")
        return domain, email, api_key

    domain = args.domain or os.environ.get("GORGIAS_DOMAIN")
    email = args.email or os.environ.get("GORGIAS_EMAIL")
    api_key = args.api_key or os.environ.get("GORGIAS_API_KEY")
    missing = [
        name
        for name, value in (
            ("domain", domain),
            ("email", email),
            ("api-key", api_key),
        )
        if not value
    ]
    if missing:
        raise SystemExit(
            "Missing credentials. Supply flags or env vars: "
            + ", ".join(f"--{name}" for name in missing)
        )
    return str(domain), str(email), str(api_key)


def parse_param(raw: str) -> tuple[str, str]:
    if "=" not in raw:
        raise SystemExit(f"Invalid --param value: {raw!r}. Expected KEY=VALUE.")
    key, value = raw.split("=", 1)
    if not key:
        raise SystemExit(f"Invalid --param value: {raw!r}. Key cannot be empty.")
    return key, value


def build_config(args: argparse.Namespace) -> ProbeConfig:
    domain, email, api_key = resolve_credentials(args)
    if args.mode == "view-items" and not args.view_id:
        raise SystemExit("--view-id is required when --mode=view-items")

    endpoint = "/api/tickets"
    if args.mode == "view-items":
        endpoint = f"/api/views/{args.view_id}/items"

    return ProbeConfig(
        domain=domain,
        email=email,
        api_key=api_key,
        endpoint=endpoint,
        limit=args.limit,
        max_requests=args.max_requests,
        delay_seconds=args.delay_seconds,
        timeout_seconds=args.timeout_seconds,
        params=[parse_param(p) for p in args.param],
        stop_at_checkpoint=args.stop_at_checkpoint,
        print_body=args.print_body,
    )


def basic_auth_header(email: str, api_key: str) -> str:
    token = base64.b64encode(f"{email}:{api_key}".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def build_url(config: ProbeConfig, cursor: str | None) -> str:
    query: list[tuple[str, str]] = [("limit", str(config.limit))]
    query.extend(config.params)
    if cursor:
        query.append(("cursor", cursor))
    encoded = urllib.parse.urlencode(query, doseq=True)
    return f"https://{config.domain}.gorgias.com{config.endpoint}?{encoded}"


def request_json(config: ProbeConfig, url: str) -> tuple[dict[str, Any], dict[str, str], int]:
    request = urllib.request.Request(
        url=url,
        method="GET",
        headers={
            "Accept": "application/json",
            "Authorization": basic_auth_header(config.email, config.api_key),
            "User-Agent": "data-streams-gorgias-probe/1.0",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=config.timeout_seconds) as response:
            body = response.read().decode("utf-8")
            headers = {k.lower(): v for k, v in response.headers.items()}
            return json.loads(body), headers, response.status
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        sys.stderr.write(f"HTTP {exc.code} for {url}\n")
        sys.stderr.write(body[:4000] + "\n")
        raise


def as_utc_iso(value: str | None) -> str | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return value
    return dt.astimezone(timezone.utc).isoformat()


def extract_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    data = payload.get("data")
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def summarize_items(items: list[dict[str, Any]]) -> dict[str, Any]:
    ids = [item.get("id") for item in items if item.get("id") is not None]
    updated = [as_utc_iso(item.get("updated_datetime")) for item in items if item.get("updated_datetime")]
    created = [as_utc_iso(item.get("created_datetime")) for item in items if item.get("created_datetime")]
    return {
        "count": len(items),
        "first_id": ids[0] if ids else None,
        "last_id": ids[-1] if ids else None,
        "min_updated_datetime": min(updated) if updated else None,
        "max_updated_datetime": max(updated) if updated else None,
        "min_created_datetime": min(created) if created else None,
        "max_created_datetime": max(created) if created else None,
    }


def oldest_updated_datetime(items: list[dict[str, Any]]) -> str | None:
    timestamps = [as_utc_iso(item.get("updated_datetime")) for item in items if item.get("updated_datetime")]
    timestamps = [value for value in timestamps if value]
    return min(timestamps) if timestamps else None


def print_page_summary(
    request_number: int,
    url: str,
    status_code: int,
    items: list[dict[str, Any]],
    headers: dict[str, str],
    payload: dict[str, Any],
    seen_ids: set[Any],
) -> int:
    summary = summarize_items(items)
    duplicates = 0
    for item in items:
        ticket_id = item.get("id")
        if ticket_id is None:
            continue
        if ticket_id in seen_ids:
            duplicates += 1
        seen_ids.add(ticket_id)

    meta = payload.get("meta") or {}
    next_cursor = meta.get("next_cursor")
    prev_cursor = meta.get("prev_cursor")

    print(f"request={request_number} status={status_code} url={url}")
    print(
        "  "
        + " ".join(
            [
                f"count={summary['count']}",
                f"duplicates={duplicates}",
                f"first_id={summary['first_id']}",
                f"last_id={summary['last_id']}",
                f"min_updated={summary['min_updated_datetime']}",
                f"max_updated={summary['max_updated_datetime']}",
                f"next_cursor={'yes' if next_cursor else 'no'}",
                f"prev_cursor={'yes' if prev_cursor else 'no'}",
            ]
        )
    )
    print(
        "  "
        + " ".join(
            [
                f"x_limit={headers.get('x-gorgias-account-api-call-limit')}",
                f"retry_after={headers.get('retry-after')}",
                f"request_id={headers.get('x-request-id')}",
            ]
        )
    )
    return duplicates


def checkpoint_reached(checkpoint: str, items: list[dict[str, Any]]) -> bool:
    oldest_seen = oldest_updated_datetime(items)
    if oldest_seen is None:
        return False
    return oldest_seen <= as_utc_iso(checkpoint)


def main() -> int:
    args = parse_args()
    config = build_config(args)

    print("gorgias_probe starting")
    print(f"  endpoint={config.endpoint}")
    print(f"  limit={config.limit}")
    print(f"  max_requests={config.max_requests}")
    print(f"  delay_seconds={config.delay_seconds}")
    if config.params:
        print(f"  extra_params={config.params}")
    if config.stop_at_checkpoint:
        print(f"  stop_at_checkpoint={as_utc_iso(config.stop_at_checkpoint)}")

    cursor: str | None = None
    total_items = 0
    total_duplicates = 0
    seen_ids: set[Any] = set()

    for request_number in range(1, config.max_requests + 1):
        url = build_url(config, cursor)
        payload, headers, status_code = request_json(config, url)
        items = extract_items(payload)

        if request_number == 1 and config.print_body:
            print(json.dumps(payload, indent=2)[:12000])

        total_items += len(items)
        total_duplicates += print_page_summary(
            request_number=request_number,
            url=url,
            status_code=status_code,
            items=items,
            headers=headers,
            payload=payload,
            seen_ids=seen_ids,
        )

        meta = payload.get("meta") or {}
        next_cursor = meta.get("next_cursor")
        if not next_cursor:
            print("stop_reason=no_next_cursor")
            break

        if config.stop_at_checkpoint and checkpoint_reached(config.stop_at_checkpoint, items):
            print("stop_reason=checkpoint_reached")
            break

        cursor = str(next_cursor)

        if request_number < config.max_requests:
            time.sleep(config.delay_seconds)
    else:
        print("stop_reason=max_requests_reached")

    print("gorgias_probe complete")
    print(f"  unique_ids={len(seen_ids)}")
    print(f"  total_items={total_items}")
    print(f"  duplicate_ids={total_duplicates}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
