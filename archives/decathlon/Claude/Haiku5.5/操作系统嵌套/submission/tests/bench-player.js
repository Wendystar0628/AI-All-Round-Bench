'use strict';
// 基准：在无界面环境中运行播放器（排演模式），统计内核自身与各进程的消耗、陷入次数。
// 用法：node tests/bench-player.js [秒数]
const fs = require('fs');
const path = require('path');
const { Universe } = require('../src/runtime/universe.js');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const seconds = Number(process.argv[2] || 3);

// 模板：与应用一致（系统程序与示例）
function walk(dir, prefix, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const vp = prefix + '/' + ent.name;
    if (ent.isDirectory()) walk(full, vp, out);
    else if (/\.(ns|nobj|json|txt|scene|sheet)$/.test(ent.name)) out[vp] = fs.readFileSync(full, 'utf8');
  }
}
const tpl = {};
walk(path.join(root, 'assets/system'), '/System', tpl);
walk(path.join(root, 'assets/demo'), '/Demo', tpl);
walk(path.join(root, 'assets/documents'), '/Documents', tpl);
walk(path.join(root, 'assets/flight'), '/Flight', tpl);

global.window = {};
require('../src/renderer/images.js');
const u = new Universe({ measure: (t, s) => t.length * s * 0.6, dirty() {}, emit() {} });
u.template = tpl;
for (const k of Object.keys(window.PRECOMPILED)) u.compileCache.set(k, window.PRECOMPILED[k]);
// 根系统的 wm 替换为一个只负责启动播放器与排演的程序
const rootFiles = {
  '/System/wm.ns': `func main(args) {
    var r = sys_spawn("/System/apps/player.ns", [1, "player", "/Demo/helicopter-24.scene"]);
    print("player", r.ok, r.pid);
    while (true) { var m = sys_recv(); }
    return 0;
  }`,
};
const rt = u.makeRoot(rootFiles, tpl['/System/kernel.ns']);
const child = u.makeChild(rt, 'inner-1', tpl['/System/kernel.ns'], tpl);
// 子系统的 wm 替换：启动播放器（同上）
child.setDisk('f:/System/wm.ns', rootFiles['/System/wm.ns']);
child.bootKernel(tpl['/System/kernel.ns']);
child.cfg.budget = Number(process.env.BUDGET || 20000);
// 直接在子系统内运行，不经过根系统的 wm
const steps = Math.round(seconds * 60);
const t0 = Date.now();
for (let i = 0; i < steps; i++) u.tick();
const ms = Date.now() - t0;
const st = child.stat;
console.log('child budget/step', child.cfg.budget, 'steps', steps, 'wall ms', ms);
console.log('stat total', st.total, 'procs', st.procs, 'kids', st.kids, 'self', st.total - st.procs - st.kids);
const procs = child.kernel.G.procs.map((p) => `${p.name}:${p.state}:${p.work}`);
console.log(procs.join('  '));

// ---- 进一步统计：内核调用与陷入类型（重新运行一段时间） ----
if (process.env.TRAPS) {
  const counts = {};
  const kp = child.kernel.privs;
  const wrap = (name, fn) => { counts[name] = 0; return (a, vm) => { counts[name]++; return fn(a, vm); }; };
  for (const k of Object.keys(kp)) kp[k] = wrap(k, kp[k]);
  const probe = {};
  const origRun = kp.priv_run;
  kp.priv_run = (a, vm) => {
    const r = origRun(a, vm);
    const key = 'run:' + (r.reason || '') + ':' + (r.name || '') + ':' + (r.used < 5 ? 'tiny' : 'big');
    probe[key] = (probe[key] || 0) + 1;
    return r;
  };
  for (let i = 0; i < 60; i++) u.tick();
  console.log('priv calls', JSON.stringify(counts));
  console.log('run outcomes', JSON.stringify(probe));
}
