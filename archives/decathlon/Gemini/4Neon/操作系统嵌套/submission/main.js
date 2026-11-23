// Electron Main Process for Nested OS
const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Parse CLI flags (--data-dir, --width, --height, --remote-debugging-port)
function parseCliArgs(argv) {
  const opts = {
    dataDir: null,
    width: 1440,
    height: 900,
    remoteDebuggingPort: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--data-dir' && argv[i + 1]) {
      opts.dataDir = path.resolve(argv[++i]);
    } else if (a.startsWith('--data-dir=')) {
      opts.dataDir = path.resolve(a.slice('--data-dir='.length));
    } else if (a === '--width' && argv[i + 1]) {
      opts.width = Math.max(800, parseInt(argv[++i], 10) || 1440);
    } else if (a.startsWith('--width=')) {
      opts.width = Math.max(800, parseInt(a.slice('--width='.length), 10) || 1440);
    } else if (a === '--height' && argv[i + 1]) {
      opts.height = Math.max(600, parseInt(argv[++i], 10) || 900);
    } else if (a.startsWith('--height=')) {
      opts.height = Math.max(600, parseInt(a.slice('--height='.length), 10) || 900);
    } else if (a === '--remote-debugging-port' && argv[i + 1]) {
      opts.remoteDebuggingPort = argv[++i];
    } else if (a.startsWith('--remote-debugging-port=')) {
      opts.remoteDebuggingPort = a.slice('--remote-debugging-port='.length);
    }
  }
  return opts;
}

const cli = parseCliArgs(process.argv);

// Prevent Windows Chromium window-occlusion pausing, timer throttling, or blank <webview>!
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (cli.remoteDebuggingPort) {
  app.commandLine.appendSwitch('remote-debugging-port', String(cli.remoteDebuggingPort));
}

// Isolate runtime data completely inside --data-dir (or OS temp dir if not provided), NEVER in project source!
const runtimeDataDir = cli.dataDir || path.join(os.tmpdir(), 'nested-os-runtime-data');
fs.mkdirSync(runtimeDataDir, { recursive: true });
app.setPath('userData', path.join(runtimeDataDir, 'electron-profile'));

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: cli.width,
    height: cli.height,
    useContentSize: true,
    title: 'Nested OS',
    backgroundColor: '#0b132b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      backgroundThrottling: false,
      additionalArguments: [`--nested-data-dir=${runtimeDataDir}`],
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // Enforce strict security isolation for external <webview> pages (2.5)
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences) => {
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.backgroundThrottling = false;
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

// Intercept window.open / target="_blank" inside ANY <webview> -> open as tab inside our root browser!
app.on('web-contents-created', (event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      if (mainWindow && !mainWindow.isDestroyed() && url) {
        mainWindow.webContents.send('browser:open-tab-url', url);
      }
      return { action: 'deny' };
    });
  }
});

// IPC for host file export/import (2.11)
ipcMain.handle('host:export-file', async (_e, defaultName, content) => {
  if (!mainWindow) return { ok: false, canceled: true };
  const res = await dialog.showSaveDialog(mainWindow, {
    title: '导出文件到本机',
    defaultPath: defaultName || 'export.txt',
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(res.filePath, String(content ?? ''), 'utf8');
  return { ok: true, filePath: res.filePath };
});

ipcMain.handle('host:import-file', async () => {
  if (!mainWindow) return { ok: false, canceled: true };
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '从本机导入文件',
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths?.length) return { ok: false, canceled: true };
  const fp = res.filePaths[0];
  const content = fs.readFileSync(fp, 'utf8');
  return { ok: true, name: path.basename(fp), content };
});

app.whenReady().then(() => {
  // Ensure clean user-agent for external browser partition
  const bSess = session.fromPartition('persist:nestedos-browser');
  bSess.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  );
  createMainWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
