/* 体素构建器：所有实体共用同一格距（1 格 = 1 世界单位） */
'use strict';

SF.VoxelBuilder = class {
  constructor(seed = 1) {
    this.map = new Map();
    this.px = []; this.py = []; this.pz = [];
    this.cr = []; this.cg = []; this.cb = [];
    this.em = []; this.ht = [];
    this.rng = SF.mulberry32(seed);
  }
  key(x, y, z) { return (x + 2048) + (y + 2048) * 4096 + (z + 2048) * 16777216; }
  has(x, y, z) { return this.map.has(this.key(x, y, z)); }
  set(x, y, z, c, e = 0, h = 0) {
    x |= 0; y |= 0; z |= 0;
    const k = this.key(x, y, z);
    const j = 0.93 + SF.hash1(k * 0.0013 + 7.7) * 0.14; // 静态颗粒色差
    const i = this.map.get(k);
    if (i !== undefined) {
      this.cr[i] = c[0] * j; this.cg[i] = c[1] * j; this.cb[i] = c[2] * j;
      this.em[i] = e; this.ht[i] = h;
      return;
    }
    this.map.set(k, this.px.length);
    this.px.push(x); this.py.push(y); this.pz.push(z);
    this.cr.push(c[0] * j); this.cg.push(c[1] * j); this.cb.push(c[2] * j);
    this.em.push(e); this.ht.push(h);
  }
  del(x, y, z) {
    const k = this.key(x | 0, y | 0, z | 0);
    const i = this.map.get(k);
    if (i === undefined) return;
    const last = this.px.length - 1;
    if (i !== last) {
      this.px[i] = this.px[last]; this.py[i] = this.py[last]; this.pz[i] = this.pz[last];
      this.cr[i] = this.cr[last]; this.cg[i] = this.cg[last]; this.cb[i] = this.cb[last];
      this.em[i] = this.em[last]; this.ht[i] = this.ht[last];
      this.map.set(this.key(this.px[i], this.py[i], this.pz[i]), i);
    }
    this.px.pop(); this.py.pop(); this.pz.pop();
    this.cr.pop(); this.cg.pop(); this.cb.pop(); this.em.pop(); this.ht.pop();
    this.map.delete(k);
  }
  box(x0, y0, z0, x1, y1, z1, c, e = 0, h = 0, shell = false) {
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (shell && x > x0 && x < x1 && y > y0 && y < y1 && z > z0 && z < z1) continue;
      this.set(x, y, z, c, e, h);
    }
  }
  carve(x0, y0, z0, x1, y1, z1) {
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.del(x, y, z);
  }
  get count() { return this.px.length; }

  build() {
    const n = this.px.length;
    const data = new Float32Array(n * 9);
    let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
    for (let i = 0; i < n; i++) {
      const x = this.px[i], y = this.py[i], z = this.pz[i];
      let occ = 0;
      if (this.has(x + 1, y, z)) occ++;
      if (this.has(x - 1, y, z)) occ++;
      if (this.has(x, y + 1, z)) occ++;
      if (this.has(x, y - 1, z)) occ++;
      if (this.has(x, y, z + 1)) occ++;
      if (this.has(x, y, z - 1)) occ++;
      const ao = Math.max(0.32, 1 - occ * 0.115);
      const o = i * 9;
      data[o] = x + 0.5; data[o + 1] = y + 0.5; data[o + 2] = z + 0.5;
      data[o + 3] = this.cr[i]; data[o + 4] = this.cg[i]; data[o + 5] = this.cb[i];
      data[o + 6] = ao; data[o + 7] = this.em[i]; data[o + 8] = this.ht[i];
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
      if (z < mnz) mnz = z; if (z > mxz) mxz = z;
    }
    const center = [(mnx + mxx) / 2 + 0.5, (mny + mxy) / 2 + 0.5, (mnz + mxz) / 2 + 0.5];
    const radius = Math.hypot(mxx - mnx, mxy - mny, mxz - mnz) / 2 + 2;
    return { data, count: n, center, radius };
  }
};

/* ---------- GPU 体素单元 ---------- */
SF.cubeGeo = null;
SF.initCubeGeo = function (gl) {
  // 24 顶点 / 36 索引的单位立方体
  const faces = [
    [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]],
    [[-1, 0, 0], [-1, 1, 0], [-1, 1, 1], [-1, 0, 1]],
    [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
    [[0, -1, 0], [1, -1, 0], [1, -1, 1], [0, -1, 1]],
    [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
    [[0, 0, -1], [0, 1, -1], [1, 1, -1], [1, 0, -1]]
  ];
  const norms = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const verts = [], idx = [];
  faces.forEach((f, fi) => {
    const b = fi * 4;
    f.forEach(v => verts.push(v[0] - 0.5, v[1] - 0.5, v[2] - 0.5, norms[fi][0], norms[fi][1], norms[fi][2]));
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  SF.cubeGeo = { vbo, ibo };
};

SF.makeVoxelUnit = function (gl, built) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, SF.cubeGeo.vbo);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ib);
  gl.bufferData(gl.ARRAY_BUFFER, built.data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 0); gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 36, 12); gl.vertexAttribDivisor(3, 1);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 36, 24); gl.vertexAttribDivisor(4, 1);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, SF.cubeGeo.ibo);
  gl.bindVertexArray(null);
  return { vao, count: built.count, center: built.center, radius: built.radius, buf: ib };
};

SF.drawVoxelUnit = function (gl, unit) {
  gl.bindVertexArray(unit.vao);
  gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, unit.count);
};