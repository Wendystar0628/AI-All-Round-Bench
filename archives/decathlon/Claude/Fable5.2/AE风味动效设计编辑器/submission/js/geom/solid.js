// 三维实体：挤出（前后面/侧壁/倒角/法线）、基本体、弯曲/扭转/通用变形、图钉变形(MLS)、空间场
// Mesh3: { type:'mesh3', pos:Float32Array(3n), nrm:Float32Array(3n), idx:Uint32Array, heat?:Float32Array(n) }
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});

  const Solid = (MF.Solid = {
    // ---------- 挤出 ----------
    // m2: Mesh2；D 深度；b 倒角尺寸；nb 倒角分段；nd 深度分段
    extrude(m2, D, b, nb, nd) {
      const V = m2.verts, T = m2.tris, nv = V.length >> 1;
      D = Math.max(0.01, D); nd = Math.max(1, Math.round(nd || 1)); nb = Math.max(0, Math.round(nb || 0));
      b = MF.clamp(b || 0, 0, D / 2 - 1e-4); if (b < 1e-5) { b = 0; nb = 0; }
      const zf = -D / 2, zb = D / 2;
      const pos = [], nrm = [], idx = [];
      const push = (x, y, z, nx, ny, nz) => { pos.push(x, y, z); nrm.push(nx, ny, nz); return pos.length / 3 - 1; };
      // 每个环顶点的外法线（斜接）
      const insX = new Float64Array(nv), insY = new Float64Array(nv);
      const loopInfo = [];
      for (const L of m2.loops) {
        const m = L.length; const info = { L, nx: new Float64Array(m), ny: new Float64Array(m), k: new Float64Array(m), hard: new Uint8Array(m), n1x: new Float64Array(m), n1y: new Float64Array(m), n2x: new Float64Array(m), n2y: new Float64Array(m) };
        for (let j = 0; j < m; j++) {
          const p = L[(j + m - 1) % m], c = L[j], q = L[(j + 1) % m];
          let e1x = V[c * 2] - V[p * 2], e1y = V[c * 2 + 1] - V[p * 2 + 1], e2x = V[q * 2] - V[c * 2], e2y = V[q * 2 + 1] - V[c * 2 + 1];
          const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1; e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
          const n1x = e1y, n1y = -e1x, n2x = e2y, n2y = -e2x;
          let mx = n1x + n2x, my = n1y + n2y; const ml = Math.hypot(mx, my);
          if (ml < 1e-6) { mx = n1x; my = n1y; } else { mx /= ml; my /= ml; }
          const cosH = Math.max(0.35, mx * n1x + my * n1y);
          info.nx[j] = mx; info.ny[j] = my; info.k[j] = 1 / cosH;
          info.hard[j] = n1x * n2x + n1y * n2y < 0.82 ? 1 : 0;
          info.n1x[j] = n1x; info.n1y[j] = n1y; info.n2x[j] = n2x; info.n2y[j] = n2y;
          insX[c] = mx / cosH; insY[c] = my / cosH;
        }
        loopInfo.push(info);
      }
      // 前后盖
      const fbase = pos.length / 3;
      for (let i = 0; i < nv; i++) push(V[i * 2] - insX[i] * b, V[i * 2 + 1] - insY[i] * b, zf, 0, 0, -1);
      for (let i = 0; i < T.length; i += 3) idx.push(fbase + T[i], fbase + T[i + 2], fbase + T[i + 1]);
      const bbase = pos.length / 3;
      for (let i = 0; i < nv; i++) push(V[i * 2] - insX[i] * b, V[i * 2 + 1] - insY[i] * b, zb, 0, 0, 1);
      for (let i = 0; i < T.length; i += 3) idx.push(bbase + T[i], bbase + T[i + 1], bbase + T[i + 2]);
      // 侧面剖面：[inset, z, 法线xy分量, 法线z分量]
      const sections = [];
      const wall = []; for (let s = 0; s <= nd; s++) wall.push([0, zf + b + ((zb - zf - 2 * b) * s) / nd, 1, 0]);
      if (nb >= 2) {
        const sec = [];
        for (let s = 0; s <= nb; s++) { const ph = (s / nb) * Math.PI / 2; sec.push([b * (1 - Math.sin(ph)), zf + b * (1 - Math.cos(ph)), Math.sin(ph), -Math.cos(ph)]); }
        for (let s = 1; s <= nd; s++) sec.push(wall[s]);
        for (let s = 1; s <= nb; s++) { const ph = (1 - s / nb) * Math.PI / 2; sec.push([b * (1 - Math.sin(ph)), zb - b * (1 - Math.cos(ph)), Math.sin(ph), Math.cos(ph)]); }
        sections.push(sec);
      } else if (nb === 1) {
        const r = Math.SQRT1_2;
        sections.push([[b, zf, r, -r], [0, zf + b, r, -r]]); sections.push(wall); sections.push([[0, zb - b, r, r], [b, zb, r, r]]);
      } else sections.push(wall);
      for (const info of loopInfo) {
        const L = info.L, m = L.length;
        for (const sec of sections) {
          let prevIn = null, prevOut = null;
          for (let s = 0; s < sec.length; s++) {
            const o = sec[s][0], z = sec[s][1], nxy = sec[s][2], nz = sec[s][3];
            const vin = new Int32Array(m), vout = new Int32Array(m);
            for (let j = 0; j < m; j++) {
              const c = L[j]; const x = V[c * 2] - info.nx[j] * info.k[j] * o, y = V[c * 2 + 1] - info.ny[j] * info.k[j] * o;
              if (info.hard[j]) { vin[j] = push(x, y, z, info.n1x[j] * nxy, info.n1y[j] * nxy, nz); vout[j] = push(x, y, z, info.n2x[j] * nxy, info.n2y[j] * nxy, nz); }
              else vin[j] = vout[j] = push(x, y, z, info.nx[j] * nxy, info.ny[j] * nxy, nz);
            }
            if (prevIn) for (let j = 0; j < m; j++) {
              const j2 = (j + 1) % m; const A0 = prevOut[j], B0 = prevIn[j2], A1 = vout[j], B1 = vin[j2];
              idx.push(A0, B0, B1, A0, B1, A1);
            }
            prevIn = vin; prevOut = vout;
          }
        }
      }
      return { type: 'mesh3', pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx) };
    },

    // ---------- 基本体 ----------
    box(w, h, d, sx, sy, sz) {
      sx = Math.max(1, sx | 0); sy = Math.max(1, sy | 0); sz = Math.max(1, sz | 0);
      const pos = [], nrm = [], idx = [];
      const face = (u, v, wAxis, wSign, su, sv, U, Vv, W) => {
        const base = pos.length / 3;
        for (let j = 0; j <= sv; j++) for (let i = 0; i <= su; i++) {
          const p = [0, 0, 0]; p[u] = (i / su - 0.5) * U; p[v] = (j / sv - 0.5) * Vv; p[wAxis] = (wSign * W) / 2;
          pos.push(p[0], p[1], p[2]); const n = [0, 0, 0]; n[wAxis] = wSign; nrm.push(n[0], n[1], n[2]);
        }
        for (let j = 0; j < sv; j++) for (let i = 0; i < su; i++) { const a = base + j * (su + 1) + i, b = a + 1, c = a + su + 1, dd = c + 1; idx.push(a, b, dd, a, dd, c); }
      };
      face(0, 1, 2, -1, sx, sy, w, h, d); face(0, 1, 2, 1, sx, sy, w, h, d);
      face(0, 2, 1, -1, sx, sz, w, d, h); face(0, 2, 1, 1, sx, sz, w, d, h);
      face(1, 2, 0, -1, sy, sz, h, d, w); face(1, 2, 0, 1, sy, sz, h, d, w);
      return { type: 'mesh3', pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx) };
    },
    sphere(r, seg) {
      seg = Math.max(6, seg | 0); const rings = Math.max(4, seg >> 1); const pos = [], nrm = [], idx = [];
      for (let j = 0; j <= rings; j++) { const th = (j / rings) * Math.PI; for (let i = 0; i <= seg; i++) { const ph = (i / seg) * Math.PI * 2; const x = Math.sin(th) * Math.cos(ph), y = -Math.cos(th), z = Math.sin(th) * Math.sin(ph); pos.push(x * r, y * r, z * r); nrm.push(x, y, z); } }
      for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
      return { type: 'mesh3', pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx) };
    },
    // 圆柱：轴向沿 Y，高 h，半径 r，可带倒角
    cylinder(r, h, seg, hseg, bevel) {
      seg = Math.max(6, seg | 0); hseg = Math.max(1, hseg | 0); const pos = [], nrm = [], idx = [];
      bevel = MF.clamp(bevel || 0, 0, Math.min(r, h / 2) * 0.95);
      const prof = []; // [radius, y, nr, ny]
      const NB = bevel > 0 ? 4 : 0;
      for (let s = 0; s <= NB; s++) { const ph = (s / (NB || 1)) * Math.PI / 2; if (NB) prof.push([r - bevel * (1 - Math.sin(ph)), -h / 2 + bevel * (1 - Math.cos(ph)), Math.sin(ph), -Math.cos(ph)]); }
      for (let s = NB ? 1 : 0; s <= hseg; s++) prof.push([r, -h / 2 + bevel + ((h - 2 * bevel) * s) / hseg, 1, 0]);
      for (let s = 1; s <= NB; s++) { const ph = (1 - s / NB) * Math.PI / 2; prof.push([r - bevel * (1 - Math.sin(ph)), h / 2 - bevel * (1 - Math.cos(ph)), Math.sin(ph), Math.cos(ph)]); }
      for (let s = 0; s < prof.length; s++) for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); pos.push(c * prof[s][0], prof[s][1], sn * prof[s][0]); nrm.push(c * prof[s][2], prof[s][3], sn * prof[s][2]); }
      for (let s = 0; s < prof.length - 1; s++) for (let i = 0; i < seg; i++) { const a = s * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1; idx.push(a, d, b, a, c, d); }
      for (const sgn of [-1, 1]) {
        const base = pos.length / 3; const rr = r - bevel; pos.push(0, (sgn * h) / 2, 0); nrm.push(0, sgn, 0);
        for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; pos.push(Math.cos(a) * rr, (sgn * h) / 2, Math.sin(a) * rr); nrm.push(0, sgn, 0); }
        for (let i = 0; i < seg; i++) { if (sgn > 0) idx.push(base, base + 2 + i, base + 1 + i); else idx.push(base, base + 1 + i, base + 2 + i); }
      }
      return { type: 'mesh3', pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx) };
    },
    // 平面：位于 XZ（法线 -Y，即朝上）或 XY
    plane(w, d, sx, sz, axis) {
      sx = Math.max(1, sx | 0); sz = Math.max(1, sz | 0); const pos = [], nrm = [], idx = [];
      for (let j = 0; j <= sz; j++) for (let i = 0; i <= sx; i++) {
        const u = (i / sx - 0.5) * w, v = (j / sz - 0.5) * d;
        if (axis === 'xy') { pos.push(u, v, 0); nrm.push(0, 0, -1); } else { pos.push(u, 0, v); nrm.push(0, -1, 0); }
      }
      for (let j = 0; j < sz; j++) for (let i = 0; i < sx; i++) { const a = j * (sx + 1) + i, b = a + 1, c = a + sx + 1, dd = c + 1; idx.push(a, b, dd, a, dd, c); }
      return { type: 'mesh3', pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx) };
    },
    merge(list) {
      list = list.filter((m) => m && m.type === 'mesh3'); if (list.length === 1) return list[0];
      let nv = 0, ni = 0; for (const m of list) { nv += m.pos.length / 3; ni += m.idx.length; }
      const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), idx = new Uint32Array(ni); let vo = 0, io = 0;
      let heat = null; if (list.some((m) => m.heat)) heat = new Float32Array(nv);
      for (const m of list) { pos.set(m.pos, vo * 3); nrm.set(m.nrm, vo * 3); if (heat && m.heat) heat.set(m.heat, vo); for (let i = 0; i < m.idx.length; i++) idx[io + i] = m.idx[i] + vo; vo += m.pos.length / 3; io += m.idx.length; }
      const o = { type: 'mesh3', pos, nrm, idx }; if (heat) o.heat = heat; return o;
    },
    // 刚性/仿射变换
    transform(m, M) {
      const n = m.pos.length / 3, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
      const N = MF.M4.invert(M); // 法线用逆转置
      const p = m.pos, q = m.nrm;
      for (let i = 0; i < n; i++) {
        const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
        pos[i * 3] = M[0] * x + M[4] * y + M[8] * z + M[12]; pos[i * 3 + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; pos[i * 3 + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
        const a = q[i * 3], b = q[i * 3 + 1], c = q[i * 3 + 2];
        let nx = N[0] * a + N[1] * b + N[2] * c, ny = N[4] * a + N[5] * b + N[6] * c, nz = N[8] * a + N[9] * b + N[10] * c;
        const l = Math.hypot(nx, ny, nz) || 1; nrm[i * 3] = nx / l; nrm[i * 3 + 1] = ny / l; nrm[i * 3 + 2] = nz / l;
      }
      const o = { type: 'mesh3', pos, nrm, idx: m.idx }; if (m.heat) o.heat = m.heat; return o;
    },
    // 通用逐点变形：fn(x,y,z,out[3])；法线用有限差分的切向量重建
    deform(m, fn) {
      const n = m.pos.length / 3, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
      const p = m.pos, q = m.nrm, o0 = [0, 0, 0], o1 = [0, 0, 0], o2 = [0, 0, 0];
      let ext = 0; { let x0 = Infinity, x1 = -Infinity; for (let i = 0; i < n * 3; i += 3) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; } ext = Math.max(1, x1 - x0); }
      const e = Math.max(0.05, ext * 2e-4);
      for (let i = 0; i < n; i++) {
        const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2], nx = q[i * 3], ny = q[i * 3 + 1], nz = q[i * 3 + 2];
        fn(x, y, z, o0);
        pos[i * 3] = o0[0]; pos[i * 3 + 1] = o0[1]; pos[i * 3 + 2] = o0[2];
        // 切向量
        let t1x, t1y, t1z;
        if (Math.abs(nx) < 0.7) { t1x = 0; t1y = -nz; t1z = ny; } else { t1x = -nz; t1y = 0; t1z = nx; } // n × X 或 n × Y 的变体
        let l = Math.hypot(t1x, t1y, t1z) || 1; t1x /= l; t1y /= l; t1z /= l;
        const t2x = ny * t1z - nz * t1y, t2y = nz * t1x - nx * t1z, t2z = nx * t1y - ny * t1x;
        fn(x + t1x * e, y + t1y * e, z + t1z * e, o1); fn(x + t2x * e, y + t2y * e, z + t2z * e, o2);
        const ax = o1[0] - o0[0], ay = o1[1] - o0[1], az = o1[2] - o0[2], bx = o2[0] - o0[0], by = o2[1] - o0[1], bz = o2[2] - o0[2];
        let cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
        l = Math.hypot(cx, cy, cz);
        if (l < 1e-12) { cx = nx; cy = ny; cz = nz; l = 1; }
        nrm[i * 3] = cx / l; nrm[i * 3 + 1] = cy / l; nrm[i * 3 + 2] = cz / l;
      }
      const o = { type: 'mesh3', pos, nrm, idx: m.idx }; if (m.heat) o.heat = m.heat; return o;
    },
    // 弯曲：沿 axis 轴向，弯向 toward 轴；angle 总角度(度)，center 轴上中心，range 弯曲段长度
    bendFn(axis, toward, angleDeg, center, range, pivot) {
      const a = axis, b = toward === axis ? (axis + 1) % 3 : toward;
      const th = angleDeg * MF.DEG; range = Math.max(1e-3, range);
      const k = th / range; const p = [0, 0, 0];
      return function (x, y, z, out) {
        p[0] = x; p[1] = y; p[2] = z;
        if (Math.abs(k) < 1e-9) { out[0] = x; out[1] = y; out[2] = z; return; }
        const s = p[a] - center, sc = MF.clamp(s, -range / 2, range / 2), ph = k * sc, R = 1 / k;
        const h = p[b] - pivot;
        let na = Math.sin(ph) * (R - h), nb = R - (R - h) * Math.cos(ph);
        const rest = s - sc;
        na += Math.cos(ph) * rest; nb += Math.sin(ph) * rest;
        p[a] = center + na; p[b] = pivot + nb;
        out[0] = p[0]; out[1] = p[1]; out[2] = p[2];
      };
    },
    // 扭转：绕 axis 轴，angle 总角度(度) 分布在 range 长度上
    twistFn(axis, angleDeg, center, range, pivotU, pivotV) {
      const a = axis, u = (axis + 1) % 3, v = (axis + 2) % 3; const p = [0, 0, 0]; range = Math.max(1e-3, range);
      return function (x, y, z, out) {
        p[0] = x; p[1] = y; p[2] = z;
        const s = MF.clamp((p[a] - center) / range, -0.5, 0.5), ang = angleDeg * MF.DEG * s, c = Math.cos(ang), sn = Math.sin(ang);
        const du = p[u] - pivotU, dv = p[v] - pivotV;
        p[u] = pivotU + du * c - dv * sn; p[v] = pivotV + du * sn + dv * c;
        out[0] = p[0]; out[1] = p[1]; out[2] = p[2];
      };
    },
    bbox(m) {
      const p = m.pos; let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < p.length; i += 3) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1]; if (p[i + 2] < z0) z0 = p[i + 2]; if (p[i + 2] > z1) z1 = p[i + 2]; }
      return isFinite(x0) ? [x0, y0, z0, x1, y1, z1] : [0, 0, 0, 0, 0, 0];
    },
    // 三角形面积累积表（用于表面取样）
    cdf(m) {
      if (m._cdf) return m._cdf;
      const p = m.pos, t = m.idx, n = t.length / 3, c = new Float32Array(n); let acc = 0;
      for (let i = 0; i < n; i++) {
        const a = t[i * 3] * 3, b = t[i * 3 + 1] * 3, d = t[i * 3 + 2] * 3;
        const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[d] - p[a], vy = p[d + 1] - p[a + 1], vz = p[d + 2] - p[a + 2];
        acc += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx); c[i] = acc;
      }
      m._cdf = { c, total: acc }; return m._cdf;
    },
    // 平面网格(Mesh2) → Mesh3（z=0，双面可见）
    fromMesh2(m2) {
      const n = m2.verts.length >> 1, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = m2.verts[i * 2]; pos[i * 3 + 1] = m2.verts[i * 2 + 1]; nrm[i * 3 + 2] = -1; }
      const idx = new Uint32Array(m2.tris.length); for (let i = 0; i < idx.length; i += 3) { idx[i] = m2.tris[i]; idx[i + 1] = m2.tris[i + 2]; idx[i + 2] = m2.tris[i + 1]; }
      return { type: 'mesh3', pos, nrm, idx };
    },
  });

  // ---------- 图钉变形：移动最小二乘（相似/刚性混合），不撕裂 ----------
  // pins: [{rx, ry, x, y, rot(度), scale}]
  MF.Pins = {
    deform(m2, pins, radius, rigid, alpha) {
      if (!pins.length) return m2;
      const cp = [], cq = []; radius = Math.max(1, radius || 40); alpha = alpha || 1.15; rigid = MF.clamp(rigid === undefined ? 0.4 : rigid, 0, 1);
      for (const pn of pins) {
        cp.push(pn.rx, pn.ry); cq.push(pn.x, pn.y);
        const r = (pn.rot || 0) * MF.DEG, s = pn.scale === undefined ? 1 : pn.scale, c = Math.cos(r) * s, sn = Math.sin(r) * s;
        for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.5, ox = Math.cos(a) * radius, oy = Math.sin(a) * radius; cp.push(pn.rx + ox, pn.ry + oy); cq.push(pn.x + ox * c - oy * sn, pn.y + ox * sn + oy * c); }
      }
      const nc = cp.length >> 1, V = m2.verts, n = V.length >> 1, out = new Float64Array(n * 2);
      const w = new Float64Array(nc);
      for (let i = 0; i < n; i++) {
        const vx = V[i * 2], vy = V[i * 2 + 1]; let sw = 0, psx = 0, psy = 0, qsx = 0, qsy = 0;
        for (let k = 0; k < nc; k++) { const dx = cp[k * 2] - vx, dy = cp[k * 2 + 1] - vy; const wk = 1 / Math.pow(dx * dx + dy * dy + 1e-6, alpha); w[k] = wk; sw += wk; psx += wk * cp[k * 2]; psy += wk * cp[k * 2 + 1]; qsx += wk * cq[k * 2]; qsy += wk * cq[k * 2 + 1]; }
        psx /= sw; psy /= sw; qsx /= sw; qsy /= sw;
        let a = 0, b = 0, mu = 0;
        for (let k = 0; k < nc; k++) { const px = cp[k * 2] - psx, py = cp[k * 2 + 1] - psy, qx = cq[k * 2] - qsx, qy = cq[k * 2 + 1] - qsy; a += w[k] * (px * qx + py * qy); b += w[k] * (px * qy - py * qx); mu += w[k] * (px * px + py * py); }
        if (mu < 1e-12) { out[i * 2] = vx + qsx - psx; out[i * 2 + 1] = vy + qsy - psy; continue; }
        a /= mu; b /= mu;
        const ml = Math.hypot(a, b);
        if (ml > 1e-9 && rigid > 0) { const f = 1 - rigid + rigid / ml; a *= f; b *= f; }
        const dx = vx - psx, dy = vy - psy;
        out[i * 2] = qsx + a * dx - b * dy; out[i * 2 + 1] = qsy + b * dx + a * dy;
      }
      return { type: 'mesh2', verts: out, tris: m2.tris, loops: m2.loops };
    },
  };

  // ---------- 空间场 ----------
  // 场对象: { eval(x,y,z,out[4]) }，out = [强度, vx, vy, vz]；info 用于画布辅助显示
  const F = (MF.Fields = {
    falloff(o) {
      const cx = o.center[0], cy = o.center[1], cz = o.center[2] || 0, R = Math.max(1e-3, o.radius), hard = MF.clamp(o.hardness || 0, 0, 0.999), st = o.strength;
      const shape = o.shape || 'sphere', ax = MF.V3.norm(o.axis || [0, 1, 0]), dir = o.dir ? o.dir : [0, 1, 0], vmode = o.vector || 'radial';
      const curve = o.curve || 1;
      return {
        kind: 'falloff', info: { center: [cx, cy, cz], radius: R, hardness: hard, shape, axis: ax },
        eval(x, y, z, out) {
          const dx = x - cx, dy = y - cy, dz = z - cz; let d, rx = dx, ry = dy, rz = dz;
          if (shape === 'linear') { d = dx * ax[0] + dy * ax[1] + dz * ax[2]; const f = MF.clamp(d / R, 0, 1); let s = 1 - f; if (hard > 0) s = MF.clamp((1 - f) / (1 - hard), 0, 1); s = s * s * (3 - 2 * s); if (curve !== 1) s = Math.pow(s, curve); s *= st; out[0] = s; rx = ax[0]; ry = ax[1]; rz = ax[2]; d = 1; setV(out, s, vmode, rx, ry, rz, d, dir, ax); return; }
          if (shape === 'cylinder') { const h = dx * ax[0] + dy * ax[1] + dz * ax[2]; rx = dx - ax[0] * h; ry = dy - ax[1] * h; rz = dz - ax[2] * h; }
          d = Math.hypot(rx, ry, rz);
          let f = d / R; if (f >= 1) { out[0] = out[1] = out[2] = out[3] = 0; return; }
          let s = f <= hard ? 1 : 1 - (f - hard) / (1 - hard); s = s * s * (3 - 2 * s); if (curve !== 1) s = Math.pow(s, curve); s *= st;
          setV(out, s, vmode, rx, ry, rz, d, dir, ax);
        },
      };
    },
    noise(o) {
      const sc = 1 / Math.max(1e-3, o.scale), st = o.strength, ev = (o.evolution || 0), seed = o.seed | 0, off = o.offset || [0, 0, 0], oct = Math.max(1, Math.min(4, o.octaves | 0 || 1));
      const fb = (x, y, z, s) => { let v = 0, a = 1, f = 1, t = 0; for (let k = 0; k < oct; k++) { v += a * MF.noise3(x * f, y * f, z * f + ev * (1 + k * 0.37), s + k * 17); t += a; a *= 0.5; f *= 2; } return v / t; };
      return {
        kind: 'noise', info: { scale: o.scale },
        eval(x, y, z, out) {
          const X = (x + off[0]) * sc, Y = (y + off[1]) * sc, Z = (z + (off[2] || 0)) * sc;
          const a = fb(X, Y, Z, seed), b = fb(X + 31.7, Y - 12.3, Z + 5.1, seed + 101), c = fb(X - 8.2, Y + 47.1, Z - 19.6, seed + 211);
          out[0] = st * (a * 0.5 + 0.5); out[1] = st * a * 1.6; out[2] = st * b * 1.6; out[3] = st * c * 1.6;
        },
      };
    },
    vortex(o) {
      const cx = o.center[0], cy = o.center[1], cz = o.center[2] || 0, R = Math.max(1e-3, o.radius), st = o.strength, ax = MF.V3.norm(o.axis || [0, 0, 1]), pull = o.pull || 0;
      return {
        kind: 'vortex', info: { center: [cx, cy, cz], radius: R, axis: ax, shape: 'cylinder', hardness: 0 },
        eval(x, y, z, out) {
          const dx = x - cx, dy = y - cy, dz = z - cz; const h = dx * ax[0] + dy * ax[1] + dz * ax[2];
          const rx = dx - ax[0] * h, ry = dy - ax[1] * h, rz = dz - ax[2] * h; const d = Math.hypot(rx, ry, rz);
          const f = d / R; if (f >= 1 || d < 1e-9) { out[0] = out[1] = out[2] = out[3] = 0; if (f < 1) out[0] = st; return; }
          let s = 1 - f; s = s * s * (3 - 2 * s) * st;
          // 切向 = axis × r
          const tx = (ax[1] * rz - ax[2] * ry) / d, ty = (ax[2] * rx - ax[0] * rz) / d, tz = (ax[0] * ry - ax[1] * rx) / d;
          out[0] = s; out[1] = (tx - (rx / d) * pull) * s; out[2] = (ty - (ry / d) * pull) * s; out[3] = (tz - (rz / d) * pull) * s;
        },
      };
    },
    constant(s, v) { return { kind: 'const', info: {}, eval(x, y, z, out) { out[0] = s; out[1] = v[0] * s; out[2] = v[1] * s; out[3] = v[2] * s; } }; },
    // 混合：add 相加 | mul 相乘(用 B 的强度遮罩 A) | max | min | sub | mix
    mix(A, B, mode, t) {
      const a = [0, 0, 0, 0], b = [0, 0, 0, 0];
      const zero = { eval(x, y, z, o) { o[0] = o[1] = o[2] = o[3] = 0; } }; A = A || zero; B = B || zero; t = t === undefined ? 0.5 : t;
      return {
        kind: 'mix', info: {}, parts: [A, B],
        eval(x, y, z, out) {
          A.eval(x, y, z, a); B.eval(x, y, z, b);
          if (mode === 'mul') { out[0] = a[0] * b[0]; out[1] = a[1] * b[0]; out[2] = a[2] * b[0]; out[3] = a[3] * b[0]; }
          else if (mode === 'max') { const s = a[0] >= b[0] ? a : b; out[0] = s[0]; out[1] = s[1]; out[2] = s[2]; out[3] = s[3]; }
          else if (mode === 'min') { const s = a[0] <= b[0] ? a : b; out[0] = s[0]; out[1] = s[1]; out[2] = s[2]; out[3] = s[3]; }
          else if (mode === 'sub') { out[0] = a[0] - b[0]; out[1] = a[1] - b[1]; out[2] = a[2] - b[2]; out[3] = a[3] - b[3]; }
          else if (mode === 'mix') { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; out[3] = a[3] + (b[3] - a[3]) * t; }
          else { out[0] = a[0] + b[0]; out[1] = a[1] + b[1]; out[2] = a[2] + b[2]; out[3] = a[3] + b[3]; }
        },
      };
    },
    // 收集可视化信息（递归）
    infos(f, list) { list = list || []; if (!f) return list; if (f.parts) for (const p of f.parts) F.infos(p, list); else if (f.info && f.info.center) list.push(f); return list; },
  });
  function setV(out, s, vmode, rx, ry, rz, d, dir, ax) {
    out[0] = s;
    if (vmode === 'dir') { out[1] = dir[0] * s; out[2] = dir[1] * s; out[3] = dir[2] * s; }
    else if (vmode === 'axis') { out[1] = ax[0] * s; out[2] = ax[1] * s; out[3] = ax[2] * s; }
    else if (d > 1e-9) { out[1] = (rx / d) * s; out[2] = (ry / d) * s; out[3] = (rz / d) * s; }
    else { out[1] = out[2] = out[3] = 0; }
  }
})();
