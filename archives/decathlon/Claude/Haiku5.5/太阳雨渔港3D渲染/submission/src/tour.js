import * as THREE from 'three';
import { overviewPose } from './camera.js';

export const OVERVIEW_DUR = 5;
export const TOUR_DUR = 60;

// 巡游的镜头组：每个镜头是一段连续运镜，镜头之间硬切。
// 每个镜头的关键帧：时间（秒）、相机位置 p、注视点 g；o 表示全貌构图（位置由画幅比决定）。
// 镜头顺序：全貌 → 港猫特写 → 海鸥特写 → 远景推向码头 → 横移泊位 → 乐器箱与雨伞 → 风中的晒网与风向袋
// → 小渔船驾驶舱 → 仓库卷帘门内 → 候船室玻璃窗 → 水下剖面 → 灯塔与消波块 → 远景跟随航迹 → 回到全景。
// 相机始终留在水面以上或底座之外，不穿过实体。
const SHOTS = [
  // 全貌停留片刻，随即切到岸边
  { wob: 0, keys: [
    { t: 0, o: true },
    { t: 0.9, o: true },
  ] },
  // 特写：舢板下的港猫（港猫此时仍蹲在避雨处），抬头看向镜头
  { keys: [
    { t: 0.9, p: [0.0, 0.6, 7.6], g: [-2.6, 0.25, 5.1] },
    { t: 5.5, p: [-0.9, 0.55, 6.2], g: [-2.4, 0.3, 5.2] },
  ] },
  // 特写：系船柱上的海鸥，轻微推近，海鸥扑翅飞走
  { keys: [
    { t: 5.5, p: [15.0, 4.0, 1.5], g: [4.2, 0.45, 3.45] },
    { t: 10.0, p: [9.6, 1.6, 2.0], g: [4.2, 0.45, 3.45] },
  ] },
  // 远景：从港外高处慢慢推向 L 形码头，带上防波堤和太阳雨
  { keys: [
    { t: 10.0, p: [20.5, 16.0, 22.0], g: [-1.5, -1.1, 0.0] },
    { t: 16.0, p: [14.5, 13.0, 17.0], g: [-4.5, -1.2, -1.0] },
  ] },
  // 中景：沿泊位上方横移，掠过渔船与系泊浮标
  { keys: [
    { t: 16.0, p: [8.6, 1.1, 0.9], g: [5.0, -0.2, -2.2] },
    { t: 21.0, p: [-1.6, 1.1, 0.9], g: [-3.4, -0.1, -2.6] },
  ] },
  // 中景：乐器硬箱、斜靠台阶的雨伞，旁边水洼倒映着灯柱
  { keys: [
    { t: 21.0, p: [-1.6, 1.9, 0.0], g: [4.3, 0.2, 5.0] },
    { t: 25.0, p: [-0.6, 1.5, 0.4], g: [5.2, 0.4, 4.4] },
  ] },
  // 中景：一阵风从海上吹来，风向袋、晒网与浮球串、小旗依次摆动
  { keys: [
    { t: 25.0, p: [0.6, 2.4, 1.4], g: [-8.4, 1.6, 5.2] },
    { t: 30.0, p: [-2.0, 2.2, 0.2], g: [-8.6, 2.0, 5.8] },
  ] },
  // 特写：透过驾驶舱玻璃，慢慢推向舱内的雷达屏、海图和保温壶
  { keys: [
    { t: 30.0, p: [-2.4, 2.3, 0.2], g: [-2.55, 0.5, -2.3] },
    { t: 34.0, p: [-2.4, 1.9, -1.0], g: [-2.55, 0.4, -2.6] },
  ] },
  // 中景：穿过半拉起的卷帘门，看仓库里的光柱、冰柜与成垛鱼箱
  { keys: [
    { t: 34.0, p: [-1.6, 1.25, 1.9], g: [-6.0, 0.7, -1.4] },
    { t: 37.0, p: [-4.6, 1.0, -1.8], g: [-7.2, 0.5, -2.2] },
    { t: 40.0, p: [-5.9, 0.9, -1.9], g: [-8.8, 0.6, -2.4] },
  ] },
  // 中景：隔着候船室的落地玻璃横移，看长椅、收音机与挂钟
  { keys: [
    { t: 40.0, p: [2.6, 1.9, 14.8], g: [5.9, 0.8, 7.6] },
    { t: 44.0, p: [9.6, 1.9, 14.8], g: [5.9, 0.8, 7.6] },
  ] },
  // 中景：沿底座侧壁下沉，看岸壁剖面、水下海床和游动的鱼群
  { keys: [
    { t: 44.0, p: [15.8, 0.6, -2.6], g: [5.2, -1.0, -3.6] },
    { t: 49.0, p: [15.4, -2.2, -2.6], g: [5.2, -2.9, -3.6] },
  ] },
  // 中景：防波堤尽头的灯塔，消波块之间浪花翻涌
  { keys: [
    { t: 49.0, p: [14.0, 1.6, -1.2], g: [7.6, 1.6, -5.4] },
    { t: 54.0, p: [12.6, 2.6, -3.8], g: [7.3, 2.2, -5.5] },
  ] },
  // 远景：从高处拉近，带上出港白船身后的航迹与远处的小渔船
  { keys: [
    { t: 54.0, p: [12.5, 7.5, -12.5], g: [2.0, -1.0, -5.0] },
    { t: 58.5, p: [9.0, 6.0, -13.5], g: [1.0, -1.0, -6.0] },
  ] },
  // 结尾：回到全貌，并留出一小段稳定的画面
  { wob: 0, keys: [
    { t: 58.5, o: true },
    { t: 60, o: true },
  ] },
];

function smooth01(s) {
  return s * s * (3 - 2 * s);
}

// Catmull-Rom 插值（均匀参数）
function cr(p0, p1, p2, p3, s, out) {
  const s2 = s * s, s3 = s2 * s;
  for (let i = 0; i < 3; i++) {
    out[i] = 0.5 * (
      2 * p1[i] +
      (-p0[i] + p2[i]) * s +
      (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * s2 +
      (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * s3
    );
  }
  return out;
}

let cache = { aspect: 0, shots: null };
function resolveShots(aspect) {
  const a = Math.round(aspect * 100) / 100;
  if (cache.aspect === a && cache.shots) return cache.shots;
  const o = overviewPose(aspect);
  const op = [o.pos.x, o.pos.y, o.pos.z];
  const og = [o.target.x, o.target.y, o.target.z];
  const shots = SHOTS.map((s) => {
    const keys = s.keys.map((k) => (k.o ? { t: k.t, p: op, g: og } : k));
    return { t0: keys[0].t, t1: keys[keys.length - 1].t, wob: s.wob ?? 1, keys };
  });
  cache = { aspect: a, shots };
  return shots;
}

const _p = [0, 0, 0];
const _g = [0, 0, 0];
const _tmp = [0, 0, 0];

// 第 t 秒（段内时间）的相机位姿
export function tourPose(t, aspect) {
  const shots = resolveShots(aspect);
  const tt = Math.min(Math.max(t, 0), TOUR_DUR);
  // 时刻落在镜头的起点时即切到该镜头
  let si = 0;
  while (si < shots.length - 1 && tt >= shots[si + 1].t0) si++;
  const sh = shots[si];
  const keys = sh.keys;
  let i = 0;
  while (i < keys.length - 2 && tt > keys[i + 1].t) i++;
  const k1 = keys[i], k2 = keys[i + 1];
  const k0 = keys[Math.max(0, i - 1)], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const s = smooth01((tt - k1.t) / (k2.t - k1.t));
  cr(k0.p, k1.p, k2.p, k3.p, s, _tmp);
  _p[0] = _tmp[0]; _p[1] = _tmp[1]; _p[2] = _tmp[2];
  cr(k0.g, k1.g, k2.g, k3.g, s, _tmp);
  _g[0] = _tmp[0]; _g[1] = _tmp[1]; _g[2] = _tmp[2];
  // 手持般的极轻微晃动（确定性，与时间有关）；镜头起止处渐入渐出，切镜头时画面不跳动
  const ramp = smooth01(Math.min(1, Math.min(tt - sh.t0, sh.t1 - tt) / 1.0));
  const wob = sh.wob * ramp * (0.035 * Math.sin(tt * 1.3) + 0.02 * Math.sin(tt * 2.9 + 1.0));
  const pos = new THREE.Vector3(_p[0] + wob, _p[1] + 0.5 * wob * 0.3, _p[2] - wob * 0.4);
  const target = new THREE.Vector3(_g[0], _g[1], _g[2]);
  // 保证起止两帧严格等于全貌构图
  const edge = Math.min(tt, TOUR_DUR - tt);
  if (edge < 0.001) {
    const o = overviewPose(aspect);
    return { pos: o.pos, target: o.target };
  }
  return { pos, target };
}
