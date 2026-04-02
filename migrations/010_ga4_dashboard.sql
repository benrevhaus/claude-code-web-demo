CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.ga4_sync_runs (
    id              BIGSERIAL PRIMARY KEY,
    sync_type       TEXT        NOT NULL,
    property_id     TEXT        NOT NULL,
    days_back       INTEGER     NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    status          TEXT        NOT NULL DEFAULT 'running',
    pages_rows      INTEGER     NOT NULL DEFAULT 0,
    events_rows     INTEGER     NOT NULL DEFAULT 0,
    error_message   TEXT
);

CREATE TABLE IF NOT EXISTS analytics.ga4_page_daily (
    date_pst         DATE        NOT NULL,
    page_path        TEXT        NOT NULL,
    page_title       TEXT        NOT NULL DEFAULT '',
    device_category  TEXT        NOT NULL DEFAULT '',
    source_medium    TEXT        NOT NULL DEFAULT '',
    views            BIGINT      NOT NULL DEFAULT 0,
    sessions         BIGINT      NOT NULL DEFAULT 0,
    total_users      BIGINT      NOT NULL DEFAULT 0,
    event_count      BIGINT      NOT NULL DEFAULT 0,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (date_pst, page_path, page_title, device_category, source_medium)
);

CREATE INDEX IF NOT EXISTS idx_ga4_page_daily_date
    ON analytics.ga4_page_daily (date_pst DESC);

CREATE INDEX IF NOT EXISTS idx_ga4_page_daily_page
    ON analytics.ga4_page_daily (page_path);

CREATE TABLE IF NOT EXISTS analytics.ga4_event_daily (
    date_pst         DATE        NOT NULL,
    page_path        TEXT        NOT NULL DEFAULT '',
    event_name       TEXT        NOT NULL,
    device_category  TEXT        NOT NULL DEFAULT '',
    source_medium    TEXT        NOT NULL DEFAULT '',
    event_count      BIGINT      NOT NULL DEFAULT 0,
    sessions         BIGINT      NOT NULL DEFAULT 0,
    total_users      BIGINT      NOT NULL DEFAULT 0,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (date_pst, page_path, event_name, device_category, source_medium)
);

CREATE INDEX IF NOT EXISTS idx_ga4_event_daily_date
    ON analytics.ga4_event_daily (date_pst DESC);

CREATE INDEX IF NOT EXISTS idx_ga4_event_daily_event_name
    ON analytics.ga4_event_daily (event_name);
