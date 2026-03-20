"""Initializer Lambda handler.

Loads stream config, creates a run record, reads the current cursor, and returns
the initial Step Function accumulator state for a polling execution.
"""

from __future__ import annotations

import os
import uuid

from src.shared.contracts import InitializerInput, InitializerOutput
from src.shared.dynamo_control import DynamoControl
from src.shared.observability import setup_logging
from src.shared.stream_config import load_all_stream_configs

log = setup_logging("initializer")

_dynamo: DynamoControl | None = None


def _get_dynamo() -> DynamoControl:
    global _dynamo
    if _dynamo is None:
        _dynamo = DynamoControl(table_name=os.environ.get("CONTROL_TABLE", "data-streams-control-dev"))
    return _dynamo


def handler(event: dict, context=None) -> dict:
    """Lambda entry point for the Initialize Step Function state."""
    inp = InitializerInput(**event)

    configs = load_all_stream_configs()
    stream_key = f"{inp.source}#{inp.stream}"
    stream_config = configs.get(stream_key)
    if not stream_config:
        raise ValueError(f"No stream config found for {stream_key}")

    dynamo = _get_dynamo()
    run_id = str(uuid.uuid4())
    current_cursor = inp.cursor_override or dynamo.get_cursor(inp.source, inp.stream, inp.store_id)
    max_pages = inp.max_pages_override or inp.max_pages or stream_config.max_pages_per_run

    dynamo.create_run(
        source=inp.source,
        stream=inp.stream,
        store_id=inp.store_id,
        run_id=run_id,
        trigger="poll",
        cursor_start=current_cursor,
    )

    output = InitializerOutput(
        run_id=run_id,
        stream_config=stream_config,
        store_id=inp.store_id,
        cursor=current_cursor,
        max_pages=max_pages,
    )

    log.info(
        "Run initialized",
        run_id=run_id,
        source=inp.source,
        stream=inp.stream,
        store_id=inp.store_id,
        cursor=current_cursor,
        max_pages=max_pages,
    )

    return output.model_dump(mode="json")
