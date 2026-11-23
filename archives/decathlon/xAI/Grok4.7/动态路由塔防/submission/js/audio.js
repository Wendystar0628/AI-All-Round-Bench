/* 自制 WebAudio。第一次指针或按键之前保持静音。 */
(function (root) {
  'use strict';
  var TD = root.TD = root.TD || {};
  var ctx = null, master = null, music = null, sfx = null;
  var started = false, muted = false, volume = 0.8, suppress = false;
  var mapId = 'intranet';
  var drones = [];

  function ensure() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    music = ctx.createGain();
    music.gain.value = 0.16;
    music.connect(master);
    sfx = ctx.createGain();
    sfx.gain.value = 0.55;
    sfx.connect(master);
    return ctx;
  }

  function envGain(t, dur, peak) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  function tone(freq, dur, type, peak, slide) {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator();
    var g = envGain(t, dur, peak);
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
    o.connect(g); g.connect(sfx);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, peak, hp) {
    if (!canPlay()) return;
    var n = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = hp || 400;
    var g = envGain(ctx.currentTime, dur, peak);
    src.connect(filter); filter.connect(g); g.connect(sfx);
    src.start();
  }

  function canPlay() {
    return ctx && started && !muted && !suppress && ctx.state === 'running';
  }

  var SFX = {
    place: function () { tone(520, 0.12, 'triangle', 0.2); tone(780, 0.16, 'sine', 0.12); },
    deny: function () { tone(180, 0.18, 'square', 0.12, 90); },
    upgrade: function () { tone(660, 0.1, 'square', 0.1); tone(990, 0.18, 'triangle', 0.12); },
    sell: function () { tone(420, 0.12, 'sine', 0.1, 220); },
    skill: function () { tone(880, 0.2, 'sawtooth', 0.08, 440); },
    iso: function () { tone(240, 0.22, 'square', 0.1); noise(0.12, 0.08, 800); },
    open: function () { tone(300, 0.2, 'triangle', 0.12, 140); },
    crush: function () { noise(0.25, 0.2, 200); tone(90, 0.3, 'sine', 0.16); },
    die: function () { tone(640, 0.08, 'square', 0.06, 200); },
    bossdie: function () { noise(0.4, 0.22, 150); tone(80, 0.5, 'sawtooth', 0.12, 40); },
    leak: function () { tone(140, 0.28, 'sawtooth', 0.1, 70); },
    win: function () { tone(523, 0.16, 'triangle', 0.12); tone(659, 0.2, 'triangle', 0.1); tone(784, 0.28, 'sine', 0.1); },
    lose: function () { tone(196, 0.4, 'sawtooth', 0.1, 80); },
    wave: function () { tone(440, 0.1, 'square', 0.08); tone(554, 0.16, 'square', 0.06); },
    spawn: function () { tone(360, 0.06, 'triangle', 0.05); },
    boss: function () { tone(55, 0.6, 'sawtooth', 0.14); noise(0.3, 0.1, 100); },
    reveal: function () { tone(1200, 0.1, 'sine', 0.08, 1800); },
    payload: function () { noise(0.2, 0.16, 300); tone(200, 0.2, 'square', 0.08); },
    split: function () { tone(700, 0.08, 'square', 0.06); tone(500, 0.1, 'square', 0.05); },
    bite: function () { noise(0.05, 0.08, 900); },
    slam: function () { noise(0.12, 0.16, 120); tone(70, 0.16, 'sine', 0.12); },
    shot: function () { tone(980, 0.05, 'square', 0.05, 400); },
    pierce: function () { tone(1400, 0.08, 'sawtooth', 0.05, 600); },
    suppress: function () { tone(760, 0.04, 'triangle', 0.04); },
    scan: function () { tone(540, 0.16, 'sine', 0.06, 860); },
    ransom: function () { tone(220, 0.1, 'square', 0.07, 160); },
    encrypt: function () { tone(330, 0.2, 'sawtooth', 0.05); },
    heal: function () { tone(880, 0.12, 'sine', 0.06); },
    down: function () { tone(200, 0.2, 'triangle', 0.08, 120); },
    terra: function () { noise(0.25, 0.12, 180); tone(90, 0.3, 'sine', 0.1); },
    fw: function () { noise(0.04, 0.05, 1200); },
    ui: function () { tone(700, 0.04, 'sine', 0.04); }
  };

  function stopDrone() {
    drones.forEach(function (o) { try { o.stop(); } catch (e) {} });
    drones = [];
  }

  function startDrone() {
    if (!canPlay()) return;
    stopDrone();
    var sets = {
      intranet: { type: 'sine', freqs: [220, 261.6, 329.6, 392], step: 1.4, gain: 0.05 },
      backbone: { type: 'triangle', freqs: [146.8, 174.6, 220, 293.7], step: 0.7, gain: 0.045 },
      ics: { type: 'square', freqs: [82.4, 87.3, 98, 110], step: 1.1, gain: 0.03 }
    };
    var set = sets[mapId] || sets.intranet;
    set.freqs.forEach(function (f, i) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = set.type;
      o.frequency.value = f;
      g.gain.value = set.gain * (i === 0 ? 1 : 0.45);
      var lfo = ctx.createOscillator();
      var lg = ctx.createGain();
      lfo.frequency.value = 0.05 + i * 0.03;
      lg.gain.value = set.gain * 0.6;
      lfo.connect(lg); lg.connect(g.gain);
      o.connect(g); g.connect(music);
      o.start(); lfo.start();
      drones.push(o, lfo);
    });
  }

  var audio = {
    resume: function () {
      var c = ensure();
      if (!c) return;
      started = true;
      if (c.state === 'suspended') c.resume().then(startDrone);
      else startDrone();
    },
    play: function (name) {
      if (!canPlay()) return;
      var fn = SFX[name] || SFX.ui;
      fn();
    },
    consume: function (battle) {
      if (!battle) return;
      if (!canPlay()) { battle.sfxQ.length = 0; return; }
      while (battle.sfxQ.length) audio.play(battle.sfxQ.shift());
    },
    setMap: function (id) {
      mapId = id || 'intranet';
      if (started) startDrone();
    },
    setMuted: function (v) {
      muted = !!v;
      if (master) master.gain.value = muted ? 0 : volume;
      if (!muted && started) startDrone();
      if (muted) stopDrone();
    },
    toggleMute: function () { audio.setMuted(!muted); return muted; },
    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, v));
      if (master && !muted) master.gain.value = volume;
    },
    setSuppress: function (v) { suppress = !!v; if (suppress) stopDrone(); else if (started) startDrone(); },
    muted: function () { return muted; },
    volume: function () { return volume; }
  };
  TD.audio = audio;
})(typeof window !== 'undefined' ? window : globalThis);
