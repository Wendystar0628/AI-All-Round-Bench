/* ============================================================
   nodes.js — 程序化节点：类型端口 / 连线 / 求值
   节点图挂在图层上（layer.nodes），输出几何供形状层使用
   ============================================================ */
(function (global) {
  const AE = global.AE = global.AE || {};
  const U = AE.util;
  const N = AE.nodes = {};

  const P_SCALAR = 'scalar', P_VECTOR = 'vector', P_COLOR = 'color',
    P_PATH = 'path', P_MESH = 'mesh', P_FIELD = 'field';

  N.PORT_TYPES = {
    scalar: { color: '#5fd08a', label: '标量' },
    vector: { color: '#4ea8de', label: '向量' },
    color: { color: '#a98bff', label: '颜色' },
    path: { color: '#e0b341', label: '路径' },
    mesh: { color: '#e0b341', label: '实体' },
    field: { color: '#43c8c0', label: '场' }
  };

  N.DEFS = {
    /* --- 输入 --- */
    pathInput: {
      label: '路径输入', cat: '输入', out: { type: P_PATH },
      params: [{ key: 'layer', label: '来源图层', type: 'text', def: '' }]
    },
    textInput: {
      label: '文字输入', cat: '输入', out: { type: P_PATH },
      params: [{ key: 'layer', label: '来源图层', type: 'text', def: '' }]
    },
    solidInput: {
      label: '实体输入', cat: '输入', out: { type: P_MESH },
      params: [{ key: 'layer', label: '来源图层', type: 'text', def: '' }]
    },
    /* --- 生成 --- */
    rect: {
      label: '矩形', cat: '生成', out: { type: P_PATH },
      params: [
        { key: 'w', label: '宽', type: 'num', def: 300 },
        { key: 'h', label: '高', type: 'num', def: 200 },
        { key: 'r', label: '圆角', type: 'num', def: 0 }
      ]
    },
    ellipse: {
      label: '椭圆', cat: '生成', out: { type: P_PATH },
      params: [
        { key: 'rx', label: '横半径', type: 'num', def: 150 },
        { key: 'ry', label: '纵半径', type: 'num', def: 150 }
      ]
    },
    polygon: {
      label: '多边形', cat: '生成', out: { type: P_PATH },
      params: [
        { key: 'sides', label: '边数', type: 'num', def: 6 },
        { key: 'r', label: '半径', type: 'num', def: 150 }
      ]
    },
    spiral: {
      label: '螺旋线', cat: '生成', out: { type: P_PATH },
      params: [
        { key: 'turns', label: '圈数', type: 'num', def: 3 },
        { key: 'r', label: '半径', type: 'num', def: 180 },
        { key: 'step', label: '螺距', type: 'num', def: 40 },
        { key: 'width', label: '线宽', type: 'num', def: 10 }
      ]
    },
    grid: {
      label: '网格点', cat: '生成', out: { type: P_PATH },
      params: [
        { key: 'cols', label: '列', type: 'num', def: 6 },
        { key: 'rows', label: '行', type: 'num', def: 6 },
        { key: 'step', label: '间距', type: 'num', def: 60 },
        { key: 'r', label: '半径', type: 'num', def: 8 }
      ]
    },
    line: {
      label: '直线', cat: '生成', out: { type: P_PATH },
      params: [
        { key: 'x1', label: '起点X', type: 'num', def: -200 },
        { key: 'y1', label: '起点Y', type: 'num', def: 0 },
        { key: 'x2', label: '终点X', type: 'num', def: 200 },
        { key: 'y2', label: '终点Y', type: 'num', def: 0 }
      ]
    },
    /* --- 变换 --- */
    transform: {
      label: '变换', cat: '变换', in: [{ name: '几何', type: P_PATH }],
      out: { type: P_PATH },
      params: [
        { key: 'tx', label: '平移X', type: 'num', def: 0 },
        { key: 'ty', label: '平移Y', type: 'num', def: 0 },
        { key: 'rot', label: '旋转', type: 'num', def: 0 },
        { key: 'sx', label: '缩放X', type: 'num', def: 100 },
        { key: 'sy', label: '缩放Y', type: 'num', def: 100 }
      ]
    },
    mirror: {
      label: '镜像', cat: '变换', in: [{ name: '几何', type: P_PATH }],
      out: { type: P_PATH },
      params: [
        { key: 'axis', label: '轴', type: 'select', def: 'x', options: [['x', 'X 轴'], ['y', 'Y 轴']] },
        { key: 'offset', label: '偏移', type: 'num', def: 0 }
      ]
    },
    /* --- 形状操作 --- */
    trim: {
      label: '修剪路径', cat: '形状', in: [{ name: '几何', type: P_PATH }],
      out: { type: P_PATH },
      params: [
        { key: 'start', label: '起点', type: 'num', def: 0 },
        { key: 'end', label: '终点', type: 'num', def: 100 }
      ]
    },
    repeat: {
      label: '重复器', cat: '形状', in: [{ name: '几何', type: P_PATH }],
      out: { type: P_PATH },
      params: [
        { key: 'count', label: '份数', type: 'num', def: 3 },
        { key: 'dx', label: '偏移X', type: 'num', def: 120 },
        { key: 'dy', label: '偏移Y', type: 'num', def: 0 },
        { key: 'rot', label: '旋转', type: 'num', def: 0 }
      ]
    },
    boolean: {
      label: '布尔运算', cat: '形状',
      in: [{ name: 'A', type: P_PATH }, { name: 'B', type: P_PATH }],
      out: { type: P_PATH },
      params: [{ key: 'op', label: '方式', type: 'select', def: 'union', options: [['union', '并集'], ['subtract', '差集'], ['intersect', '交集'], ['xor', '异或']] }]
    },
    morph: {
      label: '路径形变', cat: '形状',
      in: [{ name: 'A', type: P_PATH }, { name: 'B', type: P_PATH }],
      out: { type: P_PATH },
      params: [{ key: 't', label: '进度', type: 'num', def: 50 }]
    },
    /* --- 场 --- */
    noiseField: {
      label: '噪声场', cat: '场', out: { type: P_FIELD },
      params: [
        { key: 'strength', label: '强度', type: 'num', def: 60 },
        { key: 'radius', label: '半径', type: 'num', def: 600 },
        { key: 'seed', label: '种子', type: 'num', def: 3 }
      ]
    },
    vortexField: {
      label: '旋涡场', cat: '场', out: { type: P_FIELD },
      params: [
        { key: 'strength', label: '强度', type: 'num', def: 80 },
        { key: 'radius', label: '半径', type: 'num', def: 600 }
      ]
    },
    distanceField: {
      label: '距离场', cat: '场', out: { type: P_FIELD },
      params: [
        { key: 'strength', label: '强度', type: 'num', def: 100 },
        { key: 'radius', label: '半径', type: 'num', def: 500 }
      ]
    },
    /* --- 三维变形 --- */
    pin: {
      label: '图钉变形', cat: '变形', in: [{ name: '实体', type: P_MESH }],
      out: { type: P_MESH },
      params: [
        { key: 'x', label: 'X', type: 'num', def: 0 },
        { key: 'y', label: 'Y', type: 'num', def: 0 },
        { key: 'rot', label: '旋转', type: 'num', def: 0 },
        { key: 'scale', label: '缩放', type: 'num', def: 100 },
        { key: 'falloff', label: '影响', type: 'num', def: 200 }
      ]
    },
    twist: {
      label: '扭转', cat: '变形', in: [{ name: '实体', type: P_MESH }],
      out: { type: P_MESH },
      params: [{ key: 'amount', label: '角度', type: 'num', def: 45 }]
    },
    bend: {
      label: '弯曲', cat: '变形', in: [{ name: '实体', type: P_MESH }],
      out: { type: P_MESH },
      params: [{ key: 'amount', label: '幅度', type: 'num', def: 30 }]
    },
    extrude: {
      label: '挤出', cat: '三维', in: [{ name: '路径', type: P_PATH }],
      out: { type: P_MESH },
      params: [
        { key: 'depth', label: '深度', type: 'num', def: 80 },
        { key: 'bevel', label: '倒角', type: 'num', def: 4 }
      ]
    },
    output: {
      label: '输出', cat: '输出', in: [{ name: '几何', type: P_PATH }],
      out: null
    }
  };

  N.create = function (type, x, y) {
    const def = N.DEFS[type];
    if (!def) throw new Error('未知节点类型: ' + type);
    const node = { id: U.uid('node'), type, x: x || 0, y: y || 0, params: {} };
    for (const p of (def.params || [])) node.params[p.key] = p.def;
    return node;
  };

  N.createGraph = function () {
    return { nodes: [], edges: [], output: null };
  };

  /** 连线合法性检查 */
  N.canConnect = function (graph, fromId, fromPort, toId, toPort) {
    const from = graph.nodes.find(n => n.id === fromId);
    const to = graph.nodes.find(n => n.id === toId);
    if (!from || !to || fromId === toId) return false;
    const fdef = N.DEFS[from.type], tdef = N.DEFS[to.type];
    if (!fdef.out) return false;
    const tIn = (tdef.in || []).find(p => p.name === toPort);
    if (!tIn) return false;
    if (tIn.type !== fdef.out.type && !(tIn.type === P_PATH && fdef.out.type === P_MESH)) return false;
    // 环检测
    const seen = new Set();
    const stack = [toId];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      if (id === fromId) return false;
      for (const e of graph.edges) {
        if (e.from === id) stack.push(e.to);
      }
    }
    return true;
  };

  N.connect = function (graph, fromId, toId, toPort) {
    graph.edges = graph.edges.filter(e => !(e.to === toId && e.toPort === toPort));
    graph.edges.push({ id: U.uid('edge'), from: fromId, fromPort: 'out', to: toId, toPort });
    return true;
  };

  N.disconnect = function (graph, edgeId) {
    graph.edges = graph.edges.filter(e => e.id !== edgeId);
  };

  /** 拓扑排序 */
  N.order = function (graph) {
    const nodes = graph.nodes;
    const incoming = new Map(nodes.map(n => [n.id, []]));
    for (const e of graph.edges) {
      if (incoming.has(e.to)) incoming.get(e.to).push(e.from);
    }
    const out = [], visited = new Set(), temp = new Set();
    const visit = id => {
      if (visited.has(id) || temp.has(id)) return;
      temp.add(id);
      for (const s of incoming.get(id) || []) visit(s);
      temp.delete(id);
      visited.add(id);
      const n = nodes.find(x => x.id === id);
      if (n) out.push(n);
    };
    for (const n of nodes) visit(n.id);
    return out;
  };

  /**
   * 求值节点图
   * ctx: { getLayer(name), time }
   * 返回 { contours, mesh, field }
   */
  N.evaluate = function (graph, ctx) {
    const results = new Map();
    const order = N.order(graph);
    const inputsOf = node => {
      const map = {};
      for (const e of graph.edges) {
        if (e.to === node.id) map[e.toPort] = results.get(e.from);
      }
      return map;
    };
    for (const node of order) {
      const def = N.DEFS[node.type];
      const p = node.params || {};
      const ins = inputsOf(node);
      let out = null;
      switch (node.type) {
        case 'rect':
          out = [{ pts: AE.path.flatten(AE.path.rect(-p.w / 2, -p.h / 2, p.w, p.h, p.r), 0.5), hole: false }];
          break;
        case 'ellipse':
          out = [{ pts: AE.path.flatten(AE.path.ellipse(0, 0, p.rx, p.ry), 0.5), hole: false }];
          break;
        case 'polygon':
          out = [{ pts: AE.path.flatten(AE.path.polygon(0, 0, p.r, Math.max(3, Math.round(p.sides))), 0.5), hole: false }];
          break;
        case 'spiral': {
          const pts = [];
          const turns = p.turns, r0 = p.r, st = p.step;
          const n = Math.max(8, Math.round(turns * 32));
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            const a = t * turns * Math.PI * 2;
            const rr = r0 * (1 - t) + st * t * turns;
            pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
          }
          out = [{ pts, hole: false }];
          break;
        }
        case 'grid': {
          const cs = [], rs = Math.max(1, Math.round(p.cols)), rw = Math.max(1, Math.round(p.rows));
          for (let j = 0; j < rw; j++) for (let i = 0; i < rs; i++) {
            const cx = (i - (rs - 1) / 2) * p.step, cy = (j - (rw - 1) / 2) * p.step;
            cs.push({ pts: AE.path.flatten(AE.path.ellipse(cx, cy, p.r, p.r), 0.5), hole: false });
          }
          out = cs;
          break;
        }
        case 'line':
          out = [{ pts: [[p.x1, p.y1], [p.x2, p.y2]], hole: false }];
          break;
        case 'transform': {
          const src = ins['几何'] || [];
          const m = U.mat4.fromTRS([p.tx, p.ty, 0], [0, 0, U.rad(p.rot)], [p.sx / 100, p.sy / 100, 1]);
          out = src.map(c => ({ pts: c.pts.map(q => {
            const v = U.mat4.xformPoint(m, [q[0], q[1]]);
            return [v[0], v[1]];
          }), hole: c.hole }));
          break;
        }
        case 'mirror': {
          const src = ins['几何'] || [];
          out = src.map(c => ({
            pts: c.pts.map(q => p.axis === 'x' ? [2 * p.offset - q[0], q[1]] : [q[0], 2 * p.offset - q[1]]),
            hole: c.hole
          }));
          break;
        }
        case 'trim': {
          const src = ins['几何'] || [];
          out = src.map(c => {
            const path = AE.path.polyline(c.pts, false);
            const t = AE.path.trim(path, p.start / 100, p.end / 100, 0);
            return { pts: AE.path.flatten(t, 0.5), hole: c.hole };
          });
          break;
        }
        case 'repeat': {
          const src = ins['几何'] || [];
          const cnt = Math.max(1, Math.round(p.count));
          out = [];
          for (let i = 0; i < cnt; i++) {
            const ang = U.rad(p.rot * i), c = Math.cos(ang), s = Math.sin(ang);
            for (const cc of src) {
              out.push({
                pts: cc.pts.map(q => {
                  const x = q[0], y = q[1];
                  return [x * c - y * s + p.dx * i, x * s + y * c + p.dy * i];
                }), hole: cc.hole
              });
            }
          }
          break;
        }
        case 'boolean': {
          const A = ins['A'] || [], B = ins['B'] || [];
          const fa = A.reduce((acc, c) => acc.concat(c.pts), []);
          const fb = B.reduce((acc, c) => acc.concat(c.pts), []);
          const res = AE.path.boolean([{ pts: fa, hole: false }], [{ pts: fb, hole: false }], p.op, 360);
          out = res.map(c => ({ pts: c, hole: false }));
          break;
        }
        case 'morph': {
          const A = ins['A'] || [], B = ins['B'] || [];
          const t = U.clamp(p.t / 100, 0, 1);
          out = AE.path.morph(A.map(c => ({ pts: c.pts })), B.map(c => ({ pts: c.pts })), t)
            .map(c => ({ pts: c.pts, hole: false }));
          break;
        }
        case 'noiseField':
        case 'vortexField':
        case 'distanceField': {
          const f = AE.fields.create(node.type === 'noiseField' ? 'noise' : node.type === 'vortexField' ? 'vortex' : 'distance', def.label);
          f.props.strength = { v: p.strength, tr: null, ex: null };
          f.props.radius = { v: p.radius, tr: null, ex: null };
          f.props.seed = { v: p.seed || 1, tr: null, ex: null };
          f.props.position = { v: [0, 0, 0], tr: null, ex: null };
          out = f;
          break;
        }
        case 'pin':
        case 'twist':
        case 'bend': {
          const src = ins['实体'];
          if (src && src.positions) {
            const mesh = JSON.parse(JSON.stringify(src));
            const opts = node.type === 'pin'
              ? { pins: [{ x: p.x, y: p.y, z: 0, rot: p.rot, scale: p.scale / 100, falloff: p.falloff }] }
              : node.type === 'twist' ? { twist: p.amount } : { bend: p.amount };
            AE.geom.deform(mesh, opts);
            out = mesh;
          } else out = null;
          break;
        }
        case 'extrude': {
          const src = ins['路径'] || [];
          if (src.length) {
            const mesh = AE.geom.extrude(src.map(c => ({ pts: c.pts, hole: c.hole })), { depth: p.depth, bevel: p.bevel });
            out = mesh;
          } else out = null;
          break;
        }
        case 'pathInput': {
          const ly = ctx.getLayer ? ctx.getLayer(p.layer) : null;
          if (ly && ly.shape) {
            const cs = [];
            for (const g of ly.shape.groups) for (const pi of g.paths) {
              cs.push({ pts: AE.path.flatten(pi.path, 0.5), hole: false });
            }
            out = cs;
          } else out = [];
          break;
        }
        case 'textInput': {
          const ly = ctx.getLayer ? ctx.getLayer(p.layer) : null;
          if (ly && ly.text) {
            const size = 120;
            const lay = AE.text.layout({
              text: ly.text.content, size, leading: 1.25, tracking: 0, align: 'center',
              family: ly.props.fontFamily ? ly.props.fontFamily.v : undefined,
              weight: ly.props.fontWeight ? ly.props.fontWeight.v : undefined
            });
            const cs = [];
            for (const line of lay.lines) for (const c of line.chars) {
              if (!c.ch.trim()) continue;
              for (const ct of c.contours) if (!ct.hole) cs.push({ pts: ct.pts.map(q => [q[0] * size + c.x, q[1] * size + c.y]), hole: false });
            }
            out = cs;
          } else out = [];
          break;
        }
        case 'solidInput': {
          const ly = ctx.getLayer ? ctx.getLayer(p.layer) : null;
          out = ly && ly._meshCache ? JSON.parse(JSON.stringify(ly._meshCache.mesh)) : null;
          break;
        }
        case 'output':
          out = ins['几何'] || null;
          break;
      }
      results.set(node.id, out);
      if (node.type === 'output') graph.output = node.id;
    }
    // 汇总
    let contours = [], mesh = null, field = null;
    for (const node of order) {
      const v = results.get(node.id);
      if (!v) continue;
      if (Array.isArray(v) && v.length && v[0] && v[0].pts) contours = v;
      else if (v && v.positions) mesh = v;
      else if (v && v.props) field = v;
    }
    const outNode = graph.nodes.find(n => n.type === 'output');
    if (outNode) {
      const v = results.get(outNode.id);
      if (Array.isArray(v) && v.length && v[0] && v[0].pts) { contours = v; mesh = null; }
      else if (v && v.positions) { mesh = v; contours = []; }
    }
    return { contours, mesh, field, results };
  };
})(window);
