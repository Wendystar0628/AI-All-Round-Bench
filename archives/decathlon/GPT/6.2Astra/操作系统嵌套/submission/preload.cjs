const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("stationProfile",{
  load:()=>ipcRenderer.sendSync("station-profile","load"),
  save:data=>ipcRenderer.sendSync("station-profile","save",data),
  reset:()=>ipcRenderer.sendSync("station-profile","reset")
});
contextBridge.exposeInMainWorld("guestNavigation", {
  onOpen: (fn) => ipcRenderer.on("tab-open", (_, id, url) => fn(id, url)),
});
