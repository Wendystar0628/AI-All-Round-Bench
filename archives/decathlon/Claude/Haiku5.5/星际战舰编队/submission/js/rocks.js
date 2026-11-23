// 体素陨石：由倾斜平面切割的球形基体，加噪声起伏、裂隙与洞穴。
// 每块陨石被划分为若干"岩块"（Voronoi 分区），各自独立网格化，击碎时可整块脱离并露出真实空隙。

var ROCKS = (function () {
  var PALR = ['#B2A89C', '#9C9896', '#C2AA86', '#979DA5', '#B3A595'];
  var DARK = '#2A2623';

  function randn3(rnd) {
    var x, y, z, l;
    do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 0.05);
    l = Math.sqrt(l);
    return [x / l, y / l, z / l];
  }

  // 生成一块陨石。R：半径（格）；lumpN：岩块数量；返回 {R, lumps:[{md,c,rad,n}]}
  function make(seed, R, lumpN) {
    var rnd = RND.rng(seed * 7919 + 13);
    var planes = [];
    var np = 4 + Math.floor(rnd() * 3);
    for (var i = 0; i < np; i++) planes.push({ n: randn3(rnd), h: R * (0.78 + 0.16 * rnd()) });
    var cracks = [];
    for (i = 0; i < 2; i++) cracks.push({ n: randn3(rnd), c: (rnd() - 0.5) * R * 0.5 });
    var S = Math.ceil(R * 2.2) + 4;
    var cx = S / 2, cy = S / 2, cz = S / 2;
    var sd = seed * 31 + 5;
    var K = Math.max(1, lumpN | 0);
    var seeds = [];
    for (i = 0; i < K; i++) {
      var dv = randn3(rnd);
      var rr = R * 0.55 * Math.pow(rnd(), 0.6);
      seeds.push({ p: [dv[0] * rr, dv[1] * rr, dv[2] * rr], w: 0.8 + rnd() * 0.5 });
    }
    var lumps = [];
    for (i = 0; i < K; i++) lumps.push(new VOX.Vox());
    var sums = [];
    for (i = 0; i < K; i++) sums.push({ x: 0, y: 0, z: 0, n: 0, mx: 0 });
    var pal = [];
    for (i = 0; i < PALR.length; i++) pal.push(PALR[i]);
    var baseCol = pal.map(function (h) { return packVal(MAT.HULL, h); });
    var darkCol = packVal(MAT.RECESS, DARK);
    for (var x = 0; x < S; x++) for (var y = 0; y < S; y++) for (var z = 0; z < S; z++) {
      var px = x + 0.5 - cx, py = y + 0.5 - cy, pz = z + 0.5 - cz;
      var r = Math.sqrt(px * px + py * py + pz * pz);
      if (r > R * 1.12) continue;
      var inside = true;
      for (var k = 0; k < planes.length; k++) {
        var pl = planes[k];
        var d = px * pl.n[0] + py * pl.n[1] + pz * pl.n[2];
        if (d > pl.h) { inside = false; break; }
      }
      if (!inside) continue;
      // 表面起伏
      var nz = RND.fbm3(px / R * 2.6, py / R * 2.6, pz / R * 2.6, 3, sd);
      var surf = R * (0.98 + 0.26 * (nz - 0.5));
      if (r > surf) continue;
      if (r > R * 0.5) {
        // 洞穴
        var hv = RND.noise3(px * 0.13 + 9, py * 0.13, pz * 0.13 + 4, sd + 3);
        if (hv > 0.80 && r > R * 0.55) continue;
        // 裂隙：薄片状的切缝
        var cut = false;
        for (k = 0; k < cracks.length; k++) {
          var cr = cracks[k];
          var dc = px * cr.n[0] + py * cr.n[1] + pz * cr.n[2] - cr.c;
          if (Math.abs(dc) < 0.7 && RND.noise3(px * 0.2, py * 0.2, pz * 0.2, sd + 9) > 0.35) { cut = true; break; }
        }
        if (cut) continue;
      }
      // 岩块归属
      var best = 0, bd = 1e9;
      for (k = 0; k < K; k++) {
        var sp = seeds[k].p;
        var ex = px - sp[0], ey = py - sp[1], ez = pz - sp[2];
        var dd = (ex * ex + ey * ey + ez * ez) / seeds[k].w;
        if (dd < bd) { bd = dd; best = k; }
      }
      // 颜色：分层条带 + 少量噪声
      var band = Math.floor((py + cy) / 3.0 + RND.noise3(px * 0.2, 0, pz * 0.2, sd + 1) * 2.0);
      var ci = Math.abs(band * 37 + Math.floor(RND.hash1(band + seed) * 5)) % baseCol.length;
      var col = baseCol[ci];
      var sur = r > surf * 0.88 ? RND.hash3(x, y, z, sd) : 1;
      var val = sur > 0.97 && RND.hash3(x, y, z, sd + 2) > 0.5 ? darkCol : col;
      lumps[best].set(x, y, z, val);
      var sm = sums[best];
      sm.x += px; sm.y += py; sm.z += pz; sm.n++;
      if (r > sm.mx) sm.mx = r;
    }
    var out = [];
    for (k = 0; k < K; k++) {
      if (sums[k].n === 0) continue;
      var c = [sums[k].x / sums[k].n, sums[k].y / sums[k].n, sums[k].z / sums[k].n];
      // 网格相对：岩块的顶点位于 (x - cx)，与 c 相同坐标系
      var md = MESHER.buildMesh(lumps[k], { ox: -cx, oy: -cy, oz: -cz });
      out.push({ md: md, c: c, n: sums[k].n, rad: Math.sqrt(sums[k].n / 1.0) });
    }
    // 岩块半径（近似）：按体素数估算等效球半径
    for (k = 0; k < out.length; k++) out[k].rad = Math.cbrt(out[k].n * 3 / (4 * Math.PI));
    return { R: R, lumps: out, seed: seed };
  }
  return { make: make };
})();
