-- 005: Shopify products current-state + history tables

CREATE TABLE IF NOT EXISTS shopify.products (
    id              BIGINT NOT NULL,
    store_id        TEXT NOT NULL,
    title           TEXT,
    handle          TEXT,
    body_html       TEXT,
    vendor          TEXT,
    product_type    TEXT,
    status          TEXT,
    tags            TEXT[],
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ,
    published_at    TIMESTAMPTZ,
    variants        JSONB,
    images          JSONB,
    raw_s3_key      TEXT NOT NULL,
    schema_version  TEXT NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id          TEXT,
    PRIMARY KEY (id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_products_updated_at ON shopify.products (store_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_run_id ON shopify.products (run_id);

CREATE TABLE IF NOT EXISTS shopify.products_history (
    history_id  BIGSERIAL PRIMARY KEY,
    product_id  BIGINT NOT NULL,
    store_id    TEXT NOT NULL,
    snapshot    JSONB NOT NULL,
    changed_at  TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id      TEXT,
    UNIQUE (product_id, store_id, changed_at)
);

CREATE INDEX IF NOT EXISTS idx_products_history_product ON shopify.products_history (product_id, store_id, changed_at DESC);
