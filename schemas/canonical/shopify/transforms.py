"""Pure transform functions: raw → canonical.

These must be deterministic. Same input → same output, always.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from schemas.canonical.shopify.order_v3 import Address, LineItem, ShopifyOrderV3
from schemas.canonical.shopify.customer_v1 import ShopifyCustomerV1
from schemas.canonical.shopify.product_v1 import Image, ShopifyProductV1, Variant
from schemas.canonical.shopify.inventory_v1 import ShopifyInventoryLevelV1
from schemas.canonical.shopify.refund_v1 import RefundLineItem, ShopifyRefundV1
from schemas.canonical.shopify.transaction_v1 import ShopifyTransactionV1
from schemas.raw.shopify.order import ShopifyAddressRaw, ShopifyLineItemRaw, ShopifyOrderRaw
from schemas.raw.shopify.product import ShopifyImageRaw, ShopifyProductRaw, ShopifyVariantRaw


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



# ── Customers ────────────────────────────────────────────────────────────


def _address_to_dict(raw: Optional[ShopifyAddressRaw]) -> Optional[dict[str, Any]]:
    """Convert a raw address to a plain dict for JSONB storage."""
    if raw is None:
        return None
    addr = _transform_address(raw)
    return addr.model_dump(mode="json") if addr else None


def transform_shopify_customer(raw, store_id: str) -> ShopifyCustomerV1:
    """Transform a raw Shopify customer into our canonical model."""
    return ShopifyCustomerV1(
        id=raw.id,
        store_id=store_id,
        email=raw.email,
        first_name=raw.first_name,
        last_name=raw.last_name,
        phone=raw.phone,
        state=raw.state,
        tags=_parse_tags(raw.tags),
        note=raw.note,
        verified_email=raw.verified_email,
        tax_exempt=raw.tax_exempt,
        orders_count=raw.orders_count,
        total_spent=_parse_decimal(raw.total_spent),
        default_address=_address_to_dict(raw.default_address) if raw.default_address else None,
        addresses=[_address_to_dict(a) for a in raw.addresses] if raw.addresses else None,
        created_at=_parse_datetime(raw.created_at),
        updated_at=_parse_datetime(raw.updated_at),
        deleted_at=_parse_datetime(getattr(raw, "deleted_at", None)),
    )


# ── Products ─────────────────────────────────────────────────────────────


def _transform_variant(raw: ShopifyVariantRaw) -> Variant:
    return Variant(
        id=raw.id,
        title=raw.title,
        sku=raw.sku,
        barcode=raw.barcode,
        price=_parse_decimal(raw.price),
        compare_at_price=_parse_decimal(raw.compare_at_price),
        inventory_quantity=raw.inventory_quantity,
        weight=raw.weight,
        weight_unit=raw.weight_unit,
    )


def _transform_image(raw: ShopifyImageRaw) -> Image:
    return Image(
        url=raw.url,
        alt_text=raw.alt_text,
    )


def transform_shopify_product(raw: ShopifyProductRaw, store_id: str) -> ShopifyProductV1:
    """Transform a raw Shopify product into our canonical model."""
    return ShopifyProductV1(
        id=raw.id,
        store_id=store_id,
        title=raw.title,
        handle=raw.handle,
        body_html=raw.body_html,
        vendor=raw.vendor,
        product_type=raw.product_type,
        status=raw.status,
        tags=_parse_tags(raw.tags),
        created_at=_parse_datetime(raw.created_at),
        updated_at=_parse_datetime(raw.updated_at),
        published_at=_parse_datetime(raw.published_at),
        variants=[_transform_variant(v) for v in raw.variants] if raw.variants else None,
        images=[_transform_image(img) for img in raw.images] if raw.images else None,
    )


# ── Inventory ────────────────────────────────────────────────────────────


def transform_shopify_inventory(raw, store_id: str) -> list[ShopifyInventoryLevelV1]:
    """Transform a raw inventory item into canonical inventory levels.

    Returns a list because one item can have levels across multiple locations.
    The caller must iterate and upsert each level individually.
    """
    levels: list[ShopifyInventoryLevelV1] = []
    for level_raw in raw.inventory_levels or []:
        location = level_raw.location
        if location is None or location.id is None:
            continue

        quantities = {q.name: q.quantity for q in (level_raw.quantities or [])}

        levels.append(ShopifyInventoryLevelV1(
            inventory_item_id=raw.id,
            location_id=location.id,
            store_id=store_id,
            sku=raw.sku,
            variant_id=raw.variant_id,
            product_id=raw.product_id,
            location_name=location.name,
            available=quantities.get("available"),
            committed=quantities.get("committed"),
            on_hand=quantities.get("on_hand"),
            tracked=raw.tracked,
            updated_at=_parse_datetime(level_raw.updated_at) or _parse_datetime(raw.updated_at),
        ))

    return levels


# ── Refunds (extracted from order payloads) ──────────────────────────────


def _transform_refund_line_item(raw) -> RefundLineItem:
    return RefundLineItem(
        quantity=raw.quantity,
        line_item_id=raw.line_item_id,
        line_item_name=raw.line_item_name,
        line_item_sku=raw.line_item_sku,
        subtotal=_parse_decimal(raw.subtotal),
    )


def transform_shopify_refund(raw, store_id: str, order_id: int) -> ShopifyRefundV1:
    """Transform a raw Shopify refund into our canonical model."""
    return ShopifyRefundV1(
        id=raw.id,
        order_id=order_id,
        store_id=store_id,
        created_at=_parse_datetime(raw.created_at),
        note=raw.note,
        total_refunded=_parse_decimal(raw.total_refunded),
        currency=raw.currency,
        refund_line_items=[_transform_refund_line_item(rli) for rli in raw.refund_line_items]
        if raw.refund_line_items
        else None,
    )


# ── Transactions (extracted from order payloads) ─────────────────────────


def transform_shopify_transaction(raw, store_id: str, order_id: int) -> ShopifyTransactionV1:
    """Transform a raw Shopify transaction into our canonical model."""
    return ShopifyTransactionV1(
        id=raw.id,
        order_id=order_id,
        store_id=store_id,
        kind=raw.kind,
        status=raw.status,
        amount=_parse_decimal(raw.amount),
        currency=raw.currency,
        gateway=raw.gateway,
        created_at=_parse_datetime(raw.created_at),
        parent_transaction_id=raw.parent_transaction_id,
    )
