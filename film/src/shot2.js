// ===== SHOT 2: The Reading Hall (0:07-0:14) =====
const S2CAM = hallCam({ f: 700, cx: 640, cy: 350 });
const S2SHAFT = { top: [5.8, -14, 13.5], bot: [-0.9, 1.0, 8.6], w: 1.3 };
function shaftPoly(cam, sh) {
  const t = sh.top, b = sh.bot, w = sh.w;
  const pts = [cam.pr(t[0], t[1], t[2] - w), cam.pr(t[0], t[1], t[2] + w), cam.pr(b[0] + w * 0.8, b[1], b[2] + w), cam.pr(b[0] - w * 0.8, b[1], b[2] + w), cam.pr(b[0] - w * 0.8, b[1], b[2] - w), cam.pr(b[0] + w * 0.8, b[1], b[2] - w)];
  return pts;
}
function shaftAt3(sh) {
  const t = sh.top, b = sh.bot; const d = [b[0] - t[0], b[1] - t[1], b[2] - t[2]]; const L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  return (X, Y, Z) => { const v = [X - t[0], Y - t[1], Z - t[2]]; const u = clamp((v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / L2); const q = [t[0] + d[0] * u - X, t[1] + d[1] * u - Y, t[2] + d[2] * u - Z]; const dist = Math.hypot(q[0], q[1], q[2]); return clamp(1 - dist / (sh.w * 2.2)) * 0.9; };
}
function s2BG() {
  return layer('s2bg', (ctx) => {
    const r = RNG(201);
    paintHall(ctx, S2CAM, r, { shaftAt: shaftAt3(S2SHAFT), amb: [0.3, 0.33, 0.52], floorY: 1.0 });
    // moon patch on floor
    const b = S2SHAFT.bot, w = S2SHAFT.w;
    const fp = [S2CAM.pr(b[0] - w * 1.0, 1.0, b[2] - w * 1.1), S2CAM.pr(b[0] + w * 1.0, 1.0, b[2] - w * 1.1), S2CAM.pr(b[0] + w * 0.9, 1.0, b[2] + w * 1.2), S2CAM.pr(b[0] - w * 0.9, 1.0, b[2] + w * 1.2)];
    ctx.save(); ctx.filter = 'blur(3px)'; ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.moveTo(fp[0][0], fp[0][1]); for (const p of fp) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fillStyle = 'rgba(120,135,190,0.45)'; ctx.fill();
    // window mullion shadow cross in the patch
    ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = 'rgba(25,28,60,0.55)'; ctx.lineWidth = 4;
    const m1 = [lerp(fp[0][0], fp[1][0], 0.5), lerp(fp[0][1], fp[1][1], 0.5)], m2 = [lerp(fp[3][0], fp[2][0], 0.5), lerp(fp[3][1], fp[2][1], 0.5)];
    ctx.beginPath(); ctx.moveTo(m1[0], m1[1]); ctx.lineTo(m2[0], m2[1]); ctx.stroke();
    ctx.restore();
    // props: stacks of fallen books on the floor, a rolling ladder on the right wall
    const prop = (X, Z, n) => { for (let i = 0; i < n; i++) { const p = S2CAM.pr(X + (r() - 0.5) * 0.1, 1.0 - i * 0.09, Z); const sc = 700 / Z; ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate((r() - 0.5) * 0.12); const col = bookColor(r); ctx.fillStyle = css(mulc(col, [90, 100, 150])); ctx.fillRect(-0.35 * sc, -0.09 * sc, 0.7 * sc, 0.09 * sc); ctx.fillStyle = css(mulc([220, 210, 180], [80, 90, 140]), 0.9); ctx.fillRect(-0.33 * sc, -0.08 * sc, 0.03 * sc, 0.07 * sc); ctx.restore(); } };
    prop(2.6, 7.5, 6); prop(3.4, 9.5, 4); prop(-3.6, 11, 5); prop(1.8, 14, 3);
    // ladder
    ctx.strokeStyle = 'rgba(60,48,60,0.95)'; ctx.lineWidth = 5;
    const l1 = S2CAM.pr(5.3, 1.0, 10.5), l2 = S2CAM.pr(5.9, -12, 11.5), l3 = S2CAM.pr(5.3, 1.0, 11.3), l4 = S2CAM.pr(5.9, -12, 12.3);
    ctx.beginPath(); ctx.moveTo(l1[0], l1[1]); ctx.lineTo(l2[0], l2[1]); ctx.moveTo(l3[0], l3[1]); ctx.lineTo(l4[0], l4[1]); ctx.stroke();
    ctx.lineWidth = 3; for (let k = 0; k < 14; k++) { const u = k / 14; ctx.beginPath(); ctx.moveTo(lerp(l1[0], l2[0], u), lerp(l1[1], l2[1], u)); ctx.lineTo(lerp(l3[0], l4[0], u), lerp(l3[1], l4[1], u)); ctx.stroke(); }
    paperize(ctx, 0.07);
  });
}
function drawShaft(ctx, cam, sh, f, a = 1) {
  const P = shaftPoly(cam, sh);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(10px)';
  const t = cam.pr(...sh.top), b = cam.pr(...sh.bot);
  const g = ctx.createLinearGradient(t[0], t[1], b[0], b[1]);
  g.addColorStop(0, `rgba(150,165,230,${0.32 * a})`); g.addColorStop(0.6, `rgba(120,135,200,${0.2 * a})`); g.addColorStop(1, `rgba(120,135,200,${0.08 * a})`);
  // convex hull-ish ordering
  const hull = convexHull(P);
  ctx.beginPath(); ctx.moveTo(hull[0][0], hull[0][1]); for (const p of hull) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
  ctx.filter = 'none';
  // dust motes drifting in the beam (on twos)
  const r = RNG(77); const k = on(f, 2);
  for (let i = 0; i < 110; i++) {
    const u = r(), v = r(); const sp = 0.3 + r() * 0.6;
    const X = lerp(sh.top[0], sh.bot[0], u) + (v - 0.5) * sh.w * 1.6 + Math.sin(k * 0.02 * sp + i) * 0.15;
    const Y = lerp(sh.top[1], sh.bot[1], u) + ((k * 0.004 * sp + r()) % 1) * 0.6;
    const Z = lerp(sh.top[2], sh.bot[2], u) + (r() - 0.5) * sh.w * 1.6;
    const p = cam.pr(X, Y, Z); const tw = 0.5 + 0.5 * Math.sin(k * 0.15 * sp + i * 3);
    ctx.fillStyle = `rgba(210,220,255,${(0.25 + 0.5 * tw) * a})`; ctx.beginPath(); ctx.arc(p[0], p[1], 0.6 + r() * 1.1, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function convexHull(P) {
  const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function warmLight(ctx, x, y, r, a, f) {
  const fl = 1 + 0.06 * Math.sin(on(f, 2) * 1.7) + 0.04 * Math.sin(on(f, 2) * 0.9 + 1);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * fl);
  g.addColorStop(0, `rgba(255,170,80,${0.42 * a})`); g.addColorStop(0.25, `rgba(230,120,50,${0.22 * a})`); g.addColorStop(0.6, `rgba(150,60,30,${0.08 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
  // floor pool
  ctx.globalCompositeOperation = 'lighter'; const g2 = ctx.createRadialGradient(x, y + 10, 0, x, y + 10, r * 0.6);
  g2.addColorStop(0, `rgba(255,160,80,${0.25 * a})`); g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.translate(x, y + 10); ctx.scale(1, 0.28); ctx.translate(-x, -(y + 10)); ctx.fillStyle = g2; ctx.fillRect(x - r, y + 10 - r, r * 2, r * 2); ctx.restore();
  ctx.restore();
}

// fox performance in shot 2
const S2 = { s: 0.9, gy: 470, x0: -70, x1: 330, walkEnd: 92 };
function s2Fox(f) {
  const ff = on(f, 2);
  const cycleU = 36 / 0.62; // units per cycle
  const walkT = clamp(ff / S2.walkEnd);
  const dist = (S2.x1 - S2.x0) * (walkT < 0.8 ? walkT / 0.9 : 0.8 / 0.9 + (1 - 0.8 / 0.9) * easeOut((walkT - 0.8) / 0.2));
  const x = S2.x0 + dist;
  const ph = (dist / S2.s / cycleU) % 1;
  let p;
  const headUp = { head: [50, -70], hr: -0.55 };
  if (ff < S2.walkEnd) {
    p = poseWalk(ph, { lanternMouth: true, mouth: 0.15 });
    // stride amplitude scaled for trot
    const st = poseWalk(ph, { lanternMouth: true });
    p = st;
  } else {
    const a = poseWalk(ph, { lanternMouth: true });
    const st = poseStand({ lanternMouth: true });
    p = lerpPose(a, st, sstep(seg(ff, S2.walkEnd, S2.walkEnd + 10)));
  }
  // set lantern down (head lowers), release, look up
  const down = sstep(seg(ff, 104, 118)) - sstep(seg(ff, 128, 142));
  const up = sstep(seg(ff, 132, 146));
  p.head = add(lerp2(p.head, [64, -26], down), [0, 0]);
  p.hr = lerp(p.hr || 0, 0.85, down);
  if (up > 0) { p.head = lerp2(p.head, headUp.head, up); p.hr = lerp(p.hr, headUp.hr, up); p.look = up; }
  p.lanternMouth = ff < 124;
  p.mouth = ff >= 122 && ff < 132 ? 0.5 : 0.1;
  p.eye = (ff >= 150 && ff < 156) ? 0.1 : 1;
  p.ear = ff >= 158 && ff < 164 ? -0.25 : 0;
  // body tilts forward while lowering
  p.sho = add(p.sho, [0, down * 3]);
  return { p, x };
}
function lerp2(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; }

shot(168, 336, (ctx, f) => {
  ctx.drawImage(s2BG(), 0, 0);
  drawShaft(ctx, S2CAM, S2SHAFT, f);
  const { p, x } = s2Fox(f);
  // lantern position
  const ff = on(f, 2);
  let lanternPos;
  const placed = [x + 64 * S2.s + 6, S2.gy - 15 * S2.s * 1.2];
  // draw fox first to get the stick end
  const tmp = { x, y: S2.gy, s: S2.s, pal: 'lantern', lv: [-0.2, 0.9], catch: '#ffd8a0' };
  // light pass before fox (lantern lights the floor/shelves)
  const est = ff < 124 ? [x + 62 * S2.s, S2.gy - 40 * S2.s] : placed;
  warmLight(ctx, est[0], est[1] + 10, 260, 1, f);
  // fox shadow on floor
  ctx.save(); ctx.fillStyle = 'rgba(10,8,20,0.45)'; ctx.beginPath(); ctx.ellipse(x + 22 * S2.s, S2.gy + 1, 50 * S2.s, 5, 0, 0, TAU); ctx.fill(); ctx.restore();
  const A = foxSide(ctx, p, tmp);
  if (p.lanternMouth && A.stickEnd) {
    const sway = -0.18 * Math.sin(on(f, 2) * 0.5) * (ff < S2.walkEnd ? 1 : Math.exp(-(ff - S2.walkEnd) / 12));
    lanternPos = A.stickEnd;
    // when lowered, the lantern bottom rests at the floor
    const ls = S2.s * 1.25;
    let ly = lanternPos[1];
    if (ly + 16 * ls > S2.gy) ly = S2.gy - 16 * ls;
    lantern(ctx, lanternPos[0], ly, ls, ly < lanternPos[1] ? 0 : sway, 1);
    lanternGlow(ctx, lanternPos[0], ly + 10 * ls, 60);
  } else {
    const ls = S2.s * 1.25;
    lantern(ctx, placed[0], S2.gy - 16 * ls, ls, 0, 1);
    lanternGlow(ctx, placed[0], S2.gy - 6 * ls, 60);
  }
  vignette(ctx, 0.55, [4, 4, 14]);
});
