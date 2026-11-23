import fs from 'fs';
let s = fs.readFileSync('js/apps/tasks.js', 'utf8');
const a = `  actionsFor(r) {
    const wrap = h('div', { style: { display: 'flex' } });`;
const b = `  actionsFor(r) {
    const wrap = h('div', { style: { display: 'flex' } });
    if (r.web) return wrap;`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/apps/tasks.js', s);