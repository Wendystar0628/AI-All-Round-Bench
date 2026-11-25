"use strict";

// The tour is rendered on an integer sample clock. Summing in score order
// also fixes the rounding of quiet samples when many emitters arrive together.
async function renderHarbourWav({
  clips,
  sources,
  rate,
  seconds,
  controlRate,
  frameAt,
  poseAt,
  mixAt,
  cueTime,
  reflections,
  masterCurve,
}) {
  const length = Math.round(rate * seconds),
    blockSize = Math.round(rate / controlRate);
  const bytes = new ArrayBuffer(44 + length * 4),
    wave = new DataView(bytes);
  function tag(at, s) {
    for (let i = 0; i < s.length; i++) wave.setUint8(at + i, s.charCodeAt(i));
  }
  tag(0, "RIFF");
  wave.setUint32(4, bytes.byteLength - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  wave.setUint32(16, 16, true);
  wave.setUint16(20, 1, true);
  wave.setUint16(22, 2, true);
  wave.setUint32(24, rate, true);
  wave.setUint32(28, rate * 4, true);
  wave.setUint16(32, 4, true);
  wave.setUint16(34, 16, true);
  tag(36, "data");
  wave.setUint32(40, length * 4, true);

  // Web Audio low/high-pass Q is expressed in dB. These are the same
  // second-order sections used in the live distance and reflection paths.
  function coefficients(hz, qDb, high = false) {
    const w = (2 * Math.PI * hz) / rate,
      c = Math.cos(w),
      alpha = Math.sin(w) / (2 * 10 ** (qDb / 20));
    return {
      b: (high ? 1 + c : 1 - c) / 2 / (1 + alpha),
      a1: (-2 * c) / (1 + alpha),
      a2: (1 - alpha) / (1 + alpha),
    };
  }
  function fixedFilter(hz, qDb, high = false) {
    const { b, a1, a2 } = coefficients(hz, qDb, high),
      middle = high ? -2 : 2;
    let z1 = 0,
      z2 = 0;
    return (x) => {
      const input = b * x,
        y = input + z1;
      z1 = middle * input - a1 * y + z2;
      z2 = input - a2 * y;
      return y;
    };
  }
  function pressure(x) {
    const k = (clamp(x, -1, 1) + 1) * 0.5 * (masterCurve.length - 1);
    const lo = Math.min(Math.floor(k), masterCurve.length - 2);
    return mix(masterCurve[lo], masterCurve[lo + 1], k - lo);
  }
  const left = new Float64Array(blockSize),
    right = new Float64Array(blockSize),
    send = new Float64Array(blockSize);
  const lowCutLeft = fixedFilter(23, 0.65, true),
    lowCutRight = fixedFilter(23, 0.65, true);
  const echoes = reflections.map(([time, pan, level, hz]) => {
    const delay = new Float64Array(Math.round(time * rate)),
      filter = fixedFilter(hz, 0.6);
    const angle = ((1 + pan) * Math.PI) / 4,
      gL = level * Math.cos(angle),
      gR = level * Math.sin(angle);
    let head = 0;
    return (count) => {
      for (let i = 0; i < count; i++) {
        const y = filter(delay[head]);
        delay[head] = send[i];
        head = (head + 1) % delay.length;
        left[i] += y * gL;
        right[i] += y * gR;
      }
    };
  });

  const first = frameAt(0),
    voices = [];
  function voice(s, onset, volume) {
    const clip = clips[s.clip],
      loop = !s.cues,
      step = (clip.sampleRate * (s.rate ?? 1)) / rate;
    const firstSample = Math.round(onset * rate),
      lastSample = loop ? length : firstSample + Math.ceil(clip.samples.length / step);
    const samples = clip.samples,
      n = samples.length;
    let phase = loop ? ((s.offset ?? 0) * (s.rate ?? 1) * clip.sampleRate) % n : 0;
    let [gain, pan, hz] = mixAt(s, first),
      filter = coefficients(hz, 0.68);
    let z1 = 0,
      z2 = 0;
    return (from, count, frame, smoothing) => {
      if (from >= lastSample) return;
      const [targetGain, targetPan, targetHz] = mixAt(s, frame);
      const endGain = mix(gain, targetGain, smoothing),
        endPan = mix(pan, targetPan, smoothing),
        endHz = mix(hz, targetHz, smoothing);
      const nextFilter = coefficients(endHz, 0.68);
      const start = Math.max(0, firstSample - from),
        end = Math.min(count, lastSample - from);
      if (start < end) {
        const a0 = ((pan + 1) * Math.PI) / 4,
          a1 = ((endPan + 1) * Math.PI) / 4;
        const startL = volume * gain * Math.cos(a0),
          startR = volume * gain * Math.sin(a0);
        const dL = (volume * endGain * Math.cos(a1) - startL) / count,
          dR = (volume * endGain * Math.sin(a1) - startR) / count;
        const dG = ((endGain - gain) * volume * (s.send ?? 0)) / count;
        let gL = startL + start * dL,
          gR = startR + start * dR,
          gSend = volume * gain * (s.send ?? 0) + start * dG;
        const db = (nextFilter.b - filter.b) / count,
          da1 = (nextFilter.a1 - filter.a1) / count,
          da2 = (nextFilter.a2 - filter.a2) / count;
        let b = filter.b + start * db,
          c1 = filter.a1 + start * da1,
          c2 = filter.a2 + start * da2;
        for (let i = start; i < end; i++) {
          const k = Math.min(Math.floor(phase), n - 1),
            next = k + 1 < n ? samples[k + 1] : loop ? samples[0] : 0;
          const x = (samples[k] + (next - samples[k]) * (phase - k)) * b;
          const y = x + z1;
          z1 = 2 * x - c1 * y + z2;
          z2 = x - c2 * y;
          left[i] += gL * y;
          right[i] += gR * y;
          send[i] += gSend * y;
          phase += step;
          if (loop && phase >= n) phase -= n;
          gL += dL;
          gR += dR;
          gSend += dG;
          b += db;
          c1 += da1;
          c2 += da2;
        }
      }
      gain = endGain;
      pan = endPan;
      hz = endHz;
      filter = nextFilter;
    };
  }
  for (const s of sources) {
    if (!s.cues) {
      voices.push(voice(s, 0, 1));
      continue;
    }
    for (let cycle = 0; cycle * stormPeriod < seconds; cycle++)
      for (const cue of s.cues) {
        const beat = cycle * stormPeriod + cue.beat,
          onset = cueTime(s, cue, beat, poseAt);
        if (onset < seconds) voices.push(voice(s, onset, cue.volume ?? 1));
      }
  }
  let yielded = performance.now();
  for (let from = 0; from < length; from += blockSize) {
    const count = Math.min(blockSize, length - from),
      frame = frameAt(from / rate),
      smoothing = 1 - Math.exp(-count / (rate * 0.028));
    left.fill(0);
    right.fill(0);
    send.fill(0);
    for (const render of voices) render(from, count, frame, smoothing);
    for (const echo of echoes) echo(count);
    for (let i = 0; i < count; i++) {
      const sample = from + i,
        offset = 44 + 4 * sample;
      const fade = Math.min(1, sample / (rate * 0.016), (length - 1 - sample) / (rate * 0.085));
      wave.setInt16(offset, Math.round(32767 * fade * pressure(lowCutLeft(left[i]))), true);
      wave.setInt16(offset + 2, Math.round(32767 * fade * pressure(lowCutRight(right[i]))), true);
    }
    if (performance.now() - yielded > 16) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      yielded = performance.now();
    }
  }
  return new Blob([bytes], { type: "audio/wav" });
}
