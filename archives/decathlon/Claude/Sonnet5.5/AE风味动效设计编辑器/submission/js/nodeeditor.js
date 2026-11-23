/* nodeeditor.js — 可视化节点编辑：创建/连接/断开/分支/复制/封装，端口类型着色，结果检视 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, Model = AE.Model, App = AE.App, UI = AE.UI, Nodes = AE.Nodes;
  const h = UI.h; const NE = AE.NodeEditor = { focused: false };
  let host, wrap, world, svg, insp, nodeEls = new Map(), view = { x: 20, y: 20, s: 1 }, drag = null, linkDrag = null, tempPath, pending = false;
  const ND = () => AE.NodeDefs;

  NE.init = (el) => {
    host = el; host.innerHTML = '';
    const bar = h('div', { class: 'ne-bar' },
      h('button', { class: 'btn sm', text: '+ 添加节点 ▾', onclick: e => { const r = e.target.getBoundingClientRect(); addMenu(r.left, r.bottom, null); } }),
      h('button', { class: 'btn sm', text: '复制', title: 'Ctrl+D', onclick: () => duplicate() }), h('button', { class: 'btn sm', text: '封装为组', onclick: () => group() }), h('button', { class: 'btn sm', text: '展开组', onclick: () => ungroup() }), h('button', { class: 'btn sm danger', text: '删除', onclick: () => NE.deleteSelected() }),
      h('button', { class: 'btn sm', text: '适合', onclick: () => fit() }), h('div', { style: { flex: 1 } }), h('span', { class: 'muted', style: { fontSize: '11px' }, text: '拖动输出端口连线；右键节点/连线更多操作' }));
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'ne-svg'); world = h('div', { class: 'ne-world' }, svg);
    insp = h('div', { class: 'ne-insp hidden' });
    wrap = h('div', { class: 'ne-wrap', tabindex: 0 }, world, insp); host.append(bar, wrap);
    wrap.addEventListener('pointerdown', onBgDown); wrap.addEventListener('pointermove', onMove); wrap.addEventListener('pointerup', onUp);
    wrap.addEventListener('wheel', e => { e.preventDefault(); const r = wrap.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; const f = e.deltaY > 0 ? 1 / 1.12 : 1.12; const ns = U.clamp(view.s * f, 0.3, 2); view.x = mx - (mx - view.x) * ns / view.s; view.y = my - (my - view.y) * ns / view.s; view.s = ns; applyView(); updateLinks(); }, { passive: false });
    wrap.addEventListener('focus', () => NE.focused = true); wrap.addEventListener('blur', () => NE.focused = false); wrap.addEventListener('pointerdown', () => { NE.focused = true; wrap.focus(); });
    wrap.addEventListener('contextmenu', e => { e.preventDefault(); const r = wrap.getBoundingClientRect(); addMenu(e.clientX, e.clientY, [(e.clientX - r.left - view.x) / view.s, (e.clientY - r.top - view.y) / view.s]); });
    wrap.addEventListener('keydown', e => { if (e.key === 'Delete' || e.key === 'Backspace') { if (e.target.tagName === 'INPUT') return; NE.deleteSelected(); e.preventDefault(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { duplicate(); e.preventDefault(); e.stopPropagation(); } });
    const defer = () => { if (host.offsetParent === null) return; if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; NE.refresh(); }); };
    App.on('struct', defer); App.on('comp', defer); App.on('change', k => { if (k !== 'struct' && host.offsetParent !== null) refreshLive(); }); App.on('time', () => { if (host.offsetParent !== null) refreshLive(); });
    applyView();
  };
  const applyView = () => { world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.s})`; };
  const graph = () => App.project.graph;
  const evalNow = (node) => { try { return Nodes.evalOut(App.ev, App.comp, App.time, node.id); } catch (e) { return { out: null, info: '错误：' + e.message }; } };

  NE.refresh = () => {
    if (!world) return; nodeEls.clear(); [...world.querySelectorAll('.node')].forEach(n => n.remove()); svg.innerHTML = '';
    const nodes = graph().nodes; const memoCtx = { ev: App.ev, comp: App.comp, t: App.time, proj: App.project, memo: new Map() };
    for (const n of nodes) { const el = buildNode(n, memoCtx); world.append(el); nodeEls.set(n.id, el); }
    requestAnimationFrame(updateLinks); refreshInsp();
    if (!nodes.length) { world.append(h('div', { class: 'node', style: { left: '60px', top: '40px', padding: '14px', minWidth: '260px', pointerEvents: 'none', opacity: 0.8 }, html: '<b>节点图为空</b><br><span class="muted">右键或点击「+ 添加节点」创建；<br>例如：文字源 → 三角网格化 → 挤出 → 显示输出，<br>再把「几何」图层的显示节点指向它。</span>' })); }
  };
  const catColor = n => { const d = ND()[n.nodeType]; return (Nodes.CATS[d.cat] || ['', '#555'])[1]; };
  function buildNode(n, memoCtx) {
    const d = ND()[n.nodeType]; const sel = App.sel.nodes.includes(n.id) || App.sel.node === n.id;
    const el = h('div', { class: 'node' + (sel ? ' sel' : ''), style: { left: n.x + 'px', top: n.y + 'px' }, 'data-id': n.id });
    const head = h('div', { class: 'nh', style: { background: catColor(n) } }, h('span', { text: n.name, ondblclick: e => { e.stopPropagation(); const nn = prompt('节点名称', n.name); if (nn) App.edit('重命名节点', () => { n.name = nn; }); } }), h('span', { class: 'x', text: '×', title: '删除节点', onclick: e => { e.stopPropagation(); removeNodes([n.id]); } }));
    head.addEventListener('pointerdown', e => nodeDown(e, n)); head.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); nodeMenu(e, n); });
    const body = h('div', { class: 'nb' });
    // 输出端口
    for (const o of Nodes.outPorts(n)) {
      const dot = h('div', { class: 'dot', style: { background: Nodes.PORT_COLORS[o.type] }, title: `${Nodes.PORT_NAMES[o.type]} · 输出${o.label ? '（' + o.label + '）' : ''}`, 'data-port': o.id, 'data-dir': 'out', 'data-node': n.id });
      dot.addEventListener('pointerdown', e => portDown(e, n, o, 'out'));
      body.append(h('div', { class: 'prt out' }, h('span', { class: 'pn', text: (o.label || '输出') }), dot));
    }
    // 输入端口
    for (const pt of Nodes.inPorts(n)) {
      const dot = h('div', { class: 'dot', style: { background: Nodes.PORT_COLORS[pt.type] }, title: `${Nodes.PORT_NAMES[pt.type]} · 输入${pt.multi ? '（可多连）' : ''}`, 'data-port': pt.id, 'data-dir': 'in', 'data-node': n.id });
      dot.addEventListener('pointerdown', e => portDown(e, n, pt, 'in'));
      const rowEl = h('div', { class: 'prt in' }, dot, h('span', { class: 'pn', text: pt.label || pt.id }));
      if (pt.param && n.props[pt.id]) { const linked = !!n.inputs[pt.id]; if (!linked) { const ed = PropEd(n, pt.id); rowEl.append(h('div', { class: 'pwrap' }, ed.el)); } else rowEl.append(h('span', { class: 'muted', style: { marginLeft: 'auto' }, text: '← 已连接' })); }
      body.append(rowEl);
    }
    // 静态设置
    const st = statics(n); if (st) body.append(st);
    el.append(head, body);
    let info = ''; try { const r = Nodes.evalNode(memoCtx, n); info = r && r.info ? r.info : (r && r.out ? '就绪' : '无输出'); } catch (e) { info = '错误'; }
    el.append(h('div', { class: 'ninfo', 'data-info': n.id, text: info }));
    el.addEventListener('pointerdown', e => { if (e.target.closest('.dot,input,select,.nh')) return; selectNode(n.id, e.shiftKey); });
    return el;
  }
  const PropEd = (n, key) => { const ed = AE.PropUI.editor(n, key, { compact: true }); const orig = ed.update; return ed; };
  const layerOpts = (types) => [['', '— 选择图层 —']].concat(App.comp.layers.filter(l => !types || types.includes(l.type)).map(l => [l.id, l.name]));
  const sel1 = (opts, val, fn, title) => { const s = h('select', { title, style: { width: '100%', height: '18px', fontSize: '11px' }, onchange: e => fn(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, text: l, selected: v === (val || '') }))); s.addEventListener('pointerdown', e => e.stopPropagation()); return s; };
  function statics(n) {
    const w = h('div', { style: { padding: '2px 8px', display: 'flex', flexDirection: 'column', gap: '3px' } }); const set = (k, v) => App.edit('节点设置', () => { n.data[k] = v || null; });
    const add = (label, el) => w.append(h('div', { class: 'row', style: { gap: '4px' } }, h('span', { class: 'muted', style: { width: '44px', fontSize: '10.5px' }, text: label }), h('div', { style: { flex: 1 } }, el)));
    const t = n.nodeType;
    if (t === 'src.shape') add('图层', sel1(layerOpts(['shape']), n.data.layer, v => set('layer', v)));
    if (t === 'src.text') add('图层', sel1(layerOpts(['text']), n.data.layer, v => set('layer', v)));
    if (t === 'bend' || t === 'twist') add('轴向', sel1([['x', 'X'], ['y', 'Y'], ['z', 'Z']], n.data.axis, v => set('axis', v)));
    if (t === 'fielddeform') { add('模式', sel1([['normal', '沿法线'], ['vector', '沿场向量'], ['both', '二者']], n.data.mode, v => set('mode', v))); add('空间', sel1(layerOpts(['geo']), n.data.space, v => set('space', v), '用于把顶点转换到世界坐标的图层')); }
    if (t.startsWith('field.') && t !== 'field.mix') add('跟随', sel1(layerOpts(), n.data.follow, v => set('follow', v), '场位置相对该图层（父级）'));
    if (t === 'field.mix') add('运算', sel1([['add', '相加'], ['mul', '相乘'], ['max', '最大'], ['mix', '混合']], n.data.op, v => set('op', v)));
    if (t === 'val.math') add('运算', sel1([['add', '加'], ['sub', '减'], ['mul', '乘'], ['div', '除'], ['min', '最小'], ['max', '最大']], n.data.op, v => set('op', v)));
    if (t === 'emitter') { add('部位', sel1([['all', '全部表面'], ['front', '仅正面']], n.data.part, v => set('part', v))); add('空间', sel1(layerOpts(['geo']), n.data.space, v => set('space', v), '几何所在图层（转换到世界坐标）')); }
    if (t === 'collider') add('空间', sel1(layerOpts(['geo']), n.data.space, v => set('space', v), '几何所在图层（转换到世界坐标）'));
    if (t === 'pin') w.append(h('div', { class: 'muted', style: { fontSize: '10.5px' }, text: `图钉 ${n.data.pins.length} 个 · 用画布「图钉」工具添加/拖动` }));
    return w.children.length ? w : null;
  }

  // ----- 连线绘制 -----
  const portPos = (nid, port, dir) => { const el = nodeEls.get(nid); if (!el) return null; const dot = el.querySelector(`.dot[data-port="${port}"][data-dir="${dir}"]`); if (!dot) return null; const r = dot.getBoundingClientRect(), wr = world.getBoundingClientRect(); return [(r.left + r.width / 2 - wr.left) / view.s, (r.top + r.height / 2 - wr.top) / view.s]; };
  function linkPath(a, b) { const dx = Math.max(40, Math.abs(b[0] - a[0]) * 0.5); return `M${a[0]},${a[1]} C${a[0] + dx},${a[1]} ${b[0] - dx},${b[1]} ${b[0]},${b[1]}`; }
  function updateLinks() {
    svg.innerHTML = '';
    for (const n of graph().nodes) for (const [port, v] of Object.entries(n.inputs)) for (const l of [].concat(v)) {
      const sn = graph().nodes.find(x => x.id === l.node); if (!sn) continue; const a = portPos(l.node, l.port, 'out'), b = portPos(n.id, port, 'in'); if (!a || !b) continue;
      const pt = Nodes.outPorts(sn).find(o => o.id === l.port); const col = Nodes.PORT_COLORS[pt ? pt.type : 'geo'];
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', linkPath(a, b)); path.setAttribute('stroke', col); path.setAttribute('opacity', '0.9');
      const r = (() => { try { return Nodes.evalNode({ ev: App.ev, comp: App.comp, t: App.time, proj: App.project, memo: new Map() }, sn); } catch (e) { return null; } })();
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'title'); t.textContent = `${sn.name} → ${n.name}.${port}\n类型：${Nodes.PORT_NAMES[pt ? pt.type : 'geo']}${r && r.info ? '\n结果：' + r.info : ''}\n点击断开此连接`; path.append(t);
      path.addEventListener('click', e => { e.stopPropagation(); App.edit('断开连接', () => Nodes.unlink(n, port, l.node)); });
      svg.append(path);
    }
    if (linkDrag) { tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); tempPath.setAttribute('stroke', '#fff'); tempPath.setAttribute('stroke-dasharray', '5 4'); svg.append(tempPath); }
  }
  function refreshLive() { // 值变化：更新节点信息文字与检视
    const memoCtx = { ev: App.ev, comp: App.comp, t: App.time, proj: App.project, memo: new Map() };
    for (const n of graph().nodes) { const el = nodeEls.get(n.id); if (!el) continue; const ie = el.querySelector('.ninfo'); try { const r = Nodes.evalNode(memoCtx, n); if (ie) ie.textContent = r && r.info ? r.info : (r && r.out ? '就绪' : '无输出'); } catch (e) { } }
    refreshInsp();
  }

  // ----- 选择/拖动 -----
  function selectNode(id, add) { if (add) { const s = App.sel.nodes.slice(); const i = s.indexOf(id); if (i >= 0) s.splice(i, 1); else s.push(id); App.sel.nodes = s; } else App.sel.nodes = [id]; App.sel.node = App.sel.nodes[App.sel.nodes.length - 1] || null; nodeEls.forEach((el, nid) => el.classList.toggle('sel', App.sel.nodes.includes(nid))); refreshInsp(); App.emit('nodesel'); App.requestRender(); }
  function nodeDown(e, n) {
    if (e.button !== 0) return; e.stopPropagation(); if (!App.sel.nodes.includes(n.id)) selectNode(n.id, e.shiftKey);
    const ids = App.sel.nodes.slice(); const start = ids.map(id => { const nn = graph().nodes.find(x => x.id === id); return { nn, x: nn.x, y: nn.y }; }); drag = { kind: 'nodes', x0: e.clientX, y0: e.clientY, start, moved: false }; wrap.setPointerCapture(e.pointerId);
  }
  function onBgDown(e) {
    if (e.target !== wrap && e.target !== world && e.target !== svg) return; if (e.button !== 0 && e.button !== 1) return;
    if (e.button === 1 || e.altKey) { drag = { kind: 'pan', x0: e.clientX, y0: e.clientY, vx: view.x, vy: view.y }; wrap.setPointerCapture(e.pointerId); return; }
    const r = wrap.getBoundingClientRect(); drag = { kind: 'box', x0: e.clientX - r.left, y0: e.clientY - r.top, add: e.shiftKey, box: h('div', { class: 'marquee' }) }; wrap.append(drag.box); wrap.setPointerCapture(e.pointerId);
    if (!e.shiftKey) { App.sel.nodes = []; App.sel.node = null; nodeEls.forEach(el => el.classList.remove('sel')); refreshInsp(); }
  }
  function portDown(e, n, port, dir) {
    e.stopPropagation(); e.preventDefault(); wrap.setPointerCapture(e.pointerId);
    if (dir === 'out') { linkDrag = { from: n, port, dir }; }
    else { // 输入端口：已有连线则拆下重连
      const lk = n.inputs[port.id]; if (lk && !port.multi) { const l = lk; const src = graph().nodes.find(x => x.id === l.node); Nodes.unlink(n, port.id, l.node); App.changed('struct'); linkDrag = { from: src, port: Nodes.outPorts(src).find(o => o.id === l.port), dir: 'out', rewire: true }; }
      else linkDrag = { to: n, port, dir: 'in' };
    }
    drag = { kind: 'link' }; updateLinks();
  }
  function onMove(e) {
    if (!drag) return; const r = wrap.getBoundingClientRect();
    if (drag.kind === 'pan') { view.x = drag.vx + e.clientX - drag.x0; view.y = drag.vy + e.clientY - drag.y0; applyView(); return; }
    if (drag.kind === 'nodes') { const dx = (e.clientX - drag.x0) / view.s, dy = (e.clientY - drag.y0) / view.s; if (!drag.moved && Math.hypot(dx, dy) < 2) return; drag.moved = true; for (const s of drag.start) { s.nn.x = s.x + dx; s.nn.y = s.y + dy; const el = nodeEls.get(s.nn.id); if (el) { el.style.left = s.nn.x + 'px'; el.style.top = s.nn.y + 'px'; } } updateLinks(); return; }
    if (drag.kind === 'box') { const x1 = e.clientX - r.left, y1 = e.clientY - r.top; Object.assign(drag.box.style, { left: Math.min(drag.x0, x1) + 'px', top: Math.min(drag.y0, y1) + 'px', width: Math.abs(x1 - drag.x0) + 'px', height: Math.abs(y1 - drag.y0) + 'px' }); return; }
    if (drag.kind === 'link') {
      const p = [(e.clientX - r.left - view.x) / view.s, (e.clientY - r.top - view.y) / view.s];
      if (!tempPath || !tempPath.isConnected) updateLinks();
      let a = null, b = null;
      if (linkDrag.dir === 'out') { a = portPos(linkDrag.from.id, linkDrag.port.id, 'out'); b = p; } else { a = p; b = portPos(linkDrag.to.id, linkDrag.port.id, 'in'); }
      if (a && b && tempPath) tempPath.setAttribute('d', linkPath(a, b));
    }
  }
  function onUp(e) {
    if (!drag) return; const d = drag; drag = null;
    if (d.kind === 'nodes') { if (d.moved) { App.commit('移动节点'); } return; }
    if (d.kind === 'box') {
      d.box.remove(); const r = wrap.getBoundingClientRect(); const x1 = e.clientX - r.left, y1 = e.clientY - r.top; const xa = Math.min(d.x0, x1), xb = Math.max(d.x0, x1), ya = Math.min(d.y0, y1), yb = Math.max(d.y0, y1); const ids = d.add ? App.sel.nodes.slice() : [];
      if (xb - xa > 4 || yb - ya > 4) for (const n of graph().nodes) { const el = nodeEls.get(n.id); const nr = el.getBoundingClientRect(); const lx = nr.left - r.left, ly = nr.top - r.top; if (lx < xb && lx + nr.width > xa && ly < yb && ly + nr.height > ya && !ids.includes(n.id)) ids.push(n.id); }
      App.sel.nodes = ids; App.sel.node = ids[ids.length - 1] || null; nodeEls.forEach((el, nid) => el.classList.toggle('sel', ids.includes(nid))); refreshInsp(); App.emit('nodesel'); App.requestRender(); return;
    }
    if (d.kind === 'link') {
      const lk = linkDrag; linkDrag = null; const tgt = document.elementFromPoint(e.clientX, e.clientY); const dot = tgt && tgt.closest ? tgt.closest('.dot') : null; let msg = null;
      if (dot && lk) {
        const nid = dot.dataset.node, pid = dot.dataset.port, dir = dot.dataset.dir; const other = graph().nodes.find(x => x.id === nid);
        if (lk.dir === 'out' && dir === 'in') msg = Nodes.link(App.project, other, pid, lk.from, lk.port.id);
        else if (lk.dir === 'in' && dir === 'out') msg = Nodes.link(App.project, lk.to, lk.port.id, other, pid);
        else msg = '请连接输出端口与输入端口';
        if (msg) App.toast(msg, 2400); else { App.changed('struct'); App.commit('连接节点'); return; }
      }
      if (lk && lk.rewire) { App.commit('断开连接'); }
      NE.refresh();
    }
  }
  // ----- 操作 -----
  function removeNodes(ids) { if (!ids.length) return; App.edit('删除节点', () => { Nodes.remove(App.project, ids); App.sel.nodes = App.sel.nodes.filter(i => !ids.includes(i)); if (ids.includes(App.sel.node)) App.sel.node = null; }); }
  NE.deleteSelected = () => { if (!App.sel.nodes.length) return false; removeNodes(App.sel.nodes.slice()); return true; };
  function duplicate() { if (!App.sel.nodes.length) return; let out; App.edit('复制节点', () => { out = Nodes.duplicate(App.project, App.sel.nodes); App.sel.nodes = out.map(n => n.id); App.sel.node = App.sel.nodes[0]; }); }
  function group() { if (!App.sel.nodes.length) { App.toast('请先选择要封装的节点'); return; } let g; App.edit('封装节点组', () => { g = Nodes.makeGroup(App.project, App.sel.nodes.slice()); if (g) { App.sel.nodes = [g.id]; App.sel.node = g.id; } }); }
  function ungroup() { const n = App.sel.node && graph().nodes.find(x => x.id === App.sel.node); if (!n || n.nodeType !== 'group') { App.toast('请选择一个节点组'); return; } App.edit('展开节点组', () => { Nodes.ungroup(App.project, n); App.sel.nodes = []; App.sel.node = null; }); }
  function fit() { const ns = graph().nodes; if (!ns.length) { view = { x: 20, y: 20, s: 1 }; applyView(); updateLinks(); return; } let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const n of ns) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + 200); y1 = Math.max(y1, n.y + 150); } const r = wrap.getBoundingClientRect(); const s = U.clamp(Math.min((r.width - 40) / (x1 - x0), (r.height - 40) / (y1 - y0)), 0.3, 1.2); view.s = s; view.x = 20 - x0 * s + (r.width - 40 - (x1 - x0) * s) / 2; view.y = 20 - y0 * s; applyView(); updateLinks(); }
  NE.focusNode = (id) => { NE.refresh(); const n = graph().nodes.find(x => x.id === id); if (n) { const r = wrap.getBoundingClientRect(); view.x = r.width / 2 - (n.x + 90) * view.s; view.y = r.height / 2 - (n.y + 40) * view.s; applyView(); updateLinks(); selectNode(id, false); } };
  function addMenu(x, y, worldPos) {
    const px = worldPos || [(-view.x + 60) / view.s, (-view.y + 40) / view.s]; const cats = {};
    for (const [t, d] of Object.entries(ND())) { if (t === 'group') continue; (cats[d.cat] = cats[d.cat] || []).push({ label: d.name, fn: () => { let nn; App.edit('添加节点', () => { nn = Nodes.create(App.project, t, px[0], px[1]); const p = App.primary(); if (p && p.type === 'text' && t === 'src.text') nn.data.layer = p.id; if (p && p.type === 'shape' && t === 'src.shape') nn.data.layer = p.id; App.sel.nodes = [nn.id]; App.sel.node = nn.id; }); } }); }
    const items = []; for (const c of ['input', 'geo', 'deform', 'field', 'value', 'consumer']) { items.push({ head: Nodes.CATS[c][0] }); items.push(...(cats[c] || [])); }
    UI.menu(items, x, y);
  }
  function nodeMenu(e, n) {
    if (!App.sel.nodes.includes(n.id)) selectNode(n.id, false);
    UI.menu([{ label: '复制', key: 'Ctrl+D', fn: duplicate }, { label: '封装选中节点为组', fn: group }, ...(n.nodeType === 'group' ? [{ label: '展开节点组', fn: ungroup }] : []), { label: '断开所有输入连线', fn: () => App.edit('断开连接', () => { n.inputs = {}; }) }, { sep: true }, { label: '删除', key: 'Del', fn: () => NE.deleteSelected() }], e.clientX, e.clientY);
  }

  // ----- 检视器：当前结果 / 参数 -----
  function refreshInsp() {
    const n = App.sel.node && graph().nodes.find(x => x.id === App.sel.node); if (!n) { insp.classList.add('hidden'); return; }
    insp.classList.remove('hidden'); insp.innerHTML = ''; const d = ND()[n.nodeType]; let res = null; try { res = Nodes.evalNode({ ev: App.ev, comp: App.comp, t: App.time, proj: App.project, memo: new Map() }, n); } catch (e) { }
    insp.append(h('div', { style: { fontWeight: 600, color: 'var(--acc2)' }, text: n.name }), h('div', { class: 'muted', text: d.name + ' · ' + (res && res.info ? res.info : '') }));
    const out = res && res.out; const cv = h('canvas', { width: 190, height: 110 });
    if (out && (out.pos || out.polys || out.kind === 'emitter' || out.kind === 'collider')) { insp.append(cv); drawPreview(cv, out); }
    else if (out && out.kind === 'field') insp.append(h('div', { class: 'muted', text: '场：位置/范围见画布紫色圆' }));
    else if (typeof out === 'number') insp.append(h('div', { text: '值：' + U.fmt(out, 4) }));
    else if (Array.isArray(out)) insp.append(h('div', { text: '值：[' + out.map(v => U.fmt(v, 2)).join(', ') + ']' }));
    if (n.nodeType === 'pin') { const l = h('div', { style: { marginTop: '4px' } }); (n.data.pins || []).forEach(pi => l.append(h('div', { class: 'row', style: { gap: '4px' } }, h('span', { class: 'muted', text: pi.id }), h('button', { class: 'btn sm danger', text: '×', onclick: () => App.edit('删除图钉', () => { Nodes.removePin(n, pi.id); }) })))); insp.append(l); }
  }
  function drawPreview(cv, out) {
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height); ctx.strokeStyle = '#4fd1c5'; ctx.lineWidth = 0.6;
    let mesh = out.pos ? out : (out.mesh || null);
    if (out.polys) { const bb = AE.G.polysBBox(out.polys); const s = Math.min(180 / (bb[2] - bb[0] || 1), 100 / (bb[3] - bb[1] || 1)); const ox = 95 - (bb[0] + bb[2]) / 2 * s, oy = 55 - (bb[1] + bb[3]) / 2 * s; ctx.fillStyle = '#4fd1c555'; for (const p of out.polys) { ctx.beginPath(); for (let i = 0; i < p.length; i += 2) ctx.lineTo(p[i] * s + ox, p[i + 1] * s + oy); ctx.closePath(); ctx.fill('nonzero'); ctx.stroke(); } return; }
    if (!mesh) return; const b = AE.Mesh.bounds(mesh); const w = b[3] - b[0], hh = b[4] - b[1]; const s = Math.min(180 / (w || 1), 100 / (hh || 1)); const ox = 95 - (b[0] + b[3]) / 2 * s, oy = 55 - (b[1] + b[4]) / 2 * s; const p = mesh.pos, I = mesh.idx; const step = Math.max(1, Math.floor(I.length / 3 / 2500));
    ctx.beginPath(); for (let t = 0; t < I.length; t += 3 * step) { for (let k = 0; k < 3; k++) { const i = I[t + k] * 3; const x = p[i] * s + ox, y = p[i + 1] * s + oy; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); } ctx.stroke();
    ctx.fillStyle = '#9aa1b2'; ctx.font = '10px sans-serif'; ctx.fillText('前视图（xy）', 4, 106);
  }
})();
