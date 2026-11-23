import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `    let depth = sourceWin.desktop.system.depth;
    let p = targetSys;
    let ok = false;
    while (p) { if (p === sourceWin.desktop.system) { ok = true; break; } p = p.parent; }
    if (!ok || targetSys.depth >= sourceWin.desktop.system.depth)`;
const b = `    let p = sourceWin.desktop.system;
    let ok = false;
    while (p) { if (p === targetSys) { ok = true; break; } p = p.parent; }
    if (!ok || targetSys.depth >= sourceWin.desktop.system.depth)`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/shell.js', s);