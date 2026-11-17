# manual

`manual.faheemnaeem.dev`: "How to work with me", a user manual styled like product documentation.
Static Astro site, served by Cloudflare Workers static assets (no Worker script, no bindings, no secrets).

## Content

- Body: `getManual()` from `@faheem/data` (`packages/data/src/manual.ts`, SAMPLE), split on `## ` headings and
  rendered at build time with `marked`. Raw HTML in markdown is escaped, never passed through.
- Section order and display titles: `SECTION_PLAN` in `src/content.ts`. Data sections not listed there are still
  rendered (before "Known bugs"), so nothing is dropped silently.
- App-local SAMPLE text not yet in `@faheem/data` (Quick start, extra Known bugs, FAQ): `src/content.ts`.
- "What I'm great at" comes from `resume.focusAreas`; Support links from `resume.links` and `sites.json`
  (the email is a placeholder in the data, so it is not shown).
- Callouts: `src/components/Callout.astro`, or in markdown `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`.
- Sidebar: `v<MANUAL_VERSION> — Last built <build date>` (build date, because git history may be missing in CI).
- Live local time: `public/clock.js` updates `<time data-tz>` once a minute using `resume.timezone`. Without
  JavaScript it shows the timezone name and UTC offsets computed at build time.
- Print: `@media print` in `src/styles/manual.css` hides navigation and lays the manual out as a two-column one-pager.

## Local development

```sh
npx -y pnpm@9.15.9 install
npx -y pnpm@9.15.9 --filter manual dev      # http://localhost:4321
npx -y pnpm@9.15.9 --filter manual build    # outputs apps/manual/dist
npx -y pnpm@9.15.9 --filter manual preview
```

## Test

```sh
npx -y pnpm@9.15.9 turbo run build test typecheck lint --filter=manual
```

Vitest covers markdown rendering (HTML escaping, callouts, section splitting), section assembly and the
timezone helpers. `typecheck` runs `astro check`.

## Deploy

One-time setup (no D1, KV or secrets needed):

1. Build: `npx -y pnpm@9.15.9 --filter manual build`.
2. Log in: `npx wrangler login` (Cloudflare account that owns `faheemnaeem.dev`).
3. Deploy from `apps/manual`: `npx wrangler deploy` (uses `wrangler.jsonc`: Worker `faheemnaeem-manual`,
   assets `./dist`, custom domain `manual.faheemnaeem.dev`).
4. Or, with Workers Builds (Git integration) in the dashboard: create a Worker from this repo with
   root directory = repo root, build command `npx -y pnpm@9.15.9 turbo run build --filter=manual`,
   deploy command `npx wrangler deploy --config apps/manual/wrangler.jsonc`.
5. Security headers come from `public/_headers` (copied into `dist/`). After the first deploy, check them with
   `curl -I https://manual.faheemnaeem.dev`.
