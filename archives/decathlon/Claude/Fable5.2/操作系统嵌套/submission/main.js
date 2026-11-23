'use strict';
// Nested OS —— Electron 主进程：创建主窗口、提供本机文件存取与浏览器网页视图的安全边界。
const { app, BrowserWindow, ipcMain, dialog, protocol, net, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

function argValue(name, def) {
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--' + name && i + 1 < argv.length) return argv[i + 1];
    if (argv[i].startsWith('--' + name + '=')) return argv[i].slice(name.length + 3);
  }
  return def;
}
const dataDir = path.resolve(argValue('data-dir', path.join(app.getPath('userData'), 'default-data')));
const winW = Math.max(800, parseInt(argValue('width', '1600'), 10) || 1600);
const winH = Math.max(600, parseInt(argValue('height', '900'), 10) || 900);
fs.mkdirSync(dataDir, { recursive: true });
app.setPath('userData', path.join(dataDir, 'chromium'));
// 主窗口被其他窗口完全盖住时仍然照常运行与绘制
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('force-color-profile', 'srgb');

protocol.registerSchemesAsPrivileged([{ scheme: 'nos', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

let win = null;
const storeDir = path.join(dataDir, 'store');
fs.mkdirSync(storeDir, { recursive: true });
const exportDir = path.join(dataDir, 'exports');

function safeName(key) { return String(key).replace(/[^a-zA-Z0-9_.-]/g, '_'); }

function createWindow() {
  win = new BrowserWindow({
    width: winW, height: winH, useContentSize: true, title: 'Nested OS', backgroundColor: '#10141c', show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false,
      webviewTag: true, backgroundThrottling: false, spellcheck: false
    }
  });
  win.setMenuBarVisibility(false);
  win.on('page-title-updated', e => e.preventDefault());
  win.loadURL('nos://app/src/host/index.html');
  // 个别缩放比例下客户区会差一两个像素，这里校正到指定尺寸
  const fit = () => { if (!win) return; const [cw, ch] = win.getContentSize(); if (cw !== winW || ch !== winH) { const [ow, oh] = win.getSize(); win.setSize(ow + (winW - cw), oh + (winH - ch)); } };
  win.once('ready-to-show', fit);
  win.webContents.once('did-finish-load', () => setTimeout(fit, 50));
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  const root = __dirname;
  protocol.handle('nos', (req) => {
    const u = new URL(req.url);
    const rel = decodeURIComponent(u.pathname);
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  // 根系统状态持久化（文件系统、设置等），全部写在 --data-dir 指定的目录里
  ipcMain.handle('store:get', async (e, key) => {
    try { return await fs.promises.readFile(path.join(storeDir, safeName(key)), 'utf8'); } catch (err) { return null; }
  });
  ipcMain.handle('store:set', async (e, key, value) => {
    const f = path.join(storeDir, safeName(key));
    if (value === null || value === undefined) { try { await fs.promises.unlink(f); } catch (err) { /* not present */ } return true; }
    await fs.promises.writeFile(f + '.tmp', value, 'utf8');
    await fs.promises.rename(f + '.tmp', f);
    return true;
  });
  ipcMain.handle('store:clear', async () => {
    for (const n of await fs.promises.readdir(storeDir)) { try { await fs.promises.unlink(path.join(storeDir, n)); } catch (err) { /* ignore */ } }
    return true;
  });
  // 保存到本机 / 从本机导入：都由用户在界面上发起
  ipcMain.handle('host:info', async () => ({ dataDir, exportDir, width: winW, height: winH }));
  ipcMain.handle('host:pickSave', async (e, name) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(exportDir, name) });
    return r.canceled ? null : r.filePath;
  });
  ipcMain.handle('host:pickOpen', async () => {
    const r = await dialog.showOpenDialog(win, { defaultPath: exportDir, properties: ['openFile'] });
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
  });
  ipcMain.handle('host:writeFile', async (e, file, text) => {
    try {
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(file, text, 'utf8');
      return { ok: true, path: file };
    } catch (err) { return { ok: false, error: String(err.message || err) }; }
  });
  ipcMain.handle('host:readFile', async (e, file) => {
    try {
      const st = await fs.promises.stat(file);
      if (st.size > 256 * 1024 * 1024) return { ok: false, error: '文件过大' };
      return { ok: true, text: await fs.promises.readFile(file, 'utf8'), name: path.basename(file) };
    } catch (err) { return { ok: false, error: String(err.message || err) }; }
  });
  ipcMain.handle('host:listExports', async () => {
    try { return (await fs.promises.readdir(exportDir)).map(n => path.join(exportDir, n)); } catch (err) { return []; }
  });

  const ses = session.fromPartition('persist:nos-browser');
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'fullscreen' || permission === 'pointerLock' || permission === 'clipboard-sanitized-write'));
  ses.on('will-download', (ev, item) => {
    const info = { url: item.getURL(), name: item.getFilename() };
    ev.preventDefault();
    if (win) win.webContents.send('browser:download-blocked', info);
  });

  createWindow();
});

// 浏览器网页视图：不给网页任何宿主能力；网页想开新窗口时改为在作品内新建标签
app.on('web-contents-created', (e, contents) => {
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      if (win && /^https?:/i.test(url)) win.webContents.send('browser:new-window', { url, opener: contents.id });
      return { action: 'deny' };
    });
  }
  contents.on('will-attach-webview', (ev, webPreferences, params) => {
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
  });
});
app.on('window-all-closed', () => app.quit());
