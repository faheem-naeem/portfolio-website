import { createHash } from 'node:crypto';
import { createApp } from '../src/app';
import type { Env } from '../src/env';
import { FakeD1 } from './fakes/d1';

export const TEST_FLAG = 'FAHEEM{test-only-not-the-real-flag}';
export const TEST_HASH = createHash('sha256').update(TEST_FLAG).digest('hex');
export const NOW = Date.UTC(2026, 10, 17, 12, 30, 0);

export interface Harness {
    env: Env;
    db: FakeD1;
    clock: { now: number };
    request: (path: string, init?: RequestInit) => Promise<Response>;
}

export function harness(overrides: Partial<Env> = {}): Harness {
    const db = new FakeD1();
    const clock = { now: NOW };
    const app = createApp({ now: () => clock.now });
    const env: Env = {
        DB: db.asD1(),
        FLAG_HASH: TEST_HASH,
        IP_HASH_SALT: 'test-salt',
        ...overrides,
    };
    const ctx = {
        waitUntil: () => {},
        passThroughOnException: () => {},
        props: {},
    } as unknown as ExecutionContext;
    return {
        env,
        db,
        clock,
        request: (path, init) =>
            Promise.resolve(
                app.fetch(
                    new Request(`https://ctf.faheemnaeem.dev${path}`, init),
                    env,
                    ctx,
                ),
            ),
    };
}

export function postJson(body: unknown, ip = '203.0.113.7'): RequestInit {
    return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    };
}

export function postForm(
    fields: Record<string, string>,
    ip = '203.0.113.7',
): RequestInit {
    return {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'CF-Connecting-IP': ip,
        },
        body: new URLSearchParams(fields).toString(),
    };
}
