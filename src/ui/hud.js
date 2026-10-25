// Rug Rush HUD: crosshair, aim hints, held item panel, money, toasts, rug inspection, care-label viewer and start overlay.
import { drawCareLabel } from './careLabel.js';
import { productIcon, toolIcon } from './icons.js';

const DIRT_NAMES = {
  dust: 'dust & grit',
  hair: 'pet hair',
  mud: 'dried mud',
  sticky: 'sticky soda',
  wine: 'red wine',
  coffee: 'coffee',
  grease: 'grease',
  urine: 'urine',
  gum: 'chewing gum',
  wax: 'candle wax',
  paint: 'paint',
  mold: 'mould',
};

const CSS = `
#hud{position:fixed;inset:0;pointer-events:none;font:600 14px/1.35 'Fredoka',ui-rounded,'Arial Rounded MT Bold',system-ui,sans-serif;color:#1b1b1e;user-select:none;-webkit-font-smoothing:antialiased}
#hud .x{position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:#fff;border:2px solid #1b1b1e;box-sizing:border-box;transition:transform .15s cubic-bezier(.2,1.8,.4,1)}
#hud .x.on{transform:scale(1.9);background:#ffd23f}
#hud .aim{position:absolute;left:50%;top:calc(50% + 26px);transform:translateX(-50%);text-align:center;white-space:nowrap;display:flex;flex-direction:column;align-items:center;gap:4px}
#hud .aim b{display:inline-block;padding:3px 12px;border:3px solid #1b1b1e;border-radius:12px;background:#fff;box-shadow:3px 3px 0 #1b1b1e;font-size:15px;transform:rotate(-1deg)}
#hud .aim .k{display:inline-block;margin:0 3px;padding:2px 9px;border:2px solid #1b1b1e;border-radius:9px;background:#ffd23f;font-size:12.5px;box-shadow:2px 2px 0 #1b1b1e}
#hud .insp.stain{background:#ffd23f;font-size:13.5px;transform:rotate(-.6deg)}
#hud .insp.stain i{font-style:normal;font-family:'Lilita One','Fredoka',sans-serif;font-weight:400;font-size:15px;margin-right:4px}
#hud .insp{display:block;padding:2px 10px;border:2px solid #1b1b1e;border-radius:10px;background:rgba(255,250,240,.94);font-size:12.5px;box-shadow:2px 2px 0 #1b1b1e;max-width:520px;white-space:normal}
#hud .held{position:absolute;right:18px;bottom:18px;max-width:340px;padding:12px 15px;border:3px solid #1b1b1e;border-radius:18px;background:#fffaf0;box-shadow:6px 6px 0 rgba(27,27,30,.35);transform:rotate(1deg)}
#hud .held .hic{float:left;width:46px;height:46px;margin:0 10px 4px 0;border:2px solid #1b1b1e;border-radius:11px;background:#f1ebde}
#hud .held .hic[src=""]{display:none}
#hud .held .n{font-family:'Lilita One','Fredoka',sans-serif;font-weight:400;font-size:19px;letter-spacing:.01em}
#hud .held .i{font-size:12.5px;opacity:.75;margin-top:3px;font-weight:500}
#hud .held .h{font-size:12px;margin-top:7px;padding:3px 8px;border-radius:9px;background:#ffd23f;border:2px solid #1b1b1e;display:inline-block}
#hud .held .bar{height:10px;border:2px solid #1b1b1e;border-radius:8px;background:#fff;margin-top:8px;overflow:hidden}
#hud .held .bar i{display:block;height:100%;background:#3bceac}
#hud .money{position:absolute;right:18px;top:14px;font-family:'Lilita One','Fredoka',sans-serif;font-size:30px;line-height:1;padding:6px 16px;border:3px solid #1b1b1e;border-radius:16px;background:#52c46b;color:#fff;-webkit-text-stroke:1.2px #1b1b1e;paint-order:stroke fill;box-shadow:4px 5px 0 #1b1b1e;transform:rotate(2deg);transition:transform .2s cubic-bezier(.2,1.8,.4,1)}
#hud .money.bump{transform:rotate(-3deg) scale(1.18)}
#hud .toasts{position:absolute;left:50%;top:16px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px}
#hud .toast{padding:8px 16px;border:3px solid #1b1b1e;border-radius:14px;background:#fffaf0;box-shadow:4px 4px 0 #1b1b1e;animation:tin .35s cubic-bezier(.2,1.8,.4,1);transition:opacity .4s,transform .4s;font-size:15px}
#hud .toast:nth-child(odd){transform:rotate(-1.2deg)}
#hud .toast:nth-child(even){transform:rotate(1deg)}
#hud .toast.bad{background:#ff5d8f;color:#fff}
@keyframes tin{from{transform:translateY(-14px) scale(.7);opacity:0}}
#hud .label{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-2deg);display:none;filter:drop-shadow(10px 12px 0 rgba(27,27,30,.35))}
#hud .label.on{display:block}
#hud .label canvas{display:block;width:300px;height:auto;border-radius:6px;border:3px solid #1b1b1e}
#hud .label .hint{text-align:center;margin-top:10px;font-size:13px;display:inline-block;padding:3px 10px;border:2px solid #1b1b1e;border-radius:10px;background:#ffd23f}
#start{display:none}
`;

export class Hud {
  constructor() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    const el = document.createElement('div');
    el.id = 'hud';
    el.innerHTML = '<div class="x"></div><div class="aim"></div><div class="held" style="display:none"><img class="hic" alt=""><div class="n"></div><div class="i"></div><div class="bar"><i></i></div><div class="h"></div></div><div class="money"></div><div class="toasts"></div><div class="label"><div class="c"></div><div class="hint">E / Esc to close</div></div>';
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
    this.heldIc = el.querySelector('.held .hic');
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
    if (this.moneyEl.textContent) {
      this.moneyEl.classList.add('bump');
      clearTimeout(this.bumpT);
      this.bumpT = setTimeout(() => this.moneyEl.classList.remove('bump'), 220);
    }
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
        const sh = game.stainHover;
        if (sh) html += `<span class="insp stain"><i>${sh.name}</i>${sh.tip}</span>`;
        if (c.job?.note && c.state !== 'rolled') html += `<span class="insp">${c.job.client}: “${c.job.note}”</span>`;
        if (ev.v) {
          const v = ev.v;
          const dry = v.dryEnough ? 'Dry enough to roll \u2713' : v.wet > 0.02 ? `Wet ${Math.round(v.wet * 100)}% (roll at <12%)` : 'Dry';
          html += `<span class="insp">Clean ${Math.round(v.clean * 100)}% · ${dry} · ${v.damage > 0.01 || v.damagePeak > 0.005 ? `Damage ${Math.round(Math.max(v.damage, v.damagePeak) * 100)}%` : 'No damage'}${v.residue > 0.05 ? ' · Soap left: rinse it' : ''}</span>`;
          const left = Object.entries(v.per).filter(([k, x]) => x > 0.004 && k !== 'urine').sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => DIRT_NAMES[k]);
          if (left.length) html += `<span class="insp">Still dirty: ${left.join(', ')}${game.stainHover ? '' : ' · aim at a stain for how'}</span>`;
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
        this.heldIc.src = it.product ? productIcon(it.product) : it.def ? toolIcon(it.def) : '';
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
    this.moneyEl.style.display = game.mode && game.mode !== 'menu' ? 'block' : 'none';
    this.el.style.visibility = game.uiHidden ? 'hidden' : 'visible';
  }
}
