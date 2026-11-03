// ===== library interior painters =====
const BOOKCOLS = ['#7a2e2a', '#8e3b2c', '#b08440', '#9a6a34', '#2f6066', '#2a3550', '#5f6a3a', '#6a4630', '#c9b48a', '#5a3550', '#3c5a40', '#a24b3a', '#4b3a2a', '#7b6a4a', '#304a5a', '#8a7a5a', '#6b2a3a', '#a89060'];
function bookColor(r) { let c = C(BOOKCOLS[(r() * BOOKCOLS.length) | 0]); if (r() < 0.3) c = mixc(c, [210, 195, 165], 0.25 + r() * 0.3); return jc(c, r, 18); }

// frontal spine (for close shelves). light: [r,g,b] multiplier 0..1.5, amb dark color
function spine(ctx, r, x, base, w, h, lean, col, light, o = {}) {
  ctx.save(); ctx.translate(x, base); ctx.rotate(lean);
  const lit = (c, k = 1) => css(mixc(o.dark || [10, 10, 25], mulc(c, light), k));
  const top = -h;
  // body
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, top + 2); ctx.quadraticCurveTo(w / 2, top - 1.5, w, top + 2); ctx.lineTo(w, 0); ctx.closePath();
  ctx.fillStyle = lit(col); ctx.fill();
  ctx.save(); ctx.clip();
  // rounded spine shading (painted: lighter on light side)
  const ls = o.lightSide || -1;
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, `rgba(255,240,220,${ls < 0 ? 0.18 : 0})`); g.addColorStop(0.4, 'rgba(255,240,220,0.05)'); g.addColorStop(1, `rgba(0,0,20,${ls < 0 ? 0.35 : 0.05})`);
  ctx.fillStyle = g; ctx.fillRect(0, top - 3, w, h + 3);
  // sun fade at top
  if (r() < 0.45) { const g2 = ctx.createLinearGradient(0, top, 0, top + h * 0.6); g2.addColorStop(0, css(mulc([225, 210, 180], light), 0.45)); g2.addColorStop(1, css(mulc([225, 210, 180], light), 0)); ctx.fillStyle = g2; ctx.fillRect(0, top - 2, w, h); }
  // bands
  const band = mixc(C('#c9a050'), col, 0.35 + r() * 0.3);
  const nb = (r() * 3) | 0;
  for (let i = 0; i < nb; i++) { const yy = top + h * (0.1 + i * 0.07); ctx.fillStyle = lit(band, 0.9); ctx.fillRect(0, yy, w, Math.max(0.8, h * 0.012)); }
  for (let i = 0; i < nb; i++) { const yy = -h * (0.08 + i * 0.06); ctx.fillStyle = lit(band, 0.9); ctx.fillRect(0, yy, w, Math.max(0.8, h * 0.012)); }
  // label
  if (r() < 0.5 && w > 6) { const ly = top + h * (0.25 + r() * 0.15); ctx.fillStyle = lit(r() < 0.5 ? [40, 25, 20] : [200, 180, 140], 0.85); ctx.fillRect(w * 0.18, ly, w * 0.64, h * 0.1); }
  // tiny gilt title marks
  if (w > 7 && r() < 0.7) { ctx.fillStyle = lit([210, 170, 90], 0.7); for (let i = 0; i < 3 + r() * 4; i++) ctx.fillRect(w * 0.35 + (r() - 0.5) * w * 0.2, top + h * (0.3 + i * 0.05), w * 0.3, Math.max(0.6, h * 0.012)); }
  // wear & scuffs
  for (let i = 0; i < 4; i++) { ctx.fillStyle = css(mulc([200, 190, 170], light), 0.12 + r() * 0.12); blob(ctx, r() * w, top + r() * h, 0.5 + r() * w * 0.2, 0.5 + r() * 2, r() * 3, r); ctx.fill(); }
  // moss on old spines
  if (o.moss && r() < o.moss) {
    const mc = mulc(C(r() < 0.5 ? '#5e7a3a' : '#7c8f48'), light);
    const y0 = top + r() * h * 0.5;
    for (let i = 0; i < 18; i++) { ctx.fillStyle = css(jc(mc, r, 20), 0.85); blob(ctx, r() * w, y0 + r() * h * 0.6, 0.6 + r() * w * 0.18, 0.6 + r() * 1.6, r() * 3, r); ctx.fill(); }
  }
  ctx.restore();
  // dark separation edge (painted, not inked)
  ctx.strokeStyle = css(o.dark || [10, 10, 25], 0.55); ctx.lineWidth = Math.max(0.5, w * 0.06);
  ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w, top + 2); ctx.stroke();
  ctx.restore();
}

// fill one frontal shelf run of books between x0..x1 at baseline y with heights about sh
function shelfRun(ctx, r, x0, x1, y, sh, scale, light, o = {}) {
  let x = x0 + r() * 2;
  const items = [];
  while (x < x1) {
    if (r() < 0.04 && x > x0 + 20) { x += sh * (0.15 + r() * 0.3); continue; } // gap
    const w = scale * (5 + r() * 9) * (r() < 0.1 ? 1.8 : 1);
    if (x + w > x1) break;
    const h = sh * (0.62 + r() * 0.34);
    let lean = 0;
    if (r() < 0.08) lean = (r() < 0.5 ? -1 : 1) * (0.08 + r() * 0.25);
    items.push({ x, w, h, lean, col: bookColor(r), seed: (r() * 1e6) | 0 });
    x += w + (lean ? scale * 4 : 0.3);
  }
  for (const b of items) {
    const rr = RNG(b.seed);
    const L = typeof light === 'function' ? light(b.x + b.w / 2, y - b.h / 2) : light;
    // lying (sagging) books stacked occasionally
    spine(ctx, rr, b.x, y, b.w, b.h, b.lean, b.col, L, { moss: o.moss || 0.08, dark: o.dark, lightSide: o.lightSide });
  }
  return items;
}

// wooden shelf board & uprights (frontal)
function shelfBoard(ctx, r, x0, x1, y, th, light, o = {}) {
  const wood = mulc(C('#5a3a26'), light), woodL = mulc(C('#8a6040'), light);
  ctx.fillStyle = css(wood); ctx.fillRect(x0, y, x1 - x0, th);
  ctx.fillStyle = css(woodL, 0.8); ctx.fillRect(x0, y, x1 - x0, Math.max(1, th * 0.18));
  ctx.fillStyle = css([0, 0, 0], 0.35); ctx.fillRect(x0, y + th, x1 - x0, th * 0.9);
  for (let i = 0; i < (x1 - x0) / 25; i++) { ctx.fillStyle = css(woodL, 0.25); ctx.fillRect(x0 + r() * (x1 - x0), y + th * (0.3 + r() * 0.5), 6 + r() * 30, 0.7); }
}

// ---- 3D-projected hall (shots 2, 5e, 6a) ----
function hallCam(o) { return { f: o.f || 700, cx: o.cx || 640, cy: o.cy || 300, pr(X, Y, Z) { return [this.cx + this.f * X / Z, this.cy + this.f * Y / Z]; } }; }
function paintHall(ctx, cam, r, o = {}) {
  const WX = o.wallX || 6, FY = o.floorY || 1.6, ZB = o.backZ || 30, TOP = -30;
  const amb = o.amb || [0.32, 0.36, 0.55];
  const dark = [8, 9, 22];
  const fog = (Z) => clamp((Z - 5) / (ZB - 5)) * 0.75;
  const shaftAt = o.shaftAt || (() => 0);
  // backdrop
  ctx.fillStyle = css(dark); ctx.fillRect(0, 0, W, H);
  // back wall shelves
  const bw0 = cam.pr(-WX, 0, ZB)[0], bw1 = cam.pr(WX, 0, ZB)[0];
  const sc = cam.f / ZB;
  for (let Y = FY; Y > TOP; Y -= 0.9) {
    const y = cam.pr(0, Y, ZB)[1]; if (y < -20) break;
    const lightK = clamp(0.9 + (Y - FY) * 0.04) * (1 - fog(ZB));
    const L = mixc([0, 0, 0], mulc([255, 255, 255], amb), lightK).map((v) => v / 255 * 1.0);
    shelfRun(ctx, r, bw0, bw1, y, 0.82 * sc, sc * 0.012, [L[0], L[1], L[2]].map((v) => v * 255), { dark });
    shelfBoard(ctx, r, bw0, bw1, y, Math.max(1, 0.06 * sc), [L[0] * 255, L[1] * 255, L[2] * 255]);
  }
  // side walls: books as projected quads
  for (const side of [-1, 1]) {
    const X = side * WX;
    for (let Y = FY; Y > TOP; Y -= 0.9) {
      // shelf board line
      const rowLight = clamp(1 + (Y - FY) * 0.045);
      let Z = 4.5 + r() * 0.2;
      while (Z < ZB) {
        // pilaster every 3.2 units
        const zz = Z % 3.2;
        if (zz < 0.18) { Z += 0.18; continue; }
        const t = 0.05 + r() * 0.12 * (r() < 0.1 ? 2 : 1);
        const h = 0.82 * (0.62 + r() * 0.34);
        const a = cam.pr(X, Y, Z), b = cam.pr(X, Y, Z + t), c2 = cam.pr(X, Y - h, Z + t), d = cam.pr(X, Y - h, Z);
        if (Math.max(a[1], b[1]) < -10 || Math.abs(a[0] - b[0]) < 0.25 && r() < 0.5) { Z += t + 0.01; continue; }
        if (a[0] < -50 && b[0] < -50 || a[0] > W + 50 && b[0] > W + 50) { Z += t + 0.01; continue; }
        const col = bookColor(r);
        const lk = rowLight * (1 - fog(Z)) + shaftAt(X, Y - h / 2, Z) * 1.2;
        const lit = mixc(dark, mulc(col, [amb[0] * 255 * 1.4, amb[1] * 255 * 1.4, amb[2] * 255 * 1.4].map((v) => Math.min(255, v + shaftAt(X, Y - h / 2, Z) * 200))), clamp(lk, 0, 1.4));
        const lean = r() < 0.07 ? (r() - 0.5) * 0.25 : 0;
        const lx = (c2[1] - a[1]) * lean;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c2[0] + lx, c2[1]); ctx.lineTo(d[0] + lx, d[1]); ctx.closePath();
        ctx.fillStyle = css(lit); ctx.fill();
        // top fade / band
        if (r() < 0.5) { const m1 = [lerp(d[0], a[0], 0.12) + lx * 0.9, lerp(d[1], a[1], 0.12)], m2 = [lerp(c2[0], b[0], 0.12) + lx * 0.9, lerp(c2[1], b[1], 0.12)]; ctx.strokeStyle = css(mixc(lit, [220, 190, 120], 0.35), 0.8); ctx.lineWidth = Math.max(0.5, (a[1] - d[1]) * 0.02); ctx.beginPath(); ctx.moveTo(m1[0], m1[1]); ctx.lineTo(m2[0], m2[1]); ctx.stroke(); }
        if (r() < 0.08) { ctx.fillStyle = css(mixc(lit, [100, 140, 60], 0.6), 0.8); const mx = lerp(a[0], b[0], 0.5), my = lerp(a[1], d[1], r()); blob(ctx, mx, my, Math.abs(a[0] - b[0]) * 0.6 + 0.5, (a[1] - d[1]) * 0.1, 1.5, r); ctx.fill(); }
        // separation
        ctx.strokeStyle = css(dark, 0.5); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(c2[0] + lx, c2[1]); ctx.stroke();
        Z += t + 0.004;
      }
      // board: line from near to back
      const n0 = cam.pr(X, Y + 0.02, 4.5), n1 = cam.pr(X, Y + 0.02, ZB);
      const n2 = cam.pr(X, Y + 0.09, ZB), n3 = cam.pr(X, Y + 0.09, 4.5);
      const bl = mixc(dark, mulc(C('#6a4630'), [amb[0] * 300, amb[1] * 300, amb[2] * 300].map((v) => v)), rowLight * 0.8);
      ctx.beginPath(); ctx.moveTo(n0[0], n0[1]); ctx.lineTo(n1[0], n1[1]); ctx.lineTo(n2[0], n2[1]); ctx.lineTo(n3[0], n3[1]); ctx.fillStyle = css(bl); ctx.fill();
      ctx.strokeStyle = css(mixc(bl, [200, 170, 130], 0.25), 0.8); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(n0[0], n0[1]); ctx.lineTo(n1[0], n1[1]); ctx.stroke();
    }
    // pilasters (stone columns between bookcases)
    for (let Z = 6.4; Z < ZB; Z += 3.2) {
      const a = cam.pr(X, FY, Z), b = cam.pr(X, FY, Z + 0.18), c2 = cam.pr(X, TOP, Z + 0.18), d = cam.pr(X, TOP, Z);
      const k = 1 - fog(Z);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(d[0], d[1]); ctx.fillStyle = css(mixc(dark, [70, 72, 110], k)); ctx.fill();
    }
  }
  // floor: stone flags in perspective
  const fl0 = cam.pr(0, FY, ZB)[1];
  ctx.fillStyle = css([30, 32, 58]); ctx.fillRect(0, fl0, W, H - fl0);
  for (let Z = 2.5; Z < ZB; Z += 1.1) {
    for (let X = -WX + ((Z * 7) % 1.3); X < WX; X += 1.3 + r() * 0.5) {
      const z2 = Z + 1.1, x2 = X + 1.3;
      const p = [cam.pr(X + 0.03, FY, Z + 0.03), cam.pr(x2 - 0.03, FY, Z + 0.03), cam.pr(x2 - 0.03, FY, z2 - 0.03), cam.pr(X + 0.03, FY, z2 - 0.03)];
      const k = (1 - fog(Z)) * (0.55 + r() * 0.3) + shaftAt(X + 0.6, FY, Z + 0.5) * 1.2;
      ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (const q of p) ctx.lineTo(q[0], q[1]); ctx.closePath();
      ctx.fillStyle = css(mixc([14, 15, 32], mulc([110, 112, 150], [255 * amb[0] * 2, 255 * amb[1] * 2, 255 * amb[2] * 2].map((v) => Math.min(255, v))), clamp(k, 0, 1.5))); ctx.fill();
      if (r() < 0.25) { ctx.fillStyle = css([60, 80, 50], 0.4 * (1 - fog(Z))); ctx.fillRect(p[0][0], p[0][1] - 1, p[1][0] - p[0][0], 1.2); }
    }
  }
  // fog toward the back + darkness climbing up
  const vg = ctx.createLinearGradient(0, 0, 0, cam.cy + 60);
  vg.addColorStop(0, css(dark, 0.97)); vg.addColorStop(0.45, css(dark, 0.7)); vg.addColorStop(1, css(dark, 0));
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, cam.cy + 60);
  const bg = ctx.createRadialGradient(cam.cx, cam.cy + 40, 10, cam.cx, cam.cy + 40, 260);
  bg.addColorStop(0, 'rgba(40,46,90,0.55)'); bg.addColorStop(1, 'rgba(40,46,90,0)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
}
