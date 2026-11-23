// audio.js —— WebAudio 合成音效与氛围音乐（全部程序生成）
(function () {
  const A = { ready: false, muted: false, volume: 0.8, ambientNodes: null, ambientId: null };
  G.audio = A;

  A.init = function () {
    if (A.ready) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      A.ctx = ctx;
      A.master = ctx.createGain();
      A.master.gain.value = A.volume;
      // 简单压限
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 6;
      A.master.connect(comp); comp.connect(ctx.destination);
      A.sfxGain = ctx.createGain(); A.sfxGain.gain.value = 0.9; A.sfxGain.connect(A.master);
      A.ambGain = ctx.createGain(); A.ambGain.gain.value = 0.5; A.ambGain.connect(A.master);
      // 噪声缓冲
      const len = ctx.sampleRate * 2;
      A.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = A.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      A.ready = true;
    } catch (e) { console.warn('音频初始化失败', e); }
  };

  A.setVolume = v => { A.volume = v; if (A.master) A.master.gain.value = A.muted ? 0 : v; };
  A.toggleMute = function () {
    A.muted = !A.muted;
    if (A.master) A.master.gain.value = A.muted ? 0 : A.volume;
    return A.muted;
  };

  function now() { return A.ctx.currentTime; }
  function env(g, t0, a, peak, dec, sus) {
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus || 0.0001, 0.0001), t0 + a + dec);
  }
  function osc(type, freq, t0, dur, gainPeak, dest, detune) {
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (detune) o.detune.value = detune;
    env(g, t0, 0.005, gainPeak, dur);
    o.connect(g); g.connect(dest || A.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.1);
    return o;
  }
  function noise(t0, dur, gainPeak, filterFreq, type, dest) {
    const src = A.ctx.createBufferSource(); src.buffer = A.noiseBuf; src.loop = true;
    const f = A.ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = filterFreq || 1000;
    const g = A.ctx.createGain();
    env(g, t0, 0.004, gainPeak, dur);
    src.connect(f); f.connect(g); g.connect(dest || A.sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.1);
    return { src, f };
  }

  // 定义音效库
  const SFX = {
    shoot(t) { osc('square', 880 + Math.random() * 120, t, 0.07, 0.10); osc('sine', 1760, t, 0.05, 0.05); },
    laser(t) { const o = osc('sawtooth', 1400, t, 0.16, 0.10); o.frequency.exponentialRampToValueAtTime(320, t + 0.16); },
    hit(t) { noise(t, 0.08, 0.12, 2200, 'bandpass'); },
    melee(t) { noise(t, 0.12, 0.16, 500, 'lowpass'); osc('triangle', 180, t, 0.1, 0.14); },
    boom(t) { noise(t, 0.5, 0.35, 320, 'lowpass'); osc('sine', 90, t, 0.4, 0.3); },
    bigboom(t) { noise(t, 0.9, 0.5, 240, 'lowpass'); osc('sine', 60, t, 0.8, 0.45); osc('sawtooth', 140, t, 0.5, 0.2); },
    heal(t) { [660, 880, 1100].forEach((f, i) => osc('sine', f, t + i * 0.06, 0.18, 0.07)); },
    shield(t) { osc('sine', 520, t, 0.25, 0.1); osc('sine', 780, t + 0.05, 0.3, 0.08); },
    encrypt(t) { osc('square', 220, t, 0.1, 0.1); osc('square', 233, t + 0.1, 0.1, 0.1); osc('sawtooth', 110, t + 0.2, 0.2, 0.12); },
    alarm(t) { for (let i = 0; i < 3; i++) { osc('sawtooth', 620, t + i * 0.22, 0.14, 0.1); osc('sawtooth', 466, t + i * 0.22 + 0.1, 0.12, 0.08); } },
    click(t) { osc('sine', 1200, t, 0.04, 0.07); },
    hover(t) { osc('sine', 900, t, 0.03, 0.03); },
    deploy(t) { osc('triangle', 300, t, 0.12, 0.15); osc('sine', 600, t + 0.08, 0.15, 0.12); noise(t + 0.05, 0.1, 0.06, 3000, 'highpass'); },
    upgrade(t) { [440, 660, 880, 1320].forEach((f, i) => osc('triangle', f, t + i * 0.07, 0.2, 0.09)); },
    sell(t) { [880, 660, 440].forEach((f, i) => osc('triangle', f, t + i * 0.06, 0.15, 0.08)); },
    route(t) { const o = osc('sine', 300, t, 0.35, 0.14); o.frequency.exponentialRampToValueAtTime(900, t + 0.3); noise(t, 0.25, 0.06, 4000, 'highpass'); },
    isolate(t) { osc('square', 180, t, 0.2, 0.12); osc('square', 185, t, 0.2, 0.12); noise(t + 0.1, 0.2, 0.08, 800, 'bandpass'); },
    unisolate(t) { osc('sine', 500, t, 0.15, 0.1); osc('sine', 750, t + 0.1, 0.2, 0.1); },
    wave(t) { osc('sawtooth', 220, t, 0.3, 0.14); osc('sawtooth', 277, t + 0.15, 0.35, 0.14); osc('sine', 110, t, 0.5, 0.12); },
    boss(t) { const o = osc('sawtooth', 70, t, 1.2, 0.3); o.frequency.linearRampToValueAtTime(50, t + 1.2); noise(t, 1.0, 0.15, 400, 'lowpass'); [220, 233].forEach(f => osc('square', f, t + 0.2, 0.8, 0.08)); },
    roar(t) { const o = osc('sawtooth', 100, t, 0.8, 0.25); o.frequency.exponentialRampToValueAtTime(45, t + 0.8); noise(t, 0.6, 0.2, 600, 'lowpass'); },
    leak(t) { osc('sawtooth', 520, t, 0.15, 0.14); osc('sawtooth', 392, t + 0.15, 0.25, 0.14); noise(t, 0.2, 0.12, 900, 'lowpass'); },
    trap(t) { const o = osc('square', 900, t, 0.2, 0.1); o.frequency.exponentialRampToValueAtTime(180, t + 0.2); noise(t, 0.15, 0.06, 2000, 'bandpass'); },
    detect(t) { osc('sine', 1500, t, 0.1, 0.08); osc('sine', 2000, t + 0.08, 0.12, 0.07); },
    split(t) { osc('square', 500, t, 0.06, 0.1); osc('square', 700, t + 0.06, 0.06, 0.1); osc('square', 950, t + 0.12, 0.08, 0.1); },
    hole(t) { const o = osc('sine', 800, t, 0.9, 0.2); o.frequency.exponentialRampToValueAtTime(60, t + 0.9); noise(t, 0.7, 0.14, 300, 'lowpass'); },
    storm(t) { noise(t, 1.2, 0.2, 2000, 'bandpass'); [300, 320, 340].forEach(f => osc('sawtooth', f, t, 0.8, 0.06)); },
    lock(t) { [200, 180, 160].forEach((f, i) => { osc('square', f, t + i * 0.15, 0.12, 0.12); }); noise(t, 0.3, 0.1, 1200, 'bandpass'); },
    win(t) { [523, 659, 784, 1046, 1318].forEach((f, i) => osc('triangle', f, t + i * 0.12, 0.5, 0.12)); },
    lose(t) { [392, 370, 349, 330].forEach((f, i) => osc('sawtooth', f, t + i * 0.3, 0.6, 0.12)); },
    error(t) { osc('square', 160, t, 0.12, 0.1); osc('square', 120, t + 0.13, 0.15, 0.1); },
    skill(t) { [523, 784, 1046].forEach((f, i) => osc('sine', f, t + i * 0.05, 0.25, 0.1)); },
    cleanse(t) { [1046, 1318, 1568].forEach((f, i) => osc('sine', f, t + i * 0.05, 0.3, 0.08)); },
    slow(t) { const o = osc('sine', 400, t, 0.3, 0.08); o.frequency.exponentialRampToValueAtTime(180, t + 0.3); },
    cooldowntick(t) { osc('sine', 1100, t, 0.05, 0.05); }
  };

  A.play = function (name, opt) {
    if (!A.ready || A.muted) return;
    const fn = SFX[name];
    if (!fn) return;
    try { fn(now() + (opt && opt.delay || 0)); } catch (e) { /* ignore */ }
  };

  // 环境声 + 生成式配乐
  const AMBIENTS = {
    map1: { root: 55, chord: [1, 1.5, 2.0, 2.5], tempo: 0.5, bright: 1200, noise: 0.02 },
    map2: { root: 49, chord: [1, 1.2, 1.5, 1.8], tempo: 0.35, bright: 800, noise: 0.035 },
    map3: { root: 62, chord: [1, 1.125, 1.5, 2.25], tempo: 0.62, bright: 1600, noise: 0.015 }
  };
  let ambTimer = null, ambStep = 0;
  A.startAmbient = function (mapId) {
    if (!A.ready) return;
    A.stopAmbient();
    const cfg = AMBIENTS[mapId] || AMBIENTS.map1;
    A.ambientId = mapId;
    const nodes = [];
    // 长音铺底
    cfg.chord.forEach((ratio, i) => {
      const o = A.ctx.createOscillator(), g = A.ctx.createGain(), f = A.ctx.createBiquadFilter();
      o.type = i % 2 ? 'sawtooth' : 'sine';
      o.frequency.value = cfg.root * ratio;
      f.type = 'lowpass'; f.frequency.value = cfg.bright;
      g.gain.value = 0.028;
      const lfo = A.ctx.createOscillator(), lg = A.ctx.createGain();
      lfo.frequency.value = 0.05 + i * 0.03; lg.gain.value = 0.012;
      lfo.connect(lg); lg.connect(g.gain);
      o.connect(f); f.connect(g); g.connect(A.ambGain);
      o.start(); lfo.start();
      nodes.push(o, lfo);
    });
    // 滤波噪声风
    const ns = A.ctx.createBufferSource(); ns.buffer = A.noiseBuf; ns.loop = true;
    const nf = A.ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = cfg.bright * 1.5; nf.Q.value = 0.6;
    const ng = A.ctx.createGain(); ng.gain.value = cfg.noise;
    ns.connect(nf); nf.connect(ng); ng.connect(A.ambGain); ns.start();
    nodes.push(ns);
    A.ambientNodes = nodes;
    // 生成式琶音
    ambStep = 0;
    ambTimer = setInterval(() => {
      if (A.muted || !A.ready) return;
      ambStep++;
      if (ambStep % 2 === 0 && Math.random() < 0.75) {
        const scale = [1, 1.189, 1.335, 1.498, 1.782, 2];
        const r = scale[Math.floor(Math.random() * scale.length)];
        const o = A.ctx.createOscillator(), g = A.ctx.createGain();
        o.type = 'triangle'; o.frequency.value = cfg.root * 4 * r;
        env(g, now(), 0.01, 0.045, 0.7);
        o.connect(g); g.connect(A.ambGain); o.start(); o.stop(now() + 0.9);
      }
      if (ambStep % 16 === 0) {
        const o = A.ctx.createOscillator(), g = A.ctx.createGain();
        o.type = 'sine'; o.frequency.value = cfg.root * 0.5;
        env(g, now(), 0.5, 0.05, 2.0);
        o.connect(g); g.connect(A.ambGain); o.start(); o.stop(now() + 3);
      }
    }, Math.floor(1000 / (cfg.tempo * 2)));
  };
  A.stopAmbient = function () {
    if (ambTimer) { clearInterval(ambTimer); ambTimer = null; }
    if (A.ambientNodes) {
      A.ambientNodes.forEach(n => { try { n.stop(); } catch (e) {} });
      A.ambientNodes = null;
    }
  };
})();
