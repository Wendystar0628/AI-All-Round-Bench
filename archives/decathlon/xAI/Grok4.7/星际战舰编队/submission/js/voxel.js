/* Sparse voxel volumes and greedy surface meshing. Same cell size everywhere. */
(function (root) {
  var CS = 32;
  var GLASS = 8;

  function Volume() {
    this.chunks = new Map();
    this.min = [1e9, 1e9, 1e9];
    this.max = [-1e9, -1e9, -1e9];
    this.dirty = true;
  }

  function keyOf(cx, cy, cz) {
    return (cx + 4000) + (cy + 4000) * 20001 + (cz + 4000) * 20001 * 20001;
  }

  Volume.prototype.chunk = function (cx, cy, cz, create) {
    var k = keyOf(cx, cy, cz);
    var c = this.chunks.get(k);
    if (!c && create) {
      c = { data: new Uint8Array(CS * CS * CS), cx: cx, cy: cy, cz: cz };
      this.chunks.set(k, c);
    }
    return c || null;
  };

  Volume.prototype.set = function (x, y, z, m) {
    x |= 0; y |= 0; z |= 0;
    var cx = Math.floor(x / CS), cy = Math.floor(y / CS), cz = Math.floor(z / CS);
    var c = this.chunk(cx, cy, cz, m !== 0);
    if (!c) return;
    c.data[(x - cx * CS) + ((y - cy * CS) << 5) + ((z - cz * CS) << 10)] = m;
    if (m) {
      if (x < this.min[0]) this.min[0] = x;
      if (y < this.min[1]) this.min[1] = y;
      if (z < this.min[2]) this.min[2] = z;
      if (x > this.max[0]) this.max[0] = x;
      if (y > this.max[1]) this.max[1] = y;
      if (z > this.max[2]) this.max[2] = z;
    }
  };

  Volume.prototype.forEach = function (fn) {
    this.chunks.forEach(function (ch) {
      var d = ch.data;
      var bx = ch.cx * CS, by = ch.cy * CS, bz = ch.cz * CS;
      for (var i = 0; i < d.length; i++) {
        if (!d[i]) continue;
        fn(bx + (i & 31), by + ((i >> 5) & 31), bz + (i >> 10), d[i]);
      }
    });
  };

  Volume.prototype.get = function (x, y, z) {
    x |= 0; y |= 0; z |= 0;
    var cx = Math.floor(x / CS), cy = Math.floor(y / CS), cz = Math.floor(z / CS);
    var c = this.chunk(cx, cy, cz, false);
    if (!c) return 0;
    var lx = x - cx * CS, ly = y - cy * CS, lz = z - cz * CS;
    return c.data[lx + (ly << 5) + (lz << 10)];
  };

  Volume.prototype.fillBox = function (x0, y0, z0, x1, y1, z1, m) {
    x0 |= 0; y0 |= 0; z0 |= 0; x1 |= 0; y1 |= 0; z1 |= 0;
    if (x0 > x1) { var tx = x0; x0 = x1; x1 = tx; }
    if (y0 > y1) { var ty = y0; y0 = y1; y1 = ty; }
    if (z0 > z1) { var tz = z0; z0 = z1; z1 = tz; }
    if (x0 >= x1 || y0 >= y1 || z0 >= z1) return;
    var cx0 = Math.floor(x0 / CS), cx1 = Math.floor((x1 - 1) / CS);
    var cy0 = Math.floor(y0 / CS), cy1 = Math.floor((y1 - 1) / CS);
    var cz0 = Math.floor(z0 / CS), cz1 = Math.floor((z1 - 1) / CS);
    for (var cz = cz0; cz <= cz1; cz++) {
      for (var cy = cy0; cy <= cy1; cy++) {
        for (var cx = cx0; cx <= cx1; cx++) {
          var ch = this.chunk(cx, cy, cz, m !== 0);
          if (!ch) continue;
          var xa = Math.max(x0, cx * CS), xb = Math.min(x1, cx * CS + CS);
          var ya = Math.max(y0, cy * CS), yb = Math.min(y1, cy * CS + CS);
          var za = Math.max(z0, cz * CS), zb = Math.min(z1, cz * CS + CS);
          var data = ch.data;
          var lxa = xa - cx * CS, lxb = xb - cx * CS;
          for (var z = za; z < zb; z++) {
            var lz = (z - cz * CS) << 10;
            for (var y = ya; y < yb; y++) {
              var row = lz + ((y - cy * CS) << 5);
              data.fill(m, row + lxa, row + lxb);
            }
          }
        }
      }
    }
    if (m !== 0) {
      if (x0 < this.min[0]) this.min[0] = x0;
      if (y0 < this.min[1]) this.min[1] = y0;
      if (z0 < this.min[2]) this.min[2] = z0;
      if (x1 - 1 > this.max[0]) this.max[0] = x1 - 1;
      if (y1 - 1 > this.max[1]) this.max[1] = y1 - 1;
      if (z1 - 1 > this.max[2]) this.max[2] = z1 - 1;
    }
    this.dirty = true;
  };

  Volume.prototype.carve = function (x0, y0, z0, x1, y1, z1) {
    this.fillBox(x0, y0, z0, x1, y1, z1, 0);
  };

  Volume.prototype.frame = function (x0, y0, z0, x1, y1, z1, t, m) {
    t = t || 1;
    this.fillBox(x0, y0, z0, x1, y1, z0 + t, m);
    this.fillBox(x0, y0, z1 - t, x1, y1, z1, m);
    this.fillBox(x0, y0, z0, x1, y0 + t, z1, m);
    this.fillBox(x0, y1 - t, z0, x1, y1, z1, m);
    this.fillBox(x0, y0, z0, x0 + t, y1, z1, m);
    this.fillBox(x1 - t, y0, z0, x1, y1, z1, m);
  };

  Volume.prototype.solidCount = function () {
    var n = 0;
    this.chunks.forEach(function (ch) {
      var d = ch.data;
      for (var i = 0; i < d.length; i++) if (d[i]) n++;
    });
    return n;
  };

  function growDst(dst) {
    var n = Math.max(256, dst.p.length * 2);
    var p = new Float32Array(n);
    var nm = new Float32Array(n);
    var m = new Float32Array((n / 3) | 0);
    p.set(dst.p);
    nm.set(dst.n);
    m.set(dst.m);
    dst.p = p;
    dst.n = nm;
    dst.m = m;
  }

  function pushTri(dst, ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, mat) {
    if (dst.c + 9 > dst.p.length) growDst(dst);
    var p = dst.p, nm = dst.n, mt = dst.m, o = dst.c;
    p[o] = ax; p[o + 1] = ay; p[o + 2] = az;
    p[o + 3] = bx; p[o + 4] = by; p[o + 5] = bz;
    p[o + 6] = cx; p[o + 7] = cy; p[o + 8] = cz;
    nm[o] = nx; nm[o + 1] = ny; nm[o + 2] = nz;
    nm[o + 3] = nx; nm[o + 4] = ny; nm[o + 5] = nz;
    nm[o + 6] = nx; nm[o + 7] = ny; nm[o + 8] = nz;
    var vi = (o / 3) | 0;
    mt[vi] = mat; mt[vi + 1] = mat; mt[vi + 2] = mat;
    dst.c = o + 9;
  }

  function meshChunk(vol, ch, opaque, glass) {
    var S = CS + 2;
    var grid = new Uint8Array(S * S * S);
    var data = ch.data;
    var ox = ch.cx * CS, oy = ch.cy * CS, oz = ch.cz * CS;
    for (var i = 0; i < data.length; i++) {
      var v = data[i];
      if (!v) continue;
      var lx = i & 31;
      var ly = (i >> 5) & 31;
      var lz = i >> 10;
      grid[(lx + 1) + (ly + 1) * S + (lz + 1) * S * S] = v;
    }
    function copyFace(dx, dy, dz) {
      var nb = vol.chunk(ch.cx + dx, ch.cy + dy, ch.cz + dz, false);
      if (!nb) return;
      var nd = nb.data;
      if (dx === -1) {
        for (var y = 0; y < CS; y++) for (var z = 0; z < CS; z++) {
          var val = nd[(CS - 1) + (y << 5) + (z << 10)];
          if (val) grid[0 + (y + 1) * S + (z + 1) * S * S] = val;
        }
      } else if (dx === 1) {
        for (var y2 = 0; y2 < CS; y2++) for (var z2 = 0; z2 < CS; z2++) {
          var val2 = nd[0 + (y2 << 5) + (z2 << 10)];
          if (val2) grid[(CS + 1) + (y2 + 1) * S + (z2 + 1) * S * S] = val2;
        }
      } else if (dy === -1) {
        for (var x = 0; x < CS; x++) for (var z3 = 0; z3 < CS; z3++) {
          var val3 = nd[x + ((CS - 1) << 5) + (z3 << 10)];
          if (val3) grid[(x + 1) + 0 * S + (z3 + 1) * S * S] = val3;
        }
      } else if (dy === 1) {
        for (var x2 = 0; x2 < CS; x2++) for (var z4 = 0; z4 < CS; z4++) {
          var val4 = nd[x2 + (0 << 5) + (z4 << 10)];
          if (val4) grid[(x2 + 1) + (CS + 1) * S + (z4 + 1) * S * S] = val4;
        }
      } else if (dz === -1) {
        for (var x3 = 0; x3 < CS; x3++) for (var y3 = 0; y3 < CS; y3++) {
          var val5 = nd[x3 + (y3 << 5) + ((CS - 1) << 10)];
          if (val5) grid[(x3 + 1) + (y3 + 1) * S + 0] = val5;
        }
      } else if (dz === 1) {
        for (var x4 = 0; x4 < CS; x4++) for (var y4 = 0; y4 < CS; y4++) {
          var val6 = nd[x4 + (y4 << 5)];
          if (val6) grid[(x4 + 1) + (y4 + 1) * S + (CS + 1) * S * S] = val6;
        }
      }
    }
    copyFace(-1, 0, 0); copyFace(1, 0, 0);
    copyFace(0, -1, 0); copyFace(0, 1, 0);
    copyFace(0, 0, -1); copyFace(0, 0, 1);
    /* edge neighbors so greedy ownership on chunk corners is correct */
    function copyEdge(dx, dy, dz, sx, sy, sz, ex, ey, ez) {
      var nb = vol.chunk(ch.cx + dx, ch.cy + dy, ch.cz + dz, false);
      if (!nb) return;
      var nd = nb.data;
      for (var z = sz; z <= ez; z++) for (var y = sy; y <= ey; y++) for (var x = sx; x <= ex; x++) {
        var val = nd[x + (y << 5) + (z << 10)];
        if (!val) continue;
        var gx = x + 1 + dx * CS;
        var gy = y + 1 + dy * CS;
        var gz = z + 1 + dz * CS;
        if (gx < 0 || gy < 0 || gz < 0 || gx >= S || gy >= S || gz >= S) continue;
        grid[gx + gy * S + gz * S * S] = val;
      }
    }
    /* only the single-voxel halo is required; faces copy the adjacent face.
       Corners of the halo are unused by face tests of owned cells. */

    var dims = [S, S, S];
    function sample(x, y, z) {
      if (x < 0 || y < 0 || z < 0 || x >= S || y >= S || z >= S) return 0;
      return grid[x + y * S + z * S * S];
    }

    for (var d = 0; d < 3; d++) {
      var u = (d + 1) % 3;
      var v = (d + 2) % 3;
      var x = [0, 0, 0];
      var q = [0, 0, 0];
      q[d] = 1;
      var mask = new Int16Array(dims[u] * dims[v]);
      for (x[d] = 0; x[d] < dims[d] - 1;) {
        var n = 0;
        for (x[v] = 0; x[v] < dims[v]; x[v]++) {
          for (x[u] = 0; x[u] < dims[u]; x[u]++, n++) {
            var ax0 = x[0], ay0 = x[1], az0 = x[2];
            var bx0 = ax0 + q[0], by0 = ay0 + q[1], bz0 = az0 + q[2];
            var a = sample(ax0, ay0, az0);
            var b = sample(bx0, by0, bz0);
            var ownA = ax0 >= 1 && ax0 <= CS && ay0 >= 1 && ay0 <= CS && az0 >= 1 && az0 <= CS;
            var ownB = bx0 >= 1 && bx0 <= CS && by0 >= 1 && by0 <= CS && bz0 >= 1 && bz0 <= CS;
            if (a && !b && ownA) mask[n] = a;
            else if (b && !a && ownB) mask[n] = -b;
            else mask[n] = 0;
          }
        }
        x[d]++;
        n = 0;
        for (var j = 0; j < dims[v]; j++) {
          for (var i = 0; i < dims[u];) {
            var c = mask[n];
            if (c) {
              var w = 1;
              while (i + w < dims[u] && mask[n + w] === c) w++;
              var h = 1;
              var done = false;
              while (j + h < dims[v] && !done) {
                for (var k = 0; k < w; k++) {
                  if (mask[n + k + h * dims[u]] !== c) { done = true; break; }
                }
                if (!done) h++;
              }
              var solidCoord = x[d] - 1;
              var owned = false;
              if (c > 0 && solidCoord >= 1 && solidCoord <= CS) owned = true;
              if (c < 0 && x[d] >= 1 && x[d] <= CS) owned = true;
              if (owned) {
                x[u] = i; x[v] = j;
                var du = [0, 0, 0], dv = [0, 0, 0];
                du[u] = w; dv[v] = h;
                var sign = c > 0 ? 1 : -1;
                var nx = 0, ny = 0, nz = 0;
                if (d === 0) nx = sign;
                else if (d === 1) ny = sign;
                else nz = sign;
                var p0x = ox + x[0] - 1, p0y = oy + x[1] - 1, p0z = oz + x[2] - 1;
                var p1x = p0x + du[0], p1y = p0y + du[1], p1z = p0z + du[2];
                var p2x = p1x + dv[0], p2y = p1y + dv[1], p2z = p1z + dv[2];
                var p3x = p0x + dv[0], p3y = p0y + dv[1], p3z = p0z + dv[2];
                var mat = c > 0 ? c : -c;
                var dst = mat === GLASS ? glass : opaque;
                if (sign > 0) {
                  pushTri(dst, p0x, p0y, p0z, p1x, p1y, p1z, p2x, p2y, p2z, nx, ny, nz, mat);
                  pushTri(dst, p0x, p0y, p0z, p2x, p2y, p2z, p3x, p3y, p3z, nx, ny, nz, mat);
                } else {
                  pushTri(dst, p0x, p0y, p0z, p3x, p3y, p3z, p2x, p2y, p2z, nx, ny, nz, mat);
                  pushTri(dst, p0x, p0y, p0z, p2x, p2y, p2z, p1x, p1y, p1z, nx, ny, nz, mat);
                }
              }
              for (var l = 0; l < h; l++) {
                for (var k2 = 0; k2 < w; k2++) mask[n + k2 + l * dims[u]] = 0;
              }
              i += w; n += w;
            } else {
              i++; n++;
            }
          }
        }
      }
    }
  }

  function allocDst(capVerts) {
    capVerts = Math.max(64, capVerts | 0);
    return {
      p: new Float32Array(capVerts * 3),
      n: new Float32Array(capVerts * 3),
      m: new Float32Array(capVerts),
      c: 0
    };
  }

  function finish(dst) {
    var vc = (dst.c / 3) | 0;
    return {
      positions: dst.p.subarray(0, dst.c),
      normals: dst.n.subarray(0, dst.c),
      mats: dst.m.subarray(0, vc),
      count: vc
    };
  }

  function meshVolume(vol) {
    var opaque = allocDst(8192);
    var glass = allocDst(1024);
    vol.chunks.forEach(function (ch) {
      var any = false;
      var d = ch.data;
      for (var i = 0; i < d.length; i += 16) {
        if (d[i] || d[i + 1] || d[i + 2] || d[i + 3] || d[i + 4] || d[i + 5] || d[i + 6] || d[i + 7]) { any = true; break; }
      }
      if (!any) {
        for (var j = 0; j < d.length; j++) if (d[j]) { any = true; break; }
      }
      if (any) meshChunk(vol, ch, opaque, glass);
    });
    return { opaque: finish(opaque), glass: finish(glass) };
  }

  var api = { Volume: Volume, meshVolume: meshVolume, CS: CS, GLASS: GLASS };
  root.FW = root.FW || {};
  root.FW.Volume = Volume;
  root.FW.meshVolume = meshVolume;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
