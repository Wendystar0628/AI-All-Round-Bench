/* ============================================================
   scene.js — 工程求值：属性/表达式、图层变换、几何构建、场景装配
   ============================================================ */
(function (global) {
  const AE = global.AE = global.AE || {};
  const U = AE.util;
  const S = AE.scene = {};

  const exprCache = new Map();
  function parseExpr(src) {
    if (exprCache.has(src)) return exprCache.get(src);
    let ast = null, err = null;
    try { ast = AE.expr.parse(src); } catch (e) { err = e.message; }
    exprCache.set(src, { ast, err });
    return exprCache.get(src);
  }
  S.clearExprCache = () => exprCache.clear();

  /* ---------------- 属性求值 ---------------- */
  S.evalProp = function (owner, name, time, ctx) {
    if (!owner || !owner.props) return undefined;
    const p = owner.props[name];
    if (!p) return undefined;
    if (p.ex) {
      try {
        const parsed = parseExpr(p.ex);
        if (parsed.err) throw new Error(parsed.err);
        const stack = ctx.stack || (ctx.stack = []);
        const key = (owner.id || 'x') + '.' + name;
        if (stack.includes(key)) throw new Error('表达式循环引用：' + key);
        stack.push(key);
        const selfVal = evalTrackOnly(p, time);
        const ectx = {
          time, value: selfVal, track: p.tr, layer: ctx.layer || owner,
          comp: ctx.comp, seed: U.hashStr((owner.id || '') + name) % 100000,
          vars: ctx.vars,
          evalLayerProp: (ly, prop, t) => S.evalProp(ly, prop, t, Object.assign({}, ctx, { layer: ly })),
          evalSelf: (t) => evalTrackOnly(p, t)
        };
        const v = AE.expr.eval(parsed.ast, ectx);
        stack.pop();
        return v;
      } catch (e) {
        ctx.errors = ctx.errors || [];
        if (ctx.errors.length < 12) ctx.errors.push({ layer: (ctx.layer && ctx.layer.name) || '', prop: name, message: e.message });
        // 出错时退回关键帧值
      }
    }
    return evalTrackOnly(p, time);
  };

  function evalTrackOnly(p, time) {
    if (p.tr && p.tr.keys && p.tr.keys.length) return AE.anim.evalTrack(p.tr, time);
    return p.v;
  }
  S.evalTrackOnly = evalTrackOnly;

  /** 读取图层属性（表达式上下文用） */
  S.layerProp = function (layer, name, time, ctx) {
    return S.evalProp(layer, name, time, ctx);
  };

  /* ---------------- 变换 ---------------- */
  function mat2d(pos, scale, rotDeg, anchor) {
    const a = U.rad(rotDeg || 0);
    const c = Math.cos(a), s = Math.sin(a);
    const sx = (scale && scale[0] !== undefined ? scale[0] : 100) / 100;
    const sy = (scale && scale[1] !== undefined ? scale[1] : 100) / 100;
    const ax = anchor ? anchor[0] : 0, ay = anchor ? anchor[1] : 0;
    // M = T(pos) * R * S * T(-anchor)
    const m00 = c * sx, m01 = -s * sy, m10 = s * sx, m11 = c * sy;
    const tx = pos[0] - (m00 * ax + m01 * ay);
    const ty = pos[1] - (m10 * ax + m11 * ay);
    // 列主序 3x3：[col0(x,y,z), col1, col2]
    return new Float32Array([m00, m10, 0, m01, m11, 0, tx, ty, 1]);
  }
  S.mat2d = mat2d;

  function mat3d(pos, scale, rotX, rotY, rotZ) {
    const t = [pos[0] || 0, pos[1] || 0, pos[2] || 0];
    const s = [(scale && scale[0] !== undefined ? scale[0] : 100) / 100,
    (scale && scale[1] !== undefined ? scale[1] : 100) / 100,
    (scale && scale[2] !== undefined ? scale[2] : 100) / 100];
    const r = [U.rad(rotX || 0), U.rad(rotY || 0), U.rad(rotZ || 0)];
    return U.mat4.fromTRS(t, r, s);
  }
  S.mat3d = mat3d;

  /* ---------------- 图层局部矩阵（考虑父级） ---------------- */
  function layerMatrix(layer, comp, time, ctx) {
    const pos = S.evalProp(layer, 'position', time, ctx) || [0, 0];
    const scale = S.evalProp(layer, 'scale', time, ctx) || [100, 100];
    const rot = S.evalProp(layer, 'rotation', time, ctx) || 0;
    const anchor = S.evalProp(layer, 'anchor', time, ctx) || [0, 0];
    if (layer.threeD) {
      const rz = S.evalProp(layer, 'positionZ', time, ctx) || 0;
      const rx = S.evalProp(layer, 'rotationX', time, ctx) || 0;
      const ry = S.evalProp(layer, 'rotationY', time, ctx) || 0;
      return mat3d([pos[0], pos[1], rz], scale, rx, ry, rot);
    }
    return mat2d(pos, scale, rot, anchor);
  }
  S.layerMatrix = layerMatrix;

  /** 父级链（由近到远） */
  function parentChain(layer, comp) {
    const chain = [];
    let cur = layer;
    let guard = 0;
    while (cur && cur.parent && guard++ < 32) {
      const p = comp.layers.find(l => l.id === cur.parent);
      if (!p) break;
      chain.push(p);
      cur = p;
    }
    return chain;
  }
  S.parentChain = parentChain;

  /** 世界矩阵（含父级链） */
  function worldMatrix(layer, comp, time, ctx) {
    const chain = parentChain(layer, comp);
    let m = layerMatrix(layer, comp, time, ctx);
    for (let i = chain.length - 1; i >= 0; i--) {
      const pm = layerMatrix(chain[i], comp, time, ctx);
      m = combine(pm, m);
    }
    return m;
  }
  function combine(a, b) {
    if (a.length === 9) {
      // a: mat3, b: mat3
      const out = new Float32Array(9);
      for (let c = 0; c < 3; c++) {
        for (let r = 0; r < 3; r++) {
          out[c * 3 + r] = a[0 * 3 + r] * b[c * 3 + 0] + a[1 * 3 + r] * b[c * 3 + 1] + a[2 * 3 + r] * b[c * 3 + 2];
        }
      }
      return out;
    }
    return U.mat4.multiply(a, b);
  }
  S.combine = combine;

  /* ---------------- 形状几何 ---------------- */
  /** 返回 [{pts, hole}] 形式的轮廓 */
  function pathContours(pathItem, group, time, ctx) {
    let path = pathItem.path;
    if (!path) return [];
    // 修剪
    if (pathItem.trim && (pathItem.trim.end !== undefined)) {
      const tr = pathItem.trim;
      const start = evalMaybe(pathItem, 'trimStart', time, ctx, tr.start || 0);
      const end = evalMaybe(pathItem, 'trimEnd', time, ctx, tr.end === undefined ? 100 : tr.end);
      const offset = evalMaybe(pathItem, 'trimOffset', time, ctx, tr.offset || 0);
      path = AE.path.trim(path, start / 100, end / 100, offset / 100);
    }
    let contours = [{ pts: AE.path.flatten(path, 0.4), hole: false }];
    // 重复器
    if (pathItem.repeat && pathItem.repeat.count > 1) {
      const cnt = Math.max(1, Math.round(pathItem.repeat.count));
      const ro = pathItem.repeat.offset || [0, 0];
      const rr = pathItem.repeat.rotate || 0;
      const rs = pathItem.repeat.scale === undefined ? 100 : pathItem.repeat.scale;
      const flat = AE.path.repeat(contours.map(c => c.pts), cnt, (i) => (p) => {
        const ang = U.rad(rr * i);
        const c = Math.cos(ang), s = Math.sin(ang);
        const sc = 1 + (rs / 100 - 1) * i;
        const x = p[0] * sc, y = p[1] * sc;
        return [x * c - y * s + ro[0] * i, x * s + y * c + ro[1] * i];
      });
      contours = flat.map(pts => ({ pts, hole: false }));
    }
    return contours;
  }

  function evalMaybe(obj, key, time, ctx, def) {
    if (obj.props && obj.props[key]) return S.evalProp(obj, key, time, ctx);
    return def;
  }

  /** 形状层 → 绘制几何 */
  function buildShapeLayer(layer, comp, time, ctx) {    const groups = (layer.shape && layer.shape.groups) || [];
    const items = [];
    const layerOpacity = (S.evalProp(layer, 'opacity', time, ctx) || 100) / 100;
    // 程序节点生成的形状优先
    if (layer.nodes && layer.nodes.nodes && layer.nodes.nodes.length) {
      const g = AE.nodes.evaluate(layer.nodes, {
        getLayer: name => comp.layers.find(l => l.name === name || l.label === name),
        time
      });
      if (g.contours && g.contours.length) {
        const col = U.color.hex2rgb(layer.props.fillColor ? layer.props.fillColor.v : '#ffffff');
        items.push({ type: 'fill', contours: g.contours.map(c => ({ pts: c.pts })), color: col, opacity: layerOpacity, matrix: IDENT3 });
        return items;
      }
    }
    for (const grp of groups) {
      const gPos = S.evalProp(grp, 'position', time, ctx) || [0, 0];
      const gScale = S.evalProp(grp, 'scale', time, ctx) || [100, 100];
      const gRot = S.evalProp(grp, 'rotation', time, ctx) || 0;
      const gAnchor = S.evalProp(grp, 'anchor', time, ctx) || [0, 0];
      const gOpacity = (S.evalProp(grp, 'opacity', time, ctx) || 100) / 100;
      const gMat = mat2d(gPos, gScale, gRot, gAnchor);
      // 每个路径的轮廓
      const pathItems = grp.paths || [];
      for (let pi = 0; pi < pathItems.length; pi++) {
        const pi2 = pathItems[pi];
        let contours = pathContours(pi2, grp, time, ctx);
        // 布尔运算
        if (pi2.boolean && pi2.boolean.op && pi2.boolean.withId) {
          const other = pathItems.find(p => p.id === pi2.boolean.withId);
          if (other) {
            const oc = pathContours(other, grp, time, ctx);
            const flatA = contours.reduce((a, c) => a.concat(c.pts), []);
            const flatB = oc.reduce((a, c) => a.concat(c.pts), []);
            const res = AE.path.boolean([{ pts: flatA, hole: false }], [{ pts: flatB, hole: false }], pi2.boolean.op, 380);
            contours = res.map(c => ({ pts: c, hole: false }));
          }
        }
        // 形变
        if (pi2.morph && pi2.morph.path) {
          const t = evalMaybe(pi2, 'morphProgress', time, ctx, 0) / 100;
          const A = contours.map(c => c.pts);
          const B = AE.path.flatten(pi2.morph.path, 0.4);
          contours = AE.path.morph(A, B, U.clamp(t, 0, 1)).map(pts => ({ pts, hole: false }));
        }
        // 显示裁剪（笔画依次出现）
        if (pi2.reveal && pi2.reveal.end !== undefined) {
          const st = evalMaybe(pi2, 'revealStart', time, ctx, pi2.reveal.start || 0);
          const en = evalMaybe(pi2, 'revealEnd', time, ctx, pi2.reveal.end || 1);
          const pr = U.clamp((time - st) / Math.max(0.0001, en - st), 0, 1);
          const pr2 = U.smoothstep(pr);
          if (pr2 < 0.999) {
            contours = contours.map(c => {
              const keep = Math.max(1, Math.ceil(c.pts.length * pr2));
              return { pts: c.pts.slice(0, keep), hole: c.hole };
            });
          }
        }
        const fill = pi2.fill;
        const stroke = pi2.stroke;
        if (fill && fill.enabled !== false) {
          const col = U.color.hex2rgb(fill.color || '#ffffff');
          const op = (fill.opacity === undefined ? 100 : fill.opacity) / 100 * gOpacity * layerOpacity;
          items.push({ type: 'fill', contours, color: col, opacity: op, matrix: gMat });
        }
        if (stroke && stroke.enabled !== false && stroke.width > 0) {
          const col = U.color.hex2rgb(stroke.color || '#ffffff');
          const op = (stroke.opacity === undefined ? 100 : stroke.opacity) / 100 * gOpacity * layerOpacity;
          const sc = [];
          for (const c of contours) {
            const o = AE.path.strokeOutline(c.pts, stroke.width, false, stroke.cap || 'round');
            if (o.length > 2) sc.push(o);
          }
          items.push({ type: 'stroke', contours: sc, color: col, opacity: op, matrix: gMat });
        }
      }
    }
    return items;
  }
  S.buildShapeLayer = buildShapeLayer;

  /** 文字层几何 */
  function buildTextLayer(layer, comp, time, ctx) {
    const size = S.evalProp(layer, 'fontSize', time, ctx) || 120;
    const leading = S.evalProp(layer, 'leading', time, ctx) || 1.25;
    const tracking = S.evalProp(layer, 'tracking', time, ctx) || 0;
    const align = S.evalProp(layer, 'align', time, ctx) || 'center';
    const family = S.evalProp(layer, 'fontFamily', time, ctx) || AE.text.FONT_STACK;
    const weight = String(S.evalProp(layer, 'fontWeight', time, ctx) || '700');
    const content = layer.text ? layer.text.content : '文字';
    const lay = AE.text.layout({ text: content, size, leading, tracking, align, family, weight });
    const items = [];
    const layerOpacity = (S.evalProp(layer, 'opacity', time, ctx) || 100) / 100;
    const anim = layer.text && layer.text.animator;
    let state = null;
    if (anim && anim.enabled) {
      const prog = U.clamp((time - (anim.startTime || 0)) / Math.max(0.0001, (anim.endTime || 1) - (anim.startTime || 0)), 0, 1);
      state = AE.text.animatorState(lay, anim, prog);
    }
    let gi = 0;
    for (const line of lay.lines) {
      for (const ch of line.chars) {
        const st = state ? (state.get(gi) || { opacity: 1, dx: 0, dy: 0, rot: 0, scale: 1 }) : null;
        gi++;
        if (!ch.ch.trim()) continue;
        const contours = [];
        for (const ct of ch.contours) {
          if (ct.hole) continue;
          const pts = ct.pts.map(p => [(p[0] * size) + ch.x + (st ? st.dx : 0), (p[1] * size) + ch.y + (st ? st.dy : 0)]);
          contours.push({ pts });
        }
        const op = (st ? st.opacity : 1) * layerOpacity;
        const fillCol = U.color.hex2rgb(layer.props.fillColor ? layer.props.fillColor.v : '#ffffff');
        items.push({ type: 'fill', contours, color: fillCol, opacity: op, matrix: IDENT3 });
      }
    }
    return { items, layout: lay, size };
  }

  const IDENT3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  function toMat3(m) {
    if (m.length === 9) return m;
    return new Float32Array([m[0], m[1], 0, m[4], m[5], 0, m[12], m[13], 1]);
  }
  S.toMat3 = toMat3;

  /* ---------------- 笔画显现（逐笔写出的进度场） ---------------- */
  function revealFnFor(layer) {
    const r = layer && layer.solid && layer.solid.reveal;
    if (!r || !r.char) return null;
    let map;
    try {
      map = AE.text.strokeMap(r.char, { family: r.family, weight: r.weight });
    } catch (e) { return null; }
    const sc = r.scale || 1, cx = r.cx || 0, cy = r.cy || 0;
    return (x, y) => map.revealAt(x / sc + cx, -y / sc + cy);
  }
  S.revealFnFor = revealFnFor;

  /** 给挤出网格附加逐顶点显现时间 */
  function attachReveal(mesh, rf) {
    if (!rf || !mesh || !mesh.positions || !mesh.positions.length) return;
    const n = mesh.positions.length / 3;
    const arr = new Float32Array(n);
    for (let i = 0; i < n; i++) arr[i] = rf(mesh.positions[i * 3], mesh.positions[i * 3 + 1]);
    mesh.reveal = arr;
  }

  /** 图层的显现进度（0..1，>=1.5 表示不裁剪） */
  function revealProgress(layer, time, ctx) {
    const rev = layer && layer.solid && layer.solid.reveal;
    if (!rev) return 2;
    const st = evalMaybe(layer, 'revealStart', time, ctx, rev.start || 0);
    const en = evalMaybe(layer, 'revealEnd', time, ctx, rev.end || 1);
    return U.clamp((time - st) / Math.max(0.001, en - st), 0, 1);
  }

  /* ---------------- 三维几何 ---------------- */
  /** 实体的轮廓（含逐步显现裁剪） */
  function solidContours(layer, time, ctx) {
    const src = (layer.solid && layer.solid.paths) || [];
    const out = [];
    for (const p of src) {
      let pts = p.pts;
      if (p.reveal && p.reveal.end !== undefined) {
        const st = evalMaybe(p, 'revealStart', time, ctx, p.reveal.start || 0);
        const en = evalMaybe(p, 'revealEnd', time, ctx, p.reveal.end || 1);
        const pr = U.clamp((time - st) / Math.max(0.0001, en - st), 0, 1);
        const pr2 = U.smoothstep(pr);
        if (pr2 < 0.999) {
          const keep = Math.max(1, Math.ceil(pts.length * pr2));
          pts = pts.slice(0, keep);
        }
      }
      if (pts && pts.length > 2) out.push({ pts, hole: !!p.hole });
    }
    return out;
  }

  function buildSolid(layer, comp, time, ctx) {
    const depth = S.evalProp(layer, 'extrude', time, ctx) || 0;
    const bevel = S.evalProp(layer, 'bevel', time, ctx) || 0;
    const contours = solidContours(layer, time, ctx);
    if (!contours.length || depth <= 0) return null;
    const mesh = AE.geom.extrude(contours, { depth, bevel });
    const pins = (layer.solid.pins || []).map(p => ({
      x: S.evalProp(p, 'x', time, ctx) !== undefined ? S.evalProp(p, 'x', time, ctx) : p.x,
      y: S.evalProp(p, 'y', time, ctx) !== undefined ? S.evalProp(p, 'y', time, ctx) : p.y,
      z: S.evalProp(p, 'z', time, ctx) !== undefined ? S.evalProp(p, 'z', time, ctx) : (p.z || 0),
      rot: S.evalProp(p, 'rotation', time, ctx) !== undefined ? S.evalProp(p, 'rotation', time, ctx) : (p.rot || 0),
      // 图层属性用百分比（100 = 原尺寸），几何变形需要比例因子
      scale: (S.evalProp(p, 'scale', time, ctx) !== undefined ? S.evalProp(p, 'scale', time, ctx) : (p.scale === undefined ? 100 : p.scale)) / 100,
      enabled: p.enabled !== false
    }));
    const twist = S.evalProp(layer, 'twist', time, ctx) || 0;
    const bend = S.evalProp(layer, 'bend', time, ctx) || 0;
    const bendAxis = S.evalProp(layer, 'bendAxis', time, ctx) || 'x';
    const fieldList = (comp.fields || []).filter(f => f.enabled);
    AE.geom.deform(mesh, { pins, twist, bend, bendAxis, fields: fieldList.map(f => ({ field: f, strength: 1 })) });
    return mesh;
  }

  /* ---------------- 粒子 ---------------- */
  function buildParticles(layer, comp, time, ctx, scene) {
    const em = layer.emitter || {};
    let source = null;
    let sourceHash = '';
    if (em.type === 'surface' && em.surfaceLayer) {
      const sl = comp.layers.find(l => l.id === em.surfaceLayer);
      if (sl && sl._meshCache && sl._meshCache.time === time) {
        const m = sl._meshCache.mesh;
        source = {
          points: [[0, 0, 0]], triangles: m.indices, positions: m.positions,
          totalArea: m.indices.length / 3 * 0.5
        };
        sourceHash = 'surf' + sl.id;
      }
    } else if (em.type === 'curve') {
      const pts = (em.curvePoints || []).map(p => [p[0], p[1], p[2] || 0]);
      source = { points: pts.length ? pts : [[0, 0, 0]] };
      sourceHash = 'curve' + pts.length;
    } else {
      const p = S.evalProp(layer, 'position', time, ctx) || [0, 0];
      const pz = layer.threeD ? (S.evalProp(layer, 'positionZ', time, ctx) || 0) : 0;
      source = { points: [[p[0], p[1], pz]] };
      sourceHash = 'point';
    }
    const colliderLayer = layer.collider ? comp.layers.find(l => l.id === layer.collider) : null;
    let collider = null;
    if (colliderLayer && colliderLayer._meshCache) {
      collider = colliderLayer._meshCache.mesh;
    }
    const ps = AE.particles.build(layer, comp, time, {
      getProp: (ly, name, t) => S.evalProp(ly, name, t, ctx),
      source: () => source,
      collider: () => collider,
      fields: (comp.fields || []).filter(f => f.enabled),
      sourceHash
    });
    return ps;
  }

  /* ---------------- 场景装配 ---------------- */
  /**
   * opts: { viewMode, renderPrecomp(comp, layer, time) }
   */
  S.build = function (comp, project, time, opts) {
    opts = opts || {};
    const ctx = {
      project, comp, layer: null, time, errors: [], stack: []
    };
    const layers = [];
    // 相机
    let camLayer = comp.layers.find(l => l.type === 'camera');
    let camPos = [comp.w / 2, comp.h / 2, -2600], camPoint = [comp.w / 2, comp.h / 2, 0];
    let fov = 45, focus = 1400, aperture = 0.004, near = 20, far = 12000;
    if (camLayer) {
      camPos = S.evalProp(camLayer, 'camPosition', time, ctx) || camPos;
      camPoint = S.evalProp(camLayer, 'camPoint', time, ctx) || camPoint;
      fov = S.evalProp(camLayer, 'camFov', time, ctx) || fov;
      focus = S.evalProp(camLayer, 'camFocus', time, ctx) || focus;
      aperture = S.evalProp(camLayer, 'camAperture', time, ctx) || aperture;
      near = S.evalProp(camLayer, 'camNear', time, ctx) || near;
      far = S.evalProp(camLayer, 'camFar', time, ctx) || far;
    }
    const view = U.mat4.lookAt(camPos, camPoint, [0, 1, 0]);
    const proj = U.mat4.perspective(U.rad(fov), comp.w / comp.h, near, far);
    const vp = U.mat4.multiply(proj, view);
    const camRight = [view[0], view[4], view[8]];
    const pointScale = (comp.h / 2) / Math.tan(U.rad(fov) / 2);

    // 灯光
    const lights = [];
    for (const l of comp.layers.filter(x => x.type === 'light')) {
      const type = S.evalProp(l, 'lightType', time, ctx) || 'parallel';
      const color = S.evalProp(l, 'lightColor', time, ctx) || '#ffffff';
      const intensity = S.evalProp(l, 'lightIntensity', time, ctx) || 1;
      const dir = S.evalProp(l, 'lightDir', time, ctx) || [-0.4, -0.8, -0.5];
      const pos = S.evalProp(l, 'lightPos', time, ctx) || [0, 0, 0];
      const shadow = S.evalProp(l, 'lightShadow', time, ctx);
      lights.push({ type, color, intensity, dir, pos, shadow: !!shadow, layer: l });
    }

    const env = { top: '#2b3a4c', bottom: '#0b1016', intensity: 1.0 };
    const items = [];
    const shadowMeshes = [];
    const shadowCenter = [comp.w / 2, comp.h / 2, 0];

    // AE 顺序：数组索引 0 在最上层 → 渲染时从底向上
    const ordered = comp.layers.slice().reverse();
    for (const layer of ordered) {
      if (!layer.enabled) continue;
      const inT = layer.inPoint, outT = layer.outPoint;
      if (time < inT - 1e-6 || time > outT + 1e-6) {
        if (layer.type !== 'camera' && layer.type !== 'light') continue;
      }
      ctx.layer = layer;
      const opacity = (S.evalProp(layer, 'opacity', time, ctx) || 100) / 100;
      const wm = worldMatrix(layer, comp, time, ctx);

      if (layer.type === 'shape' || layer.type === 'text') {
        let geoItems;
        if (layer.type === 'shape') geoItems = buildShapeLayer(layer, comp, time, ctx);
        else {
          const r = buildTextLayer(layer, comp, time, ctx);
          geoItems = r.items;
          layer._layout = r.layout;
        }
        const extrude = S.evalProp(layer, 'extrude', time, ctx) || 0;
        const rfShape = revealFnFor(layer);
        if (extrude > 0 && geoItems.length) {
          // 挤出为三维实体
          const contours = [];
          for (const it of geoItems) {
            if (it.type !== 'fill') continue;
            for (const c of it.contours) contours.push({ pts: c.pts, hole: false });
          }
          const mesh = AE.geom.extrude(contours, { depth: extrude, bevel: S.evalProp(layer, 'bevel', time, ctx) || 0 });
          attachReveal(mesh, rfShape);
          items.push({
            kind: 'solid3d', layer, mesh, model: wm, opacity,
            material: materialOf(layer, time, ctx),
            blendMode: layer.blendMode,
            reveal: revealProgress(layer, time, ctx)
          });
          layer._meshCache = { mesh, time };
          shadowMeshes.push({ mesh, model: wm });
        } else {
          // 2D
          const verts = [], indices = [];
          let base = 0;
          const shapeOnly = opts.viewMode === 'shapes';
          for (const it of geoItems) {
            if (it.type === 'fill') {
              if (shapeOnly) continue;
              const tri = AE.path.triangulate(it.contours.map(c => ({ pts: c.pts, hole: false })));
              for (let i = 0; i < tri.verts.length; i += 2) {
                const rv = rfShape ? rfShape(tri.verts[i], tri.verts[i + 1]) : 0;
                verts.push(tri.verts[i], tri.verts[i + 1], it.color[0], it.color[1], it.color[2], it.opacity, rv);
              }
              for (const i of tri.indices) indices.push(base + i);
              base += tri.verts.length / 2;
            }
          }
          if (!verts.length) {
            // 描边模式
            for (const it of geoItems) {
              if (it.type !== 'stroke') continue;
              const tri = AE.path.triangulate(it.contours.map(c => ({ pts: c, hole: false })));
              for (let i = 0; i < tri.verts.length; i += 2) {
                verts.push(tri.verts[i], tri.verts[i + 1], it.color[0], it.color[1], it.color[2], it.opacity, 0);
              }
              for (const i of tri.indices) indices.push(base + i);
              base += tri.verts.length / 2;
            }
          }
          if (verts.length) {
            items.push({
              kind: 'tri2d', layer, verts: new Float32Array(verts), indices: new Uint32Array(indices),
              matrix: toMat3(wm), opacity: 1, blendMode: layer.blendMode,
              effects: layer.effects, masks: buildMasks(layer, comp, time, ctx),
              reveal: revealProgress(layer, time, ctx)
            });
          }
        }
      } else if (layer.type === 'solid3d') {
        const mesh = buildSolid(layer, comp, time, ctx);
        if (mesh) {
          attachReveal(mesh, revealFnFor(layer));
          items.push({
            kind: 'solid3d', layer, mesh, model: wm, opacity,
            material: materialOf(layer, time, ctx), blendMode: layer.blendMode,
            reveal: revealProgress(layer, time, ctx)
          });
          layer._meshCache = { mesh, time };
          shadowMeshes.push({ mesh, model: wm });
        } else {
          // 无挤出深度时按平面填充渲染（写入阶段）
          const contours = solidContours(layer, time, ctx);
          if (contours.length) {
            const tri = AE.path.triangulate(contours);
            const verts = [], indices = [];
            const mat = materialOf(layer, time, ctx);
            const col = U.color.hex2rgb(mat.baseColor);
            const em = U.color.hex2rgb(mat.emissive);
            const emI = mat.emissiveIntensity;
            const rf = revealFnFor(layer);
            for (let i = 0; i < tri.verts.length; i += 2) {
              const r = col[0] + em[0] * emI, g = col[1] + em[1] * emI, b = col[2] + em[2] * emI;
              const rv = rf ? rf(tri.verts[i], tri.verts[i + 1]) : 0;
              verts.push(tri.verts[i], tri.verts[i + 1], Math.min(1, r), Math.min(1, g), Math.min(1, b), opacity, rv);
            }
            for (const i of tri.indices) indices.push(i);
            const progress = revealProgress(layer, time, ctx);
            items.push({
              kind: 'tri2d', layer, verts: new Float32Array(verts), indices: new Uint32Array(indices),
              matrix: toMat3(wm), opacity: 1, blendMode: layer.blendMode, effects: layer.effects,
              reveal: progress
            });
          }
        }
      } else if (layer.type === 'particle') {
        const ps = buildParticles(layer, comp, time, ctx, items);
        const wm3 = worldMatrix(layer, comp, time, ctx);
        items.push({
          kind: 'particle', layer, particles: ps, model: wm3, opacity,
          trails: ps.trails, trailColor: S.evalProp(layer, 'pTrailColor', time, ctx) || '#ff8a3d',
          trailWidth: S.evalProp(layer, 'pTrailWidth', time, ctx) || 3,
          blendMode: layer.blendMode
        });
      } else if (layer.type === 'adjustment') {
        items.push({
          kind: 'adjustment', layer, effects: adjustmentEffects(layer, time, ctx),
          opacity, blendMode: layer.blendMode
        });
      } else if (layer.type === 'precomp') {
        const sub = layer.precomp ? AE.model.compById(project, layer.precomp.compId) : null;
        if (sub && opts.renderPrecomp) {
          const start = S.evalProp(layer, 'precompStart', time, ctx) || 0;
          const scale = (S.evalProp(layer, 'precompScale', time, ctx) || 100) / 100;
          const rev = S.evalProp(layer, 'precompReverse', time, ctx);
          let local = (time - layer.inPoint) * scale + start;
          if (rev) local = sub.duration - (local - start);
          const rt = opts.renderPrecomp(sub, layer, U.clamp(local, 0, sub.duration));
          const wm2 = layerMatrix(layer, comp, time, ctx);
          items.push({
            kind: 'precomp', layer, rt, opacity, blendMode: layer.blendMode,
            matrix: wm2
          });
        }
      }
    }

    return {
      comp, w: comp.w, h: comp.h, time, items, layers: items, lights, camera: {
        vp, pos: camPos, focus, aperture, pointScale, right: camRight, fov
      },
      shadowMeshes, shadowCenter, shadowRadius: Math.max(comp.w, comp.h) * 0.8,
      env, viewMode: opts.viewMode || 'final',
      errors: ctx.errors
    };
  };

  function materialOf(layer, time, ctx) {
    return {
      baseColor: S.evalProp(layer, 'baseColor', time, ctx) || '#b8c2cc',
      metallic: (S.evalProp(layer, 'metallic', time, ctx) === undefined ? 85 : S.evalProp(layer, 'metallic', time, ctx)) / 100,
      roughness: (S.evalProp(layer, 'roughness', time, ctx) === undefined ? 32 : S.evalProp(layer, 'roughness', time, ctx)) / 100,
      emissive: S.evalProp(layer, 'emissive', time, ctx) || '#000000',
      emissiveIntensity: S.evalProp(layer, 'emissiveIntensity', time, ctx) || 0,
      opacity: 1
    };
  }

  function adjustmentEffects(layer, time, ctx) {
    const type = S.evalProp(layer, 'adjType', time, ctx) || 'hsl';
    const hue = S.evalProp(layer, 'adjHue', time, ctx) || 0;
    const sat = S.evalProp(layer, 'adjSat', time, ctx) || 0;
    const light = S.evalProp(layer, 'adjLight', time, ctx) || 0;
    const exp = S.evalProp(layer, 'adjExposure', time, ctx) || 0;
    const vib = S.evalProp(layer, 'adjVibrance', time, ctx) || 0;
    const out = [];
    if (type === 'hsl') out.push({ type: 'hsl', enabled: true, props: { hue: { v: hue }, saturation: { v: sat }, lightness: { v: light } } });
    if (type === 'exposure') out.push({ type: 'hsl', enabled: true, props: { hue: { v: 0 }, saturation: { v: 0 }, lightness: { v: exp * 6 } } });
    if (type === 'vibrance') out.push({ type: 'hsl', enabled: true, props: { hue: { v: 0 }, saturation: { v: vib * 0.6 }, lightness: { v: 0 } } });
    return out;
  }

  function buildMasks(layer, comp, time, ctx) {
    if (!layer.masks || !layer.masks.length) return null;
    const out = [];
    for (const m of layer.masks) {
      const contours = [];
      if (m.type === 'rect') contours.push(AE.path.flatten(AE.path.rect(m.x || 0, m.y || 0, m.w || 100, m.h || 100, m.r || 0), 0.5));
      else if (m.type === 'ellipse') contours.push(AE.path.flatten(AE.path.ellipse(m.cx || 0, m.cy || 0, m.rx || 50, m.ry || 50), 0.5));
      else if (m.path) contours.push(AE.path.flatten(m.path, 0.5));
      if (!contours.length) continue;
      out.push({
        contours, mode: m.mode || 'add', inverted: !!m.inverted,
        opacity: m.opacity === undefined ? 100 : m.opacity,
        matrix: toMat3(worldMatrix(layer, comp, time, ctx))
      });
    }
    return out;
  }
})(window);
