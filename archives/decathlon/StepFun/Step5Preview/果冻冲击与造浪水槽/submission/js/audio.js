window.APP = window.APP || {};
(function () {
  'use strict';
  const APP = window.APP;
  let ctx = null, master = null, enabled = true, started = false;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.85 : 0.0;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function resume() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    started = true;
  }

  function setEnabled(v) {
    enabled = v;
    if (master) master.gain.setTargetAtTime(v ? 0.85 : 0.0, ctx.currentTime, 0.02);
  }
  function isEnabled() { return enabled; }

  function env(g, t0, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
    env(g, t, 0.005, dur, vol);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.06);
  }

  function noise(dur, vol, filterType, f0, f1, q) {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType || 'lowpass';
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    f.Q.value = q || 1;
    const g = ctx.createGain();
    env(g, t, 0.004, dur, vol);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.06);
  }

  const api = {
    resume, setEnabled, isEnabled,
    impact(v) {
      const s = Math.max(0.15, Math.min(1.5, v));
      tone(90 * (1 / Math.sqrt(s)) + 30, 0.16 + 0.1 * s, 'sine', 0.5 * s, 40);
      noise(0.1 + 0.08 * s, 0.35 * s, 'lowpass', 900 + 400 * s, 200, 1);
    },
    wobble(v) {
      const s = Math.max(0.2, Math.min(1.4, v));
      tone(120 / s, 0.4 + 0.2 * s, 'sine', 0.28, 60 / s);
      tone(180 / s, 0.3, 'triangle', 0.14, 90 / s);
    },
    crack(v) {
      const s = Math.max(0.3, Math.min(1.5, v));
      noise(0.09, 0.5 * s, 'highpass', 2200, 1400, 1);
      noise(0.16, 0.3 * s, 'bandpass', 3200, 900, 4);
      tone(220, 0.07, 'square', 0.1 * s, 90);
    },
    click(v) {
      const s = Math.max(0.2, Math.min(1.4, v));
      tone(700 + 500 * s, 0.06, 'sine', 0.3 * s, 300);
      noise(0.04, 0.22 * s, 'bandpass', 3000, 1800, 2);
    },
    splash(v) {
      const s = Math.max(0.2, Math.min(1.6, v));
      noise(0.22 + 0.2 * s, 0.3 * s, 'bandpass', 1400 + 900 * s, 500, 1.2);
      noise(0.1, 0.16 * s, 'highpass', 2600, 1600, 1);
      tone(300, 0.1, 'sine', 0.08 * s, 140);
    },
    waveGain(v) {
      if (!ensure() || !enabled) return;
      if (!api._wg) {
        const s = ctx.createBufferSource();
        s.buffer = noiseBuf; s.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 0.8;
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        s.connect(f); f.connect(g); g.connect(master);
        s.start();
        api._wg = g; api._ws = s;
      }
      api._wg.gain.setTargetAtTime(Math.max(0.0001, v * 0.1), ctx.currentTime, 0.15);
    },
    ambient() {
      if (!ensure() || !enabled) return;
      if (api._amb) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 58;
      g.gain.value = 0.012;
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = 'sine'; o2.frequency.value = 87;
      g2.gain.value = 0.008;
      o.connect(g); g.connect(master); o2.connect(g2); g2.connect(master);
      o.start(); o2.start();
      api._amb = true;
    },
  };
  APP.audio = api;
})();
