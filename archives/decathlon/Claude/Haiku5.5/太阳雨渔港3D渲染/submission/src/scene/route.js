import * as THREE from 'three';
import { smooth } from '../core/wave.js';

// 游钓船的出港航线：从泊位出发，经防波堤东端的灯塔外侧绕到堤外，兜一圈后原路返回泊位。
const WAY = [
  [1.1, -2.4],
  [4.0, -2.7],
  [7.0, -3.3],
  [8.9, -4.5],
  [9.3, -6.4],
  [7.2, -7.9],
  [3.2, -8.1],
  [-0.4, -7.5],
];
const curve = new THREE.CatmullRomCurve3(WAY.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
const _p = new THREE.Vector3();
const _tg = new THREE.Vector3();

// 一个周期 64 秒：0–4 停泊，4–28 出港，28–32 绕行，32–56 返回，56–64 停泊
const PERIOD = 64;
const OUT = [4, 28];
const BACK = [32, 56];

// 归一化进度 u∈[0,1]（0 = 泊位，1 = 航线尽头）与是否在航行
export function tripProgress(t) {
  const ph = ((t % PERIOD) + PERIOD) % PERIOD;
  if (ph >= OUT[0] && ph < OUT[1]) return { u: smooth(OUT[0], OUT[1], ph), dir: 1, moving: true };
  if (ph >= BACK[0] && ph < BACK[1]) return { u: 1 - smooth(BACK[0], BACK[1], ph), dir: -1, moving: true };
  if (ph >= OUT[1] && ph < BACK[0]) return { u: 1, dir: 1, moving: false };
  return { u: 0, dir: 1, moving: false };
}

// 游钓船在 t 时刻的位置与朝向（船首方向为局部 +Z；ry = atan2(dx, dz)）
export function sportState(t) {
  const { u, dir, moving } = tripProgress(t);
  curve.getPointAt(Math.min(1, Math.max(0, u)), _p);
  curve.getTangentAt(Math.min(1, Math.max(0, u)), _tg);
  if (dir < 0) _tg.negate();
  const ry = Math.atan2(_tg.x, _tg.z);
  return { x: _p.x, z: _p.z, ry, moving, u };
}

export const SPORT_BERTH = (() => {
  const s = sportState(0);
  return { x: s.x, z: s.z, ry: s.ry };
})();

// 水面上的航迹波：船在过去的每个采样时刻都会发出一圈向外扩散的波纹
const WAKE_STEP = 0.4;
const WAKE_SPAN = 8;
const WAKE_SPEED = 1.6;

export function wakeEmitters(t) {
  const list = [];
  for (let k = 0; ; k++) {
    const te = t - k * WAKE_STEP;
    if (te < 0 || k * WAKE_STEP > WAKE_SPAN) break;
    const s = sportState(te);
    if (s.moving) list.push({ x: s.x, z: s.z, te, amp: 0.9 });
  }
  return list;
}

// 任一点的航迹起伏高度（用来晃动浮标、泊位的船与岸壁边的小物件）
export function wakeHeight(x, z, t, list = wakeEmitters(t)) {
  let h = 0;
  for (const e of list) {
    const age = t - e.te;
    const d = Math.hypot(x - e.x, z - e.z);
    const r = WAKE_SPEED * age;
    const dd = (d - r) / 0.55;
    if (Math.abs(dd) < 3) {
      h += e.amp * Math.exp(-dd * dd) * Math.sin(age * 7 - d * 2.5) * Math.exp(-age / 3.2) / (1 + d * 0.25);
    }
  }
  return h * 0.22;
}

// 把最近的几次发射写入水面的扰动源（x, z, 发出时刻, 强度）
export function feedRipples(buf, t) {
  const list = wakeEmitters(t).slice(0, buf.length);
  for (let i = 0; i < buf.length; i++) {
    const e = list[i];
    if (e) buf[i].set(e.x, e.z, e.te, e.amp);
    else buf[i].set(0, 0, -100, 0);
  }
}
