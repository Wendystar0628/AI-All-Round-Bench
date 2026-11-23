/* 星际战舰编队 — voxel toolkit
 * Every solid in the film (hulls, weapons, craft, asteroids, interior machinery)
 * is authored on ONE shared voxel grid (1 unit = 1 cell). Solids are emitted as
 * axis-aligned quads on that lattice; the fragment shader re-reads the lattice
 * so that even large panels keep visible cell granularity.
 */
(function (global) {
  'use strict';
  const F = global.FLEET = global.FLEET || {};
  const Core = F.Core;

  /* sRGB hex -> linear rgb */
  function hexLin(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
  }

  /* ------------------------------------------------------------------
   * Material: {r,g,b} linear colour, e = emissive strength, s = specular
   * ------------------------------------------------------------------ */
  function Mat(hex, e, s) {
    const c = hexLin(hex);
    return {
      r: c[0], g: c[1], b: c[2],
      e: e || 0,
      s: s === undefined ? 0.35 : s,
    };
  }
  // build a darker/lighter variant without re-parsing hex
  function variant(base, k, eMul) {
    return {
      r: Math.min(1, base.r * k), g: Math.min(1, base.g * k), b: Math.min(1, base.b * k),
      e: base.e * (eMul === undefined ? 1 : eMul),
      s: base.s,
    };
  }

  /* ------------------------------------------------------------------
   * VoxMesh : quad accumulator
   * ------------------------------------------------------------------ */
  function VoxMesh(name) {
    this.name = name || 'mesh';
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.mat = [];   // [emissive, specular, ao]
    this.idx = [];
    this.vcount = 0;
    this.min = [1e9, 1e9, 1e9];
    this.max = [-1e9, -1e9, -1e9];
  }

  /* push one quad, p0..p3 in CCW order seen from the front */
  VoxMesh.prototype.quad = function (p0, p1, p2, p3, m, opts) {
    const o = opts || {};
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2 = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1];
    let ny = e1[2] * e2[0] - e1[0] * e2[2];
    let nz = e1[0] * e2[1] - e1[1] * e2[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const ao = o.ao || null; // 4 values or null
    const base = this.vcount;
    const ps = [p0, p1, p2, p3];
    for (let i = 0; i < 4; i++) {
      const p = ps[i];
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
      this.col.push(m.r, m.g, m.b);
      const a = ao ? ao[i] : 1;
      this.mat.push(m.e, m.s, a);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.vcount += 4;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const v = ps[i][j];
        if (v < this.min[j]) this.min[j] = v;
        if (v > this.max[j]) this.max[j] = v;
      }
    }
    return this;
  };

  /* axis aligned box from min corner to max corner (exclusive faces at max) */
  VoxMesh.prototype.box = function (x0, y0, z0, x1, y1, z1, m, opts) {
    const o = opts || {};
    const skip = o.skip || {};
    const sh = o.inset || 0;
    const a0 = [x0 + sh, y0 + sh, z0 + sh];
    const a1 = [x1 - sh, y1 - sh, z1 - sh];
    if (!skip.pz) this.quad([a0[0], a0[1], a1[2]], [a1[0], a0[1], a1[2]], [a1[0], a1[1], a1[2]], [a0[0], a1[1], a1[2]], m, o);
    if (!skip.nz) this.quad([a0[0], a0[1], a0[2]], [a0[0], a1[1], a0[2]], [a1[0], a1[1], a0[2]], [a1[0], a0[1], a0[2]], m, o);
    if (!skip.px) this.quad([a1[0], a0[1], a0[2]], [a1[0], a0[1], a1[2]], [a1[0], a1[1], a1[2]], [a1[0], a1[1], a0[2]], m, o);
    if (!skip.nx) this.quad([a0[0], a0[1], a0[2]], [a0[0], a1[1], a0[2]], [a0[0], a1[1], a1[2]], [a0[0], a0[1], a1[2]], m, o);
    if (!skip.py) this.quad([a0[0], a1[1], a0[2]], [a1[0], a1[1], a0[2]], [a1[0], a1[1], a1[2]], [a0[0], a1[1], a1[2]], m, o);
    if (!skip.ny) this.quad([a0[0], a0[1], a0[2]], [a1[0], a0[1], a0[2]], [a1[0], a0[1], a1[2]], [a0[0], a0[1], a1[2]], m, o);
    return this;
  };

  /* hollow rectangular frame (4 beams), opening in the XY plane */
  VoxMesh.prototype.frameXY = function (x0, y0, z0, x1, y1, z1, t, m) {
    this.box(x0, y0, z0, x1, y1, z0 + t, m);
    this.box(x0, y1 - t, z0, x1, y1, z0 + t, m);
    this.box(x0, y0, z0, x0 + t, y1, z0 + t, m);
    this.box(x1 - t, y0, z0, x1, y1, z0 + t, m);
    return this;
  };

  /* cylindrical-ish ring built from stepped blocks (voxel annulus in XY) */
  VoxMesh.prototype.ringXY = function (cx, cy, z, rOuter, rInner, thick, m, segs) {
    const n = segs || 24;
    const step = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const a = i * step;
      const c = Math.cos(a), s = Math.sin(a);
      const ri = Math.floor(rInner * 0.72), ro = Math.floor(rOuter * 0.72);
      this.box(
        cx + Math.round(c * ri), cy + Math.round(s * ri), z,
        cx + Math.round(c * ro) + 1, cy + Math.round(s * ro) + 1, z + thick, m
      );
    }
    return this;
  };

  VoxMesh.prototype.bounds = function () {
    return { min: this.min.slice(), max: this.max.slice() };
  };
  VoxMesh.prototype.center = function () {
    return [(this.min[0] + this.max[0]) / 2, (this.min[1] + this.max[1]) / 2, (this.min[2] + this.max[2]) / 2];
  };
  VoxMesh.prototype.radius = function () {
    const c = this.center();
    return Math.hypot(this.max[0] - c[0], this.max[1] - c[1], this.max[2] - c[2]);
  };
  VoxMesh.prototype.triangles = function () { return this.idx.length / 3; };

  /* ------------------------------------------------------------------
   * VoxGrid : sparse voxel occupancy with per-voxel material
   * ------------------------------------------------------------------ */
  function VoxGrid() {
    this.map = new Map();
  }
  VoxGrid.prototype.key = function (x, y, z) {
    return (x + 1024) * 16777216 + (y + 1024) * 4096 + (z + 1024);
  };
  VoxGrid.prototype.set = function (x, y, z, m) {
    this.map.set(this.key(x, y, z), m);
    return this;
  };
  VoxGrid.prototype.get = function (x, y, z) {
    return this.map.get(this.key(x, y, z));
  };
  VoxGrid.prototype.has = function (x, y, z) {
    return this.map.has(this.key(x, y, z));
  };
  VoxGrid.prototype.erase = function (x, y, z) {
    this.map.delete(this.key(x, y, z));
    return this;
  };
  VoxGrid.prototype.fill = function (x0, y0, z0, x1, y1, z1, m) {
    for (let x = x0; x < x1; x++)
      for (let y = y0; y < y1; y++)
        for (let z = z0; z < z1; z++) this.set(x, y, z, m);
    return this;
  };
  /* fill a solid box but hollow out the interior (shell only) */
  VoxGrid.prototype.shellBox = function (x0, y0, z0, x1, y1, z1, t, m) {
    for (let x = x0; x < x1; x++)
      for (let y = y0; y < y1; y++)
        for (let z = z0; z < z1; z++) {
          if (x < x0 + t || x >= x1 - t || y < y0 + t || y >= y1 - t || z < z0 + t || z >= z1 - t)
            this.set(x, y, z, m);
        }
    return this;
  };
  /* slab: hollow in Y only */
  VoxGrid.prototype.slab = function (x0, y0, z0, x1, y1, z1, t, m) {
    for (let x = x0; x < x1; x++)
      for (let z = z0; z < z1; z++) {
        this.set(x, y0, z, m); this.set(x, y1 - 1, z, m);
      }
    return this;
  };
  VoxGrid.prototype.sphere = function (cx, cy, cz, r, m, jag) {
    const R = r;
    const j = jag === undefined ? 0 : jag;
    const r2 = R * R;
    for (let x = Math.floor(cx - R - 2); x <= cx + R + 2; x++) {
      for (let y = Math.floor(cy - R - 2); y <= cy + R + 2; y++) {
        for (let z = Math.floor(cz - R - 2); z <= cz + R + 2; z++) {
          const dx = x - cx, dy = y - cy, dz = z - cz;
          const d = dx * dx + dy * dy + dz * dz;
          const lim = r2 + (j ? Core.fbm3(x * 0.09, y * 0.09, z * 0.09, 3) * j * R : 0);
          if (d <= lim) this.set(x, y, z, m);
        }
      }
    }
    return this;
  };

  /* emit grid into mesh with per-vertex ambient occlusion */
  const FACE_TANGENTS = [
    { n: [1, 0, 0], u: 1, v: 2 },   // +X
    { n: [-1, 0, 0], u: 2, v: 1 },  // -X
    { n: [0, 1, 0], u: 2, v: 0 },   // +Y
    { n: [0, -1, 0], u: 0, v: 2 },  // -Y
    { n: [0, 0, 1], u: 0, v: 1 },   // +Z
    { n: [0, 0, -1], u: 1, v: 0 },  // -Z
  ];
  const AO_LEVEL = [0.46, 0.66, 0.84, 1.0];

  function emitGrid(mesh, grid, opts) {
    const o = opts || {};
    const scale = o.scale === undefined ? 1 : o.scale;
    const jitter = o.jitter === undefined ? 0 : o.jitter;
    grid.map.forEach(function (m, key) {
      // decode key -> x,y,z
      const z = (key % 4096) - 1024;
      const rest = (key - (z + 1024)) / 4096;
      const y = (rest % 4096) - 1024;
      const x = (rest - (y + 1024)) / 4096 - 1024;
      const shade = jitter ? (1 + (Core.hash3(x, y, z) - 0.5) * jitter) : 1;
      const mat = shade === 1 ? m : variant(m, shade, 1);
      for (let f = 0; f < 6; f++) {
        const F = FACE_TANGENTS[f];
        const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
        if (grid.has(nx, ny, nz)) continue;
        const p = [];
        const ao = [];
        for (let k = 0; k < 4; k++) {
          const su = (k === 0 || k === 3) ? -1 : 1;
          const sv = (k === 0 || k === 1) ? -1 : 1;
          const px = x + (F.n[0] > 0 ? 1 : 0) + (F.u === 0 ? (su > 0 ? 1 : 0) : 0) + (F.v === 0 ? (sv > 0 ? 1 : 0) : 0);
          const py = y + (F.n[1] > 0 ? 1 : 0) + (F.u === 1 ? (su > 0 ? 1 : 0) : 0) + (F.v === 1 ? (sv > 0 ? 1 : 0) : 0);
          const pz = z + (F.n[2] > 0 ? 1 : 0) + (F.u === 2 ? (su > 0 ? 1 : 0) : 0) + (F.v === 2 ? (sv > 0 ? 1 : 0) : 0);
          p.push([px * scale, py * scale, pz * scale]);
          // AO sampling
          const s1 = [x + F.n[0], y + F.n[1], z + F.n[2]];
          s1[F.u] += su; const a1 = grid.has(s1[0], s1[1], s1[2]) ? 1 : 0;
          const s2 = [x + F.n[0], y + F.n[1], z + F.n[2]];
          s2[F.v] += sv; const a2 = grid.has(s2[0], s2[1], s2[2]) ? 1 : 0;
          const sc = [x + F.n[0] + (F.u === 0 ? su : 0), y + F.n[1] + (F.u === 1 ? su : 0), z + F.n[2] + (F.u === 2 ? su : 0)];
          sc[F.v] += sv; const a3 = grid.has(sc[0], sc[1], sc[2]) ? 1 : 0;
          ao.push(AO_LEVEL[3 - (a1 + a2 + a3)]);
        }
        mesh.quad(p[0], p[1], p[2], p[3], mat, { ao: ao });
      }
    });
    return mesh;
  }

  /* ------------------------------------------------------------------
   * Loft: sweep a sequence of closed 2D profiles (in XY, at given Z)
   * into a hull surface.  Each profile is an array of [x,y] points,
   * ordered CCW when viewed from +Z.
   * ------------------------------------------------------------------ */
  function loft(mesh, sections, m, opts) {
    const o = opts || {};
    const zf = o.zf || function (z) { return z; };
    for (let s = 0; s < sections.length - 1; s++) {
      const A = sections[s], B = sections[s + 1];
      const zA = A.z, zB = B.z;
      const n = Math.min(A.pts.length, B.pts.length);
      for (let i = 0; i < n; i++) {
        const a0 = A.pts[i], a1 = A.pts[(i + 1) % n];
        const b0 = B.pts[i], b1 = B.pts[(i + 1) % n];
        // quad a0(zA) a1(zA) b1(zB) b0(zB)
        const p0 = [a0[0], a0[1], zA], p1 = [a1[0], a1[1], zA];
        const p2 = [b1[0], b1[1], zB], p3 = [b0[0], b0[1], zB];
        const mat = (o.matFn) ? o.matFn(s, i, zA) : m;
        if (!mat) continue;
        mesh.quad(p0, p1, p2, p3, mat, o);
      }
    }
    return mesh;
  }

  F.Vox = {
    Mat: Mat,
    variant: variant,
    hexLin: hexLin,
    VoxMesh: VoxMesh,
    VoxGrid: VoxGrid,
    emitGrid: emitGrid,
    loft: loft,
    FACE_TANGENTS: FACE_TANGENTS,
  };
})(window);
