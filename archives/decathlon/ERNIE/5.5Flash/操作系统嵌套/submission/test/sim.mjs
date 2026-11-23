import { FlightSim, referenceController, FLIGHT_DT } from '../js/flight.js';
import { SCENE_HELICOPTER } from '../js/data.js';

function run(delayMs, faultAt = 0, wind = 2.2, seconds = 40, start = null) {
  const sim = new FlightSim(SCENE_HELICOPTER, { start, faultAt, wind });
  sim.setEnvironment({ wind, faultAt });
  const init = sim.snapshot();
  const samples = [];
  let lastControl = -1;
  let t = 0;
  const dt = 0.02;
  let minAlt = 999, maxAlt = -999, maxTilt = 0;
  while (t < seconds) {
    if (t - lastControl >= delayMs / 1000 - 1e-9) {
      const c = referenceController(sim.sensors(), 0);
      sim.setControls(c);
      lastControl = t;
    }
    sim.step(dt);
    const s = sim.state;
    samples.push({ t: +s.t.toFixed(3), thr: s.controls.thr, roll: s.controls.roll, pitch: s.controls.pitch, yaw: s.controls.yaw });
    const gy = s.pos.y;
    minAlt = Math.min(minAlt, gy);
    maxAlt = Math.max(maxAlt, gy);
    maxTilt = Math.max(maxTilt, Math.abs(s.roll), Math.abs(s.pitch));
    t = s.t;
    if (!s.alive) {
      return { delayMs, faultAt, alive: false, t: +s.t.toFixed(2), reason: s.reason, pos: s.pos, maxTilt: +maxTilt.toFixed(2), dist: +Math.hypot(s.targetX - s.pos.x, s.targetZ - s.pos.z).toFixed(1), landed: s.landedAt };
    }
    if (s.onGround && s.landedAt > 0 && s.distance < 3) {
      return { delayMs, faultAt, alive: true, landed: true, t: +s.t.toFixed(2), pos: s.pos, dist: +s.distance.toFixed(1), maxTilt: +maxTilt.toFixed(2) };
    }
  }
  const s = sim.state;
  return { delayMs, faultAt, alive: s.alive, t: +s.t.toFixed(1), pos: s.pos, dist: +s.distance.toFixed(1), alt: +(s.pos.y).toFixed(1), maxTilt: +maxTilt.toFixed(2), onGround: s.onGround };
}

for (const d of [20, 50, 100, 200, 400, 500, 600, 700]) {
  console.log(JSON.stringify(run(d, 0, 2.2, 40)));
}
console.log('--- fault at 8s, 20ms control ---');
console.log(JSON.stringify(run(20, 8, 2.2, 30)));
console.log('--- no fault, zero wind ---');
console.log(JSON.stringify(run(20, 0, 0, 40)));

// 确定性重放检查
const sim = new FlightSim(SCENE_HELICOPTER, { faultAt: 8, wind: 2.2 });
const init = sim.snapshot();
const samples = [];
for (let i = 0; i < 1500; i++) {
  sim.setControls(referenceController(sim.sensors(), 0));
  sim.step(FLIGHT_DT);
  samples.push({ t: +sim.state.t.toFixed(3), thr: sim.state.controls.thr, roll: sim.state.controls.roll, pitch: sim.state.controls.pitch, yaw: sim.state.controls.yaw });
}
const a = FlightSim.replay({ scene: SCENE_HELICOPTER, opts: { faultAt: 8, wind: 2.2 }, state: init }, samples, 12.0);
const b = FlightSim.replay({ scene: SCENE_HELICOPTER, opts: { faultAt: 8, wind: 2.2 }, state: init }, samples, 12.0);
console.log('replay deterministic:', JSON.stringify(a) === JSON.stringify(b), 't=', a.t.toFixed(2), 'pos=', a.pos);