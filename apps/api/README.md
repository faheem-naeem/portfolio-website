# api (api.faheemnaeem.dev)

The resume as a public JSON API: a Hono Worker on Cloudflare Workers (Free plan). Every fact comes from `@faheem/data`. The OpenAPI 3.1 spec is generated from the Zod schemas with `@hono/zod-openapi`.

## Routes

| Method | Path                                                           | Notes                                                                                                          |
| ------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| GET    | `/`                                                            | Interactive docs (Scalar `@scalar/api-reference@1.76.4` from jsDelivr, pinned with SRI) plus a "Try it" banner |
| GET    | `/contact`, `/contact.js`                                      | Accessible interview-request form with a Turnstile widget (see below)                                          |
| GET    | `/openapi.json`                                                | OpenAPI 3.1 spec                                                                                               |
| GET    | `/v1/profile`                                                  | Profile and public links (no email)                                                                            |
| GET    | `/v1/skills?level=expert&q=react`                              | `level`: expert, proficient or familiar. `q`: case-insensitive substring                                       |
| GET    | `/v1/experience`, `/v1/experience/:index`                      | `0` = most recent role                                                                                         |
| GET    | `/v1/projects?status=live&tech=typescript`, `/v1/projects/:id` | `tech` is a case-insensitive exact match                                                                       |
| GET    | `/v1/random-fact`                                              | From `getFunFacts()`, `Cache-Control: no-store`                                                                |
| GET    | `/v1/hire-me`                                                  | 200 with a playful message and contact links (email, LinkedIn, form)                                           |
| GET    | `/teapot`                                                      | 418 I'm a teapot                                                                                               |
| POST   | `/v1/interview-requests`                                       | See below                                                                                                      |

Cross-cutting:

- **Errors** always look like `{"error":{"code","message"}}`. Validation errors also include `details: [{path, message}]`.
- **Caching**: successful GETs get an `ETag` (and `304` on `If-None-Match`) plus `Cache-Control: public, max-age=300, s-maxage=3600`. Errors and POSTs get `no-store`.
- **CORS (Cross-Origin Resource Sharing)**: GET from any origin (`*`). POST only from `https://faheemnaeem.dev` and direct subdomains (`https://<sub>.faheemnaeem.dev`). Other origins get a `403 FORBIDDEN_ORIGIN` from the server, not just a missing CORS header.
- **Security headers** on every response: CSP, HSTS, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. JSON uses `default-src 'none'`. The docs page allows scripts only from `'self'` (`/docs.js`) and the one pinned Scalar file. It also allows inline styles, because Scalar injects `<style>` tags. The `/contact` pages allow scripts from `'self'` (`/contact.js`) and `https://challenges.cloudflare.com` (Turnstile), frames only from Turnstile, and `form-action 'self'`. Both HTML pages also allow the Cloudflare Web Analytics beacon (`https://static.cloudflareinsights.com` in `script-src`, `https://cloudflareinsights.com` in `connect-src`).

### GET /contact

An HTML form (name, company, email, role, message) built with the `@faheem/ui` layout and tokens, plus a Cloudflare Turnstile widget whose public site key comes from the `TURNSTILE_SITE_KEY` var in `wrangler.jsonc`.

- **With JavaScript**, `/contact.js` posts JSON to `/v1/interview-requests` (the widget's `cf-turnstile-response` is sent as `turnstileToken`) and announces success or errors in an `aria-live` region.
- **Without JavaScript**, the browser posts the form as `application/x-www-form-urlencoded` to the same URL, and the Worker answers with an HTML thank-you (or error) page. Turnstile itself needs JavaScript, so in practice no-JS visitors are pointed to email and LinkedIn on the page.
- Without a site key the page renders a notice instead of the widget.

### POST /v1/interview-requests

Body (JSON, max 16 KB, unknown fields rejected):

```json
{
    "name": "...",
    "company": "...",
    "email": "...",
    "role": "...",
    "message": "...",
    "turnstileToken": "..."
}
```

The request goes through these steps, in order:

1. Origin check.
2. Zod validation (`400 VALIDATION_ERROR`).
3. Rate limit (`429 RATE_LIMITED` + `Retry-After`).
4. Turnstile check (`403 TURNSTILE_FAILED`, or `503 NOT_CONFIGURED` without a secret).
5. Insert into D1 `interview_requests`.
6. Optional email notification in the background (`ctx.waitUntil`).

The response is `201`. Email notifications are **off in production**: Email Routing is not set up on faheemnaeem.dev, so `wrangler.jsonc` has no `send_email` binding and the Worker skips the email silently. Requests are read from D1:

```sh
npx wrangler d1 execute faheemnaeem-api --remote --command "SELECT created_at, name, company, email, role FROM interview_requests ORDER BY created_at DESC LIMIT 20"
```

If a binding is configured and sending fails, the error is logged (`notify_failed`) and the request still succeeds, because the row is already stored.

### Email notifications (re-enable later)

1. Dashboard > faheemnaeem.dev > Email > Email Routing: enable it and verify the destination address `<YOUR_EMAIL>`.
2. In `wrangler.jsonc` add:

    ```jsonc
    "send_email": [{ "name": "SEND_EMAIL", "destination_address": "<YOUR_EMAIL>" }],
    "vars": {
        "TURNSTILE_SITE_KEY": "...",
        "NOTIFY_EMAIL": "<YOUR_EMAIL>",
        "NOTIFY_FROM": "api@faheemnaeem.dev"
    }
    ```

3. Deploy. While `NOTIFY_EMAIL` or `NOTIFY_FROM` is missing (or still a `<...>` placeholder) the email is skipped and logged as `notify_skipped`.

The token comes from a Cloudflare Turnstile widget on a faheemnaeem.dev page. Turnstile is Cloudflare's free CAPTCHA alternative. The widget's site key is public. Only the secret lives here.

### Rate limiting: why D1 and not the Rate Limiting binding

The Workers Rate Limiting binding was not used:

- Its `period` can only be **10 or 60 seconds**, so it cannot express "5 per hour".
- Its counters are per Cloudflare location, not global.
- Its docs do not say whether it is available on the Free plan.

Instead there is a small fixed-window limiter in D1 (`rate_limits` table, one atomic upsert per request, 1-hour windows, 5 requests per IP).

Raw IPs are never stored. The key is `SHA-256(IP_HASH_SALT + ":" + ip)`. Rows from older windows are deleted for that key on its next request.

## Local development

```sh
npx -y pnpm@9.15.9 install
cd apps/api
cp .dev.vars.example .dev.vars   # fill in values; the Turnstile test secret 1x0000000000000000000000000000000AA always passes
npx -y pnpm@9.15.9 db:migrate:local
npx -y pnpm@9.15.9 dev            # http://localhost:8787
```

## Test, typecheck, lint, build

```sh
npx -y pnpm@9.15.9 turbo run build test typecheck lint --filter=api
```

Tests use Vitest with `app.fetch(req, env, ctx)`. D1 is faked with real SQLite (`node:sqlite`, Node 22.5+) running `migrations/0001_init.sql`. The `cloudflare:email` module is aliased to a small fake in `vitest.config.ts`, and Turnstile is mocked with `fetch`. `build` is `wrangler deploy --dry-run --outdir dist`. It checks bundling and does not deploy.

## Deploy (one-time steps; placeholders only)

1. **D1**: done. The database `faheemnaeem-api` exists and its id is in `wrangler.jsonc` (to recreate: `npx wrangler d1 create faheemnaeem-api` and update `database_id`).
2. **Migrations**: `npx wrangler d1 migrations apply faheemnaeem-api --remote`
3. **Turnstile** (Dashboard > Turnstile > Add widget):
    - Add hostnames `faheemnaeem.dev` and `api.faheemnaeem.dev` (the `/contact` form).
    - The public site key is already set as `vars.TURNSTILE_SITE_KEY` in `wrangler.jsonc`.
    - Store the secret with `npx wrangler secret put TURNSTILE_SECRET` and paste `<TURNSTILE_SECRET>`.
4. **IP hash salt**: `npx wrangler secret put IP_HASH_SALT` and paste a long random string, `<RANDOM_STRING>`.
5. **Email Routing**: not used (see "Email notifications" above to enable it later).
6. **CTF flag** (for the ctf.faheemnaeem.dev puzzle hunt): run `node apps/ctf/scripts/make-flag.mjs` from the repo root, then `npx wrangler secret put CTF_FLAG` and paste the printed flag, `<CTF_FLAG>`. Set its hash on the ctf Worker as `FLAG_HASH` (see `apps/ctf/README.md`). Without it the hidden CTF route answers 503.
7. **Deploy**: `npx wrangler deploy` from `apps/api`. The custom domain `api.faheemnaeem.dev` is created from `routes`.

Free-plan notes:

- GETs do no I/O.
- A POST makes at most 1 Turnstile subrequest, 2 D1 statements (1 batch) for the rate limit, 1 D1 insert and (only if enabled) 1 email.
- The Scalar bundle (about 4.9 MB) is served by jsDelivr, not by this Worker.
