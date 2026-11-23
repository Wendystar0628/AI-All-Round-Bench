/* 网络安全攻防战 — 声音：全部由 WebAudio 实时合成（环境声、音乐、音效） */
(function (root) {
  'use strict';
  const TD = root.TD;
  const N2F = n => 440 * Math.pow(2, (n - 69) / 12);

  const SCENES = {
    menu: { bpm: 72, root: 45, scale: [0, 2, 3, 7, 8, 10], prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 7], [-5, -1, 2]], pad: 0.5, arp: 0.14, bass: 0, drum: 0, arpPat: [0, 2, 1, 2, 0, 2, 1, 3], amb: 'menu' },
    corp: { bpm: 104, root: 50, scale: [0, 2, 3, 5, 7, 8, 10], prog: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-2, 2, 5]], pad: 0.34, arp: 0.2, bass: 0.34, drum: 0.5, arpPat: [0, 1, 2, 1, 3, 1, 2, 1], amb: 'corp' },
    wan: { bpm: 118, root: 42, scale: [0, 2, 3, 5, 7, 9, 10], prog: [[0, 3, 7], [3, 7, 10], [-2, 2, 5], [-4, 0, 3]], pad: 0.36, arp: 0.2, bass: 0.42, drum: 0.6, arpPat: [0, 2, 3, 2, 1, 2, 3, 2], amb: 'wan', drive: true },
    ics: { bpm: 90, root: 38, scale: [0, 1, 3, 5, 7, 8, 10], prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 1, 5]], pad: 0.32, arp: 0.12, bass: 0.46, drum: 0.6, arpPat: [0, 3, 1, 3, 0, 2, 1, 2], amb: 'ics', metal: true }
  };

  const A = TD.Audio = {
    ctx: null, vol: { master: 0.8, music: 0.55, amb: 0.5, sfx: 0.8 }, muted: false, scene: null, want: null, paused: false, last: {}, intensity: 0, step: 0, nextT: 0, ambNodes: [], ambT: 0, voices: 0,

    init(app) { this.app = app; try { const v = JSON.parse(localStorage.getItem('xiyu_vol') || 'null'); if (v) Object.assign(this.vol, v.vol), this.muted = !!v.muted; } catch (e) { } },
    save() { try { localStorage.setItem('xiyu_vol', JSON.stringify({ vol: this.vol, muted: this.muted })); } catch (e) { } },
    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 5; this.comp.connect(c.destination);
      this.master = c.createGain(); this.master.connect(this.comp);
      this.bus = {}; for (const k of ['music', 'amb', 'sfx']) { const g = c.createGain(); g.connect(this.master); this.bus[k] = g; }
      // 混响
      const len = Math.floor(c.sampleRate * 1.8), ir = c.createBuffer(2, len, c.sampleRate), rg = TD.makeRng(11);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (rg() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      this.rev = c.createConvolver(); this.rev.buffer = ir; const rg2 = c.createGain(); rg2.gain.value = 0.32; this.rev.connect(rg2); rg2.connect(this.master);
      // 噪声
      const nl = c.sampleRate * 2, nb = c.createBuffer(1, nl, c.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nl; i++) nd[i] = rg() * 2 - 1; this.noiseBuf = nb;
      const bb = c.createBuffer(1, nl, c.sampleRate), bd = bb.getChannelData(0); let lastV = 0; for (let i = 0; i < nl; i++) { lastV = (lastV + 0.02 * (rg() * 2 - 1)) / 1.02; bd[i] = lastV * 3.5; } this.brownBuf = bb;
      this.applyVol(); this.rngA = TD.makeRng(321);
      if (this.want) { const w = this.want; this.want = null; this.scene = null; this.setScene(w); }
      if (TD.UI) TD.UI.setMuteUi(this.muted);
    },
    applyVol() { if (!this.ctx) return; const t = this.ctx.currentTime, m = this.muted ? 0 : this.vol.master; this.master.gain.setTargetAtTime(m, t, 0.03); this.bus.music.gain.setTargetAtTime(this.vol.music * (this.paused ? 0.35 : 1), t, 0.1); this.bus.amb.gain.setTargetAtTime(this.vol.amb, t, 0.1); this.bus.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.03); },
    setVol(k, v) { this.vol[k] = v; this.applyVol(); this.save(); },
    setMuted(m) { this.muted = m; this.applyVol(); this.save(); },
    setPaused(p) { this.paused = p; this.applyVol(); },

    // ---------- 合成基元 ----------
    tone(o) {
      const c = this.ctx; if (!c || this.voices > 46) return; const t = c.currentTime + (o.at || 0), d = o.dur || 0.2;
      const os = c.createOscillator(), g = c.createGain(); os.type = o.type || 'sine'; os.frequency.setValueAtTime(o.f0, t); if (o.f1) os.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + d);
      if (o.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vib; lg.gain.value = o.vibD || 20; l.connect(lg); lg.connect(os.frequency); l.start(t); l.stop(t + d + 0.05); }
      const v = o.vol || 0.2, a = o.att || 0.005; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
      let out = os; if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(o.lp, t); if (o.lp1) f.frequency.exponentialRampToValueAtTime(o.lp1, t + d); f.Q.value = o.q || 1; os.connect(f); out = f; }
      out.connect(g); g.connect(o.bus || this.bus.sfx); if (o.rev) g.connect(this.rev);
      os.start(t); os.stop(t + d + 0.05); this.voices++; os.onended = () => { this.voices--; };
    },
    noise(o) {
      const c = this.ctx; if (!c || this.voices > 46) return; const t = c.currentTime + (o.at || 0), d = o.dur || 0.2;
      const s = c.createBufferSource(); s.buffer = o.brown ? this.brownBuf : this.noiseBuf; s.loop = true; const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f0 || 1000, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + d); f.Q.value = o.q || 1;
      const g = c.createGain(), v = o.vol || 0.2; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + (o.att || 0.004)); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
      s.connect(f); f.connect(g); g.connect(o.bus || this.bus.sfx); if (o.rev) g.connect(this.rev);
      s.start(t, this.rngA() * 1.5); s.stop(t + d + 0.05); this.voices++; s.onended = () => { this.voices--; };
    },

    // ---------- 音效 ----------
    sfx(name, k) {
      const c = this.ctx; if (!c || this.muted) return; const now = c.currentTime, gap = GAP[name] == null ? 0.04 : GAP[name];
      if (this.last[name] && now - this.last[name] < gap) return; this.last[name] = now;
      const T = (o) => this.tone(o), N = (o) => this.noise(o), r = this.rngA;
      switch (name) {
        case 'hover': T({ type: 'sine', f0: 1500, dur: 0.035, vol: 0.035 }); break;
        case 'click': T({ type: 'square', f0: 880, f1: 1320, dur: 0.06, vol: 0.07, lp: 3000 }); T({ type: 'sine', f0: 220, dur: 0.05, vol: 0.08 }); break;
        case 'select': T({ type: 'triangle', f0: 660, f1: 990, dur: 0.09, vol: 0.1 }); break;
        case 'pick': T({ type: 'triangle', f0: 520, f1: 780, dur: 0.1, vol: 0.12 }); N({ f0: 3000, dur: 0.05, vol: 0.04, type: 'highpass' }); break;
        case 'tick': T({ type: 'square', f0: 1200, dur: 0.03, vol: 0.05, lp: 4000 }); break;
        case 'cancel': T({ type: 'triangle', f0: 500, f1: 260, dur: 0.12, vol: 0.1 }); break;
        case 'deny': T({ type: 'sawtooth', f0: 170, dur: 0.14, vol: 0.16, lp: 900 }); T({ type: 'sawtooth', f0: 150, dur: 0.16, vol: 0.16, lp: 900, at: 0.13 }); break;
        case 'preview': T({ type: 'sine', f0: 700, f1: 1050, dur: 0.14, vol: 0.1, rev: 1 }); T({ type: 'sine', f0: 1050, f1: 1400, dur: 0.14, vol: 0.08, at: 0.1, rev: 1 }); break;
        case 'place': case 'place_interceptor': N({ f0: 300, f1: 90, dur: 0.16, vol: 0.3, type: 'lowpass' }); T({ type: 'square', f0: 300, f1: 900, dur: 0.14, vol: 0.09, lp: 2400 }); T({ type: 'sine', f0: 90, f1: 50, dur: 0.2, vol: 0.3 }); break;
        case 'place_firewall': N({ f0: 240, f1: 70, dur: 0.22, vol: 0.4, type: 'lowpass' }); T({ type: 'sawtooth', f0: 120, f1: 60, dur: 0.3, vol: 0.2, lp: 700 }); T({ type: 'triangle', f0: 1200, f1: 600, dur: 0.2, vol: 0.06, at: 0.05, rev: 1 }); break;
        case 'place_gateway': T({ type: 'sawtooth', f0: 400, f1: 60, dur: 0.22, vol: 0.2, lp: 1200 }); N({ f0: 180, dur: 0.25, vol: 0.5, type: 'lowpass', at: 0.2 }); T({ type: 'square', f0: 180, f1: 90, dur: 0.18, vol: 0.14, at: 0.2, lp: 800 }); break;
        case 'place_honeypot': T({ type: 'sine', f0: 400, f1: 800, dur: 0.2, vol: 0.14, vib: 9, vibD: 30, rev: 1 }); T({ type: 'triangle', f0: 1200, dur: 0.25, vol: 0.06, at: 0.1, rev: 1 }); N({ f0: 300, f1: 90, dur: 0.14, vol: 0.2, type: 'lowpass' }); break;
        case 'place_sandbox': T({ type: 'sine', f0: 900, f1: 300, dur: 0.25, vol: 0.12, rev: 1 }); N({ f0: 5000, f1: 800, dur: 0.25, vol: 0.07 }); T({ type: 'sine', f0: 90, f1: 50, dur: 0.2, vol: 0.25 }); break;
        case 'place_repair': for (let i = 0; i < 3; i++) T({ type: 'sine', f0: [523, 659, 784][i], dur: 0.2, vol: 0.1, at: i * 0.06, rev: 1 }); N({ f0: 300, f1: 90, dur: 0.14, vol: 0.18, type: 'lowpass' }); break;
        case 'upgrade': for (let i = 0; i < 4; i++) T({ type: 'triangle', f0: [392, 523, 659, 1047][i], dur: 0.22, vol: 0.12, at: i * 0.07, rev: 1 }); N({ f0: 2000, f1: 8000, dur: 0.4, vol: 0.05, type: 'highpass' }); break;
        case 'sell': T({ type: 'triangle', f0: 700, f1: 200, dur: 0.25, vol: 0.12 }); N({ f0: 1500, f1: 300, dur: 0.25, vol: 0.1 }); break;
        case 'skill_firewall': T({ type: 'sawtooth', f0: 110, f1: 220, dur: 0.4, vol: 0.18, lp: 600, lp1: 2400 }); T({ type: 'triangle', f0: 880, dur: 0.5, vol: 0.08, at: 0.1, rev: 1 }); break;
        case 'skill_honeypot': T({ type: 'sine', f0: 900, f1: 300, dur: 0.35, vol: 0.14, vib: 14, vibD: 60, rev: 1 }); N({ f0: 900, dur: 0.12, vol: 0.2, at: 0.3, q: 4 }); T({ type: 'square', f0: 200, dur: 0.1, vol: 0.12, at: 0.3, lp: 1200 }); break;
        case 'skill_interceptor': for (let i = 0; i < 3; i++) { T({ type: 'sawtooth', f0: 1800, f1: 120, dur: 0.3, vol: 0.14, at: i * 0.05, lp: 5000, lp1: 500 }); } N({ f0: 4000, f1: 300, dur: 0.4, vol: 0.2 }); break;
        case 'skill_sandbox': T({ type: 'sine', f0: 60, f1: 30, dur: 0.6, vol: 0.5 }); N({ f0: 200, f1: 4000, dur: 0.5, vol: 0.2 }); T({ type: 'sine', f0: 1400, f1: 2800, dur: 0.5, vol: 0.06, rev: 1 }); break;
        case 'skill_repair': for (let i = 0; i < 5; i++) T({ type: 'sine', f0: [523, 659, 784, 1047, 1319][i], dur: 0.5, vol: 0.09, at: i * 0.05, rev: 1 }); N({ f0: 1000, f1: 6000, dur: 0.6, vol: 0.06, type: 'highpass' }); break;
        case 'item_isolator': T({ type: 'square', f0: 300, f1: 150, dur: 0.12, vol: 0.14, lp: 1500 }); N({ f0: 200, dur: 0.22, vol: 0.45, type: 'lowpass', at: 0.1 }); T({ type: 'triangle', f0: 880, f1: 440, dur: 0.3, vol: 0.08, at: 0.12, rev: 1 }); break;
        case 'item_downgrade': T({ type: 'sawtooth', f0: 900, f1: 110, dur: 0.6, vol: 0.14, lp: 3000, lp1: 300 }); N({ f0: 3000, f1: 200, dur: 0.6, vol: 0.12 }); break;
        case 'item_restore': for (let i = 0; i < 4; i++) T({ type: 'sine', f0: [330, 440, 554, 660][i], dur: 0.45, vol: 0.1, at: i * 0.08, rev: 1 }); break;
        case 'wave': T({ type: 'sawtooth', f0: 220, f1: 440, dur: 0.35, vol: 0.14, lp: 1800 }); T({ type: 'sawtooth', f0: 330, f1: 660, dur: 0.4, vol: 0.12, lp: 1800, at: 0.18, rev: 1 }); break;
        case 'clear': for (let i = 0; i < 3; i++) T({ type: 'triangle', f0: [523, 784, 1047][i], dur: 0.35, vol: 0.12, at: i * 0.1, rev: 1 }); break;
        case 'warn': for (let i = 0; i < 3; i++) T({ type: 'square', f0: 740, dur: 0.11, vol: 0.12, at: i * 0.19, lp: 2400 }); break;
        case 'bossWarn': T({ type: 'sawtooth', f0: 55, f1: 110, dur: 1.6, vol: 0.34, lp: 300, lp1: 1200, vib: 5, vibD: 6 }); for (let i = 0; i < 4; i++) T({ type: 'square', f0: 520, f1: 500, dur: 0.22, vol: 0.12, at: i * 0.36, lp: 2000, rev: 1 }); break;
        case 'reroute': T({ type: 'sine', f0: 500, f1: 1000, dur: 0.16, vol: 0.12, rev: 1 }); T({ type: 'sine', f0: 750, f1: 1500, dur: 0.16, vol: 0.1, at: 0.1, rev: 1 }); N({ f0: 800, f1: 5000, dur: 0.3, vol: 0.06, type: 'highpass' }); break;
        case 'win': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => T({ type: 'triangle', f0: f, dur: 0.5, vol: 0.14, at: i * 0.13, rev: 1 })); break;
        case 'lose': [392, 370, 330, 262, 196].forEach((f, i) => T({ type: 'sawtooth', f0: f, dur: 0.6, vol: 0.14, at: i * 0.22, lp: 900, rev: 1 })); break;
        // —— 战斗 ——
        case 'bolt': T({ type: 'square', f0: 1500 + r() * 200, f1: 380, dur: 0.09, vol: 0.075, lp: 4200 }); break;
        case 'sup': T({ type: 'triangle', f0: 2100, f1: 900, dur: 0.035, vol: 0.045 }); break;
        case 'beam': T({ type: 'sawtooth', f0: 2400, f1: 90, dur: 0.34, vol: 0.15, lp: 6000, lp1: 400 }); N({ f0: 5000, f1: 500, dur: 0.3, vol: 0.13 }); T({ type: 'sine', f0: 70, f1: 40, dur: 0.25, vol: 0.3 }); break;
        case 'pulse': T({ type: 'sine', f0: 150, f1: 48, dur: 0.3, vol: 0.3 }); N({ f0: 700, f1: 2600, dur: 0.24, vol: 0.09 }); break;
        case 'fwHit': N({ f0: 2600, dur: 0.07, vol: 0.14, q: 3 }); T({ type: 'square', f0: 520, f1: 260, dur: 0.08, vol: 0.09, lp: 2500 }); break;
        case 'melee': N({ f0: 900 + r() * 500, dur: 0.06, vol: 0.1, q: 2 }); T({ type: 'sawtooth', f0: 180, f1: 90, dur: 0.07, vol: 0.07, lp: 900 }); break;
        case 'smash': T({ type: 'sine', f0: 110, f1: 36, dur: 0.34, vol: 0.5 }); N({ f0: 260, dur: 0.28, vol: 0.4, type: 'lowpass' }); N({ f0: 3000, dur: 0.06, vol: 0.1, q: 2 }); break;
        case 'ransomShot': T({ type: 'sawtooth', f0: 300, f1: 700, dur: 0.14, vol: 0.1, lp: 1800 }); T({ type: 'square', f0: 90, dur: 0.1, vol: 0.1, lp: 600 }); break;
        case 'ransomHit': N({ f0: 1400, f1: 300, dur: 0.14, vol: 0.14 }); T({ type: 'square', f0: 220, f1: 110, dur: 0.12, vol: 0.09, lp: 1200 }); break;
        case 'encrypt': T({ type: 'square', f0: 990, dur: 0.05, vol: 0.1, lp: 3000 }); T({ type: 'square', f0: 660, dur: 0.05, vol: 0.1, at: 0.06, lp: 3000 }); T({ type: 'sawtooth', f0: 233, dur: 0.3, vol: 0.12, at: 0.12, lp: 1000 }); T({ type: 'sawtooth', f0: 247, dur: 0.3, vol: 0.12, at: 0.12, lp: 1000 }); break;
        case 'cleanse': [784, 988, 1319].forEach((f, i) => T({ type: 'sine', f0: f, dur: 0.25, vol: 0.09, at: i * 0.05, rev: 1 })); break;
        case 'shieldOn': T({ type: 'sine', f0: 300, f1: 1200, dur: 0.3, vol: 0.1, rev: 1 }); break;
        case 'shieldBreak': N({ f0: 5000, f1: 1500, dur: 0.25, vol: 0.16, type: 'highpass' }); T({ type: 'triangle', f0: 2200, f1: 500, dur: 0.2, vol: 0.08 }); break;
        case 'die_worm': N({ f0: 1300, f1: 300, dur: 0.11, vol: 0.12, q: 2 }); T({ type: 'sine', f0: 500, f1: 120, dur: 0.1, vol: 0.09 }); break;
        case 'die_flood': N({ f0: 500, f1: 100, dur: 0.4, vol: 0.3, type: 'lowpass' }); for (let i = 0; i < 4; i++) T({ type: 'square', f0: 300 + r() * 600, dur: 0.05, vol: 0.05, at: i * 0.05, lp: 2000 }); break;
        case 'die_trojan': T({ type: 'sawtooth', f0: 700, f1: 80, dur: 0.22, vol: 0.12, lp: 2200 }); N({ f0: 2000, dur: 0.1, vol: 0.1 }); break;
        case 'die_ransom': T({ type: 'square', f0: 440, f1: 55, dur: 0.3, vol: 0.12, lp: 1600 }); N({ f0: 900, f1: 200, dur: 0.25, vol: 0.16 }); break;
        case 'die_hotspot': T({ type: 'sine', f0: 1800, f1: 200, dur: 0.35, vol: 0.1, vib: 30, vibD: 200 }); N({ f0: 3000, dur: 0.12, vol: 0.08 }); break;
        case 'die_packer': N({ f0: 3000, f1: 600, dur: 0.3, vol: 0.14, type: 'highpass' }); T({ type: 'triangle', f0: 600, f1: 150, dur: 0.25, vol: 0.12 }); break;
        case 'die_boss': T({ type: 'sawtooth', f0: 200, f1: 28, dur: 2.2, vol: 0.5, lp: 1500, lp1: 120 }); N({ f0: 300, f1: 60, dur: 2, vol: 0.6, type: 'lowpass', brown: 1 }); for (let i = 0; i < 8; i++) N({ f0: 800 + r() * 2000, dur: 0.2, vol: 0.2, at: i * 0.18 }); break;
        case 'towerDie': T({ type: 'sine', f0: 140, f1: 30, dur: 0.6, vol: 0.5 }); N({ f0: 600, f1: 80, dur: 0.6, vol: 0.4, type: 'lowpass' }); T({ type: 'square', f0: 900, f1: 100, dur: 0.3, vol: 0.08, lp: 2000 }); break;
        case 'leak': for (let i = 0; i < 2; i++) { T({ type: 'sawtooth', f0: 880, f1: 440, dur: 0.22, vol: 0.14, at: i * 0.24, lp: 2200 }); } T({ type: 'sine', f0: 80, f1: 40, dur: 0.4, vol: 0.4 }); break;
        case 'nodeIsolate': T({ type: 'sawtooth', f0: 600, f1: 80, dur: 0.24, vol: 0.14, lp: 1500 }); N({ f0: 160, dur: 0.3, vol: 0.5, type: 'lowpass', at: 0.2 }); T({ type: 'triangle', f0: 330, dur: 0.4, vol: 0.1, at: 0.22, rev: 1 }); break;
        case 'nodeOpen': N({ f0: 300, f1: 6000, dur: 0.5, vol: 0.2 }); T({ type: 'sine', f0: 220, f1: 880, dur: 0.4, vol: 0.12, rev: 1 }); break;
        case 'nodeBreak': N({ f0: 2500, f1: 200, dur: 0.5, vol: 0.4 }); T({ type: 'sine', f0: 120, f1: 30, dur: 0.6, vol: 0.5 }); T({ type: 'square', f0: 660, f1: 80, dur: 0.4, vol: 0.1, lp: 1800 }); N({ f0: 300, f1: 5000, dur: 0.6, vol: 0.14, at: 0.3 }); break;
        case 'replicate': T({ type: 'sine', f0: 600, f1: 1200, dur: 0.08, vol: 0.08 }); T({ type: 'sine', f0: 600, f1: 1200, dur: 0.08, vol: 0.08, at: 0.08 }); break;
        case 'reveal': T({ type: 'sine', f0: 1760, dur: 0.25, vol: 0.1, rev: 1 }); T({ type: 'sine', f0: 2640, dur: 0.2, vol: 0.06, at: 0.05, rev: 1 }); break;
        case 'packShield': T({ type: 'triangle', f0: 400, f1: 1600, dur: 0.3, vol: 0.08, vib: 20, vibD: 80, rev: 1 }); break;
        case 'payload': T({ type: 'sine', f0: 160, f1: 30, dur: 0.6, vol: 0.5 }); N({ f0: 1200, f1: 100, dur: 0.5, vol: 0.4, type: 'lowpass' }); break;
        case 'lure': T({ type: 'sine', f0: 900, f1: 1300, dur: 0.16, vol: 0.06, vib: 12, vibD: 40 }); break;
        case 'spawn': T({ type: 'sine', f0: 260, f1: 520, dur: 0.1, vol: 0.05 }); break;
        case 'intel': T({ type: 'sine', f0: 1319, dur: 0.12, vol: 0.09 }); T({ type: 'sine', f0: 1760, dur: 0.25, vol: 0.09, at: 0.08, rev: 1 }); break;
        case 'bossSpawn': T({ type: 'sawtooth', f0: 40, f1: 90, dur: 2.2, vol: 0.5, lp: 200, lp1: 1500, vib: 7, vibD: 8 }); N({ f0: 100, f1: 2000, dur: 2, vol: 0.3, brown: 1, type: 'lowpass' }); T({ type: 'square', f0: 110, f1: 55, dur: 1.2, vol: 0.14, at: 0.8, lp: 800, rev: 1 }); break;
        case 'bossPhase': T({ type: 'sawtooth', f0: 80, f1: 320, dur: 1.0, vol: 0.4, lp: 400, lp1: 3000 }); N({ f0: 500, f1: 6000, dur: 0.9, vol: 0.25 }); T({ type: 'sine', f0: 60, f1: 30, dur: 1.2, vol: 0.5, at: 0.9 }); break;
        case 'surge': N({ f0: 200, f1: 3000, dur: 0.4, vol: 0.4 }); T({ type: 'sine', f0: 200, f1: 30, dur: 0.9, vol: 0.6, at: 0.3 }); N({ f0: 1500, f1: 80, dur: 0.9, vol: 0.5, type: 'lowpass', at: 0.3 }); break;
        case 'blackhole': T({ type: 'sine', f0: 1200, f1: 40, dur: 1.0, vol: 0.3, vib: 18, vibD: 100 }); N({ f0: 4000, f1: 100, dur: 1.0, vol: 0.2 }); break;
        case 'lock': for (let i = 0; i < 3; i++) { N({ f0: 2200, dur: 0.1, vol: 0.3, q: 5, at: i * 0.12 }); T({ type: 'square', f0: 140, f1: 70, dur: 0.2, vol: 0.2, at: i * 0.12, lp: 900 }); } break;
        case 'storm': for (let i = 0; i < 7; i++) N({ f0: 1000 + r() * 5000, dur: 0.09, vol: 0.2, at: i * 0.07 + r() * 0.04, q: 3 }); T({ type: 'sawtooth', f0: 90, f1: 180, dur: 0.7, vol: 0.2, lp: 800 }); break;
        case 'hit': T({ type: 'triangle', f0: 300 + r() * 200, f1: 150, dur: 0.05, vol: 0.05 }); break;
      }
    },
    bindSim(sim) {
      const S = n => this.sfx(n), menu = () => this.app.state === 'menu';
      sim.on('*', (n, d) => {
        if (!this.ctx || menu()) return;
        switch (n) {
          case 'shot': S(d.kind === 'sup' ? 'sup' : 'bolt'); break; case 'beam': S('beam'); break; case 'pulse': S('pulse'); break; case 'fwHit': S('fwHit'); break; case 'melee': S(d.smash ? 'smash' : 'melee'); break; case 'smash': S('smash'); break; case 'isoHit': S('smash'); break;
          case 'ransomShot': S('ransomShot'); break; case 'shotHit': if (d.shot.kind === 'ransom') S('ransomHit'); break; case 'encrypt': S('encrypt'); break; case 'cleanse': if (!d.auto) S('cleanse'); break; case 'shieldBreak': S('shieldBreak'); break;
          case 'enemyDie': S(d.enemy.boss ? 'die_boss' : 'die_' + d.enemy.type); break; case 'towerDie': S('towerDie'); break; case 'leak': S('leak'); break;
          case 'nodeIsolate': S('nodeIsolate'); break; case 'nodeOpen': S(d.why === 'sell' || d.why === 'expire' ? 'nodeOpen' : 'nodeBreak'); break; case 'replicate': S('replicate'); break; case 'reveal': S('reveal'); break; case 'packShield': S('packShield'); break; case 'payload': S('payload'); break; case 'lure': S('lure'); break; case 'spawn': if (!d.copy) S('spawn'); break; case 'intel': S('intel'); break;
          case 'bossSpawn': S('bossSpawn'); this.intensity = 1; break; case 'bossPhase': S('bossPhase'); break; case 'bossDie': this.intensity = 0; break;
          case 'bossAct': S(d.kind === 'surge' ? 'surge' : d.kind === 'blackhole' ? 'blackhole' : d.kind === 'lock' ? 'lock' : d.kind === 'storm' ? 'storm' : 'replicate'); break;
          case 'wave': if (d.def.surge) this.intensity = 0.6; else if (!d.def.boss) this.intensity = 0; break;
        }
      });
      this.intensity = 0;
    },

    // ---------- 环境声与音乐 ----------
    setScene(key) {
      if (!this.ctx) { this.want = key; return; }
      if (this.scene === key) return; this.scene = key; const c = this.ctx, t = c.currentTime;
      for (const n of this.ambNodes) { try { n.g.gain.setTargetAtTime(0, t, 0.4); n.src.stop(t + 2); } catch (e) { } } this.ambNodes = [];
      const S = SCENES[key]; if (!S) return; this.S = S; this.step = 0; this.nextT = t + 0.25; this.intensity = 0;
      const loop = (buf, type, freq, q, vol, lfoF, lfoD) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(vol, t, 0.8); s.connect(f); f.connect(g); g.connect(this.bus.amb); if (lfoF) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = lfoF; lg.gain.value = lfoD; l.connect(lg); lg.connect(f.frequency); l.start(); this.ambNodes.push({ g, src: l }); } s.start(t, this.rngA() * 1.5); this.ambNodes.push({ g, src: s }); };
      const hum = (f, vol) => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = c.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(vol, t, 1); o.connect(g); g.connect(this.bus.amb); o.start(); this.ambNodes.push({ g, src: o }); };
      if (S.amb === 'corp') { loop(this.brownBuf, 'lowpass', 220, 0.5, 0.5, 0.07, 60); loop(this.noiseBuf, 'bandpass', 5200, 6, 0.012, 0.3, 900); hum(120, 0.03); }
      else if (S.amb === 'wan') { loop(this.noiseBuf, 'bandpass', 500, 0.8, 0.07, 0.11, 280); loop(this.brownBuf, 'lowpass', 120, 0.6, 0.55); loop(this.noiseBuf, 'highpass', 7000, 0.5, 0.008, 0.5, 2000); }
      else if (S.amb === 'ics') { hum(50, 0.09); hum(100, 0.04); hum(151, 0.015); loop(this.brownBuf, 'lowpass', 300, 0.7, 0.45, 0.2, 90); }
      else { loop(this.brownBuf, 'lowpass', 180, 0.5, 0.35, 0.05, 50); loop(this.noiseBuf, 'bandpass', 2400, 3, 0.01, 0.08, 800); }
    },
    update(dt) {
      const c = this.ctx; if (!c || !this.S || c.state !== 'running') return;
      const S = this.S, spb = 60 / S.bpm / 4, now = c.currentTime;
      if (this.nextT < now - 0.5) this.nextT = now + 0.05;
      while (this.nextT < now + 0.22) { this.seq(this.step, this.nextT - now); this.step++; this.nextT += spb; }
      // 环境里的零星事件
      this.ambT -= dt;
      if (this.ambT <= 0) {
        const r = this.rngA; this.ambT = 1.2 + r() * 3.5; const B = this.bus.amb;
        if (S.amb === 'corp') { for (let i = 0; i < 2 + Math.floor(r() * 3); i++) this.tone({ type: 'sine', f0: 1800 + r() * 2400, dur: 0.05, vol: 0.02, at: i * 0.08, bus: B, rev: 1 }); }
        else if (S.amb === 'wan') { this.tone({ type: 'sine', f0: 60 + r() * 20, f1: 40, dur: 1.4, vol: 0.12, bus: B }); if (r() < 0.5) this.noise({ f0: 300, f1: 2500, dur: 1.2, vol: 0.03, bus: B, rev: 1 }); }
        else if (S.amb === 'ics') { if (r() < 0.6) this.noise({ f0: 4000, f1: 2000, dur: 0.9, vol: 0.035, type: 'highpass', bus: B, att: 0.2 }); else { this.noise({ f0: 1800, dur: 0.08, vol: 0.05, q: 8, bus: B, rev: 1 }); this.tone({ type: 'square', f0: 240, f1: 200, dur: 0.3, vol: 0.02, bus: B, lp: 900, rev: 1 }); } }
        else { this.tone({ type: 'sine', f0: 900 + r() * 900, dur: 0.6, vol: 0.012, bus: B, rev: 1 }); }
      }
    },
    seq(step, at) {
      const S = this.S, M = this.bus.music, bar = Math.floor(step / 16), s16 = step % 16, ch = S.prog[bar % S.prog.length], r = this.rngA, I = this.intensity;
      const nf = (deg, oct) => N2F(S.root + deg + 12 * (oct || 0));
      if (s16 === 0) { // 铺底和弦
        const dur = 60 / S.bpm * 4 * 1.05;
        for (const d of ch) for (const det of [-0.06, 0.06]) this.tone({ type: 'sawtooth', f0: nf(d + det, 1), dur, vol: S.pad * 0.05, att: dur * 0.35, lp: 700 + I * 700, q: 0.7, at, bus: M, rev: 1 });
        this.tone({ type: 'sine', f0: nf(ch[0], 0), dur, vol: S.pad * 0.16, att: dur * 0.3, at, bus: M });
      }
      if (S.arp && (s16 % 2 === 0 || I > 0.5)) { const k = S.arpPat[(step >> (I > 0.5 ? 0 : 1)) % S.arpPat.length]; const d = ch[k % 3] + (k >= 3 ? 12 : 0); if (!(bar % 4 === 3 && s16 > 11 && S.amb === 'menu')) this.tone({ type: S.metal ? 'square' : 'triangle', f0: nf(d, 2), dur: 0.22, vol: S.arp * 0.2 * (s16 % 4 === 0 ? 1.2 : 0.8), at, bus: M, lp: S.metal ? 1800 : 5000, rev: 1 }); }
      if (S.bass) { const pat = S.drive ? [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1] : S.metal ? [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0] : [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0]; if (pat[s16] || (I > 0.5 && s16 % 2 === 0)) this.tone({ type: 'sawtooth', f0: nf(ch[0] + (s16 === 14 ? 7 : 0), -1), dur: 0.2, vol: S.bass * 0.3, at, bus: M, lp: 420 + I * 500, lp1: 140, q: 3 }); }
      if (S.drum) {
        const V = S.drum;
        if (s16 % 4 === 0 || (I > 0.5 && s16 === 14)) { this.tone({ type: 'sine', f0: 130, f1: 38, dur: 0.22, vol: V * 0.55, at, bus: M }); }
        if (s16 === 4 || s16 === 12) { this.noise({ f0: S.metal ? 900 : 1800, dur: 0.14, vol: V * 0.2, q: S.metal ? 6 : 0.9, at, bus: M, rev: 1 }); if (S.metal) this.tone({ type: 'square', f0: 420, f1: 400, dur: 0.12, vol: V * 0.06, at, bus: M, lp: 2400, rev: 1 }); }
        if (s16 % 2 === 0 || I > 0.3) this.noise({ f0: 8000, dur: s16 % 4 === 2 ? 0.07 : 0.03, vol: V * (s16 % 4 === 2 ? 0.07 : 0.035), type: 'highpass', at, bus: M });
      }
      if (I > 0.8 && s16 % 8 === 0) this.tone({ type: 'sawtooth', f0: nf(ch[0], 0), f1: nf(ch[0] + 12, 0), dur: 0.4, vol: 0.05, at, bus: M, lp: 1500, rev: 1 });
    }
  };
  const GAP = { hover: 0.05, bolt: 0.06, sup: 0.07, melee: 0.09, fwHit: 0.07, pulse: 0.1, spawn: 0.25, hit: 0.08, die_worm: 0.07, replicate: 0.12, lure: 0.2, reveal: 0.12, packShield: 0.3, ransomShot: 0.08, ransomHit: 0.08, smash: 0.12, intel: 0.15, encrypt: 0.2, tick: 0.03, beam: 0.08, shieldBreak: 0.1, cleanse: 0.1 };
})(window);
