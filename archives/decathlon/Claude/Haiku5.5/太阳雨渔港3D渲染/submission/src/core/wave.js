// 确定性的“随机”与风场：全部是时间的纯函数，任意时刻都可直接求值，便于导出逐帧渲染。

// 平滑的伪随机摆动，取值约在 [-1, 1]
export function wob(t, seed = 0) {
  return (
    Math.sin(t * 1.13 + seed * 12.9) +
    0.6 * Math.sin(t * 2.37 + seed * 3.7 + 1.3) +
    0.35 * Math.sin(t * 4.61 + seed * 7.1 + 0.4)
  ) / 1.95;
}

export function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// 阵风：从海面方向（东北偏北的远端）向码头推进，所到之处依次起风
export const WIND_DIR = { x: -Math.SQRT1_2, z: Math.SQRT1_2 };
export const WIND_ORIGIN = { x: 9, z: -9 };
export const WIND_SPEED = 5.2;
export const GUSTS = [3.2, 15.8, 29.6, 42.9, 57.1, 70.4, 84.6, 98.2, 112.5];

export function gustEnv(u) {
  return smooth(0, 0.9, u) * (1 - smooth(2.6, 4.6, u));
}

// 某点处的阵风强度（0..1）：阵风前沿经过时增强，之后回落
export function gustAt(x, z, t) {
  const d = (x - WIND_ORIGIN.x) * WIND_DIR.x + (z - WIND_ORIGIN.z) * WIND_DIR.z;
  let g = 0;
  for (const T of GUSTS) {
    const u = t - T - d / WIND_SPEED;
    if (u > -0.5) g = Math.max(g, gustEnv(u));
  }
  return g;
}

// 风强：平时微风 + 阵风叠加
export function windAt(x, z, t) {
  return 0.28 + 0.12 * wob(t * 0.7 + x * 0.05) + 0.9 * gustAt(x, z, t);
}

// 雨势：在细雨与稍密之间缓慢起伏（0 细雨 ~ 1 稍密）
export function rainAt(t) {
  return 0.5 + 0.5 * wob(t * 0.13, 3.0);
}

// 太阳雨里偶尔的雨势转弱（用于彩虹出现）
export function rainbowAt(t) {
  const weak = 1 - smooth(0.15, 0.25, rainAt(t));
  return weak;
}
