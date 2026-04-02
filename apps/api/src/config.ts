import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: "../../.env" });
dotenv.config();

const configSchema = z.object({
  API_PORT: z.coerce.number().default(3002),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default("http://127.0.0.1:5174"),
  GA4_PROPERTY_ID: z.string().default("mock-property"),
  GA4_CLIENT_EMAIL: z.string().default("mock@example.com"),
  GA4_PRIVATE_KEY: z.string().default("mock-private-key"),
  GA4_DEFAULT_BACKFILL_DAYS: z.coerce.number().default(90),
  USE_MOCK_GA4: z
    .string()
    .optional()
    .transform((value) => value === "true" || value === "1" || value === "yes")
    .default(false),
});

export const config = configSchema.parse(process.env);
