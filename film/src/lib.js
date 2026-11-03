// ===== core drawing library: noise, color, splines, ink, cel, gouache =====
const W = 1280, H = 544, FPS = 24;
const TAU = Math.PI * 2;

function RNG(seed) {
  let a = (seed * 2654435761) >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s = 0, o = 4) {
  let f = 0, a = 0.5, t = 0;
  for (let i = 0; i < o; i++) { f += a * vnoise(x, y, s + i * 17); t += a; x *= 2.03; y *= 2.03; a *= 0.5; }
  return f / t;
}
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeIn = (t) => Math.pow(clamp(t), 3);
const easeIO = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
// anime timing: hold drawings for n frames
const on = (f, n = 2) => Math.floor(f / n) * n;
// snap a 0..1 progress to a small number of drawn keys (with eased spacing)
function keys(t, n) { return Math.round(clamp(t) * n) / n; }

// ---- color ----
function hx(s) { s = s.replace('#', ''); return [parseInt(s.substr(0, 2), 16), parseInt(s.substr(2, 2), 16), parseInt(s.substr(4, 2), 16)]; }
function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function css(c, a = 1) { return `rgba(${Math.round(clamp(c[0], 0, 255))},${Math.round(clamp(c[1], 0, 255))},${Math.round(clamp(c[2], 0, 255))},${a})`; }
function jc(c, r, amt) { const k = (r() - 0.5) * amt; return [c[0] + k + (r() - 0.5) * amt * 0.6, c[1] + k + (r() - 0.5) * amt * 0.6, c[2] + k + (r() - 0.5) * amt * 0.6]; }
function mulc(a, b) { return [a[0] * b[0] / 255, a[1] * b[1] / 255, a[2] * b[2] / 255]; }
function C(s) { return typeof s === 'string' ? hx(s) : s; }

function mk(w = W, h = H) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---- splines ----
function crOpen(P, res, out) {
  const n = P.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = P[Math.max(i - 1, 0)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(i + 2, n - 1)];
    for (let k = 0; k < res; k++) {
      const t = k / res, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
}
// points [x,y] or [x,y,1] (1 = sharp corner)
function spl(P, closed = true, res = 6) {
  const out = [];
  if (!closed) { crOpen(P, res, out); const l = P[P.length - 1]; out.push([l[0], l[1]]); return out; }
  const n = P.length, ci = [];
  for (let i = 0; i < n; i++) if (P[i][2]) ci.push(i);
  if (ci.length === 0) {
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      for (let k = 0; k < res; k++) {
        const t = k / res, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    return out;
  }
  for (let j = 0; j < ci.length; j++) {
    const a = ci[j], b = ci[(j + 1) % ci.length];
    const S = []; let i = a;
    for (;;) { S.push(P[i]); if (i === b && S.length > 1) break; i = (i + 1) % n; if (S.length > n + 1) break; }
    crOpen(S, res, out);
  }
  return out;
}
function xf(P, tx, ty, s = 1, rot = 0, sx = 1, sy = 1) {
  const c = Math.cos(rot), si = Math.sin(rot);
  return P.map((p) => { const x = p[0] * s * sx, y = p[1] * s * sy; const o = [tx + x * c - y * si, ty + x * si + y * c]; if (p[2]) o.push(p[2]); return o; });
}
function lerpPts(A, B, t) { return A.map((a, i) => { const o = [lerp(a[0], B[i][0], t), lerp(a[1], B[i][1], t)]; if (a[2]) o.push(1); return o; }); }
function pth(ctx, P, close = true) {
  ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
  if (close) ctx.closePath();
}
function addPth(ctx, P) { ctx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.closePath(); }
function plen(P) { let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return L; }
// resample polyline to fixed spacing
function resample(P, step) {
  const out = [P[0]]; let acc = 0;
  for (let i = 1; i < P.length; i++) {
    let a = P[i - 1], b = P[i]; let d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (acc + d >= step) { const t = (step - acc) / d; const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; out.push(p); a = p; d = Math.hypot(b[0] - a[0], b[1] - a[1]); acc = 0; }
    acc += d;
  }
  out.push(P[P.length - 1]);
  return out;
}

// ---- ink line: hand-inked variable pressure ----
let LINE = '#3b2219';
function ink(ctx, P, w, o = {}) {
  const closed = !!o.closed, color = o.color || LINE, seed = o.seed || 1, v = o.v == null ? 0.42 : o.v, fr = o.freq || 0.045;
  const taper = o.taper == null ? !closed : o.taper; const upto = o.upto == null ? 1 : o.upto;
  const n = closed ? P.length : P.length - 1; if (n < 1) return;
  const L = [0];
  for (let i = 1; i <= n; i++) { const a = P[i - 1], b = P[i % P.length]; L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const tot = L[n] || 1;
  ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const tp = o.tp || 0.5;
  for (let i = 0; i < n; i++) {
    const t = L[i] / tot; if (t > upto) break;
    const a = P[i], b = P[(i + 1) % P.length];
    let k = 1 - v + 2 * v * vnoise(L[i] * fr, seed * 7.13, seed);
    if (taper) k *= Math.pow(Math.sin(Math.PI * clamp(t * 0.96 + 0.02)), tp);
    if (o.wfn) k *= o.wfn(t, a);
    ctx.lineWidth = Math.max(0.25, w * k);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
}
// brush ribbon (filled), for brush lettering, grass blades etc. wfn(t)->half width
function ribbon(ctx, P, wfn, color) {
  if (P.length < 2) return;
  const Lft = [], Rgt = [];
  const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const tot = L[L.length - 1] || 1;
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const w = wfn(L[i] / tot, i);
    Lft.push([P[i][0] - dy * w, P[i][1] + dx * w]); Rgt.push([P[i][0] + dy * w, P[i][1] - dx * w]);
  }
  ctx.beginPath(); ctx.moveTo(Lft[0][0], Lft[0][1]);
  for (const p of Lft) ctx.lineTo(p[0], p[1]);
  for (let i = Rgt.length - 1; i >= 0; i--) ctx.lineTo(Rgt[i][0], Rgt[i][1]);
  ctx.closePath(); if (color) { ctx.fillStyle = color; ctx.fill(); }
}

// ---- cel-shaded shape ----
// o: base, shade, lv (shift toward light => shade appears opposite), hi + hv (rim light), lw, lc, line
function cel(ctx, P, o) {
  ctx.save(); pth(ctx, P); ctx.clip();
  ctx.fillStyle = o.base; ctx.fill();
  if (o.shade && o.lv) {
    ctx.beginPath(); ctx.rect(-5000, -5000, 10000, 10000);
    addPth(ctx, P.map((p) => [p[0] + o.lv[0], p[1] + o.lv[1]]));
    ctx.fillStyle = o.shade; ctx.fill('evenodd');
  }
  if (o.hi && o.hv) {
    ctx.beginPath(); ctx.rect(-5000, -5000, 10000, 10000);
    addPth(ctx, P.map((p) => [p[0] + o.hv[0], p[1] + o.hv[1]]));
    ctx.fillStyle = o.hi; ctx.fill('evenodd');
  }
  if (o.inner) o.inner(ctx);
  ctx.restore();
  if (o.line !== false) ink(ctx, P, o.lw || 1.5, { closed: true, color: o.lc || LINE, seed: o.seed || 3, v: o.v });
}
// flat fill inside clip of shape S (for color-boundary areas, no line)
function inside(ctx, S, fn) { ctx.save(); pth(ctx, S); ctx.clip(); fn(ctx); ctx.restore(); }

// ---- gouache ----
function blob(ctx, x, y, rx, ry, ang, r, n = 9, jag = 0.5) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const k = 1 - jag / 2 + jag * r(); pts.push([Math.cos(a) * rx * k, Math.sin(a) * ry * k]); }
  const c = Math.cos(ang), s = Math.sin(ang);
  const P = pts.map((p) => [x + p[0] * c - p[1] * s, y + p[0] * s + p[1] * c]);
  ctx.beginPath();
  const m0 = [(P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2]; ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
  ctx.closePath();
}
// scatter brush dabs: colFn(x,y)->[r,g,b], within box, optional mask fn
function dabs(ctx, r, n, box, colFn, o = {}) {
  const [x0, y0, x1, y1] = box; const smin = o.smin || 3, smax = o.smax || 10; const al = o.alpha || 0.35;
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0);
    if (o.mask && !o.mask(x, y)) continue;
    const s = smin + (smax - smin) * r() * r();
    const asp = o.asp || 0.5;
    blob(ctx, x, y, s, s * (asp + r() * (1 - asp) * 0.6), o.ang != null ? o.ang + (r() - 0.5) * 0.4 : r() * TAU, r);
    ctx.fillStyle = css(colFn(x, y, r), al * (0.5 + 0.5 * r())); ctx.fill();
  }
}
// painted vertical gradient with brush texture (not a flat digital gradient)
function paintGrad(ctx, stops, box, r, o = {}) {
  const [x0, y0, x1, y1] = box;
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const s of stops) g.addColorStop(s[0], css(C(s[1])));
  ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  const colAt = (y) => {
    const t = clamp((y - y0) / (y1 - y0));
    for (let i = 0; i < stops.length - 1; i++) if (t <= stops[i + 1][0]) { const u = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0] || 1); return mixc(C(stops[i][1]), C(stops[i + 1][1]), u); }
    return C(stops[stops.length - 1][1]);
  };
  const n = o.n || 1400;
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0);
    const s = (o.smin || 20) + r() * (o.smax || 70);
    blob(ctx, x, y, s, s * (0.12 + r() * 0.18), (r() - 0.5) * 0.12 + (o.ang || 0), r, 10, 0.35);
    const c = jc(colAt(y + (r() - 0.5) * 30), r, o.jit || 10);
    ctx.fillStyle = css(c, (o.alpha || 0.22) * (0.4 + 0.6 * r())); ctx.fill();
  }
  return colAt;
}
let _grain = null;
function grain() {
  if (_grain) return _grain;
  const c = mk(); const x = c.getContext('2d'); const id = x.createImageData(W, H); const d = id.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const v = 0.45 * fbm(i * 0.15, j * 0.15, 5, 2) + 0.4 * hash2(i, j, 9) + 0.15 * fbm(i * 0.02, j * 0.03, 11, 3);
    const g = 128 + (v - 0.5) * 120; const k = (j * W + i) * 4; d[k] = d[k + 1] = d[k + 2] = g; d[k + 3] = 255;
  }
  x.putImageData(id, 0, 0); _grain = c; return c;
}
function paperize(ctx, a = 0.1) { ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = a; ctx.drawImage(grain(), 0, 0); ctx.restore(); }

function glow(ctx, x, y, r, col, a = 1, op = 'lighter') {
  ctx.save(); ctx.globalCompositeOperation = op;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, css(C(col), a)); g.addColorStop(0.35, css(C(col), a * 0.45)); g.addColorStop(1, css(C(col), 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}
function vignette(ctx, a = 0.45, col = [10, 6, 20]) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
  g.addColorStop(0, css(col, 0)); g.addColorStop(1, css(col, a)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
// soft bloom of bright areas
function bloom(ctx, canvas, a = 0.35, blur = 14) {
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = a; ctx.filter = `blur(${blur}px) brightness(0.9) contrast(1.6)`;
  ctx.drawImage(canvas, 0, 0); ctx.restore();
}

// ---- clouds: scalloped billow rows with lit edges (union-shift shading) ----
function scallop(r, x0, x1, y, size, flat = 0.75) {
  const bumps = []; let x = x0 - size;
  while (x < x1 + size) {
    const rad = size * (0.5 + r() * 0.9); const cy = y + (r() - 0.3) * size * 0.35;
    bumps.push([x, cy, rad, rad * flat * (0.75 + r() * 0.4)]);
    const k = (r() * 4) | 0;
    for (let i = 0; i < k; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 2.2; const rr = rad * (0.25 + r() * 0.3); bumps.push([x + Math.cos(a) * rad * 0.7, cy + Math.sin(a) * rad * flat * 0.7, rr, rr * flat * (0.8 + r() * 0.4)]); }
    x += rad * (0.7 + r() * 0.8);
  }
  const P = [];
  for (let xx = x0 - 4; xx <= x1 + 4; xx += 2) {
    let yy = y + size;
    for (const b of bumps) { const u = (xx - b[0]) / b[2]; if (u > -1 && u < 1) yy = Math.min(yy, b[1] - b[3] * Math.sqrt(1 - u * u)); }
    P.push([xx, yy]);
  }
  return P;
}
function cloudBank(ctx, r, o) {
  const { x0, x1, y, size, bottom } = o; const lv = o.lv || [-0.55, -0.83];
  const tc = mk(W + 400, H + 300);
  const c = tc.getContext('2d'); c.setTransform(1, 0, 0, 1, 200, 150);
  const dx = -lv[0], dy = -lv[1];
  const layers = o.sub == null ? 3 : o.sub;
  for (let k = 0; k < layers; k++) {
    const yy = y + k * size * 0.55; const sz = size * (1 - k * 0.18);
    const top = scallop(r, x0, x1, yy, sz, o.flat || 0.7);
    const shape = top.concat([[x1 + 4, bottom], [x0 - 4, bottom]]);
    const dim = k / Math.max(1, layers);
    c.save(); pth(c, shape); c.clip();
    if (o.rim && k === 0) { c.fillStyle = css(C(o.rim)); c.fill(); }
    else { c.fillStyle = css(mixc(C(o.lit), C(o.mid), dim * 0.6)); c.fill(); }
    const sh = (a, b, col) => { c.beginPath(); addPth(c, shape.map((p) => [p[0] + dx * sz * a, p[1] + dy * sz * b])); c.fillStyle = css(col); c.fill(); };
    if (o.rim && k === 0) sh(0.03, 0.05, mixc(C(o.lit), C(o.mid), dim * 0.6));
    sh(0.14, 0.2, mixc(C(o.mid), C(o.shade), dim * 0.4));
    sh(0.28, 0.42, C(o.shade));
    c.restore();
  }
  // subtle painted texture + base haze
  c.save(); c.beginPath(); addPth(c, scallop(RNG(1), x0, x1, y - size * 0.6, size * 1.6).concat([[x1 + 4, bottom], [x0 - 4, bottom]])); c.globalCompositeOperation = 'source-atop';
  dabs(c, r, o.dabs || 160, [x0, y - size * 1.5, x1, bottom], (xx, yy, rr) => jc(C(rr() < 0.5 ? o.mid : o.lit), rr, 8), { smin: size * 0.1, smax: size * 0.45, alpha: 0.08, ang: 0, asp: 0.2 });
  if (o.haze) { const g = c.createLinearGradient(0, y + size * 0.2, 0, bottom); g.addColorStop(0, css(C(o.haze), 0)); g.addColorStop(1, css(C(o.haze), o.hazeA || 0.85)); c.fillStyle = g; c.fillRect(x0 - 10, y - size, x1 - x0 + 20, bottom - y + size * 2); }
  c.restore();
  ctx.save(); ctx.filter = `blur(${o.soft || 0.6}px)`; ctx.drawImage(tc, -200, -150); ctx.restore();
}
// sea of clouds in perspective rows: from horizon (t=0) to foreground (t=1)
function cloudSea(ctx, r, o) {
  const rows = o.rows || 9;
  for (let i = o.from || 0; i < (o.to == null ? rows : o.to); i++) {
    const t = (i + 0.5) / rows; const tt = Math.pow(t, o.pow || 1.7);
    const y = lerp(o.y0, o.y1, tt); const size = lerp(o.s0, o.s1, Math.pow(t, 1.4));
    const k = Math.pow(t, 0.8);
    const col = (a, b) => mixc(C(a), C(b), k);
    cloudBank(ctx, r, { x0: o.x0 || 0, x1: o.x1 || W, y, size, bottom: y + size * 2.6 + 40, sub: t < 0.3 ? 1 : t < 0.6 ? 2 : 3, shade: col(o.farShade, o.shade), mid: col(o.farMid, o.mid), lit: col(o.farLit, o.lit), rim: o.rim ? col(o.farLit, o.rim) : null, haze: col(o.farShade, o.valley), hazeA: 0.9, lv: o.lv, dabs: 60 + i * 30, soft: lerp(1.2, 0.5, t) });
  }
}
