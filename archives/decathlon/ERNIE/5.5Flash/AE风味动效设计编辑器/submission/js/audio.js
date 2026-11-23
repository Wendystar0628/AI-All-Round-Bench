/* AE Forge Editor - built-in synth audio for tone layers */
(function (global) {
  'use strict';

  const AE = {
    ctx: null, master: null, noiseBuf: null, playing: false,
    nodes: [], muted: false, lastSync: -1,
  };

  function ensure() {
    if (AE.ctx) return AE.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    AE.ctx = new AC();
    AE.master = AE.ctx.createGain();
    AE.master.gain.value = 0.55;
    const comp = AE.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    AE.master.connect(comp);
    comp.connect(AE.ctx.destination);
    const len = AE.ctx.sampleRate * 2;
    const buf = AE.ctx.createBuffer(1, len, AE.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    AE.noiseBuf = buf;
    return AE.ctx;
  }

  function noise(dur, gain, filterType, f0, f1, q) {
    const ctx = AE.ctx;
    const src = ctx.createBufferSource();
    src.buffer = AE.noiseBuf;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = filterType || 'bandpass';
    flt.frequency.value = f0 || 800;
    flt.Q.value = q || 1;
    if (f1) flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(flt);
    flt.connect(g);
    g.connect(AE.master);
    src.start();
    src.stop(ctx.currentTime + dur + 0.05);
    AE.nodes.push(src);
    return g;
  }

  function tone(freq, dur, gain, type, slideTo) {
    const ctx = AE.ctx;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g);
    g.connect(AE.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.05);
    AE.nodes.push(o);
    return g;
  }

  function env(g, peak, attack, dur) {
    const t = AE.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function playImpact(gain) {
    const ctx = AE.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    g.connect(AE.master);
    const partials = [196, 421, 673, 1073, 1571, 2303];
    partials.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.01);
      const og = ctx.createGain();
      og.gain.value = 0.32 / (i + 1);
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + 1.5);
      AE.nodes.push(o);
    });
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(110, t);
    thump.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.9, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    thump.connect(tg); tg.connect(g);
    thump.start(t); thump.stop(t + 0.55);
    const ng = noise(0.25, 0.5, 'highpass', 1800, 900, 0.7);
    ng.connect(g);
    AE.nodes.push(g);
  }

  function playEvent(ev) {
    if (!AE.ctx) return;
    const gain = (ev.gain === undefined ? 1 : ev.gain);
    switch (ev.type) {
      case 'drone': {
        const ctx = AE.ctx;
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        g.gain.exponentialRampToValueAtTime(0.12 * gain, ctx.currentTime + 1.5);
        g.gain.setValueAtTime(0.12 * gain, ctx.currentTime + Math.max(1.6, (ev.dur || 10) - 1.2));
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ev.dur || 10));
        g.connect(AE.master);
        [55, 82.5, 110].forEach((f, i) => {
          const o = ctx.createOscillator();
          o.type = i === 2 ? 'triangle' : 'sawtooth';
          o.frequency.value = f;
          o.detune.value = (i - 1) * 6;
          const og = ctx.createGain();
          og.gain.value = 0.25 / (i + 1);
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass'; lp.frequency.value = 240;
          o.connect(og); og.connect(lp); lp.connect(g);
          o.start(); o.stop(ctx.currentTime + (ev.dur || 10) + 0.1);
          AE.nodes.push(o);
        });
        break;
      }
      case 'whoosh': {
        const dur = ev.dur || 0.6;
        const g = noise(dur, 0.0001, 'bandpass', 300, 2400, 1.2);
        env(g, 0.16 * gain, dur * 0.4, dur);
        break;
      }
      case 'write': {
        const dur = ev.dur || 1.5;
        const g = noise(dur, 0.0001, 'highpass', 3000, 5000, 0.8);
        env(g, 0.05 * gain, 0.15, dur);
        break;
      }
      case 'heat': {
        const dur = ev.dur || 2.5;
        const g = noise(dur, 0.0001, 'lowpass', 500, 900, 0.6);
        env(g, 0.12 * gain, 0.6, dur);
        const o = tone(72, dur, 0.0001, 'sawtooth', 96);
        env(o, 0.05 * gain, 0.5, dur);
        break;
      }
      case 'riser': {
        const dur = ev.dur || 1.8;
        const g = noise(dur, 0.0001, 'bandpass', 400, 5200, 2.2);
        env(g, 0.22 * gain, dur * 0.85, dur);
        const o = tone(180, dur, 0.0001, 'sawtooth', 720);
        env(o, 0.05 * gain, dur * 0.8, dur);
        break;
      }
      case 'impact':
        playImpact(gain);
        break;
      case 'sizzle': {
        const dur = ev.dur || 2;
        const g = noise(dur, 0.0001, 'highpass', 4200, 2600, 0.7);
        env(g, 0.1 * gain, 0.05, dur);
        break;
      }
      case 'chime': {
        const g1 = tone(880, 2.4, 0.0001, 'sine');
        env(g1, 0.12 * gain, 0.01, 2.4);
        const g2 = tone(1320, 2.0, 0.0001, 'sine');
        env(g2, 0.07 * gain, 0.01, 2.0);
        break;
      }
    }
  }

  AE.playFrom = function (time) {
    const ctx = ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    AE.stop();
    const comp = global.AEProject.activeComp();
    const t0 = ctx.currentTime + 0.03;
    for (const l of comp.layers) {
      if (l.type !== 'audio' || !l.enabled) continue;
      const patch = l.audio || {};
      for (const ev of (patch.events || [])) {
        const evEnd = ev.t + (ev.dur || 2.5);
        if (evEnd < time) continue;
        const delay = Math.max(0, ev.t - time);
        const evCopy = Object.assign({}, ev);
        const origPlay = playEvent;
        setTimeout(() => {
          if (!AE.playing && global.AEProject.state.exporting !== true) return;
          try { origPlay(evCopy); } catch (e) { }
        }, delay * 1000);
      }
    }
    AE.playing = true;
    AE.startedAt = ctx.currentTime;
    AE.startOffset = time;
  };

  AE.stop = function () {
    AE.playing = false;
    for (const n of AE.nodes) { try { n.stop(); } catch (e) { } }
    AE.nodes.length = 0;
  };

  AE.setMuted = function (m) {
    AE.muted = m;
    if (AE.master) AE.master.gain.value = m ? 0 : 0.55;
  };

  AE.uiClick = function () {
    const ctx = ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (!AE._clickBuf) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 1200;
      g.gain.value = 0.02;
      o.connect(g); g.connect(AE.master);
      o.start(); o.stop(ctx.currentTime + 0.03);
      AE._clickBuf = true;
    }
  };

  global.AEAudio = AE;
})(window);