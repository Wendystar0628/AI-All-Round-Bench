const { contextBridge, ipcRenderer } = require('electron');

const args = { dataDir: null, width: 1600, height: 1000, port: 19106 };
for (let i = 1; i < process.argv.length; i++) {
  const a = process.argv[i];
  const eq = a.indexOf('=');
  const key = eq >= 0 ? a.slice(0, eq) : a;
  const val = eq >= 0 ? a.slice(eq + 1) : (process.argv[i + 1] || '');
  if (key === '--data-dir') { args.dataDir = val; i++; }
  else if (key === '--width') { args.width = parseInt(val, 10) || 1600; i++; }
  else if (key === '--height') { args.height = parseInt(val, 10) || 1000; i++; }
  else if (key === '--remote-debugging-port') { args.port = parseInt(val, 10) || 19106; i++; }
}

contextBridge.exposeInMainWorld('__NOS__', {
  args,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome }
});