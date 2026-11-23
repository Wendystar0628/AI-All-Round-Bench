const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('host', {
  load: () => ipcRenderer.invoke('host:load'),
  save: state => ipcRenderer.invoke('host:save', state),
  exportFile: (name, content) => ipcRenderer.invoke('host:export', { name, content }),
  importFile: () => ipcRenderer.invoke('host:import'),
  onTick: callback => ipcRenderer.on('host:tick', () => callback()),
  platform: process.platform
});
