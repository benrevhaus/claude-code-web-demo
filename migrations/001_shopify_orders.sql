-- Migration 001: Shopify Orders
-- Creates the shopify schema, orders table, and orders_history table.

CREATE SCHEMA IF NOT EXISTS shopify;

-- Current-state table with upsert-on-newer pattern
CREATE TABLE shopify.orders (
    -- Primary identity
    id              BIGINT NOT NULL,
    store_id        TEXT NOT NULL,

    -- Core order fields (source canonical)
    order_number    TEXT,
    email           TEXT,
    financial_status TEXT,
    fulfillment_status TEXT,
    total_price     NUMERIC(12,2),
    currency        TEXT,
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    tags            TEXT[],
    note            TEXT,

    -- Nested structures (JSONB in V1)
    line_items      JSONB,
    shipping_address JSONB,
    billing_address  JSONB,

    -- Lineage & metadata
    raw_s3_key      TEXT NOT NULL,
    schema_version  TEXT NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id          TEXT,

    PRIMARY KEY (id, store_id)
);

-- Freshness queries
CREATE INDEX idx_orders_updated_at ON shopify.orders (store_id, updated_at DESC);

-- Run-based queries
CREATE INDEX idx_orders_run_id ON shopify.orders (run_id);


-- Append-only change log
CREATE TABLE shopify.orders_history (
    history_id  BIGSERIAL PRIMARY KEY,
    order_id    BIGINT NOT NULL,
    store_id    TEXT NOT NULL,
    snapshot    JSONB NOT NULL,
    changed_at  TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id      TEXT,

    UNIQUE (order_id, store_id, changed_at)
);

CREATE INDEX idx_orders_history_order ON shopify.orders_history (order_id, store_id, changed_at DESC);
