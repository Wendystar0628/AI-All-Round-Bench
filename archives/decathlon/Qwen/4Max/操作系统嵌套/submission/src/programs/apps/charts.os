// 图表工作台（子系统内程序）：从根系统电子表格建立实时数据连接。
// 数据接收由独立接收进程完成；本进程计算坐标并绘制图表，过渡使用系统虚拟时间。
var me = sys_self();
var args = sys_args();
var W = 620;
var H = 466;
var ACCENT = "#8b5cf6";
var ACCENT2 = "#f5b942";
var BG = "#12152a";
var BG2 = "#1c2140";
var FG = "#e8eaf2";
var FG2 = "#9aa0b8";
var LINE = "rgba(255,255,255,0.09)";
var COLORS = ["#8b5cf6", "#f5b942", "#5cc8ff", "#7dd88f", "#ff8a94"];
var winId = 0;
var receiverPid = 0;
var subId = 0;
var connState = "disconnected";
var workbooks = [];
var wbIndex = 0;
var rangeText = "A1:D4";
var labelCol = "A";
var seriesText = "D";
var chartType = "bar";
var data = null;
var version = 0;
var anim = null;
var hoverIdx = -1;
var dirty = true;
var buttons = [];
var srcMenu = false;
var toastMsg = "";
var toastUntil = 0;
var sourceTitle = "";
var lastReport = "";

fn tw(text, size) {
  var w = 0; var i = 0; var s = str(text);
  while (i < len(s)) { if (ord(sub(s, i, 1)) > 11904) { w = w + size; } else { w = w + size * 0.55; } i = i + 1; }
  return w;
}
fn toast(msg) { toastMsg = msg; toastUntil = sys_time() + 3.5; dirty = true; }
fn reportStatus() {
  var st = { kind: "charts", sourceTitle: sourceTitle, range: rangeText, chartType: chartType, connectionState: connState };
  var sig = json_str(st);
  if (sig != lastReport) { lastReport = sig; sys_request("app.status", { windowId: winId, status: st }); }
}
fn connect() {
  if (len(workbooks) == 0) { toast("没有已打开的工作簿"); return; }
  var wb = workbooks[wbIndex];
  if (receiverPid == 0) {
    var r = sys_spawn("/System/chart_receiver.os", "数据接收", [me]);
    if (!r.ok) { toast("接收进程启动失败: " + r.error); return; }
    receiverPid = r.pid;
  }
  sys_send(receiverPid, "connect", { workbookId: wb.id, range: rangeText, labelCol: labelCol, seriesCols: split(seriesText, ","), title: wb.title });
}
fn disconnect() {
  if (receiverPid != 0 && subId != 0) { sys_send(receiverPid, "disconnect", { subId: subId }); }
  connState = "disconnected";
  subId = 0;
  toast("已断开连接（保留最后数据）");
  reportStatus(); dirty = true;
}
fn onData(pl) {
  if (pl.closed) {
    connState = "closed";
    toast("数据源已关闭，保留已接收数据");
    reportStatus(); dirty = true;
    return;
  }
  if (pl.version <= version && data != null) { return; }
  var old = data;
  data = pl.data;
  version = pl.version;
  connState = "connected";
  if (old != null) {
    anim = { from: old, to: data, start: sys_time(), dur: 0.45 };
  }
  reportStatus(); dirty = true;
}
fn animK() {
  if (anim == null) { return 1; }
  var k = (sys_time() - anim.start) / anim.dur;
  if (k >= 1) { anim = null; return 1; }
  return k * k * (3 - 2 * k);
}
fn seriesValues(si, idx) {
  var to = data.series[si].values[idx];
  if (anim != null && anim.from != null && si < len(anim.from.series) && idx < len(anim.from.series[si].values)) {
    var from = anim.from.series[si].values[idx];
    if (type(from) == "number" && type(to) == "number") {
      var k = animK();
      return from + (to - from) * k;
    }
  }
  return to;
}
fn maxVal() {
  var m = 1;
  if (data == null) { return m; }
  var si = 0;
  while (si < len(data.series)) {
    var i = 0;
    while (i < len(data.series[si].values)) {
      var v = data.series[si].values[i];
      if (type(v) == "number" && v > m) { m = v; }
      i = i + 1;
    }
    si = si + 1;
  }
  return m * 1.15;
}
fn btn(list, id, x, y, w, h, label, kind) {
  var fill = BG2; var fg = FG;
  if (kind == "accent") { fill = ACCENT; fg = "#fff"; }
  if (kind == "active") { fill = "rgba(139,92,246,0.35)"; }
  if (kind == "warn") { fill = "#5a2a33"; fg = "#ffb4be"; }
  push(list, { op: "rect", x: x, y: y, w: w, h: h, r: 7, fill: fill, stroke: LINE });
  push(list, { op: "text", x: x + w / 2, y: y + h / 2, text: label, size: 12, color: fg, align: "center", maxW: w - 8 });
  push(buttons, { id: id, x: x, y: y, w: w, h: h });
}
fn field(list, id, x, y, w, label, value) {
  push(list, { op: "text", x: x, y: y - 8, text: label, size: 10.5, color: FG2 });
  push(list, { op: "rect", x: x, y: y, w: w, h: 26, r: 6, fill: "rgba(255,255,255,0.06)", stroke: LINE });
  push(list, { op: "text", x: x + 8, y: y + 13, text: value, size: 12, color: FG, maxW: w - 16 });
  push(buttons, { id: id, x: x, y: y, w: w, h: 26 });
}
fn redraw() {
  buttons = [];
  var list = [];
  push(list, { op: "rect", x: 0, y: 0, w: W, h: H, fill: BG });
  push(list, { op: "rect", x: 0, y: 0, w: W, h: 118, fill: BG2 });
  push(list, { op: "text", x: 12, y: 16, text: "实时数据连接 · 根系统电子表格", size: 13, color: FG, weight: "bold" });
  var stateLabel = connState == "connected" ? "已连接 v" + str(version) : (connState == "closed" ? "数据源已关闭" : (connState == "restored" ? "已恢复，待重新连接" : "未连接"));
  var stateColor = connState == "connected" ? "#7dd88f" : (connState == "disconnected" ? FG2 : ACCENT2);
  push(list, { op: "text", x: W - 12, y: 16, text: stateLabel, size: 11.5, color: stateColor, align: "right" });
  var wbTitle = len(workbooks) > 0 ? workbooks[wbIndex].title : "（无已打开工作簿）";
  field(list, "source", 12, 40, 180, "工作簿", wbTitle);
  field(list, "range", 200, 40, 90, "区域", rangeText);
  field(list, "labelcol", 298, 40, 60, "标签列", labelCol);
  field(list, "series", 366, 40, 80, "数值列", seriesText);
  btn(list, "connect", 456, 40, 72, 26, "连接", "accent");
  btn(list, "disconnect", 534, 40, 72, 26, "断开", "");
  btn(list, "type", 12, 82, 120, 26, chartType == "bar" ? " grouped柱状图" : "折线图", "active");
  btn(list, "project", W - 90, 82, 78, 26, "投送窗口", "");
  push(list, { op: "text", x: 145, y: 95, text: "数据以副本跨层传递 · 版本只前进", size: 10.5, color: FG2 });
  // 图表区
  var cx = 52; var cy = 134; var cw = W - 80; var ch = H - 134 - 52;
  push(list, { op: "rect", x: 12, y: 124, w: W - 24, h: H - 124 - 40, r: 10, fill: "rgba(255,255,255,0.025)", stroke: LINE });
  if (data == null) {
    push(list, { op: "icon", x: W / 2 - 20, y: cy + ch / 2 - 40, size: 40, name: "chart-bar", color: ACCENT, color2: ACCENT2 });
    push(list, { op: "text", x: W / 2, y: cy + ch / 2 + 16, text: "选择工作簿与区域后点击“连接”", size: 13, color: FG2, align: "center" });
  } else {
    var mv = maxVal();
    var n = len(data.labels);
    // 网格与坐标轴
    var g = 0;
    while (g <= 4) {
      var gy = cy + ch - ch * g / 4;
      push(list, { op: "line", x1: cx, y1: gy, x2: cx + cw, y2: gy, color: "rgba(255,255,255,0.07)", lw: 1 });
      push(list, { op: "text", x: cx - 8, y: gy, text: str(floor(mv * g / 4)), size: 10, color: FG2, align: "right" });
      g = g + 1;
    }
    push(list, { op: "line", x1: cx, y1: cy + ch, x2: cx + cw, y2: cy + ch, color: FG2, lw: 1.2 });
    var ns = len(data.series);
    var slot = cw / max(1, n);
    var i = 0;
    while (i < n) {
      var lx = cx + slot * i + slot / 2;
      push(list, { op: "text", x: lx, y: cy + ch + 14, text: str(data.labels[i]), size: 11, color: hoverIdx == i ? ACCENT2 : FG2, align: "center", maxW: slot - 4 });
      if (chartType == "bar") {
        var bw = min(34, (slot * 0.62) / ns);
        var si = 0;
        while (si < ns) {
          var v = seriesValues(si, i);
          if (type(v) != "number") { v = 0; }
          var bh = ch * clamp(v / mv, 0, 1);
          var bx = lx - (ns * bw) / 2 + si * bw;
          push(list, { op: "rect", x: bx + 1, y: cy + ch - bh, w: bw - 2, h: bh, r: 3, fill: COLORS[si % 5], opacity: hoverIdx == i ? 1 : 0.85 });
          if (hoverIdx == i) {
            push(list, { op: "text", x: bx + bw / 2, y: cy + ch - bh - 8, text: str(v), size: 10.5, color: FG, align: "center" });
          }
          si = si + 1;
        }
      }
      i = i + 1;
    }
    if (chartType == "line") {
      var si2 = 0;
      while (si2 < ns) {
        var pts = [];
        var j = 0;
        while (j < n) {
          var v2 = seriesValues(si2, j);
          if (type(v2) != "number") { v2 = 0; }
          push(pts, [cx + slot * j + slot / 2, cy + ch - ch * clamp(v2 / mv, 0, 1)]);
          j = j + 1;
        }
        push(list, { op: "poly", pts: pts, close: false, stroke: COLORS[si2 % 5], lw: 2.4 });
        j = 0;
        while (j < len(pts)) {
          push(list, { op: "circle", x: pts[j][0], y: pts[j][1], r: hoverIdx == j ? 5 : 3.4, fill: COLORS[si2 % 5] });
          if (hoverIdx == j) {
            push(list, { op: "text", x: pts[j][0], y: pts[j][1] - 12, text: str(seriesValues(si2, j)), size: 10.5, color: FG, align: "center" });
          }
          j = j + 1;
        }
        si2 = si2 + 1;
      }
    }
    // 图例
    var lx2 = cx;
    var si3 = 0;
    while (si3 < ns) {
      push(list, { op: "rect", x: lx2, y: H - 30, w: 10, h: 10, r: 2, fill: COLORS[si3 % 5] });
      var nm = data.series[si3].name;
      push(list, { op: "text", x: lx2 + 15, y: H - 25, text: nm, size: 11, color: FG2 });
      lx2 = lx2 + tw(nm, 11) + 34;
      si3 = si3 + 1;
    }
    push(list, { op: "text", x: W - 16, y: H - 25, text: "v" + str(version) + " · " + str(n) + " 组", size: 10.5, color: FG2, align: "right" });
  }
  if (srcMenu) {
    push(list, { op: "rect", x: 12, y: 68, w: 240, h: 12 + len(workbooks) * 28, r: 8, fill: "rgba(20,24,48,0.98)", stroke: LINE });
    var mi = 0;
    while (mi < len(workbooks)) {
      push(list, { op: "text", x: 24, y: 82 + mi * 28, text: workbooks[mi].title, size: 12, color: FG });
      push(buttons, { id: "wb:" + str(mi), x: 12, y: 70 + mi * 28, w: 240, h: 28 });
      mi = mi + 1;
    }
  }
  if (toastMsg != "" && sys_time() < toastUntil) {
    push(list, { op: "rect", x: W / 2 - 150, y: H - 70, w: 300, h: 26, r: 6, fill: "rgba(10,12,24,0.9)" });
    push(list, { op: "text", x: W / 2, y: H - 57, text: toastMsg, size: 11.5, color: ACCENT2, align: "center", maxW: 290 });
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
  var x = ev.x; var y = ev.y;
  if (ev.kind == "pointer_down") {
    if (srcMenu) {
      var b0 = hitBtn(x, y);
      if (b0 != null && starts(b0.id, "wb:")) { wbIndex = num(sub(b0.id, 3, len(b0.id) - 3)); }
      srcMenu = false; dirty = true;
      return;
    }
    var b = hitBtn(x, y);
    if (b != null) {
      if (b.id == "source") {
        var r = sys_request("sheet.list", {});
        workbooks = r.ok ? r.workbooks : [];
        if (wbIndex >= len(workbooks)) { wbIndex = 0; }
        srcMenu = true; dirty = true;
      }
      else if (b.id == "connect") { connect(); }
      else if (b.id == "disconnect") { disconnect(); }
      else if (b.id == "type") { chartType = chartType == "bar" ? "line" : "bar"; reportStatus(); dirty = true; }
      else if (b.id == "project") { sys_send(wmPid(), "open_project_menu", { windowId: winId, cx: x, cy: y, appKind: "charts" }); }
      else if (b.id == "range" || b.id == "labelcol" || b.id == "series") { editField = b.id; dirty = true; }
      return;
    }
    // 图表悬停点选
    if (data != null && y > 134 && y < H - 52) {
      var cx = 52; var cw = W - 80;
      var slot = cw / max(1, len(data.labels));
      var idx = floor((x - cx) / slot);
      if (idx >= 0 && idx < len(data.labels)) { hoverIdx = idx; dirty = true; }
    }
    return;
  }
  if (ev.kind == "pointer_move") {
    if (data != null && y > 134 && y < H - 52 && x > 52 && x < W - 28) {
      var slot2 = (W - 80) / max(1, len(data.labels));
      var idx2 = floor((x - 52) / slot2);
      if (idx2 != hoverIdx && idx2 >= 0 && idx2 < len(data.labels)) { hoverIdx = idx2; dirty = true; }
    } else if (hoverIdx != -1) { hoverIdx = -1; dirty = true; }
    return;
  }
  if (ev.kind == "key") {
    if (editField != "") {
      var cur = editField == "range" ? rangeText : (editField == "labelcol" ? labelCol : seriesText);
      if (ev.key == "Enter") { editField = ""; dirty = true; return; }
      if (ev.key == "Escape") { editField = ""; dirty = true; return; }
      if (ev.key == "Backspace") { cur = sub(cur, 0, max(0, len(cur) - 1)); }
      else if (ev.text != null && len(ev.text) == 1 && ord(ev.text) >= 32) { cur = cur + upper(ev.text); }
      else { return; }
      if (editField == "range") { rangeText = cur; }
      else if (editField == "labelcol") { labelCol = cur; }
      else { seriesText = cur; }
      dirty = true;
    }
    return;
  }
}
var editField = "";
fn wmPid() {
  var ps = sys_ps();
  var i = 0;
  while (i < len(ps.procs)) {
    if (ps.procs[i].kind == "user" && ps.procs[i].path == "/System/wm.os") { return ps.procs[i].pid; }
    i = i + 1;
  }
  return 3;
}
fn handle(m) {
  if (m.type == "input") { onInput(m.payload); return; }
  if (m.type == "close") { if (receiverPid != 0) { sys_kill(receiverPid); } sys_exit(); return; }
  if (m.type == "registered") { winId = m.payload.windowId; reportStatus(); return; }
  if (m.type == "resize") { W = m.payload.w; H = m.payload.h; dirty = true; return; }
  if (m.type == "chart_data") { onData(m.payload); return; }
  if (m.type == "subscribed") { subId = m.payload.subId; sourceTitle = m.payload.title; connState = "connected"; version = 0; onData({ version: m.payload.version, data: m.payload.data }); toast("已连接，取得完整选区 v" + str(m.payload.version)); return; }
  if (m.type == "sub_error") { toast("连接失败: " + m.payload.error); connState = "disconnected"; reportStatus(); dirty = true; return; }
  if (m.type == "system_restored") { connState = "restored"; subId = 0; reportStatus(); dirty = true; return; }
}
sys_register("charts", "图表工作台", W, H);
var reg = sys_recv();
if (reg.type == "registered") { winId = reg.payload.windowId; }
var r0 = sys_request("sheet.list", {});
workbooks = r0.ok ? r0.workbooks : [];
redraw();
while (true) {
  var m = sys_recv_timeout(40);
  if (m != null) {
    handle(m);
    var guard = 0;
    while (guard < 10) {
      var m2 = sys_poll();
      if (m2 == null) { break; }
      handle(m2);
      guard = guard + 1;
    }
  }
  if (anim != null) { dirty = true; }
  if (dirty) { redraw(); }
  if (toastMsg != "" && sys_time() > toastUntil) { toastMsg = ""; dirty = true; }
}
