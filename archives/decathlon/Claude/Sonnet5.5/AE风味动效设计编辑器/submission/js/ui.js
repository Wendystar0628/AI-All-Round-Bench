/* ui.js — 通用界面组件：DOM 助手、弹出菜单、对话框、数值拖拽输入、颜色输入、分隔条、菜单栏与快捷键 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, App = AE.App, Model = AE.Model;
  const UI = AE.UI = {};

  UI.h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) { if (v === undefined || v === null || v === false) continue; if (k === 'class') el.className = v; else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v); else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'html') el.innerHTML = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : v); }
    for (const kid of kids.flat()) { if (kid === null || kid === undefined || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(kid)); }
    return el;
  };
  const h = UI.h;
  UI.svg = (path, extra) => `<svg viewBox="0 0 24 24" ${extra || ''}>${path}</svg>`;
  UI.fmt = (v, prec) => { if (typeof v !== 'number' || !isFinite(v)) return '0'; const p = prec === undefined ? (Math.abs(v) >= 1000 ? 1 : 2) : prec; let s = v.toFixed(p); if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, ''); return s === '-0' ? '0' : s; };

  // ===== 弹出菜单 =====
  let popClose = null;
  UI.closePopup = () => { const p = document.getElementById('popup'); p.classList.add('hidden'); p.innerHTML = ''; if (popClose) { document.removeEventListener('pointerdown', popClose, true); popClose = null; } };
  UI.menu = (items, x, y) => {
    UI.closePopup(); const p = document.getElementById('popup'); p.innerHTML = '';
    const build = (list, host) => {
      for (const it of list) {
        if (it === '-' || it.sep) { host.append(h('div', { class: 'pm-sep' })); continue; }
        if (it.head) { host.append(h('div', { class: 'pm-head', text: it.head })); continue; }
        const row = h('div', { class: 'pm-item' + (it.disabled ? ' dis' : '') }, h('span', { text: (it.check === true ? '✓ ' : it.check === false ? '　 ' : '') + it.label }), it.key ? h('span', { class: 'k', text: it.key }) : null, it.sub ? h('span', { class: 'k', text: '▸' }) : null);
        if (it.sub) {
          row.addEventListener('pointerenter', () => { const old = host.querySelector('.sub'); if (old) old.remove(); });
          row.addEventListener('click', e => { e.stopPropagation(); UI.menu(typeof it.sub === 'function' ? it.sub() : it.sub, row.getBoundingClientRect().right - 4, row.getBoundingClientRect().top); });
        } else row.addEventListener('click', () => { UI.closePopup(); it.fn && it.fn(); });
        host.append(row);
      }
    };
    build(items, p); p.classList.remove('hidden');
    const r = p.getBoundingClientRect(); const W = window.innerWidth, H = window.innerHeight;
    p.style.left = Math.max(2, Math.min(x, W - r.width - 4)) + 'px'; p.style.top = Math.max(2, Math.min(y, H - r.height - 4)) + 'px';
    popClose = e => { if (!p.contains(e.target)) UI.closePopup(); };
    setTimeout(() => document.addEventListener('pointerdown', popClose, true), 0);
  };
  UI.modal = (title, body, buttons = [{ label: '关闭' }]) => {
    const m = document.getElementById('modal'); m.innerHTML = ''; const box = h('div', { class: 'box' }, h('h3', { text: title }), h('div', { class: 'mb' }, body), h('div', { class: 'mf' }, buttons.map(b => h('button', { class: 'btn' + (b.primary ? ' on' : ''), text: b.label, onclick: () => { const r = b.fn ? b.fn() : undefined; if (r !== false) UI.closeModal(); } }))));
    m.append(box); m.classList.remove('hidden'); m.onpointerdown = e => { if (e.target === m) UI.closeModal(); };
    return box;
  };
  UI.closeModal = () => { const m = document.getElementById('modal'); m.classList.add('hidden'); m.innerHTML = ''; };

  // ===== 数值输入（拖拽/点击编辑）=====
  // opts: {value, step, min, max, prec, unit, cls, onChange(v, phase)}  phase: 'drag'|'end'
  UI.num = (o) => {
    const inp = h('input', { class: 'num ' + (o.cls || ''), type: 'text', title: o.title || '拖动改变数值，点击输入，Shift 加速，Alt 微调', spellcheck: 'false' });
    inp._v = o.value || 0; const step = o.step || 1; const unit = o.unit || '';
    const show = v => UI.fmt(v, o.prec) + (unit && unit !== '%' && unit !== 'px' ? unit : unit === '%' ? '%' : '');
    inp.setValue = v => { inp._v = v; if (document.activeElement !== inp) inp.value = show(v); };
    inp.value = show(inp._v);
    let drag = null;
    inp.addEventListener('pointerdown', e => { if (document.activeElement === inp || e.button !== 0) return; drag = { x: e.clientX, v: inp._v, moved: false }; inp.setPointerCapture(e.pointerId); e.preventDefault(); });
    inp.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - drag.x; if (!drag.moved && Math.abs(dx) < 3) return; if (!drag.moved) { drag.moved = true; o.onStart && o.onStart(); }
      let nv = drag.v + dx * step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * (o.dragScale || 0.5); if (o.min !== undefined) nv = Math.max(o.min, nv); if (o.max !== undefined) nv = Math.min(o.max, nv);
      if (o.step >= 1 && o.integer) nv = Math.round(nv); inp._v = nv; inp.value = show(nv); o.onChange && o.onChange(nv, 'drag');
    });
    const up = () => { if (!drag) return; const d = drag; drag = null; if (!d.moved) { inp.focus(); inp.select(); } else o.onChange && o.onChange(inp._v, 'end'); };
    inp.addEventListener('pointerup', up); inp.addEventListener('pointercancel', up);
    const commit = () => { const m = /-?\d*\.?\d+(?:e[-+]?\d+)?/i.exec(inp.value.replace(/,/g, '.')); if (m) { let v = parseFloat(m[0]); if (o.min !== undefined) v = Math.max(o.min, v); if (o.max !== undefined) v = Math.min(o.max, v); if (v !== inp._v) { o.onStart && o.onStart(); inp._v = v; o.onChange && o.onChange(v, 'end'); } } inp.value = show(inp._v); };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { commit(); inp.blur(); } else if (e.key === 'Escape') { inp.value = show(inp._v); inp.blur(); } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1); o.onStart && o.onStart(); inp._v += d; inp.value = show(inp._v); o.onChange && o.onChange(inp._v, 'end'); } });
    inp.addEventListener('blur', () => commit());
    inp.addEventListener('wheel', e => { if (document.activeElement === inp) e.preventDefault(); });
    return inp;
  };
  // 颜色输入：返回 {el, set(v)}；v=[r,g,b,a] 0..1
  UI.color = (o) => {
    const wrap = h('div', { class: 'row', style: { width: '100%', gap: '4px' } });
    const btn = h('div', { class: 'colorbtn', title: '点击选择颜色' }); const ci = h('input', { type: 'color', style: { position: 'absolute', opacity: 0, pointerEvents: 'none', width: '1px', height: '1px' } });
    const holder = h('div', { style: { position: 'relative', flex: 1 } }, btn, ci); wrap.append(holder);
    let alpha = null; let val = o.value || [1, 1, 1, 1];
    const paint = () => { btn.style.background = `linear-gradient(90deg, ${U.C.css(val, 1)} 0 75%, ${U.C.css(val, val[3] === undefined ? 1 : val[3])} 75%)`; ci.value = U.C.toHex(val); };
    btn.addEventListener('click', () => ci.click());
    ci.addEventListener('input', () => { const c = U.C.hex(ci.value); val = [c[0], c[1], c[2], val[3] === undefined ? 1 : val[3]]; paint(); o.onChange && o.onChange(val.slice(), 'drag'); });
    ci.addEventListener('change', () => { o.onChange && o.onChange(val.slice(), 'end'); });
    if (o.alpha !== false) { alpha = UI.num({ value: (val[3] === undefined ? 1 : val[3]) * 100, step: 1, min: 0, max: 100, unit: '%', prec: 0, onChange: (v, ph) => { val = [val[0], val[1], val[2], v / 100]; paint(); o.onChange && o.onChange(val.slice(), ph); } }); alpha.style.width = '46px'; wrap.append(alpha); }
    paint(); wrap.set = v => { val = v.slice(); paint(); if (alpha) alpha.setValue((val[3] === undefined ? 1 : val[3]) * 100); }; return wrap;
  };

  // ===== 分隔条 =====
  UI.initSplitters = () => {
    document.querySelectorAll('.vsplit,.hsplit').forEach(s => {
      s.addEventListener('pointerdown', e => {
        e.preventDefault(); s.setPointerCapture(e.pointerId); s.classList.add('drag'); const vert = s.classList.contains('vsplit'); const name = s.dataset.var; const dir = +(s.dataset.dir || 1);
        const root = document.documentElement; const cur = parseFloat(getComputedStyle(root).getPropertyValue(name)); const start = vert ? e.clientX : e.clientY;
        const mv = ev => { const d = (vert ? ev.clientX : ev.clientY) - start; const v = vert ? cur + d * dir : cur - d; root.style.setProperty(name, Math.max(120, Math.min(vert ? 900 : window.innerHeight - 200, v)) + 'px'); window.dispatchEvent(new Event('resize')); };
        const up = () => { s.classList.remove('drag'); s.removeEventListener('pointermove', mv); s.removeEventListener('pointerup', up); };
        s.addEventListener('pointermove', mv); s.addEventListener('pointerup', up);
      });
    });
  };

  // ===== 标签页 =====
  UI.tabs = (host, list, onSwitch, init) => {
    const bar = h('div', { class: 'tabs' }); let cur = init || list[0].id;
    const render = () => { bar.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.id === cur)); };
    for (const t of list) bar.append(h('div', { class: 'tab', 'data-id': t.id, text: t.label, onclick: () => { cur = t.id; render(); onSwitch(cur); } }));
    host.prepend(bar); render(); return { set: id => { cur = id; render(); onSwitch(id); }, get: () => cur };
  };

  // ===== 菜单栏 =====
  const A = () => AE.Actions;
  UI.buildMenubar = () => {
    const bar = document.getElementById('menubar'); bar.innerHTML = '';
    bar.append(h('div', { class: 'logo' }, h('i'), '锻 · 动效编辑器'));
    const mk = (label, items) => { const b = h('div', { class: 'menu-btn', text: label }); b.addEventListener('click', () => { const r = b.getBoundingClientRect(); b.classList.add('open'); UI.menu(items(), r.left, r.bottom + 1); setTimeout(() => b.classList.remove('open'), 0); }); b.addEventListener('pointerenter', () => { if (!document.getElementById('popup').classList.contains('hidden')) { const r = b.getBoundingClientRect(); UI.menu(items(), r.left, r.bottom + 1); } }); bar.append(b); };
    const newMenu = () => ['shape', 'text', 'null', 'adjust', 'camera', 'light', 'geo', 'particles', 'audio'].map(t => ({ label: Model.LAYER_TYPES[t] + '图层', fn: () => A().newLayer(t) })).concat([{ sep: true }, { label: '点光源', fn: () => A().newLayer('light', { lightType: 'point' }) }]);
    mk('文件', () => [{ label: '新建空工程', fn: () => App.newProject() }, { label: '打开工程…', key: 'Ctrl+O', fn: () => App.openFile() }, { label: '保存工程…', key: 'Ctrl+S', fn: () => App.saveFile() }, { sep: true }, { label: '载入示例「锻字」', fn: () => App.loadDemo() }, { label: '恢复自动保存', fn: () => { const s = localStorage.getItem('ae-forge-autosave'); if (s) { try { App.setProject(Model.deserialize(s)); App.toast('已恢复'); } catch (e) { App.toast('无法恢复'); } } else App.toast('没有自动保存'); } }, { sep: true }, { label: '导出当前帧为 PNG', fn: () => AE.Viewer.exportPNG() }]);
    mk('编辑', () => [{ label: '撤销' + (App.hist.curLabel ? '：' + App.hist.curLabel : ''), key: 'Ctrl+Z', fn: () => App.undo(), disabled: !App.hist.past.length }, { label: '重做', key: 'Ctrl+Shift+Z', fn: () => App.redo(), disabled: !App.hist.future.length }, { sep: true }, { label: '复制', key: 'Ctrl+C', fn: () => AE.UI.doCopy() }, { label: '粘贴', key: 'Ctrl+V', fn: () => AE.UI.doPaste() }, { label: '复制图层', key: 'Ctrl+D', fn: () => A().duplicate() }, { label: '删除', key: 'Delete', fn: () => AE.UI.doDelete() }, { label: '全选图层', key: 'Ctrl+A', fn: () => A().selectAll() }]);
    mk('合成', () => [{ label: '新建合成…', fn: () => UI.compDialog(null) }, { label: '合成设置…', fn: () => UI.compDialog(App.comp) }, { label: '预合成…', key: 'Ctrl+Shift+C', fn: () => A().precompose() }, { sep: true }, { label: '运动模糊总开关', check: App.comp.mb.on, fn: () => App.edit('运动模糊总开关', () => App.comp.mb.on = !App.comp.mb.on) }, { label: '设置工作区起点', key: 'B', fn: () => UI.workStart() }, { label: '设置工作区终点', key: 'N', fn: () => UI.workEnd() }, { sep: true }, { label: '删除当前合成', fn: () => A().deleteComp(App.comp.id) }]);
    mk('图层', () => [{ label: '新建', sub: newMenu }, { label: '转为三维实体（挤出）', fn: () => { const p = App.primary(); if (p && (p.type === 'shape' || p.type === 'text')) A().toSolid(p); else App.toast('请选择文字或形状图层'); } }, { sep: true }, { label: '复制图层', key: 'Ctrl+D', fn: () => A().duplicate() }, { label: '删除图层', key: 'Delete', fn: () => A().remove() }, { label: '上移一层', key: 'Ctrl+]', fn: () => { const p = App.primary(); p && A().reorder(p, -1); } }, { label: '下移一层', key: 'Ctrl+[', fn: () => { const p = App.primary(); p && A().reorder(p, 1); } }, { sep: true }, { label: '添加效果', sub: () => Object.entries(Model.EFFECTS).map(([k, d]) => ({ label: d.name, fn: () => { const p = App.primary(); p ? A().addEffect(p, k) : App.toast('请先选择图层'); } })) }, { label: '添加蒙版', sub: () => [{ label: '矩形蒙版', fn: () => { const p = App.primary(); p ? A().addMask(p, 'rect') : App.toast('请先选择图层'); } }, { label: '椭圆蒙版', fn: () => { const p = App.primary(); p ? A().addMask(p, 'ellipse') : App.toast('请先选择图层'); } }] }]);
    mk('动画', () => [{ label: '在当前时间添加关键帧', fn: () => { for (const s of App.sel.props) A().addKeyHere(App.layer(s.layer), s.key); } }, { sep: true }, { label: '缓入缓出', key: 'F9', fn: () => A().easyEase('both') }, { label: '仅缓入', key: 'Shift+F9', fn: () => A().easyEase('in') }, { label: '仅缓出', key: 'Ctrl+Shift+F9', fn: () => A().easyEase('out') }, { sep: true }, { label: '时间插值：线性', fn: () => A().setInterp('both', 'linear') }, { label: '时间插值：贝塞尔', fn: () => A().setInterp('both', 'bezier') }, { label: '时间插值：定格', fn: () => A().setInterp('both', 'hold') }, { sep: true }, { label: '空间插值：线性（尖角）', fn: () => A().setSpatial('lin') }, { label: '空间插值：自动贝塞尔', fn: () => A().setSpatial('auto') }, { label: '空间插值：贝塞尔（手动）', fn: () => A().setSpatial('bez') }]);
    mk('视图', () => [{ label: '适合窗口', key: 'Shift+/', fn: () => { App.view.zoom = 0; App.requestRender(); } }, { label: '放大到 100%', key: 'Ctrl+1', fn: () => { AE.Viewer.setZoom(1); } }, { sep: true }, { label: '网格', check: App.opts.grid, fn: () => { App.opts.grid = !App.opts.grid; App.requestRender(); } }, { label: '安全框', check: App.opts.safe, fn: () => { App.opts.safe = !App.opts.safe; App.requestRender(); } }, { label: '透明网格', check: App.opts.checker, fn: () => { App.opts.checker = !App.opts.checker; App.requestRender(); } }, { label: '运动路径', check: App.opts.motionPaths, fn: () => { App.opts.motionPaths = !App.opts.motionPaths; App.requestRender(); } }, { label: '手柄与辅助元素', check: App.opts.handles, fn: () => { App.opts.handles = !App.opts.handles; App.requestRender(); } }, { sep: true }, { label: '预览分辨率：完整', check: App.quality === 1, fn: () => { App.quality = 1; App.requestRender(); } }, { label: '预览分辨率：一半', check: App.quality === 0.5, fn: () => { App.quality = 0.5; App.requestRender(); } }, { label: '预览分辨率：四分之一', check: App.quality === 0.25, fn: () => { App.quality = 0.25; App.requestRender(); } }]);
    mk('帮助', () => [{ label: '快捷键一览', fn: () => UI.helpKeys() }, { label: '字体与字符范围', fn: () => UI.fontInfo() }]);
    bar.append(h('div', { class: 'spacer' }), h('span', { class: 'proj-name', id: 'projName' }));
  };
  UI.workStart = () => { const c = App.comp; c.work[0] = Math.min(App.time, c.work[1] - 1 / c.fps); App.changed('struct'); App.commit('工作区起点'); };
  UI.workEnd = () => { const c = App.comp; c.work[1] = Math.max(App.time + 1 / c.fps, c.work[0] + 1 / c.fps); App.changed('struct'); App.commit('工作区终点'); };
  UI.compDialog = (comp) => {
    const isNew = !comp; const c = comp || { name: '合成 ' + (App.project.comps.length + 1), w: 1920, h: 1080, fps: 30, dur: 10, bg: [0.06, 0.07, 0.09] };
    const f = {}; const row = (label, el) => h('div', { class: 'row', style: { marginBottom: '6px' } }, h('label', { style: { width: '70px', color: 'var(--txt2)' }, text: label }), el);
    f.name = h('input', { type: 'text', value: c.name, style: { width: '200px' } }); f.w = h('input', { type: 'number', value: c.w, style: { width: '80px' } }); f.h = h('input', { type: 'number', value: c.h, style: { width: '80px' } });
    f.fps = h('input', { type: 'number', value: c.fps, style: { width: '80px' } }); f.dur = h('input', { type: 'number', value: c.dur, step: 0.5, style: { width: '80px' } }); f.bg = UI.color({ value: [...c.bg, 1], alpha: false });
    f.mb = h('input', { type: 'checkbox' }); f.mb.checked = !!c.mb?.on; f.ang = h('input', { type: 'number', value: c.mb ? c.mb.angle : 180, style: { width: '70px' } }); f.ph = h('input', { type: 'number', value: c.mb ? c.mb.phase : -90, style: { width: '70px' } });
    const body = h('div', null, row('名称', f.name), row('尺寸', h('div', { class: 'row' }, f.w, '×', f.h, h('span', { class: 'muted', text: 'px' }))), row('帧率', f.fps), row('时长(秒)', f.dur), row('背景色', f.bg), h('div', { class: 'muted', style: { margin: '8px 0 4px' }, text: '运动模糊' }), row('总开关', f.mb), row('快门角度', f.ang), row('快门相位', f.ph));
    UI.modal(isNew ? '新建合成' : '合成设置', body, [{ label: '取消' }, { label: '确定', primary: true, fn: () => { const o = { name: f.name.value || c.name, w: Math.max(16, +f.w.value | 0), h: Math.max(16, +f.h.value | 0), fps: U.clamp(+f.fps.value || 30, 1, 120), dur: Math.max(0.2, +f.dur.value || 10) }; const bg = f.bg.querySelector('input[type=color]').value; const bgc = U.C.hex(bg); o.bg = [bgc[0], bgc[1], bgc[2]]; if (isNew) { const nc = A().newComp(o); nc.mb = { on: f.mb.checked, angle: +f.ang.value, phase: +f.ph.value, samples: 12 }; nc.work = [0, nc.dur]; App.changed('struct'); App.commit('新建合成'); } else { A().compSettings(comp, o); comp.mb.on = f.mb.checked; comp.mb.angle = +f.ang.value; comp.mb.phase = +f.ph.value; App.changed('struct'); App.commit('合成设置'); } } }]);
  };
  UI.helpKeys = () => {
    const keys = [['空格', '播放 / 暂停'], ['Ctrl+Z', '撤销'], ['Ctrl+Shift+Z / Ctrl+Y', '重做'], ['F9', '缓入缓出（关键帧）'], ['Shift+F9', '仅缓入'], ['Ctrl+Shift+F9', '仅缓出'], ['Ctrl+Shift+C', '预合成所选图层'], ['Ctrl+D', '复制图层'], ['Ctrl+C / Ctrl+V', '复制 / 粘贴（选中关键帧时作用于关键帧）'], ['Delete', '删除所选关键帧 / 图层 / 节点'], ['← → / Shift+← →', '逐帧 / 10 帧'], ['J / K', '跳到上一个 / 下一个关键帧'], ['Home / End', '回到开头 / 结尾'], ['P S R T A', '仅显示位置 / 缩放 / 旋转 / 不透明度 / 锚点'], ['U', '显示所有动画属性'], ['B / N', '设置工作区起点 / 终点'], ['[ / ]', '将图层入点 / 出点移到当前时间'], ['V H Z G Q', '选择 / 抓手 / 缩放 / 钢笔 / 形状工具'], ['C', '轨道摄像机'], ['滚轮 / 空格+拖动', '视图缩放 / 平移'], ['Ctrl+S / Ctrl+O', '保存 / 打开工程']];
    UI.modal('快捷键', h('table', { class: 'keys' }, keys.map(k => h('tr', null, h('td', { text: k[0] }), h('td', { text: k[1] })))), [{ label: '关闭' }]);
  };
  UI.fontInfo = () => {
    const F = AE.Font; UI.modal('字体与字符范围', h('div', { style: { lineHeight: 1.8, maxWidth: '520px' } }, h('div', null, h('b', { text: '锻造黑（内置）' }), '：随项目提供的笔画骨架字体，字形轮廓由骨架笔画生成，可转为几何、挤出、形变。'), h('div', { class: 'muted', text: F.rangeText() }), h('div', { style: { marginTop: '8px' } }, h('b', { text: '系统黑体' }), '：未收录字符及拉丁字符通过系统字体光栅描边得到矢量轮廓（支持常用汉字、字母、数字）。'), h('div', { class: 'muted', style: { marginTop: '6px' }, text: '示例工程默认使用内置字体「金」，将文字图层内容改为任意其他字符即可重新生成字块、变形与火星。' })), [{ label: '关闭' }]);
  };

  // ===== 复制/粘贴/删除路由 =====
  UI.doCopy = () => { if (App.sel.keys.length) AE.Actions.copyKeys(); else AE.Actions.copyLayers(); };
  UI.doPaste = () => { if (App.clip.keys && App.sel.props.length + App.sel.keys.length > 0) { if (AE.Actions.pasteKeys()) return; } if (!AE.Actions.pasteLayers()) AE.Actions.pasteKeys(); };
  UI.doDelete = () => {
    if (App.sel.keys.length && AE.Actions.deleteKeys()) return;
    if (AE.NodeEditor && AE.NodeEditor.focused && AE.NodeEditor.deleteSelected()) return;
    if (AE.Viewer && AE.Viewer.deleteVertex && AE.Viewer.deleteVertex()) return;
    if (App.sel.layers.length) AE.Actions.remove();
  };

  // ===== 全局快捷键 =====
  const isTyping = t => t && (t.tagName === 'INPUT' && !['checkbox', 'range', 'color', 'button'].includes(t.type) || t.tagName === 'TEXTAREA' || t.isContentEditable);
  UI.initKeys = () => {
    window.addEventListener('keydown', e => {
      if (App.exporting) return;
      if (isTyping(e.target) || (e.target.tagName === 'SELECT')) return;
      const k = e.key; const ctrl = e.ctrlKey || e.metaKey; const sh = e.shiftKey; const c = App.comp; const fps = c.fps; let handled = true;
      if (ctrl && k.toLowerCase() === 'z') { sh ? App.redo() : App.undo(); }
      else if (ctrl && k.toLowerCase() === 'y') App.redo();
      else if (ctrl && sh && k.toLowerCase() === 'c') AE.Actions.precompose();
      else if (ctrl && k.toLowerCase() === 's') App.saveFile();
      else if (ctrl && k.toLowerCase() === 'o') App.openFile();
      else if (ctrl && k.toLowerCase() === 'd') AE.Actions.duplicate();
      else if (ctrl && k.toLowerCase() === 'c') UI.doCopy();
      else if (ctrl && k.toLowerCase() === 'v') UI.doPaste();
      else if (ctrl && k.toLowerCase() === 'a') AE.Actions.selectAll();
      else if (ctrl && k === '1') AE.Viewer.setZoom(1);
      else if (ctrl && k === ']') { const p = App.primary(); p && AE.Actions.reorder(p, -1); }
      else if (ctrl && k === '[') { const p = App.primary(); p && AE.Actions.reorder(p, 1); }
      else if (k === 'F9') { e.preventDefault(); AE.Actions.easyEase(ctrl && sh ? 'out' : sh ? 'in' : 'both'); }
      else if (k === ' ') { e.preventDefault(); App.togglePlay(); }
      else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); UI.doDelete(); }
      else if (k === 'ArrowLeft' && !ctrl) { App.stopPlay(); App.setTime(App.time - (sh ? 10 : 1) / fps); }
      else if (k === 'ArrowRight' && !ctrl) { App.stopPlay(); App.setTime(App.time + (sh ? 10 : 1) / fps); }
      else if (k === 'PageUp') App.setTime(App.time - 1 / fps); else if (k === 'PageDown') App.setTime(App.time + 1 / fps);
      else if (k === 'Home') App.setTime(0); else if (k === 'End') App.setTime(c.dur);
      else if (k.toLowerCase() === 'j' && !ctrl) UI.jumpKey(-1); else if (k.toLowerCase() === 'k' && !ctrl) UI.jumpKey(1);
      else if (k.toLowerCase() === 'b' && !ctrl) UI.workStart(); else if (k.toLowerCase() === 'n' && !ctrl) UI.workEnd();
      else if (k === '[' || k === ']') { const p = App.primary(); if (p) { App.edit('入出点', () => { if (k === '[') p.in = Math.min(App.time, p.out - 1 / fps); else p.out = Math.max(App.time, p.in + 1 / fps); }); } }
      else if (!ctrl && ['p', 's', 'r', 't', 'a', 'u'].includes(k.toLowerCase())) { AE.Timeline && AE.Timeline.showOnly(k.toLowerCase(), sh); }
      else if (!ctrl && 'vhzgqc'.includes(k.toLowerCase()) && k.length === 1) { AE.Viewer.setTool({ v: 'select', h: 'hand', z: 'zoom', g: 'pen', q: App.tool === 'rect' ? 'ellipse' : 'rect', c: 'orbit' }[k.toLowerCase()]); }
      else if (k === '/' && sh) { App.view.zoom = 0; App.requestRender(); }
      else if (k === 'Escape') { UI.closePopup(); AE.Viewer.cancelTool && AE.Viewer.cancelTool(); }
      else handled = false;
      if (handled) e.preventDefault();
    });
  };
  UI.jumpKey = (dir) => {
    const L = App.primary(); if (!L) return; const ts = []; for (const k of Model.allPropKeys(L)) { const p = L.props[k]; if (p && p.k) for (const kk of p.k) ts.push(kk.t); }
    ts.sort((a, b) => a - b); const t = App.time; const eps = 0.5 / App.fps(); const nxt = dir > 0 ? ts.find(x => x > t + eps) : [...ts].reverse().find(x => x < t - eps); if (nxt !== undefined) App.setTime(nxt);
  };
})();
