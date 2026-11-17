// View-model helpers for the bug museum. Pure functions over @faheem/data so
// they are easy to test and reuse in pages, filters and the RSS feed.
import { getBugs, type BugEntry, type BugFrontmatter } from '@faheem/data';

export type Severity = BugFrontmatter['severity'];
export type FilterKind = 'tag' | 'stack' | 'severity';

/** Severity levels, least to most dangerous. */
export const SEVERITIES: readonly Severity[] = [
    'low',
    'medium',
    'high',
    'critical',
];

/** Museum wording for each severity ("Danger level"). */
export const DANGER_LABELS: Record<Severity, string> = {
    low: 'Low: mostly harmless',
    medium: 'Medium: handle with care',
    high: 'High: keep behind glass',
    critical: 'Critical: do not feed',
};

export interface Exhibit {
    /** 1-based, oldest exhibit first, so numbers never change when new ones arrive. */
    number: number;
    slug: string;
    title: string;
    date: string;
    severity: Severity;
    stack: string[];
    tags: string[];
    sample: boolean;
    /** First paragraph of the Symptom section, as plain text. */
    hook: string;
    body: string;
}

/** URL-safe slug for a tag or stack label: "Node.js" -> "node-js". */
export function slugify(label: string): string {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** "#007" style exhibit number. */
export function formatNumber(n: number): string {
    return `#${String(n).padStart(3, '0')}`;
}

/** Formats a YYYY-MM-DD date as "22 August 2023" (UTC, so builds are stable). */
export function formatDate(iso: string): string {
    return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(`${iso}T00:00:00Z`));
}

/** Strips the most common inline markdown so a paragraph reads as plain text. */
function plainText(markdown: string): string {
    return markdown
        .replace(/`([^`]*)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/[*_]([^*_]+)[*_]/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

/** First paragraph of the "## Symptom" section. */
export function extractHook(body: string): string {
    const match = /^## Symptom\s*\n+([\s\S]*?)(?:\n\s*\n|\n## |$)/m.exec(body);
    return plainText(match?.[1] ?? '');
}

/** Converts validated bug entries (any order) to exhibits, newest first. */
export function toExhibits(entries: readonly BugEntry[]): Exhibit[] {
    const oldestFirst = [...entries].sort(
        (a, b) =>
            a.frontmatter.date.localeCompare(b.frontmatter.date) ||
            a.slug.localeCompare(b.slug),
    );
    return oldestFirst
        .map((entry, i) => ({
            number: i + 1,
            slug: entry.slug,
            title: entry.frontmatter.title,
            date: entry.frontmatter.date,
            severity: entry.frontmatter.severity,
            stack: entry.frontmatter.stack,
            tags: entry.frontmatter.tags,
            sample: entry.frontmatter.sample === true,
            hook: extractHook(entry.body),
            body: entry.body,
        }))
        .reverse();
}

/** All exhibits from @faheem/data, newest first. */
export function getExhibits(): Exhibit[] {
    return toExhibits(getBugs());
}

/**
 * "Exhibit of the month". The data schema has no `featured` flag yet, so the
 * most recent exhibit is featured.
 */
export function getFeatured(exhibits: readonly Exhibit[]): Exhibit | undefined {
    return exhibits[0];
}

export interface FilterOption {
    kind: FilterKind;
    /** URL segment. */
    value: string;
    /** Human label. */
    label: string;
    count: number;
}

function valuesOf(exhibit: Exhibit, kind: FilterKind): string[] {
    if (kind === 'tag') return exhibit.tags;
    if (kind === 'stack') return exhibit.stack;
    return [exhibit.severity];
}

/** Distinct filter options of one kind with counts, sorted by label (severity by level). */
export function getFilterOptions(
    exhibits: readonly Exhibit[],
    kind: FilterKind,
): FilterOption[] {
    const map = new Map<string, FilterOption>();
    for (const exhibit of exhibits) {
        for (const label of valuesOf(exhibit, kind)) {
            const value = slugify(label);
            const existing = map.get(value);
            if (existing) existing.count += 1;
            else map.set(value, { kind, value, label, count: 1 });
        }
    }
    const options = [...map.values()];
    if (kind === 'severity') {
        return options.sort(
            (a, b) =>
                SEVERITIES.indexOf(a.value as Severity) -
                SEVERITIES.indexOf(b.value as Severity),
        );
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
}

/** Exhibits matching a filter (value is the URL slug). */
export function filterExhibits(
    exhibits: readonly Exhibit[],
    kind: FilterKind,
    value: string,
): Exhibit[] {
    return exhibits.filter((e) =>
        valuesOf(e, kind).some((label) => slugify(label) === value),
    );
}

/** Space-separated slugs for data-* attributes used by the filter script. */
export function filterData(exhibit: Exhibit, kind: FilterKind): string {
    return valuesOf(exhibit, kind).map(slugify).join(' ');
}

export interface MuseumStats {
    captured: number;
    bySeverity: Record<Severity, number>;
    habitats: number;
}

export function getStats(exhibits: readonly Exhibit[]): MuseumStats {
    const bySeverity: Record<Severity, number> = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
    };
    for (const e of exhibits) bySeverity[e.severity] += 1;
    return {
        captured: exhibits.length,
        bySeverity,
        habitats: getFilterOptions(exhibits, 'stack').length,
    };
}

export const FILTER_TITLES: Record<FilterKind, string> = {
    tag: 'Tag',
    stack: 'Habitat',
    severity: 'Danger level',
};
