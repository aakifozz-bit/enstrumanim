import * as THREE from 'three';
import { Sky } from '../vendor/Sky.js';
import { buildWorld, BOUNDS, SEA_Y, edge } from './world.js';
import { buildVehicles, buildScooter } from './vehicles.js';
import { createGame } from './game.js';
import * as TX from './textures.js';

const params = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const q = { low: mobile || params.has('low'), mobile };
q.shadow = q.low ? 2048 : 4096; if (params.has('sm')) q.shadow = +params.get('sm'); q.range = q.low ? 75 : 115;

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.low ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const FOG = new THREE.Color(0xa9c8ea);
scene.fog = new THREE.FogExp2(FOG, 0.00042);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.12, 16000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- gökyüzü, güneş, ortam ----------
const sunDir = new THREE.Vector3(-0.5, 0.74, 0.3).normalize(); // öğleden sonra, güneybatı
const sky = new Sky(); sky.scale.setScalar(12000);
const su = sky.material.uniforms;
su.turbidity.value = 2.0; su.rayleigh.value = 2.1; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.82;
su.sunPosition.value.copy(sunDir);
scene.add(sky);
{
  const es = new THREE.Scene(), s2 = new Sky(); s2.scale.setScalar(1000); Object.assign(s2.material.uniforms.sunPosition.value, sunDir);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) s2.material.uniforms[k].value = su[k].value;
  es.add(s2);
  const gd = new THREE.Mesh(new THREE.CircleGeometry(900, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8d8a82 })); gd.position.y = -6; es.add(gd);
  const pm = new THREE.PMREMGenerator(renderer);
  const old = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
  scene.environment = pm.fromScene(es, 0, 0.1, 2000).texture; renderer.toneMapping = old;
  scene.environmentIntensity = 1.25;
}
const sun = new THREE.DirectionalLight(0xfff0dc, 7);
sun.castShadow = true; sun.shadow.mapSize.set(q.shadow, q.shadow);
Object.assign(sun.shadow.camera, { left: -q.range, right: q.range, top: q.range, bottom: -q.range, near: 1, far: 700 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x9a8f7a, 0.85));

const cloudTex = TX.clouds(); cloudTex.repeat.set(2, 2);
const cloud = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 1, fog: false, depthWrite: false }));
cloud.position.y = 2600; scene.add(cloud);

// ---------- deniz ----------
const water = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  uniforms: {
    nmap: { value: TX.waterNormal() }, time: { value: 0 }, sunDir: { value: sunDir }, cam: { value: camera.position },
    deep: { value: new THREE.Color(0x06324f) }, shallow: { value: new THREE.Color(0x1f9aa0) },
    hor: { value: new THREE.Color(0xb7d0e4) }, zen: { value: new THREE.Color(0x3f7fc4) },
    fogC: { value: FOG }, fogD: { value: scene.fog.density },
  },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
  fragmentShader: `
    uniform sampler2D nmap; uniform float time, fogD; uniform vec3 sunDir, cam, deep, shallow, hor, zen, fogC; varying vec3 vW;
    void main(){
      vec2 uv = vW.xz; float dist = distance(cam, vW);
      vec2 a = texture2D(nmap, uv/41.0 + vec2(time*0.011, time*0.007)).xy*2.0-1.0;
      vec2 b = texture2D(nmap, uv/13.0 - vec2(time*0.017, -time*0.012)).xy*2.0-1.0;
      vec2 c = texture2D(nmap, uv/173.0 + vec2(-time*0.004, time*0.005)).xy*2.0-1.0;
      float flat_ = 3.0 + dist*0.012;
      vec3 n = normalize(vec3(a.x + b.x*0.7 + c.x*1.3, flat_, a.y + b.y*0.7 + c.y*1.3));
      vec3 V = normalize(cam - vW); vec3 R = reflect(-V, n); R.y = abs(R.y);
      float fr = 0.03 + 0.97*pow(1.0 - max(dot(n, V), 0.0), 5.0);
      vec3 skyc = mix(hor, zen, pow(max(R.y, 0.0), 0.45));
      float shore = vW.z - (250.0 + 10.0*sin(vW.x/85.0) + 5.0*sin(vW.x/31.0 + 1.3));
      vec3 wc = mix(shallow, deep, smoothstep(8.0, 260.0, shore)) * (0.45 + 0.55*max(dot(n, sunDir), 0.0));
      float sd = max(dot(R, sunDir), 0.0);
      vec3 col = mix(wc, skyc, fr) + vec3(1.0, 0.93, 0.8) * (pow(sd, 900.0)*30.0 + pow(sd, 90.0)*0.7);
      float foam = smoothstep(17.0, 11.0, shore + (a.x + b.y)*5.0) * 0.75;
      col = mix(col, vec3(0.93), foam);
      float f = 1.0 - exp(-fogD*fogD*dist*dist);
      gl_FragColor = vec4(mix(col, fogC, f), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
water.position.y = SEA_Y; scene.add(water);

// ---------- dünya ----------
const world = buildWorld(scene, q);
const traffic = buildVehicles(scene, world, q);
const scooter = buildScooter(scene);

const P = { x: -38.4, z: -76, y: 0, vy: 0, yaw: Math.PI, pitch: -0.02, mode: 'foot', vx: 0, vz: 0, bob: 0, speed: 0 };
const S = { x: -37.05, z: -69.5, h: Math.PI, v: 0, steer: 0, look: 0, lookIdle: 0, lean: 0 };
const game = createGame(world, scene, { P, S, camera, mobile });

// ---------- girdi ----------
const keys = {}; const touch = { mx: 0, my: 0 };
let started = params.has('auto'), locked = false;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE') interact();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('mousemove', (e) => { if (locked || (started && e.buttons)) look(e.movementX, e.movementY, 0.0022); });
function look(dx, dy, k) {
  if (P.mode === 'scooter') { S.look = Math.max(-2.3, Math.min(2.3, S.look - dx * k)); S.lookIdle = 0; }
  else P.yaw -= dx * k;
  P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch - dy * k));
}
const overlay = document.getElementById('overlay');
function lock() { try { const r = canvas.requestPointerLock?.(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* kilit yoksa fareyi basılı tutarak bak */ } }
function begin() {
  started = true; overlay.classList.add('hide'); game.audio.start();
  if (!mobile) lock();
}
document.getElementById('start').addEventListener('click', begin);
canvas.addEventListener('click', () => { if (started && !mobile && !locked) lock(); });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && started && !mobile && !params.has('auto')) { overlay.classList.remove('hide'); overlay.classList.add('paused'); }
});
if (mobile) {
  document.body.classList.add('touch');
  const stick = document.getElementById('stick'), knob = document.getElementById('knob');
  let sid = null, lid = null, sx = 0, sy = 0, lx = 0, ly = 0;
  addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (t.target.closest('button')) continue;
      if (t.clientX < innerWidth * 0.45 && sid === null) { sid = t.identifier; sx = t.clientX; sy = t.clientY; stick.style.cssText = `display:block;left:${sx - 60}px;top:${sy - 60}px`; }
      else if (lid === null) { lid = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === sid) {
        let dx = t.clientX - sx, dy = t.clientY - sy; const d = Math.hypot(dx, dy), m = 55;
        if (d > m) { dx *= m / d; dy *= m / d; }
        touch.mx = dx / m; touch.my = -dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`;
      } else if (t.identifier === lid) { look(t.clientX - lx, t.clientY - ly, 0.005); lx = t.clientX; ly = t.clientY; }
    }
  }, { passive: true });
  const end = (e) => { for (const t of e.changedTouches) { if (t.identifier === sid) { sid = null; touch.mx = touch.my = 0; stick.style.display = 'none'; knob.style.transform = ''; } if (t.identifier === lid) lid = null; } };
  addEventListener('touchend', end); addEventListener('touchcancel', end);
  document.getElementById('btnE').addEventListener('touchstart', (e) => { e.preventDefault(); interact(); });
  const bj = document.getElementById('btnJ');
  bj.addEventListener('touchstart', (e) => { e.preventDefault(); keys.Space = true; }); bj.addEventListener('touchend', () => { keys.Space = false; });
}

function interact() {
  if (!started) return;
  if (P.mode === 'foot') {
    if (Math.hypot(P.x - S.x, P.z - S.z) < 3) { P.mode = 'scooter'; S.look = 0; P.pitch = -0.12; scooter.arms.visible = true; game.toast('Motora bindin — W gaz, S fren, A/D direksiyon'); }
  } else if (Math.abs(S.v) < 2.5) {
    P.mode = 'foot'; S.v = 0; scooter.arms.visible = false;
    P.yaw = S.h + S.look; P.x = S.x - Math.cos(S.h) * 0.95; P.z = S.z + Math.sin(S.h) * 0.95;
    P.y = world.groundY(P.x, P.z);
  } else game.toast('İnmek için önce dur');
}

// ---------- fizik ----------
function collide(o, rad) {
  let hit = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const gx of [o.x - rad, o.x + rad]) for (const gz of [o.z - rad, o.z + rad]) {
      const cell = world.near(gx, gz); if (!cell) continue;
      for (const c of cell) {
        const nx = Math.max(c.x0, Math.min(c.x1, o.x)), nz = Math.max(c.z0, Math.min(c.z1, o.z));
        const dx = o.x - nx, dz = o.z - nz, d2 = dx * dx + dz * dz;
        if (d2 >= rad * rad) continue;
        if (o.y !== undefined && o.y > c.h + 0.15) continue;
        hit = true;
        if (d2 > 1e-8) { const d = Math.sqrt(d2); o.x += dx / d * (rad - d); o.z += dz / d * (rad - d); }
        else {
          const l = o.x - c.x0, r = c.x1 - o.x, t = o.z - c.z0, b = c.z1 - o.z, m = Math.min(l, r, t, b);
          if (m === l) o.x = c.x0 - rad; else if (m === r) o.x = c.x1 + rad; else if (m === t) o.z = c.z0 - rad; else o.z = c.z1 + rad;
        }
      }
    }
  }
  for (const c of traffic.cars) {
    const dx = o.x - c.x, dz = o.z - c.z; if (dx * dx + dz * dz > 16) continue;
    const fx = Math.cos(c.a), fz = -Math.sin(c.a), lx = dx * fx + dz * fz, lz = -dx * fz + dz * fx;
    const nx = Math.max(-2.25, Math.min(2.25, lx)), nz = Math.max(-0.95, Math.min(0.95, lz));
    let ex = lx - nx, ez = lz - nz; const d = Math.hypot(ex, ez);
    if (d >= rad) continue; hit = true;
    if (d < 1e-4) { ex = 0; ez = lz >= 0 ? 1 : -1; const push = 0.95 - Math.abs(lz) + rad; o.x += -fz * ez * push; o.z += fx * ez * push; }
    else { const k = (rad - d) / d; o.x += (ex * fx - ez * fz) * k; o.z += (ex * fz + ez * fx) * k; }
  }
  o.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, o.x));
  o.z = Math.max(BOUNDS.z0, Math.min(edge(o.x) - 1.35, o.z));
  return hit;
}

function updateFoot(dt) {
  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + touch.my;
  const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + touch.mx;
  const run = keys.ShiftLeft || keys.ShiftRight || Math.hypot(touch.mx, touch.my) > 0.92;
  const sp = run ? 8.2 : 4.6, len = Math.max(1, Math.hypot(f, s));
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  const tx = (fx * f + rx * s) / len * sp, tz = (fz * f + rz * s) / len * sp, k = Math.min(1, dt * 11);
  P.vx += (tx - P.vx) * k; P.vz += (tz - P.vz) * k;
  P.x += P.vx * dt; P.z += P.vz * dt;
  collide(P, 0.38);
  const gy = world.groundY(P.x, P.z);
  if (P.y <= gy + 0.001) { P.y += (gy - P.y) * Math.min(1, dt * 18); P.vy = 0; if (keys.Space) { P.vy = 5.2; P.y += 0.02; } }
  if (P.y > gy || P.vy > 0) { P.vy -= 15 * dt; P.y += P.vy * dt; if (P.y < gy) { P.y = gy; P.vy = 0; } }
  P.speed = Math.hypot(P.vx, P.vz);
  P.bob += P.speed * dt * 1.9;
  camera.position.set(P.x, P.y + 1.7 + Math.sin(P.bob * 2) * 0.03 * Math.min(1, P.speed / 4), P.z);
  camera.rotation.set(P.pitch, P.yaw, 0);
}

function updateScooter(dt) {
  const th = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + touch.my;
  const st = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + touch.mx;
  const VMAX = 21;
  if (th > 0.05) S.v += 7.8 * th * dt * (1 - Math.max(0, S.v) / VMAX);
  else if (th < -0.05) S.v -= (S.v > 0.4 ? 17 : 3.5) * -th * dt;
  else S.v -= S.v * 0.45 * dt + Math.sign(S.v) * 0.25 * dt;
  if (keys.Space) S.v -= Math.sign(S.v) * Math.min(Math.abs(S.v), 22 * dt);
  S.v = Math.max(-3.5, Math.min(VMAX, S.v));
  S.steer += (Math.max(-1, Math.min(1, st)) - S.steer) * Math.min(1, dt * 7);
  S.h -= S.steer * (1.9 / (1 + Math.abs(S.v) * 0.085)) * Math.max(-1, Math.min(1, S.v / 2.5)) * dt;
  const fx = -Math.sin(S.h), fz = -Math.cos(S.h), ox = S.x, oz = S.z;
  S.x += fx * S.v * dt; S.z += fz * S.v * dt;
  const o = { x: S.x, z: S.z };
  if (collide(o, 0.55)) {
    const want = Math.abs(S.v) * dt, got = (o.x - ox) * fx + (o.z - oz) * fz;
    if (Math.abs(got) < want * 0.6) { if (Math.abs(S.v) > 9) game.toast('Dikkat! Çarptın'); S.v *= 0.35; }
  }
  S.x = o.x; S.z = o.z;
  S.lookIdle += dt; if (S.lookIdle > 1.4 && Math.abs(S.v) > 2) S.look *= Math.exp(-dt * 2.5);
  S.lean += (-S.steer * Math.min(1, Math.abs(S.v) / 11) * 0.3 - S.lean) * Math.min(1, dt * 6);
  P.x = S.x; P.z = S.z; P.speed = Math.abs(S.v); P.yaw = S.h + S.look;
  P.y += (world.groundY(S.x, S.z) - P.y) * Math.min(1, dt * 14);
  scooter.wheels.forEach((w) => { w.rotation.x -= S.v / 0.25 * dt; });
}

function placeScooter() {
  const g = scooter.group, gy = P.mode === 'scooter' ? P.y : world.groundY(S.x, S.z);
  g.position.set(S.x, gy, S.z); g.rotation.set(0, S.h, P.mode === 'scooter' ? S.lean : 0.16, 'YXZ');
  scooter.setSteer(P.mode === 'scooter' ? S.steer : 0.5);
  if (P.mode === 'scooter') {
    g.updateMatrixWorld(true);
    camera.position.copy(scooter.eye).applyMatrix4(g.matrixWorld);
    camera.position.y += Math.sin(performance.now() * 0.04) * 0.0015 * Math.min(1, P.speed);
    camera.rotation.set(P.pitch, S.h + S.look, S.lean * 0.8);
  }
}

// ---------- döngü ----------
let last = performance.now(), dashT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (started) { if (P.mode === 'foot') updateFoot(dt); else updateScooter(dt); }
  else { camera.position.set(P.x, P.y + 1.7, P.z); camera.rotation.set(P.pitch, P.yaw, 0); }
  placeScooter();
  traffic.update(dt, P);
  game.update(dt, started);
  dashT -= dt;
  if (dashT < 0) { dashT = 0.12; scooter.drawDash(Math.abs(S.v) * 3.6, game.nav(S)); }
  water.material.uniforms.time.value += dt;
  cloudTex.offset.x += dt * 0.0006;
  sky.position.copy(camera.position);
  const tx = Math.round(camera.position.x / 4) * 4, tz = Math.round(camera.position.z / 4) * 4;
  sun.target.position.set(tx, 0, tz); sun.position.set(tx, 0, tz).addScaledVector(sunDir, 350);
  renderer.render(scene, camera);
}
if (!params.has('manual')) renderer.setAnimationLoop(frame);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
if (started) overlay.classList.add('hide');

// test / ekran görüntüsü kancaları
window.__lk = {
  P, S, game, world, scooter, camera, renderer, ready: true,
  pose(x, z, yaw, pitch = 0) { P.mode = 'foot'; scooter.arms.visible = false; P.x = x; P.z = z; P.yaw = yaw; P.pitch = pitch; P.y = world.groundY(x, z); P.vx = P.vz = 0; },
  ride(x, z, h, v = 0, pitch = -0.12) { S.x = x; S.z = z; S.h = h; S.v = v; S.look = 0; P.mode = 'scooter'; P.pitch = pitch; scooter.arms.visible = true; },
  begin, go() { started = true; overlay.classList.add('hide'); },
  snap(n = 3, step = 0.05) { for (let i = 0; i < n; i++) { last = performance.now() - step * 1000; frame(performance.now()); } },
};
