-- 008: Shopify transactions — extracted from order payloads

CREATE TABLE IF NOT EXISTS shopify.transactions (
    id                      BIGINT NOT NULL,
    order_id                BIGINT NOT NULL,
    store_id                TEXT NOT NULL,
    kind                    TEXT,
    status                  TEXT,
    amount                  NUMERIC(12,2),
    currency                TEXT,
    gateway                 TEXT,
    created_at              TIMESTAMPTZ,
    parent_transaction_id   BIGINT,
    raw_s3_key              TEXT NOT NULL,
    schema_version          TEXT NOT NULL,
    ingested_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id                  TEXT,
    PRIMARY KEY (id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON shopify.transactions (order_id, store_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON shopify.transactions (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_run_id ON shopify.transactions (run_id);

CREATE TABLE IF NOT EXISTS shopify.transactions_history (
    history_id      BIGSERIAL PRIMARY KEY,
    transaction_id  BIGINT NOT NULL,
    store_id        TEXT NOT NULL,
    snapshot        JSONB NOT NULL,
    changed_at      TIMESTAMPTZ NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id          TEXT,
    UNIQUE (transaction_id, store_id, changed_at)
);

CREATE INDEX IF NOT EXISTS idx_transactions_history_txn ON shopify.transactions_history (transaction_id, store_id, changed_at DESC);
