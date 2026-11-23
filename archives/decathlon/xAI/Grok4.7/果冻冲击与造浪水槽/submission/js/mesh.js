/* global JW */
var JW = JW || {};

JW.MeshBuilder = function () {
  this.pos = [];
  this.nor = [];
  this.uv = [];
  this.idx = [];
};

JW.MeshBuilder.prototype.v = function (x, y, z, nx, ny, nz) {
  var i = this.pos.length / 3;
  this.pos.push(x, y, z);
  this.nor.push(nx, ny, nz);
  return i;
};

JW.MeshBuilder.prototype.tri = function (a, b, c) { this.idx.push(a, b, c); };

JW.MeshBuilder.prototype.quad = function (a, b, c, d) {
  this.idx.push(a, b, c, a, c, d);
};

JW.box = function (cx, cy, cz, hx, hy, hz) {
  var b = new JW.MeshBuilder();
  var faces = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
  ];
  for (var f = 0; f < 6; f++) {
    var n = faces[f];
    var ax = Math.abs(n[0]) > 0.5 ? [0, 1, 0] : [1, 0, 0];
    if (Math.abs(n[1]) > 0.5) ax = [0, 0, 1];
    var t = [n[1] * ax[2] - n[2] * ax[1], n[2] * ax[0] - n[0] * ax[2], n[0] * ax[1] - n[1] * ax[0]];
    var base = b.pos.length / 3;
    for (var s = 0; s < 4; s++) {
      var u = (s === 0 || s === 3) ? -1 : 1;
      var v = (s === 0 || s === 1) ? -1 : 1;
      var px = cx + n[0] * hx + ax[0] * u * hx + t[0] * v * hy;
      var py = cy + n[1] * hy + ax[1] * u * hy + t[1] * v * hz;
      var pz = cz + n[2] * hz + ax[2] * u * hz + t[2] * v * hx;
      // The axis mapping above is messy for non-uniform boxes. Rebuild simply below.
      void px; void py; void pz;
    }
    void base;
  };
  return JW.boxSimple(cx, cy, cz, hx, hy, hz);
};

JW.boxSimple = function (cx, cy, cz, hx, hy, hz) {
  var b = new JW.MeshBuilder();
  var p = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
  ];
  var verts = p.map(function (q) {
    return [cx + q[0] * hx, cy + q[1] * hy, cz + q[2] * hz];
  });
  var faces = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7],
    [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]
  ];
  var normals = [
    [0, 0, -1], [0, 0, 1], [-1, 0, 0],
    [1, 0, 0], [0, 1, 0], [0, -1, 0]
  ];
  for (var f = 0; f < faces.length; f++) {
    var n = normals[f];
    var base = b.pos.length / 3;
    for (var k = 0; k < 4; k++) {
      var vt = verts[faces[f][k]];
      b.v(vt[0], vt[1], vt[2], n[0], n[1], n[2]);
    }
    b.quad(base, base + 1, base + 2, base + 3);
  }
  return b;
};

JW.uvSphere = function (stacks, slices, radius) {
  var b = new JW.MeshBuilder();
  for (var i = 0; i <= stacks; i++) {
    var v = i / stacks;
    var phi = v * Math.PI;
    for (var j = 0; j <= slices; j++) {
      var u = j / slices;
      var th = u * Math.PI * 2;
      var nx = Math.sin(phi) * Math.cos(th);
      var ny = Math.cos(phi);
      var nz = Math.sin(phi) * Math.sin(th);
      b.v(nx * radius, ny * radius, nz * radius, nx, ny, nz);
    }
  }
  var row = slices + 1;
  for (var y = 0; y < stacks; y++) {
    for (var x = 0; x < slices; x++) {
      var a = y * row + x;
      b.tri(a, a + row, a + 1);
      b.tri(a + 1, a + row, a + row + 1);
    }
  }
  return b;
};

JW.cylinder = function (seg, r, h, cap) {
  var b = new JW.MeshBuilder();
  var y0 = -h * 0.5, y1 = h * 0.5;
  for (var i = 0; i <= seg; i++) {
    var a = (i / seg) * Math.PI * 2;
    var nx = Math.cos(a), nz = Math.sin(a);
    b.v(nx * r, y0, nz * r, nx, 0, nz);
    b.v(nx * r, y1, nz * r, nx, 0, nz);
  }
  for (var k = 0; k < seg; k++) {
    var i0 = k * 2;
    b.quad(i0, i0 + 1, i0 + 3, i0 + 2);
  }
  if (cap) {
    var bc = b.v(0, y0, 0, 0, -1, 0);
    var tc = b.v(0, y1, 0, 0, 1, 0);
    for (var s = 0; s < seg; s++) {
      var a0 = (s / seg) * Math.PI * 2;
      var a1 = ((s + 1) / seg) * Math.PI * 2;
      var b0 = b.v(Math.cos(a0) * r, y0, Math.sin(a0) * r, 0, -1, 0);
      var b1 = b.v(Math.cos(a1) * r, y0, Math.sin(a1) * r, 0, -1, 0);
      b.tri(bc, b1, b0);
      var t0 = b.v(Math.cos(a0) * r, y1, Math.sin(a0) * r, 0, 1, 0);
      var t1 = b.v(Math.cos(a1) * r, y1, Math.sin(a1) * r, 0, 1, 0);
      b.tri(tc, t0, t1);
    }
  }
  return b;
};

JW.terrainMesh = function (resX, resZ) {
  var c = JW.CFG;
  var b = new JW.MeshBuilder();
  var x0 = c.innerMin[0], x1 = c.innerMax[0];
  var z0 = c.innerMin[2], z1 = c.innerMax[2];
  var ids = [];
  for (var j = 0; j <= resZ; j++) {
    ids[j] = [];
    for (var i = 0; i <= resX; i++) {
      var x = x0 + (x1 - x0) * (i / resX);
      var z = z0 + (z1 - z0) * (j / resZ);
      var y = JW.terrainHeight(x, z);
      var e = 0.02;
      var hx = JW.terrainHeight(x + e, z) - JW.terrainHeight(x - e, z);
      var hz = JW.terrainHeight(x, z + e) - JW.terrainHeight(x, z - e);
      var n = JW.norm({ x: -hx, y: 2 * e, z: -hz });
      ids[j][i] = b.v(x, y, z, n.x, n.y, n.z);
    }
  }
  for (var jj = 0; jj < resZ; jj++) {
    for (var ii = 0; ii < resX; ii++) {
      b.tri(ids[jj][ii], ids[jj][ii + 1], ids[jj + 1][ii + 1]);
      b.tri(ids[jj][ii], ids[jj + 1][ii + 1], ids[jj + 1][ii]);
    }
  }
  return b;
};

JW.quadWall = function (p0, p1, p2, p3) {
  var b = new JW.MeshBuilder();
  var ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
  var vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
  var n = JW.norm({ x: uy * vz - uz * vy, y: uz * vx - ux * vz, z: ux * vy - uy * vx });
  var a = b.v(p0[0], p0[1], p0[2], n.x, n.y, n.z);
  var c = b.v(p1[0], p1[1], p1[2], n.x, n.y, n.z);
  var d = b.v(p2[0], p2[1], p2[2], n.x, n.y, n.z);
  var e = b.v(p3[0], p3[1], p3[2], n.x, n.y, n.z);
  b.quad(a, c, d, e);
  return b;
};
