import type { APIRoute } from 'astro';
import { loadReports } from '../lib/load';
import { latestReport } from '../lib/report';

export const GET: APIRoute = () => {
    const report = latestReport(loadReports()) ?? null;
    return new Response(`${JSON.stringify(report, null, 2)}\n`, {
        headers: { 'content-type': 'application/json; charset=utf-8' },
    });
};
