const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(1);
function argument(name, fallback) {
  const item = args.find(arg => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (!item) return fallback;
  if (item.includes('=')) return item.slice(item.indexOf('=') + 1);
  const index = args.indexOf(item);
  return args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
}
const dataDir = path.resolve(argument('data-dir', path.join(__dirname, '.runtime')));
const width = Number(argument('width', 1600));
const height = Number(argument('height', 1000));
fs.mkdirSync(dataDir, { recursive: true });
app.setPath('userData', dataDir);
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Nested OS',
    width,
    height,
    minWidth: 1100,
    minHeight: 700,
    useContentSize: true,
    backgroundColor: '#11101d',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      backgroundThrottling: false,
      spellcheck: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('did-attach-webview', contents => {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) contents.loadURL(url);
      return { action: 'deny' };
    });
  });
}

app.whenReady().then(() => {
  ipcMain.handle('host:load', async () => {
    const file = path.join(dataDir, 'state.json');
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  });
  ipcMain.handle('host:save', async (_event, state) => {
    const file = path.join(dataDir, 'state.json');
    const temp = path.join(dataDir, 'state.tmp');
    fs.writeFileSync(temp, JSON.stringify(state));
    fs.renameSync(temp, file);
    return true;
  });
  ipcMain.handle('host:export', async (_event, { name, content }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(dataDir, name || 'export.json'),
      filters: [{ name: 'NEXUS 文件', extensions: ['json', 'scene', 'sheet', 'os', 'txt'] }]
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, content, 'utf8');
    return true;
  });
  ipcMain.handle('host:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: '可导入文件', extensions: ['json', 'scene', 'sheet', 'os', 'txt', 'md'] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    return { name: path.basename(filePath), content: fs.readFileSync(filePath, 'utf8') };
  });
  createWindow();
  setInterval(() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('host:tick'); }, 50);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
