/* ============================================================
 * render2d.js — 2D 图层光栅化与合成
 * 每个图层离屏光栅化（蒙版、羽化、效果、运动模糊），再按混合模式
 * 合成到背景/前景缓冲（被 3D 层前后分割），交给 gl3d 最终合成。
 * ============================================================ */
(function (global) {
'use strict';

function Rasterizer(ev) {
  this.ev = ev;
  this.canvasCache = new Map();
  this.precompCache = new Map();
}

Rasterizer.prototype._canvas = function (w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
  return c;
};

/* 渲染一个合成的 2D 内容（递归含预合成），返回 {bg,fg,has3D,splitIndex} */
Rasterizer.prototype.renderComp = function (comp, t, state, sampler) {
  const W = comp.width, H = comp.height;
  const ev = this.ev;
  const bg = this._canvas(W, H), fg = this._canvas(W, H);
  const bgx = bg.getContext('2d'), fgx = fg.getContext('2d');
  bgx.clearRect(0, 0, W, H); fgx.clearRect(0, 0, W, H);
  if (!comp.transparent) {
    const c = comp.bgColor;
    bgx.fillStyle = rgba(c);
    bgx.fillRect(0, 0, W, H);
  }
  /* 独奏 */
  const soloActive = comp.layers.some(L => L.solo && L.enabled);
  /* 找到第一个 3D 层位置作为分割（AE 中 3D 层按深度插在 2D 层之间；这里做单层分割近似） */
  let first3D = -1;
  comp.layers.forEach((L, i) => { if (L.is3D && L.enabled && first3D < 0 && L.type !== 'camera' && L.type !== 'light') first3D = i; });

  /* 轨道遮罩：遮罩层与其上一层配对 */
  const matteOf = new Map(); const matteLayerUsed = new Set();
  for (let i = 0; i < comp.layers.length; i++) {
    const L = comp.layers[i];
    if (L.trackMatte && i + 1 < comp.layers.length) {
      matteOf.set(L.id, { layer: comp.layers[i + 1], mode: L.trackMatte });
      matteLayerUsed.add(comp.layers[i + 1].id);
    }
  }

  /* 调整层：收集其下方图层 */
  const buffers = [];
  let ctx2d = bgx;
  let belowAccum = null; // 调整层下方先画到临时缓冲
  let currentTarget = bgx;
  let adjust = null;

  for (let i = 0; i < comp.layers.length; i++) {
    const L = comp.layers[i];
    if (L.type === 'camera' || L.type === 'light' || L.type === 'field') continue;
    if (matteLayerUsed.has(L.id)) {
      /* 遮罩层不单独显示，但仍需光栅化供 alpha 使用 */
    }
    if (soloActive && !(L.solo && L.enabled)) {
      if (L.adjustLayer) continue;
      if (matteOf.has(L.id)) { /* still might render, skip if not solo */ }
      continue;
    }
    const is3D = L.is3D && L.type !== 'camera' && L.type !== 'light';
    const target = (first3D >= 0 && i < first3D) ? fgx : bgx;
    if (L.adjustLayer) {
      this.renderAdjust(comp, L, t, state, target, W, H, i, sampler);
      continue;
    }
    if (is3D) continue; // 3D 层在 gl3d 中绘制
    if (!L.enabled || !ev.layerActive(L, t)) continue;
    if (matteLayerUsed.has(L.id)) continue;

    const tex = this.renderLayer(comp, L, t, state, sampler);
    if (!tex) continue;
    if (matteOf.has(L.id)) {
      const m = matteOf.get(L.id);
      const matteTex = this.renderLayer(comp, m.layer, t, state, sampler);
      if (matteTex) applyTrackMatte(tex.canvas, matteTex.canvas, m.mode);
    }
    target.save();
    target.globalCompositeOperation = BLEND_MAP[L.blendMode] || 'source-over';
    target.drawImage(tex.canvas, 0, 0);
    target.restore();
  }
  return { bg, fg, first3D };
};

/* 调整层：把目标缓冲（其下方合成结果）整体取出做效果，再画回 */
Rasterizer.prototype.renderAdjust = function (comp, L, t, state, target, W, H, layerIndex, sampler) {
  if (!L.enabled || !this.ev.layerActive(L, t)) return;
  const ev = this.ev;
  if (!L.effects.some(fx => fx.enabled !== false)) return;
  const PAD = 160;
  const snap = this._canvas(W + PAD * 2, H + PAD * 2);
  const sx = snap.getContext('2d');
  sx.drawImage(target.canvas, PAD, PAD);
  /* 调整层自身蒙版（合成空间） */
  if (L.masks.length) {
    const mc = this._canvas(snap.width, snap.height);
    const mx = mc.getContext('2d');
    mx.translate(PAD, PAD);
    this.fillMasks(mx, L, t, comp);
    sx.globalCompositeOperation = 'destination-in';
    sx.drawImage(mc, 0, 0);
    sx.globalCompositeOperation = 'source-over';
  }
  let img = snap;
  for (const fx of L.effects) {
    if (fx.enabled === false) continue;
    img = this.applyEffect(fx, img, t, L, PAD);
  }
  const x = target.getContext('2d');
  x.save();
  x.globalAlpha = M.clamp(ev.pv(L.transform.opacity, t, L, comp) / 100, 0, 1);
  x.globalCompositeOperation = BLEND_MAP[L.blendMode] || 'source-over';
  x.drawImage(img, -PAD, -PAD);
  x.restore();
};

/* 单个图层离屏纹理（含变换、蒙版、效果、运动模糊采样） */
Rasterizer.prototype.renderLayer = function (comp, L, t, state, sampler) {
  const ev = this.ev;
  const W = comp.width, H = comp.height;
  const mBlur = L.motionBlur && comp.motionBlur;
  const samples = mBlur ? 8 : 1;
  if (mBlur) {
    const shutter = comp.shutterAngle / 360 / comp.fps;
    const phase = comp.shutterPhase / 360 / comp.fps;
    const acc = this._canvas(W, H);
    const ax = acc.getContext('2d');
    for (let s = 0; s < samples; s++) {
      const tt = t + phase + shutter * s / (samples - 1);
      const one = this.renderSingle(comp, L, tt, state, sampler);
      if (one) { ax.globalAlpha = 1 / samples; ax.drawImage(one, 0, 0); }
    }
    ax.globalAlpha = 1;
    return { canvas: acc };
  }
  const c = this.renderSingle(comp, L, t, state, sampler);
  return c ? { canvas: c } : null;
};

Rasterizer.prototype.renderSingle = function (comp, L, t, state, sampler) {
  const ev = this.ev;
  const W = comp.width, H = comp.height;
  /* 预合成层 */
  if (L.type === 'precomp') {
    let innerT = t - L.inPoint + L.startTime;
    if (L.timeRemap && L.timeRemap.enabled) innerT = ev.pv(L.timeRemap.prop, t, L, comp);
    innerT = M.clamp(innerT, 0, 1e9);
    const ref = M.findComp(ev.project, L.refComp);
    if (!ref) return null;
    const inner = this.renderComp(ref, M.clamp(innerT, 0, ref.duration - 1e-6), null, sampler);
    const c = this._canvas(W, H), x = c.getContext('2d');
    /* 将预合成按变换画入 */
    this.applyTransform(x, L, comp, t, () => {
      x.translate(W / 2, H / 2);
      x.scale(1, -1);
      /* 预合成内容画在以其中心为锚点 */
      x.drawImage(inner.bg, -ref.width / 2, -ref.height / 2);
      if (inner.fg) x.drawImage(inner.fg, -ref.width / 2, -ref.height / 2);
    });
    return this.postProcess(L, c, t, comp);
  }
  if (L.type === 'null') return null;
  if (L.type === 'tone' || L.type === 'particle' || L.type === 'geo' || L.type === 'camera' || L.type === 'light' || L.type === 'field') return null;

  const PAD = 160; // 允许发光/投影伸出图层边界
  const c = this._canvas(W + PAD * 2, H + PAD * 2);
  const x = c.getContext('2d');
  x.translate(PAD, PAD);
  this.applyTransform(x, L, comp, t, () => {
    x.scale(1, -1);
    this.drawContent(x, L, t, comp);
  });
  const out = this.postProcess(L, c, t, comp, PAD);
  return out;
};

Rasterizer.prototype.applyTransform = function (x, L, comp, t, draw) {
  const ev = this.ev;
  const T = L.transform;
  const pos = ev.pv(T.position, t, L, comp);
  const anchor = ev.pv(T.anchor, t, L, comp);
  const scl = ev.pv(T.scale, t, L, comp);
  const rot = ev.pv(T.rotation, t, L, comp);
  const opa = ev.pv(T.opacity, t, L, comp) / 100;
  const m = ev.worldMatrix2(L, comp, t);
  x.save();
  x.globalAlpha = M.clamp(opa, 0, 1);
  /* 使用世界矩阵（已含父级） */
  x.transform(m[0], m[3], m[1], m[4], m[2], m[5]);
  draw();
  x.restore();
};

Rasterizer.prototype.postProcess = function (L, c, t, comp, pad) {
  const x = c.getContext('2d');
  /* 蒙版 */
  if (L.masks.length) {
    const ev = this.ev;
    const hasInvert = L.masks.some(ms => ms.inverted);
    let mc = this.maskCanvas(L, t, c.width, c.height, pad, comp);
    /* 反转：对全画布做差值 */
    if (hasInvert) {
      const mx = mc.getContext('2d');
      const inverted = L.masks.some(ms => ms.inverted);
      if (inverted) {
        const all = this._canvas(c.width, c.height);
        const ax = all.getContext('2d');
        ax.fillStyle = '#fff';
        ax.fillRect(0, 0, c.width, c.height);
        ax.globalCompositeOperation = 'destination-out';
        ax.drawImage(mc, 0, 0);
        mc = all;
      }
    }
    const feather = Math.max(...L.masks.map(ms => ev.pv(ms.feather, t, L, comp)));
    if (feather > 0) mc = boxBlur(mc, feather);
    x.save();
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(mc, 0, 0);
    x.restore();
  }
  /* 效果（发光、投影可以伸出边界） */
  let img = c;
  for (const fx of L.effects) {
    if (fx.enabled === false) continue;
    img = this.applyEffect(fx, img, t, L, pad);
  }
  return img;
};

/* ---------------- 内容绘制 ---------------- */
Rasterizer.prototype.drawContent = function (x, L, t, comp) {
  const ev = this.ev;
  if (L.type === 'shape') return this.drawShape(x, L, t, comp);
  if (L.type === 'text') return this.drawText(x, L, t, comp);
  if (L.type === 'solid') {
    const col = ev.pv(L.solid.color, t, L, comp);
    const w = L.solid.width, h = L.solid.height;
    x.fillStyle = rgba(col);
    x.fillRect(-w / 2, -h / 2, w, h);
    return;
  }
};

Rasterizer.prototype.drawShape = function (x, L, t, comp) {
  const ev = this.ev;
  const items = [];
  for (const grp of L.shapes) collectDraw(grp, items, ev, L, comp, t);
  /* 布尔：把标记了 merge 操作的组用合成模式绘制。简化处理：按顺序绘制，遇到 merge 模式时改变 globalCompositeOperation */
  for (const it of items) {
    const mode = it.merge;
    x.save();
    if (mode === 'subtract') x.globalCompositeOperation = 'destination-out';
    if (it.fill) {
      x.fillStyle = rgba(it.fill.color, it.fill.opacity);
      tracePath(x, it.path);
      x.fill(it.fill.rule || 'nonzero');
    }
    if (it.stroke) {
      x.strokeStyle = rgba(it.stroke.color, it.stroke.opacity);
      x.lineWidth = it.stroke.width;
      x.lineCap = it.stroke.cap; x.lineJoin = it.stroke.join;
      tracePath(x, it.path);
      x.stroke();
    }
    x.restore();
  }
};
function collectDraw(group, out, ev, L, comp, t) {
  /* 复用 evaluator 的形状求值：重建一份带 fill/stroke 的列表 */
  const paths = [], fills = [], strokes = [], trims = [], repeats = [], merges = [];
  for (const it of group.items) {
    if (it.type === 'group') collectDraw(it, out, ev, L, comp, t);
    else if (it.type === 'rect') {
      const size = ev.pv(it.size, t, L, comp), posi = ev.pv(it.position, t, L, comp), r = ev.pv(it.roundness, t, L, comp);
      paths.push(ShapeGeom.transformPath(M.rectPath(size[0], size[1], r), [1, 0, 0, 1, posi[0], posi[1]]));
    } else if (it.type === 'ellipse') {
      const size = ev.pv(it.size, t, L, comp), posi = ev.pv(it.position, t, L, comp);
      paths.push(ShapeGeom.transformPath(M.ellipsePath(size[0], size[1]), [1, 0, 0, 1, posi[0], posi[1]]));
    } else if (it.type === 'path') {
      const d = it.d;
      let pth;
      if (d.animated && d.keys.length > 1 && t > d.keys[0].t) {
        let i = 0; while (i < d.keys.length - 1 && d.keys[i + 1].t <= t) i++;
        if (t >= d.keys[d.keys.length - 1].t) pth = d.keys[d.keys.length - 1].paths;
        else {
          const u = M.smooth((t - d.keys[i].t) / (d.keys[i + 1].t - d.keys[i] || 1));
          pth = ShapeGeom.morphPath(d.keys[i].paths, d.keys[i + 1].paths, u);
        }
      } else pth = d.keys[0].paths;
      paths.push(pth);
    } else if (it.type === 'fill') fills.push({ color: ev.pv(it.color, t, L, comp), opacity: ev.pv(it.opacity, t, L, comp) / 100, rule: ev.pv(it.fillRule, t, L, comp) });
    else if (it.type === 'stroke') strokes.push({ color: ev.pv(it.color, t, L, comp), opacity: ev.pv(it.opacity, t, L, comp) / 100, width: ev.pv(it.width, t, L, comp), cap: ev.pv(it.cap, t, L, comp), join: ev.pv(it.join, t, L, comp) });
    else if (it.type === 'trim') trims.push(it);
    else if (it.type === 'repeater') repeats.push(it);
    else if (it.type === 'merge') merges.push(ev.pv(it.mode, t, L, comp));
  }
  let work = paths.slice();
  for (const tr of trims) {
    const s = ev.pv(tr.start, t, L, comp), e = ev.pv(tr.end, t, L, comp), off = ev.pv(tr.offset, t, L, comp);
    work = work.map(p => ShapeGeom.trimPath(p, s, e, off));
  }
  const expand = [];
  if (repeats.length) {
    for (const rep of repeats) {
      const copies = Math.round(ev.pv(rep.copies, t, L, comp));
      const off = ev.pv(rep.offset, t, L, comp);
      const rp = ev.pv(rep.position, t, L, comp);
      const rs = ev.pv(rep.scale, t, L, comp);
      const rr = ev.pv(rep.rotation, t, L, comp);
      for (let i = 0; i < copies; i++) {
        const u = copies > 1 ? i / (copies - 1) : 0;
        const scl = [M.lerp(100, rs[0], u) / 100, M.lerp(100, rs[1], u) / 100];
        const rot = rr * (i + off) * Math.PI / 180;
        const mm = [Math.cos(rot) * scl[0], Math.sin(rot) * scl[0], -Math.sin(rot) * scl[1], Math.cos(rot) * scl[1], rp[0] * (i + off), rp[1] * (i + off)];
        for (const pth of work) expand.push(ShapeGeom.transformPath(pth, mm));
      }
    }
  } else expand.push(...work);
  const merge = merges[merges.length - 1] || null;
  for (const pth of expand) {
    out.push({ path: pth, fill: fills[fills.length - 1] || null, stroke: strokes[strokes.length - 1] || null, merge });
  }
}

Rasterizer.prototype.drawText = function (x, L, t, comp) {
  const ev = this.ev;
  const layout = Text2D.layoutText(L, t, (p, tt) => ev.pv(p, tt, L, comp));
  const tp = Text2D.textPaths(layout);
  const T = L.text;
  const fill = ev.pv(T.fillColor, t, L, comp);
  const stroke = ev.pv(T.strokeColor, t, L, comp);
  const sw = ev.pv(T.strokeWidth, t, L, comp);
  for (const pc of tp.perChar) {
    x.save();
    x.globalAlpha = M.clamp(pc.opacity, 0, 1);
    if (fill && fill[3] !== 0) {
      x.fillStyle = rgba(fill);
      for (const ct of pc.path.contours) { traceContour(x, ct); x.fill('evenodd'); }
    }
    if (sw > 0) {
      x.strokeStyle = rgba(stroke);
      x.lineWidth = sw;
      for (const ct of pc.path.contours) { traceContour(x, ct); x.stroke(); }
    }
    x.restore();
  }
};

/* ---------------- 蒙版 ----------------
 * 蒙版路径定义在图层本地坐标；postProcess 的画布已带 PAD 平移，
 * 因此这里使用同一世界矩阵 + PAD 平移 + y 翻转。
 * ------------------------------------------------------------ */
Rasterizer.prototype.maskCanvas = function (L, t, W, H, pad, comp) {
  const c = this._canvas(W, H), x = c.getContext('2d');
  x.translate(pad || 0, pad || 0);
  this.fillMasks(x, L, t, comp, pad || 0);
  return c;
};
Rasterizer.prototype.fillMasks = function (x, L, t, comp, pad) {
  const ev = this.ev;
  const m = ev.worldMatrix2(L, comp, t);
  x.save();
  x.transform(m[0], m[3], m[1], m[4], m[2], m[5]);
  x.scale(1, -1);
  for (const msk of L.masks) {
    let pth = maskPathAt(msk, t);
    const exp = ev.pv(msk.expansion, t, L, comp);
    if (exp) pth = ShapeGeom.transformPath(pth, [1 + exp / 200, 0, 0, 1 + exp / 200, 0, 0]);
    const opa = ev.pv(msk.opacity, t, L, comp) / 100;
    x.fillStyle = 'rgba(255,255,255,' + opa + ')';
    tracePath(x, pth);
    x.fill('evenodd');
  }
  x.restore();
  if (L.masks.some(ms => ev.pv(ms.feather, t, L, comp) > 0)) {
    /* 羽化需要在合成后做，交由调用方处理（见 postProcess） */
  }
};
function maskPathAt(msk, t) {
  const d = msk.d;
  if (d.animated && d.keys.length > 1 && t > d.keys[0].t) {
    let i = 0; while (i < d.keys.length - 1 && d.keys[i + 1].t <= t) i++;
    if (t >= d.keys[d.keys.length - 1].t) return d.keys[d.keys.length - 1].paths;
    return ShapeGeom.morphPath(d.keys[i].paths, d.keys[i + 1].paths,
      M.smooth((t - d.keys[i].t) / (d.keys[i + 1].t - d.keys[i] || 1)));
  }
  return d.keys[0].paths;
}

/* ---------------- 效果 ---------------- */
Rasterizer.prototype.applyEffect = function (fx, srcCanvas, t, L, pad) {
  const ev = this.ev;
  const P = fx.props;
  if (fx.type === 'gaussian') {
    const b = ev.pv(P.blur, t, L, null);
    if (b <= 0.01) return srcCanvas;
    return boxBlur(srcCanvas, b, ev.pv(P.edge, t, L, null) === 'transparent');
  }
  if (fx.type === 'glow') {
    const radius = ev.pv(P.radius, t, L, null);
    const intensity = ev.pv(P.intensity, t, L, null);
    const threshold = ev.pv(P.threshold, t, L, null) / 100;
    const color = ev.pv(P.color, t, L, null);
    if (radius < 0.01 || intensity < 0.01) return srcCanvas;
    return glowEffect(srcCanvas, radius, intensity, threshold, color);
  }
  if (fx.type === 'shadow') {
    const col = ev.pv(P.color, t, L, null);
    const opa = ev.pv(P.opacity, t, L, null) / 100;
    const dist = ev.pv(P.distance, t, L, null);
    const ang = ev.pv(P.angle, t, L, null) * Math.PI / 180;
    const soft = ev.pv(P.softness, t, L, null);
    return dropShadow(srcCanvas, col, opa, Math.cos(ang) * dist, Math.sin(ang) * dist, soft);
  }
  if (fx.type === 'hueSat') {
    const h = ev.pv(P.hue, t, L, null), s = ev.pv(P.saturation, t, L, null), l = ev.pv(P.lightness, t, L, null);
    return hueSat(srcCanvas, h, s, l);
  }
  return srcCanvas;
};

/* ---------------- 图像工具 ---------------- */
function rgba(c, mul) {
  if (!c) return '#fff';
  const a = (c[3] === undefined ? 1 : c[3]) * (mul === undefined ? 1 : mul);
  return 'rgba(' + (Math.round(M.clamp(c[0], 0, 1) * 255)) + ',' + Math.round(M.clamp(c[1], 0, 1) * 255) + ',' + Math.round(M.clamp(c[2], 0, 1) * 255) + ',' + M.clamp(a, 0, 1) + ')';
}
function tracePath(x, pth) {
  for (const ct of pth.contours) traceContour(x, ct);
}
function traceContour(x, ct) {
  const n = ct.pts.length;
  if (!n) return;
  x.beginPath();
  x.moveTo(ct.pts[0][0], ct.pts[0][1]);
  const segs = ShapeGeom.contourSegments(ct);
  for (const s of segs) x.bezierCurveTo(s.c1[0], s.c1[1], s.c2[0], s.c2[1], s.p1[0], s.p1[1]);
  if (ct.closed !== false) x.closePath();
}
const BLEND_MAP = {
  normal: 'source-over', add: 'lighter', screen: 'screen', multiply: 'multiply', overlay: 'overlay'
};
function boxBlur(src, radius, transparentEdge) {
  if (radius <= 0.1) return src;
  const tmp = document.createElement('canvas');
  tmp.width = src.width; tmp.height = src.height;
  const dst = document.createElement('canvas');
  dst.width = src.width; dst.height = src.height;
  const tx = tmp.getContext('2d'), dx = dst.getContext('2d');
  const passes = Math.min(3, Math.max(1, Math.round(radius / 8)));
  const r = radius / passes;
  dx.drawImage(src, 0, 0);
  for (let p = 0; p < passes; p++) {
    tx.clearRect(0, 0, tmp.width, tmp.height);
    tx.filter = 'blur(' + r + 'px)';
    tx.drawImage(dst, 0, 0);
    tx.filter = 'none';
    dx.clearRect(0, 0, dst.width, dst.height);
    dx.drawImage(tmp, 0, 0);
  }
  return dst;
}
function glowEffect(src, radius, intensity, threshold, color) {
  const W = src.width, H = src.height;
  const bright = document.createElement('canvas');
  bright.width = W; bright.height = H;
  const bx = bright.getContext('2d');
  bx.drawImage(src, 0, 0);
  bx.globalCompositeOperation = 'source-atop';
  const id = bx.getImageData(0, 0, W, H), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    const k = M.clamp((lum - threshold) / Math.max(0.01, 1 - threshold), 0, 1);
    d[i] = Math.round(M.clamp(color[0], 0, 1) * 255);
    d[i + 1] = Math.round(M.clamp(color[1], 0, 1) * 255);
    d[i + 2] = Math.round(M.clamp(color[2], 0, 1) * 255);
    d[i + 3] = Math.round(d[i + 3] * k * Math.min(3, intensity));
  }
  bx.putImageData(id, 0, 0);
  const bl = boxBlur(bright, radius);
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ox = out.getContext('2d');
  ox.drawImage(bl, 0, 0);
  ox.globalCompositeOperation = 'lighter';
  ox.globalAlpha = Math.min(1, intensity / 2);
  ox.drawImage(bl, 0, 0);
  ox.globalAlpha = 1;
  ox.globalCompositeOperation = 'source-over';
  ox.drawImage(src, 0, 0);
  return out;
}
function dropShadow(src, color, opa, dx, dy, soft) {
  const W = src.width, H = src.height;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const x = out.getContext('2d');
  const sh = document.createElement('canvas');
  sh.width = W; sh.height = H;
  const sx = sh.getContext('2d');
  sx.drawImage(src, 0, 0);
  sx.globalCompositeOperation = 'source-in';
  sx.fillStyle = rgba(color, opa);
  sx.fillRect(0, 0, W, H);
  const blurred = soft > 0 ? boxBlur(sh, soft) : sh;
  x.drawImage(blurred, dx, dy);
  x.drawImage(src, 0, 0);
  return out;
}
function hueSat(src, h, s, l) {
  if (!h && !s && !l) return src;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const hsl = rgb2hsl(d[i], d[i + 1], d[i + 2]);
    hsl[0] = (hsl[0] + h + 360) % 360;
    hsl[1] = M.clamp(hsl[1] + s, 0, 100);
    hsl[2] = M.clamp(hsl[2] + l, 0, 100);
    const rgb = hsl2rgb(hsl[0], hsl[1], hsl[2]);
    d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
  }
  x.putImageData(id, 0, 0);
  return c;
}
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}
function hsl2rgb(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function applyTrackMatte(target, matte, mode) {
  const x = target.getContext('2d');
  const m = document.createElement('canvas');
  m.width = target.width; m.height = target.height;
  const mx = m.getContext('2d');
  mx.drawImage(matte, 0, 0);
  if (mode === 'luma' || mode === 'lumaInv') {
    const id = mx.getImageData(0, 0, m.width, m.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = mode === 'lumaInv' ? 255 - lum : lum;
    }
    mx.putImageData(id, 0, 0);
  } else if (mode === 'alphaInv') {
    const id = mx.getImageData(0, 0, m.width, m.height), d = id.data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255 - d[i];
    mx.putImageData(id, 0, 0);
  }
  x.save();
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(m, 0, 0);
  x.restore();
}

global.Raster = { Rasterizer, rgba, tracePath, traceContour, boxBlur, BLEND_MAP };
})(window);
