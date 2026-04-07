-- Add event_param_value to support splitting events by their primary parameter
-- (e.g., scroll_depth by percent_scrolled, time_on_site by seconds).
-- The compound normalized_event_name (e.g., scroll_depth_90) becomes the
-- filterable value; event_param_value preserves the raw parameter.

ALTER TABLE analytics.ga4_event_daily
    ADD COLUMN IF NOT EXISTS event_param_value TEXT NOT NULL DEFAULT '';

-- Drop the old primary key and recreate with event_param_value so that
-- scroll_depth_25 and scroll_depth_90 on the same page/date/device are
-- separate rows instead of colliding.
ALTER TABLE analytics.ga4_event_daily
    DROP CONSTRAINT ga4_event_daily_pkey;

ALTER TABLE analytics.ga4_event_daily
    ADD PRIMARY KEY (date_pst, page_path, event_name, event_param_value, device_category, source_medium);
