# @faheem/data

Single source of truth for every personal fact shown on faheemnaeem.dev and its subdomains.
Consumed as **TypeScript source** (no build step): `exports` point at `src/*.ts` and `src/*.json`.

## Usage

```ts
import { getResume, getSites, getBugs, getManual } from '@faheem/data';
```

| Getter                       | Source               | Content                                                                                   |
| ---------------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| `getResume()`                | `src/resume.json`    | Real (from `apps/web/static/faheem-portfolio.html`), incl. public email and skill levels. |
| `getProjects()`              | `src/projects.json`  | Real personal projects (the portfolio and this subdomain network).                        |
| `getCareer()`                | `src/career.json`    | Real timeline (roles, education, certifications) written as semver releases.              |
| `getStatus()`                | `src/status.json`    | Humorous, work-related status components.                                                 |
| `getSites()` / `getSite(id)` | `src/sites.json`     | Every subdomain app (`id`, `url`, `title`, `pitch`, `kind`).                              |
| `getFunFacts()`              | `src/fun-facts.json` | Facts from the public professional profile (used by `api` random-fact).                   |
| `getIncidents()`             | `src/incidents.json` | Humorous incident history (used by `status`).                                             |
| `getBugs()` / `getBug(slug)` | `src/bugs/*.ts`      | Debugging stories, generic: no employer, client, product or colleague names.              |
| `getManual()`                | `src/manual.ts`      | "How to work with me" manual.                                                             |

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
- No placeholder content: the optional `sample` fields remain in the schema but no data may set them (tests enforce this).
- The only email allowed is the public contact address in `resume.json`. Never add phone numbers, secrets or employer/client data (bug stories stay generic).
- `pnpm --filter @faheem/data test` validates everything; bad data fails CI.
