// 文件管理器（子系统内程序）：目录导航与文件操作，支持跨层拖放与本机保存/导入。
var me = sys_self();
var args = sys_args();
var W = 620;
var H = 440;
var ACCENT = "#8b5cf6";
var ACCENT2 = "#f5b942";
var BG = "#12152a";
var BG2 = "#1c2140";
var FG = "#e8eaf2";
var FG2 = "#9aa0b8";
var LINE = "rgba(255,255,255,0.09)";
var winId = 0;
var path = "/";
var items = [];
var selected = [];
var clip = null;
var clipMode = "";
var dirty = true;
var buttons = [];
var renameIdx = -1;
var renameText = "";
var toastMsg = "";
var toastUntil = 0;
var dragCandidate = -1;
var dragSent = false;
var dropHighlight = false;
var confirmOverwrite = null;
var pendingDrop = null;

fn tw(text, size) {
  var w = 0; var i = 0; var s = str(text);
  while (i < len(s)) { if (ord(sub(s, i, 1)) > 11904) { w = w + size; } else { w = w + size * 0.55; } i = i + 1; }
  return w;
}
fn toast(msg) { toastMsg = msg; toastUntil = sys_time() + 3.5; dirty = true; }
fn baseName(p) { var parts = split(p, "/"); return parts[len(parts) - 1]; }
fn parentPath(p) {
  var parts = split(p, "/");
  var out = [];
  var i = 0;
  while (i < len(parts) - 1) { if (parts[i] != "") { push(out, parts[i]); } i = i + 1; }
  return "/" + join(out, "/");
}
fn refresh() {
  var r = sys_list(path);
  if (r.ok) { items = r.items; } else { items = []; toast(r.error); }
  selected = [];
  dirty = true;
}
fn navigate(p) { path = p; refresh(); }
fn iconFor(it) {
  if (it.dir) { return "folder"; }
  if (ends(it.name, ".os")) { return "file-code"; }
  if (ends(it.name, ".scene")) { return "file-scene"; }
  if (ends(it.name, ".sheet")) { return "file-sheet"; }
  if (ends(it.name, ".flightrec")) { return "snapshot"; }
  if (ends(it.name, ".ossnap")) { return "snapshot"; }
  return "file-text";
}
fn openItem(it) {
  if (it.dir) { navigate(it.path); return; }
  if (ends(it.name, ".scene") || ends(it.name, ".flightrec")) {
    sys_send(1, "wm_launch", { path: "/Apps/player.os", name: "三维场景播放器", args: [it.path] });
  } else {
    sys_send(1, "wm_launch", { path: "/Apps/editor.os", name: "程序编辑器", args: [it.path] });
  }
}
fn selHas(i) {
  var k = 0;
  while (k < len(selected)) { if (selected[k] == i) { return true; } k = k + 1; }
  return false;
}
fn doCopy(mode) {
  if (len(selected) == 0) { toast("请先选择文件"); return; }
  clip = [];
  var i = 0;
  while (i < len(selected)) {
    var it = items[selected[i]];
    var rd = sys_read(it.path);
    if (rd.ok) { push(clip, { name: it.name, content: rd.content, dir: it.dir }); }
    i = i + 1;
  }
  clipMode = mode;
  toast(mode == "copy" ? "已复制 " + str(len(clip)) + " 项" : "已剪切 " + str(len(clip)) + " 项");
}
fn doPaste() {
  if (clip == null || len(clip) == 0) { toast("剪贴板为空"); return; }
  var i = 0;
  while (i < len(clip)) {
    var dst = path == "/" ? "/" + clip[i].name : path + "/" + clip[i].name;
    var w = sys_write(dst, clip[i].content);
    if (!w.ok) { toast("粘贴失败: " + w.error); }
    else if (clipMode == "cut") {
      var src = clip[i].srcPath;
      if (src != null) { sys_delete(src); }
    }
    i = i + 1;
  }
  if (clipMode == "cut") { clip = null; }
  refresh();
  toast("已粘贴");
  sys_request("notify", { title: "文件操作", body: "已粘贴到 " + path });
}
fn doDelete() {
  if (len(selected) == 0) { toast("请先选择文件"); return; }
  var i = 0;
  while (i < len(selected)) { sys_delete(items[selected[i]].path); i = i + 1; }
  toast("已删除 " + str(len(selected)) + " 项");
  sys_request("notify", { title: "文件操作", body: "已删除 " + str(len(selected)) + " 项" });
  refresh();
}
fn doNewFile() {
  var name = "新建文件.txt";
  var n = 1;
  while (sys_exists(path == "/" ? "/" + name : path + "/" + name)) {
    n = n + 1;
    name = "新建文件" + str(n) + ".txt";
  }
  sys_write(path == "/" ? "/" + name : path + "/" + name, "");
  refresh();
}
fn doNewFolder() {
  var name = "新建文件夹";
  var n = 1;
  while (sys_exists(path == "/" ? "/" + name : path + "/" + name)) {
    n = n + 1;
    name = "新建文件夹" + str(n);
  }
  sys_mkdir(path == "/" ? "/" + name : path + "/" + name);
  refresh();
}
fn startRename() {
  if (len(selected) != 1) { toast("请选择一项重命名"); return; }
  renameIdx = selected[0];
  renameText = items[renameIdx].name;
  dirty = true;
}
fn commitRename() {
  if (renameIdx < 0) { return; }
  var it = items[renameIdx];
  var dst = parentPath(it.path) == "/" ? "/" + renameText : parentPath(it.path) + "/" + renameText;
  var r = sys_rename(it.path, dst);
  if (!r.ok) { toast("重命名失败: " + r.error); }
  renameIdx = -1;
  refresh();
}
fn exportHost() {
  if (len(selected) != 1) { toast("请选择一个文件保存到本机"); return; }
  var it = items[selected[0]];
  var rd = sys_read(it.path);
  if (!rd.ok) { toast(rd.error); return; }
  sys_request("host.save", { defaultPath: it.name, content: rd.content, title: "保存到本机" });
}
fn importHost() {
  sys_request("host.open", { title: "从本机导入" });
}
fn writeDropFiles(files, overwrite) {
  var i = 0;
  var okCount = 0;
  while (i < len(files)) {
    var f = files[i];
    var dst = path == "/" ? "/" + f.name : path + "/" + f.name;
    if (sys_exists(dst) && !overwrite) {
      confirmOverwrite = { files: files, index: i };
      dirty = true;
      return;
    }
    var w = sys_write(dst, f.content);
    if (w.ok) { okCount = okCount + 1; }
    else { toast("写入失败: " + w.error); }
    i = i + 1;
  }
  toast("已接收 " + str(okCount) + " 个文件（独立副本）");
  sys_request("notify", { title: "跨层传递", body: "已接收 " + str(okCount) + " 个文件到 " + path });
  refresh();
}
fn btn(list, id, x, y, w, h, label, icon, kind) {
  var fill = BG2; var fg = FG;
  if (kind == "accent") { fill = ACCENT; fg = "#fff"; }
  push(list, { op: "rect", x: x, y: y, w: w, h: h, r: 7, fill: fill, stroke: LINE });
  if (icon != "") { push(list, { op: "icon", x: x + 7, y: y + (h - 15) / 2, size: 15, name: icon, color: fg, color2: ACCENT2 }); }
  push(list, { op: "text", x: icon != "" ? x + 27 : x + w / 2, y: y + h / 2, text: label, size: 11.5, color: fg, align: icon != "" ? "left" : "center" });
  push(buttons, { id: id, x: x, y: y, w: w, h: h });
}
fn redraw() {
  buttons = [];
  var list = [];
  push(list, { op: "rect", x: 0, y: 0, w: W, h: H, fill: BG });
  push(list, { op: "rect", x: 0, y: 0, w: W, h: 40, fill: BG2 });
  btn(list, "up", 8, 8, 30, 24, "", "chevron-up", "");
  btn(list, "root", 42, 8, 30, 24, "", "home", "");
  push(list, { op: "rect", x: 78, y: 8, w: W - 250, h: 24, r: 6, fill: "rgba(255,255,255,0.06)", stroke: LINE });
  push(list, { op: "text", x: 88, y: 20, text: path, size: 12, color: FG, maxW: W - 270 });
  btn(list, "newfile", W - 164, 8, 74, 24, "新文件", "plus", "");
  btn(list, "newfolder", W - 86, 8, 78, 24, "新文件夹", "folder", "");
  // 工具行
  push(list, { op: "rect", x: 0, y: 40, w: W, h: 32, fill: "rgba(255,255,255,0.02)" });
  btn(list, "open", 8, 45, 56, 22, "打开", "", "");
  btn(list, "copy", 68, 45, 56, 22, "复制", "", "");
  btn(list, "cut", 128, 45, 56, 22, "剪切", "", "");
  btn(list, "paste", 188, 45, 56, 22, "粘贴", "", "");
  btn(list, "rename", 248, 45, 62, 22, "重命名", "", "");
  btn(list, "delete", 314, 45, 56, 22, "删除", "", "warn");
  btn(list, "export", 374, 45, 86, 22, "保存到本机", "download", "");
  btn(list, "import", 464, 45, 86, 22, "从本机导入", "upload", "");
  // 列表
  var ly = 76;
  var rowH = 28;
  var maxRows = floor((H - ly - 30) / rowH);
  push(list, { op: "text", x: 16, y: ly + 10, text: "名称", size: 11, color: FG2 });
  push(list, { op: "text", x: W - 120, y: ly + 10, text: "大小", size: 11, color: FG2 });
  var i = 0;
  while (i < len(items) && i < maxRows) {
    var it = items[i];
    var ry = ly + 22 + i * rowH;
    var sel = selHas(i);
    if (sel) { push(list, { op: "rect", x: 8, y: ry, w: W - 16, h: rowH - 2, r: 6, fill: "rgba(139,92,246,0.25)" }); }
    if (dropHighlight) { push(list, { op: "rect", x: 8, y: ry, w: W - 16, h: rowH - 2, r: 6, stroke: ACCENT2, lw: 1.5 }); }
    push(list, { op: "icon", x: 16, y: ry + 5, size: 17, name: iconFor(it), color: it.dir ? ACCENT2 : FG2, color2: ACCENT });
    var nm = it.name;
    if (renameIdx == i) { nm = renameText + "▏"; }
    push(list, { op: "text", x: 40, y: ry + rowH / 2, text: nm, size: 12.5, color: sel ? FG : "#c8cde0", maxW: W - 200 });
    push(list, { op: "text", x: W - 120, y: ry + rowH / 2, text: it.dir ? "—" : str(it.size) + " B", size: 11, color: FG2 });
    push(buttons, { id: "item:" + str(i), x: 8, y: ry, w: W - 16, h: rowH - 2 });
    i = i + 1;
  }
  if (len(items) == 0) {
    push(list, { op: "text", x: W / 2, y: ly + 70, text: "空目录", size: 13, color: FG2, align: "center" });
  }
  push(list, { op: "text", x: 12, y: H - 14, text: str(len(items)) + " 项 · 已选 " + str(len(selected)) + " · 拖放文件可跨系统传递", size: 10.5, color: FG2 });
  if (confirmOverwrite != null) {
    push(list, { op: "rect", x: 0, y: 0, w: W, h: H, fill: "rgba(5,6,14,0.55)" });
    var bw = 380; var bh = 130;
    var bx = (W - bw) / 2; var by = (H - bh) / 2;
    push(list, { op: "rect", x: bx, y: by, w: bw, h: bh, r: 12, fill: BG2, stroke: LINE });
    push(list, { op: "text", x: bx + 16, y: by + 28, text: "文件已存在: " + confirmOverwrite.files[confirmOverwrite.index].name, size: 13, color: FG, maxW: bw - 32 });
    push(list, { op: "text", x: bx + 16, y: by + 54, text: "覆盖目标文件？", size: 12, color: FG2 });
    btn(list, "ow_cancel", bx + bw - 190, by + bh - 44, 84, 30, "取消", "", "");
    btn(list, "ow_ok", bx + bw - 98, by + bh - 44, 84, 30, "覆盖", "warn", "");
  }
  if (toastMsg != "" && sys_time() < toastUntil) {
    push(list, { op: "rect", x: W / 2 - 150, y: H - 58, w: 300, h: 26, r: 6, fill: "rgba(10,12,24,0.9)" });
    push(list, { op: "text", x: W / 2, y: H - 45, text: toastMsg, size: 11.5, color: ACCENT2, align: "center", maxW: 290 });
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
    if (confirmOverwrite != null) {
      var b0 = hitBtn(x, y);
      if (b0 != null && b0.id == "ow_ok") { var f = confirmOverwrite.files; confirmOverwrite = null; writeDropFiles(f, true); }
      else if (b0 != null && b0.id == "ow_cancel") { confirmOverwrite = null; dirty = true; }
      return;
    }
    var b = hitBtn(x, y);
    if (b == null) { return; }
    if (starts(b.id, "item:")) {
      var idx = num(sub(b.id, 5, len(b.id) - 5));
      if (ev.ctrl) {
        if (selHas(idx)) {
          var ns = [];
          var k = 0;
          while (k < len(selected)) { if (selected[k] != idx) { push(ns, selected[k]); } k = k + 1; }
          selected = ns;
        } else { push(selected, idx); }
      } else { selected = [idx]; }
      dragCandidate = idx;
      dragSent = false;
      dirty = true;
      return;
    }
    if (b.id == "up") { navigate(parentPath(path)); }
    else if (b.id == "root") { navigate("/"); }
    else if (b.id == "open") { if (len(selected) > 0) { openItem(items[selected[0]]); } }
    else if (b.id == "copy") { doCopy("copy"); }
    else if (b.id == "cut") { doCopy("cut"); }
    else if (b.id == "paste") { doPaste(); }
    else if (b.id == "delete") { doDelete(); }
    else if (b.id == "rename") { startRename(); }
    else if (b.id == "newfile") { doNewFile(); }
    else if (b.id == "newfolder") { doNewFolder(); }
    else if (b.id == "export") { exportHost(); }
    else if (b.id == "import") { importHost(); }
    return;
  }
  if (ev.kind == "pointer_move") {
    if (dragCandidate >= 0 && !dragSent && ev.buttons > 0) {
      dragSent = true;
      var it = items[dragCandidate];
      if (!it.dir) {
        var rd = sys_read(it.path);
        if (rd.ok) {
          sys_request("file.drag", { files: [{ name: it.name, content: rd.content }], sourcePid: me });
        }
      }
      dragCandidate = -1;
    }
    return;
  }
  if (ev.kind == "pointer_up") { dragCandidate = -1; return; }
  if (ev.kind == "dblclick") {
    var b2 = hitBtn(x, y);
    if (b2 != null && starts(b2.id, "item:")) {
      var idx2 = num(sub(b2.id, 5, len(b2.id) - 5));
      openItem(items[idx2]);
    }
    return;
  }
  if (ev.kind == "key") {
    if (renameIdx >= 0) {
      if (ev.key == "Enter") { commitRename(); return; }
      if (ev.key == "Escape") { renameIdx = -1; dirty = true; return; }
      if (ev.key == "Backspace") { renameText = sub(renameText, 0, max(0, len(renameText) - 1)); dirty = true; return; }
      if (ev.text != null && len(ev.text) == 1 && ord(ev.text) >= 32) { renameText = renameText + ev.text; dirty = true; return; }
    }
    if (ev.key == "Delete") { doDelete(); }
    if (ev.ctrl && ev.key == "c") { doCopy("copy"); }
    if (ev.ctrl && ev.key == "v") { doPaste(); }
    if (ev.ctrl && ev.key == "a") {
      selected = [];
      var i = 0;
      while (i < len(items)) { push(selected, i); i = i + 1; }
      dirty = true;
    }
    return;
  }
}
fn handle(m) {
  if (m.type == "input") { onInput(m.payload); return; }
  if (m.type == "close") { sys_exit(); return; }
  if (m.type == "registered") { winId = m.payload.windowId; return; }
  if (m.type == "resize") { W = m.payload.w; H = m.payload.h; dirty = true; return; }
  if (m.type == "drop") {
    pendingDrop = m.payload;
    writeDropFiles(m.payload.files, false);
    return;
  }
  if (m.type == "drag_hover") { dropHighlight = m.payload.over; dirty = true; return; }
  if (m.type == "host_reply") {
    var r = m.payload.result;
    if (r.ok && r.content != null) {
      var w = sys_write(path == "/" ? "/" + r.name : path + "/" + r.name, r.content);
      if (w.ok) { toast("已导入 " + r.name); refresh(); }
      else { toast("导入失败: " + w.error); }
    }
    else if (r.ok) { toast("已保存: " + str(r.path)); }
    else if (r.error != null) { toast("操作失败: " + r.error); }
    return;
  }
  if (m.type == "host_file") {
    var w = sys_write(path == "/" ? "/" + m.payload.name : path + "/" + m.payload.name, m.payload.content);
    if (w.ok) { toast("已导入 " + m.payload.name); refresh(); }
    else { toast("导入失败: " + w.error); }
    return;
  }
}
sys_register("files", "文件管理", W, H);
var reg = sys_recv();
if (reg.type == "registered") { winId = reg.payload.windowId; }
if (args != null && len(args) > 0) { path = args[0]; }
refresh();
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
