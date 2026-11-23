const {app, BrowserWindow, ipcMain, dialog, clipboard} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const option = (key, fallback) => args.find(x => x.startsWith('--' + key + '='))?.split('=').slice(1).join('=') ?? (args.includes('--' + key) ? args[args.indexOf('--' + key)+1] : fallback);
const dataDir = path.resolve(option('data-dir', path.join(app.getPath('temp'), 'strata-os-data')));
fs.mkdirSync(dataDir, {recursive:true});
app.setPath('userData', dataDir);
for (const flag of ['disable-backgrounding-occluded-windows','disable-renderer-backgrounding','disable-background-timer-throttling']) app.commandLine.appendSwitch(flag);
app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
const debugPort = option('remote-debugging-port');
if(debugPort) app.commandLine.appendSwitch('remote-debugging-port',debugPort);
const state = path.join(dataDir,'strata.json');
ipcMain.handle('load-state', () => {try {return JSON.parse(fs.readFileSync(state,'utf8'));} catch {return null;}});
ipcMain.handle('save-state', (_e,data) => {fs.writeFileSync(state+'.tmp',JSON.stringify(data));fs.renameSync(state+'.tmp',state);return true;});
ipcMain.handle('copy-text', (_e,value) => clipboard.writeText(String(value)));
ipcMain.handle('paste-text', () => clipboard.readText());
ipcMain.handle('import', async (e) => {
  const d=await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender),{properties:['openFile']});
  if(d.canceled) return null;
  return {name:path.basename(d.filePaths[0]),content:fs.readFileSync(d.filePaths[0],'utf8')};
});
ipcMain.handle('export', async (e,{name,content}) => {
  const d=await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender),{defaultPath:path.basename(name)});
  if(d.canceled) return false;
  fs.writeFileSync(d.filePath,content,'utf8');return true;
});
const webUrl = value => /^https?:\/\//i.test(value);
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview',(event,prefs,params)=>{
    delete prefs.preload; delete prefs.preloadURL;
    Object.assign(prefs,{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false});
    if(!webUrl(params.src)) event.preventDefault();
  });
  if(contents.getType()==='webview')guardGuest(contents,contents.hostWebContents);
});
function guardGuest(guest,owner){
  guest.setWindowOpenHandler(({url})=>{
    if(webUrl(url))(owner??guest.hostWebContents)?.send('new-web-tab',guest.id,url);
    return {action:'deny'};
  });
  if(guest.strataGuard)return;
  guest.strataGuard=true;
  guest.on('will-navigate',(event,url)=>{if(!webUrl(url))event.preventDefault();});
  guest.on('will-redirect',(event,url)=>{if(!webUrl(url))event.preventDefault();});
  guest.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
}
app.whenReady().then(()=>{
  const win=new BrowserWindow({title:'Strata OS · 层栈',width:+option('width',1440),height:+option('height',900),
    useContentSize:true,autoHideMenuBar:true,frame:false,backgroundColor:'#192931',
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,webviewTag:true,backgroundThrottling:false}});
  ipcMain.on('shell-window',(_e,verb)=>{if(verb==='minimize')win.minimize();if(verb==='close')win.close();if(verb==='maximize')win.isMaximized()?win.unmaximize():win.maximize();});
  win.webContents.on('did-attach-webview',(_event,guest)=>guardGuest(guest,win.webContents));
  win.loadFile('index.html');
});
app.on('window-all-closed',()=>app.quit());