// 飞行场景进程：直升机状态演化（物理）、默认演出/回放/排演、记录。
// 与时效进程、环境特效进程协作；排演时飞控进程经消息写入控制量。
var me = sys_self();
var args = sys_args();
var playerPid = args[0];
var scenePath = args[1];
var handle = args[2];
var rd = sys_read(scenePath);
var scene = json_parse(rd.content);
var DT = 1 / 120;
var G = 9.8;
var MASS = 1200;
var MAX_THRUST = 18000;
var RATED_RPM = 320;
var SKID_H = 1.05;

var mode = "show";       // show | replay | live
var record = scene.record;
var simT = 0;
var targetT = 0;
var state = null;
var ctrl = { col: 0, cx: 0, cy: 0, ped: 0 };
var wind = [0, 0, 0];
var heading = 0;
var faultAt = -1;
var faultOn = false;
var controllerPid = 0;
var lastSensorT = -1;
var recControls = [];
var recInputs = [];
var recCheckpoints = [];
var lastCheckpointT = -1;
var effectsPid = 0;
var rng = 12345;
var crashedSent = false;

fn rnd() {
  rng = (rng * 1664525 + 1013904223) % 4294967296;
  if (rng < 0) { rng = rng + 4294967296; }
  return rng / 4294967296;
}
fn terrainH(x, z) {
  var t = scene.terrain;
  var h = t.base;
  var i = 0;
  while (i < len(t.waves)) {
    var w = t.waves[i];
    h = h + w.amp * sin(w.freq * (w.dx * x + w.dz * z) + w.phase);
    i = i + 1;
  }
  var pi = 0;
  while (pi < len(scene.pads)) {
    var pad = scene.pads[pi];
    var px = pad.pos[0]; var pz = pad.pos[1];
    var d = sqrt((x - px) * (x - px) + (z - pz) * (z - pz));
    var r = pad.r;
    if (d < r * 1.6) {
      var ph = t.base;
      var wi = 0;
      while (wi < len(t.waves)) {
        var ww = t.waves[wi];
        ph = ph + ww.amp * sin(ww.freq * (ww.dx * px + ww.dz * pz) + ww.phase);
        wi = wi + 1;
      }
      var k = clamp((d - r) / (r * 0.6), 0, 1);
      var s = k * k * (3 - 2 * k);
      h = ph * (1 - s) + h * s;
    }
    pi = pi + 1;
  }
  return h;
}
fn initialState() {
  var ini = record.initial;
  var p = copy(ini.pos);
  p[1] = terrainH(p[0], p[2]) + SKID_H;
  return {
    pos: p, vel: [0, 0, 0], att: [0, ini.yaw || 0, 0], angVel: [0, 0, 0],
    rpm: 0, rotorAngle: 0, tailAngle: 0, damage: {}, crashed: false, landed: true,
    crashT: -1, crashPos: null, success: false
  };
}
fn ctrlAt(t) {
  var cs = record.controls;
  if (len(cs) == 0) { return { col: 0, cx: 0, cy: 0, ped: 0 }; }
  if (t <= cs[0].t) { return cs[0]; }
  var i = 0;
  while (i < len(cs) - 1) {
    if (t >= cs[i].t && t <= cs[i + 1].t) {
      var a = cs[i]; var b = cs[i + 1];
      var k = (t - a.t) / max(0.0001, b.t - a.t);
      return { col: a.col + (b.col - a.col) * k, cx: a.cx + (b.cx - a.cx) * k, cy: a.cy + (b.cy - a.cy) * k, ped: a.ped + (b.ped - a.ped) * k };
    }
    i = i + 1;
  }
  return cs[len(cs) - 1];
}
fn faultActive(t) {
  if (faultAt >= 0 && t >= faultAt) { return true; }
  var fs = record.faults;
  var i = 0;
  while (i < len(fs)) {
    if (t >= fs[i].t) { return true; }
    i = i + 1;
  }
  return false;
}
fn integrate(st, c, t, dt, fault) {
  // 旋翼转速
  var targetRpm = fault ? 95 : RATED_RPM;
  var spool = fault ? 0.55 : 1.4;
  st.rpm = st.rpm + (targetRpm - st.rpm) * min(1, spool * dt);
  if (st.crashed) { st.rpm = max(0, st.rpm - 260 * dt); }
  var rpmK = st.rpm / RATED_RPM;
  var thrust = c.col * MAX_THRUST * rpmK * rpmK * (fault ? 0.42 : 1);
  if (st.crashed) { thrust = 0; }
  var roll = st.att[0]; var pitch = st.att[1]; var yaw = st.att[2];
  // 机体上方向（yaw-pitch-roll）
  var cr = cos(roll); var sr = sin(roll);
  var cp = cos(pitch); var sp = sin(pitch);
  var cy = cos(yaw); var sy = sin(yaw);
  var upx = cy * sp * cr + sy * sr;
  var upy = cp * cr;
  var upz = sy * sp * cr - cy * sr;
  var ax = upx * thrust / MASS + wind[0] * 0.55 - st.vel[0] * 0.12;
  var ay = upy * thrust / MASS - G + wind[1] * 0.2 - st.vel[1] * 0.06;
  var az = upz * thrust / MASS + wind[2] * 0.55 - st.vel[2] * 0.12;
  st.vel[0] = st.vel[0] + ax * dt;
  st.vel[1] = st.vel[1] + ay * dt;
  st.vel[2] = st.vel[2] + az * dt;
  st.pos[0] = st.pos[0] + st.vel[0] * dt;
  st.pos[1] = st.pos[1] + st.vel[1] * dt;
  st.pos[2] = st.pos[2] + st.vel[2] * dt;
  // 姿态：不稳定对象 + 控制力矩 + 阻尼
  var vib = fault ? 1.7 : 0.06;
  var n1 = (rnd() - 0.5) * vib;
  var n2 = (rnd() - 0.5) * vib;
  var n3 = (rnd() - 0.5) * vib * 0.6;
  if (!st.crashed) {
    st.angVel[0] = st.angVel[0] + (c.cx * 2.6 + roll * 0.5 + n1 - st.angVel[0] * 0.55) * dt;
    st.angVel[1] = st.angVel[1] + (c.cy * 2.6 + pitch * 0.5 + n2 - st.angVel[1] * 0.55) * dt;
    st.angVel[2] = st.angVel[2] + (c.ped * 2.0 + n3 - st.angVel[2] * 0.8) * dt;
    st.att[0] = st.att[0] + st.angVel[0] * dt;
    st.att[1] = st.att[1] + st.angVel[1] * dt;
    st.att[2] = st.att[2] + st.angVel[2] * dt;
  } else {
    // 坠毁后翻滚 settle
    st.angVel[0] = st.angVel[0] * (1 - 2.2 * dt);
    st.angVel[1] = st.angVel[1] * (1 - 2.2 * dt);
    st.angVel[2] = st.angVel[2] * (1 - 1.4 * dt);
    st.att[0] = st.att[0] + st.angVel[0] * dt;
    st.att[1] = st.att[1] + st.angVel[1] * dt;
    st.att[2] = st.att[2] + st.angVel[2] * dt;
    st.att[0] = st.att[0] * (1 - 0.7 * dt) + 0.32 * 0.7 * dt;
    st.att[1] = st.att[1] * (1 - 0.7 * dt) - 0.18 * 0.7 * dt;
  }
  st.rotorAngle = st.rotorAngle + st.rpm / 60 * 6.28318 * dt;
  st.tailAngle = st.tailAngle + st.rpm / 60 * 6.28318 * 3.2 * dt;
  // 地面接触
  var gh = terrainH(st.pos[0], st.pos[2]) + SKID_H;
  if (st.pos[1] <= gh) {
    var impactV = -st.vel[1];
    var tilt = abs(st.att[0]) + abs(st.att[1]);
    if (!st.crashed && (impactV > 3.2 || tilt > 0.95 || (fault && impactV > 1.6))) {
      st.crashed = true;
      st.crashT = t;
      st.crashPos = copy(st.pos);
      st.damage = { body: 0.8, canopy: 1, tailBoom: 0.7, tailFin: 0.9, engine: 0.6, skidL: 0.8, skidR: 0.5, mainRotor: 0.9, tailRotor: 1 };
      st.angVel[0] = (rnd() - 0.5) * 5;
      st.angVel[1] = (rnd() - 0.5) * 4;
      st.angVel[2] = (rnd() - 0.5) * 6;
      st.vel[0] = st.vel[0] * 0.35;
      st.vel[2] = st.vel[2] * 0.35;
      st.vel[1] = impactV > 6 ? 2.2 : 0.6;
    } else if (!st.crashed) {
      st.landed = true;
      st.vel[1] = 0;
      st.vel[0] = st.vel[0] * (1 - 3 * dt);
      st.vel[2] = st.vel[2] * (1 - 3 * dt);
      st.att[0] = st.att[0] * (1 - 4 * dt);
      st.att[1] = st.att[1] * (1 - 4 * dt);
      st.angVel[0] = 0; st.angVel[1] = 0;
      // 第二个停机坪成功降落判定
      var pad2 = scene.pads[1];
      if (pad2) {
        var dd = sqrt((st.pos[0] - pad2.pos[0]) * (st.pos[0] - pad2.pos[0]) + (st.pos[2] - pad2.pos[1]) * (st.pos[2] - pad2.pos[1]));
        if (dd < pad2.r && abs(st.vel[0]) + abs(st.vel[2]) < 0.6 && st.rpm > 150) { st.success = true; }
      }
    }
    st.pos[1] = gh;
    if (st.crashed) {
      st.vel[1] = st.vel[1] - G * dt;
      if (st.vel[1] < 0) { st.vel[1] = 0; }
      st.vel[0] = st.vel[0] * (1 - 4 * dt);
      st.vel[2] = st.vel[2] * (1 - 4 * dt);
    }
  } else {
    st.landed = false;
  }
  return st;
}
fn checkpointOf(t) {
  var best = null;
  var i = 0;
  var cps = mode == "live" ? recCheckpoints : record.checkpoints;
  while (i < len(cps)) {
    if (cps[i].t <= t + 0.0001 && (best == null || cps[i].t > best.t)) { best = cps[i]; }
    i = i + 1;
  }
  return best;
}
fn seekTo(t) {
  var cp = checkpointOf(t);
  if (cp != null) {
    state = copy(cp.state);
    simT = cp.t;
    if (has(cp, "rng")) { rng = cp.rng; }
  } else {
    state = initialState();
    simT = 0;
    rng = 12345;
  }
  crashedSent = state.crashed;
  advanceTo(t, true);
}
fn advanceTo(t, full) {
  var guard = 0;
  var maxSteps = full ? 100000 : 20;
  while (simT < t - 0.00001 && guard < maxSteps) {
    guard = guard + 1;
    var c = mode == "live" ? ctrl : ctrlAt(simT);
    var fault = faultActive(simT);
    state = integrate(state, c, simT, DT, fault);
    simT = simT + DT;
    if (mode == "live") {
      if (simT - lastCheckpointT >= 0.5) {
        lastCheckpointT = simT;
        push(recCheckpoints, { t: simT, state: copy(state), rng: rng });
        if (len(recCheckpoints) > 400) { pop(recCheckpoints); }
      }
    }
  }
}
fn submit() {
  var hidden = {};
  if (state.crashed) {
    hidden.mainRotor = true;
    hidden.bladeA = true;
    hidden.bladeB = true;
    hidden.tailRotor = true;
  }
  sys_scene_state(handle, {
    part: "heli", t: simT,
    pos: state.pos, att: state.att, rpm: state.rpm,
    rotorAngle: state.rotorAngle, tailAngle: state.tailAngle,
    damage: state.damage, hidden: hidden,
    crashed: state.crashed, landed: state.landed, success: state.success
  });
  var msg = { t: simT, pos: state.pos, vel: state.vel, att: state.att, rpm: state.rpm, crashed: state.crashed, crashT: state.crashT, crashPos: state.crashPos, landed: state.landed, success: state.success, fault: faultActive(simT) };
  if (effectsPid != 0) { sys_send(effectsPid, "flight_state", msg); }
  sys_send(playerPid, "flight_state", msg);
}
fn sendSensors() {
  if (controllerPid == 0 || mode != "live") { return; }
  if (simT - lastSensorT < 0.05) { return; }
  lastSensorT = simT;
  sys_send(controllerPid, "sensors", {
    t: simT, pos: copy(state.pos), vel: copy(state.vel), att: copy(state.att),
    angVel0: state.angVel[0], angVel1: state.angVel[1], angVel2: state.angVel[2],
    rpm: state.rpm, crashed: state.crashed, landed: state.landed,
    wind: copy(wind), heading: heading, fault: faultActive(simT),
    pads: [scene.pads[0].pos, scene.pads[1].pos]
  });
}
fn recordControl() {
  if (mode != "live") { return; }
  push(recControls, { t: simT, col: ctrl.col, cx: ctrl.cx, cy: ctrl.cy, ped: ctrl.ped });
}
fn handle(m) {
  var t = m.type;
  var pl = m.payload;
  if (t == "init") {
    effectsPid = pl.effectsPid;
    mode = pl.mode;
    if (pl.record != null) { record = pl.record; }
    state = initialState();
    simT = 0; targetT = 0;
    recControls = []; recInputs = []; recCheckpoints = [];
    lastCheckpointT = -1;
    submit();
    return;
  }
  if (t == "sample") {
    targetT = pl.t;
    if (targetT < simT - 0.001) { seekTo(targetT); }
    else { advanceTo(targetT, false); }
    submit();
    sendSensors();
    return;
  }
  if (t == "seek") {
    seekTo(pl.t);
    targetT = pl.t;
    submit();
    return;
  }
  if (t == "control") {
    ctrl = { col: clamp(pl.col, 0, 1), cx: clamp(pl.cx, -1, 1), cy: clamp(pl.cy, -1, 1), ped: clamp(pl.ped, -1, 1) };
    recordControl();
    return;
  }
  if (t == "input") {
    if (pl.kind == "wind") { wind = [pl.value, 0, pl.value2 || 0]; push(recInputs, { t: simT, kind: "wind", value: pl.value, value2: pl.value2 || 0 }); }
    else if (pl.kind == "heading") { heading = pl.value; push(recInputs, { t: simT, kind: "heading", value: pl.value }); }
    else if (pl.kind == "fault") { faultAt = simT + (pl.delay || 0); push(recInputs, { t: simT, kind: "fault", delay: pl.delay || 0 }); }
    else if (pl.kind == "controller") { controllerPid = pl.pid; }
    return;
  }
  if (t == "mode") {
    if (pl.mode == "live") {
      // 从当前状态转入排演：画面不跳变
      mode = "live";
      if (pl.state != null) { state = copy(pl.state); simT = pl.t; }
      recControls = [{ t: simT, col: ctrl.col, cx: ctrl.cx, cy: ctrl.cy, ped: ctrl.ped }];
      recInputs = [];
      recCheckpoints = [{ t: simT, state: copy(state) }];
      lastCheckpointT = simT;
      faultAt = -1;
      crashedSent = state.crashed;
    } else if (pl.mode == "replay") {
      mode = "replay";
      record = pl.record;
      faultAt = -1;
      seekTo(pl.t);
      targetT = pl.t;
      submit();
    } else if (pl.mode == "show") {
      mode = "show";
      record = scene.record;
      faultAt = -1;
      seekTo(pl.t);
      targetT = pl.t;
      submit();
    }
    return;
  }
  if (t == "get_record") {
    var dur = simT;
    var rec = {
      format: "nestedos-flightrec", version: 1,
      scene: scenePath,
      initial: copy(record.initial),
      controls: copy(recControls),
      inputs: copy(recInputs),
      checkpoints: copy(recCheckpoints),
      faults: faultAt >= 0 ? [{ t: faultAt }] : [],
      duration: dur
    };
    sys_send(playerPid, "record", rec);
    return;
  }
  if (t == "continue_live") {
    // 从记录位置继续排演
    seekTo(pl.t);
    mode = "live";
    var keepC = [];
    var i = 0;
    while (i < len(recControls)) { if (recControls[i].t <= pl.t) { push(keepC, recControls[i]); } i = i + 1; }
    recControls = keepC;
    var keepI = [];
    i = 0;
    while (i < len(recInputs)) { if (recInputs[i].t <= pl.t) { push(keepI, recInputs[i]); } i = i + 1; }
    recInputs = keepI;
    var keepK = [];
    i = 0;
    while (i < len(recCheckpoints)) { if (recCheckpoints[i].t <= pl.t) { push(keepK, recCheckpoints[i]); } i = i + 1; }
    recCheckpoints = keepK;
    lastCheckpointT = pl.t;
    faultAt = -1;
    submit();
    return;
  }
}
state = initialState();
submit();
while (true) {
  var m = sys_recv_timeout(8);
  if (m != null) {
    handle(m);
    var guard = 0;
    while (guard < 8) {
      var m2 = sys_poll();
      if (m2 == null) { break; }
      handle(m2);
      guard = guard + 1;
    }
  }
  if (mode == "live" && simT < targetT - 0.0001) {
    advanceTo(targetT, false);
    submit();
    sendSensors();
  }
}
