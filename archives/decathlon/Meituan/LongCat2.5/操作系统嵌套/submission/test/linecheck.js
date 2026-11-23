'use strict';
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/kernel-sources.js', 'utf8');
const lines = src.split('\n');
for (const n of [927, 928, 929, 930, 931, 932, 933, 934, 935, 936, 937, 938]) {
  const l = lines[n - 1];
  console.log(n, JSON.stringify(l));
}
// 尝试从 926 行开始的小段解析
try { new Function(lines.slice(925, 938).join('\n')); console.log('segment ok'); }
catch (e) { console.log('segment FAIL:', e.message); }