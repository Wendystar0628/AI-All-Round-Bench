// 画布工具与直接编辑：所有拖动都用“屏幕空间求解”——给定参数→屏幕位置的正向映射，迭代求出让手柄跟随鼠标的参数
// 因此在带动画的父级、摄像机透视、视图缩放与几何变形下拖动仍然跟手
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const App = MF.App, VP = MF.Viewport, M4 = MF.M4, Sc = MF.Scene, A = MF.Anim, C = MF.Cmd;
  const V = (p, t) => MF.Eval.val(p, t === undefined ? App.time : t);
  const TRM = (k) => MF.Schema.transform.find((m) => m.key === k);

  function solve2(f, p, target) {
    let u = p[0], v = p[1]; const e = 0.25;
    for (let it = 0; it < 10; it++) {
      const s = f(u, v); if (!s) break; const rx = target[0] - s[0], ry = target[1] - s[1]; if (rx * rx + ry * ry < 1e-5) break;
      const su = f(u + e, v), sv = f(u, v + e); if (!su || !sv) break;
      const a = (su[0] - s[0]) / e, b = (sv[0] - s[0]) / e, c = (su[1] - s[1]) / e, d = (sv[1] - s[1]) / e, det = a * d - b * c; if (Math.abs(det) < 1e-12) break;
      u += (d * rx - b * ry) / det; v += (-c * rx + a * ry) / det;
    }
    return [u, v];
  }
  function solve1(f, s0, target) {
    let s = s0; const e = 0.25;
    for (let it = 0; it < 10; it++) { const p = f(s), q = f(s + e); if (!p || !q) break; const jx = (q[0] - p[0]) / e, jy = (q[1] - p[1]) / e, jj = jx * jx + jy * jy; if (jj < 1e-12) break; const d = ((target[0] - p[0]) * jx + (target[1] - p[1]) * jy) / jj; s += d; if (Math.abs(d) < 1e-5) break; }
    return s;
  }
  // 用覆盖值计算图层局部矩阵（不修改模型）
  function localWith(L, o) {
    const tr = L.tr, pos = o.position || V(tr.position), sc = o.scale || V(tr.scale), an = o.anchor || V(tr.anchor), rz = o.rotation === undefined ? V(tr.rotation) : o.rotation;
    if (!L.is3D) return M4.compose([pos[0], pos[1], 0], [0, 0, rz], [sc[0] / 100, sc[1] / 100, 1], [an[0], an[1], 0]);
    return M4.compose([pos[0], pos[1], pos[2] || 0], [V(tr.rotX), V(tr.rotY), rz], [sc[0] / 100, sc[1] / 100, (sc[2] === undefined ? 100 : sc[2]) / 100], an);
  }
  function worldWith(L, o) { return M4.mul(Sc.parentMatrix(App.comp(), L, App.time), localWith(L, o)); }
  const setTr = (L, key, v) => App.setProp(L.tr[key], TRM(key), v);

  const T = (MF.Tools = {
    solve2, solve1, draft: null, marquee: null, penState: null,
    mouseOf(e) { const r = VP.ov.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; },
    handleAt(m) { let best = null, bd = Infinity; for (const hd of VP.handles) { const d = Math.hypot(hd.x - m[0], hd.y - m[1]); const r = hd.r || 6; if (d <= r) { const score = d - (hd.prio || 0) * 100; if (score < bd) { bd = score; best = hd; } } } return best; },
    setTool(t) { if (App.tool === 'pen' && t !== 'pen') T.penState = null; App.tool = t; T.draft = null; App.emit('tool'); VP.ov.style.cursor = { hand: 'grab', zoom: 'zoom-in', pen: 'crosshair', rect: 'crosshair', ellipse: 'crosshair', star: 'crosshair', text: 'text', pin: 'crosshair', camera: 'move' }[t] || 'default'; },
    // ---------- 指针事件 ----------
    down(e) {
      VP.ov.focus(); const m = T.mouseOf(e); VP.mouse = m; MF.W.hideTip(); const c = App.comp(); if (!c) return;
      try { VP.ov.setPointerCapture(e.pointerId); } catch (x) { /* 忽略 */ }
      if (e.button === 1 || VP.space || App.tool === 'hand') { T.start({ pan: true, m0: m, v0: Object.assign({}, App.view) }); return; }
      if (e.button === 2) return;
      if (App.tool === 'zoom') { VP.zoomAt(m[0], m[1], e.altKey ? 0.6 : 1.6); return; }
      if (App.tool === 'camera') { T.start(T.cameraDrag(m, e.shiftKey ? 'pan' : e.altKey ? 'dolly' : 'orbit')); return; }
      const hd = T.handleAt(m);
      if (hd && App.tool !== 'rect' && App.tool !== 'ellipse' && App.tool !== 'star' && App.tool !== 'text') {
        if (hd.layer && !App.sel.layers.includes(hd.layer.id)) App.selectLayers([hd.layer.id]);
        if (hd.node && !App.sel.nodes.includes(hd.node.id)) App.selectNodes([hd.node.id]);
        const d = hd.drag; if (d) { if (d.click && d.click(e, m) === true) { App.dirty = true; return; } T.start(Object.assign({ m0: m, handle: hd }, d), e); return; }
      }
      const tool = App.tool;
      if (tool === 'rect' || tool === 'ellipse' || tool === 'star') { T.draft = { kind: tool, a: m, b: m }; T.start({ m0: m, move: (mm) => { T.draft.b = mm; App.dirty = true; }, end: () => { const d = T.draft; T.draft = null; T.commitShape(d); } }); return; }
      if (tool === 'pen') { T.penDown(m, e); return; }
      if (tool === 'text') { T.addText(m); return; }
      if (tool === 'pin') { T.addPinAt(m); return; }
      // 选择/旋转/锚点工具：点选图层
      const hit = T.pick(m);
      if (hit) {
        const L = hit.layer;
        if (e.shiftKey || e.ctrlKey) App.toggleLayer(L.id, true); else if (!App.sel.layers.includes(L.id)) App.selectLayers([L.id]);
        if (tool === 'select' && !L.locked) T.start(Object.assign({ m0: m }, T.moveDrag()), e);
        else if (tool === 'rotate' && !L.locked) T.start(Object.assign({ m0: m }, T.rotateDrag(L)), e);
      } else {
        if (!e.shiftKey) { App.selectLayers([]); App.selectNodes([]); }
        T.marquee = [m[0], m[1], m[0], m[1]];
        T.start({ m0: m, move: (mm) => { T.marquee[2] = mm[0]; T.marquee[3] = mm[1]; App.dirty = true; }, end: () => { const q = T.marquee; T.marquee = null; if (Math.hypot(q[2] - q[0], q[3] - q[1]) > 4) T.marqueeSelect(q, e.shiftKey); App.dirty = true; } });
      }
    },
    start(d, e) { VP.drag = d; d.started = false; d.moved = false; void e; },
    move(e) {
      const m = T.mouseOf(e); VP.mouse = m; const d = VP.drag;
      if (d) {
        if (d.pan) { App.view.x = d.v0.x + m[0] - d.m0[0]; App.view.y = d.v0.y + m[1] - d.m0[1]; App.view.fit = false; App.dirty = true; return; }
        if (!d.moved && Math.hypot(m[0] - d.m0[0], m[1] - d.m0[1]) < 2.5) return;
        if (!d.moved) { d.moved = true; if (d.label) { App.beginDrag(d.label); d.txn = true; } if (d.begin) d.begin(d.m0, e); }
        if (d.move) d.move(m, e);
        if (d.txn) App.changed(); else App.dirty = true;
        return;
      }
      if (App.tool === 'pen' && T.penState) App.dirty = true;
      const hd = T.handleAt(m);
      if (hd !== VP.hover) { VP.hover = hd; VP.drawOverlay(); if (hd && hd.tip) MF.W.showTip(null, hd.tip, e.clientX, e.clientY); else MF.W.hideTip(); }
      const toolCur = { hand: 'grab', zoom: 'zoom-in', pen: 'crosshair', rect: 'crosshair', ellipse: 'crosshair', star: 'crosshair', text: 'text', pin: 'crosshair', camera: 'move' }[App.tool] || 'default';
      VP.ov.style.cursor = VP.space ? 'grab' : hd && hd.cursor && !['rect', 'ellipse', 'star', 'text'].includes(App.tool) ? hd.cursor : toolCur;
    },
    up(e) {
      const d = VP.drag; if (!d) return; VP.drag = null; try { VP.ov.releasePointerCapture(e.pointerId); } catch (x) { /* 忽略 */ }
      const m = T.mouseOf(e);
      if (d.pan) return;
      if (d.moved) { if (d.end) d.end(m, e); if (d.txn) App.endDrag(); }
      else { if (d.tap) d.tap(e, m); if (d.end && !d.label) d.end(m, e); }
      App.dirty = true;
    },
    dbl(e) { const m = T.mouseOf(e); const hit = T.pick(m); if (hit && hit.layer.type === 'precomp') App.openComp(hit.layer.src.comp); else if (hit && hit.layer.type === 'text') App.emit('focusText', hit.layer.id); },
    context(e) {
      const m = T.mouseOf(e); const hit = T.pick(m); if (hit && !App.sel.layers.includes(hit.layer.id)) App.selectLayers([hit.layer.id]);
      const has = App.sel.layers.length > 0;
      MF.W.menu(e.clientX, e.clientY, [
        { hd: has ? '图层' : '画布' },
        has ? { label: '重复', key: 'Ctrl+D', run: () => C.duplicateLayers() } : null, has ? { label: '删除', key: 'Delete', run: () => C.deleteLayers() } : null,
        has ? { label: '预合成…', key: 'Ctrl+Shift+C', run: () => MF.Shell.precomposeDialog() } : null, has ? { label: '切换三维图层', run: () => C.toggle3D() } : null, has ? '-' : null,
        { label: '新建形状图层', run: () => C.addLayer('shape') }, { label: '新建文字', run: () => C.addLayer('text') }, { label: '新建空对象', run: () => C.addLayer('null') }, '-',
        { label: '适合窗口', key: 'Shift+/', run: () => VP.fit() }, { label: '100%', run: () => VP.setZoom(1) },
      ]);
    },
    // ---------- 点选：命中可见几何上最近的表面 ----------
    pick(m) {
      const c = App.comp(); if (!c) return null; const t = App.time; const cp = VP.s2c(m); const cam = VP.cam(); const ray = Sc.ray(c, cam, cp[0], cp[1]);
      const layers = c.layers; let i = 0;
      const hit2D = (L) => { const lp = VP.s2l(L, m); return T.contentHit(c, L, lp, t) ? { layer: L, dist: 0 } : null; };
      while (i < layers.length) {
        const L = layers[i];
        if (!L.visible || L.locked || !Sc.isActive(L, t) || L.type === 'audio' || L.type === 'camera' || L.type === 'light' || L.type === 'adjust') { i++; continue; }
        if (Sc.is3DLayer(L)) { // 三维组：取射线上最近的命中
          let best = null; let j = i;
          for (; j < layers.length; j++) { const M = layers[j]; if (M.type === 'null' || M.type === 'camera' || M.type === 'light' || M.type === 'audio') continue; if (!Sc.is3DLayer(M)) break; if (!M.visible || M.locked || !Sc.isActive(M, t)) continue; const h3 = T.hit3D(c, M, ray, m, t); if (h3 && (!best || h3.dist < best.dist)) best = h3; }
          if (best) return best; i = j; continue;
        }
        const r = hit2D(L); if (r) return r; i++;
      }
      return null;
    },
    contentHit(c, L, lp, t) {
      const P = MF.Path, x = lp[0], y = lp[1];
      if (L.type === 'shape') { const sh = Sc.shape(c, L, t); for (const it of sh.items) { if (it.kind === 'fill') { if (P.pointInContours(it.contours.map((k) => ({ pts: k.pts, closed: true })), x, y)) return true; } else { const tol = it.width / 2 + 4 / App.view.scale; for (const k of it.contours) if (distToPoly(k, x, y) <= tol) return true; } } return false; }
      if (L.type === 'text') { const tx = Sc.text(c, L, t); for (const ch of tx.chars) { if (!ch.contours.length) continue; const b = P.bbox(ch.contours); if (x >= b[0] - 2 && x <= b[2] + 2 && y >= b[1] - 2 && y <= b[3] + 2) return true; } return false; }
      if (L.type === 'precomp') { const b = Sc.contentBounds(c, L, t); if (!(x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3])) return false; for (const mk of L.masks) { if (mk.mode === 'add' && !mk.inverted && !P.pointInContours(Sc.maskContours(L, mk, t), x, y)) return false; } return true; }
      if (L.type === 'null') { const b = Sc.contentBounds(c, L, t); const tol = 6 / App.view.scale; return x >= b[0] - tol && x <= b[2] + tol && y >= b[1] - tol && y <= b[3] + tol && (Math.abs(x - b[0]) < tol || Math.abs(x - b[2]) < tol || Math.abs(y - b[1]) < tol || Math.abs(y - b[3]) < tol); }
      return false;
    },
    hit3D(c, L, ray, m, t) {
      if (L.type === 'geo') {
        const mesh = MF.Nodes.layerGeo(c, L, t); if (!mesh) return null; const inv = M4.invert(Sc.worldMatrix(c, L, t)); const o = M4.tp(inv, ray.o), d = M4.td(inv, ray.d);
        const b = mesh._bb || (mesh._bb = MF.Solid.bbox(mesh)); if (!rayBox(o, d, b)) return null;
        const p = mesh.pos, T3 = mesh.idx; let best = Infinity;
        for (let i = 0; i < T3.length; i += 3) { const a = T3[i] * 3, bb = T3[i + 1] * 3, cc = T3[i + 2] * 3; const e1x = p[bb] - p[a], e1y = p[bb + 1] - p[a + 1], e1z = p[bb + 2] - p[a + 2], e2x = p[cc] - p[a], e2y = p[cc + 1] - p[a + 1], e2z = p[cc + 2] - p[a + 2]; const hx = d[1] * e2z - d[2] * e2y, hy = d[2] * e2x - d[0] * e2z, hz = d[0] * e2y - d[1] * e2x; const det = e1x * hx + e1y * hy + e1z * hz; if (det > -1e-12 && det < 1e-12) continue; const f = 1 / det; const sx = o[0] - p[a], sy = o[1] - p[a + 1], sz = o[2] - p[a + 2]; const u = f * (sx * hx + sy * hy + sz * hz); if (u < 0 || u > 1) continue; const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x; const v = f * (d[0] * qx + d[1] * qy + d[2] * qz); if (v < 0 || u + v > 1) continue; const tt = f * (e2x * qx + e2y * qy + e2z * qz); if (tt > 1e-6 && tt < best) best = tt; }
        if (!isFinite(best)) return null; const wp = M4.tp(Sc.worldMatrix(c, L, t), [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best]);
        return { layer: L, dist: MF.V3.dist(wp, ray.o) };
      }
      if (L.type === 'particles') return null;
      const lp = VP.s2l(L, m); if (!T.contentHit(c, L, lp, t)) return null; const wp = M4.tp(Sc.worldMatrix(c, L, t), lp); if (MF.V3.dot(MF.V3.sub(wp, ray.o), ray.d) <= 0) return null;
      return { layer: L, dist: MF.V3.dist(wp, ray.o) };
    },
    marqueeSelect(q, add) {
      const c = App.comp(), t = App.time; const x0 = Math.min(q[0], q[2]), x1 = Math.max(q[0], q[2]), y0 = Math.min(q[1], q[3]), y1 = Math.max(q[1], q[3]); const ids = add ? App.sel.layers.slice() : [];
      for (const L of c.layers) { if (!L.visible || L.locked || !Sc.isActive(L, t) || L.type === 'audio' || L.type === 'adjust' || L.type === 'camera' || L.type === 'light') continue; let pts;
        if (L.type === 'geo') { const mesh = MF.Nodes.layerGeo(c, L, t); if (!mesh) continue; const b = MF.Solid.bbox(mesh); pts = []; for (let i = 0; i < 8; i++) pts.push(VP.l2s(L, [b[i & 1 ? 3 : 0], b[i & 2 ? 4 : 1], b[i & 4 ? 5 : 2]])); }
        else if (L.type === 'particles') continue; else { const b = Sc.contentBounds(c, L, t); pts = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map((p) => VP.l2s(L, p)); }
        pts = pts.filter(Boolean); if (!pts.length) continue; const bx0 = Math.min(...pts.map((p) => p[0])), bx1 = Math.max(...pts.map((p) => p[0])), by0 = Math.min(...pts.map((p) => p[1])), by1 = Math.max(...pts.map((p) => p[1]));
        if (bx1 >= x0 && bx0 <= x1 && by1 >= y0 && by0 <= y1 && !ids.includes(L.id)) ids.push(L.id); }
      App.selectLayers(ids);
    },
    // ---------- 变换拖动 ----------
    moveDrag() {
      let items = [];
      return { label: '移动图层',
        begin(m0) { const c = App.comp(); const sel = App.selLayers().filter((L) => !L.locked && L.type !== 'audio'); const ids = new Set(sel.map((l) => l.id)); items = sel.filter((L) => !(L.parent && ids.has(L.parent))).map((L) => { const pos = V(L.tr.position).slice(); const s = VP.p2s(L, pos); return { L, pos, off: s ? [s[0] - m0[0], s[1] - m0[1]] : [0, 0] }; }); void c; },
        move(m, e) { for (const it of items) { let tgt = [m[0] + it.off[0], m[1] + it.off[1]]; if (e.shiftKey) { const s0 = VP.p2s(it.L, it.pos); if (s0) { if (Math.abs(tgt[0] - s0[0]) > Math.abs(tgt[1] - s0[1])) tgt[1] = s0[1]; else tgt[0] = s0[0]; } } const z = it.pos[2] || 0; const r = solve2((u, v) => VP.p2s(it.L, [u, v, z]), V(it.L.tr.position), tgt); setTr(it.L, 'position', [r[0], r[1], z]); } } };
    },
    scaleDrag(L, hl, axes) {
      let s0, off;
      const f = (sx, sy) => { const sc = [sx, sy, s0[2]]; const m = worldWith(L, { scale: sc }); return VP.w2s(M4.tp(m, [hl[0], hl[1], 0]), VP.uses3D(L)); };
      return { label: '缩放图层', begin(m0) { s0 = V(L.tr.scale).slice(); if (s0.length < 3) s0[2] = 100; const p = f(s0[0], s0[1]); off = p ? [p[0] - m0[0], p[1] - m0[1]] : [0, 0]; },
        move(m, e) { const tgt = [m[0] + off[0], m[1] + off[1]]; let sx = s0[0], sy = s0[1];
          if (axes === 'x') sx = solve1((s) => f(s, s0[1]), s0[0], tgt); else if (axes === 'y') sy = solve1((s) => f(s0[0], s), s0[1], tgt);
          else if (e.shiftKey) { const k = solve1((s) => f(s0[0] * s, s0[1] * s), 1, tgt); sx = s0[0] * k; sy = s0[1] * k; } else { const r = solve2(f, [s0[0], s0[1]], tgt); sx = r[0]; sy = r[1]; }
          setTr(L, 'scale', [sx, sy, L.is3D && e.shiftKey ? s0[2] * (sx / (s0[0] || 1)) : s0[2]]); } };
    },
    rotateDrag(L) {
      let r0, a0, ap;
      return { label: '旋转图层', begin(m0) { r0 = V(L.tr.rotation); ap = VP.l2s(L, V(L.tr.anchor)) || [0, 0]; a0 = Math.atan2(m0[1] - ap[1], m0[0] - ap[0]); },
        move(m, e) { let d = (Math.atan2(m[1] - ap[1], m[0] - ap[0]) - a0) / MF.DEG; d -= Math.round(d / 360) * 360; let r = r0 + d; if (e.shiftKey) r = Math.round(r / 15) * 15; setTr(L, 'rotation', r); } };
    },
    anchorDrag(L) {
      let W0, L0, inv;
      return { label: '移动锚点', begin() { const c = App.comp(); W0 = Sc.worldMatrix(c, L, App.time); L0 = Sc.localMatrix(c, L, App.time); inv = M4.invert(W0); },
        move(m) { // 在拖动开始时的图层平面内找到鼠标下的点，作为新锚点；同时补偿位置，画面不动
          const c = App.comp(); const cp = VP.s2c(m); let a;
          if (!VP.uses3D(L)) a = M4.tp(inv, [cp[0], cp[1], 0]);
          else { const ray = Sc.ray(c, VP.cam(), cp[0], cp[1]); const o = M4.tp(inv, ray.o), d = M4.td(inv, ray.d); const z = V(L.tr.anchor)[2] || 0; const k = Math.abs(d[2]) < 1e-9 ? 0 : (z - o[2]) / d[2]; a = [o[0] + d[0] * k, o[1] + d[1] * k, z]; }
          const pos = M4.tp(L0, a); setTr(L, 'anchor', [a[0], a[1], a[2] || 0]); setTr(L, 'position', [pos[0], pos[1], L.is3D ? pos[2] : 0]); } };
    },
    axisDrag(L, i) {
      let p0, off;
      const f = (s) => { const p = p0.slice(); p[i] += s; return VP.p2s(L, p); };
      return { label: '沿轴移动', begin(m0) { const v = V(L.tr.position); p0 = [v[0], v[1], v[2] || 0]; const cam = VP.cam(); const wp = M4.tp(Sc.parentMatrix(App.comp(), L, App.time), p0); const pr = Sc.project(App.comp(), cam, wp); const len = pr ? (70 / App.view.scale) * (pr[2] / cam.zoom) : 100; const tip = f(len); off = tip ? [tip[0] - m0[0], tip[1] - m0[1]] : [0, 0]; this.len = len; },
        move(m) { const s = solve1((x) => f(x + this.len), 0, [m[0] + off[0], m[1] + off[1]]); const p = p0.slice(); p[i] += s; setTr(L, 'position', p); } };
    },
    // 通用三维点拖动：在与摄像机平行的平面内移动（mat 为该点所在空间 → 世界）
    pointDrag(label, L, get, set, is3D, mat) {
      let p0, R, D, off, M;
      const f = (u, v) => VP.w2s(M4.tp(M, [p0[0] + R[0] * u + D[0] * v, p0[1] + R[1] * u + D[1] * v, p0[2] + R[2] * u + D[2] * v]), true);
      return { label, begin(m0) { const c = App.comp(); M = mat || (L ? Sc.parentMatrix(c, L, App.time) : M4.ident()); const inv = M4.invert(M); const cam = VP.cam(); const v = get(); p0 = [v[0], v[1], v[2] || 0]; R = M4.td(inv, [cam.world[0], cam.world[1], cam.world[2]]); D = M4.td(inv, [cam.world[4], cam.world[5], cam.world[6]]); const s = f(0, 0); off = s ? [s[0] - m0[0], s[1] - m0[1]] : [0, 0]; },
        move(m) { const r = solve2(f, [0, 0], [m[0] + off[0], m[1] + off[1]]); set([p0[0] + R[0] * r[0] + D[0] * r[1], p0[1] + R[1] * r[0] + D[1] * r[1], p0[2] + R[2] * r[0] + D[2] * r[1]]); } };
    },
    // ---------- 运动路径 ----------
    motionKeyDrag(L, i) {
      const prop = L.tr.position, pid = App.pid(L.id, 'tr.position'); let off, z;
      return { label: '移动位置关键帧',
        click(e) { if (e.altKey) { App.edit('切换空间插值', () => { const k = prop.k[i]; if (k.sl) { delete k.sl; } else { k.sl = true; delete k.to; delete k.ti; } }); App.selectKeys([{ pid, i }]); return true; } App.selectKeys([{ pid, i }], e.shiftKey); App.selectProps([pid]); return false; },
        begin(m0) { const k = prop.k[i]; z = k.v[2] || 0; const s = VP.p2s(L, k.v); off = s ? [s[0] - m0[0], s[1] - m0[1]] : [0, 0]; },
        move(m) { const k = prop.k[i]; const r = solve2((u, v) => VP.p2s(L, [u, v, z]), k.v, [m[0] + off[0], m[1] + off[1]]); k.v = [r[0], r[1], z]; } };
    },
    tangentDrag(L, i, which) {
      const prop = L.tr.position; let off;
      return { label: '调整空间手柄',
        begin(m0) { const k = prop.k[i]; const tan = which === 'to' ? A.outTan(prop.k, i, 3) : A.inTan(prop.k, i, 3); k.to = (k.to || A.outTan(prop.k, i, 3)).slice(); k.ti = (k.ti || A.inTan(prop.k, i, 3)).slice(); delete k.sl; const s = VP.p2s(L, [k.v[0] + tan[0], k.v[1] + tan[1], (k.v[2] || 0) + (tan[2] || 0)]); off = s ? [s[0] - m0[0], s[1] - m0[1]] : [0, 0]; },
        move(m, e) { const k = prop.k[i]; const tz = (k[which][2] || 0); const r = solve2((u, v) => VP.p2s(L, [k.v[0] + u, k.v[1] + v, (k.v[2] || 0) + tz]), k[which], [m[0] + off[0], m[1] + off[1]]); k[which] = [r[0], r[1], tz]; if (e.altKey) k.sc = true; if (!k.sc) { const o = which === 'to' ? 'ti' : 'to'; k[o] = [-r[0], -r[1], -tz]; } } };
    },
    // ---------- 路径节点 ----------
    editPath(e, fn) { const pv = MF.clone(V(e.prop)); if (!pv || !pv.c) return; fn(pv); const d = MF.Eval.desc(e.prop); App.setProp(e.prop, d ? d.meta : { type: 'path' }, pv); },
    pathPtDrag(L, e, ci, vi) {
      let off, start;
      return { label: '移动路径顶点',
        click(ev) {
          if (ev.altKey) { App.edit('切换尖角/平滑', () => T.editPath(e, (pv) => { const ct = pv.c[ci], v = ct.v[vi], n = ct.v.length; if (v[2] || v[3] || v[4] || v[5]) { v[2] = v[3] = v[4] = v[5] = 0; } else { const p = ct.v[(vi + n - 1) % n], q = ct.v[(vi + 1) % n]; const dx = (q[0] - p[0]) * 0.22, dy = (q[1] - p[1]) * 0.22; v[2] = -dx; v[3] = -dy; v[4] = dx; v[5] = dy; } })); App.sel.sub = { pid: e.pid, pts: [[ci, vi]] }; return true; }
          if (App.tool === 'pen' && T.penState && T.penState.pid === e.pid && vi === 0 && T.penState.ci === ci) { T.penClose(e); return true; }
          const sub = App.sel.sub && App.sel.sub.pid === e.pid ? App.sel.sub : { pid: e.pid, pts: [] }; const has = sub.pts.some((q) => q[0] === ci && q[1] === vi);
          if (ev.shiftKey) { if (has) sub.pts = sub.pts.filter((q) => !(q[0] === ci && q[1] === vi)); else sub.pts.push([ci, vi]); } else if (!has) sub.pts = [[ci, vi]];
          App.sel.sub = sub; App.selectProps([e.pid]); return false; },
        begin(m0) { const pv = V(e.prop); const v = pv.c[ci].v[vi]; const s = VP.l2s(L, v); off = s ? [s[0] - m0[0], s[1] - m0[1]] : [0, 0]; start = [v[0], v[1]]; },
        move(m) { const r = solve2((u, v) => VP.l2s(L, [u, v]), start, [m[0] + off[0], m[1] + off[1]]); T.editPath(e, (pv) => { const cur = pv.c[ci].v[vi]; const dx = r[0] - cur[0], dy = r[1] - cur[1]; const pts = App.sel.sub && App.sel.sub.pid === e.pid ? App.sel.sub.pts : [[ci, vi]]; for (const q of pts) { const vv = pv.c[q[0]] && pv.c[q[0]].v[q[1]]; if (vv) { vv[0] += dx; vv[1] += dy; } } }); } };
    },
    pathTanDrag(L, e, ci, vi, which) {
      let off;
      return { label: '调整切线', begin(m0) { const v = V(e.prop).c[ci].v[vi]; const s = VP.l2s(L, [v[0] + v[which], v[1] + v[which + 1]]); off = s ? [s[0] - m0[0], s[1] - m0[1]] : [0, 0]; },
        move(m, ev) { const v0 = V(e.prop).c[ci].v[vi]; const r = solve2((u, w) => VP.l2s(L, [v0[0] + u, v0[1] + w]), [v0[which], v0[which + 1]], [m[0] + off[0], m[1] + off[1]]); T.editPath(e, (pv) => { const v = pv.c[ci].v[vi]; v[which] = r[0]; v[which + 1] = r[1]; if (!ev.altKey) { const o = which === 2 ? 4 : 2; const l = Math.hypot(v[o], v[o + 1]), rl = Math.hypot(r[0], r[1]) || 1; if (l > 1e-6) { v[o] = (-r[0] / rl) * l; v[o + 1] = (-r[1] / rl) * l; } } }); } };
    },
    deleteSubPoints() {
      const sub = App.sel.sub; if (!sub || !sub.pts || !sub.pts.length) return false; const r = App.resolve(sub.pid); if (!r) return false;
      App.edit('删除路径顶点', () => T.editPath({ prop: r.prop }, (pv) => { const by = new Map(); for (const q of sub.pts) { if (!by.has(q[0])) by.set(q[0], []); by.get(q[0]).push(q[1]); } for (const [ci, vis] of by) { vis.sort((a, b) => b - a); for (const vi of vis) pv.c[ci].v.splice(vi, 1); } pv.c = pv.c.filter((ct) => ct.v.length >= 1); }));
      App.sel.sub = { pid: sub.pid, pts: [] }; return true;
    },
    // ---------- 图钉 ----------
    pinTarget() {
      const c = App.comp(), N = MF.Nodes; for (const id of App.sel.nodes) { const n = N.findDeep(c, id); if (n && n.pins) return n; }
      for (const L of App.selLayers()) { const ups = N.upstreamOfLayer(c, L.id); const p = ups.find((n) => n.pins); if (p) { App.selectNodes([p.id]); return p; } }
      // 自动在“挤出”之前插入图钉变形节点
      for (const L of App.selLayers()) { const ups = N.upstreamOfLayer(c, L.id); const ex = ups.find((n) => n.type === 'extrude' && n.in.geo && !Array.isArray(n.in.geo)); if (ex) { let pn; App.edit('插入图钉变形', () => { pn = N.create(App.project, 'pins', { x: ex.x - 95, y: ex.y + 90 }); pn.in.geo = ex.in.geo; ex.in.geo = { n: pn.id, p: 'geo' }; c.nodes.push(pn); }); App.selectNodes([pn.id]); App.toast('已在“挤出”前插入“图钉变形”节点'); return pn; } }
      App.toast('请先选择一个三维几何图层或“图钉变形”节点'); return null;
    },
    addPinAt(m) {
      const c = App.comp(), N = MF.Nodes; const n = T.pinTarget(); if (!n) return; const t = App.time;
      const g = N.input(N.ctxOf(c, n.id), n, 'geo', t); const m2 = N.G.mesh2(g, 24); if (!m2) { App.toast('图钉节点还没有输入网格'); return; }
      let cx = 0, cy = 0; const nv = m2.verts.length >> 1; for (let i = 0; i < nv; i++) { cx += m2.verts[i * 2]; cy += m2.verts[i * 2 + 1]; } cx /= nv || 1; cy /= nv || 1;
      // 求出鼠标位置对应的网格平面坐标（经过当前图钉变形与下游节点的正向映射）
      const cur = N.out(N.ctxOf(c, n.id), n, 'geo', t); void cur;
      const r = solve2((u, v) => VP.w2s(N.mapDownstream(c, n, [u, v, 0], t).p, true), [cx, cy], m);
      // 当前变形下的点 → 静止位置：在变形后的网格中定位三角形，取同重心坐标的静止点
      let rest = r; const defm = N.out(N.ctxOf(c, n.id), n, 'geo', t); if (defm && defm.type === 'mesh2') { const ti = MF.Tri.locate(defm, r[0], r[1]); if (ti >= 0) { const T3 = defm.tris, a = T3[ti * 3], b = T3[ti * 3 + 1], d = T3[ti * 3 + 2], dv = defm.verts, sv = m2.verts; const x1 = dv[a * 2], y1 = dv[a * 2 + 1], x2 = dv[b * 2], y2 = dv[b * 2 + 1], x3 = dv[d * 2], y3 = dv[d * 2 + 1]; const den = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3) || 1e-12; const w1 = ((y2 - y3) * (r[0] - x3) + (x3 - x2) * (r[1] - y3)) / den, w2 = ((y3 - y1) * (r[0] - x3) + (x1 - x3) * (r[1] - y3)) / den, w3 = 1 - w1 - w2; rest = [sv[a * 2] * w1 + sv[b * 2] * w2 + sv[d * 2] * w3, sv[a * 2 + 1] * w1 + sv[b * 2 + 1] * w2 + sv[d * 2 + 1] * w3]; } else { App.toast('请点在网格内部来放置图钉'); return; } }
      let pin; App.edit('添加图钉', () => { pin = N.addPin(App.project, n, rest[0], rest[1]); pin.p.pos.v = [r[0], r[1]]; }); App.sel.pin = pin.id; App.emit('selection');
    },
    pinDrag(n, pin) {
      let off, r0, s0, a0, d0, sp;
      const meta = { pos: { key: 'pos', type: 'vec2', spatial: true }, rot: { key: 'rot', type: 'num' }, scale: { key: 'scale', type: 'num' } };
      return { label: '拖动图钉', click() { App.sel.pin = pin.id; if (!App.sel.nodes.includes(n.id)) App.selectNodes([n.id]); App.emit('selection'); return false; },
        begin(m0) { const c = App.comp(); const p = V(pin.p.pos); sp = VP.w2s(MF.Nodes.mapDownstream(c, n, [p[0], p[1], 0], App.time).p, true) || m0; off = [sp[0] - m0[0], sp[1] - m0[1]]; r0 = V(pin.p.rot); s0 = V(pin.p.scale); a0 = Math.atan2(m0[1] - sp[1], m0[0] - sp[0]); d0 = Math.hypot(m0[0] - sp[0], m0[1] - sp[1]) || 1; },
        move(m, e) { const c = App.comp();
          if (e.altKey && e.shiftKey) { App.setProp(pin.p.scale, meta.scale, Math.max(1, s0 * (Math.hypot(m[0] - sp[0], m[1] - sp[1]) / d0))); return; }
          if (e.altKey) { let d = (Math.atan2(m[1] - sp[1], m[0] - sp[0]) - a0) / MF.DEG; d -= Math.round(d / 360) * 360; App.setProp(pin.p.rot, meta.rot, r0 + d); return; }
          const r = solve2((u, v) => { const o = pin.p.pos; const keep = o.k ? null : o.v; let res; if (o.k) { const i = A.keyAt(o, App.time); const old = i >= 0 ? o.k[i].v : null; A.setValue(o, App.time, [u, v], meta.pos); MF.Eval.touch(); res = VP.w2s(MF.Nodes.mapDownstream(c, n, [u, v, 0], App.time).p, true); if (old) o.k[A.keyAt(o, App.time)].v = old; } else { o.v = [u, v]; MF.Eval.touch(); res = VP.w2s(MF.Nodes.mapDownstream(c, n, [u, v, 0], App.time).p, true); o.v = keep; } return res; }, V(pin.p.pos), [m[0] + off[0], m[1] + off[1]]);
          App.setProp(pin.p.pos, meta.pos, r); } };
    },
    // ---------- 摄像机工具 ----------
    cameraDrag(m0, mode) {
      const c = App.comp(); const L = Sc.activeCamera(c, App.time); if (!L) { App.toast('当前合成没有摄像机图层：图层 > 新建 > 摄像机'); return { m0, move() {} }; }
      if (!App.sel.layers.includes(L.id)) App.selectLayers([L.id]);
      const pos0 = V(L.tr.position).slice(), poi0 = V(L.cam.p.poi).slice(); const pm = Sc.parentMatrix(c, L, App.time), inv = M4.invert(pm); const cam = VP.cam();
      const R = M4.td(inv, [cam.world[0], cam.world[1], cam.world[2]]), D = M4.td(inv, [cam.world[4], cam.world[5], cam.world[6]]), F = M4.td(inv, cam.fwd);
      return { m0, label: mode === 'orbit' ? '环绕摄像机' : mode === 'pan' ? '平移摄像机' : '推拉摄像机',
        move(m) { const dx = m[0] - m0[0], dy = m[1] - m0[1]; const rel = MF.V3.sub(pos0, poi0); const dist = MF.V3.len(rel);
          if (mode === 'orbit') { const yaw = -dx * 0.4 * MF.DEG, pitch = dy * 0.4 * MF.DEG; let v = M4.td(M4.rotY(yaw), rel); let axis = MF.V3.norm(MF.V3.cross([0, 1, 0], MF.V3.mul(v, -1))); if (MF.V3.len(MF.V3.cross([0, 1, 0], v)) < 1e-4) axis = [1, 0, 0]; v = rotAxis(v, axis, pitch); const up = Math.abs(v[1]) / (MF.V3.len(v) || 1); if (up < 0.998) setTr(L, 'position', MF.V3.add(poi0, v)); }
          else if (mode === 'pan') { const k = dist / cam.zoom / App.view.scale; const d = MF.V3.add(MF.V3.mul(R, -dx * k), MF.V3.mul(D, -dy * k)); setTr(L, 'position', MF.V3.add(pos0, d)); App.setProp(L.cam.p.poi, MF.Schema.camera[0], MF.V3.add(poi0, d)); }
          else { const k = Math.exp(dy * 0.005); setTr(L, 'position', MF.V3.add(poi0, MF.V3.mul(rel, k))); void F; } } };
    },
    dolly(amount) { const c = App.comp(); const L = Sc.activeCamera(c, App.time); if (!L) return; const pos = V(L.tr.position), poi = V(L.cam.p.poi); const rel = MF.V3.sub(pos, poi); App.edit('推拉摄像机', () => setTr(L, 'position', MF.V3.add(poi, MF.V3.mul(rel, Math.exp(-amount * 0.001))))); },
    // ---------- 形状/蒙版绘制 ----------
    drawDraft(ctx) {
      const d = T.draft; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      if (d.kind === 'rect') ctx.strokeRect(d.a[0], d.a[1], d.b[0] - d.a[0], d.b[1] - d.a[1]);
      else if (d.kind === 'ellipse') { ctx.beginPath(); ctx.ellipse((d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2, Math.abs(d.b[0] - d.a[0]) / 2, Math.abs(d.b[1] - d.a[1]) / 2, 0, 0, 6.2832); ctx.stroke(); }
      else if (d.kind === 'star') { const r = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]); ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * 6.2832, rr = i % 2 ? r * 0.42 : r; const x = d.a[0] + Math.cos(a) * rr, y = d.a[1] + Math.sin(a) * rr; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); ctx.stroke(); }
      ctx.setLineDash([]);
    },
    commitShape(d) {
      const c = App.comp(); if (Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) < 4) return; const sel = App.selLayers(); const L = sel.length === 1 ? sel[0] : null;
      const target = L && L.type === 'shape' ? 'item' : L && (L.type === 'text' || L.type === 'precomp' || L.type === 'adjust') ? 'mask' : 'new';
      const conv = (s) => (target === 'new' ? VP.s2c(s) : VP.s2l(L, s));
      const a = conv(d.a), b = conv(d.b);
      if (d.kind === 'star') { const r = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (target === 'mask') C.addMask(L, MF.Path.star(5, r, r * 0.42, 0, a[0], a[1]));
        else if (target === 'item') C.addShapeItem(L, 'star', { position: [a[0], a[1]], outer: r, inner: r * 0.42 });
        else { const S = C.addLayer('shape', { empty: true, name: '星形' }); App.edit('绘制星形', () => { S.tr.position.v = [a[0], a[1], 0]; S.items.push(MF.Model.newShapeItem(App.project, 'star', { outer: r, inner: r * 0.42 }), MF.Model.newShapeItem(App.project, 'stroke', { width: 0 }), MF.Model.newShapeItem(App.project, 'fill')); }); }
        return; }
      const w = Math.abs(b[0] - a[0]), hh = Math.abs(b[1] - a[1]), cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
      if (target === 'mask') C.addMask(L, d.kind === 'rect' ? MF.Path.rect(w, hh, 0, cx, cy) : MF.Path.ellipse(w, hh, cx, cy));
      else if (target === 'item') C.addShapeItem(L, d.kind, { size: [w, hh], position: [cx, cy] });
      else { const S = C.addLayer('shape', { empty: true, name: d.kind === 'rect' ? '矩形' : '椭圆' }); App.edit('绘制形状', () => { S.tr.position.v = [cx, cy, 0]; S.items.push(MF.Model.newShapeItem(App.project, d.kind, { size: [w, hh] }), MF.Model.newShapeItem(App.project, 'stroke', { width: 0 }), MF.Model.newShapeItem(App.project, 'fill')); }); }
    },
    addText(m) { const p = VP.s2c(m); const L = C.addLayer('text', { str: '文字' }); if (!L) return; App.edit('放置文字', () => { L.tr.position.v = [p[0], p[1], 0]; }); T.setTool('select'); App.emit('focusText', L.id); },
    // 钢笔：单击加点，拖动拉出切线，点回起点闭合
    penDown(m, e) {
      const c = App.comp(); let st = T.penState; let L = st ? MF.Model.getLayer(c, st.layer) : null; let r = st ? App.resolve(st.pid) : null;
      if (!st || !L || !r) {
        const sel = App.selLayers(); L = sel.length === 1 ? sel[0] : null;
        if (L && L.type === 'shape') { const it = C.addShapeItem(L, 'path'); st = { layer: L.id, pid: App.pid(L.id, 'it.' + it.id + '.path'), ci: 0 }; }
        else if (L && (L.type === 'text' || L.type === 'precomp' || L.type === 'adjust')) { const mk = C.addMask(L, { c: [] }); st = { layer: L.id, pid: App.pid(L.id, 'mask.' + mk.id + '.path'), ci: 0 }; }
        else { L = C.addLayer('shape', { empty: true, name: '形状路径' }); let it; App.edit('新建路径', () => { L.tr.position.v = [0, 0, 0]; it = MF.Model.newShapeItem(App.project, 'path'); L.items.push(it, MF.Model.newShapeItem(App.project, 'stroke', { width: 4, color: [1, 1, 1, 1] }), MF.Model.newShapeItem(App.project, 'fill', { opacity: 100 })); }); st = { layer: L.id, pid: App.pid(L.id, 'it.' + it.id + '.path'), ci: 0 }; }
        T.penState = st; r = App.resolve(st.pid);
      }
      const lp = VP.s2l(L, m); const e2 = { prop: r.prop, pid: st.pid };
      App.beginDrag('添加路径顶点');
      T.editPath(e2, (pv) => { if (!pv.c[st.ci]) pv.c[st.ci] = { closed: false, v: [] }; pv.c[st.ci].v.push([lp[0], lp[1], 0, 0, 0, 0]); });
      const vi = V(r.prop).c[st.ci].v.length - 1; App.sel.sub = { pid: st.pid, pts: [[st.ci, vi]] }; App.selectProps([st.pid]); App.changed();
      VP.drag = { m0: m, moved: true, txn: true, move(mm) { const q = VP.s2l(L, mm); T.editPath(e2, (pv) => { const v = pv.c[st.ci].v[vi]; v[4] = q[0] - v[0]; v[5] = q[1] - v[1]; v[2] = -v[4]; v[3] = -v[5]; }); }, end() {} };
      void e;
    },
    penClose(e) { App.edit('闭合路径', () => T.editPath(e, (pv) => { const ct = pv.c[T.penState.ci]; if (ct && ct.v.length >= 3) ct.closed = true; })); T.penState = null; App.toast('路径已闭合'); },
    penFinish() { if (T.penState) { T.penState = null; App.dirty = true; } },
  });
  function distToPoly(c, x, y) { const p = c.pts, n = p.length >> 1; let best = Infinity; const m = c.closed === false ? n - 1 : n; for (let i = 0; i < m; i++) { const j = (i + 1) % n; const ax = p[i * 2], ay = p[i * 2 + 1], bx = p[j * 2], by = p[j * 2 + 1]; const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0; t = MF.clamp(t, 0, 1); const d = Math.hypot(x - ax - dx * t, y - ay - dy * t); if (d < best) best = d; } return best; }
  function rayBox(o, d, b) { let t0 = -Infinity, t1 = Infinity; for (let i = 0; i < 3; i++) { if (Math.abs(d[i]) < 1e-12) { if (o[i] < b[i] - 1 || o[i] > b[i + 3] + 1) return false; continue; } let a = (b[i] - 1 - o[i]) / d[i], c = (b[i + 3] + 1 - o[i]) / d[i]; if (a > c) { const x = a; a = c; c = x; } t0 = Math.max(t0, a); t1 = Math.min(t1, c); } return t1 >= Math.max(t0, 0); }
  function rotAxis(v, k, a) { const c = Math.cos(a), s = Math.sin(a); const kv = MF.V3.cross(k, v), kd = MF.V3.dot(k, v); return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)]; }
})();
