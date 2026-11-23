/* ============================================================
   ui.js — 界面核心：菜单、项目面板、查看器、属性面板、交互工具
   ============================================================ */
(function (global) {
  'use strict';
  const M = MODEL, P_ = () => MODEL.Project;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

  const UI = {
    dirty: true, overlayDirty: true, tool: 'select', drag: null, hoverLayer: null,
    marquee: null, penPts: [], lastRender: 0, fpsAcc: 0, fpsN: 0, fps: 0,
    selectedKeys: [], clip: null, guidePts: [], mouse: { x: 0, y: 0, cx: 0, cy: 0, inside: false }
  };

  function comp() { return M.activeComp(); }
  function selLayers() { const c = comp(); if (!c) return []; return P_().selection.map(id => c.layers.find(l => l.id === id)).filter(Boolean); }
  UI.comp = comp; UI.selLayers = selLayers;

  /* ---------------- 状态刷新 ---------------- */
  UI.refresh = function (full) {
    UI.dirty = true; UI.overlayDirty = true;
    if (full !== false) {
      UI.buildProject();
      UI.buildInspector();
      if (global.UI_TIMELINE) UI_TIMELINE.buildLayerRows();
      UI.updateTransport();
      UI.updateMenus();
    }
  };
  UI.invalidate = function () { UI.dirty = true; UI.overlayDirty = true; };

  /* ---------------- 提示 ---------------- */
  let toastTimer = null;
  UI.toast = function (msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
  };
  UI.status = function (msg) { $('#status-text').textContent = msg; };

  /* ---------------- 菜单 ---------------- */
  const MENUS = [
    { label: '文件', items: [
      { label: '新建工程', sc: 'Ctrl+N', act: () => UI.newProject() },
      { label: '打开工程…', sc: 'Ctrl+O', act: () => $('#file-open').click() },
      { label: '保存工程', sc: 'Ctrl+S', act: () => UI.saveProject() },
      { sep: true },
      { label: '导出当前帧 PNG', act: () => UI.exportFrame() },
      { label: '导出工程 JSON', act: () => UI.exportJSON() }
    ] },
    { label: '编辑', items: [
      { label: '撤销', sc: 'Ctrl+Z', act: () => UI.undo() },
      { label: '重做', sc: 'Ctrl+Shift+Z', act: () => UI.redo() },
      { sep: true },
      { label: '复制图层', sc: 'Ctrl+D', act: () => UI.duplicateLayer() },
      { label: '删除图层', sc: 'Delete', act: () => UI.deleteLayer() },
      { sep: true },
      { label: '全选', sc: 'Ctrl+A', act: () => { const c = comp(); if (c) { P_().selection = c.layers.map(l => l.id); UI.refresh(); } } },
      { label: '取消选择', sc: 'Esc', act: () => { P_().selection = []; UI.refresh(); } }
    ] },
    { label: '合成', items: [
      { label: '新建合成…', act: () => UI.newCompDialog() },
      { label: '合成设置…', act: () => UI.compSettings() },
      { sep: true },
      { label: '预合成所选图层', sc: 'Ctrl+Shift+C', act: () => UI.precompose() },
      { label: '设置工作区', act: () => { const c = comp(); if (c) { c.workArea = [P_().time, P_().time + 5]; UI.refresh(); } } }
    ] },
    { label: '图层', items: [
      { label: '新建形状图层', act: () => UI.addLayer('shape') },
      { label: '新建文字图层', act: () => UI.addLayer('text') },
      { label: '新建空对象', act: () => UI.addLayer('null') },
      { label: '新建调整图层', act: () => UI.addLayer('adjust') },
      { label: '新建三维实体', act: () => UI.addLayer('solid') },
      { label: '新建粒子', act: () => UI.addLayer('particle') },
      { label: '新建空间场', act: () => UI.addLayer('field') },
      { label: '新建摄像机', act: () => UI.addLayer('camera') },
      { label: '新建灯光', act: () => UI.addLayer('light') },
      { label: '新建音色', act: () => UI.addLayer('audio') }
    ] },
    { label: '效果', items: [
      { label: '高斯模糊', act: () => UI.addEffect('blur') },
      { label: '发光', act: () => UI.addEffect('glow') },
      { label: '投影', act: () => UI.addEffect('shadow') },
      { label: '色相/饱和度/亮度', act: () => UI.addEffect('hsb') },
      { label: '填充', act: () => UI.addEffect('fill') }
    ] },
    { label: '视图', items: [
      { label: '网格', act: () => { P_().view.showGrid = !P_().view.showGrid; UI.updateViewerButtons(); } },
      { label: '辅助线与安全框', act: () => { P_().view.showGuides = !P_().view.showGuides; UI.updateViewerButtons(); } },
      { label: '图层控制', act: () => { P_().view.showOverlays = !P_().view.showOverlays; UI.updateViewerButtons(); } },
      { label: '空间场范围', act: () => { P_().view.showFields = !P_().view.showFields; UI.updateViewerButtons(); } },
      { sep: true },
      { label: '适合窗口', sc: '\\', act: () => UI.zoomFit() },
      { label: '实际大小', sc: 'Ctrl+\\', act: () => { P_().view.zoom = 1; UI.invalidate(); } }
    ] },
    { label: '帮助', items: [
      { label: '快捷键说明', act: () => UI.helpDialog() },
      { label: '关于', act: () => UI.toast('锻字 · AE 风味动效设计编辑器') }
    ] }
  ];

  UI.buildMenus = function () {
    const wrap = $('#menus'); wrap.innerHTML = '';
    for (const m of MENUS) {
      const it = el('div', 'menu-item', m.label);
      it.onclick = (e) => { e.stopPropagation(); UI.openMenu(it, m); };
      it.onmouseenter = () => { if ($('.menu-item.open')) UI.openMenu(it, m); };
      wrap.appendChild(it);
    }
  };
  UI.openMenu = function (anchor, menu) {
    UI.closeMenus();
    anchor.classList.add('open');
    const cm = $('#ctx-menu'); cm.innerHTML = ''; cm.classList.remove('hidden');
    for (const it of menu.items) {
      if (it.sep) { cm.appendChild(el('div', 'sep')); continue; }
      const d = el('div', 'ci', `<span>${it.label}</span><span class="sc">${it.sc || ''}</span>`);
      d.onclick = () => { UI.closeMenus(); it.act && it.act(); };
      cm.appendChild(d);
    }
    const r = anchor.getBoundingClientRect();
    cm.style.left = r.left + 'px'; cm.style.top = r.bottom + 'px';
    UI._menuOpen = true;
  };
  UI.closeMenus = function () {
    document.querySelectorAll('.menu-item.open').forEach(e => e.classList.remove('open'));
    $('#ctx-menu').classList.add('hidden');
    UI._menuOpen = false;
  };
  document.addEventListener('click', (e) => { if (!e.target.closest('#ctx-menu') && !e.target.closest('.menu-item')) UI.closeMenus(); });

  /* ---------------- 工程面板 ---------------- */
  UI.buildProject = function () {
    const wrap = $('#project-tree');
    wrap.innerHTML = '';
    const pr = P_();
    const g1 = el('div', 'tree-group');
    g1.appendChild(el('div', 'tree-group-title', '合成'));
    for (const id of pr.order) {
      const c = pr.comps[id];
      if (!c) continue;
      const it = el('div', 'tree-item' + (id === pr.activeCompId ? ' sel' : ''));
      it.innerHTML = `<span class="ico">▣</span><span class="nm">${esc(c.name)}</span><span class="meta">${c.w}×${c.h}</span>`;
      it.onclick = () => { M.setActiveComp(id); UI.refresh(); };
      it.ondblclick = () => UI.renameComp(id);
      g1.appendChild(it);
    }
    wrap.appendChild(g1);
    const g2 = el('div', 'tree-group');
    g2.appendChild(el('div', 'tree-group-title', '图层'));
    const c = comp();
    if (c) {
      for (let i = c.layers.length - 1; i >= 0; i--) {
        const L = c.layers[i];
        const it = el('div', 'tree-item' + (pr.selection.includes(L.id) ? ' sel' : ''));
        it.innerHTML = `<span class="ico">${icon(L.type)}</span><span class="nm">${esc(L.name)}</span><span class="meta">${M.LAYER_TYPES[L.type].label}</span>`;
        it.onclick = () => { pr.selection = [L.id]; UI.refresh(); };
        g2.appendChild(it);
      }
    }
    wrap.appendChild(g2);
    // 预设
    const pl = $('#preset-list');
    if (pl && !pl.dataset.built) {
      pl.dataset.built = '1';
      const presets = [
        { t: '矩形', d: '形状 · 带圆角与描边', i: '▭', fn: () => UI.addPresetShape('rect') },
        { t: '圆形', d: '形状 · 椭圆', i: '◯', fn: () => UI.addPresetShape('ellipse') },
        { t: '星形', d: '形状 · 五角星', i: '☆', fn: () => UI.addPresetShape('star') },
        { t: '文字', d: '文字图层', i: 'T', fn: () => UI.addLayer('text') },
        { t: '三维字块', d: '挤出文字实体', i: '▣', fn: () => UI.addGlyphSolid() },
        { t: '粒子发射', d: '表面发射 + 碰撞', i: '✦', fn: () => UI.addParticleLayer() },
        { t: '空间场', d: '旋涡 / 噪声 / 径向', i: '◈', fn: () => UI.addLayer('field') },
        { t: '摄像机', d: '三维镜头', i: '◧', fn: () => UI.addLayer('camera') },
        { t: '点光源', d: '带阴影', i: '☀', fn: () => UI.addLayer('light') }
      ];
      for (const p of presets) {
        const d = el('div', 'preset-item', `<div class="pi-ico">${p.i}</div><div class="pi-txt"><b>${p.t}</b><span>${p.d}</span></div>`);
        d.onclick = p.fn;
        pl.appendChild(d);
      }
    }
    $('#mb-project').textContent = pr.name;
  };
  function esc(s) { return String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
  function icon(t) { return ({ shape: 'arti', text: 'T', null: '◌', adjust: '◐', precomp: '▣', solid: '▦', particle: '✦', field: '◈', camera: '◧', light: '☀', audio: '♪' })[t] || '·'; }

  /* ---------------- 查看器 ---------------- */
  const viewer = { scale: 1, ox: 0, oy: 0 };
  UI.viewer = viewer;
  function fitScale(c) {
    const wrap = $('#canvas-wrap');
    const cw = wrap.clientWidth - 24, ch = wrap.clientHeight - 24;
    return Math.min(cw / c.w, ch / c.h);
  }
  UI.zoomFit = function () {
    const c = comp(); if (!c) return;
    P_().view.zoom = 'fit';
    $('#zoom-select').value = 'fit';
    UI.invalidate();
  };
  UI.updateViewerButtons = function () {
    const v = P_().view;
    $('#btn-grid').classList.toggle('on', v.showGrid);
    $('#btn-guides').classList.toggle('on', v.showGuides);
    $('#btn-overlays').classList.toggle('on', v.showOverlays);
  };

  UI.renderViewer = function () {
    const c = comp();
    const cv = $('#glcanvas');
    const wrap = $('#canvas-wrap');
    const cw = Math.max(2, wrap.clientWidth), ch = Math.max(2, wrap.clientHeight);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const ov = $('#overlay');
    if (ov.width !== cw || ov.height !== ch) { ov.width = cw; ov.height = ch; }
    const gl = R.gl;
    R.bindTarget(null);
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0.043, 0.047, 0.06, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!c) return;
    const v = P_().view;
    const base = fitScale(c);
    const zoom = v.zoom === 'fit' ? 1 : v.zoom;
    viewer.scale = base * zoom;
    viewer.ox = cw / 2 - c.w * viewer.scale / 2 + v.panX;
    viewer.oy = ch / 2 - c.h * viewer.scale / 2 + v.panY;
    const RS = Math.max(1, Math.min(2.5, viewer.scale * (window.devicePixelRatio || 1)));
    COMP.RS = RS;
    let res;
    try { res = COMP.render(c, P_().time, { RS }); }
    catch (e) { console.error(e); UI.status('渲染错误：' + e.message); return; }
    const dw = Math.round(c.w * viewer.scale), dh = Math.round(c.h * viewer.scale);
    const dx = Math.round(viewer.ox), dy = Math.round(viewer.oy);
    R.blitRect({ fb: null, w: cw, h: ch }, res.fbo.tex, [dx, dy, dw, dh], {});
    UI.drawOverlay();
    $('#preview-info').textContent = `${c.w}×${c.h} · ${Math.round(viewer.scale * 100)}%`;
  };

  /* ---------------- 叠加层 ---------------- */
  UI.compToScreen = function (x, y) { return [viewer.ox + x * viewer.scale, viewer.oy + y * viewer.scale]; };
  UI.screenToComp = function (x, y) { return [(x - viewer.ox) / viewer.scale, (y - viewer.oy) / viewer.scale]; };

  UI.drawOverlay = function () {
    const c = comp();
    const ov = $('#overlay');
    const ctx = ov.getContext('2d');
    const w = ov.width, h = ov.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!c) return;
    const v = P_().view;
    const s = viewer.scale, ox = viewer.ox, oy = viewer.oy;
    // 画布边框
    ctx.strokeStyle = 'rgba(120,140,180,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, c.w * s - 1, c.h * s - 1);
    if (v.showGrid) {
      ctx.strokeStyle = 'rgba(90,110,150,0.13)'; ctx.lineWidth = 1;
      const step = 100 * s;
      for (let x = 0; x <= c.w; x += 100) { ctx.beginPath(); ctx.moveTo(ox + x * s, oy); ctx.lineTo(ox + x * s, oy + c.h * s); ctx.stroke(); }
      for (let y = 0; y <= c.h; y += 100) { ctx.beginPath(); ctx.moveTo(ox, oy + y * s); ctx.lineTo(ox + c.w * s, oy + y * s); ctx.stroke(); }
    }
    if (v.showGuides) {
      ctx.strokeStyle = 'rgba(80,170,255,0.28)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.strokeRect(ox + c.w * s * 0.05, oy + c.h * s * 0.05, c.w * s * 0.9, c.h * s * 0.9);
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(80,170,255,0.5)';
      ctx.beginPath(); ctx.moveTo(ox + c.w * s / 2, oy); ctx.lineTo(ox + c.w * s / 2, oy + c.h * s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy + c.h * s / 2); ctx.lineTo(ox + c.w * s, oy + c.h * s / 2); ctx.stroke();
    }
    if (!v.showOverlays) return;
    const st = new EVAL.EvalState(c, P_().time);
    const ev = EVAL.evaluateComp(c, P_().time);
    // 场范围
    if (v.showFields) {
      for (const it of ev.layers) {
        const L = it.layer;
        if (L.type !== 'field') continue;
        const pos = st.getProp(L, ['transform', 'position']);
        const r = st.getProp(L, ['field', 'radius']);
        const p = UI.compToScreen(M_v(pos, 0), M_v(pos, 1));
        ctx.save();
        ctx.strokeStyle = L.field.color ? st.getProp(L, ['field', 'color']) : '#39d0ff';
        ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2; ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.arc(p[0], p[1], r * s, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.25; ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath(); ctx.arc(p[0], p[1], r * s, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    // 灯光/摄像机图标
    for (const it of ev.layers) {
      const L = it.layer;
      if (L.type !== 'light' && L.type !== 'camera') continue;
      const m = st.worldMatrix(L);
      const p = UI.compToScreen(m[12], m[13]);
      ctx.save();
      ctx.strokeStyle = L.type === 'light' ? 'rgba(255,200,120,0.9)' : 'rgba(120,200,255,0.9)';
      ctx.fillStyle = 'rgba(20,22,28,0.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(L.type === 'light' ? '☀' : '◧', p[0], p[1]);
      if (L.type === 'light') {
        const tgt = st.getProp(L, ['light', 'target']);
        const q = UI.compToScreen(M_v(tgt, 0), M_v(tgt, 1));
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
      ctx.restore();
    }
    // 选中图层
    for (const L of selLayers()) {
      UI.drawLayerOverlay(ctx, L, st, s, ox, oy);
    }
    // 运动路径（选中的位置动画）
    for (const L of selLayers()) {
      const pp = M.getPropAt(L, ['transform', 'position']);
      if (pp && pp.keys && pp.keys.length > 1) {
        drawMotionPath(ctx, L, st, s, ox, oy);
      }
    }
    // 框选
    if (UI.marquee) {
      const m = UI.marquee;
      ctx.strokeStyle = 'rgba(90,160,255,0.9)'; ctx.fillStyle = 'rgba(90,160,255,0.12)'; ctx.lineWidth = 1;
      const x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1), w2 = Math.abs(m.x1 - m.x0), h2 = Math.abs(m.y1 - m.y0);
      ctx.fillRect(x, y, w2, h2); ctx.strokeRect(x + 0.5, y + 0.5, w2, h2);
    }
    // 钢笔预览
    if (UI.penPts.length) {
      ctx.strokeStyle = 'rgba(120,220,255,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      UI.penPts.forEach((p, i) => { const q = UI.compToScreen(p[0], p[1]); if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); });
      ctx.stroke();
      UI.penPts.forEach(p => { const q = UI.compToScreen(p[0], p[1]); ctx.fillStyle = '#7ec8ff'; ctx.beginPath(); ctx.arc(q[0], q[1], 3, 0, Math.PI * 2); ctx.fill(); });
    }
    // 图钉
    for (const L of selLayers()) {
      if (L.pins && L.pins.length) {
        for (const pin of L.pins) {
          const pos = st.getProp(pin, ['position'], P_().time) || pin.orig || [0, 0];
          const q = UI.compToScreen(pos[0], pos[1]);
          ctx.save(); ctx.strokeStyle = '#ff9f43'; ctx.fillStyle = 'rgba(255,159,67,0.25)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(q[0], q[1] - 9); ctx.lineTo(q[0] + 6, q[1] + 5); ctx.lineTo(q[0] - 6, q[1] + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
      }
    }
  };
  function M_v(v, i) { return Array.isArray(v) ? (v[i] || 0) : (i === 0 ? v : 0); }
  UI.M_v = M_v;

  UI.drawLayerOverlay = function (ctx, L, st, s, ox, oy) {
    const bb = UI.layerBBox(L, st);
    if (!bb) return;
    const x = ox + bb.x * s, y = oy + bb.y * s, w = bb.w * s, h = bb.h * s;
    ctx.save();
    ctx.strokeStyle = 'rgba(90,160,255,0.95)'; ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    // 手柄
    ctx.fillStyle = '#5aa0ff';
    const hs = [[x, y], [x + w / 2, y], [x + w, y], [x, y + h / 2], [x + w, y + h / 2], [x, y + h], [x + w / 2, y + h], [x + w, y + h]];
    for (const p of hs) { ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI * 2); ctx.fill(); }
    // 锚点
    const m = st.worldMatrix(L);
    const ap = UI.compToScreen(m[12], m[13]);
    ctx.strokeStyle = '#7ec8ff'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(ap[0] - 6, ap[1]); ctx.lineTo(ap[0] + 6, ap[1]); ctx.moveTo(ap[0], ap[1] - 6); ctx.lineTo(ap[0], ap[1] + 6); ctx.stroke();
    ctx.beginPath(); ctx.arc(ap[0], ap[1], 4, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  };

  function drawMotionPath(ctx, L, st, s, ox, oy) {
    const pp = M.getPropAt(L, ['transform', 'position']);
    const keys = pp.keys;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,170,80,0.9)'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    let first = true;
    for (let i = 0; i < keys.length - 1; i++) {
      const k0 = keys[i], k1 = keys[i + 1];
      if (k0.ease === 'hold') continue;
      const n = 24;
      for (let j = 0; j <= n; j++) {
        const t = k0.t + (k1.t - k0.t) * j / n;
        const pos = M.evalKeyframes(pp, t);
        const q = UI.compToScreen(M_v(pos, 0), M_v(pos, 1));
        if (first) { ctx.moveTo(q[0], q[1]); first = false; } else ctx.lineTo(q[0], q[1]);
      }
    }
    ctx.stroke();
    // 关键帧点与空间手柄
    for (const k of keys) {
      const p = UI.compToScreen(M_v(k.v, 0), M_v(k.v, 1));
      if (k.outS && k.spatial !== 'linear') {
        const q = UI.compToScreen(M_v(k.v, 0) + M_v(k.outS, 0), M_v(k.v, 1) + M_v(k.outS, 1));
        ctx.strokeStyle = 'rgba(255,170,80,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(q[0], q[1], 2.5, 0, Math.PI * 2); ctx.fill();
      }
      if (k.inS && k.spatial !== 'linear') {
        const q = UI.compToScreen(M_v(k.v, 0) + M_v(k.inS, 0), M_v(k.v, 1) + M_v(k.inS, 1));
        ctx.strokeStyle = 'rgba(255,170,80,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(q[0], q[1], 2.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = k.ease === 'hold' ? '#666' : '#ff9f43';
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // 图层包围盒（comp 空间）
  UI.layerBBox = function (L, st) {
    const c = comp();
    if (!c) return null;
    try {
      if (L.type === 'shape') {
        for (const g of (L.shapes || [])) {
          if (g.enabled === false) continue;
          const ps = (g.paths || []).map(pp => st.getProp(pp, ['v'], P_().time) || pp.v).filter(Boolean);
          g._evalPaths = R2.shapeLayerPaths ? R2.shapeLayerPaths(c, L, st, P_().time) : ps;
        }
        return R2.shapeBBox(c, L, st, P_().time);
      }
      if (L.type === 'text') return R2.textBBox(c, L, st, P_().time);
      if (L.threeD) {
        const mesh = NODES.solidMesh(c, L, st, P_().time);
        if (mesh) {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          const wm = st.worldMatrix(L);
          const corners = [];
          let mx0 = Infinity, my0 = Infinity, mz0 = Infinity, mx1 = -Infinity, my1 = -Infinity, mz1 = -Infinity;
          for (let i = 0; i < mesh.verts.length; i += 3) {
            mx0 = Math.min(mx0, mesh.verts[i]); mx1 = Math.max(mx1, mesh.verts[i]);
            my0 = Math.min(my0, mesh.verts[i + 1]); my1 = Math.max(my1, mesh.verts[i + 1]);
            mz0 = Math.min(mz0, mesh.verts[i + 2]); mz1 = Math.max(mz1, mesh.verts[i + 2]);
          }
          for (const cx of [mx0, mx1]) for (const cy of [my0, my1]) for (const cz of [mz0, mz1]) {
            const x = wm[0] * cx + wm[4] * cy + wm[8] * cz + wm[12];
            const y = wm[1] * cx + wm[5] * cy + wm[9] * cz + wm[13];
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          }
          return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        }
      }
    } catch (e) { /* ignore */ }
    return null;
  };

  /* ---------------- 拾取 ---------------- */
  UI.pickLayer = function (cx, cy) {
    const c = comp(); if (!c) return null;
    const st = new EVAL.EvalState(c, P_().time);
    const ev = EVAL.evaluateComp(c, P_().time);
    for (const it of ev.layers) {
      const L = it.layer;
      if (L.locked) continue;
      if (L.type === 'null' || L.type === 'audio' || L.type === 'field' || L.type === 'light' || L.type === 'camera') continue;
      const bb = UI.layerBBox(L, st);
      if (bb && cx >= bb.x && cx <= bb.x + bb.w && cy >= bb.y && cy <= bb.y + bb.h) {
        if (L.type === 'shape') {
          // 精确命中路径
          const paths = R2.shapeLayerPaths(c, L, st, P_().time);
          const m = st.worldMatrix(L);
          const inv = U.M2.inv([m[0], m[1], m[4], m[5], m[12], m[13]]);
          const lp = U.M2.apply(inv, cx, cy);
          let inside = false;
          for (const ct of paths) {
            const f = PT.flattenContour(ct, 0.8);
            if (U.pointInPolygon(lp[0], lp[1], f)) inside = !inside;
          }
          if (inside) return L;
          continue;
        }
        return L;
      }
    }
    return null;
  };

  /* ---------------- 工具与交互 ---------------- */
  UI.setTool = function (t) { UI.tool = t; P_().tool = t; UI.penPts = []; UI.status('工具：' + ({ select: '选择 (V)', hand: '抓手 (H)', rect: '矩形 (R)', ellipse: '椭圆 (E)', pen: '钢笔 (G)', text: '文字 (T)', pin: '图钉 (P)' })[t]); };
  UI.setTool('select');

  const wrap = $('#canvas-wrap');
  wrap.addEventListener('contextmenu', e => e.preventDefault());
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const v = P_().view;
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const c = comp(); if (!c) return;
    const base = fitScale(c);
    const oldZoom = v.zoom === 'fit' ? 1 : v.zoom;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newZoom = U.clamp(oldZoom * factor, 0.05, 8);
    const k = newZoom / oldZoom;
    const sx = (mx - (wrap.clientWidth / 2 - c.w * base * oldZoom / 2 + v.panX)) / (base * oldZoom);
    const sy = (my - (wrap.clientHeight / 2 - c.h * base * oldZoom / 2 + v.panY)) / (base * oldZoom);
    v.zoom = newZoom;
    v.panX = mx - wrap.clientWidth / 2 - sx * c.w * base * newZoom + c.w * base * newZoom / 2;
    v.panY = my - wrap.clientHeight / 2 - sy * c.h * base * newZoom + c.h * base * newZoom / 2;
    $('#zoom-select').value = String(Math.round(newZoom * 100) / 100);
    UI.invalidate();
  }, { passive: false });

  wrap.addEventListener('mousedown', (e) => {
    if (e.button === 1 || UI.tool === 'hand') { UI.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, px: P_().view.panX, py: P_().view.panY }; return; }
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const [cx, cy] = UI.screenToComp(mx, my);
    const c = comp(); if (!c) return;
    if (e.button === 2) { // 右键菜单
      const L = UI.pickLayer(cx, cy);
      if (L) { P_().selection = [L.id]; UI.refresh(); UI.layerContextMenu(e.clientX, e.clientY, L); }
      return;
    }
    if (UI.tool === 'rect' || UI.tool === 'ellipse') {
      UI.drag = { type: 'shape', x0: cx, y0: cy, shape: UI.tool };
      return;
    }
    if (UI.tool === 'text') { UI.createTextAt(cx, cy); return; }
    if (UI.tool === 'pen') { UI.penPts.push([cx, cy]); UI.overlayDirty = true; return; }
    if (UI.tool === 'pin') { UI.addPinAt(cx, cy); return; }
    // 选择工具
    const hitHandle = UI.hitHandle(mx, my);
    if (hitHandle) { UI.drag = hitHandle; return; }
    const L = UI.pickLayer(cx, cy);
    if (L) {
      if (!P_().selection.includes(L.id)) { P_().selection = e.shiftKey ? P_().selection.concat([L.id]) : [L.id]; UI.refresh(); }
      // 记录起始位置
      const layers = selLayers().map(l => ({ l, pos: JSON.parse(JSON.stringify(M.getPropAt(l, ['transform', 'position']).v)), anchor: M.getPropAt(l, ['transform', 'position']) }));
      UI.drag = { type: 'move', sx: cx, sy: cy, layers, moved: false };
      UI.drag.anchorProps = layers.map(o => M.getPropAt(o.l, ['transform', 'position']));
    } else {
      if (!e.shiftKey) { P_().selection = []; UI.refresh(); }
      UI.drag = { type: 'marquee', x0: mx, y0: my };
      UI.marquee = { x0: mx, y0: my, x1: mx, y1: my };
    }
  });

  window.addEventListener('mousemove', (e) => {
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    UI.mouse.x = mx; UI.mouse.y = my;
    const [cx, cy] = UI.screenToComp(mx, my);
    UI.mouse.cx = cx; UI.mouse.cy = cy;
    const d = UI.drag;
    if (!d) { UI.updateCursor(mx, my); return; }
    if (d.type === 'pan') {
      P_().view.panX = d.px + (e.clientX - d.sx);
      P_().view.panY = d.py + (e.clientY - d.sy);
      UI.invalidate(); return;
    }
    if (d.type === 'marquee') {
      UI.marquee.x1 = mx; UI.marquee.y1 = my;
      UI.overlayDirty = true;
      return;
    }
    if (d.type === 'shape') {
      UI.drag.x1 = cx; UI.drag.y1 = cy;
      UI.overlayDirty = true;
      return;
    }
    if (d.type === 'move') {
      const dx = cx - d.sx, dy = cy - d.sy;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) d.moved = true;
      for (let i = 0; i < d.layers.length; i++) {
        const o = d.layers[i];
        const p = d.anchorProps[i];
        const v = [o.pos[0] + dx, o.pos[1] + dy, o.pos[2] || 0];
        if (p && p.keys && p.keys.length) M.setKey(p, P_().time, v);
        else p.v = v;
      }
      UI.invalidate();
      return;
    }
    if (d.type === 'handle') {
      UI.dragHandle(cx, cy);
      return;
    }
  });
  window.addEventListener('mouseup', (e) => {
    const d = UI.drag;
    UI.drag = null;
    if (!d) return;
    if (d.type === 'marquee') {
      UI.marquee = null;
      const c = comp();
      if (c) {
        const x0 = Math.min(d.x0, UI.mouse.x), x1 = Math.max(d.x0, UI.mouse.x);
        const y0 = Math.min(d.y0, UI.mouse.y), y1 = Math.max(d.y0, UI.mouse.y);
        const st = new EVAL.EvalState(c, P_().time);
        const sel = [];
        for (const L of c.layers) {
          const bb = UI.layerBBox(L, st);
          if (!bb) continue;
          const p0 = UI.compToScreen(bb.x, bb.y), p1 = UI.compToScreen(bb.x + bb.w, bb.y + bb.h);
          if (p1[0] >= x0 && p0[0] <= x1 && p1[1] >= y0 && p0[1] <= y1) sel.push(L.id);
        }
        P_().selection = sel; UI.refresh();
      }
      UI.overlayDirty = true;
      return;
    }
    if (d.type === 'shape') {
      const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
      const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
      if (w > 2 && h > 2) {
        M.Undo.begin('绘制形状');
        const L = M.createLayer(comp(), 'shape', d.shape === 'rect' ? '矩形' : '椭圆');
        const path = d.shape === 'rect' ? PT.rectPath(x, y, w, h) : PT.ellipsePath(x + w / 2, y + h / 2, w / 2, h / 2);
        L.shapes.push({ id: M.uid('sh'), name: d.shape === 'rect' ? '矩形' : '椭圆', paths: [M.newProp(path)], fill: { on: true, color: M.newProp('#3f8cff', { color: true }), opacity: M.newProp(100) }, stroke: { on: true, color: M.newProp('#0b1220', { color: true }), width: M.newProp(3), opacity: M.newProp(100) }, ops: [] });
        L.transform.position.v = [comp().w / 2, comp().h / 2, 0];
        M.addLayer(comp(), L, 0);
        M.Undo.end();
        P_().selection = [L.id];
        UI.refresh();
      }
      UI.overlayDirty = true;
      return;
    }
    if (d.type === 'move' && d.moved) { M.Undo.push('移动图层'); }
  });
  window.addEventListener('dblclick', (e) => {
    if (e.target.closest('#canvas-wrap') && UI.tool === 'pen' && UI.penPts.length > 1) {
      UI.finishPen();
    }
  });

  UI.updateCursor = function (mx, my) {
    const h = UI.hitHandle(mx, my);
    wrap.style.cursor = h ? (h.type === 'handle' ? (h.idx % 2 ? 'ew-resize' : 'ns-resize') : 'crosshair') : (UI.tool === 'hand' ? 'grab' : UI.tool === 'select' ? 'default' : 'crosshair');
  };
  UI.hitHandle = function (mx, my) {
    const c = comp(); if (!c) return null;
    const st = new EVAL.EvalState(c, P_().time);
    for (const L of selLayers()) {
      const bb = UI.layerBBox(L, st);
      if (!bb) continue;
      const x = viewer.ox + bb.x * viewer.scale, y = viewer.oy + bb.y * viewer.scale, w = bb.w * viewer.scale, h = bb.h * viewer.scale;
      const pts = [[x, y], [x + w / 2, y], [x + w, y], [x, y + h / 2], [x + w, y + h / 2], [x, y + h], [x + w / 2, y + h], [x + w, y + h]];
      for (let i = 0; i < pts.length; i++) {
        if (Math.hypot(pts[i][0] - mx, pts[i][1] - my) < 6) return { type: 'handle', layer: L, idx: i, st };
      }
    }
    return null;
  };
  UI.dragHandle = function (cx, cy) {
    const d = UI.drag;
    const L = d.layer;
    const p = M.getPropAt(L, ['transform', 'position']);
    const s = M.getPropAt(L, ['transform', 'scale']);
    const st = d.st;
    const bb = UI.layerBBox(L, st);
    if (!bb) return;
    const cx0 = bb.x + bb.w / 2, cy0 = bb.y + bb.h / 2;
    const dx = cx - cx0, dy = cy - cy0;
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    const k = U.clamp(dist / Math.max(bb.w, bb.h) * 2, 0.05, 10);
    if (p.keys && p.keys.length) M.setKey(p, P_().time, [cx0, cy0, p.v[2] || 0]);
    else p.v = [cx0, cy0, p.v[2] || 0];
    const ns = [s.v[0] * k, s.v[1] * k, s.v[2]];
    if (s.keys && s.keys.length) M.setKey(s, P_().time, ns); else s.v = ns;
    UI.invalidate();
  };

  UI.layerContextMenu = function (x, y, L) {
    const cm = $('#ctx-menu'); cm.innerHTML = ''; cm.classList.remove('hidden');
    const items = [
      ['复制图层', () => UI.duplicateLayer()],
      ['删除图层', () => UI.deleteLayer()],
      null,
      ['预合成', () => UI.precompose()],
      ['添加蒙版', () => UI.addMask(L)],
      null,
      ['重命名', () => UI.renameLayer(L)]
    ];
    for (const it of items) {
      if (!it) { cm.appendChild(el('div', 'sep')); continue; }
      const d = el('div', 'ci', `<span>${it[0]}</span>`);
      d.onclick = () => { UI.closeMenus(); it[1](); };
      cm.appendChild(d);
    }
    cm.style.left = x + 'px'; cm.style.top = y + 'px';
    UI._menuOpen = true;
  };

  /* ---------------- 图层操作 ---------------- */
  UI.addLayer = function (type) {
    const c = comp(); if (!c) return;
    M.Undo.begin('新建图层');
    const L = M.createLayer(c, type);
    if (type === 'solid') {
      L.material.color.v = '#c9a227';
      L.material.metallic.v = 0.95; L.material.roughness.v = 0.28;
    }
    M.addLayer(c, L, 0);
    M.Undo.end();
    P_().selection = [L.id];
    UI.refresh();
    UI.toast('已添加 ' + M.LAYER_TYPES[type].label);
  };
  UI.addPresetShape = function (kind) {
    const c = comp(); if (!c) return;
    M.Undo.begin('新建形状');
    const L = M.createLayer(c, 'shape', { rect: '矩形', ellipse: '椭圆', star: '星形' }[kind]);
    const path = kind === 'rect' ? PT.rectPath(-160, -100, 320, 200, 8) : kind === 'ellipse' ? PT.ellipsePath(0, 0, 150, 100) : PT.starPath(0, 0, 130, 55, 5);
    L.shapes.push({
      id: M.uid('sh'), name: L.name, paths: [M.newProp(path)],
      fill: { on: true, color: M.newProp('#3f8cff', { color: true }), opacity: M.newProp(100) },
      stroke: { on: true, color: M.newProp('#0b1220', { color: true }), width: M.newProp(4), opacity: M.newProp(100) },
      ops: []
    });
    M.addLayer(c, L, 0);
    M.Undo.end();
    P_().selection = [L.id];
    UI.refresh();
  };
  UI.addGlyphSolid = function () {
    const c = comp(); if (!c) return;
    M.Undo.begin('新建三维字块');
    const txt = M.createLayer(c, 'text', '文字源');
    txt.text.content.v = '锻';
    txt.text.fontSize.v = 420;
    M.addLayer(c, txt, 0);
    const L = M.createLayer(c, 'solid', '三维字块');
    L.solid.geometry = 'glyph';
    L.solid.textSource = txt.id;
    L.material.color.v = '#c9a227'; L.material.metallic.v = 0.95; L.material.roughness.v = 0.28;
    M.addLayer(c, L, 0);
    M.Undo.end();
    P_().selection = [L.id];
    UI.refresh();
  };
  UI.addParticleLayer = function () {
    const c = comp(); if (!c) return;
    M.Undo.begin('新建粒子');
    const L = M.createLayer(c, 'particle', '粒子');
    const solids = c.layers.filter(l => l.type === 'solid');
    if (solids.length) { L.particles.emitter.type = 'surface'; L.particles.emitter.source = solids[0].id; L.particles.collision.layers = [solids[0].id]; }
    M.addLayer(c, L, 0);
    M.Undo.end();
    P_().selection = [L.id];
    UI.refresh();
  };
  UI.duplicateLayer = function () {
    const c = comp(); if (!c) return;
    const sel = selLayers();
    if (!sel.length) return;
    M.Undo.begin('复制图层');
    const ids = [];
    for (const L of sel) {
      const copy = JSON.parse(JSON.stringify(L));
      copy.id = M.uid(L.type);
      copy.name = L.name + ' 副本';
      const idx = c.layers.indexOf(L);
      c.layers.splice(idx, 0, copy);
      ids.push(copy.id);
    }
    M.Undo.end();
    P_().selection = ids;
    UI.refresh();
  };
  UI.deleteLayer = function () {
    const c = comp(); if (!c) return;
    const sel = selLayers();
    if (!sel.length) return;
    M.Undo.begin('删除图层');
    for (const L of sel) M.removeLayer(c, L.id);
    P_().selection = [];
    M.Undo.end();
    UI.refresh();
  };
  UI.renameLayer = function (L) {
    const row = document.querySelector(`.lrow[data-id="${L.id}"] .lname`);
    if (!row) return;
    const inp = document.createElement('input');
    inp.value = L.name;
    row.innerHTML = ''; row.appendChild(inp);
    inp.focus(); inp.select();
    const done = () => { M.Undo.begin('重命名'); L.name = inp.value || L.name; M.Undo.end(); UI.refresh(); };
    inp.onblur = done;
    inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); e.stopPropagation(); };
  };
  UI.renameComp = function (id) {
    const c = P_().comps[id]; if (!c) return;
    const n = prompt('合成名称', c.name);
    if (n) { M.Undo.begin('重命名合成'); c.name = n; M.Undo.end(); UI.refresh(); }
  };
  UI.addMask = function (L) {
    M.Undo.begin('添加蒙版');
    L.masks = L.masks || [];
    const bb = UI.layerBBox(L, new EVAL.EvalState(comp(), P_().time));
    const w = bb ? bb.w : 300, h = bb ? bb.h : 300;
    L.masks.push({ id: M.uid('mask'), name: '蒙版 ' + (L.masks.length + 1), mode: 'add', inverted: false, feather: M.newProp(0), opacity: M.newProp(100), path: M.newProp(PT.rectPath(-w / 2, -h / 2, w, h)), enabled: true });
    M.Undo.end(); UI.refresh();
  };
  UI.addEffect = function (type) {
    const sel = selLayers();
    if (!sel.length) { UI.toast('请先选择图层'); return; }
    M.Undo.begin('添加效果');
    for (const L of sel) {
      const fx = { id: M.uid('fx'), type, enabled: true, params: {} };
      const defs = {
        blur: { amount: 12 }, glow: { threshold: 0.45, intensity: 1.2, radius: 30 },
        shadow: { distance: 14, angle: 120, softness: 14, opacity: 0.7, color: '#000000' },
        hsb: { hue: 0, saturation: 1, brightness: 1 }, fill: { color: '#ffffff' }
      }[type];
      for (const k in defs) fx.params[k] = M.newProp(defs[k], k === 'color' ? { color: true } : undefined);
      L.effects.push(fx);
    }
    M.Undo.end(); UI.refresh();
  };
  UI.precompose = function () {
    const c = comp(); if (!c) return;
    const sel = selLayers();
    if (!sel.length) { UI.toast('请先选择要预合成的图层'); return; }
    M.Undo.begin('预合成');
    const sub = M.createComp('预合成 ' + (Object.keys(P_().comps).length + 1), c.w, c.h, c.fps, c.duration);
    sub.layers = sel;
    for (const L of sel) M.removeLayer(c, L.id);
    P_().comps[sub.id] = sub;
    P_().order.push(sub.id);
    const L = M.createLayer(c, 'precomp', sub.name);
    L.precomp.compId = sub.id;
    L.transform.position.v = [c.w / 2, c.h / 2, 0];
    M.addLayer(c, L, 0);
    M.Undo.end();
    P_().selection = [L.id];
    UI.refresh();
  };
  UI.addPinAt = function (cx, cy) {
    const c = comp(); if (!c) return;
    const L = selLayers()[0];
    if (!L) { UI.toast('请先选择图层'); return; }
    M.Undo.begin('添加图钉');
    const m = new EVAL.EvalState(c, P_().time).worldMatrix(L);
    const inv = U.M2.inv([m[0], m[1], m[4], m[5], m[12], m[13]]);
    const lp = U.M2.apply(inv, cx, cy);
    L.pins = L.pins || [];
    L.pins.push({ id: M.uid('pin'), name: '图钉 ' + (L.pins.length + 1), orig: [lp[0], lp[1]], position: M.newProp([lp[0], lp[1]]), rotation: M.newProp(0), scale: M.newProp(100), enabled: true });
    M.Undo.end(); UI.refresh();
  };
  UI.finishPen = function () {
    const c = comp(); if (!c || UI.penPts.length < 2) return;
    M.Undo.begin('绘制路径');
    const L = M.createLayer(c, 'shape', '路径');
    const path = PT.pathFromPolylines([UI.penPts.map(p => [p[0], p[1]])], true);
    L.shapes.push({ id: M.uid('sh'), name: '路径', paths: [M.newProp(path)], fill: { on: true, color: M.newProp('#3f8cff', { color: true }), opacity: M.newProp(100) }, stroke: { on: true, color: M.newProp('#0b1220', { color: true }), width: M.newProp(3), opacity: M.newProp(100) }, ops: [] });
    L.transform.position.v = [c.w / 2, c.h / 2, 0];
    M.addLayer(c, L, 0);
    M.Undo.end();
    UI.penPts = [];
    P_().selection = [L.id];
    UI.refresh();
  };
  UI.createTextAt = function (cx, cy) {
    const c = comp(); if (!c) return;
    M.Undo.begin('新建文字');
    const L = M.createLayer(c, 'text', '文字');
    L.transform.position.v = [cx, cy, 0];
    M.addLayer(c, L, 0);
    M.Undo.end();
    P_().selection = [L.id];
    UI.refresh();
  };

  /* ---------------- 工程 ---------------- */
  UI.newProject = function () {
    if (!confirm('新建工程将丢弃当前内容，确定？')) return;
    MODEL.Project = M.newProject();
    M.Undo.reset();
    const c = M.createComp('合成 1', 1920, 1080, 30, 10);
    MODEL.Project.comps[c.id] = c; MODEL.Project.order.push(c.id); MODEL.Project.activeCompId = c.id;
    UI.refresh();
  };
  UI.newCompDialog = function () {
    const box = $('#modal-box');
    box.innerHTML = `<h3>新建合成</h3>
      <div class="form-row"><label>名称</label><input id="nc-name" value="合成 ${MODEL.Project.order.length + 1}"></div>
      <div class="form-row"><label>宽度</label><input id="nc-w" type="number" value="1920"></div>
      <div class="form-row"><label>高度</label><input id="nc-h" type="number" value="1080"></div>
      <div class="form-row"><label>帧率</label><input id="nc-fps" type="number" value="30"></div>
      <div class="form-row"><label>时长(秒)</label><input id="nc-dur" type="number" value="10" step="0.1"></div>
      <div class="modal-actions"><button class="btn" id="nc-cancel">取消</button><button class="btn primary" id="nc-ok">创建</button></div>`;
    $('#modal').classList.remove('hidden');
    $('#nc-cancel').onclick = () => $('#modal').classList.add('hidden');
    $('#nc-ok').onclick = () => {
      const c = M.createComp($('#nc-name').value, +$('#nc-w').value, +$('#nc-h').value, +$('#nc-fps').value, +$('#nc-dur').value);
      MODEL.Project.comps[c.id] = c; MODEL.Project.order.push(c.id); MODEL.Project.activeCompId = c.id;
      $('#modal').classList.add('hidden');
      UI.refresh();
    };
  };
  UI.compSettings = function () {
    const c = comp(); if (!c) return;
    const box = $('#modal-box');
    box.innerHTML = `<h3>合成设置</h3>
      <div class="form-row"><label>名称</label><input id="cs-name" value="${esc(c.name)}"></div>
      <div class="form-row"><label>宽度</label><input id="cs-w" type="number" value="${c.w}"></div>
      <div class="form-row"><label>高度</label><input id="cs-h" type="number" value="${c.h}"></div>
      <div class="form-row"><label>帧率</label><input id="cs-fps" type="number" value="${c.fps}"></div>
      <div class="form-row"><label>时长(秒)</label><input id="cs-dur" type="number" value="${c.duration}" step="0.1"></div>
      <div class="form-row"><label>背景色</label><input id="cs-bg" type="color" value="${c.bgColor}"></div>
      <div class="modal-actions"><button class="btn" id="cs-cancel">取消</button><button class="btn primary" id="cs-ok">确定</button></div>`;
    $('#modal').classList.remove('hidden');
    $('#cs-cancel').onclick = () => $('#modal').classList.add('hidden');
    $('#cs-ok').onclick = () => {
      M.Undo.begin('合成设置');
      c.name = $('#cs-name').value; c.w = +$('#cs-w').value; c.h = +$('#cs-h').value;
      c.fps = +$('#cs-fps').value; c.duration = +$('#cs-dur').value; c.bgColor = $('#cs-bg').value;
      for (const L of c.layers) L.outPoint = Math.min(L.outPoint, c.duration);
      M.Undo.end();
      $('#modal').classList.add('hidden');
      UI.refresh();
    };
  };
  UI.helpDialog = function () {
    const box = $('#modal-box');
    box.innerHTML = `<h3>快捷键</h3><div style="line-height:2;color:#a8aeba;font-size:12px">
      空格 播放 / 暂停<br>V 选择 · H 抓手 · R 矩形 · E 椭圆 · G 钢笔 · T 文字 · P 图钉<br>
      F9 缓入缓出 · Ctrl+Shift+L 线性 · Ctrl+Shift+C 预合成<br>
      Ctrl+Z 撤销 · Ctrl+Shift+Z 重做 · Ctrl+D 复制图层 · Delete 删除<br>
      J / K 上一 / 下一关键帧 · Home / End 起止 · \\ 适合窗口<br>
      时间轴：拖动播放头 · 拖动关键帧 · 框选 · Alt 拖动复制</div>
      <div class="modal-actions"><button class="btn primary" id="hp-ok">知道了</button></div>`;
    $('#modal').classList.remove('hidden');
    $('#hp-ok').onclick = () => $('#modal').classList.add('hidden');
  };
  UI.saveProject = function () {
    M.Undo.begin('保存');
    const data = M.serialize();
    M.Undo.end();
    U.download('锻字工程.json', data);
    UI.toast('工程已导出');
  };
  UI.exportJSON = function () { U.download('project.json', M.serialize()); };
  UI.exportFrame = function () {
    const c = comp(); if (!c) return;
    const res = COMP.render(c, P_().time, { RS: 1 });
    const px = COMP.readPixels();
    const cv = document.createElement('canvas'); cv.width = px.w; cv.height = px.h;
    const ctx = cv.getContext('2d'); const id = ctx.createImageData(px.w, px.h);
    for (let y = 0; y < px.h; y++) {
      const src = (px.h - 1 - y) * px.w * 4;
      id.data.set(px.px.subarray(src, src + px.w * 4), y * px.w * 4);
    }
    ctx.putImageData(id, 0, 0);
    cv.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `frame_${Math.round(P_().time * c.fps)}.png`; a.click(); });
  };
  UI.undo = function () { if (M.Undo.undo()) { UI.refresh(); UI.toast('撤销 ' + M.Undo.label()); } };
  UI.redo = function () { if (M.Undo.redo()) { UI.refresh(); UI.toast('重做 ' + M.Undo.label()); } };
  UI.updateMenus = function () {
    $('#btn-undo').disabled = !M.Undo.canUndo();
    $('#btn-redo').disabled = !M.Undo.canRedo();
  };

  /* ---------------- 传输 ---------------- */
  UI.updateTransport = function () {
    const c = comp(); if (!c) return;
    const t = P_().time;
    const f = Math.round(t * c.fps);
    const s = Math.floor(f / c.fps), fr = f % c.fps;
    const m = Math.floor(s / 60), sec = s % 60;
    $('#timecode').textContent = `${m}:${String(sec).padStart(2, '0')}:${String(fr).padStart(2, '0')}`;
    $('#framecode').textContent = `帧 ${f}`;
    $('#btn-play').classList.toggle('on', P_().playing);
    $('#btn-play').textContent = P_().playing ? '❚❚' : '▶';
  };
  UI.togglePlay = function () {
    const c = comp(); if (!c) return;
    P_().playing = !P_().playing;
    if (P_().playing) {
      AUDIO.unlock();
      AUDIO.start(comp(), P_().time);
      UI._lastT = performance.now();
    } else AUDIO.stop();
    UI.updateTransport();
  };
  UI.setTime = function (t) {
    const c = comp(); if (!c) return;
    const wa = c.workArea || [0, c.duration];
    if (P_().loop && (t < wa[0] || t > wa[1])) {
      t = wa[0] + ((t - wa[0]) % (wa[1] - wa[0]) + (wa[1] - wa[0])) % (wa[1] - wa[0]);
    }
    P_().time = U.clamp(t, 0, c.duration);
    UI.updateTransport();
    UI.invalidate();
    if (P_().playing) AUDIO.seek(comp(), P_().time);
  };

  /* ---------------- 属性面板 ---------------- */
  UI.buildInspector = function () {
    const wrap = $('#inspector');
    wrap.innerHTML = '';
    const sel = selLayers();
    if (!sel.length) {
      wrap.appendChild(el('div', 'insp-empty', '未选择图层<br><span style="font-size:10px;color:#4a4f5c">在查看器或时间轴中选择图层</span>'));
      return;
    }
    if (sel.length > 1) {
      wrap.appendChild(el('div', 'insp-empty', `已选择 ${sel.length} 个图层`));
    }
    for (const L of sel.slice(0, 3)) {
      wrap.appendChild(inspHead(L));
      if (sel.length === 1) wrap.appendChild(inspBody(L));
    }
    UI.buildMaterialPanel(sel);
    UI.buildFieldPanel(sel);
  };
  function inspHead(L) {
    const d = el('div', 'insp-head');
    d.innerHTML = `<span class="ih-ico">${icon(L.type)}</span><span class="ih-name">${esc(L.name)}</span><span class="ih-type">${M.LAYER_TYPES[L.type].label}</span>`;
    return d;
  }
  function inspBody(L) {
    const c = comp();
    const box = el('div', 'insp-body');
    // 名称与图层属性
    box.appendChild(section('图层', [
      rowText('名称', L.name, v => { L.name = v; UI.refresh(); }),
      rowTime('入点', L.inPoint, v => { L.inPoint = v; }),
      rowTime('出点', L.outPoint, v => { L.outPoint = v; }),
      rowSelect('混合模式', L.blend, ['normal', 'add', 'screen', 'multiply', 'overlay'], v => { L.blend = v; }, ['正常', '相加', '滤色', '正片叠底', '叠加']),
      rowCheck('运动模糊', L.mb, v => { L.mb = v; }),
      rowCheck('锁定', L.locked, v => { L.locked = v; }),
      rowCheck('独奏', L.solo, v => { L.solo = v; }),
      rowCheck('三维图层', L.threeD, v => { L.threeD = v; }),
      rowSelect('父级', L.parent || '', c.layers.filter(x => x.id !== L.id).map(x => x.id), v => { UI.setParent(L, v || null); }, c.layers.filter(x => x.id !== L.id).map(x => x.name))
    ]));
    box.appendChild(section('变换', [
      rowProp(L, ['transform', 'anchor'], '锚点', 'vec2'),
      rowProp(L, ['transform', 'position'], '位置', 'vec3'),
      rowProp(L, ['transform', 'scale'], '缩放', 'vec2'),
      rowProp(L, ['transform', 'rotation'], '旋转', 'number'),
      rowProp(L, ['transform', 'opacity'], '不透明度', 'number'),
      ...(L.threeD ? [
        rowProp(L, ['transform', 'orientation'], '方向', 'vec3'),
        rowProp(L, ['transform', 'xRotation'], 'X 旋转', 'number'),
        rowProp(L, ['transform', 'yRotation'], 'Y 旋转', 'number'),
        rowProp(L, ['transform', 'zRotation'], 'Z 旋转', 'number')
      ] : [])
    ]));
    if (L.type === 'text') box.appendChild(inspText(L));
    if (L.type === 'shape') box.appendChild(inspShape(L));
    if (L.type === 'solid') box.appendChild(inspSolid(L));
    if (L.type === 'particle') box.appendChild(inspParticle(L));
    if (L.type === 'camera') box.appendChild(inspCamera(L));
    if (L.type === 'light') box.appendChild(inspLight(L));
    if (L.type === 'audio') box.appendChild(inspAudio(L));
    if (L.type === 'precomp') box.appendChild(inspPrecomp(L));
    if (L.type === 'field') box.appendChild(inspField(L));
    box.appendChild(inspMasks(L));
    box.appendChild(inspEffects(L));
    if (L.pins && L.pins.length) box.appendChild(inspPins(L));
    return box;
  }

  function section(title, rows, opts = {}) {
    const d = el('div', 'insp-sec');
    const t = el('div', 'insp-sec-title', `<span class="arrow">▾</span><span>${title}</span>`);
    if (opts.action) { const b = el('span', 'add', opts.action[0]); b.style.cursor = 'pointer'; b.onclick = (e) => { e.stopPropagation(); opts.action[1](); }; t.appendChild(b); }
    t.onclick = () => { const b = d.querySelector('.insp-body'); if (b) b.style.display = b.style.display === 'none' ? '' : 'none'; const a = d.querySelector('.arrow'); if (a) a.textContent = b.style.display === 'none' ? '▸' : '▾'; };
    d.appendChild(t);
    const body = el('div', 'insp-body');
    for (const r of rows) if (r) body.appendChild(r);
    d.appendChild(body);
    return d;
  }
  UI.section = section;

  function rowBase(label, cls) {
    const d = el('div', 'prop-row ' + (cls || ''));
    d.innerHTML = `<span class="pname">${label}</span>`;
    return d;
  }
  function rowText(label, val, oncommit) {
    const d = rowBase(label);
    const i = el('input', 'pval'); i.value = val;
    i.onkeydown = e => { if (e.key === 'Enter') i.blur(); e.stopPropagation(); };
    i.onchange = () => { M.Undo.begin('修改'); oncommit(i.value); M.Undo.end(); UI.refresh(); };
    d.appendChild(i);
    return d;
  }
  function rowTime(label, val, oncommit) {
    const d = rowBase(label);
    const i = el('input', 'pval'); i.value = val.toFixed(2);
    i.onkeydown = e => { if (e.key === 'Enter') i.blur(); e.stopPropagation(); };
    i.onchange = () => { M.Undo.begin('修改'); oncommit(+i.value); M.Undo.end(); UI.refresh(); };
    d.appendChild(i);
    return d;
  }
  function rowSelect(label, val, options, oncommit, labels) {
    const d = rowBase(label);
    const s = el('select', 'pval');
    options.forEach((o, i) => { const op = document.createElement('option'); op.value = o; op.textContent = (labels && labels[i]) || o; if (String(o) === String(val)) op.selected = true; s.appendChild(op); });
    s.onchange = () => { M.Undo.begin('修改'); oncommit(s.value); M.Undo.end(); UI.refresh(); };
    d.appendChild(s);
    return d;
  }
  function rowCheck(label, val, oncommit) {
    const d = el('label', 'chk');
    d.innerHTML = `<input type="checkbox" ${val ? 'checked' : ''}><span>${label}</span>`;
    d.querySelector('input').onchange = (e) => { M.Undo.begin('修改'); oncommit(e.target.checked); M.Undo.end(); UI.refresh(); };
    return d;
  }
  function fmtVal(v) {
    if (Array.isArray(v)) return v.map(x => (Math.round(x * 100) / 100)).join(', ');
    if (typeof v === 'number') return String(Math.round(v * 100) / 100);
    return String(v);
  }
  function rowProp(L, path, label, type) {
    const p = M.getPropAt(L, path);
    if (!p || p.keys === undefined) return null;
    const d = rowBase(label, M.isAnimated(p) ? '' : 'dim');
    const sw = el('span', 'sw' + (p.keys.length ? ' kf' : '') + (p.exprOn ? ' on' : ''));
    sw.title = '动画开关（点击创建/移除关键帧）';
    sw.onclick = (e) => { e.stopPropagation(); UI.toggleAnimation(L, path); };
    d.appendChild(sw);
    const val = M.evalKeyframes(p, P_().time);
    if (type === 'color' || p.color) {
      const inp = document.createElement('input'); inp.type = 'color'; inp.value = val;
      inp.oninput = () => { M.Undo.begin('修改'); commitProp(L, path, inp.value); M.Undo.end(); };
      d.appendChild(inp);
    } else {
      const i = el('input', 'pval' + (type === 'vec2' || type === 'vec3' ? ' vec' : ''));
      i.value = fmtVal(val);
      i.onkeydown = e => { if (e.key === 'Enter') i.blur(); e.stopPropagation(); };
      i.onchange = () => {
        M.Undo.begin('修改');
        let v = i.value.trim();
        if (type === 'vec2' || type === 'vec3') v = v.split(/[,，\s]+/).filter(Boolean).map(Number);
        else v = parseFloat(v);
        if (!Array.isArray(v) && isNaN(v)) v = 0;
        if (Array.isArray(v) && v.some(isNaN)) return;
        commitProp(L, path, v);
        M.Undo.end(); UI.refresh();
      };
      d.appendChild(i);
    }
    const knav = el('span', 'knav');
    const bPrev = el('button', null, '◀'), bAdd = el('button', null, '◆'), bNext = el('button', null, '▶');
    bPrev.title = '上一关键帧'; bAdd.title = '添加/移除关键帧'; bNext.title = '下一关键帧';
    bPrev.onclick = (e) => { e.stopPropagation(); UI.stepKey(L, path, -1); };
    bNext.onclick = (e) => { e.stopPropagation(); UI.stepKey(L, path, 1); };
    bAdd.onclick = (e) => { e.stopPropagation(); UI.toggleKeyAtTime(L, path); };
    knav.appendChild(bPrev); knav.appendChild(bAdd); knav.appendChild(bNext);
    d.appendChild(knav);
    // 表达式按钮
    const eq = el('button', null, 'ƒ'); eq.title = '添加表达式'; eq.style.cssText = 'width:16px;color:#6fd0ff;font-size:11px';
    eq.onclick = (e) => { e.stopPropagation(); UI.toggleExpr(L, path); };
    d.appendChild(eq);
    return d;
  }
  UI.rowProp = rowProp;

  function commitProp(L, path, v) {
    const p = M.getPropAt(L, path);
    if (!p) return;
    if (p.keys && p.keys.length) M.setKey(p, P_().time, v);
    else p.v = v;
    UI.invalidate();
  }
  UI.commitProp = commitProp;
  UI.toggleAnimation = function (L, path) {
    const p = M.getPropAt(L, path);
    if (!p) return;
    M.Undo.begin('动画开关');
    if (p.keys && p.keys.length) { p.keys = []; }
    else { M.setKey(p, P_().time, M.evalKeyframes(p, P_().time)); }
    M.Undo.end(); UI.refresh();
  };
  UI.toggleKeyAtTime = function (L, path) {
    const p = M.getPropAt(L, path);
    if (!p) return;
    M.Undo.begin('关键帧');
    const t = P_().time;
    const ex = p.keys.find(k => Math.abs(k.t - t) < 1e-4);
    if (ex) M.removeKeyAt(p, t); else M.setKey(p, t, M.evalKeyframes(p, t));
    M.Undo.end(); UI.refresh();
  };
  UI.stepKey = function (L, path, dir) {
    const p = M.getPropAt(L, path);
    if (!p || !p.keys.length) return;
    const t = P_().time;
    let best = null;
    for (const k of p.keys) {
      if (dir > 0 && k.t > t + 1e-4 && (!best || k.t < best)) best = k.t;
      if (dir < 0 && k.t < t - 1e-4 && (!best || k.t > best)) best = k.t;
    }
    if (best !== null) UI.setTime(best);
  };
  UI.toggleExpr = function (L, path) {
    const p = M.getPropAt(L, path);
    if (!p) return;
    M.Undo.begin('表达式');
    if (p.exprOn) { p.exprOn = false; p.expr = ''; }
    else {
      p.exprOn = true;
      if (!p.expr) p.expr = 'value';
    }
    M.Undo.end(); UI.refresh();
  };
  UI.setParent = function (L, pid) {
    const c = comp();
    M.Undo.begin('设置父级');
    // 保持画面位置
    const st = new EVAL.EvalState(c, P_().time);
    const before = st.worldMatrix(L);
    L.parent = pid || null;
    const st2 = new EVAL.EvalState(c, P_().time);
    if (pid) {
      const parent = c.layers.find(l => l.id === pid);
      const pw = st2.worldMatrix(parent);
      const local = U.M4.mul(U.M4.inverse(pw), before);
      const dec = U.M4.decompose(local);
      const pos = M.getPropAt(L, ['transform', 'position']);
      const scl = M.getPropAt(L, ['transform', 'scale']);
      const rot = M.getPropAt(L, ['transform', 'rotation']);
      if (pos.keys && pos.keys.length) M.setKey(pos, P_().time, dec.pos); else pos.v = dec.pos;
      if (scl.keys && scl.keys.length) M.setKey(scl, P_().time, [dec.scale[0] * 100, dec.scale[1] * 100, dec.scale[2] * 100]); else scl.v = [dec.scale[0] * 100, dec.scale[1] * 100, dec.scale[2] * 100];
      if (rot.keys && rot.keys.length) M.setKey(rot, P_().time, dec.rot[2] * 180 / Math.PI); else rot.v = dec.rot[2] * 180 / Math.PI;
    }
    M.Undo.end(); UI.refresh();
  };

  /* ---------------- 类型面板 ---------------- */
  function inspText(L) {
    const t = L.text;
    const box = el('div', 'insp-sec');
    const s = section('文字', [
      rowText('内容', t.content, v => { t.content = v; }),
      rowSelect('字体', t.fontFamily, FONT.available.map(f => f.name), v => { t.fontFamily = v; }, FONT.available.map(f => f.label || f.name)),
      rowProp(L, ['text', 'fontSize'], '字号', 'number'),
      rowProp(L, ['text', 'lineHeight'], '行距', 'number'),
      rowProp(L, ['text', 'tracking'], '字距', 'number'),
      rowSelect('对齐', t.align, ['left', 'center', 'right'], v => { t.align = v; }, ['左对齐', '居中', '右对齐']),
      rowProp(L, ['text', 'color'], '颜色', 'color'),
      rowCheck('描边', t.strokeOn, v => { t.strokeOn = v; }),
      rowProp(L, ['text', 'strokeWidth'], '描边宽度', 'number'),
      rowProp(L, ['text', 'strokeColor'], '描边颜色', 'color')
    ]);
    box.appendChild(s);
    // 动画器
    const anims = el('div', 'insp-sec');
    const anBody = el('div', 'insp-body');
    for (const an of (t.animators || [])) {
      anBody.appendChild(rowSelect('动画器类型', an.type, ['position', 'rotation', 'scale', 'opacity'], v => { an.type = v; }, ['位置', '旋转', '缩放', '不透明度']));
      anBody.appendChild(rowProp(an, ['amount'], '数值', 'number'));
      anBody.appendChild(rowProp(an, ['start'], '起点', 'number'));
      anBody.appendChild(rowProp(an, ['end'], '终点', 'number'));
      anBody.appendChild(rowProp(an, ['offset'], '偏移', 'number'));
      anBody.appendChild(rowProp(an, ['softness'], '软边', 'number'));
      anBody.appendChild(rowProp(an, ['axis'], '轴向', 'number'));
    }
    anims.appendChild(el('div', 'insp-sec-title', '<span class="arrow">▾</span><span>文字动画器</span>')).onclick = () => {
      M.Undo.begin('添加动画器');
      t.animators = t.animators || [];
      t.animators.push({ id: M.uid('an'), type: 'position', amount: M.newProp(120), start: M.newProp(0), end: M.newProp(100), offset: M.newProp(0), softness: M.newProp(50), axis: 'y', enabled: true });
      M.Undo.end(); UI.refresh();
    };
    anims.appendChild(anBody);
    box.appendChild(anims);
    return box;
  }

  function inspShape(L) {
    const box = el('div', 'insp-sec');
    const body = el('div', 'insp-body');
    const s = section('形状内容', [], { action: ['＋', () => { UI.addShapeGroup(L); }] });
    for (const g of (L.shapes || [])) {
      const d = el('div', 'prop-row');
      d.innerHTML = `<span class="pname">${esc(g.name)}</span>`;
      const del = el('button', null, '✕'); del.style.cssText = 'color:#ff8a84;width:18px';
      del.onclick = () => { M.Undo.begin('删除形状'); L.shapes = L.shapes.filter(x => x !== g); M.Undo.end(); UI.refresh(); };
      d.appendChild(del);
      body.appendChild(d);
      body.appendChild(rowProp(g.fill, ['color'], '　填充', 'color'));
      body.appendChild(rowProp(g.fill, ['opacity'], '　填充不透明度', 'number'));
      body.appendChild(rowCheck('　描边', g.stroke.on, v => { g.stroke.on = v; }));
      body.appendChild(rowProp(g.stroke, ['color'], '　描边颜色', 'color'));
      body.appendChild(rowProp(g.stroke, ['width'], '　描边宽度', 'number'));
      // 运算
      for (const op of (g.ops || [])) {
        const od = el('div', 'prop-row sub-row');
        od.innerHTML = `<span class="pname">　▸ ${opLabel(op)}</span>`;
        const up = el('button', null, '↑'); up.title = '上移（改变顺序）';
        up.onclick = () => { M.Undo.begin('调整顺序'); const i = g.ops.indexOf(op); if (i > 0) { g.ops.splice(i, 1); g.ops.splice(i - 1, 0, op); } M.Undo.end(); UI.refresh(); };
        const dn = el('button', null, '↓');
        dn.onclick = () => { M.Undo.begin('调整顺序'); const i = g.ops.indexOf(op); if (i < g.ops.length - 1) { g.ops.splice(i, 1); g.ops.splice(i + 1, 0, op); } M.Undo.end(); UI.refresh(); };
        od.appendChild(up); od.appendChild(dn);
        body.appendChild(od);
        if (op.type === 'trim') {
          body.appendChild(rowProp(op, ['start'], '　　起点', 'number'));
          body.appendChild(rowProp(op, ['end'], '　　终点', 'number'));
          body.appendChild(rowProp(op, ['offset'], '　　偏移', 'number'));
        } else if (op.type === 'repeater') {
          body.appendChild(rowProp(op, ['copies'], '　　数量', 'number'));
          body.appendChild(rowProp(op, ['x'], '　　X', 'number'));
          body.appendChild(rowProp(op, ['y'], '　　Y', 'number'));
          body.appendChild(rowProp(op, ['rotation'], '　　旋转', 'number'));
          body.appendChild(rowProp(op, ['scale'], '　　缩放', 'number'));
        } else if (op.type === 'merge') {
          body.appendChild(rowSelect('　　模式', op.mode, ['union', 'subtract', 'intersect'], v => { op.mode = v; }, ['并集', '差集', '交集']));
        } else if (op.type === 'offset') {
          body.appendChild(rowProp(op, ['amount'], '　　偏移量', 'number'));
        } else if (op.type === 'morph') {
          body.appendChild(rowProp(op, ['progress'], '　　进度', 'number'));
        }
      }
      const addOp = el('select', 'pval');
      addOp.style.width = '100%';
      [['trim', '修剪路径'], ['repeater', '重复器'], ['merge', '合并路径'], ['offset', '偏移路径'], ['morph', '路径形变']].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = '＋ ' + l; addOp.appendChild(o); });
      addOp.onchange = () => {
        M.Undo.begin('添加运算');
        const type = addOp.value;
        const op = { type, enabled: true };
        if (type === 'trim') { op.start = M.newProp(0); op.end = M.newProp(100); op.offset = M.newProp(0); }
        if (type === 'repeater') { op.copies = M.newProp(3); op.x = M.newProp(40); op.y = M.newProp(0); op.rotation = M.newProp(0); op.scale = M.newProp(100); }
        if (type === 'merge') op.mode = 'union';
        if (type === 'offset') op.amount = M.newProp(5);
        if (type === 'morph') { op.progress = M.newProp(50); op.targetPath = PT.ellipsePath(0, 0, 100, 60); }
        g.ops = g.ops || []; g.ops.push(op);
        M.Undo.end(); UI.refresh();
      };
      const ad = el('div', 'prop-row'); ad.appendChild(addOp);
      body.appendChild(ad);
    }
    s.appendChild(body);
    box.appendChild(s);
    return box;
  }
  function opLabel(op) { return ({ trim: '修剪路径', repeater: '重复器', merge: '合并路径', offset: '偏移路径', morph: '路径形变' })[op.type] || op.type; }
  UI.addShapeGroup = function (L) {
    M.Undo.begin('添加形状');
    L.shapes = L.shapes || [];
    L.shapes.push({
      id: M.uid('sh'), name: '形状 ' + (L.shapes.length + 1),
      paths: [M.newProp(PT.ellipsePath(0, 0, 80, 80))],
      fill: { on: true, color: M.newProp('#3f8cff', { color: true }), opacity: M.newProp(100) },
      stroke: { on: true, color: M.newProp('#0b1220', { color: true }), width: M.newProp(3), opacity: M.newProp(100) },
      ops: []
    });
    M.Undo.end(); UI.refresh();
  };

  function inspSolid(L) {
    const s = L.solid;
    const c = comp();
    const textLayers = c.layers.filter(l => l.type === 'text');
    const fieldLayers = c.layers.filter(l => l.type === 'field');
    return section('三维实体', [
      rowSelect('几何', s.geometry, ['box', 'cylinder', 'sphere', 'glyph', 'node', 'path'], v => { s.geometry = v; }, ['立方体', '圆柱', '球体', '文字挤出', '节点几何', '路径挤出']),
      rowSelect('文字图层', s.textSource || '', textLayers.map(l => l.id), v => { s.textSource = v || null; }, textLayers.map(l => l.name)),
      rowSelect('节点输出', s.nodeSource || '', c.nodes.nodes.filter(n => n.type === 'output').map(n => n.id), v => { s.nodeSource = v || null; }, c.nodes.nodes.filter(n => n.type === 'output').map(n => '输出 ' + n.id.slice(-4))),
      rowProp(L, ['solid', 'width'], '宽度', 'number'),
      rowProp(L, ['solid', 'height'], '高度', 'number'),
      rowProp(L, ['solid', 'depth'], '深度', 'number'),
      rowProp(L, ['solid', 'bevel'], '倒角', 'number'),
      rowProp(L, ['solid', 'bevelSegments'], '倒角分段', 'number'),
      rowProp(L, ['solid', 'bend'], '弯曲', 'number'),
      rowProp(L, ['solid', 'twist'], '扭转', 'number'),
      rowSelect('变形场', (s.fieldIds || [])[0] || '', fieldLayers.map(l => l.id), v => { s.fieldIds = v ? [v] : []; }, fieldLayers.map(l => l.name)),
      rowCheck('投射阴影', L.castShadow3D !== false, v => { L.castShadow3D = v; })
    ]);
  }

  function inspParticle(L) {
    const p = L.particles;
    const c = comp();
    const solids = c.layers.filter(l => l.type === 'solid');
    const fields = c.layers.filter(l => l.type === 'field');
    return section('粒子系统', [
      rowSelect('发射器', p.emitter.type, ['point', 'curve', 'surface', 'volume'], v => { p.emitter.type = v; }, ['点', '曲线', '几何表面', '体积']),
      rowSelect('发射源', p.emitter.source || '', solids.map(l => l.id), v => { p.emitter.source = v || null; }, solids.map(l => l.name)),
      rowProp(L, ['particles', 'rate'], '发射速率', 'number'),
      rowProp(L, ['particles', 'lifetime'], '寿命', 'number'),
      rowProp(L, ['particles', 'speed'], '初速度', 'number'),
      rowProp(L, ['particles', 'speedVar'], '速度变化', 'number'),
      rowProp(L, ['particles', 'size'], '大小', 'number'),
      rowProp(L, ['particles', 'color'], '颜色', 'color'),
      rowProp(L, ['particles', 'colorEnd'], '结束颜色', 'color'),
      rowProp(L, ['particles', 'opacity'], '不透明度', 'number'),
      rowProp(L, ['particles', 'forces', 'gravity'], '重力', 'vec3'),
      rowProp(L, ['particles', 'forces', 'drag'], '阻力', 'number'),
      rowProp(L, ['particles', 'seed'], '随机种子', 'number'),
      rowSelect('力场', (p.forces.fields || [])[0] || '', fields.map(l => l.id), v => { p.forces.fields = v ? [v] : []; }, fields.map(l => l.name)),
      rowCheck('碰撞', p.collision.on, v => { p.collision.on = v; }),
      rowCheck('拖尾', p.trail.on, v => { p.trail.on = v; }),
      rowProp(L, ['particles', 'trail', 'length'], '拖尾长度', 'number'),
      rowProp(L, ['particles', 'trail', 'width'], '拖尾宽度', 'number')
    ]);
  }

  function inspCamera(L) {
    return section('摄像机', [
      rowProp(L, ['camera', 'fov'], '视角', 'number'),
      rowProp(L, ['camera', 'focus'], '对焦距离', 'number'),
      rowProp(L, ['camera', 'aperture'], '光圈', 'number'),
      rowCheck('景深', L.camera.dof.v, v => { L.camera.dof.v = v; }),
      rowProp(L, ['camera', 'target'], '目标点', 'vec3')
    ]);
  }
  function inspLight(L) {
    return section('灯光', [
      rowSelect('类型', L.light.kind, ['point', 'directional', 'spot'], v => { L.light.kind = v; }, ['点光源', '平行光', '聚光灯']),
      rowProp(L, ['light', 'color'], '颜色', 'color'),
      rowProp(L, ['light', 'intensity'], '强度', 'number'),
      rowCheck('投射阴影', L.light.castShadow.v, v => { L.light.castShadow.v = v; }),
      rowProp(L, ['light', 'target'], '目标点', 'vec3'),
      rowProp(L, ['light', 'radius'], '半径', 'number')
    ]);
  }
  function inspAudio(L) {
    return section('音色', [
      rowSelect('类型', L.audio.kind, ['music', 'sfx'], v => { L.audio.kind = v; }, ['配乐', '音效']),
      rowSelect('音色', L.audio.pattern, ['forge', 'ember', 'hit', 'whoosh', 'bell', 'drone'], v => { L.audio.pattern = v; }, ['锻打配乐', '余烬', '锤击', '呼啸', '钟声', '低鸣']),
      rowProp(L, ['audio', 'volume'], '音量', 'number'),
      rowCheck('静音', L.audio.mute, v => { L.audio.mute = v; })
    ]);
  }
  function inspPrecomp(L) {
    const c = comp();
    const comps = Object.values(MODEL.Project.comps).filter(x => x.id !== c.id);
    return section('预合成', [
      rowSelect('合成', L.precomp.compId || '', comps.map(x => x.id), v => { L.precomp.compId = v || null; }, comps.map(x => x.name)),
      rowProp(L, ['precomp', 'startTime'], '起始时间', 'number'),
      rowProp(L, ['precomp', 'stretch'], '速度 %', 'number'),
      rowCheck('时间重映射', L.precomp.remapOn, v => { L.precomp.remapOn = v; }),
      L.precomp.remapOn ? rowProp(L, ['precomp', 'timeRemap'], '重映射', 'number') : null
    ]);
  }
  function inspField(L) {
    return section('空间场', [
      rowSelect('类型', L.field.type, ['radial', 'noise', 'vortex', 'directional', 'turbulence'], v => { L.field.type = v; }, ['径向', '噪声', '旋涡', '方向', '湍流']),
      rowProp(L, ['field', 'radius'], '范围', 'number'),
      rowProp(L, ['field', 'strength'], '强度', 'number'),
      rowSelect('衰减', L.field.falloff, ['smooth', 'linear', 'inverse', 'constant'], v => { L.field.falloff = v; }, ['平滑', '线性', '反比', '恒定']),
      rowProp(L, ['field', 'frequency'], '频率', 'number'),
      rowProp(L, ['field', 'speed'], '速度', 'number'),
      rowSelect('混合', L.field.blend, ['add', 'max', 'multiply'], v => { L.field.blend = v; }, ['相加', '最大', '相乘']),
      rowCheck('反转', L.field.invert, v => { L.field.invert = v; }),
      rowProp(L, ['field', 'color'], '显示颜色', 'color')
    ]);
  }

  function inspMasks(L) {
    const s = section('蒙版', [], { action: ['＋', () => UI.addMask(L)] });
    const body = s.querySelector('.insp-body');
    for (const mk of (L.masks || [])) {
      const d = el('div', 'prop-row');
      d.innerHTML = `<span class="pname">${esc(mk.name)}</span>`;
      const del = el('button', null, '✕'); del.style.color = '#ff8a84';
      del.onclick = () => { M.Undo.begin('删除蒙版'); L.masks = L.masks.filter(x => x !== mk); M.Undo.end(); UI.refresh(); };
      d.appendChild(del);
      body.appendChild(d);
      body.appendChild(rowSelect('　模式', mk.mode, ['add', 'subtract', 'intersect'], v => { mk.mode = v; }, ['相加', '相减', '相交']));
      body.appendChild(rowCheck('　反转', mk.inverted, v => { mk.inverted = v; }));
      body.appendChild(rowProp(mk, ['feather'], '　羽化', 'number'));
      body.appendChild(rowProp(mk, ['opacity'], '　不透明度', 'number'));
    }
    return s;
  }

  function inspEffects(L) {
    const s = section('效果', [], { action: ['＋', () => UI.addEffect('blur')] });
    const body = s.querySelector('.insp-body');
    const names = { blur: '高斯模糊', glow: '发光', shadow: '投影', hsb: '色相/饱和度', fill: '填充' };
    for (const fx of (L.effects || [])) {
      const d = el('div', 'prop-row');
      d.innerHTML = `<span class="pname">${names[fx.type] || fx.type}</span>`;
      const en = el('button', null, fx.enabled ? '●' : '○'); en.title = '启用/禁用';
      en.style.cssText = 'width:16px;color:' + (fx.enabled ? '#5ad19a' : '#555');
      en.onclick = () => { fx.enabled = !fx.enabled; UI.refresh(); };
      const del = el('button', null, '✕'); del.style.color = '#ff8a84';
      del.onclick = () => { M.Undo.begin('删除效果'); L.effects = L.effects.filter(x => x !== fx); M.Undo.end(); UI.refresh(); };
      d.appendChild(en); d.appendChild(del);
      body.appendChild(d);
      const pd = { blur: [['amount', '数量']], glow: [['threshold', '阈值'], ['intensity', '强度'], ['radius', '半径']], shadow: [['distance', '距离'], ['angle', '角度'], ['softness', '柔和'], ['opacity', '不透明度'], ['color', '颜色']], hsb: [['hue', '色相'], ['saturation', '饱和度'], ['brightness', '亮度']], fill: [['color', '颜色']] }[fx.type] || [];
      for (const [k, lab] of pd) body.appendChild(rowProp(fx, ['params', k], '　' + lab, k === 'color' ? 'color' : 'number'));
    }
    return s;
  }

  function inspPins(L) {
    const s = section('图钉', [], { action: ['＋', () => { UI.toast('使用图钉工具 (P) 在画布上点击添加'); }] });
    const body = s.querySelector('.insp-body');
    for (const pin of L.pins) {
      body.appendChild(rowProp(pin, ['position'], '　' + pin.name + ' 位置', 'vec2'));
      body.appendChild(rowProp(pin, ['rotation'], '　旋转', 'number'));
      body.appendChild(rowProp(pin, ['scale'], '　缩放', 'number'));
    }
    return s;
  }

  /* ---------------- 材质面板 ---------------- */
  UI.buildMaterialPanel = function (sel) {
    const wrap = $('#material-panel');
    wrap.innerHTML = '';
    const L = sel.find(l => l.type === 'solid');
    if (!L) { wrap.appendChild(el('div', 'insp-empty', '选择三维实体以编辑材质')); return; }
    const s = section('材质 · ' + esc(L.name), [
      rowProp(L, ['material', 'color'], '基础色', 'color'),
      rowProp(L, ['material', 'metallic'], '金属度', 'number'),
      rowProp(L, ['material', 'roughness'], '粗糙度', 'number'),
      rowProp(L, ['material', 'emissive'], '发光颜色', 'color'),
      rowProp(L, ['material', 'emissiveIntensity'], '发光强度', 'number'),
      rowProp(L, ['material', 'opacity'], '不透明度', 'number'),
      rowProp(L, ['material', 'env'], '环境强度', 'number')
    ]);
    wrap.appendChild(s);
    // 材质预设
    const presets = el('div', 'insp-sec');
    presets.appendChild(el('div', 'insp-sec-title', '材质预设'));
    const pb = el('div', 'sec-actions');
    const mats = [
      ['黄金', '#d4a537', 0.95, 0.25], ['钢铁', '#9aa3ad', 0.9, 0.35], ['炽热', '#ff7a18', 0.7, 0.45],
      ['黑曜石', '#15161a', 0.2, 0.12], ['青铜', '#a5762f', 0.9, 0.4], ['陶瓷', '#e8e6e0', 0.05, 0.15]
    ];
    for (const [n, col, met, rough] of mats) {
      const b = el('button', 'btn small', n);
      b.style.borderLeft = '3px solid ' + col;
      b.onclick = () => {
        M.Undo.begin('材质预设');
        const m = L.material;
        m.color.v = col; m.metallic.v = met; m.roughness.v = rough;
        M.Undo.end(); UI.refresh();
      };
      pb.appendChild(b);
    }
    presets.appendChild(pb);
    wrap.appendChild(presets);
  };
  UI.buildFieldPanel = function (sel) {
    const wrap = $('#field-panel');
    wrap.innerHTML = '';
    const c = comp();
    wrap.appendChild(el('div', 'insp-sec-title', '空间场与模拟设置'));
    const body = el('div', 'insp-body');
    for (const L of (c ? c.layers : [])) {
      if (L.type !== 'field' && L.type !== 'particle') continue;
      const d = el('div', 'prop-row');
      d.innerHTML = `<span class="pname">${esc(L.name)}</span><span class="ih-type">${M.LAYER_TYPES[L.type].label}</span>`;
      d.onclick = () => { P_().selection = [L.id]; UI.refresh(); };
      d.style.cursor = 'pointer';
      body.appendChild(d);
    }
    if (!body.children.length) body.appendChild(el('div', 'insp-empty', '暂无场或粒子图层'));
    wrap.appendChild(body);
  };

  /* ---------------- 键盘 ---------------- */
  UI.handleKey = function (e) {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    const c = comp();
    const k = e.key;
    if (k === ' ') { e.preventDefault(); UI.togglePlay(); return; }
    if (k === 'Home') { UI.setTime(0); return; }
    if (k === 'End') { if (c) UI.setTime(c.duration); return; }
    if (k === 'ArrowLeft') { e.preventDefault(); if (c) UI.setTime(P_().time - (e.shiftKey ? 10 : 1) / c.fps); return; }
    if (k === 'ArrowRight') { e.preventDefault(); if (c) UI.setTime(P_().time + (e.shiftKey ? 10 : 1) / c.fps); return; }
    if (k === 'j' || k === 'J') { UI.stepSelectedKeys(-1); return; }
    if (k === 'k' || k === 'K') { UI.stepSelectedKeys(1); return; }
    if (k === 'v' || k === 'V') { UI.setTool('select'); return; }
    if (k === 'h' || k === 'H') { UI.setTool('hand'); return; }
    if (k === 'r' || k === 'R') { UI.setTool('rect'); return; }
    if (k === 'e' || k === 'E') { UI.setTool('ellipse'); return; }
    if (k === 'g' || k === 'G') { UI.setTool('pen'); return; }
    if (k === 't' || k === 'T') { UI.setTool('text'); return; }
    if (k === 'p' || k === 'P') { UI.setTool('pin'); return; }
    if (k === '\\') { UI.zoomFit(); return; }
    if (k === 'Delete' || k === 'Backspace') {
      if (UI.selectedKeys.length) { UI.deleteSelectedKeys(); return; }
      UI.deleteLayer(); return;
    }
    if (k === 'F9') { e.preventDefault(); UI.setKeyEaseSelected('auto'); return; }
    if (e.ctrlKey || e.metaKey) {
      if (k === 'z' || k === 'Z') { e.preventDefault(); e.shiftKey ? UI.redo() : UI.undo(); return; }
      if (k === 'y' || k === 'Y') { e.preventDefault(); UI.redo(); return; }
      if (k === 'd' || k === 'D') { e.preventDefault(); UI.duplicateLayer(); return; }
      if (k === 'a' || k === 'A') { e.preventDefault(); if (c) { P_().selection = c.layers.map(l => l.id); UI.refresh(); } return; }
      if (k === 's' || k === 'S') { e.preventDefault(); UI.saveProject(); return; }
      if (k === 'o' || k === 'O') { e.preventDefault(); $('#file-open').click(); return; }
      if (k === 'c' || k === 'C') { if (e.shiftKey) { e.preventDefault(); UI.precompose(); } return; }
      if (k === 'l' || k === 'L') { if (e.shiftKey) { e.preventDefault(); UI.setKeyEaseSelected('linear'); } return; }
    }
  };
  UI.stepSelectedKeys = function (dir) {
    const c = comp(); if (!c) return;
    const sel = selLayers();
    let best = null;
    for (const L of sel) {
      for (const path of animPaths(L)) {
        const p = M.getPropAt(L, path);
        if (!p || !p.keys) continue;
        for (const k of p.keys) {
          if (dir > 0 && k.t > P_().time + 1e-4 && (!best || k.t < best)) best = k.t;
          if (dir < 0 && k.t < P_().time - 1e-4 && (!best || k.t > best)) best = k.t;
        }
      }
    }
    if (best !== null) UI.setTime(best);
  };
  function animPaths(L) {
    const out = [];
    for (const k in L.transform) out.push(['transform', k]);
    if (L.type === 'text') for (const k of ['fontSize', 'lineHeight', 'tracking', 'color']) out.push(['text', k]);
    if (L.type === 'solid') for (const k of ['width', 'height', 'depth', 'bevel', 'bend', 'twist']) out.push(['solid', k]);
    if (L.type === 'particle') for (const k of ['rate', 'lifetime', 'speed', 'size', 'opacity']) out.push(['particles', k]);
    return out;
  }
  UI.animPaths = animPaths;
  UI.setKeyEaseSelected = function (ease) {
    const c = comp(); if (!c) return;
    M.Undo.begin('关键帧缓动');
    for (const L of selLayers()) {
      for (const path of animPaths(L)) {
        const p = M.getPropAt(L, path);
        if (!p || !p.keys) continue;
        for (const k of p.keys) if (UI.selectedKeys.some(sk => sk.layer === L.id && sk.path.join('.') === path.join('.') && Math.abs(sk.t - k.t) < 1e-4)) k.ease = ease;
        M.recomputeTangents(p);
      }
    }
    M.Undo.end(); UI.refresh();
  };
  UI.deleteSelectedKeys = function () {
    M.Undo.begin('删除关键帧');
    for (const sk of UI.selectedKeys) {
      const L = comp().layers.find(l => l.id === sk.layer);
      if (!L) continue;
      const p = M.getPropAt(L, sk.path);
      if (p) M.removeKeyAt(p, sk.t);
    }
    UI.selectedKeys = [];
    M.Undo.end(); UI.refresh();
  };

  /* ---------------- 初始化 ---------------- */
  UI.init = function () {
    UI.buildMenus();
    $('#btn-play').onclick = () => UI.togglePlay();
    $('#btn-first').onclick = () => UI.setTime(0);
    $('#btn-last').onclick = () => { const c = comp(); if (c) UI.setTime(c.duration); };
    $('#btn-prev-key').onclick = () => UI.stepSelectedKeys(-1);
    $('#btn-next-key').onclick = () => UI.stepSelectedKeys(1);
    $('#btn-loop').onclick = () => { P_().loop = !P_().loop; $('#btn-loop').classList.toggle('on', P_().loop); };
    $('#btn-grid').onclick = () => { P_().view.showGrid = !P_().view.showGrid; UI.updateViewerButtons(); UI.invalidate(); };
    $('#btn-guides').onclick = () => { P_().view.showGuides = !P_().view.showGuides; UI.updateViewerButtons(); UI.invalidate(); };
    $('#btn-overlays').onclick = () => { P_().view.showOverlays = !P_().view.showOverlays; UI.updateViewerButtons(); UI.invalidate(); };
    $('#btn-zoom-fit').onclick = () => UI.zoomFit();
    $('#zoom-select').onchange = (e) => { P_().view.zoom = e.target.value === 'fit' ? 'fit' : +e.target.value; UI.invalidate(); };
    $('#btn-undo').onclick = () => UI.undo();
    $('#btn-redo').onclick = () => UI.redo();
    $('#btn-save').onclick = () => UI.saveProject();
    $('#btn-load').onclick = () => $('#file-open').click();
    $('#btn-new-comp').onclick = () => UI.newCompDialog();
    $('#file-open').onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      U.readFileText(f).then(txt => {
        try { M.deserialize(txt); M.Undo.reset(); UI.refresh(); UI.toast('工程已载入'); }
        catch (err) { UI.toast('工程文件无效'); }
      });
    };
    document.querySelectorAll('#right-tabs .tab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('#right-tabs .tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        document.querySelectorAll('.rpanel').forEach(x => x.classList.remove('active'));
        const id = t.dataset.rtab;
        P_().ui.rightTab = id;
        const map = { props: '#inspector', material: '#material-panel', nodes: '#node-panel', fields: '#field-panel' };
        const elx = $(map[id]); if (elx) elx.classList.add('active');
        if (id === 'nodes') UI_NODES.resize();
      };
    });
    document.querySelectorAll('#tl-body').forEach(() => { });
    document.querySelectorAll('#tl-body .tab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('#tl-body .tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const id = t.dataset.tab;
        P_().ui.timelineTab = id;
        $('#key-canvas-wrap').classList.toggle('hidden', id === 'curves');
        $('#graph-wrap').classList.toggle('hidden', id !== 'curves');
        UI_TIMELINE.resize();
      };
    });
    $('#btn-tl-zoomin').onclick = () => UI_TIMELINE.zoom(1.3);
    $('#btn-tl-zoomout').onclick = () => UI_TIMELINE.zoom(1 / 1.3);
    $('#btn-kf-easy').onclick = () => UI.setKeyEaseSelected('auto');
    $('#btn-kf-linear').onclick = () => UI.setKeyEaseSelected('linear');
    $('#btn-kf-hold').onclick = () => UI.setKeyEaseSelected('hold');
    $('#btn-kf-del').onclick = () => UI.deleteSelectedKeys();
    $('#btn-kf-copy').onclick = () => UI.copyKeys();
    $('#btn-kf-paste').onclick = () => UI.pasteKeys();
    $('#btn-workarea').onclick = () => { const c = comp(); if (c) { c.workArea = [P_().time, Math.min(c.duration, P_().time + 5)]; UI.invalidate(); } };
    window.addEventListener('keydown', UI.handleKey);
    UI.updateViewerButtons();
    setInterval(() => { $('#status-fps').textContent = UI.fps ? UI.fps.toFixed(0) + ' fps' : ''; }, 500);
  };

  UI.copyKeys = function () {
    const c = comp(); if (!c) return;
    const arr = [];
    for (const sk of UI.selectedKeys) {
      const L = c.layers.find(l => l.id === sk.layer);
      if (!L) continue;
      const p = M.getPropAt(L, sk.path);
      const k = p.keys.find(k => Math.abs(k.t - sk.t) < 1e-4);
      if (k) arr.push({ layer: L.id, path: sk.path, t: k.t, v: JSON.parse(JSON.stringify(k.v)), ease: k.ease });
    }
    UI.clip = arr;
    UI.toast('已复制 ' + arr.length + ' 个关键帧');
  };
  UI.pasteKeys = function () {
    if (!UI.clip || !UI.clip.length) return;
    M.Undo.begin('粘贴关键帧');
    for (const ck of UI.clip) {
      const L = comp().layers.find(l => l.id === ck.layer);
      if (!L) continue;
      const p = M.getPropAt(L, ck.path);
      M.setKey(p, ck.t, ck.v);
    }
    M.Undo.end(); UI.refresh();
  };

  global.UI = UI;
})(window);
