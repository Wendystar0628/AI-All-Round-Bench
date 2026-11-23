import fs from 'fs';
let k = fs.readFileSync('js/kernel.js', 'utf8');
k = k.replace(`    this.pendingServices = new Map();`, `    this.pendingServices = new Map();
    this.processLimit = opts.processLimit ?? 64;`);
k = k.replace(`        if (this.processes.length >= 64) {`, `        if (this.processes.length >= this.processLimit) {`);
k = k.replace(`      panelState: deepClone(this.panelState)`, `      panelState: deepClone(this.panelState), processLimit: this.processLimit`);
k = k.replace(`    sys.panelState = data.panelState || {};`, `    sys.panelState = data.panelState || {};
    sys.processLimit = data.processLimit || 64;`);
fs.writeFileSync('js/kernel.js', k);

let t = fs.readFileSync('js/apps/tasks.js', 'utf8');
const a = `    for (const c of sys.children) {
      const row = h('div', { style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10.5px', color: 'var(--muted)' } });`;
const b = `    const pl = h('input', { class: 'input', type: 'number', value: String(sys.processLimit || 64), style: { width: '100%' }, 'data-testid': 'tasks-process-limit', 'data-system-id': sys.id });
    pl.addEventListener('change', () => { sys.processLimit = Math.max(1, Number(pl.value) || 64); this.os.toast(sys, '进程额度已调整', String(sys.processLimit), 'ok'); });
    const plItem = h('div', { class: 'tfoot-item' });
    plItem.append(h('div', { class: 'tf-head' }, h('span', {}, '进程额度'), h('span', {}, String(sys.processes.length) + ' / ' + (sys.processLimit || 64))), pl);
    this.footEl.append(plItem);
    for (const c of sys.children) {
      const row = h('div', { style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10.5px', color: 'var(--muted)' } });`;
if (t.includes(a)) { t = t.replace(a, b); console.log('tasks ok'); } else console.log('tasks miss');
fs.writeFileSync('js/apps/tasks.js', t);
console.log('done');