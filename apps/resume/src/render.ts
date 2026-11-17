// Renders resume sections as ANSI-coloured text, max 80 columns. The browser
// terminal reuses this output via ansiToHtml, and ?nocolor via stripAnsi.
import {
    getProjects,
    getResume,
    type Resume,
    type SkillLevel,
} from '@faheem/data';
import { paint, visibleWidth } from './ansi';
import { bannerLines } from './banner';

/** Hard limit is 80 columns; leave a little room for terminals that wrap at 80. */
export const WIDTH = 78;
export const HOST = 'resume.faheemnaeem.dev';

export const SECTIONS = [
    'whoami',
    'skills',
    'experience',
    'projects',
    'contact',
] as const;
export type Section = (typeof SECTIONS)[number];

/** Word-wraps plain text. Continuation lines get `indent`; the first gets `first`. */
export function wrap(
    text: string,
    width = WIDTH,
    indent = '',
    first = indent,
): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = first;
    let lineHasWord = false;
    for (const word of words) {
        const candidate = lineHasWord ? `${line} ${word}` : `${line}${word}`;
        if (lineHasWord && visibleWidth(candidate) > width) {
            lines.push(line);
            line = `${indent}${word}`;
        } else {
            line = candidate;
        }
        lineHasWord = true;
    }
    if (lineHasWord) lines.push(line);
    // Break any single word that is still too long (e.g. a very long URL).
    return lines.flatMap((l) => {
        if (visibleWidth(l) <= width) return [l];
        const chars = [...l];
        const out: string[] = [];
        for (let i = 0; i < chars.length; i += width) {
            out.push(chars.slice(i, i + width).join(''));
        }
        return out;
    });
}

function heading(title: string): string[] {
    const label = ` ${title.toUpperCase()} `;
    const rule = '─'.repeat(Math.max(0, WIDTH - label.length - 2));
    return ['', `${paint('──', 'dim')}${paint(label, 'bold', 'cyan')}${paint(rule, 'dim')}`, ''];
}

/** Email is a placeholder in @faheem/data on purpose; never print it. */
export function publicEmail(resume: Resume): string | null {
    const email = resume.links.email as string;
    return email && !/^<.*>$/.test(email) ? email : null;
}

function years(start: string, end: string | null): string {
    const s = start.slice(0, 4);
    const e = end ? end.slice(0, 4) : 'present';
    return s === e ? s : `${s} – ${e}`;
}

export function renderWhoami(): string[] {
    const r = getResume();
    const lines: string[] = [];
    const banner = bannerLines(r.name, WIDTH);
    if (banner) {
        lines.push('', ...banner.map((row) => paint(row, 'bold', 'cyan')));
    } else {
        lines.push('', paint(r.name, 'bold', 'cyan'));
    }
    lines.push(
        '',
        `${paint(r.name, 'bold')} ${paint('·', 'dim')} ${paint(r.title, 'green')}`,
        paint(`${r.location} · ${r.yearsOfExperience}+ years of experience`, 'dim'),
        '',
        ...wrap(r.tagline).map((l) => paint(l, 'yellow')),
        '',
        ...wrap(r.summary),
        '',
        paint('Focus areas', 'bold'),
        ...r.focusAreas.flatMap((f) => wrap(f, WIDTH, '    ', `  ${paint('›', 'cyan')} `)),
    );
    return lines;
}

const BAR: Record<SkillLevel, number> = { expert: 10, proficient: 7, familiar: 4 };
const LEVEL_COLOUR = { expert: 'green', proficient: 'cyan', familiar: 'yellow' } as const;

export function renderSkills(): string[] {
    const r = getResume();
    const lines = heading('Skills');
    const nameWidth = Math.min(
        26,
        Math.max(...r.skills.flatMap((g) => g.items.map((i) => i.name.length))),
    );
    r.skills.forEach((group, gi) => {
        if (gi > 0) lines.push('');
        lines.push(paint(group.group, 'bold'));
        for (const item of group.items) {
            const name = item.name.slice(0, nameWidth).padEnd(nameWidth);
            const n = BAR[item.level];
            const bar = paint('▇'.repeat(n), LEVEL_COLOUR[item.level]);
            const pad = ' '.repeat(10 - n);
            const meta = paint(`${item.level.padEnd(10)} ${String(item.years).padStart(2)}y`, 'dim');
            lines.push(`  ${name}  ${bar}${pad}  ${meta}`);
        }
    });
    if (r.skills.some((g) => g.sample)) {
        lines.push('', paint('  (skill levels are approximate)', 'dim'));
    }
    return lines;
}

export function renderExperience(): string[] {
    const r = getResume();
    const lines = heading('Experience');
    r.experience.forEach((job, i) => {
        if (i > 0) lines.push('');
        lines.push(
            `${paint(job.role, 'bold')} ${paint('@', 'dim')} ${paint(job.company, 'green')}`,
            paint(`${years(job.start, job.end)} · ${job.location}`, 'dim'),
        );
        for (const h of job.highlights) {
            lines.push(...wrap(h, WIDTH, '    ', `  ${paint('•', 'cyan')} `));
        }
        if (job.tech.length) {
            lines.push(...wrap(job.tech.join(' · '), WIDTH, '    ', '    ').map((l) => paint(l, 'magenta')));
        }
    });
    lines.push(...heading('Education'));
    for (const ed of r.education) {
        lines.push(
            paint(ed.degree, 'bold'),
            ...wrap(`${ed.institution} · ${years(ed.start, ed.end)}${ed.note ? ` · ${ed.note}` : ''}`, WIDTH, '  ', '  ').map((l) =>
                paint(l, 'dim'),
            ),
        );
    }
    if (r.certifications.length) {
        lines.push('', paint('Certifications', 'bold'));
        for (const c of r.certifications) {
            lines.push(...wrap(`${c.name} — ${c.issuer} (${c.year})`, WIDTH, '    ', `  ${paint('›', 'cyan')} `));
        }
    }
    return lines;
}

export function renderProjects(): string[] {
    const r = getResume();
    const lines = heading('Projects');
    r.selectedWork.forEach((w, i) => {
        if (i > 0) lines.push('');
        lines.push(
            `${paint(w.title, 'bold')} ${paint(`[${w.category}]`, 'dim')}`,
            ...wrap(w.description, WIDTH, '  ', '  '),
            ...wrap(w.tech.join(' · '), WIDTH, '  ', '  ').map((l) => paint(l, 'magenta')),
        );
    });
    // Only real side projects; entries marked sample are placeholders.
    for (const p of getProjects().filter((p) => !p.sample)) {
        lines.push(
            '',
            `${paint(p.name, 'bold')} ${paint(`[${p.status}]`, 'dim')}`,
            ...wrap(p.description, WIDTH, '  ', '  '),
            ...wrap(p.tech.join(' · '), WIDTH, '  ', '  ').map((l) => paint(l, 'magenta')),
        );
        const url = p.liveUrl ?? p.repoUrl;
        if (url) lines.push(`  ${paint(url, 'blue')}`);
    }
    return lines;
}

export function contactEntries(): Array<[string, string]> {
    const r = getResume();
    const entries: Array<[string, string]> = [
        ['Website', r.links.website],
        ['LinkedIn', r.links.linkedin],
    ];
    if (r.links.github) entries.push(['GitHub', r.links.github]);
    const email = publicEmail(r);
    if (email) entries.push(['Email', email]);
    return entries;
}

export function renderContact(): string[] {
    const lines = heading('Contact');
    for (const [label, value] of contactEntries()) {
        lines.push(`  ${paint(label.padEnd(9), 'bold')} ${paint(value, 'blue')}`);
    }
    lines.push(
        '',
        ...wrap('A PDF resume is available on request: send a message on LinkedIn.', WIDTH, '  ', '  ').map((l) =>
            paint(l, 'dim'),
        ),
    );
    return lines;
}

const RENDERERS: Record<Section, () => string[]> = {
    whoami: renderWhoami,
    skills: renderSkills,
    experience: renderExperience,
    projects: renderProjects,
    contact: renderContact,
};

export function renderSection(section: Section): string[] {
    return RENDERERS[section]();
}

function footer(): string[] {
    return [
        '',
        paint('─'.repeat(WIDTH), 'dim'),
        ...wrap(
            `Sections: curl ${HOST}/{skills,experience,projects,contact}`,
        ).map((l) => paint(l, 'dim')),
        ...wrap(`No colour: ?nocolor · JSON: ${HOST}/resume.json`).map((l) =>
            paint(l, 'dim'),
        ),
        '',
    ];
}

/** Full text document for terminal clients: one section, or everything. */
export function renderText(section?: Section): string {
    const body = section
        ? renderSection(section)
        : SECTIONS.flatMap((s) => renderSection(s));
    return [...body, ...footer()].join('\n');
}

/** Help text for the browser terminal. */
export function renderHelp(): string[] {
    const linkedin = getResume().links.linkedin;
    const cmds: Array<[string, string]> = [
        ['help', 'show this help'],
        ['whoami', 'who is this person?'],
        ['skills', 'skills as bar charts'],
        ['experience', 'work history and education'],
        ['projects', 'selected work'],
        ['contact', 'how to reach me'],
        ['theme', 'switch colour theme (auto, phosphor, amber)'],
        ['clear', 'clear the screen'],
        ['exit', 'back to faheemnaeem.dev'],
    ];
    return [
        paint('Available commands', 'bold'),
        ...cmds.map(([c, d]) => `  ${paint(c.padEnd(11), 'cyan')} ${d}`),
        '',
        paint('Tab completes, ↑/↓ browse history.', 'dim'),
        ...wrap(`PDF resume: available on request via LinkedIn ${linkedin}`).map((l) =>
            paint(l, 'dim'),
        ),
    ];
}
