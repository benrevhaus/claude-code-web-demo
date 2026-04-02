import { Router } from "express";

import { buildWhereClause, parsePagination, type QueryFilters, type SortDirection } from "../lib/filters.js";
import { runHistoricalBackfill } from "../lib/ga4.js";
import { pool } from "../lib/db.js";
import { config } from "../config.js";

const router = Router();

const pageSortColumns = new Set(["date_pst", "page_path", "landing_page_path", "views", "sessions", "total_users", "event_count"]);
const eventSortColumns = new Set([
  "date_pst",
  "page_path",
  "landing_page_path",
  "event_name",
  "normalized_event_name",
  "raw_event_name",
  "event_class",
  "event_count",
  "sessions",
  "total_users",
]);
const variantSortColumns = new Set([
  "date_pst",
  "page_path",
  "landing_page_path",
  "variant_key",
  "variant_value",
  "views",
  "sessions",
  "total_users",
  "event_count",
]);

const PAGE_GROUPINGS: Record<string, string[]> = {
  detail: ["date_pst", "page_path", "page_title", "landing_page_path", "device_category", "source_medium"],
  page: ["date_pst", "page_path", "page_title"],
  device: ["date_pst", "page_path", "page_title", "device_category"],
  source_medium: ["date_pst", "page_path", "page_title", "source_medium"],
};

const EVENT_GROUPINGS: Record<string, string[]> = {
  detail: [
    "date_pst",
    "page_path",
    "landing_page_path",
    "normalized_event_name",
    "raw_event_name",
    "event_class",
    "derived_page_path",
    "device_category",
    "source_medium",
    "is_conversion_event",
  ],
  page: ["date_pst", "page_path", "normalized_event_name", "event_class", "is_conversion_event"],
  device: ["date_pst", "page_path", "normalized_event_name", "event_class", "device_category", "is_conversion_event"],
  source_medium: ["date_pst", "page_path", "normalized_event_name", "event_class", "source_medium", "is_conversion_event"],
  event: ["date_pst", "normalized_event_name", "event_class", "is_conversion_event"],
};

function buildGroupedSelect(groupingColumns: string[], metricTableAlias?: string) {
  const prefix = metricTableAlias ? `${metricTableAlias}.` : "";
  const dimensions = groupingColumns.map((column) => {
    if (column === "normalized_event_name") {
      return `${prefix}normalized_event_name AS event_name`;
    }
    return `${prefix}${column}`;
  });

  const passthroughDefaults = [
    ["page_title", "''"],
    ["landing_page_path", "''"],
    ["device_category", "''"],
    ["source_medium", "''"],
    ["raw_event_name", "''"],
    ["event_class", "'valid_event'"],
    ["derived_page_path", "''"],
    ["is_conversion_event", "false"],
  ] as const;

  for (const [column, fallback] of passthroughDefaults) {
    if (!groupingColumns.includes(column) && !dimensions.some((entry) => entry.includes(` ${column}`) || entry.endsWith(`.${column}`) || entry === column)) {
      dimensions.push(`${fallback} AS ${column}`);
    }
  }

  return dimensions.join(",\n        ");
}

function parseFilters(query: Record<string, string | undefined>): QueryFilters {
  return {
    startDate: query.startDate,
    endDate: query.endDate,
    pagePath: query.pagePath,
    landingPagePath: query.landingPagePath,
    eventName: query.eventName,
    eventNames:
      query.eventNames === "__none__"
        ? []
        : query.eventNames
          ? query.eventNames.split(",").filter(Boolean)
          : undefined,
    rawEventName: query.rawEventName,
    eventClass: query.eventClass ?? "valid_event",
    variantKey: query.variantKey,
    variantValue: query.variantValue,
    deviceCategory: query.deviceCategory,
    sourceMedium: query.sourceMedium,
    conversionOnly: query.conversionOnly,
    search: query.search,
    groupBy: query.groupBy,
  };
}

router.get("/health", async (_req, res) => {
  const result = await pool.query("SELECT NOW() as now");
  res.json({ ok: true, now: result.rows[0].now });
});

router.post("/sync/backfill", async (req, res, next) => {
  try {
    const days = Number.parseInt(String(req.body?.days ?? config.GA4_DEFAULT_BACKFILL_DAYS), 10);
    const result = await runHistoricalBackfill(days);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/summary", async (req, res, next) => {
  try {
    const filters = parseFilters(req.query as Record<string, string | undefined>);
    const pagesWhere = buildWhereClause(filters, {
      alias: "p",
      includeEventName: false,
      includeSearchOnEventName: false,
    });
    const eventsWhere = buildWhereClause(filters, { alias: "e" });

    const [pages, events, latestSync] = await Promise.all([
      pool.query(
        `
        SELECT
          COALESCE(SUM(p.views), 0) AS views,
          COALESCE(SUM(p.sessions), 0) AS sessions,
          COALESCE(SUM(p.total_users), 0) AS total_users,
          COUNT(DISTINCT p.page_path) AS page_count
        FROM analytics.ga4_page_daily p
        ${pagesWhere.text}
        `,
        pagesWhere.params,
      ),
      pool.query(
        `
        SELECT
          COALESCE(SUM(e.event_count), 0) AS event_count,
          COUNT(DISTINCT e.event_name) AS distinct_events
        FROM analytics.ga4_event_daily e
        ${eventsWhere.text}
        `,
        eventsWhere.params,
      ),
      pool.query(
        `
        SELECT id, status, started_at, finished_at, pages_rows, events_rows
        FROM analytics.ga4_sync_runs
        ORDER BY id DESC
        LIMIT 1
        `,
      ),
    ]);

    res.json({
      summary: {
        views: Number(pages.rows[0].views),
        sessions: Number(pages.rows[0].sessions),
        totalUsers: Number(pages.rows[0].total_users),
        pageCount: Number(pages.rows[0].page_count),
        eventCount: Number(events.rows[0].event_count),
        distinctEvents: Number(events.rows[0].distinct_events),
      },
      latestSync: latestSync.rows[0] ?? null,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/pages", async (req, res, next) => {
  try {
    const filters = parseFilters(req.query as Record<string, string | undefined>);
    const pagination = parsePagination(req.query as Record<string, string | undefined>);
    const requestedSort = String(req.query.sortBy ?? "date_pst");
    const sortBy = pageSortColumns.has(requestedSort) ? requestedSort : "date_pst";
    const sortDirection: SortDirection = req.query.sortDirection === "asc" ? "asc" : "desc";
    const groupBy = PAGE_GROUPINGS[filters.groupBy ?? "detail"] ? filters.groupBy ?? "detail" : "detail";
    const groupingColumns = PAGE_GROUPINGS[groupBy];
    const where = buildWhereClause(filters, {
      includeEventName: false,
      includeSearchOnEventName: false,
    });

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM (SELECT 1 FROM analytics.ga4_page_daily ${where.text} GROUP BY ${groupingColumns.join(", ")}) grouped`,
      where.params,
    );

    const rowsResult = await pool.query(
      `
      SELECT
        ${buildGroupedSelect(groupingColumns)}
        ,
        SUM(views) AS views,
        SUM(sessions) AS sessions,
        SUM(total_users) AS total_users,
        SUM(event_count) AS event_count
      FROM analytics.ga4_page_daily
      ${where.text}
      GROUP BY ${groupingColumns.join(", ")}
      ORDER BY ${sortBy} ${sortDirection}
      LIMIT $${where.params.length + 1}
      OFFSET $${where.params.length + 2}
      `,
      [...where.params, pagination.pageSize, pagination.offset],
    );

    res.json({
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: Number(countResult.rows[0].count),
      groupBy,
      rows: rowsResult.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/events", async (req, res, next) => {
  try {
    const filters = parseFilters(req.query as Record<string, string | undefined>);
    const pagination = parsePagination(req.query as Record<string, string | undefined>);
    const requestedSort = String(req.query.sortBy ?? "date_pst");
    const sortBy = eventSortColumns.has(requestedSort) ? requestedSort : "date_pst";
    const sortDirection: SortDirection = req.query.sortDirection === "asc" ? "asc" : "desc";
    const groupBy = EVENT_GROUPINGS[filters.groupBy ?? "detail"] ? filters.groupBy ?? "detail" : "detail";
    const groupingColumns = EVENT_GROUPINGS[groupBy];
    const where = buildWhereClause(filters);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM (SELECT 1 FROM analytics.ga4_event_daily ${where.text} GROUP BY ${groupingColumns.join(", ")}) grouped`,
      where.params,
    );

    const rowsResult = await pool.query(
      `
      SELECT
        ${buildGroupedSelect(groupingColumns)}
        ,
        SUM(event_count) AS event_count,
        SUM(sessions) AS sessions,
        SUM(total_users) AS total_users
      FROM analytics.ga4_event_daily
      ${where.text}
      GROUP BY ${groupingColumns.join(", ")}
      ORDER BY ${sortBy} ${sortDirection}
      LIMIT $${where.params.length + 1}
      OFFSET $${where.params.length + 2}
      `,
      [...where.params, pagination.pageSize, pagination.offset],
    );

    res.json({
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: Number(countResult.rows[0].count),
      groupBy,
      rows: rowsResult.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/page-variants", async (req, res, next) => {
  try {
    const filters = parseFilters(req.query as Record<string, string | undefined>);
    const pagination = parsePagination(req.query as Record<string, string | undefined>);
    const requestedSort = String(req.query.sortBy ?? "date_pst");
    const sortBy = variantSortColumns.has(requestedSort) ? requestedSort : "date_pst";
    const sortDirection: SortDirection = req.query.sortDirection === "asc" ? "asc" : "desc";
    const where = buildWhereClause(filters, {
      includeEventName: false,
      includeVariantFields: true,
      includeSearchOnEventName: false,
    });

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM analytics.ga4_page_variant_daily ${where.text}`,
      where.params,
    );

    const rowsResult = await pool.query(
      `
      SELECT
        date_pst,
        page_path,
        landing_page_path,
        variant_key,
        variant_value,
        device_category,
        source_medium,
        views,
        sessions,
        total_users,
        event_count
      FROM analytics.ga4_page_variant_daily
      ${where.text}
      ORDER BY ${sortBy} ${sortDirection}
      LIMIT $${where.params.length + 1}
      OFFSET $${where.params.length + 2}
      `,
      [...where.params, pagination.pageSize, pagination.offset],
    );

    res.json({
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: Number(countResult.rows[0].count),
      rows: rowsResult.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/filters", async (_req, res, next) => {
  try {
    const [pages, landingPages, events, devices, sources, variantKeys, variantValues] = await Promise.all([
      pool.query(`SELECT DISTINCT page_path FROM analytics.ga4_page_daily ORDER BY page_path LIMIT 200`),
      pool.query(`SELECT DISTINCT landing_page_path FROM analytics.ga4_page_daily WHERE landing_page_path <> '' ORDER BY landing_page_path LIMIT 200`),
      pool.query(`SELECT DISTINCT normalized_event_name FROM analytics.ga4_event_daily WHERE event_class = 'valid_event' ORDER BY normalized_event_name LIMIT 200`),
      pool.query(`SELECT DISTINCT device_category FROM analytics.ga4_event_daily WHERE device_category <> '' ORDER BY device_category`),
      pool.query(`SELECT DISTINCT source_medium FROM analytics.ga4_event_daily WHERE source_medium <> '' ORDER BY source_medium LIMIT 100`),
      pool.query(`SELECT DISTINCT variant_key FROM analytics.ga4_page_variant_daily ORDER BY variant_key LIMIT 50`),
      pool.query(`SELECT DISTINCT variant_value FROM analytics.ga4_page_variant_daily ORDER BY variant_value LIMIT 200`),
    ]);

    res.json({
      pagePaths: pages.rows.map((row: { page_path: string }) => row.page_path),
      landingPagePaths: landingPages.rows.map((row: { landing_page_path: string }) => row.landing_page_path),
      eventNames: events.rows.map((row: { normalized_event_name: string }) => row.normalized_event_name),
      deviceCategories: devices.rows.map((row: { device_category: string }) => row.device_category),
      sourceMediums: sources.rows.map((row: { source_medium: string }) => row.source_medium),
      variantKeys: variantKeys.rows.map((row: { variant_key: string }) => row.variant_key),
      variantValues: variantValues.rows.map((row: { variant_value: string }) => row.variant_value),
      eventClasses: ["valid_event"],
    });
  } catch (error) {
    next(error);
  }
});

export default router;
