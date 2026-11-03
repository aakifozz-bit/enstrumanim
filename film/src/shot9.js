// ===== SHOT 9: The Last Page (0:52-1:03) =====
// sitting fox, front view body under the face rig (units = face units)
function foxSitFront(ctx, p, o) {
  const P = FOXPAL[o.pal]; const s = o.s; const LW = (o.lw || 2.2) / s;
  ctx.save(); ctx.translate(o.x, o.y); ctx.scale(s, s);
  const lvU = [o.lv[0] * 7, o.lv[1] * 7]; const rimU = o.rimv ? [o.rimv[0] * 4, o.rimv[1] * 4] : null;
  const opt = (b, sh) => ({ base: b, shade: sh, lv: lvU, line: false, hi: rimU ? P.rim : null, hv: rimU });
  // tail curled around the front at the back
  const tailT = tube([[66, 150], [76, 196], [40, 214], [-10, 216], [-52, 204]], [14, 18, 17, 13, 5], 6, false);
  // haunches & torso
  for (const sd of [-1, 1]) { const hh = spl([[sd * 20, 110], [sd * 62, 120], [sd * 74, 170], [sd * 60, 205], [sd * 24, 206]], true, 5); cel(ctx, hh, opt(P.fur, P.furSh)); ink(ctx, hh, LW, { closed: true, color: P.line, seed: 150 + sd }); }
  const torso = spl([[-40, 60], [-52, 130], [-30, 200], [30, 200], [52, 130], [40, 60]], true, 5); cel(ctx, torso, opt(P.fur, P.furSh)); ink(ctx, torso, LW, { closed: true, color: P.line, seed: 153 });
  // front legs
  const leg = (sd, paw) => {
    const T = tube([[sd * 18, 96], [sd * 19, 155], paw], [11, 8.5, 8], 6, false);
    cel(ctx, T.out, { ...opt(P.fur, P.furSh), inner: (c) => { c.fillStyle = P.dark; c.fillRect(-200, paw[1] - 30, 400, 200); } });
    ink(ctx, T.A, LW, { color: P.line, seed: 160 + sd }); ink(ctx, T.B, LW, { color: P.line, seed: 162 + sd });
    const pw = spl([[paw[0] - 10, paw[1] - 2], [paw[0], paw[1] - 8], [paw[0] + 10, paw[1] - 2], [paw[0] + 9, paw[1] + 6, 1], [paw[0] - 9, paw[1] + 6, 1]], true, 4);
    cel(ctx, pw, { base: P.dark, line: false }); ink(ctx, pw, LW, { closed: true, color: P.line, seed: 164 + sd });
  };
  leg(1, [20, 204]);
  leg(-1, p.paw || [-20, 204]);
  cel(ctx, tailT.out, { ...opt(P.fur, P.furSh), inner: (c) => { const n = tailT.A.length, k0 = Math.floor(n * 0.75); pth(c, tailT.A.slice(k0).concat(tailT.B.slice(k0).reverse())); c.fillStyle = P.cream; c.fill(); c.fillRect(-120, 180, 60, 60); } });
  ink(ctx, tailT.out, LW, { closed: true, color: P.line, seed: 166 });
  ctx.restore();
  foxFace(ctx, p, { ...o, neck: true });
}
function s9BG() {
  return layer('s9bg', (ctx) => {
    ctx.drawImage(goldSky('s9sky', 360), 0, -40);
    ctx.drawImage(goldSeaLayer('s9sea', 901, 0, 9, 380), 0, 30);
    const r = RNG(902); const P = PAL_GOLD;
    // balustrade behind the fox
    const rail = [[-10, 300, 1], [1290, 300, 1], [1290, 330, 1], [-10, 330, 1]];
    cel(ctx, rail, { base: P.stoneMid, shade: P.stoneShade, lv: [-4, -8], line: false }); ctx.fillStyle = P.stoneLit; ctx.fillRect(-10, 298, 1300, 4);
    for (let x = 10; x < 1290; x += 48) { const b = spl([[x - 10, 330], [x - 14, 350], [x - 9, 368], [x - 13, 388], [x + 13, 388], [x + 9, 368], [x + 14, 350], [x + 10, 330]], true, 4); cel(ctx, b, { base: P.stoneMid, shade: P.stoneShade, lv: [-6, 0], line: false }); }
    // balcony floor (stone flags, warm)
    ctx.fillStyle = '#b07a6e'; ctx.fillRect(0, 388, W, 160);
    for (let i = 0; i < 26; i++) { ctx.strokeStyle = 'rgba(90,50,60,0.5)'; ctx.lineWidth = 1.2; const y = 388 + Math.pow(i / 26, 1.6) * 160; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let i = 0; i < 30; i++) { const x = r() * W; ctx.beginPath(); ctx.moveTo(x, 388); ctx.lineTo(640 + (x - 640) * 2.2, 548); ctx.stroke(); }
    dabs(ctx, r, 400, [0, 300, W, H], (x, y, rr) => jc(C(rr() < 0.5 ? '#c99080' : '#8e5a68'), rr, 14), { smin: 2, smax: 10, alpha: 0.25 });
    paperize(ctx, 0.06);
  });
}
function sunbeams(ctx, a = 1) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(14px)';
  for (let i = 0; i < 7; i++) { const x = 120 + i * 180 + hash2(i, 3, 3) * 60; ctx.beginPath(); ctx.moveTo(x - 30, -20); ctx.lineTo(x + 50, -20); ctx.lineTo(x + 330, H); ctx.lineTo(x + 170, H); ctx.closePath(); ctx.fillStyle = `rgba(255,214,150,${0.12 * a})`; ctx.fill(); }
  ctx.restore();
}
function fallingPages(ctx, f, n, seed, tint, box, sz = 14) {
  const r = RNG(seed); const k = on(f, 2);
  for (let i = 0; i < n; i++) {
    const sp = 0.5 + r() * 0.7; const ph = r() * TAU; const x0 = box[0] + r() * (box[2] - box[0]);
    const y = box[1] + ((r() * (box[3] - box[1]) + k * sp * 1.6) % (box[3] - box[1]));
    const x = x0 + Math.sin(k * 0.06 * sp + ph) * 40; const s = sz * (0.6 + r() * 0.8);
    page(ctx, x, y, s, s * 0.72, Math.sin(k * 0.05 + ph) * 1.2, r, { flip: Math.cos(k * 0.12 * sp + ph), tint, lw: 0.5, curl: 0.3 });
  }
}
const S9TITLE = () => once('s9title', () => layoutText('Fable 5.5', 372, 262, 118, { seed: 21, slant: 0.12 }));
const S9SUB = () => once('s9sub', () => { const L = layoutText('Her hikâye boş bir sayfayla başlar.', 0, 0, 34, { seed: 22, slant: 0.1, track: 0.95 }); const x0 = 640 - L.width / 2; L.strokes = L.strokes.map((S) => S.map((p) => [p[0] + x0, p[1] + 440])); return L; });
function pageInsertBG() {
  return layer('s9page', (ctx) => {
    const r = RNG(903);
    ctx.fillStyle = '#efdcb4'; ctx.fillRect(0, 0, W, H);
    dabs(ctx, r, 1400, [0, 0, W, H], (x, y, rr) => jc([238, 222, 186], rr, 12), { smin: 6, smax: 40, alpha: 0.12, ang: 0.1, asp: 0.3 });
    for (let i = 0; i < 900; i++) { ctx.strokeStyle = css(jc([200, 180, 140], r, 30), 0.25); ctx.lineWidth = 0.5; const x = r() * W, y = r() * H; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (r() - 0.5) * 10, y + (r() - 0.5) * 10, x + (r() - 0.5) * 16, y + (r() - 0.5) * 16); ctx.stroke(); }
    for (let i = 0; i < 20; i++) { ctx.fillStyle = css([190, 150, 100], 0.06 + r() * 0.06); blob(ctx, r() * W, r() * H, 20 + r() * 90, 10 + r() * 50, r() * 3, r); ctx.fill(); }
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, 'rgba(255,220,150,0.35)'); g.addColorStop(1, 'rgba(120,70,90,0.25)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // page edge at the right with a soft curl shadow
    const g2 = ctx.createLinearGradient(1180, 0, W, 0); g2.addColorStop(0, 'rgba(120,80,60,0)'); g2.addColorStop(1, 'rgba(120,80,60,0.35)'); ctx.fillStyle = g2; ctx.fillRect(1180, 0, 100, H);
    paperize(ctx, 0.1);
  });
}
shot(1248, 1512, (ctx, f) => {
  const ff = on(f, 2);
  if (ff < 100) {
    ctx.drawImage(s9BG(), 0, 0);
    sunbeams(ctx, 1);
    fallingPages(ctx, f, 26, 911, [255, 232, 200], [0, -40, W, 420], 16);
    // the one page spiralling down to land at the paws
    const lu = seg(ff, 0, 30);
    const pgx = lerp(980, 640, easeOut(lu)) + Math.sin(lu * 9) * 60 * (1 - lu), pgy = lerp(-40, 482, easeIn(lu) * 0.6 + lu * 0.4);
    const landed = lu >= 1;
    // fox
    const p = { tilt: 0.02 };
    const down = sstep(seg(ff, 28, 38)) * (1 - sstep(seg(ff, 50, 56)));
    p.pitch = 0.35 * down; p.lookY = 0.9 * down; p.eyeL = p.eyeR = down > 0.5 ? 0.6 : 1;
    if (ff >= 56) { p.lookX = 0; p.lookY = 0; }
    if (ff >= 60 && ff < 64) { p.eyeL = p.eyeR = 0.1; }
    if (ff >= 30 && ff < 50) p.earL = p.earR = -0.2;
    const raise = sstep(seg(ff, 66, 72)), place = sstep(seg(ff, 74, 80));
    p.paw = lerp2(lerp2([-20, 204], [-30, 168], raise), [-26, 226], place);
    if (ff >= 74) { p.pitch = 0.15; p.lookY = 0.4; }
    // shadow
    ctx.fillStyle = 'rgba(70,30,50,0.35)'; ctx.beginPath(); ctx.ellipse(660, 470, 140, 16, 0, 0, TAU); ctx.fill();
    // landed page (flat, foreshortened) or still falling
    if (landed) { ctx.save(); ctx.translate(640, 486); ctx.scale(1, 0.32); ctx.rotate(0.08); page(ctx, 0, 0, 150, 110, 0, RNG(912), { col: [246, 236, 214], text: false, lw: 1.2 }); ctx.restore(); }
    else page(ctx, pgx, pgy, 40 + lu * 30, 30 + lu * 20, lu * 8, RNG(912), { col: [246, 236, 214], text: false, flip: Math.cos(lu * 14), lw: 1 });
    foxSitFront(ctx, p, { x: 640, y: 196, s: 1.3, pal: 'gold', lv: [-0.6, -0.6], rimv: [0.6, -0.5], lw: 2.0 });
    if (ff >= 80) { const k = seg(ff, 80, 98); ctx.fillStyle = `rgba(20,12,14,${0.85})`; ctx.save(); ctx.translate(640 - 26 * 1.3, 196 + 232 * 1.3); ctx.scale(1, 0.35); ctx.beginPath(); ctx.arc(0, 0, 10 + k * 26, 0, TAU); ctx.fill(); ctx.restore(); }
    vignette(ctx, 0.3, [50, 20, 40]);
  } else {
    // the page: ink blooms from under the paw and writes
    const t = ff - 100;
    ctx.drawImage(pageInsertBG(), 0, 0);
    // soft shadows of pages falling past the sun
    ctx.save(); ctx.filter = 'blur(18px)'; const r = RNG(921); for (let i = 0; i < 4; i++) { ctx.fillStyle = 'rgba(110,70,60,0.12)'; ctx.beginPath(); ctx.ellipse(((r() * W + t * 3) % (W + 200)) - 100, r() * H, 60, 40, r(), 0, TAU); ctx.fill(); } ctx.restore();
    // ink bloom at the start of the stroke
    const bloomU = seg(t, 0, 14);
    if (bloomU > 0) { ctx.save(); ctx.filter = 'blur(1.5px)'; const br = RNG(922); for (let i = 0; i < 16; i++) { const a = br() * TAU, d = br() * 30 * bloomU; ctx.fillStyle = `rgba(20,12,14,${0.25 + br() * 0.3})`; blob(ctx, 392 + Math.cos(a) * d, 168 + Math.sin(a) * d * 0.7, 6 + br() * 18 * bloomU, 5 + br() * 12 * bloomU, a, br); ctx.fill(); } ctx.restore(); }
    writeText(ctx, S9TITLE(), 8, easeIO(seg(t, 8, 56)), 31);
    // hanko press
    if (t >= 66) { const k = t < 68 ? 1.22 : 1; const a = t < 68 ? 0.55 : 1; hanko(ctx, 640, 334, 44 * k, a, 7); }
    writeText(ctx, S9SUB(), 2.4, easeIO(seg(t, 80, 118)), 41);
    // the paw lifting away from the page
    if (t < 12) { const u = easeIn(t / 12); const px = 392 + u * 120, py = 175 + u * 420; ctx.save(); ctx.translate(px, py); ctx.scale(2.2, 2.2); const pw = spl([[-26, -10], [-6, -30], [22, -26], [30, -2], [16, 18, 1], [-20, 18, 1]], true, 5); cel(ctx, pw, { base: '#43262a', shade: '#2a1520', lv: [-6, -6], lw: 2.2, lc: '#2a1416' }); ctx.fillStyle = '#43262a'; ctx.fillRect(-18, 16, 34, 200); ctx.restore(); }
    // tail flicks once across the corner
    if (t >= 124 && t < 136) {
      const k = [0, 1, 2, 1, 0, 0][Math.floor((t - 124) / 2)];
      const tip = [[1330, 70], [1170, 70], [1090, 40]][k];
      const T = tube([[1420, 150], [1360, 90], tip], [22, 26, 6], 6, false);
      cel(ctx, T.out, { base: '#f5813a', shade: '#a34a4e', lv: [-6, 8], line: false, inner: (c) => { const n = T.A.length, k0 = Math.floor(n * 0.7); pth(c, T.A.slice(k0).concat(T.B.slice(k0).reverse())); c.fillStyle = '#fff0d6'; c.fill(); } });
      ink(ctx, T.out, 2.2, { closed: true, color: '#3e1c18', seed: 990 });
    }
    // fade to paper, then black
    const fp = seg(t, 138, 152); if (fp > 0) { ctx.fillStyle = `rgba(246,236,214,${fp})`; ctx.fillRect(0, 0, W, H); }
    const fb = seg(t, 152, 162); if (fb > 0) { ctx.fillStyle = `rgba(0,0,0,${fb})`; ctx.fillRect(0, 0, W, H); }
  }
});
