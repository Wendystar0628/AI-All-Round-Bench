'use strict';
/*
 * Electron 主进程：创建主窗口、提供 nos:// 协议（项目文件）、读写数据目录、加载系统模板。
 *
 * 启动参数：
 *   --data-dir <目录>     独立的测试数据目录（默认：用户数据目录下的 nested-os-data）
 *   --width <像素>        主窗口客户区宽度（默认 1280）
 *   --height <像素>       主窗口客户区高度（默认 800）
 *   --remote-debugging-port=<端口>  调试端口（Electron 原生参数）
 */
const { app, BrowserWindow, ipcMain, protocol, net, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..', '..');

protocol.registerSchemesAsPrivileged([
  { scheme: 'nos', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// 图形与后台节流：窗口被完全遮挡时仍保持渲染与定时器运行。
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      out[a.slice(2)] = argv[++i];
    } else {
      out[a.slice(2)] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(1));
const WIDTH = Number(args.width) || 1280;
const HEIGHT = Number(args.height) || 800;
let DATA_DIR = null;

function dataFile(name) {
  return path.join(DATA_DIR, name);
}

function readDataFile(name) {
  try {
    return fs.readFileSync(dataFile(name), 'utf8');
  } catch (e) {
    return null;
  }
}

function writeDataFile(name, text) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(dataFile(name), text, 'utf8');
  return true;
}

// 模板：项目 assets 下的各目录映射到系统磁盘的路径。
const TEMPLATE_DIRS = [
  ['assets/system', '/System'],
  ['assets/demo', '/Demo'],
  ['assets/documents', '/Documents'],
  ['assets/programs', '/Programs'],
  ['assets/flight', '/Flight'],
];
const TEXT_EXT = new Set(['.ns', '.nobj', '.json', '.txt', '.md', '.scene', '.sheet', '.snap', '.html']);

function walk(dir, prefix, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const vp = prefix + '/' + ent.name;
    if (ent.isDirectory()) walk(full, vp, out);
    else if (TEXT_EXT.has(path.extname(ent.name).toLowerCase())) out[vp] = fs.readFileSync(full, 'utf8');
  }
}

function loadTemplate() {
  const out = {};
  for (const [src, dst] of TEMPLATE_DIRS) {
    const dir = path.join(ROOT, src);
    if (fs.existsSync(dir)) walk(dir, dst, out);
  }
  return out;
}

function createWindow() {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    useContentSize: true,
    title: 'Nested OS',
    backgroundColor: '#1b1d2a',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      backgroundThrottling: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL('nos://app/src/renderer/index.html');
  return win;
}

app.on('web-contents-created', (_event, contents) => {
  // 网页视图（<webview>）的安全限制：不允许 Node、不允许预加载脚本，新窗口由渲染进程处理。
  contents.on('will-attach-webview', (ev, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    params.allowpopups = 'false';
  });
  contents.setWindowOpenHandler(({ url }) => {
    return { action: 'deny' };
  });
});

app.whenReady().then(() => {
  DATA_DIR = args['data-dir'] ? path.resolve(String(args['data-dir'])) : path.join(app.getPath('userData'), 'nested-os-data');
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // 项目文件：不缓存（便于开发时直接改动后重新加载）
  const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
  protocol.handle('nos', (req) => {
    const u = new URL(req.url);
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) return new Response('not found', { status: 404 });
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    return new Response(fs.readFileSync(file), { headers: { 'content-type': type, 'cache-control': 'no-store' } });
  });

  ipcMain.handle('template:load', () => loadTemplate());
  ipcMain.handle('disk:load', () => readDataFile('root-disk.json'));
  ipcMain.handle('disk:save', (_e, text) => writeDataFile('root-disk.json', text));
  ipcMain.handle('disk:reset', () => {
    try { fs.unlinkSync(dataFile('root-disk.json')); } catch (e) { /* 不存在 */ }
    return true;
  });
  ipcMain.handle('host:info', () => ({ dataDir: DATA_DIR, width: WIDTH, height: HEIGHT }));
  ipcMain.handle('host:save-local', async (_e, name, text) => {
    const r = await dialog.showSaveDialog({ defaultPath: name, title: '保存到本机' });
    if (r.canceled || !r.filePath) return { ok: false, error: '已取消' };
    fs.writeFileSync(r.filePath, text, 'utf8');
    return { ok: true, path: r.filePath };
  });
  ipcMain.handle('host:import-local', async () => {
    const r = await dialog.showOpenDialog({ title: '从本机导入', properties: ['openFile'] });
    if (r.canceled || !r.filePaths.length) return { ok: false, error: '已取消' };
    return { ok: true, name: path.basename(r.filePaths[0]), text: fs.readFileSync(r.filePaths[0], 'utf8') };
  });
  ipcMain.handle('host:open-external', (_e, url) => {
    // 只允许 http/https 的外部链接，且交给系统浏览器（仅用于帮助页中的链接）
    if (/^https?:\/\//.test(String(url))) shell.openExternal(String(url));
    return true;
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
