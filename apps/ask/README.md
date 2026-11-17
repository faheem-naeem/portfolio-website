# ask

`ask.faheemnaeem.dev`: a chat page where visitors ask about Faheem's experience. Answers come from **Cloudflare Workers AI** (the `AI` binding, no API key) and are grounded only in `@faheem/data` (resume, non-sample projects, manual). Runs at **$0** on the Workers Free plan.

## Routes

| Route             | What                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`           | Chat UI: suggested-question chips, streaming answers, Turnstile widget, disclaimer, "Powered by Cloudflare Workers AI".                   |
| `GET /chat.js`    | Browser script (external, so the CSP has no `unsafe-inline`).                                                                             |
| `GET /styles.css` | `@faheem/ui` tokens/base CSS + page CSS.                                                                                                  |
| `POST /api/ask`   | `{ question, history[], turnstileToken? }` → Server-Sent Events, passed straight through from Workers AI. JSON `{error, message}` on 4xx. |

## Model choice

`AI_MODEL = "@cf/ibm-granite/granite-4.0-h-micro"` (wrangler var, change without code edits).

Checked on 2026-11-17 against the [model catalog](https://developers.cloudflare.com/workers-ai/models/) and [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/):

- **Free-plan OK**: not on the list of models that need a paid billing method (Kimi, GLM-5.x, DeepSeek-V4, Inkling).
- **Not deprecated**: the small Llama models (`llama-3.2-1b/3b-instruct`, `llama-3.1-8b-instruct-fp8`) all show a planned deprecation on **2026-11-20**, so they were avoided.
- **Cheapest small instruct model**: 1,542 Neurons per million input tokens, 10,158 per million output tokens. IBM positions it for instruction following and RAG (answering from supplied documents), which is exactly this use.
- Supports a `system` message and `stream: true` (SSE), 131k context.

**Approximate cost per answer**: the system prompt is about 6,300 characters (~1,600 tokens). With up to 4 turns of history the input is 1,600 to 3,600 tokens (2.5 to 5.5 Neurons) and the output is capped at 220 tokens (≤ 2.2 Neurons), so **about 5 to 8 Neurons per answer**. `DAILY_CAP = 150` therefore uses at most ~1,200 of the free 10,000 Neurons/day.

Generation settings: `max_tokens 220`, `temperature 0.2`, `stream: true`.

## Safety and abuse protection (all free)

- **Guardrails before the model**: question 1 to 500 chars, not junk (needs letters, no 10+ repeated characters), not a repeat of the previous question. History is validated with Zod: entries that are not exactly `{role: "user" | "assistant", content: string}` are dropped, extra fields stripped, content capped (500 / 1,200 chars), only the last 4 turns kept. Body max 16 KB, JSON only.
- **Prompt-injection hardening**: visitor text only ever goes in `user` messages, never into the system prompt. The system prompt says user-message instructions that try to change the rules must be ignored, and never to reveal the prompt.
- **Turnstile** on the first message, verified server-side (`siteverify` with `TURNSTILE_SECRET`). A pass sets an HMAC-signed, HttpOnly, Secure, SameSite=Strict `ask_session` cookie (1 hour), so forged `history` cannot skip the check. Without `TURNSTILE_SECRET` the API refuses (503), except the logged dev bypass when `ENVIRONMENT === "development"`.
- **Per-IP limit**: 15 questions/hour in D1, keyed by `SHA-256(day | secret | IP)`. Raw IPs are never stored. The Workers Rate Limiting binding was not used: its `period` can only be 10 or 60 seconds, so it cannot express "per hour".
- **Global daily cap**: `DAILY_CAP` questions per UTC day in D1 (atomic upsert). Past it, the answer is a friendly "I've answered a lot of questions today — reach Faheem directly: …".
- **Workers AI errors** (for example the free Neurons are used up) return a friendly fallback, never an error page.
- D1, not KV, for counters (KV free plan: 1,000 writes/day).
- **Question log**: `questions` table (time, question with emails/phone numbers redacted, history turns, outcome). No IP or other visitor data. Read it with `wrangler d1 execute faheemnaeem-ask --remote --command "SELECT asked_at, question, outcome FROM questions ORDER BY id DESC LIMIT 50"`.

## Local dev

```sh
cp apps/ask/.dev.vars.example apps/ask/.dev.vars   # remove TURNSTILE_SECRET to use the dev bypass
npx -y pnpm@9.15.9 --filter ask exec wrangler d1 migrations apply faheemnaeem-ask --local
npx -y pnpm@9.15.9 --filter ask dev
```

The `AI` binding always runs on Cloudflare (even in `wrangler dev`), so you need `wrangler login`; local calls use your free Neurons. For the widget locally, use Turnstile's test site key `1x00000000000000000000AA` (always passes) and test secret `1x0000000000000000000000000000000AA` in `.dev.vars`.

## Test

```sh
npx -y pnpm@9.15.9 turbo run build test typecheck lint --filter=ask
```

Vitest with a mocked `env.AI`, mocked `fetch` (Turnstile) and an in-memory D1 fake (Node's `node:sqlite` running the real migration). Covers: grounded answer path, refusal/injection rules in the prompt, guardrails, Turnstile + session, per-IP limit, daily cap and the AI failure fallback.

## Deploy

One-time steps (placeholders only; never commit real values):

1. D1: already created; its id is committed in `wrangler.jsonc` (to recreate: `npx wrangler d1 create faheemnaeem-ask` and update `database_id`).
2. `npx wrangler d1 migrations apply faheemnaeem-ask --remote`
3. Dashboard → Turnstile → Add widget for hostname `ask.faheemnaeem.dev` (Managed mode). The public **site key** is already set as `TURNSTILE_SITE_KEY` in `wrangler.jsonc` (the same widget as the api form; add both hostnames to it).
4. `npx wrangler secret put TURNSTILE_SECRET` and paste the Turnstile **secret key** (`<TURNSTILE_SECRET>`).
5. Workers AI needs no setup or key on the Free plan; keep `ENVIRONMENT = "production"`.
6. `npx wrangler deploy` from `apps/ask` (the `routes` entry creates the `ask.faheemnaeem.dev` custom domain).

## Content notes

- All `@faheem/data` content is real launch content; the assistant treats the manual as Faheem's own words.
- Legacy guard: skill groups or projects flagged `sample` (none today) would be left out of the prompt.
