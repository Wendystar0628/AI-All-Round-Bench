// Ambient sound of the rainy harbour, fully synthesised: rain (distant wash + drops on armour, quay and containers),
// sea (low swell, slosh, breaking water at the legs and along the quay edge, the big wave's approach, slap and spray),
// wind with gusts, thunder synchronised with the lightning, three helicopter rotors, the reactor turbine, the freighter's
// creaking hull and distant harbour horns. No music.
//
// One mixing model drives both the live AudioContext (following whatever camera is active) and the offline render of
// the tour (videoExport.audio()): levels, panning and filters depend on where the camera is, and every timed sound is
// derived from the same deterministic schedules the visuals use (scripted / random events, the spray bursts at the legs
// and the quay, the helicopters' hover paths, the ship's heave).
import * as THREE from 'three';
import * as S from './synth.js';
import { encodeWAV } from './wav.js';
import { EVENT_DUR, WAVE } from '../events.js';
import { SEA_LEVEL, seaHeight } from '../env/sea.js';
import { SHIP, QUAY_Z } from '../env/port.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
// same hash as the GLSL h11() of the spray emitters
const h11 = (x) => { const v = Math.sin(x * 127.1) * 43758.5453; return v - Math.floor(v); };

// calibration: 1 / RMS of each layer's chain at unit gain (measured), so the mix values below are target RMS levels
const CAL = {
  rainFar: 2.27, rainNear: 2.07, rainHard: 2.03, swell: 2.04, slosh: 5.47, crash: 2.03, quay: 9.5, bigWash: 1.83,
  windLow: 2.02, windHowl: 10.4, whistle: 24.6, heli: 5.1, reactor: 0.66,
};
const SR_OFFLINE = 48000;
const CTRL_RATE = 100;       // control-rate samples per second for the offline automation curves

export function createAmbience({ M, helis, events, tour }) {
  // ================================================================ deterministic world model for sound
  const defs = helis.helis.map((h) => h.def);
  const heliPos = (i, T, out) => {
    const d = defs[i], ph = d.phase;   // same hover path as env/heli.js
    return out.set(d.base.x + Math.sin(T * 0.21 + ph) * 3.0 + Math.sin(T * 0.53 + ph * 2) * 0.8,
      d.base.y + Math.sin(T * 0.37 + ph) * 1.6 + Math.sin(T * 0.91 + ph) * 0.35, d.base.z + Math.cos(T * 0.17 + ph) * 3.0);
  };
  const gustAt = (T, list) => {
    let g = 0;
    for (const ev of list) {
      if (ev.type !== 'gust') continue;
      const tau = T - ev.t0, dur = EVENT_DUR.gust;
      if (tau >= 0 && tau <= dur) g = Math.max(g, sm(0, 1.6, tau) * (1 - sm(dur - 2.4, dur, tau)));
    }
    return g;
  };
  const waveRun = (WAVE.z0 - WAVE.legZ) / WAVE.speed, quayRun = (WAVE.z0 + 60) / WAVE.speed;
  const waveState = (T, list) => {
    for (const ev of list) {
      if (ev.type !== 'wave') continue;
      const tau = T - ev.t0;
      if (tau > -1 && tau < EVENT_DUR.wave + 6) return { t0: ev.t0, z: WAVE.z0 - WAVE.speed * tau, hit: ev.t0 + waveRun };
    }
    return null;
  };
  // breaking water at a leg: same burst clock as the spray bursts in env/fx.js (period 4.2 s, offset by the leg's x)
  const legEnv = (T, x) => {
    const c = T / 4.2 + x * 0.13, k0 = Math.floor(c);
    let e = 0;
    for (let k = k0 - 1; k <= k0; k++) {
      const tau = T - (k - x * 0.13) * 4.2;
      if (tau < 0) continue;
      e += (0.55 + 0.45 * h11(k * 5.3 + x)) * (1 - Math.exp(-tau / 0.06)) * (Math.exp(-tau / 0.55) + 0.35 * Math.exp(-tau / 1.6));
    }
    return e;
  };
  // waves breaking along the quay edge: 18 m slots, each with its own period, as in env/fx.js
  const slotEnv = (T, slot) => {
    const per = 5 + h11(slot) * 4, off = h11(slot * 3.3), k0 = Math.floor(T / per + off);
    let e = 0;
    for (let k = k0 - 1; k <= k0; k++) {
      if (h11(k * 1.37 + slot) < 0.45) continue;
      const tau = T - (k - off) * per;
      if (tau < 0) continue;
      e += (1 - Math.exp(-tau / 0.08)) * (Math.exp(-tau / 0.8) + 0.3 * Math.exp(-tau / 2.0));
    }
    return e;
  };
  // distant harbour horns (world-time schedule), the freighter's creaks at the turning points of its heave
  const hornAt = (k) => ({ T: 2 + k * 47 + h11(k * 2.7 + 0.31) * 11, seed: 1 + (k & 1), pos: (k & 1) ? V(1300, 25, 2300) : V(-1500, 30, -1800) });
  const heaveVel = (T) => 0.147 * Math.cos(T * 0.42) + 0.034 * Math.cos(T * 0.17 + 1.3);
  const SHIP_P = V(-115, 17, SHIP.z);
  const LEGS = V((M.legL.x + M.legR.x) / 2, SEA_LEVEL + 1.5, (M.legL.z + M.legR.z) / 2);

  // one-shot sounds whose onset falls in [T0, T1)
  function shotsIn(T0, T1, list, camPosAt) {
    const out = [];
    for (const ev of list) {
      if (ev.type === 'lightning') {
        // the thunder follows the flash; the farther the strike, the later (and duller) it arrives
        const P = V(ev.pos[0], ev.pos[1], ev.pos[2]);
        const d = camPosAt(ev.t0).distanceTo(P);
        const T = ev.t0 + 0.08 + clamp((d - 350) * 0.0012, 0, 2.5);
        if (T >= T0 && T < T1) out.push({ key: 'th' + ev.t0, kind: d < 1050 ? 'thunderNear' : 'thunderFar', T, pos: P, gain: clamp(900 / d, 0.6, 1.05), ref: 0, variant: (ev.seed >>> 0) % 3, send: 0.45 });
      } else if (ev.type === 'wave') {
        const hit = ev.t0 + waveRun, quay = ev.t0 + quayRun;
        const add = (k, kind, T, pos, gain, ref, variant, send) => { if (T >= T0 && T < T1) out.push({ key: k + ev.t0, kind, T, pos, gain, ref, variant, send }); };
        add('ws', 'slap', hit, LEGS, 2.4, 24, 0, 0.25);
        add('wp', 'spray', hit + 0.12, LEGS.clone().add(V(0, 6, 1)), 1.25, 26, 0, 0.2);
        add('qs', 'slap', quay, V(0, 16, QUAY_Z + 0.5), 1.4, 30, 1, 0.3);
        add('qp', 'spray', quay + 0.15, V(0, 18, QUAY_Z + 2), 0.8, 30, 1, 0.2);
      }
    }
    for (let k = Math.max(0, Math.floor((T0 - 14) / 47) - 1); ; k++) {
      const h = hornAt(k);
      if (h.T >= T1) break;
      if (h.T >= T0) out.push({ key: 'hn' + k, kind: 'horn', T: h.T, pos: h.pos, gain: 0.11, ref: 0, variant: h.seed - 1, send: 0.5 });
    }
    // creaks: where the heave velocity changes sign (skip some), scanned on a fixed 0.05 s grid
    const g0 = Math.floor(T0 / 0.05), g1 = Math.ceil(T1 / 0.05);
    for (let g = g0; g < g1; g++) {
      const ta = g * 0.05, tb = ta + 0.05;
      if (Math.sign(heaveVel(ta)) === Math.sign(heaveVel(tb))) continue;
      if (h11(g * 0.917) < 0.3) continue;
      out.push({ key: 'cr' + g, kind: 'creak', T: tb, pos: SHIP_P, gain: 0.17, ref: 32, variant: g & 3, send: 0.3 });
    }
    return out;
  }

  // the mix at world time T for a camera at C with right vector Rt: target RMS levels, pans, filter frequencies
  const tA = V(), tB = V();
  const spatial = (P, C, Rt, ref) => {
    tA.subVectors(P, C);
    const d = Math.max(0.5, tA.length());
    return { d, pan: clamp(tA.dot(Rt) / d, -1, 1) * 0.9, att: ref > 0 ? 1 / (1 + d / ref) : 1 };
  };
  function mixAt(T, C, Rt, list) {
    const m = {};
    const gust = gustAt(T, list);
    const rainLevel = 1 + 0.12 * Math.sin(T * 0.071) + 0.08 * Math.sin(T * 0.193 + 1) + 0.55 * gust;
    const windLevel = 1 + 0.15 * Math.sin(T * 0.13) + 0.1 * Math.sin(T * 0.29 + 2) + 1.1 * gust;
    const hSea = Math.max(0, C.y - SEA_LEVEL);
    const nearSea = 1 - sm(3, 45, hSea), high = sm(25, 110, hSea);
    const dMech = Math.max(0, Math.hypot(C.x, C.z, C.y - clamp(C.y, 8, 66)) - 8);
    const nearMech = 1 - sm(4, 42, dMech);
    const far = sm(70, 260, Math.hypot(C.x, C.y - 40, C.z));
    const dQuay = Math.hypot(C.y - 15.5, Math.max(0, C.z - QUAY_Z), Math.max(0, Math.abs(C.x) - 420));
    const nearQuay = Math.max(1 - sm(8, 85, dQuay), sm(QUAY_Z + 4, QUAY_Z - 12, C.z) * (1 - sm(20, 60, C.y - 16)));
    // rain: the distant wash dominates high up and far away; drops on armour near the mech, on the quay near the port
    m.rainFar = 0.05 * rainLevel * (0.8 + 0.35 * high + 0.25 * far) * (1 - 0.2 * nearMech);
    m.rainNear = 0.05 * rainLevel * nearMech;
    m.rainHard = 0.042 * rainLevel * nearQuay;
    // sea: low swell and slosh, stronger close to the water
    const sea = seaHeight(C.x, C.z, T) - SEA_LEVEL;
    const swellMod = 0.78 + 0.22 * clamp(sea / 2.2, -1, 1);
    m.swell = 0.05 * (0.35 + 0.9 * nearSea) * swellMod * (1 - 0.35 * high);
    m.slosh = 0.03 * nearSea * (0.7 + 0.3 * swellMod);
    // water breaking at the legs, synchronised with the spray bursts
    for (const [key, L] of [['legL', M.legL], ['legR', M.legR]]) {
      tB.set(L.x, SEA_LEVEL + 1, L.z);
      const sp = spatial(tB, C, Rt, 18);
      m[key] = 0.2 * legEnv(T, L.x) * sp.att * (0.55 + 0.45 * nearSea);
      m[key + 'Pan'] = sp.pan;
    }
    // waves breaking along the quay edge, gathered per ear
    let qL = 0, qR = 0;
    const s0 = Math.max(-24, Math.floor((C.x - 170) / 18)), s1 = Math.min(23, Math.floor((C.x + 170) / 18));
    for (let s = s0; s <= s1; s++) {
      const e = slotEnv(T, s);
      if (e <= 0) continue;
      tB.set(s * 18 + 7, 15.5, QUAY_Z + 0.7);
      const sp = spatial(tB, C, Rt, 22);
      const w = 0.09 * e * sp.att, a = (sp.pan + 1) * Math.PI / 4;
      qL += w * Math.cos(a); qR += w * Math.sin(a);
    }
    m.quayL = qL; m.quayR = qR;
    // the big wave rolling in toward the legs
    const wv = waveState(T, list);
    if (wv && T < wv.hit + 3) {
      tB.set(0, SEA_LEVEL + 2.5, Math.max(wv.z, WAVE.legZ));
      const sp = spatial(tB, C, Rt, 30);
      const app = Math.pow(sm(wv.t0, wv.hit, T), 1.6) * (T < wv.hit ? 1 : Math.exp(-(T - wv.hit) / 0.6));
      m.bigWash = 0.16 * app * sp.att * (0.55 + 0.45 * nearSea) * 1.7 * (T < wv.hit ? 1 - 0.45 * sm(wv.hit - 0.5, wv.hit, T) : 0.55);
      m.bigWashPan = sp.pan; m.bigWashLp = 300 + 2600 * app;
    } else { m.bigWash = 0; m.bigWashPan = 0; m.bigWashLp = 300; }
    // wind: a steady low rush plus a howl that rises with the gusts
    m.windLow = 0.03 * windLevel * (0.5 + 1.0 * high + 0.25 * far);
    m.windHowl = 0.014 * windLevel * (0.3 + 1.2 * high) * (0.45 + 0.9 * gust);
    m.windF = 480 + 420 * gust + 60 * Math.sin(T * 0.31) + 110 * high;
    m.windQ = 3 + 5 * gust;
    m.whistle = 0.012 * gust * gust * (0.4 + 0.8 * high);
    m.whistleF = m.windF * 2.6;
    // helicopters: low rotor thump, louder and brighter close to the camera
    for (let i = 0; i < 3; i++) {
      heliPos(i, T, tB);
      const sp = spatial(tB, C, Rt, 26);
      m['heli' + i] = 0.085 * sp.att;
      m['heli' + i + 'Pan'] = sp.pan;
      m['heli' + i + 'Lp'] = 160 + 6500 / (1 + sp.d / 28);
    }
    // reactor turbine hum, only up close
    tB.copy(M.reactor).addScaledVector(M.reactorN, 0.6);
    const sr = spatial(tB, C, Rt, 0);
    const pulse = 0.88 + 0.08 * Math.sin(T * 2.1) + 0.04 * Math.sin(T * 5.3);
    m.reactor = 0.12 * pulse / (1 + (sr.d / 16) ** 2);
    m.reactorPan = sr.pan;
    return m;
  }

  // ================================================================ sound bank (per sample rate)
  const banks = {};
  function bank(sr, part = 'all') {
    const B = banks[sr] || (banks[sr] = {});
    if (!B.beds) {
      B.beds = {
        pinkA: S.noiseBed(sr, 11, 'pink', 11.3), pinkB: S.noiseBed(sr, 12, 'pink', 12.7),
        brown: S.noiseBed(sr, 13, 'brown', 12.1), white: S.noiseBed(sr, 14, 'white', 10.4),
        metal: S.patter(sr, 15, 'metal', 8.3), hard: S.patter(sr, 16, 'hard', 9.1),
        ir: S.impulse(sr, 17, 3.2),
      };
    }
    if (part === 'all' && !B.shots) {
      B.shots = {
        thunderNear: [201, 202, 203].map((s) => S.thunder(sr, s, true)),
        thunderFar: [211, 212, 213].map((s) => S.thunder(sr, s, false)),
        slap: [221, 222].map((s) => S.slap(sr, s)),
        spray: [231, 232].map((s) => S.spray(sr, s)),
        creak: [241, 242, 243, 244].map((s) => S.creak(sr, s)),
        horn: [0, 1].map((s) => S.horn(sr, s)),
      };
    }
    return B;
  }
  const toBuf = (ctx, chs) => { const b = ctx.createBuffer(2, chs[0].length, ctx.sampleRate); b.copyToChannel(chs[0], 0); b.copyToChannel(chs[1], 1); return b; };

  // ================================================================ graph (same for live and offline contexts)
  // NOTE: every mixing junction has at most two inputs (binary trees of gain nodes): with three or more inputs a node's
  // summation order is not stable between renders, which would break the bit-exact repeatability of the export.
  function buildGraph(ctx) {
    const sr = ctx.sampleRate, Bk = bank(sr, 'beds');
    const buf = {}; for (const [k, v] of Object.entries(Bk.beds)) if (k !== 'ir') buf[k] = toBuf(ctx, v);
    const sources = [], params = [], busIn = [], verbIn = [];
    const gain = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const filter = (type, f, Q = 0.7, gainDb = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; b.gain.value = gainDb; return b; };
    const pan = () => { const p = ctx.createStereoPanner(); p.pan.value = 0; return p; };
    const src = (name, offset) => { const s = ctx.createBufferSource(); s.buffer = buf[name]; s.loop = true; sources.push([s, offset % buf[name].duration]); return s; };
    const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };
    const P = (name, param, scale = 1) => { param.value = 0; params.push([name, param, scale]); };
    const sumTo = (list, dest) => {
      let level = list.slice();
      while (level.length > 2) { const next = []; for (let i = 0; i < level.length; i += 2) { if (i + 1 < level.length) { const g = gain(1); level[i].connect(g); level[i + 1].connect(g); next.push(g); } else next.push(level[i]); } level = next; }
      for (const n of level) n.connect(dest);
      return dest;
    };
    const send = (node, amount) => { const s = gain(amount); node.connect(s); verbIn.push(s); };

    // master: bus -> compressor -> gain -> soft limiter
    const bus = gain(1);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.3;
    const master = gain(1);
    const shaper = ctx.createWaveShaper();
    { const n = 4097, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x); c[i] = Math.sign(x) * (a < 0.6 ? a : 0.6 + 0.38 * Math.tanh((a - 0.6) / 0.38)); } shaper.curve = c; }
    chain(bus, comp, master, shaper, ctx.destination);
    const verb = ctx.createConvolver(); verb.normalize = false; verb.buffer = toBuf(ctx, Bk.beds.ir);
    const verbOut = chain(verb, gain(0.55)); busIn.push(verbOut);

    // rain
    { const g = gain(); P('rainFar', g.gain, CAL.rainFar); chain(src('pinkA', 0), filter('highpass', 350), filter('peaking', 5000, 0.7, 5), filter('lowpass', 12000), g); busIn.push(g); }
    { const g = gain(); P('rainNear', g.gain, CAL.rainNear); chain(src('metal', 0), g); busIn.push(g); }
    { const g = gain(); P('rainHard', g.gain, CAL.rainHard); chain(src('hard', 0), g); busIn.push(g); }
    // sea
    { const g = gain(); P('swell', g.gain, CAL.swell); chain(src('brown', 0), filter('lowpass', 300, 0.5), filter('lowpass', 340, 0.5), g); busIn.push(g); }
    { const g = gain(); P('slosh', g.gain, CAL.slosh); chain(src('pinkB', 3.1), filter('bandpass', 650, 0.9), g); busIn.push(g); }
    {
      const crash = gain(1);
      chain(src('pinkA', 5.3), filter('bandpass', 900, 0.55), crash);
      chain(src('brown', 6.2), filter('lowpass', 170, 0.7), gain(0.9), crash);
      for (const k of ['legL', 'legR']) {
        const g = gain(), p = pan(); P(k, g.gain, CAL.crash); P(k + 'Pan', p.pan);
        chain(crash, g, p); busIn.push(p); send(p, 0.1);
      }
    }
    {
      const mg = ctx.createChannelMerger(2);
      for (const [k, off, ch] of [['quayL', 1.0, 0], ['quayR', 7.7, 1]]) {
        const g = gain(); P(k, g.gain, CAL.quay);
        chain(src('pinkB', off), filter('bandpass', 750, 0.6), g); g.connect(mg, 0, ch);
      }
      busIn.push(mg); send(mg, 0.1);
    }
    {
      const g = gain(), p = pan(), lp = filter('lowpass', 300, 0.6);
      P('bigWash', g.gain, CAL.bigWash); P('bigWashPan', p.pan); P('bigWashLp', lp.frequency);
      const sum = gain(1);
      chain(src('brown', 2.2), sum); chain(src('pinkB', 9.4), gain(0.6), sum);
      chain(sum, lp, g, p); busIn.push(p); send(p, 0.15);
    }
    // wind
    { const g = gain(); P('windLow', g.gain, CAL.windLow); chain(src('brown', 8.8), filter('lowpass', 240), g); busIn.push(g); }
    { const g = gain(), bp = filter('bandpass', 500, 3); P('windHowl', g.gain, CAL.windHowl); P('windF', bp.frequency); P('windQ', bp.Q); chain(src('pinkA', 8.1), bp, g); busIn.push(g); }
    { const g = gain(), bp = filter('bandpass', 1300, 14); P('whistle', g.gain, CAL.whistle); P('whistleF', bp.frequency); chain(src('white', 2.0), bp, g); busIn.push(g); }
    // helicopters: blade-pass pulse train + rotor-chopped noise + a faint turbine whine, through a distance lowpass
    const pw = S.pulseWave(48, 16), wave = ctx.createPeriodicWave(pw.real, pw.imag);
    [0, 0.035, -0.028].forEach((det, i) => {
      const f0 = 17.8 * (1 + det);
      const lp = filter('lowpass', 1000, 0.7), g = gain(), p = pan();
      P('heli' + i, g.gain, CAL.heli); P('heli' + i + 'Pan', p.pan); P('heli' + i + 'Lp', lp.frequency);
      const osc = ctx.createOscillator(); osc.setPeriodicWave(wave); osc.frequency.value = f0; sources.push([osc, 0]);
      const oscG = chain(osc, gain(0.6));
      const chop = gain(0.5), lfo = ctx.createOscillator(); lfo.frequency.value = f0; sources.push([lfo, 0]);
      lfo.connect(gain(0.5)).connect(chop.gain);
      const chopG = chain(src('white', 3 + i * 2.3), filter('bandpass', 850, 0.7), chop, gain(0.7));
      const wh = ctx.createOscillator(); wh.frequency.value = 2900 * (1 + det); sources.push([wh, 0]);
      const whG = chain(wh, gain(0.012));
      sumTo([oscG, chopG, whG], lp);
      chain(lp, g, p); busIn.push(p); send(p, 0.08);
    });
    // reactor turbine: low harmonic hum + a whirr pulsing at the blade-pass rate
    {
      const g = gain(), p = pan(); P('reactor', g.gain, CAL.reactor); P('reactorPan', p.pan);
      const parts = [];
      for (const [f, a, type] of [[41, 1, 'sine'], [82, 0.42, 'sine'], [123, 0.16, 'triangle'], [246, 0.05, 'sine']]) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; sources.push([o, 0]); parts.push(chain(o, gain(a)));
      }
      const whirr = gain(0.4), lfo = ctx.createOscillator(); lfo.frequency.value = 14 * 1.35 / (2 * Math.PI); sources.push([lfo, 0]);
      lfo.connect(gain(0.35)).connect(whirr.gain);
      parts.push(chain(src('pinkA', 4.4), filter('bandpass', 320, 2.4), whirr, gain(0.6)));
      sumTo(parts, g);
      chain(g, p); busIn.push(p);
    }
    const shotBuf = {};
    const getShot = (kind, v) => {
      const list = bank(sr, 'all').shots[kind], i = v % list.length, key = kind + i;
      return shotBuf[key] || (shotBuf[key] = toBuf(ctx, list[i]));
    };
    // live playback: one-shots arrive at any time, so they share a bus (bit-exactness only matters offline)
    let shotBus = null, shotVerb = null, finalized = false;
    const api = {
      ctx, params, master,
      start(when) { for (const [s, off] of sources) { if (s instanceof AudioBufferSourceNode) s.start(when, off); else s.start(when); } },
      // a one-shot through its own gain + panner (+ reverb send); returns the nodes so its level / pan can follow the camera
      play(os, when) {
        const s = ctx.createBufferSource(); s.buffer = getShot(os.kind, os.variant);
        const g = gain(0), p = pan();
        chain(s, g, p);
        if (finalized) { p.connect(shotBus); if (os.send) p.connect(gain(os.send)).connect(shotVerb); }
        else { busIn.push(p); if (os.send) send(p, os.send); }
        s.start(when);
        return { s, g, p, dur: s.buffer.duration };
      },
      // close the mix: binary summing trees into the bus and the reverb
      finalize(live) {
        if (live) { shotBus = gain(1); shotVerb = gain(1); busIn.push(shotBus); verbIn.push(shotVerb); }
        sumTo(busIn, bus); sumTo(verbIn, verb);
        finalized = true;
      },
    };
    return api;
  }
  const valueOf = (m, name, scale) => (m[name] ?? 0) * scale;

  // ================================================================ live playback
  let ctx = null, G = null, started = false, exporting = false;
  const scheduled = new Map(), live = [];
  const Rt = V();
  function start() {
    if (started) { if (ctx && ctx.state === 'suspended' && !exporting) ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    started = true;
    ctx = new AC({ latencyHint: 'playback' });
    G = buildGraph(ctx);
    G.finalize(true);
    const t0 = ctx.currentTime + 0.05;
    G.start(t0);
    G.master.gain.setValueAtTime(0, t0); G.master.gain.linearRampToValueAtTime(1, t0 + 2.5);
    if (exporting) ctx.suspend(); else ctx.resume();
    // build the one-shot sounds in the background, after the beds are playing
    setTimeout(() => bank(ctx.sampleRate, 'all'), 200);
  }
  function update(T, camera) {
    if (!G || exporting || ctx.state !== 'running') return;
    camera.updateMatrixWorld();
    Rt.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const C = camera.position, list = events.list(), now = ctx.currentTime;
    const m = mixAt(T, C, Rt, list);
    for (const [name, param, scale] of G.params) param.setTargetAtTime(valueOf(m, name, scale), now, 0.06);
    const B = banks[ctx.sampleRate];
    if (B && B.shots) {
      for (const os of shotsIn(T - 0.05, T + 0.35, list, () => C)) {
        if (scheduled.has(os.key)) continue;
        scheduled.set(os.key, T);
        const nd = G.play(os, now + Math.max(0, os.T - T));
        live.push({ os, nd, end: os.T + nd.dur });
      }
    }
    for (let i = live.length - 1; i >= 0; i--) {
      const L = live[i];
      if (T > L.end + 0.5) { live.splice(i, 1); continue; }
      const sp = spatial(L.os.pos, C, Rt, L.os.ref);
      L.nd.g.gain.setTargetAtTime(L.os.gain * sp.att, now, 0.05);
      L.nd.p.pan.setTargetAtTime(sp.pan, now, 0.05);
    }
    if (scheduled.size > 200) for (const [k, t] of scheduled) if (t < T - 120) scheduled.delete(k);
  }
  function setExport(on) {
    exporting = on;
    if (!ctx) return;
    if (on) ctx.suspend(); else if (started) ctx.resume();
  }

  // ================================================================ offline render of the tour
  async function renderTour() {
    const dur = tour.duration, time0 = tour.time0, sr = SR_OFFLINE;
    const N = Math.round(dur * sr);
    const off = new OfflineAudioContext({ numberOfChannels: 2, length: N, sampleRate: sr });
    bank(sr, 'all');
    const g = buildGraph(off);
    const list = tour.events;
    // the tour camera, sampled on the control grid (frame i of the export is at tour time i / fps)
    const K = Math.ceil(dur * CTRL_RATE) + 1;
    const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 20000);
    const CP = new Float32Array(K * 3), CR = new Float32Array(K * 3);
    for (let k = 0; k < K; k++) {
      tour.apply(Math.min(dur, k / CTRL_RATE), cam); cam.updateMatrixWorld();
      Rt.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
      CP.set([cam.position.x, cam.position.y, cam.position.z], k * 3); CR.set([Rt.x, Rt.y, Rt.z], k * 3);
    }
    const camAt = (T, outP, outR) => {
      const x = clamp((T - time0) * CTRL_RATE, 0, K - 1), k = Math.min(K - 2, Math.floor(x)), f = x - k;
      outP.set(CP[k * 3] + (CP[k * 3 + 3] - CP[k * 3]) * f, CP[k * 3 + 1] + (CP[k * 3 + 4] - CP[k * 3 + 1]) * f, CP[k * 3 + 2] + (CP[k * 3 + 5] - CP[k * 3 + 2]) * f);
      if (outR) outR.set(CR[k * 3] + (CR[k * 3 + 3] - CR[k * 3]) * f, CR[k * 3 + 1] + (CR[k * 3 + 4] - CR[k * 3 + 1]) * f, CR[k * 3 + 2] + (CR[k * 3 + 5] - CR[k * 3 + 2]) * f).normalize();
      return outP;
    };
    // continuous layers -> automation curves
    const curves = g.params.map(() => new Float32Array(K));
    const C = V(), R = V();
    for (let k = 0; k < K; k++) {
      const T = time0 + k / CTRL_RATE;
      camAt(T, C, R);
      const m = mixAt(T, C, R, list);
      g.params.forEach(([name, , scale], j) => { curves[j][k] = valueOf(m, name, scale); });
    }
    const span = (K - 1) / CTRL_RATE;
    g.params.forEach(([, param], j) => param.setValueCurveAtTime(curves[j], 0, span));
    // timed sounds: thunder, the big wave's slap and spray, horns, creaks
    const shots = shotsIn(time0, time0 + dur, list, (T) => camAt(T, V()));
    const SHOT_RATE = 50;
    for (const os of shots) {
      const t = os.T - time0;
      const nd = g.play(os, t);
      const n = Math.max(2, Math.ceil(nd.dur * SHOT_RATE) + 1);
      const gc = new Float32Array(n), pc = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        camAt(os.T + i / SHOT_RATE, C, R);
        const sp = spatial(os.pos, C, R, os.ref);
        gc[i] = os.gain * sp.att; pc[i] = sp.pan;
      }
      nd.g.gain.setValueCurveAtTime(gc, t, (n - 1) / SHOT_RATE);
      nd.p.pan.setValueCurveAtTime(pc, t, (n - 1) / SHOT_RATE);
    }
    g.finalize(false);
    g.start(0);
    const out = await off.startRendering();
    const L = out.getChannelData(0), Rch = out.getChannelData(1);
    renderTour.last = { sampleRate: sr, length: N, duration: N / sr, shots: shots.map((s) => ({ kind: s.kind, t: +(s.T - time0).toFixed(3) })) };
    return encodeWAV([L, Rch], sr);
  }

  return { start, update, setExport, renderTour, mixAt, shotsIn, get context() { return ctx; }, get graph() { return G; }, debug: { buildGraph, bank, CAL } };
}
