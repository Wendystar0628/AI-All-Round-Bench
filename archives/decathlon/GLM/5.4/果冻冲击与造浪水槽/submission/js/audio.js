'use strict';
/* ---------------------------------------------------------------------------
   Audio: everything synthesised with WebAudio (no files, works offline).
   The context is created on the first user gesture (browser policy).
--------------------------------------------------------------------------- */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.ready = false;
    this.noiseBuf = null;
    this.waveGain = null;
    this.washGain = null;
    this._waveOn = false;
    this._lastPlay = {};
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.55 : 0;
    this.master.connect(this.ctx.destination);

    // 2s noise buffer
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x3fffffff) - 1;
    }
    this.noiseBuf = buf;

    // continuous wave / wash bed
    this.waveGain = this.ctx.createGain();
    this.waveGain.gain.value = 0;
    this.waveGain.connect(this.master);
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 320; bp.Q.value = 0.7;
    src.connect(bp).connect(this.waveGain);
    src.start();
    this.washGain = this.ctx.createGain();
    this.washGain.gain.value = 0;
    this.washGain.connect(this.master);
    const src2 = this.ctx.createBufferSource();
    src2.buffer = buf; src2.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    src2.connect(lp).connect(this.washGain);
    src2.start();
    this.ready = true;
    return true;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  _noise(dur, filterType, freq, q, gain, attack, decay, pitchEnd) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    if (pitchEnd) f.frequency.exponentialRampToValueAtTime(pitchEnd, c.currentTime + dur);
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  _tone(freq, freqEnd, dur, gain, type) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type || 'sine';
    const t = c.currentTime;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* ---- individual events ---- */
  thud(power, pitch = 1) {
    if (!this.ensure() || !this.enabled) return;
    const p = clamp(power, 0, 1.6);
    this._tone(120 * pitch, 38 * pitch, 0.28 + p * 0.2, 0.55 * p, 'sine');
    this._noise(0.22, 'lowpass', 700 + p * 900, 0.9, 0.30 * p, 0.004, 0.20, 160);
    this._tone(240 * pitch, 90, 0.09, 0.10 * p, 'triangle');
  }

  bounce(power) {
    if (!this.ensure() || !this.enabled) return;
    const p = clamp(power, 0, 1.2);
    this._tone(180, 70, 0.14, 0.22 * p, 'sine');
    this._noise(0.09, 'lowpass', 1400, 0.8, 0.10 * p, 0.003, 0.08, 300);
  }

  clack(power) {
    if (!this.ensure() || !this.enabled) return;
    const p = clamp(power, 0, 1.3);
    this._noise(0.07, 'bandpass', 2600 + Math.random() * 800, 2.2, 0.20 * p, 0.002, 0.055, 900);
    this._tone(900 + Math.random() * 500, 300, 0.06, 0.10 * p, 'square');
  }

  crack(power = 1) {
    if (!this.ensure() || !this.enabled) return;
    this._noise(0.30, 'bandpass', 1800, 0.9, 0.34 * power, 0.004, 0.24, 400);
    this._noise(0.14, 'highpass', 3200, 0.7, 0.18 * power, 0.002, 0.10, 1200);
    this._tone(140, 50, 0.22, 0.24 * power, 'sine');
    for (let i = 0; i < 4; i++) {
      setTimeout(() => this._noise(0.05, 'bandpass', 2200 + Math.random() * 2400, 3, 0.09 * power, 0.001, 0.04, 800), i * 26 + Math.random() * 30);
    }
  }

  splash(power) {
    if (!this.ensure() || !this.enabled) return;
    const p = clamp(power, 0, 1.5);
    this._noise(0.55, 'bandpass', 1400, 0.8, 0.26 * p, 0.006, 0.42, 380);
    this._noise(0.20, 'highpass', 2400, 0.6, 0.12 * p, 0.004, 0.16, 900);
    this._tone(300, 110, 0.18, 0.08 * p, 'sine');
  }

  plop(power) {
    if (!this.ensure() || !this.enabled) return;
    const p = clamp(power, 0, 1);
    this._tone(420 + Math.random() * 160, 160, 0.12, 0.12 * p, 'sine');
    this._noise(0.10, 'bandpass', 1800, 1.4, 0.07 * p, 0.003, 0.08, 700);
  }

  waveLevel(amount) {
    if (!this.ctx || !this.waveGain) return;
    const a = clamp(amount, 0, 1);
    this.waveGain.gain.setTargetAtTime(0.055 * a, this.ctx.currentTime, 0.25);
    this.washGain.gain.setTargetAtTime(0.030 * a, this.ctx.currentTime, 0.35);
  }

  stopWave() {
    if (!this.ctx) return;
    this.waveGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    this.washGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }
}
