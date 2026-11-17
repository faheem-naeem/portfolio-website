// Assembles the manual page model from @faheem/data + app-local content.
import {
    getManual,
    getResume,
    getSite,
    type Manual,
    type Resume,
} from '@faheem/data';
import { escapeHtml } from '@faheem/ui';
import { SECTION_PLAN, type SectionPlan } from '../content';
import { renderMarkdown, slugify, splitSections } from './markdown';

export interface RenderedSection {
    id: string;
    title: string;
    html: string;
    clock: boolean;
}

export interface SupportLink {
    label: string;
    href: string;
}

export function supportLinks(resume: Resume): SupportLink[] {
    const links: SupportLink[] = [
        { label: 'LinkedIn', href: resume.links.linkedin },
    ];
    if (resume.links.github) {
        links.push({ label: 'GitHub', href: resume.links.github });
    }
    links.push(
        { label: 'Email', href: `mailto:${resume.links.email}` },
        {
            label: 'Interview request form',
            href: `${getSite('api').url}/contact`,
        },
        { label: 'Portfolio', href: resume.links.website },
        { label: 'Resume', href: getSite('resume').url },
        { label: 'Ask the AI version of me', href: getSite('ask').url },
    );
    return links;
}

function supportHtml(resume: Resume): string {
    const items = supportLinks(resume)
        .map(
            (l) =>
                `<li><a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a> <span class="print-url">${escapeHtml(l.href.replace(/^(https:\/\/|mailto:)/, ''))}</span></li>`,
        )
        .join('');
    return `<p>Open a ticket through any of these channels. Response time: about one working day.</p><ul class="support-links">${items}</ul>`;
}

function focusHtml(resume: Resume): string {
    const items = resume.focusAreas
        .map((a) => `<li>${escapeHtml(a)}</li>`)
        .join('');
    return `<ul>${items}</ul>`;
}

/** Builds the ordered list of sections. Pure: pass data in for tests. */
export function buildSections(
    manual: Manual = getManual(),
    resume: Resume = getResume(),
    plan: SectionPlan[] = SECTION_PLAN,
): RenderedSection[] {
    const { sections: dataSections } = splitSections(manual.body);
    const used = new Set(
        plan.flatMap((p) => (p.source.kind === 'data' ? [p.source.heading] : [])),
    );
    const ids = new Set<string>();
    const uniqueId = (id: string) => {
        let candidate = id || 'section';
        for (let n = 2; ids.has(candidate); n++) candidate = `${id}-${n}`;
        ids.add(candidate);
        return candidate;
    };

    const out: RenderedSection[] = [];
    for (const p of plan) {
        const src = p.source;
        if (src.kind === 'rest') {
            for (const s of dataSections.filter((d) => !used.has(d.heading))) {
                out.push({
                    id: uniqueId(slugify(s.heading)),
                    title: s.heading,
                    html: renderMarkdown(s.markdown),
                    clock: false,
                });
            }
            continue;
        }
        let html = '';
        if (src.kind === 'app') html = renderMarkdown(src.markdown);
        else if (src.kind === 'focus') html = focusHtml(resume);
        else if (src.kind === 'support') html = supportHtml(resume);
        else {
            const found = dataSections.find((d) => d.heading === src.heading);
            const parts = [found?.markdown, src.extra].filter(
                (x): x is string => Boolean(x),
            );
            // Keep clock sections even if the data heading disappears.
            if (!parts.length && !p.clock) continue;
            html = parts.length ? renderMarkdown(parts.join('\n\n')) : '';
        }
        out.push({
            id: uniqueId(p.id),
            title: p.title,
            html,
            clock: Boolean(p.clock),
        });
    }
    return out;
}
