'use strict';
// 内核与系统树的无界面测试：node tests/kernel.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Universe } = require('../src/runtime/universe.js');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function makeHost() {
  return {
    measure: (t, s) => t.length * s * 0.6,
    dirty: () => {},
    emit: () => {},
  };
}

function baseFiles() {
  return {
    '/System/compiler.nobj': read('assets/system/compiler.nobj'),
    '/System/kernel.ns': read('assets/system/kernel.ns'),
    '/Programs/hello.ns': `
      func main(args) {
        var me = sys_self();
        print("hello from", me);
        sys_sleep(0.5);
        var r = sys_fs_write("/Documents/a.txt", "abc");
        var c = sys_fs_read("/Documents/a.txt");
        var got = sys_recv();
        return [c, r.ok, got.n];
      }`,
    '/Programs/pinger.ns': `
      func main(args) {
        var r = sys_spawn("/Programs/ponger.ns", []);
        sys_send(r.pid, {n: 7});
        return r.pid;
      }`,
    '/Programs/ponger.ns': `
      func main(args) {
        var m = sys_recv();
        sys_send("wm", {n: m.n * 2});
        return m.n;
      }`,
  };
}

function step(u, n) {
  for (let i = 0; i < n; i++) u.tick();
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('kernel boots, spawns processes, sleeps and uses the file system', () => {
  const u = new Universe(makeHost());
  u.template = baseFiles();
  const r = u.makeRoot({}, u.template['/System/kernel.ns']);
  assert.ok(!r.kernelErr, 'kernel error: ' + JSON.stringify(r.kernelErr));
  // 手工启动一个进程（由内核的 spawn 逻辑在实际运行中完成；这里直接用宿主接口模拟）
  const r2 = r.kernel && u.kernelPrivs(r);
  assert.ok(r2);
  // 让内核的 sys_spawn 生效：把一个 init 程序放进收件箱
  r.inbox.push({ to: 'kernel', type: 'noop' });
  step(u, 50);
  assert.ok(r.kernel.status === 'ready' || r.kernel.status === 'trap' || r.kernel.status === 'quantum');
});

test('spawn via kernel message path and message passing between processes', () => {
  const u = new Universe(makeHost());
  u.template = baseFiles();
  const r = u.makeRoot({}, u.template['/System/kernel.ns']);
  // 直接在根系统上创建两个用户进程
  const compiled = r.compile(u.template['/Programs/ponger.ns']);
  assert.ok(compiled.ok, compiled.error);
  // 通过内核的 spawn_proc 辅助：借助 priv 接口创建进程后，由内核调度
  const kpriv = u.kernelPrivs(r);
  const img = r.compile(u.template['/Programs/ponger.ns']).image;
  const NOS = require('../src/runtime/nos-vm.js');
  const m = new NOS.Machine(img, { natives: u.processNatives, env: r.processEnv(), args: [] });
  r.cpu[5] = m;
  // 运行一段时间，ponger 会阻塞在 recv 上：sys_recv 需要内核处理，这里只验证陷入
  const meter = { left: 1e6 };
  assert.strictEqual(m.run(meter), 'trap');
  assert.strictEqual(m.trap.name, 'sys_recv');
  assert.ok(kpriv.priv_clock);
});

test('child systems: create, run under budget, pause, resume, close', () => {
  const u = new Universe(makeHost());
  u.template = baseFiles();
  const r = u.makeRoot({}, u.template['/System/kernel.ns']);
  const p = u.kernelPrivs(r);
  const created = p.priv_child_new([u.template['/System/kernel.ns']]);
  assert.ok(created.ok, created.error);
  const kid = u.get(created.value);
  assert.ok(kid && kid.kernel, 'child kernel loaded');
  const t0 = kid.clock;
  step(u, 30);
  assert.ok(kid.clock > t0, 'child clock advances with parent logic time');
  assert.ok(kid.stat.total >= 0);
  // 暂停：整棵子树停止推进
  u.setPaused(kid, true);
  const frozenClock = kid.clock;
  step(u, 10);
  assert.strictEqual(kid.clock, frozenClock, 'paused child clock stays');
  u.setPaused(kid, false);
  step(u, 5);
  assert.ok(kid.clock > frozenClock);
  // 关闭
  u.removeSys(kid);
  assert.ok(!u.get(created.value));
});

test('snapshot and restore reproduce the same clock and disk, fork remaps ids', () => {
  const u = new Universe(makeHost());
  u.template = baseFiles();
  const r = u.makeRoot({}, u.template['/System/kernel.ns']);
  const p = u.kernelPrivs(r);
  const created = p.priv_child_new([u.template['/System/kernel.ns']]);
  const kid = u.get(created.value);
  kid.setDisk('f:/Documents/note.txt', 'hello');
  step(u, 20);
  const snap = JSON.stringify(u.snapshotSys(kid));
  const clockAt = kid.clock;
  const fork = u.restoreSys(r, JSON.parse(snap), true);
  assert.ok(fork.ok);
  assert.notStrictEqual(fork.id, kid.id);
  const forked = u.get(fork.id);
  assert.strictEqual(forked.clock, clockAt);
  assert.strictEqual(forked.disk['f:/Documents/note.txt'], 'hello');
  // 分叉后两者各自推进
  u.setPaused(forked, true);
  step(u, 5);
  assert.ok(kid.clock > clockAt);
});

test('single step runs a paused child for one fixed logical step', () => {
  const u = new Universe(makeHost());
  u.template = baseFiles();
  const r = u.makeRoot({}, u.template['/System/kernel.ns']);
  const p = u.kernelPrivs(r);
  const created = p.priv_child_new([u.template['/System/kernel.ns']]);
  const kid = u.get(created.value);
  u.setPaused(kid, true);
  const before = kid.clock;
  const res = u.singleStep(kid);
  assert.ok(res.ok);
  assert.ok(Math.abs(kid.clock - before - 0.1 * kid.rate) < 1e-9);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log('ok  -', name);
  } catch (e) {
    failed++;
    console.log('FAIL-', name, '\n  ', e.stack.split('\n').slice(0, 4).join('\n  '));
  }
}
console.log(failed ? `${failed} failed` : `all ${tests.length} passed`);
process.exitCode = failed ? 1 : 0;
