'use strict';
// 把 src/runtime 下的 CommonJS 模块打包成一个浏览器脚本 src/renderer/runtime.js。
// 渲染进程没有 require，这里提供一个极小的模块系统：window.RT.require(name)。
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'runtime');
const out = path.join(__dirname, '..', 'src', 'renderer', 'runtime.js');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();

function req(name) {
  const key = name.replace(/^\.\//, '').replace(/\.js$/, '');
  if (cache[key]) return cache[key].exports;
  if (!defs[key]) throw new Error('模块不存在: ' + name);
  const m = { exports: {} };
  cache[key] = m;
  defs[key](m, m.exports, req);
  return m.exports;
}

let s = '/* 生成文件：由 tools/bundle-runtime.js 从 src/runtime 打包，请勿手改 */\n';
s += '(function () {\nconst defs = {};\nconst cache = {};\n';
s += req.toString().replace(/^function req/, 'function req') + '\n';
for (const f of files) {
  const key = f.replace(/\.js$/, '');
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  s += `defs[${JSON.stringify(key)}] = function (module, exports, require) {\n${src}\n};\n`;
}
s += 'window.RT = { require: req };\n})();\n';
fs.writeFileSync(out, s, 'utf8');
console.log('wrote', path.relative(process.cwd(), out), files.length, 'modules');
