'use strict';
// 语言与虚拟机的基础测试：node tests/vm.test.js
const assert = require('assert');
const NOS = require('../src/runtime/nos-vm.js');
const { makeStdlib } = require('../src/runtime/nos-stdlib.js');
const { compile } = require('../tools/nosc.js');

function build(src, opts = {}) {
  const r = compile(src);
  if (!r.ok) throw new Error(r.message);
  return new NOS.Machine(r.image, { natives: makeStdlib(), env: { rand: () => 0.5 }, ...opts });
}

function runAll(m, budget = 1e7) {
  const meter = { left: budget };
  let st = m.run(meter);
  return st;
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok  -', name);
  } catch (e) {
    console.log('FAIL-', name, '\n  ', e.message);
    process.exitCode = 1;
  }
}

test('arithmetic, globals, functions and recursion', () => {
  const m = build(`
    var base = 10;
    func fib(n) { if (n < 2) { return n; } return fib(n - 1) + fib(n - 2); }
    func main(args) { return fib(12) + base; }
  `);
  assert.strictEqual(runAll(m), 'exit');
  assert.strictEqual(m.result, 154);
});

test('while, for, break/continue, and/or short circuit', () => {
  const m = build(`
    func main(args) {
      var s = 0;
      for (var i = 0; i < 10; i = i + 1) {
        if (i == 3) { continue; }
        if (i == 8) { break; }
        s = s + i;
      }
      var k = 0;
      while (k < 5) { k = k + 1; }
      var z = nil && 1.5;
      var w = 0 || "x";
      return [s, k, z, w];
    }
  `);
  runAll(m);
  assert.deepStrictEqual(m.result, [25, 5, null, 'x']);
});

test('for-in over arrays, index assignment, maps and strings', () => {
  const m = build(`
    func main(args) {
      var arr = [];
      for (var x in [3, 4, 5]) { push(arr, x * x); }
      var m = {name: "abc", n: 2};
      m.n = m.n + 40;
      arr[0] = "first";
      return [arr, m.n, substr("hello world", 6, 5), "v=" + 3, m.missing];
    }
  `);
  runAll(m);
  assert.deepStrictEqual(m.result, [['first', 16, 25], 42, 'world', 'v=3', null]);
});

test('budget exhaustion keeps state and resumes exactly', () => {
  const src = `
    func main(args) {
      var t = 0;
      for (var i = 0; i < 2000; i = i + 1) { t = t + i; }
      return t;
    }`;
  const m = build(src);
  let st, calls = 0;
  do {
    st = m.run({ left: 37 });
    calls++;
  } while (st === 'quantum');
  assert.strictEqual(st, 'exit');
  assert.strictEqual(m.result, 1999000);
  assert.ok(calls > 100);
});

test('snapshot and restore mid-execution gives same result', () => {
  const src = `
    func main(args) {
      var t = 0;
      for (var i = 0; i < 500; i = i + 1) { t = t + i * 2; }
      return t;
    }`;
  const a = build(src);
  a.run({ left: 400 });
  assert.strictEqual(a.status, 'ready');
  const snap = JSON.parse(JSON.stringify(a.snapshot()));
  const b = new NOS.Machine(a.image, { natives: makeStdlib(), env: {} }).restore(snap);
  runAll(a);
  runAll(b);
  assert.strictEqual(a.result, b.result);
  assert.strictEqual(a.result, 249500);
});

test('syscall traps and resume with value', () => {
  const m = build(`
    func main(args) {
      var a = sys_now();
      var b = sys_recv();
      return a + b;
    }`);
  assert.strictEqual(runAll(m), 'trap');
  assert.strictEqual(m.trap.name, 'sys_now');
  m.resume(5);
  assert.strictEqual(runAll(m), 'trap');
  m.resume(7);
  assert.strictEqual(runAll(m), 'exit');
  assert.strictEqual(m.result, 12);
});

test('runtime errors report line numbers and do not throw', () => {
  const m = build(`
    func main(args) {
      var a = 1;
      var b = 0;
      return a / b;
    }`);
  assert.strictEqual(runAll(m), 'error');
  assert.strictEqual(m.error.message, '除数为零');
  assert.strictEqual(m.error.line, 5);
});

test('compile errors are reported with line', () => {
  const r = compile('func main() {\n  var x = ;\n}');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.line, 2);
});

console.log(`\n${passed} passed`);
