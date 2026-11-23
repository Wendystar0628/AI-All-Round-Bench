export const SCENE='/Demo/helicopter-24.scene';
export const KERNEL='/System/kernel.str';
export const COMPILER='/System/compiler.str';
export const FLIGHT='/Programs/flight.str';
export const programs={
[KERNEL]:`// 层栈内核 · Strata VM
// choose 在一个有限逻辑步内按轮转次序选择进程。
function choose(cursor, count) {
  let offset = 0;
  while (offset < count) {
    let index = (cursor + offset) % count;
    if (ready(index)) return index;
    offset++;
  }
  return -1;
}
function boot() {
  launch("/System/window.str");
  return true;
}
function onCall(op, args) {
  if (op === "event") return deviceCommand(args[0], args[1]);
  if (op === "recv") return dequeue(true);
  if (op === "send") return enqueue(args[0], args[1]);
  if (op === "sensor") return readSensor();
  if (op === "control") return writeControl(args[0]);
  if (op === "sleep") return waitTime(args[0]);
  if (op === "time") return clock();
  if (op === "self") return identity();
  if (op === "poll") return dequeue(false);
  if (op === "read") return getFile(args[0]);
  if (op === "write") return putFile(args[0], args[1]);
  if (op === "mkdir") return makeDirectory(args[0]);
  if (op === "move") return moveEntry(args[0], args[1]);
  if (op === "list") return fileNames(args[0]);
  if (op === "spawn") return launch(args[0], args[1]);
  if (op === "kill") return terminate(args[0]);
  if (op === "print") return report(args[0]);
  if (op === "display") return submit(args[0]);
  return null;
}
function deliver(pid, value, from) {
  // 例如：return {kind: "已签收", value: value};
  return value;
}
function file(mode, path, value) {
  // 修改 read/write 的返回值可改变程序和文件管理器看到的内容。
  return value;
}`,
[COMPILER]:`// 编译器：将前端解析出的指令名称映射为虚拟机操作码。
// 此文件使用同一语言，保存后即可由旧编译器编译并激活。
function opcode(name) {
  return name;
}
print("编译组件可用");`,
'/System/window.str':`// 窗口管理: 输入由所属系统处理。focus 返回新的窗口层序。
function focus(z, highest) { return highest + 1; }
// input 可以放行或拒绝物理命中。例：return clicked === focused;
function input(clicked, focused, x, y, button) { return true; }
while (true) {
  let packet = recv();
  if (packet.verb === "taskbar" || packet.verb === "max") {
    let view = event("windowInfo", packet.id);
    if (view && packet.verb === "taskbar") {
      if (view.focused && !view.min) packet.verb = "min";
      else packet.verb = "restoreWindow";
    }
    if (view && packet.verb === "max") {
      packet.verb = "windowMode";
      packet.mode = view.mode === "max" ? null : "max";
    }
  }
  event("window", packet);
}`,
'/System/files.str':`// 返回排序方向。改为 -1 以按文件名逆序显示。
function order() { return 1; }
while (true) {
  let packet = recv();
  // 在此可拦截写入操作，或修改新建文件的默认内容。
  if (packet.verb === "create") {
    let state = event("fileState", null);
    let path = (state.path === "/" ? "" : state.path) + "/" + packet.value.name;
    if (!event("fileExists", path)) {
      if (packet.value.kind === "dir") mkdir(path);
      else write(path, "");
      event("files", {verb: "created", value: path});
    } else {
      event("files", {verb: "fileConflict", value: path});
    }
  } else if (packet.verb === "rename") {
    let state = event("fileState", null);
    if (len(state.selected)) {
      let path = (state.path === "/" ? "" : state.path) + "/" + packet.value;
      move(state.selected[0], path);
      event("files", {verb: "renamed", value: path});
    }
  } else if (packet.verb) {
    event("files", packet);
  }
}`,
'/System/chart.str':`// 数值与图形策略。修改 value 改变数据变换规则。
function value(n) { return number(n); }
function type(requested) { return requested; }
while (true) {
  let packet = recv();
  if (packet.verb === "data" && packet.value.fields) {
    let matrix = packet.value.matrix;
    let fields = packet.value.fields;
    let i = packet.value.header ? 1 : 0;
    let rows = [];
    while (i < len(matrix)) {
      let row = [];
      for (let k = 0; k < len(fields); k++) {
        row[k] = value(matrix[i][fields[k]]);
      }
      rows[len(rows)] = row;
      i++;
    }
    packet.value.rows = rows;
  }
  event("chart", packet);
}`,
'/System/data.str':`while (true) {
  let packet = recv();
  send(peer, packet);
}`,
'/System/player.str':`function rate(value) { return value; }
while (true) {
  let packet = recv();
  event("player", packet);
}`,
'/System/timeline.str':`// 时钟采样后，按各自的 PID 向空架与环境特效发消息。
while (true) {
  let tick = recv();
  let info = event("timelineState", tick);
  if (info && info.playing) {
    let position = info.wanted + max(0, tick.time - info.last) * info.rate;
    let playing = true;
    if (info.mode !== "flight") {
      if (info.loop) position %= info.duration;
      else if (position >= info.duration) {
        position = info.duration;
        playing = false;
      }
    }
    event("timelineMark", {wanted: position, playing: playing, last: tick.time, epoch: info.epoch});
    if (info.mode !== "flight" || info.airQueued < 1)
      send(info.airframe, {verb: "sample", time: position, clock: tick.time, epoch: info.epoch});
    if (info.mode !== "flight" || info.effectsQueued < 1)
      send(info.effects, {verb: "fx", time: position, clock: tick.time, epoch: info.epoch});
  }
}`,
'/System/airframe.str':`// 自由飞行与接地的状态方程。渲染设备只读取提交后的状态。
function integrate(f, d) {
  let u = f.control;
  if (!u) u = {lift: 0.78, pitch: 0, roll: 0, yaw: f.yaw};
  let power = f.fault === null ? 1 : 0.45;
  f.power = power;
  let gust = sin(f.t * 2.9) * 0.18 + cos(f.t * 0.57) * 0.12 + f.wind * 0.31;
  f.vroll += (f.roll * 2.2 + gust + u.roll - (1 - power) * (1.35 + sin(f.t * 5) * 0.55)) * d;
  f.vpitch += (f.pitch * 2.2 + gust * 0.33 + u.pitch) * d;
  f.roll = max(-1.57, min(1.57, f.roll + f.vroll * d));
  f.pitch = max(-1.57, min(1.57, f.pitch + f.vpitch * d));
  let delta = u.yaw - f.yaw;
  f.yaw += (atan2(sin(delta), cos(delta)) * 0.85 + (1 - power) * 2.9) * d;
  let drift = sin(f.yaw) * min(1, abs(f.vz) * 0.12);
  f.vx += (sin(f.roll) * 7 + f.wind * 0.34 + drift * 0.82 - f.vx * 0.18) * d;
  f.vz += (-sin(f.pitch) * 7 - f.vz * 0.18) * d;
  f.vy += (9.81 * (u.lift * cos(f.roll) * cos(f.pitch) * power - 1) - f.vy * 0.29) * d;
  f.x += f.vx * d;
  f.y += f.vy * d;
  f.z += f.vz * d;
  f.spin += d * 42 * power;
  return f;
}
function settle(f, floor) {
  if (f.y > floor) return f;
  if (abs(f.vy) > 3.6 || abs(f.roll) > 0.66 || abs(f.pitch) > 0.72 || sqrt(f.vx * f.vx + f.vz * f.vz) > 7) {
    f.impact = f.t;
    f.damaged = true;
    f.y = floor - 0.36;
    f.roll = f.roll < 0 ? -1.27 : 1.27;
  } else {
    f.y = floor;
    f.vy = 0;
    f.vx *= 0.72;
    f.vz *= 0.72;
    f.roll *= 0.65;
    f.pitch *= 0.65;
    f.vroll *= 0.84;
    f.vpitch *= 0.84;
  }
  return f;
}
while (true) {
  let packet = recv();
  if (event("physicsActive", packet)) {
    let count = 0;
    let step = event("physicsInput", packet);
    while (step && count < 6) {
      let f = step.frame;
      f.t += 1 / 60;
      if (f.impact === null) {
        f = integrate(f, 1 / 60);
        let floor = event("physicsFloor", f);
        f = settle(f, floor);
      } else {
        f.spin += max(0, 1 - (f.t - f.impact) * 2) / 60 * 16;
      }
      step.frame = f;
      event("physicsCommit", step);
      count++;
      if (count < 6) step = event("physicsInput", packet);
    }
    event("physicsEnd", packet);
  } else {
    event("airframe", packet);
  }
}`,
'/System/effects.str':`// 改写强度可以改变所有场景提交的烟尘密度。
function intensity(n) { return n; }
while (true) {
  let packet = recv();
  event("effects", packet);
}`,
'/System/service.str':`while (true) {
  let packet = recv();
  event("application", packet);
}`,
[FLIGHT]:`// 24 号飞控 · 25 Hz。传感器坐标单位：m，rad，s。
while (true) {
  let s = sensor();
  if (s) {
    let lift = max(0, min(2, 1 + (s.target - s.y) * 0.32 - s.vy * 0.48));
    let rollTarget = max(-0.28, min(0.28, ((s.goalX || 0) - s.x) * 0.06 - s.vx * 0.18 - s.wind * 0.05));
    let pitchTarget = max(-0.28, min(0.28, (s.z - s.goalZ) * 0.06 + s.vz * 0.18));
    let roll = (rollTarget - s.roll) * 5.2 - s.vroll * 2.1;
    let pitch = (pitchTarget - s.pitch) * 5.2 - s.vpitch * 2.1;
    control({lift: lift, roll: roll, pitch: pitch, yaw: s.heading});
  }
  sleep(0.04);
}`,
'/Programs/累加.str':`let sum = 0;
for (let i = 1; i <= 1000; i++) {
  sum += i;
}
print(sum);
write("/Documents/计算结果.txt", string(sum));`,
'/Programs/接收.str':`print(self());
while (true) {
  let value = recv();
  print(value);
}`,
'/Programs/发送.str':`// 将 target 替换成接收进程的 PID，或在启动对话框填入。
if (!target) target = 0;
print(send(number(target), "来自层栈的问候"));
sleep(0.3);
print(send(number(target), {time: time(), text: "第二条消息"}));`,
'/Programs/持续计算.str':`let n = 0;
while (true) {
  n = (n + 1) % 1000000000;
}`
};
export const workbook={cells:{A1:'项目',B1:'数量',C1:'单价',D1:'小计',A2:'项目 A',A3:'项目 B',A4:'项目 C',B2:'24',B3:'12',B4:'18',C2:'6',C3:'8',C4:'4',D2:'=B2*C2',D3:'=B3*C3',D4:'=B4*C4'},format:{A1:'header',B1:'header',C1:'header',D1:'header'}};
export const sceneTitle='高地试飞 · 24 号';
