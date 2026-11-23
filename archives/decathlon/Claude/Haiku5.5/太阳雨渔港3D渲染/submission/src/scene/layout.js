// 场景总布局（单位：底座边长 20，中心在原点）
// 左侧：L 形码头的纵臂（含仓库、山坡）；前景：宽阔的横臂（含候船室、台阶）；右后：港湾水域。
export const HALF = 10;          // 底座半边长
export const BOTTOM = -4;        // 底座底面
export const WATER_Y = -0.9;     // 水面高度（堤面为 0）

export const LEFT_ARM = { x0: -10, x1: -4, z0: -10, z1: 10 };
export const FRONT_ARM = { x0: -4, x1: 10, z0: 3, z1: 10 };
export const BAY = { x0: -4, x1: 10, z0: -10, z1: 3 };

// 短防波堤：从纵臂末端伸向东侧，堤端立灯塔
export const BREAK = { x0: -4, x1: 7.4, z0: -6.2, z1: -4.8, top: 0.3 };
export const LIGHTHOUSE = { x: 7.3, z: -5.5 };
// 远处更长的防波堤（靠底座远端，带淡雾）
export const FAR_BREAK = { x0: -4.5, x1: 8.5, z: -9.5 };

// 山坡：左后角
export const HILL = { x0: -10, x1: -4.6, z0: -10, z1: -6.6 };

// 渔协仓库（左臂中段，卷帘门朝东）
export const WAREHOUSE = { x0: -9.4, x1: -5.2, z0: -4.2, z1: 0.8 };
// 候船室（前景右侧，玻璃墙朝南）
export const WAITING = { x0: 3.6, x1: 8.2, z0: 5.4, z1: 9.4 };

// 台阶与上下船平台（前臂后缘）
export const STAIRS = { x0: 5.2, x1: 6.8 };
export const PAD = { x0: 4.9, x1: 7.1, z0: 0.2, z1: 1.45, top: -0.55 };

