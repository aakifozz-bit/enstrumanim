// Küçük geometri biriktirici: binlerce kutuyu / dörtgeni tek BufferGeometry'de toplar.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

export class Geo {
  constructor() {
    this.p = []; this.n = []; this.u = []; this.c = []; this.i = [];
    this.count = 0;
  }

  // a,b,c,d: [x,y,z] (dışarıdan bakınca sol-alt, sağ-alt, sağ-üst, sol-üst), uv: [u0,v0,u1,v1]
  quad(a, b, c, d, n, uv, col = [1, 1, 1]) {
    const base = this.count;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    for (let k = 0; k < 4; k++) {
      this.n.push(n[0], n[1], n[2]);
      this.c.push(col[0], col[1], col[2]);
    }
    this.u.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.count += 4;
  }

  // Y ekseni etrafında döndürülebilen kutu. uv: metre başına doku tekrarı.
  box(cx, cy, cz, sx, sy, sz, o = {}) {
    const rot = o.rot || 0, col = o.color || [1, 1, 1], s = o.uv ?? 0.5;
    const hx = sx / 2, hz = sz / 2, y0 = cy - sy / 2, y1 = cy + sy / 2;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const L = [[-hx, hz], [hx, hz], [hx, -hz], [-hx, -hz]].map(([lx, lz]) => [
      cx + lx * cs + lz * sn, cz - lx * sn + lz * cs,
    ]);
    for (let k = 0; k < 4; k++) {
      const A = L[k], B = L[(k + 1) % 4];
      const dx = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dx, dz) || 1;
      this.quad([A[0], y0, A[1]], [B[0], y0, B[1]], [B[0], y1, B[1]], [A[0], y1, A[1]],
        [-dz / len, 0, dx / len], [0, 0, len * s, sy * s], col);
    }
    if (o.top !== false) {
      this.quad([L[0][0], y1, L[0][1]], [L[1][0], y1, L[1][1]], [L[2][0], y1, L[2][1]], [L[3][0], y1, L[3][1]],
        [0, 1, 0], [0, 0, sx * s, sz * s], o.topColor || col);
    }
    if (o.bottom) {
      this.quad([L[3][0], y0, L[3][1]], [L[2][0], y0, L[2][1]], [L[1][0], y0, L[1][1]], [L[0][0], y0, L[0][1]],
        [0, -1, 0], [0, 0, sx * s, sz * s], col);
    }
  }

  // Yatay dörtgen (yol çizgisi, zemin vs.)
  flat(x0, z0, x1, z1, y, col = [1, 1, 1], s = 0.5) {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0],
      [x0 * s, z0 * s, x1 * s, z1 * s], col);
  }

  // Herhangi bir three geometrisini matrisle ekle.
  add(g, m, col = [1, 1, 1]) {
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const base = this.count;
    if (m) _nm.getNormalMatrix(m);
    for (let k = 0; k < pos.count; k++) {
      _v.fromBufferAttribute(pos, k); if (m) _v.applyMatrix4(m);
      this.p.push(_v.x, _v.y, _v.z);
      if (nor) { _n.fromBufferAttribute(nor, k); if (m) _n.applyMatrix3(_nm).normalize(); } else _n.set(0, 1, 0);
      this.n.push(_n.x, _n.y, _n.z);
      this.u.push(uv ? uv.getX(k) : 0, uv ? uv.getY(k) : 0);
      this.c.push(col[0], col[1], col[2]);
    }
    if (g.index) for (let k = 0; k < g.index.count; k++) this.i.push(base + g.index.getX(k));
    else for (let k = 0; k < pos.count; k++) this.i.push(base + k);
    this.count += pos.count;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }

  mesh(material, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(this.geometry(), material);
    m.castShadow = cast; m.receiveShadow = receive;
    return m;
  }
}

// InstancedMesh toplayıcı
export class Inst {
  constructor(geometry, material, { cast = true, receive = true } = {}) {
    this.g = geometry; this.mat = material; this.ms = []; this.cs = []; this.cast = cast; this.receive = receive;
  }
  add(x, y, z, rotY = 0, sx = 1, sy = sx, sz = sx, color = null) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(sx, sy, sz));
    this.ms.push(m); this.cs.push(color);
    return this.ms.length - 1;
  }
  build() {
    const im = new THREE.InstancedMesh(this.g, this.mat, Math.max(1, this.ms.length));
    im.count = this.ms.length;
    const c = new THREE.Color();
    this.ms.forEach((m, i) => {
      im.setMatrixAt(i, m);
      if (this.cs[i]) im.setColorAt(i, c.setRGB(this.cs[i][0], this.cs[i][1], this.cs[i][2]));
      else if (this.cs.some(Boolean)) im.setColorAt(i, c.setRGB(1, 1, 1));
    });
    im.castShadow = this.cast; im.receiveShadow = this.receive;
    im.frustumCulled = false;
    return im;
  }
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lin(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
