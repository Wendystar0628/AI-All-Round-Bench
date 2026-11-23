import fs from 'fs';
let f = fs.readFileSync('js/flight.js', 'utf8');
f = f.replace(`  let desiredPitch = clamp((desired - spd) * 0.06, -0.35, 0.35);
  let pitchCmd = clamp((desiredPitch - pitchR) * 3.0 - qR * 0.9, -1, 1);
  let rollCmd = clamp((0 - rollR) * 3.0 - pR * 0.9, -1, 1);
  let dh = brg - hdg;
  while (dh > 180) dh -= 360;
  while (dh < -180) dh += 360;
  let desiredRate = clamp(dh * 0.02, -0.5, 0.5);
  let yawCmd = clamp((desiredRate - rR) * 1.5, -1, 1);`,
`  let dh = brg - hdg;
  while (dh > 180) dh -= 360;
  while (dh < -180) dh += 360;
  let desiredPitch = clamp((desired - spd) * 0.06, -0.35, 0.35);
  let pitchCmd = clamp((desiredPitch - pitchR) * 3.0 - qR * 0.9, -1, 1);
  let desiredRoll = clamp(dh * 0.02, -0.55, 0.55);
  let rollCmd = clamp((desiredRoll - rollR) * 3.0 - pR * 0.9, -1, 1);
  let desiredRate = clamp(dh * 0.02, -0.5, 0.5);
  let yawCmd = clamp((desiredRate - rR) * 1.5, -1, 1);`);
fs.writeFileSync('js/flight.js', f);

let s = fs.readFileSync('js/data.js', 'utf8');
s = s.replace(`  # 俯仰通道：期望俯仰角由速度误差给出，再用角度与角速率反馈
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
  if yawCmd < -1 { set yawCmd = -1 }`,
`  # 偏航通道：按方位误差给出期望角速率
  let dh = brg - hdg
  while dh > 180 { set dh = dh - 360 }
  while dh < -180 { set dh = dh + 360 }

  # 俯仰通道：期望俯仰角由速度误差给出，再用角度与角速率反馈
  let pitchR = pitch / 57.3
  let rollR = roll / 57.3
  let desiredPitch = (desired - spd) * 0.06
  if desiredPitch > 0.35 { set desiredPitch = 0.35 }
  if desiredPitch < -0.35 { set desiredPitch = -0.35 }
  let pitchCmd = (desiredPitch - pitchR) * 3.0 - q * 0.9
  if pitchCmd > 1 { set pitchCmd = 1 }
  if pitchCmd < -1 { set pitchCmd = -1 }

  # 滚转通道：按航向误差压坡度，实现协调转弯
  let desiredRoll = dh * 0.02
  if desiredRoll > 0.55 { set desiredRoll = 0.55 }
  if desiredRoll < -0.55 { set desiredRoll = -0.55 }
  let rollCmd = (desiredRoll - rollR) * 3.0 - p * 0.9
  if rollCmd > 1 { set rollCmd = 1 }
  if rollCmd < -1 { set rollCmd = -1 }

  # 偏航通道：期望角速率
  let desiredRate = dh * 0.02
  if desiredRate > 0.5 { set desiredRate = 0.5 }
  if desiredRate < -0.5 { set desiredRate = -0.5 }
  let yawCmd = (desiredRate - r) * 1.5
  if yawCmd > 1 { set yawCmd = 1 }
  if yawCmd < -1 { set yawCmd = -1 }`);
fs.writeFileSync('js/data.js', s);
console.log('patched');