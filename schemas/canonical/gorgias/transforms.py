"""Pure transforms for Gorgias tickets."""

from datetime import datetime
from typing import Optional

from schemas.canonical.gorgias.ticket_v1 import GorgiasTicketV1
from schemas.raw.gorgias.ticket import GorgiasTagRaw, GorgiasTicketRaw


def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if value is None:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _transform_tags(tags: list[GorgiasTagRaw | str] | None) -> list[str] | None:
    if tags is None:
        return None
    values: list[str] = []
    for tag in tags:
        if isinstance(tag, str):
            if tag:
                values.append(tag)
            continue
        if tag.name:
            values.append(tag.name)
    return values


def transform_gorgias_ticket(raw: GorgiasTicketRaw, store_id: str) -> GorgiasTicketV1:
    return GorgiasTicketV1(
        id=raw.id,
        store_id=store_id,
        external_id=raw.external_id,
        status=raw.status,
        subject=raw.subject,
        channel=raw.channel,
        created_datetime=_parse_datetime(raw.created_datetime),
        updated_datetime=_parse_datetime(raw.updated_datetime),
        closed_datetime=_parse_datetime(raw.closed_datetime),
        opened_datetime=_parse_datetime(raw.opened_datetime),
        last_message_datetime=_parse_datetime(raw.last_message_datetime),
        last_received_message_datetime=_parse_datetime(raw.last_received_message_datetime),
        spam=raw.spam,
        via=raw.via,
        customer=raw.customer,
        assignee_user=raw.assignee_user,
        tags=_transform_tags(raw.tags),
    )
