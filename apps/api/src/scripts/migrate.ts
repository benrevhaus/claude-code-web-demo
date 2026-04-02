import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { withClient } from "../lib/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../../");

async function main() {
  const migrationPath = path.join(repoRoot, "migrations", "010_ga4_dashboard.sql");
  const sql = await fs.readFile(migrationPath, "utf8");

  await withClient(async (client) => {
    await client.query(sql);
  });

  console.log(`Applied migration: ${migrationPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
