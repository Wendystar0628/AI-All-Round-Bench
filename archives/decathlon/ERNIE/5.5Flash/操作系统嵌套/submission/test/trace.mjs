import { FlightSim, referenceController } from '../js/flight.js';
import { SCENE_HELICOPTER } from '../js/data.js';
const sim = new FlightSim(SCENE_HELICOPTER, { faultAt: 0, wind: 0 });
for (let i = 0; i < 20 * 60; i++) {
  if (i % 20 === 0) sim.setControls(referenceController(sim.sensors()));
  sim.step(0.02);
  if (i % 100 === 0) {
    const s = sim.state;
    const sens = sim.sensors();
    console.log(`t=${s.t.toFixed(1)} pos=(${s.pos.x.toFixed(1)},${s.pos.y.toFixed(1)},${s.pos.z.toFixed(1)}) yaw=${(s.yaw*180/Math.PI).toFixed(0)} hdg=${sens[4].toFixed(0)} brg=${sens[6].toFixed(0)} dist=${sens[5].toFixed(1)} spd=${sens[7].toFixed(1)} pitch=${(s.pitch*180/Math.PI).toFixed(1)} roll=${(s.roll*180/Math.PI).toFixed(1)} thr=${s.controls.thr.toFixed(2)} ctl=${JSON.stringify(s.controls)}`);
  }
}