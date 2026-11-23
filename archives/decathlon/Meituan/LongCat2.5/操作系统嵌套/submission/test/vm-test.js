'use strict';
global.window = global;
require('../js/vm.js');
const VM = global.NOS.VM;

let failures = 0;
function run(src, opts) {
  opts = opts || {};
  const prog = VM.compile(src);
  const calls = [];
  const proc = {
    pid: 1, state: 'ready', program: prog, vm: { pc: 0, sp: 0, frames: null, stack: [], handlers: [] },
    waitInfo: null, work: 0, yieldCount: 0
  };
  const sys = { runtime: { procSyscall(p, name, args) {
    calls.push([name, ...args]);
    if (opts.syscall) { const r = opts.syscall(name, args, p); if (r !== undefined) return r; }
    return { value: 'SY:' + name };
  } } };
  const vm = new VM.VM();
  let out = [];
  let guard = 0;
  while (proc.state !== 'ended' && proc.state !== 'error' && guard++ < 5000) {
    if (proc.state === 'waiting') { proc.state = 'ready'; proc.waitInfo = null; }
    const ctx = { left: opts.units || 100000, slice: 100000 };
    vm.exec(sys, proc, ctx);
    proc.work += (opts.units || 100000) - ctx.left;
  }
  return { proc, calls };
}
function check(name, src, expect, opts) {
  try {
    const { proc, calls } = run(src, opts);
    if (proc.state === 'error') { console.log('FAIL', name, '-> error:', proc.error); failures++; return; }
    const flat = calls.map(c => c.slice(1)).flat();
    const got = JSON.stringify(flat.includes(expect));
    if (!flat.includes(expect)) { console.log('FAIL', name, '-> missing', JSON.stringify(expect), 'in', JSON.stringify(calls), 'state', proc.state, 'err', proc.error); failures++; }
    else console.log('ok  ', name);
  } catch (e) { console.log('FAIL', name, '-> throw:', e.message); failures++; }
}

check('loop-sum', `
var s = 0
var i = 1
while i <= 10 {
  s = s + i
  i = i + 1
}
print s
`, 55);

check('for-factorial', `
var f = 1
for (var i = 1; i <= 6; i = i + 1) {
  f = f * i
}
print f
`, 720);

check('func-fib', `
func fib(n) {
  if n < 2 { return n }
  return fib(n-1) + fib(n-2)
}
print fib(15)
`, 610);

check('array-map', `
var a = [10, 20, 30]
var m = {"x": 1, "y": "hi"}
a[1] = 99
m["z"] = a[1] + a[2]
print m["z"]
print len(a)
`, 129);

check('strings', `
var s = "abc"
s = s + "def"
print upper(s)
print substr(s, 2, 5)
`, 'abcdef');

check('shortcircuit', `
var i = 0
func bump() { return true }
var r = false && bump()
var q = true || bump()
print i
print r
print q
`, false);

check('try-catch', `
var r = 0
try {
  throw "boom"
  r = 1
} catch e {
  r = 2
  print e
}
print r
`, 2);

check('try-catch-value', `
var r = 0
try {
  var x = [1]
  print x[5]
} catch e {
  print "caught"
}
print "after"
`, 'after');

check('nested-func', `
func add(a, b) { return a + b }
func mul(a, b) { return a * b }
print add(mul(2, 3), 4)
`, 10);

check('sleep-block', `
print "a"
sleep 100
print "b"
`, 'b', { syscall: (n, a) => { if (n === 'sleep') return { block: { type: 'timer', remaining: a[0] } }; } });

check('map-obj', `
var m = {}
m["k"] = 5
m.k = m.k + 1
print m["k"]
`, 6);

// 工作量守恒检查：持续计算程序按预算暂停后恢复继续
(function () {
  const src = `
var i = 0
while true {
  i = i + 1
}
print i
`;
  try {
    const prog = VM.compile(src);
    const proc = { pid: 1, state: 'ready', program: prog, vm: { pc: 0, sp: 0, frames: null, stack: [], handlers: [] }, waitInfo: null, work: 0 };
    const sys = { runtime: { procSyscall() { return { value: null }; } } };
    const vm = new VM.VM();
    let total = 0;
    for (let k = 0; k < 5; k++) {
      const ctx = { left: 1000, slice: 100000 };
      vm.exec(sys, proc, ctx);
      total += 1000 - ctx.left;
    }
    // 读取变量 i 的值
    const st = proc.vm;
    const val = st.globals ? st.globals[0] : (st.frames && st.frames.length ? st.frames[0].locals[0] : undefined);
    console.log('preempt work total =', total, 'i =', val, total === 5000 && val > 0 ? 'ok' : 'FAIL');
    if (!(total === 5000 && val > 0)) failures++;
  } catch (e) { console.log('FAIL preempt:', e.message); failures++; }
})();

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILURES');
process.exit(failures ? 1 : 0);
