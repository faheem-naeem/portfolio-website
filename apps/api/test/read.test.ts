import { getFunFacts, getProjects, getResume } from '@faheem/data';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { harness } from './helpers';

afterEach(() => vi.restoreAllMocks());

async function json(res: Response) {
    return (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('GET /v1/profile', () => {
    it('returns the profile without an email field', async () => {
        const res = await harness().request('/v1/profile');
        expect(res.status).toBe(200);
        const body = await json(res);
        expect(body.data.name).toBe(getResume().name);
        expect(body.data.links.linkedin).toBe(getResume().links.linkedin);
        expect(body.data.links).not.toHaveProperty('email');
    });
});

describe('GET /v1/skills', () => {
    it('lists every skill', async () => {
        const body = await json(await harness().request('/v1/skills'));
        const total = getResume().skills.reduce(
            (n, g) => n + g.items.length,
            0,
        );
        expect(body.meta.count).toBe(total);
        expect(body.data).toHaveLength(total);
    });

    it('filters by level and case-insensitive name', async () => {
        const all = getResume().skills.flatMap((g) => g.items);
        const target = all.find((s) => s.level === 'expert')!;
        const q = target.name.slice(0, 3);
        const expected = all.filter(
            (s) =>
                s.level === 'expert' &&
                s.name.toLowerCase().includes(q.toLowerCase()),
        );
        const body = await json(
            await harness().request(
                `/v1/skills?level=expert&q=${encodeURIComponent(q.toUpperCase())}`,
            ),
        );
        expect(body.data.map((s: { name: string }) => s.name)).toEqual(
            expected.map((s) => s.name),
        );
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('rejects an unknown level with the error shape', async () => {
        const res = await harness().request('/v1/skills?level=wizard');
        expect(res.status).toBe(400);
        const body = await json(res);
        expect(body.error.code).toBe('VALIDATION_ERROR');
        expect(body.error.details[0].path).toBe('level');
    });
});

describe('GET /v1/experience', () => {
    it('lists roles with indexes', async () => {
        const body = await json(await harness().request('/v1/experience'));
        expect(body.data).toHaveLength(getResume().experience.length);
        expect(body.data[0].index).toBe(0);
        expect(body.data[0].company).toBe(getResume().experience[0]!.company);
    });

    it('returns one role by index', async () => {
        const res = await harness().request('/v1/experience/1');
        expect(res.status).toBe(200);
        expect((await json(res)).data.role).toBe(
            getResume().experience[1]!.role,
        );
    });

    it('404s past the end', async () => {
        const res = await harness().request('/v1/experience/99');
        expect(res.status).toBe(404);
        expect((await json(res)).error.code).toBe('NOT_FOUND');
    });

    it('400s on a non-integer index', async () => {
        const res = await harness().request('/v1/experience/-1');
        expect(res.status).toBe(400);
        expect((await json(res)).error.code).toBe('VALIDATION_ERROR');
    });
});

describe('GET /v1/projects', () => {
    it('lists all projects', async () => {
        const body = await json(await harness().request('/v1/projects'));
        expect(body.meta.count).toBe(getProjects().length);
    });

    it('filters by status and tech (case-insensitive)', async () => {
        const body = await json(
            await harness().request('/v1/projects?status=live&tech=typescript'),
        );
        expect(body.data.length).toBeGreaterThan(0);
        for (const p of body.data) {
            expect(p.status).toBe('live');
            expect(p.tech.map((t: string) => t.toLowerCase())).toContain(
                'typescript',
            );
        }
    });

    it('rejects an unknown status', async () => {
        const res = await harness().request('/v1/projects?status=dead');
        expect(res.status).toBe(400);
    });

    it('returns one project, 404s unknown ids and 400s bad ids', async () => {
        const h = harness();
        const id = getProjects()[0]!.id;
        expect(
            (await json(await h.request(`/v1/projects/${id}`))).data.id,
        ).toBe(id);
        const missing = await h.request('/v1/projects/nope');
        expect(missing.status).toBe(404);
        expect((await json(missing)).error.code).toBe('NOT_FOUND');
        expect((await h.request('/v1/projects/Bad_ID')).status).toBe(400);
    });
});

describe('fun endpoints', () => {
    it('random-fact picks from @faheem/data and is not cached', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const res = await harness().request('/v1/random-fact');
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect((await json(res)).data).toEqual(getFunFacts()[0]);
    });

    it('hire-me returns 200 with contact links', async () => {
        const res = await harness().request('/v1/hire-me');
        expect(res.status).toBe(200);
        const body = await json(res);
        expect(body.data.available).toBe(true);
        expect(body.data.contact.linkedin).toBe(getResume().links.linkedin);
        expect(body.data.contact.email).toBe(getResume().links.email);
        expect(body.data.contact.contactForm).toBe('/contact');
        expect(JSON.stringify(body)).not.toMatch(/<[A-Z_]+>/);
    });

    it("teapot is 418 I'm a teapot", async () => {
        const res = await harness().request('/teapot');
        expect(res.status).toBe(418);
        expect((await json(res)).error.code).toBe('IM_A_TEAPOT');
    });
});

describe('cross-cutting', () => {
    it('unknown routes use the error shape', async () => {
        const res = await harness().request('/v2/nothing');
        expect(res.status).toBe(404);
        expect(await json(res)).toEqual({
            error: {
                code: 'NOT_FOUND',
                message: 'No route for GET /v2/nothing',
            },
        });
    });

    it('sets ETag and Cache-Control on GETs and answers 304', async () => {
        const h = harness();
        const res = await h.request('/v1/profile');
        const tag = res.headers.get('ETag');
        expect(tag).toBeTruthy();
        expect(res.headers.get('Cache-Control')).toBe(
            'public, max-age=300, s-maxage=3600',
        );
        const again = await h.request('/v1/profile', {
            headers: { 'If-None-Match': tag! },
        });
        expect(again.status).toBe(304);
    });

    it('does not cache errors', async () => {
        const res = await harness().request('/v1/projects/nope');
        expect(res.headers.get('Cache-Control')).toBe('no-store');
    });

    it('allows GET from any origin', async () => {
        const res = await harness().request('/v1/skills', {
            headers: { Origin: 'https://example.com' },
        });
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('answers GET preflights for any origin', async () => {
        const res = await harness().request('/v1/skills', {
            method: 'OPTIONS',
            headers: {
                Origin: 'https://example.com',
                'Access-Control-Request-Method': 'GET',
            },
        });
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('sets security headers', async () => {
        const res = await harness().request('/v1/profile');
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(res.headers.get('Strict-Transport-Security')).toContain(
            'max-age=',
        );
        expect(res.headers.get('Referrer-Policy')).toBe(
            'strict-origin-when-cross-origin',
        );
        expect(res.headers.get('Content-Security-Policy')).toContain(
            "default-src 'none'",
        );
    });
});
