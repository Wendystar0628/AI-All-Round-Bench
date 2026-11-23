// 粒子模拟：固定步长、确定性（哈希随机）、检查点缓存；几何表面/曲线/点发射，力场，网格碰撞与次级发射，轨迹拖尾
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const V = (p, t) => MF.Eval.val(p, t);
  const TR = 20;            // 每个粒子保存的轨迹取样数
  const CK = 24;            // 每隔多少步存一个检查点
  const sims = new Map();   // layerId → { sig, ck:Map, cur, rate }

  function newState(cap, nEm) {
    return { n: 0, cap, step: 0, head: 0, px: new Float32Array(cap), py: new Float32Array(cap), pz: new Float32Array(cap), vx: new Float32Array(cap), vy: new Float32Array(cap), vz: new Float32Array(cap),
      age: new Float32Array(cap), life: new Float32Array(cap), size: new Float32Array(cap), seed: new Uint32Array(cap), em: new Uint8Array(cap), flag: new Uint8Array(cap), tcount: new Uint8Array(cap),
      trail: new Float32Array(cap * TR * 3), emitAcc: new Float64Array(nEm), emitCount: new Uint32Array(nEm), subCount: 0 };
  }
  function cloneState(s) {
    const n = s.n, o = { n, cap: Math.max(64, n), step: s.step, head: s.head, subCount: s.subCount, emitAcc: s.emitAcc.slice(), emitCount: s.emitCount.slice() };
    for (const k of ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'age', 'life', 'size', 'seed', 'em', 'flag', 'tcount']) { const a = new s[k].constructor(o.cap); a.set(s[k].subarray(0, n)); o[k] = a; }
    o.trail = new Float32Array(o.cap * TR * 3); o.trail.set(s.trail.subarray(0, n * TR * 3));
    return o;
  }
  function grow(s, need) {
    if (need <= s.cap) return; const cap = Math.max(need, s.cap * 2);
    for (const k of ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'age', 'life', 'size', 'seed', 'em', 'flag', 'tcount']) { const a = new s[k].constructor(cap); a.set(s[k].subarray(0, s.n)); s[k] = a; }
    const tr = new Float32Array(cap * TR * 3); tr.set(s.trail.subarray(0, s.n * TR * 3)); s.trail = tr; s.cap = cap;
  }
  function kill(s, i) {
    const l = s.n - 1;
    if (i !== l) { for (const k of ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'age', 'life', 'size', 'seed', 'em', 'flag', 'tcount']) s[k][i] = s[k][l]; s.trail.copyWithin(i * TR * 3, l * TR * 3, (l + 1) * TR * 3); }
    s.n = l;
  }
  function spawn(s, x, y, z, vx, vy, vz, life, size, seed, em, flag, max) {
    if (s.n >= max) return -1; grow(s, s.n + 1); const i = s.n++;
    s.px[i] = x; s.py[i] = y; s.pz[i] = z; s.vx[i] = vx; s.vy[i] = vy; s.vz[i] = vz; s.age[i] = 0; s.life[i] = life; s.size[i] = size; s.seed[i] = seed; s.em[i] = em; s.flag[i] = flag; s.tcount[i] = 0;
    return i;
  }
  // 在以 d 为轴、半角 spread 的圆锥内取方向
  function cone(d, spreadDeg, r1, r2) {
    const cm = Math.cos(Math.min(180, Math.max(0, spreadDeg)) * MF.DEG), c = 1 - r1 * (1 - cm), sn = Math.sqrt(Math.max(0, 1 - c * c)), ph = r2 * Math.PI * 2;
    let ux, uy, uz; if (Math.abs(d[0]) < 0.8) { ux = 0; uy = -d[2]; uz = d[1]; } else { ux = -d[2]; uy = 0; uz = d[0]; }
    let l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
    const wx = d[1] * uz - d[2] * uy, wy = d[2] * ux - d[0] * uz, wz = d[0] * uy - d[1] * ux;
    const a = Math.cos(ph) * sn, b = Math.sin(ph) * sn;
    return [d[0] * c + ux * a + wx * b, d[1] * c + uy * a + wy * b, d[2] * c + uz * a + wz * b];
  }
  // ---------- 碰撞网格加速 ----------
  function gridOf(m) {
    if (m._grid) return m._grid;
    const bb = MF.Solid.bbox(m), nt = m.idx.length / 3; const pad = 1;
    const ex = [bb[3] - bb[0] + pad * 2, bb[4] - bb[1] + pad * 2, bb[5] - bb[2] + pad * 2];
    const target = MF.clamp(Math.cbrt(nt) * 1.6, 2, 40); const mx = Math.max(ex[0], ex[1], ex[2]);
    const res = ex.map((e) => Math.max(1, Math.min(40, Math.round((e / mx) * target))));
    const org = [bb[0] - pad, bb[1] - pad, bb[2] - pad], cs = [ex[0] / res[0], ex[1] / res[1], ex[2] / res[2]];
    const cells = new Array(res[0] * res[1] * res[2]); const p = m.pos, t = m.idx;
    for (let i = 0; i < nt; i++) {
      const a = t[i * 3] * 3, b = t[i * 3 + 1] * 3, c = t[i * 3 + 2] * 3; const lo = [0, 0, 0], hi = [0, 0, 0];
      for (let d = 0; d < 3; d++) { const mn = Math.min(p[a + d], p[b + d], p[c + d]), mxv = Math.max(p[a + d], p[b + d], p[c + d]); lo[d] = MF.clamp(Math.floor((mn - org[d]) / cs[d]), 0, res[d] - 1); hi[d] = MF.clamp(Math.floor((mxv - org[d]) / cs[d]), 0, res[d] - 1); }
      for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) { const k = (z * res[1] + y) * res[0] + x; (cells[k] = cells[k] || []).push(i); }
    }
    m._grid = { org, cs, res, cells, stamp: new Uint32Array(nt), sid: 0, bb };
    return m._grid;
  }
  // 线段 A→B 与网格 m1 的最近交点；m0 为上一步的同拓扑网格（用于表面运动）
  function hitMesh(m1, m0, ax, ay, az, bx, by, bz, maxDisp, out) {
    const g = gridOf(m1), p = m1.pos, t = m1.idx, q = m0 ? m0.pos : null;
    const lo = [0, 0, 0], hi = [0, 0, 0], A = [ax, ay, az], B = [bx, by, bz];
    for (let d = 0; d < 3; d++) { const mn = Math.min(A[d], B[d]) - maxDisp - 0.5, mx = Math.max(A[d], B[d]) + maxDisp + 0.5; if (mx < g.bb[d] - 1 || mn > g.bb[d + 3] + 1) return false; lo[d] = MF.clamp(Math.floor((mn - g.org[d]) / g.cs[d]), 0, g.res[d] - 1); hi[d] = MF.clamp(Math.floor((mx - g.org[d]) / g.cs[d]), 0, g.res[d] - 1); }
    const sid = ++g.sid; let best = 2, found = false;
    for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) {
      const cell = g.cells[(z * g.res[1] + y) * g.res[0] + x]; if (!cell) continue;
      for (let ci = 0; ci < cell.length; ci++) {
        const ti = cell[ci]; if (g.stamp[ti] === sid) continue; g.stamp[ti] = sid;
        const i0 = t[ti * 3] * 3, i1 = t[ti * 3 + 1] * 3, i2 = t[ti * 3 + 2] * 3;
        // 三角形在这一步内的位移（质心）
        let dx = 0, dy = 0, dz = 0;
        if (q) { dx = (p[i0] + p[i1] + p[i2] - q[i0] - q[i1] - q[i2]) / 3; dy = (p[i0 + 1] + p[i1 + 1] + p[i2 + 1] - q[i0 + 1] - q[i1 + 1] - q[i2 + 1]) / 3; dz = (p[i0 + 2] + p[i1 + 2] + p[i2 + 2] - q[i0 + 2] - q[i1 + 2] - q[i2 + 2]) / 3; }
        const ox = ax + dx, oy = ay + dy, oz = az + dz, rx = bx - ox, ry = by - oy, rz = bz - oz;
        const e1x = p[i1] - p[i0], e1y = p[i1 + 1] - p[i0 + 1], e1z = p[i1 + 2] - p[i0 + 2], e2x = p[i2] - p[i0], e2y = p[i2 + 1] - p[i0 + 1], e2z = p[i2 + 2] - p[i0 + 2];
        const hx = ry * e2z - rz * e2y, hy = rz * e2x - rx * e2z, hz = rx * e2y - ry * e2x; const det = e1x * hx + e1y * hy + e1z * hz;
        if (det > -1e-10 && det < 1e-10) continue; const inv = 1 / det;
        const sx = ox - p[i0], sy = oy - p[i0 + 1], sz = oz - p[i0 + 2]; const u = (sx * hx + sy * hy + sz * hz) * inv; if (u < -1e-4 || u > 1.0001) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x; const v = (rx * qx + ry * qy + rz * qz) * inv; if (v < -1e-4 || u + v > 1.0001) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv; if (tt < -1e-5 || tt > 1 || tt >= best) continue;
        best = tt; found = true;
        let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        if (nx * rx + ny * ry + nz * rz > 0) { nx = -nx; ny = -ny; nz = -nz; }
        out.t = tt; out.x = ox + rx * tt; out.y = oy + ry * tt; out.z = oz + rz * tt; out.nx = nx; out.ny = ny; out.nz = nz; out.dx = dx; out.dy = dy; out.dz = dz;
      }
    }
    return found;
  }
  function maxDisp(m1, m0) { if (!m0 || m0.pos.length !== m1.pos.length || m0 === m1) return 0; let mx = 0; const a = m1.pos, b = m0.pos; for (let i = 0; i < a.length; i += 3) { const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); if (d > mx) mx = d; } return mx; }

  function simSig(comp, L) {
    return MF.Scene.memo('psig' + L.id, 0, () => {
      const P = MF.Eval.project; const parts = [JSON.stringify(L.ps), L.in, L.out];
      const ns = MF.Nodes.upstreamOfLayer(comp, L.id); const term = MF.Nodes.terminalOf(comp, L.id); if (term) parts.push(JSON.stringify(term.in));
      const lids = new Set(); let anyExpr = /"x":/.test(parts[0]);
      for (const n of ns) { const js = JSON.stringify(n); parts.push(js); if (/"x":/.test(js)) anyExpr = true; for (const k of ['layer', 'follow']) if (n.s && n.s[k]) lids.add(n.s[k]); }
      const addL = (id, depth) => { const l = MF.Model.getLayer(comp, id); if (!l || depth > 16) return; const js = JSON.stringify(l); parts.push(js); if (/"x":/.test(js)) anyExpr = true; if (l.parent) addL(l.parent, depth + 1); };
      for (const id of lids) addL(id, 0);
      if (anyExpr) parts.push(JSON.stringify(P.comps.map((c) => ({ id: c.id, layers: c.layers.filter((l) => l.type !== 'audio'), nodes: c.nodes }))));
      return MF.Nodes.hash(parts.join('\u0002'));
    });
  }

  const hit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dx: 0, dy: 0, dz: 0 };
  const fo = [0, 0, 0, 0];
  function stepSim(sim, comp, L, s) {
    const rate = sim.rate, dt = 1 / rate, k = s.step, t0 = k * dt, t1 = (k + 1) * dt, ps = L.ps, pp = ps.p;
    const grav = V(pp.gravity, t1), wind = V(pp.wind, t1), drag = V(pp.drag, t1), fForce = V(pp.fieldForce, t1), bounce = V(pp.bounce, t1), fric = V(pp.friction, t1);
    const hitLife = V(pp.hitLife, t1), subN = V(pp.subCount, t1), subSpeed = V(pp.subSpeed, t1), subLife = V(pp.subLife, t1), subSize = V(pp.subSize, t1);
    const max = ps.s.maxCount || 6000, seed0 = ps.s.seed | 0;
    const in1 = MF.Nodes.partInputs(comp, L, t1); let in0 = null; const get0 = () => in0 || (in0 = MF.Nodes.partInputs(comp, L, t0));
    const fields = in1.fields, colliders = in1.collide;
    const forces = ps.forces.filter((f) => f.on !== false).map((f) => ({ pos: V(f.p.position, t1), str: V(f.p.strength, t1) * (f.s.kind === 'repel' ? -1 : 1), rad: Math.max(1, V(f.p.radius, t1)) }));
    const dragK = Math.exp(-drag * dt);
    // 碰撞体的上一步网格
    const col0 = colliders.length ? get0().collide : []; const disp = colliders.map((m, i) => maxDisp(m, col0[i]));
    const floor = ps.s.floor ? +ps.s.floorY : null;
    const n0 = s.n;
    for (let i = 0; i < n0; i++) {
      let x = s.px[i], y = s.py[i], z = s.pz[i], vx = s.vx[i], vy = s.vy[i], vz = s.vz[i];
      let ax = grav[0] + wind[0], ay = grav[1] + wind[1], az = (grav[2] || 0) + (wind[2] || 0);
      for (let f = 0; f < forces.length; f++) { const F = forces[f]; const dx = F.pos[0] - x, dy = F.pos[1] - y, dz = (F.pos[2] || 0) - z, d = Math.hypot(dx, dy, dz); if (d < F.rad && d > 1e-3) { const w = (F.str * (1 - d / F.rad)) / d; ax += dx * w; ay += dy * w; az += dz * w; } }
      for (let f = 0; f < fields.length; f++) { fields[f].eval(x, y, z, fo); ax += fo[1] * fForce; ay += fo[2] * fForce; az += fo[3] * fForce; }
      vx = (vx + ax * dt) * dragK; vy = (vy + ay * dt) * dragK; vz = (vz + az * dt) * dragK;
      let nx = x + vx * dt, ny = y + vy * dt, nz = z + vz * dt;
      // 碰撞
      let collided = false, hx = 0, hy = 0, hz = 0, hnx = 0, hny = 0, hnz = 0, sdx = 0, sdy = 0, sdz = 0, bestT = 2;
      for (let c = 0; c < colliders.length; c++) {
        const m0 = col0[c] && col0[c].pos.length === colliders[c].pos.length && col0[c] !== colliders[c] ? col0[c] : null;
        if (hitMesh(colliders[c], m0, x, y, z, nx, ny, nz, disp[c], hit) && hit.t < bestT) { bestT = hit.t; collided = true; hx = hit.x; hy = hit.y; hz = hit.z; hnx = hit.nx; hny = hit.ny; hnz = hit.nz; sdx = hit.dx; sdy = hit.dy; sdz = hit.dz; }
      }
      if (floor !== null && ny > floor && !(collided && hy <= floor)) { const tt = y >= floor ? 0 : (floor - y) / ((ny - y) || 1e-9); collided = true; hx = x + (nx - x) * tt; hy = floor; hz = z + (nz - z) * tt; hnx = 0; hny = -1; hnz = 0; sdx = sdy = sdz = 0; }
      if (collided) {
        const svx = sdx / dt, svy = sdy / dt, svz = sdz / dt; let rx = vx - svx, ry = vy - svy, rz = vz - svz; const vn = rx * hnx + ry * hny + rz * hnz;
        const impact = -vn;
        if (vn < 0) { const tx = rx - vn * hnx, ty = ry - vn * hny, tz = rz - vn * hnz; let bn = -bounce * vn; if (bn < 25) bn = 0; rx = tx * (1 - fric) + hnx * bn; ry = ty * (1 - fric) + hny * bn; rz = tz * (1 - fric) + hnz * bn; }
        vx = rx + svx; vy = ry + svy; vz = rz + svz; nx = hx + hnx * 0.7; ny = hy + hny * 0.7; nz = hz + hnz * 0.7;
        if (impact > 40) {
          const first = !(s.flag[i] & 1); s.flag[i] |= 1;
          if (hitLife !== 1) s.life[i] = s.age[i] + (s.life[i] - s.age[i]) * hitLife;
          // 次级发射：每个粒子只在第一次有力的碰撞时触发，且次级粒子不再触发
          if (first && subN > 0 && !(s.flag[i] & 2) && impact > 120) {
            const cnt = Math.floor(subN) + (MF.rand01(s.seed[i], 91, 3) < subN - Math.floor(subN) ? 1 : 0); const sp = Math.hypot(vx, vy, vz) * subSpeed + impact * subSpeed * 0.5;
            for (let c = 0; c < cnt; c++) { const sd = MF.hash32(s.seed[i], 7001 + c, seed0); const d = cone([hnx, hny, hnz], 75, MF.rand01(sd, 1, 0), MF.rand01(sd, 2, 0)); const v = sp * (0.4 + 0.8 * MF.rand01(sd, 3, 0)); spawn(s, nx, ny, nz, d[0] * v + svx, d[1] * v + svy, d[2] * v + svz, subLife * (0.5 + 0.5 * MF.rand01(sd, 4, 0)), s.size[i] * subSize, sd, s.em[i], 2, max); s.subCount++; }
          }
        }
      }
      s.px[i] = nx; s.py[i] = ny; s.pz[i] = nz; s.vx[i] = vx; s.vy[i] = vy; s.vz[i] = vz; s.age[i] += dt;
    }
    // 发射
    const active = t1 >= L.in && t1 < L.out;
    if (active) for (let e = 0; e < ps.emitters.length; e++) {
      const em = ps.emitters[e]; if (em.on === false) continue; const ep = em.p;
      const rateE = Math.max(0, V(ep.rate, t1)); s.emitAcc[e] += rateE * dt; let cnt = Math.floor(s.emitAcc[e]); if (cnt <= 0) continue; s.emitAcc[e] -= cnt; cnt = Math.min(cnt, 4000);
      const speed = V(ep.speed, t1), speedRand = V(ep.speedRand, t1), dirP = MF.V3.norm(V(ep.direction, t1)), spread = V(ep.spread, t1), nmix = V(ep.normalMix, t1), inherit = V(ep.inherit, t1), life = V(ep.life, t1), lifeRand = V(ep.lifeRand, t1), size = V(ep.size, t1), sizeRand = V(ep.sizeRand, t1);
      const type = em.s.type; const srcIdx = em.s.src === undefined || em.s.src === null ? e : em.s.src | 0;
      let g1 = type === 'point' ? null : in1.emit[srcIdx], g0 = null, m1 = null, m0 = null, cdf = null, cs = null, lens = null, total = 0, xf = null;
      if (type === 'surface' && g1) { m1 = MF.Nodes.G.mesh3(g1); if (m1 && m1.idx.length) { cdf = MF.Solid.cdf(m1); if (inherit > 0 || em.s.weight === 'speed') { g0 = get0().emit[srcIdx]; m0 = g0 ? MF.Nodes.G.mesh3(g0) : null; if (m0 && m0.pos.length !== m1.pos.length) m0 = null; } } else m1 = null; }
      if (type === 'curve' && g1) { cs = MF.Nodes.G.contours(g1); xf = g1.xf || null; lens = cs.map((c) => MF.Path.length(c)); total = lens.reduce((a, b) => a + b, 0); if (total <= 0) cs = null; }
      const pos1 = V(ep.position, t1), pos0 = type === 'point' && inherit > 0 ? V(ep.position, t0) : pos1;
      const wField = em.s.weight === 'field' ? fields[em.s.weightField | 0] : null;
      for (let j = 0; j < cnt; j++) {
        const sd = MF.hash32(seed0, e * 977 + 13, s.emitCount[e]++); const R = (q) => MF.rand01(sd, q, 5);
        let px, py, pz, nrm = null, ev = [0, 0, 0];
        if (type === 'surface') {
          if (!m1) continue; let best = null, bw = -1;
          const tries = em.s.weight === 'uniform' || !em.s.weight ? 1 : 10;
          for (let a = 0; a < tries; a++) {
            const sp = MF.Nodes.samplePoint(m1, cdf, MF.rand01(sd, 20 + a, 1), MF.rand01(sd, 20 + a, 2), MF.rand01(sd, 20 + a, 3)); let w = 1;
            if (m0) { const t = m1.idx, ia = t[sp.tri * 3] * 3, ib = t[sp.tri * 3 + 1] * 3, ic = t[sp.tri * 3 + 2] * 3, p0 = m0.pos; sp.vel = [(sp.p[0] - (p0[ia] * sp.w + p0[ib] * sp.u + p0[ic] * sp.v)) / dt, (sp.p[1] - (p0[ia + 1] * sp.w + p0[ib + 1] * sp.u + p0[ic + 1] * sp.v)) / dt, (sp.p[2] - (p0[ia + 2] * sp.w + p0[ib + 2] * sp.u + p0[ic + 2] * sp.v)) / dt]; }
            if (em.s.weight === 'field') { if (wField) { wField.eval(sp.p[0], sp.p[1], sp.p[2], fo); w = fo[0]; } else w = 0; }
            else if (em.s.weight === 'speed') w = sp.vel ? Math.hypot(sp.vel[0], sp.vel[1], sp.vel[2]) / 300 : 0;
            if (w > bw) { bw = w; best = sp; }
            if (w >= MF.rand01(sd, 40 + a, 4)) break;
          }
          if (!best || bw < 0.03) continue;
          px = best.p[0]; py = best.p[1]; pz = best.p[2]; nrm = best.n; if (best.vel) ev = best.vel;
        } else if (type === 'curve') {
          if (!cs) continue; let d = R(11) * total, c = 0; while (c < cs.length - 1 && d > lens[c]) { d -= lens[c]; c++; }
          const q = MF.Path.pointAt(cs[c], d); let p = [q[0], q[1], 0], nn = [q[3], -q[2], 0];
          if (xf) { p = MF.M4.tp(xf, p); nn = MF.V3.norm(MF.M4.td(xf, [0, 0, -1])); }
          px = p[0]; py = p[1]; pz = p[2]; nrm = nn;
        } else { const f = (j + R(12)) / cnt; px = pos0[0] + (pos1[0] - pos0[0]) * f; py = pos0[1] + (pos1[1] - pos0[1]) * f; pz = (pos0[2] || 0) + ((pos1[2] || 0) - (pos0[2] || 0)) * f; ev = [(pos1[0] - pos0[0]) / dt, (pos1[1] - pos0[1]) / dt, ((pos1[2] || 0) - (pos0[2] || 0)) / dt]; }
        let d = dirP; if (nrm && nmix > 0) d = MF.V3.norm([dirP[0] * (1 - nmix) + nrm[0] * nmix, dirP[1] * (1 - nmix) + nrm[1] * nmix, dirP[2] * (1 - nmix) + nrm[2] * nmix]);
        d = cone(d, spread, R(1), R(2)); const sp = speed * (1 - speedRand * R(3));
        const vx = d[0] * sp + ev[0] * inherit, vy = d[1] * sp + ev[1] * inherit, vz = d[2] * sp + ev[2] * inherit;
        const frac = (j + 0.5) / cnt * dt; // 本步内已存活的时间
        const i = spawn(s, px + vx * frac, py + vy * frac, pz + vz * frac, vx, vy, vz, Math.max(0.02, life * (1 - lifeRand * R(4))), size * (1 - sizeRand * R(5)), sd, e, 0, max);
        if (i >= 0) s.age[i] = frac;
      }
    }
    // 消亡
    for (let i = s.n - 1; i >= 0; i--) if (s.age[i] >= s.life[i]) kill(s, i);
    // 轨迹记录
    s.step = k + 1;
    if (s.step % sim.every === 0) { s.head = (s.head + 1) % TR; const h = s.head; for (let i = 0; i < s.n; i++) { const o = (i * TR + h) * 3; s.trail[o] = s.px[i]; s.trail[o + 1] = s.py[i]; s.trail[o + 2] = s.pz[i]; if (s.tcount[i] < TR) s.tcount[i]++; } }
  }

  const Particles = (MF.Particles = {
    TR, stats: { steps: 0 },
    simOf(comp, L) {
      const sig = simSig(comp, L); let sim = sims.get(L.id);
      if (!sim || sim.sig !== sig) {
        const rate = MF.clamp(+L.ps.s.rate || 120, 30, 480); const tmax = MF.clamp(+L.ps.s.trailMax || 0.3, 0.02, 3);
        sim = { sig, rate, every: Math.max(1, Math.ceil((tmax * rate) / TR)), ck: new Map(), cur: null, nEm: L.ps.emitters.length };
        sims.set(L.id, sim);
      }
      return sim;
    },
    // 取第 step 步之后的状态（确定性：从最近的检查点推进）
    stateAt(comp, L, step) {
      const sim = Particles.simOf(comp, L); step = Math.max(0, step | 0);
      let s = sim.cur;
      if (!s || s.step > step || step - s.step > CK * 3) {
        let best = null; const base = Math.floor(step / CK) * CK;
        for (let b = base; b >= 0; b -= CK) { const c = sim.ck.get(b); if (c) { best = c; break; } }
        if (s && s.step <= step && (!best || s.step >= best.step)) { /* 继续用当前状态 */ }
        else s = best ? cloneState(best) : newState(256, Math.max(1, sim.nEm));
        sim.cur = s;
      }
      while (s.step < step) { if (s.step % CK === 0 && !sim.ck.has(s.step)) sim.ck.set(s.step, cloneState(s)); stepSim(sim, comp, L, s); Particles.stats.steps++; }
      if (s.step % CK === 0 && !sim.ck.has(s.step)) sim.ck.set(s.step, cloneState(s));
      return s;
    },
    // 取样：返回渲染数据（粒子实例 + 拖尾线段）；任意时刻取样不改变模拟结果
    sample(comp, L, t) {
      return MF.Scene.memo('psample' + L.id, t, () => {
        const sim = Particles.simOf(comp, L); const rate = sim.rate, dt = 1 / rate; const tt = Math.max(0, t);
        const step = Math.floor(tt * rate + 1e-7), al = tt * rate - step; const s = Particles.stateAt(comp, L, step);
        const n = s.n, pp = L.ps.p, ems = L.ps.emitters;
        const emc = ems.map((e) => ({ a: V(e.p.colorA, t), b: V(e.p.colorB, t), c: V(e.p.colorC, t), a0: V(e.p.alphaStart, t) / 100, a1: V(e.p.alphaEnd, t) / 100, se: V(e.p.sizeEnd, t) }));
        const hitC = V(pp.hitColor, t), hitMix = V(pp.hitColorMix, t), glow = V(pp.glow, t);
        const tLen = Math.max(0, V(pp.trailLen, t)), tW = V(pp.trailWidth, t), tC = V(pp.trailColor, t), tMix = V(pp.trailColorMix, t), tFade = V(pp.trailFade, t);
        const inst = new Float32Array(n * 11); const segs = []; const sdt = sim.every * dt;
        for (let i = 0; i < n; i++) {
          const ec = emc[s.em[i]] || emc[0]; if (!ec) continue;
          const u = MF.clamp((s.age[i] + al * dt) / s.life[i], 0, 1);
          let r, g, b; if (u < 0.5) { const f = u * 2; r = ec.a[0] + (ec.b[0] - ec.a[0]) * f; g = ec.a[1] + (ec.b[1] - ec.a[1]) * f; b = ec.a[2] + (ec.b[2] - ec.a[2]) * f; } else { const f = u * 2 - 1; r = ec.b[0] + (ec.c[0] - ec.b[0]) * f; g = ec.b[1] + (ec.c[1] - ec.b[1]) * f; b = ec.b[2] + (ec.c[2] - ec.b[2]) * f; }
          if ((s.flag[i] & 1) && hitMix > 0) { r += (hitC[0] - r) * hitMix; g += (hitC[1] - g) * hitMix; b += (hitC[2] - b) * hitMix; }
          const a = MF.clamp(ec.a0 + (ec.a1 - ec.a0) * u, 0, 1), size = s.size[i] * (1 + (ec.se - 1) * u);
          const x = s.px[i] + s.vx[i] * al * dt, y = s.py[i] + s.vy[i] * al * dt, z = s.pz[i] + s.vz[i] * al * dt;
          const o = i * 11; inst[o] = x; inst[o + 1] = y; inst[o + 2] = z; inst[o + 3] = s.vx[i]; inst[o + 4] = s.vy[i]; inst[o + 5] = s.vz[i]; inst[o + 6] = size; inst[o + 7] = r * glow; inst[o + 8] = g * glow; inst[o + 9] = b * glow; inst[o + 10] = a;
          // 拖尾：从当前位置沿历史轨迹回溯
          if (tLen > 0 && tW > 0 && s.tcount[i] > 0) {
            let lx = x, ly = y, lz = z, tprev = 0; const cnt = s.tcount[i];
            const sinceRec = ((s.step % sim.every) + al) * dt;
            const tr = r + (tC[0] * glow - r * glow) * tMix / (glow || 1), tg = g + (tC[1] * glow - g * glow) * tMix / (glow || 1), tb = b + (tC[2] * glow - b * glow) * tMix / (glow || 1);
            for (let h = 0; h < cnt; h++) {
              const idx = (s.head - h + TR * 4) % TR, o3 = (i * TR + idx) * 3; let hx = s.trail[o3], hy = s.trail[o3 + 1], hz = s.trail[o3 + 2];
              let tcur = sinceRec + h * sdt; const born = s.age[i] + al * dt; let last = false;
              if (tcur > Math.min(tLen, born)) { const lim = Math.min(tLen, born); const f = (lim - tprev) / Math.max(1e-9, tcur - tprev); hx = lx + (hx - lx) * f; hy = ly + (hy - ly) * f; hz = lz + (hz - lz) * f; tcur = lim; last = true; }
              if (tcur - tprev > 1e-6) {
                const f0 = Math.pow(1 - tprev / tLen, tFade), f1 = Math.pow(Math.max(0, 1 - tcur / tLen), tFade);
                segs.push(lx, ly, lz, hx, hy, hz, size * tW * (0.35 + 0.65 * f0), size * tW * (0.35 + 0.65 * f1), tr * glow, tg * glow, tb * glow, a * f0, tr * glow, tg * glow, tb * glow, a * f1);
              }
              lx = hx; ly = hy; lz = hz; tprev = tcur; if (last) break;
            }
          }
        }
        return { count: n, inst, segs: new Float32Array(segs), segCount: segs.length / 16, step, sub: s.subCount, blend: L.ps.s.blend, shape: L.ps.s.shape };
      });
    },
    reset() { sims.clear(); },
    info(comp, L) { const sim = sims.get(L.id); return sim ? { checkpoints: sim.ck.size, step: sim.cur ? sim.cur.step : 0, count: sim.cur ? sim.cur.n : 0, rate: sim.rate } : null; },
  });
})();
