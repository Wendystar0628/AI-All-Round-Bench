import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `    // 挂载根桌面
    const pd = this.desktops.get(rootSys.id);
    if (pd) {
      pd.el.style.position = 'absolute';
      pd.el.style.inset = '0';
      if (parent.desktop) parent.desktop.el.appendChild(pd.el);
      pd.updateZoom();
    }`;
const b = `    // 在父桌面上重新打开该子树的系统窗口
    const pd = this.desktops.get(rootSys.id);
    if (pd) {
      pd.el.style.position = 'absolute';
      pd.el.style.inset = '0';
      this.openApp(parent, 'system', { systemId: rootSys.id });
    }`;
if (s.includes(a)) { s = s.replace(a, b); console.log('replaced'); } else console.log('not found');
fs.writeFileSync('js/shell.js', s);
// restart reopen
const c = "    this.notify(sys, '系统已重启'";
const idx = s.indexOf(c);
if (idx >= 0) {
  const insert = "    const existingWin = [...this.windows.values()].find(w => w.appId === 'system' && w.state?.systemId === sys.id && w.systemId === sys.parent.id);\n    if (!existingWin) this.openSystemWindow(sys.parent, sys);\n";
  if (!s.includes('existingWin')) s = s.slice(0, idx) + insert + s.slice(idx);
  console.log('restart patched');
}
fs.writeFileSync('js/shell.js', s);