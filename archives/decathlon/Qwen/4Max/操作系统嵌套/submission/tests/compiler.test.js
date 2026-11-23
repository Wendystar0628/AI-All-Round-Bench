'use strict';
const fs = require('fs');
const path = require('path');
const { compile, VM } = require('../src/lang/lang.js');

const compilerSrc = fs.readFileSync(path.join(__dirname, '../src/programs/compiler.os'), 'utf8');
const compilerProg = compile(compilerSrc);

// 用引导编译器运行“编译器程序”，通过模拟系统调用喂入编译请求
function compileWithInner(source) {
  const vm = new VM(compilerProg, { rngSeed: 3 });
  let req = { from: 1, type: 'compile', payload: { reqId: 1, source } };
  let result = null;
  let guard = 0;
  while (guard++ < 200000) {
    const r = vm.run(500000);
    if (r.status === 'error') throw new Error('编译器程序错误: ' + r.error);
    if (r.status === 'done') throw new Error('编译器程序提前结束');
    if (r.status === 'syscall') {
      if (r.call === 'sys_recv') {
        if (!req) throw new Error('编译器再次等待但没有请求');
        vm.reply(req); req = null;
      } else if (r.call === 'sys_send') {
        result = r.args[2];
        vm.reply({ ok: true });
        if (!result.ok) throw new Error('编译失败: ' + result.error);
        return result.program;
      } else throw new Error('意外系统调用 ' + r.call);
    }
  }
  throw new Error('编译未收敛');
}

function norm(p) { return JSON.stringify(p); }
let pass = 0, fail = 0;
function check(name, src) {
  try {
    const a = compile(src);
    const b = compileWithInner(src);
    if (norm(a) !== norm(b)) {
      // 定位差异
      for (let i = 0; i < Math.max(a.funcs.length, b.funcs.length); i++) {
        const fa = a.funcs[i], fb = b.funcs[i];
        if (norm(fa) !== norm(fb)) {
          console.log('FAIL  ' + name + ' funcs[' + i + '] 差异');
          if (norm(fa.consts) !== norm(fb.consts)) console.log('  consts A:', norm(fa.consts).slice(0, 300), '\n  consts B:', norm(fb.consts).slice(0, 300));
          for (let j = 0; j < Math.max(fa.code.length, fb.code.length); j++) {
            if (norm(fa.code[j]) !== norm(fb.code[j])) { console.log('  code[' + j + '] A:', norm(fa.code[j]), ' B:', norm(fb.code[j])); break; }
          }
          break;
        }
      }
      fail++;
    } else { pass++; console.log('  ok  ' + name); }
  } catch (e) { fail++; console.log('FAIL  ' + name + ': ' + e.message); }
}

check('基础运算', 'var x = 1 + 2 * 3; var s = "a" + "b";');
check('函数与闭包', 'fn mk(a) { fn inner(b) { return a + b; } return inner; } var g = mk(1); var h = g(2);');
check('嵌套函数声明', 'fn outer() { fn a() { return 1; } fn b() { fn c() { return 2; } return c(); } return a() + b(); } var r = outer();');
check('循环与控制流', 'var s = 0; for (var i = 0; i < 10; i = i + 1) { if (i == 3) { continue; } if (i == 8) { break; } s = s + i; } while (s > 0) { s = s - 1; }');
check('对象数组与成员', 'var m = {a: 1, b: [1, 2]}; m.c = m.a + m.b[1]; m["d"] = 4; var k = keys(m);');
check('复合赋值', 'var m = {a: 1}; m.a += 2; var x = 1; x *= 3; var a = [1]; a[0] -= 1;');
check('逻辑与短路', 'var a = true && false; var b = false || true; var c = !a;');
check('三元表达式', 'var x = 5; var a = x > 3 ? "big" : "small"; var b = x > 10 ? 1 : x > 4 ? 2 : 3; var m = {k: x > 3 ? 10 : 20};');
check('字符串转义', 'var s = "a\\nb\\tc"; var q = \'x\';');
check('注释', '// line\nvar x = 1; /* block\nmulti */ var y = 2;');
check('累加程序', fs.readFileSync(path.join(__dirname, '../src/programs/samples/accumulate.os'), 'utf8'));
check('消息发送程序', fs.readFileSync(path.join(__dirname, '../src/programs/samples/sender.os'), 'utf8'));
check('消息接收程序', fs.readFileSync(path.join(__dirname, '../src/programs/samples/receiver.os'), 'utf8'));
check('持续计算程序', fs.readFileSync(path.join(__dirname, '../src/programs/samples/spin.os'), 'utf8'));
check('内核程序', fs.readFileSync(path.join(__dirname, '../src/programs/kernel.os'), 'utf8'));
check('编译器自身', compilerSrc);

// 用编译出的内核字节码再做一次 VM 冒烟运行（不接宿主，只验证可载入）
try {
  const kprog = compileWithInner(fs.readFileSync(path.join(__dirname, '../src/programs/kernel.os'), 'utf8'));
  const vm = new VM(kprog);
  const r = vm.run(1000);
  if (r.status !== 'syscall' || r.call !== 'sys_boot') throw new Error('内核第一条调用应为 sys_boot, 实际 ' + r.status + ' ' + r.call);
  pass++; console.log('  ok  内核字节码可载入并请求 sys_boot');
} catch (e) { fail++; console.log('FAIL  内核冒烟: ' + e.message); }

console.log('\n' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
