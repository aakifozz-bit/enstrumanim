// ===== SHOT 1: Before Dawn (0:00-0:07) =====
const TOWER1 = { cx: 930, base: 300, top: 122, hw: 60, ch: 6, cornices: [0.3, 0.62] };
function s1Sky() {
  return layer('s1sky', (ctx) => {
    const r = RNG(101);
    paintGrad(ctx, [[0, '#0f1638'], [0.3, '#1d265a'], [0.55, '#36377a'], [0.78, '#6a5a97'], [0.92, '#a581a6'], [1, '#c79aa6']], [0, 0, W, 360], r, { n: 1600, smin: 30, smax: 90, alpha: 0.18, jit: 9 });
    // stars
    for (let i = 0; i < 170; i++) {
      const x = r() * W, y = Math.pow(r(), 1.6) * 260; const b = r();
      ctx.fillStyle = css([230, 228, 255], (0.25 + b * 0.6) * (1 - y / 300));
      ctx.beginPath(); ctx.arc(x, y, 0.4 + b * b * 1.1, 0, TAU); ctx.fill();
    }
    // waning moon, low in the west
    glow(ctx, 215, 118, 160, '#7f86c8', 0.35);
    glow(ctx, 215, 118, 50, '#dfe2ff', 0.5);
    ctx.save(); ctx.beginPath(); ctx.arc(215, 118, 19, 0, TAU); ctx.fillStyle = '#eef0ff'; ctx.fill(); ctx.clip();
    ctx.fillStyle = 'rgba(160,165,215,0.35)'; blob(ctx, 209, 113, 6, 4, 0.4, r); ctx.fill(); blob(ctx, 222, 124, 5, 3, 1, r); ctx.fill();
    ctx.beginPath(); ctx.arc(226, 112, 19, 0, TAU); ctx.fillStyle = 'rgba(40,46,110,0.88)'; ctx.fill();
    ctx.restore();
    // thin cirrus streaks lit by the hidden dawn
    for (let i = 0; i < 26; i++) {
      const x = r() * W, y = 150 + r() * 120;
      blob(ctx, x, y, 60 + r() * 140, 2 + r() * 4, (r() - 0.5) * 0.06, r, 12, 0.3);
      ctx.fillStyle = css(mixc(C('#9a7fb0'), C('#d3a2ae'), r()), 0.18 + 0.2 * (y - 150) / 120); ctx.fill();
    }
    paperize(ctx, 0.12);
  });
}
const S1SEA = { y0: 318, y1: 600, s0: 5, s1: 90, rows: 11, pow: 1.9, farShade: '#5e5288', farMid: '#7a6a9e', farLit: '#a98fb2', shade: '#1a1842', mid: '#29275a', lit: '#3d3a74', rim: '#67619f', valley: '#121033', lv: [-0.55, -0.83] };
function s1Far() {
  return layer('s1far', (ctx) => { const r = RNG(102); cloudSea(ctx, r, { ...S1SEA, from: 0, to: 8 }); paperize(ctx, 0.06); });
}
function s1Mid() { return layer('s1mid', () => {}); }
function s1Cliff() {
  return layer('s1cliff', (ctx) => {
    const r = RNG(104); const P = PAL_NIGHT;
    // cliff mass
    const cl = spl([[760, 560, 1], [780, 500], [800, 452, 1], [812, 420], [830, 380, 1], [846, 344], [860, 318, 1], [880, 302], [900, 298, 1], [972, 296, 1], [1000, 300], [1022, 316, 1], [1040, 350], [1052, 392, 1], [1068, 430], [1090, 470, 1], [1110, 520], [1130, 560, 1]], true, 5);
    ctx.save(); pth(ctx, cl); ctx.fillStyle = P.rockShade; ctx.fill(); ctx.clip();
    // rock facets (lit faces up-left)
    for (let i = 0; i < 160; i++) {
      const x = 760 + r() * 380, y = 296 + r() * 260; const s = 6 + r() * 30;
      const lit = clamp(0.95 - (x - 830) / 180 - (y - 300) / 420 + (r() - 0.5) * 0.4);
      const c = lit > 0.55 ? P.rockLit : lit > 0.25 ? P.rock : P.rockShade;
      ctx.fillStyle = css(jc(C(c), r, 12), 0.85);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y + s * 0.15 * (r() - 0.5)); ctx.lineTo(x + s * (0.7 + r() * 0.3), y + s * (0.5 + r() * 0.5)); ctx.lineTo(x - s * 0.2, y + s * 0.6); ctx.closePath(); ctx.fill();
      if (lit > 0.5 && r() < 0.5) { ctx.fillStyle = css(C(P.rockHi), 0.5); ctx.fillRect(x, y, s * 0.8, 1.2); }
    }
    // strata cracks
    ctx.strokeStyle = css(C(P.line), 0.6); ctx.lineWidth = 0.8;
    for (let i = 0; i < 26; i++) { const x = 780 + r() * 420, y = 345 + r() * 200; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8 + r() * 30, y + (r() - 0.3) * 6); ctx.lineTo(x + 14 + r() * 30, y + 6 + r() * 10); ctx.stroke(); }
    dabs(ctx, r, 300, [760, 330, 1240, 560], (x, y, rr) => jc(C(rr() < 0.4 ? P.rock : P.rockShade), rr, 12), { smin: 2, smax: 7, alpha: 0.4 });
    // mist darkening to the bottom
    const g = ctx.createLinearGradient(0, 360, 0, 520); g.addColorStop(0, 'rgba(60,56,110,0)'); g.addColorStop(1, 'rgba(70,64,120,0.7)'); ctx.fillStyle = g; ctx.fillRect(700, 330, 600, 230);
    ctx.restore();
        // pines behind tower (right)
    pine(ctx, r, 1030, 306, 110, P, { lean: 0.7, pads: 6 });
    // tower
    const tg = TOWER1;
    const T = towerExt(ctx, r, P, tg);
    // windows (static dark) - tier y positions
    for (const w of [[-0.55, 0.12], [0.3, 0.12], [-0.15, 0.44], [0.55, 0.47], [-0.5, 0.75], [0.15, 0.76]]) {
      const th = w[0], y = lerp(tg.top, tg.base, w[1]);
      const x = tg.cx + tg.hw * 0.96 * Math.sin(th);
      archWindow(ctx, x, y, 11, 26, P, Math.cos(th));
    }
    // dome
    drawDome(ctx, r, tg.cx, tg.top, tg.hw * 0.98, P);
    // ivy over the base and up the left side
    const IV = { pineShade: '#121a27', pine: '#1c2b36', pineLit: '#2f4a4d', pineHi: '#557873' };
    for (let i = 0; i < 9; i++) { const yy = tg.base - Math.pow(r(), 1.5) * (tg.base - tg.top) * 0.75; foliage(ctx, r, tg.cx - tg.hw * 0.85 + r() * tg.hw * (0.5 + (tg.base - yy) / 300), yy, 10 + r() * 12, 14 + r() * 18, IV, [-0.55, -0.83], { n: 6 }); }
    for (let i = 0; i < 8; i++) ivy(ctx, r, tg.cx - tg.hw * 0.8 + r() * tg.hw * 0.8, tg.base - r() * 60, 12 + r() * 20, P, { lightAt: (x, y) => T.lightAt(x) * 0.7, size: 2.2, dir: Math.PI / 2 });
    for (let i = 0; i < 10; i++) ivy(ctx, r, 850 + r() * 60, 340 + r() * 40, 30, P, { size: 2.6, lightAt: () => 0.6 });
    // cliff-edge grass tufts
    for (let i = 0; i < 80; i++) { const x = 870 + r() * 190, y = 298 + r() * 6; ctx.strokeStyle = css(C(r() < 0.4 ? P.grassLit : P.grass)); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.3) * 4, y - 3 - r() * 6); ctx.stroke(); }
    // old pine leaning out from the left of the tower
    pine(ctx, r, 862, 318, 140, P, { lean: -1.4, pads: 7 });
    paperize(ctx, 0.12);
  });
}
function drawDome(ctx, r, cx, y, rx, P, open = 0) {
  const ry = rx * 0.82;
  const D = []; for (let i = 0; i <= 24; i++) { const a = Math.PI + (i / 24) * Math.PI; D.push([cx + Math.cos(a) * rx, y + Math.sin(a) * ry]); }
  D.push([cx + rx, y + 3]); D.push([cx - rx, y + 3]);
  cel(ctx, D, {
    base: P.cu, shade: P.cuShade, lv: [-rx * 0.35, -ry * 0.25], hi: P.cuLit, hv: [rx * 0.22, ry * 0.25], line: false,
    inner: (c) => {
      // ribs
      c.strokeStyle = css(C(P.cuShade), 0.7); c.lineWidth = 0.9;
      for (let k = -5; k <= 5; k++) { const ph = (k / 6) * (Math.PI / 2); c.beginPath(); for (let j = 0; j <= 12; j++) { const lat = (j / 12) * (Math.PI / 2); const px = cx + rx * Math.sin(ph) * Math.cos(lat), py = y - ry * Math.sin(lat); j ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); }
      // patina blotches
      dabs(c, r, 120, [cx - rx, y - ry, cx + rx, y], (x, yy, rr) => jc(C(rr() < 0.5 ? P.cuLit : P.cuStreak), rr, 16), { smin: 1, smax: 5, alpha: 0.4 });
      // crack: jagged break near upper right, dark gap
      const cr = [[cx + rx * 0.18, y - ry * 0.95], [cx + rx * 0.3, y - ry * 0.7], [cx + rx * 0.24, y - ry * 0.55], [cx + rx * 0.4, y - ry * 0.35], [cx + rx * 0.36, y - ry * 0.18]];
      c.fillStyle = P.winDark; c.beginPath(); c.moveTo(cr[0][0], cr[0][1]); for (const p of cr) c.lineTo(p[0] + 1.5, p[1]); for (let i = cr.length - 1; i >= 0; i--) c.lineTo(cr[i][0] - 1.2 + (i % 2), cr[i][1]); c.fill();
      c.strokeStyle = css(C(P.cuLit), 0.8); c.lineWidth = 0.6; pth(c, cr.map((p) => [p[0] - 1.6, p[1]]), false); c.stroke();
    },
  });
  // cupola with shutters
  const cw = rx * 0.32, chh = rx * 0.32, cyy = y - ry - chh + 2;
  const Cu = [[cx - cw / 2, cyy + chh, 1], [cx - cw / 2, cyy, 1], [cx + cw / 2, cyy, 1], [cx + cw / 2, cyy + chh, 1]];
  cel(ctx, Cu, { base: P.cu, shade: P.cuShade, lv: [-cw * 0.4, 0], line: false, inner: (c) => { c.fillStyle = css(C(P.cuShade)); for (let i = 0; i < 4; i++) c.fillRect(cx - cw / 2 + 2 + i * (cw - 4) / 4, cyy + 2, (cw - 4) / 4 - 1.5, chh - 4); } });
  const cap = []; for (let i = 0; i <= 10; i++) { const a = Math.PI + (i / 10) * Math.PI; cap.push([cx + Math.cos(a) * cw * 0.62, cyy + Math.sin(a) * cw * 0.5]); }
  cel(ctx, cap, { base: P.cu, shade: P.cuShade, lv: [-cw * 0.3, -cw * 0.1], hi: P.cuLit, hv: [cw * 0.25, cw * 0.2], line: false });
  ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, cyy - cw * 0.5); ctx.lineTo(cx, cyy - cw * 0.5 - 8); ctx.stroke();
  ctx.fillStyle = P.cu; ctx.beginPath(); ctx.arc(cx, cyy - cw * 0.5 - 8, 1.6, 0, TAU); ctx.fill();
}
function s1Near() {
  return layer('s1near', (ctx) => { const r = RNG(105); cloudSea(ctx, r, { ...S1SEA, from: 8, to: 11 }); paperize(ctx, 0.06); });
}

shot(0, 168, (ctx, f) => {
  const t = on(f, 2) / FPS; // most motion on twos
  ctx.drawImage(s1Sky(), 0, 0);
  ctx.drawImage(s1Far(), 0, 0);
  ctx.drawImage(s1Mid(), -f * 0.03, 0);
  // mist behind cliff
  mistBand(ctx, RNG(7), 372, 40, '#8f86c4', 0.3, f * 0.15);
  ctx.drawImage(s1Cliff(), 0, 0);
  // moving lantern light in a window (the fox climbing inside)
  const tg = TOWER1; const th = -0.15, wy = lerp(tg.top, tg.base, 0.44); const wx = tg.cx + tg.hw * 0.96 * Math.sin(th);
  const lp = seg(f, 40, 150);
  if (lp > 0 && lp < 1) {
    const lx = wx - 8 + 16 * lp, ly = wy + 18;
    const vis = Math.sin(Math.PI * lp);
    ctx.save();
    archWindow(ctx, wx, wy, 11, 26, PAL_NIGHT, Math.cos(th), (c) => {
      const g = c.createRadialGradient(lx, ly, 0, lx, ly, 16); g.addColorStop(0, `rgba(255,214,140,${0.95 * vis})`); g.addColorStop(0.5, `rgba(240,150,70,${0.6 * vis})`); g.addColorStop(1, 'rgba(120,60,40,0)');
      c.fillStyle = g; c.fillRect(wx - 10, wy - 10, 20, 40);
    });
    ctx.restore();
    glow(ctx, lx, ly, 22, '#ffb260', 0.35 * vis);
  }
  mistBand(ctx, RNG(8), 430, 50, '#6d65a8', 0.35, f * 0.3);
  ctx.drawImage(s1Near(), -f * 0.06, 0);
  // foreground pampas (on twos, overlapping action)
  const P = PAL_NIGHT;
  const pp = { plume: '#8d86b8', plumeLit: '#d8d3f2', plumeShade: '#3e3966', litSide: 1 };
  pampas(ctx, 0, 11, 70, 552, 9, { ...P, grass: '#1a1730', grassLit: '#4a4670' }, t, { h: 300, spread: 150, wind: 0.9, ...pp });
  pampas(ctx, 0, 12, 200, 560, 5, { ...P, grass: '#171428', grassLit: '#3f3b63' }, t + 0.5, { h: 230, spread: 90, wind: 0.8, ...pp });
  vignette(ctx, 0.5);
  // fade from black: wind first
  fadeBlack(ctx, 1 - easeIO(seg(f, 14, 84)));
});
