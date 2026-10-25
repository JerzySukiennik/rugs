// Rug Rush assistant panel: T opens a chat with Rug Buddy (Claude Haiku 5.5 behind the rugrush-ai worker), sending the question with a live game snapshot.
import { installTheme, el } from './theme.js';

const API = 'https://rugrush-ai.kalakasanyt.workers.dev/ask';

const CSS = `
#rr-buddy{position:fixed;right:18px;top:84px;bottom:110px;width:min(400px,calc(100vw - 32px));z-index:16;display:none;flex-direction:column;background:var(--paper);border:4px solid var(--ink);border-radius:24px;box-shadow:8px 10px 0 rgba(27,27,30,.3);overflow:hidden;transform-origin:100% 0}
#rr-buddy.on{display:flex;animation:rr-pop .28s cubic-bezier(.2,1.6,.4,1)}
#rr-buddy header{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:3px solid var(--ink);background:var(--cyan)}
#rr-buddy .face{width:40px;height:40px;flex:none;border:3px solid var(--ink);border-radius:13px;background:var(--yellow);display:flex;align-items:center;justify-content:center;font-family:var(--display);font-size:17px;transform:rotate(-6deg);box-shadow:2px 3px 0 var(--ink)}
#rr-buddy h3{margin:0;font-family:var(--display);font-weight:400;font-size:24px;line-height:1}
#rr-buddy header span{display:block;font-size:12px;font-weight:600;opacity:.75}
#rr-buddy .x{margin-left:auto;font:600 12px var(--font);border:2px solid var(--ink);border-radius:9px;background:#fff;padding:3px 8px}
#rr-buddy .log{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:10px;user-select:text}
#rr-buddy .msg{max-width:88%;padding:9px 12px;border:3px solid var(--ink);border-radius:16px;font-size:14.5px;line-height:1.38;white-space:pre-wrap;word-wrap:break-word;box-shadow:3px 3px 0 var(--ink)}
#rr-buddy .msg.me{align-self:flex-end;background:var(--yellow);border-bottom-right-radius:5px;transform:rotate(.6deg)}
#rr-buddy .msg.bot{align-self:flex-start;background:#fff;border-bottom-left-radius:5px;transform:rotate(-.4deg)}
#rr-buddy .msg.err{background:#ffe3e2}
#rr-buddy .dots{display:inline-flex;gap:5px;padding:4px 2px}
#rr-buddy .dots i{width:8px;height:8px;border-radius:50%;background:var(--ink);animation:rr-buddy-b 1s infinite ease-in-out}
#rr-buddy .dots i:nth-child(2){animation-delay:.15s}
#rr-buddy .dots i:nth-child(3){animation-delay:.3s}
@keyframes rr-buddy-b{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-6px);opacity:1}}
#rr-buddy .chips{display:flex;flex-wrap:wrap;gap:7px;padding:0 12px 10px}
#rr-buddy .chips button{font:600 13px var(--font);color:var(--ink);background:#fff;border:2px solid var(--ink);border-radius:11px;padding:5px 10px;cursor:pointer;box-shadow:0 3px 0 var(--ink);transition:transform .1s}
#rr-buddy .chips button:hover{transform:translateY(-2px)}
#rr-buddy form{display:flex;gap:8px;padding:10px 12px 12px;border-top:3px solid var(--ink);background:#fff6df}
#rr-buddy input{flex:1;min-width:0;font:600 15px var(--font);color:var(--ink);padding:9px 12px;border:3px solid var(--ink);border-radius:13px;background:#fff;outline:none}
#rr-buddy input:focus{border-color:var(--blue)}
#rr-buddy form button{font-family:var(--display);font-size:17px;color:var(--ink);background:var(--yellow);border:3px solid var(--ink);border-radius:13px;padding:0 14px;cursor:pointer;box-shadow:0 4px 0 var(--ink)}
#rr-buddy form button:disabled{filter:grayscale(1) opacity(.55);cursor:default}
#rr-buddy-tip{position:fixed;left:18px;bottom:18px;z-index:3;font:600 12.5px var(--font);color:var(--ink);padding:5px 10px;border:2px solid var(--ink);border-radius:11px;background:#fffaf0;box-shadow:2px 2px 0 var(--ink);pointer-events:none;display:none}
#rr-buddy-tip.nudge{animation:rr-buddy-n .6s cubic-bezier(.2,1.6,.4,1) 4;background:#ffd23f}
@keyframes rr-buddy-n{50%{transform:scale(1.18) rotate(-3deg)}}
#rr-buddy-tip b{display:inline-block;padding:0 6px;margin-right:4px;border:2px solid var(--ink);border-radius:7px;background:var(--yellow)}
`;

const CHIPS = ['What should I do next?', 'How do I clean the stain I am looking at?', 'Why is my rug not getting cleaner?', 'Which product is safe for this rug?'];

export class Assistant {
  constructor(game) {
    installTheme();
    this.game = game;
    this.order = 992;
    this.isOpen = false;
    this.busy = false;
    this.chat = [];
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.append(st);
    this.logEl = el('div', { class: 'log' });
    this.chipsEl = el('div', { class: 'chips' });
    this.input = el('input', { type: 'text', maxlength: '400', placeholder: 'Ask about any rug, stain or product…', spellcheck: 'false' });
    this.send = el('button', { type: 'submit' }, 'Ask');
    const form = el('form', {}, this.input, this.send);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.ask(this.input.value);
    });
    this.el = el('div', { id: 'rr-buddy', class: 'rr-ui' },
      el('header', {}, el('div', { class: 'face' }, 'RB'), el('div', {}, el('h3', {}, 'Rug Buddy'), el('span', {}, 'Sees your warehouse. Ask anything.')), el('div', { class: 'x' }, 'Esc')),
      this.logEl, this.chipsEl, form);
    document.body.append(this.el);
    this.tip = el('div', { id: 'rr-buddy-tip', class: 'rr-ui' }, el('b', {}, 'T'), 'Ask Rug Buddy');
    document.body.append(this.tip);
    for (const c of CHIPS) this.chipsEl.append(el('button', { type: 'button', onclick: () => this.ask(c) }, c));
    this.bot('Hi! I can see every rug in here. Ask me how to get a stain out, which product is safe, or what to do next.');
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isOpen) {
        e.preventDefault();
        this.close();
      }
    });
  }

  nudge() {
    this.tip.classList.remove('nudge');
    void this.tip.offsetWidth;
    this.tip.classList.add('nudge');
    setTimeout(() => this.tip.classList.remove('nudge'), 9000);
  }

  bubble(cls, text) {
    const b = el('div', { class: `msg ${cls}` }, text);
    this.logEl.append(b);
    this.logEl.scrollTop = this.logEl.scrollHeight;
    return b;
  }

  bot(text) {
    return this.bubble('bot', text);
  }

  open() {
    const g = this.game;
    if (this.isOpen || g.mode === 'menu') return;
    this.isOpen = true;
    g.briefing?.prime();
    this.el.classList.add('on');
    g.input.autoLock = false;
    g.input.unlock();
    g.audio?.ui?.('ui_pop', 0.6);
    setTimeout(() => this.input.focus(), 30);
  }

  close() {
    if (!this.isOpen) return;
    const g = this.game;
    this.isOpen = false;
    this.el.classList.remove('on');
    this.input.blur();
    g.input.autoLock = true;
    if (g.mode !== 'menu') g.input.lock();
  }

  async ask(q) {
    q = (q ?? '').trim();
    if (!q || this.busy) return;
    const g = this.game;
    this.busy = true;
    this.send.disabled = true;
    this.input.value = '';
    this.chipsEl.style.display = 'none';
    this.bubble('me', q);
    g.briefing?.prime();
    const wait = this.bubble('bot', '');
    wait.append(el('span', { class: 'dots' }, el('i'), el('i'), el('i')));
    let state = null;
    try {
      state = g.briefing?.snapshot() ?? null;
    } catch (e) {
      console.warn('[buddy] snapshot', e);
    }
    let answer = null, bad = false;
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q, state, chat: this.chat.slice(-3) }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.answer) answer = j.answer;
      else {
        answer = j.error ?? 'Rug Buddy is offline right now.';
        bad = true;
      }
    } catch (e) {
      answer = 'Could not reach Rug Buddy. Check your connection.';
      bad = true;
    }
    wait.textContent = answer;
    if (bad) wait.classList.add('err');
    else {
      this.chat.push({ q, a: answer });
      if (this.chat.length > 6) this.chat.shift();
      g.audio?.ui?.('ui_pop', 0.5);
    }
    this.logEl.scrollTop = this.logEl.scrollHeight;
    this.busy = false;
    this.send.disabled = false;
    if (this.isOpen) this.input.focus();
  }

  update() {
    const g = this.game;
    const playing = g.mode && g.mode !== 'menu';
    this.tip.style.display = playing && !this.isOpen && !g.uiHidden && !g.shop?.isOpen ? 'block' : 'none';
    if (!playing) {
      if (this.isOpen) this.close();
      return;
    }
    if (!this.isOpen && g.input.pressed('KeyT') && !g.shop?.isOpen && !g.hud?.labelOpen && !document.querySelector('.rr-screen')) this.open();
  }
}
