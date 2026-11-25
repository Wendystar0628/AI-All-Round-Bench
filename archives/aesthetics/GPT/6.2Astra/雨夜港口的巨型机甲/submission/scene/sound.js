"use strict";

// Acoustic sampling of the four travelling waves in weather.js. Foam at the
// piles and foam at the quay therefore break on different parts of the swell.
function acousticSwell(x, z, t) {
  const a = 0.076 * x + 0.256 * z + 1.13 * t + 0.49 * Math.sin(0.044 * x + 0.019 * z);
  const b = -0.155 * x + 0.412 * z + 1.47 * t + 0.32 * Math.sin(0.062 * x);
  const c = 0.308 * x - 0.177 * z - 0.93 * t,
    d = 0.413 * x + 0.573 * z + 1.76 * t;
  return (
    0.91 * Math.sin(a) -
    0.21 * Math.cos(2 * a) +
    0.53 * Math.sin(b) -
    0.095 * Math.cos(2 * b) +
    0.29 * Math.sin(c) +
    0.14 * Math.sin(d)
  );
}

function createHarbourSound({ tourSeconds, tourPose, currentTime, currentPose }) {
  const outputRate = 48000,
    controlsPerSecond = 60;
  const sources = [];
  function add(clip, level, settings = {}) {
    sources.push({ clip, level, ...settings });
  }
  const nearShore = (f) => V(clamp(f.eye.x, -246, 246), WATER + 0.64, -60.1);
  const foreQuay = (f) => V(clamp(f.eye.x, -246, 246), 16.28, clamp(f.eye.z, -153, -63));
  const armourRain = (f) => 0.77 + 0.4 * f.gust + 0.12 * f.drift;
  const core = reactorMount.localToWorld(V(0, 0, 0.92));
  const hullMooring = ship.localToWorld(V(108, 19.8, 9.3));
  const shipWhistle = ship.localToWorld(V(-81, 36.4, 0));
  const thunderFront = lightningOrigin.clone().lerp(startArc, 0.72);
  const feet = [V(13.4, WATER + 0.75, 0.75), V(-13.45, WATER + 0.75, -0.59)];

  for (const [side, id] of [
    [-1, "L"],
    [1, "R"],
  ]) {
    add("rain" + id, 0.374, {
      pan: side * 0.78,
      ceiling: 9700,
      activity: (f) => (0.79 + 0.23 * f.high + 0.17 * f.wide + 0.45 * f.gust) * (0.95 + 0.087 * f.drift),
    });
    add("wind" + id, 0.307, {
      pan: (f) => side * 0.54 + 0.24 * f.windPan,
      ceiling: 2600,
      activity: (f) => 0.37 + 0.64 * f.high + 0.2 * f.wide + 0.7 * f.gust,
    });
    add("swell" + id, 0.433, {
      pan: side * 0.64,
      ceiling: 1550,
      activity: (f) =>
        (0.12 + 0.91 * f.sea) *
        (0.64 + 0.52 * T.MathUtils.smoothstep(acousticSwell(f.eye.x + side * 7, f.eye.z, f.t), -1.45, 1.48)),
    });
  }
  add("squall", 0.38, {
    pan: (f) => f.windPan * 0.74,
    ceiling: 3100,
    activity: (f) => f.gust * (0.68 + 0.32 * f.high),
  });
  feet.forEach((foot, i) => {
    add("foam", 0.69, {
      at: foot,
      reach: 24,
      offset: i * 3.128,
      ceiling: 5700,
      floor: 870,
      activity: (f) =>
        0.15 +
        0.98 * T.MathUtils.smoothstep(acousticSwell(foot.x, foot.z, f.t), -0.85, 1.24) +
        0.41 * f.breaker,
    });
  });
  add("foam", 0.6, {
    at: nearShore,
    reach: 24,
    offset: 4.751,
    rate: 0.907,
    ceiling: 6100,
    floor: 950,
    activity: (f) =>
      0.18 + 1.14 * T.MathUtils.smoothstep(acousticSwell(clamp(f.eye.x, -246, 246), -60.1, f.t), -0.28, 1.52),
  });
  splashSurfaces.forEach(([p], i) => {
    add("plate", 0.385, {
      at: p,
      reach: 10.8,
      rate: 0.925 + 0.031 * i,
      offset: i * 1.817,
      activity: armourRain,
      send: 0.25,
    });
  });
  for (const [s, offset] of [
    [-1, 0.682],
    [1, 4.316],
  ]) {
    add("plate", 0.294, {
      at: thorax.localToWorld(armStations[s].c.clone()),
      reach: 8.3,
      offset,
      ceiling: 7400,
      activity: armourRain,
      send: 0.18,
    });
  }
  add("ground", 0.58, {
    at: foreQuay,
    reach: 13.4,
    activity: armourRain,
    ceiling: 8200,
    floor: 900,
    send: 0.22,
  });
  for (const [x, z, y, offset] of [
    [-32.79, -80.56, 26.72, 1.2],
    [-14.91, -81.76, 29.33, 5.173],
  ]) {
    add("container", 0.56, {
      at: V(x, y, z),
      reach: 19.0,
      offset,
      activity: armourRain,
      ceiling: 6600,
      floor: 930,
      send: 0.63,
    });
  }
  aircraft.forEach((a, i) => {
    const centre = V();
    add(i ? "rotorB" : "rotorA", 0.748, {
      reach: 32,
      offset: a.phase,
      at: (f) => {
        flightCentreAt(a, f.t, centre);
        centre.y += a.rotor.position.y * a.g.scale.y;
        return centre;
      },
      ceiling: 4800,
      floor: 340,
      send: 0.53,
    });
  });
  add("turbine", 0.83, {
    at: core,
    reach: 13.8,
    ceiling: 3100,
    floor: 260,
    send: 0.4,
    activity: (f) => 0.96 + 0.04 * Math.sin(2.2 * f.t),
  });
  add("hull", 0.61, {
    at: (f) => V(hullMooring.x, hullMooring.y + 0.21 * Math.sin(0.65 * f.t + 0.18), hullMooring.z),
    reach: 37,
    ceiling: 2200,
    floor: 440,
    send: 0.55,
    activity: (f) =>
      0.22 +
      0.78 * (0.61 * Math.abs(Math.sin(0.87 * f.t + 0.12)) + 0.39 * Math.abs(Math.cos(0.65 * f.t + 0.18))),
  });
  add("horn", 0.48, {
    at: shipWhistle,
    reach: 206,
    ceiling: 1600,
    floor: 530,
    send: 0.91,
    cues: [{ beat: 10.48 }, { beat: 72.36, volume: 0.82 }],
  });
  add("impact", 1.22, {
    at: feet[1],
    reach: 123,
    ceiling: 6600,
    floor: 1600,
    cues: [{ beat: breakerPeak }],
    send: 0.26,
  });
  add("impact", 0.39, {
    at: feet[0],
    reach: 110,
    ceiling: 3100,
    floor: 760,
    cues: [{ beat: breakerPeak, lag: 0.136 }],
    send: 0.31,
  });
  add("crack", 1.09, {
    at: thunderFront,
    reach: 475,
    ceiling: 7500,
    floor: 3400,
    cues: [
      { beat: lightningBeats[0], lag: 0.205 },
      { beat: lightningBeats[1], lag: 0.192, volume: 0.46 },
    ],
    send: 0.52,
  });
  // The lower, diffuse return travels from the far cloud to the listening
  // position at the flash, even if the following camera cut is much closer.
  add("roll", 1.29, {
    at: lightningOrigin,
    reach: 540,
    width: 0.56,
    ceiling: 1450,
    floor: 620,
    cues: [{ beat: lightningBeats[2], propagate: true }],
    send: 0.72,
  });

  function listener(t, pose) {
    const { eye, aim } = pose,
      dx = aim.x - eye.x,
      dz = aim.z - eye.z;
    const horizontal = Math.hypot(dx, dz) || 1,
      rightX = -dz / horizontal,
      rightZ = dx / horizontal;
    const height = Math.max(0, eye.y - WATER),
      high = 1 - Math.exp(-height / 47);
    const land = T.MathUtils.smoothstep(-60.1 - eye.z, 0, 77);
    return {
      eye,
      t,
      rightX,
      rightZ,
      high,
      gust: gustAt(t),
      breaker: breakerAt(t),
      drift: Math.sin(0.391 * t + 0.73 * Math.sin(0.274 * t)),
      wide: T.MathUtils.smoothstep(eye.distanceTo(core), 42, 162),
      sea: Math.exp(-height / 24.5) * (1 - 0.92 * land),
      windPan: -0.946 * rightX - 0.324 * rightZ,
    };
  }
  function mixAt(s, f) {
    const amount = s.level * (s.activity ? s.activity(f) : 1);
    const ceiling = s.ceiling ?? 7800;
    if (!s.at) return [amount, typeof s.pan === "function" ? s.pan(f) : s.pan, ceiling];
    const p = typeof s.at === "function" ? s.at(f) : s.at;
    const dx = p.x - f.eye.x,
      dy = p.y - f.eye.y,
      dz = p.z - f.eye.z,
      d = Math.hypot(dx, dy, dz);
    const gain = 1 / Math.sqrt(1 + (d / s.reach) ** 2),
      floor = s.floor ?? 1000;
    const pan = clamp((dx * f.rightX + dz * f.rightZ) / Math.max(1, d), -0.965, 0.965) * (s.width ?? 1);
    return [amount * gain, pan, mix(floor, ceiling, gain ** 0.78)];
  }

  const reflections = [
    [0.094, -0.68, 0.104, 2100],
    [0.243, 0.73, 0.071, 1340],
  ];
  function cueTime(s, cue, beat, poseForBeat) {
    const delay = cue.propagate ? poseForBeat(beat).eye.distanceTo(s.at) / 343 : (cue.lag ?? 0);
    return beat + delay;
  }
  const masterCurve = new Float32Array(4097);
  for (let i = 0; i < masterCurve.length; i++) {
    const x = (2 * i) / (masterCurve.length - 1) - 1,
      a = Math.abs(x) * 1.3;
    masterCurve[i] = Math.sign(x) * (a < 0.59 ? a : 0.59 + 0.303 * Math.tanh((a - 0.59) / 0.303));
  }

  const nativeBuffers = new Map();
  // Native voices continue between WebGL frames. Resuming an interrupted
  // scene seeks each voice to its absolute phase in the same pressure texture.
  function liveStage(ctx, clips, when, from, initialPose) {
    const master = ctx.createGain(),
      rumbleCut = ctx.createBiquadFilter(),
      limiter = ctx.createWaveShaper();
    const output = ctx.createGain(),
      returns = ctx.createGain(),
      nodes = new Set();
    rumbleCut.type = "highpass";
    rumbleCut.frequency.value = 23;
    rumbleCut.Q.value = 0.65;
    limiter.curve = masterCurve;
    master.connect(rumbleCut).connect(limiter).connect(output).connect(ctx.destination);
    output.gain.setValueAtTime(0, when);
    output.gain.linearRampToValueAtTime(1, when + 0.065);
    // Two sparse quay reflections; no long indoor reverb on the rain bed.
    returns.channelCount = 1;
    returns.channelCountMode = "explicit";
    for (const [seconds, pan, level, cutoff] of reflections) {
      const delay = ctx.createDelay(1),
        filter = ctx.createBiquadFilter(),
        side = ctx.createStereoPanner(),
        gain = ctx.createGain();
      delay.delayTime.value = seconds;
      filter.frequency.value = cutoff;
      filter.Q.value = 0.6;
      side.pan.value = pan;
      gain.gain.value = level;
      returns.connect(delay).connect(filter).connect(side).connect(gain).connect(master);
    }
    function play(clip, destination, at, offset, speed, loop, volume = 1) {
      const raw = clips[clip];
      if (!loop && offset >= raw.duration) return;
      if (!nativeBuffers.has(clip)) {
        const audioBuffer = ctx.createBuffer(1, raw.samples.length, raw.sampleRate);
        audioBuffer.copyToChannel(raw.samples, 0);
        nativeBuffers.set(clip, audioBuffer);
      }
      const buffer = nativeBuffers.get(clip);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = loop;
      src.playbackRate.value = speed;
      let scale = null;
      if (volume !== 1) {
        scale = ctx.createGain();
        scale.gain.value = volume;
        src.connect(scale).connect(destination);
      } else src.connect(destination);
      nodes.add(src);
      src.onended = () => {
        src.disconnect();
        if (scale) scale.disconnect();
        nodes.delete(src);
      };
      src.start(at, loop ? offset % buffer.duration : offset);
    }
    const startFrame = listener(from, initialPose);
    const channels = sources.map((s) => {
      const filter = ctx.createBiquadFilter(),
        gain = ctx.createGain(),
        side = ctx.createStereoPanner();
      const [level, pan, hz] = mixAt(s, startFrame);
      filter.type = "lowpass";
      filter.Q.value = 0.68;
      filter.frequency.value = hz;
      gain.gain.value = level;
      side.pan.value = pan;
      filter.connect(gain).connect(side).connect(master);
      if (s.send) {
        const send = ctx.createGain();
        send.gain.value = s.send;
        gain.connect(send).connect(returns);
      }
      if (!s.cues) play(s.clip, filter, when, (from + (s.offset ?? 0)) * (s.rate ?? 1), s.rate ?? 1, true);
      return { s, filter, gain, side, params: [gain.gain, side.pan, filter.frequency] };
    });
    const events = channels
      .filter((c) => c.s.cues)
      .map((channel) => ({
        ...channel,
        planned: Math.max(0, from - stormPeriod),
      }));
    function schedule(through, poseForBeat) {
      const current = Math.max(from, from + ctx.currentTime - when);
      for (const channel of events) {
        const { s, filter, planned } = channel;
        // For a moving listener, measure the cloud range as the flash happens.
        // Its travel time leaves room to schedule the return on the audio clock.
        const horizon = s.cues[0].propagate ? current : through;
        if (horizon <= planned) continue;
        for (
          let cycle = Math.floor(planned / stormPeriod);
          cycle <= Math.floor(horizon / stormPeriod);
          cycle++
        ) {
          for (const cue of s.cues) {
            const beat = cycle * stormPeriod + cue.beat;
            if (beat < planned || beat >= horizon) continue;
            const onset = cueTime(s, cue, beat, poseForBeat),
              start = Math.max(onset, current);
            play(s.clip, filter, when + start - from, start - onset, 1, false, cue.volume ?? 1);
          }
        }
        channel.planned = horizon;
      }
    }
    function steer(t, pose) {
      const f = listener(t, pose),
        now = ctx.currentTime;
      for (const channel of channels) {
        const next = mixAt(channel.s, f);
        channel.params.forEach((p, i) => p.setTargetAtTime(next[i], now, 0.028));
      }
    }
    function stop() {
      const now = ctx.currentTime,
        stopAt = now + 0.024;
      output.gain.cancelAndHoldAtTime(now);
      output.gain.linearRampToValueAtTime(0, stopAt);
      for (const src of nodes) src.stop(stopAt);
      setTimeout(() => {
        output.disconnect();
        returns.disconnect();
        master.disconnect();
        nodes.clear();
      }, 90);
    }
    return { when, from, steer, schedule, stop };
  }

  let renderedAudio;
  async function renderTour() {
    return renderHarbourWav({
      clips: await harbourTimbres.prepare(),
      sources,
      rate: outputRate,
      seconds: tourSeconds,
      controlRate: controlsPerSecond,
      frameAt: (t) => listener(t, tourPose(t)),
      poseAt: tourPose,
      mixAt,
      cueTime,
      reflections,
      masterCurve,
    });
  }

  let ctx = null,
    live = null,
    enabled = false,
    exportMode = false,
    hiddenPage = false,
    starting = false,
    timer = 0,
    revision = 0;
  function silence() {
    revision++;
    starting = false;
    clearInterval(timer);
    timer = 0;
    if (live) {
      live.stop();
      live = null;
    }
  }
  async function startLive() {
    if (!enabled || exportMode || hiddenPage || ctx?.state !== "running" || live || starting) return;
    const mine = revision;
    starting = true;
    try {
      const clips = await harbourTimbres.prepare();
      if (mine !== revision || exportMode || hiddenPage || ctx.state !== "running") return;
      const when = ctx.currentTime + 0.018,
        from = currentTime() + 0.018;
      live = liveStage(ctx, clips, when, from, currentPose());
      function update() {
        if (!live) return;
        const t = currentTime(),
          clock = live.from + ctx.currentTime - live.when;
        if (Math.abs(t - clock) > 0.18) {
          silence();
          startLive();
          return;
        }
        live.steer(t, currentPose());
        live.schedule(t + 1.25, currentPose);
      }
      live.schedule(from + 1.25, currentPose);
      timer = setInterval(update, 32);
    } finally {
      if (mine === revision) starting = false;
    }
  }
  function unlock() {
    enabled = true;
    if (!ctx) {
      ctx = new AudioContext({ sampleRate: outputRate, latencyHint: "interactive" });
      ctx.onstatechange = () => {
        if (ctx.state === "running") startLive();
        else silence();
      };
    }
    if (ctx.state !== "running") ctx.resume().then(startLive, () => {});
    else startLive();
  }
  for (const e of ["pointerdown", "click", "keydown"])
    window.addEventListener(e, unlock, { capture: true, passive: true });
  window.addEventListener("pagehide", () => {
    hiddenPage = true;
    silence();
    if (ctx) ctx.suspend();
  });
  window.addEventListener("pageshow", () => {
    hiddenPage = false;
    if (enabled) unlock();
  });
  // Preparing the pressure textures does not open an audio device.
  if ("requestIdleCallback" in window)
    requestIdleCallback(() => harbourTimbres.prepare().catch(() => {}), { timeout: 2500 });
  return {
    pause() {
      exportMode = true;
      silence();
    },
    resume() {
      exportMode = false;
      startLive();
    },
    audio() {
      if (!renderedAudio)
        renderedAudio = renderTour().catch((error) => {
          renderedAudio = null;
          throw error;
        });
      return renderedAudio;
    },
  };
}
