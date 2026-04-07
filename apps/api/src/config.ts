import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../");

dotenv.config({ path: "../../.env" });
dotenv.config();

const configSchema = z.object({
  API_PORT: z.coerce.number().default(3002),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default("http://127.0.0.1:5174,http://localhost:5174"),
  GA4_PROPERTY_ID: z.string().default("mock-property"),
  GA4_CLIENT_EMAIL: z.string().default("mock@example.com"),
  GA4_PRIVATE_KEY: z.string().default("mock-private-key"),
  GA4_KEY_FILE: z.string().optional(),
  GA4_DEFAULT_BACKFILL_DAYS: z.coerce.number().default(90),
  DATA_START_DATE: z.string().default("2026-04-04"),
  USE_MOCK_GA4: z
    .string()
    .optional()
    .transform((value) => value === "true" || value === "1" || value === "yes")
    .default(false),
});

const parsed = configSchema.parse(process.env);

// If a JSON key file is provided, read client_email and private_key from it
if (parsed.GA4_KEY_FILE) {
  const keyPath = path.isAbsolute(parsed.GA4_KEY_FILE)
    ? parsed.GA4_KEY_FILE
    : path.resolve(repoRoot, parsed.GA4_KEY_FILE);
  const keyFile = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  parsed.GA4_CLIENT_EMAIL = keyFile.client_email;
  parsed.GA4_PRIVATE_KEY = keyFile.private_key;
}

export const config = parsed;
