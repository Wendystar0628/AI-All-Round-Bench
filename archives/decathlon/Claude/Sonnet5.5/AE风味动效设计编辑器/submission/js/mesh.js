/* mesh.js — 轮廓三角网格化(Delaunay)、挤出实体、法线、变形工具 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, G = AE.G;
  const Mesh = AE.Mesh = {};
  let _muid = 0;
  Mesh.uid = () => ++_muid;
  Mesh.make = (pos, idx, extra) => Object.assign({ uid: Mesh.uid(), pos, idx, nrm: null }, extra || {});

  // ---------- Delaunay (Bowyer–Watson + 邻接遍历) ----------
  function delaunay(P, n) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { const x = P[2 * i], y = P[2 * i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const R = Math.max(x1 - x0, y1 - y0, 1) * 10, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const X = new Float64Array(2 * (n + 3)); X.set(P.subarray ? P.subarray(0, 2 * n) : P.slice(0, 2 * n));
    X[2 * n] = cx - 3 * R; X[2 * n + 1] = cy - R; X[2 * n + 2] = cx + 3 * R; X[2 * n + 3] = cy - R; X[2 * n + 4] = cx; X[2 * n + 5] = cy + 3 * R;
    const tv = [n, n + 1, n + 2], tn = [-1, -1, -1], alive = [1], badS = [0], goodS = [0];
    let stamp = 0, last = 0;
    const orient = (a, b, px, py) => (X[2 * b] - X[2 * a]) * (py - X[2 * a + 1]) - (X[2 * b + 1] - X[2 * a + 1]) * (px - X[2 * a]);
    const inCircle = (t, px, py) => {
      const a = tv[3 * t], b = tv[3 * t + 1], c = tv[3 * t + 2];
      const ax = X[2 * a] - px, ay = X[2 * a + 1] - py, bx = X[2 * b] - px, by = X[2 * b + 1] - py, cx2 = X[2 * c] - px, cy2 = X[2 * c + 1] - py;
      return (ax * ax + ay * ay) * (bx * cy2 - cx2 * by) - (bx * bx + by * by) * (ax * cy2 - cx2 * ay) + (cx2 * cx2 + cy2 * cy2) * (ax * by - bx * ay) > 1e-12;
    };
    // 空间排序：网格蛇形，增强局部性
    const ord = new Array(n); for (let i = 0; i < n; i++) ord[i] = i;
    const cs = Math.max(R / 10 / Math.sqrt(n / 4 + 1), 1e-6) * 3;
    const key = i => { const gx = Math.floor((X[2 * i] - x0) / cs), gy = Math.floor((X[2 * i + 1] - y0) / cs); return gy * 1e6 + ((gy & 1) ? (1e6 - 1 - gx) : gx); };
    const keys = new Float64Array(n); for (let i = 0; i < n; i++) keys[i] = key(i);
    ord.sort((a, b) => keys[a] - keys[b]);
    for (let oi = 0; oi < n; oi++) {
      const p = ord[oi], px = X[2 * p], py = X[2 * p + 1];
      // 点定位
      let t = last; if (!alive[t]) { t = alive.lastIndexOf(1); }
      let guard = 0, found = false;
      while (guard++ < 20000) {
        let moved = false;
        for (let k = 0; k < 3; k++) {
          const a = tv[3 * t + (k + 1) % 3], b = tv[3 * t + (k + 2) % 3];
          if (orient(a, b, px, py) < -1e-12) { const nb = tn[3 * t + k]; if (nb >= 0) { t = nb; moved = true; break; } }
        }
        if (!moved) { found = true; break; }
      }
      if (!found) { t = -1; for (let q = 0; q < alive.length; q++) if (alive[q] && inCircle(q, px, py)) { t = q; break; } if (t < 0) continue; }
      stamp++;
      const stack = [t]; badS[t] = stamp; const bad = [t]; const bedges = [];
      while (stack.length) {
        const cur = stack.pop();
        for (let k = 0; k < 3; k++) {
          const nb = tn[3 * cur + k];
          if (nb >= 0) {
            if (badS[nb] === stamp) continue;
            if (goodS[nb] !== stamp && inCircle(nb, px, py)) { badS[nb] = stamp; bad.push(nb); stack.push(nb); continue; }
            goodS[nb] = stamp;
          }
          bedges.push(tv[3 * cur + (k + 1) % 3], tv[3 * cur + (k + 2) % 3], nb);
        }
      }
      for (const b of bad) alive[b] = 0;
      const byU = new Map(), byW = new Map(); const newT = [];
      for (let e = 0; e < bedges.length; e += 3) {
        const u = bedges[e], w = bedges[e + 1], out = bedges[e + 2];
        const nt = tv.length / 3; tv.push(u, w, p); tn.push(-1, -1, out); alive.push(1); badS.push(0); goodS.push(0);
        if (out >= 0) { for (let k = 0; k < 3; k++) { if (tn[3 * out + k] >= 0 && badS[tn[3 * out + k]] === stamp && !alive[tn[3 * out + k]]) { const a = tv[3 * out + (k + 1) % 3], b = tv[3 * out + (k + 2) % 3]; if ((a === w && b === u)) { tn[3 * out + k] = nt; break; } } } }
        byU.set(u, nt); byW.set(w, nt); newT.push(nt);
      }
      for (const nt of newT) { const w = tv[3 * nt + 1], u = tv[3 * nt]; const a = byU.get(w); const b = byW.get(u); tn[3 * nt] = a !== undefined ? a : -1; tn[3 * nt + 1] = b !== undefined ? b : -1; }
      last = newT[0];
    }
    const out = [];
    for (let t = 0; t < alive.length; t++) { if (!alive[t]) continue; const a = tv[3 * t], b = tv[3 * t + 1], c = tv[3 * t + 2]; if (a >= n || b >= n || c >= n) continue; out.push(a, b, c); }
    return out;
  }
  Mesh.delaunay = delaunay;

  // ---------- 轮廓 → 2D 三角网格 ----------
  // polys: flat 多边形数组（非零缠绕）；返回 mesh {pos(x,y,0), idx, loops, bd}
  Mesh.tessellate = (polys, spacing, opts = {}) => {
    polys = G.resolve(polys);
    if (!polys.length) return Mesh.make(new Float32Array(0), new Uint32Array(0), { dim: 2, loops: [] });
    const bb = G.polysBBox(polys); const size = Math.max(bb[2] - bb[0], bb[3] - bb[1], 1e-3);
    const s = spacing > 0 ? spacing : size / 28;
    const pts = [];
    for (const poly of polys) {
      const n = poly.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n; const ax = poly[2 * i], ay = poly[2 * i + 1], bx = poly[2 * j], by = poly[2 * j + 1];
        pts.push(ax, ay); const L = Math.hypot(bx - ax, by - ay); const k = Math.floor(L / (s * 1.15));
        for (let q = 1; q <= k; q++) { const t = q / (k + 1); pts.push(ax + (bx - ax) * t, ay + (by - ay) * t); }
      }
    }
    const nb = pts.length / 2;
    // 边界点网格
    const cell = s; const grid = new Map(); const gk = (x, y) => Math.floor(x / cell) + ',' + Math.floor(y / cell);
    for (let i = 0; i < nb; i++) { const k = gk(pts[2 * i], pts[2 * i + 1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
    const minD = s * 0.62; const dy = s * 0.866;
    let row = 0;
    for (let y = bb[1] + dy * 0.5; y < bb[3]; y += dy, row++) {
      for (let x = bb[0] + (row & 1 ? s * 0.5 : 0) + s * 0.25; x < bb[2]; x += s) {
        if (!G.windingAt(x, y, polys)) continue;
        const cx = Math.floor(x / cell), cy = Math.floor(y / cell); let ok = true;
        for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1 && ok; b++) { const l = grid.get((cx + a) + ',' + (cy + b)); if (l) for (const id of l) { if (Math.hypot(pts[2 * id] - x, pts[2 * id + 1] - y) < minD) { ok = false; break; } } }
        if (ok) { // 与边的真实距离
          for (const poly of polys) { if (G.distToPoly(x, y, poly, true) < minD) { ok = false; break; } }
        }
        if (ok) pts.push(x, y);
      }
    }
    const n = pts.length / 2;
    const tri = delaunay(Float64Array.from(pts), n);
    const idx = [];
    for (let t = 0; t < tri.length; t += 3) {
      const a = tri[t], b = tri[t + 1], c = tri[t + 2];
      const gx = (pts[2 * a] + pts[2 * b] + pts[2 * c]) / 3, gy = (pts[2 * a + 1] + pts[2 * b + 1] + pts[2 * c + 1]) / 3;
      if (!G.windingAt(gx, gy, polys)) continue;
      idx.push(a, b, c);
    }
    const pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[3 * i] = pts[2 * i]; pos[3 * i + 1] = pts[2 * i + 1]; }
    const mesh = Mesh.make(pos, Uint32Array.from(idx), { dim: 2 });
    Mesh.fixOrient2D(mesh);
    mesh.loops = Mesh.boundaryLoops(mesh);
    return mesh;
  };
  // 保证三角形在 xy 平面为逆时针（数学意义）
  Mesh.fixOrient2D = mesh => {
    const p = mesh.pos, I = mesh.idx;
    for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; const o = (p[3 * b] - p[3 * a]) * (p[3 * c + 1] - p[3 * a + 1]) - (p[3 * b + 1] - p[3 * a + 1]) * (p[3 * c] - p[3 * a]); if (o < 0) { I[t + 1] = c; I[t + 2] = b; } }
  };
  // 从网格提取边界环（定向边，内部在左侧）
  Mesh.boundaryLoops = mesh => {
    const I = mesh.idx; const e = new Map();
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3]; e.set(a + ',' + b, [a, b]); }
    const next = new Map();
    for (const [k, [a, b]] of e) { if (!e.has(b + ',' + a)) { if (!next.has(a)) next.set(a, []); next.get(a).push(b); } }
    const loops = []; const used = new Set();
    const p = mesh.pos;
    for (const [a0, list0] of next) {
      for (const b0 of list0) {
        if (used.has(a0 + ',' + b0)) continue;
        const loop = [a0]; let a = a0, b = b0; let guard = 0;
        while (guard++ < 200000) {
          used.add(a + ',' + b);
          if (b === a0) break;
          loop.push(b);
          const cand = (next.get(b) || []).filter(c => !used.has(b + ',' + c));
          if (!cand.length) break;
          let nb = cand[0];
          if (cand.length > 1) { // 取最左转
            const ain = Math.atan2(p[3 * b + 1] - p[3 * a + 1], p[3 * b] - p[3 * a]); let bt = -Infinity;
            for (const c of cand) { let tr = Math.atan2(p[3 * c + 1] - p[3 * b + 1], p[3 * c] - p[3 * b]) - ain; while (tr > Math.PI) tr -= 2 * Math.PI; while (tr <= -Math.PI) tr += 2 * Math.PI; if (tr > bt) { bt = tr; nb = c; } }
          }
          a = b; b = nb;
        }
        if (loop.length >= 3) loops.push(loop);
      }
    }
    return loops;
  };

  // ---------- 法线 ----------
  Mesh.computeNormals = mesh => {
    const p = mesh.pos, I = mesh.idx; const n = new Float32Array(p.length);
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      n[a] += nx; n[a + 1] += ny; n[a + 2] += nz; n[b] += nx; n[b + 1] += ny; n[b + 2] += nz; n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
    }
    for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
    mesh.nrm = n; return mesh;
  };
  Mesh.bounds = mesh => {
    if (mesh._bb) return mesh._bb; const p = mesh.pos; let b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { if (p[i + k] < b[k]) b[k] = p[i + k]; if (p[i + k] > b[3 + k]) b[3 + k] = p[i + k]; }
    if (b[0] === Infinity) b = [0, 0, 0, 0, 0, 0]; mesh._bb = b; return b;
  };
  Mesh.signedVolume = mesh => { const p = mesh.pos, I = mesh.idx; let v = 0; for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3; v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6; } return v; };

  // ---------- 挤出 ----------
  // src: 2D 网格(含 loops)。opts: {depth, bevel, bevelSeg, depthSeg}
  Mesh.extrude = (src, opts) => {
    const depth = Math.max(0.001, opts.depth), nbv = Math.max(0, Math.round(opts.bevelSeg === undefined ? 2 : opts.bevelSeg));
    let bevel = Math.max(0, opts.bevel || 0); bevel = Math.min(bevel, depth * 0.5 - 1e-4);
    if (nbv === 0) bevel = 0;
    const depthSeg = Math.max(1, Math.round(opts.depthSeg || 1));
    const sp = src.pos, nv = sp.length / 3;
    const loops = src.loops && src.loops.length ? src.loops : Mesh.boundaryLoops(src);
    const P = [], N = [], I = [];
    // 边界顶点 inset 向量
    const inset = new Float32Array(nv * 2); const isB = new Uint8Array(nv);
    const loopData = loops.map(loop => {
      const m = loop.length; const nrm = [], dir = [];
      for (let k = 0; k < m; k++) { const a = loop[k], b = loop[(k + 1) % m]; const dx = sp[3 * b] - sp[3 * a], dy = sp[3 * b + 1] - sp[3 * a + 1]; const l = Math.hypot(dx, dy) || 1; dir.push([dx / l, dy / l]); nrm.push([dy / l, -dx / l]); }
      const vin = []; const corner = [];
      for (let k = 0; k < m; k++) {
        const e0 = nrm[(k - 1 + m) % m], e1 = nrm[k]; let mx = e0[0] + e1[0], my = e0[1] + e1[1]; const ml = Math.hypot(mx, my);
        const dt = e0[0] * e1[0] + e0[1] * e1[1];
        corner.push(dt < 0.82);
        if (ml < 1e-6) { vin.push([-e1[0], -e1[1]]); } else { mx /= ml; my /= ml; const c = Math.max(mx * e1[0] + my * e1[1], 0.4); vin.push([-mx / c, -my / c]); }
        isB[loop[k]] = 1; inset[2 * loop[k]] = vin[k][0]; inset[2 * loop[k] + 1] = vin[k][1];
      }
      return { loop, nrm, vin, corner, m };
    });
    // 轮廓（环）顶点环：每个 (k, ring, side)
    const profile = []; // {ins, z, side?}
    const D = depth;
    if (bevel > 0) for (let k = 0; k <= nbv; k++) { const phi = k / nbv * Math.PI / 2; profile.push({ ins: bevel * (1 - Math.sin(phi)), z: bevel * (1 - Math.cos(phi)) }); }
    else profile.push({ ins: 0, z: 0 });
    const zs0 = bevel > 0 ? bevel : 0, zs1 = bevel > 0 ? D - bevel : D;
    for (let r = 1; r < depthSeg; r++) profile.push({ ins: 0, z: zs0 + (zs1 - zs0) * r / depthSeg });
    if (bevel > 0) for (let k = nbv; k >= 0; k--) { const phi = k / nbv * Math.PI / 2; profile.push({ ins: bevel * (1 - Math.sin(phi)), z: D - bevel * (1 - Math.cos(phi)) }); }
    else profile.push({ ins: 0, z: D });
    // 去除重复环（z 相同且 ins 相同）
    const prof = []; for (const pr of profile) { const l = prof[prof.length - 1]; if (l && Math.abs(l.z - pr.z) < 1e-6 && Math.abs(l.ins - pr.ins) < 1e-6) continue; prof.push(pr); }
    const nr = prof.length;
    // 盖面：顶点 inset 映射
    const bd = new Float32Array(nv).fill(1e9), nearB = new Int32Array(nv).fill(-1);
    if (bevel > 0) {
      const Dd = bevel * 3;
      const bpos = []; for (const ld of loopData) for (const v of ld.loop) bpos.push(v);
      for (let i = 0; i < nv; i++) {
        if (isB[i]) { bd[i] = 0; nearB[i] = i; continue; }
        let best = 1e18, bi = -1; const x = sp[3 * i], y = sp[3 * i + 1];
        for (const j of bpos) { const dx = sp[3 * j] - x, dy = sp[3 * j + 1] - y; const d = dx * dx + dy * dy; if (d < best) { best = d; bi = j; } }
        bd[i] = Math.sqrt(best); nearB[i] = bi;
      }
      var capPos = (i, z) => { const x = sp[3 * i], y = sp[3 * i + 1]; if (bd[i] >= Dd) return [x, y, z]; const f = bevel * (1 - bd[i] / Dd); const j = nearB[i]; return [x + inset[2 * j] * f, y + inset[2 * j + 1] * f, z]; };
    } else capPos = (i, z) => [sp[3 * i], sp[3 * i + 1], z];
    // 前盖（朝 -z）与后盖（朝 +z）
    const baseF = P.length / 3;
    for (let i = 0; i < nv; i++) { const q = capPos(i, 0); P.push(q[0], q[1], q[2]); N.push(0, 0, -1); }
    const baseB = P.length / 3;
    for (let i = 0; i < nv; i++) { const q = capPos(i, D); P.push(q[0], q[1], q[2]); N.push(0, 0, 1); }
    for (let t = 0; t < src.idx.length; t += 3) {
      const a = src.idx[t], b = src.idx[t + 1], c = src.idx[t + 2];
      I.push(baseF + a, baseF + c, baseF + b);
      I.push(baseB + a, baseB + b, baseB + c);
    }
    // 侧壁（含倒角）
    for (const ld of loopData) {
      const { loop, m, corner } = ld;
      // 顶点 id: vid[k][r][side] side0=进入边末端(属于边k-1), side1=离开边起点(属于边k)
      const vid = [];
      for (let k = 0; k < m; k++) {
        const base = loop[k]; vid.push([]);
        for (let r = 0; r < nr; r++) {
          const pr = prof[r]; const x = sp[3 * base] + ld.vin[k][0] * pr.ins, y = sp[3 * base + 1] + ld.vin[k][1] * pr.ins;
          const a = P.length / 3; P.push(x, y, pr.z); N.push(0, 0, 0);
          if (corner[k]) { const b = P.length / 3; P.push(x, y, pr.z); N.push(0, 0, 0); vid[k].push([a, b]); } else vid[k].push([a, a]);
        }
      }
      for (let k = 0; k < m; k++) {
        const k2 = (k + 1) % m;
        for (let r = 0; r < nr - 1; r++) {
          const A0 = vid[k][r][1], B0 = vid[k2][r][0], A1 = vid[k][r + 1][1], B1 = vid[k2][r + 1][0];
          I.push(A0, B0, B1, A0, B1, A1);
        }
      }
    }
    const mesh = Mesh.make(new Float32Array(P), new Uint32Array(I), { dim: 3, solid: true, srcLoops: loops });
    Mesh.computeNormals(mesh);
    // 盖面法线保持平直
    for (let i = 0; i < nv; i++) { mesh.nrm[3 * (baseF + i) + 2] = -1; mesh.nrm[3 * (baseF + i)] = 0; mesh.nrm[3 * (baseF + i) + 1] = 0; mesh.nrm[3 * (baseB + i) + 2] = 1; mesh.nrm[3 * (baseB + i)] = 0; mesh.nrm[3 * (baseB + i) + 1] = 0; }
    if (Mesh.signedVolume(mesh) < 0) { const ix = mesh.idx; for (let t = 0; t < ix.length; t += 3) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; } Mesh.computeNormals(mesh); for (let i = 0; i < nv; i++) { mesh.nrm[3 * (baseF + i) + 2] = -1; mesh.nrm[3 * (baseB + i) + 2] = 1; } }
    return mesh;
  };

  // 合并网格
  Mesh.merge = list => {
    list = list.filter(m => m && m.pos.length);
    let nv = 0, ni = 0; for (const m of list) { nv += m.pos.length; ni += m.idx.length; }
    const pos = new Float32Array(nv), idx = new Uint32Array(ni), nrm = new Float32Array(nv);
    let vo = 0, io = 0, hasN = true;
    for (const m of list) { pos.set(m.pos, vo); if (m.nrm) nrm.set(m.nrm, vo); else hasN = false; for (let i = 0; i < m.idx.length; i++) idx[io + i] = m.idx[i] + vo / 3; vo += m.pos.length; io += m.idx.length; }
    const r = Mesh.make(pos, idx, { dim: 3, solid: list.every(m => m.solid) });
    if (hasN) r.nrm = nrm; else Mesh.computeNormals(r);
    return r;
  };
  // 矩阵变换（列主序 4x4）
  Mesh.transform = (mesh, m) => {
    const p = mesh.pos, n = mesh.nrm; const np = new Float32Array(p.length); const nn = n ? new Float32Array(n.length) : null;
    const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
    const inv = U.M.invert(m);
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      np[i] = m[0] * x + m[4] * y + m[8] * z + m[12]; np[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; np[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      if (nn) { const a = n[i], b = n[i + 1], c = n[i + 2]; const rx = inv[0] * a + inv[1] * b + inv[2] * c, ry = inv[4] * a + inv[5] * b + inv[6] * c, rz = inv[8] * a + inv[9] * b + inv[10] * c; const l = Math.hypot(rx, ry, rz) || 1; nn[i] = rx / l; nn[i + 1] = ry / l; nn[i + 2] = rz / l; }
    }
    let idx = mesh.idx; if (det < 0) { idx = Uint32Array.from(mesh.idx); for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; } }
    const r = Mesh.make(np, idx, { dim: mesh.dim, solid: mesh.solid, loops: mesh.loops, bd: mesh.bd }); r.nrm = nn; return r;
  };
  // 复制位置（保持拓扑），用于变形
  Mesh.cloneTopo = mesh => { const r = Mesh.make(new Float32Array(mesh.pos), mesh.idx, { dim: mesh.dim, solid: mesh.solid, loops: mesh.loops, srcLoops: mesh.srcLoops }); r.topoId = mesh.topoId || mesh.uid; return r; };

  // 表面积采样：返回 {cum, total}
  Mesh.areaTable = mesh => {
    if (mesh._area) return mesh._area; const p = mesh.pos, I = mesh.idx; const cum = new Float64Array(I.length / 3); let tot = 0;
    for (let t = 0, k = 0; t < I.length; t += 3, k++) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3; const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]; tot += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx); cum[k] = tot; }
    mesh._area = { cum, total: tot }; return mesh._area;
  };
  // 在表面按随机数取点：返回 {p:[x,y,z], n:[..], tri}
  Mesh.samplePoint = (mesh, r1, r2, r3) => {
    const at = Mesh.areaTable(mesh); if (!at.total) return null;
    const target = r1 * at.total; let lo = 0, hi = at.cum.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (at.cum[mid] < target) lo = mid + 1; else hi = mid; }
    const t = lo * 3, I = mesh.idx, p = mesh.pos; const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    let u = r2, v = r3; if (u + v > 1) { u = 1 - u; v = 1 - v; } const w = 1 - u - v;
    const pt = [p[a] * w + p[b] * u + p[c] * v, p[a + 1] * w + p[b + 1] * u + p[c + 1] * v, p[a + 2] * w + p[b + 2] * u + p[c + 2] * v];
    let nrm; if (mesh.nrm) { const n = mesh.nrm; nrm = [n[a] * w + n[b] * u + n[c] * v, n[a + 1] * w + n[b + 1] * u + n[c + 1] * v, n[a + 2] * w + n[b + 2] * u + n[c + 2] * v]; const l = Math.hypot(...nrm) || 1; nrm = nrm.map(x => x / l); }
    else { const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]; nrm = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; const l = Math.hypot(...nrm) || 1; nrm = nrm.map(x => x / l); }
    return { p: pt, n: nrm, tri: lo, bary: [w, u, v] };
  };
  // 射线求交（Möller–Trumbore），返回 t 或 -1
  Mesh.raycast = (mesh, o, d, maxT = Infinity) => {
    const p = mesh.pos, I = mesh.idx; let best = maxT, bt = -1;
    const bb = Mesh.bounds(mesh);
    // 射线-AABB
    let tmin = 0, tmax = best;
    for (let k = 0; k < 3; k++) { if (Math.abs(d[k]) < 1e-12) { if (o[k] < bb[k] || o[k] > bb[3 + k]) return -1; } else { let t1 = (bb[k] - o[k]) / d[k], t2 = (bb[3 + k] - o[k]) / d[k]; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return -1; } }
    let hitTri = -1;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2], e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) continue; const inv = 1 / det;
      const tx = o[0] - p[a], ty = o[1] - p[a + 1], tz = o[2] - p[a + 2]; const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x; const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < 0 || u + v > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * inv; if (tt > 1e-6 && tt < best) { best = tt; bt = tt; hitTri = t / 3; }
    }
    return bt < 0 ? -1 : bt;
  };
})();
