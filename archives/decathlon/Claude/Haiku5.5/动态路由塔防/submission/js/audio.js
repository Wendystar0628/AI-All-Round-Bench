// 声音：全部由 Web Audio 程序合成（无外部素材）。浏览器在首次点击或按键后才会出声。
(function () {
  let ctx = null;
  let master, musicBus, sfxBus;
  let vol = { master: 0.7, music: 0.55, sfx: 0.8 };
  let muted = false;
  let musicTimer = null;
  let musicTheme = null;
  let noiseBuf = null;
  const lastAt = {};
  const THROTTLE = { hit: 0.05, shot: 0.07, block: 0.16, heal: 0.12, towerHit: 0.18, clone: 0.2, aoe: 0.25, trap: 0.3, reveal: 0.2, kill: 0.05, item: 0.1 };

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus.connect(master);
    sfxBus.connect(master);
    master.connect(ctx.destination);
    applyVol();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function applyVol() {
    if (!ctx) return;
    master.gain.value = muted ? 0 : vol.master;
    musicBus.gain.value = vol.music * 1.6;
    sfxBus.gain.value = vol.sfx * 0.9;
  }

  // 基础发声
  function tone(f, dur, type, v, bus, slideTo, delay) {
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(bus || sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  function noise(dur, v, freq, q, bus, sweepTo, delay) {
    const t0 = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
    f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(bus || sfxBus);
    s.start(t0, Math.random() * 0.5, dur + 0.05);
  }

  const SFX = {
    shot: () => tone(1320, 0.09, 'triangle', 0.07, null, 2400),
    hit: () => noise(0.05, 0.06, 2600, 3),
    towerHit: () => noise(0.12, 0.16, 500, 1.2, null, 180),
    block: () => { tone(260, 0.1, 'square', 0.04); noise(0.06, 0.08, 1800, 2); },
    kill: () => tone(680, 0.12, 'sine', 0.1, null, 1200),
    bossKill: () => { [520, 660, 880, 1040].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, null, null, i * 0.09)); noise(0.8, 0.14, 800, 0.8, null, 120); },
    boom: () => { noise(0.6, 0.35, 900, 0.7, null, 60); tone(90, 0.5, 'sine', 0.3, null, 40); },
    leak: () => { tone(220, 0.35, 'sawtooth', 0.12, null, 110); tone(220, 0.35, 'sawtooth', 0.12, null, 110, 0.4); },
    wave: () => { noise(0.5, 0.12, 300, 0.6, null, 2400); tone(160, 0.5, 'sawtooth', 0.05, null, 320); },
    clear: () => { [660, 880, 990].forEach((f, i) => tone(f, 0.25, 'triangle', 0.1, null, null, i * 0.1)); },
    boss: () => { tone(70, 1.2, 'sawtooth', 0.12, null, 60); noise(1.0, 0.18, 400, 0.8, null, 1600); },
    reroute: () => { tone(540, 0.18, 'sine', 0.08, null, 1100); tone(1100, 0.18, 'sine', 0.05, null, 540, 0.14); },
    isolate: () => { noise(0.35, 0.22, 1400, 0.7, null, 220); tone(330, 0.3, 'square', 0.05, null, 110); },
    restore: () => { tone(420, 0.25, 'sine', 0.09, null, 840); tone(840, 0.2, 'sine', 0.05, null, 1260, 0.12); },
    build: () => { tone(440, 0.09, 'square', 0.05); tone(660, 0.12, 'square', 0.05, null, null, 0.08); },
    sell: () => tone(900, 0.2, 'triangle', 0.07, null, 400),
    upgrade: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, null, null, i * 0.07)); },
    skill: () => { noise(0.4, 0.14, 500, 1, null, 2600); tone(300, 0.35, 'sine', 0.08, null, 900); },
    reveal: () => { tone(980, 0.16, 'sine', 0.07, null, 1700); tone(1500, 0.14, 'sine', 0.04, null, 900, 0.09); },
    downgrade: () => { noise(0.7, 0.14, 1800, 0.6, null, 300); },
    heal: () => { tone(620, 0.25, 'sine', 0.07, null, 880); },
    item: () => { tone(740, 0.08, 'triangle', 0.09); tone(980, 0.12, 'triangle', 0.08, null, null, 0.06); },
    trap: () => noise(0.25, 0.14, 2200, 2, null, 700),
    clone: () => { tone(260, 0.2, 'sine', 0.07, null, 520); tone(520, 0.2, 'sine', 0.05, null, 260, 0.1); },
    aoe: () => { noise(0.4, 0.2, 1200, 0.9, null, 260); },
    warn: () => { tone(880, 0.12, 'square', 0.06); tone(880, 0.12, 'square', 0.06, null, null, 0.2); tone(880, 0.12, 'square', 0.06, null, null, 0.4); },
    lock: () => { tone(1400, 0.1, 'square', 0.05, null, 700); },
    cursor: () => tone(1800, 0.04, 'square', 0.03),
    click: () => tone(1100, 0.05, 'triangle', 0.05),
    deny: () => { tone(160, 0.14, 'square', 0.1); tone(120, 0.18, 'square', 0.1, null, null, 0.12); },
    win: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.4, 'triangle', 0.12, null, null, i * 0.12)); },
    lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, 'sawtooth', 0.09, null, null, i * 0.3)); },
  };

  // 环境音乐：各地图一组和弦与低音脉冲
  const THEMES = {
    intranet: { root: 110, chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [-2, 2, 5, 9], [-5, -1, 2, 7]], tempo: 92, drone: 55, color: 'triangle' },
    backbone: { root: 98, chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [-5, -1, 2, 6], [-7, -3, 0, 4]], tempo: 104, drone: 49, color: 'sawtooth' },
    airgap: { root: 87, chords: [[0, 3, 7, 8], [-4, 0, 3, 5], [-2, 1, 5, 8], [-7, -3, 0, 3]], tempo: 84, drone: 43.5, color: 'square' },
    title: { root: 110, chords: [[0, 4, 7, 9], [-3, 0, 4, 7], [-5, -1, 2, 5], [-7, -3, 0, 2]], tempo: 76, drone: 55, color: 'sine' },
  };
  function midi(f) { return 440 * Math.pow(2, f / 12); }
  function startMusic(theme) {
    const th = THEMES[theme] || THEMES.intranet;
    stopMusic();
    if (!ctx) return;
    musicTheme = theme;
    startAmbience(theme);
    let step = 0;
    const beat = 60 / th.tempo / 2;
    let nextT = ctx.currentTime + 0.1;
    // 持续低音
    const dr = ctx.createOscillator();
    dr.type = 'sine';
    dr.frequency.value = th.drone;
    const dg = ctx.createGain();
    dg.gain.value = 0.05;
    dr.connect(dg); dg.connect(musicBus); dr.start();
    const drones = [dr, dg];
    musicTimer = setInterval(() => {
      if (!ctx) return;
      while (nextT < ctx.currentTime + 0.25) {
        const bar = Math.floor(step / 8) % th.chords.length;
        const chord = th.chords[bar];
        const pos = step % 8;
        if (pos === 0) {
          chord.forEach((semi, i) => {
            const f = midi(th.root * Math.pow(2, semi / 12) * 0 + (Math.log2(th.root) * 0) + semi) ;
            void f;
            const freq = th.root * Math.pow(2, semi / 12) * 2;
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = th.color;
            o.frequency.value = freq;
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 900;
            g.gain.setValueAtTime(0.0001, nextT);
            g.gain.exponentialRampToValueAtTime(0.035, nextT + 0.6);
            g.gain.exponentialRampToValueAtTime(0.0001, nextT + beat * 7.5);
            o.connect(lp); lp.connect(g); g.connect(musicBus);
            o.start(nextT); o.stop(nextT + beat * 8);
          });
        }
        // 琶音
        const arp = chord[pos % chord.length];
        const f2 = th.root * Math.pow(2, (arp + 12) / 12) * 4;
        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o2.type = 'triangle';
        o2.frequency.value = f2;
        g2.gain.setValueAtTime(0.0001, nextT);
        g2.gain.exponentialRampToValueAtTime(0.028, nextT + 0.01);
        g2.gain.exponentialRampToValueAtTime(0.0001, nextT + beat * 0.9);
        o2.connect(g2); g2.connect(musicBus);
        o2.start(nextT); o2.stop(nextT + beat);
        // 脉冲底鼓（系统心跳）
        if (pos % 4 === 0) {
          const k = ctx.createOscillator();
          const kg = ctx.createGain();
          k.frequency.setValueAtTime(120, nextT); k.frequency.exponentialRampToValueAtTime(40, nextT + 0.12);
          kg.gain.setValueAtTime(0.12, nextT); kg.gain.exponentialRampToValueAtTime(0.0001, nextT + 0.16);
          k.connect(kg); kg.connect(musicBus); k.start(nextT); k.stop(nextT + 0.2);
        }
        nextT += beat;
        step++;
      }
    }, 120);
    musicState = { drones };
  }
  let musicState = null;
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (musicState) {
      try { musicState.drones.forEach((n) => n.disconnect && n.disconnect()); } catch (e) { /* ignore */ }
      musicState = null;
    }
  }

  // 环境声：每张地图一层滤波噪声（机房风扇 / 骨干风声 / 工控机械）
  let ambNode = null;
  function startAmbience(theme) {
    stopAmbience();
    if (!ctx) return;
    const cfg = { intranet: [1700, 0.6, 0.03], backbone: [520, 0.8, 0.045], airgap: [230, 1.2, 0.05], title: [900, 0.5, 0.03] }[theme] || [900, 0.5, 0.03];
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = cfg[0]; f.Q.value = cfg[1];
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = cfg[0] * 0.22;
    lfo.connect(lg); lg.connect(f.frequency);
    const g = ctx.createGain();
    g.gain.value = cfg[2];
    s.connect(f); f.connect(g); g.connect(musicBus);
    s.start(); lfo.start();
    ambNode = { s, lfo, g, lg };
  }
  function stopAmbience() {
    if (!ambNode) return;
    try { ambNode.s.stop(); ambNode.lfo.stop(); } catch (e) { /* already stopped */ }
    ambNode = null;
  }
  // 响度归一：各音效的增益系数，使峰值接近目标（高频事件较轻，关键事件较响），由离线测量得出
  const LOUD = {
    shot: 6.7, hit: 20, towerHit: 12.2, block: 12.2, kill: 6.4, bossKill: 4.3, boom: 1.6, leak: 5.4,
    wave: 10.3, clear: 6.4, boss: 4.9, reroute: 8, isolate: 5.2, restore: 7.1, build: 8.8, sell: 9.4,
    upgrade: 6.0, skill: 6.8, reveal: 6.3, downgrade: 6.5, heal: 6.3, item: 5.0, trap: 7.9, clone: 6.5,
    aoe: 5.1, warn: 11, lock: 13.3, cursor: 14.7, click: 9.6, deny: 7.1, win: 5.1, lose: 7.3,
  };
  // 播放一个音效：增益节点仅在该音效期间挂在总线上，结束后断开，避免节点堆积
  function playSfx(name) {
    const f = SFX[name];
    if (!f) return;
    const m = LOUD[name] || 1;
    const prev = sfxBus;
    const g = ctx.createGain();
    g.gain.value = m;
    g.connect(prev);
    sfxBus = g;
    try { f(); } finally { sfxBus = prev; }
    setTimeout(() => { try { g.disconnect(); } catch (e) { /* 已断开 */ } }, 2500);
  }
  // 离线渲染测量：逐个音效渲染到缓冲区，报告峰值、响度与时长（用于检查削波与静音）
  function measureSfx(name, gains) {
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC || !SFX[name]) return null;
    const off = new AC(1, 44100 * 4, 44100);
    const saved = { ctx, master, musicBus, sfxBus, noiseBuf };
    ctx = off;
    master = off.createGain(); musicBus = off.createGain(); sfxBus = off.createGain();
    master.gain.value = gains.master; sfxBus.gain.value = gains.sfx;
    musicBus.connect(master); sfxBus.connect(master); master.connect(off.destination);
    noiseBuf = off.createBuffer(1, off.sampleRate * 1.5, off.sampleRate);
    const d0 = noiseBuf.getChannelData(0);
    for (let i = 0; i < d0.length; i++) d0[i] = Math.random() * 2 - 1;
    playSfx(name);
    ({ ctx, master, musicBus, sfxBus, noiseBuf } = saved);
    return off.startRendering().then((buf) => {
      const d = buf.getChannelData(0);
      let peak = 0, sq = 0, last = 0;
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
        sq += d[i] * d[i];
        if (a > 0.002) last = i;
      }
      const rms = Math.sqrt(sq / d.length);
      return { name, peak: +peak.toFixed(3), rmsDb: +(20 * Math.log10(rms + 1e-9)).toFixed(1), tailSec: +(last / 44100).toFixed(2) };
    });
  }
  const Snd = {
    init() { ensure(); },
    __names: () => Object.keys(SFX),
    __tap: (bus) => { if (!ensure()) return null; const an = ctx.createAnalyser(); an.fftSize = 4096; (bus === 'music' ? musicBus : sfxBus).connect(an); return an; },
    __measure: (name, gains) => measureSfx(name, gains || { master: 0.7, sfx: 0.72 }),
    resumeCtx() { ensure(); },
    play(name) {
      if (!ensure() || muted) return;
      const th = THROTTLE[name];
      const now = performance.now() / 1000;
      if (th) { if (lastAt[name] && now - lastAt[name] < th) return; lastAt[name] = now; }
      playSfx(name);
    },
    music(theme) {
      if (!ensure()) return;
      if (musicTheme === theme && musicTimer) return;
      startMusic(theme);
    },
    stopMusic,
    setVolume(key, v) { vol[key] = v; applyVol(); },
    toggleMute() { muted = !muted; applyVol(); return muted; },
    isMuted() { return muted; },
  };
  window.Snd = Snd;
  const unlock = () => { ensure(); if (musicTheme == null && ctx) startMusic('title'); };
  window.addEventListener('pointerdown', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });
})();
