const { ipcRenderer, contextBridge } = require('electron');
window.NOS_HOST = {
  dataDir: () => ipcRenderer.invoke('data-dir'),
  exportFile: (name, content, binary) => ipcRenderer.invoke('export-file', name, content, binary),
  importFile: () => ipcRenderer.invoke('import-file')
};
