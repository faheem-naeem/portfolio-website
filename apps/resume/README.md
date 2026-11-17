# resume

`resume.faheemnaeem.dev`: a curl-able terminal resume (Cloudflare Worker, Hono).

- Terminal clients (curl, wget, HTTPie, PowerShell, or `Accept: text/plain`) get a
  colourful ANSI text resume, max 80 columns. `?nocolor` (or `?no_color`) returns plain text.
- Browsers get a terminal-style page with an interactive prompt
  (`help`, `whoami`, `skills`, `experience`, `projects`, `contact`, `clear`, `theme`, `exit`),
  tab completion and up/down history. Output is an `aria-live` log region; the page
  works without JS. The script is served from `/terminal.js` so the CSP forbids inline scripts.
- Content comes from `@faheem/data`. The email placeholder is never printed.

| Route | What |
| --- | --- |
| `/`, `/skills`, `/experience`, `/projects`, `/contact` (`/whoami`) | Text or HTML depending on the client |
| `/resume.json` | Raw resume data (without the email placeholder) |
| `/resume.pdf` | 302 to https://faheemnaeem.dev (PDF available on request) |
| `/terminal.js`, `/styles.css` | Browser assets |

Responses are cached in the Workers edge cache (Cache API) for 1 hour, keyed per
variant (ansi, plain, html), and sent with `Cache-Control: public, max-age=3600`.

## Local dev

```sh
npx -y pnpm@9.15.9 --filter resume dev   # wrangler dev on http://localhost:8787
curl localhost:8787
curl 'localhost:8787/skills?nocolor'
```

## Test

```sh
npx -y pnpm@9.15.9 turbo run build test typecheck lint --filter=resume
```

## Deploy

No bindings or secrets are needed.

1. The `faheemnaeem.dev` zone must be on the same Cloudflare account.
2. Deploy once: `npx -y pnpm@9.15.9 --filter resume exec wrangler deploy`
   (the `routes` entry with `custom_domain: true` creates `resume.faheemnaeem.dev`
   and its DNS record).
3. Optional, for Git deploys: in the dashboard, Workers & Pages → Create → Import
   repository, root directory = repo root, build command
   `npx -y pnpm@9.15.9 install --frozen-lockfile`, deploy command
   `npx -y pnpm@9.15.9 --filter resume exec wrangler deploy`.
