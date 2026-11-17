import { getCareer, getResume } from '@faheem/data';
import type { APIRoute } from 'astro';
import { buildChangelogJson } from '../lib/changelog';

export const GET: APIRoute = ({ site }) => {
    if (!site) throw new Error('`site` must be set in astro.config.mjs');
    const body = buildChangelogJson(
        getCareer(),
        site.toString(),
        `${getResume().name} changelog`,
    );
    return new Response(JSON.stringify(body, null, 2), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
};
