/* 工程数据模型：工程 / 合成 / 图层 / 属性 / 关键帧 / 蒙版 / 效果 / 形状内容。
 * 数据全部是可 JSON 序列化的纯对象；缓存依赖 AE.Model.version，任何修改都调用 touch()。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const U = AE.U;
  const Model = (AE.Model = {});

  Model.version = 0;
  Model.touch = () => {
    Model.version++;
  };

  // 属性：kind 取 num / vec / color / bool / enum / text / path
  Model.prop = (kind, v, extra) =>
    Object.assign(
      {
        id: U.uid('p'),
        kind,
        v,
        animated: false,
        keys: [],
        expr: '',
        exprOn: true,
        spatial: false,
        loopOut: null,
        loopIn: null,
      },
      extra || {}
    );
  Model.num = (v, extra) => Model.prop('num', v, extra);
  Model.vec = (v, extra) => Model.prop('vec', v.slice(), extra);
  Model.color = (v) => Model.prop('color', v.slice());
  Model.path = (contours) => Model.prop('path', contours);

  // 关键帧：t 为图层本地时间（秒）
  // inT/outT: bezier | linear | hold；inI/inS/outI/outS 为影响度与速度（0..1 / 相对斜率）
  // sIn/sOut 为空间路径手柄（仅位置属性使用），corner 表示尖角
  Model.key = (t, v, extra) =>
    Object.assign(
      { t, v: Array.isArray(v) ? v.slice() : v, inT: 'linear', outT: 'linear', inI: 1 / 3, inS: 0, outI: 1 / 3, outS: 0, sIn: null, sOut: null, corner: false },
      extra || {}
    );

  // 路径（贝塞尔轮廓）：v 顶点，i / o 为入、出切线偏移（相对顶点）
  Model.bpath = (closed, v, i, o) => ({ closed: !!closed, v: v.map((p) => p.slice()), i: (i || v.map(() => [0, 0])).map((p) => p.slice()), o: (o || v.map(() => [0, 0])).map((p) => p.slice()) });
  Model.rectPath = (cx, cy, w, h, r) => {
    r = Math.min(r || 0, w / 2, h / 2);
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    if (r <= 0.01) return Model.bpath(true, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    const k = 0.5523 * r;
    // 直线段两端切线为零；每个圆角由相邻顶点的控制柄构成
    const v = [[x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r], [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r]];
    const o = [[0, 0], [k, 0], [0, 0], [0, k], [0, 0], [-k, 0], [0, 0], [0, -k]];
    const i = [[-k, 0], [0, 0], [0, -k], [0, 0], [k, 0], [0, 0], [0, k], [0, 0]];
    return Model.bpath(true, v, i, o);
  };
  Model.ellipsePath = (cx, cy, w, h) => {
    const rx = w / 2, ry = h / 2, k = 0.5523;
    const v = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
    const o = [[k * rx, 0], [0, k * ry], [-k * rx, 0], [0, -k * ry]];
    const i = [[-k * rx, 0], [0, -k * ry], [k * rx, 0], [0, k * ry]];
    return Model.bpath(true, v, i, o);
  };

  Model.newProject = (name) => ({ version: 1, name: name || '未命名工程', comps: [], graphs: [], sound: null, activeComp: null });

  Model.newComp = (opts) => {
    opts = opts || {};
    return {
      id: U.uid('c'),
      name: opts.name || '合成 1',
      width: opts.width || 1920,
      height: opts.height || 1080,
      fps: opts.fps || 30,
      duration: opts.duration || 10,
      workStart: 0,
      workEnd: opts.duration || 10,
      bg: opts.bg || [0.08, 0.08, 0.09],
      motionBlur: false,
      shutter: 180,
      phase: -90,
      mbSamples: 8,
      layers: [],
    };
  };

  // 图层默认属性
  Model.createTransform = (comp, opts) => {
    opts = opts || {};
    const cx = comp.width / 2, cy = comp.height / 2;
    return {
      anchor: Model.vec(opts.anchor || [0, 0, 0]),
      position: Model.vec(opts.position || [cx, cy, 0], { spatial: true }),
      scale: Model.vec(opts.scale || [100, 100, 100]),
      rotation: Model.num(opts.rotation || 0),
      rotationX: Model.num(0),
      rotationY: Model.num(0),
      opacity: Model.num(opts.opacity === undefined ? 100 : opts.opacity),
    };
  };

  Model.defaultMaterial = () => ({
    color: Model.color([0.92, 0.92, 0.95]),
    metal: Model.num(0),
    rough: Model.num(0.35),
    emit: Model.num(0),
    emitColor: Model.color([1, 0.5, 0.2]),
    alpha: Model.num(100),
  });

  Model.createLayer = (comp, type, opts) => {
    opts = opts || {};
    const layer = {
      id: U.uid('l'),
      type,
      name: opts.name || Model.typeName(type),
      enabled: true,
      locked: false,
      solo: false,
      inPoint: opts.inPoint !== undefined ? opts.inPoint : comp.workStart,
      outPoint: opts.outPoint !== undefined ? opts.outPoint : comp.workEnd,
      startTime: opts.startTime || 0,
      stretch: 1,
      parent: null,
      is3D: !!opts.is3D,
      mb: false,
      blend: 'normal',
      matte: null,
      matteMode: 'alpha',
      tr: Model.createTransform(comp, opts.tr),
      masks: [],
      effects: [],
      castShadow: true,
      acceptShadow: true,
    };
    if (type === 'shape') {
      layer.contents = opts.contents || [];
      layer.mat = Model.defaultMaterial();
      layer.extrude = { depth: Model.num(0), bevel: Model.num(0) };
    } else if (type === 'text') {
      layer.text = {
        text: Model.prop('text', opts.text || '锻'),
        font: opts.font || 'hans-bold',
        size: Model.num(opts.size || 240),
        leading: Model.num(opts.leading || 280),
        tracking: Model.num(opts.tracking || 0),
        align: opts.align || 'center',
        animators: [],
      };
      layer.mat = Model.defaultMaterial();
      layer.fill = { color: Model.color(opts.color || [1, 1, 1]), opacity: Model.num(100) };
      layer.extrude = { depth: Model.num(0), bevel: Model.num(0) };
    } else if (type === 'precomp') {
      layer.pre = { comp: opts.comp || null, remap: opts.remap || null, start: opts.start || 0 };
    } else if (type === 'camera') {
      layer.is3D = true;
      layer.cam = { poi: Model.vec(opts.poi || [comp.width / 2, comp.height / 2, 0]), zoom: Model.num(opts.zoom || comp.width * 1.389), dof: false, focus: Model.num(opts.focus || 2500), aperture: Model.num(opts.aperture || 0) };
      layer.tr.position = Model.vec(opts.position || [comp.width / 2, comp.height / 2, -(opts.zoom || comp.width * 1.389)]);
    } else if (type === 'light') {
      layer.is3D = true;
      layer.light = {
        kind: opts.kind || 'parallel',
        color: Model.color(opts.color || [1, 0.96, 0.9]),
        intensity: Model.num(opts.intensity || 100),
        poi: Model.vec(opts.poi || [comp.width / 2, comp.height / 2, 0]),
        shadow: !!opts.shadow,
        shadowDark: Model.num(60),
      };
      layer.tr.position = Model.vec(opts.position || [comp.width / 2 - 600, comp.height / 2 - 700, -600]);
    } else if (type === 'geo') {
      layer.is3D = true;
      layer.geo = { source: opts.source || null, mat: Model.defaultMaterial() };
    } else if (type === 'particles') {
      layer.particles = Model.defaultParticles();
    } else if (type === 'sound') {
      layer.sound = { instrument: opts.instrument || 'hit', volume: Model.num(100), events: opts.events || [] };
    } else if (type === 'null' || type === 'adjust') {
      // 仅变换或仅效果
    }
    if (opts.is3D) layer.is3D = true;
    return layer;
  };

  Model.defaultParticles = () => ({
    emitters: [],
    gravity: Model.vec([0, 900, 0]),
    drag: Model.num(0.4),
    restitution: Model.num(0.35),
    friction: Model.num(0.5),
    hitLife: Model.num(1), // 首次碰撞时寿命的倍率
    fields: [],
    colliders: [],
    trail: { on: false, length: Model.num(10), width: Model.num(4), fade: Model.num(100) },
    seed: 7,
    maxParticles: 4000,
    size: Model.num(10),
    sizeEnd: Model.num(2),
    color: Model.color([1, 0.7, 0.3]),
    colorEnd: Model.color([1, 0.2, 0.05]),
    glow: 1,
  });

  Model.typeName = (type) =>
    ({ shape: '形状图层', text: '文字图层', null: '空对象', adjust: '调整图层', precomp: '预合成', camera: '摄像机', light: '灯光', geo: '三维几何', particles: '粒子', sound: '音色' }[type] || '图层');

  Model.findComp = (project, id) => project.comps.find((c) => c.id === id) || null;
  Model.findLayer = (comp, id) => (comp ? comp.layers.find((l) => l.id === id) || null : null);

  // 父级链（由近到远）
  Model.parentLayer = (comp, layer) => (layer && layer.parent ? Model.findLayer(comp, layer.parent) : null);

  // 把图层所有可动画属性汇总，便于遍历（用于复制时重新分配 id 及 UI 查找）
  Model.eachProp = (obj, fn, path) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((o) => Model.eachProp(o, fn, path));
      return;
    }
    if (obj.kind && obj.id && 'v' in obj) {
      fn(obj, path);
      return;
    }
    for (const k of Object.keys(obj)) Model.eachProp(obj[k], fn, path ? path + '.' + k : k);
  };

  // 复制图层（重新分配 id；props 深拷贝）
  Model.cloneLayer = (layer) => {
    const c = U.clone(layer);
    const rid = (o) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) return o.forEach(rid);
      if (o.kind && o.id && 'v' in o) o.id = U.uid('p');
      else if (o.id && o.type && o.contents !== undefined) o.id = o.id;
      for (const k of Object.keys(o)) if (typeof o[k] === 'object') rid(o[k]);
    };
    c.id = U.uid('l');
    rid(c);
    return c;
  };

  Model.cloneComp = (comp) => {
    const c = U.clone(comp);
    c.id = U.uid('c');
    c.name = comp.name + ' 副本';
    return c;
  };

  // 深度遍历所有形状内容项（组内递归）
  Model.walkContents = (items, fn) => {
    (items || []).forEach((it) => {
      fn(it);
      if (it.type === 'group') Model.walkContents(it.items, fn);
    });
  };

  // 图层在某时刻是否活动（入出点之间）
  Model.layerActive = (layer, t) => t >= layer.inPoint - 1e-9 && t < layer.outPoint - 1e-9;

  // 把属性转换为一个“可编辑的数值副本”（只读辅助）
  Model.propKind = (p) => p.kind;

  // 工程的默认空白状态
  Model.emptyProject = () => {
    const p = Model.newProject('新工程');
    const comp = Model.newComp({ name: '合成 1' });
    p.comps.push(comp);
    p.activeComp = comp.id;
    return p;
  };
})();
