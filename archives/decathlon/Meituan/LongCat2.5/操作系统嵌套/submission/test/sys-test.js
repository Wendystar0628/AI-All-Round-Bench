'use strict';
// 无头集成测试：根系统 + 子系统（NIL 内核）+ 用户程序
global.window = global;
window.NOS = window.NOS || {};
const NS = window.NOS;
NS.fmtBytes = n => String(n);
NS.makeId = p => p + '-' + Math.random().toString(36).slice(2, 8);
NS.uid = p => p + '-' + Math.random().toString(36).slice(2, 8);
NS.clamp = (v,a,b) => Math.max(a, Math.min(b,v));
NS.jsonClone = v => JSON.parse(JSON.stringify(v));
NS.el = () => null;
NS.toast = () => {};
NS.download = () => {};
NS.confirmDialog = () => Promise.resolve(false);
NS.AppHost = { onProcOutput(){}, onAppProcStateChange(){}, closeAppByPid(){}, applyUiOp(){} };
NS.DesktopAPI = { applyUiOp(){}, onSystemCreated(){}, onSystemStopped(){}, onSystemRestarted(){} };
NS.SceneHost = { onSceneSubmit(){}, onFxSubmit(){} };

require('../js/vm.js');
require('../js/kernel-sources.js');
require('../js/sys.js');

const K = NS.KernelSources;
let failures = 0;
function ok(cond, label) { console.log((cond ? 'ok   ' : 'FAIL ') + label); if (!cond) failures++; }

const root = new NS.Sys(null, {});
root.seedFixtures();
ok(root.fs.exists('/Programs/sum.nil'), 'fixtures seeded');

const { sys: inner, carrier } = root.createChild({ name: 'inner-1' });
ok(!!inner && inner.depth === 1, 'child created depth 1');
ok(inner.kernelProc && inner.kernelProc.role === 'kernel', 'kernel proc exists');
ok(carrier && carrier.role === 'carrier', 'carrier proc exists in parent');

const r = inner.spawnNIL(K.progSum(), 'sum');
ok(!r.error, 'spawn sum program');
const sumPid = r.proc.pid;

const r2 = inner.spawnNIL(K.progReceiver(), 'receiver');
const r3 = inner.spawnNIL(K.progSender(), 'sender');
ok(!r2.error && !r3.error, 'spawn sender/receiver');

// 推进 120 个逻辑步（每步 50ms 虚拟时间）
for (let i = 0; i < 120; i++) {
  root.advance(NS.STEP_MS);
}

const sumProc = inner.procs.get(sumPid);
ok(sumProc && sumProc.state !== 'error', 'sum state=' + (sumProc && sumProc.state) + ' err=' + (sumProc && sumProc.error));
const logs = sumProc ? sumProc.log.join('|') : '';
ok(/sum=\s*5050/.test(logs), 'sum output: ' + logs);

const recv = inner.procs.get(r2.proc.pid);
ok(recv && recv.log.filter(l => l.startsWith('recv:')).length >= 5, 'receiver got msgs: ' + (recv ? recv.log.join('|') : ''));

// 承载进程读数包含后代工作
ok(carrier.work > 0, 'carrier work=' + carrier.work);
ok(inner.totalWorkAll > 0, 'inner total work=' + inner.totalWorkAll);

// 消息目标不存在时发送方得到明确结果
const r4 = inner.spawnNIL(`
var s = send(9999, "x")
print "send-ret=" s
var m = recv()
if m != null {
  print "got:" m[0]
} else {
  print "got-null"
}
halt()
`, 'errtest');
for (let i = 0; i < 30; i++) root.advance(NS.STEP_MS);
const ep = inner.procs.get(r4.proc.pid);
ok(ep && /got:/.test(ep.log.join('|')), 'error reply delivered: ' + (ep ? ep.log.join('|') : '') + ' err=' + (ep && ep.error));

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILURES');
process.exit(failures ? 1 : 0);
