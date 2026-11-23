// VM 自测（node tools/vmtest.js）
import { compileSource, VM } from '../app/js/lib/vm.js';

let pass = 0, fail = 0;
function t(name, src, check) {
  try {
    const prog = compileSource(src);
    const vm = new VM(prog, {});
    const out = [];
    let steps = 0;
    while (!vm.done && steps < 200000) {
      const r = vm.run(500, (n, a) => {
        if (n === 'print') { out.push(a[0]); return { value: null }; }
        if (n === 'time') return { value: 1000 };
        if (n === 'rnd') return { value: 0.5 };
        return { value: null };
      });
      steps++;
      if (r.status === 'error') throw new Error(r.error);
      if (r.status === 'blocked') { vm.blocked = null; }
    }
    check(vm, out);
    pass++;
  } catch (e) {
    fail++; console.log('FAIL: ' + name + ' -> ' + e.message);
  }
}
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' 期望 ' + JSON.stringify(b) + ' 得到 ' + JSON.stringify(a)); };

t('算术', 'let x = 2 + 3 * 4; print(x);', (vm, o) => eq(o[0], 14));
t('括号与除零保护', 'print(10 / 4);', (vm, o) => eq(o[0], 2.5));
t('字符串拼接', 'let s = "a" + "b" + 1; print(s);', (vm, o) => eq(o[0], 'ab1'));
t('循环累加', 'let s = 0; for i in 1..10 { s = s + i; } print(s);', (vm, o) => eq(o[0], 55));
t('数组与映射', 'let a = [1,2,3]; a[1] = 9; let m = {"k": 1}; m.k = m.k + a[1]; print(m.k);', (vm, o) => eq(o[0], 10));
t('函数与递归', 'fn fib(n) { if n < 2 { return n; } return fib(n-1) + fib(n-2); } print(fib(15));', (vm, o) => eq(o[0], 610));
t('while 与 break', 'let i = 0; while true { i = i + 1; if i > 5 { break; } } print(i);', (vm, o) => eq(o[0], 6));
t('continue', 'let s = 0; for i in 1..10 { if i % 2 == 0 { continue; } s = s + i; } print(s);', (vm, o) => eq(o[0], 25));
t('逻辑运算', 'let a = true and false; let b = false or true; let c = not a; print(a); print(b); print(c);', (vm, o) => { eq(o[0], false); eq(o[1], true); eq(o[2], true); });
t('数组遍历', 'let a = [3,1,2]; let s = 0; for v in a { s = s + v; } print(s); print(len(a));', (vm, o) => { eq(o[0], 6); eq(o[1], 3); });
t('内建函数', 'print(substr("hello", 1, 3)); print(upper("ab")); print(join(split("a,b", ","), "-"));', (vm, o) => { eq(o[0], 'ell'); eq(o[1], 'AB'); eq(o[2], 'a-b'); });
t('系统调用', 'print(time()); print(rnd());', (vm, o) => { eq(o[0], 1000); eq(o[1], 0.5); });
t('映射遍历键', 'let m = {"a":1,"b":2}; let ks = keys(m); print(len(ks));', (vm, o) => eq(o[0], 2));
t('嵌套数据结构', 'let d = {"list": [{"v": 1}, {"v": 2}]}; let s = 0; for it in d.list { s = s + it.v; } print(s);', (vm, o) => eq(o[0], 3));
t('比较运算', 'print(1 < 2); print("a" < "b"); print(2 >= 3);', (vm, o) => { eq(o[0], true); eq(o[1], true); eq(o[2], false); });
t('序列化状态', 'let s = 0; for i in 1..100 { s = s + i; } print(s);', (vm, o) => eq(o[0], 5050));
t('错误反馈', 'let a = 1; a = a + 1; print(a);', (vm, o) => eq(o[0], 2));
// 分片执行保持状态
{
  const prog = compileSource('let s = 0; for i in 1..1000 { s = s + i; } print(s);');
  const vm = new VM(prog, {});
  let guard = 0;
  while (!vm.done && guard++ < 100000) {
    const r = vm.run(3, (n, a) => { if (n === 'print') return { value: null }; return { value: null }; });
    if (r.status === 'error') throw new Error('分片执行出错: ' + r.error);
  }
  const st = JSON.parse(JSON.stringify(vm.saveState()));
  eq(vm.globals.s, 500500, '分片执行结果');
  if (!st.frames || st.frames.length !== 1) throw new Error('状态序列化异常');
}
t('阻塞与恢复', 'let t = time(); sleep(50); print(time());', (vm) => eq(vm.globals.t, 1000));
console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
