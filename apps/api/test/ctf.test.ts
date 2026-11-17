import { describe, expect, it } from 'vitest';
import { harness } from './helpers';

const PATH = '/v1/ctf/rabbit-hole';
const FLAG = 'FAHEEM{test-flag-not-real}';

async function json(res: Response) {
    return (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe(`GET ${PATH}`, () => {
    it('refuses without the X-Curious header', async () => {
        const res = await harness({ CTF_FLAG: FLAG }).request(PATH);
        expect(res.status).toBe(403);
        const body = await json(res);
        expect(body.error.code).toBe('NOT_CURIOUS_ENOUGH');
        expect(JSON.stringify(body)).not.toContain(FLAG);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
    });

    it('refuses when X-Curious is not "true"', async () => {
        const res = await harness({ CTF_FLAG: FLAG }).request(PATH, {
            headers: { 'X-Curious': 'nope' },
        });
        expect(res.status).toBe(403);
    });

    it('returns the flag from the CTF_FLAG secret with X-Curious: true', async () => {
        const res = await harness({ CTF_FLAG: FLAG }).request(PATH, {
            headers: { 'X-Curious': 'TRUE' },
        });
        expect(res.status).toBe(200);
        const body = await json(res);
        expect(body.flag).toBe(FLAG);
        expect(body.next).toContain('ctf.faheemnaeem.dev');
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(res.headers.get('Vary')).toContain('X-Curious');
    });

    it('answers 503 when CTF_FLAG is not configured', async () => {
        const res = await harness().request(PATH, {
            headers: { 'X-Curious': 'true' },
        });
        expect(res.status).toBe(503);
        expect((await json(res)).error.code).toBe('CTF_NOT_CONFIGURED');
    });

    it('is not listed in the OpenAPI document', async () => {
        const doc = await (await harness().request('/openapi.json')).text();
        expect(doc).not.toContain('rabbit-hole');
    });
});
