# Data Streams Explorer: GA4 View MVP

This app lives under:

- `apps/api` — Express API and GA4 sync
- `apps/web` — React/Vite Data Streams Explorer UI
- `migrations/010_ga4_dashboard.sql` — Postgres schema for GA4 historical aggregates

## MVP shape

- Historical backfill: 90 days
- Reporting date basis: property timezone, assumed PST/PDT for the target Shopify property
- Pages: aggregated by date + page path, no GET params yet
- Events: aggregated by date + page + event, sortable/paginated/filterable
- Saved searches: localStorage only

## Deferred

- query-param-level page analysis
- raw-event retention
- hosted deployment setup

## Local run

1. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL`
   - If running live GA4 sync:
     - `GA4_PROPERTY_ID`
     - `GA4_CLIENT_EMAIL`
     - `GA4_PRIVATE_KEY`
   - If running local mock mode:
     - leave `USE_MOCK_GA4=true`
2. Start the isolated local Postgres:
   - `docker compose -f docker-compose.ga4-dashboard.yml up -d`
3. Run the migration:
   - `pnpm db:migrate`
4. Install workspace dependencies:
   - `pnpm install`
5. Start both apps:
   - `pnpm dev`
6. Open:
   - `http://127.0.0.1:5174`
7. Use the explorer button to run the first 90-day backfill.

## Mock mode

Mock mode is intended for local UX testing before live GA4 credentials are wired.

- Set `USE_MOCK_GA4=true`
- Run `pnpm db:seed:mock` to populate the explorer with deterministic mock historical data
- The backfill button will also use mock data while `USE_MOCK_GA4=true`
- The isolated local database runs on `127.0.0.1:5440` so it does not share the existing Postgres port used elsewhere
