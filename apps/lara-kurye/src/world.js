// Lara (Muratpaşa / Antalya) esintili şehir üretimi.
// Sokak düzeni gerçek haritanın birebir kopyası değil; bölgenin karakterine göre elle tasarlandı.
import * as THREE from 'three';
import { Geo, Inst, rng, lin } from './builder.js';
import * as TX from './textures.js';
import { TILE, tileUV } from './textures.js';

export const XR = [
  { c: -360, w: 8, name: '2141. Sokak' },
  { c: -280, w: 16, name: 'İsmet Gökşen Cd.', major: true },
  { c: -200, w: 8, name: '2143. Sokak' },
  { c: -120, w: 8, name: '2145. Sokak' },
  { c: -40, w: 8, name: '2147. Sokak' },
  { c: 40, w: 8, name: '2149. Sokak' },
  { c: 120, w: 8, name: '2151. Sokak' },
  { c: 200, w: 8, name: '2153. Sokak' },
  { c: 280, w: 16, name: 'Özgürlük Blv.', major: true },
  { c: 360, w: 8, name: '2155. Sokak' },
];
export const ZR = [
  { c: -340, w: 8, name: '2138. Sokak' },
  { c: -240, w: 16, name: 'Tekelioğlu Cd.', major: true },
  { c: -120, w: 8, name: '2140. Sokak' },
  { c: 0, w: 20, name: 'Barınaklar Blv.', major: true, median: true },
  { c: 100, w: 8, name: '2156. Sokak' },
  { c: 200, w: 14, name: 'Lara Cd.', major: true },
];
export const BOUNDS = { x0: -363.4, x1: 363.4, z0: -343.4 };
export const PARK_Z = 207;
export const SEA_Y = -30;
export const edge = (x) => 250 + 10 * Math.sin(x / 85) + 5 * Math.sin(x / 31 + 1.3);

const SHOPS = [
  ['LARA DÖNER', 'et • tavuk • iskender', '#b3141c', '#fff', 1], ['FALEZ PİDE', 'pide & lahmacun', '#7a3b12', '#ffe9b0', 1],
  ['AKDENİZ BÖREK', 'su böreği • çay', '#e2b33c', '#3a2408', 1], ['PORTAKAL KAFE', 'kahve • tatlı', '#f08a1c', '#fff', 1],
  ['TANTUNİ USTASI', 'Mersin usulü', '#1d1d1d', '#ffd23f', 1], ['BURGER DURAĞI', 'ızgara burger', '#202a44', '#ff7a3c', 1],
  ['PİZZA NAPOLİ', 'taş fırın', '#156b3a', '#fff', 1], ['ÇİĞ KÖFTECİ ALİ', 'acılı • acısız', '#c4161c', '#fff200', 1],
  ['KUMRU & TOST', 'büfe', '#f4f1e8', '#b3141c', 1], ['BALIKÇI DENİZ', 'günlük balık', '#0e5a8a', '#fff', 1],
  ['KÜNEFECİ', 'künefe • baklava', '#5b2a86', '#ffd9a0', 1], ['KOKOREÇ 07', 'gece açık', '#2b2b2b', '#ff5a36', 1],
  ['PİYAZCI SAMİ', 'Antalya piyazı • köfte', '#8a1c1c', '#fff', 1], ['SİMİT FIRINI', 'sıcak simit • poğaça', '#c98b2b', '#fff', 1],
  ['ŞİRİN MARKET', 'şarküteri • manav', '#1f7a3d', '#fff', 0], ['ECZANE LARA', 'nöbetçi', '#f5f5f5', '#d0121b', 0],
  ['BERBER HASAN', 'saç • sakal', '#1b3554', '#fff', 0], ['KUAFÖR ELİF', 'bayan kuaförü', '#c2478d', '#fff', 0],
  ['TEKEL BÜFE', '', '#1c1c5e', '#fff', 0], ['ÇİÇEKÇİ YASEMİN', 'buket • çelenk', '#e9f2e4', '#3d7a33', 0],
  ['EMLAK 07', 'satılık • kiralık', '#f2c400', '#1a1a1a', 0], ['KIRTASİYE', 'fotokopi • baskı', '#2466b0', '#fff', 0],
  ['MANAV', 'taze sebze meyve', '#3d8a2e', '#fff3b0', 0], ['KASAP', 'dana • kuzu', '#8c1318', '#fff', 0],
  ['SU BAYİİ', 'damacana', '#1d8ac4', '#fff', 0], ['TELEFONCU', 'aksesuar • tamir', '#111', '#3ad1ff', 0],
  ['TERZİ', 'tadilat', '#514133', '#f0e2c8', 0], ['OPTİK LARA', 'gözlük', '#f7f7f7', '#1c3b6e', 0],
];
const WALLS = ['#f4f1ea', '#efe9da', '#f3ecd2', '#e9e6e0', '#f6f3ee', '#eadfc8', '#dfe3e2', '#f1e6d6', '#e6dccb', '#f2f2f0'];
const ACCENTS = ['#b96a4a', '#c9a243', '#7d8c98', '#8a8f6a', '#a24b3f', '#5f7f8f', '#d9cdb8', '#9c9a95', '#c97f5b', '#6c7a66'];
const CARCOL = ['#f2f2f0', '#f2f2f0', '#e9e9e7', '#b9bcc0', '#b9bcc0', '#6e7276', '#2a2c30', '#14161a', '#1f3358', '#8c1a1f', '#3d4a3a', '#c8c3b4'];

export function buildWorld(scene, q) {
  const r = rng(2147);
  const R = (a, b) => a + r() * (b - a);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];

  // ---------- malzemeler ----------
  const A = TX.facadeAtlas();
  const entries = [];
  [...XR, ...ZR].forEach((rd) => entries.push({ kind: 'street', text: rd.name.toLocaleUpperCase('tr'), bg: '#0b4ea2', fg: '#fff' }));
  SHOPS.forEach((s) => entries.push({ kind: 'shop', text: s[0], sub: s[1], bg: s[2], fg: s[3] }));
  const SA = TX.signAtlas(entries);
  const streetRect = (name) => SA.rects[[...XR, ...ZR].findIndex((rd) => rd.name === name)];
  const shopRect = (i) => SA.rects[XR.length + ZR.length + i];

  const tAsph = TX.asphalt(), tPav = TX.paver(), tGrass = TX.grass(), tPl = TX.plaster(), tLeaf = TX.leaves();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    facade: std({ map: A.map, roughnessMap: A.orm, metalnessMap: A.orm, roughness: 1, metalness: 1, vertexColors: true }),
    wall: std({ map: tPl, roughness: 0.92, vertexColors: true }),
    metal: std({ roughness: 0.42, metalness: 0.85, vertexColors: true }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9fc4cf, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }),
    solar: std({ color: 0x16233f, roughness: 0.18, metalness: 0.6 }),
    sign: std({ map: SA.map, roughness: 0.55, emissiveMap: SA.map, emissive: 0xffffff, emissiveIntensity: 0.12 }),
    paver: std({ map: tPav, roughness: 0.95, vertexColors: true }),
    asphalt: std({ map: tAsph, roughness: 0.93 }),
    grass: std({ map: tGrass, roughness: 1, vertexColors: true }),
    paint: std({ color: 0xe9e9e4, roughness: 0.8, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    leaf: std({ map: tLeaf, roughness: 0.95, vertexColors: true }),
    crown: std({ map: tLeaf, roughness: 0.95 }),
    trunk: std({ map: TX.trunk(), roughness: 1 }),
    frond: std({ map: TX.frond(), roughness: 0.8, alphaTest: 0.45, side: THREE.DoubleSide }),
    rock: std({ map: TX.rock(), roughness: 1 }),
  };
  tLeaf.repeat.set(3, 3);

  const G = {};
  for (const k of ['facade', 'wall', 'metal', 'glass', 'solar', 'sign', 'paver', 'grass', 'paint', 'leaf']) G[k] = new Geo();

  // ---------- çarpışma ızgarası ----------
  const CELL = 16, grid = new Map();
  const colliders = [];
  function addCol(x0, z0, x1, z1, h = 99) {
    const c = { x0, z0, x1, z1, h }; colliders.push(c);
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const k = gx + ',' + gz; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(c);
      }
  }
  const near = (x, z) => grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));

  // ---------- örnekli modeller ----------
  const crownGeo = (() => {
    const g = new Geo(), rr = rng(7);
    for (let i = 0; i < 5; i++) {
      const ico = new THREE.IcosahedronGeometry(1, 2), p = ico.attributes.position, n = ico.attributes.normal;
      const sc = 0.62 + rr() * 0.3, ox = (rr() - 0.5) * 1.1, oy = (rr() - 0.5) * 0.7, oz = (rr() - 0.5) * 1.1;
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
        const f = 1 + 0.16 * Math.sin(x * 5.3 + y * 3.1 + i) * Math.cos(z * 4.7 + x * 1.9) + 0.08 * Math.sin(y * 9 + z * 7);
        n.setXYZ(k, x, y, z); p.setXYZ(k, x * f * sc + ox, y * f * sc * 0.85 + oy, z * f * sc + oz);
      }
      g.add(ico, null);
    }
    return g.geometry();
  })();
  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.16, 1, 7).translate(0, 0.5, 0);
  const palmTrunk = new Geo(), palmFronds = new Geo();
  {
    const H = 8, cyl = new THREE.CylinderGeometry(0.17, 0.27, H, 9, 8).translate(0, H / 2, 0), p = cyl.attributes.position;
    for (let k = 0; k < p.count; k++) p.setX(k, p.getX(k) + 0.6 * Math.pow(p.getY(k) / H, 2));
    cyl.attributes.uv.array.forEach((v, i, a) => { if (i % 2) a[i] = v * 4; else a[i] = v * 2; });
    cyl.computeVertexNormals(); palmTrunk.add(cyl, null);
    const rr = rng(17), m = new THREE.Matrix4();
    palmTrunk.add(new THREE.SphereGeometry(0.42, 8, 6), m.makeTranslation(0.6, H - 0.1, 0));
    for (let i = 0; i < 20; i++) {
      const tier = i < 8 ? 0 : i < 15 ? 1 : 2, L = 3.3 + rr() * 0.8;
      const up = [0.25, 0.9, 1.7][tier] + rr() * 0.3, droop = [3.0, 2.5, 1.9][tier];
      const pos = [], uv = [], idx = [], N = 8;
      for (let s = 0; s <= N; s++) {
        const t = s / N, y = up * t - droop * t * t, z = -L * t * (1 - 0.15 * t), w = 0.55;
        pos.push(-w, y - 0.12, z, w, y - 0.12, z); pos[pos.length - 5] += 0.12; pos[pos.length - 2] += 0;
        uv.push(0, t, 1, t);
        if (s < N) { const a = s * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      fg.setIndex(idx); fg.computeVertexNormals();
      m.makeRotationY((i / 20) * Math.PI * 2 * 2.618 + rr() * 0.3).setPosition(0.6, H + 0.1, 0);
      palmFronds.add(fg, m);
    }
  }
  const I = {
    crown: new Inst(crownGeo, M.crown), trunk: new Inst(trunkGeo, M.trunk),
    palmT: new Inst(palmTrunk.geometry(), M.trunk), palmF: new Inst(palmFronds.geometry(), M.frond),
  };
  const GREENS = ['#3f6a2a', '#4b7a2e', '#35602a', '#58863a', '#2f5a30'].map(lin);
  function tree(x, z, y = 0.15, kind = 'orange') {
    const s = R(0.85, 1.25);
    if (kind === 'pine') {
      I.trunk.add(x, y, z, 0, 1.6, 5.5 * s, 1.6); I.crown.add(x, y + 6.5 * s, z, R(0, 6), 2.6 * s, 1.5 * s, 2.6 * s, lin('#2c4f2a'));
    } else {
      I.trunk.add(x, y, z, 0, 1, 2.3 * s, 1); I.crown.add(x, y + 3.3 * s, z, R(0, 6), 1.7 * s, 1.5 * s, 1.7 * s, pick(GREENS));
    }
    addCol(x - 0.25, z - 0.25, x + 0.25, z + 0.25);
  }
  function palm(x, z, y = 0.15) {
    const s = R(0.8, 1.25), a = R(0, 6.28);
    I.palmT.add(x, y, z, a, s); I.palmF.add(x, y, z, a, s);
    addCol(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
  }
  const lampGeo = (() => {
    const g = new Geo(), dark = lin('#3b3f44'), m = new THREE.Matrix4();
    g.add(new THREE.CylinderGeometry(0.06, 0.09, 7.5, 8).translate(0, 3.75, 0), null, dark);
    g.add(new THREE.CylinderGeometry(0.04, 0.05, 1.9, 6).rotateZ(Math.PI / 2 - 0.2), m.makeTranslation(0.9, 7.65, 0), dark);
    g.box(1.9, 7.8, 0, 0.7, 0.12, 0.28, { color: dark, bottom: true });
    g.box(1.9, 7.73, 0, 0.5, 0.03, 0.2, { color: [3, 3, 2.6], bottom: true });
    return g.geometry();
  })();
  I.lamp = new Inst(lampGeo, M.metal);
  function lamp(x, z, rot) { I.lamp.add(x, 0.15, z, rot); addCol(x - 0.15, z - 0.15, x + 0.15, z + 0.15); }

  function signPlate(x, y, z, dx, dz, w, h, rect, both = true) {
    const ax = x - dx * w / 2, az = z - dz * w / 2, bx = x + dx * w / 2, bz = z + dz * w / 2, nx = -dz, nz = dx, o = 0.014;
    G.sign.quad([ax + nx * o, y, az + nz * o], [bx + nx * o, y, bz + nz * o], [bx + nx * o, y + h, bz + nz * o], [ax + nx * o, y + h, az + nz * o], [nx, 0, nz], rect);
    if (both) G.sign.quad([bx - nx * o, y, bz - nz * o], [ax - nx * o, y, az - nz * o], [ax - nx * o, y + h, az - nz * o], [bx - nx * o, y + h, bz - nz * o], [-nx, 0, -nz], rect);
  }

  // ---------- binalar ----------
  const buildings = [], restaurants = [];
  const counters = {};
  let shopIdx = 0;
  const LG = lin('#bdbab3');

  function building(b) {
    const { cx, cz, theta, W, D, nf, shop } = b;
    const gh = shop ? 3.8 : 3.1, fh = 3, H = gh + (nf - 1) * fh;
    const col = lin(pick(WALLS)), acc = lin(pick(ACCENTS));
    const balStyle = r() < 0.45 ? 'glass' : 'solid', balMode = pick(['all', 'ends', 'alt', 'all']);
    const accentBal = r() < 0.6, accentStair = r() < 0.5;
    for (let k = 0; k < 4; k++) {
      const phi = theta + k * Math.PI / 2, half = k % 2 === 0 ? D / 2 : W / 2, fw = k % 2 === 0 ? W : D;
      const nx = Math.sin(phi), nz = Math.cos(phi), rx = Math.cos(phi), rz = -Math.sin(phi);
      const at = (u, out) => [cx + nx * (half + out) + rx * u, cz + nz * (half + out) + rz * u];
      const nb = Math.max(2, Math.round(fw / 3.9)), bw = fw / nb, ci = Math.floor(nb / 2);
      const cols = [];
      for (let i = 0; i < nb; i++) {
        if (k === 0) {
          const stair = i === ci && nb >= 3 && nb % 2 === 1;
          cols.push({ bal: !stair && (balMode === 'all' || (balMode === 'ends' && (i === 0 || i === nb - 1)) || (balMode === 'alt' && i % 2 === 0)), stair });
        } else if (k === 2) cols.push({ bal: r() < 0.35, t: pick([TILE.WINDOW, TILE.AC, TILE.WINDOW, TILE.SMALL]) });
        else cols.push({ bal: false, t: pick([TILE.WINDOW, TILE.WINDOW, TILE.SMALL, TILE.AC, TILE.BLANK, TILE.AC]) });
      }
      for (let f = 0; f < nf; f++) {
        const y0 = f === 0 ? 0.15 : 0.15 + gh + (f - 1) * fh, h = f === 0 ? gh : fh;
        for (let i = 0; i < nb; i++) {
          const c = cols[i]; let t, cc = col;
          if (f === 0) {
            if (k === 0) t = i === ci ? TILE.DOOR : shop ? TILE.SHOP : (r() < 0.6 ? TILE.WINDOW : TILE.BLANK);
            else t = shop ? TILE.BLANK : pick([TILE.BLANK, TILE.SMALL, TILE.WINDOW]);
            if (t === TILE.SHOP) cc = [1, 1, 1];
          } else {
            if (c.stair) { t = TILE.SMALL; if (accentStair) cc = acc; }
            else if (c.bal) { t = TILE.BALCONY; if (accentBal) cc = acc; }
            else t = c.t ?? (r() < 0.18 ? TILE.SHUTTER : TILE.WINDOW);
            if (t === TILE.WINDOW && r() < 0.12) t = TILE.SHUTTER;
          }
          const u0 = -fw / 2 + i * bw, a = at(u0, 0), bb = at(u0 + bw, 0);
          G.facade.quad([a[0], y0, a[1]], [bb[0], y0, bb[1]], [bb[0], y0 + h, bb[1]], [a[0], y0 + h, a[1]], [nx, 0, nz], tileUV(t), cc);
        }
      }
      // balkonlar (bitişik bölmeler tek balkon)
      for (let i = 0; i < nb; i++) {
        if (!cols[i].bal) continue;
        let j = i; while (j + 1 < nb && cols[j + 1].bal) j++;
        const uc = -fw / 2 + bw * (i + j + 1) / 2, bwid = bw * (j - i + 1) - 0.35, dep = 1.3;
        for (let f = 1; f < nf; f++) {
          const y0 = 0.15 + gh + (f - 1) * fh;
          let p = at(uc, dep / 2);
          G.wall.box(p[0], y0 - 0.03, p[1], bwid, 0.16, dep, { rot: phi, color: LG, bottom: true });
          const pc = accentBal ? col : acc;
          const sides = [[uc, dep - 0.05, bwid, 0.08], [uc - bwid / 2 + 0.04, dep / 2, 0.08, dep], [uc + bwid / 2 - 0.04, dep / 2, 0.08, dep]];
          for (const [u, out, sx, sz] of sides) {
            p = at(u, out);
            if (balStyle === 'solid') G.wall.box(p[0], y0 + 0.55, p[1], sx, 1.0, sz, { rot: phi, color: pc, bottom: false });
            else {
              G.glass.box(p[0], y0 + 0.52, p[1], Math.max(sx - 0.05, 0.03), 0.9, Math.max(sz - 0.05, 0.03), { rot: phi, top: false });
              G.metal.box(p[0], y0 + 1.0, p[1], sx, 0.05, sz, { rot: phi, color: [0.8, 0.8, 0.82] });
            }
          }
        }
        i = j;
      }
      // çatı parapeti
      const pp = at(0, -0.1);
      G.wall.box(pp[0], 0.15 + H + 0.45, pp[1], fw, 0.55, 0.2, { rot: phi, color: col });
      // dükkânlar
      if (k === 0 && shop) {
        const groups = [];
        if (ci >= 1) groups.push([0, ci - 1]);
        if (ci + 1 <= nb - 1) groups.push([ci + 1, nb - 1]);
        for (const [i0, i1] of groups) {
          const si = shopIdx++ % SHOPS.length, sh = SHOPS[si];
          const uc = -fw / 2 + bw * (i0 + i1 + 1) / 2, gw = bw * (i1 - i0 + 1);
          const sw = Math.min(4.4, gw - 0.3), shh = sw / 4;
          let p = at(uc, 0.07);
          G.wall.box(p[0], 0.15 + 3.35, p[1], sw + 0.12, shh + 0.12, 0.14, { rot: phi, color: [0.08, 0.08, 0.08], bottom: true });
          p = at(uc, 0.145);
          signPlate(p[0], 0.15 + 3.35 - shh / 2, p[1], rx, rz, sw, shh, shopRect(si), false);
          if (r() < 0.55) { p = at(uc, 0.75); G.wall.box(p[0], 0.15 + 2.78, p[1], gw - 0.3, 0.07, 1.5, { rot: phi, color: lin(sh[2]), bottom: true }); }
          if (sh[4]) { p = at(uc, 2.4); restaurants.push({ name: sh[0], x: p[0], z: p[1], street: b.street }); }
        }
      }
    }
    const xs = Math.abs(Math.cos(theta)) > 0.5 ? W : D, zs = Math.abs(Math.cos(theta)) > 0.5 ? D : W;
    G.wall.box(cx, 0.15 + H + 0.08, cz, xs + 0.25, 0.2, zs + 0.25, { color: LG, bottom: true });
    G.wall.box(cx + R(-2, 2), 0.15 + H + 1.5, cz - zs / 4, 3.6, 2.7, 3, { color: col });
    // güneş enerjili su ısıtıcıları
    const ns = Math.min(8, nf + 1), m = new THREE.Matrix4(), e = new THREE.Euler(0.7, 0, 0), qn = new THREE.Quaternion().setFromEuler(e);
    for (let i = 0; i < ns; i++) {
      const px = cx - xs / 2 + 1.6 + (i % 4) * ((xs - 3.2) / 3), pz = cz + zs / 4 - Math.floor(i / 4) * 3.2 + 0.5, py = 0.15 + H + 0.2;
      G.solar.add(new THREE.BoxGeometry(1.05, 0.06, 1.9), m.compose(new THREE.Vector3(px, py + 0.72, pz), qn, new THREE.Vector3(1, 1, 1)));
      G.metal.add(new THREE.CylinderGeometry(0.23, 0.23, 1.15, 10).rotateZ(Math.PI / 2), m.makeTranslation(px, py + 1.42, pz - 0.82), [0.85, 0.86, 0.88]);
      G.metal.box(px, py + 0.6, pz - 0.8, 0.9, 1.2, 0.05, { color: [0.6, 0.6, 0.62] });
    }
    addCol(cx - xs / 2, cz - zs / 2, cx + xs / 2, cz + zs / 2);
    const fx = Math.sin(theta), fz = Math.cos(theta);
    counters[b.street] = (counters[b.street] || 0) + 1;
    const no = counters[b.street] * 2 + (r() < 0.5 ? 0 : -1);
    buildings.push({ x0: cx - xs / 2, z0: cz - zs / 2, x1: cx + xs / 2, z1: cz + zs / 2, h: H, street: b.street, no,
      door: { x: cx + fx * (D / 2 + 1.7), z: cz + fz * (D / 2 + 1.7) }, shop });
  }

  // ---------- adalar (bloklar) ----------
  const blocks = [];
  const CURB = lin('#a9a7a0');
  for (let i = 0; i < XR.length - 1; i++) for (let j = 0; j < ZR.length - 1; j++) {
    const rw = XR[i], re = XR[i + 1], rn = ZR[j], rs = ZR[j + 1];
    const x0 = rw.c + rw.w / 2, x1 = re.c - re.w / 2, z0 = rn.c + rn.w / 2, z1 = rs.c - rs.w / 2;
    blocks.push({ x0, x1, z0, z1 });
    G.paver.box((x0 + x1) / 2, 0.075, (z0 + z1) / 2, x1 - x0, 0.15, z1 - z0, { uv: 0.5 });
    for (const [bx, bz, sx, sz] of [[(x0 + x1) / 2, z0 + 0.1, x1 - x0, 0.2], [(x0 + x1) / 2, z1 - 0.1, x1 - x0, 0.2], [x0 + 0.1, (z0 + z1) / 2, 0.2, z1 - z0], [x1 - 0.1, (z0 + z1) / 2, 0.2, z1 - z0]])
      G.wall.box(bx, 0.085, bz, sx, 0.17, sz, { color: CURB });
    const sw = (rd) => (rd.major ? 4.5 : 3);
    const ix0 = x0 + sw(rw), ix1 = x1 - sw(re), iz0 = z0 + sw(rn), iz1 = z1 - sw(rs);
    G.grass.flat(ix0, iz0, ix1, iz1, 0.16, [1, 1, 1], 0.25);
    const lw = (ix1 - ix0) / 2, nR = Math.max(2, Math.round((iz1 - iz0) / 27)), ld = (iz1 - iz0) / nR;
    const excl = { W: [], E: [], N: [], S: [] };
    const rects = [];
    for (let ci = 0; ci < 2; ci++) for (let rj = 0; rj < nR; rj++) {
      const lx0 = ix0 + ci * lw, lz0 = iz0 + rj * ld, lxc = lx0 + lw / 2, lzc = lz0 + ld / 2;
      let dir, road;
      if (rj === 0 && rn.major) { dir = 'N'; road = rn; }
      else if (rj === nR - 1 && rs.major) { dir = 'S'; road = rs; }
      else if (ci === 0) { dir = 'W'; road = rw; } else { dir = 'E'; road = re; }
      const shop = !!road.major, sb = shop ? 0.5 : R(3, 4.5);
      const ax = Math.min(lw - R(6, 9), 24), az = Math.min(ld - R(6, 9), 22);
      let W, D, cx, cz, theta;
      if (dir === 'W' || dir === 'E') {
        W = az; D = Math.min(ax, 17); cz = lzc;
        cx = dir === 'W' ? ix0 + sb + D / 2 : ix1 - sb - D / 2; theta = dir === 'W' ? Math.PI * 1.5 : Math.PI / 2;
        excl[dir].push(shop ? [cz - W / 2 - 0.5, cz + W / 2 + 0.5] : [cz - 1.6, cz + 1.6]);
        if (!shop) G.paver.box(dir === 'W' ? ix0 + sb / 2 : ix1 - sb / 2, 0.17, cz, sb, 0.04, 2.2, { uv: 0.5, color: [0.92, 0.9, 0.86] });
      } else {
        W = ax; D = Math.min(az, 17); cx = lxc;
        cz = dir === 'N' ? iz0 + sb + D / 2 : iz1 - sb - D / 2; theta = dir === 'N' ? Math.PI : 0;
        excl[dir].push(shop ? [cx - W / 2 - 0.5, cx + W / 2 + 0.5] : [cx - 1.6, cx + 1.6]);
      }
      const nf = 4 + Math.floor(r() * 3) + (shop ? 1 + Math.floor(r() * 2) : 0);
      building({ cx, cz, theta, W, D, nf, shop, street: road.name });
      const xs = dir === 'W' || dir === 'E' ? D : W, zs = dir === 'W' || dir === 'E' ? W : D;
      rects.push([cx - xs / 2 - 2, cz - zs / 2 - 2, cx + xs / 2 + 2, cz + zs / 2 + 2]);
    }
    // bahçe ağaçları
    for (let ci = 0; ci < 2; ci++) for (let rj = 0; rj <= nR; rj++) for (let side = 0; side < 2; side++) {
      const tx = ix0 + ci * lw + (side ? lw - 2.6 : 2.6) + R(-0.6, 0.6), tz = Math.min(iz1 - 2.5, Math.max(iz0 + 2.5, iz0 + rj * ld + R(-1.5, 1.5)));
      if (r() < 0.3 || rects.some((q2) => tx > q2[0] && tx < q2[2] && tz > q2[1] && tz < q2[3])) continue;
      if (r() < 0.28) palm(tx, tz, 0.16); else tree(tx, tz, 0.16);
    }
    // bahçe duvarı + çit + begonvil
    const wallRun = (side, a0, a1) => {
      const ex = excl[side].slice().sort((p, q2) => p[0] - q2[0]); let s = a0;
      const emit = (p, q2) => {
        if (q2 - p < 1.2) return;
        const c = (p + q2) / 2, len = q2 - p, vert = side === 'W' || side === 'E';
        const fx = side === 'W' ? ix0 + 0.12 : side === 'E' ? ix1 - 0.12 : c, fz = side === 'N' ? iz0 + 0.12 : side === 'S' ? iz1 - 0.12 : c;
        G.wall.box(fx, 0.15 + 0.4, fz, vert ? 0.22 : len, 0.8, vert ? len : 0.22, { color: [0.95, 0.94, 0.9] });
        addCol(fx - (vert ? 0.2 : len / 2), fz - (vert ? len / 2 : 0.2), fx + (vert ? 0.2 : len / 2), fz + (vert ? len / 2 : 0.2), 0.95);
        const inx = side === 'W' ? 0.45 : side === 'E' ? -0.45 : 0, inz = side === 'N' ? 0.45 : side === 'S' ? -0.45 : 0;
        if (r() < 0.6) G.leaf.box(fx + inx, 0.15 + 0.75, fz + inz, vert ? 0.7 : len - 0.5, 1.5, vert ? len - 0.5 : 0.7, { color: pick(GREENS), uv: 0.8 });
        if (r() < 0.35) I.crown.add(fx + inx * 0.4 + (vert ? 0 : R(-len / 3, len / 3)), 1.35, fz + inz * 0.4 + (vert ? R(-len / 3, len / 3) : 0), R(0, 6), 0.9, 0.5, 0.9, lin(pick(['#c2187a', '#d81f8c', '#a81560', '#c4206f'])));
      };
      for (const [p, q2] of ex) { emit(s, Math.min(p, a1)); s = Math.max(s, q2); }
      emit(s, a1);
    };
    wallRun('W', iz0, iz1); wallRun('E', iz0, iz1); wallRun('N', ix0, ix1); wallRun('S', ix0, ix1);
    // kaldırım mobilyası
    const sides = [['W', rw, x0 + 0.8, 0], ['E', re, x1 - 0.8, Math.PI], ['N', rn, z0 + 0.8, -Math.PI / 2], ['S', rs, z1 - 0.8, Math.PI / 2]];
    for (const [sd, rd, cc, rot] of sides) {
      const vert = sd === 'W' || sd === 'E', a0 = (vert ? z0 : x0) + 6, a1 = (vert ? z1 : x1) - 6;
      const step = rd.major ? 28 : 36;
      for (let a = a0 + R(0, 6), n = 0; a < a1; a += step, n++) {
        const lxp = vert ? cc : a, lzp = vert ? a : cc;
        lamp(lxp, lzp, rot + Math.PI);
        if (r() < 0.4) { const bx = vert ? cc : a + 1.2, bz = vert ? a + 1.2 : cc; G.wall.box(bx, 0.15 + 0.5, bz, 0.5, 1.0, 0.5, { color: lin('#2f5d3a') }); addCol(bx - 0.3, bz - 0.3, bx + 0.3, bz + 0.3); }
        const b2 = a + step / 2;
        if (b2 < a1) { const tx = vert ? cc + (sd === 'W' ? 0.3 : -0.3) : b2, tz = vert ? b2 : cc + (sd === 'N' ? 0.3 : -0.3); if (rd.major) palm(tx, tz); else if (r() < 0.55) tree(tx, tz); }
      }
    }
  }

  // ---------- sokak tabelaları ----------
  for (const X of XR) for (const Z of ZR) {
    const px = X.c + X.w / 2 + 0.75, pz = Z.c + Z.w / 2 + 0.75;
    G.metal.add(new THREE.CylinderGeometry(0.035, 0.035, 3.1, 6).translate(px, 1.7, pz), null, [0.7, 0.7, 0.72]);
    signPlate(px, 2.85, pz + 0.5, 0, 1, 0.92, 0.23, streetRect(X.name));
    signPlate(px + 0.5, 2.56, pz, 1, 0, 0.92, 0.23, streetRect(Z.name));
  }
  // başlangıç noktasındaki büyük 2147. Sokak tabelası
  G.metal.add(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6).translate(-35.1, 1.75, -66), null, [0.7, 0.7, 0.72]);
  signPlate(-35.85, 2.5, -66, -1, 0, 1.5, 0.375, streetRect('2147. Sokak'));

  // ---------- yollar, çizgiler ----------
  const WH = [1, 1, 1];
  const medians = [];
  const lights = { EW: { r: new Geo(), y: new Geo(), g: new Geo() }, NS: { r: new Geo(), y: new Geo(), g: new Geo() } };
  function markRoad(rd, vert, cross) {
    // vert: yol Z boyunca uzanıyor (K-G). cross: kesen yollar
    const P = (a0, a1, b0, b1) => (vert ? G.paint.flat(b0, a0, b1, a1, 0.012, WH) : G.paint.flat(a0, b0, a1, b1, 0.012, WH));
    const ends = vert ? [BOUNDS.z0 - 3, PARK_Z - 7] : [BOUNDS.x0 - 3, BOUNDS.x1 + 3];
    const cs = cross.slice().sort((p, q2) => p.c - q2.c);
    const segs = []; let s = ends[0];
    for (const c of cs) { if (c.c - c.w / 2 > s + 1) segs.push([s, c.c - c.w / 2, c]); s = c.c + c.w / 2; }
    if (ends[1] > s + 1) segs.push([s, ends[1], null]);
    const hw = rd.w / 2, laneOff = rd.median ? 1 + (hw - 1) / 2 : hw / 2;
    for (const [a, b] of segs) {
      const a0 = a + 5.2, b0 = b - 5.2; if (b0 - a0 < 4) continue;
      if (rd.median) {
        const c = (a0 + b0) / 2, len = b0 - a0;
        if (vert) { G.paver.box(rd.c, 0.11, c, 2, 0.22, len, { color: [0.85, 0.85, 0.82] }); medians.push({ x0: rd.c - 1, x1: rd.c + 1, z0: a0, z1: b0 }); }
        else { G.paver.box(c, 0.11, rd.c, len, 0.22, 2, { color: [0.85, 0.85, 0.82] }); medians.push({ x0: a0, x1: b0, z0: rd.c - 1, z1: rd.c + 1 }); }
        for (let t = a0 + 4; t < b0 - 3; t += 13) { if (vert) palm(rd.c, t, 0.2); else palm(t, rd.c, 0.2); }
      } else { P(a0, b0, rd.c - 0.22, rd.c - 0.1); P(a0, b0, rd.c + 0.1, rd.c + 0.22); }
      for (const sgn of [-1, 1]) {
        P(a0, b0, rd.c + sgn * (hw - 0.35) - 0.05, rd.c + sgn * (hw - 0.35) + 0.05);
        for (let t = a0; t < b0 - 3; t += 9) P(t, t + 3, rd.c + sgn * laneOff - 0.06, rd.c + sgn * laneOff + 0.06);
      }
      for (const e of [a + 1, b - 4]) // yaya geçidi
        for (let t = rd.c - hw + 0.5; t < rd.c + hw - 0.8; t += 1.0) if (!rd.median || Math.abs(t + 0.25 - rd.c) > 1.2 || true) P(e, e + 3, t, t + 0.5);
    }
  }
  for (const Z of ZR) if (Z.major) markRoad(Z, false, XR);
  for (const X of XR) if (X.major) markRoad(X, true, ZR.filter((z) => z.c < 210));

  // trafik ışıkları (Barınaklar × iki ana cadde)
  const DK = lin('#1c1e21');
  function tlight(x, z, fx, fz, grp) {
    G.metal.add(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 8).translate(x, 1.95, z), null, DK);
    G.metal.box(x, 4.2, z, 0.34, 1.0, 0.3, { color: DK, rot: Math.atan2(fx, fz) });
    const m = new THREE.Matrix4();
    ['r', 'y', 'g'].forEach((k, i) => lights[grp][k].add(new THREE.SphereGeometry(0.11, 10, 8), m.makeTranslation(x + fx * 0.14, 4.5 - i * 0.3, z + fz * 0.14)));
    addCol(x - 0.15, z - 0.15, x + 0.15, z + 0.15);
  }
  for (const xc of [-280, 280]) {
    tlight(xc - 8.9, 10.9, -1, 0, 'EW'); tlight(xc + 8.9, -10.9, 1, 0, 'EW');
    tlight(xc - 8.9, -10.9, 0, -1, 'NS'); tlight(xc + 8.9, 10.9, 0, 1, 'NS');
    for (const s of [-1, 1]) { G.paint.flat(xc + s * 13.4 - 0.2, s > 0 ? -9.5 : 1, xc + s * 13.4 + 0.2, s > 0 ? -1 : 9.5, 0.012, WH); }
  }

  // ---------- zemin ----------
  const ground = new THREE.Group(); scene.add(ground);
  const plane = (x0, z0, x1, z1, y, mat, s) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, p.getX(k) * s, p.getZ(k) * s);
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; ground.add(m); return m;
  };
  plane(-368, -348, 368, PARK_Z, 0, M.asphalt, 1 / 6);
  for (const Z of ZR) if (Z.major) { plane(-1900, Z.c - Z.w / 2, -368, Z.c + Z.w / 2, 0, M.asphalt, 1 / 6); plane(368, Z.c - Z.w / 2, 1900, Z.c + Z.w / 2, 0, M.asphalt, 1 / 6); }
  for (const X of XR) if (X.major) plane(X.c - X.w / 2, -1900, X.c + X.w / 2, -348, 0, M.asphalt, 1 / 6);
  const landMat = std({ map: tGrass, roughness: 1, color: 0xb9ad8a });
  plane(-3200, -3200, 3200, PARK_Z, -0.03, landMat, 1 / 9);
  // dış sınır duvarı
  const WC = [0.93, 0.91, 0.86];
  const wallSeg = (x0, z0, x1, z1) => { G.wall.box((x0 + x1) / 2, 1.2, (z0 + z1) / 2, Math.abs(x1 - x0) + 0.3, 2.4, Math.abs(z1 - z0) + 0.3, { color: WC }); };
  for (const sx of [-1, 1]) {
    let s = -347; for (const Z of ZR.filter((z) => z.major)) { wallSeg(sx * 366, s, sx * 366, Z.c - Z.w / 2 - 0.5); s = Z.c + Z.w / 2 + 0.5; }
  }
  { let s = -366; for (const X of XR.filter((x) => x.major)) { wallSeg(s, -347, X.c - X.w / 2 - 0.5, -347); s = X.c + X.w / 2 + 0.5; } wallSeg(s, -347, 366, -347); }

  // ---------- falez parkı ----------
  for (let x = -2400; x < 2400; x += 8) {
    const e0 = edge(x), e1 = edge(x + 8);
    G.grass.quad([x, 0.15, e0], [x + 8, 0.15, e1], [x + 8, 0.15, 213], [x, 0.15, 213], [0, 1, 0], [x / 4, e0 / 4, (x + 8) / 4, 213 / 4]);
  }
  G.paver.box(0, 0.08, 210, 4800, 0.16, 6, { uv: 0.5 });
  G.wall.box(0, 0.085, PARK_Z + 0.1, 4800, 0.17, 0.2, { color: CURB });
  const RAIL = [0.75, 0.76, 0.78];
  for (let x = -480; x < 480; x += 3) {
    const z0 = edge(x) - 0.8, z1 = edge(x + 3) - 0.8, len = Math.hypot(3, z1 - z0), rot = Math.atan2(-(z1 - z0), 3);
    G.metal.box(x, 0.15 + 0.6, z0, 0.07, 1.2, 0.07, { color: RAIL });
    for (const y of [0.55, 0.85, 1.17]) G.metal.box(x + 1.5, 0.15 + y, (z0 + z1) / 2, len, 0.05, 0.05, { rot, color: RAIL });
  }
  const WOOD = lin('#7b5a3a');
  for (let x = -470; x < 470; x += 13) {
    palm(x + R(-1, 1), 215.5); if (r() < 0.5) palm(x + R(3, 9), R(224, edge(x) - 6));
    if (r() < 0.5) lamp(x + 6, 214, Math.PI / 2);
    if (r() < 0.55) tree(x + R(2, 10), R(220, edge(x) - 8), 0.15, r() < 0.6 ? 'pine' : 'orange');
    if (r() < 0.45) {
      const bx = x + 5, bz = edge(x + 5) - 3.2;
      G.wall.box(bx, 0.15 + 0.45, bz, 1.9, 0.07, 0.5, { color: WOOD, bottom: true });
      G.wall.box(bx, 0.15 + 0.75, bz - 0.25, 1.9, 0.5, 0.06, { color: WOOD });
      for (const s of [-0.8, 0.8]) G.metal.box(bx + s, 0.15 + 0.22, bz, 0.06, 0.45, 0.45, { color: DK });
      addCol(bx - 1, bz - 0.4, bx + 1, bz + 0.3, 1);
    }
  }
  // falez yüzü
  {
    const pos = [], uv = [], idx = [], NX = 800, NY = 8;
    const hn = (x, j) => Math.sin(x * 0.11 + j * 2.1) * 1.6 + Math.sin(x * 0.037 + j) * 3 + Math.sin(x * 0.53 + j * 5) * 0.7;
    for (let i = 0; i <= NX; i++) for (let j = 0; j <= NY; j++) {
      const x = -2400 + i * 6, t = j / NY;
      const y = 0.15 - (0.15 - SEA_Y + 3) * Math.pow(t, 0.85), z = edge(x) + (j === 0 ? 0 : 1.5 + 11 * t * t + hn(x, j));
      pos.push(x, y, z); uv.push(x / 24, y / 24);
      if (i < NX && j < NY) { const a = i * (NY + 1) + j, b = a + NY + 1; idx.push(a, a + 1, b + 1, a, b + 1, b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.rock); m.receiveShadow = true; scene.add(m);
  }

  // ---------- uzak şehir ----------
  {
    const tf = TX.farFacade(); tf.repeat.set(5, 7);
    const far = new Inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), std({ map: tf, roughness: 0.9 }), { cast: false, receive: false });
    const majorsZ = ZR.filter((z) => z.major), majorsX = XR.filter((x) => x.major);
    for (let x = -1700; x <= 1700; x += 46) for (let z = -1700; z <= 160; z += 44) {
      if (Math.abs(x) < 392 && z > -372) continue;
      const px = x + R(-8, 8), pz = z + R(-8, 8);
      if (majorsZ.some((m) => Math.abs(pz - m.c) < 22) || majorsX.some((m) => Math.abs(px - m.c) < 22 && pz < -300)) continue;
      far.add(px, 0, pz, 0, R(17, 26), R(13, 34) + (r() < 0.05 ? 25 : 0), R(15, 22), lin(pick(WALLS)));
    }
    scene.add(far.build());
  }

  // ---------- dağlar (Beydağları) ----------
  {
    const g = new Geo(), hz = lin('#c6d6e2');
    const layer = (Rd, amp, seed, top) => {
      const rr = rng(seed), ph = [rr() * 6, rr() * 6, rr() * 6, rr() * 6], N = 260;
      const pt = (i) => {
        const t = -3.05 + (i / N) * 4.5, env = 0.28 + 0.72 * Math.exp(-Math.pow((t - 0.45) / 0.75, 2));
        const tp = Math.min(1, Math.max(0, (1.45 - t) / 0.5)) * Math.min(1, Math.max(0, (t + 3.05) / 0.5));
        const h = amp * env * tp * tp * (3 - 2 * tp) * (0.55 + 0.25 * Math.sin(t * 7 + ph[0]) + 0.14 * Math.sin(t * 17 + ph[1]) + 0.08 * Math.sin(t * 41 + ph[2]) + 0.05 * Math.sin(t * 89 + ph[3]));
        return [-Math.cos(t) * Rd, Math.max(0, h), Math.sin(t) * Rd];
      };
      for (let i = 0; i < N; i++) {
        const a = pt(i), b = pt(i + 1), base = g.count;
        g.p.push(a[0], -40, a[2], b[0], -40, b[2], b[0], b[1], b[2], a[0], a[1], a[2]);
        for (let k = 0; k < 4; k++) { g.n.push(0, 0, 1); g.u.push(0, 0); }
        const ta = Math.min(1, a[1] / amp), tb = Math.min(1, b[1] / amp);
        g.c.push(...hz, ...hz, ...top.map((v, k) => hz[k] + (v - hz[k]) * tb), ...top.map((v, k) => hz[k] + (v - hz[k]) * ta));
        g.i.push(base, base + 1, base + 2, base, base + 2, base + 3); g.count += 4;
      }
    };
    layer(9800, 1500, 5, lin('#8fa6bd')); layer(8200, 1050, 9, lin('#6f8aa6'));
    const m = new THREE.Mesh(g.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    m.frustumCulled = false; scene.add(m);
  }

  // ---------- park yerleri ----------
  const parkSpots = [];
  for (const X of XR) if (!X.major) for (let j = 0; j < ZR.length - 1; j++) {
    const a = ZR[j].c + ZR[j].w / 2 + 7, b = ZR[j + 1].c - ZR[j + 1].w / 2 - 7;
    for (let z = a; z < b; z += 5.7) {
      if (r() < 0.55) parkSpots.push({ x: X.c + X.w / 2 - 1.05, z, a: Math.PI / 2 });
      if (r() < 0.3) parkSpots.push({ x: X.c - X.w / 2 + 1.05, z, a: -Math.PI / 2 });
    }
  }
  for (const Z of ZR) if (!Z.major) for (let i = 0; i < XR.length - 1; i++) {
    const a = XR[i].c + XR[i].w / 2 + 7, b = XR[i + 1].c - XR[i + 1].w / 2 - 7;
    for (let x = a; x < b; x += 5.7) {
      if (r() < 0.5) parkSpots.push({ x, z: Z.c + Z.w / 2 - 1.05, a: 0 });
      if (r() < 0.25) parkSpots.push({ x, z: Z.c - Z.w / 2 + 1.05, a: Math.PI });
    }
  }

  // ---------- sahneye ekle ----------
  const add = (k, o) => { const m = G[k].mesh(M[k], o); scene.add(m); return m; };
  add('facade'); add('wall'); add('metal'); add('solar'); add('sign', { cast: false }); add('paver'); add('grass', { cast: false });
  add('paint', { cast: false }); add('leaf'); const gl = add('glass', { cast: false, receive: false }); gl.renderOrder = 2;
  for (const k in I) scene.add(I[k].build());
  const lightMats = {};
  for (const grp of ['EW', 'NS']) for (const k of ['r', 'y', 'g']) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x111111 }); lightMats[grp + k] = mat;
    scene.add(new THREE.Mesh(lights[grp][k].geometry(), mat));
  }

  function groundY(x, z) {
    if (z > PARK_Z) return 0.15;
    for (const b of blocks) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return 0.15;
    for (const m of medians) if (x > m.x0 && x < m.x1 && z > m.z0 && z < m.z1) return 0.22;
    return 0;
  }

  return { colliders, near, addCol, buildings, restaurants, blocks, parkSpots, groundY, lightMats, CARCOL, R: r };
}
