/* 三维网格：平面三角化、挤出（前后面、倒角斜面与侧壁，保留孔洞与凹部）、变形与法线重算。
 * 网格为非索引三角形列表：pos 为 Float32Array(3n)，nrm 为 Float32Array(3n)。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const U = AE.U;
  const P = AE.Path;
  const Mesh = (AE.Mesh = {});

  // 把二维三角形（xy 扁平数组）转为 z 固定的网格
  function toMesh(tris2, z, nz) {
    const n = tris2.length / 2;
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = tris2[i * 2];
      pos[i * 3 + 1] = tris2[i * 2 + 1];
      pos[i * 3 + 2] = z;
      nrm[i * 3 + 2] = nz;
    }
    return { pos, nrm };
  }
  // 平面网格（z=0，法线朝向观察者）
  Mesh.flat = (contours) => {
    const tris = P.fillTriangles(contours);
    if (!tris.length) return null;
    return toMesh(tris, 0, -1);
  };

  // 每个轮廓的“朝外”方向（指向实体之外）：外轮廓朝外为法线方向，孔洞则反向
  function outwardNormals(cs, depthOf) {
    return cs.map((c, ci) => {
      const pts = c.pts;
      const n = pts.length;
      const hole = depthOf[ci] % 2 === 1;
      // 边法线（左侧）
      const en = [];
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const ex = b[0] - a[0], ey = b[1] - a[1];
        const L = Math.hypot(ex, ey) || 1;
        let nx = ey / L, ny = -ex / L;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const inside = P.pointInPoly(mx + nx * 0.5, my + ny * 0.5, pts);
        // 外轮廓：朝外即离开轮廓；孔洞：朝外即进入孔洞
        if (inside === !hole) {
          nx = -nx;
          ny = -ny;
        }
        en.push([nx, ny]);
      }
      // 顶点法线：相邻两条边的平均，并给出斜接长度修正
      const vn = [];
      for (let i = 0; i < n; i++) {
        const e0 = en[(i - 1 + n) % n], e1 = en[i];
        let sx = e0[0] + e1[0], sy = e0[1] + e1[1];
        const L = Math.hypot(sx, sy) || 1;
        sx /= L;
        sy /= L;
        const cosHalf = Math.max(0.5, sx * e1[0] + sy * e1[1]);
        vn.push({ n: [sx, sy], k: 1 / cosHalf });
      }
      return { en, vn };
    });
  }

  // 挤出：前面 z = -d/2（朝向摄像机），后面 z = +d/2；倒角为斜面；侧壁沿轮廓边
  Mesh.extrude = (contours, depth, bevel) => {
    const cs = contours.filter((c) => c.pts.length >= 3).map((c) => ({ pts: c.pts, closed: true }));
    if (!cs.length) return null;
    const d = Math.max(0.01, depth) / 2;
    const depthOf = P.nestingDepth(cs);
    const normals = outwardNormals(cs, depthOf);
    // 倒角宽度不超过半厚度，也不超过轮廓的一半
    const b = Math.max(0, Math.min(bevel || 0, d * 0.9));
    const inset = b > 0.01 ? cs.map((c, ci) => ({
      pts: c.pts.map((p, i) => {
        const v = normals[ci].vn[i];
        const off = Math.min(b * v.k, b * 2.5);
        return [p[0] - v.n[0] * off, p[1] - v.n[1] * off];
      }),
      closed: true,
    })) : cs;
    const tris = P.fillTriangles(inset);
    if (!tris.length) return null;
    const pieces = [];
    // 前、后面（使用内缩后的轮廓）
    pieces.push(toMesh(tris, -d, -1));
    const back = toMesh(tris, d, 1);
    // 后面绕序翻转（与前面相反）
    for (let i = 0; i < back.pos.length; i += 9) {
      for (let k = 0; k < 3; k++) {
        const a = i + 3 + k, c2 = i + 6 + k;
        const t = back.pos[a];
        back.pos[a] = back.pos[c2];
        back.pos[c2] = t;
      }
    }
    pieces.push(back);
    // 倒角斜面：内缩轮廓在最外层面上，外轮廓在 z = ±(d - b)
    const wallA = -d + b, wallB = d - b;
    const bandP = [];
    const addQuad = (p0, p1, p2, p3) => {
      [p0, p1, p2, p0, p2, p3].forEach((v) => bandP.push(v[0], v[1], v[2]));
    };
    cs.forEach((c, ci) => {
      const outer = c.pts, inn = inset[ci].pts;
      const n = outer.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const o0 = [outer[i][0], outer[i][1]], o1 = [outer[j][0], outer[j][1]];
        const i0 = [inn[i][0], inn[i][1]], i1 = [inn[j][0], inn[j][1]];
        if (b > 0.01) {
          // 前倒角：内缩轮廓（z=-d）到外轮廓（z=-d+b）
          addQuad([i0[0], i0[1], -d], [o0[0], o0[1], wallA], [o1[0], o1[1], wallA], [i1[0], i1[1], -d]);
          // 后倒角
          addQuad([i0[0], i0[1], d], [o0[0], o0[1], wallB], [o1[0], o1[1], wallB], [i1[0], i1[1], d]);
        }
        // 侧壁：外轮廓在 wallA 与 wallB 之间
        addQuad([o0[0], o0[1], wallA], [o0[0], o0[1], wallB], [o1[0], o1[1], wallB], [o1[0], o1[1], wallA]);
      }
    });
    const bandMesh = { pos: new Float32Array(bandP) };
    bandMesh.nrm = Mesh.faceNormals(bandMesh.pos);
    // 侧壁法线朝外：使用每条边的外法线（重算后的面法线与其方向一致时保留，否则翻转）
    pieces.push(bandMesh);
    const pos = concat(...pieces.map((p) => p.pos));
    const nrm = concat(...pieces.map((p) => p.nrm));
    return { pos, nrm };
  };

  function concat(...arrs) {
    const len = arrs.reduce((s, a) => s + a.length, 0);
    const out = new Float32Array(len);
    let o = 0;
    arrs.forEach((a) => {
      out.set(a, o);
      o += a.length;
    });
    return out;
  }
  Mesh.concat = concat;

  // 对顶点位置施加变换函数 fn(x,y,z) -> [x,y,z]，并重算法线（平面着色）
  Mesh.deform = (mesh, fn) => {
    const pos = mesh.pos;
    const out = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      const r = fn(pos[i], pos[i + 1], pos[i + 2]);
      out[i] = r[0];
      out[i + 1] = r[1];
      out[i + 2] = r[2];
    }
    return { pos: out, nrm: Mesh.faceNormals(out) };
  };

  // 逐三角形法线，写入到每个顶点
  Mesh.faceNormals = (pos) => {
    const nrm = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 9) {
      const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
      const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      for (let k = 0; k < 9; k += 3) {
        nrm[i + k] = nx;
        nrm[i + k + 1] = ny;
        nrm[i + k + 2] = nz;
      }
    }
    return nrm;
  };

  Mesh.bounds = (mesh) => {
    const p = mesh.pos;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i] < x0) x0 = p[i];
      if (p[i] > x1) x1 = p[i];
      if (p[i + 1] < y0) y0 = p[i + 1];
      if (p[i + 1] > y1) y1 = p[i + 1];
      if (p[i + 2] < z0) z0 = p[i + 2];
      if (p[i + 2] > z1) z1 = p[i + 2];
    }
    return { min: [x0, y0, z0], max: [x1, y1, z1] };
  };
  void U;
})();
