const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const PORT = 18106;

function parseArgs() {
  const argv = process.argv.slice(1);
  const out = { dataDir: null, width: 1600, height: 1000, port: 19106 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf('=');
    const key = eq >= 0 ? a.slice(0, eq) : a;
    const val = eq >= 0 ? a.slice(eq + 1) : (i + 1 < argv.length ? argv[i + 1] : '');
    if (key === '--data-dir') { out.dataDir = val; if (eq < 0) i++; }
    else if (key === '--width') { out.width = parseInt(val, 10) || out.width; if (eq < 0) i++; }
    else if (key === '--height') { out.height = parseInt(val, 10) || out.height; if (eq < 0) i++; }
    else if (key.startsWith('--remote-debugging-port')) {
      const v = eq >= 0 ? val : '';
      if (v) out.port = parseInt(v, 10) || out.port;
    }
  }
  return out;
}

const args = parseArgs();
let dataDir = args.dataDir ? path.resolve(args.dataDir) : path.join(app.getPath('userData'), 'nested-os-data');

function ensureDir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch (e) {} }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8'
};

function safeJoin(base, target) {
  const p = path.normalize(path.join(base, decodeURIComponent(target)));
  if (!p.startsWith(path.normalize(base))) return null;
  return p;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const parsed = url.parse(req.url, true);
        const p = decodeURIComponent(parsed.pathname || '/');
        if (p === '/api/state' && req.method === 'GET') {
          const f = path.join(dataDir, 'state.json');
          let data = null;
          try { data = fs.readFileSync(f, 'utf8'); } catch (e) {}
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(data || 'null');
          return;
        }
        if (p === '/api/state' && (req.method === 'PUT' || req.method === 'POST')) {
          let body = '';
          req.on('data', c => { body += c; if (body.length > 200 * 1024 * 1024) req.destroy(); });
          req.on('end', () => {
            try {
              ensureDir(dataDir);
              const tmp = path.join(dataDir, 'state.tmp');
              fs.writeFileSync(tmp, body);
              fs.renameSync(tmp, path.join(dataDir, 'state.json'));
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end('{"ok":true}');
            } catch (e) {
              res.writeHead(500); res.end('{"ok":false}');
            }
          });
          return;
        }
        if (p === '/api/reset' && req.method === 'POST') {
          try { fs.unlinkSync(path.join(dataDir, 'state.json')); } catch (e) {}
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
          return;
        }
        if (p === '/api/info') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ dataDir, args }));
          return;
        }
        let file = p === '/' ? '/index.html' : p;
        const full = safeJoin(ROOT, file);
        if (!full || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
          res.writeHead(404); res.end('not found'); return;
        }
        const ext = path.extname(full).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
          'Cross-Origin-Opener-Policy': 'same-origin'
        });
        fs.createReadStream(full).pipe(res);
      } catch (e) {
        res.writeHead(500); res.end('error');
      }
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: args.width,
    height: args.height,
    minWidth: 900,
    minHeight: 600,
    title: 'Nested OS',
    backgroundColor: '#0b1020',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.loadURL(`http://127.0.0.1:${PORT}/index.html`);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(async () => {
  ensureDir(dataDir);
  try {
    await startServer();
  } catch (e) {
    console.error('server failed', e);
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});