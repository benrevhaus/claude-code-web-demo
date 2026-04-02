ALTER TABLE analytics.ga4_page_daily
    ADD COLUMN IF NOT EXISTS landing_page_path TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_ga4_page_daily_landing_page
    ON analytics.ga4_page_daily (landing_page_path);

ALTER TABLE analytics.ga4_event_daily
    ADD COLUMN IF NOT EXISTS landing_page_path TEXT NOT NULL DEFAULT '';

ALTER TABLE analytics.ga4_event_daily
    ADD COLUMN IF NOT EXISTS is_conversion_event BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ga4_event_daily_landing_page
    ON analytics.ga4_event_daily (landing_page_path);

CREATE INDEX IF NOT EXISTS idx_ga4_event_daily_conversion
    ON analytics.ga4_event_daily (is_conversion_event);

CREATE TABLE IF NOT EXISTS analytics.ga4_page_variant_daily (
    date_pst          DATE        NOT NULL,
    page_path         TEXT        NOT NULL,
    variant_key       TEXT        NOT NULL,
    variant_value     TEXT        NOT NULL,
    landing_page_path TEXT        NOT NULL DEFAULT '',
    device_category   TEXT        NOT NULL DEFAULT '',
    source_medium     TEXT        NOT NULL DEFAULT '',
    views             BIGINT      NOT NULL DEFAULT 0,
    sessions          BIGINT      NOT NULL DEFAULT 0,
    total_users       BIGINT      NOT NULL DEFAULT 0,
    event_count       BIGINT      NOT NULL DEFAULT 0,
    synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (date_pst, page_path, variant_key, variant_value, device_category, source_medium)
);

CREATE INDEX IF NOT EXISTS idx_ga4_page_variant_daily_date
    ON analytics.ga4_page_variant_daily (date_pst DESC);

CREATE INDEX IF NOT EXISTS idx_ga4_page_variant_daily_page
    ON analytics.ga4_page_variant_daily (page_path);

CREATE INDEX IF NOT EXISTS idx_ga4_page_variant_daily_variant
    ON analytics.ga4_page_variant_daily (variant_key, variant_value);

CREATE INDEX IF NOT EXISTS idx_ga4_page_variant_daily_landing_page
    ON analytics.ga4_page_variant_daily (landing_page_path);
