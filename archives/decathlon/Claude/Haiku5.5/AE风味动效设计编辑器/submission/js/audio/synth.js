/* 音色：内置的实时合成音色（锤击 / 火星 / 炉火底噪 / 音调），按合成时间与播放同步。
 * 首次点击或按键后才会创建 AudioContext（浏览器要求用户手势）。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const Audio = (AE.Audio = {});

  Audio.INSTRUMENTS = [
    ['hit', '锤击（金属撞击）'],
    ['spark', '火星（噼啪）'],
    ['bed', '炉火底噪'],
    ['tone', '音调'],
  ];

  let ctx = null, master = null, noiseBuf = null;
  let running = false;
  const scheduled = new Set();
  let live = [];

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
      // 白噪声缓冲
      const len = ctx.sampleRate * 2;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // 各音色的合成
  function noise(when, dur, filterType, freq, q, gain) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(when, Math.random());
    src.stop(when + dur + 0.05);
    live.push(src);
  }
  function osc(when, freq, dur, gain, type) {
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, when);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(master);
    o.start(when);
    o.stop(when + dur + 0.05);
    live.push(o);
  }

  const VOICES = {
    // 锤击：基频 + 非整数倍泛音（金属感）+ 噪声冲击
    hit(when, pitch, gain) {
      const base = 118 * pitch;
      osc(when, base, 1.1, 0.55 * gain);
      osc(when, base * 2.76, 0.55, 0.18 * gain);
      osc(when, base * 5.4, 0.25, 0.07 * gain);
      noise(when, 0.05, 'bandpass', 2600 * pitch, 0.9, 0.9 * gain);
    },
    spark(when, pitch, gain) {
      const d = 0.05 + Math.random() * 0.06;
      noise(when, d, 'highpass', (3200 + Math.random() * 2000) * pitch, 0.7, 0.22 * gain);
    },
    bed(when, pitch, gain, dur) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 520 * pitch;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.11 * gain, when + 1.2);
      g.gain.linearRampToValueAtTime(0.11 * gain, when + Math.max(1, dur - 1.5));
      g.gain.linearRampToValueAtTime(0.0001, when + dur);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(when);
      src.stop(when + dur + 0.1);
      live.push(src);
    },
    tone(when, pitch, gain, dur) {
      osc(when, 330 * pitch, dur || 0.6, 0.25 * gain, 'triangle');
    },
  };

  // 调度：从当前合成时间起，把未来 0.4 秒内的音效排入 WebAudio 时间线
  Audio.onTick = (t) => {
    if (!running || !ctx || !AE.App.comp()) return;
    const comp = AE.App.comp();
    const horizon = t + 0.4;
    comp.layers.forEach((L) => {
      if (L.type !== 'sound' || !L.enabled || !L.sound) return;
      const vol = AE.Anim.value(comp, L, L.sound.volume, t) / 100;
      L.sound.events.forEach((ev, i) => {
        const te = ev.t + (L.startTime || 0);
        if (te < t - 0.02 || te > horizon) return;
        const key = L.id + ':' + i + ':' + te.toFixed(3);
        if (scheduled.has(key)) return;
        scheduled.add(key);
        const when = ctx.currentTime + Math.max(0, te - t);
        const pitch = ev.pitch || 1;
        const gain = (ev.gain === undefined ? 1 : ev.gain) * vol;
        const fn = VOICES[L.sound.instrument] || VOICES.hit;
        fn(when, pitch, gain, ev.dur || 15);
      });
    });
    // 清理已播放的节点
    if (live.length > 300) live = live.slice(-100);
  };
  Audio.start = (t) => {
    if (!ensure()) return;
    running = true;
    scheduled.clear();
    Audio.onTick(t);
  };
  Audio.stop = () => {
    running = false;
    live.forEach((n) => {
      try {
        n.stop();
      } catch (e) {
        // 已结束
      }
    });
    live = [];
    scheduled.clear();
  };
  // 预听（不依赖时间线）
  Audio.preview = (inst, pitch) => {
    if (!ensure()) return;
    const fn = VOICES[inst] || VOICES.hit;
    fn(ctx.currentTime + 0.02, pitch || 1, 1, 1.2);
  };
  Audio.ready = () => !!ctx;
})();
