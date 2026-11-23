import fs from 'fs';
function patch(path, pairs) {
  let s = fs.readFileSync(path, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.log('MISS', path, a.slice(0, 70)); continue; }
    s = s.replace(a, b);
  }
  fs.writeFileSync(path, s);
}

patch('js/apps/player.js', [
  [`    this.sceneDef = def;
    this.scenePath = path;`,
`    const proc = this.sys.processes.find(p => p.name === 'player');
    const bytes = new TextEncoder().encode(JSON.stringify(def)).length * 30;
    if (this.sys.totalMem + bytes > this.sys.memoryLimit) {
      this.os.toast(this.sys, '场景载入失败', '内存配额不足，无法载入该场景资源', 'err');
      return;
    }
    if (proc) this.sys.chargeMemory(proc, bytes); else this.sys.totalMem += bytes;
    this.sceneDef = def;
    this.scenePath = path;`],
  [`  projectMenu(anchor) {`,
`  reset() {
    this.sim = null;
    this.record = null;
    this.recordSamples = [];
    this.time = 0;
    this.playing = false;
    this.mode = 'show';
    this.camera.mode = 'cinematic';
    if (this.sceneDef) { this.loadScene(this.scenePath || '/Demo/helicopter-24.scene'); }
    for (const [k, b] of Object.entries(this.modeBtns || {})) b.classList.toggle('on', k === 'show');
    this.updateModeVisibility();
    this.updateHud();
    this.render();
  }
  projectMenu(anchor) {`],
  [`    const items = ancestors.map(a => ({
      icon: 'projection', label: \`投送到 \${a.id}\`,
      act: () => this.os.project(this.win, a)
    }));`,
`    const items = ancestors.map(a => ({
      icon: 'projection', label: \`投送到 \${a.id}\`, testid: 'project-target', targetSystemId: a.id,
      act: () => this.os.project(this.win, a)
    }));`],
  [`  applyProjectionAction(action) {
    if (!action) return;`,
`  applyProjectionAction(action) {
    if (!action) return;
    if (this.win.appId === 'projection') return;`]
]);

patch('js/apps/charts.js', [
  [`  projectMenu(anchor) {`,
`  reset() {
    this.os.chartSubs.delete(this.win.id);
    this.chart.connection = 'disconnected';
    this.chart.data = { labels: [], series: [] };
    this.chart.prevData = null;
    this.chart.version = 0;
    this.updateState();
    this.render();
  }
  projectMenu(anchor) {`],
  [`    this.win.desktop.showContextMenu(r.left, r.bottom + 4, ancestors.map(a => ({ icon: 'projection', label: \`投送到 \${a.id}\`, act: () => this.os.project(this.win, a) })));`,
`    this.win.desktop.showContextMenu(r.left, r.bottom + 4, ancestors.map(a => ({ icon: 'projection', label: \`投送到 \${a.id}\`, testid: 'project-target', targetSystemId: a.id, act: () => this.os.project(this.win, a) })));`]
]);

patch('js/shell.js', [
  [`      if (w.systemId === sys.id && w.app?.reset) { try { w.app.reset(); } catch (e) {} }`,
`      if (w.systemId === sys.id && w.app?.reset) { try { w.app.reset(); } catch (e) {} }`]
]);

patch('js/apps/tasks.js', [
  [`    item('存储配额 (MB)', st, fmtBytes(sys.storageUsed || 0));
  }`,
`    item('存储配额 (MB)', st, fmtBytes(sys.storageUsed || 0));
    for (const c of sys.children) {
      const row = h('div', { style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10.5px', color: 'var(--muted)' } });
      const slider = h('input', { type: 'range', min: '5', max: '80', value: String(Math.round((c.grantRatio || 0.5) * 100)), style: { flex: '1', accentColor: 'var(--accent)' }, 'data-testid': 'tasks-grant', 'data-target-system-id': c.id });
      slider.addEventListener('input', () => this.os.setGrant(c, Number(slider.value) / 100));
      row.append(h('span', { style: { minWidth: '70px' } }, c.id + ' 拨付'), slider, h('span', { style: { minWidth: '38px', textAlign: 'right' } }, Math.round((c.grantRatio || 0.5) * 100) + '%'));
      this.footEl.append(row);
    }
  }`]
]);

patch('js/shell.js', [
  [`    const list = h('div', {});
    const nots = (sys.notifications || []).slice(0, 6);`,
`    const list = h('div', { 'data-testid': 'widget-notifications' });
    const nots = (sys.notifications || []).slice(0, 6);`]
]);

patch('js/shell.js', [
  [`  act(action) { this.os.forwardProjection(this.win, action); }`,
`  act(action) { if (this.frozen) return; this.os.forwardProjection(this.win, action); }`]
]);

console.log('done');