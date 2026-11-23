/* ============================================================
   audio.js — 内置音色合成：配乐与音效（Web Audio）
   ============================================================ */
(function (global) {
  'use strict';
  const A = { ctx: null, master: null, playing: false, startCtx: 0, startComp: 0, comp: null, timer: null, nodes: [], scheduled: 0 };

  const PATTERNS = {
    forge: { bpm: 92, beats: [0.5, 1.5, 2.5, 3.5], accents: [6.5, 8.5, 10.5] },
    ember: { bpm: 120 },
    hit: { bpm: 60 },
    whoosh: { bpm: 60 },
    bell: { bpm: 60 },
    drone: { bpm: 60 }
  };

  A.unlock = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    try {
      A.ctx = new (window.AudioContext || window.webkitAudioContext)();
      A.master = A.ctx.createGain();
      A.master.gain.value = 0.55;
      const comp = A.ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
      A.master.connect(comp); comp.connect(A.ctx.destination);
    } catch (e) { console.warn('音频不可用', e); }
  };

  A.stop = function () {
    A.playing = false;
    if (A.timer) { clearInterval(A.timer); A.timer = null; }
    for (const n of A.nodes) { try { n.stop ? n.stop() : (n.disconnect && n.disconnect()); } catch (e) { } }
    A.nodes = [];
  };

  A.start = function (comp, time) {
    if (!A.ctx) return;
    A.stop();
    A.playing = true;
    A.comp = comp;
    A.startComp = time;
    A.startCtx = A.ctx.currentTime + 0.06;
    A.scheduled = time;
    A.tick();
    A.timer = setInterval(() => A.tick(), 90);
  };
  A.seek = function (comp, time) {
    if (!A.playing) return;
    A.start(comp, time);
  };
  A.now = function () { return A.startComp + (A.ctx.currentTime - A.startCtx); };

  A.tick = function () {
    if (!A.playing || !A.comp) return;
    const comp = A.comp;
    const now = A.now();
    const ahead = now + 0.35;
    const layers = comp.layers.filter(l => l.type === 'audio' && l.enabled);
    for (const L of layers) {
      const t0 = Math.max(L.inPoint, A.scheduled);
      if (t0 >= ahead) continue;
      const st = new EVAL.EvalState(comp, now);
      const vol = (L.audio.mute ? 0 : st.getProp(L, ['audio', 'volume']) / 100);
      if (vol <= 0) continue;
      const pat = L.audio.pattern || 'forge';
      const evs = patternEvents(pat, t0, ahead, L, comp);
      for (const ev of evs) {
        if (ev.t < A.scheduled - 0.02 || ev.t >= ahead) continue;
        playEvent(ev, A.startCtx + (ev.t - A.startComp), vol);
      }
    }
    A.scheduled = ahead;
  };

  function patternEvents(pat, t0, t1, L, comp) {
    const out = [];
    const dur = t1 - t0;
    if (pat === 'forge') {
      // 低音持续
      out.push({ t: t0, type: 'drone', gain: 0.5, dur: dur + 0.1 });
      // 心跳脉冲
      const beat = 60 / 92;
      for (let t = Math.floor(t0 / beat) * beat; t < t1; t += beat) {
        if (t < t0) continue;
        out.push({ t, type: 'kick', gain: 0.35 });
      }
      // 锤击重音
      for (const ht of [6.55, 8.55, 10.55]) {
        if (ht >= t0 && ht < t1) {
          out.push({ t: ht, type: 'anvil', gain: 1.0 });
          out.push({ t: ht + 0.01, type: 'noise', gain: 0.5, dur: 0.25, freq: 2400 });
        }
        if (ht - 0.35 >= t0 && ht - 0.35 < t1) out.push({ t: ht - 0.35, type: 'whoosh', gain: 0.45, dur: 0.4 });
      }
      // 火星噼啪
      const rng = new U.RNG(Math.floor(t0 * 1000) + 7);
      for (let i = 0; i < dur * 26; i++) {
        const t = t0 + rng.next() * dur;
        out.push({ t, type: 'crackle', gain: rng.range(0.03, 0.12), freq: rng.range(2200, 6200) });
      }
      // 结尾钟声
      if (13.2 >= t0 && 13.2 < t1) out.push({ t: 13.2, type: 'bell', gain: 0.6, freq: 392 });
    } else if (pat === 'ember') {
      const rng = new U.RNG(Math.floor(t0 * 777) + 3);
      for (let i = 0; i < dur * 40; i++) out.push({ t: t0 + rng.next() * dur, type: 'crackle', gain: rng.range(0.02, 0.09), freq: rng.range(1800, 7000) });
    } else if (pat === 'hit') {
      if (L.inPoint >= t0 && L.inPoint < t1) out.push({ t: L.inPoint, type: 'anvil', gain: 1 });
    } else if (pat === 'whoosh') {
      if (L.inPoint >= t0 && L.inPoint < t1) out.push({ t: L.inPoint, type: 'whoosh', gain: 0.8, dur: 0.8 });
    } else if (pat === 'bell') {
      if (L.inPoint >= t0 && L.inPoint < t1) out.push({ t: L.inPoint, type: 'bell', gain: 0.8, freq: 523 });
    } else if (pat === 'drone') {
      out.push({ t: t0, type: 'drone', gain: 0.6, dur: dur + 0.1 });
    }
    return out;
  }

  function env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function playEvent(ev, when, vol) {
    const ctx = A.ctx;
    if (when < ctx.currentTime) when = ctx.currentTime + 0.001;
    const out = A.master;
    switch (ev.type) {
      case 'kick': {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, when);
        o.frequency.exponentialRampToValueAtTime(38, when + 0.22);
        env(g, when, 0.005, 0.35, 0.5 * vol);
        o.connect(g); g.connect(out);
        o.start(when); o.stop(when + 0.5); A.nodes.push(o);
        break;
      }
      case 'anvil': {
        // 金属撞击：非谐分音 + 噪声
        const partials = [1, 2.76, 5.4, 8.9, 13.3];
        const base = 196;
        for (let i = 0; i < partials.length; i++) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = base * partials[i] * (1 + (Math.random() - 0.5) * 0.01);
          const gg = 0.28 / (i + 1.2) * vol;
          env(g, when, 0.002, 0.9 + i * 0.35, gg);
          o.connect(g); g.connect(out);
          o.start(when); o.stop(when + 2.2); A.nodes.push(o);
        }
        const nb = noiseBuffer(ctx, 0.25);
        const ns = ctx.createBufferSource(); ns.buffer = nb;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 1.2;
        const ng = ctx.createGain(); env(ng, when, 0.001, 0.18, 0.5 * vol);
        ns.connect(bp); bp.connect(ng); ng.connect(out);
        ns.start(when); A.nodes.push(ns);
        break;
      }
      case 'bell': {
        const f = ev.freq || 523;
        const partials = [1, 2.0, 3.0, 4.2];
        for (let i = 0; i < partials.length; i++) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = f * partials[i];
          env(g, when, 0.005, 1.6 + i * 0.4, 0.22 / (i + 1) * vol);
          o.connect(g); g.connect(out);
          o.start(when); o.stop(when + 3); A.nodes.push(o);
        }
        break;
      }
      case 'whoosh': {
        const dur = ev.dur || 0.5;
        const nb = noiseBuffer(ctx, dur + 0.1);
        const ns = ctx.createBufferSource(); ns.buffer = nb;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6;
        bp.frequency.setValueAtTime(300, when);
        bp.frequency.exponentialRampToValueAtTime(2600, when + dur * 0.7);
        bp.frequency.exponentialRampToValueAtTime(500, when + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(0.35 * vol, when + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        ns.connect(bp); bp.connect(g); g.connect(out);
        ns.start(when); A.nodes.push(ns);
        break;
      }
      case 'crackle': {
        const nb = noiseBuffer(ctx, 0.03);
        const ns = ctx.createBufferSource(); ns.buffer = nb;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ev.freq || 3000; bp.Q.value = 2.5;
        const g = ctx.createGain(); env(g, when, 0.001, 0.03, 0.5 * vol);
        ns.connect(bp); bp.connect(g); g.connect(out);
        ns.start(when); A.nodes.push(ns);
        break;
      }
      case 'noise': {
        const nb = noiseBuffer(ctx, ev.dur || 0.2);
        const ns = ctx.createBufferSource(); ns.buffer = nb;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ev.freq || 2000; bp.Q.value = 0.8;
        const g = ctx.createGain(); env(g, when, 0.002, ev.dur || 0.2, 0.3 * vol);
        ns.connect(bp); bp.connect(g); g.connect(out);
        ns.start(when); A.nodes.push(ns);
        break;
      }
      case 'drone': {
        const dur = ev.dur || 2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(0.12 * vol, when + 0.4);
        g.gain.setValueAtTime(0.12 * vol, when + Math.max(0.4, dur - 0.3));
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.2);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.7;
        for (const [f, det] of [[55, -4], [55, 4], [82.5, 0]]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth';
          o.frequency.value = f; o.detune.value = det;
          o.connect(lp); o.start(when); o.stop(when + dur + 0.3); A.nodes.push(o);
        }
        lp.connect(g); g.connect(out);
        break;
      }
    }
  }
  function noiseBuffer(ctx, dur) {
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = (seed / 0x7fffffff) * 2 - 1; }
    return b;
  }

  global.AUDIO = A;
})(window);
