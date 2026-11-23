'use strict';
// 主网格化函数。opts: { sun, bleed, chunk(32 的倍数), pieces, rem, groups, shadowDist }
// 快速路径：位集合求暴露面；带分片的陨石走慢速逐体素路径
function meshGrid(g, opts) {
  opts = opts || {};
  var cs = opts.chunk || 64; cs = Math.max(32, cs - (cs % 32));
  var nx = g.nx, ny = g.ny, nz = g.nz, d = g.data;
  var offs = [1, -1, nx, -nx, nx * ny, -nx * ny];
  var UO = new Int32Array(6), VO = new Int32Array(6);
  for (var q = 0; q < 6; q++) { UO[q] = FACE_U[q][0] + FACE_U[q][1] * nx + FACE_U[q][2] * nx * ny; VO[q] = FACE_V[q][0] + FACE_V[q][1] * nx + FACE_V[q][2] * nx * ny; }
  var shad = opts.sun ? makeShadower(g, opts.sun, opts.shadowDist || 300) : null;
  var sunN = opts.sun ? vnorm(opts.sun) : null;
  var pieces = opts.pieces || null, rem = opts.rem || null, groups = opts.groups || null;
  var slow = !!pieces;
  // 发光溢出的近邻标记
  var bleedNear = null, bleedBx = Math.ceil(nx / 4), bleedBy = Math.ceil(ny / 4), bz4 = Math.ceil(nz / 4);
  if (opts.bleed) {
    bleedNear = new Uint8Array(bleedBx * bleedBy * bz4);
    for (var z = 0; z < nz; z++) for (var y = 0; y < ny; y++) {
      var base = nx * (y + ny * z);
      for (var x = 0; x < nx; x++) {
        var mm = d[base + x];
        if (mm !== 0 && EMR[mm] > 0) {
          var cx = x >> 2, cy = y >> 2, cz = z >> 2;
          for (var dz = -1; dz <= 1; dz++) for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
            var X = cx + dx, Y = cy + dy, Z = cz + dz;
            if (X < 0 || Y < 0 || Z < 0 || X >= bleedBx || Y >= bleedBy || Z >= bz4) continue;
            bleedNear[X + bleedBx * (Y + bleedBy * Z)] = 1;
          }
        }
      }
    }
  }
  // 位集合：不透明体素
  var wx = Math.ceil(nx / 32);
  var bits = new Uint32Array(wx * ny * nz);
  var tlist = [];
  for (var z2 = 0; z2 < nz; z2++) for (var y2 = 0; y2 < ny; y2++) {
    var rb = nx * (y2 + ny * z2), wb = wx * (y2 + ny * z2);
    for (var x2 = 0; x2 < nx; x2++) {
      var m2 = d[rb + x2];
      if (m2 === 0) continue;
      if (OPQ[m2] === 1) bits[wb + (x2 >> 5)] |= (1 << (x2 & 31));
      else tlist.push(rb + x2);
    }
  }
  var cap = 1 << 18, scratch = new ArrayBuffer(cap * FACE_STRIDE), s16 = new Uint16Array(scratch), s32 = new Uint32Array(scratch), n = 0;
  var tcap = 1 << 14, tscratch = new ArrayBuffer(tcap * FACE_STRIDE), t16 = new Uint16Array(tscratch), t32 = new Uint32Array(tscratch), tn = 0;
  var minx, miny, minz, maxx, maxy, maxz;

  function emit(x, y, z, i, m, f, fresh, rv) {
    var nv = FACE_N[f];
    var ao = 0xFF, opaque = OPQ[m] === 1;
    if (opaque) {
      var nOff = offs[f] + i, uo = UO[f], vo = VO[f];
      var oUp = OPQ[d[nOff + uo]], oUm = OPQ[d[nOff - uo]], oVp = OPQ[d[nOff + vo]], oVm = OPQ[d[nOff - vo]];
      var oPP = OPQ[d[nOff + uo + vo]], oMP = OPQ[d[nOff - uo + vo]], oPM = OPQ[d[nOff + uo - vo]], oMM = OPQ[d[nOff - uo - vo]];
      var a0 = (oUm && oVm) ? 0 : 3 - (oUm + oVm + oMM);
      var a1 = (oUp && oVm) ? 0 : 3 - (oUp + oVm + oPM);
      var a2 = (oUm && oVp) ? 0 : 3 - (oUm + oVp + oMP);
      var a3 = (oUp && oVp) ? 0 : 3 - (oUp + oVp + oPP);
      ao = a0 | (a1 << 2) | (a2 << 4) | (a3 << 6);
    }
    var sh = 3;
    if (shad && opaque) {
      var ndl = nv[0] * sunN[0] + nv[1] * sunN[1] + nv[2] * sunN[2];
      sh = ndl > 0.02 ? shad(x, y, z, f) : 0;
    }
    var gr = 0, gg = 0, gb = 0;
    if (bleedNear !== null && opaque && PCLS[m] !== 3 && bleedNear[(x >> 2) + bleedBx * ((y >> 2) + bleedBy * (z >> 2))] === 1) {
      var sr = 0, sg = 0, sb = 0, cx0 = x + nv[0], cy0 = y + nv[1], cz0 = z + nv[2];
      for (var ez = -1; ez <= 1; ez++) for (var ey = -1; ey <= 1; ey++) {
        var rb2 = (cx0 - 1) + nx * ((cy0 + ey) + ny * (cz0 + ez));
        for (var ex = 0; ex < 3; ex++) {
          var em = d[rb2 + ex];
          if (em === 0) continue;
          var er = EMR[em]; if (er === 0 && EMG[em] === 0 && EMB[em] === 0) continue;
          var dx2 = ex - 1, dd2 = dx2 * dx2 + ey * ey + ez * ez;
          var w = (1 / (1 + dd2 * 0.5)) * 1.7;
          sr += er * w; sg += EMG[em] * w; sb += EMB[em] * w;
        }
      }
      gr = sr > 255 ? 255 : sr; gg = sg > 255 ? 255 : sg; gb = sb > 255 ? 255 : sb;
    }
    var packed = f | (ao << 3) | (sh << 11) | (PCLS[m] << 13);
    var color = (PR[m] | (PG[m] << 8) | (PB[m] << 16) | (PEB[m] << 24)) >>> 0;
    var extra;
    if (pieces) extra = (pieces[i] | (fresh << 16) | ((rv > 0 ? rv : 255) << 24)) >>> 0;
    else extra = (gr | (gg << 8) | (gb << 16) | ((groups ? groups[i] : 0) << 24)) >>> 0;
    if (opaque) {
      if (n >= cap) { var nc = cap * 2, nb = new ArrayBuffer(nc * FACE_STRIDE); new Uint8Array(nb).set(new Uint8Array(scratch)); scratch = nb; s16 = new Uint16Array(nb); s32 = new Uint32Array(nb); cap = nc; }
      var o16 = n * 8, o32 = n * 4;
      s16[o16] = x; s16[o16 + 1] = y; s16[o16 + 2] = z; s16[o16 + 3] = packed; s32[o32 + 2] = color; s32[o32 + 3] = extra; n++;
    } else {
      if (tn >= tcap) { var tc = tcap * 2, tb = new ArrayBuffer(tc * FACE_STRIDE); new Uint8Array(tb).set(new Uint8Array(tscratch)); tscratch = tb; t16 = new Uint16Array(tb); t32 = new Uint32Array(tb); tcap = tc; }
      var p16 = tn * 8, p32 = tn * 4;
      t16[p16] = x; t16[p16 + 1] = y; t16[p16 + 2] = z; t16[p16 + 3] = packed; t32[p32 + 2] = color; t32[p32 + 3] = extra; tn++;
    }
    if (x < minx) minx = x; if (y < miny) miny = y; if (z < minz) minz = z;
    if (x > maxx) maxx = x; if (y > maxy) maxy = y; if (z > maxz) maxz = z;
  }

  var chunks = [], tchunks = [], parts = [], tparts = [], total = 0, ttotal = 0;
  var cnx = Math.ceil(nx / cs), cny = Math.ceil(ny / cs), cnz = Math.ceil(nz / cs);
  var tby = {};
  for (var ti = 0; ti < tlist.length; ti++) {
    var tix = tlist[ti], tx = tix % nx, tyz = (tix - tx) / nx, ty = tyz % ny, tz = (tyz - ty) / ny;
    var key = ((tx / cs | 0) + cnx * ((ty / cs | 0) + cny * (tz / cs | 0)));
    (tby[key] || (tby[key] = [])).push(tix);
  }
  for (var kz = 0; kz < cnz; kz++) for (var ky = 0; ky < cny; ky++) for (var kx = 0; kx < cnx; kx++) {
    n = 0; tn = 0; minx = miny = minz = 1e9; maxx = maxy = maxz = -1e9;
    var z0 = kz * cs, z1 = Math.min(nz, z0 + cs), y0 = ky * cs, y1 = Math.min(ny, y0 + cs), x0 = kx * cs, x1 = Math.min(nx, x0 + cs);
    if (!slow) {
      var w0 = x0 >> 5, w1 = (x1 + 31) >> 5;
      for (var zz = z0; zz < z1; zz++) for (var yy = y0; yy < y1; yy++) {
        var row = wx * (yy + ny * zz);
        for (var w = w0; w < w1; w++) {
          var S = bits[row + w];
          if (S === 0) continue;
          var nxt = (w + 1 < wx) ? bits[row + w + 1] : 0, prv = w > 0 ? bits[row + w - 1] : 0;
          var Sp = (S >>> 1) | (nxt << 31), Sm = (S << 1) | (prv >>> 31);
          var yp = yy + 1 < ny ? bits[row + wx + w] : 0, ym = yy > 0 ? bits[row - wx + w] : 0;
          var zp = zz + 1 < nz ? bits[row + wx * ny + w] : 0, zm = zz > 0 ? bits[row - wx * ny + w] : 0;
          var E0 = S & ~Sp, E1 = S & ~Sm, E2 = S & ~yp, E3 = S & ~ym, E4 = S & ~zp, E5 = S & ~zm;
          var any = E0 | E1 | E2 | E3 | E4 | E5;
          while (any !== 0) {
            var lb = any & -any, bi = 31 - Math.clz32(lb);
            any ^= lb;
            var xx = (w << 5) + bi;
            var ii = nx * (yy + ny * zz) + xx, mm2 = d[ii];
            if (E0 & lb) emit(xx, yy, zz, ii, mm2, 0, 0, 0);
            if (E1 & lb) emit(xx, yy, zz, ii, mm2, 1, 0, 0);
            if (E2 & lb) emit(xx, yy, zz, ii, mm2, 2, 0, 0);
            if (E3 & lb) emit(xx, yy, zz, ii, mm2, 3, 0, 0);
            if (E4 & lb) emit(xx, yy, zz, ii, mm2, 4, 0, 0);
            if (E5 & lb) emit(xx, yy, zz, ii, mm2, 5, 0, 0);
          }
        }
      }
    } else {
      for (var z = z0; z < z1; z++) for (var y = y0; y < y1; y++) {
        var rowBase = nx * (y + ny * z);
        for (var x = x0; x < x1; x++) {
          var i = rowBase + x, m = d[i];
          if (m === 0 || OPQ[m] === 0) continue;
          var rv = rem ? rem[i] : 0;
          for (var f = 0; f < 6; f++) {
            var nb = d[i + offs[f]], expose = (nb === 0 || OPQ[nb] === 0), fresh = 0;
            if (!expose && pieces) {
              if (pieces[i + offs[f]] !== pieces[i]) { expose = true; fresh = 255; }
              else if (rem) { var rn = rem[i + offs[f]]; if (rn > 0 && (rv === 0 || rn < rv)) { expose = true; fresh = rn; } }
            }
            if (expose) emit(x, y, z, i, m, f, fresh, rv);
          }
        }
      }
    }
    var tl = tby[kx + cnx * (ky + cny * kz)];
    if (tl) for (var tj = 0; tj < tl.length; tj++) {
      var tix2 = tl[tj], mt = d[tix2], tx2 = tix2 % nx, tyz2 = (tix2 - tx2) / nx, ty2 = tyz2 % ny, tz2 = (tyz2 - ty2) / ny;
      for (var tf = 0; tf < 6; tf++) {
        var tnb = d[tix2 + offs[tf]];
        if (tnb === 0 || (TRN[tnb] === 1 && tnb !== mt)) emit(tx2, ty2, tz2, tix2, mt, tf, 0, 0);
      }
    }
    if (n > 0) parts.push(scratch.slice(0, n * FACE_STRIDE));
    if (tn > 0) tparts.push(tscratch.slice(0, tn * FACE_STRIDE));
    if (n > 0 || tn > 0) {
      var ccx = (minx + maxx + 1) / 2 + g.ox, ccy = (miny + maxy + 1) / 2 + g.oy, ccz = (minz + maxz + 1) / 2 + g.oz;
      var rr = Math.sqrt(Math.pow(maxx - minx + 1, 2) + Math.pow(maxy - miny + 1, 2) + Math.pow(maxz - minz + 1, 2)) / 2 + 1;
      if (n > 0) { chunks.push({ start: total, count: n, c: [ccx, ccy, ccz], r: rr }); total += n; }
      if (tn > 0) { tchunks.push({ start: ttotal, count: tn, c: [ccx, ccy, ccz], r: rr }); ttotal += tn; }
    }
  }
  function cat(list, count) {
    var out = new Uint8Array(count * FACE_STRIDE), p = 0;
    for (var q2 = 0; q2 < list.length; q2++) { var u = new Uint8Array(list[q2]); out.set(u, p); p += u.length; }
    return out;
  }
  return { origin: [g.ox, g.oy, g.oz], faces: total, data: cat(parts, total), chunks: chunks, tfaces: ttotal, tdata: cat(tparts, ttotal), tchunks: tchunks, dims: [nx, ny, nz] };
}
