/*
 * 嵌套操作系统 —— Electron 主进程
 * 启动参数：--data-dir <目录>  --width <像素>  --height <像素>
 */
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let mainWindow = null;

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

function argValue(name, def) {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--' + name) return args[i + 1];
    if (args[i].startsWith('--' + name + '=')) return args[i].slice(name.length + 3);
  }
  return def;
}

const dataDir = path.resolve(argValue('data-dir', path.join(app.getPath('userData'), 'NestedOS')));
const width = parseInt(argValue('width', '1440'), 10) || 1440;
const height = parseInt(argValue('height', '900'), 10) || 900;

fs.mkdirSync(dataDir, { recursive: true });

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('allow-file-access-from-files');
app.commandLine.appendSwitch('enable-features', 'NetworkService');

function createWindow() {
  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b1020',
    title: 'Nested OS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
      spellcheck: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL('app://bundle/index.html');
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });
  // 外部链接交给系统浏览器，作品内网页由 webview 处理
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  // 自定义协议：把渲染层与随项目交付的 NSL 源码/资源以同源方式提供
  protocol.handle('app', (request) => {
    try {
      const url = new URL(request.url);
      let p = decodeURIComponent(url.pathname);
      if (p === '/' || p === '') p = '/index.html';
      const base = path.join(__dirname, 'renderer');
      let file = path.join(base, p);
      if (!file.startsWith(base)) return new Response('forbidden', { status: 403 });
      if (!fs.existsSync(file)) {
        const alt = path.join(__dirname, p.replace(/^\//, ''));
        if (fs.existsSync(alt)) file = alt;
        else return new Response('not found: ' + p, { status: 404 });
      }
      return net.fetch(pathToFileURL(file).toString());
    } catch (e) {
      return new Response('error: ' + e.message, { status: 500 });
    }
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { app.quit(); });

ipcMain.handle('nested-os:data-dir', () => dataDir);
ipcMain.handle('nested-os:save-file', async (event, { defaultName, content }) => {
  const res = await dialog.showSaveDialog(mainWindow, { defaultPath: path.join(dataDir, defaultName || 'export.txt') });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(res.filePath, content || '', 'utf8');
  return { ok: true, path: res.filePath };
});
ipcMain.handle('nested-os:open-file', async (event, { filters } ) => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: filters || undefined });
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
  const p = res.filePaths[0];
  return { ok: true, path: p, name: path.basename(p), content: fs.readFileSync(p, 'utf8') };
});
ipcMain.handle('nested-os:exists', (event, p) => fs.existsSync(p));
ipcMain.handle('nested-os:read-file', (event, p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } });
ipcMain.handle('nested-os:write-file', (event, { path: p, content }) => {
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content || '', 'utf8'); return true; } catch (e) { return false; }
});
