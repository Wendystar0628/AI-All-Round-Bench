// Procedural sound synthesis (pure JS, deterministic): seeded noise, filters, and the one-shot sounds of the scene.
// Nothing here uses recorded audio; every buffer is computed from seeded random numbers and simple DSP.
import { mulberry32 } from '../materials/noise.js';

export const TAU = Math.PI * 2;

// ------------------------------------------------------------------ filters
// RBJ biquad coefficients -> [b0, b1, b2, a1, a2] (normalised)
export function bq(type, f, Q, sr, gainDb = 0) {
  const w = TAU * Math.min(f, sr * 0.45) / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * Q), A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
export function filt(x, co, from = 0, to = x.length) {
  const [b0, b1, b2, a1, a2] = co;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = from; i < to; i++) {
    const xi = x[i], y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}
// one-pole lowpass with a time-varying cutoff
export function lpVar(x, fcAt, sr) {
  let y = 0;
  for (let i = 0; i < x.length; i++) { const a = 1 - Math.exp(-TAU * fcAt(i / sr) / sr); y += a * (x[i] - y); x[i] = y; }
  return x;
}

// ------------------------------------------------------------------ noise
export function white(n, r) { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = r() * 2 - 1; return a; }
export function pink(n, r) {
  // Paul Kellet's refined pink filter
  const a = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    a[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  return a;
}
export function brown(n, r) {
  const a = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) { y = (y + 0.02 * (r() * 2 - 1)) * 0.997; a[i] = y; }
  return a;
}
export function rms(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, a.length)); }
export function scaleRms(a, target) { const k = target / (rms(a) || 1); for (let i = 0; i < a.length; i++) a[i] *= k; return a; }
export function peakNorm(chs, peak) {
  let m = 1e-9; for (const a of chs) for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  const k = peak / m; for (const a of chs) for (let i = 0; i < a.length; i++) a[i] *= k; return chs;
}
// seamless loop: crossfade the tail into the head (equal power), result is `fade` samples shorter
export function seamless(a, fade) {
  const n = a.length - fade, out = new Float32Array(n);
  out.set(a.subarray(0, n));
  for (let i = 0; i < fade; i++) { const t = i / fade; out[i] = a[n + i] * Math.cos(t * Math.PI / 2) + a[i] * Math.sin(t * Math.PI / 2); }
  return out;
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ looping beds (stereo, normalised to RMS 0.25)
export function noiseBed(sr, seed, kind, seconds) {
  const fade = Math.floor(0.25 * sr), n = Math.floor(seconds * sr) + fade;
  const gen = kind === 'pink' ? pink : kind === 'brown' ? brown : white;
  const out = [1, 2].map(k => {
    const a = gen(n, mulberry32(seed * 31 + k));
    if (kind === 'brown') { filt(a, bq('hp', 30, 0.7, sr)); filt(a, bq('hp', 30, 0.7, sr)); }   // no sub-bass rumble
    return scaleRms(seamless(a, fade), 0.25);
  });
  return out;
}

// rain impacts (looping by wrap-around): 'metal' = drops ringing on armour, 'hard' = concrete + container lids
export function patter(sr, seed, kind, seconds) {
  const n = Math.floor(seconds * sr), L = new Float32Array(n), R = new Float32Array(n);
  const r = mulberry32(seed);
  const rate = kind === 'metal' ? 1150 : 1450, count = Math.floor(rate * seconds);
  for (let d = 0; d < count; d++) {
    const i0 = Math.floor(r() * n), amp = 0.12 + 0.88 * Math.pow(r(), 3), p = r() * 2 - 1;
    const gL = Math.sqrt((1 - p) / 2), gR = Math.sqrt((1 + p) / 2);
    let f, tau, click;
    if (kind === 'metal') { f = 1700 + Math.pow(r(), 1.4) * 5200; tau = 0.003 + r() * 0.011; click = 0.5; }
    else if (r() < 0.09) { f = 650 + r() * 750; tau = 0.016 + r() * 0.022; click = 0.25; }   // hollow container lid
    else { f = 260 + r() * 900; tau = 0.0015 + r() * 0.004; click = 0.9; }                     // concrete / wet ground
    const len = Math.min(Math.floor(tau * 6 * sr), Math.floor(0.12 * sr)), w = TAU * f / sr;
    const rr = Math.exp(-1 / (tau * sr)), cc = 2 * rr * Math.cos(w), r2 = rr * rr;
    let y1 = amp * Math.sin(w), y2 = 0;
    for (let k = 0; k < len; k++) {
      const c = k < 20 ? click * amp * (r() * 2 - 1) * (1 - k / 20) : 0;
      const y = k === 0 ? 0 : cc * y1 - r2 * y2;
      if (k > 0) { y2 = y1; y1 = y; }
      const sv = c + (k === 0 ? 0 : y);
      const j = (i0 + k) % n;
      L[j] += sv * gL; R[j] += sv * gR;
    }
  }
  const hp = bq('hp', kind === 'metal' ? 1100 : 220, 0.7, sr);
  filt(L, hp); filt(R, hp);
  const k = 0.25 / (Math.sqrt((rms(L) ** 2 + rms(R) ** 2) / 2) || 1);
  for (let i = 0; i < n; i++) { L[i] *= k; R[i] *= k; }
  return [L, R];
}

// ------------------------------------------------------------------ one-shots (stereo [L, R])
// thunder: an immediate crack (near strikes) that turns into rolls tumbling through the clouds and fading away
export function thunder(sr, seed, near) {
  const r = mulberry32(seed);
  const dur = near ? 11.5 : 12.5, n = Math.floor(dur * sr);
  const rolls = [];
  rolls.push({ t: near ? 0.03 : 0.25, w: near ? 0.55 : 1.1, a: 1.0, p: (r() - 0.5) * 0.6 });
  let t = rolls[0].t + 0.6 + r() * 0.5, a = 0.82;
  const nr = 4 + Math.floor(r() * 3);
  for (let k = 0; k < nr; k++) { rolls.push({ t, w: 0.7 + r() * 1.1, a: a * (0.75 + r() * 0.35), p: (r() - 0.5) * 1.6 }); t += 0.7 + r() * 1.4; a *= 0.78; }
  const bump = (x, w) => (x <= 0 ? 0 : (x / w) * Math.exp(1 - x / w));
  const out = [];
  for (const side of [-1, 1]) {
    const rr = mulberry32(seed * 7 + (side > 0 ? 3 : 1));
    const b = brown(n, rr);
    filt(b, bq('hp', 22, 0.7, sr)); filt(b, bq('lp', near ? 210 : 150, 0.7, sr)); filt(b, bq('lp', near ? 300 : 190, 0.6, sr));
    scaleRms(b, 1);
    const m = pink(n, mulberry32(seed * 13 + (side > 0 ? 5 : 2)));
    filt(m, bq('hp', 90, 0.7, sr)); filt(m, bq('lp', near ? 1100 : 520, 0.7, sr));
    scaleRms(m, 1);
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const tt = i / sr;
      let e = 0, em = 0;
      for (let k = 0; k < rolls.length; k++) {
        const R0 = rolls[k], g = Math.sqrt((1 + side * R0.p) / 2) * Math.SQRT2;
        const v = R0.a * bump(tt - R0.t, R0.w) * g;
        e += v; if (k < 3) em += v;
      }
      const fade = Math.exp(-tt / (near ? 4.2 : 5.0)) * (1 - smooth(dur - 1.2, dur, tt));
      ch[i] = (b[i] * e * 0.75 + m[i] * em * (near ? 0.22 : 0.1) * Math.exp(-tt / 1.6)) * fade;
    }
    out.push(ch);
  }
  if (near) {
    // the crack: a ripping, crackling burst right after the flash, with a low boom under it
    const crack = white(Math.floor(0.9 * sr), mulberry32(seed * 17 + 9));
    filt(crack, bq('hp', 260, 0.7, sr)); filt(crack, bq('lp', 6500, 0.7, sr));
    const spikes = []; for (let k = 0; k < 9; k++) spikes.push([0.004 + k * 0.022 + r() * 0.018, 0.5 + r() * 0.5]);
    let ph = 0;
    for (let i = 0; i < crack.length; i++) {
      const tt = i / sr;
      let e = (1 - Math.exp(-tt / 0.0025)) * Math.exp(-tt / 0.16) * 0.9;
      for (const [ts, sa] of spikes) if (tt > ts) e += sa * Math.exp(-(tt - ts) / 0.009);
      const f = 34 + 46 * Math.exp(-tt / 0.07); ph += TAU * f / sr;
      const boom = Math.sin(ph) * (1 - Math.exp(-tt / 0.004)) * Math.exp(-tt / 0.45);
      const s = crack[i] * e * 2.1 + boom * 1.1;
      out[0][i] += s; out[1][i] += s * (0.92 + 0.08 * Math.sin(tt * 40));
    }
  }
  return peakNorm(out, 0.95);
}

// heavy slap of a big wave against a shin
export function slap(sr, seed) {
  const n = Math.floor(2.4 * sr), out = [];
  for (const k of [1, 2]) {
    const r = mulberry32(seed * 19 + k);
    const imp = white(n, r); filt(imp, bq('lp', 1300, 0.7, sr));
    const spl = white(n, mulberry32(seed * 23 + k)); filt(spl, bq('bp', 2700, 0.6, sr));
    const ch = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = 37 + 44 * Math.exp(-t / 0.06); ph += TAU * f / sr;
      const thump = Math.sin(ph) * (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.24);
      const body = imp[i] * Math.exp(-t / 0.085) * 1.4;
      const t2 = t - 0.018;
      const splash = t2 > 0 ? spl[i] * (1 - Math.exp(-t2 / 0.01)) * Math.exp(-t2 / 0.3) * 2.2 : 0;
      ch[i] = thump * 1.0 + body + splash;
    }
    out.push(ch);
  }
  return peakNorm(out, 0.95);
}

// the spray falling back onto the sea: a wide hiss with droplets thinning out
export function spray(sr, seed) {
  const dur = 4.8, n = Math.floor(dur * sr), out = [];
  for (const k of [1, 2]) {
    const r = mulberry32(seed * 29 + k);
    const h = pink(n, r); filt(h, bq('hp', 450, 0.7, sr)); filt(h, bq('lp', 7800, 0.7, sr)); scaleRms(h, 1);
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; ch[i] = h[i] * (1 - Math.exp(-t / 0.22)) * (t < 0.9 ? 1 : Math.exp(-(t - 0.9) / 1.15)) * 0.5; }
    // droplets
    const drops = Math.floor(900);
    for (let d = 0; d < drops; d++) {
      const t0 = Math.pow(r(), 1.8) * (dur - 0.3), i0 = Math.floor(t0 * sr), f = 1300 + r() * 3800, tau = 0.004 + r() * 0.008, a = (0.25 + 0.75 * r()) * Math.exp(-t0 / 1.6) * 0.35;
      const len = Math.floor(tau * 6 * sr);
      for (let j = 0; j < len && i0 + j < n; j++) ch[i0 + j] += a * Math.sin(TAU * f * j / sr) * Math.exp(-j / (tau * sr));
    }
    out.push(ch);
  }
  return peakNorm(out, 0.8);
}

// hull creak / groan of the moored freighter working in the swell
export function creak(sr, seed) {
  const r = mulberry32(seed);
  const dur = 1.1 + r() * 0.8, n = Math.floor(dur * sr);
  const f0 = 230 + r() * 220, mono = new Float32Array(n);
  // stick-slip impulse train with a wandering rate
  let next = 0, ph = r() * TAU;
  const rate0 = 22 + r() * 14, wob = 0.5 + r() * 0.8;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (i >= next) { mono[i] += (0.5 + 0.5 * r()) * (r() < 0.5 ? 1 : -1); const rate = rate0 * (1 + 0.35 * Math.sin(TAU * wob * t + ph)) * (0.85 + 0.3 * r()); next = i + Math.max(1, Math.floor(sr / rate)); }
  }
  const a = Float32Array.from(mono), b = Float32Array.from(mono);
  filt(a, bq('bp', f0, 9, sr)); filt(b, bq('bp', f0 * 2.13, 7, sr));
  const groanF = 48 + r() * 14;
  const out = new Float32Array(n);
  let gp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, env = smooth(0, 0.18, t) * (1 - smooth(dur - 0.45, dur, t));
    gp += TAU * groanF * (1 + 0.04 * Math.sin(TAU * 1.3 * t)) / sr;
    out[i] = (a[i] * 1.0 + b[i] * 0.45) * env * (0.6 + 0.4 * Math.sin(TAU * 2.1 * t + ph)) + Math.sin(gp) * env * 0.05;
  }
  const L = out, R = new Float32Array(n), dl = Math.floor(0.004 * sr);
  for (let i = 0; i < n; i++) R[i] = out[Math.max(0, i - dl)];
  return peakNorm([L, R], 0.8);
}

// distant harbour horn (two-tone)
export function horn(sr, seed) {
  const r = mulberry32(seed);
  const pairs = [[87.3, 116.5], [98, 123.5], [73.4, 98]];
  const [fa, fb] = pairs[seed % pairs.length];
  const dur = 8.5, n = Math.floor(dur * sr), hold = 3.6 + r() * 1.2;
  const mono = new Float32Array(n);
  const phs = Array.from({ length: 32 }, () => r() * TAU);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = smooth(0, 0.55, t) * (t < hold ? 1 : Math.exp(-(t - hold) / 0.9));
    if (env < 1e-5 && t > hold) continue;
    const vib = 1 + 0.003 * Math.sin(TAU * 0.6 * t);
    let s = 0;
    for (let h = 1; h <= 16; h++) {
      const g = Math.exp(-h * fa / 1100) / h;
      s += g * Math.sin(phs[h] + TAU * fa * h * vib * t) + 0.85 * Math.exp(-h * fb / 1100) / h * Math.sin(phs[15 + h] + TAU * fb * h * vib * t);
    }
    mono[i] = s * env;
  }
  filt(mono, bq('lp', 1300, 0.6, sr));
  const R = new Float32Array(n), dl = Math.floor(0.006 * sr);
  for (let i = 0; i < n; i++) R[i] = mono[Math.max(0, i - dl)] * 0.96;
  return peakNorm([mono, R], 0.8);
}

// reverb impulse response: a few early reflections and a darkening exponential tail
export function impulse(sr, seed, seconds) {
  const n = Math.floor(seconds * sr), out = [];
  for (const k of [1, 2]) {
    const r = mulberry32(seed * 37 + k);
    const a = white(n, r);
    lpVar(a, (t) => 600 + 7400 * Math.exp(-t / 0.7), sr);
    for (let i = 0; i < n; i++) { const t = i / sr; a[i] *= Math.exp(-6.9 * t / (seconds * 0.85)) * smooth(0, 0.012, t); }
    for (let e = 0; e < 7; e++) { const i = Math.floor((0.008 + r() * 0.07) * sr); a[i] += (r() - 0.5) * 0.9; }
    out.push(a);
  }
  // energy normalise so the wet level is predictable
  let s = 0; for (const a of out) for (let i = 0; i < n; i++) s += a[i] * a[i];
  const k = 1 / Math.sqrt(s / 2);
  for (const a of out) for (let i = 0; i < n; i++) a[i] *= k * 0.9;
  return out;
}

// periodic-wave coefficient tables
export function pulseWave(nh, roll) {
  const real = new Float32Array(nh + 1), imag = new Float32Array(nh + 1);
  for (let h = 1; h <= nh; h++) real[h] = Math.exp(-h / roll) * (h <= 10 ? 1 : 10 / h);
  return { real, imag };
}
