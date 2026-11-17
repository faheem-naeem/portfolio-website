// Browser terminal assets, served as /terminal.js and /terminal.css so the CSP
// can forbid inline scripts and styles. Kept as plain ES5-style strings (no
// template literals inside) because Workers have no file system to read from.

export const TERMINAL_JS = `(function () {
  'use strict';
  var term = document.getElementById('term');
  var out = document.getElementById('term-output');
  var form = document.getElementById('term-form');
  var input = document.getElementById('term-input');
  var status = document.getElementById('term-status');
  var dataEl = document.getElementById('resume-data');
  if (!term || !out || !form || !input || !status || !dataEl) return;

  var data;
  try { data = JSON.parse(dataEl.textContent || '{}'); } catch (e) { return; }
  var sections = data.sections || {};
  var COMMANDS = ['help', 'whoami', 'skills', 'experience', 'projects', 'contact', 'clear', 'theme', 'exit'];
  var THEMES = ['auto', 'phosphor', 'amber'];
  var history = [];
  var hIndex = 0;
  var draft = '';

  function announce(msg) {
    status.textContent = '';
    window.setTimeout(function () { status.textContent = msg; }, 50);
  }

  function scrollDown() { out.scrollTop = out.scrollHeight; }

  function printHtml(html) {
    var pre = document.createElement('pre');
    pre.className = 'term__pre';
    pre.innerHTML = html;
    out.appendChild(pre);
    scrollDown();
  }

  function printText(text, cls) {
    var pre = document.createElement('pre');
    pre.className = 'term__pre' + (cls ? ' ' + cls : '');
    pre.textContent = text;
    out.appendChild(pre);
    scrollDown();
  }

  function echo(line) {
    var pre = document.createElement('pre');
    pre.className = 'term__pre term__echo';
    var p = document.createElement('span');
    p.className = 't-prompt';
    p.textContent = data.prompt + ' ';
    pre.appendChild(p);
    pre.appendChild(document.createTextNode(line));
    out.appendChild(pre);
  }

  function setTheme(name, quiet) {
    if (name === 'auto') term.removeAttribute('data-theme');
    else term.setAttribute('data-theme', name);
    try { window.localStorage.setItem('resume-theme', name); } catch (e) { /* storage blocked */ }
    if (!quiet) printText('Theme set to ' + name + '.', 't-dim');
  }

  function currentTheme() { return term.getAttribute('data-theme') || 'auto'; }

  var saved = null;
  try { saved = window.localStorage.getItem('resume-theme'); } catch (e) { /* storage blocked */ }
  if (saved && THEMES.indexOf(saved) !== -1) setTheme(saved, true);

  function run(raw) {
    var line = raw.trim();
    echo(line);
    if (!line) { scrollDown(); return; }
    if (history[history.length - 1] !== line) history.push(line);
    var parts = line.split(/\\s+/);
    var cmd = parts[0].toLowerCase();
    var arg = (parts[1] || '').toLowerCase();
    if (cmd === 'help' || cmd === '?') { printHtml(data.help); return; }
    if (cmd === 'clear' || cmd === 'cls') {
      out.innerHTML = '';
      announce('Screen cleared.');
      return;
    }
    if (cmd === 'theme') {
      if (!arg) {
        var next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
        setTheme(next);
      } else if (THEMES.indexOf(arg) !== -1) {
        setTheme(arg);
      } else {
        printText('Unknown theme "' + arg + '". Try: ' + THEMES.join(', '), 't-yellow');
      }
      return;
    }
    if (cmd === 'exit' || cmd === 'logout' || cmd === 'quit') {
      printHtml('Bye! Taking you to <a href="' + data.exitUrl + '">' + data.exitUrl + '</a>');
      window.setTimeout(function () { window.location.href = data.exitUrl; }, 800);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(sections, cmd)) { printHtml(sections[cmd]); return; }
    printText('command not found: ' + cmd + '. Type "help" for a list.', 't-yellow');
  }

  function complete() {
    var value = input.value;
    var m = /^(\\s*)(\\S*)(\\s+)?(\\S*)$/.exec(value);
    if (!m || (!m[2] && !m[3])) return false;
    var pool, prefix, word;
    if (m[3]) {
      if (m[2].toLowerCase() !== 'theme') return false;
      pool = THEMES; word = m[4]; prefix = m[1] + m[2] + m[3];
    } else {
      pool = COMMANDS; word = m[2]; prefix = m[1];
    }
    var lower = word.toLowerCase();
    var matches = pool.filter(function (c) { return c.indexOf(lower) === 0; });
    if (matches.length === 0) return false;
    if (matches.length === 1) {
      input.value = prefix + matches[0] + (m[3] ? '' : ' ');
      return true;
    }
    var common = matches.reduce(function (a, b) {
      var i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      return a.slice(0, i);
    });
    if (common.length > lower.length) input.value = prefix + common;
    else { echo(value); printText(matches.join('  '), 't-dim'); }
    return true;
  }

  input.addEventListener('keydown', function (ev) {
    if (ev.key === 'Tab' && !ev.shiftKey && !ev.altKey && !ev.ctrlKey && !ev.metaKey) {
      // Only take Tab when there is something to complete, so keyboard users
      // can still tab out of the prompt.
      if (complete()) ev.preventDefault();
    } else if (ev.key === 'ArrowUp') {
      if (!history.length) return;
      ev.preventDefault();
      if (hIndex === history.length) draft = input.value;
      hIndex = Math.max(0, hIndex - 1);
      input.value = history[hIndex];
    } else if (ev.key === 'ArrowDown') {
      if (hIndex >= history.length) return;
      ev.preventDefault();
      hIndex = Math.min(history.length, hIndex + 1);
      input.value = hIndex === history.length ? draft : history[hIndex];
    } else if (ev.key === 'Escape') {
      input.value = '';
    } else if (ev.key === 'l' && ev.ctrlKey) {
      ev.preventDefault();
      run('clear');
    }
  });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var value = input.value;
    input.value = '';
    draft = '';
    run(value);
    hIndex = history.length;
  });

  out.addEventListener('click', function () {
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.isCollapsed) input.focus();
  });

  form.hidden = false;
  term.classList.add('term--ready');
})();
`;

export const TERMINAL_CSS = `
.term-page { display: grid; gap: var(--space-4); }
.term-page h1 { font-size: var(--font-size-xl); margin: 0; }
.term-hint { margin: 0; }
.term-hint code {
  padding: 0.1em 0.4em;
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
}
.term {
  --term-bg: #f8f7f0; --term-fg: #252b2b; --term-dim: #5f6b6a; --term-cyan: #164d50;
  --term-green: #2f6b2a; --term-yellow: #7a4e00; --term-blue: #274c8d; --term-magenta: #7b2d6b;
  --term-link: #274c8d; --term-bar: #c9cbc2;
  background: var(--term-bg);
  color: var(--term-fg);
  border: 1px solid var(--color-border);
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.15);
}
@media (prefers-color-scheme: dark) {
  .term {
    --term-bg: #101716; --term-fg: #e6e9e3; --term-dim: #a3aea9; --term-cyan: #7fc4be;
    --term-green: #9cc296; --term-yellow: #e3c46b; --term-blue: #9bb8f0; --term-magenta: #d9a0cf;
    --term-link: #9bb8f0; --term-bar: #34413f;
  }
}
.term[data-theme='phosphor'] {
  --term-bg: #050c06; --term-fg: #b6f5bd; --term-dim: #7fbf88; --term-cyan: #6ff7c8;
  --term-green: #57f57a; --term-yellow: #d8f57a; --term-blue: #8fe3ff; --term-magenta: #c3f5a0;
  --term-link: #8fe3ff; --term-bar: #1f3a22;
}
.term[data-theme='amber'] {
  --term-bg: #120c00; --term-fg: #ffcf73; --term-dim: #c99a4a; --term-cyan: #ffe0a3;
  --term-green: #ffd27f; --term-yellow: #fff0c2; --term-blue: #ffc06b; --term-magenta: #ffb37a;
  --term-link: #ffe0a3; --term-bar: #3d2a00;
}
.term__bar {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--term-bar);
  color: var(--term-dim);
  font-size: var(--font-size-sm);
}
.term__dots { display: flex; gap: 6px; }
.term__dots span { width: 10px; height: 10px; border-radius: 50%; background: var(--term-bar); }
.term__output {
  max-height: 70vh;
  overflow: auto;
  padding: var(--space-3);
}
.term__output:focus-visible { outline-offset: -3px; }
.term__pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: clamp(0.75rem, 1.9vw, 0.95rem);
  line-height: 1.35;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.term__pre + .term__pre { margin-top: var(--space-2); }
.term a { color: var(--term-link); }
.term :focus-visible { outline-color: var(--term-link); }
.t-bold { font-weight: bold; }
.t-dim { color: var(--term-dim); }
.t-cyan, .t-prompt { color: var(--term-cyan); }
.t-green { color: var(--term-green); }
.t-yellow { color: var(--term-yellow); }
.t-blue { color: var(--term-blue); }
.t-magenta { color: var(--term-magenta); }
.term__prompt {
  display: flex; align-items: center; gap: 0.5ch;
  padding: var(--space-2) var(--space-3) var(--space-3);
  font-size: clamp(0.75rem, 2.6vw, 0.95rem);
}
.term__prompt[hidden] { display: none; }
.term__prompt label { color: var(--term-cyan); white-space: nowrap; }
.term__input-wrap { position: relative; flex: 1; display: flex; align-items: center; min-width: 0; }
.term__input {
  flex: 1; min-width: 0; min-height: 24px;
  padding: 0; border: 0; background: transparent;
  color: var(--term-fg); caret-color: var(--term-fg);
  font-family: var(--font-mono); font-size: inherit;
}
.term__input:focus { outline: none; }
.term__input:focus-visible { outline: 2px solid var(--term-link); outline-offset: 2px; }
.term__cursor {
  display: inline-block; width: 0.6em; height: 1.1em;
  background: var(--term-fg);
  animation: term-blink 1s steps(1) infinite;
}
.term__input-wrap:focus-within .term__cursor { display: none; }
.term__input-wrap .term__cursor { position: absolute; left: 0; pointer-events: none; }
.term__input:not(:placeholder-shown) + .term__cursor { display: none; }
@keyframes term-blink { 50% { opacity: 0; } }
.term-links ul { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); padding: 0; margin: 0; list-style: none; }
.term-links a { display: inline-block; min-height: 24px; padding: var(--space-1) 0; }
`;
