const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hostBridge', {
  platform: process.platform,
  versions: { chrome: process.versions.chrome, electron: process.versions.electron },
  exportFile: (payload) => ipcRenderer.invoke('aerolith:export-file', payload),
  importFile: () => ipcRenderer.invoke('aerolith:import-file')
});
