const fs = require('fs'); const path = require('path');
const { fly, readGuest } = require('./flightlab.js');
const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'scene-base.json'), 'utf8'));
base.flight = { duration: 0, init: { x: 0, z: 0, yaw: -22, seed: 7 }, inputs: [], controls: [] };
const text = JSON.stringify(base);
const src0 = readGuest('/Programs/flightctl.nx');
const sets = JSON.parse(process.argv[2] || '[[3.25,0.5],[4,0.55],[5,0.6]]');
for (const [kp, kd] of sets) {
  const src = src0.replace(/var KP = [0-9.]+; var KD = [0-9.]+;/, 'var KP = ' + kp + '; var KD = ' + kd + ';');
  let line = 'KP ' + kp + ' KD ' + kd + ' :';
  for (const every of [1, 2, 3, 4]) {
    const { lab, track } = fly(text, [[0, 'target', { mode: 'fly', x: 0, z: 0, alt: 12, hdg: -22 }], [5, 'target', { mode: 'fly', x: 60, z: -25, alt: 14 }]], 13, { ctlEvery: every, ctlSrc: src });
    const info = lab.notes.filter(n => n.t === 'info').pop();
    const crashAt = track.find(d => d.sum.crashed);
    const hov = Math.max(...track.filter(d => d.sum.t > 3 && d.sum.t < 5).map(d => d.tilt || 0));
    line += '  T' + every + ' hover ' + hov.toFixed(1) + ' max ' + info.maxTilt.toFixed(0) + (crashAt ? ' CRASH@' + crashAt.sum.t.toFixed(1) : ' ok');
  }
  console.log(line);
}
