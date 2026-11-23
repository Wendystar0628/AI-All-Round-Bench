// 环境特效进程：下洗尘土、烟、火、火花、碎片与焦痕。
// 接收飞行场景进程的状态消息，在三维空间中演化特效并提交显示。
var me = sys_self();
var args = sys_args();
var playerPid = args[0];
var scenePath = args[1];
var handle = args[2];
var rd = sys_read(scenePath);
var scene = json_parse(rd.content);
var particles = [];
var debris = [];
var scorch = [];
var lastT = 0;
var flight = null;
var wasCrashed = false;
var rng = 777;
var smokeAcc = 0;

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
    var d = sqrt((x - pad.pos[0]) * (x - pad.pos[0]) + (z - pad.pos[1]) * (z - pad.pos[1]));
    if (d < pad.r * 1.6) {
      var ph = t.base;
      var wi = 0;
      while (wi < len(t.waves)) {
        var ww = t.waves[wi];
        ph = ph + ww.amp * sin(ww.freq * (ww.dx * pad.pos[0] + ww.dz * pad.pos[1]) + ww.phase);
        wi = wi + 1;
      }
      var k = clamp((d - pad.r) / (pad.r * 0.6), 0, 1);
      var s = k * k * (3 - 2 * k);
      h = ph * (1 - s) + h * s;
    }
    pi = pi + 1;
  }
  return h;
}
fn spawnDust(pos, rpm, alt) {
  var strength = clamp((rpm - 80) / 300, 0, 1) * clamp(1 - alt / 13, 0, 1);
  if (strength <= 0.03) { return; }
  var n = floor(strength * 3);
  var i = 0;
  while (i < n) {
    var a = rnd() * 6.28318;
    var r = 1.5 + rnd() * 3.5;
    var x = pos[0] + cos(a) * r;
    var z = pos[2] + sin(a) * r;
    var y = terrainH(x, z) + 0.2;
    push(particles, { kind: "dust", pos: [x, y, z], vel: [cos(a) * (1.5 + rnd() * 2), 0.8 + rnd() * 1.4, sin(a) * (1.5 + rnd() * 2)], size: 1.4 + rnd() * 2.2, life: 1.6 + rnd() * 1.2, maxLife: 2.8, seed: rnd(), opacity: 0.4 });
    i = i + 1;
  }
}
fn spawnCrash(pos, vel) {
  push(scorch, { pos: [pos[0], 0, pos[2]], r: 4.5 });
  var i = 0;
  while (i < 26) {
    var a = rnd() * 6.28318;
    var sp = 3 + rnd() * 9;
    push(debris, {
      geo: i % 3 == 0 ? "debrisBlade" : (i % 3 == 1 ? "debrisPanel" : "debrisChunk"),
      mat: i % 4 == 0 ? "heliYellow" : "heliPurple",
      pos: [pos[0] + (rnd() - 0.5) * 2, pos[1] + 0.5 + rnd(), pos[2] + (rnd() - 0.5) * 2],
      rot: [rnd() * 6, rnd() * 6, rnd() * 6],
      vel: [cos(a) * sp + vel[0] * 0.4, 3 + rnd() * 7, sin(a) * sp + vel[2] * 0.4],
      angVel: [(rnd() - 0.5) * 12, (rnd() - 0.5) * 12, (rnd() - 0.5) * 12],
      scale: [0.7 + rnd() * 0.8, 0.7 + rnd() * 0.8, 0.7 + rnd() * 0.8],
      rested: false
    });
    i = i + 1;
  }
  var j = 0;
  while (j < 30) {
    var a2 = rnd() * 6.28318;
    var sp2 = 2 + rnd() * 8;
    push(particles, { kind: j < 12 ? "fire" : "dust", pos: [pos[0], pos[1] + 0.4, pos[2]], vel: [cos(a2) * sp2, 2 + rnd() * 6, sin(a2) * sp2], size: 1.5 + rnd() * 3, life: 0.8 + rnd() * 1.4, maxLife: 2.2, seed: rnd(), opacity: 0.7 });
    j = j + 1;
  }
  var k = 0;
  while (k < 14) {
    push(particles, { kind: "spark", pos: [pos[0], pos[1] + 0.5, pos[2]], vel: [(rnd() - 0.5) * 14, 3 + rnd() * 9, (rnd() - 0.5) * 14], size: 0.3 + rnd() * 0.4, life: 0.5 + rnd() * 0.7, maxLife: 1.2, seed: rnd(), opacity: 0.9 });
    k = k + 1;
  }
}
fn step(dt) {
  if (flight == null) { return; }
  var t = flight.t;
  var pos = flight.pos;
  var alt = pos[1] - terrainH(pos[0], pos[2]);
  if (!flight.crashed) {
    spawnDust(pos, flight.rpm, alt);
    if (flight.fault && rnd() < 0.5) {
      push(particles, { kind: "smoke", pos: [pos[0] - 0.5, pos[1] + 0.9, pos[2]], vel: [(rnd() - 0.5) * 0.6, 1.2 + rnd(), (rnd() - 0.5) * 0.6], size: 0.9 + rnd() * 1.2, life: 1.8 + rnd() * 1.4, maxLife: 3.2, seed: rnd(), opacity: 0.45 });
    }
  } else {
    if (!wasCrashed) {
      spawnCrash(flight.crashPos || pos, flight.vel);
      wasCrashed = true;
    }
    smokeAcc = smokeAcc + dt;
    if (smokeAcc > 0.12 && t - flight.crashT < 5.5) {
      smokeAcc = 0;
      var cp = flight.crashPos || pos;
      push(particles, { kind: "smoke", pos: [cp[0] + (rnd() - 0.5) * 2, cp[1] + 0.6, cp[2] + (rnd() - 0.5) * 2], vel: [(rnd() - 0.5) * 0.8 + wind0(), 1.6 + rnd() * 1.6, (rnd() - 0.5) * 0.8], size: 1.6 + rnd() * 2.4, life: 2.6 + rnd() * 2, maxLife: 4.6, seed: rnd(), opacity: 0.5 });
      if (t - flight.crashT < 2.6 && rnd() < 0.6) {
        push(particles, { kind: "fire", pos: [cp[0] + (rnd() - 0.5) * 1.6, cp[1] + 0.3, cp[2] + (rnd() - 0.5) * 1.6], vel: [(rnd() - 0.5) * 0.5, 1.5 + rnd() * 2, (rnd() - 0.5) * 0.5], size: 0.9 + rnd() * 1.4, life: 0.5 + rnd() * 0.7, maxLife: 1.2, seed: rnd(), opacity: 0.75 });
      }
    }
  }
  // 粒子演化
  var keep = [];
  var i = 0;
  while (i < len(particles)) {
    var p = particles[i];
    p.life = p.life - dt;
    if (p.life > 0) {
      p.pos[0] = p.pos[0] + p.vel[0] * dt;
      p.pos[1] = p.pos[1] + p.vel[1] * dt;
      p.pos[2] = p.pos[2] + p.vel[2] * dt;
      if (p.kind == "dust") { p.vel[1] = p.vel[1] - 1.2 * dt; p.size = p.size + 1.6 * dt; }
      if (p.kind == "smoke") { p.vel[1] = p.vel[1] + 0.4 * dt; p.size = p.size + 1.1 * dt; }
      if (p.kind == "fire") { p.size = p.size * (1 - 0.7 * dt); }
      if (p.kind == "spark") { p.vel[1] = p.vel[1] - 9.8 * dt; }
      var gh = terrainH(p.pos[0], p.pos[2]);
      if (p.pos[1] < gh + 0.05) { p.pos[1] = gh + 0.05; p.vel[1] = abs(p.vel[1]) * 0.2; }
      push(keep, p);
    }
    i = i + 1;
  }
  particles = keep;
  if (len(particles) > 260) { particles = slice(particles, len(particles) - 260, len(particles)); }
  // 碎片演化
  var di = 0;
  while (di < len(debris)) {
    var d = debris[di];
    if (!d.rested) {
      d.vel[1] = d.vel[1] - 9.8 * dt;
      d.pos[0] = d.pos[0] + d.vel[0] * dt;
      d.pos[1] = d.pos[1] + d.vel[1] * dt;
      d.pos[2] = d.pos[2] + d.vel[2] * dt;
      d.rot[0] = d.rot[0] + d.angVel[0] * dt;
      d.rot[1] = d.rot[1] + d.angVel[1] * dt;
      d.rot[2] = d.rot[2] + d.angVel[2] * dt;
      var gh2 = terrainH(d.pos[0], d.pos[2]) + 0.12;
      if (d.pos[1] <= gh2) {
        d.pos[1] = gh2;
        if (abs(d.vel[1]) > 1.2) {
          d.vel[1] = -d.vel[1] * 0.3;
          d.vel[0] = d.vel[0] * 0.6;
          d.vel[2] = d.vel[2] * 0.6;
          d.angVel[0] = d.angVel[0] * 0.5;
          d.angVel[1] = d.angVel[1] * 0.5;
          d.angVel[2] = d.angVel[2] * 0.5;
        } else {
          d.rested = true;
          d.vel = [0, 0, 0];
          d.angVel = [0, 0, 0];
        }
      }
    }
    di = di + 1;
  }
  lastT = t;
}
fn wind0() { return 0.3; }
fn submit() {
  var out = [];
  var i = 0;
  while (i < len(particles)) {
    var p = particles[i];
    push(out, { kind: p.kind, pos: p.pos, size: p.size, life: p.life, maxLife: p.maxLife, seed: p.seed, opacity: p.opacity });
    i = i + 1;
  }
  var dout = [];
  i = 0;
  while (i < len(debris)) {
    var d = debris[i];
    push(dout, { geo: d.geo, mat: d.mat, pos: d.pos, rot: d.rot, scale: d.scale });
    i = i + 1;
  }
  sys_scene_state(handle, { part: "fx", t: lastT, particles: out, debris: dout, scorch: scorch });
}
fn reset() {
  particles = [];
  debris = [];
  scorch = [];
  wasCrashed = false;
  flight = null;
  lastT = 0;
}
while (true) {
  var m = sys_recv_timeout(16);
  if (m != null) {
    if (m.type == "flight_state") {
      var prevT = lastT;
      flight = m.payload;
      var dt = clamp(flight.t - prevT, 0, 0.2);
      if (flight.t < prevT - 0.001) { reset(); flight = m.payload; dt = 0; }
      step(dt);
      submit();
    } else if (m.type == "reset") {
      reset();
      submit();
    } else if (m.type == "init") {
      reset();
    }
    var guard = 0;
    while (guard < 6) {
      var m2 = sys_poll();
      if (m2 == null) { break; }
      if (m2.type == "flight_state") {
        var pt = lastT;
        flight = m2.payload;
        var dt2 = clamp(flight.t - pt, 0, 0.2);
        if (flight.t < pt - 0.001) { reset(); flight = m2.payload; dt2 = 0; }
        step(dt2);
      }
      guard = guard + 1;
    }
    if (flight != null) { submit(); }
  }
}
