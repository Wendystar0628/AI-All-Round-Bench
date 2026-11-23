// 自举验证：用 JS 编译器编译 compiler.ns → A；用 A 在 VM 里编译 compiler.ns → B；比较 A 与 B（不动点）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../src/host/compiler.js';
import { VM, NATIVES, tostr } from '../src/host/vm.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NS = path.join(ROOT, 'ns');
const natives = new Set(Object.keys(NATIVES));
const files = new Map(); // 虚拟文件系统：路径 -> 文本
function readFS(p) { if (files.has(p)) return files.get(p); const fp = path.join(NS, p); return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null; }
const sigOf = (t) => String(t.length);
const read = (p) => { const t = readFS(p); return t == null ? null : { text: t, sig: sigOf(t) }; };

export function jsCompile(p) { return compile(readFS(p), { name: p, sig: sigOf(readFS(p)), read, prelude: '/System/lib/sys.ns', natives }); }

export function runCompiler(compilerProg, srcPath, outPath, prelude) {
  const vm = new VM();
  const ctx = vm.spawn(compilerProg, { priv: false, args: { src: srcPath, out: outPath, prelude } });
  let total = 0; let exitVal;
  for (let i = 0; i < 1e6; i++) {
    const r = vm.run(ctx, 200000); total += r.used;
    if (r.status === 'trap') {
      const t = ctx.trap; const a = t.args;
      if (t.name === 'print') { console.log('  [compiler]', tostr(a[0])); vm.ret(ctx, null); }
      else if (t.name === 'fs_stat') { const x = readFS(a[0]); vm.ret(ctx, x == null ? { err: 'nf' } : { sig: sigOf(x), size: x.length }); }
      else if (t.name === 'fs_read') { const x = readFS(a[0]); vm.ret(ctx, x == null ? { err: 'nf' } : x); }
      else if (t.name === 'fs_write') { files.set(a[0], a[1]); vm.ret(ctx, { ok: true }); }
      else if (t.name === 'exit') { exitVal = a[0]; break; }
      else { console.log('未处理系统调用', t.name); vm.ret(ctx, null); }
    } else if (r.status === 'done') break;
    else if (r.status === 'error') { console.log('编译器运行错误：', ctx.err); break; }
  }
  return { total, exitVal };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const A = jsCompile('/System/compiler.ns');
  console.log('JS 编译 compiler.ns：', A.f.length, '函数');
  const r1 = runCompiler(A, '/System/compiler.ns', '/tmp/B.nsx');
  console.log('A 编译自身：消耗', r1.total, '单位', JSON.stringify(r1.exitVal));
  const B = files.get('/tmp/B.nsx');
  const same = B === JSON.stringify(A);
  console.log('第一轮 A==B：', same);
  if (!same) {
    const a = JSON.stringify(A);
    let i = 0; while (i < a.length && a[i] === B[i]) i++;
    console.log('首个差异位置', i, '\nA:', a.slice(i - 80, i + 80), '\nB:', B.slice(i - 80, i + 80));
  } else {
    const r2 = runCompiler(JSON.parse(B), '/System/compiler.ns', '/tmp/C.nsx');
    console.log('B 编译自身：', files.get('/tmp/C.nsx') === B ? '不动点成立 ✔' : '不一致 ✘');
    // 再编译一个普通程序对比
    const T = fs.readFileSync(path.join(ROOT, 'tools/t1.ns'), 'utf8'); files.set('/tmp/t1.ns', T);
    const ja = JSON.stringify(compile(T, { name: '/tmp/t1.ns', sig: sigOf(T), read, prelude: '/System/lib/sys.ns', natives }));
    runCompiler(JSON.parse(B), '/tmp/t1.ns', '/tmp/t1.nsx');
    console.log('t1.ns 在系统内编译与 JS 编译一致：', files.get('/tmp/t1.nsx') === ja);
  }
}
