import type { OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from '../env';
import { jsonError } from '../lib/errors';

/**
 * Hidden step of the ctf.faheemnaeem.dev puzzle hunt.
 *
 * Registered as a plain Hono route (not an OpenAPI route) so it does not
 * appear in /openapi.json or /docs. The flag comes from the CTF_FLAG secret;
 * it is never stored in the repository.
 */
export const CTF_PATH = '/v1/ctf/rabbit-hole';
export const CTF_HEADER = 'X-Curious';

export function ctfRoutes(app: OpenAPIHono<AppEnv>) {
    app.get(CTF_PATH, (c) => {
        // The answer depends on a request header, so never cache it.
        c.header('Cache-Control', 'no-store');
        c.header('Vary', CTF_HEADER);
        const curious = (c.req.header(CTF_HEADER) ?? '').trim().toLowerCase();
        if (curious !== 'true') {
            return jsonError(
                c,
                403,
                'NOT_CURIOUS_ENOUGH',
                'So close. This door only opens for the curious.',
            );
        }
        const flag = c.env.CTF_FLAG;
        if (!flag) {
            return jsonError(
                c,
                503,
                'CTF_NOT_CONFIGURED',
                'The flag is not configured yet. Try again later.',
            );
        }
        return c.json({
            flag,
            next: 'Submit it at https://ctf.faheemnaeem.dev to join the Hall of Fame.',
        });
    });
}
