# metrics

Live coding dashboard for **metrics.faheemnaeem.dev**: a Cloudflare Worker (Hono) with one Cron Trigger and one KV namespace. The cron refreshes data every 6 hours; page requests only read KV.

- **GitHub** (user from `@faheem/data` `resume.links.github`, fallback `faheem-naeem`):
    - With `GITHUB_TOKEN`: one GraphQL request for followers, stars, the 12-month contribution calendar (heatmap + streaks), top languages across up to 100 public non-fork repos, and the last 10 commits by the owner in the 5 most recently pushed repos.
    - Without a token: unauthenticated REST API (user, repos, languages for at most 30 repos, commits from the 3 most recently pushed repos). No calendar or streaks; the page says "Connect a token to show the contribution calendar". Unauthenticated calls share GitHub's 60 requests/hour limit per IP, so a token is recommended.
- **WakaTime** (optional, `WAKATIME_API_KEY`): last 7 days total, hours per day (bar chart), by language and by editor. The section is hidden when the key is unset.
- **Now**: "Currently learning" and "Now reading" are SAMPLE content in `src/content.ts` (not in `@faheem/data` yet).
- Server-rendered HTML with inline SVG (heatmap with a per-month table fallback, language donut with legend and text percentages, hours bars). No client JavaScript, no chart library.

## Routes

| Route                   | What                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /`                 | Dashboard (HTML, cached 5 min)                                                                              |
| `GET /api/metrics.json` | Snapshot JSON plus a top-level `stale` flag (CORS `*`). `503` before the first refresh.                     |
| `POST /api/refresh`     | Manual refresh. Exists only when `REFRESH_TOKEN` is set; needs header `X-Refresh-Token`. 5-minute cooldown. |
| `scheduled`             | Cron `0 */6 * * *`: refresh                                                                                 |

## Data and staleness (KV)

- `snapshot:v1`: written on every refresh.
- `snapshot:lastgood`: written when at least one source refreshed successfully.
- If a source fails, its section is copied from `snapshot:lastgood`, keeps its original `fetchedAt`, and is marked `stale`. The page shows a "Stale" label on that section. It also shows "Stale" when it has to read `snapshot:lastgood` directly or the data is older than 13 hours.
- KV writes: at most 2 per refresh, about 8/day from the cron (free limit 1,000/day). The manual-refresh cooldown caps extra writes.
- Subrequests: every upstream call goes through a budgeted fetch capped at 45 per run (free limit 50). Worst case (REST mode + WakaTime) is 37.
- GitHub calls send `User-Agent: faheemnaeem-metrics`.

## Secrets

All optional. Copy `.dev.vars.example` to `.dev.vars` for local development.

| Name               | Purpose                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`     | GitHub **fine-grained** personal access token. Repository access: "Public repositories (read-only)", with **no** permissions. Public data only. |
| `WAKATIME_API_KEY` | WakaTime secret API key. Unset = section hidden.                                                                                                |
| `REFRESH_TOKEN`    | Long random string that enables `POST /api/refresh`. Unset = route returns 404.                                                                 |

## Local development

```sh
npx -y pnpm@9.15.9 install
cd apps/metrics
cp .dev.vars.example .dev.vars    # then fill in or delete lines
npx -y pnpm@9.15.9 dev            # wrangler dev --test-scheduled
# Run the cron once by hand (fills local KV):
curl "http://localhost:8787/__scheduled?cron=0+*/6+*+*+*"
open http://localhost:8787/
```

## Test

```sh
npx -y pnpm@9.15.9 --filter metrics test        # Vitest: transformers, refresh, routes (fake KV + fetch, fixed clock)
npx -y pnpm@9.15.9 --filter metrics typecheck
npx -y pnpm@9.15.9 --filter metrics lint
npx -y pnpm@9.15.9 --filter metrics build       # wrangler deploy --dry-run
```

## Deploy (one-time Cloudflare steps)

Run from `apps/metrics`:

1. Create the KV namespace: `npx wrangler kv namespace create METRICS`
2. Copy the printed `id` into `wrangler.jsonc` (replace `00000000-0000-0000-0000-000000000000`).
3. Create the GitHub token (optional but recommended): GitHub > Settings > Developer settings > Fine-grained tokens > Generate. Repository access "Public repositories", no permissions. Then: `npx wrangler secret put GITHUB_TOKEN` and paste `<GITHUB_TOKEN>`.
4. Optional: `npx wrangler secret put WAKATIME_API_KEY` (value `<WAKATIME_API_KEY>`).
5. Optional: `npx wrangler secret put REFRESH_TOKEN` (value `<REFRESH_TOKEN>`).
6. Deploy: `npx wrangler deploy`. This attaches `metrics.faheemnaeem.dev` (zone on the same account) and registers the `0 */6 * * *` Cron Trigger.
7. Check a Cron Trigger slot is free (5 per account) in Workers & Pages > faheemnaeem-metrics > Settings > Triggers.
8. Fill KV straight away instead of waiting for the cron: `curl -X POST -H "X-Refresh-Token: <REFRESH_TOKEN>" https://metrics.faheemnaeem.dev/api/refresh` (only if step 5 was done), or use "Trigger" on the cron in the dashboard.
