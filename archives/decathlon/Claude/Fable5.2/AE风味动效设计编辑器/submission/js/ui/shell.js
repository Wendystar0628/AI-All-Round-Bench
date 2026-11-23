// 界面外壳：布局、菜单栏、工具栏、分隔条、对话框、主循环
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const App = MF.App, h = MF.h, W = MF.W, C = MF.Cmd;

  const TOOLS = [['select', '选择工具 (V)', 'select'], ['hand', '手形工具 (H / 空格)', 'hand'], ['zoom', '缩放工具 (Z)', 'zoom'], ['rotate', '旋转工具 (W)', 'rotate'], ['anchor', '锚点工具 (Y)', 'anchor'], ['camera', '摄像机工具 (C)', 'camera'], null,
    ['rect', '矩形工具 (Q)', 'rect'], ['ellipse', '椭圆工具 (Q)', 'ellipse'], ['star', '星形工具 (Q)', 'star'], ['pen', '钢笔工具 (G)', 'pen'], ['text', '文字工具 (Ctrl+T)', 'text'], ['pin', '图钉工具 (Ctrl+P)', 'pin']];

  const Shell = (MF.Shell = {
    init(root) {
      const mk = (id, title, extra) => { const body = h('div', { class: 'pbody' }); const head = h('div', { class: 'phead' }, h('div', { class: 'ptab on' }, title)); const p = h('div', { class: 'panel', id }, head, body); p._body = body; p._head = head; head.addEventListener('dblclick', (e) => { if (e.target.closest('.tbtn,select,input,.chip')) return; Shell.maximize(id); }); void extra; return p; };
      const top = h('div', { id: 'topbar' });
      const left = mk('left', '项目'), viewer = mk('viewer', '合成'), right = mk('right', '属性');
      const timeline = mk('timeline', '时间轴'), graph = mk('graph', '曲线'), nodes = mk('nodes', '节点');
      const vs = (v, min, max, sign, target) => { const s = h('div', { class: 'vsplit' }); Shell.splitter(s, v, min, max, sign, 'x', target); return s; };
      const main = h('div', { id: 'main' }, left, vs('--lw', 150, 480, 1, 'main'), viewer, vs('--rw', 220, 620, -1, 'main'), right);
      const hsplit = h('div', { id: 'hsplit' }); Shell.splitter(hsplit, '--bh', 140, 900, -1, 'y', 'app');
      const bottom = h('div', { id: 'bottom' }, timeline, vs('--gw', 160, 900, -1, 'bottom'), graph, vs('--nw', 200, 1100, -1, 'bottom'), nodes);
      root.append(top, main, hsplit, bottom); Shell.root = root; Shell.panels = { left, viewer, right, timeline, graph, nodes };
      Shell.buildTop(top);
      // 画布
      const stage = h('div', { id: 'stage' }); viewer._body.style.overflow = 'hidden'; viewer._body.appendChild(stage); MF.Viewport.init(stage);
      Shell.buildViewerBar(viewer); Shell.viewerTab = viewer._head.querySelector('.ptab');
      if (MF.ProjectPanel) MF.ProjectPanel.init(left); if (MF.Props) MF.Props.init(right); if (MF.Timeline) MF.Timeline.init(timeline); if (MF.Graph) MF.Graph.init(graph); if (MF.NodeView) MF.NodeView.init(nodes);
      document.body.appendChild(h('div', { id: 'toasts' }));
      App.on('toast', (msg, kind) => { const t = h('div', { class: 'toast ' + (kind || '') }, msg); const box = document.getElementById('toasts'); box.appendChild(t); while (box.children.length > 3) box.firstChild.remove(); setTimeout(() => t.remove(), kind === 'err' ? 4200 : 1900); });
      App.on('project', () => Shell.refreshTop()); App.on('time', () => Shell.refreshTime()); App.on('play', () => Shell.refreshTop()); App.on('tool', () => Shell.refreshTop()); App.on('view', () => Shell.refreshTop()); App.on('selection', () => Shell.refreshTop());
      const loop = () => { requestAnimationFrame(loop); if (App.exporting) return; App.tick(); if (App.dirty) { App.dirty = false; MF.Viewport.render(); } };
      requestAnimationFrame(loop);
    },
    splitter(el, cssVar, min, max, sign, axis, target) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); const host = target === 'app' ? Shell.root : document.getElementById(target); const cs = getComputedStyle(host).getPropertyValue(cssVar).trim(); const total = axis === 'x' ? host.clientWidth : host.clientHeight;
        let cur; const sib = sign > 0 ? el.previousElementSibling : el.nextElementSibling; cur = axis === 'x' ? sib.getBoundingClientRect().width : sib.getBoundingClientRect().height; void cs;
        const x0 = axis === 'x' ? e.clientX : e.clientY; el.classList.add('splitting');
        W.drag(e, (ev) => { const d = ((axis === 'x' ? ev.clientX : ev.clientY) - x0) * sign; const v = MF.clamp(cur + d, min, Math.min(max, total - 120)); host.style.setProperty(cssVar, v + 'px'); MF.Viewport.resize(); App.emit('layout'); }, () => { el.classList.remove('splitting'); App.emit('layout'); });
      });
    },
    maximize(id) { const r = Shell.root; if (id === 'viewer') { r.classList.toggle('max-view'); r.classList.remove('max-bottom'); } else if (id === 'timeline' || id === 'graph' || id === 'nodes') { r.classList.toggle('max-bottom'); r.classList.remove('max-view'); } setTimeout(() => { MF.Viewport.resize(); App.emit('layout'); }, 0); },
    // ---------- 顶栏 ----------
    buildTop(top) {
      const logo = h('span', { html: '<svg viewBox="0 0 24 24"><path d="M3 8h13c2.5 0 4.5 1 5.5 3H13v3h3l1 5H6l1-5h2v-3H5.5C4 11 3 9.8 3 8z" fill="#ff6a2b"/><path d="M18 2l.8 2.2L21 5l-2.2.8L18 8l-.8-2.2L15 5l2.2-.8z" fill="#ffb347"/></svg>' });
      top.appendChild(h('div', { class: 'brand' }, logo, h('span', null, '锻影'), h('small', null, 'MOTIONFORGE')));
      const menus = Shell.menus();
      for (const name of Object.keys(menus)) { const b = h('button', null, name); const m = h('div', { class: 'menu' }, b); b.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (m.classList.contains('open')) { W.closeMenus(); return; } const r = b.getBoundingClientRect(); W.menu(r.left, r.bottom + 2, menus[name](), m); }); b.addEventListener('pointerenter', () => { if (W._menu && W._menuAnchor && W._menuAnchor !== m && W._menuAnchor.classList.contains('menu')) { const r = b.getBoundingClientRect(); W.menu(r.left, r.bottom + 2, menus[name](), m); } }); top.appendChild(m); }
      const tools = h('div', { class: 'tools' }); Shell.toolBtns = {};
      for (const t of TOOLS) { if (!t) { tools.appendChild(h('span', { style: { width: '8px' } })); continue; } const b = h('button', { class: 'tbtn', onclick: () => MF.Tools.setTool(t[0]) }, W.icon(t[2])); W.tip(b, t[1]); Shell.toolBtns[t[0]] = b; tools.appendChild(b); }
      top.appendChild(tools);
      Shell.status = h('div', { class: 'topright' }); top.appendChild(Shell.status);
      Shell.refreshTop();
    },
    refreshTop() {
      for (const k in Shell.toolBtns) Shell.toolBtns[k].classList.toggle('on', App.tool === k);
      const c = App.comp(); const st = Shell.status; if (!st) return; st.innerHTML = '';
      if (App.project) st.appendChild(h('span', { class: 'pill' }, '工程 ', h('b', null, App.project.name || '未命名')));
      st.appendChild(h('span', { class: 'pill', title: '撤销步数' }, '历史 ', h('b', null, (App.hIndex + 1) + '/' + App.history.length)));
      if (MF.Audio) st.appendChild(h('span', { class: 'pill', title: '声音状态' }, '声音 ', h('b', null, MF.Audio.status())));
      if (Shell.viewerTab) Shell.viewerTab.textContent = '合成' + (c ? ' · ' + c.name : '');
      if (Shell.playBtn) { Shell.playBtn.innerHTML = ''; Shell.playBtn.appendChild(W.icon(App.playing ? 'pause' : 'play')); Shell.playBtn.classList.toggle('on', App.playing); }
      if (Shell.zoomSel) Shell.zoomSel.value = App.view.fit ? 'fit' : '';
      if (Shell.zoomLab) Shell.zoomLab.textContent = Math.round(App.view.scale * 100) + '%';
      if (Shell.mbBtn && c) Shell.mbBtn.classList.toggle('on', !!c.mb.on);
      if (Shell.loopBtn) Shell.loopBtn.classList.toggle('on', App.loop);
      Shell.refreshTime();
    },
    tc(t, fps) { const f = Math.round(t * fps); const ff = f % Math.round(fps), s = Math.floor(f / Math.round(fps)); const p = (n, l) => String(n).padStart(l || 2, '0'); return p(Math.floor(s / 60)) + ':' + p(s % 60) + ':' + p(ff); },
    refreshTime() { const c = App.comp(); if (Shell.tcEl) Shell.tcEl.textContent = c ? Shell.tc(App.time, c.fps) + '  ' + App.time.toFixed(2) + 's' : '--:--:--'; },
    buildViewerBar(viewer) {
      const bar = h('div', { class: 'vbar' });
      const tb = (ic, tip, fn, cls) => { const b = h('button', { class: 'tbtn sm ' + (cls || ''), onclick: fn }, W.icon(ic)); W.tip(b, tip); return b; };
      Shell.playBtn = tb('play', '播放 / 暂停（空格）', () => App.toggle()); Shell.loopBtn = tb('loop', '循环工作区', () => { App.loop = !App.loop; Shell.refreshTop(); });
      Shell.tcEl = h('span', { class: 'tc' });
      Shell.zoomLab = h('span', { class: 'mini', style: { minWidth: '42px', textAlign: 'center', lineHeight: '18px' } });
      Shell.zoomSel = W.select([['', '缩放'], ['fit', '适合'], ['0.25', '25%'], ['0.5', '50%'], ['1', '100%'], ['2', '200%'], ['4', '400%']], 'fit', (v) => { if (v === 'fit') MF.Viewport.fit(); else if (v) MF.Viewport.setZoom(+v); }, 'mini');
      const res = W.select([['0', '自动分辨率'], ['1', '完整'], ['0.5', '二分之一'], ['0.25', '四分之一']], '0', (v) => { App.ui.res = +v || 0; App.dirty = true; }, 'mini');
      Shell.mbBtn = tb('mb', '运动模糊总开关', () => { const c = App.comp(); if (c) App.edit('运动模糊总开关', () => { c.mb.on = !c.mb.on; }); });
      const chk = tb('max', '透明网格', () => { App.ui.checker = !App.ui.checker; chk.classList.toggle('on', App.ui.checker); App.dirty = true; });
      const mp = tb('path', '显示运动路径', () => { App.ui.showMotion = !App.ui.showMotion; mp.classList.toggle('on', App.ui.showMotion); App.dirty = true; }, 'on');
      const fd = tb('field', '显示场范围', () => { App.ui.showFields = !App.ui.showFields; fd.classList.toggle('on', App.ui.showFields); App.dirty = true; }, 'on');
      bar.append(h('div', { class: 'transport' }, tb('first', '回到工作区起点（Home）', () => { const c = App.comp(); if (c) { App.pause(); App.setTime(c.workIn); } }), tb('prev', '上一帧（PageUp）', () => App.step(-1)), Shell.playBtn, tb('next', '下一帧（PageDown）', () => App.step(1)), tb('last', '到工作区终点（End）', () => { const c = App.comp(); if (c) { App.pause(); App.setTime(c.workOut - 1 / c.fps); } }), Shell.loopBtn),
        Shell.tcEl, h('span', { class: 'sp' }), Shell.mbBtn, mp, fd, chk, res, Shell.zoomLab, Shell.zoomSel, tb('fit', '适合窗口（Shift+/）', () => MF.Viewport.fit()));
      viewer.appendChild(bar);
    },
    // ---------- 菜单 ----------
    menus() {
      const has = () => App.sel.layers.length > 0, c = () => App.comp();
      const newLayer = () => [
        { label: '形状图层', run: () => C.addLayer('shape') }, { label: '文字', key: 'Ctrl+Alt+Shift+T', run: () => C.addLayer('text') }, { label: '空对象', key: 'Ctrl+Alt+Shift+Y', run: () => C.addLayer('null') }, { label: '调整图层', key: 'Ctrl+Alt+Y', run: () => C.addLayer('adjust') }, '-',
        { label: '摄像机', key: 'Ctrl+Alt+Shift+C', run: () => C.addLayer('camera') }, { label: '平行光', key: 'Ctrl+Alt+Shift+L', run: () => C.addLayer('light', { kind: 'parallel', name: '平行光' }) }, { label: '点光源', run: () => C.addLayer('light', { kind: 'point', name: '点光源' }) }, '-',
        { label: '三维几何（文字挤出）', run: () => Shell.newGeoDialog() }, { label: '三维几何（方块）', run: () => C.addLayer('geo', { source: 'box' }) }, { label: '粒子', run: () => C.addLayer('particles') }, { label: '音色', run: () => C.addLayer('audio') },
      ];
      return {
        文件: () => [{ label: '新建工程', run: () => App.newProject() }, { label: '打开工程…', key: 'Ctrl+O', run: () => App.open() }, { label: '保存工程', key: 'Ctrl+S', run: () => App.save() }, '-', { label: '载入示例「锻字」', run: () => MF.Demo && MF.Demo.load() }],
        编辑: () => [{ label: '撤销', key: 'Ctrl+Z', run: () => App.undo(), dis: App.hIndex <= 0 }, { label: '重做', key: 'Ctrl+Shift+Z / Ctrl+Y', run: () => App.redo(), dis: App.hIndex >= App.history.length - 1 }, '-',
          { label: '复制', key: 'Ctrl+C', run: () => C.copy() }, { label: '粘贴', key: 'Ctrl+V', run: () => C.paste() }, { label: '重复', key: 'Ctrl+D', run: () => C.duplicateLayers(), dis: !has() }, { label: '删除', key: 'Delete', run: () => MF.Keys.del() }, '-',
          { label: '全选', key: 'Ctrl+A', run: () => C.selectAll() }, { label: '取消全选', key: 'F2', run: () => { App.selectLayers([]); App.selectNodes([]); } }],
        合成: () => [{ label: '新建合成…', key: 'Ctrl+N', run: () => Shell.compDialog(null) }, { label: '合成设置…', key: 'Ctrl+K', run: () => Shell.compDialog(c()), dis: !c() }, '-', { label: '预合成…', key: 'Ctrl+Shift+C', run: () => Shell.precomposeDialog(), dis: !has() }, '-',
          { label: '运动模糊总开关', chk: c() && c().mb.on, run: () => App.edit('运动模糊总开关', () => { c().mb.on = !c().mb.on; }), dis: !c() }, { label: '工作区起点设为当前时间', key: 'B', run: () => C.setWorkArea('in'), dis: !c() }, { label: '工作区终点设为当前时间', key: 'N', run: () => C.setWorkArea('out'), dis: !c() }],
        图层: () => [{ hd: '新建' }, ...newLayer(), '-', { label: '切换三维图层', run: () => C.toggle3D(), dis: !has() }, { label: '切换运动模糊', run: () => C.toggleMB(), dis: !has() }, { label: '启用/停用时间重映射', key: 'Ctrl+Alt+T', run: () => { const L = App.selLayers().find((l) => l.type === 'precomp'); if (L) C.enableRemap(L); else App.toast('请选择一个预合成图层'); } },
          { label: '从文字创建形状', run: () => C.textToShape() }, '-', { label: '上移一层', key: 'Ctrl+]', run: () => C.moveLayers('up'), dis: !has() }, { label: '下移一层', key: 'Ctrl+[', run: () => C.moveLayers('down'), dis: !has() }, { label: '置顶', key: 'Ctrl+Shift+]', run: () => C.moveLayers('top'), dis: !has() }, { label: '置底', key: 'Ctrl+Shift+[', run: () => C.moveLayers('bottom'), dis: !has() }, '-',
          { label: '入点移到当前时间', key: '[', run: () => C.moveInTo(), dis: !has() }, { label: '出点移到当前时间', key: ']', run: () => C.moveOutTo(), dis: !has() }, { label: '修剪入点到当前时间', key: 'Alt+[', run: () => C.trimIn(), dis: !has() }, { label: '修剪出点到当前时间', key: 'Alt+]', run: () => C.trimOut(), dis: !has() }],
        动画: () => [{ label: '缓动', key: 'F9', run: () => C.ease('ease') }, { label: '缓入', key: 'Shift+F9', run: () => C.ease('easeIn') }, { label: '缓出', key: 'Ctrl+Shift+F9', run: () => C.ease('easeOut') }, { label: '线性', run: () => C.ease('linear') }, { label: '定格', key: 'Ctrl+Alt+H', run: () => C.ease('hold') }, '-',
          { label: '空间插值：直线', run: () => C.spatial('linear') }, { label: '空间插值：自动贝塞尔', run: () => C.spatial('auto') }, '-', { label: '上一个关键帧', key: 'J', run: () => C.jumpKey(-1) }, { label: '下一个关键帧', key: 'K', run: () => C.jumpKey(1) }, { label: '显示有动画的属性', key: 'U', run: () => C.revealAnimated() }],
        效果: () => Object.keys(MF.Schema.effects).map((k, i) => (k === 'slider' ? ['-', { hd: '表达式控制' }, { label: MF.Schema.effects[k].label, run: () => C.addEffect(k) }] : [{ label: MF.Schema.effects[k].label, run: () => C.addEffect(k) }])).flat().map((x, i) => (void i, x)),
        视图: () => [{ label: '适合窗口', key: 'Shift+/', run: () => MF.Viewport.fit() }, { label: '100%', run: () => MF.Viewport.setZoom(1) }, { label: '放大', key: '.', run: () => MF.Viewport.setZoom(App.view.scale * 1.25) }, { label: '缩小', key: ',', run: () => MF.Viewport.setZoom(App.view.scale / 1.25) }, '-',
          { label: '显示运动路径', chk: App.ui.showMotion, run: () => { App.ui.showMotion = !App.ui.showMotion; App.dirty = true; } }, { label: '显示场范围', chk: App.ui.showFields, run: () => { App.ui.showFields = !App.ui.showFields; App.dirty = true; } }, { label: '透明网格', chk: App.ui.checker, run: () => { App.ui.checker = !App.ui.checker; App.dirty = true; } }, '-',
          { label: '最大化/还原 画布', key: '`', run: () => Shell.maximize('viewer') }, { label: '最大化/还原 下方面板', key: 'Shift+`', run: () => Shell.maximize('timeline') }],
        帮助: () => [{ label: '快捷键一览…', key: 'F1', run: () => Shell.keysDialog() }, { label: '字体与字符范围…', run: () => Shell.fontDialog() }, { label: '表达式参考…', run: () => Shell.exprDialog() }],
      };
    },
    compDialog(c) {
      const isNew = !c; const d = c || { name: '合成 ' + ((App.project ? App.project.comps.length : 0) + 1), w: 1920, h: 1080, fps: 30, duration: 10, bg: [0.06, 0.06, 0.07], mb: { angle: 180, phase: -90, samples: 8 }, env: { preset: 'studio', intensity: 1, exposure: 1, rotation: 0 } };
      W.modal(isNew ? '新建合成' : '合成设置', [
        { key: 'name', label: '名称', type: 'text', value: d.name }, { key: 'w', label: '宽度 (px)', type: 'number', value: d.w }, { key: 'h', label: '高度 (px)', type: 'number', value: d.h }, { key: 'fps', label: '帧率', type: 'number', value: d.fps }, { key: 'duration', label: '时长 (秒)', type: 'number', value: d.duration }, { key: 'bg', label: '背景色', type: 'color', value: d.bg },
        { type: 'note', html: '<b>运动模糊</b>（图层开关 + 合成总开关共同生效）' }, { key: 'angle', label: '快门角度 (°)', type: 'number', value: d.mb.angle }, { key: 'phase', label: '快门相位 (°)', type: 'number', value: d.mb.phase }, { key: 'samples', label: '每帧取样数', type: 'number', value: d.mb.samples },
        { type: 'note', html: '<b>三维环境</b>（程序生成的环境照明与反射）' }, { key: 'preset', label: '环境', type: 'select', value: d.env.preset, options: [['studio', '影棚'], ['forge', '锻炉'], ['sky', '天空'], ['neutral', '中性灰']] }, { key: 'intensity', label: '环境强度', type: 'number', value: d.env.intensity, step: 0.1 }, { key: 'exposure', label: '曝光', type: 'number', value: d.env.exposure, step: 0.1 }, { key: 'rotation', label: '环境旋转 (°)', type: 'number', value: d.env.rotation || 0 },
      ], (v) => {
        const apply = (t) => { t.name = v.name || t.name; t.w = MF.clamp(Math.round(v.w) || 1920, 16, 8192); t.h = MF.clamp(Math.round(v.h) || 1080, 16, 8192); t.fps = MF.clamp(+v.fps || 30, 1, 240); const od = t.duration; t.duration = MF.clamp(+v.duration || 10, 0.1, 3600); t.bg = v.bg; t.mb.angle = MF.clamp(+v.angle, 0, 720); t.mb.phase = MF.clamp(+v.phase, -360, 360); t.mb.samples = MF.clamp(Math.round(+v.samples), 2, 64); t.env = { preset: v.preset, intensity: +v.intensity, exposure: +v.exposure, rotation: +v.rotation || 0 }; if (t.workOut >= od - 1e-6 || t.workOut > t.duration) t.workOut = t.duration; t.workIn = Math.min(t.workIn, t.workOut - 1 / t.fps); for (const L of t.layers) if (L.out >= od - 1e-6 && t.duration > od) L.out = t.duration; };
        if (isNew) { if (!App.project) App.newProject(); const nc = C.newComp({ name: v.name, w: v.w, h: v.h, fps: v.fps, duration: v.duration }); App.edit('合成设置', () => apply(nc)); } else App.edit('合成设置', () => apply(c));
        MF.Viewport.fit();
      });
    },
    precomposeDialog() { if (!App.sel.layers.length) { App.toast('请先选择要预合成的图层'); return; } W.modal('预合成', [{ key: 'name', label: '新合成名称', type: 'text', value: '预合成 ' + (App.project.comps.length) }, { type: 'note', html: '所选图层的全部属性移入新合成；未选中的父级以空对象代理带入，画面在各时刻保持一致。' }], (v) => C.precompose(v.name)); },
    newGeoDialog() { W.modal('新建三维几何', [{ key: 'text', label: '文字', type: 'text', value: '锻' }, { type: 'note', html: '将创建节点链：文字字形 → 三角网格 → 挤出 → 三维变换 → 显示。可在节点视图中继续修改。' }], (v) => C.addLayer('geo', { text: v.text || '锻' })); },
    keysDialog() {
      const rows = [['空格', '播放 / 暂停'], ['PageUp / PageDown', '上一帧 / 下一帧（Shift ×10）'], ['Home / End', '跳到开头 / 结尾'], ['J / K', '上一个 / 下一个关键帧'], ['B / N', '设置工作区起点 / 终点'], ['I / O', '跳到图层入点 / 出点'], ['[ / ]', '把图层入点 / 出点移到当前时间'], ['Alt+[ / Alt+]', '修剪图层入点 / 出点'],
        ['F9', '缓动（Shift 缓入，Ctrl+Shift 缓出）'], ['Ctrl+Alt+H', '定格关键帧'], ['Alt+单击秒表', '添加 / 启停表达式'], ['U', '显示有动画的属性'], ['P / S / R / T / A', '展开 位置 / 缩放 / 旋转 / 不透明度 / 锚点'], ['Alt+Shift+P/S/R/T', '在当前时刻给对应属性打关键帧'],
        ['Ctrl+Z', '撤销'], ['Ctrl+Shift+Z / Ctrl+Y', '重做'], ['Ctrl+C / Ctrl+V', '复制 / 粘贴（图层、关键帧、节点）'], ['Ctrl+D', '重复图层 / 节点'], ['Delete', '删除所选'], ['Ctrl+A / F2', '全选 / 取消全选'], ['Ctrl+Shift+C', '预合成'], ['Ctrl+N / Ctrl+K', '新建合成 / 合成设置'], ['Ctrl+S / Ctrl+O', '保存 / 打开工程'],
        ['Ctrl+] / Ctrl+[', '图层上移 / 下移（加 Shift 置顶 / 置底）'], ['V H Z W Y C', '选择 / 手形 / 缩放 / 旋转 / 锚点 / 摄像机 工具'], ['Q G', '形状工具（循环）/ 钢笔'], ['Ctrl+T / Ctrl+P', '文字工具 / 图钉工具'], ['Ctrl+G', '把选中的节点封装为节点组'], ['= / -', '时间轴放大 / 缩小'], [', / .', '画布缩小 / 放大'], ['Shift+/', '画布适合窗口'], ['`', '最大化画布（Shift+` 最大化下方面板）'], ['方向键', '微移所选图层（Shift ×10）'], ['Enter', '重命名所选图层']];
      W.modal('快捷键', [{ type: 'custom', el: h('table', { class: 'kbd-table' }, rows.map((r) => h('tr', null, h('td', null, r[0]), h('td', null, r[1])))) }, { type: 'note', html: '输入文字、数值或表达式时，编辑器快捷键不会抢占输入。' }], null, '关闭');
    },
    fontDialog() { W.modal('字体与字符范围', [{ type: 'custom', el: h('div', null, MF.Fonts.list.map((f) => h('div', { class: 'fontinfo' }, h('b', null, f.label), '　' + f.count.toLocaleString() + ' 个字符' + (f.strokes ? '（含逐笔轮廓与笔顺中线，可用于“笔画书写”）' : ''), h('i', null, f.license)))) }, { type: 'note', html: '锻楷覆盖 9,574 个汉字（笔画数据）并附带拉丁字母、数字与常用标点；思源黑体 Heavy 覆盖 7,946 个字符（含 7,333 个汉字）。字体中没有的字符显示为方框并在属性面板提示。字形轮廓可转为几何，参与形变、变形与三维挤出。' }], null, '关闭'); },
    exprDialog() { W.modal('表达式参考', [{ type: 'note', html: ['<b>time</b>、<b>value</b>、<b>wiggle(频率, 幅度)</b>（可复现）', '<b>loopOut("cycle" | "pingpong" | "offset" | "continue")</b>、loopIn(...)', '<b>linear(t, tMin, tMax, a, b)</b>、<b>ease(...)</b>、easeIn、easeOut、clamp', '<b>thisComp.layer("名称").transform.rotation</b>、.position[0]、.effect("滑块控制")("滑块")', '<b>属性.valueAtTime(t)</b>：读取所引用属性在其所属合成第 t 秒的最终值', 'comp("合成名").layer(...)、thisLayer、parent、toWorld([x,y,z])', 'thisComp.node("节点名").param("参数") / .output("端口")', '向量运算：add、sub、mul、div、length、normalize、dot、cross', 'random(a,b)、seedRandom(seed, true)、noise(x)、Math.*', '循环引用或出错时给出提示并退回关键帧值。'].join('<br>') }], null, '关闭'); },
  });
})();
