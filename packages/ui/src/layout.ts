// Dependency-free HTML layout shared by every faheemnaeem.dev app.
// Returns a string, so it works in Workers (Hono `c.html(...)`) and in Astro.
import { getResume, getSites, type SiteId } from '@faheem/data';
import { allCss } from './styles';

export interface LayoutOptions {
    /** Page title (plain text; it is escaped). The site owner's name is appended. */
    title: string;
    /** Main content as trusted HTML. Escape user input with `escapeHtml` first. */
    body: string;
    /** Id of the app rendering the page; its nav link gets aria-current="page". */
    current?: SiteId;
    /** Document language. Defaults to "en". */
    lang?: string;
    /** Meta description (plain text; it is escaped). */
    description?: string;
    /** Extra trusted HTML for <head> (e.g. a page-specific <style>). */
    head?: string;
    /** Inline tokens.css + base.css in a <style> tag. Defaults to true. */
    inlineCss?: boolean;
    /** Stylesheet URLs to link (e.g. when inlineCss is false). */
    stylesheets?: string[];
}

const HTML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

/** Escapes text for safe use in HTML content and quoted attributes. */
export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/** Shared header with links to the main site and every subdomain app. */
export function renderHeader(current?: SiteId): string {
    const { name } = getResume();
    const sites = getSites();
    const home = sites.find((s) => s.id === 'web');
    const items = sites
        .map((site) => {
            const isCurrent = site.id === current;
            const aria = isCurrent ? ' aria-current="page"' : '';
            return `<li><a href="${escapeHtml(site.url)}"${aria}>${escapeHtml(site.title)}</a></li>`;
        })
        .join('');
    return `<header class="site-header"><div class="site-header__inner"><a class="site-brand" href="${escapeHtml(home?.url ?? '/')}">${escapeHtml(name)}</a><nav class="site-nav" aria-label="${escapeHtml(name)} sites"><ul>${items}</ul></nav></div></header>`;
}

/** Shared footer. */
export function renderFooter(): string {
    const { name, location, links } = getResume();
    return `<footer class="site-footer"><div class="site-footer__inner"><p>&copy; ${escapeHtml(name)} &middot; ${escapeHtml(location)} &middot; <a href="${escapeHtml(links.linkedin)}">LinkedIn</a></p></div></footer>`;
}

/** Renders a complete HTML document with skip link, header, main and footer. */
export function layout(opts: LayoutOptions): string {
    const { name } = getResume();
    const lang = opts.lang ?? 'en';
    const fullTitle = opts.title ? `${opts.title} · ${name}` : name;
    const description = opts.description
        ? `<meta name="description" content="${escapeHtml(opts.description)}">`
        : '';
    const styles = opts.inlineCss === false ? '' : `<style>${allCss}</style>`;
    const links = (opts.stylesheets ?? [])
        .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
        .join('');
    return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(fullTitle)}</title>
${description}${styles}${links}${opts.head ?? ''}
</head>
<body>
<a class="skip-link" href="#main">Skip to main content</a>
${renderHeader(opts.current)}
<main id="main" class="site-main" tabindex="-1">
${opts.body}
</main>
${renderFooter()}
</body>
</html>
`;
}
