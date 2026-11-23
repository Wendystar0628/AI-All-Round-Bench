'use strict';
// ============ 内核源文件、预置程序与素材 ============
(function (NS) {
  const K = {};

  // ---------------- 默认内核程序（NIL） ----------------
  // 子系统内核：调度、消息投递、文件系统、系统调用分发。
  // 修改本文件并重启子系统即可改变行为。
  K.defaultKernel = function (sysName) {
    return `# ====================================================
# ${sysName} 的内核程序（NIL 格式）
# 这是子系统的内核：负责进程调度、消息投递、文件系统与系统调用分发。
# 修改本文件后，在父系统桌面中重启该子系统即可生效。
# ----------------------------------------------------
# 策略变量（可修改）：
#   SCHED        调度策略: "round-robin" | "fifo" | "least-work"
#   MSG_RULE     消息投递规则: "fifo" | "reverse" | "latest-per-pair"
#   FILE_PREFIX  用户程序文件路径前缀（示例：设为 "/Sandbox" 后，
#                用户程序的 read("/a.txt") 实际读 "/Sandbox/a.txt"）
#   LOCK_SYSTEM  true 时禁止用户程序写入 /System 目录
#   QUANTUM      每个就绪进程每次调度的预算单位
# ====================================================

var SCHED = "round-robin"
var MSG_RULE = "fifo"
var FILE_PREFIX = ""
var LOCK_SYSTEM = true
var QUANTUM = 240

func find_proc(list, pid) {
  var i = 0
  while i < len(list) {
    if list[i]["pid"] == pid { return list[i] }
    i = i + 1
  }
  return null
}

func ready_list() {
  var out = []
  var list = proc_list()
  var i = 0
  while i < len(list) {
    var p = list[i]
    if p["state"] == "ready" && p["role"] != "kernel" && p["role"] != "app" {
      out = out + [p]
    }
    i = i + 1
  }
  return out
}

func sort_least(out) {
  var m = len(out)
  var a = 0
  while a < m {
    var b = a + 1
    while b < m {
      if out[b]["work"] < out[a]["work"] {
        var t = out[a]
        out[a] = out[b]
        out[b] = t
      }
      b = b + 1
    }
    a = a + 1
  }
  return out
}

func do_schedule() {
  var list = ready_list()
  if SCHED == "least-work" { list = sort_least(list) }
  var i = 0
  while i < len(list) {
    var p = list[i]
    if p["quota"] >= 0 && p["quotaUsed"] >= p["quota"] {
      i = i + 1
      continue
    }
    sched_run(p["pid"], QUANTUM)
    i = i + 1
  }
  return true
}

func pump_msgs() {
  var pending = []
  var m = msg_poll()
  while m != null {
    pending = pending + [m]
    m = msg_poll()
  }
  if MSG_RULE == "reverse" {
    var i = len(pending) - 1
    while i >= 0 {
      msg_deliver(pending[i])
      i = i - 1
    }
    return true
  }
  if MSG_RULE == "latest-per-pair" {
    var seen = {}
    var i = len(pending) - 1
    while i >= 0 {
      var key = str(pending[i]["from"]) + "->" + str(pending[i]["to"])
      if seen[key] == null {
        seen[key] = 1
        msg_deliver(pending[i])
      }
      i = i - 1
    }
    return true
  }
  var i = 0
  while i < len(pending) {
    msg_deliver(pending[i])
    i = i + 1
  }
  return true
}

func fpath(p) {
  if FILE_PREFIX == "" { return p }
  if substr(p, 0, 1) != "/" { p = "/" + p }
  return FILE_PREFIX + p
}

func lock_ok(p) {
  if LOCK_SYSTEM && substr(p, 0, 8) == "/System/" { return false }
  return true
}

func do_syscall(name, args) {
  if name == "read" { return fs_read(fpath(args[0])) }
  if name == "write" {
    var p = fpath(args[0])
    if !lock_ok(p) { throw "内核保护: 禁止写入 /System" }
    return fs_write(p, args[1])
  }
  if name == "append" {
    var p = fpath(args[0])
    if !lock_ok(p) { throw "内核保护: 禁止写入 /System" }
    return fs_append(p, args[1])
  }
  if name == "listdir" { return fs_list(fpath(args[0])) }
  if name == "mkdir" {
    var p = fpath(args[0])
    if !lock_ok(p) { throw "内核保护: 禁止在 /System 创建目录" }
    return fs_mkdir(p)
  }
  if name == "delete" {
    var p = fpath(args[0])
    if !lock_ok(p) { throw "内核保护: 禁止删除 /System 内容" }
    return fs_delete(p)
  }
  if name == "rename" {
    var a = fpath(args[0])
    var b = fpath(args[1])
    if !lock_ok(a) || !lock_ok(b) { throw "内核保护: 禁止修改 /System" }
    return fs_rename(a, b)
  }
  if name == "copy" {
    var a = fpath(args[0])
    var b = fpath(args[1])
    if !lock_ok(b) { throw "内核保护: 禁止写入 /System" }
    return fs_copy(a, b)
  }
  if name == "exists" { return fs_exists(fpath(args[0])) }
  if name == "stat" { return fs_stat(fpath(args[0])) }
  if name == "spawn" { return spawn_proc(args[0], args[1]) }
  if name == "kill" { return kill_proc(args[0], args[1]) }
  if name == "suspend" { return proc_suspend(args[0]) }
  if name == "resume_pid" { return proc_resume(args[0]) }
  if name == "run_program" {
    var src = fs_read(fpath(args[0]))
    return spawn_proc(src, "program")
  }
  if name == "proc_list" { return proc_list() }
  if name == "proc_info" { return proc_list() }
  if name == "notify" { return notify_host(args[0], args[1]) }
  if name == "toast" { return notify_host(args[0], args[1]) }
  if name == "budget_set" { return budget_set(args[0]) }
  if name == "mem_set" { return mem_set(args[0]) }
  if name == "storage_set" { return storage_set(args[0]) }
  if name == "grant_set" { return grant_set(args[0], args[1]) }
  if name == "ui_apply" { return ui_apply(args[0]) }
  if name == "wm_policy" { return wm_policy(args[0]) }
  if name == "wm_list" { return wm_list() }
  if name == "scene_submit" { return scene_submit(args[0]) }
  if name == "scene_clear" { return scene_submit(null) }
  if name == "sensor_read" { return sensor_read() }
  if name == "actuator_write" { return actuator_write(args[0], args[1], args[2], args[3]) }
  if name == "actuator_read" { return actuator_read() }
  if name == "msg_poll" { return msg_poll() }
  if name == "msg_deliver" { return msg_deliver(args[0]) }
  if name == "msg_send_proc" { return msg_send_proc(args[0], args[1]) }
  if name == "host_send" { return host_send(args) }
  if name == "compile" { return compile_src(args[0]) }
  if name == "halt" {
    halt()
    return null
  }
  throw "未知系统调用: " + name
}

func handle_syscall(from, id, name, args) {
  var ok = true
  var val = null
  try {
    val = do_syscall(name, args)
  } catch e {
    ok = false
    val = e
  }
  if ok {
    msg_reply(from, id, val, false)
  } else {
    msg_reply(from, id, val, true)
  }
  return true
}

func handle_host(cmd, m) {
  if cmd == "spawn" {
    var path = m[2]
    var nm = m[3]
    var pid = spawn_proc(fs_read(path), nm)
    host_send(["spawned", nm, pid])
    return true
  }
  if cmd == "kill" {
    kill_proc(m[2], "宿主请求")
    host_send(["killed", m[2]])
    return true
  }
  return true
}

var boot = 0
while true {
  pump_msgs()
  var m = recv()
  if m == null {
    do_schedule()
    continue
  }
  var kind = m[0]
  if kind == "tick" {
    do_schedule()
  } else if kind == "syscall" {
    handle_syscall(m[1], m[2], m[3], m[4])
    do_schedule()
  } else if kind == "host" {
    handle_host(m[1], m)
  } else if kind == "sched" {
    do_schedule()
  }
}
`;
  };

  // ---------------- 预置用户程序 ----------------
  K.progSum = () => `# 累加计算程序
# 计算 1 到 100 的和
var s = 0
var i = 1
while i <= 100 {
  s = s + i
  i = i + 1
}
print "sum=" s
`;

  K.progSender = () => `# 消息发送程序
# 查找名为 receiver 的进程并发送 5 条消息
var list = proc_list()
var target = 1
var i = 0
while i < len(list) {
  if list[i]["name"] == "receiver" {
    target = list[i]["pid"]
  }
  i = i + 1
}
print "send-to=" target
var n = 0
while n < 5 {
  send(target, "hello", n)
  n = n + 1
}
print "sent-5"
`;

  K.progReceiver = () => `# 消息接收程序
# 依次接收 6 条消息并打印
var n = 0
while n < 6 {
  var m = recv()
  print "recv:" m[0] m[1]
  n = n + 1
}
print "done"
`;

  K.progEndless = () => `# 持续计算程序
# 循环中不主动等待或让出执行权，用于检验调度
var i = 0
while true {
  i = i + 1
}
`;

  // 飞控程序：保持高度与姿态（可在编辑器中修改）
  K.progFlyControl = () => `# ====================================================
# 飞控程序（普通 NIL 程序，可修改）
# 接口：
#   sensor_read() -> [t, x,y,z, vx,vy,vz, roll,pitch,yaw, rpm, collective, wx,wz]
#   actuator_write(collective, pitch, roll, yaw)
# 控制量保持到下一次写入；错过周期的控制不补发。
# ====================================================
var target_alt = 14
var target_yaw = 0
var kp_alt = 0.9
var kd_alt = 0.4
var kp_att = 1.5
var prev_err = 0
var init = 0
while true {
  var s = sensor_read()
  if init == 0 {
    target_yaw = s[9]
    init = 1
  }
  var alt = s[3]
  var vy = s[6]
  var err = target_alt - alt
  var coll = 0.62 + kp_alt * err + kd_alt * (err - prev_err) - vy * 0.22
  if coll > 1 { coll = 1 }
  if coll < 0 { coll = 0 }
  prev_err = err
  var roll = 0 - s[7] * kp_att - s[4] * 0.10
  var pitch = 0 - s[8] * kp_att - s[5] * 0.10
  var yaw = 0 - (s[9] - target_yaw) * 0.9
  if roll > 1 { roll = 1 }
  if roll < -1 { roll = -1 }
  if pitch > 1 { pitch = 1 }
  if pitch < -1 { pitch = -1 }
  if yaw > 1 { yaw = 1 }
  if yaw < -1 { yaw = -1 }
  actuator_write(coll, pitch, roll, yaw)
  sleep 40
}
`;

  // 时序进程：推进播放位置
  K.progTimeline = () => `# ====================================================
# 时序进程：推进播放位置，通过消息驱动场景与特效进程
# 接收控制消息: play pause stop seek rate loop mode rehearse_start rehearse_stop
# ====================================================
var playing = false
var pos = 0
var rate = 1
var loop = false
var mode = "record"
var duration = 15000
var last_t = time()
var last_send = 0
var scene_pid = 0
var fx_pid = 0
var found = false

func find_pid(n) {
  var list = proc_list()
  var i = 0
  while i < len(list) {
    if list[i]["name"] == n { return list[i]["pid"] }
    i = i + 1
  }
  return 0
}

while true {
  if !found {
    scene_pid = find_pid("scene")
    fx_pid = find_pid("fx")
    if scene_pid > 0 && fx_pid > 0 { found = true }
  }
  var m = recv()
  if m != null {
    var cmd = m[0]
    if cmd == "play" {
      playing = true
      last_t = time()
    }
    if cmd == "pause" { playing = false }
    if cmd == "stop" {
      playing = false
      pos = 0
      last_t = time()
    }
    if cmd == "seek" {
      pos = m[1]
      last_t = time()
      last_send = 0
      send(scene_pid, "seek", pos)
      send(fx_pid, "seek", pos)
    }
    if cmd == "rate" { rate = m[1] }
    if cmd == "loop" { loop = m[1] }
    if cmd == "mode" { mode = m[1] }
    if cmd == "rehearse_start" {
      mode = "rehearsal"
      playing = true
      pos = 0
      last_t = time()
      send(scene_pid, "rehearse_start")
    }
    if cmd == "rehearse_stop" {
      mode = "record"
      playing = false
      pos = 0
      send(scene_pid, "rehearse_stop")
    }
  } else {
    sleep 20
  }
  var now = time()
  var dt = now - last_t
  if dt < 0 { dt = 0 }
  last_t = now
  if playing {
    pos = pos + dt * rate
    if pos > duration {
      if loop {
        pos = pos - duration
      } else {
        pos = duration
        playing = false
      }
    }
    if now - last_send >= 20 || last_send == 0 {
      last_send = now
      send(scene_pid, "tick", pos, mode)
      send(fx_pid, "tick", pos, mode)
    }
  }
}
`;

  // 场景进程：物理、演出与排演状态
  K.progScene = () => `# ====================================================
# 场景进程：维护直升机状态，提交三维场景数据
# 消息: load tick seek rehearse_start rehearse_stop get_buffer set_mode
# ====================================================
var S = {"x": 0, "y": 2, "z": 0, "vx": 0, "vy": 0, "vz": 0, "roll": 0, "pitch": 0, "yaw": 0,
         "yrate": 0, "rpm": 0, "crashed": 0, "dmg": [], "rotor": 0}
var R = []           # 飞行记录分段 [[t0,t1,coll,pitch,roll,yaw,fault], ...]
var gn = 0           # 地形网格
var gsize = 200
var gcell = 4
var baked = 0        # 已烘焙到的位置
var states = []      # 烘焙出的状态
var cur_pos = 0
var cur_mode = "record"
var loaded = false
var scene_path = "/Demo/helicopter-24.scene"
var fx_pid = 0

func find_pid(n) {
  var list = proc_list()
  var i = 0
  while i < len(list) {
    if list[i]["name"] == n { return list[i]["pid"] }
    i = i + 1
  }
  return 0
}

func deliver(st) {
  st["t"] = cur_pos
  st["mode"] = cur_mode
  scene_submit(st)
  if fx_pid > 0 {
    send(fx_pid, "state", st)
  }
  return true
}

func grid_at(x, z) {
  var half = gsize / 2
  var fx = (x + half) / gcell
  var fz = (z + half) / gcell
  var ix = floor(fx)
  var iz = floor(fz)
  if ix < 0 { ix = 0 }
  if iz < 0 { iz = 0 }
  if ix >= gn - 1 { ix = gn - 2 }
  if iz >= gn - 1 { iz = gn - 2 }
  var tx = fx - ix
  var tz = fz - iz
  var i00 = gn * iz + ix
  var i10 = i00 + 1
  var i01 = i00 + gn
  var i11 = i01 + 1
  var a = states_grid(i00)
  var b = states_grid(i10)
  var c = states_grid(i01)
  var d = states_grid(i11)
  var h = a * (1 - tx) * (1 - tz) + b * tx * (1 - tz) + c * (1 - tx) * tz + d * tx * tz
  return h
}

func states_grid(i) {
  var g = S["grid"]
  return g[i]
}

func ctrl_at(t) {
  var i = 0
  while i < len(R) {
    var seg = R[i]
    if t >= seg[0] && t < seg[1] {
      return [seg[2], seg[3], seg[4], seg[5], seg[6]]
    }
    i = i + 1
  }
  if len(R) == 0 { return [0, 0, 0, 0, 0] }
  var last = R[len(R) - 1]
  return [last[2], last[3], last[4], last[5], last[6]]
}

func reset_state() {
  S["x"] = 0
  S["y"] = 2
  S["z"] = 0
  S["vx"] = 0
  S["vy"] = 0
  S["vz"] = 0
  S["roll"] = 0
  S["pitch"] = 0
  S["yaw"] = 0
  S["yrate"] = 0
  S["rpm"] = 0
  S["crashed"] = 0
  S["dmg"] = []
}

func step_sim(c, dt) {
  var d = dt / 1000
  var fault = c[4]
  var rpmT = 100
  if fault > 0 { rpmT = 46 }
  S["rpm"] = S["rpm"] + (rpmT - S["rpm"]) * 0.7 * d
  var rpmF = S["rpm"] / 100
  var coll = c[0]
  if S["crashed"] == 1 { coll = 0 }
  var thrust = coll * rpmF * 15
  var ax = 0
  var az = 0
  ax = c[1] * 7 - S["vx"] * 0.5
  az = c[2] * 7 - S["vz"] * 0.5
  var cs = cos(S["yaw"])
  var sn = sin(S["yaw"])
  var wax = ax * cs - az * sn
  var waz = -ax * sn - az * cs
  if S["crashed"] == 0 {
    S["vx"] = S["vx"] + wax * d
    S["vz"] = S["vz"] + waz * d
    S["vy"] = S["vy"] + (thrust - 9.8) * d
    S["x"] = S["x"] + S["vx"] * d
    S["z"] = S["z"] + S["vz"] * d
    S["y"] = S["y"] + S["vy"] * d
    S["pitch"] = S["pitch"] + (c[1] * 0.5 - S["pitch"]) * 2.2 * d
    S["roll"] = S["roll"] + (c[2] * 0.5 - S["roll"]) * 2.2 * d
    S["yrate"] = S["yrate"] + (-c[3] * 0.8 - S["yrate"]) * 1.6 * d
    S["yaw"] = S["yaw"] + S["yrate"] * d
    if fault > 0 {
      var wob = sin(S["x"] * 3.1 + S["y"] * 1.7) * 0.5
      S["roll"] = S["roll"] + wob * d * 0.4
      S["pitch"] = S["pitch"] + cos(S["z"] * 2.3) * d * 0.3
    }
    var h = grid_at(S["x"], S["z"])
    if S["y"] < h + 1.1 {
      S["y"] = h + 1.1
      if S["vy"] < -3 || abs(S["roll"]) > 0.5 || abs(S["pitch"]) > 0.5 {
        S["crashed"] = 1
        S["vy"] = 0
        S["vx"] = 0
        S["vz"] = 0
        S["dmg"] = ["body", "rotor", "tail"]
        S["rpm"] = 0
      } else {
        S["vy"] = 0
        S["y"] = h + 1.1
      }
    }
  }
  S["rotor"] = S["rotor"] + S["rpm"] * d * 0.35
}

func snapshot() {
  return {"x": S["x"], "y": S["y"], "z": S["z"], "roll": S["roll"], "pitch": S["pitch"],
          "yaw": S["yaw"], "rpm": S["rpm"], "crashed": S["crashed"], "dmg": S["dmg"],
          "rotor": S["rotor"], "vx": S["vx"], "vy": S["vy"], "vz": S["vz"]}
}

func bake_until(targetPos) {
  var guard = 0
  while baked < targetPos && guard < 60 {
    var dt = 40
    if baked + dt > targetPos { dt = targetPos - baked }
    var c = ctrl_at(baked)
    step_sim(c, dt)
    baked = baked + dt
    states = states + [snapshot()]
    guard = guard + 1
  }
  return baked
}

func submit(pos, mode) {
  var st = snapshot()
  st["t"] = pos
  st["mode"] = mode
  scene_submit(st)
  return true
}

func do_load(path) {
  var txt = read(path)
  var j = json_dec(txt)
  R = j["record"]
  var g = j["terrain"]
  gn = g["n"]
  gsize = g["size"]
  gcell = g["cell"]
  S["grid"] = g["h"]
  scene_path = path
  loaded = true
  baked = 0
  states = []
  reset_state()
  return true
}

while true {
  var m = recv()
  if m == null { sleep 20 continue }
  var cmd = m[0]
  if cmd == "load" {
    do_load(m[1])
    fx_pid = find_pid("fx")
    host_send(["scene_loaded", len(R)])
  }
  if cmd == "tick" {
    cur_pos = m[1]
    cur_mode = m[2]
    if cur_mode == "record" {
      if !loaded { do_load(scene_path) }
      if cur_pos > baked { bake_until(cur_pos) }
      var idx = floor(cur_pos / 40)
      if idx < 0 { idx = 0 }
      if idx >= len(states) { idx = len(states) - 1 }
      var st = states[idx]
      if st != null {
        deliver(st)
      }
    } else {
      var c = actuator_read()
      var cc = [c[0], c[1], c[2], c[3], 0]
      if c[8] > 0 { cc[4] = 1 }
      step_sim(cc, 50)
      deliver(snapshot())
    }
  }
  if cmd == "seek" {
    var target = m[1]
    if target < baked {
      baked = 0
      states = []
      reset_state()
    }
    bake_until(target)
    host_send(["baked", baked])
  }
  if cmd == "rehearse_start" {
    reset_state()
    baked = 0
    states = []
    cur_mode = "rehearsal"
  }
  if cmd == "rehearse_stop" {
    cur_mode = "record"
    baked = 0
    states = []
    reset_state()
  }
  if cmd == "get_buffer" {
    host_send(["scene_buffer", states])
  }
}
`;

  // 特效进程：烟尘、碎片、下洗气流
  K.progFx = () => `# ====================================================
# 环境特效进程：尘土、烟、火与碎片
# 接收场景进程相同的 tick 消息，产出粒子层
# ====================================================
var parts = []     # [x,y,z,vx,vy,vz,life,size,kind]
var debris = []    # [x,y,z,vx,vy,vz,life,rot]
var last = 0
var rotor = 0
var crashed = 0
var hx = 0
var hy = 2
var hz = 0
var ground = 0

func terrain_h(x, z) {
  var v = sin(x * 0.05) * 2 + cos(z * 0.04) * 2 + sin((x + z) * 0.021) * 3
  return v
}

func emit_dust(n, strength) {
  var i = 0
  while i < n {
    var a = rand() * 6.283
    var r = 0.5 + rand() * 2.2
    var sp = (0.8 + rand() * 1.6) * strength
    parts = parts + [[hx + cos(a) * r, hy - 0.8, hz + sin(a) * r,
                      cos(a) * sp, 0.6 + rand() * 1.2, sin(a) * sp,
                      1.2 + rand() * 1.4, 0.5 + rand() * 0.8, 0]]
    i = i + 1
  }
}

func emit_smoke(n) {
  var i = 0
  while i < n {
    parts = parts + [[hx + (rand() - 0.5) * 1.2, hy + rand() * 1.2, hz + (rand() - 0.5) * 1.2,
                      (rand() - 0.5) * 0.6, 1.2 + rand() * 1.2, (rand() - 0.5) * 0.6,
                      2 + rand() * 2.5, 0.8 + rand() * 1.2, 1]]
    i = i + 1
  }
  if crashed == 1 {
    var i2 = 0
    while i2 < 2 {
      parts = parts + [[hx + (rand() - 0.5), hy + 0.6, hz + (rand() - 0.5),
                        (rand() - 0.5) * 0.4, 0.8 + rand() * 0.6, (rand() - 0.5) * 0.4,
                        1 + rand() * 1.5, 0.6 + rand() * 0.6, 2]]
      i2 = i2 + 1
    }
  }
}

func impact(speed) {
  crashed = 1
  var i = 0
  while i < 8 {
    var a = rand() * 6.283
    debris = debris + [[hx, hy, hz, cos(a) * (1 + rand() * 3), 2 + rand() * 3, sin(a) * (1 + rand() * 3), 3 + rand() * 2, rand() * 6.28]]
    i = i + 1
  }
  var j = 0
  while j < 20 {
    emit_smoke(1)
    emit_dust(1, 2)
    j = j + 1
  }
}

func step_parts(dt) {
  var d = dt / 1000
  var keep = []
  var i = 0
  while i < len(parts) {
    var p = parts[i]
    p[3] = p[3] * (1 - 0.8 * d)
    p[5] = p[5] * (1 - 0.8 * d)
    p[4] = p[4] * (1 - 0.6 * d)
    p[0] = p[0] + p[3] * d
    p[1] = p[1] + p[4] * d
    p[2] = p[2] + p[5] * d
    p[6] = p[6] - d
    if p[6] > 0 {
      keep = keep + [p]
    }
    i = i + 1
  }
  parts = keep
  var keep2 = []
  var j = 0
  while j < len(debris) {
    var b = debris[j]
    b[3] = b[3] * (1 - 0.5 * d)
    b[5] = b[5] * (1 - 0.5 * d)
    b[4] = b[4] - 9.8 * d
    b[0] = b[0] + b[3] * d
    b[1] = b[1] + b[4] * d
    b[2] = b[2] + b[5] * d
    var gh = terrain_h(b[0], b[2])
    if b[1] < gh + 0.15 {
      b[1] = gh + 0.15
      b[4] = 0
      b[3] = b[3] * 0.6
      b[5] = b[5] * 0.6
    }
    b[7] = b[7] + b[3] * d
    b[6] = b[6] - d
    if b[6] > 0 { keep2 = keep2 + [b] }
    j = j + 1
  }
  debris = keep2
}

func submit_fx() {
  var out = {"parts": parts, "debris": debris}
  scene_submit_layer(out)
  return true
}

while true {
  var m = recv()
  if m == null { sleep 20 continue }
  var cmd = m[0]
  if cmd == "state" {
    var st = m[1]
    var now = time()
    var dt = now - last
    if dt < 0 { dt = 0 }
    if dt > 200 { dt = 50 }
    last = now
    rotor = st["rpm"]
    hx = st["x"]
    hy = st["y"]
    hz = st["z"]
    if st["crashed"] == 1 && crashed == 0 {
      impact(1)
    }
    crashed = st["crashed"]
    var h = terrain_h(hx, hz)
    var agl = hy - h
    if rotor > 30 && agl < 8 {
      var strength = (1 - agl / 8) * rotor / 100
      emit_dust(2, strength)
    }
    if crashed == 1 {
      emit_smoke(1)
    }
    step_parts(dt)
    submit_fx()
  }
  if cmd == "seek" {
    parts = []
    debris = []
    crashed = 0
    last = time()
  }
}
`;

  // 图表接收进程
  K.progChartRecv = () => `# ====================================================
# 图表数据接收进程：接收根系统电子表格的区域数据版本
# 消息: ["data", version, labels, values, title, range]
# 通过 host_send 把数据交给图表工作台宿主
# ====================================================
var count = 0
var last_version = 0
while true {
  var m = recv()
  if m == null { sleep 20 continue }
  var cmd = m[0]
  if cmd == "data" {
    var ver = m[1]
    if ver > last_version {
      last_version = ver
      count = count + 1
      host_send(["chart_data", ver, m[2], m[3], m[4], m[5], count])
    }
  }
  if cmd == "reset" {
    last_version = 0
    count = 0
  }
}
`;

  // 窗口管理规则程序（启动时运行，向内核注册窗口管理策略）
  K.wmRules = () => `# ====================================================
# 窗口管理规则程序
# 启动时运行一次，调用 wm_policy 注册以下规则：
#   focus_on_click  是否在点击时切换焦点
#   raise_on_click   是否点击时提升到顶层
#   cascade          新窗口级联偏移像素
#   snap_enabled     是否允许半屏贴靠
#   hit_test         "top" 自上而下 | "bottom" 自下而上
#   z_order          "focus" 聚焦置顶 | "stable" 保持创建顺序
# 修改本文件并重启子系统后，窗口叠放、焦点与输入分发按新规则执行。
# ====================================================
var policy = {
  "focus_on_click": true,
  "raise_on_click": true,
  "cascade": 28,
  "snap_enabled": true,
  "hit_test": "top",
  "z_order": "focus"
}
wm_policy(policy)
halt()
`;

  K.fileRules = () => JSON.stringify({
    comment: '文件管理器排序与操作规则（JSON）。sort: name|size|mtime|type；dirFirst: 目录优先；hiddenShown: 显示隐藏文件',
    sort: 'name', dirFirst: true, hiddenShown: false, openWith: { 'sheet': 'spreadsheet', 'txt': 'editor', 'nil': 'editor', 'scene': 'player' }
  }, null, 2);

  K.chartRules = () => `# ====================================================
# 图表取值规则程序（启动时运行）
# cols: 参与系列映射的列（A=0,B=1,...），空表示使用工作台选择的列
# agg: "sum" | "avg" | "max" | "min" | "none"
# smooth: 折线平滑系数 0..1
# ====================================================
var rule = {"cols": [], "agg": "none", "smooth": 0}
host_send(["chart_rules", rule])
halt()
`;

  // ---------------- 示例工作簿 ----------------
  K.sampleSheet = () => JSON.stringify({
    format: 'nos-sheet-1',
    sheet: {
      rows: 20, cols: 12,
      cells: {
        'A1': { v: '项目' }, 'B1': { v: '数量' }, 'C1': { v: '单价' }, 'D1': { v: '小计' },
        'A2': { v: '项目 A' }, 'B2': { v: 24 }, 'C2': { v: 6 }, 'D2': { f: '=B2*C2' },
        'A3': { v: '项目 B' }, 'B3': { v: 12 }, 'C3': { v: 8 }, 'D3': { f: '=B3*C3' },
        'A4': { v: '项目 C' }, 'B4': { v: 18 }, 'C4': { v: 4 }, 'D4': { f: '=B4*C4' }
      }
    }
  });

  // ---------------- 三维场景资源 ----------------
  // 地形网格 + 飞行记录分段（15 秒默认演出）
  K.sampleScene = function () {
    const n = 40, size = 260, cell = size / (n - 1);
    const h = [];
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = -size / 2 + ix * cell, z = -size / 2 + iz * cell;
        let v = Math.sin(x * 0.045) * 2.2 + Math.cos(z * 0.038) * 2.0 + Math.sin((x + z) * 0.018) * 3.0;
        // 两个停机坪附近整平
        const d1 = Math.hypot(x - 0, z - 0), d2 = Math.hypot(x - 55, z - 30);
        if (d1 < 14) v *= (d1 / 14) * 0.3;
        if (d2 < 12) v *= (d2 / 12) * 0.3;
        h.push(Math.round(v * 100) / 100);
      }
    }
    const record = [
      // t0, t1(ms), collective, pitch, roll, yaw, fault
      [0, 1200, 0.10, 0, 0, 0, 0],
      [1200, 2600, 0.68, 0, 0, 0, 0],
      [2600, 4200, 0.62, 0.22, 0, 0.25, 0],
      [4200, 6200, 0.60, 0.30, 0, 0.55, 0],
      [6200, 8400, 0.63, 0.10, 0, 0.15, 0],
      [8400, 9200, 0.60, 0.05, 0.05, 0, 1],
      [9200, 10400, 0.45, 0.0, 0.35, 0.4, 1],
      [10400, 11600, 0.20, 0.0, -0.3, 0.6, 1],
      [11600, 12600, 0.05, 0, 0, 0, 1],
      [12600, 15000, 0.0, 0, 0, 0, 1]
    ];
    const trees = [];
    for (let i = 0; i < 90; i++) {
      const x = (Math.random() - 0.5) * size * 0.92, z = (Math.random() - 0.5) * size * 0.92;
      if (Math.hypot(x, z) < 16 || Math.hypot(x - 55, z - 30) < 14) continue;
      trees.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, s: 0.7 + Math.random() * 0.9 });
    }
    const buildings = [
      { x: -58, z: 34, w: 16, h: 22, d: 12, color: '#5b6478' },
      { x: -66, z: 18, w: 10, h: 14, d: 10, color: '#6b5a72' },
      { x: 64, z: -40, w: 14, h: 18, d: 14, color: '#4d6b74' },
      { x: 24, z: 58, w: 12, h: 10, d: 12, color: '#705d50' }
    ];
    return JSON.stringify({
      format: 'nos-scene-1',
      name: '24 号直升机 · 起降与失控',
      duration: 15000,
      sky: { top: '#1a2350', bottom: '#e88a4e', sun: [-0.5, 0.35, -0.6], fog: '#2a2f55', fogNear: 90, fogFar: 260 },
      terrain: { n, size, cell, h },
      helipads: [{ x: 0, z: 0, r: 8 }, { x: 55, z: 30, r: 7 }],
      trees, buildings,
      record
    });
  };

  NS.KernelSources = K;
})(window.NOS = window.NOS || {});