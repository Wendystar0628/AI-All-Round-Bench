/* 预加载脚本：向渲染进程暴露少量宿主能力（文件另存/导入等） */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nestedHost', {
  dataDir: () => ipcRenderer.invoke('nested-os:data-dir'),
  saveFile: (defaultName, content) => ipcRenderer.invoke('nested-os:save-file', { defaultName, content }),
  openFile: (filters) => ipcRenderer.invoke('nested-os:open-file', { filters }),
  exists: (p) => ipcRenderer.invoke('nested-os:exists', p),
  readFile: (p) => ipcRenderer.invoke('nested-os:read-file', p),
  writeFile: (p, content) => ipcRenderer.invoke('nested-os:write-file', { path: p, content }),
  platform: process.platform,
});
