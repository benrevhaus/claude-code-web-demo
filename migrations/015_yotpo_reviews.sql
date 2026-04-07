-- Migration 015: Yotpo reviews source-canonical + generalized publication tables
-- ADR-033 (source-pure review streams), ADR-034 (infrastructure decisions)

-- =============================================================================
-- Section 1: Yotpo source-canonical schema
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS yotpo;

CREATE TABLE yotpo.reviews_raw_current (
    id              BIGINT       NOT NULL,
    store_id        TEXT         NOT NULL,
    score           INT,
    title           TEXT,
    content         TEXT,
    sentiment       NUMERIC,
    votes_up        INT          DEFAULT 0,
    votes_down      INT          DEFAULT 0,
    product_yotpo_id BIGINT,
    domain_key      TEXT,
    product_name    TEXT,
    reviewer_type   TEXT,
    verified_buyer  BOOLEAN,
    is_incentivized BOOLEAN      DEFAULT FALSE,
    incentive_type  TEXT,
    source_review_id BIGINT,
    images_data     JSONB        DEFAULT '[]'::JSONB,
    name            TEXT,
    email           TEXT,
    deleted         BOOLEAN      DEFAULT FALSE,
    archived        BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ,
    raw_payload     JSONB,
    raw_s3_key      TEXT,
    schema_version  TEXT,
    run_id          TEXT,
    ingested_at     TIMESTAMPTZ  DEFAULT NOW(),
    PRIMARY KEY (id, store_id)
);

CREATE TABLE yotpo.reviews_raw_history (
    review_id       BIGINT       NOT NULL,
    store_id        TEXT         NOT NULL,
    snapshot        JSONB        NOT NULL,
    changed_at      TIMESTAMPTZ  NOT NULL,
    run_id          TEXT,
    UNIQUE (review_id, store_id, changed_at)
);

CREATE TABLE yotpo.review_metadata_current (
    review_id       BIGINT       NOT NULL,
    store_id        TEXT         NOT NULL,
    country         TEXT,
    country_code    TEXT,
    state           TEXT,
    state_code      TEXT,
    raw_payload     JSONB,
    raw_s3_key      TEXT,
    schema_version  TEXT,
    run_id          TEXT,
    ingested_at     TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ,
    PRIMARY KEY (review_id, store_id)
);

CREATE TABLE yotpo.review_metadata_history (
    review_id       BIGINT       NOT NULL,
    store_id        TEXT         NOT NULL,
    snapshot        JSONB        NOT NULL,
    changed_at      TIMESTAMPTZ  NOT NULL,
    run_id          TEXT,
    UNIQUE (review_id, store_id, changed_at)
);

CREATE TABLE yotpo.snapshot_sets (
    snapshot_set_id TEXT         PRIMARY KEY,
    source          TEXT         NOT NULL DEFAULT 'yotpo',
    store_id        TEXT         NOT NULL,
    status          TEXT         NOT NULL DEFAULT 'pending',
    mode            TEXT         NOT NULL DEFAULT 'incremental',
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    threshold_policy JSONB
);

CREATE TABLE yotpo.snapshot_runs (
    snapshot_run_id TEXT         PRIMARY KEY,
    snapshot_set_id TEXT         NOT NULL REFERENCES yotpo.snapshot_sets(snapshot_set_id),
    stream          TEXT         NOT NULL,
    run_id          TEXT,
    status          TEXT         NOT NULL DEFAULT 'pending',
    records_total   INT          DEFAULT 0,
    pages_total     INT          DEFAULT 0,
    started_at      TIMESTAMPTZ  DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    error_message   TEXT
);

-- =============================================================================
-- Section 2: Reviews publication schema
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS reviews;

-- Layer 3: Yotpo-specific joined current table
CREATE TABLE reviews.yotpo_reviews_current (
    id              BIGINT       NOT NULL,
    store_id        TEXT         NOT NULL,
    score           INT,
    title           TEXT,
    content         TEXT,
    sentiment       NUMERIC,
    votes_up        INT          DEFAULT 0,
    votes_down      INT          DEFAULT 0,
    product_yotpo_id BIGINT,
    domain_key      TEXT,
    reviewer_type   TEXT,
    verified_buyer  BOOLEAN,
    images_data     JSONB        DEFAULT '[]'::JSONB,
    videos_data     JSONB        DEFAULT '[]'::JSONB,
    deleted         BOOLEAN      DEFAULT FALSE,
    -- author
    author_display_name TEXT,
    -- metadata join fields
    author_country  TEXT,
    author_country_code TEXT,
    author_state    TEXT,
    author_state_code TEXT,
    -- lineage
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ,
    published_snapshot_set_id TEXT,
    ingested_at     TIMESTAMPTZ  DEFAULT NOW(),
    PRIMARY KEY (id, store_id)
);

-- Layer 4: Generalized reviews (broad-access contract)
CREATE TABLE reviews.generalized_reviews_current (
    canonical_record_id         TEXT         NOT NULL,
    source                      TEXT         NOT NULL,
    source_record_id            TEXT         NOT NULL,
    source_schema_version       TEXT,
    generalized_schema_version  TEXT         NOT NULL DEFAULT 'reviews.generalized.v1',
    source_snapshot_set_id      TEXT,
    published_snapshot_set_id   TEXT         NOT NULL,
    review_type                 TEXT         NOT NULL DEFAULT 'product',
    subject_type                TEXT         NOT NULL,
    subject_source              TEXT         NOT NULL,
    subject_source_id           TEXT         NOT NULL,
    subject_canonical_id        TEXT         NOT NULL,
    vendor_visibility_state     TEXT,
    publishability_status       TEXT         NOT NULL,
    publishable_to_site         BOOLEAN      NOT NULL DEFAULT FALSE,
    published_to_site           BOOLEAN      NOT NULL DEFAULT FALSE,
    site_publish_blockers       JSONB        DEFAULT '[]'::JSONB,
    rating_value                INT,
    rating_scale_min            INT          DEFAULT 1,
    rating_scale_max            INT          DEFAULT 5,
    rating_normalized_5         NUMERIC(3,2),
    rating_normalization_version TEXT,
    sentiment_source_value      NUMERIC,
    sentiment_source_model      TEXT,
    sentiment_normalized        NUMERIC,
    sentiment_normalization_version TEXT,
    helpful_vote_count          INT          DEFAULT 0,
    unhelpful_vote_count        INT          DEFAULT 0,
    supports_helpful_votes      BOOLEAN      DEFAULT TRUE,
    supports_unhelpful_votes    BOOLEAN      DEFAULT TRUE,
    verified_buyer              BOOLEAN,
    is_incentivized             BOOLEAN,
    incentive_type              TEXT,
    submitted_at                TIMESTAMPTZ,
    published_at                TIMESTAMPTZ,
    updated_at                  TIMESTAMPTZ,
    deleted_at                  TIMESTAMPTZ,
    title                       TEXT,
    body                        TEXT,
    author_display_name         TEXT,
    author_verified_buyer       BOOLEAN,
    author_country              TEXT,
    author_country_code         TEXT,
    author_state                TEXT,
    author_state_code           TEXT,
    customer_binding_status     TEXT,
    -- product-specific snapshot columns
    product_source              TEXT,
    product_source_id           TEXT,
    product_canonical_id        TEXT,
    product_title_snapshot      TEXT,
    product_handle_snapshot     TEXT,
    -- structured JSONB containers
    media                       JSONB        DEFAULT '[]'::JSONB,
    metadata                    JSONB        DEFAULT '{}'::JSONB,
    relationships               JSONB        DEFAULT '{}'::JSONB,
    provider_fields             JSONB        DEFAULT '{}'::JSONB,
    -- lineage
    ingested_at                 TIMESTAMPTZ  DEFAULT NOW(),
    PRIMARY KEY (canonical_record_id)
);

-- Restricted identity companion
CREATE TABLE reviews.generalized_review_identity_links (
    canonical_record_id         TEXT         PRIMARY KEY,
    published_snapshot_set_id   TEXT,
    source                      TEXT         NOT NULL,
    source_record_id            TEXT         NOT NULL,
    is_published                BOOLEAN      DEFAULT FALSE,
    customer_binding_status     TEXT,
    raw_email                   TEXT,
    normalized_email            TEXT,
    source_customer_id          TEXT,
    source_user_ref             TEXT,
    previous_identity_hash      TEXT,
    last_identity_changed_at    TIMESTAMPTZ,
    updated_at                  TIMESTAMPTZ  DEFAULT NOW()
);

-- Publication exceptions
CREATE TABLE reviews.generalized_review_publish_exceptions (
    canonical_record_id         TEXT         NOT NULL,
    published_snapshot_set_id   TEXT         NOT NULL,
    exception_code              TEXT         NOT NULL,
    exception_reason            TEXT,
    first_seen_at               TIMESTAMPTZ  DEFAULT NOW(),
    last_seen_at                TIMESTAMPTZ  DEFAULT NOW(),
    diagnostics                 JSONB        DEFAULT '{}'::JSONB,
    PRIMARY KEY (canonical_record_id)
);

-- Publication audit
CREATE TABLE reviews.generalized_review_publish_audit (
    canonical_record_id         TEXT         PRIMARY KEY,
    published_snapshot_set_id   TEXT         NOT NULL,
    decision                    TEXT         NOT NULL,
    decision_signature          TEXT,
    publishable_to_site         BOOLEAN,
    published_to_site           BOOLEAN,
    blocker_set                 JSONB        DEFAULT '[]'::JSONB,
    winning_source_diagnostics  JSONB        DEFAULT '{}'::JSONB,
    first_seen_at               TIMESTAMPTZ  DEFAULT NOW(),
    last_evaluated_at           TIMESTAMPTZ  DEFAULT NOW(),
    decision_changed_at         TIMESTAMPTZ
);

-- =============================================================================
-- Section 3: Postgres roles
-- =============================================================================
-- NOTE: The per-source roles created here (reviews_reader, reviews_restricted)
-- are SUPERSEDED by migration 016 which introduces platform-wide data_reader
-- and data_restricted roles. Migration 016 revokes these grants and applies
-- uniform access control across all schemas.
--
-- This section is retained so migration 015 remains a valid standalone DDL
-- if replayed on a fresh database before 016 runs.

DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'reviews_reader') THEN
        CREATE ROLE reviews_reader;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'reviews_restricted') THEN
        CREATE ROLE reviews_restricted;
    END IF;
END $$;

GRANT USAGE ON SCHEMA reviews TO reviews_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA reviews TO reviews_reader;
REVOKE SELECT ON reviews.generalized_review_identity_links FROM reviews_reader;

GRANT USAGE ON SCHEMA reviews TO reviews_restricted;
GRANT SELECT ON reviews.generalized_review_identity_links TO reviews_restricted;

-- =============================================================================
-- Section 4: Indexes
-- =============================================================================

CREATE INDEX idx_yotpo_reviews_store_updated
    ON yotpo.reviews_raw_current (store_id, updated_at DESC);
CREATE INDEX idx_yotpo_reviews_domain_key
    ON yotpo.reviews_raw_current (domain_key) WHERE domain_key IS NOT NULL;
CREATE INDEX idx_yotpo_metadata_store_review
    ON yotpo.review_metadata_current (store_id, review_id);

CREATE INDEX idx_gen_reviews_subject
    ON reviews.generalized_reviews_current (subject_canonical_id);
CREATE INDEX idx_gen_reviews_snapshot
    ON reviews.generalized_reviews_current (published_snapshot_set_id);
CREATE INDEX idx_gen_reviews_publishability
    ON reviews.generalized_reviews_current (publishability_status);
CREATE INDEX idx_gen_reviews_source
    ON reviews.generalized_reviews_current (source, source_record_id);

CREATE INDEX idx_yotpo_current_domain_key
    ON reviews.yotpo_reviews_current (domain_key) WHERE domain_key IS NOT NULL;
CREATE INDEX idx_yotpo_current_snapshot
    ON reviews.yotpo_reviews_current (published_snapshot_set_id);
