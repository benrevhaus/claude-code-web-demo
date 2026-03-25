-- 006: Shopify inventory levels — one row per (item, location)

CREATE TABLE IF NOT EXISTS shopify.inventory_levels (
    inventory_item_id   BIGINT NOT NULL,
    location_id         BIGINT NOT NULL,
    store_id            TEXT NOT NULL,
    sku                 TEXT,
    variant_id          BIGINT,
    product_id          BIGINT,
    location_name       TEXT,
    available           INTEGER,
    committed           INTEGER,
    on_hand             INTEGER,
    tracked             BOOLEAN,
    updated_at          TIMESTAMPTZ,
    raw_s3_key          TEXT NOT NULL,
    schema_version      TEXT NOT NULL,
    ingested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id              TEXT,
    PRIMARY KEY (inventory_item_id, location_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_levels_updated_at
    ON shopify.inventory_levels (store_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_levels_sku
    ON shopify.inventory_levels (sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_levels_run_id
    ON shopify.inventory_levels (run_id);

CREATE TABLE IF NOT EXISTS shopify.inventory_levels_history (
    history_id          BIGSERIAL PRIMARY KEY,
    inventory_item_id   BIGINT NOT NULL,
    location_id         BIGINT NOT NULL,
    store_id            TEXT NOT NULL,
    snapshot            JSONB NOT NULL,
    changed_at          TIMESTAMPTZ NOT NULL,
    ingested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id              TEXT,
    UNIQUE (inventory_item_id, location_id, store_id, changed_at)
);

CREATE INDEX IF NOT EXISTS idx_inventory_levels_history_item
    ON shopify.inventory_levels_history (inventory_item_id, location_id, store_id, changed_at DESC);
