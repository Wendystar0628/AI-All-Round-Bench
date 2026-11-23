'use strict';
/* =====================================================================
   builders.js — 调色板与体素搭建工具
   形态母题：向前延伸的分叉 + 围绕空腔层叠的阶梯壳片
   ===================================================================== */

const PAL = {
  hull:      0x6d7d90,
  hullLight: 0x9aabbe,
  hullDark:  0x4c5a6c,
  hullDeep:  0x394655,
  struct:    0x2f3a46,
  structDark:0x202833,
  deep:      0x161d26,
  joint:     0x27313c,
  accent:    0x6ff0ff,
  accentDim: 0x2f93ab,
  accentDeep:0x1c5f74,
  warm:      0xffb056,
  warmHot:   0xffe6b0,
  warmDeep:  0xb56a24,
  rock:      0x7d6c58,
  rockLight: 0x9c8a70,
  rockDark:  0x4d4235,
  rockDeep:  0x332b22,
  deck:      0x3c4754,
  deckDark:  0x272f39,
  deckLight: 0x525f6e,
  glowCyan:  0x8ff6ff,
  glowAmber: 0xffc273,
  white:     0xfff6e2,
};

const FLAG_UNLIT = 1, FLAG_NOSEAM = 2, FLAG_NOJIT = 4, FLAG_NOSPEC = 8;

class Vox {
  constructor(seed) {
    this.rec = [];
    this.opaque = [];
    this.alpha = [];
    this.add = [];
    this.seed = (seed === undefined) ? 1 : seed;
    this._h = 0;
  }
  _nextSeed() { this._h = (this._h * 1103515245 + 12345) & 0x7fffffff; return (this._h % 100000) / 100000; }

  /* 基础盒：min/max 为角点（不含端点） */
  box(x0, y0, z0, x1, y1, z1, color, o) {
    o = o || {};
    if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
    if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
    if (z1 < z0) { const t = z0; z0 = z1; z1 = t; }
    const sx = Math.max(0.02, x1 - x0), sy = Math.max(0.02, y1 - y0), sz = Math.max(0.02, z1 - z0);
    this.boxc((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, sx, sy, sz, color, o);
    return this;
  }
  boxc(cx, cy, cz, sx, sy, sz, color, o) {
    o = o || {};
    const c = Array.isArray(color) ? color : hexRGB(color);
    const list = o.blend === 'add' ? this.add : (o.blend === 'alpha' ? this.alpha : this.opaque);
    const minDim = Math.min(sx, sy, sz);
    let flags = o.flags || 0;
    if (o.unlit) flags |= FLAG_UNLIT;
    if (o.noSeam || minDim < 0.85) flags |= FLAG_NOSEAM;
    if (o.noJit) flags |= FLAG_NOJIT;
    if (o.noSpec) flags |= FLAG_NOSPEC;
    const q = o.quat || [0, 0, 0, 1];
    list.push(
      cx, cy, cz, q[0], q[1], q[2], q[3], sx, sy, sz,
      c[0], c[1], c[2], (o.e || 0), flags, (o.alpha !== undefined ? o.alpha : 1),
      (o.seed !== undefined ? o.seed : this._nextSeed()), (o.spec !== undefined ? o.spec : 0.3)
    );
    return this;
  }
  /* 沿 X 的板（横向铺展） */
  plateX(x0, x1, y, z0, z1, th, color, o) { return this.box(x0, y - th / 2, z0, x1, y + th / 2, z1, color, o); }
  /* 沿 Z 的板（纵向壁） */
  plateZ(z0, z1, y, x0, x1, th, color, o) { return this.box(x0, y - th / 2, z0, x1, y + th / 2, z1, color, o); }

  /* 在给定表面撒细节块 */
  greebles(x0, x1, y, z0, z1, count, colors, rng, o) {
    o = o || {};
    const r = rng || Math.random;
    for (let i = 0; i < count; i++) {
      const x = x0 + r() * (x1 - x0);
      const z = z0 + r() * (z1 - z0);
      const w = 1 + Math.floor(r() * 3);
      const d = 1 + Math.floor(r() * 3);
      const h = 1 + Math.floor(r() * (o.maxH || 3));
      const col = colors[Math.floor(r() * colors.length)];
      this.box(x, y, z, x + w, y + h, z + d, col, o);
    }
    return this;
  }

  /* 发光条 / 窗带 */
  glowStrip(x0, x1, y0, y1, z0, z1, color, e, o) {
    o = o || {};
    o.unlit = true; o.noJit = true; o.noSpec = true;
    o.e = (e === undefined ? 1.5 : e);
    o.blend = o.blend || 'add';
    return this.box(x0, y0, z0, x1, y1, z1, color, o);
  }

  compile(gl) {
    const mk = (arr) => {
      const n = Math.floor(arr.length / 18);
      const b = new VoxelBatch(gl, Math.max(16, n));
      const fa = new Float32Array(arr);
      b.data.fill(0);
      b.data.set(fa.subarray(0, n * 18));
      b.count = n;
      b.dirty = true;
      return b;
    };
    return {
      opaque: mk(this.opaque || []),
      alpha: mk(this.alpha || []),
      add: mk(this.add || []),
      model: IDENTITY,
      counts: [Math.floor((this.opaque || []).length / 18), Math.floor((this.alpha || []).length / 18), Math.floor((this.add || []).length / 18)],
    };
  }
}

/* 把多个 Vox 合并为一个（静态拼接） */
function mergeVox(list, gl) {
  const all = new Vox(1);
  all.opaque = []; all.alpha = []; all.add = [];
  for (const v of list) {
    all.opaque = all.opaque.concat(v.opaque || []);
    all.alpha = all.alpha.concat(v.alpha || []);
    all.add = all.add.concat(v.add || []);
  }
  return all.compile(gl);
}

/* ---------- 常用构件 ---------- */

/* 阶梯壳片：沿 X 逐渐收缩/扩张的一串板，形成层叠阶梯 */
function steppedShell(v, x0, x1, steps, w0, w1, h0, h1, yc, color, o) {
  o = o || {};
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const w = lerp(w0, w1, t0), h = lerp(h0, h1, t0);
    const w2 = lerp(w0, w1, t1), h2 = lerp(h0, h1, t1);
    const ww = Math.max(w, w2) + (o.inset ? -2 : 0);
    const hh = Math.max(h, h2) + (o.inset ? -2 : 0);
    v.box(x0 + (x1 - x0) * t0, yc - hh, -ww, x0 + (x1 - x0) * t1, yc + hh, ww, color, o);
  }
  return v;
}

/* 深槽带：在两块板之间留出凹入的暗色槽 */
function groove(v, x0, x1, y, z0, z1, depth, color) {
  return v.box(x0, y - depth / 2, z0, x1, y + depth / 2, z1, color, { spec: 0.08 });
}

/* 阵列重复：沿 X 等距排列一组函数生成的构件 */
function repeatX(v, x0, x1, n, fn) {
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) fn(x0 + step * (i + 0.5), step, i);
  return v;
}

/* 发光喷口内腔：层层退让的口沿 + 深处亮核 */
function nozzle(v, x, y, z, r, len, dir, colRing, colCore) {
  // dir: +1 朝 +X，-1 朝 -X
  const s = dir;
  v.boxc(x + s * len * 0.5, y, z, len, r * 2.1, r * 2.1, colRing, { spec: 0.5 });
  v.boxc(x + s * len * 0.8, y, z, len * 0.4, r * 1.7, r * 1.7, PAL.structDark, { spec: 0.15 });
  v.boxc(x + s * len * 0.95, y, z, len * 0.18, r * 1.25, r * 1.25, colCore, { unlit: true, e: 2.4, blend: 'add', noSpec: true, noJit: true });
  return v;
}

/* 分叉前伸：两根或三根逐渐收细的臂 */
function forkArms(v, x0, y, z, spread, len, th, color, o) {
  o = o || {};
  const n = o.arms || 2;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    const zz = z + t * spread;
    const yy = y + (o.lift || 0) * Math.abs(t);
    v.box(x0, yy - th / 2, zz - th / 2, x0 + len, yy + th / 2, zz + th / 2, color, o);
    v.box(x0 + len * 0.6, yy - th * 0.36, zz - th * 0.36, x0 + len * 1.35, yy + th * 0.36, zz + th * 0.36,
      o.tipColor || color, o);
  }
  return v;
}
