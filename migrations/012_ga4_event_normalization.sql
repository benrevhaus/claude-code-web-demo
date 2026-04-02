ALTER TABLE analytics.ga4_event_daily
    ADD COLUMN IF NOT EXISTS raw_event_name TEXT NOT NULL DEFAULT '';

ALTER TABLE analytics.ga4_event_daily
    ADD COLUMN IF NOT EXISTS normalized_event_name TEXT NOT NULL DEFAULT '';

ALTER TABLE analytics.ga4_event_daily
    ADD COLUMN IF NOT EXISTS event_class TEXT NOT NULL DEFAULT 'valid_event';

ALTER TABLE analytics.ga4_event_daily
    ADD COLUMN IF NOT EXISTS derived_page_path TEXT NOT NULL DEFAULT '';

UPDATE analytics.ga4_event_daily
SET
    raw_event_name = CASE
        WHEN raw_event_name = '' THEN event_name
        ELSE raw_event_name
    END,
    normalized_event_name = CASE
        WHEN event_name LIKE 'http://%' OR event_name LIKE 'https://%' OR event_name LIKE '/%' THEN 'page_path_leak'
        WHEN lower(event_name) LIKE 'ga4 - %' THEN 'implementation_noise'
        WHEN lower(event_name) LIKE 'image_http%' THEN 'implementation_noise'
        ELSE replace(lower(trim(event_name)), ' ', '_')
    END,
    event_class = CASE
        WHEN event_name LIKE 'http://%' OR event_name LIKE 'https://%' OR event_name LIKE '/%' THEN 'page_path_leak'
        WHEN lower(event_name) LIKE 'ga4 - %' THEN 'implementation_noise'
        WHEN lower(event_name) LIKE 'image_http%' THEN 'implementation_noise'
        ELSE 'valid_event'
    END,
    derived_page_path = CASE
        WHEN event_name LIKE 'http://%' OR event_name LIKE 'https://%' OR event_name LIKE '/%' THEN event_name
        ELSE derived_page_path
    END
WHERE raw_event_name = ''
   OR normalized_event_name = ''
   OR event_class = 'valid_event'
   OR derived_page_path = '';

CREATE INDEX IF NOT EXISTS idx_ga4_event_daily_normalized_event_name
    ON analytics.ga4_event_daily (normalized_event_name);

CREATE INDEX IF NOT EXISTS idx_ga4_event_daily_event_class
    ON analytics.ga4_event_daily (event_class);

CREATE INDEX IF NOT EXISTS idx_ga4_event_daily_derived_page_path
    ON analytics.ga4_event_daily (derived_page_path);
