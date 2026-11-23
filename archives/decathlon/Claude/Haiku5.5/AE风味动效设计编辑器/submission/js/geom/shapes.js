/* 形状管线：按图层内容列表的顺序逐项处理（路径 -> 修剪 / 重复 / 布尔 -> 填充 / 描边）。
 * 顺序影响结果：布尔运算只作用于它之前的路径，修剪与重复也只影响之前的路径。
 * 输出为“绘制项”列表（填充或描边的轮廓与颜色），坐标位于图层本地空间（像素）。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const U = AE.U;
  const M = U.mat;
  const P = AE.Path;
  const Anim = AE.Anim;
  const Shapes = (AE.Shapes = {});

  const val = (comp, layer, prop, t) => Anim.value(comp, layer, prop, t);

  // 生成变换矩阵（锚点、位置、缩放 %、旋转 度），2D
  Shapes.xform2 = (anchor, pos, scalePct, rotDeg) => {
    const s = scalePct / 100;
    const m = M.mul(M.translate(pos[0], pos[1], 0), M.mul(M.rotZ(U.deg2rad(rotDeg)), M.scale(s, s, 1)));
    return M.mul(m, M.translate(-anchor[0], -anchor[1], 0));
  };

  // 把一组轮廓平移 / 变换
  const xContours = (contours, m) => contours.map((c) => ({ pts: P.transform(c.pts, m), closed: c.closed }));

  // 处理一组内容项，返回绘制项数组
  function processItems(items, comp, layer, t) {
    const draws = [];
    let sets = []; // 当前路径集合：[{contours, alpha}]
    const allContours = () => sets.flatMap((s) => s.contours);
    (items || []).forEach((it) => {
      switch (it.type) {
        case 'rect': {
          const pos = val(comp, layer, it.pos, t), size = val(comp, layer, it.size, t);
          const r = val(comp, layer, it.round, t);
          const bp = U.clone(AE.Model.rectPath(pos[0], pos[1], size[0], size[1], r));
          sets.push({ contours: P.contoursFromBPaths([bp], 0.35), alpha: 1 });
          break;
        }
        case 'ellipse': {
          const pos = val(comp, layer, it.pos, t), size = val(comp, layer, it.size, t);
          const bp = AE.Model.ellipsePath(pos[0], pos[1], size[0], size[1]);
          sets.push({ contours: P.contoursFromBPaths([bp], 0.35), alpha: 1 });
          break;
        }
        case 'path': {
          const list = val(comp, layer, it.path, t) || [];
          sets.push({ contours: P.contoursFromBPaths(list, 0.35), alpha: 1 });
          break;
        }
        case 'group': {
          const g = it.tr;
          const sub = processItems(it.items, comp, layer, t);
          const anchor = val(comp, layer, g.anchor, t), pos = val(comp, layer, g.position, t);
          const sc = val(comp, layer, g.scale, t), rot = val(comp, layer, g.rotation, t);
          const op = val(comp, layer, g.opacity, t) / 100;
          const m = Shapes.xform2(anchor, pos, sc[0], rot);
          sub.forEach((d) => {
            d.contours = xContours(d.contours, m);
            d.alpha *= op;
            draws.push(d);
          });
          break;
        }
        case 'fill': {
          const c = val(comp, layer, it.color, t);
          const op = val(comp, layer, it.opacity, t) / 100;
          sets.forEach((s) => draws.push({ kind: 'fill', contours: s.contours, alpha: s.alpha * op, color: c }));
          break;
        }
        case 'stroke': {
          const c = val(comp, layer, it.color, t);
          const w = val(comp, layer, it.width, t);
          const op = val(comp, layer, it.opacity, t) / 100;
          sets.forEach((s) => draws.push({ kind: 'stroke', contours: s.contours, alpha: s.alpha * op, color: c, width: w }));
          break;
        }
        case 'trim': {
          const st = val(comp, layer, it.start, t) / 100, en = val(comp, layer, it.end, t) / 100;
          const off = val(comp, layer, it.offset, t) / 360;
          const all = allContours();
          if (en < st) {
            sets = [];
            break;
          }
          const trimmed = P.trim(all, st, en, off);
          sets = [{ contours: trimmed, alpha: 1 }];
          break;
        }
        case 'repeat': {
          const n = Math.max(1, Math.round(val(comp, layer, it.copies, t)));
          const off = val(comp, layer, it.offset, t);
          const rot = val(comp, layer, it.rot, t);
          const sc = val(comp, layer, it.scale, t);
          const op0 = val(comp, layer, it.opStart, t) / 100;
          const op1 = val(comp, layer, it.opEnd, t) / 100;
          const out = [];
          for (let i = 0; i < n; i++) {
            const k = i;
            const s = Math.pow(sc[0] / 100, k);
            const m = M.mul(M.translate(off[0] * k, off[1] * k, 0), M.mul(M.rotZ(U.deg2rad(rot * k)), M.scale(s, s, 1)));
            const a = n > 1 ? U.lerp(op0, op1, i / (n - 1)) : op0;
            sets.forEach((st) => out.push({ contours: xContours(st.contours, m), alpha: st.alpha * a }));
          }
          sets = out;
          break;
        }
        case 'merge': {
          if (!sets.length) break;
          const contours = P.booleanFold(sets.map((s) => s.contours), it.mode || 'add');
          sets = [{ contours, alpha: 1 }];
          break;
        }
        default:
          break;
      }
    });
    return draws;
  }

  // 形状图层：返回绘制项（图层本地坐标）
  Shapes.evaluateShape = (comp, layer, t) => processItems(layer.contents, comp, layer, t);

  // 文字图层：逐字（或逐行）应用动画器，返回每字的填充绘制项
  Shapes.evaluateText = (comp, layer, t) => {
    const tx = layer.text;
    const text = val(comp, layer, tx.text, t);
    const size = val(comp, layer, tx.size, t);
    const lead = val(comp, layer, tx.leading, t);
    const track = val(comp, layer, tx.tracking, t);
    const lay = AE.Text.layout({ text, font: tx.font, size, leading: lead, tracking: track, align: tx.align });
    const color = val(comp, layer, layer.fill.color, t);
    const fillOp = val(comp, layer, layer.fill.opacity, t) / 100;
    const N = lay.glyphs.length || 1;
    const linesN = lay.lines || 1;
    const wordsN = lay.words || 1;
    const draws = [];
    lay.glyphs.forEach((g, gi) => {
      // 每个字的状态：位置偏移、旋转、缩放、透明度
      let pos = [0, 0], rot = 0, sc = [1, 1], alpha = 1;
      tx.animators.forEach((an) => {
        // 单位：逐字 / 逐词 / 逐行；空格不属于任何词，词动画不作用于空格
        const unitIdx = an.unit === 'line' ? g.line : an.unit === 'word' ? g.word : gi;
        const unitN = an.unit === 'line' ? linesN : an.unit === 'word' ? wordsN : N;
        if (unitIdx < 0) return;
        const sStart = val(comp, layer, an.start, t);
        const sEnd = val(comp, layer, an.end, t);
        const sOff = val(comp, layer, an.offset, t);
        const soft = Math.max(0, val(comp, layer, an.softness, t));
        const x = ((unitIdx + 0.5) / unitN) * 100;
        const lo = Math.min(sStart, sEnd) + sOff, hi = Math.max(sStart, sEnd) + sOff;
        const h = soft / 2;
        const w = U.smoothstep(lo - h, lo + h + 1e-6, x) * (1 - U.smoothstep(hi - h, hi + h + 1e-6, x));
        if (w <= 0) return;
        const p = val(comp, layer, an.pos, t);
        const r = val(comp, layer, an.rot, t);
        const s = val(comp, layer, an.scale, t);
        const o = val(comp, layer, an.opacity, t);
        pos = [pos[0] + p[0] * w, pos[1] + p[1] * w];
        rot += r * w;
        sc = [sc[0] * (1 + (s[0] / 100 - 1) * w), sc[1] * (1 + (s[1] / 100 - 1) * w)];
        alpha *= 1 + (o / 100 - 1) * w;
      });
      if (!g.contours.length) return;
      const m = M.mul(M.translate(g.cx + pos[0], g.cy + pos[1], 0), M.mul(M.rotZ(U.deg2rad(rot)), M.scale(sc[0], sc[1], 1)));
      const mm = M.mul(m, M.translate(-g.cx, -g.cy, 0));
      draws.push({ kind: 'fill', contours: xContours(g.contours, mm), alpha: Math.max(0, alpha) * fillOp, color, glyph: gi, char: g.ch });
    });
    return { draws, layout: lay };
  };

  // 自动笔画遮罩：文字图层开启“自动笔画”时，按当前文字的笔画包围盒生成遮罩；
  // 每一笔的矩形从中心向外展开，各笔依次在自己的时间段内完成（改字后笔画随之重新生成）
  Shapes.autoStrokeMasks = (comp, layer, t) => {
    if (layer.type !== 'text') return [];
    const tx = layer.text;
    const text = Anim.value(comp, layer, tx.text, t);
    const size = Anim.value(comp, layer, tx.size, t);
    const boxes = AE.Text.strokeBoxes({ text, font: tx.font, size, leading: size * 1.15, tracking: 0, align: 'center' });
    if (!boxes.length) return [];
    const cfg = layer.autoStroke;
    const start = cfg.start || 0, span = cfg.span || 2.6;
    const per = span / boxes.length;
    const fixed = (v) => ({ kind: 'num', v, animated: false, keys: [], expr: '', exprOn: false, id: 'auto' });
    return boxes.map((b, i) => {
      const t0 = start + i * per, dur = per * 0.85;
      const p = U.clamp((t - t0) / dur, 0, 1);
      const f = 1 - Math.pow(1 - p, 2);
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      const w = Math.max(0.5, (b.x1 - b.x0 + 8) * f), h = Math.max(0.5, (b.y1 - b.y0 + 8) * f);
      return {
        name: '笔画' + (i + 1),
        mode: 'add',
        inv: false,
        path: { kind: 'path', v: [AE.Model.rectPath(cx, cy, w, h, 0)], animated: false, keys: [], expr: '', exprOn: false, id: 'auto' },
        feather: fixed(2),
        opacity: fixed(100),
      };
    });
  };

  // 统一入口
  Shapes.evaluate = (comp, layer, t) => {
    if (layer.type === 'text') return Shapes.evaluateText(comp, layer, t).draws;
    if (layer.type === 'shape') return Shapes.evaluateShape(comp, layer, t);
    return [];
  };
})();
