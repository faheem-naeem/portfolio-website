// Pure helpers that turn @faheem/data career releases into release notes,
// a `git log --oneline` summary, a commit graph layout and feed payloads.
// No Astro or Node APIs here so everything is unit-testable with Vitest.
import type { Career, Release } from '@faheem/data';

export type ChangeLabel = 'BREAKING' | 'feat' | 'fix' | 'chore' | 'perf';
export type Branch = 'main' | 'learning';

export interface ReleaseNote {
    label: ChangeLabel;
    text: string;
}

export interface ReleaseView {
    version: string;
    tag: string;
    /** Element id of the release on the release-notes page. */
    anchor: string;
    date: string;
    type: Release['type'];
    /** Headline label for the whole release, derived from its semver type. */
    label: ChangeLabel;
    title: string;
    notes: ReleaseNote[];
    /** Deterministic fake short commit hash (7 hex chars). */
    hash: string;
    branch: Branch;
    latest: boolean;
}

const RELEASE_LABEL: Record<Release['type'], ChangeLabel> = {
    major: 'BREAKING',
    minor: 'feat',
    patch: 'fix',
};

/** Compares two "x.y.z" versions; negative when a < b. */
export function compareSemver(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

/** Releases sorted newest (highest semver) first. */
export function sortReleases(releases: readonly Release[]): Release[] {
    return [...releases].sort((a, b) => compareSemver(b.version, a.version));
}

const NOTE_RULES: ReadonlyArray<[RegExp, ChangeLabel]> = [
    [/^breaking( change)?:\s*/i, 'BREAKING'],
    [/^(fix|fixed|patched|resolved)\b/i, 'fix'],
    [/\b(faster|performance|optimi[sz]ed|speed(ed)? up)\b/i, 'perf'],
    [/^(chore|migrated|upgraded|refactored|maintained|cleaned)\b/i, 'chore'],
];

/** Labels a single note in Conventional Commits style. */
export function classifyNote(note: string, type: Release['type']): ReleaseNote {
    for (const [pattern, label] of NOTE_RULES) {
        if (pattern.test(note)) {
            const text =
                label === 'BREAKING' ? note.replace(pattern, '') : note;
            return { label, text: capitalise(text) };
        }
    }
    return { label: type === 'patch' ? 'fix' : 'feat', text: note };
}

function capitalise(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/** FNV-1a based 7-char hex "commit hash"; stable across builds. */
export function shortHash(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 7);
}

const LEARNING =
    /\b(M\.S\.|B\.S\.)|\b(degree|specialization|certification|certificate|course)\b/i;

/**
 * Lane in the commit graph. Learning milestones (degrees, courses) are drawn
 * on a side branch, except the very first release, which is the root commit.
 */
export function branchFor(release: Release, isRoot: boolean): Branch {
    return !isRoot && LEARNING.test(release.title) ? 'learning' : 'main';
}

/** Builds view models, newest first. */
export function buildReleases(career: Career): ReleaseView[] {
    const sorted = sortReleases(career.releases);
    const root = sorted[sorted.length - 1];
    return sorted.map((release, index) => ({
        version: release.version,
        tag: `v${release.version}`,
        anchor: `v${release.version}`,
        date: release.date,
        type: release.type,
        label: RELEASE_LABEL[release.type],
        title: release.title,
        notes: release.notes.map((n) => classifyNote(n, release.type)),
        hash: shortHash(`${release.version}|${release.date}|${release.title}`),
        branch: branchFor(release, release === root),
        latest: index === 0,
    }));
}

/** The latest release, i.e. the current version. */
export function currentRelease(releases: readonly ReleaseView[]): ReleaseView {
    const latest = releases[0];
    if (!latest) throw new Error('career has no releases');
    return latest;
}

/** One `git log --oneline --decorate` line per release, newest first. */
export function gitLogLines(releases: readonly ReleaseView[]): string[] {
    return releases.map((r) => {
        const refs = r.latest
            ? `(HEAD -> main, tag: ${r.tag})`
            : `(tag: ${r.tag})`;
        return `${r.hash} ${refs} ${r.label === 'BREAKING' ? 'feat!' : r.label}: ${r.title}`;
    });
}

/** Formats YYYY-MM-DD as e.g. "Jan 2025" (UTC, locale-independent). */
export function formatMonth(date: string): string {
    const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
    ];
    const [year, month] = date.split('-');
    return `${months[Number(month) - 1] ?? ''} ${year}`.trim();
}

/** Year of a YYYY-MM-DD date. Career dates are only accurate to the year. */
export function formatYear(date: string): string {
    return date.slice(0, 4);
}

// ---------------------------------------------------------------- graph ---

export interface GraphNode {
    release: ReleaseView;
    x: number;
    y: number;
}

export interface GraphEdge {
    /** SVG path data. */
    d: string;
    branch: Branch;
}

export interface GraphLayout {
    width: number;
    height: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
    labelX: number;
}

export const GRAPH = {
    rowHeight: 56,
    padTop: 28,
    laneX: { main: 24, learning: 64 } as Record<Branch, number>,
    labelX: 96,
    width: 320,
} as const;

function curve(x1: number, y1: number, x2: number, y2: number): string {
    const midY = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

/**
 * Vertical timeline, newest at the top. Main commits are joined by a straight
 * line; each side-branch commit forks from the previous (older) main commit and
 * merges into the next (newer) main commit, when there is one.
 */
export function layoutGraph(releases: readonly ReleaseView[]): GraphLayout {
    const nodes: GraphNode[] = releases.map((release, i) => ({
        release,
        x: GRAPH.laneX[release.branch],
        y: GRAPH.padTop + i * GRAPH.rowHeight,
    }));
    const edges: GraphEdge[] = [];
    const mainNodes = nodes.filter((n) => n.release.branch === 'main');
    const first = mainNodes[0];
    const last = mainNodes[mainNodes.length - 1];
    if (first && last && first !== last) {
        edges.push({
            d: `M ${first.x} ${first.y} L ${last.x} ${last.y}`,
            branch: 'main',
        });
    }
    // Contiguous runs of side-branch commits share one fork and one merge.
    let run: GraphNode[] = [];
    const flush = () => {
        const newest = run[0];
        const oldest = run[run.length - 1];
        if (!newest || !oldest) return;
        const branch = newest.release.branch;
        const older = mainNodes.find((m) => m.y > oldest.y);
        const newer = [...mainNodes].reverse().find((m) => m.y < newest.y);
        if (older) {
            edges.push({ d: curve(older.x, older.y, oldest.x, oldest.y), branch });
        }
        if (newest !== oldest) {
            edges.push({
                d: `M ${oldest.x} ${oldest.y} L ${newest.x} ${newest.y}`,
                branch,
            });
        }
        if (newer) {
            edges.push({ d: curve(newest.x, newest.y, newer.x, newer.y), branch });
        }
        run = [];
    };
    for (const node of nodes) {
        if (node.release.branch === 'main') flush();
        else run.push(node);
    }
    flush();
    const lastNode = nodes[nodes.length - 1];
    return {
        width: GRAPH.width,
        height: (lastNode?.y ?? 0) + GRAPH.padTop,
        nodes,
        edges,
        labelX: GRAPH.labelX,
    };
}

// ---------------------------------------------------------------- feeds ---

export interface ChangelogJson {
    name: string;
    homepage: string;
    currentVersion: string;
    sample: boolean;
    note?: string;
    releases: Array<{
        version: string;
        tag: string;
        date: string;
        type: Release['type'];
        label: ChangeLabel;
        latest: boolean;
        title: string;
        url: string;
        notes: ReleaseNote[];
    }>;
}

export function releaseUrl(site: string, release: ReleaseView): string {
    return new URL(`/#${release.anchor}`, site).toString();
}

export function buildChangelogJson(
    career: Career,
    site: string,
    name: string,
): ChangelogJson {
    const releases = buildReleases(career);
    return {
        name,
        homepage: new URL('/', site).toString(),
        currentVersion: currentRelease(releases).version,
        sample: career.sample === true,
        ...(career.note ? { note: career.note } : {}),
        releases: releases.map((r) => ({
            version: r.version,
            tag: r.tag,
            date: r.date,
            type: r.type,
            label: r.label,
            latest: r.latest,
            title: r.title,
            url: releaseUrl(site, r),
            notes: r.notes,
        })),
    };
}
