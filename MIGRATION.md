# Migration: single site → pnpm + Turborepo monorepo

## What changed

| Before | After |
|---|---|
| Site at repo root | Site in `apps/web/` (moved with `git mv`, history kept) |
| npm + `package-lock.json` | pnpm 9 workspaces + `pnpm-lock.yaml` at the root (converted from the npm lockfile, same versions) |
| `npm run build` → `public/` | `pnpm turbo run build --filter=web` → `apps/web/public/` |
| No deploy config (Wrangler auto-detected `public/`) | Root `wrangler.jsonc` pointing at `apps/web/public` |
| No shared config | `packages/config` (shared tsconfig, ESLint, Prettier) |
| `public/` ignored everywhere | Only `apps/web/public/` ignored (other apps will need their own `public/` folders) |

**Verified:** the new build bundles the same 237 source files with byte-identical
content and the same bundle size as the old build. File hashes differ only because
pnpm's `node_modules` layout changes internal paths and module IDs.

`apps/web/buildspec.yaml` (AWS CodeBuild) and `apps/web/server/` (local Express
server) were moved unchanged. Neither is used by the Cloudflare deploy.

---

## Cloudflare settings to change

The site is a **Cloudflare Worker with static assets** (name: `portfolio-website`),
deployed by Workers Builds. Workers have no "output directory" field: the output
folder is set in the root `wrangler.jsonc` (`assets.directory: ./apps/web/public`).

Dashboard → **Workers & Pages** → `portfolio-website` → **Settings** → **Build**.

> Write down the current values first so you can restore them if needed.

| Setting | Value | Why |
|---|---|---|
| **Build command** | `pnpm turbo run build --filter=web` | Builds only the main site |
| **Deploy command** | `npx wrangler deploy` (default) | Reads `wrangler.jsonc` and uploads `apps/web/public` |
| **Root directory** | `/` | The pnpm lockfile and workspace file live at the root |
| **Build watch paths → Include** | `apps/web/*`, `packages/*`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `wrangler.jsonc` | Don't rebuild the main site when only another subdomain changes |

**Build variables** (Settings → Build → Variables and secrets):

| Variable | Value | Why |
|---|---|---|
| `PNPM_VERSION` | `9.15.9` | Matches `packageManager` in the root `package.json` and the lockfile format |
| `NODE_VERSION` | keep whatever is set now; if none and the build fails on Node, set `22` | The site built fine on your current setup; don't change what works |

**Custom domains** stay in the dashboard. `wrangler.jsonc` has no `routes`, so
deploys don't touch faheemnaeem.dev or the other route.

**Checked locally:** `npx wrangler deploy --dry-run` reads the same 79 files as
the verified build; none is over the 25 MiB per-file limit.

## Safe rollout order

1. **Push the branch** (from the `portfolio-website-monorepo` folder):
   ```bash
   git push -u origin monorepo
   ```
2. **Preview first.** Workers Builds builds non-production branches and uploads a
   preview version (Preview command `npx wrangler preview`) without touching
   production.
   - Open the preview URL from the build/deployment details.
   - Check the 3D scene loads, the monitor/screen works, audio toggles, and the
     loading screen completes.
   - Check the build log shows `pnpm install` and `web:build: webpack ... compiled`.
3. **Merge** `monorepo` into `master` (pull request or merge locally).
4. **Confirm production** at https://faheemnaeem.dev.
5. **If production breaks:** Deployments tab → pick the last good version →
   **Rollback**. It is instant. Then restore the old build
   settings you wrote down.

> ⚠️ Changing the build settings affects the **current `master` branch** too.
> Until `monorepo` is merged, a new push to `master` would build with the new
> settings and fail (no `apps/web` on `master`). Avoid pushing to `master`
> between changing settings and merging.

---

## Not done in this phase (on purpose)

- **No `.nvmrc`.** Cloudflare builds read `.nvmrc` to choose its Node version, so
  adding one could silently change your production build. Pin Node later on
  purpose, together with `NODE_VERSION`.
- **`apps/web` does not extend `packages/config/tsconfig.base.json`.** Its
  `src/tsconfig.json` is unchanged so the build output stays identical.
- **No lint/test scripts for `apps/web` yet.** New apps will add them; Turborepo
  skips packages that don't define a task.

## Local commands

```bash
corepack enable || npm i -g pnpm@9.15.9   # one-time: get pnpm
pnpm install
pnpm dev                                    # all apps in dev mode
pnpm turbo run build --filter=web           # build just the main site
```
