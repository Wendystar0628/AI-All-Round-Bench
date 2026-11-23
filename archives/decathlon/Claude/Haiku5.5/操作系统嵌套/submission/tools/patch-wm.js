'use strict';
// 一次性修补脚本：修正 wm.ns 的若干问题（三元运算符、投送标识、任务栏坐标、滚轮、对话框位置）。
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let s = fs.readFileSync(path.join(root, 'assets/system/wm.ns'), 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 90));
  s = s.split(a).join(b);
};

rep('focused ? accent_color(accent) : THEME.line', 'pick(focused, accent_color(accent), THEME.line)');
rep('focused ? "#f7f7fc" : "#fbfbfd"', 'pick(focused, "#f7f7fc", "#fbfbfd")');
rep('w.max ? "❐" : "□"', 'pick(w.max, "❐", "□")');
rep('startOpen ? accent_color(accent) : "#ffffff", startOpen ? "#ffffff" : THEME.text', 'pick(startOpen, accent_color(accent), "#ffffff"), pick(startOpen, "#ffffff", THEME.text)');
rep('on ? accentSoft() : "#ffffff"', 'pick(on, accentSoft(), "#ffffff")');
rep('notifOpen ? accent_color(accent) : "#ffffff"', 'pick(notifOpen, accent_color(accent), "#ffffff")');
rep('panelOpen ? accent_color(accent) : "#ffffff"', 'pick(panelOpen, accent_color(accent), "#ffffff")');
rep('(IS_ROOT ? "根系统" : "第 " + str(depth) + " 层")', 'pick(IS_ROOT, "根系统", "第 " + str(depth) + " 层")');
rep('startQuery == "" ? "输入以搜索应用" : startQuery, 13, startQuery == "" ? THEME.hint : THEME.text', 'pick(startQuery == "", "输入以搜索应用", startQuery), 13, pick(startQuery == "", THEME.hint, THEME.text)');

rep(`func menu_items_window(w) {
    var items = [{label: "最小化", act: "min", tid: "menu-min"}, {label: "关闭", act: "close", tid: "menu-close"}];
    if (w.kind == "app") {
        for (var p in SYS_LIST_CACHE) {
            if (p != SELF) { push(items, {label: "投送到 " + p, act: "project:" + p, tid: "menu-project"}); }
        }
    }
    return items;
}

var SYS_LIST_CACHE = [];
`, `func menu_items_window(w) {
    var items = [{label: "最小化", act: "min", tid: "menu-min"}, {label: "关闭", act: "close", tid: "menu-close"}];
    if (w.kind == "app") {
        for (var a in sys_ancestors()) {
            push(items, {label: "投送到 " + a.id, act: "project:" + a.id, tid: "menu-project"});
        }
    }
    return items;
}
`);
rep(`    } else if (act.starts_with_project) {
        return;
    }
    dirty = true;`, `    } else if (starts(act, "project:")) {
        if (menu != nil && menu.target != 0) { project_win(menu.target, substr(act, 8, len(act) - 8)); }
    }
    dirty = true;`);

rep(`        sys_xpost(p.target, {to: "wm", type: "proj-ended", win: p.winid, reason: "源窗口已关闭"});`,
    `        sys_xpost(p.target, {to: "wm", type: "proj-ended", src: SELF, view: p.view, reason: "源窗口已关闭"});`);
rep(`    push(w.projs, {view: pid, target: target, winid: 0});`, `    push(w.projs, {view: pid, target: target});`);
rep(`        if (w.kind == "proj" && w.src == m.from && w.srcwin == m.win) {`, `        if (w.kind == "proj" && w.src == m.src && w.view == m.view) {`);
rep(`        proj_source_closed({from: SELF, win: m.win, reason: m.reason});`, `        proj_source_closed(m);`);

rep(`        if (inside(x, y, W / 2 - 96 + 96, H / 2 + 28, 96, 38)) {`, `        if (inside(x, y, W / 2 + 84, H / 2 + 28, 96, 38)) {`);
rep(`        if (inside(x, y, W / 2 - 200 + 180, H / 2 - 90 + 118, 96, 38)) {`, `        if (inside(x, y, W / 2 - 20, H / 2 + 28, 96, 38)) {`);
rep(`        if (inside(x, y, W - 374, H - TASK - 56, 312, 34)) {`, `        if (inside(x, y, W - 346, H - TASK - 56, 312, 34)) {`);

rep(`func paint_taskbar(L) {`, `func pinned_visible() {
    var out = [];
    for (var p in PINNED) {
        if (IS_ROOT || APPS[p].child) { push(out, p); }
    }
    return out;
}

func paint_taskbar(L) {`);
rep(`    var x = 62;
    for (var p in PINNED) {
        if (IS_ROOT || APPS[p].child) {
            paint_icon_small(L, x, H - TASK + 6, p);
            x = x + 42;
        }
    }`, `    var x = 62;
    for (var p in pinned_visible()) {
        paint_icon_small(L, x, H - TASK + 6, p);
        x = x + 42;
    }`);
rep(`    var i = 0;
    for (var p in PINNED) {
        if (inside(x, y, 62 + i * 42, H - TASK + 6, 36, 36) && (IS_ROOT || APPS[p].child)) {
            open_app(p);
            return;
        }
        i = i + 1;
    }
    var tx = 62 + len(PINNED) * 42 + 12;`, `    var i = 0;
    for (var p in pinned_visible()) {
        if (inside(x, y, 62 + i * 42, H - TASK + 6, 36, 36)) {
            open_app(p);
            return;
        }
        i = i + 1;
    }
    var tx = 62 + len(pinned_visible()) * 42 + 12;`);

rep(`func forward_pointer(w, kind, x, y, b, dbl) {
    var c = content_rect(w);
    var lx = x - c.x;
    var ly = y - c.y;
    if (w.kind == "app") {
        sys_send(w.pid, {type: "pointer", view: "win", kind: kind, x: lx, y: ly, b: b, dbl: dbl});
    } else if (w.kind == "sys") {
        sys_xpost(w.sys, {to: "wm", type: "ev", ev: {kind: kind, x: lx, y: ly, b: b, dbl: dbl}});
    } else if (w.kind == "proj") {
        sys_xpost(w.src, {to: "wm", type: "proj-ev", win: w.srcwin, view: w.view, ev: {kind: kind, x: lx, y: ly, b: b, dbl: dbl}});
    }
}`, `func forward_pointer(w, kind, x, y, b, dbl) {
    forward_pointer_dy(w, kind, x, y, b, dbl, 0);
}

func forward_pointer_dy(w, kind, x, y, b, dbl, dy) {
    var c = content_rect(w);
    var lx = x - c.x;
    var ly = y - c.y;
    if (w.kind == "app") {
        sys_send(w.pid, {type: "pointer", view: "win", kind: kind, x: lx, y: ly, b: b, dbl: dbl, dy: dy});
    } else if (w.kind == "sys") {
        sys_xpost(w.sys, {to: "wm", type: "ev", ev: {kind: kind, x: lx, y: ly, b: b, dbl: dbl, dy: dy}});
    } else if (w.kind == "proj") {
        sys_xpost(w.src, {to: "wm", type: "proj-ev", win: w.srcwin, view: w.view, ev: {kind: kind, x: lx, y: ly, b: b, dbl: dbl, dy: dy}});
    }
}`);
rep(`        var w = win_by(hit_window(ev.x, ev.y));
        if (w != nil) { forward_pointer(w, "wheel", ev.x, ev.y, 0, false); }
        if (w != nil && w.kind == "app") { sys_send(w.pid, {type: "wheel", view: "win", dy: ev.dy, x: ev.x - content_rect(w).x, y: ev.y - content_rect(w).y}); }`,
`        var w = win_by(hit_window(ev.x, ev.y));
        if (w != nil) { forward_pointer_dy(w, "wheel", ev.x, ev.y, 0, false, ev.dy); }`);

rep(`            if (ev.y <= 2) {
                toggle_max(w);
                w.max = true;
            } else if`, `            if (ev.y <= 2) {
                if (!w.max) { toggle_max(w); }
            } else if`);

rep(`    W = 1280;
    H = 800;
    if (IS_ROOT) {
        if (!has(APPS, "")) { return; }
    }
    dirty = true;`, `    W = 1280;
    H = 800;
    dirty = true;`);
rep(`        if (m.type == "ev" || m.type == "viewport" || m.type == "tick" || m.type == "notice" || m.type == "settings" || m.type == "drop" || m.type == "open-app" || m.type == "open-kid" || m.type == "close-req-ok" || m.type == "focus-parent" || m.type == "dialog") {
            handle_msg(m);
        } else {
            handle_msg(m);
        }`, `        handle_msg(m);`);

fs.writeFileSync(path.join(root, 'assets/system/wm.ns'), s);

const uiPath = path.join(root, 'assets/system/lib/ui.ns');
let u = fs.readFileSync(uiPath, 'utf8');
if (!u.includes('func pick(')) {
  u = u.replace('func nd(t, x, y, w, h) {', '// 条件取值（程序语言没有三元运算符）\nfunc pick(c, a, b) {\n    if (c) { return a; }\n    return b;\n}\n\nfunc nd(t, x, y, w, h) {');
  fs.writeFileSync(uiPath, u);
}
console.log('patched; leftover " ? ":', (s.match(/ \? /g) || []).length);
