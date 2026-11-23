const { app, BrowserWindow, session, ipcMain } = require("electron");
const path = require("path"),
  os = require("os");
function arg(key, fallback) {
  const a = process.argv.find((x) => x.startsWith("--" + key + "="));
  const i = process.argv.indexOf("--" + key);
  return a ? a.slice(key.length + 3) : i >= 0 ? process.argv[i + 1] : fallback;
}
app.setPath(
  "userData",
  path.resolve(
    arg("data-dir", path.join(os.tmpdir(), "strata-station-profile")),
  ),
);
app.commandLine.appendSwitch(
  "remote-debugging-port",
  arg("remote-debugging-port", "19106"),
);
for (const flag of [
  "disable-renderer-backgrounding",
  "disable-background-timer-throttling",
  "disable-backgrounding-occluded-windows",
])
  app.commandLine.appendSwitch(flag);
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
app.on("web-contents-created", (_, c) => {
  c.setWindowOpenHandler(({ url }) => {
    if (c.getType() === "webview" && /^https?:/.test(url))
      c.hostWebContents?.send("tab-open", c.id, url);
    return { action: "deny" };
  });
  c.on("will-attach-webview", (e, p, params) => {
    delete p.preload;
    p.nodeIntegration = false;
    p.sandbox = true;
    p.contextIsolation = true;
    if (!/^(https?:|about:blank)/.test(params.src)) e.preventDefault();
  });
  if (c.getType() === "webview")
    c.on("will-navigate", (e, url) => {
      if (!/^https?:/.test(url)) e.preventDefault();
    });
});
app.whenReady().then(() => {
  const win = new BrowserWindow({
    title: "Nested OS",
    useContentSize: true,
    width: +arg("width", 1440),
    height: +arg("height", 900),
    backgroundColor: "#283e38",
    autoHideMenuBar: true,
    webPreferences: {
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  const fs=require("fs"),profile=path.join(app.getPath("userData"),"station.json");
  ipcMain.on("station-profile",(event,action,payload)=>{
    if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame){event.returnValue={error:"无权限"};return}
    try{
      if(action==="load"){event.returnValue={value:fs.existsSync(profile)?fs.readFileSync(profile,"utf8"):null};return}
      if(action==="save"){if(typeof payload!=="string")throw Error("无效数据");fs.writeFileSync(profile+".tmp",payload);fs.renameSync(profile+".tmp",profile)}
      else if(action==="reset"){fs.rmSync(profile,{force:true})}
      else throw Error("未知操作");
      event.returnValue={ok:true};
    }catch(e){event.returnValue={error:e.message}}
  });
  win.loadFile("index.html");
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  session.defaultSession.setPermissionRequestHandler((_, __, reply) =>
    reply(false),
  );
});
app.on("window-all-closed", () => app.quit());
