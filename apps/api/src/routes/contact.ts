// GET /contact: accessible interview-request form with a Turnstile widget.
// With JavaScript, /contact.js posts JSON to /v1/interview-requests and shows
// the result in an aria-live region. Without it, the browser posts the form
// (application/x-www-form-urlencoded) and gets an HTML result page back.
import type { Hono } from 'hono';
import { getResume, getSite } from '@faheem/data';
import { escapeHtml, layout } from '@faheem/ui';
import type { AppEnv } from '../env';

export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
export const TURNSTILE_SCRIPT = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js`;

/**
 * CSP for the contact pages: scripts from this origin (contact.js) and
 * Turnstile only; the Turnstile iframe is the only frame. The shared layout
 * inlines its CSS, so inline styles are allowed (no inline scripts).
 */
export const CONTACT_CSP = [
    "default-src 'none'",
    `script-src 'self' ${TURNSTILE_ORIGIN}`,
    `frame-src ${TURNSTILE_ORIGIN}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join('; ');

export const CONTACT_JS = `// Submits the interview-request form on api.faheemnaeem.dev with fetch.
(function () {
    var form = document.getElementById('contact-form');
    var status = document.getElementById('contact-status');
    if (!form || !status || !window.fetch || !window.FormData) return;
    var button = form.querySelector('button[type="submit"]');

    function show(message, isError) {
        status.textContent = message;
        status.className = 'contact-status ' + (isError ? 'is-error' : 'is-ok');
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        var data = new FormData(form);
        var token = data.get('cf-turnstile-response');
        if (!token) {
            show('Please complete the bot check, then send again.', true);
            return;
        }
        var payload = {
            name: data.get('name'),
            company: data.get('company'),
            email: data.get('email'),
            role: data.get('role'),
            message: data.get('message'),
            turnstileToken: token,
        };
        if (button) button.disabled = true;
        show('Sending your request…', false);
        fetch(form.getAttribute('action'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload),
        })
            .then(function (res) {
                return res
                    .json()
                    .catch(function () { return null; })
                    .then(function (body) { return { res: res, body: body }; });
            })
            .then(function (r) {
                if (r.res.ok) {
                    form.reset();
                    show((r.body && r.body.data && r.body.data.message) || 'Thanks! Your request is in.', false);
                    return;
                }
                var err = (r.body && r.body.error) || {};
                var details = (err.details || []).map(function (d) {
                    return d.path + ': ' + d.message;
                });
                show((err.message || 'Something went wrong. Please try again.') +
                    (details.length ? ' (' + details.join('; ') + ')' : ''), true);
            })
            .catch(function () {
                show('Network error. Check your connection and try again.', true);
            })
            .then(function () {
                if (button) button.disabled = false;
                if (window.turnstile) window.turnstile.reset();
            });
    });
})();
`;

/** Short FNV-1a hash of the script, used to cache-bust /contact.js. */
function fnv1a(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}
export const CONTACT_JS_URL = `/contact.js?v=${fnv1a(CONTACT_JS)}`;

const PAGE_CSS = `
.contact { max-width: 40rem; }
.contact-form { display: grid; gap: var(--space-4, 1rem); }
.field { display: grid; gap: var(--space-1, .25rem); }
.field label { font-weight: bold; }
.field input, .field textarea {
  width: 100%; min-height: 44px; padding: var(--space-2, .5rem);
  color: var(--color-text); background: var(--color-surface);
  border: 2px solid var(--color-muted); border-radius: var(--radius, 0); }
.field textarea { min-height: 9rem; resize: vertical; }
.hint { color: var(--color-muted); font-size: var(--font-size-sm, .875rem); margin: 0; }
.contact-form button {
  justify-self: start; min-height: 44px; padding: var(--space-2, .5rem) var(--space-5, 1.5rem);
  color: var(--color-on-accent); background: var(--color-accent);
  border: 2px solid var(--color-accent); font-weight: bold; cursor: pointer; }
.contact-form button:disabled { opacity: .7; cursor: progress; }
.contact-status { min-height: 1.5em; margin: 0; font-weight: bold; }
.contact-status.is-error { color: var(--color-text); border-left: 4px solid #b3261e; padding-left: var(--space-2, .5rem); }
.contact-status.is-ok { color: var(--color-text); border-left: 4px solid var(--color-success); padding-left: var(--space-2, .5rem); }
.notice { padding: var(--space-3, .75rem); border: 2px solid var(--color-border); background: var(--color-surface-alt); }
.cf-turnstile { min-height: 65px; }
`;

function siteKey(raw: string | undefined): string | null {
    return raw && !raw.includes('<') ? raw : null;
}

function otherChannels(): string {
    const { links } = getResume();
    return `<p>Prefer email or LinkedIn? Write to <a href="mailto:${escapeHtml(links.email)}">${escapeHtml(links.email)}</a> or message me on <a href="${escapeHtml(links.linkedin)}">LinkedIn</a>.</p>`;
}

export function renderContactPage(rawSiteKey: string | undefined): string {
    const key = siteKey(rawSiteKey);
    const { name } = getResume();
    const first = name.split(' ')[0] ?? name;
    const field = (id: string, label: string, attrs: string, hint?: string) => {
        const hintHtml = hint
            ? `<p class="hint" id="${id}-hint">${escapeHtml(hint)}</p>`
            : '';
        const describedBy = hint ? ` aria-describedby="${id}-hint"` : '';
        const control =
            id === 'message'
                ? `<textarea id="${id}" name="${id}"${describedBy} ${attrs}></textarea>`
                : `<input id="${id}" name="${id}"${describedBy} ${attrs}>`;
        return `<div class="field"><label for="${id}">${escapeHtml(label)}</label>${hintHtml}${control}</div>`;
    };
    const widget = key
        ? `<div class="cf-turnstile" data-sitekey="${escapeHtml(key)}" data-theme="auto"></div>`
        : '<p class="notice">The bot check is not configured yet, so the form cannot be sent. Please use email or LinkedIn below.</p>';
    const body = `
<section class="contact" aria-labelledby="contact-title">
<h1 id="contact-title">Request an interview</h1>
<p>Hiring for a software role? Tell ${escapeHtml(first)} a little about it and you will get a reply within a few working days. All fields are required.</p>
<form id="contact-form" class="contact-form" action="/v1/interview-requests" method="post">
${field('name', 'Your name', 'type="text" autocomplete="name" required maxlength="100"')}
${field('company', 'Company', 'type="text" autocomplete="organization" required maxlength="100"')}
${field('email', 'Email', 'type="email" autocomplete="email" required maxlength="254"', 'Used only to reply to this request.')}
${field('role', 'Role', 'type="text" autocomplete="organization-title" required maxlength="100"', 'For example: Senior Software Engineer.')}
${field('message', 'Message', 'required minlength="10" maxlength="2000" rows="6"', '10 to 2,000 characters.')}
${widget}
<noscript><p class="notice">The bot check needs JavaScript. Without it, please use email or LinkedIn below.</p></noscript>
<button type="submit">Send request</button>
<p id="contact-status" class="contact-status" role="status" aria-live="polite"></p>
</form>
${otherChannels()}
</section>
${key ? `<script src="${TURNSTILE_SCRIPT}" async defer></script>` : ''}
<script src="${CONTACT_JS_URL}" defer></script>`;
    return layout({
        title: 'Request an interview',
        current: 'api',
        description: `Send ${name} an interview request.`,
        head: `<style>${PAGE_CSS}</style>`,
        body,
    });
}

/** HTML result page for the no-JS (form-encoded) submission. */
export function renderContactResult(result: {
    ok: boolean;
    message: string;
}): string {
    const title = result.ok ? 'Thank you' : 'Your request was not sent';
    const body = `
<section class="contact" aria-labelledby="result-title">
<h1 id="result-title">${escapeHtml(title)}</h1>
<p class="contact-status ${result.ok ? 'is-ok' : 'is-error'}" role="${result.ok ? 'status' : 'alert'}">${escapeHtml(result.message)}</p>
<p>${result.ok ? `<a href="${escapeHtml(getSite('web').url)}">Back to the portfolio</a>` : '<a href="/contact">Back to the form</a>'}</p>
${result.ok ? '' : otherChannels()}
</section>`;
    return layout({
        title,
        current: 'api',
        head: `<style>${PAGE_CSS}</style>`,
        body,
    });
}

export function contactRoutes(app: Hono<AppEnv>) {
    app.get('/contact', (c) => {
        c.header('Content-Security-Policy', CONTACT_CSP);
        c.header('Cache-Control', 'public, max-age=300');
        return c.html(renderContactPage(c.env.TURNSTILE_SITE_KEY));
    });
    app.get('/contact.js', (c) => {
        c.header('Content-Type', 'text/javascript; charset=utf-8');
        c.header('Cache-Control', 'public, max-age=86400');
        return c.body(CONTACT_JS);
    });
}
