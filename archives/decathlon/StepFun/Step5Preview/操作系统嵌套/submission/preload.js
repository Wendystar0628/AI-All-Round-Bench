// 预加载：向渲染进程暴露少量宿主能力（数据目录、文件存取）
const { ipcRenderer } = require('electron');
window.host = {
  platform: 'electron',
  saveFile: (name, content) => ipcRenderer.invoke('os:saveFile', name, content),
  readFile: (p) => ipcRenderer.invoke('os:readFile', p),
  dataDir: () => ipcRenderer.invoke('os:dataDir')
};
