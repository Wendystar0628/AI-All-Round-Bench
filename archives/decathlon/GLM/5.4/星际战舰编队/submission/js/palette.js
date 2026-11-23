'use strict';
/* ------------------------------------------------------------------
   调色板 / 材质表
   索引 0 恒为空。每个条目：颜色、自发光强度(0..1.6)、材质号、alpha、标志
   ------------------------------------------------------------------ */
const PAL = [{ name: 'EMPTY', r: 0, g: 0, b: 0, e: 0, mat: 0, a: 0, flags: 0 }];
const C = {};
function defPal(name, hex, emissive, mat, alpha = 255, flags = 0) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  C[name] = PAL.length;
  PAL.push({ name, r, g, b, e: emissive, mat, a: alpha, flags });
  return C[name];
}
// flags: 1 = 透明(需混合)  2 = 加色  4 = 不受雾影响  8 = 双面
const F_TRANS = 1, F_ADD = 2, F_NOFOG = 4;

/* ---- 舰体主色：冷灰蓝钢铁 ---- */
defPal('HULL_DEEP',   '#1b2133', 0, 1);   // 1 深层暗色
defPal('HULL_DARK',   '#2c3452', 0, 0);   // 2 暗面
defPal('HULL',        '#3d4769', 0, 0);   // 3 主装甲
defPal('HULL_MID',    '#515e88', 0, 0);   // 4
defPal('HULL_LIGHT',  '#6d7ba6', 0, 0);   // 5 受光面
defPal('HULL_EDGE',   '#93a0c6', 0, 2);   // 6 亮边
defPal('TRIM_BRIGHT', '#bcc8e6', 0, 2);   // 7 高亮饰条
defPal('PLATE_WHITE', '#c3cadb', 0, 0);   // 8 稀有浅色装甲
defPal('DARK_METAL',  '#0c0e16', 0, 1);   // 9
defPal('SHADOW',      '#06070c', 0, 1);   // 10
defPal('HULL_WARM',   '#4a3c3c', 0, 0);   // 11 暖色装甲
defPal('HULL_RUST',   '#6b4632', 0, 0);   // 12
defPal('GUNMETAL',    '#39415a', 0, 1);   // 13
defPal('STEEL',       '#7d879c', 0, 1);   // 14

/* ---- 发光色：琥珀 / 金 ---- */
defPal('GLOW_AMBER',  '#ff9a3c', 1.15, 4, 255, F_NOFOG);
defPal('GLOW_GOLD',   '#ffd489', 1.0, 4, 255, F_NOFOG);
defPal('GLOW_EMBER',  '#c25a18', 0.42, 4);
defPal('GLOW_WHITE',  '#fff3dc', 1.45, 4, 255, F_NOFOG);
defPal('GLOW_ORANGE', '#ff6a22', 1.0, 4, 255, F_NOFOG);

/* ---- 发光色：冰青（护盾 / 能量 / 显示） ---- */
defPal('GLOW_CYAN',   '#74e4ff', 1.1, 4, 255, F_NOFOG);
defPal('GLOW_CYAN_D', '#2b8aa6', 0.32, 4);
defPal('GLOW_BLUE',   '#4a7bff', 0.85, 4, 255, F_NOFOG);
defPal('GLOW_TEAL',   '#3ff0c8', 0.95, 4, 255, F_NOFOG);

/* ---- 其它发光 ---- */
defPal('GLOW_RED',    '#ff4030', 1.05, 4, 255, F_NOFOG);
defPal('GLOW_MAGENTA','#ff4f9e', 0.85, 4, 255, F_NOFOG);
defPal('SCREEN_CYAN', '#0f3a48', 0.55, 4);
defPal('SCREEN_AMBER','#3a2410', 0.5, 4);
defPal('SCREEN_GREEN','#123a22', 0.45, 4);

/* ---- 岩石 ---- */
defPal('ROCK',        '#4b4339', 0, 3);
defPal('ROCK_LIGHT',  '#6d6252', 0, 3);
defPal('ROCK_DARK',   '#2b2620', 0, 3);
defPal('ROCK_WARM',   '#5c4a36', 0, 3);
defPal('ROCK_CRACK',  '#8a7a62', 0, 3);
defPal('ROCK_GLOW',   '#ff7a26', 0.75, 4, 255, F_NOFOG);
defPal('ROCK_HOT',    '#ffb060', 1.1, 4, 255, F_NOFOG);

/* ---- 舰内 ---- */
defPal('FLOOR',       '#333b55', 0, 6);
defPal('FLOOR_LIGHT', '#4d5a80', 0, 6);
defPal('FLOOR_DARK',  '#232a42', 0, 6);
defPal('WALL',        '#434d6e', 0, 6);
defPal('WALL_DARK',   '#2c3450', 0, 6);
defPal('CONSOLE',     '#262e48', 0, 7);
defPal('CABLE',       '#2a3350', 0, 1);
defPal('DECK_PLATE',  '#3d4766', 0, 6);
defPal('HANGAR_FLOOR','#2b3450', 0, 6);
defPal('HANGAR_WALL', '#3a4360', 0, 6);

/* ---- 透明 ---- */
defPal('GLASS',       '#8fe0ff', 0.08, 5, 60, F_TRANS | F_NOFOG);
defPal('GLASS_DARK',  '#2a4a5a', 0.02, 5, 90, F_TRANS);
defPal('GLASS_CYAN',  '#4fd0ff', 0.35, 5, 80, F_TRANS | F_NOFOG);
defPal('GLASS_AMBER', '#ffb060', 0.3, 5, 80, F_TRANS | F_NOFOG);
defPal('ENERGY_FIELD','#5ad8ff', 0.7, 5, 40, F_TRANS | F_NOFOG);

// 材质表：spec, shininess
const MATERIALS = [
  [0.16, 22],  // 0 涂装装甲
  [0.30, 40],  // 1 深色金属
  [0.55, 90],  // 2 亮边
  [0.03, 6],   // 3 岩石
  [0.0, 1],    // 4 发光
  [0.85, 140], // 5 玻璃
  [0.08, 14],  // 6 舱内地板
  [0.28, 48],  // 7 控制台
];

// 供 shader 采样用的两张调色板纹理数据
function buildPaletteData() {
  const n = 256;
  const a = new Uint8Array(n * 4), b = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = PAL[i];
    if (p) {
      a[i * 4] = p.r; a[i * 4 + 1] = p.g; a[i * 4 + 2] = p.b; a[i * 4 + 3] = Math.round(clamp(p.e / 1.6, 0, 1) * 255);
      b[i * 4] = p.mat; b[i * 4 + 1] = Math.round(p.a); b[i * 4 + 2] = p.flags; b[i * 4 + 3] = 0;
    }
  }
  return { a, b };
}
