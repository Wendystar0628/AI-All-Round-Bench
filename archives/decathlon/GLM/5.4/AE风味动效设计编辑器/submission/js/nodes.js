/* ============================================================
   nodes.js — 程序节点：类型化端口、几何生成/分布/变换、分组
   ============================================================ */
(function (global) {
  'use strict';
  const PT_ = PT;

  const PORT_COLOR = {
    scalar: '#6fd0ff', vector: '#8be28b', color: '#ff8fa3', geometry: '#e8c56a', field: '#c39bff', mesh: '#e8c56a', any: '#9aa3b5'
  };

  function geoPaths(path) { return { kind: 'paths', path }; }
  function geoMesh(mesh) { return { kind: 'mesh', mesh }; }
  function geoToMesh(g) {
    if (!g) return null;
    if (g.kind === 'mesh') return g.mesh;
    return GEO.pathToMesh(g.path);
  }
  function geoToPaths(g) {
    if (!g) return null;
    if (g.kind === 'paths') return g.path;
    return null;
  }
  function transformGeo(g, m) {
    if (!g) return null;
    if (g.kind === 'paths') return geoPaths(PT.transformPath(g.path, [m[0], m[1], m[4], m[5], m[12], m[13]]));
    return geoMesh(GEO.transformMesh(g.mesh, m));
  }
  function geoBBox(g) {
    if (!g) return { x: 0, y: 0, w: 0, h: 0 };
    if (g.kind === 'paths') return PT.pathBBox(g.path);
    const v = g.mesh.verts;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < v.length; i += 3) { x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); y0 = Math.min(y0, v[i + 1]); y1 = Math.max(y1, v[i + 1]); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function cloneGeo(g) {
    if (!g) return null;
    if (g.kind === 'paths') return geoPaths(JSON.parse(JSON.stringify(g.path)));
    return geoMesh({ verts: new Float32Array(g.mesh.verts), norms: new Float32Array(g.mesh.norms), uvs: g.mesh.uvs, idx: g.mesh.idx });
  }

  const DEFS = {
    layer: {
      label: '图层几何', cat: '输入', color: '#5b8fd6',
      inputs: [], outputs: [{ name: '几何', type: 'geometry' }],
      params: [{ key: 'layerId', label: '图层', type: 'layer' }],
      eval(ctx) {
        const comp = ctx.comp;
        const layer = comp.layers.find(l => l.id === ctx.p('layerId'));
        if (!layer) return null;
        return layerGeometry(comp, layer, ctx.state, ctx.time);
      }
    },
    text: {
      label: '文字轮廓', cat: '输入', color: '#5b8fd6',
      inputs: [], outputs: [{ name: '路径', type: 'geometry' }],
      params: [{ key: 'text', label: '文字', type: 'string', def: '锻' }, { key: 'font', label: '字体', type: 'font', def: 'Microsoft YaHei' }, { key: 'size', label: '字号', type: 'number', def: 400 }],
      eval(ctx) {
        const tp = FONT.textToPath(ctx.p('text') || '字', { fontFamily: ctx.p('font'), fontSize: ctx.p('size') || 400 });
        return geoPaths(tp.path);
      }
    },
    rect: {
      label: '矩形', cat: '生成', color: '#6a9e6a',
      inputs: [], outputs: [{ name: '路径', type: 'geometry' }],
      params: [{ key: 'w', label: '宽', type: 'number', def: 200 }, { key: 'h', label: '高', type: 'number', def: 120 }, { key: 'r', label: '圆角', type: 'number', def: 0 }],
      eval(ctx) { return geoPaths(PT.rectPath(-ctx.p('w') / 2, -ctx.p('h') / 2, ctx.p('w'), ctx.p('h'), ctx.p('r'))); }
    },
    ellipse: {
      label: '椭圆', cat: '生成', color: '#6a9e6a',
      inputs: [], outputs: [{ name: '路径', type: 'geometry' }],
      params: [{ key: 'rx', label: '宽半径', type: 'number', def: 100 }, { key: 'ry', label: '高半径', type: 'number', def: 100 }],
      eval(ctx) { return geoPaths(PT.ellipsePath(0, 0, ctx.p('rx'), ctx.p('ry'))); }
    },
    star: {
      label: '星形', cat: '生成', color: '#6a9e6a',
      inputs: [], outputs: [{ name: '路径', type: 'geometry' }],
      params: [{ key: 'r1', label: '外径', type: 'number', def: 100 }, { key: 'r2', label: '内径', type: 'number', def: 45 }, { key: 'n', label: '角数', type: 'number', def: 5 }],
      eval(ctx) { return geoPaths(PT.starPath(0, 0, ctx.p('r1'), ctx.p('r2'), Math.max(3, Math.round(ctx.p('n'))))); }
    },
    polygon: {
      label: '多边形', cat: '生成', color: '#6a9e6a',
      inputs: [], outputs: [{ name: '路径', type: 'geometry' }],
      params: [{ key: 'r', label: '半径', type: 'number', def: 100 }, { key: 'n', label: '边数', type: 'number', def: 6 }],
      eval(ctx) {
        const n = Math.max(3, Math.round(ctx.p('n'))), r = ctx.p('r');
        const pts = [];
        for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 - Math.PI / 2; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
        return geoPaths(PT.polylinePath(pts));
      }
    },
    transform: {
      label: '变换', cat: '处理', color: '#b08a4a',
      inputs: [{ name: '几何', type: 'geometry' }], outputs: [{ name: '几何', type: 'geometry' }],
      params: [{ key: 'x', label: 'X', type: 'number', def: 0 }, { key: 'y', label: 'Y', type: 'number', def: 0 }, { key: 'z', label: 'Z', type: 'number', def: 0 }, { key: 'rot', label: '旋转', type: 'number', def: 0 }, { key: 'scale', label: '缩放', type: 'number', def: 100 }],
      eval(ctx) {
        const g = ctx.in(0);
        if (!g) return null;
        const s = ctx.p('scale') / 100;
        const m = U.M4.mul(U.M4.translation(ctx.p('x'), ctx.p('y'), ctx.p('z')), U.M4.mul(U.M4.rotZ(ctx.p('rot') * Math.PI / 180), U.M4.scale(s, s, s)));
        return transformGeo(g, m);
      }
    },
    distribute: {
      label: '分布', cat: '处理', color: '#b08a4a',
      inputs: [{ name: '几何', type: 'geometry' }], outputs: [{ name: '几何', type: 'geometry' }],
      params: [{ key: 'copies', label: '数量', type: 'number', def: 6 }, { key: 'mode', label: '方式', type: 'select', options: ['直线', '圆环', '网格', '随机'], def: '圆环' }, { key: 'dist', label: '间距', type: 'number', def: 120 }, { key: 'angle', label: '角度', type: 'number', def: 0 }, { key: 'scale', label: '缩放衰减', type: 'number', def: 0 }, { key: 'seed', label: '种子', type: 'number', def: 3 }],
      eval(ctx) {
        const g = ctx.in(0);
        if (!g) return null;
        const n = Math.max(1, Math.round(ctx.p('copies')));
        const mode = ctx.p('mode');
        const dist = ctx.p('dist');
        const out = [];
        const rng = new U.RNG(Math.round(ctx.p('seed')));
        for (let i = 0; i < n; i++) {
          let x = 0, y = 0, rot = 0, sc = 1;
          if (mode === '直线') { x = (i - (n - 1) / 2) * dist; rot = ctx.p('angle'); }
          else if (mode === '圆环') { const a = i / n * Math.PI * 2; x = Math.cos(a) * dist; y = Math.sin(a) * dist; rot = a * 180 / Math.PI + 90; }
          else if (mode === '网格') { const side = Math.ceil(Math.sqrt(n)); x = (i % side - (side - 1) / 2) * dist; y = (Math.floor(i / side) - (side - 1) / 2) * dist; }
          else { x = rng.range(-dist, dist); y = rng.range(-dist, dist); rot = rng.range(0, 360); }
          sc = 1 - ctx.p('scale') / 100 * (i / Math.max(n - 1, 1));
          const m = U.M4.mul(U.M4.translation(x, y, 0), U.M4.mul(U.M4.rotZ(rot * Math.PI / 180), U.M4.scale(sc, sc, sc)));
          out.push(transformGeo(cloneGeo(g), m));
        }
        if (g.kind === 'mesh') return geoMesh(GEO.mergeMesh(out.map(geoToMesh)));
        // 路径合并
        const path = { contours: [] };
        for (const o of out) path.contours.push(...o.path.contours);
        return geoPaths(path);
      }
    },
    noise: {
      label: '噪声变形', cat: '处理', color: '#b08a4a',
      inputs: [{ name: '几何', type: 'geometry' }], outputs: [{ name: '几何', type: 'geometry' }],
      params: [{ key: 'amount', label: '强度', type: 'number', def: 20 }, { key: 'freq', label: '频率', type: 'number', def: 2 }, { key: 'seed', label: '种子', type: 'number', def: 1 }],
      eval(ctx) {
        const g = ctx.in(0);
        if (!g) return null;
        const amt = ctx.p('amount'), fr = ctx.p('freq') / 100, seed = ctx.p('seed');
        const fn = (p) => {
          const n = FIELDS.fbm(p[0] * fr + seed, p[1] * fr, p[2] * fr + ctx.time * 0.5);
          const n2 = FIELDS.fbm(p[0] * fr + seed + 5, p[1] * fr + 2, p[2] * fr);
          return [n * amt, n2 * amt, 0];
        };
        if (g.kind === 'mesh') return geoMesh(GEO.deformMesh(g.mesh, { fieldFn: fn }));
        const path = { contours: [] };
        for (const c of g.path.contours) {
          const flat = PT.flattenContour(c, 0.6);
          const pts = flat.map(p => { const d = fn([p[0], p[1], 0]); return [p[0] + d[0], p[1] + d[1]]; });
          path.contours.push(PT.smoothToContour(pts, c.closed, 0.6, 1));
        }
        return geoPaths(path);
      }
    },
    field: {
      label: '场变形', cat: '处理', color: '#b08a4a',
      inputs: [{ name: '几何', type: 'geometry' }, { name: '场', type: 'field' }], outputs: [{ name: '几何', type: 'geometry' }],
      params: [{ key: 'amount', label: '强度', type: 'number', def: 60 }],
      eval(ctx) {
        const g = ctx.in(0);
        if (!g) return null;
        const f = ctx.in(1);
        const amt = ctx.p('amount');
        const fn = (p) => {
          if (!f) return [0, 0, 0];
          const r = FIELDS.evalField(f, p, ctx.time);
          return [r.dir[0] * r.amount * amt, r.dir[1] * r.amount * amt, r.dir[2] * r.amount * amt];
        };
        if (g.kind === 'mesh') return geoMesh(GEO.deformMesh(g.mesh, { fieldFn: fn }));
        const path = { contours: [] };
        for (const c of g.path.contours) {
          const flat = PT.flattenContour(c, 0.6);
          const pts = flat.map(p => { const d = fn([p[0], p[1], 0]); return [p[0] + d[0], p[1] + d[1]]; });
          path.contours.push(PT.smoothToContour(pts, c.closed, 0.6, 1));
        }
        return geoPaths(path);
      }
    },
    fieldOut: {
      label: '空间场', cat: '输入', color: '#5b8fd6',
      inputs: [], outputs: [{ name: '场', type: 'field' }],
      params: [{ key: 'layerId', label: '场图层', type: 'layer' }],
      eval(ctx) {
        const layer = ctx.comp.layers.find(l => l.id === ctx.p('layerId'));
        if (!layer || layer.type !== 'field') return null;
        return FIELDS.fieldFromLayer(ctx.state, layer, ctx.time);
      }
    },
    triangulate: {
      label: '三角化', cat: '几何', color: '#8a6ab0',
      inputs: [{ name: '路径', type: 'geometry' }], outputs: [{ name: '网格', type: 'mesh' }],
      params: [],
      eval(ctx) { const g = ctx.in(0); const m = geoToMesh(g); return m ? geoMesh(m) : null; }
    },
    extrude: {
      label: '挤出', cat: '几何', color: '#8a6ab0',
      inputs: [{ name: '路径', type: 'geometry' }], outputs: [{ name: '网格', type: 'mesh' }],
      params: [{ key: 'depth', label: '深度', type: 'number', def: 40 }, { key: 'bevel', label: '倒角', type: 'number', def: 4 }, { key: 'segs', label: '倒角分段', type: 'number', def: 2 }],
      eval(ctx) {
        const g = ctx.in(0);
        if (!g) return null;
        const path = geoToPaths(g);
        if (path) return geoMesh(GEO.extrudePaths(path, { depth: ctx.p('depth'), bevel: ctx.p('bevel'), bevelSegments: ctx.p('segs') }));
        const m = geoToMesh(g);
        return m ? geoMesh(m) : null;
      }
    },
    bend: {
      label: '弯曲', cat: '几何', color: '#8a6ab0',
      inputs: [{ name: '网格', type: 'mesh' }], outputs: [{ name: '网格', type: 'mesh' }],
      params: [{ key: 'angle', label: '角度', type: 'number', def: 45 }, { key: 'axis', label: '轴', type: 'select', options: ['X', 'Y', 'Z'], def: 'Y' }],
      eval(ctx) { const g = ctx.in(0); const m = geoToMesh(g); return m ? geoMesh(GEO.deformMesh(m, { bend: ctx.p('angle') * Math.PI / 180 })) : null; }
    },
    twist: {
      label: '扭转', cat: '几何', color: '#8a6ab0',
      inputs: [{ name: '网格', type: 'mesh' }], outputs: [{ name: '网格', type: 'mesh' }],
      params: [{ key: 'angle', label: '角度', type: 'number', def: 90 }],
      eval(ctx) { const g = ctx.in(0); const m = geoToMesh(g); return m ? geoMesh(GEO.deformMesh(m, { twist: ctx.p('angle') * Math.PI / 180 })) : null; }
    },
    merge: {
      label: '合并', cat: '几何', color: '#8a6ab0',
      inputs: [{ name: 'A', type: 'geometry' }, { name: 'B', type: 'geometry' }], outputs: [{ name: '网格', type: 'mesh' }],
      params: [],
      eval(ctx) {
        const a = geoToMesh(ctx.in(0)), b = geoToMesh(ctx.in(1));
        if (a && b) return geoMesh(GEO.mergeMesh([a, b]));
        return a ? geoMesh(a) : (b ? geoMesh(b) : null);
      }
    },
    box: {
      label: '立方体', cat: '生成', color: '#6a9e6a',
      inputs: [], outputs: [{ name: '网格', type: 'mesh' }],
      params: [{ key: 'w', label: '宽', type: 'number', def: 120 }, { key: 'h', label: '高', type: 'number', def: 80 }, { key: 'd', label: '深', type: 'number', def: 80 }],
      eval(ctx) { return geoMesh(GEO.boxMesh(ctx.p('w'), ctx.p('h'), ctx.p('d'))); }
    },
    cylinder: {
      label: '圆柱', cat: '生成', color: '#6a9e6a',
      inputs: [], outputs: [{ name: '网格', type: 'mesh' }],
      params: [{ key: 'r', label: '半径', type: 'number', def: 30 }, { key: 'h', label: '高', type: 'number', def: 160 }, { key: 'seg', label: '分段', type: 'number', def: 24 }],
      eval(ctx) { return geoMesh(GEO.cylinderMesh(ctx.p('r'), ctx.p('h'), Math.max(3, Math.round(ctx.p('seg'))))); }
    },
    sphere: {
      label: '球体', cat: '生成', color: '#6a9e6a',
      inputs: [], outputs: [{ name: '网格', type: 'mesh' }],
      params: [{ key: 'r', label: '半径', type: 'number', def: 60 }],
      eval(ctx) { return geoMesh(GEO.sphereMesh(ctx.p('r'))); }
    },
    output: {
      label: '输出', cat: '输出', color: '#c95f5f',
      inputs: [{ name: '几何', type: 'geometry' }], outputs: [],
      params: [],
      eval(ctx) { return ctx.in(0); }
    }
  };

  /* ---------------- 图层几何 ---------------- */
  function layerGeometry(comp, layer, state, t) {
    if (!layer) return null;
    if (layer.type === 'text') {
      const style = {
        fontFamily: layer.text.fontFamily, fontSize: state.getProp(layer, ['text', 'fontSize'], t),
        lineHeight: state.getProp(layer, ['text', 'lineHeight'], t), tracking: state.getProp(layer, ['text', 'tracking'], t),
        align: layer.text.align
      };
      const tp = FONT.textToPath(state.getProp(layer, ['text', 'content'], t), style);
      return geoPaths(tp.path);
    }
    if (layer.type === 'shape' && R2) {
      const paths = R2.shapeLayerPaths(comp, layer, state, t);
      if (!paths) return null;
      return geoPaths({ contours: paths });
    }
    if (layer.type === 'solid' && layer.solid) {
      const mesh = solidMesh(comp, layer, state, t);
      return mesh ? geoMesh(mesh) : null;
    }
    return null;
  }

  // 三维实体图层的网格
  const solidCache = new Map();
  function solidMesh(comp, layer, state, t) {
    const s = layer.solid;
    let mesh = null;
    if (s.geometry === 'box') {
      mesh = GEO.boxMesh(state.getProp(layer, ['solid', 'width'], t), state.getProp(layer, ['solid', 'height'], t), state.getProp(layer, ['solid', 'depth'], t));
    } else if (s.geometry === 'cylinder') {
      mesh = GEO.cylinderMesh(state.getProp(layer, ['solid', 'width'], t) / 2, state.getProp(layer, ['solid', 'depth'], t), 32);
    } else if (s.geometry === 'sphere') {
      mesh = GEO.sphereMesh(state.getProp(layer, ['solid', 'width'], t) / 2, 32, 20);
    } else if (s.geometry === 'glyph') {
      const src = comp.layers.find(l => l.id === s.textSource);
      if (src && src.type === 'text') {
        const style = {
          fontFamily: src.text.fontFamily, fontSize: state.getProp(src, ['text', 'fontSize'], t),
          lineHeight: state.getProp(src, ['text', 'lineHeight'], t), tracking: state.getProp(src, ['text', 'tracking'], t),
          align: src.text.align
        };
        const txt = state.getProp(src, ['text', 'content'], t);
        const depth = state.getProp(layer, ['solid', 'depth'], t);
        const bevel = state.getProp(layer, ['solid', 'bevel'], t);
        const segs = state.getProp(layer, ['solid', 'bevelSegments'], t);
        mesh = GEO.textMesh(txt, style, depth, bevel, segs, true);
      }
    } else if (s.geometry === 'node' && s.nodeSource) {
      const g = evalOutput(comp, s.nodeSource, state, t);
      mesh = geoToMesh(g);
    } else if (s.geometry === 'path' && s.meshPath && s.meshPath.v) {
      mesh = GEO.extrudePaths(s.meshPath.v, {
        depth: state.getProp(layer, ['solid', 'depth'], t), bevel: state.getProp(layer, ['solid', 'bevel'], t), bevelSegments: 2
      });
    }
    if (!mesh) return null;
    // 变形：弯曲/扭转/场
    const bend = state.getProp(layer, ['solid', 'bend'], t) * Math.PI / 180;
    const twist = state.getProp(layer, ['solid', 'twist'], t) * Math.PI / 180;
    let fieldFn = null;
    const fids = (s.fieldIds || []).map(id => comp.layers.find(l => l.id === id)).filter(l => l && l.type === 'field');
    if (fids.length) {
      const fs = fids.map(l => FIELDS.fieldFromLayer(state, l, t));
      fieldFn = (p) => FIELDS.evalFields(fs, p, t);
    }
    let pins = null;
    if (s.pins && s.pins.length) {
      pins = s.pins.map(pin => ({
        pos: state.getProp(pin, ['position'], t) || [0, 0, 0],
        orig: pin.orig || [0, 0, 0],
        rotation: state.getProp(pin, ['rotation'], t),
        scale: state.getProp(pin, ['scale'], t),
        enabled: pin.enabled !== false
      }));
    }
    if (Math.abs(bend) > 1e-4 || Math.abs(twist) > 1e-4 || fieldFn || pins) {
      mesh = GEO.deformMesh(mesh, { bend, twist, fieldFn, pins });
    }
    return mesh;
  }

  /* ---------------- 节点求值 ---------------- */
  function makeCtx(comp, node, state, time, cache) {
    const def = DEFS[node.type];
    const ctx = {
      comp, node, state, time, def,
      p(k) {
        if (node.params && node.params[k] !== undefined) return node.params[k];
        const pd = def.params.find(x => x.key === k);
        return pd ? pd.def : undefined;
      },
      in(i) {
        const link = comp.nodes.links.find(l => l.to === node.id && l.toPort === i);
        if (link) {
          const src = comp.nodes.nodes.find(n => n.id === link.from);
          if (!src) return null;
          const ck = src.id + ':' + link.fromPort;
          if (cache.has(ck)) return cache.get(ck);
          const v = evalNodeOutput(comp, src, link.fromPort, state, time, cache);
          cache.set(ck, v);
          return v;
        }
        return null;
      }
    };
    return ctx;
  }
  function evalNodeOutput(comp, node, port, state, time, cache) {
    cache = cache || new Map();
    const def = DEFS[node.type];
    if (!def) return null;
    if (node.type === 'output') {
      const ctx = makeCtx(comp, node, state, time, cache);
      return def.eval(ctx);
    }
    const ctx = makeCtx(comp, node, state, time, cache);
    try { return def.eval(ctx); } catch (e) { console.warn('节点求值失败', node.type, e); return null; }
  }
  function evalOutput(comp, nodeId, state, time) {
    const node = comp.nodes.nodes.find(n => n.id === nodeId);
    if (!node) return null;
    const cache = new Map();
    return evalNodeOutput(comp, node, 0, state, time, cache);
  }
  // 找到组内输出节点
  function findOutput(comp) {
    return comp.nodes.nodes.find(n => n.type === 'output');
  }

  function createNode(type, x, y) {
    const def = DEFS[type];
    if (!def) return null;
    const node = { id: MODEL.uid('n'), type, x: x || 0, y: y || 0, params: {} };
    for (const p of def.params) {
      if (p.type === 'select') node.params[p.key] = p.def;
      else if (p.type === 'string') node.params[p.key] = p.def;
      else node.params[p.key] = p.def;
    }
    return node;
  }

  global.NODES = {
    DEFS, PORT_COLOR, createNode, evalNodeOutput, evalOutput, findOutput,
    layerGeometry, solidMesh, geoPaths, geoMesh, geoToMesh, geoToPaths, transformGeo, geoBBox, cloneGeo
  };
})(window);
