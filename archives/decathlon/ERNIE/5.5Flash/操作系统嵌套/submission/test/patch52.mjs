import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `    this.bootSystem(sys);
    for (const child of [...sys.children]) {`;
const b = `    this.bootSystem(sys);
    if (sys.state === 'error') {
      this.notify(sys, '重启失败', sys.kernelError || '内核程序错误', 'err', true);
      this.renderAll();
      return;
    }
    for (const child of [...sys.children]) {`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/shell.js', s);