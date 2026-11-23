// Safe Preload Bridge ONLY for Nested OS Main Renderer (NEVER attached to external <webview>s!)
const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

function getRuntimeDataDir() {
  const arg = process.argv.find((a) => a.startsWith('--nested-data-dir='));
  return arg ? arg.slice('--nested-data-dir='.length) : null;
}

const DATA_DIR = getRuntimeDataDir();
const NOS_ROOT = path.join(__dirname, 'src', 'nos_programs');

function readBundledNosPrograms() {
  const mapping = {
    '/sys/compiler.nos': 'compiler.nos',
    '/sys/kernel.nos': 'kernel.nos',
    '/sys/wm.nos': 'wm.nos',
    '/apps/files.nos': path.join('apps', 'files.nos'),
    '/apps/editor.nos': path.join('apps', 'editor.nos'),
    '/apps/tasks.nos': path.join('apps', 'tasks.nos'),
    '/apps/chart_recv.nos': path.join('apps', 'chart_recv.nos'),
    '/apps/chart_ui.nos': path.join('apps', 'chart_ui.nos'),
    '/apps/player_timer.nos': path.join('apps', 'player_timer.nos'),
    '/apps/player_scene.nos': path.join('apps', 'player_scene.nos'),
    '/apps/player_fx.nos': path.join('apps', 'player_fx.nos'),
    '/apps/flight_ctrl.nos': path.join('apps', 'flight_ctrl.nos'),
    '/Programs/sum.nos': path.join('demos', 'sum.nos'),
    '/Programs/sender.nos': path.join('demos', 'sender.nos'),
    '/Programs/receiver.nos': path.join('demos', 'receiver.nos'),
    '/Programs/busy.nos': path.join('demos', 'busy.nos'),
  };
  const out = {};
  for (const [vfsPath, rel] of Object.entries(mapping)) {
    const fp = path.join(NOS_ROOT, rel);
    if (fs.existsSync(fp)) {
      out[vfsPath] = fs.readFileSync(fp, 'utf8');
    }
  }
  return out;
}

contextBridge.exposeInMainWorld('nestedHost', {
  dataDir: DATA_DIR,
  readBundledNosPrograms,
  readDataFile: (name) => {
    if (!DATA_DIR) return null;
    const safe = path.basename(String(name));
    const fp = path.join(DATA_DIR, safe);
    if (!fs.existsSync(fp)) return null;
    return fs.readFileSync(fp, 'utf8');
  },
  writeDataFile: (name, content) => {
    if (!DATA_DIR) return false;
    const safe = path.basename(String(name));
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, safe), String(content ?? ''), 'utf8');
    return true;
  },
  exportFile: (defaultName, content) => ipcRenderer.invoke('host:export-file', defaultName, content),
  importFile: () => ipcRenderer.invoke('host:import-file'),
  onOpenBrowserTab: (cb) => {
    const handler = (_e, url) => cb(url);
    ipcRenderer.on('browser:open-tab-url', handler);
    return () => ipcRenderer.removeListener('browser:open-tab-url', handler);
  },
});
