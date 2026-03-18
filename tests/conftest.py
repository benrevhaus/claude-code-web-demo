"""Shared test fixtures and helpers."""

import json
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def load_fixture(path: str) -> dict:
    """Load a JSON fixture file."""
    with open(FIXTURES_DIR / path) as f:
        return json.load(f)


def load_all_order_fixtures() -> list[dict]:
    """Load all order fixtures."""
    orders = []
    for p in sorted((FIXTURES_DIR / "shopify" / "orders").glob("order_*.json")):
        with open(p) as f:
            orders.append(json.load(f))
    return orders
