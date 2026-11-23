import { AudioContent, AudioEvent, Composition, Layer } from '../core/types';
import { clamp, hashString } from '../core/math';
import { EvalContext } from '../core/expressions';

class ProceduralAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private activeNodes = new Set<AudioNode>();
  public unlocked = false;

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.72;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx, 2.0);
      this.reverbNode = this.createSyntheticReverb(this.ctx, 2.2, 2.8);
      this.reverbNode.connect(this.masterGain);
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.unlocked = true;
  }

  public stopAll(): void {
    for (const node of this.activeNodes) {
      try {
        if ('stop' in node && typeof (node as any).stop === 'function') (node as any).stop();
        node.disconnect();
      } catch {}
    }
    this.activeNodes.clear();
  }

  /** Trigger any audio layer events crossing (prevTime, currTime] during live playback */
  public syncPlayback(
    comp: Composition,
    prevTime: number,
    currTime: number,
    isPlaying: boolean,
    isExportMode: boolean
  ): void {
    if (!isPlaying || isExportMode || !this.ctx || !this.masterGain || this.ctx.state !== 'running') {
      return;
    }
    if (currTime <= prevTime || currTime - prevTime > 0.25) return;

    const ec = new EvalContext(comp);
    for (const layer of comp.layers) {
      if (layer.type !== 'audio' || !layer.audio || !layer.visible || layer.audio.muted) continue;
      if (currTime < layer.inPoint || prevTime > layer.outPoint) continue;
      const ac = layer.audio;

      for (const ev of ac.events) {
        if (ev.time > prevTime && ev.time <= currTime) {
          this.triggerEvent(comp, layer, ac, ev, currTime, ec);
        }
      }
    }
  }

  /** Audition a single event immediately (e.g. clicking Test Sound in Inspector) */
  public previewLayer(comp: Composition, layer: Layer, time: number): void {
    this.unlock();
    if (!layer.audio || !this.ctx) return;
    const ec = new EvalContext(comp);
    const ev = layer.audio.events[0] ?? { id: 'preview', time, duration: 1.2, pitch: 110, velocity: 0.9 };
    this.triggerEvent(comp, layer, layer.audio, ev, time, ec);
  }

  private triggerEvent(
    comp: Composition,
    layer: Layer,
    ac: AudioContent,
    ev: AudioEvent,
    time: number,
    ec: EvalContext
  ): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const gainVal = clamp((ec.evaluateProp(layer, ac.gain, 'audio.gain', time) as number) * ev.velocity, 0, 2.0);
    if (gainVal < 0.005) return;

    const pitchShift = ec.evaluateProp(layer, ac.pitchShift, 'audio.pitchShift', time) as number;
    const cutoff = clamp(ec.evaluateProp(layer, ac.filterCutoff, 'audio.filterCutoff', time) as number, 80, 14000);
    const decay = clamp(ec.evaluateProp(layer, ac.decay, 'audio.decay', time) as number, 0.05, 6.0);
    const revMix = clamp(ec.evaluateProp(layer, ac.reverbMix, 'audio.reverbMix', time) as number, 0, 1);

    const freq = Math.max(24, ev.pitch * Math.pow(2, pitchShift / 12));
    const dur = Math.max(0.08, Math.min(ev.duration || decay, 6.5));

    const outBus = ctx.createGain();
    outBus.gain.value = gainVal;
    const dry = ctx.createGain();
    dry.gain.value = 1 - revMix * 0.45;
    outBus.connect(dry);
    dry.connect(this.masterGain);
    if (this.reverbNode && revMix > 0.01) {
      const wet = ctx.createGain();
      wet.gain.value = revMix * 0.65;
      outBus.connect(wet);
      wet.connect(this.reverbNode);
    }

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, now);
    filter.Q.value = 1.4;
    filter.connect(outBus);

    const trackNode = (n: AudioNode, stopAt: number) => {
      this.activeNodes.add(n);
      if ('onended' in n) {
        (n as any).onended = () => {
          this.activeNodes.delete(n);
          try { n.disconnect(); } catch {}
        };
      }
      if ('stop' in n && typeof (n as any).stop === 'function') {
        try { (n as any).stop(stopAt); } catch {}
      }
    };

    if (ac.preset === 'forgeStrike') {
      // 1. Sub-bass impact punch
      const sub = ctx.createOscillator();
      const subEnv = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(Math.max(95, freq * 1.6), now);
      sub.frequency.exponentialRampToValueAtTime(34, now + 0.24);
      subEnv.gain.setValueAtTime(0.001, now);
      subEnv.gain.linearRampToValueAtTime(0.95, now + 0.006);
      subEnv.gain.exponentialRampToValueAtTime(0.001, now + Math.min(0.8, decay));
      sub.connect(subEnv); subEnv.connect(outBus);
      sub.start(now); trackNode(sub, now + decay + 0.1);

      // 2. Metallic inharmonic anvil clang partials
      const ratios = [1.0, 2.756, 4.18, 5.83, 7.21];
      ratios.forEach((r, idx) => {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = idx % 2 === 0 ? 'triangle' : 'square';
        osc.frequency.setValueAtTime(freq * 3.2 * r, now);
        const amp = 0.28 / (idx + 1);
        const partDec = decay / (1 + idx * 0.45);
        env.gain.setValueAtTime(0.001, now);
        env.gain.linearRampToValueAtTime(amp, now + 0.003);
        env.gain.exponentialRampToValueAtTime(0.0008, now + partDec);
        osc.connect(env); env.connect(filter);
        osc.start(now); trackNode(osc, now + partDec + 0.05);
      });

      // 3. Sharp impact metallic burst noise
      if (this.noiseBuffer) {
        const ns = ctx.createBufferSource();
        ns.buffer = this.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(2400, now);
        bp.Q.value = 1.6;
        const nEnv = ctx.createGain();
        nEnv.gain.setValueAtTime(0.6, now);
        nEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        ns.connect(bp); bp.connect(nEnv); nEnv.connect(outBus);
        ns.start(now); trackNode(ns, now + 0.18);
      }
    } else if (ac.preset === 'metalRing') {
      const ratios = [1.0, 1.502, 2.41, 3.89];
      ratios.forEach((r, idx) => {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * 4 * r, now);
        const pDec = decay * (1.1 - idx * 0.18);
        env.gain.setValueAtTime(0.001, now);
        env.gain.linearRampToValueAtTime(0.24 / (idx + 1), now + 0.015);
        env.gain.exponentialRampToValueAtTime(0.0008, now + Math.max(0.2, pDec));
        osc.connect(env); env.connect(filter);
        osc.start(now); trackNode(osc, now + pDec + 0.08);
      });
      // Soft quench steam hiss
      if (this.noiseBuffer) {
        const ns = ctx.createBufferSource();
        ns.buffer = this.noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(3200, now);
        const nEnv = ctx.createGain();
        nEnv.gain.setValueAtTime(0.001, now);
        nEnv.gain.linearRampToValueAtTime(0.18, now + 0.08);
        nEnv.gain.exponentialRampToValueAtTime(0.001, now + Math.min(1.8, decay));
        ns.connect(hp); hp.connect(nEnv); nEnv.connect(outBus);
        ns.start(now); trackNode(ns, now + Math.min(1.9, decay + 0.1));
      }
    } else if (ac.preset === 'brushStroke') {
      if (this.noiseBuffer) {
        const ns = ctx.createBufferSource();
        ns.buffer = this.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(freq * 2.5, now);
        bp.frequency.exponentialRampToValueAtTime(freq * 6.0, now + dur * 0.7);
        bp.Q.value = 3.2;
        const nEnv = ctx.createGain();
        nEnv.gain.setValueAtTime(0.001, now);
        nEnv.gain.linearRampToValueAtTime(0.32, now + dur * 0.18);
        nEnv.gain.exponentialRampToValueAtTime(0.001, now + dur);
        ns.connect(bp); bp.connect(nEnv); nEnv.connect(outBus);
        ns.start(now); trackNode(ns, now + dur + 0.05);
      }
      const chime = ctx.createOscillator();
      const cEnv = ctx.createGain();
      chime.type = 'triangle';
      chime.frequency.setValueAtTime(freq * 2, now);
      cEnv.gain.setValueAtTime(0.001, now);
      cEnv.gain.linearRampToValueAtTime(0.18, now + 0.01);
      cEnv.gain.exponentialRampToValueAtTime(0.0008, now + Math.min(0.65, decay));
      chime.connect(cEnv); cEnv.connect(filter);
      chime.start(now); trackNode(chime, now + 0.7);
    } else if (ac.preset === 'emberCrackle') {
      if (this.noiseBuffer) {
        const ns = ctx.createBufferSource();
        ns.buffer = this.noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'bandpass';
        hp.frequency.setValueAtTime(4800, now);
        hp.Q.value = 2.5;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.35, now);
        env.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        ns.connect(hp); hp.connect(env); env.connect(outBus);
        ns.start(now); trackNode(ns, now + 0.1);
      }
    } else if (ac.preset === 'subBass' || ac.preset === 'padDrone') {
      const detunes = ac.preset === 'padDrone' ? [1.0, 1.004, 1.498, 2.003] : [1.0, 0.5, 1.005];
      detunes.forEach((r, idx) => {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = ac.preset === 'padDrone' ? (idx < 2 ? 'sawtooth' : 'triangle') : 'sawtooth';
        osc.frequency.setValueAtTime(freq * r, now);
        const atk = Math.min(0.6, dur * 0.3);
        const rel = Math.max(0.2, dur * 0.4);
        env.gain.setValueAtTime(0.001, now);
        env.gain.linearRampToValueAtTime(0.22 / detunes.length, now + atk);
        env.gain.setValueAtTime(0.20 / detunes.length, now + Math.max(atk, dur - rel));
        env.gain.exponentialRampToValueAtTime(0.0008, now + dur);
        osc.connect(env); env.connect(filter);
        osc.start(now); trackNode(osc, now + dur + 0.05);
      });
    } else {
      // synthArp
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      env.gain.setValueAtTime(0.001, now);
      env.gain.linearRampToValueAtTime(0.32, now + 0.008);
      env.gain.exponentialRampToValueAtTime(0.001, now + Math.min(dur, decay));
      osc.connect(env); env.connect(filter);
      osc.start(now); trackNode(osc, now + Math.min(dur, decay) + 0.05);
    }
  }

  /**
   * Deterministic acoustic energy (0..1) at exact composition time `t`!
   * Used for Timeline waveforms, audio track meters, and 100% deterministic videoExport visual sync.
   */
  public computeLevelAtTime(comp: Composition, layer: Layer, time: number): number {
    if (!layer.audio || !layer.visible || layer.audio.muted || time < layer.inPoint || time > layer.outPoint) {
      return 0;
    }
    const ec = new EvalContext(comp);
    const ac = layer.audio;
    const gain = clamp(ec.evaluateProp(layer, ac.gain, 'audio.gain', time) as number, 0, 2);
    const decay = Math.max(0.08, ec.evaluateProp(layer, ac.decay, 'audio.decay', time) as number);
    let energy = 0;
    for (const ev of ac.events) {
      const dt = time - ev.time;
      const dur = Math.max(ev.duration || decay, decay);
      if (dt < 0 || dt > dur) continue;
      let env = 0;
      if (ac.preset === 'padDrone' || ac.preset === 'subBass') {
        const atk = Math.min(0.5, dur * 0.25);
        const rel = Math.max(0.25, dur * 0.35);
        if (dt < atk) env = dt / atk;
        else if (dt > dur - rel) env = Math.max(0, (dur - dt) / rel);
        else env = 1.0;
      } else {
        env = Math.exp((-3.6 * dt) / Math.max(0.12, decay));
      }
      energy += env * ev.velocity * gain;
    }
    return clamp(energy, 0, 1);
  }

  /** Deterministic pseudo-waveform amplitude in [-1, 1] for rendering crisp timeline audio bars */
  public sampleWaveformForTimeline(comp: Composition, layer: Layer, time: number): number {
    const level = this.computeLevelAtTime(comp, layer, time);
    if (level < 0.002) return 0;
    const h = hashString(`${layer.id}:${Math.floor(time * 90)}`);
    const osc = Math.sin(time * 48 + (h % 628) * 0.01) * 0.65 + 0.35;
    return clamp(level * (0.55 + 0.45 * Math.abs(osc)), 0, 1);
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 987654321;
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    return buf;
  }

  private createSyntheticReverb(ctx: AudioContext, duration: number, decay: number): ConvolverNode {
    const conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    let seed = 1357911;
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const n = (seed / 4294967296) * 2 - 1;
        data[i] = n * Math.pow(1 - i / len, decay);
      }
    }
    conv.buffer = buf;
    return conv;
  }
}

export const audioEngine = new ProceduralAudioEngine();
