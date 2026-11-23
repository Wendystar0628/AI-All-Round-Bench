let lastSaved="",saveError="";
function initial(reset = false) {
  for (let id of Object.keys(views)) delete views[id];
  for (let id of Object.keys(systems)) delete systems[id];
  document.querySelector("#host").replaceChildren();
  releaseScenes();
  serial = wserial = ps = 0;
  zTop = 10;
  root = createState();
  if (!reset) {
    try {
      let persisted=window.stationProfile?.load();if(persisted?.error)throw Error(persisted.error);let saved=JSON.parse(persisted?.value||localStorage.getItem("station")||"null");
      if (saved) {
        Object.assign(root, {
          files: saved.files,
          compilerBuild:saved.compilerBuild,
          settings: saved.settings,
          name: saved.name,
          widget: saved.widget,
          notifications: saved.notifications || [],
          clip: saved.clip || [],
          trash: saved.trash || {},
        });
        root.widget.until = null;
        serial = saved.serial || 0;
      }
    } catch {}
  }
  desktop(root, document.querySelector("#host"));
  refreshAll();
}
function persist() {
  try {
    const data=JSON.stringify({
        compilerBuild:root.compilerBuild,
        files: root.files,
        settings: root.settings,
        name: root.name,
        widget: root.widget,
        notifications: root.notifications,
        clip: root.clip,
        trash: root.trash,
        serial,
      });
    if(data===lastSaved)return;
    if(window.stationProfile){let result=window.stationProfile.save(data);if(result.error)throw Error(result.error)}else localStorage.setItem("station",data);
    lastSaved=data;saveError="";
  }catch(e){if(saveError!==e.message){saveError=e.message;notify(root,"保存站点数据失败 · "+e.message)}}
}
function clockLabel(s) {
  let n = new Date();
  return s.parentId
    ? fmt(s.clock)
    : String(n.getHours()).padStart(2, "0") +
        ":" +
        String(n.getMinutes()).padStart(2, "0");
}
function refreshAll() {
  for (let s of Object.values(systems)) {
    let v = views[s.id];
    if (!v) continue;
    let time = v.bar.querySelector(".bartime");
    if (time) time.textContent = clockLabel(s);
    for (let w of s.wins) {
      let ui = views[w.id];
      if (!ui) continue;
      let d = w.data;
      let owner = w.pid && pidOf(s, w.pid);
      let stopped =
        owner && ["suspended", "ended", "error"].includes(owner.state);
      ui.body.inert = !!stopped;
      if (stopped && !ui.cover) {
        ui.cover = el(
          "div",
          "proc-cover",
          "<span>" +
            esc(
              owner.error ||
                {
                  suspended: "进程已挂起",
                  ended: "进程已结束",
                  error: "程序异常",
                }[owner.state],
            ) +
            "</span>",
        );
        if (owner.state === "suspended")
          ui.cover.append(
            btn(
              "继续进程",
              () => {
                owner.state =
                  owner.prev === "waiting" && owner.queue.length
                    ? "ready"
                    : owner.prev || "ready";
              },
              null,
              s,
            ),
          );
        ui.node.append(ui.cover);
      } else if (!stopped && ui.cover) {
        ui.cover.remove();
        delete ui.cover;
      }
      if (w.appId === "tasks" && counter % 8 === 0) refreshTasks(s, w);
      if (w.appId === "editor" && d.runPid) {
        let p = pidOf(s, d.runPid),
          st = ui.body.querySelector(".status");
        if (st && p)
          st.textContent =
            "PID " +
            p.pid +
            "  /  " +
            p.state +
            "  /  " +
            (p.error || p.output.join("  ") || "执行中");
      }
      if (w.appId === "widgets") {
        let a = ui.body.querySelector(".timerlabel"),
          b = ui.body.querySelector(".watchlabel");
        if (a) a.textContent = fmt(Math.ceil(s.widget.remain));
        if (b)
          b.textContent = fmt(
            (s.widget.sw || 0) +
              (s.widget.swStart == null ? 0 : s.clock - s.widget.swStart),
          );
      }

      if (ui.update) {
        if (w.appId === "projection") {
          let src = systems[d.sid],
            source = src?.wins.find((q) => q.id === d.wid);
          if (!source) continue;

          for (let b of ui.body.querySelectorAll("button,input,select"))
            b.disabled = !!frozen(src);
          ui.update(d.surface);
        } else ui.update(d);
      }
    }
  }
}
let counter = 0;
initial();
setInterval(() => {
  counter++;
  let stepping = [];
  for (let s of Object.values(systems))
    if (s.stepOnce && !frozen(systems[s.parentId])) {
      s.state = "running";
      stepping.push(s);
      delete s.stepOnce;
    }
  for(let s of Object.values(systems))if(!frozen(s))for(let w of s.wins)if(w.appId==="charts"&&w.outbox?.length){
    while(w.outbox.length&&enqueue(s,w.data.receiver,w.outbox[0]))w.outbox.shift();
    if(!w.outbox.length)delete w.outbox;
  }
  tick(root, logicalStep);
  runNode(root, root.budget);
  for (let s of stepping) s.state = "paused";
  refreshAll();
  if (counter % 60 === 0) releaseScenes();
  if (counter % 120 === 0) persist();
}, 50);
window.addEventListener("beforeunload", persist);
document.addEventListener("copy", () => {
  let txt = getSelection()?.toString();
  if (txt) root.clip.unshift(txt);
});
window.bench = {
  version: 1,
  ready: async () => true,
  reset: async () => {
    const res=window.stationProfile?.reset();if(res?.error)throw Error(res.error);lastSaved="";localStorage.removeItem("station");
    initial(true);
    return true;
  },
  inspect: async () => {
    let out = {
      systems: [],
      windows: [],
      browsers: [],
      players: [],
      charts: [],
      projections: [],
    };
    for (let s of Object.values(systems)) {
      out.systems.push({
        id: s.id,
        parentId: s.parentId,
        name: s.name,
        state: s.state,
      });
      for (let w of s.wins) {
        out.windows.push({
          id: w.id,
          systemId: s.id,
          appId: w.appId,
          state: w.state,
          title: w.title,
        });
        let d = w.data,
          a = { windowId: w.id, systemId: s.id };
        if (w.appId === "browser")
          for (let t of d.tabs)
            out.browsers.push({
              ...a,
              tabId: t.id,
              url: t.url,
              loadState: t.loadState,
            });
        if (w.appId === "player")
          out.players.push({
            ...a,
            ...Object.fromEntries(
              [
                "state",
                "position",
                "duration",
                "rate",
                "scene",
                "frameTime",
              ].map((k) => [k, d[k]]),
            ),
          });
        if (w.appId === "charts")
          out.charts.push({
            ...a,
            ...Object.fromEntries(
              ["sourceTitle", "range", "chartType", "connectionState"].map(
                (k) => [k, d[k]],
              ),
            ),
          });
        if (w.appId === "projection")
          out.projections.push({
            ...a,
            sourceSystemId: d.sid,
            sourceWindowId: d.wid,
            sourceAppId: d.kind,
            state: w.state,
          });
      }
    }
    return out;
  },
};
