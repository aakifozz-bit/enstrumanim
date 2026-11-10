// Terrain from SRTM elevation + OSM coastline, the splat-mapped ground, the sea and the far mountains.
import * as THREE from '../vendor/three-bundle.js';
import { clamp, lerp, smoothstep, pointInPoly, fbm1 } from './util.js';

export const QUAY = 1.4; // harbour quay height above the water

export function buildTerrain(data, T, q) {
  const [bx0, bz0, bx1, bz1] = data.bounds;
  const M = 40; // margin beyond the data bounds
  const x0 = bx0 - M, z0 = bz0 - M, x1 = bx1 + M, z1 = bz1 + M;
  const W = x1 - x0, D = z1 - z0;

  // ---- signed distance to the coastline (positive on land) on a coarse grid ----
  const cs = 4, cnx = Math.ceil(W / cs) + 1, cnz = Math.ceil(D / cs) + 1;
  const sdf = new Float32Array(cnx * cnz);
  const coast = data.coast[0];
  const sdAt = (px, pz) => {
    let best = 1e9, side = 1;
    for (let i = 0; i < coast.length - 1; i++) {
      const ax = coast[i][0], az = coast[i][1], dx = coast[i + 1][0] - ax, dz = coast[i + 1][1] - az;
      const l2 = dx * dx + dz * dz;
      const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
      const ex = px - ax - dx * t, ez = pz - az - dz * t;
      const d = ex * ex + ez * ez;
      if (d < best - 1e-6) { best = d; side = dx * (pz - az) - dz * (px - ax); }
    }
    return Math.sqrt(best) * (side > 0 ? 1 : -1);
  };
  const flip = sdAt(-400, 100) > 0 ? -1 : 1; // that point is open sea
  for (let j = 0; j < cnz; j++) for (let i = 0; i < cnx; i++) sdf[j * cnx + i] = sdAt(x0 + i * cs, z0 + j * cs) * flip;
  // piers are land too
  const pierD = (px, pz) => {
    let best = 1e9;
    for (const p of data.piers) for (let i = 0; i < p.length - 1; i++) {
      const ax = p[i][0], az = p[i][1], dx = p[i + 1][0] - ax, dz = p[i + 1][1] - az;
      const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      best = Math.min(best, Math.hypot(px - ax - dx * t, pz - az - dz * t));
    }
    return best;
  };
  const bil = (g, nx, nz, fx, fz) => {
    fx = clamp(fx, 0, nx - 1.001); fz = clamp(fz, 0, nz - 1.001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * nx + i;
    return lerp(lerp(g[k], g[k + 1], u), lerp(g[k + nx], g[k + nx + 1], u), v);
  };
  const coastDist = (x, z) => bil(sdf, cnx, cnz, (x - x0) / cs, (z - z0) / cs);

  // ---- SRTM, lightly blurred (it is a surface model: rooftops leak into it) ----
  const E = data.elev;
  let eh = Float32Array.from(E.h);
  for (let pass = 0; pass < 2; pass++) {
    const o = new Float32Array(eh.length);
    for (let j = 0; j < E.nz; j++) for (let i = 0; i < E.nx; i++) {
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= E.nx || jj >= E.nz) continue;
        const w = di === 0 && dj === 0 ? 2 : 1; s += eh[jj * E.nx + ii] * w; n += w;
      }
      o[j * E.nx + i] = s / n;
    }
    eh = o;
  }
  const srtm = (x, z) => bil(eh, E.nx, E.nz, (x - E.x0) / E.step, (z - E.z0) / E.step);

  // ---- final height field on a fine grid shared by rendering and physics ----
  const gs = q.ground, nx = Math.ceil(W / gs) + 1, nz = Math.ceil(D / gs) + 1;
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * gs, z = z0 + j * gs, d = coastDist(x, z);
    let h;
    if (d > 0) h = lerp(QUAY, Math.max(srtm(x, z), QUAY), smoothstep(5, 30, d));
    else {
      h = QUAY - smoothstep(-0.5, 3.5, -d) * 6.5;
      if (d > -40) { const pd = pierD(x, z); if (pd < 2.2) h = Math.max(h, lerp(QUAY - 0.25, h, smoothstep(1.4, 2.2, pd))); }
    }
    H[j * nx + i] = h;
  }
  const groundY = (x, z) => bil(H, nx, nz, (x - x0) / gs, (z - z0) / gs);

  // ---- splat mask: R cobbled lanes, G planted, B asphalt ----
  const MS = q.mask, mc = document.createElement('canvas');
  mc.width = mc.height = MS;
  const g = mc.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, MS, MS);
  g.globalCompositeOperation = 'lighter';
  const mx = (x) => (x - x0) / W * MS, mz = (z) => (z - z0) / D * MS;
  const path = (p) => { g.beginPath(); p.forEach((v, i) => (i ? g.lineTo(mx(v[0]), mz(v[1])) : g.moveTo(mx(v[0]), mz(v[1])))); };
  g.lineCap = g.lineJoin = 'round';
  g.fillStyle = '#00ff00';
  for (const p of data.parks) { path(p); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  const sx = MS / W;
  const isOld = (r) => { const m = r.p[r.p.length >> 1]; return pointInPoly(m[0], m[1], data.oldTown); };
  for (const r of data.roads) {
    r.old = isOld(r);
    const soft = r.old || r.k === 'pedestrian' || r.k === 'footway' || r.k === 'steps' || r.k === 'path';
    g.strokeStyle = soft ? '#ff0000' : '#0000ff';
    g.lineWidth = (r.w + (r.old ? 4.5 : 1)) * sx;
    path(r.p); g.stroke();
  }
  g.strokeStyle = '#ff0000'; g.lineWidth = 30 * sx;
  const harbour = coast.filter((p) => p[0] > -420 && p[0] < -150 && p[1] > -160 && p[1] < 80);
  path(harbour); g.stroke();
  g.lineWidth = 5 * sx; for (const p of data.piers) { path(p); g.stroke(); }
  const mask = new THREE.CanvasTexture(mc);
  mask.anisotropy = 4; mask.colorSpace = THREE.NoColorSpace; mask.flipY = false;

  // ---- ground mesh ----
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(nx * nz * 3), nor = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = (j * nx + i) * 3;
    pos[k] = x0 + i * gs; pos[k + 1] = H[j * nx + i]; pos[k + 2] = z0 + j * gs;
    const hl = H[j * nx + Math.max(i - 1, 0)], hr = H[j * nx + Math.min(i + 1, nx - 1)];
    const hu = H[Math.max(j - 1, 0) * nx + i], hd = H[Math.min(j + 1, nz - 1) * nx + i];
    const l = Math.hypot(hl - hr, 2 * gs, hu - hd);
    nor[k] = (hl - hr) / l; nor[k + 1] = 2 * gs / l; nor[k + 2] = (hu - hd) / l;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let c = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
    idx[c++] = a; idx[c++] = d; idx[c++] = b; idx[c++] = b; idx[c++] = d; idx[c++] = e;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  const gmat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  gmat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, {
      tMask: { value: mask }, tCobC: { value: T.cobble.map }, tCobN: { value: T.cobble.normalMap }, tCobO: { value: T.cobble.ormMap },
      tDirtC: { value: T.dirt.map }, tDirtN: { value: T.dirt.normalMap }, tAsph: { value: T.asphalt.map }, tGrass: { value: T.grass.map },
      uRect: { value: new THREE.Vector4(x0, z0, 1 / W, 1 / D) },
    });
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWp;
      uniform sampler2D tMask, tCobC, tCobN, tCobO, tDirtC, tDirtN, tAsph, tGrass;
      uniform vec4 uRect;
      vec3 gTn; float gRough;`)
      .replace('#include <map_fragment>', `
      vec2 wp = vWp.xz;
      vec3 mk = texture2D(tMask, (wp - uRect.xy) * uRect.zw).rgb;
      float macro = texture2D(tDirtC, wp * 0.0041).r;
      float brk = texture2D(tDirtC, wp * 0.11).g - 0.45;
      float mCob = smoothstep(0.38, 0.62, mk.r + brk * 0.55);
      float mAsp = smoothstep(0.4, 0.6, mk.b + brk * 0.2) * (1.0 - mCob);
      float mGrs = smoothstep(0.4, 0.6, mk.g + brk * 0.6) * (1.0 - mCob) * (1.0 - mAsp);
      vec2 uvC = wp / 2.7;
      vec3 cobO = texture2D(tCobO, uvC).rgb;
      vec3 colC = texture2D(tCobC, uvC).rgb * cobO.r;
      vec3 colD = texture2D(tDirtC, wp / 3.7).rgb;
      vec3 col = colD;
      vec3 tn = texture2D(tDirtN, wp / 3.7).xyz * 2.0 - 1.0; tn.xy *= 0.45;
      float rgh = 0.95;
      col = mix(col, texture2D(tGrass, wp / 3.1).rgb, mGrs);
      col = mix(col, texture2D(tAsph, wp / 4.3).rgb, mAsp); rgh = mix(rgh, 0.82, mAsp);
      tn = mix(tn, vec3(tn.xy * 0.35, 1.0), mAsp);
      col = mix(col, colC, mCob); rgh = mix(rgh, cobO.g, mCob);
      tn = mix(tn, texture2D(tCobN, uvC).xyz * 2.0 - 1.0, mCob);
      col *= 0.78 + macro * 0.5;
      gTn = tn; gRough = rgh;
      diffuseColor.rgb *= col;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize(normal + mat3(viewMatrix) * vec3(gTn.x, 0.0, gTn.y) * 1.25);');
  };
  const ground = new THREE.Mesh(geo, gmat);
  ground.receiveShadow = true; ground.castShadow = false;
  ground.matrixAutoUpdate = false;

  const group = new THREE.Group();
  group.add(ground);

  // ---- hinterland plateau beyond the mapped tile ----
  const far = new THREE.MeshStandardMaterial({ color: 0x8d8674, roughness: 1 });
  const slab = (ax, az, bx, bz, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(bx - ax, bz - az), far);
    m.rotation.x = -Math.PI / 2; m.position.set((ax + bx) / 2, y, (az + bz) / 2); group.add(m);
  };
  slab(-6000, -6000, 6000, z0 + 1, 44); slab(x1 - 1, z0, 6000, 6000, 40); slab(60, z1 - 1, x1, 6000, 33); slab(-6000, z0, x0 + 1, -150, 40);

  // ---- sea ----
  const seaMat = new THREE.MeshStandardMaterial({ color: 0x08303f, roughness: 0.09, metalness: 0.0, envMapIntensity: 1.0 });
  const seaU = { uTime: { value: 0 }, tWat: { value: T.water } };
  seaMat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, seaU);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uTime; uniform sampler2D tWat;')
      .replace('#include <normal_fragment_maps>', `
      vec2 w = vWp.xz;
      vec3 n1 = texture2D(tWat, w / 23.0 + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
      vec3 n2 = texture2D(tWat, w.yx / 9.0 - vec2(uTime * 0.021, -uTime * 0.013)).xyz * 2.0 - 1.0;
      vec3 n3 = texture2D(tWat, w / 71.0 + vec2(-uTime * 0.006, uTime * 0.004)).xyz * 2.0 - 1.0;
      float fade = 1.0 / (1.0 + length(vViewPosition) * 0.004);
      vec3 tn = n1 * 0.5 + n2 * 0.32 * fade + n3 * 0.6;
      normal = normalize(normal + mat3(viewMatrix) * vec3(tn.x, 0.0, -tn.y) * 0.34);`)
      .replace('#include <map_fragment>', `
      diffuseColor.rgb *= 0.8 + 0.5 * texture2D(tWat, vWp.xz / 130.0 + uTime * 0.002).r;`);
  };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.y = 0; sea.receiveShadow = true;
  group.add(sea);

  // ---- Beydağları across the gulf ----
  const mountainMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const ridge = (dist, hMax, seed, a0, a1, shade) => {
    const n = 260, p = [], col = [], ix = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = lerp(a0, a1, t);
      const env = Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 0.45);
      const h = hMax * env * (0.35 + 0.65 * fbm1(t * 9 + seed, 5)) + 6;
      const x = Math.sin(a) * dist, z = -Math.cos(a) * dist;
      p.push(x, -5, z, x, h, z);
      col.push(1, 1, 1, shade, shade, shade);
      if (i < n) { const k = i * 2; ix.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    gg.setIndex(ix);
    const m = new THREE.Mesh(gg, mountainMat); m.frustumCulled = false; m.renderOrder = -1;
    group.add(m);
  };
  // azimuth measured clockwise from north; the range fills the western horizon
  ridge(5600, 560, 3, Math.PI * 0.98, Math.PI * 1.72, 0.74);
  ridge(5200, 400, 11, Math.PI * 1.02, Math.PI * 1.62, 0.6);
  ridge(4800, 230, 23, Math.PI * 1.08, Math.PI * 1.5, 0.46);

  return { group, groundY, coastDist, seaU, mountainMat, rect: [x0, z0, x1, z1] };
}
