/* ============================================================
   geo3d.js — 几何生成：路径挤出（含倒角/孔洞）、基础实体、变形
   ============================================================ */
(function (global) {
  'use strict';
  const { TAU, clamp, lerp, triangulate } = U;

  function emptyMesh() { return { verts: [], norms: [], uvs: [], idx: [] }; }
  function meshFromArrays(verts, norms, uvs, idx) {
    return {
      verts: new Float32Array(verts), norms: new Float32Array(norms),
      uvs: new Float32Array(uvs), idx: new Uint32Array(idx)
    };
  }
  function mergeMesh(list) {
    let vcount = 0, icount = 0;
    for (const m of list) { vcount += m.verts.length / 3; icount += m.idx.length; }
    const verts = new Float32Array(vcount * 3), norms = new Float32Array(vcount * 3), uvs = new Float32Array(vcount * 2), idx = new Uint32Array(icount);
    let vo = 0, io = 0;
    for (const m of list) {
      verts.set(m.verts, vo * 3); norms.set(m.norms, vo * 3); uvs.set(m.uvs, vo * 2);
      const base = vo;
      for (let i = 0; i < m.idx.length; i++) idx[io + i] = m.idx[i] + base;
      vo += m.verts.length / 3; io += m.idx.length;
    }
    return { verts, norms, uvs, idx };
  }
  function transformMesh(mesh, m) {
    const out = { verts: new Float32Array(mesh.verts.length), norms: new Float32Array(mesh.norms.length), uvs: mesh.uvs, idx: mesh.idx };
    for (let i = 0; i < mesh.verts.length; i += 3) {
      const x = mesh.verts[i], y = mesh.verts[i + 1], z = mesh.verts[i + 2];
      out.verts[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
      out.verts[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      out.verts[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
    // 法线用逆转置
    const nm = normalMat3(m);
    for (let i = 0; i < mesh.norms.length; i += 3) {
      const x = mesh.norms[i], y = mesh.norms[i + 1], z = mesh.norms[i + 2];
      out.norms[i] = nm[0] * x + nm[3] * y + nm[6] * z;
      out.norms[i + 1] = nm[1] * x + nm[4] * y + nm[7] * z;
      out.norms[i + 2] = nm[2] * x + nm[5] * y + nm[8] * z;
    }
    return out;
  }
  function normalMat3(m) {
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C || 1e-9;
    const inv = 1 / det;
    return [A * inv, -(b * i - c * h) * inv, (b * f - c * e) * inv,
      B * inv, (a * i - c * g) * inv, -(a * f - c * d) * inv,
      C * inv, -(a * h - b * g) * inv, (a * e - b * d) * inv];
  }
  function computeNormals(mesh) {
    const n = new Float32Array(mesh.verts.length);
    for (let i = 0; i < mesh.idx.length; i += 3) {
      const a = mesh.idx[i] * 3, b = mesh.idx[i + 1] * 3, c = mesh.idx[i + 2] * 3;
      const ax = mesh.verts[a], ay = mesh.verts[a + 1], az = mesh.verts[a + 2];
      const bx = mesh.verts[b], by = mesh.verts[b + 1], bz = mesh.verts[b + 2];
      const cx = mesh.verts[c], cy = mesh.verts[c + 1], cz = mesh.verts[c + 2];
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
      n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
      n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
      n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
    }
    return { verts: mesh.verts, norms: n, uvs: mesh.uvs, idx: mesh.idx };
  }

  /* ---------------- 挤出 ---------------- */
  const extrudeCache = new Map();
  function extrudePaths(path, opts = {}) {
    const depth = opts.depth === undefined ? 40 : opts.depth;
    const bevel = opts.bevel === undefined ? 3 : opts.bevel;
    const segs = Math.max(0, Math.round(opts.bevelSegments === undefined ? 2 : opts.bevelSegments));
    const tol = opts.tolerance || 0.35;
    const flipY = opts.flipY !== false;
    const polys = [];
    for (const c of path.contours) {
      if (c.pts.length < 3) continue;
      const flat = PT.flattenContour(c, tol);
      if (flat.length >= 3) polys.push(flat);
    }
    if (!polys.length) return null;
    const verts = [], norms = [], uvs = [], idx = [];
    const pushV = (x, y, z, nx, ny, nz, u, v) => { verts.push(x, y, z); norms.push(nx, ny, nz); uvs.push(u || 0, v || 0); return verts.length / 3 - 1; };
    const ySign = flipY ? -1 : 1;
    const half = depth / 2;
    const insetPolys = polys.map(p => {
      const q = PT.offsetPolyline(p, -bevel, true);
      return q.length === p.length ? q : p;
    });
    // 前后盖
    const capTris = triangulate(insetPolys);
    const capVerts = capTris.verts;
    const frontBase = verts.length / 3;
    for (const p of capVerts) pushV(p[0], p[1] * ySign, half, 0, 0, 1, 0, 0);
    for (const t of capTris.tris) {
      // 保证朝 +Z
      const a = capVerts[t[0]], b = capVerts[t[1]], c = capVerts[t[2]];
      const ar = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const s = ySign > 0 ? (ar > 0 ? [t[0], t[1], t[2]] : [t[0], t[2], t[1]]) : (ar > 0 ? [t[0], t[2], t[1]] : [t[0], t[1], t[2]]);
      idx.push(frontBase + s[0], frontBase + s[1], frontBase + s[2]);
    }
    const backBase = verts.length / 3;
    for (const p of capVerts) pushV(p[0], p[1] * ySign, -half, 0, 0, -1, 0, 0);
    for (const t of capTris.tris) {
      const a = capVerts[t[0]], b = capVerts[t[1]], c = capVerts[t[2]];
      const ar = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const s = ySign > 0 ? (ar > 0 ? [t[0], t[2], t[1]] : [t[0], t[1], t[2]]) : (ar > 0 ? [t[0], t[1], t[2]] : [t[0], t[2], t[1]]);
      idx.push(backBase + s[0], backBase + s[1], backBase + s[2]);
    }
    // 侧壁 + 倒角环
    for (let pi = 0; pi < polys.length; pi++) {
      const full = polys[pi];
      const inset = insetPolys[pi];
      const n = full.length;
      if (n < 2 || inset.length !== n) continue;
      // 计算每个点的二维外法线
      const nrm = [];
      for (let i = 0; i < n; i++) {
        const p0 = full[(i - 1 + n) % n], p1 = full[i], p2 = full[(i + 1) % n];
        let n1 = [-(p1[1] - p0[1]), p1[0] - p0[0]], n2 = [-(p2[1] - p1[1]), p2[0] - p1[0]];
        const l1 = Math.hypot(n1[0], n1[1]) || 1, l2 = Math.hypot(n2[0], n2[1]) || 1;
        n1 = [n1[0] / l1, n1[1] / l1]; n2 = [n2[0] / l2, n2[1] / l2];
        let mx = n1[0] + n2[0], my = n1[1] + n2[1];
        const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
        const area = U.polygonArea(full);
        const s = area > 0 ? 1 : -1;
        nrm.push([mx * s, my * s]);
      }
      // 环：前 inset -> 前 full -> 后 full -> 后 inset
      const rings = [];
      const makeRing = (poly2, z, insetAmt, nz, ny2) => {
        const arr = [];
        for (let i = 0; i < n; i++) {
          const p = poly2[i], nn = nrm[i];
          const nx = nn[0], nyy = nn[1] * ySign;
          const l = Math.hypot(nx, nyy) || 1;
          arr.push({ x: p[0], y: p[1] * ySign, z, nx: nx / l * (ny2 === undefined ? 1 : ny2), ny: nyy / l * (ny2 === undefined ? 1 : ny2), nz });
        }
        return arr;
      };
      // 前倒角
      for (let k = 0; k <= segs; k++) {
        const a = (k / (segs || 1)) * Math.PI / 2;
        const ins = bevel * (1 - Math.sin(a));
        const z = half - bevel * (1 - Math.cos(a));
        const poly2 = ins > 0.001 ? PT.offsetPolyline(full, -ins, true) : full;
        if (poly2.length !== n) continue;
        const nz = Math.cos(a);
        rings.push(makeRing(poly2, z, ins, nz, 1 - nz));
      }
      // 后倒角
      for (let k = segs; k >= 0; k--) {
        const a = (k / (segs || 1)) * Math.PI / 2;
        const ins = bevel * (1 - Math.sin(a));
        const z = -half + bevel * (1 - Math.cos(a));
        const poly2 = ins > 0.001 ? PT.offsetPolyline(full, -ins, true) : full;
        if (poly2.length !== n) continue;
        const nz = -Math.cos(a);
        rings.push(makeRing(poly2, z, ins, nz, 1 + nz));
      }
      // 生成侧壁三角形
      for (let r = 0; r < rings.length - 1; r++) {
        const A = rings[r], B = rings[r + 1];
        const base = verts.length / 3;
        for (let i = 0; i < n; i++) {
          const a = A[i], b = A[(i + 1) % n], c = B[(i + 1) % n], d = B[i];
          const i0 = pushV(a.x, a.y, a.z, a.nx, a.ny, a.nz, i / n, r / rings.length);
          const i1 = pushV(b.x, b.y, b.z, b.nx, b.ny, b.nz, (i + 1) / n, r / rings.length);
          const i2 = pushV(c.x, c.y, c.z, c.nx, c.ny, c.nz, (i + 1) / n, (r + 1) / rings.length);
          const i3 = pushV(d.x, d.y, d.z, d.nx, d.ny, d.nz, i / n, (r + 1) / rings.length);
          const area = U.polygonArea(full);
          if (area > 0) { idx.push(i0, i2, i1, i0, i3, i2); }
          else { idx.push(i0, i1, i2, i0, i2, i3); }
        }
      }
    }
    return meshFromArrays(verts, norms, uvs, idx);
  }

  /* ---------------- 基础实体 ---------------- */
  function boxMesh(w, h, d, opts = {}) {
    const seg = opts.bevel ? 1 : 0;
    const x = w / 2, y = h / 2, z = d / 2;
    const faces = [
      { n: [0, 0, 1], v: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
      { n: [0, 0, -1], v: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
      { n: [1, 0, 0], v: [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]] },
      { n: [-1, 0, 0], v: [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]] },
      { n: [0, 1, 0], v: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]] },
      { n: [0, -1, 0], v: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]] }
    ];
    const verts = [], norms = [], uvs = [], idx = [];
    for (const f of faces) {
      const b = verts.length / 3;
      f.v.forEach((p, i) => { verts.push(p[0], p[1], p[2]); norms.push(f.n[0], f.n[1], f.n[2]); uvs.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0); });
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    return meshFromArrays(verts, norms, uvs, idx);
  }
  function cylinderMesh(r, h, seg = 32, r2 = null, opts = {}) {
    const rr2 = r2 === null ? r : r2;
    const verts = [], norms = [], uvs = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const slope = (r - rr2) / h;
      for (const [rr, y] of [[r, -h / 2], [rr2, h / 2]]) {
        const nl = Math.hypot(1, slope);
        verts.push(ca * rr, y, sa * rr); norms.push(ca / nl, slope / nl, sa / nl); uvs.push(i / seg, y > 0 ? 1 : 0);
      }
    }
    for (let i = 0; i < seg; i++) {
      const b = i * 2;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    // 上下盖
    for (const [y, ny, rr] of [[-h / 2, -1, r], [h / 2, 1, rr2]]) {
      const base = verts.length / 3;
      verts.push(0, y, 0); norms.push(0, ny, 0); uvs.push(0.5, 0.5);
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * TAU;
        verts.push(Math.cos(a) * rr, y, Math.sin(a) * rr); norms.push(0, ny, 0); uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
      }
      for (let i = 0; i < seg; i++) {
        if (ny > 0) idx.push(base, base + 1 + i, base + 2 + i);
        else idx.push(base, base + 2 + i, base + 1 + i);
      }
    }
    return meshFromArrays(verts, norms, uvs, idx);
  }
  function sphereMesh(r, seg = 24, rings = 16) {
    const verts = [], norms = [], uvs = [], idx = [];
    for (let j = 0; j <= rings; j++) {
      const phi = j / rings * Math.PI;
      for (let i = 0; i <= seg; i++) {
        const th = i / seg * TAU;
        const x = Math.sin(phi) * Math.cos(th), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(th);
        verts.push(x * r, y * r, z * r); norms.push(x, y, z); uvs.push(i / seg, j / rings);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    return meshFromArrays(verts, norms, uvs, idx);
  }
  function planeMesh(w, h, seg = 1) {
    const verts = [], norms = [], uvs = [], idx = [];
    for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
      verts.push(-w / 2 + w * i / seg, 0, -h / 2 + h * j / seg);
      norms.push(0, 1, 0); uvs.push(i / seg, j / seg);
    }
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    return meshFromArrays(verts, norms, uvs, idx);
  }

  /* ---------------- 路径平面网格（用于 2D 图形进 3D） ---------------- */
  function pathToMesh(path, opts = {}) {
    const polys = [];
    for (const c of path.contours) { const f = PT.flattenContour(c, 0.3); if (f.length >= 3) polys.push(f); }
    if (!polys.length) return null;
    const tri = triangulate(polys);
    const verts = [], norms = [], uvs = [], idx = [];
    for (const p of tri.verts) { verts.push(p[0], -p[1], 0); norms.push(0, 0, 1); uvs.push(0, 0); }
    for (const t of tri.tris) {
      const a = tri.verts[t[0]], b = tri.verts[t[1]], c = tri.verts[t[2]];
      const ar = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (ar > 0) idx.push(t[0], t[1], t[2]); else idx.push(t[0], t[2], t[1]);
    }
    return meshFromArrays(verts, norms, uvs, idx);
  }

  /* ---------------- 变形 ---------------- */
  // opts: { bend, twist, taper, fieldFn, pins, pinState }
  function deformMesh(mesh, opts = {}) {
    const { bend = 0, twist = 0, taper = 0 } = opts;
    const hasDeform = Math.abs(bend) > 1e-5 || Math.abs(twist) > 1e-5 || Math.abs(taper) > 1e-5 || opts.fieldFn || (opts.pins && opts.pins.length);
    if (!hasDeform) return mesh;
    // 计算包围盒
    let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < mesh.verts.length; i += 3) {
      y0 = Math.min(y0, mesh.verts[i + 1]); y1 = Math.max(y1, mesh.verts[i + 1]);
      x0 = Math.min(x0, mesh.verts[i]); x1 = Math.max(x1, mesh.verts[i]);
      z0 = Math.min(z0, mesh.verts[i + 2]); z1 = Math.max(z1, mesh.verts[i + 2]);
    }
    const h = Math.max(y1 - y0, 1e-3);
    const cy = (y0 + y1) / 2;
    const out = new Float32Array(mesh.verts.length);
    const tmp = [0, 0, 0];
    for (let i = 0; i < mesh.verts.length; i += 3) {
      let x = mesh.verts[i], y = mesh.verts[i + 1], z = mesh.verts[i + 2];
      const ty = (y - y0) / h;
      // 弯曲：绕 X 轴按 y 弯
      if (Math.abs(bend) > 1e-5) {
        const a = bend * ty;
        const R = h / Math.max(Math.abs(bend), 1e-4) * 0.5;
        const nx = x;
        const ny = Math.sin(a) * (y - cy) * 0.0 + 0;
        // 简化：以 y 为参数做圆弧弯曲（绕 X 轴）
        const r = R + z;
        const ang = (y - y0) / R * bend;
        const ny2 = y0 + Math.sin(ang) * r;
        const nz2 = -R + Math.cos(ang) * r;
        y = ny2; z = nz2;
      }
      // 扭转：绕 Y 轴按 y 旋转
      if (Math.abs(twist) > 1e-5) {
        const a = twist * (ty - 0.5);
        const ca = Math.cos(a), sa = Math.sin(a);
        const nx = x * ca - z * sa, nz = x * sa + z * ca;
        x = nx; z = nz;
      }
      // 锥化
      if (Math.abs(taper) > 1e-5) {
        const s = 1 + taper * (ty - 0.5);
        x *= s; z *= s;
      }
      if (opts.fieldFn) {
        tmp[0] = x; tmp[1] = y; tmp[2] = z;
        const d = opts.fieldFn(tmp);
        if (d) { x += d[0]; y += d[1]; z += d[2]; }
      }
      if (opts.pins && opts.pins.length) {
        const r = applyPins(x, y, z, opts.pins);
        x = r[0]; y = r[1]; z = r[2];
      }
      out[i] = x; out[i + 1] = y; out[i + 2] = z;
    }
    const res = { verts: out, norms: mesh.norms, uvs: mesh.uvs, idx: mesh.idx };
    return computeNormals(res);
  }
  // 图钉：以原始位置的反距离加权混合各图钉的变换，形体不撕裂
  function applyPins(x, y, z, pins) {
    let wsum = 0;
    let ox = 0, oy = 0, oz = 0;
    for (const p of pins) {
      if (p.enabled === false) continue;
      const dx = x - p.orig[0], dy = y - p.orig[1], dz = z - (p.orig[2] || 0);
      const d2 = dx * dx + dy * dy + dz * dz;
      const w = 1 / Math.pow(Math.max(d2, 1e-4), 1.2);
      const s = (p.scale === undefined ? 1 : p.scale) / 100;
      const r = (p.rotation || 0) * Math.PI / 180;
      const lx = dx * s, ly = dy * s, lz = dz * s;
      const ca = Math.cos(r), sa = Math.sin(r);
      const rx = lx * ca - ly * sa, ry = lx * sa + ly * ca;
      ox += (p.pos[0] + rx) * w; oy += (p.pos[1] + ry) * w; oz += (p.pos[2] + lz) * w;
      wsum += w;
    }
    if (wsum <= 0) return [x, y, z];
    return [ox / wsum, oy / wsum, oz / wsum];
  }

  /* ---------------- 文字挤出缓存 ---------------- */
  function textMesh(text, style, depth, bevel, segs, flipY) {
    const key = [text, style.fontFamily, style.fontSize, depth, bevel, segs].join('|');
    if (extrudeCache.has(key)) return extrudeCache.get(key);
    const tp = FONT.textToPath(text, style);
    const m = extrudePaths(tp.path, { depth, bevel, bevelSegments: segs, flipY });
    extrudeCache.set(key, m);
    if (extrudeCache.size > 60) extrudeCache.delete(extrudeCache.keys().next().value);
    return m;
  }

  global.GEO = {
    emptyMesh, meshFromArrays, mergeMesh, transformMesh, computeNormals, normalMat3,
    extrudePaths, boxMesh, cylinderMesh, sphereMesh, planeMesh, pathToMesh,
    deformMesh, applyPins, textMesh
  };
})(window);
