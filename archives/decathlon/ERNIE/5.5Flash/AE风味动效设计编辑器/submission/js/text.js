/* AE Forge Editor - text layout, glyph outlines, animators */
(function (global) {
  'use strict';
  const G = global.AEGeom;
  const A = global.AEAnim;

  const FAMILY_MAP = {
    sans: '"Microsoft YaHei","PingFang SC","Noto Sans SC","Source Han Sans SC","SimHei",sans-serif',
    serif: '"Songti SC","SimSun","Noto Serif SC","Source Han Serif SC",serif',
    mono: '"Consolas","Courier New",monospace',
  };
  function familyOf(t) { return FAMILY_MAP[t.family] || FAMILY_MAP.sans; }
  function fontString(t, sizeOverride) {
    return (t.weight || 700) + ' ' + (sizeOverride || t.size) + 'px ' + familyOf(t);
  }

  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  function measure(ch, t, size) {
    mctx.font = fontString(t, size);
    return mctx.measureText(ch).width;
  }
  function measureLine(str, t, size) {
    mctx.font = fontString(t, size);
    return mctx.measureText(str).width;
  }

  // split text into lines respecting \n
  function splitLines(content) {
    return String(content == null ? '' : content).split('\n');
  }

  function animatorRange(layer, time) {
    const an = layer.animator;
    if (!an || !an.enabled) return null;
    const comp = global.AEProject.activeComp();
    const ctx = global.AEProject.makeCtx(comp, layer, time);
    const start = A.evalProp(an.start, time, ctx);
    const end = A.evalProp(an.end, time, ctx);
    const offset = A.evalProp(an.offset, time, ctx);
    const feather = an.feather || 0;
    const pos = A.evalProp(an.position, time, ctx);
    const rot = A.evalProp(an.rotation, time, ctx);
    const scl = A.evalProp(an.scale, time, ctx);
    const op = A.evalProp(an.opacity, time, ctx);
    return { range: an.range, start: start + offset, end: end + offset, feather, pos, rot, scl, op };
  }

  // returns lines with per-char metrics in layer-local coordinates (y up)
  function layout(layer, time) {
    const t = layer.text;
    const size = t.size;
    const lines = splitLines(t.content);
    const tracking = (t.tracking || 0) / 1000 * size;
    const lh = (t.lineHeight || 1.2) * size;
    const align = t.align || 'left';
    const result = [];
    const charW = [];
    for (const line of lines) {
      const chars = Array.from(line);
      const widths = chars.map(ch => measure(ch, t, size) + tracking);
      const total = widths.reduce((a, b) => a + b, 0) - (chars.length ? tracking : 0);
      let x = 0;
      if (align === 'center') x = -total / 2;
      else if (align === 'right') x = -total;
      const out = [];
      for (let i = 0; i < chars.length; i++) {
        out.push({ ch: chars[i], x: x, w: widths[i], cx: x + widths[i] / 2 });
        x += widths[i];
      }
      result.push({ chars: out, width: total, index: result.length });
    }
    // per-char animator state
    const an = animatorRange(layer, time);
    if (an) {
      let idx = 0;
      const total = result.reduce((a, l) => a + Math.max(1, l.chars.length), 0);
      for (const line of result) {
        for (const c of line.chars) {
          let u = 0.5;
          const n = Math.max(1, total - 1);
          const pos = total <= 1 ? 0.5 : idx / n;
          const rangePos = (pos * 100 - (100 - (an.end - an.start))) / 100;
          let k = 1;
          if (an.range === 'char' || an.range === 'word' || an.range === 'line') {
            const p = pos * 100;
            if (p < Math.min(an.start, an.end)) k = 0;
            else if (p > Math.max(an.start, an.end)) k = 0;
            else if (an.feather > 0) {
              const d = Math.min(Math.abs(p - an.start), Math.abs(p - an.end));
              k = Math.min(1, d / Math.max(0.0001, an.feather));
            }
          }
          c.anim = k;
          idx++;
        }
      }
    }
    return { lines: result, lineHeight: lh, size, align, anim: an };
  }

  function drawText(ctx, layer, time) {
    const t = layer.text;
    const L = layout(layer, time);
    ctx.fillStyle = t.color || '#ffffff';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = fontString(t);
    for (let li = 0; li < L.lines.length; li++) {
      const line = L.lines[li];
      const y = -li * L.lineHeight;
      for (const c of line.chars) {
        const a = c.anim;
        if (a !== undefined && a <= 0.001) continue;
        ctx.save();
        let x = c.cx;
        let rot = 0, sc = 1, dy = 0;
        if (a !== undefined) {
          const an = L.anim;
          const k = a;
          rot = an.rot * k;
          sc = 1 + (an.scl - 100) / 100 * k;
          dy = an.pos[1] * k;
          x += an.pos[0] * k;
          ctx.globalAlpha *= (an.op / 100) * k + (1 - k);
        }
        ctx.translate(x, y + dy);
        if (rot) ctx.rotate(-rot * Math.PI / 180);
        if (sc !== 1) ctx.scale(sc, sc);
        ctx.fillText(c.ch, 0, 0);
        ctx.restore();
      }
    }
  }

  // glyph contours in layer-local coords (y up), with per-char transforms applied
  function textContours(layer, time) {
    const t = layer.text;
    const L = layout(layer, time);
    const size = t.size;
    const contours = [];
    for (let li = 0; li < L.lines.length; li++) {
      const line = L.lines[li];
      const y = -li * L.lineHeight;
      for (const c of line.chars) {
        if (c.ch === ' ') continue;
        let cs = G.glyphContours(c.ch, size, t.weight);
        const a = c.anim;
        let ox = 0, oy = 0, rot = 0, sc = 1;
        if (a !== undefined) {
          const an = L.anim;
          ox = an.pos[0] * a; oy = an.pos[1] * a;
          rot = an.rot * a; sc = 1 + (an.scl - 100) / 100 * a;
        }
        const cos = Math.cos(rot * Math.PI / 180), sin = Math.sin(rot * Math.PI / 180);
        for (const ct of cs) {
          const pts = ct.pts.map(p => {
            const px = p[0] * size * sc, py = p[1] * size * sc;
            return [
              c.cx + px * cos - py * sin + ox,
              y + px * sin + py * cos + oy,
            ];
          });
          contours.push({ pts, hole: ct.hole });
        }
      }
    }
    return contours;
  }

  global.AEText = { layout, drawText, textContours, measure, measureLine, familyOf, fontString, splitLines };
})(window);