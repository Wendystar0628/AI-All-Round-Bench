/* shapes.js — 形状图层几何管线（生成器→修剪/重复器/合并→填充/描边）与文字图层字符绘制记录 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, G = AE.G, Model = AE.Model, A2 = G.A2;
  const S = AE.Shapes = {};

  const polysBBox = G.polysBBox;
  const xformPts = (pts, m) => { const o = new Array(pts.length); for (let i = 0; i < pts.length; i += 2) { o[i] = m[0] * pts[i] + m[2] * pts[i + 1] + m[4]; o[i + 1] = m[1] * pts[i] + m[3] * pts[i + 1] + m[5]; } return o; };

  // shape 条目: {polys:[{pts,closed}], opa}
  function genShape(ev, comp, L, it, t, tol) {
    const g = k => ev.value(comp, L, `sh.${it.id}.${k}`, t);
    let sh = null;
    if (it.type === 'rect') { const s = g('size'), p = g('pos'); sh = G.rectShape(s[0], s[1], g('round'), p[0], p[1]); }
    else if (it.type === 'ellipse') { const s = g('size'), p = g('pos'); sh = G.ellipseShape(s[0], s[1], p[0], p[1]); }
    else if (it.type === 'star') { const p = g('pos'); sh = G.starShape(g('points'), g('outer'), g('inner'), g('rot'), 0, p[0], p[1]); }
    else if (it.type === 'path') { sh = ev.value(comp, L, `sh.${it.id}.path`, t); }
    else if (it.type === 'glyphs') return glyphShapes(ev, comp, L, it, t);
    if (!sh) return null;
    return { polys: G.flattenShape(sh, tol), opa: 1 };
  }
  function glyphShapes(ev, comp, L, it, t) {
    const T = Model.layer(comp, it.source) || comp.layers.find(l => l.id === it.source); if (!T || T.type !== 'text') return null;
    const sc = ev.value(comp, L, `sh.${it.id}.size`, t) / 100, pos = ev.value(comp, L, `sh.${it.id}.pos`, t);
    const lay = S.textLayout(ev, comp, T, t); const polys = [];
    for (const c of lay.chars) {
      if (it.mode === 'outline') { for (const p of AE.Font.charPolys(c)) polys.push({ pts: xformPts(p, [sc, 0, 0, sc, c.cx * sc + pos[0], c.cy * sc + pos[1]]), closed: true }); continue; }
      const st = AE.Font.charStrokes(c);
      if (st) for (const s of st) polys.push({ pts: xformPts(s, [sc, 0, 0, sc, c.cx * sc + pos[0], c.cy * sc + pos[1]]), closed: false });
      else for (const p of AE.Font.charPolys(c)) polys.push({ pts: xformPts(p, [sc, 0, 0, sc, c.cx * sc + pos[0], c.cy * sc + pos[1]]), closed: true });
    }
    return { polys, opa: 1 };
  }
  function applyTrim(shapes, st, ev, comp, L, it, t) {
    const g = k => ev.value(comp, L, `sh.${it.id}.${k}`, t);
    let s0 = g('start') / 100, s1 = g('end') / 100; const off = g('offset') / 360; s0 += off; s1 += off;
    if (it.mode === 'seq') {
      // 依次：整体拼接长度
      const all = []; let total = 0;
      for (const sh of shapes) for (const p of sh.polys) { const len = G.polyLength(p.pts, p.closed); all.push({ p, len, base: total }); total += len; }
      if (total <= 0) return shapes;
      const a = Math.min(s0, s1) * total, b = Math.max(s0, s1) * total; const out = [];
      for (const e of all) { const l0 = Math.max(a, e.base), l1 = Math.min(b, e.base + e.len); if (l1 - l0 <= 1e-6) continue; const r = G.trimPoly(e.p.pts, e.p.closed, (l0 - e.base) / e.len, (l1 - e.base) / e.len); for (const q of r) out.push(q); }
      return [{ polys: out, opa: 1 }];
    }
    return shapes.map(sh => { const polys = []; for (const p of sh.polys) for (const q of G.trimPoly(p.pts, p.closed, s0, s1)) polys.push(q); return { polys, opa: sh.opa }; });
  }
  function applyRepeater(shapes, ev, comp, L, it, t) {
    const g = k => ev.value(comp, L, `sh.${it.id}.${k}`, t);
    const n = Math.max(0, Math.round(g('copies'))), off = g('offset'), pos = g('position'), sc = g('scale'), rot = g('rotation'), o0 = g('opStart') / 100, o1 = g('opEnd') / 100;
    const out = [];
    for (let c = 0; c < n; c++) {
      const k = c + off; const m = A2.mul(A2.trs(pos[0] * k, pos[1] * k, rot * k, 1, 1), [Math.pow(sc[0] / 100, k), 0, 0, Math.pow(sc[1] / 100, k), 0, 0]);
      const opa = n > 1 ? o0 + (o1 - o0) * c / (n - 1) : o0;
      for (const sh of shapes) out.push({ polys: sh.polys.map(p => ({ pts: xformPts(p.pts, m), closed: p.closed })), opa: sh.opa * opa });
    }
    return out;
  }
  function applyMerge(shapes, it) {
    const closed = shapes.map(sh => sh.polys.filter(p => p.closed && p.pts.length >= 6).map(p => p.pts)).filter(a => a.length);
    if (closed.length < 2) return shapes;
    const op = it.op || 'union';
    let res;
    if (op === 'union') res = G.booleanMany(closed, 'union');
    else { // 以最后一个为基底（AE：从下方形状中减去上方形状）
      const base = closed[closed.length - 1]; const rest = closed.slice(0, -1);
      if (op === 'diff') { res = G.resolve(base); for (const r of rest) res = G.boolean(res, G.resolve(r), 'diff'); }
      else if (op === 'intersect') { res = G.resolve(base); for (const r of rest) res = G.boolean(res, G.resolve(r), 'intersect'); }
      else { res = G.resolve(base); for (const r of rest) res = G.boolean(res, G.resolve(r), 'xor'); }
    }
    return [{ polys: res.map(p => ({ pts: p, closed: true })), opa: 1 }];
  }
  function applyOffset(shapes, ev, comp, L, it, t) {
    const amt = ev.value(comp, L, `sh.${it.id}.amount`, t);
    return shapes.map(sh => { const polys = []; for (const p of sh.polys) { if (!p.closed) { polys.push(p); continue; } const n = p.pts.length / 2; const area = G.polyArea(p.pts); const sg = area >= 0 ? 1 : -1; const o = []; for (let i = 0; i < n; i++) { const a = (i + n - 1) % n, b = (i + 1) % n; let tx = p.pts[2 * b] - p.pts[2 * a], ty = p.pts[2 * b + 1] - p.pts[2 * a + 1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l; o.push(p.pts[2 * i] + ty * amt * sg, p.pts[2 * i + 1] - tx * amt * sg); } polys.push({ pts: o, closed: true }); } return { polys, opa: sh.opa }; });
  }

  // 求值一个项目列表，返回绘制记录（自底向上）
  function evalItems(ev, comp, L, items, mat, opa, t, tol, out) {
    let shapes = []; const paints = [];
    const subs = []; // 子组：{order, item}
    items.forEach((it, idx) => {
      if (!it.on) return; const def = Model.SHAPE_ITEMS[it.type];
      if (def.kind === 'gen') { const sh = genShape(ev, comp, L, it, t, tol); if (sh) shapes.push(sh); }
      else if (it.type === 'trim') shapes = applyTrim(shapes, null, ev, comp, L, it, t);
      else if (it.type === 'repeater') shapes = applyRepeater(shapes, ev, comp, L, it, t);
      else if (it.type === 'merge') shapes = applyMerge(shapes, it);
      else if (it.type === 'offset') shapes = applyOffset(shapes, ev, comp, L, it, t);
      else if (def.kind === 'paint') paints.push({ it, idx });
      else if (it.type === 'group') subs.push({ it, idx });
    });
    // 自底向上：列表靠后的先绘制
    const entries = [...paints.map(p => ({ k: 'paint', ...p })), ...subs.map(s => ({ k: 'group', ...s }))].sort((a, b) => b.idx - a.idx);
    for (const e of entries) {
      if (e.k === 'group') {
        const it = e.it; const g = k => ev.value(comp, L, `sh.${it.id}.${k}`, t);
        const an = g('anchor'), po = g('position'), sc = g('scale'), ro = g('rotation'), op = g('opacity');
        const gm = A2.mul(A2.trs(po[0], po[1], ro, sc[0] / 100, sc[1] / 100), [1, 0, 0, 1, -an[0], -an[1]]);
        evalItems(ev, comp, L, it.items, A2.mul(mat, gm), opa * op / 100, t, tol, out);
      } else {
        const it = e.it; const g = k => ev.value(comp, L, `sh.${it.id}.${k}`, t);
        if (!shapes.length) continue;
        if (it.type === 'fill') out.push({ kind: 'fill', shapes, mat, color: g('color'), opacity: opa * g('opacity') / 100, rule: it.rule || 'nonzero', gradient: it.gradient || null, id: it.id });
        else out.push({ kind: 'stroke', shapes, mat, color: g('color'), opacity: opa * g('opacity') / 100, width: g('width'), cap: it.cap || 'round', join: it.join || 'round', dash: g('dash'), dashOff: g('dashOff'), id: it.id });
      }
    }
  }
  // 形状图层 → 绘制记录
  S.evalShapeLayer = (ev, comp, L, t, tol = 0.3) => { const out = []; evalItems(ev, comp, L, L.shape.items, A2.id(), 1, t, tol, out); return out; };
  // 形状图层几何（用于节点源）：所有轮廓的并集（局部坐标）
  S.shapeRegion = (ev, comp, L, t) => {
    const out = S.evalShapeLayer(ev, comp, L, t, 0.2); const polys = []; const seen = new Set();
    for (const d of out) { if (d.kind !== 'fill') continue; for (const sh of d.shapes) { if (seen.has(sh)) continue; seen.add(sh); for (const p of sh.polys) if (p.closed && p.pts.length >= 6) polys.push(xformPts(p.pts, d.mat)); } }
    return polys;
  };

  // ===== 文字 =====
  S.textDoc = (ev, comp, L, t) => ({ text: L.text.text, font: L.text.font, align: L.text.align, size: ev.value(comp, L, 'text.size', t), tracking: ev.value(comp, L, 'text.tracking', t), leading: ev.value(comp, L, 'text.leading', t) });
  S.textLayout = (ev, comp, L, t) => AE.Font.layout(S.textDoc(ev, comp, L, t));
  const ramp = (x, a, b) => { if (b <= a) return x >= a ? 1 : 0; return U.smoothstep(a, b, x); };
  // 动画制作工具选择强度
  S.selectorAmount = (an, u, N, ev, comp, L, t) => {
    const g = k => ev.value(comp, L, `an.${an.id}.${k}`, t);
    let s = g('start'), e = g('end'); const off = g('offset'); s += off; e += off; const soft = g('soft');
    if (s > e) { const tmp = s; s = e; e = tmp; }
    const w = 100 / N, c0 = u * w, c1 = (u + 1) * w;
    if (soft <= 0.001) { const ov = Math.max(0, Math.min(c1, e) - Math.max(c0, s)); return U.clamp(ov / w, 0, 1); }
    const c = (c0 + c1) / 2; const h = soft / 2;
    return U.sat(ramp(c, s - h, s + h) * (1 - ramp(c, e - h, e + h)));
  };
  // 文字图层 → 绘制记录（逐字符）
  S.evalTextLayer = (ev, comp, L, t) => {
    const lay = S.textLayout(ev, comp, L, t); const out = []; const doc = L.text;
    const fill = ev.value(comp, L, 'text.fill', t), sw = ev.value(comp, L, 'text.strokeW', t), sc = ev.value(comp, L, 'text.stroke', t);
    const counts = { char: lay.chars.length, word: Math.max(1, ...lay.chars.map(c => c.word + 1)), line: lay.lines };
    const ans = (L.animators || []).map(a => ({ a, props: { pos: ev.value(comp, L, `an.${a.id}.pos`, t), rot: ev.value(comp, L, `an.${a.id}.rot`, t), scale: ev.value(comp, L, `an.${a.id}.scale`, t), opacity: ev.value(comp, L, `an.${a.id}.opacity`, t) } }));
    for (const c of lay.chars) {
      if (!c.glyph.polys.length) continue;
      let m = [1, 0, 0, 1, c.cx, c.cy]; let op = 1;
      for (const { a, props } of ans) {
        const unit = a.basedOn === 'line' ? c.line : a.basedOn === 'word' ? c.word : c.idx; const N = counts[a.basedOn === 'line' ? 'line' : a.basedOn === 'word' ? 'word' : 'char'];
        const f = S.selectorAmount(a, unit, N, ev, comp, L, t);
        if (f <= 0) continue;
        const sx = 1 + (props.scale[0] / 100 - 1) * f, sy = 1 + (props.scale[1] / 100 - 1) * f;
        const am = A2.mul([1, 0, 0, 1, props.pos[0] * f, props.pos[1] * f], A2.trs(0, 0, props.rot * f, sx, sy));
        m = A2.mul(am, m); // 先在字符中心变换，再平移到位置
        op *= 1 + (props.opacity / 100 - 1) * f;
      }
      // m: 局部 → 层；字符多边形以字符中心为原点
      const shape = { polys: AE.Font.charPolys(c).map(p => ({ pts: p, closed: true })), opa: 1 };
      out.push({ kind: 'fill', shapes: [shape], mat: m, color: fill, opacity: op, rule: 'nonzero', char: c.idx });
      if (sw > 0) out.push({ kind: 'stroke', shapes: [shape], mat: m, color: sc, opacity: op, width: sw, cap: 'round', join: 'round', dash: 0, dashOff: 0, char: c.idx });
    }
    return out;
  };
  // 绘制记录包围盒（图层局部）
  S.drawsBBox = draws => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const d of draws) for (const sh of d.shapes) for (const p of sh.polys) {
      const q = xformPts(p.pts, d.mat); const pad = d.kind === 'stroke' ? d.width * 0.5 * Math.max(Math.hypot(d.mat[0], d.mat[1]), Math.hypot(d.mat[2], d.mat[3])) * 1.5 : 0;
      for (let i = 0; i < q.length; i += 2) { if (q[i] - pad < x0) x0 = q[i] - pad; if (q[i] + pad > x1) x1 = q[i] + pad; if (q[i + 1] - pad < y0) y0 = q[i + 1] - pad; if (q[i + 1] + pad > y1) y1 = q[i + 1] + pad; }
    }
    return x0 === Infinity ? null : [x0, y0, x1, y1];
  };
  S.xformPts = xformPts;
})();
