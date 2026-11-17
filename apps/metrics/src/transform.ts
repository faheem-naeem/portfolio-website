// Pure data transformers: upstream API shapes -> snapshot shapes. No I/O here,
// so everything is unit-tested with fixtures.
import type {
    Calendar,
    Commit,
    DayHours,
    LanguageShare,
    NamedDuration,
    Streaks,
    WakatimeData,
} from './snapshot';

export const DAY_MS = 86_400_000;
export const TOP_LANGUAGES = 6;
export const MAX_COMMITS = 10;
export const MAX_MESSAGE = 120;

/** "https://github.com/faheem-naeem" -> "faheem-naeem". */
export function loginFromUrl(
    url: string | null | undefined,
    fallback: string,
): string {
    if (!url) return fallback;
    try {
        const u = new URL(url);
        if (u.hostname !== 'github.com') return fallback;
        const first = u.pathname.split('/').filter(Boolean)[0];
        return first && /^[A-Za-z0-9-]{1,39}$/.test(first) ? first : fallback;
    } catch {
        return fallback;
    }
}

export function isoDay(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

export function dayMs(iso: string): number {
    return Date.parse(`${iso}T00:00:00Z`);
}

// ---------------------------------------------------------------- calendar

const LEVELS: Record<string, number> = {
    NONE: 0,
    FIRST_QUARTILE: 1,
    SECOND_QUARTILE: 2,
    THIRD_QUARTILE: 3,
    FOURTH_QUARTILE: 4,
};

export interface GqlCalendar {
    totalContributions: number;
    weeks: {
        contributionDays: {
            date: string;
            contributionCount: number;
            contributionLevel?: string;
        }[];
    }[];
}

/** Flattens GitHub's week/day calendar into a dense day array. Days after
 *  `todayIso` (GitHub pads the last week) are dropped. */
export function calendarFromGraphql(
    cal: GqlCalendar,
    todayIso: string,
): Calendar | null {
    const days = cal.weeks
        .flatMap((w) => w.contributionDays)
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date <= todayIso)
        .sort((a, b) => a.date.localeCompare(b.date));
    const first = days[0];
    if (!first) return null;
    const startMs = dayMs(first.date);
    const last = days[days.length - 1] ?? first;
    const length = Math.round((dayMs(last.date) - startMs) / DAY_MS) + 1;
    const counts = new Array<number>(length).fill(0);
    const levels = new Array<number>(length).fill(0);
    for (const d of days) {
        const i = Math.round((dayMs(d.date) - startMs) / DAY_MS);
        const count = Math.max(0, Math.trunc(d.contributionCount) || 0);
        counts[i] = count;
        levels[i] = LEVELS[d.contributionLevel ?? ''] ?? (count > 0 ? 1 : 0);
    }
    return {
        start: first.date,
        counts,
        levels,
        total: Math.max(0, cal.totalContributions | 0),
    };
}

/** Current streak counts back from today; if today has no contributions yet
 *  it starts from yesterday (the day is not over). */
export function computeStreaks(cal: Calendar): Streaks {
    let longest = 0;
    let run = 0;
    for (const c of cal.counts) {
        run = c > 0 ? run + 1 : 0;
        if (run > longest) longest = run;
    }
    let i = cal.counts.length - 1;
    if (i >= 0 && cal.counts[i] === 0) i--;
    let current = 0;
    while (i >= 0 && (cal.counts[i] ?? 0) > 0) {
        current++;
        i--;
    }
    return { current, longest };
}

// ---------------------------------------------------------------- languages

export interface RepoLanguages {
    languages: { name: string; bytes: number }[];
}

/** Sums bytes per language across repos; keeps the top N and folds the rest
 *  into "Other". Percentages are rounded to one decimal. */
export function aggregateLanguages(
    repos: RepoLanguages[],
    topN = TOP_LANGUAGES,
): LanguageShare[] {
    const totals = new Map<string, number>();
    for (const repo of repos)
        for (const { name, bytes } of repo.languages)
            if (name && bytes > 0)
                totals.set(name, (totals.get(name) ?? 0) + bytes);
    const sum = [...totals.values()].reduce((a, b) => a + b, 0);
    if (sum === 0) return [];
    const sorted = [...totals.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    const top = sorted.slice(0, topN);
    const rest = sorted.slice(topN).reduce((a, [, b]) => a + b, 0);
    const pct = (b: number) => Math.round((b / sum) * 1000) / 10;
    const out = top.map(([name, bytes]) => ({
        name,
        bytes,
        percent: pct(bytes),
    }));
    if (rest > 0) out.push({ name: 'Other', bytes: rest, percent: pct(rest) });
    return out;
}

// ---------------------------------------------------------------- commits

export function cleanMessage(message: string): string {
    const line = (message.split('\n')[0] ?? '').trim();
    return line.length > MAX_MESSAGE
        ? `${line.slice(0, MAX_MESSAGE - 1)}…`
        : line;
}

function safeGithubUrl(url: unknown): string {
    return typeof url === 'string' && url.startsWith('https://github.com/')
        ? url
        : '';
}

export function newestCommits(commits: Commit[], max = MAX_COMMITS): Commit[] {
    const seen = new Set<string>();
    return commits
        .filter((c) => c.message && !Number.isNaN(Date.parse(c.date)))
        .sort((a, b) => b.date.localeCompare(a.date))
        .filter((c) => {
            const key = c.url || `${c.repo}:${c.date}:${c.message}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, max);
}

export interface GqlRecentRepo {
    nameWithOwner: string;
    defaultBranchRef: {
        target: {
            history?: {
                nodes: {
                    messageHeadline: string;
                    committedDate: string;
                    url: string;
                    author: { user: { login: string } | null } | null;
                }[];
            };
        } | null;
    } | null;
}

/** Commits by `login` from the most recently pushed repos. */
export function commitsFromGraphql(
    repos: GqlRecentRepo[],
    login: string,
): Commit[] {
    const lower = login.toLowerCase();
    const all: Commit[] = [];
    for (const repo of repos)
        for (const n of repo.defaultBranchRef?.target?.history?.nodes ?? [])
            if (n.author?.user?.login?.toLowerCase() === lower)
                all.push({
                    repo: repo.nameWithOwner,
                    message: cleanMessage(n.messageHeadline),
                    url: safeGithubUrl(n.url),
                    date: n.committedDate,
                });
    return newestCommits(all);
}

export interface RestCommit {
    html_url: string;
    commit: {
        message: string;
        author: { date: string } | null;
        committer?: { date: string } | null;
    };
}

export function commitsFromRest(repo: string, commits: RestCommit[]): Commit[] {
    return commits.map((c) => ({
        repo,
        message: cleanMessage(c.commit.message),
        url: safeGithubUrl(c.html_url),
        date: c.commit.author?.date ?? c.commit.committer?.date ?? '',
    }));
}

// ---------------------------------------------------------------- wakatime

interface WakaNamed {
    name: string;
    total_seconds: number;
    percent?: number;
}

export interface WakaStats {
    data: {
        total_seconds?: number;
        languages?: WakaNamed[];
        editors?: WakaNamed[];
    };
}

export interface WakaSummaries {
    data: { range: { date: string }; grand_total: { total_seconds: number } }[];
}

function topNamed(
    items: WakaNamed[] | undefined,
    topN: number,
): NamedDuration[] {
    const list = (items ?? []).filter((i) => i.name && i.total_seconds > 0);
    const sum = list.reduce((a, b) => a + b.total_seconds, 0);
    if (sum === 0) return [];
    const sorted = [...list].sort((a, b) => b.total_seconds - a.total_seconds);
    const pct = (s: number) => Math.round((s / sum) * 1000) / 10;
    const out = sorted
        .slice(0, topN)
        .map((i) => ({
            name: i.name,
            seconds: Math.round(i.total_seconds),
            percent: pct(i.total_seconds),
        }));
    const rest = sorted.slice(topN).reduce((a, b) => a + b.total_seconds, 0);
    if (rest > 0)
        out.push({
            name: 'Other',
            seconds: Math.round(rest),
            percent: pct(rest),
        });
    return out;
}

export function wakatimeFrom(
    stats: WakaStats,
    summaries: WakaSummaries,
): WakatimeData {
    const days: DayHours[] = summaries.data
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.range.date))
        .map((d) => ({
            date: d.range.date,
            seconds: Math.max(0, Math.round(d.grand_total.total_seconds)),
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-7);
    const fromDays = days.reduce((a, d) => a + d.seconds, 0);
    return {
        totalSeconds: Math.round(stats.data.total_seconds ?? fromDays),
        days,
        languages: topNamed(stats.data.languages, TOP_LANGUAGES),
        editors: topNamed(stats.data.editors, 4),
    };
}

/** 5400 -> "1 h 30 min", 300 -> "5 min". */
export function formatHours(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
}
