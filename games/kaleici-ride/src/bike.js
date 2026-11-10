// The motorcycle: a procedurally modelled classic roadster with rider, and its handling model.
import * as THREE from '../vendor/three-bundle.js';
import { clamp, lerp, damp, smoothstep } from './util.js';

const R = 0.33, WB = 1.45, REAR_Z = -0.7, FRONT_Z = 0.75, RAKE = 0.46;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
const GEAR_TOP = [0, 9.5, 15, 21, 27, 34]; // m/s at the red line, per gear

export class Bike {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3(); this.psi = 0; this.v = 0; this.lean = 0; this.pitch = 0;
    this.steer = 0; this.gear = 1; this.rpm = 1100; this.wheel = 0; this.shake = 0; this.shift = 0;
    this.safe = { x: 0, z: 0, psi: 0, t: 0 }; this.splash = false; this.accel = 0; this.dive = 0;
    this.root = new THREE.Group(); this.root.rotation.order = 'YXZ';
    this.leanG = new THREE.Group(); this.root.add(this.leanG);
    this._build();
  }

  _build() {
    const M = THREE.MeshStandardMaterial, P = THREE.MeshPhysicalMaterial;
    const paint = new P({ color: 0x0c3f47, roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06 });
    const chrome = new M({ color: 0xf2f2f2, roughness: 0.06, metalness: 1 });
    const alu = new M({ color: 0xa9adb0, roughness: 0.38, metalness: 1 });
    const black = new M({ color: 0x0e0e0f, roughness: 0.5, metalness: 0.6 });
    const rubber = new M({ color: 0x0b0b0b, roughness: 0.92 });
    const leather = new M({ color: 0x4a2a16, roughness: 0.5 });
    const jacket = new M({ color: 0x15130f, roughness: 0.42 });
    const denim = new M({ color: 0x1b2a3f, roughness: 0.9 });
    const helmet = new P({ color: 0x1c1d20, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
    const visor = new P({ color: 0x050607, roughness: 0.05, metalness: 0.4, clearcoat: 1 });
    this.headMat = new M({ color: 0xfff3d8, emissive: 0xffe2a8, emissiveIntensity: 1.5, roughness: 0.2 });
    this.tailMat = new M({ color: 0x400000, emissive: 0xff1a0a, emissiveIntensity: 1.2, roughness: 0.3 });
    const G = this.leanG;
    const add = (geo, mat, parent = G) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const tube = (a, b, r, mat, parent = G, r2 = r) => {
      const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va), l = d.length();
      const m = add(new THREE.CylinderGeometry(r2, r, l, 12), mat, parent);
      m.position.copy(va).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(Y, d.normalize());
      return m;
    };
    const limb = (a, b, r, mat, parent = G) => {
      const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va), l = d.length();
      const m = add(new THREE.CapsuleGeometry(r, l, 6, 12), mat, parent);
      m.position.copy(va).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(Y, d.normalize());
      return m;
    };
    const ball = (p, r, mat, s = [1, 1, 1], parent = G) => { const m = add(new THREE.SphereGeometry(r, 24, 16), mat, parent); m.position.set(...p); m.scale.set(...s); return m; };

    const wheel = () => {
      const w = new THREE.Group();
      const tire = add(new THREE.TorusGeometry(R - 0.07, 0.07, 16, 48), rubber, w); tire.rotation.y = Math.PI / 2; tire.scale.z = 1.25;
      const rim = add(new THREE.TorusGeometry(R - 0.135, 0.022, 10, 48), chrome, w); rim.rotation.y = Math.PI / 2; rim.scale.z = 2.2;
      const hub = add(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 16), alu, w); hub.rotation.z = Math.PI / 2;
      for (let i = 0; i < 28; i++) {
        const a = i / 28 * Math.PI * 2, s = i % 2 ? 1 : -1, a2 = a + s * 0.5;
        tube([s * 0.06, Math.cos(a) * 0.045, Math.sin(a) * 0.045], [0, Math.cos(a2) * (R - 0.14), Math.sin(a2) * (R - 0.14)], 0.0035, chrome, w);
      }
      const disc = add(new THREE.CylinderGeometry(0.13, 0.13, 0.006, 32), alu, w); disc.rotation.z = Math.PI / 2; disc.position.x = 0.075;
      return w;
    };
    const fender = (parent, a0, a1, mat) => {
      const f = add(new THREE.TorusGeometry(R + 0.035, 0.055, 8, 24, a1 - a0), mat, parent);
      f.rotation.y = -Math.PI / 2; f.rotation.order = 'YXZ'; f.rotation.z = a0; f.scale.z = 1.5;
      return f;
    };

    // rear wheel + swing arm
    this.rearW = wheel(); this.rearW.position.set(0, R, REAR_Z); G.add(this.rearW);
    const rf = new THREE.Group(); rf.position.set(0, R, REAR_Z); G.add(rf); fender(rf, 0.35, 2.3, paint);
    for (const s of [-1, 1]) {
      tube([s * 0.1, 0.4, -0.22], [s * 0.1, R, REAR_Z], 0.022, black);
      tube([s * 0.14, 0.74, -0.5], [s * 0.14, R + 0.04, REAR_Z + 0.03], 0.012, chrome);
      tube([s * 0.14, 0.72, -0.505], [s * 0.14, 0.47, -0.63], 0.028, black);
      tube([s * 0.21, 0.33, -0.12], [s * 0.1, 0.33, -0.12], 0.014, black);
    }
    // frame
    const head = [0, 0.93, 0.42];
    tube(head, [0, 0.8, -0.08], 0.024, black); tube(head, [0, 0.33, 0.3], 0.022, black);
    tube([0, 0.33, 0.3], [0, 0.22, -0.2], 0.022, black); tube([0, 0.22, -0.2], [0, 0.42, -0.26], 0.022, black);
    tube([0, 0.42, -0.26], [0, 0.8, -0.08], 0.022, black); tube([0, 0.8, -0.08], [0, 0.76, -0.86], 0.02, black);
    tube([0, 0.42, -0.26], [0, 0.74, -0.6], 0.018, black);
    // tank, seat
    ball([0, 0.87, 0.12], 1, paint, [0.165, 0.13, 0.29]);
    ball([0, 0.99, 0.2], 0.035, chrome, [1, 0.4, 1]);
    const seat = add(new THREE.CapsuleGeometry(0.12, 0.46, 8, 16), leather); seat.rotation.x = Math.PI / 2; seat.position.set(0, 0.83, -0.42); seat.scale.set(1.25, 1, 0.5);
    // engine
    const crank = add(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 24), alu); crank.rotation.z = Math.PI / 2; crank.position.set(0, 0.38, 0.02);
    const gearbox = add(new THREE.BoxGeometry(0.26, 0.2, 0.26), alu); gearbox.position.set(0, 0.38, -0.16);
    const cyl = new THREE.Group(); cyl.position.set(0, 0.5, 0.06); cyl.rotation.x = 0.2; G.add(cyl);
    add(new THREE.BoxGeometry(0.15, 0.3, 0.15), black, cyl).position.y = 0.13;
    for (let i = 0; i < 9; i++) add(new THREE.BoxGeometry(0.21, 0.008, 0.21), alu, cyl).position.y = 0.02 + i * 0.027;
    add(new THREE.BoxGeometry(0.2, 0.07, 0.2), alu, cyl).position.y = 0.3;
    for (const s of [-1, 1]) { const c = add(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 24), chrome); c.rotation.z = Math.PI / 2; c.position.set(s * 0.155, 0.38, 0.02); }
    // exhaust
    const path = new THREE.CatmullRomCurve3([[0.07, 0.72, 0.2], [0.12, 0.5, 0.3], [0.17, 0.26, 0.12], [0.19, 0.25, -0.2], [0.2, 0.31, -0.5]].map((p) => new THREE.Vector3(-p[0], p[1], p[2])));
    add(new THREE.TubeGeometry(path, 40, 0.024, 10), chrome);
    tube([-0.2, 0.31, -0.48], [-0.2, 0.37, -1.02], 0.04, chrome, G, 0.055);
    // tail
    add(new THREE.BoxGeometry(0.1, 0.05, 0.03), this.tailMat).position.set(0, 0.72, -1.02);
    const plate = add(new THREE.BoxGeometry(0.2, 0.13, 0.008), new M({ color: 0xf2f2f2, roughness: 0.5 })); plate.position.set(0, 0.6, -1.05); plate.rotation.x = -0.25;

    // steering assembly (tilted by the rake, then turned by the bars)
    const pivot = new THREE.Group(); pivot.position.set(...head); pivot.rotation.x = -RAKE; G.add(pivot);
    const st = this.steerG = new THREE.Group(); pivot.add(st);
    const ax = new THREE.Vector3(0, R - head[1], FRONT_Z - head[2]).applyAxisAngle(X, RAKE); // axle in the tilted frame
    for (const s of [-1, 1]) {
      tube([s * 0.095, ax.y, ax.z], [s * 0.095, ax.y + 0.34, ax.z], 0.027, black, st);
      tube([s * 0.095, ax.y + 0.3, ax.z], [s * 0.095, 0.1, ax.z], 0.019, chrome, st);
      tube([s * 0.03, 0.09, -0.03], [s * 0.36, 0.17, -0.1], 0.012, chrome, st);
      tube([s * 0.27, 0.15, -0.085], [s * 0.4, 0.18, -0.108], 0.018, rubber, st);
      tube([s * 0.3, 0.16, -0.09], [s * 0.37, 0.33, -0.1], 0.005, chrome, st);
      const mir = add(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 20), chrome, st); mir.rotation.x = Math.PI / 2; mir.position.set(s * 0.375, 0.35, -0.1);
    }
    add(new THREE.BoxGeometry(0.25, 0.03, 0.09), black, st).position.set(0, 0.07, ax.z * 0.5);
    add(new THREE.BoxGeometry(0.25, 0.03, 0.09), black, st).position.set(0, -0.1, ax.z * 0.6);
    const bowl = ball([0, -0.02, ax.z + 0.11], 0.095, chrome, [1, 1, 0.9], st);
    bowl.rotation.x = RAKE;
    const lens = add(new THREE.CircleGeometry(0.082, 28), this.headMat, st); lens.position.set(0, -0.02, ax.z + 0.2); lens.rotation.x = RAKE;
    for (const s of [-1, 1]) { const g = add(new THREE.CylinderGeometry(0.045, 0.04, 0.05, 20), chrome, st); g.position.set(s * 0.055, 0.14, ax.z * 0.4); g.rotation.x = 0.5; }
    this.frontW = wheel(); this.frontW.position.set(0, ax.y, ax.z); st.add(this.frontW);
    const ff = new THREE.Group(); ff.position.set(0, ax.y, ax.z); ff.rotation.x = RAKE; st.add(ff); fender(ff, 1.0, 2.5, paint);
    this.headLamp = new THREE.SpotLight(0xffe9c4, 0, 46, 0.52, 0.6, 1.4);
    this.headLamp.position.set(0, 0, ax.z + 0.2); st.add(this.headLamp);
    const tgt = new THREE.Object3D(); tgt.position.set(0, -4, 14); st.add(tgt); this.headLamp.target = tgt;

    // rider
    const rd = this.rider = new THREE.Group(); G.add(rd);
    limb([0, 0.93, -0.36], [0, 1.3, -0.15], 0.17, jacket, rd).scale.set(1.2, 1, 0.82);
    limb([-0.17, 1.36, -0.14], [0.17, 1.36, -0.14], 0.085, jacket, rd);
    { const st = add(new THREE.TorusGeometry(0.141, 0.012, 8, 32, Math.PI), new M({ color: 0xe7dcc4, roughness: 0.3 }), this.headG = new THREE.Group()); st.rotation.y = Math.PI / 2; st.position.set(0, 0.12, 0.02); st.scale.set(1.14, 1.02, 1); }
    ball([0, 0.9, -0.38], 0.17, denim, [1.15, 0.8, 1], rd);
    this.headG.position.set(0, 1.5, -0.08); rd.add(this.headG);
    limb([0, -0.1, 0], [0, 0, 0.01], 0.055, jacket, this.headG);
    ball([0, 0.12, 0.02], 0.14, helmet, [1, 1.02, 1.14], this.headG);
    const vs = add(new THREE.SphereGeometry(0.142, 24, 12, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.32, Math.PI * 0.26), visor, this.headG);
    vs.position.set(0, 0.12, 0.03); vs.scale.set(1, 1.02, 1.14);
    for (const s of [-1, 1]) {
      limb([s * 0.2, 1.36, -0.13], [s * 0.3, 1.13, 0.08], 0.058, jacket, rd);
      limb([s * 0.3, 1.13, 0.08], [s * 0.335, 1.03, 0.33], 0.048, jacket, rd);
      ball([s * 0.335, 1.02, 0.36], 0.052, black, [1, 0.8, 1.2], rd);
      limb([s * 0.11, 0.86, -0.3], [s * 0.21, 0.68, 0.1], 0.082, denim, rd);
      limb([s * 0.21, 0.68, 0.1], [s * 0.21, 0.36, -0.1], 0.062, denim, rd);
      add(new THREE.BoxGeometry(0.1, 0.1, 0.27), black, rd).position.set(s * 0.21, 0.3, -0.05);
    }
  }

  place(x, z, psi) {
    this.pos.set(x, this.world.groundY(x, z), z); this.psi = psi; this.v = 0; this.lean = 0;
    Object.assign(this.safe, { x, z, psi, t: 0 });
  }

  update(dt, inp) {
    const W = this.world, g = 9.81;
    const sp = Math.abs(this.v);
    // --- lean & yaw: a bike turns by leaning; at walking pace it steers with the bars ---
    const maxLean = lerp(0.1, 0.74, smoothstep(1, 13, sp)) * (1 - 0.3 * smoothstep(18, 32, sp));
    this.lean = damp(this.lean, inp.steer * maxLean, lerp(8, 4.6, smoothstep(3, 20, sp)), dt);
    const hi = g * Math.tan(this.lean) / Math.max(sp, 3.4) * Math.sign(this.v || 1);
    const lo = this.v * Math.tan(inp.steer * 0.62) / WB;
    const k = smoothstep(2.5, 7.5, sp);
    this.psi -= lerp(lo, hi, k) * dt;
    this.steer = damp(this.steer, inp.steer * lerp(0.55, 0.07, k), 10, dt);

    // --- drive train ---
    const sinP = Math.sin(this.pitch);
    let a = -g * sinP * 0.85 - Math.sign(this.v) * (0.25 + 0.0028 * sp * sp);
    const top = GEAR_TOP[this.gear];
    this.shift = Math.max(0, this.shift - dt);
    if (inp.throttle > 0 && this.v > -0.2) {
      const band = 1 - Math.pow(clamp(sp / 33, 0, 1), 2.2);
      a += inp.throttle * 8.2 * band * (this.shift > 0 ? 0.25 : 1) * [0, 1, 0.82, 0.66, 0.54, 0.44][this.gear] * 1.25;
    } else if (this.v > 0) a -= 0.9 + sp * 0.03; // engine braking
    if (inp.brake > 0) {
      if (this.v > 0.4) a -= inp.brake * 10.5;
      else if (inp.throttle === 0) a += (-1.7 - this.v) * 4; // paddle backwards
    } else if (this.v < 0) a += inp.throttle > 0 ? 6 : 2.5;
    const v0 = this.v;
    this.v += a * dt;
    if (inp.brake > 0 && v0 > 0 && this.v < 0 && v0 <= 0.4 + 10.5 * dt) this.v = 0;
    if (!inp.throttle && !inp.brake && Math.abs(this.v) < 0.12 && Math.abs(sinP) < 0.03) this.v = 0;
    this.accel = damp(this.accel, (this.v - v0) / Math.max(dt, 1e-4), 8, dt);

    // gearbox
    const sp2 = Math.abs(this.v);
    let rpm = 1100 + sp2 / top * 6900;
    if (rpm > 6700 && this.gear < 5 && inp.throttle > 0) { this.gear++; this.shift = 0.18; }
    else if (rpm < 2900 && this.gear > 1) this.gear--;
    rpm = 1100 + sp2 / GEAR_TOP[this.gear] * 6900 + (sp2 < 2 ? inp.throttle * 2600 * (1 - sp2 / 2) : 0);
    this.rpm = damp(this.rpm, rpm, 9, dt);

    // --- integrate & collide ---
    const fx = Math.sin(this.psi), fz = Math.cos(this.psi);
    this.pos.x += fx * this.v * dt; this.pos.z += fz * this.v * dt;
    this.hit = 0;
    for (const off of [0.62, -0.55, 0.05]) {
      const cx = this.pos.x + fx * off, cz = this.pos.z + fz * off, rad = 0.4;
      W.collide.query(cx, cz, rad + 0.1, (s) => {
        const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz || 1;
        const t = clamp(((cx - s.ax) * dx + (cz - s.az) * dz) / l2, 0, 1);
        let nx = this.pos.x + fx * off - (s.ax + dx * t), nz = this.pos.z + fz * off - (s.az + dz * t);
        const d = Math.hypot(nx, nz);
        if (d >= rad || d < 1e-5) return;
        nx /= d; nz /= d;
        this.pos.x += nx * (rad - d); this.pos.z += nz * (rad - d);
        const into = -(fx * nx + fz * nz) * Math.sign(this.v);
        if (into > 0) {
          const imp = into * Math.abs(this.v);
          this.hit = Math.max(this.hit, imp);
          this.v *= 1 - clamp(into * (0.25 + imp * 0.12), 0, 0.95);
          if (into > 0.8 && imp > 2.5) this.v = -Math.sign(this.v) * Math.min(1.6, imp * 0.15); // head-on: bounce back a touch
          // glance off: swing the nose along the wall
          const cross = fx * nz - fz * nx;
          this.psi += Math.sign(cross) * Math.sign(this.v || 1) * into * (off > 0 ? 1 : -0.4) * 2.4 * dt * (1 + sp * 0.3);
        }
      });
    }
    if (this.hit > 1.2) this.shake = Math.min(1, this.shake + this.hit * 0.09);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const [x0, z0, x1, z1] = W.rect;
    this.pos.x = clamp(this.pos.x, x0 + 45, x1 - 45); this.pos.z = clamp(this.pos.z, z0 + 45, z1 - 45);

    // --- follow the ground ---
    const hf = W.groundY(this.pos.x + fx * FRONT_Z, this.pos.z + fz * FRONT_Z), hr = W.groundY(this.pos.x + fx * REAR_Z, this.pos.z + fz * REAR_Z);
    this.pos.y = damp(this.pos.y, (hf + hr) / 2, 30, dt);
    this.pitch = damp(this.pitch, Math.atan2(hf - hr, WB), 12, dt);
    this.dive = damp(this.dive, clamp(-this.accel * 0.0045, -0.03, 0.05), 7, dt);

    // fell in the harbour?
    this.splash = false;
    if (W.coastDist(this.pos.x, this.pos.z) < -1.2) { this.splash = true; this.place(this.safe.x, this.safe.z, this.safe.psi); }
    else if ((this.safe.t += dt) > 1.5 && W.coastDist(this.pos.x, this.pos.z) > 5 && this.hit === 0) Object.assign(this.safe, { x: this.pos.x, z: this.pos.z, psi: this.psi, t: 0 });

    // --- pose ---
    this.wheel += this.v / R * dt;
    const rumble = Math.min(1, sp / 12) * 0.006;
    this.root.position.copy(this.pos); this.root.position.y += Math.sin(this.wheel * 2.3) * rumble + Math.sin(this.wheel * 3.7) * rumble * 0.6;
    this.root.rotation.set(-this.pitch + this.dive, this.psi, 0);
    this.leanG.rotation.z = this.lean + (this.v === 0 ? 0 : 0);
    this.rearW.rotation.x = this.wheel; this.frontW.rotation.x = this.wheel;
    this.steerG.rotation.y = -this.steer;
    this.rider.rotation.z = -this.lean * 0.18;
    this.headG.rotation.y = -inp.steer * 0.35; this.headG.rotation.z = -this.lean * 0.55;
    this.tailMat.emissiveIntensity = inp.brake > 0 ? 6 : 1.2;
  }
  get kmh() { return Math.abs(this.v) * 3.6; }
}
