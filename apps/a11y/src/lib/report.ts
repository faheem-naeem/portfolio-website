// Report schema and pure helpers for the a11y site. Reports are written by
// scripts/audit.mjs; this file is the contract the site renders from.
import { z } from 'zod';

export const IMPACTS = ['critical', 'serious', 'moderate', 'minor'] as const;
export type Impact = (typeof IMPACTS)[number];

const score = z.number().int().min(0).max(100).nullable();

export const LighthouseSchema = z
    .object({
        performance: score,
        accessibility: score,
        bestPractices: score,
        seo: score,
    })
    .strict();

export const ViolationSchema = z
    .object({
        id: z.string().min(1),
        impact: z.enum(IMPACTS),
        help: z.string().min(1),
        description: z.string(),
        helpUrl: z.string(),
        wcag: z.array(z.string().regex(/^\d\.\d\.\d{1,2}$/)),
        level: z.enum(['A', 'AA', 'AAA']).nullable(),
        nodes: z.number().int().min(0),
        targets: z.array(z.string()),
        runs: z.array(z.string()).min(1),
        /** Optional hand-written note on how it was fixed (commit: SHA or URL). */
        fix: z
            .object({ note: z.string().min(1), commit: z.string().optional() })
            .strict()
            .optional(),
    })
    .strict();

export const AxeRunSchema = z
    .object({
        viewport: z.string(),
        width: z.number().int().positive(),
        colorScheme: z.enum(['light', 'dark']),
        violations: z.number().int().min(0).nullable(),
        error: z.string().optional(),
    })
    .strict();

export const SiteResultSchema = z
    .object({
        id: z.string().min(1),
        url: z.string().url(),
        title: z.string().min(1),
        status: z.enum(['ok', 'not-deployed', 'error']),
        httpStatus: z.number().int().nullable(),
        reason: z.string().optional(),
        lighthouse: LighthouseSchema.nullable(),
        axe: z
            .object({
                runs: z.array(AxeRunSchema),
                violations: z.array(ViolationSchema),
            })
            .strict()
            .nullable(),
        errors: z.array(z.string()),
    })
    .strict();

export const ReportSchema = z
    .object({
        schemaVersion: z.literal(1),
        sample: z.boolean(),
        note: z.string().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        generatedAt: z.string().datetime(),
        source: z
            .object({
                repository: z.string().nullable(),
                commit: z.string().nullable(),
                runUrl: z.string().nullable(),
            })
            .strict(),
        tools: z.record(z.string(), z.string().nullable()),
        config: z
            .object({
                viewports: z.array(
                    z.object({ name: z.string(), width: z.number() }).strict(),
                ),
                colorSchemes: z.array(z.enum(['light', 'dark'])),
                axeTags: z.array(z.string()),
                lighthouseCategories: z.array(z.string()),
                lighthouseFormFactor: z.enum(['mobile', 'desktop']),
            })
            .strict(),
        sites: z.array(SiteResultSchema),
    })
    .strict();

export type Report = z.infer<typeof ReportSchema>;
export type SiteResult = z.infer<typeof SiteResultSchema>;
export type Violation = z.infer<typeof ViolationSchema>;
export type LighthouseScores = z.infer<typeof LighthouseSchema>;
export type Metric = keyof LighthouseScores;

export const METRICS: { key: Metric; label: string }[] = [
    { key: 'accessibility', label: 'Accessibility' },
    { key: 'performance', label: 'Performance' },
    { key: 'bestPractices', label: 'Best practices' },
    { key: 'seo', label: 'SEO' },
];

/**
 * Orders reports oldest first. Sample reports are only used while no real
 * report exists, so a seed never pollutes real trends.
 */
export function selectReports(all: Report[]): Report[] {
    const real = all.filter((r) => !r.sample);
    const chosen = real.length > 0 ? real : all;
    return [...chosen].sort((a, b) => a.date.localeCompare(b.date));
}

export function latestReport(reports: Report[]): Report | undefined {
    return reports[reports.length - 1];
}

export type ImpactCounts = Record<Impact, number> & { total: number };

export function countImpacts(violations: Violation[]): ImpactCounts {
    const counts: ImpactCounts = {
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0,
        total: 0,
    };
    for (const v of violations) {
        counts[v.impact] += 1;
        counts.total += 1;
    }
    return counts;
}

export function siteCounts(site: SiteResult): ImpactCounts {
    return countImpacts(site.axe?.violations ?? []);
}

/** A site earns the badge when it was audited and has no serious or critical axe issue. */
export function sitePassesAA(site: SiteResult): boolean {
    if (site.status !== 'ok' || !site.axe) return false;
    const c = siteCounts(site);
    return c.serious === 0 && c.critical === 0;
}

export interface ReportSummary {
    audited: number;
    notDeployed: number;
    errored: number;
    counts: ImpactCounts;
    /** WCAG 2.2 AA badge: at least one site audited and 0 serious/critical everywhere. */
    passesAA: boolean;
}

export function summarizeReport(report: Report): ReportSummary {
    const audited = report.sites.filter((s) => s.status === 'ok');
    const counts = countImpacts(audited.flatMap((s) => s.axe?.violations ?? []));
    return {
        audited: audited.length,
        notDeployed: report.sites.filter((s) => s.status === 'not-deployed').length,
        errored: report.sites.filter((s) => s.status === 'error').length,
        counts,
        passesAA:
            audited.length > 0 &&
            audited.every((s) => s.axe !== null) &&
            counts.serious === 0 &&
            counts.critical === 0,
    };
}

export interface TrendPoint {
    date: string;
    value: number;
}

/** One value per report where the site was audited (missing values are skipped). */
export function siteTrend(
    reports: Report[],
    siteId: string,
    pick: (site: SiteResult) => number | null | undefined,
): TrendPoint[] {
    const out: TrendPoint[] = [];
    for (const report of reports) {
        const site = report.sites.find((s) => s.id === siteId);
        if (!site || site.status !== 'ok') continue;
        const value = pick(site);
        if (typeof value === 'number') out.push({ date: report.date, value });
    }
    return out;
}

/** Total axe violations across all audited sites, per report. */
export function totalTrend(reports: Report[]): TrendPoint[] {
    return reports
        .filter((r) => r.sites.some((s) => s.status === 'ok'))
        .map((r) => ({ date: r.date, value: summarizeReport(r).counts.total }));
}

/**
 * SVG polyline points for a sparkline. With fixed min/max (e.g. 0-100 for
 * scores) trends stay comparable between cards.
 */
export function sparklinePoints(
    values: number[],
    width: number,
    height: number,
    range?: { min: number; max: number },
    pad = 2,
): string {
    if (values.length === 0) return '';
    const min = range?.min ?? Math.min(...values);
    const max = range?.max ?? Math.max(...values);
    const span = max - min || 1;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;
    const step = values.length > 1 ? innerW / (values.length - 1) : 0;
    return values
        .map((v, i) => {
            const x = values.length > 1 ? pad + i * step : width / 2;
            const y = pad + innerH - ((v - min) / span) * innerH;
            return `${round(x)},${round(y)}`;
        })
        .join(' ');
}

function round(n: number): number {
    return Math.round(n * 10) / 10;
}

export interface ResolvedIssue {
    id: string;
    help: string;
    impact: Impact;
    /** Last report that still had the issue. */
    lastSeen: string;
    /** First report without it. */
    resolvedOn: string;
    /** GitHub compare link between the two audited commits, when both are known. */
    compareUrl: string | null;
    fix?: Violation['fix'];
}

export function compareUrl(
    repository: string | null,
    from: string | null,
    to: string | null,
): string | null {
    if (!repository || !from || !to || from === to) return null;
    return `https://github.com/${repository}/compare/${from}...${to}`;
}

/** Link for a fix commit: a full URL is kept, a SHA becomes a GitHub commit link. */
export function commitUrl(repository: string | null, commit: string | undefined): string | null {
    if (!commit) return null;
    if (/^https:\/\//.test(commit)) return commit;
    if (!repository || !/^[0-9a-f]{7,40}$/i.test(commit)) return null;
    return `https://github.com/${repository}/commit/${commit}`;
}

/** Issues present in one audit and gone in the next (site audited in both). */
export function resolvedIssues(reports: Report[], siteId: string): ResolvedIssue[] {
    const out: ResolvedIssue[] = [];
    for (let i = 1; i < reports.length; i += 1) {
        const prev = reports[i - 1]!;
        const curr = reports[i]!;
        const a = prev.sites.find((s) => s.id === siteId);
        const b = curr.sites.find((s) => s.id === siteId);
        if (!a?.axe || !b?.axe || a.status !== 'ok' || b.status !== 'ok') continue;
        const still = new Set(b.axe.violations.map((v) => v.id));
        for (const v of a.axe.violations) {
            if (still.has(v.id)) continue;
            out.push({
                id: v.id,
                help: v.help,
                impact: v.impact,
                lastSeen: prev.date,
                resolvedOn: curr.date,
                compareUrl: compareUrl(
                    curr.source.repository ?? prev.source.repository,
                    prev.source.commit,
                    curr.source.commit,
                ),
                ...(v.fix ? { fix: v.fix } : {}),
            });
        }
    }
    return out.reverse();
}

export function statusLabel(status: SiteResult['status']): string {
    switch (status) {
        case 'ok':
            return 'Audited';
        case 'not-deployed':
            return 'Not deployed yet';
        default:
            return 'Audit failed';
    }
}

/** Plain-language rating for a 0-100 Lighthouse score (Lighthouse's own bands). */
export function scoreBand(value: number | null): 'good' | 'average' | 'poor' | 'none' {
    if (value === null) return 'none';
    if (value >= 90) return 'good';
    if (value >= 50) return 'average';
    return 'poor';
}

/** Names of the WCAG 2.2 success criteria axe-core most often reports. */
const WCAG_NAMES: Record<string, string> = {
    '1.1.1': 'Non-text Content',
    '1.2.2': 'Captions (Prerecorded)',
    '1.3.1': 'Info and Relationships',
    '1.3.2': 'Meaningful Sequence',
    '1.3.4': 'Orientation',
    '1.3.5': 'Identify Input Purpose',
    '1.4.1': 'Use of Color',
    '1.4.2': 'Audio Control',
    '1.4.3': 'Contrast (Minimum)',
    '1.4.4': 'Resize Text',
    '1.4.10': 'Reflow',
    '1.4.11': 'Non-text Contrast',
    '1.4.12': 'Text Spacing',
    '2.1.1': 'Keyboard',
    '2.1.2': 'No Keyboard Trap',
    '2.2.1': 'Timing Adjustable',
    '2.2.2': 'Pause, Stop, Hide',
    '2.4.1': 'Bypass Blocks',
    '2.4.2': 'Page Titled',
    '2.4.3': 'Focus Order',
    '2.4.4': 'Link Purpose (In Context)',
    '2.4.7': 'Focus Visible',
    '2.4.11': 'Focus Not Obscured (Minimum)',
    '2.5.3': 'Label in Name',
    '2.5.8': 'Target Size (Minimum)',
    '3.1.1': 'Language of Page',
    '3.1.2': 'Language of Parts',
    '3.3.2': 'Labels or Instructions',
    '4.1.2': 'Name, Role, Value',
};

export function wcagName(criterion: string): string | undefined {
    return WCAG_NAMES[criterion];
}

/** W3C "Understanding WCAG 2.2" page for a criterion, when its name is known. */
export function wcagUrl(criterion: string): string | null {
    const name = WCAG_NAMES[criterion];
    if (!name) return null;
    const slug = name
        .toLowerCase()
        .replace(/[(),]/g, '')
        .trim()
        .replace(/\s+/g, '-');
    return `https://www.w3.org/WAI/WCAG22/Understanding/${slug}`;
}

export function formatDate(iso: string): string {
    const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${Number(d)} ${months[Number(m) - 1] ?? m} ${y}`;
}
