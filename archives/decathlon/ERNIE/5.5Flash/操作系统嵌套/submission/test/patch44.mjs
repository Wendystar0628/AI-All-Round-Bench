import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
s = s.replace(`  closeProjectionsOf(win) {
    const still = this.windows.get(win.id);
    if (still && still.appId !== 'projection' && still !== win) return;`, `  closeProjectionsOf(win, force = false) {
    const still = this.windows.get(win.id);
    if (!force && still && still.appId !== 'projection' && still !== win) return;`);
s = s.replace(`if (w.systemId === sys.id && (w.appId === 'player' || w.appId === 'charts')) this.closeProjectionsOf(w);`, `if (w.systemId === sys.id && (w.appId === 'player' || w.appId === 'charts')) this.closeProjectionsOf(w, true);`);
fs.writeFileSync('js/shell.js', s);
console.log('done');