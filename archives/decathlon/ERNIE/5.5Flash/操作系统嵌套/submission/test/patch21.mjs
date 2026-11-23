import fs from 'fs';
let s = fs.readFileSync('js/data.js', 'utf8');
const a = `  let ground = sensor(9)

  # 目标高度：靠近二号停机坪后下降`;
const b = `  let ground = sensor(9)

  # 传感器融合：每个控制周期做固定量的计算
  # 预算降低时这段计算会拉长控制周期，机体随之抖动直至失控
  let k = 0
  let filt = roll
  while k < 350 {
    set filt = filt * 0.92 + roll * 0.08
    set k = k + 1
  }

  # 目标高度：靠近二号停机坪后下降`;
if (s.includes(a)) { s = s.replace(a, b); console.log('inserted'); } else console.log('miss');
s = s.replace(`  let rollCmd = (0 - rollR) * 3.0 - p * 0.9`, `  let rollCmd = (0 - filt / 57.3) * 3.0 - p * 0.9`);
fs.writeFileSync('js/data.js', s);
console.log('done');