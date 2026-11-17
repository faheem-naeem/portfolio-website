import { describe, expect, it } from 'vitest';
import {
    commitUrl,
    compareUrl,
    formatDate,
    resolvedIssues,
    scoreBand,
    selectReports,
    sitePassesAA,
    siteTrend,
    sparklinePoints,
    summarizeReport,
    totalTrend,
    wcagName,
    wcagUrl,
    type Report,
    type SiteResult,
    type Violation,
} from '../src/lib/report';

function violation(id: string, impact: Violation['impact']): Violation {
    return { id, impact, help: id, description: '', helpUrl: '', wcag: [], level: null, nodes: 1, targets: [], runs: ['desktop-light'] };
}

function site(id: string, violations: Violation[] | null, a11y = 100): SiteResult {
    return {
        id,
        url: `https://${id}.faheemnaeem.dev`,
        title: id,
        status: violations ? 'ok' : 'not-deployed',
        httpStatus: violations ? 200 : null,
        lighthouse: violations ? { performance: 90, accessibility: a11y, bestPractices: 100, seo: 100 } : null,
        axe: violations ? { runs: [], violations } : null,
        errors: [],
    };
}

function report(date: string, sites: SiteResult[], opts: { sample?: boolean; commit?: string } = {}): Report {
    return {
        schemaVersion: 1,
        sample: opts.sample ?? false,
        date,
        generatedAt: `${date}T06:00:00.000Z`,
        source: { repository: 'o/r', commit: opts.commit ?? null, runUrl: null },
        tools: {},
        config: { viewports: [], colorSchemes: ['light', 'dark'], axeTags: [], lighthouseCategories: [], lighthouseFormFactor: 'mobile' },
        sites,
    };
}

describe('selectReports', () => {
    it('sorts oldest first and drops samples once a real report exists', () => {
        const seed = report('2026-11-16', [], { sample: true });
        const a = report('2026-11-30', []);
        const b = report('2026-11-23', []);
        expect(selectReports([seed]).map((r) => r.date)).toEqual(['2026-11-16']);
        expect(selectReports([a, seed, b]).map((r) => r.date)).toEqual(['2026-11-23', '2026-11-30']);
    });
});

describe('badge', () => {
    it('requires 0 serious/critical and at least one audited site', () => {
        const ok = report('2026-11-16', [site('web', [violation('region', 'moderate')]), site('ctf', null)]);
        expect(summarizeReport(ok)).toMatchObject({ audited: 1, notDeployed: 1, passesAA: true });
        expect(summarizeReport(ok).counts.total).toBe(1);

        const bad = report('2026-11-16', [site('web', [violation('color-contrast', 'serious')])]);
        expect(summarizeReport(bad).passesAA).toBe(false);
        expect(sitePassesAA(bad.sites[0]!)).toBe(false);

        const nothing = report('2026-11-16', [site('ctf', null)]);
        expect(summarizeReport(nothing).passesAA).toBe(false);
        expect(sitePassesAA(nothing.sites[0]!)).toBe(false);
    });
});

describe('trends', () => {
    const reports = [
        report('2026-11-02', [site('web', [violation('a', 'minor'), violation('b', 'serious')], 90)], { commit: 'aaaaaaa' }),
        report('2026-11-09', [site('web', null)]),
        report('2026-11-16', [site('web', [violation('a', 'minor')], 100)], { commit: 'bbbbbbb' }),
    ];

    it('skips audits where the site was not deployed', () => {
        expect(siteTrend(reports, 'web', (s) => s.lighthouse?.accessibility)).toEqual([
            { date: '2026-11-02', value: 90 },
            { date: '2026-11-16', value: 100 },
        ]);
        expect(totalTrend(reports).map((p) => p.value)).toEqual([2, 1]);
    });

    it('lists issues that disappeared between consecutive audits', () => {
        const consecutive = [reports[0]!, reports[2]!];
        expect(resolvedIssues(consecutive, 'web')).toEqual([
            {
                id: 'b',
                help: 'b',
                impact: 'serious',
                lastSeen: '2026-11-02',
                resolvedOn: '2026-11-16',
                compareUrl: 'https://github.com/o/r/compare/aaaaaaa...bbbbbbb',
            },
        ]);
        // A not-deployed audit in between breaks the comparison rather than claiming a fix.
        expect(resolvedIssues(reports, 'web')).toEqual([]);
    });

    it('builds sparkline points within the box', () => {
        expect(sparklinePoints([], 100, 20)).toBe('');
        expect(sparklinePoints([50], 100, 20, { min: 0, max: 100 })).toBe('50,10');
        expect(sparklinePoints([0, 100], 100, 20, { min: 0, max: 100 })).toBe('2,18 98,2');
        expect(sparklinePoints([5, 5], 100, 20)).toBe('2,18 98,18');
    });
});

describe('formatting', () => {
    it('labels scores using Lighthouse bands', () => {
        expect(scoreBand(95)).toBe('good');
        expect(scoreBand(50)).toBe('average');
        expect(scoreBand(49)).toBe('poor');
        expect(scoreBand(null)).toBe('none');
    });

    it('builds links', () => {
        expect(compareUrl('o/r', 'a', 'a')).toBeNull();
        expect(compareUrl(null, 'a', 'b')).toBeNull();
        expect(commitUrl('o/r', 'abc1234')).toBe('https://github.com/o/r/commit/abc1234');
        expect(commitUrl('o/r', 'https://example.test/c')).toBe('https://example.test/c');
        expect(commitUrl('o/r', 'not a sha')).toBeNull();
        expect(wcagUrl('1.4.3')).toBe('https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum');
        expect(wcagUrl('4.1.2')).toBe('https://www.w3.org/WAI/WCAG22/Understanding/name-role-value');
        expect(wcagUrl('9.9.9')).toBeNull();
        expect(wcagName('2.5.8')).toBe('Target Size (Minimum)');
    });

    it('formats dates without locale dependence', () => {
        expect(formatDate('2026-11-16')).toBe('16 Nov 2026');
    });
});
