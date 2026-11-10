// Hand-modelled monuments placed on their real footprints: Hadrian's Gate, Yivli Minare,
// the Clock Tower, Kesik Minare, Hıdırlık Tower, the Kalekapısı bastion, plus mosques and ruins.
import * as THREE from '../vendor/three-bundle.js';
import { rng, clamp } from './util.js';

const S_AS = 3.2;

export function buildLandmarks(data, ctx) {
  const { tiles, groundY, collide, lin, HONEY } = ctx;
  const MARBLE = lin('#efe9dc'), BRICK = [1, 1, 1], LEAD = lin('#7d8589'), STONE = lin('#d9c8a4');
  const marks = [];

  const frame = (b) => {
    // principal axis of the footprint
    let sxx = 0, szz = 0, sxz = 0;
    for (const p of b.p) { const dx = p[0] - b.cx, dz = p[1] - b.cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
    const a = 0.5 * Math.atan2(2 * sxz, sxx - szz), ax = Math.cos(a), az = Math.sin(a);
    const y = groundY(b.cx, b.cz);
    const M = new THREE.Matrix4().makeRotationY(Math.atan2(-az, ax)).setPosition(b.cx, y, b.cz);
    const put = (mat, geom, x, yy, z, col, su = 1, sv = 1, ry = 0) => {
      if (su !== 1 || sv !== 1) { const uv = geom.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }
      const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, yy, z).premultiply(M);
      tiles.get(mat, b.cx, b.cz).add(geom, m, col);
    };
    const box = (mat, w, h, d, x, yy, z, col) => put(mat, new THREE.BoxGeometry(w, h, d), x, yy + h / 2, z, col, Math.max(w, d) / S_AS, h / S_AS);
    const cyl = (mat, r0, r1, h, x, yy, z, col, seg = 20, ry = 0) => put(mat, new THREE.CylinderGeometry(r1, r0, h, seg), x, yy + h / 2, z, col, (r0 + r1) * Math.PI / S_AS, h / S_AS, ry);
    const W = (x, z) => { const v = new THREE.Vector3(x, 0, z).applyMatrix4(M); return [v.x, v.z]; };
    const rect = (x0, z0, x1, z1) => {
      const c = [W(x0, z0), W(x1, z0), W(x1, z1), W(x0, z1)];
      for (let i = 0; i < 4; i++) collide.add(c[i][0], c[i][1], c[(i + 1) % 4][0], c[(i + 1) % 4][1]);
    };
    return { y, put, box, cyl, rect, W, M };
  };

  const extrudeWalls = (b, h, mat, col, jag = 0, seed = 1) => {
    const p = b.p, n = p.length, r = rng(seed);
    const gy = p.map((v) => groundY(v[0], v[1])), g0 = Math.min(...gy) - 0.6, top = Math.max(...gy) + h;
    const G = tiles.get(mat, b.cx, b.cz);
    let u = 0;
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const cnt = jag ? Math.max(1, Math.round(L / 2.5)) : 1;
      for (let k = 0; k < cnt; k++) {
        const t0 = k / cnt, t1 = (k + 1) / cnt, yy = top - (jag ? r() * jag : 0);
        const A = [a[0] + (c[0] - a[0]) * t0, a[1] + (c[1] - a[1]) * t0], C = [a[0] + (c[0] - a[0]) * t1, a[1] + (c[1] - a[1]) * t1];
        G.quad([C[0], g0, C[1]], [A[0], g0, A[1]], [A[0], yy, A[1]], [C[0], yy, C[1]], [u + L / cnt / S_AS, g0 / S_AS, u, yy / S_AS], col);
        if (jag) G.quad([A[0], g0, A[1]], [C[0], g0, C[1]], [C[0], yy, C[1]], [A[0], yy, A[1]], [u, g0 / S_AS, u + L / cnt / S_AS, yy / S_AS], [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8]);
        u += L / cnt / S_AS;
      }
      if (b.e[i]) collide.add(a[0], a[1], c[0], c[1]);
    }
    return top;
  };

  const minaret = (f, x, z, h, col) => {
    f.box('ashlar', 1.9, 3.2, 1.9, x, 0, z, col);
    f.cyl('ashlar', 0.85, 0.72, h * 0.62, x, 3.2, z, col, 16);
    f.cyl('ashlar', 0.8, 1.3, 0.5, x, 3.2 + h * 0.62, z, col, 16);
    f.cyl('ashlar', 1.3, 1.3, 0.85, x, 3.7 + h * 0.62, z, col, 16);
    f.cyl('ashlar', 0.62, 0.58, h * 0.2, x, 4.55 + h * 0.62, z, col, 16);
    f.cyl('lead', 0.72, 0.02, h * 0.18, x, 4.55 + h * 0.82, z, LEAD, 16);
  };

  for (const b of data.buildings) {
    if (!b.k) continue;
    const f = frame(b);
    if (b.k === 'hadrian') {
      // ---- Hadrian's Gate (130 AD): three coffered arches in white marble between two towers ----
      const aw = 4.1, pier = 1.25, endp = 1.2, Wd = 3 * aw + 2 * pier + 2 * endp, depth = 4.6, wallH = 7.1, spring = 3.7;
      const sh = new THREE.Shape();
      sh.moveTo(-Wd / 2, -1.2); sh.lineTo(Wd / 2, -1.2); sh.lineTo(Wd / 2, wallH); sh.lineTo(-Wd / 2, wallH); sh.closePath();
      const xs = [-(aw + pier), 0, aw + pier];
      for (const cx of xs) {
        const h = new THREE.Path();
        h.moveTo(cx - aw / 2, -1.2); h.lineTo(cx - aw / 2, spring);
        h.absarc(cx, spring, aw / 2, Math.PI, 0, true);
        h.lineTo(cx + aw / 2, -1.2); h.closePath();
        sh.holes.push(h);
      }
      const eg = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 20 });
      eg.translate(0, 0, -depth / 2);
      f.put('ashlar', eg, 0, 0, 0, MARBLE, 1 / S_AS, 1 / S_AS);
      f.box('ashlar', Wd + 0.5, 0.35, depth + 0.5, 0, wallH, 0, MARBLE);
      f.box('ashlar', Wd + 0.9, 0.5, depth + 0.9, 0, wallH + 0.35, 0, MARBLE);
      f.box('ashlar', Wd + 0.3, 0.9, depth + 0.2, 0, wallH + 0.85, 0, MARBLE);
      const cxs = [-(1.5 * aw + pier + endp / 2), -(aw / 2 + pier / 2), aw / 2 + pier / 2, 1.5 * aw + pier + endp / 2];
      for (const s of [-1, 1]) for (const cx of cxs) {
        const z = s * (depth / 2 + 0.75);
        f.box('ashlar', 1.15, 1.7, 1.15, cx, -0.1, z, MARBLE);
        f.cyl('ashlar', 0.36, 0.31, 4.3, cx, 1.6, z, lin('#dcd6cb'), 18);
        f.box('ashlar', 0.85, 0.5, 0.85, cx, 5.9, z, MARBLE);
        f.box('ashlar', 1.25, 0.75, 1.5, cx, 6.4, z * 0.93, MARBLE);
      }
      for (const cx of [-(aw + pier) / 2 - 0.0, (aw + pier) / 2]) f.rect(cx - pier / 2, -depth / 2, cx + pier / 2, depth / 2);
      f.rect(-Wd / 2, -depth / 2, -Wd / 2 + endp, depth / 2); f.rect(Wd / 2 - endp, -depth / 2, Wd / 2, depth / 2);
      // flanking towers
      for (const [s, h] of [[-1, 14], [1, 12]]) {
        const tx = s * (Wd / 2 + 3.9);
        f.box('ashlar', 7.6, h + 2, 7.6, tx, -2, 0.6, HONEY);
        for (let k = 0; k < 4; k++) for (const zz of [-3.4, 4.6]) f.box('ashlar', 1.0, 0.9, 0.6, tx - 2.85 + k * 1.9, h, zz, HONEY);
        f.rect(tx - 3.8, -3.2, tx + 3.8, 4.4);
      }
    } else if (b.k === 'yivli') {
      // ---- Yivli Minare (13th c.): eight brick flutes on a stone plinth ----
      f.box('ashlar', 5.4, 7, 5.4, 0, -0.5, 0, HONEY);
      f.cyl('ashlar', 2.9, 2.2, 2.2, 0, 6.5, 0, HONEY, 8, Math.PI / 8);
      f.cyl('brick', 1.55, 1.45, 20, 0, 8.7, 0, BRICK, 16);
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * 6.283;
        f.cyl('brick', 0.78, 0.72, 20, Math.cos(a) * 1.42, 8.7, Math.sin(a) * 1.42, BRICK, 12);
      }
      f.cyl('brick', 2.05, 2.2, 0.4, 0, 8.7, 0, lin('#3f8f96'), 16);
      f.cyl('ashlar', 2.0, 2.7, 0.7, 0, 28.7, 0, HONEY, 20);
      f.cyl('ashlar', 2.7, 2.7, 1.0, 0, 29.4, 0, HONEY, 20);
      f.cyl('brick', 1.3, 1.2, 5.2, 0, 30.4, 0, BRICK, 16);
      f.cyl('lead', 1.4, 0.03, 3.6, 0, 35.6, 0, LEAD, 16);
      f.rect(-2.7, -2.7, 2.7, 2.7);
    } else if (b.k === 'saat') {
      // ---- Saat Kulesi: clock stage raised on a pentagonal bastion of the old walls ----
      f.cyl('ashlar', 4.9, 4.4, 8, 0, -1, 0, HONEY, 5);
      for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; f.box('ashlar', 0.9, 0.8, 0.5, Math.cos(a) * 3.7, 7, Math.sin(a) * 3.7, HONEY); }
      f.box('ashlar', 3.3, 6.2, 3.3, 0, 7, 0, STONE);
      f.box('ashlar', 3.8, 0.35, 3.8, 0, 13.2, 0, STONE);
      for (let k = 0; k < 4; k++) {
        const g = new THREE.PlaneGeometry(1.9, 1.9);
        f.put('clock', g, Math.sin(k * Math.PI / 2) * 1.67, 11.3, Math.cos(k * Math.PI / 2) * 1.67, [1, 1, 1], 1, 1, k * Math.PI / 2);
      }
      f.cyl('lead', 2.3, 0.05, 1.5, 0, 13.55, 0, LEAD, 4, Math.PI / 4);
      f.rect(-4.2, -4.2, 4.2, 4.2);
    } else if (b.k === 'kesik') {
      // ---- Kesik Minare: the "broken minaret", its cap lost to fire ----
      f.box('ashlar', 3.2, 4.5, 3.2, 0, -0.5, 0, HONEY);
      f.cyl('ashlar', 1.5, 1.32, 10.5, 0, 4, 0, STONE, 18);
      f.cyl('ashlar', 1.35, 2.0, 0.6, 0, 14.5, 0, STONE, 18);
      f.cyl('ashlar', 2.0, 1.9, 0.5, 0, 15.1, 0, STONE, 18);
      f.cyl('ashlar', 1.15, 1.0, 1.6, 0, 15.6, 0, STONE, 9);
      f.rect(-1.6, -1.6, 1.6, 1.6);
    } else if (b.k === 'hidirlik') {
      // ---- Hıdırlık Kulesi: Roman drum on a square podium above the cliffs ----
      f.box('ashlar', 13.5, 8, 13.5, 0, -1.5, 0, HONEY);
      f.cyl('ashlar', 6.3, 6.3, 7.2, 0, 6.5, 0, HONEY, 40);
      f.cyl('ashlar', 6.55, 6.55, 0.5, 0, 13.7, 0, STONE, 40);
      f.rect(-6.75, -6.75, 6.75, 6.75);
    } else if (b.k === 'burc') {
      const top = extrudeWalls(b, 12, 'ashlar', HONEY);
      tiles.get('ashlar', b.cx, b.cz).cap(b.p, top, S_AS, HONEY);
    } else if (b.k === 'mosque') {
      const col = b.o ? lin('#e8dcc0') : lin('#ded6c6');
      const top = extrudeWalls(b, 7, 'ashlar', col);
      tiles.get('ashlar', b.cx, b.cz).cap(b.p, top, S_AS, col);
      const area = Math.abs(THREE.ShapeUtils.area(b.p.map((v) => new THREE.Vector2(v[0], v[1]))));
      const R = clamp(Math.sqrt(area) * 0.3, 2.5, 7.5), yy = top - f.y;
      f.cyl('ashlar', R * 1.05, R * 1.05, 1.3, 0, yy, 0, col, 12);
      const dome = new THREE.SphereGeometry(R, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      f.put('lead', dome, 0, yy + 1.3, 0, LEAD);
      f.cyl('lead', 0.12, 0.02, 1.6, 0, yy + 1.3 + R, 0, lin('#c9a24a'), 6);
      // minaret at the corner farthest from the centre
      let far = b.p[0], fd = 0;
      for (const p of b.p) { const d = Math.hypot(p[0] - b.cx, p[1] - b.cz); if (d > fd) { fd = d; far = p; } }
      const v = new THREE.Vector3(far[0] + (b.cx - far[0]) * 0.12, 0, far[1] + (b.cz - far[1]) * 0.12).applyMatrix4(f.M.clone().invert());
      minaret(f, v.x, v.z, 21, lin('#e9e2d2'));
    } else if (b.k === 'ruin') {
      extrudeWalls(b, 6.5, 'ashlar', HONEY, 3.2, 77);
    }
  }
  for (const m of data.marks) marks.push({ ...m, y: groundY(m.x, m.z) });
  return marks;
}
