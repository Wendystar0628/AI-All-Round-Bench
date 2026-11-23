'use strict';
// 一次性修补：文件管理器中的三元运算符改为 pick()；窗口管理程序支持按文件打开应用。
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function patch(file, pairs) {
  const p = path.join(root, file);
  let s = fs.readFileSync(p, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) throw new Error(file + ' missing: ' + a.slice(0, 80));
    s = s.split(a).join(b);
  }
  fs.writeFileSync(p, s);
  console.log(file, 'ternaries left:', (s.match(/ \? /g) || []).length);
}

patch('assets/system/apps/files.ns', [
  ['status = starts(dir, "/Trash") ? "已永久删除" : "已移入回收站";', 'status = pick(starts(dir, "/Trash"), "已永久删除", "已移入回收站");'],
  ['var r = add_rect(L, 10, ny, SIDEBAR - 20, 32, on ? accent_color("violet") : "#00000000");', 'var r = add_rect(L, 10, ny, SIDEBAR - 20, 32, pick(on, accent_color("violet"), "#00000000"));'],
  ['add_text(L, 22, ny, SIDEBAR - 40, 32, n.label, 13, on ? "#ffffff" : THEME.text, "l");', 'add_text(L, 22, ny, SIDEBAR - 40, 32, n.label, 13, pick(on, "#ffffff", THEME.text), "l");'],
  ['var row = add_rect(L, SIDEBAR + 4, y, VW - SIDEBAR - 8, ROW - 2, isSel ? THEME.select : "#00000000");', 'var row = add_rect(L, SIDEBAR + 4, y, VW - SIDEBAR - 8, ROW - 2, pick(isSel, THEME.select, "#00000000"));'],
  ['row.hv = !isSel;', 'row.hv = pick(isSel, false, true);'],
  ['var typeText = it.type == "d" ? "文件夹" : (ext_of(it.name) == "" ? "文件" : upper(ext_of(it.name)) + " 文件");', 'var typeText = pick(it.type == "d", "文件夹", pick(ext_of(it.name) == "", "文件", upper(ext_of(it.name)) + " 文件"));'],
  ['add_text(L, VW - 200, y, 90, ROW - 2, it.type == "d" ? "" : size_text(it.size), 12, THEME.sub, "r");', 'add_text(L, VW - 200, y, 90, ROW - 2, pick(it.type == "d", "", size_text(it.size)), 12, THEME.sub, "r");'],
  ['add_text(L, VW - 110, y, 104, ROW - 2, it.mtime > 0 ? "" : "", 12, THEME.sub, "l");\n', ''],
  ['dir == "/Trash" ? "回收站是空的" : "这个文件夹是空的"', 'pick(dir == "/Trash", "回收站是空的", "这个文件夹是空的")'],
  ['status == "" ? str(len(items)) + " 项" : status', 'pick(status == "", str(len(items)) + " 项", status)'],
  ['var on = dir == n.path || starts(dir, n.path + "/");', 'var on = dir == n.path || starts(dir, n.path + "/");'],
]);

patch('assets/system/wm.ns', [
  // 按文件类型打开应用：参数作为应用的第三个启动参数
  [`func open_app(app) {
    var a = APPS[app];`, `func open_app(app) {
    return open_app_with(app, nil);
}

func open_app_with(app, arg) {
    var a = APPS[app];`],
  ['var r = sys_spawn("/System/apps/" + app + ".ns", [wid, app]);', 'var r = sys_spawn("/System/apps/" + app + ".ns", [wid, app, arg]);'],
  [`    } else if (t == "open-app") {
        open_app(m.app);`, `    } else if (t == "open-app") {
        open_app(m.app);
    } else if (t == "open-file") {
        open_file(m.path);`],
]);

// 公共库新增 ext_of；文件管理器删去自己的同名函数；窗口管理程序增加 open_file。
patch('assets/system/lib/ui.ns', [
  ['func nd(t, x, y, w, h) {', `// 文件扩展名（小写，不含点）
func ext_of(name) {
    var i = len(name) - 1;
    while (i >= 0 && substr(name, i, 1) != ".") { i = i - 1; }
    if (i < 0) { return ""; }
    return lower(substr(name, i + 1, len(name) - i - 1));
}

func nd(t, x, y, w, h) {`],
]);
patch('assets/system/apps/files.ns', [
  [`func ext_of(name) {
    var i = len(name) - 1;
    while (i >= 0 && substr(name, i, 1) != ".") { i = i - 1; }
    if (i < 0) { return ""; }
    return lower(substr(name, i + 1, len(name) - i - 1));
}

`, ''],
]);
patch('assets/system/wm.ns', [
  [`func open_app(app) {
    return open_app_with(app, nil);
}`, `func open_app(app) {
    return open_app_with(app, nil);
}

// 按文件扩展名选择应用
func open_file(path) {
    var ext = ext_of(path);
    var app = "editor";
    if (ext == "sheet") { app = "sheet"; }
    if (ext == "scene" || ext == "rec") { app = "player"; }
    if (!IS_ROOT && app == "sheet") { push_toast("无法打开", "本系统没有电子表格"); return 0; }
    if (IS_ROOT && app == "player") { push_toast("无法打开", "根系统没有三维播放器，请在子系统中打开"); return 0; }
    return open_app_with(app, path);
}`],
]);
