// ===== paper: loose pages, paper birds, the great bird =====
const PAPERS = ['#f3e6c8', '#efe0bd', '#e8d6ae', '#f6ecd4', '#e2cfa4', '#ecdcc0', '#d9c39a', '#f1e4cc'];
function paperCol(r) { return jc(C(PAPERS[(r() * PAPERS.length) | 0]), r, 10); }
function tintc(c, t) { return t ? mulc(c, t) : c; }

// scribbled handwriting lines inside a quad (a,b,c,d), u along a->b
function scribble(ctx, q, r, n, col, lw) {
  ctx.strokeStyle = col; ctx.lineWidth = lw;
  for (let i = 0; i < n; i++) {
    const v = 0.15 + (i / n) * 0.72; const u0 = 0.12 + r() * 0.08, u1 = 0.62 + r() * 0.26;
    ctx.beginPath();
    for (let k = 0; k <= 10; k++) {
      const u = lerp(u0, u1, k / 10); const w = (r() - 0.5) * 0.02;
      const x = lerp(lerp(q[0][0], q[1][0], u), lerp(q[3][0], q[2][0], u), v + w), y = lerp(lerp(q[0][1], q[1][1], u), lerp(q[3][1], q[2][1], u), v + w);
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
}
// loose page: center, size, rotation, "flip" (0..1 foreshortening), curl
function page(ctx, x, y, w, h, ang, r, o = {}) {
  const fl = o.flip == null ? 1 : o.flip; const curl = o.curl || 0;
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2 + curl * w * 0.1, h / 2 - curl * h * 0.15], [-w / 2, h / 2]].map((p) => { const q = rot([p[0] * fl, p[1]], ang); return [x + q[0], y + q[1]]; });
  const col = tintc(o.col || paperCol(r), o.tint);
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.quadraticCurveTo(lerp(pts[1][0], pts[2][0], 0.5) + curl * 3, lerp(pts[1][1], pts[2][1], 0.5), pts[2][0], pts[2][1]); ctx.lineTo(pts[3][0], pts[3][1]); ctx.closePath();
  ctx.fillStyle = css(mixc(col, o.shade || [120, 90, 90], fl < 0 ? 0.35 : 0)); ctx.fill();
  if (w * Math.abs(fl) > 6 && o.text !== false) scribble(ctx, pts, r, Math.min(9, Math.floor(h / 3)), css(tintc([70, 50, 40], o.tint), 0.5), Math.max(0.4, h * 0.02));
  if (o.line !== false) { ctx.strokeStyle = css(tintc([90, 60, 45], o.tint), 0.75); ctx.lineWidth = o.lw || 0.6; ctx.stroke(); }
  if (curl > 0.2) { ctx.fillStyle = css(mixc(col, [255, 255, 255], 0.3)); ctx.beginPath(); ctx.moveTo(pts[2][0], pts[2][1]); ctx.lineTo(lerp(pts[2][0], pts[1][0], 0.2), lerp(pts[2][1], pts[1][1], 0.2)); ctx.lineTo(lerp(pts[2][0], pts[3][0], 0.2), lerp(pts[2][1], pts[3][1], 0.2)); ctx.fill(); }
}

// origami-like paper bird with handwriting, facing heading angle; flap -1 (down) .. 1 (up)
function paperBird(ctx, x, y, s, flap, heading, seed, o = {}) {
  const r = RNG(seed);
  const col = tintc(paperCol(r), o.tint); const sh = tintc(mixc(paperCol(r), [140, 110, 120], 0.45), o.tint);
  const lineC = css(tintc([70, 45, 35], o.tint), 0.85);
  const wl = 1 + r() * 0.5, tl = 0.6 + r() * 0.4, nk = 0.4 + r() * 0.3;
  ctx.save(); ctx.translate(x, y); ctx.rotate(heading); ctx.scale(s, s);
  const LW = (o.lw || 0.9) / s;
  // body (paper diamond)
  const body = [[1.1 * nk + 0.6, -0.05], [0.2, -0.22], [-0.9 * tl - 0.3, 0.02], [0.1, 0.18]];
  const tail = [[-0.4, 0], [-1.1 - tl * 0.6, -0.25], [-1.0 - tl * 0.5, 0.22]];
  const wingTip = (side) => { const up = flap * side; return [[-0.05, 0], [0.45, 0], [0.2 - 0.25 * wl, -up * (1.1 * wl)], [-0.5 - 0.3 * wl, -up * (0.9 * wl) + 0.1]]; };
  const fillPoly = (P, c) => { ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (const p of P) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fillStyle = css(c); ctx.fill(); ctx.strokeStyle = lineC; ctx.lineWidth = LW; ctx.lineJoin = 'round'; ctx.stroke(); };
  // far wing
  const far = wingTip(-0.75 * (o.farK || 1)); fillPoly(far, sh);
  fillPoly(tail, mixc(col, sh, 0.4));
  fillPoly(body, col);
  // crease along body
  ctx.strokeStyle = css(tintc([150, 120, 100], o.tint), 0.7); ctx.lineWidth = LW * 0.7; ctx.beginPath(); ctx.moveTo(body[0][0], body[0][1]); ctx.lineTo(body[2][0], body[2][1]); ctx.stroke();
  // near wing (lighter top when up, shaded when down)
  const near = wingTip(1); fillPoly(near, flap > 0 ? col : mixc(col, sh, 0.5));
  ctx.strokeStyle = css(tintc([150, 120, 100], o.tint), 0.6); ctx.beginPath(); ctx.moveTo(near[1][0], near[1][1]); ctx.lineTo(near[3][0], near[3][1]); ctx.stroke();
  if (s > 6) { scribble(ctx, [near[0], near[1], near[2], near[3]], r, 4, css(tintc([60, 40, 35], o.tint), 0.45), LW * 0.6); }
  // head point (beak)
  ctx.fillStyle = lineC; ctx.beginPath(); ctx.arc(1.1 * nk + 0.35, -0.06, 0.05, 0, TAU); ctx.fill();
  ctx.restore();
}
// half-folded page (transition from page to bird); k 0..1
function foldingPage(ctx, x, y, s, k, heading, seed, o = {}) {
  if (k >= 1) return paperBird(ctx, x, y, s, Math.sin(seed) > 0 ? 0.6 : -0.4, heading, seed, o);
  const r = RNG(seed);
  ctx.save(); ctx.translate(x, y); ctx.rotate(heading);
  const w = s * 1.6, h = s * 1.2 * (1 - k * 0.7);
  const col = tintc(paperCol(r), o.tint);
  ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(0, -h / 2 + h * k * 0.6); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(w / 2 * (1 - k * 0.4), h / 2); ctx.lineTo(-w / 2 * (1 - k * 0.4), h / 2); ctx.closePath();
  ctx.fillStyle = css(col); ctx.fill(); ctx.strokeStyle = css(tintc([80, 55, 40], o.tint), 0.8); ctx.lineWidth = o.lw || 0.8; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -h / 2 + h * k * 0.6); ctx.lineTo(0, h / 2); ctx.strokeStyle = css(tintc([150, 120, 100], o.tint), 0.7); ctx.stroke();
  ctx.restore();
}

// ---------- THE GREAT BIRD ----------
// feathers in bird space (units: wingspan ~ 2.2, body length ~ 1.2), facing +x
let _gb = null;
function greatBirdModel() {
  if (_gb) return _gb;
  const r = RNG(808); const F = [];
  // wing feathers: rows from leading edge to trailing, along span
  for (const side of [1, -1]) {
    for (let row = 0; row < 4; row++) {
      const n = 30 - row * 3;
      for (let i = 0; i < n; i++) {
        const u = (i + r() * 0.6) / n;
        const chord = 0.3 * Math.pow(1 - u, 0.7) + 0.07;
        const lead = 0.12 - 0.16 * u * u;
        const len = chord * (0.42 + row * 0.08) * (row === 3 && u > 0.6 ? 1.6 : 1);
        const x = lead - row * chord * 0.24 - len * 0.45;
        F.push({ wing: side, u, span: 0.1 + u * 1.0, x, len, wid: chord * 0.24, ang: Math.PI + side * Math.pow(u, 1.5) * (row === 3 ? 1.25 : 0.9) + (r() - 0.5) * 0.12, layer: row, seed: (r() * 1e6) | 0, col: paperCol(r) });
      }
    }
  }
  // body
  for (let i = 0; i < 90; i++) { const a = r() * TAU, d = Math.sqrt(r()); F.push({ body: 1, bx: Math.cos(a) * d * 0.42 + 0.05, by: Math.sin(a) * d * 0.11, len: 0.07 + r() * 0.05, wid: 0.04, ang: Math.PI + (r() - 0.5) * 0.5, seed: (r() * 1e6) | 0, col: paperCol(r), layer: 7 }); }
  // head + neck
  for (let i = 0; i < 26; i++) { const a = r() * TAU, d = Math.sqrt(r()); F.push({ body: 1, bx: 0.55 + Math.cos(a) * d * 0.1, by: -0.03 + Math.sin(a) * d * 0.07, len: 0.05, wid: 0.03, ang: Math.PI + (r() - 0.5) * 0.4, seed: (r() * 1e6) | 0, col: paperCol(r), layer: 8 }); }
  // tail fan
  for (let i = 0; i < 22; i++) { const a = (r() - 0.5) * 0.9; F.push({ body: 1, bx: -0.45 - Math.cos(a) * 0.2, by: Math.sin(a) * 0.2, len: 0.3 + r() * 0.12, wid: 0.06, ang: Math.PI + a * 1.4, seed: (r() * 1e6) | 0, col: paperCol(r), layer: 6 }); }
  F.sort((a, b) => a.layer - b.layer);
  _gb = F; return F;
}
// draw great bird. pose: wing (-1 down .. 1 up), form (0 scattered .. 1 formed), scatter positions given by fn
function greatBird(ctx, x, y, s, rotA, wing, form, t, o = {}) {
  const F = greatBirdModel();
  const tint = o.tint; const back = o.back || [255, 220, 160];
  const cr = Math.cos(rotA), sr = Math.sin(rotA);
  const W2 = (bx, by) => [x + (bx * cr - by * sr) * s, y + (bx * sr + by * cr) * s];
  // wing fold: wing points are on y axis (span), lifted by wing angle with perspective (top view-ish from below)
  const pos = (f) => {
    if (f.body) return [f.bx, f.by, f.ang];
    const sp = f.span * (1 - Math.abs(wing) * 0.32);
    return [f.x + wing * 0.32 * f.span * f.span, -f.wing * sp, f.ang + f.wing * wing * 0.35 * f.u];
  };
  const sm = o.smear || 0;
  for (let pass = sm > 0 ? 0 : 1; pass < 2; pass++) {
    for (let i = 0; i < F.length; i++) {
      const f = F[i]; const r = RNG(f.seed);
      const p = pos(f);
      const delay = (f.seed % 1000) / 1000 * 0.5;
      const k = sstep((form - delay) / 0.5);
      let [px, py] = W2(p[0], p[1]);
      let pa = p[2] + rotA;
      if (k < 1) { const sc = o.scatter(f, i); px = lerp(sc[0], px, k); py = lerp(sc[1], py, k); pa = lerp(sc[2], pa, k); }
      const ln = f.len * s * lerp(0.4, 1, k), wd = f.wid * s * lerp(0.6, 1, k) * 1.4;
      const shade = f.body ? 0.1 : clamp(0.05 + f.layer * 0.06 + (wing < 0 ? 0.15 : 0));
      const colr = mixc(tintc(f.col, tint), o.shadeC || [150, 90, 110], shade);
      if (pass === 0) { // smear: streaked ghost along motion
        ctx.globalAlpha = 0.25; page(ctx, px, py + sm * s * 0.1 * (f.wing ? f.span : 0.2), ln, wd * 2.5, pa, r, { col: colr, line: false, text: false }); ctx.globalAlpha = 1; continue;
      }
      page(ctx, px, py, ln, wd, pa, r, { col: colr, tint: null, lw: Math.max(0.4, s * 0.0016), curl: r() < 0.3 ? 0.4 : 0, text: ln > 14 });
      // gold rim light on upper edges
      if (o.rim && r() < 0.5) { ctx.strokeStyle = css(back, 0.55); ctx.lineWidth = Math.max(0.6, s * 0.002); ctx.beginPath(); const q = rot([ln / 2, -wd / 2], pa); ctx.moveTo(px - q[0], py - q[1]); ctx.lineTo(px + q[0], py + q[1]); ctx.stroke(); }
    }
  }
  // eye: a single ink circle drawn on the head page
  if (form > 0.95) { const e = W2(0.6, -0.04); ctx.fillStyle = 'rgba(40,20,20,0.9)'; ctx.beginPath(); ctx.arc(e[0], e[1], Math.max(1.5, s * 0.009), 0, TAU); ctx.fill(); }
}
