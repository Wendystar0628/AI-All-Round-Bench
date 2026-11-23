// 开发期自测：在 Node 中运行 NSL 虚拟机与编译器
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
global.window = {};
for (const f of ['vm.js', 'nsl.js']) {
  const code = fs.readFileSync(path.join(root, 'renderer/js', f), 'utf8');
  (0, eval)(code);
}
const NSL = window.NSL, NSLC = window.NSLC;

function run(src, { budget = 2e6, onSys = null } = {}) {
  const c = NSLC.compile(src, 'test');
  if (c.err) throw new Error('compile: ' + c.err);
  const p = NSL.createProcess(c.prog);
  let guard = 0;
  while (p.state !== 'exit' && p.state !== 'error' && guard++ < 1000) {
    const r = NSL.step(p, budget);
    if (r.status === 'sys') {
      if (!onSys) throw new Error('unexpected syscall ' + r.sys);
      const v = onSys(r.sys, r.args, p);
      NSL.resume(p, v === undefined ? null : v);
    }
  }
  return p;
}

let pass = 0, fail = 0;
function t(name, src, expect, opts) {
  try {
    const p = run(src, opts);
    const got = p.state === 'error' ? 'ERR:' + p.error : p.exitValue;
    if (JSON.stringify(got) === JSON.stringify(expect)) { pass++; console.log('  ok  ' + name); }
    else { fail++; console.log('  FAIL ' + name + '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(expect)); }
  } catch (e) { fail++; console.log('  FAIL ' + name + '  ' + e.message); }
}

console.log('NSL VM 自测');
t('累加', 'var s = 0\nvar i = 1\nwhile (i <= 10) { s += i\n i++ }\nreturn s', 55);
t('函数', 'func add(a, b) { return a + b }\nreturn add(3, 4) * 2', 14);
t('递归', 'func fib(n) { if (n < 2) { return n }\n return fib(n-1) + fib(n-2) }\nreturn fib(12)', 144);
t('数组', 'var a = [3,1,2]\na.push(9)\na.sort()\nreturn a.join(",")', '1,2,3,9');
t('映射', 'var m = {a: 1, b: 2}\nm.c = m.a + m.b\nreturn m.keys().join("")', 'abc');
t('字符串', 'var s = "Hello World"\nreturn s.substr(0,5) + "|" + s.toLowerCase() + "|" + s.length', 'Hello|hello world|11');
t('try/catch', 'var x = 0\ntry { x = 1\n throw "boom"\n x = 2 } catch (e) { x = e }\nreturn x', 'boom');
t('三元/逻辑', 'var a = 5\nvar b = a > 3 && a < 10\nvar c = a > 3 || a < 1\nreturn b + "," + c', 'true,true');
t('for 循环', 'var s = ""\nfor (var i = 0; i < 3; i++) { s += i }\nreturn s', '012');
t('continue/break', 'var s = 0\nfor (var i = 0; i < 10; i++) { if (i == 2) { continue }\n if (i == 5) { break }\n s += i }\nreturn s', 8);
t('下标赋值', 'var a = [0,0,0]\na[1] = 7\nreturn a[1]', 7);
t('嵌套属性', 'var m = {a: {b: {c: 1}}}\nm.a.b.c = 42\nreturn m.a.b.c', 42);
t('复合赋值', 'var a = [1,2,3]\na[1] += 10\nreturn a[1]', 12);
t('负数与取模', 'return (-7) % 3 + "," + (7 / 2)', '-1,3.5');
t('字符串方法', 'return "a,b,c".split(",").length + "," + "xyz".indexOf("y")', '3,1');

// 系统调用中断/恢复
t('系统调用往返', 'var a = sys.echo(5)\nvar b = sys.echo(6)\nreturn a + b', 13, {
  onSys: (name, args) => args[0] + 1
});
t('系统调用挂起后继续', 'var x = sys.wait()\nreturn x * 2', 20, {
  onSys: (name, args) => 10
});

// 内存配额
try {
  const p = run('var a = []\nwhile (true) { a.push([1,2,3,4,5,6,7,8]) }', { budget: 500000 });
  if (p.state === 'error' && String(p.error).indexOf('内存') >= 0) { pass++; console.log('  ok  内存配额'); }
  else { fail++; console.log('  FAIL 内存配额 ' + p.state + ' ' + p.error); }
} catch (e) { fail++; console.log('  FAIL 内存配额 ' + e.message); }

// 序列化往返
try {
  const c = NSLC.compile('var s = 0\nfor (var i = 0; i < 1000; i++) { s += i }\nreturn s', 'ser');
  const p = NSL.createProcess(c.prog);
  NSL.step(p, 500);
  const snap = JSON.parse(JSON.stringify(NSL.serialize(p)));
  const q = NSL.deserialize(snap);
  let g = 0;
  while (q.state !== 'exit' && g++ < 100) NSL.step(q, 10000);
  if (q.exitValue === 499500) { pass++; console.log('  ok  快照续行 ' + q.exitValue); }
  else { fail++; console.log('  FAIL 快照续行 ' + q.exitValue); }
} catch (e) { fail++; console.log('  FAIL 快照续行 ' + e.message); }

console.log(`\n${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
