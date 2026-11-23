'use strict';
// 飞行实验台（开发工具）：在最小宿主里运行真正的场景进程（player-scene.nx）与飞控程序（flightctl.nx），
// 用来调参、检验“控制周期变长会发散”，以及生成默认演出的飞行记录。
const fs = require('fs'); const path = require('path');
const NVM = require('../src/host/vm.js');
const { stage0 } = require('./stage0.js');
const ROOT = path.join(__dirname, '..');
function readGuest(p) { try { return fs.readFileSync(path.join(ROOT, 'guest', p), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return null; } }
function compile(p, extra) {
  const csrc = readGuest('/System/compiler.nx');
  const r = stage0(csrc, (q) => (extra && extra[q]) || readGuest(q), p, '/out.nxb');
  return r.files['/out.nxb'];
}
class Lab {
  constructor(sceneText, opts) {
    opts = opts || {};
    this.files = { '/Demo/h.scene': sceneText };
    this.clock = 0; this.dev = {}; this.procs = []; this.pidSeq = 10; this.done = []; this.layers = {}; this.notes = [];
    this.ctlEvery = opts.ctlEvery || 1; this.stepN = 0; this.ctlSrc = opts.ctlSrc || null;
    this.scene = this.spawn(compile('/Apps/player-scene.nx'), { ui: 1 }, 'scene');
  }
  spawn(bin, args, name) { const p = { pid: ++this.pidSeq, ctx: NVM.create(bin), args, name, inbox: [], wait: null, wake: 0, st: 0, err: '', out: [] }; this.procs.push(p); return p; }
  send(p, body) { p.inbox.push({ from: 1, body }); }
  sys(p, name, a) {
    switch (name) {
      case 'args': return p.args;
      case 'pid': return p.pid;
      case 'time': return this.clock;
      case 'read': return typeof this.files[a[0]] === 'string' ? this.files[a[0]] : { error: '找不到文件 ' + a[0] };
      case 'write': this.files[a[0]] = a[1]; return true;
      case 'print': p.out.push(NVM.toStr(a[0])); return true;
      case 'recv': if (p.inbox.length) return p.inbox.shift(); p.wait = 'msg'; p.wake = typeof a[0] === 'number' ? this.clock + a[0] : Infinity; return undefined;
      case 'poll': return p.inbox.length ? p.inbox.shift() : null;
      case 'sleep': p.wait = 'sleep'; p.wake = this.clock + a[0]; return undefined;
      case 'send': { const m = NVM.fromGuest(a[1]); if (a[0] === 1) { if (m.t === 'done') this.done.push(m); else this.notes.push(m); return true; } const q = this.procs.find(x => x.pid === a[0]); if (q) { q.inbox.push({ from: p.pid, body: m }); return true; } return false; }
      case 'dev_write': { const n = a[0]; const d = this.dev[n] || (this.dev[n] = { v: null, t: 0, n: 0, q: [] }); d.v = NVM.fromGuest(a[1]); d.t = this.clock; d.n++; if (a[2] === true) d.q.push({ v: d.v, t: this.clock }); return this.clock; }
      case 'dev_read': { const d = this.dev[a[0]]; return d ? { v: d.v, t: d.t, n: d.n } : null; }
      case 'dev_take': { const d = this.dev[a[0]]; if (!d) return []; const q = d.q; d.q = []; return q; }
      case 'scene_layer': this.layers[a[1]] = { t: a[2], d: NVM.fromGuest(a[3]) }; return true;
      case 'spawn': { const src = this.ctlSrc; const bin = compile(a[0], src ? { [a[0]]: src } : null); const q = this.spawn(bin, NVM.fromGuest(a[1]), 'ctl'); return q.pid; }
      case 'kill': { const q = this.procs.find(x => x.pid === a[0]); if (q) q.st = 4; return true; }
      case 'pstate': { const q = this.procs.find(x => x.pid === a[0]); return q ? q.st : -1; }
      case 'plog': { const q = this.procs.find(x => x.pid === a[0]); return q ? { out: q.out, err: q.err, st: q.st } : null; }
      case 'exit': p.st = 4; return undefined;
      case 'fail': p.st = 5; p.err = NVM.toStr(a[0]); return undefined;
      default: return true;
    }
  }
  runProc(p) {
    let guard = 0;
    while (p.st === 0 && guard++ < 100000) {
      if (p.wait) {
        if (p.wait === 'msg' && p.inbox.length) { p.wait = null; NVM.ret(p.ctx, p.inbox.shift()); }
        else if (this.clock >= p.wake) { const w = p.wait; p.wait = null; NVM.ret(p.ctx, w === 'msg' ? null : this.clock); }
        else return;
      }
      const r = NVM.run(p.ctx, 50000000);
      p.instr = (p.instr || 0) + r[1];
      if (r[0] === 1) { const v = this.sys(p, r[2], r[3]); if (v !== undefined) NVM.ret(p.ctx, v); else if (p.st !== 0) return; }
      else if (r[0] === 2) { p.st = 4; }
      else if (r[0] === 3) { p.st = 5; p.err = r[2]; console.log('FAULT', p.name, r[2]); }
    }
  }
  step() {
    this.clock += 1000 / 60; this.stepN++;
    // 最不利的次序：飞控先于场景进程运行（读到的是上一步的传感器值）
    for (const p of this.procs.slice()) { if (p.name !== 'ctl') continue; if (this.stepN % this.ctlEvery !== 0) continue; this.runProc(p); }
    this.runProc(this.scene);
  }
}
// 运行一个排演脚本；inputs: [[t, kind, value], ...]
function fly(sceneText, inputs, duration, opts) {
  const lab = new Lab(sceneText, opts);
  lab.send(lab.scene, { t: 'load', file: '/Demo/h.scene', h: 1 });
  lab.step();
  lab.send(lab.scene, { t: 'tl', pid: 1 });
  lab.send(lab.scene, { t: 'rehearse', pos: 0 });
  const t0 = lab.clock; let seq = 0; const track = []; const pend = inputs.slice().sort((a, b) => a[0] - b[0]);
  const N = Math.round(duration * 60);
  for (let i = 0; i < N; i++) {
    const t = (lab.clock - t0) / 1000;
    while (pend.length && pend[0][0] <= t + 1e-6) { const e = pend.shift(); lab.send(lab.scene, { t: 'input', kind: e[1], value: e[2] }); }
    lab.send(lab.scene, { t: 'frame', seq: ++seq, pos: t });
    lab.step();
    const d = lab.done.pop(); lab.done.length = 0;
    if (d) { const pl = lab.layers.parts; if (pl && pl.d.root) { const q = pl.d.root; d.tilt = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * (q[3] * q[3] + q[5] * q[5])))) * 180 / Math.PI; } track.push(d); }
  }
  return { lab, track };
}
function saveRecord(lab) {
  lab.send(lab.scene, { t: 'save', path: '/Flights/out.scene' });
  lab.step();
  const j = JSON.parse(lab.files['/Flights/out.scene']);
  return j.flight;
}
module.exports = { Lab, fly, saveRecord, compile, readGuest };

if (require.main === module) {
  const base = fs.readFileSync(path.join(__dirname, 'out', 'scene-base.json'), 'utf8');
  const res = JSON.parse(base); res.flight = { duration: 0, init: { x: 0, z: 0, yaw: -22, seed: 7 }, inputs: [], controls: [] };
  const text = JSON.stringify(res);
  const every = +process.argv[2] || 1;
  const { lab, track } = fly(text, [[0, 'target', { mode: 'fly', x: 0, z: 0, alt: 12, hdg: -22 }], [5, 'target', { mode: 'fly', x: 60, z: -25, alt: 14 }]], 14, { ctlEvery: every });
  for (let i = 0; i < track.length; i += 30) { const s = track[i].sum; console.log(s.t.toFixed(2), 'p', s.p.map(v => v.toFixed(1)).join(','), 'agl', s.agl.toFixed(2), 'thr', s.thrust.toFixed(2), s.crashed ? 'CRASHED' : ''); }
  console.log('instr scene', lab.scene.instr, 'ctl', lab.procs.find(p => p.name === 'ctl').instr, 'notes', JSON.stringify(lab.notes.slice(-1)).slice(0, 400));
}
