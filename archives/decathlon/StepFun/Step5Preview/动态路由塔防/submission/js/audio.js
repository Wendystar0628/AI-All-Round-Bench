/* 音频：程序化生成的环境声、音乐与音效（无外部素材） */
(function (g) {
'use strict';
const TD = g.TD;
const A = TD.Audio = {
  ctx: null, master: null, musicGain: null, sfxGain: null, ambGain: null,
  started: false, mapId: null, settings: { master: 0.7, music: 0.5, sfx: 0.7, muted: false },
  seqT: 0, seqStep: 0, ambNodes: [], seqTimer: null
};

function init(settings) {
  A.settings = settings || A.settings;
}
function unlock() {
  if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    A.ctx = new C();
    A.master = A.ctx.createGain(); A.master.connect(A.ctx.destination);
    A.musicGain = A.ctx.createGain(); A.musicGain.connect(A.master);
    A.sfxGain = A.ctx.createGain(); A.sfxGain.connect(A.master);
    A.ambGain = A.ctx.createGain(); A.ambGain.connect(A.master);
    setVolumes();
  } catch (e) { A.ctx = null; }
}
function setVolumes() {
  if (!A.ctx) return;
  const s = A.settings;
  const m = s.muted ? 0 : s.master;
  A.master.gain.value = m;
  A.musicGain.gain.value = s.music * 0.5;
  A.sfxGain.gain.value = s.sfx * 0.8;
  A.ambGain.gain.value = 0.5;
}
function now() { return A.ctx.currentTime; }
function tone(freq, dur, type, vol, slide, dest) {
  if (!A.ctx || A.settings.muted) return;
  const o = A.ctx.createOscillator(), gn = A.ctx.createGain();
  o.type = type || 'sine'; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), now() + dur);
  gn.gain.setValueAtTime(0, now());
  gn.gain.linearRampToValueAtTime(vol || 0.2, now() + 0.01);
  gn.gain.exponentialRampToValueAtTime(0.0008, now() + dur);
  o.connect(gn); gn.connect(dest || A.sfxGain);
  o.start(); o.stop(now() + dur + 0.02);
}
function noise(dur, vol, freq, q, dest) {
  if (!A.ctx || A.settings.muted) return;
  const len = Math.ceil(A.ctx.sampleRate * dur);
  const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = A.ctx.createBufferSource(); src.buffer = buf;
  const f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 800; f.Q.value = q || 1;
  const gn = A.ctx.createGain(); gn.gain.value = vol || 0.2;
  src.connect(f); f.connect(gn); gn.connect(dest || A.sfxGain);
  src.start();
}
/* ---------- 环境与音乐 ---------- */
const MAP_MUSIC = {
  m1: { base: 55, scale: [0, 3, 5, 7, 10], bpm: 84, wave: 'sine' },
  m2: { base: 49, scale: [0, 2, 5, 7, 9], bpm: 96, wave: 'triangle' },
  m3: { base: 41, scale: [0, 3, 7, 10, 12], bpm: 72, wave: 'sawtooth' }
};
function startMap(mapId) {
  if (!A.ctx) return;
  if (A.mapId === mapId && A.started) return;
  stopMap();
  A.mapId = mapId; A.started = true;
  const m = MAP_MUSIC[mapId] || MAP_MUSIC.m1;
  // 环境低鸣
  const o1 = A.ctx.createOscillator(), o2 = A.ctx.createOscillator(), gn = A.ctx.createGain();
  o1.type = 'sine'; o1.frequency.value = m.base;
  o2.type = 'sine'; o2.frequency.value = m.base * 1.5;
  const lfo = A.ctx.createOscillator(), lg = A.ctx.createGain();
  lfo.frequency.value = 0.13; lg.gain.value = 0.06;
  lfo.connect(lg); lg.connect(gn.gain);
  gn.gain.value = 0.10;
  o1.connect(gn); o2.connect(gn); gn.connect(A.ambGain);
  o1.start(); o2.start(); lfo.start();
  A.ambNodes = [o1, o2, lfo];
  // 数据流噪声
  const nb = A.ctx.createBufferSource();
  const len = A.ctx.sampleRate * 2;
  const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
  const dd = buf.getChannelData(0);
  for (let i = 0; i < len; i++) dd[i] = Math.random() * 2 - 1;
  nb.buffer = buf; nb.loop = true;
  const nf = A.ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1200; nf.Q.value = 0.7;
  const ng = A.ctx.createGain(); ng.gain.value = 0.035;
  nb.connect(nf); nf.connect(ng); ng.connect(A.ambGain);
  nb.start();
  A.ambNodes.push(nb);
  // 音序器
  A.seqStep = 0;
  A.seqTimer = setInterval(() => {
    if (!A.ctx || A.settings.muted) return;
    const st = 60 / m.bpm / 2;
    const s = A.seqStep++;
    const semi = m.scale[(s * 3) % m.scale.length] + (s % 8 === 0 ? 12 : 0);
    tone(m.base * 4 * Math.pow(2, semi / 12), st * 1.8, m.wave, 0.055, null, A.musicGain);
    if (s % 4 === 0) tone(m.base * 2, st * 2.4, 'sine', 0.09, null, A.musicGain);
    if (s % 8 === 4) noise(0.12, 0.03, 3000, 2, A.musicGain);
  }, 60 / m.bpm / 2 * 1000);
}
function stopMap() {
  if (A.seqTimer) { clearInterval(A.seqTimer); A.seqTimer = null; }
  for (const n of A.ambNodes) { try { n.stop(); } catch (e) { } }
  A.ambNodes = []; A.started = false;
}
/* ---------- 音效 ---------- */
const SFX = {
  click: () => tone(880, 0.06, 'square', 0.05),
  deny: () => { tone(180, 0.14, 'square', 0.09, 90); },
  build: () => { tone(320, 0.1, 'square', 0.09, 640); noise(0.12, 0.06, 900, 1); },
  upgrade: () => { tone(520, 0.1, 'triangle', 0.1, 780); setTimeout(() => tone(780, 0.14, 'triangle', 0.09, 1040), 90); },
  sell: () => tone(500, 0.12, 'triangle', 0.07, 240),
  shoot: () => tone(1400, 0.05, 'square', 0.035, 700),
  hit: () => noise(0.06, 0.05, 2200, 2),
  kill: () => { noise(0.16, 0.09, 500, 1); tone(220, 0.16, 'sawtooth', 0.05, 80); },
  leak: () => { tone(160, 0.5, 'sawtooth', 0.14, 60); noise(0.4, 0.1, 300, 0.8); },
  skill: () => { tone(660, 0.16, 'sine', 0.1, 990); setTimeout(() => tone(990, 0.2, 'sine', 0.08, 1320), 110); },
  item: () => { tone(400, 0.08, 'triangle', 0.09, 700); setTimeout(() => tone(700, 0.12, 'triangle', 0.08, 1000), 80); },
  boss: () => { tone(70, 1.0, 'sawtooth', 0.16, 45); noise(0.7, 0.12, 180, 0.6); },
  wave: () => { tone(300, 0.18, 'square', 0.07, 460); setTimeout(() => tone(460, 0.22, 'square', 0.06, 600), 150); },
  encrypt: () => tone(300, 0.2, 'sawtooth', 0.05, 200)
};
TD.Audio.init = init; TD.Audio.unlock = unlock; TD.Audio.setVolumes = setVolumes;
TD.Audio.startMap = startMap; TD.Audio.stopMap = stopMap;
for (const k in SFX) TD.Audio[k] = SFX[k];
})(typeof window !== 'undefined' ? window : globalThis);
