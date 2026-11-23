// 无头联调：把根系统的窗口管理替换成一段测试程序，直接启动 飞行场景 + 飞控，观察闭环飞行的读数
import fs from 'node:fs';
import path from 'node:path';
import { Machine, buildBase } from '../src/host/machine.js';
import { loadImageFiles, NS_DIR } from './image.mjs';
import { tostr, newMap } from '../src/host/vm.js';
const mode = process.argv[2] || 'live';
const files = loadImageFiles();
const scene = JSON.parse(files.get('/Demo/helicopter-24.scene'));
const sub = { flight: scene.flight, terrain: { size: scene.terrain.size, res: scene.terrain.res, heights: scene.terrain.heights, edge: 0 }, pads: scene.pads, obstacles: scene.obstacles };
const testWm = `
let r = sys("wm_register");
let me = pid();
let fl = spawn("/Apps/player/flight.ns", {player: me}, "flight");
let fcp = ${mode === 'live' ? 'spawn("/Programs/flightctl.ns", {flight: fl, pads: ' + JSON.stringify(scene.pads) + '}, "fc")' : '0'};
send(fl, {t: "init", scene: ${JSON.stringify({ flight: scene.flight, terrain: sub.terrain, pads: scene.pads, obstacles: scene.obstacles, timeline: scene.timeline })}, fx: 0, record: ${mode === 'show' ? 'nil' : 'nil'}});
${mode === 'live' ? 'send(fl, {t: "live", fc: fcp, wdir: 250, wspeed: 3, hdg: 90, pad: "B"});' : ''}
${mode === 'show' ? 'send(fl, {t: "record", record: ' + JSON.stringify(scene.flight.record) + '});' : ''}
let tl = spawn("/Apps/player/timeline.ns", {player: me}, "timeline");
send(tl, {t: "cmd", op: "cfg", flight: fl, fx: 0, dur: ${mode === 'live' ? 120 : 15}, fps: 30, live: ${mode === 'live'}, pos: 0});
send(tl, {t: "cmd", op: "play"});
let last = -1;
while (true) {
  let e = recv();
  let m = e.msg;
  if (typeof(m) == "map" && m.t == "fl") {
    let k = floor(m.simt);
    if (k != last && m.simt - k < 0.05) {
      last = k; let h = m.hud;
      print("t=" + fmt(m.simt, 1) + " pos=(" + fmt(h.x, 1) + "," + fmt(h.y, 1) + "," + fmt(h.z, 1) + ") agl=" + fmt(h.agl, 1) + " spd=" + fmt(h.speed, 1) + " hdg=" + fmt(h.hdg, 0) + " pit=" + fmt(h.pitch, 0) + " rol=" + fmt(h.roll, 0) + " om=" + fmt(h.om, 2) + " c=" + fmt(h.c, 2) + " per=" + fmt(h.ctl_period, 3) + (h.landed ? " LANDED" : "") + (h.crashed ? " CRASHED" : "") + " lag=" + fmt(m.lag, 2));
    }
  }
}`;
files.set('/System/wm.ns', testWm); files.delete('/System/wm.nsx');
const stub = { reset() {}, dropCtx() {}, submit() {}, free() {}, snapshotCtxs() { return null; }, restoreCtxs() {}, sceneLoad() {}, sceneState() {}, sceneFree() {}, scenePick() { return null; }, inputValue() { return null; } };
const M = new Machine({ base: buildBase(files), display: stub }); M.boot(null);
const steps = Number(process.argv[3] || 1500); const t0 = Date.now();
for (let i = 0; i < steps; i++) { M.step(); if (M.fatal) { console.log('FATAL', M.fatal); break; } }
const K = M.k0.globals[M.k0.prog.gn.indexOf('K')];
for (const pid of K.order.concat(K.zombies)) { const p = K.procs[pid]; console.log(`[${pid}] ${p.name} ${p.state} used=${p.used} err=${p.err && p.err.msg + '@' + p.err.fn + ':' + p.err.line}`); if (p.name === '窗口管理') for (const l of p.out.slice(-40)) console.log('   ', l); else for (const l of p.out.slice(-3)) console.log('   |', l); }
console.log('ms', Date.now() - t0, 'clock', M.clock.toFixed(1));
