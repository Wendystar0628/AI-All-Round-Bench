// Electron 主进程：创建主窗口、解析启动参数、提供系统映像/持久化/导入导出服务。
const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');

function argOf(name, def) {
  const a = process.argv;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--' + name && i + 1 < a.length) return a[i + 1];
    if (a[i].startsWith('--' + name + '=')) return a[i].slice(name.length + 3);
  }
  return def;
}
const DATA_DIR = path.resolve(argOf('data-dir', path.join(app.getPath('userData'), 'data')));
const WIDTH = parseInt(argOf('width', '1440'), 10) || 1440;
const HEIGHT = parseInt(argOf('height', '860'), 10) || 860;
fs.mkdirSync(DATA_DIR, { recursive: true });
for (const d of ['exports', 'downloads', 'imports']) fs.mkdirSync(path.join(DATA_DIR, d), { recursive: true });
app.setPath('userData', path.join(DATA_DIR, 'profile'));

// 窗口被遮挡或最小化时也要继续运行与绘制
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');

let win = null;

function walkImage(dir, base, out) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walkImage(p, base, out);
    else out['/' + path.relative(base, p).replace(/\\/g, '/')] = fs.readFileSync(p, 'utf8');
  }
}

ipcMain.handle('image:load', () => { const out = {}; walkImage(path.join(__dirname, 'ns'), path.join(__dirname, 'ns'), out); return out; });
ipcMain.handle('persist:load', () => { try { return fs.readFileSync(path.join(DATA_DIR, 'root-overlay.json'), 'utf8'); } catch (e) { return null; } });
ipcMain.handle('persist:save', (e, text) => { fs.writeFileSync(path.join(DATA_DIR, 'root-overlay.json'), text); return true; });
ipcMain.handle('persist:clear', () => { try { fs.unlinkSync(path.join(DATA_DIR, 'root-overlay.json')); } catch (e) { } return true; });
ipcMain.handle('config:get', () => ({ dataDir: DATA_DIR, width: WIDTH, height: HEIGHT }));
ipcMain.handle('export:file', (e, name, text) => {
  const safe = String(name).replace(/[\\/:*?"<>|]/g, '_');
  const p = path.join(DATA_DIR, 'exports', safe); fs.writeFileSync(p, text); return p;
});
ipcMain.handle('import:list', () => {
  try { return fs.readdirSync(path.join(DATA_DIR, 'imports')).map((f) => 'imports/' + f).concat(fs.readdirSync(path.join(DATA_DIR, 'exports')).map((f) => 'exports/' + f)); } catch (e) { return []; }
});
ipcMain.handle('import:file', (e, p) => {
  try {
    const full = path.isAbsolute(p) ? p : path.join(DATA_DIR, p);
    return { name: path.basename(full), text: fs.readFileSync(full, 'utf8') };
  } catch (err) { return { err: String(err.message) }; }
});
ipcMain.handle('import:bytes', (e, name, b64) => { const p = path.join(DATA_DIR, 'imports', name.replace(/[\\/:*?"<>|]/g, '_')); fs.writeFileSync(p, Buffer.from(b64, 'base64')); return p; });
ipcMain.handle('shell:open', (e, p) => shell.showItemInFolder(p));

function createWindow() {
  win = new BrowserWindow({
    width: WIDTH, height: HEIGHT, useContentSize: true, title: 'Nested OS', backgroundColor: '#0f0c1d', show: true, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, webviewTag: true, backgroundThrottling: false, spellcheck: false },
  });
  win.setMenu(null);
  win.on('page-title-updated', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  const ses = session.fromPartition('persist:browser');
  ses.on('will-download', (e, item) => {
    const p = path.join(DATA_DIR, 'downloads', item.getFilename());
    item.setSavePath(p);
    item.once('done', (ev, state) => { if (win) win.webContents.send('browser:download', { name: item.getFilename(), path: p, state, size: item.getReceivedBytes() }); });
  });
  createWindow();
});
app.on('web-contents-created', (e, wc) => {
  if (wc.getType() === 'webview') {
    wc.setWindowOpenHandler(({ url }) => { if (win) win.webContents.send('browser:newwindow', { from: wc.id, url }); return { action: 'deny' }; });
  }
  wc.on('will-attach-webview', (ev, webPreferences) => { delete webPreferences.preload; webPreferences.nodeIntegration = false; webPreferences.contextIsolation = true; });
});
app.on('window-all-closed', () => app.quit());
