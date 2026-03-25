-- Migration 004: Shopify Customers
-- Creates the customers current-state table and customers_history table.

-- 004: Shopify customers current-state + history tables
CREATE TABLE IF NOT EXISTS shopify.customers (
    -- Primary identity
    id              BIGINT NOT NULL,
    store_id        TEXT NOT NULL,

    -- Core customer fields (source canonical)
    email           TEXT,
    first_name      TEXT,
    last_name       TEXT,
    phone           TEXT,
    state           TEXT,
    tags            TEXT[],
    note            TEXT,
    verified_email  BOOLEAN,
    tax_exempt      BOOLEAN,
    orders_count    INTEGER,
    total_spent     NUMERIC(12,2),

    -- Nested structures (JSONB in V1)
    default_address JSONB,
    addresses       JSONB,

    -- Timestamps
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ,

    -- Lineage & metadata
    raw_s3_key      TEXT NOT NULL,
    schema_version  TEXT NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id          TEXT,

    PRIMARY KEY (id, store_id)
);

-- Freshness queries
CREATE INDEX IF NOT EXISTS idx_customers_updated_at ON shopify.customers (store_id, updated_at DESC);

-- Run-based queries
CREATE INDEX IF NOT EXISTS idx_customers_run_id ON shopify.customers (run_id);


-- Append-only change log
CREATE TABLE IF NOT EXISTS shopify.customers_history (
    history_id  BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    store_id    TEXT NOT NULL,
    snapshot    JSONB NOT NULL,
    changed_at  TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id      TEXT,

    UNIQUE (customer_id, store_id, changed_at)
);

CREATE INDEX IF NOT EXISTS idx_customers_history_customer ON shopify.customers_history (customer_id, store_id, changed_at DESC);
