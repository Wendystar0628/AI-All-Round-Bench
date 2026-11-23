import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
s = s.replace(`  onKernelError(sys, msg) {
    sys.state = 'error';`, `  onKernelError(sys, msg) {
    sys.state = 'error';
    sys.kernelError = msg;`);
s = s.replace(`    sys.errorLog = [];
    sys.apps = sys.apps || {};`, `    sys.errorLog = [];
    sys.kernelError = null;
    sys.apps = sys.apps || {};`);
fs.writeFileSync('js/shell.js', s);
let k = fs.readFileSync('js/kernel.js', 'utf8');
k = k.replace(`    this.state = 'error';
    this.kernelErrors++;`, `    this.state = 'error';
    this.kernelError = proc.error || '内核程序异常';
    this.kernelErrors++;`);
fs.writeFileSync('js/kernel.js', k);
console.log('done');