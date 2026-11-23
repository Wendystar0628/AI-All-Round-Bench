import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
function rep(a, b) { if (!s.includes(a)) { console.log('MISS', a.slice(0, 50)); return; } s = s.replace(a, b); }
rep(`  createApp(win) {`, `  ensureService(sys, name) {
    if (!sys) return null;
    const p = sys.processes.find(x => x.name === name && x.state !== 'finished' && x.state !== 'error');
    if (p) return p;
    const path = '/System/' + name + '.prog';
    const f = sys.fs.get(path);
    if (!f || f.dir) return null;
    const r = sys.spawn(name, f.content, { type: 'service', quota: name === 'flight' ? 400 : 500 });
    return r.ok ? r.proc : null;
  }

  reapServices(sys) {
    if (!sys) return;
    const wins = [...this.windows.values()].filter(w => w.systemId === sys.id);
    if (!wins.some(w => w.appId === 'player')) {
      for (const p of sys.processes) if (p.name === 'player' || p.name === 'flight' || p.name === 'controller') { p.state = 'finished'; p.error = null; }
    }
    if (!wins.some(w => w.appId === 'charts')) {
      for (const p of sys.processes) if (p.name === 'charts') { p.state = 'finished'; p.error = null; }
    }
  }

  createApp(win) {`);
rep(`    const def = APP_DEFS[appId];
    if (!def || !APP_CLASSES[appId]) {`, `    const def = APP_DEFS[appId];
    if (!def || !APP_CLASSES[appId]) {`);
rep(`    return Promise.resolve(this.createWindow(sys, {
      appId, title: opts.title || def.title, width: opts.width, height: opts.height,
      x: opts.x, y: opts.y, state: opts.state || {}, filePath: opts.filePath
    }));`, `    if (appId === 'player') { this.ensureService(sys, 'player'); this.ensureService(sys, 'flight'); }
    if (appId === 'charts') { this.ensureService(sys, 'charts'); }
    return Promise.resolve(this.createWindow(sys, {
      appId, title: opts.title || def.title, width: opts.width, height: opts.height,
      x: opts.x, y: opts.y, state: opts.state || {}, filePath: opts.filePath
    }));`);
rep(`    if (win.appId === 'browser') this.closeBrowserResources(win);
    if (win.appId === 'player' || win.appId === 'charts') {`, `    if (win.appId === 'browser') this.closeBrowserResources(win);
    this.reapServices(win.sys);
    if (win.appId === 'player' || win.appId === 'charts') {`);
fs.writeFileSync('js/shell.js', s);
console.log('done');