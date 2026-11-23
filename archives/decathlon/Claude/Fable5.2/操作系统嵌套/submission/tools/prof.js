const fs = require('fs'); const path = require('path');
const { Lab } = require('./flightlab.js');
const text = fs.readFileSync(path.join(__dirname, '..', 'guest', 'Demo', 'helicopter-24.scene'), 'utf8');
const lab = new Lab(text, {});
lab.send(lab.scene, { t: 'load', file: '/Demo/h.scene', h: 1 }); lab.step(); lab.send(lab.scene, { t: 'tl', pid: 1 });
let seq = 0;
function frameAt(t) { lab.send(lab.scene, { t: 'frame', seq: ++seq, pos: t }); for (let i = 0; i < 400 && !lab.done.length; i++) lab.step(); lab.done.length = 0; }
let last = lab.scene.instr;
const mark = (label) => { console.log(label, lab.scene.instr - last); last = lab.scene.instr; };
mark('load');
frameAt(0); mark('frame 0');
frameAt(1 / 30); mark('1 frame on ground (8 steps + present)');
for (let i = 2; i <= 30; i++) frameAt(i / 30); mark('29 frames on ground');
frameAt(6); mark('seek to 6s (1200 steps)');
for (let i = 1; i <= 30; i++) frameAt(6 + i / 30); mark('30 frames cruise');
frameAt(6 + 31 / 30); frameAt(6 + 31 / 30); mark('same frame again (present only)');
frameAt(13); mark('seek to 13');
for (let i = 1; i <= 30; i++) frameAt(13 + i / 30); mark('30 frames wreck');
