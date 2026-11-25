'use strict';
/* ============================================================
   配乐：全部由程序合成（Web Audio OfflineAudioContext + JS 合成的采样）
   一段原创主旋律（3 小节）在每个版块里换乐器、换曲风重新演奏
   分段离线渲染 → 实时播放与导出共用同一份声音
   ============================================================ */
const AUDIO = (function () {
  const SR = 44100, TAIL = 2.6, STEP = 0.25;            // 八分音符 = 0.25s（120 BPM）
  const SEGA = [{ s: 0, d: INTRO_LEN }];
  for (let i = 0; i < NSEC; i++) SEGA.push({ s: INTRO_LEN + i * SEC_LEN, d: SEC_LEN });
  SEGA.push({ s: INTRO_LEN + NSEC * SEC_LEN, d: OUTRO_LEN });
  const bufs = new Array(SEGA.length).fill(null);
  const api = { ctx: null, t0ctx: 0, onProgress: null };

  /* ---------- 乐理 ---------- */
  const MODES = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10], hmin: [0, 2, 3, 5, 7, 8, 11], penta: [0, 2, 4, 4, 7, 9, 9], jap: [0, 1, 5, 5, 7, 8, 10], lyd: [0, 2, 4, 6, 7, 9, 11], dor: [0, 2, 3, 5, 7, 9, 10] };
  // 主旋律：[八分音符位置, 长度, 音级]
  const THEME = [[0, 2, 2], [2, 1, 4], [3, 1, 7], [4, 2, 6], [6, 2, 4], [8, 1, 5], [9, 1, 4], [10, 1, 2], [11, 1, 0], [12, 2, 1], [14, 1, 2], [15, 1, 4], [16, 2, 5], [18, 1, 4], [19, 1, 2], [20, 3, 1], [23, 1, -3]];
  const ROOTS = [0, 0, 5, 4, 3, 4];                       // 每半小节的和弦根音级：I I vi V IV V
  const SPEC = [
    { k: 72, m: 'maj' },                                   // 片头
    { k: 72, m: 'maj' }, { k: 75, m: 'maj' }, { k: 74, m: 'maj' }, { k: 76, m: 'maj' }, { k: 77, m: 'maj' }, { k: 79, m: 'maj' },
    { k: 81, m: 'maj' }, { k: 70, m: 'maj' }, { k: 74, m: 'maj' }, { k: 69, m: 'hmin' }, { k: 69, m: 'min' }, { k: 79, m: 'maj' },
    { k: 74, m: 'penta' }, { k: 76, m: 'jap' }, { k: 79, m: 'maj' }, { k: 77, m: 'lyd' }, { k: 76, m: 'maj' }, { k: 72, m: 'min' },
    { k: 72, m: 'maj' }, { k: 69, m: 'min' }, { k: 77, m: 'maj' }, { k: 72, m: 'min' },
    { k: 72, m: 'maj' }                                    // 片尾
  ];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function dm(deg, key, mode) { const sc = MODES[mode] || MODES.maj; const o = Math.floor(deg / 7), d = ((deg % 7) + 7) % 7; return key + o * 12 + sc[d]; }

  /* ---------- JS 合成的采样（缓存） ---------- */
  const cache = new Map();
  function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }
  function noiseArr(n, seed) { const R = rng(seed), a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = R() * 2 - 1; return a; }
  // 加法合成：partials = [[倍频, 振幅, 衰减秒]]
  function additive(freq, dur, partials, attack, noiseAmt, seed) {
    const n = Math.floor(dur * SR), out = new Float32Array(n);
    for (const [r, a, dc] of partials) {
      const w = TAU * freq * r / SR; if (freq * r > SR / 2.2) continue;
      const k = Math.exp(-1 / (dc * SR)), ph = (seed || 0) * r, c2 = 2 * Math.cos(w); let e = a, s1 = Math.sin(ph - w), s2 = Math.sin(ph - 2 * w);
      for (let i = 0; i < n; i++) { const s0 = c2 * s1 - s2; s2 = s1; s1 = s0; out[i] += s0 * e; e *= k; if (e < 1e-5) break; }
    }
    const at = Math.max(1, Math.floor((attack || .002) * SR));
    for (let i = 0; i < Math.min(at, n); i++) out[i] *= i / at;
    if (noiseAmt) { const R = rng(seed || 3); let lp = 0; for (let i = 0; i < Math.min(n, SR * .03); i++) { lp += ((R() * 2 - 1) - lp) * .3; out[i] += lp * noiseAmt * (1 - i / (SR * .03)); } }
    const fo = Math.floor(.02 * SR); for (let i = 0; i < fo; i++) out[n - 1 - i] *= i / fo;
    return out;
  }
  // 弦拨（Karplus-Strong）
  function ks(freq, dur, bright, decay, seed) {
    const n = Math.floor(dur * SR), out = new Float32Array(n);
    const N = Math.max(2, Math.round(SR / freq)), b = new Float32Array(N), R = rng(seed || 7);
    let lp = 0; for (let i = 0; i < N; i++) { lp += ((R() * 2 - 1) - lp) * bright; b[i] = lp; }
    let idx = 0; const d = decay;
    for (let i = 0; i < n; i++) { const a = b[idx], c = b[(idx + 1) % N]; out[i] = a; b[idx] = (a + c) * .5 * d; idx = (idx + 1) % N; }
    let mx = 0; for (let i = 0; i < Math.min(n, 2000); i++) mx = Math.max(mx, Math.abs(out[i])); if (mx > 0) for (let i = 0; i < n; i++) out[i] /= mx;
    const fo = Math.floor(.02 * SR); for (let i = 0; i < fo; i++) out[n - 1 - i] *= i / fo;
    return out;
  }
  const BELLS = {
    glock: [[1, 1, 1.2], [2.76, .35, .4], [5.4, .18, .2], [8.9, .08, .1]],
    celesta: [[1, 1, 1.0], [2, .3, .5], [3, .12, .3], [4.1, .05, .2]],
    musicbox: [[1, 1, 1.4], [3.0, .25, .5], [5.1, .12, .25], [7.2, .05, .1]],
    toy: [[1, 1, .5], [2.02, .5, .3], [3.97, .3, .15], [6.1, .2, .08]],
    xylo: [[1, 1, .35], [3.93, .4, .12], [9.4, .15, .05]],
    marimba: [[1, 1, .6], [3.99, .25, .2], [9.8, .05, .05]],
    vibes: [[1, 1, 2.2], [3.99, .3, .8], [10, .05, .2]],
    bike: [[1, 1, .9], [2.38, .55, .6], [3.95, .3, .35], [5.6, .15, .2]],
    chime: [[1, 1, 2.4], [2.76, .4, 1.4], [5.4, .25, .9], [8.93, .1, .5]],
    metal: [[1, 1, .5], [1.48, .8, .4], [2.31, .6, .3], [3.17, .5, .2], [4.6, .3, .15]],
    piano: null
  };
  function pianoArr(m) {
    return cached('pn' + m, () => {
      const f = mtof(m), T = clamp(3.2 - (m - 48) * .035, .8, 3.2), p = [];
      for (let k = 1; k <= 8; k++) p.push([k * Math.sqrt(1 + .0004 * k * k), 1 / Math.pow(k, 1.35) * (k === 2 ? .8 : 1), T / (1 + .45 * (k - 1))]);
      return additive(f, Math.min(T * 1.2, 3.2), p, .003, .25, m);
    });
  }
  function bellArr(type, m) { return cached(type + m, () => additive(mtof(m), type === 'chime' || type === 'vibes' ? 3 : 2, BELLS[type], .001, type === 'xylo' || type === 'marimba' ? .5 : .1, m)); }
  function ksArr(m, bright, decay, dur) { return cached('ks' + m + '_' + bright + '_' + decay + '_' + dur, () => ks(mtof(m), dur, bright, decay, m * 7 + 1)); }
  function drumArr(kind) {
    return cached('dr_' + kind, () => {
      const R = rng(kind.length * 31 + kind.charCodeAt(0));
      const mkN = (dur) => new Float32Array(Math.floor(dur * SR));
      let o;
      switch (kind) {
        case 'kick': { o = mkN(.5); let ph = 0; for (let i = 0; i < o.length; i++) { const t = i / SR, f = 45 + 110 * Math.exp(-t * 28); ph += TAU * f / SR; o[i] = Math.sin(ph) * Math.exp(-t * 7) + (i < 200 ? (R() * 2 - 1) * .4 * (1 - i / 200) : 0); } break; }
        case 'kick808': { o = mkN(1.2); let ph = 0; for (let i = 0; i < o.length; i++) { const t = i / SR, f = 42 + 80 * Math.exp(-t * 30); ph += TAU * f / SR; o[i] = Math.tanh(Math.sin(ph) * 2.2 * Math.exp(-t * 2.2)); } break; }
        case 'snare': { o = mkN(.35); let ph = 0, lp = 0, hp = 0; for (let i = 0; i < o.length; i++) { const t = i / SR; ph += TAU * (190 - 30 * t) / SR; const n = R() * 2 - 1; lp += (n - lp) * .5; hp = n - lp; o[i] = Math.sin(ph) * .5 * Math.exp(-t * 25) + hp * .9 * Math.exp(-t * 14); } break; }
        case 'clap': { o = mkN(.35); let lp = 0; for (let i = 0; i < o.length; i++) { const t = i / SR, n = R() * 2 - 1; lp += (n - lp) * .35; const env = (t < .01 ? 1 : t < .02 ? .6 : t < .03 ? 1 : 0) * .7 + Math.exp(-(t - .03) * 18) * (t > .03 ? 1 : 0); o[i] = (n - lp) * env; } break; }
        case 'hat': { o = mkN(.08); let lp = 0; for (let i = 0; i < o.length; i++) { const n = R() * 2 - 1; lp += (n - lp) * .7; o[i] = (n - lp) * Math.exp(-i / SR * 60); } break; }
        case 'ohat': { o = mkN(.4); let lp = 0; for (let i = 0; i < o.length; i++) { const n = R() * 2 - 1; lp += (n - lp) * .7; o[i] = (n - lp) * Math.exp(-i / SR * 9); } break; }
        case 'ride': { o = mkN(1.2); let lp = 0, ph = 0; for (let i = 0; i < o.length; i++) { const n = R() * 2 - 1; lp += (n - lp) * .6; ph += TAU * 5200 / SR; o[i] = ((n - lp) * .5 + Math.sin(ph) * .2 * Math.sin(ph * .73)) * Math.exp(-i / SR * 3.5); } break; }
        case 'crash': { o = mkN(2.2); let lp = 0; for (let i = 0; i < o.length; i++) { const n = R() * 2 - 1; lp += (n - lp) * .55; o[i] = (n - lp) * Math.exp(-i / SR * 1.9) * (i < 300 ? i / 300 : 1); } break; }
        case 'shaker': { o = mkN(.09); let lp = 0; for (let i = 0; i < o.length; i++) { const t = i / SR, n = R() * 2 - 1; lp += (n - lp) * .6; o[i] = (n - lp) * Math.sin(Math.min(1, t / .09) * PI); } break; }
        case 'tom': { o = mkN(.6); let ph = 0; for (let i = 0; i < o.length; i++) { const t = i / SR; ph += TAU * (110 + 60 * Math.exp(-t * 20)) / SR; o[i] = Math.sin(ph) * Math.exp(-t * 6) + (R() * 2 - 1) * .1 * Math.exp(-t * 40); } break; }
        case 'taiko': { o = mkN(1.2); let ph = 0, lp = 0; for (let i = 0; i < o.length; i++) { const t = i / SR, n = R() * 2 - 1; lp += (n - lp) * .05; ph += TAU * (62 + 40 * Math.exp(-t * 15)) / SR; o[i] = Math.sin(ph) * Math.exp(-t * 3.5) + lp * 2 * Math.exp(-t * 8); } break; }
        case 'rim': { o = mkN(.06); let ph = 0; for (let i = 0; i < o.length; i++) { ph += TAU * 1700 / SR; o[i] = (Math.sin(ph) * .6 + (R() * 2 - 1) * .4) * Math.exp(-i / SR * 90); } break; }
        case 'block': { o = mkN(.15); let ph = 0; for (let i = 0; i < o.length; i++) { ph += TAU * 1100 / SR; o[i] = Math.sin(ph) * Math.exp(-i / SR * 45); } break; }
        case 'chain': { o = mkN(.03); let lp = 0, hp = 0; for (let i = 0; i < o.length; i++) { const n = R() * 2 - 1; lp += (n - lp) * .5; hp = n - lp; o[i] = hp * Math.exp(-i / SR * 260); } break; }
        case 'type': { o = mkN(.05); let ph = 0; for (let i = 0; i < o.length; i++) { ph += TAU * 2600 / SR; o[i] = ((R() * 2 - 1) * .7 + Math.sin(ph) * .3) * Math.exp(-i / SR * 140); } break; }
        case 'stamp': { o = mkN(.18); let ph = 0, lp = 0; for (let i = 0; i < o.length; i++) { const t = i / SR, n = R() * 2 - 1; lp += (n - lp) * .2; ph += TAU * (160 - 60 * t) / SR; o[i] = (Math.sin(ph) * .6 + lp * 1.2) * Math.exp(-t * 30); } break; }
        case 'whoosh': { o = mkN(1.0); let lp = 0, bp = 0; for (let i = 0; i < o.length; i++) { const t = i / SR, n = R() * 2 - 1; const c = .02 + .25 * Math.sin(t * PI); lp += (n - lp) * c; bp += (lp - bp) * .5; o[i] = (lp - bp * .5) * Math.sin(t * PI) * 1.4; } break; }
        case 'hiss': { o = mkN(.6); let lp = 0; for (let i = 0; i < o.length; i++) { const t = i / SR, n = R() * 2 - 1; lp += (n - lp) * .6; o[i] = (n - lp) * Math.min(1, t * 30) * Math.exp(-t * 4); } break; }
        case 'scratch': { o = mkN(.4); let ph = 0; for (let i = 0; i < o.length; i++) { const t = i / SR, sp = Math.sin(t * TAU * 5); ph += TAU * (180 + 900 * Math.abs(sp)) / SR; o[i] = (Math.sin(ph) * .5 + (R() * 2 - 1) * .5) * Math.abs(sp) * Math.exp(-t * 2); } break; }
        case 'pencil': { o = mkN(.3); let lp = 0; for (let i = 0; i < o.length; i++) { const t = i / SR, n = R() * 2 - 1; lp += (n - lp) * .35; o[i] = (n - lp) * (.5 + .5 * Math.sin(t * TAU * 23)) * Math.sin(t / .3 * PI); } break; }
        case 'squeak': { o = mkN(.12); let ph = 0; for (let i = 0; i < o.length; i++) { const t = i / SR; ph += TAU * (1400 + 500 * Math.sin(t * 90)) / SR; o[i] = Math.sin(ph) * Math.sin(t / .12 * PI) * .6; } break; }
        case 'boing': { o = mkN(.5); let ph = 0; for (let i = 0; i < o.length; i++) { const t = i / SR; ph += TAU * (300 + 160 * Math.sin(t * 60) * Math.exp(-t * 6)) / SR; o[i] = Math.sin(ph) * Math.exp(-t * 6); } break; }
        case 'shutter': { o = mkN(.12); let lp = 0; for (let i = 0; i < o.length; i++) { const t = i / SR, n = R() * 2 - 1; lp += (n - lp) * .4; o[i] = (n - lp) * (Math.exp(-t * 80) + (t > .05 ? Math.exp(-(t - .05) * 90) : 0)); } break; }
        case 'crackle': { o = mkN(6); for (let i = 0; i < o.length; i++) { o[i] = (R() < .0009 ? (R() * 2 - 1) : 0) + (R() * 2 - 1) * .015; } break; }
        case 'rain': { o = mkN(6); let lp = 0; for (let i = 0; i < o.length; i++) { const n = R() * 2 - 1; lp += (n - lp) * .25; o[i] = lp * .5 + (R() < .002 ? (R() * 2 - 1) * .6 : 0); } break; }
        case 'tape': { o = mkN(6); let lp = 0; for (let i = 0; i < o.length; i++) { const n = R() * 2 - 1; lp += (n - lp) * .5; o[i] = (n - lp) * .5; } break; }
        default: o = mkN(.1);
      }
      return o;
    });
  }

  /* ---------- 编曲上下文 ---------- */
  function Ctx(ac, seg, idx) {
    const A = { ac, idx, dur: seg.d };
    const sp = SPEC[idx], nx = SPEC[Math.min(idx + 1, SPEC.length - 1)];
    A.key = sp.k; A.mode = sp.m; A.nkey = nx.k; A.nmode = nx.m;
    // 总线：干声 → 压缩 → 输出；混响发送
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = .005; comp.release.value = .2; comp.knee.value = 8;
    const master = ac.createGain(); master.gain.value = .8;
    master.connect(comp); comp.connect(ac.destination);
    A.out = master;
    A.rev = ac.createGain(); A.rev.gain.value = 1;
    const cv = ac.createConvolver(); cv.buffer = irBuf(ac, idx === 13 || idx === 16 || idx === 21 ? 3.2 : 2.0, idx); A.rev.connect(cv);
    const wet = ac.createGain(); wet.gain.value = .32; cv.connect(wet); wet.connect(master);
    A.T = s => s * STEP;
    A.mn = (deg, step, oct) => (step >= 20 ? dm(deg, A.nkey, A.nmode) : dm(deg, A.key, A.mode)) + 12 * (oct || 0);
    A.chord = (h, oct, n) => { // 半小节 h 的和弦（三或四个音）
      if (h === 5) { const r = dm(4, A.nkey, A.nmode === 'min' ? 'hmin' : A.nmode) - 12; return [0, 4, 7, 10].slice(0, n || 3).map(x => r + x + 12 * (oct || 0) - 12); }
      const r = ROOTS[h]; return [0, 2, 4, 6].slice(0, n || 3).map(d => dm(r + d, A.key, A.mode === 'penta' || A.mode === 'jap' ? 'maj' : A.mode) - 12 + 12 * (oct || 0) - 12);
    };
    A.root = (h, oct) => A.chord(h, oct || 0)[0];
    A.mel = (fn, filter) => THEME.forEach((n, i) => { if (filter && !filter(n, i)) return; fn(A.T(n[0]), A.mn(n[2], n[0]), n[1] * STEP, i, n[0]); });
    return A;
  }
  function irBuf(ac, dur, seed) {
    const n = Math.floor(dur * SR), b = ac.createBuffer(2, n, SR);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c), R = rng(seed * 13 + c + 1); let lp = 0; for (let i = 0; i < n; i++) { lp += ((R() * 2 - 1) - lp) * (.5 - .4 * i / n); d[i] = lp * Math.pow(1 - i / n, 2.2) * (i < 400 ? i / 400 : 1); } }
    return b;
  }
  const abCache = new WeakMap();
  function arrBuf(ac, arr) { let b = abCache.get(arr); if (!b) { b = new AudioBuffer({ length: arr.length, sampleRate: SR, numberOfChannels: 1 }); b.copyToChannel(arr, 0); abCache.set(arr, b); } return b; }
  // 播放一段 JS 采样
  function play(A, arr, t, o) {
    o = o || {};
    if (t < 0 || t > A.dur + .5) return;
    const ac = A.ac, src = ac.createBufferSource(); src.buffer = arrBuf(ac, arr);
    if (o.rate) src.playbackRate.value = o.rate;
    const g = ac.createGain(); g.gain.value = o.vel === undefined ? .5 : o.vel;
    let node = src;
    if (o.lp || o.hp || o.bp) { const f = ac.createBiquadFilter(); f.type = o.lp ? 'lowpass' : o.hp ? 'highpass' : 'bandpass'; f.frequency.value = o.lp || o.hp || o.bp; f.Q.value = o.q || .7; node.connect(f); node = f; }
    node.connect(g);
    const pn = ac.createStereoPanner(); pn.pan.value = o.pan || 0; g.connect(pn); pn.connect(A.out);
    if (o.rev) { const s = ac.createGain(); s.gain.value = o.rev; pn.connect(s); s.connect(A.rev); }
    src.start(t);
    if (o.dur) { g.gain.setValueAtTime(g.gain.value, t + o.dur); g.gain.linearRampToValueAtTime(0, t + o.dur + (o.rel || .08)); src.stop(t + o.dur + (o.rel || .08) + .01); }
    return src;
  }
  // 振荡器合成声部
  function syn(A, t, m, dur, o) {
    o = Object.assign({ type: 'sawtooth', vel: .2, a: .01, d: .15, s: .7, r: .15, cut: 3000, q: .8, fenv: 0, fdec: .2, det: 0, n: 1, vib: 0, pan: 0, rev: .15, glide: 0 }, o);
    if (t < 0 || t > A.dur + .5) return;
    const ac = A.ac, f = mtof(m);
    const g = ac.createGain(); g.gain.value = 0;
    const flt = ac.createBiquadFilter(); flt.type = o.ftype || 'lowpass'; flt.Q.value = o.q;
    flt.frequency.setValueAtTime(o.cut, t);
    if (o.fenv) { flt.frequency.setValueAtTime(o.cut, t); flt.frequency.linearRampToValueAtTime(o.cut + o.fenv, t + o.a + .005); flt.frequency.setTargetAtTime(o.cut, t + o.a + .005, o.fdec); }
    const end = t + dur;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.vel, t + o.a); g.gain.setTargetAtTime(o.vel * o.s, t + o.a, o.d);
    g.gain.setValueAtTime(o.vel * o.s, end); g.gain.linearRampToValueAtTime(0, end + o.r);
    const oscs = [];
    for (let i = 0; i < o.n; i++) {
      const os = ac.createOscillator();
      if (o.type === 'pulse25' || o.type === 'pulse12') os.setPeriodicWave(pulseWave(ac, o.type === 'pulse25' ? .25 : .125)); else os.type = o.type;
      os.frequency.setValueAtTime(o.glide ? mtof(m + o.glide) : f, t);
      if (o.glide) os.frequency.exponentialRampToValueAtTime(f, t + .08);
      os.detune.value = o.n > 1 ? (i - (o.n - 1) / 2) * o.det : o.det;
      if (o.vib) { const l = ac.createOscillator(); l.frequency.value = o.vibr || 5.5; const lg = ac.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.vib, t + Math.min(.3, dur)); l.connect(lg); lg.connect(os.detune); l.start(t); l.stop(end + o.r + .05); }
      os.connect(flt); os.start(t); os.stop(end + o.r + .05); oscs.push(os);
    }
    let node = flt;
    if (o.formant) { const fs = o.formant.map(fq => { const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = fq; b.Q.value = 6; flt.connect(b); return b; }); const sum = ac.createGain(); sum.gain.value = 2.2; fs.forEach(b => b.connect(sum)); node = sum; }
    node.connect(g);
    const pn = ac.createStereoPanner(); pn.pan.value = o.pan; g.connect(pn); pn.connect(A.out);
    if (o.rev) { const s = ac.createGain(); s.gain.value = o.rev; pn.connect(s); s.connect(A.rev); }
    if (o.delay) { const dl = ac.createDelay(1); dl.delayTime.value = o.delay; const fb = ac.createGain(); fb.gain.value = .35; const dg = ac.createGain(); dg.gain.value = .35; pn.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(dg); dg.connect(A.out); }
    return oscs;
  }
  const pwCache = new WeakMap();
  function pulseWave(ac, duty) {
    let m = pwCache.get(ac); if (!m) { m = {}; pwCache.set(ac, m); }
    if (m[duty]) return m[duty];
    const n = 48, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) { re[k] = Math.sin(TAU * k * duty) / (PI * k); im[k] = (1 - Math.cos(TAU * k * duty)) / (PI * k); }
    return (m[duty] = ac.createPeriodicWave(re, im));
  }
  // 常用乐器封装
  const I = {
    piano: (A, t, m, v, o) => play(A, pianoArr(m), t, Object.assign({ vel: v || .35, rev: .25, lp: 6000 }, o)),
    bell: (A, type, t, m, v, o) => play(A, bellArr(type, m), t, Object.assign({ vel: v || .3, rev: .3 }, o)),
    pluck: (A, t, m, v, o) => { o = o || {}; return play(A, ksArr(m, o.bright || .5, o.decay || .996, o.len || 1.6), t, Object.assign({ vel: v || .4, rev: .2 }, o)); },
    drum: (A, k, t, v, o) => play(A, drumArr(k), t, Object.assign({ vel: v || .5, rev: .08 }, o)),
    brass: (A, t, m, dur, v, o) => syn(A, t, m, dur, Object.assign({ type: 'sawtooth', n: 2, det: 8, vel: v || .14, a: .03, d: .2, s: .75, cut: 700, fenv: 2600, fdec: .15, q: 1.2, vib: 12, rev: .2 }, o)),
    strings: (A, t, m, dur, v, o) => syn(A, t, m, dur, Object.assign({ type: 'sawtooth', n: 3, det: 10, vel: v || .07, a: .25, d: .5, s: .9, r: .5, cut: 2200, q: .5, vib: 8, vibr: 5, rev: .45 }, o)),
    choir: (A, t, m, dur, v, o) => syn(A, t, m, dur, Object.assign({ type: 'sawtooth', n: 2, det: 9, vel: v || .1, a: .3, d: .5, s: .9, r: .6, cut: 3500, formant: [700, 1150, 2700], vib: 14, vibr: 5, rev: .55 }, o)),
    flute: (A, t, m, dur, v, o) => { syn(A, t, m, dur, Object.assign({ type: 'triangle', vel: v || .16, a: .05, d: .3, s: .85, r: .12, cut: 4000, vib: 16, vibr: 5.2, rev: .35 }, o)); play(A, drumArr('hiss'), t, { vel: (v || .16) * .25, bp: mtof(m) * 2, q: 3, rev: .2 }); },
    organ: (A, t, m, dur, v, o) => { for (const [r, a] of [[0, 1], [12, .6], [19, .4], [24, .3]]) syn(A, t, m + r, dur, Object.assign({ type: 'sine', vel: (v || .08) * a, a: .005, d: .1, s: 1, r: .05, cut: 8000, vib: 6, vibr: 6.5, rev: .15 }, o)); },
    bass: (A, t, m, dur, v, o) => syn(A, t, m, dur, Object.assign({ type: 'sawtooth', vel: v || .22, a: .005, d: .15, s: .6, r: .06, cut: 300, fenv: 900, fdec: .08, q: 3, rev: 0 }, o)),
    sub: (A, t, m, dur, v, o) => syn(A, t, m, dur, Object.assign({ type: 'sine', vel: v || .3, a: .005, d: .3, s: .8, r: .08, cut: 1000, rev: 0 }, o)),
    lead: (A, t, m, dur, v, o) => syn(A, t, m, dur, Object.assign({ type: 'sawtooth', n: 3, det: 14, vel: v || .1, a: .01, d: .2, s: .7, r: .12, cut: 2500, fenv: 2500, fdec: .2, q: 1.5, vib: 10, rev: .2 }, o)),
    sax: (A, t, m, dur, v, o) => syn(A, t, m, dur, Object.assign({ type: 'sawtooth', vel: v || .16, a: .04, d: .2, s: .8, r: .12, cut: 2200, fenv: 1200, fdec: .2, q: 1, formant: [600, 1400, 2600], vib: 18, vibr: 5, rev: .3, glide: -1 }, o)),
    accordion: (A, t, m, dur, v, o) => syn(A, t, m, dur, Object.assign({ type: 'sawtooth', n: 2, det: 16, vel: v || .1, a: .03, d: .2, s: .85, r: .08, cut: 1800, q: 1, rev: .15 }, o)),
    whistle: (A, t, m, dur, v, o) => syn(A, t, m, dur, Object.assign({ type: 'sine', vel: v || .14, a: .04, d: .2, s: .9, r: .1, cut: 8000, vib: 25, vibr: 6, glide: -2, rev: .3 }, o)),
    epiano: (A, t, m, dur, v, o) => { syn(A, t, m, dur, Object.assign({ type: 'sine', vel: v || .16, a: .005, d: .6, s: .4, r: .3, cut: 6000, rev: .25 }, o)); syn(A, t, m + 12, Math.min(dur, .3), Object.assign({ type: 'sine', vel: (v || .16) * .35, a: .002, d: .08, s: 0, r: .1, cut: 8000, rev: .1 }, o)); },
    chip: (A, t, m, dur, v, type, o) => syn(A, t, m, dur, Object.assign({ type: type || 'pulse25', vel: v || .08, a: .002, d: .1, s: .8, r: .02, cut: 12000, q: .1, rev: .02 }, o))
  };
  // 车铃与链条：贯穿全片的打击乐
  function bike(A, o) {
    o = o || {};
    const n = Math.round(A.dur / .125);
    for (let i = 0; i < n; i++) { const acc = i % 4 === 0 ? 1 : i % 2 === 0 ? .6 : .35; I.drum(A, 'chain', i * .125, (o.chain || .1) * acc, { pan: .2, rev: 0, hp: o.chainHp || 2500, rate: o.chainRate || 1 }); }
    if (o.bell !== false) { const bt = o.bellAt || [5.75]; bt.forEach((t, i) => { I.bell(A, 'bike', t, o.bellM || 88, o.bellV || .2, { pan: -.15, rev: .25 }); I.bell(A, 'bike', t + .09, (o.bellM || 88) + 4, (o.bellV || .2) * .7, { pan: -.15, rev: .25 }); }); }
  }
  const beats = (A, from, to, fn) => { for (let b = from; b < to; b++) fn(b * .5, b); };

  /* ---------- 22 + 2 段编曲 ---------- */
  const ARR = [];
  // 片头：打字、铅笔、钢琴独奏主旋律的开头
  ARR[0] = A => {
    for (let i = 1; i <= 11; i++) I.drum(A, 'type', .12 + i * .072, .25, { pan: (i % 3 - 1) * .2 });
    I.drum(A, 'type', 1.0, .2);
    [[1.0, 1.25], [1.15, 1.4], [1.3, 1.55], [1.6, 1.85], [1.8, 2.0], [2.0, 2.2], [2.2, 2.35]].forEach(([a], i) => I.drum(A, 'pencil', a, .16, { pan: .1 * (i % 3 - 1), rate: .9 + (i % 3) * .1 }));
    I.drum(A, 'squeak', 2.5, .1); I.drum(A, 'squeak', 2.62, .1, { rate: 1.1 }); I.drum(A, 'boing', 2.8, .16);
    // 钢琴独奏：主旋律前两小节
    A.mel((t, m, d, i, st) => I.piano(A, 1 + t, m, .42, { pan: .05 }), n => n[0] < 16);
    I.piano(A, 3, 60, .18); I.piano(A, 3, 64, .14); I.piano(A, 3, 67, .14);
    // 第二行字落在强拍上
    I.bell(A, 'celesta', 3, 84, .14);
    const n = Math.round(2 / .125); for (let i = 0; i < n; i++) I.drum(A, 'chain', 3 + i * .125, .06 * (i % 2 ? .5 : 1), { hp: 2500 });
    I.bell(A, 'bike', 4.75, 88, .2); I.bell(A, 'bike', 4.84, 92, .14);
    I.drum(A, 'crash', 4.98, .0001);
  };
  // 01 红黑拼贴：爵士摇滚
  ARR[1] = A => {
    I.drum(A, 'crash', 0, .35);
    for (let s = 0; s < 24; s++) {
      const t = A.T(s);
      I.drum(A, 'ride', t, s % 2 ? .1 : .16, { pan: .3 });
      if ([0, 3, 6, 8, 11, 14, 16, 19, 22].includes(s)) I.drum(A, 'kick', t, .55);
      if (s % 4 === 2) I.drum(A, 'snare', t, .4);
      if ([7, 15, 21, 23].includes(s)) I.drum(A, 'snare', t, .28);
      // 快速行进的贝斯
      const h = Math.floor(s / 4), ch = A.chord(h, -1, 4), nxt = A.chord(Math.min(h + 1, 5), -1)[0];
      const walk = [ch[0], ch[1], ch[2], (s % 4 === 3) ? nxt - 1 : ch[3]][s % 4];
      I.pluck(A, t, walk, .5, { bright: .35, decay: .993, len: .5, lp: 1400, rev: 0, dur: .22 });
    }
    // 铜管短促的强音
    [[3, 0], [7, 1], [11, 2], [14, 3], [19, 4], [22, 5]].forEach(([s, h]) => A.chord(h, 1, 4).forEach((m, j) => I.brass(A, A.T(s), m, .1, .07, { pan: (j - 1.5) * .3, a: .01 })));
    A.mel((t, m, d) => I.brass(A, t, m, d * .9, .13, { vib: 18, cut: 900 }));
    bike(A, { chain: .07 });
  };
  // 02 星际列车：太空歌剧
  ARR[2] = A => {
    I.drum(A, 'crash', 0, .3, { rev: .5 }); I.drum(A, 'taiko', 0, .5, { rev: .4 });
    for (let h = 0; h < 6; h++) A.chord(h, 0, 3).forEach((m, j) => I.strings(A, h * 1, m, 1.05, .055, { pan: (j - 1) * .4 }));
    for (let h = 0; h < 6; h++) I.strings(A, h * 1, A.root(h, -1), 1, .07);
    A.mel((t, m, d) => { I.choir(A, t, m - 12, d * 1.05, .07); I.strings(A, t, m, d, .05, { a: .06 }); });
    A.mel((t, m, d, i) => { if (i % 2 === 0) I.bell(A, 'glock', t, m + 12, .16, { pan: .3 }); });
    for (let s = 0; s < 48; s++) I.drum(A, 'shaker', s * .125, s % 4 === 0 ? .22 : .1, { pan: -.2 });
    beats(A, 0, 12, (t, b) => { I.drum(A, 'tom', t, b % 2 ? .12 : .22, { rate: .6 }); if (b % 2 === 0) I.drum(A, 'hiss', t + .25, .08, { hp: 3000 }); });
    bike(A, { chain: .05, bellM: 91 });
  };
  // 03 奇幻冒险：管弦乐冒险曲
  ARR[3] = A => {
    I.drum(A, 'crash', 0, .25, { rev: .5 });
    for (let s = 0; s < 24; s++) { const ch = A.chord(Math.floor(s / 4), 0, 3); I.strings(A, A.T(s), ch[s % 3] + (s % 2 ? 12 : 0), .2, .05, { a: .01, d: .08, s: .3, r: .08, pan: .3 }); }
    for (let h = 0; h < 6; h++) A.chord(h, 0, 3).forEach((m, j) => I.brass(A, h, m - 12, .95, .05, { a: .12, cut: 500, fenv: 900, vib: 6, pan: (j - 1) * .4 }));
    for (let h = 0; h < 6; h++) I.strings(A, h, A.root(h, -1), .95, .08);
    A.mel((t, m, d) => I.flute(A, t, m + 12, d, .15));
    [0, 2, 4].forEach(b => I.drum(A, 'tom', b, .3, { rate: .45, rev: .4 }));
    for (let i = 0; i < 8; i++) I.drum(A, 'tom', 5 + i * .0625, .05 + i * .02, { rate: .45 });
    I.drum(A, 'whoosh', 2.0, .12, { rev: .3 });
    bike(A, { chain: .06 });
  };
  // 04 清爽校园：流行电子
  ARR[4] = A => {
    I.drum(A, 'crash', 0, .2);
    beats(A, 0, 12, (t, b) => { I.drum(A, 'kick', t, .45); if (b % 2) I.drum(A, 'clap', t, .3, { rev: .15 }); I.drum(A, 'hat', t + .25, .15, { pan: .3 }); });
    for (let h = 0; h < 6; h++) { [1, 3].forEach(s => A.chord(h, 1, 4).forEach(m => I.piano(A, h + s * .25, m, .1))); I.bass(A, h, A.root(h, -1), .4, .18, { cut: 400 }); I.bass(A, h + .5, A.root(h, -1) + 12, .2, .12, { cut: 500 }); }
    A.mel((t, m, d) => syn(A, t, m, Math.min(d, .2), { type: 'square', vel: .07, a: .002, d: .12, s: .2, cut: 3000, fenv: 2000, delay: .375, rev: .2 }));
    // 放学铃（原创四音）
    [[79, 2.0], [76, 2.25], [77, 2.5], [72, 2.75]].forEach(([m, t]) => I.bell(A, 'chime', t, m, .16, { rev: .5 }));
    [2.9, 3.05, 3.2, 3.35, 3.5, 3.57, 3.17].forEach(t => I.drum(A, 'shutter', t, .12, { pan: (t * 7 % 2) - 1 }));
    I.bell(A, 'glock', 2.85, 96, .1); I.bell(A, 'glock', 2.92, 91, .1);
    bike(A, { chain: .05 });
  };
  // 05 Galgame：钢琴与弦乐的日常
  ARR[5] = A => {
    for (let s = 0; s < 24; s++) { const ch = A.chord(Math.floor(s / 4), 0, 4); I.piano(A, A.T(s), [ch[0], ch[2], ch[3], ch[1]][s % 4] + 12, .12, { pan: -.1 }); }
    for (let h = 0; h < 6; h++) { I.strings(A, h, A.root(h, -1), 1, .05); A.chord(h, 1, 3).forEach(m => I.strings(A, h, m, 1, .025)); }
    A.mel((t, m, d) => I.piano(A, t, m + 12, .28, { pan: .1 }));
    for (let s = 0; s < 24; s++) I.drum(A, 'shaker', A.T(s), s % 2 ? .05 : .09);
    for (let i = 0; i < 11; i++) syn(A, 2.0 + i / 13, 96 + (i % 3), .03, { type: 'square', vel: .025, a: .001, d: .02, s: 0, r: .01, cut: 5000, rev: 0 });
    I.bell(A, 'celesta', 3.6, 96, .15); I.bell(A, 'celesta', 3.68, 100, .12);
    bike(A, { chain: .04, bellM: 93 });
  };
  // 06 萌系 Q 版：玩具钢琴、尤克里里、口哨
  ARR[6] = A => {
    A.mel((t, m, d) => I.bell(A, 'toy', t, m, .22, { pan: .1 }));
    A.mel((t, m, d) => I.whistle(A, t, m + 12, d * .9, .1), n => n[0] >= 8 && n[0] < 16);
    const strum = [0, 2, 3, 5, 6, 7];
    for (let h = 0; h < 6; h++) strum.forEach(s => { if (s >= 4) return; A.chord(h, 0, 4).forEach((m, j) => I.pluck(A, h + s * .25 + j * .012, m + 12, .14, { bright: .7, decay: .99, len: .6, rev: .15 })); });
    for (let h = 0; h < 6; h++) [0, 2].forEach(s => A.chord(h, 0, 4).forEach((m, j) => I.pluck(A, h + .5 + s * .25 + j * .012, m + 12, .1, { bright: .7, decay: .99, len: .6 })));
    beats(A, 0, 12, (t, b) => { I.drum(A, b % 2 ? 'rim' : 'block', t, .12); });
    [2.5, 3.0, 3.5].forEach(t => I.drum(A, 'boing', t, .12, { rate: 1.4 }));
    bike(A, { chain: .04, bellM: 96 });
  };
  // 07 偶像音游：四拍舞曲
  ARR[7] = A => {
    I.drum(A, 'crash', 0, .3);
    beats(A, 0, 12, (t, b) => { I.drum(A, 'kick', t, .6); if (b % 2) { I.drum(A, 'clap', t, .35); I.drum(A, 'snare', t, .2); } I.drum(A, 'ohat', t + .25, .12, { pan: .25 }); });
    for (let s = 0; s < 24; s++) { const r = A.root(Math.floor(s / 4), -1); I.bass(A, A.T(s), s % 2 ? r + 12 : r, .2, .16, { cut: 500, fenv: 1500 }); }
    for (let h = 0; h < 6; h++) [1, 3].forEach(s => A.chord(h, 1, 3).forEach(m => syn(A, h + s * .25, m, .15, { type: 'sawtooth', n: 2, det: 12, vel: .035, cut: 3000, a: .002, d: .1, s: .3 })));
    A.mel((t, m, d) => I.lead(A, t, m, d * .95, .09, { delay: .25 }));
    [2, 2.5, 3, 3.5].forEach(t => { I.bell(A, 'glock', t, 100, .12); syn(A, t, 96, .05, { type: 'square', vel: .05, a: .001, d: .04, s: 0, cut: 8000 }); });
    syn(A, 3.9, 50, .25, { type: 'square', vel: .1, cut: 400, a: .001, d: .2, s: 0, glide: 4 });
    bike(A, { chain: .05 });
  };
  // 08 赛璐珞动画：动画主题曲式
  ARR[8] = A => {
    I.drum(A, 'crash', 0, .35);
    for (let s = 0; s < 24; s++) { const t = A.T(s); if (s % 4 === 0 || s % 8 === 3) I.drum(A, 'kick', t, .5); if (s % 4 === 2) I.drum(A, 'snare', t, .42); I.drum(A, 'hat', t, .1, { pan: .3 }); if (s >= 8 && s < 16) I.drum(A, 'hat', t + .125, .07, { pan: .3 }); }
    for (let i = 0; i < 8; i++) I.drum(A, 'snare', 3.5 + i * .0625, .15 + i * .03);
    for (let s = 0; s < 48; s++) { const r = A.root(Math.floor(s / 8), -1); const pat = [0, 12, 0, 0, 12, 0, 10, 12][s % 8]; if ([0, 1, 3, 4, 6, 7].includes(s % 8)) I.pluck(A, s * .125, r + pat, .38, { bright: .9, decay: .985, len: .3, lp: 2500, dur: .1, rev: 0 }); }
    for (let h = 0; h < 6; h++) A.chord(h, 1, 3).forEach((m, j) => I.brass(A, h + .75, m, .2, .05, { pan: (j - 1) * .4 }));
    A.mel((t, m, d) => I.brass(A, t, m, d * .95, .12, { n: 3, det: 10, cut: 1200, fenv: 3000 }));
    I.drum(A, 'whoosh', 1.9, .18);
    bike(A, { chain: .06 });
  };
  // 09 现代数码动画：钢琴、弦乐、后摇吉他 → 情绪高潮
  ARR[9] = A => {
    for (let s = 0; s < 48; s++) { const ch = A.chord(Math.floor(s / 8), 1, 4); I.piano(A, s * .125, [ch[0], ch[1], ch[2], ch[3], ch[2], ch[1], ch[2], ch[3]][s % 8], .08 + .02 * (s % 2 ? 0 : 1)); }
    for (let h = 0; h < 6; h++) { I.strings(A, h, A.root(h, -1), 1, .06 + h * .01); A.chord(h, 0, 3).forEach(m => I.strings(A, h, m, 1, .03 + h * .006)); }
    A.mel((t, m, d) => { const k = Math.round(d / .125); for (let j = 0; j < k; j++) I.pluck(A, t + j * .125, m, .12 + j * .01, { bright: .6, decay: .995, len: .8, dur: .2, rev: .4 }); });
    I.drum(A, 'crash', 4.0, .4, { rev: .6 }); I.drum(A, 'tom', 4.0, .4, { rate: .5 });
    beats(A, 8, 12, (t, b) => { I.drum(A, 'kick', t, .5); if (b % 2) I.drum(A, 'snare', t, .35, { rev: .3 }); });
    // 道口的铃与电车
    for (let i = 0; i < 7; i++) I.bell(A, 'metal', 2.0 + i * .25, 81 + (i % 2) * 2, .08, { rev: .3 });
    I.drum(A, 'whoosh', 2.4, .5, { rate: .6 }); I.drum(A, 'whoosh', 2.8, .45, { rate: .5 });
    for (let i = 0; i < 6; i++) I.drum(A, 'tom', 2.45 + i * .17, .1, { rate: .35 });
    bike(A, { chain: .04, bellAt: [3.68, 5.75] });
  };
  // 10 复古神秘学印刷：老唱片、钢琴与手风琴的旧式舞曲
  ARR[10] = A => {
    const lpf = A.ac.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 3200; const hpf = A.ac.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 260;
    const o0 = A.out; A.out = lpf; lpf.connect(hpf); hpf.connect(o0);
    play(A, drumArr('crackle'), 0, { vel: .5, dur: 6, lp: 6000 });
    beats(A, 0, 12, (t, b) => { const h = Math.floor(b / 2); if (b % 2 === 0) I.piano(A, t, A.root(h, -1), .25); else A.chord(h, 0, 3).forEach(m => I.piano(A, t, m, .1)); });
    A.mel((t, m, d) => I.accordion(A, t, m, d * .92, .11, { vib: 10 }));
    A.mel((t, m, d) => I.accordion(A, t, m - 5, d * .92, .05), n => n[0] >= 8);
    beats(A, 0, 12, (t) => I.drum(A, 'rim', t + .25, .06));
    for (let i = 0; i < 3; i++) I.drum(A, 'stamp', 2.0 + i * .1, .3);
    for (let i = 0; i < 8; i++) I.drum(A, 'stamp', 2.4 + i * .08, .18, { rate: 1.2 });
    A.out = o0;
    bike(A, { chain: .03, bellM: 84 });
  };
  // 11 工业机能：金属敲击、液压、低沉合成器
  ARR[11] = A => {
    I.drum(A, 'crash', 0, .2);
    for (let h = 0; h < 6; h++) syn(A, h, A.root(h, -2), 1, { type: 'sawtooth', n: 2, det: 6, vel: .12, a: .02, s: .9, cut: 250, q: 4, rev: .1 });
    for (let s = 0; s < 24; s++) { const t = A.T(s); if (s % 4 === 0 || s % 8 === 6) I.drum(A, 'kick', t, .6); if (s % 4 === 2) I.bell(A, 'metal', t, 64, .12, { pan: .3 }); if (s % 2) I.drum(A, 'hat', t, .1); }
    A.mel((t, m, d) => syn(A, t, m, d * .8, { type: 'square', vel: .06, cut: 1400, q: 4, a: .005, d: .1, s: .5, rev: .2 }));
    [2.25, 2.75, 3.25].forEach(t => { I.drum(A, 'hiss', t - .25, .3, { hp: 1500 }); I.bell(A, 'metal', t, 52, .25); });
    for (let i = 0; i < 4; i++) syn(A, 3.45 + i * .125, i % 2 ? 76 : 79, .11, { type: 'square', vel: .05, cut: 3000 });
    I.drum(A, 'hiss', 4.3, .25, { hp: 800, rate: .6 });
    bike(A, { chain: .07, chainHp: 1500 });
  };
  // 12 蓝图：木琴与钢片琴，打字机般的机械节奏
  ARR[12] = A => {
    A.mel((t, m, d) => I.bell(A, 'xylo', t, m, .3));
    A.mel((t, m, d) => I.bell(A, 'celesta', t + .125, m + 12, .08, { pan: .4 }), n => n[1] >= 2);
    for (let h = 0; h < 6; h++) A.chord(h, 0, 3).forEach((m, j) => I.bell(A, 'marimba', h + j * .25, m, .12, { pan: -.3 }));
    for (let s = 0; s < 48; s++) I.drum(A, 'type', s * .125, s % 4 === 0 ? .2 : .08, { pan: .2 });
    for (let i = 0; i < 7; i++) I.bell(A, 'bike', 2.0 + i * .24 + .1, 96, .05);
    bike(A, { chain: .03 });
  };
  // 13 水墨国风：古琴与竹笛，留白
  ARR[13] = A => {
    [0, 2, 4].forEach(b => I.pluck(A, b, A.root(b, -1), .45, { bright: .3, decay: .9985, len: 3, rev: .5 }));
    [1.5, 3.5].forEach(t => I.pluck(A, t, A.root(Math.floor(t), 0) + 7, .25, { bright: .35, decay: .998, len: 2, rev: .5 }));
    A.mel((t, m, d, i) => { I.flute(A, t, m, d * 1.05, .17, { vib: 22, glide: i % 3 === 0 ? -2 : 0 }); if (i % 4 === 1) play(A, drumArr('hiss'), t, { vel: .05, bp: 2600, q: 5 }); });
    [0, 3, 4.5].forEach(t => I.drum(A, 'block', t, .1, { rev: .4 }));
    bike(A, { chain: .025, bellM: 86 });
  };
  // 14 浮世绘：三味线、尺八、太鼓
  ARR[14] = A => {
    A.mel((t, m, d) => { I.pluck(A, t, m - 12, .45, { bright: .95, decay: .985, len: .5, rev: .2 }); I.pluck(A, t + .01, m, .2, { bright: .9, decay: .98, len: .4 }); });
    A.mel((t, m, d) => syn(A, t, m, d * 1.1, { type: 'triangle', vel: .1, a: .12, vib: 30, vibr: 4.5, rev: .5, glide: -1 }), n => n[1] >= 2);
    play(A, drumArr('hiss'), 0, { vel: .04, bp: 1800, q: 1, dur: 6 });
    [0, 1, 2, 3, 4, 5].forEach(b => I.drum(A, 'taiko', b, .3 + (b === 2 ? .3 : 0), { rev: .4 }));
    for (let i = 0; i < 6; i++) I.drum(A, 'taiko', 2.2 + i * .07, .15 + i * .04, { rate: 1.3 });
    I.drum(A, 'whoosh', 2.4, .3, { rate: .4 });
    beats(A, 0, 12, (t, b) => { if (b % 2) I.drum(A, 'block', t, .06); });
    bike(A, { chain: .03 });
  };
  // 15 剪纸艺术：木琴、竖琴拨弦、风铃
  ARR[15] = A => {
    A.mel((t, m, d) => I.bell(A, 'xylo', t, m, .26));
    for (let s = 0; s < 24; s++) { const ch = A.chord(Math.floor(s / 4), 0, 3); I.pluck(A, A.T(s), ch[s % 3] + (s % 4 === 3 ? 12 : 0), .14, { bright: .4, decay: .997, len: 1.5, rev: .4, pan: -.2 }); }
    for (let i = 0; i < 10; i++) I.bell(A, 'chime', .3 + i * .55 + (i % 3) * .07, 96 + [0, 3, 5, 7, 10][i % 5], .04, { pan: (i % 5 - 2) * .3, rev: .6 });
    I.drum(A, 'whoosh', 2.1, .35, { rate: .8 }); I.drum(A, 'whoosh', 3.0, .25, { rate: 1.1 });
    for (let i = 0; i < 6; i++) I.drum(A, 'shaker', 2.25 + i * .05, .08);
    bike(A, { chain: .03, bellM: 93 });
  };
  // 16 印象派：钢琴琶音与竖琴，弦乐轻柔铺底
  ARR[16] = A => {
    for (let i = 0; i < 16; i++) I.pluck(A, i * .03, A.chord(0, 0, 4)[i % 4] + 12 * Math.floor(i / 4), .12, { bright: .4, decay: .998, len: 2, rev: .5 });
    for (let s = 0; s < 48; s++) { const ch = A.chord(Math.floor(s / 8), 0, 4); const arp = [ch[0], ch[1], ch[2], ch[3], ch[2] + 12, ch[3] + 12, ch[1] + 12, ch[2]]; I.piano(A, s * .125, arp[s % 8], .07, { pan: -.2 }); }
    for (let h = 0; h < 6; h++) A.chord(h, 0, 4).forEach(m => I.strings(A, h, m, 1.05, .025));
    A.mel((t, m, d) => I.piano(A, t, m + 12, .26, { pan: .2 }));
    bike(A, { chain: .025, bellM: 91 });
  };
  // 17 波普艺术：冲浪摇滚吉他、电风琴、拍手
  ARR[17] = A => {
    I.drum(A, 'crash', 0, .3);
    for (let s = 0; s < 24; s++) { const t = A.T(s); if (s % 4 === 0) I.drum(A, 'kick', t, .5); if (s % 4 === 2) { I.drum(A, 'snare', t, .35); I.drum(A, 'clap', t, .3); } I.drum(A, 'tom', t, s % 2 ? .06 : .1, { rate: 1.4 }); }
    A.mel((t, m, d) => { const k = Math.round(d / .0625); for (let j = 0; j < k; j++) I.pluck(A, t + j * .0625, m - 12, .2, { bright: .8, decay: .99, len: .3, dur: .06, rev: .45 }); });
    for (let h = 0; h < 6; h++) [1, 3].forEach(s => A.chord(h, 0, 3).forEach(m => syn(A, h + s * .25, m, .2, { type: 'square', vel: .035, a: .005, d: .1, s: .8, cut: 2500, vib: 8, vibr: 7 })));
    for (let s = 0; s < 24; s++) I.bass(A, A.T(s), A.root(Math.floor(s / 4), -1) + (s % 2 ? 7 : 0), .2, .15, { cut: 600 });
    I.bell(A, 'bike', 2.05, 88, .5); I.bell(A, 'bike', 2.12, 92, .35);
    [2.65, 2.73, 2.81, 2.89].forEach(t => I.drum(A, 'stamp', t, .25));
    bike(A, { chain: .05, bell: true });
  };
  // 18 街头涂鸦：嘻哈鼓机、低音、搓碟
  ARR[18] = A => {
    for (let s = 0; s < 24; s++) { const t = A.T(s) + (s % 2 ? .04 : 0); if ([0, 5, 8, 13, 16, 21].includes(s)) I.drum(A, 'kick', t, .65); if (s % 4 === 2) I.drum(A, 'snare', t, .5); I.drum(A, 'hat', t, s % 2 ? .07 : .13, { pan: .3 }); }
    for (let h = 0; h < 6; h++) I.drum(A, 'kick808', h, .4, { rate: Math.pow(2, (A.root(h, -1) - 36) / 12) * .9, dur: .9 });
    A.mel((t, m, d) => I.epiano(A, t, m - 12, d, .14, { cut: 2000 }));
    [1.5, 2.0, 3.0].forEach(t => I.drum(A, 'scratch', t, .3, { pan: .2 }));
    [2.0, 2.4, 2.8, 3.45].forEach(t => I.drum(A, 'hiss', t, .18, { hp: 3000 }));
    I.drum(A, 'hiss', 5.4, .3, { hp: 600, rate: .5 });
    bike(A, { chain: .05 });
  };
  // 19 像素艺术：两个方波、一个三角波和一个噪声通道
  ARR[19] = A => {
    A.mel((t, m, d) => I.chip(A, t, m, d * .9, .07, 'pulse25'));
    for (let s = 0; s < 48; s++) { const ch = A.chord(Math.floor(s / 8), 1, 3); I.chip(A, s * .125, ch[s % 3], .1, .035, 'pulse12'); }
    for (let s = 0; s < 24; s++) I.chip(A, A.T(s), A.root(Math.floor(s / 4), -1) + (s % 2 ? 12 : 0), .2, .14, 'triangle');
    for (let s = 0; s < 24; s++) play(A, drumArr('hat'), A.T(s), { vel: s % 4 === 2 ? .25 : .1, rate: s % 4 === 2 ? .5 : 1 });
    // 原创音效：跳、金币、1UP
    syn(A, 2.2, 72, .15, { type: 'pulse25', vel: .08, glide: -12, cut: 9000, a: .001 });
    [2.27, 2.375, 2.48, 2.585, 2.69].forEach(t => { I.chip(A, t, 95, .06, .06, 'pulse25'); I.chip(A, t + .06, 100, .12, .06, 'pulse25'); });
    [84, 88, 91, 96, 93, 98].forEach((m, i) => I.chip(A, 3.0 + i * .07, m, .07, .08, 'pulse25'));
    bike(A, { chain: .03, bellM: 96 });
  };
  // 20 赛博朋克：暗色合成器贝斯、电子鼓、雨声
  ARR[20] = A => {
    play(A, drumArr('rain'), 0, { vel: .22, lp: 5000, dur: 6.2 });
    for (let s = 0; s < 48; s++) { const r = A.root(Math.floor(s / 8), -1); I.bass(A, s * .125, s % 4 === 3 ? r + 12 : r, .1, .18, { cut: 220, fenv: 1300, q: 6, fdec: .06 }); }
    for (let s = 0; s < 24; s++) { const t = A.T(s); if (s % 4 === 0 || s === 11 || s === 19) I.drum(A, 'kick', t, .6); if (s % 4 === 2) I.drum(A, 'clap', t, .35, { rev: .3 }); I.drum(A, 'hat', t + .125, .08, { pan: .4 }); }
    for (let h = 0; h < 6; h++) A.chord(h, 0, 3).forEach(m => syn(A, h, m, 1, { type: 'sawtooth', n: 2, det: 15, vel: .025, a: .2, cut: 900, rev: .4 }));
    A.mel((t, m, d) => I.lead(A, t, m, d * .9, .08, { delay: .375, cut: 1500 }), n => n[0] < 10 || n[0] >= 14);
    syn(A, 2.25, 100, .05, { type: 'square', vel: .05 }); syn(A, 2.3, 88, .05, { type: 'square', vel: .05 });
    I.bell(A, 'metal', 2.7, 76, .12);
    bike(A, { chain: .04, chainHp: 4000 });
  };
  // 21 蒸汽波：原创 80 年代商场爵士 → 放慢的商场磁带
  ARR[21] = async A => {
    const SRC_BPM = 150, sb = 60 / SRC_BPM / 2;   // 源素材的八分音符
    const len = 8.2;
    const sub = new OfflineAudioContext(2, Math.ceil(len * SR), SR);
    const B = Ctx(sub, { d: len }, 21); B.dur = len;
    B.T = s => .05 + s * sb;
    const key = 77; const mn = (d) => dm(d, key, 'maj');
    THEME.forEach(n => I.sax(B, B.T(n[0]), mn(n[2]), n[1] * sb * .95, .15));
    const R7 = [[0, 2, 4, 6, 8], [0, 2, 4, 6, 8], [5, 7, 9, 11, 13], [4, 6, 8, 10, 12], [3, 5, 7, 9, 11], [4, 6, 8, 10, 12]];
    for (let h = 0; h < 6; h++) { [0, 3].forEach(s => R7[h].slice(1).forEach(d => I.epiano(B, B.T(h * 4 + s), mn(d) - 12, sb * 2, .06))); }
    for (let s = 0; s < 24; s++) { const r = mn(R7[Math.floor(s / 4)][0]) - 36; syn(B, B.T(s), r + [0, 7, 12, 7][s % 4], sb * .95, { type: 'sine', vel: .2, a: .02, d: .2, s: .8, glide: -1, cut: 800, rev: 0 }); }
    for (let s = 0; s < 24; s++) { I.drum(B, 'hat', B.T(s), .06, { lp: 7000 }); if (s % 4 === 2) I.drum(B, 'snare', B.T(s), .14, { lp: 3000 }); if (s % 4 === 0) I.drum(B, 'kick', B.T(s), .3); }
    const src = await sub.startRendering();
    // 放慢：速度和音高一起降下来；跳针：2.5–3.5 半拍循环四次
    const ac = A.ac;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = .5;
    const g = ac.createGain(); g.gain.value = 1.1; lp.connect(g); g.connect(A.out); const sg = ac.createGain(); sg.gain.value = .9; g.connect(sg); sg.connect(A.rev);
    const wow = ac.createOscillator(); wow.frequency.value = .55; const wg = ac.createGain(); wg.gain.value = 22; wow.connect(wg); wow.start(0); wow.stop(A.dur + 1);
    const mkSrc = (t, off, durS, ramp) => {
      const s = ac.createBufferSource(); s.buffer = src; wg.connect(s.detune);
      const gg = ac.createGain(); gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(1, t + .01);
      s.connect(gg); gg.connect(lp);
      if (ramp === 'in') { s.playbackRate.setValueAtTime(1, t); s.playbackRate.linearRampToValueAtTime(.8, t + .5); }
      else s.playbackRate.setValueAtTime(.8, t);
      s.start(t, off); if (durS) { gg.gain.setValueAtTime(1, t + durS - .01); gg.gain.linearRampToValueAtTime(0, t + durS); s.stop(t + durS + .01); }
      return s;
    };
    mkSrc(0, 0, 2.5, 'in');
    for (let i = 0; i < 4; i++) mkSrc(2.5 + i * .25, 2.05, .25);
    const tail = mkSrc(3.5, 2.85, 0);
    tail.playbackRate.setValueAtTime(.8, 5.5); tail.playbackRate.linearRampToValueAtTime(1.0, 6.0);
    const tg = ac.createGain(); tg.gain.value = 1; tail.stop(6.3);
    play(A, drumArr('tape'), 0, { vel: .08, lp: 3000, dur: 6.2 });
    play(A, drumArr('crackle'), 0, { vel: .15, dur: 6 });
    bike(A, { chain: .025, bellM: 84 });
  };
  // 22 故障艺术：切片与比特压缩，主旋律被打碎再重组
  ARR[22] = async A => {
    const len = 6.6;
    const sub = new OfflineAudioContext(2, Math.ceil(len * SR), SR);
    const B = Ctx(sub, { d: len }, 22); B.dur = len;
    B.mel((t, m, d) => I.lead(B, t, m, d * .9, .11, { cut: 2000, n: 2 }));
    for (let s = 0; s < 24; s++) { const t = B.T(s); if (s % 4 === 0 || s % 8 === 3) I.drum(B, 'kick', t, .6); if (s % 4 === 2) I.drum(B, 'snare', t, .4); I.drum(B, 'hat', t + .125, .1); I.bass(B, t, B.root(Math.floor(s / 4), -1), .2, .2, { cut: 400 }); }
    const r = await sub.startRendering();
    const L = r.getChannelData(0), Rr = r.getChannelData(1), n = Math.floor(A.dur * SR);
    const oL = new Float32Array(n + SR), oR = new Float32Array(n + SR);
    const H = rng(2222), sl = Math.floor(.125 * SR);
    for (let k = 0; k * sl < n; k++) {
      const t = k * .125; let srcK = k; const mode = H();
      const frozen = t >= 2.6 && t < 3.0;
      if (frozen) srcK = Math.floor(2.6 / .125);
      else if (t < 4 && mode < .22) srcK = Math.max(0, k - 1 - Math.floor(H() * 2));
      const rev = !frozen && t < 4 && mode > .9;
      const crush = t < 4 ? (mode > .55 ? 6 : 0) : (t < 5 ? 3 : 0), bits = t < 4 ? 5 : 8;
      let hold = 0, hl = 0, hr = 0;
      for (let i = 0; i < sl; i++) {
        const di = k * sl + i; if (di >= n) break;
        let si = srcK * sl + (rev ? sl - 1 - i : i); if (frozen) si = srcK * sl + (i % 330);
        if (si >= L.length) continue;
        if (crush) { if (hold-- <= 0) { hold = crush; hl = L[si]; hr = Rr[si]; } } else { hl = L[si]; hr = Rr[si]; }
        const q = Math.pow(2, bits);
        const env = Math.min(1, i / 60, (sl - i) / 60);
        oL[di] = Math.round(hl * q) / q * env; oR[di] = Math.round(hr * q) / q * env;
      }
    }
    const b = A.ac.createBuffer(2, n, SR); b.copyToChannel(oL.subarray(0, n), 0); b.copyToChannel(oR.subarray(0, n), 1);
    const s = A.ac.createBufferSource(); s.buffer = b; const g = A.ac.createGain(); g.gain.value = .9; s.connect(g); g.connect(A.out); s.start(0);
    // 报错音（原创）
    [[3.0, 64], [3.0, 70], [3.12, 63]].forEach(([t, m]) => syn(A, t, m, .25, { type: 'square', vel: .06, cut: 2000, a: .002, d: .3, s: .2 }));
    for (let i = 0; i < 12; i++) syn(A, 2.6 + i * .033, 100 - (i * 7) % 30, .02, { type: 'square', vel: .03, a: .001, s: 0, d: .01 });
    bike(A, { chain: .04, chainRate: 1.5 });
  };
  // 片尾：所有版块的乐器齐奏主旋律，冲线定格时收住，只留齐响的车铃
  ARR[23] = A => {
    A.nkey = 72; A.nmode = 'maj';
    const pass = (off, upto) => {
      THEME.forEach(n => {
        if (n[0] >= upto) return;
        const t = off + n[0] * STEP, m = dm(n[2], 72, 'maj'), d = n[1] * STEP;
        I.brass(A, t, m, d * .95, .07); I.strings(A, t, m + 12, d, .03); I.flute(A, t, m + 12, d, .06);
        I.chip(A, t, m, d * .9, .03, 'pulse25'); I.bell(A, 'glock', t, m + 12, .08, { pan: .3 }); I.pluck(A, t, m - 12, .12, { bright: .9, decay: .985, len: .4, pan: -.3 });
        I.piano(A, t, m, .14); I.choir(A, t, m - 12, d, .04); I.accordion(A, t, m, d * .9, .03); I.bell(A, 'xylo', t, m, .08, { pan: -.4 });
      });
      for (let h = 0; h < 6; h++) { const t = off + h; if (off + h >= 10) continue; const ch = [0, 0, 5, 4, 3, 4][h]; [0, 2, 4].forEach(d => I.strings(A, t, dm(ch + d, 72, 'maj') - 12, 1, .04)); I.bass(A, t, dm(ch, 72, 'maj') - 36, .9, .2, { cut: 400 }); I.sub(A, t, dm(ch, 72, 'maj') - 36, .9, .12); }
    };
    pass(0, 24); pass(6, 16);
    I.drum(A, 'crash', 0, .35); I.drum(A, 'crash', 6, .3);
    for (let b = 0; b < 20; b++) { const t = b * .5; I.drum(A, 'kick', t, .5); if (b % 2) { I.drum(A, 'snare', t, .35); I.drum(A, 'clap', t, .2); } I.drum(A, 'hat', t + .25, .1); I.drum(A, 'taiko', t, b % 4 === 0 ? .2 : 0); }
    for (let i = 0; i < 16; i++) I.drum(A, 'snare', 9 + i * .0625, .1 + i * .02);
    // 冲线：最后一记和弦 + 22 只车铃齐响
    [48, 60, 64, 67, 72, 76].forEach(m => { I.brass(A, 10, m, .25, .06); I.piano(A, 10, m, .14); });
    I.drum(A, 'crash', 10, .3); I.drum(A, 'kick', 10, .6); I.drum(A, 'shutter', 9.98, .4);
    const bellNotes = [72, 76, 79, 84, 88, 91, 96, 100, 74, 81, 86, 93, 77, 83, 89, 95, 79, 84, 88, 91, 96, 100];
    const types = ['bike', 'glock', 'celesta', 'toy', 'chime', 'vibes', 'musicbox', 'bike', 'xylo', 'bike', 'glock', 'chime'];
    bellNotes.forEach((m, i) => { const ty = types[i % types.length]; I.bell(A, ty, 10.0 + (i % 4) * .012, m, .06, { pan: (i / 21 - .5) * 1.4, rev: .5 }); I.bell(A, ty, 11.0 + (i % 4) * .012, m + (i % 2 ? 0 : 12), .045, { pan: (.5 - i / 21) * 1.4, rev: .5 }); });
    const n = 80; for (let i = 0; i < n; i++) I.drum(A, 'chain', i * .125, .05 * (i % 2 ? .5 : 1), { hp: 2500 });
  };

  /* ---------- 渲染 ---------- */
  async function renderSeg(i) {
    const sg = SEGA[i], len = sg.d + TAIL;
    const ac = new OfflineAudioContext(2, Math.ceil(len * SR), SR);
    const A = Ctx(ac, sg, i);
    const tm = performance.now();
    try { await ARR[i](A); } catch (e) { console.error('arr', i, e); }
    api.mainMs = (api.mainMs || []); api.mainMs[i] = Math.round(performance.now() - tm);
    const b = await ac.startRendering();
    return b;
  }
  let renderPromise = null, doneN = 0;
  const waiters = [];
  api.init = function () {
    if (renderPromise) return renderPromise;
    renderPromise = (async () => {
      for (let i = 0; i < SEGA.length; i++) {
        bufs[i] = await renderSeg(i); doneN++;
        if (api.onProgress) api.onProgress(doneN, SEGA.length);
        if (api.ctx && playing) scheduleSeg(i);
        await new Promise(r => setTimeout(r, 0));
      }
    })();
    return renderPromise;
  };
  /* ---------- 实时播放（拖动进度即重新排程） ---------- */
  let playing = false, sources = [], playT0 = 0;
  function scheduleSeg(i) {
    const b = bufs[i]; if (!b || !api.ctx) return;
    const sg = SEGA[i], now = api.ctx.currentTime;
    const startAt = Math.max(now + .03, api.t0ctx);
    const off = playT0 + (startAt - api.t0ctx) - sg.s;
    if (off >= b.duration) return;
    const src = api.ctx.createBufferSource(); src.buffer = b; src.connect(api.out);
    if (off < 0) src.start(api.t0ctx + (sg.s - playT0)); else src.start(startAt, off);
    sources.push(src);
  }
  api.start = async function (t) {
    try {
      if (!api.ctx) { api.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' }); api.out = api.ctx.createGain(); api.out.gain.value = .95; api.out.connect(api.ctx.destination); }
      if (api.ctx.state !== 'running') await Promise.race([api.ctx.resume(), new Promise(r => setTimeout(r, 400))]);
      if (api.ctx.state !== 'running') return false;
    } catch (e) { return false; }
    api.init();
    playing = true; playT0 = t; api.t0ctx = api.ctx.currentTime + .05;
    for (let i = 0; i < SEGA.length; i++) if (bufs[i]) scheduleSeg(i);
    return true;
  };
  api.stop = function () { playing = false; sources.forEach(s => { try { s.stop(); } catch (e) { } }); sources = []; };
  /* ---------- 导出：整支片子的 WAV ---------- */
  api.wav = async function () {
    await api.init();
    const n = Math.round(TOTAL * SR), L = new Float32Array(n), Rr = new Float32Array(n);
    SEGA.forEach((sg, i) => {
      const b = bufs[i]; if (!b) return; const o = Math.round(sg.s * SR);
      const l = b.getChannelData(0), r = b.getChannelData(1);
      for (let k = 0; k < b.length && o + k < n; k++) { L[o + k] += l[k]; Rr[o + k] += r[k]; }
    });
    const buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, SR, true); v.setUint32(28, SR * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * 4, true);
    let p = 44;
    for (let i = 0; i < n; i++) { const a = Math.tanh(L[i] * 1.05), b = Math.tanh(Rr[i] * 1.05); v.setInt16(p, Math.round(clamp(a, -1, 1) * 32767), true); v.setInt16(p + 2, Math.round(clamp(b, -1, 1) * 32767), true); p += 4; }
    return new Blob([buf], { type: 'audio/wav' });
  };
  api.SR = SR; api.bufs = bufs; api.SEGA = SEGA;
  return api;
})();
