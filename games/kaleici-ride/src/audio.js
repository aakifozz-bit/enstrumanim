// Fully synthesised sound: single-cylinder engine, wind, tyre rumble on cobbles, cicadas.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.0; this.master.connect(c.destination);
    this.master.gain.linearRampToValueAtTime(0.8, c.currentTime + 1.5);

    const noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = () => { const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(); return s; };

    // engine: firing pulses (saw) + harmonics through a drive stage and a throttle-controlled low-pass
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = c.createOscillator(); this.o2.type = 'square';
    this.o3 = c.createOscillator(); this.o3.type = 'sawtooth';
    const g1 = c.createGain(), g2 = c.createGain(), g3 = c.createGain();
    g1.gain.value = 0.55; g2.gain.value = 0.3; g3.gain.value = 0.18;
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.6); }
    shaper.curve = curve;
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 500; this.lp.Q.value = 1.2;
    this.eng = c.createGain(); this.eng.gain.value = 0.2;
    this.o1.connect(g1).connect(shaper); this.o2.connect(g2).connect(shaper); this.o3.connect(g3).connect(shaper);
    shaper.connect(this.lp).connect(this.eng).connect(this.master);
    // exhaust crackle
    const en = noise(), ebp = c.createBiquadFilter(); ebp.type = 'bandpass'; ebp.frequency.value = 900; ebp.Q.value = 0.7;
    this.engN = c.createGain(); this.engN.gain.value = 0;
    this.am = c.createGain(); this.am.gain.value = 0;
    en.connect(ebp).connect(this.am).connect(this.engN).connect(this.master);
    const amDepth = c.createGain(); amDepth.gain.value = 1; this.o1.connect(amDepth).connect(this.am.gain);
    [this.o1, this.o2, this.o3].forEach((o) => o.start());

    // wind
    const wn = noise(); this.windF = c.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 500; this.windF.Q.value = 0.5;
    this.wind = c.createGain(); this.wind.gain.value = 0; wn.connect(this.windF).connect(this.wind).connect(this.master);
    // tyres on cobbles
    const rn = noise(); const rf = c.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 160;
    this.rum = c.createGain(); this.rum.gain.value = 0; rn.connect(rf).connect(this.rum).connect(this.master);
    // cicadas
    const cn = noise(); const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 5200; cf.Q.value = 9;
    const cg = c.createGain(); cg.gain.value = 0;
    const lfo = c.createOscillator(); lfo.frequency.value = 43; const lg = c.createGain(); lg.gain.value = 0.012;
    const slow = c.createOscillator(); slow.frequency.value = 0.13; const sg = c.createGain(); sg.gain.value = 0.008;
    this.cic = c.createGain(); this.cic.gain.value = 1;
    lfo.connect(lg).connect(cg.gain); slow.connect(sg).connect(cg.gain); lfo.start(); slow.start();
    cn.connect(cf).connect(cg).connect(this.cic).connect(this.master);
  }

  update(rpm, throttle, speed, night) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, f = rpm / 60; // one firing pulse every two revolutions, heard with its octave
    this.o1.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.o2.frequency.setTargetAtTime(f * 1.003, t, 0.03);
    this.o3.frequency.setTargetAtTime(f * 1.5, t, 0.03);
    this.lp.frequency.setTargetAtTime(260 + rpm * 0.12 + throttle * (500 + rpm * 0.28), t, 0.05);
    this.eng.gain.setTargetAtTime(0.11 + throttle * 0.13 + rpm / 60000, t, 0.05);
    this.engN.gain.setTargetAtTime(0.04 + throttle * 0.1, t, 0.05);
    this.wind.gain.setTargetAtTime(Math.min(0.5, speed * speed * 0.0006), t, 0.1);
    this.windF.frequency.setTargetAtTime(350 + speed * 30, t, 0.1);
    this.rum.gain.setTargetAtTime(Math.min(0.55, speed * 0.035), t, 0.08);
    this.cic.gain.setTargetAtTime(night ? 0.25 : 1, t, 0.5);
  }

  toggle() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }
  suspend(on) { if (this.ctx) (on ? this.ctx.suspend() : this.ctx.resume()); }
}
