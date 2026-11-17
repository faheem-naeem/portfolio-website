// D1-backed fixed-window rate limiter.
//
// Why not the Workers Rate Limiting binding? Its `period` can only be 10 or
// 60 seconds (we need 5 per hour), its counters are per Cloudflare location,
// and its docs do not state Free-plan availability. D1 is on the Free plan,
// gives one global counter and lets us use a 1-hour window.
//
// Privacy: the raw IP is never stored. The key is SHA-256(salt + ":" + ip).

export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    /** Seconds until the current window resets. */
    retryAfter: number;
}

export interface RateLimitOptions {
    limit: number;
    windowSeconds: number;
    /** Current time in ms (injectable for tests). */
    now?: number;
}

export async function sha256Hex(input: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(input),
    );
    return [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

export async function hashIp(ip: string, salt = ''): Promise<string> {
    return sha256Hex(`${salt}:${ip}`);
}

/**
 * Counts one hit for `key` in the current window and reports whether it is
 * within the limit. One atomic upsert per call, plus cleanup of old windows
 * for this key in the same batch.
 */
export async function hitRateLimit(
    db: D1Database,
    key: string,
    { limit, windowSeconds, now = Date.now() }: RateLimitOptions,
): Promise<RateLimitResult> {
    const windowMs = windowSeconds * 1000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const [, upsert] = await db.batch<{ count: number }>([
        db
            .prepare(
                'DELETE FROM rate_limits WHERE key = ?1 AND window_start < ?2',
            )
            .bind(key, windowStart),
        db
            .prepare(
                `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
                 ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
                 RETURNING count`,
            )
            .bind(key, windowStart),
    ]);
    const count = upsert?.results?.[0]?.count ?? limit + 1;
    return {
        allowed: count <= limit,
        limit,
        remaining: Math.max(0, limit - count),
        retryAfter: Math.max(
            1,
            Math.ceil((windowStart + windowMs - now) / 1000),
        ),
    };
}
