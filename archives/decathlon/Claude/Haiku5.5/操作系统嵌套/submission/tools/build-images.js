'use strict';
// 预编译随项目交付的程序（系统程序、示例程序、飞控），生成 src/renderer/images.js。
// 预编译结果与系统内编译器的输出逐字一致（先由本脚本校验）；启动时放入编译缓存，
// 因此启动与创建子系统不再为这些程序付出编译费用。用户修改后的程序仍由系统内的编译器编译并计费。
// 用法：node tools/build-images.js [--verify]
const fs = require('fs');
const path = require('path');
const { compile, expandIncludes } = require('./nosc.js');
const NOS = require('../src/runtime/nos-vm.js');
const { makeStdlib } = require('../src/runtime/nos-stdlib.js');
const { fnv } = require('../src/runtime/universe.js');

const root = path.join(__dirname, '..');
const dirs = [['assets/system', '/System'], ['assets/flight', '/Flight'], ['assets/programs', '/Programs']];
const compilerText = fs.readFileSync(path.join(root, 'assets/system/compiler.nobj'), 'utf8');
const compilerKey = fnv(compilerText);
const verify = process.argv.includes('--verify');

function nosCompile(src, image) {
  const m = new NOS.Machine(image, { natives: makeStdlib(), env: {} });
  m.args = [src];
  const meter = { left: 2e8 };
  if (m.run(meter) !== 'exit') throw new Error('系统编译器失败：' + (m.error && m.error.message));
  return m.result;
}

const images = {};
const compilerImage = JSON.parse(compilerText);
let count = 0;
for (const [dir, prefix] of dirs) {
  const walk = (d, p) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      const vp = p + '/' + ent.name;
      if (ent.isDirectory()) walk(full, vp);
      else if (ent.name.endsWith('.ns') && !vp.startsWith('/System/lib/')) {
        const raw = fs.readFileSync(full, 'utf8');
        const src = expandIncludes(raw);
        const r = compile(src);
        if (!r.ok) throw new Error(vp + ': ' + r.message);
        const key = compilerKey + ':' + fnv(src) + ':' + src.length;
        images[key] = r.image;
        count++;
        if (verify) {
          const got = nosCompile(src, compilerImage);
          const same = JSON.stringify(got) === JSON.stringify(r.image);
          console.log((same ? 'identical ' : 'DIFFERENT ') + vp);
          if (!same) process.exitCode = 1;
        }
      }
    }
  };
  walk(path.join(root, dir), prefix);
}
const out = `/* 生成文件：由 tools/build-images.js 生成（预编译的系统程序），请勿手改 */\nwindow.PRECOMPILED = ${JSON.stringify(images)};\n`;
fs.writeFileSync(path.join(root, 'src/renderer/images.js'), out, 'utf8');
console.log('precompiled', count, 'programs,', (out.length / 1024).toFixed(0), 'KB');
