/** Bindings and variables configured in wrangler.jsonc / .dev.vars. */
export interface Env {
    DB: D1Database;
    /** Email Routing `send_email` binding. */
    SEND_EMAIL?: SendEmail;
    /** Secret: Cloudflare Turnstile secret key. */
    TURNSTILE_SECRET?: string;
    /** Secret (optional): salt mixed into the IP hash used by the rate limiter. */
    IP_HASH_SALT?: string;
    /** Secret (optional): final flag of the ctf.faheemnaeem.dev puzzle hunt. */
    CTF_FLAG?: string;
    /** Verified Email Routing destination address that receives notifications. */
    NOTIFY_EMAIL?: string;
    /** Sender address on a domain with Email Routing enabled. */
    NOTIFY_FROM?: string;
}

export type AppEnv = { Bindings: Env };
