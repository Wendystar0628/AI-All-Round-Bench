const { app, BrowserWindow, session, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');

function readArg(name, fallback) {
  const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const isolatedData = readArg('--data-dir', null);
if (isolatedData) app.setPath('userData', path.resolve(isolatedData));

app.whenReady().then(() => {
  const width = Math.max(1024, Number(readArg('--width', 1600)) || 1600);
  const height = Math.max(700, Number(readArg('--height', 960)) || 960);
  const win = new BrowserWindow({
    width,
    height,
    minWidth: 1024,
    minHeight: 700,
    title: 'Nested OS · AEROLITH',
    backgroundColor: '#07101f',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      backgroundThrottling: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());

  win.webContents.on('will-attach-webview', (_event, prefs) => {
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    delete prefs.preload;
  });
  win.webContents.on('did-attach-webview', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      contents.loadURL(url);
      return { action: 'deny' };
    });
  });

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['fullscreen', 'clipboard-sanitized-write'].includes(permission));
  });
});

ipcMain.handle('aerolith:export-file', async (_event, payload) => {
  const result = await dialog.showSaveDialog({ defaultPath: payload.name || 'aerolith-export.txt' });
  if (result.canceled || !result.filePath) return { canceled:true };
  await fs.writeFile(result.filePath, payload.content || '', 'utf8');
  return { canceled:false, name:path.basename(result.filePath) };
});

ipcMain.handle('aerolith:import-file', async () => {
  const result = await dialog.showOpenDialog({ properties:['openFile'] });
  if (result.canceled || !result.filePaths[0]) return { canceled:true };
  const filePath=result.filePaths[0];
  return { canceled:false, name:path.basename(filePath), content:await fs.readFile(filePath,'utf8') };
});

app.on('window-all-closed', () => app.quit());
