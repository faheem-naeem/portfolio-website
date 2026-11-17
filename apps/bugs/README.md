# bugs — The Bug Museum

Static Astro site for **bugs.faheemnaeem.dev**: a gallery of memorable bugs presented as museum exhibits.
Exhibits come from `getBugs()` in `@faheem/data` (generic debugging stories with no employer, client or product details; a legacy `sample` flag, unused today, would add a "Sample exhibit" badge).

## Pages

| Route                                                  | What                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `/`                                                    | Intro, "bugs captured" stats, "Exhibit of the month" hero (most recent exhibit), filters and gallery                     |
| `/exhibits/<slug>/`                                    | Museum placard (Exhibit #, Date discovered, Habitat, Danger level) + Symptom / Investigation / Root cause / Fix / Lesson |
| `/tag/<tag>/`, `/stack/<stack>/`, `/severity/<level>/` | Static filter pages (work without JS)                                                                                    |
| `/rss.xml`                                             | RSS feed (`@astrojs/rss`)                                                                                                |
| `/404.html`                                            | Not-found page (served by Workers static assets)                                                                         |

`public/filter.js` (about 2 KB, optional) filters the home gallery in place and updates the URL to the matching static filter page.
Code blocks in exhibit bodies are highlighted at build time with Shiki (light + dark themes); use a ` ```diff ` block for a before/after diff.

## Local development

```sh
npx -y pnpm@9.15.9 install
npx -y pnpm@9.15.9 --filter bugs dev        # http://localhost:4321
npx -y pnpm@9.15.9 --filter bugs build      # outputs apps/bugs/dist
npx -y pnpm@9.15.9 --filter bugs test       # Vitest (lib helpers + markdown rendering)
npx -y pnpm@9.15.9 --filter bugs typecheck  # astro check
npx -y pnpm@9.15.9 --filter bugs lint
```

To add an exhibit, add a bug entry in `packages/data/src/bugs/` (see `packages/data/README.md`).

## Notes

- Open Graph image: every page uses the main site's `https://faheemnaeem.dev/images/preview.jpg`. Per-exhibit images were skipped because rendering PNGs at build time needs native/WASM image tooling (sharp, canvas or resvg + fonts), and link previews do not support SVG.
- "Exhibit of the month" is the most recent exhibit: the `@faheem/data` bug schema has no `featured` flag yet. Likewise a time-to-fix stat needs a new frontmatter field before it can be shown.
- Security headers live in `public/_headers` (CSP allows no inline scripts or `<style>` elements; `style-src-attr 'unsafe-inline'` is needed for Shiki token colours).

## Deploy

Deployed as a Cloudflare Worker with static assets (`wrangler.jsonc`, Worker name `faheemnaeem-bugs`). No bindings or secrets are needed. One-time steps:

1. Make sure the `faheemnaeem.dev` zone is on the same Cloudflare account.
2. Build: `npx -y pnpm@9.15.9 --filter bugs build`.
3. Deploy (from `apps/bugs`): `npx wrangler deploy`. The `routes` entry with `custom_domain: true` creates the `bugs.faheemnaeem.dev` DNS record and certificate.
4. Optional, for Git-based deploys (Workers Builds): in the dashboard, create a Worker connected to this repo with root directory = repo root, build command `npx -y pnpm@9.15.9 install && npx -y pnpm@9.15.9 --filter bugs build`, deploy command `npx wrangler deploy --config apps/bugs/wrangler.jsonc`.
