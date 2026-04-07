import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { withClient } from "../lib/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../../");

async function main() {
  const migrationsDir = path.join(repoRoot, "migrations");
  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.startsWith("01") && f.endsWith(".sql"))
    .sort();

  await withClient(async (client) => {
    for (const file of files) {
      const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
      console.log(`Applied: ${file}`);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
