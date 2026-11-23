/* Packed Noto Sans SC Bold outlines. */
(function (G) {
  const AE = (G.AE = G.AE || {});
  const font = (AE.font = {
    ready: false,
    meta: null,
    map: new Map(),
    upem: 1000,
    ascent: 880,
    descent: -120,
    error: "",
  });

  function load(buf) {
    const dv = new DataView(buf);
    const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (magic !== "FGL1") throw new Error("字形数据无效");
    font.upem = dv.getUint16(6, true);
    font.ascent = dv.getInt16(8, true);
    font.descent = dv.getInt16(10, true);
    const count = dv.getUint32(14, true);
    const cmapOff = dv.getUint32(18, true);
    const glyphOff = dv.getUint32(22, true);
    font.map.clear();
    for (let i = 0; i < count; i++) {
      const cp = dv.getUint32(cmapOff + i * 8, true);
      const off = dv.getUint32(cmapOff + i * 8 + 4, true);
      font.map.set(cp, off);
    }
    font._dv = dv;
    font._glyphOff = glyphOff;
    font.ready = true;
  }

  function glyph(cp) {
    if (!font.ready) return null;
    const off = font.map.get(cp);
    if (off == null) return null;
    const cached = font._cache && font._cache.get(cp);
    if (cached) return cached;
    const dv = font._dv;
    let o = off;
    const advance = dv.getUint16(o, true); o += 2;
    const nc = dv.getUint16(o, true); o += 2;
    const contours = [];
    for (let c = 0; c < nc; c++) {
      const n = dv.getUint16(o, true); o += 2;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const x = dv.getInt16(o, true); o += 2;
        const y = dv.getInt16(o, true); o += 2;
        pts.push({ x, y });
      }
      if (pts.length >= 3) contours.push(pts);
    }
    const g = { advance, contours };
    if (!font._cache) font._cache = new Map();
    font._cache.set(cp, g);
    return g;
  }

  function has(cp) { return font.ready && font.map.has(cp); }

  function measureLine(line, scale, tracking) {
    let w = 0;
    const chars = Array.from(line);
    chars.forEach((ch, i) => {
      const g = glyph(ch.codePointAt(0));
      w += (g ? g.advance : font.upem * 0.5) * scale;
      if (i < chars.length - 1) w += tracking;
    });
    return w;
  }

  function layout(text, size, tracking, leading, align) {
    const scale = size / font.upem;
    const lines = String(text == null ? "" : text).split("\n");
    const lh = size * (leading == null ? 1.25 : leading);
    const widths = lines.map((ln) => measureLine(ln, scale, tracking || 0));
    const maxW = widths.reduce((m, w) => Math.max(m, w), 0);
    const blockH = Math.max(lh, lines.length * lh);
    const glyphs = [];
    const missing = [];
    lines.forEach((ln, li) => {
      let x = 0;
      if (align === "center") x = -widths[li] / 2;
      else if (align === "right") x = -widths[li];
      else x = -maxW / 2;
      const yBase = blockH / 2 - lh * 0.78 - li * lh;
      Array.from(ln).forEach((ch, ci, arr) => {
        const cp = ch.codePointAt(0);
        const g = glyph(cp);
        if (!g && ch.trim()) missing.push(ch);
        const adv = (g ? g.advance : font.upem * 0.5) * scale;
        const contours = (g ? g.contours : []).map((c) => c.map((p) => ({ x: p.x * scale + x, y: p.y * scale + yBase })));
        glyphs.push({
          ch, cp, contours,
          x, y: yBase, w: adv, h: size,
          cx: x + adv * 0.5,
          cy: yBase + size * 0.35,
        });
        x += adv + (ci < arr.length - 1 ? (tracking || 0) : 0);
      });
    });
    // Center visual bounds so extrusion sits on the origin.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
    for (const gl of glyphs) for (const c of gl.contours) for (const p of c) {
      any = true;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (any) {
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      for (const gl of glyphs) {
        gl.x -= cx; gl.cx -= cx; gl.y -= cy; gl.cy -= cy;
        gl.contours = gl.contours.map((c) => c.map((p) => ({ x: p.x - cx, y: p.y - cy })));
      }
      minX -= cx; maxX -= cx; minY -= cy; maxY -= cy;
    } else { minX = minY = maxX = maxY = 0; }
    return { glyphs, width: maxW, height: blockH, missing, bounds: { minX, minY, maxX, maxY } };
  }

  function initFromGlobal() {
    const pack = G.FORGE_FONT;
    if (!pack || !pack.b64) {
      font.error = "缺少字形数据";
      return false;
    }
    const bin = Uint8Array.from(atob(pack.b64), (c) => c.charCodeAt(0));
    load(bin.buffer);
    font.meta = pack.meta || {};
    return true;
  }

  font.load = load;
  font.glyph = glyph;
  font.has = has;
  font.layout = layout;
  font.initFromGlobal = initFromGlobal;
})(typeof window !== "undefined" ? window : globalThis);
