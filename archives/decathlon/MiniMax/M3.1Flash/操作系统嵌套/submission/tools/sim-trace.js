/*
 * 无界面仿真台：在 Node 中驱动宿主运行时，便于快速定位内核/应用层的问题。
 * 用法：node tools/sim.js [应用名] [步数]
 */
require('../src/core/nsl-core.js');
require('../src/renderer/js/vfs.js');
require('../src/renderer/js/runtime.js');
const fs = require('fs');
const path = require('path');

const NSL = globalThis.NSL;
const NOS = globalThis.NOS;
const root = path.join(__dirname, '..', 'src', 'nsl');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const apps = {};
for (const n of ['files', 'editor', 'tasks', 'player', 'charts', 'system', 'player-timing', 'player-scene', 'player-fx']) {
  apps[n] = read(path.join('apps', n + '.nsl'));
}
const F = {
  kernel: read('kernel.nsl'),
  compiler: read('compiler.nsl'),
  flightController: read('flight-controller.nsl'),
  apps,
  scene: read('helicopter-24.scene.json'),
  sceneCopy: read('helicopter-24.scene.json'),
  workbook: read('sample.sheet.json'),
  programs: {},
};

const rt = new NOS.Runtime({
  fixtures: F,
  onSync: (sys) => { if (process.env.SIM_VERBOSE) console.log('[sync]', sys.id, JSON.stringify((sys.windows || []).map((w) => w.app))); },
  onScene: (sys, key, data) => { if (process.env.SIM_VERBOSE) console.log('[scene]', sys.id, key, Object.keys(data || {})); },
  verbose: !!process.env.SIM_VERBOSE,
  trace: true,
});
const rootSys = rt.createRoot();
rt.loadCompiler(rootSys);
const child = rt.createChild(rootSys);
rt.loadCompiler(child);
const ksrc = rootSys.fs.read('/System/kernel.nsl');
const kprog = rt.compileWithSystem(rootSys, ksrc.content);
const kp = new NOS.Proc(child, 'kernel', 'kernel', kprog, '/System/kernel.nsl');
rootSys.processes.push(kp);
child.kernelProc = kp;

const appName = process.argv[2] || 'player';
const steps = parseInt(process.argv[3] || '60', 10);
child.pendingEvents.push({ kind: 'launch', name: appName, path: '/System/apps/' + appName + '.nsl' });

for (let i = 0; i < steps; i++) {
  rt.step();
  if (process.env.SIM_CLICK && i === 60) {
    const w = (child.windows || [])[0];
    if (w) child.pendingEvents.push({ kind: 'input', type: 'click', x: w.x + 22, y: w.y + 34 + 356, window: w.id });
  }
}
const dump = (sys) => {
  console.log('== ' + sys.id + ' 时间 ' + sys.time + ' 预算 ' + sys.budgetUsed + '/' + sys.budgetTotal + ' 状态 ' + sys.state);
  for (const p of sys.processes) {
    console.log('   进程 ' + p.name + ' [' + p.id + '] ' + p.state + ' 消耗 ' + p.consumed +
      ' 剩余 ' + p.remaining + ' 等待tag ' + p.waitTag + ' 唤醒 ' + p.wakeAt +
      ' 信箱 ' + p.inbox.length + (p.error ? (' 错误: ' + p.error) : ''));
    for (const m of p.inbox.slice(0, 3)) {
      console.log('      信箱消息: ' + String(m.payload).slice(0, 160));
    }
  }
  console.log('   窗口 ' + JSON.stringify((sys.windows || []).map((w) => w.app + ':' + w.title)));
  console.log('   场景 ' + JSON.stringify(Array.from(sys.sceneCache.keys())));
};
dump(child);
dump(rootSys);
for (const [k, d] of child.sceneCache) {
  const st = d.state || {};
  const p = (st.parts && st.parts.body) || null;
  console.log('场景 ' + k + ' 机体位置 ' + JSON.stringify(p && p.pos) + ' 旋翼 ' + st.rotorSpeed +
    ' 应用 ' + JSON.stringify(st.app) + ' 粒子 ' + (st.particles || []).length);
}
console.log('日志:');
for (const l of rt.logs) console.log('   ' + l);
