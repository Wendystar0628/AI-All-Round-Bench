import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
function rep(a, b) {
  if (!s.includes(a)) { console.log('MISS:', a.slice(0, 60)); return; }
  s = s.replace(a, b);
}

// 1. prompt
rep(`  prompt(sys, title, text, defaultValue = '', okText = '确定') {
    return this.dialog(sys, {
      title, text,
      input: { value: defaultValue, placeholder: '' },
      actions: [{ id: 'ok', text: okText, primary: true }, { id: 'cancel', text: '取消' }]
    }).then(res => res === 'ok' ? (d_lastPromptValue ?? defaultValue) : null);
  }`,
`  prompt(sys, title, text, defaultValue = '', okText = '确定') {
    return this.dialog(sys, {
      title, text,
      input: { value: defaultValue, placeholder: '' },
      actions: [{ id: 'ok', text: okText, primary: true }, { id: 'cancel', text: '取消' }]
    }).then(res => res === 'ok' ? (this.lastDialogValue ?? defaultValue) : null);
  }`);

// 2. destroyWindow guard and no projection recursion
rep(`  destroyWindow(win) {
    if (!win) return;
    try { win.app?.dispose?.(); } catch (e) {}`,
`  destroyWindow(win) {
    if (!win || win.destroyed) return;
    win.destroyed = true;
    try { win.app?.dispose?.(); } catch (e) {}`);
rep(`    if (win.appId === 'browser') this.closeBrowserResources(win);
    if (win.appId === 'projection') this.closeProjection(win);
    this.saveSoon();`,
`    if (win.appId === 'browser') this.closeBrowserResources(win);
    if (win.appId === 'player' || win.appId === 'charts') this.closeProjectionsOf(win);
    this.saveSoon();`);

// 3. mount/buildChrome
rep(`    this.mounted = true;
    this.layout();
    this.renderIcons();
    this.rebuildTaskbar();
    this.buildStartMenu();
    this.applySystemTheme();`,
`    this.mounted = true;
    this.layout();
    if (!this.taskbarBuilt) this.buildTaskbar();
    this.renderIcons();
    this.rebuildTaskbar();
    this.buildStartMenu();
    this.applySystemTheme();`);
rep(`  buildChrome() {
    this.renderIcons();
    this.rebuildTaskbar();
    this.buildStartMenu();
  }`,
`  buildChrome() {
    if (!this.taskbarBuilt) this.buildTaskbar();
    this.renderIcons();
    this.rebuildTaskbar();
    this.buildStartMenu();
  }`);

// 4. attachWindow
rep(`  attachWindow(win) { this.win = win; }`,
`  attachWindow(win) {
    this.win = win;
    this.hostEl = win.bodyEl;
    this.layout();
    this.updateZoom();
  }`);

// 5. openSystemWindow focus existing
rep(`  openSystemWindow(parent, child) {
    const pd = this.desktops.get(parent.id);
    if (!pd) return;
    const work = pd.workArea();`,
`  openSystemWindow(parent, child) {
    const pd = this.desktops.get(parent.id);
    if (!pd) return;
    const existing = [...this.windows.values()].find(w => w.appId === 'system' && w.state?.systemId === child.id && w.systemId === parent.id);
    if (existing) {
      if (existing.minimized) { existing.minimized = false; existing.el.classList.remove('minimized'); }
      pd.focusWindow(existing);
      return existing;
    }
    const work = pd.workArea();`);

// 6. createApp + classes
rep(`  createWindow(sys, opts) {`,
`  createApp(win) {
    if (win.appId === 'system') return new SystemApp(win, this);
    if (win.appId === 'projection') return new ProjectionApp(win, this, win.state);
    if (win.appId === 'panel') return new PanelApp(win, this, win.state);
    const C = APP_CLASSES[win.appId];
    if (C) return new C(win, this, win.state);
    return new DummyApp(win, this);
  }

  closeProjectionsOf(win) {
    for (const p of [...this.windows.values()]) {
      if (p.appId === 'projection' && p.state?.sourceWindowId === win.id) {
        p.app?.dispose?.();
        if (p.el?.parentNode) p.el.parentNode.removeChild(p.el);
        this.windows.delete(p.id);
        p.desktop.windows = p.desktop.windows.filter(w => w !== p);
        p.desktop.rebuildTaskbar();
        this.notify(p.desktop.system, '投送已结束', '源窗口已关闭', 'warn', true);
      }
    }
  }

  closeBrowserResources(win) {
    if (win.app?.dispose) { /* already disposed */ }
  }

  createWindow(sys, opts) {`);

// 7. openFile scene/record
rep(`    } else if (['prog', 'kernel', 'txt', 'md', 'json', 'scene', 'record'].includes(ext)) {
      this.openApp(sys, ext === 'scene' ? 'player' : 'editor', { state: { path }, filePath: path });
      if (ext === 'scene') {
        const win = this.windows.get([...this.windows.values()].filter(w => w.appId === 'player').slice(-1)[0]?.id);
        if (win?.app?.loadScene) win.app.loadScene(path);
      }
    } else if (ext === 'record') {
      const win = this.openApp(sys, 'player', { state: { recordPath: path } });
      if (win?.app?.loadRecord) win.app.loadRecord(path);
    } else {`,
`    } else if (ext === 'scene') {
      this.openApp(sys, 'player', { state: { path }, filePath: path });
    } else if (ext === 'record') {
      this.openApp(sys, 'player', { state: { recordPath: path } });
    } else if (['prog', 'kernel', 'txt', 'md', 'json'].includes(ext)) {
      this.openApp(sys, 'editor', { state: { path }, filePath: path });
    } else {`);

// 8. createInitial no auto files
rep(`    this.applySettings(root);
    this.openApp(root, 'files', { hidden: false, initial: true }).then(w => {
      if (w) { /* 首次打开文件管理器，便于发现内容 */ }
    });
    this.notify(root, 'Nested OS', '根系统已就绪。可从桌面“新建子系统”开始递归。', 'ok', false);`,
`    this.applySettings(root);
    this.notify(root, 'Nested OS', '根系统已就绪。双击桌面图标打开应用，或用“新建子系统”开始递归。', 'ok', false);`);

// 9. afterTick projection duplicate
rep(`    for (const w of this.windows.values()) {
      if (w.appId === 'projection' && w.app?.render) {
        try { w.app.render(); } catch (e) {}
      }
    }
`, ``);

// 10. dialog value
rep(`      const layer = h('div', { class: 'modal-layer' });`,
`      const layer = h('div', { class: 'modal-layer', style: { pointerEvents: 'auto' } });
      this.lastDialogValue = undefined;`);
rep(`        b.addEventListener('click', () => {
          if (inputEl) d_lastPromptValue = inputEl.value;
          finish(a.id);
        });`,
`        b.addEventListener('click', () => {
          this.lastDialogValue = inputEl ? inputEl.value : undefined;
          finish(a.id);
        });`);
rep(`      layer.addEventListener('pointerdown', e => { if (e.target === layer) { if (inputEl) d_lastPromptValue = inputEl.value; finish('cancel'); } });`,
`      layer.addEventListener('pointerdown', e => { if (e.target === layer) { this.lastDialogValue = inputEl ? inputEl.value : undefined; finish('cancel'); } });`);
rep(`        if (e.key === 'Enter' && inputEl) { d_lastPromptValue = inputEl.value; finish('ok'); layer.removeEventListener('keydown', key); }
        if (e.key === 'Escape') { d_lastPromptValue = inputEl?.value || ''; finish('cancel'); }`,
`        if (e.key === 'Enter' && inputEl) { this.lastDialogValue = inputEl.value; finish('ok'); }
        if (e.key === 'Escape') { this.lastDialogValue = inputEl?.value; finish('cancel'); }`);

// 11. timer end in updateClock
rep(`    this.clockEl.innerHTML = \`<b>\${hh}:\${mm}</b><br><span>\${date}</span>\`;
  }`,
`    this.clockEl.innerHTML = \`<b>\${hh}:\${mm}</b><br><span>\${date}</span>\`;
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
  }`);

// 12. register all root workbooks on hydrate
rep(`    for (const sys of this.systems.values()) this.applySettings(sys);
    this.rehydrateWorkbooks();`,
`    for (const sys of this.systems.values()) this.applySettings(sys);
    this.rehydrateWorkbooks();
    if (this.root?.apps?.workbooks) {
      for (const doc of this.root.apps.workbooks) {
        if (!this.rootWorkbooks.has(doc.id)) this.registerWorkbook(this.root, doc);
      }
    }`);

// 13. createInitial clear notif etc
rep(`    this.root = root;
    const d = new Desktop(this, root, this.rootEl);`,
`    this.root = root;
    root.epochBase = Date.now();
    const d = new Desktop(this, root, this.rootEl);`);

// 14. attachWindow layout for child
rep(`      d.mount();
    root.desktop = d;`, `      d.mount();
    root.desktop = d;`);

// 15. fix dialog keydown removal
rep(`      const key = e => {
        if (e.key === 'Enter' && inputEl) { this.lastDialogValue = inputEl.value; finish('ok'); }
        if (e.key === 'Escape') { this.lastDialogValue = inputEl?.value; finish('cancel'); }
      };`,
`      const key = e => {
        if (e.key === 'Enter' && inputEl) { this.lastDialogValue = inputEl.value; finish('ok'); layer.removeEventListener('keydown', key); }
        if (e.key === 'Escape') { this.lastDialogValue = inputEl?.value; finish('cancel'); layer.removeEventListener('keydown', key); }
      };`);

// 16. remove unused prompt global
rep(`// 让 prompt 能取到输入值
let d_lastPromptValue = null;`, ``);

fs.writeFileSync('js/shell.js', s);
console.log('done');