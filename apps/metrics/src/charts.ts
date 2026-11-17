// Small hand-written inline SVG charts. Colours come from CSS classes in
// PAGE_CSS (no inline style attributes, so the CSP needs no 'unsafe-inline').
import { escapeHtml as e } from '@faheem/ui';
import type { Calendar, DayHours, LanguageShare } from './snapshot';
import { DAY_MS, dayMs, formatHours, isoDay } from './transform';

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
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Nov 17, 2026" */
export function longDate(iso: string): string {
    const d = new Date(dayMs(iso));
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function plural(n: number, word: string): string {
    return `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------- heatmap

const CELL = 10;
const PITCH = 12;
const LEFT = 26;
const TOP = 14;

export function heatmapSvg(cal: Calendar): string {
    const startMs = dayMs(cal.start);
    const offset = new Date(startMs).getUTCDay();
    const cols = Math.ceil((cal.counts.length + offset) / 7);
    const width = LEFT + cols * PITCH;
    const height = TOP + 7 * PITCH;
    let cells = '';
    let months = '';
    let lastMonth = -1;
    cal.counts.forEach((count, i) => {
        const slot = i + offset;
        const col = Math.floor(slot / 7);
        const row = slot % 7;
        const iso = isoDay(startMs + i * DAY_MS);
        const level = cal.levels[i] ?? 0;
        const x = LEFT + col * PITCH;
        cells += `<rect class="h${level}" x="${x}" y="${TOP + row * PITCH}" width="${CELL}" height="${CELL}" rx="2"><title>${plural(count, 'contribution')} on ${longDate(iso)}</title></rect>`;
        const month = new Date(startMs + i * DAY_MS).getUTCMonth();
        // Label a month at the first column whose Sunday falls in it (skip a
        // partial first column so labels do not collide).
        if (row === 0 && month !== lastMonth) {
            if (col > 0 || offset === 0)
                months += `<text x="${x}" y="10">${MONTHS[month]}</text>`;
            lastMonth = month;
        }
    });
    const days = [1, 3, 5]
        .map(
            (r) =>
                `<text x="0" y="${TOP + r * PITCH + CELL - 1}">${WEEKDAYS[r]}</text>`,
        )
        .join('');
    const label = `Contribution heatmap: ${plural(cal.total, 'contribution')} from ${longDate(cal.start)} to ${longDate(isoDay(startMs + (cal.counts.length - 1) * DAY_MS))}. A table version follows.`;
    return `<svg class="heat" viewBox="0 0 ${width} ${height}" role="img" aria-label="${e(label)}"><g class="axis-t" aria-hidden="true">${months}${days}</g>${cells}</svg>`;
}

export function heatmapLegend(): string {
    const swatches = [0, 1, 2, 3, 4]
        .map(
            (l) =>
                `<svg class="sw" viewBox="0 0 10 10" aria-hidden="true"><rect class="h${l}" width="10" height="10" rx="2"/></svg>`,
        )
        .join('');
    return `<p class="heat-legend"><span>Less</span>${swatches}<span>More</span></p>`;
}

export interface MonthRow {
    label: string;
    total: number;
    activeDays: number;
    busiest: { date: string; count: number } | null;
}

export function monthRows(cal: Calendar): MonthRow[] {
    const startMs = dayMs(cal.start);
    const rows: MonthRow[] = [];
    let current: MonthRow | null = null;
    let key = '';
    cal.counts.forEach((count, i) => {
        const iso = isoDay(startMs + i * DAY_MS);
        const k = iso.slice(0, 7);
        if (k !== key) {
            const d = new Date(startMs + i * DAY_MS);
            current = {
                label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
                total: 0,
                activeDays: 0,
                busiest: null,
            };
            rows.push(current);
            key = k;
        }
        const row = current as unknown as MonthRow;
        row.total += count;
        if (count > 0) row.activeDays++;
        if (count > 0 && (!row.busiest || count > row.busiest.count))
            row.busiest = { date: iso, count };
    });
    return rows;
}

export function heatmapTable(cal: Calendar): string {
    const body = monthRows(cal)
        .map(
            (r) =>
                `<tr><th scope="row">${r.label}</th><td>${r.total.toLocaleString('en-US')}</td><td>${r.activeDays}</td><td>${r.busiest ? `${longDate(r.busiest.date)} (${r.busiest.count})` : '–'}</td></tr>`,
        )
        .join('');
    return `<table class="tbl"><caption>Contributions per month</caption><thead><tr><th scope="col">Month</th><th scope="col">Contributions</th><th scope="col">Active days</th><th scope="col">Busiest day</th></tr></thead><tbody>${body}</tbody></table>`;
}

// ---------------------------------------------------------------- donut

/** Categorical slot classes, fixed order; "Other" is always neutral grey. */
export function sliceClass(name: string, index: number): string {
    return name === 'Other' ? 'c-other' : `c${(index % 6) + 1}`;
}

export function donutSvg(langs: LanguageShare[]): string {
    const r = 15.915; // circumference ~= 100, so dash lengths are percentages
    const gap = langs.length > 1 ? 0.6 : 0;
    let offset = 0;
    const arcs = langs
        .map((l, i) => {
            const len = Math.max(l.percent - gap, 0.2);
            const arc = `<circle class="${sliceClass(l.name, i)}" cx="21" cy="21" r="${r}" fill="none" stroke-width="7" stroke-dasharray="${len.toFixed(2)} ${(100 - len).toFixed(2)}" stroke-dashoffset="${(25 - offset).toFixed(2)}"/>`;
            offset += l.percent;
            return arc;
        })
        .join('');
    const summary = langs.map((l) => `${l.name} ${l.percent}%`).join(', ');
    return `<svg class="donut" viewBox="0 0 42 42" role="img" aria-label="${e(`Language share by bytes: ${summary}`)}">${arcs}</svg>`;
}

export function shareLegend(
    items: { name: string; percent: number; extra?: string }[],
): string {
    const li = items
        .map(
            (l, i) =>
                `<li><svg class="sw" viewBox="0 0 10 10" aria-hidden="true"><rect class="${sliceClass(l.name, i)}" width="10" height="10" rx="2"/></svg><span class="lg-name">${e(l.name)}</span><span class="lg-val">${l.percent}%${l.extra ? ` · ${e(l.extra)}` : ''}</span></li>`,
        )
        .join('');
    return `<ul class="legend">${li}</ul>`;
}

// ---------------------------------------------------------------- hours bars

export function hoursSvg(days: DayHours[]): string {
    const n = days.length;
    const slot = 40;
    const width = n * slot;
    const plotTop = 16;
    const plotH = 90;
    const baseY = plotTop + plotH;
    const max = Math.max(...days.map((d) => d.seconds), 1);
    const bars = days
        .map((d, i) => {
            const h =
                d.seconds > 0 ? Math.max((d.seconds / max) * plotH, 2) : 0;
            const x = i * slot + 8;
            const dt = new Date(dayMs(d.date));
            const hours = (d.seconds / 3600).toFixed(1);
            return `<g><rect class="bar" x="${x}" y="${(baseY - h).toFixed(1)}" width="24" height="${h.toFixed(1)}" rx="3"><title>${WEEKDAYS[dt.getUTCDay()]} ${longDate(d.date)}: ${formatHours(d.seconds)}</title></rect><text class="v" x="${x + 12}" y="${(baseY - h - 4).toFixed(1)}">${hours}</text><text x="${x + 12}" y="${baseY + 14}">${WEEKDAYS[dt.getUTCDay()]}</text></g>`;
        })
        .join('');
    const summary = days
        .map(
            (d) =>
                `${WEEKDAYS[new Date(dayMs(d.date)).getUTCDay()]} ${formatHours(d.seconds)}`,
        )
        .join(', ');
    return `<svg class="hours" viewBox="0 0 ${width} ${baseY + 20}" role="img" aria-label="${e(`Coding hours per day, last 7 days: ${summary}`)}"><line class="base" x1="0" x2="${width}" y1="${baseY}" y2="${baseY}"/>${bars}</svg>`;
}
