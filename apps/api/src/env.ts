/** Bindings and variables configured in wrangler.jsonc / .dev.vars. */
export interface Env {
    DB: D1Database;
    /**
     * Optional Email Routing `send_email` binding. Not configured in
     * production (Email Routing is not set up); when absent, notification
     * emails are skipped silently and requests are only stored in D1.
     */
    SEND_EMAIL?: SendEmail;
    /** Public Cloudflare Turnstile site key for the /contact form widget. */
    TURNSTILE_SITE_KEY?: string;
    /** Secret: Cloudflare Turnstile secret key. */
    TURNSTILE_SECRET?: string;
    /** Secret (optional): salt mixed into the IP hash used by the rate limiter. */
    IP_HASH_SALT?: string;
    /** Secret (optional): final flag of the ctf.faheemnaeem.dev puzzle hunt. */
    CTF_FLAG?: string;
    /** Only with SEND_EMAIL: verified Email Routing destination address. */
    NOTIFY_EMAIL?: string;
    /** Only with SEND_EMAIL: sender address on the Email Routing domain. */
    NOTIFY_FROM?: string;
}

export type AppEnv = { Bindings: Env };
