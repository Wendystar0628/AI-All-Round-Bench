import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `  updateClock() {

  }`;
const b = `  updateClock() {
    const sys = this.system;
    const timer = sys.widgets?.timer;
    if (timer && timer.running && sys.clock >= timer.endAt) {
      timer.running = false;
      timer.remaining = 0;
      this.os.notify(sys, '倒计时结束', \`\${timer.duration} 秒计时完成\`, 'warn', true);
    }
    if (!this.clockEl) return;
    const base = sys.isRoot ? (sys.epochBase || (sys.epochBase = Date.now() - sys.clock)) : (sys.parent?.epochBase || Date.now());
    const d = new Date(base + sys.clock);
    const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    const date = \`\${d.getFullYear()}/\${String(d.getMonth() + 1).padStart(2, '0')}/\${String(d.getDate()).padStart(2, '0')}\`;
    const text = \`<b>\${hh}:\${mm}</b><br><span>\${date}</span>\`;
    if (this._lastClockText !== text) { this._lastClockText = text; this.clockEl.innerHTML = text; }
    if (this.widgetsOpen && this.widgetsEl) {
      const wc = this.widgetsEl.querySelector('.widget-clock');
      if (wc) wc.textContent = \`\${hh}:\${mm}\`;
      if (timer) {
        const td = this.widgetsEl.querySelector('.timer-display');
        if (td) td.textContent = fmtClock(timer.running ? Math.max(0, (timer.endAt - sys.clock) / 1000) : (timer.remaining || 0));
      }
      const sw = sys.widgets?.stopwatch;
      if (sw) {
        const sd = this.widgetsEl.querySelector('.sw-display');
        if (sd) sd.textContent = fmtClock(sw.running ? sw.elapsed + (sys.clock - sw.startAt) / 1000 : sw.elapsed);
      }
    }
  }`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/shell.js', s);