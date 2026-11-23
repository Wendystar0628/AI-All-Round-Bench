import fs from 'fs';
let s = fs.readFileSync('js/apps/player.js', 'utf8');
const a = `function sampleTimeline(def, t) {
  const keys = def.timeline?.keys || [];
  if (!keys.length) return { pos: [0, 1, 0], rot: [0, 0, 0], rotor: 0.5, damage: 0, camPos: [12, 6, 14], camTarget: [0, 2, 0], label: '' };
  if (t <= keys[0].t) return { ...keys[0], camPos: keys[0].cam?.[0], camTarget: keys[0].cam?.[1] };
  const last = keys[keys.length - 1];
  if (t >= last.t) return { ...last, camPos: last.cam?.[0], camTarget: last.cam?.[1] };`;
const b = `function sampleTimeline(def, t) {
  const keys = def.timeline?.keys || [];
  const normCam = c => (Array.isArray(c) && c.length === 3 && typeof c[0] === 'number') ? [c, [0, 2, 0]] : (c || [[12, 6, 14], [0, 2, 0]]);
  if (!keys.length) return { pos: [0, 1, 0], rot: [0, 0, 0], rotor: 0.5, damage: 0, camPos: [12, 6, 14], camTarget: [0, 2, 0], label: '' };
  if (t <= keys[0].t) { const c = normCam(keys[0].cam); return { ...keys[0], camPos: c[0], camTarget: c[1] }; }
  const last = keys[keys.length - 1];
  if (t >= last.t) { const c = normCam(last.cam); return { ...last, camPos: c[0], camTarget: c[1] }; }`;
if (s.includes(a)) { s = s.replace(a, b); console.log('replaced'); } else console.log('not found');
s = s.replace(`  const normCam = c => (Array.isArray(c) && c.length === 3 && typeof c[0] === 'number') ? [c, [0, 2, 0]] : (c || [[12, 6, 14], [0, 2, 0]]);
  const camA = normCam(a.cam), camB = normCam(b.cam);`, `  const camA = normCam(a.cam), camB = normCam(b.cam);`);
fs.writeFileSync('js/apps/player.js', s);
console.log('done');