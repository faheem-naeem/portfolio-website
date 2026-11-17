// Browser script served as /chat.js (external so the CSP forbids inline JS).
// Plain ES2017 in a String.raw string: Workers have no file system, and
// String.raw keeps "\n" escapes intact. No template literals inside.
// All model text is inserted with textContent, never innerHTML.

export const CHAT_JS = String.raw`(function () {
  'use strict';
  var root = document.querySelector('.ask');
  var ui = document.getElementById('chat-ui');
  var log = document.getElementById('chat-log');
  var empty = document.getElementById('chat-empty');
  var statusEl = document.getElementById('chat-status');
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-question');
  var send = document.getElementById('chat-send');
  var widget = document.getElementById('turnstile');
  if (!root || !ui || !log || !statusEl || !form || !input || !send) return;

  var contact = root.getAttribute('data-contact') || '';
  var FALLBACK = 'Something went wrong. Please try again later or reach Faheem directly: ' + contact;
  var MAX_TURNS = 4;
  var history = [];
  var busy = false;
  var verified = false;

  ui.hidden = false;

  function announce(text) {
    statusEl.textContent = '';
    window.setTimeout(function () { statusEl.textContent = text; }, 50);
  }

  function addMessage(role, text) {
    if (empty) { empty.remove(); empty = null; }
    var wrap = document.createElement('div');
    wrap.className = 'msg ' + (role === 'user' ? 'msg-user' : 'msg-bot');
    var who = document.createElement('span');
    who.className = 'msg-who';
    who.textContent = role === 'user' ? 'You' : 'AI';
    var body = document.createElement('span');
    body.className = 'msg-text';
    body.textContent = text;
    wrap.appendChild(who);
    wrap.appendChild(body);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return { wrap: wrap, body: body };
  }

  function setBusy(value) {
    busy = value;
    send.disabled = value;
    var chips = document.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) chips[i].disabled = value;
  }

  function turnstileToken() {
    if (!widget) return '';
    var field = widget.querySelector('input[name="cf-turnstile-response"]');
    return field && field.value ? field.value : '';
  }

  function resetTurnstile() {
    if (widget && window.turnstile) {
      try { window.turnstile.reset(widget); } catch (e) { /* ignore */ }
    }
  }

  function showTurnstile(show) {
    if (widget) widget.hidden = !show;
  }

  function chunkText(json) {
    if (!json) return '';
    if (typeof json.response === 'string') return json.response;
    var c = json.choices && json.choices[0];
    if (c && c.delta && typeof c.delta.content === 'string') return c.delta.content;
    return '';
  }

  async function readStream(res, target) {
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var text = '';
    var done = false;
    while (!done) {
      var step = await reader.read();
      if (step.done) break;
      buffer += decoder.decode(step.value, { stream: true });
      var events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || '';
      for (var i = 0; i < events.length; i++) {
        var lines = events[i].split(/\r?\n/);
        for (var j = 0; j < lines.length; j++) {
          var line = lines[j];
          if (line.indexOf('data:') !== 0) continue;
          var data = line.slice(5).trim();
          if (data === '[DONE]') { done = true; break; }
          try { text += chunkText(JSON.parse(data)); } catch (e) { /* skip */ }
          target.textContent = text;
          log.scrollTop = log.scrollHeight;
        }
        if (done) break;
      }
    }
    return text.trim();
  }

  async function ask(question) {
    if (busy) return;
    question = question.trim();
    if (!question) { announce('Please type a question.'); input.focus(); return; }
    var token = turnstileToken();
    if (!verified && !token) {
      announce('Please complete the spam check first.');
      if (widget) widget.scrollIntoView({ block: 'nearest' });
      return;
    }
    setBusy(true);
    addMessage('user', question);
    var bot = addMessage('assistant', '');
    bot.wrap.setAttribute('aria-busy', 'true');
    announce('Thinking…');
    var answer = '';
    try {
      var res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          question: question,
          history: history.slice(-MAX_TURNS * 2),
          turnstileToken: verified ? undefined : token
        })
      });
      var type = res.headers.get('Content-Type') || '';
      if (res.ok && type.indexOf('text/event-stream') === 0 && res.body) {
        answer = await readStream(res, bot.body);
        verified = true;
        showTurnstile(false);
        if (!answer) answer = FALLBACK;
        history.push({ role: 'user', content: question });
        history.push({ role: 'assistant', content: answer });
        input.value = '';
      } else {
        var err = {};
        try { err = await res.json(); } catch (e) { /* not JSON */ }
        answer = err.message || FALLBACK;
        if (err.error === 'turnstile_required' || err.error === 'turnstile_failed') {
          verified = false;
          showTurnstile(true);
        }
      }
    } catch (e) {
      answer = answer || FALLBACK;
    }
    bot.body.textContent = answer;
    bot.wrap.removeAttribute('aria-busy');
    resetTurnstile();
    announce('Answer: ' + answer);
    setBusy(false);
    input.focus();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    ask(input.value);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ask(input.value);
    }
  });

  var chips = document.querySelectorAll('.chip');
  for (var i = 0; i < chips.length; i++) {
    chips[i].addEventListener('click', function (e) {
      var q = e.currentTarget.getAttribute('data-question') || '';
      input.value = q;
      ask(q);
    });
  }
})();
`;
