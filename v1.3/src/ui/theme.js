// Rug Rush UI theme: friendslop sticker style tokens, fonts, buttons, panels and small DOM helpers shared by every screen.
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Lilita+One&display=swap';

const CSS = `
:root{--ink:#1b1b1e;--paper:#fffaf0;--yellow:#ffd23f;--pink:#ff5d8f;--cyan:#3bceac;--blue:#3a86ff;--purple:#8338ec;--orange:#ff8c42;--green:#52c46b;--red:#ef3e36;--shadow:0 6px 0 var(--ink);--font:'Fredoka',ui-rounded,'Arial Rounded MT Bold',system-ui,sans-serif;--display:'Lilita One','Fredoka',ui-rounded,sans-serif}
.rr-ui{font-family:var(--font);color:var(--ink);-webkit-font-smoothing:antialiased;user-select:none}
.rr-screen{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:20;padding:16px;box-sizing:border-box}
.rr-screen.dim{background:radial-gradient(ellipse at center,rgba(20,16,40,.15),rgba(20,16,40,.6))}
.rr-panel{background:var(--paper);border:4px solid var(--ink);border-radius:26px;box-shadow:10px 12px 0 rgba(27,27,30,.28);padding:26px 28px;max-width:min(920px,96vw);max-height:92vh;overflow:auto;box-sizing:border-box;animation:rr-pop .32s cubic-bezier(.2,1.6,.4,1)}
.rr-panel h2{font-family:var(--display);font-weight:400;font-size:38px;margin:0 0 14px;letter-spacing:.01em;display:inline-block;padding:4px 16px;border:3px solid var(--ink);border-radius:14px;background:var(--yellow);transform:rotate(-2deg);box-shadow:4px 4px 0 var(--ink)}
.rr-btn{font-family:var(--display);font-size:22px;letter-spacing:.03em;text-transform:uppercase;color:var(--ink);background:var(--yellow);border:3px solid var(--ink);border-radius:16px;box-shadow:var(--shadow);padding:12px 24px;cursor:pointer;transition:transform .12s cubic-bezier(.2,1.6,.4,1),box-shadow .12s,filter .12s;outline:none;white-space:nowrap}
.rr-btn:hover{transform:translateY(-3px) rotate(-1.5deg) scale(1.04);box-shadow:0 9px 0 var(--ink)}
.rr-btn:active{transform:translateY(4px) scale(.98);box-shadow:0 2px 0 var(--ink)}
.rr-btn:disabled{filter:grayscale(1) opacity(.55);cursor:default;transform:none;box-shadow:var(--shadow)}
.rr-btn.pink{background:var(--pink);color:#fff}
.rr-btn.cyan{background:var(--cyan)}
.rr-btn.blue{background:var(--blue);color:#fff}
.rr-btn.purple{background:var(--purple);color:#fff}
.rr-btn.orange{background:var(--orange)}
.rr-btn.green{background:var(--green)}
.rr-btn.white{background:#fff}
.rr-btn.small{font-size:16px;padding:8px 14px;border-radius:12px;box-shadow:0 4px 0 var(--ink)}
.rr-btn.big{font-size:30px;padding:16px 34px;border-radius:20px}
.rr-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.rr-col{display:flex;flex-direction:column;gap:12px}
.rr-chip{font-family:var(--font);color:var(--ink);display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:40px;padding:0 12px;border:3px solid var(--ink);border-radius:12px;background:#fff;font-weight:600;font-size:14px;cursor:pointer;box-shadow:0 3px 0 var(--ink);transition:transform .1s;box-sizing:border-box}
.rr-chip:hover{transform:translateY(-2px)}
.rr-chip.on{background:var(--cyan);transform:translateY(2px);box-shadow:0 1px 0 var(--ink)}
.rr-swatch{width:36px;height:36px;padding:0;min-width:0;border-radius:50%}
.rr-swatch.on{outline:3px solid var(--ink);outline-offset:3px;background-clip:padding-box}
.rr-label{font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.6;margin:10px 0 6px}
.rr-input{font-family:var(--font);font-size:20px;font-weight:600;padding:10px 14px;border:3px solid var(--ink);border-radius:14px;background:#fff;box-shadow:inset 0 3px 0 rgba(0,0,0,.08);outline:none;color:var(--ink);width:100%;box-sizing:border-box}
.rr-input:focus{border-color:var(--blue)}
.rr-range{-webkit-appearance:none;appearance:none;width:100%;height:14px;border:3px solid var(--ink);border-radius:10px;background:#fff;outline:none}
.rr-range::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:var(--pink);border:3px solid var(--ink);box-shadow:0 3px 0 var(--ink);cursor:pointer}
.rr-sticker{display:inline-block;padding:6px 14px;border:3px solid var(--ink);border-radius:14px;background:#fff;font-weight:700;box-shadow:4px 4px 0 var(--ink)}
.rr-logo{font-family:var(--display);font-size:clamp(64px,11vw,132px);line-height:.9;letter-spacing:.02em;text-align:center;margin:0 0 6px;filter:drop-shadow(8px 10px 0 rgba(27,27,30,.35))}
.rr-logo span{display:inline-block;color:var(--c);-webkit-text-stroke:4px var(--ink);paint-order:stroke fill;animation:rr-wobble 2.8s ease-in-out infinite;animation-delay:calc(var(--i) * -.21s)}
.rr-tag{font-size:20px;font-weight:600;text-align:center;margin-bottom:26px;color:#fff;text-shadow:0 2px 0 var(--ink),0 0 18px rgba(0,0,0,.45)}
.rr-card{display:flex;align-items:center;gap:14px;padding:12px 14px;border:3px solid var(--ink);border-radius:16px;background:#fff;box-shadow:0 4px 0 var(--ink)}
.rr-dot{width:16px;height:16px;border-radius:50%;border:2px solid var(--ink);flex:none}
.rr-muted{opacity:.6}
.rr-toggle{position:relative;width:58px;height:32px;border:3px solid var(--ink);border-radius:20px;background:#ddd;cursor:pointer;flex:none;box-sizing:border-box;transition:background .15s}
.rr-toggle::after{content:'';position:absolute;top:2px;left:2px;width:22px;height:22px;border-radius:50%;background:#fff;border:2px solid var(--ink);transition:left .18s cubic-bezier(.2,1.6,.4,1)}
.rr-toggle.on{background:var(--green)}
.rr-toggle.on::after{left:26px}
@keyframes rr-pop{from{transform:scale(.85) rotate(-2deg);opacity:0}}
@keyframes rr-wobble{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-8px) rotate(3deg)}}
@keyframes rr-spin{to{transform:rotate(360deg)}}
 #shop{font-family:var(--font)!important;color:var(--ink)!important;background:radial-gradient(ellipse at center,rgba(20,16,40,.15),rgba(20,16,40,.6))!important}
#shop .win{background:var(--paper)!important;border:4px solid var(--ink);border-radius:26px!important;box-shadow:10px 12px 0 rgba(27,27,30,.28)!important;color:var(--ink)}
#shop header{border-bottom:3px dashed rgba(27,27,30,.25)!important}
#shop h2{font-family:var(--display);font-weight:400!important;font-size:34px!important;padding:4px 14px;border:3px solid var(--ink);border-radius:14px;background:var(--yellow);transform:rotate(-2deg);box-shadow:4px 4px 0 var(--ink)}
#shop .money{font-family:var(--display);font-size:26px;color:#fff!important;background:var(--green);padding:4px 14px;border:3px solid var(--ink);border-radius:14px;box-shadow:3px 3px 0 var(--ink);-webkit-text-stroke:1px var(--ink);paint-order:stroke fill}
#shop .it{background:#fff!important;border:3px solid var(--ink);box-shadow:0 4px 0 var(--ink);border-radius:14px!important;color:var(--ink)}
#shop .it:hover{transform:translateY(-2px) rotate(-.6deg)}
#shop .sw{border:2px solid var(--ink)}
#shop .ic{width:52px;height:52px;flex:none;border-radius:12px;background:#f1ebde;border:2px solid var(--ink)}
#shop .q{flex:1;margin:0 16px;font-family:var(--font);font-size:17px;font-weight:600;padding:9px 14px;border:3px solid var(--ink);border-radius:14px;background:#fff;outline:none;min-width:120px;color:var(--ink)}
#shop .q:focus{border-color:var(--blue)}
#shop .sec{font-family:var(--display);font-weight:400;font-size:18px!important;opacity:1!important;letter-spacing:.04em!important}
#shop .pr{font-family:var(--display);font-size:20px;font-weight:400!important}
#shop footer{border-top:3px dashed rgba(27,27,30,.25)!important;opacity:1!important}
#shop button{font-family:var(--display)!important;font-size:18px;color:var(--ink)!important;background:var(--pink)!important;border:3px solid var(--ink)!important;border-radius:14px!important;box-shadow:0 4px 0 var(--ink);padding:8px 18px!important}
.rr-spinner{width:22px;height:22px;border:3px solid var(--ink);border-top-color:transparent;border-radius:50%;animation:rr-spin .8s linear infinite;display:inline-block}
`;

let installed = false;
export function installTheme() {
  if (installed) return;
  installed = true;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = FONT_URL;
  document.head.appendChild(l);
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}

export function logo(text = 'RUG RUSH') {
  const colors = ['#ffd23f', '#ff5d8f', '#3bceac', '#3a86ff', '#ff8c42', '#8338ec', '#52c46b', '#ffd23f'];
  const h = el('div', { class: 'rr-logo' });
  [...text].forEach((ch, i) => {
    const s = el('span', { style: `--c:${colors[i % colors.length]};--i:${i}` }, ch === ' ' ? ' ' : ch);
    h.append(s);
  });
  return h;
}

export function button(label, opts = {}) {
  const b = el('button', { class: `rr-btn ${opts.cls ?? ''}`, type: 'button' }, label);
  if (opts.onClick) b.addEventListener('click', (e) => { opts.sfx?.('ui_click'); opts.onClick(e); });
  if (opts.sfx) b.addEventListener('mouseenter', () => opts.sfx('ui_hover'));
  return b;
}
