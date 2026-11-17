# Repository Guidance

## Project purpose

This repository contains a personal developer portfolio for **faheemnaeem.dev**. It is being extended from the current single website into a pnpm/Turborepo monorepo in which each subdomain is a separate app.

## Current site stack (`apps/web`)

- Framework: plain TypeScript/React application, with Three.js and a custom webpack build
- Build tool: webpack 5
- Package manager: pnpm 9 workspaces (`pnpm-lock.yaml` at the repo root, converted from the old npm lockfile)
- Node: no `.nvmrc` on purpose (Cloudflare Pages would read it and change the production Node version)
- Deployment: **Cloudflare Pages via the dashboard Git integration** (see commit 62b40c4). There is no config file in the repo; build settings live in the Cloudflare dashboard. Pages rejects any single file over 25 MB.
- `apps/web/server/index.ts` is only a local Express static server for `public/`. It is not deployed. `buildspec.yaml` (AWS CodeBuild) is legacy and not used by the Pages deploy.
- Build command (repo root): `pnpm turbo run build --filter=web`
- Development command: `pnpm --filter web dev`
- Production output directory: `apps/web/public/`
- Cloudflare Pages settings for the monorepo are documented in `MIGRATION.md` (root directory = repo root, not `apps/web`).

## Target structure

- `apps/web` -> `faheemnaeem.dev` (existing site)
- `apps/resume` -> `resume.faheemnaeem.dev` (Worker)
- `apps/api` -> `api.faheemnaeem.dev` (Worker)
- `apps/status` -> `status.faheemnaeem.dev` (Worker + cron)
- `apps/bugs` -> `bugs.faheemnaeem.dev` (static)
- `apps/changelog` -> `changelog.faheemnaeem.dev` (static)
- `apps/manual` -> `manual.faheemnaeem.dev` (static)
- `apps/a11y` -> `a11y.faheemnaeem.dev` (static + CI job)
- `apps/ask` -> `ask.faheemnaeem.dev` (Worker + AI)
- `apps/ctf` -> `ctf.faheemnaeem.dev` (Worker)
- `apps/metrics` -> `metrics.faheemnaeem.dev` (Worker + cron)
- `packages/data` -> single source of truth for resume, projects, and career JSON
- `packages/ui` -> shared design tokens, CSS, header, and footer
- `packages/config` -> shared tsconfig, ESLint, and Prettier configuration

## Tooling

- pnpm workspaces
- Turborepo
- TypeScript strict mode
- Vitest
- Hono for Worker routing
- Wrangler for Workers

## Rules

- All personal content must come from `packages/data`; never hardcode resume facts.
- Never commit secrets. Use `.dev.vars` locally (and keep it gitignored) and `wrangler secret put` in production.
- Commit `.dev.vars.example` with placeholders only.
- Never use employer/client code, data, or screenshots.
- Every app must pass WCAG 2.2 AA, support dark mode via `prefers-color-scheme`, work at 360px width, and target a Lighthouse performance score of 95+.
  - Exception: `apps/web` is a Three.js 3D experience. Do not refactor or "optimize" its scene, shaders, or interactions to chase scores; only fix real accessibility issues around it.
- Work only on the `monorepo` branch. Never push or deploy. The default branch is `master`; never commit to it.
- Never switch branches in the main checkout (other sessions may be using it). Create the `monorepo` branch in a separate worktree: `git worktree add ../portfolio-website-monorepo -b monorepo`, and work there.
