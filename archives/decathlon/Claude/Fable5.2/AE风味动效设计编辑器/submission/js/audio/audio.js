// 声音：内置合成音色 → 离线渲染整段混音（编辑器自己生成的缓存）→ 播放时以音频时钟驱动画面，声画同步
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const SR = 44100;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const noiseCache = new WeakMap();
  function noiseBuf(ac) { let b = noiseCache.get(ac); if (b) return b; const n = Math.floor(ac.sampleRate * 2); b = ac.createBuffer(1, n, ac.sampleRate); const d = b.getChannelData(0); let s = 22222; for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; } noiseCache.set(ac, b); return b; }
  function env(g, t, a, peak, d, sustain, dur, rel) { const p = g.gain; p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + Math.max(0.001, a)); if (sustain !== undefined && dur !== undefined) { p.setTargetAtTime(peak * sustain, t + a, Math.max(0.005, d / 3)); p.setTargetAtTime(0, t + Math.max(a + 0.01, dur), Math.max(0.01, (rel || 0.2) / 3)); return t + dur + (rel || 0.2) * 2 + 0.1; } p.setTargetAtTime(0, t + a, Math.max(0.005, d / 3.5)); return t + a + d * 2.2 + 0.05; }
  function osc(ac, type, f, t, end, dest, detune) { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (detune) o.detune.setValueAtTime(detune, t); o.connect(dest); o.start(t); o.stop(end); return o; }
  function noise(ac, t, end, dest) { const s = ac.createBufferSource(); s.buffer = noiseBuf(ac); s.loop = true; s.connect(dest); s.start(t, (t * 0.37) % 1.5); s.stop(end); return s; }
  function filt(ac, type, f, q) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = Math.min(f, ac.sampleRate * 0.45); b.Q.value = q === undefined ? 0.7 : q; return b; }

  const INST = {
    bell: { label: '铜磬', play(ac, out, t, dur, m, v, S) { const f = mtof(m); const dec = Math.max(0.2, S.decay * 2.2); [[1, 1, 1], [2.76, 0.5, 0.7], [5.4, 0.28, 0.45], [8.93, 0.14, 0.3], [0.5, 0.25, 1.2]].forEach(([r, a, dk], i) => { const g = ac.createGain(); const end = env(g, t, S.attack, v * a * 0.35 * (0.5 + S.tone * (i > 1 ? 1 : 0.5)), dec * dk); osc(ac, 'sine', f * r, t, end, g, i * 3); g.connect(out); }); } },
    anvil: { label: '锤击·铁砧', play(ac, out, t, dur, m, v, S) { const f = mtof(m); const dec = Math.max(0.08, S.decay);
      // 金属泛音（非谐波）
      [[1, 0.9, 1], [1.58, 0.7, 0.8], [2.24, 0.55, 0.65], [2.92, 0.5, 0.5], [3.87, 0.4, 0.4], [5.12, 0.3, 0.3], [6.73, 0.2, 0.22]].forEach(([r, a, dk], i) => { const g = ac.createGain(); const end = env(g, t, 0.001, v * a * 0.16 * (0.4 + S.tone), dec * dk * 1.6); osc(ac, i % 2 ? 'sine' : 'triangle', f * r, t, end, g, (i * 37) % 23 - 11); g.connect(out); });
      // 击打噪声
      const ng = ac.createGain(); const bp = filt(ac, 'bandpass', 3200 + S.tone * 2500, 0.9); const ne = env(ng, t, 0.0008, v * 0.9, 0.045); noise(ac, t, ne, bp); bp.connect(ng); ng.connect(out);
      // 低频冲击
      const tg = ac.createGain(); const te = env(tg, t, 0.002, v * 0.9, 0.16); const o = osc(ac, 'sine', 150, t, te, tg); o.frequency.exponentialRampToValueAtTime(48, t + 0.12); tg.connect(out); } },
    taiko: { label: '大鼓', play(ac, out, t, dur, m, v, S) { const f = mtof(m); const g = ac.createGain(); const end = env(g, t, 0.002, v * 1.0, Math.max(0.1, S.decay)); const o = osc(ac, 'sine', f * 2.4, t, end, g); o.frequency.exponentialRampToValueAtTime(Math.max(30, f), t + 0.07); const o2 = osc(ac, 'triangle', f * 1.5, t, end, g); o2.frequency.exponentialRampToValueAtTime(Math.max(30, f * 0.75), t + 0.1); g.connect(out);
      const ng = ac.createGain(); const lp = filt(ac, 'lowpass', 900 + S.tone * 3000, 0.5); const ne = env(ng, t, 0.001, v * 0.35, 0.05); noise(ac, t, ne, lp); lp.connect(ng); ng.connect(out); } },
    pad: { label: '铺底·弦', play(ac, out, t, dur, m, v, S) { const f = mtof(m); const g = ac.createGain(); const lp = filt(ac, 'lowpass', 300 + S.tone * 2600, 0.8); const a = Math.max(0.05, S.attack * 40); const end = env(g, t, a, v * 0.2, 0.3, 0.85, dur, Math.max(0.2, S.decay * 2)); lp.frequency.setValueAtTime(200 + S.tone * 600, t); lp.frequency.linearRampToValueAtTime(300 + S.tone * 2600, t + Math.max(a, dur * 0.6)); for (const [dt, ty] of [[-9, 'sawtooth'], [7, 'sawtooth'], [0, 'triangle'], [-1200, 'sine']]) osc(ac, ty, f, t, end, lp, dt); lp.connect(g); g.connect(out); } },
    bass: { label: '低音', play(ac, out, t, dur, m, v, S) { const f = mtof(m); const g = ac.createGain(); const lp = filt(ac, 'lowpass', 180 + S.tone * 900, 1.2); const end = env(g, t, Math.max(0.005, S.attack), v * 0.6, 0.2, 0.8, dur, Math.max(0.08, S.decay)); osc(ac, 'sine', f, t, end, lp); osc(ac, 'sawtooth', f, t, end, lp, 4); lp.connect(g); g.connect(out); } },
    pluck: { label: '拨弦', play(ac, out, t, dur, m, v, S) { const f = mtof(m); const g = ac.createGain(); const lp = filt(ac, 'lowpass', 6000, 1); const dec = Math.max(0.1, S.decay * 1.5); const end = env(g, t, 0.002, v * 0.4, dec); lp.frequency.setValueAtTime(1200 + S.tone * 7000, t); lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), t + dec); osc(ac, 'sawtooth', f, t, end, lp); osc(ac, 'triangle', f * 2, t, end, lp, 5); lp.connect(g); g.connect(out); } },
    hiss: { label: '淬火·嘶声', play(ac, out, t, dur, m, v, S) { const g = ac.createGain(); const hp = filt(ac, 'highpass', 1800, 0.5), bp = filt(ac, 'bandpass', 5200 + S.tone * 3000, 0.6); const end = env(g, t, Math.max(0.01, S.attack * 4), v * 0.55, Math.max(0.2, dur * 0.6 + S.decay)); bp.frequency.setValueAtTime(6500 + S.tone * 3000, t); bp.frequency.exponentialRampToValueAtTime(1800, t + dur + S.decay); noise(ac, t, end, hp); hp.connect(bp); bp.connect(g); g.connect(out); void m; } },
    whoosh: { label: '风箱·呼啸', play(ac, out, t, dur, m, v, S) { const g = ac.createGain(); const bp = filt(ac, 'bandpass', 300, 1.4); const peak = t + dur * 0.75; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.5, peak); g.gain.setTargetAtTime(0, peak, Math.max(0.03, S.decay / 4)); const f0 = mtof(m); bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f0 * (3 + S.tone * 6), peak); bp.frequency.exponentialRampToValueAtTime(f0 * 1.5, peak + S.decay); const end = peak + S.decay * 2 + 0.2; noise(ac, t, end, bp); bp.connect(g); g.connect(out); } },
    sub: { label: '低频冲击', play(ac, out, t, dur, m, v, S) { const f = mtof(m); const g = ac.createGain(); const end = env(g, t, 0.004, v * 1.1, Math.max(0.3, S.decay * 2)); const o = osc(ac, 'sine', f * 2, t, end, g); o.frequency.exponentialRampToValueAtTime(Math.max(24, f * 0.5), t + 0.5); g.connect(out); } },
    spark: { label: '火星·叮', play(ac, out, t, dur, m, v, S) { const f = mtof(m); const g = ac.createGain(); const end = env(g, t, 0.001, v * 0.25, Math.max(0.03, S.decay * 0.4)); osc(ac, 'sine', f * 4, t, end, g); osc(ac, 'sine', f * 6.3, t, end, g); const hp = filt(ac, 'highpass', 5000, 0.7); const ng = ac.createGain(); const ne = env(ng, t, 0.001, v * 0.2 * S.tone, 0.03); noise(ac, t, ne, hp); hp.connect(ng); ng.connect(out); g.connect(out); } },
  };

  function reverbIR(ac) { const len = Math.floor(ac.sampleRate * 2.4); const b = ac.createBuffer(2, len, ac.sampleRate); let s = 9973; for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let lp = 0; for (let i = 0; i < len; i++) { s = (s * 1664525 + 1013904223) >>> 0; const w = s / 2147483648 - 1; const tt = i / len; lp += (w - lp) * (0.55 - tt * 0.4); d[i] = lp * Math.pow(1 - tt, 2.6) * (i < 400 ? i / 400 : 1); } } return b; }
  // 把一个合成的音色图层排进音频图
  function schedule(ac, comp, layers, master, wet, sr) {
    for (const L of layers) {
      if (L.type !== 'audio' || !L.visible) continue; const S = L.audio.s; const inst = INST[S.inst] || INST.bell;
      const lg = ac.createGain(); const pan = ac.createStereoPanner ? ac.createStereoPanner() : null; const send = ac.createGain(); send.gain.value = MF.clamp(+S.reverb || 0, 0, 1);
      // 音量/声像可做关键帧或表达式
      const N = Math.max(2, Math.ceil(comp.duration * 30)); const vol = new Float32Array(N), pn = new Float32Array(N);
      for (let i = 0; i < N; i++) { const t = (i / (N - 1)) * comp.duration; vol[i] = Math.max(0, MF.Eval.val(L.audio.p.volume, t) / 100); pn[i] = MF.clamp(MF.Eval.val(L.audio.p.pan, t) / 100, -1, 1); }
      lg.gain.setValueCurveAtTime(vol, 0, comp.duration); if (pan) { pan.pan.setValueCurveAtTime(pn, 0, comp.duration); lg.connect(pan); pan.connect(master); pan.connect(send); } else { lg.connect(master); lg.connect(send); }
      if (wet) send.connect(wet);
      const st = { attack: +S.attack || 0.005, decay: +S.decay || 0.4, tone: S.tone === undefined ? 0.5 : +S.tone, reverb: +S.reverb || 0 };
      for (const n of S.notes) { const t = (L.start || 0) + n[0]; if (t < L.in - 1e-6 || t >= L.out || t < 0 || t >= comp.duration) continue; try { inst.play(ac, lg, t, Math.max(0.02, n[1]), n[2], MF.clamp(n[3] === undefined ? 0.8 : n[3], 0, 1.5), st); } catch (e) { console.warn('音符调度失败', e); } }
    }
    void sr;
  }
  function renderMix(comp, layers, sr, channels) {
    const len = Math.max(1, Math.ceil(comp.duration * sr)); const ac = new OfflineAudioContext(channels, len, sr);
    const master = ac.createGain(); master.gain.value = 0.8; const comp2 = ac.createDynamicsCompressor(); comp2.threshold.value = -10; comp2.ratio.value = 6; comp2.attack.value = 0.003; comp2.release.value = 0.2; master.connect(comp2); comp2.connect(ac.destination);
    let wet = null; if (channels === 2) { const cv = ac.createConvolver(); cv.buffer = reverbIR(ac); const wg = ac.createGain(); wg.gain.value = 0.7; cv.connect(wg); wg.connect(master); wet = cv; }
    schedule(ac, comp, layers, master, wet, sr); return ac.startRendering();
  }

  const Au = (MF.Audio = {
    instruments: INST, ctx: null, buffer: null, bufKey: '', rendering: false, src: null, peaks: new Map(), levels: null, _t0: 0, _run: false, pending: null,
    key(comp) { return comp ? JSON.stringify([comp.id, comp.duration, comp.layers.filter((l) => l.type === 'audio').map((l) => [l.visible, l.in, l.out, l.start, l.audio])]) : ''; },
    status() { if (Au.rendering) return '渲染中'; if (!Au.buffer) return '无音色层'; if (!Au.ctx) return '就绪·待首次交互'; return Au._run ? '播放中' : '就绪'; },
    ensureCtx() { if (!Au.ctx) { try { Au.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR }); } catch (e) { try { Au.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e2) { return null; } } } if (Au.ctx.state === 'suspended') Au.ctx.resume().catch(() => {}); return Au.ctx; },
    invalidate() { clearTimeout(Au._tm); Au._tm = setTimeout(() => Au.prepare(), 250); },
    // 重新渲染混音（内容未变则跳过）；返回 Promise
    prepare() {
      const App = MF.App; const comp = App.comp(); const key = Au.key(comp);
      if (key === Au.bufKey && (Au.buffer || !comp)) return Au.pending || Promise.resolve();
      if (!comp || !comp.layers.some((l) => l.type === 'audio')) { Au.buffer = null; Au.bufKey = key; Au.peaks.clear(); Au.levels = null; App.emit('audio'); return Promise.resolve(); }
      const mine = ++Au._gen; Au.rendering = true; MF.Shell && MF.Shell.refreshTop && MF.Shell.status && MF.Shell.refreshTop();
      const audioLayers = comp.layers.filter((l) => l.type === 'audio');
      Au.pending = renderMix(comp, audioLayers, SR, 2).then((buf) => {
        if (mine !== Au._gen) return; Au.buffer = buf; Au.bufKey = key; Au.rendering = false;
        // 电平（每 1/60 秒一个 RMS），用于界面电平表
        const n = Math.ceil(comp.duration * 60), lv = new Float32Array(n * 2); for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); const w = Math.floor(SR / 60); for (let i = 0; i < n; i++) { let s = 0; const o = i * w; for (let k = 0; k < w && o + k < d.length; k++) s += d[o + k] * d[o + k]; lv[i * 2 + ch] = Math.sqrt(s / w); } } Au.levels = lv;
        App.emit('audio'); if (MF.Shell && MF.Shell.status) MF.Shell.refreshTop();
        if (App.playing && Au._wantStart !== undefined) Au.start(Au._wantStart + (performance.now() - Au._wantWall) / 1000, true);
        // 各图层的波形摘要（低采样率单声道）
        let chain = Promise.resolve(); const pk = new Map();
        for (const L of audioLayers) chain = chain.then(() => renderMix(comp, [L], 11025, 1).then((b) => { if (mine !== Au._gen) return; const d = b.getChannelData(0); const m = Math.ceil(comp.duration * 120), p = new Float32Array(m), w = Math.floor(11025 / 120); for (let i = 0; i < m; i++) { let mx = 0; const o = i * w; for (let k = 0; k < w && o + k < d.length; k++) { const a = Math.abs(d[o + k]); if (a > mx) mx = a; } p[i] = mx; } pk.set(L.id, p); }));
        return chain.then(() => { if (mine === Au._gen) { Au.peaks = pk; App.emit('audio'); } });
      }).catch((e) => { console.warn('音频渲染失败', e); if (mine === Au._gen) Au.rendering = false; });
      return Au.pending;
    },
    _gen: 0,
    waveform(id) { return Au.peaks.get(id) || null; },
    level(t) { const lv = Au.levels; if (!lv) return [0, 0]; const i = MF.clamp(Math.floor(t * 60), 0, lv.length / 2 - 1); return [lv[i * 2], lv[i * 2 + 1]]; },
    // 从合成时间 t 开始播放（需在用户手势之后）
    start(t, late) {
      const ac = Au.ensureCtx(); Au.stop(true); if (!ac) return;
      if (!late) { Au._wantStart = t; Au._wantWall = performance.now(); }
      if (!Au.buffer || ac.state !== 'running') { if (ac.state !== 'running') ac.resume().then(() => { if (MF.App.playing && !Au._run) Au.start(Au._wantStart + (performance.now() - Au._wantWall) / 1000, true); }).catch(() => {}); return; }
      if (t >= Au.buffer.duration) return;
      const s = ac.createBufferSource(); s.buffer = Au.buffer; s.connect(ac.destination); const when = ac.currentTime + 0.03; s.start(when, Math.max(0, t)); Au.src = s;
      if (!late) { Au._t0 = when; Au._run = true; } else { Au._t0 = when - (t - Au._wantStart); Au._run = true; }
    },
    stop(keep) { if (Au.src) { try { Au.src.stop(); } catch (e) { /* 已停止 */ } Au.src.disconnect(); Au.src = null; } Au._run = false; if (!keep) Au._wantStart = undefined; },
    running() { return Au._run && Au.ctx && Au.ctx.state === 'running'; },
    elapsed() { return Math.max(0, Au.ctx.currentTime - Au._t0); },
    audition(L) { const ac = Au.ensureCtx(); if (!ac) return; const S = L.audio.s; const inst = INST[S.inst] || INST.bell; const g = ac.createGain(); g.gain.value = 0.7; g.connect(ac.destination); const st = { attack: +S.attack || 0.005, decay: +S.decay || 0.4, tone: S.tone === undefined ? 0.5 : +S.tone }; const notes = S.notes.length ? S.notes.slice().sort((a, b) => a[0] - b[0]).slice(0, 12) : [[0, 0.5, 60, 0.8]]; const t0 = notes[0][0]; for (const n of notes) inst.play(ac, g, ac.currentTime + 0.05 + Math.min(4, n[0] - t0), n[1], n[2], n[3], st); },
  });
  // 浏览器首次点击或按键后才允许出声
  const unlock = () => { Au.ensureCtx(); };
  window.addEventListener('pointerdown', unlock, { capture: true, once: false }); window.addEventListener('keydown', unlock, { capture: true });
})();
