/* 动态路由塔防 —— 声音：WebAudio 程序化合成（音乐、环境声、音效），音量设置与静音 */
window.G = window.G || {};
(function () {
  'use strict';
  const A = {
    ctx: null, master: null, musicGain: null, sfxGain: null, ambGain: null, ready: false, muted: false,
    vol: { master: 0.8, music: 0.55, sfx: 0.8, amb: 0.5 },
    theme: null, musicTimer: null, step: 0, nodes: [],
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
      this.ambGain = this.ctx.createGain(); this.ambGain.connect(this.master);
      // 压缩器避免爆音
      const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2; this.master.disconnect(); this.master.connect(comp); comp.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise(2);
      this.applyVolumes(); this.ready = true;
      if (this.theme) this.startMusic(this.theme);
    },
    makeNoise(sec) { const n = Math.floor(this.ctx.sampleRate * sec); const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; },
    applyVolumes() { if (!this.ctx) return; const m = this.muted ? 0 : 1; this.master.gain.value = this.vol.master * m; this.musicGain.gain.value = this.vol.music; this.sfxGain.gain.value = this.vol.sfx; this.ambGain.gain.value = this.vol.amb; },
    setVol(k, v) { this.vol[k] = v; this.applyVolumes(); this.save(); },
    setMuted(m) { this.muted = m; this.applyVolumes(); this.save(); },
    save() { try { localStorage.setItem('td_audio', JSON.stringify({ vol: this.vol, muted: this.muted })); } catch (e) { } },
    load() { try { const s = localStorage.getItem('td_audio'); if (s) { const o = JSON.parse(s); Object.assign(this.vol, o.vol || {}); this.muted = !!o.muted; } } catch (e) { } },
    // ---------- 基础合成 ----------
    osc(type, f, t0, dur, gain, dest, opts) {
      opts = opts || {}; const c = this.ctx; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0); if (opts.f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.f2), t0 + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + (opts.atk || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      let node = o; if (opts.filter) { const fl = c.createBiquadFilter(); fl.type = opts.filter; fl.frequency.value = opts.ff || 1200; fl.Q.value = opts.q || 1; node.connect(fl); node = fl; }
      node.connect(g); g.connect(dest || this.sfxGain); o.start(t0); o.stop(t0 + dur + 0.05); return o;
    },
    noise(t0, dur, gain, opts) {
      opts = opts || {}; const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + (opts.atk || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      let node = s; if (opts.filter) { const fl = c.createBiquadFilter(); fl.type = opts.filter; fl.frequency.setValueAtTime(opts.ff || 2000, t0); if (opts.ff2) fl.frequency.exponentialRampToValueAtTime(opts.ff2, t0 + dur); fl.Q.value = opts.q || 0.8; node.connect(fl); node = fl; }
      node.connect(g); g.connect(opts.dest || this.sfxGain); s.start(t0); s.stop(t0 + dur + 0.05);
    },
    play(name) {
      if (!this.ready || this.muted) return; const c = this.ctx; if (c.state === 'suspended') c.resume(); const t = c.currentTime + 0.005; const r = (a, b) => a + Math.random() * (b - a);
      switch (name) {
        case 'laser': this.osc('square', r(900, 1100), t, 0.09, 0.12, null, { f2: 300, filter: 'bandpass', ff: 1800, q: 2 }); break;
        case 'pulse': this.osc('sine', r(500, 600), t, 0.12, 0.12, null, { f2: 220 }); break;
        case 'pierce': this.osc('sawtooth', 1400, t, 0.25, 0.14, null, { f2: 200, filter: 'lowpass', ff: 2400 }); this.noise(t, 0.2, 0.08, { filter: 'highpass', ff: 3000 }); break;
        case 'flame': this.noise(t, 0.18, 0.1, { filter: 'lowpass', ff: 1800, ff2: 400 }); break;
        case 'die': this.osc('triangle', r(500, 700), t, 0.18, 0.1, null, { f2: 90 }); this.noise(t, 0.12, 0.06, { filter: 'bandpass', ff: 1200, q: 1.5 }); break;
        case 'bossDie': this.osc('sawtooth', 160, t, 1.6, 0.25, null, { f2: 30, filter: 'lowpass', ff: 800, ff2: 100 }); this.noise(t, 1.4, 0.25, { filter: 'lowpass', ff: 1200, ff2: 80 }); break;
        case 'towerHit': this.noise(t, 0.1, 0.1, { filter: 'bandpass', ff: 700, q: 1 }); this.osc('triangle', 180, t, 0.1, 0.1, null, { f2: 90 }); break;
        case 'towerDie': this.osc('sawtooth', 220, t, 0.7, 0.22, null, { f2: 40, filter: 'lowpass', ff: 1200, ff2: 200 }); this.noise(t, 0.6, 0.2, { filter: 'lowpass', ff: 1500, ff2: 150 }); break;
        case 'melee': this.noise(t, 0.08, 0.08, { filter: 'highpass', ff: 1500 }); this.osc('square', 140, t, 0.08, 0.08, null, { f2: 70 }); break;
        case 'siege': this.osc('sine', 90, t, 0.4, 0.25, null, { f2: 35 }); this.noise(t, 0.35, 0.15, { filter: 'lowpass', ff: 900, ff2: 100 }); break;
        case 'siegeTarget': this.osc('square', 300, t, 0.1, 0.08, null, { f2: 500 }); this.osc('square', 500, t + 0.11, 0.12, 0.08, null, { f2: 800 }); break;
        case 'encrypt': this.osc('square', 1200, t, 0.15, 0.07, null, { f2: 400, filter: 'bandpass', ff: 2000, q: 4 }); this.osc('square', 1240, t, 0.15, 0.05); break;
        case 'leak': this.osc('sawtooth', 440, t, 0.5, 0.18, null, { f2: 110, filter: 'lowpass', ff: 1500 }); this.osc('sawtooth', 415, t + 0.02, 0.5, 0.12, null, { f2: 100 }); break;
        case 'deploy': this.osc('sine', 300, t, 0.18, 0.14, null, { f2: 900 }); this.osc('sine', 600, t + 0.08, 0.2, 0.1, null, { f2: 1400 }); this.noise(t, 0.12, 0.06, { filter: 'highpass', ff: 2500 }); break;
        case 'sell': this.osc('sine', 800, t, 0.15, 0.1, null, { f2: 300 }); break;
        case 'upgrade': [0, 0.08, 0.16].forEach((d, i) => this.osc('triangle', 500 * Math.pow(1.25, i), t + d, 0.25, 0.12, null, { f2: 500 * Math.pow(1.25, i) * 1.5 })); break;
        case 'isolate': this.osc('sawtooth', 400, t, 0.6, 0.16, null, { f2: 60, filter: 'lowpass', ff: 2000, ff2: 200 }); this.noise(t, 0.5, 0.12, { filter: 'bandpass', ff: 800, q: 2 }); break;
        case 'reopen': this.osc('sine', 200, t, 0.4, 0.12, null, { f2: 800 }); this.osc('sine', 300, t + 0.1, 0.4, 0.1, null, { f2: 1200 }); break;
        case 'route': [0, 0.07, 0.14, 0.21].forEach((d, i) => this.osc('square', 700 + i * 180, t + d, 0.08, 0.07, null, { filter: 'bandpass', ff: 2000, q: 3 })); break;
        case 'reject': this.osc('square', 200, t, 0.12, 0.12, null, { f2: 150 }); this.osc('square', 150, t + 0.13, 0.18, 0.12, null, { f2: 100 }); break;
        case 'block': this.noise(t, 0.1, 0.1, { filter: 'bandpass', ff: 500, q: 1.5 }); this.osc('triangle', 160, t, 0.12, 0.12, null, { f2: 80 }); break;
        case 'reveal': this.osc('sine', 900, t, 0.3, 0.1, null, { f2: 1800 }); this.osc('sine', 1350, t + 0.1, 0.3, 0.08, null, { f2: 2700 }); break;
        case 'payload': this.noise(t, 0.6, 0.25, { filter: 'lowpass', ff: 2500, ff2: 120 }); this.osc('sawtooth', 120, t, 0.6, 0.2, null, { f2: 30 }); break;
        case 'shield': this.osc('sine', 500, t, 0.35, 0.08, null, { f2: 1000, filter: 'bandpass', ff: 1500, q: 2 }); break;
        case 'shieldBreak': this.noise(t, 0.25, 0.12, { filter: 'highpass', ff: 2000 }); this.osc('triangle', 1000, t, 0.2, 0.08, null, { f2: 300 }); break;
        case 'skill': this.osc('sawtooth', 300, t, 0.6, 0.14, null, { f2: 1200, filter: 'lowpass', ff: 3000 }); this.osc('sine', 600, t + 0.1, 0.6, 0.1, null, { f2: 2400 }); break;
        case 'intel': this.osc('sine', 1200, t, 0.12, 0.08, null, { f2: 1800 }); this.osc('sine', 1800, t + 0.1, 0.2, 0.08, null, { f2: 2400 }); break;
        case 'item': this.osc('sine', 400, t, 0.3, 0.12, null, { f2: 1600, filter: 'bandpass', ff: 1600, q: 1 }); break;
        case 'slam': this.osc('sine', 80, t, 0.9, 0.4, null, { f2: 25 }); this.noise(t, 0.8, 0.3, { filter: 'lowpass', ff: 600, ff2: 60 }); break;
        case 'bossWarn': this.osc('square', 220, t, 0.25, 0.12, null, { f2: 220 }); this.osc('square', 220, t + 0.3, 0.25, 0.12); this.osc('square', 220, t + 0.6, 0.4, 0.12, null, { f2: 110 }); break;
        case 'bossPhase': this.osc('sawtooth', 60, t, 1.4, 0.3, null, { f2: 240, filter: 'lowpass', ff: 400, ff2: 3000 }); this.noise(t, 1.2, 0.2, { filter: 'bandpass', ff: 300, ff2: 3000, q: 1.5 }); break;
        case 'bossSpawn': this.osc('sawtooth', 50, t, 2.0, 0.35, null, { f2: 120, filter: 'lowpass', ff: 300, ff2: 2000 }); this.noise(t, 1.8, 0.2, { filter: 'lowpass', ff: 200, ff2: 1500 }); break;
        case 'flood': [0, 0.15, 0.3].forEach(d => this.osc('sawtooth', 110, t + d, 0.5, 0.14, null, { f2: 55, filter: 'lowpass', ff: 800 })); this.noise(t, 1.2, 0.15, { filter: 'bandpass', ff: 400, q: 1 }); break;
        case 'wave': this.osc('sine', 440, t, 0.25, 0.1, null, { f2: 660 }); this.osc('sine', 660, t + 0.2, 0.4, 0.1, null, { f2: 880 }); break;
        case 'waveClear': [0, 0.1, 0.2, 0.3].forEach((d, i) => this.osc('triangle', 520 * Math.pow(1.2, i), t + d, 0.3, 0.1, null, { f2: 520 * Math.pow(1.2, i) })); break;
        case 'win': [0, 0.18, 0.36, 0.54, 0.8].forEach((d, i) => this.osc('triangle', [392, 494, 587, 784, 988][i], t + d, 0.6, 0.14)); break;
        case 'lose': [0, 0.3, 0.6].forEach((d, i) => this.osc('sawtooth', [220, 185, 147][i], t + d, 0.7, 0.16, null, { f2: [110, 92, 73][i], filter: 'lowpass', ff: 900 })); break;
        case 'click': this.osc('square', 900, t, 0.05, 0.05, null, { f2: 600, filter: 'bandpass', ff: 1800, q: 2 }); break;
        case 'hover': this.osc('sine', 1400, t, 0.04, 0.03); break;
        case 'drag': this.osc('sine', 500, t, 0.1, 0.08, null, { f2: 900 }); break;
        case 'error': this.osc('square', 180, t, 0.2, 0.1, null, { f2: 120 }); break;
        case 'camera': this.noise(t, 0.25, 0.05, { filter: 'bandpass', ff: 600, q: 1 }); break;
      }
    },
    // ---------- 音乐与环境 ----------
    startMusic(theme) {
      this.theme = theme; if (!this.ready) return; this.stopMusic();
      const scales = { corp: [0, 2, 3, 7, 9, 12, 14, 15], backbone: [0, 2, 5, 7, 9, 12, 14, 17], ics: [0, 1, 5, 7, 8, 12, 13, 17] };
      const roots = { corp: 55, backbone: 49, ics: 46 }; const tempos = { corp: 0.42, backbone: 0.5, ics: 0.36 };
      const scale = scales[theme] || scales.corp; const root = roots[theme] || 55; const tempo = tempos[theme] || 0.42; this.step = 0;
      // Pad：两个失谐锯齿 + 低通
      const pad = (freq, det) => { const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det; const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 2; const g = this.ctx.createGain(); g.gain.value = 0.035; const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.08; const lg = this.ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(f.frequency); o.connect(f); f.connect(g); g.connect(this.musicGain); o.start(); lfo.start(); return [o, lfo]; };
      this.padNodes = [pad(root * 2, -6), pad(root * 2, 7), pad(root * 3, 0)];
      // 环境噪声
      const amb = this.ctx.createBufferSource(); amb.buffer = this.noiseBuf; amb.loop = true; const af = this.ctx.createBiquadFilter(); af.type = 'bandpass'; af.frequency.value = theme === 'ics' ? 220 : 500; af.Q.value = 0.6; const ag = this.ctx.createGain(); ag.gain.value = 0.05; amb.connect(af); af.connect(ag); ag.connect(this.ambGain); amb.start(); this.ambNodes = [amb];
      const hum = this.ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = root / 2; const hg = this.ctx.createGain(); hg.gain.value = 0.05; hum.connect(hg); hg.connect(this.ambGain); hum.start(); this.ambNodes.push(hum);
      // 琶音序列
      this.musicTimer = setInterval(() => {
        if (!this.ready || this.muted) return; const c = this.ctx; const t = c.currentTime + 0.02; const s = this.step++;
        const chord = [0, 3, 5][Math.floor(s / 16) % 3];
        if (s % 2 === 0) { const n = scale[(s * 3 + chord) % scale.length] + (s % 8 === 0 ? 12 : 0); this.osc('triangle', root * 4 * Math.pow(2, n / 12), t, 0.5, 0.05, this.musicGain, { f2: root * 4 * Math.pow(2, n / 12), filter: 'lowpass', ff: 2400 }); }
        if (s % 8 === 0) { this.osc('sine', root * Math.pow(2, chord / 12), t, 1.6, 0.08, this.musicGain, { f2: root * Math.pow(2, chord / 12) * 0.99 }); }
        if (theme !== 'ics' && s % 4 === 2) this.noise(t, 0.08, 0.02, { filter: 'highpass', ff: 6000, dest: this.musicGain });
      }, tempo * 1000);
    },
    stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } for (const n of (this.padNodes || [])) for (const x of n) { try { x.stop(); } catch (e) { } } for (const n of (this.ambNodes || [])) { try { n.stop(); } catch (e) { } } this.padNodes = []; this.ambNodes = []; },
  };
  A.load();
  G.Audio = A;
})();
