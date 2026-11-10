import * as THREE from '../vendor/three-bundle.js';

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 1D fractal value noise in 0..1 */
export function fbm1(x, oct = 4) {
  let a = 0.5, s = 0, n = 0;
  for (let o = 0; o < oct; o++) {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    s += a * lerp(hash2(i, o * 17), hash2(i + 1, o * 17), u); n += a; a *= 0.5; x *= 2.03;
  }
  return s / n;
}
export const hash2 = (x, y) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function pointInPoly(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

export function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t, cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

/** Miter-offset a polygon (positive shoelace winding in x,z). d > 0 grows it. */
export function offsetPoly(p, d) {
  const n = p.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n];
    let e1x = b[0] - a[0], e1z = b[1] - a[1], e2x = c[0] - b[0], e2z = c[1] - b[1];
    const l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
    e1x /= l1; e1z /= l1; e2x /= l2; e2z /= l2;
    const n1x = e1z, n1z = -e1x, n2x = e2z, n2z = -e2x;
    let mx = n1x + n2x, mz = n1z + n2z;
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-4) { out.push([b[0] + n1x * d, b[1] + n1z * d]); continue; }
    mx /= ml; mz /= ml;
    const k = Math.min(2.2, 1 / Math.max(0.2, mx * n1x + mz * n1z));
    out.push([b[0] + mx * d * k, b[1] + mz * d * k]);
  }
  return out;
}

/**
 * Accumulates quads/boxes into a single indexed geometry with uv + vertex colour.
 * Everything static in the city is poured into a handful of these per map tile.
 */
export class Geo {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.count = 0; }

  vert(x, y, z, nx, ny, nz, u, v, col) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, v);
    this.c.push(col[0], col[1], col[2]);
    return this.count++;
  }

  /**
   * Quad a,b,c,d. uv = [u0,v0,u1,v1] mapped a=(u0,v0) b=(u1,v0) c=(u1,v1) d=(u0,v1).
   * If dir is given the winding is flipped when needed so the face looks towards dir.
   */
  quad(a, b, c, d, uv, col, dir, nrm) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const flip = dir && nx * dir[0] + ny * dir[1] + nz * dir[2] < 0;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    if (nrm) { nx = nrm[0]; ny = nrm[1]; nz = nrm[2]; }
    const [u0, v0, u1, v1] = uv;
    const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, u0, v0, col);
    this.vert(b[0], b[1], b[2], nx, ny, nz, u1, v0, col);
    this.vert(c[0], c[1], c[2], nx, ny, nz, u1, v1, col);
    this.vert(d[0], d[1], d[2], nx, ny, nz, u0, v1, col);
    if (flip) this.i.push(i0, i0 + 2, i0 + 1, i0, i0 + 3, i0 + 2);
    else this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }

  /** Flat polygon cap (points [x,z]) at height y facing up (or down), uv in metres / s. */
  cap(poly, y, s, col, up = true) {
    const tris = THREE.ShapeUtils.triangulateShape(poly.map((p) => new THREE.Vector2(p[0], p[1])), []);
    const base = this.count;
    for (const p of poly) this.vert(p[0], y, p[1], 0, up ? 1 : -1, 0, p[0] / s, p[1] / s, col);
    for (const t of tris) {
      const a = poly[t[0]], b = poly[t[1]], c = poly[t[2]];
      // three.js front faces are counter-clockwise: check which way this one winds in 3D
      const ny = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
      if ((ny > 0) === up) this.i.push(base + t[0], base + t[1], base + t[2]);
      else this.i.push(base + t[0], base + t[2], base + t[1]);
    }
  }

  /**
   * Oriented box. o = origin (centre of the base), ax = unit "right" vector in xz [x,z],
   * w along ax, h up, d along the perpendicular (centred). uvScale = metres per uv unit.
   */
  box(ox, oy, oz, ax, w, h, d, col, uvScale = 1, skip = '', u0 = 0) {
    const rx = ax[0], rz = ax[1], fx = -rz, fz = rx; // forward = right rotated 90deg
    const hw = w / 2, hd = d / 2;
    const P = (sx, y, sz) => [ox + rx * sx * hw + fx * sz * hd, oy + y, oz + rz * sx * hw + fz * sz * hd];
    const s = uvScale;
    if (!skip.includes('f')) this.quad(P(-1, 0, 1), P(1, 0, 1), P(1, h, 1), P(-1, h, 1), [u0, oy / s, u0 + w / s, (oy + h) / s], col);
    if (!skip.includes('b')) this.quad(P(1, 0, -1), P(-1, 0, -1), P(-1, h, -1), P(1, h, -1), [u0 + w / s, oy / s, u0, (oy + h) / s], col);
    if (!skip.includes('r')) this.quad(P(1, 0, 1), P(1, 0, -1), P(1, h, -1), P(1, h, 1), [0, 0, d / s, h / s], col);
    if (!skip.includes('l')) this.quad(P(-1, 0, -1), P(-1, 0, 1), P(-1, h, 1), P(-1, h, -1), [0, 0, d / s, h / s], col);
    if (!skip.includes('t')) this.quad(P(-1, h, 1), P(1, h, 1), P(1, h, -1), P(-1, h, -1), [0, 0, w / s, d / s], col);
    if (!skip.includes('u')) this.quad(P(-1, 0, -1), P(1, 0, -1), P(1, 0, 1), P(-1, 0, 1), [0, 0, w / s, d / s], col);
  }

  /** Append a THREE geometry transformed by matrix m, tinted with col. */
  add(geom, m, col = [1, 1, 1]) {
    const g = geom.index ? geom.toNonIndexed() : geom;
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k).applyMatrix4(m);
      const x = v.x, y = v.y, z = v.z;
      v.fromBufferAttribute(nor, k).applyMatrix3(nm).normalize();
      this.vert(x, y, z, v.x, v.y, v.z, uv ? uv.getX(k) : 0, uv ? uv.getY(k) : 0, col);
      if (k % 3 === 2) this.i.push(this.count - 3, this.count - 2, this.count - 1);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    const col = new Uint8Array(this.c.length);
    for (let k = 0; k < col.length; k++) col[k] = clamp(this.c[k], 0, 1) * 255;
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    this.p = this.n = this.u = this.c = this.i = null;
    return g;
  }
}

/** Geo buckets keyed by map tile + material, so the frustum can cull whole city blocks. */
export class Tiles {
  constructor(size = 120) { this.size = size; this.map = new Map(); }
  get(mat, x, z) {
    const key = mat + '|' + Math.floor(x / this.size) + '|' + Math.floor(z / this.size);
    let g = this.map.get(key);
    if (!g) { g = new Geo(); g.mat = mat; this.map.set(key, g); }
    return g;
  }
  /** Build meshes. opts[mat] = {material, cast, receive}. */
  toGroup(opts) {
    const group = new THREE.Group();
    for (const g of this.map.values()) {
      if (!g.count) continue;
      const o = opts[g.mat];
      const m = new THREE.Mesh(g.build(), o.material);
      m.castShadow = o.cast !== false; m.receiveShadow = o.receive !== false;
      m.matrixAutoUpdate = false;
      group.add(m);
    }
    return group;
  }
}

/** Uniform grid of 2D segments for collision and proximity queries. */
export class SegGrid {
  constructor(cell = 12) { this.cell = cell; this.map = new Map(); this.segs = []; }
  add(ax, az, bx, bz, data) {
    const s = { ax, az, bx, bz, data };
    this.segs.push(s);
    const c = this.cell;
    const x0 = Math.floor(Math.min(ax, bx) / c), x1 = Math.floor(Math.max(ax, bx) / c);
    const z0 = Math.floor(Math.min(az, bz) / c), z1 = Math.floor(Math.max(az, bz) / c);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const k = x * 4096 + z;
      let a = this.map.get(k);
      if (!a) this.map.set(k, (a = []));
      a.push(s);
    }
    return s;
  }
  /** Calls fn(seg) for all segments in cells within r of (x,z). May repeat a segment. */
  query(x, z, r, fn) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const a = this.map.get(i * 4096 + j);
      if (a) for (let k = 0; k < a.length; k++) fn(a[k]);
    }
  }
  nearest(x, z, r) {
    let best = r, hit = null;
    this.query(x, z, r, (s) => {
      const d = distToSeg(x, z, s.ax, s.az, s.bx, s.bz);
      if (d < best) { best = d; hit = s; }
    });
    return hit ? { d: best, seg: hit } : null;
  }
}
