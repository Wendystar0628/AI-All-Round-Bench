// 晶粒版图（示意）：三维晶粒贴图、SVG 版图与“硅城”共用同一份布局数据，保证三者严丝合缝。
// 坐标：u 从晶粒外缘(0)到接缝(1)；v 从远端(0)到近端(1)。单位换算见 toXZ。
export const DIE_W = 25.6;   // mm（x 方向）
export const DIE_D = 32.8;   // mm（z 方向）
export const GAP = 0.4;      // 两颗晶粒之间的接缝
export const GPC_SM = [19, 19, 18, 18]; // 每颗晶粒 4 个 GPC，共 74 个 SM；两颗合计 148

export const REGIONS = [
  { key: 'io', u0: 0.012, u1: 0.06, v0: 0.09, v1: 0.91, label: 'NVLink / PCIe 接口' },
  { key: 'hbi', u0: 0.945, u1: 0.995, v0: 0.09, v1: 0.91, label: 'NV-HBI 晶粒互连' },
  { key: 'phy', u0: 0.09, u1: 0.46, v0: 0.012, v1: 0.062, label: 'HBM3e 接口' },
  { key: 'phy', u0: 0.54, u1: 0.91, v0: 0.012, v1: 0.062 },
  { key: 'phy', u0: 0.09, u1: 0.46, v0: 0.938, v1: 0.988 },
  { key: 'phy', u0: 0.54, u1: 0.91, v0: 0.938, v1: 0.988 },
  { key: 'l2', u0: 0.075, u1: 0.93, v0: 0.452, v1: 0.548, label: 'L2 缓存' },
  { key: 'eng', u0: 0.43, u1: 0.57, v0: 0.462, v1: 0.538, label: '调度与引擎' },
];
export const GPCS = [
  { u0: 0.075, u1: 0.495, v0: 0.082, v1: 0.438 },
  { u0: 0.51, u1: 0.93, v0: 0.082, v1: 0.438 },
  { u0: 0.075, u1: 0.495, v0: 0.562, v1: 0.918 },
  { u0: 0.51, u1: 0.93, v0: 0.562, v1: 0.918 },
];
const COLS = 4, ROWS = 5;

/** die: 0 = 左晶粒，1 = 右晶粒（镜像，使 NV-HBI 都朝向接缝） */
export function toXZ(die, u, v) {
  const x = die === 0 ? -(DIE_W + GAP / 2) + u * DIE_W : DIE_W + GAP / 2 - u * DIE_W;
  return [x, -DIE_D / 2 + v * DIE_D];
}

/** 生成全部 SM 与 GPC 前端单元的位置（u,v 归一化） */
export function buildSMs() {
  const sms = [];
  const fronts = [];
  for (let die = 0; die < 2; die++) {
    GPCS.forEach((g, gi) => {
      const n = GPC_SM[gi];
      const near = gi < 2 ? 1 : 0; // 靠近 L2 的一行（上方 GPC 的最后一行，下方 GPC 的第一行）
      const pw = (g.u1 - g.u0) / COLS, ph = (g.v1 - g.v0) / ROWS;
      const slots = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) slots.push({ r, c });
      // 让非 SM 槽位位于靠近 L2 的那一行中部
      const rowNear = near ? ROWS - 1 : 0;
      const free = 20 - n;
      const frontSlots = [{ r: rowNear, c: 1 }, { r: rowNear, c: 2 }].slice(0, free);
      for (const sl of slots) {
        const isFront = frontSlots.some((f) => f.r === sl.r && f.c === sl.c);
        const pad = 0.09;
        const cell = {
          die, gpc: gi + die * 4,
          u0: g.u0 + (sl.c + pad) * pw, u1: g.u0 + (sl.c + 1 - pad) * pw,
          v0: g.v0 + (sl.r + pad) * ph, v1: g.v0 + (sl.r + 1 - pad) * ph,
          r: sl.r, c: sl.c,
        };
        if (isFront) fronts.push(cell); else sms.push(cell);
      }
    });
  }
  sms.forEach((s, i) => {
    s.i = i;
    const a = toXZ(s.die, s.u0, s.v0), b = toXZ(s.die, s.u1, s.v1);
    s.x = (a[0] + b[0]) / 2; s.z = (a[1] + b[1]) / 2;
    s.w = Math.abs(b[0] - a[0]); s.d = Math.abs(b[1] - a[1]);
  });
  return { sms, fronts };
}
export const LAYOUT = buildSMs();
