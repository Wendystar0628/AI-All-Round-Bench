import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `    const timer = sys.widgets?.timer || (sys.widgets = sys.widgets || { timer: { duration: 5, remaining: 5, running: false, endAt: 0 }, note: '', clip: sys.clipboard || [] });`;
const b = `    if (!sys.widgets) sys.widgets = { timer: { duration: 5, remaining: 5, running: false, endAt: 0 }, note: '', clip: sys.clipboard || [] };
    if (!sys.widgets.timer) sys.widgets.timer = { duration: 5, remaining: 5, running: false, endAt: 0 };
    const timer = sys.widgets.timer;`;
if (s.includes(a)) { s = s.replace(a, b); console.log('replaced'); } else console.log('miss');
fs.writeFileSync('js/shell.js', s);