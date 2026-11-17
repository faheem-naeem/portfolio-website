# @faheem/data

Single source of truth for every personal fact shown on faheemnaeem.dev and its subdomains.
Consumed as **TypeScript source** (no build step): `exports` point at `src/*.ts` and `src/*.json`.

## Usage

```ts
import { getResume, getSites, getBugs, getManual } from '@faheem/data';
```

| Getter                       | Source               | Real or SAMPLE                                                                                                                                          |
| ---------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getResume()`                | `src/resume.json`    | Real (from `apps/web/static/faheem-portfolio.html`). Skill `level`/`years` are SAMPLE (`"sample": true` per group). Email is the `<EMAIL>` placeholder. |
| `getProjects()`              | `src/projects.json`  | `faheemnaeem-dev` is real; entries with `"sample": true` are placeholders.                                                                              |
| `getCareer()`                | `src/career.json`    | SAMPLE release framing over real roles/dates.                                                                                                           |
| `getStatus()`                | `src/status.json`    | SAMPLE joke components.                                                                                                                                 |
| `getSites()` / `getSite(id)` | `src/sites.json`     | Every planned subdomain app (`id`, `url`, `title`, `pitch`, `kind`).                                                                                    |
| `getFunFacts()`              | `src/fun-facts.json` | SAMPLE (used by `api` random-fact).                                                                                                                     |
| `getIncidents()`             | `src/incidents.json` | SAMPLE (used by `status` incident history).                                                                                                             |
| `getBugs()` / `getBug(slug)` | `src/bugs/*.ts`      | SAMPLE, generic, no employer/client details.                                                                                                            |
| `getManual()`                | `src/manual.ts`      | SAMPLE.                                                                                                                                                 |

Every getter validates with the Zod schemas in `src/schema.ts` (also exported, with inferred types) and memoises the result.

## Markdown content (bugs, manual)

Markdown lives in **TypeScript modules** that export `{ frontmatter, body }`, where `body` is a markdown
template string. This needs no `?raw` imports, `import.meta.glob`, `fs`, or bundler plugins, so it works
unchanged in esbuild (Wrangler / Workers), Vite (Astro) and Vitest. Render `body` with any markdown library.

Add a bug: copy `src/bugs/retry-storm.ts`, change it, then import it in `src/bugs/index.ts`.
The body must contain the `## Symptom`, `## Investigation`, `## Root cause`, `## Fix`, `## Lesson` sections in that order.

Inside template strings, escape backticks as `` \` `` and `${` as `\${`.

## Rules

- Runtime code must not use Node-only APIs (no `fs`, `path`).
- Invented content must carry `sample: true` until replaced with real data.
- Never put a raw email, phone number, secret or employer/client data here.
- `pnpm --filter @faheem/data test` validates everything; bad data fails CI.
