/* props.js — 属性编辑器(PropUI) 与属性面板：图层属性、形状内容、文字、几何、粒子、效果、蒙版、表达式 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, G = AE.G, Model = AE.Model, App = AE.App, UI = AE.UI, Actions = AE.Actions;
  const h = UI.h;
  const PropUI = AE.PropUI = {};
  const Props = AE.Props = {};

  // ===== 属性值编辑器 =====
  PropUI.editor = (owner, key, o = {}) => {
    const info = Model.propInfo(owner, key); const comp = () => App.comp;
    const cur = () => { const v = App.ev.value(comp(), owner, key, App.time); return v === undefined ? (owner.props[key] ? owner.props[key].v : 0) : v; };
    const setv = (v) => { Model.setPropAt(owner, key, App.time, v, { fps: comp().fps }); App.changed('values'); };
    const fin = (label) => { App.changed('struct'); App.commit(label || '修改属性'); };
    const wrap = h('div', { class: 'val', style: { width: '100%' } }); const ed = { el: wrap, update: () => { } };
    const label = '修改' + (info.label || key);
    if (info.type === 'num') {
      const inp = UI.num({ value: cur(), step: info.step || 1, min: info.min, max: info.max, unit: info.unit, onChange: (v, ph) => { setv(v); if (ph === 'end') fin(label); } }); wrap.append(inp);
      ed.update = () => { const v = cur(); if (typeof v === 'number') inp.setValue(v); };
    } else if (info.type === 'vec') {
      const n = info.dim || (Array.isArray(cur()) ? cur().length : 2); const inps = [];
      const dimShow = Math.min(n, o.compact && n > 2 ? 3 : n);
      for (let i = 0; i < dimShow; i++) { const idx = i; const inp = UI.num({ value: (cur() || [])[i] || 0, step: info.step || 1, cls: 'ax' + i, unit: info.unit, min: info.min, max: info.max, onChange: (v, ph) => { const a = (cur() || []).slice(); while (a.length < n) a.push(0); a[idx] = v; if (info.unit === '%' && o.lockScale) { } setv(a); if (ph === 'end') fin(label); } }); inps.push(inp); wrap.append(inp); }
      ed.update = () => { const v = cur(); if (Array.isArray(v)) inps.forEach((inp, i) => inp.setValue(v[i] || 0)); };
    } else if (info.type === 'color') {
      const c = UI.color({ value: cur(), onChange: (v, ph) => { setv(v); if (ph === 'end') fin(label); } }); wrap.append(c); ed.update = () => { const v = cur(); if (Array.isArray(v)) c.set(v); };
    } else if (info.type === 'path') {
      wrap.append(h('button', { class: 'btn sm', text: '编辑路径', onclick: () => { App.sel.item = { layer: owner.id, key, type: 'path' }; App.requestRender(); App.toast('在画布上拖动顶点与手柄；Alt+拖动手柄打断对称；Ctrl+点击线段插入顶点；双击顶点切换平滑/尖角', 3500); } }));
    }
    return ed;
  };

  // ===== 面板 =====
  let host, body, exprHost, exprTarget = null;
  const opened = new Set(['transform']); const secOpen = new Map();
  const isOpen = (id, def = true) => secOpen.has(id) ? secOpen.get(id) : def;
  Props.init = (el) => {
    host = el; host.innerHTML = '';
    host.append(h('div', { class: 'phead' }, h('span', { class: 'title', text: '属性' }), h('span', { class: 'muted', id: 'propSub' })));
    body = h('div', { class: 'pbody scroll', id: 'propBody' }); exprHost = h('div', { class: 'hidden', style: { borderTop: '1px solid var(--line2)', background: '#12141a' } });
    host.append(body, exprHost);
    let pend = false; const defer = () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; Props.rebuild(); }); };
    App.on('struct', defer); App.on('select', defer); App.on('comp', defer); App.on('selprop', () => { Props.refreshSel(); });
    App.on('time', () => Props.update()); App.on('change', k => { if (k !== 'struct') Props.update(); });
    App.on('openExpr', e => openExpr(e.layer, e.key)); App.on('focusText', () => { setTimeout(() => { const t = body.querySelector('textarea[data-role=text]'); if (t) { t.focus(); t.select(); } }, 50); });
    Props.rebuild();
  };
  let editors = [];
  Props.update = () => { for (const e of editors) e.update(); if (exprTarget) refreshExpr(); };
  Props.refreshSel = () => { body.querySelectorAll('.prow').forEach(r => r.classList.toggle('sel', App.isPropSel(r.dataset.lid, r.dataset.key))); };
  const row = (label, el, tip) => h('div', { class: 'kv' }, h('label', { text: label, title: tip }), el);
  const sec = (id, title, content, defOpen = true, extra) => {
    const s = h('div', { class: 'prop-sec' + (isOpen(id, defOpen) ? '' : ' closed') }); const hd = h('div', { class: 'sh', onclick: () => { secOpen.set(id, !isOpen(id, defOpen)); s.classList.toggle('closed'); } }, h('span', { class: 'arr', text: '▾' }), h('span', { text: title }), extra ? h('span', { style: { marginLeft: 'auto', display: 'flex', gap: '4px' }, onclick: e => e.stopPropagation() }, extra) : null);
    s.append(hd, h('div', { class: 'sb' }, content)); return s;
  };
  const selectEl = (opts, val, onchange) => h('select', { onchange: e => onchange(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, text: l, selected: v === val })));
  const checkEl = (val, onchange, label) => h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: !!val, onchange: e => onchange(e.target.checked) }), label || '');
  const E = (label, fn, kind = 'struct') => App.edit(label, fn, kind);

  Props.rebuild = () => {
    if (!body) return; const st = body.scrollTop; body.innerHTML = ''; editors = [];
    const sel = App.selLayers(); const c = App.comp; document.getElementById('propSub').textContent = sel.length === 1 ? sel[0].name : sel.length > 1 ? sel.length + ' 个图层' : c.name;
    if (!sel.length) body.append(compPanel());
    else if (sel.length > 1) body.append(multiPanel(sel));
    else body.append(...layerPanel(sel[0]));
    body.scrollTop = st; if (exprTarget) { const L = App.layer(exprTarget.layer); if (!L || !L.props[exprTarget.key]) { exprTarget = null; exprHost.classList.add('hidden'); } else refreshExpr(true); }
  };

  // ----- 无选择：合成与工程 -----
  function compPanel() {
    const c = App.comp; const wrap = h('div');
    wrap.append(sec('comp', '合成设置', h('div', null,
      row('名称', h('input', { type: 'text', value: c.name, onchange: e => E('重命名合成', () => { c.name = e.target.value || c.name; }) })),
      row('尺寸', h('div', { class: 'row' }, h('span', { text: `${c.w} × ${c.h}`, style: { color: 'var(--cy)' } }), h('span', { class: 'muted', text: `@ ${c.fps} fps · ${c.dur}s` }))),
      row('背景色', (() => { const co = UI.color({ value: [...c.bg, 1], alpha: false, onChange: (v, ph) => { c.bg = [v[0], v[1], v[2]]; App.changed('values'); if (ph === 'end') App.commit('背景色'); } }); return co; })()),
      row('运动模糊', h('div', { class: 'row' }, checkEl(c.mb.on, v => E('运动模糊总开关', () => { c.mb.on = v; }), '总开关'))),
      row('快门角度', UI.num({ value: c.mb.angle, step: 1, min: 0, max: 720, unit: '°', prec: 0, onChange: (v, ph) => { c.mb.angle = v; App.changed('values'); if (ph === 'end') App.commit('快门角度'); } })),
      row('快门相位', UI.num({ value: c.mb.phase, step: 1, min: -360, max: 360, unit: '°', prec: 0, onChange: (v, ph) => { c.mb.phase = v; App.changed('values'); if (ph === 'end') App.commit('快门相位'); } })),
      row('采样数', UI.num({ value: c.mb.samples || 12, step: 1, min: 3, max: 32, prec: 0, onChange: (v, ph) => { c.mb.samples = Math.round(v); App.changed('values'); if (ph === 'end') App.commit('采样数'); } })),
      h('div', { class: 'row', style: { padding: '4px 8px' } }, h('button', { class: 'btn sm', text: '合成设置…', onclick: () => UI.compDialog(c) }))), true));
    wrap.append(sec('env', '环境光（反射与照明）', envPanel(), false));
    wrap.append(h('div', { class: 'timeline-empty', style: { padding: '14px' }, html: c.layers.length ? '在时间轴或画布中选择图层以编辑其属性。<br>按 <b>P / S / R / T</b> 在时间轴中快速显示变换属性。' : '空工程：从「图层 ▸ 新建」开始，或用画布工具直接绘制。' }));
    return wrap;
  }
  function envPanel() {
    const env = App.project.env; const wrap = h('div');
    const col = (label, key) => row(label, UI.color({ value: [...env[key], 1], alpha: false, onChange: (v, ph) => { env[key] = [v[0], v[1], v[2]]; App.changed('values'); if (ph === 'end') App.commit('环境光'); } }));
    wrap.append(col('天空色', 'sky'), col('地平线', 'horizon'), col('地面色', 'ground'), row('强度', UI.num({ value: env.intensity, step: 0.05, min: 0, max: 10, onChange: (v, ph) => { env.intensity = v; App.changed('values'); if (ph === 'end') App.commit('环境强度'); } })));
    env.lobes.forEach((l, i) => wrap.append(row('光斑 ' + (i + 1), h('div', { class: 'row' }, UI.color({ value: [...l.color, 1], alpha: false, onChange: (v, ph) => { l.color = [v[0], v[1], v[2]]; App.changed('values'); if (ph === 'end') App.commit('环境光斑'); } }), UI.num({ value: l.gain, step: 0.05, min: 0, onChange: (v, ph) => { l.gain = v; App.changed('values'); if (ph === 'end') App.commit('环境光斑'); } })))));
    return wrap;
  }
  // ----- 多选 -----
  function multiPanel(sel) {
    const wrap = h('div'); wrap.append(sec('multi', `已选择 ${sel.length} 个图层`, h('div', { style: { padding: '6px 8px', display: 'flex', flexWrap: 'wrap', gap: '4px' } }, sel.map(L => h('span', { class: 'chip', text: L.name, onclick: () => App.select([L.id]) }))), true));
    const items = [['transform.opacity', '不透明度'], ['transform.rotation', '旋转']].filter(([k]) => sel.every(L => L.props[k]));
    const body2 = h('div'); for (const [k, lb] of items) { const info = Model.propInfo(sel[0], k); const inp = UI.num({ value: App.val(sel[0], k), step: info.step, unit: info.unit, onChange: (v, ph) => { for (const L of sel) Model.setPropAt(L, k, App.time, v, { fps: App.fps() }); App.changed('values'); if (ph === 'end') { App.changed('struct'); App.commit('批量修改' + lb); } } }); body2.append(row(lb, inp)); }
    body2.append(h('div', { class: 'row', style: { padding: '6px 8px', gap: '6px' } }, h('button', { class: 'btn sm', text: '预合成', onclick: () => Actions.precompose() }), h('button', { class: 'btn sm', text: '复制', onclick: () => Actions.duplicate() }), h('button', { class: 'btn sm danger', text: '删除', onclick: () => Actions.remove() })));
    wrap.append(sec('multi2', '共同属性', body2, true)); return wrap;
  }
  // ----- 单图层 -----
  function layerPanel(L) {
    const c = App.comp; const out = [];
    const nameInp = h('input', { type: 'text', value: L.name, style: { flex: 1 }, onchange: e => Actions.rename(L, e.target.value) });
    const info = h('div', { class: 'kv', style: { gridTemplateColumns: '74px 1fr' } },
      h('label', { text: '名称' }), h('div', { class: 'row' }, nameInp, h('span', { class: 'chip', text: Model.LAYER_TYPES[L.type] })),
      ...(L.type !== 'audio' ? [h('label', { text: '父级' }), selectEl([['', '无']].concat(c.layers.filter(x => x !== L && !Model.isDescendant(c, x, L)).map(x => [x.id, x.name])), L.parent || '', v => Actions.setParent(L, v || null))] : []),
      h('label', { text: '入点 / 出点' }), h('div', { class: 'row' }, UI.num({ value: L.in, step: 0.05, unit: 's', onChange: (v, ph) => { L.in = Math.min(App.snap(v), L.out - 1 / c.fps); App.changed('values'); if (ph === 'end') { App.changed('struct'); App.commit('入点'); } } }), UI.num({ value: L.out, step: 0.05, unit: 's', onChange: (v, ph) => { L.out = Math.max(App.snap(v), L.in + 1 / c.fps); App.changed('values'); if (ph === 'end') { App.changed('struct'); App.commit('出点'); } } })),
      ...(L.type !== 'audio' && L.type !== 'camera' && L.type !== 'light' ? [h('label', { text: '混合模式' }), selectEl(Model.BLENDS, L.blend, v => E('混合模式', () => { L.blend = v; }, 'values')), h('label', { text: '开关' }), h('div', { class: 'row', style: { gap: '10px' } }, checkEl(L.is3D, () => Actions.toggle3D(L), '三维'), checkEl(L.mb, v => E('运动模糊', () => { L.mb = v; }, 'values'), '运动模糊'))] : []),
      ...(L.type !== 'audio' && L.type !== 'camera' && L.type !== 'light' ? matteRows(L) : []));
    out.push(sec('layer', '图层', info, true));
    const groups = Model.layerSchema(L);
    // 类型专属区
    if (L.type === 'text') out.push(textPanel(L));
    if (L.type === 'geo') out.push(geoPanel(L));
    if (L.type === 'particles') out.push(particlePanel(L));
    if (L.type === 'light') out.push(sec('lightopt', '灯光类型', h('div', null, row('类型', selectEl([['dir', '平行光'], ['point', '点光源']], L.light.type, v => E('灯光类型', () => { L.light.type = v; }))), row('投射阴影', checkEl(L.light.shadow, v => E('阴影开关', () => { L.light.shadow = v; }, 'values')))), true));
    if (L.type === 'camera') out.push(sec('camopt', '景深', h('div', null, row('启用景深', checkEl(L.cam.dof, v => E('景深', () => { L.cam.dof = v; }, 'values'))), h('div', { class: 'muted', style: { padding: '2px 8px' }, text: '景深由可见表面的实际深度决定；对焦距离与光圈可设关键帧。' }), h('div', { class: 'row', style: { padding: '4px 8px' } }, h('button', { class: 'btn sm', text: '重置为默认视角', onclick: () => { const d = c.h / 2 / Math.tan(L.props['cam.fov'].v * U.DEG / 2); E('重置摄像机', () => { L.props['transform.position'].v = [c.w / 2, c.h / 2, -d]; delete L.props['transform.position'].k; L.props['cam.target'].v = [c.w / 2, c.h / 2, 0]; delete L.props['cam.target'].k; }); } }))), true));
    if (L.type === 'precomp') out.push(precompPanel(L));
    if (L.type === 'audio') out.push(audioPanel(L));
    for (const g of groups) out.push(...groupSections(L, g));
    if (L.type === 'shape') out.push(shapeAddPanel(L));
    if (L.type !== 'audio' && L.type !== 'camera' && L.type !== 'light') {
      out.push(sec('addfx', '效果与蒙版', h('div', { class: 'row', style: { padding: '6px 8px', gap: '6px', flexWrap: 'wrap' } }, h('button', { class: 'btn sm', text: '+ 效果 ▾', onclick: e => { const r = e.target.getBoundingClientRect(); UI.menu(Object.entries(Model.EFFECTS).map(([k, d]) => ({ label: d.name, fn: () => Actions.addEffect(L, k) })), r.left, r.bottom); } }), h('button', { class: 'btn sm', text: '+ 矩形蒙版', onclick: () => Actions.addMask(L, 'rect') }), h('button', { class: 'btn sm', text: '+ 椭圆蒙版', onclick: () => Actions.addMask(L, 'ellipse') })), true));
    }
    return out;
  }
  const matteRows = (L) => {
    const c = App.comp; const m = L.matte || { mode: 'none' };
    return [h('label', { text: '轨道遮罩' }), h('div', { class: 'row' }, selectEl([['none', '无'], ['alpha', 'Alpha'], ['luma', '亮度']], m.mode, v => E('轨道遮罩', () => { L.matte = Object.assign({ layer: null, inv: false }, L.matte, { mode: v }); if (v !== 'none' && !L.matte.layer) { const idx = c.layers.indexOf(L); const cand = c.layers[idx - 1] || c.layers[idx + 1]; if (cand) L.matte.layer = cand.id; } })), selectEl([['', '—']].concat(c.layers.filter(x => x !== L).map(x => [x.id, x.name])), m.layer || '', v => E('遮罩图层', () => { L.matte = Object.assign({ mode: 'alpha', inv: false }, L.matte, { layer: v || null }); })), checkEl(m.inv, v => E('遮罩反转', () => { L.matte = Object.assign({ mode: 'alpha', layer: null }, L.matte, { inv: v }); }), '反转'))];
  };

  // 属性分组渲染（递归）
  function groupSections(L, g, depth = 0) {
    const out = [];
    const content = h('div');
    const addRows = (props) => { for (const p of props) content.append(propRow(L, p.key, p.info)); };
    addRows(g.props);
    const extra = [];
    if (g.effect) { const fx = g.effect; extra.push(h('input', { type: 'checkbox', checked: fx.on, title: '启用', onchange: e => E('效果开关', () => { fx.on = e.target.checked; }, 'values') }), h('button', { class: 'btn sm', text: '▲', onclick: () => Actions.moveEffect(L, fx.id, -1) }), h('button', { class: 'btn sm', text: '▼', onclick: () => Actions.moveEffect(L, fx.id, 1) }), h('button', { class: 'btn sm danger', text: '×', onclick: () => Actions.removeEffect(L, fx.id) })); }
    if (g.mask) { const m = g.mask; content.prepend(row('模式', h('div', { class: 'row' }, selectEl([['add', '相加'], ['subtract', '相减'], ['intersect', '相交'], ['difference', '差值'], ['none', '无']], m.mode, v => E('蒙版模式', () => { m.mode = v; }, 'values')), checkEl(m.inv, v => E('蒙版反转', () => { m.inv = v; }, 'values'), '反转')))); extra.push(h('button', { class: 'btn sm danger', text: '×', onclick: () => Actions.removeMask(L, m.id) })); }
    if (g.item) {
      const it = g.item; const stat = shapeItemStatics(L, it); if (stat) content.prepend(stat);
      extra.push(h('input', { type: 'checkbox', checked: it.on, title: '启用', onchange: e => E('形状项开关', () => { it.on = e.target.checked; }, 'values') }), h('button', { class: 'btn sm', text: '▲', title: '上移（调整顺序会改变结果）', onclick: () => Actions.moveShapeItem(L, it, -1) }), h('button', { class: 'btn sm', text: '▼', onclick: () => Actions.moveShapeItem(L, it, 1) }), h('button', { class: 'btn sm danger', text: '×', onclick: () => Actions.removeShapeItem(L, it) }));
    }
    if (g.children) for (const ch of g.children) { const subs = groupSections(L, ch, depth + 1); for (const s of subs) content.append(s); }
    if (!g.props.length && !g.children && !g.item) return out;
    out.push(sec(`${L.id}:${g.id}`, g.title, content, depth === 0 ? (g.id === 'transform' || g.id === 'camera' || g.id === 'light' || g.id === 'material') : true, extra.length ? extra : null));
    return out;
  }
  function shapeItemStatics(L, it) {
    const w = h('div'); const def = Model.SHAPE_ITEMS[it.type];
    if (it.type === 'merge') w.append(row('运算', selectEl([['union', '并集'], ['diff', '差集（下减上）'], ['intersect', '交集'], ['xor', '排除']], it.op || 'union', v => E('合并运算', () => { it.op = v; }))));
    if (it.type === 'trim') w.append(row('多形状', selectEl([['sim', '同时'], ['seq', '依次（逐条路径）']], it.mode || 'sim', v => E('修剪模式', () => { it.mode = v; }))));
    if (it.type === 'fill') w.append(row('填充规则', selectEl([['nonzero', '非零环绕'], ['evenodd', '奇偶（挖孔）']], it.rule || 'nonzero', v => E('填充规则', () => { it.rule = v; }))));
    if (it.type === 'stroke') w.append(row('端点', selectEl([['butt', '平头'], ['round', '圆头'], ['square', '方头']], it.cap || 'round', v => E('端点', () => { it.cap = v; }))), row('连接', selectEl([['miter', '尖角'], ['round', '圆角'], ['bevel', '斜角']], it.join || 'round', v => E('连接', () => { it.join = v; }))));
    if (it.type === 'glyphs') w.append(row('文字图层', selectEl([['', '—']].concat(App.comp.layers.filter(x => x.type === 'text').map(x => [x.id, x.name])), it.source || '', v => E('笔画来源', () => { it.source = v; }))), row('模式', selectEl([['strokes', '笔画骨架（逐笔）'], ['outline', '字形轮廓']], it.mode || 'strokes', v => E('笔画模式', () => { it.mode = v; }))));
    return w.children.length ? w : null;
  }
  function propRow(L, key, info) {
    const p = L.props[key]; if (!p) return h('div');
    const anim = Model.isAnimated(p); const exprOn = Model.hasExpr(p); const err = App.ev.errorOf(L, key);
    const ed = PropUI.editor(L, key, {}); editors.push(ed);
    const r = h('div', { class: 'prow' + (App.isPropSel(L.id, key) ? ' sel' : ''), 'data-lid': L.id, 'data-key': key },
      h('div', { class: 'sw' + (anim ? ' on' : ''), title: anim ? '清除动画' : '启用动画（在当前时间创建关键帧）', onclick: () => Actions.toggleStopwatch(L, key) }),
      h('div', { class: 'lbl', text: (info && info.label) || key, title: key, onclick: e => App.selectProp(L.id, key, e.shiftKey) }), ed.el,
      h('div', { class: 'eq' + (err ? ' err' : exprOn ? ' on' : ''), title: err || (exprOn ? '表达式（点击编辑）' : '添加表达式'), text: err ? '!' : '=', onclick: () => { App.selectProp(L.id, key); openExpr(L.id, key); } }));
    return r;
  }

  // ----- 文字 -----
  function textPanel(L) {
    const F = AE.Font; const ta = h('textarea', { 'data-role': 'text', rows: 3, style: { width: '100%', resize: 'vertical', fontSize: '14px' }, oninput: e => { L.text.text = e.target.value; App.changed('values'); }, onchange: () => { App.changed('struct'); App.commit('修改文字内容'); } }); ta.value = L.text.text;
    const content = h('div', null, h('div', { style: { padding: '4px 8px' } }, ta),
      row('字体', selectEl(F.FONTS.map(f => [f.id, f.name]), L.text.font || 'forge', v => E('字体', () => { L.text.font = v; }))),
      row('对齐', selectEl([['left', '左对齐'], ['center', '居中'], ['right', '右对齐']], L.text.align || 'center', v => E('对齐', () => { L.text.align = v; }))),
      h('div', { class: 'muted', style: { padding: '2px 8px', fontSize: '11px' }, text: '内置字库：' + F.strokeChars.length + ' 字；其余字符使用系统字体轮廓（帮助 ▸ 字体与字符范围）' }),
      h('div', { class: 'row', style: { padding: '4px 8px', gap: '6px', flexWrap: 'wrap' } }, h('button', { class: 'btn sm', text: '+ 文字动画制作工具', onclick: () => E('添加动画制作工具', () => { Model.addAnimator(L, {}); }) }), h('button', { class: 'btn sm', text: '转为三维实体', onclick: () => Actions.toSolid(L) })));
    for (const a of L.animators || []) content.append(h('div', { class: 'item-row' }, h('span', { class: 'nm', text: a.name }), selectEl([['char', '按字符'], ['word', '按词'], ['line', '按行']], a.basedOn, v => E('动画基于', () => { a.basedOn = v; })), h('button', { class: 'btn sm danger', text: '×', onclick: () => E('删除动画制作工具', () => { L.animators = L.animators.filter(x => x !== a); for (const k of Object.keys(L.props)) if (k.startsWith(`an.${a.id}.`)) delete L.props[k]; }) })));
    return sec('textdoc', '文字内容', content, true);
  }
  // ----- 形状：添加项 -----
  function shapeAddPanel(L) {
    return sec('shapeadd', '形状内容管理', h('div', { class: 'row', style: { padding: '6px 8px', gap: '6px', flexWrap: 'wrap' } },
      h('button', { class: 'btn sm', text: '+ 添加 ▾', onclick: e => { const r = e.target.getBoundingClientRect(); const mk = (t) => ({ label: Model.SHAPE_ITEMS[t].name, fn: () => Actions.addShapeItem(L, t) }); UI.menu([{ head: '路径生成器' }, mk('rect'), mk('ellipse'), mk('star'), mk('path'), mk('glyphs'), { head: '修改器（自上而下依次作用）' }, mk('trim'), mk('repeater'), mk('merge'), mk('offset'), { head: '绘制' }, mk('fill'), mk('stroke'), { sep: true }, { label: '新建组', fn: () => { const g = Model.addShapeItem(L, 'group', null, { name: '形状组 ' + (L.shape.items.length + 1) }); App.changed('struct'); App.commit('新建组'); } }], r.left, r.bottom); } }),
      h('button', { class: 'btn sm', text: '转为三维实体', onclick: () => Actions.toSolid(L) }),
      h('span', { class: 'muted', style: { fontSize: '11px' }, text: '修改器作用于其上方的路径；▲▼ 调整顺序会得到不同结果' })), true);
  }
  // ----- 几何 -----
  function geoPanel(L) {
    const p = App.project; const outs = p.graph.nodes.filter(n => ND()[n.nodeType].outputs.some(o => o.type === 'geo') && n.nodeType !== 'src.shape' || n.nodeType === 'output');
    const content = h('div', null,
      row('显示节点', selectEl([['', '— 未选择 —']].concat(p.graph.nodes.filter(n => ND()[n.nodeType].outputs.some(o => o.type === 'geo')).map(n => [n.id, n.name])), L.geo.node || '', v => E('几何来源', () => { L.geo.node = v || null; }))),
      row('阴影', h('div', { class: 'row', style: { gap: '10px' } }, checkEl(L.geo.cast !== false, v => E('投射阴影', () => { L.geo.cast = v; }, 'values'), '投射'), checkEl(L.geo.receive !== false, v => E('接收阴影', () => { L.geo.receive = v; }, 'values'), '接收'))),
      row('点选', checkEl(L.geo.pick !== false, v => E('可选中', () => { L.geo.pick = v; }, 'values'), '可被点选')),
      h('div', { class: 'row', style: { padding: '4px 8px', gap: '6px' } }, h('button', { class: 'btn sm', text: '在节点编辑器中查看', onclick: () => { AE.Bottom && AE.Bottom.show('nodes'); if (L.geo.node) { App.sel.node = L.geo.node; App.sel.nodes = [L.geo.node]; AE.NodeEditor && AE.NodeEditor.focusNode(L.geo.node); } } })));
    return sec('geosrc', '三维几何', content, true);
  }
  const ND = () => AE.NodeDefs;
  // ----- 粒子 -----
  function particlePanel(L) {
    const p = App.project; const ps = L.ps; const nodes = p.graph.nodes;
    const w = h('div');
    w.append(row('随机种子', UI.num({ value: ps.seed, step: 1, prec: 0, onChange: (v, ph) => { ps.seed = Math.round(v); App.changed('values'); if (ph === 'end') App.commit('随机种子'); } })), row('最大粒子数', UI.num({ value: ps.max, step: 100, min: 100, max: 6000, prec: 0, onChange: (v, ph) => { ps.max = Math.round(v); App.changed('values'); if (ph === 'end') App.commit('最大粒子数'); } })), row('混合', selectEl([['add', '相加（发光）'], ['normal', '正常']], ps.blend, v => E('粒子混合', () => { ps.blend = v; }))), row('场力增益', UI.num({ value: ps.fieldGain || 1, step: 0.1, min: 0, onChange: (v, ph) => { ps.fieldGain = v; App.changed('values'); if (ph === 'end') App.commit('场力增益'); } })));
    const secOf = (title, list, addFn, rowFn) => sec(L.id + title, title, h('div', null, list.map(rowFn), h('div', { class: 'row', style: { padding: '4px 8px' } }, h('button', { class: 'btn sm', text: '+ 添加', onclick: addFn }))), true);
    out: {
      w.append(secOf('发射器', ps.emitters, () => E('添加发射器', () => { Model.addEmitter(L, {}); }), em => h('div', { class: 'kv', style: { borderBottom: '1px solid var(--line)' } }, h('label', { text: em.name }), h('div', { class: 'row' }, selectEl([['point', '点'], ['node', '几何表面']], em.kind, v => E('发射源类型', () => { em.kind = v; })), h('button', { class: 'btn sm danger', text: '×', onclick: () => E('删除发射器', () => { ps.emitters = ps.emitters.filter(x => x !== em); for (const k of Object.keys(L.props)) if (k.startsWith(`em.${em.id}.`)) delete L.props[k]; }) })),
        ...(em.kind === 'node' ? [h('label', { text: '发射节点' }), selectEl([['', '—']].concat(nodes.filter(n => n.nodeType === 'emitter').map(n => [n.id, n.name])), em.node || '', v => E('发射节点', () => { em.node = v || null; })), h('label', { text: '区域场' }), selectEl([['', '全部表面']].concat(nodes.filter(n => n.nodeType.startsWith('field.') || n.nodeType === 'field.mix').map(n => [n.id, n.name])), em.field || '', v => E('发射区域场', () => { em.field = v || null; }))] : []))));
      w.append(secOf('力', ps.forces, () => { const r = event_btn(); UI.menu([{ label: '方向力', fn: () => E('添加力', () => Model.addForce(L, 'directional', { dir: [1, 0, 0], strength: 200 })) }, { label: '吸引 / 排斥', fn: () => E('添加力', () => Model.addForce(L, 'attract', { strength: 800 })) }, { label: '湍流', fn: () => E('添加力', () => Model.addForce(L, 'turbulence', { strength: 300, radius: 160 })) }, { label: '场力（来自场节点）', fn: () => E('添加力', () => Model.addForce(L, 'field', { strength: 600 })) }], r.x, r.y); }, f => h('div', { class: 'kv', style: { borderBottom: '1px solid var(--line)' } }, h('label', { text: f.name }), h('div', { class: 'row' }, f.type === 'field' ? selectEl([['', '— 选择场节点 —']].concat(nodes.filter(n => n.nodeType.startsWith('field.')).map(n => [n.id, n.name])), f.node || '', v => E('力场节点', () => { f.node = v || null; })) : h('span', { class: 'muted', text: f.type }), h('button', { class: 'btn sm danger', text: '×', onclick: () => E('删除力', () => { ps.forces = ps.forces.filter(x => x !== f); for (const k of Object.keys(L.props)) if (k.startsWith(`fc.${f.id}.`)) delete L.props[k]; }) })))));
      w.append(secOf('碰撞体', ps.colliders, () => E('添加碰撞体', () => Model.addCollider(L, {})), cl => h('div', { class: 'kv', style: { borderBottom: '1px solid var(--line)' } }, h('label', { text: cl.name }), h('div', { class: 'row' }, selectEl([['node', '碰撞节点'], ['layer', '三维几何图层']], cl.kind, v => E('碰撞体类型', () => { cl.kind = v; })), h('button', { class: 'btn sm danger', text: '×', onclick: () => E('删除碰撞体', () => { ps.colliders = ps.colliders.filter(x => x !== cl); }) })), h('label', { text: '目标' }), cl.kind === 'node' ? selectEl([['', '—']].concat(nodes.filter(n => n.nodeType === 'collider').map(n => [n.id, n.name])), cl.node || '', v => E('碰撞节点', () => { cl.node = v || null; })) : selectEl([['', '—']].concat(App.comp.layers.filter(x => x.type === 'geo').map(x => [x.id, x.name])), cl.layer || '', v => E('碰撞图层', () => { cl.layer = v || null; })))));
    }
    return sec('psopt', '粒子系统', w, true);
  }
  const event_btn = () => { const e = window.event; return { x: e ? e.clientX : 200, y: e ? e.clientY : 200 }; };
  // ----- 预合成 -----
  function precompPanel(L) {
    const p = App.project; const inner = Model.comp(p, L.comp);
    return sec('precomp', '预合成', h('div', null,
      row('引用合成', selectEl(p.comps.filter(c => c.id !== App.comp.id).map(c => [c.id, c.name]), L.comp, v => E('更换引用合成', () => { L.comp = v; }))),
      row('时间拉伸', UI.num({ value: L.stretch === undefined ? 100 : L.stretch, step: 1, unit: '%', onChange: (v, ph) => { L.stretch = v; App.changed('values'); if (ph === 'end') App.commit('时间拉伸（负值倒放）'); } })),
      row('时间重映射', checkEl(L.remap.on, v => E('时间重映射', () => { L.remap.on = v; if (v) { const p0 = L.props['remap.t']; const innerC = Model.comp(App.project, L.comp); const dur = innerC ? innerC.dur : 5; p0.v = 0; p0.k = [Model.defKey(L.in, 0), Model.defKey(L.out, Math.min(dur, L.out - L.in))]; } }), '启用（可设关键帧：变速/倒放/定格）')),
      row('起始时间', UI.num({ value: L.start, step: 0.05, unit: 's', onChange: (v, ph) => { L.start = v; App.changed('values'); if (ph === 'end') App.commit('起始时间'); } })),
      h('div', { class: 'row', style: { padding: '4px 8px' } }, h('button', { class: 'btn sm', text: '打开该合成', onclick: () => Actions.openComp(L.comp) }))), true);
  }
  // ----- 音色 -----
  function audioPanel(L) {
    const A = AE.Audio; const au = L.au; const voices = A ? A.VOICES : []; const v = voices.find(x => x.id === au.voice) || voices[0];
    const w = h('div', null, row('音色', selectEl(voices.map(x => [x.id, x.name]), au.voice, nv => E('音色', () => { au.voice = nv; au.params = {}; }))));
    if (v) for (const [k, d] of Object.entries(v.params)) w.append(row(d.label, UI.num({ value: au.params[k] !== undefined ? au.params[k] : d.v, step: d.step || 0.01, min: d.min, max: d.max, onChange: (val, ph) => { au.params[k] = val; App.changed('values'); A.invalidate(); if (ph === 'end') App.commit('音色参数'); } })));
    w.append(row('随机种子', UI.num({ value: au.seed || 1, step: 1, prec: 0, onChange: (val, ph) => { au.seed = Math.round(val); App.changed('values'); A.invalidate(); if (ph === 'end') App.commit('音色种子'); } })));
    const evs = h('div'); au.events.forEach((e, i) => evs.append(h('div', { class: 'item-row' }, h('span', { class: 'muted', text: '#' + (i + 1) }), UI.num({ value: e.t, step: 0.05, unit: 's', onChange: (val, ph) => { e.t = Math.max(0, val); App.changed('values'); A.invalidate(); if (ph === 'end') App.commit('事件时间'); } }), UI.num({ value: e.v === undefined ? 1 : e.v, step: 0.05, min: 0, max: 2, title: '力度', onChange: (val, ph) => { e.v = val; App.changed('values'); A.invalidate(); if (ph === 'end') App.commit('事件力度'); } }), UI.num({ value: e.p === undefined ? 1 : e.p, step: 0.02, min: 0.25, max: 4, title: '音高倍率', onChange: (val, ph) => { e.p = val; App.changed('values'); A.invalidate(); if (ph === 'end') App.commit('事件音高'); } }), h('button', { class: 'btn sm danger', text: '×', onclick: () => E('删除音频事件', () => { au.events.splice(i, 1); A.invalidate(); }) }))));
    w.append(h('div', { class: 'proj-sec' }, h('span', { text: '触发事件（时间 / 力度 / 音高）' })), evs, h('div', { class: 'row', style: { padding: '4px 8px', gap: '6px' } }, h('button', { class: 'btn sm', text: '+ 在播放头添加事件', onclick: () => E('添加音频事件', () => { au.events.push({ t: App.time, v: 1, p: 1 }); au.events.sort((a, b) => a.t - b.t); A.invalidate(); }) }), h('button', { class: 'btn sm', text: '▶ 试听', onclick: () => A.preview(L) })));
    return sec('audio', '音色参数', w, true);
  }

  // ===== 表达式面板 =====
  function openExpr(layerId, key) { exprTarget = { layer: layerId, key }; refreshExpr(true); }
  function refreshExpr(rebuild) {
    const L = App.layer(exprTarget.layer); if (!L || !L.props[exprTarget.key]) { exprHost.classList.add('hidden'); exprTarget = null; return; }
    const p = L.props[exprTarget.key]; const info = Model.propInfo(L, exprTarget.key);
    if (rebuild || !exprHost._built || exprHost._key !== L.id + exprTarget.key) {
      exprHost.classList.remove('hidden'); exprHost.innerHTML = ''; exprHost._built = true; exprHost._key = L.id + exprTarget.key;
      const ta = h('textarea', { spellcheck: 'false', placeholder: '例如：wiggle(2, 30)    或    thisComp.layer("控制器").transform.rotation * 2', style: { width: '100%', height: '64px', fontFamily: 'var(--mono)', color: '#9fe8f2' } }); ta.value = p.x || '';
      const en = h('input', { type: 'checkbox', checked: p.xe !== false, onchange: e => { p.xe = e.target.checked; App.changed('struct'); App.commit('表达式开关'); } });
      const apply = () => { const v = ta.value; if (v !== (p.x || '')) { p.x = v; if (p.x.trim() && p.xe === false) p.xe = true; App.changed('struct'); App.commit('编辑表达式'); } };
      ta.addEventListener('keydown', e => { e.stopPropagation(); if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { apply(); ta.blur(); } });
      ta.addEventListener('blur', apply);
      exprHost.append(h('div', { class: 'row', style: { padding: '4px 8px', background: 'var(--bg2)', gap: '8px' } }, h('b', { text: '表达式' }), h('span', { class: 'muted', text: L.name + ' · ' + (info.label || exprTarget.key) }), h('label', { class: 'row', style: { marginLeft: 'auto' } }, en, '启用'), h('button', { class: 'btn sm', text: '清除', onclick: () => { p.x = ''; App.changed('struct'); App.commit('清除表达式'); } }), h('button', { class: 'btn sm', text: '×', onclick: () => { exprTarget = null; exprHost.classList.add('hidden'); } })), h('div', { style: { padding: '4px 8px' } }, ta, h('div', { class: 'expr-err', id: 'exprErr' }), h('div', { class: 'muted', style: { fontSize: '11px' }, text: 'time · value · wiggle(频率,幅度) · loopOut("cycle"|"pingpong") · linear/ease(t,a,b,c,d) · valueAtTime(t) · thisComp.layer("名称").transform.position[0]　（Ctrl+Enter 应用）' })));
    }
    const err = App.ev.errorOf(L, exprTarget.key); const el = exprHost.querySelector('#exprErr'); if (el) el.textContent = err ? '⚠ ' + err + '（已退回关键帧值）' : (Model.hasExpr(p) ? '当前值：' + JSON.stringify((() => { const v = App.val(L, exprTarget.key); return Array.isArray(v) ? v.map(x => typeof x === 'number' ? +x.toFixed(3) : x) : (typeof v === 'number' ? +v.toFixed(3) : v); })()) : '');
  }
})();
