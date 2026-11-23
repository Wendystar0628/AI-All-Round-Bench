// voxel.js — voxel builder, face extraction, meshes
(function () {
  'use strict';
  const C = window.C;

  const FACES = [
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }
  ];

  function packColor(c, emis, jitter, rng, skin) {
    let r = c[0], g = c[1], b = c[2];
    if (jitter && rng) {
      const j = 1 + (rng() - 0.5) * jitter;
      r = C.clamp(r * j, 0, 255) | 0; g = C.clamp(g * j, 0, 255) | 0; b = C.clamp(b * j, 0, 255) | 0;
    }
    return (r & 255) | ((g & 255) << 8) | ((b & 255) << 16) | ((emis ? 1 : 0) << 24) | ((skin ? 1 : 0) << 25);
  }
  function unpack(c) { return [c & 255, (c >> 8) & 255, (c >> 16) & 255, (c >> 24) & 1]; }

  const key = (x, y, z) => (x + 32768) * 4294967296 + (y + 32768) * 65536 + (z + 32768);
  function decodeKey(k) {
    const z = k % 65536;
    const r = (k - z) / 65536;
    const y = r % 65536;
    const x = (r - y) / 65536;
    return [x - 32768, y - 32768, z - 32768];
  }

  class VoxelBuilder {
    constructor() {
      this.map = new Map();
      this.count = 0;
      this.rng = C.rng(12345);
    }
    set(x, y, z, color, emis, jitter, skin) {
      x |= 0; y |= 0; z |= 0;
      const c = Array.isArray(color) ? packColor(color, emis, jitter, this.rng, skin) : (color | 0);
      this.map.set(key(x, y, z), c);
      return this;
    }
    setc(x, y, z, c) { this.map.set(key(x | 0, y | 0, z | 0), c | 0); return this; }
    get(x, y, z) { return this.map.get(key(x | 0, y | 0, z | 0)); }
    has(x, y, z) { return this.map.has(key(x | 0, y | 0, z | 0)); }
    del(x, y, z) { this.map.delete(key(x | 0, y | 0, z | 0)); return this; }
    box(x0, y0, z0, x1, y1, z1, color, emis, jitter) {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++)
        this.set(x, y, z, color, emis, jitter);
      return this;
    }
    boxc(x0, y0, z0, x1, y1, z1, c) {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++)
        this.map.set(key(x, y, z), c);
      return this;
    }
    // hollow shell (walls of thickness t, open ends optional)
    shell(x0, y0, z0, x1, y1, z1, t, color, emis, jitter, caps) {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        const dx = Math.min(x - x0, x1 - x), dy = Math.min(y - y0, y1 - y), dz = Math.min(z - z0, z1 - z);
        const d = Math.min(dx, dy, dz);
        if (d < t || (caps && dx === 0)) this.set(x, y, z, color, emis, jitter);
      }
      return this;
    }
    plate(x0, y0, z0, x1, y1, z1, color, emis, jitter) {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++)
        this.set(x, y, z, color, emis, jitter);
      return this;
    }
    carve(x0, y0, z0, x1, y1, z1) {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++)
        this.map.delete(key(x, y, z));
      return this;
    }
    merge(other, ox, oy, oz) {
      for (const [k, c] of other.map) {
        const p = decodeKey(k);
        this.map.set(key(p[0] + ox, p[1] + oy, p[2] + oz), c);
      }
      return this;
    }
    // stripe pattern along an axis
    stripes(x0, y0, z0, x1, y1, z1, axis, period, phase, color, emis) {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        const p = axis === 0 ? x : axis === 1 ? y : z;
        if (((p + phase) % period + period) % period === 0) this.set(x, y, z, color, emis);
      }
      return this;
    }
    scatter(x0, y0, z0, x1, y1, z1, density, rng, colors, emis) {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        if (rng() < density) this.set(x, y, z, C.pick(rng, colors), emis);
      }
      return this;
    }

    extract(insideFn) {
      const map = this.map;
      const n = map.size;
      let cap = n * 3 + 64;
      let pos = new Float32Array(cap * 3);
      let face = new Uint8Array(cap);
      let col = new Uint8Array(cap * 4);
      let fi = 0;
      const AOL = [0.42, 0.62, 0.82, 1.0];
      let h = 0;
      for (const [k, c] of map) {
        const p = decodeKey(k);
        const x = p[0], y = p[1], z = p[2];
        const emis = (c >>> 24) & 1;
        const skin = (c >>> 25) & 1;
        let r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
          if (map.has(key(nx, ny, nz))) continue;
          if (skin && insideFn && insideFn(nx, ny, nz)) continue;
          if (fi >= cap) {
            cap = Math.ceil(cap * 1.8) + 64;
            const np = new Float32Array(cap * 3), nf = new Uint8Array(cap), nc = new Uint8Array(cap * 4);
            np.set(pos.subarray(0, fi * 3)); nf.set(face.subarray(0, fi)); nc.set(col.subarray(0, fi * 4));
            pos = np; face = nf; col = nc;
          }
          // AO
          let aoSum = 0;
          const su = F.u, sv = F.v;
          for (let ci = 0; ci < 4; ci++) {
            const cu = (ci === 1 || ci === 2) ? 1 : -1;
            const cv = (ci >= 2) ? 1 : -1;
            const s1 = map.has(key(nx + su[0] * cu, ny + su[1] * cu, nz + su[2] * cu)) ? 1 : 0;
            const s2 = map.has(key(nx + sv[0] * cv, ny + sv[1] * cv, nz + sv[2] * cv)) ? 1 : 0;
            const co = map.has(key(nx + su[0] * cu + sv[0] * cv, ny + su[1] * cu + sv[1] * cv, nz + su[2] * cu + sv[2] * cv)) ? 1 : 0;
            aoSum += (s1 && s2) ? 0 : (3 - (s1 + s2 + co));
          }
          const ao = aoSum / 4;
          let br = emis ? C.lerp(0.82, 1.0, ao / 3) : AOL[Math.round(ao)] || 1;
          // subtle per-face variation
          h = (x * 374761393 + y * 668265263 + z * 2147483647 + f * 971) | 0;
          h = (h ^ (h >> 13)) * 1274126177 | 0;
          const vj = 0.93 + (((h >>> 8) & 1023) / 1023) * 0.14;
          br *= vj;
          pos[fi * 3] = x; pos[fi * 3 + 1] = y; pos[fi * 3 + 2] = z;
          face[fi] = f;
          col[fi * 4] = C.clamp(r * br, 0, 255);
          col[fi * 4 + 1] = C.clamp(g * br, 0, 255);
          col[fi * 4 + 2] = C.clamp(b * br, 0, 255);
          col[fi * 4 + 3] = emis ? 255 : 0;
          fi++;
        }
      }
      return { pos: pos.subarray(0, fi * 3), face: face.subarray(0, fi), col: col.subarray(0, fi * 4), count: fi };
    }
  }

  function buildMesh(gl, data) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    // corner buffer (static)
    if (!buildMesh.cornerBuf) {
      buildMesh.cornerBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buildMesh.cornerBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buildMesh.cornerBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    // index
    if (!buildMesh.idxBuf) {
      buildMesh.idxBuf = gl.createBuffer();
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buildMesh.idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    const faceBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, faceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.face, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.UNSIGNED_BYTE, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);
    const colBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.col, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
    return { vao, count: data.count, tris: data.count * 2 };
  }

  window.VB = {
    VoxelBuilder, buildMesh, FACES, packColor, unpack, key, decodeKey
  };
})();
