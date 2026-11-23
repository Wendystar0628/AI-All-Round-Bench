/* ============================================================
   font.js — 文字排版与字形轮廓提取（浏览器字体 → 矢量路径）
   说明：字形通过高分辨率光栅描摹得到矢量轮廓，因此任意系统可用
         中文字体都能转为几何，参与形变、变形与三维挤出。
   ============================================================ */
(function (global) {
  'use strict';
  const { P, P: PP } = { P: U };
  const P2 = (x, y) => ({ x, y, ix: 0, iy: 0, ox: 0, oy: 0 });

  const FONT_LIST = [
    { name: 'Microsoft YaHei', label: '微软雅黑', cjk: true },
    { name: 'SimHei', label: '黑体', cjk: true },
    { name: 'SimSun', label: '宋体', cjk: true },
    { name: 'KaiTi', label: '楷体', cjk: true },
    { name: 'FangSong', label: '仿宋', cjk: true },
    { name: 'DengXian', label: '等线', cjk: true },
    { name: 'STKaiti', label: '华文楷体', cjk: true },
    { name: 'Source Han Sans SC', label: '思源黑体', cjk: true },
    { name: 'Noto Sans SC', label: 'Noto Sans SC', cjk: true },
    { name: 'Impact', label: 'Impact', cjk: false },
    { name: 'Arial Black', label: 'Arial Black', cjk: false },
    { name: 'Georgia', label: 'Georgia', cjk: false }
  ];
  const available = [];
  function detectFonts() {
    const c = document.createElement('canvas'); c.width = 160; c.height = 80;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const probe = '锻A';
    function sig(font) {
      ctx.clearRect(0, 0, 160, 80);
      ctx.fillStyle = '#000';
      ctx.font = `bold 48px ${font}`;
      ctx.textBaseline = 'top';
      ctx.fillText(probe, 4, 8);
      const d = ctx.getImageData(0, 0, 160, 80).data;
      let h = 0;
      for (let i = 3; i < d.length; i += 4) h = (h * 31 + d[i]) % 999999937;
      return h;
    }
    const fallback = sig('serif');
    for (const f of FONT_LIST) {
      const s = sig(`"${f.name}"`);
      // 若与默认字体完全一致，认为不可用（或与默认相同）
      f.available = s !== fallback;
      if (f.available) available.push(f);
    }
    if (!available.length) available.push({ name: 'sans-serif', label: '默认字体', cjk: true });
    return available;
  }

  /* ---------- 边界追踪 ---------- */
  const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  function traceContours(mask, w, h) {
    const visited = new Uint8Array(w * h);
    const out = [];
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : mask[y * w + x];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x] || visited[y * w + x]) continue;
        if (at(x, y - 1)) continue; // 只从上边缘开始
        // Moore 邻域追踪
        const pts = [];
        let cx = x, cy = y, dir = 7; // 起始回溯方向
        let guard = 0;
        const sx = x, sy = y;
        do {
          visited[cy * w + cx] = 1;
          pts.push([cx, cy]);
          let found = false;
          for (let k = 0; k < 8; k++) {
            const d = (dir + k) % 8;
            const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
            if (at(nx, ny)) { cx = nx; cy = ny; dir = (d + 5) % 8; found = true; break; }
          }
          if (!found) break;
          guard++;
        } while ((cx !== sx || cy !== sy) && guard < 200000);
        if (pts.length > 6) out.push(pts);
      }
    }
    return out;
  }

  /* ---------- 单字描摹 ---------- */
  const glyphCache = new Map();
  const TRACE_SIZE = 200;      // 描摹字号
  const TRACE_PAD = 0.32;      // 上下留白比例
  function glyphContours(ch, fontFamily) {
    const key = ch + '|' + fontFamily;
    if (glyphCache.has(key)) return glyphCache.get(key);
    const S = TRACE_SIZE;
    const W = Math.ceil(S * 1.5), H = Math.ceil(S * (1 + TRACE_PAD * 2));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = `${S}px ${fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const baseline = Math.round(S * (1 + TRACE_PAD * 0.55));
    const ox = Math.round(S * 0.22);
    ctx.fillText(ch, ox, baseline);
    const img = ctx.getImageData(0, 0, W, H).data;
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = img[i * 4 + 3] > 110 ? 1 : 0;
    const raw = traceContours(mask, W, H);
    const contours = [];
    for (const r of raw) {
      const simp = U.simplify(r, 1.15, true);
      if (simp.length >= 3) {
        // 转为 em 坐标（原点：基线左端；y 向下为正）
        const pts = simp.map(p => [ (p[0] - ox) / S, (p[1] - baseline) / S ]);
        const c = PT.smoothToContour(pts, true, 0.62, 1);
        contours.push(c);
      }
    }
    // 按面积排序，保证大轮廓在前
    contours.sort((a, b) => Math.abs(U.polygonArea(PT.flattenContour(b, 0.01))) - Math.abs(U.polygonArea(PT.flattenContour(a, 0.01))));
    const res = { contours, width: 1, ascent: 0.88, descent: 0.12 };
    glyphCache.set(key, res);
    return res;
  }

  /* ---------- 排版 ---------- */
  function parseFont(fontStr) {
    const m = /(\d+(?:\.\d+)?)px\s+(.*)/.exec(fontStr);
    return { size: m ? parseFloat(m[1]) : 100, family: m ? m[2] : fontStr };
  }
  function layoutText(text, style) {
    const size = style.fontSize || 100;
    const family = style.fontFamily || 'Microsoft YaHei';
    const lh = (style.lineHeight === undefined ? 1.2 : style.lineHeight) * size;
    const tracking = (style.tracking || 0) * size / 1000;
    const align = style.align || 'center';
    const lines = String(text || '').split('\n');
    const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.font = `${size}px ${family}`;
    const outLines = [];
    let maxW = 0;
    for (const ln of lines) {
      const chars = [];
      let x = 0;
      for (const ch of ln) {
        const w = ctx.measureText(ch).width;
        chars.push({ ch, x, w, adv: w + tracking });
        x += w + tracking;
      }
      const lw = x - (chars.length ? tracking : 0);
      maxW = Math.max(maxW, lw);
      outLines.push({ text: ln, chars, width: lw });
    }
    const height = lh * lines.length;
    for (const l of outLines) {
      let off = 0;
      if (align === 'center') off = -l.width / 2;
      else if (align === 'right') off = -l.width;
      for (const c of l.chars) c.x += off;
    }
    return { lines: outLines, width: maxW, height, lineHeight: lh, size, family };
  }

  // 文字 → 路径（原点在整块文字中心）
  function textToPath(text, style) {
    const L = layoutText(text, style);
    const contours = [];
    const cx = 0, cy = -L.height / 2;
    L.lines.forEach((line, li) => {
      const baseline = cy + li * L.lineHeight + L.size * 0.86;
      for (const c of line.chars) {
        if (c.ch === ' ') continue;
        const g = glyphContours(c.ch, L.family);
        const scale = L.size;
        for (const gc of g.contours) {
          const pts = gc.pts.map(p => {
            const q = P2(c.x + p.x * scale, baseline + p.y * scale);
            q.ix = p.ix * scale; q.iy = p.iy * scale; q.ox = p.ox * scale; q.oy = p.oy * scale;
            return q;
          });
          contours.push({ closed: gc.closed, pts });
        }
      }
    });
    // 居中
    const bb = PT.pathBBox({ contours });
    const dx = -(bb.x + bb.w / 2), dy = -(bb.y + bb.h / 2);
    const path = PT.translatePath({ contours }, dx, dy);
    return { path, width: bb.w, height: bb.h, layout: L };
  }

  // 单字路径（原点居中）
  function charToPath(ch, fontFamily, size) {
    const g = glyphContours(ch, fontFamily);
    const contours = g.contours.map(gc => ({
      closed: gc.closed,
      pts: gc.pts.map(p => {
        const q = P2(p.x * size, p.y * size);
        q.ix = p.ix * size; q.iy = p.iy * size; q.ox = p.ox * size; q.oy = p.oy * size;
        return q;
      })
    }));
    const bb = PT.pathBBox({ contours });
    return { path: PT.translatePath({ contours }, -(bb.x + bb.w / 2), -(bb.y + bb.h / 2)), bbox: bb };
  }

  global.FONT = {
    FONT_LIST, detectFonts, glyphContours, layoutText, textToPath, charToPath, parseFont,
    get available() { return available; }
  };
})(window);
