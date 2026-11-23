'use strict';
const s = require('fs').readFileSync(__dirname + '/../js/kernel-sources.js', 'utf8');
const lines = s.split('\n');
let bt = [];
lines.forEach((l, i) => { let c = 0; for (const ch of l) if (ch === '`') c++; if (c) bt.push([i + 1, c, l.trim().slice(0, 60)]); });
bt.forEach(x => console.log(x[0], x[1], x[2]));
console.log('--- backslashes ---');
lines.forEach((l, i) => { if (l.includes('\\')) console.log(i + 1, JSON.stringify(l.trim().slice(0, 80))); });