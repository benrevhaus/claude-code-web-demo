"""Strict canonical model for Gorgias tickets (v1)."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class GorgiasTicketV1(BaseModel):
    id: int
    store_id: str
    external_id: Optional[str] = None
    status: Optional[str] = None
    subject: Optional[str] = None
    channel: Optional[str] = None
    created_datetime: Optional[datetime] = None
    updated_datetime: Optional[datetime] = None
    closed_datetime: Optional[datetime] = None
    opened_datetime: Optional[datetime] = None
    last_message_datetime: Optional[datetime] = None
    last_received_message_datetime: Optional[datetime] = None
    spam: Optional[bool] = None
    via: Optional[dict[str, Any]] = None
    customer: Optional[dict[str, Any]] = None
    assignee_user: Optional[dict[str, Any]] = None
    tags: Optional[list[str]] = None
