/* nodes.js — 程序节点图：几何/场/变形/发射/碰撞，按连线求值（带缓存） */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, G = AE.G, Mesh = AE.Mesh, Model = AE.Model, M = U.M;
  const Nodes = AE.Nodes = {};
  const ND = AE.NodeDefs = {};
  const P = Model.P;
  let _uid = 0; const nuid = () => ++_uid;

  Nodes.PORT_COLORS = { geo: '#4fd1c5', num: '#a0a0a0', vec: '#f0c24f', color: '#e86ec0', field: '#8f7bff' };
  Nodes.PORT_NAMES = { geo: '几何', num: '标量', vec: '向量', color: '颜色', field: '场' };
  Nodes.CATS = { input: ['输入', '#3a7a8c'], geo: ['几何', '#3f7f5a'], deform: ['变形', '#8a6a2c'], field: ['场', '#6a56a8'], consumer: ['使用者', '#a04e4e'], value: ['数值', '#555a66'], group: ['组', '#6a6a6a'] };
  Nodes.canLink = (a, b) => a === b || (a === 'num' && (b === 'vec' || b === 'color')) || ((a === 'vec' || a === 'color') && (b === 'vec' || b === 'color'));

  const def = (type, d) => { ND[type] = Object.assign({ type, inputs: [], outputs: [{ id: 'out', type: 'geo' }], params: {}, statics: {} }, d); };
  const pn = (label, v, o) => Object.assign({ type: 'num', label, v }, o);
  const pv = (label, v, o) => Object.assign({ type: 'vec', dim: v.length, label, v }, o);

  // ---- 工具：几何转换 ----
  const regionObj = polys => ({ kind: 'region', uid: nuid(), polys });
  const isRegion = g => g && g.kind === 'region';
  const isMesh = g => g && g.pos && g.idx;
  const tessCache = new Map();
  const toMesh2D = (g, spacing) => {
    if (!g) return null;
    if (isMesh(g)) return g.dim === 2 ? g : null;
    if (isRegion(g)) { const k = g.uid + '|' + (spacing || 0); let m = tessCache.get(k); if (!m) { m = Mesh.tessellate(g.polys, spacing); tessCache.set(k, m); if (tessCache.size > 12) tessCache.delete(tessCache.keys().next().value); } return m; }
    return null;
  };
  const toRegion = g => {
    if (!g) return null; if (isRegion(g)) return g.polys;
    if (isMesh(g) && g.dim === 2 && g.loops) return g.loops.map(l => { const o = []; for (const i of l) o.push(g.pos[3 * i], g.pos[3 * i + 1]); return o; });
    return null;
  };
  Nodes.toRegion = toRegion; Nodes.toMesh2D = toMesh2D;
  const recenter = polys => { const b = G.polysBBox(polys); const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return polys.map(p => { const q = new Array(p.length); for (let i = 0; i < p.length; i += 2) { q[i] = p[i] - cx; q[i + 1] = p[i + 1] - cy; } return q; }); };
  const findLayer = (c, id) => id ? (Model.layer(c.comp, id) || null) : null;
  const spaceMat = (c, node) => { const L = findLayer(c, node.data && node.data.space); return L ? c.ev.worldMatrix(c.comp, L, c.t) : null; };
  const msig = m => m ? m.map(x => Math.round(x * 1000) / 1000).join(',') : '';

  // ===== 输入 =====
  def('src.shape', { name: '路径源（形状图层）', cat: 'input', statics: { layer: null, center: true }, params: {},
    eval(c, node) { const L = findLayer(c, node.data.layer); if (!L || L.type !== 'shape') return { out: null, info: '未选择形状图层' }; let polys = AE.Shapes.shapeRegion(c.ev, c.comp, L, c.t); if (!polys.length) return { out: null, info: '形状图层没有可填充的路径' }; polys = G.resolve(polys); if (node.data.center) polys = recenter(polys); return { out: regionObj(polys) }; } });
  def('src.text', { name: '文字源（文字图层）', cat: 'input', statics: { layer: null, center: true }, params: {},
    eval(c, node) {
      const L = findLayer(c, node.data.layer); if (!L || L.type !== 'text') return { out: null, info: '未选择文字图层' };
      const lay = AE.Shapes.textLayout(c.ev, c.comp, L, c.t); let polys = [];
      for (const ch of lay.chars) for (const p of AE.Font.charPolys(ch)) { const q = new Array(p.length); for (let i = 0; i < p.length; i += 2) { q[i] = p[i] + ch.cx; q[i + 1] = p[i + 1] + ch.cy; } polys.push(q); }
      if (!polys.length) return { out: null, info: '文字没有可用字形' };
      polys = G.resolve(polys); if (node.data.center) polys = recenter(polys); return { out: regionObj(polys) };
    } });
  def('prim.rect', { name: '矩形', cat: 'input', params: { size: pv('尺寸', [300, 200]), round: pn('圆角', 0, { min: 0 }) },
    eval(c, node, ins, p) { const sh = G.rectShape(p.size[0], p.size[1], p.round); return { out: regionObj(G.flattenShape(sh, 0.2).map(x => x.pts)) }; } });
  def('prim.ellipse', { name: '椭圆', cat: 'input', params: { size: pv('尺寸', [240, 240]) },
    eval(c, node, ins, p) { return { out: regionObj(G.flattenShape(G.ellipseShape(p.size[0], p.size[1]), 0.2).map(x => x.pts)) }; } });
  def('prim.star', { name: '星形', cat: 'input', params: { points: pn('顶点数', 5, { min: 3, max: 30, step: 1 }), outer: pn('外半径', 140), inner: pn('内半径', 60) },
    eval(c, node, ins, p) { return { out: regionObj(G.flattenShape(G.starShape(p.points, p.outer, p.inner), 0.2).map(x => x.pts)) }; } });

  // ===== 几何处理 =====
  def('tess', { name: '三角网格化', cat: 'geo', inputs: [{ id: 'in', type: 'geo', label: '轮廓' }], params: { spacing: pn('网格间距', 0, { min: 0, step: 1 }) },
    eval(c, node, ins, p) { const m = toMesh2D(ins.in, p.spacing); return m ? { out: m, info: `${m.pos.length / 3} 顶点 / ${m.idx.length / 3} 三角形` } : { out: null, info: '需要轮廓输入' }; } });
  def('pin', { name: '图钉变形', cat: 'deform', inputs: [{ id: 'in', type: 'geo', label: '网格' }], params: { radius: pn('柔和半径', 20, { min: 1 }), power: pn('影响衰减', 1.5, { min: 0.5, max: 4, step: 0.1 }), hold: pn('固定半径', 0, { min: 0 }) }, statics: { pins: [] },
    pins: true,
    eval(c, node, ins, p) {
      const m = toMesh2D(ins.in, 0); if (!m) return { out: null, info: '需要 2D 网格或轮廓' };
      const pins = (node.data.pins || []).map(pi => ({ rest: pi.rest, off: c.ev.value(c.comp, node, `pin.${pi.id}.pos`, c.t), rot: c.ev.value(c.comp, node, `pin.${pi.id}.rot`, c.t), scale: c.ev.value(c.comp, node, `pin.${pi.id}.scale`, c.t) / 100 }));
      if (!pins.length) return { out: m, info: '没有图钉' };
      return { out: pinDeform(m, pins, p), info: pins.length + ' 个图钉' };
    } });
  function pinDeform(mesh, pins, o) {
    const r2 = o.radius * o.radius, pw = o.power; const out = Mesh.cloneTopo(mesh); const pos = out.pos, src = mesh.pos; const n = src.length / 3;
    const pre = pins.map(pi => { const a = pi.rot * U.DEG; return { rx: pi.rest[0], ry: pi.rest[1], ox: pi.off[0], oy: pi.off[1], c: Math.cos(a) * pi.scale, s: Math.sin(a) * pi.scale }; });
    const w0 = o.hold > 0 ? 1 / Math.pow(o.hold * o.hold + r2, pw) : 0;
    for (let i = 0; i < n; i++) {
      const x = src[3 * i], y = src[3 * i + 1]; let ax = 0, ay = 0, sw = 0;
      for (const q of pre) { const dx = x - q.rx, dy = y - q.ry; const w = 1 / Math.pow(dx * dx + dy * dy + r2, pw); ax += w * (q.rx + q.ox + q.c * dx - q.s * dy); ay += w * (q.ry + q.oy + q.s * dx + q.c * dy); sw += w; }
      if (w0) { ax += w0 * x; ay += w0 * y; sw += w0; }
      pos[3 * i] = ax / sw; pos[3 * i + 1] = ay / sw; pos[3 * i + 2] = 0;
    }
    return out;
  }
  Nodes.pinDeform = pinDeform;

  def('extrude', { name: '挤出', cat: 'geo', inputs: [{ id: 'in', type: 'geo', label: '轮廓/网格' }], params: { depth: pn('挤出深度', 80, { min: 0.1, step: 1 }), bevel: pn('倒角大小', 6, { min: 0, step: 0.5 }), bevelSeg: pn('倒角分段', 2, { min: 0, max: 6, step: 1 }), depthSeg: pn('深度分段', 4, { min: 1, max: 24, step: 1 }), spacing: pn('网格间距', 0, { min: 0 }) },
    eval(c, node, ins, p) {
      const m = toMesh2D(ins.in, p.spacing); if (!m) return { out: null, info: '需要轮廓或 2D 网格输入' };
      const out = Mesh.extrude(m, { depth: p.depth, bevel: p.bevel, bevelSeg: Math.round(p.bevelSeg), depthSeg: Math.round(p.depthSeg) });
      return { out, info: `实体：${out.pos.length / 3} 顶点 / ${out.idx.length / 3} 三角形` };
    } });
  def('xform', { name: '变换几何', cat: 'geo', inputs: [{ id: 'in', type: 'geo', label: '几何' }], params: { pos: pv('位置', [0, 0, 0]), rot: pv('旋转', [0, 0, 0]), scale: pv('缩放', [100, 100, 100]) },
    eval(c, node, ins, p) { const g = ins.in; if (!isMesh(g)) { const m = toMesh2D(g, 0); if (!m) return { out: null, info: '需要几何输入' }; return { out: Mesh.transform(Mesh.computeNormals(Mesh.cloneTopo(m)), M.trs(p.pos, p.rot, p.scale.map(s => s / 100))) }; } return { out: Mesh.transform(g, M.trs(p.pos, p.rot, p.scale.map(s => s / 100))) }; } });
  def('merge', { name: '合并几何', cat: 'geo', inputs: [{ id: 'in', type: 'geo', label: '几何', multi: true }],
    eval(c, node, ins) { const list = (ins.in || []).filter(Boolean).map(g => isMesh(g) ? (g.nrm ? g : Mesh.computeNormals(Mesh.cloneTopo(g))) : toMesh2D(g, 0)).filter(Boolean); if (!list.length) return { out: null, info: '没有输入' }; return { out: list.length === 1 ? list[0] : Mesh.merge(list), info: list.length + ' 个输入' }; } });
  def('array', { name: '阵列', cat: 'geo', inputs: [{ id: 'in', type: 'geo', label: '几何' }], params: { count: pn('数量', 3, { min: 1, max: 100, step: 1 }), offset: pv('间隔', [120, 0, 0]), rot: pv('累计旋转', [0, 0, 0]) },
    eval(c, node, ins, p) { const g = ins.in; const m = isMesh(g) ? g : toMesh2D(g, 0); if (!m) return { out: null, info: '需要几何输入' }; const base = m.nrm ? m : Mesh.computeNormals(Mesh.cloneTopo(m)); const list = []; const n = Math.round(p.count); for (let i = 0; i < n; i++) list.push(Mesh.transform(base, M.trs([p.offset[0] * i, p.offset[1] * i, p.offset[2] * i], [p.rot[0] * i, p.rot[1] * i, p.rot[2] * i], [1, 1, 1]))); return { out: Mesh.merge(list), info: n + ' 个副本' }; } });
  def('scatter', { name: '表面分布', cat: 'geo', inputs: [{ id: 'in', type: 'geo', label: '实例' }, { id: 'on', type: 'geo', label: '分布表面' }], params: { count: pn('数量', 20, { min: 1, max: 400, step: 1 }), seed: pn('随机种子', 1, { step: 1 }), size: pn('实例大小', 0.1, { min: 0.001, step: 0.01 }) },
    eval(c, node, ins, p) {
      const inst = isMesh(ins.in) ? ins.in : toMesh2D(ins.in, 0), on = isMesh(ins.on) ? ins.on : toMesh2D(ins.on, 0); if (!inst || !on) return { out: null, info: '需要实例与表面两个输入' };
      const base = inst.nrm ? inst : Mesh.computeNormals(Mesh.cloneTopo(inst)); const rng = U.rng(Math.round(p.seed) * 9973 + 1); const list = [];
      for (let i = 0; i < Math.round(p.count); i++) { const s = Mesh.samplePoint(on, rng(), rng(), rng()); if (!s) break; const n = s.n; const up = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]; const x = U.V.norm(U.V.cross(up, n)), y = U.V.cross(n, x); const R = [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, n[0], n[1], n[2], 0, s.p[0], s.p[1], s.p[2], 1]; list.push(Mesh.transform(base, M.mul(R, M.scale(p.size, p.size, p.size)))); }
      return { out: list.length ? Mesh.merge(list) : null, info: list.length + ' 个实例' };
    } });
  const bendTwist = (kind) => (c, node, ins, p) => {
    const g = ins.in; if (!isMesh(g) || !g.nrm) { const m = isMesh(g) ? g : null; if (!m) return { out: null, info: '需要实体网格输入（先挤出）' }; }
    const out = Mesh.cloneTopo(g); const pos = out.pos; const b = Mesh.bounds(g); const ax = { x: 0, y: 1, z: 2 }[node.data.axis || 'y']; const c0 = (b[ax] + b[3 + ax]) / 2; const ext = Math.max(b[3 + ax] - b[ax], 1e-6);
    const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3; const ang = p.angle * U.DEG;
    for (let i = 0; i < pos.length; i += 3) {
      const u = pos[i + ax] - c0;
      if (kind === 'twist') { const th = ang * (u / ext); const cs = Math.cos(th), sn = Math.sin(th); const y = pos[i + a1], z = pos[i + a2]; pos[i + a1] = y * cs - z * sn; pos[i + a2] = y * sn + z * cs; }
      else { const k = ang / ext; if (Math.abs(k) < 1e-9) continue; const R = 1 / k; const w = pos[i + a2] - (b[a2] + b[3 + a2]) / 2; const th = k * u; pos[i + ax] = c0 + (R - w) * Math.sin(th); pos[i + a2] = (b[a2] + b[3 + a2]) / 2 + R - (R - w) * Math.cos(th); }
    }
    Mesh.computeNormals(out); return { out, info: `${kind === 'twist' ? '扭转' : '弯曲'} ${U.fmt(p.angle, 1)}°` };
  };
  def('bend', { name: '弯曲', cat: 'deform', inputs: [{ id: 'in', type: 'geo', label: '实体' }], params: { angle: pn('弯曲角度', 45, { unit: '°' }) }, statics: { axis: 'x' }, eval: bendTwist('bend') });
  def('twist', { name: '扭转', cat: 'deform', inputs: [{ id: 'in', type: 'geo', label: '实体' }], params: { angle: pn('扭转角度', 60, { unit: '°' }) }, statics: { axis: 'y' }, eval: bendTwist('twist') });
  def('fielddeform', { name: '场变形', cat: 'deform', inputs: [{ id: 'in', type: 'geo', label: '实体' }, { id: 'field', type: 'field', label: '场' }], params: { strength: pn('强度', 30, { step: 0.5 }) }, statics: { mode: 'normal', space: null },
    eval(c, node, ins, p) {
      const g = ins.in, f = ins.field; if (!isMesh(g)) return { out: null, info: '需要实体网格输入' }; if (!f) return { out: g, info: '没有连接场' };
      const out = Mesh.cloneTopo(g); const pos = out.pos, src = g.pos; const N = g.nrm || Mesh.computeNormals(Mesh.cloneTopo(g)).nrm;
      const sm = spaceMat(c, node); const inv = sm ? M.invert(sm) : null; const mode = node.data.mode || 'normal';
      for (let i = 0; i < src.length; i += 3) {
        let x = src[i], y = src[i + 1], z = src[i + 2]; let wx = x, wy = y, wz = z;
        if (sm) { wx = sm[0] * x + sm[4] * y + sm[8] * z + sm[12]; wy = sm[1] * x + sm[5] * y + sm[9] * z + sm[13]; wz = sm[2] * x + sm[6] * y + sm[10] * z + sm[14]; }
        const s = f.sample(wx, wy, wz); let dx = 0, dy = 0, dz = 0;
        if (mode === 'normal' || mode === 'both') { dx += N[i] * s[0] * p.strength; dy += N[i + 1] * s[0] * p.strength; dz += N[i + 2] * s[0] * p.strength; }
        if (mode === 'vector' || mode === 'both') { let vx = s[1] * p.strength, vy = s[2] * p.strength, vz = s[3] * p.strength; if (inv) { const a = inv[0] * vx + inv[4] * vy + inv[8] * vz, b = inv[1] * vx + inv[5] * vy + inv[9] * vz, cc = inv[2] * vx + inv[6] * vy + inv[10] * vz; vx = a; vy = b; vz = cc; } dx += vx; dy += vy; dz += vz; }
        pos[i] = x + dx; pos[i + 1] = y + dy; pos[i + 2] = z + dz;
      }
      Mesh.computeNormals(out); return { out, info: '场驱动顶点变形' };
    },
    keyExtra: (c, node) => msig(spaceMat(c, node)) });

  // ===== 场 =====
  const fieldObj = (kind, sample) => ({ kind: 'field', uid: nuid(), sample });
  const followPos = (c, node, base) => { const L = findLayer(c, node.data && node.data.follow); if (!L) return base; const m = c.ev.worldMatrix(c.comp, L, c.t); const w = M.pt(m, [0, 0, 0]); return [base[0] + w[0], base[1] + w[1], base[2] + w[2]]; };
  const falloffFn = (d, R, pw) => { if (R <= 0) return 1; const x = 1 - d / R; return x <= 0 ? 0 : Math.pow(x, pw); };
  def('field.falloff', { name: '距离衰减场', cat: 'field', outputs: [{ id: 'out', type: 'field' }], params: { pos: pv('中心位置', [960, 540, 0], { spatial: true }), radius: pn('半径', 200, { min: 1 }), strength: pn('强度', 1, { step: 0.05 }), power: pn('衰减指数', 1.5, { min: 0.1, max: 6, step: 0.1 }) }, statics: { follow: null },
    eval(c, node, ins, p) { const cen = followPos(c, node, p.pos); const R = p.radius, k = p.strength, pw = p.power; return { out: fieldObj('falloff', (x, y, z) => { const dx = x - cen[0], dy = y - cen[1], dz = z - cen[2]; const d = Math.hypot(dx, dy, dz); const s = falloffFn(d, R, pw) * k; const il = d > 1e-6 ? s / d : 0; return [s, dx * il, dy * il, dz * il]; }), info: '半径 ' + U.fmt(R, 0) }; },
    fieldInfo: { shape: 'sphere' } });
  def('field.noise', { name: '噪声场', cat: 'field', outputs: [{ id: 'out', type: 'field' }], params: { pos: pv('中心位置', [960, 540, 0], { spatial: true }), radius: pn('范围半径', 0, { min: 0 }), scale: pn('噪声尺度', 120, { min: 1 }), strength: pn('强度', 1, { step: 0.05 }), speed: pn('流动速度', 0.5, { step: 0.05 }), seed: pn('种子', 1, { step: 1 }) }, statics: { follow: null },
    eval(c, node, ins, p) { const cen = followPos(c, node, p.pos); const R = p.radius, k = p.strength, sc = p.scale, sd = Math.round(p.seed), tt = c.t * p.speed; return { out: fieldObj('noise', (x, y, z) => { const dx = x - cen[0], dy = y - cen[1], dz = z - cen[2]; const w = R > 0 ? falloffFn(Math.hypot(dx, dy, dz), R, 1) : 1; const X = x / sc, Y = y / sc, Z = z / sc + tt; const s = (U.noise3(X, Y, Z, sd) * 0.5 + 0.5) * w * k; return [s, U.noise3(X + 11.3, Y, Z, sd + 1) * w * k, U.noise3(X, Y + 23.7, Z, sd + 2) * w * k, U.noise3(X, Y, Z + 37.1, sd + 3) * w * k]; }), info: '尺度 ' + U.fmt(sc, 0) }; } });
  def('field.swirl', { name: '旋涡场', cat: 'field', outputs: [{ id: 'out', type: 'field' }], params: { pos: pv('中心位置', [960, 540, 0], { spatial: true }), axis: pv('旋转轴', [0, 0, 1], { step: 0.1 }), radius: pn('半径', 250, { min: 1 }), strength: pn('强度', 1, { step: 0.05 }) }, statics: { follow: null },
    eval(c, node, ins, p) { const cen = followPos(c, node, p.pos); const ax = U.V.norm(p.axis); const R = p.radius, k = p.strength; return { out: fieldObj('swirl', (x, y, z) => { const dx = x - cen[0], dy = y - cen[1], dz = z - cen[2]; const d = Math.hypot(dx, dy, dz); const s = falloffFn(d, R, 1) * k; const t = U.V.cross(ax, [dx, dy, dz]); const tl = Math.hypot(...t) || 1; return [s, t[0] / tl * s, t[1] / tl * s, t[2] / tl * s]; }), info: '半径 ' + U.fmt(R, 0) }; } });
  def('field.mix', { name: '场混合', cat: 'field', inputs: [{ id: 'a', type: 'field', label: '场 A' }, { id: 'b', type: 'field', label: '场 B' }], outputs: [{ id: 'out', type: 'field' }], params: { factor: pn('混合系数', 0.5, { min: 0, max: 1, step: 0.01 }) }, statics: { op: 'add' },
    eval(c, node, ins, p) { const a = ins.a, b = ins.b; if (!a && !b) return { out: null, info: '没有输入' }; if (!a || !b) return { out: a || b }; const op = node.data.op || 'add', f = p.factor; return { out: fieldObj('mix', (x, y, z) => { const A = a.sample(x, y, z), B = b.sample(x, y, z); if (op === 'add') return [A[0] + B[0], A[1] + B[1], A[2] + B[2], A[3] + B[3]]; if (op === 'mul') return [A[0] * B[0], A[1] * B[0], A[2] * B[0], A[3] * B[0]]; if (op === 'max') return A[0] >= B[0] ? A : B; return A.map((v, i) => v * (1 - f) + B[i] * f); }), info: '模式 ' + op }; } });

  // ===== 数值 =====
  def('val.num', { name: '标量', cat: 'value', outputs: [{ id: 'out', type: 'num' }], params: { value: pn('值', 1, { step: 0.1 }) }, eval(c, node, ins, p) { return { out: p.value, info: U.fmt(p.value, 3) }; } });
  def('val.vec', { name: '向量', cat: 'value', outputs: [{ id: 'out', type: 'vec' }], params: { value: pv('值', [0, 0, 0]) }, eval(c, node, ins, p) { return { out: p.value, info: '[' + p.value.map(x => U.fmt(x, 1)).join(', ') + ']' }; } });
  def('val.color', { name: '颜色', cat: 'value', outputs: [{ id: 'out', type: 'color' }], params: { value: { type: 'color', label: '颜色', v: [1, 0.5, 0.2, 1] } }, eval(c, node, ins, p) { return { out: p.value, info: U.C.toHex(p.value) }; } });
  def('val.math', { name: '数学运算', cat: 'value', inputs: [{ id: 'a', type: 'num', label: 'A' }, { id: 'b', type: 'num', label: 'B' }], outputs: [{ id: 'out', type: 'num' }], params: { a: pn('A', 0, { step: 0.1 }), b: pn('B', 1, { step: 0.1 }) }, statics: { op: 'add' },
    eval(c, node, ins, p) { const a = p.a, b = p.b; const r = { add: a + b, sub: a - b, mul: a * b, div: b ? a / b : 0, min: Math.min(a, b), max: Math.max(a, b) }[node.data.op || 'add']; return { out: r, info: U.fmt(r, 3) }; } });

  // ===== 使用者 =====
  def('output', { name: '显示输出', cat: 'consumer', inputs: [{ id: 'in', type: 'geo', label: '几何' }], outputs: [{ id: 'out', type: 'geo' }], statics: {},
    eval(c, node, ins) { const g = ins.in; if (!g) return { out: null, info: '没有输入' }; return { out: g, info: isMesh(g) ? `${g.pos.length / 3} 顶点 / ${g.idx.length / 3} 三角形` : '轮廓' }; } });
  def('emitter', { name: '发射源', cat: 'consumer', inputs: [{ id: 'in', type: 'geo', label: '几何' }], outputs: [{ id: 'out', type: 'geo' }], statics: { part: 'all', mode: 'surface', space: null },
    eval(c, node, ins) { const g = ins.in; if (!g) return { out: null, info: '没有输入' }; const mesh = isMesh(g) ? g : toMesh2D(g, 0); if (!mesh) return { out: null, info: '无法取得网格' }; return { out: { kind: 'emitter', uid: nuid(), mesh, part: node.data.part || 'all', mode: node.data.mode || 'surface', space: node.data.space }, info: `${mesh.pos.length / 3} 顶点 / ${mesh.idx.length / 3} 三角形` }; },
    keyExtra: (c, node) => msig(spaceMat(c, node)) });
  def('collider', { name: '碰撞体', cat: 'consumer', inputs: [{ id: 'in', type: 'geo', label: '几何' }], outputs: [{ id: 'out', type: 'geo' }], params: { bounce: pn('弹性', 0.45, { min: 0, max: 1.2, step: 0.01 }), friction: pn('摩擦', 0.3, { min: 0, max: 1, step: 0.01 }) }, statics: { space: null },
    eval(c, node, ins, p) { const g = ins.in; if (!g) return { out: null, info: '没有输入' }; const mesh = isMesh(g) ? g : toMesh2D(g, 0); if (!mesh) return { out: null, info: '无法取得网格' }; return { out: { kind: 'collider', uid: nuid(), mesh, bounce: p.bounce, friction: p.friction, space: node.data.space }, info: `${mesh.pos.length / 3} 三角形`.replace(/^[0-9]+/, mesh.idx.length / 3) }; },
    keyExtra: (c, node) => msig(spaceMat(c, node)) });

  // ===== 节点组 =====
  def('group', { name: '节点组', cat: 'group', outputs: [], params: {}, statics: {}, eval() { return { out: null }; } });
  function evalGroup(c, node, ins) {
    const inner = node.data.inner; const virtual = {};
    for (const i of node.data.ins || []) virtual['__' + i.id] = ins[i.id] === undefined ? null : ins[i.id];
    const c2 = { ev: c.ev, comp: c.comp, t: c.t, proj: { graph: { nodes: inner.nodes } }, memo: new Map(), virtual };
    const outs = {}; let first = null;
    for (const o of node.data.outs || []) { const sn = inner.nodes.find(n => n.id === o.from.node); if (!sn) continue; const r = Nodes.evalNode(c2, sn); const v = r ? (r.outs && o.from.port in r.outs ? r.outs[o.from.port] : r.out) : null; outs[o.id] = v; if (first === null) first = v; }
    return { out: first, outs, info: `${inner.nodes.length} 个内部节点` };
  }
  Nodes.makeGroup = (proj, ids) => {
    const sel = proj.graph.nodes.filter(n => ids.includes(n.id)); if (sel.length < 1) return null;
    const idset = new Set(sel.map(n => n.id)); const ins = [], outs = []; const inner = { nodes: [] };
    let k = 0;
    for (const n of sel) for (const [port, v] of Object.entries(n.inputs)) {
      const arr = [].concat(v); const keep = [];
      arr.forEach(l => {
        if (idset.has(l.node)) { keep.push(l); return; }
        const src = proj.graph.nodes.find(x => x.id === l.node); const pt = Nodes.outPorts(src).find(o => o.id === l.port); const id = 'in' + (++k);
        ins.push({ id, type: pt ? pt.type : 'geo', label: src.name + (l.port !== 'out' ? '.' + l.port : ''), ext: { node: l.node, port: l.port } }); keep.push({ node: '__' + id, port: 'out' });
      });
      n.inputs[port] = Array.isArray(v) ? keep : keep[0];
    }
    let o = 0; const consumers = proj.graph.nodes.filter(n => !idset.has(n.id)); const outMap = new Map();
    for (const cn of consumers) for (const [port, v] of Object.entries(cn.inputs)) {
      [].concat(v).forEach(l => { if (!idset.has(l.node)) return; const key = l.node + '|' + l.port; if (!outMap.has(key)) { const src = sel.find(x => x.id === l.node); const pt = Nodes.outPorts(src).find(q => q.id === l.port); outMap.set(key, { id: 'out' + (++o), type: pt ? pt.type : 'geo', label: src.name, from: { node: l.node, port: l.port } }); } });
    }
    // 几何图层直接引用的显示节点也作为输出
    for (const cp of proj.comps) for (const L of cp.layers) if (L.geo && idset.has(L.geo.node)) { const key = L.geo.node + '|out'; if (!outMap.has(key)) { const src = sel.find(x => x.id === L.geo.node); outMap.set(key, { id: 'out' + (++o), type: 'geo', label: src.name, from: { node: L.geo.node, port: 'out' } }); } }
    for (const v of outMap.values()) outs.push(v);
    const cx = sel.reduce((a, n) => a + n.x, 0) / sel.length, cy = sel.reduce((a, n) => a + n.y, 0) / sel.length;
    const gnode = { id: U.uid('N'), nodeType: 'group', name: '节点组', x: cx, y: cy, props: {}, data: { inner: { nodes: sel }, ins: ins.map(i => ({ id: i.id, type: i.type, label: i.label })), outs }, inputs: {} };
    for (const i of ins) gnode.inputs[i.id] = { node: i.ext.node, port: i.ext.port };
    for (const cn of consumers) for (const [port, v] of Object.entries(cn.inputs)) { const mapped = [].concat(v).map(l => { const key = l.node + '|' + l.port; if (outMap.has(key)) return { node: gnode.id, port: outMap.get(key).id }; return l; }); cn.inputs[port] = Array.isArray(v) ? mapped : mapped[0]; }
    proj.graph.nodes = proj.graph.nodes.filter(n => !idset.has(n.id)); proj.graph.nodes.push(gnode);
    for (const cp of proj.comps) for (const L of cp.layers) if (L.geo && idset.has(L.geo.node)) { const oo = outs.find(q => q.from.node === L.geo.node); if (oo) { L.geo.port = oo.id; L.geo.node = gnode.id; } }
    return gnode;
  };
  Nodes.ungroup = (proj, node) => {
    if (node.nodeType !== 'group') return false; const d = node.data;
    for (const n of d.inner.nodes) for (const [port, v] of Object.entries(n.inputs)) {
      const arr = [].concat(v).map(l => { if (l.node.startsWith('__')) { const i = (d.ins || []).find(x => '__' + x.id === l.node); const ext = i && node.inputs[i.id]; return ext ? { node: ext.node, port: ext.port } : null; } return l; }).filter(Boolean);
      if (arr.length) n.inputs[port] = Array.isArray(v) ? arr : arr[0]; else delete n.inputs[port];
    }
    for (const cn of proj.graph.nodes) for (const [port, v] of Object.entries(cn.inputs)) {
      const arr = [].concat(v).map(l => { if (l.node !== node.id) return l; const o = (d.outs || []).find(q => q.id === l.port); return o ? { node: o.from.node, port: o.from.port } : null; }).filter(Boolean);
      if (arr.length) cn.inputs[port] = Array.isArray(v) ? arr : arr[0]; else delete cn.inputs[port];
    }
    proj.graph.nodes = proj.graph.nodes.filter(n => n !== node); proj.graph.nodes.push(...d.inner.nodes);
    for (const cp of proj.comps) for (const L of cp.layers) if (L.geo && L.geo.node === node.id) { const o = (d.outs || []).find(q => q.id === L.geo.port) || (d.outs || [])[0]; L.geo.node = o ? o.from.node : null; delete L.geo.port; }
    return true;
  };
  Nodes.duplicate = (proj, ids) => {
    const sel = proj.graph.nodes.filter(n => ids.includes(n.id)); const map = new Map(); const out = [];
    for (const n of sel) { const cp = JSON.parse(JSON.stringify(n)); cp.id = U.uid('N'); cp.x += 40; cp.y += 40; cp.name = n.name + ' 副本'; map.set(n.id, cp.id); out.push(cp); }
    for (const cp of out) for (const [port, v] of Object.entries(cp.inputs)) { const arr = [].concat(v).filter(l => map.has(l.node)).map(l => ({ node: map.get(l.node), port: l.port })); if (arr.length) cp.inputs[port] = Array.isArray(v) ? arr : arr[0]; else delete cp.inputs[port]; }
    proj.graph.nodes.push(...out); return out;
  };
  Nodes.remove = (proj, ids) => {
    const set = new Set(ids); proj.graph.nodes = proj.graph.nodes.filter(n => !set.has(n.id));
    for (const n of proj.graph.nodes) for (const [port, v] of Object.entries(n.inputs)) { const arr = [].concat(v).filter(l => !set.has(l.node)); if (arr.length) n.inputs[port] = Array.isArray(v) ? arr : arr[0]; else delete n.inputs[port]; }
    for (const cp of proj.comps) for (const L of cp.layers) { if (L.geo && set.has(L.geo.node)) L.geo.node = null; if (L.ps) { for (const em of L.ps.emitters) { if (set.has(em.node)) em.node = null; if (set.has(em.field)) em.field = null; } for (const f of L.ps.forces) if (set.has(f.node)) f.node = null; for (const cl of L.ps.colliders) if (set.has(cl.node)) cl.node = null; } }
  };

  // ===== 求值 =====
  const caches = new WeakMap();
  // 为节点创建默认数据
  Nodes.create = (proj, type, x = 0, y = 0, data) => {
    const d = ND[type]; const node = { id: U.uid('N'), nodeType: type, name: d.name, x, y, props: {}, data: Object.assign(U.clone(d.statics || {}), data || {}), inputs: {} };
    for (const [k, pd] of Object.entries(d.params)) node.props[k] = P(U.clone(pd.v));
    if (type === 'pin') node.data.pins = node.data.pins || [];
    proj.graph.nodes.push(node); return node;
  };
  Nodes.addPin = (node, rest) => { const id = 'p' + ((node.data.nid = (node.data.nid || 0) + 1)); node.data.pins.push({ id, rest: [rest[0], rest[1]] }); node.props[`pin.${id}.pos`] = P([0, 0]); node.props[`pin.${id}.rot`] = P(0); node.props[`pin.${id}.scale`] = P(100); return id; };
  Nodes.removePin = (node, id) => { node.data.pins = node.data.pins.filter(p => p.id !== id); for (const k of Object.keys(node.props)) if (k.startsWith(`pin.${id}.`)) delete node.props[k]; };
  Nodes.outPorts = node => { if (node.nodeType === 'group') return (node.data.outs || []).map(o => ({ id: o.id, type: o.type, label: o.label })); return ND[node.nodeType].outputs; };
  Nodes.inPorts = node => { const d = ND[node.nodeType]; const ports = []; if (node.nodeType === 'group') { for (const i of node.data.ins || []) ports.push({ id: i.id, type: i.type, label: i.label, param: false }); return ports; } for (const i of d.inputs) ports.push(Object.assign({ param: false }, i)); for (const [k, pd] of Object.entries(d.params)) if (['num', 'vec', 'color'].includes(pd.type) && !d.inputs.some(i => i.id === k)) ports.push({ id: k, type: pd.type, label: pd.label, param: true }); return ports; };
  Nodes.link = (proj, toNode, port, fromNode, fromPort = 'out') => {
    const pin = Nodes.inPorts(toNode).find(p => p.id === port); const fo = Nodes.outPorts(fromNode).find(o => o.id === fromPort); if (!pin || !fo) return '端口不存在';
    if (!Nodes.canLink(fo.type, pin.type)) return `类型不兼容：${Nodes.PORT_NAMES[fo.type]} → ${Nodes.PORT_NAMES[pin.type]}`;
    if (fromNode === toNode || Nodes.dependsOn(proj, fromNode, toNode)) return '不能形成循环连接';
    const l = { node: fromNode.id, port: fromPort };
    if (pin.multi) { toNode.inputs[port] = (toNode.inputs[port] || []).filter(x => !(x.node === l.node && x.port === l.port)); toNode.inputs[port].push(l); } else toNode.inputs[port] = l;
    return null;
  };
  Nodes.unlink = (toNode, port, fromId) => { const v = toNode.inputs[port]; if (Array.isArray(v)) { toNode.inputs[port] = v.filter(l => l.node !== fromId); if (!toNode.inputs[port].length) delete toNode.inputs[port]; } else delete toNode.inputs[port]; };
  Nodes.dependsOn = (proj, a, b) => { // a 是否（间接）依赖 b
    const seen = new Set(); const rec = n => { if (n === b) return true; if (seen.has(n.id)) return false; seen.add(n.id); for (const v of Object.values(n.inputs)) for (const l of [].concat(v)) { const s = proj.graph.nodes.find(x => x.id === l.node); if (s && rec(s)) return true; } return false; }; return rec(a);
  };
  Nodes.outputsOf = (proj, node) => { const out = []; for (const n of proj.graph.nodes) for (const [port, v] of Object.entries(n.inputs)) for (const l of [].concat(v)) if (l.node === node.id) out.push({ node: n, port }); return out; };

  const coerceIn = (v, type) => { if (type === 'vec' || type === 'color') { if (typeof v === 'number') return [v, v, v].concat(type === 'color' ? [1] : []); return v; } return v; };
  // c: {ev, comp, t, proj, memo}
  Nodes.evalNode = (c, node) => {
    if (!c.memo) c.memo = new Map(); if (c.memo.has(node.id)) { const m = c.memo.get(node.id); if (m === 'busy') return { out: null, info: '循环连接' }; return m; }
    c.memo.set(node.id, 'busy');
    const d = ND[node.nodeType]; const ins = {}; const linkInfo = [];
    const proj = c.proj || c.ev.project; const find = id => proj.graph.nodes.find(n => n.id === id);
    const gets = l => { if (c.virtual && l.node in c.virtual) return c.virtual[l.node]; const sn = find(l.node); if (!sn) return null; const r = Nodes.evalNode(c, sn); if (!r) return null; return r.outs && l.port in r.outs ? r.outs[l.port] : r.out; };
    for (const port of Nodes.inPorts(node)) {
      const lk = node.inputs[port.id]; if (!lk) continue;
      if (port.multi) ins[port.id] = [].concat(lk).map(gets); else ins[port.id] = gets(lk);
    }
    if (node.nodeType === 'group') { const res = evalGroup(c, node, ins); c.memo.set(node.id, res); return res; }
    const p = {};
    for (const [k, pd] of Object.entries(d.params)) {
      if (['num', 'vec', 'color'].includes(pd.type)) { const lk = node.inputs[k]; p[k] = lk && ins[k] !== undefined && ins[k] !== null ? coerceIn(ins[k], pd.type) : c.ev.value(c.comp, node, k, c.t); }
    }
    // 缓存键
    const pk = JSON.stringify(p) + JSON.stringify(node.data) + (d.keyExtra ? d.keyExtra(c, node) : '') + (node.nodeType === 'pin' ? JSON.stringify((node.data.pins || []).map(pi => [c.ev.value(c.comp, node, `pin.${pi.id}.pos`, c.t), c.ev.value(c.comp, node, `pin.${pi.id}.rot`, c.t), c.ev.value(c.comp, node, `pin.${pi.id}.scale`, c.t)])) : '') + (d.dynKey ? d.dynKey(c, node) : '');
    const uidKey = Object.keys(ins).sort().map(k => k + ':' + [].concat(ins[k]).map(g => g && g.uid !== undefined ? g.uid : JSON.stringify(g)).join(',')).join('|');
    // 取决于时间的节点（含表达式属性）已经体现在 p 中
    const key = node.nodeType + '#' + pk + '#' + uidKey + '#' + (node.nodeType === 'src.shape' || node.nodeType === 'src.text' ? Nodes.sourceKey(c, node) : '');
    let ce = caches.get(node);
    let res;
    if (ce && ce.key === key) res = ce.res;
    else {
      try { res = d.eval(c, node, ins, p) || { out: null }; } catch (e) { res = { out: null, info: '求值错误：' + (e && e.message) }; console.warn('节点错误', node.name, e); }
      caches.set(node, { key, res });
    }
    c.memo.set(node.id, res); return res;
  };
  // 源节点缓存键（依赖图层内容）
  Nodes.sourceKey = (c, node) => {
    const L = findLayer(c, node.data.layer); if (!L) return 'none';
    if (L.type === 'text') { const doc = AE.Shapes.textDoc(c.ev, c.comp, L, c.t); return JSON.stringify(doc); }
    // 形状图层：用计算出的路径几何签名
    const draws = AE.Shapes.evalShapeLayer(c.ev, c.comp, L, c.t, 0.5); let h = 0; let n = 0;
    for (const d of draws) for (const sh of d.shapes) for (const p of sh.polys) { n += p.pts.length; for (let i = 0; i < p.pts.length; i += 7) h = (h * 31 + Math.round(p.pts[i] * 10) + Math.round(p.pts[i + 1] * 7)) | 0; }
    return h + ':' + n;
  };
  Nodes.evalOut = (ev, comp, t, nodeId, memoCtx) => {
    const proj = ev.project; const node = proj.graph.nodes.find(n => n.id === nodeId); if (!node) return null;
    const c = memoCtx || { ev, comp, t, proj, memo: new Map() }; return Nodes.evalNode(c, node);
  };
  // 几何图层的显示输出（支持节点组的指定输出口）
  Nodes.geoOut = (ev, comp, t, L, memoCtx) => {
    const node = L.geo && L.geo.node ? Model.node(ev.project, L.geo.node) : null; if (!node) return null;
    const r = Nodes.evalOut(ev, comp, t, node.id, memoCtx); if (!r) return null; return L.geo.port && r.outs ? r.outs[L.geo.port] : r.out;
  };
  // 取实体显示网格（3D 网格，带法线）
  Nodes.displayMesh = (g) => {
    if (!g) return null;
    if (isRegion(g)) g = toMesh2D(g, 0);
    if (!g) return null; if (!g.nrm) { if (g.dim === 2) { g._disp = g._disp || (() => { const m = Mesh.cloneTopo(g); m.nrm = new Float32Array(g.pos.length); for (let i = 2; i < m.nrm.length; i += 3) m.nrm[i] = -1; return m; })(); return g._disp; } Mesh.computeNormals(g); }
    return g;
  };
  Nodes.isMesh = isMesh; Nodes.isRegion = isRegion;
})();
