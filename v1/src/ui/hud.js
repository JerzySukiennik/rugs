// Rug Rush HUD: crosshair, aim hints, held item panel, money, toasts, rug inspection, care-label viewer and start overlay.
import { drawCareLabel } from './careLabel.js';

const DIRT_NAMES = {
  dust: 'dust & grit (vacuum)',
  hair: 'pet hair (rubber brush, vacuum)',
  mud: 'dried mud (dry brush, then vacuum)',
  sticky: 'sticky soda (shampoo + scrub + rinse)',
  wine: 'red wine (oxygen spotter or tannin spotter)',
  coffee: 'coffee (tannin spotter)',
  grease: 'grease (absorbent powder, wait, vacuum)',
  urine: 'urine',
  gum: 'chewing gum (freeze spray, then scrape)',
  wax: 'candle wax (scrape, then iron)',
  paint: 'paint (alcohol or white spirit + scrape)',
  mold: 'mould (anti-mould, wait, vacuum)',
};

const CSS = `
#hud{position:fixed;inset:0;pointer-events:none;font:14px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text",Helvetica,Arial,sans-serif;color:#fff;user-select:none}
#hud .x{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.35);transition:transform .12s}
#hud .x.on{transform:scale(1.6)}
#hud .aim{position:absolute;left:50%;top:calc(50% + 22px);transform:translateX(-50%);text-align:center;text-shadow:0 1px 3px rgba(0,0,0,.7);white-space:nowrap}
#hud .aim b{font-weight:600}
#hud .aim .k{display:inline-block;margin:3px 4px 0;padding:1px 6px;border-radius:4px;background:rgba(0,0,0,.42);font-size:12px}
#hud .insp{display:block;margin-top:5px;font-size:12px;opacity:.9}
#hud .held{position:absolute;right:20px;bottom:20px;max-width:340px;padding:10px 13px;border-radius:10px;background:rgba(18,20,24,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
#hud .held .n{font-weight:600}
#hud .held .i{font-size:12px;opacity:.85;margin-top:3px}
#hud .held .h{font-size:11px;opacity:.7;margin-top:6px;letter-spacing:.02em}
#hud .held .bar{height:4px;border-radius:2px;background:rgba(255,255,255,.18);margin-top:7px;overflow:hidden}
#hud .held .bar i{display:block;height:100%;background:#7fd1ff}
#hud .money{position:absolute;right:20px;top:16px;font:600 22px/1 -apple-system,"SF Pro Display",Helvetica,sans-serif;text-shadow:0 1px 4px rgba(0,0,0,.5)}
#hud .toasts{position:absolute;left:50%;top:18px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px}
#hud .toast{padding:7px 14px;border-radius:9px;background:rgba(18,20,24,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:tin .25s ease-out;transition:opacity .4s}
#hud .toast.bad{background:rgba(160,30,30,.75)}
@keyframes tin{from{transform:translateY(-8px);opacity:0}}
#hud .label{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-1.5deg);box-shadow:0 18px 50px rgba(0,0,0,.5);display:none}
#hud .label.on{display:block}
#hud .label canvas{display:block;width:300px;height:auto;border-radius:3px}
#hud .label .hint{text-align:center;margin-top:8px;font-size:12px;opacity:.85}
#start{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,12,16,.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);cursor:pointer;color:#fff;font:15px/1.5 -apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;z-index:5}
#start .card{max-width:560px;padding:28px 32px;border-radius:16px;background:rgba(20,22,27,.78)}
#start h1{margin:0 0 4px;font:700 42px/1 -apple-system,"SF Pro Display",Helvetica,sans-serif;letter-spacing:-.02em}
#start .sub{opacity:.7;margin-bottom:18px}
#start table{border-collapse:collapse;font-size:13px}
#start td{padding:2px 14px 2px 0;vertical-align:top}
#start td:first-child{opacity:.65;white-space:nowrap}
#start .go{margin-top:18px;font-weight:600}
`;

export class Hud {
  constructor() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    const el = document.createElement('div');
    el.id = 'hud';
    el.innerHTML = '<div class="x"></div><div class="aim"></div><div class="held" style="display:none"><div class="n"></div><div class="i"></div><div class="bar"><i></i></div><div class="h"></div></div><div class="money"></div><div class="toasts"></div><div class="label"><div class="c"></div><div class="hint">E / Esc to close</div></div>';
    document.body.appendChild(el);
    this.el = el;
    this.cross = el.querySelector('.x');
    this.aimEl = el.querySelector('.aim');
    this.heldEl = el.querySelector('.held');
    this.heldN = el.querySelector('.held .n');
    this.heldI = el.querySelector('.held .i');
    this.heldBar = el.querySelector('.held .bar');
    this.heldBarI = el.querySelector('.held .bar i');
    this.heldH = el.querySelector('.held .h');
    this.moneyEl = el.querySelector('.money');
    this.toastEl = el.querySelector('.toasts');
    this.labelEl = el.querySelector('.label');
    this.labelC = el.querySelector('.label .c');
    this.order = 990;
    this.last = { aim: '', held: '' };
    this.labelOpen = false;
    this.money = 0;
    this.inspectCache = new Map();
  }

  buildStart(onStart) {
    const s = document.createElement('div');
    s.id = 'start';
    s.innerHTML = `<div class="card"><h1>Rug Rush</h1><div class="sub">Unload the trucks. Clean the rugs. Don't ruin the silk.</div>
<table>
<tr><td>WASD · Shift · Space · C</td><td>move · sprint · jump · crouch</td></tr>
<tr><td>E</td><td>pick up / drop / use / read care label</td></tr>
<tr><td>Left mouse</td><td>use held item (spray, pour, shake, scrub, vacuum)</td></tr>
<tr><td>Right mouse</td><td>item mode (beater bar, iron heat, empty tank)</td></tr>
<tr><td>Q · F · wheel</td><td>drop · throw · carry distance</td></tr>
<tr><td>R</td><td>on a roll: kick it open · at a rug's end (hold + walk): roll it up</td></tr>
</table><div class="go">Click to start</div></div>`;
    s.addEventListener('click', () => onStart());
    document.body.appendChild(s);
    this.startEl = s;
  }

  setStartVisible(v) {
    if (this.startEl) this.startEl.style.display = v ? 'flex' : 'none';
  }

  toast(text, bad = false, ms = 2600) {
    const t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.textContent = text;
    this.toastEl.appendChild(t);
    setTimeout(() => (t.style.opacity = '0'), ms);
    setTimeout(() => t.remove(), ms + 450);
  }

  setMoney(v) {
    if (v === this.money && this.moneyEl.textContent) return;
    this.money = v;
    this.moneyEl.textContent = `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
  }

  showCareLabel(carpet) {
    const c = drawCareLabel(carpet.type, { width: carpet.width, length: carpet.length, client: carpet.job?.client ?? '', seed: carpet.seed ?? 1 });
    this.labelC.innerHTML = '';
    this.labelC.appendChild(c);
    this.labelEl.classList.add('on');
    this.labelOpen = true;
  }

  hideCareLabel() {
    this.labelEl.classList.remove('on');
    this.labelOpen = false;
  }

  render(game) {
    const g = game.grab;
    const aim = g?.aim;
    const d = g?.describe(aim);
    let html = '';
    if (d && !g.held) {
      html = `<b>${d.label}</b><br>${d.actions.map((a) => `<span class="k">${a}</span>`).join('')}`;
      if (aim.owner?.kind === 'carpet' && game.chem) {
        const c = aim.owner;
        let ev = this.inspectCache.get(c);
        const now = performance.now();
        if (!ev || now - ev.t > 500) {
          ev = { t: now, v: game.chem.evaluate(c) };
          this.inspectCache.set(c, ev);
        }
        if (c.job?.note && c.state !== 'rolled') html += `<span class="insp">${c.job.client}: “${c.job.note}”</span>`;
        if (ev.v) {
          const v = ev.v;
          html += `<span class="insp">Clean ${Math.round(v.clean * 100)}% · Wet ${Math.round(v.wet * 100)}% · ${v.damage > 0.01 ? `Damage ${Math.round(v.damage * 100)}%` : 'No damage'}${v.residue > 0.05 ? ' · Residue: rinse it' : ''}</span>`;
          const left = Object.entries(v.per).filter(([k, x]) => x > 0.004 && k !== 'urine').sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => DIRT_NAMES[k]);
          if (left.length) html += `<span class="insp">Still dirty: ${left.join(', ')}</span>`;
        }
      }
    } else if (g?.held?.kind === 'cloth' || g?.held?.kind === 'heavy') {
      html = '<span class="k">E / Q drop</span><span class="k">F throw</span><span class="k">wheel distance</span>';
    }
    if (html !== this.last.aim) {
      this.aimEl.innerHTML = html;
      this.last.aim = html;
    }
    this.cross.classList.toggle('on', !!d && !g.held);
    const it = g?.heldItem?.();
    if (it) {
      const info = it.info?.() ?? '';
      const hint = `${it.hint?.() ?? 'LMB use'} · Q drop · F throw`;
      const key = it.label + info + hint;
      if (key !== this.last.held) {
        this.heldN.textContent = it.label;
        this.heldI.textContent = info;
        this.heldH.textContent = hint;
        this.last.held = key;
      }
      this.heldEl.style.display = 'block';
      if (it.fillFrac !== undefined) {
        this.heldBar.style.display = 'block';
        this.heldBarI.style.width = `${Math.round(it.fillFrac * 100)}%`;
      } else this.heldBar.style.display = 'none';
    } else this.heldEl.style.display = 'none';
    this.setMoney(game.economy?.money ?? 0);
  }
}
