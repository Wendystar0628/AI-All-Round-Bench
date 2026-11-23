/* 音频引擎：WebAudio 程序化合成。三图环境音乐 + 各类音效。首次用户手势后启动。 */
(function (root) {
  'use strict';
  const ND = root.ND = root.ND || {};
  const A = ND.Audio = {
    ctx: null, master: null, musicGain: null, sfxGain: null,
    muted: false, volume: 0.7, musicVol: 0.5, started: false,
    _musicTimer: null, _theme: null, _nextNote: 0, _step: 0,
  };
  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    A.ctx = new AC();
    A.master = A.ctx.createGain(); A.master.gain.value = A.muted ? 0 : A.volume;
    const comp = A.ctx.createDynamicsCompressor();
    A.master.connect(comp); comp.connect(A.ctx.destination);
    A.musicGain = A.ctx.createGain(); A.musicGain.gain.value = A.musicVol * 0.5; A.musicGain.connect(A.master);
    A.sfxGain = A.ctx.createGain(); A.sfxGain.gain.value = 0.9; A.sfxGain.connect(A.master);
    A.started = true;
    if (A._theme) A.startMusic(A._theme);
  };
  A.setVolume = function (v) { A.volume = v; if (A.master) A.master.gain.value = A.muted ? 0 : v; };
  A.setMusicVolume = function (v) { A.musicVol = v; if (A.musicGain) A.musicGain.gain.value = v * 0.5; };
  A.setMuted = function (m) { A.muted = m; if (A.master) A.master.gain.value = m ? 0 : A.volume; };

  function tone(freq, dur, type, gain, slideTo, when) {
    if (!A.ctx) return;
    const t0 = when || A.ctx.currentTime;
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(A.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, freq, gain, when, type) {
    if (!A.ctx) return;
    const t0 = when || A.ctx.currentTime;
    const len = Math.max(1, Math.floor(A.ctx.sampleRate * dur));
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = A.ctx.createBufferSource(); src.buffer = buf;
    const f = A.ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = 1;
    const g = A.ctx.createGain(); g.gain.value = gain || 0.15;
    src.connect(f); f.connect(g); g.connect(A.sfxGain);
    src.start(t0);
  }
  function musicTone(freq, dur, type, gain, when) {
    if (!A.ctx) return;
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(A.musicGain);
    o.start(when); o.stop(when + dur + 0.1);
  }

  const SFX = {
    click: () => tone(1200, 0.05, 'square', 0.06, 800),
    hover: () => tone(1800, 0.03, 'sine', 0.03),
    error: () => { tone(220, 0.15, 'sawtooth', 0.12, 120); },
    place: () => { tone(400, 0.12, 'triangle', 0.15, 700); noise(0.08, 2000, 0.05); },
    upgrade: () => { tone(500, 0.1, 'sine', 0.12, 900); tone(750, 0.15, 'sine', 0.1, 1200, A.ctx ? A.ctx.currentTime + 0.08 : 0); },
    shot: () => { noise(0.06, 3500, 0.08); tone(900, 0.05, 'square', 0.05, 300); },
    pierce: () => { noise(0.12, 2500, 0.12); tone(600, 0.12, 'sawtooth', 0.08, 150); },
    pulse: () => { tone(300, 0.2, 'sine', 0.12, 100); noise(0.15, 800, 0.06); },
    kill: () => { noise(0.12, 1500, 0.1); tone(600, 0.1, 'triangle', 0.08, 200); },
    melee: () => noise(0.06, 900, 0.08),
    ransom: () => { tone(700, 0.1, 'sawtooth', 0.07, 300); },
    encrypt: () => { tone(400, 0.2, 'square', 0.09, 150); tone(300, 0.2, 'square', 0.07, 100, A.ctx ? A.ctx.currentTime + 0.05 : 0); },
    isolate: () => { tone(200, 0.25, 'sawtooth', 0.14, 80); noise(0.2, 600, 0.1); },
    open: () => { tone(300, 0.2, 'sine', 0.12, 600); },
    break: () => { noise(0.3, 400, 0.2, 0, 'lowpass'); tone(150, 0.3, 'sawtooth', 0.15, 50); },
    reroute: () => { tone(500, 0.08, 'sine', 0.07, 800); tone(700, 0.08, 'sine', 0.06, 1000, A.ctx ? A.ctx.currentTime + 0.06 : 0); },
    leak: () => { tone(300, 0.3, 'sawtooth', 0.16, 100); noise(0.2, 300, 0.12, 0, 'lowpass'); },
    reveal: () => { tone(900, 0.1, 'sine', 0.08, 1400); },
    payload: () => { noise(0.25, 700, 0.16, 0, 'lowpass'); tone(250, 0.25, 'sawtooth', 0.12, 80); },
    trap: () => { tone(600, 0.15, 'sine', 0.1, 300); tone(450, 0.15, 'sine', 0.08, 250, A.ctx ? A.ctx.currentTime + 0.07 : 0); },
    failover: () => { tone(400, 0.15, 'sine', 0.1, 800); tone(600, 0.2, 'sine', 0.09, 1200, A.ctx ? A.ctx.currentTime + 0.1 : 0); },
    item: () => { tone(700, 0.1, 'triangle', 0.1, 1000); },
    wave: () => { tone(350, 0.2, 'sawtooth', 0.1, 500); tone(500, 0.2, 'sawtooth', 0.08, 700, A.ctx ? A.ctx.currentTime + 0.12 : 0); },
    warning: () => { tone(800, 0.12, 'square', 0.1); tone(800, 0.12, 'square', 0.1, null, A.ctx ? A.ctx.currentTime + 0.18 : 0); },
    bossRoar: () => { noise(0.6, 200, 0.25, 0, 'lowpass'); tone(80, 0.7, 'sawtooth', 0.2, 40); },
    bossDie: () => { noise(0.8, 300, 0.3, 0, 'lowpass'); tone(200, 0.8, 'sawtooth', 0.2, 30); },
    phase: () => { tone(150, 0.4, 'sawtooth', 0.16, 400); noise(0.3, 1000, 0.12); },
    blackhole: () => { tone(600, 0.4, 'sine', 0.14, 60); noise(0.3, 400, 0.1, 0, 'lowpass'); },
    lock: () => { tone(250, 0.3, 'square', 0.14, 100); noise(0.2, 500, 0.12); },
    storm: () => { noise(0.5, 1500, 0.15); tone(900, 0.5, 'sawtooth', 0.1, 200); },
    bossFlood: () => { noise(0.5, 300, 0.25, 0, 'lowpass'); tone(100, 0.5, 'sawtooth', 0.2, 50); },
    win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, null, A.ctx ? A.ctx.currentTime + i * 0.15 : 0)); },
    lose: () => { [400, 350, 300, 200].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, null, A.ctx ? A.ctx.currentTime + i * 0.18 : 0)); },
  };
  A.play = function (name) { if (!A.ctx || A.muted) return; const f = SFX[name]; if (f) { try { f(); } catch (e) { } } };

  // ---- 音乐 ----
  const SCALES = {
    corporate: { root: 220, scale: [0, 3, 5, 7, 10, 12, 15], tempo: 0.28, wave: 'triangle', bass: 55 },
    backbone: { root: 196, scale: [0, 2, 5, 7, 9, 12, 14], tempo: 0.24, wave: 'sine', bass: 49 },
    industrial: { root: 174, scale: [0, 3, 5, 6, 10, 12, 15], tempo: 0.3, wave: 'sawtooth', bass: 43 },
  };
  A.startMusic = function (theme) {
    A._theme = theme;
    if (!A.ctx) return;
    A.stopMusic();
    const cfg = SCALES[theme] || SCALES.corporate;
    A._nextNote = A.ctx.currentTime + 0.1; A._step = 0;
    A._musicTimer = setInterval(() => {
      if (!A.ctx || A.muted) return;
      while (A._nextNote < A.ctx.currentTime + 0.3) {
        const s = A._step;
        const t = A._nextNote;
        // 低音
        if (s % 8 === 0) musicTone(cfg.bass, cfg.tempo * 6, 'sine', 0.12, t);
        if (s % 8 === 4) musicTone(cfg.bass * 1.5, cfg.tempo * 4, 'sine', 0.08, t);
        // 琶音
        const deg = cfg.scale[(s * 3 + Math.floor(s / 16)) % cfg.scale.length];
        const freq = cfg.root * Math.pow(2, deg / 12);
        musicTone(freq, cfg.tempo * 1.8, cfg.wave, 0.05, t);
        if (s % 4 === 2) musicTone(freq * 2, cfg.tempo, 'sine', 0.03, t + cfg.tempo * 0.5);
        // 氛围垫
        if (s % 16 === 0) { musicTone(cfg.root * 2, cfg.tempo * 14, 'sine', 0.04, t); musicTone(cfg.root * 3, cfg.tempo * 14, 'sine', 0.03, t); }
        A._nextNote += cfg.tempo; A._step++;
      }
    }, 100);
  };
  A.stopMusic = function () { if (A._musicTimer) { clearInterval(A._musicTimer); A._musicTimer = null; } };
})(typeof window !== 'undefined' ? window : globalThis);