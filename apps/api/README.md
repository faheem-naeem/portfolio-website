# api (api.faheemnaeem.dev)

The resume as a public JSON API: a Hono Worker on Cloudflare Workers (Free plan). Every fact comes from `@faheem/data`. The OpenAPI 3.1 spec is generated from the Zod schemas with `@hono/zod-openapi`.

## Routes

| Method | Path                                                           | Notes                                                                                                          |
| ------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| GET    | `/`                                                            | Interactive docs (Scalar `@scalar/api-reference@1.76.4` from jsDelivr, pinned with SRI) plus a "Try it" banner |
| GET    | `/openapi.json`                                                | OpenAPI 3.1 spec                                                                                               |
| GET    | `/v1/profile`                                                  | Profile and public links (no email)                                                                            |
| GET    | `/v1/skills?level=expert&q=react`                              | `level`: expert, proficient or familiar. `q`: case-insensitive substring                                       |
| GET    | `/v1/experience`, `/v1/experience/:index`                      | `0` = most recent role                                                                                         |
| GET    | `/v1/projects?status=live&tech=typescript`, `/v1/projects/:id` | `tech` is a case-insensitive exact match                                                                       |
| GET    | `/v1/random-fact`                                              | From `getFunFacts()`, `Cache-Control: no-store`                                                                |
| GET    | `/v1/hire-me`                                                  | 200 with a playful message and contact links                                                                   |
| GET    | `/teapot`                                                      | 418 I'm a teapot                                                                                               |
| POST   | `/v1/interview-requests`                                       | See below                                                                                                      |

Cross-cutting:

- **Errors** always look like `{"error":{"code","message"}}`. Validation errors also include `details: [{path, message}]`.
- **Caching**: successful GETs get an `ETag` (and `304` on `If-None-Match`) plus `Cache-Control: public, max-age=300, s-maxage=3600`. Errors and POSTs get `no-store`.
- **CORS (Cross-Origin Resource Sharing)**: GET from any origin (`*`). POST only from `https://faheemnaeem.dev` and direct subdomains (`https://<sub>.faheemnaeem.dev`). Other origins get a `403 FORBIDDEN_ORIGIN` from the server, not just a missing CORS header.
- **Security headers** on every response: CSP, HSTS, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. JSON uses `default-src 'none'`. The docs page allows scripts only from `'self'` (`/docs.js`) and the one pinned Scalar file. It also allows inline styles, because Scalar injects `<style>` tags.

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
6. Email notification in the background (`ctx.waitUntil`).

The response is `201`. If the email fails, the error is logged (`notify_failed`) and the request still succeeds, because the row is already stored. The email is skipped (and logged as `notify_skipped`) while `NOTIFY_EMAIL` is still the `<YOUR_EMAIL>` placeholder.

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

1. **D1**: run `npx wrangler d1 create faheemnaeem-api`. Put the printed id into `database_id` in `wrangler.jsonc`, replacing `00000000-0000-0000-0000-000000000000`.
2. **Migrations**: `npx wrangler d1 migrations apply faheemnaeem-api --remote`
3. **Turnstile** (Dashboard > Turnstile > Add widget):
    - Add hostnames `faheemnaeem.dev` and any subdomain that hosts the form.
    - The site key goes in that page's widget.
    - Store the secret with `npx wrangler secret put TURNSTILE_SECRET` and paste `<TURNSTILE_SECRET>`.
4. **IP hash salt**: `npx wrangler secret put IP_HASH_SALT` and paste a long random string, `<RANDOM_STRING>`.
5. **Email Routing** (Dashboard > faheemnaeem.dev > Email > Email Routing):
    - Enable it.
    - Add and verify the destination address `<YOUR_EMAIL>`.
    - In `wrangler.jsonc`, set `vars.NOTIFY_EMAIL` to that verified address.
    - `NOTIFY_FROM` (`api@faheemnaeem.dev`) must be on the Email Routing domain.
    - Optional: lock the binding with `"send_email": [{ "name": "SEND_EMAIL", "destination_address": "<YOUR_EMAIL>" }]`.
6. **Deploy**: `npx wrangler deploy` from `apps/api`. The custom domain `api.faheemnaeem.dev` is created from `routes`.

Free-plan notes:

- GETs do no I/O.
- A POST makes at most 1 Turnstile subrequest, 2 D1 statements (1 batch) for the rate limit, 1 D1 insert and 1 email.
- The Scalar bundle (about 4.9 MB) is served by jsDelivr, not by this Worker.
