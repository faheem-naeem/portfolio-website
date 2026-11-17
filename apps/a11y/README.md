# a11y

`a11y.faheemnaeem.dev`: a public accessibility report for every faheemnaeem.dev site. Static Astro site (no client JavaScript) plus a weekly GitHub Actions audit.

## How it fits together

1. `.github/workflows/a11y-audit.yml` runs every Monday 06:00 UTC and on manual dispatch. There is deliberately **no `push` trigger**: the bot commit would start another run and a Cloudflare rebuild loop.
2. It runs `scripts/audit.mjs` for each site in `@faheem/data` (`packages/data/src/sites.json`):
    - **axe-core** via `@axe-core/playwright` in Chromium, 4 runs per site: 1280px and 360px wide, light and dark `prefers-color-scheme`. Rule tags: WCAG 2.0/2.1/2.2 A + AA, plus best practices.
    - **Lighthouse** via `npx lighthouse@12` (pinned major) in headless Chrome (Playwright's Chromium), categories performance, accessibility, best-practices, SEO, default mobile emulation.
    - A site that does not answer with 2xx (DNS failure, timeout, error status) is recorded as **`not-deployed`**, not a failure. Most subdomains are not live yet.
3. It writes one report per run to `src/reports/<YYYY-MM-DD>.json` (same day = overwritten), runs this app's tests + build to validate it, then commits it to `master` with `[skip ci]`, only when something changed and only when the run is on `master`. It uses the default `GITHUB_TOKEN` with `permissions: contents: write`.
4. This site reads every report at build time (`src/lib/load.ts`, schema in `src/lib/report.ts`). A malformed report fails the build.

### Why the audit tools are not in package.json

`playwright`, `@axe-core/playwright` and `lighthouse` (plus a Chromium download) are large. As workspace dependencies they would be installed on every Cloudflare build of every app. Instead the workflow installs them into `$RUNNER_TEMP/a11y-audit-deps` with `npm i --no-save` and passes that folder to the script as `AUDIT_DEPS_DIR`; the script loads them from there with `createRequire`. Lighthouse runs with `npx` from the same folder.

### The seed report

`src/reports/seed.json` is a **sample** (`"sample": true`), hand-made in the real report format because the live audit has not run yet. Its scores are illustrative. The site shows a "Sample report" banner while it is the only report, and ignores all sample reports as soon as one real report exists (`selectReports`). You can delete `seed.json` after the first real run.

## Pages

| Path            | What                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/`             | Latest audit: WCAG 2.2 AA badge (only when 0 serious/critical axe issues on every audited site), totals, violations trend, a card per site with Lighthouse scores and an accessibility-score sparkline |
| `/sites/<id>/`  | One page per site in `@faheem/data`: status, Lighthouse scores + trends, axe runs table, open issues (rule, impact, WCAG criterion, elements, runs, Deque fix guide), fixed issues (with a GitHub compare link between the two audited commits), history table |
| `/methodology/` | Plain-language explanation of the tools, WCAG levels, impact and the badge                                                               |
| `/latest.json`  | Newest report, CORS open                                                                                                                 |
| `/404.html`     | Not-found page                                                                                                                           |

Optional hand-written fix notes: add `"fix": { "note": "...", "commit": "<sha or URL>" }` to a violation in a report.

Sparklines are decorative SVG (`aria-hidden`) with a visually hidden text list of the values; scores always show the number and a word (good / needs work / poor), never colour alone.

## Local development

From the repo root (pnpm is not installed globally):

```sh
npx -y pnpm@9.15.9 install
npx -y pnpm@9.15.9 --filter a11y dev        # http://localhost:4321
npx -y pnpm@9.15.9 --filter a11y build      # outputs apps/a11y/dist
```

Run a real audit locally (downloads Chromium, about 150 MB; keep it out of the repo):

```sh
mkdir -p /tmp/a11y-deps && cd /tmp/a11y-deps && npm init -y >/dev/null
npm i --no-save playwright@1 @axe-core/playwright@4 lighthouse@12
npx playwright install chromium
cd - && AUDIT_DEPS_DIR=/tmp/a11y-deps node apps/a11y/scripts/audit.mjs --sites web --out /tmp/a11y-out
```

Flags: `--sites id,id` (subset), `--out <dir>` (default `apps/a11y/src/reports`), `--date YYYY-MM-DD`.

## Test, typecheck, lint

```sh
npx -y pnpm@9.15.9 turbo run build test typecheck lint --filter=a11y
```

- `test` (Vitest): audit helpers (WCAG tag parsing, merging axe runs, Lighthouse scores, unreachable sites with a mocked `fetch`), report helpers (sample selection, badge rule, trends, fixed issues, sparkline geometry), every committed report against the schema, and the workflow YAML (parsed with `yaml`: triggers, permissions, pinned actions, `[skip ci]`, master-only commit).
- `typecheck`: `astro check` (`allowJs` so tests can import `scripts/audit.mjs`).
- `lint`: ESLint via `@faheem/config/eslint`, with Node globals for `scripts/*.mjs`.

## Security headers

`public/_headers` sets CSP (`script-src 'self'; style-src 'self'`, no inline code: Astro uses `inlineStylesheets: 'never'`), HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

## Deploy

Static assets on a Cloudflare Worker (Free plan, no bindings, no secrets). Config: `apps/a11y/wrangler.jsonc` (Worker `faheemnaeem-a11y`, assets `./dist`, custom domain `a11y.faheemnaeem.dev`).

One-time steps:

1. Make sure the `faheemnaeem.dev` zone is on the Cloudflare account that owns the Worker.
2. Log in: `npx wrangler login` (or `CLOUDFLARE_API_TOKEN=<API_TOKEN>` in CI, a token with "Edit Workers" permission).
3. Build and deploy:

    ```sh
    npx -y pnpm@9.15.9 --filter a11y build
    cd apps/a11y && npx wrangler deploy
    ```

    The `routes` entry with `custom_domain: true` creates the DNS record and certificate on first deploy.

4. Optional, Workers Builds (Git integration): root directory = repo root, build command `npx -y pnpm@9.15.9 turbo run build --filter=a11y`, deploy command `cd apps/a11y && npx wrangler deploy`. Do not change the root `build` script.
5. GitHub: Settings -> Actions -> General -> Workflow permissions must allow "Read and write" for `GITHUB_TOKEN` (the workflow also requests `contents: write`). If `master` has branch protection that blocks direct pushes, allow `github-actions[bot]` to bypass it, or the commit step fails.

Note on `[skip ci]`: GitHub Actions skips workflows for these commits. If your Cloudflare Git integration also honours `[skip ci]`, new reports go live on the next normal push to `master` (or a manual redeploy) rather than immediately.

No D1, KV, cron triggers (the schedule runs on GitHub, not Cloudflare) or secrets are needed.
