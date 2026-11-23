/* actions.js — 编辑操作：图层、父级、预合成、关键帧、效果、蒙版、形状内容 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, G = AE.G, M = U.M, Model = AE.Model, App = AE.App, Nodes = AE.Nodes;
  const A = AE.Actions = {};
  const clone = U.clone;

  // ===== 图层 =====
  A.addLayer = (L, o = {}) => { const c = App.comp; const idx = o.index !== undefined ? o.index : 0; c.layers.splice(idx, 0, L); App.sel.layers = [L.id]; App.sel.props = []; App.changed('struct'); App.emit('select'); return L; };
  A.newLayer = (type, o = {}) => {
    const c = App.comp; let L;
    App.stopPlay();
    const above = () => { const p = App.primary(); return p ? c.layers.indexOf(p) : 0; };
    if (type === 'shape') { L = Model.newLayer('shape', c, { name: Model.uniqueName(c, o.name || '形状图层 1'), out: c.dur }); const g = Model.addShapeItem(L, 'group', null, { name: '形状组 1' }); if (o.rect) { Model.addShapeItem(L, 'rect', g, { name: '矩形路径', params: { size: [o.rect[2] - o.rect[0], o.rect[3] - o.rect[1]] } }); } Model.addShapeItem(L, 'fill', g, { name: '填充' }); }
    else if (type === 'text') { L = Model.newLayer('text', c, { name: Model.uniqueName(c, o.name || '文字图层 1'), text: o.text || '锻字' }); L.props['text.size'].v = Math.round(c.h / 8); L.props['transform.position'].v = [c.w / 2, c.h / 2, 0]; }
    else if (type === 'precomp') { if (!o.comp) return null; const ic = Model.comp(App.project, o.comp); L = Model.newLayer('precomp', c, { name: Model.uniqueName(c, ic.name), comp: o.comp }); L.props['transform.anchor'].v = [ic.w / 2, ic.h / 2, 0]; L.props['transform.position'].v = [c.w / 2, c.h / 2, 0]; L.out = Math.min(c.dur, ic.dur); }
    else if (type === 'geo') {
      L = Model.newLayer('geo', c, { name: Model.uniqueName(c, o.name || '三维几何 1') }); const nd = A.makeGeoChain(o.source || null); L.geo.node = nd.id; L.props['transform.position'].v = [c.w / 2, c.h / 2, 0];
    }
    else if (type === 'particles') { L = Model.newLayer('particles', c, { name: Model.uniqueName(c, '粒子 1') }); Model.addEmitter(L, { pos: [c.w / 2, c.h / 2, 0], dir: [0, -1, 0], speed: 300, rate: 80, spread: 35 }); L.props['transform.position'].v = [0, 0, 0]; }
    else if (type === 'audio') { L = Model.newLayer('audio', c, { name: Model.uniqueName(c, '音色 1') }); L.au.events = [{ t: 0.5, v: 1, p: 1 }]; }
    else { const nm = { null: '空对象 1', adjust: '调整图层 1', camera: '摄像机 1', light: '灯光 1' }[type]; L = Model.newLayer(type, c, { name: Model.uniqueName(c, o.name || nm), lightType: o.lightType }); if (type === 'null') { L.props['transform.anchor'].v = [0, 0, 0]; L.is3D = !!o.is3D; } if (type === 'light' && o.lightType === 'point') { L.name = Model.uniqueName(c, '点光源 1'); L.props['transform.position'].v = [c.w / 2, c.h / 3, -400]; L.props['light.intensity'].v = 3; } }
    A.addLayer(L, { index: o.index !== undefined ? o.index : above() }); App.commit('新建' + Model.LAYER_TYPES[type] + '图层'); return L;
  };
  // 创建 源→三角化→挤出→显示 节点链；src: 文字/形状图层
  A.makeGeoChain = (src, pos = [60, 60]) => {
    const p = App.project; let first;
    if (src && src.type === 'text') first = Nodes.create(p, 'src.text', pos[0], pos[1], { layer: src.id }); else if (src && src.type === 'shape') first = Nodes.create(p, 'src.shape', pos[0], pos[1], { layer: src.id }); else { first = Nodes.create(p, 'prim.star', pos[0], pos[1]); }
    const tess = Nodes.create(p, 'tess', pos[0] + 220, pos[1]); Nodes.link(p, tess, 'in', first);
    const ex = Nodes.create(p, 'extrude', pos[0] + 440, pos[1]); Nodes.link(p, ex, 'in', tess);
    const out = Nodes.create(p, 'output', pos[0] + 660, pos[1]); Nodes.link(p, out, 'in', ex); out.name = '显示：' + (src ? src.name : '几何');
    return out;
  };
  A.toSolid = (src) => { const L = A.newLayer('geo', { source: src, name: (src.name || '几何') + ' 实体' }); if (L && src.type === 'text') { L.props['transform.position'].v = App.val(src, 'transform.position').slice(); } return L; };
  A.duplicate = () => {
    const c = App.comp; const sel = App.selLayers(); if (!sel.length) return; const out = [];
    for (const L of sel.slice().sort((a, b) => c.layers.indexOf(a) - c.layers.indexOf(b))) { const cp = Model.cloneLayer(L, Model.uniqueName(c, L.name)); c.layers.splice(c.layers.indexOf(L), 0, cp); out.push(cp.id); }
    App.sel.layers = out; App.changed('struct'); App.emit('select'); App.commit('复制图层');
  };
  A.remove = () => {
    const c = App.comp; const sel = App.selLayers(); if (!sel.length) return; const ids = new Set(sel.map(l => l.id));
    for (const L of sel) for (const ch of c.layers) if (ch.parent === L.id && !ids.has(ch.id)) A.setParent(ch, L.parent && !ids.has(L.parent) ? L.parent : null, true);
    for (const L of c.layers) if (L.matte && ids.has(L.matte.layer)) L.matte = { mode: 'none', layer: null, inv: false };
    c.layers = c.layers.filter(l => !ids.has(l.id)); App.project.comps.forEach(cc => cc.layers.forEach(l => { if (l.type === 'precomp' && ids.has(l.comp)) { } }));
    App.sel.layers = []; App.sel.props = []; App.sel.keys = []; App.changed('struct'); App.emit('select'); App.commit('删除图层');
  };
  A.reorder = (L, delta) => { const c = App.comp; const i = c.layers.indexOf(L); const j = U.clamp(i + delta, 0, c.layers.length - 1); if (i === j) return; c.layers.splice(i, 1); c.layers.splice(j, 0, L); App.changed('struct'); App.commit('调整图层顺序'); };
  A.moveTo = (L, index) => { const c = App.comp; const i = c.layers.indexOf(L); c.layers.splice(i, 1); c.layers.splice(U.clamp(index, 0, c.layers.length), 0, L); App.changed('struct'); App.commit('调整图层顺序'); };
  A.rename = (L, name) => { name = (name || '').trim(); if (!name || name === L.name) return; L.name = name; App.changed('struct'); App.commit('重命名图层'); };
  A.setInOut = (L, tin, tout) => { L.in = U.clamp(tin, -1e6, 1e6); L.out = Math.max(L.in + 1 / App.fps(), tout); };
  // 移动图层时间（连同关键帧）
  A.shiftLayer = (L, dt) => { L.in += dt; L.out += dt; L.start += dt; for (const p of Object.values(L.props)) if (p.k) for (const k of p.k) k.t += dt; if (L.au) L.au.events.forEach(e => e.t += dt); };

  // ===== 父级（保持当前画面）=====
  A.setParent = (L, parentId, silent) => {
    const c = App.comp, ev = App.ev, t = App.time; if (parentId === L.id) return; const P = parentId ? Model.layer(c, parentId) : null; if (P && Model.isDescendant(c, P, L)) { App.toast('不能把子层设为父级'); return; }
    const m3 = !!L.is3D; ev.invalidate();
    const world = ev.worldMatrix(c, L, t); const a = ev.value(c, L, 'transform.anchor', t);
    const own = M.mul(world, M.translate(a[0], a[1], m3 ? (a[2] || 0) : 0)); // 世界框架
    L.parent = parentId || null; ev.invalidate();
    const pf = ev.parentFrame(c, L, t, m3); const loc = M.mul(M.invert(pf), own);
    const set = (k, v) => { const p = L.props[k]; if (Model.hasExpr(p)) return; Model.setPropAt(L, k, t, v, { fps: c.fps }); };
    if (m3) { const d = M.decompose3d(loc); set('transform.position', d.pos); set('transform.rotation', d.rot[2]); set('transform.rotX', d.rot[0]); set('transform.rotY', d.rot[1]); set('transform.scale', d.scale.map(s => s * 100)); }
    else { const d = M.decompose2d(loc); set('transform.position', [d.x, d.y, 0]); set('transform.rotation', d.rot); set('transform.scale', [d.sx * 100, d.sy * 100, 100]); }
    if (!silent) { App.changed('struct'); App.commit(P ? '设置父级' : '解除父级'); }
  };
  // 3D 开关（保持画面近似：位置保持，z=0）
  A.toggle3D = (L) => { L.is3D = !L.is3D; App.changed('struct'); App.commit('切换三维图层'); };

  // ===== 预合成 =====
  A.precompose = (name) => {
    const c = App.comp, proj = App.project; const sel = App.selLayers().filter(l => l.type !== 'audio' || true); if (!sel.length) { App.toast('请先选择图层'); return null; }
    const selSet = new Set(sel.map(l => l.id));
    let nm = name || 'Pre-comp ' + (proj.comps.length); const names = new Set(proj.comps.map(x => x.name)); let base = '预合成 '; let n = 1; while (names.has(base + n)) n++; nm = name || base + n;
    const nc = Model.newComp({ name: nm, w: c.w, h: c.h, fps: c.fps, dur: c.dur, bg: c.bg.slice() }); nc.mb = clone(c.mb); nc.work = c.work.slice();
    const ghosts = new Map(); const clonesOf = new Map();
    const orderIdx = l => c.layers.indexOf(l);
    // 在 nc 中为未选父级建立占位空对象
    const ghostIn = (P) => {
      if (selSet.has(P.id)) return P.id; if (ghosts.has(P.id)) return ghosts.get(P.id);
      const g = Model.newLayer('null', nc, { name: P.name + '（父级）', out: nc.dur }); g.props = clone(P.props); g.is3D = P.is3D; ghosts.set(P.id, g.id); g.visible = false;
      const PP = P.parent ? Model.layer(c, P.parent) : null; g.parent = PP ? ghostIn(PP) : null; nc.layers.push(g); return g.id;
    };
    // 外部引用克隆（遮罩、表达式引用）
    const refClone = (id) => { if (selSet.has(id)) return id; if (clonesOf.has(id)) return clonesOf.get(id); const O = Model.layer(c, id); if (!O) return null; const cp = Model.cloneLayer(O); cp.visible = false; clonesOf.set(id, cp.id); cp.parent = O.parent ? ghostIn(Model.layer(c, O.parent)) : null; nc.layers.push(cp); return cp.id; };
    const sorted = sel.slice().sort((a, b) => orderIdx(a) - orderIdx(b));
    for (const L of sorted) {
      if (L.parent && !selSet.has(L.parent)) L.parent = ghostIn(Model.layer(c, L.parent));
      if (L.matte && L.matte.layer && !selSet.has(L.matte.layer)) { L.matte = Object.assign({}, L.matte, { layer: refClone(L.matte.layer) }); }
      for (const p of Object.values(L.props)) if (p.x) { const re = /layer\(\s*["'“]([^"'”]+)["'”]\s*\)/g; let m; while ((m = re.exec(p.x))) { const O = c.layers.find(x => x.name === m[1]); if (O && !selSet.has(O.id)) refClone(O.id); } }
    }
    if (sorted.some(l => l.is3D)) { for (const O of c.layers) if ((O.type === 'camera' || O.type === 'light') && !selSet.has(O.id)) { const cp = Model.cloneLayer(O); cp.parent = O.parent ? ghostIn(Model.layer(c, O.parent)) : null; nc.layers.push(cp); } }
    // 被移走的父级需要在原合成中留下占位（保持未选子层的画面）
    const holders = new Map();
    const holderFor = (P) => {
      if (holders.has(P.id)) return holders.get(P.id);
      const h = Model.newLayer('null', c, { name: P.name + '（占位）', out: c.dur }); h.props = clone(P.props); h.is3D = P.is3D; h.visible = false; holders.set(P.id, h.id);
      const PP = P.parent ? Model.layer(c, P.parent) : null; h.parent = PP ? (selSet.has(PP.id) ? holderFor(PP) : PP.id) : null; c.layers.splice(Math.max(0, orderIdx(P)), 0, h); return h.id;
    };
    for (const ch of c.layers.slice()) if (!selSet.has(ch.id) && ch.parent && selSet.has(ch.parent) && !holders.has('x' + ch.id)) { ch.parent = holderFor(Model.layer(c, ch.parent)); }
    const top = Math.min(...sorted.map(orderIdx));
    const tin = Math.min(...sorted.map(l => l.in)), tout = Math.max(...sorted.map(l => l.out));
    for (const L of sorted) { c.layers.splice(c.layers.indexOf(L), 1); }
    nc.layers.unshift(...sorted);
    proj.comps.push(nc);
    const pl = Model.newLayer('precomp', c, { name: nm, comp: nc.id, in: Math.max(0, tin), out: Math.min(c.dur, tout) });
    pl.props['transform.anchor'].v = [c.w / 2, c.h / 2, 0]; pl.props['transform.position'].v = [c.w / 2, c.h / 2, 0];
    const at = Math.min(top, c.layers.length); c.layers.splice(at, 0, pl);
    App.sel.layers = [pl.id]; App.sel.props = []; App.sel.keys = []; App.changed('struct'); App.emit('select'); App.commit('预合成'); App.toast('已预合成为「' + nm + '」'); return pl;
  };
  A.openComp = id => App.setComp(id);

  // ===== 效果 / 蒙版 =====
  A.addEffect = (L, type) => { Model.addEffect(L, type); App.changed('struct'); App.commit('添加效果'); };
  A.removeEffect = (L, id) => { L.effects = L.effects.filter(e => e.id !== id); for (const k of Object.keys(L.props)) if (k.startsWith(`fx.${id}.`)) delete L.props[k]; App.changed('struct'); App.commit('删除效果'); };
  A.moveEffect = (L, id, d) => { const i = L.effects.findIndex(e => e.id === id); const j = U.clamp(i + d, 0, L.effects.length - 1); if (i === j) return; const [e] = L.effects.splice(i, 1); L.effects.splice(j, 0, e); App.changed('struct'); App.commit('排序效果'); };
  A.addMask = (L, kind, rect) => {
    const c = App.comp; let w = 400, h = 300, cx = 0, cy = 0; if (L.type === 'precomp') { const ic = Model.comp(App.project, L.comp); w = ic.w * 0.6; h = ic.h * 0.6; cx = ic.w / 2; cy = ic.h / 2; }
    if (rect) { w = rect[2] - rect[0]; h = rect[3] - rect[1]; cx = (rect[0] + rect[2]) / 2; cy = (rect[1] + rect[3]) / 2; }
    const sh = kind === 'ellipse' ? G.ellipseShape(w, h, cx, cy) : G.rectShape(w, h, 0, cx, cy); Model.addMask(L, sh, { mode: 'add' }); App.changed('struct'); App.commit('添加蒙版');
  };
  A.removeMask = (L, id) => { L.masks = L.masks.filter(m => m.id !== id); for (const k of Object.keys(L.props)) if (k.startsWith(`mk.${id}.`)) delete L.props[k]; App.changed('struct'); App.commit('删除蒙版'); };

  // ===== 形状内容 =====
  A.addShapeItem = (L, type, parent) => {
    const par = parent || (L.shape.items.find(i => i.type === 'group') || null);
    let g = par; if (!g) g = Model.addShapeItem(L, 'group', null, { name: '形状组 1' });
    const it = Model.addShapeItem(L, type, g, { index: ['fill', 'stroke'].includes(type) ? g.items.length : 0 });
    if (type === 'path') L.props[`sh.${it.id}.path`].v = G.rectShape(160, 120);
    App.changed('struct'); App.commit('添加' + Model.SHAPE_ITEMS[type].name); return it;
  };
  A.removeShapeItem = (L, item) => { const kill = it => { for (const k of Object.keys(L.props)) if (k.startsWith(`sh.${it.id}.`)) delete L.props[k]; (it.items || []).forEach(kill); }; kill(item); const rec = items => { const i = items.indexOf(item); if (i >= 0) { items.splice(i, 1); return true; } return items.some(x => x.items && rec(x.items)); }; rec(L.shape.items); App.changed('struct'); App.commit('删除形状项'); };
  A.moveShapeItem = (L, item, d) => { const rec = items => { const i = items.indexOf(item); if (i >= 0) { const j = U.clamp(i + d, 0, items.length - 1); items.splice(i, 1); items.splice(j, 0, item); return true; } return items.some(x => x.items && rec(x.items)); }; rec(L.shape.items); App.changed('struct'); App.commit('调整形状项顺序'); };

  // ===== 关键帧 =====
  A.propsOf = (L) => Model.allPropKeys(L);
  A.toggleStopwatch = (L, key) => { const p = L.props[key]; const v = App.val(L, key); Model.toggleAnim(L, key, App.time, Model.isAnimated(p) ? v : Model.evalKeys(p, App.time, Model.propInfo(L, key))); App.changed('struct'); App.commit(Model.isAnimated(p) ? '启用动画' : '清除动画'); };
  A.addKeyHere = (L, key) => { const base = Model.evalKeys(L.props[key], App.time, Model.propInfo(L, key)); Model.addKeyAt(L, key, App.time, base); App.changed('struct'); App.commit('添加关键帧'); };
  A.selKeys = () => { const out = []; for (const s of App.sel.keys) { const L = App.layer(s.layer); const p = L && L.props[s.key]; if (!p || !p.k) continue; const i = Model.keyAt(p, s.t, 1e-3); if (i >= 0) out.push({ L, key: s.key, p, k: p.k[i], info: Model.propInfo(L, s.key) }); } return out; };
  A.setKeySel = (list, add) => { App.sel.keys = add ? App.sel.keys.concat(list.filter(a => !App.sel.keys.some(b => b.layer === a.layer && b.key === a.key && Math.abs(b.t - a.t) < 1e-4))) : list; App.emit('keysel'); };
  A.deleteKeys = () => { const ks = A.selKeys(); if (!ks.length) return false; for (const e of ks) { const i = e.p.k.indexOf(e.k); e.p.k.splice(i, 1); if (!e.p.k.length) { delete e.p.k; } else Model.normalizeProp(e.p, e.info); } App.sel.keys = []; App.changed('struct'); App.commit('删除关键帧'); return true; };
  A.copyKeys = () => { const ks = A.selKeys(); if (!ks.length) return; const t0 = Math.min(...ks.map(e => e.k.t)); App.clip.keys = ks.map(e => ({ layer: e.L.id, name: e.L.name, key: e.key, k: clone(e.k), dt: e.k.t - t0 })); App.toast('已复制 ' + ks.length + ' 个关键帧'); };
  A.pasteKeys = () => {
    const cl = App.clip.keys; if (!cl || !cl.length) return false; const sel = App.selLayers(); const t = App.time; const newSel = [];
    for (const e of cl) { // 目标：同名属性；若已选图层则粘贴到选中图层
      const targets = sel.length ? sel.filter(L => L.props[e.key]) : [App.layer(e.layer)].filter(Boolean);
      for (const L of targets) { const p = L.props[e.key]; const info = Model.propInfo(L, e.key); if (!p.k) p.k = []; const k = clone(e.k); k.t = t + e.dt; const i = Model.keyAt(p, k.t); if (i >= 0) p.k.splice(i, 1); p.k.push(k); Model.normalizeProp(p, info); newSel.push({ layer: L.id, key: e.key, t: k.t }); }
    }
    App.sel.keys = newSel; App.changed('struct'); App.commit('粘贴关键帧'); return true;
  };
  A.moveKeys = (list, dt) => { // list: A.selKeys() 的快照
    for (const e of list) e.k.t = Math.max(0, e.k.t0 + dt);
    const seen = new Set(); for (const e of list) { const id = e.L.id + '|' + e.key; if (seen.has(id)) continue; seen.add(id); Model.normalizeProp(e.p, e.info); }
  };
  A.setInterp = (which, type) => { // which: 'in'|'out'|'both'
    const ks = A.selKeys(); for (const e of ks) { if (which !== 'out') e.k.ii = type; if (which !== 'in') e.k.oi = type; if (type === 'bezier') { if (which !== 'out' && (!e.k.ie || e.k.ie.x === e.k.ie.y)) { } } }
    App.changed('struct'); App.commit('关键帧插值');
  };
  A.easyEase = (which = 'both') => {
    let ks = A.selKeys();
    if (!ks.length) { for (const s of App.sel.props) { const L = App.layer(s.layer); const p = L && L.props[s.key]; if (p && p.k) { const i = Model.keyAt(p, App.time, 0.5 / App.fps()); if (i >= 0) ks.push({ L, key: s.key, p, k: p.k[i], info: Model.propInfo(L, s.key) }); } } }
    if (!ks.length) { App.toast('请先选择关键帧'); return; }
    for (const e of ks) { if (which !== 'out') { e.k.ii = 'bezier'; e.k.ie = { x: 1 / 3, y: 0 }; } if (which !== 'in') { e.k.oi = 'bezier'; e.k.oe = { x: 1 / 3, y: 0 }; } }
    App.changed('struct'); App.commit('缓入缓出');
  };
  A.setSpatial = (mode) => { const ks = A.selKeys(); for (const e of ks) { if (!e.info.spatial) continue; e.k.sm = mode; if (mode === 'lin') { e.k.si = null; e.k.so = null; } Model.normalizeProp(e.p, e.info); } App.changed('struct'); App.commit('空间插值'); };
  A.scaleKeys = (list, factor, pivot) => { for (const e of list) e.k.t = Math.max(0, pivot + (e.k.t0 - pivot) * factor); const seen = new Set(); for (const e of list) { const id = e.L.id + '|' + e.key; if (seen.has(id)) continue; seen.add(id); Model.normalizeProp(e.p, e.info); } };

  // ===== 属性辅助 =====
  A.selectAll = () => { App.sel.layers = App.comp.layers.map(l => l.id); App.emit('select'); App.requestRender(); };
  A.copyLayers = () => { const s = App.selLayers(); if (!s.length) return false; App.clip.layers = s.map(l => clone(l)); App.toast('已复制 ' + s.length + ' 个图层'); return true; };
  A.pasteLayers = () => { const cl = App.clip.layers; if (!cl || !cl.length) return false; const c = App.comp; const ids = []; for (const L of cl.slice().reverse()) { const cp = Model.cloneLayer(L, Model.uniqueName(c, L.name)); cp.parent = null; c.layers.unshift(cp); ids.push(cp.id); } App.sel.layers = ids; App.changed('struct'); App.emit('select'); App.commit('粘贴图层'); return true; };
  A.compSettings = (c, o) => { Object.assign(c, o); if (c.work[1] > c.dur) c.work[1] = c.dur; if (c.work[0] >= c.work[1]) c.work = [0, c.dur]; App.changed('struct'); App.commit('合成设置'); };
  A.newComp = (o = {}) => { const c = Model.newComp(o); App.project.comps.push(c); App.setComp(c.id); App.changed('struct'); App.commit('新建合成'); return c; };
  A.deleteComp = (id) => { const p = App.project; if (p.comps.length <= 1) { App.toast('至少保留一个合成'); return; } if (p.comps.some(c => c.layers.some(l => l.type === 'precomp' && l.comp === id))) { App.toast('该合成被其他图层引用，无法删除'); return; } p.comps = p.comps.filter(c => c.id !== id); if (p.active === id) p.active = p.comps[0].id; App.changed('struct'); App.emit('comp'); App.commit('删除合成'); };
})();
