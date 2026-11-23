/* 程序节点图：节点类型注册表、按连线求值（带时间缓存）与几何输出。
 * 端口类型：scalar 标量 / vector 向量 / color 颜色 / geometry 几何（轮廓或网格）/ field 场 / pins 图钉 / points 采样点。
 * 参数可以是普通值，也可以是属性对象（可关键帧 / 表达式），后者按所在图层求值。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const U = AE.U;
  const M = U.mat;
  const Model = AE.Model;
  const Anim = AE.Anim;
  const P = AE.Path;
  const Mesh = AE.Mesh;
  const G = (AE.Graph = {});

  G.TYPE_COLOR = { scalar: '#9fd0ff', vector: '#c3a7ff', color: '#ffb36b', geometry: '#7fe0a8', field: '#ff8fb0', pins: '#ffe07a', points: '#8fe9ff' };
  G.TYPE_LABEL = { scalar: '标量', vector: '向量', color: '颜色', geometry: '几何', field: '场', pins: '图钉', points: '采样点' };

  // ---------- 注册表 ----------
  G.types = {};
  G.def = (name, d) => (G.types[name] = Object.assign({ name, label: name, cat: '工具', inputs: [], outputs: [], params: [] }, d));

  // 参数定义：kind 为 num / text / enum / vec / color
  const PN = (name, def, label, extra) => Object.assign({ name, kind: 'num', def, label: label || name }, extra || {});

  // ---------- 工程数据 ----------
  G.newGraph = (name) => ({ id: U.uid('g'), name: name || '节点图', nodes: [] });
  G.newNode = (graph, type, x, y, params) => {
    const def = G.types[type];
    const node = { id: U.uid('n'), type, x: x || 0, y: y || 0, params: {}, ins: {} };
    (def ? def.params : []).forEach((pd) => {
      const v = params && params[pd.name] !== undefined ? params[pd.name] : pd.def;
      node.params[pd.name] = Array.isArray(v) ? v.slice() : v;
    });
    if (graph) graph.nodes.push(node);
    return node;
  };
  G.findGraph = (project, id) => (project.graphs || []).find((g) => g.id === id) || null;
  G.findNode = (graph, id) => (graph ? graph.nodes.find((n) => n.id === id) || null : null);

  // 参数的值（支持属性对象）
  function paramValue(ctx, node, name, t) {
    const v = node.params[name];
    if (v && typeof v === 'object' && v.kind && v.id && 'v' in v) return Anim.value(ctx.comp, ctx.layer || null, v, t);
    return v;
  }

  // ---------- 求值 ----------
  // 结果缓存按（图、节点、时间）；模型版本变化时整体失效
  const cache = new Map();
  let cacheVer = -1;
  function cacheFor(ctx) {
    if (cacheVer !== Model.version) {
      cache.clear();
      cacheVer = Model.version;
    }
    if (cache.size > 6000) cache.clear();
    return cache;
  }

  // 求节点某输出端口的值
  G.output = (ctx, graph, nodeId, t, port, overrides) => {
    const node = G.findNode(graph, nodeId);
    if (!node) return null;
    const key = graph.id + '|' + nodeId + '|' + t.toFixed(5) + '|' + (ctx.salt || '');
    const c = cacheFor(ctx);
    let res;
    if (!overrides && c.has(key)) res = c.get(key);
    else {
      const def = G.types[node.type];
      if (!def) return null;
      const inputs = {};
      // 组节点的输入端口由其 groupIn 定义，其它节点使用类型表中的端口
      G.nodeInputs(node).forEach((pd) => {
        const link = node.ins[pd.name];
        if (overrides && overrides[nodeId + '.' + pd.name] !== undefined) inputs[pd.name] = overrides[nodeId + '.' + pd.name];
        else if (link) inputs[pd.name] = G.output(ctx, graph, link.node, t, link.port, overrides);
        else inputs[pd.name] = null;
      });
      const outs = def.run({ node, inputs, t, ctx, graph, p: (name) => paramValue(ctx, node, name, t), comp: ctx.comp, layer: ctx.layer }, ctx);
      res = outs;
      if (!overrides) c.set(key, res);
    }
    if (port === undefined) return res;
    return res && typeof res === 'object' && !(res.kind === 'mesh' || res.kind === 'contours' || res.kind === 'points') && port in res ? res[port] : res;
  };

  // 组节点：内部图由 inner 描述，输入/输出通过 inner 的端口映射
  // 为简单起见，组节点的 run 通过 overrides 把外部输入注入内部，并返回内部指定输出
  G.def('group', {
    label: '封装组',
    cat: '组',
    inputs: [],
    outputs: [{ name: 'out', type: 'geometry' }],
    params: [],
    run(c, ctx) {
      const node = c.node;
      const inner = node.inner;
      if (!inner) return null;
      const overrides = {};
      (node.groupIn || []).forEach((gi) => {
        const outer = c.inputs[gi.name];
        overrides[gi.to.node + '.' + gi.to.port] = outer;
      });
      const outPort = node.groupOut && node.groupOut[0];
      if (!outPort) return null;
      const sub = { id: inner.id, nodes: inner.nodes };
      return G.output(ctx, sub, outPort.from.node, c.t, outPort.from.port, overrides);
    },
  });
  // 组节点的输入端口由 groupIn 定义（动态），在 types 中不固定
  G.nodeInputs = (node) => {
    if (node.type === 'group') return (node.groupIn || []).map((g) => ({ name: g.name, type: g.type }));
    const def = G.types[node.type];
    return def ? def.inputs : [];
  };
  G.nodeOutputs = (node) => {
    if (node.type === 'group') return (node.groupOut || []).map((g) => ({ name: g.name, type: g.type }));
    const def = G.types[node.type];
    return def ? def.outputs : [];
  };

  // ---------- 几何辅助 ----------
  // 把轮廓列表细分（用于变形时保持形状平滑）
  function resampleContours(contours, maxLen) {
    return contours.map((c) => {
      const pts = [];
      const n = c.pts.length;
      for (let i = 0; i < n; i++) {
        const a = c.pts[i], b = c.pts[(i + 1) % n];
        if (!c.closed && i === n - 1) break;
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const k = Math.max(1, Math.ceil(L / maxLen));
        for (let s = 0; s < k; s++) pts.push([a[0] + ((b[0] - a[0]) * s) / k, a[1] + ((b[1] - a[1]) * s) / k]);
      }
      if (!c.closed) pts.push(c.pts[n - 1].slice());
      return { pts, closed: c.closed };
    });
  }
  G.resampleContours = resampleContours;

  // 生成一个网格上所有顶点的映射（输入网格或轮廓）
  function mapGeometry(geo, fn) {
    if (!geo) return null;
    if (geo.kind === 'mesh') {
      const pos = geo.pos;
      const out = new Float32Array(pos.length);
      for (let i = 0; i < pos.length; i += 3) {
        const r = fn(pos[i], pos[i + 1], pos[i + 2]);
        out[i] = r[0];
        out[i + 1] = r[1];
        out[i + 2] = r[2];
      }
      return { kind: 'mesh', pos: out, nrm: Mesh.faceNormals(out) };
    }
    if (geo.kind === 'contours') {
      return {
        kind: 'contours',
        depth: geo.depth,
        contours: geo.contours.map((c) => ({
          closed: c.closed,
          pts: c.pts.map((p) => {
            const r = fn(p[0], p[1], 0);
            return [r[0], r[1]];
          }),
        })),
      };
    }
    return null;
  }

  // 图钉变形：多个图钉以权重混合（不撕裂）
  function pinTransform(pins, x, y) {
    let S = 0, sx = 0, sy = 0;
    for (const pin of pins) {
      const dx = x - pin.rx, dy = y - pin.ry;
      const d = Math.hypot(dx, dy);
      const R = Math.max(1, pin.radius);
      const w = Math.pow(Math.max(0, 1 - d / R), 2);
      if (w <= 0) continue;
      const a = U.deg2rad(pin.rot), s = pin.scale / 100;
      const tx = pin.x + (Math.cos(a) * dx - Math.sin(a) * dy) * s;
      const ty = pin.y + (Math.sin(a) * dx + Math.cos(a) * dy) * s;
      S += w;
      sx += w * tx;
      sy += w * ty;
    }
    if (S <= 1e-9) return [x, y];
    const k = Math.min(1, S);
    const ax = sx / S, ay = sy / S;
    return [x + (ax - x) * k, y + (ay - y) * k];
  }
  G.pinTransform = pinTransform;

  // 场函数（p, t） -> 向量
  G.fieldNoise = (cx, cy, cz, freq, seed) => (p, t) => {
    const x = p[0] * freq + t * 0.6, y = p[1] * freq, z = p[2] * freq;
    return [U.noise3(x, y, z, seed) * 1, U.noise3(x + 17.1, y + 3.3, z, seed + 1) * 1, U.noise3(x, y + 9.7, z + 4.2, seed + 2) * 1];
  };
  G.fieldFalloff = (c, radius, strength, attract) => (p) => {
    const dx = p[0] - c[0], dy = p[1] - c[1], dz = p[2] - c[2];
    const d = Math.hypot(dx, dy, dz) || 1e-6;
    if (d >= radius) return [0, 0, 0];
    const f = Math.pow(1 - d / radius, 2) * strength;
    const sgn = attract ? -1 : 1;
    return [(dx / d) * f * sgn, (dy / d) * f * sgn, (dz / d) * f * sgn];
  };
  G.fieldVortex = (c, radius, strength) => (p) => {
    const dx = p[0] - c[0], dz = p[2] - c[2];
    const d = Math.hypot(dx, dz);
    if (d >= radius) return [0, 0, 0];
    const f = Math.pow(1 - d / radius, 2) * strength;
    return [-dz * f * 0.02, 0, dx * f * 0.02];
  };

  // 从网格或轮廓采样点（面积加权）
  function samplePoints(geo, count, seed) {
    const out = [];
    if (!geo) return out;
    if (geo.kind === 'mesh') {
      const pos = geo.pos;
      const areas = [];
      let total = 0;
      for (let i = 0; i < pos.length; i += 9) {
        const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
        const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
        const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
        const a = 0.5 * Math.hypot(cx, cy, cz);
        total += a;
        areas.push(total);
      }
      if (total <= 0) return out;
      for (let n = 0; n < count; n++) {
        const r = U.hash(seed, n, 1) * total;
        let lo = 0, hi = areas.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (areas[mid] < r) lo = mid + 1;
          else hi = mid;
        }
        const i = lo * 9;
        let u = U.hash(seed, n, 2), v = U.hash(seed, n, 3);
        if (u + v > 1) {
          u = 1 - u;
          v = 1 - v;
        }
        const p = [0, 1, 2].map((k) => pos[i + k] + (pos[i + 3 + k] - pos[i + k]) * u + (pos[i + 6 + k] - pos[i + k]) * v);
        const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
        const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
        const nn = U.vnorm([ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx]);
        out.push({ p, n: nn });
      }
      return out;
    }
    if (geo.kind === 'contours') {
      const segs = [];
      let total = 0;
      geo.contours.forEach((c) => {
        const m = c.pts.length;
        for (let i = 0; i < (c.closed ? m : m - 1); i++) {
          const a = c.pts[i], b = c.pts[(i + 1) % m];
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          total += L;
          segs.push({ a, b, end: total });
        }
      });
      if (total <= 0) return out;
      for (let n = 0; n < count; n++) {
        const r = U.hash(seed, n, 4) * total;
        const s = segs.find((q) => q.end >= r) || segs[segs.length - 1];
        const f = U.hash(seed, n, 5);
        const p = [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f, 0];
        out.push({ p, n: [0, 0, -1] });
      }
    }
    return out;
  }
  G.samplePoints = samplePoints;

  // 基础几何：文字、矩形、椭圆
  G.def('text', {
    label: '文字轮廓', cat: '几何源',
    inputs: [],
    outputs: [{ name: 'out', type: 'geometry' }],
    params: [
      { name: 'text', kind: 'text', def: '锻', label: '文字' },
      { name: 'font', kind: 'enum', def: 'hans-bold', label: '字体' },
      PN('size', 240, '字号'),
      PN('tracking', 0, '字距'),
    ],
    run(c) {
      const font = c.p('font');
      const lay = AE.Text.layout({ text: c.p('text'), font, size: c.p('size'), leading: c.p('size') * 1.15, tracking: c.p('tracking'), align: 'center' });
      const contours = lay.glyphs.flatMap((g) => g.contours);
      return { kind: 'contours', contours, depth: 0, missing: lay.missing };
    },
  });
  G.def('rect', {
    label: '矩形轮廓', cat: '几何源',
    inputs: [],
    outputs: [{ name: 'out', type: 'geometry' }],
    params: [PN('w', 400, '宽'), PN('h', 240, '高'), PN('round', 0, '圆角')],
    run(c) {
      const bp = Model.rectPath(0, 0, c.p('w'), c.p('h'), c.p('round'));
      return { kind: 'contours', contours: P.contoursFromBPaths([bp], 0.4), depth: 0 };
    },
  });
  G.def('ellipse', {
    label: '椭圆轮廓', cat: '几何源',
    inputs: [],
    outputs: [{ name: 'out', type: 'geometry' }],
    params: [PN('w', 400, '宽'), PN('h', 240, '高')],
    run(c) {
      return { kind: 'contours', contours: P.contoursFromBPaths([Model.ellipsePath(0, 0, c.p('w'), c.p('h'))], 0.4), depth: 0 };
    },
  });
  G.def('extrude', {
    label: '挤出', cat: '几何',
    inputs: [{ name: 'geo', type: 'geometry' }],
    outputs: [{ name: 'out', type: 'geometry' }],
    params: [PN('depth', 120, '深度'), PN('bevel', 0, '倒角')],
    run(c) {
      const g = c.inputs.geo;
      if (!g) return null;
      if (g.kind === 'mesh') return g;
      const mesh = Mesh.extrude(g.contours, c.p('depth'), c.p('bevel'));
      return mesh ? { kind: 'mesh', pos: mesh.pos, nrm: mesh.nrm } : null;
    },
  });
  // 图钉：每个图钉记录静止位置与当前位置，参数均可动画
  G.def('pin', {
    label: '图钉', cat: '变形',
    inputs: [],
    outputs: [{ name: 'out', type: 'pins' }],
    params: [PN('rx', 0, '静止 X'), PN('ry', 0, '静止 Y'), PN('x', 0, 'X'), PN('y', 0, 'Y'), PN('rot', 0, '旋转°'), PN('scale', 100, '缩放%'), PN('radius', 200, '影响半径')],
    run(c) {
      return [{ rx: c.p('rx'), ry: c.p('ry'), x: c.p('x'), y: c.p('y'), rot: c.p('rot'), scale: c.p('scale'), radius: c.p('radius') }];
    },
  });
  G.def('pinMerge', {
    label: '合并图钉', cat: '变形',
    inputs: [{ name: 'a', type: 'pins' }, { name: 'b', type: 'pins' }],
    outputs: [{ name: 'out', type: 'pins' }],
    params: [],
    run(c) {
      return [].concat(c.inputs.a || [], c.inputs.b || []);
    },
  });
  G.def('pinDeform', {
    label: '图钉变形', cat: '变形',
    inputs: [{ name: 'geo', type: 'geometry' }, { name: 'pins', type: 'pins' }],
    outputs: [{ name: 'out', type: 'geometry' }],
    params: [PN('amount', 100, '强度%')],
    run(c) {
      const g = c.inputs.geo, pins = c.inputs.pins || [];
      if (!g) return null;
      const k = c.p('amount') / 100;
      const fn = (x, y, z) => {
        const q = pinTransform(pins, x, y);
        return [x + (q[0] - x) * k, y + (q[1] - y) * k, z];
      };
      return mapGeometry(g, fn);
    },
  });
  G.def('fieldFalloff', {
    label: '衰减场', cat: '场',
    inputs: [],
    outputs: [{ name: 'out', type: 'field' }],
    params: [PN('cx', 0, 'X'), PN('cy', 0, 'Y'), PN('cz', 0, 'Z'), PN('radius', 300, '半径'), PN('strength', 1, '强度'), { name: 'attract', kind: 'num', def: 0, label: '吸引(1)/排斥(0)' }],
    run(c) {
      return G.fieldFalloff([c.p('cx'), c.p('cy'), c.p('cz')], c.p('radius'), c.p('strength'), c.p('attract') > 0.5);
    },
  });
  G.def('fieldNoise', {
    label: '噪声场', cat: '场',
    inputs: [],
    outputs: [{ name: 'out', type: 'field' }],
    params: [PN('freq', 0.01, '频率'), PN('strength', 1, '强度'), PN('seed', 3, '种子')],
    run(c) {
      const base = G.fieldNoise(0, 0, 0, c.p('freq'), c.p('seed'));
      const s = c.p('strength');
      return (p, t) => base(p, t).map((v) => v * s);
    },
  });
  G.def('fieldVortex', {
    label: '旋涡场', cat: '场',
    inputs: [],
    outputs: [{ name: 'out', type: 'field' }],
    params: [PN('cx', 0, 'X'), PN('cy', 0, 'Y'), PN('cz', 0, 'Z'), PN('radius', 300, '半径'), PN('strength', 1, '强度')],
    run(c) {
      return G.fieldVortex([c.p('cx'), c.p('cy'), c.p('cz')], c.p('radius'), c.p('strength'));
    },
  });
  G.def('fieldMix', {
    label: '场叠加', cat: '场',
    inputs: [{ name: 'a', type: 'field' }, { name: 'b', type: 'field' }],
    outputs: [{ name: 'out', type: 'field' }],
    params: [],
    run(c) {
      const a = c.inputs.a, b = c.inputs.b;
      return (p, t) => {
        const r = [0, 0, 0];
        [a, b].forEach((f) => {
          if (!f) return;
          const v = f(p, t);
          r[0] += v[0];
          r[1] += v[1];
          r[2] += v[2];
        });
        return r;
      };
    },
  });
  // 细分：每个三角形按中点切成四个，使变形更平滑
  G.def('subdivide', {
    label: '细分网格', cat: '几何',
    inputs: [{ name: 'geo', type: 'geometry' }],
    outputs: [{ name: 'out', type: 'geometry' }],
    params: [PN('levels', 1, '层数')],
    run(c) {
      let g = c.inputs.geo;
      if (!g) return null;
      if (g.kind !== 'mesh') {
        const mesh = Mesh.extrude(g.contours || [], g.depth || 0, 0);
        if (!mesh) return null;
        g = { kind: 'mesh', pos: mesh.pos, nrm: mesh.nrm };
      }
      const levels = Math.max(0, Math.min(3, Math.round(c.p('levels'))));
      let pos = g.pos;
      for (let L = 0; L < levels; L++) {
        const out = new Float32Array(pos.length * 4);
        let o = 0;
        const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const put = (p) => {
          out[o++] = p[0];
          out[o++] = p[1];
          out[o++] = p[2];
        };
        for (let i = 0; i < pos.length; i += 9) {
          const A = [pos[i], pos[i + 1], pos[i + 2]], B = [pos[i + 3], pos[i + 4], pos[i + 5]], C = [pos[i + 6], pos[i + 7], pos[i + 8]];
          const AB = mid(A, B), BC = mid(B, C), CA = mid(C, A);
          [A, AB, CA, AB, B, BC, CA, BC, C, AB, BC, CA].forEach(put);
        }
        pos = out;
      }
      return { kind: 'mesh', pos, nrm: Mesh.faceNormals(pos) };
    },
  });
  // 场驱动的顶点位移（同一场也可作用于粒子）
  G.def('displace', {
    label: '场位移', cat: '变形',
    inputs: [{ name: 'geo', type: 'geometry' }, { name: 'field', type: 'field' }],
    outputs: [{ name: 'out', type: 'geometry' }],
    params: [PN('amount', 1, '强度')],
    run(c) {
      const g = c.inputs.geo, f = c.inputs.field;
      if (!g) return null;
      const amt = c.p('amount');
      return mapGeometry(g, (x, y, z) => {
        if (!f) return [x, y, z];
        const v = f([x, y, z], c.t);
        return [x + v[0] * amt, y + v[1] * amt, z + v[2] * amt];
      });
    },
  });
  G.def('bend', {
    label: '弯曲', cat: '变形',
    inputs: [{ name: 'geo', type: 'geometry' }],
    outputs: [{ name: 'out', type: 'geometry' }],
    params: [PN('amount', 0, '弯曲'), PN('cx', 0, '中心X')],
    run(c) {
      const g = c.inputs.geo;
      if (!g) return null;
      const k = c.p('amount') / 10000, cx = c.p('cx');
      return mapGeometry(g, (x, y, z) => [x, y, z + k * (x - cx) * (x - cx)]);
    },
  });
  G.def('twist', {
    label: '扭转', cat: '变形',
    inputs: [{ name: 'geo', type: 'geometry' }],
    outputs: [{ name: 'out', type: 'geometry' }],
    params: [PN('amount', 0, '扭转°/100px'), PN('cy', 0, '中心Y')],
    run(c) {
      const g = c.inputs.geo;
      if (!g) return null;
      const k = U.deg2rad(c.p('amount')) / 100, cy = c.p('cy');
      return mapGeometry(g, (x, y, z) => {
        const a = k * (y - cy);
        const dx = x, dy = y - cy;
        return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a) + cy, z];
      });
    },
  });
  G.def('scatter', {
    label: '散布采样', cat: '发射',
    inputs: [{ name: 'geo', type: 'geometry' }],
    outputs: [{ name: 'out', type: 'points' }],
    params: [PN('count', 200, '数量'), PN('seed', 1, '种子')],
    run(c) {
      const g = c.inputs.geo;
      if (!g) return [];
      return samplePoints(g, Math.round(c.p('count')), c.p('seed'));
    },
  });
  // 基本标量 / 向量 / 颜色（端口类型示例）
  G.def('number', {
    label: '数值', cat: '数据',
    inputs: [],
    outputs: [{ name: 'out', type: 'scalar' }],
    params: [PN('value', 1, '数值')],
    run(c) {
      return c.p('value');
    },
  });
  G.def('vec3', {
    label: '向量', cat: '数据',
    inputs: [],
    outputs: [{ name: 'out', type: 'vector' }],
    params: [PN('x', 0, 'X'), PN('y', 0, 'Y'), PN('z', 0, 'Z')],
    run(c) {
      return [c.p('x'), c.p('y'), c.p('z')];
    },
  });
  G.def('color', {
    label: '颜色', cat: '数据',
    inputs: [],
    outputs: [{ name: 'out', type: 'color' }],
    params: [PN('r', 1, 'R'), PN('g', 0.5, 'G'), PN('b', 0.2, 'B')],
    run(c) {
      return [c.p('r'), c.p('g'), c.p('b')];
    },
  });
  G.def('math', {
    label: '数学运算', cat: '数据',
    inputs: [{ name: 'a', type: 'scalar' }, { name: 'b', type: 'scalar' }],
    outputs: [{ name: 'out', type: 'scalar' }],
    params: [{ name: 'op', kind: 'enum', def: 'mul', label: '运算', options: ['add', 'sub', 'mul', 'min', 'max'] }],
    run(c) {
      const a = c.inputs.a ?? 0, b = c.inputs.b ?? 0;
      switch (c.p('op')) {
        case 'add':
          return a + b;
        case 'sub':
          return a - b;
        case 'min':
          return Math.min(a, b);
        case 'max':
          return Math.max(a, b);
        default:
          return a * b;
      }
    },
  });

  // 节点类型的显示信息（用于界面）
  G.typeInfo = (type) => G.types[type] || { label: type, cat: '?', inputs: [], outputs: [], params: [] };

  // 对外：某个引用（graph + node）的几何结果
  G.geometryRef = (project, comp, ref, t, layer, salt) => {
    const graph = ref && G.findGraph(project, ref.graph);
    if (!graph || !ref.node) return null;
    const ctx = { project, comp, layer: layer || null, salt: salt || '' };
    return G.output(ctx, graph, ref.node, t, undefined);
  };
  // 几何图层：返回网格或轮廓（已应用 'geo' 来源）
  G.geometryOf = (project, comp, layer, t) => {
    const src = layer.geo && layer.geo.source;
    if (!src) return null;
    const out = G.geometryRef(project, comp, src, t, layer, layer.id);
    if (!out) return null;
    if (out.kind === 'mesh') return out;
    if (out.kind === 'contours') return out;
    return null;
  };
  // 场引用（粒子使用）
  G.fieldRef = (project, comp, ref, t, layer) => {
    const graph = ref && G.findGraph(project, ref.graph);
    if (!graph || !ref.node) return null;
    const ctx = { project, comp, layer: layer || null, salt: '' };
    return G.output(ctx, graph, ref.node, t, undefined);
  };
  // 点集 / 图钉等的通用访问
  G.evalRef = (project, comp, ref, t, layer) => {
    const graph = ref && G.findGraph(project, ref.graph);
    if (!graph || !ref.node) return null;
    return G.output({ project, comp, layer: layer || null, salt: '' }, graph, ref.node, t, undefined);
  };

  // 示例用的节点图：新建、连接、断开
  G.connect = (graph, toNode, toPort, fromNode, fromPort) => {
    const tn = G.findNode(graph, toNode);
    if (!tn) return false;
    tn.ins[toPort] = { node: fromNode, port: fromPort };
    return true;
  };
  G.disconnect = (graph, toNode, toPort) => {
    const tn = G.findNode(graph, toNode);
    if (tn) delete tn.ins[toPort];
  };
  G.removeNode = (graph, nodeId) => {
    graph.nodes = graph.nodes.filter((n) => n.id !== nodeId);
    graph.nodes.forEach((n) => {
      Object.keys(n.ins).forEach((k) => {
        if (n.ins[k].node === nodeId) delete n.ins[k];
      });
    });
  };
  G.duplicateNode = (graph, nodeId) => {
    const src = G.findNode(graph, nodeId);
    if (!src) return null;
    const cp = U.clone(src);
    cp.id = U.uid('n');
    cp.x += 40;
    cp.y += 40;
    cp.ins = {};
    const rid = (o) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) return o.forEach(rid);
      if (o.kind && o.id && 'v' in o) o.id = U.uid('p');
      Object.keys(o).forEach((k) => rid(o[k]));
    };
    rid(cp.params);
    graph.nodes.push(cp);
    return cp;
  };
  void M;
})();
