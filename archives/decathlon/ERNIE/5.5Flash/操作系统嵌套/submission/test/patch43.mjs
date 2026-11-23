import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `  stopSystem(sys, closeWindow = false) {
    if (!sys) return;
    sys.state = 'stopped';`;
const b = `  stopSystem(sys, closeWindow = false) {
    if (!sys) return;
    sys.state = 'stopped';
    for (const w of [...this.windows.values()]) {
      if (w.systemId === sys.id && (w.appId === 'player' || w.appId === 'charts')) this.closeProjectionsOf(w);
    }`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/shell.js', s);