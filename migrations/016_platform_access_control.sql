-- Migration 016: Platform-wide role-based access control
-- ADR-035 (PII boundary enforcement), ADR-034 (review infrastructure)
--
-- Two platform-wide roles:
--   data_reader   — analysts, dashboards, BI tools. Non-PII tables only.
--   data_operator  — pipeline debugging, oncall. All tables including PII.
--
-- Customer 360 is NOT served by either role. When Customer 360 is built,
-- a scoped data_identity role will be created with grants designed against
-- its actual query needs — not speculative grants. Until then, Customer 360
-- must not connect as data_operator (ADR-035).
--
-- Replaces per-source reviews_reader / reviews_restricted from migration 015.

-- =============================================================================
-- Section 1: Create platform-wide roles
-- =============================================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'data_reader') THEN
        CREATE ROLE data_reader;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'data_operator') THEN
        CREATE ROLE data_operator;
    END IF;
END $$;

-- data_operator inherits data_reader access (superset)
GRANT data_reader TO data_operator;

-- =============================================================================
-- Section 2: shopify schema
-- =============================================================================
-- PII tables: orders (email, addresses), customers (email, name, phone, addresses)
-- Non-PII tables: products, inventory, refunds, transactions

GRANT USAGE ON SCHEMA shopify TO data_reader;
GRANT SELECT ON shopify.products TO data_reader;
GRANT SELECT ON shopify.products_history TO data_reader;
GRANT SELECT ON shopify.inventory_levels TO data_reader;
GRANT SELECT ON shopify.inventory_levels_history TO data_reader;
GRANT SELECT ON shopify.refunds TO data_reader;
GRANT SELECT ON shopify.refunds_history TO data_reader;
GRANT SELECT ON shopify.transactions TO data_reader;
GRANT SELECT ON shopify.transactions_history TO data_reader;

-- PII tables — data_operator only (inherits schema USAGE from data_reader)
GRANT SELECT ON shopify.orders TO data_operator;
GRANT SELECT ON shopify.orders_history TO data_operator;
GRANT SELECT ON shopify.customers TO data_operator;
GRANT SELECT ON shopify.customers_history TO data_operator;

-- =============================================================================
-- Section 3: gorgias schema
-- =============================================================================
-- Every table contains PII via the customer JSONB blob.
-- data_reader gets NO access to gorgias.

GRANT USAGE ON SCHEMA gorgias TO data_operator;
GRANT SELECT ON gorgias.tickets TO data_operator;
GRANT SELECT ON gorgias.tickets_history TO data_operator;

-- =============================================================================
-- Section 4: yotpo schema — source-canonical, operator-only
-- =============================================================================
-- Contains email column + raw_payload JSONB with email.

GRANT USAGE ON SCHEMA yotpo TO data_operator;
GRANT SELECT ON ALL TABLES IN SCHEMA yotpo TO data_operator;

-- =============================================================================
-- Section 5: reviews schema — published tables are broad-access
-- =============================================================================
-- Identity companion is operator-only until a scoped data_identity role
-- is created for Customer 360.

GRANT USAGE ON SCHEMA reviews TO data_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA reviews TO data_reader;
REVOKE SELECT ON reviews.generalized_review_identity_links FROM data_reader;

GRANT SELECT ON reviews.generalized_review_identity_links TO data_operator;

-- =============================================================================
-- Section 6: analytics schema — no PII
-- =============================================================================

GRANT USAGE ON SCHEMA analytics TO data_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO data_reader;

-- =============================================================================
-- Section 7: control schema — operational metadata, no PII
-- =============================================================================

GRANT USAGE ON SCHEMA control TO data_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA control TO data_reader;

-- =============================================================================
-- Section 8: Retire per-source roles from migration 015
-- =============================================================================
-- Revoke grants given to reviews_reader / reviews_restricted in 015.
-- The roles themselves are left in place (harmless) — dropping them would fail
-- if any session or object depends on them.

DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'reviews_reader') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA reviews FROM reviews_reader';
        EXECUTE 'REVOKE USAGE ON SCHEMA reviews FROM reviews_reader';
        EXECUTE 'REVOKE USAGE ON SCHEMA yotpo FROM reviews_reader';
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'reviews_restricted') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA reviews FROM reviews_restricted';
        EXECUTE 'REVOKE USAGE ON SCHEMA reviews FROM reviews_restricted';
    END IF;
END $$;
