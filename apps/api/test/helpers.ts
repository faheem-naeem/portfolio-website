import { vi } from 'vitest';
import { createApp } from '../src/app';
import type { Env } from '../src/env';
import { FakeD1 } from './fakes/d1';

export const app = createApp();

export interface Harness {
    env: Env;
    db: FakeD1;
    sent: { from: string; to: string; raw: string }[];
    waitUntil: Promise<unknown>[];
    request: (path: string, init?: RequestInit) => Promise<Response>;
}

export function harness(overrides: Partial<Env> = {}): Harness {
    const db = new FakeD1();
    const sent: Harness['sent'] = [];
    const waitUntil: Promise<unknown>[] = [];
    const env: Env = {
        DB: db.asD1(),
        TURNSTILE_SECRET: 'test-secret',
        IP_HASH_SALT: 'test-salt',
        NOTIFY_EMAIL: 'owner@example.com',
        NOTIFY_FROM: 'api@faheemnaeem.dev',
        SEND_EMAIL: {
            send: vi.fn(async (msg: unknown) => {
                sent.push(msg as Harness['sent'][number]);
                return { messageId: 'x' };
            }),
        } as unknown as SendEmail,
        ...overrides,
    };
    const ctx = {
        waitUntil: (p: Promise<unknown>) => void waitUntil.push(p),
        passThroughOnException: () => {},
        props: {},
    } as unknown as ExecutionContext;
    return {
        env,
        db,
        sent,
        waitUntil,
        request: (path, init) =>
            Promise.resolve(
                app.fetch(
                    new Request(`https://api.faheemnaeem.dev${path}`, init),
                    env,
                    ctx,
                ),
            ),
    };
}

/** Mocks global fetch for Turnstile siteverify. */
export function mockTurnstile(success = true) {
    return vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () =>
            Response.json(
                success
                    ? { success: true }
                    : {
                          success: false,
                          'error-codes': ['invalid-input-response'],
                      },
            ),
        );
}

export const validBody = {
    name: 'Ada Lovelace',
    company: 'Analytical Engines',
    email: 'ada@example.com',
    role: 'Senior Engineer',
    message: 'We would love to talk about a backend role.',
    turnstileToken: 'token-123',
};

export function post(
    body: unknown,
    headers: Record<string, string> = {},
): RequestInit {
    return {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Origin: 'https://faheemnaeem.dev',
            'CF-Connecting-IP': '203.0.113.7',
            ...headers,
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    };
}
