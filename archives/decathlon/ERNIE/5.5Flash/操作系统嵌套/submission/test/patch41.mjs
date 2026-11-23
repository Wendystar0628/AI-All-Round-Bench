import fs from 'fs';
let s = fs.readFileSync('js/apps/spreadsheet.js', 'utf8');
s = s.replace(`  dispose() { clearInterval(this.tickHandle); }`, `  dispose() {
    clearInterval(this.tickHandle);
    const others = [...this.os.windows.values()].some(w => w !== this.win && w.appId === 'spreadsheet' && w.app?.doc?.id === this.doc?.id);
    if (!others && this.doc) this.os.unregisterWorkbook(this.doc.id);
  }`);
fs.writeFileSync('js/apps/spreadsheet.js', s);
console.log('done');