/** Minimal shape of the Workers AI binding that this app uses. */
export interface AiBinding {
    run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

export interface Env {
    AI: AiBinding;
    DB: D1Database;
    AI_MODEL: string;
    DAILY_CAP?: string;
    TURNSTILE_SITE_KEY: string;
    /** Secret (wrangler secret put TURNSTILE_SECRET). */
    TURNSTILE_SECRET?: string;
    ENVIRONMENT?: string;
}
