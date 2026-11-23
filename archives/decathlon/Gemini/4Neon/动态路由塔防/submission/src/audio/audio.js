// Pure Web Audio API Procedural Soundscape, Music (3 distinct themes) & SFX Synthesizer.
// 100% offline & file:// compatible, gracefully respects Chrome autoplay policy.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.muted = false;
    this.masterVol = 0.65;
    this.bgmVol = 0.42;
    this.sfxVol = 0.72;

    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;

    this.currentTheme = null;
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.ambientNodes = [];
    this.lastSfxAt = new Map();
    this.silentExport = false;
  }

  unlock() {
    if (this.silentExport) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.bgmGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.bgmGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.unlocked = true;
    if (this.currentTheme && !this.bgmTimer) {
      this.startThemeLoop(this.currentTheme);
    }
  }

  applyVolumes() {
    if (!this.masterGain) return;
    const m = this.muted ? 0 : this.masterVol;
    this.masterGain.gain.setTargetAtTime(m, this.ctx.currentTime, 0.03);
    this.bgmGain.gain.setTargetAtTime(this.bgmVol, this.ctx.currentTime, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.sfxVol, this.ctx.currentTime, 0.03);
  }

  setMuted(flag) {
    this.muted = !!flag;
    this.applyVolumes();
  }

  setVolumes({ master, bgm, sfx }) {
    if (master !== undefined) this.masterVol = master;
    if (bgm !== undefined) this.bgmVol = bgm;
    if (sfx !== undefined) this.sfxVol = sfx;
    this.applyVolumes();
  }

  setTheme(themeName) {
    if (this.currentTheme === themeName && this.bgmTimer) return;
    this.stopTheme();
    this.currentTheme = themeName;
    if (this.unlocked && !this.silentExport && themeName) {
      this.startThemeLoop(themeName);
    }
  }

  stopTheme() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    for (const node of this.ambientNodes) {
      try {
        node.stop?.();
        node.disconnect?.();
      } catch {}
    }
    this.ambientNodes = [];
  }

  startThemeLoop(themeName) {
    if (!this.ctx || this.silentExport) return;
    this.stopTheme();
    this.bgmStep = 0;

    // 1. Subtle map-distinct ambient bed
    this.startAmbientBed(themeName);

    // 2. Sequenced cyber-electronic pulse tailored to each network environment!
    const configs = {
      menu: {
        bpm: 92,
        bass: [55, 0, 55, 0, 49, 0, 52, 0],
        arp: [220, 261.6, 329.6, 392, 329.6, 261.6, 246.9, 293.7],
        wave: 'triangle',
      },
      intranet: {
        // Corporate crisp D Dorian pulse
        bpm: 112,
        bass: [73.42, 0, 73.42, 73.42, 65.41, 0, 82.41, 0],
        arp: [293.66, 349.23, 440, 523.25, 440, 392, 349.23, 329.63],
        wave: 'triangle',
      },
      backbone: {
        // Expansive flowing F Minor / Pentatonic data-river arpeggio
        bpm: 118,
        bass: [87.31, 0, 87.31, 0, 65.41, 0, 77.78, 87.31],
        arp: [349.23, 415.3, 523.25, 622.25, 523.25, 466.16, 415.3, 349.23],
        wave: 'sine',
      },
      airgap: {
        // Tense industrial C Phrygian ostinato
        bpm: 124,
        bass: [65.41, 65.41, 0, 69.3, 65.41, 0, 58.27, 61.74],
        arp: [261.63, 277.18, 392, 311.13, 261.63, 277.18, 233.08, 392],
        wave: 'sawtooth',
      },
    };

    const cfg = configs[themeName] || configs.intranet;
    const stepMs = Math.round((60 / cfg.bpm / 2) * 1000);

    this.bgmTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running' || this.muted || this.silentExport) return;
      const t = this.ctx.currentTime;
      const idx = this.bgmStep % 8;

      const bassFreq = cfg.bass[idx];
      if (bassFreq > 0) {
        this.playTone(bassFreq, 'sawtooth', 0.14, 0.24, this.bgmGain, 340);
      }

      const arpFreq = cfg.arp[(this.bgmStep + (this.bgmStep >> 3)) % cfg.arp.length];
      if (this.bgmStep % 2 === 0 || themeName === 'backbone') {
        this.playTone(arpFreq, cfg.wave, 0.055, 0.28, this.bgmGain, themeName === 'airgap' ? 900 : 1800);
      }

      // Subtle hi-hat / telemetry click on offbeats
      if (themeName !== 'menu' && idx % 2 === 1) {
        this.playNoise(0.03, 0.022, 6500, this.bgmGain);
      }

      this.bgmStep++;
    }, stepMs);
  }

  startAmbientBed(themeName) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    // Create looping gentle ambient noise buffer for environmental atmosphere
    const nLen = this.ctx.sampleRate * 2;
    const nBuf = this.ctx.createBuffer(1, nLen, this.ctx.sampleRate);
    const nData = nBuf.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < nLen; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.03 * white) / 1.03; // warm brown/pink noise
      nData[i] = lastOut * 2.5;
    }
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = nBuf;
    noiseSrc.loop = true;
    const noiseFilter = this.ctx.createBiquadFilter();
    const noiseGain = this.ctx.createGain();

    if (themeName === 'intranet') {
      // Map 1: Clean server-room airflow + warm corporate hum
      osc.type = 'sine';
      osc.frequency.setValueAtTime(73.42, t);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(180, t);
      g.gain.setValueAtTime(0.055, t);

      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(360, t);
      noiseFilter.Q.value = 1.4;
      noiseGain.gain.setValueAtTime(0.035, t);
    } else if (themeName === 'backbone') {
      // Map 2: Flowing high-bandwidth plasma river current with LFO filter sweep!
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(87.31, t);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(240, t);
      g.gain.setValueAtTime(0.06, t);

      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(620, t);
      noiseFilter.Q.value = 1.8;
      noiseGain.gain.setValueAtTime(0.065, t);

      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.setValueAtTime(0.18, t);
      lfoGain.gain.setValueAtTime(260, t);
      lfo.connect(lfoGain);
      lfoGain.connect(noiseFilter.frequency);
      lfo.start(t);
      this.ambientNodes.push(lfo, lfoGain);
    } else if (themeName === 'airgap') {
      // Map 3: Heavy industrial transformer drone + low pressurized room resonance
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(55.0, t);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(135, t);
      g.gain.setValueAtTime(0.06, t);

      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(220, t);
      noiseGain.gain.setValueAtTime(0.045, t);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(65.4, t);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(150, t);
      g.gain.setValueAtTime(0.045, t);
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(280, t);
      noiseGain.gain.setValueAtTime(0.025, t);
    }

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.bgmGain);
    osc.start(t);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.bgmGain);
    noiseSrc.start(t);

    this.ambientNodes.push(osc, filter, g, noiseSrc, noiseFilter, noiseGain);
  }

  canPlay(tag, minGapMs = 60) {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted || this.silentExport) return false;
    const now = performance.now();
    const prev = this.lastSfxAt.get(tag) || 0;
    if (now - prev < minGapMs) return false;
    this.lastSfxAt.set(tag, now);
    return true;
  }

  playTone(freq, type, vol, dur, dest = this.sfxGain, cutoff = 4000, freqEnd = null) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const flt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    }
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(cutoff, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(flt);
    flt.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  playNoise(dur, vol, highpass = 1200, dest = this.sfxGain) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = highpass;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(flt);
    flt.connect(g);
    g.connect(dest);
    src.start(t);
  }

  // ==================== UI & GAMEPLAY SFX ====================

  playUI(kind) {
    if (!this.canPlay(`ui_${kind}`, 45)) return;
    if (kind === 'click') {
      this.playTone(720, 'triangle', 0.12, 0.06, this.sfxGain, 3200, 980);
    } else if (kind === 'hover') {
      this.playTone(540, 'sine', 0.04, 0.03, this.sfxGain, 2000, 620);
    } else if (kind === 'reject') {
      this.playTone(210, 'sawtooth', 0.16, 0.14, this.sfxGain, 900, 140);
      setTimeout(() => this.ctx && this.playTone(150, 'sawtooth', 0.14, 0.15, this.sfxGain, 800, 110), 90);
    } else if (kind === 'deploy') {
      this.playTone(320, 'triangle', 0.16, 0.12, this.sfxGain, 2600, 640);
      setTimeout(() => this.ctx && this.playTone(640, 'sine', 0.14, 0.14, this.sfxGain, 3400, 880), 60);
    } else if (kind === 'upgrade') {
      this.playTone(440, 'triangle', 0.15, 0.12, this.sfxGain, 3200, 660);
      setTimeout(() => this.ctx && this.playTone(660, 'triangle', 0.15, 0.16, this.sfxGain, 3600, 990), 80);
    }
  }

  handleEngineEvent(ev) {
    if (!this.ctx || this.silentExport || this.muted) return;

    switch (ev.type) {
      case 'tower_deployed':
        this.playUI('deploy');
        break;
      case 'tower_upgraded':
        this.playUI('upgrade');
        break;
      case 'action_rejected':
        this.playUI('reject');
        break;
      case 'node_isolated':
        if (this.canPlay('node_iso', 100)) {
          this.playTone(180, 'sawtooth', 0.22, 0.18, this.sfxGain, 1100, 95);
          this.playTone(520, 'triangle', 0.14, 0.22, this.sfxGain, 2500, 780);
        }
        break;
      case 'node_bypass_open':
        if (this.canPlay('node_open', 100)) {
          this.playTone(420, 'sawtooth', 0.22, 0.26, this.sfxGain, 1600, 110);
          this.playNoise(0.18, 0.16, 900);
        }
        break;
      case 'route_changed':
        if (this.canPlay('route', 160)) {
          this.playTone(380, 'sine', 0.12, 0.26, this.sfxGain, 2800, 680);
        }
        break;
      case 'tower_fire':
        if (this.canPlay('ic_fire', 70)) {
          this.playTone(ev.branch === 'suppress' ? 880 : 680, 'triangle', 0.08, 0.08, this.sfxGain, 3000, 290);
        }
        break;
      case 'rail_beam':
        if (this.canPlay('rail', 85)) {
          this.playTone(1150, 'sawtooth', 0.14, 0.18, this.sfxGain, 3600, 210);
          this.playNoise(0.08, 0.08, 2200);
        }
        break;
      case 'sandbox_pulse':
        if (this.canPlay('sb_pulse', 120)) {
          this.playTone(310, 'sine', 0.11, 0.22, this.sfxGain, 1600, 120);
        }
        break;
      case 'heal_beam':
        if (this.canPlay('heal', 180)) {
          this.playTone(587, 'sine', 0.07, 0.18, this.sfxGain, 2600, 740);
        }
        break;
      case 'melee_strike':
        if (this.canPlay('melee', 80)) {
          this.playTone(240, 'square', 0.07, 0.07, this.sfxGain, 1200, 110);
        }
        break;
      case 'firewall_shockwave':
        if (this.canPlay('fw_shock', 140)) {
          this.playTone(220, 'sawtooth', 0.16, 0.24, this.sfxGain, 1100, 75);
        }
        break;
      case 'worm_split':
        if (this.canPlay('wsplit', 120)) {
          this.playTone(520, 'triangle', 0.09, 0.1, this.sfxGain, 2400, 780);
        }
        break;
      case 'enemy_ranged_fire':
        if (this.canPlay('erange', 120)) {
          this.playTone(480, 'sawtooth', 0.09, 0.14, this.sfxGain, 1500, 240);
        }
        break;
      case 'node_bashed':
        if (this.canPlay('bash', 130)) {
          this.playTone(130, 'sawtooth', 0.2, 0.18, this.sfxGain, 650, 52);
          this.playNoise(0.1, 0.12, 600);
        }
        break;
      case 'tower_encrypted':
        if (this.canPlay('enc', 160)) {
          this.playTone(620, 'sawtooth', 0.12, 0.22, this.sfxGain, 1800, 220);
        }
        break;
      case 'enemy_revealed':
        if (this.canPlay('rev', 120)) {
          this.playTone(760, 'sine', 0.12, 0.16, this.sfxGain, 3400, 1140);
        }
        break;
      case 'trojan_payload_blast':
        if (this.canPlay('blast', 120)) {
          this.playTone(140, 'sawtooth', 0.24, 0.34, this.sfxGain, 900, 42);
          this.playNoise(0.24, 0.2, 400);
        }
        break;
      case 'tower_withdrawn':
        if (this.canPlay('withdraw', 80)) {
          this.playTone(580, 'triangle', 0.12, 0.14, this.sfxGain, 2400, 260);
        }
        break;
      case 'wave_started':
        if (this.canPlay('wave_start', 200)) {
          if (ev.isBossWave || ev.isSurgeWave) {
            this.playTone(165, 'sawtooth', 0.2, 0.28, this.sfxGain, 1100, 130);
            setTimeout(() => this.ctx && this.playTone(220, 'sawtooth', 0.2, 0.34, this.sfxGain, 1400, 165), 160);
          } else {
            this.playTone(392, 'triangle', 0.12, 0.14, this.sfxGain, 2600, 523.25);
          }
        }
        break;
      case 'wave_cleared':
        if (this.canPlay('wave_clear', 200)) {
          this.playTone(523.25, 'sine', 0.12, 0.14, this.sfxGain, 3200);
          setTimeout(() => this.ctx && this.playTone(783.99, 'sine', 0.14, 0.24, this.sfxGain, 3600), 110);
        }
        break;
      case 'packager_shield':
        if (this.canPlay('pkg_sh', 150)) {
          this.playTone(698.46, 'sine', 0.08, 0.16, this.sfxGain, 3000, 932.33);
        }
        break;
      case 'node_intel_harvest':
        if (this.canPlay('intel_tick', 260)) {
          this.playTone(880, 'sine', 0.06, 0.1, this.sfxGain, 3600, 1174.66);
        }
        break;
      case 'skill_repair_failover':
        if (this.canPlay('skill', 120)) {
          this.playTone(523.25, 'sine', 0.16, 0.18, this.sfxGain, 3400, 659.25);
          setTimeout(() => this.ctx && this.playTone(783.99, 'triangle', 0.16, 0.28, this.sfxGain, 3800, 1046.5), 85);
        }
        break;
      case 'skill_sandbox_scan':
        if (this.canPlay('skill', 120)) {
          this.playTone(320, 'sine', 0.16, 0.32, this.sfxGain, 3200, 1480);
          this.playNoise(0.12, 0.07, 2400);
        }
        break;
      case 'skill_honeypot_entrap':
        if (this.canPlay('skill', 120)) {
          this.playTone(640, 'sawtooth', 0.14, 0.2, this.sfxGain, 1800, 260);
          setTimeout(() => this.ctx && this.playTone(340, 'triangle', 0.14, 0.22, this.sfxGain, 2200, 510), 80);
        }
        break;
      case 'tower_skill':
        if (this.canPlay('skill', 120)) {
          this.playTone(440, 'triangle', 0.16, 0.22, this.sfxGain, 3200, 880);
          setTimeout(() => this.ctx && this.playTone(660, 'sine', 0.14, 0.26, this.sfxGain, 3600, 1050), 90);
        }
        break;
      case 'item_used':
        if (this.canPlay('item', 100)) {
          if (ev.itemId === 'isolator') {
            this.playTone(155, 'sawtooth', 0.2, 0.18, this.sfxGain, 1000, 82);
            setTimeout(() => this.ctx && this.playTone(760, 'triangle', 0.13, 0.14, this.sfxGain, 3200, 920), 65);
          } else if (ev.itemId === 'downgrade') {
            this.playTone(880, 'triangle', 0.14, 0.26, this.sfxGain, 2400, 310);
            this.playNoise(0.14, 0.09, 1800);
          } else if (ev.itemId === 'restore') {
            this.playTone(523.25, 'sine', 0.14, 0.14, this.sfxGain, 3200);
            setTimeout(() => this.ctx && this.playTone(659.25, 'sine', 0.14, 0.16, this.sfxGain, 3400), 75);
            setTimeout(() => this.ctx && this.playTone(783.99, 'sine', 0.15, 0.24, this.sfxGain, 3800), 150);
          } else {
            this.playTone(480, 'triangle', 0.16, 0.22, this.sfxGain, 2800, 760);
          }
        }
        break;
      case 'boss_terrain_changed':
      case 'boss_routing_storm':
      case 'boss_impact':
        if (this.canPlay('boss_fx', 180)) {
          this.playTone(105, 'sawtooth', 0.25, 0.36, this.sfxGain, 750, 38);
          this.playNoise(0.24, 0.18, 450);
        }
        break;
      case 'enemy_killed':
        if (this.canPlay('kill', 55)) {
          this.playTone(ev.isBoss ? 140 : 380, 'triangle', ev.isBoss ? 0.28 : 0.08, ev.isBoss ? 0.55 : 0.1, this.sfxGain, 2200, 90);
        }
        break;
      case 'tower_destroyed':
        if (this.canPlay('tdestroy', 120)) {
          this.playTone(170, 'sawtooth', 0.24, 0.35, this.sfxGain, 950, 45);
          this.playNoise(0.25, 0.18, 500);
        }
        break;
      case 'boss_warning':
      case 'boss_phase':
      case 'boss_spawned':
        if (this.canPlay('boss_alarm', 250)) {
          this.playTone(220, 'sawtooth', 0.22, 0.32, this.sfxGain, 1200, 165);
          setTimeout(() => this.ctx && this.playTone(196, 'sawtooth', 0.22, 0.38, this.sfxGain, 1200, 130), 180);
        }
        break;
      case 'core_breached':
        if (this.canPlay('breach', 160)) {
          this.playTone(300, 'square', 0.22, 0.26, this.sfxGain, 1400, 120);
        }
        break;
      case 'game_over':
        if (ev.victory) {
          this.playTone(523.25, 'triangle', 0.18, 0.22, this.sfxGain, 3200);
          setTimeout(() => this.ctx && this.playTone(659.25, 'triangle', 0.18, 0.24, this.sfxGain, 3200), 140);
          setTimeout(() => this.ctx && this.playTone(783.99, 'triangle', 0.22, 0.45, this.sfxGain, 3600), 280);
        } else {
          this.playTone(260, 'sawtooth', 0.2, 0.3, this.sfxGain, 1000, 180);
          setTimeout(() => this.ctx && this.playTone(180, 'sawtooth', 0.2, 0.48, this.sfxGain, 800, 85), 220);
        }
        break;
    }
  }
}
