-- Migration 002: Gorgias Tickets

CREATE SCHEMA IF NOT EXISTS gorgias;

CREATE TABLE gorgias.tickets (
    id                           BIGINT NOT NULL,
    store_id                     TEXT NOT NULL,
    external_id                  TEXT,
    status                       TEXT,
    subject                      TEXT,
    channel                      TEXT,
    created_datetime             TIMESTAMPTZ,
    updated_datetime             TIMESTAMPTZ,
    closed_datetime              TIMESTAMPTZ,
    opened_datetime              TIMESTAMPTZ,
    last_message_datetime        TIMESTAMPTZ,
    last_received_message_datetime TIMESTAMPTZ,
    spam                         BOOLEAN,
    via                          JSONB,
    customer                     JSONB,
    assignee_user                JSONB,
    tags                         TEXT[],
    raw_s3_key                   TEXT NOT NULL,
    schema_version               TEXT NOT NULL,
    ingested_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id                       TEXT,

    PRIMARY KEY (id, store_id)
);

CREATE INDEX idx_gorgias_tickets_updated_datetime
    ON gorgias.tickets (store_id, updated_datetime DESC);

CREATE INDEX idx_gorgias_tickets_run_id
    ON gorgias.tickets (run_id);

CREATE TABLE gorgias.tickets_history (
    history_id        BIGSERIAL PRIMARY KEY,
    ticket_id         BIGINT NOT NULL,
    store_id          TEXT NOT NULL,
    snapshot          JSONB NOT NULL,
    changed_at        TIMESTAMPTZ NOT NULL,
    ingested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id            TEXT,

    UNIQUE (ticket_id, store_id, changed_at)
);

CREATE INDEX idx_gorgias_tickets_history_ticket
    ON gorgias.tickets_history (ticket_id, store_id, changed_at DESC);
