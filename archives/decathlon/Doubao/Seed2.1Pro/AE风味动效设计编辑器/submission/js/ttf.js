/* ============================================================
 * ttf.js — 极简 TrueType 解析器
 * 从随项目提供的 SimHei（黑体）提取字形轮廓（em 归一化，y 向上），
 * 支持 cmap format 4/12、复合字形、二次曲线转三次贝塞尔。
 * 字形范围：随字体覆盖（SimHei 含 GB2312 全部常用汉字、拉丁、数字、标点）。
 * ============================================================ */
(function (global) {
'use strict';

const FontLib = {
  ready: false,
  fontFace: null,
  supported: 'SimHei 黑体随项目打包，覆盖 GB2312 常用汉字、拉丁字母、数字与常用标点；生僻字可能缺字（显示为空心方框轮廓）。',

  async init(b64) {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    this._parse(bin.buffer);
    try {
      this.fontFace = new FontFace('SimHeiEmbedded', bin);
      await this.fontFace.load();
      document.fonts.add(this.fontFace);
    } catch (e) { /* 轮廓不依赖 FontFace */ }
    this.ready = true;
  },

  _parse(buf) {
    const dv = new DataView(buf);
    this.sfnt = buf;
    this.dv = dv;
    this.numTables = dv.getUint16(4);
    this.tables = {};
    for (let i = 0; i < this.numTables; i++) {
      const o = 12 + i * 16;
      const tag = String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
      this.tables[tag] = { offset: dv.getUint32(o + 8), length: dv.getUint32(o + 12) };
    }
    const head = this.tables.head.offset;
    this.unitsPerEm = dv.getUint16(head + 18);
    this.indexToLocFormat = dv.getInt16(head + 50);
    const maxp = this.tables.maxp.offset;
    this.numGlyphs = dv.getUint16(maxp + 4);
    const hhea = this.tables.hhea.offset;
    this.ascent = dv.getInt16(hhea + 4);
    this.descent = dv.getInt16(hhea + 6);
    this.lineGap = dv.getInt16(hhea + 8);
    this.numLongHMetrics = dv.getUint16(hhea + 34);
    this._parseHmtx();
    this._parseCmap();
  },

  _parseHmtx() {
    const o = this.tables.hmtx.offset, dv = this.dv;
    this.advanceWidths = new Float64Array(this.numGlyphs);
    this.lsb = new Float64Array(this.numGlyphs);
    for (let i = 0; i < this.numGlyphs; i++) {
      const off = i < this.numLongHMetrics ? o + i * 4 : o + (this.numLongHMetrics - 1) * 4;
      this.advanceWidths[i] = dv.getUint16(off);
      this.lsb[i] = dv.getInt16(off + 2);
    }
  },

  _parseCmap() {
    const base = this.tables.cmap.offset, dv = this.dv;
    const n = dv.getUint16(base + 2);
    let best = null, bestScore = -1;
    for (let i = 0; i < n; i++) {
      const o = base + 4 + i * 8;
      const pid = dv.getUint16(o), psid = dv.getUint16(o + 2), off = dv.getUint32(o + 4);
      let score = 0;
      if (pid === 3 && psid === 1) score = 10;
      else if (pid === 0 && psid === 3) score = 9;
      else if (pid === 3 && psid === 10) score = 8;
      else score = 1;
      if (score > bestScore) { bestScore = score; best = base + off; }
    }
    this.cmapOffset = best;
    const fmt = dv.getUint16(best);
    if (fmt === 4) this._cmap4(best);
    else if (fmt === 12) this._cmap12(best);
    else this.charToGlyph = new Map();
    this.glyphCache = new Map();
  },
  _cmap4(o) {
    const dv = this.dv;
    const segX2 = dv.getUint16(o + 6);
    const segCount = segX2 / 2;
    const endP = o + 14;
    const startP = endP + segX2 + 2;
    const deltaP = startP + segX2;
    const rangeP = deltaP + segX2;
    const m = new Map();
    for (let s = 0; s < segCount; s++) {
      const end = dv.getUint16(endP + s * 2);
      const start = dv.getUint16(startP + s * 2);
      const delta = dv.getInt16(deltaP + s * 2);
      const rangeOff = dv.getUint16(rangeP + s * 2);
      for (let c = start; c <= end && c !== 0xFFFF; c++) {
        let g;
        if (rangeOff === 0) g = (c + delta) & 0xFFFF;
        else {
          const addr = rangeP + s * 2 + rangeOff + (c - start) * 2;
          if (addr >= this.sfnt.byteLength) continue;
          g = dv.getUint16(addr);
          if (g !== 0) g = (g + delta) & 0xFFFF;
        }
        m.set(c, g);
      }
    }
    this.charToGlyph = m;
  },
  _cmap12(o) {
    const dv = this.dv;
    const ng = dv.getUint32(o + 12);
    const m = new Map();
    for (let i = 0; i < ng; i++) {
      const g = o + 16 + i * 12;
      const start = dv.getUint32(g), end = dv.getUint32(g + 4), gid = dv.getUint32(g + 8);
      for (let c = start; c <= end; c++) m.set(c, gid + (c - start));
    }
    this.charToGlyph = m;
  },

  glyphIndex(ch) {
    const code = ch.codePointAt(0);
    return this.charToGlyph.get(code) ?? 0;
  },

  _glyphOffset(gid) {
    const dv = this.dv, loca = this.tables.loca.offset;
    if (this.indexToLocFormat === 0) {
      return dv.getUint16(loca + gid * 2) * 2;
    }
    return dv.getUint32(loca + gid * 4);
  },

  /* 返回字体单位的轮廓（y向上），含复合字形递归 */
  glyphContoursUnits(gid) {
    if (this.glyphCache.has(gid)) return this.glyphCache.get(gid);
    const glyfBase = this.tables.glyf.offset;
    const off = glyfBase + this._glyphOffset(gid);
    const res = this._readGlyph(off, [1, 0, 0, 1, 0, 0]);
    this.glyphCache.set(gid, res);
    return res;
  },

  _readGlyph(off, m) {
    const dv = this.dv;
    if (off + 10 > this.sfnt.byteLength) return { contours: [], bbox: [0, 0, 0, 0] };
    const numContours = dv.getInt16(off);
    if (numContours === 0) return { contours: [], bbox: [0, 0, 0, 0] };
    if (numContours < 0) return this._readCompound(off, m);
    const xMin = dv.getInt16(off + 2), yMin = dv.getInt16(off + 4),
          xMax = dv.getInt16(off + 6), yMax = dv.getInt16(off + 8);
    const endPts = [];
    for (let i = 0; i < numContours; i++) endPts.push(dv.getUint16(off + 10 + i * 2));
    const coordStart = off + 10 + numContours * 2 + 2;
    let p = coordStart;
    const flags = [];
    while (flags.length <= endPts[endPts.length - 1]) {
      const f = dv.getUint8(p++);
      const repeat = (f & 8) ? dv.getUint8(p++) : 1;
      for (let r = 0; r < repeat; r++) flags.push(f);
    }
    const n = flags.length;
    const xs = new Int32Array(n), ys = new Int32Array(n);
    let x = 0;
    for (let i = 0; i < n; i++) {
      const f = flags[i];
      if (f & 2) { const d = dv.getUint8(p++); x += (f & 16) ? d : -d; }
      else if (!(f & 16)) { x += dv.getInt16(p); p += 2; }
      xs[i] = x;
    }
    let y = 0;
    for (let i = 0; i < n; i++) {
      const f = flags[i];
      if (f & 4) { const d = dv.getUint8(p++); y += (f & 32) ? d : -d; }
      else if (!(f & 32)) { y += dv.getInt16(p); p += 2; }
      ys[i] = y;
    }
    const on = flags.map(f => !!(f & 1));
    const contours = [];
    let start = 0;
    const tx = (xx, yy) => [m[0] * xx + m[2] * yy + m[4], m[1] * xx + m[3] * yy + m[5]];
    for (let c = 0; c < numContours; c++) {
      const end = endPts[c];
      const raw = [];
      for (let i = start; i <= end; i++) raw.push({ x: xs[i], y: ys[i], on: on[i] });
      const cubic = this._quadsToCubic(raw, tx);
      if (cubic.pts.length >= 2) contours.push(cubic);
      start = end + 1;
    }
    const b0 = tx(xMin, yMin), b1 = tx(xMax, yMax);
    return {
      contours,
      bbox: [Math.min(b0[0], b1[0]), Math.min(b0[1], b1[1]), Math.max(b0[0], b1[0]), Math.max(b0[1], b1[1])]
    };
  },

  _readCompound(off, m) {
    const dv = this.dv;
    let p = off + 10;
    const contours = [];
    let bbox = [1e18, 1e18, -1e18, -1e18];
    for (;;) {
      const flags = dv.getUint16(p);
      const gid = dv.getUint16(p + 2);
      p += 4;
      let a = 1, b = 0, c = 0, d = 1, e = 0, f = 0;
      if (flags & (1 << 3)) { // WE_HAVE_AN_X_AND_Y_SCALE
        a = dv.getInt16(p) / 16384; p += 2;
        d = dv.getInt16(p) / 16384; p += 2;
      } else if (flags & (1 << 6)) { // WE_HAVE_A_UNIFORM_SCALE
        const sc = dv.getInt16(p) / 16384; p += 2; a = sc; d = sc;
      } else if (flags & (1 << 7)) { // WE_HAVE_A_TWO_BY_TWO
        a = dv.getInt16(p) / 16384; p += 2;
        b = dv.getInt16(p) / 16384; p += 2;
        c = dv.getInt16(p) / 16384; p += 2;
        d = dv.getInt16(p) / 16384; p += 2;
      }
      if (flags & 1) { // ARGS_ARE_XY_VALUES
        if (flags & 8) { // SIGNED_INT8
          e = dv.getInt8(p); f = dv.getInt8(p + 1); p += 2;
        } else {
          e = dv.getInt16(p); f = dv.getInt16(p + 2); p += 4;
        }
      } else {
        p += 2; // ARG_1_AND_2_ARE_WORDS: point indices, skip
      }
      const nm = [
        m[0] * a + m[2] * c, m[1] * a + m[3] * c,
        m[0] * b + m[2] * d, m[1] * b + m[3] * d,
        m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]
      ];
      const sub = this._readGlyph(this.tables.glyf.offset + this._glyphOffset(gid), nm);
      contours.push(...sub.contours);
      bbox[0] = Math.min(bbox[0], sub.bbox[0]); bbox[1] = Math.min(bbox[1], sub.bbox[1]);
      bbox[2] = Math.max(bbox[2], sub.bbox[2]); bbox[3] = Math.max(bbox[3], sub.bbox[3]);
      if (!(flags & (1 << 5))) break;
    }
    if (!contours.length) bbox = [0, 0, 0, 0];
    return { contours, bbox };
  },

  /* TTF 二次点列 -> 三次贝塞尔轮廓 {closed, pts, in, out}（in/out 为切向量偏移） */
  _quadsToCubic(raw, tx) {
    const pts = [], ins = [], outs = [];
    if (!raw.length) return { closed: true, pts, in: ins, out: outs };
    let seq = raw.slice();
    const firstOn = seq.findIndex(p => p.on);
    if (firstOn === -1) {
      seq = [{ x: (seq[seq.length - 1].x + seq[0].x) / 2, y: (seq[seq.length - 1].y + seq[0].y) / 2, on: true, implied: true }, ...seq];
    } else if (firstOn > 0) {
      seq = seq.slice(firstOn).concat(seq.slice(0, firstOn));
    }
    /* 归一化：相邻 on/on 插入退化为直线的控制点；环绕离屏点用中点 */
    const norm = [{ x: seq[0].x, y: seq[0].y, on: true }];
    for (let i = 1; i < seq.length; i++) {
      const prev = norm[norm.length - 1], cur = seq[i];
      if (prev.on && cur.on) norm.push({ x: (prev.x + cur.x) / 2, y: (prev.y + cur.y) / 2, on: false });
      norm.push(cur);
    }
    if (!norm[norm.length - 1].on) {
      norm.push({ x: (seq[seq.length - 1].x + seq[0].x) / 2, y: (seq[seq.length - 1].y + seq[0].y) / 2, on: true, implied: true });
    }
    /* norm: on, off, on, off, on ... 闭合到首点 */
    for (let i = 0; i < norm.length; i += 2) {
      const a = norm[i], q = norm[i + 1], b = norm[(i + 2) % norm.length];
      if (!q || !b) break;
      const A = tx(a.x, a.y), Q = tx(q.x, q.y), B = tx(b.x, b.y);
      pts.push(A);
      outs.push([2 / 3 * (Q[0] - A[0]), 2 / 3 * (Q[1] - A[1])]);
      ins.push([2 / 3 * (Q[0] - B[0]), 2 / 3 * (Q[1] - B[1])]);
    }
    if (pts.length === 1) pts.push(pts[0]);
    return { closed: true, pts, in: ins, out: outs };
  },

  /* ---- 对外：字符轮廓，归一化到 fontSize 像素（y向上，原点在该字符基线原点） ---- */
  charContours(ch, fontSize) {
    const gid = this.glyphIndex(ch);
    const s = fontSize / this.unitsPerEm;
    const g = this.glyphContoursUnits(gid);
    if (!g.contours.length) return { contours: [], advance: this.advanceWidths[gid] * s, gid, missing: gid === 0 };
    const contours = g.contours.map(c => ({
      closed: true,
      pts: c.pts.map(p => [p[0] * s, p[1] * s]),
      in: c.in.map(p => [p[0] * s, p[1] * s]),
      out: c.out.map(p => [p[0] * s, p[1] * s])
    }));
    return { contours, advance: this.advanceWidths[gid] * s, gid, bbox: g.bbox.map((v, i) => v * s), missing: false };
  },

  /* 多行排版：返回每字的轮廓（坐标原点位于文本块左下角，y向上） */
  layout(text, fontSize, tracking, lineHeightPct, align, verticalScalePct) {
    tracking = tracking || 0;
    const lineH = fontSize * (lineHeightPct || 120) / 100;
    const vs = (verticalScalePct || 100) / 100;
    const lines = String(text).split('\n');
    const glyphs = [];
    const lineWidths = [];
    for (const ln of lines) {
      let w = 0;
      for (const ch of ln) w += this.charContours(ch, fontSize).advance + tracking;
      lineWidths.push(Math.max(0, w - tracking));
    }
    const blockW = Math.max(...lineWidths, 0);
    const blockH = lineH * lines.length;
    for (let li = 0; li < lines.length; li++) {
      const ln = lines[li];
      let x = align === 'center' ? (blockW - lineWidths[li]) / 2 : align === 'right' ? blockW - lineWidths[li] : 0;
      const baseY = blockH - lineH * li - (lineH - fontSize) / 2 - fontSize * 0.18;
      for (const ch of ln) {
        const g = this.charContours(ch, fontSize);
        const contours = g.contours.map(c => ({
          closed: true,
          pts: c.pts.map(p => [p[0] + x, p[1] * vs + baseY]),
          in: c.in.map(p => [p[0], p[1] * vs]),
          out: c.out.map(p => [p[0], p[1] * vs])
        }));
        glyphs.push({ ch, x, baseY, advance: g.advance, tracking, contours, missing: g.missing, line: li });
        x += g.advance + tracking;
      }
      glyphs.push({ ch: '\n', x, baseY: 0, advance: 0, contours: [], line: li });
    }
    return { glyphs, width: blockW, height: blockH, lineHeight: lineH, lines: lines.length };
  },

  ascent(fontSize) { return this.ascent / this.unitsPerEm * fontSize; },
  descent(fontSize) { return this.descent / this.unitsPerEm * fontSize; }
};

global.FontLib = FontLib;
})(window);
