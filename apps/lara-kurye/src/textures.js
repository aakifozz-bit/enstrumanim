// Tüm dokular tarayıcıda canvas ile üretilir (harici görsel dosyası yok).
import * as THREE from 'three';
import { rng } from './builder.js';

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function tex(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

function noise(ctx, w, h, amp, r, mono = true) {
  const d = ctx.getImageData(0, 0, w, h), a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] === 0) continue;
    const n = (r() - 0.5) * 2 * amp;
    a[i] += n; a[i + 1] += mono ? n : (r() - 0.5) * 2 * amp; a[i + 2] += mono ? n : (r() - 0.5) * 2 * amp;
  }
  ctx.putImageData(d, 0, 0);
}

export function asphalt() {
  const r = rng(11), s = 512, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = '#46464a'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 26; i++) { // yama ve lekeler
    x.fillStyle = `rgba(${r() < 0.5 ? '20,20,22' : '95,95,98'},${0.05 + r() * 0.08})`;
    x.beginPath(); x.ellipse(r() * s, r() * s, 30 + r() * 90, 20 + r() * 60, r() * 3, 0, 7); x.fill();
  }
  noise(x, s, s, 16, r);
  for (let i = 0; i < 2600; i++) { // agrega taneleri
    const g = 90 + r() * 90; x.fillStyle = `rgba(${g},${g},${g},${0.25 + r() * 0.4})`;
    x.fillRect(r() * s, r() * s, 1 + r() * 1.6, 1 + r() * 1.6);
  }
  x.strokeStyle = 'rgba(15,15,16,0.55)'; x.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) { // çatlaklar
    let px = r() * s, py = r() * s; x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 14; k++) { px += (r() - 0.5) * 50; py += (r() - 0.3) * 40; x.lineTo(px, py); }
    x.stroke();
  }
  return tex(c);
}

export function paver() {
  const r = rng(5), s = 512, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = '#6e6a64'; x.fillRect(0, 0, s, s);
  const bw = s / 8, bh = s / 16;
  for (let j = 0; j < 16; j++) for (let i = -1; i < 8; i++) {
    const g = 150 + r() * 34, red = r() < 0.13;
    x.fillStyle = red ? `rgb(${g + 8},${g - 30},${g - 42})` : `rgb(${g},${g - 2},${g - 7})`;
    x.fillRect(i * bw + (j % 2) * bw / 2 + 1.5, j * bh + 1.5, bw - 3, bh - 3);
  }
  noise(x, s, s, 9, r);
  return tex(c);
}

export function grass() {
  const r = rng(8), s = 512, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = '#5d7a35'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 60; i++) {
    x.fillStyle = `rgba(${r() < 0.5 ? '150,140,80' : '50,80,30'},${0.08 + r() * 0.1})`;
    x.beginPath(); x.ellipse(r() * s, r() * s, 20 + r() * 70, 15 + r() * 50, r() * 3, 0, 7); x.fill();
  }
  for (let i = 0; i < 9000; i++) {
    const g = 90 + r() * 90; x.strokeStyle = `rgba(${g * 0.6},${g},${g * 0.3},0.5)`;
    const px = r() * s, py = r() * s; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 4, py - 2 - r() * 5); x.stroke();
  }
  noise(x, s, s, 10, r);
  return tex(c);
}

export function plaster() {
  const r = rng(3), s = 256, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = '#f0ede6'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 18; i++) {
    x.fillStyle = `rgba(120,110,95,${0.02 + r() * 0.04})`;
    x.beginPath(); x.ellipse(r() * s, r() * s, 20 + r() * 60, 30 + r() * 80, 0, 0, 7); x.fill();
  }
  noise(x, s, s, 7, r);
  return tex(c);
}

export function leaves() {
  const r = rng(21), s = 256, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = '#6a6a6a'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) {
    const g = 70 + r() * 185; x.fillStyle = `rgb(${g},${g},${g})`;
    x.beginPath(); x.ellipse(r() * s, r() * s, 3 + r() * 6, 1.5 + r() * 3, r() * 6.3, 0, 7); x.fill();
  }
  return tex(c);
}

export function frond() {
  const r = rng(31), w = 256, h = 512, c = cv(w, h), x = c.getContext('2d');
  x.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const t = i / 150, y = h - 6 - t * (h - 14);
    const len = (w * 0.47) * Math.sin(Math.PI * Math.min(1, t * 1.08 + 0.1)) * (0.85 + r() * 0.15);
    const g = 85 + r() * 70;
    x.strokeStyle = `rgb(${g * 0.55},${g},${g * 0.32})`; x.lineWidth = 2.4;
    for (const sgn of [-1, 1]) {
      x.beginPath(); x.moveTo(w / 2, y);
      x.quadraticCurveTo(w / 2 + sgn * len * 0.5, y - 18, w / 2 + sgn * len, y - 30 - r() * 14); x.stroke();
    }
  }
  x.strokeStyle = '#8a9a4a'; x.lineWidth = 5; x.beginPath(); x.moveTo(w / 2, h); x.lineTo(w / 2, 8); x.stroke();
  const t = tex(c, { repeat: false });
  return t;
}

export function trunk() {
  const r = rng(41), w = 128, h = 256, c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = '#7a6a58'; x.fillRect(0, 0, w, h);
  for (let j = 0; j < 22; j++) {
    const y = j * h / 22;
    x.fillStyle = `rgba(40,30,22,${0.35 + r() * 0.25})`; x.fillRect(0, y, w, 3);
    x.fillStyle = `rgba(190,170,140,${0.12 + r() * 0.12})`; x.fillRect(0, y + 4, w, 3);
    for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(50,38,28,0.3)'; x.fillRect(i * 16 + (j % 2) * 8, y, 2, h / 22); }
  }
  noise(x, w, h, 14, r);
  return tex(c);
}

export function rock() {
  const r = rng(51), s = 512, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = '#b89a72'; x.fillRect(0, 0, s, s);
  for (let j = 0; j < 40; j++) {
    const g = r();
    x.fillStyle = `rgba(${g < 0.5 ? '95,70,48' : '225,200,160'},${0.12 + r() * 0.2})`;
    x.fillRect(0, r() * s, s, 4 + r() * 30);
  }
  x.strokeStyle = 'rgba(50,35,25,0.5)';
  for (let i = 0; i < 60; i++) {
    let px = r() * s, py = r() * s; x.lineWidth = 0.6 + r() * 2; x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 22; py += 10 + r() * 30; x.lineTo(px, py); } x.stroke();
  }
  for (let i = 0; i < 50; i++) {
    x.fillStyle = `rgba(60,80,40,${0.1 + r() * 0.15})`;
    x.beginPath(); x.ellipse(r() * s, r() * s, 8 + r() * 26, 5 + r() * 14, 0, 0, 7); x.fill();
  }
  noise(x, s, s, 18, r);
  return tex(c);
}

// Döşenebilir su normal haritası (tam sayı frekanslı sinüs toplamı)
export function waterNormal() {
  const r = rng(61), s = 256, c = cv(s, s), x = c.getContext('2d');
  const waves = [];
  for (let i = 0; i < 28; i++) {
    const kx = Math.round((r() - 0.5) * 22), ky = Math.round((r() - 0.5) * 22);
    const k = Math.hypot(kx, ky) || 1;
    waves.push([kx, ky, r() * 6.283, 1 / Math.pow(k, 1.15)]);
  }
  const d = x.createImageData(s, s);
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    let dx = 0, dy = 0;
    for (const [kx, ky, ph, a] of waves) {
      const cc = Math.cos(6.283185 * (kx * i + ky * j) / s + ph) * a;
      dx += cc * kx; dy += cc * ky;
    }
    const o = (j * s + i) * 4;
    d.data[o] = 128 + Math.max(-127, Math.min(127, dx * 22));
    d.data[o + 1] = 128 + Math.max(-127, Math.min(127, dy * 22));
    d.data[o + 2] = 255; d.data[o + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  return tex(c, { srgb: false });
}

function vnoise(r, n) {
  const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = r();
  return (u, v) => {
    const x = ((u % 1) + 1) % 1 * n, y = ((v % 1) + 1) % 1 * n;
    const x0 = Math.floor(x) % n, y0 = Math.floor(y) % n, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    let fx = x - Math.floor(x), fy = y - Math.floor(y);
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return (g[y0 * n + x0] * (1 - fx) + g[y0 * n + x1] * fx) * (1 - fy) + (g[y1 * n + x0] * (1 - fx) + g[y1 * n + x1] * fx) * fy;
  };
}

export function clouds() {
  const r = rng(71), s = 512, c = cv(s, s), x = c.getContext('2d');
  const o = [4, 8, 16, 32, 64].map((n) => vnoise(r, n));
  const d = x.createImageData(s, s);
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const u = i / s, v = j / s;
    let f = 0, a = 0.5;
    for (const fn of o) { f += fn(u, v) * a; a *= 0.5; }
    const al = Math.max(0, Math.min(1, (f - 0.56) * 5.5));
    const k = (j * s + i) * 4;
    d.data[k] = d.data[k + 1] = d.data[k + 2] = 255; d.data[k + 3] = al * 235;
  }
  x.putImageData(d, 0, 0);
  return tex(c);
}

// ---- Cephe atlası: 4x2 karo, her karo 4m x 3m ----
export const TILE = { WINDOW: 0, BALCONY: 1, BLANK: 2, AC: 3, SMALL: 4, SHOP: 5, DOOR: 6, SHUTTER: 7 };
const S = 96, TW = 4 * S, TH = 3 * S, AW = TW * 4, AH = TH * 2;

export function tileUV(t) {
  const col = t % 4, row = Math.floor(t / 4), e = 1.5;
  return [(col * TW + e) / AW, 1 - ((row + 1) * TH - e) / AH, ((col + 1) * TW - e) / AW, 1 - (row * TH + e) / AH];
}

export function facadeAtlas() {
  const r = rng(91), c = cv(AW, AH), x = c.getContext('2d'), co = cv(AW, AH), xo = co.getContext('2d');
  x.fillStyle = '#f1eee8'; x.fillRect(0, 0, AW, AH);
  xo.fillStyle = 'rgb(0,235,0)'; xo.fillRect(0, 0, AW, AH);
  for (let i = 0; i < 90; i++) { // sıva lekeleri
    x.fillStyle = `rgba(110,100,85,${0.015 + r() * 0.035})`;
    x.beginPath(); x.ellipse(r() * AW, r() * AH, 30 + r() * 90, 40 + r() * 120, 0, 0, 7); x.fill();
  }
  const P = (t) => {
    const ox = (t % 4) * TW, oy = Math.floor(t / 4) * TH;
    const px = (X, Y, W, H) => [ox + X * S, oy + TH - (Y + H) * S, W * S, H * S];
    const f = (X, Y, W, H, col, rough = 0.9, metal = 0) => {
      x.fillStyle = col; x.fillRect(...px(X, Y, W, H));
      xo.fillStyle = `rgb(0,${(rough * 255) | 0},${(metal * 255) | 0})`; xo.fillRect(...px(X, Y, W, H));
    };
    const glass = (X, Y, W, H, curtain = r() < 0.5) => {
      f(X, Y, W, H, '#5f7488', 0.05, 0.95);
      const [a, b, w, h] = px(X, Y, W, H);
      const g = x.createLinearGradient(a, b, a + w * 0.6, b + h);
      g.addColorStop(0, 'rgba(190,215,235,0.55)'); g.addColorStop(0.45, 'rgba(60,80,100,0.15)'); g.addColorStop(1, 'rgba(10,18,28,0.6)');
      x.fillStyle = g; x.fillRect(a, b, w, h);
      if (curtain) { // tül perde
        const cw = W * (0.3 + r() * 0.5);
        f(r() < 0.5 ? X : X + W - cw, Y, cw, H, '#cfd0cb', 0.35, 0.25);
        x.fillStyle = 'rgba(255,255,255,0.12)';
        for (let k = 0; k < 6; k++) x.fillRect(a + r() * w, b, 2, h);
      }
      x.fillStyle = 'rgba(0,0,0,0.38)'; x.fillRect(a, b, w, 5); x.fillRect(a, b, 4, h); // pencere girintisi gölgesi
    };
    const frame = (X, Y, W, H, panes, col = '#f7f7f5', ft = 0.07) => {
      f(X - ft, Y - ft, W + 2 * ft, H + 2 * ft, col, 0.35, 0);
      const pw = (W - ft * (panes - 1)) / panes;
      for (let k = 0; k < panes; k++) glass(X + k * (pw + ft), Y, pw, H);
    };
    const streak = (X, Y, W) => {
      const [a, b, w] = px(X, Y - 0.7, W, 0.7);
      const g = x.createLinearGradient(0, b, 0, b + 0.7 * S);
      g.addColorStop(0, 'rgba(95,85,70,0.22)'); g.addColorStop(1, 'rgba(95,85,70,0)');
      x.fillStyle = g; x.fillRect(a, b, w, 0.7 * S);
    };
    const sill = (X, Y, W) => { f(X - 0.14, Y - 0.15, W + 0.28, 0.08, '#b9b4aa', 0.5); streak(X - 0.1, Y - 0.15, 0.25); streak(X + W - 0.15, Y - 0.15, 0.25); };
    f(0, 2.93, 4, 0.07, '#dcd8cf'); // kat silmesi
    return { f, glass, frame, sill, px };
  };
  { const p = P(TILE.WINDOW); p.frame(1.15, 0.95, 1.7, 1.4, 2); p.sill(1.15, 0.95, 1.7); }
  { const p = P(TILE.BALCONY); p.frame(0.8, 0.08, 2.4, 2.3, 3); }
  { P(TILE.BLANK); }
  {
    const p = P(TILE.AC); p.frame(0.5, 0.95, 1.6, 1.4, 2); p.sill(0.5, 0.95, 1.6);
    p.f(2.72, 0.42, 0.86, 0.62, '#8b8b86'); p.f(2.7, 0.45, 0.86, 0.62, '#e3e2dc', 0.5);
    const [a, b] = p.px(2.7, 0.45, 0.86, 0.62);
    x.fillStyle = '#3c3f41'; x.beginPath(); x.arc(a + 0.33 * S, b + 0.31 * S, 0.24 * S, 0, 7); x.fill();
    x.strokeStyle = '#8d9092'; x.lineWidth = 1; for (let k = 1; k < 5; k++) { x.beginPath(); x.arc(a + 0.33 * S, b + 0.31 * S, k * 0.05 * S, 0, 7); x.stroke(); }
    p.f(3.3, 1.07, 0.03, 1.86, '#c9c7c0');
  }
  { const p = P(TILE.SMALL); p.f(1.58, 1.58, 0.84, 0.74, '#f7f7f5', 0.4); p.f(1.65, 1.65, 0.7, 0.6, '#aebcc2', 0.35, 0.3); p.sill(1.65, 1.65, 0.7); }
  {
    const p = P(TILE.SHOP);
    p.f(0, 0, 4, 3, '#33312f', 0.6);
    p.f(0, 0, 4, 0.28, '#4d4944', 0.35);
    for (let k = 0; k < 2; k++) {
      p.glass(0.1 + k * 1.95, 0.3, 1.85, 2.05, false);
      const [a, b, w, h] = p.px(0.1 + k * 1.95, 0.3, 1.85, 2.05);
      for (let q = 0; q < 9; q++) { // içerideki raf / ışık izleri
        x.fillStyle = `hsla(${20 + r() * 40},60%,${50 + r() * 30}%,${0.12 + r() * 0.16})`;
        x.fillRect(a + r() * w * 0.8, b + h * (0.25 + r() * 0.6), 20 + r() * 50, 8 + r() * 22);
      }
    }
    p.f(0, 2.38, 4, 0.62, '#2b2a29', 0.6);
  }
  {
    const p = P(TILE.DOOR);
    p.f(1.0, 2.45, 2.0, 0.14, '#b5b0a6'); // saçak
    p.f(1.12, 0, 1.76, 2.38, '#3b3d40', 0.35, 0.6);
    p.glass(1.22, 0.1, 0.72, 2.18, false); p.glass(2.06, 0.1, 0.72, 2.18, false);
    p.f(1.9, 1.0, 0.04, 0.35, '#c8c8c8', 0.25, 0.9); p.f(2.07, 1.0, 0.04, 0.35, '#c8c8c8', 0.25, 0.9);
    p.f(3.05, 1.25, 0.2, 0.34, '#a9aaab', 0.3, 0.8); // diyafon
    p.f(0.9, 0, 2.2, 0.06, '#8d887e', 0.5);
  }
  {
    const p = P(TILE.SHUTTER); p.f(1.08, 0.88, 1.84, 1.54, '#f7f7f5', 0.4); p.f(1.15, 0.95, 1.7, 1.4, '#e6e4dc', 0.6);
    const [a, b, w, h] = p.px(1.15, 0.95, 1.7, 1.4);
    x.fillStyle = 'rgba(60,60,55,0.28)'; for (let k = 0; k < h; k += 5) x.fillRect(a, b + k, w, 1.4);
    p.sill(1.15, 0.95, 1.7);
  }
  noise(x, AW, AH, 5, r);
  return { map: tex(c, { repeat: false }), orm: tex(co, { srgb: false, repeat: false }) };
}

// Uzak şehir için döşenebilir basit cephe
export function farFacade() {
  const r = rng(95), c = cv(128, 96), x = c.getContext('2d');
  x.fillStyle = '#eeebe4'; x.fillRect(0, 0, 128, 96);
  x.fillStyle = '#d8d4ca'; x.fillRect(0, 0, 128, 3);
  x.fillStyle = '#4f6274'; x.fillRect(36, 22, 56, 46);
  x.fillStyle = '#9fb6c8'; x.fillRect(36, 22, 56, 12);
  x.fillStyle = '#f5f5f2'; x.fillRect(62, 22, 3, 46);
  noise(x, 128, 96, 5, r);
  return tex(c);
}

// ---- Tabela atlası ----
export function signAtlas(entries) {
  const CW = 512, CH = 128, cols = 4, c = cv(2048, 2048), x = c.getContext('2d');
  x.fillStyle = '#222'; x.fillRect(0, 0, 2048, 2048);
  const rects = [];
  entries.forEach((e, i) => {
    const ox = (i % cols) * CW, oy = Math.floor(i / cols) * CH;
    x.save(); x.beginPath(); x.rect(ox, oy, CW, CH); x.clip();
    x.fillStyle = e.bg; x.fillRect(ox, oy, CW, CH);
    if (e.kind === 'street') {
      x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(ox + 8, oy + 8, CW - 16, CH - 16);
      x.fillStyle = '#c8102e'; x.fillRect(ox + 11, oy + 11, 70, CH - 22);
      x.fillStyle = '#fff'; x.font = 'bold 20px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.save(); x.translate(ox + 46, oy + CH / 2); x.rotate(-Math.PI / 2); x.fillText('MURATPAŞA', 0, 0); x.restore();
    } else {
      const g = x.createLinearGradient(0, oy, 0, oy + CH);
      g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
      x.fillStyle = g; x.fillRect(ox, oy, CW, CH);
    }
    const left = e.kind === 'street' ? 90 : 16, maxW = CW - left - 16;
    let fs = e.sub ? 58 : 74;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = e.fg;
    do { x.font = `900 ${fs}px "Arial Black", "DejaVu Sans", sans-serif`; fs -= 3; } while (x.measureText(e.text).width > maxW && fs > 16);
    x.fillText(e.text, ox + left + maxW / 2, oy + (e.sub ? CH * 0.4 : CH / 2 + 3));
    if (e.sub) { x.font = '600 24px "DejaVu Sans", sans-serif'; x.fillText(e.sub, ox + left + maxW / 2, oy + CH * 0.78); }
    x.restore();
    const ee = 2;
    rects.push([(ox + ee) / 2048, 1 - (oy + CH - ee) / 2048, (ox + CW - ee) / 2048, 1 - (oy + ee) / 2048]);
  });
  return { map: tex(c, { repeat: false }), rects };
}

export function beam() {
  const c = cv(4, 128), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0.95)');
  x.fillStyle = g; x.fillRect(0, 0, 4, 128);
  return tex(c, { repeat: false });
}

export function courierBox() {
  const c = cv(256, 256), x = c.getContext('2d');
  x.fillStyle = '#d5121e'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#fff'; x.font = '900 54px "Arial Black","DejaVu Sans",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('LARA', 128, 92); x.fillText('KURYE', 128, 150);
  x.font = '600 20px "DejaVu Sans",sans-serif'; x.fillText('ANTALYA • 07', 128, 204);
  x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(14, 14, 228, 228);
  return tex(c, { repeat: false });
}
