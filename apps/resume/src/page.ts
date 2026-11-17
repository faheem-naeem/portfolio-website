// Browser page that looks like a terminal. Works without JS (the section is
// rendered server-side, with plain links); /terminal.js adds the prompt.
import { getResume } from '@faheem/data';
import { escapeHtml, layout } from '@faheem/ui';
import { ansiToHtml } from './ansi';
import {
    HOST,
    SECTIONS,
    renderHelp,
    renderSection,
    type Section,
} from './render';

const PROMPT = 'visitor@resume:~$';

function sectionHtml(section: Section): string {
    return ansiToHtml(renderSection(section).join('\n').replace(/^\n+/, ''));
}

/** JSON for a non-executable <script> block; `<` is escaped so it cannot close the tag. */
function safeJson(value: unknown): string {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
}

export function renderPage(section?: Section): string {
    const r = getResume();
    const shown: Section[] = section ? [section] : [...SECTIONS];
    const initial = shown
        .map((s) => {
            const cmd = `<pre class="term__pre term__echo"><span class="t-prompt">${PROMPT}</span> ${s}</pre>`;
            return `${cmd}<pre class="term__pre">${sectionHtml(s)}</pre>`;
        })
        .join('');
    const data = {
        prompt: PROMPT,
        exitUrl: r.links.website,
        help: ansiToHtml(renderHelp().join('\n')),
        sections: Object.fromEntries(SECTIONS.map((s) => [s, sectionHtml(s)])),
    };
    const links = SECTIONS.map(
        (s) =>
            `<li><a href="/${s === 'whoami' ? '' : s}"${s === section || (!section && s === 'whoami') ? ' aria-current="page"' : ''}>${s}</a></li>`,
    ).join('');

    const body = `<section class="term-page" aria-labelledby="term-title">
<h1 id="term-title">${escapeHtml(r.name)} — terminal resume</h1>
<p class="term-hint">Try: <code>curl ${HOST}</code></p>
<div id="term" class="term">
<div class="term__bar" aria-hidden="true"><span class="term__dots"><span></span><span></span><span></span></span><span>${escapeHtml(PROMPT.replace(/\$$/, ''))} — bash</span></div>
<div id="term-output" class="term__output" role="log" aria-live="polite" aria-label="Terminal output" tabindex="0">${initial}<pre class="term__pre t-dim">Type "help" for commands.</pre></div>
<form id="term-form" class="term__prompt" hidden autocomplete="off">
<label for="term-input">${PROMPT}</label>
<span class="term__input-wrap"><input id="term-input" class="term__input" type="text" name="command" spellcheck="false" autocapitalize="off" autocorrect="off" enterkeyhint="send" placeholder=" " aria-describedby="term-help-hint"><span class="term__cursor" aria-hidden="true"></span></span>
</form>
<p id="term-help-hint" class="visually-hidden">Type a command such as help, skills or contact and press Enter. Tab completes, up and down arrows browse history.</p>
<div id="term-status" class="visually-hidden" role="status"></div>
</div>
<nav class="term-links" aria-label="Resume sections"><ul>${links}<li><a href="/resume.json">resume.json</a></li></ul></nav>
</section>
<script type="application/json" id="resume-data">${safeJson(data)}</script>
<script src="/terminal.js" defer></script>`;

    return layout({
        title: section ? `Resume: ${section}` : 'Resume',
        description: `${r.name}, ${r.title}. A terminal-style resume you can also curl.`,
        current: 'resume',
        body,
        inlineCss: false,
        stylesheets: ['/styles.css'],
    });
}
