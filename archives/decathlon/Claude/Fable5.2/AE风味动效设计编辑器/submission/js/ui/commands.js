// 编辑命令：图层/合成/关键帧/效果/预合成等对工程的修改，全部经由 App.edit 记录撤销
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const App = MF.App, Model = MF.Model, A = MF.Anim;
  const comp = () => App.comp();

  function reId(project, obj, map) {
    if (Array.isArray(obj)) { for (const o of obj) reId(project, o, map); return; }
    if (!obj || typeof obj !== 'object') return;
    if (typeof obj.id === 'string' && obj.id.length < 12) { const prefix = obj.id.replace(/[0-9a-z]+$/, '') || obj.id[0]; const nid = Model.id(project, obj.id[0]); map.set(obj.id, nid); obj.id = nid; void prefix; }
    for (const k in obj) if (k !== 'id' && obj[k] && typeof obj[k] === 'object') reId(project, obj[k], map);
  }
  function uniqueName(c, base) { const names = new Set(c.layers.map((l) => l.name)); if (!names.has(base)) return base; let i = 2; const m = base.match(/^(.*?)(\s*\d+)?$/); const stem = m ? m[1] : base; while (names.has(stem + ' ' + i)) i++; return stem + ' ' + i; }
  function nodeSpot(c) { let x = 40, y = 40; for (const n of c.nodes) y = Math.max(y, n.y + 150); return [x, y]; }
  // 遍历图层内全部属性对象
  function eachProp(L, fn) { const c = comp(); Model.eachProp(App.project, c, L, fn); }

  const C = (MF.Cmd = {
    clipboard: null,
    // ---------- 合成 ----------
    newComp(o) { let c; App.edit('新建合成', () => { c = Model.newComp(App.project, o); }); App.openComp(c.id); return c; },
    deleteComp(id) { if (App.project.comps.length <= 0) return; App.edit('删除合成', () => { App.project.comps = App.project.comps.filter((c) => c.id !== id); for (const c of App.project.comps) c.layers = c.layers.filter((l) => !(l.type === 'precomp' && l.src.comp === id)); if (App.project.activeComp === id) App.project.activeComp = App.project.comps[0] ? App.project.comps[0].id : null; }); if (App.compId === id) { App.compId = App.project.activeComp; App.openComp(App.compId); } },
    duplicateComp(id) { const src = Model.getComp(App.project, id); if (!src) return; App.edit('复制合成', () => { const c = MF.clone(src); const map = new Map(); c.id = Model.id(App.project, 'c'); c.name = src.name + ' 副本'; reId(App.project, c.layers, map); reId(App.project, c.nodes, map); fixRefs(c, map); App.project.comps.push(c); }); },
    // ---------- 图层 ----------
    addLayer(type, o) {
      const c = comp(); if (!c) { App.toast('请先新建合成（Ctrl+N）', 'err'); return null; } let L;
      App.edit('新建' + MF.Schema.layerTypes[type], () => {
        o = o || {}; L = Model.newLayer(App.project, c, type, o); L.name = uniqueName({ layers: c.layers.filter((x) => x !== L) }, o.name || L.name); L.in = 0; L.out = c.duration;
        if (type === 'shape' && !o.empty) {
          const k = o.shape || 'rect';
          L.items.push(Model.newShapeItem(App.project, k, k === 'rect' ? { size: [300, 300] } : k === 'ellipse' ? { size: [300, 300] } : {}));
          L.items.push(Model.newShapeItem(App.project, 'stroke', { width: 0 })); L.items.push(Model.newShapeItem(App.project, 'fill'));
        }
        if (type === 'geo' && !o.empty) {
          const [x, y] = nodeSpot(c); const P = App.project, N = MF.Nodes;
          const src = o.source === 'box' ? N.create(P, 'box', { x, y, p: { size: [300, 300, 300] } }) : N.create(P, 'textGlyph', { x, y, s: { text: o.text || '锻', font: 'kai' }, p: { size: 420 } });
          const chain = [src];
          if (o.source !== 'box') { chain.push(N.create(P, 'mesh', { x: x + 190, y, p: { density: 22 } })); chain.push(N.create(P, 'extrude', { x: x + 380, y, p: { depth: 90, bevel: 5 } })); }
          chain.push(N.create(P, 'xform3', { x: x + 190 * chain.length, y, p: { position: [c.w / 2, c.h / 2, 0], rotation: [0, 25, 0] } }));
          const term = N.create(P, 'geoLayer', { x: x + 190 * chain.length, y, s: { layer: L.id }, name: '显示 · ' + L.name });
          for (let i = 1; i < chain.length; i++) chain[i].in.geo = { n: chain[i - 1].id, p: 'geo' };
          term.in.geo = { n: chain[chain.length - 1].id, p: 'geo' }; c.nodes.push(...chain, term);
        } else if (type === 'geo') { const [x, y] = nodeSpot(c); c.nodes.push(MF.Nodes.create(App.project, 'geoLayer', { x: x + 600, y, s: { layer: L.id }, name: '显示 · ' + L.name })); }
        if (type === 'particles') {
          const [x, y] = nodeSpot(c); c.nodes.push(MF.Nodes.create(App.project, 'partLayer', { x: x + 600, y, s: { layer: L.id }, name: '粒子 · ' + L.name }));
          if (!o.empty) L.ps.emitters.push(Model.newEmitter(App.project, { position: [c.w / 2, c.h / 2, 0] }));
        }
        if (type === 'audio' && !o.empty) { L.audio.s.notes = [[0, 0.5, 60, 0.8], [0.5, 0.5, 64, 0.8], [1, 0.5, 67, 0.8], [1.5, 1, 72, 0.9]]; }
      });
      if (L) App.selectLayers([L.id]); return L;
    },
    deleteLayers(ids) {
      const c = comp(); ids = ids || App.sel.layers; if (!ids.length) return;
      App.edit('删除图层', () => {
        const t = App.time;
        for (const L of c.layers) if (L.parent && ids.indexOf(L.parent) >= 0 && ids.indexOf(L.id) < 0) MF.Scene.setParentKeep(c, L, null, t);
        c.layers = c.layers.filter((l) => ids.indexOf(l.id) < 0);
        c.nodes = c.nodes.filter((n) => !((n.type === 'geoLayer' || n.type === 'partLayer') && ids.indexOf(n.s.layer) >= 0));
        MF.Nodes.eachNode(c.nodes, (n) => { for (const k of ['layer', 'follow']) if (n.s && ids.indexOf(n.s[k]) >= 0) n.s[k] = null; });
      });
      App.selectLayers([]);
    },
    duplicateLayers() {
      const c = comp(); const ids = App.sel.layers; if (!ids.length) return; const made = [];
      App.edit('重复图层', () => {
        const map = new Map(); const srcs = c.layers.filter((l) => ids.indexOf(l.id) >= 0);
        for (const L of srcs) { const d = MF.clone(L); reId(App.project, d, map); d.name = uniqueName(c, L.name); c.layers.splice(c.layers.indexOf(L), 0, d); made.push(d.id);
          const term = MF.Nodes.terminalOf(c, L.id); if (term) { const nt = MF.clone(term); nt.id = Model.id(App.project, 'n'); nt.s.layer = d.id; nt.y += 110; nt.name = term.name.replace(L.name, d.name); c.nodes.push(nt); } }
        for (const id of made) { const d = Model.getLayer(c, id); if (d.parent && map.has(d.parent)) d.parent = map.get(d.parent); }
      });
      App.selectLayers(made);
    },
    moveLayers(dir) {
      const c = comp(); const ids = App.sel.layers; if (!ids.length) return;
      App.edit('调整图层顺序', () => {
        const sel = c.layers.filter((l) => ids.indexOf(l.id) >= 0);
        if (dir === 'top') c.layers = sel.concat(c.layers.filter((l) => ids.indexOf(l.id) < 0));
        else if (dir === 'bottom') c.layers = c.layers.filter((l) => ids.indexOf(l.id) < 0).concat(sel);
        else if (dir === 'up') { for (let i = 1; i < c.layers.length; i++) if (ids.indexOf(c.layers[i].id) >= 0 && ids.indexOf(c.layers[i - 1].id) < 0) { const t = c.layers[i]; c.layers[i] = c.layers[i - 1]; c.layers[i - 1] = t; } }
        else { for (let i = c.layers.length - 2; i >= 0; i--) if (ids.indexOf(c.layers[i].id) >= 0 && ids.indexOf(c.layers[i + 1].id) < 0) { const t = c.layers[i]; c.layers[i] = c.layers[i + 1]; c.layers[i + 1] = t; } }
      });
    },
    reorderLayer(id, toIndex) { const c = comp(); App.edit('调整图层顺序', () => { const i = Model.layerIndex(c, id); if (i < 0) return; const [L] = c.layers.splice(i, 1); c.layers.splice(MF.clamp(toIndex > i ? toIndex - 1 : toIndex, 0, c.layers.length), 0, L); }); },
    setParent(L, parentId) { const c = comp(); if (parentId && MF.Scene.wouldCycle(c, L, parentId)) { App.toast('不能把图层的后代设为它的父级', 'err'); return; } App.edit(parentId ? '设定父级' : '解除父级', () => MF.Scene.setParentKeep(c, L, parentId, App.time)); },
    toggle3D() { const ls = App.selLayers().filter((l) => l.type === 'shape' || l.type === 'text' || l.type === 'precomp' || l.type === 'null'); if (!ls.length) return; App.edit('切换三维图层', () => { const on = !ls[0].is3D; for (const L of ls) L.is3D = on; }); },
    toggleMB() { const ls = App.selLayers(); if (!ls.length) return; App.edit('切换运动模糊', () => { const on = !ls[0].mb; for (const L of ls) L.mb = on; }); },
    trimIn() { App.edit('修剪入点', () => { for (const L of App.selLayers()) L.in = Math.min(App.time, L.out - 1 / App.fps()); }); },
    trimOut() { App.edit('修剪出点', () => { for (const L of App.selLayers()) L.out = Math.max(App.time + 1 / App.fps(), L.in + 1 / App.fps()); }); },
    moveInTo() { App.edit('移动入点到当前时间', () => { for (const L of App.selLayers()) C.shiftLayer(L, App.time - L.in); }); },
    moveOutTo() { App.edit('移动出点到当前时间', () => { for (const L of App.selLayers()) C.shiftLayer(L, App.time + 1 / App.fps() - L.out); }); },
    // 整体平移图层（含关键帧与起始时间）
    shiftLayer(L, dt) { L.in += dt; L.out += dt; L.start = (L.start || 0) + dt; eachProp(L, (d) => { if (d.id.startsWith('node.') || d.id.startsWith('pin.')) return; if (d.prop.k) for (const k of d.prop.k) k.t += dt; }); },
    // ---------- 预合成 ----------
    precompose(name) {
      const c = comp(); const ids = App.sel.layers.slice(); if (!ids.length) { App.toast('请先选择要预合成的图层'); return; }
      let newComp, PL;
      App.edit('预合成', () => {
        const P = App.project; const moved = c.layers.filter((l) => ids.indexOf(l.id) >= 0); const movedSet = new Set(moved.map((l) => l.id));
        newComp = Model.newComp(P, { name: name || uniqueCompName(P, '预合成'), w: c.w, h: c.h, fps: c.fps, duration: c.duration, bg: c.bg });
        newComp.mb = MF.clone(c.mb); newComp.env = MF.clone(c.env);
        const firstIdx = c.layers.findIndex((l) => movedSet.has(l.id));
        const inner = moved.slice();
        // 1) 未被选中的祖先：以空对象副本带入，父级动画保持
        const proxies = new Map();
        const proxyFor = (id) => { if (!id) return null; if (movedSet.has(id)) return id; if (proxies.has(id)) return proxies.get(id).id; const src = Model.getLayer(c, id); if (!src) return null; const cp = MF.clone(src); const m = new Map(); const keep = { id: Model.id(P, 'L'), type: 'null', name: src.name + '（父级代理）', visible: false, locked: false, label: 8, in: 0, out: c.duration, start: 0, parent: null, blend: 'normal', matte: 'none', is3D: src.is3D || src.type === 'camera' || src.type === 'light', mb: false, tr: cp.tr, masks: [], fx: cp.fx.filter((f) => MF.Schema.effects[f.type].ctl) }; void m; proxies.set(id, keep); keep.parent = proxyFor(src.parent); return keep.id; };
        for (const L of moved) if (L.parent && !movedSet.has(L.parent)) L.parent = proxyFor(L.parent);
        // 2) 三维图层需要的摄像机与灯光
        const any3D = moved.some((l) => MF.Scene.is3DLayer(l)); const extra = [];
        if (any3D) for (const l of c.layers) if ((l.type === 'camera' || l.type === 'light') && !movedSet.has(l.id)) { const cp = MF.clone(l); const m = new Map(); reId(P, cp, m); cp.parent = l.parent ? proxyFor(l.parent) : null; extra.push(cp); }
        // 3) 节点：复制上游闭包；被引用但未选中的图层以隐藏副本带入
        const lmap = new Map(); const nodesNew = [];
        const needLayer = (id) => { if (!id) return id; if (movedSet.has(id)) return id; if (lmap.has(id)) return lmap.get(id); const src = Model.getLayer(c, id); if (!src) return null; const cp = MF.clone(src); const m = new Map(); reId(P, cp, m); cp.visible = false; cp.name = src.name; cp.parent = src.parent ? proxyFor(src.parent) : null; lmap.set(id, cp.id); extra.push(cp); return cp.id; };
        const seen = new Set();
        for (const L of moved) { const term = MF.Nodes.terminalOf(c, L.id); if (!term) continue; const ups = MF.Nodes.upstream(MF.Nodes.top(c), term).concat([term]); for (const n of ups) if (!seen.has(n.id)) { seen.add(n.id); nodesNew.push(n); } }
        const stay = c.layers.filter((l) => !movedSet.has(l.id));
        const usedOutside = new Set(); for (const L of stay) { const term = MF.Nodes.terminalOf(c, L.id); if (term) for (const n of MF.Nodes.upstream(MF.Nodes.top(c), term)) usedOutside.add(n.id); }
        const copies = MF.Nodes.cloneNodes(P, nodesNew, false);
        MF.Nodes.eachNode(copies, (n) => { for (const k of ['layer', 'follow']) if (n.s && n.s[k]) n.s[k] = (n.type === 'geoLayer' || n.type === 'partLayer') ? n.s[k] : needLayer(n.s[k]); });
        newComp.nodes = copies;
        c.nodes = c.nodes.filter((n) => !(seen.has(n.id) && !usedOutside.has(n.id)));
        // 4) 留在外面的子层：父级换成外层的空对象代理
        const outerProxy = new Map();
        const outerFor = (id) => { if (!id || !movedSet.has(id)) return id; if (outerProxy.has(id)) return outerProxy.get(id).id; const src = moved.find((l) => l.id === id); const cp = MF.clone(src); const keep = { id: Model.id(P, 'L'), type: 'null', name: src.name + '（父级代理）', visible: false, locked: false, label: 8, in: 0, out: c.duration, start: 0, parent: null, blend: 'normal', matte: 'none', is3D: src.is3D, mb: false, tr: cp.tr, masks: [], fx: [] }; outerProxy.set(id, keep); keep.parent = src.parent && proxies.size && Array.from(proxies.values()).some((p) => p.id === src.parent) ? Array.from(proxies.entries()).find(([, p]) => p.id === src.parent)[0] : outerFor(src.parent); return keep.id; };
        for (const L of stay) if (L.parent && movedSet.has(L.parent)) L.parent = outerFor(L.parent);
        // 5) 组装
        newComp.layers = inner.concat(extra, Array.from(proxies.values()));
        c.layers = stay; PL = Model.newLayer(P, c, 'precomp', { comp: newComp.id, name: newComp.name }); c.layers.shift();
        PL.in = 0; PL.out = c.duration; PL.mb = false;
        c.layers.splice(Math.min(firstIdx, c.layers.length), 0, PL, ...Array.from(outerProxy.values()));
        P.activeComp = c.id;
      });
      if (PL) App.selectLayers([PL.id]); App.toast('已预合成为 “' + newComp.name + '”'); return newComp;
    },
    enableRemap(L) { App.edit('启用时间重映射', () => { const sc = Model.getComp(App.project, L.src.comp); L.src.remapOn = !L.src.remapOn; if (L.src.remapOn && !L.remap.k) { const d = sc ? sc.duration : 1; L.remap = { v: 0, k: [A.mkKey(L.start || 0, 0), A.mkKey((L.start || 0) + d, d)] }; } }); },
    // ---------- 效果/蒙版/形状项/动画器 ----------
    addEffect(type) { const ls = App.selLayers().filter((l) => l.fx && l.type !== 'audio' && l.type !== 'camera' && l.type !== 'light'); if (!ls.length) { App.toast('请先选择一个图层'); return; } App.edit('添加效果', () => { for (const L of ls) { const f = Model.newEffect(App.project, type); let nm = f.name, i = 2; while (L.fx.some((x) => x.name === nm)) nm = f.name + ' ' + i++; f.name = nm; L.fx.push(f); App.ui.expanded[L.id + '|fx'] = true; App.ui.expanded[L.id] = true; } }); },
    removeObj(L, kind, id) {
      App.edit('删除', () => {
        if (kind === 'effect') L.fx = L.fx.filter((x) => x.id !== id); else if (kind === 'mask') L.masks = L.masks.filter((x) => x.id !== id); else if (kind === 'shapeItem') L.items = L.items.filter((x) => x.id !== id);
        else if (kind === 'animator') L.text.animators = L.text.animators.filter((x) => x.id !== id); else if (kind === 'emitter') L.ps.emitters = L.ps.emitters.filter((x) => x.id !== id); else if (kind === 'force') L.ps.forces = L.ps.forces.filter((x) => x.id !== id);
      });
    },
    moveObj(L, kind, id, dir) { const list = kind === 'effect' ? L.fx : kind === 'mask' ? L.masks : kind === 'shapeItem' ? L.items : kind === 'animator' ? L.text.animators : kind === 'emitter' ? L.ps.emitters : null; if (!list) return; const i = list.findIndex((x) => x.id === id), j = i + dir; if (i < 0 || j < 0 || j >= list.length) return; App.edit('调整顺序', () => { const t = list[i]; list[i] = list[j]; list[j] = t; }); },
    addShapeItem(L, type, over, st) { let it; App.edit('添加' + MF.Schema.shape[type].label, () => { it = Model.newShapeItem(App.project, type, over, st); let nm = it.name, i = 2; while (L.items.some((x) => x.name === nm)) nm = it.name + ' ' + i++; it.name = nm; const d = MF.Schema.shape[type]; if (d.cat === 'path') { let k = 0; while (k < L.items.length && MF.Schema.shape[L.items[k].type].cat === 'path') k++; L.items.splice(k, 0, it); } else if (d.cat === 'op') { let k = L.items.findIndex((x) => MF.Schema.shape[x.type].cat === 'style'); if (k < 0) k = L.items.length; L.items.splice(k, 0, it); } else L.items.push(it); App.ui.expanded[L.id] = true; App.ui.expanded[L.id + '|items'] = true; }); return it; },
    addMask(L, pv) { let m; App.edit('添加蒙版', () => { m = Model.newMask(App.project, pv || MF.Path.rect(300, 200, 0, 0, 0)); m.name = '蒙版 ' + (L.masks.length + 1); L.masks.push(m); App.ui.expanded[L.id] = true; App.ui.expanded[L.id + '|masks'] = true; }); return m; },
    addAnimator(L) { App.edit('添加文字动画器', () => { const a = Model.newAnimator(App.project, { position: [0, -40], opacity: 0, end: 50 }); a.name = '动画器 ' + (L.text.animators.length + 1); L.text.animators.push(a); App.ui.expanded[L.id] = true; App.ui.expanded[L.id + '|animators'] = true; }); },
    addEmitter(L) { const c = comp(); App.edit('添加发射器', () => { const e = Model.newEmitter(App.project, { position: [c.w / 2, c.h / 2, 0] }); e.name = '发射器 ' + (L.ps.emitters.length + 1); L.ps.emitters.push(e); App.ui.expanded[L.id] = true; App.ui.expanded[L.id + '|emitters'] = true; }); },
    addForce(L) { const c = comp(); App.edit('添加吸引/排斥力', () => { const e = Model.newForce(App.project, { position: [c.w / 2, c.h / 2, 0] }); e.name = '力 ' + (L.ps.forces.length + 1); L.ps.forces.push(e); }); },
    // 文字 → 形状图层（字形轮廓转为可编辑路径）
    textToShape() {
      const c = comp(); const L = App.selLayers().find((l) => l.type === 'text'); if (!L) { App.toast('请先选择一个文字图层'); return; } let S;
      App.edit('从文字创建形状', () => {
        const tx = MF.Scene.text(c, L, App.time); S = Model.newLayer(App.project, c, 'shape', { name: uniqueName(c, L.name + ' 轮廓') }); S.tr = MF.clone(L.tr); S.parent = L.parent; S.in = L.in; S.out = L.out; S.is3D = L.is3D;
        for (const ch of tx.chars) { if (!ch.contours.length) continue; const it = Model.newShapeItem(App.project, 'path'); it.name = '“' + ch.ch + '”'; it.p.path.v = MF.Path.fromContours(ch.contours.map((k) => ({ pts: simplify(k.pts, 0.35), closed: true }))); S.items.push(it); }
        const f = Model.newShapeItem(App.project, 'fill', { color: tx.fill }); f.s.rule = 'nonzero'; S.items.push(f); L.visible = false;
        const i = c.layers.indexOf(S); c.layers.splice(i, 1); c.layers.splice(c.layers.indexOf(L), 0, S);
      });
      if (S) App.selectLayers([S.id]);
    },
    // 把路径属性在当前时刻设为某段文字的轮廓（用于字形之间的路径形变）
    pathFromText(prop, meta, str, font, size) {
      const cs = []; let x = 0; const chars = Array.from(str); const widths = chars.map((ch) => MF.Fonts.glyph(font, ch).adv * size); const total = widths.reduce((a, b) => a + b, 0); x = -total / 2;
      chars.forEach((ch, i) => { for (const k of MF.Path.xf(MF.Fonts.outline(font, ch), [size, 0, 0, size, x, size * 0.36])) cs.push({ pts: simplify(k.pts, 0.35), closed: true }); x += widths[i]; });
      App.edit('用文字轮廓设置路径', () => App.setProp(prop, meta, MF.Path.fromContours(cs)));
    },
    // ---------- 关键帧 ----------
    toggleStopwatch(prop, meta) { App.edit(prop.k ? '关闭动画' : '开启动画', () => A.toggleAnimated(prop, App.time, meta)); },
    addKey(prop, meta) { App.edit('添加关键帧', () => { if (!prop.k) prop.k = []; const v = prop.x ? A.value(prop, App.time, meta) : A.value(prop, App.time, meta); A.setValue(prop, App.time, v, meta); }); },
    toggleKey(prop, meta) { const i = A.keyAt(prop, App.time); if (i >= 0) App.edit('删除关键帧', () => { A.removeKey(prop, i); if (!prop.k.length) { delete prop.k; } }); else C.addKey(prop, meta); },
    selectedKeyRefs() { const out = []; for (const k of App.sel.keys) { const r = App.resolve(k.pid); if (r && r.prop.k && r.prop.k[k.i]) out.push({ r, key: r.prop.k[k.i], i: k.i, pid: k.pid }); } return out; },
    deleteKeys() {
      const refs = C.selectedKeyRefs(); if (!refs.length) return false;
      App.edit('删除关键帧', () => { const by = new Map(); for (const x of refs) { if (!by.has(x.r.prop)) by.set(x.r.prop, []); by.get(x.r.prop).push(x.key); } for (const [prop, ks] of by) { const v = prop.k[0].v; prop.k = prop.k.filter((k) => ks.indexOf(k) < 0); if (!prop.k.length) { prop.v = MF.clone(v); delete prop.k; } } });
      App.selectKeys([]); return true;
    },
    ease(mode) {
      let refs = C.selectedKeyRefs();
      if (!refs.length) { // 没选关键帧时：作用于所选属性在当前时刻的关键帧
        for (const pid of App.sel.props) { const r = App.resolve(pid); if (r && r.prop.k) { const i = A.keyAt(r.prop, App.time); if (i >= 0) refs.push({ r, key: r.prop.k[i], i, pid }); } }
      }
      if (!refs.length) { App.toast('请先选择关键帧'); return; }
      const label = { ease: '缓动', easeIn: '缓入', easeOut: '缓出', linear: '线性', hold: '定格' }[mode];
      App.edit('关键帧' + label, () => { for (const x of refs) { const dims = x.r.meta.spatial ? 1 : Model.dims(x.r.meta, x.r.prop); A.setEase(x.key, mode, dims); } });
      App.toast('已设为' + label + '（' + refs.length + ' 个关键帧）');
    },
    spatial(mode) { const refs = C.selectedKeyRefs().filter((x) => x.r.meta.spatial); if (!refs.length) { App.toast('请先选择位置关键帧'); return; } App.edit('空间插值', () => { for (const x of refs) { if (mode === 'linear') { x.key.sl = true; delete x.key.to; delete x.key.ti; } else { delete x.key.sl; delete x.key.to; delete x.key.ti; delete x.key.sc; } } }); },
    copy() {
      const refs = C.selectedKeyRefs();
      if (refs.length) { const t0 = Math.min(...refs.map((x) => x.key.t)); const by = new Map(); for (const x of refs) { if (!by.has(x.pid)) by.set(x.pid, []); by.get(x.pid).push(Object.assign(MF.clone(x.key), { t: x.key.t - t0 })); } C.clipboard = { kind: 'keys', items: Array.from(by.entries()).map(([pid, keys]) => ({ pid, path: pid.slice(pid.indexOf('|') + 1), type: App.resolve(pid).meta.type, keys })) }; App.toast('已复制 ' + refs.length + ' 个关键帧'); return; }
      if (App.sel.nodes.length && MF.NodeView && MF.NodeView.focused) { MF.NodeView.copy(); return; }
      const ls = App.selLayers(); if (ls.length) { C.clipboard = { kind: 'layers', layers: MF.clone(ls), comp: App.compId }; App.toast('已复制 ' + ls.length + ' 个图层'); }
    },
    paste() {
      const cb = C.clipboard; if (!cb) return; const c = comp();
      if (cb.kind === 'nodes' && MF.NodeView) { MF.NodeView.paste(); return; }
      if (cb.kind === 'keys') {
        const sel = [];
        App.edit('粘贴关键帧', () => {
          const targets = App.selLayers();
          for (const it of cb.items) {
            // 目标：同名属性路径（可跨图层粘贴）；节点属性粘回原处
            let dests = []; const lid = it.pid.slice(0, it.pid.indexOf('|'));
            if (!lid) dests.push(it.pid); else if (targets.length) { for (const L of targets) dests.push(App.pid(L.id, it.path)); } else dests.push(it.pid);
            if (App.sel.props.length === 1 && cb.items.length === 1) { const r = App.resolve(App.sel.props[0]); if (r && r.meta.type === it.type) dests = [App.sel.props[0]]; }
            for (const pid of dests) { const r = App.resolve(pid); if (!r || r.meta.type !== it.type) continue; if (!r.prop.k) r.prop.k = []; for (const k of it.keys) { const nk = MF.clone(k); nk.t = App.snapT(App.time + k.t); const ex = A.keyAt(r.prop, nk.t); if (ex >= 0) r.prop.k.splice(ex, 1); r.prop.k.push(nk); } A.sort(r.prop); for (const k of it.keys) { const i = A.keyAt(r.prop, App.snapT(App.time + k.t)); if (i >= 0) sel.push({ pid, i }); } }
          }
        });
        App.selectKeys(sel); return;
      }
      if (cb.kind === 'layers') { const made = []; App.edit('粘贴图层', () => { const map = new Map(); for (const L of cb.layers.slice().reverse()) { const d = MF.clone(L); reId(App.project, d, map); d.name = uniqueName(c, L.name); if (d.type === 'geo') c.nodes.push(MF.Nodes.create(App.project, 'geoLayer', { x: 600, y: nodeSpot(c)[1], s: { layer: d.id }, name: '显示 · ' + d.name })); if (d.type === 'particles') c.nodes.push(MF.Nodes.create(App.project, 'partLayer', { x: 600, y: nodeSpot(c)[1], s: { layer: d.id }, name: '粒子 · ' + d.name })); c.layers.unshift(d); made.push(d.id); } for (const id of made) { const d = Model.getLayer(c, id); if (d.parent) d.parent = map.has(d.parent) ? map.get(d.parent) : (Model.getLayer(c, d.parent) ? d.parent : null); } }); App.selectLayers(made); }
    },
    selectAll() { const c = comp(); if (!c) return; if (MF.NodeView && MF.NodeView.focused) { MF.NodeView.selectAll(); return; } App.selectLayers(c.layers.filter((l) => !l.locked).map((l) => l.id)); },
    // 跳到上一个/下一个可见关键帧
    jumpKey(dir) {
      const c = comp(); if (!c) return; let best = null; const t = App.time; const ls = App.sel.layers.length ? App.selLayers() : c.layers;
      const consider = (k) => { if (dir > 0 ? k.t > t + 1e-4 : k.t < t - 1e-4) { if (best === null || (dir > 0 ? k.t < best : k.t > best)) best = k.t; } };
      for (const L of ls) Model.eachProp(App.project, c, L, (d) => { if (d.prop.k) for (const k of d.prop.k) consider(k); });
      if (best !== null) { App.pause(); App.setTime(best, { exact: true }); } else App.toast(dir > 0 ? '后面没有关键帧了' : '前面没有关键帧了');
    },
    setExpr(prop, src) { App.edit(src ? '编辑表达式' : '移除表达式', () => { if (src === null || src === undefined) { delete prop.x; delete prop.xOn; } else { prop.x = String(src); prop.xOn = true; } }); },
    toggleExpr(prop, meta) { App.edit('表达式', () => { if (prop.x === undefined) { prop.x = defaultExpr(meta); prop.xOn = true; } else prop.xOn = prop.xOn === false; }); },
    setWorkArea(which) { const c = comp(); App.edit('设置工作区', () => { if (which === 'in') c.workIn = Math.min(App.time, c.workOut - 1 / c.fps); else c.workOut = Math.max(App.time + 1 / c.fps, c.workIn + 1 / c.fps); }); },
    // U：展开所有带关键帧/表达式的属性
    revealAnimated() { const c = comp(); const ls = App.sel.layers.length ? App.selLayers() : c.layers; const ex = App.ui.expanded; let any = false; for (const L of ls) { const walk = (nodes, path) => { let has = false; for (const n of nodes) { if (n.kind === 'prop') { if (n.prop.k || n.prop.x) has = true; } else { const h = walk(n.children, n.id); if (h) { ex[L.id + '|' + n.id] = true; has = true; } } } return has; }; if (walk(Model.propTree(App.project, c, L))) { ex[L.id] = true; any = true; } } App.ui.onlyAnimated = any; App.emit('project', { structure: true }); },
    soloProp(key) { const map = { p: 'tr.position', s: 'tr.scale', r: 'tr.rotation', t: 'tr.opacity', a: 'tr.anchor' }; const ls = App.sel.layers.length ? App.selLayers() : []; if (!ls.length) return; for (const L of ls) { App.ui.expanded[L.id] = true; App.ui.expanded[L.id + '|tr'] = true; } App.ui.onlyAnimated = false; App.ui.soloPath = map[key]; App.emit('project', { structure: true }); },
  });
  function defaultExpr(meta) { return meta.type === 'num' ? 'value' : 'value'; }
  function uniqueCompName(P, base) { let i = 1; while (P.comps.some((c) => c.name === base + ' ' + i)) i++; return base + ' ' + i; }
  function fixRefs(c, map) { for (const L of c.layers) if (L.parent && map.has(L.parent)) L.parent = map.get(L.parent); MF.Nodes.eachNode(c.nodes, (n) => { for (const k of ['layer', 'follow']) if (n.s && map.has(n.s[k])) n.s[k] = map.get(n.s[k]); for (const key of Object.keys(n.in)) { const l = n.in[key]; const f = (x) => ({ n: map.has(x.n) ? map.get(x.n) : x.n, p: x.p.startsWith('g:') && map.has(x.p.slice(2)) ? 'g:' + map.get(x.p.slice(2)) : x.p }); let nk = key; if (key.startsWith('g:') && map.has(key.slice(2))) { nk = 'g:' + map.get(key.slice(2)); delete n.in[key]; } n.in[nk] = Array.isArray(l) ? l.map(f) : f(l); } }); }
  // 折线简化（Douglas–Peucker）
  function simplify(pts, eps) {
    const n = pts.length >> 1; if (n < 8) return pts.slice(); const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const st = [[0, n - 1]];
    while (st.length) { const [a, b] = st.pop(); let mx = 0, mi = -1; const ax = pts[a * 2], ay = pts[a * 2 + 1], bx = pts[b * 2], by = pts[b * 2 + 1], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1e-9; for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i * 2] - ax) * dy - (pts[i * 2 + 1] - ay) * dx) / l; if (d > mx) { mx = d; mi = i; } } if (mx > eps && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
    const o = []; for (let i = 0; i < n; i++) if (keep[i]) o.push(pts[i * 2], pts[i * 2 + 1]); return o;
  }
  C.simplify = simplify; C.reId = reId; C.uniqueName = uniqueName;
})();
