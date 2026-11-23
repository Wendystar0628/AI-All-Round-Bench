/* 文字：字体加载（内置 Noto Sans Hans 子集，覆盖 GB2312 一级二级常用字符与 ASCII）、排版与字形轮廓。
 * 字形轮廓由 opentype.js 解析字体得到，转换为与形状相同的轮廓表示，可参与变形、挤出与逐字动画。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const U = AE.U;
  const P = AE.Path;
  const Text = (AE.Text = {});

  // 内置字体清单；coverage 说明支持范围
  Text.FONTS = {
    'hans-bold': { label: '思源黑体 Bold（Noto Sans Hans）', src: 'FONT_HANS_BOLD_B64' },
    'hans-regular': { label: '思源黑体 Regular（Noto Sans Hans）', src: 'FONT_HANS_REGULAR_B64' },
  };
  Text.COVERAGE = '内置字符范围：GB2312 全部汉字（约 7000 字）、ASCII、全角标点与常用符号；其它字符显示为缺字提示。';
  const fontCache = {};
  const layoutCache = new Map();

  Text.font = (name) => {
    if (fontCache[name]) return fontCache[name];
    const def = Text.FONTS[name] || Text.FONTS['hans-bold'];
    const b64 = window[def.src];
    if (!b64 || !window.opentype) return null;
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    fontCache[name] = window.opentype.parse(buf.buffer);
    return fontCache[name];
  };

  // 笔画包围盒（书写顺序）：每个字形轮廓视为一笔；过小的孔洞去掉；合为一条轮廓的大笔画（如撇捺）按中线切成左右两笔
  // 返回的坐标与 layout 一致（以文字块中心为原点）。opts 同 layout。
  Text.strokeBoxes = (opts) => {
    const lay = Text.layout(opts);
    let boxes = [];
    lay.glyphs.forEach((g) =>
      g.contours.forEach((c) => {
        const b = P.bounds([c]);
        if (!b) return;
        boxes.push({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, area: (b.x1 - b.x0) * (b.y1 - b.y0) });
      })
    );
    if (!boxes.length) return [];
    const maxA = Math.max(1, ...boxes.map((b) => b.area));
    boxes = boxes.filter((b) => b.area > maxA * 0.002);
    const dots = [], big = [];
    boxes.forEach((b) => {
      if (b.area < maxA * 0.5) return dots.push(b);
      const cx = (b.x0 + b.x1) / 2, top = b.y0 + (b.y1 - b.y0) * 0.22;
      big.push({ x0: b.x0, y0: top, x1: cx, y1: b.y1 }, { x0: cx, y0: top, x1: b.x1, y1: b.y1 });
    });
    // 点在前（自左而右），撇捺在后（自左而右）
    dots.sort((a, b) => (a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2);
    big.sort((a, b) => (a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2);
    return dots.concat(big);
  };

  // 排版：返回每个字符的轮廓（已居中到原点），以及字符索引信息
  // opts: { text, font, size, leading, tracking(1/1000 em), align }
  Text.layout = (opts) => {
    const key = JSON.stringify(opts);
    if (layoutCache.has(key)) return layoutCache.get(key);
    const font = Text.font(opts.font);
    const size = Math.max(1, opts.size || 100);
    const res = { glyphs: [], missing: 0, lines: 0, bounds: null, ok: !!font };
    if (!font) {
      layoutCache.set(key, res);
      return res;
    }
    const scale = size / font.unitsPerEm;
    const lines = String(opts.text || '').replace(/\r/g, '').split('\n');
    const leading = opts.leading || size * 1.2;
    const tracking = (opts.tracking || 0) / 1000 * size;
    res.lines = lines.length;
    const lineWidths = lines.map((ln) => {
      let w = 0;
      for (const ch of ln) {
        const g = font.charToGlyph(ch);
        w += g.advanceWidth * scale + tracking;
      }
      return Math.max(0, w - tracking);
    });
    const maxW = Math.max(0, ...lineWidths);
    const ascent = (font.ascender || font.unitsPerEm * 0.8) * scale;
    const descent = (font.descender || -font.unitsPerEm * 0.2) * scale;
    const blockH = (lines.length - 1) * leading + ascent - descent;
    let charIdx = 0;
    let wordRun = -1; // 词：以空白分隔的连续字符（换行也会断开）
    const align = opts.align || 'center';
    lines.forEach((ln, li) => {
      let x = align === 'left' ? 0 : align === 'right' ? maxW - lineWidths[li] : (maxW - lineWidths[li]) / 2;
      const baseline = li * leading + ascent;
      const chars = Array.from(ln);
      let inRun = false;
      chars.forEach((ch, ci) => {
        if (ch.trim() === '') inRun = false;
        else if (!inRun) {
          wordRun++;
          inRun = true;
        }
        const g = font.charToGlyph(ch);
        const adv = g.advanceWidth * scale;
        const missing = g.index === 0 && ch.trim() !== '' && ch.charCodeAt(0) > 32;
        if (missing) res.missing++;
        const path = font.getPath(ch, x, baseline, size);
        const contours = missing || ch.trim() === '' ? [] : P.contoursFromCommands(path.commands, 1, 0, 0, true);
        res.glyphs.push({ ch, index: charIdx, line: li, contours, adv, x, baseline, missing, word: ch.trim() === '' ? -1 : wordRun });
        x += adv + tracking;
        charIdx++;
      });
    });
    res.words = wordRun + 1;
    // 整体按字形包围盒居中到原点（锚点默认位于文字块中心）
    const b = P.bounds(res.glyphs.flatMap((g) => g.contours));
    const dx = b ? -b.cx : 0;
    const dy = b ? -b.cy : 0;
    res.glyphs.forEach((g) => {
      g.contours = g.contours.map((c) => ({ closed: c.closed, pts: c.pts.map((p) => [p[0] + dx, p[1] + dy]) }));
      g.cx = 0;
      g.cy = 0;
      const gb = P.bounds(g.contours);
      if (gb) {
        g.cx = gb.cx;
        g.cy = gb.cy;
      } else {
        g.cx = g.x + dx + g.adv / 2;
        g.cy = g.baseline + dy - size * 0.35;
      }
    });
    res.bounds = b ? { x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy } : null;
    if (layoutCache.size > 300) layoutCache.clear();
    layoutCache.set(key, res);
    return res;
  };
})();
