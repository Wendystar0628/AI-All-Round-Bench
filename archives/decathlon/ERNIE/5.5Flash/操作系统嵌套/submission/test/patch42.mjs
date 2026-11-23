import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `    const sys = src.desktop.system;
    const frozen = sys.state === 'paused' || sys.effectiveState === 'paused' || sys.effectiveState === 'blocked';`;
const b = `    const sys = src.desktop.system;
    if (sys.state === 'stopped' || sys.state === 'error') {
      if (this.srcEl) this.srcEl.textContent = '源系统已停止 · 投送结束';
      if (this.frozenEl) { this.frozenEl.style.display = 'flex'; this.frozenEl.textContent = '源系统已停止'; }
      return;
    }
    const frozen = sys.state === 'paused' || sys.effectiveState === 'paused' || sys.effectiveState === 'blocked';`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/shell.js', s);