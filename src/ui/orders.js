// Rug Rush clipboard and guide: Tab shows every rug in the warehouse with its client and state; a day-one checklist teaches the loop.
import { installTheme, el } from './theme.js';

const CSS = `
#rr-clip{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-1.5deg);z-index:15;width:min(560px,94vw);display:none;pointer-events:none}
#rr-clip.on{display:block;animation:rr-pop .25s cubic-bezier(.2,1.6,.4,1)}
#rr-clip .board{background:#c9955c;border:4px solid #1b1b1e;border-radius:22px;padding:34px 16px 16px;box-shadow:10px 12px 0 rgba(27,27,30,.3);position:relative}
#rr-clip .clip{position:absolute;top:-16px;left:50%;transform:translateX(-50%);width:120px;height:34px;background:#c3c7cb;border:4px solid #1b1b1e;border-radius:12px}
#rr-clip .paper{background:#fffaf0;border:3px solid #1b1b1e;border-radius:10px;padding:14px 16px;min-height:120px}
#rr-clip h3{font-family:var(--display);font-weight:400;font-size:26px;margin:0 0 8px}
#rr-clip .row{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:8px 0;border-bottom:2px dashed rgba(27,27,30,.2)}
#rr-clip .row:last-child{border-bottom:0}
#rr-clip .nm{font-weight:700}
#rr-clip .note{font-size:13px;opacity:.7;grid-column:1/-1}
#rr-clip .st{font-family:var(--display);font-size:15px;padding:2px 9px;border:2px solid #1b1b1e;border-radius:9px;background:#ffd23f;align-self:start}
#rr-guide{position:fixed;left:18px;top:96px;z-index:3;width:270px;padding:12px 14px;border:3px solid #1b1b1e;border-radius:16px;background:#fffaf0;box-shadow:5px 5px 0 rgba(27,27,30,.35);transform:rotate(-1deg);font:600 13.5px/1.35 var(--font);color:#1b1b1e;pointer-events:none;transition:opacity .3s}
#rr-guide h4{font-family:var(--display);font-weight:400;font-size:19px;margin:0 0 6px}
#rr-guide li{list-style:none;display:flex;gap:7px;margin:4px 0;opacity:.45}
#rr-guide li.cur{opacity:1}
#rr-guide li.done{opacity:.5;text-decoration:line-through}
#rr-guide li b{flex:none;width:18px;height:18px;border:2px solid #1b1b1e;border-radius:6px;background:#fff;font-size:12px;display:flex;align-items:center;justify-content:center}
#rr-guide li.done b{background:#52c46b;color:#fff}
#rr-guide li.cur b{background:#ffd23f}
#rr-guide ul{margin:0;padding:0}
#rr-guide .hide{font-size:11px;opacity:.55;margin-top:6px}
`;

const STEPS = [
  ['Unload a rug from the truck (E to grab, drag it out)', (g) => g.carpets?.list?.some((c) => !g.trucks.some((t) => t.inCargo?.(c.body ? c.body.translation() : c.uvToWorld(0.5, 0.5).point)))],
  ['Kick it open on the white tiles (R on the roll)', (g) => g.carpets?.list?.some((c) => c.state === 'flat')],
  ['Read its care label (E on the tag at a corner)', (g) => g.flags.readLabel],
  ['Vacuum the dust off', (g) => g.flags.vacuumed],
  ['Spray, pour or foam something on it', (g) => g.flags.applied],
  ['Scrub it with a brush', (g) => g.flags.scrubbed],
  ['Rinse it with the hanging hose', (g) => g.flags.rinsed],
  ['Squeegee the water off and dry it (fan or rack)', (g) => g.flags.dried],
  ['Lay it on the roller belt and press the green button', (g) => g.flags.wrapped],
  ['Load the wrapped roll onto the green truck', (g) => g.flags.shipped],
];

export class Clipboard {
  constructor(game) {
    installTheme();
    this.game = game;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.append(st);
    this.el = el('div', { id: 'rr-clip', class: 'rr-ui' }, el('div', { class: 'board' }, el('div', { class: 'clip' }), el('div', { class: 'paper' })));
    this.paper = this.el.querySelector('.paper');
    document.body.append(this.el);
    this.guide = el('div', { id: 'rr-guide', class: 'rr-ui' });
    document.body.append(this.guide);
    this.order = 991;
    this.acc = 1;
    this.guideOn = true;
    game.flags ??= {};
  }

  render() {
    const g = this.game;
    const rugs = g.carpets?.list ?? [];
    this.paper.innerHTML = '';
    this.paper.append(el('h3', {}, `Rugs in the warehouse (${rugs.length})`));
    if (!rugs.length) this.paper.append(el('div', { class: 'rr-muted', style: 'font-weight:600' }, 'Nothing yet. Listen for the reversing beeper.'));
    for (const c of rugs) {
      const ev = g.chem?.evaluate(c);
      let st = c.wrapped ? `Wrapped · ${c.finalEval?.grade ?? ''}` : c.state === 'rolled' ? 'Rolled' : ev ? `${Math.round(ev.clean * 100)}% clean · ${Math.round(ev.wet * 100)}% wet` : '';
      if (ev?.ruined) st = 'Ruined';
      this.paper.append(el('div', { class: 'row' },
        el('div', { class: 'nm' }, c.displayName?.() ?? c.type),
        el('div', { class: 'st', style: ev?.ruined ? 'background:#ff5d8f;color:#fff' : '' }, st),
        el('div', { class: 'note' }, `${c.job?.client ?? ''}: “${c.job?.note ?? ''}”`)));
    }
  }

  update(dt) {
    const g = this.game;
    const show = g.mode !== 'menu' && g.input.held('Tab') && !document.querySelector('.rr-screen');
    if (show && !this.el.classList.contains('on')) this.render();
    this.el.classList.toggle('on', show);
    this.acc += dt;
    if (this.acc < 0.4) return;
    this.acc = 0;
    if (show) this.render();
    this.track();
    const day = g.shift?.day ?? 1;
    const vis = this.guideOn && g.mode !== 'menu' && day <= 1 && !g.flags.guideDone && !g.uiHidden;
    this.guide.style.display = vis ? 'block' : 'none';
    if (!vis) return;
    let cur = -1;
    const items = STEPS.map(([text, test], i) => {
      const done = !!g.flags[`step${i}`] || !!test(g);
      if (done) g.flags[`step${i}`] = true;
      if (!done && cur < 0) cur = i;
      return { text, done };
    });
    if (cur < 0) {
      g.flags.guideDone = true;
      g.hud?.toast('You know the drill now. Go make some money!');
      return;
    }
    const key = items.map((x) => (x.done ? 1 : 0)).join('') + cur;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.guide.innerHTML = '';
    const ul = el('ul');
    items.forEach((x, i) => ul.append(el('li', { class: x.done ? 'done' : i === cur ? 'cur' : '' }, el('b', {}, x.done ? '✓' : String(i + 1)), x.text)));
    this.guide.append(el('h4', {}, 'First day'), ul, el('div', { class: 'hide' }, 'Hold Tab for the rug list'));
  }

  track() {
    const g = this.game;
    const f = g.flags;
    const it = g.grab?.heldItem?.();
    if (it?.using) {
      const k = it.def?.kind;
      if (k === 'vacuum') f.vacuumed = true;
      if (k === 'brush') f.scrubbed = true;
      if (it.product) f.applied = true;
    }
    if (g.hose?.flowing) f.rinsed = true;
    if (g.hud?.labelOpen) f.readLabel = true;
    for (const c of g.carpets?.list ?? []) {
      if (c.state !== 'flat') continue;
      const st = g.chem?.state(c);
      if (st && f.rinsed && (g.chem.evaluate(c)?.dryEnough)) f.dried = true;
    }
  }
}
