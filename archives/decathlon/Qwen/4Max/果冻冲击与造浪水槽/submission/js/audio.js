/* WebAudio 合成音效：撞击 / 回弹 / 开裂 / 碰撞 / 入水 / 造浪 */
'use strict';
const Snd = {
  ctx: null, master: null, muted: false, exportMode: false,
  noiseBuf: null, waveGain: null, waveFilter: null, waveSrc: null,
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
    // 造浪循环
    this.waveSrc = this.ctx.createBufferSource();
    this.waveSrc.buffer = this.noiseBuf; this.waveSrc.loop = true;
    this.waveFilter = this.ctx.createBiquadFilter();
    this.waveFilter.type = 'bandpass'; this.waveFilter.frequency.value = 420; this.waveFilter.Q.value = 0.6;
    this.waveGain = this.ctx.createGain(); this.waveGain.gain.value = 0;
    this.waveSrc.connect(this.waveFilter); this.waveFilter.connect(this.waveGain); this.waveGain.connect(this.master);
    this.waveSrc.start();
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  },
  ok() { return this.ctx && !this.muted && !this.exportMode && this.ctx.state === 'running'; },
  env(g, t0, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
  },
  noise(t0, dur, filterType, f0, f1, q, peak) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter(); f.type = filterType; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = this.ctx.createGain();
    this.env(g, t0, 0.006, peak, dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.1);
  },
  tone(t0, type, f0, f1, dur, peak, vibrato) {
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    if (vibrato) {
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
      lfo.frequency.value = vibrato; lg.gain.value = f0 * 0.12;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t0); lfo.stop(t0 + dur + 0.1);
    }
    const g = this.ctx.createGain();
    this.env(g, t0, 0.005, peak, dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.1);
  },
  jellyImpact(v) {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    this.tone(t, 'sine', 110, 42, 0.22, 0.5 * v);
    this.tone(t + 0.02, 'triangle', 210, 70, 0.30, 0.22 * v, 14);
    this.noise(t, 0.12, 'lowpass', 500, 120, 0.8, 0.30 * v);
  },
  floorHit(v) {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    this.tone(t, 'sine', 90, 38, 0.15, 0.4 * v);
    this.noise(t, 0.08, 'lowpass', 800, 200, 1, 0.25 * v);
  },
  crack(v) {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    this.noise(t, 0.10, 'highpass', 1800, 3200, 0.7, 0.5 * v);
    this.noise(t + 0.03, 0.16, 'bandpass', 900, 300, 2, 0.35 * v);
    this.tone(t, 'square', 320, 90, 0.08, 0.12 * v);
    this.tone(t + 0.05, 'sine', 140, 50, 0.25, 0.25 * v);
  },
  clink(v) {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    this.tone(t, 'sine', 740, 700, 0.14, 0.20 * v);
    this.tone(t, 'sine', 1180, 1100, 0.10, 0.12 * v);
    this.noise(t, 0.03, 'highpass', 3000, 5000, 1, 0.12 * v);
  },
  splash(v) {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    this.noise(t, 0.30, 'bandpass', 1400, 300, 0.9, 0.45 * v);
    this.noise(t + 0.04, 0.22, 'lowpass', 700, 180, 0.7, 0.30 * v);
    this.tone(t + 0.05, 'sine', 300, 90, 0.18, 0.14 * v);
  },
  updateWave(env, amp, breaking) {
    if (!this.ctx || this.exportMode) return;
    const t = this.ctx.currentTime;
    const target = this.muted ? 0 : clamp(env * (0.04 + amp * 0.9) + breaking * 0.05, 0, 0.30);
    this.waveGain.gain.setTargetAtTime(target, t, 0.15);
    this.waveFilter.frequency.setTargetAtTime(320 + env * 300 + breaking * 260, t, 0.2);
  },
  handle(ev) {
    switch (ev.type) {
      case 'jellyImpact': this.jellyImpact(ev.intensity); break;
      case 'floorHit': this.floorHit(ev.intensity); break;
      case 'crack': this.crack(ev.intensity); break;
      case 'clink': this.clink(ev.intensity); break;
      case 'splash': this.splash(ev.intensity); break;
    }
  }
};
window.Snd = Snd;
