// Procedural PBR texture synthesis. Every surface in the game is generated here at load time:
// a height field + colour field are computed per material, then a tangent-space normal map
// and an ORM (occlusion / roughness / metalness) map are derived from the height field.
import * as THREE from '../vendor/three-bundle.js';
import { clamp, lerp, rng, smoothstep } from './util.js';

let maxAniso = 8;
export const setAnisotropy = (a) => { maxAniso = a; };

// ---------- tileable value noise ----------
const PERM = new Uint16Array(1024);
{ const r = rng(1337); for (let i = 0; i < 1024; i++) PERM[i] = (r() * 65536) | 0; }
const lat = (x, y, s) => PERM[(x * 73 + y * 179 + s * 31 + PERM[(y + s) & 1023]) & 1023] / 65535;
function vnoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % period) + period) % period, x1 = (x0 + 1) % period;
  const y0 = ((yi % period) + period) % period, y1 = (y0 + 1) % period;
  return lerp(lerp(lat(x0, y0, seed), lat(x1, y0, seed), u), lerp(lat(x0, y1, seed), lat(x1, y1, seed), u), v);
}
/** fbm over the unit square, tileable. freq = lattice cells across the tile. */
export function fbm(u, v, freq, oct = 5, seed = 0, gain = 0.5) {
  let a = 0.5, s = 0, n = 0;
  for (let o = 0; o < oct; o++) {
    s += a * vnoise(u * freq, v * freq, freq, seed + o * 7);
    n += a; a *= gain; freq *= 2;
  }
  return s / n;
}

// ---------- field -> textures ----------
function mkTex(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function canvasOf(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }

/**
 * fn(u, v, out) fills out = {h, r, g, b, rough, a} for one texel. Returns {map, normalMap, ormMap}.
 * strength = normal map intensity (height units per texel span).
 */
export function synth(size, fn, strength = 2, opts = {}) {
  const H = new Float32Array(size * size);
  const col = canvasOf(size), cctx = col.getContext('2d');
  const cd = cctx.createImageData(size, size);
  const orm = canvasOf(size), octx = orm.getContext('2d');
  const od = octx.createImageData(size, size);
  const o = { h: 0, r: 0, g: 0, b: 0, rough: 0.8, a: 1 };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    o.a = 1;
    fn(x / size, y / size, o);
    const k = y * size + x, k4 = k * 4;
    H[k] = o.h;
    cd.data[k4] = clamp(o.r, 0, 1) * 255; cd.data[k4 + 1] = clamp(o.g, 0, 1) * 255;
    cd.data[k4 + 2] = clamp(o.b, 0, 1) * 255; cd.data[k4 + 3] = clamp(o.a, 0, 1) * 255;
    od.data[k4 + 1] = clamp(o.rough, 0.02, 1) * 255; od.data[k4 + 2] = 0; od.data[k4 + 3] = 255;
  }
  const nrm = canvasOf(size), nctx = nrm.getContext('2d');
  const nd = nctx.createImageData(size, size);
  const m = size - 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = y * size + x, k4 = k * 4;
    const xl = H[y * size + ((x - 1) & m)], xr = H[y * size + ((x + 1) & m)];
    const yu = H[((y - 1) & m) * size + x], yd = H[((y + 1) & m) * size + x];
    let nx = (xl - xr) * strength * size / 512, ny = (yd - yu) * strength * size / 512;
    const l = Math.hypot(nx, ny, 1);
    nd.data[k4] = (nx / l * 0.5 + 0.5) * 255; nd.data[k4 + 1] = (ny / l * 0.5 + 0.5) * 255;
    nd.data[k4 + 2] = (1 / l * 0.5 + 0.5) * 255; nd.data[k4 + 3] = 255;
    // cavity occlusion: how far below the local neighbourhood is this texel?
    const r = 3;
    const avg = (H[y * size + ((x - r) & m)] + H[y * size + ((x + r) & m)] + H[((y - r) & m) * size + x] + H[((y + r) & m) * size + x]) / 4;
    od.data[k4] = clamp(1 - (avg - H[k]) * (opts.ao ?? 2.2), 0.25, 1) * 255;
  }
  cctx.putImageData(cd, 0, 0); nctx.putImageData(nd, 0, 0); octx.putImageData(od, 0, 0);
  return { map: mkTex(col, true), normalMap: mkTex(nrm, false), ormMap: mkTex(orm, false) };
}

/**
 * Coursed stone layout. Returns sample(u,v) -> {edge (0 at joint..1 inside), id (0..1 per stone), id2}
 * rows: number of courses; perRow: average stones per course; jitter in course heights / widths.
 */
function stoneLayout(rows, perRow, seed, { hJit = 0, wJit = 0.35, bevel = 0.08, round = 0 } = {}) {
  const r = rng(seed);
  const ys = [0];
  for (let i = 1; i < rows; i++) ys.push((i + (r() - 0.5) * hJit) / rows);
  ys.push(1);
  const courses = [];
  for (let i = 0; i < rows; i++) {
    const xs = [];
    let x = r();
    const start = x;
    while (x < start + 1 - 0.4 / perRow) { xs.push(x); x += (1 + (r() * 2 - 1) * wJit) / perRow; }
    courses.push({ xs, ids: xs.map(() => r()), ids2: xs.map(() => r()) });
  }
  const out = { edge: 0, id: 0, id2: 0 };
  return (u, v) => {
    v = v - Math.floor(v);
    let ri = 0;
    while (ri < rows - 1 && ys[ri + 1] <= v) ri++;
    const c = courses[ri], xs = c.xs, n = xs.length;
    let uu = u - Math.floor(u);
    if (uu < xs[0]) uu += 1;
    let si = n - 1;
    for (let k = 0; k < n - 1; k++) if (xs[k + 1] > uu) { si = k; break; }
    const x0 = xs[si], x1 = si === n - 1 ? xs[0] + 1 : xs[si + 1];
    const dx = Math.min(uu - x0, x1 - uu) * perRow, dy = Math.min(v - ys[ri], ys[ri + 1] - v) * rows;
    let d;
    if (round > 0 && dx < round && dy < round) d = round - Math.hypot(round - dx, round - dy);
    else d = Math.min(dx, dy);
    out.edge = smoothstep(0, bevel, d);
    out.id = c.ids[si]; out.id2 = c.ids2[si];
    return out;
  };
}

const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const set = (o, c, k = 1) => { o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; };

export function makeTextures(q) {
  const S = q.tex; // base resolution
  const T = {};

  // --- basalt / limestone setts worn smooth by centuries of feet ---
  {
    const lay = stoneLayout(16, 10, 11, { wJit: 0.5, hJit: 0.35, bevel: 0.2, round: 0.26 });
    T.cobble = synth(S, (u, v, o) => {
      const wu = u + (fbm(u, v, 6, 3, 3) - 0.5) * 0.03, wv = v + (fbm(u, v, 6, 3, 9) - 0.5) * 0.03;
      const s = lay(wu, wv);
      const grain = fbm(u, v, 96, 3, 5), macro = fbm(u, v, 3, 3, 21), wear = fbm(u, v, 10, 3, 31);
      const tiltx = (s.id - 0.5) * 0.5, lump = fbm(u, v, 40, 2, 33);
      const dome = s.edge * (0.6 + 0.4 * s.id2);
      o.h = dome * (0.8 + lump * 0.25 + tiltx * (wu * 26 % 1 - 0.5)) + grain * 0.1 * dome + wear * 0.15;
      const warm = [0.63, 0.57, 0.48], grey = [0.48, 0.48, 0.47], dark = [0.31, 0.31, 0.31], pale = [0.74, 0.71, 0.64];
      let c = s.id < 0.28 ? mix3(grey, dark, s.id2) : s.id < 0.8 ? mix3(grey, warm, s.id2) : mix3(warm, pale, s.id2);
      const k = (0.7 + grain * 0.45 + lump * 0.15) * (0.82 + macro * 0.36);
      c = mix3([0.3, 0.27, 0.22], c, smoothstep(0.08, 0.75, s.edge));
      set(o, c, k);
      // polished crowns, dusty joints
      o.rough = lerp(0.96, 0.52 + grain * 0.3 + s.id * 0.14 + wear * 0.12, smoothstep(0.5, 1, dome));
    }, 4.2);
  }

  // --- lime plaster, hand trowelled, weather stained ---
  T.plaster = synth(S, (u, v, o) => {
    const big = fbm(u, v, 3, 4, 40), mid = fbm(u, v, 12, 4, 41), fine = fbm(u, v, 96, 3, 42);
    const streak = fbm(u * 8, v * 0.5, 8, 4, 43) * fbm(u, v, 4, 2, 46);
    // sparse hairline cracks: a thin iso-line of one noise, only where another allows it
    const crack = Math.abs(fbm(u, v, 5, 5, 44) - 0.5), where = smoothstep(0.56, 0.66, fbm(u, v, 3, 2, 45));
    const cr = (1 - smoothstep(0.0, 0.004, crack)) * where;
    const trowel = fbm(u * 0.5, v * 2, 16, 3, 47);
    o.h = big * 0.3 + mid * 0.25 + fine * 0.2 + trowel * 0.2 - cr * 0.35;
    const k = 0.86 + big * 0.1 + fine * 0.07 - smoothstep(0.2, 0.42, streak) * 0.09 - cr * 0.14;
    set(o, [1, 0.99, 0.965], k);
    o.rough = 0.88 + fine * 0.1;
  }, 1.7);

  // --- honey limestone rubble masonry (ground floors, garden walls) ---
  {
    const lay = stoneLayout(9, 5, 71, { wJit: 0.6, hJit: 0.7, bevel: 0.2, round: 0.3 });
    T.rubble = synth(S, (u, v, o) => {
      const wu = u + (fbm(u, v, 5, 3, 72) - 0.5) * 0.05, wv = v + (fbm(u, v, 5, 3, 73) - 0.5) * 0.05;
      const s = lay(wu, wv);
      const grain = fbm(u, v, 80, 4, 74), pit = fbm(u, v, 24, 3, 75);
      o.h = s.edge * (0.6 + 0.4 * s.id2) + (grain - 0.5) * 0.25 * s.edge - smoothstep(0.62, 0.8, pit) * 0.25;
      const a = [0.86, 0.8, 0.68], b = [0.7, 0.66, 0.6], c2 = [0.95, 0.91, 0.82];
      let c = s.id < 0.5 ? mix3(a, b, s.id2) : mix3(a, c2, s.id2);
      c = mix3([0.66, 0.62, 0.55], c, smoothstep(0.05, 0.6, s.edge));
      set(o, c, 0.74 + grain * 0.36 + pit * 0.12);
      o.rough = 0.9;
    }, 3.2);
  }

  // --- dressed ashlar (city walls, towers, Roman marble with a different tint) ---
  {
    const lay = stoneLayout(6, 3, 91, { wJit: 0.4, hJit: 0.12, bevel: 0.05 });
    T.ashlar = synth(S, (u, v, o) => {
      const s = lay(u, v);
      const grain = fbm(u, v, 72, 4, 92), stain = fbm(u * 3, v * 0.5, 6, 4, 93), pit = fbm(u, v, 30, 3, 94);
      o.h = s.edge * (0.75 + 0.25 * s.id) + (grain - 0.5) * 0.14 - smoothstep(0.6, 0.85, pit) * 0.3;
      const k = (0.74 + s.id2 * 0.2 + grain * 0.22) * (1 - smoothstep(0.5, 0.85, stain) * 0.28);
      set(o, mix3([0.5, 0.45, 0.38], [1, 0.98, 0.93], smoothstep(0, 0.5, s.edge)), k);
      o.rough = 0.88;
    }, 3.2);
  }

  // --- Seljuk brick (Yivli Minare) ---
  {
    const lay = stoneLayout(16, 5, 101, { wJit: 0.12, hJit: 0.1, bevel: 0.12 });
    T.brick = synth(S / 2, (u, v, o) => {
      const s = lay(u, v);
      const grain = fbm(u, v, 64, 3, 102);
      o.h = s.edge * 0.8 + grain * 0.2;
      const c = mix3([0.58, 0.26, 0.17], [0.72, 0.4, 0.26], s.id);
      set(o, mix3([0.62, 0.56, 0.48], c, smoothstep(0.1, 0.7, s.edge)), 0.75 + grain * 0.4);
      o.rough = 0.9;
    }, 3);
  }

  // --- alaturka clay roof tiles ---
  T.roof = synth(S / 2, (u, v, o) => {
    const cols = 9, rows = 5;
    const cx = u * cols, col = Math.floor(cx), fx = cx - col;
    const ry = v * rows, row = Math.floor(ry), fy = ry - row;
    const id = fbm((col + 0.5) / cols, (row + 0.5) / rows, 32, 1, 111 + row);
    const cyl = Math.sin(fx * Math.PI);
    o.h = Math.pow(cyl, 0.7) * 0.75 + (1 - fy) * 0.3 - (fy < 0.06 ? 0.25 : 0);
    const grain = fbm(u, v, 80, 3, 112), moss = fbm(u, v, 9, 4, 113);
    let c = mix3([0.63, 0.29, 0.17], [0.8, 0.45, 0.27], id);
    c = mix3(c, [0.42, 0.36, 0.26], smoothstep(0.55, 0.8, moss) * 0.6);
    set(o, c, (0.55 + cyl * 0.45) * (0.8 + grain * 0.35) * (fy < 0.06 ? 0.5 : 1));
    o.rough = 0.85;
  }, 4);

  // --- weathered timber planks (tinted via vertex colour) ---
  T.wood = synth(S / 2, (u, v, o) => {
    const planks = 6, px = u * planks, pi = Math.floor(px), fx = px - pi;
    const id = fbm((pi + 0.5) / planks, 0.3, 16, 1, 121);
    const g = fbm(u * 1.0 + id * 3, v * 0.0625, 64, 4, 122), ring = Math.sin((g * 9 + id * 6) * 6.28) * 0.5 + 0.5;
    const gap = smoothstep(0, 0.04, Math.min(fx, 1 - fx));
    o.h = gap * 0.8 + ring * 0.12 + g * 0.1;
    set(o, [1, 0.97, 0.93], (0.62 + ring * 0.16 + id * 0.25) * (0.35 + 0.65 * gap));
    o.rough = 0.62 + ring * 0.2;
  }, 2.5);

  // --- louvred shutter slats ---
  T.louver = synth(256, (u, v, o) => {
    const fy = (v * 14) % 1;
    const frame = u < 0.1 || u > 0.9 || v < 0.05 || v > 0.95 || Math.abs(v - 0.5) < 0.03;
    const g = fbm(u, v, 48, 3, 131);
    o.h = frame ? 1 : fy * 0.8;
    set(o, [1, 1, 1], (frame ? 0.95 : 0.45 + fy * 0.55) * (0.85 + g * 0.2));
    o.rough = 0.6;
  }, 5);

  // --- compacted earth & gravel (courtyards) ---
  T.dirt = synth(S / 2, (u, v, o) => {
    const a = fbm(u, v, 6, 5, 141), f = fbm(u, v, 90, 3, 142), peb = fbm(u, v, 40, 2, 143);
    const p = smoothstep(0.62, 0.72, peb);
    o.h = a * 0.4 + f * 0.25 + p * 0.5;
    set(o, mix3([0.5, 0.42, 0.31], [0.72, 0.64, 0.5], a), 0.72 + f * 0.4 + p * 0.15);
    o.rough = 0.95;
  }, 3);

  // --- asphalt ---
  T.asphalt = synth(S / 2, (u, v, o) => {
    const f = fbm(u, v, 128, 2, 151), a = fbm(u, v, 5, 4, 152);
    o.h = f; set(o, [0.2, 0.2, 0.21], 0.7 + f * 0.5 + a * 0.3);
    o.rough = 0.8 + f * 0.15;
  }, 2);

  // --- dry Mediterranean grass ---
  T.grass = synth(S / 2, (u, v, o) => {
    const a = fbm(u, v, 8, 4, 161), f = fbm(u * 2, v, 120, 2, 162);
    o.h = f; set(o, mix3([0.26, 0.36, 0.13], [0.5, 0.5, 0.22], a), 0.6 + f * 0.7);
    o.rough = 0.95;
  }, 3);

  // --- sea surface normals: two scales of chop ---
  T.water = synth(S / 2, (u, v, o) => {
    const a = fbm(u, v, 6, 5, 171, 0.55), b = fbm(u + a * 0.08, v, 14, 4, 172);
    o.h = a * 0.7 + b * 0.3; set(o, [0.5, 0.5, 0.5]);
  }, 9).normalMap;

  // --- modern apartment facade: one 3m bay per tile ---
  T.facade = synth(256, (u, v, o) => {
    const g = fbm(u, v, 40, 3, 181);
    const wx = Math.abs(u - 0.5), wy = v - 0.5;
    const win = wx < 0.3 && wy > -0.22 && wy < 0.3;
    const frame = win && (wx > 0.27 || wy > 0.27 || wy < -0.19 || wx < 0.015);
    const balcony = wy < -0.22 && wy > -0.3;
    o.h = win ? (frame ? 0.6 : 0.2) : balcony ? 1 : 0.7 + g * 0.1;
    if (win && !frame) { set(o, [0.07, 0.09, 0.11]); o.rough = 0.08; }
    else if (frame) { set(o, [0.75, 0.75, 0.75]); o.rough = 0.5; }
    else { set(o, [1, 1, 1], (balcony ? 0.7 : 0.82) + g * 0.15); o.rough = 0.9; }
  }, 3);

  // --- foliage cards -----------------------------------------------------------------
  T.leaves = leafCard(512, 201, { leaf: [[0.1, 0.2, 0.06], [0.3, 0.44, 0.13]], n: 1300, len: 13, wid: 5.5 });
  T.bougain = leafCard(512, 211, { leaf: [[0.05, 0.12, 0.03], [0.16, 0.26, 0.07]], n: 900, len: 12, wid: 6,
    flower: [[0.55, 0.02, 0.16], [0.92, 0.1, 0.34]], nf: 1500 });
  T.frond = frondCard(512, 221);
  T.kilim = kilim(256, 231);
  T.clock = clockFace(256);
  return T;
}

function leafCard(size, seed, { leaf, n, len, wid, flower, nf = 0 }) {
  const c = canvasOf(size), g = c.getContext('2d'), r = rng(seed);
  const blob = (x, y, rx, ry, rot, col) => {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, 6.283); g.fill(); g.restore();
  };
  const css = (a, b, t, k = 1) => `rgb(${mix3(a, b, t).map((x) => Math.round(Math.pow(clamp(x * k, 0, 1), 1 / 2.2) * 255)).join(',')})`;
  // several overlapping clumps give a ragged silhouette that still reads as foliage in the mips
  const clumps = [];
  for (let i = 0; i < 7; i++) { const a = r() * 6.283, d = r() * size * 0.24; clumps.push([size / 2 + Math.cos(a) * d, size / 2 + Math.sin(a) * d, size * (0.1 + r() * 0.11)]); }
  for (let i = 0; i < n + nf; i++) {
    const isF = i >= n;
    const cl = clumps[(r() * clumps.length) | 0];
    const a = r() * 6.283, d = Math.pow(r(), 0.7) * cl[2];
    const x = cl[0] + Math.cos(a) * d, y = cl[1] + Math.sin(a) * d;
    const shade = 0.35 + (i / (n + nf)) * 0.5 + r() * 0.4;
    if (isF && flower) {
      for (let k = 0; k < 3; k++) blob(x + (r() - 0.5) * 6, y + (r() - 0.5) * 6, 3.5 + r() * 3, 2.6 + r() * 2, r() * 6.3, css(flower[0], flower[1], r(), shade));
    } else blob(x, y, len * (0.5 + r() * 0.5) * size / 512, wid * (0.5 + r() * 0.5) * size / 512, r() * 6.283, css(leaf[0], leaf[1], r(), shade));
  }
  const t = mkTex(c, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  return t;
}

function frondCard(size, seed) {
  const c = canvasOf(size), g = c.getContext('2d'), r = rng(seed);
  // a single palm frond running along +x, leaflets fanning out
  g.strokeStyle = 'rgb(120,125,60)'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, size / 2); g.lineTo(size, size / 2); g.stroke();
  for (let i = 0; i < 90; i++) {
    const t = i / 90, x = 12 + t * (size - 24);
    const L = size * 0.46 * Math.sin(Math.PI * Math.pow(t, 0.7)) + 8;
    for (const s of [-1, 1]) {
      const sh = 70 + r() * 70;
      g.strokeStyle = `rgb(${sh * 0.62 | 0},${sh | 0},${sh * 0.3 | 0})`;
      g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(x, size / 2);
      g.quadraticCurveTo(x + L * 0.25, size / 2 + s * L * 0.6, x + L * 0.5 + r() * 6, size / 2 + s * L);
      g.stroke();
    }
  }
  const t = mkTex(c, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  return t;
}

function kilim(size, seed) {
  const c = canvasOf(size), g = c.getContext('2d'), r = rng(seed);
  const pal = ['#7a1a16', '#c9a35a', '#1d2f4f', '#e8dcc0', '#a8481e', '#24452f'];
  g.fillStyle = pal[0]; g.fillRect(0, 0, size, size);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
    const cx = (x + 0.5 + (y & 1) * 0.5) * size / 8, cy = (y + 0.5) * size / 16, w = size / 16, h = size / 34;
    g.fillStyle = pal[1 + ((x * 3 + y * 5 + (r() * 2 | 0)) % 5)];
    g.beginPath(); g.moveTo(cx - w, cy); g.lineTo(cx, cy - h * 2); g.lineTo(cx + w, cy); g.lineTo(cx, cy + h * 2); g.fill();
  }
  g.strokeStyle = pal[3]; g.lineWidth = 6; g.strokeRect(8, 8, size - 16, size - 16);
  const id = g.getImageData(0, 0, size, size);
  for (let i = 0; i < id.data.length; i += 4) { const n = 0.8 + r() * 0.3; id.data[i] *= n; id.data[i + 1] *= n; id.data[i + 2] *= n; }
  g.putImageData(id, 0, 0);
  return mkTex(c, true);
}

function clockFace(size) {
  const c = canvasOf(size), g = c.getContext('2d'), m = size / 2;
  g.fillStyle = '#b9a98a'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#f4efe2'; g.beginPath(); g.arc(m, m, m * 0.9, 0, 6.3); g.fill();
  g.strokeStyle = '#1b1b1b'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#1b1b1b'; g.font = `bold ${size * 0.13}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((s, i) => {
    const a = i / 12 * 6.283 - 1.5708; g.fillText(s, m + Math.cos(a) * m * 0.7, m + Math.sin(a) * m * 0.7);
  });
  const hand = (a, l, w) => { g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(m, m); g.lineTo(m + Math.cos(a) * l, m + Math.sin(a) * l); g.stroke(); };
  hand(6.5 / 12 * 6.283 - 1.5708 + 0.26, m * 0.45, 9); hand(42 / 60 * 6.283 - 1.5708, m * 0.68, 5);
  return mkTex(c, true);
}
