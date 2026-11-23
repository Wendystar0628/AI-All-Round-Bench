// 属性面板 + 项目面板。属性行（秒表/数值/关键帧导航/表达式）在时间轴与属性面板中复用
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const App = MF.App, h = MF.h, W = MF.W, C = MF.Cmd, A = MF.Anim, Model = MF.Model;
  const V = (p) => MF.Eval.val(p, App.time);

  // ---------- 属性行控件（共用）----------
  const PR = (MF.PropRow = {
    // 返回 { els:[...], refresh() }：数值/颜色/路径控件
    valueEls(desc, L, opts) {
      const prop = desc.prop, meta = desc.meta, type = meta.type; const els = []; const refs = []; opts = opts || {};
      const cur = () => { const v = V(prop); return v; };
      const base = () => A.value(prop, App.time, meta);
      const begin = () => App.beginDrag('修改 ' + desc.label), end = () => App.endDrag();
      const cls = () => (prop.x && prop.xOn !== false ? 'expr' : prop.k ? 'keyed' : '');
      if (type === 'num') { const el = W.num({ meta, get: () => cur(), set: (v) => { const d = v - cur(); App.setProp(prop, meta, base() + d); App.changed(); }, begin, end, cls: cls() }); els.push(el); refs.push(el); }
      else if (type === 'vec2' || type === 'vec3') {
        const n = Model.dims(meta, prop); const full = type === 'vec3' ? 3 : 2;
        for (let i = 0; i < n; i++) { const el = W.num({ meta, title: 'XYZ'[i], get: () => cur()[i] || 0, set: (v) => { const b = base().slice(); while (b.length < full) b.push(type === 'vec3' && meta.key === 'scale' ? 100 : 0); const d = v - (cur()[i] || 0); if (meta.link && opts.linked && opts.linked()) { const k = b[i] ? (b[i] + d) / b[i] : 1; for (let j = 0; j < n; j++) b[j] = j === i ? b[j] + d : b[j] * k; } else b[i] += d; App.setProp(prop, meta, b); App.changed(); }, begin, end, cls: cls() }); els.push(el); refs.push(el); }
      } else if (type === 'color') {
        const el = W.color({ get: () => cur(), set: (c) => { App.setProp(prop, meta, c); App.changed(); }, begin, end }); els.push(el); refs.push(el);
        if (!opts.compact) { const al = W.num({ meta: { min: 0, max: 100, step: 1 }, title: 'Alpha %', get: () => (cur()[3] === undefined ? 1 : cur()[3]) * 100, set: (v) => { const c = base().slice(); c[3] = v / 100; App.setProp(prop, meta, c); App.changed(); }, begin, end }); al.style.maxWidth = '44px'; els.push(al, h('span', { class: 'unit' }, 'α%')); refs.push(al); }
      } else if (type === 'path') {
        const info = h('span', { class: 'unit', style: { flex: '1', fontSize: '11px' } }); const upd = () => { const pv = cur(); let n = 0, cc = 0; if (pv && pv.c) { cc = pv.c.length; for (const c of pv.c) n += c.v.length; } else if (pv && pv.flat) { cc = pv.flat.length; for (const c of pv.flat) n += c.pts.length >> 1; } info.textContent = cc + ' 轮廓 · ' + n + ' 点' + (pv && pv.flat ? '（形变中）' : ''); }; upd(); info._refresh = upd; els.push(info); refs.push(info);
        if (!opts.compact) els.push(h('span', { class: 'chip', title: '把当前时刻的路径设为一段文字的字形轮廓（配合关键帧可做字形间的路径形变）', onclick: () => W.modal('用文字轮廓设置路径', [{ key: 'str', label: '文字', type: 'text', value: '回' }, { key: 'font', label: '字体', type: 'select', value: 'hei', options: MF.Fonts.list.map((f) => [f.id, f.label]) }, { key: 'size', label: '字号', type: 'number', value: 400 }], (v) => C.pathFromText(prop, meta, v.str || '回', v.font, +v.size || 400)) }, '文字轮廓…'));
      }
      if (meta.unit && !opts.compact) els.push(h('span', { class: 'unit' }, meta.unit));
      return { els, refresh() { for (const r of refs) { if (r._refresh) r._refresh(); if (r.classList && r.classList.contains('num')) { r.classList.toggle('expr', !!(prop.x && prop.xOn !== false)); r.classList.toggle('keyed', !!prop.k && !(prop.x && prop.xOn !== false)); } } } };
    },
    stopwatch(desc, L) { const prop = desc.prop; const el = h('span', { class: 'sw' + (prop.k ? ' on' : ''), title: '秒表：开启/关闭关键帧动画（Alt+单击 添加表达式）' }); el.addEventListener('click', (e) => { e.stopPropagation(); if (e.altKey) C.toggleExpr(prop, desc.meta); else C.toggleStopwatch(prop, desc.meta); }); void L; return el; },
    keyNav(desc) {
      const prop = desc.prop; const box = h('span', { class: 'knav' }); if (!prop.k) return box;
      const kd = h('span', { class: 'kd', title: '在当前时间添加/移除关键帧' });
      const go = (dir) => { const t = App.time; let best = null; for (const k of prop.k) if (dir > 0 ? k.t > t + 1e-4 : k.t < t - 1e-4) { if (best === null || (dir > 0 ? k.t < best : k.t > best)) best = k.t; } if (best !== null) { App.pause(); App.setTime(best, { exact: true }); } };
      box.append(h('i', { title: '上一个关键帧', onclick: (e) => { e.stopPropagation(); go(-1); } }, '◀'), kd, h('i', { title: '下一个关键帧', onclick: (e) => { e.stopPropagation(); go(1); } }, '▶'));
      kd.addEventListener('click', (e) => { e.stopPropagation(); C.toggleKey(prop, desc.meta); });
      box._refresh = () => kd.classList.toggle('on', A.keyAt(prop, App.time) >= 0); box._refresh(); return box;
    },
    exprBtn(desc) { const prop = desc.prop; const err = MF.Eval.errorOf(prop); const b = h('span', { class: 'exb' + (prop.x !== undefined && prop.xOn !== false ? ' on' : '') + (err ? ' err' : ''), title: err ? '表达式错误：' + err : prop.x !== undefined ? '表达式（单击启停，在属性面板编辑）' : '添加表达式' }, '='); b.addEventListener('click', (e) => { e.stopPropagation(); C.toggleExpr(prop, desc.meta); }); return b; },
  });

  // ---------- 属性面板 ----------
  const Props = (MF.Props = {
    refs: [],
    init(panel) {
      Props.panel = panel; Props.body = panel._body; Props.hint = h('span', { class: 'hint' }); panel._head.append(h('span', { class: 'sp' }), Props.hint);
      const rebuild = () => Props.rebuild();
      App.on('selection', rebuild); App.on('project', (o) => { if (o && o.live) Props.refresh(); else rebuild(); }); App.on('time', () => Props.refresh());
      App.on('focusText', (id) => { setTimeout(() => { const ta = Props.body.querySelector('textarea.txt'); if (ta && App.sel.layers[0] === id) { ta.focus(); ta.select(); } }, 30); });
    },
    refresh() { for (const r of Props.refs) r(); },
    rebuild() {
      const body = Props.body; const st = body.scrollTop; const act = document.activeElement; if (act && body.contains(act) && (act.tagName === 'TEXTAREA' || (act.tagName === 'INPUT' && !act.readOnly && act.type === 'text'))) { Props._pending = true; return; }
      Props._pending = false; body.innerHTML = ''; Props.refs = [];
      const c = App.comp(); const root = h('div', { class: 'props' }); body.appendChild(root);
      if (!App.project || !App.project.comps.length || !c) { Props.hint.textContent = ''; body.appendChild(h('div', { class: 'empty' }, h('b', null, '空工程'), '还没有合成。', h('button', { class: 'btn pri', onclick: () => MF.Shell.compDialog(null) }, '新建合成 (Ctrl+N)'), h('button', { class: 'btn', onclick: () => MF.Demo.load() }, '载入示例「锻字」'))); return; }
      const keyRefs = C.selectedKeyRefs(); if (keyRefs.length) Props.keyInfo(root, keyRefs);
      const N = MF.Nodes; const nodes = App.sel.nodes.map((id) => N.findDeep(c, id)).filter(Boolean);
      const layers = App.selLayers();
      if (nodes.length) { Props.hint.textContent = nodes.length > 1 ? '已选择 ' + nodes.length + ' 个节点' : '节点 · ' + nodes[0].name; for (const n of nodes.slice(0, 4)) Props.nodeUI(root, c, n); if (layers.length === 1) Props.layerUI(root, c, layers[0], true); }
      else if (layers.length === 1) { Props.hint.textContent = MF.Schema.layerTypes[layers[0].type] + ' · ' + layers[0].name; Props.layerUI(root, c, layers[0]); }
      else if (layers.length > 1) { Props.hint.textContent = '已选择 ' + layers.length + ' 个图层'; Props.multiUI(root, c, layers); }
      else { Props.hint.textContent = '未选择 · 合成设置'; Props.compUI(root, c); }
      body.scrollTop = st;
    },
    group(parent, title, open, extra, key) {
      const k = 'pp:' + (key || title); const isOpen = App.ui.expanded[k] === undefined ? open !== false : App.ui.expanded[k];
      const tw = h('span', { class: 'tw' }, isOpen ? '▼' : '▶'); const head = h('div', { class: 'pgh' }, tw, h('b', null, title), h('span', { class: 'sp' }), extra || null); const content = h('div'); content.style.display = isOpen ? '' : 'none';
      head.addEventListener('click', (e) => { if (e.target.closest('.gbtn,.chip,select,input')) return; const o = content.style.display === 'none'; content.style.display = o ? '' : 'none'; tw.textContent = o ? '▼' : '▶'; App.ui.expanded[k] = o; });
      const g = h('div', { class: 'pg' }, head, content); parent.appendChild(g); return content;
    },
    row(parent, label, ...els) { const r = h('div', { class: 'pr' }, h('span', { class: 'sw dis' }), h('span', { class: 'lb' }, label), h('div', { class: 'vals' }, els)); parent.appendChild(r); return r; },
    // 一行可动画属性
    propRow(parent, desc, L, opts) {
      const prop = desc.prop; const pid = App.pid(L ? L.id : '', desc.id); const sel = App.sel.props.includes(pid);
      const ve = PR.valueEls(desc, L, opts); const kn = PR.keyNav(desc);
      const lb = h('span', { class: 'lb', title: desc.label + (desc.meta.hint ? '\n' + desc.meta.hint : '') }, desc.label);
      const r = h('div', { class: 'pr' + (sel ? ' sel' : '') }, PR.stopwatch(desc, L), lb, h('div', { class: 'vals' }, ve.els), kn, PR.exprBtn(desc));
      lb.addEventListener('click', (e) => App.selectProps([pid], e.shiftKey || e.ctrlKey));
      parent.appendChild(r); Props.refs.push(() => { ve.refresh(); if (kn._refresh) kn._refresh(); });
      if (prop.x !== undefined) Props.exprEditor(parent, desc);
      return r;
    },
    exprEditor(parent, desc) {
      const prop = desc.prop; const ta = h('textarea', { spellcheck: false, placeholder: '表达式，例如 wiggle(3, 20) 或 thisComp.layer("控制器").transform.rotation' }); ta.value = prop.x || '';
      const msg = h('div'); const upd = () => { const e = prop.xOn === false ? null : MF.Eval.errorOf(prop); msg.className = e ? 'emsg' : 'ok'; msg.textContent = e ? '⚠ ' + e : prop.xOn === false ? '表达式已停用（使用关键帧值）' : '表达式生效中 · Ctrl+Enter 应用'; };
      // 先求值一次，得到错误状态
      try { MF.Eval.val(prop, App.time); } catch (e) { /* 已记录 */ } upd();
      const apply = () => { if (ta.value !== (prop.x || '')) C.setExpr(prop, ta.value); else if (Props._pending) Props.rebuild(); };
      ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ta.blur(); } if (e.key === 'Escape') { ta.value = prop.x || ''; ta.blur(); } });
      ta.addEventListener('blur', () => setTimeout(apply, 0));
      const rm = h('span', { class: 'chip', onclick: () => C.setExpr(prop, null) }, '移除表达式');
      parent.appendChild(h('div', { class: 'exed' }, ta, h('div', { style: { display: 'flex', gap: '6px', alignItems: 'flex-start', marginTop: '3px' } }, h('div', { style: { flex: '1' } }, msg), rm)));
      Props.refs.push(() => { try { MF.Eval.val(prop, App.time); } catch (e) { /* 已记录 */ } upd(); });
    },
    staticUI(parent, c, obj, statics, label) {
      for (const s of statics || []) {
        let el; const set = (v) => App.edit('修改 ' + s.label, () => { obj.s[s.key] = v; });
        if (s.kind === 'enum') el = W.select(s.options, obj.s[s.key], set);
        else if (s.kind === 'bool') { const inp = h('input', { type: 'checkbox', checked: !!obj.s[s.key] }); inp.addEventListener('change', () => set(inp.checked)); el = h('label', { class: 'chk' }, inp, ''); }
        else if (s.kind === 'layer') { const opts = [[null, '（无）']].concat(c.layers.filter((l) => !s.options || s.options.includes(l.type)).map((l) => [l.id, l.name])); el = W.select(opts, obj.s[s.key], set); }
        else if (s.kind === 'font') el = W.select(MF.Fonts.list.map((f) => [f.id, f.label]), obj.s[s.key], set);
        else if (s.kind === 'text') { el = h('input', { class: 'sel', type: 'text', value: obj.s[s.key], style: { userSelect: 'text', padding: '0 6px' } }); el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') el.blur(); }); el.addEventListener('change', () => set(el.value)); }
        if (el) Props.row(parent, s.label, el);
      }
      void label;
    },
    objHeader(c, L, n) { // 组标题右侧：上移/下移/删除/启用
      if (!n.obj || !n.objKind || ['text', 'light', 'geo', 'ps', 'audio', 'precompSrc', 'node'].includes(n.objKind)) return null;
      const box = h('span', { style: { display: 'flex', gap: '1px', alignItems: 'center' } });
      if (n.obj.on !== undefined) { const cb = h('input', { type: 'checkbox', checked: n.obj.on !== false, title: '启用', style: { accentColor: '#ff6a2b', margin: '0 4px 0 0' } }); cb.addEventListener('change', () => App.edit('启用/停用', () => { n.obj.on = cb.checked; })); box.appendChild(cb); }
      box.append(h('span', { class: 'gbtn', title: '上移', onclick: () => C.moveObj(L, n.objKind, n.obj.id, -1) }, '↑'), h('span', { class: 'gbtn', title: '下移', onclick: () => C.moveObj(L, n.objKind, n.obj.id, 1) }, '↓'), h('span', { class: 'gbtn', title: '删除', onclick: () => C.removeObj(L, n.objKind, n.obj.id) }, '×'));
      return box;
    },
    // ---------- 单个图层 ----------
    layerUI(root, c, L, compact) {
      const tree = Model.propTree(App.project, c, L);
      if (!compact) {
        const g = Props.group(root, '图层', true, null, 'layer');
        const name = h('input', { class: 'sel', type: 'text', value: L.name, style: { userSelect: 'text', padding: '0 6px' } }); name.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') name.blur(); }); name.addEventListener('change', () => App.edit('重命名图层', () => { L.name = name.value || L.name; }));
        Props.row(g, '名称', name);
        const tnum = (key, label) => { const el = W.num({ meta: { step: 0.01 }, get: () => L[key], set: (v) => { L[key] = v; App.changed(); }, begin: () => App.beginDrag('修改' + label), end: () => App.endDrag() }); return el; };
        if (L.type !== 'audio') Props.row(g, '入点 / 出点', tnum('in', '入点'), tnum('out', '出点'), h('span', { class: 'unit' }, 's'));
        else Props.row(g, '入点 / 出点', tnum('in', '入点'), tnum('out', '出点'), h('span', { class: 'unit' }, 's'));
        if (L.type === 'precomp' || L.type === 'audio') Props.row(g, '起始时间', tnum('start', '起始时间'), h('span', { class: 'unit' }, 's'));
        if (!['camera', 'light', 'audio', 'null'].includes(L.type)) {
          if (!MF.Scene.is3DLayer(L) && L.type !== 'adjust') { Props.row(g, '混合模式', W.select(MF.Schema.blends, L.blend, (v) => App.edit('混合模式', () => { L.blend = v; }))); Props.row(g, '轨道遮罩', W.select(MF.Schema.mattes, L.matte || 'none', (v) => App.edit('轨道遮罩', () => { L.matte = v; })), h('span', { class: 'unit', title: '使用紧邻上方的图层作为遮罩' }, '↑上层')); }
          const sw = h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } });
          const cb = (label, get, set, dis) => { const inp = h('input', { type: 'checkbox', checked: get(), disabled: !!dis }); inp.addEventListener('change', () => App.edit(label, () => set(inp.checked))); return h('label', { class: 'chk' }, inp, label); };
          if (['shape', 'text', 'precomp'].includes(L.type)) sw.appendChild(cb('三维图层', () => L.is3D, (v) => (L.is3D = v)));
          sw.appendChild(cb('运动模糊', () => L.mb, (v) => (L.mb = v)));
          if (L.is3D && ['shape', 'text', 'precomp'].includes(L.type)) sw.appendChild(cb('接受阴影', () => !!L.receiveShadow, (v) => (L.receiveShadow = v)));
          Props.row(g, '开关', sw);
        }
        if (L.type === 'null') { const inp = h('input', { type: 'checkbox', checked: L.is3D }); inp.addEventListener('change', () => App.edit('三维图层', () => { L.is3D = inp.checked; })); Props.row(g, '开关', h('label', { class: 'chk' }, inp, '三维图层')); }
        if (L.type !== 'audio') Props.row(g, '父级', W.select([[null, '（无）']].concat(c.layers.filter((l) => l.id !== L.id && l.type !== 'audio' && !MF.Scene.wouldCycle(c, L, l.id)).map((l) => [l.id, l.name])), L.parent, (v) => C.setParent(L, v)));
        Props.typeUI(g, c, L);
      }
      for (const n of tree) Props.treeNode(root, c, L, n, compact);
      // 添加按钮
      if (!compact) {
        const bar = h('div', { class: 'rowbtns' });
        if (L.type === 'shape') for (const k of Object.keys(MF.Schema.shape)) bar.appendChild(h('span', { class: 'chip', onclick: () => C.addShapeItem(L, k, k === 'path' ? { path: MF.Path.star(5, 120, 50, 0, 0, 0) } : null) }, '+ ' + MF.Schema.shape[k].label));
        if (bar.children.length) { root.appendChild(h('div', { class: 'note' }, '形状内容自上而下求值：路径 → 修剪/重复器/合并（顺序可调，结果随之改变）→ 描边/填充。')); root.appendChild(bar); }
      }
    },
    typeUI(g, c, L) {
      if (L.type === 'text') {
        const ta = h('textarea', { class: 'txt', rows: 2, spellcheck: false }); ta.value = L.text.s.str; ta.addEventListener('keydown', (e) => e.stopPropagation()); ta.addEventListener('input', () => { if (!App._drag) App.beginDrag('编辑文字'); L.text.s.str = ta.value; App.changed(); warn(); }); ta.addEventListener('blur', () => App.endDrag());
        g.appendChild(h('div', { style: { padding: '4px 8px' } }, ta));
        const wn = h('div', { class: 'note warn' }); const warn = () => { const miss = Array.from(new Set(Array.from(L.text.s.str).filter((ch) => ch !== '\n' && ch !== ' ' && ch !== '　' && !MF.Fonts.has(L.text.s.font, ch)))); wn.style.display = miss.length ? '' : 'none'; wn.textContent = miss.length ? '当前字体缺少字符：' + miss.join(' ') + '（显示为方框）' : ''; }; warn(); g.appendChild(wn);
        Props.row(g, '字体', W.select(MF.Fonts.list.map((f) => [f.id, f.label + ' · ' + f.count + ' 字']), L.text.s.font, (v) => App.edit('字体', () => { L.text.s.font = v; })));
        Props.row(g, '对齐', W.select([['left', '左对齐'], ['center', '居中'], ['right', '右对齐']], L.text.s.align, (v) => App.edit('对齐', () => { L.text.s.align = v; })));
        g.appendChild(h('div', { class: 'rowbtns' }, h('span', { class: 'chip', onclick: () => C.addAnimator(L) }, '+ 文字动画器'), h('span', { class: 'chip', onclick: () => C.textToShape() }, '字形 → 形状路径')));
      } else if (L.type === 'light') {
        Props.row(g, '灯光类型', W.select([['parallel', '平行光'], ['point', '点光源']], L.light.s.kind, (v) => App.edit('灯光类型', () => { L.light.s.kind = v; })));
        const inp = h('input', { type: 'checkbox', checked: !!L.light.s.shadows }); inp.addEventListener('change', () => App.edit('投射阴影', () => { L.light.s.shadows = inp.checked; })); Props.row(g, '阴影', h('label', { class: 'chk' }, inp, '投射阴影（平行光）'));
      } else if (L.type === 'geo') {
        const mk = (key, label) => { const inp = h('input', { type: 'checkbox', checked: !!L.geo.s[key] }); inp.addEventListener('change', () => App.edit(label, () => { L.geo.s[key] = inp.checked; })); return h('label', { class: 'chk' }, inp, label); };
        Props.row(g, '阴影', h('div', { style: { display: 'flex', gap: '10px' } }, mk('cast', '投射'), mk('receive', '接收')));
        const term = MF.Nodes.terminalOf(c, L.id); const geo = MF.Nodes.layerGeo(c, L, App.time);
        const info = h('div', { class: 'note' }); const upd = () => { const gg = MF.Nodes.layerGeo(c, L, App.time); info.innerHTML = '几何来自节点图：<b>' + (term && term.in.geo ? MF.Nodes.G.describe(gg) : '尚未连接几何') + '</b>'; }; upd(); Props.refs.push(upd); g.appendChild(info); void geo;
        g.appendChild(h('div', { class: 'rowbtns' }, h('span', { class: 'chip', onclick: () => { if (term) { App.selectNodes([term.id]); if (MF.NodeView) MF.NodeView.reveal(term.id); } } }, '在节点视图中定位')));
      } else if (L.type === 'particles') {
        const S = L.ps.s; const set = (k, v) => App.edit('粒子设置', () => { S[k] = v; });
        Props.row(g, '混合', W.select([['add', '相加（发光）'], ['normal', '正常']], S.blend, (v) => set('blend', v)), W.select([['streak', '拉丝'], ['dot', '圆点']], S.shape, (v) => set('shape', v)));
        const nm = (key, label, meta) => W.num({ meta, get: () => +S[key] || 0, set: (v) => { S[key] = v; App.changed(); }, begin: () => App.beginDrag(label), end: () => App.endDrag() });
        Props.row(g, '随机种子', nm('seed', '随机种子', { step: 1 })); Props.row(g, '模拟步频', nm('rate', '模拟步频', { step: 10, min: 30, max: 480 }), h('span', { class: 'unit' }, 'Hz')); Props.row(g, '数量上限', nm('maxCount', '数量上限', { step: 100, min: 10 }));
        const fl = h('input', { type: 'checkbox', checked: !!S.floor }); fl.addEventListener('change', () => set('floor', fl.checked)); Props.row(g, '地面平面', h('label', { class: 'chk' }, fl, 'Y ='), nm('floorY', '地面高度', { step: 1 }));
        const info = h('div', { class: 'note' }); const upd = () => { const i = MF.Particles.info(c, L); const inp = MF.Nodes.partInputs(c, L, App.time); info.innerHTML = '模拟：<b>' + (i ? i.count + ' 粒子 · 第 ' + i.step + ' 步 · ' + i.checkpoints + ' 个检查点' : '未运行') + '</b><br>节点输入：发射源 ' + inp.emit.filter(Boolean).length + ' · 碰撞体 ' + inp.collide.length + ' · 力场 ' + inp.fields.length + '（在节点视图中连接）'; }; upd(); Props.refs.push(upd); g.appendChild(info);
        g.appendChild(h('div', { class: 'rowbtns' }, h('span', { class: 'chip', onclick: () => C.addEmitter(L) }, '+ 发射器'), h('span', { class: 'chip', onclick: () => C.addForce(L) }, '+ 吸引/排斥力')));
      } else if (L.type === 'audio') Props.audioUI(g, c, L);
      else if (L.type === 'precomp') {
        const sc = Model.getComp(App.project, L.src.comp); Props.row(g, '源合成', W.select(App.project.comps.filter((x) => x.id !== c.id).map((x) => [x.id, x.name]), L.src.comp, (v) => App.edit('更换源合成', () => { L.src.comp = v; })));
        const inp = h('input', { type: 'checkbox', checked: !!L.src.remapOn }); inp.addEventListener('change', () => C.enableRemap(L)); Props.row(g, '时间重映射', h('label', { class: 'chk' }, inp, '启用（可变速、倒放、定格）'));
        g.appendChild(h('div', { class: 'rowbtns' }, h('span', { class: 'chip', onclick: () => sc && App.openComp(sc.id) }, '打开源合成'), h('span', { class: 'chip', onclick: () => App.edit('倒放', () => { const d = sc ? sc.duration : 1; L.src.remapOn = true; L.remap = { v: 0, k: [A.mkKey(L.in, d - 1 / c.fps), A.mkKey(Math.min(L.out, L.in + d), 0)] }; }) }, '倒放'), h('span', { class: 'chip', onclick: () => App.edit('定格', () => { const tt = MF.Scene.sourceTime(L, App.time); L.src.remapOn = true; L.remap = { v: tt, k: [Object.assign(A.mkKey(App.time, tt), { ot: 'h' })] }; }) }, '定格当前帧')));
      }
    },
    audioUI(g, c, L) {
      const S = L.audio.s; const set = (k, v) => App.edit('音色设置', () => { S[k] = v; });
      const insts = MF.Audio ? MF.Audio.instruments : {}; Props.row(g, '内置音色', W.select(Object.keys(insts).map((k) => [k, insts[k].label]), S.inst, (v) => set('inst', v)));
      const nm = (key, label, meta) => W.num({ meta, get: () => +S[key] || 0, set: (v) => { S[key] = v; App.changed(); }, begin: () => App.beginDrag(label), end: () => App.endDrag() });
      Props.row(g, '起音 / 衰减', nm('attack', '起音', { step: 0.005, min: 0 }), nm('decay', '衰减', { step: 0.01, min: 0.01 }), h('span', { class: 'unit' }, 's'));
      Props.row(g, '音色 / 混响', nm('tone', '音色亮度', { step: 0.01, min: 0, max: 1 }), nm('reverb', '混响', { step: 0.01, min: 0, max: 1 }));
      const box = h('div', { class: 'notes' }); const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']; const nn = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
      S.notes.slice().sort((a, b) => a[0] - b[0]).forEach((n) => { const el = h('span', { class: 'nt', title: '时间 ' + n[0].toFixed(2) + 's · 时值 ' + n[1] + 's · 力度 ' + n[3] + '\n单击删除' }, n[0].toFixed(2) + ' ' + nn(n[2])); el.addEventListener('click', () => App.edit('删除音符', () => { S.notes.splice(S.notes.indexOf(n), 1); })); box.appendChild(el); });
      g.appendChild(h('div', { class: 'note' }, '音符（相对图层起始时间）：' + S.notes.length + ' 个')); g.appendChild(box);
      const pitch = h('input', { class: 'sel', type: 'number', value: 60, style: { maxWidth: '58px', userSelect: 'text' } }), dur = h('input', { class: 'sel', type: 'number', value: 0.5, step: 0.1, style: { maxWidth: '58px', userSelect: 'text' } }), vel = h('input', { class: 'sel', type: 'number', value: 0.8, step: 0.1, style: { maxWidth: '50px', userSelect: 'text' } });
      for (const el of [pitch, dur, vel]) el.addEventListener('keydown', (e) => e.stopPropagation());
      Props.row(g, '音高/时值/力度', pitch, dur, vel);
      g.appendChild(h('div', { class: 'rowbtns' }, h('span', { class: 'chip', onclick: () => App.edit('添加音符', () => { S.notes.push([Math.max(0, +(App.time - (L.start || 0)).toFixed(3)), +dur.value || 0.5, Math.round(+pitch.value) || 60, MF.clamp(+vel.value || 0.8, 0, 1)]); }) }, '+ 在当前时间添加音符'), h('span', { class: 'chip', onclick: () => MF.Audio && MF.Audio.audition(L) }, '试听'), h('span', { class: 'chip', onclick: () => App.edit('清空音符', () => { S.notes = []; }) }, '清空')));
    },
    treeNode(parent, c, L, n, compact) {
      if (n.kind === 'prop') { if (n.disabled) return; Props.propRow(parent, n, n.node && !n.id.startsWith('tr.') && (n.id.startsWith('node.') || n.id.startsWith('pin.')) ? null : L); return; }
      if (!n.children.length && !n.statics) { if (!n.addable) return; if (compact) return; }
      if (compact && n.id !== 'mat' && n.id !== 'tr') return;
      let extra = Props.objHeader(c, L, n);
      if (n.addable === 'effect') extra = h('span', { class: 'chip', onclick: (e) => { const r = e.target.getBoundingClientRect(); W.menu(r.left, r.bottom + 2, Object.keys(MF.Schema.effects).map((k) => ({ label: MF.Schema.effects[k].label, run: () => C.addEffect(k) }))); } }, '+ 添加');
      if (n.addable === 'mask') extra = h('span', { class: 'chip', onclick: () => C.addMask(L, L.type === 'adjust' ? MF.Path.ellipse(c.w * 0.7, c.h * 0.7, c.w / 2, c.h / 2) : (() => { const b = MF.Scene.contentBounds(c, L, App.time); return MF.Path.ellipse((b[2] - b[0]) * 0.8, (b[3] - b[1]) * 0.8, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2); })()) }, '+ 椭圆蒙版');
      if (n.addable === 'animator') extra = h('span', { class: 'chip', onclick: () => C.addAnimator(L) }, '+ 添加');
      if (n.addable === 'emitter') extra = h('span', { class: 'chip', onclick: () => C.addEmitter(L) }, '+ 添加');
      if (n.addable === 'force') extra = h('span', { class: 'chip', onclick: () => C.addForce(L) }, '+ 添加');
      const depthSub = n.id.indexOf('.') > 0; const g = Props.group(parent, n.label, n.id === 'tr' || n.id === 'mat' || n.id === 'text' || depthSub || n.children.length <= 12, extra, L.id + n.id);
      if (depthSub) g.parentNode.classList.add('sub');
      // 可重命名的子对象
      if (n.obj && n.objKind && ['effect', 'mask', 'shapeItem', 'animator', 'emitter', 'force'].includes(n.objKind)) {
        const o = n.obj; const nm = h('input', { class: 'sel', type: 'text', value: o.name, style: { userSelect: 'text', padding: '0 6px' } }); nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); }); nm.addEventListener('change', () => App.edit('重命名', () => { o.name = nm.value || o.name; })); Props.row(g, '名称', nm);
        if (n.objKind === 'mask') { Props.row(g, '模式', W.select([['add', '相加'], ['subtract', '相减'], ['intersect', '交集'], ['none', '无']], o.mode, (v) => App.edit('蒙版模式', () => { o.mode = v; }))); const inv = h('input', { type: 'checkbox', checked: !!o.inverted }); inv.addEventListener('change', () => App.edit('反转蒙版', () => { o.inverted = inv.checked; })); Props.row(g, '反转', h('label', { class: 'chk' }, inv, '反转')); }
        if (n.objKind === 'animator') Props.row(g, '范围依据', W.select([['char', '字符'], ['word', '词'], ['line', '行']], o.s.based, (v) => App.edit('范围依据', () => { o.s.based = v; })));
        if (n.objKind === 'emitter') { Props.row(g, '发射源', W.select([['point', '点'], ['curve', '曲线（节点几何）'], ['surface', '几何表面（节点几何）']], o.s.type, (v) => App.edit('发射源', () => { o.s.type = v; }))); if (o.s.type !== 'point') { Props.row(g, '几何输入序号', W.num({ meta: { step: 1, min: 0 }, get: () => (o.s.src === undefined || o.s.src === null ? L.ps.emitters.indexOf(o) : o.s.src), set: (v) => { o.s.src = Math.round(v); App.changed(); }, begin: () => App.beginDrag('几何输入'), end: () => App.endDrag() }), h('span', { class: 'unit' }, '粒子节点“发射源”端口的第 N 条连线')); if (o.s.type === 'surface') Props.row(g, '发射权重', W.select([['uniform', '均匀'], ['field', '按力场强度（第 1 个场）'], ['speed', '按表面运动速度']], o.s.weight || 'uniform', (v) => App.edit('发射权重', () => { o.s.weight = v; }))); } }
        if (n.objKind === 'force') Props.row(g, '类型', W.select([['attract', '吸引'], ['repel', '排斥']], o.s.kind, (v) => App.edit('力类型', () => { o.s.kind = v; })));
        if (n.statics && n.objKind === 'shapeItem') Props.staticUI(g, c, o, n.statics);
      }
      if (n.objKind === 'node') { Props.staticUI(g, c, n.obj, n.statics); }
      for (const ch of n.children) Props.treeNode(g, c, L, ch, false);
    },
    // ---------- 节点 ----------
    nodeUI(root, c, n) {
      const N = MF.Nodes, d = N.types[n.type]; const g = Props.group(root, '节点 · ' + d.label, true, null, 'node' + n.id);
      const nm = h('input', { class: 'sel', type: 'text', value: n.name, style: { userSelect: 'text', padding: '0 6px' } }); nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); }); nm.addEventListener('change', () => App.edit('重命名节点', () => { n.name = nm.value || n.name; })); Props.row(g, '名称', nm);
      if (n.type === 'groupIn' || n.type === 'groupOut') { const lb = h('input', { class: 'sel', type: 'text', value: n.s.label, style: { userSelect: 'text', padding: '0 6px' } }); lb.addEventListener('keydown', (e) => e.stopPropagation()); lb.addEventListener('change', () => App.edit('端口名称', () => { n.s.label = lb.value; })); Props.row(g, '端口名称', lb); Props.row(g, '端口类型', W.select([['geo', '几何'], ['field', '场'], ['num', '标量'], ['vec', '向量'], ['color', '颜色']], n.s.ptype, (v) => App.edit('端口类型', () => { n.s.ptype = v; }))); }
      else Props.staticUI(g, c, n, d.statics);
      const pg = N.propGroup(n);
      for (const ch of pg.children) { if (ch.pin) continue; const linked = n.in['p:' + ch.meta.key]; if (linked) { const src = N.findDeep(c, linked.n); Props.row(g, ch.label, h('span', { class: 'unit', style: { color: N.typeColor('num') } }, '← 由连线驱动：' + (src ? src.name : '?'))); } else Props.propRow(g, ch, null); }
      if (n.pins) {
        const pgp = Props.group(g, '图钉（' + n.pins.length + '）', true, h('span', { class: 'chip', onclick: () => MF.Tools.setTool('pin') }, '图钉工具'), 'pins' + n.id); pgp.parentNode.classList.add('sub');
        if (!n.pins.length) pgp.appendChild(h('div', { class: 'note' }, '用图钉工具 (Ctrl+P) 在画布的网格上单击放置图钉；拖动移动，Alt 拖动旋转，Shift+Alt 缩放。'));
        for (const pin of n.pins) { const hd = h('div', { class: 'pr' + (App.sel.pin === pin.id ? ' sel' : '') }, h('span', { class: 'sw dis' }), h('span', { class: 'lb wide', style: { color: '#ffd23f' } }, pin.name + '　静止 (' + Math.round(pin.rest[0]) + ', ' + Math.round(pin.rest[1]) + ')'), h('span', { class: 'gbtn', title: '删除图钉', onclick: () => App.edit('删除图钉', () => { n.pins = n.pins.filter((p) => p !== pin); }) }, '×')); hd.addEventListener('click', () => { App.sel.pin = pin.id; App.emit('selection'); }); pgp.appendChild(hd); for (const ch of pg.children) if (ch.pin === pin) Props.propRow(pgp, Object.assign({}, ch, { label: ch.label.replace(pin.name + ' ', '') }), null); }
      }
      // 当前结果
      const info = h('div', { class: 'note' }); const upd = () => { const ctx = N.ctxOf(c, n.id); if (!ctx) return; const ports = N.ports(n); const res = N.evalNode(ctx, n, App.time) || {}; const lines = ports.outs.map((o) => '<b>' + o.label + '</b>（' + N.typeName(o.type) + '）：' + N.G.describe(res[o.key])); const ins = ports.ins.map((i) => { const l = n.in[i.key]; const cnt = !l ? 0 : Array.isArray(l) ? l.length : 1; return i.label + '（' + N.typeName(i.type) + (i.multi ? '·多路' : '') + '）' + (cnt ? ' ← ' + cnt + ' 条连线' : ' 未连接'); }); info.innerHTML = (ins.length ? '输入：' + ins.join('；') + '<br>' : '') + (lines.length ? '当前结果：<br>' + lines.join('<br>') : '（终端节点：结果送往绑定的图层）') + (res._err ? '<br><span style="color:#ff5a5a">求值出错：' + res._err + '</span>' : ''); }; upd(); Props.refs.push(upd); g.appendChild(info);
    },
    // ---------- 多选 ----------
    multiUI(root, c, layers) {
      const g = Props.group(root, '已选择 ' + layers.length + ' 个图层', true, null, 'multi');
      g.appendChild(h('div', { class: 'note' }, layers.map((l) => l.name).join('、')));
      g.appendChild(h('div', { class: 'note' }, '下列变换按相对量同时作用于所有选中图层。'));
      const mk = (key, label, idx, meta) => { const ref = layers[0].tr[key]; return W.num({ meta, get: () => { const v = V(ref); return Array.isArray(v) ? v[idx] : v; }, set: (v) => { const cur = V(ref); const d = v - (Array.isArray(cur) ? cur[idx] : cur); for (const L of layers) { const p = L.tr[key]; const m = MF.Schema.transform.find((x) => x.key === key); const b = A.value(p, App.time, m); if (Array.isArray(b)) { const nb = b.slice(); nb[idx] = (nb[idx] || 0) + d; App.setProp(p, m, nb); } else App.setProp(p, m, b + d); } App.changed(); }, begin: () => App.beginDrag('修改' + label), end: () => App.endDrag() }); };
      Props.row(g, '位置', mk('position', '位置', 0), mk('position', '位置', 1)); Props.row(g, '缩放', mk('scale', '缩放', 0), mk('scale', '缩放', 1), h('span', { class: 'unit' }, '%')); Props.row(g, '旋转', mk('rotation', '旋转', 0), h('span', { class: 'unit' }, '°')); Props.row(g, '不透明度', mk('opacity', '不透明度', 0, { min: 0, max: 100 }), h('span', { class: 'unit' }, '%'));
      Props.refs.push(() => { for (const el of g.querySelectorAll('.num')) if (el._refresh) el._refresh(); });
      g.appendChild(h('div', { class: 'rowbtns' }, h('span', { class: 'chip', onclick: () => MF.Shell.precomposeDialog() }, '预合成…'), h('span', { class: 'chip', onclick: () => C.duplicateLayers() }, '重复'), h('span', { class: 'chip', onclick: () => C.deleteLayers() }, '删除'), h('span', { class: 'chip', onclick: () => C.toggleMB() }, '切换运动模糊')));
    },
    // ---------- 关键帧信息 ----------
    keyInfo(root, refs) {
      const box = h('div', { class: 'kinfo' }); const one = refs.length === 1 ? refs[0] : null;
      box.appendChild(h('h4', null, one ? '关键帧 · ' + one.r.desc.label + ' @ ' + one.key.t.toFixed(3) + 's' : '已选择 ' + refs.length + ' 个关键帧'));
      const bt = (label, mode) => h('span', { class: 'chip', onclick: () => C.ease(mode) }, label);
      box.appendChild(h('div', { class: 'rowbtns', style: { padding: '2px 0 4px' } }, bt('线性', 'linear'), bt('缓动 F9', 'ease'), bt('缓入', 'easeIn'), bt('缓出', 'easeOut'), bt('定格', 'hold')));
      if (one) {
        const k = one.key, meta = one.r.meta; const isSp = !!meta.spatial; const dims = isSp ? 1 : Math.max(1, Model.dims(meta, one.r.prop));
        const types = [['l', '线性'], ['b', '贝塞尔'], ['h', '定格']];
        const setT = (side, v) => App.edit('关键帧插值', () => { if (side === 'it') { k.it = v; if (v === 'b' && k.ii === undefined) { k.ii = 33.333; k.is = dims > 1 ? new Array(dims).fill(0) : 0; } } else { k.ot = v; if (v === 'b' && k.oi === undefined) { k.oi = 33.333; k.os = dims > 1 ? new Array(dims).fill(0) : 0; } } });
        Props.row(box, '进入 / 离开', W.select(types.slice(0, 2), k.it === 'h' ? 'l' : k.it, (v) => setT('it', v)), W.select(types, k.ot, (v) => setT('ot', v)));
        const num = (get, set, meta2) => W.num({ meta: meta2, get, set: (v) => { set(v); App.changed(); }, begin: () => App.beginDrag('关键帧缓动'), end: () => App.endDrag() });
        const sp = (s) => (Array.isArray(s) ? s[0] || 0 : s || 0);
        if (k.it === 'b') Props.row(box, '进入 影响/速度', num(() => (k.ii === undefined ? 33.333 : k.ii), (v) => (k.ii = MF.clamp(v, 0.1, 100)), { min: 0.1, max: 100 }), h('span', { class: 'unit' }, '%'), num(() => sp(k.is), (v) => (k.is = dims > 1 ? new Array(dims).fill(v) : v), {}), h('span', { class: 'unit' }, '/s'));
        if (k.ot === 'b') Props.row(box, '离开 影响/速度', num(() => (k.oi === undefined ? 33.333 : k.oi), (v) => (k.oi = MF.clamp(v, 0.1, 100)), { min: 0.1, max: 100 }), h('span', { class: 'unit' }, '%'), num(() => sp(k.os), (v) => (k.os = dims > 1 ? new Array(dims).fill(v) : v), {}), h('span', { class: 'unit' }, '/s'));
        Props.row(box, '时间', num(() => k.t, (v) => { k.t = Math.max(0, v); A.sort(one.r.prop); }, { step: 0.01, min: 0 }), h('span', { class: 'unit' }, 's'));
        if (isSp) Props.row(box, '空间插值', W.select([['auto', '自动贝塞尔（平滑曲线）'], ['linear', '直线（尖角）'], ['bezier', '贝塞尔（手柄已调整）']], k.sl ? 'linear' : k.to ? 'bezier' : 'auto', (v) => C.spatial(v === 'linear' ? 'linear' : 'auto')), h('span', { class: 'unit' }, k.sc ? '手柄已断开' : ''));
      }
      root.appendChild(box);
    },
    // ---------- 合成（无选择）----------
    compUI(root, c) {
      const g = Props.group(root, '合成 · ' + c.name, true, h('span', { class: 'chip', onclick: () => MF.Shell.compDialog(c) }, '设置…'), 'comp');
      g.appendChild(h('div', { class: 'note', html: '<b>' + c.w + ' × ' + c.h + '</b> · ' + c.fps + ' fps · 时长 ' + c.duration + 's · 工作区 ' + c.workIn.toFixed(2) + '–' + c.workOut.toFixed(2) + 's<br>图层 ' + c.layers.length + ' · 节点 ' + c.nodes.length }));
      const cb = h('input', { type: 'checkbox', checked: !!c.mb.on }); cb.addEventListener('change', () => App.edit('运动模糊总开关', () => { c.mb.on = cb.checked; }));
      const num = (obj, key, meta, label) => W.num({ meta, get: () => +obj[key] || 0, set: (v) => { obj[key] = v; App.changed(); }, begin: () => App.beginDrag(label), end: () => App.endDrag() });
      Props.row(g, '运动模糊', h('label', { class: 'chk' }, cb, '总开关'));
      Props.row(g, '快门角度/相位', num(c.mb, 'angle', { min: 0, max: 720 }, '快门角度'), num(c.mb, 'phase', { min: -360, max: 360 }, '快门相位'), h('span', { class: 'unit' }, '°'));
      Props.row(g, '模糊取样数', num(c.mb, 'samples', { min: 2, max: 64, step: 1 }, '取样数'));
      Props.row(g, '三维环境', W.select([['studio', '影棚'], ['forge', '锻炉'], ['sky', '天空'], ['neutral', '中性灰']], c.env.preset, (v) => App.edit('环境', () => { c.env.preset = v; })));
      Props.row(g, '环境强度/曝光', num(c.env, 'intensity', { min: 0, step: 0.05 }, '环境强度'), num(c.env, 'exposure', { min: 0, step: 0.05 }, '曝光'));
      Props.row(g, '环境旋转', num(c.env, 'rotation', { step: 1 }, '环境旋转'), h('span', { class: 'unit' }, '°'));
      const g2 = Props.group(root, '开始创作', true, null, 'start');
      g2.appendChild(h('div', { class: 'note', html: '未选择图层。可从<b>图层</b>菜单或下方按钮新建，或用工具栏在画布上直接绘制形状、钢笔路径与文字。' }));
      const bar = h('div', { class: 'rowbtns' }); for (const [t, l, o] of [['shape', '形状'], ['text', '文字'], ['null', '空对象'], ['adjust', '调整图层'], ['camera', '摄像机'], ['light', '平行光', { kind: 'parallel', name: '平行光' }], ['light', '点光源', { kind: 'point', name: '点光源' }], ['geo', '三维几何'], ['particles', '粒子'], ['audio', '音色']]) bar.appendChild(h('span', { class: 'chip', onclick: () => C.addLayer(t, o) }, '+ ' + l)); g2.appendChild(bar);
    },
  });

  // ---------- 项目面板 ----------
  MF.ProjectPanel = {
    init(panel) {
      const body = panel._body; const btn = h('span', { class: 'tbtn sm', title: '新建合成 (Ctrl+N)', onclick: () => MF.Shell.compDialog(null) }, W.icon('plus')); panel._head.append(h('span', { class: 'sp' }), btn);
      const render = () => {
        body.innerHTML = ''; const P = App.project;
        if (!P || !P.comps.length) { body.appendChild(h('div', { class: 'empty' }, h('b', null, '空工程'), '新建一个合成开始创作，', '或从 文件 菜单载入示例。', h('button', { class: 'btn pri', onclick: () => MF.Shell.compDialog(null) }, '新建合成'))); return; }
        body.appendChild(h('div', { class: 'psec' }, '合成', h('span', { class: 'sp' }), P.comps.length + ' 个'));
        const list = h('div', { class: 'plist' });
        for (const c of P.comps) {
          const uses = P.comps.reduce((n, x) => n + x.layers.filter((l) => l.type === 'precomp' && l.src.comp === c.id).length, 0);
          const it = h('div', { class: 'pitem' + (c.id === App.compId ? ' on' : ''), title: '双击打开；右键更多操作' }, h('span', { class: 'ic' }, c.w > c.h ? '▭' : '▯'), h('span', { class: 'nm' }, c.name), h('span', { class: 'meta' }, c.duration + 's' + (uses ? ' ×' + uses : '')));
          it.addEventListener('click', () => { if (c.id !== App.compId) App.openComp(c.id); });
          it.addEventListener('contextmenu', (e) => { e.preventDefault(); W.menu(e.clientX, e.clientY, [{ label: '打开', run: () => App.openComp(c.id) }, { label: '合成设置…', run: () => MF.Shell.compDialog(c) }, { label: '作为图层添加到当前合成', dis: c.id === App.compId, run: () => { if (usesComp(c, App.compId)) { App.toast('不能把合成嵌套进它自己', 'err'); return; } C.addLayer('precomp', { comp: c.id }); } }, '-', { label: '复制合成', run: () => C.duplicateComp(c.id) }, { label: '删除合成', dis: P.comps.length <= 1, run: () => C.deleteComp(c.id) }]); });
          const add = h('span', { class: 'gbtn', title: '作为预合成图层添加到当前合成（可多次引用）', onclick: (e) => { e.stopPropagation(); if (c.id === App.compId || usesComp(c, App.compId)) { App.toast('不能把合成嵌套进它自己', 'err'); return; } C.addLayer('precomp', { comp: c.id }); } }, '↘'); if (c.id !== App.compId) it.appendChild(add);
          list.appendChild(it);
        }
        body.appendChild(list);
        body.appendChild(h('div', { class: 'psec' }, '字体与字符范围'));
        for (const f of MF.Fonts.list) body.appendChild(h('div', { class: 'fontinfo' }, h('b', null, f.label), h('i', null, f.count.toLocaleString() + ' 个字符' + (f.strokes ? ' · 含笔画与笔顺' : '')), h('i', null, f.license)));
        body.appendChild(h('div', { class: 'psec' }, '内置音色'));
        if (MF.Audio) body.appendChild(h('div', { class: 'fontinfo' }, Object.values(MF.Audio.instruments).map((i) => i.label).join(' · ')));
      };
      function usesComp(inner, outerId, depth) { if ((depth || 0) > 8) return true; if (inner.id === outerId) return true; for (const l of inner.layers) if (l.type === 'precomp') { const sc = Model.getComp(App.project, l.src.comp); if (sc && usesComp(sc, outerId, (depth || 0) + 1)) return true; } return false; }
      App.on('project', (o) => { if (!o || !o.live) render(); }); render();
    },
  };
})();
