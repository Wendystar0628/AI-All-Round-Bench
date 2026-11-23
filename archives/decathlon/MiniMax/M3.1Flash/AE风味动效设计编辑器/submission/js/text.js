/* ============================================================
   text.js — 文字排版 + 字形轮廓提取（系统字体光栅化 → 等值线矢量化）
   字形轮廓可用于填充、描边、布尔、形变与三维挤出
   ============================================================ */
(function (global) {
  const AE = global.AE = global.AE || {};
  const U = AE.util;
  const T = AE.text = {};

  T.FONT_STACK = '"Microsoft YaHei","微软雅黑","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Source Han Sans SC","SimHei","Heiti SC",sans-serif';

  const glyphCache = new Map();
  const measureCache = new Map();
  const strokeCache = new Map();
  let measureCtx = null;
  let traceCanvas = null;

  function ctx2d() {
    if (!measureCtx) {
      const c = document.createElement('canvas');
      c.width = c.height = 8;
      measureCtx = c.getContext('2d', { willReadFrequently: true });
    }
    return measureCtx;
  }

  function fontString(o) {
    return `${o.style || 'normal'} ${o.weight || 400} ${o.size}px ${o.family || T.FONT_STACK}`;
  }

  /* ---------------- 字形轮廓提取 ---------------- */
  function douglas(pts, eps) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      let maxD = 0, idx = -1;
      const [ax, ay] = pts[s], [bx, by] = pts[e];
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      for (let i = s + 1; i < e; i++) {
        const [px, py] = pts[i];
        let d;
        if (len2 < 1e-12) d = Math.hypot(px - ax, py - ay);
        else {
          let t = ((px - ax) * dx + (py - ay) * dy) / len2;
          t = U.clamp(t, 0, 1);
          d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
        }
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > eps && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
    }
    const out = [];
    for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
    return out;
  }

  function areaOf(c) {
    let a = 0;
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) a += (c[j][0] - c[i][0]) * (c[j][1] + c[i][1]);
    return a / 2;
  }

  /**
   * 提取字形轮廓（em 单位：1 = 字号，基线 y=0，向右为 x 正方向）
   * 返回 { contours:[{pts:[...], hole:bool}], advance }
   */
  T.glyph = function (ch, opts) {
    opts = opts || {};
    const family = opts.family || T.FONT_STACK;
    const weight = opts.weight || 400;
    const style = opts.style || 'normal';
    const key = ch + '|' + family + '|' + weight + '|' + style;
    if (glyphCache.has(key)) return glyphCache.get(key);

    const EM = 768; // 光栅化分辨率
    const pad = Math.round(EM * 0.18);
    if (!traceCanvas) {
      traceCanvas = document.createElement('canvas');
    }
    const mctx = ctx2d();
    mctx.font = `${style} ${weight} ${EM}px ${family}`;
    const adv = mctx.measureText(ch).width / EM;
    const m = mctx.measureText(ch);
    const left = m.actualBoundingLeft || 0, right = m.actualBoundingRight || adv * EM;
    const asc = m.actualBoundingBoxAscent || EM * 0.88;
    const desc = m.actualBoundingBoxDescent || EM * 0.22;
    const w = Math.ceil(left + right) + pad * 2;
    const h = Math.ceil(asc + desc) + pad * 2;
    traceCanvas.width = Math.max(4, w); traceCanvas.height = Math.max(4, h);
    const g = traceCanvas.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.textBaseline = 'alphabetic';
    g.font = `${style} ${weight} ${EM}px ${family}`;
    g.fillText(ch, pad + left, pad + asc);
    const img = g.getImageData(0, 0, w, h).data;
    const field = new Float32Array(w * h);
    let ink = 0;
    for (let i = 0, p = 3; i < field.length; i++, p += 4) {
      const a = img[p] / 255;
      field[i] = a;
      if (a > 0.5) ink++;
    }
    const res = { contours: [], advance: adv };
    if (ink > 2) {
      const raw = AE.path.marchingSquares(field, w, h, 0.5);
      const contours = [];
      for (const c of raw) {
        const pts = douglas(c.map(p => [p[0], p[1]]), 0.55);
        if (pts.length >= 3) contours.push(pts);
      }
      // 转换为 em 坐标（y 翻转），并判定孔洞
      const em = contours.map(c => c.map(p => [(p[0] - pad - left) / EM, -(p[1] - pad - asc) / EM]));
      const depth = em.map(c => {
        const p = c[0];
        let d = 0;
        for (let i = 0; i < em.length; i++) {
          if (i === em.indexOf(c)) continue;
          if (AE.path.containsPoint(em[i], p)) d++;
        }
        return d;
      });
      for (let i = 0; i < em.length; i++) {
        res.contours.push({ pts: em[i], hole: depth[i] % 2 === 1, area: areaOf(em[i]) });
      }
    }
    glyphCache.set(key, res);
    return res;
  };

  T.clearCache = () => { glyphCache.clear(); measureCache.clear(); strokeCache.clear(); };

  /* ---------------- 笔画顺序（骨架分析） ---------------- */
  /** Zhang-Suen 细化 */
  function thin(bin, W, H) {
    const skel = bin.slice();
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : skel[y * W + x];
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 80) {
      changed = false;
      for (let step = 0; step < 2; step++) {
        const del = [];
        for (let y = 1; y < H - 1; y++) {
          for (let x = 1; x < W - 1; x++) {
            if (!skel[y * W + x]) continue;
            const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1);
            const p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
            const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
            if (B < 2 || B > 6) continue;
            const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
            let A = 0;
            for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) A++;
            if (A !== 1) continue;
            if (step === 0) {
              if (p2 * p4 * p6 !== 0) continue;
              if (p4 * p6 * p8 !== 0) continue;
            } else {
              if (p2 * p4 * p8 !== 0) continue;
              if (p2 * p6 * p8 !== 0) continue;
            }
            del.push(y * W + x);
          }
        }
        if (del.length) {
          changed = true;
          for (const i of del) skel[i] = 0;
        }
      }
    }
    return skel;
  }

  /**
   * 字符笔画分析：返回 { strokes, revealAt(x,y) }
   * revealAt 返回 0..1 的"书写进度"，用于逐笔显现
   */
  T.strokeMap = function (ch, opts) {
    opts = opts || {};
    const family = opts.family || T.FONT_STACK;
    const weight = opts.weight || 400;
    const key = ch + '|' + family + '|' + weight;
    if (strokeCache.has(key)) return strokeCache.get(key);

    const EM = 420;
    const c = document.createElement('canvas');
    const m = ctx2d();
    m.font = `${opts.style || 'normal'} ${weight} ${EM}px ${family}`;
    const adv = m.measureText(ch).width / EM;
    const mm = m.measureText(ch);
    const left = mm.actualBoundingLeft || 0, right = mm.actualBoundingRight || adv * EM;
    const asc = mm.actualBoundingBoxAscent || EM * 0.88;
    const desc = mm.actualBoundingBoxDescent || EM * 0.22;
    const pad = 12;
    const W = Math.ceil(left + right) + pad * 2;
    const H = Math.ceil(asc + desc) + pad * 2;
    c.width = Math.max(4, W); c.height = Math.max(4, H);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
    g.font = `${opts.style || 'normal'} ${weight} ${EM}px ${family}`;
    g.fillText(ch, pad + left, pad + asc);
    const img = g.getImageData(0, 0, W, H).data;
    const bin = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) bin[i] = img[i * 4 + 3] > 110 ? 1 : 0;
    const skel = thin(bin, W, H);

    const nbr = (x, y) => {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (skel[yy * W + xx]) n++;
      }
      return n;
    };
    const isNode = new Uint8Array(W * H);
    const nodeList = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (!skel[y * W + x]) continue;
      const n = nbr(x, y);
      if (n !== 2) { isNode[y * W + x] = 1; nodeList.push([x, y, n]); }
    }
    const visited = new Uint8Array(W * H);
    const edges = [];
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    const skelAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : skel[y * W + x];
    for (const [sx, sy] of nodeList) {
      for (const [dx, dy] of dirs) {
        let x = sx + dx, y = sy + dy;
        if (!skelAt(x, y) || visited[y * W + x]) continue;
        const pts = [[sx, sy], [x, y]];
        visited[y * W + x] = 1;
        let px = sx, py = sy;
        let guard = 0;
        while (guard++ < 100000) {
          let moved = false;
          for (const [ddx, ddy] of dirs) {
            const xx = x + ddx, yy = y + ddy;
            if (xx === px && yy === py) continue;
            if (!skelAt(xx, yy)) continue;
            if (visited[yy * W + xx] && !(xx === sx && yy === sy)) continue;
            px = x; py = y; x = xx; y = yy;
            visited[y * W + x] = 1;
            pts.push([x, y]);
            moved = true;
            break;
          }
          if (!moved) break;
          if (isNode[y * W + x]) break;
          if (x === sx && y === sy) break;
        }
        edges.push({ a: [sx, sy], b: [x, y], pts });
      }
    }
    const keyOf = p => p[0] + ',' + p[1];
    // 去除短毛刺（反复修剪末端短枝）
    const minLen = Math.max(5, Math.round(EM * 0.022));
    for (let pass = 0; pass < 12; pass++) {
      const deg2 = new Map();
      for (const e of edges) {
        deg2.set(keyOf(e.a), (deg2.get(keyOf(e.a)) || 0) + 1);
        deg2.set(keyOf(e.b), (deg2.get(keyOf(e.b)) || 0) + 1);
      }
      let removed = false;
      for (let i = edges.length - 1; i >= 0; i--) {
        const e = edges[i];
        const da = deg2.get(keyOf(e.a)) || 0, db = deg2.get(keyOf(e.b)) || 0;
        if (e.pts.length < minLen && (da <= 1 || db <= 1)) { edges.splice(i, 1); removed = true; }
      }
      if (!removed) break;
    }
    const deg = new Map();
    for (const e of edges) {
      deg.set(keyOf(e.a), (deg.get(keyOf(e.a)) || 0) + 1);
      deg.set(keyOf(e.b), (deg.get(keyOf(e.b)) || 0) + 1);
    }
    const adj = new Map();
    for (const e of edges) {
      const ka = keyOf(e.a), kb = keyOf(e.b);
      if (!adj.has(ka)) adj.set(ka, []);
      if (!adj.has(kb)) adj.set(kb, []);
      adj.get(ka).push({ e, to: kb });
      adj.get(kb).push({ e, to: ka });
    }
    const endpoints = [...deg.entries()].filter(([, d]) => d === 1).map(([k]) => k);
    const usedEdge = new Set();
    const strokes = [];
    for (const ep of endpoints) {
      const stack = [{ node: ep, path: [] }];
      let found = null;
      while (stack.length && !found) {
        const st = stack.pop();
        const links = adj.get(st.node) || [];
        for (const link of links) {
          if (usedEdge.has(link.e)) continue;
          const isEnd = endpoints.includes(link.to);
          const npath = st.path.concat([link.e]);
          if (isEnd) { found = { path: npath }; break; }
          if (npath.length < 80) stack.push({ node: link.to, path: npath });
        }
      }
      if (found) {
        for (const e of found.path) usedEdge.add(e);
        const pts = [];
        for (const e of found.path) {
          if (pts.length === 0) pts.push(...e.pts);
          else pts.push(...e.pts.slice(1));
        }
        strokes.push({ pts, start: found.path[0].a, end: found.path[found.path.length - 1].b });
      }
    }
    for (const e of edges) {
      if (usedEdge.has(e)) continue;
      let best = null, bd = Infinity;
      for (const s of strokes) {
        for (const p of e.pts) {
          const d = (p[0] - s.start[0]) ** 2 + (p[1] - s.start[1]) ** 2;
          if (d < bd) { bd = d; best = s; }
        }
      }
      if (best) { best.pts = best.pts.concat(e.pts); usedEdge.add(e); }
    }
    if (!strokes.length) strokes.push({ pts: [[0, 0]], start: [0, 0], end: [0, 0] });

    const strokeBoxes = strokes.map(s => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const p of s.pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      return { x0, y0, x1, y1 };
    });
    const colHas = new Uint8Array(W);
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (skel[y * W + x]) { colHas[x] = 1; break; }
    const groups = [];
    let cur = -1, gap = 0;
    const minGap = Math.max(6, Math.round(EM * 0.035));
    for (let x = 0; x < W; x++) {
      if (colHas[x]) { if (cur < 0) cur = x; gap = 0; }
      else if (cur >= 0) { gap++; if (gap > minGap) { groups.push([cur, x - gap]); cur = -1; } }
    }
    if (cur >= 0) groups.push([cur, W - 1]);
    const groupOf = s => {
      const b = strokeBoxes[s];
      const cx = (b.x0 + b.x1) / 2;
      for (let i = 0; i < groups.length; i++) if (cx >= groups[i][0] && cx <= groups[i][1]) return i;
      return 0;
    };
    // 统一方向：笔画自上而下、自左向右起笔
    for (const s of strokes) {
      const a = s.pts[0], b = s.pts[s.pts.length - 1];
      if (b[1] < a[1] || (b[1] === a[1] && b[0] < a[0])) {
        s.pts.reverse();
        s.start = s.end; s.end = [a[0], a[1]];
      }
      s.p0 = s.pts[0];
    }
    const order = strokes.map((s, i) => i);
    order.sort((a, b) => {
      const ga = groupOf(a), gb = groupOf(b);
      if (ga !== gb) return ga - gb;
      const pa = strokes[a].p0, pb = strokes[b].p0;
      if (Math.abs(pa[1] - pb[1]) > EM * 0.05) return pa[1] - pb[1];
      return pa[0] - pb[0];
    });

    const N = order.length;
    const strokeTime = new Float32Array(W * H).fill(2);
    order.forEach((si, rank) => {
      const s = strokes[si];
      const n = Math.max(2, s.pts.length);
      for (let i = 0; i < n; i++) {
        const p = s.pts[i];
        if (p[0] < 0 || p[1] < 0 || p[0] >= W || p[1] >= H) continue;
        const idx = p[1] * W + p[0];
        const tt = rank / N + (i / (n - 1)) / N;
        if (tt < strokeTime[idx]) strokeTime[idx] = tt;
      }
    });
    // 最近骨架像素的书写时间（Voronoi 式归属，BFS 保证最近）
    const time = new Float32Array(W * H).fill(2);
    const dist = new Float32Array(W * H).fill(1e9);
    const queue = [];
    for (let i = 0; i < W * H; i++) {
      if (strokeTime[i] <= 1) { time[i] = strokeTime[i]; dist[i] = 0; queue.push(i); }
    }
    let qh = 0;
    while (qh < queue.length) {
      const p = queue[qh++];
      const x = p % W, y = (p / W) | 0;
      const d = dist[p];
      const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
      for (const [nx, ny] of nb) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (dist[ni] > d + 1) {
          dist[ni] = d + 1;
          time[ni] = time[p];
          queue.push(ni);
        }
      }
    }
    const res = {
      strokes: order.map(i => strokes[i]),
      advance: N,
      revealAt(x, y) {
        const px = Math.round(x * EM + pad + left);
        const py = Math.round(-y * EM + pad + asc);
        if (px < 0 || py < 0 || px >= W || py >= H) return 1;
        const v = time[py * W + px];
        return v > 1 ? 1 : v;
      }
    };
    strokeCache.set(key, res);
    return res;
  };

  /** 测量：返回 { advance } in em */
  T.measure = function (text, opts) {
    opts = opts || {};
    const key = text + '|' + (opts.family || T.FONT_STACK) + '|' + (opts.weight || 400);
    if (measureCache.has(key)) return measureCache.get(key);
    const m = ctx2d();
    m.font = fontString(Object.assign({ size: 100 }, opts));
    const r = { width: m.measureText(text).width / 100, ascent: 0.88, descent: 0.22 };
    measureCache.set(key, r);
    return r;
  };

  /* ---------------- 排版 ---------------- */
  /**
   * opts: { text, size, leading, align:'left'|'center'|'right', tracking,
   *         family, weight, style, lineHeightPx, wrap }
   * 返回 { lines:[{chars:[{ch,x,y,adv,contours}], width, baseline}], width, height, chars }
   */
  T.layout = function (opts) {
    const size = opts.size || 60;
    const leading = opts.leading === undefined ? 1.25 : opts.leading;
    const align = opts.align || 'left';
    const tracking = opts.tracking || 0;
    const fontOpts = { family: opts.family, weight: opts.weight, style: opts.style };
    const rawLines = String(opts.text === undefined ? '' : opts.text).split(/\r?\n/);

    const lines = rawLines.map(line => {
      const chars = [];
      let x = 0;
      for (const ch of line) {
        const gl = T.glyph(ch, fontOpts);
        const adv = gl.advance * size;
        chars.push({ ch, x, adv, contours: gl.contours, glyph: gl });
        x += adv + tracking * size;
      }
      const width = Math.max(0, x - (chars.length ? tracking * size : 0));
      return { chars, width };
    });

    const maxW = lines.reduce((m, l) => Math.max(m, l.width), 0);
    for (const l of lines) {
      let dx = 0;
      if (align === 'center') dx = (maxW - l.width) / 2;
      else if (align === 'right') dx = maxW - l.width;
      for (const c of l.chars) c.x += dx;
      l.offset = dx;
    }

    const lineH = size * leading;
    let y = 0;
    for (let i = 0; i < lines.length; i++) {
      lines[i].baseline = y;
      y += lineH;
    }
    const height = Math.max(lineH, lines.length * lineH);
    // 字符绝对坐标
    for (const l of lines) for (const c of l.chars) { c.y = l.baseline; c.line = lines.indexOf(l); }
    return { lines, width: maxW, height, size, leading, lineH };
  };

  /** 文本 → 轮廓集合（每个字符一组，可用于字形几何 / 挤出） */
  T.toContours = function (opts) {
    const lay = T.layout(opts);
    const out = [];
    for (const l of lay.lines) {
      for (const c of l.chars) {
        if (!c.ch.trim()) continue;
        for (const ct of c.contours) {
          out.push({
            pts: ct.pts.map(p => [(p[0] + c.x) * (opts.size || 60), (p[1] + c.y) * (opts.size || 60)]),
            hole: ct.hole,
            charIndex: out.length
          });
        }
      }
    }
    return { contours: out, layout: lay };
  };

  /* ---------------- 文字动画器 ---------------- */
  /**
   * 选择范围：按字符索引 / 词 / 行
   * anim: { mode:'chars'|'words'|'lines', from, to, offset, smoothness,
   *         position:[dx,dy], rotation, scale, opacity }
   */
  T.rangeInfo = function (lay, anim) {
    const chars = [];
    lay.lines.forEach((l, li) => l.chars.forEach((c, ci) => chars.push({ c, li, ci, word: c.wordIndex || 0 })));
    const idxOf = chars.findIndex(ch => ch.c === lay.lines[0].chars[0]);
    return { chars, idxOf };
  };

  /**
   * 计算每个字符的动画状态
   * 返回 Map<charIndex, {opacity, dx, dy, rot, scale}>
   */
  T.animatorState = function (lay, anim, progress) {
    const state = new Map();
    if (!anim) return state;
    const size = lay.size;
    const list = [];
    lay.lines.forEach((l, li) => {
      l.chars.forEach((c, ci) => {
        list.push({ c, li, ci, gi: list.length });
      });
    });
    const total = list.length || 1;
    // 分组索引
    const groups = list.map(item => {
      if (anim.mode === 'lines') return item.li;
      if (anim.mode === 'words') return wordIndexOf(lay, item);
      return item.gi;
    });
    const uniq = [];
    for (const g of groups) if (!uniq.includes(g)) uniq.push(g);
    const from = anim.from === undefined ? 0 : anim.from;
    const to = anim.to === undefined ? 100 : anim.to;
    const range = (to - from) / 100;
    const offset = (anim.offset || 0) / 100;
    const smooth = anim.smoothness === undefined ? 0 : anim.smoothness;
    const order = uniq.length;
    list.forEach((item, i) => {
      const g = groups[i];
      const gi = uniq.indexOf(g);
      // 组在整体序列中的位置（0..1）
      const center = order > 1 ? gi / (order - 1) : 0;
      let p = (center - from / 100) / (range || 1) + offset;
      p = U.clamp(p, 0, 1);
      // 软边
      let eased;
      const s = Math.max(0.0001, smooth);
      if (smooth <= 0) eased = p;
      else {
        const half = s / 2;
        const a = U.clamp(p / half, 0, 1);
        const b = U.clamp((p - (1 - half)) / half, 0, 1);
        eased = U.clamp(a * a * (3 - 2 * a) - (1 - b) * (1 - b) * (3 - 2 * b), 0, 1);
        eased = p;
      }
      const st = {
        opacity: anim.opacity === undefined ? 1 : anim.opacity,
        dx: 0, dy: 0, rot: 0, scale: 1
      };
      const g2 = eased;
      if (anim.position) {
        const dir = anim.position;
        const amt = 1 - U.smoothstep(g2);
        st.dx = dir[0] * amt; st.dy = dir[1] * amt;
      }
      if (anim.rotation) st.rot = anim.rotation * (1 - U.smoothstep(g2));
      if (anim.scale !== undefined) st.scale = U.lerp(anim.scale, 1, U.smoothstep(g2));
      if (anim.opacity !== undefined) st.opacity = U.lerp(anim.opacity, 1, U.smoothstep(g2));
      state.set(item.gi, st);
    });
    return state;
  };

  function wordIndexOf(lay, item) {
    // 以空格分隔的词为单位
    if (!lay._words) {
      lay._words = [];
      let w = 0;
      lay.lines.forEach(l => {
        l.chars.forEach(c => {
          if (/\s/.test(c.ch)) { if (lay._words.length && lay._words[lay._words.length - 1].chars.length) w++; }
          else {
            if (!lay._words[w]) lay._words[w] = { chars: [] };
            lay._words[w].chars.push(c);
          }
        });
      });
    }
    const idx = lay._words.findIndex(w => w.chars.includes(item.c));
    return idx < 0 ? 0 : idx;
  }
})(window);
