// Page CSS and progressive-enhancement JS, served as external files so the
// CSP can forbid every inline script and style.

export const CTF_CSS = `
.intro { max-width: 44rem; }
.map { list-style: none; padding: 0; margin: var(--space-5) 0; display: grid; gap: var(--space-3); counter-reset: none; }
@media (min-width: 60rem) { .map { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
.step { border: 2px solid var(--color-border); background: var(--color-surface); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); }
.step__head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
.step__num { font-family: var(--font-serif); font-size: var(--font-size-lg); margin: 0; }
.step__status { font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; border: 1px solid var(--color-border); padding: 0 var(--space-2); color: var(--color-muted); }
.step__teaser { color: var(--color-muted); margin: 0; }
.step.is-solved { border-color: var(--color-accent-strong); background: var(--color-surface-alt); }
.step.is-solved .step__status { color: var(--color-text); border-color: var(--color-accent-strong); }
.hint summary { cursor: pointer; color: var(--color-link); text-decoration: underline; }
.hint p { margin: var(--space-2) 0 0; }
.solve-toggle, .btn { font: inherit; padding: var(--space-2) var(--space-3); border: 2px solid var(--color-accent); background: transparent; color: var(--color-text); cursor: pointer; min-height: 44px; }
.btn { background: var(--color-accent); color: var(--color-on-accent); }
.solve-toggle[aria-pressed='true'] { background: var(--color-surface); }
.progress { min-height: 1.5em; color: var(--color-muted); }
.panel { border: 2px solid var(--color-border); background: var(--color-surface); padding: var(--space-5); margin: var(--space-6) 0; max-width: 44rem; }
.field { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-4); }
.field input { font: inherit; padding: var(--space-2); border: 2px solid var(--color-border); background: var(--color-bg); color: var(--color-text); min-height: 44px; width: 100%; box-sizing: border-box; }
.field small { color: var(--color-muted); }
.alert { border-left: 4px solid var(--color-accent-strong); padding: var(--space-3) var(--space-4); background: var(--color-surface-alt); margin: var(--space-4) 0; }
.alert--error { border-left-color: var(--color-link); }
.hof { padding-left: var(--space-5); }
.cta { font-size: var(--font-size-lg); }
`;

export const CTF_JS = `(function () {
  'use strict';
  var KEY = 'ctf-progress-v1';
  var state = { hints: [], solved: [] };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (Array.isArray(saved.hints)) state.hints = saved.hints;
    if (Array.isArray(saved.solved)) state.solved = saved.solved;
  } catch (e) { /* storage unavailable: progress is just not remembered */ }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function has(list, n) { return list.indexOf(n) !== -1; }
  var steps = Array.prototype.slice.call(document.querySelectorAll('[data-step]'));
  var live = document.getElementById('progress');
  function render(announce) {
    steps.forEach(function (step) {
      var n = step.getAttribute('data-step');
      var solved = has(state.solved, n);
      step.classList.toggle('is-solved', solved);
      var status = step.querySelector('.step__status');
      if (status) status.textContent = solved ? 'Solved' : 'Locked';
      var btn = step.querySelector('.solve-toggle');
      if (btn) btn.setAttribute('aria-pressed', solved ? 'true' : 'false');
    });
    if (live && announce !== false) {
      live.textContent = state.solved.length + ' of ' + steps.length + ' steps marked solved, ' +
        state.hints.length + (state.hints.length === 1 ? ' hint' : ' hints') + ' revealed.';
    }
  }
  steps.forEach(function (step) {
    var n = step.getAttribute('data-step');
    var details = step.querySelector('details');
    if (details) {
      details.addEventListener('toggle', function () {
        if (details.open && !has(state.hints, n)) { state.hints.push(n); save(); render(); }
      });
    }
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'solve-toggle';
    btn.textContent = 'I solved step ' + n;
    btn.addEventListener('click', function () {
      if (has(state.solved, n)) state.solved.splice(state.solved.indexOf(n), 1);
      else state.solved.push(n);
      save();
      render();
    });
    step.appendChild(btn);
  });
  render(state.hints.length + state.solved.length > 0);
})();
`;
