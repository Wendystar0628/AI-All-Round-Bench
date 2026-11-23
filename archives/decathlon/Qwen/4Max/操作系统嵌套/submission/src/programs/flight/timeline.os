// 时效进程：按所属系统虚拟时间推进播放位置，通过消息驱动飞行场景与环境特效进程。
var me = sys_self();
var args = sys_args();
var playerPid = args[0];
var flightPid = args[1];
var effectsPid = args[2];
var fps = 30;
var duration = args[3];
var playing = false;
var rate = 1;
var loop = false;
var t = 0;

fn tick() {
  if (!playing) { return; }
  t = t + (1 / fps) * rate;
  if (t >= duration) {
    if (loop) { t = 0; }
    else { t = duration; playing = false; sys_send(playerPid, "ended", {}); }
  }
  sys_send(flightPid, "sample", { t: t });
  sys_send(playerPid, "position", { t: t, playing: playing });
}
while (true) {
  var m = sys_recv_timeout(1000 / fps);
  if (m == null) {
    tick();
  } else {
    var pl = m.payload;
    if (m.type == "play") { playing = true; if (pl != null && pl.rate != null) { rate = pl.rate; } }
    else if (m.type == "pause") { playing = false; }
    else if (m.type == "stop") { playing = false; t = 0; sys_send(flightPid, "seek", { t: 0 }); sys_send(playerPid, "position", { t: 0, playing: false }); }
    else if (m.type == "seek") { t = clamp(pl.t, 0, duration); sys_send(flightPid, "seek", { t: t }); sys_send(playerPid, "position", { t: t, playing: playing }); }
    else if (m.type == "rate") { rate = pl.rate; }
    else if (m.type == "loop") { loop = pl.loop; }
    else if (m.type == "step") {
      playing = false;
      t = min(duration, t + 1 / fps);
      sys_send(flightPid, "sample", { t: t });
      sys_send(playerPid, "position", { t: t, playing: false });
    }
    else if (m.type == "duration") { duration = pl.duration; }
    else if (m.type == "set") { t = pl.t; }
    var guard = 0;
    while (guard < 6) {
      var m2 = sys_poll();
      if (m2 == null) { break; }
      var pl2 = m2.payload;
      if (m2.type == "play") { playing = true; }
      else if (m2.type == "pause") { playing = false; }
      else if (m2.type == "rate") { rate = pl2.rate; }
      else if (m2.type == "loop") { loop = pl2.loop; }
      guard = guard + 1;
    }
  }
}
