// NestedOS 窗口管理器 + 桌面外壳（子系统内程序）
// 窗口次序、焦点、命中判断与输入分发都由本程序决定；修改并重启后按新规则工作。
var me = sys_self();
var boot = sys_args();
var VW = 960;
var VH = 620;
var TITLE = 34;
var TASKBAR = 46;
var ACCENT = "#8b5cf6";
var ACCENT2 = "#f5b942";
var BG = "#141830";
var BG2 = "#1c2140";
var FG = "#e8eaf2";
var FG2 = "#9aa0b8";
var LINE = "rgba(255,255,255,0.09)";
var windows = [];
var nextWin = 1;
var zTop = 1;
var focus = 0;
var drag = null;
var startOpen = false;
var startQuery = "";
var ctxMenu = null;
var projMenu = null;
var selectedIcon = -1;
var toasts = [];
var notices = [];
var dirty = true;
var lastSec = -1;
var sysInfo = sys_request("system.info", {});
var myName = sysInfo.name;
var myDepth = sysInfo.depth;
var childCache = [];
var childCacheAt = -10;
var sysWinId = 0;
var confirmDlg = null;
var snapPick = null;
var hoverBtn = "";
var icons = [
  { app: "files", name: "文件管理", icon: "folder", path: "/Apps/files.os" },
  { app: "editor", name: "程序编辑", icon: "file-code", path: "/Apps/editor.os" },
  { app: "tasks", name: "进程管理", icon: "cpu", path: "/Apps/tasks.os" },
  { app: "player", name: "场景播放", icon: "heli", path: "/Apps/player.os" },
  { app: "charts", name: "图表工作台", icon: "chart-bar", path: "/Apps/charts.os" },
  { app: "systems", name: "系统管理", icon: "layers", path: "" },
  { app: "scene", name: "直升机 24", icon: "file-scene", path: "/Demo/helicopter-24.scene" },
  { app: "docs", name: "文档", icon: "folder", path: "/Documents" }
];
var APP_META = {
  files: { title: "文件管理", icon: "folder", w: 620, h: 440 },
  editor: { title: "程序编辑器", icon: "file-code", w: 640, h: 460 },
  tasks: { title: "进程管理", icon: "cpu", w: 640, h: 460 },
  player: { title: "三维场景播放器", icon: "heli", w: 680, h: 500 },
  charts: { title: "图表工作台", icon: "chart-bar", w: 620, h: 460 },
  systems: { title: "系统管理", icon: "layers", w: 560, h: 440 }
};

fn tw(text, size) {
  var w = 0;
  var i = 0;
  var s = str(text);
  while (i < len(s)) {
    var c = sub(s, i, 1);
    if (ord(c) > 11904) { w = w + size; } else { w = w + size * 0.55; }
    i = i + 1;
  }
  return w;
}
fn winById(id) {
  var i = 0;
  while (i < len(windows)) { if (windows[i].id == id) { return windows[i]; } i = i + 1; }
  return null;
}
fn winByOwner(pid) {
  var i = 0;
  while (i < len(windows)) { if (windows[i].ownerPid == pid) { return windows[i]; } i = i + 1; }
  return null;
}
fn focusWin(id) {
  var w = winById(id);
  if (!w) { return; }
  focus = id;
  zTop = zTop + 1;
  w.z = zTop;
  dirty = true;
  reportWindows();
}
fn reportWindows() {
  var out = [];
  var i = 0;
  while (i < len(windows)) {
    var w = windows[i];
    push(out, { id: w.id, ownerPid: w.ownerPid, appId: w.appId, title: w.title, x: w.x, y: w.y, w: w.w, h: w.h, z: w.z, minimized: w.minimized, maximized: w.maximized, kind: w.kind, childId: w.childId, projId: w.projId, sourceSystemId: w.sourceSystemId, sourceWindowId: w.sourceWindowId, sourceAppId: w.sourceAppId });
    var cw = w.maximized ? VW : w.w;
    var ch = (w.maximized ? VH - TASKBAR : w.h) - TITLE;
    if (w.ownerPid != me && w.ownerPid != 0 && w.kind == "app" && (w.lw != cw || w.lh != ch)) {
      w.lw = cw; w.lh = ch;
      sys_send(w.ownerPid, "resize", { w: cw, h: ch });
    }
    i = i + 1;
  }
  sys_windows(out, focus);
}
fn addWindow(ownerPid, appId, title, w, h, kind, childId) {
  var id = nextWin; nextWin = nextWin + 1;
  var count = len(windows);
  var x = 40 + (count % 6) * 30;
  var y = 30 + (count % 6) * 26;
  if (x + w > VW - 10) { x = 20; }
  if (y + h > VH - TASKBAR - 10) { y = 16; }
  zTop = zTop + 1;
  var win = { id: id, ownerPid: ownerPid, appId: appId, title: title, x: x, y: y, w: w, h: h, z: zTop, minimized: false, maximized: false, kind: kind, childId: childId, projId: "", snap: "" };
  push(windows, win);
  focus = id;
  dirty = true;
  reportWindows();
  return id;
}
fn removeWindow(id) {
  var out = [];
  var i = 0;
  while (i < len(windows)) { if (windows[i].id != id) { push(out, windows[i]); } i = i + 1; }
  windows = out;
  if (focus == id) {
    focus = 0;
    var best = null;
    i = 0;
    while (i < len(windows)) {
      var w = windows[i];
      if (!w.minimized && (best == null || w.z > best.z)) { best = w; }
      i = i + 1;
    }
    if (best) { focus = best.id; }
  }
  dirty = true;
  reportWindows();
}
fn closeWindow(id) {
  var w = winById(id);
  if (!w) { return; }
  if (w.kind == "system") {
    confirmDlg = { kind: "stop_child", winId: id, hostPid: w.ownerPid, childId: w.childId, text: "停止子系统 " + w.title + "？其中全部程序与后代系统将停止。" };
    dirty = true;
    return;
  }
  if (w.kind == "projection") {
    sys_request("projection_close", { projId: w.projId, reason: "关闭投送窗口" });
    removeWindow(id);
    return;
  }
  if (w.ownerPid == me) {
    removeWindow(id);
    if (id == sysWinId) { sysWinId = 0; }
    return;
  }
  sys_send(w.ownerPid, "close", {});
  removeWindow(id);
}
fn launchApp(app, args) {
  if (app == "systems") {
    if (sysWinId == 0) {
      sysWinId = addWindow(me, "systems", "系统管理 · " + myName, 560, 440, "app");
      refreshChildren();
    } else { focusWin(sysWinId); }
    return;
  }
  var meta = APP_META[app];
  if (!meta) { return; }
  var path = "/Apps/" + app + ".os";
  sys_send(1, "wm_launch", { path: path, name: meta.title, args: args });
}
fn openFile(path) {
  if (ends(path, ".scene") || ends(path, ".flightrec")) { launchApp("player", [path]); }
  else if (ends(path, ".os")) { launchApp("editor", [path]); }
  else if (ends(path, ".sheet")) { sys_request("notify", { title: "工作簿", body: "工作簿请在根系统电子表格中打开" }); }
  else { launchApp("editor", [path]); }
}
fn refreshChildren() {
  var r = sys_child_list();
  if (r.ok) { childCache = r.children; }
  childCacheAt = sys_time();
}
fn toast(text) {
  push(toasts, { text: text, until: sys_time() + 4 });
  push(notices, { text: text, at: sys_time() });
  if (len(notices) > 30) { pop(notices); }
  dirty = true;
}
// ---------- 输入 ----------
fn clientRect(w) {
  var x = w.x; var y = w.y; var ww = w.w; var hh = w.h;
  if (w.maximized) { x = 0; y = 0; ww = VW; hh = VH - TASKBAR; }
  return { x: x, y: y + TITLE, w: ww, h: hh - TITLE };
}
fn hitWindow(x, y) {
  var best = null;
  var i = 0;
  while (i < len(windows)) {
    var w = windows[i];
    if (w.minimized) { i = i + 1; continue; }
    var r = clientRect(w);
    var fx = w.maximized ? 0 : w.x;
    var fy = w.maximized ? 0 : w.y;
    var fw = w.maximized ? VW : w.w;
    var fh = w.maximized ? VH - TASKBAR : w.h;
    if (x >= fx && x <= fx + fw && y >= fy && y <= fy + fh) {
      if (best == null || w.z > best.z) { best = w; }
    }
    i = i + 1;
  }
  return best;
}
fn titleButtons(w) {
  var fx = w.maximized ? 0 : w.x;
  var fw = w.maximized ? VW : w.w;
  var fy = w.maximized ? 0 : w.y;
  return [
    { id: "min", x: fx + fw - 100, y: fy, w: 32, h: TITLE },
    { id: "max", x: fx + fw - 68, y: fy, w: 32, h: TITLE },
    { id: "close", x: fx + fw - 36, y: fy, w: 32, h: TITLE }
  ];
}
fn sendClient(w, ev) {
  var r = clientRect(w);
  var e = copy(ev);
  e.windowId = w.id;
  if (w.kind == "system") {
    // 子系统窗口：保持父桌面坐标，由宿主转换到子桌面
    sys_send(w.ownerPid, "input", { event: e });
    return;
  }
  e.x = ev.x - r.x;
  e.y = ev.y - r.y;
  if (w.kind == "projection") {
    sys_request("projection_input", { projId: w.projId, event: e });
  } else if (w.ownerPid == me) {
    handleSystemsInput(e);
  } else {
    sys_send(w.ownerPid, "input", { event: e });
  }
}
fn onPointerDown(ev) {
  var x = ev.x; var y = ev.y;
  if (confirmDlg) { handleConfirmClick(x, y); return; }
  if (snapPick) { handleSnapPickClick(x, y); return; }
  if (projMenu) {
    var hit = menuHit(projMenu, x, y);
    if (hit >= 0) {
      var item = projMenu.items[hit];
      sys_request("project", { windowId: projMenu.winId, targetSystemId: item.target, kind: projMenu.appKind });
      toast("已投送到 " + item.label);
    }
    projMenu = null; dirty = true;
    return;
  }
  if (ctxMenu) {
    var hit2 = menuHit(ctxMenu, x, y);
    if (hit2 >= 0) { runMenuItem(ctxMenu.items[hit2]); }
    ctxMenu = null; dirty = true;
    return;
  }
  if (startOpen) {
    if (handleStartClick(x, y)) { return; }
    startOpen = false; dirty = true;
  }
  // 任务栏
  if (y >= VH - TASKBAR) { handleTaskbarClick(x, y, ev); return; }
  var w = hitWindow(x, y);
  if (w) {
    focusWin(w.id);
    var fx = w.maximized ? 0 : w.x;
    var fy = w.maximized ? 0 : w.y;
    var fw = w.maximized ? VW : w.w;
    // 标题栏按钮
    if (y < fy + TITLE && !w.maximized || (w.maximized && y < TITLE)) {
      var btns = titleButtons(w);
      var bi = 0;
      while (bi < len(btns)) {
        var b = btns[bi];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          if (b.id == "min") { w.minimized = true; dirty = true; reportWindows(); }
          else if (b.id == "max") { w.maximized = !w.maximized; dirty = true; reportWindows(); }
          else { closeWindow(w.id); }
          return;
        }
        bi = bi + 1;
      }
      if (ev.button == 0 && !w.maximized) {
        drag = { mode: "move", winId: w.id, sx: x, sy: y, ox: w.x, oy: w.y };
      }
      return;
    }
    // 缩放边缘
    if (!w.maximized && ev.button == 0) {
      var fh = w.h;
      var edge = "";
      if (x >= fx + fw - 7) { edge = edge + "r"; }
      if (x <= fx + 7) { edge = edge + "l"; }
      if (y >= fy + fh - 7) { edge = edge + "b"; }
      if (edge != "") {
        drag = { mode: "resize", winId: w.id, sx: x, sy: y, ox: w.x, oy: w.y, ow: w.w, oh: w.h, edge: edge };
        return;
      }
    }
    sendClient(w, ev);
    return;
  }
  // 桌面图标
  var ii = iconAt(x, y);
  if (ii >= 0) {
    selectedIcon = ii;
    dirty = true;
    if (ev.button == 2) {
      ctxMenu = { x: x, y: y, items: [ { label: "打开", act: "open_icon", idx: ii }, { label: "取消", act: "noop" } ] };
      dirty = true;
    }
    return;
  }
  selectedIcon = -1;
  if (ev.button == 2) {
    ctxMenu = { x: x, y: y, items: [
      { label: "新建子系统", act: "new_child" },
      { label: "系统管理", act: "systems" },
      { label: "刷新", act: "refresh" }
    ] };
  }
  dirty = true;
}
fn onPointerMove(ev) {
  if (!drag) { return; }
  var w = winById(drag.winId);
  if (!w) { drag = null; return; }
  var dx = ev.x - drag.sx;
  var dy = ev.y - drag.sy;
  if (drag.mode == "move") {
    w.x = drag.ox + dx;
    w.y = drag.oy + dy;
    if (w.x < -w.w + 80) { w.x = -w.w + 80; }
    if (w.x > VW - 60) { w.x = VW - 60; }
    if (w.y < 0) { w.y = 0; }
    if (w.y > VH - TASKBAR - 20) { w.y = VH - TASKBAR - 20; }
    w.snap = "";
    if (ev.x <= 4) { w.snap = "left"; }
    else if (ev.x >= VW - 4) { w.snap = "right"; }
  } else {
    if (find(drag.edge, "r") >= 0) { w.w = max(260, drag.ow + dx); }
    if (find(drag.edge, "l") >= 0) { var nw = max(260, drag.ow - dx); w.x = drag.ox + drag.ow - nw; w.w = nw; }
    if (find(drag.edge, "b") >= 0) { w.h = max(180, drag.oh + dy); }
  }
  dirty = true;
  reportWindows();
}
fn onPointerUp(ev) {
  if (drag) {
    var w = winById(drag.winId);
    if (w && w.snap == "left") { w.x = 0; w.y = 0; w.w = VW / 2; w.h = VH - TASKBAR; }
    if (w && w.snap == "right") { w.x = VW / 2; w.y = 0; w.w = VW / 2; w.h = VH - TASKBAR; }
    if (w) { w.snap = ""; }
    drag = null;
    dirty = true;
    reportWindows();
  }
}
fn onDblClick(ev) {
  var w = hitWindow(ev.x, ev.y);
  if (w) {
    var fy = w.maximized ? 0 : w.y;
    if (ev.y < fy + TITLE) {
      w.maximized = !w.maximized;
      dirty = true; reportWindows();
      return;
    }
    sendClient(w, ev);
    return;
  }
  var ii = iconAt(ev.x, ev.y);
  if (ii >= 0) { activateIcon(ii); }
}
fn onKey(ev) {
  if (ev.key == "Escape") {
    if (confirmDlg) { confirmDlg = null; dirty = true; return; }
    if (snapPick) { snapPick = null; dirty = true; return; }
    if (projMenu) { projMenu = null; dirty = true; return; }
    if (ctxMenu) { ctxMenu = null; dirty = true; return; }
    if (startOpen) { startOpen = false; dirty = true; return; }
  }
  if (startOpen) {
    if (ev.key == "Backspace") { startQuery = sub(startQuery, 0, max(0, len(startQuery) - 1)); dirty = true; return; }
    if (ev.text != null && ev.text != "" && len(ev.text) == 1 && ord(ev.text) >= 32) { startQuery = startQuery + ev.text; dirty = true; return; }
    if (ev.key == "Enter") {
      var items = startItems();
      if (len(items) > 0) { activateStartItem(items[0]); }
      return;
    }
  }
  var w = winById(focus);
  if (w && !w.minimized) { sendClient(w, ev); }
}
fn iconAt(x, y) {
  var i = 0;
  while (i < len(icons)) {
    var ix = 18;
    var iy = 18 + i * 84;
    if (x >= ix - 6 && x <= ix + 78 && y >= iy - 6 && y <= iy + 78) { return i; }
    i = i + 1;
  }
  return -1;
}
fn activateIcon(i) {
  var ic = icons[i];
  if (ic.app == "scene") { openFile(ic.path); }
  else if (ic.app == "docs") { launchApp("files", [ic.path]); }
  else { launchApp(ic.app, null); }
}
fn handleTaskbarClick(x, y, ev) {
  if (x < 52) {
    startOpen = !startOpen;
    startQuery = "";
    dirty = true;
    return;
  }
  // 固定应用
  var pinned = ["files", "player", "charts"];
  var px = 58;
  var pi = 0;
  while (pi < len(pinned)) {
    if (x >= px && x <= px + 40) { launchApp(pinned[pi], null); return; }
    px = px + 44;
    pi = pi + 1;
  }
  // 运行窗口
  var items = taskbarItems();
  var i = 0;
  var tx = px + 8;
  while (i < len(items)) {
    var w = items[i].w;
    var iw = min(160, max(90, tw(w.title, 12) + 40));
    if (x >= tx && x <= tx + iw) {
      if (w.minimized) { w.minimized = false; focusWin(w.id); }
      else if (focus == w.id) { w.minimized = true; dirty = true; reportWindows(); }
      else { focusWin(w.id); }
      return;
    }
    tx = tx + iw + 6;
    i = i + 1;
  }
  // 托盘：通知
  if (x >= VW - 150 && x <= VW - 118) {
    ctxMenu = { x: VW - 260, y: VH - TASKBAR - min(300, len(notices) * 30 + 40), items: noticeItems(), tray: true };
    dirty = true;
    return;
  }
}
fn taskbarItems() {
  var out = [];
  var sorted = copy(windows);
  var i = 0;
  while (i < len(sorted)) {
    var j = i + 1;
    while (j < len(sorted)) {
      if (sorted[j].id < sorted[i].id) { var t = sorted[i]; sorted[i] = sorted[j]; sorted[j] = t; }
      j = j + 1;
    }
    i = i + 1;
  }
  i = 0;
  while (i < len(sorted)) { push(out, { w: sorted[i] }); i = i + 1; }
  return out;
}
fn noticeItems() {
  var out = [];
  if (len(notices) == 0) { push(out, { label: "暂无通知", act: "noop" }); }
  var i = len(notices) - 1;
  var n = 0;
  while (i >= 0 && n < 8) {
    push(out, { label: notices[i].text, act: "noop" });
    i = i - 1; n = n + 1;
  }
  return out;
}
fn menuHit(menu, x, y) {
  var i = 0;
  while (i < len(menu.items)) {
    var iy = menu.y + 8 + i * 30;
    if (x >= menu.x && x <= menu.x + menu.w && y >= iy && y <= iy + 30) { return i; }
    i = i + 1;
  }
  return -1;
}
fn runMenuItem(item) {
  if (item.act == "new_child") { createChild(); }
  else if (item.act == "systems") { launchApp("systems", null); }
  else if (item.act == "refresh") { refreshChildren(); dirty = true; }
  else if (item.act == "open_icon") { activateIcon(item.idx); }
}
fn createChild() {
  var r = sys_child_create(null, null);
  if (r.ok) {
    toast("已创建子系统");
    addWindow(r.pid, "system", r.id, 620, 440, "system", r.id);
    refreshChildren();
  }
  else { toast("创建失败: " + r.error); }
}
// ---------- 开始菜单 ----------
fn startItems() {
  var out = [];
  var apps = [
    { app: "files", label: "文件管理", icon: "folder" },
    { app: "editor", label: "程序编辑器", icon: "file-code" },
    { app: "tasks", label: "进程管理", icon: "cpu" },
    { app: "player", label: "三维场景播放器", icon: "heli" },
    { app: "charts", label: "图表工作台", icon: "chart-bar" },
    { app: "systems", label: "系统管理", icon: "layers" }
  ];
  var progs = [
    { app: "prog", label: "累加计算", icon: "terminal", path: "/Programs/accumulate.os" },
    { app: "prog", label: "消息发送", icon: "terminal", path: "/Programs/sender.os" },
    { app: "prog", label: "消息接收", icon: "terminal", path: "/Programs/receiver.os" },
    { app: "prog", label: "持续计算", icon: "terminal", path: "/Programs/spin.os" }
  ];
  var i = 0;
  while (i < len(apps)) {
    if (startQuery == "" || find(lower(apps[i].label), lower(startQuery)) >= 0) { push(out, apps[i]); }
    i = i + 1;
  }
  i = 0;
  while (i < len(progs)) {
    if (startQuery == "" || find(lower(progs[i].label), lower(startQuery)) >= 0) { push(out, progs[i]); }
    i = i + 1;
  }
  return out;
}
fn activateStartItem(item) {
  startOpen = false;
  dirty = true;
  if (item.app == "prog") {
    sys_send(1, "wm_launch", { path: item.path, name: item.label, args: null });
    toast("已启动 " + item.label);
  } else { launchApp(item.app, null); }
}
fn handleStartClick(x, y) {
  var mx = 8; var my = VH - TASKBAR - 380;
  if (x < mx || x > mx + 300 || y < my || y > VH - TASKBAR) { return false; }
  var items = startItems();
  var i = 0;
  while (i < len(items)) {
    var iy = my + 56 + i * 34;
    if (y >= iy && y <= iy + 34) { activateStartItem(items[i]); return true; }
    i = i + 1;
  }
  return true;
}
// ---------- 确认对话框 / 快照选择 ----------
fn handleConfirmClick(x, y) {
  var bw = 420; var bh = 150;
  var bx = (VW - bw) / 2; var by = (VH - bh) / 2;
  if (x >= bx + bw - 200 && x <= bx + bw - 110 && y >= by + bh - 46 && y <= by + bh - 14) {
    // 取消
    confirmDlg = null; dirty = true; return;
  }
  if (x >= bx + bw - 100 && x <= bx + bw - 12 && y >= by + bh - 46 && y <= by + bh - 14) {
    var d = confirmDlg;
    confirmDlg = null;
    if (d.kind == "stop_child") {
      sys_child_cmd(d.hostPid, "shutdown", {});
      removeWindow(d.winId);
      toast("子系统已停止");
      refreshChildren();
    }
    dirty = true;
    return;
  }
}
fn handleSnapPickClick(x, y) {
  var bw = 460; var bh = 320;
  var bx = (VW - bw) / 2; var by = (VH - bh) / 2;
  if (x >= bx + bw - 90 && x <= bx + bw - 10 && y >= by + bh - 42 && y <= by + bh - 12) { snapPick = null; dirty = true; return; }
  var files = snapPick.files;
  var i = 0;
  while (i < len(files)) {
    var iy = by + 46 + i * 28;
    if (y >= iy && y <= iy + 28 && x >= bx + 10 && x <= bx + bw - 10) {
      var f = files[i];
      var rd = sys_read(f.path);
      if (rd.ok) {
        var r = sys_child_cmd(snapPick.hostPid, "restore", { data: rd.content });
        if (r.ok) { toast("已恢复快照"); } else { toast("恢复失败: " + r.error); }
      }
      snapPick = null; dirty = true;
      return;
    }
    i = i + 1;
  }
}
// ---------- 系统管理窗口 ----------
fn sysmgrRows() {
  return childCache;
}
fn handleSystemsInput(ev) {
  if (ev.kind != "pointer_down") { return; }
  var x = ev.x; var y = ev.y;
  if (y < 40) {
    if (x >= 10 && x <= 150) { createChild(); return; }
    if (x >= 160 && x <= 280) { refreshChildren(); dirty = true; return; }
    return;
  }
  var rows = sysmgrRows();
  var i = 0;
  while (i < len(rows)) {
    var ry = 48 + i * 92;
    if (y >= ry && y <= ry + 88) {
      var c = rows[i];
      // 按钮行
      var btns = sysmgrButtons(c);
      var bi = 0;
      while (bi < len(btns)) {
        var b = btns[bi];
        if (x >= b.x && x <= b.x + b.w && y >= ry + 52 && y <= ry + 80) {
          sysmgrAction(c, b.act);
          return;
        }
        bi = bi + 1;
      }
      return;
    }
    i = i + 1;
  }
}
fn sysmgrButtons(c) {
  return [
    { x: 12, w: 50, act: "pause", label: "暂停" },
    { x: 66, w: 50, act: "resume", label: "继续" },
    { x: 120, w: 50, act: "step", label: "单步" },
    { x: 174, w: 50, act: "speed", label: "调速" },
    { x: 228, w: 50, act: "restart", label: "重启" },
    { x: 282, w: 50, act: "snapshot", label: "快照" },
    { x: 336, w: 50, act: "restore", label: "恢复" },
    { x: 390, w: 50, act: "fork", label: "分叉" },
    { x: 444, w: 50, act: "kernel", label: "内核" },
    { x: 498, w: 50, act: "stop", label: "关闭" }
  ];
}
fn sysmgrAction(c, act) {
  if (act == "pause") { sys_child_cmd(c.hostPid, "pause", {}); toast(c.name + " 已暂停（整棵子树）"); }
  else if (act == "resume") { sys_child_cmd(c.hostPid, "resume", {}); toast(c.name + " 已继续"); }
  else if (act == "step") {
    var r = sys_child_cmd(c.hostPid, "step", {});
    if (r.ok) { toast("单步 1/30 秒，消耗 " + str(r.work) + " 指令"); } else { toast(r.error); }
  }
  else if (act == "speed") {
    var next = c.speed >= 4 ? 0.5 : c.speed * 2;
    sys_child_cmd(c.hostPid, "speed", { value: next });
    toast(c.name + " 速率 ×" + str(next));
  }
  else if (act == "restart") { sys_child_cmd(c.hostPid, "restart", {}); toast(c.name + " 重启中（保留文件与系统树）"); }
  else if (act == "stop") { sys_child_cmd(c.hostPid, "shutdown", {}); toast(c.name + " 已停止"); }
  else if (act == "snapshot") {
    var r2 = sys_child_cmd(c.hostPid, "snapshot", {});
    if (r2.ok) {
      var fname = "/Snapshots/" + c.name + "-" + str(floor(sys_time())) + ".ossnap";
      var w = sys_write(fname, r2.data);
      if (w.ok) { toast("快照已保存 " + fname); } else { toast("快照保存失败: " + w.error); }
    } else { toast("快照失败: " + r2.error); }
  }
  else if (act == "restore") {
    var ls = sys_list("/Snapshots");
    var files = [];
    if (ls.ok) {
      var i = 0;
      while (i < len(ls.items)) {
        if (ends(ls.items[i].name, ".ossnap")) { push(files, ls.items[i]); }
        i = i + 1;
      }
    }
    snapPick = { hostPid: c.hostPid, files: files };
    dirty = true;
    return;
  }
  else if (act == "fork") {
    var r3 = sys_child_cmd(c.hostPid, "fork", {});
    if (r3.ok) { toast("已分叉为独立新子树"); } else { toast("分叉失败: " + r3.error); }
  }
  else if (act == "kernel") {
    launchApp("editor", ["/System/kernel.os"]);
  }
  refreshChildren();
  dirty = true;
}
// ---------- 绘制 ----------
fn drawButton(list, x, y, w, h, label, kind, testid, extra) {
  var fill = BG2;
  var fg = FG;
  if (kind == "accent") { fill = ACCENT; fg = "#ffffff"; }
  if (kind == "warn") { fill = "#5a2a33"; fg = "#ffb4be"; }
  var it = { op: "rect", x: x, y: y, w: w, h: h, r: 7, fill: fill, stroke: LINE };
  push(list, it);
  push(list, { op: "text", x: x + w / 2, y: y + h / 2, text: label, size: 12, color: fg, align: "center" });
}
fn drawBase() {
  var list = [];
  // 桌面图标
  var i = 0;
  while (i < len(icons)) {
    var ix = 18; var iy = 18 + i * 84;
    if (selectedIcon == i) {
      push(list, { op: "rect", x: ix - 8, y: iy - 8, w: 86, h: 88, r: 9, fill: "rgba(139,92,246,0.22)", stroke: "rgba(139,92,246,0.5)" });
    }
    push(list, { op: "rect", x: ix + 10, y: iy, w: 52, h: 52, r: 12, fill: "rgba(255,255,255,0.07)", stroke: LINE });
    push(list, { op: "icon", x: ix + 22, y: iy + 12, size: 28, name: icons[i].icon, color: ACCENT2, color2: ACCENT });
    push(list, { op: "text", x: ix + 36, y: iy + 66, text: icons[i].name, size: 12, color: FG, align: "center", maxW: 84 });
    i = i + 1;
  }
  // 窗口框架
  var sorted = copy(windows);
  var a = 0;
  while (a < len(sorted)) {
    var b = a + 1;
    while (b < len(sorted)) {
      if (sorted[b].z < sorted[a].z) { var t = sorted[a]; sorted[a] = sorted[b]; sorted[b] = t; }
      b = b + 1;
    }
    a = a + 1;
  }
  i = 0;
  while (i < len(sorted)) {
    var w = sorted[i];
    if (!w.minimized) { drawFrame(list, w); }
    i = i + 1;
  }
  // 任务栏
  push(list, { op: "rect", x: 0, y: VH - TASKBAR, w: VW, h: TASKBAR, fill: "rgba(13,16,32,0.92)", stroke: LINE });
  push(list, { op: "rect", x: 8, y: VH - TASKBAR + 7, w: 38, h: 32, r: 8, fill: startOpen ? ACCENT : "rgba(255,255,255,0.08)", stroke: LINE });
  push(list, { op: "icon", x: 16, y: VH - TASKBAR + 13, size: 20, name: "grid", color: startOpen ? "#fff" : ACCENT2 });
  var pinned = [ { app: "files", icon: "folder" }, { app: "player", icon: "heli" }, { app: "charts", icon: "chart-bar" } ];
  var px = 58;
  var pi = 0;
  while (pi < len(pinned)) {
    push(list, { op: "rect", x: px, y: VH - TASKBAR + 7, w: 40, h: 32, r: 8, fill: "rgba(255,255,255,0.05)" });
    push(list, { op: "icon", x: px + 10, y: VH - TASKBAR + 13, size: 20, name: pinned[pi].icon, color: FG2, color2: ACCENT });
    px = px + 44;
    pi = pi + 1;
  }
  var items = taskbarItems();
  var tx = px + 8;
  i = 0;
  while (i < len(items)) {
    var w2 = items[i].w;
    var iw = min(160, max(90, tw(w2.title, 12) + 40));
    var active = focus == w2.id && !w2.minimized;
    push(list, { op: "rect", x: tx, y: VH - TASKBAR + 7, w: iw, h: 32, r: 8, fill: active ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.05)", stroke: active ? ACCENT : LINE });
    push(list, { op: "text", x: tx + 10, y: VH - TASKBAR + 23, text: w2.title, size: 12, color: active ? FG : FG2, maxW: iw - 18 });
    if (active) { push(list, { op: "rect", x: tx + 8, y: VH - 5, w: iw - 16, h: 2.5, r: 1, fill: ACCENT2 }); }
    tx = tx + iw + 6;
    i = i + 1;
  }
  // 托盘
  var now = sys_time();
  var sec = floor(now);
  var mm = floor(sec / 60) % 60;
  var hh = floor(sec / 3600) % 24;
  var ss = sec % 60;
  var clock = pad(str(hh), 2, "0") + ":" + pad(str(mm), 2, "0") + ":" + pad(str(ss), 2, "0");
  push(list, { op: "icon", x: VW - 146, y: VH - TASKBAR + 13, size: 18, name: "bell", color: FG2 });
  push(list, { op: "text", x: VW - 100, y: VH - TASKBAR + 16, text: clock, size: 12, color: FG });
  push(list, { op: "text", x: VW - 100, y: VH - TASKBAR + 32, text: myName + " · L" + str(myDepth), size: 10, color: ACCENT2 });
  sys_display(list, "base");
}
fn drawFrame(list, w) {
  var fx = w.maximized ? 0 : w.x;
  var fy = w.maximized ? 0 : w.y;
  var fw = w.maximized ? VW : w.w;
  var fh = w.maximized ? VH - TASKBAR : w.h;
  var focused = focus == w.id;
  push(list, { op: "rect", x: fx, y: fy, w: fw, h: fh, r: 10, fill: BG, stroke: focused ? ACCENT : LINE, lw: focused ? 1.6 : 1, shadow: { color: "rgba(0,0,0,0.5)", blur: 18, oy: 6 } });
  push(list, { op: "rect", x: fx, y: fy, w: fw, h: TITLE, r: 10, fill: focused ? "rgba(139,92,246,0.18)" : "rgba(255,255,255,0.04)" });
  push(list, { op: "rect", x: fx, y: fy + TITLE - 10, w: fw, h: 10, fill: focused ? "rgba(139,92,246,0.18)" : "rgba(255,255,255,0.04)" });
  var iconName = "window";
  if (w.kind == "system") { iconName = "layers"; }
  else if (w.kind == "projection") { iconName = "project"; }
  else if (APP_META[w.appId]) { iconName = APP_META[w.appId].icon; }
  push(list, { op: "icon", x: fx + 9, y: fy + 8, size: 18, name: iconName, color: ACCENT2, color2: ACCENT });
  push(list, { op: "text", x: fx + 33, y: fy + TITLE / 2, text: w.title, size: 12.5, color: focused ? FG : FG2, maxW: fw - 150 });
  if (w.kind == "system") {
    push(list, { op: "rect", x: fx + fw - 140, y: fy + 8, w: 34, h: 18, r: 5, fill: "rgba(245,185,66,0.16)" });
    push(list, { op: "text", x: fx + fw - 123, y: fy + 17, text: "子", size: 11, color: ACCENT2, align: "center" });
  }
  var btns = titleButtons(w);
  var symbols = ["minimize", "maximize", "x"];
  if (w.maximized) { symbols[1] = "restore"; }
  var bi = 0;
  while (bi < 3) {
    var b = btns[bi];
    push(list, { op: "icon", x: b.x + 8, y: b.y + 9, size: 16, name: symbols[bi], color: bi == 2 ? "#ff8a94" : FG2 });
    bi = bi + 1;
  }
  if (!w.maximized) {
    push(list, { op: "line", x1: fx + fw - 10, y1: fy + fh - 4, x2: fx + fw - 4, y2: fy + fh - 10, color: FG2, lw: 1.4 });
  }
}
fn drawOverlay() {
  var list = [];
  if (startOpen) {
    var mx = 8; var my = VH - TASKBAR - 380;
    push(list, { op: "rect", x: mx, y: my, w: 300, h: 372, r: 12, fill: "rgba(18,21,42,0.97)", stroke: LINE, shadow: { color: "rgba(0,0,0,0.5)", blur: 24, oy: 8 } });
    push(list, { op: "rect", x: mx + 12, y: my + 12, w: 276, h: 32, r: 8, fill: "rgba(255,255,255,0.06)", stroke: LINE });
    push(list, { op: "icon", x: mx + 20, y: my + 19, size: 16, name: "search", color: FG2 });
    push(list, { op: "text", x: mx + 44, y: my + 28, text: startQuery == "" ? "搜索应用…" : startQuery, size: 12.5, color: startQuery == "" ? FG2 : FG });
    var items = startItems();
    var i = 0;
    while (i < len(items) && i < 9) {
      var iy = my + 56 + i * 34;
      push(list, { op: "icon", x: mx + 18, y: iy + 7, size: 20, name: items[i].icon, color: ACCENT2, color2: ACCENT });
      push(list, { op: "text", x: mx + 48, y: iy + 17, text: items[i].label, size: 13, color: FG });
      i = i + 1;
    }
  }
  if (ctxMenu) { drawMenu(list, ctxMenu); }
  if (projMenu) { drawMenu(list, projMenu); }
  if (confirmDlg) {
    var bw = 420; var bh = 150;
    var bx = (VW - bw) / 2; var by = (VH - bh) / 2;
    push(list, { op: "rect", x: 0, y: 0, w: VW, h: VH, fill: "rgba(5,6,14,0.5)" });
    push(list, { op: "rect", x: bx, y: by, w: bw, h: bh, r: 12, fill: BG2, stroke: LINE, shadow: { color: "rgba(0,0,0,0.6)", blur: 30, oy: 10 } });
    push(list, { op: "icon", x: bx + 16, y: by + 16, size: 20, name: "alert", color: ACCENT2 });
    push(list, { op: "text", x: bx + 44, y: by + 26, text: "确认操作", size: 14, color: FG, weight: "bold" });
    push(list, { op: "text", x: bx + 18, y: by + 60, text: confirmDlg.text, size: 12.5, color: FG2, maxW: bw - 36 });
    drawButton(list, bx + bw - 200, by + bh - 46, 90, 32, "取消", "", "");
    drawButton(list, bx + bw - 100, by + bh - 46, 88, 32, "停止子树", "warn", "");
  }
  if (snapPick) {
    var bw2 = 460; var bh2 = 320;
    var bx2 = (VW - bw2) / 2; var by2 = (VH - bh2) / 2;
    push(list, { op: "rect", x: 0, y: 0, w: VW, h: VH, fill: "rgba(5,6,14,0.5)" });
    push(list, { op: "rect", x: bx2, y: by2, w: bw2, h: bh2, r: 12, fill: BG2, stroke: LINE });
    push(list, { op: "text", x: bx2 + 16, y: by2 + 24, text: "选择快照恢复", size: 14, color: FG, weight: "bold" });
    var i2 = 0;
    while (i2 < len(snapPick.files) && i2 < 8) {
      var iy2 = by2 + 46 + i2 * 28;
      push(list, { op: "rect", x: bx2 + 10, y: iy2, w: bw2 - 20, h: 26, r: 6, fill: "rgba(255,255,255,0.05)" });
      push(list, { op: "icon", x: bx2 + 16, y: iy2 + 5, size: 16, name: "snapshot", color: ACCENT2 });
      push(list, { op: "text", x: bx2 + 38, y: iy2 + 13, text: snapPick.files[i2].name, size: 12, color: FG });
      i2 = i2 + 1;
    }
    if (len(snapPick.files) == 0) { push(list, { op: "text", x: bx2 + 16, y: by2 + 70, text: "暂无快照文件（/Snapshots）", size: 12, color: FG2 }); }
    drawButton(list, bx2 + bw2 - 90, by2 + bh2 - 42, 80, 30, "取消", "", "");
  }
  // 拖拽贴靠提示
  if (drag && drag.mode == "move") {
    var w = winById(drag.winId);
    if (w && w.snap == "left") { push(list, { op: "rect", x: 2, y: 2, w: VW / 2 - 4, h: VH - TASKBAR - 4, r: 10, fill: "rgba(139,92,246,0.15)", stroke: ACCENT, lw: 2 }); }
    if (w && w.snap == "right") { push(list, { op: "rect", x: VW / 2 + 2, y: 2, w: VW / 2 - 4, h: VH - TASKBAR - 4, r: 10, fill: "rgba(139,92,246,0.15)", stroke: ACCENT, lw: 2 }); }
  }
  // 通知 toast
  var now = sys_time();
  var kept = [];
  var ti = 0;
  var ty = VH - TASKBAR - 50;
  while (ti < len(toasts)) {
    var t = toasts[ti];
    if (t.until > now) {
      push(kept, t);
      var tw2 = min(360, tw(t.text, 12.5) + 46);
      push(list, { op: "rect", x: VW - tw2 - 14, y: ty, w: tw2, h: 38, r: 9, fill: "rgba(24,28,54,0.96)", stroke: LINE, shadow: { color: "rgba(0,0,0,0.4)", blur: 12, oy: 4 } });
      push(list, { op: "icon", x: VW - tw2 - 4, y: ty + 10, size: 18, name: "info", color: ACCENT2 });
      push(list, { op: "text", x: VW - tw2 + 20, y: ty + 19, text: t.text, size: 12.5, color: FG, maxW: tw2 - 34 });
      ty = ty - 46;
    }
    ti = ti + 1;
  }
  toasts = kept;
  sys_display(list, "overlay");
}
fn drawMenu(list, menu) {
  if (!menu.w) { menu.w = 200; }
  var h = len(menu.items) * 30 + 16;
  if (menu.y + h > VH - TASKBAR) { menu.y = VH - TASKBAR - h; }
  push(list, { op: "rect", x: menu.x, y: menu.y, w: menu.w, h: h, r: 10, fill: "rgba(22,26,50,0.98)", stroke: LINE, shadow: { color: "rgba(0,0,0,0.5)", blur: 18, oy: 6 } });
  var i = 0;
  while (i < len(menu.items)) {
    var iy = menu.y + 8 + i * 30;
    push(list, { op: "text", x: menu.x + 14, y: iy + 15, text: menu.items[i].label, size: 12.5, color: FG, maxW: menu.w - 28 });
    i = i + 1;
  }
}
fn drawSystemsContent() {
  var list = [];
  var w = 560;
  push(list, { op: "rect", x: 0, y: 0, w: w, h: 406, fill: BG });
  drawButton(list, 10, 8, 140, 26, "＋ 新建子系统", "accent", "system-new");
  drawButton(list, 160, 8, 120, 26, "刷新", "", "");
  push(list, { op: "text", x: w - 12, y: 21, text: "父系统: " + str(sysInfo.parentId), size: 11, color: FG2, align: "right" });
  var rows = sysmgrRows();
  if (len(rows) == 0) {
    push(list, { op: "text", x: 20, y: 80, text: "还没有直属子系统。点击“新建子系统”创建。", size: 13, color: FG2 });
  }
  var i = 0;
  while (i < len(rows)) {
    var c = rows[i];
    var ry = 48 + i * 92;
    push(list, { op: "rect", x: 8, y: ry, w: w - 16, h: 88, r: 9, fill: BG2, stroke: LINE });
    push(list, { op: "icon", x: 16, y: ry + 10, size: 18, name: "layers", color: ACCENT2, color2: ACCENT });
    push(list, { op: "text", x: 40, y: ry + 19, text: c.name, size: 13.5, color: FG, weight: "bold" });
    var stateText = c.paused ? "已暂停" : (c.state == "kernelError" ? "内核错误" : "运行中");
    var stateColor = c.paused ? ACCENT2 : (c.state == "kernelError" ? "#ff8a94" : "#7dd88f");
    push(list, { op: "text", x: 40 + tw(c.name, 13.5) + 12, y: ry + 19, text: stateText, size: 11.5, color: stateColor });
    push(list, { op: "text", x: w - 18, y: ry + 19, text: "t=" + str(floor(c.clock * 10) / 10) + "s · ×" + str(c.speed) + " · " + str(c.work) + " 指令", size: 11, color: FG2, align: "right" });
    var btns = sysmgrButtons(c);
    var bi = 0;
    while (bi < len(btns)) {
      var b = btns[bi];
      var kind = "";
      if (b.act == "stop") { kind = "warn"; }
      if (b.act == "pause" && c.paused) { kind = "accent"; }
      drawButton(list, b.x, ry + 52, b.w, 26, b.label, kind, "system-" + b.act);
      bi = bi + 1;
    }
    i = i + 1;
  }
  sys_display(list);
}
fn redraw() {
  drawBase();
  drawOverlay();
  if (sysWinId != 0) { drawSystemsContent(); }
  dirty = false;
}
// ---------- 消息 ----------
fn handle(m) {
  var t = m.type;
  if (t == "input") {
    var ev = m.payload;
    if (ev.kind == "pointer_down") { onPointerDown(ev); }
    else if (ev.kind == "pointer_move") { onPointerMove(ev); }
    else if (ev.kind == "pointer_up") { onPointerUp(ev); }
    else if (ev.kind == "dblclick") { onDblClick(ev); }
    else if (ev.kind == "wheel") {
      var w = hitWindow(ev.x, ev.y);
      if (w) { sendClient(w, ev); }
    }
    else if (ev.kind == "key") { onKey(ev); }
    return;
  }
  if (t == "register") {
    var pl = m.payload;
    var meta = APP_META[pl.appId];
    var wid = addWindow(m.from, pl.appId, pl.title, pl.w, pl.h, "app");
    sys_send(m.from, "registered", { windowId: wid, wmPid: me });
    return;
  }
  if (t == "title") {
    var w2 = winByOwner(m.from);
    if (w2) { w2.title = m.payload.title; dirty = true; reportWindows(); }
    return;
  }
  if (t == "spawn_result") {
    if (!m.payload.ok) { toast("启动失败: " + str(m.payload.error)); }
    return;
  }
  if (t == "proc_exited") {
    var w3 = winByOwner(m.payload.pid);
    if (w3) {
      removeWindow(w3.id);
      if (m.payload.error) { toast(w3.title + " 异常结束"); }
    }
    return;
  }
  if (t == "wm_tick") {
    var sec = floor(m.payload.now);
    if (sec != lastSec) { lastSec = sec; dirty = true; }
    if (len(toasts) > 0) { dirty = true; }
    if (sysWinId != 0 && m.payload.now - childCacheAt > 1.5) { refreshChildren(); dirty = true; }
    return;
  }
  if (t == "viewport") {
    VW = m.payload.w;
    VH = m.payload.h;
    dirty = true;
    reportWindows();
    return;
  }
  if (t == "child_event") {
    refreshChildren();
    dirty = true;
    return;
  }
  if (t == "projection_open") {
    var si = m.payload.sourceInfo;
    var wid2 = addWindow(0, "projection", "投送 · " + si.title + "（" + si.systemName + "）", 560, 400, "projection");
    var pw = winById(wid2);
    pw.projId = m.payload.projId;
    pw.sourceSystemId = si.systemId;
    pw.sourceAppId = si.appId;
    sys_request("projection_ready", { projId: m.payload.projId, windowId: wid2 });
    reportWindows();
    return;
  }
  if (t == "projection_close") {
    var i = 0;
    while (i < len(windows)) {
      if (windows[i].projId == m.payload.projId) {
        var id = windows[i].id;
        removeWindow(id);
        if (m.payload.reason) { toast(m.payload.reason); }
        return;
      }
      i = i + 1;
    }
    return;
  }
  if (t == "projection_focus") {
    var i2 = 0;
    while (i2 < len(windows)) {
      if (windows[i2].projId == m.payload.projId) { focusWin(windows[i2].id); return; }
      i2 = i2 + 1;
    }
    return;
  }
  if (t == "open_project_menu") {
    var anc = sys_request("ancestors", {});
    var items = [];
    if (anc.ok) {
      var i3 = 0;
      while (i3 < len(anc.ancestors)) {
        push(items, { label: "投送到 " + anc.ancestors[i3].name + " (L" + str(anc.ancestors[i3].depth) + ")", target: anc.ancestors[i3].id, act: "project" });
        i3 = i3 + 1;
      }
    }
    if (len(items) == 0) { push(items, { label: "没有可用的祖先桌面", act: "noop" }); }
    var pw2 = winById(m.payload.windowId);
    var px2 = 100; var py2 = 80;
    if (pw2) { var cr = clientRect(pw2); px2 = cr.x + m.payload.cx; py2 = cr.y + m.payload.cy; }
    projMenu = { x: px2, y: py2, w: 240, items: items, winId: m.payload.windowId, appKind: m.payload.appKind };
    dirty = true;
    return;
  }
  if (t == "child_ready") {
    var pl2 = m.payload;
    var exists = false;
    var i4 = 0;
    while (i4 < len(windows)) {
      if (windows[i4].kind == "system" && windows[i4].childId == pl2.id) { exists = true; }
      i4 = i4 + 1;
    }
    if (!exists) { addWindow(pl2.hostPid, "system", pl2.name, 620, 440, "system", pl2.id); }
    refreshChildren();
    return;
  }
  if (t == "system_restored") {
    refreshChildren();
    dirty = true;
    return;
  }
}
// 启动
reportWindows();
redraw();
while (true) {
  var m = sys_recv();
  handle(m);
  while (true) {
    var m2 = sys_poll();
    if (m2 == null) { break; }
    handle(m2);
  }
  if (dirty) { redraw(); }
}
