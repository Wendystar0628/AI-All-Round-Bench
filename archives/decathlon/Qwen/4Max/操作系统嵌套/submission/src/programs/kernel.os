// NestedOS 内核程序（运行于父系统的承载进程）
// 本文件是普通程序文件：修改并保存后，重启对应子系统即按新规则运行。
// 职责：进程表、调度、消息投递、文件系统、系统调用分发、子系统承载。
var boot = sys_boot();
var files = boot.files;
var procs = {};
var nextPid = 10;
var inboxes = {};
var timers = [];
var waitRecv = {};
var pendingSpawns = {};
var pendingChildren = {};
var nextReq = 1;
var compilerPid = 2;
var wmPid = 0;
var children = {};
var now = 0;
var cfg = { budget: boot.budget, memory: boot.memory, storage: boot.storage, grantCap: boot.grantCap };
var windows = [];
var focusWindow = 0;
var subscriptions = {};
var rrIndex = 0;
var kernelWork = 0;

fn pkey(pid) { return "p" + str(pid); }
fn getProc(pid) { return procs[pkey(pid)]; }
fn storageUsed() {
  var total = 0;
  var ks = keys(files);
  var i = 0;
  while (i < len(ks)) {
    var f = files[ks[i]];
    if (!f.dir) { total = total + len(f.content); }
    i = i + 1;
  }
  return total;
}
fn memUsed() {
  var total = 0;
  var ks = keys(procs);
  var i = 0;
  while (i < len(ks)) { total = total + procs[ks[i]].mem; i = i + 1; }
  return total;
}
fn normPath(path) {
  var parts = split(path, "/");
  var out = [];
  var i = 0;
  while (i < len(parts)) {
    var p = parts[i];
    if (p == "" || p == ".") { i = i + 1; continue; }
    if (p == "..") { if (len(out) > 0) { pop(out); } }
    else { push(out, p); }
    i = i + 1;
  }
  return "/" + join(out, "/");
}
fn parentPath(path) {
  var parts = split(path, "/");
  var out = [];
  var i = 0;
  while (i < len(parts) - 1) { if (parts[i] != "") { push(out, parts[i]); } i = i + 1; }
  return "/" + join(out, "/");
}
fn baseName(path) {
  var parts = split(path, "/");
  return parts[len(parts) - 1];
}
fn ensureDir(path) {
  if (path == "/" || path == "") { return true; }
  if (has(files, path)) { return files[path].dir; }
  var par = parentPath(path);
  if (!ensureDir(par)) { return false; }
  files[path] = { dir: true, content: "" };
  return true;
}
fn sortItems(items) {
  var i = 1;
  while (i < len(items)) {
    var cur = items[i];
    var j = i - 1;
    while (j >= 0 && items[j].name > cur.name) {
      items[j + 1] = items[j];
      j = j - 1;
    }
    items[j + 1] = cur;
    i = i + 1;
  }
  return items;
}
fn deliver(pid, msg) {
  if (pid == 1) { sys_host_selfmsg(msg); return true; }
  var p = getProc(pid);
  if (!p || p.state == "exited" || p.state == "error") { return false; }
  if (p.kind == "child") { sys_host_child_event(pid, msg); return true; }
  if (has(waitRecv, pkey(pid))) {
    del(waitRecv, pkey(pid));
    p.state = "ready";
    p.waitInfo = null;
    sys_reply(pid, msg);
    return true;
  }
  if (!has(inboxes, pkey(pid))) { inboxes[pkey(pid)] = []; }
  push(inboxes[pkey(pid)], msg);
  return true;
}
fn addProc(pid, name, path, kind) {
  procs[pkey(pid)] = { pid: pid, name: name, path: path, kind: kind, state: "ready", work: 0, mem: 2048, error: null, cap: 8000, windowId: 0, waitInfo: null, args: null, childId: 0 };
  inboxes[pkey(pid)] = [];
}
fn requestCompile(source, kind, info) {
  var reqId = nextReq; nextReq = nextReq + 1;
  if (kind == "spawn") { pendingSpawns["r" + str(reqId)] = info; }
  else { pendingChildren["r" + str(reqId)] = info; }
  deliver(compilerPid, { type: "compile", reqId: reqId, source: source });
}
fn finishSpawn(reqId, ok, program, err) {
  var info = pendingSpawns["r" + str(reqId)];
  del(pendingSpawns, "r" + str(reqId));
  if (!info) { return; }
  var result = { ok: false, error: err };
  var newPid = 0;
  if (ok) {
    var pid = nextPid; nextPid = nextPid + 1;
    addProc(pid, info.name, info.path, "user");
    procs[pkey(pid)].args = info.args;
    var r = sys_newvm(pid, program, info.args);
    if (has(r, "error")) {
      procs[pkey(pid)].state = "error";
      procs[pkey(pid)].error = r.error;
      result = { ok: false, error: r.error };
    } else {
      procs[pkey(pid)].mem = r.mem;
      result = { ok: true, pid: pid };
      newPid = pid;
    }
  }
  if (info.caller == 1) {
    result.type = "spawn_result";
    result.tag = info.tag;
    sys_host_selfmsg(result);
  } else {
    var cp = getProc(info.caller);
    if (cp && cp.state == "waiting" && cp.waitInfo == "spawn") { cp.state = "ready"; cp.waitInfo = null; }
    sys_reply(info.caller, result);
  }
}
fn finishChild(reqId, ok, program, err) {
  var info = pendingChildren["r" + str(reqId)];
  del(pendingChildren, "r" + str(reqId));
  if (!info) { return; }
  var result = { ok: false, error: err };
  if (ok) {
    var r = sys_child_spawn(info.name, program, info.overrides);
    if (has(r, "error")) { result = { ok: false, error: r.error }; }
    else {
      var pid = r.hostPid;
      nextPid = nextPid + 1;
      addProc(pid, info.name + " 承载", "/System/kernel.os", "child");
      procs[pkey(pid)].childId = r.id;
      children[pkey(pid)] = { hostPid: pid, id: r.id, name: info.name };
      result = { ok: true, pid: pid, id: r.id };
      if (wmPid != 0) { deliver(wmPid, { type: "child_ready", payload: { hostPid: pid, id: r.id, name: info.name } }); }
    }
  }
  if (info.caller == 1) {
    result.type = "child_result";
    sys_host_selfmsg(result);
  } else {
    var cp = getProc(info.caller);
    if (cp && cp.state == "waiting" && cp.waitInfo == "spawn") { cp.state = "ready"; cp.waitInfo = null; }
    sys_reply(info.caller, result);
  }
}
// ---------- 系统调用分发 ----------
fn handleSyscall(pid, call, args) {
  var p = getProc(pid);
  if (!p) { return; }
  if (call == "sys_self") { sys_reply(pid, pid); return; }
  if (call == "sys_time") { sys_reply(pid, now); return; }
  if (call == "sys_args") { sys_reply(pid, p.args); return; }
  if (call == "sys_wait") {
    var ms = args[0];
    if (ms <= 0) { sys_reply(pid, null); return; }
    p.state = "waiting"; p.waitInfo = "timer";
    push(timers, { pid: pid, at: now + ms / 1000 });
    return;
  }
  if (call == "sys_recv") {
    var box = inboxes[pkey(pid)];
    if (len(box) > 0) {
      var m = box[0];
      var rest = [];
      var i = 1;
      while (i < len(box)) { push(rest, box[i]); i = i + 1; }
      inboxes[pkey(pid)] = rest;
      sys_reply(pid, m);
      return;
    }
    p.state = "waiting"; p.waitInfo = "recv";
    waitRecv[pkey(pid)] = true;
    return;
  }
  if (call == "sys_poll") {
    var box2 = inboxes[pkey(pid)];
    if (len(box2) > 0) {
      var m2 = box2[0];
      var rest2 = [];
      var j = 1;
      while (j < len(box2)) { push(rest2, box2[j]); j = j + 1; }
      inboxes[pkey(pid)] = rest2;
      sys_reply(pid, m2);
    } else { sys_reply(pid, null); }
    return;
  }
  if (call == "sys_recv_timeout") {
    var boxT = inboxes[pkey(pid)];
    if (len(boxT) > 0) {
      var mT = boxT[0];
      var restT = [];
      var jT = 1;
      while (jT < len(boxT)) { push(restT, boxT[jT]); jT = jT + 1; }
      inboxes[pkey(pid)] = restT;
      sys_reply(pid, mT);
      return;
    }
    p.state = "waiting"; p.waitInfo = "recv";
    waitRecv[pkey(pid)] = true;
    push(timers, { pid: pid, at: now + args[0] / 1000, timeout: true });
    return;
  }
  if (call == "sys_register") {
    if (wmPid != 0) {
      deliver(wmPid, { type: "register", from: pid, payload: { appId: args[0], title: args[1], w: args[2], h: args[3] } });
      sys_reply(pid, { ok: true });
    } else { sys_reply(pid, { ok: false, error: "窗口管理器未就绪" }); }
    return;
  }
  if (call == "sys_send") {
    var to = args[0];
    var tp = getProc(to);
    if (!tp || tp.state == "exited" || tp.state == "error") {
      sys_reply(pid, { ok: false, error: "目标进程不存在: " + str(to) });
      return;
    }
    var payload = copy(args[2]);
    deliver(to, { from: pid, type: args[1], payload: payload });
    sys_reply(pid, { ok: true });
    return;
  }
  if (call == "sys_spawn") {
    var path = normPath(args[0]);
    if (!has(files, path) || files[path].dir) { sys_reply(pid, { ok: false, error: "程序文件不存在: " + path }); return; }
    var nm = args[1];
    if (nm == null) { nm = baseName(path); }
    requestCompile(files[path].content, "spawn", { caller: pid, name: nm, path: path, args: args[2], tag: "" });
    p.state = "waiting"; p.waitInfo = "spawn";
    return;
  }
  if (call == "sys_exit") {
    p.state = "exited";
    sys_dropvm(pid);
    sys_reply(pid, null);
    return;
  }
  if (call == "sys_kill") {
    var tp2 = getProc(args[0]);
    if (tp2 && tp2.state != "exited") {
      tp2.state = "exited";
      sys_dropvm(args[0]);
      if (tp2.kind == "child") { sys_child_cmd(args[0], "shutdown", {}); }
    }
    sys_reply(pid, { ok: true });
    return;
  }
  if (call == "sys_suspend") {
    var tp3 = getProc(args[0]);
    if (tp3 && tp3.state != "exited" && tp3.state != "error") { tp3.state = "suspended"; sys_suspendvm(args[0]); }
    sys_reply(pid, { ok: true });
    return;
  }
  if (call == "sys_resume_proc") {
    var tp4 = getProc(args[0]);
    if (tp4 && tp4.state == "suspended") {
      if (tp4.waitInfo == "recv") { tp4.state = "waiting"; waitRecv[pkey(args[0])] = true; }
      else if (tp4.waitInfo != null) { tp4.state = "waiting"; }
      else { tp4.state = "ready"; }
      sys_resumevm(args[0]);
    }
    sys_reply(pid, { ok: true });
    return;
  }
  if (call == "sys_read") {
    var rp = normPath(args[0]);
    if (!has(files, rp) || files[rp].dir) { sys_reply(pid, { ok: false, error: "文件不存在: " + rp }); return; }
    sys_reply(pid, { ok: true, content: files[rp].content });
    return;
  }
  if (call == "sys_write") {
    var wp = normPath(args[0]);
    var content = args[1];
    if (type(content) != "string") { content = json_str(content); }
    var oldLen = 0;
    if (has(files, wp) && !files[wp].dir) { oldLen = len(files[wp].content); }
    if (storageUsed() - oldLen + len(content) > cfg.storage) {
      sys_reply(pid, { ok: false, error: "存储配额不足" });
      return;
    }
    var par = parentPath(wp);
    if (!ensureDir(par)) { sys_reply(pid, { ok: false, error: "父目录不是目录: " + par }); return; }
    files[wp] = { dir: false, content: content };
    sys_reply(pid, { ok: true });
    return;
  }
  if (call == "sys_list") {
    var lp = normPath(args[0]);
    if (lp != "/" && (!has(files, lp) || !files[lp].dir)) { sys_reply(pid, { ok: false, error: "目录不存在: " + lp }); return; }
    var items = [];
    var ks = keys(files);
    var i = 0;
    while (i < len(ks)) {
      var k = ks[i];
      if (k != lp && parentPath(k) == lp) {
        push(items, { name: baseName(k), path: k, dir: files[k].dir, size: len(files[k].content) });
      }
      i = i + 1;
    }
    sortItems(items);
    sys_reply(pid, { ok: true, items: items });
    return;
  }
  if (call == "sys_mkdir") {
    var mp = normPath(args[0]);
    if (has(files, mp)) { sys_reply(pid, { ok: false, error: "路径已存在" }); return; }
    ensureDir(mp);
    sys_reply(pid, { ok: true });
    return;
  }
  if (call == "sys_delete") {
    var dp = normPath(args[0]);
    if (!has(files, dp)) { sys_reply(pid, { ok: false, error: "路径不存在" }); return; }
    var ks2 = keys(files);
    var i2 = 0;
    while (i2 < len(ks2)) {
      var k2 = ks2[i2];
      if (k2 == dp || starts(k2, dp + "/")) { del(files, k2); }
      i2 = i2 + 1;
    }
    sys_reply(pid, { ok: true });
    return;
  }
  if (call == "sys_rename") {
    var src = normPath(args[0]); var dst = normPath(args[1]);
    if (!has(files, src)) { sys_reply(pid, { ok: false, error: "源不存在" }); return; }
    if (has(files, dst)) { sys_reply(pid, { ok: false, error: "目标已存在" }); return; }
    var ks3 = keys(files);
    var i3 = 0;
    while (i3 < len(ks3)) {
      var k3 = ks3[i3];
      if (k3 == src) { files[dst] = files[k3]; del(files, k3); }
      else if (starts(k3, src + "/")) {
        var nk = dst + sub(k3, len(src), len(k3) - len(src));
        files[nk] = files[k3]; del(files, k3);
      }
      i3 = i3 + 1;
    }
    sys_reply(pid, { ok: true });
    return;
  }
  if (call == "sys_fcopy") {
    var cs = normPath(args[0]); var cd = normPath(args[1]);
    if (!has(files, cs)) { sys_reply(pid, { ok: false, error: "源不存在" }); return; }
    if (has(files, cd) && !args[2]) { sys_reply(pid, { ok: false, error: "目标已存在", exists: true }); return; }
    if (storageUsed() + len(files[cs].content) > cfg.storage) { sys_reply(pid, { ok: false, error: "存储配额不足" }); return; }
    ensureDir(parentPath(cd));
    files[cd] = { dir: files[cs].dir, content: files[cs].content };
    sys_reply(pid, { ok: true });
    return;
  }
  if (call == "sys_exists") { sys_reply(pid, has(files, normPath(args[0]))); return; }
  if (call == "sys_stat") {
    var sp = normPath(args[0]);
    if (!has(files, sp)) { sys_reply(pid, { ok: false, error: "不存在" }); return; }
    sys_reply(pid, { ok: true, dir: files[sp].dir, size: len(files[sp].content) });
    return;
  }
  if (call == "sys_display") {
    sys_host_display(pid, args[0]);
    sys_reply(pid, { ok: true });
    return;
  }
  if (call == "sys_scene") {
    var sr = sys_host_scene(pid, args[0]);
    sys_reply(pid, sr);
    return;
  }
  if (call == "sys_scene_state") {
    sys_host_scene_state(pid, args[0], args[1]);
    sys_reply(pid, { ok: true });
    return;
  }
  if (call == "sys_scene_close") {
    sys_host_scene_close(pid, args[0]);
    sys_reply(pid, { ok: true });
    return;
  }
  if (call == "sys_ps") {
    sys_reply(pid, psResult());
    return;
  }
  if (call == "sys_log") {
    sys_host_log(pid, args[0]);
    sys_reply(pid, { ok: true });
    return;
  }
  if (call == "sys_set") {
    var key = args[0]; var val = args[1];
    if (key == "budget") { cfg.budget = val; }
    else if (key == "memory") { cfg.memory = val; }
    else if (key == "storage") { cfg.storage = val; }
    else if (key == "grantCap") { cfg.grantCap = val; }
    else if (key == "cap") {
      var cp = getProc(args[1]);
      if (cp) { cp.cap = args[2]; }
    }
    else if (key == "childGrant") {
      var ce = children[pkey(args[1])];
      if (ce != null) { ce.grant = args[2]; }
    }
    sys_reply(pid, { ok: true, cfg: copy(cfg) });
    return;
  }
  if (call == "sys_request") {
    var rr = sys_host_request(pid, args[0], args[1]);
    sys_reply(pid, rr);
    return;
  }
  if (call == "sys_subscribe") {
    var sub = sys_host_request(pid, "sheet.subscribe", args[0]);
    if (has(sub, "subId")) { subscriptions["s" + str(sub.subId)] = { pid: pid, subId: sub.subId }; }
    sys_reply(pid, sub);
    return;
  }
  if (call == "sys_unsubscribe") {
    sys_host_request(pid, "sheet.unsubscribe", args[0]);
    del(subscriptions, "s" + str(args[0].subId));
    sys_reply(pid, { ok: true });
    return;
  }
  if (call == "sys_windows") {
    windows = args[0];
    focusWindow = args[1];
    sys_host_windows(args[0], args[1]);
    sys_reply(pid, { ok: true });
    return;
  }
  if (call == "sys_child_create") {
    var kpath = "/System/kernel.os";
    if (!has(files, kpath)) { sys_reply(pid, { ok: false, error: "缺少内核源文件 /System/kernel.os" }); return; }
    requestCompile(files[kpath].content, "child", { caller: pid, name: args[0], overrides: args[1] });
    p.state = "waiting"; p.waitInfo = "spawn";
    return;
  }
  if (call == "sys_child_cmd") {
    var cr = sys_child_cmd(args[0], args[1], args[2]);
    sys_reply(pid, cr);
    return;
  }
  if (call == "sys_child_list") {
    sys_reply(pid, childrenResult());
    return;
  }
  if (call == "sys_meminfo") {
    sys_reply(pid, { ok: true, memUsed: memUsed(), memCap: cfg.memory, storageUsed: storageUsed(), storageCap: cfg.storage });
    return;
  }
  if (call == "sys_recompile") {
    if (!has(files, "/System/compiler.os")) { sys_reply(pid, { ok: false, error: "缺少编译器源文件" }); return; }
    requestCompile(files["/System/compiler.os"].content, "spawn", { caller: pid, name: "编译器", path: "/System/compiler.os", args: null, recompile: true, tag: "recompile" });
    p.state = "waiting"; p.waitInfo = "spawn";
    return;
  }
  sys_reply(pid, { ok: false, error: "未知系统调用: " + call });
}
fn psResult() {
  var out = [];
  var ks = keys(procs);
  var i = 0;
  while (i < len(ks)) {
    var pr = procs[ks[i]];
    var box = inboxes[pkey(pr.pid)];
    push(out, { pid: pr.pid, name: pr.name, path: pr.path, kind: pr.kind, state: pr.state, work: pr.work, mem: pr.mem, error: pr.error, cap: pr.cap, queued: len(box), waitInfo: pr.waitInfo, childId: pr.childId });
    i = i + 1;
  }
  return { ok: true, procs: out, now: now, cfg: copy(cfg), storageUsed: storageUsed(), memUsed: memUsed(), kernelWork: kernelWork };
}
fn childrenResult() {
  var out2 = [];
  var ks2 = keys(children);
  var i2 = 0;
  while (i2 < len(ks2)) {
    var c = children[ks2[i2]];
    var info = sys_child_cmd(c.hostPid, "info", {});
    var grant = has(c, "grant") ? c.grant : cfg.grantCap;
    push(out2, { hostPid: c.hostPid, id: c.id, name: c.name, state: info.state, clock: info.clock, speed: info.speed, work: info.work, paused: info.paused, grant: grant });
    i2 = i2 + 1;
  }
  return { ok: true, children: out2 };
}
// ---------- 调度 ----------
fn schedule(budget) {
  var remaining = budget;
  var guard = 0;
  while (remaining > 200 && guard < 40) {
    guard = guard + 1;
    var ks = keys(procs);
    if (len(ks) == 0) { break; }
    var ran = 0;
    var i = 0;
    while (i < len(ks)) {
      var p = procs[ks[(rrIndex + i) % len(ks)]];
      if (p.state == "ready" && p.kind != "kernel" && remaining > 200) {
        var slice = p.cap;
        if (slice > remaining) { slice = remaining; }
        if (p.kind == "child") {
          var gcap = cfg.grantCap;
          var ce = children[pkey(p.pid)];
          if (ce != null && has(ce, "grant") && ce.grant < gcap) { gcap = ce.grant; }
          if (slice > gcap) { slice = gcap; }
        }
        var r = sys_slice(p.pid, slice);
        remaining = remaining - r.work;
        ran = ran + r.work;
        p.work = p.work + r.work;
        if (has(r, "mem")) { p.mem = r.mem; }
        if (r.status == "syscall") {
          handleSyscall(p.pid, r.call, r.args);
        } else if (r.status == "done" || r.status == "exit") {
          p.state = "exited";
          sys_dropvm(p.pid);
          if (wmPid != 0) { deliver(wmPid, { type: "proc_exited", payload: { pid: p.pid } }); }
        } else if (r.status == "error") {
          p.state = "error"; p.error = r.error;
          sys_dropvm(p.pid);
          sys_host_notify("进程错误", p.name + ": " + r.error);
          if (wmPid != 0) { deliver(wmPid, { type: "proc_exited", payload: { pid: p.pid, error: r.error } }); }
        } else if (r.status == "paused") {
          p.state = "paused";
        }
      }
      i = i + 1;
    }
    rrIndex = (rrIndex + 1) % (len(ks) + 1);
    if (ran == 0) { break; }
  }
}
fn tickTimers() {
  var keep = [];
  var i = 0;
  while (i < len(timers)) {
    var t = timers[i];
    var p = getProc(t.pid);
    if (!p || p.state == "exited" || p.state == "error") { i = i + 1; continue; }
    if (t.timeout) {
      if (p.state == "waiting" && p.waitInfo == "recv" && has(waitRecv, pkey(t.pid))) {
        if (t.at <= now) {
          del(waitRecv, pkey(t.pid));
          p.state = "ready"; p.waitInfo = null;
          sys_reply(t.pid, null);
        } else { push(keep, t); }
      }
    } else {
      if (p.state == "waiting" && p.waitInfo == "timer") {
        if (t.at <= now) {
          p.state = "ready"; p.waitInfo = null;
          sys_reply(t.pid, null);
        } else { push(keep, t); }
      }
    }
    i = i + 1;
  }
  timers = keep;
}
fn handleEvent(ev) {
  var t = ev.type;
  if (t == "tick") {
    now = ev.now;
    kernelWork = ev.kernelWork;
    tickTimers();
    schedule(ev.budget);
    if (wmPid != 0) { deliver(wmPid, { type: "wm_tick", payload: { now: now } }); }
    return;
  }
  if (t == "syscall") { handleSyscall(ev.pid, ev.call, ev.args); return; }
  if (t == "input") {
    if (wmPid != 0) { deliver(wmPid, { type: "input", payload: ev.event }); }
    return;
  }
  if (t == "proj_input") {
    deliver(ev.pid, { type: "input", payload: ev.event, projected: true });
    return;
  }
  if (t == "data") {
    var s = subscriptions["s" + str(ev.subId)];
    if (s) { deliver(s.pid, { type: "data", payload: { subId: ev.subId, version: ev.version, data: ev.data, closed: ev.closed } }); }
    return;
  }
  if (t == "compiled") {
    var pl = ev.payload;
    if (has(pendingSpawns, "r" + str(pl.reqId))) {
      var info = pendingSpawns["r" + str(pl.reqId)];
      if (info.tag == "kernel_compiled") {
        del(pendingSpawns, "r" + str(pl.reqId));
        sys_host_selfmsg({ type: "spawn_result", ok: pl.ok, program: pl.program, error: pl.error, tag: "kernel_compiled", mgmtReq: info.mgmtReq });
        return;
      }
      if (info.recompile) {
        del(pendingSpawns, "r" + str(pl.reqId));
        if (pl.ok) {
          sys_recompile(compilerPid, pl.program);
          var cp = getProc(info.caller);
          if (info.caller == 1) { sys_host_selfmsg({ type: "spawn_result", ok: true, pid: compilerPid, tag: "recompile" }); }
          else {
            if (cp && cp.state == "waiting") { cp.state = "ready"; cp.waitInfo = null; }
            sys_reply(info.caller, { ok: true, pid: compilerPid, recompiled: true });
          }
        } else {
          if (info.caller == 1) { sys_host_selfmsg({ type: "spawn_result", ok: false, error: pl.error, tag: "recompile" }); }
          else { sys_reply(info.caller, { ok: false, error: pl.error }); }
        }
        return;
      }
      finishSpawn(pl.reqId, pl.ok, pl.program, pl.error);
    } else {
      finishChild(pl.reqId, pl.ok, pl.program, pl.error);
    }
    return;
  }
  if (t == "spawn_result") {
    if (ev.tag == "wm" && ev.ok) { wmPid = ev.pid; }
    if (ev.tag == "kernel_compiled") { sys_host_reply(ev.mgmtReq, { ok: ev.ok, program: ev.program, error: ev.error }); }
    if (ev.tag == "adopt") {
      if (ev.ok) {
        addProc(ev.hostPid, ev.name + " 承载", "/System/kernel.os", "child");
        procs[pkey(ev.hostPid)].childId = ev.id;
        children[pkey(ev.hostPid)] = { hostPid: ev.hostPid, id: ev.id, name: ev.name };
      }
      sys_host_reply(ev.mgmtReq, { ok: ev.ok, id: ev.id, hostPid: ev.hostPid, error: ev.error });
    }
    return;
  }
  if (t == "mgmt") {
    var a = ev.action; var args = ev.args; var rid = ev.reqId;
    var result = { ok: true };
    if (a == "launch") {
      var path = args.path;
      if (!has(files, path)) { result = { ok: false, error: "程序不存在: " + path }; }
      else {
        requestCompile(files[path].content, "spawn", { caller: 1, name: args.name, path: path, args: args.args, tag: "launch" });
        result = { ok: true, pending: true };
      }
    } else if (a == "child_create") {
      requestCompile(files["/System/kernel.os"].content, "child", { caller: 1, name: args.name, overrides: null });
      result = { ok: true, pending: true };
    } else if (a == "child_cmd") {
      result = sys_child_cmd(args.hostPid, args.cmd, args.args);
    } else if (a == "set") {
      if (args.key == "budget") { cfg.budget = args.value; }
      else if (args.key == "memory") { cfg.memory = args.value; }
      else if (args.key == "storage") { cfg.storage = args.value; }
      else if (args.key == "grantCap") { cfg.grantCap = args.value; }
      else if (args.key == "cap") { var cp2 = getProc(args.pid); if (cp2) { cp2.cap = args.value; } }
      else if (args.key == "childGrant") { var ce2 = children[pkey(args.pid)]; if (ce2 != null) { ce2.grant = args.value; } }
      result = { ok: true, cfg: copy(cfg) };
    } else if (a == "proc_cmd") {
      var tp = getProc(args.pid);
      if (!tp) { result = { ok: false, error: "进程不存在" }; }
      else if (args.cmd == "suspend") { if (tp.state != "exited" && tp.state != "error") { tp.state = "suspended"; sys_suspendvm(args.pid); } }
      else if (args.cmd == "resume") {
        if (tp.state == "suspended") {
          if (tp.waitInfo == "recv") { tp.state = "waiting"; waitRecv[pkey(args.pid)] = true; }
          else if (tp.waitInfo != null) { tp.state = "waiting"; }
          else { tp.state = "ready"; }
          sys_resumevm(args.pid);
        }
      }
      else if (args.cmd == "kill") { tp.state = "exited"; sys_dropvm(args.pid); if (tp.kind == "child") { sys_child_cmd(args.pid, "shutdown", {}); } }
      else if (args.cmd == "cap") { tp.cap = args.value; }
    } else if (a == "ps") {
      result = psResult();
    } else if (a == "children") {
      result = childrenResult();
    } else if (a == "write_file") {
      var wp = normPath(args.path);
      var oldLen = 0;
      if (has(files, wp) && !files[wp].dir) { oldLen = len(files[wp].content); }
      if (storageUsed() - oldLen + len(args.content) > cfg.storage) { result = { ok: false, error: "存储配额不足" }; }
      else { ensureDir(parentPath(wp)); files[wp] = { dir: false, content: args.content }; }
    } else if (a == "read_file") {
      var rp = normPath(args.path);
      if (!has(files, rp)) { result = { ok: false, error: "文件不存在" }; }
      else { result = { ok: true, content: files[rp].content }; }
    } else if (a == "list_files") {
      var lp2 = normPath(args.path);
      var items2 = [];
      var ksF = keys(files);
      var iF = 0;
      while (iF < len(ksF)) {
        var kF = ksF[iF];
        if (kF != lp2 && parentPath(kF) == lp2) { push(items2, { name: baseName(kF), path: kF, dir: files[kF].dir, size: len(files[kF].content) }); }
        iF = iF + 1;
      }
      sortItems(items2);
      result = { ok: true, items: items2 };
    } else if (a == "recompile_compiler") {
      requestCompile(files["/System/compiler.os"].content, "spawn", { caller: 1, name: "编译器", path: "/System/compiler.os", args: null, recompile: true, tag: "recompile" });
      result = { ok: true, pending: true };
    } else if (a == "compile_kernel") {
      requestCompile(files["/System/kernel.os"].content, "spawn", { caller: 1, name: "内核", path: "/System/kernel.os", args: null, tag: "kernel_compiled", mgmtReq: rid });
      result = { ok: true, pending: true };
      sys_host_reply(rid, result);
      return;
    } else if (a == "adopt_child") {
      var ar = sys_child_adopt(args.name, args.node);
      if (has(ar, "error")) { result = { ok: false, error: ar.error }; }
      else {
        result = { ok: true, pending: true };
        sys_host_selfmsg({ type: "spawn_result", ok: true, tag: "adopt", hostPid: ar.hostPid, id: ar.id, name: args.name, mgmtReq: rid });
      }
    } else if (a == "projection_open") {
      if (wmPid != 0) { deliver(wmPid, { type: "projection_open", payload: args }); }
    } else if (a == "projection_close") {
      if (wmPid != 0) { deliver(wmPid, { type: "projection_close", payload: args }); }
    }
    sys_host_reply(rid, result);
    return;
  }
  if (t == "wm_launch") {
    var path2 = ev.payload.path;
    if (has(files, path2)) {
      requestCompile(files[path2].content, "spawn", { caller: wmPid, name: ev.payload.name, path: path2, args: ev.payload.args, tag: "" });
    } else {
      deliver(wmPid, { type: "spawn_result", ok: false, error: "程序不存在: " + path2 });
    }
    return;
  }
  if (t == "child_event") {
    if (wmPid != 0) { deliver(wmPid, { type: "child_event", payload: ev }); }
    return;
  }
  if (t == "viewport") {
    if (wmPid != 0) { deliver(wmPid, { type: "viewport", payload: { w: ev.w, h: ev.h } }); }
    return;
  }
  if (t == "req_reply") {
    deliver(ev.pid, { type: "host_reply", payload: { reqId: ev.reqId, result: ev.result } });
    return;
  }
  if (t == "drop") {
    deliver(ev.pid, { type: "drop", payload: ev.payload });
    return;
  }
  if (t == "drag_hover") {
    deliver(ev.pid, { type: "drag_hover", payload: ev.payload });
    return;
  }
  if (t == "system_restored") {
    var ksR = keys(procs);
    var iR = 0;
    while (iR < len(ksR)) {
      var pR = procs[ksR[iR]];
      if (pR.kind == "user") { deliver(pR.pid, { type: "system_restored", payload: {} }); }
      iR = iR + 1;
    }
    return;
  }
}
// ---------- 启动 ----------
files["/"] = { dir: true, content: "" };
ensureDir("/Documents");
ensureDir("/Snapshots");
addProc(1, "内核", "/System/kernel.os", "kernel");
addProc(2, "编译器", "/System/compiler.os", "compiler");
sys_newvm(2, boot.compilerProgram, null);
requestCompile(files["/System/wm.os"].content, "spawn", { caller: 1, name: "窗口管理器", path: "/System/wm.os", args: null, tag: "wm" });
var bootChildren = boot.children;
var ci = 0;
while (ci < len(bootChildren)) {
  var bc = bootChildren[ci];
  requestCompile(files["/System/kernel.os"].content, "child", { caller: 1, name: bc.name, overrides: bc });
  ci = ci + 1;
}
while (true) {
  var ev = sys_recv();
  handleEvent(ev);
}
