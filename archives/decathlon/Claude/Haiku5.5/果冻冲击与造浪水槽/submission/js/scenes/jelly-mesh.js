// 果冻场景的几何：把若干果冻形体体素化，每个体素剖成 6 个四面体（Kuhn 剖分，相邻体素的面剖分一致）。
// 每个四面体独占 4 个顶点（不与邻居共享），相邻四面体共享的面用 3 对"焊接"顶点连接，
// 焊接断开后两侧顶点各自运动，裂口由此出现，碎块保持各自的弹性。
// 体素边界上的节点被投影到解析形状的表面，使静止时的轮廓光滑；四面体的 Dm 逆矩阵随之重算。
const JellyMesh = {
  PERMS: [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]],

  // 面 f 是去掉第 f 个局部顶点之后剩下的三角形，k 为其第 k 个顶点的局部下标
  loc(f, k) {
    return k >= f ? k + 1 : k;
  },

  // 形体定义：inside 判断点是否在果冻内部，sdf 为（近似）有符号距离
  makeShape(def) {
    const s = { id: def.id, mat: def.mat, E: def.E, S: def.S };
    if (def.kind === 'cyl') {
      const [cx, cy, cz] = def.c;
      const r = def.r, h = def.h;
      s.bmin = [cx - r, cy, cz - r];
      s.bmax = [cx + r, cy + h, cz + r];
      s.inside = (x, y, z) => {
        const dx = x - cx, dz = z - cz;
        return dx * dx + dz * dz < r * r && y >= cy && y <= cy + h;
      };
      s.sdf = (x, y, z) => {
        const d1 = Math.hypot(x - cx, z - cz) - r;
        const d2 = Math.max(cy - y, y - (cy + h));
        if (d1 > 0 || d2 > 0) return Math.hypot(Math.max(d1, 0), Math.max(d2, 0));
        return Math.max(d1, d2);
      };
    } else if (def.kind === 'box') {
      const [cx, cy, cz] = def.c;
      const [sx, sy, sz] = def.size;
      const hx = sx / 2, hz = sz / 2;
      s.bmin = [cx - hx, cy, cz - hz];
      s.bmax = [cx + hx, cy + sy, cz + hz];
      s.inside = (x, y, z) => x >= s.bmin[0] && x <= s.bmax[0] && y >= cy && y <= s.bmax[1] && z >= s.bmin[2] && z <= s.bmax[2];
      s.sdf = (x, y, z) => {
        const q = [Math.abs(x - cx) - hx, Math.abs(y - (cy + sy / 2)) - sy / 2, Math.abs(z - cz) - hz];
        const outside = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
        return outside + Math.min(Math.max(q[0], q[1], q[2]), 0);
      };
    } else {
      // 半椭球（圆顶，底面在 cy）
      const [cx, cy, cz] = def.c;
      const [rx, ry, rz] = def.rad;
      s.bmin = [cx - rx, cy, cz - rz];
      s.bmax = [cx + rx, cy + ry, cz + rz];
      s.inside = (x, y, z) => {
        if (y < cy) return false;
        const a = (x - cx) / rx, b = (y - cy) / ry, c = (z - cz) / rz;
        return a * a + b * b + c * c < 1;
      };
      const rmin = Math.min(rx, ry, rz);
      s.sdf = (x, y, z) => {
        const a = (x - cx) / rx, b = (y - cy) / ry, c = (z - cz) / rz;
        const ell = (Math.sqrt(a * a + b * b + c * c) - 1) * rmin;
        return Math.max(ell, cy - y);
      };
    }
    return s;
  },

  // 边界节点投影：沿有符号距离的梯度移到表面上（一次牛顿步足够，体素尺寸远小于曲率半径）
  projectNode(s, p) {
    const e = 1e-5;
    const d = s.sdf(p[0], p[1], p[2]);
    const gx = s.sdf(p[0] + e, p[1], p[2]) - s.sdf(p[0] - e, p[1], p[2]);
    const gy = s.sdf(p[0], p[1] + e, p[2]) - s.sdf(p[0], p[1] - e, p[2]);
    const gz = s.sdf(p[0], p[1], p[2] + e) - s.sdf(p[0], p[1], p[2] - e);
    const gl = Math.hypot(gx, gy, gz);
    if (gl < 1e-9) return p;
    return [p[0] - (d * gx) / gl, p[1] - (d * gy) / gl, p[2] - (d * gz) / gl];
  },

  build(shapeDefs, cell) {
    const shapes = shapeDefs.map((d) => this.makeShape(d));
    const nodeIds = new Map();
    const nodePos = [];
    const nodeShape = [];
    const tetNodes = [];
    const tetMat = [];
    const tetShape = [];

    const getNode = (si, sid, i, j, k, origin) => {
      const key = sid + ':' + i + ',' + j + ',' + k;
      let id = nodeIds.get(key);
      if (id === undefined) {
        id = nodePos.length / 3;
        nodeIds.set(key, id);
        nodePos.push(origin[0] + i * cell, origin[1] + j * cell, origin[2] + k * cell);
        nodeShape.push(si);
      }
      return id;
    };

    shapes.forEach((s, si) => {
      const origin = s.bmin;
      const nx = Math.ceil((s.bmax[0] - s.bmin[0]) / cell);
      const ny = Math.ceil((s.bmax[1] - s.bmin[1]) / cell);
      const nz = Math.ceil((s.bmax[2] - s.bmin[2]) / cell);
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          for (let k = 0; k < nz; k++) {
            const cx = origin[0] + (i + 0.5) * cell;
            const cy = origin[1] + (j + 0.5) * cell;
            const cz = origin[2] + (k + 0.5) * cell;
            if (!s.inside(cx, cy, cz)) continue;
            const corner = (bx, by, bz) => getNode(si, s.id, i + bx, j + by, k + bz, origin);
            for (const p of this.PERMS) {
              const b1 = [0, 0, 0];
              b1[p[0]] = 1;
              const b2 = b1.slice();
              b2[p[1]] = 1;
              const nodes = [corner(0, 0, 0), corner(b1[0], b1[1], b1[2]), corner(b2[0], b2[1], b2[2]), corner(1, 1, 1)];
              // 保证四面体为正向（Dm 行列式为正）
              const X = nodes.map((n) => nodePos.slice(n * 3, n * 3 + 3));
              const a = Vec3.sub(X[1], X[0]), b = Vec3.sub(X[2], X[0]), c = Vec3.sub(X[3], X[0]);
              if (Vec3.dot(a, Vec3.cross(b, c)) < 0) {
                const tmp = nodes[1];
                nodes[1] = nodes[2];
                nodes[2] = tmp;
              }
              tetNodes.push(nodes);
              tetMat.push(s.mat);
              tetShape.push(si);
            }
          }
        }
      }
    });

    const nTets = tetNodes.length;
    const nVerts = nTets * 4;
    const nNodes = nodePos.length / 3;

    // 面匹配：同一个三角形（三个全局节点）出现两次即为内部面
    const faceMap = new Map();
    for (let t = 0; t < nTets; t++) {
      const N = tetNodes[t];
      for (let f = 0; f < 4; f++) {
        const tri = [N[this.loc(f, 0)], N[this.loc(f, 1)], N[this.loc(f, 2)]].sort((x, y) => x - y);
        const key = tri.join(',');
        if (!faceMap.has(key)) faceMap.set(key, []);
        faceMap.get(key).push(t * 4 + f);
      }
    }
    const faceNbr = new Uint32Array(nTets * 4).fill(0xffffffff);
    const facePartner = new Uint32Array(nTets * 12);
    const onBoundary = new Uint8Array(nNodes);
    for (const [key, list] of faceMap.entries()) {
      if (list.length !== 2) {
        // 边界面：其三个节点位于表面上
        const ids = key.split(',').map(Number);
        for (const n of ids) onBoundary[n] = 1;
        continue;
      }
      const [eA, eB] = list;
      faceNbr[eA] = eB;
      faceNbr[eB] = eA;
      for (const [e, o] of [[eA, eB], [eB, eA]]) {
        const tA = e >> 2, fA = e & 3;
        const tB = o >> 2, fB = o & 3;
        for (let k = 0; k < 3; k++) {
          const nodeK = tetNodes[tA][this.loc(fA, k)];
          let found = -1;
          for (let j = 0; j < 4; j++) {
            if (j !== fB && tetNodes[tB][j] === nodeK) {
              found = j;
              break;
            }
          }
          facePartner[e * 3 + k] = tB * 4 + found;
        }
      }
    }

    // 投影边界节点到解析表面；若某个四面体被投影翻转，则把它的节点恢复原位，直到全部为正向
    const origPos = nodePos.slice();
    for (let n = 0; n < nNodes; n++) {
      if (!onBoundary[n]) continue;
      const sh = shapes[nodeShape[n]];
      const q = this.projectNode(sh, nodePos.slice(n * 3, n * 3 + 3));
      nodePos[n * 3] = q[0];
      nodePos[n * 3 + 1] = q[1];
      nodePos[n * 3 + 2] = q[2];
    }
    const tetDet = (t) => {
      const N = tetNodes[t];
      const P = (k) => [nodePos[N[k] * 3], nodePos[N[k] * 3 + 1], nodePos[N[k] * 3 + 2]];
      const X0 = P(0);
      return Vec3.dot(Vec3.sub(P(1), X0), Vec3.cross(Vec3.sub(P(2), X0), Vec3.sub(P(3), X0)));
    };
    for (let iter = 0; iter < 12; iter++) {
      let reverted = 0;
      for (let t = 0; t < nTets; t++) {
        // 名义行列式为 cell^3（体积 cell^3/6）；低于 60% 视为翻转或薄片，恢复原位
        if (tetDet(t) > 0.6 * cell * cell * cell) continue;
        for (const n of tetNodes[t]) {
          if (!onBoundary[n]) continue;
          for (let c = 0; c < 3; c++) nodePos[n * 3 + c] = origPos[n * 3 + c];
        }
        reverted++;
      }
      if (reverted === 0) break;
    }

    // 按（投影后的）节点位置计算静止几何
    const rest = new Float32Array(nVerts * 3);
    const vnode = new Uint32Array(nVerts);
    const V0 = new Float32Array(nTets);
    const dinv = new Float32Array(nTets * 12);
    for (let t = 0; t < nTets; t++) {
      const N = tetNodes[t];
      for (let k = 0; k < 4; k++) {
        const v = t * 4 + k;
        vnode[v] = N[k];
        rest[v * 3] = nodePos[N[k] * 3];
        rest[v * 3 + 1] = nodePos[N[k] * 3 + 1];
        rest[v * 3 + 2] = nodePos[N[k] * 3 + 2];
      }
      const X = [0, 1, 2, 3].map((k) => [rest[(t * 4 + k) * 3], rest[(t * 4 + k) * 3 + 1], rest[(t * 4 + k) * 3 + 2]]);
      const a = Vec3.sub(X[1], X[0]), b = Vec3.sub(X[2], X[0]), c = Vec3.sub(X[3], X[0]);
      const det = Vec3.dot(a, Vec3.cross(b, c));
      V0[t] = Math.abs(det) / 6;
      // Dm = [a b c]（列），逆矩阵的行为 (b×c, c×a, a×b)/det
      const r0 = Vec3.scale(Vec3.cross(b, c), 1 / det);
      const r1 = Vec3.scale(Vec3.cross(c, a), 1 / det);
      const r2 = Vec3.scale(Vec3.cross(a, b), 1 / det);
      const rows = [r0, r1, r2];
      for (let col = 0; col < 3; col++) {
        dinv[t * 12 + col * 4 + 0] = rows[0][col];
        dinv[t * 12 + col * 4 + 1] = rows[1][col];
        dinv[t * 12 + col * 4 + 2] = rows[2][col];
        dinv[t * 12 + col * 4 + 3] = 0;
      }
    }

    // 外壳标记：四面体有任一面位于边界（与空气接触）
    const tetShell = new Uint8Array(nTets);
    for (let t = 0; t < nTets; t++) {
      for (let f = 0; f < 4; f++) {
        if (faceNbr[t * 4 + f] === 0xffffffff) tetShell[t] = 1;
      }
    }

    return {
      nTets,
      nVerts,
      nNodes,
      tetShell,
      shapes,
      rest,
      vnode,
      V0,
      dinv,
      faceNbr,
      facePartner,
      tetMat: Uint32Array.from(tetMat),
      tetShape: Uint32Array.from(tetShape),
    };
  },
};
