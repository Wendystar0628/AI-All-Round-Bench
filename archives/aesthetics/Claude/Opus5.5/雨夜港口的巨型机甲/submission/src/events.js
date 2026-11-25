// Occasional events: lightning, rogue wave, wind gust. At most one at a time.
import * as THREE from 'three';
import { mulberry32 } from './materials/noise.js';

export const EVENT_DUR = { lightning: 3.2, wave: 16.0, gust: 7.5 };
export const WAVE = { z0: 92, speed: 11.0, legZ: 1.5 };

export function lightningFlash(tau) {
  if (tau < 0) return 0;
  let f = 0;
  if (tau < 0.06) f = 1.0;
  else if (tau < 0.1) f = 0.22;
  else if (tau < 0.19) f = 0.95;
  else if (tau < 0.24) f = 0.3;
  else if (tau < 0.29) f = 0.6;
  else f = 0.55 * Math.exp(-(tau - 0.29) / 0.32);
  return f;
}

export function createEvents({ bolt, M }) {
  const st = {
    flash: 0, flashSky: 0, gust: 0,
    flashPos: new THREE.Vector3(-300, 520, -900),
    bigWave: { x: 0, z: 400, amp: 0, width: 14 },
    waveHit: -1e9, quayHit: -1e9, // absolute times when the wave hits legs / quay
    active: null,
  };
  let scripted = null;
  const randList = [];
  let rng = mulberry32(777);
  let nextFree = 9.0;
  let lastBoltSeed = -1;

  function ensureRandom(t) {
    // drop old
    while (randList.length && randList[0].t0 + EVENT_DUR[randList[0].type] < t - 30) randList.shift();
    while (nextFree < t + 40) {
      const r = rng();
      const type = r < 0.45 ? 'lightning' : r < 0.75 ? 'wave' : 'gust';
      const ev = { type, t0: nextFree, seed: Math.floor(rng() * 1e6) };
      if (type === 'lightning') ev.pos = [-700 + rng() * 1100, 470 + rng() * 120, -1100 + rng() * 700];
      randList.push(ev);
      nextFree += EVENT_DUR[type] + 10 + rng() * 14;
    }
  }

  function evalAt(t) {
    const list = scripted || randList;
    st.flash = 0; st.flashSky = 0; st.gust = 0; st.bigWave.amp = 0; st.bigWave.z = 400; st.active = null;
    st.waveHit = -1e9; st.quayHit = -1e9;
    let boltOn = 0, boltEv = null;
    for (const ev of list) {
      const tau = t - ev.t0;
      const dur = EVENT_DUR[ev.type];
      if (ev.type === 'wave') {
        // hit times are useful slightly beyond the event window for splash tails
        const hitT = ev.t0 + (WAVE.z0 - WAVE.legZ) / WAVE.speed;
        if (tau > -1 && tau < dur + 6) { st.waveHit = hitT; st.quayHit = ev.t0 + (WAVE.z0 + 60) / WAVE.speed; }
      }
      if (tau < 0 || tau > dur) continue;
      st.active = ev.type;
      if (ev.type === 'lightning') {
        st.flash = lightningFlash(tau);
        st.flashSky = Math.max(st.flash, 0.55 * Math.exp(-tau / 1.1) * (tau > 0.02 ? 1 : 0));
        st.flashPos.set(ev.pos[0], ev.pos[1], ev.pos[2]);
        if (tau < 0.3) { boltOn = st.flash; boltEv = ev; }
      } else if (ev.type === 'wave') {
        const z = WAVE.z0 - WAVE.speed * tau;
        const ramp = THREE.MathUtils.smoothstep(tau, 0, 3);
        let amp = 1.2 + 2.4 * (1 - THREE.MathUtils.smoothstep(z, 6, 72));
        if (z < WAVE.legZ - 3) amp *= 0.62;
        if (z < -55) amp *= Math.max(0, 1 - (-55 - z) / 6);
        st.bigWave.z = z; st.bigWave.amp = amp * ramp; st.bigWave.x = 0; st.bigWave.width = 13;
      } else if (ev.type === 'gust') {
        st.gust = THREE.MathUtils.smoothstep(tau, 0, 1.6) * (1 - THREE.MathUtils.smoothstep(tau, dur - 2.4, dur));
      }
    }
    // bolt
    if (boltEv) {
      if (lastBoltSeed !== boltEv.seed) {
        const from = new THREE.Vector3(boltEv.pos[0], boltEv.pos[1] + 40, boltEv.pos[2]);
        const to = new THREE.Vector3(boltEv.pos[0] + 120, 60, boltEv.pos[2] - 80);
        if (boltEv.ground === false) to.set(boltEv.pos[0] + 600, boltEv.pos[1] - 40, boltEv.pos[2] + 100);
        bolt.build(boltEv.seed, from, to);
        lastBoltSeed = boltEv.seed;
      }
      bolt.group.visible = true;
      bolt.mat.opacity = Math.min(1, boltOn * 1.2);
    } else {
      bolt.group.visible = false;
    }
  }

  return {
    get flash() { return st.flash; },
    get flashSky() { return st.flashSky; },
    get gust() { return st.gust; },
    get flashPos() { return st.flashPos; },
    get bigWave() { return st.bigWave; },
    get waveHit() { return st.waveHit; },
    get quayHit() { return st.quayHit; },
    get active() { return st.active; },
    update(t) { if (!scripted) ensureRandom(t); evalAt(t); },
    setScripted(list) { scripted = list; lastBoltSeed = -1; },
    // the event list currently in force (read-only use: the sound follows the same schedule as the visuals)
    list() { return scripted || randList; },
    // manual trigger in normal mode (debug / future)
    trigger(type, t) { randList.push({ type, t0: t, seed: Math.floor(rng() * 1e6), pos: [-300, 520, -900] }); randList.sort((a, b) => a.t0 - b.t0); nextFree = Math.max(nextFree, t + EVENT_DUR[type] + 8); },
  };
}
