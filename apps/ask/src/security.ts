// Turnstile verification, the signed session cookie that follows it, and the
// salted IP hash. All free: Turnstile siteverify + Web Crypto.
import type { Env } from './env';

export const SITEVERIFY_URL =
    'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const SESSION_COOKIE = 'ask_session';
export const SESSION_TTL_SECONDS = 60 * 60;

type FetchLike = typeof fetch;

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
    let bin = '';
    for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
    return [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** True only when the explicit, logged local-dev bypass is allowed. */
export function devBypassAllowed(env: Env): boolean {
    return !env.TURNSTILE_SECRET && env.ENVIRONMENT === 'development';
}

/**
 * Secret material for the session HMAC and the IP-hash salt. Derived from the
 * Turnstile secret so no extra secret is needed; a fixed value only in the
 * dev-bypass case (callers refuse to serve when neither applies).
 */
function secretMaterial(env: Env): string {
    return env.TURNSTILE_SECRET ?? 'ask-local-development-only';
}

/**
 * IP key for rate limiting: SHA-256(day | secret | ip). Never stored raw;
 * rotates daily and cannot be reversed by hashing every IPv4 address.
 */
export function hashIp(env: Env, ip: string, day: string): Promise<string> {
    return sha256Hex(`ask-ip|${day}|${secretMaterial(env)}|${ip}`);
}

async function hmacKey(env: Env): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        encoder.encode(`ask-session|${secretMaterial(env)}`),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
}

async function sign(env: Env, payload: string): Promise<string> {
    const sig = await crypto.subtle.sign(
        'HMAC',
        await hmacKey(env),
        encoder.encode(payload),
    );
    return toBase64Url(sig);
}

/** Cookie value "<expiry seconds>.<hmac>", issued after a Turnstile pass. */
export async function createSession(env: Env, nowMs: number): Promise<string> {
    const exp = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
    return `${exp}.${await sign(env, `v1.${exp}`)}`;
}

export async function verifySession(
    env: Env,
    value: string | undefined,
    nowMs: number,
): Promise<boolean> {
    if (!value) return false;
    const match = /^(\d{1,12})\.([\w-]{20,100})$/.exec(value);
    if (!match) return false;
    const exp = Number(match[1]);
    if (exp * 1000 <= nowMs) return false;
    const expected = await sign(env, `v1.${exp}`);
    // Constant-time-ish comparison of two same-length base64url strings.
    const given = match[2] ?? '';
    if (given.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < given.length; i++)
        diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
}

/** Server-side Turnstile check against Cloudflare's siteverify endpoint. */
export async function verifyTurnstile(
    env: Env,
    token: string,
    ip: string | undefined,
    fetchImpl: FetchLike,
): Promise<boolean> {
    if (!env.TURNSTILE_SECRET) return false;
    const form = new FormData();
    form.append('secret', env.TURNSTILE_SECRET);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    try {
        const res = await fetchImpl(SITEVERIFY_URL, {
            method: 'POST',
            body: form,
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { success?: unknown };
        return data.success === true;
    } catch (err) {
        console.error('turnstile siteverify failed', err);
        return false;
    }
}
