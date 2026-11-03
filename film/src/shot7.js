// ===== SHOT 7: Sunrise (0:39-0:44) =====
const GOLDSEA = { y0: 340, y1: 620, s0: 5, s1: 85, rows: 11, pow: 1.9, farShade: '#c88a8e', farMid: '#e6aa92', farLit: '#ffdca6', shade: '#6e5482', mid: '#b67f9c', lit: '#ffb98a', rim: '#fff0c4', valley: '#4e3f70', lv: [-0.92, -0.38] };
function goldSky(key, sunY) {
  return layer(key, (ctx) => {
    const r = RNG(701);
    paintGrad(ctx, [[0, '#2f5592'], [0.3, '#7b86b8'], [0.55, '#e3a492'], [0.78, '#ffc886'], [1, '#fff0c8']], [0, 0, W, 380], r, { n: 1500, alpha: 0.18, jit: 8 });
    for (let i = 0; i < 30; i++) { const x = r() * W, y = 60 + r() * 220; blob(ctx, x, y, 80 + r() * 200, 3 + r() * 6, (r() - 0.5) * 0.06, r, 12, 0.3); ctx.fillStyle = css(mixc(C('#ffd0a0'), C('#f39a8a'), r()), 0.25 + 0.25 * y / 280); ctx.fill(); }
    glow(ctx, 430, sunY, 700, '#ffb070', 0.55); glow(ctx, 430, sunY, 260, '#ffe2a8', 0.7);
    paperize(ctx, 0.06);
  });
}
function goldSeaLayer(key, seed, from, to, y0) {
  return layer(key, (ctx) => { cloudSea(ctx, RNG(seed), { ...GOLDSEA, y0: y0 || GOLDSEA.y0, from, to }); paperize(ctx, 0.05); });
}
function sun(ctx, x, y, a = 1) {
  glow(ctx, x, y, 180, '#fff0c0', 0.8 * a);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,250,230,${a})`; ctx.beginPath(); ctx.arc(x, y, 24, 0, TAU); ctx.fill(); ctx.restore();
}
function balcony(ctx, f) {
  return layer('s7balc', (c) => {
    const r = RNG(702); const P = PAL_GOLD;
    // floor + balustrade (stone), lit from the left by the low sun
    c.fillStyle = '#5a3a55'; c.fillRect(560, 470, 720, 80);
    const rail = [[560, 430, 1], [1290, 418, 1], [1290, 446, 1], [560, 452, 1]];
    cel(c, rail, { base: P.stoneMid, shade: P.stoneShade, lv: [-6, -10], line: false });
    c.fillStyle = P.stoneLit; c.fillRect(560, 428, 730, 3);
    for (let x = 580; x < 1290; x += 34) { const b = spl([[x - 7, 452], [x - 10, 465], [x - 6, 478], [x - 9, 492], [x + 9, 492], [x + 6, 478], [x + 10, 465], [x + 7, 452]], true, 4); cel(c, b, { base: P.stoneMid, shade: P.stoneShade, lv: [-5, 0], line: false }); }
    c.fillStyle = '#4a3050'; c.fillRect(560, 492, 730, 60);
    dabs(c, r, 260, [560, 418, 1290, 544], (x, y, rr) => jc(C(rr() < 0.5 ? P.stoneShade : P.stoneMid), rr, 14), { smin: 1, smax: 5, alpha: 0.4 });
    // moss on the rail
    for (let i = 0; i < 40; i++) { c.fillStyle = css(jc(C('#8a9a4a'), r, 20), 0.8); blob(c, 560 + r() * 720, 430 + r() * 4, 2 + r() * 6, 1 + r() * 2, 0, r); c.fill(); }
    paperize(c, 0.06);
  });
}
function flockStream(ctx, f, n, seed, path, tint, smin, smax) {
  const r = RNG(seed); const k = on(f, 2);
  for (let i = 0; i < n; i++) {
    const u = (r() + k * 0.004 * (0.6 + r() * 0.6)) % 1; const off = (r() - 0.5) * 2;
    const p = path(u, off); const s = lerp(smin, smax, r());
    paperBird(ctx, p[0], p[1], s, (Math.floor((k + i) / 2) % 2) ? 0.9 : -0.7, p[2], (r() * 1e6) | 0, { tint, lw: 0.5 });
  }
}
shot(936, 1056, (ctx, f) => {
  const ff = on(f, 2);
  const sunY = lerp(330, 300, f / 120);
  ctx.drawImage(goldSky('s7sky', 320), 0, 0);
  sun(ctx, 430, sunY, 1);
  ctx.drawImage(goldSeaLayer('s7sea', 703, 0, 11), -f * 0.15, 0);
  // great ring of wind rolling outward across the clouds
  const wr = seg(ff, 24, 120);
  if (wr > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(5px)';
    for (const k of [0, 0.18]) {
      const u = clamp(wr - k); if (u <= 0) continue; const rx = 30 + 1500 * easeOut(u), ry = rx * 0.14;
      ctx.lineWidth = 8 + 30 * u; ctx.strokeStyle = `rgba(255,236,200,${0.55 * (1 - u)})`;
      ctx.beginPath(); ctx.ellipse(560, 360, rx, ry, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  // the flock streaming up out of the dome behind us
  flockStream(ctx, f, 70, 704, (u, o) => [lerp(1400, 300, u) + o * 60, lerp(330, -60, u) + o * 40 + Math.sin(u * 9 + o) * 20, -2.6], [255, 225, 190], 4, 12);
  ctx.drawImage(balcony(ctx, f), 0, 0);
  // grass in the balustrade, whipping in the wind
  const t = ff / FPS;
  const GP = { ...PAL_GOLD, grass: '#6a5a3a', grassLit: '#ffd88a' };
  pampas(ctx, 0, 71, 1180, 440, 6, GP, t * 2.2, { h: 120, spread: 120, wind: 2.4, lean: 0.35, plume: '#f6d6a0', plumeLit: '#fff4d0', plumeShade: '#b07a70', litSide: -1 });
  pampas(ctx, 0, 72, 620, 444, 4, GP, t * 2.2 + 1, { h: 90, spread: 70, wind: 2.4, lean: 0.35, plume: '#f6d6a0', plumeLit: '#fff4d0', plumeShade: '#b07a70', litSide: -1 });
  // the fox on the rail, tiny against the sky, fur whipping
  const tw = Math.sin(ff * 0.9) * 4;
  const p = poseSit({ head: [34, -74], hr: -0.55, mouth: 0.35, look: 1, ear: -0.15 + Math.sin(ff * 1.3) * 0.08, tail: [[-14, -8], [-26, -6 + tw], [-38, -10 - tw], [-50, -8 + tw * 1.5]] });
  foxSide(ctx, p, { x: 930, y: 430, s: 1.25, flip: true, pal: 'gold', lv: [0.9, -0.3], rimv: [-1, -0.2] });
  // flying fur strands / loose pages
  const r = RNG(705); for (let i = 0; i < 14; i++) { const x = ((r() * W + ff * 14) % (W + 200)) - 100, y = 100 + r() * 300; page(ctx, x, y, 8 + r() * 6, 6 + r() * 4, r() * TAU + ff * 0.2, r, { flip: Math.cos(ff * 0.4 + i), tint: [255, 230, 200], lw: 0.5 }); }
  ctx.save(); ctx.globalCompositeOperation = 'screen'; glow(ctx, 430, sunY, 500, '#ffb070', 0.25, 'screen'); ctx.restore();
  vignette(ctx, 0.35, [40, 20, 40]);
});
