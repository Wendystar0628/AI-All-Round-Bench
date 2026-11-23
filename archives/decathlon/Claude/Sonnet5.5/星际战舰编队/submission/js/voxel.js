'use strict';
// ---------- 材质表 ----------
// cls: 0 主壳(宽柔反光) 1 深色吸光 2 金属(锐利边缘高光) 3 发光 4 透明发光(叠加) 5 岩石 6 面板/显示
var PAL = new Array(256);
var OPQ = new Uint8Array(256);   // 不透明
var TRN = new Uint8Array(256);   // 透明发光（单独通道）
var PR = new Uint8Array(256), PG = new Uint8Array(256), PB = new Uint8Array(256), PEB = new Uint8Array(256), PCLS = new Uint8Array(256);
var EMR = new Float32Array(256), EMG = new Float32Array(256), EMB = new Float32Array(256); // 发光材质的溢出光（已乘强度）
function hex(h) { return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; }
function defMat(id, rgb, emi, cls, trans) {
  if (typeof rgb === 'number') rgb = hex(rgb);
  PAL[id] = { r: rgb[0], g: rgb[1], b: rgb[2], emi: emi || 0, cls: cls || 0, trans: !!trans };
  OPQ[id] = trans ? 0 : 1;
  TRN[id] = trans ? 1 : 0;
  PR[id] = rgb[0]; PG[id] = rgb[1]; PB[id] = rgb[2]; PCLS[id] = cls || 0;
  PEB[id] = Math.min(255, Math.round((emi || 0) / 6 * 255));
  if (cls === 3 && emi > 0.5) { EMR[id] = rgb[0] * emi * 0.12; EMG[id] = rgb[1] * emi * 0.12; EMB[id] = rgb[2] * emi * 0.12; }
}
var M = {};
(function () {
  var id = 1;
  function add(name, rgb, emi, cls, trans) { M[name] = id; defMat(id, rgb, emi, cls, trans); id++; return M[name]; }
  // 主壳：四档明度，按板块散布
  add('H0', 0x9a8f79, 0, 0); add('H1', 0x887e6c, 0, 0); add('H2', 0xaa9e86, 0, 0); add('H3', 0x726a5a, 0, 0);
  add('H4', 0xa08b68, 0, 0); // 偏暖板
  // 深层构件
  add('D0', 0x2b3442, 0, 1); add('D1', 0x1d2430, 0, 1); add('D2', 0x3a4659, 0, 1); add('D3', 0x141a24, 0, 1);
  // 金属边缘
  add('ME', 0xe9eef2, 0, 2); add('MS', 0x8d99a8, 0, 2); add('MB', 0xb59a6a, 0, 2); // 浅钢/钢灰/黄铜
  // 色带（舰队色：冷青涂装）
  add('T0', 0x3f7f86, 0, 0); add('T1', 0x2f6a72, 0, 0); add('TA', 0xc78a3a, 0, 2); // 青涂装、琥珀点缀
  // 发光
  add('GC', 0x39f0ff, 3.2, 3); add('GCs', 0x1fb6d0, 1.6, 3); add('GA', 0xffa636, 3.4, 3); add('GW', 0xf2fdff, 4.2, 3);
  add('GR', 0xff5a3c, 2.6, 3); add('GD', 0x2fb2d2, 0.8, 3); // 红橙：炮口深处
  add('GG', 0x7dffb0, 2.6, 3);
  // 透明发光（全息/光块/玻璃感）
  add('XC', 0x44e4ff, 1.6, 4, true); add('XA', 0xffb04a, 1.6, 4, true); add('XW', 0xbfeaff, 1.8, 4, true); add('XB', 0x3c86ff, 1.4, 4, true);
  // 显示面板
  add('P0', 0x1b5560, 1.1, 6); add('P1', 0x2a8aa0, 1.8, 6); add('P2', 0x8a5a24, 1.2, 6);
  // 岩石
  add('R0', 0x5d5550, 0, 5); add('R1', 0x4f4845, 0, 5); add('R2', 0x6c6258, 0, 5); add('R3', 0x3c3738, 0, 5);
  add('R4', 0x7a6d5f, 0, 5); add('R5', 0x2a282b, 0, 5); add('RS', 0x3d6870, 0, 5); // 带青色矿脉
  // 舱内专用深色调
  add('F0', 0x232c3a, 0, 1); add('F1', 0x303b4d, 0, 1); add('F2', 0x46556b, 0, 1); add('F3', 0x5a6b82, 0, 0);
  add('W0', 0x8d9aa8, 0, 0); add('W1', 0x74818f, 0, 0);
})();
M.MAXID = 255;

// ---------- 体素网格 ----------
function Grid(x0, x1, y0, y1, z0, z1) { // 局部坐标范围 [x0,x1) ...
  this.ox = x0; this.oy = y0; this.oz = z0;
  this.nx = x1 - x0; this.ny = y1 - y0; this.nz = z1 - z0;
  this.data = new Uint8Array(this.nx * this.ny * this.nz);
  this.sx = 1; this.sy = this.nx; this.sz = this.nx * this.ny;
}
Grid.prototype.idx = function (x, y, z) { return (x - this.ox) + this.nx * ((y - this.oy) + this.ny * (z - this.oz)); };
Grid.prototype.inb = function (x, y, z) {
  x -= this.ox; y -= this.oy; z -= this.oz;
  return x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz;
};
Grid.prototype.get = function (x, y, z) { return this.inb(x, y, z) ? this.data[this.idx(x, y, z)] : 0; };
Grid.prototype.set = function (x, y, z, m) { if (this.inb(x, y, z)) this.data[this.idx(x, y, z)] = m; };
// 填充盒子 [x0,x1)×[y0,y1)×[z0,z1)；m=0 为挖空；onlyEmpty 时不覆盖已有体素
Grid.prototype.box = function (x0, x1, y0, y1, z0, z1, m, onlyEmpty) {
  x0 = Math.round(x0); x1 = Math.round(x1); y0 = Math.round(y0); y1 = Math.round(y1); z0 = Math.round(z0); z1 = Math.round(z1);
  if (x0 < this.ox) x0 = this.ox; if (y0 < this.oy) y0 = this.oy; if (z0 < this.oz) z0 = this.oz;
  if (x1 > this.ox + this.nx) x1 = this.ox + this.nx; if (y1 > this.oy + this.ny) y1 = this.oy + this.ny; if (z1 > this.oz + this.nz) z1 = this.oz + this.nz;
  if (x1 <= x0 || y1 <= y0 || z1 <= z0) return;
  var d = this.data, nx = this.nx, ny = this.ny;
  for (var z = z0; z < z1; z++) for (var y = y0; y < y1; y++) {
    var i = (x0 - this.ox) + nx * ((y - this.oy) + ny * (z - this.oz)), e = i + (x1 - x0);
    if (onlyEmpty) { for (; i < e; i++) if (d[i] === 0) d[i] = m; }
    else d.fill(m, i, e);
  }
};
// 关于 z=0 镜像填充（z0<z1 且 z0>=0 时，同时填充 [-z1,-z0)）
Grid.prototype.boxS = function (x0, x1, y0, y1, z0, z1, m, onlyEmpty) {
  this.box(x0, x1, y0, y1, z0, z1, m, onlyEmpty);
  this.box(x0, x1, y0, y1, -z1, -z0, m, onlyEmpty);
};
// 仅替换：把盒内 mat==from 的体素换成 to
Grid.prototype.repaint = function (x0, x1, y0, y1, z0, z1, from, to) {
  for (var z = z0; z < z1; z++) for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) {
    if (this.inb(x, y, z) && this.data[this.idx(x, y, z)] === from) this.data[this.idx(x, y, z)] = to;
  }
};
// 沿 X 轴的圆柱/圆环（中心 cy,cz，半径 r0..r1 内外径，x 区间）
Grid.prototype.cylX = function (x0, x1, cy, cz, r, m, rin) {
  var r2 = r * r, ri2 = (rin || 0) * (rin || 0);
  for (var y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (var z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
    var dy = y + 0.5 - cy, dz = z + 0.5 - cz, q = dy * dy + dz * dz;
    if (q <= r2 && q >= ri2) this.box(x0, x1, y, y + 1, z, z + 1, m);
  }
};
Grid.prototype.cylY = function (y0, y1, cx, cz, r, m, rin) {
  var r2 = r * r, ri2 = (rin || 0) * (rin || 0);
  for (var x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) for (var z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
    var dx = x + 0.5 - cx, dz = z + 0.5 - cz, q = dx * dx + dz * dz;
    if (q <= r2 && q >= ri2) this.box(x, x + 1, y0, y1, z, z + 1, m);
  }
};
Grid.prototype.cylZ = function (z0, z1, cx, cy, r, m, rin) {
  var r2 = r * r, ri2 = (rin || 0) * (rin || 0);
  for (var x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) for (var y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    var dx = x + 0.5 - cx, dy = y + 0.5 - cy, q = dx * dx + dy * dy;
    if (q <= r2 && q >= ri2) this.box(x, x + 1, y, y + 1, z0, z1, m);
  }
};
Grid.prototype.sphere = function (cx, cy, cz, r, m, onlyEmpty) {
  var r2 = r * r;
  for (var z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (var y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    var dy = y + 0.5 - cy, dz = z + 0.5 - cz, rem = r2 - dy * dy - dz * dz;
    if (rem < 0) continue;
    var hx = Math.sqrt(rem);
    this.box(Math.round(cx - hx), Math.round(cx + hx), y, y + 1, z, z + 1, m, onlyEmpty);
  }
};
// 3D 线段（带半宽）
Grid.prototype.line = function (a, b, w, m) {
  var n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2]))) + 1;
  for (var i = 0; i <= n; i++) {
    var t = i / n, x = Math.round(a[0] + (b[0] - a[0]) * t), y = Math.round(a[1] + (b[1] - a[1]) * t), z = Math.round(a[2] + (b[2] - a[2]) * t);
    this.box(x - w, x + w + 1, y - w, y + w + 1, z - w, z + w + 1, m);
  }
};
// 板块散布：把 base..base+n-1 之间的主壳按 cell 大小的板块随机换色
Grid.prototype.plates = function (from, variants, cell, seed) {
  var d = this.data, nx = this.nx, ny = this.ny, nz = this.nz, ox = this.ox, oy = this.oy, oz = this.oz, nv = variants.length;
  var fromSet = {}; if (Array.isArray(from)) from.forEach(function (f) { fromSet[f] = 1; }); else fromSet[from] = 1;
  for (var z = 0; z < nz; z++) for (var y = 0; y < ny; y++) {
    var base = nx * (y + ny * z);
    for (var x = 0; x < nx; x++) {
      var m = d[base + x];
      if (m && fromSet[m]) {
        var hx = Math.floor((x + ox) / cell), hy = Math.floor((y + oy) / (cell * 0.7)), hz = Math.floor((z + oz) / cell);
        var h = hash3(hx + seed, hy, hz);
        d[base + x] = variants[Math.floor(h * nv)];
      }
    }
  }
};
// 统计体素数
Grid.prototype.count = function () { var c = 0, d = this.data; for (var i = 0; i < d.length; i++) if (d[i]) c++; return c; };

// ---------- 网格化 ----------
// 面方向：0:+x 1:-x 2:+y 3:-y 4:+z 5:-z；u×v=n
var FACE_N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
var FACE_U = [[0, 1, 0], [0, 0, 1], [0, 0, 1], [1, 0, 0], [1, 0, 0], [0, 1, 0]];
var FACE_V = [[0, 0, 1], [0, 1, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0]];
var FACE_STRIDE = 16;

function buildCoarse(g, cs) {
  var cnx = Math.ceil(g.nx / cs), cny = Math.ceil(g.ny / cs), cnz = Math.ceil(g.nz / cs);
  var occ = new Uint8Array(cnx * cny * cnz), d = g.data, nx = g.nx, ny = g.ny, nz = g.nz;
  for (var z = 0; z < nz; z++) for (var y = 0; y < ny; y++) {
    var base = nx * (y + ny * z), cb = cnx * ((y / cs | 0) + cny * (z / cs | 0));
    for (var x = 0; x < nx; x++) if (d[base + x] && OPQ[d[base + x]]) occ[cb + (x / cs | 0)] = 1;
  }
  return { occ: occ, cnx: cnx, cny: cny, cnz: cnz, cs: cs };
}
function dilateCoarse(c) {
  var out = new Uint8Array(c.occ.length), cnx = c.cnx, cny = c.cny, cnz = c.cnz;
  for (var z = 0; z < cnz; z++) for (var y = 0; y < cny; y++) for (var x = 0; x < cnx; x++) {
    if (!c.occ[x + cnx * (y + cny * z)]) continue;
    for (var dz = -1; dz <= 1; dz++) for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var xx = x + dx, yy = y + dy, zz = z + dz;
      if (xx < 0 || yy < 0 || zz < 0 || xx >= cnx || yy >= cny || zz >= cnz) continue;
      out[xx + cnx * (yy + cny * zz)] = 1;
    }
  }
  return { occ: out, cnx: cnx, cny: cny, cnz: cnz, cs: c.cs };
}

// 太阳投影：返回在 [0,3] 的受光级别（3 全亮）
function makeShadower(g, sun, maxDist) {
  var near = dilateCoarse(buildCoarse(g, 8)), nocc = near.occ, cnx = near.cnx, cny = near.cny;
  var d = g.data, nx = g.nx, ny = g.ny, nz = g.nz;
  var jit = [[0, 0, 0]];
  // 在垂直于太阳方向的平面内取两个小偏移，形成软阴影
  var s = vnorm(sun), a = vnorm(vcross(s, Math.abs(s[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), b = vcross(s, a);
  var dirs = [s, vnorm(vadd(s, vadd(vmul(a, 0.07), vmul(b, 0.04)))), vnorm(vadd(s, vadd(vmul(a, -0.06), vmul(b, -0.07))))];
  function blocked(px, py, pz, dx, dy, dz) {
    for (var steps = 0; steps < maxDist;) {
      if (px < 0 || py < 0 || pz < 0 || px >= nx || py >= ny || pz >= nz) return false;
      var ix = px | 0, iy = py | 0, iz = pz | 0;
      if (nocc[(ix >> 3) + cnx * ((iy >> 3) + cny * (iz >> 3))] === 0) {
        px += dx * 7; py += dy * 7; pz += dz * 7; steps += 7;
      } else {
        var m = d[ix + nx * (iy + ny * iz)];
        if (m !== 0 && OPQ[m]) return true;
        px += dx; py += dy; pz += dz; steps++;
      }
    }
    return false;
  }
  return function (vx, vy, vz, f) { // vx.. 为网格索引坐标（非局部）
    var n = FACE_N[f], ox = vx + 0.5 + n[0] * 0.75, oy = vy + 0.5 + n[1] * 0.75, oz = vz + 0.5 + n[2] * 0.75;
    var lit = 0;
    for (var k = 0; k < 3; k++) {
      var dd = dirs[k];
      if (!blocked(ox, oy, oz, dd[0], dd[1], dd[2])) lit++;
    }
    return lit;
  };
}

