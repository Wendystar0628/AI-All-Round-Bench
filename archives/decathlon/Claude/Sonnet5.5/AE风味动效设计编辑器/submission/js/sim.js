/* sim.js — 粒子模拟：确定性定步长 + 检查点；发射器(点/几何表面)、力场、碰撞(三角网格)、拖尾 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, M = U.M, Model = AE.Model, Nodes = AE.Nodes, Mesh = AE.Mesh;
  const Sim = AE.Sim = {};
  const DT = 1 / 60, CP_EVERY = 30, TL_MAX = 24;
  const caches = new Map();

  // ---- 辅助：确定性随机（计数器哈希）----
  const hrand = (a, b, c) => { let h = U.hash2(U.hash2(a >>> 0, b >>> 0), c >>> 0); h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  Model.addForce = (L, type, o = {}) => {
    const id = Model.subId(L, 'fc'); const P = Model.P;
    L.ps.forces.push({ id, type, name: o.name || ({ directional: '方向力', attract: '吸引/排斥', field: '场力', turbulence: '湍流' }[type] || type), node: o.node || null });
    L.props[`fc.${id}.strength`] = P(o.strength !== undefined ? o.strength : 100); L.props[`fc.${id}.dir`] = P(o.dir || [0, 1, 0]); L.props[`fc.${id}.pos`] = P(o.pos || [0, 0, 0]); L.props[`fc.${id}.radius`] = P(o.radius || 400);
    return id;
  };
  Model.addCollider = (L, o) => { const id = Model.subId(L, 'cl'); L.ps.colliders.push(Object.assign({ id, name: '碰撞体', kind: 'node', node: null, layer: null }, o)); return id; };

  // ---- 网格加速（均匀网格）----
  const gridCache = new Map();
  function buildGrid(wm) {
    const p = wm.pos, I = wm.idx; const nt = I.length / 3; const bb = Mesh.bounds(wm);
    const ext = Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2], 1); const cs = Math.max(ext / 40, 4);
    const cells = new Map(); const key = (x, y, z) => x * 73856093 ^ y * 19349663 ^ z * 83492791;
    for (let t = 0; t < nt; t++) {
      const a = I[3 * t] * 3, b = I[3 * t + 1] * 3, c = I[3 * t + 2] * 3;
      const x0 = Math.min(p[a], p[b], p[c]), x1 = Math.max(p[a], p[b], p[c]), y0 = Math.min(p[a + 1], p[b + 1], p[c + 1]), y1 = Math.max(p[a + 1], p[b + 1], p[c + 1]), z0 = Math.min(p[a + 2], p[b + 2], p[c + 2]), z1 = Math.max(p[a + 2], p[b + 2], p[c + 2]);
      for (let i = Math.floor(x0 / cs); i <= Math.floor(x1 / cs); i++) for (let j = Math.floor(y0 / cs); j <= Math.floor(y1 / cs); j++) for (let k = Math.floor(z0 / cs); k <= Math.floor(z1 / cs); k++) { const kk = key(i, j, k); let l = cells.get(kk); if (!l) { l = []; cells.set(kk, l); } l.push(t); }
    }
    return { cells, cs, key, bb };
  }
  function getGrid(wm) { let g = wm._grid; if (!g) { g = wm._grid = buildGrid(wm); } return g; }
  // 线段-网格求交，返回 {t, tri, u, v, n}
  function segHit(wm, grid, ox, oy, oz, dx, dy, dz) {
    const p = wm.pos, I = wm.idx, cs = grid.cs; const bb = grid.bb;
    const ex = ox + dx, ey = oy + dy, ez = oz + dz;
    if (Math.max(ox, ex) < bb[0] - 2 || Math.min(ox, ex) > bb[3] + 2 || Math.max(oy, ey) < bb[1] - 2 || Math.min(oy, ey) > bb[4] + 2 || Math.max(oz, ez) < bb[2] - 2 || Math.min(oz, ez) > bb[5] + 2) return null;
    const i0 = Math.floor(Math.min(ox, ex) / cs), i1 = Math.floor(Math.max(ox, ex) / cs), j0 = Math.floor(Math.min(oy, ey) / cs), j1 = Math.floor(Math.max(oy, ey) / cs), k0 = Math.floor(Math.min(oz, ez) / cs), k1 = Math.floor(Math.max(oz, ez) / cs);
    let best = null; let bt = 2; const seen = new Set();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const l = grid.cells.get(grid.key(i, j, k)); if (!l) continue;
      for (const t of l) {
        if (seen.has(t)) continue; seen.add(t);
        const a = I[3 * t] * 3, b = I[3 * t + 1] * 3, c = I[3 * t + 2] * 3;
        const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2], e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x; const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-9) continue; const inv = 1 / det;
        const tx = ox - p[a], ty = oy - p[a + 1], tz = oz - p[a + 2]; const u = (tx * px + ty * py + tz * pz) * inv; if (u < -0.001 || u > 1.001) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x; const v = (dx * qx + dy * qy + dz * qz) * inv; if (v < -0.001 || u + v > 1.002) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv; if (tt >= 0 && tt <= bt) { bt = tt; best = { t: tt, tri: t, u, v }; }
      }
    }
    if (best) { const t = best.tri; const a = I[3 * t] * 3, b = I[3 * t + 1] * 3, c = I[3 * t + 2] * 3; const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]]; let n = U.V.norm(U.V.cross(e1, e2)); if (n[0] * dx + n[1] * dy + n[2] * dz > 0) n = n.map(x => -x); best.n = n; }
    return best;
  }

  // ---- 世界网格（含缓存）----
  function worldMesh(mesh, m) {
    const key = m ? m.map(x => Math.round(x * 1000)).join(',') : '';
    if (mesh._wm && mesh._wm.key === key) return mesh._wm.w;
    const src = mesh.nrm ? mesh : (mesh._withN || (mesh._withN = Mesh.computeNormals(Mesh.cloneTopo(mesh))));
    const w = m ? Mesh.transform(src, m) : src; mesh._wm = { key, w }; return w;
  }

  class SimInst {
    constructor(comp, L, N, TL) {
      this.N = N; this.TL = TL; this.step = 0; this.cps = new Map();
      const F = n => new Float32Array(n);
      this.px = F(N); this.py = F(N); this.pz = F(N); this.qx = F(N); this.qy = F(N); this.qz = F(N); this.vx = F(N); this.vy = F(N); this.vz = F(N);
      this.age = F(N); this.life = F(N); this.size = F(N); this.hit = F(N).fill(-1); this.alive = new Uint8Array(N); this.gen = new Uint8Array(N); this.em = new Uint8Array(N);
      this.hist = F(N * TL * 3); this.hn = new Uint8Array(N); this.rid = new Uint32Array(N);
      this.nf = 0; this.emitted = 0; this.acc = {}; this.count = 0;
      this.prevEm = new Map(); this.prevCol = new Map();
      this.save(0);
    }
    save(k) {
      const idx = []; for (let i = 0; i < this.N; i++) if (this.alive[i]) idx.push(i);
      const pick = a => { const o = new a.constructor(idx.length); idx.forEach((s, i) => o[i] = a[s]); return o; };
      const cp = { idx, nf: this.nf, emitted: this.emitted, acc: Object.assign({}, this.acc) };
      for (const k2 of ['px', 'py', 'pz', 'qx', 'qy', 'qz', 'vx', 'vy', 'vz', 'age', 'life', 'size', 'hit', 'gen', 'em', 'hn', 'rid']) cp[k2] = pick(this[k2]);
      const TL3 = this.TL * 3; cp.hist = new Float32Array(idx.length * TL3); idx.forEach((s, i) => cp.hist.set(this.hist.subarray(s * TL3, s * TL3 + TL3), i * TL3));
      this.cps.set(k, cp);
    }
    restore(k) {
      const cp = this.cps.get(k); this.alive.fill(0); this.count = 0;
      const TL3 = this.TL * 3;
      cp.idx.forEach((s, i) => { this.alive[s] = 1; for (const k2 of ['px', 'py', 'pz', 'qx', 'qy', 'qz', 'vx', 'vy', 'vz', 'age', 'life', 'size', 'hit', 'gen', 'em', 'hn', 'rid']) this[k2][s] = cp[k2][i]; this.hist.set(cp.hist.subarray(i * TL3, i * TL3 + TL3), s * TL3); });
      this.count = cp.idx.length; this.nf = cp.nf; this.emitted = cp.emitted; this.acc = Object.assign({}, cp.acc); this.step = k; this.prevEm.clear(); this.prevCol.clear();
    }
  }

  Sim.get = (ev, comp, L) => {
    let c = caches.get(L.id); const rev = ev.getRev();
    if (!c || c.rev !== rev || c.comp !== comp.id) {
      const TL = Math.min(TL_MAX, Math.max(2, Math.round(ev.value(comp, L, 'ps.trailLen', 0)) + 2));
      c = { rev, comp: comp.id, inst: new SimInst(comp, L, Math.min(L.ps.max || 3000, 6000), TL_MAX) }; caches.set(L.id, c);
    }
    return c.inst;
  };
  Sim.reset = () => caches.clear();

  function advance(ev, comp, L, S, target) {
    if (target < S.step) { let k = Math.floor(target / CP_EVERY) * CP_EVERY; while (!S.cps.has(k) && k > 0) k -= CP_EVERY; S.restore(k); }
    while (S.step < target) { stepOnce(ev, comp, L, S); if (S.step % CP_EVERY === 0 && !S.cps.has(S.step)) S.save(S.step); }
  }

  function stepOnce(ev, comp, L, S) {
    const k = S.step, ts = k * DT, tn = (k + 1) * DT; const ps = L.ps; const pv = key => ev.value(comp, L, key, ts);
    const proj = ev.project; const nctx = { ev, comp, t: ts, proj, memo: new Map() };
    const lifeBase = pv('ps.life'), lifeVar = pv('ps.lifeVar') / 100, drag = pv('ps.drag'), grav = pv('ps.gravity'), bounceG = pv('ps.bounce'), fricG = pv('ps.friction'), hitLife = pv('ps.hitLife'), subRate = Math.round(pv('ps.subRate'));
    const wL = ev.worldMatrix(comp, L, ts);
    // 先保存上一步位置
    for (let i = 0; i < S.N; i++) if (S.alive[i]) { S.qx[i] = S.px[i]; S.qy[i] = S.py[i]; S.qz[i] = S.pz[i]; }
    // ===== 发射 =====
    for (const em of ps.emitters) {
      const rate = ev.value(comp, L, `em.${em.id}.rate`, ts); if (rate <= 0) { continue; }
      S.acc[em.id] = (S.acc[em.id] || 0) + rate * DT; let n = Math.floor(S.acc[em.id]); S.acc[em.id] -= n; if (!n) continue;
      const g = key => ev.value(comp, L, `em.${em.id}.${key}`, ts);
      const speed = g('speed'), sv = g('speedVar') / 100, spread = g('spread') * U.DEG, esize = g('size'), inherit = g('inherit'); let dirL = g('dir'); const posL = g('pos');
      let desc = null, wm = null, grid = null; let prevW = null; let field = null;
      if (em.kind === 'node' && em.node) {
        const r = Nodes.evalOut(ev, comp, ts, em.node, nctx); desc = r && r.out && r.out.kind === 'emitter' ? r.out : null;
        if (desc) { const sl = desc.space ? Model.layer(comp, desc.space) : null; const sm = sl ? ev.worldMatrix(comp, sl, ts) : null; wm = worldMesh(desc.mesh, sm); prevW = S.prevEm.get(em.id); S.prevEm.set(em.id, wm); }
        if (em.field) { const fr = Nodes.evalOut(ev, comp, ts, em.field, nctx); field = fr && fr.out && fr.out.kind === 'field' ? fr.out : null; }
      }
      const wdir = M.dir(wL, dirL); const wdn = U.V.norm(wdir);
      for (let e = 0; e < n; e++) {
        let slot = -1; for (let q = 0; q < S.N; q++) { const s = (S.nf + q) % S.N; if (!S.alive[s]) { slot = s; break; } } if (slot < 0) break; S.nf = (slot + 1) % S.N;
        const rid = S.emitted++; const R = j => hrand(ps.seed | 0, rid, j + 1);
        let pos, nrm, vsurf = [0, 0, 0];
        if (wm) {
          let sp = null; const part = desc.part || 'all';
          for (let tries = 0; tries < 12; tries++) {
            sp = Mesh.samplePoint(wm, R(10 + tries * 4), R(11 + tries * 4), R(12 + tries * 4)); if (!sp) break;
            if (part === 'front' && sp.n[2] > -0.5 && sp.n[1] > -0.5) { if (tries < 11) continue; }
            if (field) { const fs = field.sample(sp.p[0], sp.p[1], sp.p[2]); if (R(13 + tries * 4) > Math.min(1, fs[0])) continue; }
            break;
          }
          if (!sp) continue; pos = sp.p; nrm = sp.n;
          if (prevW && prevW.pos.length === wm.pos.length && prevW !== wm) { const I = wm.idx; const a = I[3 * sp.tri] * 3, b = I[3 * sp.tri + 1] * 3, c = I[3 * sp.tri + 2] * 3; const w = sp.bary; const pp = prevW.pos; vsurf = [0, 1, 2].map(d => (pos[d] - (pp[a + d] * w[0] + pp[b + d] * w[1] + pp[c + d] * w[2])) / DT * inherit); }
        } else { pos = M.pt(wL, posL); nrm = wdn; }
        // 方向：法线 + 散射
        const base = nrm; const up = Math.abs(base[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]; const tx = U.V.norm(U.V.cross(up, base)), ty = U.V.cross(base, tx);
        const ang = spread * Math.sqrt(R(1)), ph = R(2) * Math.PI * 2; const sa = Math.sin(ang);
        const dir = [base[0] * Math.cos(ang) + (tx[0] * Math.cos(ph) + ty[0] * Math.sin(ph)) * sa, base[1] * Math.cos(ang) + (tx[1] * Math.cos(ph) + ty[1] * Math.sin(ph)) * sa, base[2] * Math.cos(ang) + (tx[2] * Math.cos(ph) + ty[2] * Math.sin(ph)) * sa];
        const sp0 = speed * (1 + (R(3) * 2 - 1) * sv);
        S.alive[slot] = 1; S.count++; S.px[slot] = pos[0]; S.py[slot] = pos[1]; S.pz[slot] = pos[2]; S.qx[slot] = pos[0]; S.qy[slot] = pos[1]; S.qz[slot] = pos[2];
        S.vx[slot] = dir[0] * sp0 + vsurf[0]; S.vy[slot] = dir[1] * sp0 + vsurf[1]; S.vz[slot] = dir[2] * sp0 + vsurf[2];
        S.age[slot] = -R(4) * DT; S.life[slot] = Math.max(0.05, lifeBase * (1 + (R(5) * 2 - 1) * lifeVar)); S.size[slot] = esize * (0.7 + R(6) * 0.6); S.hit[slot] = -1; S.gen[slot] = 0; S.rid[slot] = rid; S.hn[slot] = 0;
      }
    }
    // ===== 力 =====
    const forces = [];
    for (const f of ps.forces) {
      const g = key => ev.value(comp, L, `fc.${f.id}.${key}`, ts); const o = { type: f.type, k: g('strength') };
      if (f.type === 'directional') o.dir = M.dir(wL, g('dir')); else if (f.type === 'attract') { o.pos = M.pt(wL, g('pos')); o.radius = g('radius'); }
      else if (f.type === 'field' && f.node) { const fr = Nodes.evalOut(ev, comp, ts, f.node, nctx); o.field = fr && fr.out && fr.out.kind === 'field' ? fr.out : null; if (!o.field) continue; }
      else if (f.type === 'turbulence') { o.scale = g('radius'); }
      forces.push(o);
    }
    // ===== 碰撞体 =====
    const cols = [];
    if (S.count > 0) for (const c of ps.colliders) {
      let wm = null, bounce = bounceG, fric = fricG;
      if (c.kind === 'layer' && c.layer) { const CL = Model.layer(comp, c.layer); if (!CL || CL.type !== 'geo' || !CL.geo.node) continue; const go = Nodes.geoOut(ev, comp, ts, CL, nctx); const m = go ? Nodes.displayMesh(go) : null; if (!m) continue; wm = worldMesh(m, ev.worldMatrix(comp, CL, ts)); }
      else if (c.node) { const r = Nodes.evalOut(ev, comp, ts, c.node, nctx); const d = r && r.out; if (!d || d.kind !== 'collider') continue; const sl = d.space ? Model.layer(comp, d.space) : null; wm = worldMesh(d.mesh, sl ? ev.worldMatrix(comp, sl, ts) : null); bounce = d.bounce; fric = d.friction; }
      if (!wm) continue;
      const prev = S.prevCol.get(c.id); S.prevCol.set(c.id, wm);
      cols.push({ wm, grid: getGrid(wm), bounce, fric, prev: prev && prev.pos.length === wm.pos.length && prev !== wm ? prev : null });
    }
    // ===== 积分 =====
    const TL = S.TL, TL3 = TL * 3; const spawnSub = [];
    for (let i = 0; i < S.N; i++) {
      if (!S.alive[i]) continue;
      S.age[i] += DT; if (S.age[i] < 0) continue;
      if (S.age[i] >= S.life[i]) { S.alive[i] = 0; S.count--; continue; }
      let vx = S.vx[i], vy = S.vy[i], vz = S.vz[i]; const x0 = S.px[i], y0 = S.py[i], z0 = S.pz[i];
      vx += grav[0] * DT; vy += grav[1] * DT; vz += (grav[2] || 0) * DT;
      for (const f of forces) {
        if (f.type === 'directional') { vx += f.dir[0] * f.k * DT; vy += f.dir[1] * f.k * DT; vz += f.dir[2] * f.k * DT; }
        else if (f.type === 'attract') { const dx = f.pos[0] - x0, dy = f.pos[1] - y0, dz = f.pos[2] - z0; const d = Math.hypot(dx, dy, dz) + 1e-3; const w = Math.max(0, 1 - d / f.radius); const a = f.k * w / d * DT; vx += dx * a; vy += dy * a; vz += dz * a; }
        else if (f.type === 'field') { const s = f.field.sample(x0, y0, z0); vx += s[1] * f.k * DT * (ps.fieldGain || 1); vy += s[2] * f.k * DT * (ps.fieldGain || 1); vz += s[3] * f.k * DT * (ps.fieldGain || 1); }
        else if (f.type === 'turbulence') { const sc = f.scale || 200; vx += U.noise3(x0 / sc, y0 / sc, ts * 0.7, 3) * f.k * DT; vy += U.noise3(x0 / sc, y0 / sc, ts * 0.7 + 9, 5) * f.k * DT; vz += U.noise3(x0 / sc, y0 / sc, ts * 0.7 + 19, 7) * f.k * DT; }
      }
      const dm = Math.exp(-drag * DT); vx *= dm; vy *= dm; vz *= dm;
      let nx = x0 + vx * DT, ny = y0 + vy * DT, nz = z0 + vz * DT;
      // 碰撞（最多 3 次反弹）
      let ox = x0, oy = y0, oz = z0;
      for (let iter = 0; iter < 3; iter++) {
        let best = null, bc = null;
        for (const c of cols) { const h = segHit(c.wm, c.grid, ox, oy, oz, nx - ox, ny - oy, nz - oz); if (h && (!best || h.t < best.t)) { best = h; bc = c; } }
        if (!best) break;
        const n = best.n; const hx = ox + (nx - ox) * best.t, hy = oy + (ny - oy) * best.t, hz = oz + (nz - oz) * best.t;
        let vs = [0, 0, 0];
        if (bc.prev) { const I = bc.wm.idx; const a = I[3 * best.tri] * 3, b = I[3 * best.tri + 1] * 3, c2 = I[3 * best.tri + 2] * 3; const w0 = 1 - best.u - best.v, w1 = best.u, w2 = best.v; const P = bc.wm.pos, Q = bc.prev.pos; vs = [0, 1, 2].map(d => ((P[a + d] - Q[a + d]) * w0 + (P[b + d] - Q[b + d]) * w1 + (P[c2 + d] - Q[c2 + d]) * w2) / DT); }
        const rx = vx - vs[0], ry = vy - vs[1], rz = vz - vs[2]; const vn = rx * n[0] + ry * n[1] + rz * n[2];
        if (vn >= 0) { ox = hx + n[0] * 0.05; oy = hy + n[1] * 0.05; oz = hz + n[2] * 0.05; continue; }
        const e = bc.bounce; const tx = rx - vn * n[0], ty = ry - vn * n[1], tz = rz - vn * n[2]; const fr = 1 - bc.fric;
        vx = vs[0] + tx * fr - e * vn * n[0]; vy = vs[1] + ty * fr - e * vn * n[1]; vz = vs[2] + tz * fr - e * vn * n[2];
        if (S.hit[i] < 0) { S.hit[i] = 0; if (hitLife > 0 && hitLife !== 1) S.life[i] = Math.max(S.age[i] + 0.05, S.age[i] + (S.life[i] - S.age[i]) * hitLife); }
        if (subRate > 0 && S.gen[i] === 0) spawnSub.push([hx, hy, hz, n[0], n[1], n[2], S.rid[i], vx, vy, vz]);
        const rem = Math.max(0, 1 - best.t); ox = hx + n[0] * 0.05; oy = hy + n[1] * 0.05; oz = hz + n[2] * 0.05;
        nx = ox + vx * DT * rem; ny = oy + vy * DT * rem; nz = oz + vz * DT * rem;
      }
      S.vx[i] = vx; S.vy[i] = vy; S.vz[i] = vz; S.px[i] = nx; S.py[i] = ny; S.pz[i] = nz;
      if (S.hit[i] >= 0) S.hit[i] += DT;
      // 拖尾记录
      const hn = S.hn[i]; const o = i * TL3;
      if (hn < TL) { S.hist[o + hn * 3] = nx; S.hist[o + hn * 3 + 1] = ny; S.hist[o + hn * 3 + 2] = nz; S.hn[i] = hn + 1; }
      else { S.hist.copyWithin(o, o + 3, o + TL3); S.hist[o + TL3 - 3] = nx; S.hist[o + TL3 - 2] = ny; S.hist[o + TL3 - 1] = nz; }
    }
    // 次级发射
    for (const sd of spawnSub) {
      for (let e = 0; e < subRate; e++) {
        let slot = -1; for (let q = 0; q < S.N; q++) { const s = (S.nf + q) % S.N; if (!S.alive[s]) { slot = s; break; } } if (slot < 0) break; S.nf = (slot + 1) % S.N;
        const rid = S.emitted++; const R = j => hrand((ps.seed | 0) + 77, rid, j + 1); const n = [sd[3], sd[4], sd[5]]; const up = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]; const tx = U.V.norm(U.V.cross(up, n)), ty = U.V.cross(n, tx);
        const ang = R(1) * 1.2, ph = R(2) * Math.PI * 2, sa = Math.sin(ang); const sp = (60 + R(3) * 140);
        S.alive[slot] = 1; S.count++; S.px[slot] = sd[0] + n[0] * 0.5; S.py[slot] = sd[1] + n[1] * 0.5; S.pz[slot] = sd[2] + n[2] * 0.5; S.qx[slot] = S.px[slot]; S.qy[slot] = S.py[slot]; S.qz[slot] = S.pz[slot];
        S.vx[slot] = (n[0] * Math.cos(ang) + (tx[0] * Math.cos(ph) + ty[0] * Math.sin(ph)) * sa) * sp; S.vy[slot] = (n[1] * Math.cos(ang) + (tx[1] * Math.cos(ph) + ty[1] * Math.sin(ph)) * sa) * sp; S.vz[slot] = (n[2] * Math.cos(ang) + (tx[2] * Math.cos(ph) + ty[2] * Math.sin(ph)) * sa) * sp;
        S.age[slot] = 0; S.life[slot] = 0.25 + R(4) * 0.4; S.size[slot] = 0.55; S.hit[slot] = -1; S.gen[slot] = 1; S.rid[slot] = rid; S.hn[slot] = 0;
      }
    }
    S.step = k + 1;
    void tn;
  }

  // 为渲染生成实例/拖尾数据
  Sim.render = (ev, comp, L, t, cam) => {
    if (!L.ps) return null;
    const S = Sim.get(ev, comp, L); const k = Math.max(0, Math.floor(t / DT)); advance(ev, comp, L, S, k + 1);
    // advance 到 k+1 步后，S 对应 t_{k+1}，q 为 t_k 位置
    const frac = U.clamp((t - k * DT) / DT, 0, 1); const g = key => ev.value(comp, L, key, t);
    const s0 = g('ps.sizeStart'), s1 = g('ps.sizeEnd'), c0 = g('ps.colorStart'), c1 = g('ps.colorEnd'), a0 = g('ps.alphaStart'), a1 = g('ps.alphaEnd'), hitc = g('ps.hitColor');
    const tlen = Math.round(g('ps.trailLen')), tw = g('ps.trailW'), tfade = g('ps.trailFade'), tcol = g('ps.trailColor');
    let n = 0; const inst = new Float32Array(Math.max(1, S.count) * 8); const trail = []; const cen = [0, 0, 0];
    const TL = S.TL, TL3 = TL * 3; const right = cam.right, down = cam.down;
    const opa = 1;
    for (let i = 0; i < S.N; i++) {
      if (!S.alive[i] || S.age[i] < 0) continue; const u = U.clamp(S.age[i] / S.life[i], 0, 1);
      const x = S.qx[i] + (S.px[i] - S.qx[i]) * frac, y = S.qy[i] + (S.py[i] - S.qy[i]) * frac, z = S.qz[i] + (S.pz[i] - S.qz[i]) * frac;
      let r = c0[0] + (c1[0] - c0[0]) * u, gg = c0[1] + (c1[1] - c0[1]) * u, b = c0[2] + (c1[2] - c0[2]) * u;
      if (S.hit[i] >= 0 && S.hit[i] < 0.5) { const m = Math.max(0, 1 - S.hit[i] / 0.12); r += (hitc[0] - r) * m; gg += (hitc[1] - gg) * m; b += (hitc[2] - b) * m; }
      const a = (a0 + (a1 - a0) * u) * Math.min(1, (1 - u) * 6) * opa; const sz = (s0 + (s1 - s0) * u) * S.size[i];
      inst[n * 8] = x; inst[n * 8 + 1] = y; inst[n * 8 + 2] = z; inst[n * 8 + 3] = sz; inst[n * 8 + 4] = r; inst[n * 8 + 5] = gg; inst[n * 8 + 6] = b; inst[n * 8 + 7] = a; n++; cen[0] += x; cen[1] += y; cen[2] += z;
      if (tlen > 0 && tw > 0 && S.hn[i] >= 1) {
        const hn = S.hn[i]; const pts = []; pts.push([x, y, z]);
        for (let h = hn - 1, c = 0; h >= 0 && c < tlen; h--, c++) pts.push([S.hist[i * TL3 + h * 3], S.hist[i * TL3 + h * 3 + 1], S.hist[i * TL3 + h * 3 + 2]]);
        if (pts.length < 2) continue;
        const L2 = pts.length; const sides = [];
        for (let q = 0; q < L2; q++) { const pa = pts[Math.max(0, q - 1)], pb = pts[Math.min(L2 - 1, q + 1)]; const d = U.V.norm([pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]); let sd = U.V.cross(d, cam.fwd); const sl = Math.hypot(...sd); if (sl < 1e-5) sd = right; else sd = sd.map(x2 => x2 / sl); sides.push(sd); }
        const col = (q) => { const f = 1 - q / (L2 - 1); const al = a * (tfade > 0 ? Math.pow(f, 1 + tfade) : 1); return [tcol[0] * 0.5 + r * 0.5, tcol[1] * 0.5 + gg * 0.5, tcol[2] * 0.5 + b * 0.5, al * 0.9]; };
        for (let q = 0; q < L2 - 1; q++) {
          const w0 = tw * 0.5 * (1 - q / (L2 - 1)) * Math.min(1, sz * 0.4 + 0.5), w1 = tw * 0.5 * (1 - (q + 1) / (L2 - 1)) * Math.min(1, sz * 0.4 + 0.5); const c0v = col(q), c1v = col(q + 1);
          const P0 = pts[q], P1 = pts[q + 1], s0v = sides[q], s1v = sides[q + 1];
          const A = [P0[0] + s0v[0] * w0, P0[1] + s0v[1] * w0, P0[2] + s0v[2] * w0], B = [P0[0] - s0v[0] * w0, P0[1] - s0v[1] * w0, P0[2] - s0v[2] * w0], C = [P1[0] + s1v[0] * w1, P1[1] + s1v[1] * w1, P1[2] + s1v[2] * w1], D = [P1[0] - s1v[0] * w1, P1[1] - s1v[1] * w1, P1[2] - s1v[2] * w1];
          trail.push(...A, ...c0v, ...B, ...c0v, ...C, ...c1v, ...B, ...c0v, ...D, ...c1v, ...C, ...c1v);
        }
      }
    }
    if (n) { cen[0] /= n; cen[1] /= n; cen[2] /= n; }
    return { count: n, inst, trailVerts: trail.length ? new Float32Array(trail) : null, center: n ? cen : null, blend: L.ps.blend || 'add' };
  };
  // 供 UI 读取：当前活着的粒子数
  Sim.stats = (L) => { const c = caches.get(L.id); return c ? { count: c.inst.count, step: c.inst.step } : { count: 0, step: 0 }; };
})();
