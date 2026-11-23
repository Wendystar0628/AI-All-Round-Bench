// 合成画布：WebGL 预览 + 叠加层（选择框、手柄、运动路径、路径节点、图钉、场范围、光源与摄像机），所有辅助元素按最终画面投影
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const App = MF.App, M4 = MF.M4, Sc = MF.Scene, A = MF.Anim, h = MF.h;
  const V = (p, t) => MF.Eval.val(p, t === undefined ? App.time : t);
  const COL = { sel: '#58c7e0', hot: '#ffffff', path: '#ff9a52', key: '#f0c060', pin: '#ffd23f', field: '#ff6f91', light: '#ffe08a', cam: '#b9a6ff', mask: '#7fd17f', x: '#ff5a5a', y: '#7fd17f', z: '#5a9bff' };

  const VP = (MF.Viewport = {
    handles: [], hover: null, drag: null, mouse: [0, 0], space: false,
    init(stage) {
      VP.stage = stage; VP.gl = h('canvas', { id: 'glcanvas' }); VP.ov = h('canvas', { id: 'overlay', tabIndex: 0 }); VP.hud = h('div', { class: 'vhud' });
      stage.append(VP.gl, VP.ov, VP.hud); VP.ctx = VP.ov.getContext('2d');
      try { VP.renderer = new MF.Renderer(VP.gl); } catch (e) { stage.appendChild(h('div', { class: 'empty' }, h('b', null, '无法初始化 WebGL 2'), String(e.message || e))); console.error(e); }
      new ResizeObserver(() => VP.resize()).observe(stage); VP.resize();
      const ov = VP.ov;
      ov.addEventListener('pointerdown', (e) => MF.Tools.down(e)); ov.addEventListener('pointermove', (e) => MF.Tools.move(e)); ov.addEventListener('pointerup', (e) => MF.Tools.up(e)); ov.addEventListener('pointercancel', (e) => MF.Tools.up(e));
      ov.addEventListener('dblclick', (e) => MF.Tools.dbl(e)); ov.addEventListener('contextmenu', (e) => { e.preventDefault(); MF.Tools.context(e); });
      ov.addEventListener('wheel', (e) => { e.preventDefault(); const r = ov.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; if (App.tool === 'camera' && !e.ctrlKey && Sc.activeCamera(App.comp(), App.time)) { MF.Tools.dolly(-e.deltaY); return; } const f = Math.exp(-e.deltaY * 0.0015); VP.zoomAt(mx, my, f); }, { passive: false });
      ov.addEventListener('pointerleave', () => { VP.hover = null; MF.W.hideTip(); });
      App.on('project', () => (App.dirty = true)); App.on('selection', () => (App.dirty = true)); App.on('tool', () => { App.dirty = true; });
    },
    resize() {
      const r = VP.stage.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; VP.w = Math.max(10, r.width); VP.h = Math.max(10, r.height); VP.dpr = dpr;
      for (const c of [VP.gl, VP.ov]) { c.width = Math.round(VP.w * dpr); c.height = Math.round(VP.h * dpr); }
      if (App.view.fit) VP.fit(); App.dirty = true;
    },
    fit() { const c = App.comp(); if (!c) return; const pad = 18; const s = Math.min((VP.w - pad * 2) / c.w, (VP.h - pad * 2) / c.h); App.view.scale = Math.max(0.02, s); App.view.x = (VP.w - c.w * App.view.scale) / 2; App.view.y = (VP.h - c.h * App.view.scale) / 2; App.view.fit = true; App.dirty = true; App.emit('view'); },
    zoomAt(mx, my, f) { const v = App.view; const ns = MF.clamp(v.scale * f, 0.02, 32); const k = ns / v.scale; v.x = mx - (mx - v.x) * k; v.y = my - (my - v.y) * k; v.scale = ns; v.fit = false; App.dirty = true; App.emit('view'); },
    setZoom(s) { VP.zoomAt(VP.w / 2, VP.h / 2, s / App.view.scale); },
    // 合成像素 ↔ 画布 CSS 像素
    c2s(p) { const v = App.view; return [v.x + p[0] * v.scale, v.y + p[1] * v.scale]; },
    s2c(p) { const v = App.view; return [(p[0] - v.x) / v.scale, (p[1] - v.y) / v.scale]; },
    uses3D(L) { return L.is3D || L.type === 'camera' || L.type === 'light' || L.type === 'geo' || L.type === 'particles'; },
    cam(t) { return Sc.cameraInfo(App.comp(), t === undefined ? App.time : t); },
    // 世界点 → 画布像素（三维走摄像机投影）
    w2s(p, is3D) { const c = App.comp(); if (!is3D) return VP.c2s(p); const pr = Sc.project(c, VP.cam(), p); return pr ? VP.c2s(pr) : null; },
    // 图层空间点 → 画布像素
    l2s(L, p) { const m = Sc.worldMatrix(App.comp(), L, App.time); return VP.w2s(M4.tp(m, [p[0], p[1], p[2] || 0]), VP.uses3D(L)); },
    // 父级空间点 → 画布像素
    p2s(L, p) { const m = Sc.parentMatrix(App.comp(), L, App.time); return VP.w2s(M4.tp(m, [p[0], p[1], p[2] || 0]), VP.uses3D(L)); },
    // 画布像素 → 图层空间点（落在图层平面 z=0 上）
    s2l(L, s) {
      const c = App.comp(); const m = Sc.worldMatrix(c, L, App.time); const inv = M4.invert(m); const cp = VP.s2c(s);
      if (!VP.uses3D(L)) return M4.tp(inv, [cp[0], cp[1], 0]);
      const ray = Sc.ray(c, VP.cam(), cp[0], cp[1]); const o = M4.tp(inv, ray.o), d = M4.td(inv, ray.d);
      if (Math.abs(d[2]) < 1e-9) return [o[0], o[1], 0]; const k = -o[2] / d[2]; return [o[0] + d[0] * k, o[1] + d[1] * k, 0];
    },
    // ---------- 渲染 ----------
    render() {
      const c = App.comp(); if (!VP.renderer) return;
      const dpr = VP.dpr, v = App.view; let rs = MF.clamp(v.scale * dpr, 0.08, 2); rs = Math.round(rs * 32) / 32; if (App.ui.res) rs = Math.min(rs, App.ui.res);
      if (App.exportRS) rs = App.exportRS;
      VP.rs = rs;
      try { VP.renderer.frame(c, App.time, { x: v.x * dpr, y: v.y * dpr, scale: v.scale * dpr }, { rs, checker: App.ui.checker }); } catch (e) { if (!VP._err || VP._err !== String(e)) { console.error('渲染失败', e); VP._err = String(e); } }
      VP.drawOverlay();
      const st = VP.renderer.stats; const pinfo = [];
      if (c) for (const L of c.layers) if (L.type === 'particles' && Sc.isActive(L, App.time)) { const i = MF.Particles.info(c, L); if (i) pinfo.push(L.name + ' ' + i.count + ' 粒子'); }
      VP.hud.innerHTML = c ? `<b>${c.name}</b>  ${c.w}×${c.h}  ${c.fps} fps\n渲染 ${st.ms.toFixed(1)} ms · 分辨率 ${Math.round(rs * 100)}%${pinfo.length ? '\n' + pinfo.join(' · ') : ''}` : '';
    },
    // ---------- 叠加层 ----------
    H(o) { VP.handles.push(o); return o; },
    drawOverlay() {
      const ctx = VP.ctx, dpr = VP.dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, VP.w, VP.h); VP.handles = [];
      const c = App.comp();
      if (!c) { return; }
      const v = App.view; ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.strokeRect(Math.round(v.x) - 0.5, Math.round(v.y) - 0.5, Math.round(c.w * v.scale) + 1, Math.round(c.h * v.scale) + 1);
      if (App.exporting && !App.exportOverlay) return;
      const t = App.time; const sel = App.selLayers();
      if (App.ui.showFields) VP.drawFields(c, t);
      for (const L of c.layers) { if (!L.visible) continue; if (L.type === 'light' || L.type === 'camera') VP.drawRig(c, L, sel.indexOf(L) >= 0); }
      for (const L of sel) {
        if (!Sc.isActive(L, t) && L.type !== 'camera' && L.type !== 'light') { /* 不在时间范围内仍显示运动路径 */ }
        if (App.ui.showMotion) VP.drawMotionPath(c, L);
        if (L.type === 'camera' || L.type === 'light') continue;
        VP.drawLayerBox(c, L, sel.length > 1);
        if (L.type === 'particles') VP.drawParticleRig(c, L);
        if (sel.length === 1) VP.drawSubPaths(c, L);
      }
      VP.drawNodeSel(c);
      if (MF.Tools.draft) MF.Tools.drawDraft(ctx);
      if (MF.Tools.marquee) { const m = MF.Tools.marquee; ctx.fillStyle = 'rgba(88,199,224,.12)'; ctx.strokeStyle = COL.sel; ctx.setLineDash([4, 3]); ctx.fillRect(m[0], m[1], m[2] - m[0], m[3] - m[1]); ctx.strokeRect(m[0] + 0.5, m[1] + 0.5, m[2] - m[0], m[3] - m[1]); ctx.setLineDash([]); }
      // 悬停高亮
      if (VP.hover && !VP.drag) { const hd = VP.hover; ctx.strokeStyle = COL.hot; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hd.x, hd.y, (hd.r || 6) + 2, 0, 6.2832); ctx.stroke(); }
    },
    line(ctx, a, b) { if (!a || !b) return; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); },
    dot(ctx, p, r, fill, stroke) { if (!p) return; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } },
    sq(ctx, p, r, fill, stroke) { if (!p) return; ctx.beginPath(); ctx.rect(p[0] - r, p[1] - r, r * 2, r * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } },
    // 选择框 + 缩放/旋转手柄 + 锚点 + 三维轴
    drawLayerBox(c, L, multi) {
      const ctx = VP.ctx, t = App.time; if (L.type === 'audio') return; const is3 = VP.uses3D(L);
      if (L.type === 'geo') { VP.drawGeoBox(c, L); }
      else if (L.type !== 'particles') {
        const b = Sc.contentBounds(c, L, t); const cs = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map((p) => VP.l2s(L, p));
        if (cs.every(Boolean)) {
          ctx.strokeStyle = COL.sel; ctx.lineWidth = 1; ctx.beginPath(); cs.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke();
          if (!multi && !L.locked && (App.tool === 'select' || App.tool === 'rotate')) {
            const mids = cs.map((p, i) => { const q = cs[(i + 1) % 4]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
            const pts = [cs[0], mids[0], cs[1], mids[1], cs[2], mids[2], cs[3], mids[3]]; const loc = [[b[0], b[1]], [(b[0] + b[2]) / 2, b[1]], [b[2], b[1]], [b[2], (b[1] + b[3]) / 2], [b[2], b[3]], [(b[0] + b[2]) / 2, b[3]], [b[0], b[3]], [b[0], (b[1] + b[3]) / 2]];
            const cur = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'];
            pts.forEach((p, i) => { VP.sq(ctx, p, 3.5, '#101010', COL.sel); if (App.tool === 'select') VP.H({ x: p[0], y: p[1], r: 6, cursor: cur[i], tip: '拖动缩放（Shift 等比）', drag: MF.Tools.scaleDrag(L, loc[i], i % 2 === 1 ? (i === 1 || i === 5 ? 'y' : 'x') : 'xy') }); });
            // 旋转手柄：上边中点外侧
            const up = mids[0], ctr = [(cs[0][0] + cs[2][0]) / 2, (cs[0][1] + cs[2][1]) / 2]; let dx = up[0] - ctr[0], dy = up[1] - ctr[1]; const dl = Math.hypot(dx, dy) || 1; const rp = [up[0] + (dx / dl) * 22, up[1] + (dy / dl) * 22];
            ctx.strokeStyle = COL.sel; VP.line(ctx, up, rp); VP.dot(ctx, rp, 4.5, '#101010', COL.sel); VP.H({ x: rp[0], y: rp[1], r: 8, cursor: 'grab', tip: '拖动旋转（Shift 吸附 15°）', drag: MF.Tools.rotateDrag(L) });
          }
        }
      }
      if (multi || L.locked) return;
      // 锚点
      const an = V(L.tr.anchor), ap = VP.l2s(L, an);
      if (ap && L.type !== 'geo' || ap && L.type === 'geo') {
        ctx.strokeStyle = COL.sel; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(ap[0], ap[1], 5, 0, 6.2832); ctx.moveTo(ap[0] - 9, ap[1]); ctx.lineTo(ap[0] + 9, ap[1]); ctx.moveTo(ap[0], ap[1] - 9); ctx.lineTo(ap[0], ap[1] + 9); ctx.stroke();
        if (App.tool === 'anchor') VP.H({ x: ap[0], y: ap[1], r: 9, cursor: 'move', tip: '拖动锚点（图层在画面上保持不动）', drag: MF.Tools.anchorDrag(L) });
        if (is3 && (App.tool === 'select' || App.tool === 'anchor')) VP.drawAxes(L, an, ap);
      }
    },
    drawAxes(L, an, ap) {
      const ctx = VP.ctx, c = App.comp(), t = App.time; const pos = V(L.tr.position); const p0 = [pos[0], pos[1], pos[2] || 0];
      // 轴长按屏幕大小自适应
      const cam = VP.cam(); const wp = M4.tp(Sc.parentMatrix(c, L, t), p0); const pr = Sc.project(c, cam, wp); const len = pr ? (70 / App.view.scale) * (pr[2] / cam.zoom) : 100;
      const pm = Sc.parentMatrix(c, L, t); const scl = Math.hypot(pm[0], pm[1], pm[2]) || 1;
      ['x', 'y', 'z'].forEach((ax, i) => {
        const e = [0, 0, 0]; e[i] = len / scl; const q = VP.p2s(L, [p0[0] + e[0], p0[1] + e[1], p0[2] + e[2]]); if (!q) return;
        ctx.strokeStyle = COL[ax]; ctx.fillStyle = COL[ax]; ctx.lineWidth = 2; VP.line(ctx, ap, q);
        const dx = q[0] - ap[0], dy = q[1] - ap[1], dl = Math.hypot(dx, dy) || 1; if (dl < 6) return; const ux = dx / dl, uy = dy / dl;
        ctx.beginPath(); ctx.moveTo(q[0] + ux * 9, q[1] + uy * 9); ctx.lineTo(q[0] - uy * 4.5, q[1] + ux * 4.5); ctx.lineTo(q[0] + uy * 4.5, q[1] - ux * 4.5); ctx.closePath(); ctx.fill();
        ctx.font = '10px sans-serif'; ctx.fillText(ax.toUpperCase(), q[0] + ux * 14 - 3, q[1] + uy * 14 + 3);
        VP.H({ x: q[0] + ux * 3, y: q[1] + uy * 3, r: 9, cursor: 'move', tip: '沿 ' + ax.toUpperCase() + ' 轴移动', prio: 2, drag: MF.Tools.axisDrag(L, i) });
      });
    },
    drawGeoBox(c, L) {
      const ctx = VP.ctx, t = App.time; const mesh = MF.Nodes.layerGeo(c, L, t); if (!mesh) return; const b = mesh._bb || (mesh._bb = MF.Solid.bbox(mesh));
      const P = []; for (let i = 0; i < 8; i++) P.push(VP.l2s(L, [b[i & 1 ? 3 : 0], b[i & 2 ? 4 : 1], b[i & 4 ? 5 : 2]]));
      ctx.strokeStyle = COL.sel; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      for (const [a, d] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) VP.line(ctx, P[a], P[d]);
      ctx.setLineDash([]);
    },
    // 运动路径：位置属性的空间曲线、关键帧与空间手柄
    drawMotionPath(c, L) {
      const prop = L.tr.position; if (!prop.k || prop.k.length < 1) return; const ctx = VP.ctx; const k = prop.k, meta = MF.Schema.transform[1]; const pid = App.pid(L.id, 'tr.position');
      const t0 = k[0].t, t1 = k[k.length - 1].t; const fps = c.fps; const n = Math.min(600, Math.max(2, Math.round((t1 - t0) * fps)));
      ctx.strokeStyle = COL.path; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.beginPath(); let started = false; const dots = [];
      for (let i = 0; i <= n; i++) { const tt = t0 + ((t1 - t0) * i) / n; const p = VP.p2s(L, A.value(prop, tt, meta)); if (!p) { started = false; continue; } if (!started) { ctx.moveTo(p[0], p[1]); started = true; } else ctx.lineTo(p[0], p[1]); dots.push(p); }
      ctx.stroke(); ctx.fillStyle = COL.path; const stepDots = Math.max(1, Math.round(dots.length / 120)); for (let i = 0; i < dots.length; i += stepDots) ctx.fillRect(dots[i][0] - 1, dots[i][1] - 1, 2, 2);
      if (prop.x && prop.xOn !== false) { // 表达式的最终轨迹
        ctx.strokeStyle = 'rgba(255,143,143,.8)'; ctx.setLineDash([3, 3]); ctx.beginPath(); let st = false; const cdur = c.duration; const m2 = Math.min(300, Math.round(cdur * fps));
        for (let i = 0; i <= m2; i++) { const p = VP.p2s(L, MF.Eval.val(prop, (cdur * i) / m2)); if (!p) { st = false; continue; } if (!st) { ctx.moveTo(p[0], p[1]); st = true; } else ctx.lineTo(p[0], p[1]); } ctx.stroke(); ctx.setLineDash([]);
      }
      if (L.locked) return; const dims = 3;
      k.forEach((key, i) => {
        const p = VP.p2s(L, key.v); if (!p) return; const selK = App.isKeySel(pid, i);
        if (selK) {
          const to = A.outTan(k, i, dims), ti = A.inTan(k, i, dims);
          const drawT = (tan, which) => { if (which === 'to' && i === k.length - 1) return; if (which === 'ti' && i === 0) return; const q = VP.p2s(L, [key.v[0] + tan[0], key.v[1] + tan[1], (key.v[2] || 0) + (tan[2] || 0)]); if (!q) return; ctx.strokeStyle = COL.key; ctx.lineWidth = 1; VP.line(ctx, p, q); VP.dot(ctx, q, 3.5, key.sl ? '#555' : COL.key, '#201500'); VP.H({ x: q[0], y: q[1], r: 7, cursor: 'crosshair', prio: 3, tip: '空间手柄：拖动改变路径形状（Alt 断开两侧）', drag: MF.Tools.tangentDrag(L, i, which) }); };
          drawT(to, 'to'); drawT(ti, 'ti');
        }
        VP.sq(ctx, p, selK ? 4.5 : 3.5, selK ? COL.key : '#201a10', COL.key);
        VP.H({ x: p[0], y: p[1], r: 7, cursor: 'move', prio: 2, tip: '位置关键帧 ' + (i + 1) + ' @ ' + key.t.toFixed(2) + 's（拖动移动；Alt+单击 切换直线/曲线）', drag: MF.Tools.motionKeyDrag(L, i) });
      });
    },
    // 形状路径与蒙版路径的节点/切线
    drawSubPaths(c, L) {
      const ctx = VP.ctx, t = App.time; const list = [];
      if (L.type === 'shape') for (const it of L.items) if (it.type === 'path') list.push({ prop: it.p.path, pid: App.pid(L.id, 'it.' + it.id + '.path'), col: COL.sel, obj: it });
      for (const mk of L.masks || []) list.push({ prop: mk.p.path, pid: App.pid(L.id, 'mask.' + mk.id + '.path'), col: COL.mask, obj: mk, mask: true });
      const sub = App.sel.sub;
      for (const e of list) {
        const pv = V(e.prop, t); if (!pv) continue; const active = sub && sub.pid === e.pid; const editable = !pv.flat && pv.c && !L.locked && (App.tool === 'select' || App.tool === 'pen');
        const cs = MF.Path.flat(pv, 0.5);
        ctx.strokeStyle = e.col; ctx.lineWidth = e.mask ? 1.4 : 1; ctx.setLineDash(e.mask ? [] : []);
        for (const ct of cs) { ctx.beginPath(); let st = false; for (let i = 0; i < ct.pts.length; i += 2) { const p = VP.l2s(L, [ct.pts[i], ct.pts[i + 1]]); if (!p) continue; if (!st) { ctx.moveTo(p[0], p[1]); st = true; } else ctx.lineTo(p[0], p[1]); } if (ct.closed) ctx.closePath(); if (e.mask || active) ctx.stroke(); }
        if (!editable) continue;
        pv.c.forEach((ct, ci) => ct.v.forEach((vx, vi) => {
          const p = VP.l2s(L, vx); if (!p) return; const isSel = active && sub.pts && sub.pts.some((q) => q[0] === ci && q[1] === vi);
          if (isSel) for (const which of [2, 4]) { if (!vx[which] && !vx[which + 1]) continue; const q = VP.l2s(L, [vx[0] + vx[which], vx[1] + vx[which + 1]]); if (!q) continue; ctx.strokeStyle = e.col; VP.line(ctx, p, q); VP.dot(ctx, q, 3, e.col, '#000'); VP.H({ x: q[0], y: q[1], r: 6, cursor: 'crosshair', prio: 4, tip: '切线手柄（Alt 断开）', drag: MF.Tools.pathTanDrag(L, e, ci, vi, which) }); }
          VP.sq(ctx, p, isSel ? 4 : 3, isSel ? e.col : '#101010', e.col);
          VP.H({ x: p[0], y: p[1], r: 6, cursor: 'move', prio: 3, tip: '路径顶点（拖动移动；Alt+单击 切换尖角/平滑；Delete 删除）', drag: MF.Tools.pathPtDrag(L, e, ci, vi) });
        }));
      }
    },
    // 光源与摄像机
    drawRig(c, L, selected) {
      const ctx = VP.ctx, t = App.time; const cam = VP.cam(); const pm = Sc.parentMatrix(c, L, t);
      if (L.type === 'light') {
        const pos = V(L.tr.position), wp = M4.tp(pm, pos), sp = VP.w2s(wp, true); if (!sp) return; const col = MF.cssColor(V(L.light.p.color), 1);
        ctx.strokeStyle = selected ? COL.hot : COL.light; ctx.fillStyle = col; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(sp[0], sp[1], 6, 0, 6.2832); ctx.fill(); ctx.stroke();
        for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.2832; VP.line(ctx, [sp[0] + Math.cos(a) * 9, sp[1] + Math.sin(a) * 9], [sp[0] + Math.cos(a) * 13, sp[1] + Math.sin(a) * 13]); }
        ctx.font = '10px sans-serif'; ctx.fillStyle = 'rgba(255,224,138,.85)'; ctx.fillText(L.name, sp[0] + 16, sp[1] + 3);
        VP.H({ x: sp[0], y: sp[1], r: 10, cursor: 'move', tip: (L.light.s.kind === 'parallel' ? '平行光' : '点光源') + ' “' + L.name + '”：拖动移动', layer: L, drag: MF.Tools.pointDrag('移动灯光', L, () => V(L.tr.position), (v) => App.setProp(L.tr.position, MF.Schema.transform[1], v), true) });
        if (L.light.s.kind === 'parallel') {
          const poi = V(L.light.p.poi), wq = M4.tp(pm, poi), sq = VP.w2s(wq, true);
          if (sq) { ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,224,138,.6)'; VP.line(ctx, sp, sq); ctx.setLineDash([]); if (selected) { ctx.strokeStyle = COL.light; ctx.beginPath(); ctx.moveTo(sq[0] - 6, sq[1]); ctx.lineTo(sq[0] + 6, sq[1]); ctx.moveTo(sq[0], sq[1] - 6); ctx.lineTo(sq[0], sq[1] + 6); ctx.stroke(); VP.dot(ctx, sq, 3, COL.light); VP.H({ x: sq[0], y: sq[1], r: 8, cursor: 'move', tip: '光照目标点', drag: MF.Tools.pointDrag('移动光照目标', L, () => V(L.light.p.poi), (v) => App.setProp(L.light.p.poi, MF.Schema.light[2], v), true) }); } }
        } else if (selected) { const r = V(L.light.p.range); VP.ring(wp, r, 'rgba(255,224,138,.35)'); }
      } else if (L.type === 'camera') {
        const active = Sc.activeCamera(c, t) === L; const poi = M4.tp(pm, V(L.cam.p.poi)); const sq = VP.w2s(poi, true);
        if (sq && (selected || App.tool === 'camera')) {
          ctx.strokeStyle = COL.cam; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(sq[0], sq[1], 7, 0, 6.2832); ctx.moveTo(sq[0] - 11, sq[1]); ctx.lineTo(sq[0] + 11, sq[1]); ctx.moveTo(sq[0], sq[1] - 11); ctx.lineTo(sq[0], sq[1] + 11); ctx.stroke();
          ctx.font = '10px sans-serif'; ctx.fillStyle = COL.cam; ctx.fillText(L.name + ' · 目标点', sq[0] + 12, sq[1] - 8);
          VP.H({ x: sq[0], y: sq[1], r: 9, cursor: 'move', tip: '摄像机目标点：拖动移动', layer: L, drag: MF.Tools.pointDrag('移动摄像机目标点', L, () => V(L.cam.p.poi), (v) => App.setProp(L.cam.p.poi, MF.Schema.camera[0], v), true) });
          // 对焦平面标记
          if (selected && active && cam.aperture > 0) { const fp = MF.V3.add(cam.pos, MF.V3.mul(cam.fwd, cam.focus)); const sf = VP.w2s(fp, true); if (sf) { ctx.strokeStyle = 'rgba(185,166,255,.7)'; ctx.setLineDash([2, 3]); ctx.strokeRect(sf[0] - 16, sf[1] - 16, 32, 32); ctx.setLineDash([]); ctx.fillStyle = COL.cam; ctx.fillText('对焦 ' + Math.round(cam.focus), sf[0] + 20, sf[1] + 14); } }
        }
        if (!active) { const wp = M4.tp(pm, V(L.tr.position)), sp = VP.w2s(wp, true); if (sp) { ctx.strokeStyle = selected ? COL.hot : COL.cam; ctx.strokeRect(sp[0] - 8, sp[1] - 6, 14, 12); ctx.beginPath(); ctx.moveTo(sp[0] + 6, sp[1]); ctx.lineTo(sp[0] + 13, sp[1] - 5); ctx.lineTo(sp[0] + 13, sp[1] + 5); ctx.closePath(); ctx.stroke(); VP.H({ x: sp[0], y: sp[1], r: 10, cursor: 'move', layer: L, tip: '摄像机 “' + L.name + '”', drag: MF.Tools.pointDrag('移动摄像机', L, () => V(L.tr.position), (v) => App.setProp(L.tr.position, MF.Schema.transform[1], v), true) }); } }
      }
    },
    // 世界空间圆环（朝向摄像机）
    ring(center, radius, color, dash) {
      const ctx = VP.ctx, cam = VP.cam(); const R = [cam.world[0], cam.world[1], cam.world[2]], D = [cam.world[4], cam.world[5], cam.world[6]];
      ctx.strokeStyle = color; ctx.lineWidth = 1.2; if (dash) ctx.setLineDash(dash); ctx.beginPath(); let st = false;
      for (let i = 0; i <= 64; i++) { const a = (i / 64) * 6.2832; const p = VP.w2s([center[0] + (R[0] * Math.cos(a) + D[0] * Math.sin(a)) * radius, center[1] + (R[1] * Math.cos(a) + D[1] * Math.sin(a)) * radius, center[2] + (R[2] * Math.cos(a) + D[2] * Math.sin(a)) * radius], true); if (!p) { st = false; continue; } if (!st) { ctx.moveTo(p[0], p[1]); st = true; } else ctx.lineTo(p[0], p[1]); }
      ctx.stroke(); ctx.setLineDash([]);
    },
    ringAxis(center, radius, axis, color) { // 垂直于给定轴的圆
      const ctx = VP.ctx; let u = MF.V3.cross(axis, [0, 1, 0]); if (MF.V3.len(u) < 1e-4) u = [1, 0, 0]; u = MF.V3.norm(u); const w = MF.V3.cross(axis, u);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); let st = false;
      for (let i = 0; i <= 64; i++) { const a = (i / 64) * 6.2832; const p = VP.w2s([center[0] + (u[0] * Math.cos(a) + w[0] * Math.sin(a)) * radius, center[1] + (u[1] * Math.cos(a) + w[1] * Math.sin(a)) * radius, center[2] + (u[2] * Math.cos(a) + w[2] * Math.sin(a)) * radius], true); if (!p) { st = false; continue; } if (!st) { ctx.moveTo(p[0], p[1]); st = true; } else ctx.lineTo(p[0], p[1]); }
      ctx.stroke();
    },
    // 场范围：所有场节点（选中的高亮），中心可拖动
    drawFields(c, t) {
      const ctx = VP.ctx; const N = MF.Nodes; const ctxN = N.top(c); const selN = App.sel.nodes;
      for (const n of c.nodes) {
        const d = N.types[n.type]; if (!d.isField || n.type === 'fieldMix' || n.type === 'noiseF') continue; const isSel = selN.indexOf(n.id) >= 0;
        // 只显示：被选中的，或其下游图层被选中的
        if (!isSel && !VP.fieldRelevant(c, n)) continue;
        const f = N.out(ctxN, n, 'field', t); if (!f || !f.info || !f.info.center) continue; const inf = f.info; const col = isSel ? COL.hot : COL.field;
        const sp = VP.w2s(inf.center, true); if (!sp) continue;
        if (inf.shape === 'linear') { const e = MF.V3.add(inf.center, MF.V3.mul(inf.axis, inf.radius)); const se = VP.w2s(e, true); ctx.strokeStyle = col; ctx.lineWidth = 1.2; VP.line(ctx, sp, se); VP.ringAxis(inf.center, 60, inf.axis, col); VP.ringAxis(e, 60, inf.axis, 'rgba(255,111,145,.4)'); }
        else if (inf.shape === 'cylinder') { VP.ringAxis(inf.center, inf.radius, inf.axis, col); const a = MF.V3.add(inf.center, MF.V3.mul(inf.axis, inf.radius * 0.6)), b = MF.V3.sub(inf.center, MF.V3.mul(inf.axis, inf.radius * 0.6)); ctx.strokeStyle = col; VP.line(ctx, VP.w2s(a, true), VP.w2s(b, true)); }
        else { VP.ring(inf.center, inf.radius, col); VP.ringAxis(inf.center, inf.radius, [0, 1, 0], 'rgba(255,111,145,.45)'); if (inf.hardness > 0.02) VP.ring(inf.center, inf.radius * inf.hardness, 'rgba(255,111,145,.5)', [3, 3]); }
        // 向量取样箭头
        if (isSel) { const o = [0, 0, 0, 0]; ctx.strokeStyle = 'rgba(255,111,145,.75)'; ctx.lineWidth = 1; const cam = VP.cam(); const R = [cam.world[0], cam.world[1], cam.world[2]], D = [cam.world[4], cam.world[5], cam.world[6]]; for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.2832, rr = inf.radius * (i % 2 ? 0.45 : 0.8); const p = [inf.center[0] + (R[0] * Math.cos(a) + D[0] * Math.sin(a)) * rr, inf.center[1] + (R[1] * Math.cos(a) + D[1] * Math.sin(a)) * rr, inf.center[2] + (R[2] * Math.cos(a) + D[2] * Math.sin(a)) * rr]; f.eval(p[0], p[1], p[2], o); const l = Math.hypot(o[1], o[2], o[3]); if (l < 1e-4) continue; const k = (inf.radius * 0.22) / Math.max(1e-6, Math.abs(V(n.p.strength, t)) || 1); const q = [p[0] + o[1] * k, p[1] + o[2] * k, p[2] + o[3] * k]; const s0 = VP.w2s(p, true), s1 = VP.w2s(q, true); if (!s0 || !s1) continue; VP.line(ctx, s0, s1); VP.dot(ctx, s1, 1.6, 'rgba(255,111,145,.9)'); } }
        ctx.fillStyle = col; ctx.font = '10px sans-serif'; ctx.fillText(n.name, sp[0] + 9, sp[1] - 7);
        ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(sp[0] - 6, sp[1] - 6); ctx.lineTo(sp[0] + 6, sp[1] + 6); ctx.moveTo(sp[0] + 6, sp[1] - 6); ctx.lineTo(sp[0] - 6, sp[1] + 6); ctx.stroke();
        const follow = MF.Model.getLayer(c, n.s.follow); const meta = d.params.find((m) => m.key === 'center');
        VP.H({ x: sp[0], y: sp[1], r: 9, cursor: 'move', prio: 1, node: n, tip: '场 “' + n.name + '” 中心：拖动移动（半径 ' + Math.round(inf.radius) + '）', drag: MF.Tools.pointDrag('移动场中心', null, () => V(n.p.center, t), (v) => App.setProp(n.p.center, meta, v), true, follow ? Sc.worldMatrix(c, follow, t) : null) });
      }
    },
    fieldRelevant(c, n) { const sel = App.sel.layers; if (!sel.length) return false; for (const id of sel) { const ups = MF.Nodes.upstreamOfLayer(c, id); if (ups.indexOf(n) >= 0) return true; } return false; },
    // 粒子：点发射器位置、力的范围
    drawParticleRig(c, L) {
      const ctx = VP.ctx, t = App.time;
      L.ps.emitters.forEach((e, i) => { if (e.s.type !== 'point') return; const p = V(e.p.position, t), sp = VP.w2s(p, true); if (!sp) return; ctx.strokeStyle = COL.path; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(sp[0], sp[1], 6, 0, 6.2832); ctx.moveTo(sp[0], sp[1] - 10); ctx.lineTo(sp[0], sp[1] + 10); ctx.moveTo(sp[0] - 10, sp[1]); ctx.lineTo(sp[0] + 10, sp[1]); ctx.stroke(); const d = MF.V3.norm(V(e.p.direction, t)); const q = VP.w2s(MF.V3.add(p, MF.V3.mul(d, 80)), true); if (q) { ctx.setLineDash([3, 3]); VP.line(ctx, sp, q); ctx.setLineDash([]); VP.dot(ctx, q, 2.5, COL.path); } VP.H({ x: sp[0], y: sp[1], r: 9, cursor: 'move', tip: e.name + '：拖动移动发射点', drag: MF.Tools.pointDrag('移动发射器', null, () => V(e.p.position, t), (v) => App.setProp(e.p.position, MF.Schema.emitter[0], v), true) }); void i; });
      for (const f of L.ps.forces) { const p = V(f.p.position, t), sp = VP.w2s(p, true); if (!sp) continue; VP.ring(p, V(f.p.radius, t), 'rgba(255,154,82,.5)', [4, 4]); VP.dot(VP.ctx, sp, 4, f.s.kind === 'repel' ? '#ff5a5a' : '#7fd17f', '#000'); VP.H({ x: sp[0], y: sp[1], r: 9, cursor: 'move', tip: f.name + '（' + (f.s.kind === 'repel' ? '排斥' : '吸引') + '）', drag: MF.Tools.pointDrag('移动力', null, () => V(f.p.position, t), (v) => App.setProp(f.p.position, MF.Schema.force[0], v), true) }); }
      if (L.ps.s.floor) { const y = +L.ps.s.floorY; const a = VP.w2s([0, y, 0], true), b = VP.w2s([c.w, y, 0], true); VP.ctx.strokeStyle = 'rgba(255,154,82,.5)'; VP.ctx.setLineDash([6, 4]); VP.line(VP.ctx, a, b); VP.ctx.setLineDash([]); }
    },
    // 选中节点的结果：网格线框、图钉
    drawNodeSel(c) {
      const ctx = VP.ctx, t = App.time, N = MF.Nodes; if (!App.sel.nodes.length) return;
      for (const id of App.sel.nodes) {
        const n = N.findDeep(c, id); if (!n) continue; const nctx = N.ctxOf(c, id); const ports = N.ports(n); const gp = ports.outs.find((o) => o.type === 'geo'); if (!gp) continue;
        const g = N.out(nctx, n, gp.key, t); if (!g) continue;
        if (g.type === 'mesh2' || g.type === 'path') {
          // 用三个样本点求下游映射的仿射近似
          const cs = g.type === 'path' ? g.contours : null; const bb = g.type === 'mesh2' ? bboxV(g.verts) : MF.Path.bbox(cs); const o = [bb[0], bb[1], 0], ex = [bb[2], bb[1], 0], ey = [bb[0], bb[3], 0];
          const w = Math.max(1e-6, bb[2] - bb[0]), hh = Math.max(1e-6, bb[3] - bb[1]);
          const mo = N.mapDownstream(c, n, o, t), mx = N.mapDownstream(c, n, ex, t), my = N.mapDownstream(c, n, ey, t); const is3 = true;
          const map = (x, y) => { const u = (x - bb[0]) / w, v = (y - bb[1]) / hh; return VP.w2s([mo.p[0] + (mx.p[0] - mo.p[0]) * u + (my.p[0] - mo.p[0]) * v, mo.p[1] + (mx.p[1] - mo.p[1]) * u + (my.p[1] - mo.p[1]) * v, mo.p[2] + (mx.p[2] - mo.p[2]) * u + (my.p[2] - mo.p[2]) * v], is3); };
          ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(88,199,224,.55)';
          if (g.type === 'mesh2') { const vs = []; for (let i = 0; i < g.verts.length; i += 2) vs.push(map(g.verts[i], g.verts[i + 1])); ctx.beginPath(); const T = g.tris; const lim = Math.min(T.length, 36000); for (let i = 0; i < lim; i += 3) { const a = vs[T[i]], b = vs[T[i + 1]], d = vs[T[i + 2]]; if (!a || !b || !d) continue; ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); } ctx.stroke(); }
          else { ctx.lineWidth = 1.2; ctx.strokeStyle = COL.sel; for (const ct of cs) { ctx.beginPath(); let st = false; for (let i = 0; i < ct.pts.length; i += 2) { const p = map(ct.pts[i], ct.pts[i + 1]); if (!p) continue; if (!st) { ctx.moveTo(p[0], p[1]); st = true; } else ctx.lineTo(p[0], p[1]); } if (ct.closed !== false) ctx.closePath(); ctx.stroke(); } }
        } else if (g.type === 'mesh3') {
          const term = null; void term; const p = g.pos, T = g.idx; ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(88,199,224,.4)'; ctx.beginPath(); const step = Math.max(1, Math.floor(T.length / 3 / 9000)); const cache = new Map(); const sp = (i) => { let s = cache.get(i); if (s === undefined) { s = VP.w2s([p[i * 3], p[i * 3 + 1], p[i * 3 + 2]], true); cache.set(i, s); } return s; };
          for (let i = 0; i < T.length; i += 3 * step) { const a = sp(T[i]), b = sp(T[i + 1]), d = sp(T[i + 2]); if (!a || !b || !d) continue; ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); } ctx.stroke();
        } else if (g.type === 'points') { ctx.fillStyle = COL.sel; for (let i = 0; i < g.pos.length; i += 3) { const s = VP.w2s([g.pos[i], g.pos[i + 1], g.pos[i + 2]], true); if (s) ctx.fillRect(s[0] - 1.5, s[1] - 1.5, 3, 3); } }
        // 图钉
        if (n.pins) n.pins.forEach((pin) => {
          const pos = V(pin.p.pos, t); const m = N.mapDownstream(c, n, [pos[0], pos[1], 0], t); const sp = VP.w2s(m.p, true); if (!sp) return; const rest = N.mapDownstream(c, n, [pin.rest[0], pin.rest[1], 0], t), sr = VP.w2s(rest.p, true);
          const isSel = App.sel.pin === pin.id; if (sr) { ctx.strokeStyle = 'rgba(255,210,63,.45)'; ctx.setLineDash([2, 3]); VP.line(ctx, sr, sp); ctx.setLineDash([]); VP.dot(ctx, sr, 2, 'rgba(255,210,63,.5)'); }
          ctx.lineWidth = 1.5; VP.dot(ctx, sp, isSel ? 7 : 5.5, COL.pin, isSel ? '#fff' : '#3a2c00'); VP.dot(ctx, sp, 1.6, '#3a2c00');
          const rot = V(pin.p.rot, t); if (isSel || Math.abs(rot) > 0.01) { const a = rot * MF.DEG; ctx.strokeStyle = COL.pin; VP.line(ctx, sp, [sp[0] + Math.cos(a) * 16, sp[1] + Math.sin(a) * 16]); }
          ctx.font = '10px sans-serif'; ctx.fillStyle = COL.pin; ctx.fillText(pin.name, sp[0] + 9, sp[1] - 8);
          VP.H({ x: sp[0], y: sp[1], r: 9, cursor: 'move', prio: 5, tip: pin.name + '：拖动移动（Alt 拖动旋转，Shift+Alt 缩放）', drag: MF.Tools.pinDrag(n, pin) });
        });
      }
    },
  });
  function bboxV(v) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < v.length; i += 2) { if (v[i] < x0) x0 = v[i]; if (v[i] > x1) x1 = v[i]; if (v[i + 1] < y0) y0 = v[i + 1]; if (v[i + 1] > y1) y1 = v[i + 1]; } return [x0, y0, x1, y1]; }
  VP.COL = COL;
})();
