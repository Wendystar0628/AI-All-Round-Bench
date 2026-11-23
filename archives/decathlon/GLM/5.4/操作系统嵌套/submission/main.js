'use strict';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// 启动参数：--data-dir <dir> --width <n> --height <n>
// 调试端口由 Chromium 自行解析 --remote-debugging-port=19106
// ---------------------------------------------------------------------------
const args = process.argv.slice(process.argv.findIndex((a) => /main\.js$|index\.js$/.test(a)) + 1);
const cli = { dataDir: null, width: 1440, height: 900, debugPort: 19106 };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => args[++i];
  if (a === '--data-dir') cli.dataDir = next();
  else if (a.startsWith('--data-dir=')) cli.dataDir = a.slice(11);
  else if (a === '--width') cli.width = parseInt(next(), 10) || cli.width;
  else if (a.startsWith('--width=')) cli.width = parseInt(a.slice(8), 10) || cli.width;
  else if (a === '--height') cli.height = parseInt(next(), 10) || cli.height;
  else if (a.startsWith('--height=')) cli.height = parseInt(a.slice(9), 10) || cli.height;
  else if (a.startsWith('--remote-debugging-port=')) cli.debugPort = parseInt(a.split('=')[1], 10);
}
if (!cli.dataDir) cli.dataDir = path.join(app.getPath('userData'), 'data');
cli.dataDir = path.resolve(cli.dataDir);

let mainWindow = null;

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch (e) { /* ignore */ }
}

function createWindow() {
  ensureDir(cli.dataDir);
  mainWindow = new BrowserWindow({
    width: cli.width,
    height: cli.height,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#08090d',
    title: 'Nested OS',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webviewTag: true,
      backgroundThrottling: false,
      spellcheck: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.on('will-attach-webview', (e, prefs, params) => {
    // 外部网页视图：隔离，不开放 Node / 文件系统 / 预加载
    delete prefs.preloadURL;
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.webSecurity = true;
    prefs.allowRunningInsecureContent = false;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // 网页打开的新窗口一律交给浏览器应用内部处理
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browser:new-window', url);
    }
    return { action: 'deny' };
  });
}

// ---- IPC：文件对话框与外部文件读写 ----------------------------------------
ipcMain.handle('app:info', () => ({
  dataDir: cli.dataDir,
  width: cli.width,
  height: cli.height,
  version: app.getVersion(),
  platform: process.platform
}));

ipcMain.handle('dialog:save', async (e, opts) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: opts && opts.title ? opts.title : '保存到本机',
    defaultPath: opts && opts.defaultPath ? opts.defaultPath : undefined,
    filters: opts && opts.filters ? opts.filters : undefined
  });
  if (r.canceled || !r.filePath) return null;
  return r.filePath;
});

ipcMain.handle('dialog:open', async (e, opts) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: opts && opts.title ? opts.title : '从本机导入',
    properties: ['openFile'],
    filters: opts && opts.filters ? opts.filters : undefined
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  return r.filePaths[0];
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
