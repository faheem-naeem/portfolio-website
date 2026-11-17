import { describe, expect, it, vi } from 'vitest';
import {
    buildReport,
    checkReachable,
    mergeAxeRuns,
    notDeployedEntry,
    parseArgs,
    reportDate,
    summarizeLighthouse,
    wcagCriteria,
    wcagLevel,
} from '../scripts/audit.mjs';
import { ReportSchema } from '../src/lib/report';

const contrast = {
    id: 'color-contrast',
    impact: 'serious',
    help: 'Elements must meet minimum color contrast ratio thresholds',
    description: 'Ensure contrast is sufficient',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/color-contrast',
    tags: ['cat.color', 'wcag2aa', 'wcag143'],
    nodes: [{ target: ['.a'] }, { target: ['.b'] }],
};
const region = {
    id: 'region',
    impact: 'moderate',
    help: 'All page content should be contained by landmarks',
    tags: ['best-practice'],
    nodes: [{ target: ['#x'] }],
};

describe('wcag helpers', () => {
    it('parses criteria from axe tags, including two-digit parts', () => {
        expect(wcagCriteria(['wcag2aa', 'wcag1410', 'wcag143', 'wcag21aa', 'best-practice'])).toEqual([
            '1.4.3',
            '1.4.10',
        ]);
        expect(wcagCriteria(['wcag258'])).toEqual(['2.5.8']);
        expect(wcagCriteria(undefined)).toEqual([]);
    });

    it('derives the conformance level', () => {
        expect(wcagLevel(['wcag2a', 'wcag111'])).toBe('A');
        expect(wcagLevel(['wcag22aa'])).toBe('AA');
        expect(wcagLevel(['best-practice'])).toBeNull();
    });
});

describe('mergeAxeRuns', () => {
    it('dedupes rules across runs and keeps per-run counts', () => {
        const merged = mergeAxeRuns([
            { viewport: 'desktop', width: 1280, colorScheme: 'light', violations: [region] },
            { viewport: 'mobile', width: 360, colorScheme: 'dark', violations: [region, contrast] },
            { viewport: 'mobile', width: 360, colorScheme: 'light', error: 'Timeout' },
        ]);
        expect(merged.runs.map((r: { violations: number | null }) => r.violations)).toEqual([1, 2, null]);
        expect(merged.runs[2]).toMatchObject({ error: 'Timeout' });
        // Sorted by impact: serious before moderate.
        expect(merged.violations.map((v: { id: string }) => v.id)).toEqual(['color-contrast', 'region']);
        const [c, r] = merged.violations;
        expect(c).toMatchObject({ wcag: ['1.4.3'], level: 'AA', nodes: 2, runs: ['mobile-dark'], targets: ['.a', '.b'] });
        expect(r).toMatchObject({ wcag: [], level: null, runs: ['desktop-light', 'mobile-dark'] });
    });

    it('treats unknown impact as minor', () => {
        const merged = mergeAxeRuns([
            { viewport: 'desktop', width: 1280, colorScheme: 'light', violations: [{ ...region, impact: null }] },
        ]);
        expect(merged.violations[0].impact).toBe('minor');
    });
});

describe('lighthouse summary', () => {
    it('converts 0-1 scores to integers and tolerates missing categories', () => {
        expect(
            summarizeLighthouse({
                categories: {
                    performance: { score: 0.734 },
                    accessibility: { score: 1 },
                    'best-practices': { score: null },
                },
            }),
        ).toEqual({ performance: 73, accessibility: 100, bestPractices: null, seo: null });
    });
});

describe('checkReachable', () => {
    it('treats 2xx as reachable', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({ status: 200 });
        await expect(checkReachable('https://faheemnaeem.dev', fetchImpl)).resolves.toEqual({
            reachable: true,
            httpStatus: 200,
        });
    });

    it('treats non-2xx as not deployed', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({ status: 522 });
        await expect(checkReachable('https://x.faheemnaeem.dev', fetchImpl)).resolves.toEqual({
            reachable: false,
            httpStatus: 522,
            reason: 'HTTP 522',
        });
    });

    it('treats DNS failures as not deployed instead of throwing', async () => {
        const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
        const fetchImpl = vi.fn().mockRejectedValue(err);
        const result = await checkReachable('https://ctf.faheemnaeem.dev', fetchImpl);
        expect(result).toEqual({ reachable: false, httpStatus: null, reason: 'DNS lookup failed' });
    });
});

describe('report building', () => {
    it('produces a report that the site schema accepts', () => {
        const site = { id: 'ctf', url: 'https://ctf.faheemnaeem.dev', title: 'CTF' };
        const report = buildReport({
            date: reportDate(new Date('2026-11-16T06:00:00Z')),
            generatedAt: '2026-11-16T06:10:00.000Z',
            sites: [
                notDeployedEntry(site, { reachable: false, httpStatus: null, reason: 'DNS lookup failed' }),
                {
                    id: 'web',
                    url: 'https://faheemnaeem.dev',
                    title: 'Home',
                    status: 'ok',
                    httpStatus: 200,
                    lighthouse: { performance: 80, accessibility: 100, bestPractices: 100, seo: 100 },
                    axe: mergeAxeRuns([
                        { viewport: 'desktop', width: 1280, colorScheme: 'light', violations: [contrast] },
                    ]),
                    errors: [],
                },
            ],
            source: { repository: 'o/r', commit: 'abc1234', runUrl: null },
            tools: { axeCore: '4.10.0', lighthouse: null },
        });
        expect(report.date).toBe('2026-11-16');
        expect(report.sample).toBe(false);
        expect(() => ReportSchema.parse(report)).not.toThrow();
    });

    it('parses CLI flags', () => {
        expect(parseArgs(['--sites', 'web, bugs', '--date', '2026-01-05'])).toEqual({
            sites: ['web', 'bugs'],
            out: null,
            date: '2026-01-05',
        });
        expect(() => parseArgs(['--date', 'yesterday'])).toThrow();
    });
});
