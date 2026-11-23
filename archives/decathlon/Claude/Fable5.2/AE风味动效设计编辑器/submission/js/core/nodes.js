// 程序节点：类型定义、按连线求值、内容签名缓存、节点组
// 节点: { id, type, name, x, y, p:{参数属性}, s:{静态设置}, in:{端口: {n,p} | [{n,p}...]}, pins?, sub? }
// 几何值: {type:'path', contours, xf?} | {type:'mesh2', verts, tris, loops, xf?} | {type:'mesh3', pos, nrm, idx, heat?} | {type:'points', pos, nrm?}
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const M4 = MF.M4, Pth = MF.Path, V = (p, t) => MF.Eval.val(p, t);
  const N = (key, label, def, o) => Object.assign({ key, label, type: 'num', def }, o || {});
  const V2 = (key, label, def, o) => Object.assign({ key, label, type: 'vec2', def }, o || {});
  const V3 = (key, label, def, o) => Object.assign({ key, label, type: 'vec3', def }, o || {});
  const C = (key, label, def, o) => Object.assign({ key, label, type: 'color', def }, o || {});
  const S = (key, label, kind, def, options) => ({ key, label, kind, def, options });
  const GEO = (key, label, o) => Object.assign({ key, label, type: 'geo' }, o || {});
  const FLD = (key, label, o) => Object.assign({ key, label, type: 'field' }, o || {});
  const AX = [['0', 'X'], ['1', 'Y'], ['2', 'Z']];

  // ---------- 几何转换 ----------
  const G = {
    contours(g) { if (!g) return []; if (g.type === 'path') return g.contours; if (g.type === 'mesh2') return MF.Tri.toContours(g); return []; },
    mesh2(g, maxEdge) {
      if (!g) return null;
      if (g.type === 'mesh2') return g;
      if (g.type === 'path') { const cs = g.contours.filter((c) => c.closed !== false); if (!cs.length) return null; let m = MF.Tri.triangulate(cs); if (maxEdge > 0) m = MF.Tri.refine(m, maxEdge); if (g.xf) m.xf = g.xf; return m; }
      return null;
    },
    mesh3(g) {
      if (!g) return null;
      if (g.type === 'mesh3') return g;
      const m2 = G.mesh2(g); if (!m2 || !m2.tris.length) return null;
      let m = MF.Solid.fromMesh2(m2); if (m2.xf) m = MF.Solid.transform(m, m2.xf); return m;
    },
    xfOf(g) { return g && g.xf ? g.xf : null; },
    describe(v) {
      if (v === undefined || v === null) return '无输入';
      if (typeof v === 'number') return '数值 ' + MF.fmt(v, 3);
      if (Array.isArray(v)) return (v.length === 4 ? '颜色 ' : '向量 ') + '[' + v.map((x) => MF.fmt(x, 2)).join(', ') + ']';
      if (v.type === 'path') { let n = 0; for (const c of v.contours) n += c.pts.length >> 1; return '路径 · ' + v.contours.length + ' 轮廓 / ' + n + ' 点' + (v.xf ? ' · 三维摆放' : ''); }
      if (v.type === 'mesh2') return '平面网格 · ' + (v.verts.length >> 1) + ' 顶点 / ' + v.tris.length / 3 + ' 三角 / ' + v.loops.length + ' 边界环';
      if (v.type === 'mesh3') return '实体 · ' + v.pos.length / 3 + ' 顶点 / ' + v.idx.length / 3 + ' 三角' + (v.heat ? ' · 含热度' : '');
      if (v.type === 'points') return '点集 · ' + v.pos.length / 3 + ' 点';
      if (v.eval) return '场 · ' + ({ falloff: '距离衰减', noise: '噪声', vortex: '旋涡', mix: '混合', const: '常量' }[v.kind] || v.kind);
      return String(v);
    },
  };
  function layerAffine(comp, L, t) { const m = MF.Scene.worldMatrix(comp, L, t); return [m[0], m[1], m[4], m[5], m[12], m[13]]; }
  function isIdent(m) { for (let i = 0; i < 16; i++) if (Math.abs(m[i] - (i % 5 === 0 ? 1 : 0)) > 1e-9) return false; return true; }

  // ---------- 节点类型 ----------
  const T = {};
  const def = (type, d) => { d.type = type; d.ins = d.ins || []; d.outs = d.outs || []; d.params = d.params || []; d.statics = d.statics || []; T[type] = d; };

  // 输入
  def('layerShape', { label: '图层路径', cat: '输入', outs: [GEO('geo', '轮廓')], statics: [S('layer', '来源图层', 'layer', null, ['shape', 'text']), S('space', '坐标空间', 'enum', 'comp', [['comp', '合成空间（含图层变换）'], ['layer', '图层空间']])],
    extra(a) { const L = MF.Model.getLayer(a.comp, a.s.layer); return L ? layerSig(a.comp, L, a.t) + (a.s.space === 'comp' ? JSON.stringify(Array.from(layerAffine(a.comp, L, a.t)).map((x) => +x.toFixed(5))) : '') : ''; },
    ev(a) { const L = MF.Model.getLayer(a.comp, a.s.layer); if (!L) return { geo: null }; let cs = MF.Scene.layerContours(a.comp, L, a.t); if (a.s.space === 'comp') cs = Pth.xf(cs, layerAffine(a.comp, L, a.t)); return { geo: { type: 'path', contours: cs } }; } });
  def('textGlyph', { label: '文字字形', cat: '输入', outs: [GEO('geo', '字形轮廓')], params: [N('size', '字号', 300, { min: 1 }), N('tracking', '字距', 0)], statics: [S('text', '文字', 'text', '字'), S('font', '字体', 'font', 'kai')],
    ev(a) { const cs = []; let x = 0; const size = a.p('size'), chars = Array.from(String(a.s.text)); const widths = chars.map((ch) => MF.Fonts.glyph(a.s.font, ch).adv * size + (a.p('tracking') / 1000) * size); const total = widths.reduce((p, c) => p + c, 0); x = -total / 2; chars.forEach((ch, i) => { for (const c of Pth.xf(MF.Fonts.outline(a.s.font, ch), [size, 0, 0, size, x, size * 0.36])) cs.push(c); x += widths[i]; }); return { geo: { type: 'path', contours: cs } }; } });
  def('writeOn', { label: '笔画书写', cat: '输入', outs: [GEO('geo', '已写字形'), { key: 'tip', label: '笔尖位置', type: 'vec' }, GEO('tipGeo', '笔尖段'), { key: 'count', label: '笔画数', type: 'num' }],
    params: [N('progress', '进度', 100, { min: 0, max: 100, unit: '%' }), N('brush', '笔宽', 24, { min: 2, max: 80, unit: '%字号' }), N('bold', '加粗', 0, { unit: 'px' })],
    statics: [S('layer', '文字图层', 'layer', null, ['text']), S('space', '坐标空间', 'enum', 'layer', [['comp', '合成空间（含图层变换）'], ['layer', '图层空间']])],
    extra(a) { const L = MF.Model.getLayer(a.comp, a.s.layer); return L ? layerSig(a.comp, L, a.t) + (a.s.space === 'comp' ? JSON.stringify(Array.from(layerAffine(a.comp, L, a.t)).map((x) => +x.toFixed(5))) : '') : ''; },
    ev(a) { return writeOn(a); } });
  def('rectN', { label: '矩形', cat: '输入', outs: [GEO('geo', '轮廓')], params: [V2('size', '大小', [300, 200]), N('round', '圆角', 0, { min: 0 }), V2('center', '中心', [0, 0])], ev(a) { const s = a.p('size'), c = a.p('center'); return { geo: { type: 'path', contours: Pth.flattenValue(Pth.rect(s[0], s[1], a.p('round'), c[0], c[1]), 0.15) } }; } });
  def('ellipseN', { label: '椭圆', cat: '输入', outs: [GEO('geo', '轮廓')], params: [V2('size', '大小', [300, 300]), V2('center', '中心', [0, 0])], ev(a) { const s = a.p('size'), c = a.p('center'); return { geo: { type: 'path', contours: Pth.flattenValue(Pth.ellipse(s[0], s[1], c[0], c[1]), 0.1) } }; } });
  def('starN', { label: '星形', cat: '输入', outs: [GEO('geo', '轮廓')], params: [N('points', '点数', 5, { min: 3, step: 1 }), N('outer', '外径', 160), N('inner', '内径', 70), N('rotation', '旋转', 0, { unit: '°' })], ev(a) { return { geo: { type: 'path', contours: Pth.flattenValue(Pth.star(a.p('points'), a.p('outer'), a.p('inner'), a.p('rotation'), 0, 0, false)) } }; } });
  def('box', { label: '方块', cat: '输入', outs: [GEO('geo', '实体')], params: [V3('size', '尺寸', [300, 100, 300]), V3('segs', '分段', [1, 1, 1], { step: 1, min: 1 })], ev(a) { const s = a.p('size'), g = a.p('segs'); return { geo: MF.Solid.box(s[0], s[1], s[2], g[0], g[1], g[2]) }; } });
  def('sphere', { label: '球', cat: '输入', outs: [GEO('geo', '实体')], params: [N('radius', '半径', 100, { min: 0 }), N('segs', '分段', 32, { min: 6, step: 1 })], ev(a) { return { geo: MF.Solid.sphere(a.p('radius'), a.p('segs')) }; } });
  def('cylinder', { label: '圆柱', cat: '输入', outs: [GEO('geo', '实体')], params: [N('radius', '半径', 60, { min: 0 }), N('height', '高度', 240, { min: 0 }), N('bevel', '倒角', 0, { min: 0 }), N('segs', '分段', 32, { min: 6, step: 1 }), N('hsegs', '高度分段', 1, { min: 1, step: 1 })], ev(a) { return { geo: MF.Solid.cylinder(a.p('radius'), a.p('height'), a.p('segs'), a.p('hsegs'), a.p('bevel')) }; } });
  def('plane', { label: '平面', cat: '输入', outs: [GEO('geo', '实体')], params: [V2('size', '尺寸', [1200, 1200]), V2('segs', '分段', [1, 1], { step: 1, min: 1 })], statics: [S('axis', '朝向', 'enum', 'xz', [['xz', '水平（XZ）'], ['xy', '竖直（XY）']])], ev(a) { const s = a.p('size'), g = a.p('segs'); return { geo: MF.Solid.plane(s[0], s[1], g[0], g[1], a.s.axis) }; } });
  def('value', { label: '数值', cat: '数值', outs: [{ key: 'out', label: '数值', type: 'num' }], params: [N('value', '数值', 1, { step: 0.1 })], ev(a) { return { out: a.p('value') }; } });
  def('vector', { label: '向量', cat: '数值', outs: [{ key: 'out', label: '向量', type: 'vec' }], params: [V3('value', '向量', [0, 0, 0])], ev(a) { return { out: a.p('value') }; } });
  def('colorN', { label: '颜色', cat: '数值', outs: [{ key: 'out', label: '颜色', type: 'color' }], params: [C('value', '颜色', [1, 0.5, 0.2, 1])], ev(a) { return { out: a.p('value') }; } });
  def('timeN', { label: '时间', cat: '数值', outs: [{ key: 'out', label: '秒', type: 'num' }], timeDep: true, ev(a) { return { out: a.t }; } });
  def('math', { label: '数学', cat: '数值', outs: [{ key: 'out', label: '结果', type: 'num' }], params: [N('a', 'A', 0, { step: 0.1 }), N('b', 'B', 1, { step: 0.1 })], statics: [S('op', '运算', 'enum', 'mul', [['add', 'A + B'], ['sub', 'A − B'], ['mul', 'A × B'], ['div', 'A ÷ B'], ['min', '最小'], ['max', '最大'], ['sin', 'B × sin(A)'], ['pow', 'A 的 B 次幂'], ['mod', 'A 模 B']])],
    ev(a) { const x = a.p('a'), y = a.p('b'); const f = { add: x + y, sub: x - y, mul: x * y, div: y ? x / y : 0, min: Math.min(x, y), max: Math.max(x, y), sin: y * Math.sin(x), pow: Math.pow(x, y), mod: y ? x - Math.floor(x / y) * y : 0 }; return { out: f[a.s.op] }; } });
  def('combine', { label: '合成向量', cat: '数值', outs: [{ key: 'out', label: '向量', type: 'vec' }], params: [N('x', 'X', 0), N('y', 'Y', 0), N('z', 'Z', 0)], ev(a) { return { out: [a.p('x'), a.p('y'), a.p('z')] }; } });

  // 二维处理
  def('xform2', { label: '变换', cat: '路径', ins: [GEO('geo', '几何')], outs: [GEO('geo', '几何')], params: [V2('position', '位置', [0, 0]), N('rotation', '旋转', 0, { unit: '°' }), V2('scale', '缩放', [100, 100], { unit: '%' }), V2('anchor', '锚点', [0, 0])],
    ev(a) { const g = a.in('geo'); if (!g) return { geo: null }; const sc = a.p('scale'); const m = Pth.affine(a.p('position'), a.p('rotation'), [sc[0] / 100, sc[1] / 100], a.p('anchor'));
      if (g.type === 'path') return { geo: { type: 'path', contours: Pth.xf(g.contours, m), xf: g.xf } };
      if (g.type === 'mesh2') { const v = new Float64Array(g.verts.length); for (let i = 0; i < v.length; i += 2) { v[i] = m[0] * g.verts[i] + m[2] * g.verts[i + 1] + m[4]; v[i + 1] = m[1] * g.verts[i] + m[3] * g.verts[i + 1] + m[5]; } return { geo: { type: 'mesh2', verts: v, tris: g.tris, loops: g.loops, xf: g.xf } }; }
      const M = M4.ident(); M[0] = m[0]; M[1] = m[1]; M[4] = m[2]; M[5] = m[3]; M[12] = m[4]; M[13] = m[5]; return { geo: xf3(g, M) }; } });
  def('repeat', { label: '阵列', cat: '路径', ins: [GEO('geo', '几何')], outs: [GEO('geo', '几何')], params: [N('count', '数量', 5, { min: 1, step: 1 }), V3('position', '逐份位移', [80, 0, 0]), V3('rotation', '逐份旋转', [0, 0, 0], { unit: '°' }), N('scale', '逐份缩放', 100, { unit: '%' })],
    ev(a) { const g = a.in('geo'); if (!g) return { geo: null }; const n = Math.max(1, Math.min(300, Math.round(a.p('count')))), ps = a.p('position'), r = a.p('rotation'), s = a.p('scale') / 100;
      if (g.type === 'mesh3' || g.type === 'points') { const list = []; for (let i = 0; i < n; i++) { const k = Math.pow(s, i); list.push(xf3(g, M4.compose([ps[0] * i, ps[1] * i, ps[2] * i], [r[0] * i, r[1] * i, r[2] * i], [k, k, k]))); } return { geo: g.type === 'mesh3' ? MF.Solid.merge(list) : mergePoints(list) }; }
      const cs = []; const src = G.contours(g); for (let i = 0; i < n; i++) { const k = Math.pow(s, i); for (const c of Pth.xf(src, Pth.affine([ps[0] * i, ps[1] * i], r[2] * i, [k, k], [0, 0]))) cs.push(c); } return { geo: { type: 'path', contours: cs, xf: g.xf } }; } });
  def('bool', { label: '布尔', cat: '路径', ins: [GEO('a', 'A'), GEO('b', 'B')], outs: [GEO('geo', '结果')], statics: [S('mode', '运算', 'enum', 'union', [['union', '并集'], ['difference', '差集（A − B）'], ['intersect', '交集'], ['xor', '异或']])],
    ev(a) { const A = a.in('a'), B = a.in('b'); if (!A && !B) return { geo: null }; return { geo: { type: 'path', contours: MF.Bool.op(G.contours(A), G.contours(B), a.s.mode, 'nonzero', 'nonzero'), xf: A && A.xf } }; } });
  def('trimN', { label: '修剪', cat: '路径', ins: [GEO('geo', '路径')], outs: [GEO('geo', '路径')], params: [N('start', '开始', 0, { min: 0, max: 100, unit: '%' }), N('end', '结束', 100, { min: 0, max: 100, unit: '%' }), N('offset', '偏移', 0, { unit: '°' })], statics: [S('mode', '方式', 'enum', 'each', [['each', '逐条'], ['seq', '首尾相接']])],
    ev(a) { const g = a.in('geo'); if (!g) return { geo: null }; return { geo: { type: 'path', contours: Pth.trim(G.contours(g), a.p('start') / 100, a.p('end') / 100, a.p('offset') / 360, a.s.mode), xf: g.xf } }; } });
  def('offsetN', { label: '偏移', cat: '路径', ins: [GEO('geo', '轮廓')], outs: [GEO('geo', '轮廓')], params: [N('amount', '数量', 8, { unit: 'px' })], statics: [S('join', '连接', 'enum', 'round', [['round', '圆角'], ['miter', '斜接']])],
    ev(a) { const g = a.in('geo'); if (!g) return { geo: null }; return { geo: { type: 'path', contours: Pth.offset(G.contours(g).filter((c) => c.closed !== false), a.p('amount'), a.s.join), xf: g.xf } }; } });
  def('outlineN', { label: '描边转轮廓', cat: '路径', ins: [GEO('geo', '路径')], outs: [GEO('geo', '轮廓')], params: [N('width', '宽度', 12, { min: 0.1, unit: 'px' })], statics: [S('cap', '端点', 'enum', 'round', [['round', '圆头'], ['butt', '平头']])],
    ev(a) { const g = a.in('geo'); if (!g) return { geo: null }; return { geo: { type: 'path', contours: Pth.strokeOutline(G.contours(g), a.p('width'), a.s.cap), xf: g.xf } }; } });
  def('morph', { label: '路径形变', cat: '路径', ins: [GEO('a', '形状 A'), GEO('b', '形状 B')], outs: [GEO('geo', '形状')], params: [N('amount', '混合', 50, { min: 0, max: 100, unit: '%' })],
    ev(a) { const A = a.in('a'), B = a.in('b'); if (!A || !B) return { geo: A || B || null }; return { geo: { type: 'path', contours: Pth.morph(G.contours(A), G.contours(B), a.p('amount') / 100), xf: A.xf } }; } });
  def('mergeN', { label: '合并', cat: '路径', ins: [GEO('geo', '几何', { multi: true })], outs: [GEO('geo', '几何')],
    ev(a) { const list = a.ins('geo').filter(Boolean); if (!list.length) return { geo: null }; if (list.some((g) => g.type === 'mesh3')) return { geo: MF.Solid.merge(list.map(G.mesh3).filter(Boolean)) }; if (list.every((g) => g.type === 'points')) return { geo: mergePoints(list) }; const cs = []; for (const g of list) for (const c of G.contours(g)) cs.push(c); return { geo: { type: 'path', contours: cs, xf: list[0].xf } }; } });
  def('scatter', { label: '散布点', cat: '分布', ins: [GEO('geo', '几何')], outs: [GEO('pts', '点集')], params: [N('count', '数量', 60, { min: 0, step: 1 }), N('seed', '随机种子', 1, { step: 1 })], statics: [S('mode', '位置', 'enum', 'surface', [['surface', '表面/内部'], ['edge', '沿轮廓']])],
    ev(a) { return { pts: scatter(a.in('geo'), Math.max(0, Math.min(20000, Math.round(a.p('count')))), a.p('seed') | 0, a.s.mode) }; } });
  def('instance', { label: '实例化', cat: '分布', ins: [GEO('pts', '点集'), GEO('geo', '实例几何')], outs: [GEO('geo', '几何')], params: [N('scale', '缩放', 100, { unit: '%' }), N('scaleRand', '缩放随机', 0, { min: 0, max: 1, step: 0.01 }), N('rotRand', '旋转随机', 0, { unit: '°' }), N('seed', '随机种子', 1, { step: 1 })], statics: [S('align', '对齐法线', 'bool', true)],
    ev(a) { return { geo: instance(a.in('pts'), a.in('geo'), a.p('scale') / 100, a.p('scaleRand'), a.p('rotRand'), a.p('seed') | 0, a.s.align) }; } });

  // 网格与实体
  def('mesh', { label: '三角网格', cat: '网格', ins: [GEO('geo', '轮廓')], outs: [GEO('geo', '网格')], params: [N('density', '最大边长', 18, { min: 0, unit: 'px', hint: '0 = 不细分' })],
    ev(a) { const g = a.in('geo'); if (!g) return { geo: null }; if (g.type === 'mesh3') return { geo: g }; const cs = G.contours(g).filter((c) => c.closed !== false); if (!cs.length) return { geo: null }; let m = MF.Tri.triangulate(cs); const d = a.p('density'); if (d > 0) m = MF.Tri.refine(m, Math.max(2, d)); if (g.xf) m.xf = g.xf; return { geo: m }; } });
  def('pins', { label: '图钉变形', cat: '变形', ins: [GEO('geo', '网格')], outs: [GEO('geo', '网格')], params: [N('radius', '图钉范围', 40, { min: 1, unit: 'px' }), N('rigid', '刚性', 0.4, { min: 0, max: 1, step: 0.01 })], hasPins: true,
    extra(a) { return JSON.stringify(a.node.pins.map((p) => [p.rest, a.val(p.p.pos), a.val(p.p.rot), a.val(p.p.scale)])); },
    ev(a) { const g = a.in('geo'); const m = G.mesh2(g, 24); if (!m) return { geo: null }; const pins = a.node.pins.map((p) => { const q = a.val(p.p.pos); return { rx: p.rest[0], ry: p.rest[1], x: q[0], y: q[1], rot: a.val(p.p.rot), scale: a.val(p.p.scale) / 100 }; }); const o = MF.Pins.deform(m, pins, a.p('radius'), a.p('rigid')); if (m.xf) o.xf = m.xf; return { geo: o }; } });
  def('extrude', { label: '挤出', cat: '实体', ins: [GEO('geo', '轮廓/网格')], outs: [GEO('geo', '实体')], params: [N('depth', '深度', 80, { min: 0.01, unit: 'px' }), N('bevel', '倒角', 6, { min: 0, unit: 'px' }), N('bevelSeg', '倒角分段', 4, { min: 0, max: 12, step: 1 }), N('depthSeg', '深度分段', 1, { min: 1, max: 32, step: 1 })],
    ev(a) { const g = a.in('geo'); if (!g) return { geo: null }; if (g.type === 'mesh3') return { geo: g }; const m = G.mesh2(g); if (!m || !m.tris.length) return { geo: null }; let s = MF.Solid.extrude(m, a.p('depth'), a.p('bevel'), a.p('bevelSeg'), a.p('depthSeg')); if (m.xf) s = MF.Solid.transform(s, m.xf); return { geo: s }; } });
  def('xform3', { label: '三维变换', cat: '实体', ins: [GEO('geo', '几何')], outs: [GEO('geo', '几何')], params: [V3('position', '位置', [0, 0, 0]), V3('rotation', '旋转', [0, 0, 0], { unit: '°' }), V3('scale', '缩放', [100, 100, 100], { unit: '%' }), V3('anchor', '锚点', [0, 0, 0])], statics: [S('follow', '跟随图层', 'layer', null, null)],
    extra(a) { const L = MF.Model.getLayer(a.comp, a.s.follow); return L ? Array.from(MF.Scene.worldMatrix(a.comp, L, a.t)).map((x) => x.toFixed(4)).join(',') : ''; },
    mapPoint(a, p) { return M4.tp(xform3M(a), p); },
    ev(a) { const g = a.in('geo'); if (!g) return { geo: null }; return { geo: xf3(g, xform3M(a)) }; } });
  def('bend', { label: '弯曲', cat: '变形', ins: [GEO('geo', '实体')], outs: [GEO('geo', '实体')], params: [N('angle', '角度', 45, { unit: '°' }), N('center', '中心', 0, { unit: 'px' }), N('range', '范围', 400, { min: 1, unit: 'px' }), N('pivot', '中性层', 0, { unit: 'px' })], statics: [S('axis', '轴向', 'enum', '0', AX), S('toward', '弯向', 'enum', '1', AX)],
    fn(a) { return MF.Solid.bendFn(+a.s.axis, +a.s.toward, a.p('angle'), a.p('center'), a.p('range'), a.p('pivot')); },
    mapPoint(a, p) { const o = [0, 0, 0]; T.bend.fn(a)(p[0], p[1], p[2], o); return o; },
    ev(a) { const m = G.mesh3(a.in('geo')); if (!m) return { geo: null }; return { geo: MF.Solid.deform(m, T.bend.fn(a)) }; } });
  def('twist', { label: '扭转', cat: '变形', ins: [GEO('geo', '实体')], outs: [GEO('geo', '实体')], params: [N('angle', '角度', 90, { unit: '°' }), N('center', '中心', 0, { unit: 'px' }), N('range', '范围', 400, { min: 1, unit: 'px' }), V2('pivot', '轴心', [0, 0])], statics: [S('axis', '轴向', 'enum', '0', AX)],
    fn(a) { const pv = a.p('pivot'); return MF.Solid.twistFn(+a.s.axis, a.p('angle'), a.p('center'), a.p('range'), pv[0], pv[1]); },
    mapPoint(a, p) { const o = [0, 0, 0]; T.twist.fn(a)(p[0], p[1], p[2], o); return o; },
    ev(a) { const m = G.mesh3(a.in('geo')); if (!m) return { geo: null }; return { geo: MF.Solid.deform(m, T.twist.fn(a)) }; } });
  def('fieldDeform', { label: '场变形', cat: '变形', ins: [GEO('geo', '几何'), FLD('field', '场')], outs: [GEO('geo', '几何')], params: [N('amount', '数量', 40, { unit: 'px' })], statics: [S('mode', '方式', 'enum', 'vector', [['vector', '沿场向量位移'], ['normal', '沿法线膨胀/收缩']])],
    mapPoint(a, p) { const f = a.in('field'); if (!f || a.s.mode !== 'vector') return p; const o = [0, 0, 0, 0]; f.eval(p[0], p[1], p[2], o); const k = a.p('amount'); return [p[0] + o[1] * k, p[1] + o[2] * k, p[2] + o[3] * k]; },
    ev(a) { const g = a.in('geo'), f = a.in('field'); if (!g) return { geo: null }; if (!f) return { geo: g }; const k = a.p('amount'), o = [0, 0, 0, 0];
      if (g.type === 'path' || g.type === 'mesh2') { // 二维：在 z=0 平面取样
        const mv = (x, y) => { f.eval(x, y, 0, o); return [x + o[1] * k, y + o[2] * k]; };
        if (g.type === 'path') return { geo: { type: 'path', xf: g.xf, contours: g.contours.map((c) => { const d = densify(c, 12); const q = new Array(d.length); for (let i = 0; i < d.length; i += 2) { const r = mv(d[i], d[i + 1]); q[i] = r[0]; q[i + 1] = r[1]; } return { pts: q, closed: c.closed }; }) } };
        const v = new Float64Array(g.verts.length); for (let i = 0; i < v.length; i += 2) { const r = mv(g.verts[i], g.verts[i + 1]); v[i] = r[0]; v[i + 1] = r[1]; } return { geo: { type: 'mesh2', verts: v, tris: g.tris, loops: g.loops, xf: g.xf } };
      }
      const m = G.mesh3(g); if (!m) return { geo: null };
      if (a.s.mode === 'normal') { const n = m.pos.length / 3, pos = new Float32Array(m.pos); for (let i = 0; i < n; i++) { f.eval(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2], o); pos[i * 3] += m.nrm[i * 3] * o[0] * k; pos[i * 3 + 1] += m.nrm[i * 3 + 1] * o[0] * k; pos[i * 3 + 2] += m.nrm[i * 3 + 2] * o[0] * k; } const r = { type: 'mesh3', pos, nrm: m.nrm, idx: m.idx }; if (m.heat) r.heat = m.heat; return { geo: recomputeNormals(r, m.nrm) }; }
      return { geo: MF.Solid.deform(m, (x, y, z, out) => { f.eval(x, y, z, o); out[0] = x + o[1] * k; out[1] = y + o[2] * k; out[2] = z + o[3] * k; }) }; } });
  def('fieldHeat', { label: '场→热度', cat: '变形', ins: [GEO('geo', '实体'), FLD('field', '场')], outs: [GEO('geo', '实体')], params: [N('gain', '增益', 1, { step: 0.05 })],
    ev(a) { const m = G.mesh3(a.in('geo')), f = a.in('field'); if (!m) return { geo: null }; if (!f) return { geo: m }; const n = m.pos.length / 3, heat = new Float32Array(n), o = [0, 0, 0, 0], k = a.p('gain'); for (let i = 0; i < n; i++) { f.eval(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2], o); heat[i] = Math.max(0, o[0] * k) + (m.heat ? m.heat[i] : 0); } return { geo: { type: 'mesh3', pos: m.pos, nrm: m.nrm, idx: m.idx, heat } }; } });

  // 场
  const followS = S('follow', '跟随图层', 'layer', null, null);
  function fcenter(a) { const c = a.p('center'); const L = MF.Model.getLayer(a.comp, a.s.follow); if (!L) return c; return M4.tp(MF.Scene.worldMatrix(a.comp, L, a.t), c); }
  const fextra = (a) => { const L = MF.Model.getLayer(a.comp, a.s.follow); return L ? Array.from(MF.Scene.worldMatrix(a.comp, L, a.t)).map((x) => x.toFixed(4)).join(',') : ''; };
  def('falloff', { label: '距离衰减场', cat: '场', outs: [FLD('field', '场')], isField: true, params: [V3('center', '中心', [960, 540, 0], { spatial: true }), N('radius', '半径', 200, { min: 1, unit: 'px' }), N('hardness', '硬度', 0, { min: 0, max: 0.99, step: 0.01 }), N('strength', '强度', 1, { step: 0.01 }), V3('dir', '向量方向', [0, 1, 0]), V3('axis', '轴', [0, 1, 0]), N('curve', '曲线指数', 1, { min: 0.1, step: 0.05 })],
    statics: [S('shape', '形状', 'enum', 'sphere', [['sphere', '球形'], ['cylinder', '柱形（绕轴）'], ['linear', '线性（沿轴）']]), S('vector', '向量', 'enum', 'radial', [['radial', '径向（离开中心）'], ['dir', '固定方向'], ['axis', '沿轴']]), followS], extra: fextra,
    ev(a) { return { field: MF.Fields.falloff({ center: fcenter(a), radius: a.p('radius'), hardness: a.p('hardness'), strength: a.p('strength'), dir: a.p('dir'), axis: a.p('axis'), shape: a.s.shape, vector: a.s.vector, curve: a.p('curve') }) }; } });
  def('noiseF', { label: '噪声场', cat: '场', outs: [FLD('field', '场')], isField: true, params: [N('scale', '尺度', 160, { min: 1, unit: 'px' }), N('strength', '强度', 1, { step: 0.01 }), N('evolution', '演化', 0, { step: 0.01 }), N('speed', '演化速度', 0.5, { step: 0.01, unit: '/s' }), N('octaves', '细节层数', 2, { min: 1, max: 4, step: 1 }), N('seed', '随机种子', 1, { step: 1 }), V3('offset', '偏移', [0, 0, 0])], timeDepIf: (n) => n.p.speed.v !== 0 || n.p.speed.k || n.p.speed.x,
    ev(a) { return { field: MF.Fields.noise({ scale: a.p('scale'), strength: a.p('strength'), evolution: a.p('evolution') + a.p('speed') * a.t, octaves: a.p('octaves'), seed: a.p('seed'), offset: a.p('offset') }) }; } });
  def('vortex', { label: '旋涡场', cat: '场', outs: [FLD('field', '场')], isField: true, params: [V3('center', '中心', [960, 540, 0], { spatial: true }), V3('axis', '轴', [0, 0, 1]), N('radius', '半径', 300, { min: 1, unit: 'px' }), N('strength', '强度', 1, { step: 0.01 }), N('pull', '向内吸力', 0.2, { step: 0.01 })], statics: [followS], extra: fextra,
    ev(a) { return { field: MF.Fields.vortex({ center: fcenter(a), axis: a.p('axis'), radius: a.p('radius'), strength: a.p('strength'), pull: a.p('pull') }) }; } });
  def('fieldMix', { label: '场混合', cat: '场', ins: [FLD('a', '场 A'), FLD('b', '场 B')], outs: [FLD('field', '场')], isField: true, params: [N('mix', '插值', 50, { min: 0, max: 100, unit: '%' })], statics: [S('mode', '方式', 'enum', 'add', [['add', '相加'], ['mul', '相乘（B 的强度遮罩 A）'], ['max', '取强者'], ['min', '取弱者'], ['sub', '相减'], ['mix', '插值']])],
    ev(a) { const A = a.in('a'), B = a.in('b'); if (!A && !B) return { field: null }; if (!A || !B) { if (a.s.mode === 'mul') return { field: MF.Fields.mix(A, B, 'mul') }; return { field: A || B }; } return { field: MF.Fields.mix(A, B, a.s.mode, a.p('mix') / 100) }; } });

  // 使用者（与图层绑定）
  def('geoLayer', { label: '显示', cat: '输出', ins: [GEO('geo', '几何')], outs: [GEO('world', '世界几何')], statics: [S('layer', '几何图层', 'layer', null, ['geo'])], terminal: true,
    extra(a) { const L = MF.Model.getLayer(a.comp, a.s.layer); return L ? Array.from(MF.Scene.worldMatrix(a.comp, L, a.t)).map((x) => x.toFixed(4)).join(',') : ''; },
    ev(a) { const g = a.in('geo'); const L = MF.Model.getLayer(a.comp, a.s.layer); if (!g) return { world: null }; if (!L) return { world: g }; const wm = MF.Scene.worldMatrix(a.comp, L, a.t); return { world: isIdent(wm) ? G.mesh3(g) || g : xf3(G.mesh3(g) || g, wm) }; } });
  def('partLayer', { label: '粒子', cat: '输出', ins: [GEO('emit', '发射源', { multi: true }), GEO('collide', '碰撞体', { multi: true }), FLD('field', '力场', { multi: true })], statics: [S('layer', '粒子图层', 'layer', null, ['particles'])], terminal: true, ev() { return {}; } });
  // 节点组
  def('group', { label: '节点组', cat: '组', dynamic: true, ev(a) { const out = {}; const ictx = { comp: a.comp, nodes: a.node.sub.nodes, outer: { ctx: a.ctx, node: a.node } }; for (const n of a.node.sub.nodes) if (n.type === 'groupOut') out['g:' + n.id] = Nodes.input(ictx, n, 'in', a.t); return out; } });
  def('groupIn', { label: '组输入', cat: '组', inner: true, dynamic: true, ev(a) { const o = a.ctx.outer; return { out: o ? Nodes.input(o.ctx, o.node, 'g:' + a.node.id, a.t) : null }; } });
  def('groupOut', { label: '组输出', cat: '组', inner: true, dynamic: true, ev() { return {}; } });

  // ---------- 辅助实现 ----------
  function xform3M(a) { const sc = a.p('scale'); let m = M4.compose(a.p('position'), a.p('rotation'), [sc[0] / 100, sc[1] / 100, sc[2] / 100], a.p('anchor')); const L = MF.Model.getLayer(a.comp, a.s.follow); if (L) m = M4.mul(MF.Scene.worldMatrix(a.comp, L, a.t), m); return m; }
  function xf3(g, M) {
    if (!g) return null;
    if (g.type === 'mesh3') return MF.Solid.transform(g, M);
    if (g.type === 'points') { const n = g.pos.length / 3, pos = new Float32Array(n * 3), nrm = g.nrm ? new Float32Array(n * 3) : null; for (let i = 0; i < n; i++) { const p = M4.tp(M, [g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]]); pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; if (nrm) { const d = MF.V3.norm(M4.td(M, [g.nrm[i * 3], g.nrm[i * 3 + 1], g.nrm[i * 3 + 2]])); nrm[i * 3] = d[0]; nrm[i * 3 + 1] = d[1]; nrm[i * 3 + 2] = d[2]; } } return { type: 'points', pos, nrm }; }
    return Object.assign({}, g, { xf: g.xf ? M4.mul(M, g.xf) : M });
  }
  function mergePoints(list) { let n = 0; for (const g of list) n += g.pos.length; const pos = new Float32Array(n), nrm = new Float32Array(n); let o = 0; for (const g of list) { pos.set(g.pos, o); if (g.nrm) nrm.set(g.nrm, o); o += g.pos.length; } return { type: 'points', pos, nrm }; }
  function densify(c, maxSeg) { const p = c.pts, n = p.length >> 1, out = []; const m = c.closed === false ? n - 1 : n; for (let i = 0; i < m; i++) { const j = (i + 1) % n; const x0 = p[i * 2], y0 = p[i * 2 + 1], x1 = p[j * 2], y1 = p[j * 2 + 1]; const k = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / maxSeg)); for (let s = 0; s < k; s++) out.push(x0 + ((x1 - x0) * s) / k, y0 + ((y1 - y0) * s) / k); } if (c.closed === false) out.push(p[(n - 1) * 2], p[(n - 1) * 2 + 1]); return out; }
  function recomputeNormals(m, ref) {
    const n = m.pos.length / 3, nrm = new Float32Array(n * 3), p = m.pos, t = m.idx;
    // 位置相同的顶点共享法线（按量化位置聚合），再用原法线判定硬边
    const acc = new Map(); const key = (i) => Math.round(p[i * 3] * 8) + ',' + Math.round(p[i * 3 + 1] * 8) + ',' + Math.round(p[i * 3 + 2] * 8);
    const fn = new Float32Array(t.length);
    for (let i = 0; i < t.length; i += 3) { const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3; const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]; fn[i] = uy * vz - uz * vy; fn[i + 1] = uz * vx - ux * vz; fn[i + 2] = ux * vy - uy * vx; for (let k = 0; k < 3; k++) { const v = t[i + k]; nrm[v * 3] += fn[i]; nrm[v * 3 + 1] += fn[i + 1]; nrm[v * 3 + 2] += fn[i + 2]; } }
    for (let i = 0; i < n; i++) { let x = nrm[i * 3], y = nrm[i * 3 + 1], z = nrm[i * 3 + 2]; let l = Math.hypot(x, y, z); if (l < 1e-12) { x = ref[i * 3]; y = ref[i * 3 + 1]; z = ref[i * 3 + 2]; l = 1; } x /= l; y /= l; z /= l; if (x * ref[i * 3] + y * ref[i * 3 + 1] + z * ref[i * 3 + 2] < 0) { x = -x; y = -y; z = -z; } nrm[i * 3] = x; nrm[i * 3 + 1] = y; nrm[i * 3 + 2] = z; }
    void acc; void key;
    m.nrm = nrm; return m;
  }
  function scatter(g, count, seed, mode) {
    if (!g || !count) return { type: 'points', pos: new Float32Array(0), nrm: new Float32Array(0) };
    const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3);
    if (mode === 'edge' && g.type !== 'mesh3') {
      const cs = G.contours(g); const lens = cs.map((c) => Pth.length(c)); const total = lens.reduce((a, b) => a + b, 0) || 1; const xf = g.xf;
      for (let i = 0; i < count; i++) { let d = ((i + 0.5) / count) * total, k = 0; while (k < cs.length - 1 && d > lens[k]) { d -= lens[k]; k++; } const q = Pth.pointAt(cs[k], d); let p = [q[0], q[1], 0], nn = [q[3], -q[2], 0]; if (xf) { p = M4.tp(xf, p); nn = MF.V3.norm(M4.td(xf, nn)); } pos.set(p, i * 3); nrm.set(nn, i * 3); }
      return { type: 'points', pos, nrm };
    }
    const m = G.mesh3(g); if (!m || !m.idx.length) return { type: 'points', pos: new Float32Array(0), nrm: new Float32Array(0) };
    const cdf = MF.Solid.cdf(m);
    for (let i = 0; i < count; i++) { const s = samplePoint(m, cdf, MF.rand01(seed, i, 1), MF.rand01(seed, i, 2), MF.rand01(seed, i, 3)); pos.set(s.p, i * 3); nrm.set(s.n, i * 3); }
    return { type: 'points', pos, nrm };
  }
  function samplePoint(m, cdf, r0, r1, r2) {
    const c = cdf.c; let lo = 0, hi = c.length - 1; const x = r0 * cdf.total; while (lo < hi) { const mid = (lo + hi) >> 1; if (c[mid] < x) lo = mid + 1; else hi = mid; }
    const t = m.idx, a = t[lo * 3] * 3, b = t[lo * 3 + 1] * 3, d = t[lo * 3 + 2] * 3; let u = r1, v = r2; if (u + v > 1) { u = 1 - u; v = 1 - v; } const w = 1 - u - v; const p = m.pos, q = m.nrm;
    const n = MF.V3.norm([q[a] * w + q[b] * u + q[d] * v, q[a + 1] * w + q[b + 1] * u + q[d + 1] * v, q[a + 2] * w + q[b + 2] * u + q[d + 2] * v]);
    return { p: [p[a] * w + p[b] * u + p[d] * v, p[a + 1] * w + p[b + 1] * u + p[d + 1] * v, p[a + 2] * w + p[b + 2] * u + p[d + 2] * v], n, tri: lo, u, v, w };
  }
  function instance(pts, g, scale, scaleRand, rotRand, seed, align) {
    if (!pts || pts.type !== 'points' || !g) return null;
    const n = pts.pos.length / 3; const is3 = g.type === 'mesh3';
    if (is3) {
      const list = [];
      for (let i = 0; i < n; i++) {
        const s = scale * (1 - scaleRand * MF.rand01(seed, i, 5)), rz = rotRand * (MF.rand01(seed, i, 6) * 2 - 1);
        let M = M4.trans(pts.pos[i * 3], pts.pos[i * 3 + 1], pts.pos[i * 3 + 2]);
        if (align && pts.nrm) { // 把局部 -Z（正面）对齐到法线
          const nn = [pts.nrm[i * 3], pts.nrm[i * 3 + 1], pts.nrm[i * 3 + 2]]; const f = MF.V3.mul(nn, -1); let r = MF.V3.cross([0, 1, 0], f); if (MF.V3.len(r) < 1e-5) r = [1, 0, 0]; r = MF.V3.norm(r); const d = MF.V3.cross(f, r); const R = M4.ident(); R[0] = r[0]; R[1] = r[1]; R[2] = r[2]; R[4] = d[0]; R[5] = d[1]; R[6] = d[2]; R[8] = f[0]; R[9] = f[1]; R[10] = f[2]; M = M4.mul(M, R);
        }
        M = M4.mul(M, M4.mul(M4.rotZ(rz * MF.DEG), M4.scale(s, s, s)));
        list.push(MF.Solid.transform(g, M));
      }
      return list.length ? MF.Solid.merge(list) : null;
    }
    const cs = [], src = G.contours(g);
    for (let i = 0; i < n; i++) { const s = scale * (1 - scaleRand * MF.rand01(seed, i, 5)), rz = rotRand * (MF.rand01(seed, i, 6) * 2 - 1); for (const c of Pth.xf(src, Pth.affine([pts.pos[i * 3], pts.pos[i * 3 + 1]], rz, [s, s], [0, 0]))) cs.push(c); }
    return { type: 'path', contours: cs };
  }
  // 笔画书写：按笔顺逐笔显现，结果为真实几何（笔画轮廓 ∩ 沿中线推进的笔刷）
  const doneCache = new Map();
  function writeOn(a) {
    const L = MF.Model.getLayer(a.comp, a.s.layer); if (!L || L.type !== 'text') return { geo: null, tip: [0, 0, 0], tipGeo: null, count: 0 };
    const tx = MF.Scene.text(a.comp, L, a.t); const font = tx.font; const units = [];
    for (const c of tx.chars) {
      if (c.space) continue; const g = c.glyph;
      if (g.strokes) for (const st of g.strokes) { const med = Pth.xf([{ pts: st.median, closed: false }], c.gm)[0]; units.push({ cs: Pth.xf(st.contours, c.gm), med, len: Pth.length(med), size: c.size }); }
      else { const cs = c.contours; if (!cs.length) continue; const b = Pth.bbox(cs); const med = { pts: [b[0], (b[1] + b[3]) / 2, b[2], (b[1] + b[3]) / 2], closed: false }; units.push({ cs, med, len: b[2] - b[0], size: c.size, wipe: [b[1] - 4, b[3] + 4] }); }
    }
    const nU = units.length; if (!nU) return { geo: { type: 'path', contours: [] }, tip: [0, 0, 0], tipGeo: null, count: 0 };
    const ws = units.map((u) => u.len + u.size * 0.3); const total = ws.reduce((x, y) => x + y, 0);
    let prog = MF.clamp(a.p('progress') / 100, 0, 1) * total, k = 0; while (k < nU && prog >= ws[k] - 1e-9) { prog -= ws[k]; k++; }
    const f = k < nU ? MF.clamp(prog / ws[k], 0, 1) : 0;
    // 已完成笔画的并集（缓存）
    const dkey = a.layerSig + '|' + k; let done = doneCache.get(dkey);
    if (!done) { const polys = []; for (let i = 0; i < k; i++) for (const c of units[i].cs) polys.push(c); done = polys.length ? MF.Bool.union(polys, 0, 'nonzero') : []; if (doneCache.size > 80) doneCache.clear(); doneCache.set(dkey, done); }
    let out = done, tip, tipGeo = null;
    if (k < nU && f > 0) {
      const u = units[k]; let part;
      const d = f * u.len; const q = Pth.pointAt(u.med, d); tip = [q[0], q[1], 0];
      if (u.wipe) { const x0 = u.med.pts[0], x1 = x0 + d; part = MF.Bool.op(u.cs, [{ pts: [x0 - 2, u.wipe[0], x1, u.wipe[0], x1, u.wipe[1], x0 - 2, u.wipe[1]], closed: true }], 'intersect', 'nonzero', 'nonzero'); }
      else {
        const seg = []; Pth._cut(u.med, 0, d, seg, false);
        if (seg.length) {
          // 起笔处向后延伸，保证盖住笔画起端
          const sp = seg[0].pts, bw = (a.p('brush') / 100) * u.size; const dx = sp[0] - sp[2], dy = sp[1] - sp[3], dl = Math.hypot(dx, dy) || 1; sp.unshift(sp[0] + (dx / dl) * bw * 0.5, sp[1] + (dy / dl) * bw * 0.5);
          const mask = Pth.strokeOutline(seg, bw, 'round'); part = MF.Bool.op(u.cs, mask, 'intersect', 'nonzero', 'nonzero');
          const tl = Math.min(d, bw * 0.4); const tg = []; Pth._cut(u.med, d - tl, d, tg, false); if (tg.length) tipGeo = { type: 'path', contours: tg };
        } else part = [];
      }
      out = part && part.length ? MF.Bool.union(done.concat(part), 0, 'nonzero') : done;
    } else {
      const u = units[Math.min(k, nU - 1)]; const q = k >= nU || k === 0 && f <= 0 ? Pth.pointAt(u.med, k >= nU ? u.len : 0) : Pth.pointAt(units[k - 1].med, units[k - 1].len); tip = [q[0], q[1], 0];
    }
    const bold = a.p('bold'); if (Math.abs(bold) > 1e-6 && out.length) out = Pth.offset(out, bold, 'round');
    let aff = null;
    if (a.s.space === 'comp') { aff = layerAffine(a.comp, L, a.t); out = Pth.xf(out, aff); tip = [aff[0] * tip[0] + aff[2] * tip[1] + aff[4], aff[1] * tip[0] + aff[3] * tip[1] + aff[5], 0]; if (tipGeo) tipGeo = { type: 'path', contours: Pth.xf(tipGeo.contours, aff) }; }
    return { geo: { type: 'path', contours: out }, tip, tipGeo, count: nU };
  }
  // 图层内容签名（按求值后的参数值）
  function layerSig(comp, L, t) {
    return MF.Scene.memo('lsig' + L.id, t, () => {
      const parts = [L.type];
      if (L.type === 'text') { parts.push(L.text.s.str, L.text.s.font, L.text.s.align); for (const m of MF.Schema.text) parts.push(JSON.stringify(V(L.text.p[m.key], t))); for (const an of L.text.animators) { parts.push(an.s.based); for (const m of MF.Schema.animator) parts.push(JSON.stringify(V(an.p[m.key], t))); } }
      else if (L.type === 'shape') for (const it of L.items) { parts.push(it.type, it.on === false ? 0 : 1, JSON.stringify(it.s)); for (const k in it.p) parts.push(JSON.stringify(V(it.p[k], t))); }
      return hash(parts.join('|'));
    });
  }
  function hash(s) { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36); }

  // ---------- 求值引擎 ----------
  const cache = new Map(); let tick = 0;
  const Nodes = (MF.Nodes = {
    types: T, G, samplePoint, hash,
    typeDef(n) { return T[n.type]; },
    create(project, type, o) {
      const d = T[type]; if (!d) throw new Error('未知节点类型 ' + type);
      o = o || {}; const n = { id: MF.Model.id(project, 'n'), type, name: o.name || d.label, x: o.x || 0, y: o.y || 0, p: {}, s: {}, in: {} };
      for (const m of d.params) n.p[m.key] = { v: MF.clone(o.p && o.p[m.key] !== undefined ? o.p[m.key] : m.def) };
      for (const m of d.statics) n.s[m.key] = o.s && o.s[m.key] !== undefined ? o.s[m.key] : m.def;
      if (d.hasPins) n.pins = [];
      if (type === 'group') n.sub = { nodes: [] };
      if (type === 'groupIn' || type === 'groupOut') { n.s.label = (o.s && o.s.label) || (type === 'groupIn' ? '输入' : '输出'); n.s.ptype = (o.s && o.s.ptype) || 'geo'; }
      return n;
    },
    addPin(project, node, x, y) { const pin = { id: MF.Model.id(project, 'p'), name: '图钉 ' + (node.pins.length + 1), rest: [x, y], p: { pos: { v: [x, y] }, rot: { v: 0 }, scale: { v: 100 } } }; node.pins.push(pin); return pin; },
    // 端口列表（含参数输入与组的动态端口）
    ports(n) {
      const d = T[n.type]; let ins = d.ins.slice(), outs = d.outs.slice();
      if (n.type === 'group') { ins = []; outs = []; for (const s of n.sub.nodes) { if (s.type === 'groupIn') ins.push({ key: 'g:' + s.id, label: s.s.label, type: s.s.ptype }); if (s.type === 'groupOut') outs.push({ key: 'g:' + s.id, label: s.s.label, type: s.s.ptype }); } }
      if (n.type === 'groupIn') outs = [{ key: 'out', label: n.s.label, type: n.s.ptype }];
      if (n.type === 'groupOut') ins = [{ key: 'in', label: n.s.label, type: n.s.ptype }];
      const pins = d.params.map((m) => ({ key: 'p:' + m.key, label: m.label, type: m.type === 'num' ? 'num' : m.type === 'color' ? 'color' : 'vec', param: m }));
      return { ins, outs, params: pins };
    },
    find(ctx, id) { for (const n of ctx.nodes) if (n.id === id) return n; return null; },
    top(comp) { return { comp, nodes: comp.nodes, outer: null }; },
    // 定位节点所在上下文（递归进入节点组）
    ctxOf(comp, nodeId, ctx) {
      ctx = ctx || Nodes.top(comp);
      for (const n of ctx.nodes) { if (n.id === nodeId) return ctx; if (n.type === 'group') { const r = Nodes.ctxOf(comp, nodeId, { comp, nodes: n.sub.nodes, outer: { ctx, node: n } }); if (r) return r; } }
      return null;
    },
    findDeep(comp, nodeId) { const c = Nodes.ctxOf(comp, nodeId); return c ? Nodes.find(c, nodeId) : null; },
    eachNode(nodes, fn) { for (const n of nodes) { fn(n); if (n.type === 'group') Nodes.eachNode(n.sub.nodes, fn); } },
    accessor(ctx, n, t) {
      const a = { comp: ctx.comp, ctx, node: n, t, s: n.s,
        in: (k) => Nodes.input(ctx, n, k, t), ins: (k) => Nodes.inputs(ctx, n, k, t),
        val: (prop) => V(prop, t),
        p: (k) => { const link = n.in['p:' + k]; if (link) { const v = Nodes.linkVal(ctx, link, t); if (v !== undefined && v !== null) return coerceParam(v, n.p[k].v); } return V(n.p[k], t); } };
      const d = T[n.type]; const lid = n.s.layer; if (lid && (n.type === 'writeOn')) { const L = MF.Model.getLayer(ctx.comp, lid); a.layerSig = L ? layerSig(ctx.comp, L, t) : ''; }
      void d; return a;
    },
    linkVal(ctx, link, t) { const src = Nodes.find(ctx, link.n); if (!src) return undefined; return Nodes.out(ctx, src, link.p, t); },
    input(ctx, n, key, t) { const l = n.in[key]; if (!l) return undefined; if (Array.isArray(l)) return l.length ? Nodes.linkVal(ctx, l[0], t) : undefined; return Nodes.linkVal(ctx, l, t); },
    inputs(ctx, n, key, t) { const l = n.in[key]; if (!l) return []; return (Array.isArray(l) ? l : [l]).map((x) => Nodes.linkVal(ctx, x, t)); },
    // 内容签名：类型 + 静态 + 参数求值 + 上游签名 + 额外依赖
    sig(ctx, n, t) {
      return MF.Scene.memo('nsig' + n.id, t, () => {
        const d = T[n.type]; const parts = [n.type, JSON.stringify(n.s)];
        const a = Nodes.accessor(ctx, n, t);
        for (const m of d.params) { const link = n.in['p:' + m.key]; parts.push(link ? 'L' + Nodes.linkSig(ctx, link, t) : JSON.stringify(V(n.p[m.key], t))); }
        const ports = Nodes.ports(n);
        for (const pt of ports.ins) { const l = n.in[pt.key]; if (!l) { parts.push('-'); continue; } for (const x of Array.isArray(l) ? l : [l]) parts.push(Nodes.linkSig(ctx, x, t)); }
        if (d.extra) parts.push(d.extra(a));
        if (d.timeDep || (d.timeDepIf && d.timeDepIf(n))) parts.push('@' + Math.round(t * 100000));
        if (n.type === 'group') { const ictx = { comp: ctx.comp, nodes: n.sub.nodes, outer: { ctx, node: n } }; for (const s of n.sub.nodes) if (s.type === 'groupOut') parts.push(Nodes.sig(ictx, s, t)); }
        if (n.type === 'groupIn' && ctx.outer) { const l = ctx.outer.node.in['g:' + n.id]; if (l) for (const x of Array.isArray(l) ? l : [l]) parts.push(Nodes.linkSig(ctx.outer.ctx, x, t)); }
        return hash(parts.join('\u0001'));
      });
    },
    linkSig(ctx, link, t) { const src = Nodes.find(ctx, link.n); return src ? Nodes.sig(ctx, src, t) + ':' + link.p : '?'; },
    // 求某输出端口的值
    out(ctx, n, port, t) {
      const res = Nodes.evalNode(ctx, n, t);
      return res ? res[port] : undefined;
    },
    _stack: [],
    evalNode(ctx, n, t) {
      if (Nodes._stack.indexOf(n.id) >= 0) return null; // 连线成环：忽略
      Nodes._stack.push(n.id);
      try {
        const sg = Nodes.sig(ctx, n, t);
        let c = cache.get(sg);
        if (c) { c.tick = ++tick; return c.out; }
        const d = T[n.type]; let out;
        try { out = d.ev(Nodes.accessor(ctx, n, t)) || {}; } catch (e) { console.warn('节点 “' + n.name + '” 求值失败', e); out = { _err: String(e && e.message || e) }; }
        if (cache.size > 220) { const arr = Array.from(cache.entries()).sort((x, y) => x[1].tick - y[1].tick); for (let i = 0; i < 70; i++) cache.delete(arr[i][0]); }
        cache.set(sg, { out, tick: ++tick });
        return out;
      } finally { Nodes._stack.pop(); }
    },
    clearCache() { cache.clear(); doneCache.clear(); },
    // 表达式读取节点的标量/向量输出
    scalarOut(comp, n, port, t) { const ctx = Nodes.ctxOf(comp, n.id); const ports = Nodes.ports(n); const pt = ports.outs.find((o) => o.key === port || o.label === port) || ports.outs[0]; const v = pt ? Nodes.out(ctx, n, pt.key, t) : undefined; if (typeof v === 'number' || Array.isArray(v)) return v; throw new Error('节点 “' + n.name + '” 的输出 “' + port + '” 不是数值或向量'); },
    // ---- 图层绑定 ----
    terminalOf(comp, layerId) { for (const n of comp.nodes) if ((n.type === 'geoLayer' || n.type === 'partLayer') && n.s.layer === layerId) return n; return null; },
    // 几何图层的实体（图层自身空间）
    layerGeo(comp, L, t) { const n = Nodes.terminalOf(comp, L.id); if (!n) return null; const g = Nodes.input(Nodes.top(comp), n, 'geo', t); return G.mesh3(g); },
    layerGeoRaw(comp, L, t) { const n = Nodes.terminalOf(comp, L.id); if (!n) return null; return Nodes.input(Nodes.top(comp), n, 'geo', t); },
    partInputs(comp, L, t) { const n = Nodes.terminalOf(comp, L.id); if (!n) return { emit: [], collide: [], fields: [] }; const ctx = Nodes.top(comp); return { emit: Nodes.inputs(ctx, n, 'emit', t), collide: Nodes.inputs(ctx, n, 'collide', t).map(G.mesh3).filter(Boolean), fields: Nodes.inputs(ctx, n, 'field', t).filter(Boolean) }; },
    // 粒子输入的签名（用于模拟缓存失效判断）
    partSig(comp, L, t) { const n = Nodes.terminalOf(comp, L.id); return n ? Nodes.sig(Nodes.top(comp), n, t) : ''; },
    upstream(ctx, n, out, seen) { out = out || []; seen = seen || new Set(); for (const k in n.in) { const l = n.in[k]; for (const x of Array.isArray(l) ? l : [l]) { if (!x) continue; const s = Nodes.find(ctx, x.n); if (s && !seen.has(s.id)) { seen.add(s.id); Nodes.upstream(ctx, s, out, seen); out.push(s); } } } return out; },
    upstreamOfLayer(comp, layerId) { const n = Nodes.terminalOf(comp, layerId); return n ? Nodes.upstream(Nodes.top(comp), n) : []; },
    // 点沿下游节点链映射到最终空间（用于图钉等辅助手柄）
    mapDownstream(comp, n, p, t) {
      const ctx = Nodes.ctxOf(comp, n.id) || Nodes.top(comp); let cur = n, pt = p.slice(), guard = 0, g = Nodes.out(ctx, n, T[n.type].outs[0] ? T[n.type].outs[0].key : 'geo', t);
      let xf = g && g.xf ? g.xf : null; let layer = null;
      while (guard++ < 40) {
        let next = null;
        for (const m of ctx.nodes) { for (const k in m.in) { const l = m.in[k]; for (const x of Array.isArray(l) ? l : [l]) if (x && x.n === cur.id && !k.startsWith('p:')) { next = m; break; } if (next) break; } if (next) break; }
        if (!next) break;
        const d = T[next.type], a = Nodes.accessor(ctx, next, t);
        if (next.type === 'extrude') { pt = [pt[0], pt[1], -a.p('depth') / 2]; if (xf) { pt = M4.tp(xf, pt); xf = null; } }
        else if (next.type === 'xform3') { const M = xform3M(a); if (xf) xf = M4.mul(M, xf); else pt = M4.tp(M, pt); }
        else if (next.type === 'xform2') { const sc = a.p('scale'); const m = Pth.affine(a.p('position'), a.p('rotation'), [sc[0] / 100, sc[1] / 100], a.p('anchor')); pt = [m[0] * pt[0] + m[2] * pt[1] + m[4], m[1] * pt[0] + m[3] * pt[1] + m[5], pt[2] || 0]; }
        else if (d.mapPoint) { if (xf) { pt = M4.tp(xf, pt); xf = null; } pt = d.mapPoint(a, pt); }
        else if (next.type === 'geoLayer') { layer = MF.Model.getLayer(comp, next.s.layer); break; }
        cur = next;
      }
      if (xf) pt = M4.tp(xf, pt);
      if (layer) pt = M4.tp(MF.Scene.worldMatrix(comp, layer, t), pt);
      return { p: pt, layer };
    },
    // ---- 属性描述 ----
    propGroup(n) {
      const d = T[n.type]; const ch = d.params.map((m) => ({ kind: 'prop', id: 'node.' + n.id + '.' + m.key, label: m.label, meta: m, prop: n.p[m.key], node: n }));
      if (n.pins) for (const pin of n.pins) {
        ch.push({ kind: 'prop', id: 'pin.' + n.id + '.' + pin.id + '.pos', label: pin.name + ' 位置', meta: { key: 'pos', label: pin.name + ' 位置', type: 'vec2', spatial: true }, prop: pin.p.pos, node: n, pin });
        ch.push({ kind: 'prop', id: 'pin.' + n.id + '.' + pin.id + '.rot', label: pin.name + ' 旋转', meta: { key: 'rot', label: pin.name + ' 旋转', type: 'num', unit: '°' }, prop: pin.p.rot, node: n, pin });
        ch.push({ kind: 'prop', id: 'pin.' + n.id + '.' + pin.id + '.scale', label: pin.name + ' 缩放', meta: { key: 'scale', label: pin.name + ' 缩放', type: 'num', unit: '%' }, prop: pin.p.scale, node: n, pin });
      }
      return { kind: 'group', id: 'node.' + n.id, label: n.name, children: ch, obj: n, objKind: 'node', statics: d.statics };
    },
    allProps(comp) { const out = []; Nodes.eachNode(comp.nodes || [], (n) => { for (const c of Nodes.propGroup(n).children) out.push(c); }); return out; },
    findProp(comp, id) { const parts = id.split('.'); const n = Nodes.findDeep(comp, parts[1]); if (!n) return null; for (const c of Nodes.propGroup(n).children) if (c.id === id) return c; return null; },
    // 连接/断开（类型检查）
    typeOfPort(n, key, isOut) { const ps = Nodes.ports(n); const list = isOut ? ps.outs : ps.ins.concat(ps.params); const p = list.find((x) => x.key === key); return p ? p : null; },
    compatible(a, b) { if (a === b) return true; const num = ['num', 'vec', 'color']; return num.indexOf(a) >= 0 && num.indexOf(b) >= 0; },
    connect(ctx, fromId, fromPort, toId, toPort) {
      const src = Nodes.find(ctx, fromId), dst = Nodes.find(ctx, toId); if (!src || !dst || src === dst) return '不能连接到自身';
      const po = Nodes.typeOfPort(src, fromPort, true), pi = Nodes.typeOfPort(dst, toPort, false); if (!po || !pi) return '端口不存在';
      if (!Nodes.compatible(po.type, pi.type)) return '类型不匹配：' + Nodes.typeName(po.type) + ' → ' + Nodes.typeName(pi.type);
      // 防止成环
      const up = Nodes.upstream(ctx, src); if (up.indexOf(dst) >= 0) return '不能形成环路';
      const link = { n: fromId, p: fromPort };
      if (pi.multi) { const arr = Array.isArray(dst.in[toPort]) ? dst.in[toPort] : dst.in[toPort] ? [dst.in[toPort]] : []; if (!arr.some((x) => x.n === fromId && x.p === fromPort)) arr.push(link); dst.in[toPort] = arr; }
      else dst.in[toPort] = link;
      return null;
    },
    disconnect(node, port, index) { const l = node.in[port]; if (!l) return; if (Array.isArray(l) && index !== undefined) { l.splice(index, 1); if (!l.length) delete node.in[port]; } else delete node.in[port]; },
    removeNode(ctx, id) { const i = ctx.nodes.findIndex((n) => n.id === id); if (i < 0) return; ctx.nodes.splice(i, 1); for (const n of ctx.nodes) for (const k of Object.keys(n.in)) { const l = n.in[k]; if (Array.isArray(l)) { n.in[k] = l.filter((x) => x.n !== id); if (!n.in[k].length) delete n.in[k]; } else if (l && l.n === id) delete n.in[k]; } if (ctx.outer) { const g = ctx.outer.node; delete g.in['g:' + id]; for (const n of ctx.outer.ctx.nodes) for (const k of Object.keys(n.in)) { const l = n.in[k]; const bad = (x) => x.n === g.id && x.p === 'g:' + id; if (Array.isArray(l)) { n.in[k] = l.filter((x) => !bad(x)); if (!n.in[k].length) delete n.in[k]; } else if (l && bad(l)) delete n.in[k]; } } },
    typeName(t) { return { num: '标量', vec: '向量', color: '颜色', geo: '几何', field: '场' }[t] || t; },
    typeColor(t) { return { num: '#9aa3ad', vec: '#8f7bff', color: '#f2c14e', geo: '#3fc1a5', field: '#ff6f91' }[t] || '#999'; },
    // 复制节点（重新生成 id，保持内部连线）
    cloneNodes(project, nodes, keepExternal) {
      const map = new Map(); const copy = MF.clone(nodes);
      const reid = (list) => { for (const n of list) { const nid = MF.Model.id(project, 'n'); map.set(n.id, nid); n.id = nid; if (n.pins) for (const p of n.pins) p.id = MF.Model.id(project, 'p'); if (n.sub) reid(n.sub.nodes); } };
      reid(copy);
      const fix = (list, inner) => { for (const n of list) { for (const k of Object.keys(n.in)) { let key = k; if (k.startsWith('g:') && map.has(k.slice(2))) { key = 'g:' + map.get(k.slice(2)); n.in[key] = n.in[k]; delete n.in[k]; } const l = n.in[key]; const f = (x) => { const o = { n: map.has(x.n) ? map.get(x.n) : x.n, p: x.p }; if (o.p.startsWith('g:') && map.has(o.p.slice(2))) o.p = 'g:' + map.get(o.p.slice(2)); return map.has(x.n) || keepExternal && !inner ? o : null; }; if (Array.isArray(l)) { n.in[key] = l.map(f).filter(Boolean); if (!n.in[key].length) delete n.in[key]; } else { const r = f(l); if (r) n.in[key] = r; else delete n.in[key]; } } if (n.sub) fix(n.sub.nodes, true); } };
      fix(copy, false);
      return copy;
    },
    // 把选中的节点封装为节点组
    makeGroup(project, ctx, ids) {
      const set = new Set(ids); const inner = ctx.nodes.filter((n) => set.has(n.id) && !T[n.type].terminal && !T[n.type].inner); if (!inner.length) return null;
      const iset = new Set(inner.map((n) => n.id));
      const g = Nodes.create(project, 'group', { name: '节点组' }); let cx = 0, cy = 0; for (const n of inner) { cx += n.x; cy += n.y; } g.x = cx / inner.length; g.y = cy / inner.length;
      let minX = Infinity, maxX = -Infinity; for (const n of inner) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); }
      // 外部 → 内部 的连线变成组输入
      const inMap = new Map(); let iy = 0;
      for (const n of inner) for (const k of Object.keys(n.in)) {
        const l = n.in[k]; const conv = (x) => { if (iset.has(x.n)) return x; const key = x.n + ':' + x.p; let gi = inMap.get(key); if (!gi) { const src = Nodes.find(ctx, x.n); const pt = src ? Nodes.typeOfPort(src, x.p, true) : null; gi = Nodes.create(project, 'groupIn', { s: { label: pt ? pt.label : '输入', ptype: pt ? pt.type : 'geo' }, x: minX - 220, y: g.y - 60 + iy }); iy += 70; g.sub.nodes.push(gi); g.in['g:' + gi.id] = { n: x.n, p: x.p }; inMap.set(key, gi); } return { n: gi.id, p: 'out' }; };
        n.in[k] = Array.isArray(l) ? l.map(conv) : conv(l);
      }
      // 内部 → 外部 的连线变成组输出
      const outMap = new Map(); let oy = 0;
      for (const n of ctx.nodes) { if (iset.has(n.id)) continue; for (const k of Object.keys(n.in)) { const l = n.in[k]; const conv = (x) => { if (!iset.has(x.n)) return x; const key = x.n + ':' + x.p; let go = outMap.get(key); if (!go) { const src = Nodes.find(ctx, x.n); const pt = Nodes.typeOfPort(src, x.p, true); go = Nodes.create(project, 'groupOut', { s: { label: pt ? pt.label : '输出', ptype: pt ? pt.type : 'geo' }, x: maxX + 220, y: g.y - 60 + oy }); oy += 70; go.in.in = { n: x.n, p: x.p }; g.sub.nodes.push(go); outMap.set(key, go); } return { n: g.id, p: 'g:' + go.id }; }; n.in[k] = Array.isArray(l) ? l.map(conv) : conv(l); } }
      if (!outMap.size) { // 没有外部使用者：把末端节点的输出都暴露
        for (const n of inner) { const used = inner.some((m) => Object.values(m.in).some((l) => (Array.isArray(l) ? l : [l]).some((x) => x && x.n === n.id))); if (used) continue; for (const pt of Nodes.ports(n).outs) { const go = Nodes.create(project, 'groupOut', { s: { label: pt.label, ptype: pt.type }, x: maxX + 220, y: g.y - 60 + oy }); oy += 70; go.in.in = { n: n.id, p: pt.key }; g.sub.nodes.push(go); } }
      }
      ctx.nodes = ctx.nodes.filter((n) => !iset.has(n.id)); for (const n of inner) g.sub.nodes.push(n); ctx.nodes.push(g);
      return { group: g, nodes: ctx.nodes };
    },
    ungroup(ctx, g) {
      if (g.type !== 'group') return ctx.nodes; const inner = g.sub.nodes;
      const inSrc = new Map(); for (const s of inner) if (s.type === 'groupIn') inSrc.set(s.id, g.in['g:' + s.id] || null);
      const outSrc = new Map(); for (const s of inner) if (s.type === 'groupOut') outSrc.set(s.id, s.in.in || null);
      const keep = inner.filter((s) => s.type !== 'groupIn' && s.type !== 'groupOut');
      const rew = (list, f) => { for (const n of list) for (const k of Object.keys(n.in)) { const l = n.in[k]; if (Array.isArray(l)) { n.in[k] = l.map(f).filter(Boolean); if (!n.in[k].length) delete n.in[k]; } else { const r = f(l); if (r) n.in[k] = r; else delete n.in[k]; } } };
      rew(keep, (x) => (inSrc.has(x.n) ? inSrc.get(x.n) : x));
      const rest = ctx.nodes.filter((n) => n !== g);
      rew(rest, (x) => { if (x.n !== g.id) return x; const s = outSrc.get(x.p.slice(2)); if (!s) return null; return inSrc.has(s.n) ? inSrc.get(s.n) : s; });
      return rest.concat(keep);
    },
  });
  function coerceParam(v, like) {
    if (typeof like === 'number') return typeof v === 'number' ? v : Array.isArray(v) ? v[0] : 0;
    if (Array.isArray(like)) { if (typeof v === 'number') return like.map(() => v); if (Array.isArray(v)) return like.map((x, i) => (v[i] === undefined ? x : v[i])); }
    return like;
  }
})();
