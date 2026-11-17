// Server-rendered dashboard HTML. No client JavaScript.
import { escapeHtml as e, layout } from '@faheem/ui';
import {
    donutSvg,
    heatmapLegend,
    heatmapSvg,
    heatmapTable,
    hoursSvg,
    shareLegend,
} from './charts';
import { NOW, type NowContent } from './content';
import type { GithubData, Section, Snapshot, WakatimeData } from './snapshot';
import { formatHours } from './transform';

/** A snapshot older than this is labelled stale even if the last run "worked". */
export const STALE_AFTER_MS = 13 * 3_600_000; // two missed 6-hour runs + slack

/** Light/dark chart colours. Categorical slots validated for CVD separation on
 *  both surfaces; every slice also has a text label + percentage. */
export const PAGE_CSS = `
.m-root{--c1:#2a78d6;--c2:#eb6834;--c3:#1baf7a;--c4:#eda100;--c5:#e87ba4;--c6:#008300;--c-other:#8b8f8a;--h0:#e3e7dd;--h1:#b7d3f6;--h2:#6da7ec;--h3:#2a78d6;--h4:#184f95;--stale:#8a5300}
@media (prefers-color-scheme:dark){.m-root{--c1:#3987e5;--c2:#d95926;--c3:#199e70;--c4:#c98500;--c5:#d55181;--c6:#0ca30c;--c-other:#7d8784;--h0:#2a3836;--h1:#104281;--h2:#1c5cab;--h3:#3987e5;--h4:#86b6ef;--stale:#f0b54a}}
.m-sec{margin-block:var(--space-6)}
.meta{color:var(--color-muted);font-size:var(--font-size-sm)}
.badge{display:inline-block;padding:0 var(--space-2);border:2px solid var(--stale);color:var(--stale);font-weight:bold;font-size:var(--font-size-sm);margin-left:var(--space-2);vertical-align:middle}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:var(--space-3);list-style:none;padding:0;margin:0}
.tile{padding:var(--space-3) var(--space-4);border:1px solid var(--color-border);background:var(--color-surface)}
.tile b{display:block;font-family:var(--font-serif);font-size:var(--font-size-xl);color:var(--color-text)}
.tile span{color:var(--color-muted);font-size:var(--font-size-sm)}
.card{padding:var(--space-4);border:1px solid var(--color-border);background:var(--color-surface)}
.heat-wrap{overflow-x:auto}
.heat{display:block;width:100%;height:auto;min-width:34rem}
.heat .axis-t text,.hours text{font-size:8px;fill:var(--color-muted);font-family:var(--font-mono)}
.hours text{text-anchor:middle}.hours text.v{fill:var(--color-text)}
.h0{fill:var(--h0)}.h1{fill:var(--h1)}.h2{fill:var(--h2)}.h3{fill:var(--h3)}.h4{fill:var(--h4)}
.heat-legend{display:flex;align-items:center;gap:var(--space-1);justify-content:flex-end;font-size:var(--font-size-xs);color:var(--color-muted);margin:var(--space-2) 0 0}
.sw{width:.75rem;height:.75rem;flex:none}
details{margin-top:var(--space-3)}
summary{cursor:pointer;color:var(--color-link)}
.tbl{border-collapse:collapse;width:100%;font-size:var(--font-size-sm);margin-top:var(--space-2)}
.tbl caption{text-align:left;font-weight:bold;padding-bottom:var(--space-1)}
.tbl th,.tbl td{border-bottom:1px solid var(--color-border);padding:var(--space-1) var(--space-2);text-align:left}
.tbl td{font-variant-numeric:tabular-nums}
.split{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:var(--space-5);align-items:center}
.donut{display:block;width:100%;max-width:12rem;height:auto;margin-inline:auto}
circle.c1{stroke:var(--c1)}circle.c2{stroke:var(--c2)}circle.c3{stroke:var(--c3)}circle.c4{stroke:var(--c4)}circle.c5{stroke:var(--c5)}circle.c6{stroke:var(--c6)}circle.c-other{stroke:var(--c-other)}
rect.c1{fill:var(--c1)}rect.c2{fill:var(--c2)}rect.c3{fill:var(--c3)}rect.c4{fill:var(--c4)}rect.c5{fill:var(--c5)}rect.c6{fill:var(--c6)}rect.c-other{fill:var(--c-other)}
.legend{list-style:none;padding:0;margin:0}
.legend li{display:flex;align-items:center;gap:var(--space-2);padding:var(--space-1) 0;border-bottom:1px solid var(--color-border)}
.lg-name{flex:1}.lg-val{font-variant-numeric:tabular-nums;color:var(--color-muted)}
.hours{display:block;width:100%;max-width:28rem;height:auto}
.hours .bar{fill:var(--c1)}.hours .base{stroke:var(--color-border);stroke-width:1}
.commits{list-style:none;padding:0;margin:0}
.commits li{padding:var(--space-2) 0;border-bottom:1px solid var(--color-border);overflow-wrap:anywhere}
.commits .repo{display:block;font-size:var(--font-size-sm);color:var(--color-muted)}
.now{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:var(--space-4)}
.now ul{padding-left:var(--space-5);margin:0}
.notice{padding:var(--space-3) var(--space-4);border-left:4px solid var(--color-border);background:var(--color-surface)}
`;

const MONTHS = [
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

/** "Nov 17, 2026, 06:00 UTC" */
export function formatDateTime(iso: string): string {
    const d = new Date(iso);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

function time(iso: string): string {
    return `<time datetime="${e(iso)}">${formatDateTime(iso)}</time>`;
}

const STALE_BADGE = '<span class="badge">Stale</span>';

function isStale(
    section: Section<unknown>,
    nowMs: number,
    forced: boolean,
): boolean {
    return (
        forced ||
        section.stale ||
        nowMs - Date.parse(section.fetchedAt) > STALE_AFTER_MS
    );
}

function sectionMeta(section: Section<unknown>, stale: boolean): string {
    const why = stale
        ? ' The latest refresh failed or is overdue, so this is the last good data.'
        : '';
    return `<p class="meta">Fetched ${time(section.fetchedAt)}.${why}</p>`;
}

function n(v: number): string {
    return v.toLocaleString('en-US');
}

function renderGithub(sec: Section<GithubData>, stale: boolean): string {
    const g = sec.data;
    const tiles = [
        g.calendar ? [n(g.calendar.total), 'contributions (12 months)'] : null,
        g.streaks ? [`${n(g.streaks.current)} d`, 'current streak'] : null,
        g.streaks ? [`${n(g.streaks.longest)} d`, 'longest streak'] : null,
        [n(g.stars), 'stars'],
        [n(g.followers), 'followers'],
        [n(g.publicRepos), 'public repos'],
    ]
        .filter((t): t is string[] => t !== null)
        .map(([v, l]) => `<li class="tile"><b>${v}</b><span>${l}</span></li>`)
        .join('');

    const calendar = g.calendar
        ? `<div class="card"><div class="heat-wrap" tabindex="0" role="region" aria-label="Contribution heatmap (scrolls sideways)">${heatmapSvg(g.calendar)}</div>${heatmapLegend()}<details><summary>Show contributions as a table</summary>${heatmapTable(g.calendar)}</details></div>`
        : '<p class="notice">Connect a token to show the contribution calendar.</p>';

    const languages = g.languages.length
        ? `<div class="split">${donutSvg(g.languages)}${shareLegend(g.languages)}</div><p class="meta">By bytes of code across ${n(g.reposScanned)} public, non-fork repositories.</p>`
        : '<p>No language data yet.</p>';

    const commits = g.commits.length
        ? `<ol class="commits">${g.commits
              .map((c) => {
                  const msg = c.url
                      ? `<a href="${e(c.url)}">${e(c.message)}</a>`
                      : e(c.message);
                  return `<li><span class="repo">${e(c.repo)} · ${time(c.date)}</span>${msg}</li>`;
              })
              .join('')}</ol>`
        : '<p>No recent public commits.</p>';

    return `<section class="m-sec" aria-labelledby="gh"><h2 id="gh">GitHub${stale ? STALE_BADGE : ''}</h2>${sectionMeta(sec, stale)}<p><a href="${e(g.profileUrl)}">@${e(g.login)} on GitHub</a></p><ul class="tiles">${tiles}</ul></section>
<section class="m-sec" aria-labelledby="cal"><h2 id="cal">Contributions</h2>${calendar}</section>
<section class="m-sec" aria-labelledby="lang"><h2 id="lang">Top languages</h2>${languages}</section>
<section class="m-sec" aria-labelledby="commits"><h2 id="commits">Recent public commits</h2>${commits}</section>`;
}

function renderWakatime(sec: Section<WakatimeData>, stale: boolean): string {
    const w = sec.data;
    const bars = w.days.length
        ? `<div class="card">${hoursSvg(w.days)}<p class="meta">Hours per day (UTC dates).</p></div>`
        : '';
    const langs = w.languages.length
        ? `<h3>By language</h3>${shareLegend(w.languages.map((l) => ({ name: l.name, percent: l.percent, extra: formatHours(l.seconds) })))}`
        : '';
    const editors = w.editors.length
        ? `<h3>By editor</h3><ul class="legend">${w.editors
              .map(
                  (x) =>
                      `<li><span class="lg-name">${e(x.name)}</span><span class="lg-val">${x.percent}% · ${formatHours(x.seconds)}</span></li>`,
              )
              .join('')}</ul>`
        : '';
    return `<section class="m-sec" aria-labelledby="waka"><h2 id="waka">Coding time, last 7 days${stale ? STALE_BADGE : ''}</h2>${sectionMeta(sec, stale)}<ul class="tiles"><li class="tile"><b>${formatHours(w.totalSeconds)}</b><span>total (WakaTime)</span></li></ul>${bars}<div class="split">${langs ? `<div>${langs}</div>` : ''}${editors ? `<div>${editors}</div>` : ''}</div></section>`;
}

function renderNow(now: NowContent): string {
    const list = (items: NowContent['learning']) =>
        `<ul>${items.map((i) => `<li><strong>${e(i.title)}</strong> – ${e(i.detail)}</li>`).join('')}</ul>`;
    const note = now.sample
        ? '<p class="meta">SAMPLE content, to be replaced.</p>'
        : '';
    return `<section class="m-sec" aria-labelledby="now"><h2 id="now">Now</h2>${note}<div class="now"><div><h3>Currently learning</h3>${list(now.learning)}</div><div><h3>Now reading</h3>${list(now.reading)}</div></div></section>`;
}

export interface RenderInput {
    snapshot: Snapshot | null;
    fromLastGood: boolean;
    nowMs: number;
    now?: NowContent;
}

export function renderPage({
    snapshot,
    fromLastGood,
    nowMs,
    now = NOW,
}: RenderInput): string {
    let body = '<div class="m-root"><h1>Metrics</h1>';
    if (!snapshot) {
        body +=
            '<p class="notice">No data yet. The first refresh runs within 6 hours of deploying.</p>';
    } else {
        const anyStale =
            fromLastGood ||
            nowMs - Date.parse(snapshot.generatedAt) > STALE_AFTER_MS;
        body += `<p class="meta">Last updated ${time(snapshot.generatedAt)}. Refreshed every 6 hours.${anyStale ? STALE_BADGE : ''}</p>`;
        if (snapshot.github)
            body += renderGithub(
                snapshot.github,
                isStale(snapshot.github, nowMs, fromLastGood),
            );
        else body += '<p class="notice">GitHub data is not available yet.</p>';
        if (snapshot.wakatime)
            body += renderWakatime(
                snapshot.wakatime,
                isStale(snapshot.wakatime, nowMs, fromLastGood),
            );
    }
    body += `${renderNow(now)}<p class="meta">Machine-readable: <a href="/api/metrics.json">/api/metrics.json</a></p></div>`;
    return layout({
        title: 'Metrics',
        current: 'metrics',
        description:
            'Live coding dashboard: GitHub contributions, languages, recent commits and coding time.',
        head: `<style>${PAGE_CSS}</style>`,
        body,
    });
}
