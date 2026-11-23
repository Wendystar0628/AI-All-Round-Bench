/* viewer.js — 合成画布：渲染呈现、辅助元素叠加、选择/变换/运动路径/路径编辑/图钉/摄像机轨道/绘制工具 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, G = AE.G, M = U.M, Model = AE.Model, App = AE.App, UI = AE.UI, Nodes = AE.Nodes, Shapes = AE.Shapes, A2 = G.A2;
  const h = UI.h;
  const V = AE.Viewer = {};
  let wrap, glc, ovc, octx, glctx, renderer, W = 800, H = 500, dpr = 1, foot, badge, emptyHint;
  let drag = null; const state = { space: false, hover: null, pen: null, rectDrag: null, selVertex: null, mouse: [0, 0] };
  V.state = state;
  const TOOLS = [['select', '选择 (V)', '<path d="M5 3l12 8-5 1.5L9.5 18z"/>'], ['hand', '抓手 (H)', '<path d="M8 12V6a1.5 1.5 0 013 0v5m0-1V4.5a1.5 1.5 0 013 0V11m0-4a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-1a6 6 0 01-5-3l-2-4a1.5 1.5 0 012.5-1.5L8 14"/>'], ['zoom', '缩放 (Z)', '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5M10.5 8v5"/>'], ['rect', '矩形 (Q)', '<rect x="4" y="6" width="16" height="12" rx="1"/>'], ['ellipse', '椭圆 (Q)', '<ellipse cx="12" cy="12" rx="8" ry="6"/>'], ['pen', '钢笔 (G)', '<path d="M4 20l4-1 11-11-3-3L5 16zM14 7l3 3"/>'], ['text', '文字', '<path d="M5 6h14M12 6v13M9 19h6"/>'], ['orbit', '轨道摄像机 (C)', '<ellipse cx="12" cy="12" rx="9" ry="4"/><circle cx="12" cy="12" r="2.2"/><path d="M12 3a9 9 0 010 18"/>'], ['pin', '图钉', '<path d="M12 3l3 3-2 4 4 4-6 1-4 5 1-6-3-3z"/>']];

  V.init = (host) => {
    host.innerHTML = '';
    const tb = h('div', { class: 'vtoolbar' });
    for (const [id, title, path] of TOOLS) tb.append(h('button', { class: 'btn ic', 'data-tool': id, title, html: `<svg viewBox="0 0 24 24">${path}</svg>`, onclick: () => V.setTool(id) }));
    tb.append(h('div', { class: 'sep' }));
    const compSel = h('select', { id: 'viewCompSel', title: '当前合成', style: { maxWidth: '140px' }, onchange: e => App.setComp(e.target.value) });
    tb.append(compSel, h('div', { style: { flex: 1 } }), h('span', { class: 'muted', id: 'toolHint' }));
    glc = h('canvas', { id: 'glcanvas' }); ovc = h('canvas', { id: 'overlay' });
    badge = h('div', { class: 'viewer-badge' }); emptyHint = h('div', { class: 'empty-hint hidden' }, h('b', { text: '空工程' }), h('div', { html: '使用「图层 ▸ 新建」创建形状、文字、三维几何等图层，<br>或在画布上用矩形 / 椭圆 / 钢笔工具直接绘制。<br>也可通过「文件 ▸ 载入示例」打开 15 秒「锻字」示例。' }));
    wrap = h('div', { id: 'viewerWrap' }, glc, ovc, badge, emptyHint, h('div', { class: 'simnote hidden', id: 'simnote', text: '模拟中…' }));
    foot = h('div', { class: 'vfoot' });
    const zoomSel = h('select', { id: 'zoomSel', onchange: e => { const v = +e.target.value; if (v === 0) { App.view.zoom = 0; App.requestRender(); } else V.setZoom(v); } }, [['0', '适合'], ['0.25', '25%'], ['0.5', '50%'], ['1', '100%'], ['2', '200%']].map(([v, l]) => h('option', { value: v, text: l })));
    const qSel = h('select', { onchange: e => { App.quality = +e.target.value; App.requestRender(); }, title: '预览分辨率' }, [['1', '完整'], ['0.5', '一半'], ['0.25', '四分之一']].map(([v, l]) => h('option', { value: v, text: l })));
    const tog = (label, key, title) => h('button', { class: 'btn sm', 'data-opt': key, title, text: label, onclick: () => { App.opts[key] = !App.opts[key]; App.requestRender(); refreshFoot(); } });
    foot.append(h('span', { class: 'tc', id: 'footTc' }), h('span', { class: 'muted', id: 'footFrame' }), h('div', { class: 'sep' }), zoomSel, qSel, tog('网格', 'grid', '显示网格'), tog('安全框', 'safe', '安全边距'), tog('透明网格', 'checker', '透明度网格'), tog('路径', 'motionPaths', '运动路径'), tog('辅助', 'handles', '手柄与辅助元素'), h('div', { style: { flex: 1 } }), h('span', { id: 'footInfo', class: 'muted' }));
    host.append(tb, wrap, foot);
    try { glctx = new AE.GLCtx(glc); renderer = new AE.Renderer(glctx); renderer.ev = App.ev; V.renderer = renderer; V.glctx = glctx; }
    catch (e) { wrap.append(h('div', { class: 'empty-hint', html: '<b>无法初始化 WebGL 2</b><div>' + e.message + '</div>' })); console.error(e); }
    new ResizeObserver(() => { resize(); App.requestRender(); }).observe(wrap);
    window.addEventListener('resize', () => { resize(); App.requestRender(); });
    bindEvents(); App.on('render', V.render); App.on('struct', () => { refreshComps(); }); App.on('comp', refreshComps); refreshFoot(); V.setTool('select');
  };
  const refreshComps = () => { const s = document.getElementById('viewCompSel'); if (!s) return; s.innerHTML = ''; for (const c of App.project.comps) s.append(h('option', { value: c.id, text: c.name })); s.value = App.comp.id; };
  const refreshFoot = () => { foot.querySelectorAll('[data-opt]').forEach(b => b.classList.toggle('on', !!App.opts[b.dataset.opt])); };
  V.setTool = (t) => { if (state.pen && t !== 'pen') V.finishPen(); state.pen = t === 'pen' ? state.pen : null; App.tool = t; document.querySelectorAll('.vtoolbar [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); const hint = { select: '点击选择；拖动移动；Alt+拖动手柄锚点', hand: '拖动平移画布', zoom: '点击放大，Alt+点击缩小', rect: '拖动绘制矩形（选中形状图层时加入该图层，Alt 新建图层）', ellipse: '拖动绘制椭圆（选中形状图层时加入该图层，Alt 新建图层）', pen: '点击添加顶点，拖动产生曲线手柄；Enter 完成，点击起点闭合', text: '点击画布创建文字', orbit: '拖动环绕 / Shift 平移 / 滚轮推拉（无摄像机时自动创建）', pin: '点击几何添加图钉 / 拖动图钉（需选中图钉变形节点）' }[t] || ''; const el = document.getElementById('toolHint'); if (el) el.textContent = hint; wrap && (wrap.style.cursor = { hand: 'grab', zoom: 'zoom-in', rect: 'crosshair', ellipse: 'crosshair', pen: 'crosshair', text: 'text', orbit: 'move', pin: 'crosshair' }[t] || 'default'); App.requestRender(); };
  V.cancelTool = () => { if (state.pen) { state.pen = null; } state.rectDrag = null; App.requestRender(); };
  const resize = () => { if (!wrap) return; const r = wrap.getBoundingClientRect(); W = Math.max(40, r.width); H = Math.max(40, r.height); dpr = Math.min(window.devicePixelRatio || 1, 2); for (const c of [glc, ovc]) { const w = Math.round(W * dpr), hh = Math.round(H * dpr); if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; } } };

  // ===== 布局 =====
  const layout = () => {
    const c = App.comp; const pad = 22; let s = App.view.zoom;
    if (!s) s = Math.max(0.02, Math.min((W - pad * 2) / c.w, (H - pad * 2) / c.h));
    const px = App.view.zoom ? App.view.px : 0, py = App.view.zoom ? App.view.py : 0;
    return { s, ox: (W - c.w * s) / 2 + px, oy: (H - c.h * s) / 2 + py, c };
  };
  V.layout = layout;
  V.setZoom = (z) => { const r = layout(); App.view.zoom = U.clamp(z, 0.05, 8); App.view.px = 0; App.view.py = 0; const el = document.getElementById('zoomSel'); if (el) el.value = [0.25, 0.5, 1, 2].includes(z) ? String(z) : '0'; App.requestRender(); };
  const toComp = (sx, sy) => { const r = layout(); return [(sx - r.ox) / r.s, (sy - r.oy) / r.s]; };
  const toScreen = (cx, cy) => { const r = layout(); return [r.ox + cx * r.s, r.oy + cy * r.s]; };
  V.toComp = toComp; V.toScreen = toScreen;

  // ===== 投影（与渲染使用同一摄像机）=====
  const camInfo = () => { const c = App.comp; return App.ev.cameraMatrices(c, App.time, c.w / c.h); };
  const proj3 = (cm, p) => { const m = cm.vp; const x = p[0], y = p[1], z = p[2] || 0; const w = m[3] * x + m[7] * y + m[11] * z + m[15]; if (w <= 1e-4) return null; const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w, ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w; const c = App.comp; const cx = (nx * 0.5 + 0.5) * c.w, cy = (0.5 - ny * 0.5) * c.h; const s = toScreen(cx, cy); return { x: s[0], y: s[1], w, cx, cy }; };
  V.proj3 = (p) => proj3(camInfo(), p);
  // 屏幕 → 射线
  const rayAt = (cm, sx, sy) => { const c = App.comp; const [cx, cy] = toComp(sx, sy); const nx = cx / c.w * 2 - 1, ny = 1 - cy / c.h * 2; const vx = nx * cm.tanHalf * cm.aspect, vy = -ny * cm.tanHalf; const d = U.V.norm([cm.right[0] * vx + cm.down[0] * vy + cm.fwd[0], cm.right[1] * vx + cm.down[1] * vy + cm.fwd[1], cm.right[2] * vx + cm.down[2] * vy + cm.fwd[2]]); return { o: cm.pos, d }; };
  // 屏幕 → 图层局部平面（z=0）
  const localOnPlane = (L, sx, sy) => { const c = App.comp; const wm = App.ev.worldMatrix(c, L, App.time); const inv = M.invert(wm); if (!L.is3D) { const [cx, cy] = toComp(sx, sy); const p = M.pt(inv, [cx, cy, 0]); return [p[0], p[1]]; } const cm = camInfo(); const ray = rayAt(cm, sx, sy); const o = M.pt(inv, ray.o), d = M.dir(inv, ray.d); if (Math.abs(d[2]) < 1e-9) return null; const t = -o[2] / d[2]; return [o[0] + d[0] * t, o[1] + d[1] * t]; };
  V.localOnPlane = localOnPlane;

  // 图层局部范围
  const boundsCache = new Map(); let boundsRev = -1;
  const layerBounds = (L) => {
    const rev = App.rev; if (rev !== boundsRev) { boundsCache.clear(); boundsRev = rev; }
    const key = L.id + '|' + App.time; if (boundsCache.has(key)) return boundsCache.get(key);
    const c = App.comp, ev = App.ev, t = App.time; let b = null;
    try {
      if (L.type === 'shape') b = Shapes.drawsBBox(Shapes.evalShapeLayer(ev, c, L, t, 0.5));
      else if (L.type === 'text') b = Shapes.drawsBBox(Shapes.evalTextLayer(ev, c, L, t));
      else if (L.type === 'precomp') { const ic = Model.comp(App.project, L.comp); if (ic) b = [0, 0, ic.w, ic.h]; }
      else if (L.type === 'null') b = [-40, -40, 40, 40];
      else if (L.type === 'geo') { const go = Nodes.geoOut(ev, c, t, L); const m = go && Nodes.displayMesh(go); if (m) { const bb = AE.Mesh.bounds(m); b = [bb[0], bb[1], bb[3], bb[4], bb[2], bb[5]]; } }
      else if (L.type === 'adjust') b = [0, 0, c.w, c.h];
    } catch (e) { }
    boundsCache.set(key, b); return b;
  };
  V.layerBounds = layerBounds;

  // ===== 渲染 =====
  V.render = () => {
    if (!renderer) return; resize(); const c = App.comp; const r = layout();
    const rs = U.clamp(r.s * dpr * App.quality, 0.15, 2); const rw = Math.max(16, Math.round(c.w * rs)), rh = Math.max(16, Math.round(c.h * rs));
    emptyHint.classList.toggle('hidden', c.layers.length > 0);
    let rt = null;
    try { rt = renderer.renderComp(c, App.time, rw, rh, { root: true }); } catch (e) { console.error('渲染错误', e); }
    if (rt) { renderer.present(rt, [r.ox * dpr, r.oy * dpr, c.w * r.s * dpr, c.h * r.s * dpr], App.opts.checker); glctx.release(rt); }
    drawOverlay();
    const fx = document.getElementById('footTc'); if (fx) { fx.textContent = App.tc(App.time); document.getElementById('footFrame').textContent = '帧 ' + Math.round(App.time * c.fps) + ' / ' + Math.round(c.dur * c.fps); document.getElementById('footInfo').textContent = `${c.w}×${c.h} @${c.fps}fps · ${Math.round(r.s * 100)}%`; }
    badge.textContent = c.name + (App.sel.layers.length ? ' · ' + App.sel.layers.length + ' 选中' : '');
    const pn = document.getElementById('projName'); if (pn) pn.textContent = App.project.name;
  };
  V.exportPNG = () => { App.renderNow(); glc.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = App.project.name + '_' + Math.round(App.time * App.comp.fps) + '.png'; a.click(); }); };

  // ===== 叠加层 =====
  const COL = { sel: '#ff8a3d', path: '#3fc7d8', gizmo: ['#ff5a4a', '#6fcf7f', '#5a9bff'], light: '#ffd15a', cam: '#8fd0ff', field: '#a58bff', pin: '#ffcf5a' };
  function drawOverlay() {
    const ctx = octx = ovc.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const c = App.comp, r = layout(); const cm = camInfo();
    // 边框、网格、安全框
    ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(r.ox) + 0.5, Math.round(r.oy) + 0.5, c.w * r.s, c.h * r.s);
    if (App.opts.grid) { ctx.strokeStyle = '#ffffff14'; ctx.beginPath(); const step = 100; for (let x = step; x < c.w; x += step) { const sx = r.ox + x * r.s; ctx.moveTo(sx, r.oy); ctx.lineTo(sx, r.oy + c.h * r.s); } for (let y = step; y < c.h; y += step) { const sy = r.oy + y * r.s; ctx.moveTo(r.ox, sy); ctx.lineTo(r.ox + c.w * r.s, sy); } ctx.stroke(); }
    if (App.opts.safe) { ctx.strokeStyle = '#6fcf7f77'; ctx.setLineDash([4, 4]); for (const k of [0.05, 0.1]) ctx.strokeRect(r.ox + c.w * k * r.s, r.oy + c.h * k * r.s, c.w * (1 - 2 * k) * r.s, c.h * (1 - 2 * k) * r.s); ctx.setLineDash([]); }
    if (!App.opts.handles) return;
    // 摄像机 / 灯光图标
    for (const L of c.layers) {
      if (!App.ev.active(L, App.time) && !App.sel.layers.includes(L.id)) continue;
      if (L.type === 'light') drawLight(ctx, L, cm); else if (L.type === 'camera') drawCamera(ctx, L, cm);
    }
    // 选中图层
    const sel = App.selLayers();
    for (const L of sel) { if (L.type === 'camera' || L.type === 'light') continue; drawSelection(ctx, L, cm, L === sel[sel.length - 1]); }
    if (App.opts.motionPaths) for (const L of sel) drawMotionPath(ctx, L, cm);
    drawPathEdit(ctx, cm); drawNodeOverlay(ctx, cm); drawToolPreview(ctx);
  }
  const wpos = (L) => { const c = App.comp; const f = App.ev.frame(c, L, App.time, L.is3D); return [f[12], f[13], f[14]]; };
  const pxToScreen = (L, p3, cm) => L.is3D ? proj3(cm, p3) : (() => { const s = toScreen(p3[0], p3[1]); return { x: s[0], y: s[1], w: 1 }; })();
  function drawLight(ctx, L, cm) {
    const c = App.comp, ev = App.ev, t = App.time; const lt = ev.lights(c, t).find(x => x.layer === L); let pos = lt ? lt.pos : (() => { const f = ev.frame(c, L, t, true); return [f[12], f[13], f[14]]; })();
    const p = proj3(cm, pos); if (!p) return; const sel = App.sel.layers.includes(L.id);
    ctx.save(); ctx.strokeStyle = sel ? COL.sel : COL.light; ctx.fillStyle = '#0006'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.moveTo(p.x + Math.cos(a) * 11, p.y + Math.sin(a) * 11); ctx.lineTo(p.x + Math.cos(a) * 15, p.y + Math.sin(a) * 15); } ctx.stroke();
    if (lt && (lt.type === 'dir' || sel)) { const tg = proj3(cm, lt.target); if (tg) { ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tg.x, tg.y); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(tg.x - 5, tg.y); ctx.lineTo(tg.x + 5, tg.y); ctx.moveTo(tg.x, tg.y - 5); ctx.lineTo(tg.x, tg.y + 5); ctx.stroke(); } }
    if (sel) drawGizmo(ctx, L, cm, pos);
    ctx.restore();
  }
  function drawCamera(ctx, L, cm) {
    const c = App.comp, ev = App.ev, t = App.time; const cd = ev.cameraData(c, t); const isActive = cd.layer === L; const dd = { pos: null }; const pf = ev.parentFrame(c, L, t, true); const p0 = ev.value(c, L, 'transform.position', t); const pos = M.pt(pf, [p0[0], p0[1], p0[2] || 0]); const tg0 = ev.value(c, L, 'cam.target', t); const tg = M.pt(pf, [tg0[0], tg0[1], tg0[2] || 0]);
    // 活动摄像机本身是视点：仅显示目标点；其他摄像机显示图标
    const sel = App.sel.layers.includes(L.id); const pT = proj3(cm, tg);
    ctx.save(); ctx.strokeStyle = sel ? COL.sel : COL.cam; ctx.lineWidth = 1.5;
    if (!isActive || sel) { const p = proj3(cm, pos); if (p) { ctx.fillStyle = '#0006'; ctx.beginPath(); ctx.rect(p.x - 9, p.y - 6, 18, 12); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p.x + 9, p.y - 3); ctx.lineTo(p.x + 15, p.y - 6); ctx.lineTo(p.x + 15, p.y + 6); ctx.lineTo(p.x + 9, p.y + 3); ctx.stroke(); if (pT) { ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(pT.x, pT.y); ctx.stroke(); ctx.setLineDash([]); } } }
    if (pT && sel) { ctx.beginPath(); ctx.arc(pT.x, pT.y, 7, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(pT.x - 10, pT.y); ctx.lineTo(pT.x + 10, pT.y); ctx.moveTo(pT.x, pT.y - 10); ctx.lineTo(pT.x, pT.y + 10); ctx.stroke(); }
    if (sel) drawGizmo(ctx, L, cm, pos);
    ctx.restore();
  }
  const GL = 70; // 轴长（屏幕像素）
  const gizmoAxes = (cm, origin) => { const o = proj3(cm, origin); if (!o) return null; const res = []; for (let a = 0; a < 3; a++) { const d = [0, 0, 0]; d[a] = 1; const q = proj3(cm, [origin[0] + d[0] * 100, origin[1] + d[1] * 100, origin[2] + d[2] * 100]); if (!q) { res.push(null); continue; } let dx = q.x - o.x, dy = q.y - o.y; const l = Math.hypot(dx, dy) || 1; res.push({ dx: dx / l, dy: dy / l, ppu: l / 100, end: { x: o.x + dx / l * GL, y: o.y + dy / l * GL } }); } return { o, axes: res }; };
  function drawGizmo(ctx, L, cm, origin) {
    const L0 = L; if (!L0.is3D) return; const g = gizmoAxes(cm, origin); if (!g) return; ctx.save(); ctx.lineWidth = 2;
    g.axes.forEach((a, i) => { if (!a) return; ctx.strokeStyle = ctx.fillStyle = COL.gizmo[i]; ctx.beginPath(); ctx.moveTo(g.o.x, g.o.y); ctx.lineTo(a.end.x, a.end.y); ctx.stroke(); ctx.beginPath(); const ang = Math.atan2(a.dy, a.dx); ctx.moveTo(a.end.x + Math.cos(ang) * 9, a.end.y + Math.sin(ang) * 9); ctx.lineTo(a.end.x + Math.cos(ang + 2.5) * 6, a.end.y + Math.sin(ang + 2.5) * 6); ctx.lineTo(a.end.x + Math.cos(ang - 2.5) * 6, a.end.y + Math.sin(ang - 2.5) * 6); ctx.closePath(); ctx.fill(); ctx.font = '11px sans-serif'; ctx.fillText('XYZ'[i], a.end.x + a.dx * 14 - 3, a.end.y + a.dy * 14 + 4); });
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(g.o.x, g.o.y, 3.5, 0, 7); ctx.fill(); ctx.restore();
  }
  // 选择框与手柄信息（供绘制与命中共用）
  function selInfo(L, cm) {
    const c = App.comp, ev = App.ev, t = App.time; const b = layerBounds(L); const wm = ev.worldMatrix(c, L, t);
    const info = { L, corners: null, handles: [], anchor: null };
    const a = ev.value(c, L, 'transform.anchor', t);
    const ap = L.is3D ? proj3(cm, M.pt(wm, a)) : (() => { const q = M.pt(wm, a); const s = toScreen(q[0], q[1]); return { x: s[0], y: s[1] }; })();
    info.anchor = ap;
    if (!b) return info;
    const is3 = L.is3D && L.type === 'geo' && b.length === 6; let corners;
    if (is3) { corners = []; for (let i = 0; i < 8; i++) corners.push(proj3(cm, M.pt(wm, [i & 1 ? b[2] : b[0], i & 2 ? b[3] : b[1], i & 4 ? b[5] : b[4]]))); info.box3 = corners; return info; }
    const loc = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]; corners = loc.map(p => { const q = M.pt(wm, [p[0], p[1], 0]); if (L.is3D) return proj3(cm, q); const s = toScreen(q[0], q[1]); return { x: s[0], y: s[1] }; });
    info.corners = corners; info.loc = loc;
    if (corners.every(Boolean)) {
      const mid = (i, j) => ({ x: (corners[i].x + corners[j].x) / 2, y: (corners[i].y + corners[j].y) / 2 });
      info.handles = [{ k: 'c0', p: corners[0], sx: -1, sy: -1 }, { k: 'c1', p: corners[1], sx: 1, sy: -1 }, { k: 'c2', p: corners[2], sx: 1, sy: 1 }, { k: 'c3', p: corners[3], sx: -1, sy: 1 }, { k: 'e0', p: mid(0, 1), sx: 0, sy: -1 }, { k: 'e1', p: mid(1, 2), sx: 1, sy: 0 }, { k: 'e2', p: mid(2, 3), sx: 0, sy: 1 }, { k: 'e3', p: mid(3, 0), sx: -1, sy: 0 }];
      const m0 = mid(0, 1); const dx = m0.x - (corners[3].x + corners[2].x) / 2, dy = m0.y - (corners[3].y + corners[2].y) / 2; const l = Math.hypot(dx, dy) || 1; info.handles.push({ k: 'rot', p: { x: m0.x + dx / l * 24, y: m0.y + dy / l * 24 } });
    }
    return info;
  }
  function drawSelection(ctx, L, cm, primary) {
    const info = selInfo(L, cm); ctx.save(); ctx.strokeStyle = COL.sel; ctx.lineWidth = primary ? 1.5 : 1;
    if (info.corners && info.corners.every(Boolean)) { ctx.beginPath(); info.corners.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke(); }
    else if (info.box3 && info.box3.every(Boolean)) { const b = info.box3; ctx.beginPath(); for (const [i, j] of [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) { ctx.moveTo(b[i].x, b[i].y); ctx.lineTo(b[j].x, b[j].y); } ctx.stroke(); }
    if (primary && info.corners && !L.is3D || (primary && info.corners && L.type !== 'geo')) {
      ctx.fillStyle = '#16181d'; for (const hd of info.handles) { if (hd.k === 'rot') { const m = info.handles[4].p; ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(hd.p.x, hd.p.y); ctx.stroke(); ctx.beginPath(); ctx.arc(hd.p.x, hd.p.y, 4.5, 0, 7); ctx.fill(); ctx.stroke(); } else { ctx.fillRect(hd.p.x - 4, hd.p.y - 4, 8, 8); ctx.strokeRect(hd.p.x - 4, hd.p.y - 4, 8, 8); } }
    }
    if (info.anchor) { const a = info.anchor; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(a.x, a.y, 5, 0, 7); ctx.moveTo(a.x - 9, a.y); ctx.lineTo(a.x + 9, a.y); ctx.moveTo(a.x, a.y - 9); ctx.lineTo(a.x, a.y + 9); ctx.stroke(); }
    if (primary && L.is3D) drawGizmo(ctx, L, cm, wpos(L));
    ctx.restore();
  }
  function motionPts(L) { // 位置关键帧在“父级当前框架”下的屏幕点
    const p = L.props['transform.position']; if (!p || !p.k || p.k.length < 1) return null; const c = App.comp, ev = App.ev, t = App.time; const pf = ev.parentFrame(c, L, t, L.is3D);
    return { keys: p.k, pf };
  }
  function drawMotionPath(ctx, L, cm) {
    const mp = motionPts(L); if (!mp || mp.keys.length < 1) return; const k = mp.keys; const pf = mp.pf; ctx.save(); ctx.lineWidth = 1.5; ctx.strokeStyle = COL.path;
    const sp = (v) => { const q = M.pt(pf, [v[0], v[1], v[2] || 0]); return L.is3D ? proj3(App.ev && camInfo(), q) : (() => { const s = toScreen(q[0], q[1]); return { x: s[0], y: s[1] }; })(); };
    const cmi = camInfo(); const S = (v) => { const q = M.pt(pf, [v[0], v[1], v[2] || 0]); if (L.is3D) return proj3(cmi, q); const s = toScreen(q[0], q[1]); return { x: s[0], y: s[1] }; };
    ctx.beginPath(); let started = false;
    for (let i = 0; i < k.length - 1; i++) {
      const a = k[i], b = k[i + 1]; for (let s = 0; s <= 24; s++) { const v = Model.spatialAt(a, b, s / 24); const q = S(v); if (!q) continue; if (!started) { ctx.moveTo(q.x, q.y); started = true; } else ctx.lineTo(q.x, q.y); }
    }
    ctx.stroke();
    k.forEach((key, i) => {
      const q = S(key.v); if (!q) return; const sel = App.sel.keys.some(s => s.layer === L.id && s.key === 'transform.position' && Math.abs(s.t - key.t) < 1e-4);
      ctx.fillStyle = sel ? COL.sel : '#16181d'; ctx.strokeStyle = sel ? '#fff' : COL.path; ctx.fillRect(q.x - 4, q.y - 4, 8, 8); ctx.strokeRect(q.x - 4, q.y - 4, 8, 8);
      if (key.sm !== 'lin' && (key.sm === 'bez' || sel)) for (const [tn, nm] of [[key.si, 'si'], [key.so, 'so']]) { if (!tn || !tn.some(x => x)) continue; const hp = S([key.v[0] + tn[0], key.v[1] + tn[1], (key.v[2] || 0) + (tn[2] || 0)]); if (!hp) continue; ctx.strokeStyle = '#3fc7d8aa'; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(hp.x, hp.y); ctx.stroke(); ctx.fillStyle = COL.path; ctx.beginPath(); ctx.arc(hp.x, hp.y, 3.5, 0, 7); ctx.fill(); }
    });
    ctx.restore();
  }
  // ----- 路径编辑叠加 -----
  const editTarget = () => {
    const it = App.sel.item; if (!it || it.type !== 'path') return null; const L = App.layer(it.layer); if (!L || !L.props[it.key]) return null; const info = Model.propInfo(L, it.key);
    const shape = Model.evalKeys(L.props[it.key], App.time, info); return { L, key: it.key, shape, info };
  };
  const pathToScreen = (L, p, cm) => { const wm = App.ev.worldMatrix(App.comp, L, App.time); const q = M.pt(wm, [p[0], p[1], 0]); if (L.is3D) return proj3(cm, q); const s = toScreen(q[0], q[1]); return { x: s[0], y: s[1] }; };
  function drawPathEdit(ctx, cm) {
    const et = editTarget(); if (!et) return; ctx.save(); ctx.lineWidth = 1.5;
    et.shape.contours.forEach((ct, ci) => {
      ctx.strokeStyle = COL.path; ctx.beginPath(); const n = ct.v.length;
      const poly = G.flattenContour(ct, 1); for (let i = 0; i < poly.length; i += 2) { const q = pathToScreen(et.L, [poly[i], poly[i + 1]], cm); if (!q) continue; i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); } if (ct.closed) ctx.closePath(); ctx.stroke();
      ct.v.forEach((v, vi) => {
        const q = pathToScreen(et.L, v, cm); if (!q) return; const sel = state.selVertex && state.selVertex.ci === ci && state.selVertex.vi === vi;
        if (sel || ct.i[vi][0] || ct.i[vi][1] || ct.o[vi][0] || ct.o[vi][1]) for (const tn of [ct.i[vi], ct.o[vi]]) { if (!tn[0] && !tn[1]) continue; const hp = pathToScreen(et.L, [v[0] + tn[0], v[1] + tn[1]], cm); ctx.strokeStyle = '#3fc7d899'; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(hp.x, hp.y); ctx.stroke(); ctx.fillStyle = COL.path; ctx.beginPath(); ctx.arc(hp.x, hp.y, 3.5, 0, 7); ctx.fill(); }
        ctx.fillStyle = sel ? COL.sel : '#16181d'; ctx.strokeStyle = sel ? '#fff' : COL.path; ctx.fillRect(q.x - 4, q.y - 4, 8, 8); ctx.strokeRect(q.x - 4, q.y - 4, 8, 8);
      });
    });
    ctx.restore();
  }
  // ----- 节点相关叠加（场范围 / 图钉）-----
  const fieldCenter = (n) => { const c = App.comp, ev = App.ev, t = App.time; if (!n.props.pos) return null; let p = ev.value(c, n, 'pos', t); const f = n.data.follow && Model.layer(c, n.data.follow); if (f) { const w = M.pt(ev.worldMatrix(c, f, t), [0, 0, 0]); p = [p[0] + w[0], p[1] + w[1], p[2] + w[2]]; } return p; };
  const pinGeoLayer = (n) => { const c = App.comp; for (const L of c.layers) { if (L.type !== 'geo' || !L.geo.node) continue; const out = Model.node(App.project, L.geo.node); if (out && Nodes.dependsOn(App.project, out, n)) return L; } return null; };
  V.pinGeoLayer = pinGeoLayer; V.fieldCenter = fieldCenter;
  function drawNodeOverlay(ctx, cm) {
    const c = App.comp, ev = App.ev, t = App.time;
    // 所有场节点范围（选中的高亮；其余淡显）
    for (const n of App.project.graph.nodes) {
      if (!n.nodeType.startsWith('field.')) continue; const sel = App.sel.nodes.includes(n.id) || App.sel.node === n.id; if (!sel && !App.opts.fieldsAll) continue;
      const cen = fieldCenter(n); if (!cen) continue; const p = proj3(cm, cen); if (!p) continue; const R = n.props.radius ? ev.value(c, n, 'radius', t) : 0;
      const edge = proj3(cm, [cen[0] + cm.right[0] * (R || 200), cen[1] + cm.right[1] * (R || 200), cen[2] + cm.right[2] * (R || 200)]); const rr = edge ? Math.hypot(edge.x - p.x, edge.y - p.y) : 40;
      ctx.save(); ctx.strokeStyle = COL.field; ctx.fillStyle = COL.field + '18'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); if (R > 0 || n.nodeType === 'field.swirl' || n.nodeType === 'field.falloff') { ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(p.x, p.y, rr * 0.5, 0, 7); ctx.stroke(); } ctx.setLineDash([]); ctx.fillStyle = COL.field; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 7); ctx.fill(); ctx.font = '11px sans-serif'; ctx.fillText(n.name, p.x + 8, p.y - 8); ctx.restore();
    }
    // 图钉
    const sn = App.sel.node && Model.node(App.project, App.sel.node);
    if (sn && sn.nodeType === 'pin') {
      const L = pinGeoLayer(sn) || null; const wm = L ? ev.worldMatrix(c, L, t) : M.id();
      for (const pi of sn.data.pins || []) {
        const off = ev.value(c, sn, `pin.${pi.id}.pos`, t), rot = ev.value(c, sn, `pin.${pi.id}.rot`, t), sc = ev.value(c, sn, `pin.${pi.id}.scale`, t);
        const q = M.pt(wm, [pi.rest[0] + off[0], pi.rest[1] + off[1], 0]); const p = (L && L.is3D) ? proj3(cm, q) : (() => { const s = toScreen(q[0], q[1]); return { x: s[0], y: s[1] }; })(); if (!p) continue;
        const q0 = M.pt(wm, [pi.rest[0], pi.rest[1], 0]); const p0 = (L && L.is3D) ? proj3(cm, q0) : (() => { const s = toScreen(q0[0], q0[1]); return { x: s[0], y: s[1] }; })();
        ctx.save(); ctx.strokeStyle = COL.pin; ctx.fillStyle = COL.pin; ctx.lineWidth = 1.5; if (p0 && (off[0] || off[1])) { ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(p0.x, p0.y, 3, 0, 7); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 7); ctx.fillStyle = state.selPin === pi.id ? COL.sel : '#16181d'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 7); ctx.fillStyle = COL.pin; ctx.fill();
        const a = rot * U.DEG; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.sin(a) * 16 * Math.max(0.4, sc / 100), p.y - Math.cos(a) * 16 * Math.max(0.4, sc / 100)); ctx.stroke(); ctx.restore();
      }
    }
  }
  function drawToolPreview(ctx) {
    ctx.save(); ctx.strokeStyle = COL.sel; ctx.lineWidth = 1.5;
    if (state.rectDrag) { const d = state.rectDrag; const x0 = Math.min(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), x1 = Math.max(d.x0, d.x1), y1 = Math.max(d.y0, d.y1); ctx.setLineDash([5, 3]); if (d.kind === 'ellipse') { ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, 0, 0, 7); ctx.stroke(); } else ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); }
    if (state.pen && state.pen.pts.length) {
      const pts = state.pen.pts; ctx.strokeStyle = COL.path; ctx.beginPath();
      const S = p => toScreen(p[0], p[1]);
      for (let i = 0; i < pts.length; i++) { const a = pts[i], s0 = S(a.p); if (i === 0) ctx.moveTo(s0[0], s0[1]); else { const pr = pts[i - 1]; const c1 = S([pr.p[0] + pr.o[0], pr.p[1] + pr.o[1]]), c2 = S([a.p[0] + a.i[0], a.p[1] + a.i[1]]); ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], s0[0], s0[1]); } }
      if (state.mouse && !state.pen.drag) { const m = state.mouse; const last = pts[pts.length - 1]; const c1 = S([last.p[0] + last.o[0], last.p[1] + last.o[1]]); const mc = toComp(m[0], m[1]); const e = S(mc); ctx.setLineDash([3, 3]); ctx.bezierCurveTo(c1[0], c1[1], e[0], e[1], e[0], e[1]); }
      ctx.stroke(); ctx.setLineDash([]);
      pts.forEach((a, i) => { const s = S(a.p); ctx.fillStyle = i === 0 ? COL.sel : '#16181d'; ctx.strokeStyle = COL.path; ctx.fillRect(s[0] - 4, s[1] - 4, 8, 8); ctx.strokeRect(s[0] - 4, s[1] - 4, 8, 8); });
    }
    ctx.restore();
  }

  // ===== 命中测试 =====
  const hitRecords = (L, lx, ly, scalePx) => {
    const c = App.comp, ev = App.ev, t = App.time; let draws = [];
    if (L.type === 'shape') draws = Shapes.evalShapeLayer(ev, c, L, t, 0.5); else if (L.type === 'text') draws = Shapes.evalTextLayer(ev, c, L, t);
    for (let i = draws.length - 1; i >= 0; i--) {
      const d = draws[i]; const inv = A2.inv(d.mat); const q = A2.pt(inv, lx, ly);
      if (d.kind === 'fill') { for (const sh of d.shapes) { const polys = sh.polys.filter(p => p.closed).map(p => p.pts); if (polys.length && G.insidePolys(q[0], q[1], polys, d.rule === 'evenodd')) return true; } }
      else { const tol = (d.width / 2) + 3 / scalePx; for (const sh of d.shapes) for (const p of sh.polys) if (G.distToPoly(q[0], q[1], p.pts, p.closed) <= tol) return true; }
    }
    return false;
  };
  const hit2D = (L, cx, cy, scalePx) => {
    const c = App.comp, ev = App.ev, t = App.time; const wm = ev.worldMatrix(c, L, t); const inv = M.invert(wm); const p = M.pt(inv, [cx, cy, 0]);
    if (L.type === 'shape' || L.type === 'text') return hitRecords(L, p[0], p[1], scalePx);
    if (L.type === 'precomp') { const ic = Model.comp(App.project, L.comp); return ic && p[0] >= 0 && p[1] >= 0 && p[0] <= ic.w && p[1] <= ic.h; }
    if (L.type === 'null') return Math.abs(p[0]) < 40 && Math.abs(p[1]) < 40;
    return false;
  };
  V.pick = (sx, sy, opts = {}) => {
    const c = App.comp, ev = App.ev, t = App.time; const r = layout(); const cm = camInfo(); const [cx, cy] = toComp(sx, sy);
    // 灯光/摄像机图标
    for (const L of c.layers) {
      if (L.type === 'light' || L.type === 'camera') { const pf = ev.parentFrame(c, L, t, true); const p0 = ev.value(c, L, 'transform.position', t); const p = proj3(cm, M.pt(pf, [p0[0], p0[1], p0[2] || 0])); if (p && Math.hypot(p.x - sx, p.y - sy) < 14 && (L.type === 'light' || cm.cam.layer !== L || App.sel.layers.includes(L.id))) return { layer: L, kind: 'icon' }; }
    }
    let best2 = null; const layers = c.layers; let best3 = null;
    for (let i = 0; i < layers.length; i++) {
      const L = layers[i]; if (!ev.active(L, t) || L.locked || !L.visible) continue;
      if (L.is3D && ['shape', 'text', 'precomp', 'geo', 'null'].includes(L.type)) {
        const ray = rayAt(cm, sx, sy); const wm = ev.worldMatrix(c, L, t); const inv = M.invert(wm); const o = M.pt(inv, ray.o), d = M.dir(inv, ray.d); let tt = -1;
        if (L.type === 'geo') { const go = Nodes.geoOut(ev, c, t, L); const m = go && Nodes.displayMesh(go); if (m && L.geo.pick !== false) tt = AE.Mesh.raycast(m, o, d); }
        else { if (Math.abs(d[2]) > 1e-9) { const tp = -o[2] / d[2]; if (tp > 0) { const lx = o[0] + d[0] * tp, ly = o[1] + d[1] * tp; if (L.type === 'null' ? Math.abs(lx) < 40 && Math.abs(ly) < 40 : (L.type === 'precomp' ? (() => { const ic = Model.comp(App.project, L.comp); return ic && lx >= 0 && ly >= 0 && lx <= ic.w && ly <= ic.h; })() : hitRecords(L, lx, ly, 1))) tt = tp; } } }
        if (tt > 0) { const wp = M.pt(wm, [o[0] + d[0] * tt, o[1] + d[1] * tt, o[2] + d[2] * tt]); const dist = U.V.dot(U.V.sub(wp, ray.o), cm.fwd); if (!best3 || dist < best3.dist) best3 = { layer: L, dist, idx: i }; }
      } else if (!L.is3D && hit2D(L, cx, cy, r.s)) { if (!best2) best2 = { layer: L, idx: i }; }
    }
    if (best2 && (!best3 || best2.idx < best3.idx)) return { layer: best2.layer, kind: '2d' };
    if (best3) return { layer: best3.layer, kind: '3d' };
    return best2 ? { layer: best2.layer, kind: '2d' } : null;
  };

  // ===== 交互 =====
  const hitHandle = (sx, sy) => {
    const L = App.primary(); if (!L) return null; const cm = camInfo();
    const info = selInfo(L, cm);
    if (info.anchor && Math.hypot(info.anchor.x - sx, info.anchor.y - sy) < 8 && !(L.type === 'camera' || L.type === 'light')) return { k: 'anchor', L, info };
    if (L.is3D) { const gz = gizmoAxes(cm, wpos(L)); if (gz) for (let a = 0; a < 3; a++) { const ax = gz.axes[a]; if (!ax) continue; const d = distSeg(sx, sy, gz.o.x, gz.o.y, ax.end.x, ax.end.y); if (d < 7) return { k: 'axis', axis: a, L, ax, gz }; } }
    if (!L.is3D || L.type !== 'geo') for (const hd of info.handles) if (Math.abs(hd.p.x - sx) < 7 && Math.abs(hd.p.y - sy) < 7) return { k: hd.k, hd, L, info };
    return null;
  };
  const distSeg = (px, py, x0, y0, x1, y1) => G.distToSeg(px, py, x0, y0, x1, y1);
  const hitLightCamTarget = (sx, sy) => {
    const c = App.comp, ev = App.ev, t = App.time; const cm = camInfo();
    for (const L of App.selLayers()) {
      if (L.type === 'camera') { const pf = ev.parentFrame(c, L, t, true); const tg0 = ev.value(c, L, 'cam.target', t); const p = proj3(cm, M.pt(pf, [tg0[0], tg0[1], tg0[2] || 0])); if (p && Math.hypot(p.x - sx, p.y - sy) < 10) return { L, key: 'cam.target', pf }; }
      if (L.type === 'light') { const pf = ev.parentFrame(c, L, t, true); const tg0 = ev.value(c, L, 'light.target', t); const p = proj3(cm, M.pt(pf, [tg0[0], tg0[1], tg0[2] || 0])); if (p && Math.hypot(p.x - sx, p.y - sy) < 10) return { L, key: 'light.target', pf }; }
    }
    return null;
  };
  const hitMotionKey = (sx, sy) => {
    const L = App.primary(); if (!L || !App.opts.motionPaths) return null; const mp = motionPts(L); if (!mp) return null; const cm = camInfo();
    const S = (v) => { const q = M.pt(mp.pf, [v[0], v[1], v[2] || 0]); if (L.is3D) return proj3(cm, q); const s = toScreen(q[0], q[1]); return { x: s[0], y: s[1] }; };
    for (const key of mp.keys) {
      const q = S(key.v); if (q && Math.abs(q.x - sx) < 6 && Math.abs(q.y - sy) < 6) return { L, key, kind: 'key', pf: mp.pf };
      if (key.sm !== 'lin') for (const nm of ['si', 'so']) { const tn = key[nm]; if (!tn || !tn.some(x => x)) continue; const hp = S([key.v[0] + tn[0], key.v[1] + tn[1], (key.v[2] || 0) + (tn[2] || 0)]); if (hp && Math.hypot(hp.x - sx, hp.y - sy) < 6) return { L, key, kind: nm, pf: mp.pf }; }
    }
    return null;
  };
  const hitVertex = (sx, sy) => {
    const et = editTarget(); if (!et) return null; const cm = camInfo();
    for (let ci = 0; ci < et.shape.contours.length; ci++) { const ct = et.shape.contours[ci]; for (let vi = 0; vi < ct.v.length; vi++) {
      const q = pathToScreen(et.L, ct.v[vi], cm); if (!q) continue;
      const sel = state.selVertex && state.selVertex.ci === ci && state.selVertex.vi === vi;
      for (const [nm, tn] of [['i', ct.i[vi]], ['o', ct.o[vi]]]) { if (!tn[0] && !tn[1]) continue; if (!sel && !(ct.i[vi][0] || ct.i[vi][1] || ct.o[vi][0] || ct.o[vi][1])) continue; const hp = pathToScreen(et.L, [ct.v[vi][0] + tn[0], ct.v[vi][1] + tn[1]], cm); if (hp && Math.hypot(hp.x - sx, hp.y - sy) < 6) return { et, ci, vi, kind: nm }; }
      if (Math.abs(q.x - sx) < 6 && Math.abs(q.y - sy) < 6) return { et, ci, vi, kind: 'v' };
    } }
    return null;
  };
  const hitSegment = (sx, sy) => { const et = editTarget(); if (!et) return null; const cm = camInfo(); let best = null; et.shape.contours.forEach((ct, ci) => { const n = ct.v.length; const segs = ct.closed ? n : n - 1; for (let vi = 0; vi < segs; vi++) { const a = ct.v[vi], b = ct.v[(vi + 1) % n], o = ct.o[vi], i2 = ct.i[(vi + 1) % n]; for (let s = 0; s < 20; s++) { const t0 = s / 20, t1 = (s + 1) / 20; const p0 = pathToScreen(et.L, [U.cubic(a[0], a[0] + o[0], b[0] + i2[0], b[0], t0), U.cubic(a[1], a[1] + o[1], b[1] + i2[1], b[1], t0)], cm), p1 = pathToScreen(et.L, [U.cubic(a[0], a[0] + o[0], b[0] + i2[0], b[0], t1), U.cubic(a[1], a[1] + o[1], b[1] + i2[1], b[1], t1)], cm); if (!p0 || !p1) continue; const d = distSeg(sx, sy, p0.x, p0.y, p1.x, p1.y); if (d < 6 && (!best || d < best.d)) best = { d, et, ci, vi, t: (t0 + t1) / 2 }; } } }); return best; };
  const hitPin = (sx, sy) => {
    const sn = App.sel.node && Model.node(App.project, App.sel.node); if (!sn || sn.nodeType !== 'pin') return null; const c = App.comp, ev = App.ev, t = App.time; const L = pinGeoLayer(sn); const wm = L ? ev.worldMatrix(c, L, t) : M.id(); const cm = camInfo();
    for (const pi of (sn.data.pins || [])) { const off = ev.value(c, sn, `pin.${pi.id}.pos`, t); const q = M.pt(wm, [pi.rest[0] + off[0], pi.rest[1] + off[1], 0]); const p = (L && L.is3D) ? proj3(cm, q) : (() => { const s = toScreen(q[0], q[1]); return { x: s[0], y: s[1] }; })(); if (p && Math.hypot(p.x - sx, p.y - sy) < 9) return { sn, pi, L }; }
    return null;
  };
  const hitField = (sx, sy) => {
    const cm = camInfo(); for (const n of App.project.graph.nodes) { if (!n.nodeType.startsWith('field.')) continue; if (!(App.sel.nodes.includes(n.id) || App.sel.node === n.id)) continue; const cen = fieldCenter(n); const p = cen && proj3(cm, cen); if (p && Math.hypot(p.x - sx, p.y - sy) < 9) return { n }; } return null;
  };

  function bindEvents() {
    wrap.addEventListener('contextmenu', e => { e.preventDefault(); const r = wrap.getBoundingClientRect(); const hit = V.pick(e.clientX - r.left, e.clientY - r.top); if (hit && !App.sel.layers.includes(hit.layer.id)) App.select([hit.layer.id]); const p = App.primary(); const items = [{ label: '全部适合窗口', fn: () => { App.view.zoom = 0; App.requestRender(); } }]; if (p) items.unshift({ label: '复制图层', fn: () => AE.Actions.duplicate() }, { label: '预合成…', fn: () => AE.Actions.precompose() }, ...(p.type === 'shape' || p.type === 'text' ? [{ label: '转为三维实体（挤出）', fn: () => AE.Actions.toSolid(p) }] : []), { label: '删除图层', fn: () => AE.Actions.remove() }, { sep: true }); UI.menu(items, e.clientX, e.clientY); });
    wrap.addEventListener('wheel', e => {
      e.preventDefault(); const r = wrap.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (App.tool === 'orbit') { dollyCamera(e.deltaY > 0 ? 1.08 : 1 / 1.08); return; }
      const lay = layout(); const [cx, cy] = [(sx - lay.ox) / lay.s, (sy - lay.oy) / lay.s]; const ns = U.clamp(lay.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.05, 8);
      App.view.zoom = ns; const c = App.comp; App.view.px = sx - cx * ns - (W - c.w * ns) / 2; App.view.py = sy - cy * ns - (H - c.h * ns) / 2; const el = document.getElementById('zoomSel'); if (el) el.value = '0'; App.requestRender();
    }, { passive: false });
    wrap.addEventListener('pointermove', e => { const r = wrap.getBoundingClientRect(); state.mouse = [e.clientX - r.left, e.clientY - r.top]; if (state.pen) App.requestRender(); if (!drag) updateCursor(e); });
    wrap.addEventListener('pointerdown', onDown); wrap.addEventListener('pointermove', onMove); wrap.addEventListener('pointerup', onUp); wrap.addEventListener('pointercancel', onUp);
    wrap.addEventListener('dblclick', e => { if (state.pen) { V.finishPen(); return; } const r = wrap.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top; const hv = hitVertex(sx, sy); if (hv && hv.kind === 'v') { toggleSmooth(hv); return; } const hit = V.pick(sx, sy); if (hit && hit.layer.type === 'text') { App.select([hit.layer.id]); App.emit('focusText'); } });
    window.addEventListener('keydown', e => { if (e.key === ' ' && !(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) state.space = true; if (e.key === 'Enter' && state.pen && !(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) V.finishPen(); });
    window.addEventListener('keyup', e => { if (e.key === ' ') state.space = false; });
  }
  const updateCursor = (e) => {
    if (App.tool !== 'select') return; const r = wrap.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const hd = hitHandle(sx, sy); let cur = 'default'; if (hd) cur = hd.k === 'rot' ? 'crosshair' : hd.k === 'anchor' ? 'move' : hd.k === 'axis' ? 'pointer' : 'nwse-resize'; else if (hitVertex(sx, sy) || hitMotionKey(sx, sy) || hitPin(sx, sy) || hitField(sx, sy)) cur = 'pointer'; wrap.style.cursor = cur;
  };
  const toggleSmooth = (hv) => { const { et, ci, vi } = hv; const sh = U.clone(et.shape); const ct = sh.contours[ci]; const smooth = ct.i[vi][0] || ct.i[vi][1] || ct.o[vi][0] || ct.o[vi][1]; if (smooth) { ct.i[vi] = [0, 0]; ct.o[vi] = [0, 0]; } else { const n = ct.v.length; const a = ct.v[(vi + n - 1) % n], b = ct.v[(vi + 1) % n], v = ct.v[vi]; let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; const k = Math.min(Math.hypot(v[0] - a[0], v[1] - a[1]), Math.hypot(b[0] - v[0], b[1] - v[1])) / 3; ct.o[vi] = [dx / l * k, dy / l * k]; ct.i[vi] = [-dx / l * k, -dy / l * k]; } writePath(et, sh); App.commit('切换平滑/尖角'); };
  const writePath = (et, shape) => { Model.setPropAt(et.L, et.key, App.time, shape, { fps: App.comp.fps }); App.changed('values'); };
  V.deleteVertex = () => { const sv = state.selVertex; const et = editTarget(); if (!sv || !et) return false; const sh = U.clone(et.shape); const ct = sh.contours[sv.ci]; if (!ct || ct.v.length <= 2) return false; ct.v.splice(sv.vi, 1); ct.i.splice(sv.vi, 1); ct.o.splice(sv.vi, 1); state.selVertex = null; writePath(et, sh); App.commit('删除顶点'); return true; };

  // ----- 鼠标按下 -----
  function onDown(e) {
    if (e.target.closest && e.target.closest('.vtoolbar, .vfoot')) return;
    const r = wrap.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top; wrap.setPointerCapture(e.pointerId); const c = App.comp;
    const tool = App.tool;
    if (e.button === 1 || tool === 'hand' || state.space) { drag = { kind: 'pan', sx, sy, px: App.view.px, py: App.view.py, z: App.view.zoom || layout().s }; if (!App.view.zoom) { App.view.zoom = layout().s; App.view.px = 0; App.view.py = 0; drag.px = 0; drag.py = 0; } return; }
    if (e.button !== 0) return;
    if (tool === 'zoom') { const lay = layout(); const f = e.altKey ? 1 / 1.5 : 1.5; const [cx, cy] = [(sx - lay.ox) / lay.s, (sy - lay.oy) / lay.s]; const ns = U.clamp(lay.s * f, 0.05, 8); App.view.zoom = ns; App.view.px = sx - cx * ns - (W - c.w * ns) / 2; App.view.py = sy - cy * ns - (H - c.h * ns) / 2; App.requestRender(); return; }
    if (tool === 'rect' || tool === 'ellipse') { state.rectDrag = { kind: tool, x0: sx, y0: sy, x1: sx, y1: sy }; drag = { kind: 'shape' }; return; }
    if (tool === 'pen') { penDown(sx, sy, e); return; }
    if (tool === 'text') { const [cx, cy] = toComp(sx, sy); const L = AE.Actions.newLayer('text', { text: '文字' }); L.props['transform.position'].v = [cx, cy, 0]; App.commit('创建文字'); App.emit('focusText'); V.setTool('select'); App.changed('struct'); return; }
    if (tool === 'orbit') { ensureCamera(); drag = { kind: 'orbit', sx, sy, pan: e.shiftKey || e.button === 2 }; beginCamDrag(); return; }
    if (tool === 'pin') { const sn = App.sel.node && Model.node(App.project, App.sel.node); if (!sn || sn.nodeType !== 'pin') { App.toast('请先在节点编辑器中选中「图钉变形」节点'); return; } const hp = hitPin(sx, sy); if (hp) { startPinDrag(hp, sx, sy); return; } const L = pinGeoLayer(sn); const lp = L && localOnPlane(L, sx, sy); if (lp) { Nodes.addPin(sn, lp); App.changed('struct'); App.commit('添加图钉'); } else App.toast('找不到使用该节点的三维几何图层'); return; }
    // ---- 选择工具 ----
    const hv = hitVertex(sx, sy);
    if (hv) { state.selVertex = { ci: hv.ci, vi: hv.vi }; drag = { kind: 'vertex', hv, startShape: U.clone(hv.et.shape), s0: [sx, sy], moved: false, alt: e.altKey }; App.requestRender(); return; }
    if (editTarget() && e.ctrlKey) { const sg = hitSegment(sx, sy); if (sg) { insertVertex(sg); return; } }
    const hp = hitPin(sx, sy); if (hp) { startPinDrag(hp, sx, sy); return; }
    const hf = hitField(sx, sy); if (hf) { drag = { kind: 'field', n: hf.n, s0: [sx, sy], p0: App.ev.value(c, hf.n, 'pos', App.time).slice() }; return; }
    const hk = hitMotionKey(sx, sy); if (hk) { startMotionDrag(hk, sx, sy, e); return; }
    const ht = hitLightCamTarget(sx, sy); if (ht) { drag = { kind: 'target', ...ht, s0: [sx, sy], v0: App.ev.value(c, ht.L, ht.key, App.time).slice() }; return; }
    const hd = hitHandle(sx, sy);
    if (hd) { startHandleDrag(hd, sx, sy, e); return; }
    const hit = V.pick(sx, sy);
    if (hit) {
      const L = hit.layer; if (e.shiftKey) App.select([L.id], true); else if (!App.sel.layers.includes(L.id)) App.select([L.id]);
      state.selVertex = null; startMove(sx, sy, e);
    } else { if (!e.shiftKey) { App.select([]); App.sel.item = null; state.selVertex = null; App.emit('select'); } drag = { kind: 'marquee', sx, sy }; }
  }
  // ----- 移动 -----
  function startMove(sx, sy, e) {
    const c = App.comp, ev = App.ev, t = App.time; const layers = App.selLayers().filter(l => !l.locked && l.props['transform.position'] && !Model.hasExpr(l.props['transform.position']));
    if (!layers.length) return; const cm = camInfo();
    drag = { kind: 'move', s0: [sx, sy], moved: false, items: layers.map(L => { const pf = ev.parentFrame(c, L, t, L.is3D); return { L, p0: ev.value(c, L, 'transform.position', t).slice(), inv: M.invert(pf), pf }; }), cm };
  }
  function startHandleDrag(hd, sx, sy, e) {
    const c = App.comp, ev = App.ev, t = App.time; const L = hd.L; const [cx, cy] = toComp(sx, sy);
    const a = ev.value(c, L, 'transform.anchor', t), pos = ev.value(c, L, 'transform.position', t), sc = ev.value(c, L, 'transform.scale', t), rot = ev.value(c, L, 'transform.rotation', t);
    if (hd.k === 'anchor') { const m = ev.worldMatrix(c, L, t); drag = { kind: 'anchor', L, a0: a.slice(), pos0: pos.slice(), wm: m, own: ev.ownFrame(c, L, t, L.is3D), pf: ev.parentFrame(c, L, t, L.is3D), moved: false }; return; }
    if (hd.k === 'axis') { const gz = hd.gz; drag = { kind: 'axis', L, axis: hd.axis, ax: hd.ax, s0: [sx, sy], p0: pos.slice(), pf: ev.parentFrame(c, L, t, L.is3D), moved: false }; return; }
    const aw = M.pt(ev.worldMatrix(c, L, t), a); const awp = L.is3D ? proj3(camInfo(), aw) : { x: toScreen(aw[0], aw[1])[0], y: toScreen(aw[0], aw[1])[1] };
    if (hd.k === 'rot') { drag = { kind: 'rot', L, aw: awp, a0: Math.atan2(sy - awp.y, sx - awp.x), r0: rot, moved: false }; return; }
    const hdl = hd.hd; drag = { kind: 'scale', L, aw: awp, sc0: sc.slice(), d0: [sx - awp.x, sy - awp.y], sx: hdl.sx, sy: hdl.sy, edge: hd.k[0] === 'e', moved: false, info: hd.info };
  }
  function startMotionDrag(hk, sx, sy, e) {
    const key = hk.key; const L = hk.L; App.setKeySel([{ layer: L.id, key: 'transform.position', t: key.t }], e.shiftKey);
    drag = { kind: 'mkey', hk, s0: [sx, sy], v0: key.v.slice(), t0: key.t, pf: hk.pf, inv: M.invert(hk.pf), moved: false, alt: e.altKey, cm: camInfo(), si0: key.si && key.si.slice(), so0: key.so && key.so.slice() };
    if (hk.kind === 'key' && key.sm === 'lin' && e.altKey) { /* Alt 拖动关键帧：转为曲线 */ }
  }
  function startPinDrag(hp, sx, sy) { const c = App.comp, ev = App.ev; const off = ev.value(c, hp.sn, `pin.${hp.pi.id}.pos`, App.time); state.selPin = hp.pi.id; drag = { kind: 'pin', hp, s0: [sx, sy], off0: off.slice(), moved: false }; }
  function insertVertex(sg) {
    const { et, ci, vi, t } = sg; const sh = U.clone(et.shape); const ct = sh.contours[ci]; const n = ct.v.length; const j = (vi + 1) % n;
    const a = ct.v[vi], b = ct.v[j], o = ct.o[vi], ii = ct.i[j];
    const P0 = a, P1 = [a[0] + o[0], a[1] + o[1]], P2 = [b[0] + ii[0], b[1] + ii[1]], P3 = b; const lp = (p, q, s) => [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s];
    const A = lp(P0, P1, t), B = lp(P1, P2, t), C = lp(P2, P3, t), D = lp(A, B, t), E = lp(B, C, t), F = lp(D, E, t);
    ct.o[vi] = [A[0] - P0[0], A[1] - P0[1]]; ct.i[j] = [C[0] - P3[0], C[1] - P3[1]];
    ct.v.splice(vi + 1, 0, F); ct.i.splice(vi + 1, 0, [D[0] - F[0], D[1] - F[1]]); ct.o.splice(vi + 1, 0, [E[0] - F[0], E[1] - F[1]]);
    state.selVertex = { ci, vi: vi + 1 }; writePath(et, sh); App.commit('插入顶点');
  }
  // ----- 摄像机 -----
  function ensureCamera() { const c = App.comp; if (!c.layers.some(l => l.type === 'camera')) { const L = Model.newLayer('camera', c, { name: Model.uniqueName(c, '摄像机 1') }); c.layers.unshift(L); App.sel.layers = [L.id]; App.changed('struct'); App.emit('select'); App.toast('已自动创建摄像机'); } }
  let camDrag0 = null;
  function activeCamLayer() { return App.ev.activeCamera(App.comp, App.time); }
  function beginCamDrag() { const L = activeCamLayer(); if (!L) return; const ev = App.ev, c = App.comp, t = App.time; const pf = ev.parentFrame(c, L, t, true); const cd = ev.cameraData(c, t); camDrag0 = { L, pos: cd.pos.slice(), tg: cd.target.slice(), pf, inv: M.invert(pf) }; }
  function orbitMove(dx, dy, pan) {
    const L = camDrag0 && camDrag0.L; if (!L) return; const c = App.comp; const cm = camInfo();
    let pos = camDrag0.pos.slice(), tg = camDrag0.tg.slice();
    if (pan) { const dist = U.V.len(U.V.sub(pos, tg)); const k = 2 * dist * cm.tanHalf / H; const mv = [-(cm.right[0] * dx + cm.down[0] * dy) * k, -(cm.right[1] * dx + cm.down[1] * dy) * k, -(cm.right[2] * dx + cm.down[2] * dy) * k]; pos = pos.map((v, i) => v + mv[i]); tg = tg.map((v, i) => v + mv[i]); }
    else { const rel = U.V.sub(pos, tg); const r = U.V.len(rel); let az = Math.atan2(rel[0], -rel[2]) - dx * 0.006; let el = Math.asin(U.clamp(-rel[1] / r, -1, 1)) + dy * 0.006; el = U.clamp(el, -1.5, 1.5); pos = [tg[0] + r * Math.cos(el) * Math.sin(az), tg[1] - r * Math.sin(el), tg[2] - r * Math.cos(el) * Math.cos(az)]; }
    const lpos = M.pt(camDrag0.inv, pos), ltg = M.pt(camDrag0.inv, tg);
    Model.setPropAt(L, 'transform.position', App.time, lpos, { fps: c.fps }); Model.setPropAt(L, 'cam.target', App.time, ltg, { fps: c.fps }); App.changed('values');
  }
  function dollyCamera(f) { const L = activeCamLayer(); if (!L) { ensureCamera(); return; } const c = App.comp, ev = App.ev, t = App.time; const cd = ev.cameraData(c, t); const pf = ev.parentFrame(c, L, t, true); const rel = U.V.sub(cd.pos, cd.target); const np = cd.target.map((v, i) => v + rel[i] * f); Model.setPropAt(L, 'transform.position', t, M.pt(M.invert(pf), np), { fps: c.fps }); App.changed('values'); clearTimeout(V._dt); V._dt = setTimeout(() => App.commit('推拉摄像机'), 300); }

  // ----- 钢笔 -----
  function penDown(sx, sy, e) {
    const [cx, cy] = toComp(sx, sy); if (!state.pen) state.pen = { pts: [], drag: false };
    const pen = state.pen; if (pen.pts.length >= 3) { const f = toScreen(pen.pts[0].p[0], pen.pts[0].p[1]); if (Math.hypot(f[0] - sx, f[1] - sy) < 9) { pen.closed = true; V.finishPen(); return; } }
    pen.pts.push({ p: [cx, cy], i: [0, 0], o: [0, 0] }); pen.drag = true; drag = { kind: 'pen' }; App.requestRender();
  }
  V.finishPen = () => {
    const pen = state.pen; state.pen = null; if (!pen || pen.pts.length < 2) { App.requestRender(); return; }
    const closed = !!pen.closed; const pts = pen.pts; const c = App.comp; const p0 = App.primary();
    let L, local = pts;
    const bb = G.polysBBox([pts.flatMap(q => q.p)]); const center = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
    const addTo = p0 && p0.type === 'shape' && !p0.is3D && !p0.locked;
    if (addTo) { const inv = M.invert(App.ev.worldMatrix(c, p0, App.time)); local = pts.map(q => { const v = M.pt(inv, [q.p[0], q.p[1], 0]); const lin = M.dir(inv, [q.i[0], q.i[1], 0]), lo = M.dir(inv, [q.o[0], q.o[1], 0]); return { p: [v[0], v[1]], i: [lin[0], lin[1]], o: [lo[0], lo[1]] }; }); }
    else local = pts.map(q => ({ p: [q.p[0] - center[0], q.p[1] - center[1]], i: q.i, o: q.o }));
    const shape = { contours: [{ closed, v: local.map(q => q.p), i: local.map(q => q.i), o: local.map(q => q.o) }] };
    if (addTo) { L = p0; const g = L.shape.items.find(i => i.type === 'group') || Model.addShapeItem(L, 'group', null, { name: '形状组 1' }); const it = Model.addShapeItem(L, 'path', g, { name: '路径 ' + (g.items.length + 1) }); L.props[`sh.${it.id}.path`].v = shape; if (!g.items.some(i => i.type === 'fill' || i.type === 'stroke')) { Model.addShapeItem(L, closed ? 'fill' : 'stroke', g, { index: g.items.length }); } App.sel.item = { layer: L.id, key: `sh.${it.id}.path`, type: 'path' }; }
    else { L = Model.newLayer('shape', c, { name: Model.uniqueName(c, '形状图层 1') }); L.props['transform.position'].v = [center[0], center[1], 0]; const g = Model.addShapeItem(L, 'group', null, { name: '形状组 1' }); const it = Model.addShapeItem(L, 'path', g, { name: '路径 1' }); L.props[`sh.${it.id}.path`].v = shape; if (closed) Model.addShapeItem(L, 'fill', g, { index: 1 }); const st = Model.addShapeItem(L, 'stroke', g, { index: g.items.length }); if (closed) { L.props[`sh.${st.id}.width`].v = 0; } else { L.props[`sh.${st.id}.width`].v = 8; } c.layers.unshift(L); App.sel.layers = [L.id]; App.sel.item = { layer: L.id, key: `sh.${it.id}.path`, type: 'path' }; }
    App.changed('struct'); App.emit('select'); App.commit('钢笔绘制路径'); V.setTool('select');
  }
  function finishShape(kind, x0, y0, x1, y1, alt) {
    const c = App.comp; if (Math.abs(x1 - x0) < 3 && Math.abs(y1 - y0) < 3) return;
    const [a, b] = [toComp(Math.min(x0, x1), Math.min(y0, y1)), toComp(Math.max(x0, x1), Math.max(y0, y1))]; const w = b[0] - a[0], hh = b[1] - a[1]; const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
    const p = App.primary(); const addTo = p && p.type === 'shape' && !p.is3D && !p.locked && !alt; let L;
    if (addTo) {
      L = p; const g = L.shape.items.find(i => i.type === 'group') || Model.addShapeItem(L, 'group', null, { name: '形状组 1' }); const inv = M.invert(App.ev.worldMatrix(c, L, App.time)); const lc = M.pt(inv, [cx, cy, 0]);
      const it = Model.addShapeItem(L, kind, g, { name: kind === 'rect' ? '矩形路径 ' + (g.items.length + 1) : '椭圆路径 ' + (g.items.length + 1), params: { size: [w, hh], pos: [lc[0], lc[1]] } });
      if (!g.items.some(i => i.type === 'fill')) Model.addShapeItem(L, 'fill', g, { index: g.items.length });
    } else {
      L = Model.newLayer('shape', c, { name: Model.uniqueName(c, kind === 'rect' ? '矩形 1' : '椭圆 1') }); L.props['transform.position'].v = [cx, cy, 0];
      const g = Model.addShapeItem(L, 'group', null, { name: '形状组 1' }); Model.addShapeItem(L, kind, g, { name: kind === 'rect' ? '矩形路径 1' : '椭圆路径 1', params: { size: [w, hh] } }); Model.addShapeItem(L, 'fill', g, { index: 1 }); const st = Model.addShapeItem(L, 'stroke', g, { index: 2 }); L.props[`sh.${st.id}.width`].v = 0;
      c.layers.unshift(L); App.sel.layers = [L.id];
    }
    App.changed('struct'); App.emit('select'); App.commit('绘制' + (kind === 'rect' ? '矩形' : '椭圆'));
  }

  // ----- 鼠标移动 -----
  function onMove(e) {
    if (!drag) return; const r = wrap.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top; const c = App.comp, ev = App.ev, t = App.time;
    if (drag.kind === 'pan') { App.view.zoom = drag.z; App.view.px = drag.px + sx - drag.sx; App.view.py = drag.py + sy - drag.sy; App.requestRender(); return; }
    if (drag.kind === 'shape') { const d = state.rectDrag; d.x1 = sx; d.y1 = sy; if (e.shiftKey) { const s = Math.max(Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0)); d.x1 = d.x0 + Math.sign(d.x1 - d.x0 || 1) * s; d.y1 = d.y0 + Math.sign(d.y1 - d.y0 || 1) * s; } App.requestRender(); return; }
    if (drag.kind === 'pen') { const pen = state.pen; const last = pen.pts[pen.pts.length - 1]; const [cx, cy] = toComp(sx, sy); const dx = cx - last.p[0], dy = cy - last.p[1]; if (Math.hypot(dx, dy) * layout().s > 3) { last.o = [dx, dy]; last.i = [-dx, -dy]; } App.requestRender(); return; }
    if (drag.kind === 'orbit') { orbitMove(sx - drag.sx, sy - drag.sy, drag.pan); return; }
    if (drag.kind === 'move') {
      const dxs = sx - drag.s0[0], dys = sy - drag.s0[1]; if (!drag.moved && Math.hypot(dxs, dys) < 3) return; drag.moved = true;
      for (const it of drag.items) {
        let w;
        if (it.L.is3D) { const cm = drag.cm; const wp = M.pt(it.pf, it.p0); const vz = Math.max(U.V.dot(U.V.sub(wp, cm.pos), cm.fwd), 10); const k = 2 * vz * cm.tanHalf / H * (H / (layout().s * c.h)) * 1; const kk = (2 * vz * cm.tanHalf) / (c.h * layout().s); w = [(cm.right[0] * dxs + cm.down[0] * dys) * kk, (cm.right[1] * dxs + cm.down[1] * dys) * kk, (cm.right[2] * dxs + cm.down[2] * dys) * kk]; if (e.altKey) { w = [0, 0, 0]; } }
        else { const s = layout().s; w = [dxs / s, dys / s, 0]; }
        const d = M.dir(it.inv, w); let np = [it.p0[0] + d[0], it.p0[1] + d[1], it.p0[2] + (it.L.is3D ? d[2] : 0)];
        if (e.shiftKey && !it.L.is3D) { if (Math.abs(dxs) > Math.abs(dys)) np[1] = it.p0[1]; else np[0] = it.p0[0]; }
        Model.setPropAt(it.L, 'transform.position', t, np, { fps: c.fps });
      }
      App.changed('values'); return;
    }
    if (drag.kind === 'axis') {
      const ax = drag.ax; const dxs = sx - drag.s0[0], dys = sy - drag.s0[1]; const proj = dxs * ax.dx + dys * ax.dy; const wd = proj / (ax.ppu || 1); const w = [0, 0, 0]; w[drag.axis] = wd; const d = M.dir(M.invert(drag.pf), w);
      Model.setPropAt(drag.L, 'transform.position', t, drag.p0.map((v, i) => v + d[i]), { fps: c.fps }); App.changed('values'); return;
    }
    if (drag.kind === 'target') { const cm = camInfo(); const wp = M.pt(drag.pf, drag.v0); const vz = Math.max(U.V.dot(U.V.sub(wp, cm.pos), cm.fwd), 10); const kk = (2 * vz * cm.tanHalf) / (c.h * layout().s); const dxs = sx - drag.s0[0], dys = sy - drag.s0[1]; const w = [(cm.right[0] * dxs + cm.down[0] * dys) * kk, (cm.right[1] * dxs + cm.down[1] * dys) * kk, (cm.right[2] * dxs + cm.down[2] * dys) * kk]; const d = M.dir(M.invert(drag.pf), w); Model.setPropAt(drag.L, drag.key, t, drag.v0.map((v, i) => v + d[i]), { fps: c.fps }); App.changed('values'); return; }
    if (drag.kind === 'field') { const cm = camInfo(); const vz = Math.max(U.V.dot(U.V.sub(drag.p0, cm.pos), cm.fwd), 10); const kk = (2 * vz * cm.tanHalf) / (c.h * layout().s); const dxs = sx - drag.s0[0], dys = sy - drag.s0[1]; const w = [(cm.right[0] * dxs + cm.down[0] * dys) * kk, (cm.right[1] * dxs + cm.down[1] * dys) * kk, (cm.right[2] * dxs + cm.down[2] * dys) * kk]; Model.setPropAt(drag.n, 'pos', t, drag.p0.map((v, i) => v + w[i]), { fps: c.fps }); App.changed('values'); return; }
    if (drag.kind === 'anchor') {
      const L = drag.L; const lp = localOnPlane(L, sx, sy); if (!lp) return; // 基于初始变换求鼠标处的局部点
      const inv = M.invert(drag.wm); let local; if (L.is3D) { local = [lp[0], lp[1], drag.a0[2] || 0]; } else { const [cx, cy] = toComp(sx, sy); const q = M.pt(inv, [cx, cy, 0]); local = [q[0], q[1], 0]; }
      const na = local; const delta = [na[0] - drag.a0[0], na[1] - drag.a0[1], na[2] - (drag.a0[2] || 0)];
      const newOwn = M.mul(drag.own, M.translate(delta[0], delta[1], delta[2])); const loc = M.mul(M.invert(drag.pf), newOwn);
      Model.setPropAt(L, 'transform.anchor', t, na.map(v => v), { fps: c.fps }); Model.setPropAt(L, 'transform.position', t, [loc[12], loc[13], loc[14]], { fps: c.fps }); App.changed('values'); return;
    }
    if (drag.kind === 'rot') { const L = drag.L; const a = Math.atan2(sy - drag.aw.y, sx - drag.aw.x); let d = (a - drag.a0) / U.DEG; Model.setPropAt(L, 'transform.rotation', t, drag.r0 + d, { fps: c.fps }); App.changed('values'); return; }
    if (drag.kind === 'scale') {
      const L = drag.L; const dx = sx - drag.aw.x, dy = sy - drag.aw.y; let fx = 1, fy = 1;
      if (!drag.edge) { const f = Math.hypot(dx, dy) / (Math.hypot(drag.d0[0], drag.d0[1]) || 1); fx = fy = f; }
      else { // 边手柄：沿局部轴
        const wm = ev.worldMatrix(c, L, t); const ux = [wm[0], wm[1]], uy = [wm[4], wm[5]]; const lenx = Math.hypot(...ux) || 1, leny = Math.hypot(...uy) || 1; const ax = [ux[0] / lenx, ux[1] / lenx], ay = [uy[0] / leny, uy[1] / leny];
        if (drag.sx !== 0) { const p0 = drag.d0[0] * ax[0] + drag.d0[1] * ax[1], p1 = dx * ax[0] + dy * ax[1]; fx = p0 ? p1 / p0 : 1; } if (drag.sy !== 0) { const p0 = drag.d0[0] * ay[0] + drag.d0[1] * ay[1], p1 = dx * ay[0] + dy * ay[1]; fy = p0 ? p1 / p0 : 1; }
      }
      if (e.shiftKey && drag.edge) { fy = fx = drag.sx !== 0 ? fx : fy; }
      Model.setPropAt(L, 'transform.scale', t, [drag.sc0[0] * fx, drag.sc0[1] * fy, drag.sc0[2]], { fps: c.fps }); App.changed('values'); return;
    }
    if (drag.kind === 'mkey') {
      const dxs = sx - drag.s0[0], dys = sy - drag.s0[1]; if (!drag.moved && Math.hypot(dxs, dys) < 2) return; drag.moved = true; const L = drag.hk.L; const key = drag.hk.key; const cm = drag.cm; let w;
      if (L.is3D) { const wp = M.pt(drag.pf, drag.v0); const vz = Math.max(U.V.dot(U.V.sub(wp, cm.pos), cm.fwd), 10); const kk = (2 * vz * cm.tanHalf) / (c.h * layout().s); w = [(cm.right[0] * dxs + cm.down[0] * dys) * kk, (cm.right[1] * dxs + cm.down[1] * dys) * kk, (cm.right[2] * dxs + cm.down[2] * dys) * kk]; } else { const s = layout().s; w = [dxs / s, dys / s, 0]; }
      const d = M.dir(drag.inv, w); const p = L.props['transform.position'];
      if (drag.hk.kind === 'key') { key.v = drag.v0.map((v, i) => v + (d[i] || 0)); if (drag.alt) { key.sm = 'bez'; } }
      else { const nm = drag.hk.kind; key.sm = 'bez'; const base = (nm === 'si' ? drag.si0 : drag.so0) || [0, 0, 0]; key[nm] = base.map((v, i) => v + (d[i] || 0)); if (!e.altKey) { const other = nm === 'si' ? 'so' : 'si'; key[other] = key[nm].map(v => -v); } }
      Model.normalizeProp(p, Model.propInfo(L, 'transform.position')); App.changed('values'); return;
    }
    if (drag.kind === 'vertex') {
      const hv = drag.hv; const dxs = sx - drag.s0[0], dys = sy - drag.s0[1]; if (!drag.moved && Math.hypot(dxs, dys) < 2) return; drag.moved = true;
      const et = hv.et; const lp = localOnPlane(et.L, sx, sy); const lp0 = localOnPlane(et.L, drag.s0[0], drag.s0[1]); if (!lp || !lp0) return; const d = [lp[0] - lp0[0], lp[1] - lp0[1]];
      const sh = U.clone(drag.startShape); const ct = sh.contours[hv.ci]; const v = ct.v[hv.vi];
      if (hv.kind === 'v') ct.v[hv.vi] = [v[0] + d[0], v[1] + d[1]];
      else { const nm = hv.kind; const cur = ct[nm][hv.vi]; ct[nm][hv.vi] = [cur[0] + d[0], cur[1] + d[1]]; if (!e.altKey) { const other = nm === 'i' ? 'o' : 'i'; ct[other][hv.vi] = [-ct[nm][hv.vi][0], -ct[nm][hv.vi][1]]; } }
      writePath(et, sh); return;
    }
    if (drag.kind === 'pin') {
      const hp = drag.hp; const lp = localOnPlane(hp.L || { is3D: false, id: '' }, sx, sy) || null; if (!lp) return; if (!drag.moved && Math.hypot(sx - drag.s0[0], sy - drag.s0[1]) < 2) return; drag.moved = true;
      Model.setPropAt(hp.sn, `pin.${hp.pi.id}.pos`, t, [lp[0] - hp.pi.rest[0], lp[1] - hp.pi.rest[1]], { fps: c.fps }); App.changed('values'); return;
    }
  }
  function onUp(e) {
    if (!drag) return; const d = drag; drag = null; const r = wrap.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (d.kind === 'shape') { const sr = state.rectDrag; state.rectDrag = null; finishShape(sr.kind, sr.x0, sr.y0, sr.x1, sr.y1, e.altKey); App.requestRender(); return; }
    if (d.kind === 'pen') { state.pen.drag = false; return; }
    if (d.kind === 'marquee') { return; }
    if (d.kind === 'orbit') { camDrag0 = null; App.commit('环绕摄像机'); return; }
    if (d.kind === 'move' && !d.moved) return;
    const labels = { move: '移动图层', axis: '沿轴移动', target: '移动目标点', field: '移动场', anchor: '移动锚点', rot: '旋转图层', scale: '缩放图层', mkey: '编辑运动路径', vertex: '编辑路径顶点', pin: '移动图钉' };
    if (labels[d.kind]) { if (d.moved === false && d.kind !== 'target' && d.kind !== 'field') { return; } App.commit(labels[d.kind]); App.changed('struct'); }
  }
})();
