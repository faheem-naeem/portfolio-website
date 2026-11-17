# changelog

`changelog.faheemnaeem.dev`: Faheem's career written as release notes (GitHub Releases / Keep a Changelog style). Static Astro site, no client JavaScript.

Data: `getCareer()` from `@faheem/data` (`packages/data/src/career.json`). Career dates are only accurate to the year, so pages show years and the intro shows the `note` from the data. (A legacy `sample` flag, unused today, would add a "Sample data" notice.)

## Pages and endpoints

| Path              | What                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/`               | Current-version badge, `git log --oneline` summary, release notes with Latest badge and BREAKING/feat/fix/chore/perf labels |
| `/graph/`         | Commit graph: inline SVG timeline (roles on `main`, degrees/courses on a `learning` side branch) plus an ordered-list text version |
| `/changelog.json` | Machine-readable changelog (CORS open)                                                                            |
| `/rss.xml`        | RSS 2.0 feed (`@astrojs/rss`)                                                                                     |
| `/404.html`       | Not-found page (served by `not_found_handling: "404-page"`)                                                       |

How labels are derived (`src/lib/changelog.ts`): release type `major` -> BREAKING, `minor` -> feat, `patch` -> fix. Each note is classified by its wording (`Breaking change:` -> BREAKING, `Patched/Fixed` -> fix, `faster/optimised` -> perf, `Migrated/Upgraded` -> chore, otherwise feat or fix). Commit hashes are a deterministic FNV-1a hash of version, date and title.

## Local development

From the repo root (pnpm is not installed globally):

```sh
npx -y pnpm@9.15.9 install
npx -y pnpm@9.15.9 --filter changelog dev        # http://localhost:4321
npx -y pnpm@9.15.9 --filter changelog build      # outputs apps/changelog/dist
npx -y pnpm@9.15.9 --filter changelog preview
```

## Test, typecheck, lint

```sh
npx -y pnpm@9.15.9 turbo run build test typecheck lint --filter=changelog
```

- `test`: Vitest unit tests for the pure helpers in `src/lib` (semver sort, labels, git log lines, graph layout, JSON and RSS payloads).
- `typecheck`: `astro check`.
- `lint`: ESLint via `@faheem/config/eslint`.

## Security headers

`public/_headers` sets CSP (`script-src 'self'; style-src 'self'`, no inline code: Astro is configured with `inlineStylesheets: 'never'`), HSTS, `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.

## Deploy

Deployed as a Cloudflare Worker with static assets only (Free plan, no bindings, no secrets). Config: `apps/changelog/wrangler.jsonc` (Worker `faheemnaeem-changelog`, assets from `./dist`, custom domain `changelog.faheemnaeem.dev`).

One-time steps:

1. Make sure the `faheemnaeem.dev` zone is on the Cloudflare account that owns the Worker.
2. Log in: `npx wrangler login` (or set `CLOUDFLARE_API_TOKEN=<API_TOKEN>` in CI, a token with "Edit Workers" permission).
3. Build and deploy from `apps/changelog`:

    ```sh
    npx -y pnpm@9.15.9 --filter changelog build
    cd apps/changelog && npx wrangler deploy
    ```

    The `routes` entry with `custom_domain: true` creates the DNS record and certificate for `changelog.faheemnaeem.dev` on first deploy.

4. Optional, Workers Builds (Git integration) in the dashboard: Workers & Pages -> Create -> Import repository; root directory = repo root, build command `npx -y pnpm@9.15.9 turbo run build --filter=changelog`, deploy command `cd apps/changelog && npx wrangler deploy`. Do not change the root `build` script (it builds only `web` on purpose).

No D1, KV, cron triggers or secrets are needed.
