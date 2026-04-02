import { config } from "../config.js";
import { runHistoricalBackfill } from "../lib/ga4.js";

async function main() {
  const result = await runHistoricalBackfill(config.GA4_DEFAULT_BACKFILL_DAYS);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
