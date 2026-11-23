'use strict';
// ---------- 体素陨石：生成、预裂、命中时间图 ----------
var ROCK_MATS = [M.R0, M.R1, M.R2, M.R3, M.R4, M.R1, M.R0, M.R2];

function genRock(r, seed, o) {
  o = o || {};
  var rng = new RNG(seed);
  var half = Math.ceil(r * 1.6) + 6;
  var g = new Grid(-half, half, -half, half, -half, half);
  var nl = (o.lobes || rng.int(5, 9)) + 3;
  g.sphere(0, 0, 0, r * 0.72, M.R0);
  for (var i = 0; i < nl; i++) {
    var d = vnorm([rng.range(-1, 1), rng.range(-0.7, 0.7), rng.range(-1, 1)]);
    var dist = r * rng.range(0.3, 0.8), rr = r * rng.range(0.28, 0.55);
    g.sphere(d[0] * dist, d[1] * dist * 0.8, d[2] * dist, rr, M.R0);
  }
  // 表面撞坑与咬口
  var nb = r > 12 ? rng.int(4, 8) : 1;
  for (var bq = 0; bq < nb; bq++) {
    var bd = vnorm([rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]);
    var br = r * rng.range(0.14, 0.3);
    g.sphere(bd[0] * r * 0.85, bd[1] * r * 0.85, bd[2] * r * 0.85, br, 0);
  }
  // 平整切面：形成不规则的大断面
  var nc = rng.int(3, 5);
  for (var c = 0; c < nc; c++) {
    var pn = vnorm([rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]), off = r * rng.range(0.5, 0.8);
    cutPlane(g, pn, off, half);
  }
  // 层叠断面：按层限制半径形成阶梯
  var th = Math.max(3, Math.round(r / 9)), nsl = Math.ceil(2 * half / th);
  var maxr = new Float32Array(nsl), fs = new Float32Array(nsl);
  var d0 = g.data, nx = g.nx, ny = g.ny, nz = g.nz;
  for (var s = 0; s < nsl; s++) fs[s] = 0.78 + 0.22 * rng.next();
  for (var y = 0; y < ny; y++) {
    var sl = Math.floor(y / th);
    for (var z = 0; z < nz; z++) {
      var base = nx * (y + ny * z);
      for (var x = 0; x < nx; x++) if (d0[base + x]) { var rad = Math.sqrt((x - half) * (x - half) + (z - half) * (z - half)); if (rad > maxr[sl]) maxr[sl] = rad; }
    }
  }
  for (var y2 = 0; y2 < ny; y2++) {
    var sl2 = Math.floor(y2 / th), lim = maxr[sl2] * fs[sl2];
    for (var z2 = 0; z2 < nz; z2++) {
      var b2 = nx * (y2 + ny * z2);
      for (var x2 = 0; x2 < nx; x2++) if (d0[b2 + x2]) { var rad2 = Math.sqrt((x2 - half) * (x2 - half) + (z2 - half) * (z2 - half)); if (rad2 > lim) d0[b2 + x2] = 0; }
    }
  }
  // 凹入裂隙
  var ncr = o.cracks === undefined ? rng.int(3, 5) : o.cracks;
  for (var k = 0; k < ncr; k++) {
    var cn = vnorm([rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]);
    var cc = [rng.range(-0.4, 0.4) * r, rng.range(-0.4, 0.4) * r, rng.range(-0.4, 0.4) * r];
    var cr = r * rng.range(0.4, 0.75), thick = rng.range(0.8, 1.6);
    var cd = vdot(cn, cc);
    var lo = Math.floor(-r * 1.2), hi = Math.ceil(r * 1.2);
    for (var zz = lo; zz < hi; zz++) for (var yy = lo; yy < hi; yy++) for (var xx = lo; xx < hi; xx++) {
      var pd = xx * cn[0] + yy * cn[1] + zz * cn[2] - cd;
      if (Math.abs(pd) > thick) continue;
      var ex = xx - cc[0], ey = yy - cc[1], ez = zz - cc[2];
      if (ex * ex + ey * ey + ez * ez > cr * cr) continue;
      g.set(xx, yy, zz, 0);
    }
  }
  // 空洞与贯通孔
  var nv = r > 20 ? rng.int(2, 4) : (r > 8 ? 1 : 0);
  for (var v = 0; v < nv; v++) {
    var vd = vnorm([rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]);
    var vp = vmul(vd, r * rng.range(0.4, 0.7));
    g.sphere(vp[0], vp[1], vp[2], r * rng.range(0.1, 0.2), 0);
  }
  if (r > 18 && o.tunnel !== false) {
    var ax = rng.int(0, 2), off1 = rng.range(-0.3, 0.3) * r, off2 = rng.range(-0.3, 0.3) * r, tr = Math.max(2, r * 0.1);
    for (var q = -half; q < half; q++) {
      var cx2 = ax === 0 ? q : off1, cy2 = ax === 1 ? q : (ax === 0 ? off1 : off2), cz2 = ax === 2 ? q : off2;
      if (ax === 0) { cy2 = off1; cz2 = off2; } else if (ax === 1) { cx2 = off1; cz2 = off2; } else { cx2 = off1; cy2 = off2; }
      var tl = r * 0.9;
      if (Math.abs(q) < tl) g.sphere(cx2, cy2, cz2, tr * (0.9 + 0.25 * Math.sin(q * 0.3)), 0);
    }
  }
  // 清理悬浮孤立体素
  // 着色：地层
  var rs = new RNG(seed + 77);
  var lmat = [];
  for (var li = 0; li < 64; li++) lmat.push(rs.next() < 0.1 ? M.R5 : ROCK_MATS[rs.int(0, ROCK_MATS.length - 1)]);
  var tilt = [rs.range(-0.3, 0.3), rs.range(-0.3, 0.3)];
  for (var y3 = 0; y3 < ny; y3++) {
    for (var z3 = 0; z3 < nz; z3++) {
      var b3 = nx * (y3 + ny * z3);
      for (var x3 = 0; x3 < nx; x3++) {
        if (!d0[b3 + x3]) continue;
        var yy3 = (y3 - half) + tilt[0] * (x3 - half) + tilt[1] * (z3 - half);
        var L = Math.floor(yy3 / Math.max(2, th * 0.6)) + 32;
        var mm = lmat[((L % 64) + 64) % 64];
        if (rs.next() < 0.015) mm = M.RS;
        d0[b3 + x3] = mm;
      }
    }
  }
  g.half = half;
  return g;
}
function cutPlane(g, n, off, half) {
  var nx = g.nx, ny = g.ny, nz = g.nz, d = g.data;
  for (var z = 0; z < nz; z++) for (var y = 0; y < ny; y++) {
    var base = nx * (y + ny * z);
    for (var x = 0; x < nx; x++) if (d[base + x]) {
      if ((x - half + 0.5) * n[0] + (y - half + 0.5) * n[1] + (z - half + 0.5) * n[2] > off) d[base + x] = 0;
    }
  }
}

// 预裂：返回 {pieces, rem, pieceData, count}
// spec: { r, seeds:[{p,w}], hit:{p:[x,y,z], t}, splitT, craters:[{p,dir,Rw,Rl,t0,dur}], T0, scale }
function fractureRock(g, spec, seed) {
  var rng = new RNG(seed);
  var half = g.half, nx = g.nx, ny = g.ny, nz = g.nz, d = g.data;
  var r = spec.r;
  var pieces = new Uint16Array(d.length), rem = new Uint8Array(d.length);
  // 种子：大块均匀 + 命中区附近的碎块
  var seeds = [], hp = spec.hit.p;
  var nbig = spec.nbig || 6, nsmall = spec.nsmall || 10;
  for (var i = 0; i < nbig; i++) {
    var dd = vnorm([rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]);
    var rr = r * rng.range(0.0, 0.62);
    seeds.push({ p: vmul(dd, rr), w: 1.0, big: true });
  }
  for (var j = 0; j < nsmall; j++) {
    var dj = vnorm([rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]);
    var hr = r * rng.range(0.1, 0.55);
    var p0 = vadd(hp, vmul(dj, hr));
    if (vlen(p0) > r * 0.95) p0 = vmul(vnorm(p0), r * 0.9);
    seeds.push({ p: p0, w: rng.range(1.7, 2.6), big: false });
  }
  var K = seeds.length;
  // 以 2×2×2 为一格做扭曲 Voronoi
  var cell = 2, amp = r * 0.16, freq = 0.06;
  var pid = new Uint16Array(Math.ceil(nx / cell) * Math.ceil(ny / cell) * Math.ceil(nz / cell));
  var cnx = Math.ceil(nx / cell), cny = Math.ceil(ny / cell), cnz = Math.ceil(nz / cell);
  for (var cz = 0; cz < cnz; cz++) for (var cy = 0; cy < cny; cy++) for (var cx = 0; cx < cnx; cx++) {
    var px = cx * cell - half + 1, py = cy * cell - half + 1, pz = cz * cell - half + 1;
    var wx = px + amp * (vnoise(px * freq, py * freq, pz * freq + 3.1) - 0.5) * 2, wy = py + amp * (vnoise(px * freq + 7.7, py * freq, pz * freq) - 0.5) * 2, wz = pz + amp * (vnoise(px * freq, py * freq + 5.3, pz * freq + 1.9) - 0.5) * 2;
    var best = 1e18, bi = 0;
    for (var k = 0; k < K; k++) {
      var s = seeds[k], dx = wx - s.p[0], dy = wy - s.p[1], dz = wz - s.p[2];
      var dist = (dx * dx + dy * dy + dz * dz) * s.w * s.w;
      if (dist < best) { best = dist; bi = k; }
    }
    pid[cx + cnx * (cy + cny * cz)] = bi + 1;
  }
  // 逐体素赋值 + 重心统计
  var sum = new Float64Array((K + 1) * 4);
  for (var z = 0; z < nz; z++) for (var y = 0; y < ny; y++) {
    var base = nx * (y + ny * z);
    for (var x = 0; x < nx; x++) {
      if (!d[base + x]) continue;
      var id = pid[((x / cell) | 0) + cnx * (((y / cell) | 0) + cny * ((z / cell) | 0))];
      pieces[base + x] = id;
      sum[id * 4] += x - half + 0.5; sum[id * 4 + 1] += y - half + 0.5; sum[id * 4 + 2] += z - half + 0.5; sum[id * 4 + 3] += 1;
    }
  }
  // 去掉不连通/过小的碎片：并入最近大块（以体素数过小为准）
  var data = [], idmap = new Int32Array(K + 1).fill(-1), n = 0;
  for (var q = 1; q <= K; q++) if (sum[q * 4 + 3] > 6) { idmap[q] = n++; }
  // 合并未命名片到片 0
  if (n === 0) { idmap[1] = 0; n = 1; }
  for (var z2 = 0; z2 < nz; z2++) for (var y2 = 0; y2 < ny; y2++) {
    var b2 = nx * (y2 + ny * z2);
    for (var x2 = 0; x2 < nx; x2++) {
      var p = pieces[b2 + x2]; if (!p) continue;
      var m = idmap[p];
      if (m < 0) { // 并入第一个有效片
        for (var q2 = 1; q2 <= K; q2++) if (idmap[q2] >= 0) { m = idmap[q2]; break; }
      }
      pieces[b2 + x2] = m;
    }
  }
  // 片参数
  var arr = new Float32Array(n * 16);
  var T0 = spec.T0, scale = spec.scale;
  var info = [];
  for (var q3 = 1; q3 <= K; q3++) {
    var pi = idmap[q3]; if (pi < 0) continue;
    var cnt = sum[q3 * 4 + 3];
    var c = [sum[q3 * 4] / cnt, sum[q3 * 4 + 1] / cnt, sum[q3 * 4 + 2] / cnt];
    var sd = seeds[q3 - 1];
    var outv = vsub(c, hp); var ol = vlen(outv) || 1; outv = vmul(outv, 1 / ol);
    var rnd = vnorm([rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]);
    var dir = vnorm(vadd(vmul(outv, 1.0), vmul(rnd, 0.45)));
    var big = sd.big;
    var spd = big ? rng.range(5, 12) : rng.range(26, 60);
    var dly = (ol / r) * (big ? 0.55 : 0.2) + rng.range(0, big ? 0.35 : 0.12);
    var ts = spec.splitT + dly - (big ? 0 : 0.35);
    var axis = vnorm([rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]);
    var om = (big ? rng.range(0.12, 0.35) : rng.range(0.8, 2.6)) * (rng.next() < 0.5 ? -1 : 1);
    var heat = Math.max(0, 1 - ol / (r * 1.0)) * (spec.heat === undefined ? 1.0 : spec.heat);
    var o = pi * 16;
    // 行 0: 中心+ts ，行 1: 速度+阻尼，行 2: 轴+角速度，行 3: T0,scale,heatStart,heat
    // 纹理为 n×4，RGBA32F；按行主序存放：row*n*4 + pi*4
    function put(row, a, b2_, c2, d2) { var oo = (row * n + pi) * 4; arr[oo] = a; arr[oo + 1] = b2_; arr[oo + 2] = c2; arr[oo + 3] = d2; }
    put(0, c[0], c[1], c[2], ts);
    put(1, dir[0] * spd, dir[1] * spd, dir[2] * spd, big ? 0.5 : 0.7);
    put(2, axis[0], axis[1], axis[2], om);
    put(3, T0, scale, spec.hit.t, heat);
    info.push({ pi: pi, c: c, ts: ts, big: big, cnt: cnt, vel: vmul(dir, spd) });
  }
  // 凹坑：按椭球生长编码移除时间
  var craters = spec.craters || [];
  for (var cI = 0; cI < craters.length; cI++) {
    var cr = craters[cI];
    var dirn = vnorm(cr.dir || [0, 0, 0]);
    var Rw = cr.Rw, Rl = cr.Rl;
    var lo = [Math.floor(cr.p[0] - Math.max(Rw, Rl)), Math.floor(cr.p[1] - Math.max(Rw, Rl)), Math.floor(cr.p[2] - Math.max(Rw, Rl))];
    var hi = Math.ceil(Math.max(Rw, Rl)) * 2 + 2;
    for (var zc = 0; zc < hi; zc++) for (var yc = 0; yc < hi; yc++) for (var xc = 0; xc < hi; xc++) {
      var wx2 = lo[0] + xc, wy2 = lo[1] + yc, wz2 = lo[2] + zc;
      var gi = (wx2 + half) + nx * ((wy2 + half) + ny * (wz2 + half));
      if (wx2 + half < 0 || wy2 + half < 0 || wz2 + half < 0 || wx2 + half >= nx || wy2 + half >= ny || wz2 + half >= nz) continue;
      if (!d[gi]) continue;
      var ux = wx2 + 0.5 - cr.p[0], uy = wy2 + 0.5 - cr.p[1], uz = wz2 + 0.5 - cr.p[2];
      var along = ux * dirn[0] + uy * dirn[1] + uz * dirn[2];
      var px2 = ux - along * dirn[0], py2 = uy - along * dirn[1], pz2 = uz - along * dirn[2];
      var perp = Math.sqrt(px2 * px2 + py2 * py2 + pz2 * pz2);
      var al = along > 0 ? along / Rl : -along / (Rw * 0.4);
      var jag = 0.85 + 0.3 * hash3(wx2, wy2, wz2);
      var e = Math.sqrt((perp / Rw) * (perp / Rw) + al * al) * jag;
      if (e > 1) continue;
      var tt = cr.t0 + cr.dur * e;
      var code = Math.max(1, Math.min(254, Math.round((tt - T0) / scale)));
      if (rem[gi] === 0 || code < rem[gi]) rem[gi] = code;
    }
  }
  return { pieces: pieces, rem: rem, data: arr, count: n, info: info };
}

// 把岩石网格化（普通/带分片）并上传
function rockModel(g, frac) {
  var opts = { chunk: 96 };
  if (frac) { opts.pieces = frac.pieces; opts.rem = frac.rem; }
  else opts.sun = SUN_LOCAL;
  var mesh = meshGrid(g, opts);
  var m = GLR.upload(mesh);
  if (frac) m.pieceTex = GLR.makePieceTex(frac.data, frac.count);
  m.half = g.half;
  return m;
}
