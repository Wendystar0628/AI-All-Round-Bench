/* audio.js — procedurally synthesised sound for impacts, rebound, fracture,
   ball collisions, splashes and the wave maker. No audio assets are loaded. */
(function (global) {
  'use strict';

  class Sfx {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;
      this.noise = null;
      this.last = {};
    }

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
      }
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      // one second of white noise reused by every effect
      const len = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let s = 0;
      for (let i = 0; i < len; i++) {
        s = (s + (Math.random() * 2 - 1) * 0.6) * 0.72;
        d[i] = s;
      }
      this.noise = buf;
      return true;
    }

    setEnabled(v) {
      this.enabled = v;
      if (this.master) this.master.gain.value = v ? 0.55 : 0.0;
    }

    _noise(dur, type, f0, f1, gain, q) {
      const c = this.ctx, t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const flt = c.createBiquadFilter();
      flt.type = type;
      flt.Q.value = q || 1;
      flt.frequency.setValueAtTime(f0, t);
      flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      src.connect(flt); flt.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + 0.02);
      return g;
    }

    _tone(f0, f1, dur, gain, type) {
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
      return g;
    }

    _throttle(key, ms) {
      const now = performance.now();
      if (this.last[key] && now - this.last[key] < ms) return false;
      this.last[key] = now;
      return true;
    }

    /* heavy body hitting gel */
    impact(strength) {
      if (!this.enabled || !this.ensure()) return;
      const s = Math.min(1, Math.max(0.15, strength || 1));
      this._tone(150 * (0.85 + 0.3 * s), 38, 0.34, 0.55 * s);
      this._tone(72, 30, 0.5, 0.32 * s);
      this._noise(0.22, 'lowpass', 1400, 260, 0.30 * s, 0.8);
    }

    /* gel springing back */
    rebound(strength) {
      if (!this.enabled || !this.ensure()) return;
      const s = Math.min(1, Math.max(0.2, strength || 0.6));
      this._tone(120, 320, 0.20, 0.16 * s, 'sine');
      this._tone(240, 90, 0.16, 0.10 * s, 'triangle');
    }

    /* material fracture */
    crack(strength) {
      if (!this.enabled || !this.ensure()) return;
      const s = Math.min(1, Math.max(0.3, strength || 1));
      this._noise(0.10, 'bandpass', 3200, 1400, 0.38 * s, 2.2);
      this._noise(0.26, 'bandpass', 900, 380, 0.20 * s, 1.4);
      this._tone(880, 420, 0.09, 0.10 * s, 'square');
    }

    /* two rigid bodies knocking together */
    click(pitch) {
      if (!this.enabled || !this.ensure()) return;
      if (!this._throttle('click', 45)) return;
      const f = pitch || 1;
      this._tone(1750 * f, 1500 * f, 0.10, 0.13);
      this._tone(2640 * f, 2300 * f, 0.07, 0.08);
      this._noise(0.05, 'highpass', 2600, 3600, 0.08, 1.0);
    }

    /* a body entering the water */
    splash(strength) {
      if (!this.enabled || !this.ensure()) return;
      const s = Math.min(1, Math.max(0.25, strength || 1));
      this._noise(0.45, 'bandpass', 700, 2600, 0.26 * s, 1.1);
      this._noise(0.30, 'lowpass', 900, 300, 0.16 * s, 0.9);
      const c = this.ctx, t = c.currentTime;
      for (let i = 0; i < 4; i++) {
        const o = c.createOscillator();
        o.type = 'sine';
        const f = 420 + Math.random() * 900;
        const st = t + 0.03 + Math.random() * 0.28;
        o.frequency.setValueAtTime(f, st);
        o.frequency.exponentialRampToValueAtTime(f * 1.9, st + 0.05);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.05 * s, st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0006, st + 0.09);
        o.connect(g); g.connect(this.master);
        o.start(st); o.stop(st + 0.12);
      }
    }

    /* the wave maker running */
    waveSwell(strength) {
      if (!this.enabled || !this.ensure()) return;
      const s = Math.min(1, Math.max(0.2, strength || 0.5));
      this._noise(1.1, 'bandpass', 420, 900, 0.10 * s, 0.7);
      this._noise(0.9, 'lowpass', 600, 180, 0.08 * s, 0.7);
    }

    waveStop() {
      if (!this.enabled || !this.ensure()) return;
      this._noise(0.55, 'lowpass', 700, 120, 0.12, 0.8);
    }

    ui(kind) {
      if (!this.enabled || !this.ensure()) return;
      if (kind === 'on') { this._tone(660, 990, 0.09, 0.10, 'triangle'); }
      else if (kind === 'off') { this._tone(520, 300, 0.09, 0.08, 'triangle'); }
      else { this._tone(880, 1200, 0.06, 0.06, 'sine'); }
    }
  }

  global.Sfx = new Sfx();
})(window);
