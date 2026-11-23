'use strict';
// 一次性修补内核：带超时的接收、进程挂起/继续/结束、消息输出查询、工作簿登记与订阅路由。
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'assets', 'system', 'kernel.ns');
let s = fs.readFileSync(file, 'utf8');
function rep(a, b) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('anchor count ' + n + ': ' + a.slice(0, 80));
  s = s.replace(a, () => b);
}

// 全局：工作簿登记表
rep(`var ROOT_FILES = [];`, `var ROOT_FILES = [];
var books = {};`);

// 定时接收：等待消息的同时设定唤醒时间
rep(`func deliver(pid, msg) {
    var q = procs[pid];
    if (q.state == "recv") {
        resume(pid, msg);
    } else {
        push(q.mbox, msg);
    }
}`, `func deliver(pid, msg) {
    var q = procs[pid];
    if (q.state == "recv") {
        q.timed = false;
        resume(pid, msg);
    } else {
        push(q.mbox, msg);
    }
}`);

rep(`func wake_sleepers() {
    var now = clock();
    for (var p in procs) {
        if (p.state == "sleep" && now >= p.wake) {
            resume(p.pid, nil);
        }
    }
}`, `func wake_sleepers() {
    var now = clock();
    for (var p in procs) {
        if (p.state == "sleep" && now >= p.wake) {
            resume(p.pid, nil);
        } else if (p.state == "recv" && p.timed == true && now >= p.wake) {
            p.timed = false;
            resume(p.pid, nil);
        }
    }
}`);

// 挂起的进程不参与调度
rep(`        if (p.state == "ready") {
            if (p.quota > 0) {`, `        if (p.state == "ready") {
            if (p.quota > 0) {`);

rep(`    } else if (name == "sys_recv") {
        if (len(p.mbox) > 0) {
            var m = p.mbox[0];
            p.mbox = slice(p.mbox, 1, len(p.mbox));
            resume(pid, m);
        } else {
            p.state = "recv";
        }`, `    } else if (name == "sys_recv") {
        if (len(p.mbox) > 0) {
            var m = p.mbox[0];
            p.mbox = slice(p.mbox, 1, len(p.mbox));
            resume(pid, m);
        } else {
            p.state = "recv";
            p.timed = false;
        }
    } else if (name == "sys_recvt") {
        if (len(p.mbox) > 0) {
            var mt = p.mbox[0];
            p.mbox = slice(p.mbox, 1, len(p.mbox));
            resume(pid, mt);
        } else {
            p.state = "recv";
            p.timed = true;
            p.wake = clock() + a[0];
        }
    } else if (name == "sys_proc_ctl") {
        resume(pid, proc_ctl(a[0], a[1]));
    } else if (name == "sys_proc_logs") {
        resume(pid, priv_logs(a[0]));`);

// 发给 "kernel" 的消息交给内核处理（工作簿登记等）
rep(`        var to = a[0];
        if (to == "wm") { to = wmpid; }
        if (isnum(to) && live(to)) {
            deliver(to, clone(a[1]));
            resume(pid, true);
        } else {
            resume(pid, false);
        }`, `        var to = a[0];
        if (to == "wm") { to = wmpid; }
        if (to == "kernel") {
            handle_kernel_msg(clone(a[1]));
            resume(pid, true);
        } else if (isnum(to) && live(to)) {
            deliver(to, clone(a[1]));
            resume(pid, true);
        } else {
            resume(pid, false);
        }`);

// 进程控制
rep(`func count_live() {`, `func proc_ctl(pid, action) {
    if (!isnum(pid) || pid < 0 || pid >= len(procs)) { return fail_res("没有这个进程"); }
    var p = procs[pid];
    if (p.kind == "carrier") { return fail_res("承载进程由子系统控制"); }
    if (action == "suspend") {
        if (p.state == "gone" || p.state == "error" || p.state == "susp") { return fail_res("当前状态不能挂起"); }
        p.prev = p.state;
        p.state = "susp";
        return ok(true);
    }
    if (action == "resume") {
        if (p.state != "susp") { return fail_res("进程没有挂起"); }
        p.state = p.prev;
        return ok(true);
    }
    if (action == "kill") {
        kill_proc(pid);
        return ok(true);
    }
    return fail_res("未知的操作");
}

func count_live() {`);

// 内核消息：工作簿登记、订阅与退订
rep(`    } else if (m.type == "notify") {
        add_note(m.title, m.body);`, `    } else if (m.type == "notify") {
        add_note(m.title, m.body);
    } else if (m.type == "book-open") {
        books[m.path] = m.pid;
    } else if (m.type == "book-close") {
        if (has(books, m.path) && books[m.path] == m.pid) { del(books, m.path); }
    } else if (m.type == "book-sub" || m.type == "book-unsub") {
        route_book(m);`);

// 订阅路由：工作簿未打开时由内核启动一个不带窗口的表格进程来保持数据
rep(`func add_note(title, body) {`, `func route_book(m) {
    var pid = -1;
    if (has(books, m.path) && live(books[m.path])) {
        pid = books[m.path];
    } else if (m.type == "book-sub") {
        var r = spawn_proc("/System/apps/sheet.ns", [0, "sheet", m.path, "hidden"], "proc");
        if (!r.ok) { return; }
        pid = r.value;
        books[m.path] = pid;
    }
    if (pid < 0) { return; }
    var msg = {type: m.type == "book-sub" ? "subscribe" : "unsubscribe", sys: m.sys, pid: m.pid, range: m.range, view: m.view};
    deliver(pid, msg);
}

func add_note(title, body) {`);

fs.writeFileSync(file, s);
console.log('kernel patched');
