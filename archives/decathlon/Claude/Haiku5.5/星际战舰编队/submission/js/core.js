// 基础库：向量与矩阵、噪声与随机、稀疏体素存储、带环境遮蔽的贪心网格化。
// 约定：世界单位 = 1 格（体素边长）。所有模型以 +X 为舰首方向，+Y 为上，+Z 为舷侧。

var MATH = (function () {
  var V = {
    add: function (a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
    sub: function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
    mul: function (a, s) { return [a[0] * s, a[1] * s, a[2] * s]; },
    dot: function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    cross: function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; },
    len: function (a) { return Math.hypot(a[0], a[1], a[2]); },
    norm: function (a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: function (a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; },
    madd: function (a, b, s) { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }
  };
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }
  // 绕任意单位轴的旋转矩阵（行优先 3x3，数组形式）
  function rotAxis(axis, ang) {
    var c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    var x = axis[0], y = axis[1], z = axis[2];
    return [
      t * x * x + c, t * x * y - s * z, t * x * z + s * y,
      t * x * y + s * z, t * y * y + c, t * y * z - s * x,
      t * x * z - s * y, t * y * z + s * x, t * z * z + c
    ];
  }
  function mat3Mul(a, b) {
    var r = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
    return r;
  }
  // 由前向与上方向构造旋转：局部 X→fwd，局部 Y→up 近似，局部 Z 为舷侧
  function basis(fwd, up) {
    var f = V.norm(fwd);
    var z = V.norm(V.cross(f, up));
    var y = V.cross(z, f);
    // 列向量形式：局部 X,Y,Z 在世界中的方向
    return { x: f, y: y, z: z };
  }
  // 将局部基（三列）与缩放组合为列主序 4x4，平移为相对相机的位置
  function modelMatrix(pos, bx, by, bz, scale, camPos) {
    var s = scale || 1;
    var m = new Float32Array(16);
    m[0] = bx[0] * s; m[1] = bx[1] * s; m[2] = bx[2] * s; m[3] = 0;
    m[4] = by[0] * s; m[5] = by[1] * s; m[6] = by[2] * s; m[7] = 0;
    m[8] = bz[0] * s; m[9] = bz[1] * s; m[10] = bz[2] * s; m[11] = 0;
    m[12] = pos[0] - camPos[0]; m[13] = pos[1] - camPos[1]; m[14] = pos[2] - camPos[2]; m[15] = 1;
    return m;
  }
  function identityBasis() { return { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }; }
  // 把轴角旋转应用于基：返回新的基
  function rotateBasis(b, axis, ang) {
    var R = rotAxis(axis, ang);
    function ap(v) { return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]]; }
    return { x: ap(b.x), y: ap(b.y), z: ap(b.z) };
  }
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }
  // 视图矩阵（只含旋转，位置已在相对坐标中处理）
  function viewRot(fwd, up) {
    var f = V.norm(fwd);
    var r = V.norm(V.cross(f, up));
    var u = V.cross(r, f);
    // 行为 r,u,-f 的矩阵，列主序
    return new Float32Array([
      r[0], u[0], -f[0], 0,
      r[1], u[1], -f[1], 0,
      r[2], u[2], -f[2], 0,
      0, 0, 0, 1
    ]);
  }
  return { V: V, clamp: clamp, smooth: smooth, mix: mix, rotAxis: rotAxis, mat3Mul: mat3Mul,
    basis: basis, modelMatrix: modelMatrix, identityBasis: identityBasis, rotateBasis: rotateBasis,
    perspective: perspective, viewRot: viewRot };
})();

// ---------- 随机与噪声 ----------
var RND = (function () {
  function hash1(n) {
    var h = Math.imul(n | 0, 0x27d4eb2d);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function hash3(x, y, z, s) {
    var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1442695041) + Math.imul(s | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    h = Math.imul(h, 2654435761);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  // 三维值噪声，返回 [0,1)
  function noise3(x, y, z, s) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var xf = x - xi, yf = y - yi, zf = z - zi;
    var ux = xf * xf * (3 - 2 * xf), uy = yf * yf * (3 - 2 * yf), uz = zf * zf * (3 - 2 * zf);
    var c000 = hash3(xi, yi, zi, s), c100 = hash3(xi + 1, yi, zi, s);
    var c010 = hash3(xi, yi + 1, zi, s), c110 = hash3(xi + 1, yi + 1, zi, s);
    var c001 = hash3(xi, yi, zi + 1, s), c101 = hash3(xi + 1, yi, zi + 1, s);
    var c011 = hash3(xi, yi + 1, zi + 1, s), c111 = hash3(xi + 1, yi + 1, zi + 1, s);
    var a = c000 + (c100 - c000) * ux, b = c010 + (c110 - c010) * ux;
    var c = c001 + (c101 - c001) * ux, d = c011 + (c111 - c011) * ux;
    var e = a + (b - a) * uy, f = c + (d - c) * uy;
    return e + (f - e) * uz;
  }
  function fbm3(x, y, z, oct, s) {
    var sum = 0, amp = 0.5, fr = 1, norm = 0;
    for (var i = 0; i < oct; i++) {
      sum += amp * noise3(x * fr, y * fr, z * fr, s + i * 17);
      norm += amp; amp *= 0.5; fr *= 2.03;
    }
    return sum / norm;
  }
  // 可复现的伪随机序列
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  return { hash1: hash1, hash3: hash3, noise3: noise3, fbm3: fbm3, rng: rng };
})();

// ---------- 颜色与材质编码 ----------
// 体素值：0 表示空；否则高 8 位为 材质ID+1，低 24 位为 RGB
var MAT = { HULL: 0, RECESS: 1, TRIM: 2, EMIT: 3, GLASS: 4, CANNON: 5, NOZZLE: 6, SCREEN: 7, FLOW: 8 };

function hexRGB(hex) {
  var h = hex.replace('#', '');
  return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
}
function packVal(mat, hex) {
  var c = typeof hex === 'string' ? hexRGB(hex) : hex;
  return ((((mat + 1) << 24) | (c[0] << 16) | (c[1] << 8) | c[2]) >>> 0);
}
function valMat(v) { return (v >>> 24) - 1; }

// ---------- 稀疏体素存储（32^3 分块） ----------
var VOX = (function () {
  var KB = 512, OFF = 128;
  function ckey(cx, cy, cz) { return ((cx + OFF) * KB + (cy + OFF)) * KB + (cz + OFF); }

  function Vox() {
    this.ch = new Map();
    this._lk = -1;
    this._ld = null;
    this.bmin = [1e9, 1e9, 1e9];
    this.bmax = [-1e9, -1e9, -1e9];
  }
  // 单项缓存：绝大多数访问落在同一分块内，避免反复查表
  Vox.prototype.chunk = function (cx, cy, cz, create) {
    var k = ckey(cx, cy, cz);
    if (k === this._lk) return this._ld;
    var c = this.ch.get(k);
    if (!c && create) {
      c = { cx: cx, cy: cy, cz: cz, d: new Uint32Array(32768) };
      this.ch.set(k, c);
    }
    if (!c) return null;
    this._lk = k; this._ld = c.d;
    return c.d;
  };
  Vox.prototype.get = function (x, y, z) {
    var cx = x >> 5, cy = y >> 5, cz = z >> 5;
    var k = ckey(cx, cy, cz);
    var d;
    if (k === this._lk) d = this._ld;
    else {
      var c = this.ch.get(k);
      if (!c) return 0;
      this._lk = k; this._ld = c.d; d = c.d;
    }
    return d[(x & 31) | ((y & 31) << 5) | ((z & 31) << 10)];
  };
  Vox.prototype.set = function (x, y, z, v) {
    var d = this.chunk(x >> 5, y >> 5, z >> 5, true);
    d[(x & 31) | ((y & 31) << 5) | ((z & 31) << 10)] = v;
    this._grow(x, y, z);
  };
  Vox.prototype._grow = function (x, y, z) {
    var b0 = this.bmin, b1 = this.bmax;
    if (x < b0[0]) b0[0] = x; if (y < b0[1]) b0[1] = y; if (z < b0[2]) b0[2] = z;
    if (x > b1[0]) b1[0] = x; if (y > b1[1]) b1[1] = y; if (z > b1[2]) b1[2] = z;
  };
  // 实心长方体，半开区间 [x0,x1)；v 为数值或 (x,y,z)=>数值 的函数（返回 0 则跳过）
  Vox.prototype.fill = function (x0, y0, z0, x1, y1, z1, v) {
    var isF = typeof v === 'function';
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) return;
    for (var x = x0; x < x1; x++) {
      for (var y = y0; y < y1; y++) {
        var z = z0;
        while (z < z1) {
          var zc = z >> 5;
          var zEnd = Math.min(z1, (zc + 1) << 5);
          var d = this.chunk(x >> 5, y >> 5, zc, true);
          var base = (x & 31) | ((y & 31) << 5);
          if (isF) {
            for (; z < zEnd; z++) { var vv = v(x, y, z); if (vv) { d[base | ((z & 31) << 10)] = vv; this._grow(x, y, z); } }
          } else {
            for (; z < zEnd; z++) d[base | ((z & 31) << 10)] = v;
            z = zEnd;
          }
        }
      }
    }
    if (!isF && v) { this._grow(x0, y0, z0); this._grow(x1 - 1, y1 - 1, z1 - 1); }
  };
  // 空心长方体壳，厚度 t
  Vox.prototype.shell = function (x0, y0, z0, x1, y1, z1, t, v) {
    this.fill(x0, y0, z0, x0 + t, y1, z1, v);
    this.fill(x1 - t, y0, z0, x1, y1, z1, v);
    this.fill(x0 + t, y0, z0, x1 - t, y0 + t, z1, v);
    this.fill(x0 + t, y1 - t, z0, x1 - t, y1, z1, v);
    this.fill(x0 + t, y0 + t, z0, x1 - t, y1 - t, z0 + t, v);
    this.fill(x0 + t, y0 + t, z1 - t, x1 - t, y1 - t, z1, v);
  };
  // 在包围盒内逐格计算：fn(x,y,z) 返回体素值或 0
  Vox.prototype.paint = function (x0, y0, z0, x1, y1, z1, fn) {
    for (var x = x0; x < x1; x++) for (var y = y0; y < y1; y++) for (var z = z0; z < z1; z++) {
      var v = fn(x, y, z);
      if (v) this.set(x, y, z, v);
    }
  };
  // 椭球（可取壳层厚度 t；t<=0 为实心）
  Vox.prototype.ellipsoid = function (cx, cy, cz, rx, ry, rz, v, t) {
    var tt = t || 0;
    this.paint(Math.floor(cx - rx) - 1, Math.floor(cy - ry) - 1, Math.floor(cz - rz) - 1,
      Math.ceil(cx + rx) + 2, Math.ceil(cy + ry) + 2, Math.ceil(cz + rz) + 2, function (x, y, z) {
        var px = (x + 0.5 - cx) / rx, py = (y + 0.5 - cy) / ry, pz = (z + 0.5 - cz) / rz;
        var d = Math.sqrt(px * px + py * py + pz * pz);
        if (d > 1) return 0;
        if (tt > 0) {
          var ix = Math.max(1e-6, (rx - tt) / rx), iy = Math.max(1e-6, (ry - tt) / ry), iz = Math.max(1e-6, (rz - tt) / rz);
          var qx = (x + 0.5 - cx) / (rx * ix), qy = (y + 0.5 - cy) / (ry * iy), qz = (z + 0.5 - cz) / (rz * iz);
          if (qx * qx + qy * qy + qz * qz < 1) return 0;
        }
        return typeof v === 'function' ? v(x, y, z) : v;
      });
  };
  // 圆柱：沿轴 axis(0=X,1=Y,2=Z)，中心 (c0,c1,c2) 为轴线上的起点中心，长度 len，半径 r
  Vox.prototype.cylinder = function (axis, c0, c1, c2, len, r, v, hollowT) {
    var lo = [c0, c1, c2];
    var ua = (axis + 1) % 3, va = (axis + 2) % 3;
    var mn = [0, 0, 0], mx = [0, 0, 0];
    mn[axis] = Math.floor(lo[axis]); mx[axis] = Math.ceil(lo[axis] + len);
    mn[ua] = Math.floor(lo[ua] - r) - 1; mx[ua] = Math.ceil(lo[ua] + r) + 1;
    mn[va] = Math.floor(lo[va] - r) - 1; mx[va] = Math.ceil(lo[va] + r) + 1;
    var self = this;
    for (var a = mn[0]; a < mx[0]; a++) for (var b = mn[1]; b < mx[1]; b++) for (var c = mn[2]; c < mx[2]; c++) {
      var p = [a, b, c];
      var t = p[axis] + 0.5 - lo[axis];
      if (t < 0 || t > len) continue;
      var du = p[ua] + 0.5 - lo[ua], dv = p[va] + 0.5 - lo[va];
      var d2 = du * du + dv * dv;
      if (d2 > r * r) continue;
      if (hollowT && d2 < (r - hollowT) * (r - hollowT)) continue;
      self.set(a, b, c, typeof v === 'function' ? v(a, b, c) : v);
    }
  };
  return { Vox: Vox };
})();

// ---------- 网格化：只输出暴露面，按平面贪心合并，带逐顶点 AO ----------
// 输出交错顶点：位置 float32x3 | 元数据 uint8x4 (法线索引, AO, 材质, 0) | 颜色 uint8x4 (rgb,255)
// 每顶点 20 字节。两组索引：不透明 与 玻璃（半透明）。
var MESHER = (function () {
  var OFFP = 2048, UVB = 8192, IDXB = 4194304;
  var CS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

  // 排序数组中第一个不小于 target 的位置
  function lowerBound(arr, target) {
    var lo = 0, hi = arr.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (arr[mid] < target) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  function buildMesh(vox, opt) {
    opt = opt || {};
    var ox = opt.ox || 0, oy = opt.oy || 0, oz = opt.oz || 0;
    var planes = new Map();
    var get = function (x, y, z) { return vox.get(x, y, z); };
    // 当前分块的基准与数据：分块内的邻格直接读数组，跨块才查表
    var cbx = 0, cby = 0, cbz = 0, cd = null;
    var occ = function (px, py, pz) {
      var ax = px - cbx, ay = py - cby, az = pz - cbz;
      if ((ax | ay | az) >= 0 && ax < 32 && ay < 32 && az < 32) return cd[ax | (ay << 5) | (az << 10)] !== 0;
      return get(px, py, pz) !== 0;
    };

    // 1) 收集暴露面：按平面分组，记录切向坐标与颜色/AO 键
    vox.ch.forEach(function (chunk) {
      var d = chunk.d;
      var bx = chunk.cx << 5, by = chunk.cy << 5, bz = chunk.cz << 5;
      cd = d; cbx = bx; cby = by; cbz = bz;
      for (var i = 0; i < 32768; i++) {
        var val = d[i];
        if (!val) continue;
        var lx = i & 31, ly = (i >> 5) & 31, lz = (i >> 10) & 31;
        var x = bx + lx, y = by + ly, z = bz + lz;
        for (var a = 0; a < 3; a++) {
          var ua = (a + 1) % 3, va = (a + 2) % 3;
          var uax = ua === 0 ? 1 : 0, uay = ua === 1 ? 1 : 0, uaz = ua === 2 ? 1 : 0;
          var vax = va === 0 ? 1 : 0, vay = va === 1 ? 1 : 0, vaz = va === 2 ? 1 : 0;
          for (var s = -1; s <= 1; s += 2) {
            var nx = x + (a === 0 ? s : 0), ny = y + (a === 1 ? s : 0), nz = z + (a === 2 ? s : 0);
            var nv;
            if (a === 0) nv = s < 0 ? (lx > 0 ? d[i - 1] : get(nx, ny, nz)) : (lx < 31 ? d[i + 1] : get(nx, ny, nz));
            else if (a === 1) nv = s < 0 ? (ly > 0 ? d[i - 32] : get(nx, ny, nz)) : (ly < 31 ? d[i + 32] : get(nx, ny, nz));
            else nv = s < 0 ? (lz > 0 ? d[i - 1024] : get(nx, ny, nz)) : (lz < 31 ? d[i + 1024] : get(nx, ny, nz));
            if (nv !== 0) continue;
            var pa = (a === 0 ? x : (a === 1 ? y : z)) + (s > 0 ? 1 : 0);
            var pid = ((a * 2 + (s > 0 ? 1 : 0)) * 8192) + (pa + OFFP);
            var aoBits = 0;
            for (var k = 0; k < 4; k++) {
              var su = CS[k][0], sv = CS[k][1];
              var s1 = occ(nx + su * uax, ny + su * uay, nz + su * uaz) ? 1 : 0;
              var s2 = occ(nx + sv * vax, ny + sv * vay, nz + sv * vaz) ? 1 : 0;
              var s3 = occ(nx + su * uax + sv * vax, ny + su * uay + sv * vay, nz + su * uaz + sv * vaz) ? 1 : 0;
              var aoK = (s1 && s2) ? 0 : 3 - (s1 + s2 + s3);
              aoBits |= aoK << (2 * k);
            }
            var P = planes.get(pid);
            if (!P) { P = { u: [], v: [], k: [] }; planes.set(pid, P); }
            P.u.push((x * uax + y * uay + z * uaz) + OFFP);
            P.v.push((x * vax + y * vay + z * vaz) + OFFP);
            P.k.push(val * 256 + aoBits);
          }
        }
      }
    });

    // 输出缓冲
    var posArr = [], metaArr = [], colArr = [];
    var idxOpaque = [], idxGlass = [];
    var vcount = 0;

    // 2) 每个平面内做二维贪心合并：按 (u,v) 排序后，用二分查找定位相邻列
    planes.forEach(function (P, pid) {
      var a = Math.floor(pid / 8192) >> 1;
      var sPos = (Math.floor(pid / 8192) & 1) === 1;
      var pa = (pid % 8192) - OFFP;
      var ua = (a + 1) % 3, va = (a + 2) % 3;
      var n = P.u.length;
      var comb = new Float64Array(n);
      for (var i = 0; i < n; i++) comb[i] = (P.u[i] * UVB + P.v[i]) * IDXB + i;
      comb.sort();
      var uvc = new Float64Array(n), sk = new Float64Array(n), used = new Uint8Array(n);
      for (var j = 0; j < n; j++) {
        var c = comb[j];
        var idx = c % IDXB;
        uvc[j] = (c - idx) / IDXB;
        sk[j] = P.k[idx];
      }
      for (var i2 = 0; i2 < n; i2++) {
        if (used[i2]) continue;
        var key = sk[i2], base = uvc[i2];
        // 沿 v 方向延伸高度
        var h = 1;
        while (i2 + h < n && !used[i2 + h] && uvc[i2 + h] === base + h && sk[i2 + h] === key) h++;
        // 沿 u 方向延伸宽度
        var w = 1;
        for (;;) {
          var target = base + w * UVB;
          var p = lowerBound(uvc, target);
          var ok = true;
          for (var r = 0; r < h; r++) {
            var q = p + r;
            if (q >= n || uvc[q] !== target + r || used[q] || sk[q] !== key) { ok = false; break; }
          }
          if (!ok) break;
          w++;
        }
        for (var cI = 0; cI < w; cI++) {
          var pc = lowerBound(uvc, base + cI * UVB);
          for (var rI = 0; rI < h; rI++) used[pc + rI] = 1;
        }
        // 输出一个四边形
        var u0 = Math.floor(base / UVB) - OFFP, v0 = (base % UVB) - OFFP;
        var val2 = Math.floor(key / 256);
        var aoBits = key % 256;
        var aoc = [aoBits & 3, (aoBits >> 2) & 3, (aoBits >> 4) & 3, (aoBits >> 6) & 3];
        var mat = (val2 >>> 24) - 1;
        var rr = (val2 >>> 16) & 255, gg = (val2 >>> 8) & 255, bb = val2 & 255;
        var nIdx = a * 2 + (sPos ? 0 : 1);
        var corners = [[u0, v0], [u0 + w, v0], [u0 + w, v0 + h], [u0, v0 + h]];
        var vi = [];
        for (var cc = 0; cc < 4; cc++) {
          var P3 = [0, 0, 0];
          P3[a] = pa; P3[ua] = corners[cc][0]; P3[va] = corners[cc][1];
          posArr.push(P3[0] + ox, P3[1] + oy, P3[2] + oz);
          metaArr.push(nIdx, aoc[cc], mat, 0);
          colArr.push(rr, gg, bb, 255);
          vi.push(vcount++);
        }
        var target2 = (mat === MAT.GLASS) ? idxGlass : idxOpaque;
        // 翻转对角线以避免 AO 不均导致的条纹
        var flip = (aoc[0] + aoc[2]) > (aoc[1] + aoc[3]);
        var b0 = vi[0], b1 = vi[1], b2 = vi[2], b3 = vi[3];
        var tris = flip ? [b0, b1, b3, b1, b2, b3] : [b0, b1, b2, b0, b2, b3];
        if (!sPos) {
          for (var t = 0; t < 6; t += 3) { var tmp = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = tmp; }
        }
        for (var q2 = 0; q2 < 6; q2++) target2.push(tris[q2]);
      }
    });

    // 打包
    var nv = vcount;
    var buf = new ArrayBuffer(nv * 20);
    var f32 = new Float32Array(buf), u8 = new Uint8Array(buf);
    for (var n2 = 0; n2 < nv; n2++) {
      f32[n2 * 5] = posArr[n2 * 3]; f32[n2 * 5 + 1] = posArr[n2 * 3 + 1]; f32[n2 * 5 + 2] = posArr[n2 * 3 + 2];
      u8[n2 * 20 + 12] = metaArr[n2 * 4]; u8[n2 * 20 + 13] = metaArr[n2 * 4 + 1];
      u8[n2 * 20 + 14] = metaArr[n2 * 4 + 2]; u8[n2 * 20 + 15] = 0;
      u8[n2 * 20 + 16] = colArr[n2 * 4]; u8[n2 * 20 + 17] = colArr[n2 * 4 + 1];
      u8[n2 * 20 + 18] = colArr[n2 * 4 + 2]; u8[n2 * 20 + 19] = 255;
    }
    var all = idxOpaque.concat(idxGlass);
    return { vertData: buf, idx: new Uint32Array(all), nOpaque: idxOpaque.length, nGlass: idxGlass.length, nVerts: nv };
  }
  return { buildMesh: buildMesh };
})();
