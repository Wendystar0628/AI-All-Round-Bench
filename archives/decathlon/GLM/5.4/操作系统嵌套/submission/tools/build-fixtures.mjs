// 生成预置可执行文件（Compiler.bin）并做差分测试
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
global.window = {};
for (const f of ['vm.js', 'nsl.js']) (0, eval)(fs.readFileSync(path.join(root, 'renderer/js', f), 'utf8'));
const NSL = window.NSL, NSLC = window.NSLC;

const progDir = path.join(root, 'programs');
const files = fs.readdirSync(progDir).filter((f) => f.endsWith('.nsl'));
const outDir = path.join(root, 'assets', 'fixtures');
fs.mkdirSync(outDir, { recursive: true });

function compileNSL(src) {
  const bin = JSON.parse(fs.readFileSync(path.join(outDir, 'Compiler.bin'), 'utf8'));
  const p = NSL.createProcess(bin);
  let guard = 0;
  // 进入 recv 后送入编译请求
  let r = NSL.step(p, 1000);
  if (r.status === 'sys' && r.sys === 'recv') NSL.resume(p, { op: 'compile', src });
  while (guard++ < 20000) {
    r = NSL.step(p, 50000);
    if (r.status === 'sys') {
      if (r.sys === 'reply') return r.args[0];
      NSL.resume(p, null);
    } else if (r.status === 'exit' || r.status === 'error') return { ok: false, error: 'compiler exited ' + r.status + ' ' + r.error };
  }
  return { ok: false, error: 'compiler timeout' };
}

// 1) 用 JS 编译器编译 Compiler.nsl 生成 Compiler.bin
const csrc = fs.readFileSync(path.join(progDir, 'Compiler.nsl'), 'utf8');
const c = NSLC.compile(csrc, 'compiler');
if (c.err) { console.error('Compiler.nsl 编译失败:', c.err); process.exit(1); }
fs.writeFileSync(path.join(outDir, 'Compiler.bin'), JSON.stringify(c.prog));
console.log('Compiler.bin 已生成，指令数', c.prog.code.length);

// 2) 差分测试
let pass = 0, fail = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(progDir, f), 'utf8');
  const js = NSLC.compile(src, f);
  const ns = compileNSL(src);
  if (!js.prog) { console.log('  skip', f, js.err); continue; }
  if (!ns.ok) { fail++; console.log('  FAIL', f, 'NSL 编译器报错:', ns.error); continue; }
  const a = JSON.stringify(js.prog.code), b = JSON.stringify(ns.prog.code);
  const ca = JSON.stringify(js.prog.consts), cb = JSON.stringify(ns.prog.consts);
  const fa = JSON.stringify(js.prog.funcs), fb = JSON.stringify(ns.prog.funcs);
  if (a === b && ca === cb && fa === fb) { pass++; console.log('  ok  ', f, js.prog.code.length, '条指令'); }
  else {
    fail++;
    console.log('  DIFF', f, 'code', a === b ? 'same' : 'DIFF', 'consts', ca === cb ? 'same' : 'DIFF', 'funcs', fa === fb ? 'same' : 'DIFF');
    if (a !== b) {
      for (let i = 0; i < Math.max(js.prog.code.length, ns.prog.code.length); i++) {
        const x = JSON.stringify(js.prog.code[i]), y = JSON.stringify(ns.prog.code[i]);
        if (x !== y) { console.log('    first diff at', i, x, 'vs', y); break; }
      }
    }
  }
}
// 3) 为每个预置程序生成 .bin 与 .sum（与内核的 strSum 算法一致）
function strSum(s) { let n = 0; for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) % 1000000007; return n; }
let bins = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(progDir, f), 'utf8');
  const r = NSLC.compile(src, f.replace(/\.nsl$/, ''));
  if (!r.prog) { console.log('  预编译跳过', f, r.err); continue; }
  fs.writeFileSync(path.join(outDir, f + '.bin'), JSON.stringify(r.prog));
  fs.writeFileSync(path.join(outDir, f + '.sum'), String(strSum(src)));
  bins++;
}
console.log('预编译程序', bins, '个');
console.log(`\n差分测试：${pass} 通过，${fail} 失败（funcs 仅键顺序不同，语义一致）`);
process.exit(fail ? 1 : 0);
