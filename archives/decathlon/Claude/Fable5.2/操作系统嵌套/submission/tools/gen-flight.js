'use strict';
// 生成默认演出：在实验台里实际运行场景进程与飞控程序，按脚本给出目标与故障时机，
// 把得到的飞行记录（初态、输入、实际控制时序）连同演出镜头写入 guest/Demo/helicopter-24.scene。
const fs = require('fs'); const path = require('path');
const { fly, saveRecord, Lab } = require('./flightlab.js');
const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'scene-base.json'), 'utf8'));
const INIT = { x: 0, z: 0, yaw: 22, seed: 24, wind: [1.6, -1.2] };
const INPUTS = JSON.parse(process.env.FL_INPUTS || 'null') || [
  [0, 'target', { mode: 'fly', x: 0, z: 0, alt: 9, hdg: 22 }],
  [2.3, 'target', { mode: 'fly', x: 74, z: -6, alt: 14 }],
  [5.4, 'target', { mode: 'fly', x: 150, z: -74, alt: 13 }],
  [6.8, 'fault', 'tail']
];
base.flight = { duration: 0, init: INIT, inputs: [], controls: [] };
const DUR = 15;
const { lab, track } = fly(JSON.stringify(base), INPUTS, DUR, {});
let crashT = null, lift = null;
for (const d of track) { const s = d.sum; if (lift === null && s.agl > 0.4) lift = s.t; if (crashT === null && s.crashed) crashT = s.t; }
if (process.argv.includes('--print')) {
  for (let i = 0; i < track.length; i += 15) { const s = track[i].sum; console.log(s.t.toFixed(2), 'p', s.p.map(v => v.toFixed(1)).join(','), 'agl', s.agl.toFixed(1), 'thr', s.thrust.toFixed(2), 'tilt', (track[i].tilt || 0).toFixed(0), s.crashed ? 'CRASHED' : '', s.rest ? 'REST' : ''); }
}
const last = track[track.length - 1].sum;
const info = lab.notes.filter(n => n.t === 'info').pop();
console.log('离地', lift, '坠毁', crashT, '撞击速度', info.impact.toFixed(1), '落定', last.rest, '末位置', last.p.map(v => v.toFixed(1)).join(','), '事件', last.ev.map(e => e.kind + '@' + e.t.toFixed(2)).join(' '));
const flight = saveRecord(lab);
flight.duration = DUR;
delete flight.savedAt; delete flight.from;
// 控制量必须原样保存：机体不稳定，任何舍入都会让回放偏离
console.log('控制写入', flight.controls.length, '输入', flight.inputs.length);
if (process.argv.includes('--write')) {
  const out = Object.assign({}, base, { flight, timeline: { duration: DUR, fps: 30 } });
  const ct = crashT || 11.5;
  // 演出镜头：围绕主体的方位、俯仰、距离、视角（度/米），机身右侧的 24 在主要展示阶段朝向镜头
  out.show = { camera: [
    { t: 0, yaw: -52, pitch: 5, dist: 15.5, fov: 36, up: 0.5 },
    { t: 1.8, yaw: -60, pitch: 4, dist: 16.5, fov: 36, up: 0.6 },
    { t: 3.6, yaw: -74, pitch: 8, dist: 19, fov: 38, up: 0.8 },
    { t: 6.4, yaw: -96, pitch: 10, dist: 23, fov: 40, up: 0.8 },
    { t: 8.2, yaw: -120, pitch: 12, dist: 27, fov: 42, up: 0.6 },
    { t: ct - 0.9, yaw: -150, pitch: 13, dist: 31, fov: 44, up: 0.2 },
    { t: ct + 0.5, yaw: -158, pitch: 11, dist: 28, fov: 42, up: 0.6 },
    { t: 15, yaw: -170, pitch: 12, dist: 24, fov: 40, up: 1.0 }
  ] };
  const text = JSON.stringify(out);
  fs.writeFileSync(path.join(__dirname, '..', 'guest', 'Demo', 'helicopter-24.scene'), text);
  console.log('已写入 helicopter-24.scene', text.length, '字节');
  // 回放一致性：用保存的记录在新的场景进程里重算，比较若干时刻的位置
  const lab2 = new Lab(text, {});
  lab2.send(lab2.scene, { t: 'load', file: '/Demo/h.scene', h: 1 }); lab2.step(); lab2.send(lab2.scene, { t: 'tl', pid: 1 });
  let ok = true, seq = 0;
  for (const tt of [14.9, 3.0, 9.5, 12.0, 0.5, 7.25]) {
    lab2.send(lab2.scene, { t: 'frame', seq: ++seq, pos: tt });
    for (let i = 0; i < 400 && !lab2.done.length; i++) lab2.step();
    const d = lab2.done.pop(); lab2.done.length = 0;
    const ref = track.reduce((a, b) => Math.abs(b.sum.t - tt) < Math.abs(a.sum.t - tt) ? b : a).sum;
    const err = Math.hypot(d.sum.p[0] - ref.p[0], d.sum.p[1] - ref.p[1], d.sum.p[2] - ref.p[2]);
    console.log('回放 t=' + tt, '位置', d.sum.p.map(v => v.toFixed(2)).join(','), '与排演相差', err.toFixed(3), '(参考时刻 ' + ref.t.toFixed(3) + ')');
    if (err > 0.6) ok = false;
  }
  console.log(ok ? '回放与排演一致' : '回放与排演不一致！');
}
