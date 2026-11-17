import { describe, expect, it } from 'vitest';
import { HTML_CSP } from '../src/app';
import { CTF_JS } from '../src/assets';
import { STEPS } from '../src/content';
import { harness, NOW, postForm, postJson, TEST_FLAG } from './helpers';

async function json(res: Response) {
    return (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type Row = {
    display_name: string | null;
    approved: number;
    created_at: string;
};

describe('GET /', () => {
    it('renders the landing page with strict security headers', async () => {
        const res = await harness().request('/');
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/html');
        expect(res.headers.get('Content-Security-Policy')).toBe(HTML_CSP);
        expect(HTML_CSP).not.toContain('unsafe-inline');
        expect(res.headers.get('Strict-Transport-Security')).toContain(
            'max-age=',
        );
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(res.headers.get('Referrer-Policy')).toBe(
            'strict-origin-when-cross-origin',
        );
        const html = await res.text();
        expect(html).toContain('<h1>Find the flag</h1>');
        expect(html).toContain('<script src="/assets/ctf.js" defer></script>');
        expect(html).not.toMatch(/<script>|<style>/);
        expect(html).toContain('aria-current="page"');
    });

    it('shows a 5-step map with one <details> hint per step (works without JS)', async () => {
        const html = await (await harness().request('/')).text();
        expect(STEPS).toHaveLength(5);
        expect(html.match(/data-step="\d"/g)).toHaveLength(5);
        expect(html.match(/<details class="hint">/g)).toHaveLength(5);
        for (const step of STEPS) expect(html).toContain(step.hint);
        expect(html).toContain('<form method="post" action="/submit">');
    });

    it('lists only approved Hall of Fame entries', async () => {
        const h = harness();
        h.db.sqlite
            .exec(`INSERT INTO hall_of_fame (id, display_name, created_at, approved) VALUES
            ('1', 'Approved Ada', '2026-11-01T00:00:00.000Z', 1),
            ('2', 'Pending Pat', '2026-11-02T00:00:00.000Z', 0),
            ('3', NULL, '2026-11-03T00:00:00.000Z', 1)`);
        const html = await (await h.request('/')).text();
        expect(html).toContain('Approved Ada');
        expect(html).toContain('Anonymous solver');
        expect(html).not.toContain('Pending Pat');
    });
});

describe('static assets', () => {
    it('serves CSS and JS with correct types', async () => {
        const h = harness();
        const css = await h.request('/assets/ctf.css');
        expect(css.headers.get('Content-Type')).toContain('text/css');
        const ui = await h.request('/assets/ui.css');
        expect(await ui.text()).toContain('--color-bg');
        const js = await h.request('/assets/ctf.js');
        expect(js.headers.get('Content-Type')).toContain('text/javascript');
        expect(await js.text()).toBe(CTF_JS);
    });

    it('ships valid JavaScript', () => {
        expect(() => new Function(CTF_JS)).not.toThrow();
    });
});

describe('POST /submit (JSON)', () => {
    it('accepts the correct flag and stores an unapproved entry', async () => {
        const h = harness({ CONTACT_URL: 'https://example.com/book' });
        const res = await h.request(
            '/submit',
            postJson({ flag: TEST_FLAG, name: 'Ada' }),
        );
        expect(res.status).toBe(200);
        const body = await json(res);
        expect(body).toMatchObject({
            ok: true,
            contact: 'https://example.com/book',
            hallOfFame: 'pending_review',
        });
        const rows = h.db.rows<Row>(
            'SELECT display_name, approved, created_at FROM hall_of_fame',
        );
        expect(rows).toEqual([
            {
                display_name: 'Ada',
                approved: 0,
                created_at: new Date(NOW).toISOString(),
            },
        ]);
    });

    it('stores anonymous entries when no name is given', async () => {
        const h = harness();
        const res = await h.request('/submit', postJson({ flag: TEST_FLAG }));
        expect((await json(res)).hallOfFame).toBe('anonymous');
        expect(h.db.rows<Row>('SELECT display_name FROM hall_of_fame')).toEqual(
            [{ display_name: null }],
        );
    });

    it('rejects a wrong flag without storing anything', async () => {
        const h = harness();
        const res = await h.request(
            '/submit',
            postJson({ flag: 'FAHEEM{guess}' }),
        );
        expect(res.status).toBe(400);
        const body = await json(res);
        expect(body.error.code).toBe('WRONG_FLAG');
        expect(body.error.message).toContain('9 attempts left');
        expect(h.db.rows('SELECT * FROM hall_of_fame')).toHaveLength(0);
    });

    it('rejects profane or too-long names before checking the flag', async () => {
        const h = harness();
        for (const name of ['fuck', 'x'.repeat(25)]) {
            const res = await h.request(
                '/submit',
                postJson({ flag: TEST_FLAG, name }),
            );
            expect(res.status).toBe(400);
            expect((await json(res)).error.code).toBe('INVALID_NAME');
        }
        expect(h.db.rows('SELECT * FROM hall_of_fame')).toHaveLength(0);
        expect(h.db.rows('SELECT * FROM rate_limits')).toHaveLength(0);
    });

    it('validates the body', async () => {
        const h = harness();
        expect((await h.request('/submit', postJson({}))).status).toBe(400);
        expect((await h.request('/submit', postJson('not json'))).status).toBe(
            415,
        );
        expect(
            (await h.request('/submit', postJson({ flag: 'x'.repeat(201) })))
                .status,
        ).toBe(400);
        const text = await h.request('/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: 'hi',
        });
        expect(text.status).toBe(415);
        const big = await h.request(
            '/submit',
            postJson({ flag: 'x'.repeat(5000) }),
        );
        expect(big.status).toBe(413);
    });

    it('answers 503 when FLAG_HASH is not configured', async () => {
        const res = await harness({ FLAG_HASH: undefined }).request(
            '/submit',
            postJson({ flag: TEST_FLAG }),
        );
        expect(res.status).toBe(503);
    });

    it('rate limits to 10 attempts per hour per IP, with a salted hash key', async () => {
        const h = harness();
        for (let i = 0; i < 10; i++) {
            const res = await h.request(
                '/submit',
                postJson({ flag: `FAHEEM{guess-${i}}` }),
            );
            expect(res.status).toBe(400);
        }
        const blocked = await h.request(
            '/submit',
            postJson({ flag: TEST_FLAG }),
        );
        expect(blocked.status).toBe(429);
        expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
        expect(h.db.rows('SELECT * FROM hall_of_fame')).toHaveLength(0);

        // Another IP is unaffected.
        const other = await h.request(
            '/submit',
            postJson({ flag: TEST_FLAG }, '198.51.100.9'),
        );
        expect(other.status).toBe(200);

        // The raw IP is never stored.
        const keys = h.db.rows<{ key: string }>('SELECT key FROM rate_limits');
        expect(keys).toHaveLength(2);
        for (const { key } of keys) {
            expect(key).toMatch(/^[0-9a-f]{64}$/);
            expect(key).not.toContain('203.0.113.7');
        }

        // Next hour the limit resets.
        h.clock.now += 3600 * 1000;
        const later = await h.request('/submit', postJson({ flag: TEST_FLAG }));
        expect(later.status).toBe(200);
    });
});

describe('POST /submit (HTML form, no JS)', () => {
    it('shows the success page with the contact call to action', async () => {
        const h = harness();
        const res = await h.request(
            '/submit',
            postForm({ flag: TEST_FLAG, name: 'Grace' }),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/html');
        const html = await res.text();
        expect(html).toContain("You'd fit right in. Let's talk.");
        expect(html).toContain('https://www.linkedin.com/in/');
        expect(html).toContain('Grace');
    });

    it('re-renders the form with an error and escapes user input', async () => {
        const res = await harness().request(
            '/submit',
            postForm({ flag: '"><script>x</script>' }),
        );
        expect(res.status).toBe(400);
        const html = await res.text();
        expect(html).toContain('role="alert"');
        expect(html).not.toContain('<script>x</script>');
        expect(html).toContain('&quot;&gt;&lt;script&gt;');
    });
});

describe('fallbacks', () => {
    it('returns an HTML 404 for unknown paths', async () => {
        const res = await harness().request('/nope');
        expect(res.status).toBe(404);
        expect(await res.text()).toContain('not part of the hunt');
    });
});
