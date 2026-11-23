/* ============================================================
 * nodes.js — 程序节点图
 * 节点以路径、文字或实体几何为输入，生成/分布/变换/处理几何。
 * 端口类型：scalar / vector / color / geometry / field。
 * 一个几何输出可同时被显示、变形、发射、碰撞多个使用者复用。
 * ============================================================ */
(function (global) {
'use strict';

const PORT_TYPES = {
  scalar: { name: '标量', color: '#7fc88b' },
  vector: { name: '向量', color: '#5b9dd9' },
  color: { name: '颜色', color: '#e3c269' },
  geometry: { name: '几何', color: '#f2994a' },
  field: { name: '场', color: '#b48fd9' }
};

const NODE_DEFS = {
  geoText: { name: '文字几何', category: '输入',
    inputs: [{ id: 'text', name: '文本', type: 'scalar' }],
    outputs: [{ id: 'out', name: '几何', type: 'geometry' }],
    params: { text: '铁', fontSize: 300 } },
  geoShape: { name: '形状几何', category: '输入',
    inputs: [], outputs: [{ id: 'out', name: '几何', type: 'geometry' }],
    params: { shape: 'rect', w: 240, h: 240, sides: 6, r: 100 } },
  geoLayer: { name: '图层路径', category: '输入',
    inputs: [], outputs: [{ id: 'out', name: '几何', type: 'geometry' }],
    params: { layerId: '' } },
  transform: { name: '变换', category: '处理',
    inputs: [{ id: 'in', name: '输入', type: 'geometry' },
             { id: 'pos', name: '位移', type: 'vector' },
             { id: 'scale', name: '缩放%', type: 'vector' },
             { id: 'rot', name: '旋转', type: 'scalar' }],
    outputs: [{ id: 'out', name: '几何', type: 'geometry' }],
    params: { pos: [0, 0], scale: [100, 100], rot: 0 } },
  scatter: { name: '环形分布', category: '生成',
    inputs: [{ id: 'in', name: '输入', type: 'geometry' }, { id: 'count', name: '数量', type: 'scalar' }],
    outputs: [{ id: 'out', name: '几何', type: 'geometry' }],
    params: { count: 8, radius: 320, startAngle: 0, scaleStep: 90, rotStep: 0 } },
  grid: { name: '网格分布', category: '生成',
    inputs: [{ id: 'in', name: '输入', type: 'geometry' }],
    outputs: [{ id: 'out', name: '几何', type: 'geometry' }],
    params: { nx: 5, ny: 5, gapX: 300, gapY: 300 } },
  boolean: { name: '布尔运算', category: '处理',
    inputs: [{ id: 'a', name: 'A', type: 'geometry' }, { id: 'b', name: 'B', type: 'geometry' }],
    outputs: [{ id: 'out', name: '结果', type: 'geometry' }],
    params: { mode: 'union' } },
  extrude: { name: '挤出', category: '实体',
    inputs: [{ id: 'in', name: '轮廓', type: 'geometry' }, { id: 'depth', name: '深度', type: 'scalar' }],
    outputs: [{ id: 'out', name: '实体', type: 'geometry' }],
    params: { depth: 60, bevel: 4, bevelSegs: 3 } },
  fieldNoise: { name: '噪声场', category: '场',
    inputs: [], outputs: [{ id: 'out', name: '场', type: 'field' }],
    params: { radius: 300, strength: 200, frequency: 0.004, timeScale: 1, kind: 'noise' } },
  fieldApply: { name: '应用场变形', category: '变形',
    inputs: [{ id: 'in', name: '几何', type: 'geometry' }, { id: 'field', name: '场', type: 'field' }],
    outputs: [{ id: 'out', name: '几何', type: 'geometry' }],
    params: { amount: 1, zAmount: 30 } },
  merge: { name: '合并几何', category: '处理',
    inputs: [{ id: 'a', name: 'A', type: 'geometry' }, { id: 'b', name: 'B', type: 'geometry' }],
    outputs: [{ id: 'out', name: '几何', type: 'geometry' }],
    params: {} },
  output: { name: '输出到图层', category: '输出',
    inputs: [{ id: 'in', name: '几何', type: 'geometry' }],
    outputs: [], params: { layerId: '' } }
};

function makeNode(defId, x, y) {
  const def = NODE_DEFS[defId];
  const n = {
    id: M.shortId('node'), def: defId, name: def.name,
    x: x || 0, y: y || 0,
    params: M.deepClone(def.params),
    inputs: {}, values: {}, group: null
  };
  for (const p of def.inputs) n.inputs[p.id] = null; // {node, port}
  return n;
}
function makeGraph() { return { nodes: [], edges: [], pan: { x: 30, y: 30 }, zoom: 1 }; }
/* edges: {id, from:{node,port}, to:{node,port}} 与 n.inputs 同步 */
function connect(graph, fromNode, fromPort, toNode, toPort) {
  disconnectInput(graph, toNode, toPort);
  graph.edges.push({ id: M.shortId('e'), from: { node: fromNode, port: fromPort }, to: { node: toNode, port: toPort } });
  const n = graph.nodes.find(n => n.id === toNode);
  if (n) n.inputs[toPort] = { node: fromNode, port: fromPort };
}
function disconnectInput(graph, nodeId, port) {
  const n = graph.nodes.find(n => n.id === nodeId);
  if (n) n.inputs[port] = null;
  for (let i = graph.edges.length - 1; i >= 0; i--)
    if (graph.edges[i].to.node === nodeId && graph.edges[i].to.port === port) graph.edges.splice(i, 1);
}
function removeNode(graph, id) {
  for (let i = graph.edges.length - 1; i >= 0; i--)
    if (graph.edges[i].from.node === id || graph.edges[i].to.node === id) graph.edges.splice(i, 1);
  for (let i = graph.nodes.length - 1; i >= 0; i--)
    if (graph.nodes[i].id === id) graph.nodes.splice(i, 1);
}
function duplicateNode(graph, id, dx, dy) {
  const n = graph.nodes.find(n => n.id === id);
  if (!n) return null;
  const nn = makeNode(n.def, n.x + (dx || 40), n.y + (dy || 40));
  nn.params = M.deepClone(n.params);
  graph.nodes.push(nn);
  return nn;
}

/* ---------------- 求值 ----------------
 * 几何值约定：
 *   plane:  {kind:'plane', paths:[{closed,contours}], lines?}
 *   solid:  {kind:'solid', contours:扁平折线数组, depth, bevel, bevelSegs}
 * 标量参数支持节点输入覆盖。
 * ------------------------------------------------- */
function GraphEval() { this.memo = new Map(); }
GraphEval.prototype.evaluate = function (graph, ctx) {
  this.graph = graph; this.ctx = ctx;
  this.memo.clear();
  const results = new Map();
  for (const n of graph.nodes) results.set(n.id, this.evalNode(n.id, new Set()));
  return results;
};
GraphEval.prototype.evalNode = function (id, stack) {
  if (this.memo.has(id)) return this.memo.get(id);
  if (stack.has(id)) throw new Error('节点图存在循环：' + id);
  stack.add(id);
  const n = this.graph.nodes.find(x => x.id === id);
  if (!n) throw new Error('节点丢失');
  const val = (port) => {
    const link = n.inputs[port];
    if (link) return this.evalNode(link.node, stack)[link.port];
    return undefined;
  };
  let out = {};
  const P = n.params;
  switch (n.def) {
    case 'geoText': {
      const txt = val('text') || P.text;
      const str = typeof txt === 'string' ? txt : P.text;
      const gf = Text2D.glyphFlatContours(str, P.fontSize);
      out.out = { kind: 'plane', paths: [{ closed: true, contours: gf.contours.map(c => ({ closed: true, pts: c })) }], contours: gf.contours };
      break;
    }
    case 'geoShape': {
      let path;
      if (P.shape === 'rect') path = M.rectPath(P.w, P.h, P.r || 0);
      else if (P.shape === 'ellipse') path = M.ellipsePath(P.w, P.h);
      else path = polygonPath(P.sides, P.r);
      const flat = ShapeGeom.flattenPath(path, 0.5);
      out.out = { kind: 'plane', paths: [path], contours: flat.map(c => c.pts) };
      break;
    }
    case 'geoLayer': {
      const g = this.ctx.layerGeometry(P.layerId);
      out.out = g;
      break;
    }
    case 'transform': {
      const g0 = val('in');
      const pos = val('pos') || P.pos;
      const scl = val('scale') || P.scale;
      const rot = (val('rot') !== undefined ? val('rot') : P.rot) * Math.PI / 180;
      if (!g0) { out.out = null; break; }
      out.out = transformGeometry(g0, pos, scl, rot);
      break;
    }
    case 'scatter':
    case 'grid': {
      const g0 = val('in');
      if (!g0) { out.out = null; break; }
      const placements = n.def === 'scatter'
        ? scatterPlacements(val('count') || P.count, P.radius, P.startAngle, P.scaleStep, P.rotStep)
        : gridPlacements(P.nx, P.ny, P.gapX, P.gapY);
      out.out = mergePlacements(g0, placements);
      break;
    }
    case 'boolean': {
      const a = val('a'), b = val('b');
      out.out = { kind: 'boolean', a, b, mode: P.mode };
      break;
    }
    case 'merge': {
      const a = val('a'), b = val('b');
      out.out = mergeGeometries(a, b);
      break;
    }
    case 'extrude': {
      const g0 = val('in');
      const depth = val('depth') !== undefined ? val('depth') : P.depth;
      if (!g0) { out.out = null; break; }
      out.out = { kind: 'solid', contours: geometryContours(g0), depth, bevel: P.bevel, bevelSegs: P.bevelSegs };
      break;
    }
    case 'fieldNoise': {
      out.out = { kind: 'field', def: { kind: P.kind, radius: P.radius, strength: P.strength, frequency: P.frequency, timeScale: P.timeScale, position: [0, 0, 0] } };
      break;
    }
    case 'fieldApply': {
      const g0 = val('in'), f = val('field');
      if (!g0) { out.out = null; break; }
      out.out = applyFieldGeometry(g0, f, P.amount, P.zAmount, this.ctx.time);
      break;
    }
    case 'output': {
      const g = val('in');
      out.in = g;
      this.ctx.emitOutput(P.layerId, g);
      break;
    }
  }
  this.memo.set(id, out);
  stack.delete(id);
  return out;
};

function polygonPath(sides, r) {
  const pts = [], ins = [], outs = [];
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + i / sides * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]); ins.push([0, 0]); outs.push([0, 0]);
  }
  return { closed: true, contours: [{ closed: true, pts, in: ins, out: outs }] };
}
function transformGeometry(g, pos, scl, rot) {
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const xf = p => {
    const x = p[0] * (scl[0] / 100), y = p[1] * (scl[1] / 100);
    return [x * cos - y * sin + (pos[0] || 0), x * sin + y * cos + (pos[1] || 0)];
  };
  const contours = geometryContours(g).map(ring => ring.map(xf));
  return { kind: g.kind === 'solid' ? 'solid' : 'plane', contours,
    paths: [{ closed: true, contours: contours.map(c => ({ closed: true, pts: c })) }],
    depth: g.depth, bevel: g.bevel, bevelSegs: g.bevelSegs, displaced: g.displaced ? g.displaced.map(xf) : null };
}
function geometryContours(g) {
  if (!g) return [];
  if (g.contours) return g.contours;
  const out = [];
  if (g.paths) for (const pth of g.paths) for (const c of pth.contours) out.push(c.pts);
  return out;
}
function scatterPlacements(count, radius, startAngle, scaleStep, rotStep) {
  const ps = [];
  for (let i = 0; i < count; i++) {
    const a = (startAngle - 90 + i / count * 360) * Math.PI / 180;
    ps.push({ pos: [Math.cos(a) * radius, Math.sin(a) * radius], scale: [Math.pow(scaleStep / 100, i), Math.pow(scaleStep / 100, i)], rot: rotStep * i });
  }
  return ps;
}
function gridPlacements(nx, ny, gx, gy) {
  const ps = [];
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++)
    ps.push({ pos: [(x - (nx - 1) / 2) * gx, (y - (ny - 1) / 2) * gy], scale: [1, 1], rot: 0 });
  return ps;
}
function mergePlacements(g, ps) {
  const src = geometryContours(g);
  const contours = [];
  for (const p of ps) {
    const cos = Math.cos(p.rot * Math.PI / 180), sin = Math.sin(p.rot * Math.PI / 180);
    for (const ring of src) contours.push(ring.map(pt => {
      const x = pt[0] * p.scale[0], y = pt[1] * p.scale[1];
      return [x * cos - y * sin + p.pos[0], x * sin + y * cos + p.pos[1]];
    }));
  }
  return { kind: 'plane', contours, paths: [{ closed: true, contours: contours.map(c => ({ closed: true, pts: c })) }] };
}
function mergeGeometries(a, b) {
  const contours = geometryContours(a).concat(geometryContours(b));
  return { kind: 'plane', contours, paths: [{ closed: true, contours: contours.map(c => ({ closed: true, pts: c })) }] };
}
function applyFieldGeometry(g, field, amount, zAmount, time) {
  const contours = geometryContours(g);
  const displaced = [];
  const out = contours.map(ring => ring.map(p => {
    const f = field ? Fields.sampleFieldAt(field.def, p[0], p[1], 0, time) : [0, 0, 0];
    displaced.push([p[0] + f[0] * amount, p[1] + f[1] * amount, (f[2] || 0) * zAmount * amount]);
    return [p[0] + f[0] * amount, p[1] + f[1] * amount];
  }));
  return { kind: g.kind === 'solid' ? 'solid' : 'plane', contours: out,
    paths: [{ closed: true, contours: out.map(c => ({ closed: true, pts: c })) }],
    displaced, depth: g.depth, bevel: g.bevel, bevelSegs: g.bevelSegs };
}

global.NodeGraph = {
  PORT_TYPES, NODE_DEFS, makeNode, makeGraph, connect, disconnectInput, removeNode, duplicateNode,
  GraphEval, geometryContours, transformGeometry
};
})(window);
