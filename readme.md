# Faheem Naeem — Portfolio

A personal portfolio for Faheem Naeem, a Calgary-based software developer with experience in full-stack applications, cloud platforms and AI-powered product features. The site preserves the original interactive 3D desktop experience and now presents Faheem’s resume-backed profile, experience, selected work, skills, education and contact links.

## Repository layout

This is a pnpm + Turborepo monorepo. Each subdomain of faheemnaeem.dev is its own app.

| Path              | What it is                                                                             |
| ----------------- | -------------------------------------------------------------------------------------- |
| `apps/web`        | The main site (faheemnaeem.dev): interactive 3D desktop, Three.js + React + webpack    |
| `packages/config` | Shared TypeScript, ESLint and Prettier config                                          |
| `packages/data`   | Single source of truth for resume, projects, career, sites and content (Zod-validated) |
| `packages/ui`     | Shared design tokens, base CSS and HTML layout (header/footer)                         |

## Run locally

```sh
pnpm install
pnpm --filter web dev
```

## Production build

```sh
pnpm turbo run build --filter=web   # output: apps/web/public
```

The portfolio displayed on the 3D computer monitor is served from `apps/web/static/faheem-portfolio.html` and copied into the production build.

## Contact

- Email: [faheem.naeem017@gmail.com](mailto:faheem.naeem017@gmail.com)
- LinkedIn: [linkedin.com/in/faheem-naeem](https://www.linkedin.com/in/faheem-naeem/)
- Location: Calgary, Alberta, Canada
