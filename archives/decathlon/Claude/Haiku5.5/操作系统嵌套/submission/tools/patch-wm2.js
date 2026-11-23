'use strict';
// 一次性修补：窗口管理程序的子系统窗口去重、子系统移除、状态发布（供自动化接口读取）。
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'assets', 'system', 'wm.ns');
let s = fs.readFileSync(file, 'utf8');
const pairs = [
  [`func open_sys_window(childId, title) {
    var wid = nextWid;`, `func open_sys_window(childId, title) {
    for (var ew in wins) {
        if (ew.kind == "sys" && ew.sys == childId) {
            if (ew.min) { ew.min = false; }
            focus_win(ew.id);
            return ew.id;
        }
    }
    var wid = nextWid;`],
  [`    var w = {id: wid, kind: "proj", src: m.src, srcwin: m.srcwin, view: m.view, sys: m.src, title: m.title, pid: -1, x: 200 + (n % 5) * 30, y: 90 + (n % 5) * 24, w: 760, h: 500, min: false, max: false, rest: nil, projs: []};`,
   `    var w = {id: wid, kind: "proj", src: m.src, srcwin: m.srcwin, view: m.view, sys: m.src, app: m.app, title: m.title, pid: -1, x: 200 + (n % 5) * 30, y: 90 + (n % 5) * 24, w: 760, h: 500, min: false, max: false, rest: nil, projs: []};`],
  [`    } else if (m.type == "open-kid") {
        open_sys_window(m.sys, m.title);
    } else if (m.type == "ready") {`, `    } else if (m.type == "open-kid") {
        open_sys_window(m.sys, m.title);
    } else if (m.type == "ready") {`],
  [`    } else if (t == "kid-window-close") {
        remove_win(m.win);`, `    } else if (t == "kid-window-close") {
        remove_win(m.win);
    } else if (t == "kid-gone") {
        for (var kw in wins) {
            if (kw.kind == "sys" && kw.sys == m.sys) { remove_win(kw.id); }
        }`],
  [`func compose() {
    var L = [];`, `// 发布窗口与投送列表（供自动化接口 inspect() 读取）
func publish_state() {
    var list = [];
    var projs = [];
    for (var w in wins) {
        var st = "normal";
        if (w.min) { st = "minimized"; }
        else if (w.max) { st = "maximized"; }
        if (!w.min && focusWid == w.id) { st = st + "-focused"; }
        var app = "system";
        if (w.kind == "app") { app = w.app; }
        if (w.kind == "proj") { app = w.app; }
        if (w.kind == "sys") { app = "system"; }
        if (w.kind == "proj") {
            push(projs, {windowId: w.id, systemId: SELF, sourceSystemId: w.src, sourceWindowId: w.srcwin, sourceAppId: w.app, state: st, view: w.view});
        } else {
            push(list, {id: w.id, systemId: SELF, appId: app, title: w.title, state: st, kind: w.kind, childSystemId: pick(w.kind == "sys", w.sys, "")});
        }
    }
    sys_res_put("windows", list);
    sys_res_put("projections", projs);
}

func compose() {
    publish_state();
    var L = [];`],
];
for (const [a, b] of pairs) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('anchor ' + n + ': ' + a.slice(0, 70));
  s = s.replace(a, () => b);
}
fs.writeFileSync(file, s);
console.log('wm patched');
