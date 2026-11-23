import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `    for (const sys of this.systems.values()) this.applySettings(sys);
    this.rehydrateWorkbooks();`;
const b = `    let maxW = 0;
    for (const id of this.windows.keys()) { const m = /^w(\\d+)$/.exec(id); if (m) maxW = Math.max(maxW, parseInt(m[1], 10)); }
    this.nextWindowSeq = Math.max(this.nextWindowSeq, maxW + 1);
    for (const sys of this.systems.values()) this.applySettings(sys);
    this.rehydrateWorkbooks();`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/shell.js', s);