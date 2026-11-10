// Sky, sun, image-based lighting, shadows, time-of-day presets and the post-processing chain.
import * as THREE from '../vendor/three-bundle.js';
import { Sky, EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, GTAOPass, OutputPass } from '../vendor/three-bundle.js';

export const TIMES = [
  { name: 'Altın Saat', sky: 0.62, gnd: 0.24, el: 23, az: 236, sun: 0xffc793, sunI: 6.4, exposure: 0.6, turb: 4, ray: 1.8, mie: 0.0009, env: 0.8, fog: 0xc7a98e, fogD: 0.0008,
    lamp: 1.6, glass: 0.5, head: 0, mount: 0x8d86a0, clouds: 0.55, tint: [1.035, 1.0, 0.95], bloom: 0.1 },
  { name: 'Öğleden Sonra', sky: 0.4, gnd: 0.35, el: 46, az: 222, sun: 0xfff1dc, sunI: 5.6, exposure: 0.5, turb: 3.5, ray: 1.1, mie: 0.004, env: 1.0, fog: 0xc3d3e0, fogD: 0.0007,
    lamp: 0.3, glass: 0, head: 0, mount: 0x8fa4bd, clouds: 0.3, tint: [1.0, 1.0, 1.0], bloom: 0.08 },
  { name: 'Mavi Saat', sky: 0.16, gnd: 0.012, skyEl: 1.2, el: -4.5, az: 281, sun: 0x7f93c8, sunI: 0.5, exposure: 1.0, turb: 5, ray: 2.5, mie: 0.004, env: 1.0, fog: 0x39466a, fogD: 0.0012,
    lamp: 5, glass: 1.4, head: 70, mount: 0x2c3352, clouds: 0.35, tint: [0.97, 1.0, 1.06], bloom: 0.38, lights: 1 },
];

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uSpeed: { value: 0 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uAspect: { value: 1 }, uFx: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uSpeed, uAspect, uFx; uniform vec3 uTint; varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
      // radial speed blur, strongest at the frame edge
      vec3 col = vec3(0.0); float amt = uSpeed * smoothstep(0.03, 0.5, r2) * 0.06 * uFx;
      float j = hash(vUv * 917.0 + uTime);
      for (int i = 0; i < 6; i++) {
        float t = (float(i) + j) / 6.0;
        vec2 uv = vUv - c * amt * t;
        vec2 ca = c * r2 * 0.006 * uFx;
        col += vec3(texture2D(tDiffuse, uv + ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - ca).b);
      }
      col /= 6.0;
      // filmic grade: gentle S-curve, split toning, saturation
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.1);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.32);
      col *= mix(vec3(0.96, 1.0, 1.06), uTint, smoothstep(0.1, 0.8, l));
      col *= 1.0 - smoothstep(0.18, 0.95, r2) * 0.42;                // vignette
      col += (hash(vUv * 1531.0 + fract(uTime) * 61.0) - 0.5) * 0.028; // grain + dither
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Atmosphere {
  constructor(renderer, scene, camera, q) {
    this.r = renderer; this.scene = scene; this.camera = camera; this.q = q; this.index = 0;
    this.sky = new Sky(); this.sky.scale.setScalar(30000); scene.add(this.sky);
    // the stock sky is far brighter than the sun light we pair it with: expose a gain
    const sm = this.sky.material;
    sm.fragmentShader = sm.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( min( texColor * skyGain, vec3( 40.0 ) ), 1.0 );').replace('void main()', 'uniform float skyGain;\nvoid main()');
    sm.uniforms.skyGain = { value: 1 };
    this.sunDir = new THREE.Vector3();
    this.sun = new THREE.DirectionalLight(0xffffff, 4);
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.bias = -0.00035; s.normalBias = 0.06; s.radius = 2.2; s.camera.near = 1; s.camera.far = 900;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xcfd8ee, 0xb08a5c, 0.25); scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xffffff, 0.001);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky(); this.envSky.scale.setScalar(1000); this.envSky.material = this.sky.material.clone(); this.envScene.add(this.envSky);
    // a dark ground below the horizon so image-based light is directional, not a uniform wash
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(900, 32), new THREE.MeshBasicMaterial({ color: 0x8a7a66 }));
    this.envGround.rotation.x = -Math.PI / 2; this.envGround.position.y = -8; this.envScene.add(this.envGround);
    this.lights = [];
    for (let i = 0; i < q.lampLights; i++) { const l = new THREE.PointLight(0xffb060, 0, 15, 1.6); scene.add(l); this.lights.push(l); }
    this.setQuality(q);
  }

  setQuality(q) {
    this.q = q;
    const r = this.r, s = this.sun.shadow;
    r.setPixelRatio(q.pr);
    r.shadowMap.enabled = q.shadow > 0;
    if (s.mapSize.x !== q.shadow) { s.mapSize.set(q.shadow || 512, q.shadow || 512); if (s.map) { s.map.dispose(); s.map = null; } }
    const R = q.range; Object.assign(s.camera, { left: -R, right: R, top: R, bottom: -R }); s.camera.updateProjectionMatrix();
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
    if (this.composer) this.composer.dispose();
    const c = this.composer = new EffectComposer(r, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.ao = null;
    if (q.ao) {
      const ao = this.ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.2, thickness: 1.2, scale: 1.25, samples: q.aoSamples, distanceFallOff: 1, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
      ao.blendIntensity = 0.95;
      // alpha-tested foliage would occlude as solid rectangles in the AO prepass: hide it there
      const o0 = ao._overrideVisibility.bind(ao), r0 = ao._restoreVisibility.bind(ao), hidden = [];
      ao._overrideVisibility = () => { o0(); this.scene.traverse((o) => { if (o.visible && o.material && (o.material.alphaTest > 0 || o.userData.noAO)) { o.visible = false; hidden.push(o); } }); };
      ao._restoreVisibility = () => { r0(); for (const o of hidden) o.visible = true; hidden.length = 0; };
      c.addPass(ao);
    }
    this.bloom = null;
    if (q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.1, 0.5, 6.0); c.addPass(this.bloom); }
    c.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader); c.addPass(this.grade);
    this.apply();
  }

  resize(w, h) {
    this.r.setSize(w, h, false); this.composer.setSize(w, h);
    this.grade.uniforms.uAspect.value = w / h;
  }

  cycle() { this.index = (this.index + 1) % TIMES.length; this.apply(); return TIMES[this.index]; }

  apply() {
    const t = this.t = TIMES[this.index], r = this.r;
    const el = THREE.MathUtils.degToRad(t.el), az = THREE.MathUtils.degToRad(t.az);
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    for (const sky of [this.sky, this.envSky]) {
      const u = sky.material.uniforms;
      u.turbidity.value = t.turb; u.rayleigh.value = t.ray; u.mieCoefficient.value = t.mie; u.mieDirectionalG.value = 0.86;
      u.sunPosition.value.copy(this.sunDir); u.skyGain.value = t.sky;
      if (t.skyEl) { const e2 = THREE.MathUtils.degToRad(t.skyEl); u.sunPosition.value.set(Math.sin(az) * Math.cos(e2), Math.sin(e2), -Math.cos(az) * Math.cos(e2)); }
      if (u.cloudCoverage) { u.cloudCoverage.value = t.clouds; u.cloudDensity.value = 0.45; u.cloudElevation.value = 0.45; }
    }
    if (this.envSky.material.uniforms.showSunDisc) this.envSky.material.uniforms.showSunDisc.value = 0;
    // light direction: below the horizon the sky glow still comes from the sunset side
    this.lightDir = this.sunDir.clone(); if (t.el < 8) { this.lightDir.y = Math.sin(THREE.MathUtils.degToRad(t.el < 0 ? 24 : 8 + (t.el - 8) * 0)); this.lightDir.normalize(); }
    if (t.el >= 8) this.lightDir.copy(this.sunDir);
    this.sun.color.set(t.sun); this.sun.intensity = t.sunI;
    this.hemi.intensity = t.el < 0 ? 0.35 : 0.55;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = t.exposure;
    this.scene.fog.color.set(t.fog); this.scene.fog.density = t.fogD;
    this.envGround.material.color.setRGB(t.gnd * 1.05, t.gnd * 0.95, t.gnd * 0.82);
    if (this.envRT) this.envRT.dispose();
    const tm = r.toneMapping; r.toneMapping = THREE.NoToneMapping;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
    r.toneMapping = tm;
    this.scene.environment = this.envRT.texture; this.scene.environmentIntensity = t.env;
    if (this.bloom) this.bloom.strength = t.bloom;
    this.grade.uniforms.uTint.value.set(...t.tint);
    for (const l of this.lights) l.intensity = 0;
    if (this.onApply) this.onApply(t);
  }

  /** Per frame: keep the shadow frustum around the rider (texel-snapped), move lamp lights, tick uniforms. */
  update(time, focus, speed, lamps) {
    const R = this.q.range, s = this.sun.shadow, tex = (2 * R) / (s.mapSize.x || 1);
    const d = this.lightDir, right = new THREE.Vector3().crossVectors(d, THREE.Object3D.DEFAULT_UP).normalize(), up = new THREE.Vector3().crossVectors(right, d);
    const fx = Math.round(focus.dot(right) / tex) * tex, fy = Math.round(focus.dot(up) / tex) * tex, fz = focus.dot(d);
    const p = new THREE.Vector3().addScaledVector(right, fx).addScaledVector(up, fy).addScaledVector(d, fz);
    this.sun.target.position.copy(p); this.sun.position.copy(p).addScaledVector(d, 450);
    this.sky.position.copy(this.camera.position);
    const u = this.sky.material.uniforms; if (u.time) u.time.value = time;
    this.grade.uniforms.uTime.value = time; this.grade.uniforms.uSpeed.value = speed;
    if (this.t.lights && this.lights.length && lamps.length) {
      // light the nearest lanterns for real
      const best = [];
      for (let i = 0; i < lamps.length; i += 3) {
        const dd = (lamps[i] - focus.x) ** 2 + (lamps[i + 2] - focus.z) ** 2;
        if (dd < 3600) best.push([dd, i]);
      }
      best.sort((a, b) => a[0] - b[0]);
      this.lights.forEach((l, k) => {
        if (best[k]) { const i = best[k][1]; l.position.set(lamps[i], lamps[i + 1], lamps[i + 2]); l.intensity = 12; } else l.intensity = 0;
      });
    }
  }

  render(dt) { this.composer.render(dt); }
}
