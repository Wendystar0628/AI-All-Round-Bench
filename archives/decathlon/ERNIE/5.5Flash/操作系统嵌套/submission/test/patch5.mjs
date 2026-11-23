import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `    if (appId === 'system') {
      const child = opts.systemId ? this.systems.get(opts.systemId) : null;
      if (!child) return Promise.resolve(null);
      if (child.state === 'stopped' || child.state === 'error') {
        this.toast(sys, '子系统不可用', \`\${child.id} 当前未运行\`, 'warn');
      }
      if (!child.desktop) {
        child.desktop = new Desktop(this, child, null);
        this.desktops.set(child.id, child.desktop);
      }
      if (!child.desktop.mounted) child.desktop.mount(opts.hostEl || null);
      const win = this.createWindow(sys, {
        appId: 'system', title: opts.title || \`\${child.id} · 子系统桌面\`,
        width: opts.width, height: opts.height, x: opts.x, y: opts.y, state: { systemId: child.id }
      });`;
const b = `    if (appId === 'system') {
      const child = opts.systemId ? this.systems.get(opts.systemId) : null;
      if (!child) return Promise.resolve(null);
      if (child.state === 'stopped' || child.state === 'error') {
        this.toast(sys, '子系统不可用', \`\${child.id} 当前未运行\`, 'warn');
      }
      const existing = [...this.windows.values()].find(w => w.appId === 'system' && w.state?.systemId === child.id && w.systemId === sys.id);
      if (existing) {
        if (existing.minimized) { existing.minimized = false; existing.el.classList.remove('minimized'); }
        this.desktops.get(sys.id)?.focusWindow(existing);
        return Promise.resolve(existing);
      }
      if (!child.desktop) {
        child.desktop = new Desktop(this, child, null);
        this.desktops.set(child.id, child.desktop);
      }
      if (!child.desktop.mounted) {
        child.desktop.mounted = true;
        child.desktop.buildChrome();
      }
      const win = this.createWindow(sys, {
        appId: 'system', title: opts.title || \`\${child.id} · 子系统桌面\`,
        width: opts.width, height: opts.height, x: opts.x, y: opts.y, state: { systemId: child.id }
      });`;
if (!s.includes(a)) { console.log('system block not found'); } else s = s.replace(a, b);
const c = `  closeWindow(win, opts = {}) {
    if (!win || win.closing) return;
    win.closing = true;
    if (win.app && win.app.beforeClose) {
      const r = win.app.beforeClose();
      if (r === false) { win.closing = false; return; }
    }`;
const d = `  closeWindow(win, opts = {}) {
    if (!win || (win.closing && !opts.force)) return;
    win.closing = true;
    if (win.app && win.app.beforeClose && !opts.force) {
      const r = win.app.beforeClose();
      if (r && typeof r.then === 'function') {
        r.then(ok => {
          if (ok === false) { win.closing = false; return; }
          this.closeWindow(win, { force: true });
        }).catch(() => { win.closing = false; });
        return;
      }
      if (r === false) { win.closing = false; return; }
    }`;
if (!s.includes(c)) console.log('close block not found'); else s = s.replace(c, d);
fs.writeFileSync('js/shell.js', s);
console.log('done');