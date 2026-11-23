// 字体注册与字形解码。字形数据由 data/font_*.js 以分块字符串提供（适合 file:// 直接加载）
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const parts = {}, metas = {};
  window.MF_FONT_PART = function (name, idx, str) { (parts[name] = parts[name] || [])[idx] = str; };
  window.MF_FONT_META = function (name, meta) { metas[name] = meta; };

  const DEC = new Int16Array(128).fill(-1);
  { let n = 0; for (let c = 35; c <= 126; c++) if (c !== 92) DEC[c] = n++; }
  const num = (s, i) => DEC[s.charCodeAt(i)] * 91 + DEC[s.charCodeAt(i + 1)] - 3000;

  class FontData {
    constructor(name) {
      this.name = name; this.meta = metas[name] || {}; this.index = new Map(); this.cache = new Map();
      const ps = parts[name] || [];
      for (let pi = 0; pi < ps.length; pi++) {
        const s = ps[pi]; if (!s) continue;
        let i = 0;
        while (i < s.length) {
          const e = s.indexOf('!', i + 1);
          if (e < 0) break;
          const cp = s.codePointAt(i);
          const ch = String.fromCodePoint(cp);
          this.index.set(ch, [pi, i + ch.length, e]);
          i = e + 1;
        }
      }
    }
    has(ch) { return this.index.has(ch); }
    raw(ch) { const r = this.index.get(ch); return r ? parts[this.name][r[0]].substring(r[1], r[2]) : null; }
  }

  // 解析路径命令 → 轮廓（贝塞尔段），单位：字体单位，y 向下，基线为 0
  function parseCmds(s, i, end) {
    const contours = []; let cur = null;
    while (i < end) {
      const c = s[i++];
      if (c === 'M') { cur = { closed: false, segs: [], x0: num(s, i), y0: num(s, i + 2) }; cur.x = cur.x0; cur.y = cur.y0; contours.push(cur); i += 4; }
      else if (c === 'L') { const x = num(s, i), y = num(s, i + 2); i += 4; cur.segs.push(['L', x, y]); cur.x = x; cur.y = y; }
      else if (c === 'Q') { const x1 = num(s, i), y1 = num(s, i + 2), x = num(s, i + 4), y = num(s, i + 6); i += 8; cur.segs.push(['Q', x1, y1, x, y]); cur.x = x; cur.y = y; }
      else if (c === 'C') { const x1 = num(s, i), y1 = num(s, i + 2), x2 = num(s, i + 4), y2 = num(s, i + 6), x = num(s, i + 8), y = num(s, i + 10); i += 12; cur.segs.push(['C', x1, y1, x2, y2, x, y]); cur.x = x; cur.y = y; }
      else if (c === 'Z') { if (cur) cur.closed = true; }
      else break;
    }
    return { contours, i };
  }
  // 轮廓贝塞尔 → 折线
  function flattenContour(c, tol) {
    const pts = [c.x0, c.y0]; let px = c.x0, py = c.y0;
    for (const sg of c.segs) {
      if (sg[0] === 'L') { pts.push(sg[1], sg[2]); px = sg[1]; py = sg[2]; }
      else if (sg[0] === 'Q') {
        const x1 = sg[1], y1 = sg[2], x = sg[3], y = sg[4];
        const dev = Math.hypot(px - 2 * x1 + x, py - 2 * y1 + y);
        const n = Math.max(1, Math.min(24, Math.ceil(Math.sqrt(dev / (4 * tol)))));
        for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; pts.push(u * u * px + 2 * u * t * x1 + t * t * x, u * u * py + 2 * u * t * y1 + t * t * y); }
        px = x; py = y;
      } else {
        const x1 = sg[1], y1 = sg[2], x2 = sg[3], y2 = sg[4], x = sg[5], y = sg[6];
        const dev = Math.max(Math.hypot(px - 2 * x1 + x2, py - 2 * y1 + y2), Math.hypot(x1 - 2 * x2 + x, y1 - 2 * y2 + y));
        const n = Math.max(1, Math.min(32, Math.ceil(Math.sqrt(dev * 0.75 / tol))));
        for (let k = 1; k <= n; k++) { const t = k / n; pts.push(MF.bez.pt(px, x1, x2, x, t), MF.bez.pt(py, y1, y2, y, t)); }
        px = x; py = y;
      }
    }
    // 去掉与起点重合的末点
    const n = pts.length;
    if (n >= 4 && Math.abs(pts[n - 2] - pts[0]) < 1e-6 && Math.abs(pts[n - 1] - pts[1]) < 1e-6) pts.length = n - 2;
    return { pts, closed: true };
  }

  const fonts = {};
  const Fonts = (MF.Fonts = {
    list: [],
    init() {
      for (const name of ['kai', 'hei']) if (parts[name]) { fonts[name] = new FontData(name); Fonts.list.push({ id: name, label: fonts[name].meta.label, count: fonts[name].index.size, strokes: !!fonts[name].meta.strokes, license: fonts[name].meta.license }); }
      if (parts.kai_aux) fonts.kai_aux = new FontData('kai_aux');
    },
    get(name) { return fonts[name] || fonts.kai || fonts.hei; },
    info(name) { return Fonts.list.find((f) => f.id === name) || Fonts.list[0]; },
    has(name, ch) {
      const f = Fonts.get(name); if (!f) return false;
      if (f.has(ch)) return true;
      if (f.name === 'kai' && fonts.kai_aux && fonts.kai_aux.has(ch)) return true;
      return false;
    },
    hasStrokes(name, ch) { const f = Fonts.get(name); return !!(f && f.meta.strokes && f.has(ch)); },
    // 返回 { adv, contours:[{pts,closed}], strokes?:[{contours, median:[x,y,...]}], missing } —— 归一化到 1em = 1 单位，y 向下，基线 0
    glyph(name, ch) {
      const f = Fonts.get(name); if (!f) return null;
      const key = ch;
      let g = f.cache.get(key);
      if (g) return g;
      const tol = 0.9;
      if (f.has(ch)) {
        const s = f.raw(ch), upm = f.meta.upm;
        if (f.meta.strokes) {
          const sp = s.indexOf(' ');
          const sdata = s.substring(0, sp), mdata = s.substring(sp + 1);
          const medStrs = mdata.split(' ');
          const pr = parseCmds(sdata, 0, sdata.length);
          const strokes = [];
          for (let k = 0; k < pr.contours.length; k++) {
            const cs = [scaleC(flattenContour(pr.contours[k], tol), 1 / upm)];
            const med = []; const ms = medStrs[k] || '';
            for (let i = 0; i + 3 < ms.length; i += 4) med.push(num(ms, i) / upm, num(ms, i + 2) / upm);
            strokes.push({ contours: cs, median: med });
          }
          g = { adv: 1, strokes, contours: null, missing: false };
        } else {
          const adv = num(s, 0) / upm;
          const pr = parseCmds(s, 2, s.length);
          g = { adv, contours: pr.contours.map((c) => scaleC(flattenContour(c, tol), 1 / upm)), missing: false };
        }
      } else if (f.name === 'kai' && fonts.kai_aux && fonts.kai_aux.has(ch)) {
        const a = fonts.kai_aux, s = a.raw(ch), upm = a.meta.upm;
        const adv = num(s, 0) / upm;
        const pr = parseCmds(s, 2, s.length);
        g = { adv, contours: pr.contours.map((c) => scaleC(flattenContour(c, tol), 1 / upm)), missing: false };
      } else if (ch === ' ' || ch === '　') {
        g = { adv: ch === ' ' ? 0.3 : 1, contours: [], missing: false };
      } else {
        // 缺字：画一个方框
        const o = [0.1, -0.78, 0.9, -0.78, 0.9, 0.06, 0.1, 0.06], i2 = [0.17, -0.71, 0.17, -0.01, 0.83, -0.01, 0.83, -0.71];
        g = { adv: 1, contours: [{ pts: o, closed: true }, { pts: i2, closed: true }], missing: true };
      }
      f.cache.set(key, g);
      return g;
    },
    // 字形合并轮廓（笔画字体做并集），结果缓存
    outline(name, ch) {
      const g = Fonts.glyph(name, ch);
      if (!g) return [];
      if (!g._union) {
        const polys = [];
        if (g.contours) for (const c of g.contours) polys.push(c);
        else for (const st of g.strokes) for (const c of st.contours) polys.push(c);
        let u = null;
        if (polys.length) { try { u = MF.Bool.union(polys, 1 / 65536, 'nonzero'); } catch (e) { console.warn('字形并集失败', ch, e); } }
        g._union = u && u.length ? u : polys;
      }
      return g._union;
    },
    metrics(name) { const f = Fonts.get(name); const m = f ? f.meta : { upm: 1000, asc: 880, desc: 120 }; return { asc: m.asc / m.upm, desc: m.desc / m.upm }; },
  });
  function scaleC(c, s) { const p = c.pts; for (let i = 0; i < p.length; i++) p[i] *= s; return c; }
})();
