import cors from "cors";
import express from "express";

import { config } from "./config.js";
import dashboardRoutes from "./routes/dashboard.js";

const app = express();

app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json());

app.use("/api", dashboardRoutes);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(error);
  res.status(500).json({ error: message });
});

app.listen(config.API_PORT, () => {
  console.log(`Data Streams Explorer API listening on http://127.0.0.1:${config.API_PORT}`);
});
