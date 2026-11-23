/* audio.js — 内置音色合成（确定性）：锤击、炉火低鸣、火星、淬火、定音铃、上扬、书写；与时间线同步播放 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, Model = AE.Model;
  const A = AE.Audio = {};
  const SR = 32000; // 合成采样率（足够覆盖音色，节省计算）
  const TAU = Math.PI * 2;
  const P = (label, v, min, max, step) => ({ label, v, min, max, step: step || (max - min) / 100 });

  // 每个音色：render(out, sr, e, p, rng) 向 out（Float32Array 单声道）累加；e={t,v,p}
  const V = [];
  const voice = (id, name, params, render) => V.push({ id, name, params, render });
  const addNoiseLP = (rng, n, k) => { const o = new Float32Array(n); let y = 0; for (let i = 0; i < n; i++) { y += k * ((rng() * 2 - 1) - y); o[i] = y; } return o; };

  voice('anvil', '铁砧锤击', { base: P('基频(Hz)', 410, 120, 1200, 5), ring: P('余响(秒)', 1.5, 0.2, 4, 0.05), thump: P('低频冲击', 1, 0, 2, 0.05), bright: P('明亮度', 1, 0, 2, 0.05), crack: P('撞击噪声', 1, 0, 2, 0.05) }, (out, sr, e, p, rng) => {
    const i0 = Math.floor(e.t * sr); const n = Math.min(out.length - i0, Math.floor(sr * (p.ring + 0.5))); if (n <= 0) return; const v = e.v === undefined ? 1 : e.v; const pm = e.p || 1;
    const f0 = p.base * pm; const ratios = [1, 2.756, 5.404, 8.933, 12.1], amps = [0.5, 0.38, 0.24, 0.14, 0.09], dec = [1, 0.7, 0.45, 0.28, 0.16];
    const ph = ratios.map(() => rng() * TAU);
    for (let i = 0; i < n; i++) {
      const t = i / sr; let s = 0;
      for (let k = 0; k < 5; k++) s += Math.sin(TAU * f0 * ratios[k] * t + ph[k]) * amps[k] * Math.exp(-t / (dec[k] * p.ring * (k ? 1 : 1))) * (k > 1 ? p.bright : 1);
      const thump = Math.sin(TAU * (60 + 140 * Math.exp(-t * 30)) * t) * Math.exp(-t * 11) * 1.1 * p.thump;
      const crack = (rng() * 2 - 1) * Math.exp(-t * 180) * 0.9 * p.crack + (rng() * 2 - 1) * Math.exp(-t * 40) * 0.25 * p.crack;
      out[i0 + i] += (s * 0.55 + thump + crack) * v;
    }
  });
  voice('drone', '炉火低鸣', { freq: P('基频(Hz)', 48, 25, 160, 1), len: P('持续(秒)', 10, 0.5, 30, 0.5), swell: P('渐强(秒)', 3, 0.05, 10, 0.05), cutoff: P('亮度', 0.12, 0.02, 0.6, 0.01), rumble: P('呼啸', 0.6, 0, 2, 0.05) }, (out, sr, e, p, rng) => {
    const i0 = Math.floor(e.t * sr); const n = Math.min(out.length - i0, Math.floor(sr * p.len)); if (n <= 0) return; const v = e.v === undefined ? 1 : e.v; const f = p.freq * (e.p || 1);
    let lp = 0, lp2 = 0; const ph = [0, 1.3, 2.1, 4.4]; const det = [1, 1.004, 0.497, 2.006];
    for (let i = 0; i < n; i++) {
      const t = i / sr; const env = Math.min(1, t / p.swell) * Math.min(1, (p.len - t) / 1.5); let s = 0;
      for (let k = 0; k < 4; k++) { ph[k] += TAU * f * det[k] / sr; s += ((ph[k] / TAU) % 1 * 2 - 1) * (k === 2 ? 0.7 : 0.4); }
      lp += p.cutoff * (s - lp); lp2 += 0.04 * ((rng() * 2 - 1) - lp2);
      const lfo = 0.75 + 0.25 * Math.sin(TAU * 0.23 * t + 1) * Math.sin(TAU * 0.07 * t);
      out[i0 + i] += (lp * 0.9 + lp2 * 2.6 * p.rumble * (0.6 + 0.4 * Math.sin(TAU * 0.5 * t))) * env * lfo * v * 0.5;
    }
  });
  voice('sparkle', '火星迸溅', { count: P('颗数', 26, 3, 120, 1), span: P('持续(秒)', 0.9, 0.1, 3, 0.05), pitch: P('音高(Hz)', 3200, 600, 8000, 50), decay: P('衰减', 1, 0.3, 3, 0.05) }, (out, sr, e, p, rng) => {
    const v = e.v === undefined ? 1 : e.v; const N = Math.round(p.count * v);
    for (let k = 0; k < N; k++) {
      const tk = e.t + Math.pow(rng(), 1.6) * p.span; const i0 = Math.floor(tk * sr); const len = Math.floor(sr * (0.012 + rng() * 0.03) * p.decay); const f = p.pitch * (0.5 + rng() * 1.2) * (e.p || 1); const a = (0.12 + rng() * 0.25) * v;
      for (let i = 0; i < len && i0 + i < out.length; i++) { const t = i / sr; const env = Math.exp(-t / (0.008 * p.decay)); out[i0 + i] += ((rng() * 2 - 1) * 0.6 + Math.sin(TAU * f * t)) * env * a * 0.5; }
    }
  });
  voice('hiss', '淬火嘶声', { len: P('长度(秒)', 2.2, 0.3, 8, 0.1), bright: P('亮度', 0.5, 0.05, 1, 0.01), level: P('音量', 0.8, 0, 2, 0.05) }, (out, sr, e, p, rng) => {
    const i0 = Math.floor(e.t * sr); const n = Math.min(out.length - i0, Math.floor(sr * p.len)); if (n <= 0) return; const v = e.v === undefined ? 1 : e.v; let a = 0, b = 0;
    for (let i = 0; i < n; i++) { const t = i / sr; const env = Math.pow(Math.min(1, t / 0.04), 1) * Math.exp(-t / (p.len * 0.38)); const x = rng() * 2 - 1; a += p.bright * (x - a); b += 0.5 * (a - b); out[i0 + i] += (a - b) * 2.2 * env * v * p.level * (0.8 + 0.2 * Math.sin(t * 80)); }
  });
  voice('bell', '定音铃', { base: P('基频(Hz)', 261, 80, 1000, 1), decay: P('余响(秒)', 3.2, 0.3, 8, 0.1), warm: P('温暖度', 0.6, 0, 1, 0.01) }, (out, sr, e, p, rng) => {
    const i0 = Math.floor(e.t * sr); const n = Math.min(out.length - i0, Math.floor(sr * p.decay * 1.4)); if (n <= 0) return; const v = e.v === undefined ? 1 : e.v; const f0 = p.base * (e.p || 1);
    const parts = [[1, 0.6, 1], [2, 0.3 * p.warm + 0.1, 0.6], [2.4, 0.22, 0.45], [3, 0.16, 0.35], [4.2, 0.12, 0.22], [5.95, 0.06, 0.12]];
    for (let i = 0; i < n; i++) { const t = i / sr; let s = 0; for (const [r, a, d] of parts) s += Math.sin(TAU * f0 * r * t) * a * Math.exp(-t / (p.decay * d)); out[i0 + i] += s * Math.min(1, t / 0.004) * v * 0.55; }
  });
  voice('rise', '蓄势上扬', { len: P('长度(秒)', 1.2, 0.2, 5, 0.05), f0: P('起始(Hz)', 140, 40, 800, 5), f1: P('终止(Hz)', 900, 100, 3000, 5), noise: P('噪声', 0.5, 0, 1, 0.05) }, (out, sr, e, p, rng) => {
    const i0 = Math.floor(e.t * sr); const n = Math.min(out.length - i0, Math.floor(sr * p.len)); if (n <= 0) return; const v = e.v === undefined ? 1 : e.v; let ph = 0, lp = 0;
    for (let i = 0; i < n; i++) { const u = i / n; const f = p.f0 * Math.pow(p.f1 / p.f0, u * u); ph += TAU * f / sr; const env = Math.pow(u, 2.2) * (1 - Math.pow(u, 14)); lp += (0.1 + 0.5 * u) * ((rng() * 2 - 1) - lp); out[i0 + i] += (Math.sin(ph) * 0.35 + ((ph / TAU) % 1 * 2 - 1) * 0.12 + lp * p.noise) * env * v * 0.7; }
  });
  voice('scribe', '笔画沙沙', { len: P('每笔(秒)', 0.28, 0.05, 1, 0.01), tone: P('音调', 0.35, 0.05, 0.9, 0.01), level: P('音量', 1, 0, 2, 0.05) }, (out, sr, e, p, rng) => {
    const i0 = Math.floor(e.t * sr); const n = Math.min(out.length - i0, Math.floor(sr * p.len)); if (n <= 0) return; const v = e.v === undefined ? 1 : e.v; let a = 0, b = 0; const k = p.tone * (e.p || 1);
    for (let i = 0; i < n; i++) { const u = i / n; const env = Math.sin(Math.PI * Math.min(1, u * 1.1)) * (0.6 + 0.4 * u); const x = rng() * 2 - 1; a += Math.min(0.95, k * (0.6 + u)) * (x - a); b += 0.08 * (a - b); out[i0 + i] += (a - b) * 1.4 * env * v * p.level + Math.sin(TAU * (700 + 900 * u) * i / sr) * 0.025 * env * v; }
  });
  A.VOICES = V;
  const voiceOf = id => V.find(x => x.id === id) || V[0];

  let ctx = null, src = null, cache = null;
  A.invalidate = () => { cache = null; };
  A.sig = (comp) => JSON.stringify(comp.layers.filter(l => l.type === 'audio').map(l => [l.id, l.au, l.in, l.out, l.visible, l.props['au.level'], l.props['au.pan'], l.solo])) + comp.dur;
  // 渲染合成内所有音色图层 → {L,R,sr}
  A.mix = (project, comp, ev) => {
    const sig = A.sig(comp) + (ev ? ev.getRev() : ''); if (cache && cache.sig === sig && cache.comp === comp.id) return cache;
    const n = Math.ceil(comp.dur * SR) + SR; const L = new Float32Array(n), R = new Float32Array(n);
    const layers = comp.layers.filter(l => l.type === 'audio' && l.visible); const anySolo = comp.layers.some(l => l.solo && l.type === 'audio');
    for (const lay of layers) {
      if (anySolo && !lay.solo) continue;
      const v = voiceOf(lay.au.voice); const params = {}; for (const [k, d] of Object.entries(v.params)) params[k] = lay.au.params[k] !== undefined ? lay.au.params[k] : d.v;
      const buf = new Float32Array(n);
      lay.au.events.forEach((e, i) => { if (e.t < lay.in - 1e-6 || e.t >= lay.out) return; const rng = U.rng(U.hash2((lay.au.seed || 1) | 0, i * 131 + 7)); v.render(buf, SR, e, params, rng); });
      // 增益与声像包络（20Hz 采样）
      const evr = ev || AE.App.ev; const steps = Math.ceil(comp.dur * 40) + 2; const g = new Float32Array(steps), pn = new Float32Array(steps);
      for (let s = 0; s < steps; s++) { const t = s / 40; const act = t >= lay.in && t < lay.out ? 1 : 0; g[s] = act * Math.pow(10, evr.value(comp, lay, 'au.level', t) / 20); pn[s] = evr.value(comp, lay, 'au.pan', t); }
      for (let i = 0; i < n; i++) { const f = i / SR * 40; const s0 = Math.floor(f), fr = f - s0; const gg = g[Math.min(steps - 1, s0)] * (1 - fr) + g[Math.min(steps - 1, s0 + 1)] * fr; const pp = pn[Math.min(steps - 1, s0)]; const x = buf[i] * gg; L[i] += x * Math.cos((pp + 1) * Math.PI / 4); R[i] += x * Math.sin((pp + 1) * Math.PI / 4); }
    }
    for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i] * 0.9) ; R[i] = Math.tanh(R[i] * 0.9); }
    cache = { sig, comp: comp.id, L, R, sr: SR, n }; return cache;
  };
  A.ensureCtx = () => { if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); } if (ctx.state === 'suspended') ctx.resume(); return ctx; };
  A.play = (project, comp, from) => {
    A.stop(); const c = A.ensureCtx(); if (!c) return; if (!comp.layers.some(l => l.type === 'audio')) return;
    const m = A.mix(project, comp, AE.App.ev); const buf = c.createBuffer(2, m.n, m.sr); buf.copyToChannel(m.L, 0); buf.copyToChannel(m.R, 1);
    src = c.createBufferSource(); src.buffer = buf; const gn = c.createGain(); gn.gain.value = 0.9; src.connect(gn); gn.connect(c.destination); src.start(0, Math.max(0, from)); src.onended = () => { };
  };
  A.stop = () => { if (src) { try { src.stop(); } catch (e) { } try { src.disconnect(); } catch (e) { } src = null; } };
  A.preview = (L) => {
    const c = A.ensureCtx(); if (!c) return; const comp = AE.App.comp; const v = voiceOf(L.au.voice); const params = {}; for (const [k, d] of Object.entries(v.params)) params[k] = L.au.params[k] !== undefined ? L.au.params[k] : d.v;
    const dur = Math.min(8, Math.max(2, (L.au.events.length ? Math.max(...L.au.events.map(e => e.t)) : 0) + 3)); const n = Math.floor(dur * SR); const buf = new Float32Array(n);
    const evs = L.au.events.length ? L.au.events : [{ t: 0.1, v: 1, p: 1 }]; const t0 = Math.min(...evs.map(e => e.t)); evs.forEach((e, i) => v.render(buf, SR, Object.assign({}, e, { t: e.t - t0 + 0.05 }), params, U.rng(U.hash2((L.au.seed || 1) | 0, i * 131 + 7))));
    for (let i = 0; i < n; i++) buf[i] = Math.tanh(buf[i] * 0.9);
    const ab = c.createBuffer(1, n, SR); ab.copyToChannel(buf, 0); A.stop(); src = c.createBufferSource(); src.buffer = ab; src.connect(c.destination); src.start();
  };
  // 取某时刻附近的"能量"（用于界面/调试）
  A.levelAt = (m, t) => { const i = Math.floor(t * m.sr); let s = 0; for (let k = 0; k < 400 && i + k < m.n; k++) s += Math.abs(m.L[i + k]); return s / 400; };
})();
