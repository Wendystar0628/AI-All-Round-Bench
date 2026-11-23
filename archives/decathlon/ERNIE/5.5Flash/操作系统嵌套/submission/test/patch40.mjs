import fs from 'fs';
let s = fs.readFileSync('js/kernel.js', 'utf8');
s = s.replace(`      apps: deepClone(this.apps), totalUsed: this.totalUsed, stepCount: this.stepCount,
      errorLog: this.errorLog.slice(-20), msgSeq: this.msgSeq`,
`      apps: deepClone(this.apps), totalUsed: this.totalUsed, stepCount: this.stepCount,
      errorLog: this.errorLog.slice(-20), msgSeq: this.msgSeq,
      wmConfig: deepClone(this.wmConfig), filesSort: this.filesSort, compilerConfig: deepClone(this.compilerConfig),
      panelState: deepClone(this.panelState)`);
s = s.replace(`    sys.msgSeq = data.msgSeq || 1;`,
`    sys.msgSeq = data.msgSeq || 1;
    sys.wmConfig = data.wmConfig || sys.wmConfig;
    sys.filesSort = data.filesSort ?? 0;
    sys.compilerConfig = data.compilerConfig || sys.compilerConfig;
    sys.panelState = data.panelState || {};`);
fs.writeFileSync('js/kernel.js', s);
console.log('done');