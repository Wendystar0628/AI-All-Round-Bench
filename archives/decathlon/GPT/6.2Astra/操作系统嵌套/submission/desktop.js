const names = {
  files: "文件管理器",
  spreadsheet: "电子表格",
  browser: "浏览器",
  editor: "程序编辑器",
  tasks: "进程管理器",
  widgets: "小组件",
  settings: "系统设置",
  systems: "子系统控制台",
  help: "操作手册",
  player: "场景播放器",
  charts: "图表工作台",
  projection: "窗口投送",
  system: "子系统",
  custom: "程序显示器",
  notifications: "通知中心",
};
const paths = {
  files: "M3 7h7l2 3h9v10H3z M3 7V4h7l3 3h6v3",
  spreadsheet: "M3 4h18v16H3z M3 9h18 M9 9v11 M3 14h18",
  browser:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18z",
  editor: "M3 4h18v16H3z M7 9l3 3-3 3 M13 15h4",
  tasks: "M3 17V8 M7 17v-5 M11 17V4 M15 17v-7 M19 17V6 M3 21h18",
  widgets: "M3 3h8v8H3z M15 3h6v8h-6z M3 15h8v6H3z M15 15h6v6h-6z",
  settings: "M3 6h18 M3 12h18 M3 18h18 M8 3v6 M16 9v6 M10 15v6",
  systems: "M12 3l10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5",
  help: "M3 4h6l3 2 3-2h6v15h-6l-3 2-3-2H3z M12 6v14",
  player: "M3 5h18v14H3z M10 9l5 3-5 3z",
  charts: "M3 3v17h18 M7 16v-5 M12 16V7 M17 16V4",
  notifications: "M5 17h14l-2-4V9a5 5 0 0 0-10 0v4z M10 20h4",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M12 6v6l4 2",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M12 1v3 M12 20v3 M1 12h3 M20 12h3 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  plus: "M12 4v16 M4 12h16",
  close: "M5 5l14 14 M19 5L5 19",
  max: "M4 4h16v16H4z",
  min: "M4 16h16",
  projection: "M2 5h14v12H2z M9 20h12V9 M8 13l10-10 M13 3h5v5",
  system: "M12 3l10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5",
  signal: "M4 17v3 M9 13v7 M14 8v12 M19 4v16",
  trash: "M4 6h16 M7 6l1 15h8l1-15 M9 6V3h6v3",
  mount: "M2 19l7-11 4 6 3-8 6 13z",
  search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0z M15 15l6 6",
};
function icon(k, size = 20) {
  return (
    '<svg width="' +
    size +
    '" height="' +
    size +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' +
    (paths[k] || paths.files) +
    '"/></svg>'
  );
}
function logo() {
  return '<svg viewBox="0 0 48 34" width="42" height="30" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round"><path d="m2 27 13-22 12 22H2Zm12 0L29 3l16 24H14Zm7-7h19 M18 24h25 M6 31h39"/></svg>';
}
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const el = (tag, cl = "", html = "") => {
  let e = document.createElement(tag);
  e.className = cl;
  e.innerHTML = html;
  return e;
};
function mark(e, test, s, w, attrs = {}) {
  if (test) e.dataset.testid = test;
  if (s) e.dataset.systemId = s.id;
  if (w) e.dataset.windowId = w.id;
  for (let [k, v] of Object.entries(attrs)) e.dataset[k] = v;
  return e;
}
function btn(label, fn, test, s, w, cl = "") {
  let b = mark(el("button", cl, label), test, s, w);
  b.title = b.innerText || test || "";
  b.setAttribute("aria-label", b.title);
  b.applyCommand = (e) => {
    try {
      fn(e || { target: b, currentTarget: b, stopPropagation() {} });
    } catch (ex) {
      notify(s || root, ex.message);
    }
  };
  b.onclick = (e) => {
    e.stopPropagation();
    let frame = views[w?.id];
    if (
      s?.parentId &&
      w &&
      frame?.body.contains(b) &&
      !["system", "player", "charts", "projection"].includes(w.appId) &&
      s.wm
    ) {
      let controls = [...frame.body.querySelectorAll("button")];
      processMedia(s, w, {
        action: "command",
        key: b.dataset.testid || b.textContent,
        index: controls.indexOf(b),
      });
      return;
    }
    b.applyCommand(e);
  };
  return b;
}
function notify(s, msg) {
  if (!s) return;
  s.notifications.unshift({ msg: String(msg), time: s.clock });
  s.notifications.length = Math.min(s.notifications.length, 100);
  let d = views[s.id]?.desk;
  if (d && !s.settings.dnd) {
    let t = el("div", "toast", icon("notifications", 16) + esc(msg));
    d.append(t);
    setTimeout(() => t.remove(), 2800);
  }
}
function fmt(t) {
  return (
    String(Math.floor(t / 60)).padStart(2, "0") +
    ":" +
    String(Math.floor(t % 60)).padStart(2, "0")
  );
}
function apps(s) {
  return s.parentId
    ? [
        "player",
        "charts",
        "files",
        "editor",
        "tasks",
        "systems",
        "settings",
        "help",
      ]
    : [
        "files",
        "spreadsheet",
        "browser",
        "editor",
        "tasks",
        "widgets",
        "systems",
        "settings",
        "help",
      ];
}
function plate(k) {
  return '<span class="appplate ' + k + '">' + icon(k, 29) + "</span>";
}
function appIcon(s, k) {
  let e = mark(
    el("button", "launchicon", plate(k) + "<span>" + names[k] + "</span>"),
    "desktop-icon",
    s,
    null,
    { appId: k },
  );
  e.onclick = () => {
    e.parentNode
      .querySelectorAll(".sel")
      .forEach((n) => n.classList.remove("sel"));
    e.classList.add("sel");
  };
  e.ondblclick = () => openApp(s, k);
  e.onkeydown = (ev) => {
    if (ev.key === "Enter") openApp(s, k);
  };
  return e;
}
function desktop(s, parent) {
  let inner = !!s.parentId,
    d = mark(
      el("section", "desktop " + (inner ? "inner" : "")),
      "os-desktop",
      s,
    );
  parent.append(d);
  let head = el(
    "header",
    "topbar",
    '<div class="brand">' +
      logo() +
      '<b>层野</b><span>STRATA OS</span></div><div class="topmeta"><i></i> ' +
      (inner ? "嵌套节点" : "根系统") +
      "<code>/ " +
      s.id.toUpperCase() +
      '</code></div><div class="topright"><span class="edition">FIELD EDITION</span><span class="online"><i></i> 系统在线</span></div>',
  );
  d.append(head);
  let wall = el("div", "wall"),
    area = el("div", "workarea");
  d.append(wall, area);
  let hero = el(
    "div",
    "hero",
    '<div class="eyeline"><i></i> ' +
      (inner ? "FLIGHT RESEARCH NODE" : "STRATA FIELD SYSTEM") +
      "</div><h1>" +
      esc(s.name) +
      '</h1><div class="herosub">' +
      (inner ? "Flight Research Node" : "Highland Station") +
      '</div><div class="coords"><span>⌖</span> 30° 36′ N &nbsp; / &nbsp; 101° 42′ E</div>',
  );
  area.append(hero);
  if (!inner) {
    let shortcuts = el("div", "deskfiles");
    for (let [path, label, k] of [
      [PATH.book, "示例工作簿", "spreadsheet"],
      [PATH.scene, "24 号机资源", "player"],
    ]) {
      let f = mark(
        el("button", "deskfile", icon(k, 16) + "<span>" + label + "</span>"),
        "desktop-icon",
        s,
        null,
        { filePath: path },
      );
      f.title = "双击打开 · 可拖放到文件管理器";
      f.draggable = true;
      f.onclick = () => {
        for (let b of shortcuts.children) b.classList.toggle("sel", b === f);
      };
      f.ondblclick = () =>
        openFile(s, path, (p) => openApp(s, "files", { path: p }));
      f.ondragstart = (e) =>
        e.dataTransfer.setData(
          "application/strata",
          JSON.stringify({ s: s.id, paths: [path] }),
        );
      shortcuts.append(f);
    }
    hero.append(shortcuts);
  }
  let stamp = el(
    "div",
    "stamp",
    "<div><span>FIG. 01</span> / LANDSCAPE SERIES</div><b>横断山地</b><em></em>海拔 4,280 m",
  );
  area.append(stamp);
  let rack = el("div", "rack"),
    tools = el("div", "launcher"),
    title = el(
      "div",
      "sectionhead",
      '<span class="tinybox"></span><b>应用工作台</b><code>APPLICATIONS</code><small>0' +
        (inner ? 5 : 6) +
        "</small>",
    ),
    icons = el("div", "launchgrid");
  for (let k of apps(s).slice(0, inner ? 5 : 6)) icons.append(appIcon(s, k));
  tools.append(title, icons);
  let card = el(
    "div",
    "nodecard",
    '<span class="nodeglyph">' +
      icon("systems", 71) +
      '</span><div class="eyeline"><i></i> SYSTEM TREE</div><strong>子系统控制台</strong><div class="nodeactions"></div>',
  );
  card.querySelector(".nodeactions").append(
    btn(
      "启动子系统 " + icon("arrow", 15),
      () => newSystem(s),
      "system-new",
      s,
      null,
      "newnode",
    ),
    btn("管理", () => openApp(s, "systems"), null, s, null, "manage"),
  );
  rack.append(tools, card);
  area.append(rack);
  let bar = el("footer", "taskbar"),
    start = btn(
      logo() + "<b>开始</b>",
      () => menu(s),
      "start-toggle",
      s,
      null,
      "startbtn",
    ),
    pins = el("div", "pins");
  for (let k of inner
    ? ["files", "player", "charts"]
    : ["files", "browser", "spreadsheet"])
    pins.append(btn(icon(k), () => openApp(s, k), null, s, null, "pin " + k));
  let running = el("div", "running"),
    tray = el("div", "tray");
  tray.append(
    btn(
      icon("widgets", 17),
      () => togglePanel(s, "widgets"),
      "widgets-toggle",
      s,
    ),
    btn(icon("signal", 16), () => openApp(s, "tasks"), null, s),
    btn(
      icon("notifications", 17),
      () => togglePanel(s, "notifications"),
      "notifications-toggle",
      s,
    ),
    btn('<span class="bartime"></span>', () => openApp(s, "widgets"), null, s),
  );
  bar.append(start, pins, running, tray);
  d.append(bar);
  views[s.id] = { desk: d, area, bar, running, wall };
  d.addEventListener("pointerdown", (ev) => {
    if (ev.target.closest(".popup,.startbtn,.dialog")) return;
    d.querySelectorAll(":scope > .popup").forEach((e) => e.remove());
  });
  area.oncontextmenu = (e) => {
    if (e.target.closest(".win")) return;
    e.preventDefault();
    e.stopPropagation();
    let r = d.getBoundingClientRect();
    popup(
      s,
      [
        ["新建子系统", () => newSystem(s)],
        ["文件管理器", () => openApp(s, "files")],
        ["更换桌面外观", () => openApp(s, "settings")],
        ["操作手册", () => openApp(s, "help")],
      ],
      ((e.clientX - r.left) * d.clientWidth) / r.width,
      ((e.clientY - r.top) * d.clientHeight) / r.height,
    );
  };
  applySettings(s);
  for (let w of s.wins) mountWin(s,w,false);
  const front=s.wins.filter(q=>q.state!=="minimized").sort((a,b)=>b.z-a.z)[0];if(front)views[front.id]?.node.classList.add("focused");
  const observer=new ResizeObserver(()=>{if(!d.isConnected){observer.disconnect();return}for(let q of s.wins)winStyle(s,q)});observer.observe(area);
  refreshStatus(s);
  return d;
}
function applySettings(s) {
  let v = views[s.id];
  if (!v) return;
  v.desk.style.setProperty("--accent", s.settings.accent);
  v.desk.dataset.wall = s.settings.wall;
  v.desk.style.zoom = s.settings.scale;
  v.area.querySelector(".hero h1").textContent = s.name;
}
function popup(s, items, x = 12, y = null) {
  let d = views[s.id].desk;
  d.querySelectorAll(":scope>.popup").forEach((n) => n.remove());
  let p = el("div", "popup context");
  d.append(p);
  for (let [l, f] of items)
    p.append(
      btn(
        l,
        () => {
          p.remove();
          f();
        },
        null,
        s,
      ),
    );
  p.style.left = Math.max(0, Math.min(x, d.clientWidth - 200)) + "px";
  p.style.top =
    Math.max(
      0,
      Math.min(
        y ?? d.clientHeight - p.offsetHeight - 48,
        d.clientHeight - p.offsetHeight - 4,
      ),
    ) + "px";
  return p;
}
function menu(s) {
  let d = views[s.id].desk,
    old = d.querySelector(":scope>.startmenu");
  if (old) {
    old.remove();
    return;
  }
  let p = mark(
    el(
      "div",
      "popup startmenu",
      '<div class="sectionhead">' +
        logo() +
        "<b>" +
        esc(s.name) +
        '</b><code>START</code></div><label class="search">' +
        icon("search", 16) +
        '<input placeholder="搜索应用…" aria-label="搜索应用"></label><div class="menugrid"></div>',
    ),
    "start-menu",
    s,
  );
  d.append(p);
  let g = p.querySelector(".menugrid");
  for (let k of apps(s))
    g.append(
      btn(
        plate(k) + names[k],
        () => {
          p.remove();
          openApp(s, k);
        },
        "launch-" + k,
        s,
      ),
    );
  p.querySelector("input").oninput = (e) =>
    [...g.children].forEach(
      (b) => (b.hidden = !b.textContent.includes(e.target.value)),
    );
  p.querySelector("input").focus();
}
function togglePanel(s, k) {
  let q = s.wins.find((w) => w.appId === k);
  if (
    q &&
    q.state !== "minimized" &&
    views[q.id]?.node.classList.contains("focused")
  )
    minimize(s, q);
  else openApp(s, k);
}
function openApp(s, k, data = {}) {
  if (frozen(s)) return;
  let old = s.wins.find(
    (w) =>
      w.appId === k &&
      !["system", "projection", "editor", "player", "charts"].includes(k),
  );
  if (old) {
    if (data.path && old.data.path !== data.path && k === "spreadsheet") {
      if (old.data.dirty) {
        confirmBox(
          s,
          "工作簿尚未保存",
          () => {
            saveBook(s, old);
            closeWindow(s, old, true);
            openApp(s, k, data);
          },
          "保存并打开",
          () => {
            closeWindow(s, old, true);
            openApp(s, k, data);
          },
        );
        return old;
      }
      closeWindow(s, old, true);
    } else {
      if (data.path) {
        Object.assign(old.data, data);
        drawApp(s, old);
      }
      restore(s, old);
      if (["systems", "tasks", "notifications", "widgets"].includes(k))
        drawApp(s, old);
      return old;
    }
  }
  let area = views[s.id].area,
    aw = area.clientWidth,
    ah = area.clientHeight,
    i = s.wins.filter((x) => x.state !== "minimized").length;
  let width = Math.min(
      aw - 14,
      k === "system"
        ? aw * 0.9
        : k === "player"
          ? 920
          : k === "widgets"
            ? 680
            : 840,
    ),
    height = Math.min(
      ah - 14,
      k === "system" ? ah * 0.94 : k === "player" ? 590 : 540,
    );
  let w = {
    id: "win-" + ++wserial,
    systemId: s.id,
    appId: k,
    title: names[k],
    state: "normal",
    x: Math.max(4, Math.min(aw - width - 6, aw * 0.12 + (i % 4) * 24)),
    y: Math.max(3, Math.min(ah - height - 6, ah * 0.055 + (i % 4) * 18)),
    width,
    height,
    z: ++zTop,
    data: { ...data },
  };
  s.wins.push(w);
  if (!["system", "projection", "custom"].includes(k)) {
    let path = "/System/" + k + ".str";
    s.files[path] ??= "@loop\nreceive event\ngoto loop";
    w.pid = launchProgram(s, path, w.id)?.pid;
  }
  try {
    initApp(s, w);
  } catch (e) {
    s.wins = s.wins.filter((q) => q !== w);
    s.procs = s.procs.filter((p) => p.owner !== w.id);
    notify(s, e.message);
    return null;
  }
  mountWin(s, w);
  return w;
}
function raise(s, w, propagate = true) {
  if (!w) return;
  w.z = ++zTop;
  let v = views[w.id];
  if (v) v.node.style.zIndex = w.z;
  for (let q of s.wins) views[q.id]?.node.classList.toggle("focused", q === w);
  if (propagate && s.parentId) {
    let parent = systems[s.parentId],
      outer = parent.wins.find((q) => q.data.child === s.id);
    if (outer) raise(parent, outer);
  }
}
function restore(s, w) {
  if (w.state === "minimized") w.state = w.previous || "normal";
  winStyle(s, w);
  raise(s, w);
  updateBar(s);
}
function winStyle(s, w) {
  let e = views[w.id]?.node;
  if (!e) return;
  e.style.display = w.state === "minimized" ? "none" : "flex";
  let max = w.state === "maximized",
    half = w.state === "left" || w.state === "right";
  Object.assign(e.style, {
    left:
      max || w.state === "left"
        ? "0"
        : w.state === "right"
          ? "50%"
          : Math.max(0, Math.min(w.x, views[s.id].area.clientWidth - 76)) +
            "px",
    top:
      max || half
        ? "0"
        : Math.max(0, Math.min(w.y, views[s.id].area.clientHeight - 44)) + "px",
    width: max ? "100%" : half ? "50%" : w.width + "px",
    height: max || half ? "100%" : w.height + "px",
    zIndex: w.z,
  });
  e.dataset.state = w.state;
}
function updateBar(s) {
  let v = views[s.id];
  if (!v) return;
  v.running.replaceChildren();
  for (let w of s.wins) {
    let b = btn(
      icon(w.appId, 16) + "<span>" + esc(w.title) + "</span>",
      () => {
        if (
          w.state !== "minimized" &&
          views[w.id]?.node.classList.contains("focused")
        )
          minimize(s, w);
        else restore(s, w);
      },
      "taskbar-item",
      s,
      w,
      "taskitem",
    );
    v.running.append(b);
  }
}
function minimize(s, w) {
  w.previous = w.state;
  w.state = "minimized";
  views[w.id].node.classList.remove("focused");
  winStyle(s, w);
  let next = s.wins
    .filter((q) => q.state !== "minimized")
    .sort((a, b) => b.z - a.z)[0];
  if (next) raise(s, next);
  updateBar(s);
}
function maximize(s, w) {
  w.state = w.state === "maximized" ? "normal" : "maximized";
  winStyle(s, w);
}
function performFrameAction(s,w,action){
  if(action==="close")return closeWindow(s,w);
  if(action==="minimize")return minimize(s,w);
  if(action==="maximize")return maximize(s,w);
  if(action==="restore")return restore(s,w);
  if(["left","right","full"].includes(action)){w.state=action==="full"?"maximized":action;winStyle(s,w)}
}
function requestFrameAction(s,w,mode){
  if(s.wm)enqueue(s,s.wm,{action:"frame",id:w.id,mode});else performFrameAction(s,w,mode);
}
function mountWin(s, w, activate=true) {
  let area = views[s.id].area,
    node = mark(el("article", "win"), "app-window", s, w, { appId: w.appId });
  if (w.appId === "projection")
    Object.assign(node.dataset, {
      sourceSystemId: w.data.sid,
      sourceWindowId: w.data.wid,
      sourceAppId: w.data.kind,
    });
  let title = mark(
      el(
        "div",
        "titlebar",
        icon(w.appId, 16) +
          "<b>" +
          esc(w.title) +
          "</b><code>" +
          s.id.toUpperCase() +
          "</code>",
      ),
      "window-titlebar",
      s,
      w,
    ),
    controls = el("div", "winbtns");
  for (let [key, ico, fn] of [
    ["minimize", "min", () => requestFrameAction(s,w,"minimize")],
    ["maximize", "max", () => requestFrameAction(s,w,"maximize")],
    ["close", "close", () => requestFrameAction(s,w,"close")],
  ]) {
    let b = btn(icon(ico, 13), fn, "window-" + key, s, w);
    b.ariaLabel = { close: "关闭", minimize: "最小化", maximize: "最大化" }[
      key
    ];
    controls.append(b);
  }
  title.append(controls);
  let body = el("div", "winbody"),
    resize = mark(el("div", "resize"), "window-resize", s, w);
  node.append(title, body, resize);
  area.append(node);
  views[w.id] = { node, body, title };
  node.addEventListener(
    "pointerdown",
    (e) => {
      if (e.target.closest(".win") !== node) return;
      if (s.wm) {
        let r = area.getBoundingClientRect(),
          f = area.clientWidth / r.width;
        enqueue(s, s.wm, {
          action: "pointer",
          x: (e.clientX - r.left) * f,
          y: (e.clientY - r.top) * f,
          id: w.id,
          payload: { action: "focus" },
        });
        if (s.parentId) {
          let par = systems[s.parentId],
            frame = par.wins.find((q) => q.data.child === s.id);
          if (frame) raise(par, frame);
        }
      } else raise(s, w);
    },
    true,
  );
  function drag(e, mode) {
    if (e.button || e.target.closest("button") || e.detail > 1) return;
    e.stopPropagation();
    if(s.wm){let target=e.currentTarget;const post=(action,ev)=>{let r=area.getBoundingClientRect(),f=area.clientWidth/r.width;let msg={action,id:w.id,mode,x:(ev.clientX-r.left)*f,y:(ev.clientY-r.top)*f};let wm=pidOf(s,s.wm);if(!wm)return;let last=wm.queue.at(-1);if(action==="dragMove"&&last?.action===action&&last.id===w.id){wm.queue[wm.queue.length-1]=msg}else enqueue(s,s.wm,msg)};post("dragBegin",e);target.setPointerCapture(e.pointerId);target.onpointermove=ev=>post("dragMove",ev);target.onpointerup=target.onpointercancel=ev=>{post("dragEnd",ev);target.onpointermove=target.onpointerup=target.onpointercancel=null};return}
    raise(s, w);
    let r = area.getBoundingClientRect(),
      f = area.clientWidth / r.width,
      x0 = e.clientX,
      y0 = e.clientY,
      x = w.x,
      y = w.y,
      ww = w.width,
      hh = w.height,
      moved = false;
    let target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    target.onpointermove = (ev) => {
      let dx = (ev.clientX - x0) * f,
        dy = (ev.clientY - y0) * f;
      if (Math.abs(dx) + Math.abs(dy) < 3 && !moved) return;
      moved = true;
      if (w.state !== "normal") {
        w.state = "normal";
        x = (x0 - r.left) * f - w.width * 0.5;
        y = (y0 - r.top) * f - 15;
      }
      if (mode === "move") {
        w.x = Math.max(0, Math.min(area.clientWidth - 70, x + dx));
        w.y = Math.max(0, Math.min(area.clientHeight - 32, y + dy));
      } else {
        if (mode === "resize" || mode.includes("e"))
          w.width = Math.max(220, Math.min(area.clientWidth - w.x, ww + dx));
        if (mode === "resize" || mode.includes("s"))
          w.height = Math.max(140, Math.min(area.clientHeight - w.y, hh + dy));
        if (mode.includes("w")) {
          w.x = Math.min(x + ww - 220, Math.max(0, x + dx));
          w.width = x + ww - w.x;
        }
        if (mode.includes("n")) {
          w.y = Math.min(y + hh - 140, Math.max(0, y + dy));
          w.height = y + hh - w.y;
        }
      }
      winStyle(s, w);
    };
    target.onpointerup = target.onpointercancel = (ev) => {
      target.onpointermove = target.onpointerup = target.onpointercancel = null;
      if (moved && mode === "move") {
        if (ev.clientX <= r.left + 12) w.state = "left";
        else if (ev.clientX >= r.right - 12) w.state = "right";
        else if (ev.clientY <= r.top + 5) w.state = "maximized";
        winStyle(s, w);
      }
    };
  }
  title.onpointerdown = (e) => drag(e, "move");
  title.ondblclick = (e) => {
    if (!e.target.closest("button")) requestFrameAction(s,w,"maximize");
  };
  resize.onpointerdown = (e) => drag(e, "resize");
  for (let edge of ["n", "e", "s", "w", "nw", "ne", "sw"]) {
    let handle = el("div", "edge edge-" + edge);
    handle.onpointerdown = (e) => drag(e, edge);
    node.append(handle);
  }
  winStyle(s, w);
  drawApp(s, w);
  updateBar(s);
  if (activate && w.state !== "minimized") raise(s, w);
}
function closeWindow(s, w, force = false) {
  if (!w) return;
  if (w.appId === "system" && !force)
    return confirmBox(
      s,
      "停止 " + w.data.child + " 及其全部后代？",
      () => removeSystem(systems[w.data.child]),
      "停止子树",
    );
  if (!force && w.data.dirty)
    return confirmBox(
      s,
      "关闭前保存修改？",
      () => {
        if (w.appId === "spreadsheet") saveBook(s, w);
        else put(s, w.data.path, w.data.text);
        closeWindow(s, w, true);
      },
      "保存并关闭",
      () => closeWindow(s, w, true),
    );
  if(w.appId==="projection"){let src=systems[w.data.sid],source=src?.wins.find(q=>q.id===w.data.wid);if(source){src.procs=src.procs.filter(p=>p.pid!==source.data.transportPid);delete source.data.transportPid}}
  if (w.appId === "spreadsheet") disconnectBook(w.id);
  for (let a of Object.values(systems))
    for (let q of [...a.wins])
      if (q.appId === "projection" && q.data.wid === w.id)
        closeWindow(a, q, true);
  views[w.id]?.node.remove();
  delete views[w.id];
  s.wins = s.wins.filter((q) => q !== w);
  s.procs = s.procs.filter((p) => p.owner !== w.id);
  updateBar(s);
  let next = s.wins
    .filter((q) => q.state !== "minimized")
    .sort((a, b) => b.z - a.z)[0];
  if (next) raise(s, next);
}
function confirmBox(s, title, yes, label = "确认", discard = null) {
  let d = views[s.id].desk,
    p = el("div", "dialogshade"),
    b = el(
      "div",
      "dialog",
      '<div class="eyeline">STATION DIALOG</div><h3>' + esc(title) + "</h3>",
    );
  p.append(b);
  d.append(p);
  for (let [l, f] of [
    ["取消", () => {}],
    ...(discard ? [["放弃修改", discard]] : []),
    [label, yes],
  ])
    b.append(
      btn(
        l,
        () => {
          p.remove();
          f();
        },
        null,
        s,
      ),
    );
  return p;
}
function ask(s, title, val, fn) {
  let p = confirmBox(s, title, () => fn(input.value));
  let input = el("input");
  input.value = val;
  p.querySelector("h3").after(input);
  input.select();
  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      p.remove();
      fn(input.value);
    }
  };
}
function newSystem(s) {
  if (frozen(s)) return;
  if (
    !allowance(s, "storage", storage, JSON.stringify(initialFiles()).length * 2)
  ) {
    notify(s, "祖先存储额度不足，无法创建子系统");
    return;
  }
  let child = createState(s);
  let w = openApp(s, "system", { child: child.id });
  if (child.state === "running")
    for (let k of child.bootApps || []) openApp(child, k);
  for (let app of s.wins.filter((q) => q.appId === "systems")) drawApp(s, app);
  notify(
    s,
    child.state === "error" ? child.id + " 内核错误" : "已启动 " + child.id,
  );
  return w;
}
function removeSystem(s) {
  if (!s) return;
  let p = systems[s.parentId];
  for (let id of [...s.tree]) removeSystem(systems[id]);
  for (let w of [...s.wins]) closeWindow(s, w, true);
  p.tree = p.tree.filter((id) => id !== s.id);
  p.procs = p.procs.filter((t) => t.child !== s.id);
  let frame = p.wins.find((w) => w.data.child === s.id);
  if (frame) closeWindow(p, frame, true);
  delete views[s.id];
  delete systems[s.id];
  notify(p, s.id + " 已停止");
}
function refreshStatus(s) {
  let v = views[s.id];
  if (!v) return;
  v.desk.querySelector(":scope>.freeze")?.remove();
  let indicator = v.desk.querySelector(":scope>.topbar .online");
  if (indicator)
    indicator.innerHTML =
      "<i></i> " + (s.error ? "内核异常" : frozen(s) ? "系统暂停" : "系统在线");
  v.area.inert = !!frozen(s);
  v.bar.inert = !!frozen(s);
  if (frozen(s)) {
    let o = mark(
      el(
        "div",
        "freeze",
        "<b>" + esc(s.error ? "内核错误 · " + s.error : "系统已暂停") + "</b>",
      ),
      s.error ? "kernel-error" : "system-frozen",
      s,
    );
    v.desk.append(o);
  }
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    let p = [...document.querySelectorAll(".popup,.dialogshade")].at(-1);
    p?.remove();
  }
});
