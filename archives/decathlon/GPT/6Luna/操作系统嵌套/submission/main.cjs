const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
let win;
function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; }
const dataDir = path.resolve(arg('--data-dir', path.join(app.getPath('userData'), 'data')));
const fixture = path.join(__dirname, 'fixtures');
protocol.registerSchemesAsPrivileged([{scheme:'nestedos',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,codeCache:true}}]);
function copyTree(src, dst) { fs.mkdirSync(dst, {recursive:true}); for (const e of fs.readdirSync(src,{withFileTypes:true})) { const a=path.join(src,e.name), b=path.join(dst,e.name); e.isDirectory()?copyTree(a,b):fs.copyFileSync(a,b); } }
function systemRoot(id){const key=String(id||'outer'),base=path.resolve(dataDir,key==='outer'?'outer':key);if(key!=='outer'&&!fs.existsSync(base))copyTree(fixture,base);return base;}
function resolveSystemPath(id,p){const base=systemRoot(id),rel=String(p||'/').replace(/^\/+/,''),full=path.resolve(base,rel);if(full!==base&&!full.startsWith(base+path.sep))throw Error('Path outside system');return {base,full};}
app.whenReady().then(()=>{
  protocol.handle('nestedos', request=>{const pathname=decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/,''),file=path.resolve(__dirname,pathname);if(!file.startsWith(path.resolve(__dirname)+path.sep))return new Response('Not found',{status:404});try{const body=fs.readFileSync(file),ext=path.extname(file).toLowerCase(),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};return new Response(body,{headers:{'content-type':types[ext]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}});
  fs.mkdirSync(dataDir,{recursive:true}); systemRoot('outer');
  win = new BrowserWindow({width:+arg('--width','1440'),height:+arg('--height','900'),minWidth:900,minHeight:600,backgroundColor:'#07121f',title:'Nested OS',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,webviewTag:true,sandbox:false,backgroundThrottling:false}});
  const portArg=process.argv.find(x=>x.startsWith('--remote-debugging-port=')); if(portArg) app.commandLine.appendSwitch('remote-debugging-port',portArg.split('=')[1]);
  win.loadURL('nestedos://app/index.html');
});
ipcMain.handle('data-dir',()=>dataDir);
ipcMain.handle('read-file',(_,sid,p)=>{const {full}=resolveSystemPath(sid,p);return fs.readFileSync(full,'utf8');});
ipcMain.handle('write-file',(_,sid,p,data)=>{const {full}=resolveSystemPath(sid,p);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,String(data),'utf8');return true;});
ipcMain.handle('list-files',(_,sid,p)=>{const {base,full}=resolveSystemPath(sid,p);const rel=String(p||'/').replace(/^\/+/,''),trash=rel==='Recycle Bin';if(trash){const bin=path.join(base,'.trash');fs.mkdirSync(bin,{recursive:true});return fs.readdirSync(bin,{withFileTypes:true}).map(e=>({name:e.name,path:'/Recycle Bin/'+e.name,dir:e.isDirectory(),trash:true}));}fs.mkdirSync(full,{recursive:true});return fs.readdirSync(full,{withFileTypes:true}).filter(e=>e.name!=='.trash').map(e=>({name:e.name,path:'/'+path.posix.join(rel.split(path.sep).join('/'),e.name).replace(/^\/+/,''),dir:e.isDirectory(),size:e.isFile()?fs.statSync(path.join(full,e.name)).size:0}));});
ipcMain.handle('make-dir',(_,sid,p)=>{const {full}=resolveSystemPath(sid,p);fs.mkdirSync(full,{recursive:true});return true;});
ipcMain.handle('trash-file',(_,sid,p)=>{const {base,full}=resolveSystemPath(sid,p);if(!fs.existsSync(full))throw Error('File not found');const bin=path.join(base,'.trash');fs.mkdirSync(bin,{recursive:true});let dest=path.join(bin,path.basename(full));if(fs.existsSync(dest))dest=path.join(bin,Date.now()+'-'+path.basename(full));fs.renameSync(full,dest);return path.basename(dest);});
ipcMain.handle('restore-file',(_,sid,name)=>{const base=systemRoot(sid),safe=path.basename(String(name)),src=path.join(base,'.trash',safe),dest=path.join(base,'Documents',safe);if(!fs.existsSync(src))throw Error('Trash item not found');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.renameSync(src,dest);return '/Documents/'+safe;});
ipcMain.handle('write-state',(_,name,val)=>{const p=path.join(dataDir,'outer','.state',name+'.json');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(val));return true;});
ipcMain.handle('read-state',(_,name)=>{try{return JSON.parse(fs.readFileSync(path.join(dataDir,'outer','.state',name+'.json'),'utf8'));}catch{return null;}});
