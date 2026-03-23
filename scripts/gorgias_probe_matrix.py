#!/usr/bin/env python3
"""Run a small matrix of read-only Gorgias probes and summarize viability.

This script intentionally keeps the matrix small and conservative. It helps you
quickly answer:

- does /tickets accept order_by?
- is updated_datetime ordering stable enough to page safely?
- do cursored pages duplicate heavily?
- is a saved view path more reliable than raw /tickets?
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import time
import urllib.error
from dataclasses import dataclass
from typing import Any

# Allow direct execution via `python3 scripts/gorgias_probe_matrix.py`
THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

from gorgias_probe import (
    ProbeConfig,
    as_utc_iso,
    build_config,
    build_url,
    checkpoint_reached,
    extract_items,
    parse_param,
    request_json,
)


@dataclass
class Scenario:
    name: str
    mode: str
    params: list[tuple[str, str]]
    view_id: str | None = None


@dataclass
class ScenarioResult:
    name: str
    ok: bool
    requests: int
    total_items: int
    unique_ids: int
    duplicate_ids: int
    updated_monotonic: bool | None
    accepted_order_by: bool
    stop_reason: str
    first_error: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a safe matrix of Gorgias listing probes.")
    parser.add_argument("--domain", help="Gorgias subdomain, e.g. your-domain")
    parser.add_argument("--email", help="Gorgias login email for Basic auth")
    parser.add_argument("--api-key", help="Gorgias API key for Basic auth")
    parser.add_argument("--ssm-prefix", help="Optional SSM prefix, e.g. /data-streams/prod/gorgias")
    parser.add_argument("--view-id", help="Optional saved view id to include in the matrix")
    parser.add_argument("--limit", type=int, default=10, help="Items per request")
    parser.add_argument("--max-requests", type=int, default=4, help="Requests per scenario")
    parser.add_argument("--delay-seconds", type=float, default=2.0, help="Delay between requests")
    parser.add_argument("--timeout-seconds", type=int, default=30, help="Per-request timeout")
    parser.add_argument(
        "--param",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        help="Extra query params applied to every scenario. Repeatable.",
    )
    parser.add_argument(
        "--stop-at-checkpoint",
        help="Optional ISO-8601 timestamp cutoff for any scenario ordered by updated_datetime",
    )
    return parser.parse_args()


def make_base_args(namespace: argparse.Namespace, mode: str, view_id: str | None) -> argparse.Namespace:
    values = vars(namespace).copy()
    values["mode"] = mode
    values["view_id"] = view_id
    values.setdefault("print_body", False)
    return argparse.Namespace(**values)


def scenario_config(namespace: argparse.Namespace, scenario: Scenario) -> ProbeConfig:
    base = make_base_args(namespace, scenario.mode, scenario.view_id)
    config = build_config(base)
    config.params = [parse_param(p) for p in namespace.param] + scenario.params
    return config


def updated_range(items: list[dict[str, Any]]) -> tuple[str | None, str | None]:
    timestamps = [as_utc_iso(item.get("updated_datetime")) for item in items if item.get("updated_datetime")]
    timestamps = [value for value in timestamps if value]
    if not timestamps:
        return None, None
    return min(timestamps), max(timestamps)


def run_scenario(config: ProbeConfig, name: str) -> ScenarioResult:
    cursor: str | None = None
    seen_ids: set[Any] = set()
    duplicate_ids = 0
    requests = 0
    total_items = 0
    stop_reason = "max_requests_reached"
    page_ranges: list[tuple[str | None, str | None]] = []
    accepted_order_by = not any(key == "order_by" for key, _ in config.params)

    try:
        for request_number in range(1, config.max_requests + 1):
            requests = request_number
            url = build_url(config, cursor)
            payload, _headers, _status_code = request_json(config, url)
            items = extract_items(payload)
            total_items += len(items)
            page_ranges.append(updated_range(items))

            for item in items:
                ticket_id = item.get("id")
                if ticket_id is None:
                    continue
                if ticket_id in seen_ids:
                    duplicate_ids += 1
                seen_ids.add(ticket_id)

            if any(key == "order_by" for key, _ in config.params):
                accepted_order_by = True

            meta = payload.get("meta") or {}
            next_cursor = meta.get("next_cursor")
            if not next_cursor:
                stop_reason = "no_next_cursor"
                break

            if config.stop_at_checkpoint and checkpoint_reached(config.stop_at_checkpoint, items):
                stop_reason = "checkpoint_reached"
                break

            cursor = str(next_cursor)
            if request_number < config.max_requests:
                time.sleep(config.delay_seconds)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return ScenarioResult(
            name=name,
            ok=False,
            requests=requests or 1,
            total_items=total_items,
            unique_ids=len(seen_ids),
            duplicate_ids=duplicate_ids,
            updated_monotonic=None,
            accepted_order_by=False,
            stop_reason=f"http_{exc.code}",
            first_error=body[:500],
        )
    except Exception as exc:  # pragma: no cover - best-effort CLI
        return ScenarioResult(
            name=name,
            ok=False,
            requests=requests or 1,
            total_items=total_items,
            unique_ids=len(seen_ids),
            duplicate_ids=duplicate_ids,
            updated_monotonic=None,
            accepted_order_by=accepted_order_by,
            stop_reason="exception",
            first_error=str(exc),
        )

    monotonic: bool | None = None
    comparable_ranges = [pair for pair in page_ranges if pair[0] and pair[1]]
    if len(comparable_ranges) >= 2:
        monotonic = True
        for index in range(len(comparable_ranges) - 1):
            current_min, current_max = comparable_ranges[index]
            next_min, next_max = comparable_ranges[index + 1]
            if current_min is None or current_max is None or next_min is None or next_max is None:
                monotonic = None
                break
            # Accept either descending or ascending page movement.
            descending_ok = next_max <= current_min
            ascending_ok = next_min >= current_max
            if not (descending_ok or ascending_ok):
                monotonic = False
                break

    return ScenarioResult(
        name=name,
        ok=True,
        requests=requests,
        total_items=total_items,
        unique_ids=len(seen_ids),
        duplicate_ids=duplicate_ids,
        updated_monotonic=monotonic,
        accepted_order_by=accepted_order_by,
        stop_reason=stop_reason,
    )


def build_scenarios(args: argparse.Namespace) -> list[Scenario]:
    scenarios = [
        Scenario(name="tickets_baseline", mode="tickets", params=[]),
        Scenario(name="tickets_updated_asc", mode="tickets", params=[("order_by", "updated_datetime:asc")]),
        Scenario(name="tickets_updated_desc", mode="tickets", params=[("order_by", "updated_datetime:desc")]),
        Scenario(name="tickets_created_asc", mode="tickets", params=[("order_by", "created_datetime:asc")]),
        Scenario(name="tickets_created_desc", mode="tickets", params=[("order_by", "created_datetime:desc")]),
    ]
    if args.view_id:
        scenarios.extend(
            [
                Scenario(name="view_items_baseline", mode="view-items", view_id=args.view_id, params=[]),
                Scenario(
                    name="view_items_updated_asc",
                    mode="view-items",
                    view_id=args.view_id,
                    params=[("order_by", "updated_datetime:asc")],
                ),
                Scenario(
                    name="view_items_updated_desc",
                    mode="view-items",
                    view_id=args.view_id,
                    params=[("order_by", "updated_datetime:desc")],
                ),
            ]
        )
    return scenarios


def recommend(results: list[ScenarioResult]) -> str:
    ticket_updated_asc = next((r for r in results if r.name == "tickets_updated_asc"), None)
    ticket_updated_desc = next((r for r in results if r.name == "tickets_updated_desc"), None)
    view_updated_asc = next((r for r in results if r.name == "view_items_updated_asc"), None)
    view_updated_desc = next((r for r in results if r.name == "view_items_updated_desc"), None)
    view_baseline = next((r for r in results if r.name == "view_items_baseline"), None)

    if ticket_updated_asc and ticket_updated_asc.ok and ticket_updated_asc.accepted_order_by and ticket_updated_asc.updated_monotonic:
        if ticket_updated_asc.duplicate_ids == 0:
            return "direct_tickets_updated_asc_viable"
        return "direct_tickets_updated_asc_possible_but_duplicates_seen"

    if ticket_updated_desc and ticket_updated_desc.ok and ticket_updated_desc.accepted_order_by and ticket_updated_desc.updated_monotonic:
        if ticket_updated_desc.duplicate_ids == 0:
            return "direct_tickets_updated_desc_viable"
        return "direct_tickets_updated_desc_possible_but_duplicates_seen"

    if view_updated_asc and view_updated_asc.ok and view_updated_asc.updated_monotonic:
        return "use_view_items_updated_asc"

    if view_updated_desc and view_updated_desc.ok and view_updated_desc.updated_monotonic:
        return "use_view_items_updated_desc"

    if ticket_updated_asc and ticket_updated_asc.ok and ticket_updated_asc.accepted_order_by:
        return "direct_tickets_accepts_updated_order_but_paging_needs_more_validation"

    if ticket_updated_desc and ticket_updated_desc.ok and ticket_updated_desc.accepted_order_by:
        return "direct_tickets_accepts_updated_order_but_paging_needs_more_validation"

    if view_baseline and view_baseline.ok:
        return "use_view_items_baseline_then_validate_order_in_live_data"

    return "no_safe_incremental_contract_confirmed_use_small_manual_probe_only"


def main() -> int:
    args = parse_args()
    scenarios = build_scenarios(args)
    results: list[ScenarioResult] = []

    print("gorgias_probe_matrix starting")
    print(f"  scenarios={[scenario.name for scenario in scenarios]}")
    print(f"  limit={args.limit}")
    print(f"  max_requests={args.max_requests}")
    print(f"  delay_seconds={args.delay_seconds}")

    for scenario in scenarios:
        print(f"running={scenario.name}")
        config = scenario_config(args, scenario)
        result = run_scenario(config, scenario.name)
        results.append(result)
        print(
            json.dumps(
                {
                    "name": result.name,
                    "ok": result.ok,
                    "requests": result.requests,
                    "total_items": result.total_items,
                    "unique_ids": result.unique_ids,
                    "duplicate_ids": result.duplicate_ids,
                    "updated_monotonic": result.updated_monotonic,
                    "accepted_order_by": result.accepted_order_by,
                    "stop_reason": result.stop_reason,
                    "first_error": result.first_error,
                },
                indent=2,
            )
        )

    recommendation = recommend(results)
    print("recommendation=" + recommendation)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
