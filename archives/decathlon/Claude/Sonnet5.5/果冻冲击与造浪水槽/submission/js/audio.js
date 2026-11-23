/* ===== audio.js : 程序合成的音效（撞击、回弹、开裂、碰撞、入水、造浪） ===== */
'use strict';

class AudioFx {
  constructor() {
    this.ctx = null; this.on = false; this.master = null; this.noise = null;
    this.last = {}; this.scene = 'jelly';
    this.wave = null; this.wavePhase = 0; this.waveT = 0;
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.on ? 0.8 : 0;
      const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      const n = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
      let b = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.5; }
      this.noise = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  toggle() {
    this.on = !this.on;
    if (this.on) this.unlock();
    if (this.master) this.master.gain.setTargetAtTime(this.on ? 0.8 : 0, this.ctx.currentTime, 0.03);
    if (!this.on) this.stopWave();
    return this.on;
  }
  setScene(k) { this.scene = k; this.stopWave(); }
  ok(kind, gap) { const t = performance.now(); if (this.last[kind] && t - this.last[kind] < gap) return false; this.last[kind] = t; return true; }

  /* ---- 合成原件 ---- */
  tone(f0, f1, dur, gain, type = 'sine', delay = 0, curve = 'exp') {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  burst(type, f, q, dur, gain, f2, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t); if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur); flt.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(flt); flt.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  /* ---- 事件 ---- */
  jellyHit(speed, mass) {
    if (!this.ok('jhit', 40)) return;
    const k = Math.min(1, speed / 4.5) * (0.55 + 0.45 * Math.min(1, mass / 12));
    this.tone(150 + 40 / (1 + mass * 0.2), 52, 0.32, 0.55 * k, 'sine');
    this.burst('lowpass', 520, 0.7, 0.16, 0.45 * k, 160);
    // 果冻的"波咿"：慢速衰减的弹性颤音
    const c = this.ctx, t = c.currentTime + 0.02, o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120 + 30 * (1 - Math.min(1, mass / 15)), t); o.frequency.exponentialRampToValueAtTime(70, t + 0.9);
    lfo.frequency.value = 9; lg.gain.value = 12; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * k, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    o.connect(g); g.connect(this.master); o.start(t); lfo.start(t); o.stop(t + 1); lfo.stop(t + 1);
  }
  crack(n) {
    if (!this.ok('crack', 70)) return;
    const k = Math.min(1, 0.35 + n / 12);
    this.burst('highpass', 2200, 0.8, 0.09, 0.5 * k, 5000);
    this.burst('bandpass', 1300, 2, 0.14, 0.45 * k, 700, 0.01);
    this.tone(320, 90, 0.18, 0.28 * k, 'triangle');
  }
  split() {
    this.burst('lowpass', 700, 0.7, 0.35, 0.5, 120);
    this.tone(110, 45, 0.5, 0.45, 'sine');
    for (let i = 0; i < 4; i++) this.burst('highpass', 2500 + i * 600, 1, 0.05, 0.28, 6000, 0.03 + i * 0.045);
  }
  clack(kind, speed, what) {
    if (!this.ok('clack' + what, 35)) return;
    const k = Math.min(1, speed / 3.5);
    const base = kind === 1 ? [380, 640] : kind === 2 ? [720, 1180] : [980, 1650];
    const mul = what === 'ball' ? 1.15 : 1;
    this.tone(base[0] * mul, base[0] * mul * 0.92, 0.22, 0.22 * k, 'sine');
    this.tone(base[1] * mul, base[1] * mul * 0.93, 0.13, 0.14 * k, 'sine');
    this.burst('highpass', 3000, 0.7, 0.025, 0.12 * k, 6000);
  }
  splash(speed, dens) {
    if (!this.ok('splash', 55)) return;
    const k = Math.min(1, speed / 3.6) * (0.5 + 0.5 * Math.min(1, dens / 2));
    this.burst('bandpass', 1500, 0.9, 0.38, 0.55 * k, 420);
    this.burst('highpass', 3500, 0.6, 0.18, 0.2 * k, 7000);
    this.tone(260, 90, 0.22, 0.3 * k, 'sine', 0.01);        // 入水的"咕咚"
    this.tone(520 + Math.random() * 200, 220, 0.12, 0.12 * k, 'sine', 0.05 + Math.random() * 0.06);
  }
  startWave() {
    if (this.wave || !this.ctx) return;
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    this.wave = { s, f, g };
  }
  stopWave() { if (this.wave) { try { this.wave.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2); this.wave.s.stop(this.ctx.currentTime + 1); } catch (e) { } this.wave = null; } }
  waveUpdate(amp, running, dt) {
    if (!this.on || !this.ctx) return;
    if (!this.wave) this.startWave();
    if (!this.wave) return;
    const t = this.ctx.currentTime, a = Math.max(0, Math.min(1, amp));
    this.wavePhase += dt * 2 * Math.PI * 1.1;
    const lfo = 0.65 + 0.35 * Math.sin(this.wavePhase);
    this.wave.g.gain.setTargetAtTime(a * 0.5 * lfo, t, 0.08);
    this.wave.f.frequency.setTargetAtTime(260 + a * 900 * lfo, t, 0.1);
    // 大浪破碎的拍击声
    this.waveT += dt;
    if (a > 0.5 && this.waveT > 1.1 - 0.3 * a && this.ok('crash', 300)) {
      this.waveT = 0;
      this.burst('bandpass', 900, 0.7, 0.55, 0.4 * a, 260);
      this.tone(95, 55, 0.4, 0.25 * a, 'sine');
    }
  }

  consume(events, scene) {
    if (!this.on || !this.ctx) {
      return;
    }
    for (const e of events) {
      switch (e.type) {
        case 'jhit': this.jellyHit(e.speed, e.mass); break;
        case 'crack': this.crack(e.n); break;
        case 'split': this.split(); break;
        case 'hit': this.clack(e.kind || 0, e.speed, e.what); break;
        case 'splash': this.splash(e.speed, e.dens); break;
        case 'wave': this.waveUpdate(e.amp / (WATER_CFG ? WATER_CFG.ampMax : 0.13), e.running, 1 / 30); break;
      }
    }
  }
}
