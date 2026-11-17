// The chat page. No inline scripts or styles: /chat.js and /styles.css are
// served by the Worker so the CSP can stay strict.
import { getResume } from '@faheem/data';
import { escapeHtml, layout } from '@faheem/ui';
import { MAX_QUESTION_CHARS } from './guard';
import { contactLink } from './prompt';

export const SUGGESTED_QUESTIONS = [
    "What's his strongest stack?",
    'Has he led a team?',
    'Is he open to remote?',
] as const;

export const TURNSTILE_SCRIPT =
    'https://challenges.cloudflare.com/turnstile/v0/api.js';

export function renderPage(siteKey: string): string {
    const r = getResume();
    const contact = contactLink();
    const chips = SUGGESTED_QUESTIONS.map(
        (q) =>
            `<li><button type="button" class="chip" data-question="${escapeHtml(q)}">${escapeHtml(q)}</button></li>`,
    ).join('');

    const body = `<section class="ask" aria-labelledby="ask-title" data-contact="${escapeHtml(contact)}">
<h1 id="ask-title">Ask about ${escapeHtml(r.name)}</h1>
<p class="ask-lead">Ask about ${escapeHtml(r.name)}'s experience, skills and projects. An AI answers using only his resume data.</p>
<p class="ask-disclaimer"><strong>AI answers may be imperfect — verify with me</strong> on <a href="${escapeHtml(contact)}">LinkedIn</a>.</p>
<div id="chat-log" class="chat-log" role="log" aria-label="Conversation" tabindex="0">
<p class="chat-empty" id="chat-empty">No questions yet. Pick a suggestion or type your own.</p>
</div>
<div id="chat-status" class="visually-hidden" role="status" aria-live="polite"></div>
<noscript><p class="chat-error">This chat needs JavaScript. You can still reach ${escapeHtml(r.name)} on <a href="${escapeHtml(contact)}">LinkedIn</a>.</p></noscript>
<div id="chat-ui" hidden>
<h2 class="chips-title" id="chips-title">Suggested questions</h2>
<ul class="chips" aria-labelledby="chips-title">${chips}</ul>
<form id="chat-form" class="chat-form" autocomplete="off">
<label for="chat-question">Your question</label>
<textarea id="chat-question" name="question" rows="3" maxlength="${MAX_QUESTION_CHARS}" required aria-describedby="chat-hint"></textarea>
<p id="chat-hint" class="chat-hint">Up to ${MAX_QUESTION_CHARS} characters. Enter sends, Shift+Enter adds a new line.</p>
<div id="turnstile" class="cf-turnstile" data-sitekey="${escapeHtml(siteKey)}" data-size="flexible"></div>
<div class="chat-actions"><button type="submit" id="chat-send">Ask</button></div>
</form>
</div>
<p class="powered">Powered by Cloudflare Workers AI. Spam protection by Cloudflare Turnstile.</p>
</section>
<script src="${TURNSTILE_SCRIPT}" async defer></script>
<script src="/chat.js" defer></script>`;

    return layout({
        title: 'Ask',
        description: `Ask questions about ${r.name}'s professional experience, answered by AI from his resume.`,
        current: 'ask',
        body,
        inlineCss: false,
        stylesheets: ['/styles.css'],
    });
}

export const PAGE_CSS = `
.ask { max-width: 46rem; }
.ask-lead { color: var(--color-text); }
.ask-disclaimer { padding: var(--space-3); border-left: 4px solid var(--color-accent); background: var(--color-surface-alt); }
.chat-log { display: flex; flex-direction: column; gap: var(--space-3); min-height: 8rem; max-height: 60vh; overflow-y: auto; padding: var(--space-4); margin: var(--space-4) 0; border: 1px solid var(--color-border); background: var(--color-surface); }
.chat-log:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
.chat-empty { color: var(--color-muted); margin: 0; }
.msg { margin: 0; padding: var(--space-3); max-width: 90%; white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid var(--color-border); }
.msg-user { align-self: flex-end; background: var(--color-surface-alt); }
.msg-bot { align-self: flex-start; background: var(--color-bg); }
.msg-who { display: block; font-size: var(--font-size-xs); color: var(--color-muted); font-weight: bold; margin-bottom: var(--space-1); }
.msg[aria-busy='true'] .msg-text::after { content: '▍'; }
.chips-title { font-size: var(--font-size-md); margin: 0 0 var(--space-2); }
.chips { list-style: none; padding: 0; margin: 0 0 var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-2); }
.chip, .chat-actions button { font: inherit; cursor: pointer; padding: var(--space-2) var(--space-3); min-height: 44px; border: 1px solid var(--color-accent); }
.chip { background: var(--color-surface); color: var(--color-accent); }
.chat-actions button { background: var(--color-accent); color: var(--color-on-accent); }
.chip:hover { background: var(--color-surface-alt); }
.chip:focus-visible, .chat-actions button:focus-visible, .chat-form textarea:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
.chip:disabled, .chat-actions button:disabled { opacity: 0.6; cursor: not-allowed; }
.chat-form label { display: block; font-weight: bold; margin-bottom: var(--space-1); }
.chat-form textarea { width: 100%; box-sizing: border-box; font: inherit; padding: var(--space-2); color: var(--color-text); background: var(--color-surface); border: 1px solid var(--color-muted); resize: vertical; }
.chat-hint, .powered { font-size: var(--font-size-sm); color: var(--color-muted); }
.cf-turnstile { margin: var(--space-2) 0; }
.chat-actions { display: flex; justify-content: flex-end; }
.chat-error { color: var(--color-text); border-left: 4px solid var(--color-link); padding-left: var(--space-2); }
`;
