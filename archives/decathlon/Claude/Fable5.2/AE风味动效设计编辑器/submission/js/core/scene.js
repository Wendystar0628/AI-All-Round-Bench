// 场景求值：图层变换与父级、摄像机与灯光、形状内容（修剪/重复器/布尔可调顺序）、文字排版与动画器、蒙版
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const M4 = MF.M4, P = MF.Path, V = (p, t) => MF.Eval.val(p, t);
  const tk = (t) => Math.round(t * 100000);

  const Scene = (MF.Scene = {
    _memo: new Map(), _memoRev: 0,
    memo(key, t, fn) {
      if (Scene._memoRev !== MF.Eval.rev) { Scene._memo.clear(); Scene._memoRev = MF.Eval.rev; }
      const k = key + '@' + tk(t); let v = Scene._memo.get(k);
      if (v === undefined) { v = fn(); if (Scene._memo.size > 30000) Scene._memo.clear(); Scene._memo.set(k, v); }
      return v;
    },
    // ---------- 变换 ----------
    localMatrix(comp, L, t) {
      return Scene.memo('lm' + L.id, t, () => {
        const tr = L.tr; const pos = V(tr.position, t);
        if (L.type === 'camera') return M4.lookAt([pos[0], pos[1], pos[2] || 0], V(L.cam.p.poi, t), V(tr.rotation, t));
        if (L.type === 'light') return M4.trans(pos[0], pos[1], pos[2] || 0);
        const sc = V(tr.scale, t), an = V(tr.anchor, t), rz = V(tr.rotation, t);
        if (!L.is3D) return M4.compose([pos[0], pos[1], 0], [0, 0, rz], [sc[0] / 100, sc[1] / 100, 1], [an[0], an[1], 0]);
        return M4.compose([pos[0], pos[1], pos[2] || 0], [V(tr.rotX, t), V(tr.rotY, t), rz], [sc[0] / 100, sc[1] / 100, (sc[2] === undefined ? 100 : sc[2]) / 100], an);
      });
    },
    parentMatrix(comp, L, t, depth) {
      const p = L.parent ? MF.Model.getLayer(comp, L.parent) : null;
      if (!p || (depth || 0) > 32) return M4.ident();
      return Scene.worldMatrix(comp, p, t, (depth || 0) + 1);
    },
    worldMatrix(comp, L, t, depth) {
      return Scene.memo('wm' + L.id, t, () => {
        const p = L.parent ? MF.Model.getLayer(comp, L.parent) : null;
        const lm = Scene.localMatrix(comp, L, t);
        if (!p || (depth || 0) > 32) return lm;
        return M4.mul(Scene.worldMatrix(comp, p, t, (depth || 0) + 1), lm);
      });
    },
    wouldCycle(comp, L, parentId) { let p = MF.Model.getLayer(comp, parentId), g = 0; while (p && g++ < 64) { if (p.id === L.id) return true; p = MF.Model.getLayer(comp, p.parent); } return false; },
    // 设定/更换/解除父级并保持当前画面
    setParentKeep(comp, L, parentId, t) {
      if (parentId && Scene.wouldCycle(comp, L, parentId)) return false;
      const world = Scene.worldMatrix(comp, L, t);
      const oldPM = Scene.parentMatrix(comp, L, t);
      L.parent = parentId || null; MF.Eval.touch();
      const newPM = Scene.parentMatrix(comp, L, t);
      const conv = M4.mul(M4.invert(newPM), oldPM); // 旧父空间 → 新父空间
      const tr = L.tr;
      if (L.type === 'camera' || L.type === 'light') {
        mapKeys(tr.position, (v) => M4.tp(conv, v), (d) => M4.td(conv, d));
        const poi = L.type === 'camera' ? L.cam.p.poi : L.light.p.poi; mapKeys(poi, (v) => M4.tp(conv, v), (d) => M4.td(conv, d));
        MF.Eval.touch(); return true;
      }
      const dConv = M4.decompose(conv);
      // 当前时刻的新局部矩阵
      const local = M4.mul(M4.invert(newPM), world);
      const an = V(tr.anchor, t);
      const withAnchor = M4.mul(local, M4.trans(an[0], an[1], an[2] || 0));
      const dl = M4.decompose(withAnchor);
      const curRot = [L.is3D ? V(tr.rotX, t) : 0, L.is3D ? V(tr.rotY, t) : 0, V(tr.rotation, t)], curSc = V(tr.scale, t);
      mapKeys(tr.position, (v) => M4.tp(conv, [v[0], v[1], L.is3D ? v[2] || 0 : 0]), (d) => M4.td(conv, [d[0], d[1], d[2] || 0]));
      const near = (a, ref) => { let d = a - ref; d -= Math.round(d / 360) * 360; return ref + d; };
      const dz = near(dl.rot[2], curRot[2]) - curRot[2]; offsetKeys(tr.rotation, dz);
      if (L.is3D) { offsetKeys(tr.rotX, near(dl.rot[0], curRot[0]) - curRot[0]); offsetKeys(tr.rotY, near(dl.rot[1], curRot[1]) - curRot[1]); }
      const fs = [dl.scale[0] * 100 / (curSc[0] || 1e-9), dl.scale[1] * 100 / (curSc[1] || 1e-9), dl.scale[2] * 100 / ((curSc[2] === undefined ? 100 : curSc[2]) || 1e-9)];
      mapKeys(tr.scale, (v) => [v[0] * fs[0], v[1] * fs[1], (v[2] === undefined ? 100 : v[2]) * (L.is3D ? fs[2] : 1)]);
      MF.Eval.touch();
      // 位置在非均匀情形下以当前时刻精确对齐
      const fix = M4.mul(M4.invert(Scene.parentMatrix(comp, L, t)), world), cur = Scene.localMatrix(comp, L, t);
      const pw = M4.tp(fix, an), pc = M4.tp(cur, an), dd = [pw[0] - pc[0], pw[1] - pc[1], pw[2] - pc[2]];
      if (Math.hypot(dd[0], dd[1], dd[2]) > 1e-6) mapKeys(tr.position, (v) => [v[0] + dd[0], v[1] + dd[1], (v[2] || 0) + (L.is3D ? dd[2] : 0)]);
      MF.Eval.touch();
      return true;
    },
    // ---------- 摄像机 ----------
    activeCamera(comp, t) { for (const L of comp.layers) if (L.type === 'camera' && L.visible && t >= L.in - 1e-9 && t < L.out) return L; return null; },
    cameraInfo(comp, t) {
      return Scene.memo('cam' + comp.id, t, () => {
        const L = Scene.activeCamera(comp, t);
        let world, fov = 39.6, focus = 0, aperture = 0;
        if (L) { world = Scene.worldMatrix(comp, L, t); fov = MF.clamp(V(L.cam.p.fov, t), 1, 170); focus = V(L.cam.p.focus, t); aperture = Math.max(0, V(L.cam.p.aperture, t)); }
        const zoom = comp.w / 2 / Math.tan((fov * MF.DEG) / 2);
        if (!L) world = M4.lookAt([comp.w / 2, comp.h / 2, -zoom], [comp.w / 2, comp.h / 2, 0], 0);
        // 去除父级缩放带来的轴缩放
        const w = new Float64Array(world);
        for (let c = 0; c < 3; c++) { const l = Math.hypot(w[c * 4], w[c * 4 + 1], w[c * 4 + 2]) || 1; w[c * 4] /= l; w[c * 4 + 1] /= l; w[c * 4 + 2] /= l; }
        const view = M4.invert(w);
        const pos = [w[12], w[13], w[14]];
        const near = Math.max(2, zoom * 0.02), far = Math.max(zoom * 40, 40000);
        const proj = new Float64Array(16);
        proj[0] = (2 * zoom) / comp.w; proj[5] = (2 * zoom) / comp.h; proj[10] = (far + near) / (far - near); proj[11] = 1; proj[14] = (-2 * far * near) / (far - near);
        return { layer: L, world: w, view, proj, vp: M4.mul(proj, view), pos, zoom, fov, focus: focus || zoom, aperture, near, far, fwd: [w[8], w[9], w[10]] };
      });
    },
    // 世界点 → 合成像素坐标 [x, y, 视深]
    project(comp, cam, p) {
      const c = M4.tp4(cam.vp, p); const w = c[3];
      if (w <= 1e-6) return null;
      return [(c[0] / w + 1) * comp.w / 2, (c[1] / w + 1) * comp.h / 2, w];
    },
    // 合成像素 → 世界射线
    ray(comp, cam, x, y) {
      const dx = (x - comp.w / 2) / cam.zoom, dy = (y - comp.h / 2) / cam.zoom;
      const d = M4.td(cam.world, [dx, dy, 1]);
      return { o: cam.pos.slice(), d: MF.V3.norm(d) };
    },
    lights(comp, t) {
      return Scene.memo('lights' + comp.id, t, () => {
        const out = [];
        for (const L of comp.layers) {
          if (L.type !== 'light' || !L.visible || t < L.in - 1e-9 || t >= L.out) continue;
          const wm = Scene.worldMatrix(comp, L, t), pm = Scene.parentMatrix(comp, L, t);
          const pos = [wm[12], wm[13], wm[14]], poi = M4.tp(pm, V(L.light.p.poi, t));
          const c = V(L.light.p.color, t);
          out.push({ layer: L, kind: L.light.s.kind, color: [c[0], c[1], c[2]], intensity: V(L.light.p.intensity, t) / 100, pos, poi, dir: MF.V3.norm(MF.V3.sub(poi, pos)), range: V(L.light.p.range, t), shadows: !!L.light.s.shadows, shadowDark: V(L.light.p.shadowDark, t) / 100, shadowSoft: V(L.light.p.shadowSoft, t) });
        }
        return out;
      });
    },
    is3DLayer(L) { return L.type === 'geo' || L.type === 'particles' || (L.is3D && (L.type === 'shape' || L.type === 'text' || L.type === 'precomp')); },
    isActive(L, t) { return L.visible && t >= L.in - 1e-9 && t < L.out - 1e-9; },

    // ---------- 形状内容 ----------
    // 返回 { items:[{kind:'fill'|'stroke', contours, color, opacity, rule, width, cap, join}], paths:[{pts,closed,g}] }
    shape(comp, L, t) {
      return Scene.memo('shape' + L.id, t, () => {
        let paths = [], rendered = []; let gid = 0;
        for (const it of L.items) {
          if (it.on === false) continue;
          const p = it.p, ty = it.type;
          if (ty === 'rect') { const s = V(p.size, t), o = V(p.position, t); for (const c of P.flattenValue(P.rect(s[0], s[1], V(p.roundness, t), o[0], o[1]), 0.15)) { c.g = gid; paths.push(c); } gid++; }
          else if (ty === 'ellipse') { const s = V(p.size, t), o = V(p.position, t); for (const c of P.flattenValue(P.ellipse(s[0], s[1], o[0], o[1]), 0.1)) { c.g = gid; paths.push(c); } gid++; }
          else if (ty === 'star') { const o = V(p.position, t); for (const c of P.flattenValue(P.star(V(p.points, t), V(p.outer, t), V(p.inner, t), V(p.rotation, t), o[0], o[1], it.s.kind === 'polygon'))) { c.g = gid; paths.push(c); } gid++; }
          else if (ty === 'path') { for (const c of P.flat(V(p.path, t), 0.15)) { paths.push({ pts: c.pts, closed: c.closed, g: gid }); } gid++; }
          else if (ty === 'trim') { const g0 = paths.length ? paths[0].g : 0; paths = P.trim(paths, V(p.start, t) / 100, V(p.end, t) / 100, V(p.offset, t) / 360, it.s.mode); paths.forEach((c) => { if (c.g === undefined) c.g = g0; }); }
          else if (ty === 'offset') { const g0 = gid++; paths = P.offset(closeAll(paths), V(p.amount, t), it.s.join); paths.forEach((c) => (c.g = g0)); }
          else if (ty === 'merge') { paths = Scene.mergePaths(paths, it.s.mode); const g0 = gid++; paths.forEach((c) => (c.g = g0)); }
          else if (ty === 'fill') { const c = V(p.color, t); rendered.push({ kind: 'fill', contours: paths.slice(), color: c, opacity: V(p.opacity, t) / 100, rule: it.s.rule }); }
          else if (ty === 'stroke') { const c = V(p.color, t); rendered.push({ kind: 'stroke', contours: paths.slice(), color: c, opacity: V(p.opacity, t) / 100, width: V(p.width, t), cap: it.s.cap, join: it.s.join }); }
          else if (ty === 'repeater') {
            const n = Math.max(0, Math.min(400, Math.round(V(p.copies, t)))), off = V(p.offset, t), an = V(p.anchor, t), ps = V(p.position, t), sc = V(p.scale, t), rot = V(p.rotation, t), o0 = V(p.startOpacity, t) / 100, o1 = V(p.endOpacity, t) / 100;
            const np = [], nr = [];
            for (let i = 0; i < n; i++) {
              const k = i + off;
              const m = P.affine([an[0] + ps[0] * k, an[1] + ps[1] * k], rot * k, [Math.pow(Math.abs(sc[0]) / 100, k) * (sc[0] < 0 && Math.round(k) % 2 ? -1 : 1), Math.pow(Math.abs(sc[1]) / 100, k) * (sc[1] < 0 && Math.round(k) % 2 ? -1 : 1)], an);
              const op = n > 1 ? o0 + ((o1 - o0) * i) / (n - 1) : o0;
              const base = gid; let maxg = 0;
              for (const c of P.xf(paths, m)) { c.g = base + (c.g || 0); maxg = Math.max(maxg, (c.g - base)); np.push(c); }
              gid = base + maxg + 1;
              for (const r of rendered) nr.push(Object.assign({}, r, { contours: P.xf(r.contours, m), opacity: r.opacity * op }));
            }
            paths = np; rendered = nr;
          }
        }
        return { items: rendered, paths };
      });
    },
    mergePaths(paths, mode) {
      if (!paths.length) return paths;
      const groups = new Map(); for (const c of paths) { const g = c.g || 0; if (!groups.has(g)) groups.set(g, []); groups.get(g).push({ pts: c.pts, closed: true }); }
      const list = Array.from(groups.values());
      if (mode === 'union' || list.length === 1) return MF.Bool.union(paths.map((c) => ({ pts: c.pts, closed: true })), 0, 'nonzero');
      let acc = list[0];
      if (mode === 'difference') { const rest = []; for (let i = 1; i < list.length; i++) rest.push(...list[i]); return MF.Bool.op(acc, rest, 'difference', 'evenodd', 'nonzero'); }
      for (let i = 1; i < list.length; i++) acc = MF.Bool.op(acc, list[i], mode === 'xor' ? 'xor' : 'intersect', 'evenodd', 'evenodd');
      return acc;
    },
    // ---------- 蒙版 ----------
    maskContours(L, mk, t) {
      let cs = closeAll(P.flat(V(mk.p.path, t), 0.15)); const ex = V(mk.p.expansion, t);
      if (Math.abs(ex) > 1e-6 && cs.length) cs = P.offset(cs, ex, 'round');
      return cs;
    },

    // ---------- 文字 ----------
    // 返回 { chars:[{ch, idx, x, y, adv, size, cx, cy, m:[仿射], opacity, contours(已变换), missing}], bounds, font, size }
    text(comp, L, t) {
      return Scene.memo('text' + L.id, t, () => {
        const T = L.text, str = String(T.s.str === undefined ? '' : T.s.str), font = T.s.font;
        const size = Math.max(0.1, V(T.p.size, t)); let leading = V(T.p.leading, t); if (!leading) leading = size * 1.25;
        const tracking = (V(T.p.tracking, t) / 1000) * size;
        const lines = str.split('\n'); const chars = []; let idx = 0, wordIdx = 0;
        lines.forEach((line, li) => {
          const cps = Array.from(line); let x = 0; const row = []; let inWord = false;
          for (const ch of cps) {
            const g = MF.Fonts.glyph(font, ch); const adv = g.adv * size;
            const isSpace = ch === ' ' || ch === '　';
            if (!isSpace && !inWord) { inWord = true; } else if (isSpace && inWord) { inWord = false; wordIdx++; }
            row.push({ ch, idx: idx++, line: li, word: wordIdx, x, y: li * leading, adv, size, glyph: g, missing: g.missing, space: isSpace });
            x += adv + tracking;
          }
          if (inWord) wordIdx++;
          const width = x - (cps.length ? tracking : 0);
          const shift = T.s.align === 'center' ? -width / 2 : T.s.align === 'right' ? -width : 0;
          for (const c of row) { c.x += shift; c.cx = c.x + c.adv / 2; c.cy = c.y - size * 0.36; chars.push(c); }
        });
        const nChars = chars.length, nWords = Math.max(1, wordIdx), nLines = lines.length;
        // 动画器
        const anims = T.animators.map((a) => ({ based: a.s.based, start: V(a.p.start, t) / 100, end: V(a.p.end, t) / 100, offset: V(a.p.offset, t) / 100, smooth: V(a.p.smooth, t) / 100, pos: V(a.p.position, t), rot: V(a.p.rotation, t), scale: V(a.p.scale, t), op: V(a.p.opacity, t) / 100 }));
        for (const c of chars) {
          let m = [1, 0, 0, 1, 0, 0], op = 1;
          for (const a of anims) {
            const U = a.based === 'word' ? nWords : a.based === 'line' ? nLines : nChars, u = a.based === 'word' ? c.word : a.based === 'line' ? c.line : c.idx;
            const amt = Scene.selectorAmount(u, U, a.start, a.end, a.offset, a.smooth);
            if (amt <= 0) continue;
            const sx = 1 + (a.scale[0] / 100 - 1) * amt, sy = 1 + (a.scale[1] / 100 - 1) * amt;
            const am = P.affine([c.cx + a.pos[0] * amt, c.cy + a.pos[1] * amt], a.rot * amt, [sx, sy], [c.cx, c.cy]);
            m = P.affMul(am, m); op *= 1 + (a.op - 1) * amt;
          }
          c.m = m; c.opacity = MF.clamp(op, 0, 1);
          const outline = MF.Fonts.outline(font, c.ch);
          const gm = P.affMul(m, [c.size, 0, 0, c.size, c.x, c.y]);
          c.gm = gm; c.contours = P.xf(outline, gm);
        }
        let all = []; for (const c of chars) for (const k of c.contours) all.push(k);
        return { chars, contours: all, bounds: P.bbox(all), font, size, fill: V(T.p.fill, t), stroke: V(T.p.stroke, t), strokeWidth: V(T.p.strokeWidth, t) };
      });
    },
    // 范围选择器：单位 u/U 的受影响量 0..1
    selectorAmount(u, U, s, e, off, smooth) {
      let a = s + off, b = e + off; if (a > b) { const x = a; a = b; b = x; }
      const c = (u + 0.5) / U, h = 0.5 / U + smooth * 0.5 * Math.max(b - a, 1 / U);
      let r1 = MF.clamp((c - a) / (2 * h) + 0.5, 0, 1), r2 = MF.clamp((b - c) / (2 * h) + 0.5, 0, 1);
      if (smooth > 0) { r1 = r1 * r1 * (3 - 2 * r1); r2 = r2 * r2 * (3 - 2 * r2); }
      return Math.min(r1, r2) * (b - a <= 1e-9 ? 0 : 1);
    },
    // 图层的几何（图层空间）：形状层取最终路径，文字层取字形轮廓
    layerContours(comp, L, t) {
      if (L.type === 'shape') return closeAllKeep(Scene.shape(comp, L, t).paths);
      if (L.type === 'text') return Scene.text(comp, L, t).contours;
      return [];
    },
    // 2D 内容范围（图层空间）
    contentBounds(comp, L, t) {
      if (L.type === 'shape') { const sh = Scene.shape(comp, L, t); let cs = [], pad = 0; for (const it of sh.items) { cs = cs.concat(it.contours); if (it.kind === 'stroke') pad = Math.max(pad, it.width / 2); } if (!cs.length) cs = sh.paths; const b = P.bbox(cs); return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]; }
      if (L.type === 'text') { const tx = Scene.text(comp, L, t); const b = tx.bounds, pad = tx.strokeWidth / 2; return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]; }
      if (L.type === 'precomp') { const sc = MF.Model.getComp(MF.Eval.project, L.src.comp); return sc ? [0, 0, sc.w, sc.h] : [0, 0, 100, 100]; }
      if (L.type === 'adjust') return [0, 0, comp.w, comp.h];
      if (L.type === 'null') return [0, 0, 100, 100];
      return [-50, -50, 50, 50];
    },
    // 预合成图层在 t 时刻取样的源时间
    sourceTime(L, t) { if (L.src && L.src.remapOn) return V(L.remap, t); return t - (L.start || 0); },
  });
  function closeAll(cs) { return cs.map((c) => ({ pts: c.pts, closed: true, g: c.g })); }
  function closeAllKeep(cs) { return cs.map((c) => ({ pts: c.pts, closed: c.closed, g: c.g })); }
  function mapKeys(prop, fp, fd) {
    prop.v = fp(prop.v);
    if (prop.k) for (const k of prop.k) { k.v = fp(k.v); if (fd) { if (k.to) k.to = fd(k.to); if (k.ti) k.ti = fd(k.ti); } }
  }
  function offsetKeys(prop, d) { if (Math.abs(d) < 1e-9) return; prop.v += d; if (prop.k) for (const k of prop.k) k.v += d; }
})();
