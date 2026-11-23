/* geometry.js — mesh builders (render) and tetrahedral jelly mesh generation. */
(function (global) {
  'use strict';

  const G = {};

  /* ---------------- render meshes ---------------- */
  // Vertex layout everywhere: position(3) + normal(3) [+ extra]
  function packMesh(positions, normals, indices, extra) {
    const n = positions.length / 3;
    const stride = extra ? 8 : 6;
    const data = new Float32Array(n * stride);
    for (let i = 0; i < n; i++) {
      data[i * stride + 0] = positions[i * 3 + 0];
      data[i * stride + 1] = positions[i * 3 + 1];
      data[i * stride + 2] = positions[i * 3 + 2];
      data[i * stride + 3] = normals[i * 3 + 0];
      data[i * stride + 4] = normals[i * 3 + 1];
      data[i * stride + 5] = normals[i * 3 + 2];
      if (extra) data[i * stride + 6] = extra[i];
    }
    return { data, indices: new Uint32Array(indices), count: indices.length, stride };
  }

  G.packMesh = packMesh;

  G.sphere = function (seg = 24, rings = 16) {
    const pos = [], nrm = [], idx = [];
    for (let r = 0; r <= rings; r++) {
      const phi = r / rings * Math.PI;
      for (let s = 0; s <= seg; s++) {
        const th = s / seg * Math.PI * 2;
        const x = Math.sin(phi) * Math.cos(th);
        const y = Math.cos(phi);
        const z = Math.sin(phi) * Math.sin(th);
        pos.push(x * 0.5, y * 0.5, z * 0.5);
        nrm.push(x, y, z);
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < seg; s++) {
        const a = r * (seg + 1) + s, b = a + seg + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return packMesh(pos, nrm, idx);
  };

  G.box = function () {
    const p = [], n = [], idx = [];
    const faces = [
      [[1, 0, 0], [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]]],
      [[-1, 0, 0], [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]]],
      [[0, 1, 0], [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]]],
      [[0, -1, 0], [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]]],
      [[0, 0, 1], [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]]],
      [[0, 0, -1], [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]]]
    ];
    faces.forEach((f, fi) => {
      const base = fi * 4;
      f[1].forEach(v => { p.push(v[0], v[1], v[2]); n.push(f[0][0], f[0][1], f[0][2]); });
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    return packMesh(p, n, idx);
  };

  G.cylinder = function (seg = 28) {
    const p = [], n = [], idx = [];
    // side
    for (let s = 0; s <= seg; s++) {
      const th = s / seg * Math.PI * 2;
      const x = Math.cos(th) * 0.5, z = Math.sin(th) * 0.5;
      p.push(x, -0.5, z, x, 0.5, z);
      n.push(Math.cos(th), 0, Math.sin(th), Math.cos(th), 0, Math.sin(th));
    }
    for (let s = 0; s < seg; s++) {
      const a = s * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    // caps
    for (let cap = 0; cap < 2; cap++) {
      const y = cap === 0 ? -0.5 : 0.5;
      const ny = cap === 0 ? -1 : 1;
      const c = p.length / 3;
      p.push(0, y, 0); n.push(0, ny, 0);
      for (let s = 0; s <= seg; s++) {
        const th = s / seg * Math.PI * 2;
        p.push(Math.cos(th) * 0.5, y, Math.sin(th) * 0.5);
        n.push(0, ny, 0);
      }
      for (let s = 0; s < seg; s++) {
        if (cap === 0) idx.push(c, c + 1 + s, c + 2 + s);
        else idx.push(c, c + 2 + s, c + 1 + s);
      }
    }
    return packMesh(p, n, idx);
  };

  G.plane = function () {
    const p = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5];
    const n = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    return packMesh(p, n, [0, 1, 2, 0, 2, 3]);
  };

  /* Glass panel: grid in the local XY plane (normal +Z), with an "edge" attribute
     that reaches 1 on the border so the shader can draw a bright glass rim. */
  G.glassPanel = function (grid = 10) {
    const p = [], n = [], idx = [], e = [];
    for (let j = 0; j <= grid; j++) {
      for (let i = 0; i <= grid; i++) {
        const u = i / grid * 2 - 1, v = j / grid * 2 - 1;
        p.push(u * 0.5, v * 0.5, 0);
        n.push(0, 0, 1);
        const m = Math.max(Math.abs(u), Math.abs(v));
        e.push(Math.min(1, Math.max(0, (m - 0.82) / 0.18)));
      }
    }
    for (let j = 0; j < grid; j++) {
      for (let i = 0; i < grid; i++) {
        const a = j * (grid + 1) + i, b = a + grid + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return packMesh(p, n, idx, e);
  };

  /* ---------------- tetrahedral jelly mesh ---------------- */
  /* A lattice of cells; each column has its own height, so a height-field shape
     (cube / dome / column / slab / pyramid) is carved out of a box. */
  G.buildTetJelly = function (opts) {
    const N = opts.res || 6;
    const sx = opts.sx, sy = opts.sy, sz = opts.sz;
    const shape = opts.shape || 'cube';
    const nv = (N + 1) * (N + 1) * (N + 1);
    const pos = new Float32Array(nv * 3);
    const height = new Float32Array((N + 1) * (N + 1));

    const colH = (i, j) => {
      const u = i / N * 2 - 1, v = j / N * 2 - 1;
      switch (shape) {
        case 'dome': {
          const r = Math.min(1, Math.hypot(u, v) / 1.0);
          return 0.34 + 0.66 * Math.sqrt(Math.max(0, 1 - r * r));
        }
        case 'column': return 1.0;
        case 'slab': return 0.55;
        case 'pyramid': return Math.max(0.18, 1.0 - 0.82 * Math.max(Math.abs(u), Math.abs(v)));
        case 'blob': {
          const r = Math.hypot(u, v);
          return 0.30 + 0.70 * Math.cos(Math.min(1, r) * Math.PI * 0.5) * (1 + 0.16 * Math.sin(3 * Math.atan2(v, u)));
        }
        default: return 1.0;
      }
    };
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) height[j * (N + 1) + i] = colH(i, j);
    }

    const vidx = (i, j, k) => i * (N + 1) * (N + 1) + j * (N + 1) + k;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const h = height[j * (N + 1) + i];
        for (let k = 0; k <= N; k++) {
          const id = vidx(i, j, k);
          pos[id * 3 + 0] = (i / N - 0.5) * sx;
          pos[id * 3 + 1] = (j / N) * h * sy;
          pos[id * 3 + 2] = (k / N - 0.5) * sz;
        }
      }
    }

    // 6-tet Kuhn split around the 0-7 diagonal
    const cellTets = [
      [0, 1, 3, 7], [0, 3, 2, 7], [0, 2, 6, 7], [0, 6, 4, 7], [0, 4, 5, 7], [0, 5, 1, 7]
    ];
    const cellCorner = [
      [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]
    ];
    const tets = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        for (let k = 0; k < N; k++) {
          const c = cellCorner.map(c => vidx(i + c[0], j + c[1], k + c[2]));
          for (const t of cellTets) tets.push(c[t[0]], c[t[1]], c[t[2]], c[t[3]]);
        }
      }
    }
    const tetArr = new Int32Array(tets);
    const ntet = tetArr.length / 4;

    // rest volumes
    const restVol = new Float32Array(ntet);
    for (let t = 0; t < ntet; t++) {
      restVol[t] = G.tetVolume(pos, tetArr[t * 4], tetArr[t * 4 + 1], tetArr[t * 4 + 2], tetArr[t * 4 + 3]);
    }

    // unique lattice edges
    const edgeMap = new Map();
    const edgeList = [];
    const key = (a, b) => (a < b ? a * 1000003 + b : b * 1000003 + a);
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) for (let k = 0; k <= N; k++) {
      const a = vidx(i, j, k);
      const nb = [];
      if (i < N) nb.push(vidx(i + 1, j, k));
      if (j < N) nb.push(vidx(i, j + 1, k));
      if (k < N) nb.push(vidx(i, j, k + 1));
      for (const b of nb) {
        const kk = key(a, b);
        if (!edgeMap.has(kk)) { edgeMap.set(kk, edgeList.length); edgeList.push(a, b); }
      }
    }
    const edges = new Int32Array(edgeList);
    const nedge = edges.length / 2;
    const restLen = new Float32Array(nedge);
    for (let e = 0; e < nedge; e++) {
      const a = edges[e * 2], b = edges[e * 2 + 1];
      const dx = pos[a * 3] - pos[b * 3], dy = pos[a * 3 + 1] - pos[b * 3 + 1], dz = pos[a * 3 + 2] - pos[b * 3 + 2];
      restLen[e] = Math.hypot(dx, dy, dz);
    }

    // tet faces -> neighbour lookup (for fracture component rebuild)
    const faceTable = [];
    for (let t = 0; t < ntet; t++) {
      faceTable.push([
        [tetArr[t * 4 + 0], tetArr[t * 4 + 2], tetArr[t * 4 + 1]],
        [tetArr[t * 4 + 0], tetArr[t * 4 + 1], tetArr[t * 4 + 3]],
        [tetArr[t * 4 + 0], tetArr[t * 4 + 3], tetArr[t * 4 + 2]],
        [tetArr[t * 4 + 1], tetArr[t * 4 + 2], tetArr[t * 4 + 3]]
      ]);
    }
    const faceMap = new Map();
    const fkey = (f) => {
      const s = f.slice().sort((a, b) => a - b);
      return s[0] * 262144 + s[1] * 512 + s[2] * 12 + s[3];
    };
    faceTable.forEach((faces, t) => faces.forEach((f, fi) => {
      const kk = fkey(f);
      if (!faceMap.has(kk)) faceMap.set(kk, { tet: t, fi });
      else faceMap.get(kk).neigh = { tet: t, fi };
    }));

    return {
      N, sx, sy, sz, shape,
      nv, pos, tets: tetArr, ntet, restVol,
      edges, nedge, restLen,
      faceTable, faceMap, fkey
    };
  };

  G.tetVolume = function (pos, a, b, c, d) {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
    const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2];
    const dx = pos[d * 3], dy = pos[d * 3 + 1], dz = pos[d * 3 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const wx = dx - ax, wy = dy - ay, wz = dz - az;
    const cx2 = vy * wz - vz * wy, cy2 = vz * wx - vx * wz, cz2 = vx * wy - vy * wx;
    return (ux * cx2 + uy * cy2 + uz * cz2) / 6;
  };

  global.Geo = G;
})(window);
