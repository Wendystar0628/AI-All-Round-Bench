import fs from 'fs';
const path = 'js/data.js';
let s = fs.readFileSync(path, 'utf8');
const start = s.indexOf('  # 俯仰通道：速度误差 + 姿态阻尼');
const endMarker = '  if yawCmd < -1 { set yawCmd = -1 }';
const end = s.indexOf(endMarker, start);
if (start < 0 || end < 0) { console.log('NOT FOUND', start, end); process.exit(1); }
const neu = `  # 姿态角速率（度/秒 -> 弧度/秒）
  let q = sensor(12) / 57.3
  let p = sensor(13) / 57.3
  let r = sensor(14) / 57.3

  # 俯仰通道：期望俯仰角由速度误差给出，再用角度与角速率反馈
  let pitchR = pitch / 57.3
  let rollR = roll / 57.3
  let desiredPitch = (desired - spd) * 0.06
  if desiredPitch > 0.35 { set desiredPitch = 0.35 }
  if desiredPitch < -0.35 { set desiredPitch = -0.35 }
  let pitchCmd = (desiredPitch - pitchR) * 3.0 - q * 0.9
  if pitchCmd > 1 { set pitchCmd = 1 }
  if pitchCmd < -1 { set pitchCmd = -1 }

  # 滚转通道：抑制侧倾
  let rollCmd = (0 - rollR) * 3.0 - p * 0.9
  if rollCmd > 1 { set rollCmd = 1 }
  if rollCmd < -1 { set rollCmd = -1 }

  # 偏航通道：按方位误差给出期望角速率
  let dh = brg - hdg
  while dh > 180 { set dh = dh - 360 }
  while dh < -180 { set dh = dh + 360 }
  let desiredRate = dh * 0.02
  if desiredRate > 0.5 { set desiredRate = 0.5 }
  if desiredRate < -0.5 { set desiredRate = -0.5 }
  let yawCmd = (desiredRate - r) * 1.5
  if yawCmd > 1 { set yawCmd = 1 }
  if yawCmd < -1 { set yawCmd = -1 }`;
s = s.slice(0, start) + neu + s.slice(end + endMarker.length);
fs.writeFileSync(path, s);
console.log('ok');