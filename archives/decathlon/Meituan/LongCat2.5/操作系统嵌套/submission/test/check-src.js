'use strict';
const s = require('fs').readFileSync(__dirname + '/../js/kernel-sources.js', 'utf8');
let i = 0, n = 0;
const needle = String.fromCharCode(36) + '{';
while ((i = s.indexOf(needle, i)) >= 0) { n++; console.log(JSON.stringify(s.substr(Math.max(0, i - 90), 160))); i += 2; }
console.log('dollar-brace count', n, 'backticks', (s.match(/`/g) || []).length);