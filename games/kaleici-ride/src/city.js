// Turns the OSM footprints into Kaleiçi: Ottoman town houses with stone ground floors, timber
// bands, cumba bay windows, louvred shutters and hipped clay roofs; garden walls along the lanes;
// bougainvillea, lanterns, kilims; the city walls; and the modern town outside the walls.
import * as THREE from '../vendor/three-bundle.js';
import { BufferGeometryUtils } from '../vendor/three-bundle.js';
import { Tiles, SegGrid, rng, offsetPoly, pointInPoly, distToSeg, clamp, lerp } from './util.js';
import { buildLandmarks } from './landmarks.js';

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const PLASTER = ['#f3eee3', '#f3eee3', '#efe9dc', '#f1ead8', '#ead9b5', '#dcb878', '#e3c3b1', '#cf9d7c', '#c3d0d6', '#eedd9f', '#e9e4da'].map(lin);
const PAINT = ['#4b3121', '#4b3121', '#3c281c', '#5a3a24', '#2f4a34', '#2b5d77', '#6b211b', '#1f6964', '#ded6c2', '#35506e'].map(lin);
const STONEW = lin('#efe6d2'), HONEY = lin('#e6d3ac'), WHITE = [1, 1, 1], WOOD = lin('#5b3d28'), IRON = lin('#141414');
const S_PL = 3.6, S_RB = 2.7, S_AS = 3.2, S_RF = 2.3, S_WD = 1.3;

export function buildCity(data, T, terrain, q) {
  const { groundY, coastDist } = terrain;
  const tiles = new Tiles(120);
  const collide = new SegGrid(10);   // things you can crash into
  const edges = new SegGrid(12);     // every building edge, for proximity tests
  const roadGrid = new SegGrid(16);  // street centre lines
  const lamps = [], treeSpots = [];
  const wins = new Map();            // tile -> { open: [], closed: [] }
  const group = new THREE.Group();

  // ---------- materials ----------
  const pbr = (t, o = {}) => new THREE.MeshStandardMaterial({
    map: t.map, normalMap: t.normalMap, roughnessMap: t.ormMap, aoMap: t.ormMap, roughness: 1, metalness: 0, vertexColors: true, ...o });
  const mats = {
    plaster: pbr(T.plaster, { normalScale: new THREE.Vector2(0.9, 0.9) }),
    rubble: pbr(T.rubble),
    ashlar: pbr(T.ashlar, { normalScale: new THREE.Vector2(1.2, 1.2) }),
    brick: pbr(T.brick),
    roof: pbr(T.roof, { normalScale: new THREE.Vector2(1.6, 1.6) }),
    wood: pbr(T.wood),
    facade: pbr(T.facade, { aoMap: null }),
    kilim: new THREE.MeshStandardMaterial({ map: T.kilim, roughness: 0.95, vertexColors: true, side: THREE.DoubleSide }),
    clock: new THREE.MeshStandardMaterial({ map: T.clock, roughness: 0.6, vertexColors: true }),
    iron: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.7, vertexColors: true }),
    lead: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.75, vertexColors: true }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x33291a, emissive: 0xffb35c, emissiveIntensity: 0.4, roughness: 0.3, vertexColors: true }),
    foliage: new THREE.MeshStandardMaterial({ map: T.bougain, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.8, vertexColors: true }),
  };
  mats.foliage.shadowSide = THREE.DoubleSide;
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1014, roughness: 0.06, metalness: 0.0, emissive: 0xffa54a, emissiveIntensity: 0, envMapIntensity: 0.9 });
  glass.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vLit;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vLit = step(0.62, fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453));
      #else
        vLit = 1.0;
      #endif`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLit;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vLit * (0.6 + 0.4 * vLit);');
  };
  const frameMat = new THREE.MeshStandardMaterial({ map: T.wood.map, normalMap: T.wood.normalMap, roughness: 0.6 });
  const louverMat = new THREE.MeshStandardMaterial({ map: T.louver.map, normalMap: T.louver.normalMap, roughness: 0.62 });

  // ---------- spatial indices ----------
  const B = data.buildings;
  const bcell = 24, bgrid = new Map();
  B.forEach((b, bi) => {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9, cx = 0, cz = 0;
    for (const p of b.p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); cx += p[0]; cz += p[1]; }
    b.bb = [x0, z0, x1, z1]; b.cx = cx / b.p.length; b.cz = cz / b.p.length;
    for (let i = Math.floor(x0 / bcell); i <= Math.floor(x1 / bcell); i++) for (let j = Math.floor(z0 / bcell); j <= Math.floor(z1 / bcell); j++) {
      const k = i * 4096 + j; if (!bgrid.has(k)) bgrid.set(k, []); bgrid.get(k).push(b);
    }
    const n = b.p.length;
    for (let i = 0; i < n; i++) { const a = b.p[i], c = b.p[(i + 1) % n]; edges.add(a[0], a[1], c[0], c[1], b); }
  });
  const inBuilding = (x, z) => {
    const a = bgrid.get(Math.floor(x / bcell) * 4096 + Math.floor(z / bcell));
    if (a) for (const b of a) if (x >= b.bb[0] && x <= b.bb[2] && z >= b.bb[1] && z <= b.bb[3] && pointInPoly(x, z, b.p)) return true;
    return false;
  };
  for (const r of data.roads) for (let i = 0; i < r.p.length - 1; i++) roadGrid.add(r.p[i][0], r.p[i][1], r.p[i + 1][0], r.p[i + 1][1], r);
  const nearRoad = (x, z, pad, skip) => {
    let hit = false;
    roadGrid.query(x, z, 14, (s) => { if (!hit && s.data !== skip && distToSeg(x, z, s.ax, s.az, s.bx, s.bz) < s.data.w / 2 + pad) hit = true; });
    return hit;
  };

  // OSM footprints and street centre lines are each a metre or so off, and Kaleiçi's lanes are
  // barely wider than that. Guarantee a rideable corridor along every mapped street by leaving
  // out the bits of wall collision that poke into it.
  const solid = (ax, az, bx, bz, tag) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.9));
    let run = null;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
      let free = false;
      roadGrid.query(mx, mz, 4, (s) => { if (!free && distToSeg(mx, mz, s.ax, s.az, s.bx, s.bz) < Math.min(1.45, s.data.w / 2 - 0.1)) free = true; });
      if (!free) { if (run === null) run = t0; }
      if ((free || i === n - 1) && run !== null) {
        const te = free ? t0 : t1;
        collide.add(ax + (bx - ax) * run, az + (bz - az) * run, ax + (bx - ax) * te, az + (bz - az) * te, tag);
        run = null;
      }
    }
  };

  const pushWin = (x, y, z, ang, w, h, paint, closed) => {
    const k = Math.floor(x / 120) + '|' + Math.floor(z / 120);
    if (!wins.has(k)) wins.set(k, { open: [], closed: [] });
    wins.get(k)[closed ? 'closed' : 'open'].push(x, y, z, ang, w, h, paint[0], paint[1], paint[2]);
  };

  const bougain = (x, y, z, nx, nz, ex, ez, span, r, tint) => {
    const g = tiles.get('foliage', x, z);
    const nrm = [nx * 0.55, 0.83, nz * 0.55];
    const count = Math.round(span * 16 * q.foliage);
    for (let k = 0; k < count; k++) {
      const s = 0.5 + r() * 0.5, al = (r() - 0.5) * span, drop = Math.pow(r(), 1.7) * 1.9 - 0.45, out = 0.12 + r() * 0.4;
      const cx = x + ex * al + nx * out, cy = y - drop, cz = z + ez * al + nz * out;
      const a = r() * 6.283, tl = (r() - 0.5) * 1.1;
      // card spanned by a tangent-ish vector and a tilted up vector
      const tx = ex * Math.cos(a) + nx * Math.sin(a) * 0.5, tz = ez * Math.cos(a) + nz * Math.sin(a) * 0.5, ty = Math.sin(a) * 0.35;
      const ux = nx * tl, uy = 1 - Math.abs(tl) * 0.4, uz = nz * tl;
      const P = (su, sv) => [cx + tx * su * s + ux * sv * s, cy + ty * su * s + uy * sv * s, cz + tz * su * s + uz * sv * s];
      const sh = 0.75 + r() * 0.35;
      g.quad(P(-0.5, -0.5), P(0.5, -0.5), P(0.5, 0.5), P(-0.5, 0.5), [0, 0, 1, 1], [tint[0] * sh, tint[1] * sh, tint[2] * sh], null, nrm);
    }
  };
  const BOUG = [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1.0, 0.72, 0.9], [1.0, 0.95, 0.55]];

  const lantern = (x, y, z, nx, nz) => {
    const g = tiles.get('iron', x, z), ax = [-nz, nx];
    g.box(x + nx * 0.28, y, z + nz * 0.28, ax, 0.035, 0.035, 0.56, IRON);
    g.box(x + nx * 0.05, y - 0.3, z + nz * 0.05, ax, 0.03, 0.34, 0.03, IRON);
    const lx = x + nx * 0.5, lz = z + nz * 0.5;
    g.box(lx, y - 0.1, lz, ax, 0.24, 0.05, 0.24, IRON);
    g.box(lx, y - 0.46, lz, ax, 0.2, 0.04, 0.2, IRON);
    tiles.get('lamp', x, z).box(lx, y - 0.42, lz, ax, 0.17, 0.32, 0.17, WHITE);
    lamps.push(lx, y - 0.28, lz);
  };

  // =====================================================================================
  // Houses
  // =====================================================================================
  const F0 = 3.15, FH = 2.9;
  B.forEach((b, bi) => {
    if (b.k) return; // landmarks, mosques and ruins are modelled separately
    const p = b.p, n = p.length, r = rng(bi * 7919 + 13);
    const gy = p.map((v) => groundY(v[0], v[1]));
    const gmin = Math.min(...gy), base = Math.max(...gy);
    const floors = b.l;
    const G = (m) => tiles.get(m, b.cx, b.cz);

    if (!b.o) { // ---- modern town: simple but textured, they are only ever a backdrop ----
      const yTop = base + floors * 3.0, tint = PLASTER[(r() * PLASTER.length) | 0];
      let u = 0;
      for (let i = 0; i < n; i++) {
        const a = p[i], c = p[(i + 1) % n], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        const nb = Math.max(1, Math.round(L / 3.2));
        G('facade').quad([c[0], base, c[1]], [a[0], base, a[1]], [a[0], yTop, a[1]], [c[0], yTop, c[1]], [0, 0, nb, floors], tint);
        if (gmin < base - 0.05) G('plaster').quad([c[0], gmin - 0.5, c[1]], [a[0], gmin - 0.5, a[1]], [a[0], base, a[1]], [c[0], base, c[1]], [u, 0, u + L / S_PL, 1], tint);
        u += L / S_PL;
        if (b.e[i]) solid(a[0], a[1], c[0], c[1], 'modern');
      }
      G('plaster').cap(p, yTop, S_PL, [0.42, 0.41, 0.4]);
      return;
    }

    // ---- Kaleiçi house ----
    const yTop = base + F0 + (floors - 1) * FH;
    const tint = PLASTER[(r() * PLASTER.length) | 0], paint = PAINT[(r() * PAINT.length) | 0];
    const stoneG = floors >= 2 ? r() < 0.62 : r() < 0.3;
    const sv = 0.86 + r() * 0.14, stoneTint = [sv, sv * (0.93 + r() * 0.04), sv * (0.8 + r() * 0.1)];
    let longest = -1, longL = 0;
    for (let i = 0; i < n; i++) if (b.e[i]) { const c = p[(i + 1) % n], L = Math.hypot(c[0] - p[i][0], c[1] - p[i][1]); if (L > longL) { longL = L; longest = i; } }
    let u = r() * 5;
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 0.05) continue;
      const ex = (c[0] - a[0]) / L, ez = (c[1] - a[1]) / L, nx = ez, nz = -ex;
      const yF = floors > 1 ? base + F0 : yTop;
      const wq = (m, y0, y1, s, col) => G(m).quad([c[0], y0, c[1]], [a[0], y0, a[1]], [a[0], y1, a[1]], [c[0], y1, c[1]], [u * S_PL / s + L / s, y0 / s, u * S_PL / s, y1 / s], col);
      if (stoneG) wq('rubble', gmin - 0.6, yF, S_RB, stoneTint); else wq('plaster', gmin - 0.6, yF, S_PL, tint);
      if (floors > 1) wq('plaster', yF, yTop, S_PL, tint);
      u += L / S_PL;
      if (!b.e[i]) continue;
      solid(a[0], a[1], c[0], c[1], 'house');
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2, wax = [-ex, -ez];
      const at = (t, off = 0) => [a[0] + ex * t + nx * off, a[1] + ez * t + nz * off];
      const ang = Math.atan2(nx, nz);
      // timber string course between the floors
      if (floors > 1) G('wood').box(mx, yF - 0.09, mz, wax, L + 0.06, 0.18, 0.12, WOOD, S_WD, 'blru');
      // cumba: the projecting timber bay of the upper floor
      let bay = null;
      if (floors >= 2 && L > 5.2 && r() < 0.46) {
        const bw = clamp(L * 0.42, 2.2, 3.4), bd = 0.85, t0 = L * (0.35 + r() * 0.3);
        const top = Math.min(yTop - 0.08, yF + FH), bh = top - yF;
        const [cx, cz] = at(t0, bd / 2);
        bay = [t0 - bw / 2 - 0.5, t0 + bw / 2 + 0.5];
        const bt = [Math.min(1, tint[0] * 1.06), Math.min(1, tint[1] * 1.06), Math.min(1, tint[2] * 1.06)];
        G('plaster').box(cx, yF - 0.12, cz, wax, bw, bh + 0.12, bd, bt, S_PL, 'b');
        const g = G('wood');
        g.box(cx, yF - 0.2, cz, wax, bw + 0.1, 0.14, bd + 0.06, WOOD, S_WD, 'b');
        g.box(cx, top - 0.02, cz, wax, bw + 0.14, 0.1, bd + 0.1, WOOD, S_WD, 'b');
        for (const s of [-1, 1]) {
          const [px, pz] = at(t0 + s * (bw / 2 - 0.04), bd - 0.03);
          g.box(px, yF - 0.1, pz, wax, 0.11, bh + 0.1, 0.11, WOOD, S_WD, 'tu');
          // "eli böğründe" raking struts
          const [w0x, w0z] = at(t0 + s * (bw / 2 - 0.25), 0.02), [w1x, w1z] = at(t0 + s * (bw / 2 - 0.25), bd - 0.05);
          const hw = 0.05, lo = yF - 1.0, hi = yF - 0.2;
          for (const o of [-hw, hw]) {
            const A = [w0x + ex * o, lo, w0z + ez * o], Bq = [w1x + ex * o, hi, w1z + ez * o];
            g.quad(A, Bq, [Bq[0], hi + 0.12, Bq[2]], [A[0], lo + 0.12, A[2]], [0, 0, 1, 0.1], WOOD, [ex * o, 0, ez * o]);
          }
          g.quad([w0x - ex * hw, lo, w0z - ez * hw], [w0x + ex * hw, lo, w0z + ez * hw], [w1x + ex * hw, hi, w1z + ez * hw], [w1x - ex * hw, hi, w1z - ez * hw], [0, 0, 0.1, 1], WOOD, [nx, -1, nz]);
        }
        // little tiled pent roof over the bay
        const [r0x, r0z] = at(t0 - bw / 2 - 0.15, 0), [r1x, r1z] = at(t0 + bw / 2 + 0.15, 0);
        const [f0x, f0z] = at(t0 - bw / 2 - 0.15, bd + 0.22), [f1x, f1z] = at(t0 + bw / 2 + 0.15, bd + 0.22);
        if (top < yTop - 0.4) G('roof').quad([f1x, top + 0.06, f1z], [f0x, top + 0.06, f0z], [r0x, top + 0.5, r0z], [r1x, top + 0.5, r1z], [0, 0, (bw + 0.3) / S_RF, 0.5], WHITE, [nx, 1, nz]);
        const nw = bw > 2.9 ? 3 : 2;
        for (let k = 0; k < nw; k++) {
          const [wx, wz] = at(t0 + ((k + 0.5) / nw - 0.5) * (bw - 0.35), bd);
          pushWin(wx, yF + bh * 0.52, wz, ang, 0.62, Math.min(1.55, bh - 1.1), paint, false);
        }
      }
      // door on the main front
      let door = null;
      if (i === longest && L > 2.4) {
        const t0 = bay && L * 0.5 > bay[0] && L * 0.5 < bay[1] ? Math.max(1.1, bay[0] - 0.4) : L * (0.3 + r() * 0.4);
        const [dx, dz] = at(t0), dy = groundY(dx + nx * 0.4, dz + nz * 0.4) - 0.05;
        door = [t0 - 1.1, t0 + 1.1];
        const gs = G('ashlar'), sc = stoneTint;
        for (const s of [-1, 1]) { const [jx, jz] = at(t0 + s * 0.74); gs.box(jx, dy, jz, wax, 0.22, 2.42, 0.2, sc, S_AS, 'bu'); }
        gs.box(dx, dy + 2.3, dz, wax, 1.9, 0.28, 0.24, sc, S_AS, 'b');
        gs.box(dx + nx * 0.2, dy - 0.1, dz + nz * 0.2, wax, 1.7, 0.24, 0.5, sc, S_AS, 'b');
        const dk = [paint[0] * 0.85, paint[1] * 0.85, paint[2] * 0.85];
        for (const s of [-1, 1]) { const [lx, lz] = at(t0 + s * 0.32, 0.03); G('wood').box(lx, dy + 0.12, lz, wax, 0.62, 2.18, 0.08, dk, 0.9, 'bu'); }
        const [kx, kz] = at(t0 + 0.1, 0.09); G('lead').box(kx, dy + 1.1, kz, wax, 0.05, 0.12, 0.05, lin('#c9a24a'));
        if (r() < 0.55) { const [lx, lz] = at(t0 + 1.15); lantern(lx, dy + 2.75, lz, nx, nz); }
        // flower pots flanking the step
        if (r() < 0.6) {
          const [px, pz] = at(t0 - 1.25, 0.3);
          const py = groundY(px, pz);
          G('brick').box(px, py, pz, wax, 0.36, 0.34, 0.36, lin('#c98a62'));
          bougain(px, py + 1.0, pz, nx * 0.2, nz * 0.2, ex, ez, 0.5, r, r() < 0.5 ? [0.55, 1, 0.5] : BOUG[(r() * 5) | 0]);
        }
      }
      const blocked = (t, w) => (bay && t + w > bay[0] && t - w < bay[1]) || (door && t + w > door[0] && t - w < door[1]);
      // upper-floor windows with open shutters
      for (let f = 1; f < floors; f++) {
        const cnt = Math.floor((L - 0.9) / 2.25);
        for (let k = 0; k < cnt; k++) {
          const t = (k + 0.5) / cnt * L;
          if (bay && f === 1 && blocked(t, 0.9)) continue;
          const [wx, wz] = at(t);
          pushWin(wx, base + F0 + (f - 1) * FH + 1.58, wz, ang, 0.92, 1.5, paint, r() < 0.12);
        }
      }
      // ground floor: fewer, smaller, often shuttered
      const cnt0 = Math.floor((L - 1.6) / 3.3);
      for (let k = 0; k < cnt0; k++) {
        const t = (k + 0.5) / cnt0 * L;
        if (door && blocked(t, 0.8)) continue;
        const [wx, wz] = at(t);
        pushWin(wx, base + 1.75, wz, ang, 0.8, 1.15, paint, r() < 0.4);
      }
      if (L > 5 && r() < 0.13) { const [lx, lz] = at(L * 0.2); lantern(lx, base + 2.9, lz, nx, nz); }
      if (L > 3 && r() < 0.11 * q.foliage) {
        const t = L * (0.2 + r() * 0.6), span = Math.min(L * 0.7, 2.5 + r() * 3.5), [fx, fz] = at(t);
        bougain(fx, lerp(base + 2.6, yTop, r()), fz, nx, nz, ex, ez, span, r, BOUG[(r() * BOUG.length) | 0]);
      }
      if (L > 3.5 && r() < 0.035 && !bay) {
        const [kx, kz] = at(L * 0.5, 0.06), kw = 1.3, kh = 2.0, ky = base + 0.9;
        G('kilim').quad([kx + ex * kw / 2, ky, kz + ez * kw / 2], [kx - ex * kw / 2, ky, kz - ez * kw / 2], [kx - ex * kw / 2, ky + kh, kz - ez * kw / 2], [kx + ex * kw / 2, ky + kh, kz + ez * kw / 2], [0, 0, 1, 1], WHITE);
      }
    }

    // ---- hipped clay tile roof with timber eaves ----
    let per = 0;
    for (let i = 0; i < n; i++) per += Math.hypot(p[(i + 1) % n][0] - p[i][0], p[(i + 1) % n][1] - p[i][1]);
    const area = Math.abs(THREE.ShapeUtils.area(p.map((v) => new THREE.Vector2(v[0], v[1]))));
    const ov = 0.5, inset = Math.min(2.0, 0.42 * 2 * area / per), rise = inset * 0.55 + 0.2;
    const outer = offsetPoly(p, ov), inner = offsetPoly(p, -inset);
    const rt = [0.9 + r() * 0.2, 0.9 + r() * 0.15, 0.9 + r() * 0.15];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = p[i], c = p[j], oa = outer[i], oc = outer[j], ia = inner[i], ic = inner[j];
      const L = Math.hypot(oc[0] - oa[0], oc[1] - oa[1]), ex = (c[0] - a[0]), ez = (c[1] - a[1]), l = Math.hypot(ex, ez) || 1;
      const nrm = [ez / l, 0, -ex / l];
      G('wood').quad([a[0], yTop, a[1]], [c[0], yTop, c[1]], [oc[0], yTop, oc[1]], [oa[0], yTop, oa[1]], [0, 0, L / S_WD, ov / S_WD], WOOD, [0, -1, 0]);
      G('wood').quad([oc[0], yTop - 0.02, oc[1]], [oa[0], yTop - 0.02, oa[1]], [oa[0], yTop + 0.1, oa[1]], [oc[0], yTop + 0.1, oc[1]], [0, 0, L / S_WD, 0.1], WOOD, nrm);
      const sl = Math.hypot(inset + ov, rise);
      G('roof').quad([oc[0], yTop + 0.1, oc[1]], [oa[0], yTop + 0.1, oa[1]], [ia[0], yTop + rise, ia[1]], [ic[0], yTop + rise, ic[1]], [0, 0, L / S_RF, sl / S_RF], rt, [nrm[0], 1.5, nrm[2]]);
    }
    G('roof').cap(inner, yTop + rise, S_RF, rt);
    if (r() < 0.5 && area > 40) {
      const ch = inner[(r() * n) | 0], kx = lerp(ch[0], b.cx, 0.35), kz = lerp(ch[1], b.cz, 0.35);
      G('plaster').box(kx, yTop + rise - 0.1, kz, [1, 0], 0.55, 1.0, 0.55, tint, S_PL, 'u');
      G('roof').box(kx, yTop + rise + 0.9, kz, [1, 0], 0.75, 0.1, 0.75, rt, S_RF);
    }
  });

  // =====================================================================================
  // Garden walls lining the lanes wherever no house fronts the street
  // =====================================================================================
  const STEP = 2.4;
  data.roads.forEach((road, ri) => {
    if (!road.old || road.k === 'tertiary' || road.k === 'secondary') return;
    const r = rng(ri * 331 + 5);
    for (const side of [-1, 1]) {
      let prev = null, style = null, k = 0;
      const off = road.w / 2 + 0.55;
      for (let s = 0; s < road.p.length - 1; s++) {
        const a = road.p[s], c = road.p[s + 1], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (L < 0.01) continue;
        const ex = (c[0] - a[0]) / L, ez = (c[1] - a[1]) / L, nx = ez * side, nz = -ex * side;
        const cnt = Math.max(1, Math.round(L / STEP));
        for (let i = 0; i <= cnt; i++) {
          const t = i / cnt * L, x = a[0] + ex * t + nx * off, z = a[1] + ez * t + nz * off;
          let ok = !data.marks.some((m) => Math.hypot(m.x - x, m.z - z) < (m.k === 'hadrian' ? 34 : 20)) && pointInPoly(x, z, data.oldTown) && coastDist(x, z) > 6 && !inBuilding(x, z) && !nearRoad(x, z, 0.45, road);
          if (ok) { let dmin = 1e9; for (let q2 = 0; q2 < road.p.length - 1; q2++) dmin = Math.min(dmin, distToSeg(x, z, road.p[q2][0], road.p[q2][1], road.p[q2 + 1][0], road.p[q2 + 1][1])); ok = dmin > off - 0.2; }
          if (ok && edges.nearest(x, z, 1.5)) ok = false;
          const cur = ok ? [x, z] : null;
          if (cur && prev) {
            const dx = cur[0] - prev[0], dz = cur[1] - prev[1], sl = Math.hypot(dx, dz);
            if (sl > 0.3 && sl < STEP * 2.2) {
              if (!style) style = { h: 2.0 + r() * 0.9, stone: r() < 0.6, tint: PLASTER[(r() * 4) | 0], u: r() * 9, bloom: r() < 0.5 * q.foliage, bt: BOUG[(r() * BOUG.length) | 0] };
              const mx = (cur[0] + prev[0]) / 2, mz = (cur[1] + prev[1]) / 2;
              const y0 = Math.min(groundY(cur[0], cur[1]), groundY(prev[0], prev[1])) - 0.4;
              const yT = Math.max(groundY(cur[0], cur[1]), groundY(prev[0], prev[1])) + style.h;
              const ax = [dx / sl, dz / sl];
              tiles.get(style.stone ? 'rubble' : 'plaster', mx, mz).box(mx, y0, mz, ax, sl + 0.02, yT - y0, 0.42, style.stone ? STONEW : style.tint, style.stone ? S_RB : S_PL, 'u', (style.u += sl / (style.stone ? S_RB : S_PL)) );
              tiles.get('ashlar', mx, mz).box(mx, yT, mz, ax, sl + 0.02, 0.1, 0.56, HONEY, S_AS, 'u');
              solid(prev[0] - nx * 0.21, prev[1] - nz * 0.21, cur[0] - nx * 0.21, cur[1] - nz * 0.21, 'garden');
              k++;
              if (style.bloom && k % 3 === 1 && r() < 0.7) bougain(mx, yT + 0.35, mz, -nx, -nz, ax[0], ax[1], 3.5 + r() * 3, r, style.bt);
              if (r() < 0.2) {
                const tx = mx + nx * (2.2 + r() * 3), tz = mz + nz * (2.2 + r() * 3);
                if (!inBuilding(tx, tz) && !nearRoad(tx, tz, 1.2, null) && !edges.nearest(tx, tz, 1.6)) treeSpots.push(tx, tz, r());
              }
              if (k % 9 === 4) lantern(mx - nx * 0.21, yT - 0.05, mz - nz * 0.21, -nx, -nz);
            }
          }
          if (!cur) style = null;
          prev = cur;
        }
      }
    }
  });

  // =====================================================================================
  // City walls
  // =====================================================================================
  for (const w of data.walls) {
    const city = w.k !== 'retaining_wall', th = city ? 2.4 : 0.9, hgt = city ? 8.5 : 3.2;
    for (let s = 0; s < w.p.length - 1; s++) {
      const a0 = w.p[s], c0 = w.p[s + 1], L0 = Math.hypot(c0[0] - a0[0], c0[1] - a0[1]);
      if (L0 < 0.2) continue;
      const ax = [(c0[0] - a0[0]) / L0, (c0[1] - a0[1]) / L0];
      // cut the wall into short runs and leave a gateway wherever a street passes through
      const n = Math.max(1, Math.round(L0 / 2.2));
      for (let i = 0; i < n; i++) {
        const a = [a0[0] + ax[0] * L0 * i / n, a0[1] + ax[1] * L0 * i / n], c = [a0[0] + ax[0] * L0 * (i + 1) / n, a0[1] + ax[1] * L0 * (i + 1) / n];
        const L = L0 / n, mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
        if (nearRoad(mx, mz, th / 2 + 0.7, null)) continue;
        const g0 = Math.min(groundY(a[0], a[1]), groundY(c[0], c[1])), g1 = Math.max(groundY(a[0], a[1]), groundY(c[0], c[1]));
        const g = tiles.get('ashlar', mx, mz), top = g1 + hgt;
        g.box(mx, g0 - 1, mz, ax, L + 0.05, top - g0 + 1, th, HONEY, S_AS, 'u');
        if (city) for (const sd of [-1, 1]) {
          const px = mx - ax[1] * sd * (th / 2 - 0.3), pz = mz + ax[0] * sd * (th / 2 - 0.3);
          g.box(px, top, pz, ax, 1.0, 0.95, 0.6, HONEY, S_AS, 'u');
        }
        for (const sd of [-1, 1]) collide.add(a[0] - ax[1] * sd * th / 2, a[1] + ax[0] * sd * th / 2, c[0] - ax[1] * sd * th / 2, c[1] + ax[0] * sd * th / 2, 'wall');
        if (i === 0 || i === n - 1) for (const e of [a, c]) collide.add(e[0] - ax[1] * th / 2, e[1] + ax[0] * th / 2, e[0] + ax[1] * th / 2, e[1] - ax[0] * th / 2, 'wall');
      }
    }
  }

  // landmarks, mosques, ruins
  const marks = buildLandmarks(data, { tiles, groundY, collide, lin, HONEY, pushWin, T, lamps });

  // ---------- flush merged geometry ----------
  const opt = {};
  for (const k in mats) opt[k] = { material: mats[k] };
  opt.lamp.cast = false; opt.kilim.cast = false; opt.iron.cast = false; opt.foliage.receive = true;
  group.add(tiles.toGroup(opt));

  // ---------- instanced windows ----------
  const winGeo = (closed) => {
    const parts = { frame: [], louver: [], glass: [] };
    const bx = (list, w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); list.push(g); };
    const ft = 0.075;
    bx(parts.frame, 1 + ft * 2, ft, 0.12, 0, 0.5 + ft / 2, 0); bx(parts.frame, 1 + ft * 2, ft, 0.12, 0, -0.5 - ft / 2, 0);
    bx(parts.frame, ft, 1, 0.12, -0.5 - ft / 2, 0, 0); bx(parts.frame, ft, 1, 0.12, 0.5 + ft / 2, 0, 0);
    bx(parts.frame, 1.36, 0.05, 0.2, 0, -0.5 - ft - 0.025, 0.05); // sill
    if (!closed) {
      bx(parts.frame, 0.045, 1, 0.03, 0, 0, 0.03); bx(parts.frame, 1, 0.035, 0.03, 0, 0.18, 0.03);
      const gl = new THREE.PlaneGeometry(1, 1); gl.translate(0, 0, 0.014); parts.glass.push(gl);
      for (const s of [-1, 1]) bx(parts.louver, 0.5, 1.02, 0.035, s * 0.83, 0, 0.04);
    } else for (const s of [-1, 1]) bx(parts.louver, 0.495, 1, 0.035, s * 0.25, 0, 0.0);
    const list = [BufferGeometryUtils.mergeGeometries(parts.frame), BufferGeometryUtils.mergeGeometries(parts.louver)];
    if (!closed) list.push(BufferGeometryUtils.mergeGeometries(parts.glass));
    return BufferGeometryUtils.mergeGeometries(list, true);
  };
  const geoOpen = winGeo(false), geoClosed = winGeo(true);
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  let winCount = 0;
  for (const set of wins.values()) for (const kind of ['open', 'closed']) {
    const a = set[kind], cnt = a.length / 9;
    if (!cnt) continue;
    const mesh = new THREE.InstancedMesh(kind === 'open' ? geoOpen : geoClosed, kind === 'open' ? [frameMat, louverMat, glass] : [frameMat, louverMat], cnt);
    for (let i = 0; i < cnt; i++) {
      const o = i * 9;
      qt.setFromAxisAngle(up, a[o + 3]);
      m4.compose(new THREE.Vector3(a[o], a[o + 1], a[o + 2]), qt, new THREE.Vector3(a[o + 4], a[o + 5], 1));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.setRGB(a[o + 6] * 1.5, a[o + 7] * 1.5, a[o + 8] * 1.5));
    }
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    mesh.computeBoundingSphere();
    group.add(mesh); winCount += cnt;
  }

  return { group, collide, roadGrid, lamps, treeSpots, marks, mats, glass, inBuilding, nearRoad, edges, stats: { windows: winCount, segs: collide.segs.length } };
}
