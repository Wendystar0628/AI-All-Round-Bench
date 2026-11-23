const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("host", {
  load: () => ipcRenderer.invoke("load"),
  save: (s) => ipcRenderer.invoke("save", s),
  export: (n, t) => ipcRenderer.invoke("export", n, t),
  import: () => ipcRenderer.invoke("import"),
  popup: (fn) => {
    const listener = (_, url) => fn(url);
    ipcRenderer.on("browser-popup", listener);
    return () => ipcRenderer.removeListener("browser-popup", listener);
  },
});
