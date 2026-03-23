"""Permissive raw model for Gorgias ticket API responses."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, model_validator


class GorgiasTagRaw(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[int] = None
    name: Optional[str] = None


class GorgiasTicketRaw(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    external_id: Optional[str] = None
    status: Optional[str] = None
    subject: Optional[str] = None
    channel: Optional[str] = None
    created_datetime: Optional[str] = None
    updated_datetime: Optional[str] = None
    closed_datetime: Optional[str] = None
    opened_datetime: Optional[str] = None
    last_message_datetime: Optional[str] = None
    last_received_message_datetime: Optional[str] = None
    spam: Optional[bool] = None
    via: Optional[dict[str, Any]] = None
    customer: Optional[dict[str, Any]] = None
    assignee_user: Optional[dict[str, Any]] = None
    tags: Optional[list[GorgiasTagRaw | str]] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_raw_ticket(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        if isinstance(normalized.get("channel"), dict):
            normalized["channel"] = normalized["channel"].get("name") or normalized["channel"].get("type")
        return normalized


class GorgiasTicketsPageRaw(BaseModel):
    model_config = ConfigDict(extra="allow")

    data: list[GorgiasTicketRaw] = []

    @model_validator(mode="before")
    @classmethod
    def normalize_page(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if isinstance(data.get("data"), list):
            return data
        if isinstance(data.get("tickets"), list):
            return {"data": data["tickets"]}
        return {"data": []}
