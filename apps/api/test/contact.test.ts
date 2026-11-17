import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getResume } from '@faheem/data';
import {
    CONTACT_CSP,
    CONTACT_JS,
    CONTACT_JS_URL,
    TURNSTILE_SCRIPT,
} from '../src/routes/contact';
import { harness, mockTurnstile } from './helpers';

const SITE_KEY = '0x4AAAAAAGF8dZt1jqFYAKMT';
const PATH = '/v1/interview-requests';

type Row = Record<string, unknown>;

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
});

function formPost(
    fields: Record<string, string>,
    headers: Record<string, string> = {},
): RequestInit {
    return {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Origin: 'https://api.faheemnaeem.dev',
            'CF-Connecting-IP': '203.0.113.9',
            ...headers,
        },
        body: new URLSearchParams(fields).toString(),
    };
}

const validForm = {
    name: 'Ada Lovelace',
    company: 'Analytical Engines',
    email: 'ada@example.com',
    role: 'Senior Engineer',
    message: 'We would love to talk about a backend role.',
    'cf-turnstile-response': 'token-abc',
};

describe('GET /contact', () => {
    it('renders an accessible form with the Turnstile widget', async () => {
        const res = await harness({ TURNSTILE_SITE_KEY: SITE_KEY }).request(
            '/contact',
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/html');
        const html = await res.text();
        expect(html).toContain('<html lang="en">');
        expect(html).toContain(
            '<h1 id="contact-title">Request an interview</h1>',
        );
        expect(html).toContain(
            '<form id="contact-form" class="contact-form" action="/v1/interview-requests" method="post">',
        );
        for (const id of ['name', 'company', 'email', 'role', 'message']) {
            expect(html).toContain(`<label for="${id}">`);
            expect(html).toMatch(new RegExp(`id="${id}" name="${id}"`));
        }
        expect(html).toContain('type="email" autocomplete="email" required');
        expect(html).toContain('role="status" aria-live="polite"');
        expect(html).toContain(`data-sitekey="${SITE_KEY}"`);
        expect(html).toContain(
            `<script src="${TURNSTILE_SCRIPT}" async defer>`,
        );
        expect(html).toContain(`<script src="${CONTACT_JS_URL}" defer>`);
        expect(html).toContain(`mailto:${getResume().links.email}`);
        // No inline scripts: every <script> has a src.
        expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/i);
    });

    it('sets a CSP that only allows Turnstile as a third party', async () => {
        const res = await harness({ TURNSTILE_SITE_KEY: SITE_KEY }).request(
            '/contact',
        );
        const csp = res.headers.get('Content-Security-Policy');
        expect(csp).toBe(CONTACT_CSP);
        expect(csp).toContain(
            "script-src 'self' https://challenges.cloudflare.com",
        );
        expect(csp).toContain('frame-src https://challenges.cloudflare.com');
        expect(csp).toContain("form-action 'self'");
        // Cloudflare Web Analytics beacon is allowed.
        expect(csp).toMatch(
            /script-src [^;]*https:\/\/static\.cloudflareinsights\.com/,
        );
        expect(csp).toMatch(
            /connect-src 'self'[^;]* https:\/\/cloudflareinsights\.com/,
        );
        expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(res.headers.get('Strict-Transport-Security')).toContain(
            'max-age=',
        );
    });

    it('explains that the form is unavailable without a site key', async () => {
        const html = await (
            await harness({ TURNSTILE_SITE_KEY: undefined }).request('/contact')
        ).text();
        expect(html).not.toContain('data-sitekey');
        expect(html).not.toContain(TURNSTILE_SCRIPT);
        expect(html).toContain('bot check is not configured');
    });

    it('serves contact.js, which posts JSON with the Turnstile token', async () => {
        const res = await harness().request('/contact.js');
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/javascript');
        const js = await res.text();
        expect(js).toBe(CONTACT_JS);
        expect(js).toContain("'Content-Type': 'application/json'");
        expect(js).toContain('turnstileToken: token');
        expect(js).toContain("data.get('cf-turnstile-response')");
    });
});

describe('POST /v1/interview-requests (form-encoded, no JS)', () => {
    it('stores the request and renders a thank-you page', async () => {
        const fetchSpy = mockTurnstile(true);
        const h = harness({ SEND_EMAIL: undefined });
        const res = await h.request(PATH, formPost(validForm));
        expect(res.status).toBe(201);
        expect(res.headers.get('Content-Type')).toContain('text/html');
        expect(res.headers.get('Content-Security-Policy')).toBe(CONTACT_CSP);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        const html = await res.text();
        expect(html).toContain('<h1 id="result-title">Thank you</h1>');
        expect(html).toContain('Your request is in');

        const form = (fetchSpy.mock.calls[0]![1] as RequestInit)
            .body as FormData;
        expect(form.get('response')).toBe('token-abc');

        const rows = h.db.rows<Row>('SELECT * FROM interview_requests');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            name: 'Ada Lovelace',
            email: 'ada@example.com',
        });
        await Promise.all(h.waitUntil);
        expect(h.sent).toHaveLength(0);
    });

    it('renders a 400 page for invalid fields and stores nothing', async () => {
        const h = harness();
        const res = await h.request(
            PATH,
            formPost({ ...validForm, email: 'not-an-email', message: 'short' }),
        );
        expect(res.status).toBe(400);
        const html = await res.text();
        expect(html).toContain('Your request was not sent');
        expect(html).toContain('Enter a valid email address.');
        expect(html).toContain('role="alert"');
        expect(h.db.rows('SELECT * FROM interview_requests')).toHaveLength(0);
    });

    it('asks for the bot check when the Turnstile token is missing', async () => {
        const noToken: Record<string, string> = { ...validForm };
        delete noToken['cf-turnstile-response'];
        const res = await harness().request(PATH, formPost(noToken));
        expect(res.status).toBe(400);
        expect(await res.text()).toContain('Complete the bot check');
    });

    it('renders a 403 page when Turnstile rejects the token', async () => {
        mockTurnstile(false);
        const h = harness();
        const res = await h.request(PATH, formPost(validForm));
        expect(res.status).toBe(403);
        expect(await res.text()).toContain('Bot check failed');
        expect(h.db.rows('SELECT * FROM interview_requests')).toHaveLength(0);
    });

    it('still rejects foreign origins before parsing the form', async () => {
        const res = await harness().request(
            PATH,
            formPost(validForm, { Origin: 'https://evil.example' }),
        );
        expect(res.status).toBe(403);
        expect(
            ((await res.json()) as { error: { code: string } }).error.code,
        ).toBe('FORBIDDEN_ORIGIN');
    });

    it('never echoes user input into the result page', async () => {
        const res = await harness().request(
            PATH,
            formPost({ ...validForm, name: '<b>x</b>', message: 'short' }),
        );
        expect(res.status).toBe(400);
        expect(await res.text()).not.toContain('<b>x</b>');
    });
});
