// Vegetation and harbour dressing: citrus trees, cypresses, date palms, moored boats.
import * as THREE from '../vendor/three-bundle.js';
import { Geo, rng, pointInPoly, lerp } from './util.js';

export function buildProps(data, T, terrain, city, q) {
  const { groundY, coastDist } = terrain;
  const group = new THREE.Group();
  const leafMat = new THREE.MeshStandardMaterial({ map: T.leaves, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.75, vertexColors: true });
  const frondMat = new THREE.MeshStandardMaterial({ map: T.frond, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.7, vertexColors: true });
  const barkMat = new THREE.MeshStandardMaterial({ map: T.dirt.map, normalMap: T.dirt.normalMap, normalScale: new THREE.Vector2(2, 2), roughness: 0.95, vertexColors: true });
  leafMat.shadowSide = frondMat.shadowSide = THREE.DoubleSide;
  const up = new THREE.Vector3(0, 1, 0);

  // ---- crown of alpha cards with normals bent outwards for soft, volumetric shading ----
  const crown = (g, r, cy, rx, ry, count, size, tint) => {
    for (let i = 0; i < count; i++) {
      const a = r() * 6.283, e = Math.acos(r() * 2 - 1), rad = Math.pow(r(), 0.4);
      const dx = Math.sin(e) * Math.cos(a), dy = Math.cos(e), dz = Math.sin(e) * Math.sin(a);
      const cx = dx * rx * rad, cyy = cy + dy * ry * rad, cz = dz * rx * rad;
      const s = size * (0.7 + r() * 0.6);
      const t = new THREE.Vector3(r() - 0.5, (r() - 0.5) * 0.6, r() - 0.5).normalize();
      const n0 = new THREE.Vector3(dx, dy + 0.35, dz).normalize();
      const u = new THREE.Vector3().crossVectors(n0, t).normalize();
      const P = (su, sv) => [cx + (t.x * su + u.x * sv) * s, cyy + (t.y * su + u.y * sv) * s, cz + (t.z * su + u.z * sv) * s];
      const sh = (0.55 + 0.5 * (dy * 0.5 + 0.5)) * (0.8 + r() * 0.3);
      g.quad(P(-0.5, -0.5), P(0.5, -0.5), P(0.5, 0.5), P(-0.5, 0.5), [0, 0, 1, 1], [tint[0] * sh, tint[1] * sh, tint[2] * sh], null, [n0.x, n0.y, n0.z]);
    }
  };
  const trunk = (g, r0, r1, h, col, lean = 0) => {
    const seg = 8, rings = 5;
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a0 = i / seg * 6.283, a1 = (i + 1) / seg * 6.283, t0 = j / rings, t1 = (j + 1) / rings;
      const ra = lerp(r0, r1, t0), rb = lerp(r0, r1, t1), ox0 = lean * t0 * t0, ox1 = lean * t1 * t1;
      const A = [Math.cos(a0) * ra + ox0, t0 * h, Math.sin(a0) * ra], B = [Math.cos(a1) * ra + ox0, t0 * h, Math.sin(a1) * ra];
      const C = [Math.cos(a1) * rb + ox1, t1 * h, Math.sin(a1) * rb], D = [Math.cos(a0) * rb + ox1, t1 * h, Math.sin(a0) * rb];
      g.quad(B, A, D, C, [i / seg * 2, t0 * h / 1.5, (i + 1) / seg * 2, t1 * h / 1.5], col, [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]);
    }
  };

  const kinds = {};
  const def = (name, build, mat) => {
    const r = rng(name.length * 977 + 3), tg = new Geo(), lg = new Geo();
    build(tg, lg, r);
    kinds[name] = { trunk: tg.build(), leaf: lg.build(), mat, list: [] };
  };
  def('citrus', (tg, lg, r) => {
    trunk(tg, 0.16, 0.09, 2.3, [0.42, 0.36, 0.3]);
    crown(lg, r, 3.5, 2.1, 1.7, Math.round(90 * q.foliage), 1.5, [1, 1, 1]);
    // oranges read as warm flecks
    crown(lg, r, 3.4, 2.0, 1.5, 10, 0.5, [2.6, 1.3, 0.2]);
  }, leafMat);
  def('pine', (tg, lg, r) => {
    trunk(tg, 0.26, 0.14, 6.5, [0.4, 0.3, 0.24], 0.9);
    crown(lg, r, 8.2, 4.2, 2.0, Math.round(130 * q.foliage), 2.2, [0.62, 0.8, 0.6]);
  }, leafMat);
  def('cypress', (tg, lg, r) => {
    trunk(tg, 0.2, 0.1, 2, [0.35, 0.3, 0.26]);
    crown(lg, r, 5.6, 0.95, 4.8, Math.round(110 * q.foliage), 1.25, [0.42, 0.62, 0.42]);
  }, leafMat);
  def('palm', (tg, lg, r) => {
    const H = 8.2;
    trunk(tg, 0.3, 0.22, H, [0.5, 0.42, 0.34], 0.5);
    const fronds = 22;
    for (let i = 0; i < fronds; i++) {
      const a = i / fronds * 6.283 + r() * 0.3, el = lerp(1.15, -0.25, Math.pow(r(), 0.8)), L = 3.6 + r() * 1.2, wd = 1.5;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const seg = 5; let d = 0, py = H, ang = el, prev = null;
      for (let s = 0; s <= seg; s++) {
        const P = [0.5 + dir.x * d, py, dir.z * d];
        const l = [P[0] - side.x * wd / 2, P[1], P[2] - side.z * wd / 2], rr = [P[0] + side.x * wd / 2, P[1], P[2] + side.z * wd / 2];
        if (prev) {
          const sh = 0.75 + r() * 0.3;
          lg.quad(prev.rr, rr, l, prev.l, [(s - 1) / seg, 0, s / seg, 1], [sh, sh, sh], null, [dir.x * -Math.sin(ang) * 0.5, 1, dir.z * -Math.sin(ang) * 0.5]);
        }
        prev = { l, rr };
        d += Math.cos(ang) * L / seg; py += Math.sin(ang) * L / seg; ang -= 0.34;
      }
    }
  }, frondMat);

  // ---- placement ----
  const place = (kind, x, z, s, rot) => {
    if (coastDist(x, z) < 3) return;
    kinds[kind].list.push(x, groundY(x, z) - 0.1, z, s, rot);
  };
  const r = rng(4242);
  const ts = city.treeSpots;
  for (let i = 0; i < ts.length; i += 3) {
    const h = ts[i + 2];
    place(h < 0.5 ? 'citrus' : h < 0.68 ? 'cypress' : h < 0.85 ? 'palm' : 'pine', ts[i], ts[i + 1], 0.8 + r() * 0.5, r() * 6.3);
  }
  for (const p of data.parks) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const v of p) { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); z0 = Math.min(z0, v[1]); z1 = Math.max(z1, v[1]); }
    const tries = Math.min(260, Math.round((x1 - x0) * (z1 - z0) / 70));
    for (let i = 0; i < tries; i++) {
      const x = lerp(x0, x1, r()), z = lerp(z0, z1, r());
      if (!pointInPoly(x, z, p) || city.inBuilding(x, z) || city.nearRoad(x, z, 1.0, null)) continue;
      const h = r();
      place(h < 0.45 ? 'pine' : h < 0.7 ? 'palm' : h < 0.85 ? 'cypress' : 'citrus', x, z, 0.85 + r() * 0.5, r() * 6.3);
    }
  }
  for (const road of data.roads) {
    if (road.k !== 'tertiary' && road.k !== 'secondary') continue;
    let acc = 0;
    for (let s = 0; s < road.p.length - 1; s++) {
      const a = road.p[s], c = road.p[s + 1], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 0.1) continue;
      const ex = (c[0] - a[0]) / L, ez = (c[1] - a[1]) / L;
      for (let t = acc; t < L; t += 13) for (const sd of [-1, 1]) {
        const x = a[0] + ex * t + ez * sd * (road.w / 2 + 1.2), z = a[1] + ez * t - ex * sd * (road.w / 2 + 1.2);
        if (!city.inBuilding(x, z) && !city.nearRoad(x, z, 0.3, road) && !city.edges.nearest(x, z, 1.2)) place('palm', x, z, 0.9 + r() * 0.35, r() * 6.3);
      }
      acc = (acc - L) % 13; if (acc < 0) acc += 13;
    }
  }
  for (let x = -420; x < -160; x += 9) for (let z = -170; z < 90; z += 9) {
    const px = x + r() * 6, pz = z + r() * 6, d = coastDist(px, pz);
    if (d > 9 && d < 15 && r() < 0.5 && !city.inBuilding(px, pz) && !city.nearRoad(px, pz, 0.6, null) && !city.edges.nearest(px, pz, 2)) place('palm', px, pz, 0.85 + r() * 0.3, r() * 6.3);
  }

  // instance per map tile so whole groves fall out of the frustum (and the shadow pass) together
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion();
  let treeCount = 0;
  for (const k of Object.values(kinds)) {
    const byTile = new Map();
    for (let o = 0; o < k.list.length; o += 5) {
      const key = Math.floor(k.list[o] / 140) + '|' + Math.floor(k.list[o + 2] / 140);
      if (!byTile.has(key)) byTile.set(key, []);
      byTile.get(key).push(o);
    }
    for (const offs of byTile.values()) {
      const n = offs.length; treeCount += n;
      const tm = new THREE.InstancedMesh(k.trunk, barkMat, n), lm = new THREE.InstancedMesh(k.leaf, k.mat, n);
      offs.forEach((o, i) => {
        const s = k.list[o + 3];
        qt.setFromAxisAngle(up, k.list[o + 4]);
        m4.compose(new THREE.Vector3(k.list[o], k.list[o + 1], k.list[o + 2]), qt, new THREE.Vector3(s, s, s));
        tm.setMatrixAt(i, m4); lm.setMatrixAt(i, m4);
      });
      for (const m of [tm, lm]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); group.add(m); }
    }
  }

  // ---- boats ----
  const hullMat = new THREE.MeshPhysicalMaterial({ roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2, vertexColors: true });
  const deckMat = new THREE.MeshStandardMaterial({ map: T.wood.map, normalMap: T.wood.normalMap, roughness: 0.6, vertexColors: true });
  const boat = (L, Wd, gulet) => {
    const h = new Geo(), d = new Geo();
    const N = 14, sec = (t) => {
      const w = Wd / 2 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.62 + 0.38)), 0.75) * (t > 0.97 ? 0.4 : 1);
      const sheer = 0.95 + Math.pow(t, 3) * 0.55 + Math.pow(1 - t, 3) * 0.2, x = (t - 0.5) * L;
      return [[x, -0.45, 0], [x, -0.3, w * 0.55], [x, 0.25, w * 0.92], [x, sheer, w]];
    };
    const white = [0.93, 0.93, 0.9], stripe = gulet ? [0.45, 0.27, 0.14] : white, body = gulet ? [0.5, 0.3, 0.16] : white;
    for (let i = 0; i < N; i++) {
      const a = sec(i / N), b = sec((i + 1) / N);
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
        const f = (p) => [p[0], p[1], p[2] * s];
        h.quad(f(a[k]), f(b[k]), f(b[k + 1]), f(a[k + 1]), [0, 0, 1, 1], k === 2 ? stripe : k === 0 ? [0.25, 0.08, 0.06] : body, [0, k === 0 ? -1 : 0.2, s]);
      }
      d.quad([a[3][0], a[3][1] - 0.12, -a[3][2]], [a[3][0], a[3][1] - 0.12, a[3][2]], [b[3][0], b[3][1] - 0.12, b[3][2]], [b[3][0], b[3][1] - 0.12, -b[3][2]], [a[3][0] / 2, -a[3][2] / 2, b[3][0] / 2, a[3][2] / 2], [0.75, 0.6, 0.42], [0, 1, 0]);
    }
    const t0 = sec(0);
    h.quad([t0[1][0], t0[1][1], -t0[1][2]], [t0[1][0], t0[1][1], t0[1][2]], [t0[3][0], t0[3][1], t0[3][2]], [t0[3][0], t0[3][1], -t0[3][2]], [0, 0, 1, 1], body, [-1, 0, 0]);
    const cab = gulet ? [L * 0.3, 1.0, Wd * 0.55, -L * 0.12] : [L * 0.28, 0.9, Wd * 0.5, -L * 0.05];
    (gulet ? d : h).box(cab[3], 0.85, 0, [1, 0], cab[0], cab[1], cab[2], gulet ? [0.8, 0.62, 0.42] : white, 1.5, 'u');
    h.box(cab[3], 0.85 + cab[1], 0, [1, 0], cab[0] + 0.3, 0.06, cab[2] + 0.3, white, 1, '');
    const masts = gulet ? [[L * 0.12, 11], [-L * 0.24, 9]] : [[L * 0.1, 3.2]];
    for (const [mx, mh] of masts) {
      d.box(mx, 0.9, 0, [1, 0], 0.16, mh, 0.16, [0.8, 0.62, 0.4], 1.5, 'u');
      if (gulet) { d.box(mx - L * 0.14, 2.4, 0, [1, 0], L * 0.3, 0.12, 0.12, [0.8, 0.62, 0.4], 1.5); h.box(mx - L * 0.14, 2.52, 0, [1, 0], L * 0.28, 0.3, 0.3, [0.9, 0.87, 0.78], 1); }
    }
    return { hull: h.build(), deck: d.build(), list: [] };
  };
  const boats = [boat(7, 2.5, false), boat(17, 5, true), boat(10.5, 3.3, false)];
  const br = rng(909);
  for (const p of data.piers) {
    let acc = 6;
    for (let s = 0; s < p.length - 1; s++) {
      const a = p[s], c = p[s + 1], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 0.5) continue;
      const ex = (c[0] - a[0]) / L, ez = (c[1] - a[1]) / L;
      for (let t = acc; t < L; t += 4.6) for (const sd of [-1, 1]) {
        if (br() < 0.25) continue;
        const kind = br() < 0.7 ? 0 : 2, bl = kind ? 10.5 : 7, off = 2.6 + bl / 2;
        const x = a[0] + ex * t + ez * sd * off, z = a[1] + ez * t - ex * sd * off;
        if (coastDist(x, z) < -3) boats[kind].list.push(x, z, Math.atan2(ex * sd, ez * sd) + (br() - 0.5) * 0.08, br() * 6.3);
      }
      acc = 2.3;
    }
  }
  for (let i = 0; i < 400; i++) {
    const x = lerp(-410, -170, br()), z = lerp(-140, 70, br()), d = coastDist(x, z);
    if (d > -6 || d < -14) continue;
    // moor stern-to along the quay: point away from the nearest shore
    const gx = coastDist(x + 2, z) - coastDist(x - 2, z), gz = coastDist(x, z + 2) - coastDist(x, z - 2), gl = Math.hypot(gx, gz) || 1;
    const kind = br() < 0.45 ? 1 : 2, need = kind === 1 ? 11 : 7;
    if (-d < need * 0.75) continue;
    let ok = true;
    for (const b of boats) for (let k = 0; k < b.list.length; k += 4) if (Math.hypot(b.list[k] - x, b.list[k + 1] - z) < 6.5) ok = false;
    if (ok) boats[kind].list.push(x, z, Math.atan2(gz / gl, -gx / gl), br() * 6.3);
  }
  const boatMeshes = [];
  for (const b of boats) {
    const n = b.list.length / 4; if (!n) continue;
    const hm = new THREE.InstancedMesh(b.hull, hullMat, n), dm = new THREE.InstancedMesh(b.deck, deckMat, n);
    hm.castShadow = dm.castShadow = true; hm.receiveShadow = dm.receiveShadow = true;
    hm.frustumCulled = dm.frustumCulled = false;
    const tc = new THREE.Color(), pal = [0xffffff, 0xffffff, 0xf3ead6, 0xbcd3e4, 0x9fc0b6, 0xe8c9a0];
    for (let i = 0; i < n; i++) hm.setColorAt(i, tc.set(b === boats[1] ? 0xffffff : pal[(br() * pal.length) | 0]));
    group.add(hm, dm); boatMeshes.push({ hm, dm, list: b.list, n });
  }
  const eul = new THREE.Euler(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const update = (time) => {
    for (const b of boatMeshes) {
      for (let i = 0; i < b.n; i++) {
        const o = i * 4, ph = b.list[o + 3];
        eul.set(Math.sin(time * 0.9 + ph) * 0.035, b.list[o + 2], Math.sin(time * 0.6 + ph * 1.7) * 0.02, 'YXZ');
        pos.set(b.list[o], 0.02 + Math.sin(time * 0.8 + ph) * 0.05, b.list[o + 1]);
        m4.compose(pos, qt.setFromEuler(eul), one);
        b.hm.setMatrixAt(i, m4); b.dm.setMatrixAt(i, m4);
      }
      b.hm.instanceMatrix.needsUpdate = b.dm.instanceMatrix.needsUpdate = true;
    }
  };
  update(0);
  return { group, update, stats: { trees: treeCount, boats: boatMeshes.reduce((s, b) => s + b.n, 0) } };
}
