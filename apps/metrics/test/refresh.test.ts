import { describe, expect, it } from 'vitest';
import { refresh } from '../src/refresh';
import { KEY_CURRENT, KEY_LASTGOOD, type Snapshot } from '../src/snapshot';
import {
    MAX_LANGUAGE_REPOS,
    SUBREQUEST_BUDGET,
    USER_AGENT,
} from '../src/sources';
import {
    createFakeKV,
    fakeFetch,
    gqlResponse,
    json,
    NOW,
    wakaStats,
    wakaSummaries,
    type Route,
} from './fakes';

const graphql: Route = (url) =>
    url === 'https://api.github.com/graphql' ? json(gqlResponse()) : undefined;
const waka: Route = (url) => {
    if (url.endsWith('/stats/last_7_days')) return json(wakaStats);
    if (url.includes('/summaries?')) return json(wakaSummaries);
    return undefined;
};

function read(kv: ReturnType<typeof createFakeKV>, key: string): Snapshot {
    return JSON.parse(kv.store.get(key) ?? 'null') as Snapshot;
}

describe('refresh with GITHUB_TOKEN', () => {
    it('uses one GraphQL call and writes both keys', async () => {
        const kv = createFakeKV();
        const f = fakeFetch(graphql, waka);
        const env = {
            METRICS: kv.binding,
            GITHUB_TOKEN: '<GITHUB_TOKEN>',
            WAKATIME_API_KEY: '<WAKATIME_API_KEY>',
        };
        const r = await refresh(env, {
            fetch: f.fn,
            now: () => NOW,
            login: 'faheem-naeem',
        });
        expect(r.subrequests).toBe(3);
        expect(kv.puts).toEqual([KEY_CURRENT, KEY_LASTGOOD]);
        const s = read(kv, KEY_CURRENT);
        expect(s.github?.data.source).toBe('graphql');
        expect(s.github?.data.stars).toBe(7);
        expect(s.github?.data.streaks).toEqual({ current: 1, longest: 4 });
        expect(s.wakatime?.data.days).toHaveLength(7);
        const gh = f.calls[0]!;
        const headers = gh.init?.headers as Record<string, string>;
        expect(headers['User-Agent']).toBe(USER_AGENT);
        expect(headers.Authorization).toBe('Bearer <GITHUB_TOKEN>');
        expect(JSON.parse(String(gh.init?.body)).variables).toEqual({
            login: 'faheem-naeem',
        });
    });

    it('omits WakaTime when the key is unset', async () => {
        const kv = createFakeKV();
        const f = fakeFetch(graphql);
        const r = await refresh(
            { METRICS: kv.binding, GITHUB_TOKEN: 't' },
            { fetch: f.fn, now: () => NOW },
        );
        expect(r.snapshot.wakatime).toBeNull();
        expect(f.calls.some((c) => c.url.includes('wakatime'))).toBe(false);
    });

    it('keeps the last good section, marked stale, when an API fails', async () => {
        const kv = createFakeKV();
        const env = {
            METRICS: kv.binding,
            GITHUB_TOKEN: 't',
            WAKATIME_API_KEY: 'k',
        };
        await refresh(env, {
            fetch: fakeFetch(graphql, waka).fn,
            now: () => NOW,
        });
        const later = NOW + 6 * 3_600_000;
        const failing = fakeFetch(
            (url) =>
                url.includes('github')
                    ? json({ message: 'boom' }, 502)
                    : undefined,
            waka,
        );
        kv.puts.length = 0;
        const r = await refresh(env, { fetch: failing.fn, now: () => later });
        expect(r.snapshot.github?.stale).toBe(true);
        expect(r.snapshot.github?.fetchedAt).toBe(new Date(NOW).toISOString());
        expect(r.snapshot.wakatime?.stale).toBe(false);
        expect(r.snapshot.errors).toEqual([
            'GitHub: HTTP 502 from api.github.com',
        ]);
        // WakaTime was fresh, so lastgood is still updated.
        expect(kv.puts).toEqual([KEY_CURRENT, KEY_LASTGOOD]);
    });

    it('does not overwrite lastgood when everything fails', async () => {
        const kv = createFakeKV();
        const env = { METRICS: kv.binding, GITHUB_TOKEN: 't' };
        await refresh(env, { fetch: fakeFetch(graphql).fn, now: () => NOW });
        kv.puts.length = 0;
        const r = await refresh(env, {
            fetch: fakeFetch(() => json({}, 500)).fn,
            now: () => NOW + 1,
        });
        expect(kv.puts).toEqual([KEY_CURRENT]);
        expect(r.snapshot.github?.stale).toBe(true);
        expect(read(kv, KEY_LASTGOOD).github?.stale).toBe(false);
    });

    it('treats GraphQL errors as a failure', async () => {
        const kv = createFakeKV();
        const r = await refresh(
            { METRICS: kv.binding, GITHUB_TOKEN: 't' },
            {
                fetch: fakeFetch(() =>
                    json({
                        data: { user: null },
                        errors: [{ message: 'nope' }],
                    }),
                ).fn,
                now: () => NOW,
            },
        );
        expect(r.snapshot.github).toBeNull();
        expect(r.snapshot.errors[0]).toContain('GitHub');
    });
});

describe('refresh without GITHUB_TOKEN (REST fallback)', () => {
    it('stays under the subrequest budget and skips the calendar', async () => {
        const repos = Array.from({ length: 60 }, (_, i) => ({
            full_name: `faheem-naeem/repo-${i}`,
            fork: i === 1,
            stargazers_count: 1,
        }));
        const rest: Route = (url) => {
            if (url.endsWith('/users/faheem-naeem'))
                return json({
                    login: 'faheem-naeem',
                    followers: 3,
                    public_repos: 60,
                });
            if (url.includes('/users/faheem-naeem/repos')) return json(repos);
            if (url.endsWith('/languages'))
                return json({ TypeScript: 100, Shell: 10 });
            if (url.includes('/commits?author=faheem-naeem'))
                return json([
                    {
                        html_url: `https://github.com/${url.split('/repos/')[1]?.split('/commits')[0]}/commit/1`,
                        commit: {
                            message: 'msg',
                            author: { date: '2026-11-16T00:00:00Z' },
                        },
                    },
                ]);
            return undefined;
        };
        const kv = createFakeKV();
        const f = fakeFetch(rest, waka);
        const r = await refresh(
            { METRICS: kv.binding, WAKATIME_API_KEY: 'k' },
            { fetch: f.fn, now: () => NOW, login: 'faheem-naeem' },
        );
        expect(r.subrequests).toBe(2 + MAX_LANGUAGE_REPOS + 3 + 2);
        expect(r.subrequests).toBeLessThan(SUBREQUEST_BUDGET);
        const g = r.snapshot.github!.data;
        expect(g.source).toBe('rest');
        expect(g.calendar).toBeNull();
        expect(g.streaks).toBeNull();
        expect(g.stars).toBe(59);
        expect(g.reposScanned).toBe(MAX_LANGUAGE_REPOS);
        expect(g.languages[0]?.name).toBe('TypeScript');
        expect(g.commits).toHaveLength(3);
        const headers = f.calls[0]!.init?.headers as Record<string, string>;
        expect(headers.Authorization).toBeUndefined();
        expect(headers['User-Agent']).toBe(USER_AGENT);
    });
});
