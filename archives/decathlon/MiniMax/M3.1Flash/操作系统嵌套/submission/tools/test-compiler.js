/* NSL 编译器自检：node tools/test-compiler.js */
require('../src/core/nsl-core.js');
const fs = require('fs');
const path = require('path');
const NSL = globalThis.NSL;

const compilerPath = path.join(__dirname, '..', 'src', 'nsl', 'compiler.nsl');
const compilerSrc = fs.readFileSync(compilerPath, 'utf8');

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n      期望 ' + e + '\n      实际 ' + a); }
}

console.log('== 引导：用引导器装载 NSL 编译器 ==');
let compilerProg;
try {
  compilerProg = NSL.compileSource(compilerSrc);
  console.log('  ✓ 编译器源码可被引导器编译');
} catch (e) {
  console.log('  ✗ 引导失败: ' + e.message);
  process.exit(1);
}

function compileByNSL(src) {
  const logs = [];
  const ctx = {
    globals: {}, budget: 50000000, log: (t) => logs.push(t), now: () => 0, rngState: 1,
  };
  const r = NSL.callFunction(compilerProg, 'compileProgram', [src], ctx);
  if (r.status === 'error') throw new Error('编译器运行错误: ' + r.error);
  if (r.status !== 'done') throw new Error('编译器未完成: ' + r.status + '（消耗 ' + r.consumed + '）');
  const obj = JSON.parse(r.value);
  if (obj.error) throw new Error('编译错误: ' + obj.error);
  obj.funcNames = (obj.funcs || []).map((f) => f.name);
  return { prog: obj, logs, consumed: r.consumed };
}

function runProgram(prog, src) {
  const logs = [];
  const ctx = { globals: {}, budget: 1000000, log: (t) => logs.push(t), now: () => 0, rngState: 7 };
  const r = NSL.execute(prog, ctx);
  return { logs, status: r.status, error: r.error, value: r.value };
}

const samples = {
  '算术与变量': `
    var a = 2; var b = 3;
    print(a + b); print(a * b - 1); print((a+b)*2); print("x" + a); print(7 % 3); print(7 / 2);
    print(a == 2); print(a != 2); print(a < b); print(a >= b);
  `,
  '控制流': `
    var i = 0; var s = 0;
    while (i < 5) { if (i == 2) { i = i + 1; continue; } s = s + i; i = i + 1; }
    print(s);
    for (var j = 0; j < 4; j = j + 1) { if (j == 3) { break; } print(j); }
    var k = 0;
    for (var m = 0; m < 10; m = m + 1) { k = k + m; }
    print(k);
  `,
  '函数与递归': `
    function fact(n) { if (n <= 1) { return 1; } return n * fact(n - 1); }
    function fib(n) { if (n < 2) { return n; } return fib(n-1) + fib(n-2); }
    print(fact(6)); print(fib(12));
    function greet(who) { return "hi " + who; }
    print(greet("ns"));
  `,
  '数组与内建': `
    var arr = [10, 20, 30];
    arr[1] = 99; print(arr[1]); print(arr.len(arr));
    arr.push(arr, 40); print(arr.join(arr, "-"));
    var t = [1,2,3]; t[0] += 5; print(t[0]);
    var m = map.new(); map.set(m, "k", 7); print(map.get(m, "k"));
    print(str.len("abc")); print(math.sqrt(16)); print(math.max(3,9));
    print(json.str([1,"two",true]));
    var p = json.parse("[1,2,3]"); print(arr.len(p));
    print(str.at("hello", 1)); print(str.sub("hello",1,3));
  `,
};

console.log('== 编译器与引导器结果一致 ==');
for (const key of Object.keys(samples)) {
  const src = samples[key];
  const boot = runProgram(NSL.compileSource(src), src);
  let nsl;
  try {
    nsl = runProgram(compileByNSL(src).prog, src);
  } catch (e) {
    fail++; console.log('  ✗ ' + key + ' 编译失败: ' + e.message); continue;
  }
  check(key + ' 输出', nsl.logs, boot.logs);
  check(key + ' 状态', nsl.status, boot.status);
}

console.log('== 编译器编译自身（自举） ==');
try {
  const self = compileByNSL(compilerSrc);
  check('自编译无错误', self.prog.error, undefined);
  // 用自举得到的编译器再编译一个样例，并比较结果
  const idx2 = NSL.funcIndexOf(self.prog, 'compileProgram');
  const src = samples['函数与递归'];
  const ctx = {
    globals: {}, budget: 50000000, log: () => {}, now: () => 0, rngState: 1,
  };
  const r = NSL.callFunction(self.prog, 'compileProgram', [src], ctx);
  check('自举编译器可运行', r.status, 'done');
  if (r.status === 'done') {
    const obj = JSON.parse(r.value);
    check('自举编译器编译结果无错误', obj.error, undefined);
    if (!obj.error) {
      obj.funcNames = (obj.funcs || []).map((f) => f.name);
      const out2 = runProgram(obj, src);
      check('自举编译器产出行为一致', out2.logs, ['720', '144', 'hi ns']);
    }
  }
} catch (e) {
  fail++; console.log('  ✗ 自举失败: ' + e.message);
}

console.log('== 错误处理 ==');
try {
  compileByNSL('var x = ;');
  fail++; console.log('  ✗ 应当报告语法错误');
} catch (e) {
  check('语法错误被报告', /编译错误/.test(e.message), true);
}

console.log('== 结论 ==');
console.log('通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
