// 嵌套操作系统 - Electron 主进程
// 负责：解析启动参数、启动本地静态服务器（端口 18106）、创建主窗口、提供数据目录
const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const ROOT = __dirname;
const APP_DIR = path.join(ROOT, 'app');

function parseArgs() {
  const args = process.argv.slice(1);
  const out = { dataDir: null, width: 1440, height: 900, port: 19106 };
  for (const a of args) {
    let m = a.match(/^--data-dir=(.*)$/); if (m) { out.dataDir = m[1]; continue; }
    m = a.match(/^--width=(\d+)$/); if (m) { out.width = parseInt(m[1], 10); continue; }
    m = a.match(/^--height=(\d+)$/); if (m) { out.height = parseInt(m[1], 10); continue; }
    m = a.match(/^--remote-debugging-port=(\d+)$/); if (m) { out.port = parseInt(m[1], 10); continue; }
  }
  return out;
}

const OPTS = parseArgs();
const DATA_DIR = OPTS.dataDir || path.join(app.getPath('userData'), 'data');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.osprog': 'text/plain; charset=utf-8', '.scene': 'application/json; charset=utf-8',
  '.sheet': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.map': 'application/json'
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const file = path.join(APP_DIR, path.normalize(urlPath).replace(/^([\\/])+/, ''));
      if (!file.startsWith(APP_DIR)) { res.writeHead(403); res.end('forbidden'); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    server.listen(18106, '127.0.0.1', () => resolve(server));
  });
}

let mainWindow = null;

async function createWindow() {
  await startServer();
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}

  mainWindow = new BrowserWindow({
    width: OPTS.width, height: OPTS.height,
    useContentSize: true,
    title: 'Nested OS',
    backgroundColor: '#101418',
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      webviewTag: true,
      webSecurity: true
    }
  });
  // 被盖住时也要继续运行与绘制
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

  const q = new URLSearchParams({
    dataDir: DATA_DIR,
    platform: 'electron',
    width: String(OPTS.width), height: String(OPTS.height)
  });
  mainWindow.loadURL('http://127.0.0.1:18106/index.html?' + q.toString());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders((d, cb) => { cb({ requestHeaders: d.requestHeaders }); });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('os:saveFile', async (ev, name, content) => {
  const dir = path.join(DATA_DIR, 'exports');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, path.basename(name));
  fs.writeFileSync(p, content, 'utf8');
  return p;
});
ipcMain.handle('os:readFile', async (ev, p) => {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
});
ipcMain.handle('os:dataDir', async () => DATA_DIR);
