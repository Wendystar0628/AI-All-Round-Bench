/* =========================================================================
 *  动态路由塔防 · 音频
 *  audio.js — 程序化环境声 / 音乐 / 音效（无外部素材）
 * ========================================================================= */
(function (global) {
  'use strict';
  const RT = (global.RT = global.RT || {});
  const A = {
    ctx: null, master: null, musicGain: null, sfxGain: null,
    enabled: true, volume: 0.7, started: false, timer: null,
    step: 0, nextTime: 0, mapId: null, schedule: null
  };

  const SCALES = {
    m1: { root: 146.83, scale: [0, 3, 5, 7, 10], bpm: 84, wave: 'triangle', pad: 'sine' },
    m2: { root: 130.81, scale: [0, 1, 4, 5, 7, 8, 11], bpm: 92, wave: 'sawtooth', pad: 'triangle' },
    m3: { root: 110.0, scale: [0, 2, 3, 5, 7, 9, 10], bpm: 76, wave: 'square', pad: 'sine' }
  };

  function ensure() {
    if (A.ctx) return A.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    A.ctx = new AC();
    A.master = A.ctx.createGain();
    A.master.gain.value = A.volume;
    A.master.connect(A.ctx.destination);
    A.musicGain = A.ctx.createGain();
    A.musicGain.gain.value = 0.34;
    A.musicGain.connect(A.master);
    A.sfxGain = A.ctx.createGain();
    A.sfxGain.gain.value = 0.85;
    A.sfxGain.connect(A.master);
    return A.ctx;
  }

  /* ---------------- 噪声缓冲 ---------------- */
  let noiseBuf = null;
  function noise() {
    if (noiseBuf) return noiseBuf;
    const ctx = A.ctx;
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  /* ---------------- 环境声 ---------------- */
  A.startAmbient = function (mapId) {
    if (!ensure()) return;
    A.mapId = mapId;
    if (!A.ambientNodes) {
      const ctx = A.ctx;
      const src = ctx.createBufferSource();
      src.buffer = noise(); src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 320; filt.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.value = 0.05;
      src.connect(filt); filt.connect(g); g.connect(A.master);
      src.start();
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lg = ctx.createGain(); lg.gain.value = 180;
      lfo.connect(lg); lg.connect(filt.frequency); lfo.start();
      A.ambientNodes = { src, filt, g };
    }
    A.ambientNodes.g.gain.setTargetAtTime(0.055, A.ctx.currentTime, 1.2);
    A.ambientNodes.filt.frequency.setTargetAtTime(mapId === 'm2' ? 460 : mapId === 'm3' ? 220 : 340, A.ctx.currentTime, 1.2);
    if (!A.timer) {
      A.nextTime = A.ctx.currentTime + 0.1;
      A.timer = setInterval(scheduleMusic, 40);
    }
    A.started = true;
  };

  function scheduleMusic() {
    if (!A.ctx || !A.enabled) return;
    const cfg = SCALES[A.mapId || 'm1'];
    const spb = 60 / cfg.bpm / 2;   // 八分音符
    while (A.nextTime < A.ctx.currentTime + 0.5) {
      const t = A.nextTime;
      const s = A.step;
      // 低音脉冲
      if (s % 8 === 0) tone(cfg.root / 2, t, 0.5, 'sawtooth', 0.16, 240);
      // 琶音
      const deg = cfg.scale[(s * 3 + Math.floor(s / 8)) % cfg.scale.length];
      const oct = (s % 16 < 8) ? 1 : 2;
      const f = cfg.root * oct * Math.pow(2, deg / 12);
      tone(f, t, 0.18, cfg.wave, 0.055, 2200);
      // 高层泛音点缀
      if (s % 16 === 6) tone(cfg.root * 4 * Math.pow(2, cfg.scale[(s) % cfg.scale.length] / 12), t, 0.5, 'sine', 0.03, 5200);
      A.nextTime += spb;
      A.step++;
    }
  }

  function tone(freq, t, dur, type, gain, cutoff) {
    const ctx = A.ctx;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff || 2400;
    o.connect(f); f.connect(g); g.connect(A.musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /* ---------------- 音效 ---------------- */
  A.sfx = function (name, opt) {
    if (!A.enabled) return;
    if (!ensure()) return;
    if (A.ctx.state === 'suspended') A.ctx.resume();
    const ctx = A.ctx, t = ctx.currentTime;
    opt = opt || {};
    const vol = opt.vol === undefined ? 1 : opt.vol;

    function blip(f1, f2, dur, type, gain, filt) {
      const o = ctx.createOscillator(); o.type = type || 'square';
      o.frequency.setValueAtTime(f1, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt || 3200;
      o.connect(f); f.connect(g); g.connect(A.sfxGain);
      o.start(t); o.stop(t + dur + 0.03);
    }
    function burst(dur, gain, f0, f1, type) {
      const s = ctx.createBufferSource(); s.buffer = noise();
      const f = ctx.createBiquadFilter(); f.type = type || 'lowpass';
      f.frequency.setValueAtTime(f0, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain * vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(A.sfxGain);
      s.start(t); s.stop(t + dur + 0.02);
    }

    switch (name) {
      case 'deploy': blip(320, 620, 0.16, 'square', 0.22, 2600); blip(180, 300, 0.2, 'sine', 0.18, 1200); break;
      case 'shot': blip(880, 420, 0.09, 'square', 0.11, 4200); burst(0.05, 0.06, 5200, 1400, 'highpass'); break;
      case 'aoe': blip(150, 70, 0.26, 'sine', 0.16, 900); burst(0.24, 0.1, 1800, 260, 'lowpass'); break;
      case 'hit': burst(0.09, 0.09, 3200, 700); break;
      case 'boom': burst(0.6, 0.34, 1500, 90); blip(120, 42, 0.55, 'sine', 0.26, 700); break;
      case 'bigboom': burst(1.1, 0.42, 900, 50); blip(78, 28, 1.0, 'sine', 0.34, 500); break;
      case 'leak': blip(420, 90, 0.5, 'sawtooth', 0.24, 1600); burst(0.4, 0.12, 900, 160); break;
      case 'wave': blip(220, 440, 0.16, 'square', 0.16, 2000); setTimeout(() => A.enabled && blip(330, 660, 0.2, 'square', 0.14, 2200), 130); break;
      case 'boss': blip(90, 42, 1.3, 'sawtooth', 0.34, 500); burst(1.2, 0.2, 700, 80); break;
      case 'isolate': blip(600, 180, 0.28, 'square', 0.18, 1400); burst(0.2, 0.1, 2000, 300); break;
      case 'release': blip(180, 620, 0.24, 'triangle', 0.18, 2600); break;
      case 'upgrade': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => A.enabled && blip(f, f * 1.01, 0.16, 'triangle', 0.16, 4200), i * 85)); break;
      case 'skill': blip(300, 900, 0.3, 'sine', 0.2, 5200); burst(0.3, 0.08, 4000, 800, 'highpass'); break;
      case 'error': blip(160, 120, 0.22, 'square', 0.16, 700); break;
      case 'click': blip(1400, 1100, 0.05, 'square', 0.07, 5200); break;
      case 'hover': blip(1900, 2100, 0.035, 'sine', 0.045, 6000); break;
      case 'select': blip(700, 1200, 0.08, 'triangle', 0.11, 4200); break;
      case 'victory': [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => A.enabled && blip(f, f, 0.4, 'triangle', 0.18, 5000), i * 130)); break;
      case 'defeat': [440, 392, 330, 262].forEach((f, i) => setTimeout(() => A.enabled && blip(f, f * 0.98, 0.5, 'sawtooth', 0.16, 1400), i * 180)); break;
      default: break;
    }
  };

  A.setVolume = function (v) {
    A.volume = v;
    if (A.master) A.master.gain.setTargetAtTime(A.enabled ? v : 0, A.ctx.currentTime, 0.05);
  };
  A.toggleMute = function () {
    A.enabled = !A.enabled;
    if (A.master) A.master.gain.setTargetAtTime(A.enabled ? A.volume : 0, A.ctx.currentTime, 0.05);
    return A.enabled;
  };
  A.resume = function () { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); };

  RT.Audio = A;
})(typeof window !== 'undefined' ? window : globalThis);
