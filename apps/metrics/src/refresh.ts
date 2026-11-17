// One refresh = fetch every source, fall back per section to the last good
// snapshot on failure, then write at most two KV keys.
import { getResume } from '@faheem/data';
import {
    KEY_CURRENT,
    KEY_LASTGOOD,
    SCHEMA_VERSION,
    readLastGood,
    type Env,
    type Section,
    type Snapshot,
} from './snapshot';
import {
    BudgetedFetch,
    fetchGithubGraphql,
    fetchGithubRest,
    fetchWakatime,
    type FetchFn,
} from './sources';
import { loginFromUrl } from './transform';

export const DEFAULT_LOGIN = 'faheem-naeem';

export function githubLogin(): string {
    return loginFromUrl(getResume().links.github, DEFAULT_LOGIN);
}

export interface RefreshDeps {
    fetch: FetchFn;
    now: () => number;
    login?: string;
}

export interface RefreshResult {
    snapshot: Snapshot;
    subrequests: number;
    wroteLastGood: boolean;
}

async function section<T>(
    name: string,
    load: () => Promise<T>,
    previous: Section<T> | null | undefined,
    nowIso: string,
    errors: string[],
): Promise<Section<T> | null> {
    try {
        return { data: await load(), fetchedAt: nowIso, stale: false };
    } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown error';
        errors.push(`${name}: ${reason}`);
        return previous ? { ...previous, stale: true } : null;
    }
}

export async function refresh(
    env: Env,
    deps: RefreshDeps,
): Promise<RefreshResult> {
    const nowIso = new Date(deps.now()).toISOString();
    const login = deps.login ?? githubLogin();
    const f = new BudgetedFetch(deps.fetch);
    const lastGood = await readLastGood(env.METRICS);
    const errors: string[] = [];
    const token = env.GITHUB_TOKEN?.trim();
    const wakaKey = env.WAKATIME_API_KEY?.trim();

    const [github, wakatime] = await Promise.all([
        section(
            'GitHub',
            () =>
                token
                    ? fetchGithubGraphql(f, login, token, deps.now())
                    : fetchGithubRest(f, login),
            lastGood?.github,
            nowIso,
            errors,
        ),
        wakaKey
            ? section(
                  'WakaTime',
                  () => fetchWakatime(f, wakaKey),
                  lastGood?.wakatime,
                  nowIso,
                  errors,
              )
            : Promise.resolve(null),
    ]);

    const snapshot: Snapshot = {
        version: SCHEMA_VERSION,
        generatedAt: nowIso,
        github,
        wakatime,
        errors,
    };
    const json = JSON.stringify(snapshot);
    await env.METRICS.put(KEY_CURRENT, json);
    const anyFresh = [github, wakatime].some((s) => s && !s.stale);
    if (anyFresh) await env.METRICS.put(KEY_LASTGOOD, json);
    return { snapshot, subrequests: f.used, wroteLastGood: anyFresh };
}
