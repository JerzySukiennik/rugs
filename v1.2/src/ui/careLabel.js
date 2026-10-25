// Rug Rush care label: draws a sewn fabric label with ISO 3758 style care symbols for a rug type.
import * as THREE from 'three';
import { FIBERS } from '../data/fibers.js';
import { CARPET_TYPES } from '../data/carpetTypes.js';

const INK = '#1d1f24';

function tub(g, x, y, s) {
  g.beginPath();
  g.moveTo(x - s * 0.5, y - s * 0.28);
  g.lineTo(x - s * 0.42, y + s * 0.3);
  g.lineTo(x + s * 0.42, y + s * 0.3);
  g.lineTo(x + s * 0.5, y - s * 0.28);
  g.stroke();
  g.beginPath();
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const px = x - s * 0.46 + t * s * 0.92;
    const py = y - s * 0.16 + Math.sin(t * Math.PI * 4) * s * 0.04;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.stroke();
}

function cross(g, x, y, s) {
  g.beginPath();
  g.moveTo(x - s * 0.5, y - s * 0.4);
  g.lineTo(x + s * 0.5, y + s * 0.4);
  g.moveTo(x + s * 0.5, y - s * 0.4);
  g.lineTo(x - s * 0.5, y + s * 0.4);
  g.stroke();
}

function dots(g, x, y, n, s) {
  for (let i = 0; i < n; i++) {
    g.beginPath();
    g.arc(x + (i - (n - 1) / 2) * s * 0.18, y, s * 0.045, 0, Math.PI * 2);
    g.fill();
  }
}

function symWash(g, x, y, s, wash) {
  tub(g, x, y, s);
  if (wash.no) return cross(g, x, y, s);
  if (wash.hand) {
    g.beginPath();
    g.moveTo(x - s * 0.12, y + s * 0.18);
    g.lineTo(x - s * 0.12, y - s * 0.02);
    for (let f = 0; f < 4; f++) {
      const fx = x - s * 0.1 + f * s * 0.07;
      g.moveTo(fx, y + s * 0.02);
      g.lineTo(fx + s * 0.02, y - s * 0.12 + Math.abs(f - 1.5) * s * 0.03);
    }
    g.stroke();
    return;
  }
  g.font = `bold ${s * 0.3}px Helvetica, Arial, sans-serif`;
  g.textAlign = 'center';
  g.fillText(String(wash.temp), x, y + s * 0.2);
  for (let b = 0; b < (wash.bars ?? 0); b++) {
    g.beginPath();
    g.moveTo(x - s * 0.42, y + s * 0.42 + b * s * 0.1);
    g.lineTo(x + s * 0.42, y + s * 0.42 + b * s * 0.1);
    g.stroke();
  }
}

function symBleach(g, x, y, s, mode) {
  g.beginPath();
  g.moveTo(x, y - s * 0.38);
  g.lineTo(x + s * 0.46, y + s * 0.34);
  g.lineTo(x - s * 0.46, y + s * 0.34);
  g.closePath();
  g.stroke();
  if (mode === 'none') cross(g, x, y, s * 0.9);
  if (mode === 'nonChlorine') {
    g.beginPath();
    g.moveTo(x - s * 0.12, y + s * 0.28);
    g.lineTo(x + s * 0.04, y - s * 0.04);
    g.moveTo(x + s * 0.02, y + s * 0.28);
    g.lineTo(x + s * 0.18, y - s * 0.04);
    g.stroke();
  }
}

function symIron(g, x, y, s, n) {
  g.beginPath();
  g.moveTo(x - s * 0.48, y + s * 0.3);
  g.lineTo(x + s * 0.48, y + s * 0.3);
  g.lineTo(x + s * 0.4, y - s * 0.12);
  g.quadraticCurveTo(x + s * 0.05, y - s * 0.22, x - s * 0.3, y - s * 0.1);
  g.closePath();
  g.moveTo(x + s * 0.4, y - s * 0.12);
  g.lineTo(x + s * 0.32, y - s * 0.32);
  g.lineTo(x - s * 0.12, y - s * 0.32);
  g.stroke();
  if (n === 0) cross(g, x, y, s);
  else dots(g, x + s * 0.04, y + s * 0.12, n, s);
}

function symDry(g, x, y, s, letter) {
  g.beginPath();
  g.arc(x, y, s * 0.36, 0, Math.PI * 2);
  g.stroke();
  g.font = `bold ${s * 0.36}px Helvetica, Arial, sans-serif`;
  g.textAlign = 'center';
  g.fillText(letter, x, y + s * 0.13);
}

function symTumble(g, x, y, s) {
  g.strokeRect(x - s * 0.38, y - s * 0.38, s * 0.76, s * 0.76);
  g.beginPath();
  g.arc(x, y, s * 0.28, 0, Math.PI * 2);
  g.stroke();
  cross(g, x, y, s * 0.8);
}

export function drawCareLabel(type, { width = 2, length = 3, client = '', seed = 1 } = {}) {
  const fb = FIBERS[type];
  const ct = CARPET_TYPES[type];
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 520;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f3ea';
  g.fillRect(0, 0, 320, 520);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(120,110,90,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 320, Math.random() * 520, 2, 1);
  }
  g.strokeStyle = 'rgba(80,70,60,0.35)';
  g.setLineDash([6, 5]);
  g.lineWidth = 2;
  g.strokeRect(10, 10, 300, 500);
  g.setLineDash([]);
  g.fillStyle = INK;
  g.strokeStyle = INK;
  g.textAlign = 'center';
  g.font = 'bold 22px Helvetica, Arial, sans-serif';
  g.fillText(ct.name.toUpperCase(), 160, 52);
  g.font = '17px Helvetica, Arial, sans-serif';
  g.fillText(fb.fiber, 160, 80);
  g.fillText(`${Math.round(width * 100)} × ${Math.round(length * 100)} cm`, 160, 104);
  g.lineWidth = 3.5;
  g.lineJoin = 'round';
  const s = 62;
  const y1 = 175, y2 = 265;
  symWash(g, 90, y1, s, fb.care.wash);
  symBleach(g, 230, y1, s, fb.care.bleach);
  symIron(g, 90, y2, s, fb.care.iron);
  symDry(g, 230, y2, s, fb.care.dry);
  symTumble(g, 160, 345, s * 0.8);
  g.font = 'bold 16px Helvetica, Arial, sans-serif';
  let y = 410;
  for (const n of fb.care.notes) {
    g.fillText(n, 160, y);
    y += 24;
  }
  g.font = '12px Helvetica, Arial, sans-serif';
  g.fillStyle = 'rgba(29,31,36,0.7)';
  g.fillText(`LOT ${String(seed).padStart(6, '0')}  ·  ${client}`, 160, 496);
  return c;
}

export function careLabelTexture(type, opts) {
  const t = new THREE.CanvasTexture(drawCareLabel(type, opts));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
