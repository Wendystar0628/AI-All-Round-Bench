const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hostApi', {
  loadImage: () => ipcRenderer.invoke('image:load'),
  persistLoad: () => ipcRenderer.invoke('persist:load'),
  persistSave: (t) => ipcRenderer.invoke('persist:save', t),
  persistClear: () => ipcRenderer.invoke('persist:clear'),
  config: () => ipcRenderer.invoke('config:get'),
  exportFile: (name, text) => ipcRenderer.invoke('export:file', name, text),
  importList: () => ipcRenderer.invoke('import:list'),
  importFile: (p) => ipcRenderer.invoke('import:file', p),
  importBytes: (name, b64) => ipcRenderer.invoke('import:bytes', name, b64),
  showItem: (p) => ipcRenderer.invoke('shell:open', p),
  on: (ch, cb) => { const f = (e, d) => cb(d); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); },
});
