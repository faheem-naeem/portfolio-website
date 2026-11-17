/** Bindings and variables configured in wrangler.jsonc / .dev.vars. */
export interface Env {
    DB: D1Database;
    /** Secret: lowercase hex SHA-256 of the flag (see scripts/make-flag.mjs). */
    FLAG_HASH?: string;
    /** Secret: salt mixed into the IP hash used by the rate limiter. */
    IP_HASH_SALT?: string;
    /** Optional var: calendar or contact link shown to solvers. */
    CONTACT_URL?: string;
}

export type AppEnv = { Bindings: Env };
