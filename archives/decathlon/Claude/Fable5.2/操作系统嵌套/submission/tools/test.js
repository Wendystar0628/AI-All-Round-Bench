'use strict';
const NVM = require('../src/host/vm.js');
const { RootKernel } = require('../src/host/rootkernel.js');
const { build } = require('./build.js');
const testWm = `
var info = sys("wm_register");
sys("print", "wm up " + info.id + " depth " + info.depth);
if (info.depth == 2) {
  sys("spawn", "/Programs/sum.nx", null, false);
  sys("spawn", "/Programs/send.nx", null, false);
}
if (info.depth < 4) { var r = sys("sys_create", "测试"); sys("print", "created " + json(r)); }
else { sys("spawn", "/Programs/busy.nx", null, false); }
while (true) { var m = sys("recv"); if (m.body.t != "tree") { sys("print", "wm msg " + json(m.body)); } }
`;
function dump(ctx, ind) {
  ind = ind || '';
  const g = n => NVM.peek(ctx, n);
  console.log(ind + '== ' + g('MYID') + ' clock=' + Math.round(g('CLOCK')) + ' step=' + g('STEPN') + ' stepUsed=' + g('STEP_USED') + ' kown=' + g('KOWN_LAST') + ' stor=' + g('STOR') + ' state=' + ctx.state + (ctx.error ? ' ERR ' + ctx.error : ''));
  for (const p of g('PROCS') || []) {
    console.log(ind + `  pid ${p.pid} ${p.name} st=${p.st} used=${p.used} last=${p.last} ${p.err ? 'ERR ' + p.err : ''} out=${JSON.stringify((p.out || []).slice(-2))}`);
    if (p.sys && p.ctx) dump(p.ctx.ctx, ind + '    ');
  }
  const kl = g('KLOG'); if (kl && kl.length) console.log(ind + '  klog: ' + kl.slice(-3).join(' | '));
}
const t0 = Date.now();
const { files } = build({ override: { '/System/wm.nx': testWm } });
const gfxCount = {};
const K = new RootKernel({ gfx: (o, op) => { gfxCount[o + ':' + op] = (gfxCount[o + ':' + op] || 0) + 1; return true; }, tree: t => { K.lastTree = t; } });
const img = {}; for (const p in files) img[p] = files[p] === null ? { k: 'd' } : { k: 'f', d: files[p] };
K.fs.loadImage(img);
console.log('build', Date.now() - t0, 'ms; root files', K.fs.nodes.size, 'used', K.fs.used);
const c = K.createSystem('一号');
if (c.error) throw new Error(c.error);
let t = Date.now();
for (let i = 0; i < 240; i++) K.step();
console.log('240 steps', Date.now() - t, 'ms');
console.log('root procs:', K.procs.map(p => `${p.pid}:${p.name}:${p.st}:${p.used}${p.err ? ':' + p.err : ''}`).join('  '));
dump(c.ctx);
console.log('tree:', JSON.stringify(K.lastTree.map(n => [n.id, n.parentId, n.state])));
// 快照 / 恢复 / 分叉
let snapDone = null;
K.childSnapshot(c, '/Snapshots/s1.snap', r => { snapDone = r; });
for (let i = 0; i < 30; i++) K.step();
console.log('snapshot', snapDone, 'root used', K.fs.used);
const clockAt = NVM.peek(c.ctx, 'CLOCK');
for (let i = 0; i < 60; i++) K.step();
console.log('before restore clock', Math.round(NVM.peek(c.ctx, 'CLOCK')));
console.log('restore', K.childRestore(c, '/Snapshots/s1.snap'));
for (let i = 0; i < 3; i++) K.step();
console.log('after restore clock', Math.round(NVM.peek(c.ctx, 'CLOCK')), 'expected about', Math.round(clockAt + 3 * 16.67));
const f = K.childFork('/Snapshots/s1.snap');
console.log('fork', f.id || f);
for (let i = 0; i < 60; i++) K.step();
console.log('tree:', JSON.stringify(K.lastTree.map(n => [n.id, n.parentId, n.state])));
dump(f.ctx);
// 暂停 / 单步
K.childCtl(c, 'pause');
const c0 = NVM.peek(c.ctx, 'CLOCK');
for (let i = 0; i < 30; i++) K.step();
console.log('paused clock delta', NVM.peek(c.ctx, 'CLOCK') - c0);
K.childCtl(c, 'step'); K.step(); K.step();
console.log('after single step delta', (NVM.peek(c.ctx, 'CLOCK') - c0).toFixed(2));
K.childCtl(c, 'resume');
// 重启
K.childCtl(c, 'restart');
for (let i = 0; i < 120; i++) K.step();
console.log('after restart:'); dump(c.ctx);
console.log('gfx', gfxCount);
console.log('root kinfo', JSON.stringify(K.kinfo()));
