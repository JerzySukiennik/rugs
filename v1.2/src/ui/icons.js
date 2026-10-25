// Rug Rush icons: hand-drawn sticker icons for every product container and tool, cached as data URLs for the shop and HUD.
const cache = new Map();
const INK = '#1b1b1e';

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = 4;
  g.strokeStyle = INK;
  return { c, g };
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function fillStroke(g, color) {
  g.fillStyle = color;
  g.fill();
  g.stroke();
}

function label(g, x, y, w, h, color, letter) {
  rr(g, x, y, w, h, 4);
  fillStroke(g, '#fffaf0');
  g.fillStyle = color === '#ffffff' || color === '#fbf7ec' || color === '#f4f8ff' ? '#3a86ff' : shade(color, 0.7);
  g.fillRect(x + 3, y + h - 8, w - 6, 5);
  g.fillStyle = INK;
  g.font = `700 ${Math.round(h * 0.55)}px Fredoka, Arial Rounded MT Bold, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, x + w / 2, y + h * 0.42);
}

const DRAW = {
  trigger(g, col, L) {
    rr(g, 30, 34, 36, 54, 10);
    fillStroke(g, col);
    rr(g, 40, 22, 16, 14, 3);
    fillStroke(g, '#f4f4f4');
    rr(g, 30, 8, 40, 16, 5);
    fillStroke(g, '#f4f4f4');
    g.beginPath();
    g.moveTo(30, 16);
    g.lineTo(18, 18);
    g.stroke();
    g.beginPath();
    g.moveTo(42, 24);
    g.lineTo(38, 36);
    g.stroke();
    label(g, 34, 50, 28, 26, col, L);
  },
  aerosol(g, col, L) {
    rr(g, 34, 26, 28, 62, 6);
    fillStroke(g, '#c9ced3');
    rr(g, 37, 12, 22, 16, 5);
    fillStroke(g, col === '#ffffff' ? '#5aa9e6' : col);
    label(g, 36, 42, 24, 30, col, L);
  },
  jug(g, col, L) {
    rr(g, 24, 24, 48, 64, 12);
    fillStroke(g, col);
    rr(g, 38, 10, 18, 16, 4);
    fillStroke(g, '#ffffff');
    rr(g, 58, 32, 10, 26, 5);
    fillStroke(g, shade(col, 0.85));
    label(g, 28, 46, 30, 30, col, L);
  },
  jerrycan(g, col, L) {
    rr(g, 18, 22, 60, 66, 10);
    fillStroke(g, col);
    rr(g, 30, 10, 26, 14, 6);
    fillStroke(g, shade(col, 0.8));
    rr(g, 60, 8, 12, 16, 3);
    fillStroke(g, INK);
    label(g, 26, 40, 44, 34, col, L);
  },
  tub(g, col, L) {
    rr(g, 16, 38, 64, 50, 8);
    fillStroke(g, '#f7f7f2');
    rr(g, 12, 28, 72, 14, 6);
    fillStroke(g, col === '#ffffff' ? '#3d8fe0' : shade(col, 0.85));
    label(g, 26, 48, 44, 32, col, L);
  },
  shaker(g, col, L) {
    rr(g, 30, 22, 36, 66, 8);
    fillStroke(g, '#f2efe6');
    rr(g, 28, 12, 40, 14, 5);
    fillStroke(g, '#9aa3a8');
    g.fillStyle = INK;
    for (let i = 0; i < 4; i++) g.fillRect(36 + i * 7, 17, 3, 3);
    label(g, 33, 40, 30, 34, col, L);
  },
  foamer(g, col, L) {
    rr(g, 18, 30, 42, 58, 12);
    fillStroke(g, '#ffffff');
    rr(g, 34, 10, 10, 22, 3);
    fillStroke(g, '#e94f37');
    rr(g, 26, 6, 26, 8, 4);
    fillStroke(g, '#e94f37');
    g.beginPath();
    g.moveTo(60, 50);
    g.quadraticCurveTo(80, 52, 84, 34);
    g.stroke();
    rr(g, 78, 22, 10, 14, 3);
    fillStroke(g, '#e94f37');
    label(g, 22, 48, 34, 30, col, L);
  },
};

const TOOL = {
  vacuum(g, d) {
    const col = d.wet ? '#2c7bd1' : '#d33a2c';
    g.beginPath();
    g.moveTo(58, 10);
    g.lineTo(48, 70);
    g.stroke();
    rr(g, 52, 6, 16, 10, 4);
    fillStroke(g, INK);
    rr(g, 36, 34, 26, 36, 8);
    fillStroke(g, col);
    rr(g, 18, 72, 60, 16, 6);
    fillStroke(g, '#2b2d30');
  },
  brush(g, d) {
    if (d.rake) {
      g.beginPath();
      g.moveTo(48, 6);
      g.lineTo(48, 60);
      g.stroke();
      rr(g, 14, 58, 68, 12, 4);
      fillStroke(g, '#9aa1a6');
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.moveTo(18 + i * 7.5, 70);
        g.lineTo(18 + i * 7.5, 86);
        g.stroke();
      }
      return;
    }
    const col = d.rubber ? '#e5542e' : d.strength > 0.8 ? '#2f6db5' : '#c9a35f';
    rr(g, 30, 22, 36, 14, 6);
    fillStroke(g, d.rubber ? '#e5542e' : '#7a5230');
    rr(g, 16, 36, 64, 22, 6);
    fillStroke(g, d.rubber ? '#e5542e' : '#7a5230');
    for (let i = 0; i < 10; i++) {
      g.strokeStyle = col;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(21 + i * 6, 60);
      g.lineTo(21 + i * 6, 82);
      g.stroke();
    }
    g.strokeStyle = INK;
    g.lineWidth = 4;
  },
  squeegee(g) {
    g.beginPath();
    g.moveTo(48, 6);
    g.lineTo(48, 62);
    g.stroke();
    rr(g, 6, 60, 84, 12, 4);
    fillStroke(g, '#f2c230');
    rr(g, 8, 72, 80, 10, 3);
    fillStroke(g, '#151515');
  },
  scraper(g) {
    rr(g, 40, 10, 16, 40, 6);
    fillStroke(g, '#5a3a22');
    g.beginPath();
    g.moveTo(38, 50);
    g.lineTo(58, 50);
    g.lineTo(62, 86);
    g.lineTo(34, 86);
    g.closePath();
    fillStroke(g, '#efe6d2');
  },
  iron(g) {
    rr(g, 10, 72, 76, 10, 3);
    fillStroke(g, '#a77d4f');
    g.beginPath();
    g.moveTo(14, 70);
    g.lineTo(82, 70);
    g.quadraticCurveTo(80, 40, 50, 36);
    g.lineTo(26, 36);
    g.closePath();
    fillStroke(g, '#3a7bd5');
    rr(g, 30, 18, 36, 12, 6);
    fillStroke(g, INK);
  },
  uvlamp(g) {
    rr(g, 14, 38, 56, 20, 8);
    fillStroke(g, '#2b2d30');
    rr(g, 68, 32, 16, 32, 6);
    fillStroke(g, '#7d3cff');
    g.strokeStyle = '#a36bff';
    g.lineWidth = 3;
    for (const a of [-0.35, 0, 0.35]) {
      g.beginPath();
      g.moveTo(86, 48);
      g.lineTo(86 + Math.cos(a) * 10, 48 + Math.sin(a) * 10);
      g.stroke();
    }
    g.strokeStyle = INK;
    g.lineWidth = 4;
  },
  blower(g) {
    g.beginPath();
    g.arc(46, 46, 30, 0, Math.PI * 2);
    fillStroke(g, '#d83c2c');
    g.beginPath();
    g.arc(46, 46, 20, 0, Math.PI * 2);
    fillStroke(g, '#222');
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      g.beginPath();
      g.moveTo(46, 46);
      g.lineTo(46 + Math.cos(a) * 17, 46 + Math.sin(a) * 17);
      g.strokeStyle = '#d9dde0';
      g.stroke();
    }
    g.strokeStyle = INK;
    rr(g, 18, 78, 56, 8, 3);
    fillStroke(g, '#333');
  },
};

export function productIcon(p) {
  const key = `p:${p.brand}:${p.name}`;
  if (cache.has(key)) return cache.get(key);
  const { c, g } = canvas();
  (DRAW[p.container] ?? DRAW.jug)(g, p.color, p.brand[0]);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function toolIcon(def) {
  const key = `t:${def.name}`;
  if (cache.has(key)) return cache.get(key);
  const { c, g } = canvas();
  (TOOL[def.kind] ?? TOOL.scraper)(g, def);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function simpleIcon(emoji, bg) {
  const key = `e:${emoji}:${bg}`;
  if (cache.has(key)) return cache.get(key);
  const { c, g } = canvas();
  rr(g, 8, 8, 80, 80, 18);
  fillStroke(g, bg);
  g.font = '52px "Apple Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, 48, 52);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
