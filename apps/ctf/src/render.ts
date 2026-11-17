import { escapeHtml, layout } from '@faheem/ui';
import { STEPS } from './content';
import { NAME_MAX } from './lib/name';

export interface HallEntry {
    display_name: string | null;
    created_at: string;
}

const STYLESHEETS = ['/assets/ui.css', '/assets/ctf.css'];
const SCRIPT = '<script src="/assets/ctf.js" defer></script>';

function page(title: string, body: string, withScript = false): string {
    return layout({
        title,
        body,
        current: 'ctf',
        description:
            'A 5-step capture-the-flag hunt across faheemnaeem.dev. Find the flag, join the Hall of Fame.',
        inlineCss: false,
        stylesheets: STYLESHEETS,
        head: withScript ? SCRIPT : '',
    });
}

function renderMap(): string {
    const items = STEPS.map((step, i) => {
        const n = i + 1;
        return `<li class="step" data-step="${n}">
<div class="step__head"><h3 class="step__num">Step ${n}: ${escapeHtml(step.title)}</h3><span class="step__status">Locked</span></div>
<p class="step__teaser">${escapeHtml(step.teaser)}</p>
<details class="hint"><summary>Reveal hint for step ${n}</summary><p>${escapeHtml(step.hint)}</p></details>
</li>`;
    }).join('\n');
    return `<section aria-labelledby="map-title">
<h2 id="map-title">Progress map</h2>
<ol class="map">
${items}
</ol>
<p id="progress" class="progress" role="status" aria-live="polite"></p>
</section>`;
}

export function renderSubmitForm(
    opts: { error?: string; flag?: string; name?: string } = {},
): string {
    const error = opts.error
        ? `<div class="alert alert--error" role="alert"><p>${escapeHtml(opts.error)}</p></div>`
        : '';
    return `<section class="panel" aria-labelledby="submit-title">
<h2 id="submit-title">Submit the flag</h2>
${error}
<form method="post" action="/submit">
<div class="field"><label for="flag">Flag</label>
<input id="flag" name="flag" type="text" required maxlength="200" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="FAHEEM{...}" value="${escapeHtml(opts.flag ?? '')}"></div>
<div class="field"><label for="name">Display name for the Hall of Fame (optional)</label>
<input id="name" name="name" type="text" maxlength="${NAME_MAX}" autocomplete="nickname" aria-describedby="name-help" value="${escapeHtml(opts.name ?? '')}">
<small id="name-help">Up to ${NAME_MAX} characters. No email, no account. Names appear only after a manual review. Leave empty to stay anonymous.</small></div>
<button class="btn" type="submit">Check my flag</button>
</form>
<p><small>10 attempts per hour.</small></p>
</section>`;
}

function renderHall(entries: HallEntry[]): string {
    const list = entries.length
        ? `<ol class="hof">${entries
              .map(
                  (e) =>
                      `<li>${escapeHtml(e.display_name ?? 'Anonymous solver')} <small>(${escapeHtml(e.created_at.slice(0, 10))})</small></li>`,
              )
              .join('')}</ol>`
        : '<p>No approved entries yet. Be the first.</p>';
    return `<section aria-labelledby="hof-title">
<h2 id="hof-title">Hall of Fame</h2>
${list}
</section>`;
}

export function renderHome(
    hall: HallEntry[],
    form: Parameters<typeof renderSubmitForm>[0] = {},
): string {
    return page(
        'Find the flag',
        `<h1>Find the flag</h1>
<div class="intro">
<p>Five clues are hidden across my sites. A curious developer can solve them in about 15 minutes with a browser, a terminal and some patience.</p>
<p>The hunt starts at <a href="https://faheemnaeem.dev">faheemnaeem.dev</a>. The final flag looks like <code>FAHEEM{...}</code>. Everything is harmless: no hacking, no brute force, please.</p>
</div>
${renderMap()}
${renderSubmitForm(form)}
${renderHall(hall)}`,
        true,
    );
}

export function renderSuccess(opts: {
    name: string | null;
    contactUrl: string;
}): string {
    const nameNote = opts.name
        ? `<p>Your display name <strong>${escapeHtml(opts.name)}</strong> will appear in the Hall of Fame after a quick review.</p>`
        : '<p>You chose to stay anonymous. Respect.</p>';
    return page(
        'Flag captured',
        `<h1>You found it!</h1>
<div class="alert" role="status"><p>Correct flag. Five steps, one curious mind.</p></div>
${nameNote}
<p class="cta"><strong>You'd fit right in. Let's talk.</strong></p>
<p><a class="btn" href="${escapeHtml(opts.contactUrl)}">Book a chat with me</a></p>
<p><a href="/">Back to the hunt</a></p>`,
    );
}

export function renderNotFound(): string {
    return page(
        'Not found',
        `<h1>Not here</h1>
<p>This path is not part of the hunt. <a href="/">Back to the start</a>.</p>`,
    );
}
