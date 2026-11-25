"use strict";

// These pressure waveforms are made from noise, damped resonators and oscillators.
// The material textures have independent seeds; none consumes the scene's random stream.
const harbourTimbres = (() => {
  const rate = 32000;
  const turn = 2 * Math.PI;
  let pending;

  function noise(seed) {
    let state = seed >>> 0;
    return () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state / 2147483648;
    };
  }
  function lowpass(hz) {
    const step = -Math.expm1((-turn * hz) / rate);
    let y = 0;
    return (x) => (y += step * (x - y));
  }
  function bandpass(lo, hi) {
    const top = lowpass(hi),
      bottom = lowpass(lo);
    return (x) => {
      const y = top(x);
      return y - bottom(y);
    };
  }
  function resonance(hz, bandwidth) {
    const radius = Math.exp((-Math.PI * bandwidth) / rate);
    const a = 2 * radius * Math.cos((turn * hz) / rate),
      b = radius * radius;
    const drive = 2 * Math.sin((turn * hz) / rate) * (1 - radius);
    let y1 = 0,
      y2 = 0;
    return (x) => {
      const y = a * y1 - b * y2 + drive * x;
      y2 = y1;
      y1 = y;
      return y;
    };
  }
  function buffer(seconds) {
    const samples = new Float32Array(Math.round(seconds * rate));
    return { samples, sampleRate: rate, duration: samples.length / rate };
  }
  function level(clip, rms, peak = 0.93) {
    const a = clip.samples;
    let energy = 0,
      highest = 0;
    for (const x of a) {
      energy += x * x;
      highest = Math.max(highest, Math.abs(x));
    }
    const gain = Math.min(rms / Math.sqrt(energy / a.length), peak / highest);
    for (let i = 0; i < a.length; i++) a[i] *= gain;
    return clip;
  }
  function continuous(seconds, sample, rms = 0.24) {
    const clip = buffer(seconds),
      a = clip.samples;
    for (let i = 0; i < a.length; i++) a[i] = sample(i / rate);
    // Sound following the last sample is spliced into the beginning. The noise
    // and filter memories meet across the wrap without a repeated dip to silence.
    const join = Math.round(0.14 * rate);
    for (let i = 0; i < join; i++) {
      const w = 0.5 - 0.5 * Math.cos((Math.PI * i) / join);
      a[i] = (1 - w) * sample((a.length + i) / rate) + w * a[i];
    }
    return level(clip, rms);
  }
  function transient(seconds, sample) {
    const clip = buffer(seconds),
      a = clip.samples;
    for (let i = 0; i < a.length; i++) {
      const t = i / rate;
      a[i] = sample(t) * Math.min(1, t / 0.0014, (seconds - t) / 0.085);
    }
    return level(clip, 1);
  }
  function rain(seed, seconds) {
    const random = noise(seed),
      body = bandpass(260, 3900),
      spray = bandpass(2050, 9700);
    const curtain = lowpass(2.6),
      distant = bandpass(95, 980);
    return continuous(seconds, (t) => {
      const x = random();
      const density = 0.92 + 2.1 * curtain(x) + 0.066 * Math.sin(0.79 * t) + 0.042 * Math.sin(2.11 * t + 0.8);
      return density * (0.69 * body(x) + 0.34 * spray(random()) + 0.87 * distant(x));
    });
  }
  function impacts(kind, seed) {
    const random = noise(seed),
      unit = () => 0.5 + 0.5 * random();
    const settings = {
      plate: [8.23, 24, 545, 1750, 0.044],
      box: [9.77, 17, 170, 460, 0.095],
      ground: [7.19, 62, 1120, 2360, 0.016],
    };
    const [seconds, density, low, span, decay] = settings[kind];
    const clip = buffer(seconds),
      a = clip.samples;
    let t = 0;
    while (t < seconds) {
      const start = Math.floor(t * rate),
        f = low + span * unit() ** 2,
        wet = unit();
      const duration = decay * (0.55 + 1.05 * unit()),
        strength = (0.17 + 0.83 * unit() ** 2) * (0.71 + 0.29 * Math.sin(1.1 * t) ** 2);
      const ringFall = Math.exp(-1 / (rate * duration)),
        tipFall = Math.exp(-1 / (rate * (0.0017 + 0.0029 * wet)));
      const w = (turn * f) / rate,
        partial = kind === "box" ? 2.41 : 2.84;
      let ring = 1,
        tip = 1,
        phase = 0,
        filtered = 0;
      const count = Math.ceil(5.9 * duration * rate);
      for (let j = 0; j < count; j++) {
        filtered += 0.58 * (random() - filtered);
        phase += w * (1 + 0.31 * tip);
        const tone = Math.sin(phase) + 0.34 * ring * Math.sin(phase * partial + 0.21);
        const surface = kind === "ground" ? 0.11 * tone + 0.78 * filtered : 0.56 * tone + 0.27 * filtered;
        a[(start + j) % a.length] +=
          strength * Math.min(1, j / 16) * (ring * surface + 0.88 * tip * filtered);
        ring *= ringFall;
        tip *= tipFall;
      }
      t += 0.0016 - Math.log(Math.max(0.0001, unit())) / density;
    }
    return level(clip, 0.2);
  }
  function wind(seed, seconds, singing) {
    const random = noise(seed),
      ground = bandpass(34, 306),
      breath = bandpass(185, 1490);
    const eddy = lowpass(1.65),
      hollow = resonance(singing ? 463 : 187, singing ? 57 : 82);
    const wireAir = bandpass(360, 1850);
    let whistle = 0;
    return continuous(seconds, (t) => {
      const x = random(),
        swirl = 0.5 + 0.25 * Math.sin(0.62 * t + 0.3) + 0.25 * Math.sin(1.28 * t + 0.88);
      whistle += (turn * (341 + 74 * swirl + 9 * Math.sin(2.03 * t))) / rate;
      const hiss = (0.73 + 0.4 * swirl + 2.28 * eddy(x)) * breath(x);
      return (
        2.2 * ground(x) +
        0.63 * hiss +
        3.0 * hollow(x) +
        (singing ? 0.077 * swirl * swirl * Math.sin(whistle) + 0.18 * wireAir(random()) : 0)
      );
    });
  }
  function sea(seed, seconds, foam) {
    const random = noise(seed),
      undertow = bandpass(27, 155),
      water = bandpass(88, 760);
    const lace = bandpass(465, 4200),
      froth = resonance(645, 248),
      eddy = lowpass(8.2);
    let bubbles = 0,
      phase = 0,
      pitch = 0;
    return continuous(seconds, (t) => {
      const x = random();
      if (random() > 0.9962) {
        bubbles = 0.2 + 0.8 * Math.abs(x);
        pitch = (turn * (530 + 1850 * x * x)) / rate;
      }
      phase += pitch * (1 + 0.52 * bubbles);
      bubbles *= 0.989;
      const surge =
        0.79 + 0.105 * Math.sin(1.18 * t + 0.47 * Math.sin(0.37 * t)) + 0.105 * Math.sin(1.66 * t + 1.2);
      return foam
        ? surge *
            (0.83 * water(x) +
              (1 + 3.6 * eddy(x)) * 0.56 * lace(x) +
              0.72 * froth(x) +
              0.098 * bubbles * Math.sin(phase))
        : surge * (2.45 * undertow(x) + 0.79 * water(x) + 0.051 * lace(x));
    });
  }
  function rotor(seed, revolutions) {
    const random = noise(seed),
      tip = bandpass(100, 1190),
      air = bandpass(65, 570);
    return continuous((revolutions * turn) / 35.8, (t) => {
      const a = 35.8 * t;
      const pulse = 0.5 + 0.5 * Math.cos(5 * a + 0.16 * Math.sin(a));
      const slap = pulse ** 5 * (0.85 + 0.22 * Math.sin(a - 0.6));
      const pressure = slap * (0.55 + 0.28 * Math.sin(10 * a - 0.6)) - 0.135;
      return (
        pressure +
        0.17 * Math.sin(5 * a) +
        0.115 * Math.sin(15 * a + 0.14 * Math.sin(a)) +
        0.084 * Math.sin(26 * a + 0.63 * Math.sin(2 * a)) +
        0.038 * Math.sin(58 * a) +
        slap * 1.17 * tip(random()) +
        0.47 * air(random())
      );
    });
  }
  function turbine() {
    const random = noise(0x763a5c2b),
      bearing = resonance(297, 66),
      fan = bandpass(85, 770);
    return continuous((2 * turn) / 0.81, (t) => {
      const pass = 14 * 0.81 * t,
        casing = turn * 48.2 * t + 0.29 * Math.sin(pass);
      return (
        (0.23 * Math.sin(casing) + 0.109 * Math.sin(2 * casing + 0.14) + 0.083 * Math.sin(turn * 73.4 * t)) *
          (0.84 + 0.14 * Math.cos(pass) + 0.043 * Math.sin(2.2 * t)) +
        (0.25 + 0.36 * (0.5 + 0.5 * Math.cos(pass)) ** 3) * fan(random()) +
        1.27 * bearing(random())
      );
    });
  }
  function hull() {
    const random = noise(0x722f17c3),
      timber = resonance(202, 45),
      plate = bandpass(76, 790);
    const clip = buffer(14.11),
      a = clip.samples;
    for (const [start, seconds, hz] of [
      [0.45, 0.91, 127],
      [2.77, 0.42, 214],
      [5.35, 1.57, 94],
      [7.86, 0.66, 173],
      [10.97, 1.24, 118],
      [12.59, 0.33, 241],
    ]) {
      let phase = 0;
      for (let i = 0; i < seconds * rate; i++) {
        const t = i / rate,
          u = t / seconds,
          flex = Math.sin(Math.PI * u);
        phase += (turn * (hz * (1 + 0.27 * flex - 0.12 * u) + 6 * Math.sin(t * 31))) / rate;
        const slip = (0.5 + 0.5 * Math.cos(phase + 0.7 * Math.sin(2.07 * phase))) ** 5;
        a[Math.floor(start * rate) + i] +=
          flex *
          flex *
          ((slip - 0.26) * (0.53 + 0.31 * Math.sin(21.8 * t)) +
            1.27 * timber(random()) +
            0.48 * plate(random()));
      }
    }
    return level(clip, 0.22);
  }
  function foghorn() {
    const random = noise(0x53ec471b),
      pipe = bandpass(130, 650);
    let phase = 0;
    const clip = transient(4.15, (t) => {
      const attack = 1 - Math.exp(-t / 0.175),
        release = Math.exp(-Math.max(0, t - 2.52) / 0.37);
      phase +=
        (turn * (82.6 - 3.2 * Math.exp(-t / 0.26) - 1.05 * (1 - release) + 0.12 * Math.sin(7.4 * t))) / rate;
      return (
        attack *
        release *
        (0.61 * Math.sin(phase) +
          0.29 * Math.sin(2 * phase - 0.4) +
          0.155 * Math.sin(3 * phase) +
          0.071 * Math.sin(4 * phase + 0.3) +
          0.1 * Math.sin(phase * 1.014) +
          0.13 * pipe(random()))
      );
    });
    return clip;
  }
  function waveImpact() {
    const random = noise(0x43b11a09),
      mass = bandpass(24, 168),
      slap = bandpass(118, 1180);
    const rinse = bandpass(390, 4950),
      aeration = resonance(385, 165);
    let phase = 0;
    return transient(4.38, (t) => {
      const hit = (1 - Math.exp(-t / 0.014)) * Math.exp(-t / 0.32);
      const plume = (1 - Math.exp(-t / 0.105)) * Math.exp(-t / 0.84);
      const fall = Math.max(0, t - 0.34),
        wash = (1 - Math.exp(-fall / 0.36)) * Math.exp(-fall / 1.29);
      phase += (turn * (36 + 44 * Math.exp(-t / 0.132))) / rate;
      const x = random();
      return (
        hit * (0.61 * Math.sin(phase) + 2.3 * mass(x)) +
        1.63 * plume * slap(x) +
        wash *
          (0.76 + 0.24 * Math.sin(6.8 * t + 0.93 * Math.sin(3.6 * t))) *
          (1.08 * rinse(x) + 0.82 * aeration(random()))
      );
    });
  }
  function thunder(distant) {
    const random = noise(distant ? 0x719486a3 : 0x7b4583f1);
    const deep = bandpass(20, 119),
      body = bandpass(44, 319),
      snap = bandpass(290, 4500);
    const cloudA = resonance(42, 22),
      cloudB = resonance(69, 33);
    return transient(distant ? 6.83 : 2.64, (t) => {
      const x = random();
      if (distant) {
        const tail = (1 - Math.exp(-t / 0.24)) * Math.exp(-t / 2.13);
        const billow = 0.52 + 0.28 * Math.sin(3.19 * t + 0.67) + 0.17 * Math.sin(6.3 * t - 0.78);
        return tail * billow * (3.9 * deep(x) + 1.27 * body(random()) + 3.4 * cloudA(x) + 1.5 * cloudB(x));
      }
      let crack = Math.exp(-t / 0.033);
      if (t > 0.043) crack += 0.81 * Math.exp(-(t - 0.043) / 0.051);
      if (t > 0.132) crack += 0.42 * Math.exp(-(t - 0.132) / 0.074);
      const roll = (1 - Math.exp(-t / 0.026)) * Math.exp(-t / 0.73) * (0.81 + 0.19 * Math.sin(t * 9.8));
      const mid = body(x);
      return (
        crack * (0.92 * snap(x) + 1.15 * mid) + roll * (3.9 * deep(x) + 1.7 * cloudB(random()) + 0.66 * mid)
      );
    });
  }

  async function build() {
    const recipes = {
      rainL: () => rain(0x1396ac7d, 7.43),
      rainR: () => rain(0x52663abd, 8.21),
      windL: () => wind(0x263a4f17, 12.13, false),
      windR: () => wind(0x5d639e27, 10.89, false),
      squall: () => wind(0x3b765419, 9.67, true),
      swellL: () => sea(0x65c98213, 8.96, false),
      swellR: () => sea(0x421dd057, 10.38, false),
      foam: () => sea(0x1b4c8ed5, 6.79, true),
      plate: () => impacts("plate", 0x43c9732d),
      ground: () => impacts("ground", 0x3c981f03),
      container: () => impacts("box", 0x7d4a315e),
      rotorA: () => rotor(0x1ba33d97, 29),
      rotorB: () => rotor(0x34f1068b, 31),
      turbine,
      hull,
      horn: foghorn,
      impact: waveImpact,
      crack: () => thunder(false),
      roll: () => thunder(true),
    };
    const clips = {};
    for (const [name, make] of Object.entries(recipes)) {
      clips[name] = make();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return clips;
  }
  return {
    prepare() {
      if (!pending)
        pending = build().catch((error) => {
          pending = null;
          throw error;
        });
      return pending;
    },
  };
})();
