// Builds the page model shared by the HTML page and /api/status.json.
import type { Incident, Status, StatusState } from '@faheem/data';
import type { LatestCheck, Target } from './checks';
import {
    buildDays,
    overallUptime,
    type DailyRow,
    type DayUptime,
} from './uptime';

/** Above this a reachable project counts as degraded. */
export const SLOW_MS = 3_000;

export type ComponentState = StatusState | 'unknown';

const SEVERITY: Record<ComponentState, number> = {
    unknown: 0,
    operational: 0,
    maintenance: 1,
    degraded: 2,
    outage: 3,
};

export const STATE_LABEL: Record<ComponentState, string> = {
    operational: 'Operational',
    degraded: 'Degraded',
    outage: 'Outage',
    maintenance: 'Maintenance',
    unknown: 'No data',
};

export const BANNER_TEXT: Record<StatusState, string> = {
    operational: 'All Systems Operational',
    maintenance: 'Scheduled Maintenance In Progress',
    degraded: 'Some Systems Degraded',
    outage: 'Major Outage',
};

export interface ProjectStatus {
    id: string;
    name: string;
    url: string;
    state: ComponentState;
    latest: LatestCheck | null;
    uptime90d: number | null;
    days: DayUptime[];
}

export interface StatusModel {
    generatedAt: string;
    overall: { state: StatusState; label: string };
    faheem: { sample: boolean; components: Status['components'] };
    projects: ProjectStatus[];
    incidents: Incident[];
}

export function projectState(latest: LatestCheck | null): ComponentState {
    if (!latest) return 'unknown';
    if (!latest.ok) return 'outage';
    return latest.latencyMs > SLOW_MS ? 'degraded' : 'operational';
}

/** Worst state wins; "unknown" never raises the banner. */
export function worstState(states: readonly ComponentState[]): StatusState {
    let worst: StatusState = 'operational';
    for (const s of states) {
        if (s !== 'unknown' && SEVERITY[s] > SEVERITY[worst]) worst = s;
    }
    return worst;
}

export function buildModel(input: {
    status: Status;
    incidents: readonly Incident[];
    targets: readonly Target[];
    latest: ReadonlyMap<string, LatestCheck>;
    daily: readonly DailyRow[];
    nowMs: number;
}): StatusModel {
    const rowsByUrl = new Map<string, DailyRow[]>();
    for (const row of input.daily) {
        const list = rowsByUrl.get(row.url) ?? [];
        list.push(row);
        rowsByUrl.set(row.url, list);
    }
    const projects = input.targets.map((t): ProjectStatus => {
        const latest = input.latest.get(t.url) ?? null;
        const days = buildDays(rowsByUrl.get(t.url) ?? [], input.nowMs);
        return {
            id: t.id,
            name: t.name,
            url: t.url,
            state: projectState(latest),
            latest,
            uptime90d: overallUptime(days),
            days,
        };
    });
    // The banner reflects REAL uptime checks only. The "Faheem" components are
    // jokes (e.g. "Inbox zero: outage") and must never turn the headline red.
    const state = worstState(projects.map((p) => p.state));
    const incidents = [...input.incidents].sort(
        (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
    );
    return {
        generatedAt: new Date(input.nowMs).toISOString(),
        overall: { state, label: BANNER_TEXT[state] },
        faheem: {
            sample: input.status.sample === true,
            components: input.status.components,
        },
        projects,
        incidents,
    };
}
