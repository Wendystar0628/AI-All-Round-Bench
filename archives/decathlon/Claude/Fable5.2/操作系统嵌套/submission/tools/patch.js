'use strict';
// 开发辅助：node tools/patch.js <file> <patchfile.json>  —— 按 [[old,new],...] 逐条精确替换
const fs = require('fs');
const [, , file, pf] = process.argv;
let s = fs.readFileSync(file, 'utf8');
const list = JSON.parse(fs.readFileSync(pf, 'utf8'));
for (const [a, b, all] of list) {
  if (!s.includes(a)) { console.error('MISSING: ' + a.slice(0, 80)); process.exit(1); }
  s = all ? s.split(a).join(b) : s.replace(a, () => b);
}
fs.writeFileSync(file, s);
console.log('patched', file, list.length);
