// ===== THE FOX: side-view rig + front face, hand-inked cel style =====
const FOXPAL = {
  base: { fur: '#e0682c', furSh: '#a8432a', furHi: '#f8a25c', cream: '#f6ead6', creamSh: '#c9b0a2', dark: '#3c2522', darkSh: '#251515', earIn: '#f4dccb', nose: '#221414', iris: '#eaa63e', irisSh: '#9a531c', line: '#3b1f17', far: 0.72 },
  moon: { fur: '#c8653a', furSh: '#6e3a56', furHi: '#e9a07a', cream: '#dcd7e6', creamSh: '#8c84aa', dark: '#2c2030', darkSh: '#1a1220', earIn: '#d9c6d0', nose: '#1a1018', iris: '#e2a64a', irisSh: '#8a4a28', line: '#2a1520', far: 0.7 },
  lantern: { fur: '#ee7432', furSh: '#8e3a3c', furHi: '#ffb468', cream: '#fbe7c8', creamSh: '#c08e86', dark: '#3a2220', darkSh: '#22121a', earIn: '#ffdcc0', nose: '#221212', iris: '#f4b04a', irisSh: '#a2501e', line: '#3a1a14', far: 0.68 },
  gold: { fur: '#f5813a', furSh: '#a34a4e', furHi: '#ffc070', cream: '#fff0d6', creamSh: '#d29a8e', dark: '#43262a', darkSh: '#2a1520', earIn: '#ffe2c4', nose: '#2a1416', iris: '#f6b84c', irisSh: '#a65a22', line: '#3e1c18', far: 0.72, rim: '#fff0b8' },
};
function darker(c, k) { return css(mulc(C(c), [255 * k, 255 * k, 255 * k + 10])); }

// tube outline from centerline pts with widths (half widths) per control point
function tube(ctrl, wids, res = 5, capEnd = true) {
  const S = spl(ctrl, false, res);
  const n = S.length; const L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]));
  const tot = L[n - 1] || 1;
  const wAt = (t) => { const f = t * (wids.length - 1); const i = Math.min(wids.length - 2, Math.floor(f)); const u = f - i; return lerp(wids[i], wids[i + 1], sstep(u)); };
  const A = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const w = wAt(L[i] / tot);
    A.push([S[i][0] - dy * w, S[i][1] + dx * w]); B.push([S[i][0] + dy * w, S[i][1] - dx * w]);
  }
  const out = A.slice();
  if (capEnd) { const e = S[n - 1], w = wAt(1); const a0 = Math.atan2(A[n - 1][1] - e[1], A[n - 1][0] - e[0]); for (let k = 1; k < 6; k++) { const a = a0 - (k / 6) * Math.PI; out.push([e[0] + Math.cos(a) * w, e[1] + Math.sin(a) * w]); } }
  for (let i = n - 1; i >= 0; i--) out.push(B[i]);
  { const e = S[0], w = wAt(0); const a0 = Math.atan2(B[0][1] - e[1], B[0][0] - e[0]); for (let k = 1; k < 6; k++) { const a = a0 - (k / 6) * Math.PI; out.push([e[0] + Math.cos(a) * w, e[1] + Math.sin(a) * w]); } }
  return { out, S, wAt, A, B };
}
function ik(T, E, l1, l2, bend) {
  let dx = E[0] - T[0], dy = E[1] - T[1]; let d = Math.hypot(dx, dy); d = Math.min(d, l1 + l2 - 0.01); d = Math.max(d, Math.abs(l1 - l2) + 0.01);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)); const base = Math.atan2(dy, dx);
  return [T[0] + l1 * Math.cos(base + bend * a), T[1] + l1 * Math.sin(base + bend * a)];
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const rot = (p, a, c = [0, 0]) => { const s = Math.sin(a), co = Math.cos(a); const x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * co - y * s, c[1] + x * s + y * co]; };

// ---------- SIDE RIG ----------
const FOX_HEAD = [[-11, -4], [-6, -10], [2, -11], [8, -8.5], [13, -4.5], [19, -1.8], [24, -0.2], [25.6, 1.9, 1], [23.4, 4.3], [17, 5.6], [10, 7.6], [4, 10], [-1, 13.5, 1], [-3, 9.5, 1], [-7.5, 12.5, 1], [-9, 7.5, 1], [-12.5, 2.5]];
const FOX_HEAD_CREAM = [[9, 2.5], [17, 2.4], [23, 3.6], [24, 4.5], [17, 5.6], [10, 7.6], [4, 10], [-1, 13.5], [-3, 9.5], [-7.5, 12.5], [-7, 6], [-2, 5.5], [4, 4.2]];
const FOX_EAR = [[-9, -8, 1], [-10.5, -17], [-8, -28.5, 1], [-3, -19], [0.5, -10, 1]];
const FOX_EAR_IN = [[-7.6, -10], [-8.4, -18], [-7.6, -25], [-4.4, -17.5], [-2, -10.5]];

function foxSide(ctx, p, o) {
  // o: x,y,s, pal, lv (unit light dir), flip, lw
  const P = typeof o.pal === 'string' ? FOXPAL[o.pal] : o.pal;
  const s = o.s; const lw = o.lw || (0.8 + s * 0.38);
  const lv = o.lv || [-0.5, -0.8]; const L = (k) => [lv[0] * k * s, lv[1] * k * s];
  const rimv = o.rimv ? [o.rimv[0] * s, o.rimv[1] * s] : null;
  ctx.save(); ctx.translate(o.x, o.y); ctx.scale(o.flip ? -s : s, s);
  // we work in fox units; line widths divided by s
  const LW = lw / s;
  const lvU = [lv[0] * 3.2 * (o.flip ? -1 : 1), lv[1] * 3.2];
  const rimU = rimv ? [rimv[0] / s * (o.flip ? -1 : 1), rimv[1] / s] : null;
  const opt = (base, shade, extra = {}) => ({ base, shade, lv: lvU, lw: LW, lc: P.line, hi: rimU ? (P.rim || P.furHi) : null, hv: rimU, ...extra });
  const hip = p.hip, sho = p.sho;
  const bang = Math.atan2(sho[1] - hip[1], sho[0] - hip[0]); const bl = Math.hypot(sho[0] - hip[0], sho[1] - hip[1]) / 40;
  const B = (x, y) => add(hip, rot([x * bl, y], bang));
  // legs
  const legs = {};
  const mkLeg = (kind, T, toe, far, ov) => {
    let pts, w;
    if (ov) return { pts: ov, w: kind === 'f' ? [5.6, 3.3, 2.5, 2.7] : [12.5, 7.5, 3, 2.7], far };
    if (kind === 'f') {
      const wrist = add(toe, p.frontWrist || [-1.5, -6.5]);
      const el = ik(T, wrist, 15, 14, 1);
      pts = [T, el, wrist, toe]; w = [5.6, 3.3, 2.5, 2.7];
    } else {
      const hock = add(toe, p.hock || [-5, -11]);
      const kn = ik(T, hock, 16, 13, -1);
      pts = [T, kn, hock, toe]; w = [10, 5.4, 2.6, 2.7];
    }
    return { pts, w, far };
  };
  const shoT = add(sho, [1, 5]), hipT = add(hip, [1, 4]);
  legs.ff = mkLeg('f', add(shoT, [-3, 0]), p.ff, true, p.ffPts); legs.hf = mkLeg('h', add(hipT, [-3, 0]), p.hf, true, p.hfPts);
  legs.fn = mkLeg('f', shoT, p.fn, false, p.fnPts); legs.hn = mkLeg('h', hipT, p.hn, false, p.hnPts);
  const drawLeg = (lg) => {
    const T = tube(lg.pts, lg.w, 5, false);
    const fur = lg.far ? darker(P.fur, P.far) : P.fur, sh = lg.far ? darker(P.furSh, P.far) : P.furSh;
    const dk = lg.far ? darker(P.dark, 0.8) : P.dark;
    cel(ctx, T.out, opt(fur, sh, { line: false, inner: (c) => {
      // sock: lower 45% dark
      const sub = tube(lg.pts.slice(1), lg.w.slice(1), 5, false);
      const n = sub.A.length; const k0 = Math.floor(n * 0.35);
      const poly = sub.A.slice(k0).concat(sub.B.slice(k0).reverse());
      pth(c, poly); c.fillStyle = dk; c.fill();
      c.fillRect(lg.pts[3][0] - 8, lg.pts[3][1] - 3, 16, 8);
    } }));
    // paw
    const toe = lg.pts[3];
    const paw = [[toe[0] - 3.5, toe[1] - 2.5], [toe[0] + 1, toe[1] - 3.6], [toe[0] + 4.6, toe[1] - 1.4], [toe[0] + 4.2, toe[1] + 0.2, 1], [toe[0] - 3.6, toe[1] + 0.2, 1]];
    const PP = spl(paw, true, 4);
    cel(ctx, PP, { base: dk, line: false });
    ink(ctx, T.A, LW, { color: P.line, seed: 21 }); ink(ctx, T.B, LW, { color: P.line, seed: 22 });
    ink(ctx, PP.slice(0, Math.floor(PP.length * 0.75)), LW * 0.9, { color: P.line, seed: 23 });
  };
  // tail
  const tb = B(-9, -3);
  const tailPts = [tb].concat(p.tail);
  const drawTail = () => {
    const T = tube(tailPts, [3.2, 7.5, 9.5, 8.5, 5.5, 0.8], 6, false);
    // fluffy tufts on outline
    const tuft = (arr, sd) => arr.map((q, i) => { const t = i / arr.length; const c = T.S[i]; const nx = q[0] - c[0], ny = q[1] - c[1]; const nl = Math.hypot(nx, ny) || 1; const hh = hash2(i, sd > 0 ? 3 : 4, 77); const k = (i % 4 === 2 && t > 0.18 && t < 0.97 && hh > 0.25) ? 1.2 + 2.2 * hh : 0; const tg = T.S[Math.min(T.S.length - 1, i + 1)], tg0 = T.S[Math.max(0, i - 1)]; const tx = tg[0] - tg0[0], ty = tg[1] - tg0[1]; const tl = Math.hypot(tx, ty) || 1; const o2 = [q[0] + nx / nl * k + tx / tl * k * 0.9, q[1] + ny / nl * k + ty / tl * k * 0.9]; if (k) o2.push(1); return o2; });
    const Aa = tuft(T.A, 1), Bb = tuft(T.B, -1);
    const out = Aa.concat(Bb.slice().reverse());
    cel(ctx, out, opt(P.fur, P.furSh, { line: false, inner: (c) => {
      // white tip
      const n = T.A.length, k0 = Math.floor(n * 0.8);
      const tip = T.A.slice(k0).concat(T.B.slice(k0).reverse());
      const ext = tip.map((q) => q);
      pth(c, ext); c.fillStyle = P.cream; c.fill();
      // dark guard-hair band on top
      c.fillStyle = css(C(P.furSh), 0.5);
      const top = T.B.slice(Math.floor(n * 0.15), Math.floor(n * 0.75));
      ribbon(c, top, (t) => Math.sin(Math.PI * t) * 1.4, null); c.fill();
    } }));
    ink(ctx, out, LW, { closed: true, color: P.line, seed: 31 });
  };
  // body + neck as one silhouette
  const hc = p.head; const hr = p.hr || 0;
  const HSC = 1.28; const H = (x, y) => add(hc, rot([(x > 10 ? 10 + (x - 10) * 0.72 : x) * HSC, y * HSC], hr));
  const bodyPts = [B(-10, -2), B(-4, -10.5), B(12, -9.5), B(28, -9.5), B(38, -12), H(-10, -1), H(-6, 8), B(50, 2), B(44, 12), B(28, 10), B(14, 7.5), B(2, 9.5), B(-8, 5)];
  const body = spl(bodyPts, true, 6);
  const drawBody = () => {
    cel(ctx, body, opt(P.fur, P.furSh, { line: false, inner: (c) => {
      // belly cream line + chest ruff region
      const belly = spl([B(10, 8.5), B(26, 9.4), B(40, 11.5), B(50, 2), H(-3, 9), H(4, 10), B(52, 8), B(46, 14), B(26, 12), B(10, 11)], true, 5);
      pth(c, belly); c.fillStyle = P.cream; c.fill();
      c.save(); c.translate(lvU[0] * 0.8, lvU[1] * 0.8); c.globalCompositeOperation = 'source-atop'; c.restore();
    } }));
    ink(ctx, body, LW, { closed: true, color: P.line, seed: 41 });
    // chest ruff tufts (cream) over the throat
    const ruff = spl([H(-2, 7), H(6, 9), B(52, -1), [B(55, 4)[0], B(55, 4)[1], 1], B(51, 6), [B(53, 10)[0], B(53, 10)[1], 1], B(48, 10), [B(49, 14)[0], B(49, 14)[1], 1], B(42, 12), B(44, 4)], true, 4);
    cel(ctx, ruff, { base: P.cream, shade: P.creamSh, lv: lvU, line: false });
    ink(ctx, ruff.slice(Math.floor(ruff.length * 0.2), Math.floor(ruff.length * 0.85)), LW * 0.9, { color: P.line, seed: 42 });
  };
  const drawHead = () => {
    const tr = (pts) => pts.map((q) => { const r = H(q[0], q[1]); if (q[2]) r.push(1); return r; });
    // far ear
    const ear = (dx, far) => {
      const flat = p.earFlat || 0; const ea = (p.ear || 0) - flat * 1.1 + (far ? 0.12 : 0);
      const sy = 1 - flat * 0.3;
      const piv = [-4.2, -10];
      const tf = (q) => { let r = [q[0] - piv[0], (q[1] - piv[1]) * sy]; r = rot(r, ea); r = [r[0] + piv[0] + dx, r[1] + piv[1]]; const o2 = H(r[0], r[1]); if (q[2]) o2.push(1); return o2; };
      const E = spl(FOX_EAR.map(tf), true, 5);
      const EI = spl(FOX_EAR_IN.map(tf), true, 5);
      const fur = far ? darker(P.fur, P.far) : P.fur;
      cel(ctx, E, opt(fur, far ? darker(P.furSh, P.far) : P.furSh, { line: false, inner: (c) => {
        if (!far) { pth(c, EI); c.fillStyle = P.earIn; c.fill(); c.save(); pth(c, EI); c.clip(); c.fillStyle = css(C(P.creamSh), 0.8); pth(c, EI.map((q) => [q[0] + 1.6, q[1] + 1.2])); c.fill(); c.restore(); }
        // dark ear tip
        const tip = H(...rot([-8 - piv[0], -28.5 - piv[1]], ea).map((v, i) => v + piv[i] + (i === 0 ? dx : 0)));
        c.beginPath(); c.arc(tip[0], tip[1], 6.5, 0, TAU); c.fillStyle = far ? darker(P.dark, 0.8) : P.dark; c.fill();
      } }));
      ink(ctx, E, LW, { closed: true, color: P.line, seed: far ? 51 : 52 });
    };
    ear(5.5, true);
    // head shape (mouth open variant)
    const m = p.mouth || 0;
    const head = FOX_HEAD.map((q, i) => (i >= 8 && i <= 10 ? [q[0], q[1] + m * [2.4, 3.2, 2.2][i - 8], q[2]] : q));
    const HS = spl(tr(head), true, 6);
    cel(ctx, HS, opt(P.fur, P.furSh, { line: false, inner: (c) => {
      const cr = FOX_HEAD_CREAM.map((q, i) => (i >= 3 && i <= 5 ? [q[0], q[1] + m * 2.8] : q));
      pth(c, spl(tr(cr), true, 5)); c.fillStyle = P.cream; c.fill();
      // cream shadow under jaw
      c.save(); pth(c, spl(tr(cr), true, 5)); c.clip(); c.fillStyle = P.creamSh; pth(c, spl(tr(cr), true, 5).map((q) => [q[0] - lvU[0] * 1.2, q[1] - lvU[1] * 1.2 + 1.5])); c.globalCompositeOperation = 'source-over';
      c.beginPath(); c.rect(-999, -999, 2999, 2999); addPth(c, spl(tr(cr), true, 5).map((q) => [q[0] + lvU[0], q[1] + lvU[1]])); c.fill('evenodd'); c.restore();
      if (m > 0.05) { const mo = spl(tr([[24, 3.8], [17, 4.6 + m * 0.6], [11, 6 + m * 1.5], [17, 4.6 + m * 2.6], [23.6, 4.2 + m * 2.6]]), true, 3); pth(c, mo); c.fillStyle = '#4a1c1c'; c.fill(); }
    } }));
    ink(ctx, HS, LW * 1.05, { closed: true, color: P.line, seed: 61 });
    // mouth line
    ink(ctx, spl(tr([[23.6, 3.9 + m * 0.4], [18, 4.5 + m * 0.6], [13, 5.2 + m * 1.2]]), false, 4), LW * 0.8, { color: P.line, seed: 62 });
    // nose
    const nz = H(24.6, 1.4);
    ctx.save(); ctx.translate(nz[0], nz[1]); ctx.rotate(hr); ctx.beginPath(); ctx.ellipse(0, 0, 2.1, 1.6, 0.2, 0, TAU); ctx.fillStyle = P.nose; ctx.fill();
    ctx.beginPath(); ctx.ellipse(-0.6, -0.6, 0.6, 0.35, 0, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill(); ctx.restore();
    // eye
    const eo = p.eye == null ? 1 : p.eye; const look = p.look || 0;
    if (eo > 0.15) {
      const lid = lerp(-1.6, -5.4, eo);
      const E = spl(tr([[3.4, -3.0, 1], [6.5, lid], [10.4, -3.9 + (1 - eo) * 2.2], [9.8, -1.6], [6, -1.0]]), true, 4);
      ctx.save(); pth(ctx, E); ctx.fillStyle = '#2a1410'; ctx.fill(); ctx.clip();
      const ic = H(7.9 + look * 0.6, -3.2 - look * 0.9);
      ctx.beginPath(); ctx.arc(ic[0], ic[1], 2.1, 0, TAU); ctx.fillStyle = P.iris; ctx.fill();
      ctx.beginPath(); ctx.arc(ic[0], ic[1] - 1.3, 2.2, 0, TAU); ctx.fillStyle = P.irisSh; ctx.fill();
      ctx.beginPath(); ctx.arc(ic[0] + 0.2, ic[1], 1.15, 0, TAU); ctx.fillStyle = '#120808'; ctx.fill();
      const hl = H(8.6 + look * 0.6, -4.1 - look * 0.9);
      ctx.beginPath(); ctx.arc(hl[0], hl[1], 0.75, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      if (o.catch) { const h2 = H(7.0, -2.2); ctx.beginPath(); ctx.arc(h2[0], h2[1], 0.45, 0, TAU); ctx.fillStyle = o.catch; ctx.fill(); }
      ctx.restore();
      ink(ctx, spl(tr([[3.0, -2.6], [6.5, lid - 0.2], [10.8, -4.0 + (1 - eo) * 2.2]]), false, 4), LW * 1.5, { color: '#1e0e0a', seed: 63, tp: 0.35 });
    } else {
      ink(ctx, spl(tr([[3.2, -2.4], [6.8, -1.6], [10.6, -2.6]]), false, 4), LW * 1.3, { color: '#1e0e0a', seed: 64 });
    }
    // dark tear line
    ink(ctx, spl(tr([[4.2, -1.2], [5.6, 1.4], [8, 3.0]]), false, 3), LW * 0.7, { color: css(C(P.furSh), 0.9), seed: 65 });
    ear(0, false);
  };
  // lantern in mouth (stick)
  if (p.lanternMouth) {
    const mouthPt = H(19, 5); const stickEnd = H(30, 8);
    o._lantern = { stick: [mouthPt, stickEnd] };
  }
  // DRAW ORDER
  drawLeg(legs.hf); drawLeg(legs.ff);
  drawTail();
  drawBody();
  drawLeg(legs.hn); drawLeg(legs.fn);
  drawHead();
  if (p.lanternMouth) {
    const [a, b] = o._lantern.stick;
    ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(H(14, 5.5)[0], H(14, 5.5)[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ink(ctx, [H(14, 5.5), b], LW * 0.6, { color: P.line, seed: 70 });
  }
  ctx.restore();
  // return world-space anchors
  const W2 = (q) => [o.x + q[0] * s * (o.flip ? -1 : 1), o.y + q[1] * s];
  return { stickEnd: p.lanternMouth ? W2(o._lantern.stick[1]) : null, head: W2(hc), nose: W2(H(25, 2)), fn: W2(p.fn), eye: W2(H(7.5, -3)) };
}

// paper lantern (chochin). x,y = top hanging point; s scale; sway angle; lit 0..1
function lantern(ctx, x, y, s, sway, lit = 1, flame = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(sway); ctx.scale(s, s);
  ctx.strokeStyle = '#2b1a12'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 3); ctx.stroke();
  const body = spl([[-5.2, 4.6], [-6.4, 9.5], [-5.4, 14.6], [5.4, 14.6], [6.4, 9.5], [5.2, 4.6]], true, 5);
  ctx.save(); pth(ctx, body); ctx.clip();
  const g = ctx.createRadialGradient(-0.5 + flame * 0.8, 10, 0.5, 0, 10, 8);
  g.addColorStop(0, '#fff6d8'); g.addColorStop(0.45, '#ffc778'); g.addColorStop(1, '#e0702e');
  ctx.fillStyle = g; ctx.fillRect(-8, 3, 16, 13);
  ctx.strokeStyle = 'rgba(150,60,20,0.55)'; ctx.lineWidth = 0.35;
  for (let i = 0; i < 6; i++) { const yy = 5.4 + i * 1.75; ctx.beginPath(); ctx.ellipse(0, yy, 6.6, 0.8, 0, 0, Math.PI); ctx.stroke(); }
  // painted red mark
  ctx.fillStyle = 'rgba(190,40,30,0.55)'; ctx.beginPath(); ctx.arc(0.5, 9.7, 1.6, 0, TAU); ctx.fill();
  ctx.restore();
  ink(ctx, body, 0.45, { closed: true, color: '#3a1e12', seed: 81 });
  ctx.fillStyle = '#2a1a14'; ctx.fillRect(-3.6, 3, 7.2, 1.9); ctx.fillRect(-3.6, 14.2, 7.2, 1.8);
  ctx.restore();
}
function lanternGlow(ctx, x, y, r, a = 1) {
  glow(ctx, x, y, r, '#ffad55', 0.55 * a);
  glow(ctx, x, y, r * 0.35, '#ffe3a8', 0.5 * a);
}

// ---------- POSES ----------
function poseStand(o = {}) {
  return {
    hip: [0, -38], sho: [36, -40], head: o.head || [52, -64], hr: o.hr || 0,
    fn: [43, 0], ff: [37, 0], hn: [3, 0], hf: [-4, 0],
    tail: o.tail || [[-20, -38], [-31, -30], [-42, -25], [-54, -24]],
    ear: o.ear || 0, earFlat: o.earFlat || 0, eye: o.eye, mouth: o.mouth || 0, look: o.look || 0, lanternMouth: o.lanternMouth,
  };
}
// walk cycle: phase 0..1
function poseWalk(ph, o = {}) {
  const p = poseStand(o);
  const stride = 14;
  const leg = (off, bx) => {
    const q = (ph + off) % 1;
    if (q < 0.62) { const u = q / 0.62; return [bx + stride * (0.5 - u), 0]; }
    const u = (q - 0.62) / 0.38; return [bx + stride * (-0.5 + u), -5.5 * Math.sin(Math.PI * u)];
  };
  p.fn = leg(0.0, 43); p.ff = leg(0.5, 37); p.hn = leg(0.25, 3); p.hf = leg(0.75, -4);
  const bob = Math.cos(ph * TAU * 2) * 1.0;
  p.hip = [0, -38 + bob]; p.sho = [36, -40 + bob * 0.8];
  p.head = add(p.head, [0, bob * 0.6 + Math.cos(ph * TAU * 2 + 0.8) * 0.6]);
  const tw = Math.sin(ph * TAU) * 2.5;
  p.tail = p.tail.map((q, i) => [q[0], q[1] + tw * (i / 3)]);
  return p;
}
function poseSit(o = {}) {
  return {
    hip: [2, -16], sho: [24, -44], head: o.head || [34, -70], hr: o.hr || 0,
    fn: [33, 0], ff: [28, 0], hn: [14, 0], hf: [8, 0],
    hnPts: [[3, -14], [17, -11], [1, -2.5], [15, 0]], hfPts: [[-1, -14], [12, -11], [-4, -2.5], [9, 0]],
    tail: o.tail || [[-14, -8], [-12, -1], [4, 2.5], [22, 1.5]],
    ear: o.ear || 0, earFlat: o.earFlat || 0, eye: o.eye, mouth: o.mouth || 0, look: o.look || 0,
  };
}
function lerpPose(a, b, t) {
  const L = (x, y) => (Array.isArray(x) ? (Array.isArray(x[0]) ? x.map((q, i) => L(q, y[i])) : x.map((v, i) => lerp(v, y[i], t))) : typeof x === 'number' ? lerp(x, y, t) : (t < 0.5 ? x : y));
  const o = {}; for (const k in a) o[k] = b[k] === undefined ? a[k] : L(a[k], b[k]); return o;
}

// ---------- FRONT FACE (close-ups) ----------
// p: tilt, yaw(-.3..3), pitch(-.3..3), earL/earR swivel(-1..1), earFlat, eyeL/eyeR open, lookX, lookY, sniff, mouth
function foxFace(ctx, p, o) {
  const P = typeof o.pal === 'string' ? FOXPAL[o.pal] : o.pal;
  const s = o.s; const LW = (o.lw || 2.2) / s * (s > 3 ? 1.2 : 1);
  const yaw = p.yaw || 0, pitch = p.pitch || 0;
  const lv = o.lv || [-0.5, 0.8]; const lvU = [lv[0] * 7, lv[1] * 7];
  const rimU = o.rimv ? [o.rimv[0] * 4, o.rimv[1] * 4] : null;
  ctx.save(); ctx.translate(o.x, o.y); ctx.scale(s, s); ctx.rotate(p.tilt || 0);
  // projection of a face point with depth z
  const F = (x, y, z = 0, c) => { const k = 1 - Math.sign(x) * yaw * 0.18; const o2 = [x * k + yaw * z, y - pitch * z * 0.45 + pitch * 6]; if (c) o2.push(1); return o2; };
  const FP = (arr, z, mir) => arr.map((q) => F(mir ? -q[0] : q[0], q[1], q[3] != null ? q[3] : z, q[2]));
  const opt = (base, shade, extra = {}) => ({ base, shade, lv: lvU, lw: LW, lc: P.line, hi: rimU ? (P.rim || P.furHi) : null, hv: rimU, ...extra });
  // --- neck / chest ---
  if (o.neck !== false) {
    const nk = spl([F(-30, 18), F(-40, 64), [F(-58, 112)[0], F(-58, 112)[1], 1], [F(58, 112)[0], F(58, 112)[1], 1], F(40, 64), F(30, 18)], true, 5);
    cel(ctx, nk, opt(P.fur, P.furSh, { line: false }));
    ink(ctx, nk.slice(0, Math.floor(nk.length * 0.35)), LW, { color: P.line, seed: 101 });
    ink(ctx, nk.slice(Math.floor(nk.length * 0.62)), LW, { color: P.line, seed: 102 });
    const bib = spl([F(-30, 30), F(-36, 56), [...F(-42, 66), 1], F(-30, 66), [...F(-34, 82), 1], F(-20, 80), [...F(-16, 98), 1], F(-4, 88), [...F(4, 104), 1], F(10, 90), [...F(20, 100), 1], F(24, 82), [...F(36, 84), 1], F(32, 68), [...F(44, 64), 1], F(34, 54), F(30, 30)], true, 4);
    cel(ctx, bib, opt(P.cream, P.creamSh, { line: false, hi: null }));
    ink(ctx, bib.slice(Math.floor(bib.length * 0.08), Math.floor(bib.length * 0.92)), LW * 0.85, { color: P.line, seed: 103 });
  }
  // --- ears (behind head) ---
  const EAR = [[-43, -24, 1], [-51, -52], [-47, -88, 1], [-32, -64], [-13, -40, 1]];
  const EARIN = [[-39, -31], [-45, -54], [-44.5, -78], [-33, -58], [-19, -40]];
  const ear = (side, sw) => {
    const flat = p.earFlat || 0; const m = side > 0;
    const piv = [-28, -34];
    const ang = (-(sw || 0) * 0.32 - flat * 1.05) * (m ? -1 : 1);
    const tf = (q, inner) => {
      let x = q[0] - piv[0], y = q[1] - piv[1];
      y *= 1 - flat * 0.28 - pitch * 0.15;
      if (inner) { x = x * (1 - Math.abs(sw || 0) * 0.45 - flat * 0.5) + (sw || 0) * 4; }
      else x *= 1 - Math.abs(sw || 0) * 0.18;
      const r = rot([x, y], ang * (m ? -1 : 1) * (m ? -1 : 1));
      const px = r[0] + piv[0], py = r[1] + piv[1] + pitch * 8;
      const o2 = F(m ? -px : px, py, -8); if (q[2]) o2.push(1); return o2;
    };
    const E = spl(EAR.map((q) => tf(q)), true, 5), EI = spl(EARIN.map((q) => tf(q, true)), true, 5);
    const tipP = tf([-47, -88]);
    cel(ctx, E, opt(P.fur, P.furSh, { line: false, inner: (c) => {
      c.beginPath(); c.arc(tipP[0], tipP[1] + 6, 15, 0, TAU); c.fillStyle = P.dark; c.fill();
      pth(c, EI); c.fillStyle = P.earIn; c.fill();
      c.save(); pth(c, EI); c.clip(); pth(c, EI.map((q) => [q[0] + (m ? -3 : 3), q[1] - 4])); c.fillStyle = css(C(P.creamSh), 0.9); c.fill();
      // inner ear tufts
      c.strokeStyle = css(C(P.cream)); c.lineWidth = 1.2;
      const b = tf([-24, -38], true); for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(b[0] + (i - 3) * 2.4, b[1] + 2); c.quadraticCurveTo(b[0] + (i - 3) * 3, b[1] - 8, b[0] + (i - 3) * 3.6 + (m ? -2 : 2), b[1] - 14 - i % 2 * 4); c.stroke(); }
      c.restore();
    } }));
    ink(ctx, E, LW * 1.05, { closed: true, color: P.line, seed: m ? 111 : 112 });
  };
  ear(-1, p.earL); ear(1, p.earR);
  // --- head ---
  const HL = [[-20, -42.5], [-36, -34], [-45, -19], [-49, -3], [-57, 9, 1], [-48.5, 12, 1], [-54, 22, 1], [-42, 24, 1], [-32, 30], [-21, 37], [-10, 42]];
  const head = [F(0, -44.5, 10)].concat(FP(HL, 0, false), [F(0, 44.5, 25)], FP(HL.slice().reverse(), 0, true));
  const HS = spl(head, true, 5);
  const CR = [[-50, 3], [-40, 6], [-29, 9], [-20, 10, 0, 18], [-12.5, 15, 0, 30], [-8, 24, 0, 40], [-4, 29, 0, 44]];
  const CRB = [[-10, 42], [-21, 37], [-32, 30], [-42, 24, 1], [-54, 22, 1], [-48.5, 12, 1], [-57, 9, 1]];
  const cream = FP(CR, 0, false).concat([F(0, 31, 44)], FP(CR.slice().reverse(), 0, true), FP(CRB.slice().reverse(), 0, true), [F(0, 44.5, 25)], FP(CRB, 0, false));
  cel(ctx, HS, opt(P.fur, P.furSh, { line: false, inner: (c) => {
    const CS = spl(cream, true, 4);
    pth(c, CS); c.fillStyle = P.cream; c.fill();
    c.save(); pth(c, CS); c.clip(); c.beginPath(); c.rect(-999, -999, 1999, 1999); addPth(c, CS.map((q) => [q[0] + lvU[0] * 0.45, q[1] + lvU[1] * 0.45])); c.fillStyle = css(C(P.creamSh), 0.8); c.fill('evenodd'); c.restore();
    // forehead blaze highlight & cheek fur strands
    c.fillStyle = css(C(P.furHi), 0.55); blob(c, F(0, -26, 12)[0] - lvU[0] * 0.6, F(0, -26, 12)[1] - 2, 9, 6, 0, RNG(5)); c.fill();
    c.strokeStyle = css(C(P.furSh), 0.7); c.lineWidth = 0.9;
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { const a = F(sd * (36 + i * 4), -8 + i * 6, 0); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(a[0] + sd * 6, a[1] + 3); c.stroke(); }
  } }));
  ink(ctx, HS, LW * 1.1, { closed: true, color: P.line, seed: 121 });
  // tear marks
  for (const sd of [-1, 1]) ribbon(ctx, spl([F(sd * 11.5, -3, 24), F(sd * 12.5, 4, 28), F(sd * 14.5, 11, 30)], false, 4), (t) => (1 - t) * 1.6 + 0.2, css(C(P.dark), 0.75));
  // --- eyes ---
  const eye = (sd, op) => {
    const ex = sd * 21; const z = 22;
    const look = [p.lookX || 0, p.lookY || 0];
    if (op > 0.12) {
      const tl = (y) => lerp(-1.5, y, op);
      const shape = spl([F(sd * 35, -9.5, z, 1), F(sd * 28, tl(-17), z), F(sd * 16.5, tl(-16.5), z), F(sd * 9.5, -5.5, z, 1), F(sd * 16, 2.8, z), F(sd * 28, 1.6, z)], true, 5);
      ctx.save(); pth(ctx, shape); ctx.fillStyle = '#fbf3e6'; ctx.fill(); ctx.clip();
      const ic = F(ex - sd * 1 + look[0] * 3.2, -6.5 + look[1] * 3.4, z);
      ctx.beginPath(); ctx.ellipse(ic[0], ic[1], 9.4, 10.2, 0, 0, TAU); ctx.fillStyle = P.iris; ctx.fill();
      ctx.beginPath(); ctx.ellipse(ic[0], ic[1] - 7.6, 10.6, 6.4, 0, 0, TAU); ctx.fillStyle = P.irisSh; ctx.fill();
      ctx.beginPath(); ctx.ellipse(ic[0], ic[1] + 0.6, 4.3, 5.6, 0, 0, TAU); ctx.fillStyle = '#140808'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(ic[0], ic[1] + 5.6, 5.2, 2.0, 0, 0, TAU); ctx.fillStyle = css(mixc(C(P.iris), [255, 240, 190], 0.5), 0.8); ctx.fill();
      ctx.beginPath(); ctx.ellipse(ic[0] - 3.2, ic[1] - 3.4, 3.0, 2.6, -0.3, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.beginPath(); ctx.arc(ic[0] + 3.0, ic[1] + 3.0, 1.2, 0, TAU); ctx.fill();
      if (o.catch) { ctx.beginPath(); ctx.arc(ic[0] - 3.5 + (o.catchDx || 0), ic[1] + 3.2, 1.2, 0, TAU); ctx.fillStyle = o.catch; ctx.fill(); }
      // upper lid shadow on the eye white
      ctx.beginPath(); addPth(ctx, shape.map((q) => [q[0], q[1] + 2.2])); ctx.rect(-999, -999, 1999, 1999); ctx.fillStyle = css(C(P.creamSh), 0.55); ctx.fill('evenodd');
      ctx.restore();
      const top = spl([F(sd * 37, -11, z), F(sd * 28, tl(-17.6), z), F(sd * 16.5, tl(-17.0), z), F(sd * 9, -5.2, z)], false, 5);
      ink(ctx, top, LW * 2.3, { color: '#1c0c08', seed: 131 + sd, tp: 0.3, v: 0.25 });
      ink(ctx, spl([F(sd * 27, 1.8, z), F(sd * 17, 2.9, z), F(sd * 11.5, -1.5, z)], false, 4), LW * 0.9, { color: P.line, seed: 133 + sd });
    } else {
      ink(ctx, spl([F(sd * 35, -6.5, z), F(sd * 27, -0.2, z), F(sd * 16.5, 0.2, z), F(sd * 10, -4.2, z)], false, 5), LW * 2.0, { color: '#1c0c08', seed: 135 + sd, tp: 0.4 });
    }
  };
  eye(-1, p.eyeL == null ? 1 : p.eyeL); eye(1, p.eyeR == null ? 1 : p.eyeR);
  // --- nose & mouth ---
  const sn = p.sniff || 0;
  const nose = spl([F(-7.2 - sn * 0.6, 21.5 - sn, 46), F(7.2 + sn * 0.6, 21.5 - sn, 46), F(6, 25.5 - sn * 0.5, 46), F(0, 29.5, 46), F(-6, 25.5 - sn * 0.5, 46)], true, 5);
  cel(ctx, nose, { base: P.nose, line: false });
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; blob(ctx, F(-1.5, 22.6 - sn, 46)[0], F(-1.5, 22.6 - sn, 46)[1], 3.2, 1.2, 0, RNG(3)); ctx.fill();
  const m = p.mouth || 0;
  ink(ctx, spl([F(0, 29.5, 46), F(0, 33, 44), F(-3.5, 36, 42), F(-7.5, 35.5 - m, 40)], false, 4), LW * 0.9, { color: P.line, seed: 141 });
  ink(ctx, spl([F(0, 33, 44), F(3.5, 36, 42), F(7.5, 35.5 - m, 40)], false, 4), LW * 0.9, { color: P.line, seed: 142 });
  if (m > 0.1) { const mo = spl([F(-6, 36, 41), F(0, 35, 43), F(6, 36, 41), F(0, 36 + m * 6, 42)], true, 4); cel(ctx, mo, { base: '#5a2020', line: true, lw: LW * 0.8, lc: P.line }); }
  ctx.restore();
}
