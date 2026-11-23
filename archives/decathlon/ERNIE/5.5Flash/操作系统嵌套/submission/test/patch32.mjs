import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `    const frozen = sys.state === 'paused' || sys.effectiveState === 'paused' || sys.effectiveState === 'blocked';`;
const b = `    const frozen = sys.state === 'paused' || sys.effectiveState === 'paused' || sys.effectiveState === 'blocked';
    if (this.playBtn) this.playBtn.disabled = frozen;
    if (this.pauseBtn) this.pauseBtn.disabled = frozen;
    if (this.seekEl) this.seekEl.disabled = frozen || this.sourceAppId === 'charts';`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/shell.js', s);