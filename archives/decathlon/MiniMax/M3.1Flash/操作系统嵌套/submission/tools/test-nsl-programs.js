/* 校验系统内 NSL 程序（内核、编译器、应用）能否被 NSL 编译器编译 */
require('../src/core/nsl-core.js');
const fs = require('fs');
const path = require('path');
const NSL = globalThis.NSL;

const root = path.join(__dirname, '..', 'src', 'nsl');
const compilerSrc = fs.readFileSync(path.join(root, 'compiler.nsl'), 'utf8');
const compilerProg = NSL.compileSource(compilerSrc);

function compileByNSL(src) {
  const ctx = { globals: {}, budget: 80000000, log: () => {}, now: () => 0, rngState: 3 };
  const r = NSL.callFunction(compilerProg, 'compileProgram', [src], ctx);
  if (r.status === 'error') throw new Error('编译器运行错误: ' + r.error);
  if (r.status !== 'done') throw new Error('编译器未完成: ' + r.status);
  const obj = JSON.parse(r.value);
  if (obj.error) throw new Error('编译错误: ' + obj.error);
  obj.funcNames = (obj.funcs || []).map((f) => f.name);
  return obj;
}

let fail = 0;
const files = fs.existsSync(path.join(root, 'apps'))
  ? fs.readdirSync(path.join(root, 'apps')).filter((f) => f.endsWith('.nsl'))
  : [];
const targets = ['compiler.nsl', 'kernel.nsl'].concat(files.map((f) => 'apps/' + f));
for (const t of targets) {
  const p = path.join(root, t);
  if (!fs.existsSync(p)) { console.log('  - 跳过 ' + t); continue; }
  const src = fs.readFileSync(p, 'utf8');
  try {
    const prog = compileByNSL(src);
    const r = NSL.execute(prog, { globals: {}, budget: 2000000, log: () => {}, now: () => 0, rngState: 1 });
    console.log('  ✓ ' + t + ' 编译通过（函数 ' + prog.funcNames.length + ' 个，运行状态 ' + r.status + (r.error ? '，错误 ' + r.error : '') + '）');
    if (r.status === 'error') fail++;
  } catch (e) {
    console.log('  ✗ ' + t + '：' + e.message);
    fail++;
  }
}
process.exit(fail ? 1 : 0);
