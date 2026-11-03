// ===== SHOT 8: The Great Bird (0:44-0:52) =====
function tinyTower() {
  return layer('s8tower', (ctx) => {
    const r = RNG(801);
    const cl = spl([[1040, 560, 1], [1070, 470], [1100, 440], [1130, 430, 1], [1180, 430, 1], [1200, 445], [1230, 480], [1260, 560, 1]], true, 4);
    cel(ctx, cl, { base: '#7a5070', shade: '#4e3858', lv: [-8, -4], hi: '#ffcf95', hv: [5, 3], line: false });
    const tw = [[1140, 431, 1], [1140, 372, 1], [1166, 372, 1], [1166, 431, 1]];
    cel(ctx, tw, { base: '#8e5f72', shade: '#5a4062', lv: [-10, 0], hi: '#ffd9a0', hv: [8, 0], line: false });
    const dm = []; for (let i = 0; i <= 12; i++) { const a = Math.PI + (i / 12) * Math.PI; dm.push([1153 + Math.cos(a) * 14, 372 + Math.sin(a) * 12]); }
    cel(ctx, dm, { base: '#6f9a80', shade: '#3a5a5a', lv: [-5, -2], hi: '#e6efb0', hv: [4, 2], line: false });
    pine(ctx, r, 1112, 434, 40, PAL_GOLD, { lean: -1, pads: 4, lv: [-0.9, -0.4] });
  });
}
const S8PATH = [[640, 300], [980, 120], [330, -20], [-600, -260]];
function bez(P, t) { const u = 1 - t; return [u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0], u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1]]; }
function s8BirdState(ff) {
  let x = 640, y = 300, s = 380, rot = -Math.PI / 2, wing = 0.25;
  if (ff < 60) wing = 0.25 + Math.sin(ff * 0.1) * 0.05;
  else if (ff < 76) wing = lerp(0.25, 1, sstep(seg(ff, 60, 72)));
  else if (ff < 84) wing = [1, 0.1, -0.85, -1][Math.min(3, Math.floor((ff - 76) / 2))];
  else if (ff < 100) wing = lerp(-1, 0.15, sstep(seg(ff, 84, 98)));
  else wing = 0.15 + Math.sin((ff - 100) * 0.18) * 0.35;
  if (ff >= 96) {
    const u = easeIn(seg(ff, 96, 192)) * 0.75 + seg(ff, 96, 192) * 0.25;
    const p = bez(S8PATH, u); const p2 = bez(S8PATH, Math.min(1, u + 0.01));
    x = p[0]; y = p[1]; s = lerp(380, 160, u); const ra = Math.atan2(p2[1] - p[1], p2[0] - p[0]); rot = lerp(-Math.PI / 2, ra, sstep(u * 3));
  }
  return { x, y, s, rot, wing };
}
shot(1056, 1248, (ctx, f) => {
  const ff = on(f, 2);
  const [shx, shy] = ff >= 80 && ff < 90 ? shake(f, 5, 13) : [0, 0];
  ctx.save(); ctx.translate(shx, shy);
  ctx.drawImage(goldSky('s8sky', 250), 0, 0);
  sun(ctx, 430, 250, 1);
  ctx.drawImage(goldSeaLayer('s8sea', 802, 0, 11, 370), 0, 0);
  // shockwave from the wingbeat rolling across the cloud sea
  const sw = seg(ff, 82, 150);
  if (sw > 0 && sw < 1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(6px)'; const rx = 100 + 1600 * easeOut(sw); ctx.lineWidth = 10 + 40 * sw; ctx.strokeStyle = `rgba(255,236,200,${0.6 * (1 - sw)})`; ctx.beginPath(); ctx.ellipse(640, 420, rx, rx * 0.12, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
  const st = s8BirdState(ff);
  // trail of light, mist and loose paper along the sweep
  if (ff > 100) {
    const pts = []; for (let k = ff - 70; k <= ff; k += 2) { if (k < 96) continue; pts.push(s8BirdState(k)); }
    if (pts.length > 2) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(10px)';
      ribbon(ctx, pts.map((q) => [q.x + 40, q.y + 10]), (t) => 6 + t * 60, 'rgba(255,220,150,0.35)');
      ctx.filter = 'blur(3px)'; ribbon(ctx, pts.map((q) => [q.x + 40, q.y + 10]), (t) => 1 + t * 10, 'rgba(255,248,220,0.6)');
      ctx.restore();
      const r = RNG(803); for (let i = 0; i < 70; i++) { const q = pts[(r() * pts.length) | 0]; const age = (ff - 96) * 0.3; page(ctx, q.x + (r() - 0.5) * 300, q.y + (r() - 0.2) * 200 + age * r() * 6, 10 + r() * 14, 7 + r() * 9, r() * TAU + ff * 0.1 * (r() - 0.5), r, { flip: Math.cos(ff * 0.3 + i), tint: [255, 228, 190], lw: 0.5 }); }
    }
  }
  // formation: the flock spirals together
  const form = sstep(seg(ff, 0, 58));
  const scatter = (fe, i) => { const a = i * 2.39996 + ff * 0.06; const rr = 140 + (i % 37) * 14; return [640 + Math.cos(a) * rr * 1.8, 260 + Math.sin(a) * rr * 0.7, a + Math.PI / 2]; };
  ctx.save();
  greatBird(ctx, st.x, st.y, st.s, st.rot, st.wing, form, ff, { scatter, tint: [255, 236, 210], rim: true, back: [255, 240, 190], shadeC: [170, 100, 120], smear: ff >= 78 && ff < 82 ? 1 : 0 });
  ctx.restore();
  // shed pages from the wingbeat
  if (ff >= 80) { const r = RNG(804); for (let i = 0; i < 50; i++) { const a = ff - 80; page(ctx, 640 + (r() - 0.5) * 1000 + a * (r() - 0.5) * 4, 260 + r() * 80 + a * a * 0.02 * (1 + r()), 12 + r() * 10, 8 + r() * 6, r() * TAU + a * 0.15, r, { flip: Math.cos(a * 0.3 + i), tint: [255, 228, 190], lw: 0.5 }); } }
  ctx.restore();
  bloom(ctx, mainCanvas, 0.22, 16);
  vignette(ctx, 0.3, [40, 20, 40]);
});
