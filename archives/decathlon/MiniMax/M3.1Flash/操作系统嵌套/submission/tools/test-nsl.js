/* NSL 核心自检脚本：node tools/test-nsl.js */
require('../src/core/nsl-core.js');
const NSL = globalThis.NSL;

let pass = 0, fail = 0;
function run(src, opts) {
  opts = opts || {};
  const prog = NSL.compileSource(src);
  const logs = [];
  const ctx = {
    globals: {},
    budget: opts.budget === undefined ? 100000 : opts.budget,
    log: (t) => logs.push(t),
    now: () => 1000,
    rngState: 12345,
  };
  const r = NSL.execute(prog, ctx);
  return { r, logs, prog, ctx };
}
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '  期望 ' + e + '  实际 ' + a); }
}

console.log('== 基础语法与运算 ==');
{
  const { logs } = run(`
    var a = 2;
    var b = 3;
    print(a + b);
    print(a * b - 1);
    print((a + b) * 2);
    print("x" + a);
    print(7 % 3);
    print(7 / 2);
  `);
  check('算术', logs, ['5', '5', '10', 'x2', '1', '3.5']);
}
{
  const { logs } = run(`
    var i = 0;
    while (i < 3) { print(i); i = i + 1; }
    for (var j = 0; j < 3; j = j + 1) { print(j); }
    var k = 0;
    for (var j2 = 0; j2 < 5; j2 = j2 + 1) { if (j2 == 2) { continue; } if (j2 == 4) { break; } k = k + j2; }
    print(k);
  `);
  check('循环', logs, ['0', '1', '2', '0', '1', '2', '4']);
}
{
  const { logs } = run(`
    function fact(n) { if (n <= 1) { return 1; } return n * fact(n - 1); }
    print(fact(6));
    function fib(n) { if (n < 2) { return n; } return fib(n-1) + fib(n-2); }
    print(fib(12));
  `);
  check('递归函数', logs, ['720', '144']);
}
{
  const { logs } = run(`
    var arr = [10, 20, 30];
    arr[1] = 99;
    print(arr[1]);
    print(arr.len(arr));
    arr.push(arr, 40);
    print(arr.join(arr, "-"));
    var t = [1,2,3];
    t[0] += 5;
    print(t[0]);
  `);
  check('数组', logs, ['99', '3', '10-99-30-40', '6']);
}
{
  const { logs } = run(`
    print(1 == 1);
    print(1 != 1);
    print(2 > 3);
    print("a" < "b");
    print(true && false);
    print(true || false);
    if (0) { print("no"); } else { print("else"); }
  `);
  check('比较与逻辑', logs, ['true', 'false', 'false', 'true', 'false', 'true', 'else']);
}
{
  const { r } = run(`var a = 1; var b = 0; print(a / b);`);
  check('除零为运行时错误', r.status, 'error');
  check('除零错误信息', r.error, '除数为零');
}
{
  const { r, logs } = run(`var s = 0; var i = 0; while (true) { i = i + 1; s = s + i; }`, { budget: 5000 });
  check('预算耗尽返回 budget', r.status, 'budget');
  check('预算内已执行', r.consumed, 5000);
}
{
  // 续行：预算耗尽后继续
  const src = `var s = 0; var i = 0; while (true) { i = i + 1; s = s + i; }`;
  const prog = NSL.compileSource(src);
  const ctx = { globals: {}, budget: 300, log: () => {}, now: () => 0, rngState: 1 };
  const r1 = NSL.execute(prog, ctx);
  const r2 = NSL.resume(prog, { globals: r1.globals, frames: r1.frames, stack: r1.stack }, ctx, 300);
  check('续行状态', r2.status, 'budget');
  check('续行后仍在推进', r2.consumed, 300);
}
{
  const { logs } = run(`
    var m = map.new();
    map.set(m, "a", 1);
    map.set(m, "b", 2);
    print(map.get(m, "b"));
    print(map.len(m));
    print(json.str([1, "two", true]));
    var p = json.parse("[1,2,3]");
    print(arr.len(p));
    print(str.len("abc"));
    print(math.sqrt(16));
    print(math.max(3, 9));
  `);
  check('内置库', logs, ['2', '2', '[1,"two",true]', '3', '3', '4', '9']);
}

console.log('== 结论 ==');
console.log('通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
