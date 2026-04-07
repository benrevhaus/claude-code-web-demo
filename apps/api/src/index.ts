import cors from "cors";
import express from "express";

import { config } from "./config.js";
import { runIncrementalSync } from "./lib/ga4.js";
import dashboardRoutes from "./routes/dashboard.js";

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

app.use("/api", dashboardRoutes);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(error);
  res.status(500).json({ error: message });
});

// Incremental sync every 6 hours (GA4 data lags 24-48h; 6h balances freshness vs. quota)
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function scheduledSync() {
  try {
    const result = await runIncrementalSync(3);
    console.log(`[sync] Incremental sync complete: ${result.pagesRows} pages, ${result.eventsRows} events`);
  } catch (error) {
    console.error("[sync] Incremental sync failed:", error instanceof Error ? error.message : error);
  }
}

app.listen(config.API_PORT, () => {
  console.log(`Data Streams Explorer API listening on http://127.0.0.1:${config.API_PORT}`);
  console.log(`[sync] Incremental sync scheduled every 6 hours`);

  // Run first sync 30s after startup, then every 6 hours
  setTimeout(() => {
    scheduledSync();
    setInterval(scheduledSync, SYNC_INTERVAL_MS);
  }, 30_000);
});
