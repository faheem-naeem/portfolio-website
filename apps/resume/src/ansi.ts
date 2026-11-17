// Tiny ANSI helpers: colour text for terminals, strip it for ?nocolor, and turn
// it into HTML spans for the browser terminal.
import { escapeHtml } from '@faheem/ui';

const ESC = '\x1b[';

export const SGR = {
    reset: 0,
    bold: 1,
    dim: 2,
    green: 32,
    yellow: 33,
    blue: 34,
    magenta: 35,
    cyan: 36,
} as const;

export type Style = keyof typeof SGR;

/** Wraps text in ANSI codes. Each call resets afterwards, so styles never leak. */
export function paint(text: string, ...styles: Style[]): string {
    if (!text || styles.length === 0) return text;
    const codes = styles.map((s) => SGR[s]).join(';');
    return `${ESC}${codes}m${text}${ESC}0m`;
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
    return text.replace(ANSI_RE, '');
}

/** Visible width of a line (all characters we emit are single-column). */
export function visibleWidth(line: string): number {
    return [...stripAnsi(line)].length;
}

const CLASS_BY_CODE: Record<number, string> = {
    1: 't-bold',
    2: 't-dim',
    32: 't-green',
    33: 't-yellow',
    34: 't-blue',
    35: 't-magenta',
    36: 't-cyan',
};

const URL_RE = /https:\/\/[^\s<>"']+/g;

function linkify(escaped: string): string {
    return escaped.replace(URL_RE, (url) => {
        const trimmed = url.replace(/[.,)]+$/, '');
        const rest = url.slice(trimmed.length);
        return `<a href="${trimmed}">${trimmed}</a>${rest}`;
    });
}

/** Converts our ANSI output into escaped HTML with class-based spans and links. */
export function ansiToHtml(text: string): string {
    // eslint-disable-next-line no-control-regex
    const parts = text.split(/\x1b\[([0-9;]*)m/);
    let active: string[] = [];
    let html = '';
    parts.forEach((part, i) => {
        if (i % 2 === 1) {
            const codes = part.split(';').map((n) => Number(n || 0));
            for (const code of codes) {
                if (code === 0) active = [];
                else {
                    const cls = CLASS_BY_CODE[code];
                    if (cls && !active.includes(cls)) active.push(cls);
                }
            }
            return;
        }
        if (!part) return;
        const content = linkify(escapeHtml(part));
        html += active.length
            ? `<span class="${active.join(' ')}">${content}</span>`
            : content;
    });
    return html;
}
