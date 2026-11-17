# Migration: single site → pnpm + Turborepo monorepo

## What changed

| Before | After |
|---|---|
| Site at repo root | Site in `apps/web/` (moved with `git mv`, history kept) |
| npm + `package-lock.json` | pnpm 9 workspaces + `pnpm-lock.yaml` at the root (converted from the npm lockfile, same versions) |
| `npm run build` → `public/` | `pnpm turbo run build --filter=web` → `apps/web/public/` |
| No shared config | `packages/config` (shared tsconfig, ESLint, Prettier) |
| `public/` ignored everywhere | Only `apps/web/public/` ignored (other apps will need their own `public/` folders) |

**Verified:** the new build bundles the same 237 source files with byte-identical
content and the same bundle size as the old build. File hashes differ only because
pnpm's `node_modules` layout changes internal paths and module IDs.

`apps/web/buildspec.yaml` (AWS CodeBuild) and `apps/web/server/` (local Express
server) were moved unchanged. Neither is used by Cloudflare Pages.

---

## Cloudflare Pages settings to change

Dashboard → **Workers & Pages** → your site's project → **Settings** → **Build**.

> Write down the current values first so you can restore them if needed.

| Setting | New value | Why |
|---|---|---|
| **Root directory** | *(leave empty — repository root)* | The pnpm lockfile and workspace file live at the root. If the root directory were `apps/web`, Cloudflare would not see them and the install would fail. |
| **Build command** | `pnpm turbo run build --filter=web` | Builds only the main site |
| **Build output directory** | `apps/web/public` | Where webpack writes the site |
| **Build watch paths → Include** | `apps/web/*`, `packages/*`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json` | Don't rebuild the main site when only another subdomain changes |

**Environment variables** (Settings → Variables and Secrets, for *both* Production and Preview):

| Variable | Value | Why |
|---|---|---|
| `PNPM_VERSION` | `9.15.9` | Matches `packageManager` in the root `package.json` and the lockfile format |
| `NODE_VERSION` | keep whatever is set now; if none and the build fails on Node, set `22` | The site built fine on your current setup; don't change what works |

Cloudflare detects `pnpm-lock.yaml` and runs `pnpm install` automatically before the build command.

---

## Safe rollout order

1. **Push the branch** (from the `portfolio-website-monorepo` folder):
   ```bash
   git push -u origin monorepo
   ```
2. **Preview first.** Pages builds non-production branches as previews. Because
   the settings above apply to all branches, change them right before pushing,
   or watch the next production build carefully (see step 5).
   - Open the preview URL (shown in the deployment list, e.g.
     `monorepo.<project>.pages.dev`).
   - Check the 3D scene loads, the monitor/screen works, audio toggles, and the
     loading screen completes.
   - Check the build log shows `pnpm install` and `web:build: webpack ... compiled`.
3. **Merge** `monorepo` into `master` (pull request or merge locally).
4. **Confirm production** at https://faheemnaeem.dev.
5. **If production breaks:** Deployments tab → pick the last good deployment →
   **Rollback to this deployment**. It is instant. Then restore the old build
   settings you wrote down.

> ⚠️ Changing the build settings affects the **current `master` branch** too.
> Until `monorepo` is merged, a new push to `master` would build with the new
> settings and fail (no `apps/web` on `master`). Avoid pushing to `master`
> between changing settings and merging.

---

## Not done in this phase (on purpose)

- **No `.nvmrc`.** Cloudflare Pages reads `.nvmrc` to choose its Node version, so
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
