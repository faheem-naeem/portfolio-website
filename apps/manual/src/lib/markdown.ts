// Build-time markdown rendering with `marked`. Raw HTML in the source is never
// passed through: it is escaped and shown as text. GitHub-style alerts
// (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`) become callouts.
import { escapeHtml } from '@faheem/ui';
import { Marked, type Token, type Tokens } from 'marked';

export const CALLOUT_TYPES = ['note', 'tip', 'warning'] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

export const CALLOUT_LABELS: Record<CalloutType, string> = {
    note: 'Note',
    tip: 'Tip',
    warning: 'Warning',
};

/** Shared callout markup (also used by Callout.astro, keep in sync). */
export function calloutHtml(type: CalloutType, innerHtml: string): string {
    return `<aside class="callout callout--${type}" aria-label="${CALLOUT_LABELS[type]}"><p class="callout__title">${CALLOUT_LABELS[type]}</p>${innerHtml}</aside>`;
}

const ALERT_RE = /^<p>\[!(NOTE|TIP|WARNING)\][ \t]*\n?/i;

export const markdown = new Marked({
    gfm: true,
    renderer: {
        html({ text }: Tokens.HTML | Tokens.Tag): string {
            return escapeHtml(text);
        },
        blockquote({ tokens }: Tokens.Blockquote): string {
            const inner = this.parser.parse(tokens);
            const match = ALERT_RE.exec(inner);
            if (!match?.[1]) return `<blockquote>${inner}</blockquote>`;
            const type = match[1].toLowerCase() as CalloutType;
            const rest = inner.slice(match[0].length).replace(/^<\/p>\s*/, '');
            const body = rest.startsWith('<') || rest === '' ? rest : `<p>${rest}`;
            return calloutHtml(type, body);
        },
    },
});

/** Renders markdown to HTML synchronously. */
export function renderMarkdown(source: string): string {
    return markdown.parse(source, { async: false });
}

/** Lowercase-kebab id from a heading. */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export interface MarkdownSection {
    heading: string;
    /** Markdown under the heading (without the heading line). */
    markdown: string;
}

/**
 * Splits markdown on `## ` headings. Text before the first `## ` heading is
 * returned as `intro`.
 */
export function splitSections(source: string): {
    intro: string;
    sections: MarkdownSection[];
} {
    const tokens = markdown.lexer(source);
    let intro = '';
    const sections: MarkdownSection[] = [];
    for (const token of tokens as Token[]) {
        if (token.type === 'heading' && (token as Tokens.Heading).depth === 2) {
            sections.push({
                heading: (token as Tokens.Heading).text.trim(),
                markdown: '',
            });
            continue;
        }
        const current = sections.at(-1);
        if (current) current.markdown += token.raw;
        else intro += token.raw;
    }
    return {
        intro: intro.trim(),
        sections: sections.map((s) => ({ ...s, markdown: s.markdown.trim() })),
    };
}
