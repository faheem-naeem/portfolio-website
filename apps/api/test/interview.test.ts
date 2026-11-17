import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRawEmail } from '../src/lib/notify';
import { hashIp, hitRateLimit } from '../src/lib/rate-limit';
import { TURNSTILE_VERIFY_URL } from '../src/lib/turnstile';
import { FakeD1 } from './fakes/d1';
import { harness, mockTurnstile, post, validBody } from './helpers';

const PATH = '/v1/interview-requests';

type Row = Record<string, unknown>;

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('POST /v1/interview-requests: happy path', () => {
    it('verifies Turnstile, stores the row, emails me and returns 201', async () => {
        const fetchSpy = mockTurnstile(true);
        const h = harness();
        const res = await h.request(PATH, post(validBody));
        expect(res.status).toBe(201);
        const body = (await res.json()) as {
            data: { id: string; status: string };
        };
        expect(body.data.status).toBe('received');
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
            'https://faheemnaeem.dev',
        );
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(res.headers.get('RateLimit-Remaining')).toBe('4');

        // Turnstile called with secret, token and IP.
        const [url, init] = fetchSpy.mock.calls[0]!;
        expect(String(url)).toBe(TURNSTILE_VERIFY_URL);
        const form = (init as RequestInit).body as FormData;
        expect(form.get('secret')).toBe('test-secret');
        expect(form.get('response')).toBe('token-123');
        expect(form.get('remoteip')).toBe('203.0.113.7');

        const rows = h.db.rows<Row>('SELECT * FROM interview_requests');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            id: body.data.id,
            name: 'Ada Lovelace',
            email: 'ada@example.com',
        });

        await Promise.all(h.waitUntil);
        expect(h.sent).toHaveLength(1);
        expect(h.sent[0]!.to).toBe('owner@example.com');
        expect(h.sent[0]!.from).toBe('api@faheemnaeem.dev');
        expect(h.sent[0]!.raw).toContain('Reply-To: <ada@example.com>');
    });

    it('accepts subdomain origins and requests without an Origin (curl)', async () => {
        mockTurnstile(true);
        const h = harness();
        const sub = await h.request(
            PATH,
            post(validBody, { Origin: 'https://status.faheemnaeem.dev' }),
        );
        expect(sub.status).toBe(201);
        const init = post(validBody);
        delete (init.headers as Record<string, string>).Origin;
        expect((await h.request(PATH, init)).status).toBe(201);
    });

    it('answers a POST preflight only for faheemnaeem.dev origins', async () => {
        const h = harness();
        const ok = await h.request(PATH, {
            method: 'OPTIONS',
            headers: {
                Origin: 'https://ctf.faheemnaeem.dev',
                'Access-Control-Request-Method': 'POST',
            },
        });
        expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(
            'https://ctf.faheemnaeem.dev',
        );
        expect(ok.headers.get('Access-Control-Allow-Methods')).toContain(
            'POST',
        );
        const bad = await h.request(PATH, {
            method: 'OPTIONS',
            headers: {
                Origin: 'https://evil.example',
                'Access-Control-Request-Method': 'POST',
            },
        });
        expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
});

describe('POST /v1/interview-requests: rejections', () => {
    it.each([
        ['https://evil.example'],
        ['https://faheemnaeem.dev.evil.example'],
        ['http://faheemnaeem.dev'],
        ['https://a.b.faheemnaeem.dev'],
    ])('403s origin %s before touching D1 or Turnstile', async (origin) => {
        const fetchSpy = mockTurnstile(true);
        const h = harness();
        const res = await h.request(PATH, post(validBody, { Origin: origin }));
        expect(res.status).toBe(403);
        expect(((await res.json()) as Row).error).toMatchObject({
            code: 'FORBIDDEN_ORIGIN',
        });
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(h.db.rows('SELECT * FROM rate_limits')).toHaveLength(0);
    });

    it.each([
        ['missing fields', { name: 'Ada' }, 'email'],
        ['bad email', { ...validBody, email: 'not-an-email' }, 'email'],
        ['short message', { ...validBody, message: 'hi' }, 'message'],
        ['unknown field', { ...validBody, admin: true }, '(root)'],
        [
            'missing token',
            { ...validBody, turnstileToken: undefined },
            'turnstileToken',
        ],
    ])('400s on %s', async (_label, body, path) => {
        const fetchSpy = mockTurnstile(true);
        const h = harness();
        const res = await h.request(PATH, post(body));
        expect(res.status).toBe(400);
        const err = (
            (await res.json()) as {
                error: { code: string; details: { path: string }[] };
            }
        ).error;
        expect(err.code).toBe('VALIDATION_ERROR');
        expect(err.details.map((d) => d.path)).toContain(path);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(h.db.rows('SELECT * FROM interview_requests')).toHaveLength(0);
    });

    it('400s on malformed JSON with the error shape', async () => {
        const res = await harness().request(PATH, post('{not json'));
        expect(res.status).toBe(400);
        expect(((await res.json()) as Row).error).toMatchObject({
            code: 'BAD_REQUEST',
        });
    });

    it('413s on bodies over 16 KB', async () => {
        const res = await harness().request(
            PATH,
            post({ ...validBody, message: 'x'.repeat(20_000) }),
        );
        expect(res.status).toBe(413);
        expect(((await res.json()) as Row).error).toMatchObject({
            code: 'PAYLOAD_TOO_LARGE',
        });
    });

    it('403s when Turnstile fails and stores nothing', async () => {
        mockTurnstile(false);
        const h = harness();
        const res = await h.request(PATH, post(validBody));
        expect(res.status).toBe(403);
        expect(((await res.json()) as Row).error).toMatchObject({
            code: 'TURNSTILE_FAILED',
        });
        expect(h.db.rows('SELECT * FROM interview_requests')).toHaveLength(0);
    });

    it('403s when Turnstile is unreachable', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
        const res = await harness().request(PATH, post(validBody));
        expect(res.status).toBe(403);
    });

    it('503s when TURNSTILE_SECRET is not set', async () => {
        const res = await harness({ TURNSTILE_SECRET: undefined }).request(
            PATH,
            post(validBody),
        );
        expect(res.status).toBe(503);
        expect(((await res.json()) as Row).error).toMatchObject({
            code: 'NOT_CONFIGURED',
        });
    });
});

describe('POST /v1/interview-requests: rate limit (5/hour/IP)', () => {
    it('allows 5 per hour, then 429s with Retry-After, and resets next hour', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-17T10:15:00Z'));
        mockTurnstile(true);
        const h = harness();
        for (let i = 0; i < 5; i++) {
            expect((await h.request(PATH, post(validBody))).status).toBe(201);
        }
        const blocked = await h.request(PATH, post(validBody));
        expect(blocked.status).toBe(429);
        expect(blocked.headers.get('Retry-After')).toBe(String(45 * 60));
        expect(blocked.headers.get('RateLimit-Remaining')).toBe('0');
        expect(((await blocked.json()) as Row).error).toMatchObject({
            code: 'RATE_LIMITED',
        });
        expect(h.db.rows('SELECT * FROM interview_requests')).toHaveLength(5);

        // Another IP is unaffected.
        const other = await h.request(
            PATH,
            post(validBody, { 'CF-Connecting-IP': '198.51.100.9' }),
        );
        expect(other.status).toBe(201);

        // Next window.
        vi.setSystemTime(new Date('2026-11-17T11:00:01Z'));
        expect((await h.request(PATH, post(validBody))).status).toBe(201);
    });

    it('never stores raw IPs and cleans up old windows', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-17T10:00:00Z'));
        mockTurnstile(true);
        const h = harness();
        await h.request(PATH, post(validBody));
        vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
        await h.request(PATH, post(validBody));
        const rows = h.db.rows<{ key: string }>('SELECT key FROM rate_limits');
        expect(rows).toHaveLength(1);
        expect(rows[0]!.key).toBe(await hashIp('203.0.113.7', 'test-salt'));
        expect(rows[0]!.key).toMatch(/^[0-9a-f]{64}$/);
        const dump = JSON.stringify([
            h.db.rows('SELECT * FROM rate_limits'),
            h.db.rows('SELECT * FROM interview_requests'),
        ]);
        expect(dump).not.toContain('203.0.113.7');
    });

    it('hitRateLimit counts atomically per window', async () => {
        const db = new FakeD1().asD1();
        const opts = { limit: 2, windowSeconds: 60, now: 120_000 };
        expect((await hitRateLimit(db, 'k', opts)).allowed).toBe(true);
        expect((await hitRateLimit(db, 'k', opts)).remaining).toBe(0);
        const third = await hitRateLimit(db, 'k', opts);
        expect(third.allowed).toBe(false);
        expect(third.retryAfter).toBe(60);
    });
});

describe('email notification', () => {
    it('still returns 201 and keeps the row when sending fails', async () => {
        mockTurnstile(true);
        const failing = {
            send: vi
                .fn()
                .mockRejectedValue(new Error('destination not verified')),
        };
        const h = harness({ SEND_EMAIL: failing as unknown as SendEmail });
        const res = await h.request(PATH, post(validBody));
        expect(res.status).toBe(201);
        await Promise.all(h.waitUntil);
        expect(failing.send).toHaveBeenCalledOnce();
        expect(h.db.rows('SELECT * FROM interview_requests')).toHaveLength(1);
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('notify_failed'),
        );
    });

    it('skips sending (and logs) while NOTIFY_EMAIL is the placeholder', async () => {
        mockTurnstile(true);
        const h = harness({ NOTIFY_EMAIL: '<YOUR_EMAIL>' });
        expect((await h.request(PATH, post(validBody))).status).toBe(201);
        await Promise.all(h.waitUntil);
        expect(h.sent).toHaveLength(0);
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('notify_skipped'),
        );
    });

    it('skips email silently without a SEND_EMAIL binding but stores the row', async () => {
        mockTurnstile(true);
        const h = harness({ SEND_EMAIL: undefined });
        expect((await h.request(PATH, post(validBody))).status).toBe(201);
        await Promise.all(h.waitUntil);
        expect(h.sent).toHaveLength(0);
        expect(h.db.rows('SELECT * FROM interview_requests')).toHaveLength(1);
        expect(console.error).not.toHaveBeenCalled();
    });

    it('builds a MIME message that user input cannot inject headers into', () => {
        const raw = buildRawEmail('api@faheemnaeem.dev', 'owner@example.com', {
            id: '00000000-0000-4000-8000-000000000000',
            createdAt: '2026-11-17T10:00:00.000Z',
            name: 'Eve',
            company: 'Acme\r\nBcc: victim@example.com',
            email: 'eve@example.com',
            role: 'Engineer',
            message: 'Hello there, long enough.',
        });
        const headers = raw.split('\r\n\r\n')[0]!;
        expect(headers).not.toMatch(/^Bcc:/im);
        expect(headers).toContain(
            'Subject: Interview request: Engineer at Acme Bcc: victim@example.com',
        );
        expect(headers).toContain('Content-Transfer-Encoding: base64');
    });
});
