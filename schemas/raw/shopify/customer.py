"""Permissive raw model for Shopify Customer API responses.

This model accepts the full vendor payload without strict validation.
extra="allow" ensures we never fail on unknown fields from Shopify.
"""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, model_validator

from schemas.raw.shopify.order import ShopifyAddressRaw, _gid_to_int


class ShopifyCustomerRaw(BaseModel):
    """Raw Shopify customer — permissive, allows extra fields."""

    model_config = ConfigDict(extra="allow")

    id: int
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    state: Optional[str] = None
    tags: Optional[str] = None
    note: Optional[str] = None
    verified_email: Optional[bool] = None
    tax_exempt: Optional[bool] = None
    orders_count: Optional[int] = None
    total_spent: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    default_address: Optional[ShopifyAddressRaw] = None
    addresses: Optional[list[ShopifyAddressRaw]] = None
    deleted_at: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_graphql_customer(cls, data: Any) -> Any:
        """Normalize GraphQL camelCase response to snake_case REST format."""
        if not isinstance(data, dict):
            return data

        # Detect GraphQL format by presence of camelCase keys
        if (
            "firstName" not in data
            and "lastName" not in data
            and "verifiedEmail" not in data
            and "taxExempt" not in data
            and "numberOfOrders" not in data
        ):
            return data

        normalized = dict(data)

        # Parse GraphQL global ID
        normalized["id"] = _gid_to_int(normalized.get("id")) or normalized.get("id")

        # Map camelCase to snake_case
        normalized["first_name"] = normalized.get("first_name") or normalized.get("firstName")
        normalized["last_name"] = normalized.get("last_name") or normalized.get("lastName")
        if "verified_email" not in normalized and "verifiedEmail" in normalized:
            normalized["verified_email"] = normalized.get("verifiedEmail")
        if "tax_exempt" not in normalized and "taxExempt" in normalized:
            normalized["tax_exempt"] = normalized.get("taxExempt")
        normalized["created_at"] = normalized.get("created_at") or normalized.get("createdAt")
        normalized["updated_at"] = normalized.get("updated_at") or normalized.get("updatedAt")
        normalized["orders_count"] = normalized.get("orders_count") or normalized.get("numberOfOrders")
        normalized["default_address"] = normalized.get("default_address") or normalized.get("defaultAddress")

        # Handle amountSpent: {amount, currencyCode} -> total_spent (just the amount string)
        if normalized.get("total_spent") is None:
            amount_spent = normalized.get("amountSpent") or {}
            if isinstance(amount_spent, dict):
                normalized["total_spent"] = amount_spent.get("amount")

        # Handle tags: GraphQL returns list, REST returns comma-separated string
        if isinstance(normalized.get("tags"), list):
            normalized["tags"] = ", ".join(normalized["tags"])

        return normalized


class ShopifyCustomersPageRaw(BaseModel):
    """A page of customers from the Shopify API (REST or parsed from GraphQL)."""

    model_config = ConfigDict(extra="allow")

    customers: list[ShopifyCustomerRaw] = []

    @model_validator(mode="before")
    @classmethod
    def normalize_graphql_page(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if "customers" in data:
            return data

        customers = (
            data.get("data", {})
            .get("customers", {})
            .get("edges", [])
        )
        return {"customers": [edge.get("node", {}) for edge in customers]}
