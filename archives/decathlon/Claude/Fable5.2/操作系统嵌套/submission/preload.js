'use strict';
// 只向根系统桌面（作品自己的界面）暴露有限的宿主接口；外部网页所在的 webview 不加载本文件。
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hostBridge', {
  storeGet: (k) => ipcRenderer.invoke('store:get', k),
  storeSet: (k, v) => ipcRenderer.invoke('store:set', k, v),
  storeClear: () => ipcRenderer.invoke('store:clear'),
  info: () => ipcRenderer.invoke('host:info'),
  pickSave: (name) => ipcRenderer.invoke('host:pickSave', name),
  pickOpen: () => ipcRenderer.invoke('host:pickOpen'),
  writeFile: (file, text) => ipcRenderer.invoke('host:writeFile', file, text),
  readFile: (file) => ipcRenderer.invoke('host:readFile', file),
  listExports: () => ipcRenderer.invoke('host:listExports'),
  onNewWindow: (cb) => ipcRenderer.on('browser:new-window', (e, d) => cb(d)),
  onDownloadBlocked: (cb) => ipcRenderer.on('browser:download-blocked', (e, d) => cb(d))
});
