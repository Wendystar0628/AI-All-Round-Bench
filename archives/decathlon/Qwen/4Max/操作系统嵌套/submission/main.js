'use strict';
const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 参数解析：--data-dir --width --height --remote-debugging-port
function parseArgs(argv) {
  const out = { dataDir: null, width: 1440, height: 900, port: 19106 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--data-dir' && argv[i + 1]) out.dataDir = argv[++i];
    else if (a.startsWith('--data-dir=')) out.dataDir = a.slice(11);
    else if (a === '--width' && argv[i + 1]) out.width = parseInt(argv[++i], 10) || out.width;
    else if (a.startsWith('--width=')) out.width = parseInt(a.slice(8), 10) || out.width;
    else if (a === '--height' && argv[i + 1]) out.height = parseInt(argv[++i], 10) || out.height;
    else if (a.startsWith('--height=')) out.height = parseInt(a.slice(9), 10) || out.height;
    else if (a.startsWith('--remote-debugging-port=')) out.port = parseInt(a.slice(24), 10) || out.port;
  }
  return out;
}
const args = parseArgs(process.argv.slice(1));

// 防止窗口被遮挡时 Chromium 将页面视为隐藏（webview 变空白、rAF 停止）
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('remote-debugging-port', String(args.port));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!args.dataDir) {
  args.dataDir = path.join(os.tmpdir(), 'nested-os-data');
}
fs.mkdirSync(args.dataDir, { recursive: true });

let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: args.width,
    height: args.height,
    minWidth: 900,
    minHeight: 600,
    title: 'Nested OS',
    backgroundColor: '#0b0e1a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      backgroundThrottling: false,
      spellcheck: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setBackgroundThrottling(false);
  win.webContents.on('render-process-gone', (e, details) => {
    console.error('renderer gone', details);
  });
  // 网页视图安全边界：不向外部网页开放 Node / 宿主对象
  win.webContents.on('did-attach-webview', (event, wc) => {
    wc.setBackgroundThrottling(false);
    wc.setWindowOpenHandler(({ url }) => {
      win.webContents.send('browser-new-window', url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => {
      // 允许正常站内导航
    });
  });
}

app.whenReady().then(() => {
  ipcMain.handle('get-args', () => args);
  ipcMain.handle('save-file-dialog', async (e, opts) => {
    const r = await dialog.showSaveDialog(win, {
      title: opts.title || '保存到本机',
      defaultPath: opts.defaultPath || 'file',
      filters: opts.filters || [{ name: '所有文件', extensions: ['*'] }]
    });
    if (r.canceled || !r.filePath) return { ok: false };
    try { fs.writeFileSync(r.filePath, opts.content, 'utf8'); return { ok: true, path: r.filePath }; }
    catch (err) { return { ok: false, error: String(err.message || err) }; }
  });
  ipcMain.handle('open-file-dialog', async (e, opts) => {
    const r = await dialog.showOpenDialog(win, {
      title: opts.title || '从本机导入',
      properties: ['openFile'],
      filters: opts.filters || [{ name: '所有文件', extensions: ['*'] }]
    });
    if (r.canceled || !r.filePaths.length) return { ok: false };
    try {
      const content = fs.readFileSync(r.filePaths[0], 'utf8');
      return { ok: true, path: r.filePaths[0], name: path.basename(r.filePaths[0]), content };
    } catch (err) { return { ok: false, error: String(err.message || err) }; }
  });
  ipcMain.handle('read-project-file', (e, rel) => {
    const p = path.join(__dirname, rel);
    if (!p.startsWith(__dirname)) return { ok: false };
    try { return { ok: true, content: fs.readFileSync(p, 'utf8') }; } catch (err) { return { ok: false, error: String(err.message || err) }; }
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { app.quit(); });
