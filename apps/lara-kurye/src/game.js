// Sipariş döngüsü, HUD, mini harita ve ses.
import * as THREE from 'three';
import { XR, ZR, edge, PARK_Z } from './world.js';
import * as TX from './textures.js';

const $ = (id) => document.getElementById(id);
const tl = (n) => '₺' + Math.round(n).toLocaleString('tr-TR');

export function createGame(world, scene, { P, S, camera, mobile }) {
  const st = { money: 0, done: 0, stars: [], order: null, wait: 2.5, shift: 0 };

  // ---------- hedef işareti ----------
  const marker = new THREE.Group(); marker.visible = false; scene.add(marker);
  const beamM = new THREE.MeshBasicMaterial({ map: TX.beam(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, color: 0xff9a2a });
  const beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 60, 24, 1, true).translate(0, 30, 0), beamM);
  const ringM = new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.3, 40).rotateX(-Math.PI / 2), ringM); ring.position.y = 0.06;
  marker.add(beamMesh, ring);
  let target = null;
  function setTarget(t, color) {
    target = t; marker.visible = !!t;
    if (t) { marker.position.set(t.x, world.groundY(t.x, t.z), t.z); beamM.color.set(color); ringM.color.set(color); }
  }

  // ---------- ses ----------
  const audio = {
    ctx: null,
    start() {
      if (this.ctx) return;
      try {
        const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.o1 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = c.createOscillator(); this.o2.type = 'square';
        this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 400;
        this.g = c.createGain(); this.g.gain.value = 0;
        this.o1.connect(this.lp); this.o2.connect(this.lp); this.lp.connect(this.g); this.g.connect(c.destination);
        this.o1.start(); this.o2.start();
      } catch (e) { this.ctx = null; }
    },
    engine(on, v) {
      if (!this.ctx) return; const t = this.ctx.currentTime, f = 48 + v * 7.5;
      this.o1.frequency.setTargetAtTime(f, t, 0.05); this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      this.lp.frequency.setTargetAtTime(260 + v * 55, t, 0.08); this.g.gain.setTargetAtTime(on ? 0.035 + Math.min(0.05, v * 0.003) : 0, t, 0.1);
    },
    ding(notes) {
      if (!this.ctx) return; const c = this.ctx;
      notes.forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f;
        const t = c.currentTime + i * 0.12; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.55);
      });
    },
  };

  // ---------- HUD ----------
  let toastT = 0;
  function toast(msg, big = false) { const e = $('toast'); e.textContent = msg; e.className = 'show' + (big ? ' big' : ''); toastT = big ? 3.6 : 2.6; }
  function hud() {
    $('money').textContent = tl(st.money); $('done').textContent = st.done;
    const avg = st.stars.length ? st.stars.reduce((a, b) => a + b, 0) / st.stars.length : 5;
    $('stars').textContent = avg.toFixed(1).replace('.', ',');
    const o = st.order, card = $('order');
    if (!o) { card.classList.add('idle'); $('o-title').textContent = 'Yeni sipariş bekleniyor…'; $('o-a').textContent = ''; $('o-b').textContent = ''; $('o-pay').textContent = ''; $('o-time').textContent = ''; return; }
    card.classList.remove('idle');
    $('o-title').textContent = o.stage === 'pickup' ? 'Siparişi al' : 'Müşteriye teslim et';
    $('o-a').textContent = o.rest.name + ' — ' + o.rest.street; $('o-a').className = o.stage === 'pickup' ? 'cur' : 'ok';
    $('o-b').textContent = o.bld.street + ' No: ' + o.bld.no; $('o-b').className = o.stage === 'drop' ? 'cur' : '';
    $('o-pay').textContent = tl(o.pay);
  }
  function newOrder() {
    const rs = world.restaurants, bs = world.buildings.filter((b) => !b.shop);
    let rest = rs[Math.floor(Math.random() * rs.length)];
    for (let k = 0; k < 12; k++) { const c = rs[Math.floor(Math.random() * rs.length)]; const d = Math.hypot(c.x - P.x, c.z - P.z); if (d > 60 && d < 330) { rest = c; break; } }
    let bld = bs[Math.floor(Math.random() * bs.length)];
    for (let k = 0; k < 20; k++) { const c = bs[Math.floor(Math.random() * bs.length)]; const d = Math.hypot(c.door.x - rest.x, c.door.z - rest.z); if (d > 130 && d < 480) { bld = c; break; } }
    const d1 = Math.abs(rest.x - P.x) + Math.abs(rest.z - P.z), d2 = Math.abs(bld.door.x - rest.x) + Math.abs(bld.door.z - rest.z);
    st.order = { rest, bld, stage: 'pickup', pay: Math.round((38 + d2 * 0.13) / 5) * 5, time: 45 + (d1 + d2) / 6.5, total: 0 };
    st.order.total = st.order.time;
    setTarget(rest, 0xff9a2a); audio.ding([880, 1175]); toast('Yeni sipariş: ' + rest.name); hud();
  }

  // ---------- mini harita ----------
  const SC = 2, MX0 = -400, MZ0 = -380, bg = document.createElement('canvas'); bg.width = 800 * SC; bg.height = 700 * SC;
  {
    const x = bg.getContext('2d'); x.scale(SC, SC); x.translate(-MX0, -MZ0);
    x.fillStyle = '#cdbf9c'; x.fillRect(MX0, MZ0, 800, 700);
    x.fillStyle = '#2f86a8'; x.beginPath(); x.moveTo(MX0, 330);
    for (let px = MX0; px <= 400; px += 8) x.lineTo(px, edge(px)); x.lineTo(400, 330); x.fill();
    x.fillStyle = '#9cc27a'; x.beginPath(); x.moveTo(MX0, PARK_Z);
    x.lineTo(400, PARK_Z); for (let px = 400; px >= MX0; px -= 8) x.lineTo(px, edge(px)); x.fill();
    x.fillStyle = '#5b5e63'; x.fillRect(-368, -348, 736, 348 + PARK_Z);
    x.fillStyle = '#d9d4c7'; for (const b of world.blocks) x.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
    x.fillStyle = '#b7d39b'; for (const b of world.blocks) x.fillRect(b.x0 + 3, b.z0 + 3, b.x1 - b.x0 - 6, b.z1 - b.z0 - 6);
    for (const b of world.buildings) { x.fillStyle = b.shop ? '#e3a56b' : '#f5efe2'; x.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0); x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 0.5; x.strokeRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0); }
    x.fillStyle = '#fff'; x.font = '600 7px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const Z of ZR) for (let i = 0; i < XR.length - 1; i += 2) x.fillText(Z.name, (XR[i].c + XR[i + 1].c) / 2, Z.c);
    for (const X of XR) for (let j = 0; j < ZR.length - 1; j += 2) { x.save(); x.translate(X.c, (ZR[j].c + ZR[j + 1].c) / 2); x.rotate(-Math.PI / 2); x.fillText(X.name, 0, 0); x.restore(); }
  }
  const mm = $('minimap'), mc = mm.getContext('2d'), MS = mm.width;
  function drawMap() {
    const yaw = P.yaw, zoom = P.mode === 'scooter' ? 1.15 : 1.5;
    mc.save(); mc.clearRect(0, 0, MS, MS);
    mc.beginPath(); mc.arc(MS / 2, MS / 2, MS / 2 - 2, 0, 7); mc.clip();
    mc.fillStyle = '#cdbf9c'; mc.fillRect(0, 0, MS, MS);
    mc.translate(MS / 2, MS / 2); mc.rotate(yaw); mc.scale(zoom, zoom);
    mc.drawImage(bg, MX0 - P.x, MZ0 - P.z, 800, 700);
    const dot = (wx, wz, col, rad) => {
      let dx = wx - P.x, dz = wz - P.z; const d = Math.hypot(dx, dz), m = (MS / 2 - 12) / zoom;
      if (d > m) { dx *= m / d; dz *= m / d; }
      mc.fillStyle = col; mc.strokeStyle = '#fff'; mc.lineWidth = 1.5 / zoom; mc.beginPath(); mc.arc(dx, dz, rad / zoom, 0, 7); mc.fill(); mc.stroke();
    };
    if (P.mode === 'foot') dot(S.x, S.z, '#d5121e', 5);
    if (target) dot(target.x, target.z, st.order && st.order.stage === 'drop' ? '#21c063' : '#ff8a1c', 7);
    mc.restore();
    mc.fillStyle = '#1b6cff'; mc.strokeStyle = '#fff'; mc.lineWidth = 2;
    mc.beginPath(); mc.moveTo(MS / 2, MS / 2 - 11); mc.lineTo(MS / 2 + 7.5, MS / 2 + 8); mc.lineTo(MS / 2, MS / 2 + 4); mc.lineTo(MS / 2 - 7.5, MS / 2 + 8); mc.closePath(); mc.fill(); mc.stroke();
  }

  // ---------- konum bilgisi ----------
  function where() {
    let best = '', bd = 1e9;
    for (const X of XR) { const d = Math.abs(P.x - X.c) - X.w / 2; if (d < bd) { bd = d; best = X.name; } }
    for (const Z of ZR) { const d = Math.abs(P.z - Z.c) - Z.w / 2; if (d < bd) { bd = d; best = Z.name; } }
    if (P.z > PARK_Z + 2) best = 'Falez Parkı';
    return best;
  }
  const v3 = new THREE.Vector3();
  function waypoint() {
    const e = $('wp'); if (!target) { e.style.display = 'none'; return; }
    v3.set(target.x, 2.2, target.z).project(camera);
    let x = v3.x, y = v3.y; const behind = v3.z > 1;
    if (behind) { x = -x; y = -y; }
    const off = behind || Math.abs(x) > 0.9 || Math.abs(y) > 0.86;
    if (off) { const m = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.82, 1e-3); x /= m; y /= m; if (behind && Math.abs(y) < 0.8) { y = -0.82; } }
    e.style.display = 'block'; e.style.left = ((x * 0.5 + 0.5) * 100) + '%'; e.style.top = ((-y * 0.5 + 0.5) * 100) + '%';
    e.className = st.order && st.order.stage === 'drop' ? 'drop' : '';
    $('wp-d').textContent = Math.round(Math.hypot(target.x - P.x, target.z - P.z)) + ' m';
  }

  let mapT = 0, pulse = 0;
  function update(dt, started) {
    pulse += dt; ring.scale.setScalar(1 + Math.sin(pulse * 4) * 0.12); beamM.opacity = 0.22 + Math.sin(pulse * 3) * 0.06;
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').className = ''; }
    audio.engine(P.mode === 'scooter' && started, P.speed);
    if (started) {
      st.shift += dt;
      const o = st.order;
      if (!o) { st.wait -= dt; if (st.wait <= 0) newOrder(); }
      else {
        o.time -= dt;
        const m = Math.max(0, o.time), late = o.time < 0;
        $('o-time').textContent = (late ? 'GECİKTİ ' : '') + Math.floor(m / 60) + ':' + String(Math.floor(m % 60)).padStart(2, '0');
        $('o-time').className = late ? 'late' : o.time < 20 ? 'warn' : '';
        if (target && Math.hypot(target.x - P.x, target.z - P.z) < 3.8 && P.speed < 4.5) {
          if (o.stage === 'pickup') { o.stage = 'drop'; setTarget(o.bld.door, 0x21c063); audio.ding([660, 990]); toast('Paket alındı → ' + o.bld.street + ' No: ' + o.bld.no); hud(); }
          else {
            const tip = late ? 0 : Math.round(o.time * 0.35 / 5) * 5, pay = late ? Math.round(o.pay * 0.6) : o.pay;
            st.money += pay + tip; st.done++; st.stars.push(late ? 3 : o.time > o.total * 0.25 ? 5 : 4);
            audio.ding([784, 988, 1319]); toast(late ? `Geç teslim: +${tl(pay)}` : `Teslim edildi! +${tl(pay)}` + (tip ? ` • bahşiş ${tl(tip)}` : ''), true);
            st.order = null; st.wait = 4; setTarget(null); hud();
          }
        }
      }
    }
    mapT -= dt;
    if (mapT < 0) {
      mapT = 0.05; drawMap(); waypoint();
      $('where').textContent = where();
      const ride = P.mode === 'scooter';
      $('speedo').style.display = ride ? 'flex' : 'none';
      if (ride) $('kmh').textContent = Math.round(P.speed * 3.6);
      const near = !ride && Math.hypot(P.x - S.x, P.z - S.z) < 3;
      const h = $('hint');
      h.textContent = near ? (mobile ? 'Motora binmek için BİN’e dokun' : 'E — Motora bin') : ride && P.speed < 1.5 && st.shift < 40 ? (mobile ? '' : 'W gaz • S fren • A/D direksiyon • E in') : '';
      h.style.display = h.textContent ? 'block' : 'none';
    }
  }
  function nav(sc) {
    if (!target || !st.order) return null;
    const dx = target.x - sc.x, dz = target.z - sc.z, fx = -Math.sin(sc.h), fz = -Math.cos(sc.h);
    return { label: st.order.stage === 'pickup' ? 'SİPARİŞİ AL' : 'TESLİM ET', dist: Math.hypot(dx, dz), ang: Math.atan2(dx * Math.cos(sc.h) - dz * Math.sin(sc.h), dx * fx + dz * fz), color: st.order.stage === 'pickup' ? '#ff9a2a' : '#21c063' };
  }
  hud();
  return { update, toast, nav, audio, st, newOrder, get target() { return target; } };
}
