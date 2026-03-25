"""Permissive raw model for Shopify Product API responses.

This model accepts the full vendor payload without strict validation.
extra="allow" ensures we never fail on unknown fields from Shopify.
"""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, model_validator


def _gid_to_int(value: Any) -> Optional[int]:
    """Convert a Shopify GraphQL GID (e.g. 'gid://shopify/Product/123') to int."""
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        tail = value.rsplit("/", 1)[-1]
        try:
            return int(tail)
        except ValueError:
            return None
    return None


class ShopifyVariantRaw(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[int] = None
    title: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    price: Optional[str] = None
    compare_at_price: Optional[str] = None
    inventory_quantity: Optional[int] = None
    weight: Optional[float] = None
    weight_unit: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_graphql_variant(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        n = dict(data)
        n["id"] = _gid_to_int(n.get("id")) or n.get("id")
        price_v2 = n.get("priceV2") or {}
        compare_v2 = n.get("compareAtPriceV2") or {}
        if n.get("price") is None:
            n["price"] = price_v2.get("amount")
        if n.get("compare_at_price") is None:
            n["compare_at_price"] = compare_v2.get("amount")
        if "weightUnit" in n:
            n["weight_unit"] = n.get("weightUnit")
        if "inventoryQuantity" in n:
            n["inventory_quantity"] = n.get("inventoryQuantity")
        return n


class ShopifyImageRaw(BaseModel):
    model_config = ConfigDict(extra="allow")

    url: Optional[str] = None
    alt_text: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        n = dict(data)
        if "altText" in n:
            n["alt_text"] = n.get("altText")
        return n


class ShopifyProductRaw(BaseModel):
    """Raw Shopify product — permissive, allows extra fields."""

    model_config = ConfigDict(extra="allow")

    id: int
    title: Optional[str] = None
    handle: Optional[str] = None
    body_html: Optional[str] = None
    vendor: Optional[str] = None
    product_type: Optional[str] = None
    status: Optional[str] = None
    tags: Optional[str] = None  # comma-separated from REST, list from GraphQL
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    published_at: Optional[str] = None
    variants: Optional[list[ShopifyVariantRaw]] = None
    images: Optional[list[ShopifyImageRaw]] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_graphql_product(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        # Detect GraphQL (has camelCase fields)
        if "bodyHtml" not in data and "productType" not in data and "createdAt" not in data:
            return data

        n = dict(data)
        n["id"] = _gid_to_int(n.get("id")) or n.get("id")
        n["body_html"] = n.get("body_html") or n.get("bodyHtml")
        n["product_type"] = n.get("product_type") or n.get("productType")
        n["created_at"] = n.get("created_at") or n.get("createdAt")
        n["updated_at"] = n.get("updated_at") or n.get("updatedAt")
        n["published_at"] = n.get("published_at") or n.get("publishedAt")

        if isinstance(n.get("tags"), list):
            n["tags"] = ", ".join(n["tags"])

        # Unwrap GraphQL edges for variants
        variants = n.get("variants") or {}
        if isinstance(variants, dict) and "edges" in variants:
            n["variants"] = [e.get("node", {}) for e in variants.get("edges", [])]

        # Unwrap GraphQL edges for images
        images = n.get("images") or {}
        if isinstance(images, dict) and "edges" in images:
            n["images"] = [e.get("node", {}) for e in images.get("edges", [])]

        return n


class ShopifyProductsPageRaw(BaseModel):
    """A page of products from the Shopify API (REST or parsed from GraphQL)."""

    model_config = ConfigDict(extra="allow")

    products: list[ShopifyProductRaw] = []

    @model_validator(mode="before")
    @classmethod
    def normalize_graphql_page(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if "products" in data and isinstance(data["products"], list):
            return data

        products = (
            data.get("data", {})
            .get("products", {})
            .get("edges", [])
        )
        return {"products": [e.get("node", {}) for e in products]}
