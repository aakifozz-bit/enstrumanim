// ===== SHOT 5: The Library Stirs (0:25-0:32) =====
function shelfWall(key, seed, scale, rows, rowH, light) {
  return layer(key, (ctx) => {
    const r = RNG(seed); ctx.fillStyle = '#0b0b1a'; ctx.fillRect(0, 0, W, H);
    const items = [];
    for (let i = 0; i < rows; i++) {
      const y = rowH * (i + 1) - 6;
      items.push(shelfRun(ctx, r, -20, W + 20, y, rowH * 0.92, scale, light, { dark: [10, 10, 24], moss: 0.15 }));
      shelfBoard(ctx, r, -20, W + 20, y, Math.max(4, scale * 3), [55, 60, 100]);
    }
    paperize(ctx, 0.06);
    _cache[key + 'items'] = items;
  });
}
function dustStreams(ctx, f, seed, n, box, a = 1) {
  const r = RNG(seed); const k = on(f, 2);
  for (let i = 0; i < n; i++) {
    const x = box[0] + r() * (box[2] - box[0]); const y0 = box[1] + r() * 40; const len = 60 + r() * (box[3] - box[1]);
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len); g.addColorStop(0, `rgba(190,190,230,${0.35 * a})`); g.addColorStop(1, 'rgba(190,190,230,0)');
    ctx.fillStyle = g; ctx.fillRect(x + Math.sin(k * 0.1 + i) * 1, y0, 1 + r() * 1.5, len);
    for (let j = 0; j < 6; j++) { const yy = y0 + ((k * (2 + r() * 2) + r() * len) % len); ctx.fillStyle = `rgba(220,220,255,${0.6 * a})`; ctx.fillRect(x + (r() - 0.5) * 4, yy, 1.2, 1.2); }
  }
}
shot(600, 768, (ctx, f) => {
  const ff = on(f, 2);
  const moonL = (x, y) => [38 + (x / W) * 34, 44 + (x / W) * 38, 92 + (x / W) * 30];
  if (ff < 34) {
    // (a) a high shelf: one book trembles
    const [sx, sy] = ff >= 10 ? shake(f, 1.2, 5) : [0, 0];
    ctx.drawImage(shelfWall('s5a', 501, 4.2, 3, 190, moonL), sx * 0.3, sy * 0.3);
    // trembling book (redrawn with offset)
    if (ff >= 10) { const r = RNG(77); ctx.save(); const j = (hash2(f, 3, 9) - 0.5) * 3; ctx.translate(j, (hash2(f, 4, 9) - 0.5) * 1.5); spine(ctx, r, 600, 184, 50, 160, 0.02, C('#7a2e2a'), [55, 62, 115], { dark: [10, 10, 24], moss: 0.6 }); ctx.restore(); }
    else { spine(ctx, RNG(77), 600, 184, 50, 160, 0.02, C('#7a2e2a'), [55, 62, 115], { dark: [10, 10, 24], moss: 0.6 }); }
    if (ff >= 14) dustStreams(ctx, f, 51, 3, [590, 190, 660, 420], seg(ff, 14, 24));
    glow(ctx, 900, 0, 500, '#5060a0', 0.25);
  } else if (ff < 64) {
    // (b) a whole row trembles, dust sifts in streams
    ctx.drawImage(shelfWall('s5b', 502, 2.2, 5, 112, moonL), 0, 0);
    const [sx, sy] = shake(f, 2.2, 6);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 112 * 1 + 2, W, 112); ctx.clip(); ctx.drawImage(_cache.s5b, sx, sy * 0.5); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(0, 112 * 2 + 2, W, 112); ctx.clip(); ctx.drawImage(_cache.s5b, -sx * 0.7, sy * 0.4); ctx.restore();
    dustStreams(ctx, f, 52, 14, [0, 110, W, H], 1);
    glow(ctx, 900, 0, 600, '#5060a0', 0.2);
  } else if (ff < 92) {
    // (c) the lantern flame leans with no wind
    ctx.fillStyle = '#0d0b16'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(warmShelvesBG('s5c', 503, 9, 0.5), 0, -80);
    const lean = sstep(seg(ff, 70, 80));
    ctx.fillStyle = '#1a1214'; ctx.fillRect(0, 430, W, 114);
    warmLight(ctx, 640 + lean * 30, 360, 520, 1, f);
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(640, 436, 140, 18, 0, 0, TAU); ctx.fill(); ctx.restore();
    lantern(ctx, 640, 230, 13.5, 0, 1, lean * 2.2);
    // the flame inside, visible through the paper, bending sideways
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const fx = 640 + lean * 22, fy = 360;
    const g = ctx.createRadialGradient(fx, fy, 2, fx, fy, 50); g.addColorStop(0, 'rgba(255,250,220,0.9)'); g.addColorStop(0.4, 'rgba(255,190,90,0.5)'); g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(640 - 10, 395); ctx.quadraticCurveTo(640 - 16, 360, fx + lean * 30, 320 + lean * 15); ctx.quadraticCurveTo(640 + 18, 362, 640 + 10, 395); ctx.closePath(); ctx.filter = 'blur(6px)'; ctx.fill(); ctx.restore();
  } else if (ff < 130) {
    // (d) the fox flattens its ears
    ctx.drawImage(warmShelvesBG('s5d', 504, 6, 0.75), 0, 0);
    warmLight(ctx, 360, 640, 650, 0.85, f);
    const [sx, sy] = shake(f, 1.5, 8);
    const k = ff < 100 ? 0 : ff < 104 ? 0.45 : 1;
    const p = { earFlat: k, pitch: 0.1 - k * 0.08, lookX: ff < 112 ? -0.5 : 0.5, lookY: -0.4, tilt: 0.04, yaw: -0.1 };
    if (ff >= 118 && ff < 122) { p.eyeL = p.eyeR = 0.5; }
    foxFace(ctx, p, { x: 640 + sx, y: 300 + k * 10 + sy, s: 2.3, pal: 'lantern', lv: [-0.45, 0.85], rimv: [0.6, -0.8], catch: '#ffd590' });
    dustStreams(ctx, f, 53, 6, [0, 0, W, 300], 0.6);
  } else {
    // (e) one beat of total stillness: the wide hall, everything holds
    ctx.drawImage(s2BG(), 0, 0);
    drawShaft(ctx, S2CAM, S2SHAFT, 130 + 600);
    warmLight(ctx, 330 + 64 * 0.9 + 6, 470 - 10, 260, 1, 0);
    foxSide(ctx, poseStand({ head: [50, -70], hr: -0.5, earFlat: 0.8, look: 1 }), { x: 330, y: 470, s: 0.9, pal: 'lantern', lv: [-0.2, 0.9] });
    lantern(ctx, 330 + 64 * 0.9 + 6, 470 - 16 * 1.125, 1.125, 0, 1); lanternGlow(ctx, 330 + 64 * 0.9 + 6, 470 - 7, 60);
  }
  vignette(ctx, 0.55, [4, 4, 14]);
});
