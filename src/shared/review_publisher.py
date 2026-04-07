"""Review publication module — last-writer-wins orchestration.

Checks whether both Yotpo source streams are fresh, then runs the full
publication pass: yotpo_reviews_current → generalized_reviews_current
+ identity links + exceptions + audit.

This is the logic layer (Golden Path). The handler calls it; it uses
pg_client's connection for SQL execution.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from src.shared.observability import setup_logging

log = setup_logging("review-publisher")


@dataclass
class PublicationResult:
    snapshot_set_id: str
    status: str
    reviews_published: int = 0
    reviews_excluded: int = 0
    identity_links: int = 0
    audit_rows: int = 0


def check_publication_readiness(
    pg,
    source: str,
    store_id: str,
    reviews_threshold_min: int = 30,
    metadata_threshold_min: int = 120,
) -> bool:
    """Check if both source streams are fresh enough to publish."""
    pg._ensure_connection()
    with pg.connection.cursor() as cur:
        cur.execute(
            """
            SELECT stream, last_status, last_run_at
            FROM control.stream_cursors
            WHERE source = %s AND stream IN ('reviews', 'review-metadata') AND store_id = %s
            """,
            (source, store_id),
        )
        rows = {row[0]: {"status": row[1], "last_run_at": row[2]} for row in cur.fetchall()}

    if "reviews" not in rows or "review-metadata" not in rows:
        log.info("Publication skipped: not all source streams have cursors", streams_found=list(rows.keys()))
        return False

    now = datetime.now(timezone.utc)

    for stream, threshold in [("reviews", reviews_threshold_min), ("review-metadata", metadata_threshold_min)]:
        info = rows[stream]
        if info["status"] != "success":
            log.info("Publication skipped: stream not in success state", stream=stream, status=info["status"])
            return False
        if info["last_run_at"] is None:
            return False
        last_run = info["last_run_at"]
        if last_run.tzinfo is None:
            last_run = last_run.replace(tzinfo=timezone.utc)
        age_minutes = (now - last_run).total_seconds() / 60
        if age_minutes > threshold:
            log.info("Publication skipped: stream data too stale", stream=stream, age_minutes=round(age_minutes, 1), threshold=threshold)
            return False

    return True


def run_publication_pass(pg, store_id: str, run_id: str) -> dict[str, Any]:
    """Execute the full publication pass in one transaction."""
    pg._ensure_connection()
    snapshot_set_id = str(uuid.uuid4())

    log.info("Publication pass starting", snapshot_set_id=snapshot_set_id, store_id=store_id)

    try:
        with pg.connection.cursor() as cur:
            # 1. Create snapshot set
            cur.execute(
                """
                INSERT INTO yotpo.snapshot_sets (snapshot_set_id, source, store_id, status, mode)
                VALUES (%s, 'yotpo', %s, 'running', 'incremental')
                """,
                (snapshot_set_id, store_id),
            )

            # 2. Record snapshot runs for both source streams
            for stream in ("reviews", "review-metadata"):
                cur.execute(
                    """
                    INSERT INTO yotpo.snapshot_runs (snapshot_run_id, snapshot_set_id, stream, run_id, status)
                    SELECT %s, %s, %s, run_id, last_status
                    FROM control.stream_cursors
                    WHERE source = 'yotpo' AND stream = %s AND store_id = %s
                    """,
                    (str(uuid.uuid4()), snapshot_set_id, stream, stream, store_id),
                )

            # 3. Build reviews.yotpo_reviews_current (source-specific joined layer)
            cur.execute(
                """
                INSERT INTO reviews.yotpo_reviews_current (
                    id, store_id, score, title, content, sentiment,
                    votes_up, votes_down, product_yotpo_id, domain_key,
                    reviewer_type, verified_buyer, images_data, videos_data, deleted,
                    author_display_name,
                    author_country, author_country_code, author_state, author_state_code,
                    created_at, updated_at, published_snapshot_set_id
                )
                SELECT
                    r.id, r.store_id, r.score, r.title, r.content, r.sentiment,
                    r.votes_up, r.votes_down, r.product_yotpo_id, r.domain_key,
                    r.reviewer_type, r.verified_buyer, r.images_data, r.videos_data, r.deleted,
                    r.name,
                    m.country, m.country_code, m.state, m.state_code,
                    r.created_at, r.updated_at, %s
                FROM yotpo.reviews_raw_current r
                LEFT JOIN yotpo.review_metadata_current m
                    ON r.id = m.review_id AND r.store_id = m.store_id
                WHERE r.store_id = %s
                ON CONFLICT (id, store_id) DO UPDATE SET
                    score = EXCLUDED.score, title = EXCLUDED.title,
                    content = EXCLUDED.content, sentiment = EXCLUDED.sentiment,
                    votes_up = EXCLUDED.votes_up, votes_down = EXCLUDED.votes_down,
                    product_yotpo_id = EXCLUDED.product_yotpo_id, domain_key = EXCLUDED.domain_key,
                    reviewer_type = EXCLUDED.reviewer_type, verified_buyer = EXCLUDED.verified_buyer,
                    images_data = EXCLUDED.images_data, videos_data = EXCLUDED.videos_data,
                    deleted = EXCLUDED.deleted,
                    author_display_name = EXCLUDED.author_display_name,
                    author_country = EXCLUDED.author_country, author_country_code = EXCLUDED.author_country_code,
                    author_state = EXCLUDED.author_state, author_state_code = EXCLUDED.author_state_code,
                    created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at,
                    published_snapshot_set_id = EXCLUDED.published_snapshot_set_id,
                    ingested_at = NOW()
                """,
                (snapshot_set_id, store_id),
            )
            yotpo_current_count = cur.rowcount

            # 4. Build generalized reviews from yotpo_reviews_current
            #    Rows missing domain_key are excluded (no valid subject identity)
            cur.execute(
                """
                INSERT INTO reviews.generalized_reviews_current (
                    canonical_record_id, source, source_record_id,
                    source_schema_version, published_snapshot_set_id,
                    review_type, subject_type, subject_source, subject_source_id, subject_canonical_id,
                    vendor_visibility_state, publishability_status,
                    publishable_to_site, published_to_site, site_publish_blockers,
                    rating_value, rating_scale_min, rating_scale_max, rating_normalized_5,
                    sentiment_source_value, sentiment_normalized,
                    helpful_vote_count, unhelpful_vote_count,
                    supports_helpful_votes, supports_unhelpful_votes,
                    verified_buyer, submitted_at, published_at, updated_at, deleted_at,
                    title, body, author_display_name, author_verified_buyer,
                    author_country, author_country_code, author_state, author_state_code,
                    product_source, product_source_id, product_canonical_id,
                    media, metadata, relationships, provider_fields
                )
                SELECT
                    'yotpo:' || y.id::TEXT,
                    'yotpo',
                    y.id::TEXT,
                    'yotpo.review.v1',
                    %s,
                    'product',
                    'product',
                    'shopify',
                    y.domain_key,
                    'shopify_product:' || y.domain_key,
                    CASE WHEN y.deleted THEN 'deleted' ELSE 'published' END,
                    CASE WHEN y.deleted THEN 'excluded' ELSE 'publishable' END,
                    NOT y.deleted,
                    NOT y.deleted,
                    CASE WHEN y.deleted THEN '["vendor:deleted"]'::JSONB ELSE '[]'::JSONB END,
                    y.score, 1, 5,
                    CASE WHEN y.score IS NOT NULL THEN ROUND(y.score::NUMERIC, 2) ELSE NULL END,
                    y.sentiment,
                    y.sentiment,
                    y.votes_up, y.votes_down,
                    TRUE, TRUE,
                    y.verified_buyer,
                    y.created_at,
                    y.created_at,
                    y.updated_at,
                    CASE WHEN y.deleted THEN y.updated_at ELSE NULL END,
                    y.title, y.content,
                    y.author_display_name,
                    y.verified_buyer,
                    y.author_country, y.author_country_code,
                    y.author_state, y.author_state_code,
                    'shopify',
                    y.domain_key,
                    'shopify_product:' || y.domain_key,
                    COALESCE(y.images_data, '[]'::JSONB) || COALESCE(y.videos_data, '[]'::JSONB),
                    '{}'::JSONB,
                    '{}'::JSONB,
                    '{}'::JSONB
                FROM reviews.yotpo_reviews_current y
                WHERE y.store_id = %s
                    AND y.domain_key IS NOT NULL
                ON CONFLICT (canonical_record_id) DO UPDATE SET
                    source_schema_version = EXCLUDED.source_schema_version,
                    published_snapshot_set_id = EXCLUDED.published_snapshot_set_id,
                    vendor_visibility_state = EXCLUDED.vendor_visibility_state,
                    publishability_status = EXCLUDED.publishability_status,
                    publishable_to_site = EXCLUDED.publishable_to_site,
                    published_to_site = EXCLUDED.published_to_site,
                    site_publish_blockers = EXCLUDED.site_publish_blockers,
                    rating_value = EXCLUDED.rating_value,
                    rating_normalized_5 = EXCLUDED.rating_normalized_5,
                    sentiment_source_value = EXCLUDED.sentiment_source_value,
                    sentiment_normalized = EXCLUDED.sentiment_normalized,
                    helpful_vote_count = EXCLUDED.helpful_vote_count,
                    unhelpful_vote_count = EXCLUDED.unhelpful_vote_count,
                    verified_buyer = EXCLUDED.verified_buyer,
                    updated_at = EXCLUDED.updated_at,
                    deleted_at = EXCLUDED.deleted_at,
                    title = EXCLUDED.title, body = EXCLUDED.body,
                    author_verified_buyer = EXCLUDED.author_verified_buyer,
                    author_country = EXCLUDED.author_country,
                    author_country_code = EXCLUDED.author_country_code,
                    author_state = EXCLUDED.author_state,
                    author_state_code = EXCLUDED.author_state_code,
                    media = EXCLUDED.media,
                    provider_fields = EXCLUDED.provider_fields,
                    ingested_at = NOW()
                """,
                (snapshot_set_id, store_id),
            )
            published_count = cur.rowcount

            # 5. Build identity links for all reviews (including excluded)
            #    Email comes from source-canonical (not yotpo_reviews_current — email is sensitive)
            cur.execute(
                """
                INSERT INTO reviews.generalized_review_identity_links (
                    canonical_record_id, published_snapshot_set_id, source, source_record_id,
                    is_published, customer_binding_status, raw_email, updated_at
                )
                SELECT
                    'yotpo:' || y.id::TEXT,
                    %s,
                    'yotpo',
                    y.id::TEXT,
                    y.domain_key IS NOT NULL AND NOT y.deleted,
                    CASE WHEN y.verified_buyer THEN 'verified' ELSE 'unverified' END,
                    r.email,
                    NOW()
                FROM reviews.yotpo_reviews_current y
                LEFT JOIN yotpo.reviews_raw_current r
                    ON y.id = r.id AND y.store_id = r.store_id
                WHERE y.store_id = %s
                ON CONFLICT (canonical_record_id) DO UPDATE SET
                    published_snapshot_set_id = EXCLUDED.published_snapshot_set_id,
                    is_published = EXCLUDED.is_published,
                    customer_binding_status = EXCLUDED.customer_binding_status,
                    raw_email = EXCLUDED.raw_email,
                    updated_at = NOW()
                """,
                (snapshot_set_id, store_id),
            )
            identity_count = cur.rowcount

            # 6. Build publish exceptions for rows missing subject identity
            cur.execute(
                """
                INSERT INTO reviews.generalized_review_publish_exceptions (
                    canonical_record_id, published_snapshot_set_id,
                    exception_code, exception_reason, last_seen_at
                )
                SELECT
                    'yotpo:' || y.id::TEXT,
                    %s,
                    CASE
                        WHEN y.domain_key IS NULL THEN 'missing_subject_identity'
                        WHEN y.deleted THEN 'vendor_deleted'
                        ELSE 'unknown'
                    END,
                    CASE
                        WHEN y.domain_key IS NULL THEN 'Review has no domain_key — cannot determine product subject'
                        WHEN y.deleted THEN 'Review marked deleted by vendor'
                        ELSE 'Unknown exclusion reason'
                    END,
                    NOW()
                FROM reviews.yotpo_reviews_current y
                WHERE y.store_id = %s
                    AND (y.domain_key IS NULL OR y.deleted)
                ON CONFLICT (canonical_record_id) DO UPDATE SET
                    published_snapshot_set_id = EXCLUDED.published_snapshot_set_id,
                    exception_code = EXCLUDED.exception_code,
                    exception_reason = EXCLUDED.exception_reason,
                    last_seen_at = NOW()
                """,
                (snapshot_set_id, store_id),
            )
            excluded_count = cur.rowcount

            # Remove exceptions for rows that are now publishable
            cur.execute(
                """
                DELETE FROM reviews.generalized_review_publish_exceptions e
                WHERE e.canonical_record_id IN (
                    SELECT 'yotpo:' || y.id::TEXT
                    FROM reviews.yotpo_reviews_current y
                    WHERE y.store_id = %s AND y.domain_key IS NOT NULL AND NOT y.deleted
                )
                """,
                (store_id,),
            )

            # 7. Build publish audit
            cur.execute(
                """
                INSERT INTO reviews.generalized_review_publish_audit (
                    canonical_record_id, published_snapshot_set_id,
                    decision, publishable_to_site, published_to_site,
                    blocker_set, last_evaluated_at
                )
                SELECT
                    'yotpo:' || y.id::TEXT,
                    %s,
                    CASE
                        WHEN y.domain_key IS NOT NULL AND NOT y.deleted THEN 'publish'
                        ELSE 'exclude'
                    END,
                    y.domain_key IS NOT NULL AND NOT y.deleted,
                    y.domain_key IS NOT NULL AND NOT y.deleted,
                    CASE
                        WHEN y.domain_key IS NULL THEN '["missing_subject_identity"]'::JSONB
                        WHEN y.deleted THEN '["vendor_deleted"]'::JSONB
                        ELSE '[]'::JSONB
                    END,
                    NOW()
                FROM reviews.yotpo_reviews_current y
                WHERE y.store_id = %s
                ON CONFLICT (canonical_record_id) DO UPDATE SET
                    published_snapshot_set_id = EXCLUDED.published_snapshot_set_id,
                    decision = EXCLUDED.decision,
                    publishable_to_site = EXCLUDED.publishable_to_site,
                    published_to_site = EXCLUDED.published_to_site,
                    blocker_set = EXCLUDED.blocker_set,
                    last_evaluated_at = NOW(),
                    decision_changed_at = CASE
                        WHEN reviews.generalized_review_publish_audit.decision != EXCLUDED.decision
                        THEN NOW()
                        ELSE reviews.generalized_review_publish_audit.decision_changed_at
                    END
                """,
                (snapshot_set_id, store_id),
            )
            audit_count = cur.rowcount

            # Mark snapshot set complete
            cur.execute(
                """
                UPDATE yotpo.snapshot_sets
                SET status = 'success', completed_at = NOW()
                WHERE snapshot_set_id = %s
                """,
                (snapshot_set_id,),
            )

        pg.commit()

        result = {
            "snapshot_set_id": snapshot_set_id,
            "status": "success",
            "yotpo_current_rows": yotpo_current_count,
            "reviews_published": published_count,
            "reviews_excluded": excluded_count,
            "identity_links": identity_count,
            "audit_rows": audit_count,
        }
        log.info("Publication pass complete", **result)
        return result

    except Exception as e:
        pg.rollback()
        log.error("Publication pass failed", error=str(e), snapshot_set_id=snapshot_set_id)
        # Mark snapshot set as failed
        try:
            with pg.connection.cursor() as cur:
                cur.execute(
                    "UPDATE yotpo.snapshot_sets SET status = 'failed', completed_at = NOW() WHERE snapshot_set_id = %s",
                    (snapshot_set_id,),
                )
            pg.commit()
        except Exception:
            pass
        raise
