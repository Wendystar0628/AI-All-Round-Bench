'use strict';
// 端到端：内核启动真实的 WM 程序，由它启动其他进程并核对消息、睡眠、文件与日志。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Universe } = require('../src/runtime/universe.js');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const files = {
  '/System/compiler.nobj': read('assets/system/compiler.nobj'),
  '/System/kernel.ns': read('assets/system/kernel.ns'),
  '/System/wm.ns': `
    func main(args) {
      var a = sys_spawn("/Programs/hello.ns", []);
      var b = sys_spawn("/Programs/pinger.ns", []);
      print("spawned", a.ok, b.ok);
      var n = 0;
      while (n < 2) {
        var m = sys_recv();
        print("wm got", json(m));
        n = n + 1;
      }
      sys_fs_write("/Documents/done.txt", "done");
      return n;
    }`,
  '/Programs/hello.ns': `
    func main(args) {
      sys_sleep(0.5);
      var w = sys_fs_write("/Documents/a.txt", "abc");
      sys_send("wm", {from: "hello", ok: w.ok, text: sys_fs_read("/Documents/a.txt")});
      return 1;
    }`,
  '/Programs/pinger.ns': `
    func main(args) {
      var r = sys_spawn("/Programs/ponger.ns", []);
      sys_send(r.pid, {n: 7, reply: sys_self()});
      var back = sys_recv();
      sys_send("wm", {from: "pinger", back: back});
      return back;
    }`,
  '/Programs/ponger.ns': `
    func main(args) {
      var m = sys_recv();
      sys_send(m.reply, {from: "ponger", n: m.n});
      return m.n;
    }`,
};

const host = { measure: (t, s) => t.length * s * 0.6, dirty: () => {}, emit: () => {} };
const u = new Universe(host);
u.template = files;
const r = u.makeRoot({}, files['/System/kernel.ns']);
const seen = new Set();
const collect = () => r.cpu.filter(Boolean).forEach((p) => (p.logs || []).forEach((l) => seen.add(l)));
for (let i = 0; i < 400; i++) {
  u.tick();
  collect();
}
assert.ok(!r.kernelErr, 'kernel error ' + JSON.stringify(r.kernelErr));
const allLogs = [...seen, ...r.grave.flatMap((g) => g.logs)];
console.log('logs:', allLogs);
assert.ok(allLogs.some((l) => l.startsWith('spawned true true')), 'spawn works');
assert.ok(allLogs.some((l) => l.includes('"from":"hello"') && l.includes('"text":"abc"') && l.includes('"ok":true')), 'hello wrote and read file after sleep');
assert.ok(allLogs.some((l) => l.includes('"back":{"from":"ponger","n":7}')), 'pinger got back reply from ponger');
assert.ok(allLogs.some((l) => l.includes('"from":"pinger"')), 'pinger got back reply');
assert.strictEqual(r.disk['f:/Documents/a.txt'], 'abc');
assert.strictEqual(r.disk['f:/Documents/done.txt'], 'done');
console.log('kernel e2e ok');
