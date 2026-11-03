// ===== environment painters (tower, cliff, pines, ivy, pampas, mist) =====
const PAL_NIGHT = {
  stoneLit: '#7a74a6', stoneMid: '#56517f', stoneShade: '#2e2b52', mortar: '#211e3d',
  cuLit: '#8cc3ad', cu: '#4d847a', cuShade: '#21414b', cuStreak: '#3f7a72',
  winDark: '#121128', ivy: '#16232c', ivyLit: '#2a4248', ivyHi: '#4f7173',
  pineShade: '#141f2c', pine: '#22333f', pineLit: '#3f5d64', pineHi: '#6f9295', bark: '#262033', barkLit: '#4d4466',
  rockShade: '#242140', rock: '#3a365f', rockLit: '#5f5a8c', rockHi: '#8680b5', grass: '#2b3a46', grassLit: '#56707a',
  line: '#17132b', mist: '#a99fd4',
};
const PAL_GOLD = {
  stoneLit: '#f2c995', stoneMid: '#c08a74', stoneShade: '#6c4a62', mortar: '#4b3047',
  cuLit: '#c9d9a0', cu: '#6f9a80', cuShade: '#36505a', cuStreak: '#5f907c',
  winDark: '#2a1830', ivy: '#2f4a3a', ivyLit: '#7d9a52', ivyHi: '#d7d07a',
  pineShade: '#243039', pine: '#3a4c42', pineLit: '#7f8f55', pineHi: '#d9c47a', bark: '#4a3340', barkLit: '#a8705a',
  rockShade: '#5a3d5c', rock: '#8c5f6a', rockLit: '#e0a77f', rockHi: '#ffd8a0', grass: '#6f7448', grassLit: '#e8c878',
  line: '#3a1e2a', mist: '#ffd6b0',
};

function stoneWall(ctx, r, box, P, o = {}) {
  // individually painted stones in courses within box, lit by function lightAt(x,y)->0..1
  const [x0, y0, x1, y1] = box; const ch = o.ch || 8; const lightAt = o.lightAt || (() => 0.5);
  ctx.fillStyle = P.mortar; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let y = y0, row = 0; y < y1; y += ch, row++) {
    let x = x0 - r() * ch * 2;
    while (x < x1) {
      const sw = ch * (1.1 + r() * 1.6);
      const l = clamp(lightAt(x + sw / 2, y + ch / 2) + (r() - 0.5) * 0.18);
      const base = l > 0.5 ? mixc(C(P.stoneMid), C(P.stoneLit), (l - 0.5) * 2) : mixc(C(P.stoneShade), C(P.stoneMid), l * 2);
      const c = jc(base, r, 14);
      ctx.fillStyle = css(c);
      const g = 0.9; ctx.beginPath();
      ctx.moveTo(x + g + r(), y + g); ctx.lineTo(x + sw - g, y + g + r() * 0.6); ctx.lineTo(x + sw - g - r() * 0.6, y + ch - g); ctx.lineTo(x + g, y + ch - g - r() * 0.5); ctx.closePath(); ctx.fill();
      // lit upper edge / chip
      ctx.fillStyle = css(mixc(c, C(P.stoneLit), 0.35), 0.5); ctx.fillRect(x + 1.2, y + 1, sw - 2.4, 1.1);
      if (r() < 0.12) { ctx.fillStyle = css(C(P.stoneShade), 0.5); blob(ctx, x + r() * sw, y + r() * ch, 1.5 + r() * 2, 1 + r(), r() * 3, r); ctx.fill(); }
      x += sw;
    }
  }
}

// cylinder tower exterior, returns geometry info
function towerExt(ctx, r, P, g, t = 0) {
  const { cx, base, top, hw } = g; // half width
  const lightAt = (x) => { const u = (x - cx) / hw; return clamp(0.62 - 0.55 * u - 0.25 * u * u); };
  // body shape (slight taper + curved courses)
  const body = [[cx - hw * 0.93, top], [cx + hw * 0.93, top], [cx + hw, base], [cx - hw, base]];
  ctx.save(); pth(ctx, body); ctx.clip();
  // stones on cylinder: draw in flat "unrolled" columns then compress -> approximate with per-stone placement
  ctx.fillStyle = P.mortar; ctx.fillRect(cx - hw - 2, top, hw * 2 + 4, base - top);
  const ch = g.ch || 7;
  for (let y = top, row = 0; y < base + ch; y += ch, row++) {
    let th = -Math.PI / 2 - r() * 0.15;
    while (th < Math.PI / 2) {
      const dth = 0.11 + r() * 0.12;
      const th2 = Math.min(th + dth, Math.PI / 2);
      const hwy = lerp(hw * 0.93, hw, (y - top) / (base - top));
      const xa = cx + hwy * Math.sin(th), xb = cx + hwy * Math.sin(th2);
      const bow = -2.2 * Math.cos((th + th2) / 2);
      const l = clamp(lightAt((xa + xb) / 2) + (r() - 0.5) * 0.16);
      const bc = l > 0.5 ? mixc(C(P.stoneMid), C(P.stoneLit), (l - 0.5) * 2) : mixc(C(P.stoneShade), C(P.stoneMid), l * 2);
      const c = jc(bc, r, 12);
      ctx.fillStyle = css(c); ctx.beginPath();
      const gx = Math.min(0.7, (xb - xa) * 0.15);
      ctx.moveTo(xa + gx, y + bow + 0.7); ctx.lineTo(xb - gx, y + bow + 0.7); ctx.lineTo(xb - gx, y + bow + ch - 0.6); ctx.lineTo(xa + gx, y + bow + ch - 0.6); ctx.closePath(); ctx.fill();
      if (xb - xa > 2) { ctx.fillStyle = css(mixc(c, C(P.stoneLit), 0.3), 0.45); ctx.fillRect(xa + gx, y + bow + 0.7, xb - xa - 2 * gx, 1); }
      th = th2;
    }
  }
  // cylindrical tone pass (soft painted)
  for (let x = cx - hw; x < cx + hw; x += 2) {
    const u = (x - cx) / hw; const sh = clamp((u - 0.15) * 0.9);
    ctx.fillStyle = css(C(P.stoneShade), sh * 0.55); ctx.fillRect(x, top, 2, base - top);
  }
  // verdigris streaks under the dome
  for (let i = 0; i < 22; i++) {
    const x = cx + (r() - 0.5) * hw * 1.8, len = 20 + r() * (base - top) * 0.45;
    const gr = ctx.createLinearGradient(0, top, 0, top + len);
    gr.addColorStop(0, css(C(P.cuStreak), 0.55)); gr.addColorStop(1, css(C(P.cuStreak), 0));
    ctx.fillStyle = gr; ctx.fillRect(x, top, 1 + r() * 3, len);
  }
  // cornices
  for (const fy of g.cornices || []) {
    const y = lerp(top, base, fy);
    ctx.fillStyle = css(C(P.stoneShade), 0.85); ctx.fillRect(cx - hw - 4, y + 4, hw * 2 + 8, 5);
  }
  ctx.restore();
  for (const fy of g.cornices || []) {
    const y = lerp(top, base, fy); const hwy = lerp(hw * 0.93, hw, fy) + 3;
    const band = [[cx - hwy, y - 1], [cx, y - 3.5], [cx + hwy, y - 1], [cx + hwy, y + 4], [cx, y + 1.5], [cx - hwy, y + 4]];
    cel(ctx, spl(band.map((p, i) => i === 1 || i === 4 ? p : [...p, 1]), true, 4), { base: P.stoneMid, shade: P.stoneShade, lv: [-hwy * 0.7, 0], hi: P.stoneLit, hv: [hwy * 0.5, 2], line: false });
  }
  return { lightAt };
}

function archWindow(ctx, x, y, w, h, P, fore = 1, lit = null) {
  const ww = w * fore; const S = [];
  S.push([x - ww / 2, y + h, 1]); S.push([x - ww / 2, y + w * 0.5, 1]);
  for (let i = 1; i < 8; i++) { const a = Math.PI + (i / 8) * Math.PI; S.push([x + Math.cos(a) * ww / 2, y + w * 0.5 + Math.sin(a) * w * 0.55]); }
  S.push([x + ww / 2, y + w * 0.5, 1]); S.push([x + ww / 2, y + h, 1]);
  const SP = spl(S, true, 3);
  // stone frame
  const F = SP.map((p) => [x + (p[0] - x) * 1.35, y + h + (p[1] - y - h) * 1.12]);
  cel(ctx, F, { base: P.stoneMid, shade: P.stoneShade, lv: [-2, -1], line: false });
  cel(ctx, SP, { base: P.winDark, line: false, inner: lit });
  return SP;
}

function pine(ctx, r, x, y, s, P, o = {}) {
  // trunk
  const lean = o.lean || 0; const trunk = [[x, y]];
  let cx = x, cy = y; const n = 6;
  for (let i = 1; i <= n; i++) { cx += (lean + (r() - 0.5) * 0.8) * s * 0.18; cy -= s * 0.17; trunk.push([cx, cy]); }
  const T = spl(trunk, false, 5);
  ribbon(ctx, T, (t) => s * 0.05 * (1 - t * 0.7) + 0.6, P.bark);
  ribbon(ctx, T.map((p) => [p[0] - s * 0.012, p[1]]), (t) => s * 0.02 * (1 - t * 0.7), css(C(P.barkLit), 0.7));
  // branches + pads
  const pads = [];
  const nb = o.pads || 6;
  for (let i = 0; i < nb; i++) {
    const tt = 0.35 + (i / nb) * 0.7; const idx = Math.min(T.length - 1, Math.floor(tt * T.length));
    const bp = T[idx]; const dir = i % 2 ? 1 : -1; const len = s * (0.25 + r() * 0.3) * (1.1 - tt * 0.5);
    const ex = bp[0] + dir * len, ey = bp[1] - len * (0.15 + r() * 0.25);
    const B = spl([[bp[0], bp[1]], [lerp(bp[0], ex, 0.5), lerp(bp[1], ey, 0.5) + s * 0.03], [ex, ey]], false, 4);
    ribbon(ctx, B, (t) => s * 0.02 * (1 - t * 0.6) + 0.4, P.bark);
    pads.push([ex, ey, len * 0.7 + s * 0.08]);
  }
  pads.push([cx, cy - s * 0.02, s * 0.28]);
  for (const p of pads) pinePad(ctx, r, p[0], p[1], p[2], P, o.lv || [-0.6, -0.8]);
}
function pinePad(ctx, r, x, y, w, P, lv) { foliage(ctx, r, x, y, w, w * 0.34, P, lv, { n: 7 }); }
// jagged foliage mass: union-shift cel layers, no ink line (background art)
function foliage(ctx, r, x, y, w, h, P, lv, o = {}) {
  const bl = []; const n = o.n || 8;
  for (let i = 0; i < n; i++) { const a = r() * TAU, d = Math.sqrt(r()); bl.push([x + Math.cos(a) * w * d * 0.75, y + Math.sin(a) * h * d * 0.5, w * (0.25 + r() * 0.22), h * (0.5 + r() * 0.3), (r() * 1e6) | 0]); }
  const U = (dx, dy, k) => {
    ctx.beginPath();
    for (const b of bl) {
      const rr = RNG(b[4]); const m = 26;
      for (let i = 0; i <= m; i++) { const a = (i / m) * TAU; const j = i % 2 ? 0.78 + rr() * 0.1 : 1 + rr() * 0.12; const px = b[0] + dx * b[2] + Math.cos(a) * b[2] * k * j, py = b[1] + dy * b[3] + Math.sin(a) * b[3] * k * j * (Math.sin(a) > 0 ? 0.7 : 1); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.closePath();
    }
  };
  ctx.save(); U(0, 0, 1); ctx.fillStyle = css(C(P.pineShade)); ctx.fill(); ctx.clip();
  U(lv[0] * 0.25, lv[1] * 0.35, 0.92); ctx.fillStyle = css(C(P.pine)); ctx.fill();
  U(lv[0] * 0.45, lv[1] * 0.6, 0.72); ctx.fillStyle = css(C(P.pineLit)); ctx.fill();
  U(lv[0] * 0.62, lv[1] * 0.8, 0.45); ctx.fillStyle = css(C(P.pineHi), 0.8); ctx.fill();
  ctx.restore();
}
function ivy(ctx, r, x, y, len, P, o = {}) {
  // vine random walk upward with leaves
  let px = x, py = y, a = -Math.PI / 2 + (r() - 0.5) * 0.6;
  const vine = [[px, py]];
  for (let i = 0; i < len; i++) { a += (r() - 0.5) * 0.5; a = lerp(a, o.dir || -Math.PI / 2, 0.08); px += Math.cos(a) * 3; py += Math.sin(a) * 3; vine.push([px, py]); if (o.mask && !o.mask(px, py)) break; }
  ctx.strokeStyle = P.ivy; ctx.lineWidth = 0.6; pth(ctx, vine, false); ctx.stroke();
  const ls = o.size || 3.2;
  for (let i = 0; i < vine.length; i += 1) {
    if (r() < 0.25) continue;
    const p = vine[i]; const lx = p[0] + (r() - 0.5) * ls * 3, ly = p[1] + (r() - 0.5) * ls * 2;
    const s = ls * (0.6 + r() * 0.7);
    const lit = clamp((o.lightAt ? o.lightAt(lx, ly) : 0.5) + (r() - 0.5) * 0.5);
    const c = lit > 0.66 ? P.ivyHi : lit > 0.33 ? P.ivyLit : P.ivy;
    ctx.fillStyle = css(jc(C(c), r, 14));
    // heart-ish leaf
    const ang = r() * TAU; ctx.save(); ctx.translate(lx, ly); ctx.rotate(ang); ctx.beginPath();
    ctx.moveTo(0, s); ctx.quadraticCurveTo(-s * 1.3, 0, -s * 0.4, -s * 0.8); ctx.quadraticCurveTo(0, -s * 0.4, s * 0.4, -s * 0.8); ctx.quadraticCurveTo(s * 1.3, 0, 0, s); ctx.fill();
    ctx.restore();
  }
}

// pampas grass clump; t in seconds (already quantized for twos), wind strength w
function pampas(ctx, r0, seed, bx, by, n, P, t, o = {}) {
  const r = RNG(seed);
  const wind = o.wind || 1;
  // leaves first
  for (let i = 0; i < n * 3; i++) {
    const x = bx + (r() - 0.5) * (o.spread || 120), hgt = (o.h || 220) * (0.3 + r() * 0.45);
    const ph = r() * TAU; const sway = Math.sin(t * (1.4 + r() * 0.6) + ph) * 0.12 * wind + (o.lean || 0.25) * wind;
    const dir = (r() - 0.4) * 0.9 + sway;
    const pts = [[x, by + 10], [x + dir * hgt * 0.25, by - hgt * 0.45], [x + dir * hgt * 0.75, by - hgt * 0.8], [x + dir * hgt * 1.3, by - hgt * 0.75 + hgt * 0.2 * Math.abs(dir)]];
    const S = spl(pts, false, 6);
    ribbon(ctx, S, (u) => (1 - u) * 2.6 + 0.2, css(jc(C(P.grass), r, 10)));
    if (r() < 0.6) ribbon(ctx, S.map((p) => [p[0] - 0.8, p[1] - 0.5]), (u) => (1 - u) * 0.9, css(C(P.grassLit), 0.6));
  }
  for (let i = 0; i < n; i++) {
    const x = bx + (r() - 0.5) * (o.spread || 120) * 0.8, hgt = (o.h || 220) * (0.65 + r() * 0.45);
    const ph = r() * TAU, fr = 1.1 + r() * 0.5;
    const sw = (k) => (Math.sin((t - k) * fr + ph) * 0.07 + Math.sin((t - k) * fr * 2.3 + ph * 2) * 0.025) * wind + (o.lean || 0.12) * wind + (r0 ? 0 : 0);
    const a1 = sw(0), a2 = sw(0.25); // plume lags stem
    const stem = [[x, by + 10], [x + a1 * hgt * 0.3, by - hgt * 0.5], [x + a1 * hgt * 0.75, by - hgt * 0.85]];
    const tip = [x + (a1 * 0.75 + a2 * 0.5) * hgt, by - hgt * 0.9 - hgt * 0.12];
    stem.push(tip);
    const S = spl(stem, false, 6);
    ink(ctx, S, 1.3, { color: P.grass, seed: i + 5, v: 0.2 });
    // plume: feathery strokes along last part, drooping in wind direction
    const plen = hgt * (0.28 + r() * 0.12);
    const base = S[Math.floor(S.length * 0.72)];
    const dx = tip[0] - base[0], dy = tip[1] - base[1]; const dl = Math.hypot(dx, dy) || 1;
    const ux = dx / dl, uy = dy / dl;
    const pr = RNG(seed * 31 + i);
    for (let k = 0; k < 70; k++) {
      const u = pr();
      const px = base[0] + ux * plen * u * 1.25 + (a2 * 30) * u * u, py = base[1] + uy * plen * u * 1.25;
      const spread = Math.sin(Math.PI * clamp(u * 1.1)) * hgt * 0.05;
      const side = (pr() - 0.5) * 2;
      const ex = px + (-uy) * spread * side + (a2 + 0.25) * 9 * pr(), ey = py + ux * spread * side + 2 + pr() * 4;
      const lit = clamp(0.5 - side * 0.5 * (o.litSide || 1) + (pr() - 0.5) * 0.3);
      ctx.strokeStyle = css(lit > 0.6 ? C(o.plumeLit || P.pineHi) : lit > 0.3 ? C(o.plume || P.grassLit) : C(o.plumeShade || P.grass), 0.75);
      ctx.lineWidth = 0.6 + pr() * 0.9; ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo((px + ex) / 2 + 2, (py + ey) / 2 - 2, ex, ey); ctx.stroke();
    }
  }
}

function mistBand(ctx, r, y, h, col, a, drift = 0, blur = 18) {
  ctx.save(); ctx.filter = `blur(${blur}px)`;
  for (let i = 0; i < 14; i++) {
    const x = ((r() * (W + 600) + drift * (0.5 + r())) % (W + 600)) - 300;
    blob(ctx, x, y + (r() - 0.5) * h, 120 + r() * 220, h * (0.25 + r() * 0.3), (r() - 0.5) * 0.05, r, 12, 0.3);
    ctx.fillStyle = css(C(col), a * (0.4 + r() * 0.6)); ctx.fill();
  }
  ctx.restore();
}
