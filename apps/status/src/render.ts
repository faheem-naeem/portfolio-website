// Server-side HTML for the status page. No client JS.
import type { Incident } from '@faheem/data';
import { escapeHtml as e, layout } from '@faheem/ui';
import {
    STATE_LABEL,
    type ComponentState,
    type ProjectStatus,
    type StatusModel,
} from './model';
import { dayLabel, formatPercent, shortDate, type DayUptime } from './uptime';

/** Status colours: every one has >= 3:1 contrast on the page background
 *  (>= 4.5:1 for those also used as text). Colour is never the only cue. */
export const PAGE_CSS = `
:root{--ok:#1e6b2a;--warn:#8a5300;--bad:#a82020;--maint:#274c8d;--none:#7a8381}
@media (prefers-color-scheme:dark){:root{--ok:#7cc47f;--warn:#f0b54a;--bad:#f28b82;--maint:#9bb8f0;--none:#6f7a78}}
.s-sec{margin-block:var(--space-6)}
.banner{display:flex;gap:var(--space-3);align-items:center;padding:var(--space-4);border:2px solid currentColor;background:var(--color-surface)}
.banner h1{margin:0;font-size:var(--font-size-xl);color:inherit}
.banner p{margin:0}
.ico{display:inline-grid;place-items:center;width:1.5em;height:1.5em;font-weight:bold;flex:none}
.banner .ico{font-size:var(--font-size-xl)}
.st-operational{color:var(--ok)}.st-degraded{color:var(--warn)}.st-outage{color:var(--bad)}.st-maintenance{color:var(--maint)}.st-unknown{color:var(--color-muted)}
.meta{color:var(--color-muted);font-size:var(--font-size-sm)}
.comps{list-style:none;padding:0;margin:0;border:1px solid var(--color-border);background:var(--color-surface)}
.comp{padding:var(--space-3) var(--space-4);border-top:1px solid var(--color-border)}
.comp:first-child{border-top:0}
.comp-h{display:flex;flex-wrap:wrap;justify-content:space-between;gap:var(--space-2);align-items:baseline}
.comp h3{margin:0;font-size:var(--font-size-lg);color:var(--color-text)}
.comp p{margin:var(--space-1) 0 0}
.state{font-weight:bold;white-space:nowrap}
.bars{display:flex;gap:1px;height:2.25rem;margin-top:var(--space-3)}
.b{position:relative;flex:1;min-width:0;background:var(--none)}
.b.g{background:var(--ok)}.b.w{background:var(--warn)}.b.x{background:var(--bad)}
.b.n{background:repeating-linear-gradient(45deg,var(--none) 0 2px,transparent 2px 4px);outline:1px solid var(--none);outline-offset:-1px}
.b:hover::after{content:attr(aria-label);position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);z-index:1;padding:2px 6px;white-space:nowrap;font-size:var(--font-size-xs);background:var(--color-text);color:var(--color-bg)}
.axis{display:flex;justify-content:space-between;font-size:var(--font-size-xs);color:var(--color-muted)}
.legend{display:flex;flex-wrap:wrap;gap:var(--space-2) var(--space-4);list-style:none;padding:0;font-size:var(--font-size-sm)}
.legend .b{display:inline-block;width:.75rem;height:.75rem;vertical-align:middle;margin-right:var(--space-1)}
.inc{padding:var(--space-4);border:1px solid var(--color-border);background:var(--color-surface);margin-bottom:var(--space-4)}
.inc h3{font-size:var(--font-size-lg)}
.inc ol{padding-left:var(--space-5);margin:var(--space-2) 0 0}
.sev{font-weight:bold;text-transform:capitalize}
`;

const ICON: Record<ComponentState, string> = {
    operational: '✓',
    degraded: '!',
    outage: '✕',
    maintenance: '⚙',
    unknown: '?',
};

const BAR_CLASS: Record<DayUptime['level'], string> = {
    good: 'g',
    warn: 'w',
    bad: 'x',
    none: 'n',
};

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

/** "Nov 17, 2026, 14:20 UTC" */
export function formatDateTime(ms: number): string {
    const d = new Date(ms);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

function time(ms: number): string {
    return `<time datetime="${new Date(ms).toISOString()}">${formatDateTime(ms)}</time>`;
}

function stateBadge(state: ComponentState): string {
    return `<span class="state st-${state}"><span class="ico" aria-hidden="true">${ICON[state]}</span>${STATE_LABEL[state]}</span>`;
}

function formatDuration(ms: number): string {
    const minutes = Math.round(ms / 60_000);
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
}

function renderBanner(model: StatusModel): string {
    const { state, label } = model.overall;
    return `<section class="banner st-${state}" aria-labelledby="banner"><span class="ico" aria-hidden="true">${ICON[state]}</span><div><h1 id="banner">${e(label)}</h1><p class="meta">Updated ${time(Date.parse(model.generatedAt))}. Checks run every 10 minutes.</p></div></section>`;
}

function renderFaheem(model: StatusModel): string {
    const items = model.faheem.components
        .map(
            (c) =>
                `<li class="comp"><div class="comp-h"><h3>${e(c.name)}</h3>${stateBadge(c.state)}</div><p>${e(c.message)}</p></li>`,
        )
        .join('');
    const note = model.faheem.sample
        ? '<p class="meta">Tongue-in-cheek components. SAMPLE data.</p>'
        : '<p class="meta">Tongue-in-cheek components.</p>';
    return `<section class="s-sec" aria-labelledby="faheem"><h2 id="faheem">Faheem</h2>${note}<ul class="comps">${items}</ul></section>`;
}

/** Table rows; consecutive "No data" days collapse into one row. */
function uptimeRows(days: readonly DayUptime[]): string {
    let out = '';
    for (let i = 0; i < days.length; i++) {
        const d = days[i];
        if (!d) continue;
        if (d.uptime === null) {
            let j = i;
            while (days[j + 1]?.uptime === null) j++;
            const last = days[j];
            const range =
                j > i && last ? `${d.label} – ${last.label}` : d.label;
            out += `<tr><th scope="row">${range}</th><td>No data</td><td>0</td></tr>`;
            i = j;
        } else {
            out += `<tr><th scope="row">${d.label}</th><td>${formatPercent(d.uptime)}</td><td>${d.total}</td></tr>`;
        }
    }
    return out;
}

function renderProject(p: ProjectStatus, index: number): string {
    const id = `p${index}`;
    const latest = p.latest
        ? `HTTP ${p.latest.statusCode ?? 'error'} · ${p.latest.latencyMs} ms · checked ${time(p.latest.checkedAt)}`
        : 'Not checked yet';
    const bars = p.days
        .map((d) => {
            const label = dayLabel(d);
            return `<span class="b ${BAR_CLASS[d.level]}" role="img" aria-label="${label}"></span>`;
        })
        .join('');
    return `<li class="comp"><div class="comp-h"><h3 id="${id}">${e(p.name)}</h3>${stateBadge(p.state)}</div>
<p class="meta"><a href="${e(p.url)}">${e(p.url.replace(/^https:\/\//, ''))}</a> · ${latest}</p>
<p>${formatPercent(p.uptime90d)}${p.uptime90d === null ? '' : ' uptime'} over the last 90 days</p>
<div class="bars" role="group" aria-label="Daily uptime for ${e(p.name)}, oldest first">${bars}</div>
<div class="axis" aria-hidden="true"><span>90 days ago</span><span>Today</span></div>
<table class="visually-hidden"><caption>Daily uptime for ${e(p.name)}, last 90 days</caption><thead><tr><th scope="col">Date</th><th scope="col">Uptime</th><th scope="col">Checks</th></tr></thead><tbody>${uptimeRows(p.days)}</tbody></table></li>`;
}

function renderProjects(model: StatusModel): string {
    const list = model.projects.length
        ? `<ul class="comps">${model.projects.map(renderProject).join('')}</ul>`
        : '<p>No projects are monitored yet.</p>';
    const legend = `<ul class="legend" aria-label="Uptime bar key"><li><span class="b g"></span>99.9% or more</li><li><span class="b w"></span>95% to 99.9%</li><li><span class="b x"></span>Below 95%</li><li><span class="b n"></span>No data</li></ul>`;
    return `<section class="s-sec" aria-labelledby="projects"><h2 id="projects">Projects</h2><p class="meta">Real HTTP checks every 10 minutes (10 s timeout). One bar per day (UTC); hover a bar for details.</p>${list}${legend}</section>`;
}

function renderIncident(i: Incident): string {
    const start = Date.parse(i.startedAt);
    const resolved =
        i.resolvedAt === null
            ? '<strong>Ongoing</strong>'
            : `Resolved ${time(Date.parse(i.resolvedAt))} (${formatDuration(Date.parse(i.resolvedAt) - start)})`;
    const updates = i.updates
        .map((u) => `<li>${time(Date.parse(u.at))}: ${e(u.message)}</li>`)
        .join('');
    return `<article class="inc" aria-labelledby="i-${e(i.id)}"><h3 id="i-${e(i.id)}">${e(i.title)}</h3>
<p class="meta"><span class="sev">${e(i.severity)}</span> · ${e(i.component)} · Started ${time(start)} · ${resolved}</p>
<p>${e(i.summary)}</p><h4 class="visually-hidden">Updates</h4><ol>${updates}</ol></article>`;
}

function renderIncidents(model: StatusModel): string {
    const body = model.incidents.length
        ? model.incidents.map(renderIncident).join('')
        : '<p>No incidents reported.</p>';
    return `<section class="s-sec" aria-labelledby="incidents"><h2 id="incidents">Incident history</h2>${body}</section>`;
}

export function renderPage(model: StatusModel): string {
    const body = [
        renderBanner(model),
        renderFaheem(model),
        renderProjects(model),
        renderIncidents(model),
        `<p class="meta">Machine-readable: <a href="/api/status.json">/api/status.json</a>. Last 90 days, times in UTC, generated ${shortDate(Date.parse(model.generatedAt))}.</p>`,
    ].join('\n');
    return layout({
        title: 'Status',
        current: 'status',
        description: `${model.overall.label}. Live uptime of Faheem's projects, plus a few less serious components.`,
        head: `<style>${PAGE_CSS}</style>`,
        body,
    });
}
