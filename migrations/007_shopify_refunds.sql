-- 007: Shopify refunds — extracted from order payloads

CREATE TABLE IF NOT EXISTS shopify.refunds (
    id              BIGINT NOT NULL,
    order_id        BIGINT NOT NULL,
    store_id        TEXT NOT NULL,
    created_at      TIMESTAMPTZ,
    note            TEXT,
    total_refunded  NUMERIC(12,2),
    currency        TEXT,
    refund_line_items JSONB,
    raw_s3_key      TEXT NOT NULL,
    schema_version  TEXT NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id          TEXT,
    PRIMARY KEY (id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON shopify.refunds (order_id, store_id);
CREATE INDEX IF NOT EXISTS idx_refunds_created_at ON shopify.refunds (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_run_id ON shopify.refunds (run_id);

CREATE TABLE IF NOT EXISTS shopify.refunds_history (
    history_id  BIGSERIAL PRIMARY KEY,
    refund_id   BIGINT NOT NULL,
    store_id    TEXT NOT NULL,
    snapshot    JSONB NOT NULL,
    changed_at  TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id      TEXT,
    UNIQUE (refund_id, store_id, changed_at)
);

CREATE INDEX IF NOT EXISTS idx_refunds_history_refund ON shopify.refunds_history (refund_id, store_id, changed_at DESC);
