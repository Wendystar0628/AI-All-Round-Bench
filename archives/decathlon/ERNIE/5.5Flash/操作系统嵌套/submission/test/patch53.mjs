import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `    for (const sys of this.systems.values()) this.applySettings(sys);
    this.rehydrateWorkbooks();`;
const b = `    for (const sys of this.systems.values()) {
      this.applySettings(sys);
      if (sys.state === 'error') {
        const d = this.desktops.get(sys.id);
        if (d) d.showKernelError(sys.kernelError || sys.errorLog?.slice(-1)[0]?.msg || '内核程序异常');
      }
    }
    this.rehydrateWorkbooks();`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/shell.js', s);