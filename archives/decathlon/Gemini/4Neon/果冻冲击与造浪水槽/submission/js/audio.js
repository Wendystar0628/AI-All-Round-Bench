// js/audio.js — Procedural Web Audio Physics Foley Synthesizer
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this.exportMuted = false;
      this.masterGain = null;
      this.noiseBuffer = null;
      this.surfNodes = null;
      this.lastPlayTime = {};
    }

    unlock() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.enabled && !this.exportMuted ? 0.65 : 0.0;
        this.masterGain.connect(this.ctx.destination);
        this._buildNoiseBuffer();
        this._initSurfLoop();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }

    setEnabled(flag) {
      this.enabled = !!flag;
      this._syncMasterGain();
    }

    setExportMuted(flag) {
      this.exportMuted = !!flag;
      this._syncMasterGain();
    }

    _syncMasterGain() {
      if (!this.ctx || !this.masterGain) return;
      const target = this.enabled && !this.exportMuted ? 0.65 : 0.0;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
    }

    _canPlay(key, minGap) {
      if (!this.ctx || !this.enabled || this.exportMuted || this.ctx.state !== 'running') return false;
      const now = this.ctx.currentTime;
      if (this.lastPlayTime[key] && now - this.lastPlayTime[key] < minGap) return false;
      this.lastPlayTime[key] = now;
      return true;
    }

    _buildNoiseBuffer() {
      const sr = this.ctx.sampleRate;
      const len = sr * 2;
      const buf = this.ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.950 * b2 + white * 0.048;
        data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.18) * 1.4));
      }
      this.noiseBuffer = buf;
    }

    _initSurfLoop() {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      // Deep tank slosh filter
      const lowFilter = ctx.createBiquadFilter();
      lowFilter.type = 'bandpass';
      lowFilter.frequency.value = 260;
      lowFilter.Q.value = 1.1;

      const lowGain = ctx.createGain();
      lowGain.gain.value = 0.0;

      // Frothy breaking surf filter
      const highFilter = ctx.createBiquadFilter();
      highFilter.type = 'bandpass';
      highFilter.frequency.value = 1350;
      highFilter.Q.value = 0.8;

      const highGain = ctx.createGain();
      highGain.gain.value = 0.0;

      src.connect(lowFilter);
      lowFilter.connect(lowGain);
      lowGain.connect(this.masterGain);

      src.connect(highFilter);
      highFilter.connect(highGain);
      highGain.connect(this.masterGain);

      src.start();
      this.surfNodes = { lowFilter, lowGain, highFilter, highGain };
    }

    // Scene 1: Heavy ball slamming into jelly (squishy bass thud + resonant wobble)
    playJellyImpact(intensity, stiffnessNorm) {
      if (!this._canPlay('jellyImpact', 0.045)) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const amp = Math.min(1.0, Math.max(0.08, intensity));
      const stiff = Math.min(1.8, Math.max(0.4, stiffnessNorm || 1.0));

      // 1. Sub-bass thump with pitch drop + elastic wobble FM
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const baseF = 62 + stiff * 38;
      osc.frequency.setValueAtTime(baseF * 1.9, now);
      osc.frequency.exponentialRampToValueAtTime(baseF * 0.65, now + 0.09);
      osc.frequency.exponentialRampToValueAtTime(baseF * 0.95, now + 0.28);

      lfo.type = 'sine';
      lfo.frequency.value = 10 + stiff * 9;
      lfoGain.gain.setValueAtTime(22 * amp, now);
      lfoGain.gain.exponentialRampToValueAtTime(1.0, now + 0.35);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.55 * amp, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      lfo.start(now);
      osc.stop(now + 0.44);
      lfo.stop(now + 0.44);

      // 2. Wet squishy slap burst
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(420 + stiff * 240, now);
      bp.frequency.exponentialRampToValueAtTime(180, now + 0.14);
      bp.Q.value = 2.6;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.001, now);
      ng.gain.linearRampToValueAtTime(0.32 * amp, now + 0.008);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.masterGain);
      src.start(now, Math.random() * 1.2, 0.18);
    }

    // Scene 1: Elastic jelly rebound upward launch ("boing-blub")
    playJellyRebound(intensity, stiffnessNorm) {
      if (!this._canPlay('jellyRebound', 0.09)) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const amp = Math.min(0.85, Math.max(0.08, intensity));
      const stiff = Math.min(1.8, Math.max(0.4, stiffnessNorm || 1.0));

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const f0 = 75 + stiff * 35;
      osc.frequency.setValueAtTime(f0 * 0.78, now);
      osc.frequency.exponentialRampToValueAtTime(f0 * 1.55, now + 0.11);
      osc.frequency.exponentialRampToValueAtTime(f0 * 1.12, now + 0.26);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 480;

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.28 * amp, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);

      osc.connect(lp);
      lp.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.32);
    }

    // Scene 1: Gelatin fracture / wet tearing crack
    playJellyCrack(intensity) {
      if (!this._canPlay('jellyCrack', 0.04)) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const amp = Math.min(1.0, Math.max(0.15, intensity));

      // Crisp tear transient + wet rip sweep
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.setValueAtTime(2400, now);
      hp.frequency.exponentialRampToValueAtTime(620, now + 0.14);
      hp.Q.value = 1.9;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.45 * amp, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

      src.connect(hp);
      hp.connect(g);
      g.connect(this.masterGain);
      src.start(now, Math.random() * 1.0, 0.2);

      // Wet pop tone
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 950;
      og.gain.setValueAtTime(0.22 * amp, now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(lp);
      lp.connect(og);
      og.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.10);
    }

    // Rigid collision: material = 'metal' | 'stone' | 'table' | 'glass'
    playRigidHit(intensity, material) {
      const key = 'rigid_' + (material || 'metal');
      if (!this._canPlay(key, 0.03)) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const amp = Math.min(1.0, Math.max(0.05, intensity));

      let freqs, dur;
      if (material === 'metal') {
        freqs = [680, 1480, 2790];
        dur = 0.24;
      } else if (material === 'glass') {
        freqs = [920, 1980, 3220];
        dur = 0.14;
      } else if (material === 'stone') {
        freqs = [310, 740, 1290];
        dur = 0.12;
      } else {
        // table
        freqs = [210, 520, 980];
        dur = 0.11;
      }

      const jitter = 0.94 + Math.random() * 0.12;
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(f * jitter, now);
        osc.frequency.exponentialRampToValueAtTime(f * jitter * 0.96, now + dur);
        const w = (idx === 0 ? 0.24 : idx === 1 ? 0.14 : 0.07) * amp;
        g.gain.setValueAtTime(w, now);
        g.gain.exponentialRampToValueAtTime(0.0008, now + dur * (1 - idx * 0.22));
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + dur + 0.02);
      });
    }

    // Scene 2: Sphere splashing into water (Minnaert bubble chirp + water splash burst)
    playWaterSplash(intensity, heavyFactor) {
      if (!this._canPlay('splash', 0.032)) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const amp = Math.min(1.0, Math.max(0.08, intensity));
      const heavy = Math.min(1.8, Math.max(0.4, heavyFactor || 1.0));

      // Minnaert rising bubble "ploop"
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'sine';
      const startF = (260 / Math.sqrt(heavy)) * (0.85 + Math.random() * 0.3);
      osc.frequency.setValueAtTime(startF, now);
      osc.frequency.exponentialRampToValueAtTime(startF * 2.45, now + 0.075);
      og.gain.setValueAtTime(0.001, now);
      og.gain.linearRampToValueAtTime(0.28 * amp, now + 0.008);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      osc.connect(og);
      og.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.11);

      // Filtered water splash spray
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1100 + 700 * amp, now);
      bp.frequency.exponentialRampToValueAtTime(380, now + 0.26);
      bp.Q.value = 0.7;

      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.001, now);
      ng.gain.linearRampToValueAtTime(0.36 * amp, now + 0.015);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.32 * Math.sqrt(heavy));

      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.masterGain);
      src.start(now, Math.random() * 1.1, 0.45);
    }

    // Scene 2: Continuous wave surge & breaking foam ambience
    updateWaveSound(paddleEnergy, foamEnergy) {
      if (!this.ctx || !this.surfNodes) return;
      const now = this.ctx.currentTime;
      const active = this.enabled && !this.exportMuted && this.ctx.state === 'running';
      const pE = active ? Math.min(1.0, Math.max(0.0, paddleEnergy)) : 0.0;
      const fE = active ? Math.min(1.0, Math.max(0.0, foamEnergy)) : 0.0;

      this.surfNodes.lowGain.gain.setTargetAtTime(pE * 0.22, now, 0.08);
      this.surfNodes.lowFilter.frequency.setTargetAtTime(180 + pE * 280, now, 0.08);
      this.surfNodes.highGain.gain.setTargetAtTime(fE * 0.20, now, 0.08);
      this.surfNodes.highFilter.frequency.setTargetAtTime(900 + fE * 1400, now, 0.08);
    }
  }

  App.Audio = new SoundEngine();
})(window);
