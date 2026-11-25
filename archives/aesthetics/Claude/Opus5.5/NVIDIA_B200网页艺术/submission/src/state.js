// 全局运行状态（滚动进度、时钟、视口）与用户交互状态
import { Spring } from './util.js';

export const S = {
  W: 1920, H: 1080, dpr: 1,
  unit: 1,           // 以 1920×1080 为基准的缩放（用于像素空间的 SVG 线宽、字号）
  p: 0,              // 平滑后的全页进度 0..1
  target: 0,         // 滚动位置对应的目标进度
  sp: 0,             // 以“屏”为单位的位置
  total: 1,          // 全页总长（屏）
  time: 0, dt: 1 / 60,
  exportMode: false,
  ready: false,
  pointer: { x: -9999, y: -9999, nx: 0, ny: 0, inside: false, moved: -99 },
  reduce: false,
};

/** 用户交互状态：跨篇章保留，回退后仍在；videoExport.begin 时恢复默认 */
export function makeUI() {
  return {
    // 封装：拖动拆开 / 旋转，拖动光环剖切（开场、01 与结尾共用同一颗封装）
    explodeTouched: false,
    explode: new Spring(0, 60, 0.9),
    yaw: new Spring(0, 40, 0.85),
    cutTouched: false,
    cut: new Spring(1, 70, 0.95),        // 1 = 不剖，0 = 剖到最深
    // 河流：八个显存堆栈的闸门
    gatesTouched: false,
    gates: [0, 1, 2, 3, 4, 5, 6, 7].map(() => new Spring(0.08, 30, 0.95)),
    // 精度：光标擦过的地方先启用分块缩放（遮罩画布由篇章自己保存）
    maskDirty: true,
    maskTouched: false,
    // 经纬：光标拨动丝线
    pluck: new Spring(0, 40, 0.6),
    // 尺度：等轴测视角的旋转与远近
    isoTouched: false,
    isoAz: new Spring(0, 26, 0.9),       // 以 90° 为一档
    isoZoom: new Spring(1, 30, 0.9),
  };
}
export const ui = { v: makeUI() };
