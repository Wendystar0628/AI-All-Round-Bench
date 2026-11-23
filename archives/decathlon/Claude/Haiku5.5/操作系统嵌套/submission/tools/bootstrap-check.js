'use strict';
// 自举校验：用 JS 引导编译器生成 compiler.nobj；再让它编译 compiler.ns 等源文件，
// 结果必须与 JS 编译器的输出逐字一致。用法：node tools/bootstrap-check.js [--write]
const fs = require('fs');
const path = require('path');
const NOS = require('../src/runtime/nos-vm.js');
const { makeStdlib } = require('../src/runtime/nos-stdlib.js');
const { compile } = require('./nosc.js');

const root = path.join(__dirname, '..');
const compilerSrc = fs.readFileSync(path.join(root, 'assets/system/compiler.ns'), 'utf8');
const boot = compile(compilerSrc);
if (!boot.ok) { console.error('编译器源码有误：', boot.message); process.exit(1); }
const bootText = JSON.stringify(boot.image);
if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(root, 'assets/system/compiler.nobj'), bootText, 'utf8');
  console.log('已写入 assets/system/compiler.nobj');
}

// 用生成的编译器编译样例源码（两份 ns 源码 + 自身）
function selfCompile(src) {
  const image = JSON.parse(bootText);
  const m = new NOS.Machine(image, { natives: makeStdlib(), env: {} });
  m.args = [src];
  const meter = { left: 1e9 };
  let st = m.run(meter);
  if (st !== 'exit') return { error: m.error };
  return { image: m.result };
}

const samples = [compilerSrc];
for (const f of ['tests/samples/hello.ns', 'tests/samples/loops.ns']) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) samples.push(fs.readFileSync(p, 'utf8'));
}
let ok = true;
samples.forEach((src, i) => {
  const ref = JSON.stringify(compile(src).image);
  const got = selfCompile(src);
  if (got.error) { ok = false; console.log('sample', i, 'FAILED:', got.error); return; }
  const same = JSON.stringify(got.image) === ref;
  if (!same) ok = false;
  console.log('sample', i, same ? 'identical' : 'DIFFERENT', `(${ref.length} bytes)`);
});
console.log(ok ? 'SELF-HOSTING OK' : 'SELF-HOSTING MISMATCH');
process.exitCode = ok ? 0 : 1;
