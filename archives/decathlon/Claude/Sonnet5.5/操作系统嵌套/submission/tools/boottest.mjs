import { Machine, buildBase, DT } from '../src/host/machine.js';
import { loadImageFiles } from './image.mjs';
import { tostr } from '../src/host/vm.js';
const files = loadImageFiles();
const stubDisplay = { reset() {}, dropCtx() {}, submit(cid, v, cmds) { this.last = this.last || {}; this.last[cid + ':' + v] = cmds; }, free() {}, snapshotCtxs() { return null; }, restoreCtxs() {}, sceneLoad() {}, sceneState() {}, sceneFree() {}, scenePick() { return null; }, inputValue() { return null; } };
const M = new Machine({ base: buildBase(files), display: stubDisplay });
M.boot(null);
if (M.fatal) { console.log('FATAL', M.fatal); process.exit(1); }
const steps = Number(process.argv[2] || 300);
const t0 = Date.now();
for (let i = 0; i < steps; i++) { M.step(); if (M.fatal) { console.log('FATAL', M.fatal); break; } }
console.log('steps', steps, 'ms', Date.now() - t0, 'clock', M.clock.toFixed(2), 'used/step', M.used);
// 读取内核全局 K
function kglobal(ctx, name) { const i = ctx.prog.gn.indexOf(name); return ctx.globals[i]; }
export function dump(ctx, indent = '') {
  const K = kglobal(ctx, 'K');
  for (const pid of K.order) {
    const p = K.procs[pid];
    console.log(indent + `[pid ${p.pid}] ${p.name} ${p.kind} state=${p.state}${p.wait ? '/' + p.wait : ''} used=${p.used}`);
    for (const l of p.out.slice(-4)) console.log(indent + '    | ' + l);
    if (p.kind === 'system' && p.ctx) { console.log(indent + '    system', tostr(p.sys.state), 'kerr', p.sys.kerr); const c = M.vm.ctxs.get(p.ctx.id); if (c) dump(c, indent + '      '); }
  }
  for (const z of K.zombies) { const p = K.procs[z]; if (p) console.log(indent + `[zombie ${p.pid}] ${p.name} ${p.state} result=${tostr(p.result)} err=${p.err && p.err.msg}`); for (const l of (p && p.out || []).slice(-3)) console.log(indent + '    | ' + l); }
}
dump(M.k0);
console.log(M.hostLog.join('\n'));
