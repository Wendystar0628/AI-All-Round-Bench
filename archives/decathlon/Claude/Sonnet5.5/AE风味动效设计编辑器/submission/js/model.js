/* model.js — 工程数据模型、属性(关键帧)系统、图层/合成/形状/效果定义、撤销历史 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, G = AE.G;
  const Model = AE.Model = {};
  const EPS_T = 1e-5;

  // ===== 属性 =====
  // prop = {v, k?:[key], x?:'表达式', xe?:bool}
  Model.P = (v) => ({ v });
  Model.defKey = (t, v, spatial) => ({ t, v, ii: 'linear', oi: 'linear', ie: { x: 1 / 3, y: 1 / 3 }, oe: { x: 1 / 3, y: 1 / 3 }, sm: spatial ? 'auto' : 'lin', si: null, so: null });
  Model.isAnimated = p => !!(p && p.k && p.k.length);
  Model.hasExpr = p => !!(p && p.x && p.xe !== false && p.x.trim());
  const cloneV = v => v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
  Model.cloneV = cloneV;

  // 关键帧值插值（不含表达式）
  const segCache = new WeakMap();
  const bz3 = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };
  function segLUT(a, b) {
    const so = a.so || [0, 0, 0], si = b.si || [0, 0, 0]; const dim = a.v.length;
    const sig = a.t + '|' + a.v.join() + '|' + so.join() + '|' + b.v.join() + '|' + si.join();
    let c = segCache.get(a); if (c && c.sig === sig) return c;
    const P0 = a.v, P3 = b.v; const P1 = P0.map((x, i) => x + (so[i] || 0)), P2 = P3.map((x, i) => x + (si[i] || 0));
    const straight = so.every(x => !x) && si.every(x => !x);
    const N = 32; const cum = [0]; let prev = P0;
    if (!straight) for (let s = 1; s <= N; s++) { const t = s / N; const p = P0.map((_, i) => bz3(P0[i], P1[i], P2[i], P3[i], t)); let d = 0; for (let i = 0; i < dim; i++) d += (p[i] - prev[i]) ** 2; cum.push(cum[s - 1] + Math.sqrt(d)); prev = p; }
    c = { sig, P0, P1, P2, P3, straight, cum, len: straight ? 0 : cum[N], N }; segCache.set(a, c); return c;
  }
  // 沿路径弧长比例 s(0..1) 取点
  Model.spatialAt = (a, b, s) => {
    const c = segLUT(a, b);
    if (c.straight) return c.P0.map((x, i) => x + (c.P3[i] - x) * s);
    const target = s * c.len; let lo = 0, hi = c.N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c.cum[m] < target) lo = m; else hi = m; }
    const l0 = c.cum[lo], l1 = c.cum[hi]; const f = l1 > l0 ? (target - l0) / (l1 - l0) : 0; const t = (lo + f) / c.N;
    return c.P0.map((_, i) => bz3(c.P0[i], c.P1[i], c.P2[i], c.P3[i], t));
  };
  Model.segProgress = (a, b, u) => {
    if (a.oi === 'hold') return 0;
    const lin = a.oi === 'linear' && b.ii === 'linear';
    if (lin) return u;
    const x1 = a.oi === 'bezier' ? a.oe.x : 1 / 3, y1 = a.oi === 'bezier' ? a.oe.y : 1 / 3;
    const x2 = b.ii === 'bezier' ? 1 - b.ie.x : 2 / 3, y2 = b.ii === 'bezier' ? 1 - b.ie.y : 2 / 3;
    return U.bezierEase(x1, y1, x2, y2, u);
  };
  // info: {type:'num'|'vec'|'color'|'path'|..., spatial}
  Model.evalKeys = (p, t, info) => {
    const k = p.k; if (!k || !k.length) return p.v;
    if (t <= k[0].t) return k[0].v; const n = k.length; if (t >= k[n - 1].t) return k[n - 1].v;
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (k[m].t <= t) lo = m; else hi = m; }
    const a = k[lo], b = k[hi]; const type = info && info.type || 'num';
    if (a.oi === 'hold' || type === 'bool' || type === 'text' || type === 'enum') return a.v;
    const u = (t - a.t) / (b.t - a.t); const pr = Model.segProgress(a, b, u);
    if (type === 'num') return a.v + (b.v - a.v) * pr;
    if (type === 'path') return G.lerpShape(a.v, b.v, pr);
    if (info && info.spatial && Array.isArray(a.v) && (a.sm !== 'lin' || b.sm !== 'lin' || (a.so && a.so.some(x => x)) || (b.si && b.si.some(x => x)))) return Model.spatialAt(a, b, pr);
    return a.v.map((x, i) => x + (b.v[i] - x) * pr);
  };
  // 重新排序并更新自动切线
  Model.normalizeProp = (p, info) => {
    if (!p.k || !p.k.length) { delete p.k; return; }
    p.k.sort((a, b) => a.t - b.t);
    for (let i = p.k.length - 2; i >= 0; i--) if (Math.abs(p.k[i + 1].t - p.k[i].t) < EPS_T) p.k.splice(i, 1);
    if (info && info.spatial) Model.updateAutoTangents(p);
  };
  Model.updateAutoTangents = p => {
    const k = p.k; const n = k.length;
    for (let i = 0; i < n; i++) {
      const key = k[i]; const dim = key.v.length;
      if (key.sm === 'lin') { key.si = null; key.so = null; continue; }
      if (key.sm === 'auto') {
        if (i === 0 || i === n - 1) { key.si = new Array(dim).fill(0); key.so = new Array(dim).fill(0); continue; }
        const pv = k[i - 1].v, nv = k[i + 1].v; const d = nv.map((x, j) => x - pv[j]); const dl = Math.hypot(...d) || 1;
        const lin = Math.hypot(...key.v.map((x, j) => x - pv[j])), lout = Math.hypot(...nv.map((x, j) => x - key.v[j]));
        key.so = d.map(x => x / dl * lout / 3); key.si = d.map(x => -x / dl * lin / 3);
      }
      if (!key.si) key.si = new Array(dim).fill(0); if (!key.so) key.so = new Array(dim).fill(0);
    }
  };
  Model.keyAt = (p, t, tol = 1e-4) => { if (!p.k) return -1; for (let i = 0; i < p.k.length; i++) if (Math.abs(p.k[i].t - t) < tol) return i; return -1; };

  // ===== ID =====
  Model.subId = (layer, pre) => { layer.nid = (layer.nid || 0) + 1; return pre + layer.nid; };

  // ===== 属性元信息（Schema） =====
  const T = {
    'transform.anchor': { type: 'vec', dim: 3, label: '锚点', spatial: true, step: 1 },
    'transform.position': { type: 'vec', dim: 3, label: '位置', spatial: true, step: 1 },
    'transform.scale': { type: 'vec', dim: 3, label: '缩放', unit: '%', step: 0.5 },
    'transform.rotation': { type: 'num', label: '旋转', unit: '°', step: 0.5 },
    'transform.rotX': { type: 'num', label: 'X 旋转', unit: '°', step: 0.5 },
    'transform.rotY': { type: 'num', label: 'Y 旋转', unit: '°', step: 0.5 },
    'transform.opacity': { type: 'num', label: '不透明度', unit: '%', min: 0, max: 100, step: 0.5 },
    'remap.t': { type: 'num', label: '时间重映射', unit: 's', step: 0.05 },
    'text.size': { type: 'num', label: '字号', min: 1, step: 1 },
    'text.tracking': { type: 'num', label: '字距', step: 1 },
    'text.leading': { type: 'num', label: '行距', min: 0.2, step: 0.05 },
    'text.fill': { type: 'color', label: '填充颜色' },
    'text.strokeW': { type: 'num', label: '描边宽度', min: 0, step: 0.5 },
    'text.stroke': { type: 'color', label: '描边颜色' },
    'mat.base': { type: 'color', label: '基础色' },
    'mat.metal': { type: 'num', label: '金属度', min: 0, max: 1, step: 0.01 },
    'mat.rough': { type: 'num', label: '粗糙度', min: 0.02, max: 1, step: 0.01 },
    'mat.emit': { type: 'color', label: '发光色' },
    'mat.emitI': { type: 'num', label: '发光强度', min: 0, max: 20, step: 0.05 },
    'mat.opacity': { type: 'num', label: '材质不透明度', min: 0, max: 1, step: 0.01 },
    'light.color': { type: 'color', label: '颜色' },
    'light.intensity': { type: 'num', label: '强度', min: 0, max: 50, step: 0.05 },
    'light.target': { type: 'vec', dim: 3, label: '目标点', spatial: true, step: 1 },
    'light.radius': { type: 'num', label: '衰减半径', min: 1, step: 10 },
    'light.soft': { type: 'num', label: '阴影柔化', min: 0, max: 10, step: 0.1 },
    'cam.fov': { type: 'num', label: '视角', unit: '°', min: 5, max: 140, step: 0.5 },
    'cam.target': { type: 'vec', dim: 3, label: '目标点', spatial: true, step: 1 },
    'cam.focus': { type: 'num', label: '对焦距离', min: 1, step: 5 },
    'cam.aperture': { type: 'num', label: '光圈', min: 0, max: 200, step: 0.5 },
    'cam.roll': { type: 'num', label: '滚转', unit: '°', step: 0.5 },
    'ps.life': { type: 'num', label: '寿命', unit: 's', min: 0.05, step: 0.05 },
    'ps.lifeVar': { type: 'num', label: '寿命随机', unit: '%', min: 0, max: 100, step: 1 },
    'ps.drag': { type: 'num', label: '阻力', min: 0, max: 20, step: 0.05 },
    'ps.gravity': { type: 'vec', dim: 3, label: '重力', step: 5 },
    'ps.sizeStart': { type: 'num', label: '起始大小', min: 0, step: 0.5 },
    'ps.sizeEnd': { type: 'num', label: '结束大小', min: 0, step: 0.5 },
    'ps.colorStart': { type: 'color', label: '起始颜色' },
    'ps.colorEnd': { type: 'color', label: '结束颜色' },
    'ps.alphaStart': { type: 'num', label: '起始透明度', min: 0, max: 1, step: 0.01 },
    'ps.alphaEnd': { type: 'num', label: '结束透明度', min: 0, max: 1, step: 0.01 },
    'ps.bounce': { type: 'num', label: '弹性', min: 0, max: 1.2, step: 0.01 },
    'ps.friction': { type: 'num', label: '摩擦', min: 0, max: 1, step: 0.01 },
    'ps.trailLen': { type: 'num', label: '拖尾长度', unit: '步', min: 0, max: 24, step: 1 },
    'ps.trailW': { type: 'num', label: '拖尾宽度', min: 0, step: 0.1 },
    'ps.trailFade': { type: 'num', label: '拖尾消退', min: 0, max: 1, step: 0.01 },
    'ps.trailColor': { type: 'color', label: '拖尾颜色' },
    'ps.hitColor': { type: 'color', label: '碰撞颜色' },
    'ps.hitLife': { type: 'num', label: '碰撞寿命倍率', min: 0, max: 3, step: 0.05 },
    'ps.subRate': { type: 'num', label: '次级发射数量', min: 0, max: 8, step: 1 },
    'au.level': { type: 'num', label: '音量', unit: 'dB', min: -60, max: 12, step: 0.5 },
    'au.pan': { type: 'num', label: '声像', min: -1, max: 1, step: 0.05 },
  };
  Model.EFFECTS = {
    blur: { name: '高斯模糊', params: { radius: { type: 'num', label: '模糊半径', v: 12, min: 0, max: 400, step: 0.5, unit: 'px' } } },
    glow: { name: '发光', params: { threshold: { type: 'num', label: '阈值', v: 55, min: 0, max: 100, unit: '%' }, radius: { type: 'num', label: '发光半径', v: 40, min: 0, max: 400, unit: 'px' }, intensity: { type: 'num', label: '发光强度', v: 1.2, min: 0, max: 10, step: 0.05 }, tint: { type: 'color', label: '发光颜色', v: [1, 1, 1, 1] } } },
    shadow: { name: '投影', params: { color: { type: 'color', label: '阴影颜色', v: [0, 0, 0, 1] }, opacity: { type: 'num', label: '不透明度', v: 60, min: 0, max: 100, unit: '%' }, direction: { type: 'num', label: '方向', v: 135, unit: '°' }, distance: { type: 'num', label: '距离', v: 20, unit: 'px' }, softness: { type: 'num', label: '柔和度', v: 15, min: 0, unit: 'px' } } },
    hsl: { name: '色相/饱和度/亮度', params: { hue: { type: 'num', label: '色相', v: 0, min: -180, max: 180, unit: '°' }, sat: { type: 'num', label: '饱和度', v: 0, min: -100, max: 100, unit: '%' }, light: { type: 'num', label: '亮度', v: 0, min: -100, max: 100, unit: '%' } } },
  };
  // 形状项定义
  Model.SHAPE_ITEMS = {
    group: { name: '组', kind: 'group', params: { anchor: { type: 'vec', dim: 2, label: '锚点', v: [0, 0], spatial: true }, position: { type: 'vec', dim: 2, label: '位置', v: [0, 0], spatial: true }, scale: { type: 'vec', dim: 2, label: '缩放', v: [100, 100], unit: '%' }, rotation: { type: 'num', label: '旋转', v: 0, unit: '°' }, opacity: { type: 'num', label: '不透明度', v: 100, unit: '%', min: 0, max: 100 } } },
    rect: { name: '矩形', kind: 'gen', params: { size: { type: 'vec', dim: 2, label: '尺寸', v: [200, 120] }, pos: { type: 'vec', dim: 2, label: '位置', v: [0, 0] }, round: { type: 'num', label: '圆角', v: 0, min: 0 } } },
    ellipse: { name: '椭圆', kind: 'gen', params: { size: { type: 'vec', dim: 2, label: '尺寸', v: [160, 160] }, pos: { type: 'vec', dim: 2, label: '位置', v: [0, 0] } } },
    star: { name: '星形/多边形', kind: 'gen', params: { points: { type: 'num', label: '顶点数', v: 5, min: 3, max: 40, step: 1 }, outer: { type: 'num', label: '外半径', v: 100 }, inner: { type: 'num', label: '内半径', v: 45 }, rot: { type: 'num', label: '旋转', v: 0, unit: '°' }, pos: { type: 'vec', dim: 2, label: '位置', v: [0, 0] } } },
    path: { name: '路径', kind: 'gen', params: { path: { type: 'path', label: '路径', v: { contours: [] } } } },
    glyphs: { name: '文字笔画(来自文字图层)', kind: 'gen', params: { size: { type: 'num', label: '缩放', v: 100, unit: '%' }, pos: { type: 'vec', dim: 2, label: '位置', v: [0, 0] } }, statics: { source: '', mode: 'strokes' } },
    fill: { name: '填充', kind: 'paint', params: { color: { type: 'color', label: '颜色', v: [1, 0.6, 0.2, 1] }, opacity: { type: 'num', label: '不透明度', v: 100, unit: '%', min: 0, max: 100 } }, statics: { rule: 'nonzero', gradient: null } },
    stroke: { name: '描边', kind: 'paint', params: { color: { type: 'color', label: '颜色', v: [1, 1, 1, 1] }, width: { type: 'num', label: '宽度', v: 8, min: 0 }, opacity: { type: 'num', label: '不透明度', v: 100, unit: '%', min: 0, max: 100 }, dash: { type: 'num', label: '虚线', v: 0, min: 0 }, dashOff: { type: 'num', label: '虚线偏移', v: 0 } }, statics: { cap: 'round', join: 'round' } },
    trim: { name: '修剪路径', kind: 'mod', params: { start: { type: 'num', label: '起点', v: 0, unit: '%', step: 0.5 }, end: { type: 'num', label: '终点', v: 100, unit: '%', step: 0.5 }, offset: { type: 'num', label: '偏移', v: 0, unit: '°', step: 1 } }, statics: { mode: 'sim' } },
    repeater: { name: '重复器', kind: 'mod', params: { copies: { type: 'num', label: '副本数', v: 3, min: 0, max: 200, step: 1 }, offset: { type: 'num', label: '偏移', v: 0, step: 0.1 }, position: { type: 'vec', dim: 2, label: '位置', v: [60, 0] }, scale: { type: 'vec', dim: 2, label: '缩放', v: [100, 100], unit: '%' }, rotation: { type: 'num', label: '旋转', v: 0, unit: '°' }, opStart: { type: 'num', label: '起始不透明度', v: 100, unit: '%' }, opEnd: { type: 'num', label: '结束不透明度', v: 100, unit: '%' } } },
    merge: { name: '合并路径', kind: 'mod', params: {}, statics: { op: 'union' } },
    offset: { name: '位移路径', kind: 'mod', params: { amount: { type: 'num', label: '偏移量', v: 10 } } },
  };
  const MASK_PARAMS = { path: { type: 'path', label: '蒙版路径' }, feather: { type: 'num', label: '蒙版羽化', min: 0, unit: 'px', step: 0.5 }, opacity: { type: 'num', label: '蒙版不透明度', unit: '%', min: 0, max: 100 }, expand: { type: 'num', label: '蒙版扩展', unit: 'px' } };
  const AN_PARAMS = { start: { type: 'num', label: '起点', unit: '%', step: 0.5 }, end: { type: 'num', label: '终点', unit: '%', step: 0.5 }, offset: { type: 'num', label: '偏移', unit: '%', step: 0.5 }, soft: { type: 'num', label: '柔和度', unit: '%', min: 0, max: 100 }, pos: { type: 'vec', dim: 2, label: '位置', step: 1 }, rot: { type: 'num', label: '旋转', unit: '°' }, scale: { type: 'vec', dim: 2, label: '缩放', unit: '%' }, opacity: { type: 'num', label: '不透明度', unit: '%' } };
  const EM_PARAMS = { rate: { type: 'num', label: '发射速率', unit: '个/秒', min: 0, step: 1 }, speed: { type: 'num', label: '初速度', min: 0, step: 1 }, speedVar: { type: 'num', label: '速度随机', unit: '%', min: 0, max: 100 }, spread: { type: 'num', label: '散射角', unit: '°', min: 0, max: 180 }, size: { type: 'num', label: '大小', min: 0, step: 0.1 }, pos: { type: 'vec', dim: 3, label: '位置', step: 1, spatial: true }, dir: { type: 'vec', dim: 3, label: '方向', step: 0.05 }, inherit: { type: 'num', label: '继承速度', min: 0, max: 2, step: 0.05 } };

  const FC_PARAMS = { strength: { type: 'num', label: '强度', step: 5 }, dir: { type: 'vec', dim: 3, label: '方向', step: 0.05 }, pos: { type: 'vec', dim: 3, label: '位置', step: 1, spatial: true }, radius: { type: 'num', label: '半径/尺度', min: 1, step: 10 } };
  Model.propInfo = (owner, key) => {
    if (T[key]) return T[key];
    const m = /^(fx|mk|sh|an|em|fc)\.([^.]+)\.(.+)$/.exec(key);
    if (m) {
      const [, kind, id, name] = m;
      if (kind === 'fx') { const fx = (owner.effects || []).find(e => e.id === id); const d = fx && Model.EFFECTS[fx.type]; return d && d.params[name] || { type: 'num', label: name }; }
      if (kind === 'mk') return MASK_PARAMS[name] || { type: 'num', label: name };
      if (kind === 'an') return AN_PARAMS[name] || { type: 'num', label: name };
      if (kind === 'em') return EM_PARAMS[name] || { type: 'num', label: name };
      if (kind === 'fc') return FC_PARAMS[name] || { type: 'num', label: name };
      if (kind === 'sh') { const it = Model.findShapeItem(owner, id); const d = it && Model.SHAPE_ITEMS[it.type]; return d && d.params[name] || { type: 'num', label: name }; }
    }
    if (owner.nodeType) { const d = AE.NodeDefs && AE.NodeDefs[owner.nodeType]; const pd = d && d.params && d.params[key]; if (pd) return pd; if (/^pin\./.test(key)) { const pn = key.split('.')[2]; return { type: pn === 'rot' ? 'num' : pn === 'scale' ? 'num' : 'vec', dim: 2, label: pn === 'pos' ? '图钉位移' : pn === 'rot' ? '图钉旋转' : '图钉缩放', spatial: false, step: 1 }; } }
    return { type: 'num', label: key };
  };
  Model.findShapeItem = (layer, id) => { let found = null; const rec = items => { for (const it of items) { if (it.id === id) { found = it; return; } if (it.items) rec(it.items); } }; if (layer.shape) rec(layer.shape.items); return found; };
  Model.walkShape = (layer, fn) => { const rec = (items, parent) => { for (const it of items) { fn(it, parent); if (it.items) rec(it.items, it); } }; if (layer.shape) rec(layer.shape.items, null); };

  // ===== 合成 / 图层 / 工程 =====
  Model.BLENDS = [['normal', '正常'], ['add', '相加'], ['screen', '滤色'], ['multiply', '正片叠底'], ['overlay', '叠加']];
  Model.LAYER_TYPES = { shape: '形状', text: '文字', null: '空对象', adjust: '调整', precomp: '预合成', camera: '摄像机', light: '灯光', geo: '三维几何', particles: '粒子', audio: '音色' };
  Model.LABELS = ['#e0615c', '#e9a24a', '#e6d44f', '#7cc36b', '#4fb7b0', '#5a8fe0', '#9a78e0', '#d878b8'];

  Model.newComp = (o = {}) => ({
    id: o.id || U.uid('C'), name: o.name || '合成 1', w: o.w || 1920, h: o.h || 1080, fps: o.fps || 30, dur: o.dur || 10,
    work: o.work || [0, o.dur || 10], bg: o.bg || [0.06, 0.07, 0.09], mb: { on: false, angle: 180, phase: -90, samples: 12 }, layers: [],
  });
  Model.newProject = () => {
    const c = Model.newComp({ name: '合成 1' });
    return { v: 1, name: '未命名工程', comps: [c], active: c.id, graph: { nodes: [] }, env: Model.defaultEnv(), view: {} };
  };
  Model.defaultEnv = () => ({
    sky: [0.10, 0.12, 0.17], horizon: [0.30, 0.28, 0.27], ground: [0.03, 0.03, 0.035], intensity: 1,
    lobes: [{ dir: [-0.5, -0.75, -0.45], color: [1, 0.96, 0.9], power: 24, gain: 2.2 }, { dir: [0.7, -0.3, 0.6], color: [0.55, 0.7, 1], power: 12, gain: 0.9 }, { dir: [0.1, 0.65, -0.6], color: [1, 0.55, 0.22], power: 8, gain: 0.9 }],
  });
  Model.layerLabel = type => ({ shape: 5, text: 6, null: 1, adjust: 2, precomp: 3, camera: 4, light: 2, geo: 0, particles: 7, audio: 3 })[type] || 0;

  // 新建图层。comp 用于默认位置
  Model.newLayer = (type, comp, o = {}) => {
    const cx = comp ? comp.w / 2 : 960, cy = comp ? comp.h / 2 : 540;
    const L = {
      id: U.uid('L'), name: o.name || Model.LAYER_TYPES[type], type, visible: true, locked: false, solo: false, label: Model.layerLabel(type),
      in: o.in !== undefined ? o.in : 0, out: o.out !== undefined ? o.out : (comp ? comp.dur : 10), start: o.start || 0,
      parent: null, is3D: type === 'camera' || type === 'light' || type === 'geo' || type === 'particles' ? true : !!o.is3D, blend: 'normal', mb: false,
      matte: { mode: 'none', layer: null, inv: false }, props: {}, masks: [], effects: [], nid: 0,
    };
    const P = Model.P; const pr = L.props;
    pr['transform.anchor'] = P([0, 0, 0]); pr['transform.position'] = P([cx, cy, 0]); pr['transform.scale'] = P([100, 100, 100]);
    pr['transform.rotation'] = P(0); pr['transform.rotX'] = P(0); pr['transform.rotY'] = P(0); pr['transform.opacity'] = P(100);
    if (type === 'camera') {
      pr['cam.fov'] = P(30); pr['cam.target'] = P([cx, cy, 0]); pr['cam.focus'] = P(1800); pr['cam.aperture'] = P(0); pr['cam.roll'] = P(0);
      const d = (comp ? comp.h : 1080) / 2 / Math.tan(15 * U.DEG); pr['transform.position'] = P([cx, cy, -d]); L.cam = { dof: false };
    } else if (type === 'light') {
      L.light = { type: o.lightType || 'dir', shadow: true }; pr['light.color'] = P([1, 1, 1, 1]); pr['light.intensity'] = P(3); pr['light.target'] = P([cx, cy, 0]); pr['light.radius'] = P(3000); pr['light.soft'] = P(2);
      pr['transform.position'] = P([cx - 500, cy - 800, -700]);
    } else if (type === 'shape') { L.shape = { items: [] }; }
    else if (type === 'text') {
      L.text = { text: o.text || '文字', font: 'forge', align: 'center' };
      pr['text.size'] = P(120); pr['text.tracking'] = P(0); pr['text.leading'] = P(1.2); pr['text.fill'] = P([1, 1, 1, 1]); pr['text.strokeW'] = P(0); pr['text.stroke'] = P([0, 0, 0, 1]); L.animators = [];
    } else if (type === 'geo' || type === 'particles') {
      if (type === 'geo') { L.geo = { node: null, cast: true, receive: true, pick: true }; Model.addMaterialProps(L); }
    } else if (type === 'precomp') { L.comp = o.comp || null; L.stretch = 100; L.remap = { on: false }; pr['remap.t'] = P(0); }
    else if (type === 'audio') { L.au = { voice: 'anvil', events: [], params: {}, seed: 1 }; pr['au.level'] = P(0); pr['au.pan'] = P(0); }
    if (type === 'particles') Model.initParticles(L);
    if (type === 'adjust') L.adjust = true;
    return L;
  };
  Model.addMaterialProps = L => { const P = Model.P; L.props['mat.base'] = P([0.75, 0.76, 0.8, 1]); L.props['mat.metal'] = P(1); L.props['mat.rough'] = P(0.35); L.props['mat.emit'] = P([1, 0.4, 0.1, 1]); L.props['mat.emitI'] = P(0); L.props['mat.opacity'] = P(1); };
  Model.initParticles = L => {
    const P = Model.P, p = L.props;
    L.ps = { seed: 7, max: 4000, emitters: [], forces: [], colliders: [], blend: 'add', fieldGain: 1, round: true };
    p['ps.life'] = P(1.2); p['ps.lifeVar'] = P(40); p['ps.drag'] = P(0.4); p['ps.gravity'] = P([0, 900, 0]);
    p['ps.sizeStart'] = P(5); p['ps.sizeEnd'] = P(1); p['ps.colorStart'] = P([1, 0.85, 0.5, 1]); p['ps.colorEnd'] = P([1, 0.25, 0.05, 1]); p['ps.alphaStart'] = P(1); p['ps.alphaEnd'] = P(0);
    p['ps.bounce'] = P(0.45); p['ps.friction'] = P(0.25); p['ps.trailLen'] = P(8); p['ps.trailW'] = P(2); p['ps.trailFade'] = P(1); p['ps.trailColor'] = P([1, 0.6, 0.2, 1]);
    p['ps.hitColor'] = P([1, 0.95, 0.8, 1]); p['ps.hitLife'] = P(1); p['ps.subRate'] = P(0);
  };
  Model.addEmitter = (L, o = {}) => {
    const id = Model.subId(L, 'em'); const P = Model.P;
    L.ps.emitters.push(Object.assign({ id, name: o.name || '发射器 ' + (L.ps.emitters.length + 1), kind: 'point', node: null, region: 'all' }, o.data || {}));
    const pr = L.props; pr[`em.${id}.rate`] = P(o.rate !== undefined ? o.rate : 60); pr[`em.${id}.speed`] = P(o.speed !== undefined ? o.speed : 200); pr[`em.${id}.speedVar`] = P(40); pr[`em.${id}.spread`] = P(o.spread !== undefined ? o.spread : 40);
    pr[`em.${id}.size`] = P(1); pr[`em.${id}.pos`] = P(o.pos || [0, 0, 0]); pr[`em.${id}.dir`] = P(o.dir || [0, -1, 0]); pr[`em.${id}.inherit`] = P(1);
    return id;
  };
  Model.addEffect = (L, type, o = {}) => {
    const def = Model.EFFECTS[type]; const id = Model.subId(L, 'fx'); L.effects.push({ id, type, name: o.name || def.name, on: true });
    for (const [k, d] of Object.entries(def.params)) L.props[`fx.${id}.${k}`] = Model.P(cloneV(o[k] !== undefined ? o[k] : d.v));
    return id;
  };
  Model.addMask = (L, shape, o = {}) => {
    const id = Model.subId(L, 'mk'); L.masks.push({ id, name: o.name || '蒙版 ' + (L.masks.length + 1), mode: o.mode || 'add', inv: !!o.inv });
    L.props[`mk.${id}.path`] = Model.P(shape); L.props[`mk.${id}.feather`] = Model.P(o.feather || 0); L.props[`mk.${id}.opacity`] = Model.P(100); L.props[`mk.${id}.expand`] = Model.P(0);
    return id;
  };
  Model.addAnimator = (L, o = {}) => {
    const id = Model.subId(L, 'an'); L.animators.push({ id, name: o.name || '动画制作工具 ' + (L.animators.length + 1), basedOn: o.basedOn || 'char' });
    const P = Model.P, pr = L.props; pr[`an.${id}.start`] = P(0); pr[`an.${id}.end`] = P(100); pr[`an.${id}.offset`] = P(0); pr[`an.${id}.soft`] = P(0);
    pr[`an.${id}.pos`] = P([0, 0]); pr[`an.${id}.rot`] = P(0); pr[`an.${id}.scale`] = P([100, 100]); pr[`an.${id}.opacity`] = P(100);
    return id;
  };
  // 添加形状项；parent: 组项或 null（顶层）；index: 插入位置（默认顶部）
  Model.addShapeItem = (L, type, parent, o = {}) => {
    const def = Model.SHAPE_ITEMS[type]; const id = Model.subId(L, 'sh');
    const item = Object.assign({ id, type, name: o.name || def.name, on: true }, def.statics ? U.clone(def.statics) : {});
    if (type === 'group') item.items = [];
    const list = parent ? parent.items : L.shape.items; const idx = o.index === undefined ? 0 : o.index; list.splice(idx, 0, item);
    for (const [k, d] of Object.entries(def.params)) L.props[`sh.${id}.${k}`] = Model.P(cloneV(o.params && o.params[k] !== undefined ? o.params[k] : d.v));
    if (o.statics) Object.assign(item, o.statics);
    return item;
  };
  // 方便函数：创建一个含内容的组
  Model.addShapeGroup = (L, name) => Model.addShapeItem(L, 'group', null, { name });

  // ===== 工具：查找 =====
  Model.comp = (proj, id) => proj.comps.find(c => c.id === id);
  Model.layer = (comp, id) => comp.layers.find(l => l.id === id);
  Model.layerByName = (comp, name) => comp.layers.find(l => l.name === name);
  Model.layerChain = (comp, L) => { const out = []; let c = L; let g = 0; while (c && g++ < 64) { out.push(c); c = c.parent ? Model.layer(comp, c.parent) : null; } return out; };
  Model.isDescendant = (comp, L, anc) => { let c = L.parent ? Model.layer(comp, L.parent) : null; let g = 0; while (c && g++ < 64) { if (c.id === anc.id) return true; c = c.parent ? Model.layer(comp, c.parent) : null; } return false; };
  Model.node = (proj, id) => proj.graph.nodes.find(n => n.id === id);

  Model.cloneLayer = (L, newName) => { const c = JSON.parse(JSON.stringify(L)); c.id = U.uid('L'); if (newName) c.name = newName; return c; };
  Model.uniqueName = (comp, base) => { let n = base, i = 2; const has = nm => comp.layers.some(l => l.name === nm); if (!has(n)) return n; const m = /^(.*?)(\d+)$/.exec(base); const stem = m ? m[1] : base + ' '; i = m ? +m[2] + 1 : 2; while (has(stem + i)) i++; return stem + i; };

  // 键值读写辅助：在 t 时刻设置属性（动画开启则创建/更新关键帧）
  Model.setPropAt = (owner, key, t, value, opts = {}) => {
    const p = owner.props[key]; if (!p) return;
    const info = Model.propInfo(owner, key);
    if (Model.isAnimated(p)) {
      const i = Model.keyAt(p, t, opts.tol || 0.5 / (opts.fps || 30) * 0.99);
      if (i >= 0) p.k[i].v = cloneV(value);
      else { const k = Model.defKey(t, cloneV(value), info.spatial); if (opts.keyDefaults) Object.assign(k, opts.keyDefaults); p.k.push(k); }
      Model.normalizeProp(p, info);
    } else p.v = cloneV(value);
  };
  Model.toggleAnim = (owner, key, t, curVal) => {
    const p = owner.props[key]; const info = Model.propInfo(owner, key);
    if (Model.isAnimated(p)) { p.v = cloneV(curVal !== undefined ? curVal : p.k[0].v); delete p.k; }
    else { p.k = [Model.defKey(t, cloneV(curVal !== undefined ? curVal : p.v), info.spatial)]; Model.normalizeProp(p, info); }
  };
  Model.addKeyAt = (owner, key, t, value) => { const p = owner.props[key]; const info = Model.propInfo(owner, key); if (!p.k) p.k = []; if (Model.keyAt(p, t) < 0) p.k.push(Model.defKey(t, cloneV(value), info.spatial)); Model.normalizeProp(p, info); };
  Model.removeKeyAt = (owner, key, t) => { const p = owner.props[key]; const i = Model.keyAt(p, t); if (i >= 0) { p.k.splice(i, 1); if (!p.k.length) { delete p.k; } else Model.normalizeProp(p, Model.propInfo(owner, key)); } };

  // 列出图层的所有属性分组（供属性面板与时间轴使用）
  // 返回 [{id,title,props:[{key,label,info}] , sub:[...]}]
  Model.layerSchema = (L) => {
    const g = [];
    const tp = [];
    const tinfo = k => ({ key: k, info: T[k] });
    if (L.type !== 'audio') {
      if (L.type === 'camera') tp.push(tinfo('transform.position'));
      else if (L.type === 'light') tp.push(tinfo('transform.position'));
      else if (L.type === 'null' || L.type === 'adjust' && false) tp.push(tinfo('transform.anchor'), tinfo('transform.position'), tinfo('transform.scale'), tinfo('transform.rotation'));
      else if (L.type === 'adjust') { tp.push(tinfo('transform.opacity')); }
      else { tp.push(tinfo('transform.anchor'), tinfo('transform.position'), tinfo('transform.scale')); if (L.is3D) tp.push(tinfo('transform.rotX'), tinfo('transform.rotY')); tp.push(tinfo('transform.rotation')); tp.push(tinfo('transform.opacity')); }
      if (L.type === 'null' && L.is3D) tp.splice(4, 0, tinfo('transform.rotX'), tinfo('transform.rotY'));
      if (L.type === 'camera' || L.type === 'light') { /* 仅位置 */ }
      g.push({ id: 'transform', title: '变换', props: tp });
    }
    if (L.type === 'camera') g.push({ id: 'camera', title: '摄像机选项', props: ['cam.target', 'cam.fov', 'cam.roll', 'cam.focus', 'cam.aperture'].map(tinfo) });
    if (L.type === 'light') g.push({ id: 'light', title: '灯光选项', props: ['light.color', 'light.intensity', 'light.target', 'light.radius', 'light.soft'].map(tinfo) });
    if (L.type === 'text') {
      g.push({ id: 'text', title: '文字', props: ['text.size', 'text.tracking', 'text.leading', 'text.fill', 'text.strokeW', 'text.stroke'].map(tinfo) });
      for (const a of L.animators || []) g.push({ id: 'an.' + a.id, title: '动画：' + a.name, props: Object.keys(AN_PARAMS).map(n => ({ key: `an.${a.id}.${n}`, info: AN_PARAMS[n] })) });
    }
    if (L.type === 'geo') g.push({ id: 'material', title: '材质', props: ['mat.base', 'mat.metal', 'mat.rough', 'mat.emit', 'mat.emitI', 'mat.opacity'].map(tinfo) });
    if (L.type === 'precomp' && L.remap && L.remap.on) g.push({ id: 'remap', title: '时间重映射', props: [tinfo('remap.t')] });
    if (L.type === 'particles') {
      g.push({ id: 'ps', title: '粒子', props: ['ps.life', 'ps.lifeVar', 'ps.drag', 'ps.gravity', 'ps.sizeStart', 'ps.sizeEnd', 'ps.colorStart', 'ps.colorEnd', 'ps.alphaStart', 'ps.alphaEnd', 'ps.bounce', 'ps.friction', 'ps.hitColor', 'ps.hitLife', 'ps.subRate'].map(tinfo) });
      g.push({ id: 'trail', title: '拖尾', props: ['ps.trailLen', 'ps.trailW', 'ps.trailFade', 'ps.trailColor'].map(tinfo) });
      for (const e of L.ps.emitters) g.push({ id: 'em.' + e.id, title: '发射器：' + e.name, props: Object.keys(EM_PARAMS).map(n => ({ key: `em.${e.id}.${n}`, info: EM_PARAMS[n] })) });
      for (const f of L.ps.forces) g.push({ id: 'fc.' + f.id, title: '力：' + f.name, props: Object.keys(FC_PARAMS).filter(n => f.type === 'directional' ? ['strength', 'dir'].includes(n) : f.type === 'attract' ? ['strength', 'pos', 'radius'].includes(n) : f.type === 'turbulence' ? ['strength', 'radius'].includes(n) : n === 'strength').map(n => ({ key: `fc.${f.id}.${n}`, info: FC_PARAMS[n] })) });
    }
    if (L.type === 'audio') g.push({ id: 'audio', title: '音色', props: ['au.level', 'au.pan'].map(tinfo) });
    if (L.type === 'shape') {
      const rec = (items, prefix) => {
        const out = [];
        for (const it of items) {
          const def = Model.SHAPE_ITEMS[it.type];
          const ps = Object.entries(def.params).map(([n, d]) => ({ key: `sh.${it.id}.${n}`, info: d }));
          out.push({ id: 'sh.' + it.id, title: it.name, item: it, props: ps, children: it.items ? rec(it.items) : null });
        }
        return out;
      };
      g.push({ id: 'contents', title: '内容', children: rec(L.shape.items), props: [] });
    }
    if (L.masks.length) g.push({ id: 'masks', title: '蒙版', children: L.masks.map(m => ({ id: 'mk.' + m.id, title: m.name, mask: m, props: Object.keys(MASK_PARAMS).map(n => ({ key: `mk.${m.id}.${n}`, info: MASK_PARAMS[n] })) })), props: [] });
    if (L.effects.length) g.push({ id: 'effects', title: '效果', children: L.effects.map(e => ({ id: 'fx.' + e.id, title: e.name, effect: e, props: Object.entries(Model.EFFECTS[e.type].params).map(([n, d]) => ({ key: `fx.${e.id}.${n}`, info: d })) })), props: [] });
    return g;
  };
  // 扁平列出所有属性 key（含路径）
  Model.allPropKeys = L => { const out = []; const rec = gs => { for (const gr of gs) { for (const p of gr.props) out.push(p.key); if (gr.children) rec(gr.children); } }; rec(Model.layerSchema(L)); return out; };

  // ===== 序列化与历史 =====
  Model.serialize = proj => JSON.stringify(proj);
  Model.deserialize = s => JSON.parse(s);

  class History {
    constructor(getProj, setProj) { this.get = getProj; this.set = setProj; this.past = []; this.future = []; this.cur = null; this.labels = []; this.curLabel = ''; this.flabels = []; }
    reset() { this.cur = Model.serialize(this.get()); this.past = []; this.future = []; this.labels = []; this.flabels = []; }
    // 完成一次改动：若状态变化则压栈
    commit(label) {
      const s = Model.serialize(this.get()); if (s === this.cur) return false;
      this.past.push(this.cur); this.labels.push(this.curLabel); this.curLabel = label || '编辑'; this.cur = s; this.future = []; this.flabels = []; if (this.past.length > 120) { this.past.shift(); this.labels.shift(); } return true;
    }
    undo() { if (!this.past.length) return false; this.future.push(this.cur); this.flabels.push(this.curLabel); this.cur = this.past.pop(); this.curLabel = this.labels.pop(); this.set(Model.deserialize(this.cur)); return true; }
    redo() { if (!this.future.length) return false; this.past.push(this.cur); this.labels.push(this.curLabel); this.cur = this.future.pop(); this.curLabel = this.flabels.pop(); this.set(Model.deserialize(this.cur)); return true; }
  }
  Model.History = History;
})();
