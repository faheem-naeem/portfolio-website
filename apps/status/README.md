# status

Availability status page for **status.faheemnaeem.dev**: a Cloudflare Worker (Hono) with one Cron Trigger and a D1 database.

- **Faheem**: joke components from `@faheem/data` (`getStatus()`), each with a state and message.
- **Projects**: real HTTP checks of every project with a `healthcheckUrl`, plus `https://faheemnaeem.dev` (de-duplicated, max 20 URLs). Shows current state, latency, last HTTP status and a 90-day uptime bar (one bar per UTC day, a visually hidden table as the text alternative, "No data" for days without checks).
- **Incident history**: `getIncidents()` from `@faheem/data`, newest first.
- The banner ("All Systems Operational", "Major Outage", ...) is the worst state across all components.
- Server-side HTML only, no client JavaScript. The page is about 22 KB with 90 days of data for one URL (about 10 KB more per extra URL).

## Routes

| Route                  | What                                                     |
| ---------------------- | -------------------------------------------------------- |
| `GET /`                | Status page (HTML)                                       |
| `GET /api/status.json` | Same data as JSON (CORS `*`, cached 60 s)                |
| `scheduled`            | Cron `*/10 * * * *`: health checks; 90-day cleanup daily |

## Cron (one trigger only)

The Cloudflare free plan allows 5 Cron Triggers per **account**, shared by every app, so this Worker uses exactly one: `*/10 * * * *`.

- Every run fetches each URL in parallel (`Promise.allSettled`, 10 s `AbortController` timeout, body not downloaded) and writes one row per URL to `checks` plus an upsert into the `daily_uptime` rollup.
- The first run at or after 03:00 UTC (hour 3, minute < 10) also deletes rows older than 90 days.

## Data (D1)

`migrations/0001_init.sql`:

- `checks(url, checked_at, status_code, latency_ms, ok)` with an index on `(url, checked_at)`.
- `daily_uptime(url, day, total, ok)`: per-day counters so the page reads at most 90 rows per URL instead of scanning ~13,000 raw checks (D1 free plan: 5 million rows read per day).

## Local development

```sh
npx -y pnpm@9.15.9 install
cd apps/status
npx wrangler d1 migrations apply faheemnaeem-status --local
npx -y pnpm@9.15.9 dev            # wrangler dev --test-scheduled
# Trigger the cron by hand:
curl "http://localhost:8787/__scheduled?cron=*/10+*+*+*+*"
open http://localhost:8787/
```

No secrets are needed (`.dev.vars.example` is only a template).

## Test

```sh
npx -y pnpm@9.15.9 --filter status test        # Vitest, fixed clock, mocked fetch
npx -y pnpm@9.15.9 --filter status typecheck
npx -y pnpm@9.15.9 --filter status lint
npx -y pnpm@9.15.9 --filter status build       # wrangler deploy --dry-run
```

Tests run the real migration and SQL against an in-memory D1 fake built on Node's built-in `node:sqlite` (Node 22.13 or newer).

## Deploy (one-time Cloudflare steps)

1. Database: already created; its id is committed in `wrangler.jsonc` (to recreate: `npx wrangler d1 create faheemnaeem-status` and update `database_id`).
2. (nothing to do)
3. Apply migrations to the remote database:
   `npx wrangler d1 migrations apply faheemnaeem-status --remote`
4. Deploy: `npx wrangler deploy` (from `apps/status`). This attaches the custom domain `status.faheemnaeem.dev` (the `faheemnaeem.dev` zone must be on the same Cloudflare account) and registers the `*/10 * * * *` Cron Trigger.
5. Check the account has a free Cron Trigger slot (5 per account in total) in the dashboard: Workers & Pages > faheemnaeem-status > Settings > Triggers.
6. No secrets: nothing to `wrangler secret put`.
