/* font.js — 内置「锻造黑」笔画字体 + 系统字体光栅描边回退；文字排版 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, G = AE.G;
  const F = AE.Font = {};

  // ===== 笔画数据（100×100 em 盒，y 向下）=====
  // s: [类型, 点...]  'p' 折线（尖角）, 'c' 平滑曲线(Catmull-Rom)
  const H = (x0, x1, y) => ['p', [x0, y], [x1, y]];
  const V = (x, y0, y1) => ['p', [x, y0], [x, y1]];
  const P = (...a) => ['p', ...a];
  const C = (...a) => ['c', ...a];
  const D = {};
  const def = (ch, strokes, w) => { D[ch] = { strokes, w: w || 0 }; };
  def('一', [H(10, 90, 50)]);
  def('二', [H(24, 76, 32), H(10, 90, 70)]);
  def('三', [H(26, 74, 20), H(18, 82, 50), H(8, 92, 82)]);
  def('十', [H(10, 90, 52), V(50, 10, 92)]);
  def('人', [C([50, 8], [46, 44], [30, 70], [10, 92]), C([42, 46], [60, 64], [76, 78], [92, 92])]);
  def('大', [H(10, 90, 36), C([50, 12], [46, 52], [30, 74], [10, 92]), C([50, 40], [62, 62], [76, 78], [92, 92])]);
  def('天', [H(22, 78, 18), H(10, 90, 44), C([50, 44], [44, 66], [28, 80], [10, 92]), C([50, 44], [62, 66], [76, 80], [92, 92])]);
  def('火', [P([30, 30], [10, 60]), P([70, 30], [90, 60]), C([50, 8], [46, 44], [30, 70], [10, 92]), C([42, 46], [60, 64], [76, 78], [92, 92])]);
  def('山', [V(50, 12, 88), P([20, 40], [20, 88], [80, 88], [80, 40])]);
  def('川', [C([24, 14], [22, 50], [14, 88]), V(50, 8, 92), V(80, 14, 88)]);
  def('土', [H(26, 74, 36), V(50, 10, 88), H(10, 90, 88)]);
  def('工', [H(16, 84, 16), V(50, 16, 86), H(8, 92, 86)]);
  def('王', [H(16, 84, 16), H(24, 76, 48), V(50, 16, 86), H(8, 92, 86)]);
  def('上', [V(38, 12, 80), H(38, 72, 46), H(10, 90, 88)]);
  def('下', [H(10, 90, 14), V(46, 14, 92), P([56, 40], [76, 64])]);
  def('口', [V(22, 20, 82), P([22, 20], [78, 20], [78, 82]), H(22, 78, 82)]);
  def('日', [V(24, 10, 90), P([24, 10], [76, 10], [76, 90]), H(24, 76, 50), H(24, 76, 90)]);
  def('月', [C([30, 10], [28, 50], [16, 90]), P([30, 10], [76, 10], [76, 84], [66, 92]), H(30, 76, 38), H(28, 76, 64)]);
  def('田', [P([16, 14], [84, 14], [84, 86], [16, 86], [16, 14]), H(16, 84, 50), V(50, 14, 86)]);
  def('中', [P([16, 30], [84, 30], [84, 70], [16, 70], [16, 30]), V(50, 8, 92)]);
  def('小', [P([50, 10], [50, 78], [42, 90]), P([28, 38], [14, 70]), P([72, 38], [86, 70])]);
  def('力', [P([14, 34], [76, 34], [76, 78], [64, 90]), C([46, 8], [44, 50], [24, 90])]);
  def('刀', [P([14, 24], [80, 24], [80, 76], [68, 90]), C([44, 24], [40, 56], [16, 88])]);
  def('木', [H(10, 90, 38), V(50, 8, 92), C([48, 42], [34, 64], [14, 82]), C([52, 42], [66, 64], [86, 82])]);
  def('水', [P([50, 8], [50, 72], [40, 88]), P([8, 42], [34, 42], [24, 66], [8, 86]), C([62, 30], [70, 46], [88, 58]), C([60, 54], [76, 72], [94, 90])]);
  def('金', [C([50, 6], [36, 26], [10, 42]), C([50, 6], [66, 26], [90, 42]), H(28, 72, 46), V(50, 46, 90), P([26, 56], [34, 66]), P([74, 56], [66, 66]), H(18, 82, 70), H(8, 92, 90)]);
  def('米', [H(10, 90, 50), V(50, 8, 92), P([24, 22], [38, 36]), P([76, 22], [62, 36]), C([44, 54], [36, 70], [18, 86]), C([56, 54], [64, 70], [82, 86])]);
  def('王', D['王'].strokes);
  // ---- 组合字：把部件缩放放入盒子 ----
  const place = (strokes, x0, y0, x1, y1) => strokes.map(s => [s[0], ...s.slice(1).map(p => [x0 + p[0] / 100 * (x1 - x0), y0 + p[1] / 100 * (y1 - y0)])]);
  def('林', [...place(D['木'].strokes, 0, 0, 50, 100), ...place(D['木'].strokes, 50, 0, 100, 100)]);
  def('炎', [...place(D['火'].strokes, 22, 0, 78, 52), ...place(D['火'].strokes, 8, 42, 92, 100)]);
  def('品', [...place(D['口'].strokes, 26, 0, 74, 46), ...place(D['口'].strokes, 0, 52, 48, 100), ...place(D['口'].strokes, 52, 52, 100, 100)]);
  def('明', [...place(D['日'].strokes, 0, 6, 46, 94), ...place(D['月'].strokes, 52, 0, 100, 100)]);
  F.strokeChars = Object.keys(D);

  F.FONTS = [
    { id: 'forge', name: '锻造黑（内置笔画字体）', note: '内置 ' + Object.keys(D).length + ' 个汉字；其余字符使用系统字体轮廓' },
    { id: 'system', name: '系统黑体（光栅轮廓化）', note: '取决于系统字体，支持常用汉字与拉丁字符' },
  ];
  F.rangeText = () => '内置字库：' + F.strokeChars.join('') + '；其他字符自动回退到系统字体';

  // 笔画样条采样
  const catmull = (pts, seg = 10) => {
    const out = []; const n = pts.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      for (let s = 0; s < seg; s++) { const t = s / seg, t2 = t * t, t3 = t2 * t; out.push([0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3), 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); }
    }
    out.push(pts[n - 1].slice()); return out;
  };
  // 骨架折线（em 单位 0..1）
  F.skeleton = ch => {
    const d = D[ch]; if (!d) return null;
    return d.strokes.map(s => { const pts = s.slice(1).map(p => [p[0] / 100, p[1] / 100]); return s[0] === 'c' ? catmull(pts) : pts; });
  };
  const glyphCache = new Map();
  F.STROKE_W = 0.085;
  // 返回 {polys:[flat em坐标], strokes:[折线], adv, builtin}
  F.glyph = (fontId, ch) => {
    const key = fontId + '|' + ch; if (glyphCache.has(key)) return glyphCache.get(key);
    let g = null;
    if (ch === ' ' || ch === '　') g = { polys: [], strokes: [], adv: ch === ' ' ? 0.32 : 1, builtin: true };
    else if (fontId !== 'system' && D[ch]) {
      const sk = F.skeleton(ch); const w = F.STROKE_W * (D[ch].w || 1);
      const pieces = sk.map(s => G.strokePolygon([].concat(...s), w, 'butt'));
      const polys = G.resolve(pieces);
      g = { polys, strokes: sk, adv: 1, builtin: true };
    } else if (typeof document !== 'undefined') g = F.traceSystem(ch);
    else g = { polys: [], strokes: [], adv: 1, missing: true };
    glyphCache.set(key, g); return g;
  };
  F.hasBuiltin = ch => !!D[ch];

  // ===== 系统字体光栅 → 轮廓 =====
  let _cv = null;
  F.traceSystem = ch => {
    const S = 320, size = 256;
    if (!_cv) { _cv = document.createElement('canvas'); _cv.width = S; _cv.height = S; }
    const ctx = _cv.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, S, S); ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${size}px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC","SimHei",sans-serif`;
    const wd = ctx.measureText(ch).width; ctx.fillText(ch, S / 2, S / 2 + size * 0.04);
    const img = ctx.getImageData(0, 0, S, S).data; const a = new Uint8Array(S * S); let any = false;
    for (let i = 0; i < S * S; i++) { a[i] = img[i * 4 + 3]; if (a[i] > 10) any = true; }
    if (!any) return { polys: [], strokes: [], adv: Math.max(0.3, wd / size), builtin: false };
    const polys = marching(a, S, S, 127.5).map(p => G.rdp(p, 0.45)).filter(p => p.length >= 6);
    const out = polys.map(p => { const q = new Array(p.length); for (let i = 0; i < p.length; i += 2) { q[i] = (p[i] - S / 2) / size + 0.5; q[i + 1] = (p[i + 1] - S / 2) / size + 0.5; } return q; });
    const wnorm = wd / size; const isCJK = /[⺀-鿿＀-￯]/.test(ch);
    return { polys: out, strokes: null, adv: isCJK ? 1 : Math.max(0.25, wnorm), builtin: false, offX: isCJK ? 0 : 0.5 - wnorm / 2 };
  };
  function marching(a, W, H, th) {
    // 以网格边上的交点为节点，生成定向线段，再串联成环
    const val = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : a[y * W + x];
    const segs = []; const hx = (x, y) => { const v0 = val(x, y), v1 = val(x + 1, y); const t = (th - v0) / (v1 - v0); return [x + t, y]; }; const vy = (x, y) => { const v0 = val(x, y), v1 = val(x, y + 1); const t = (th - v0) / (v1 - v0); return [x, y + t]; };
    const key = (type, x, y) => type + ':' + x + ',' + y;
    const next = new Map(); const pos = new Map();
    const link = (k0, p0, k1, p1) => { pos.set(k0, p0); pos.set(k1, p1); if (!next.has(k0)) next.set(k0, []); next.get(k0).push(k1); };
    for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) {
      const v00 = val(x, y) >= th, v10 = val(x + 1, y) >= th, v11 = val(x + 1, y + 1) >= th, v01 = val(x, y + 1) >= th;
      const c = (v00 ? 1 : 0) | (v10 ? 2 : 0) | (v11 ? 4 : 0) | (v01 ? 8 : 0); if (c === 0 || c === 15) continue;
      const T = [key('h', x, y), hx(x, y)], R = [key('v', x + 1, y), vy(x + 1, y)], B = [key('h', x, y + 1), hx(x, y + 1)], L = [key('v', x, y), vy(x, y)];
      const add = (p, q) => link(p[0], p[1], q[0], q[1]);
      // 内部在线段左侧（y 向下坐标系中顺时针=外轮廓）
      switch (c) {
        case 1: add(L, T); break; case 2: add(T, R); break; case 3: add(L, R); break; case 4: add(R, B); break;
        case 5: add(L, T); add(R, B); break; case 6: add(T, B); break; case 7: add(L, B); break; case 8: add(B, L); break;
        case 9: add(B, T); break; case 10: add(T, R); add(B, L); break; case 11: add(B, R); break; case 12: add(R, L); break;
        case 13: add(R, T); break; case 14: add(T, L); break;
      }
    }
    const loops = []; const used = new Set();
    for (const [k0, l0] of next) {
      for (let i = 0; i < l0.length; i++) {
        const id = k0 + '>' + l0[i]; if (used.has(id)) continue;
        const loop = []; let k = k0, nx = l0[i]; let guard = 0;
        while (guard++ < 200000) { used.add(k + '>' + nx); const p = pos.get(k); loop.push(p[0], p[1]); k = nx; if (k === k0) break; const cand = (next.get(k) || []).filter(c => !used.has(k + '>' + c)); if (!cand.length) break; nx = cand[0]; }
        if (loop.length >= 6) loops.push(loop);
      }
    }
    return loops;
  }

  // ===== 文字排版 =====
  // doc: {text,font,size,tracking,leading,align}; 返回 {chars:[{ch,line,idx,word,x,y,cx,cy,glyph,size}], lines:n, bbox}
  F.layout = (doc) => {
    const text = (doc.text || '').replace(/\r/g, ''); const size = doc.size || 100; const tr = (doc.tracking || 0) / 1000 * size; const lead = (doc.leading === undefined || doc.leading === null ? 1.2 : doc.leading) * size;
    const lines = text.split('\n'); const chars = []; const lineW = []; let widx = 0, ci = 0;
    lines.forEach((ln, li) => {
      let x = 0; const arr = []; let inWord = false;
      for (const ch of ln) {
        const g = F.glyph(doc.font || 'forge', ch); const isSpace = /\s/.test(ch);
        if (isSpace) { if (inWord) { widx++; inWord = false; } } else if (!/[⺀-鿿]/.test(ch)) inWord = true; else { if (inWord) { widx++; inWord = false; } }
        const adv = g.adv * size;
        arr.push({ ch, line: li, word: widx, x, glyph: g, adv, idx: ci++ });
        x += adv + tr; if (/[⺀-鿿]/.test(ch) && !isSpace) widx++;
      }
      if (inWord) widx++;
      const w = Math.max(0, x - (arr.length ? tr : 0)); lineW.push(w);
      for (const c of arr) chars.push(c);
    });
    const al = doc.align || 'center';
    for (const c of chars) {
      const w = lineW[c.line]; const ox = al === 'center' ? -w / 2 : al === 'right' ? -w : 0;
      c.x += ox; c.y = c.line * lead; c.size = size;
      // 字符中心（em 盒中心）
      c.cx = c.x + c.adv / 2; c.cy = c.y;
    }
    // 垂直居中整段
    const total = (lines.length - 1) * lead; const dy = doc.vcenter === false ? 0 : -total / 2;
    for (const c of chars) { c.y += dy; c.cy += dy; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const c of chars) { x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x + c.adv); y0 = Math.min(y0, c.y - size / 2); y1 = Math.max(y1, c.y + size / 2); }
    return { chars, lines: lines.length, bbox: chars.length ? [x0, y0, x1, y1] : [0, 0, 0, 0], lineW };
  };
  // 字符多边形（局部坐标，相对字符中心；含字号缩放）
  F.charPolys = (c) => {
    const s = c.size;
    return c.glyph.polys.map(p => { const q = new Array(p.length); for (let i = 0; i < p.length; i += 2) { q[i] = (p[i] - 0.5) * s; q[i + 1] = (p[i + 1] - 0.5) * s; } return q; });
  };
  F.charStrokes = (c) => { const g = c.glyph; if (!g.strokes) return null; const s = c.size; return g.strokes.map(st => { const q = []; for (const p of st) q.push((p[0] - 0.5) * s, (p[1] - 0.5) * s); return q; }); };
})();
