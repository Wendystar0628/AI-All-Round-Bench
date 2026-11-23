'use strict';
const { compile, VM } = require('../src/lang/lang.js');
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('FAIL  ' + name + ': ' + e.message); }
}
function eq(a, b, msg) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg || '') + ' 期望 ' + sb + ' 实际 ' + sa);
}
function run(src, budget, handler) {
  const prog = compile(src);
  const vm = new VM(prog, { rngSeed: 7 });
  let out = [];
  let guard = 0;
  while (guard++ < 10000) {
    const r = vm.run(budget || 1000000);
    if (r.status === 'done') return { out, vm, work: r.work };
    if (r.status === 'error') throw new Error(r.error);
    if (r.status === 'syscall') {
      const reply = handler ? handler(r.call, r.args, vm) : null;
      vm.reply(reply);
    }
    if (r.status === 'budget') continue;
  }
  throw new Error('运行未结束');
}

t('四则运算与优先级', () => {
  const r = run('var x = 2 + 3 * 4; var y = (2 + 3) * 4; var z = 10 % 3; var w = 7 / 2;');
  eq(r.vm.envs[0].vars.x, 14); eq(r.vm.envs[0].vars.y, 20); eq(r.vm.envs[0].vars.z, 1); eq(r.vm.envs[0].vars.w, 3.5);
});
t('字符串与内置函数', () => {
  const r = run('var s = "hello world"; var a = sub(s, 6, 5); var i = find(s, "world"); var b = upper(a); var c = split(s, " "); var d = join(c, "-"); var n = num("3.5") + 1;');
  const v = r.vm.envs[0].vars;
  eq(v.a, 'world'); eq(v.i, 6); eq(v.b, 'WORLD'); eq(v.d, 'hello-world'); eq(v.n, 4.5);
});
t('条件与循环', () => {
  const r = run('var s = 0; for (var i = 0; i < 10; i = i + 1) { if (i % 2 == 0) { s = s + i; } else { continue; } } var j = 0; while (j < 5) { j = j + 1; if (j == 3) { break; } }');
  eq(r.vm.envs[0].vars.s, 20); eq(r.vm.envs[0].vars.j, 3);
});
t('函数、递归与闭包', () => {
  const r = run('fn fib(n) { if (n < 2) { return n; } return fib(n - 1) + fib(n - 2); } var f = fib(12); fn mk(a) { fn inner(b) { return a + b; } return inner; } var g = mk(10); var h = g(5);');
  eq(r.vm.envs[0].vars.f, 144); eq(r.vm.envs[0].vars.h, 15);
});
t('数组与对象', () => {
  const r = run('var a = [1, 2, 3]; push(a, 4); var m = {x: 1, y: [2, 3]}; m.z = m.x + a[3]; m["w"] = 9; var k = keys(m); var L = len(a); var t = has(m, "z");');
  const v = r.vm.envs[0].vars;
  eq(v.a, [1, 2, 3, 4]); eq(v.m.z, 5); eq(v.m.w, 9); eq(v.L, 4); eq(v.t, true); eq(v.k.length, 4);
});
t('复合赋值与成员赋值', () => {
  const r = run('var m = {a: 1}; m.a += 5; var x = 2; x *= 3; var arr = [1]; arr[0] += 9;');
  const v = r.vm.envs[0].vars;
  eq(v.m.a, 6); eq(v.x, 6); eq(v.arr[0], 10);
});
t('逻辑短路', () => {
  const r = run('var c = 0; fn side() { c = c + 1; return true; } var a = false && side(); var b = true || side(); var d = true && side();');
  eq(r.vm.envs[0].vars.c, 1); eq(r.vm.envs[0].vars.a, false); eq(r.vm.envs[0].vars.b, true); eq(r.vm.envs[0].vars.d, true);
});
t('系统调用挂起与回复', () => {
  const calls = [];
  const r = run('var t = sys_time(); sys_wait(100); var m = sys_recv(); var s = m.payload; sys_send(5, "hi", {v: 42});', 100, (call, args) => {
    calls.push(call);
    if (call === 'sys_time') return 12.5;
    if (call === 'sys_wait') return null;
    if (call === 'sys_recv') return { from: 2, type: 'x', payload: '你好' };
    if (call === 'sys_send') return true;
    return null;
  });
  eq(calls, ['sys_time', 'sys_wait', 'sys_recv', 'sys_send']);
  eq(r.vm.envs[0].vars.t, 12.5); eq(r.vm.envs[0].vars.s, '你好');
});
t('执行中序列化与恢复', () => {
  const prog = compile('var s = 0; for (var i = 0; i < 200; i = i + 1) { s = s + i * i; } var done = 1;');
  const vm = new VM(prog);
  let r = vm.run(150); // 中途
  if (r.status !== 'budget') throw new Error('应当预算耗尽');
  const snap = JSON.parse(JSON.stringify(vm.toJSON()));
  const vm2 = VM.fromJSON(prog, snap);
  let guard = 0;
  while (guard++ < 1000) { r = vm2.run(100); if (r.status === 'done') break; if (r.status === 'error') throw new Error(r.error); }
  const vmRef = new VM(prog); vmRef.run(1000000);
  eq(vm2.envs[0].vars.s, vmRef.envs[0].vars.s);
  eq(vm2.envs[0].vars.done, 1);
});
t('挂起系统调用时序列化恢复', () => {
  const prog = compile('var a = sys_recv(); var b = a.payload + 1;');
  const vm = new VM(prog);
  let r = vm.run(1000);
  eq(r.status, 'syscall'); eq(r.call, 'sys_recv');
  const snap = JSON.parse(JSON.stringify(vm.toJSON()));
  const vm2 = VM.fromJSON(prog, snap);
  vm2.reply({ payload: 41 });
  r = vm2.run(1000);
  eq(r.status, 'done');
  eq(vm2.envs[0].vars.b, 42);
});
t('预算计量与低预算公平推进', () => {
  const prog = compile('var s = 0; while (s < 10000) { s = s + 1; }');
  const vm = new VM(prog);
  let total = 0, steps = 0;
  while (steps++ < 100000) { const r = vm.run(37); total += r.work; if (r.status === 'done') break; }
  if (vm.envs[0].vars.s !== 10000) throw new Error('未完成');
  if (total < 10000) throw new Error('计量过小');
});
t('错误: 除零/未定义/循环外break', () => {
  let caught = 0;
  try { run('var x = 1 / 0;'); } catch (e) { caught++; if (!/除以零/.test(e.message)) throw e; }
  try { run('var x = nope;'); } catch (e) { caught++; if (!/未定义/.test(e.message)) throw e; }
  try { compile('break;'); } catch (e) { caught++; }
  eq(caught, 3);
});
t('JSON 与深复制', () => {
  const r = run('var o = json_parse("{\\"a\\": [1, 2, {\\"b\\": 3}]}"); var c = copy(o); c.a[2].b = 9; var s = json_str(o);');
  const v = r.vm.envs[0].vars;
  eq(v.o.a[2].b, 3); eq(v.c.a[2].b, 9);
  eq(JSON.parse(v.s).a[2].b, 3);
});
t('随机数可重复', () => {
  const r1 = run('srand(42); var a = rand(); var b = rand();');
  const r2 = run('srand(42); var a = rand(); var b = rand();');
  eq(r1.vm.envs[0].vars.a, r2.vm.envs[0].vars.a);
  eq(r1.vm.envs[0].vars.b, r2.vm.envs[0].vars.b);
});
t('大数组与排序', () => {
  const r = run('var a = []; for (var i = 0; i < 50; i = i + 1) { push(a, 50 - i); } sort(a); var ok = a[0] == 1 && a[49] == 50;');
  eq(r.vm.envs[0].vars.ok, true);
});
console.log('\n' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
