# ctf — ctf.faheemnaeem.dev

A small 5-step capture-the-flag hunt across faheemnaeem.dev, ending on this Worker. Solvable in about 15 minutes by a curious developer.

- `GET /`: "Find the flag" landing page with a 5-step progress map, one hint per step (a `<details>` element, so hints work without JavaScript), the submit form and the approved Hall of Fame.
- `POST /submit`: JSON `{"flag": "...", "name": "optional"}` or an HTML form (`flag`, `name`). Checks `SHA-256(flag)` against the `FLAG_HASH` secret. On success it stores a Hall of Fame row (optional display name only, `approved = 0`) and shows "You'd fit right in. Let's talk." with a contact link.
- `GET /assets/{ui.css,ctf.css,ctf.js}`: external CSS and JS, so the CSP allows no inline script or style.

Design notes:

- The plain flag is never in the repo. This Worker only knows its hash. The api Worker returns the flag from its own `CTF_FLAG` secret.
- Rate limit: 10 submissions per hour per IP, counted in D1. The key is `SHA-256(IP_HASH_SALT + ":" + ip)`; raw IPs are never stored. Input errors (empty flag, bad name) are rejected before the limiter and do not cost an attempt.
- Display names: optional, max 24 characters, letters/digits/space/`._-` only, basic profanity filter (`src/lib/name.ts`). No email is collected. Nothing appears publicly until you approve it.
- With JavaScript, `/assets/ctf.js` remembers revealed hints and "I solved step N" toggles in `localStorage` (this browser only) and announces progress in a live region.
- The full walkthrough is in `CTF_SOLUTION.md`, which is gitignored (`apps/ctf/.gitignore`) and never committed.

## The clues (where they live)

| Step | Where                                                      | What                                                                              |
| ---- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1    | `apps/web/src/script.ts`, `apps/web/src/index.html`        | Styled `console.log` and a `<meta name="ctf-hint">` tag pointing to `/robots.txt` |
| 2    | `apps/web/static/robots.txt`                               | `Disallow: /maintenance-hatch.txt`                                                |
| 3    | `apps/web/static/maintenance-hatch.txt`                    | Base64 text that says to run `dig TXT clue.faheemnaeem.dev`                       |
| 4    | DNS TXT record `clue.faheemnaeem.dev` (manual, see Deploy) | ROT13 text with the hidden api path and header                                    |
| 5    | `apps/api/src/routes/ctf.ts`                               | `GET /v1/ctf/<path>` with header `X-Curious: true` returns the flag               |

Note: this README, the clue files and the api route are public in the repo, so a reader of the source can shortcut the hunt. That is accepted; the flag value itself is only in secrets.

## Local development

```sh
cp apps/ctf/.dev.vars.example apps/ctf/.dev.vars   # then fill in values
node apps/ctf/scripts/make-flag.mjs                # prints a flag and its hash
npx -y pnpm@9.15.9 --filter ctf db:migrate:local
npx -y pnpm@9.15.9 --filter ctf dev
```

## Test

```sh
npx -y pnpm@9.15.9 turbo run build test typecheck lint --filter=ctf
```

Vitest runs the Hono app with an in-memory D1 fake built on `node:sqlite` (real migration SQL).

## Deploy (one-time steps; placeholders only)

1. **Generate the flag** (prints to your terminal only; writes no file):

    ```sh
    node apps/ctf/scripts/make-flag.mjs
    ```

    It prints `CTF_FLAG = FAHEEM{...}` and `FLAG_HASH = <64 hex chars>`. Keep the flag in your password manager.

2. **D1**: already created; its id is committed in `apps/ctf/wrangler.jsonc` (to recreate: `npx wrangler d1 create faheemnaeem-ctf` and update `database_id`).
3. **Migrations**: `npx wrangler d1 migrations apply faheemnaeem-ctf --remote` (from `apps/ctf`).
4. **Secrets on the ctf Worker** (from `apps/ctf`):
    - `npx wrangler secret put FLAG_HASH` and paste `<FLAG_SHA256_HEX>`.
    - `npx wrangler secret put IP_HASH_SALT` and paste a long random string, `<RANDOM_STRING>`.
5. **Secret on the api Worker** (from `apps/api`): `npx wrangler secret put CTF_FLAG` and paste `<CTF_FLAG>` (the same flag). Deploy the api Worker.
6. **Optional contact link**: add `"vars": { "CONTACT_URL": "<YOUR_CALENDAR_OR_CONTACT_URL>" }` to `wrangler.jsonc`. Without it the success page links to LinkedIn (from `@faheem/data`).
7. **DNS TXT record** (Dashboard > faheemnaeem.dev > DNS > Records > Add record), created manually:

    | Type | Name   | Content                                                                                           | TTL  |
    | ---- | ------ | ------------------------------------------------------------------------------------------------- | ---- |
    | TXT  | `clue` | `Qrpbqrq! Fgrc 5: TRG uggcf://ncv.snurrzanrrz.qri/i1/pgs/enoovg-ubyr jvgu urnqre K-Phevbhf: gehr` | Auto |

    How it was derived (ROT13: each letter moves 13 places; digits and symbols stay):

    ```sh
    printf '%s' 'Decoded! Step 5: GET https://api.faheemnaeem.dev/v1/ctf/rabbit-hole with header X-Curious: true' \
      | tr 'A-Za-z' 'N-ZA-Mn-za-m'
    ```

    The path `/v1/ctf/rabbit-hole` and header `X-Curious` must match `CTF_PATH` and `CTF_HEADER` in `apps/api/src/routes/ctf.ts`. Check with `dig +short TXT clue.faheemnaeem.dev`.

8. **Deploy**: `npx wrangler deploy` from `apps/ctf`. The custom domain `ctf.faheemnaeem.dev` is created from `routes`. The web clues ship with the normal `apps/web` deploy.

### Moderating the Hall of Fame

```sh
# List pending entries
npx wrangler d1 execute faheemnaeem-ctf --remote \
  --command "SELECT id, display_name, created_at FROM hall_of_fame WHERE approved = 0"
# Approve one
npx wrangler d1 execute faheemnaeem-ctf --remote \
  --command "UPDATE hall_of_fame SET approved = 1 WHERE id = '<ENTRY_ID>'"
# Delete one
npx wrangler d1 execute faheemnaeem-ctf --remote \
  --command "DELETE FROM hall_of_fame WHERE id = '<ENTRY_ID>'"
```

### Rotating the flag

Run `make-flag.mjs` again, then update `CTF_FLAG` (api) and `FLAG_HASH` (ctf) together.

Free-plan notes: `GET /` makes 1 D1 read. `POST /submit` makes 1 D1 batch (rate limit) and, on success, 1 insert. No subrequests, no cron.
