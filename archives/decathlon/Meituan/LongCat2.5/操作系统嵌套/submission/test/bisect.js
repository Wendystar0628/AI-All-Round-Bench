'use strict';
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/kernel-sources.js', 'utf8');
const lines = src.split('\n');
for (let n = 260; n <= lines.length; n += 40) {
  const part = lines.slice(0, n).join('\n');
  try { new Function(part); console.log('ok upto', n); }
  catch (e) { console.log('FAIL at chunk ending', n, ':', e.message); break; }
}
// 精确二分
let lo = 1, hi = lines.length;
function bad(n) {
  try { new Function(lines.slice(0, n).join('\n')); return false; } catch (e) { return true; }
}
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  if (bad(mid)) hi = mid; else lo = mid + 1;
}
console.log('first failing prefix line =', lo);
console.log(JSON.stringify(lines.slice(Math.max(0, lo - 4), lo + 1)));