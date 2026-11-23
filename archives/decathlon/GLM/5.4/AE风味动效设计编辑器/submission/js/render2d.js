/* ============================================================
   render2d.js — 二维图层内容：形状/文字/蒙版/运动模糊（Canvas2D）
   输出为 comp 坐标下的局部画布（带位置与尺寸），交由 WebGL 合成
   ============================================================ */
(function (global) {
  'use strict';

  const R2 = { RS: 1 };
  const canvasPool = [];
  function getCanvas(w, h) {
    for (const c of canvasPool) { if (!c._busy && c.width >= w && c.height >= h) { c._busy = true; return c; } }
    const c = document.createElement('canvas');
    c.width = Math.max(64, Math.ceil(w)); c.height = Math.max(64, Math.ceil(h));
    c._busy = true;
    canvasPool.push(c);
    if (canvasPool.length > 12) canvasPool.shift();
    return c;
  }
  function releaseCanvas(c) { if (c) c._busy = false; }

  /* ---------------- 路径 → Canvas2D ---------------- */
  function tracePath(ctx, contour, m) {
    const pts = contour.pts;
    if (!pts.length) return;
    const T = (p) => {
      const x = m ? m[0] * p.x + m[2] * p.y + m[4] : p.x;
      const y = m ? m[1] * p.x + m[3] * p.y + m[5] : p.y;
      return [x, y];
    };
    const p0 = T(pts[0]);
    ctx.moveTo(p0[0], p0[1]);
    const n = pts.length;
    const lim = contour.closed ? n : n - 1;
    for (let i = 0; i < lim; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const c1 = T({ x: a.x + a.ox, y: a.y + a.oy });
      const c2 = T({ x: b.x + b.ix, y: b.y + b.iy });
      const p3 = T(b);
      ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p3[0], p3[1]);
    }
    if (contour.closed) ctx.closePath();
  }
  function traceAll(ctx, path, m) { for (const c of path.contours) tracePath(ctx, c, m); }

  /* ---------------- 形状运算 ---------------- */
  function evalOps(comp, layer, state, t, paths) {
    let cur = paths.slice();
    const groups = layer.shapes || [];
    for (const g of groups) {
      if (g.enabled === false) continue;
      let ps = (g.paths || []).map(pp => state.getProp(pp, ['v'], t) || pp.v).filter(Boolean);
      for (const op of (g.ops || [])) {
        if (op.enabled === false) continue;
        const P = (k, d) => { const o = op[k]; return o && o.v !== undefined ? state.getProp(op, [k], t) : (o === undefined ? d : o); };
        if (op.type === 'trim') {
          const s = P('start', 0), e = P('end', 100), off = P('offset', 0);
          ps = ps.map(p => PT.trimPath(p, s / 100 + off / 100, e / 100 + off / 100));
        } else if (op.type === 'repeater') {
          const copies = Math.max(1, Math.round(P('copies', 3)));
          const ox = P('x', 0), oy = P('y', 0), rot = P('rotation', 0) * Math.PI / 180, sc = P('scale', 100) / 100;
          const out = [];
          for (let i = 0; i < copies; i++) {
            const m = U.M2.mul(U.M2.translate(ox * i, oy * i), U.M2.mul(U.M2.rotate(rot * i), U.M2.scale(Math.pow(sc, i), Math.pow(sc, i))));
            for (const p of ps) out.push(PT.transformPath(p, m));
          }
          ps = out;
        } else if (op.type === 'merge') {
          const mode = op.mode || 'union';
          if (ps.length >= 2) {
            const polys = ps.flatMap(p => PT.flattenToPolys(p, 0.3));
            if (mode === 'union' || mode === 'add') {
              let acc = polys;
              // 逐个合并
              for (let i = 1; i < ps.length; i++) {
                const b = PT.flattenToPolys(ps[i], 0.3);
                acc = PT.booleanOp(acc, b, 'union');
              }
              ps = [PT.pathFromPolylines(acc)];
            } else if (mode === 'subtract') {
              let acc = PT.flattenToPolys(ps[0], 0.3);
              for (let i = 1; i < ps.length; i++) acc = PT.booleanOp(acc, PT.flattenToPolys(ps[i], 0.3), 'subtract');
              ps = [PT.pathFromPolylines(acc)];
            } else if (mode === 'intersect') {
              let acc = PT.flattenToPolys(ps[0], 0.3);
              for (let i = 1; i < ps.length; i++) acc = PT.booleanOp(acc, PT.flattenToPolys(ps[i], 0.3), 'intersect');
              ps = [PT.pathFromPolylines(acc)];
            }
          }
        } else if (op.type === 'offset') {
          const amt = P('amount', 0);
          ps = ps.map(p => ({
            contours: p.contours.map(c => {
              const flat = PT.flattenContour(c, 0.4);
              if (flat.length < 3) return c;
              const off = PT.offsetPolyline(flat, amt, c.closed);
              return PT.smoothToContour(off, c.closed, 0.6, 1);
            })
          }));
        } else if (op.type === 'morph') {
          const target = op.targetPath || null;
          const prog = P('progress', 0) / 100;
          if (target) ps = ps.map((p, i) => PT.morphPath(p, target, prog));
        } else if (op.type === 'transform') {
          const m = U.M2.mul(U.M2.translate(P('x', 0), P('y', 0)), U.M2.mul(U.M2.rotate(P('rotation', 0) * Math.PI / 180), U.M2.scale(P('scale', 100) / 100, P('scale', 100) / 100)));
          ps = ps.map(p => PT.transformPath(p, m));
        }
      }
      if (g.fill && g.fill.on !== false) ps = ps;
      g._evalPaths = ps;
    }
    return cur;
  }

  // 返回该图层所有可见轮廓（应用运算与图钉）
  function shapeLayerPaths(comp, layer, state, t) {
    const out = [];
    for (const g of (layer.shapes || [])) {
      if (g.enabled === false) continue;
      let ps = (g.paths || []).map(pp => state.getProp(pp, ['v'], t) || pp.v).filter(Boolean);
      ps = applyGroupOps(g, state, t, ps, comp);
      out.push(...ps);
    }
    let merged = { contours: out.flatMap(p => p.contours) };
    // 图钉
    if (layer.pins && layer.pins.length) {
      const pins = layer.pins.map(pin => ({
        pos: state.getProp(pin, ['position'], t),
        orig: pin.orig || [0, 0],
        rotation: state.getProp(pin, ['rotation'], t),
        scale: state.getProp(pin, ['scale'], t),
        enabled: pin.enabled !== false
      })).filter(p => p.enabled);
      if (pins.length) merged = deformPathPins(merged, pins);
    }
    return merged.contours;
  }
  function applyGroupOps(g, state, t, ps, comp) {
    for (const op of (g.ops || [])) {
      if (op.enabled === false) continue;
      const P = (k, d) => { const o = op[k]; return o && o.v !== undefined ? state.getProp(op, [k], t) : (o === undefined ? d : o); };
      if (op.type === 'trim') {
        const s = P('start', 0) / 100, e = P('end', 100) / 100, off = P('offset', 0) / 100;
        ps = ps.map(p => PT.trimPath(p, s + off, e + off));
      } else if (op.type === 'repeater') {
        const copies = Math.max(1, Math.round(P('copies', 3)));
        const ox = P('x', 0), oy = P('y', 0), rot = P('rotation', 0) * Math.PI / 180, sc = P('scale', 100) / 100;
        const out = [];
        for (let i = 0; i < copies; i++) {
          const m = U.M2.mul(U.M2.translate(ox * i, oy * i), U.M2.mul(U.M2.rotate(rot * i), U.M2.scale(Math.pow(sc, i), Math.pow(sc, i))));
          for (const p of ps) out.push(PT.transformPath(p, m));
        }
        ps = out;
      } else if (op.type === 'merge' && ps.length >= 2) {
        const mode = op.mode || 'union';
        let acc = PT.flattenToPolys(ps[0], 0.3);
        for (let i = 1; i < ps.length; i++) {
          const b = PT.flattenToPolys(ps[i], 0.3);
          if (mode === 'subtract') acc = PT.booleanOp(acc, b, 'subtract');
          else if (mode === 'intersect') acc = PT.booleanOp(acc, b, 'intersect');
          else acc = PT.booleanOp(acc, b, 'union');
        }
        ps = [PT.pathFromPolylines(acc)];
      } else if (op.type === 'offset') {
        const amt = P('amount', 0);
        ps = ps.map(p => ({ contours: p.contours.map(c => { const flat = PT.flattenContour(c, 0.4); if (flat.length < 3) return c; return PT.smoothToContour(PT.offsetPolyline(flat, amt, c.closed), c.closed, 0.6, 1); }) }));
      } else if (op.type === 'morph') {
        const prog = P('progress', 0) / 100;
        if (op.targetPath) ps = ps.map(p => PT.morphPath(p, op.targetPath, prog));
      } else if (op.type === 'transform') {
        const m = U.M2.mul(U.M2.translate(P('x', 0), P('y', 0)), U.M2.mul(U.M2.rotate(P('rotation', 0) * Math.PI / 180), U.M2.scale(P('scale', 100) / 100, P('scale', 100) / 100)));
        ps = ps.map(p => PT.transformPath(p, m));
      }
    }
    return ps;
  }
  function deformPathPins(path, pins) {
    const out = { contours: [] };
    for (const c of path.contours) {
      const flat = PT.flattenContour(c, 0.5);
      const pts = flat.map(p => {
        let wsum = 0, ox = 0, oy = 0;
        for (const pin of pins) {
          const dx = p[0] - pin.orig[0], dy = p[1] - pin.orig[1];
          const w = 1 / Math.pow(Math.max(dx * dx + dy * dy, 1e-3), 1.1);
          const s = pin.scale / 100, r = pin.rotation * Math.PI / 180;
          const lx = dx * s, ly = dy * s;
          ox += (pin.pos[0] + lx * Math.cos(r) - ly * Math.sin(r)) * w;
          oy += (pin.pos[1] + lx * Math.sin(r) + ly * Math.cos(r)) * w;
          wsum += w;
        }
        return wsum > 0 ? [ox / wsum, oy / wsum] : p;
      });
      out.contours.push(PT.smoothToContour(pts, c.closed, 0.55, 0.85));
    }
    return out;
  }

  /* ---------------- 形状绘制 ---------------- */
  function drawShapeGroup(ctx, g, state, t, m) {
    const ps = g._evalPaths || [];
    if (!ps.length) return;
    const fillOn = g.fill && g.fill.on !== false;
    const strokeOn = g.stroke && g.stroke.on !== false;
    if (!fillOn && !strokeOn) return;
    ctx.save();
    if (fillOn) {
      const col = state.getProp(g.fill, ['color'], t);
      const op = state.getProp(g.fill, ['opacity'], t) / 100;
      ctx.fillStyle = col;
      ctx.globalAlpha = op;
      ctx.beginPath();
      for (const p of ps) traceAll(ctx, p, m);
      ctx.fill('evenodd');
    }
    if (strokeOn) {
      const col = state.getProp(g.stroke, ['color'], t);
      const w = state.getProp(g.stroke, ['width'], t);
      const op = state.getProp(g.stroke, ['opacity'], t) / 100;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(0.1, w);
      ctx.lineCap = g.stroke.cap || 'round';
      ctx.lineJoin = g.stroke.join || 'round';
      ctx.globalAlpha = op;
      ctx.beginPath();
      for (const p of ps) traceAll(ctx, p, m);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 形状内容包围盒（comp 空间）
  function shapeBBox(comp, layer, state, t) {
    const m = state.worldMatrix(layer);
    const m2 = [m[0], m[1], m[4], m[5], m[12], m[13]];
    let bb = null;
    for (const g of (layer.shapes || [])) {
      if (g.enabled === false) continue;
      const ps = g._evalPaths || [];
      for (const p of ps) {
        const b = PT.pathBBox(p);
        const corners = [[b.x, b.y], [b.x1, b.y], [b.x, b.y1], [b.x1, b.y1]].map(c => U.M2.apply(m2, c[0], c[1]));
        for (const c of corners) {
          bb = bb || { x0: c[0], y0: c[1], x1: c[0], y1: c[1] };
          bb.x0 = Math.min(bb.x0, c[0]); bb.y0 = Math.min(bb.y0, c[1]);
          bb.x1 = Math.max(bb.x1, c[0]); bb.y1 = Math.max(bb.y1, c[1]);
        }
      }
    }
    if (!bb) return null;
    const sw = (layer.shapes || []).reduce((mx, g) => Math.max(mx, g.stroke && g.stroke.on !== false ? state.getProp(g.stroke, ['width'], t) : 0), 0);
    return { x: bb.x0 - sw / 2, y: bb.y0 - sw / 2, w: bb.x1 - bb.x0 + sw, h: bb.y1 - bb.y0 + sw };
  }

  /* ---------------- 文字 ---------------- */
  function textBBox(comp, layer, state, t) {
    const m = state.worldMatrix(layer);
    const m2 = [m[0], m[1], m[4], m[5], m[12], m[13]];
    const txt = state.getProp(layer, ['text', 'content'], t) || '';
    const style = textStyle(layer, state, t);
    const L = FONT.layoutText(txt, style);
    const w = L.width + 20, h = L.height + 20;
    const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]].map(c => U.M2.apply(m2, c[0], c[1]));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of corners) { x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function textStyle(layer, state, t) {
    return {
      fontFamily: layer.text.fontFamily,
      fontSize: state.getProp(layer, ['text', 'fontSize'], t),
      lineHeight: state.getProp(layer, ['text', 'lineHeight'], t),
      tracking: state.getProp(layer, ['text', 'tracking'], t),
      align: layer.text.align
    };
  }
  // 计算每个字符的动画器变换
  function animatorState(layer, state, t, index, total) {
    const out = { x: 0, y: 0, rot: 0, scale: 1, opacity: 1 };
    for (const an of (layer.text.animators || [])) {
      if (an.enabled === false) continue;
      const start = state.getProp(an, ['start'], t) / 100;
      const end = state.getProp(an, ['end'], t) / 100;
      const off = state.getProp(an, ['offset'], t) / 100;
      const soft = state.getProp(an, ['softness'], t) / 100;
      let u = (index + 0.5) / Math.max(total, 1);
      u = (u - start - off) / Math.max(end - start, 1e-4);
      u = U.clamp(u, 0, 1);
      if (soft > 0) u = U.smoothstep(0, 1, U.clamp((u - 0.5) / Math.max(1 - soft, 1e-3) + 0.5, 0, 1));
      const amount = state.getProp(an, ['amount'], t);
      const type = an.type;
      if (type === 'position') { out.x += amount * u * (an.axis === 'y' ? 0 : 1); out.y += amount * u * (an.axis === 'y' ? 1 : 0); }
      else if (type === 'rotation') out.rot += amount * u;
      else if (type === 'scale') out.scale *= 1 + amount / 100 * u;
      else if (type === 'opacity') out.opacity *= 1 - amount / 100 * u;
      else if (type === 'tracking') { /* 字距在布局阶段处理 */ }
    }
    return out;
  }

  function drawText(ctx, comp, layer, state, t, m) {
    const txt = state.getProp(layer, ['text', 'content'], t) || '';
    const style = textStyle(layer, state, t);
    const L = FONT.layoutText(txt, style);
    const fill = state.getProp(layer, ['text', 'color'], t);
    const strokeOn = layer.text.strokeOn;
    const font = `${layer.text.fontStyle === 'Bold' ? 'bold ' : ''}${L.size}px ${L.family}`;
    ctx.save();
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const total = L.lines.reduce((s, l) => s + l.chars.length, 0);
    let idx = 0;
    const top = -L.height / 2;
    for (let li = 0; li < L.lines.length; li++) {
      const line = L.lines[li];
      const baseline = top + li * L.lineHeight + L.size * 0.86;
      for (const c of line.chars) {
        const st = animatorState(layer, state, t, idx, total);
        idx++;
        if (st.opacity <= 0.001) continue;
        ctx.save();
        ctx.globalAlpha = U.clamp(st.opacity, 0, 1);
        const cx = c.x + c.w / 2, cy = baseline - L.size * 0.36;
        ctx.translate(cx + st.x, cy + st.y);
        ctx.rotate(st.rot * Math.PI / 180);
        ctx.scale(st.scale, st.scale);
        ctx.translate(-cx, -cy);
        if (strokeOn) {
          ctx.lineWidth = state.getProp(layer, ['text', 'strokeWidth'], t);
          ctx.strokeStyle = state.getProp(layer, ['text', 'strokeColor'], t);
          ctx.strokeText(c.ch, c.x, baseline);
        }
        ctx.fillStyle = fill;
        ctx.fillText(c.ch, c.x, baseline);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /* ---------------- 蒙版 ---------------- */
  function buildMask(comp, layer, state, t, w, h, RS, ox, oy) {
    const cv = getCanvas(w * RS, h * RS);
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(RS, 0, 0, RS, -ox * RS, -oy * RS);
    const m2 = (() => { const m = state.worldMatrix(layer); return [m[0], m[1], m[4], m[5], m[12], m[13]]; })();
    for (const mk of (layer.masks || [])) {
      if (mk.enabled === false) continue;
      const path = state.getProp(mk, ['path'], t);
      if (!path) continue;
      const feather = state.getProp(mk, ['feather'], t);
      const op = state.getProp(mk, ['opacity'], t) / 100;
      const mode = mk.mode || 'add';
      ctx.save();
      ctx.globalAlpha = op;
      if (feather > 0.2) ctx.filter = `blur(${feather * RS}px)`;
      // 先画到临时画布再合成
      const tmp = getCanvas(cv.width, cv.height);
      const tctx = tmp.getContext('2d');
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.clearRect(0, 0, tmp.width, tmp.height);
      tctx.setTransform(RS, 0, 0, RS, -ox * RS, -oy * RS);
      tctx.filter = feather > 0.2 ? `blur(${feather * RS}px)` : 'none';
      tctx.fillStyle = '#fff';
      tctx.beginPath();
      for (const c of path.contours) tracePath(tctx, c, m2);
      tctx.fill('evenodd');
      tctx.filter = 'none';
      ctx.globalCompositeOperation = mode === 'subtract' ? 'destination-out' : mode === 'intersect' ? 'destination-in' : 'source-over';
      ctx.drawImage(tmp, 0, 0, cv.width, cv.height);
      releaseCanvas(tmp);
      ctx.restore();
    }
    return cv;
  }

  /* ---------------- 图层内容渲染 ---------------- */
  // 返回 {canvas, x, y, w, h}（comp 像素坐标）或 null
  function renderLayer2D(comp, layer, state, t, RS, opts = {}) {
    if (layer.type === 'shape') return renderShape(comp, layer, state, t, RS, opts);
    if (layer.type === 'text') return renderText(comp, layer, state, t, RS, opts);
    return null;
  }

  function renderShape(comp, layer, state, t, RS, opts) {
    // 先求值运算（供包围盒与绘制共用）
    for (const g of (layer.shapes || [])) {
      if (g.enabled === false) continue;
      const ps = (g.paths || []).map(pp => state.getProp(pp, ['v'], t) || pp.v).filter(Boolean);
      g._evalPaths = applyGroupOps(g, state, t, ps, comp);
    }
    const bb = shapeBBox(comp, layer, state, t);
    if (!bb) return null;
    const pad = 8 + effectPad(layer, state, t, RS);
    const x = Math.floor(bb.x - pad), y = Math.floor(bb.y - pad);
    const w = Math.ceil(bb.w + pad * 2), h = Math.ceil(bb.h + pad * 2);
    const cv = getCanvas(w * RS, h * RS);
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const wm = state.worldMatrix(layer);
    const m2 = [wm[0], wm[1], wm[4], wm[5], wm[12], wm[13]];
    const samples = opts.mb ? opts.mbSamples || 4 : 1;
    const shutter = opts.mb ? opts.shutter || 0.5 : 0;
    for (let s = 0; s < samples; s++) {
      const tt = samples > 1 ? t + (s / (samples - 1) - 0.5) * shutter : t;
      ctx.setTransform(RS, 0, 0, RS, -x * RS, -y * RS);
      ctx.globalAlpha = 1 / samples;
      // 应用图钉后的轮廓
      for (const g of (layer.shapes || [])) {
        if (g.enabled === false) continue;
        let ps = g._evalPaths;
        if (samples > 1) ps = applyGroupOps(g, state, tt, (g.paths || []).map(pp => state.getProp(pp, ['v'], tt) || pp.v), comp);
        const saved = g._evalPaths; g._evalPaths = ps;
        drawShapeGroup(ctx, g, state, tt, m2);
        g._evalPaths = saved;
      }
    }
    return { canvas: cv, x, y, w, h, RS };
  }

  function renderText(comp, layer, state, t, RS, opts) {
    const bb = textBBox(comp, layer, state, t);
    const pad = 10 + effectPad(layer, state, t, RS);
    const x = Math.floor(bb.x - pad), y = Math.floor(bb.y - pad);
    const w = Math.ceil(bb.w + pad * 2), h = Math.ceil(bb.h + pad * 2);
    const cv = getCanvas(w * RS, h * RS);
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const samples = opts.mb ? opts.mbSamples || 4 : 1;
    const shutter = opts.mb ? opts.shutter || 0.5 : 0;
    for (let s = 0; s < samples; s++) {
      const tt = samples > 1 ? t + (s / (samples - 1) - 0.5) * shutter : t;
      ctx.setTransform(RS, 0, 0, RS, -x * RS, -y * RS);
      ctx.globalAlpha = 1 / samples;
      drawText(ctx, comp, layer, state, tt, null);
    }
    return { canvas: cv, x, y, w, h, RS };
  }

  function effectPad(layer, state, t, RS) {
    let pad = 0;
    for (const fx of (layer.effects || [])) {
      if (!fx.enabled) continue;
      const P = (k, d) => { const o = fx.params[k]; return o && o.v !== undefined ? state.getProp(fx, ['params', k], t) : (o === undefined ? d : o); };
      if (fx.type === 'blur') pad = Math.max(pad, P('amount', 10) * 3);
      else if (fx.type === 'glow') pad = Math.max(pad, P('radius', 24) * 3);
      else if (fx.type === 'shadow') pad = Math.max(pad, P('distance', 12) + P('softness', 12) * 2);
    }
    return pad;
  }

  R2.renderLayer2D = renderLayer2D;
  R2.shapeLayerPaths = shapeLayerPaths;
  R2.buildMask = buildMask;
  R2.textStyle = textStyle;
  R2.animatorState = animatorState;
  R2.getCanvas = getCanvas;
  R2.releaseCanvas = releaseCanvas;
  R2.effectPad = effectPad;
  R2.textBBox = textBBox;
  global.R2 = R2;
})(window);
