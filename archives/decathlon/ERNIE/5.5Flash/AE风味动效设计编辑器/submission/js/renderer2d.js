/* AE Forge Editor - 2D compositing renderer (Canvas2D layers -> WebGL2 friendly canvas) */
(function (global) {
  'use strict';
  const G = global.AEGeom;
  const A = global.AEAnim;
  const T = global.AEText;
  const { clamp } = AEMath;

  const pool = new Map();
  function getCanvas(key, w, h) {
    let c = pool.get(key);
    if (!c) { c = document.createElement('canvas'); pool.set(key, c); }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.clearRect(0, 0, w, h);
    return c;
  }
  function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function is3DLayer(l) {
    if (l.type === 'geo3d' || l.type === 'particle' || l.type === 'camera' || l.type === 'light') return true;
    if ((l.type === 'shape' || l.type === 'text') && l.is3D) return true;
    return false;
  }

  // ---------- shape contours ----------
  function chaikin(pts, closed, iters) {
    let p = pts;
    for (let k = 0; k < (iters || 2); k++) {
      const out = [];
      const n = p.length;
      if (!closed) out.push(p[0]);
      const lim = closed ? n : n - 1;
      for (let i = 0; i < lim; i++) {
        const a = p[i], b = p[(i + 1) % n];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      if (!closed) out.push(p[n - 1]);
      p = out;
    }
    return p;
  }

  function rectPoints(x, y, w, h, r) {
    r = Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2);
    const pts = [];
    if (r <= 0.01) {
      return [[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]];
    }
    const corners = [
      [x + w / 2 - r, y - h / 2 + r, -Math.PI / 2],
      [x + w / 2 - r, y + h / 2 - r, 0],
      [x - w / 2 + r, y + h / 2 - r, Math.PI / 2],
      [x - w / 2 + r, y - h / 2 + r, Math.PI],
    ];
    const seg = 8;
    for (const c of corners) {
      for (let i = 0; i <= seg; i++) {
        const a = c[2] + (Math.PI / 2) * i / seg;
        pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
      }
    }
    return pts;
  }

  function shapeToContours(s) {
    if (s.kind === 'rect') return [{ pts: rectPoints(s.x || 0, s.y || 0, s.w || 100, s.h || 100, s.round || 0), closed: true }];
    if (s.kind === 'ellipse') {
      const pts = [];
      const n = 48;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        pts.push([(s.x || 0) + Math.cos(a) * (s.w || 100) / 2, (s.y || 0) + Math.sin(a) * (s.h || 100) / 2]);
      }
      return [{ pts, closed: true }];
    }
    if (s.kind === 'contours') {
      return (s.contours || []).map(c => ({ pts: c.pts.map(p => [p[0], p[1]]), closed: s.closed !== false }));
    }
    if (s.kind === 'morph') {
      const a = s.a || [], b = s.b || [];
      const n = Math.max(a.length, b.length);
      const pts = [];
      const t = clamp(s.t === undefined ? 0.5 : s.t, 0, 1);
      for (let i = 0; i < n; i++) {
        const pa = a[Math.floor(i * a.length / n)] || [0, 0];
        const pb = b[Math.floor(i * b.length / n)] || [0, 0];
        pts.push([pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t]);
      }
      return [{ pts, closed: true }];
    }
    // path
    let pts = (s.pts || []).map(p => [p[0], p[1]]);
    if (pts.length < 2) return [];
    if (s.smooth) pts = chaikin(pts, s.closed !== false, 2);
    return [{ pts, closed: s.closed !== false }];
  }

  function trimContour(cont, startPct, endPct) {
    let pts = cont.pts;
    const closed = cont.closed;
    if (!closed || pts.length < 2) {
      // open path: simple length trim
      const total = pathLength(pts, false);
      const s = clamp(startPct, 0, 1) * total, e = clamp(endPct, 0, 1) * total;
      return [sliceByLength(pts, false, s, e)];
    }
    const list = pts.concat([pts[0]]);
    const total = pathLength(list, false);
    const s2 = ((startPct % 1) + 1) % 1 * total;
    const e2 = ((endPct % 1) + 1) % 1 * total;
    const e2b = e2 <= s2 ? e2 + total : e2;
    return [sliceByLength(list, false, s2, e2b)];
  }
  function pathLength(pts, closed) {
    let L = 0;
    for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    return L;
  }
  function sliceByLength(pts, closed, s, e) {
    const out = [];
    let acc = 0;
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      segs.push(l); total += l;
    }
    const pointAt = (d) => {
      let acc2 = 0;
      for (let i = 0; i < segs.length; i++) {
        if (acc2 + segs[i] >= d || i === segs.length - 1) {
          const t = segs[i] > 0 ? (d - acc2) / segs[i] : 0;
          return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * clamp(t, 0, 1), pts[i][1] + (pts[i + 1][1] - pts[i][1]) * clamp(t, 0, 1)];
        }
        acc2 += segs[i];
      }
      return pts[pts.length - 1];
    };
    const s2 = clamp(s, 0, total), e2 = clamp(e, 0, total);
    const N = 64;
    for (let i = 0; i <= N; i++) {
      const d = s2 + (e2 - s2) * i / N;
      out.push(pointAt(d));
    }
    return out;
  }

  function transformPts(pts, tf) {
    const cos = Math.cos((tf.rot || 0) * Math.PI / 180), sin = Math.sin((tf.rot || 0) * Math.PI / 180);
    const sx = (tf.scale === undefined ? 100 : tf.scale) / 100, sy = sx;
    return pts.map(p => {
      const x = p[0] * sx, y = p[1] * sy;
      return [x * cos - y * sin + (tf.x || 0), x * sin + y * cos + (tf.y || 0)];
    });
  }

  function buildShapeContours(layer, time) {
    let shapes = [];
    for (const s of layer.shapes) shapes.push(...shapeToContours(s));
    if (!shapes.length) return [];
    const mod = layer.modifiers || {};
    const ctx = global.AEProject.makeCtx(global.AEProject.activeComp(), layer, time || 0);
    if (mod.merge && mod.merge.enabled && shapes.length > 1) {
      shapes = applyMerge(shapes, mod.merge.op);
    }
    if (mod.trim && mod.trim.enabled) {
      const st = clamp(A.evalProp(mod.trim.start, time || 0, ctx), 0, 100) / 100;
      const en = clamp(A.evalProp(mod.trim.end, time || 0, ctx), 0, 100) / 100;
      const off = A.evalProp(mod.trim.offset, time || 0, ctx) / 100;
      const stagger = (mod.trim.stagger || 0) / 100;
      const out = [];
      for (let ci = 0; ci < shapes.length; ci++) {
        const c = shapes[ci];
        const s2 = clamp(st + off, -1, 2);
        const e2 = clamp(en * 1.18 - ci * stagger + off, -1, 2);
        if (e2 <= 0 || s2 >= 1) continue;
        for (const seg of trimContour(c, s2, e2)) if (seg.length > 1) out.push({ pts: seg, closed: false });
      }
      shapes = out;
    }
    if (mod.repeater && mod.repeater.enabled) {
      const rep = mod.repeater;
      const copies = clamp(A.evalProp(rep.copies, time || 0, ctx), 1, 32);
      const base = shapes;
      const out = [];
      for (let k = 0; k < copies; k++) {
        const tf = {
          x: A.evalProp(rep.x, time || 0, ctx) * k,
          y: A.evalProp(rep.y, time || 0, ctx) * k,
          rot: A.evalProp(rep.rotation, time || 0, ctx) * k,
          scale: 100 + (A.evalProp(rep.scale, time || 0, ctx) - 100) * k,
        };
        for (const c of base) out.push({ pts: transformPts(c.pts, tf), closed: c.closed });
      }
      shapes = out;
    }
    return shapes;
  }

  function applyMerge(shapes, op) {
    let cur = shapes;
    if (op === 'union') {
      let acc = [cur[0]];
      for (let i = 1; i < cur.length; i++) {
        const next = [];
        for (const a of acc) next.push(...G.clipPolys(a.pts, cur[i].pts, 'union'));
        acc = next;
      }
      return acc.map(p => ({ pts: p, closed: true }));
    }
    if (op === 'difference') {
      let acc = [cur[0]];
      for (let i = 1; i < cur.length; i++) {
        const next = [];
        for (const a of acc) next.push(...G.clipPolys(a.pts, cur[i].pts, 'diff'));
        acc = next;
      }
      return acc.map(p => ({ pts: p, closed: true }));
    }
    // intersection
    let acc = [cur[0]];
    for (let i = 1; i < cur.length; i++) {
      const next = [];
      for (const a of acc) {
        const d = G.clipPolys(a.pts, cur[i].pts, 'diff');
        for (const dd of d) next.push(...G.clipPolys(a.pts, dd, 'diff'));
      }
      acc = next;
    }
    return acc.map(p => ({ pts: p, closed: true }));
  }

  // ---------- masks ----------
  function maskPath2D(mask) {
    const p = new Path2D();
    if (mask.kind === 'rect') {
      p.rect((mask.x || 0) - (mask.w || 200) / 2, (mask.y || 0) - (mask.h || 200) / 2, mask.w || 200, mask.h || 200);
    } else if (mask.kind === 'ellipse') {
      p.ellipse(mask.x || 0, mask.y || 0, Math.abs((mask.w || 200) / 2), Math.abs((mask.h || 200) / 2), 0, 0, Math.PI * 2);
    } else {
      const pts = mask.pts || [];
      if (pts.length) {
        p.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
        p.closePath();
      }
    }
    return p;
  }

  function applyMasks(ctx, W, H, layer, scale, matScale) {
    for (const m of (layer.masks || [])) {
      if (m.enabled === false) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const path = maskPath2D(m);
      const feather = (m.feather || 0) * matScale;
      if (m.invert) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(-W, -H, W * 3, H * 3);
        ctx.globalCompositeOperation = 'destination-out';
        if (feather > 0) ctx.filter = 'blur(' + feather.toFixed(1) + 'px)';
        ctx.fillStyle = '#fff';
        ctx.fill(path);
      } else {
        ctx.globalCompositeOperation = 'destination-in';
        if (feather > 0) ctx.filter = 'blur(' + feather.toFixed(1) + 'px)';
        ctx.fillStyle = '#fff';
        ctx.fill(path);
      }
      ctx.restore();
    }
  }

  // ---------- effects ----------
  function effectFilter(fx) {
    const p = fx.params || {};
    switch (fx.type) {
      case 'gaussian': return 'blur(' + (p.radius || 8).toFixed(2) + 'px)';
      case 'hue': return 'hue-rotate(' + (p.hue || 0) + 'deg) saturate(' + (p.saturation === undefined ? 100 : p.saturation) / 100 + ') brightness(' + (p.brightness === undefined ? 100 : p.brightness) / 100 + ')';
      default: return 'none';
    }
  }
  function applyEffect(src, fx, W, H) {
    const p = fx.params || {};
    const out = newCanvas(W, H);
    const ctx = out.getContext('2d');
    if (fx.type === 'gaussian' || fx.type === 'hue') {
      ctx.filter = effectFilter(fx);
      ctx.drawImage(src, 0, 0);
      ctx.filter = 'none';
      return out;
    }
    if (fx.type === 'glow') {
      const blur = newCanvas(W, H);
      const bctx = blur.getContext('2d');
      bctx.filter = 'blur(' + (p.radius || 20) + 'px)';
      bctx.drawImage(src, 0, 0);
      bctx.filter = 'none';
      bctx.globalCompositeOperation = 'source-in';
      bctx.fillStyle = p.color || '#ff9a3c';
      bctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = (p.intensity === undefined ? 1 : p.intensity);
      ctx.drawImage(blur, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(src, 0, 0);
      return out;
    }
    if (fx.type === 'shadow') {
      const blur = newCanvas(W, H);
      const bctx = blur.getContext('2d');
      bctx.filter = 'blur(' + (p.radius || 12) + 'px)';
      bctx.drawImage(src, 0, 0);
      bctx.filter = 'none';
      bctx.globalCompositeOperation = 'source-in';
      bctx.fillStyle = p.color || '#000000';
      bctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = (p.opacity === undefined ? 0.6 : p.opacity);
      ctx.drawImage(blur, (p.distance || 0) * (p.angle ? Math.cos(p.angle * Math.PI / 180) : 0), (p.distance || 0) * (p.angle ? Math.sin(p.angle * Math.PI / 180) : 0));
      ctx.globalAlpha = 1;
      ctx.drawImage(src, 0, 0);
      return out;
    }
    ctx.drawImage(src, 0, 0);
    return out;
  }

  function applyEffects(src, effects, W, H) {
    let cur = src;
    for (const fx of effects) {
      if (fx.enabled === false) continue;
      cur = applyEffect(cur, fx, W, H);
    }
    return cur;
  }

  // ---------- layer rendering ----------
  const geomCache = new Map();
  function cachedGeom(key, fn) {
    const hit = geomCache.get(key);
    if (hit) return hit;
    const v = fn();
    geomCache.set(key, v);
    return v;
  }

  function drawShapeLayer(ctx, layer, time) {
    const mod = layer.modifiers || {};
    const modAnimated = (mod.trim && mod.trim.enabled) || (mod.repeater && mod.repeater.enabled);
    const gkey = 'shapes:' + layer.id + ':' + (global.AEProject.geometryRevision || 0) + ':' + (modAnimated ? (time || 0).toFixed(2) : '0');
    const contours = cachedGeom(gkey, () => buildShapeContours(layer, time));
    if (!contours.length) return;
    const path = new Path2D();
    for (const c of contours) {
      const pts = c.pts;
      if (!pts.length) continue;
      path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
      if (c.closed) path.closePath();
    }
    const fill = layer.fill || {};
    if (fill.enabled !== false) {
      ctx.globalAlpha = (fill.opacity === undefined ? 100 : fill.opacity) / 100;
      if (fill.type === 'linear' || fill.type === 'radial') {
        const g = fill.type === 'radial'
          ? ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, fill.radius || 300))
          : ctx.createLinearGradient(fill.x1 || -200, fill.y1 || 200, fill.x2 || 200, fill.y2 || -200);
        const c1 = fill.color || '#ffffff', c2 = fill.color2 || '#000000';
        g.addColorStop(0, c1);
        g.addColorStop(1, c2);
        ctx.fillStyle = g;
      } else ctx.fillStyle = fill.color || '#ffffff';
      ctx.fill(path, 'evenodd');
      ctx.globalAlpha = 1;
    }
    const stroke = layer.stroke || {};
    if (stroke.enabled) {
      ctx.globalAlpha = (stroke.opacity === undefined ? 100 : stroke.opacity) / 100;
      ctx.strokeStyle = stroke.color || '#ffffff';
      ctx.lineWidth = stroke.width || 4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke(path);
      ctx.globalAlpha = 1;
    }
  }

  function drawTextLayer(ctx, layer, time) {
    T.drawText(ctx, layer, time);
  }

  function drawPrecompLayer(ctx, layer, comp, time, W, H, scale) {
    const child = global.AEProject.comp(layer.compId);
    if (!child) return;
    const srcTime = global.AEProject.layerSourceTime(layer, time) + A.evalProp(layer.timeRemap, time, global.AEProject.makeCtx(comp, layer, time));
    const cc = global.AE2D.render(child, Math.max(0, srcTime), { scale, skipBackground: layer.transparent });
    ctx.drawImage(cc, 0, 0, W, H);
  }

  function renderLayerCanvas(layer, comp, time, W, H, scale, opts) {
    const content = newCanvas(W, H);
    const ctx = content.getContext('2d');
    const wm = global.AEProject.worldMatrix(comp, layer, time);
    const a = wm[0] * scale, b = -wm[1] * scale, c = wm[4] * scale, d = -wm[5] * scale;
    const e = W / 2 + wm[12] * scale, f = H / 2 - wm[13] * scale;
    ctx.setTransform(a, b, c, d, e, f);
    const matScale = Math.hypot(wm[0], wm[1]) * scale || 1;
    try {
      if (layer.type === 'shape') drawShapeLayer(ctx, layer, time);
      else if (layer.type === 'text') drawTextLayer(ctx, layer, time);
      else if (layer.type === 'precomp') drawPrecompLayer(ctx, layer, comp, time, W, H, scale);
      else if (layer.type === 'adjust') { /* no source */ }
    } catch (err) {
      console.warn('layer draw failed', layer.name, err);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    applyMasks(ctx, W, H, layer, scale, matScale);
    let out = content;
    if (layer.effects && layer.effects.length) {
      out = applyEffects(content, layer.effects, W, H);
    }
    // track matte
    if (layer.trackMatte && layer.matteLayerId) {
      const matte = global.AEProject.layer(comp, layer.matteLayerId);
      if (matte) {
        const mCanvas = renderLayerCanvas(matte, comp, time, W, H, scale, opts);
        const octx = out.getContext('2d');
        octx.globalCompositeOperation = 'destination-in';
        if (layer.matteInvert) {
          const tmp = newCanvas(W, H);
          const tctx = tmp.getContext('2d');
          tctx.fillStyle = '#fff'; tctx.fillRect(0, 0, W, H);
          tctx.globalCompositeOperation = 'destination-out';
          tctx.drawImage(mCanvas, 0, 0);
          octx.drawImage(tmp, 0, 0);
        } else octx.drawImage(mCanvas, 0, 0);
        octx.globalCompositeOperation = 'source-over';
      }
    }
    return out;
  }

  function drawAdjustment(octx, layer, comp, time, W, H, scale) {
    // apply effects to the current accumulation
    if (!layer.effects || !layer.effects.length) return;
    const snap = newCanvas(W, H);
    snap.getContext('2d').drawImage(octx.canvas, 0, 0);
    let out = applyEffects(snap, layer.effects, W, H);
    // mask
    const content = newCanvas(W, H);
    const cctx = content.getContext('2d');
    const wm = global.AEProject.worldMatrix(comp, layer, time);
    cctx.setTransform(wm[0] * scale, -wm[1] * scale, wm[4] * scale, -wm[5] * scale, W / 2 + wm[12] * scale, H / 2 - wm[13] * scale);
    applyMasks(cctx, W, H, layer, scale, Math.hypot(wm[0], wm[1]) * scale || 1);
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.globalCompositeOperation = 'source-in';
    cctx.drawImage(out, 0, 0);
    cctx.globalCompositeOperation = 'source-over';
    octx.globalAlpha = global.AEProject.layerOpacity(layer, time);
    octx.drawImage(content, 0, 0);
    octx.globalAlpha = 1;
  }

  const blendMap = {
    normal: 'source-over', add: 'lighter', screen: 'screen',
    multiply: 'multiply', overlay: 'overlay',
  };

  function drawBackground(octx, comp, W, H) {
    const bg = comp.background || {};
    const g = bg.type === 'radial'
      ? octx.createRadialGradient(W * 0.5, H * 0.42, 10, W * 0.5, H * 0.5, Math.max(W, H) * 0.75)
      : octx.createLinearGradient(0, 0, W * 0.3, H);
    const c1 = bg.color1 || '#141419', c2 = bg.color2 || '#050507';
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    octx.fillStyle = g;
    octx.fillRect(0, 0, W, H);
    if (bg.vignette) {
      const v = octx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.55)');
      octx.fillStyle = v;
      octx.fillRect(0, 0, W, H);
    }
  }

  function render(comp, time, opts) {
    opts = opts || {};
    const scale = opts.scale || 1;
    const W = Math.max(2, Math.round(comp.width * scale));
    const H = Math.max(2, Math.round(comp.height * scale));
    const out = opts.canvas || newCanvas(W, H);
    if (out.width !== W) out.width = W;
    if (out.height !== H) out.height = H;
    const octx = out.getContext('2d');
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.globalAlpha = 1;
    octx.globalCompositeOperation = 'source-over';
    octx.clearRect(0, 0, W, H);
    if (!opts.skipBackground) drawBackground(octx, comp, W, H);
    const layers = comp.layers;
    const anySolo = layers.some(l => l.solo);
    const indices3D = [];
    for (let i = 0; i < layers.length; i++) if (is3DLayer(layers[i])) indices3D.push(i);
    const lowest3D = indices3D.length ? Math.max.apply(null, indices3D) : -1;
    let drew3D = false;
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (i === lowest3D) {
        drew3D = true;
        if (global.AE3D) {
          const group = layers.filter(x => is3DLayer(x) && x.type !== 'camera' && x.type !== 'light');
          const cvs = global.AE3D.renderGroup(comp, group, time, W, H, opts);
          if (cvs) {
            octx.globalAlpha = 1;
            octx.globalCompositeOperation = 'source-over';
            octx.drawImage(cvs, 0, 0);
          }
        }
      }
      if (is3DLayer(l)) continue;
      if (anySolo && !l.solo) continue;
      if (!global.AEProject.isLayerVisible(l, time)) continue;
      if (l.type === 'adjust') {
        drawAdjustment(octx, l, comp, time, W, H, scale);
        continue;
      }
      if (l.type === 'null' || l.type === 'audio') continue;
      let lc;
      try { lc = renderLayerCanvas(l, comp, time, W, H, scale, opts); }
      catch (e) { console.warn(e); continue; }
      const op = global.AEProject.layerOpacity(l, time);
      if (op <= 0.002) continue;
      octx.globalAlpha = op;
      octx.globalCompositeOperation = blendMap[l.blendMode] || 'source-over';
      octx.drawImage(lc, 0, 0);
      octx.globalAlpha = 1;
      octx.globalCompositeOperation = 'source-over';
    }
    if (!drew3D && lowest3D >= 0 && global.AE3D) {
      const group = layers.filter(x => is3DLayer(x) && x.type !== 'camera' && x.type !== 'light');
      const cvs = global.AE3D.renderGroup(comp, group, time, W, H, opts);
      if (cvs) octx.drawImage(cvs, 0, 0);
    }
    return out;
  }

  global.AE2D = { render, renderLayerCanvas, is3DLayer, buildShapeContours, shapeToContours, applyEffects, newCanvas, getCanvas };
})(window);