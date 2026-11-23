'use strict';
/* ------------------------------------------------------------------
   体素网格 + 面片生成（隐藏面剔除 / 顶点 AO / 静态烘焙光）
   每个面 12 字节：a0 = x|y<<12|z<<24, a1 = face|color<<3|ao<<11|flags<<19, a2 = 烘焙光 RGB
   ------------------------------------------------------------------ */
class VoxGrid {
  constructor(sx, sy, sz, ox = 0, oy = 0, oz = 0) {
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.ox = ox; this.oy = oy; this.oz = oz;
    this.d = new Uint8Array(sx * sy * sz);
    this.lights = [];   // {x,y,z,r,g,b,range} 网格坐标（已减去偏移）
    this.minX = 1e9; this.minY = 1e9; this.minZ = 1e9;
    this.maxX = -1e9; this.maxY = -1e9; this.maxZ = -1e9;
  }
  _cx(x) { return x - this.ox; }
  set(x, y, z, c) {
    x = Math.round(x) - this.ox; y = Math.round(y) - this.oy; z = Math.round(z) - this.oz;
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return;
    this.d[x + this.sx * (y + this.sy * z)] = c;
    if (x < this.minX) this.minX = x; if (y < this.minY) this.minY = y; if (z < this.minZ) this.minZ = z;
    if (x > this.maxX) this.maxX = x; if (y > this.maxY) this.maxY = y; if (z > this.maxZ) this.maxZ = z;
  }
  get(x, y, z) {
    x = Math.round(x) - this.ox; y = Math.round(y) - this.oy; z = Math.round(z) - this.oz;
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    return this.d[x + this.sx * (y + this.sy * z)];
  }
  fill(x0, y0, z0, x1, y1, z1, c) {
    x0 = Math.round(x0) - this.ox; x1 = Math.round(x1) - this.ox;
    y0 = Math.round(y0) - this.oy; y1 = Math.round(y1) - this.oy;
    z0 = Math.round(z0) - this.oz; z1 = Math.round(z1) - this.oz;
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (z0 < 0) z0 = 0;
    if (x1 >= this.sx) x1 = this.sx - 1; if (y1 >= this.sy) y1 = this.sy - 1; if (z1 >= this.sz) z1 = this.sz - 1;
    if (x1 < x0 || y1 < y0 || z1 < z0) return;
    const sx = this.sx, sxy = this.sx * this.sy, d = this.d;
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        const base = x0 + sx * y + sxy * z;
        for (let x = 0; x <= x1 - x0; x++) d[base + x] = c;
      }
    }
    if (c) {
      if (x0 < this.minX) this.minX = x0; if (y0 < this.minY) this.minY = y0; if (z0 < this.minZ) this.minZ = z0;
      if (x1 > this.maxX) this.maxX = x1; if (y1 > this.maxY) this.maxY = y1; if (z1 > this.maxZ) this.maxZ = z1;
    }
  }
  carve(x0, y0, z0, x1, y1, z1) { this.fill(x0, y0, z0, x1, y1, z1, 0); }
  // 沿 X 的环形截面：z 居中 0，y 从 yb..yt，半宽 hw，倒角 ch，壁厚 t
  ringX(x, hw, yb, yt, ch, t, c) {
    for (let y = yb; y <= yt; y++) {
      let zw = hw;
      if (y < yb + ch) zw = hw - (yb + ch - y);
      else if (y > yt - ch) zw = hw - (y - yt + ch);
      if (zw <= 0) continue;
      const inner = (y >= yb + t && y <= yt - t);
      if (!inner) { this.fill(x, y, -zw, x, y, zw, c); continue; }
      const zi = zw - t;
      if (zi > 0) { this.fill(x, y, -zw, x, y, -zi, c); this.fill(x, y, zi, x, y, zw, c); }
      else this.fill(x, y, -zw, x, y, zw, c);
    }
  }
  // 沿 Z 的环形截面（用于横向舱室）
  ringZ(z, hw, yb, yt, ch, t, c) {
    for (let y = yb; y <= yt; y++) {
      let xw = hw;
      if (y < yb + ch) xw = hw - (yb + ch - y);
      else if (y > yt - ch) xw = hw - (y - yt + ch);
      if (xw <= 0) continue;
      const inner = (y >= yb + t && y <= yt - t);
      if (!inner) { this.fill(-xw, y, z, xw, y, z, c); continue; }
      const xi = xw - t;
      if (xi > 0) { this.fill(-xw, y, z, -xi, y, z, c); this.fill(xi, y, z, xw, y, z, c); }
      else this.fill(-xw, y, z, xw, y, z, c);
    }
  }
  shellBox(x0, y0, z0, x1, y1, z1, t, c) {
    this.fill(x0, y0, z0, x1, y0 + t - 1, z1, c);
    this.fill(x0, y1 - t + 1, z0, x1, y1, z1, c);
    this.fill(x0, y0, z0, x1, y1, z0 + t - 1, c);
    this.fill(x0, y0, z1 - t + 1, x1, y1, z1, c);
    this.fill(x0, y0, z0, x0 + t - 1, y1, z1, c);
    this.fill(x1 - t + 1, y0, z0, x1, y1, z1, c);
  }
  frameBox(x0, y0, z0, x1, y1, z1, t, c) {
    this.fill(x0, y0, z0, x1, y0 + t - 1, z1, c);
    this.fill(x0, y1 - t + 1, z0, x1, y1, z1, c);
    this.fill(x0, y0, z0, x1, y1, z0 + t - 1, c);
    this.fill(x0, y0, z1 - t + 1, x1, y1, z1, c);
  }
  // 竖直环形柱（用于核心 / 喷口），轴为 Y
  ringY(y, cx, cz, r, t, c) {
    const r2 = r * r, ri = Math.max(0, r - t), ri2 = ri * ri;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const q = dx * dx + dz * dz;
      if (q <= r2 && q >= ri2) this.set(cx + dx, y, cz + dz, c);
    }
  }
  addLight(x, y, z, r, g, b, range) {
    this.lights.push({ x: x - this.ox, y: y - this.oy, z: z - this.oz, r, g, b, range });
  }
}

/* ---- 面生成 ---- */
const FACE_TABLE = [
  [1, 0, 0, 0, 1, 0, 0, 0, 1],
  [-1, 0, 0, 0, 1, 0, 0, 0, 1],
  [0, 1, 0, 1, 0, 0, 0, 0, 1],
  [0, -1, 0, 1, 0, 0, 0, 0, 1],
  [0, 0, 1, 1, 0, 0, 0, 1, 0],
  [0, 0, -1, 1, 0, 0, 0, 1, 0],
];
const CORNER_TABLE = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
];

function buildVoxGeometry(grid) {
  const sx = grid.sx, sy = grid.sy, sz = grid.sz, d = grid.d, sxy = sx * sy;
  const lights = grid.lights;
  const hasLights = lights.length > 0;
  const isTrans = new Uint8Array(256);
  for (let i = 0; i < PAL.length; i++) isTrans[i] = (PAL[i].flags & F_TRANS) ? 1 : 0;

  // ---- 第一遍：计数 ----
  let count = 0;
  for (let z = 0; z < sz; z++) {
    for (let y = 0; y < sy; y++) {
      let idx = z * sxy + y * sx;
      for (let x = 0; x < sx; x++, idx++) {
        const c = d[idx]; if (c === 0) continue;
        let e = 0;
        if (x + 1 >= sx) e++; else { const n = d[idx + 1]; if (n === 0 || isTrans[n] || (isTrans[c] && n !== c)) e++; }
        if (x - 1 < 0) e++; else { const n = d[idx - 1]; if (n === 0 || isTrans[n] || (isTrans[c] && n !== c)) e++; }
        if (y + 1 >= sy) e++; else { const n = d[idx + sx]; if (n === 0 || isTrans[n] || (isTrans[c] && n !== c)) e++; }
        if (y - 1 < 0) e++; else { const n = d[idx - sx]; if (n === 0 || isTrans[n] || (isTrans[c] && n !== c)) e++; }
        if (z + 1 >= sz) e++; else { const n = d[idx + sxy]; if (n === 0 || isTrans[n] || (isTrans[c] && n !== c)) e++; }
        if (z - 1 < 0) e++; else { const n = d[idx - sxy]; if (n === 0 || isTrans[n] || (isTrans[c] && n !== c)) e++; }
        count += e;
      }
    }
  }
  const buf = new Uint32Array(count * 3);

  // ---- 第二遍：发射 ----
  const occ = (x, y, z) => {
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return 0;
    return d[x + sx * y + sxy * z] ? 1 : 0;
  };
  let n = 0;
  const L = lights;
  for (let z = 0; z < sz; z++) {
    for (let y = 0; y < sy; y++) {
      let idx = z * sxy + y * sx;
      for (let x = 0; x < sx; x++, idx++) {
        const c = d[idx]; if (c === 0) continue;
        const trans = isTrans[c];
        const emit = (f, nx, ny, nz) => {
          const ft = FACE_TABLE[f];
          // AO
          let aoByte = 0;
          if (!trans) {
            const ct = CORNER_TABLE[f];
            for (let k = 0; k < 4; k++) {
              const cn = ct[k];
              const su = (cn[0] * ft[3] + cn[1] * ft[4] + cn[2] * ft[5]) ? 1 : -1;
              const sv = (cn[0] * ft[6] + cn[1] * ft[7] + cn[2] * ft[8]) ? 1 : -1;
              const bx = x + ft[0], by = y + ft[1], bz = z + ft[2];
              const s1 = occ(bx + su * ft[3], by + su * ft[4], bz + su * ft[5]);
              const s2 = occ(bx + sv * ft[6], by + sv * ft[7], bz + sv * ft[8]);
              const cc = occ(bx + su * ft[3] + sv * ft[6], by + su * ft[4] + sv * ft[7], bz + su * ft[5] + sv * ft[8]);
              const ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + cc);
              aoByte |= ao << (k * 2);
            }
          } else aoByte = 0xFF;
          // 烘焙光
          let lr = 0, lg = 0, lb = 0;
          if (hasLights) {
            const px = x + 0.5 + ft[0] * 0.5, py = y + 0.5 + ft[1] * 0.5, pz = z + 0.5 + ft[2] * 0.5;
            for (let li = 0; li < L.length; li++) {
              const lt = L[li];
              const dx = px - lt.x, dy = py - lt.y, dz = pz - lt.z;
              const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
              let att = 1 - dd / lt.range; if (att <= 0) continue;
              att *= att;
              lr += lt.r * att; lg += lt.g * att; lb += lt.b * att;
            }
          }
          const o = n * 3;
          buf[o] = x | (y << 16);
          buf[o + 1] = z | (f << 16) | (c << 19) | ((trans ? 1 : 0) << 27);
          buf[o + 2] = aoByte | ((Math.min(255, lr * 48) | 0) << 8) | ((Math.min(255, lg * 48) | 0) << 16) | ((Math.min(255, lb * 48) | 0) << 24);
          n++;
        };
        if (x + 1 >= sx) emit(0); else { const nb = d[idx + 1]; if (nb === 0 || isTrans[nb] || (trans && nb !== c)) emit(0); }
        if (x - 1 < 0) emit(1); else { const nb = d[idx - 1]; if (nb === 0 || isTrans[nb] || (trans && nb !== c)) emit(1); }
        if (y + 1 >= sy) emit(2); else { const nb = d[idx + sx]; if (nb === 0 || isTrans[nb] || (trans && nb !== c)) emit(2); }
        if (y - 1 < 0) emit(3); else { const nb = d[idx - sx]; if (nb === 0 || isTrans[nb] || (trans && nb !== c)) emit(3); }
        if (z + 1 >= sz) emit(4); else { const nb = d[idx + sxy]; if (nb === 0 || isTrans[nb] || (trans && nb !== c)) emit(4); }
        if (z - 1 < 0) emit(5); else { const nb = d[idx - sxy]; if (nb === 0 || isTrans[nb] || (trans && nb !== c)) emit(5); }
      }
    }
  }
  if (n !== count) console.warn('[vox] face count mismatch', n, count);
  return { data: buf, count: n };
}

function createVoxMesh(gl, geo) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, geo.data.subarray(0, geo.count * 3), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribIPointer(0, 1, gl.UNSIGNED_INT, 12, 0); gl.vertexAttribDivisor(0, 1);
  gl.enableVertexAttribArray(1); gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_INT, 12, 4); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribIPointer(2, 1, gl.UNSIGNED_INT, 12, 8); gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);
  return { vao, vbo, count: geo.count };
}

class VoxModel {
  constructor(grid, name) {
    this.grid = grid; this.name = name || '';
    this.mesh = null; this.center = [0, 0, 0];
    if (grid.maxX >= 0) {
      this.center = [
        (grid.minX + grid.maxX) / 2 + grid.ox,
        (grid.minY + grid.maxY) / 2 + grid.oy,
        (grid.minZ + grid.maxZ) / 2 + grid.oz,
      ];
    }
  }
  build(gl) {
    const t0 = performance.now();
    const geo = buildVoxGeometry(this.grid);
    this.mesh = createVoxMesh(gl, geo);
    this.faceCount = geo.count;
    console.log('[vox]', this.name, 'faces=', geo.count, 'build=', (performance.now() - t0).toFixed(0) + 'ms');
    return this;
  }
}
