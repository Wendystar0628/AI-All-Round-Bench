'use strict';
// 预加载脚本：向渲染进程提供有限的宿主接口（磁盘持久化、模板、本机文件对话框）。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hostAPI', {
  loadTemplate: () => ipcRenderer.invoke('template:load'),
  loadRootDisk: () => ipcRenderer.invoke('disk:load'),
  saveRootDisk: (text) => ipcRenderer.invoke('disk:save', text),
  resetRootDisk: () => ipcRenderer.invoke('disk:reset'),
  info: () => ipcRenderer.invoke('host:info'),
  saveLocal: (name, text) => ipcRenderer.invoke('host:save-local', name, text),
  importLocal: () => ipcRenderer.invoke('host:import-local'),
  openExternal: (url) => ipcRenderer.invoke('host:open-external', url),
});
