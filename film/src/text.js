// ===== brushed ink lettering (hand-defined strokes, no fonts) =====
// glyph coords: x right, y up; baseline 0, x-height 0.5, cap 1. [width, strokes]
const GLYPHS = {
  F: [0.62, [[[0.16, 1.0], [0.14, 0.5], [0.11, 0.0]], [[0.12, 0.99], [0.35, 1.01], [0.62, 1.04]], [[0.13, 0.53], [0.3, 0.55], [0.46, 0.57]]]],
  a: [0.6, [[[0.46, 0.42], [0.3, 0.5], [0.12, 0.38], [0.08, 0.14], [0.2, 0.0], [0.36, 0.08], [0.46, 0.4], [0.44, 0.1], [0.56, 0.0]]]],
  b: [0.54, [[[0.12, 1.02], [0.1, 0.5], [0.08, 0.0]], [[0.09, 0.28], [0.24, 0.47], [0.42, 0.42], [0.46, 0.2], [0.32, 0.01], [0.1, 0.04]]]],
  l: [0.34, [[[0.14, 1.02], [0.12, 0.5], [0.12, 0.12], [0.2, 0.0], [0.3, 0.05]]]],
  e: [0.52, [[[0.08, 0.25], [0.3, 0.28], [0.42, 0.33], [0.36, 0.47], [0.2, 0.5], [0.08, 0.36], [0.08, 0.12], [0.24, 0.0], [0.46, 0.08]]]],
  '5': [0.6, [[[0.52, 1.0], [0.34, 0.99], [0.16, 0.98]], [[0.16, 0.98], [0.13, 0.58], [0.3, 0.64], [0.48, 0.52], [0.52, 0.26], [0.38, 0.04], [0.18, 0.0], [0.05, 0.12]]]],
  '.': [0.26, [[[0.1, 0.06], [0.14, 0.02], [0.12, 0.0]]]],
  ' ': [0.32, []],
  H: [0.7, [[[0.12, 1.0], [0.11, 0.5], [0.09, 0.0]], [[0.58, 1.0], [0.57, 0.5], [0.55, 0.0]], [[0.1, 0.52], [0.34, 0.54], [0.57, 0.55]]]],
  r: [0.42, [[[0.11, 0.5], [0.1, 0.25], [0.08, 0.0]], [[0.09, 0.3], [0.2, 0.46], [0.38, 0.5]]]],
  h: [0.54, [[[0.11, 1.02], [0.1, 0.5], [0.08, 0.0]], [[0.09, 0.28], [0.24, 0.48], [0.4, 0.42], [0.42, 0.2], [0.43, 0.0]]]],
  i: [0.28, [[[0.13, 0.48], [0.12, 0.24], [0.11, 0.0]], [[0.13, 0.69], [0.15, 0.66]]]],
  k: [0.5, [[[0.11, 1.02], [0.1, 0.5], [0.08, 0.0]], [[0.42, 0.5], [0.24, 0.34], [0.1, 0.22], [0.26, 0.12], [0.44, 0.0]]]],
  y: [0.52, [[[0.08, 0.5], [0.12, 0.24], [0.2, 0.06], [0.34, 0.08], [0.46, 0.3]], [[0.46, 0.5], [0.44, 0.0], [0.4, -0.25], [0.24, -0.4], [0.08, -0.3]]]],
  o: [0.54, [[[0.3, 0.5], [0.12, 0.42], [0.07, 0.18], [0.24, 0.0], [0.42, 0.1], [0.46, 0.34], [0.32, 0.5], [0.22, 0.46]]]],
  s: [0.48, [[[0.42, 0.44], [0.26, 0.5], [0.1, 0.42], [0.14, 0.28], [0.36, 0.22], [0.42, 0.08], [0.25, 0.0], [0.06, 0.06]]]],
  f: [0.4, [[[0.42, 0.95], [0.32, 1.02], [0.2, 0.92], [0.17, 0.5], [0.15, 0.0]], [[0.04, 0.5], [0.2, 0.51], [0.38, 0.53]]]],
};
GLYPHS['â'] = [GLYPHS.a[0], GLYPHS.a[1].concat([[[0.16, 0.62], [0.28, 0.75], [0.4, 0.62]]])];
GLYPHS['ş'] = [GLYPHS.s[0], GLYPHS.s[1].concat([[[0.24, 0.0], [0.28, -0.1], [0.2, -0.18]]])];

// layout text -> list of strokes in screen coords
function layoutText(str, x, y, em, o = {}) {
  const slant = o.slant == null ? 0.14 : o.slant; const r = RNG(o.seed || 9); const strokes = [];
  let cx = x;
  for (const ch of str) {
    const g = GLYPHS[ch]; if (!g) { cx += em * 0.3; continue; }
    const jy = (r() - 0.5) * em * 0.03, js = 1 + (r() - 0.5) * 0.06, jr = (r() - 0.5) * 0.05;
    for (const s of g[1]) {
      const P = s.map((p) => { let gx = p[0] * em * js, gy = -p[1] * em * js; const q = rot([gx, gy], jr); return [cx + q[0] - q[1] * slant, y + jy + q[1]]; });
      strokes.push(spl(P, false, 8));
    }
    cx += g[0] * em * (o.track || 1);
  }
  return { strokes, width: cx - x };
}
// draw a single brush stroke with pressure, ink bleed and dry-brush bristles; upto 0..1
function brushStroke(ctx, P, w, upto, seed, col = [20, 12, 14]) {
  if (upto <= 0 || P.length < 2) return;
  const n = Math.max(2, Math.ceil(P.length * upto)); const S = P.slice(0, n);
  const r = RNG(seed);
  const prof = (t, i) => { const tt = (i / (P.length - 1)); const press = tt < 0.08 ? 0.75 + tt * 4 : 1 - Math.pow(Math.max(0, tt - 0.7) / 0.3, 1.6) * 0.75; return w * press * (0.85 + 0.25 * vnoise(i * 0.35, seed)); };
  ctx.save(); ctx.filter = 'blur(1.2px)'; ribbon(ctx, S, (t, i) => prof(t, i) * 1.12, css(col, 0.35)); ctx.restore();
  ribbon(ctx, S, (t, i) => prof(t, i) * (i / (P.length - 1) > 0.8 ? 0.7 : 1), css(col, 0.94));
  // bristle streaks toward the end (dry brush)
  for (let b = 0; b < 4; b++) {
    const off = (b - 1.5) / 1.5 * 0.55; const end = 0.86 + r() * 0.14;
    const Q = S.map((p, i) => { const a = P[Math.max(0, i - 1)], c = P[Math.min(P.length - 1, i + 1)]; let dx = c[0] - a[0], dy = c[1] - a[1]; const d = Math.hypot(dx, dy) || 1; const w2 = prof(0, i) * off; return [p[0] - dy / d * w2, p[1] + dx / d * w2]; }).filter((p, i) => i / (P.length - 1) <= end);
    if (Q.length > 1) ribbon(ctx, Q, (t, i) => w * 0.2 * (1 - Math.pow(i / Q.length, 3) * 0.6), css(col, 0.8));
  }
  // wet bead at the moving tip
  if (upto < 1) { const e = S[S.length - 1]; ctx.fillStyle = css(col, 0.9); ctx.beginPath(); ctx.arc(e[0], e[1], w * 0.9, 0, TAU); ctx.fill(); }
}
// write a laid-out text with progress p (0..1 across all strokes by length)
function writeText(ctx, L, w, p, seed = 1) {
  const lens = L.strokes.map(plen); const tot = lens.reduce((a, b) => a + b, 0); let acc = 0;
  L.strokes.forEach((S, i) => { const a = acc / tot, b = (acc + lens[i]) / tot; acc += lens[i]; const u = clamp((p - a) / (b - a)); if (u > 0) brushStroke(ctx, S, w, u, seed + i * 13); });
}
// red hanko seal reading 寓話 (carved strokes, stacked vertically)
function hanko(ctx, x, y, s, a = 1, seed = 5) {
  const r = RNG(seed);
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = a;
  const w = 1, h = 1.6;
  const rim = []; for (let i = 0; i < 40; i++) { const t = i / 40; let px, py; if (t < 0.25) { px = -w / 2 + t * 4 * w; py = -h / 2; } else if (t < 0.5) { px = w / 2; py = -h / 2 + (t - 0.25) * 4 * h; } else if (t < 0.75) { px = w / 2 - (t - 0.5) * 4 * w; py = h / 2; } else { px = -w / 2; py = h / 2 - (t - 0.75) * 4 * h; } rim.push([px + (r() - 0.5) * 0.025, py + (r() - 0.5) * 0.025]); }
  pth(ctx, rim); ctx.fillStyle = '#b4271f'; ctx.fill();
  // carved (paper-colored) strokes
  const L = (pts, wd = 0.075) => { ctx.strokeStyle = '#f2e3c4'; ctx.lineWidth = wd; ctx.lineCap = 'square'; ctx.lineJoin = 'miter'; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0] + (r() - 0.5) * 0.01, p[1] + (r() - 0.5) * 0.01) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); };
  // inner border
  ctx.strokeStyle = '#f2e3c4'; ctx.lineWidth = 0.05; ctx.strokeRect(-0.42, -0.72, 0.84, 1.44);
  // 寓 (top half): roof 宀 + 禺
  L([[0, -0.68], [0, -0.62]]); L([[-0.32, -0.5], [-0.32, -0.58], [0.32, -0.58], [0.32, -0.5]]);
  L([[-0.18, -0.5], [0.18, -0.5], [0.18, -0.3], [-0.18, -0.3], [-0.18, -0.5]]); L([[-0.18, -0.4], [0.18, -0.4]]); L([[0, -0.5], [0, -0.06]]);
  L([[-0.3, -0.06], [-0.3, -0.22], [0.3, -0.22], [0.3, -0.04]]); L([[-0.12, -0.08], [0, -0.17], [0.12, -0.08]]);
  // 話 (bottom half): 言 + 舌
  L([[-0.24, 0.04], [-0.24, 0.06]]); L([[-0.36, 0.11], [-0.08, 0.11]]); L([[-0.32, 0.19], [-0.12, 0.19]]); L([[-0.32, 0.27], [-0.12, 0.27]]);
  L([[-0.32, 0.36], [-0.32, 0.6], [-0.12, 0.6], [-0.12, 0.36], [-0.32, 0.36]]);
  L([[0.32, 0.04], [0.04, 0.1]]); L([[0.0, 0.2], [0.36, 0.2]]); L([[0.18, 0.07], [0.18, 0.36]]);
  L([[0.04, 0.36], [0.04, 0.6], [0.32, 0.6], [0.32, 0.36], [0.04, 0.36]]);
  // ink texture: speckles where the seal did not take
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.7})`; ctx.beginPath(); ctx.arc((r() - 0.5) * w, (r() - 0.5) * h, 0.004 + r() * 0.018, 0, TAU); ctx.fill(); }
  ctx.restore();
}
