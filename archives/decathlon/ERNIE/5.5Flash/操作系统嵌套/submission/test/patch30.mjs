import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `  updateClock() {
    if (!this.clockEl) return;
    const base = this.system.isRoot ? (this.system.epochBase || (this.system.epochBase = Date.now() - this.system.clock)) : (this.system.parent?.epochBase || Date.now());
    const d = new Date((this.system.isRoot ? base + this.system.clock : (this.system.parent?.epochBase || Date.now()) + this.system.clock));
    const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    const date = \`\${d.getFullYear()}/\${String(d.getMonth() + 1).padStart(2, '0')}/\${String(d.getDate()).padStart(2, '0')}\`;
    this.clockEl.innerHTML = \`<b>\${hh}:\${mm}</b><br><span>\${date}</span>\`;`;
const b = `  updateClock() {
    const timer = this.system.widgets?.timer;
    if (timer && timer.running && this.system.clock >= timer.endAt) {
      timer.running = false;
      timer.remaining = 0;
      this.os.notify(this.system, '倒计时结束', \`\${timer.duration} 秒计时完成\`, 'warn', true);
      if (this.widgetsOpen) this.renderWidgets();
    } else if (timer && timer.running && this.widgetsOpen) {
      const disp = this.widgetsEl.querySelector('.timer-display');
      if (disp) disp.textContent = fmtClock(Math.max(0, (timer.endAt - this.system.clock) / 1000));
    }
    if (!this.clockEl) return;
    const base = this.system.isRoot ? (this.system.epochBase || (this.system.epochBase = Date.now() - this.system.clock)) : (this.system.parent?.epochBase || Date.now());
    const d = new Date((this.system.isRoot ? base + this.system.clock : (this.system.parent?.epochBase || Date.now()) + this.system.clock));
    const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    const date = \`\${d.getFullYear()}/\${String(d.getMonth() + 1).padStart(2, '0')}/\${String(d.getDate()).padStart(2, '0')}\`;
    const text = \`<b>\${hh}:\${mm}</b><br><span>\${date}</span>\`;
    if (this._lastClockText !== text) { this._lastClockText = text; this.clockEl.innerHTML = text; }`;
if (s.includes(a)) { s = s.replace(a, b); console.log('clock replaced'); } else console.log('clock miss');
// remove old timer block at end of updateClock
s = s.replace(/    const timer = this\.system\.widgets\?\.timer;\n    if \(timer && timer\.running && this\.system\.clock >= timer\.endAt\) \{[\s\S]*?\n    \}\n  \}\n\n  updateSysChip/, '\n  }\n\n  updateSysChip');
fs.writeFileSync('js/shell.js', s);
console.log('done');