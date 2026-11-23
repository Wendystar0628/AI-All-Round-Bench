// 文本与程序编辑器（子系统内程序）：新建/编辑/保存/启动程序，可打开内核源与飞控程序。
var me = sys_self();
var args = sys_args();
var W = 640;
var H = 460;
var ACCENT = "#8b5cf6";
var ACCENT2 = "#f5b942";
var BG = "#10131f";
var BG2 = "#1c2140";
var FG = "#dfe3f0";
var FG2 = "#9aa0b8";
var LINE = "rgba(255,255,255,0.09)";
var winId = 0;
var filePath = "";
var lines = [""];
var caretL = 0;
var caretC = 0;
var scroll = 0;
var dirtyFile = false;
var dirty = true;
var buttons = [];
var toastMsg = "";
var toastUntil = 0;
var LINE_H = 18;
var CHAR_W = 7.8;
var fontSize = 13;

fn toast(msg) { toastMsg = msg; toastUntil = sys_time() + 3.5; dirty = true; }
fn baseName(p) { var parts = split(p, "/"); return parts[len(parts) - 1]; }
fn textW(s) {
  var w = 0; var i = 0;
  while (i < len(s)) { if (ord(sub(s, i, 1)) > 11904) { w = w + fontSize; } else { w = w + CHAR_W; } i = i + 1; }
  return w;
}
fn loadFile(p) {
  var rd = sys_read(p);
  if (!rd.ok) { toast("打开失败: " + rd.error); return; }
  filePath = p;
  lines = split(rd.content, "\n");
  if (len(lines) == 0) { lines = [""]; }
  caretL = 0; caretC = 0; scroll = 0;
  dirtyFile = false;
  sys_send(wmPid(), "title", { title: "编辑 · " + baseName(p) });
  dirty = true;
}
fn saveFile() {
  if (filePath == "") { filePath = "/Documents/未命名.os"; }
  var content = join(lines, "\n");
  var w = sys_write(filePath, content);
  if (w.ok) { dirtyFile = false; toast("已保存 " + filePath); sys_request("notify", { title: "文件操作", body: "已保存 " + baseName(filePath) }); }
  else { toast("保存失败: " + w.error); }
  dirty = true;
}
fn runFile() {
  if (filePath == "") { toast("请先保存文件"); return; }
  if (dirtyFile) { saveFile(); }
  var r = sys_spawn(filePath, baseName(filePath), null);
  if (r.ok) { toast("已启动进程 pid " + str(r.pid)); }
  else { toast("启动失败: " + r.error); }
}
fn recompileCompiler() {
  if (dirtyFile) { saveFile(); }
  var r = sys_recompile();
  if (r.ok) { toast("编译器已重新编译并替换"); }
  else { toast("失败: " + r.error); }
}
fn insertText(t) {
  var ln = lines[caretL];
  lines[caretL] = sub(ln, 0, caretC) + t + sub(ln, caretC, len(ln) - caretC);
  caretC = caretC + len(t);
  dirtyFile = true; dirty = true;
}
fn newLine() {
  var ln = lines[caretL];
  var rest = sub(ln, caretC, len(ln) - caretC);
  lines[caretL] = sub(ln, 0, caretC);
  var before = [];
  var after = [];
  var i = 0;
  while (i < len(lines)) {
    if (i <= caretL) { push(before, lines[i]); } else { push(after, lines[i]); }
    i = i + 1;
  }
  push(before, rest);
  var merged = [];
  i = 0;
  while (i < len(before)) { push(merged, before[i]); i = i + 1; }
  i = 0;
  while (i < len(after)) { push(merged, after[i]); i = i + 1; }
  lines = merged;
  caretL = caretL + 1;
  caretC = 0;
  dirtyFile = true; dirty = true;
}
fn backspace() {
  if (caretC > 0) {
    var ln = lines[caretL];
    lines[caretL] = sub(ln, 0, caretC - 1) + sub(ln, caretC, len(ln) - caretC);
    caretC = caretC - 1;
  } else if (caretL > 0) {
    var prev = lines[caretL - 1];
    var cur = lines[caretL];
    lines[caretL - 1] = prev + cur;
    var out = [];
    var i = 0;
    while (i < len(lines)) { if (i != caretL) { push(out, lines[i]); } i = i + 1; }
    lines = out;
    caretL = caretL - 1;
    caretC = len(prev);
  }
  dirtyFile = true; dirty = true;
}
fn ensureVisible() {
  var viewH = H - 74;
  var maxLines = floor(viewH / LINE_H);
  if (caretL < scroll) { scroll = caretL; }
  if (caretL >= scroll + maxLines) { scroll = caretL - maxLines + 1; }
}
fn btn(list, id, x, y, w, h, label, kind) {
  var fill = BG2; var fg = FG;
  if (kind == "accent") { fill = ACCENT; fg = "#fff"; }
  push(list, { op: "rect", x: x, y: y, w: w, h: h, r: 7, fill: fill, stroke: LINE });
  push(list, { op: "text", x: x + w / 2, y: y + h / 2, text: label, size: 11.5, color: fg, align: "center" });
  push(buttons, { id: id, x: x, y: y, w: w, h: h });
}
fn redraw() {
  buttons = [];
  var list = [];
  push(list, { op: "rect", x: 0, y: 0, w: W, h: H, fill: BG });
  push(list, { op: "rect", x: 0, y: 0, w: W, h: 38, fill: BG2 });
  var fname = filePath == "" ? "未命名" : baseName(filePath);
  push(list, { op: "icon", x: 10, y: 10, size: 17, name: "file-code", color: ACCENT2 });
  push(list, { op: "text", x: 34, y: 19, text: fname + (dirtyFile ? " ●" : ""), size: 12.5, color: dirtyFile ? ACCENT2 : FG, maxW: 180 });
  btn(list, "save", 220, 7, 60, 24, "保存", "accent");
  btn(list, "run", 286, 7, 74, 24, "运行程序", "");
  btn(list, "recompile", 366, 7, 110, 24, "重编译编译器", "");
  btn(list, "new", 482, 7, 60, 24, "新建", "");
  push(list, { op: "text", x: W - 12, y: 19, text: str(caretL + 1) + ":" + str(caretC + 1), size: 11, color: FG2, align: "right" });
  // 文本区
  var ty = 42;
  var viewH = H - 74;
  push(list, { op: "clip", x: 0, y: ty, w: W, h: viewH });
  push(list, { op: "rect", x: 0, y: ty, w: 44, h: viewH, fill: "rgba(255,255,255,0.03)" });
  var maxLines = floor(viewH / LINE_H);
  var i = 0;
  while (i < maxLines && scroll + i < len(lines)) {
    var li = scroll + i;
    var yy = ty + i * LINE_H;
    push(list, { op: "text", x: 38, y: yy + LINE_H / 2, text: str(li + 1), size: 11, color: li == caretL ? ACCENT2 : "#565c78", align: "right", font: "mono" });
    var ln = lines[li];
    push(list, { op: "text", x: 52, y: yy + LINE_H / 2, text: ln, size: fontSize, color: FG, font: "mono", base: "middle" });
    if (li == caretL) {
      var cx = 52 + textW(sub(ln, 0, caretC));
      push(list, { op: "caret", x: cx, y: yy + 2, h: LINE_H - 4, color: ACCENT2 });
    }
    i = i + 1;
  }
  push(list, { op: "unclip" });
  push(list, { op: "text", x: 12, y: H - 16, text: filePath == "" ? "Ctrl+S 保存 · 运行前自动保存" : filePath, size: 10.5, color: FG2, maxW: W - 24 });
  if (toastMsg != "" && sys_time() < toastUntil) {
    push(list, { op: "rect", x: W / 2 - 150, y: H - 52, w: 300, h: 26, r: 6, fill: "rgba(10,12,24,0.92)" });
    push(list, { op: "text", x: W / 2, y: H - 39, text: toastMsg, size: 11.5, color: ACCENT2, align: "center", maxW: 290 });
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
    var b = hitBtn(x, y);
    if (b != null) {
      if (b.id == "save") { saveFile(); }
      else if (b.id == "run") { runFile(); }
      else if (b.id == "recompile") { recompileCompiler(); }
      else if (b.id == "new") { filePath = ""; lines = [""]; caretL = 0; caretC = 0; dirtyFile = false; dirty = true; }
      return;
    }
    if (y > 42 && y < H - 32) {
      var li = scroll + floor((y - 42) / LINE_H);
      if (li >= len(lines)) { li = len(lines) - 1; }
      caretL = li;
      var ln = lines[li];
      var col = 0;
      var acc = 0;
      var target = x - 52;
      while (col < len(ln)) {
        var chw = ord(sub(ln, col, 1)) > 11904 ? fontSize : CHAR_W;
        if (acc + chw / 2 > target) { break; }
        acc = acc + chw;
        col = col + 1;
      }
      caretC = col;
      dirty = true;
    }
    return;
  }
  if (ev.kind == "wheel") {
    scroll = max(0, scroll + (ev.dy > 0 ? 3 : -3));
    dirty = true;
    return;
  }
  if (ev.kind == "key") {
    if (ev.ctrl && ev.key == "s") { saveFile(); return; }
    if (ev.key == "Enter") { newLine(); ensureVisible(); return; }
    if (ev.key == "Backspace") { backspace(); ensureVisible(); return; }
    if (ev.key == "ArrowLeft") { if (caretC > 0) { caretC = caretC - 1; } else if (caretL > 0) { caretL = caretL - 1; caretC = len(lines[caretL]); } ensureVisible(); dirty = true; return; }
    if (ev.key == "ArrowRight") { if (caretC < len(lines[caretL])) { caretC = caretC + 1; } else if (caretL < len(lines) - 1) { caretL = caretL + 1; caretC = 0; } ensureVisible(); dirty = true; return; }
    if (ev.key == "ArrowUp") { if (caretL > 0) { caretL = caretL - 1; caretC = min(caretC, len(lines[caretL])); } ensureVisible(); dirty = true; return; }
    if (ev.key == "ArrowDown") { if (caretL < len(lines) - 1) { caretL = caretL + 1; caretC = min(caretC, len(lines[caretL])); } ensureVisible(); dirty = true; return; }
    if (ev.key == "Home") { caretC = 0; dirty = true; return; }
    if (ev.key == "End") { caretC = len(lines[caretL]); dirty = true; return; }
    if (ev.key == "Tab") { insertText("  "); return; }
    if (ev.text != null && len(ev.text) >= 1 && ord(sub(ev.text, 0, 1)) >= 32) { insertText(ev.text); return; }
    return;
  }
}
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
  if (m.type == "close") { sys_exit(); return; }
  if (m.type == "registered") { winId = m.payload.windowId; return; }
  if (m.type == "resize") { W = m.payload.w; H = m.payload.h; dirty = true; return; }
  if (m.type == "spawn_result") {
    if (!m.payload.ok) { toast("启动失败: " + str(m.payload.error)); }
    return;
  }
}
sys_register("editor", "程序编辑器", W, H);
var reg = sys_recv();
if (reg.type == "registered") { winId = reg.payload.windowId; }
if (args != null && len(args) > 0) { loadFile(args[0]); }
redraw();
while (true) {
  var m = sys_recv_timeout(300);
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
  if (dirty) { redraw(); }
  if (toastMsg != "" && sys_time() > toastUntil) { toastMsg = ""; dirty = true; }
}
