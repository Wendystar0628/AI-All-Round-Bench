const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('host',{
load:()=>ipcRenderer.invoke('load-state'),
save:data=>ipcRenderer.invoke('save-state',data),
copy:value=>ipcRenderer.invoke('copy-text',value),
paste:()=>ipcRenderer.invoke('paste-text'),
importFile:()=>ipcRenderer.invoke('import'),
exportFile:file=>ipcRenderer.invoke('export',file),
window:verb=>ipcRenderer.send('shell-window',verb),
onNewTab:handler=>ipcRenderer.on('new-web-tab',(_e,id,url)=>handler(id,url))
});