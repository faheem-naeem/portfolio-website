// Snapshot shape stored in KV and served by /api/metrics.json, plus KV helpers.

export interface Env {
    METRICS: KVNamespace;
    GITHUB_TOKEN?: string;
    WAKATIME_API_KEY?: string;
    REFRESH_TOKEN?: string;
}

export const KEY_CURRENT = 'snapshot:v1';
export const KEY_LASTGOOD = 'snapshot:lastgood';
export const SCHEMA_VERSION = 1;

/** Contribution calendar: one count + level (0-4) per day, oldest first. */
export interface Calendar {
    /** First day (YYYY-MM-DD, UTC). Day i is start + i days. */
    start: string;
    counts: number[];
    levels: number[];
    total: number;
}

export interface Streaks {
    current: number;
    longest: number;
}

export interface LanguageShare {
    name: string;
    bytes: number;
    /** 0-100, one decimal. */
    percent: number;
}

export interface Commit {
    repo: string;
    message: string;
    url: string;
    date: string;
}

export interface GithubData {
    login: string;
    profileUrl: string;
    /** "graphql" with a token, "rest" without (no calendar). */
    source: 'graphql' | 'rest';
    followers: number;
    stars: number;
    publicRepos: number;
    reposScanned: number;
    calendar: Calendar | null;
    streaks: Streaks | null;
    languages: LanguageShare[];
    commits: Commit[];
}

export interface NamedDuration {
    name: string;
    seconds: number;
    percent: number;
}

export interface DayHours {
    date: string;
    seconds: number;
}

export interface WakatimeData {
    totalSeconds: number;
    days: DayHours[];
    languages: NamedDuration[];
    editors: NamedDuration[];
}

export interface Section<T> {
    data: T;
    fetchedAt: string;
    /** True when this section is copied from the last good snapshot. */
    stale: boolean;
}

export interface Snapshot {
    version: number;
    generatedAt: string;
    github: Section<GithubData> | null;
    /** null when WAKATIME_API_KEY is not set (section hidden). */
    wakatime: Section<WakatimeData> | null;
    /** Generic error notes (never raw upstream bodies). */
    errors: string[];
}

function parse(raw: string | null): Snapshot | null {
    if (!raw) return null;
    try {
        const s = JSON.parse(raw) as Snapshot;
        return s && s.version === SCHEMA_VERSION ? s : null;
    } catch {
        return null;
    }
}

export async function readSnapshot(kv: KVNamespace): Promise<{
    snapshot: Snapshot | null;
    fromLastGood: boolean;
}> {
    const current = parse(await kv.get(KEY_CURRENT));
    if (current) return { snapshot: current, fromLastGood: false };
    const lastGood = parse(await kv.get(KEY_LASTGOOD));
    return { snapshot: lastGood, fromLastGood: lastGood !== null };
}

export async function readLastGood(kv: KVNamespace): Promise<Snapshot | null> {
    return parse(await kv.get(KEY_LASTGOOD));
}
