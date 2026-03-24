-- Migration 003: Stream cursors table for MVP control plane
-- Replaces DynamoDB CURSOR#current for the single-Lambda architecture (ADR-021/022)

CREATE SCHEMA IF NOT EXISTS control;

CREATE TABLE control.stream_cursors (
    source          TEXT        NOT NULL,
    stream          TEXT        NOT NULL,
    store_id        TEXT        NOT NULL,
    cursor_value    TEXT,
    run_id          TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    records_total   BIGINT      NOT NULL DEFAULT 0,
    pages_total     BIGINT      NOT NULL DEFAULT 0,
    last_status     TEXT,
    last_run_at     TIMESTAMPTZ,

    PRIMARY KEY (source, stream, store_id)
);

COMMENT ON TABLE control.stream_cursors IS
    'MVP cursor storage — replaces DynamoDB CURSOR#current. '
    'One row per (source, stream, store_id). '
    'See ADR-022 for migration path back to DynamoDB.';
