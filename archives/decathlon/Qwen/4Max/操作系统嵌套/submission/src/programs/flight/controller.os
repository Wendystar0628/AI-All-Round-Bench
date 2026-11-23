// 飞控程序（普通程序文件，可修改）：读取带时间戳的传感器值，写入总距与舵面。
// 控制量保持到下一次写入；错过周期的控制不补发。
// 接口：接收 {type:"sensors"} 消息；向飞控目标进程发送 {type:"control", payload:{col,cx,cy,ped}}。
var me = sys_self();
var args = sys_args();
var flightPid = args[0];
var targetPad = 1;          // 目标：第二个停机坪
var hoverAlt = 9;
var lastT = -1;
// PID 增益（可修改以改变飞行行为）
var KP_ALT = 0.16;
var KD_ALT = 0.30;
var KP_ATT = 1.35;
var KD_ATT = 0.9;
var KP_POS = 0.055;
var KD_POS = 0.16;

fn clampv(x, a, b) { return min(max(x, a), b); }
while (true) {
  var m = sys_recv();
  if (m.type != "sensors") { continue; }
  var s = m.payload;
  if (s.crashed) {
    sys_send(flightPid, "control", { col: 0, cx: 0, cy: 0, ped: 0 });
    continue;
  }
  var dt = lastT < 0 ? 0.05 : max(0.02, s.t - lastT);
  lastT = s.t;
  var pads = s.pads;
  var tx = pads[targetPad][0];
  var tz = pads[targetPad][1];
  // 高度控制
  var altErr = hoverAlt - s.pos[1];
  var col = 0.655 + KP_ALT * altErr - KD_ALT * s.vel[1];
  // 水平位置控制（通过姿态倾斜产生水平加速度）
  var dx = tx - s.pos[0];
  var dz = tz - s.pos[2];
  var dist = sqrt(dx * dx + dz * dz);
  var wantVx = clampv(KP_POS * dx * 8, -6, 6);
  var wantVz = clampv(KP_POS * dz * 8, -6, 6);
  if (dist < 2.5) { wantVx = 0; wantVz = 0; }
  var axErr = wantVx - s.vel[0];
  var azErr = wantVz - s.vel[2];
  // 期望姿态：前倾产生前进加速度（机体 x 前）
  var yaw = s.att[2];
  var cy = cos(yaw); var sy = sin(yaw);
  var wantPitch = clampv(-(cy * axErr + sy * azErr) * 0.09, -0.35, 0.35);
  var wantRoll = clampv((sy * axErr - cy * azErr) * 0.09, -0.35, 0.35);
  var cx = clampv(KP_ATT * (wantRoll - s.att[0]) - KD_ATT * s.angVel0, -1, 1);
  var cyv = clampv(KP_ATT * (wantPitch - s.att[1]) - KD_ATT * s.angVel1, -1, 1);
  // 航向保持
  var ped = clampv(-s.att[2] * 0.8 - s.angVel2 * 0.5, -1, 1);
  if (s.fault) {
    col = clampv(col + 0.25, 0, 1);
  }
  sys_send(flightPid, "control", { col: clampv(col, 0, 1), cx: cx, cy: cyv, ped: ped });
}
