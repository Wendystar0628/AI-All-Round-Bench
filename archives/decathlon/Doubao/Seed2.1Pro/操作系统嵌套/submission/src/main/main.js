const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const argv = process.argv.slice(2);
function getArg(name) {
  const eq = argv.find(a => a.startsWith('--' + name + '='));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf('--' + name);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
  return null;
}

let dataDir = getArg('data-dir');
if (!dataDir) {
  dataDir = path.join(app.getPath('userData'), 'nestedos-data');
}
try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}

let width = parseInt(getArg('width') || '1440', 10);
let height = parseInt(getArg('height') || '900', 10);
if (!Number.isFinite(width) || width < 800) width = 1440;
if (!Number.isFinite(height) || height < 600) height = 900;

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    title: 'Nested OS',
    backgroundColor: '#1a1730',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      backgroundThrottling: false,
      offscreen: false,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('enable-webgl2-compute-context');

app.whenReady().then(createWindow);

app.on('window-all-closed', () => app.quit());

ipcMain.handle('data-dir', () => dataDir);

ipcMain.handle('export-file', async (_e, name, content, binary) => {
  const r = await dialog.showSaveDialog(mainWindow, { defaultPath: name });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try {
    if (binary) fs.writeFileSync(r.filePath, Buffer.from(content));
    else fs.writeFileSync(r.filePath, content);
    return { ok: true, path: r.filePath };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('import-file', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
  try {
    const buf = fs.readFileSync(r.filePaths[0]);
    return { ok: true, name: path.basename(r.filePaths[0]), content: buf.toString('base64') };
  } catch (e) { return { ok: false, error: String(e) }; }
});
