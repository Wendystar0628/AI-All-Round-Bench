import fs from 'fs';
function patch(path, pairs) {
  let s = fs.readFileSync(path, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.log('MISS', path, a.slice(0, 60)); continue; }
    s = s.replace(a, b);
  }
  fs.writeFileSync(path, s);
}

patch('js/kernel.js', [
  [`    const dt = this.stepMs * (this.speed || 1);`, `    const dt = this.forceStep ? this.stepMs : this.stepMs * (this.speed || 1);`]
]);

patch('js/shell.js', [
  [`    const old = this.systems.get(snap.rootId);
    if (old) {`, `    const old = this.systems.get(snap.rootId);
    if (old && !opts.fork) {`],
  [`  project(sourceWin, targetSys) {
    if (!sourceWin || !['player', 'charts'].includes(sourceWin.appId)) return;
    if (!targetSys || targetSys === sourceWin.desktop.system) { this.toast(sourceWin.desktop.system, '投送失败', '请选择祖先桌面', 'warn'); return; }`,
`  project(sourceWin, targetSys) {
    if (!sourceWin || !['player', 'charts'].includes(sourceWin.appId)) return;
    if (!targetSys || targetSys === sourceWin.desktop.system) { this.toast(sourceWin.desktop.system, '投送失败', '请选择祖先桌面', 'warn'); return; }
    const anyExisting = [...this.windows.values()].find(w => w.appId === 'projection' && w.state?.sourceWindowId === sourceWin.id);
    if (anyExisting) { this.focusWindow(anyExisting); return; }`],
  [`    el.addEventListener('pointerdown', () => this.desktop.focusWindow(this), true);`,
`    el.addEventListener('pointerdown', () => {
      const rule = this.desktop.system.wmConfig?.focusRule;
      if (rule === 0 && this.desktop.focusWindowId !== this.id) return;
      this.desktop.focusWindow(this);
    }, true);`],
  [`      b.append(ic, h('span', {}, it.label));
      if (it.key) b.append(h('span', { class: 'ctx-key' }, it.key));`,
`      if (it.testid) b.dataset.testid = it.testid;
      if (it.targetSystemId) b.dataset.targetSystemId = it.targetSystemId;
      b.append(ic, h('span', {}, it.label));
      if (it.key) b.append(h('span', { class: 'ctx-key' }, it.key));`],
  [`        this.selectedId = built.id; this.render();`, `        this.selectedId = built.id; this.render();`],
  [`    if (opts.fork) sd.name = sd.id;`, `    if (opts.fork) sd.name = sd.id;`]
]);

// snapshot settings
patch('js/shell.js', [
  [`        system: s.serialize(),
        windows:`, `        system: Object.assign(s.serialize(), { settings: s.settings, notifications: s.notifications, clipboard: s.clipboard }),
        windows:`],
  [`      sys.settings = entry.settings || deepClone(ROOT_SETTINGS);`]
]);

// instantiate snapshot restore settings
patch('js/shell.js', [
  [`      const sys = System.fromJSON(this, sd, parentSys);
      if (!parentSys) {`, `      const sys = System.fromJSON(this, sd, parentSys);
      sys.settings = entry.settings ? JSON.parse(JSON.stringify(entry.settings)) : (parentSys?.settings ? JSON.parse(JSON.stringify(parentSys.settings)) : deepClone(ROOT_SETTINGS));
      sys.notifications = entry.notifications || [];
      sys.clipboard = entry.clipboard || [];
      if (!parentSys) {`]
]);

console.log('done');