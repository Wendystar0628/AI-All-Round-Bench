/* ============================================================
   geom3d.js — 挤出实体 / 网格变形 / 拾取
   网格结构： { positions:[x,y,z...], normals:[...], indices:[...], uvs:[...] }
   ============================================================ */
(function (global) {
  const AE = global.AE = global.AE || {};
  const U = AE.util;
  const G = AE.geom = {};

  G.emptyMesh = () => ({ positions: [], normals: [], indices: [], uvs: [] });

  /* ---------------- 多边形内缩 ---------------- */
  function insetContour(pts, d, hole) {
    const n = pts.length;
    if (n < 3) return pts.slice();
    const sign = hole ? -1 : 1;
    const area = signedArea(pts);
    const orient = area >= 0 ? 1 : -1;
    const s = sign * orient;
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      const n1 = edgeNormal(a, p, s), n2 = edgeNormal(p, b, s);
      let mx = n1[0] + n2[0], my = n1[1] + n2[1];
      const l = Math.hypot(mx, my);
      if (l < 1e-9) { mx = n2[0]; my = n2[1]; }
      else {
        mx /= l; my /= l;
        const cosHalf = mx * n2[0] + my * n2[1];
        const scale = Math.min(4, 1 / Math.max(cosHalf, 0.3));
        mx *= scale; my *= scale;
      }
      out.push([p[0] + mx * d, p[1] + my * d]);
    }
    return out;
  }
  function edgeNormal(a, b, s) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l * s, dx / l * s];
  }
  function signedArea(pts) {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
    return a / 2;
  }
  G.signedArea = signedArea;

  /* ---------------- 挤出 ---------------- */
  /**
   * contours: [{pts:[[x,y]...], hole:bool}]
   * opts: { depth, bevel, bevelSegments }
   */
  G.extrude = function (contours, opts) {
    opts = opts || {};
    const depth = opts.depth === undefined ? 100 : opts.depth;
    const bevel = Math.max(0, opts.bevel || 0);
    const mesh = G.emptyMesh();
    if (!contours.length || depth <= 0) return mesh;

    // 归一化：外轮廓与孔洞分组
    const outers = contours.filter(c => !c.hole);
    const holes = contours.filter(c => c.hole);
    const groups = [];
    for (const o of outers) {
      const mine = holes.filter(h => {
        const c = centroid(h.pts);
        return AE.path.containsPoint(o.pts, c);
      });
      groups.push({ outer: o, holes: mine });
    }
    // 没有外轮廓时（例如只有孔）跳过
    for (const grp of groups) {
      const o = grp.outer.pts;
      const all = [{ pts: o, hole: false }].concat(grp.holes.map(h => ({ pts: h.pts, hole: true })));
      const hd = depth / 2;
      const rings = [];
      if (bevel > 0.001) {
        const insetO = insetContour(o, bevel, false);
        const insetH = grp.holes.map(h => insetContour(h.pts, -bevel, true));
        const ringSets = [];
        const mk = (contourPts, z) => contourPts.map(p => [p[0], p[1], z]);
        ringSets.push({ pts: mk(o, -hd + bevel), contour: o });
        ringSets.push({ pts: mk(o, hd - bevel), contour: o });
        ringSets.push({ pts: mk(insetO, hd), contour: insetO });
        ringSets.push({ pts: mk(insetO, -hd), contour: insetO });
        rings.push(ringSets);
        grp.holeRings = grp.holes.map(h => {
          const ip = insetContour(h.pts, -bevel, true);
          return [
            { pts: h.pts.map(p => [p[0], p[1], -hd + bevel]) },
            { pts: h.pts.map(p => [p[0], p[1], hd - bevel]) },
            { pts: ip.map(p => [p[0], p[1], hd]) },
            { pts: ip.map(p => [p[0], p[1], -hd]) }
          ];
        });
      } else {
        rings.push([{ pts: o.map(p => [p[0], p[1], -hd]) }, { pts: o.map(p => [p[0], p[1], hd]) }]);
        grp.holeRings = grp.holes.map(h => [
          { pts: h.pts.map(p => [p[0], p[1], -hd]) },
          { pts: h.pts.map(p => [p[0], p[1], hd]) }
        ]);
      }

      // ---- 端盖 ----
      const capTop = bevel > 0.001 ? insetContour(o, bevel, false) : o;
      const capHolesTop = bevel > 0.001 ? grp.holes.map(h => insetContour(h.pts, -bevel, true)) : grp.holes.map(h => h.pts);
      addCap(mesh, capTop, capHolesTop, hd, 1);
      const capBot = bevel > 0.001 ? insetContour(o, bevel, false) : o;
      const capHolesBot = bevel > 0.001 ? grp.holes.map(h => insetContour(h.pts, -bevel, true)) : grp.holes.map(h => h.pts);
      addCap(mesh, capBot, capHolesBot, -hd, -1);

      // ---- 侧壁 ----
      const ringList = rings[0];
      for (let r = 0; r + 1 < ringList.length; r++) {
        addWall(mesh, ringList[r].pts, ringList[r + 1].pts);
        if (grp.holeRings.length) {
          for (const hr of grp.holeRings) addWall(mesh, hr[r].pts, hr[r + 1].pts, true);
        }
      }
    }
    G.computeNormals(mesh);
    return mesh;
  };

  function centroid(pts) {
    let x = 0, y = 0;
    for (const p of pts) { x += p[0]; y += p[1]; }
    return [x / pts.length, y / pts.length];
  }

  function addCap(mesh, outer, holes, z, dir) {
    const contours = [{ pts: outer, hole: false }].concat(holes.map(h => ({ pts: h, hole: true })));
    const tri = AE.path.triangulate(contours);
    const base = mesh.positions.length / 3;
    for (let i = 0; i < tri.verts.length; i += 2) {
      mesh.positions.push(tri.verts[i], tri.verts[i + 1], z);
      mesh.normals.push(0, 0, dir);
      mesh.uvs.push(tri.verts[i] * 0.01, tri.verts[i + 1] * 0.01);
    }
    for (const idx of tri.indices) {
      if (dir > 0) mesh.indices.push(base + idx);
      else mesh.indices.push(base + idx);
    }
  }

  function addWall(mesh, a, b, reverse) {
    const base = mesh.positions.length / 3;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      mesh.positions.push(a[i][0], a[i][1], a[i][2]);
      mesh.normals.push(0, 0, 0);
      mesh.uvs.push(i / n, 0);
    }
    for (let i = 0; i < n; i++) {
      mesh.positions.push(b[i][0], b[i][1], b[i][2]);
      mesh.normals.push(0, 0, 0);
      mesh.uvs.push(i / n, 1);
    }
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      const t0 = base + i, t1 = base + i2, t2 = base + n + i, t3 = base + n + i2;
      if (reverse) {
        mesh.indices.push(t0, t2, t1, t1, t2, t3);
      } else {
        mesh.indices.push(t0, t1, t2, t1, t3, t2);
      }
    }
  }

  /** 平滑法线（按位置合并） */
  G.computeNormals = function (mesh) {
    const n = mesh.positions.length / 3;
    const acc = new Float32Array(n * 3);
    const idx = mesh.indices;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const ux = mesh.positions[b] - mesh.positions[a];
      const uy = mesh.positions[b + 1] - mesh.positions[a + 1];
      const uz = mesh.positions[b + 2] - mesh.positions[a + 2];
      const vx = mesh.positions[c] - mesh.positions[a];
      const vy = mesh.positions[c + 1] - mesh.positions[a + 1];
      const vz = mesh.positions[c + 2] - mesh.positions[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { acc[k] += nx; acc[k + 1] += ny; acc[k + 2] += nz; }
    }
    for (let i = 0; i < n; i++) {
      const l = Math.hypot(acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]) || 1;
      mesh.normals[i * 3] = acc[i * 3] / l;
      mesh.normals[i * 3 + 1] = acc[i * 3 + 1] / l;
      mesh.normals[i * 3 + 2] = acc[i * 3 + 2] / l;
    }
    return mesh;
  };

  /* ---------------- 变形 ---------------- */
  /**
   * opts: { pins:[{x,y,z,rot,scale,falloff}], twist, bend, bendAxis, fields:[{field, strength}] }
   */
  G.deform = function (mesh, opts) {
    opts = opts || {};
    const pos = mesh.positions;
    const n = pos.length / 3;
    // 包围盒
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      x0 = Math.min(x0, pos[i * 3]); x1 = Math.max(x1, pos[i * 3]);
      y0 = Math.min(y0, pos[i * 3 + 1]); y1 = Math.max(y1, pos[i * 3 + 1]);
      z0 = Math.min(z0, pos[i * 3 + 2]); z1 = Math.max(z1, pos[i * 3 + 2]);
    }
    const hz = Math.max(1e-3, (z1 - z0));

    // 扭转（绕 Y 轴，随 Z 变化）
    if (opts.twist) {
      const rad = U.rad(opts.twist);
      for (let i = 0; i < n; i++) {
        const z = pos[i * 3 + 2];
        const t = (z - z0) / hz - 0.5;
        const ang = rad * t;
        const c = Math.cos(ang), s = Math.sin(ang);
        const px = pos[i * 3], py = pos[i * 3 + 1];
        pos[i * 3] = px * c - py * s;
        pos[i * 3 + 1] = px * s + py * c;
      }
    }
    // 弯曲
    if (opts.bend) {
      const amt = opts.bend;
      const axis = opts.bendAxis === 'y' ? 1 : 0;
      const len = axis ? (x1 - x0) : (y1 - y0);
      for (let i = 0; i < n; i++) {
        const p = axis ? pos[i * 3] : pos[i * 3 + 1];
        const t = (p - (axis ? x0 : y0)) / Math.max(1e-3, len) - 0.5;
        const d = amt * (t * t - 1 / 12) * len;
        if (axis) pos[i * 3 + 1] += d; else pos[i * 3] += d;
      }
    }
    // 图钉
    const pins = (opts.pins || []).filter(p => p.enabled !== false);
    if (pins.length) {
      const fallback = Math.max(60, Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 0.6);
      for (let i = 0; i < n; i++) {
        const vx = pos[i * 3], vy = pos[i * 3 + 1], vz = pos[i * 3 + 2];
        let wsum = 0, dx = 0, dy = 0, dzs = 0, rotW = 0, scaleW = 0;
        for (const pin of pins) {
          const r = pin.falloff || fallback;
          const d = Math.hypot(vx - pin.x, vy - pin.y, (vz - (pin.z === undefined ? 0 : pin.z)) * 0.6);
          if (d > r * 1.6) continue;
          const w = Math.exp(-(d * d) / (2 * (r * 0.55) * (r * 0.55)));
          if (w < 1e-3) continue;
          wsum += w;
          // 该图钉对顶点的目标位置
          const rot = U.rad(pin.rot || 0), sc = pin.scale === undefined ? 1 : pin.scale;
          const ox = vx - pin.x, oy = vy - pin.y;
          const c = Math.cos(rot), s = Math.sin(rot);
          const rx = (ox * c - oy * s) * sc, ry = (ox * s + oy * c) * sc;
          dx += w * (pin.x + rx - vx);
          dy += w * (pin.y + ry - vy);
          dzs += w * ((pin.z || 0) - vz);
          rotW += w * rot; scaleW += w * sc;
        }
        if (wsum > 1e-6) {
          const k = 1 / wsum;
          pos[i * 3] = vx + dx * k;
          pos[i * 3 + 1] = vy + dy * k;
          pos[i * 3 + 2] = vz + dzs * k * 0.6;
        }
      }
    }
    // 场
    if (opts.fields && opts.fields.length) {
      for (const fb of opts.fields) {
        const f = fb.field;
        if (!f || !f.enabled) continue;
        for (let i = 0; i < n; i++) {
          const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
          const d = AE.fields.sample(f, p);
          pos[i * 3] += d[0] * (fb.strength === undefined ? 1 : fb.strength);
          pos[i * 3 + 1] += d[1] * (fb.strength === undefined ? 1 : fb.strength);
          pos[i * 3 + 2] += d[2] * (fb.strength === undefined ? 1 : fb.strength);
        }
      }
    }
    G.computeNormals(mesh);
    return mesh;
  };

  /* ---------------- 射线拾取 ---------------- */
  G.raycast = function (mesh, origin, dir) {
    const p = mesh.positions, idx = mesh.indices;
    let best = null;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
      const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
      const hx = dir[1] * e2z - dir[2] * e2y, hy = dir[2] * e2x - dir[0] * e2z, hz = dir[0] * e2y - dir[1] * e2x;
      const det = e1x * hx + e1y * hy + e1z * hz;
      if (Math.abs(det) < 1e-9) continue;
      const inv = 1 / det;
      const sx = origin[0] - p[a], sy = origin[1] - p[a + 1], sz = origin[2] - p[a + 2];
      const u = (sx * hx + sy * hy + sz * hz) * inv;
      if (u < -1e-6 || u > 1 + 1e-6) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * inv;
      if (v < -1e-6 || u + v > 1 + 1e-6) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 1e-4 && (!best || t < best.t)) {
        const pt = [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
        const nrm = [
          (p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[b + 1] - p[a + 1]) * (p[c] - p[a]),
          (p[b + 1] - p[a + 1]) * (p[c] - p[a + 2]) - (p[b + 2] - p[a + 2]) * (p[c] - p[a]),
          (p[b + 2] - p[a + 2]) * (p[c] - p[a]) - (p[b] - p[a]) * (p[c + 1] - p[a + 1])
        ];
        const l = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
        best = { t, point: pt, normal: [nrm[0] / l, nrm[1] / l, nrm[2] / l], tri: i / 3 };
      }
    }
    return best;
  };

  /** 平面网格（地面 / 背板） */
  G.plane = function (w, h, segX, segY) {
    segX = segX || 1; segY = segY || 1;
    const mesh = G.emptyMesh();
    for (let j = 0; j <= segY; j++) {
      for (let i = 0; i <= segX; i++) {
        mesh.positions.push(-w / 2 + w * i / segX, -h / 2 + h * j / segY, 0);
        mesh.normals.push(0, 0, 1);
        mesh.uvs.push(i / segX, j / segY);
      }
    }
    for (let j = 0; j < segY; j++) {
      for (let i = 0; i < segX; i++) {
        const a = j * (segX + 1) + i, b = a + 1, c = a + segX + 1, d = c + 1;
        mesh.indices.push(a, b, c, b, d, c);
      }
    }
    return mesh;
  };

  /** 盒体 */
  G.box = function (w, h, d) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    return G.extrude([{ pts, hole: false }], { depth: d * 2, bevel: 0 });
  };

  /** 变换网格 */
  G.transform = function (mesh, mat) {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const p = U.mat4.xformPoint(mat, [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]]);
      mesh.positions[i] = p[0]; mesh.positions[i + 1] = p[1]; mesh.positions[i + 2] = p[2];
    }
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const p = U.mat4.xformDir(mat, [mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]]);
      const l = Math.hypot(p[0], p[1], p[2]) || 1;
      mesh.normals[i] = p[0] / l; mesh.normals[i + 1] = p[1] / l; mesh.normals[i + 2] = p[2] / l;
    }
    return mesh;
  };
})(window);
