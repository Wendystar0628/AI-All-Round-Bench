/* timeline.js — 时间轴：图层列表/开关/父级、属性行与关键帧、工作区、擦洗、缩放吸附 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, Model = AE.Model, App = AE.App, UI = AE.UI, Actions = AE.Actions;
  const h = UI.h;
  const TL = AE.Timeline = {};
  const ROW = 24, LEFT_W = 410;
  let root, leftCol, rightCol, scroller, rulerEl, rulerCv, headLeft, topBar, tcEl, view = { t0: 0, t1: 10 }, rows = [], playhead, phRuler, tracksW = 600, filter = null;
  const open = new Set(); const editors = new Map();
  TL.open = open;

  TL.init = (host) => {
    host.innerHTML = '';
    tcEl = h('div', { class: 'tc', title: '点击输入时间（帧）' });
    tcEl.addEventListener('click', () => { const v = prompt('跳转到帧：', Math.round(App.time * App.fps())); if (v !== null && v !== '' && !isNaN(+v)) App.setTime(+v / App.fps()); });
    const b = (label, title, fn, cls) => h('button', { class: 'btn ic ' + (cls || ''), title, text: label, onclick: fn });
    const loopBtn = b('⟲', '循环工作区', () => { App.loop = App.loop === false; loopBtn.classList.toggle('on', App.loop !== false); }, 'on');
    const playBtn = b('▶', '播放 / 暂停（空格）', () => App.togglePlay()); App.on('play', () => { playBtn.textContent = App.playing ? '❚❚' : '▶'; playBtn.classList.toggle('on', App.playing); });
    const snapBtn = b('⌖', '吸附到关键帧 / 播放头 / 图层边缘', () => { TL.snap = !TL.snap; snapBtn.classList.toggle('on', TL.snap); }, 'on'); TL.snap = true;
    const zoomSl = h('input', { type: 'range', min: 0, max: 100, value: 0, title: '时间轴缩放', style: { width: '90px' }, oninput: e => { const c = App.comp; const full = c.dur; const k = +e.target.value / 100; const span = Math.max(0.5, full * (1 - k * 0.97)); const mid = App.time; view.t0 = Math.max(0, Math.min(full - span, mid - span / 2)); view.t1 = view.t0 + span; TL.refreshRight(); } });
    const mbBtn = b('◐', '运动模糊总开关', () => { App.edit('运动模糊总开关', () => { App.comp.mb.on = !App.comp.mb.on; }, 'struct'); }); TL._mbBtn = mbBtn;
    topBar = h('div', { id: 'tlTop' }, b('⏮', '回到开头 (Home)', () => App.setTime(0)), b('◀', '上一帧 (←)', () => App.setTime(App.time - 1 / App.fps())), playBtn, b('▶|', '下一帧 (→)', () => App.setTime(App.time + 1 / App.fps())), b('⏭', '跳到结尾 (End)', () => App.setTime(App.comp.dur)), loopBtn, h('div', { class: 'sep' }), tcEl, h('span', { class: 'muted', id: 'tlCompName' }), h('div', { class: 'sep' }), snapBtn, mbBtn, h('span', { class: 'muted', text: '缩放' }), zoomSl, h('div', { style: { flex: 1 } }), h('button', { class: 'btn sm', text: '适合全长', onclick: () => { view.t0 = 0; view.t1 = App.comp.dur; zoomSl.value = 0; TL.refreshRight(); } }), h('button', { class: 'btn sm', text: '新建图层 ▾', onclick: e => { const r = e.target.getBoundingClientRect(); UI.menu(['shape', 'text', 'null', 'adjust', 'camera', 'light', 'geo', 'particles', 'audio'].map(t => ({ label: Model.LAYER_TYPES[t] + '图层', fn: () => Actions.newLayer(t) })), r.left, r.top - 260); } }));
    headLeft = h('div', { class: 'tl-head', style: { width: LEFT_W + 'px' } }, h('span', { style: { width: '44px' }, text: '' }), h('span', { text: '图层名称', style: { flex: 1, paddingLeft: '30px' } }), h('span', { text: '3D', style: { width: '22px', textAlign: 'center' }, title: '三维图层开关' }), h('span', { text: '模糊', style: { width: '24px', textAlign: 'center' }, title: '运动模糊开关' }), h('span', { text: '混合', style: { width: '64px' } }), h('span', { text: '父级', style: { width: '64px' } }));
    rulerEl = h('div', { class: 'ruler', style: { flex: 1 } }); rulerCv = h('canvas'); rulerEl.append(rulerCv);
    const headRow = h('div', { style: { display: 'flex', minHeight: '24px' } }, headLeft, rulerEl);
    leftCol = h('div', { class: 'tl-leftcol', style: { width: LEFT_W + 'px', flex: 'none', borderRight: '1px solid var(--line)' } });
    rightCol = h('div', { class: 'tl-rightcol', style: { flex: 1, position: 'relative', minWidth: 0 } });
    playhead = h('div', { class: 'playhead' }); rightCol.append(playhead);
    scroller = h('div', { class: 'tl-scroll scroll', style: { overflowY: 'auto', overflowX: 'hidden', flex: 1, display: 'flex' } }, leftCol, rightCol);
    root = h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } }, headRow, scroller);
    host.append(topBar, root);
    new ResizeObserver(() => { TL.refreshRight(); }).observe(rightCol);
    bindRuler(); bindTracks(); bindWheel();
    App.on('struct', () => { TL.rebuild(); }); App.on('comp', () => { view.t0 = 0; view.t1 = App.comp.dur; TL.rebuild(); });
    App.on('select', () => TL.refreshSel()); App.on('keysel', () => TL.refreshKeys()); App.on('selprop', () => TL.refreshSel());
    App.on('time', () => TL.refreshTime()); App.on('change', k => { if (k !== 'struct') TL.refreshValues(); });
    view.t1 = App.comp.dur; TL.rebuild();
  };
  const x2t = x => view.t0 + x / tracksW * (view.t1 - view.t0); const t2x = t => (t - view.t0) / (view.t1 - view.t0) * tracksW;
  TL.t2x = t2x;

  // ===== 行模型 =====
  function buildRows() {
    const c = App.comp; const out = [];
    for (const L of c.layers) {
      const lid = 'L:' + L.id; out.push({ type: 'layer', L, id: lid });
      if (!open.has(lid)) continue;
      const groups = Model.layerSchema(L);
      const rec = (gs, depth) => {
        for (const g of gs) {
          if (filter) { for (const p of g.props) if (filterMatch(p.key, L)) out.push({ type: 'prop', L, key: p.key, info: p.info, depth: 1, id: `${lid}:${p.key}` }); if (g.children) rec(g.children, depth); continue; }
          const gid = lid + ':' + g.id;
          if (g.children || g.props.length) { out.push({ type: 'group', L, g, depth, id: gid }); }
          if (!open.has(gid) && g.children && !g.props.length && depth === 1 && false) continue;
          if (open.has(gid)) { for (const p of g.props) out.push({ type: 'prop', L, key: p.key, info: p.info, depth: depth + 1, id: `${lid}:${p.key}` }); if (g.children) rec(g.children, depth + 1); }
        }
      };
      rec(groups, 1);
    }
    return out;
  }
  const filterMatch = (key, L) => { if (!filter) return true; if (filter.animated) { const p = L.props[key]; return p && (Model.isAnimated(p) || Model.hasExpr(p)); } return filter.keys.includes(key); };
  TL.showOnly = (k, add) => {
    const map = { p: ['transform.position'], s: ['transform.scale'], r: ['transform.rotation', 'transform.rotX', 'transform.rotY'], t: ['transform.opacity'], a: ['transform.anchor'] };
    if (k === 'u') filter = filter && filter.animated ? null : { animated: true, keys: [] };
    else { if (filter && !filter.animated && !add && filter.keys.join() === map[k].join()) filter = null; else if (filter && !filter.animated && add) filter.keys.push(...map[k]); else filter = { keys: map[k].slice() }; }
    // 自动展开选中图层
    for (const L of (App.selLayers().length ? App.selLayers() : App.comp.layers)) open.add('L:' + L.id);
    TL.rebuild();
  };

  // ===== 构建 =====
  TL.rebuild = () => {
    const c = App.comp; document.getElementById('tlCompName') && (document.getElementById('tlCompName').textContent = c.name + (filter ? ' · 过滤中' : ''));
    if (TL._mbBtn) TL._mbBtn.classList.toggle('on', c.mb.on);
    if (view.t1 > c.dur + 1e-6 || view.t1 <= view.t0) { view.t0 = 0; view.t1 = c.dur; }
    rows = buildRows(); editors.clear(); leftCol.innerHTML = ''; [...rightCol.children].forEach(ch => { if (ch !== playhead) ch.remove(); });
    if (!c.layers.length) { leftCol.append(h('div', { class: 'timeline-empty', html: '没有图层<br><span class="muted">使用「新建图层 ▾」或在画布上绘制开始创作</span>' })); }
    rows.forEach((r, i) => { leftCol.append(leftRow(r, i)); rightCol.append(trackRow(r, i)); });
    const hgt = Math.max(rows.length * ROW, 40); leftCol.style.height = rightCol.style.height = hgt + 'px'; playhead.style.height = hgt + 'px';
    TL.refreshRight(); TL.refreshValues();
  };
  const switchBtn = (txt, on, title, fn, extra) => h('div', { class: 'cell' + (on ? ' on' : ''), title, text: txt, onclick: e => { e.stopPropagation(); fn(e); }, style: extra });
  const TYPE_ICON = { shape: '◆', text: 'T', null: '◇', adjust: '◍', precomp: '▣', camera: '◉', light: '☀', geo: '⬢', particles: '✦', audio: '♪' };
  function leftRow(r, i) {
    const L = r.L; const sel = App.sel.layers.includes(L.id);
    if (r.type === 'layer') {
      const lid = r.id; const isOpen = open.has(lid);
      const row = h('div', { class: 'lrow layer' + (sel ? ' sel' : ''), 'data-lid': L.id });
      const nm = h('div', { class: 'nm', title: '双击重命名；拖动调整顺序', text: L.name, ondblclick: e => { e.stopPropagation(); const inp = h('input', { type: 'text', value: L.name }); nm.textContent = ''; nm.append(inp); inp.focus(); inp.select(); const done = ok => { if (ok) Actions.rename(L, inp.value); else TL.rebuild(); }; inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') done(true); else if (ev.key === 'Escape') done(false); }); inp.addEventListener('blur', () => done(true)); } });
      const sw = h('select', { class: 'lsel', title: '混合模式', onclick: e => e.stopPropagation(), onchange: e => App.edit('混合模式', () => { L.blend = e.target.value; }) }, Model.BLENDS.map(([k, n]) => h('option', { value: k, text: n, selected: L.blend === k })));
      const par = h('select', { class: 'lsel', title: '父级', onclick: e => e.stopPropagation(), onchange: e => Actions.setParent(L, e.target.value || null) }, h('option', { value: '', text: '无' }), App.comp.layers.filter(x => x !== L && !Model.isDescendant(App.comp, x, L)).map(x => h('option', { value: x.id, text: x.name, selected: L.parent === x.id })));
      const showSw = L.type !== 'audio' && L.type !== 'light' && L.type !== 'camera';
      row.append(
        switchBtn(L.visible ? '👁' : '·', L.visible, '显示 / 隐藏', () => App.edit('显示切换', () => { L.visible = !L.visible; })),
        switchBtn(L.locked ? '🔒' : '·', L.locked, '锁定', () => App.edit('锁定切换', () => { L.locked = !L.locked; })),
        h('div', { class: 'lab', style: { background: Model.LABELS[L.label % 8] }, title: '标签颜色', onclick: e => { e.stopPropagation(); UI.menu(Model.LABELS.map((c, k) => ({ label: '● 标签 ' + (k + 1), fn: () => App.edit('标签', () => { L.label = k; }) })), e.clientX, e.clientY); } }),
        h('div', { class: 'idx', text: String(App.comp.layers.indexOf(L) + 1) }),
        h('div', { class: 'arr', text: isOpen ? '▾' : '▸', onclick: e => { e.stopPropagation(); isOpen ? open.delete(lid) : open.add(lid); TL.rebuild(); } }),
        h('span', { style: { color: 'var(--txt3)', width: '14px', textAlign: 'center' }, text: TYPE_ICON[L.type] || '' }), nm,
        showSw ? switchBtn('⬡', L.is3D, '三维图层', () => Actions.toggle3D(L)) : h('div', { class: 'cell' }),
        L.type !== 'audio' ? switchBtn('◐', L.mb, '运动模糊', () => App.edit('运动模糊', () => { L.mb = !L.mb; })) : h('div', { class: 'cell' }),
        L.type === 'camera' || L.type === 'light' || L.type === 'audio' ? h('div', { style: { width: '62px' } }) : sw, par);
      row.addEventListener('pointerdown', e => rowDown(e, L));
      row.addEventListener('contextmenu', e => { e.preventDefault(); if (!App.sel.layers.includes(L.id)) App.select([L.id]); UI.menu([{ label: '复制图层', fn: () => Actions.duplicate() }, { label: '预合成…', key: 'Ctrl+Shift+C', fn: () => Actions.precompose() }, ...(L.type === 'shape' || L.type === 'text' ? [{ label: '转为三维实体（挤出）', fn: () => Actions.toSolid(L) }] : []), { sep: true }, { label: '显示全部属性', fn: () => { open.add(r.id); for (const g of Model.layerSchema(L)) { open.add(r.id + ':' + g.id); const rec = cs => (cs || []).forEach(x => { open.add(r.id + ':' + x.id); rec(x.children); }); rec(g.children); } TL.rebuild(); } }, { label: '删除图层', key: 'Del', fn: () => Actions.remove() }], e.clientX, e.clientY); });
      return row;
    }
    if (r.type === 'group') {
      const g = r.g; const gid = r.id; const isOpen = open.has(gid);
      const row = h('div', { class: 'lrow grp', style: { paddingLeft: 24 + r.depth * 14 + 'px' } }, h('div', { class: 'arr', text: isOpen ? '▾' : '▸', onclick: e => { e.stopPropagation(); isOpen ? open.delete(gid) : open.add(gid); TL.rebuild(); } }), h('div', { class: 'nm', text: g.title }));
      row.addEventListener('click', () => { isOpen ? open.delete(gid) : open.add(gid); TL.rebuild(); });
      if (g.effect) row.append(h('button', { class: 'btn sm danger', text: '×', title: '删除效果', onclick: e => { e.stopPropagation(); Actions.removeEffect(L, g.effect.id); } }));
      if (g.mask) row.append(h('button', { class: 'btn sm danger', text: '×', title: '删除蒙版', onclick: e => { e.stopPropagation(); Actions.removeMask(L, g.mask.id); } }));
      if (g.item) row.append(h('button', { class: 'btn sm', text: '▲', title: '上移（改变求值顺序）', onclick: e => { e.stopPropagation(); Actions.moveShapeItem(L, g.item, -1); } }), h('button', { class: 'btn sm', text: '▼', title: '下移', onclick: e => { e.stopPropagation(); Actions.moveShapeItem(L, g.item, 1); } }));
      return row;
    }
    // prop
    const p = L.props[r.key]; const info = r.info || Model.propInfo(L, r.key); const anim = Model.isAnimated(p); const ed = AE.PropUI.editor(L, r.key, { compact: true }); editors.set(r.id, ed);
    const psel = App.isPropSel(L.id, r.key); const exprOn = Model.hasExpr(p); const err = App.ev.errorOf(L, r.key);
    const row = h('div', { class: 'lrow prop' + (psel ? ' sel' : ''), style: { paddingLeft: 12 + (r.depth || 2) * 12 + 'px' }, 'data-key': r.key });
    row.append(h('div', { class: 'cell', title: anim ? '清除动画（所有关键帧）' : '启用动画', text: anim ? '⏱' : '○', style: { color: anim ? 'var(--acc)' : '' }, onclick: e => { e.stopPropagation(); Actions.toggleStopwatch(L, r.key); } }), h('div', { class: 'nm', text: info.label || r.key, title: r.key }), h('div', { class: 'pval' }, ed.el));
    row.append(h('div', { class: 'cell' + (exprOn ? ' on' : ''), title: err ? err : exprOn ? '表达式已启用（点击编辑）' : '添加表达式', text: err ? '!' : '=', style: { color: err ? 'var(--red)' : exprOn ? 'var(--cy)' : '' }, onclick: e => { e.stopPropagation(); App.selectProp(L.id, r.key); App.emit('openExpr', { layer: L.id, key: r.key }); } }));
    row.append(h('div', { class: 'cell', text: '◂', title: '上一关键帧', onclick: e => { e.stopPropagation(); gotoKey(L, r.key, -1); } }), h('div', { class: 'cell', text: '◆', title: '在当前时间添加/移除关键帧', style: { color: anim ? 'var(--acc2)' : '' }, onclick: e => { e.stopPropagation(); if (!anim) { Actions.toggleStopwatch(L, r.key); return; } const i = Model.keyAt(p, App.time, 0.5 / App.fps()); if (i >= 0) { Model.removeKeyAt(L, r.key, p.k[i].t); App.changed('struct'); App.commit('移除关键帧'); } else Actions.addKeyHere(L, r.key); } }), h('div', { class: 'cell', text: '▸', title: '下一关键帧', onclick: e => { e.stopPropagation(); gotoKey(L, r.key, 1); } }));
    row.addEventListener('click', e => { App.selectProp(L.id, r.key, e.shiftKey || e.ctrlKey); if (info.type === 'path') { App.sel.item = { layer: L.id, key: r.key, type: 'path' }; App.requestRender(); } });
    return row;
  }
  const gotoKey = (L, key, dir) => { const p = L.props[key]; if (!p || !p.k) return; const t = App.time, eps = 0.5 / App.fps(); const ks = p.k.map(k => k.t); const nx = dir > 0 ? ks.find(x => x > t + eps) : [...ks].reverse().find(x => x < t - eps); if (nx !== undefined) App.setTime(nx); };
  function rowDown(e, L) {
    if (e.target.closest('.cell,select,input,button,.lab,.arr')) return; if (e.button !== 0) return;
    const ctrl = e.ctrlKey || e.metaKey; const sh = e.shiftKey;
    if (sh && App.sel.layers.length) { const c = App.comp; const a = c.layers.findIndex(l => l.id === App.sel.layers[App.sel.layers.length - 1]), b = c.layers.indexOf(L); const [lo, hi] = [Math.min(a, b), Math.max(a, b)]; App.select(c.layers.slice(lo, hi + 1).map(l => l.id)); }
    else App.select([L.id], ctrl);
    // 拖动排序
    const y0 = e.clientY; let dragging = false; let line = null; const c = App.comp; const layerRows = [...leftCol.querySelectorAll('.lrow.layer')];
    const mv = ev => {
      if (!dragging && Math.abs(ev.clientY - y0) < 5) return; dragging = true;
      const rects = layerRows.map(r => r.getBoundingClientRect()); let idx = rects.findIndex(r => ev.clientY < r.top + r.height / 2); if (idx < 0) idx = rects.length;
      if (!line) { line = h('div', { style: { position: 'fixed', height: '2px', background: 'var(--acc)', zIndex: 50, pointerEvents: 'none' } }); document.body.append(line); }
      const lr = leftCol.getBoundingClientRect(); const ry = idx < rects.length ? rects[idx].top : rects[rects.length - 1].bottom; line.style.left = lr.left + 'px'; line.style.width = LEFT_W + 'px'; line.style.top = ry + 'px'; line._idx = idx;
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (line) { const idx = line._idx; line.remove(); const from = c.layers.indexOf(L); let to = idx > from ? idx - 1 : idx; if (to !== from) Actions.moveTo(L, to); } };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }

  // ===== 右侧轨道 =====
  function trackRow(r, i) {
    const L = r.L; const el = h('div', { class: 'trow ' + r.type + (r.type === 'layer' && App.sel.layers.includes(L.id) ? ' sel' : ''), style: { top: i * ROW + 'px' }, 'data-i': i });
    el._row = r; return el;
  }
  TL.refreshRight = () => {
    if (!rightCol) return; tracksW = Math.max(100, rightCol.clientWidth); const c = App.comp;
    drawRuler();
    [...rightCol.querySelectorAll('.trow')].forEach(el => {
      const r = el._row; if (!r) return; el.innerHTML = ''; const L = r.L;
      if (r.type === 'layer') {
        const x0 = t2x(L.in), x1 = t2x(L.out); const col = Model.LABELS[L.label % 8];
        const bar = h('div', { class: 'lbar', style: { left: x0 + 'px', width: Math.max(4, x1 - x0) + 'px', background: col + 'cc' }, 'data-lid': L.id }, h('div', { class: 'h l' }), h('div', { class: 'h r' }), h('div', { class: 'lbn', text: L.name }));
        bar.addEventListener('pointerdown', e => barDown(e, L, bar)); el.append(bar);
        if (!open.has(r.id)) { // 折叠时汇总关键帧
          const ts = new Set(); for (const k of Model.allPropKeys(L)) { const p = L.props[k]; if (p && p.k) for (const kk of p.k) ts.add(+kk.t.toFixed(4)); }
          for (const tt of ts) el.append(h('div', { class: 'kf', style: { left: t2x(tt) + 'px', opacity: 0.6, transform: 'rotate(45deg) scale(.7)', pointerEvents: 'none' } }));
        }
      } else if (r.type === 'prop') {
        const p = L.props[r.key]; if (!p || !p.k) return;
        p.k.forEach(k => { const sel = App.sel.keys.some(s => s.layer === L.id && s.key === r.key && Math.abs(s.t - k.t) < 1e-4); const cls = 'kf ' + (k.oi === 'hold' ? 'hold' : k.oi === 'bezier' || k.ii === 'bezier' ? 'bez' : 'lin') + (sel ? ' sel' : ''); const kf = h('div', { class: cls, style: { left: t2x(k.t) + 'px' }, title: `${Model.propInfo(L, r.key).label} @ ${App.tc(k.t)}\n入:${k.ii} 出:${k.oi}` }); kf.addEventListener('pointerdown', e => keyDown(e, L, r.key, k)); kf.addEventListener('contextmenu', e => keyMenu(e, L, r.key, k)); el.append(kf); });
      }
    });
    movePlayhead();
  };
  const movePlayhead = () => { const x = t2x(App.time); playhead.style.left = x + 'px'; playhead.style.display = x < -2 || x > tracksW + 2 ? 'none' : ''; if (rulerEl) { /* ruler 内播放头在 canvas 中绘制 */ } };
  function drawRuler() {
    const cv = rulerCv; const dp = Math.min(window.devicePixelRatio || 1, 2); const w = tracksW, hh = 24; cv.width = w * dp; cv.height = hh * dp; cv.style.width = w + 'px'; cv.style.height = hh + 'px'; const ctx = cv.getContext('2d'); ctx.setTransform(dp, 0, 0, dp, 0, 0); ctx.clearRect(0, 0, w, hh);
    const c = App.comp; const fps = c.fps; const pps = tracksW / (view.t1 - view.t0);
    // 工作区
    ctx.fillStyle = '#3a6ea855'; ctx.fillRect(t2x(c.work[0]), 0, t2x(c.work[1]) - t2x(c.work[0]), hh); ctx.fillStyle = '#3a6ea8'; ctx.fillRect(t2x(c.work[0]), 0, t2x(c.work[1]) - t2x(c.work[0]), 4);
    ctx.fillStyle = '#6fa8e8'; ctx.fillRect(t2x(c.work[0]) - 1, 0, 4, 6); ctx.fillRect(t2x(c.work[1]) - 3, 0, 4, 6);
    // 总长之外变暗
    ctx.fillStyle = '#00000066'; if (t2x(c.dur) < w) ctx.fillRect(t2x(c.dur), 0, w - t2x(c.dur), hh);
    const steps = [1 / fps, 2 / fps, 5 / fps, 10 / fps, 0.5, 1, 2, 5, 10, 30, 60]; let major = steps.find(s => s * pps >= 70) || 60;
    const minor = major / 5; ctx.strokeStyle = '#4a5266'; ctx.fillStyle = '#9aa1b2'; ctx.font = '10px Consolas, monospace'; ctx.lineWidth = 1;
    const start = Math.floor(view.t0 / minor) * minor;
    ctx.beginPath(); for (let t = start; t <= view.t1 + minor; t += minor) { const x = Math.round(t2x(t)) + 0.5; const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6; ctx.moveTo(x, hh); ctx.lineTo(x, hh - (isMajor ? 12 : 5)); } ctx.stroke();
    for (let t = Math.ceil(view.t0 / major) * major; t <= view.t1 + 1e-6; t += major) { const x = t2x(t); const f = Math.round(t * fps); const lbl = major < 1 ? `${Math.floor(f / fps)}:${String(f % fps).padStart(2, '0')}` : `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}s`; ctx.fillText(major >= 1 ? (t % 1 === 0 ? t + 's' : lbl) : lbl, x + 3, 13); }
    // 播放头
    const px = t2x(App.time); ctx.fillStyle = '#ff5a4a'; ctx.fillRect(px - 0.5, 0, 1.5, hh); ctx.beginPath(); ctx.moveTo(px - 6, 0); ctx.lineTo(px + 6, 0); ctx.lineTo(px + 6, 8); ctx.lineTo(px, 14); ctx.lineTo(px - 6, 8); ctx.closePath(); ctx.fill();
  }
  TL.refreshTime = () => { tcEl.textContent = App.tc(App.time); movePlayhead(); drawRuler(); TL.refreshValues(); // 若播放头离开视图，滚动
    if (App.playing || true) { const x = t2x(App.time); if (x > tracksW - 2 || x < 0) { const span = view.t1 - view.t0; if (span < App.comp.dur - 1e-6) { view.t0 = Math.max(0, Math.min(App.comp.dur - span, App.time - span * 0.1)); view.t1 = view.t0 + span; TL.refreshRight(); } } } };
  TL.refreshValues = () => { if (tcEl) tcEl.textContent = App.tc(App.time); for (const [id, ed] of editors) ed.update(); // 表达式状态
  };
  TL.refreshSel = () => {
    leftCol.querySelectorAll('.lrow.layer').forEach(el => el.classList.toggle('sel', App.sel.layers.includes(el.dataset.lid)));
    rightCol.querySelectorAll('.trow.layer').forEach(el => el.classList.toggle('sel', App.sel.layers.includes(el._row.L.id)));
    leftCol.querySelectorAll('.lrow.prop').forEach((el, i) => { });
    const rowsEls = [...leftCol.children]; rows.forEach((r, i) => { if (r.type === 'prop' && rowsEls[i]) rowsEls[i].classList.toggle('sel', App.isPropSel(r.L.id, r.key)); });
  };
  TL.refreshKeys = () => TL.refreshRight();

  // ===== 交互 =====
  function bindRuler() {
    rulerEl.addEventListener('pointerdown', e => {
      const r = rulerEl.getBoundingClientRect(); const c = App.comp; const x = e.clientX - r.left;
      const w0 = t2x(c.work[0]), w1 = t2x(c.work[1]);
      if (e.offsetY < 8 && Math.abs(x - w0) < 6) { barDrag(e, 'wl'); return; } if (e.offsetY < 8 && Math.abs(x - w1) < 6) { barDrag(e, 'wr'); return; } if (e.offsetY < 8 && x > w0 && x < w1) { barDrag(e, 'wm'); return; }
      rulerEl.setPointerCapture(e.pointerId); App.stopPlay(); const set = ev => App.setTime(snapT(x2t(ev.clientX - r.left), false)); set(e);
      const mv = ev => set(ev); const up = () => { rulerEl.removeEventListener('pointermove', mv); rulerEl.removeEventListener('pointerup', up); }; rulerEl.addEventListener('pointermove', mv); rulerEl.addEventListener('pointerup', up);
    });
    function barDrag(e, kind) { const c = App.comp; const r = rulerEl.getBoundingClientRect(); const w0 = c.work[0], w1 = c.work[1], x0 = e.clientX; rulerEl.setPointerCapture(e.pointerId); const mv = ev => { const dt = (ev.clientX - x0) / tracksW * (view.t1 - view.t0); if (kind === 'wl') c.work[0] = U.clamp(App.snap(w0 + dt), 0, c.work[1] - 1 / c.fps); else if (kind === 'wr') c.work[1] = U.clamp(App.snap(w1 + dt), c.work[0] + 1 / c.fps, c.dur); else { const d = App.snap(dt); const len = w1 - w0; c.work[0] = U.clamp(w0 + d, 0, c.dur - len); c.work[1] = c.work[0] + len; } drawRuler(); App.requestRender(); }; const up = () => { rulerEl.removeEventListener('pointermove', mv); rulerEl.removeEventListener('pointerup', up); App.changed('struct'); App.commit('工作区'); }; rulerEl.addEventListener('pointermove', mv); rulerEl.addEventListener('pointerup', up); }
  }
  const snapT = (t, snapObjs = true) => {
    t = App.snap(t); if (!TL.snap || !snapObjs) return Math.max(0, t); const thr = 6 / tracksW * (view.t1 - view.t0); let best = null; const cand = [App.time];
    for (const L of App.comp.layers) { cand.push(L.in, L.out); }
    for (const c of cand) if (Math.abs(c - t) < thr && (best === null || Math.abs(c - t) < Math.abs(best - t))) best = c; return best !== null ? best : Math.max(0, t);
  };
  function keyDown(e, L, key, k) {
    e.stopPropagation(); if (e.button !== 0) return; App.stopPlay();
    const isSel = App.sel.keys.some(s => s.layer === L.id && s.key === key && Math.abs(s.t - k.t) < 1e-4);
    if (e.shiftKey) { if (isSel) { App.sel.keys = App.sel.keys.filter(s => !(s.layer === L.id && s.key === key && Math.abs(s.t - k.t) < 1e-4)); } else Actions.setKeySel([{ layer: L.id, key, t: k.t }], true); App.emit('keysel'); return; }
    if (!isSel) Actions.setKeySel([{ layer: L.id, key, t: k.t }], false);
    if (!App.sel.layers.includes(L.id)) { App.sel.layers = [L.id]; App.emit('select'); }
    App.selectProp(L.id, key); Actions.setKeySel(App.sel.keys, false);
    const list = Actions.selKeys(); list.forEach(en => en.k.t0 = en.k.t); const x0 = e.clientX; let moved = false; const alt = e.altKey; const tmin = Math.min(...list.map(en => en.k.t0)), tmax = Math.max(...list.map(en => en.k.t0));
    const pivot = alt ? tmin : 0;
    const mv = ev => {
      const dx = ev.clientX - x0; if (!moved && Math.abs(dx) < 3) return; moved = true; let dt = dx / tracksW * (view.t1 - view.t0);
      if (alt && tmax > tmin) { const f = Math.max(0.05, 1 + dt / (tmax - tmin)); Actions.scaleKeys(list, f, pivot); for (const en of list) en.k.t = App.snap(en.k.t); }
      else { let t = k.t0; t = snapT(t + dt, true); dt = t - k.t0; Actions.moveKeys(list, dt); }
      App.changed('values'); TL.refreshRight();
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (moved) { App.sel.keys = list.map(en => ({ layer: en.L.id, key: en.key, t: en.k.t })); App.changed('struct'); App.commit(alt ? '拉伸关键帧' : '移动关键帧'); } else { App.emit('keysel'); } };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }
  function keyMenu(e, L, key, k) {
    e.preventDefault(); e.stopPropagation(); if (!App.sel.keys.some(s => s.layer === L.id && s.key === key && Math.abs(s.t - k.t) < 1e-4)) Actions.setKeySel([{ layer: L.id, key, t: k.t }]);
    const info = Model.propInfo(L, key);
    const items = [{ head: '关键帧' }, { label: '缓入缓出', key: 'F9', fn: () => Actions.easyEase('both') }, { label: '仅缓入', key: 'Shift+F9', fn: () => Actions.easyEase('in') }, { label: '仅缓出', key: 'Ctrl+Shift+F9', fn: () => Actions.easyEase('out') }, { sep: true }, { label: '进入：线性', fn: () => Actions.setInterp('in', 'linear') }, { label: '进入：贝塞尔', fn: () => Actions.setInterp('in', 'bezier') }, { label: '进入：定格', fn: () => Actions.setInterp('in', 'hold') }, { label: '离开：线性', fn: () => Actions.setInterp('out', 'linear') }, { label: '离开：贝塞尔', fn: () => Actions.setInterp('out', 'bezier') }, { label: '离开：定格', fn: () => Actions.setInterp('out', 'hold') }, { label: '全部线性', fn: () => Actions.setInterp('both', 'linear') }, { label: '全部定格', fn: () => Actions.setInterp('both', 'hold') }];
    if (info.spatial) items.push({ sep: true }, { label: '空间：线性（尖角）', fn: () => Actions.setSpatial('lin') }, { label: '空间：自动贝塞尔', fn: () => Actions.setSpatial('auto') }, { label: '空间：贝塞尔（独立手柄）', fn: () => Actions.setSpatial('bez') });
    items.push({ sep: true }, { label: '复制', key: 'Ctrl+C', fn: () => Actions.copyKeys() }, { label: '粘贴到播放头', key: 'Ctrl+V', fn: () => Actions.pasteKeys() }, { label: '删除', key: 'Del', fn: () => Actions.deleteKeys() });
    UI.menu(items, e.clientX, e.clientY);
  }
  function barDown(e, L, bar) {
    e.stopPropagation(); if (e.button !== 0) return; App.stopPlay(); const part = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'm';
    if (!App.sel.layers.includes(L.id)) App.select([L.id], e.shiftKey); const targets = L.locked ? [] : App.selLayers().filter(x => !x.locked); if (!targets.length) return;
    const snap0 = targets.map(x => ({ x, in: x.in, out: x.out })); const x0 = e.clientX; let moved = false;
    const mv = ev => {
      const dt = (ev.clientX - x0) / tracksW * (view.t1 - view.t0); if (!moved && Math.abs(ev.clientX - x0) < 3) return; moved = true;
      for (const s of snap0) {
        if (part === 'm') { const d = App.snap(dt); const prevIn = s.x.in; const ni = s.in + d; const dd = ni - prevIn; Actions.shiftLayer(s.x, dd); }
        else if (part === 'l') s.x.in = Math.min(App.snap(s.in + dt), s.x.out - 1 / App.fps()); else s.x.out = Math.max(App.snap(s.out + dt), s.x.in + 1 / App.fps());
      }
      App.changed('values'); TL.refreshRight();
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (moved) { App.changed('struct'); App.commit(part === 'm' ? '移动图层' : '裁剪图层'); } };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }
  function bindTracks() {
    rightCol.addEventListener('pointerdown', e => {
      if (e.target !== rightCol && !e.target.classList.contains('trow')) return; if (e.button !== 0) return; App.stopPlay();
      const r = rightCol.getBoundingClientRect(); const x0 = e.clientX - r.left, y0 = e.clientY - r.top; const mq = h('div', { class: 'marquee' }); rightCol.append(mq); let moved = false;
      const rowEl = e.target.classList.contains('trow') ? e.target._row : null; if (rowEl && rowEl.type === 'layer' && !e.shiftKey) App.select([rowEl.L.id]);
      rightCol.setPointerCapture(e.pointerId);
      const mv = ev => { const x1 = ev.clientX - r.left, y1 = ev.clientY - r.top; if (!moved && Math.hypot(x1 - x0, y1 - y0) < 4) return; moved = true; Object.assign(mq.style, { left: Math.min(x0, x1) + 'px', top: Math.min(y0, y1) + 'px', width: Math.abs(x1 - x0) + 'px', height: Math.abs(y1 - y0) + 'px' }); };
      const up = ev => { rightCol.removeEventListener('pointermove', mv); rightCol.removeEventListener('pointerup', up); mq.remove(); const x1 = ev.clientX - r.left, y1 = ev.clientY - r.top;
        if (!moved) { if (!e.shiftKey) { App.sel.keys = []; App.emit('keysel'); } return; }
        const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1); const list = [];
        rows.forEach((rw, i) => { if (rw.type !== 'prop') return; const top = i * ROW, bot = top + ROW; if (bot < ya || top > yb) return; const p = rw.L.props[rw.key]; if (!p || !p.k) return; for (const k of p.k) { const x = t2x(k.t); if (x >= xa - 4 && x <= xb + 4) list.push({ layer: rw.L.id, key: rw.key, t: k.t }); } });
        Actions.setKeySel(list, e.shiftKey); TL.refreshRight(); };
      rightCol.addEventListener('pointermove', mv); rightCol.addEventListener('pointerup', up);
    });
  }
  function bindWheel() {
    const wheel = e => {
      if (e.ctrlKey || e.altKey) { e.preventDefault(); const r = rightCol.getBoundingClientRect(); const tx = x2t(e.clientX - r.left); const span = view.t1 - view.t0; const ns = U.clamp(span * (e.deltaY > 0 ? 1.18 : 1 / 1.18), 0.4, App.comp.dur); const f = (tx - view.t0) / span; view.t0 = Math.max(0, tx - f * ns); view.t1 = Math.min(App.comp.dur, view.t0 + ns); view.t0 = Math.max(0, view.t1 - ns); TL.refreshRight(); }
      else if (e.shiftKey) { e.preventDefault(); const span = view.t1 - view.t0; const d = e.deltaY / tracksW * span; view.t0 = U.clamp(view.t0 + d, 0, App.comp.dur - span); view.t1 = view.t0 + span; TL.refreshRight(); }
    };
    rightCol.addEventListener('wheel', wheel, { passive: false }); rulerEl.addEventListener('wheel', wheel, { passive: false });
    leftCol.addEventListener('wheel', e => { scroller.scrollTop += e.deltaY; }, { passive: true });
  }
  TL.view = view; TL.x2t = x2t;
})();
