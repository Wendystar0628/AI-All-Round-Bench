// 进程管理器（子系统内程序）：本系统进程表、配额与子系统拨付。
var me = sys_self();
var W = 640;
var H = 460;
var ACCENT = "#8b5cf6";
var ACCENT2 = "#f5b942";
var BG = "#12152a";
var BG2 = "#1c2140";
var FG = "#e8eaf2";
var FG2 = "#9aa0b8";
var LINE = "rgba(255,255,255,0.09)";
var winId = 0;
var ps = null;
var childList = [];
var dirty = true;
var buttons = [];
var selPid = 0;
var toastMsg = "";
var toastUntil = 0;
var tab = "procs";

fn toast(msg) { toastMsg = msg; toastUntil = sys_time() + 3; dirty = true; }
fn refresh() {
  ps = sys_ps();
  var r = sys_child_list();
  childList = r.ok ? r.children : [];
  dirty = true;
}
fn fmtK(n) {
  if (n > 1048576) { return str(floor(n / 1048576 * 10) / 10) + " MB"; }
  if (n > 1024) { return str(floor(n / 1024)) + " KB"; }
  return str(n) + " B";
}
fn stateLabel(s) {
  if (s == "ready") { return "就绪"; }
  if (s == "running") { return "运行"; }
  if (s == "waiting") { return "等待"; }
  if (s == "suspended") { return "挂起"; }
  if (s == "exited") { return "结束"; }
  if (s == "error") { return "异常"; }
  if (s == "paused") { return "暂停"; }
  return s;
}
fn stateColor(s) {
  if (s == "error") { return "#ff8a94"; }
  if (s == "suspended") { return ACCENT2; }
  if (s == "waiting") { return "#5cc8ff"; }
  if (s == "exited") { return "#565c78"; }
  return "#7dd88f";
}
fn btn(list, id, x, y, w, h, label, kind) {
  var fill = BG2; var fg = FG;
  if (kind == "accent") { fill = ACCENT; fg = "#fff"; }
  if (kind == "warn") { fill = "#5a2a33"; fg = "#ffb4be"; }
  if (kind == "active") { fill = "rgba(139,92,246,0.35)"; }
  push(list, { op: "rect", x: x, y: y, w: w, h: h, r: 6, fill: fill, stroke: LINE });
  push(list, { op: "text", x: x + w / 2, y: y + h / 2, text: label, size: 11, color: fg, align: "center", maxW: w - 6 });
  push(buttons, { id: id, x: x, y: y, w: w, h: h });
}
fn redraw() {
  buttons = [];
  var list = [];
  push(list, { op: "rect", x: 0, y: 0, w: W, h: H, fill: BG });
  push(list, { op: "rect", x: 0, y: 0, w: W, h: 64, fill: BG2 });
  if (ps != null) {
    push(list, { op: "text", x: 12, y: 16, text: "总预算 " + str(ps.cfg.budget) + " 指令/步", size: 12, color: FG });
    push(list, { op: "text", x: 12, y: 36, text: "内存 " + fmtK(ps.memUsed) + " / " + fmtK(ps.cfg.memory), size: 11, color: FG2 });
    push(list, { op: "text", x: 200, y: 36, text: "存储 " + fmtK(ps.storageUsed) + " / " + fmtK(ps.cfg.storage), size: 11, color: FG2 });
    push(list, { op: "text", x: 400, y: 36, text: "内核自身 " + str(ps.kernelWork) + " 指令", size: 11, color: ACCENT2 });
    push(list, { op: "text", x: 12, y: 54, text: "t=" + str(floor(ps.now * 10) / 10) + "s · 拨付上限 " + str(ps.cfg.grantCap) + "/步", size: 10.5, color: FG2 });
  }
  btn(list, "budget_down", W - 250, 10, 56, 22, "预算-", "");
  btn(list, "budget_up", W - 190, 10, 56, 22, "预算+", "");
  btn(list, "grant_down", W - 130, 10, 56, 22, "拨付-", "");
  btn(list, "grant_up", W - 70, 10, 56, 22, "拨付+", "");
  btn(list, "tab_procs", W - 250, 38, 70, 20, "进程", tab == "procs" ? "active" : "");
  btn(list, "tab_children", W - 176, 38, 90, 20, "子系统拨付", tab == "children" ? "active" : "");
  btn(list, "refresh", W - 80, 38, 66, 20, "刷新", "");
  if (tab == "procs") {
    var hy = 72;
    push(list, { op: "text", x: 12, y: hy + 8, text: "PID", size: 10.5, color: FG2 });
    push(list, { op: "text", x: 52, y: hy + 8, text: "名称", size: 10.5, color: FG2 });
    push(list, { op: "text", x: 230, y: hy + 8, text: "状态", size: 10.5, color: FG2 });
    push(list, { op: "text", x: 290, y: hy + 8, text: "工作量", size: 10.5, color: FG2 });
    push(list, { op: "text", x: 370, y: hy + 8, text: "内存", size: 10.5, color: FG2 });
    push(list, { op: "text", x: 440, y: hy + 8, text: "消息", size: 10.5, color: FG2 });
    push(list, { op: "text", x: 490, y: hy + 8, text: "操作", size: 10.5, color: FG2 });
    if (ps != null) {
      var i = 0;
      while (i < len(ps.procs) && i < 11) {
        var p = ps.procs[i];
        var ry = hy + 20 + i * 30;
        if (selPid == p.pid) { push(list, { op: "rect", x: 6, y: ry, w: W - 12, h: 28, r: 6, fill: "rgba(139,92,246,0.2)" }); }
        push(list, { op: "text", x: 12, y: ry + 14, text: str(p.pid), size: 11.5, color: FG2, font: "mono" });
        var nm = p.name + (p.kind == "child" ? "（承载）" : (p.kind == "kernel" ? "（内核）" : ""));
        push(list, { op: "text", x: 52, y: ry + 14, text: nm, size: 11.5, color: FG, maxW: 172 });
        push(list, { op: "text", x: 230, y: ry + 14, text: stateLabel(p.state), size: 11, color: stateColor(p.state) });
        push(list, { op: "text", x: 290, y: ry + 14, text: str(p.work), size: 11, color: FG2, font: "mono" });
        push(list, { op: "text", x: 370, y: ry + 14, text: fmtK(p.mem), size: 11, color: FG2 });
        push(list, { op: "text", x: 440, y: ry + 14, text: str(p.queued), size: 11, color: FG2 });
        if (p.kind != "kernel") {
          btn(list, "suspend:" + str(p.pid), 486, ry + 2, 44, 24, p.state == "suspended" ? "继续" : "挂起", "");
          btn(list, "kill:" + str(p.pid), 534, ry + 2, 44, 24, "结束", "warn");
          btn(list, "cap:" + str(p.pid), 582, ry + 2, 44, 24, "额度", "");
        }
        push(buttons, { id: "sel:" + str(p.pid), x: 6, y: ry, w: 470, h: 28 });
        i = i + 1;
      }
    }
    if (ps != null && selPid != 0) {
      var sp = null;
      var j = 0;
      while (j < len(ps.procs)) { if (ps.procs[j].pid == selPid) { sp = ps.procs[j]; } j = j + 1; }
      if (sp != null) {
        push(list, { op: "rect", x: 6, y: H - 56, w: W - 12, h: 48, r: 8, fill: BG2, stroke: LINE });
        var info = "路径: " + (sp.path == "" ? "—" : sp.path) + " · 额度上限 " + str(sp.cap) + " 指令/片";
        if (sp.error != null) { info = "错误: " + sp.error; }
        if (sp.waitInfo != null) { info = info + " · 等待: " + sp.waitInfo; }
        push(list, { op: "text", x: 14, y: H - 40, text: info, size: 11, color: sp.error != null ? "#ff8a94" : FG2, maxW: W - 28 });
        push(list, { op: "text", x: 14, y: H - 22, text: "挂起保留执行状态；结束释放资源，再次启动从初始状态开始。", size: 10.5, color: FG2 });
      }
    }
  } else {
    push(list, { op: "text", x: 12, y: 84, text: "直属子系统拨付上限（本系统总预算内竞争，不额外增加预算）", size: 12, color: FG2 });
    var ci = 0;
    while (ci < len(childList)) {
      var c = childList[ci];
      var ry2 = 100 + ci * 64;
      push(list, { op: "rect", x: 8, y: ry2, w: W - 16, h: 58, r: 8, fill: BG2, stroke: LINE });
      push(list, { op: "icon", x: 16, y: ry2 + 12, size: 18, name: "layers", color: ACCENT2, color2: ACCENT });
      push(list, { op: "text", x: 42, y: ry2 + 20, text: c.name + " · " + (c.paused ? "已暂停" : "运行中"), size: 12.5, color: FG });
      push(list, { op: "text", x: 42, y: ry2 + 42, text: "累计 " + str(c.work) + " 指令 · t=" + str(floor(c.clock)) + "s · ×" + str(c.speed), size: 11, color: FG2 });
      btn(list, "gdown:" + str(c.hostPid), W - 200, ry2 + 16, 56, 26, "拨付-", "");
      btn(list, "gup:" + str(c.hostPid), W - 140, ry2 + 16, 56, 26, "拨付+", "");
      btn(list, "pause:" + str(c.hostPid), W - 80, ry2 + 16, 62, 26, c.paused ? "继续" : "暂停", "");
      ci = ci + 1;
    }
    if (len(childList) == 0) { push(list, { op: "text", x: 12, y: 120, text: "暂无直属子系统", size: 12, color: FG2 }); }
    push(list, { op: "text", x: 12, y: H - 40, text: "层数越深，到达用户程序的份额越小；调高速率不补发预算。", size: 11, color: FG2 });
  }
  if (toastMsg != "" && sys_time() < toastUntil) {
    push(list, { op: "rect", x: W / 2 - 140, y: H - 88, w: 280, h: 24, r: 6, fill: "rgba(10,12,24,0.92)" });
    push(list, { op: "text", x: W / 2, y: H - 76, text: toastMsg, size: 11, color: ACCENT2, align: "center", maxW: 270 });
  }
  sys_display(list);
  dirty = false;
}
fn hitBtn(x, y) {
  var i = len(buttons) - 1;
  while (i >= 0) {
    var b = buttons[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { return b; }
    i = i - 1;
  }
  return null;
}
fn onInput(ev) {
  if (ev.kind != "pointer_down") { return; }
  var b = hitBtn(ev.x, ev.y);
  if (b == null) { return; }
  var id = b.id;
  if (id == "refresh") { refresh(); return; }
  if (id == "tab_procs") { tab = "procs"; dirty = true; return; }
  if (id == "tab_children") { tab = "children"; dirty = true; return; }
  if (id == "budget_down") { sys_set("budget", max(10000, ps.cfg.budget - 20000)); refresh(); return; }
  if (id == "budget_up") { sys_set("budget", ps.cfg.budget + 20000); refresh(); return; }
  if (id == "grant_down") { sys_set("grantCap", max(5000, ps.cfg.grantCap - 10000)); refresh(); return; }
  if (id == "grant_up") { sys_set("grantCap", ps.cfg.grantCap + 10000); refresh(); return; }
  if (starts(id, "sel:")) { selPid = num(sub(id, 4, len(id) - 4)); dirty = true; return; }
  if (starts(id, "suspend:")) {
    var pid = num(sub(id, 8, len(id) - 8));
    var p = null;
    var i = 0;
    while (i < len(ps.procs)) { if (ps.procs[i].pid == pid) { p = ps.procs[i]; } i = i + 1; }
    if (p != null) {
      if (p.state == "suspended") { sys_resume_proc(pid); } else { sys_suspend(pid); }
      refresh();
    }
    return;
  }
  if (starts(id, "kill:")) { sys_kill(num(sub(id, 5, len(id) - 5))); refresh(); return; }
  if (starts(id, "cap:")) {
    var pid2 = num(sub(id, 4, len(id) - 4));
    var p2 = null;
    var j = 0;
    while (j < len(ps.procs)) { if (ps.procs[j].pid == pid2) { p2 = ps.procs[j]; } j = j + 1; }
    if (p2 != null) {
      var nc = p2.cap >= 16000 ? 2000 : p2.cap * 2;
      sys_set("cap", pid2, nc);
      toast("pid " + str(pid2) + " 额度 → " + str(nc));
      refresh();
    }
    return;
  }
  if (starts(id, "gdown:") || starts(id, "gup:")) {
    var hp = num(sub(id, 6, len(id) - 6));
    var cur = ps.cfg.grantCap;
    var kk = 0;
    while (kk < len(childList)) { if (childList[kk].hostPid == hp) { cur = childList[kk].grant; } kk = kk + 1; }
    var delta = starts(id, "gup:") ? 10000 : -10000;
    var nv = max(3000, cur + delta);
    sys_set("childGrant", hp, nv);
    toast("该子系统拨付上限 → " + str(nv));
    refresh();
    return;
  }
  if (starts(id, "pause:")) {
    var hp2 = num(sub(id, 6, len(id) - 6));
    var c2 = null;
    var k = 0;
    while (k < len(childList)) { if (childList[k].hostPid == hp2) { c2 = childList[k]; } k = k + 1; }
    if (c2 != null) {
      sys_child_cmd(hp2, c2.paused ? "resume" : "pause", {});
      refresh();
    }
    return;
  }
}
fn handle(m) {
  if (m.type == "input") { onInput(m.payload); return; }
  if (m.type == "close") { sys_exit(); return; }
  if (m.type == "registered") { winId = m.payload.windowId; return; }
  if (m.type == "resize") { W = m.payload.w; H = m.payload.h; dirty = true; return; }
}
sys_register("tasks", "进程管理", W, H);
var reg = sys_recv();
if (reg.type == "registered") { winId = reg.payload.windowId; }
refresh();
redraw();
while (true) {
  var m = sys_recv_timeout(700);
  if (m != null) {
    handle(m);
    var guard = 0;
    while (guard < 8) {
      var m2 = sys_poll();
      if (m2 == null) { break; }
      handle(m2);
      guard = guard + 1;
    }
  } else {
    refresh();
  }
  if (dirty) { redraw(); }
  if (toastMsg != "" && sys_time() > toastUntil) { toastMsg = ""; dirty = true; }
}
