// ===== SHOT 4: The Blank Book (0:18-0:25) =====
// book geometry (screen): left page quad & right page quad
const BK = { L: [[250, 330], [636, 352], [640, 470], [210, 455]], R: [[644, 352], [1030, 330], [1070, 455], [640, 470]] };
function pageMap(q, u, v) { // bilinear
  return [lerp(lerp(q[0][0], q[1][0], u), lerp(q[3][0], q[2][0], u), v), lerp(lerp(q[0][1], q[1][1], u), lerp(q[3][1], q[2][1], u), v)];
}
function s4BG() {
  return layer('s4bg', (ctx) => {
    const r = RNG(401);
    ctx.drawImage(warmShelvesBG('s4shelf', 402, 7, 0.7), 0, -60);
    ctx.fillStyle = 'rgba(10,8,20,0.35)'; ctx.fillRect(0, 0, W, H);
    // lectern
    const lec = [[330, 470], [950, 470], [880, 560], [400, 560]];
    ctx.beginPath(); ctx.moveTo(lec[0][0], lec[0][1]); for (const p of lec) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fillStyle = '#2e1c16'; ctx.fill();
    ctx.fillStyle = '#5a3624'; ctx.fillRect(320, 462, 640, 12);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = css([110, 70, 45], 0.3); ctx.fillRect(330 + r() * 600, 465 + r() * 6, 20 + r() * 80, 0.8); }
    // page block thickness
    ctx.beginPath(); ctx.moveTo(210, 455); ctx.quadraticCurveTo(420, 470, 640, 470); ctx.quadraticCurveTo(860, 470, 1070, 455); ctx.lineTo(1062, 476); ctx.quadraticCurveTo(860, 492, 640, 488); ctx.quadraticCurveTo(420, 492, 216, 476); ctx.closePath();
    ctx.fillStyle = '#c2a676'; ctx.fill();
    ctx.strokeStyle = 'rgba(120,90,60,0.6)'; ctx.lineWidth = 0.6; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(214, 458 + i * 2); ctx.quadraticCurveTo(420, 473 + i * 2, 640, 472 + i * 2); ctx.quadraticCurveTo(860, 473 + i * 2, 1066, 458 + i * 2); ctx.stroke(); }
    // pages (curved, yellowed)
    for (const q of [BK.L, BK.R]) {
      const left = q === BK.L;
      ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]);
      ctx.quadraticCurveTo((q[0][0] + q[1][0]) / 2, q[0][1] - 18, q[1][0], q[1][1]);
      ctx.lineTo(q[2][0], q[2][1]); ctx.quadraticCurveTo((q[2][0] + q[3][0]) / 2, q[3][1] + 8, q[3][0], q[3][1]); ctx.closePath();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#ead7a8'; ctx.fillRect(150, 300, 980, 200);
      // stains, foxing, aging
      for (let i = 0; i < 70; i++) { ctx.fillStyle = css(jc([200, 165, 110], r, 20), 0.12 + r() * 0.12); blob(ctx, lerp(q[0][0], q[1][0], r()), 330 + r() * 140, 3 + r() * 30, 2 + r() * 14, r() * 3, r); ctx.fill(); }
      dabs(ctx, r, 300, [q[3][0], 320, q[2][0] + (left ? 0 : 430), 480], (x, y, rr) => jc([238, 220, 178], rr, 14), { smin: 4, smax: 18, alpha: 0.18, ang: 0.05, asp: 0.3 });
      // gutter shadow
      const g = ctx.createLinearGradient(left ? 640 : 640, 0, left ? 560 : 720, 0);
      g.addColorStop(0, 'rgba(90,55,40,0.55)'); g.addColorStop(1, 'rgba(90,55,40,0)'); ctx.fillStyle = g; ctx.fillRect(left ? 540 : 640, 300, 100, 200);
      // warm lantern light from lower left, cool shadow upper right
      const g2 = ctx.createLinearGradient(200, 470, 1060, 330); g2.addColorStop(0, 'rgba(255,170,90,0.25)'); g2.addColorStop(1, 'rgba(60,60,120,0.25)'); ctx.fillStyle = g2; ctx.fillRect(150, 300, 980, 200);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(70,40,30,0.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(640, 352); ctx.lineTo(640, 470); ctx.stroke();
    paperize(ctx, 0.06);
  });
}
// one-stroke bird sketch in page-local coords (u,v in 0..1 on the right page)
const INKBIRD = [[0.08, 0.62], [0.16, 0.58], [0.24, 0.55], [0.3, 0.5], [0.36, 0.42], [0.38, 0.36], [0.44, 0.33], [0.5, 0.36], [0.47, 0.4], [0.43, 0.42], [0.45, 0.5], [0.5, 0.58], [0.58, 0.6], [0.66, 0.55], [0.6, 0.45], [0.66, 0.3], [0.74, 0.24], [0.7, 0.4], [0.72, 0.52], [0.7, 0.62], [0.6, 0.7], [0.48, 0.72], [0.4, 0.66], [0.34, 0.6], [0.4, 0.58], [0.5, 0.58]];
function inkBird(ctx, upto, lift = 0, shiver = 0, t = 0) {
  const pts = spl(INKBIRD.map((p) => { const q = pageMap(BK.R, 0.0 + p[0] * 1.1, -0.1 + p[1] * 1.15); return [q[0] + (hash2(on(t, 1), p[0] * 100, 3) - 0.5) * shiver, q[1] - lift + (hash2(on(t, 1), p[1] * 100, 5) - 0.5) * shiver]; }), false, 8);
  const n = Math.max(2, Math.floor(pts.length * upto));
  const P = pts.slice(0, n);
  ribbon(ctx, P, (u, i) => { const tt = i / pts.length; return 1.6 + 3.6 * Math.sin(Math.PI * clamp(tt * 1.05)) * (0.7 + 0.3 * vnoise(i * 0.2, 1)) ; }, 'rgba(25,16,20,0.95)');
  // wet ink bead at the tip while drawing
  if (upto < 1) { const e = P[P.length - 1]; ctx.fillStyle = 'rgba(20,12,18,0.9)'; ctx.beginPath(); ctx.arc(e[0], e[1], 3.2, 0, TAU); ctx.fill(); }
  // eye dot
  if (upto >= 1) { const e = pageMap(BK.R, 0.43 * 1.1, -0.1 + 0.37 * 1.15); ctx.fillStyle = 'rgba(20,12,18,0.95)'; ctx.beginPath(); ctx.arc(e[0], e[1] - lift, 2.6, 0, TAU); ctx.fill(); }
}
shot(432, 600, (ctx, f) => {
  const ff = on(f, 2);
  ctx.drawImage(s4BG(), 0, 0);
  warmLight(ctx, 120, 560, 560, 0.7, f);
  // fox timeline: leap in (14-30), land (30-40), stand (40-60), paw raise/place (60-76)
  const S = 2.0, gy = 418;
  let p, x;
  if (ff < 14) { p = null; }
  else if (ff < 30) {
    const u = (ff - 14) / 16; x = lerp(40, 330, easeOut(u)); const y = gy - Math.sin(Math.PI * Math.min(1, u * 1.1)) * 90 + (1 - u) * 160;
    p = poseStand(); p.hip = [-4, -40]; p.sho = [34, -46 - u * 4]; p.fn = [56, -18]; p.ff = [52, -14]; p.hn = [-26, -6]; p.hf = [-32, -10]; p.head = [52, -70]; p.tail = [[-24, -46], [-38, -46], [-52, -44], [-64, -42]];
    if (u > 0.75) { p.fn = [46, 0]; p.ff = [42, -2]; }
    foxSide(ctx, p, { x, y: y, s: S, pal: 'lantern', lv: [-0.6, 0.6] });
    if (u < 0.5) { ctx.save(); ctx.globalAlpha = 0.25; ctx.strokeStyle = '#f5d0a0'; ctx.lineWidth = 3; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(x - 80 - k * 12, y - 40 + k * 10); ctx.lineTo(x - 180 - k * 12, y + 20 + k * 12); ctx.stroke(); } ctx.restore(); }
    p = 'drawn';
  } else {
    x = 330;
    const land = seg(ff, 30, 40);
    p = poseStand({ head: [52, -64] });
    if (land < 1) { const sq = Math.sin(Math.PI * land) * 6; p.hip = [0, -38 + sq]; p.sho = [36, -40 + sq * 1.2]; p.head = [52, -62 + sq]; }
    // look down at the page
    const look = sstep(seg(ff, 40, 50));
    p.head = lerp2(p.head, [56, -56], look); p.hr = 0.35 * look;
    // paw raise and place
    const raise = sstep(seg(ff, 60, 66)) - 0; const place = sstep(seg(ff, 68, 74));
    if (ff >= 60) { p.fn = lerp2(lerp2([43, 0], [56, -16], raise), [62, 0], place); }
    // bird drawing: watch it; follow as it flies
    if (ff >= 150) { const fu = sstep(seg(ff, 150, 166)); p.head = lerp2(p.head, [52, -70], fu); p.hr = lerp(p.hr, -0.6, fu); p.look = fu; }
    if (ff >= 92 && ff < 96) p.eye = 0.1;
    p.ear = ff >= 100 && ff < 130 ? 0.15 : 0;
    p.tail = [[-20, -38], [-31, -30], [-42, -25], [-54, -24]];
  }
  // ink bird (draws from under the paw)
  if (ff >= 92) {
    const upto = easeIO(seg(ff, 92, 128));
    let lift = 0, shiver = 0;
    if (ff >= 128 && ff < 142) shiver = 2.5;
    if (ff >= 142) lift = 0;
    if (ff < 142) inkBird(ctx, upto, lift, shiver, ff);
    else {
      // peeled: the drawing is a paper bird now, lifting off the page
      const u = seg(ff, 142, 168);
      const sx = lerp(820, 1220, easeIn(u)), sy = lerp(400, -40, easeIn(u)) - Math.sin(u * 8) * 10;
      ctx.save(); ctx.globalAlpha = clamp(1 - u * 4); inkBird(ctx, 1, u * 30, 0, ff); ctx.restore();
      // ghost of ink left on the page
      ctx.save(); ctx.globalAlpha = 0.15; inkBird(ctx, 1, 0, 0, ff); ctx.restore();
      paperBird(ctx, sx, sy, 34 - u * 10, (Math.floor(ff / 3) % 2) ? 0.9 : -0.6, -0.6, 4242, { lw: 1.2 });
    }
  }
  if (p && p !== 'drawn') foxSide(ctx, p, { x, y: gy, s: S, pal: 'lantern', lv: [-0.6, 0.6], catch: '#ffd590' });
  // ink bloom under the paw at contact
  if (ff >= 74 && ff < 100) { const k = seg(ff, 74, 96); ctx.fillStyle = `rgba(20,12,18,${0.5 * (1 - k * 0.3)})`; ctx.beginPath(); ctx.ellipse(330 + 62 * S + 18, gy + 6, 6 + k * 14, 2 + k * 4, 0, 0, TAU); ctx.fill(); }
  motes(ctx, f, 41, 30, '#ffd9a0', [0, 0, W, H], 0.6);
  vignette(ctx, 0.5, [6, 4, 12]);
});
