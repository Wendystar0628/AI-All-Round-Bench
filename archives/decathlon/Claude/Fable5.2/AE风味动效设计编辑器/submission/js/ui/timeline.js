// 时间轴：图层列表（开关/模式/遮罩/父级）+ 属性行 + 时间区（工作区、图层条、关键帧、播放头）
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const App = MF.App, h = MF.h, W = MF.W, C = MF.Cmd, A = MF.Anim, Model = MF.Model, PR = MF.PropRow;
  const ROW = 22, RULER = 24, PADL = 10, PADR = 16;

  const TL = (MF.Timeline = {
    rows: [], hits: [], bars: [], scrollY: 0, zoom: 1, scrollT: 0, snap: true, marquee: null, refs: [],
    init(panel) {
      TL.panel = panel; const head = panel._head; const body = panel._body;
      TL.tc = h('span', { class: 'tcbox', title: '当前时间（单击输入秒数或帧号 f）' }); TL.tc.addEventListener('click', () => { const c = App.comp(); if (!c) return; W.modal('跳转到时间', [{ key: 't', label: '时间（秒，或如 120f）', type: 'text', value: App.time.toFixed(3) }], (v) => { const s = String(v.t).trim(); const t = /f$/i.test(s) ? parseFloat(s) / c.fps : parseFloat(s); if (isFinite(t)) { App.pause(); App.setTime(t); } }); });
      const tb = (ic, tip, fn, on) => { const b = h('button', { class: 'tbtn sm' + (on ? ' on' : ''), onclick: () => fn(b) }, W.icon(ic)); W.tip(b, tip); return b; };
      TL.snapBtn = tb('snap', '吸附：拖动关键帧/图层时吸附到播放头、其他关键帧与出入点', (b) => { TL.snap = !TL.snap; b.classList.toggle('on', TL.snap); }, true);
      TL.animBtn = tb('graph', '只显示有动画的属性 (U)', () => { if (App.ui.onlyAnimated) { App.ui.onlyAnimated = false; TL.rebuild(); } else C.revealAnimated(); });
      const zin = tb('plus', '放大时间轴 (=)', () => TL.setZoom(TL.zoom * 1.4)), zout = h('button', { class: 'tbtn sm', onclick: () => TL.setZoom(TL.zoom / 1.4) }, '−'); W.tip(zout, '缩小时间轴 (-)');
      const fit = tb('fit', '时间轴适合全长', () => { TL.zoom = 1; TL.scrollT = 0; TL.draw(); });
      const addBtn = tb('plus', '新建图层', (b) => { const r = b.getBoundingClientRect(); W.menu(r.left, r.top - 4 - 300, MF.Shell.menus()['图层']().slice(1, 13)); });
      head.append(TL.tc, h('span', { class: 'sp' }), TL.hintEl = h('span', { class: 'hint' }), h('div', { class: 'tl-tools' }, addBtn, TL.animBtn, TL.snapBtn, zout, zin, fit));
      TL.headEl = h('div', { class: 'tl-head' }); TL.left = h('div', { class: 'tl-left' }); TL.rowsEl = h('div', { class: 'tl-rows' }); TL.left.appendChild(TL.rowsEl);
      const split = h('div', { class: 'tl-split' }); TL.right = h('div', { class: 'tl-right' }); TL.cv = h('canvas'); TL.right.appendChild(TL.cv); TL.ctx = TL.cv.getContext('2d');
      body.append(TL.headEl, TL.left, split, TL.right);
      split.addEventListener('pointerdown', (e) => { e.preventDefault(); const w0 = TL.left.getBoundingClientRect().width, x0 = e.clientX; W.drag(e, (ev) => { body.style.setProperty('--tlw', MF.clamp(w0 + ev.clientX - x0, 200, body.clientWidth - 120) + 'px'); TL.resize(); }); });
      TL.headEl.append(h('span', { style: { width: '94px', flex: 'none' } }), h('span', { style: { flex: '1' } }, '图层名称'), h('span', { style: { width: '57px', flex: 'none' } }, '模式'), h('span', { style: { width: '51px', flex: 'none' } }, '遮罩'), h('span', { style: { width: '69px', flex: 'none' } }, '父级'), h('span', { style: { width: '38px', flex: 'none' } }, '开关'));
      new ResizeObserver(() => TL.resize()).observe(TL.right);
      TL.left.addEventListener('wheel', (e) => { e.preventDefault(); TL.scroll(e.deltaY); }, { passive: false });
      TL.cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = TL.cv.getBoundingClientRect(); if (e.altKey || e.ctrlKey) TL.setZoom(TL.zoom * Math.exp(-e.deltaY * 0.002), e.clientX - r.left); else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { TL.scrollT += ((e.deltaX || e.deltaY) / TL.pps()); TL.clampScroll(); TL.draw(); } else TL.scroll(e.deltaY); }, { passive: false });
      TL.cv.addEventListener('pointerdown', (e) => TL.down(e)); TL.cv.addEventListener('pointermove', (e) => TL.hoverMove(e)); TL.cv.addEventListener('contextmenu', (e) => { e.preventDefault(); TL.context(e); }); TL.cv.addEventListener('dblclick', (e) => TL.dbl(e));
      TL.left.addEventListener('pointerdown', (e) => { if (e.target === TL.left || e.target === TL.rowsEl) { App.selectLayers([]); } });
      App.on('project', (o) => { if (o && o.live) { TL.refresh(); TL.draw(); } else TL.rebuild(); }); App.on('selection', (o) => { TL.markSel(); TL.draw(); void o; }); App.on('time', () => { TL.refresh(); TL.draw(); TL.follow(); }); App.on('layout', () => TL.resize()); App.on('play', () => TL.draw());
      App.on('audio', () => TL.draw());
      TL.rebuild();
    },
    resize() { const r = TL.right.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; TL.w = Math.max(20, r.width); TL.h = Math.max(20, r.height); TL.cv.width = Math.round(TL.w * dpr); TL.cv.height = Math.round(TL.h * dpr); TL.dpr = dpr; TL.draw(); },
    dur() { const c = App.comp(); return c ? c.duration : 10; },
    pps() { return ((TL.w - PADL - PADR) / TL.dur()) * TL.zoom; },
    t2x(t) { return PADL + (t - TL.scrollT) * TL.pps(); },
    x2t(x) { return (x - PADL) / TL.pps() + TL.scrollT; },
    clampScroll() { const vis = (TL.w - PADL - PADR) / TL.pps(); TL.scrollT = MF.clamp(TL.scrollT, 0, Math.max(0, TL.dur() - vis)); },
    setZoom(z, mx) { const t = TL.x2t(mx === undefined ? TL.t2x(App.time) : mx); TL.zoom = MF.clamp(z, 1, 400); const nx = mx === undefined ? TL.t2x(App.time) : mx; TL.scrollT = t - (nx - PADL) / TL.pps(); TL.clampScroll(); TL.draw(); },
    scroll(dy) { const max = Math.max(0, TL.rows.length * ROW - (TL.h - RULER) + 30); TL.scrollY = MF.clamp(TL.scrollY + dy, 0, max); TL.rowsEl.style.transform = 'translateY(' + -TL.scrollY + 'px)'; TL.draw(); },
    follow() { if (!App.playing || TL.zoom <= 1.001) return; const x = TL.t2x(App.time); if (x > TL.w - PADR - 10 || x < PADL) { TL.scrollT = App.time - 20 / TL.pps(); TL.clampScroll(); TL.draw(); } },
    // ---------- 行模型 ----------
    buildRows() {
      const c = App.comp(); const rows = []; if (!c) return rows; const ex = App.ui.expanded;
      const anim = (n) => (n.kind === 'prop' ? !!(n.prop.k || n.prop.x !== undefined) : n.children.some(anim));
      for (const L of c.layers) {
        rows.push({ kind: 'layer', L });
        if (!ex[L.id]) continue;
        const tree = Model.propTree(App.project, c, L);
        const walk = (nodes, depth) => { for (const n of nodes) {
          if (App.ui.soloPath) { if (n.kind === 'prop') { if (n.id === App.ui.soloPath) rows.push({ kind: 'prop', L, desc: n, depth: 1, pid: App.pid(L.id, n.id) }); } else walk(n.children, depth + 1); continue; }
          if (App.ui.onlyAnimated && !anim(n)) continue;
          if (n.kind === 'prop') { if (n.disabled) continue; const isNode = n.id.startsWith('node.') || n.id.startsWith('pin.'); rows.push({ kind: 'prop', L, desc: n, depth, pid: App.pid(isNode ? '' : L.id, n.id) }); continue; }
          if (!n.children.length && !n.addable) continue;
          const key = L.id + '|' + n.id; rows.push({ kind: 'group', L, node: n, depth, key });
          if (ex[key] || App.ui.onlyAnimated) walk(n.children, depth + 1);
        } };
        walk(tree, 1);
      }
      return rows;
    },
    rebuild() {
      const act = document.activeElement; if (act && TL.rowsEl.contains(act) && act.tagName === 'INPUT' && !act.readOnly) return;
      TL.rows = TL.buildRows(); TL.refs = []; const el = TL.rowsEl; el.innerHTML = ''; const c = App.comp();
      TL.animBtn.classList.toggle('on', !!App.ui.onlyAnimated);
      if (!c) { el.appendChild(h('div', { class: 'empty', style: { position: 'relative', height: '120px', pointerEvents: 'auto' } }, h('b', null, '没有打开的合成'), '在项目面板新建或打开一个合成')); TL.draw(); return; }
      if (!c.layers.length) el.appendChild(h('div', { class: 'empty', style: { position: 'relative', height: '130px' } }, h('b', null, '空合成'), '从“图层”菜单新建图层，', '或用工具栏在画布上绘制'));
      TL.rows.forEach((r, i) => { r.y = i * ROW; const row = r.kind === 'layer' ? TL.layerRow(c, r, i) : r.kind === 'group' ? TL.groupRow(c, r) : TL.propRowEl(c, r); row.style.top = r.y + 'px'; r.el = row; el.appendChild(row); });
      el.style.height = TL.rows.length * ROW + 'px'; TL.scroll(0); TL.markSel(); TL.draw();
    },
    refresh() { for (const r of TL.refs) r(); const c = App.comp(); if (TL.tc) TL.tc.innerHTML = c ? MF.Shell.tc(App.time, c.fps) + '<small>' + Math.round(App.time * c.fps) + 'f</small>' : '--:--:--'; },
    markSel() { for (const r of TL.rows) { if (!r.el) continue; if (r.kind === 'layer') r.el.classList.toggle('sel', App.sel.layers.includes(r.L.id)); else if (r.kind === 'prop') r.el.classList.toggle('sel', App.sel.props.includes(r.pid)); } },
    twirl(key, e) { const ex = App.ui.expanded; ex[key] = !ex[key]; if (e && e.altKey && ex[key]) { /* Alt：展开全部子组 */ const c = App.comp(); const L = c.layers.find((l) => l.id === key); if (L) for (const n of Model.propTree(App.project, c, L)) ex[L.id + '|' + n.id] = true; } App.ui.onlyAnimated = false; App.ui.soloPath = null; TL.rebuild(); },
    layerRow(c, r, i) {
      const L = r.L; const idx = c.layers.indexOf(L) + 1; const ex = App.ui.expanded[L.id];
      const ic = (name, on, tip, fn, cls) => { const b = h('span', { class: 'cell ic' + (on ? ' on ' + (cls || '') : ''), title: tip }, on || cls === 'show' ? W.icon(name) : h('span', { style: { width: '5px', height: '5px', borderRadius: '50%', background: '#3a3531' } })); b.addEventListener('pointerdown', (e) => e.stopPropagation()); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b; };
      const nm = h('span', { class: 'nm', title: L.name + '（' + MF.Schema.layerTypes[L.type] + '）— 双击重命名' }, L.name);
      const typeIcon = { shape: 'shape', text: 'text', null: 'nul', adjust: 'adjust', precomp: 'precomp', camera: 'camera', light: 'light', geo: 'geo', particles: 'particles', audio: 'audio' }[L.type];
      const row = h('div', { class: 'lr layer' + (L.visible ? '' : ' off') },
        ic('eye', L.visible, '显示/隐藏', () => App.edit('显示/隐藏', () => { L.visible = !L.visible; })), ic('lock', L.locked, '锁定', () => App.edit('锁定', () => { L.locked = !L.locked; }), 'acc'),
        h('span', { class: 'lab', style: { background: MF.Schema.labels[L.label % MF.Schema.labels.length] }, title: '标签颜色（单击切换）', onclick: (e) => { e.stopPropagation(); App.edit('标签颜色', () => { L.label = (L.label + 1) % MF.Schema.labels.length; }); } }), h('span', { class: 'idx' }, idx),
        h('span', { class: 'tw', onpointerdown: (e) => e.stopPropagation(), onclick: (e) => { e.stopPropagation(); TL.twirl(L.id, e); } }, ex ? '▼' : '▶'), h('span', { class: 'ty' }, W.icon(typeIcon)), nm);
      const noMode = ['camera', 'light', 'audio', 'null', 'adjust'].includes(L.type) || MF.Scene.is3DLayer(L);
      if (!noMode) { row.appendChild(W.select(MF.Schema.blends, L.blend, (v) => App.edit('混合模式', () => { L.blend = v; }), 'md')); row.appendChild(W.select(MF.Schema.mattes.map(([v, l]) => [v, l.replace(' 遮罩', '').replace('遮罩', '')]), L.matte || 'none', (v) => App.edit('轨道遮罩', () => { L.matte = v; }), 'mt')); }
      else row.appendChild(h('span', { style: { width: '108px', flex: 'none' } }));
      if (L.type !== 'audio') row.appendChild(W.select([[null, '无']].concat(c.layers.filter((l) => l.id !== L.id && l.type !== 'audio').map((l) => [l.id, l.name])), L.parent, (v) => C.setParent(L, v), 'pa')); else row.appendChild(h('span', { style: { width: '69px', flex: 'none' } }));
      if (L.type !== 'audio' && L.type !== 'camera' && L.type !== 'light') row.appendChild(ic('mb', L.mb, '运动模糊', () => App.edit('运动模糊', () => { L.mb = !L.mb; }), 'acc')); else row.appendChild(h('span', { class: 'cell ic' }));
      if (['shape', 'text', 'precomp', 'null'].includes(L.type)) row.appendChild(ic('cube', L.is3D, '三维图层', () => App.edit('三维图层', () => { L.is3D = !L.is3D; }), 'acc')); else row.appendChild(h('span', { class: 'cell ic' + (MF.Scene.is3DLayer(L) || L.type === 'camera' || L.type === 'light' ? ' on acc' : ''), title: '三维' }, MF.Scene.is3DLayer(L) || L.type === 'camera' || L.type === 'light' ? W.icon('cube') : null));
      nm.addEventListener('dblclick', (e) => { e.stopPropagation(); TL.rename(L, nm); });
      row.addEventListener('pointerdown', (e) => { if (e.target.closest('select,input')) return; if (e.button === 2) { if (!App.sel.layers.includes(L.id)) App.selectLayers([L.id]); return; } if (e.shiftKey) App.toggleLayer(L.id, false, true); else if (e.ctrlKey || e.metaKey) App.toggleLayer(L.id, true); else if (!App.sel.layers.includes(L.id) || App.sel.layers.length > 1) App.selectLayers([L.id]); else App.selectLayers([L.id], { keepKeys: false }); TL.dragReorder(e, L); });
      row.addEventListener('contextmenu', (e) => { e.preventDefault(); W.menu(e.clientX, e.clientY, [{ label: '重命名', key: 'Enter', run: () => TL.rename(L, nm) }, { label: '重复', key: 'Ctrl+D', run: () => C.duplicateLayers() }, { label: '删除', key: 'Delete', run: () => C.deleteLayers() }, '-', { label: '预合成…', key: 'Ctrl+Shift+C', run: () => MF.Shell.precomposeDialog() }, L.type === 'precomp' ? { label: '打开源合成', run: () => App.openComp(L.src.comp) } : null, L.type === 'precomp' ? { label: '启用/停用时间重映射', run: () => C.enableRemap(L) } : null, '-', { label: '添加效果', run: () => { W.menu(e.clientX, e.clientY, Object.keys(MF.Schema.effects).map((k) => ({ label: MF.Schema.effects[k].label, run: () => C.addEffect(k) }))); } }, { label: '显示有动画的属性', key: 'U', run: () => C.revealAnimated() }]); });
      void i; return row;
    },
    rename(L, nm) { const inp = h('input', { type: 'text', value: L.name }); nm.innerHTML = ''; nm.appendChild(inp); inp.focus(); inp.select(); const done = (ok) => { if (!inp.parentNode) return; const v = inp.value.trim(); inp.remove(); nm.textContent = L.name; if (ok && v && v !== L.name) App.edit('重命名图层', () => { L.name = v; }); }; inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); }); inp.addEventListener('blur', () => done(true)); inp.addEventListener('pointerdown', (e) => e.stopPropagation()); },
    dragReorder(e, L) {
      const y0 = e.clientY; let active = false, line = null, target = -1; const c = App.comp();
      W.drag(e, (ev) => { if (!active && Math.abs(ev.clientY - y0) < 6) return; if (!active) { active = true; line = h('div', { style: { position: 'absolute', left: '0', right: '0', height: '2px', background: '#ff6a2b', zIndex: 5, pointerEvents: 'none' } }); TL.rowsEl.appendChild(line); }
        const r = TL.left.getBoundingClientRect(); const y = ev.clientY - r.top + TL.scrollY; const lrows = TL.rows.filter((x) => x.kind === 'layer'); target = lrows.length; let ly = TL.rows.length * ROW; for (let i = 0; i < lrows.length; i++) { if (y < lrows[i].y + ROW / 2) { target = i; ly = lrows[i].y; break; } } line.style.top = ly - 1 + 'px'; },
      () => { if (line) line.remove(); if (active && target >= 0) { const cur = c.layers.indexOf(L); if (target !== cur && target !== cur + 1) C.reorderLayer(L.id, target); } });
    },
    groupRow(c, r) {
      const n = r.node, L = r.L; const open = App.ui.expanded[r.key] || App.ui.onlyAnimated;
      const row = h('div', { class: 'lr group' }, h('span', { style: { width: 8 + r.depth * 12 + 'px', flex: 'none' } }), h('span', { class: 'tw', onclick: () => TL.twirl(r.key) }, open ? '▼' : '▶'), h('span', { class: 'nm', onclick: () => TL.twirl(r.key) }, n.label + (n.children.length && !n.objKind ? '' : '')));
      if (n.obj && n.obj.on === false) row.querySelector('.nm').style.textDecoration = 'line-through';
      const addMenu = { effect: () => Object.keys(MF.Schema.effects).map((k) => ({ label: MF.Schema.effects[k].label, run: () => C.addEffect(k) })), shapeItem: () => Object.keys(MF.Schema.shape).map((k) => ({ label: MF.Schema.shape[k].label, run: () => C.addShapeItem(L, k, k === 'path' ? { path: MF.Path.star(5, 120, 50, 0, 0, 0) } : null) })), animator: () => [{ label: '文字动画器', run: () => C.addAnimator(L) }], emitter: () => [{ label: '发射器', run: () => C.addEmitter(L) }], force: () => [{ label: '吸引/排斥力', run: () => C.addForce(L) }], mask: () => [{ label: '椭圆蒙版', run: () => { const b = MF.Scene.contentBounds(c, L, App.time); C.addMask(L, MF.Path.ellipse((b[2] - b[0]) * 0.8, (b[3] - b[1]) * 0.8, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2)); } }, { label: '矩形蒙版', run: () => { const b = MF.Scene.contentBounds(c, L, App.time); C.addMask(L, MF.Path.rect((b[2] - b[0]) * 0.8, (b[3] - b[1]) * 0.8, 0, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2)); } }] }[n.addable];
      if (addMenu) row.appendChild(h('span', { class: 'addb', title: '添加', onclick: (e) => { const rr = e.target.getBoundingClientRect(); W.menu(rr.left, rr.bottom + 2, addMenu()); } }, '添加 ▸'));
      if (n.obj && ['effect', 'mask', 'shapeItem', 'animator', 'emitter', 'force'].includes(n.objKind)) { row.appendChild(h('span', { class: 'addb', title: '上移', onclick: () => C.moveObj(L, n.objKind, n.obj.id, -1) }, '↑')); row.appendChild(h('span', { class: 'addb', title: '下移', onclick: () => C.moveObj(L, n.objKind, n.obj.id, 1) }, '↓')); row.appendChild(h('span', { class: 'addb', title: '删除', onclick: () => C.removeObj(L, n.objKind, n.obj.id) }, '×')); }
      if (n.objKind === 'node') row.appendChild(h('span', { class: 'addb', title: '在节点视图中选中', onclick: () => { App.selectNodes([n.obj.id]); if (MF.NodeView) MF.NodeView.reveal(n.obj.id); } }, '节点 ▸'));
      return row;
    },
    propRowEl(c, r) {
      const d = r.desc, L = r.L; const isNode = r.pid.startsWith('|'); const ve = PR.valueEls(d, isNode ? null : L, { compact: true }); const kn = PR.keyNav(d);
      const err = d.prop.x !== undefined && d.prop.xOn !== false ? MF.Eval.errorOf(d.prop) : null;
      const nm = h('span', { class: 'nm', title: d.label + (err ? '\n表达式错误：' + err : '') }, d.label);
      const row = h('div', { class: 'lr prop' }, h('span', { style: { width: 8 + r.depth * 12 + 'px', flex: 'none' } }), PR.stopwatch(d, L), h('span', { style: { width: '4px', flex: 'none' } }), err ? h('span', { class: 'errdot', title: err }) : null, nm, h('div', { class: 'vals' }, ve.els), kn, PR.exprBtn(d));
      row.addEventListener('pointerdown', (e) => { if (e.target.closest('input,.sw,.knav,.exb,.swatch,.chip')) return; App.selectProps([r.pid], e.shiftKey || e.ctrlKey); if (d.prop.k && !e.shiftKey && !e.ctrlKey) App.selectKeys(d.prop.k.map((k, i) => ({ pid: r.pid, i }))); });
      TL.refs.push(() => { ve.refresh(); if (kn._refresh) kn._refresh(); });
      return row;
    },
    // ---------- 绘制 ----------
    draw() {
      const ctx = TL.ctx; if (!ctx || !TL.w) return; const dpr = TL.dpr || 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, TL.w, TL.h);
      const c = App.comp(); TL.hits = []; TL.bars = [];
      ctx.fillStyle = '#141312'; ctx.fillRect(0, 0, TL.w, TL.h);
      if (!c) return; const pps = TL.pps(), fps = c.fps;
      // 行背景
      const y0 = RULER - TL.scrollY;
      for (const r of TL.rows) { const y = y0 + r.y; if (y + ROW < RULER || y > TL.h) continue; ctx.fillStyle = r.kind === 'layer' ? (App.sel.layers.includes(r.L.id) ? '#2a1c14' : '#1b1917') : App.sel.props.includes(r.pid) ? '#241a14' : '#161514'; ctx.fillRect(0, y, TL.w, ROW - 1); }
      // 网格 + 工作区
      const xin = TL.t2x(c.workIn), xout = TL.t2x(c.workOut);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, RULER, Math.max(0, xin), TL.h); ctx.fillRect(xout, RULER, TL.w, TL.h);
      const steps = [1 / fps, 2 / fps, 5 / fps, 10 / fps, 0.5, 1, 2, 5, 10, 15, 30, 60, 120]; let step = steps[steps.length - 1]; for (const s of steps) if (s * pps >= 64) { step = s; break; }
      const sub = step >= 1 ? step / (step === 1 ? fps >= 20 ? 4 : 2 : 5) : step / (Math.round(step * fps) >= 5 ? 5 : 1);
      ctx.font = '10px ' + getComputedStyle(document.body).getPropertyValue('--mono'); ctx.textBaseline = 'middle';
      const tA = Math.max(0, Math.floor(TL.x2t(0) / sub) * sub), tB = Math.min(c.duration, TL.x2t(TL.w));
      for (let t = tA; t <= tB + 1e-6; t += sub) { const x = Math.round(TL.t2x(t)) + 0.5; const major = Math.abs(t / step - Math.round(t / step)) < 1e-4; ctx.strokeStyle = major ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.025)'; ctx.beginPath(); ctx.moveTo(x, RULER); ctx.lineTo(x, TL.h); ctx.stroke(); }
      // 图层条与关键帧
      for (const r of TL.rows) {
        const y = y0 + r.y; if (y + ROW < RULER || y > TL.h) continue;
        if (r.kind === 'layer') {
          const L = r.L; const xa = TL.t2x(L.in), xb = TL.t2x(L.out); const col = MF.Schema.labels[L.label % MF.Schema.labels.length]; const selL = App.sel.layers.includes(L.id);
          ctx.globalAlpha = L.visible ? (selL ? 0.95 : 0.6) : 0.25; ctx.fillStyle = col; rr(ctx, xa, y + 3, Math.max(2, xb - xa), ROW - 7, 3); ctx.fill(); ctx.globalAlpha = 1;
          if (selL) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; rr(ctx, xa + 0.5, y + 3.5, Math.max(2, xb - xa) - 1, ROW - 8, 3); ctx.stroke(); }
          TL.bars.push({ L, xa, xb, y });
          if (L.type === 'audio') TL.drawAudio(ctx, c, L, y);
          if (L.type === 'precomp' && L.src.remapOn) { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillText('时间重映射', xa + 6, y + ROW / 2); }
          // 折叠时显示关键帧摘要
          if (!App.ui.expanded[L.id]) { const ts = new Set(); Model.eachProp(App.project, c, L, (d) => { if (d.prop.k && !(d.id.startsWith('node.') || d.id.startsWith('pin.'))) for (const k of d.prop.k) ts.add(Math.round(k.t * 1000)); }); ctx.fillStyle = 'rgba(20,12,6,.85)'; for (const tt of ts) { const x = TL.t2x(tt / 1000); ctx.beginPath(); ctx.arc(x, y + ROW / 2 - 0.5, 2, 0, 6.2832); ctx.fill(); } }
        } else if (r.kind === 'prop') {
          const prop = r.desc.prop; if (!prop.k) { if (prop.x !== undefined && prop.xOn !== false) { ctx.fillStyle = 'rgba(255,143,143,.5)'; ctx.fillText('= 表达式', PADL + 4, y + ROW / 2); } continue; }
          const cy = y + ROW / 2 - 0.5; ctx.strokeStyle = 'rgba(240,192,96,.22)'; ctx.lineWidth = 1; if (prop.k.length > 1) { ctx.beginPath(); ctx.moveTo(TL.t2x(prop.k[0].t), cy + 0.5); ctx.lineTo(TL.t2x(prop.k[prop.k.length - 1].t), cy + 0.5); ctx.stroke(); }
          prop.k.forEach((k, i) => { const x = TL.t2x(k.t); if (x < -8 || x > TL.w + 8) return; const sel = App.isKeySel(r.pid, i); TL.keyShape(ctx, x, cy, k, sel); TL.hits.push({ x, y: cy, pid: r.pid, i, row: r }); });
        }
      }
      // 标尺
      ctx.fillStyle = '#1e1c1a'; ctx.fillRect(0, 0, TL.w, RULER); ctx.fillStyle = 'rgba(255,106,43,.16)'; ctx.fillRect(xin, 0, xout - xin, RULER);
      ctx.fillStyle = '#ff6a2b'; ctx.fillRect(xin, 0, xout - xin, 3); ctx.fillRect(xin - 1, 0, 3, 9); ctx.fillRect(xout - 2, 0, 3, 9);
      for (let t = Math.max(0, Math.floor(TL.x2t(0) / step) * step); t <= tB + 1e-6; t += step) { const x = Math.round(TL.t2x(t)) + 0.5; ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.moveTo(x, RULER - 7); ctx.lineTo(x, RULER); ctx.stroke(); ctx.fillStyle = '#a79f94'; const lab = step < 1 ? (Math.floor(t + 1e-6) + ':' + String(Math.round((t - Math.floor(t + 1e-6)) * fps)).padStart(2, '0')) : t.toFixed(0) + 's'; ctx.fillText(lab, x + 3, RULER - 9); }
      ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(0, RULER + 0.5); ctx.lineTo(TL.w, RULER + 0.5); ctx.stroke();
      if (TL.marquee) { const m = TL.marquee; ctx.fillStyle = 'rgba(88,199,224,.12)'; ctx.strokeStyle = '#58c7e0'; ctx.setLineDash([4, 3]); ctx.fillRect(m[0], m[1], m[2] - m[0], m[3] - m[1]); ctx.strokeRect(m[0] + 0.5, m[1] + 0.5, m[2] - m[0], m[3] - m[1]); ctx.setLineDash([]); }
      // 播放头
      const px = Math.round(TL.t2x(App.time)) + 0.5; ctx.strokeStyle = '#ff6a2b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, 4); ctx.lineTo(px, TL.h); ctx.stroke();
      ctx.fillStyle = '#ff6a2b'; ctx.beginPath(); ctx.moveTo(px - 6, 4); ctx.lineTo(px + 6, 4); ctx.lineTo(px + 6, 12); ctx.lineTo(px, 19); ctx.lineTo(px - 6, 12); ctx.closePath(); ctx.fill();
      if (TL.snapLine !== undefined && TL.snapLine !== null) { const sx = Math.round(TL.t2x(TL.snapLine)) + 0.5; ctx.strokeStyle = 'rgba(88,199,224,.8)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(sx, RULER); ctx.lineTo(sx, TL.h); ctx.stroke(); ctx.setLineDash([]); }
    },
    keyShape(ctx, x, y, k, sel) {
      ctx.fillStyle = sel ? '#fff' : '#f0c060'; ctx.strokeStyle = sel ? '#ff6a2b' : '#3a2a08'; ctx.lineWidth = sel ? 1.6 : 1; const s = 4.6;
      ctx.beginPath();
      if (k.ot === 'h') { ctx.rect(x - s + 0.5, y - s + 0.5, s * 2 - 1, s * 2 - 1); }
      else if (k.it === 'b' && k.ot === 'b') { ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x + 1.2, y); ctx.lineTo(x + s, y + s); ctx.lineTo(x - s, y + s); ctx.lineTo(x - 1.2, y); ctx.closePath(); }
      else if (k.it === 'b') { ctx.moveTo(x - s, y - s); ctx.lineTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y + s); ctx.lineTo(x - 1.2, y); ctx.closePath(); }
      else if (k.ot === 'b') { ctx.moveTo(x + s, y - s); ctx.lineTo(x, y - s); ctx.lineTo(x - s, y); ctx.lineTo(x, y + s); ctx.lineTo(x + s, y + s); ctx.lineTo(x + 1.2, y); ctx.closePath(); }
      else { ctx.moveTo(x, y - s - 0.6); ctx.lineTo(x + s + 0.6, y); ctx.lineTo(x, y + s + 0.6); ctx.lineTo(x - s - 0.6, y); ctx.closePath(); }
      ctx.fill(); ctx.stroke();
    },
    drawAudio(ctx, c, L, y) {
      const st = L.start || 0; ctx.fillStyle = 'rgba(15,10,5,.75)';
      const wf = MF.Audio && MF.Audio.waveform ? MF.Audio.waveform(L.id) : null;
      if (wf) { const n = wf.length, dur = c.duration; ctx.beginPath(); const xa = Math.max(0, TL.t2x(L.in)), xb = Math.min(TL.w, TL.t2x(L.out)); for (let x = Math.floor(xa); x <= xb; x++) { const t = TL.x2t(x); const i = Math.floor((t / dur) * n); if (i < 0 || i >= n) continue; const a = Math.min(1, wf[i] * 1.6) * (ROW - 9) / 2; ctx.rect(x, y + ROW / 2 - a - 0.5, 1, a * 2 + 1); } ctx.fill(); }
      else for (const n of L.audio.s.notes) { const x = TL.t2x(st + n[0]); const w = Math.max(2, n[1] * TL.pps()); ctx.fillRect(x, y + 6, Math.min(w, 40), ROW - 13); }
    },
    // ---------- 交互 ----------
    pos(e) { const r = TL.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; },
    hitKey(m) { let best = null, bd = 8; for (const hk of TL.hits) { if (hk.y < RULER) continue; const d = Math.hypot(hk.x - m[0], hk.y - m[1]); if (d < bd) { bd = d; best = hk; } } return best; },
    hitBar(m) { for (const b of TL.bars) if (m[1] >= b.y && m[1] < b.y + ROW && m[1] > RULER && m[0] >= b.xa - 4 && m[0] <= b.xb + 4) return b; return null; },
    hoverMove(e) { if (TL._dragging) return; const m = TL.pos(e); let cur = 'default'; if (m[1] < RULER) { const c = App.comp(); cur = c && m[1] < 10 && (Math.abs(m[0] - TL.t2x(c.workIn)) < 6 || Math.abs(m[0] - TL.t2x(c.workOut)) < 6) ? 'ew-resize' : 'pointer'; } else if (TL.hitKey(m)) cur = 'pointer'; else { const b = TL.hitBar(m); if (b) cur = Math.abs(m[0] - b.xa) < 5 || Math.abs(m[0] - b.xb) < 5 ? 'ew-resize' : 'grab'; } TL.cv.style.cursor = cur; },
    snapTime(t, exclude) {
      const c = App.comp(); const fr = App.snapT(t); TL.snapLine = null; if (!TL.snap) return fr; const tol = 7 / TL.pps(); let best = null, bd = tol;
      const cons = (x) => { const d = Math.abs(x - t); if (d < bd) { bd = d; best = x; } };
      cons(App.time); cons(c.workIn); cons(c.workOut); for (const L of c.layers) { cons(L.in); cons(L.out); }
      for (const hk of TL.hits) { const r = App.resolve(hk.pid); if (!r || !r.prop.k || !r.prop.k[hk.i]) continue; if (exclude && exclude.has(r.prop.k[hk.i])) continue; cons(r.prop.k[hk.i].t); }
      if (best !== null) { TL.snapLine = best; return best; } return fr;
    },
    down(e) {
      const c = App.comp(); if (!c || e.button === 1) return; const m = TL.pos(e); TL.cv.focus && TL.cv.focus(); if (e.button === 2) return;
      const dragWith = (mv, end) => { TL._dragging = true; W.drag(e, (ev) => mv(TL.pos(ev), ev), (ev) => { TL._dragging = false; TL.snapLine = null; if (end) end(TL.pos(ev), ev); TL.draw(); }); };
      if (m[1] < RULER) {
        const xi = TL.t2x(c.workIn), xo = TL.t2x(c.workOut);
        if (m[1] < 10 && Math.abs(m[0] - xi) < 6) { App.beginDrag('调整工作区'); dragWith((p) => { c.workIn = MF.clamp(App.snapT(TL.x2t(p[0])), 0, c.workOut - 1 / c.fps); App.changed(); }, () => App.endDrag()); return; }
        if (m[1] < 10 && Math.abs(m[0] - xo) < 6) { App.beginDrag('调整工作区'); dragWith((p) => { c.workOut = MF.clamp(App.snapT(TL.x2t(p[0])), c.workIn + 1 / c.fps, c.duration); App.changed(); }, () => App.endDrag()); return; }
        App.pause(); const scrub = (p, ev) => { let t = TL.x2t(p[0]); if (ev && ev.shiftKey) { let best = null, bd = 10 / TL.pps(); for (const hk of TL.hits) { const r = App.resolve(hk.pid); const k = r && r.prop.k && r.prop.k[hk.i]; if (k && Math.abs(k.t - t) < bd) { bd = Math.abs(k.t - t); best = k.t; } } if (best !== null) { App.setTime(best, { exact: true }); return; } } App.setTime(t); }; scrub(m, e); dragWith(scrub); return;
      }
      const hk = TL.hitKey(m);
      if (hk) {
        const already = App.isKeySel(hk.pid, hk.i);
        if (e.shiftKey || e.ctrlKey) App.selectKeys([{ pid: hk.pid, i: hk.i }], true); else if (!already) { App.selectKeys([{ pid: hk.pid, i: hk.i }]); App.selectProps([hk.pid]); }
        TL.dragKeys(e, m, hk, dragWith); return;
      }
      const b = TL.hitBar(m);
      if (b && !b.L.locked) {
        const L = b.L; if (!App.sel.layers.includes(L.id)) App.selectLayers(e.shiftKey ? App.sel.layers.concat([L.id]) : [L.id]);
        const edge = Math.abs(m[0] - b.xa) < 5 ? 'in' : Math.abs(m[0] - b.xb) < 5 ? 'out' : 'move'; const t0 = TL.x2t(m[0]); const in0 = L.in, out0 = L.out; let last = 0, started = false;
        dragWith((p) => { if (!started) { if (Math.abs(p[0] - m[0]) < 3) return; started = true; App.beginDrag(edge === 'move' ? '移动图层时间' : '修剪图层'); }
          const t = TL.x2t(p[0]);
          if (edge === 'in') L.in = MF.clamp(TL.snapTime(t), -1e3, L.out - 1 / c.fps); else if (edge === 'out') L.out = MF.clamp(TL.snapTime(t), L.in + 1 / c.fps, 1e4);
          else { let d = TL.snapTime(in0 + (t - t0)) - in0; if (TL.snapLine === null) { const d2 = TL.snapTime(out0 + (t - t0)) - out0; if (TL.snapLine !== null) d = d2; } const step = d - last; if (Math.abs(step) > 1e-9) { for (const S of App.selLayers()) if (!S.locked) C.shiftLayer(S, step); last = d; } }
          App.changed(); }, () => { if (started) App.endDrag(); });
        return;
      }
      // 框选关键帧
      if (!e.shiftKey) App.selectKeys([]);
      TL.marquee = [m[0], m[1], m[0], m[1]];
      dragWith((p) => { TL.marquee[2] = p[0]; TL.marquee[3] = p[1]; TL.draw(); }, () => { const q = TL.marquee; TL.marquee = null; const x0 = Math.min(q[0], q[2]), x1 = Math.max(q[0], q[2]), y0 = Math.min(q[1], q[3]), y1 = Math.max(q[1], q[3]); if (x1 - x0 > 3 || y1 - y0 > 3) { const ks = TL.hits.filter((k) => k.x >= x0 && k.x <= x1 && k.y >= y0 && k.y <= y1).map((k) => ({ pid: k.pid, i: k.i })); App.selectKeys(e.shiftKey ? App.sel.keys.concat(ks.filter((k) => !App.isKeySel(k.pid, k.i))) : ks); } });
    },
    // 拖动所选关键帧：平移；按住 Alt 拖动首/尾关键帧则按比例拉伸
    dragKeys(e, m, hk, dragWith) {
      const refs = C.selectedKeyRefs(); if (!refs.length) return; const grab = refs.find((x) => x.pid === hk.pid && x.i === hk.i) || refs[0];
      const orig = new Map(); for (const x of refs) orig.set(x.key, x.key.t); const keyset = new Set(refs.map((x) => x.key));
      const tmin = Math.min(...orig.values()), tmax = Math.max(...orig.values()); const g0 = orig.get(grab.key); const stretch = e.altKey && refs.length > 1 && tmax > tmin; const pivot = stretch ? (Math.abs(g0 - tmax) < Math.abs(g0 - tmin) ? tmin : tmax) : 0;
      let started = false; const x0 = m[0];
      const resel = () => { const sel = []; for (const x of refs) { const i = x.r.prop.k.indexOf(x.key); if (i >= 0) sel.push({ pid: x.pid, i }); } App.sel.keys = sel; };
      dragWith((p) => { if (!started) { if (Math.abs(p[0] - x0) < 3) return; started = true; App.beginDrag(stretch ? '拉伸关键帧时间' : '移动关键帧'); }
        const gt = Math.max(0, TL.snapTime(g0 + (p[0] - x0) / TL.pps(), keyset));
        if (stretch) { const s = (gt - pivot) / ((g0 - pivot) || 1e-9); for (const x of refs) x.key.t = Math.max(0, pivot + (orig.get(x.key) - pivot) * s); }
        else { const d = Math.max(gt - g0, -tmin); for (const x of refs) x.key.t = orig.get(x.key) + d; }
        for (const x of refs) A.sort(x.r.prop); resel(); App.changed(); },
      () => { if (!started) return; // 合并重合的关键帧（保留被拖动的）
        const props = new Set(refs.map((x) => x.r.prop)); for (const prop of props) { prop.k = prop.k.filter((k) => keyset.has(k) || !prop.k.some((o) => o !== k && keyset.has(o) && Math.abs(o.t - k.t) < 1e-4)); A.sort(prop); }
        resel(); App.endDrag(); App.emit('selection', { keys: true }); });
    },
    dbl(e) { const m = TL.pos(e); const b = TL.hitBar(m); if (b && b.L.type === 'precomp' && !TL.hitKey(m)) App.openComp(b.L.src.comp); },
    context(e) {
      const m = TL.pos(e); const hk = TL.hitKey(m);
      if (hk) { if (!App.isKeySel(hk.pid, hk.i)) App.selectKeys([{ pid: hk.pid, i: hk.i }]); const r = App.resolve(hk.pid);
        W.menu(e.clientX, e.clientY, [{ hd: '关键帧插值' }, { label: '线性', run: () => C.ease('linear') }, { label: '缓动', key: 'F9', run: () => C.ease('ease') }, { label: '缓入', key: 'Shift+F9', run: () => C.ease('easeIn') }, { label: '缓出', key: 'Ctrl+Shift+F9', run: () => C.ease('easeOut') }, { label: '定格', key: 'Ctrl+Alt+H', run: () => C.ease('hold') }, r && r.meta.spatial ? '-' : null, r && r.meta.spatial ? { label: '空间插值：直线', run: () => C.spatial('linear') } : null, r && r.meta.spatial ? { label: '空间插值：自动贝塞尔', run: () => C.spatial('auto') } : null, '-', { label: '复制', key: 'Ctrl+C', run: () => C.copy() }, { label: '删除', key: 'Delete', run: () => C.deleteKeys() }]); return; }
      W.menu(e.clientX, e.clientY, [{ label: '粘贴关键帧到当前时间', key: 'Ctrl+V', dis: !(C.clipboard && C.clipboard.kind === 'keys'), run: () => C.paste() }, { label: '工作区起点设为当前时间', key: 'B', run: () => C.setWorkArea('in') }, { label: '工作区终点设为当前时间', key: 'N', run: () => C.setWorkArea('out') }, '-', { label: '时间轴适合全长', run: () => { TL.zoom = 1; TL.scrollT = 0; TL.draw(); } }]);
    },
  });
  function rr(ctx, x, y, w, hh, r) { r = Math.min(r, w / 2, hh / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + hh - r); ctx.arcTo(x + w, y + hh, x + w - r, y + hh, r); ctx.lineTo(x + r, y + hh); ctx.arcTo(x, y + hh, x, y + hh - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath(); }
})();
