// ===== SHOT 6: The Pages Burst (0:32-0:39) =====
const S6N = 420;
let _s6 = null;
function s6Pages() {
  if (_s6) return _s6; const r = RNG(601); const out = [];
  for (let i = 0; i < S6N; i++) {
    const side = r() < 0.5 ? -1 : 1;
    out.push({ X: side * 5.9, Y: -9 + r() * 10, Z: 6 + r() * 20, t0: Math.floor(r() * 7) * 2, sp: 0.6 + r() * 0.8, ang: r() * TAU, spin: (r() - 0.5) * 0.5, seed: (r() * 1e6) | 0, dx: -side * (1 + r() * 4), dy: -(3 + r() * 6), dz: (r() - 0.5) * 6 });
  }
  return (_s6 = out);
}
function stairwell() {
  return layer('s6well', (ctx) => {
    const r = RNG(602); const cx = 640, cy = 250;
    ctx.fillStyle = '#07070f'; ctx.fillRect(0, 0, W, H);
    const R = (i) => 1250 * Math.pow(0.79, i);
    for (let i = 0; i < 16; i++) {
      const r0 = R(i), r1 = R(i + 1); const k = clamp(1 - i / 16);
      const amb = [30 + 40 * k, 34 + 42 * k, 70 + 60 * k];
      // books as radial wedges
      let a = r() * 0.05;
      while (a < TAU) {
        const da = (0.012 + r() * 0.03) * (1 + i * 0.05); const col = mulc(bookColor(r), amb.map((v) => v * 1.4));
        const hk = 0.62 + r() * 0.3;
        const ri = lerp(r0, r1, 0.12), ro = lerp(r0, r1, 0.12 + hk * 0.75);
        ctx.beginPath(); ctx.arc(cx, cy, ro, a, a + da); ctx.arc(cx, cy, ri, a + da, a, true); ctx.closePath();
        ctx.fillStyle = css(col); ctx.fill();
        if (r() < 0.4) { ctx.strokeStyle = css(mixc(col, [220, 190, 120], 0.4), 0.6); ctx.lineWidth = Math.max(0.5, (r0 - r1) * 0.02); ctx.beginPath(); ctx.arc(cx, cy, lerp(ri, ro, 0.15), a, a + da); ctx.stroke(); }
        a += da + 0.002;
      }
      // balcony ring + balusters
      ctx.lineWidth = Math.max(2, (r0 - r1) * 0.13); ctx.strokeStyle = css(mulc([60, 45, 40], amb.map((v) => v * 2.2))); ctx.beginPath(); ctx.arc(cx, cy, r1 + (r0 - r1) * 0.06, 0, TAU); ctx.stroke();
      ctx.strokeStyle = css(mulc([80, 60, 50], amb.map((v) => v * 2)), 0.9); ctx.lineWidth = Math.max(0.6, (r0 - r1) * 0.025);
      for (let b = 0; b < 90; b++) { const aa = (b / 90) * TAU; ctx.beginPath(); ctx.moveTo(cx + Math.cos(aa) * r1, cy + Math.sin(aa) * r1); ctx.lineTo(cx + Math.cos(aa) * (r1 + (r0 - r1) * 0.1), cy + Math.sin(aa) * (r1 + (r0 - r1) * 0.1)); ctx.stroke(); }
    }
    // spiral staircase band
    ctx.strokeStyle = 'rgba(40,32,40,0.9)';
    for (let i = 0; i < 400; i++) { const t = i / 400; const rr = R(t * 15); const a = t * TAU * 4.2; ctx.lineWidth = Math.max(1, rr * 0.07); ctx.beginPath(); ctx.arc(cx, cy, rr * 0.97, a, a + 0.05); ctx.stroke(); }
    // depth darkness toward the top except the oculus
    const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, 700); g.addColorStop(0, 'rgba(6,6,14,0.85)'); g.addColorStop(0.35, 'rgba(6,6,14,0.5)'); g.addColorStop(1, 'rgba(6,6,14,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    paperize(ctx, 0.06);
  });
}
function shutters(ctx, cx, cy, rad, open, gold) {
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU; const am = (a0 + a1) / 2;
    const d = open * rad * 3.2 * (0.8 + (i % 3) * 0.2); const sp = open * (i % 2 ? 1.2 : -1.0);
    ctx.save(); ctx.translate(cx + Math.cos(am) * d, cy + Math.sin(am) * d); ctx.rotate(sp);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, rad, a0 - am - 0.01 + am, a1 - am + 0.01 + am); ctx.closePath();
    ctx.fillStyle = css(mixc(C('#2f4f4c'), C('#7fae95'), gold * 0.6 + (i % 2) * 0.15)); ctx.fill();
    ctx.strokeStyle = 'rgba(20,30,30,0.9)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }
}
shot(768, 936, (ctx, f) => {
  const ff = on(f, 2);
  if (ff < 60) {
    // (a) every book flies open: pages tear free and fold into birds
    const [sx, sy] = ff < 10 ? shake(f, 4, 11) : [0, 0];
    ctx.save(); ctx.translate(sx, sy);
    ctx.drawImage(s2BG(), 0, 0);
    drawShaft(ctx, S2CAM, S2SHAFT, f);
    if (ff < 4) { ctx.fillStyle = 'rgba(230,230,255,0.25)'; ctx.fillRect(0, 0, W, H); }
    warmLight(ctx, 330 + 64 * 0.9 + 6, 460, 260, 1, f);
    foxSide(ctx, poseStand({ head: [50, -70], hr: -0.6, earFlat: ff < 30 ? 0.9 : 0.3, look: 1, mouth: 0.3 }), { x: 330, y: 470, s: 0.9, pal: 'lantern', lv: [-0.2, 0.9] });
    lantern(ctx, 330 + 64 * 0.9 + 6, 470 - 18, 1.125, 0.15 * Math.sin(ff), 1); lanternGlow(ctx, 330 + 64 * 0.9 + 6, 463, 60);
    const PG = s6Pages().slice().sort((a, b) => b.Z - a.Z);
    for (const p of PG) {
      const a = ff - p.t0; if (a < 0) continue;
      const u = a / 40;
      const X = p.X + p.dx * u * p.sp, Y = p.Y + p.dy * u * u * p.sp - u * 2, Z = Math.max(3, p.Z + p.dz * u);
      const q = S2CAM.pr(X, Y, Z); const sc = (700 / Z) * 0.14;
      const tint = [200, 205, 255];
      if (a < 6) page(ctx, q[0], q[1], sc * 1.4, sc, p.ang + a * p.spin, RNG(p.seed), { flip: Math.cos(a * 0.9), tint, lw: 0.5 });
      else foldingPage(ctx, q[0], q[1], sc, (a - 6) / 6, -0.4 - u * 0.8 * Math.sign(p.dx || 1), p.seed, { tint, lw: 0.5 });
      if (a >= 12) paperBird(ctx, q[0], q[1], sc, (Math.floor((ff + p.seed) / 2) % 2) ? 0.9 : -0.7, -1.2 + Math.sign(p.dx) * 0.6, p.seed, { tint, lw: 0.5 });
    }
    ctx.restore();
  } else {
    // (b) low angle straight up the circular stairwell: the flock spirals toward the dome
    const t = ff - 60; const cx = 640, cy = 250;
    const rot = t * 0.004;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.translate(-cx, -cy); ctx.drawImage(stairwell(), 0, 0); ctx.restore();
    const open = ff < 120 ? 0 : keys(seg(ff, 120, 132), 4);
    const gold = sstep(seg(ff, 120, 140));
    // oculus
    ctx.fillStyle = css(mixc([10, 12, 25], [255, 230, 160], gold)); ctx.beginPath(); ctx.arc(cx, cy, 30, 0, TAU); ctx.fill();
    shutters(ctx, cx, cy, 30, open, gold);
    // flock vortex
    const r = RNG(603); const birds = [];
    for (let i = 0; i < 360; i++) {
      const h0 = r(), w0 = r() * TAU, sp = 0.6 + r() * 0.8, seed = (r() * 1e6) | 0;
      const h = (h0 + t * 0.006 * sp) % 1; const rad = lerp(760, 26, Math.pow(h, 0.7));
      const a = w0 + t * 0.05 * sp * (1 + h * 1.5);
      birds.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad * 0.92, s: lerp(30, 2.2, Math.pow(h, 0.6)), head: a + Math.PI / 2 + 0.4, seed, h });
    }
    birds.sort((a, b) => b.h - a.h);
    const tint = mixc([190, 200, 255], [255, 225, 170], gold);
    for (const b of birds) paperBird(ctx, b.x, b.y, b.s, (Math.floor((ff + b.seed) / 2) % 2) ? 0.9 : -0.7, b.head, b.seed, { tint, lw: 0.6 });
    // the first gold light crashes down the shaft
    if (gold > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU + hash2(i, 1, 3) * 0.2; const wv = 0.03 + hash2(i, 2, 3) * 0.06; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a - wv) * 1400, cy + Math.sin(a - wv) * 1400); ctx.lineTo(cx + Math.cos(a + wv) * 1400, cy + Math.sin(a + wv) * 1400); ctx.closePath(); ctx.fillStyle = `rgba(255,200,110,${0.12 * gold})`; ctx.fill(); }
      glow(ctx, cx, cy, 520 * gold + 60, '#ffd27a', 0.9 * gold);
      glow(ctx, cx, cy, 120, '#fff6d8', gold);
      const fl = ff < 126 ? 0.85 : clamp(0.85 - (ff - 126) / 20);
      if (fl > 0) { ctx.fillStyle = `rgba(255,236,190,${fl})`; ctx.fillRect(0, 0, W, H); }
      ctx.restore();
    }
  }
  vignette(ctx, 0.5, [4, 4, 14]);
});
