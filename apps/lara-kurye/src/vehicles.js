// Arabalar (park halinde + trafik) ve kurye motoru.
import * as THREE from 'three';
import { Geo, rng, lin } from './builder.js';
import * as TX from './textures.js';

function carGeometry() {
  const sh = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; };
  const body = new THREE.ExtrudeGeometry(sh([[2.1, 0.3], [2.12, 0.62], [1.95, 0.78], [1.0, 0.92], [0.45, 1.38], [-0.9, 1.42], [-1.75, 1.0], [-2.08, 0.9], [-2.12, 0.35], [-2.1, 0.3]]),
    { depth: 1.62, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }).translate(0, 0, -0.81);
  const glass = new Geo();
  const ex = (pts, d) => new THREE.ExtrudeGeometry(sh(pts), { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
  glass.add(ex([[0.974, 1.013], [0.546, 1.371], [0.482, 1.294], [0.91, 0.936]], 1.42), null);
  glass.add(ex([[-0.996, 1.434], [-1.702, 1.084], [-1.658, 0.994], [-0.952, 1.344]], 1.42), null);
  glass.add(ex([[0.8, 0.98], [0.4, 1.32], [-0.86, 1.35], [-1.5, 1.02]], 1.72), null);
  const trim = new Geo(), m = new THREE.Matrix4();
  const TIRE = lin('#101012'), HUB = lin('#9a9da1'), ARCH = lin('#0a0a0b');
  for (const x of [1.3, -1.32]) for (const s of [-1, 1]) {
    trim.add(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 18).rotateX(Math.PI / 2), m.makeTranslation(x, 0.36, s * 0.853), ARCH);
    trim.add(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 18).rotateX(Math.PI / 2), m.makeTranslation(x, 0.32, s * 0.77), TIRE);
    trim.add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14).rotateX(Math.PI / 2), m.makeTranslation(x, 0.32, s * 0.885), HUB);
  }
  for (const s of [-1, 1]) {
    trim.box(2.13, 0.68, s * 0.6, 0.08, 0.13, 0.36, { color: [2.2, 2.2, 2.0] });
    trim.box(-2.13, 0.8, s * 0.62, 0.08, 0.13, 0.3, { color: [1.6, 0.05, 0.05] });
  }
  trim.box(2.15, 0.45, 0, 0.05, 0.16, 1.0, { color: ARCH });
  trim.box(2.17, 0.36, 0, 0.02, 0.11, 0.5, { color: [1.2, 1.2, 1.2] });
  trim.box(-2.16, 0.55, 0, 0.02, 0.11, 0.5, { color: [1.2, 1.2, 1.2] });
  trim.box(0, 0.24, 0, 3.9, 0.1, 1.5, { color: ARCH, bottom: true });
  return { body, glass: glass.geometry(), trim: trim.geometry() };
}

class Lane {
  constructor(pts, closed, stops = []) {
    this.pts = pts; this.closed = closed; this.cum = [0];
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; this.cum.push(this.cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    this.len = this.cum[n]; this.stops = stops; this.cars = [];
  }
  at(s) {
    s = this.closed ? ((s % this.len) + this.len) % this.len : Math.min(this.len, Math.max(0, s));
    let i = 0; while (i < this.cum.length - 2 && this.cum[i + 1] < s) i++;
    const a = this.pts[i], b = this.pts[(i + 1) % this.pts.length], t = (s - this.cum[i]) / (this.cum[i + 1] - this.cum[i] || 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
}

export function buildVehicles(scene, world, q) {
  const r = rng(99), cg = carGeometry();
  const mats = {
    body: new THREE.MeshPhysicalMaterial({ roughness: 0.42, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.06 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1b242b, roughness: 0.06, metalness: 0.92 }),
    trim: new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1, vertexColors: true }),
  };
  // trafik şeritleri
  const lanes = [];
  lanes.push(new Lane([[-274.4, -234.4], [274.4, -234.4], [274.4, 194.8], [-274.4, 194.8]], true,
    [{ s: 548.8 + 220.9, g: 'NS' }, { s: 548.8 + 429.2 + 548.8 + 181.3, g: 'NS' }]));
  const thru = (z, off, stops) => {
    lanes.push(new Lane([[-1850, z + off], [1850, z + off]], false, stops ? [{ s: 1850 - 293.4, g: 'EW' }, { s: 1850 + 266.6, g: 'EW' }] : []));
    lanes.push(new Lane([[1850, z - off], [-1850, z - off]], false, stops ? [{ s: 1850 - 293.4, g: 'EW' }, { s: 1850 + 266.6, g: 'EW' }] : []));
  };
  thru(-240, 2); thru(200, 1.8); thru(0, 3, true); thru(0, 6.6, true);
  const cars = [];
  const spawn = (lane, n) => { for (let i = 0; i < n; i++) { const c = { lane, s: (i + r() * 0.7) * lane.len / n, v: 8, vmax: 9 + r() * 4, x: 0, z: 0, a: 0, sc: [0.94 + r() * 0.14, 0.94 + r() * 0.12, 0.96 + r() * 0.08] }; lane.cars.push(c); cars.push(c); } };
  spawn(lanes[0], q.low ? 7 : 12);
  for (let i = 1; i < lanes.length; i++) spawn(lanes[i], q.low ? 6 : 11);

  const parked = world.parkSpots.filter((p) => Math.hypot(p.x + 36.9, p.z + 54) > 7);
  const N = parked.length + cars.length;
  const im = {};
  for (const k of ['body', 'glass', 'trim']) {
    im[k] = new THREE.InstancedMesh(cg[k], mats[k], N); im[k].castShadow = true; im[k].receiveShadow = k === 'body'; im[k].frustumCulled = false; scene.add(im[k]);
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(), SC = new THREE.Vector3(), C = new THREE.Color();
  const put = (i, x, y, z, a, sc) => {
    M.compose(P.set(x, y, z), Q.setFromAxisAngle(UP, a), SC.set(sc[0], sc[1], sc[2]));
    im.body.setMatrixAt(i, M); im.glass.setMatrixAt(i, M); im.trim.setMatrixAt(i, M);
  };
  const paint = (i) => { C.set(world.CARCOL[Math.floor(r() * world.CARCOL.length)]); im.body.setColorAt(i, C); };
  parked.forEach((p, i) => {
    const a = p.a + (r() - 0.5) * 0.06, sc = [0.92 + r() * 0.16, 0.94 + r() * 0.14, 0.96 + r() * 0.08];
    put(i, p.x + (r() - 0.5) * 0.2, world.groundY(p.x, p.z), p.z, a, sc); paint(i);
    const vert = Math.abs(Math.sin(p.a)) > 0.5;
    world.addCol(p.x - (vert ? 0.95 : 2.2), p.z - (vert ? 2.2 : 0.95), p.x + (vert ? 0.95 : 2.2), p.z + (vert ? 2.2 : 0.95), 1.5);
  });
  cars.forEach((c, i) => { c.i = parked.length + i; paint(c.i); });
  im.body.instanceColor.needsUpdate = true;

  let clock = 0;
  const phase = () => {
    const t = clock % 36;
    return { EW: t < 15 ? 'g' : t < 17 ? 'y' : 'r', NS: t >= 18 && t < 33 ? 'g' : t >= 33 && t < 35 ? 'y' : 'r' };
  };
  function update(dt, player) {
    clock += dt;
    const ph = phase();
    for (const g of ['EW', 'NS']) {
      world.lightMats[g + 'r'].color.setHex(ph[g] === 'r' ? 0xff2a1a : 0x2a0806);
      world.lightMats[g + 'y'].color.setHex(ph[g] === 'y' ? 0xffb400 : 0x2a1e04);
      world.lightMats[g + 'g'].color.setHex(ph[g] === 'g' ? 0x22ff66 : 0x062a10);
    }
    for (const lane of lanes) {
      lane.cars.sort((a, b) => a.s - b.s);
      const n = lane.cars.length;
      for (let k = 0; k < n; k++) {
        const c = lane.cars[k], nx = lane.cars[(k + 1) % n];
        let want = c.vmax;
        let gap = nx.s - c.s; if (gap <= 0) gap += lane.len;
        if (n > 1) want = Math.min(want, Math.max(0, (gap - 7) * 0.8));
        for (const st of lane.stops) {
          const d = st.s - c.s;
          if (d > -1 && d < 34 && (ph[st.g] === 'r' || (ph[st.g] === 'y' && d > 10))) want = Math.min(want, Math.max(0, (d - 1) * 0.7));
        }
        const dx = player.x - c.x, dz = player.z - c.z, fx = Math.cos(c.a), fz = -Math.sin(c.a);
        const f = dx * fx + dz * fz, l = Math.abs(dx * fz - dz * fx);
        if (f > 1 && f < 15 && l < 1.9) want = Math.min(want, Math.max(0, (f - 5.5) * 0.9));
        c.v += Math.max(-11 * dt, Math.min(3.2 * dt, want - c.v)); if (c.v < 0) c.v = 0;
        c.s += c.v * dt;
        if (c.s >= lane.len) c.s -= lane.len;
        const p = lane.at(c.s), p2 = lane.closed ? lane.at(c.s + 2.6) : [p[0] + (lane.pts[1][0] > lane.pts[0][0] ? 2.6 : -2.6), p[1]];
        c.a = Math.atan2(-(p2[1] - p[1]), p2[0] - p[0]); c.x = (p[0] + p2[0]) / 2; c.z = (p[1] + p2[1]) / 2;
        put(c.i, c.x, 0, c.z, c.a, c.sc);
      }
    }
    for (const k in im) im[k].instanceMatrix.needsUpdate = true;
  }
  update(0.001, { x: 1e6, z: 1e6 });
  return { update, cars, phase };
}

// ---------- kurye motoru ----------
export function buildScooter(scene) {
  const g = new THREE.Group();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const paintM = new THREE.MeshPhysicalMaterial({ color: 0xd4d6d8, roughness: 0.35, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.1 });
  const dark = std({ color: 0x141416, roughness: 0.7 }), rubber = std({ color: 0x0c0c0d, roughness: 0.95 });
  const chrome = std({ color: 0xcfd3d6, roughness: 0.12, metalness: 1 });
  const mk = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const wheelG = new THREE.CylinderGeometry(0.25, 0.25, 0.11, 20).rotateZ(Math.PI / 2), hubG = new THREE.CylinderGeometry(0.13, 0.13, 0.12, 12).rotateZ(Math.PI / 2);
  const wheels = [mk(wheelG, rubber, 0, 0.25, -0.64), mk(wheelG, rubber, 0, 0.25, 0.6)];
  mk(hubG, chrome, 0, 0.25, -0.64); mk(hubG, chrome, 0, 0.25, 0.6);
  mk(new THREE.BoxGeometry(0.36, 0.08, 0.6), dark, 0, 0.32, -0.05);
  mk(new THREE.BoxGeometry(0.42, 0.66, 0.07), paintM, 0, 0.64, -0.4).rotation.x = -0.22;
  mk(new THREE.BoxGeometry(0.15, 0.05, 0.42), paintM, 0, 0.535, -0.64);
  mk(new THREE.BoxGeometry(0.4, 0.3, 0.8), paintM, 0, 0.55, 0.36);
  mk(new THREE.BoxGeometry(0.33, 0.1, 0.68), std({ color: 0x1a1a1c, roughness: 0.55 }), 0, 0.76, 0.3);
  mk(new THREE.BoxGeometry(0.16, 0.06, 0.1), std({ color: 0x8a0a0a, emissive: 0x500000 }), 0, 0.62, 0.77);
  // direksiyon grubu (dönen kısım)
  const bars = new THREE.Group(); bars.position.set(0, 0, -0.42); g.add(bars);
  mk(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 8), dark, 0, 0.8, 0, bars).rotation.x = 0.28;
  mk(new THREE.BoxGeometry(0.36, 0.22, 0.2), paintM, 0, 1.0, -0.03, bars);
  mk(new THREE.SphereGeometry(0.085, 14, 10), std({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 0.6, roughness: 0.1 }), 0, 1.0, -0.12, bars);
  mk(new THREE.CylinderGeometry(0.018, 0.018, 0.68, 8).rotateZ(Math.PI / 2), chrome, 0, 1.11, 0.04, bars);
  for (const s of [-1, 1]) {
    mk(new THREE.CylinderGeometry(0.028, 0.028, 0.13, 10).rotateZ(Math.PI / 2), rubber, s * 0.31, 1.11, 0.04, bars);
    mk(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 6), dark, s * 0.3, 1.24, 0.03, bars).rotation.z = -s * 0.35;
    const mir = mk(new THREE.BoxGeometry(0.15, 0.09, 0.012), std({ color: 0xdfe6ea, roughness: 0.03, metalness: 1 }), s * 0.355, 1.38, 0.035, bars);
    mk(new THREE.BoxGeometry(0.165, 0.105, 0.02), dark, 0, 0, -0.012, mir);
  }
  // gösterge + telefon
  const dc = document.createElement('canvas'); dc.width = 256; dc.height = 128;
  const dashTex = new THREE.CanvasTexture(dc); dashTex.colorSpace = THREE.SRGBColorSpace;
  const dash = mk(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshBasicMaterial({ map: dashTex, toneMapped: false }), 0, 1.135, 0.0, bars);
  dash.rotation.x = -1.0; dash.castShadow = false;
  mk(new THREE.BoxGeometry(0.22, 0.03, 0.13), dark, 0, 1.12, -0.01, bars).rotation.x = Math.PI / 2 - 1.0;
  const pc = document.createElement('canvas'); pc.width = 128; pc.height = 256;
  const phoneTex = new THREE.CanvasTexture(pc); phoneTex.colorSpace = THREE.SRGBColorSpace;
  const phone = mk(new THREE.PlaneGeometry(0.075, 0.15), new THREE.MeshBasicMaterial({ map: phoneTex, toneMapped: false }), 0.15, 1.25, 0.03, bars);
  phone.rotation.x = -0.6; phone.castShadow = false;
  mk(new THREE.BoxGeometry(0.085, 0.16, 0.012), dark, 0, 0, -0.008, phone);
  // kurye çantası
  const bt = TX.courierBox();
  const boxM = std({ map: bt, roughness: 0.6 });
  mk(new THREE.BoxGeometry(0.5, 0.48, 0.5), boxM, 0, 1.06, 0.74);
  // sürücü kolları (yalnızca sürüşte görünür)
  const arms = new THREE.Group(); g.add(arms); arms.visible = false;
  const sleeve = std({ color: 0xb3141c, roughness: 0.85 }), glove = std({ color: 0x18181a, roughness: 0.8 });
  const armParts = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 1, 8).rotateX(Math.PI / 2), sleeve); a.castShadow = false; arms.add(a);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), glove); arms.add(h);
    armParts.push({ a, h, s });
  }
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  function setSteer(st) {
    bars.rotation.y = st * 0.45;
    for (const { a, h, s } of armParts) {
      tmpA.set(s * 0.31, 1.11, 0.04).applyAxisAngle(new THREE.Vector3(0, 1, 0), bars.rotation.y).add(bars.position);
      tmpB.set(s * 0.4, 0.98, 0.3);
      h.position.copy(tmpA); a.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
      a.scale.z = tmpA.distanceTo(tmpB); a.lookAt(g.localToWorld(tmpB.clone()));
    }
  }
  let lastKey = '';
  function drawDash(kmh, info) {
    const key = Math.round(kmh) + '|' + (info ? info.label + Math.round(info.dist / 5) + Math.round(info.ang * 8) : '');
    if (key === lastKey) return; lastKey = key;
    let x = dc.getContext('2d');
    x.fillStyle = '#05080c'; x.fillRect(0, 0, 256, 128);
    x.fillStyle = '#7fe7ff'; x.font = '900 84px "DejaVu Sans Mono",monospace'; x.textAlign = 'right'; x.textBaseline = 'middle';
    x.fillText(String(Math.round(kmh)), 170, 66);
    x.font = '700 24px sans-serif'; x.textAlign = 'left'; x.fillText('km/s', 178, 84);
    x.fillStyle = '#2bd66b'; x.fillRect(12, 112, Math.min(1, kmh / 80) * 232, 8);
    dashTex.needsUpdate = true;
    x = pc.getContext('2d');
    x.fillStyle = '#10151c'; x.fillRect(0, 0, 128, 256);
    x.fillStyle = '#1e2733'; x.fillRect(0, 0, 128, 44);
    x.fillStyle = '#fff'; x.font = '700 17px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(info ? info.label : 'Sipariş bekleniyor', 64, 23);
    if (info) {
      x.save(); x.translate(64, 128); x.rotate(info.ang);
      x.fillStyle = info.color; x.beginPath(); x.moveTo(0, -52); x.lineTo(34, 30); x.lineTo(0, 12); x.lineTo(-34, 30); x.closePath(); x.fill(); x.restore();
      x.fillStyle = '#fff'; x.font = '900 30px sans-serif'; x.fillText(Math.round(info.dist) + ' m', 64, 222);
    }
    phoneTex.needsUpdate = true;
  }
  drawDash(0, null);
  scene.add(g);
  return { group: g, wheels, arms, setSteer, drawDash, eye: new THREE.Vector3(0, 1.43, 0.22) };
}
