// Kaleiçi — a motorcycle ride through Antalya's old town, built on its real street plan.
import * as THREE from '../vendor/three-bundle.js';
import data from '../data/kaleici.js';
import { makeTextures, setAnisotropy } from './textures.js';
import { buildTerrain } from './terrain.js';
import { buildCity } from './city.js';
import { buildProps } from './props.js';
import { Bike } from './bike.js';
import { Atmosphere, TIMES } from './env.js';
import { Sound } from './audio.js';
import { clamp, lerp, damp, smoothstep, distToSeg } from './util.js';

const $ = (s) => document.querySelector(s);
const coarse = matchMedia('(pointer: coarse)').matches;
const dpr = window.devicePixelRatio || 1;
const QUALITY = {
  low: { label: 'Düşük', pr: Math.min(dpr, 1), shadow: 1024, range: 60, msaa: 0, ao: false, bloom: false, lampLights: 0, aoSamples: 8 },
  med: { label: 'Orta', pr: Math.min(dpr, 1.25), shadow: 2048, range: 80, msaa: 2, ao: false, bloom: true, lampLights: 4, aoSamples: 8 },
  high: { label: 'Yüksek', pr: Math.min(dpr, 1.5), shadow: 4096, range: 100, msaa: 4, ao: true, bloom: true, lampLights: 6, aoSamples: 12 },
  ultra: { label: 'Ultra', pr: Math.min(dpr, 2), shadow: 4096, range: 120, msaa: 4, ao: true, bloom: true, lampLights: 8, aoSamples: 16 },
};
const QKEYS = Object.keys(QUALITY);
let qKey = QKEYS.includes(location.hash.slice(1)) ? location.hash.slice(1) : coarse ? 'low' : 'high';
// world detail is fixed at load time by device class
const WORLD = coarse || qKey === 'low' ? { tex: 512, ground: 3, mask: 2048, foliage: 0.6 } : { tex: 1024, ground: 2, mask: 4096, foliage: 1 };
const withWorld = (k) => ({ ...QUALITY[k], ...WORLD, lampLights: QUALITY[qKey].lampLights });

const INFO = {
  hadrian: ['Hadrian Kapısı', 'Üçkapılar · MS 130 — İmparator Hadrianus\'un kente gelişi anısına'],
  yivli: ['Yivli Minare', '13. yüzyıl Selçuklu eseri — Antalya\'nın simgesi'],
  saat: ['Saat Kulesi', 'Kalekapısı — eski surların burcu üzerinde'],
  kesik: ['Kesik Minare', 'Korkut Camii — Roma tapınağından kiliseye, kiliseden camiye'],
  hidirlik: ['Hıdırlık Kulesi', 'MS 2. yüzyıl — falezlerin ucundaki Roma kulesi'],
  burc: ['Kale Kapısı Burcu', 'Kaleiçi\'ni çevreleyen surlardan ayakta kalan burç'],
};

const step = async (pct, text) => {
  $('#bar i').style.width = pct + '%'; $('#step').textContent = text;
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 20)));
};

async function boot() {
  const canvas = $('#view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  setAnisotropy(Math.min(16, renderer.capabilities.getMaxAnisotropy()));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.12, 40000);
  renderer.setSize(innerWidth, innerHeight, false);

  await step(8, 'Taşlar yontuluyor, sıva karılıyor…');
  const T = makeTextures(WORLD);
  await step(30, 'Falezler ve liman şekilleniyor…');
  const terrain = buildTerrain(data, T, WORLD);
  scene.add(terrain.group);
  await step(46, 'Sokaklar döşeniyor, evler yükseliyor…');
  const city = buildCity(data, T, terrain, WORLD);
  scene.add(city.group);
  await step(72, 'Portakal ağaçları ve begonviller dikiliyor…');
  const props = buildProps(data, T, terrain, city, WORLD);
  scene.add(props.group);
  await step(84, 'Motosiklet hazırlanıyor…');
  const world = { groundY: terrain.groundY, coastDist: terrain.coastDist, collide: city.collide, rect: terrain.rect };
  const bike = new Bike(world);
  scene.add(bike.root);

  await step(92, 'Işık ayarlanıyor…');
  const atmo = new Atmosphere(renderer, scene, camera, withWorld(qKey));
  atmo.onApply = (t) => {
    city.mats.lamp.emissiveIntensity = t.lamp; city.glass.emissiveIntensity = t.glass;
    bike.headLamp.intensity = t.head; bike.headMat.emissiveIntensity = t.head ? 9 : 1.5;
    terrain.mountainMat.color.set(t.mount);
    $('#tod').textContent = t.name; $('#lTime').textContent = t.name;
  };
  atmo.apply();
  const sound = new Sound();

  // ---------- spawn just inside Hadrian's Gate ----------
  const gate = city.marks.find((m) => m.k === 'hadrian');
  const spawn = (() => {
    let best = null, bd = 1e9;
    const tx = gate.x - 24, tz = gate.z + 22;
    for (const r of data.roads) {
      if (!r.old || r.k === 'steps' || r.k === 'footway') continue;
      for (let i = 0; i < r.p.length - 1; i++) {
        const a = r.p[i], b = r.p[i + 1];
        for (const t of [0.25, 0.75]) {
          const x = lerp(a[0], b[0], t), z = lerp(a[1], b[1], t), d = Math.hypot(x - tx, z - tz);
          if (d < bd && !city.inBuilding(x, z) && !city.collide.nearest(x, z, 1.3)) {
            bd = d; let dx = b[0] - a[0], dz = b[1] - a[1];
            if (dx * (x - gate.x) + dz * (z - gate.z) < 0) { dx = -dx; dz = -dz; }
            best = { x, z, psi: Math.atan2(dx, dz) };
          }
        }
      }
    }
    return best || { x: gate.x - 20, z: gate.z + 18, psi: -2.3 };
  })();
  bike.place(spawn.x, spawn.z, spawn.psi);

  // ---------- HUD ----------
  const found = new Set();
  $('#finds').innerHTML = city.marks.map((m) => `<span data-k="${m.k}"></span>`).join('') + '<em style="font-style:normal" id="fc">0 / 6 keşif</em>';
  let toastT = 0;
  const toast = (k, t, s, dur = 5) => { $('#toast .k').textContent = k; $('#toast .t').textContent = t; $('#toast .s').textContent = s; $('#toast').classList.add('on'); toastT = dur; };

  // minimap: pre-render the whole map once, then blit a rotated window around the rider
  const MS = 1.6, [rx0, rz0, rx1, rz1] = terrain.rect;
  const mapImg = document.createElement('canvas');
  mapImg.width = (rx1 - rx0) * MS; mapImg.height = (rz1 - rz0) * MS;
  {
    const g = mapImg.getContext('2d');
    g.fillStyle = '#16323c'; g.fillRect(0, 0, mapImg.width, mapImg.height);
    g.fillStyle = '#3a3128';
    for (let z = rz0; z < rz1; z += 5) for (let x = rx0; x < rx1; x += 5) if (terrain.coastDist(x + 2.5, z + 2.5) > 0) g.fillRect((x - rx0) * MS, (z - rz0) * MS, 5 * MS + 0.6, 5 * MS + 0.6);
    const P = (p) => { g.beginPath(); p.forEach((v, i) => (i ? g.lineTo((v[0] - rx0) * MS, (v[1] - rz0) * MS) : g.moveTo((v[0] - rx0) * MS, (v[1] - rz0) * MS))); };
    g.lineCap = g.lineJoin = 'round';
    for (const r of data.roads) { g.strokeStyle = r.old ? '#b9a88a' : '#6f675c'; g.lineWidth = Math.max(1.6, r.w * MS * 0.8); P(r.p); g.stroke(); }
    for (const b of data.buildings) { g.fillStyle = b.k ? '#e7b76a' : b.o ? '#6b5a48' : '#4a4239'; P(b.p); g.fill(); }
  }
  const mapC = $('#map canvas'), mg = mapC.getContext('2d');
  const drawMap = () => {
    const w = mapC.width, sc = 1.25;
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, w, w);
    mg.translate(w / 2, w / 2); mg.rotate(bike.psi - Math.PI); mg.scale(-sc, sc);
    mg.translate(-(bike.pos.x - rx0) * MS, -(bike.pos.z - rz0) * MS);
    mg.drawImage(mapImg, 0, 0);
    for (const m of city.marks) {
      mg.fillStyle = found.has(m.k) ? '#e7b76a' : '#fff'; mg.beginPath();
      mg.arc((m.x - rx0) * MS, (m.z - rz0) * MS, 5, 0, 6.3); mg.fill();
    }
    mg.setTransform(1, 0, 0, 1, 0, 0);
    mg.fillStyle = '#fff'; mg.beginPath(); mg.moveTo(w / 2, w / 2 - 13); mg.lineTo(w / 2 + 8, w / 2 + 9); mg.lineTo(w / 2, w / 2 + 4); mg.lineTo(w / 2 - 8, w / 2 + 9); mg.fill();
  };

  // ---------- input ----------
  const keys = new Set();
  const inp = { steer: 0, throttle: 0, brake: 0 };
  let state = 'menu', camMode = 0, steerRaw = 0;
  const setQuality = (k) => { qKey = k; $('#lQual').textContent = QUALITY[k].label; atmo.setQuality(withWorld(k)); atmo.resize(innerWidth, innerHeight); };
  $('#lQual').textContent = QUALITY[qKey].label;
  const action = (code) => {
    if (code === 'KeyC' && state === 'ride') { camMode = (camMode + 1) % 2; bike.headG.visible = camMode === 0; }
    if (code === 'KeyT') atmo.cycle();
    if (code === 'KeyM') $('#lSnd').textContent = sound.toggle() ? 'Kapalı' : 'Açık';
    if (code === 'KeyR' && state === 'ride') bike.place(bike.safe.x, bike.safe.z, bike.safe.psi);
    if (code === 'Escape' && state === 'ride') { state = 'menu'; $('#menu').classList.remove('gone'); $('#hud').classList.remove('on'); $('#touch').classList.remove('on'); $('#go').textContent = 'Devam Et'; }
    else if ((code === 'Enter' || code === 'Escape') && state === 'menu') start();
  };
  const start = () => {
    state = 'ride'; sound.start();
    $('#menu').classList.add('gone'); $('#hud').classList.add('on');
    if (coarse) $('#touch').classList.add('on');
    if (!found.size) toast('Kaleiçi · Antalya', 'İyi sürüşler', 'Altı simge yapıyı bul — haritada beyaz noktalar');
  };
  addEventListener('keydown', (e) => { if (e.repeat) return; keys.add(e.code); action(e.code); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  $('#go').onclick = start;
  $('#bTime').onclick = () => atmo.cycle();
  $('#bQual').onclick = () => setQuality(QKEYS[(QKEYS.indexOf(qKey) + 1) % QKEYS.length]);
  $('#bSnd').onclick = () => { sound.start(); action('KeyM'); };
  for (const [id, code] of [['tL', 'KeyA'], ['tR', 'KeyD'], ['tG', 'KeyW'], ['tB', 'KeyS']]) {
    const el = $('#' + id);
    const on = (e) => { e.preventDefault(); keys.add(code); el.classList.add('act'); }, off = (e) => { e.preventDefault(); keys.delete(code); el.classList.remove('act'); };
    el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
  }
  document.querySelectorAll('#touch .mini button').forEach((b) => (b.onclick = () => action(b.dataset.k)));
  const readInput = (dt) => {
    let s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    let th = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0, br = keys.has('KeyS') || keys.has('ArrowDown') || keys.has('Space') ? 1 : 0;
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    let analog = false;
    if (gp) {
      if (Math.abs(gp.axes[0]) > 0.08) { s = gp.axes[0]; analog = true; }
      th = Math.max(th, gp.buttons[7]?.value || 0, gp.buttons[0]?.value || 0); br = Math.max(br, gp.buttons[6]?.value || 0, gp.buttons[2]?.value || 0);
    }
    steerRaw = analog ? s : steerRaw + clamp(s - steerRaw, -dt * (s === 0 ? 5.5 : 3.4), dt * (s === 0 ? 5.5 : 3.4));
    inp.steer = steerRaw; inp.throttle = th; inp.brake = br;
  };

  // ---------- camera ----------
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), tmp = new THREE.Vector3();
  let camPsi = bike.psi, orbit = 0.6, camInit = false;
  const camBlock = (ax, az, bx, bz) => { // first wall crossing between a and b, as a fraction of the way
    let best = 1;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, rad = Math.hypot(bx - ax, bz - az) / 2 + 1;
    city.collide.query(mx, mz, rad, (s) => {
      const rx = bx - ax, rz = bz - az, sx = s.bx - s.ax, sz = s.bz - s.az, den = rx * sz - rz * sx;
      if (Math.abs(den) < 1e-6) return;
      const t = ((s.ax - ax) * sz - (s.az - az) * sx) / den, u = ((s.ax - ax) * rz - (s.az - az) * rx) / den;
      if (t > 0 && t < best && u >= 0 && u <= 1) best = t;
    });
    return best;
  };
  const updateCamera = (dt, time) => {
    const fx = Math.sin(bike.psi), fz = Math.cos(bike.psi), sp = Math.abs(bike.v);
    let roll = 0;
    if (state === 'menu') {
      orbit += dt * 0.07;
      const d = 5.2, hx = bike.pos.x + Math.sin(bike.psi + 2.4 + Math.sin(orbit) * 0.7) * d, hz = bike.pos.z + Math.cos(bike.psi + 2.4 + Math.sin(orbit) * 0.7) * d;
      const t = camBlock(bike.pos.x, bike.pos.z, hx, hz);
      tmp.set(lerp(bike.pos.x, hx, Math.max(0.3, t * 0.85)), bike.pos.y + 1.15 + Math.sin(orbit * 1.7) * 0.25, lerp(bike.pos.z, hz, Math.max(0.3, t * 0.85)));
      if (!camInit) camPos.copy(tmp);
      camPos.lerp(tmp, 1 - Math.exp(-2 * dt));
      look.set(bike.pos.x, bike.pos.y + 0.85, bike.pos.z);
      camera.fov = damp(camera.fov, 42, 3, dt);
    } else if (camMode === 0) {
      let dp = bike.psi - camPsi; dp = Math.atan2(Math.sin(dp), Math.cos(dp));
      camPsi += dp * (1 - Math.exp(-5.5 * dt));
      const dist = 4.3 + sp * 0.035, cx = Math.sin(camPsi), cz = Math.cos(camPsi);
      const hx = bike.pos.x - cx * dist, hz = bike.pos.z - cz * dist;
      const t = camBlock(bike.pos.x, bike.pos.z, hx, hz), k = t < 1 ? Math.max(0.28, t - 0.1) : 1;
      tmp.set(lerp(bike.pos.x, hx, k), 0, lerp(bike.pos.z, hz, k));
      tmp.y = Math.max(bike.pos.y + 1.62 + (1 - k) * 0.9 - bike.pitch * 1.5, terrain.groundY(tmp.x, tmp.z) + 0.6);
      if (!camInit) camPos.copy(tmp);
      camPos.x = tmp.x; camPos.z = tmp.z; camPos.y = damp(camPos.y, tmp.y, 8, dt);
      look.set(bike.pos.x + fx * 3.2, bike.pos.y + 1.05, bike.pos.z + fz * 3.2);
      roll = -bike.lean * 0.22;
      camera.fov = damp(camera.fov, 60 + 14 * smoothstep(0, 30, sp), 4, dt);
    } else {
      // helmet camera rides on the leaning bike
      tmp.set(0, 1.52, -0.14).applyAxisAngle(new THREE.Vector3(0, 0, 1), bike.lean).applyAxisAngle(new THREE.Vector3(0, 1, 0), bike.psi);
      camPos.copy(bike.pos).add(tmp);
      const ya = bike.psi - inp.steer * 0.25, lx = Math.sin(ya), lz = Math.cos(ya);
      look.set(camPos.x + lx * 10, camPos.y - 2.3 + Math.sin(bike.pitch) * 10, camPos.z + lz * 10);
      roll = -bike.lean * 0.7;
      camera.fov = damp(camera.fov, 74 + 10 * smoothstep(0, 30, sp), 4, dt);
    }
    camInit = true;
    camera.position.copy(camPos);
    const sh = bike.shake * 0.12 + Math.min(sp, 25) * 0.00035;
    camera.position.x += (Math.sin(time * 91) + Math.sin(time * 57.3)) * sh; camera.position.y += Math.sin(time * 73.1) * sh;
    camera.lookAt(look); camera.rotateZ(roll);
    camera.updateProjectionMatrix();
  };

  // ---------- frame loop ----------
  let last = performance.now(), time = 0, hudT = 0, slow = 0, frames = 0, fpsT = 0;
  const focus = new THREE.Vector3();
  const frame = (now) => {
    requestAnimationFrame(frame);
    if (game.freeze) { last = now; return; }
    game.frameCount++;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    readInput(dt);
    if (state === 'ride') {
      const n = Math.max(1, Math.ceil(dt / 0.012));
      for (let i = 0; i < n; i++) bike.update(dt / n, inp);
      if (bike.splash) toast('Şlap!', 'Denize düştün', 'Seni son güvenli noktaya geri aldık', 3);
    } else bike.update(dt, { steer: 0, throttle: 0, brake: 1 });
    props.update(time);
    terrain.seaU.uTime.value = time;
    updateCamera(dt, time);
    focus.set(bike.pos.x + Math.sin(bike.psi) * atmo.q.range * 0.45, bike.pos.y, bike.pos.z + Math.cos(bike.psi) * atmo.q.range * 0.45);
    atmo.update(time, focus, state === 'ride' ? smoothstep(6, 30, Math.abs(bike.v)) : 0, city.lamps);
    sound.update(bike.rpm, state === 'ride' ? inp.throttle : 0, Math.abs(bike.v), atmo.t.el < 0);
    atmo.render(dt);

    // HUD
    if (state === 'ride') {
      $('#speed').textContent = Math.round(bike.kmh);
      const ri = $('#rpm i'); ri.style.width = clamp(bike.rpm / 8000, 0, 1) * 100 + '%'; ri.classList.toggle('hot', bike.rpm > 6300);
      if ((hudT -= dt) < 0) {
        hudT = 0.2;
        $('#gear').textContent = bike.v < -0.1 ? 'R' : bike.kmh < 1 ? 'N' : bike.gear;
        let name = null, bd = 16;
        city.roadGrid.query(bike.pos.x, bike.pos.z, 16, (s) => {
          if (!s.data.n) return;
          const d = distToSeg(bike.pos.x, bike.pos.z, s.ax, s.az, s.bx, s.bz);
          if (d < bd) { bd = d; name = s.data.n; }
        });
        if (name && $('#street').textContent !== name) $('#street').textContent = name;
        for (const m of city.marks) if (!found.has(m.k) && Math.hypot(m.x - bike.pos.x, m.z - bike.pos.z) < 34) {
          found.add(m.k);
          document.querySelector(`#finds span[data-k="${m.k}"]`).classList.add('ok'); $('#fc').textContent = `${found.size} / 6 keşif`;
          toast(found.size === 6 ? 'Tüm keşifler tamam!' : `Keşif ${found.size} / 6`, INFO[m.k][0], INFO[m.k][1], 6);
        }
        drawMap();
      }
    }
    if (toastT > 0 && (toastT -= dt) <= 0) $('#toast').classList.remove('on');

    // if the machine cannot keep up, step the quality down once it is clear
    frames++; fpsT += dt;
    if (fpsT > 3) {
      const fps = frames / fpsT; frames = 0; fpsT = 0; game.fps = fps;
      if (fps < 24 && qKey !== 'low' && !game.lockQuality && ++slow >= 2) { slow = 0; setQuality(QKEYS[QKEYS.indexOf(qKey) - 1]); }
    }
  };

  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); atmo.resize(innerWidth, innerHeight); });
  camera.aspect = innerWidth / innerHeight; atmo.resize(innerWidth, innerHeight);
  const game = (window.__game = { THREE, bike, atmo, city, terrain, props, camera, scene, renderer, data, start, action, setQuality, inp, keys, TIMES, stats: { ...city.stats, ...props.stats }, lockQuality: false, snapCam: () => { camPsi = bike.psi; camInit = false; }, freeze: false, frameCount: 0 });

  await step(100, 'Hazır');
  updateCamera(0.016, 0);
  renderer.compile(scene, camera);
  requestAnimationFrame(frame);
  $('#load').classList.add('gone'); $('#menu').classList.remove('gone');
}

boot().catch((e) => {
  console.error(e);
  $('#step').textContent = 'Başlatılamadı: ' + (e && e.message ? e.message : e) + ' — WebGL2 destekleyen güncel bir tarayıcı gerekir.';
});
