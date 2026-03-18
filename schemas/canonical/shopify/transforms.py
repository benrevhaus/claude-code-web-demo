"""Pure transform functions: raw → canonical.

These must be deterministic. Same input → same output, always.
"""

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

from schemas.canonical.shopify.order_v3 import Address, LineItem, ShopifyOrderV3
from schemas.raw.shopify.order import ShopifyAddressRaw, ShopifyLineItemRaw, ShopifyOrderRaw


def _parse_datetime(val: Optional[str]) -> Optional[datetime]:
    if val is None:
        return None
    return datetime.fromisoformat(val.replace("Z", "+00:00"))


def _parse_decimal(val: Optional[str]) -> Optional[Decimal]:
    if val is None:
        return None
    try:
        return Decimal(val)
    except InvalidOperation:
        return None


def _parse_tags(val: Optional[str]) -> Optional[list[str]]:
    if val is None:
        return None
    return [t.strip() for t in val.split(",") if t.strip()]


def _transform_address(raw: Optional[ShopifyAddressRaw]) -> Optional[Address]:
    if raw is None:
        return None
    return Address(
        first_name=raw.first_name,
        last_name=raw.last_name,
        address1=raw.address1,
        address2=raw.address2,
        city=raw.city,
        province=raw.province,
        province_code=raw.province_code,
        country=raw.country,
        country_code=raw.country_code,
        zip=raw.zip,
        phone=raw.phone,
    )


def _transform_line_item(raw: ShopifyLineItemRaw) -> LineItem:
    return LineItem(
        id=raw.id,
        title=raw.title,
        quantity=raw.quantity or 0,
        price=_parse_decimal(raw.price),
        sku=raw.sku,
        variant_id=raw.variant_id,
        product_id=raw.product_id,
        vendor=raw.vendor,
    )


def transform_shopify_order(raw: ShopifyOrderRaw, store_id: str) -> ShopifyOrderV3:
    """Transform a raw Shopify order into our canonical model."""
    return ShopifyOrderV3(
        id=raw.id,
        store_id=store_id,
        order_number=str(raw.order_number) if raw.order_number is not None else raw.name,
        email=raw.email,
        financial_status=raw.financial_status,
        fulfillment_status=raw.fulfillment_status,
        total_price=_parse_decimal(raw.total_price),
        currency=raw.currency,
        created_at=_parse_datetime(raw.created_at),
        updated_at=_parse_datetime(raw.updated_at),
        cancelled_at=_parse_datetime(raw.cancelled_at),
        closed_at=_parse_datetime(raw.closed_at),
        tags=_parse_tags(raw.tags),
        note=raw.note,
        line_items=[_transform_line_item(li) for li in raw.line_items] if raw.line_items else None,
        shipping_address=_transform_address(raw.shipping_address),
        billing_address=_transform_address(raw.billing_address),
    )
