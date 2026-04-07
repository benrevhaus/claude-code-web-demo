import { google } from "googleapis";
import type { analyticsdata_v1beta } from "googleapis";

import { config } from "../config.js";
import { withClient } from "./db.js";
import { normalizeEventName, EVENT_PARAM_DIMENSIONS } from "./eventNormalization.js";
import { generateMockDataset } from "./mockData.js";

type Ga4PageRow = {
  date_pst: string;
  page_path: string;
  page_title: string;
  landing_page_path: string;
  device_category: string;
  source_medium: string;
  views: number;
  sessions: number;
  total_users: number;
  event_count: number;
};

type Ga4EventRow = {
  date_pst: string;
  page_path: string;
  raw_event_name: string;
  normalized_event_name: string;
  event_class: string;
  derived_page_path: string;
  event_param_value: string;
  device_category: string;
  source_medium: string;
  landing_page_path: string;
  is_conversion_event: boolean;
  event_count: number;
  sessions: number;
  total_users: number;
};

function getAnalyticsClient() {
  const auth = new google.auth.JWT({
    email: config.GA4_CLIENT_EMAIL,
    key: config.GA4_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });

  return google.analyticsdata({
    version: "v1beta",
    auth,
  });
}

function shouldUseMockData() {
  return (
    config.USE_MOCK_GA4 ||
    config.GA4_CLIENT_EMAIL === "mock@example.com" ||
    config.GA4_PRIVATE_KEY === "mock-private-key"
  );
}

function dimension(row: analyticsdata_v1beta.Schema$Row, index: number) {
  return row.dimensionValues?.[index]?.value ?? "";
}

function metric(row: analyticsdata_v1beta.Schema$Row, index: number) {
  return Number.parseInt(row.metricValues?.[index]?.value ?? "0", 10);
}

const PAGE_SIZE = 100000;

async function runReport(
  client: analyticsdata_v1beta.Analyticsdata,
  dimensions: string[],
  metrics: string[],
  days: number,
) {
  const allRows: analyticsdata_v1beta.Schema$Row[] = [];
  let offset = 0;

  while (true) {
    const report = await client.properties.runReport({
      property: `properties/${config.GA4_PROPERTY_ID}`,
      requestBody: {
        dateRanges: [
          {
            startDate: `${days}daysAgo`,
            endDate: "yesterday",
          },
        ],
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        keepEmptyRows: false,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      },
    });

    const rows = report.data.rows ?? [];
    allRows.push(...rows);

    const totalRows = Number(report.data.rowCount ?? 0);
    offset += rows.length;

    if (rows.length < PAGE_SIZE || offset >= totalRows) break;
  }

  return allRows;
}

async function fetchPageDaily(days: number): Promise<Ga4PageRow[]> {
  const client = getAnalyticsClient();
  const rows = await runReport(
    client,
    ["date", "pagePath", "pageTitle", "deviceCategory", "sessionSourceMedium"],
    ["screenPageViews", "sessions", "totalUsers", "eventCount"],
    days,
  );

  return rows.map((row) => ({
    date_pst: dimension(row, 0),
    page_path: dimension(row, 1) || "/",
    page_title: dimension(row, 2),
    landing_page_path: dimension(row, 1) || "/",
    device_category: dimension(row, 3),
    source_medium: dimension(row, 4),
    views: metric(row, 0),
    sessions: metric(row, 1),
    total_users: metric(row, 2),
    event_count: metric(row, 3),
  }));
}

async function fetchEventDaily(days: number): Promise<Ga4EventRow[]> {
  const client = getAnalyticsClient();
  // Base dimensions + any parameterized-event dimensions (e.g., customEvent:percent_scrolled).
  // GA4 returns empty strings for params that don't apply to a given event.
  const baseDimensions = ["date", "pagePath", "eventName", "deviceCategory", "sessionSourceMedium"];
  const dimensions = [...baseDimensions, ...EVENT_PARAM_DIMENSIONS];
  const rows = await runReport(
    client,
    dimensions,
    ["eventCount", "sessions", "totalUsers"],
    days,
  );

  // Collect the first non-empty param value across all param dimensions (indices 5+)
  const paramStartIndex = baseDimensions.length;

  return rows.map((row) => {
    const pagePath = dimension(row, 1);
    let paramValue = "";
    for (let i = paramStartIndex; i < dimensions.length; i++) {
      const v = dimension(row, i);
      if (v && v !== "(not set)") {
        paramValue = v;
        break;
      }
    }
    const normalized = normalizeEventName(dimension(row, 2), paramValue);
    return {
      date_pst: dimension(row, 0),
      page_path: pagePath,
      raw_event_name: normalized.rawEventName,
      normalized_event_name: normalized.normalizedEventName,
      event_class: normalized.eventClass,
      derived_page_path: normalized.derivedPagePath,
      event_param_value: normalized.eventParamValue,
      device_category: dimension(row, 3),
      source_medium: dimension(row, 4),
      landing_page_path: pagePath,
      is_conversion_event: ["purchase", "completed_purchase_ga4", "begin_checkout", "add_payment_info"].includes(
        normalized.normalizedEventName,
      ),
      event_count: metric(row, 0),
      sessions: metric(row, 1),
      total_users: metric(row, 2),
    };
  });
}

function gaDateToIso(gaDate: string) {
  if (gaDate.includes("-")) {
    return gaDate;
  }
  return `${gaDate.slice(0, 4)}-${gaDate.slice(4, 6)}-${gaDate.slice(6, 8)}`;
}

type UpsertStats = {
  pagesNew: number;
  pagesChanged: number;
  eventsNew: number;
  eventsChanged: number;
};

async function upsertRows(
  client: import("pg").PoolClient,
  pagesRows: Ga4PageRow[],
  eventRows: Ga4EventRow[],
): Promise<UpsertStats> {
  let pagesNew = 0;
  let pagesChanged = 0;
  let eventsNew = 0;
  let eventsChanged = 0;

  for (const row of pagesRows) {
    // The WHERE clause means DO UPDATE only fires when metrics actually differ.
    // If nothing changed, ON CONFLICT does nothing and RETURNING yields no rows.
    // If it's a new insert, RETURNING yields one row with is_new=true.
    // If metrics changed, RETURNING yields one row with is_new=false.
    const result = await client.query(
      `
      INSERT INTO analytics.ga4_page_daily (
        date_pst, page_path, page_title, landing_page_path, device_category, source_medium,
        views, sessions, total_users, event_count
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (date_pst, page_path, page_title, device_category, source_medium) DO UPDATE SET
        views = EXCLUDED.views,
        sessions = EXCLUDED.sessions,
        total_users = EXCLUDED.total_users,
        event_count = EXCLUDED.event_count,
        landing_page_path = EXCLUDED.landing_page_path,
        synced_at = NOW()
      WHERE ga4_page_daily.views IS DISTINCT FROM EXCLUDED.views
         OR ga4_page_daily.sessions IS DISTINCT FROM EXCLUDED.sessions
         OR ga4_page_daily.total_users IS DISTINCT FROM EXCLUDED.total_users
         OR ga4_page_daily.event_count IS DISTINCT FROM EXCLUDED.event_count
      RETURNING (xmax = 0) AS is_new
      `,
      [
        gaDateToIso(row.date_pst),
        row.page_path,
        row.page_title,
        row.landing_page_path ?? row.page_path,
        row.device_category,
        row.source_medium,
        row.views,
        row.sessions,
        row.total_users,
        row.event_count,
      ],
    );
    if (result.rowCount === 0) continue; // unchanged existing row
    if (result.rows[0].is_new) pagesNew++; else pagesChanged++;
  }

  for (const row of eventRows) {
    const result = await client.query(
      `
      INSERT INTO analytics.ga4_event_daily (
        date_pst, page_path, landing_page_path, event_name, raw_event_name, normalized_event_name,
        event_class, derived_page_path, event_param_value, device_category, source_medium,
        is_conversion_event, event_count, sessions, total_users
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (date_pst, page_path, event_name, event_param_value, device_category, source_medium) DO UPDATE SET
        landing_page_path = EXCLUDED.landing_page_path,
        raw_event_name = EXCLUDED.raw_event_name,
        normalized_event_name = EXCLUDED.normalized_event_name,
        event_class = EXCLUDED.event_class,
        derived_page_path = EXCLUDED.derived_page_path,
        is_conversion_event = EXCLUDED.is_conversion_event,
        event_count = EXCLUDED.event_count,
        sessions = EXCLUDED.sessions,
        total_users = EXCLUDED.total_users,
        synced_at = NOW()
      WHERE ga4_event_daily.event_count IS DISTINCT FROM EXCLUDED.event_count
         OR ga4_event_daily.sessions IS DISTINCT FROM EXCLUDED.sessions
         OR ga4_event_daily.total_users IS DISTINCT FROM EXCLUDED.total_users
      RETURNING (xmax = 0) AS is_new
      `,
      [
        gaDateToIso(row.date_pst),
        row.page_path,
        row.landing_page_path,
        row.normalized_event_name,
        row.raw_event_name,
        row.normalized_event_name,
        row.event_class,
        row.derived_page_path,
        row.event_param_value,
        row.device_category,
        row.source_medium,
        row.is_conversion_event,
        row.event_count,
        row.sessions,
        row.total_users,
      ],
    );
    if (result.rowCount === 0) continue; // unchanged existing row
    if (result.rows[0].is_new) eventsNew++; else eventsChanged++;
  }

  return { pagesNew, pagesChanged, eventsNew, eventsChanged };
}

export async function runIncrementalSync(days = 3) {
  const [pagesRows, eventRows] = shouldUseMockData()
    ? (() => {
        const dataset = generateMockDataset(days);
        return [dataset.pageRows, dataset.eventRows] as const;
      })()
    : await Promise.all([fetchPageDaily(days), fetchEventDaily(days)]);

  return withClient(async (client) => {
    await client.query("BEGIN");

    const run = await client.query(
      `
      INSERT INTO analytics.ga4_sync_runs (sync_type, property_id, days_back, status)
      VALUES ($1, $2, $3, 'running')
      RETURNING id
      `,
      ["incremental_sync", config.GA4_PROPERTY_ID, days],
    );

    const runId = run.rows[0].id as number;

    try {
      const stats = await upsertRows(client, pagesRows, eventRows);

      await client.query(
        `
        UPDATE analytics.ga4_sync_runs
        SET status = 'success',
            finished_at = NOW(),
            pages_rows = $2,
            events_rows = $3,
            pages_new = $4,
            pages_updated = $5,
            events_new = $6,
            events_updated = $7
        WHERE id = $1
        `,
        [runId, pagesRows.length, eventRows.length, stats.pagesNew, stats.pagesChanged, stats.eventsNew, stats.eventsChanged],
      );

      await client.query("COMMIT");
      return {
        runId,
        syncType: "incremental",
        daysBack: days,
        pagesRows: pagesRows.length,
        eventsRows: eventRows.length,
        ...stats,
        usedMockData: shouldUseMockData(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      await withClient(async (rollbackClient) => {
        await rollbackClient.query(
          `
          UPDATE analytics.ga4_sync_runs
          SET status = 'error',
              finished_at = NOW(),
              error_message = $2
          WHERE id = $1
          `,
          [runId, error instanceof Error ? error.message : String(error)],
        );
      });
      throw error;
    }
  });
}

export async function runHistoricalBackfill(days = config.GA4_DEFAULT_BACKFILL_DAYS) {
  const [pagesRows, eventRows] = shouldUseMockData()
    ? (() => {
        const dataset = generateMockDataset(days);
        return [dataset.pageRows, dataset.eventRows] as const;
      })()
    : await Promise.all([fetchPageDaily(days), fetchEventDaily(days)]);

  return withClient(async (client) => {
    await client.query("BEGIN");

    const run = await client.query(
      `
      INSERT INTO analytics.ga4_sync_runs (sync_type, property_id, days_back, status)
      VALUES ($1, $2, $3, 'running')
      RETURNING id
      `,
      ["historical_backfill", config.GA4_PROPERTY_ID, days],
    );

    const runId = run.rows[0].id as number;

    try {
      await client.query("TRUNCATE analytics.ga4_page_daily, analytics.ga4_event_daily");
      const stats = await upsertRows(client, pagesRows, eventRows);

      await client.query(
        `
        UPDATE analytics.ga4_sync_runs
        SET status = 'success',
            finished_at = NOW(),
            pages_rows = $2,
            events_rows = $3,
            pages_new = $4,
            pages_updated = $5,
            events_new = $6,
            events_updated = $7
        WHERE id = $1
        `,
        [runId, pagesRows.length, eventRows.length, stats.pagesNew, stats.pagesChanged, stats.eventsNew, stats.eventsChanged],
      );

      await client.query("COMMIT");
      return {
        runId,
        daysBack: days,
        pagesRows: pagesRows.length,
        eventsRows: eventRows.length,
        ...stats,
        usedMockData: shouldUseMockData(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      await withClient(async (rollbackClient) => {
        await rollbackClient.query(
          `
          UPDATE analytics.ga4_sync_runs
          SET status = 'error',
              finished_at = NOW(),
              error_message = $2
          WHERE id = $1
          `,
          [runId, error instanceof Error ? error.message : String(error)],
        );
      });
      throw error;
    }
  });
}
