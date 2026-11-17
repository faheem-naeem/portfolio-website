# Security review (Phase 13)

Date: 2026-11-17. Scope: every tracked file in the repo (`git ls-files`, 385 files),
excluding `node_modules/` and `pnpm-lock.yaml`. Reviewer: automated pass by Claude Code, checked by hand.

## Summary

| Area | Result |
|---|---|
| Secrets, keys, tokens in tracked files | **None found** |
| Secret files ever committed (`.dev.vars`, `.env`, `CTF_SOLUTION.md`) in any branch's history | **None** |
| Real email addresses | One intentional public contact address (owner's own) in `apps/web` and `readme.md`; nothing else |
| Phone numbers | None real (one reserved fictional `555-0100` number in an `ask` test) |
| Input validation in api, ask, ctf | **Present on every input** |
| Raw IP storage | **Never stored**; only salted SHA-256 hashes |
| `apps/ctf/CTF_SOLUTION.md` | Gitignored by `apps/ctf/.gitignore`, not tracked, never in history |
| Security headers (CSP, HSTS, nosniff, Referrer-Policy) | Set on every app |
| Wrangler configs | Placeholder ids only, no secrets in `vars` |

Fixes made in this phase: added `apps/resume/.dev.vars.example` (states no secrets are needed, for
consistency with the other Workers) and `observability` to `apps/bugs/wrangler.jsonc`. No security
defect needed fixing.

## 1. Secrets and personal data

Patterns searched (regex, case-sensitive unless noted):

- OpenAI-style `sk-…`, GitHub `ghp_…` / `github_pat_`, AWS `AKIA…`, Slack `xox?-`, Google `AIza…`
- PEM private keys (`-----BEGIN … PRIVATE KEY`), JWTs (`eyJ….…`), Turnstile secret keys (`0x4AAA…`)
- `secret|token|password|passwd = "<literal of 8+ chars>"` (case-insensitive)
- `api_key = "<16+ chars>"`
- Email addresses (`x@y.tld`) and phone numbers

Results:

- Only false positive for the key patterns: the CSS class `ask-disclaimer` matching `sk-`.
- Every `.dev.vars.example` and wrangler `vars` value is a `<PLACEHOLDER>`. The only literal
  "secret" is Cloudflare's **published** Turnstile test secret
  (`1x0000000000000000000000000000000AA`, always passes) in a comment in `apps/api/.dev.vars.example`;
  it is public documentation, not a credential.
- Emails: `api@faheemnaeem.dev` (sender address on the owner's own domain, in api config/docs),
  `github-actions[bot]` noreply address (a11y workflow), `a@b.com` (ctf test input), and the owner's
  public contact Gmail address in `apps/web/static/faheem-portfolio.html` and `readme.md`. The latter
  is a deliberate, already-public contact link on the live site; left unchanged (`apps/web` is out of scope).
  `packages/data/src/resume.json` keeps `"email": "<EMAIL>"` and the apps never print the placeholder.
- History check: `git log --all --name-only` shows no `.dev.vars`, `.env` or `CTF_SOLUTION.md` was ever committed.
- `.gitignore` covers `.dev.vars`, `.env`, `.env.*` (except `.env.example`), `.wrangler/`, `dist/`.

## 2. Input validation

| App | Input | Validation |
|---|---|---|
| api | Query/path params on `/v1/skills`, `/v1/experience/:index`, `/v1/projects` | Zod via `@hono/zod-openapi` (`c.req.valid(...)`), 400 with details on failure |
| api | `POST /v1/interview-requests` | Origin allowlist (403) → 16 KB body limit (413) → Zod schema (`InterviewRequestBody`, includes bounded `turnstileToken`) → Turnstile siteverify → D1 rate limit (5/h/IP) |
| api | `GET /v1/ctf/rabbit-hole` | Only reads the `X-Curious` header and compares to `"true"` |
| ask | `POST /api/ask` | 16 KB limit, JSON only, Zod (`BodySchema`, `MessageSchema`): question 1–500 chars, junk/repeat filters, history entries strictly `{role, content}`, capped and truncated to 4 turns; Turnstile on the first message, HMAC-signed session cookie; per-IP hourly and global daily caps in D1 |
| ctf | `POST /submit` | 4 KB limit; only JSON or form bodies (415 otherwise); `flag` must be a non-empty string ≤ `FLAG_MAX`; `name` validated by `validateName` (≤ 24 chars, `[\p{L}\p{N} ._-]` allowlist, profanity filter); D1 rate limit (10/h/IP); entries need manual approval |
| metrics | `POST /api/refresh` | Exists only when `REFRESH_TOKEN` is set; requires the `X-Refresh-Token` header; 5-minute cooldown |

All D1 queries use prepared statements with `.bind(...)` (no string-built SQL with user input).
Handwritten validation in ctf is equivalent to a schema (type check, length, allowlist).

## 3. IP addresses and stored personal data

- **api**: rate-limit key = `SHA-256(IP_HASH_SALT + ":" + ip)` (`apps/api/src/lib/rate-limit.ts`). The
  `interview_requests` table stores what the visitor submits (name, company, email, role, message) and no IP.
  Note: there is no automatic retention/purge for interview requests; delete old rows manually if desired.
- **ask**: key = `SHA-256("ask-ip|" + day + "|" + secret + "|" + ip)`, rotating daily. The `questions` log
  stores the question with emails/phone numbers redacted, and no IP or visitor data. The client IP is passed
  to Turnstile siteverify (`remoteip`) only, never stored.
- **ctf**: key = `SHA-256(IP_HASH_SALT + ":" + ip)`. Hall of Fame stores only an optional display name and a timestamp.
- **status / metrics**: no visitor data stored.

## 4. Security headers

- Static apps (bugs, changelog, manual, a11y): `public/_headers` sets CSP (`script-src 'self'`,
  `object-src 'none'`, `frame-ancestors 'none'`), HSTS (`max-age=31536000; includeSubDomains`),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, plus
  `X-Frame-Options: DENY` and a restrictive `Permissions-Policy`.
- Workers (resume, api, status, ask, ctf, metrics): a middleware sets the same four headers on every
  response. JSON responses use `default-src 'none'`. Notable CSP allowances, all intentional and documented:
  api docs page allows the one pinned (SRI) Scalar script from jsDelivr and inline styles (Scalar injects
  `<style>`); ask allows `https://challenges.cloudflare.com` for Turnstile.
- `apps/web` (existing live site) was not reviewed for headers in this phase (out of scope).

## 5. Configuration

- Every app's `wrangler.jsonc`: name `faheemnaeem-<id>`, `compatibility_date: 2026-10-01`,
  custom-domain route `<id>.faheemnaeem.dev`, D1/KV ids `00000000-0000-0000-0000-000000000000` with TODO comments.
- Cron triggers across all apps: 2 of the 5 allowed per account (status `*/10 * * * *`, metrics `0 */6 * * *`).
- The a11y GitHub workflow requests only `contents: write`, has no `push` trigger (no build loop), and commits only to `master`.

## Recommendations (not blocking)

1. Add a retention policy for `interview_requests` in api (for example delete rows older than 180 days), since it holds visitor emails.
2. After deploy, run the smoke tests in `DEPLOYMENT.md` to confirm the headers arrive in production.
3. Rotate `IP_HASH_SALT`, `FLAG_HASH`/`CTF_FLAG` and Turnstile secrets if they are ever pasted anywhere other than `wrangler secret put`.
