'use strict';
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

// ---- 命令行参数解析（必须在 app ready 之前处理）----
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (k.includes('=')) {
        const [kk, vv] = k.split(/=(.*)/s);
        out[kk] = vv;
      } else {
        const v = argv[i + 1];
        if (v !== undefined && !String(v).startsWith('--')) { out[k] = v; i++; }
        else out[k] = true;
      }
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const dataDir = typeof args['data-dir'] === 'string' ? args['data-dir'] : null;
const winWidth = parseInt(args.width, 10) || 1600;
const winHeight = parseInt(args.height, 10) || 900;
const dbgPort = typeof args['remote-debugging-port'] === 'string' ? args['remote-debugging-port']
  : (typeof args['remote-debugging-port'] === 'boolean' ? '19106' : null);

// 关闭后台节流：被遮挡时仍保持运行与绘制
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
if (dbgPort) {
  app.commandLine.appendSwitch('remote-debugging-port', String(dbgPort));
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minWidth: 900,
    minHeight: 600,
    title: 'Nested OS',
    backgroundColor: '#0b0e1a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      backgroundThrottling: false,
      spellcheck: false,
      devTools: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

app.whenReady().then(() => {
  // 允许 webview 加载外部站点
  const ses = session.defaultSession;
  try {
    ses.setPermissionRequestHandler((wc, permission, callback) => {
      if (permission === 'media' || permission === 'fullscreen' || permission === 'notifications') callback(true);
      else callback(false);
    });
  } catch (e) {}
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { app.quit(); });

// 供 renderer 使用的路径信息
global.__nosDataDir = dataDir;
app.on('browser-window-created', (_, win) => {
  try { win.webContents.executeJavaScript(`window.__NOS_DATA_DIR__ = ${JSON.stringify(dataDir)};`).catch(()=>{}); } catch (e) {}
});
