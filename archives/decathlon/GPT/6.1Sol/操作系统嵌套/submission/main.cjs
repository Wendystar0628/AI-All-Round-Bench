const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs"),
  path = require("path"),
  os = require("os");
const arg = (name, fallback) => {
  let i = process.argv.indexOf("--" + name);
  let inline = process.argv.find((a) => a.startsWith("--" + name + "="));
  return inline
    ? inline.split("=").slice(1).join("=")
    : i >= 0
      ? process.argv[i + 1]
      : fallback;
};
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
app.commandLine.appendSwitch(
  "remote-debugging-port",
  arg("remote-debugging-port", "19106"),
);
const dataDir = path.resolve(
  arg("data-dir", path.join(os.tmpdir(), "nest-os-data")),
);
app.setPath("userData", dataDir);
let win;
app.whenReady().then(() => {
  fs.mkdirSync(dataDir, { recursive: true });
  win = new BrowserWindow({
    title: "栖境 NEST · Nested OS",
    width: +arg("width", 1600),
    height: +arg("height", 1000),
    useContentSize: true,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#172936",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      backgroundThrottling: false,
    },
  });
  win.webContents.on("will-attach-webview", (event, prefs, params) => {
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.backgroundThrottling = false;
    delete prefs.preload;
    if (!/^https?:\/\//.test(params.src)) event.preventDefault();
  });
  win.setPosition(0, 0);
  win.once("ready-to-show", () => win.show());
  win.loadFile("index.html");
});
app.on("web-contents-created", (_, contents) => {
  if (contents.getType() === "webview") {
    contents.setWindowOpenHandler(({ url }) => {
      win?.webContents.send("browser-popup", url);
      return { action: "deny" };
    });
  }
});
ipcMain.handle("load", () => {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(dataDir, "state.json"), "utf8"),
    );
  } catch {
    return null;
  }
});
ipcMain.handle("save", (_, state) => {
  fs.writeFileSync(path.join(dataDir, "state.json.tmp"), JSON.stringify(state));
  fs.renameSync(
    path.join(dataDir, "state.json.tmp"),
    path.join(dataDir, "state.json"),
  );
  return true;
});
ipcMain.handle("export", async (_, name, text) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: name });
  if (!r.canceled) {
    fs.writeFileSync(r.filePath, text);
    return true;
  }
  return false;
});
ipcMain.handle("import", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openFile"] });
  if (r.canceled) return null;
  return {
    name: path.basename(r.filePaths[0]),
    text: fs.readFileSync(r.filePaths[0], "utf8"),
  };
});
app.on("window-all-closed", () => app.quit());
