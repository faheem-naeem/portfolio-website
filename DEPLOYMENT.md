# Deployment guide

How to put every faheemnaeem.dev subdomain live on the **Cloudflare Workers Free plan** ($0).
The main site (`apps/web`, Worker `portfolio-website`) is already live and is covered by
[`MIGRATION.md`](./MIGRATION.md). This file covers the ten subdomain apps.

All values below are **placeholders** (`<LIKE_THIS>`). Never commit real ids that are secret,
tokens, flags or salts. D1/KV ids are not secret, but replace them only in your deploy commit.

Glossary:

- **Worker**: a Cloudflare Worker running TypeScript code (Hono router).
- **Static-assets Worker**: a Worker with no script that only serves the built `dist/` folder
  (Astro build). Static asset requests are free and do not count toward the Worker request limit.
- **Workers Builds**: Cloudflare's Git integration (Dashboard → Workers & Pages → Create → Import a repository).
- **D1**: Cloudflare's SQLite database. **KV**: key-value store. **Turnstile**: Cloudflare's free CAPTCHA alternative.

---

## 0. One-time account setup

1. The `faheemnaeem.dev` zone must be on the same Cloudflare account as the Workers
   (it already is, for the main site). Each app's `routes` entry has `"custom_domain": true`,
   so the first deploy creates the DNS record and certificate for `<id>.faheemnaeem.dev`.
2. Laptop login: `npx wrangler login` (or set `CLOUDFLARE_API_TOKEN=<API_TOKEN>` with "Edit Cloudflare Workers" + "D1 Edit" permissions).
3. Install once from the repo root: `npx -y pnpm@9.15.9 install`.
4. **Do not change the root `build` script.** It builds only `web` on purpose (production isolation for `portfolio-website`).

## 1. Two ways to deploy (pick one per app)

### A. From a laptop (simplest, recommended for the first deploy)

```sh
npx -y pnpm@9.15.9 turbo run build --filter=<pkg>   # builds dist/ (static) or dry-run bundles (Worker)
cd apps/<id> && npx wrangler deploy
```

`cd apps/<id>` matters: it uses the app's pinned `wrangler` (v4) from `apps/<id>/node_modules`
and the app's `wrangler.jsonc`.

### B. Workers Builds (Git integration)

Create one Worker per app (Dashboard → Workers & Pages → Create → Import a repository → this repo).

| Setting | Value |
|---|---|
| Worker name | must equal `name` in `apps/<id>/wrangler.jsonc` (`faheemnaeem-<id>`), or the build fails |
| Production branch | `master` |
| Root directory | `/` (the pnpm lockfile and workspace file are at the root) |
| Build command | `npx -y pnpm@9.15.9 turbo run build --filter=<pkg>` |
| Deploy command | `cd apps/<id> && npx wrangler deploy` |
| Non-production branch deploy command | `cd apps/<id> && npx wrangler versions upload` (or turn off non-production builds) |
| Build watch paths → Include | `apps/<id>/*`, `packages/*`, `pnpm-lock.yaml` |
| Build variable | `PNPM_VERSION` = `9.15.9` |

Verified locally: `wrangler deploy --config apps/<id>/wrangler.jsonc` run from the repo root also
works (wrangler resolves `main`, `assets.directory` and `migrations_dir` relative to the config
file). But the repo root has no `wrangler` dependency, so plain `npx wrangler` there downloads an
unpinned version. Prefer `cd apps/<id> && npx wrangler deploy`.

For every app, `<pkg>` (the package name used by `--filter`) equals `<id>`.

D1 migrations are **not** applied by `wrangler deploy`. Run `npx wrangler d1 migrations apply <db> --remote`
from the laptop before the first deploy and after every new migration file.

---

## 2. Per-app steps

### 2.1 bugs — `bugs.faheemnaeem.dev` (static-assets Worker)

- Worker `faheemnaeem-bugs`, assets `apps/bugs/dist`, headers from `apps/bugs/public/_headers`.
- No bindings, no secrets, no cron.
- Deploy: `npx -y pnpm@9.15.9 turbo run build --filter=bugs && cd apps/bugs && npx wrangler deploy`.

### 2.2 changelog — `changelog.faheemnaeem.dev` (static-assets Worker)

- Worker `faheemnaeem-changelog`, assets `apps/changelog/dist`, headers from `public/_headers`.
- No bindings, no secrets, no cron.
- Deploy: `npx -y pnpm@9.15.9 turbo run build --filter=changelog && cd apps/changelog && npx wrangler deploy`.

### 2.3 manual — `manual.faheemnaeem.dev` (static-assets Worker)

- Worker `faheemnaeem-manual`, assets `apps/manual/dist`, headers from `public/_headers`.
- No bindings, no secrets, no cron.
- Deploy: `npx -y pnpm@9.15.9 turbo run build --filter=manual && cd apps/manual && npx wrangler deploy`.

### 2.4 a11y — `a11y.faheemnaeem.dev` (static-assets Worker + GitHub Actions job)

- Worker `faheemnaeem-a11y`, assets `apps/a11y/dist`, headers from `public/_headers`.
- No bindings, no secrets, no Cloudflare cron (the weekly audit runs on GitHub Actions: `.github/workflows/a11y-audit.yml`, Mondays 06:00 UTC).
- **GitHub write permission** (the workflow commits reports back to `master`):
  GitHub → repo → Settings → Actions → General → Workflow permissions → **Read and write permissions** → Save.
  If `master` has branch protection that blocks direct pushes, allow `github-actions[bot]` to bypass it.
- Deploy: `npx -y pnpm@9.15.9 turbo run build --filter=a11y && cd apps/a11y && npx wrangler deploy`.
- Run the first audit by hand: GitHub → Actions → "a11y audit" → Run workflow (after the other sites are live).
- Report commits carry `[skip ci]`; if Workers Builds honours it, new reports go live on the next normal push.

### 2.5 resume — `resume.faheemnaeem.dev` (Worker)

- Worker `faheemnaeem-resume`. No bindings, no secrets, no cron.
- Deploy: `cd apps/resume && npx wrangler deploy`.

### 2.6 status — `status.faheemnaeem.dev` (Worker + D1 + 1 cron)

```sh
cd apps/status
# already created; id committed in apps/status/wrangler.jsonc (d1_databases[0].database_id)
npx wrangler d1 migrations apply faheemnaeem-status --remote
npx wrangler deploy        # also registers the cron */10 * * * *
```

- No secrets.
- Check the cron in Dashboard → Workers & Pages → `faheemnaeem-status` → Settings → Triggers.

### 2.7 metrics — `metrics.faheemnaeem.dev` (Worker + KV + 1 cron)

```sh
cd apps/metrics
# already created; id committed in apps/metrics/wrangler.jsonc (kv_namespaces[0].id)
npx wrangler secret put GITHUB_TOKEN       # optional; paste <GITHUB_TOKEN>
npx wrangler secret put WAKATIME_API_KEY   # optional; paste <WAKATIME_API_KEY>
npx wrangler secret put REFRESH_TOKEN      # optional; paste <REFRESH_TOKEN>
npx wrangler deploy                        # also registers the cron 0 */6 * * *
```

- `GITHUB_TOKEN`: GitHub → Settings → Developer settings → Fine-grained tokens → Repository access "Public repositories", **no permissions**.
- Fill KV right away (instead of waiting up to 6 h): Dashboard → `faheemnaeem-metrics` → Settings → Triggers → Trigger the cron, or
  `curl -X POST -H "X-Refresh-Token: <REFRESH_TOKEN>" https://metrics.faheemnaeem.dev/api/refresh`.

### 2.8 api — `api.faheemnaeem.dev` (Worker + D1 + Send Email)

```sh
cd apps/api
# already created; id committed in apps/api/wrangler.jsonc (d1_databases[0].database_id)
npx wrangler d1 migrations apply faheemnaeem-api --remote
npx wrangler secret put TURNSTILE_SECRET   # paste <TURNSTILE_SECRET>
npx wrangler secret put IP_HASH_SALT       # paste a long random string <RANDOM_STRING>
npx wrangler secret put CTF_FLAG           # paste <CTF_FLAG> (see 2.10 step 1)
npx wrangler deploy
```

1. **Email notifications are off.** Email Routing is not set up on faheemnaeem.dev, so `apps/api/wrangler.jsonc`
   has no `send_email` binding; interview requests are stored in D1 only. To enable email later, follow
   "Email notifications (re-enable later)" in `apps/api/README.md`.
2. Nothing to do for email at deploy time.
3. **Turnstile widget**: Dashboard → Turnstile → Add widget → name `faheemnaeem-api`, hostnames
   `faheemnaeem.dev` and `api.faheemnaeem.dev`, mode Managed → Create.
   The **secret key** goes in `TURNSTILE_SECRET` (above). The public **site key** is committed as
   `vars.TURNSTILE_SITE_KEY` in `apps/api/wrangler.jsonc`; the form is served at `https://api.faheemnaeem.dev/contact`.
4. Generate a random salt, for example `openssl rand -hex 32`, and paste it at the `IP_HASH_SALT` prompt.

### 2.9 ask — `ask.faheemnaeem.dev` (Worker + Workers AI + D1)

```sh
cd apps/ask
# already created; id committed in apps/ask/wrangler.jsonc (d1_databases[0].database_id)
npx wrangler d1 migrations apply faheemnaeem-ask --remote
npx wrangler secret put TURNSTILE_SECRET   # paste <TURNSTILE_SECRET> of the ask widget
npx wrangler deploy
```

1. **Turnstile widget**: Dashboard → Turnstile → Add widget → hostname `ask.faheemnaeem.dev`, mode Managed.
   Put the **site key** (public) into `vars.TURNSTILE_SITE_KEY` in `apps/ask/wrangler.jsonc` (replaces `<TURNSTILE_SITE_KEY>`)
   **before** deploying. The secret key goes in `TURNSTILE_SECRET`.
2. Workers AI needs no key on the Free plan. Keep `vars.ENVIRONMENT = "production"` (the dev bypass only works with `development`).
3. `TURNSTILE_SECRET` also salts the IP hash and signs the session cookie, so rotating it resets limits and sessions (harmless).

### 2.10 ctf — `ctf.faheemnaeem.dev` (Worker + D1, plus clues on web, api and DNS)

1. **Generate the flag** (prints to the terminal only, writes no file):
   ```sh
   node apps/ctf/scripts/make-flag.mjs
   ```
   It prints `CTF_FLAG` and `FLAG_HASH`. Keep the flag in a password manager.
2. Create the database and set secrets:
   ```sh
   cd apps/ctf
   # already created; id committed in apps/ctf/wrangler.jsonc (d1_databases[0].database_id)
   npx wrangler d1 migrations apply faheemnaeem-ctf --remote
   npx wrangler secret put FLAG_HASH       # paste <FLAG_SHA256_HEX>
   npx wrangler secret put IP_HASH_SALT    # paste a long random string <RANDOM_STRING>
   npx wrangler deploy
   ```
3. On the **api** Worker: `npx wrangler secret put CTF_FLAG` with the same flag (section 2.8). Rotate `CTF_FLAG` and `FLAG_HASH` together.
4. **DNS TXT record** (manual): Dashboard → `faheemnaeem.dev` → DNS → Records → Add record:
   Type `TXT`, Name `clue`, TTL Auto, Content = the ROT13 string documented in `apps/ctf/README.md` ("DNS TXT record").
   Check with `dig +short TXT clue.faheemnaeem.dev`.
5. Optional: `"vars": { "CONTACT_URL": "<YOUR_CALENDAR_OR_CONTACT_URL>" }` in `wrangler.jsonc` (default: LinkedIn from `@faheem/data`).
6. The web clues (robots.txt, hatch file, meta tag) ship with the normal `apps/web` deploy.
7. Hall of Fame entries need manual approval: see "Moderating the Hall of Fame" in `apps/ctf/README.md`.
8. The walkthrough `apps/ctf/CTF_SOLUTION.md` is gitignored; keep it local.

### Resource ids (already filled in)

The D1 databases and the KV namespace exist, and their ids (not secret) are committed so deploys use the
right resources:

| File | Field | Resource |
|---|---|---|
| `apps/status/wrangler.jsonc` | `d1_databases[0].database_id` | D1 `faheemnaeem-status` |
| `apps/metrics/wrangler.jsonc` | `kv_namespaces[0].id` | KV `METRICS` |
| `apps/api/wrangler.jsonc` | `d1_databases[0].database_id` | D1 `faheemnaeem-api` |
| `apps/ask/wrangler.jsonc` | `d1_databases[0].database_id` | D1 `faheemnaeem-ask` |
| `apps/ctf/wrangler.jsonc` | `d1_databases[0].database_id` | D1 `faheemnaeem-ctf` |

The public Turnstile site key is set as `vars.TURNSTILE_SITE_KEY` in `apps/api/wrangler.jsonc` and
`apps/ask/wrangler.jsonc`. If a resource is ever recreated (`wrangler d1 create ...` /
`wrangler kv namespace create METRICS`), update the matching id here.

### Secrets summary (`wrangler secret put <NAME>`, run inside `apps/<id>`)

| App | Secret | Required |
|---|---|---|
| api | `TURNSTILE_SECRET`, `IP_HASH_SALT`, `CTF_FLAG` | yes (CTF route answers 503 without `CTF_FLAG`) |
| ask | `TURNSTILE_SECRET` | yes (API answers 503 without it) |
| ctf | `FLAG_HASH`, `IP_HASH_SALT` | yes |
| metrics | `GITHUB_TOKEN`, `WAKATIME_API_KEY`, `REFRESH_TOKEN` | optional |
| resume, status, bugs, changelog, manual, a11y | none | — |

---

## 3. Recommended deploy order

Deploy and smoke-test one app at a time.

1. Static sites: **bugs → changelog → manual → a11y** (no bindings, lowest risk)
2. **resume** (Worker, no bindings)
3. **status** (D1 + cron)
4. **metrics** (KV + cron)
5. **api** (D1, Email Routing, Turnstile, `CTF_FLAG`)
6. **ask** (D1, Workers AI, Turnstile)
7. **ctf** (D1, DNS TXT record; needs api's `CTF_FLAG`)
8. Run the a11y GitHub workflow once, now that every site is live.

## 4. Post-deploy smoke test

Run each block after deploying that app. `H` prints only the status line and the four security headers.

```sh
H() { curl -sSI "$1" | grep -iE '^(HTTP/|content-security-policy|strict-transport-security|x-content-type-options|referrer-policy)'; }
```

| App | Command | Expected |
|---|---|---|
| bugs | `H https://bugs.faheemnaeem.dev/` | `HTTP/2 200` + CSP, HSTS, `nosniff`, `strict-origin-when-cross-origin` |
| bugs | `curl -s -o /dev/null -w '%{http_code}\n' https://bugs.faheemnaeem.dev/nope` | `404` (custom 404 page) |
| changelog | `H https://changelog.faheemnaeem.dev/` | `HTTP/2 200` + the four headers |
| changelog | `curl -s https://changelog.faheemnaeem.dev/changelog.json \| head -c 200` | JSON array of releases |
| changelog | `curl -s https://changelog.faheemnaeem.dev/rss.xml \| head -3` | `<?xml ...` RSS feed |
| manual | `H https://manual.faheemnaeem.dev/` | `HTTP/2 200` + the four headers |
| a11y | `H https://a11y.faheemnaeem.dev/` | `HTTP/2 200` + the four headers |
| a11y | `curl -s https://a11y.faheemnaeem.dev/latest.json \| head -c 200` | JSON report summary |
| resume | `curl -s https://resume.faheemnaeem.dev/?nocolor \| head -5` | plain-text resume (name, title) |
| resume | `H https://resume.faheemnaeem.dev/` | `HTTP/2 200` + the four headers |
| resume | `curl -s -o /dev/null -w '%{http_code}\n' https://resume.faheemnaeem.dev/resume.json` | `200` |
| status | `curl -s https://status.faheemnaeem.dev/api/status.json \| head -c 300` | JSON with project checks (empty until the first cron run, max 10 min) |
| status | `H https://status.faheemnaeem.dev/` | `HTTP/2 200` + the four headers |
| metrics | `curl -s -o /dev/null -w '%{http_code}\n' https://metrics.faheemnaeem.dev/api/metrics.json` | `200` after the first refresh (`503` before it) |
| metrics | `H https://metrics.faheemnaeem.dev/` | `HTTP/2 200` + the four headers |
| api | `curl -s https://api.faheemnaeem.dev/v1/profile \| head -c 300` | JSON profile (no email) |
| api | `curl -s -o /dev/null -w '%{http_code}\n' https://api.faheemnaeem.dev/teapot` | `418` |
| api | `curl -s https://api.faheemnaeem.dev/openapi.json \| head -c 80` | `{"openapi":"3.1...` |
| api | `curl -s -X POST -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -d '{}' -w '\n%{http_code}\n' https://api.faheemnaeem.dev/v1/interview-requests` | `403` `FORBIDDEN_ORIGIN` |
| api | `curl -s -H 'X-Curious: true' https://api.faheemnaeem.dev/v1/ctf/rabbit-hole` | JSON containing the flag (proves `CTF_FLAG` is set) |
| ask | `H https://ask.faheemnaeem.dev/` | `HTTP/2 200` + the four headers |
| ask | `curl -s -X POST -H 'Content-Type: application/json' -d '{"question":"hi"}' -w '\n%{http_code}\n' https://ask.faheemnaeem.dev/api/ask` | `4xx` JSON error (Turnstile required), not `503` (503 means `TURNSTILE_SECRET` is missing) |
| ask | Open https://ask.faheemnaeem.dev in a browser and ask one question | Turnstile passes, answer streams |
| ctf | `H https://ctf.faheemnaeem.dev/` | `HTTP/2 200` + the four headers |
| ctf | `curl -s -X POST -H 'Content-Type: application/json' -d '{"flag":"wrong"}' -w '\n%{http_code}\n' https://ctf.faheemnaeem.dev/submit` | `400` `WRONG_FLAG` (`503` means `FLAG_HASH` is missing) |
| ctf | `dig +short TXT clue.faheemnaeem.dev` | the ROT13 clue string |
| web | `curl -s -o /dev/null -w '%{http_code}\n' https://faheemnaeem.dev/` | `200` (main site unaffected) |

## 5. Free-plan budget

Workers Free plan limits (account-wide) and the expected use of this project:

| Resource | Free limit | Expected use | Notes |
|---|---|---|---|
| Worker requests | 100,000 / day | low hundreds/day | Static asset requests (bugs, changelog, manual, a11y, web) are free and do not count |
| CPU time | 10 ms / request | well below | No heavy work; AI runs on Workers AI, not Worker CPU |
| Subrequests | 50 / request | ≤ 3 (api POST: Turnstile + email; metrics cron: a few GitHub/WakaTime calls) | |
| Cron triggers | 5 / account | **2** | status `*/10 * * * *`, metrics `0 */6 * * *` |
| D1 rows written | 100,000 / day | ~300 (status: 144 runs × 2 rows) + a few per POST | ask/api/ctf write only on user actions |
| D1 rows read | 5,000,000 / day | low thousands | |
| D1 storage | 5 GB | < 10 MB | status deletes checks older than 90 days |
| KV writes | 1,000 / day | ~8 (metrics: ≤ 2 keys × 4 runs) | Counters use D1, not KV |
| KV reads | 100,000 / day | one per metrics page view | |
| Workers AI | 10,000 Neurons / day | ≤ ~1,200 (`DAILY_CAP=150` × 5–8 Neurons) | Past the allowance calls fail, never billed |
| Email Routing | free | not used yet (optional interview-request emails) | Rate limited 5/hour/IP if enabled |
| Turnstile | free | 2 widgets | |
| GitHub Actions | free for public repos | 1 weekly run (a11y) | Not a Cloudflare cron |

## 6. Post-deploy follow-ups

Done in the launch-content change: the main site's "Explore" section, real content in `packages/data`
(no `sample` data remains), the public email, and the interview-request form at
`https://api.faheemnaeem.dev/contact`. Remaining:

1. Optional: enable interview-request emails (see `apps/api/README.md`).
2. Optional: drop `packages/*` from the main site's build watch paths (`apps/web` does not import any workspace package), so shared-package edits do not rebuild production.
