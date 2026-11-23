/* ============================================================
 * text.js — 文字排版与文字动画器
 * 字形轮廓来自 FontLib（随项目 SimHei）；动画器按字符/词/行的
 * 起点、终点、偏移、软边选择范围驱动位置、旋转、缩放、不透明度，
 * 字符绕自身中心变化。
 * ============================================================ */
(function (global) {
'use strict';

const GLYPH_CACHE = new Map();

/* 取某文本样式在给定时刻的排版（y向上，原点为文本块中心） */
function layoutText(L, t, getPV) {
  const T = L.text;
  const str = String(getPV(T.sourceText, t) ?? '');
  const fontSize = getPV(T.fontSize, t);
  const lineHeight = getPV(T.lineHeight, t);
  const tracking = getPV(T.tracking, t);
  const align = getPV(T.align, t);
  const vs = getPV(T.verticalScale, t);
  const lay = FontLib.layout(str, fontSize, tracking, lineHeight, align, vs);

  const glyphs = [];
  for (const g of lay.glyphs) {
    if (g.ch === '\n') continue;
    const rec = {
      ch: g.ch, line: g.line, x: g.x,
      baseY: g.baseY,
      advance: g.advance, tracking, contours: g.contours, missing: g.missing,
      local: { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, op: 1 }
    };
    glyphs.push(rec);
  }
  /* 文字动画器 */
  for (const an of T.animators) {
    applyAnimator(an, glyphs, lay, t, getPV);
  }
  return { glyphs, width: lay.width, height: lay.height, str };
}

function makeTextAnimator(name) {
  return {
    id: M.uid('tan'),
    name: name || '动画器 1',
    enabled: true,
    units: 'char', // char | word | line
    start: M.prop('起点', 0, { min: -200, max: 200 }),
    end: M.prop('终点', 100, { min: -200, max: 200 }),
    offset: M.prop('偏移', 0, { min: -2000, max: 2000 }),
    softness: M.prop('软边', 0, { min: 0, max: 100 }),
    position: M.prop('位置', [0, 0]),
    rotation: M.prop('旋转', 0, { min: -720, max: 720 }),
    scale: M.prop('缩放', [100, 100]),
    opacity: M.prop('不透明度', 100, { min: 0, max: 100 })
  };
}

function applyAnimator(an, glyphs, lay, t, getPV) {
  if (an.enabled === false) return;
  const start = getPV(an.start, t), end = getPV(an.end, t),
        off = getPV(an.offset, t), soft = getPV(an.softness, t) / 100;
  const pos = getPV(an.position, t), rot = getPV(an.rotation, t),
        scl = getPV(an.scale, t), opa = getPV(an.opacity, t);
  const total = Math.max(1, glyphs.length - 1);
  glyphs.forEach((g, i) => {
    let idx;
    if (an.units === 'line') idx = g.line;
    else idx = i;
    let u;
    if (an.units === 'line') {
      u = total === 0 ? 0 : idx / Math.max(1, lay.lines - 1) * 100;
    } else {
      u = total === 0 ? 0 : idx / total * 100;
    }
    const sel = rangeSelect(u + (off % 100), start, end, soft);
    if (sel <= 0.0001) return;
    g.local.dx += pos[0] * sel;
    g.local.dy += pos[1] * sel;
    g.local.rot += rot * sel;
    g.local.sx *= 1 + (scl[0] / 100 - 1) * sel;
    g.local.sy *= 1 + (scl[1] / 100 - 1) * sel;
    g.local.op *= 1 + (opa / 100 - 1) * sel;
  });
}
function smoothstep(a, b, x) {
  if (b - a === 0) return x >= b ? 1 : 0;
  const t = M.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function rangeSelect(u, s, e, soft) {
  if (u < s || u > e) return 0;
  const span = e - s || 1;
  const l = soft * span, r = soft * span;
  let w = 1;
  if (u < s + l) w *= smoothstep(s, s + l, u);
  if (u > e - r) w *= 1 - smoothstep(e - r, e, u);
  return M.clamp(w, 0, 1);
}

/* 将排版结果转为整体路径（y向上，原点为文本块中心），同时返回每个字的路径 */
function textPaths(layout) {
  const all = { closed: true, contours: [] };
  const perChar = [];
  for (const g of layout.glyphs) {
    if (!g.contours.length && !g.missing) continue;
    const srcContours = g.contours.length ? g.contours : tofuPath(FontLib.unitsPerEm ? 80 : 80).contours;
    let bx0 = 1e18, by0 = 1e18, bx1 = -1e18, by1 = -1e18;
    for (const c of srcContours) for (const p of c.pts) {
      bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]);
      by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]);
    }
    const ccx = (bx0 + bx1) / 2, ccy = (by0 + by1) / 2;
    const ar = g.local.rot * Math.PI / 180;
    const cos = Math.cos(ar), sin = Math.sin(ar);
    const cp = { closed: true, contours: [] };
    const xf = (p, handle) => {
      let rx = (p[0] - ccx) * g.local.sx, ry = (p[1] - ccy) * g.local.sy;
      if (handle) { rx = p[0] * g.local.sx; ry = p[1] * g.local.sy; }
      const X = rx * cos - ry * sin, Y = rx * sin + ry * cos;
      return [X + (handle ? 0 : ccx + g.x + g.local.dx), Y + (handle ? 0 : ccy + g.baseY + g.local.dy) - (handle ? 0 : 0)];
    };
    for (const c of srcContours) {
      const nc = { closed: true, pts: [], in: [], out: [] };
      for (let i = 0; i < c.pts.length; i++) {
        nc.pts.push(xf(c.pts[i], false));
        nc.in.push(xf(c.in[i], true));
        nc.out.push(xf(c.out[i], true));
      }
      cp.contours.push(nc);
      all.contours.push(nc);
    }
    perChar.push({ ch: g.ch, path: cp,
      center: [ccx + g.x + g.local.dx, ccy + g.baseY + g.local.dy],
      opacity: g.local.op, missing: g.missing });
  }
  /* 居中：整体平移半个文本块 */
  const shift = (path, dx, dy) => {
    for (const ct of path.contours) for (const p of ct.pts) { p[0] += dx; p[1] += dy; }
  };
  shift(all, -layout.width / 2, -layout.height / 2);
  for (const pc of perChar) { shift(pc.path, -layout.width / 2, -layout.height / 2); pc.center[0] -= layout.width / 2; pc.center[1] -= layout.height / 2; }
  return { all, perChar };
}

/* 文字轮廓（不带动画器的字形）按字符串缓存的扁平折线，供几何/粒子使用 */
function glyphFlatContours(str, fontSize) {
  const key = str + '|' + fontSize;
  if (GLYPH_CACHE.has(key)) return GLYPH_CACHE.get(key);
  const lay = FontLib.layout(str, fontSize, 0, 120, 'center', 100);
  const contours = [];
  for (const g of lay.glyphs) {
    if (g.ch === '\n') continue;
    for (const c of g.contours) {
      const flat = ShapeGeom.flattenPath({ closed: true, contours: [c] }, 0.5)[0];
      if (flat && flat.pts.length > 2) contours.push(flat.pts);
    }
  }
  /* 居中 */
  let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
  for (const ring of contours) for (const p of ring) {
    x0 = Math.min(x0, p[0] - lay.width / 2); x1 = Math.max(x1, p[0] - lay.width / 2);
    y0 = Math.min(y0, p[1] - lay.height / 2); y1 = Math.max(y1, p[1] - lay.height / 2);
  }
  const centered = contours.map(ring => ring.map(p => [p[0] - lay.width / 2, p[1] - lay.height / 2]));
  const res = { contours: centered, bounds: [x0, y0, x1, y1] };
  GLYPH_CACHE.set(key, res);
  return res;
}

/* 缺字符号（空心方框） */
function tofuPath(size) {
  const s = size / 2;
  return { closed: true, contours: [{ closed: true,
    pts: [[-s, -s], [s, -s], [s, s], [-s, s]], in: [[0,0],[0,0],[0,0],[0,0]], out: [[0,0],[0,0],[0,0],[0,0]] }] };
}

global.Text2D = { layoutText, makeTextAnimator, textPaths, glyphFlatContours, tofuPath };
})(window);
