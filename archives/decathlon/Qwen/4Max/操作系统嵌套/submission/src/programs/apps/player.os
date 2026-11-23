// 三维场景播放器（子系统内程序）
// 播放位置由时效进程按系统时间推进；画面经显示接口提交；支持投送到祖先桌面。
var me = sys_self();
var args = sys_args();
var W = 680;
var H = 466;
var ACCENT = "#8b5cf6";
var ACCENT2 = "#f5b942";
var BG = "#12152a";
var BG2 = "#1c2140";
var FG = "#e8eaf2";
var FG2 = "#9aa0b8";
var LINE = "rgba(255,255,255,0.09)";
var winId = 0;
var scenePath = "";
var scene = null;
var handle = "";
var duration = 15;
var t = 0;
var playing = false;
var rate = 1;
var loop = false;
var mode = "show";
var camMode = "show";
var orbit = { yaw: 0.7, pitch: 0.35, dist: 22 };
var flightPid = 0;
var effectsPid = 0;
var timelinePid = 0;
var controllerPid = 0;
var flight = null;
var selection = null;
var dirty = true;
var viewDrag = null;
var seekDrag = false;
var rehearsalOpen = false;
var windVal = 0;
var headingVal = 0;
var statusAt = 0;
var openMenu = false;
var fileList = [];
var toastMsg = "";
var toastUntil = 0;
var buttons = [];
var lastReport = "";

fn tw(text, size) {
  var w = 0; var i = 0; var s = str(text);
  while (i < len(s)) { if (ord(sub(s, i, 1)) > 11904) { w = w + size; } else { w = w + size * 0.55; } i = i + 1; }
  return w;
}
fn fmtTime(x) {
  var s = floor(x);
  var ms = floor((x - s) * 10);
  return pad(str(s), 2, "0") + "." + str(ms) + "s";
}
fn toast(msg) { toastMsg = msg; toastUntil = sys_time() + 3.5; dirty = true; }
fn viewRect() { return { x: 0, y: 36, w: W, h: H - 36 - 92 }; }
fn reportStatus() {
  var st = { kind: "player", state: playing ? "playing" : "paused", position: t, duration: duration, rate: rate, scene: scenePath, frameTime: flight != null ? flight.t : t, mode: mode };
  var sig = json_str(st);
  if (sig != lastReport) {
    lastReport = sig;
    sys_request("app.status", { windowId: winId, status: st });
  }
}
fn submitCamera() {
  if (handle == "") { return; }
  var hp = flight != null ? flight.pos : [0, 3, 0];
  var pos = [hp[0] - 14, hp[1] + 6, hp[2] + 16];
  var target = [hp[0], hp[1] + 0.5, hp[2]];
  var fov = 55;
  if (camMode == "show" && scene != null && scene.showCams != null && len(scene.showCams) > 0) {
    var cams = scene.showCams;
    var a = cams[0]; var b = cams[len(cams) - 1];
    var i = 0;
    while (i < len(cams) - 1) {
      if (t >= cams[i].t && t <= cams[i + 1].t) { a = cams[i]; b = cams[i + 1]; break; }
      i = i + 1;
    }
    var k = clamp((t - a.t) / max(0.001, b.t - a.t), 0, 1);
    k = k * k * (3 - 2 * k);
    pos = [hp[0] + a.off[0] + (b.off[0] - a.off[0]) * k, hp[1] + a.off[1] + (b.off[1] - a.off[1]) * k, hp[2] + a.off[2] + (b.off[2] - a.off[2]) * k];
    fov = a.fov + ((b.fov || 55) - a.fov) * k;
  } else if (camMode == "orbit") {
    var cp = cos(orbit.pitch); 
    pos = [target[0] + orbit.dist * cp * sin(orbit.yaw), target[1] + orbit.dist * sin(orbit.pitch), target[2] + orbit.dist * cp * cos(orbit.yaw)];
  }
  sys_scene_state(handle, { part: "cam", t: t, camera: { pos: pos, target: target, fov: fov } });
}
fn killHelpers() {
  if (timelinePid != 0) { sys_kill(timelinePid); timelinePid = 0; }
  if (flightPid != 0) { sys_kill(flightPid); flightPid = 0; }
  if (effectsPid != 0) { sys_kill(effectsPid); effectsPid = 0; }
  if (controllerPid != 0) { sys_kill(controllerPid); controllerPid = 0; }
}
fn openScene(path) {
  var rd = sys_read(path);
  if (!rd.ok) { toast("打开失败: " + rd.error); return; }
  var sc = null;
  sc = json_parse(rd.content);
  if (sc == null || sc.format != "nestedos-scene") { toast("不是有效的场景文件"); return; }
  killHelpers();
  if (handle != "") { sys_scene_close(handle); handle = ""; }
  var sr = sys_scene(sc);
  if (!sr.ok) { toast("场景载入失败: " + sr.error); return; }
  handle = sr.handle;
  scene = sc;
  scenePath = path;
  duration = sc.meta.duration;
  t = 0; playing = false; mode = "show"; camMode = "show";
  flight = null; selection = null;
  var er = sys_spawn("/System/effects.os", "环境特效", [me, path, handle]);
  if (!er.ok) { toast("特效进程启动失败: " + er.error); return; }
  effectsPid = er.pid;
  var fr = sys_spawn("/System/flight.os", "飞行场景", [me, path, handle]);
  if (!fr.ok) { toast("飞行进程启动失败: " + fr.error); return; }
  flightPid = fr.pid;
  var tr = sys_spawn("/System/timeline.os", "播放时序", [me, flightPid, effectsPid, duration]);
  if (!tr.ok) { toast("时序进程启动失败: " + tr.error); return; }
  timelinePid = tr.pid;
  sys_send(flightPid, "init", { effectsPid: effectsPid, mode: "show" });
  sys_send(effectsPid, "init", {});
  submitCamera();
  setTitle();
  reportStatus();
  dirty = true;
}
fn setTitle() {
  var name = scenePath == "" ? "三维场景播放器" : "播放器 · " + baseName(scenePath);
  sys_send(wmPid(), "title", { title: name });
}
fn baseName(p) { var parts = split(p, "/"); return parts[len(parts) - 1]; }
fn openRecord(path) {
  var rd = sys_read(path);
  if (!rd.ok) { toast("打开失败: " + rd.error); return; }
  var rec = json_parse(rd.content);
  if (rec == null || rec.format != "nestedos-flightrec") { toast("不是有效的排演记录"); return; }
  if (scenePath != rec.scene || handle == "") {
    openScene(rec.scene);
  }
  killControllerOnly();
  mode = "replay";
  duration = rec.duration;
  t = 0; playing = false;
  sys_send(timelinePid, "duration", { duration: duration });
  sys_send(timelinePid, "seek", { t: 0 });
  sys_send(flightPid, "mode", { mode: "replay", record: rec, t: 0 });
  sys_send(effectsPid, "reset", {});
  toast("已载入排演记录（回放）");
  reportStatus();
  dirty = true;
}
fn killControllerOnly() {
  if (controllerPid != 0) { sys_kill(controllerPid); controllerPid = 0; }
}
fn startRehearsal(fromRecord) {
  if (handle == "") { toast("请先打开场景"); return; }
  killControllerOnly();
  var cr = sys_spawn("/Controllers/flight-controller.os", "飞控", [flightPid]);
  if (!cr.ok) { toast("飞控启动失败: " + cr.error); return; }
  controllerPid = cr.pid;
  if (fromRecord) {
    sys_send(flightPid, "continue_live", { t: t });
  } else {
    sys_send(flightPid, "mode", { mode: "live" });
  }
  sys_send(flightPid, "input", { kind: "controller", pid: controllerPid });
  sys_send(flightPid, "input", { kind: "wind", value: windVal, value2: 0 });
  sys_send(flightPid, "input", { kind: "heading", value: headingVal });
  mode = "rehearsal";
  playing = true;
  sys_send(timelinePid, "play", { rate: rate });
  toast("排演开始：飞控进程已接管");
  reportStatus();
  dirty = true;
}
fn saveRecord() {
  if (mode != "rehearsal") { toast("排演中才能保存记录"); return; }
  sys_send(flightPid, "get_record", {});
}
fn doPlay() {
  if (handle == "") { return; }
  playing = true;
  sys_send(timelinePid, "play", { rate: rate });
  reportStatus(); dirty = true;
}
fn doPause() {
  playing = false;
  sys_send(timelinePid, "pause", {});
  reportStatus(); dirty = true;
}
fn doStop() {
  playing = false; t = 0;
  sys_send(timelinePid, "stop", {});
  sys_send(effectsPid, "reset", {});
  reportStatus(); dirty = true;
}
fn doStep() {
  playing = false;
  sys_send(timelinePid, "step", {});
  dirty = true;
}
fn doSeek(nt) {
  t = clamp(nt, 0, duration);
  sys_send(timelinePid, "seek", { t: t });
  reportStatus(); dirty = true;
}
fn pickAt(x, y) {
  var vr = viewRect();
  var nx = ((x - vr.x) / vr.w) * 2 - 1;
  var ny = -(((y - vr.y) / vr.h) * 2 - 1);
  var r = sys_request("scene.pick", { handle: handle, nx: nx, ny: ny, w: vr.w, h: vr.h });
  if (r != null && r.part != null) {
    var dmg = 0;
    if (flight != null && flight.crashed) { dmg = 1; }
    selection = { name: r.part, damage: dmg };
    dirty = true;
  } else if (r != null && r.ground != null) {
    if (mode == "rehearsal" && flight != null) {
      var dx = r.ground[0] - flight.pos[0];
      var dz = r.ground[2] - flight.pos[2];
      headingVal = atan2(dz, dx);
      sys_send(flightPid, "input", { kind: "heading", value: headingVal });
      toast("目标航向已设为地面点");
    }
    selection = { name: "地面", damage: 0, point: r.ground };
    dirty = true;
  }
}
// ---------- 绘制 ----------
fn btn(list, id, x, y, w, h, label, icon, kind) {
  var fill = BG2; var fg = FG;
  if (kind == "accent") { fill = ACCENT; fg = "#fff"; }
  if (kind == "active") { fill = "rgba(139,92,246,0.35)"; fg = FG; }
  if (kind == "warn") { fill = "#5a2a33"; fg = "#ffb4be"; }
  push(list, { op: "rect", x: x, y: y, w: w, h: h, r: 7, fill: fill, stroke: LINE });
  if (icon != "") {
    push(list, { op: "icon", x: x + (label == "" ? (w - 16) / 2 : 7), y: y + (h - 16) / 2, size: 16, name: icon, color: fg, color2: ACCENT2 });
  }
  if (label != "") {
    push(list, { op: "text", x: icon != "" ? x + 28 : x + w / 2, y: y + h / 2, text: label, size: 12, color: fg, align: icon != "" ? "left" : "center" });
  }
  push(buttons, { id: id, x: x, y: y, w: w, h: h });
}
fn redraw() {
  buttons = [];
  var list = [];
  push(list, { op: "rect", x: 0, y: 0, w: W, h: H, fill: BG });
  // 工具栏
  push(list, { op: "rect", x: 0, y: 0, w: W, h: 36, fill: BG2 });
  btn(list, "open", 8, 6, 74, 24, "打开", "folder", "");
  var title = scenePath == "" ? "未打开场景" : baseName(scenePath);
  push(list, { op: "text", x: 92, y: 18, text: title, size: 12.5, color: FG, maxW: 200 });
  var modeLabel = mode == "show" ? "默认演出" : (mode == "replay" ? "记录回放" : "飞行排演");
  push(list, { op: "rect", x: 300, y: 8, w: 70, h: 20, r: 5, fill: "rgba(245,185,66,0.15)" });
  push(list, { op: "text", x: 335, y: 18, text: modeLabel, size: 11, color: ACCENT2, align: "center" });
  btn(list, "camera", 380, 6, 92, 24, camMode == "show" ? "演出镜头" : (camMode == "follow" ? "跟随镜头" : "自由环绕"), "camera", "");
  btn(list, "rehearsal_toggle", 478, 6, 74, 24, "排演面板", "heli", rehearsalOpen ? "active" : "");
  btn(list, "project", W - 86, 6, 78, 24, "投送", "project", "");
  // 三维视图
  var vr = viewRect();
  if (handle != "") {
    push(list, { op: "3d", x: vr.x, y: vr.y, w: vr.w, h: vr.h, handle: handle });
  } else {
    push(list, { op: "rect", x: vr.x, y: vr.y, w: vr.w, h: vr.h, fill: "#0c0f1e" });
    push(list, { op: "icon", x: W / 2 - 24, y: vr.y + vr.h / 2 - 46, size: 48, name: "heli", color: ACCENT, color2: ACCENT2 });
    push(list, { op: "text", x: W / 2, y: vr.y + vr.h / 2 + 16, text: "打开场景文件开始（/Demo/helicopter-24.scene）", size: 13, color: FG2, align: "center" });
  }
  if (selection != null) {
    push(list, { op: "rect", x: 8, y: vr.y + 8, w: 220, h: 26, r: 6, fill: "rgba(10,12,24,0.75)" });
    var selText = "部件: " + selection.name + (selection.damage > 0 ? " · 已损坏" : " · 完好");
    push(list, { op: "text", x: 16, y: vr.y + 21, text: selText, size: 11.5, color: selection.damage > 0 ? "#ff8a94" : "#7dd88f" });
  }
  if (toastMsg != "" && sys_time() < toastUntil) {
    push(list, { op: "rect", x: W / 2 - 160, y: vr.y + vr.h - 36, w: 320, h: 26, r: 6, fill: "rgba(10,12,24,0.85)" });
    push(list, { op: "text", x: W / 2, y: vr.y + vr.h - 23, text: toastMsg, size: 11.5, color: ACCENT2, align: "center", maxW: 310 });
  }
  // 控制栏
  var by = H - 92;
  push(list, { op: "rect", x: 0, y: by, w: W, h: 92, fill: BG2 });
  // 进度条
  var px = 12; var pw = W - 24;
  push(list, { op: "rect", x: px, y: by + 10, w: pw, h: 8, r: 4, fill: "rgba(255,255,255,0.1)" });
  var k = duration > 0 ? t / duration : 0;
  push(list, { op: "rect", x: px, y: by + 10, w: pw * k, h: 8, r: 4, fill: ACCENT });
  push(list, { op: "circle", x: px + pw * k, y: by + 14, r: 7, fill: ACCENT2 });
  push(buttons, { id: "seek", x: px, y: by + 4, w: pw, h: 20 });
  push(list, { op: "text", x: px, y: by + 32, text: fmtTime(t) + " / " + fmtTime(duration), size: 11.5, color: FG });
  push(list, { op: "text", x: px + pw, y: by + 32, text: "30fps · ×" + str(rate) + (loop ? " · 循环" : ""), size: 11, color: FG2, align: "right" });
  // 传输按钮
  var tx = 12; var ty = by + 46;
  btn(list, "play", tx, ty, 40, 32, "", playing ? "pause" : "play", "accent");
  btn(list, "stop", tx + 46, ty, 40, 32, "", "stop", "");
  btn(list, "step", tx + 92, ty, 40, 32, "", "step", "");
  btn(list, "loop", tx + 138, ty, 40, 32, "", "reload", loop ? "active" : "");
  btn(list, "rate_down", tx + 190, ty, 34, 32, "-", "", "");
  btn(list, "rate_up", tx + 228, ty, 34, 32, "+", "", "");
  btn(list, "rehearse", tx + 276, ty, 100, 32, mode == "rehearsal" ? "排演中…" : "开始排演", "rocket", mode == "rehearsal" ? "active" : "accent");
  btn(list, "save_record", tx + 382, ty, 92, 32, "保存记录", "save", "");
  btn(list, "continue_rec", tx + 480, ty, 104, 32, "从此续演", "fork", "");
  // 排演面板
  if (rehearsalOpen) {
    var rx = W - 230; var ry = vr.y + 8;
    push(list, { op: "rect", x: rx, y: ry, w: 222, h: 190, r: 10, fill: "rgba(16,19,40,0.94)", stroke: LINE });
    push(list, { op: "text", x: rx + 12, y: ry + 18, text: "飞行排演输入", size: 12.5, color: FG, weight: "bold" });
    push(list, { op: "text", x: rx + 12, y: ry + 42, text: "风 (m/s): " + str(windVal), size: 11.5, color: FG2 });
    push(list, { op: "rect", x: rx + 12, y: ry + 52, w: 198, h: 6, r: 3, fill: "rgba(255,255,255,0.1)" });
    push(list, { op: "circle", x: rx + 12 + (windVal + 10) / 20 * 198, y: ry + 55, r: 6, fill: ACCENT2 });
    push(buttons, { id: "wind", x: rx + 12, y: ry + 46, w: 198, h: 18 });
    push(list, { op: "text", x: rx + 12, y: ry + 78, text: "目标航向: " + str(floor(headingVal * 57.3)) + "°", size: 11.5, color: FG2 });
    btn(list, "heading_left", rx + 12, ry + 88, 60, 24, "左转", "", "");
    btn(list, "heading_right", rx + 78, ry + 88, 60, 24, "右转", "", "");
    btn(list, "fault", rx + 144, ry + 88, 66, 24, "故障", "alert", "warn");
    push(list, { op: "text", x: rx + 12, y: ry + 130, text: "飞控: /Controllers/flight-controller.os", size: 10.5, color: FG2, maxW: 200 });
    push(list, { op: "text", x: rx + 12, y: ry + 148, text: controllerPid != 0 ? "飞控进程 pid " + str(controllerPid) + " 运行中" : "飞控未启动", size: 11, color: controllerPid != 0 ? "#7dd88f" : FG2 });
    push(list, { op: "text", x: rx + 12, y: ry + 170, text: "点击地面可设目标航向", size: 10.5, color: FG2 });
  }
  // 打开文件菜单
  if (openMenu) {
    push(list, { op: "rect", x: 8, y: 36, w: 300, h: 40 + len(fileList) * 28, r: 10, fill: "rgba(20,24,48,0.98)", stroke: LINE, shadow: { color: "rgba(0,0,0,0.5)", blur: 16, oy: 6 } });
    push(list, { op: "text", x: 20, y: 54, text: "打开场景 / 排演记录", size: 12, color: FG2 });
    var i = 0;
    while (i < len(fileList)) {
      var fy = 66 + i * 28;
      push(list, { op: "icon", x: 18, y: fy + 4, size: 16, name: ends(fileList[i].name, ".flightrec") ? "snapshot" : "file-scene", color: ACCENT2 });
      push(list, { op: "text", x: 40, y: fy + 13, text: fileList[i].path, size: 11.5, color: FG, maxW: 250 });
      push(buttons, { id: "openfile:" + fileList[i].path, x: 12, y: fy, w: 292, h: 26 });
      i = i + 1;
    }
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
    if (openMenu) {
      var b0 = hitBtn(x, y);
      if (b0 != null && starts(b0.id, "openfile:")) {
        var p = sub(b0.id, 9, len(b0.id) - 9);
        openMenu = false;
        if (ends(p, ".flightrec")) { openRecord(p); } else { openScene(p); }
        return;
      }
      openMenu = false; dirty = true;
      return;
    }
    var b = hitBtn(x, y);
    if (b != null) {
      if (b.id == "open") {
        fileList = [];
        var dirs = ["/Demo", "/Records"];
        var di = 0;
        while (di < len(dirs)) {
          var ls = sys_list(dirs[di]);
          if (ls.ok) {
            var i = 0;
            while (i < len(ls.items)) {
              if (ends(ls.items[i].name, ".scene") || ends(ls.items[i].name, ".flightrec")) { push(fileList, ls.items[i]); }
              i = i + 1;
            }
          }
          di = di + 1;
        }
        openMenu = true; dirty = true;
      }
      else if (b.id == "play") { if (playing) { doPause(); } else { doPlay(); } }
      else if (b.id == "stop") { doStop(); }
      else if (b.id == "step") { doStep(); }
      else if (b.id == "loop") { loop = !loop; sys_send(timelinePid, "loop", { loop: loop }); dirty = true; }
      else if (b.id == "rate_down") { rate = max(0.25, rate / 2); sys_send(timelinePid, "rate", { rate: rate }); dirty = true; reportStatus(); }
      else if (b.id == "rate_up") { rate = min(4, rate * 2); sys_send(timelinePid, "rate", { rate: rate }); dirty = true; reportStatus(); }
      else if (b.id == "camera") { camMode = camMode == "show" ? "follow" : (camMode == "follow" ? "orbit" : "show"); submitCamera(); dirty = true; }
      else if (b.id == "project") { sys_send(wmPid(), "open_project_menu", { windowId: winId, cx: x, cy: y, appKind: "player" }); }
      else if (b.id == "rehearsal_toggle") { rehearsalOpen = !rehearsalOpen; dirty = true; }
      else if (b.id == "rehearse") { if (mode != "rehearsal") { startRehearsal(false); } }
      else if (b.id == "save_record") { saveRecord(); }
      else if (b.id == "continue_rec") { if (mode == "replay") { startRehearsal(true); } else { toast("回放记录时可从此续演"); } }
      else if (b.id == "fault") { sys_send(flightPid, "input", { kind: "fault", delay: 0 }); toast("故障已触发"); }
      else if (b.id == "heading_left") { headingVal = headingVal - 0.35; sys_send(flightPid, "input", { kind: "heading", value: headingVal }); dirty = true; }
      else if (b.id == "heading_right") { headingVal = headingVal + 0.35; sys_send(flightPid, "input", { kind: "heading", value: headingVal }); dirty = true; }
      else if (b.id == "seek") { seekDrag = true; doSeek((x - 12) / (W - 24) * duration); }
      else if (b.id == "wind") { windVal = clamp(((x - (W - 230 + 12)) / 198) * 20 - 10, -10, 10); windVal = floor(windVal * 2) / 2; sys_send(flightPid, "input", { kind: "wind", value: windVal, value2: 0 }); dirty = true; }
      return;
    }
    var vr = viewRect();
    if (x >= vr.x && x <= vr.x + vr.w && y >= vr.y && y <= vr.y + vr.h && handle != "") {
      viewDrag = { sx: x, sy: y, yaw: orbit.yaw, pitch: orbit.pitch, moved: false };
      if (camMode != "orbit") { camMode = "orbit"; dirty = true; }
    }
    return;
  }
  if (ev.kind == "pointer_move") {
    if (seekDrag) { doSeek((x - 12) / (W - 24) * duration); return; }
    if (viewDrag != null) {
      var dx = x - viewDrag.sx; var dy = y - viewDrag.sy;
      if (abs(dx) + abs(dy) > 4) { viewDrag.moved = true; }
      orbit.yaw = viewDrag.yaw + dx * 0.008;
      orbit.pitch = clamp(viewDrag.pitch + dy * 0.006, -0.1, 1.3);
      submitCamera();
    }
    return;
  }
  if (ev.kind == "pointer_up") {
    if (seekDrag) { seekDrag = false; return; }
    if (viewDrag != null) {
      if (!viewDrag.moved) { pickAt(x, y); }
      viewDrag = null;
    }
    return;
  }
  if (ev.kind == "wheel") {
    var vr2 = viewRect();
    if (y >= vr2.y && y <= vr2.y + vr2.h) {
      orbit.dist = clamp(orbit.dist + (ev.dy > 0 ? 2 : -2), 6, 80);
      if (camMode != "orbit") { camMode = "orbit"; }
      submitCamera(); dirty = true;
    }
    return;
  }
  if (ev.kind == "key") {
    if (ev.key == " ") { if (playing) { doPause(); } else { doPlay(); } }
    else if (ev.key == "ArrowRight") { doSeek(t + 1); }
    else if (ev.key == "ArrowLeft") { doSeek(t - 1); }
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
  if (m.type == "close") { killHelpers(); if (handle != "") { sys_scene_close(handle); } sys_exit(); return; }
  if (m.type == "registered") { winId = m.payload.windowId; reportStatus(); return; }
  if (m.type == "resize") { W = m.payload.w; H = m.payload.h; dirty = true; return; }
  if (m.type == "position") {
    t = m.payload.t;
    playing = m.payload.playing;
    submitCamera();
    dirty = true;
    if (sys_time() - statusAt > 0.4) { statusAt = sys_time(); reportStatus(); }
    return;
  }
  if (m.type == "flight_state") { flight = m.payload; return; }
  if (m.type == "ended") { playing = false; dirty = true; reportStatus(); return; }
  if (m.type == "record") {
    var fname = "/Records/rehearsal-" + str(floor(sys_time() * 10)) + ".flightrec";
    var w = sys_write(fname, json_str(m.payload));
    if (w.ok) { toast("记录已保存: " + fname); } else { toast("保存失败: " + w.error); }
    return;
  }
  if (m.type == "system_restored") { dirty = true; reportStatus(); return; }
  if (m.type == "project_input") { onInput(m.payload); return; }
}
// 启动
sys_register("player", "三维场景播放器", W, H);
var reg = sys_recv();
if (reg.type == "registered") { winId = reg.payload.windowId; }
if (args != null && len(args) > 0) {
  if (ends(args[0], ".flightrec")) { openScene("/Demo/helicopter-24.scene"); openRecord(args[0]); }
  else { openScene(args[0]); }
}
redraw();
while (true) {
  var m = sys_recv_timeout(250);
  if (m != null) {
    handle(m);
    var guard = 0;
    while (guard < 12) {
      var m2 = sys_poll();
      if (m2 == null) { break; }
      handle(m2);
      guard = guard + 1;
    }
  }
  if (dirty) { redraw(); }
  if (toastMsg != "" && sys_time() > toastUntil) { toastMsg = ""; dirty = true; }
}
