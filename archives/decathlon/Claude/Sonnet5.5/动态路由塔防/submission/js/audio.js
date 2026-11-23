/* 声音：全部由 WebAudio 合成。首次点击/按键后才创建并启动。 */
(function (G) {
'use strict';
var A = G.audio = { ctx: null, ready: false, theme: 'enterprise', menu: true, intensity: 0, cx: 8, last: {} };
var outG, ctx, master, musicBus, sfxBus, comp, verb, verbGain, ambBus, noiseBuf, seqTimer = null, nextT = 0, step = 0, ambNodes = null, curTheme = null;
function S() { return G.settings || { master: 0.8, music: 0.6, sfx: 0.9, mute: false }; }

A.unlock = function () {
  if (A.ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = A.ctx = new AC();
  comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 10; comp.attack.value = 0.004; comp.release.value = 0.2;
  A.tap = null; master = ctx.createGain(); musicBus = ctx.createGain(); sfxBus = ctx.createGain(); ambBus = ctx.createGain();
  musicBus.connect(master); sfxBus.connect(master); ambBus.connect(master); master.connect(comp); outG = ctx.createGain(); outG.gain.value = 0.8; comp.connect(outG); outG.connect(ctx.destination);
  // 简易混响
  verb = ctx.createConvolver(); var len = ctx.sampleRate * 1.8, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (var c = 0; c < 2; c++) { var d = buf.getChannelData(c); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  verb.buffer = buf; verbGain = ctx.createGain(); verbGain.gain.value = 0.28; verb.connect(verbGain); verbGain.connect(master);
  sfxBus.connect(verb); musicBus.connect(verb);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); var nd = noiseBuf.getChannelData(0); for (var j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;
  A.tap = outG; A.ready = true; A.applyVolumes(); ctx.resume();
  A.setTheme(A.theme, A.menu, true);
  A.play('ui');
};
A.applyVolumes = function () {
  if (!A.ready) return; var s = S(), t = ctx.currentTime;
  master.gain.setTargetAtTime(s.mute ? 0 : s.master * 0.5, t, 0.03); musicBus.gain.setTargetAtTime(s.music * 0.8, t, 0.05); sfxBus.gain.setTargetAtTime(s.sfx * 0.9, t, 0.03); ambBus.gain.setTargetAtTime(s.music * 0.5, t, 0.05);
};
['pointerdown', 'keydown', 'mousedown'].forEach(function (ev) { window.addEventListener(ev, function () { A.unlock(); }, { passive: true }); });

// ---------- 基础发声 ----------
function env(g, t0, a, d, vol, rel) { g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.0001 + 0.0002), t0 + a + d + (rel || 0)); }
function panner(x) { var p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (p) p.pan.value = Math.max(-0.8, Math.min(0.8, x)); return p; }
function out(node, pan, bus) { var b = bus || sfxBus; if (pan != null && ctx.createStereoPanner) { var p = panner(pan); node.connect(p); p.connect(b); } else node.connect(b); }
function tone(f, dur, type, vol, o) {
  o = o || {}; var t0 = ctx.currentTime + (o.when || 0), os = ctx.createOscillator(), g = ctx.createGain(); os.type = type || 'sine';
  os.frequency.setValueAtTime(f, t0); if (o.to) os.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
  if (o.vib) { var lf = ctx.createOscillator(), lg = ctx.createGain(); lf.frequency.value = o.vib; lg.gain.value = f * 0.03; lf.connect(lg); lg.connect(os.frequency); lf.start(t0); lf.stop(t0 + dur + 0.1); }
  env(g, t0, o.a || 0.004, dur, vol, 0.02); var node = g;
  if (o.lp) { var fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; os.connect(fl); fl.connect(g); } else os.connect(g);
  out(g, o.pan, o.bus); os.start(t0); os.stop(t0 + dur + 0.08); return g;
}
function noise(dur, vol, o) {
  o = o || {}; var t0 = ctx.currentTime + (o.when || 0), src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  src.buffer = noiseBuf; src.loop = true; f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1500, t0); if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + dur); f.Q.value = o.q || 1;
  env(g, t0, o.a || 0.003, dur, vol, 0.02); src.connect(f); f.connect(g); out(g, o.pan, o.bus); src.start(t0, Math.random()); src.stop(t0 + dur + 0.1);
}
function thr(name, ms) { var t = performance.now(); if (A.last[name] && t - A.last[name] < ms) return false; A.last[name] = t; return true; }

var SFX = {
  ui: function (p) { tone(880, 0.07, 'square', 0.08, { to: 1320, lp: 4000 }); tone(1320, 0.06, 'sine', 0.06, { when: 0.04 }); },
  hover: function () { tone(1200, 0.04, 'sine', 0.035); },
  page: function () { noise(0.25, 0.07, { f: 800, to: 4000, q: 2 }); tone(440, 0.18, 'triangle', 0.06, { to: 660 }); },
  deny: function () { tone(180, 0.16, 'sawtooth', 0.14, { to: 110, lp: 900 }); tone(150, 0.16, 'square', 0.08, { when: 0.1, to: 90, lp: 700 }); },
  build: function (p) { tone(330, 0.2, 'triangle', 0.14, { to: 660, pan: p }); noise(0.18, 0.12, { f: 300, to: 2500, q: 0.8, pan: p }); tone(990, 0.1, 'sine', 0.08, { when: 0.12, pan: p }); },
  upgrade: function (p) { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.1, { when: i * 0.07, pan: p }); }); noise(0.3, 0.06, { f: 3000, type: 'highpass', pan: p }); },
  sell: function (p) { tone(784, 0.12, 'triangle', 0.1, { to: 392, pan: p }); tone(392, 0.2, 'sine', 0.08, { when: 0.08, pan: p }); },
  bolt: function (p) { tone(1500, 0.09, 'square', 0.06, { to: 380, lp: 5000, pan: p }); noise(0.05, 0.05, { f: 4000, type: 'highpass', pan: p }); },
  pulse: function (p) { tone(620, 0.16, 'sine', 0.1, { to: 260, pan: p }); tone(940, 0.1, 'triangle', 0.05, { to: 400, pan: p }); },
  beam: function (p) { tone(260, 0.3, 'sawtooth', 0.09, { to: 1800, lp: 3000, pan: p }); noise(0.25, 0.06, { f: 2000, to: 6000, q: 1.5, pan: p }); },
  shell: function (p) { tone(150, 0.2, 'sine', 0.2, { to: 60, pan: p }); noise(0.1, 0.1, { f: 600, q: 0.7, pan: p }); tone(700, 0.35, 'sine', 0.04, { to: 300, pan: p }); },
  boom: function (p, v) { noise(0.5, 0.2 * (v || 1), { f: 1200, to: 80, type: 'lowpass', q: 0.5, pan: p }); tone(90, 0.4, 'sine', 0.26 * (v || 1), { to: 38, pan: p }); },
  hit: function (p) { noise(0.05, 0.06, { f: 3000, q: 3, pan: p }); tone(400, 0.04, 'square', 0.03, { pan: p }); },
  hitSlow: function (p) { tone(800, 0.1, 'sine', 0.06, { to: 300, pan: p }); noise(0.08, 0.04, { f: 5000, type: 'highpass', pan: p }); },
  encHit: function (p) { tone(300, 0.15, 'sawtooth', 0.08, { to: 700, lp: 1500, pan: p }); tone(1200, 0.1, 'square', 0.04, { when: 0.05, pan: p }); },
  melee: function (p) { noise(0.07, 0.1, { f: 900, to: 300, q: 1.5, pan: p }); tone(120, 0.08, 'square', 0.07, { to: 70, pan: p }); },
  counter: function (p) { noise(0.08, 0.1, { f: 2500, q: 2, pan: p }); tone(220, 0.1, 'sawtooth', 0.07, { to: 120, lp: 1200, pan: p }); },
  die: function (p) { noise(0.18, 0.1, { f: 2000, to: 300, q: 1, pan: p }); tone(300, 0.15, 'square', 0.05, { to: 80, lp: 1500, pan: p }); },
  airDie: function (p) { tone(900, 0.4, 'sawtooth', 0.08, { to: 80, lp: 2500, pan: p }); noise(0.35, 0.1, { f: 3000, to: 200, pan: p }); },
  bossDie: function (p) { noise(1.4, 0.3, { f: 2000, to: 40, type: 'lowpass', q: 0.4 }); tone(70, 1.2, 'sawtooth', 0.3, { to: 25, lp: 400 }); [1, 2, 3, 4].forEach(function (i) { noise(0.4, 0.15, { when: i * 0.22, f: 1500, to: 100, type: 'lowpass' }); }); },
  leak: function () { tone(110, 0.5, 'sawtooth', 0.22, { to: 55, lp: 600 }); tone(165, 0.5, 'square', 0.12, { to: 80, lp: 700 }); noise(0.4, 0.14, { f: 400, to: 100, type: 'lowpass' }); },
  towerBreak: function (p) { noise(0.5, 0.2, { f: 1800, to: 100, type: 'lowpass', pan: p }); tone(200, 0.35, 'sawtooth', 0.12, { to: 40, lp: 800, pan: p }); },
  isolate: function (p) { tone(440, 0.3, 'sawtooth', 0.12, { to: 110, lp: 1400, pan: p }); noise(0.3, 0.12, { f: 3000, to: 300, q: 2, pan: p }); tone(80, 0.5, 'sine', 0.22, { pan: p }); tone(1760, 0.08, 'square', 0.04, { when: 0.02, pan: p }); },
  bypass: function (p) { [392, 523, 659, 784].forEach(function (f, i) { tone(f, 0.25, 'sine', 0.09, { when: i * 0.06, pan: p }); }); noise(0.3, 0.05, { f: 5000, type: 'highpass', pan: p }); },
  reveal: function (p) { tone(1400, 0.14, 'sine', 0.08, { to: 2200, pan: p }); tone(1850, 0.14, 'sine', 0.06, { when: 0.07, pan: p }); },
  payload: function (p) { noise(0.5, 0.2, { f: 1500, to: 120, type: 'lowpass', pan: p }); tone(180, 0.4, 'sawtooth', 0.15, { to: 50, lp: 700, pan: p }); tone(1200, 0.15, 'square', 0.05, { to: 300, pan: p }); },
  clone: function (p) { tone(500, 0.2, 'sawtooth', 0.07, { to: 1000, lp: 2500, pan: p }); tone(750, 0.2, 'sine', 0.06, { when: 0.08, pan: p }); },
  shieldUp: function (p) { tone(600, 0.25, 'sine', 0.06, { to: 1200, pan: p }); },
  shieldBreak: function (p) { noise(0.25, 0.14, { f: 4000, to: 800, q: 2, pan: p }); tone(900, 0.2, 'triangle', 0.08, { to: 200, pan: p }); },
  encrypt: function (p) { [880, 740, 622, 523].forEach(function (f, i) { tone(f, 0.08, 'square', 0.05, { when: i * 0.05, lp: 2500, pan: p }); }); noise(0.2, 0.06, { f: 2000, q: 3, pan: p }); },
  decrypt: function (p) { [523, 622, 740, 880, 1047].forEach(function (f, i) { tone(f, 0.1, 'triangle', 0.07, { when: i * 0.04, pan: p }); }); },
  heal: function (p, v) { tone(880, 0.25, 'sine', 0.04 * (v || 1), { vib: 7, pan: p }); tone(1320, 0.25, 'sine', 0.025 * (v || 1), { when: 0.05, pan: p }); },
  harden: function (p) { tone(150, 0.4, 'sawtooth', 0.12, { to: 300, lp: 900, pan: p }); noise(0.3, 0.1, { f: 800, q: 2, pan: p }); },
  trap: function (p) { tone(300, 0.5, 'sine', 0.12, { to: 80, vib: 18, pan: p }); noise(0.4, 0.08, { f: 600, to: 3000, q: 4, pan: p }); },
  'switch': function (p) { [262, 330, 392, 523].forEach(function (f, i) { tone(f, 0.5, 'triangle', 0.08, { when: i * 0.05, pan: p }); }); noise(0.4, 0.06, { f: 3500, type: 'highpass', pan: p }); },
  strike: function (p) { noise(0.35, 0.25, { f: 700, to: 80, type: 'lowpass', pan: p }); tone(70, 0.4, 'sine', 0.3, { to: 35, pan: p }); },
  surge: function (p) { noise(0.9, 0.3, { f: 300, to: 3000, q: 0.8, pan: p }); tone(60, 0.8, 'sawtooth', 0.22, { to: 200, lp: 600, pan: p }); noise(0.5, 0.25, { when: 0.5, f: 1500, to: 60, type: 'lowpass' }); },
  storm: function () { noise(1.0, 0.18, { f: 400, to: 5000, q: 1 }); tone(300, 1.0, 'sawtooth', 0.1, { to: 900, vib: 14, lp: 1800 }); },
  swarm: function (p) { for (var i = 0; i < 6; i++) tone(300 + Math.random() * 500, 0.12, 'square', 0.04, { when: i * 0.05, to: 120, lp: 1800, pan: p }); },
  bossIntro: function () { tone(55, 1.8, 'sawtooth', 0.28, { to: 41, lp: 500 }); tone(82, 1.8, 'square', 0.12, { lp: 400 }); noise(1.5, 0.12, { f: 200, to: 1200, type: 'lowpass' }); [0, 0.6].forEach(function (w) { tone(220, 0.5, 'sawtooth', 0.1, { when: w, to: 110, lp: 900 }); }); },
  bossPhase: function () { tone(110, 1.0, 'sawtooth', 0.22, { to: 440, lp: 1500 }); noise(0.9, 0.18, { f: 300, to: 4000, q: 1 }); tone(880, 0.4, 'square', 0.06, { when: 0.5, to: 220 }); },
  wave: function () { tone(330, 0.18, 'triangle', 0.12); tone(440, 0.18, 'triangle', 0.12, { when: 0.16 }); tone(554, 0.3, 'triangle', 0.12, { when: 0.32 }); },
  waveHeavy: function () { tone(220, 0.25, 'sawtooth', 0.14, { lp: 1200 }); tone(220, 0.25, 'sawtooth', 0.14, { when: 0.28, lp: 1200 }); tone(165, 0.6, 'sawtooth', 0.16, { when: 0.56, lp: 1000 }); noise(0.8, 0.1, { f: 400, to: 2000, q: 1 }); },
  waveClear: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.3, 'triangle', 0.1, { when: i * 0.08 }); }); },
  win: function () { [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { tone(f, 0.6, 'triangle', 0.12, { when: i * 0.12 }); tone(f / 2, 0.6, 'sine', 0.08, { when: i * 0.12 }); }); },
  lose: function () { [392, 349, 311, 262, 196].forEach(function (f, i) { tone(f, 0.7, 'sawtooth', 0.12, { when: i * 0.2, lp: 900 }); }); noise(1.2, 0.15, { f: 600, to: 60, type: 'lowpass' }); },
  downgrade: function (p) { tone(800, 0.5, 'sawtooth', 0.1, { to: 150, lp: 2000, pan: p }); noise(0.5, 0.1, { f: 3000, to: 200, q: 2, pan: p }); },
  restore: function (p) { tone(392, 0.3, 'sine', 0.1, { to: 784, pan: p }); tone(587, 0.4, 'triangle', 0.08, { when: 0.1, pan: p }); noise(0.3, 0.05, { f: 6000, type: 'highpass', pan: p }); },
  warn: function () { tone(740, 0.14, 'square', 0.08, { lp: 2500 }); tone(740, 0.14, 'square', 0.08, { when: 0.22, lp: 2500 }); },
  blackhole: function () { tone(180, 1.0, 'sine', 0.2, { to: 40, vib: 9 }); noise(0.9, 0.12, { f: 2500, to: 100, q: 3 }); },
  lock: function () { tone(110, 0.15, 'square', 0.18, { lp: 800 }); tone(110, 0.15, 'square', 0.18, { when: 0.12, lp: 800 }); noise(0.2, 0.12, { f: 1500, q: 3 }); },
  sp_worm: function (p) { tone(260, 0.12, 'sawtooth', 0.05, { to: 180, lp: 1200, pan: p }); noise(0.1, 0.04, { f: 1200, q: 2, pan: p }); },
  sp_flooder: function (p) { tone(70, 0.5, 'sawtooth', 0.12, { to: 45, lp: 400, vib: 11, pan: p }); noise(0.4, 0.07, { f: 300, to: 900, type: 'lowpass', pan: p }); },
  sp_trojan: function (p) { tone(880, 0.07, 'square', 0.04, { pan: p }); tone(1100, 0.07, 'square', 0.035, { when: 0.08, pan: p }); },
  sp_ransom: function (p) { tone(196, 0.35, 'triangle', 0.09, { to: 147, vib: 6, pan: p }); tone(98, 0.4, 'sawtooth', 0.06, { lp: 500, pan: p }); },
  sp_hotspot: function (p) { tone(1200, 0.4, 'sine', 0.05, { to: 600, vib: 22, pan: p }); noise(0.3, 0.04, { f: 4000, to: 1500, q: 3, pan: p }); },
  sp_packer: function (p) { tone(330, 0.2, 'square', 0.05, { to: 440, lp: 1500, pan: p }); tone(220, 0.25, 'triangle', 0.06, { when: 0.1, pan: p }); },
  ransomFire: function (p) { tone(520, 0.18, 'sawtooth', 0.06, { to: 200, lp: 1800, pan: p }); tone(1040, 0.08, 'square', 0.03, { when: 0.02, pan: p }); },
  turn: function (p) { tone(700, 0.08, 'triangle', 0.04, { to: 350, pan: p }); },
  airwave: function () { }
};
var MENU_OK = { ui: 1, page: 1, hover: 1, deny: 1, win: 1, lose: 1 };
var THR = { sp_worm: 120, sp_flooder: 400, sp_trojan: 200, sp_ransom: 300, sp_hotspot: 300, sp_packer: 300, ransomFire: 90, turn: 250, hit: 45, melee: 70, counter: 80, die: 50, heal: 260, bolt: 40, pulse: 50, encHit: 80, shieldUp: 200, hitSlow: 60, clone: 60, shell: 80, boom: 90, reveal: 150, airDie: 100, swarm: 300 };
A.play = function (name, x, y, v) {
  if (!A.ready || !SFX[name] || S().mute) return;
  if (G.match && G.match.inMenu && !MENU_OK[name]) return;
  if (ctx.state === 'suspended') return;
  if (THR[name] && !thr(name, THR[name])) return;
  var pan = null; if (x != null && G.match) { pan = (x - A.cx) / (G.match.game.W / 2) * 0.7; }
  try { SFX[name](pan, v); } catch (e) {}
};

// ---------- 音乐与环境声 ----------
var THEMES = {
  enterprise: { bpm: 108, root: 55, scale: [0, 3, 5, 7, 10], bass: [0, 0, 7, 0, 3, 0, 5, 0], prog: [0, 3, 5, 7], arp: [0, 2, 4, 2, 5, 4, 2, 1], wave: 'triangle', arpWave: 'square', lp: 2400, drum: 'tight' },
  backbone: { bpm: 94, root: 49, scale: [0, 2, 3, 7, 9], bass: [0, 0, 5, 0, 3, 0, 7, 3], prog: [0, 5, 3, 7], arp: [0, 3, 4, 3, 2, 4, 1, 3], wave: 'sine', arpWave: 'triangle', lp: 3200, drum: 'soft' },
  airgap: { bpm: 82, root: 41, scale: [0, 1, 5, 7, 8], bass: [0, 0, 0, 1, 0, 0, 3, 1], prog: [0, 1, 3, 2], arp: [0, 4, 2, 4, 1, 4, 3, 2], wave: 'sawtooth', arpWave: 'square', lp: 1500, drum: 'heavy' }
};
function nf(th, deg, oct) { var sc = th.scale, i = ((deg % sc.length) + sc.length) % sc.length, o = Math.floor(deg / sc.length); return th.root * Math.pow(2, (sc[i] + 12 * (o + (oct || 0))) / 12); }
function stopAmbient() {
  if (!ambNodes) return; var t = ctx.currentTime; ambNodes.g.gain.setTargetAtTime(0, t, 0.4); var n = ambNodes; setTimeout(function () { n.stop.forEach(function (o) { try { o.stop(); } catch (e) {} }); clearInterval(n.timer); }, 1800); ambNodes = null;
}
function startAmbient(theme) {
  var g = ctx.createGain(); g.gain.value = 0.0001; g.connect(ambBus); g.gain.setTargetAtTime(1, ctx.currentTime, 1.5); var stop = [], th = THEMES[theme];
  var base = th.root * 2;
  var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), lf = ctx.createOscillator(), lg = ctx.createGain(), og = ctx.createGain();
  o1.type = theme === 'airgap' ? 'sawtooth' : 'triangle'; o2.type = 'sine'; o1.frequency.value = base; o2.frequency.value = base * 1.5 * 1.004; f.type = 'lowpass'; f.frequency.value = theme === 'backbone' ? 700 : 420; f.Q.value = 3;
  lf.frequency.value = theme === 'airgap' ? 0.25 : 0.12; lg.gain.value = 240; lf.connect(lg); lg.connect(f.frequency); og.gain.value = 0.16;
  o1.connect(f); o2.connect(f); f.connect(og); og.connect(g); [o1, o2, lf].forEach(function (o) { o.start(); stop.push(o); });
  // 空气底噪
  var ns = ctx.createBufferSource(), nfl = ctx.createBiquadFilter(), ng = ctx.createGain(); ns.buffer = noiseBuf; ns.loop = true; nfl.type = 'bandpass'; nfl.frequency.value = theme === 'backbone' ? 900 : 2500; nfl.Q.value = 0.6; ng.gain.value = theme === 'backbone' ? 0.045 : 0.025;
  var l2 = ctx.createOscillator(), lg2 = ctx.createGain(); l2.frequency.value = 0.07; lg2.gain.value = ng.gain.value * 0.7; l2.connect(lg2); lg2.connect(ng.gain); l2.start(); stop.push(l2);
  ns.connect(nfl); nfl.connect(ng); ng.connect(g); ns.start(); stop.push(ns);
  // 零星环境事件
  var timer = setInterval(function () {
    if (!A.ready || ctx.state !== 'running') return; var r = Math.random();
    if (theme === 'enterprise' && r < 0.5) { tone(2000 + Math.random() * 2000, 0.05, 'square', 0.012, { bus: ambBus }); tone(1500 + Math.random() * 900, 0.04, 'sine', 0.015, { when: 0.06, bus: ambBus }); }
    else if (theme === 'backbone' && r < 0.4) { noise(1.6, 0.05, { f: 300, to: 1800, q: 2, a: 0.6, bus: ambBus }); }
    else if (theme === 'airgap' && r < 0.6) { noise(0.12, 0.05, { f: 5000, q: 6, type: 'bandpass', bus: ambBus }); if (r < 0.2) tone(60, 0.5, 'square', 0.03, { lp: 200, bus: ambBus }); }
  }, 1100);
  ambNodes = { g: g, stop: stop, timer: timer };
}
function scheduler() {
  if (!A.ready || ctx.state !== 'running') return;
  var th = THEMES[curTheme]; if (!th) return;
  var spb = 60 / th.bpm / 4;
  while (nextT < ctx.currentTime + 0.18) {
    var s = step % 16, bar = Math.floor(step / 16), ch = th.prog[bar % 4], when = Math.max(0, nextT - ctx.currentTime), I = A.intensity, menu = A.menu;
    var swing = th.drum === 'soft' && s % 2 ? spb * 0.12 : 0; when += swing;
    // 铺底和弦
    if (s === 0) { [0, 2, 4].forEach(function (k, i) { tone(nf(th, ch + k, 1), spb * 15, th.wave === 'sawtooth' ? 'triangle' : 'sine', 0.05, { when: when, a: 0.5, bus: musicBus, lp: 1200 }); }); }
    // 低音
    if (s % 2 === 0 && !menu || (menu && s % 4 === 0)) { var bd = th.bass[(s / 2) % 8 | 0]; tone(nf(th, ch + bd, 0), spb * 1.8, th.wave, 0.09 + I * 0.04, { when: when, lp: 500 + I * 500, bus: musicBus }); }
    // 琶音
    if (s % 2 === (th.drum === 'heavy' ? 1 : 0) || I > 0.5) { var d = th.arp[s % 8]; if (menu || I > 0.15 || s % 4 === 0) tone(nf(th, ch + d, 2), spb * 1.2, th.arpWave, 0.028 + I * 0.02, { when: when, lp: th.lp, bus: musicBus }); }
    // 鼓
    if (!menu && I > 0.1) {
      if (s % 4 === 0) { tone(120, 0.18, 'sine', 0.2 + I * 0.1, { when: when, to: 40, bus: musicBus }); }
      if (th.drum !== 'heavy' ? (s % 4 === 2 && I > 0.3) : (s === 4 || s === 12)) noise(0.12, 0.09 + I * 0.04, { when: when, f: th.drum === 'heavy' ? 900 : 2000, q: 1.2, bus: musicBus });
      if (I > 0.35 && s % 2 === 1) noise(0.04, 0.035, { when: when, f: 7000, type: 'highpass', bus: musicBus });
      if (I > 0.7 && s % 8 === 6) tone(nf(th, ch + 4, 2), 0.2, 'square', 0.04, { when: when, lp: 3000, bus: musicBus });
    }
    nextT += spb; step++;
  }
}
A.setTheme = function (theme, menu, force) {
  A.theme = theme; A.menu = !!menu;
  if (!A.ready) return;
  if (curTheme !== theme || force) { curTheme = theme; stopAmbient(); startAmbient(theme); step = 0; nextT = ctx.currentTime + 0.1; if (!seqTimer) seqTimer = setInterval(scheduler, 40); }
};
A.update = function (dt, m) {
  if (m) { A.cx = (m.game.W - 1) / 2; }
  var tgt = 0;
  if (m && !m.inMenu) { var g = m.game; tgt = Math.min(1, g.enemies.length / 14 + (g.enemies.some(function (e) { return e.def.boss; }) ? 0.6 : 0)); if (m.paused) tgt *= 0.3; if (g.over) tgt = 0; }
  A.intensity += (tgt - A.intensity) * Math.min(1, dt * 0.8);
  A.menu = !m || m.inMenu;
  if (A.ready && musicBus) { var t = ctx.currentTime; if (m && m.paused && !m.inMenu) musicBus.gain.setTargetAtTime(S().music * 0.35, t, 0.2); else if (!S().mute) musicBus.gain.setTargetAtTime(S().music * 0.8, t, 0.2); }
};
})(window.G = window.G || {});
