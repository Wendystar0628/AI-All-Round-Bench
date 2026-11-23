'use strict';
/* 音效：全部用 WebAudio 实时合成，由仿真回读的事件（冲量、入水速度、开裂质点数、白水量、推板运动）驱动 */
(function () {
  const A = JW.Audio = {
    ctx: null, on: false, master: null, noise: null, wave: null,

    enable(on) {
      this.on = on;
      if (on && !this.ctx) this._init();
      if (this.ctx) {
        if (on) this.ctx.resume();
        this.master.gain.setTargetAtTime(on ? 0.9 : 0.0, this.ctx.currentTime, 0.03);
      }
    },
    _init() {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      const ctx = this.ctx = new C();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.18;
      this.master = ctx.createGain(); this.master.gain.value = 0;
      this.master.connect(comp); comp.connect(ctx.destination);
      const len = ctx.sampleRate * 2;
      const buf = this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < len; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; }
      // 持续声：电机嗡鸣 + 水体哗哗声 + 破碎浪的嘶声
      const w = this.wave = {};
      w.motor = ctx.createOscillator(); w.motor.type = 'sawtooth'; w.motor.frequency.value = 48;
      w.motorLP = ctx.createBiquadFilter(); w.motorLP.type = 'lowpass'; w.motorLP.frequency.value = 260;
      w.motorG = ctx.createGain(); w.motorG.gain.value = 0;
      w.motor.connect(w.motorLP); w.motorLP.connect(w.motorG); w.motorG.connect(this.master); w.motor.start();
      const mk = (type, f, q) => {
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = 0.7 + Math.random() * 0.5;
        const bp = ctx.createBiquadFilter(); bp.type = type; bp.frequency.value = f; bp.Q.value = q;
        const g = ctx.createGain(); g.gain.value = 0;
        src.connect(bp); bp.connect(g); g.connect(this.master); src.start();
        return { g, bp };
      };
      w.slosh = mk('bandpass', 520, 0.7);
      w.hiss = mk('highpass', 2600, 0.5);
    },
    _ok() { return this.on && this.ctx && this.ctx.state === 'running'; },
    _env(g, t, peak, a, dcy) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
    },
    _tone(f0, f1, dur, peak, type, delay) {
      const ctx = this.ctx, t = ctx.currentTime + (delay || 0);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
      this._env(g, t, peak, 0.004, dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
    },
    _noise(type, f, q, dur, peak, delay, f1) {
      const ctx = this.ctx, t = ctx.currentTime + (delay || 0);
      const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const bp = ctx.createBiquadFilter(); bp.type = type; bp.frequency.setValueAtTime(f, t); bp.Q.value = q;
      if (f1) bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain();
      this._env(g, t, peak, 0.003, dur);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(t, Math.random()); src.stop(t + dur + 0.05);
    },

    /* 重球砸进果冻：低沉的“噗”+ 湿润的挤压声。s≈冲击速度×√质量 */
    thud(s) {
      if (!this._ok()) return;
      const k = JW.clamp(s / 5, 0.05, 1.3);
      this._tone(130 - 40 * k, 42, 0.22 + 0.2 * k, 0.5 * k, 'sine');
      this._noise('lowpass', 900 - 300 * k, 0.8, 0.12 + 0.12 * k, 0.28 * k, 0, 180);
      this._tone(260, 90, 0.09, 0.12 * k, 'triangle', 0.01);
    },
    /* 果冻把球弹回 / 晃动的“咕叽”声 */
    boing(s) {
      if (!this._ok()) return;
      const k = JW.clamp(s / 3, 0.05, 1);
      this._tone(70, 150 + 60 * k, 0.16, 0.22 * k, 'sine');
      this._noise('bandpass', 420, 2.5, 0.14, 0.10 * k, 0.02, 900);
    },
    /* 开裂：湿撕裂的噼啪声，n 为本帧新断裂的质点数 */
    crack(n) {
      if (!this._ok()) return;
      const k = JW.clamp(Math.log10(1 + n) / 3.2, 0.08, 1.2);
      const m = 2 + Math.floor(k * 5);
      for (let i = 0; i < m; i++) {
        const dl = i * (0.012 + Math.random() * 0.03);
        this._noise('bandpass', 1200 + Math.random() * 2600, 3.5, 0.03 + Math.random() * 0.05, 0.30 * k, dl);
      }
      this._tone(210, 60, 0.12, 0.26 * k, 'triangle');
      this._noise('lowpass', 500, 0.7, 0.2, 0.2 * k, 0.01, 120);
    },
    /* 刚体碰撞：kind 1 球-台面/槽壁, 2 球-球；wet>0 时在水下，声音发闷 */
    clack(s, kind, metal, wet) {
      if (!this._ok()) return;
      const k = JW.clamp(s / 2.5, 0.04, 1.2) * (wet ? 0.5 : 1);
      if (kind === 2) {
        const f = metal ? 2300 + Math.random() * 600 : 1500 + Math.random() * 300;
        this._tone(f, f * 0.96, wet ? 0.03 : 0.10 + (metal ? 0.18 : 0), 0.24 * k, 'sine');
        this._tone(f * 2.76, f * 2.7, wet ? 0.02 : 0.06 + (metal ? 0.08 : 0), 0.10 * k, 'sine');
        this._noise('highpass', wet ? 900 : 3000, 0.7, 0.012, 0.22 * k);
      } else {
        this._tone(wet ? 150 : 190, 70, 0.07, 0.42 * k, 'sine');
        this._noise('bandpass', wet ? 500 : 1500, 1.2, 0.03, 0.28 * k);
        if (metal && !wet) this._tone(1650, 1600, 0.12, 0.07 * k, 'sine');
      }
    },
    /* 入水：空腔的“咚”+ 飞溅的白噪声。s≈入水速度×√相对密度 */
    splash(s) {
      if (!this._ok()) return;
      const k = JW.clamp(s / 4.5, 0.06, 1.2);
      this._tone(170 + Math.random() * 40, 520 + 240 * k, 0.11 + 0.05 * k, 0.30 * k, 'sine', 0.015);
      this._noise('bandpass', 2200, 0.6, 0.22 + 0.28 * k, 0.34 * k, 0, 900);
      this._noise('highpass', 4200, 0.5, 0.10 + 0.2 * k, 0.16 * k, 0.03);
      for (let i = 0; i < 3; i++) this._tone(500 + Math.random() * 900, 900 + Math.random() * 1400, 0.03 + Math.random() * 0.04, 0.07 * k, 'sine', 0.12 + Math.random() * 0.35);
    },
    /* 持续声的目标值：motor 0..1 推板运动强度, freq 造浪频率, slosh 水面晃动强度, hiss 白水量 */
    setWave(motor, freq, slosh, hiss) {
      if (!this.ctx || !this.wave) return;
      const t = this.ctx.currentTime, w = this.wave, on = this.on ? 1 : 0;
      w.motorG.gain.setTargetAtTime(0.055 * motor * on, t, 0.12);
      w.motor.frequency.setTargetAtTime(34 + 26 * freq, t, 0.2);
      w.slosh.g.gain.setTargetAtTime(0.20 * JW.clamp(slosh, 0, 1.2) * on, t, 0.18);
      w.slosh.bp.frequency.setTargetAtTime(380 + 500 * JW.clamp(slosh, 0, 1), t, 0.3);
      w.hiss.g.gain.setTargetAtTime(0.16 * JW.clamp(hiss, 0, 1.3) * on, t, 0.10);
    },
  };
})();
