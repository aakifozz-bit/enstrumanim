// ===== SHOT 3: The Fox (0:14-0:18) close-up =====
function warmShelvesBG(key, seed, blur, dim) {
  return layer(key, (ctx) => {
    const r = RNG(seed);
    ctx.fillStyle = '#0c0b18'; ctx.fillRect(0, 0, W, H);
    for (let row = 0; row < 5; row++) {
      const y = 90 + row * 130;
      const light = (x, yy) => { const d = Math.hypot(x - 380, yy - 620) / 700; const k = clamp(1.25 - d) * dim; return [lerp(70, 255, k), lerp(70, 175, k), lerp(110, 110, k)]; };
      shelfRun(ctx, r, -20, W + 20, y, 118, 3.2, light, { dark: [12, 10, 24], moss: 0.12 });
      shelfBoard(ctx, r, -20, W + 20, y, 12, [140 * dim, 100 * dim, 90 * dim]);
    }
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(8,8,20,0.85)'); g.addColorStop(0.6, 'rgba(8,8,20,0.2)'); g.addColorStop(1, 'rgba(8,8,20,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    paperize(ctx, 0.06);
    if (blur) { const c2 = mk(); const x2 = c2.getContext('2d'); x2.filter = `blur(${blur}px)`; x2.drawImage(ctx.canvas, 0, 0); ctx.clearRect(0, 0, W, H); ctx.drawImage(c2, 0, 0); }
  });
}
function motes(ctx, f, seed, n, col, box, a = 1) {
  const r = RNG(seed); const k = on(f, 2);
  for (let i = 0; i < n; i++) {
    const sp = 0.2 + r() * 0.5; const x = box[0] + ((r() * (box[2] - box[0]) + Math.sin(k * 0.03 * sp + i) * 12) % (box[2] - box[0]));
    const y = box[1] + (((r() * (box[3] - box[1]) - k * sp * 0.6) % (box[3] - box[1])) + (box[3] - box[1])) % (box[3] - box[1]);
    const tw = 0.5 + 0.5 * Math.sin(k * 0.2 * sp + i * 2);
    ctx.fillStyle = css(C(col), (0.2 + 0.6 * tw) * a); ctx.beginPath(); ctx.arc(x, y, 0.8 + r() * 1.6, 0, TAU); ctx.fill();
  }
}
shot(336, 432, (ctx, f) => {
  const ff = on(f, 2);
  ctx.drawImage(warmShelvesBG('s3bg', 301, 5, 1), 0, 0);
  warmLight(ctx, 330, 620, 700, 0.9, f);
  // performance
  const p = { pitch: 0.22, lookY: -0.75, lookX: 0.15, tilt: -0.05, yaw: 0.12 };
  p.earL = ff >= 10 && ff < 24 ? (ff < 14 ? 0.5 : 1) : ff >= 24 ? 0.25 : 0;
  p.earR = ff >= 28 && ff < 40 ? (ff < 32 ? 0.5 : 1) : ff >= 40 ? 0.2 : 0;
  if (ff >= 44 && ff < 58) p.sniff = (Math.floor(ff / 2) % 2) ? 1.4 : 0;
  if (ff >= 46 && ff < 58) p.pitch = 0.28;
  // blink with hold on the closed frame
  const bl = ff - 62; p.eyeL = p.eyeR = bl < 0 ? 1 : bl < 2 ? 0.45 : bl < 8 ? 0 : bl < 10 ? 0.45 : 1;
  if (ff >= 76) { p.tilt = -0.13; p.lookX = 0.35; } else if (ff >= 72) { p.tilt = -0.09; p.lookX = 0.25; }
  foxFace(ctx, p, { x: 640, y: 330, s: 2.45, pal: 'lantern', lv: [-0.45, 0.85], rimv: [0.7, -0.7], catch: '#ffd590' });
  motes(ctx, f, 31, 40, '#ffd9a0', [0, 0, W, H], 0.8);
  vignette(ctx, 0.55, [6, 4, 12]);
});
