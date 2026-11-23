/* ============================================================
 * model.js — 工程数据模型：工程 / 合成 / 图层 / 属性 / 关键帧
 * 所有渲染、编辑与持久化都以这里的纯数据为唯一数据源。
 * ============================================================ */
(function (global) {
'use strict';

let UID = 1;
function uid(p) { return (p || 'id') + '_' + (Date.now().toString(36)) + (UID++).toString(36) + Math.floor(Math.random() * 4096).toString(36); }
function shortId(p) { return (p || 'n') + (UID++).toString(36) + Math.floor(Math.random() * 128).toString(36); }

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(t) { return t * t * (3 - 2 * t); }
function mixColor(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), a[3] === undefined || b[3] === undefined ? 1 : lerp(a[3], b[3], t)]; }
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

/* 确定性随机数 */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---------------- 属性 ---------------- */

function prop(name, value, opts) {
  opts = opts || {};
  const p = {
    id: shortId('p'),
    name: name,
    type: opts.type || guessType(value),
    value: deepClone(value),
    animated: false,
    keys: [],
    expr: null,
    exprEnabled: false,
    min: opts.min, max: opts.max, step: opts.step,
    options: opts.options,
    label: opts.label || name
  };
  if (opts.anim) enableAnim(p, 0);
  return p;
}
function guessType(v) {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'string') return 'string';
  if (Array.isArray(v)) {
    if (v.length === 4 && v.some(x => x <= 1 && x >= 0) && v[3] !== undefined) return 'color';
    return 'vec' + v.length;
  }
  return 'number';
}
function enableAnim(p, t) {
  if (p.animated) return;
  p.animated = true;
  const v = deepClone(p.value);
  p.keys = [{ id: shortId('k'), t: t || 0, value: v, interp: 'bezier', eo: { x: 0.417, y: 0 }, ei: { x: 0.583, y: 1 } }];
}
function disableAnim(p) {
  if (!p.animated) return;
  p.value = sampleKeys(p, Infinity, null);
  p.animated = false;
  p.keys = [];
}
function setKey(p, t, value) {
  if (!p.animated) enableAnim(p, t);
  const val = deepClone(value);
  for (const k of p.keys) {
    if (Math.abs(k.t - t) < 1e-6) { k.value = val; return k; }
  }
  const k = { id: shortId('k'), t: t, value: val, interp: 'bezier', eo: { x: 0.417, y: 0 }, ei: { x: 0.583, y: 1 } };
  let idx = 0; while (idx < p.keys.length && p.keys[idx].t < t) idx++;
  p.keys.splice(idx, 0, k);
  if (idx > 0) {
    p.keys[idx - 1].eo = { x: 0.417, y: 0 };
    k.ei = { x: 0.583, y: 1 };
  }
  return k;
}
function removeKeyAt(p, t, tol) {
  tol = tol || 1e-4;
  for (let i = 0; i < p.keys.length; i++) {
    if (Math.abs(p.keys[i].t - t) < tol) { p.keys.splice(i, 1); return true; }
  }
  return false;
}
function removeKeyById(p, id) {
  for (let i = 0; i < p.keys.length; i++) if (p.keys[i].id === id) { p.keys.splice(i, 1); return true; }
  return false;
}

function cubicBezier1d(x1, y1, x2, y2, x) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 12; i++) {
    const cx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t - x;
    if (Math.abs(cx) < 1e-6) break;
    const d = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
    if (Math.abs(d) < 1e-8) break;
    t -= cx / d;
    if (t < lo) t = lo; if (t > hi) t = hi;
  }
  return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
}

/* 时间维关键帧采样（不含表达式） */
function sampleKeys(p, t, spatial) {
  const ks = p.keys;
  if (!ks.length) return deepClone(p.value);
  if (t <= ks[0].t) return deepClone(ks[0].value);
  if (t >= ks[ks.length - 1].t) return deepClone(ks[ks.length - 1].value);
  let i = 0; while (i < ks.length - 1 && ks[i + 1].t <= t) i++;
  const a = ks[i], b = ks[i + 1];
  if (a.interp === 'hold' || b.interp === 'hold') return deepClone(a.value);
  let u = (t - a.t) / (b.t - a.t);
  if (a.interp === 'bezier' && b.interp === 'bezier' && !spatial) {
    u = cubicBezier1d(a.eo.x, a.eo.y, b.ei.x, b.ei.y, u);
  }
  if (Array.isArray(a.value)) {
    const out = new Array(a.value.length);
    for (let d = 0; d < a.value.length; d++) out[d] = lerp(a.value[d], b.value[d], u);
    return out;
  }
  return lerp(a.value, b.value, u);
}

/* 空间插值（位置用）：spatialIn / spatialOut 为切向量 */
function samplePosition(p, t) {
  const ks = p.keys;
  if (!ks.length) return { value: deepClone(p.value), tangent: [0, 0, 0] };
  if (t <= ks[0].t) return { value: deepClone(ks[0].value), tangent: spatialTangent(ks[0], ks[1] || ks[0], +1) };
  if (t >= ks[ks.length - 1].t) {
    const last = ks[ks.length - 1];
    return { value: deepClone(last.value), tangent: spatialTangent(ks[ks.length - 2] || last, last, -1) };
  }
  let i = 0; while (i < ks.length - 1 && ks[i + 1].t <= t) i++;
  const a = ks[i], b = ks[i + 1];
  if (a.interp === 'hold') return { value: deepClone(a.value), tangent: [0, 0, 0] };
  const dim = a.value.length;
  let u = (t - a.t) / (b.t - a.t);
  if (a.interp === 'bezier' && b.interp === 'bezier')
    u = cubicBezier1d(a.eo.x, a.eo.y, b.ei.x, b.ei.y, u);
  const auto = !a.so && !b.si;
  const out = new Array(dim);
  const tan = new Array(3).fill(0);
  if (auto) {
    for (let d = 0; d < dim; d++) {
      const p0 = (ks[i - 1] || a).value[d];
      const p3 = (ks[i + 2] || b).value[d];
      const c1 = a.value[d] + (b.value[d] - p0) / 6;
      const c2 = b.value[d] - (p3 - a.value[d]) / 6;
      out[d] = bez3(a.value[d], c1, c2, b.value[d], u);
      tan[d] = bez3der(a.value[d], c1, c2, b.value[d], u) / (b.t - a.t);
    }
  } else {
    const so = a.so || [0, 0, 0], si = b.si || [0, 0, 0];
    for (let d = 0; d < dim; d++) {
      const c1 = a.value[d] + (so[d] || 0), c2 = b.value[d] + (si[d] || 0);
      out[d] = bez3(a.value[d], c1, c2, b.value[d], u);
      tan[d] = bez3der(a.value[d], c1, c2, b.value[d], u) / (b.t - a.t);
    }
  }
  return { value: out, tangent: tan };
}
function spatialTangent(a, b, sign) {
  const dim = a.value.length, t = new Array(3).fill(0);
  for (let d = 0; d < dim; d++) t[d] = (b.value[d] - a.value[d]) * sign;
  return t;
}
function bez3(a, b, c, d, t) {
  const it = 1 - t;
  return it * it * it * a + 3 * it * it * t * b + 3 * it * t * t * c + t * t * t * d;
}
function bez3der(a, b, c, d, t) {
  const it = 1 - t;
  return 3 * it * it * (b - a) + 6 * it * t * (c - b) + 3 * t * t * (d - c);
}
/* 沿空间曲线路径的弧长参数（匀速运动）：在两帧之间按弧长重定位时间参数 */
function pathLength(p, t0, t1, steps) {
  steps = steps || 24;
  let L = 0, prev = null;
  for (let i = 0; i <= steps; i++) {
    const v = samplePosition(p, t0 + (t1 - t0) * i / steps).value;
    if (prev) { let d = 0; for (let k = 0; k < v.length; k++) d += (v[k] - prev[k]) * (v[k] - prev[k]); L += Math.sqrt(d); }
    prev = v;
  }
  return L;
}

/* ---------------- 图层工厂 ---------------- */

function baseLayer(type, name, threeD) {
  const L = {
    id: uid('L'), type, name,
    enabled: true, solo: false, locked: false, motionBlur: false, is3D: !!threeD,
    inPoint: 0, outPoint: 300, startTime: 0,
    parent: null,
    blendMode: 'normal', adjustLayer: false,
    trackMatte: null, // {mode:'alpha'|'alphaInv'|'luma'|'lumaInv', targetLayerId}
    masks: [],
    effects: [],
    transform: {
      anchor: prop('锚点', threeD ? [0, 0, 0] : [0, 0], {}),
      position: prop('位置', threeD ? [0, 0, 0] : [0, 0], {}),
      scale: prop('缩放', threeD ? [100, 100, 100] : [100, 100], { min: -1000, max: 1000 }),
      rotation: prop(threeD ? 'Z旋转' : '旋转', 0, { min: -7200, max: 7200 }),
      opacity: prop('不透明度', 100, { min: 0, max: 100 })
    },
    layerStyle: {},
    geomSource: null,
    fieldIds: [],
    pins: []
  };
  if (threeD) {
    L.transform.rotationX = prop('X旋转', 0, { min: -7200, max: 7200 });
    L.transform.rotationY = prop('Y旋转', 0, { min: -7200, max: 7200 });
  }
  return L;
}

function shapeLayer(name) {
  const L = baseLayer('shape', name || '形状图层');
  L.shapes = [{
    id: uid('grp'), type: 'group', name: '内容',
    items: []
  }];
  return L;
}
function addPathToShape(group, pathSpec) {
  group.items.push({
    id: uid('sh'), type: 'path', name: '路径 1',
    d: { animated: false, keys: [{ t: 0, paths: pathSpec }] },
    closed: pathSpec ? pathSpec.closed !== false : true
  });
}
function textLayer(name, text) {
  const L = baseLayer('text', name || '文字');
  L.text = {
    sourceText: prop('源文本', text || '文本', {}),
    fontFamily: 'SimHei',
    fontSize: prop('字号', 120, { min: 4, max: 800 }),
    lineHeight: prop('行距', 120, { min: 20, max: 400 }),
    tracking: prop('字距', 0, { min: -50, max: 200 }),
    align: prop('对齐', 'center', { options: ['left', 'center', 'right'] }),
    fillColor: prop('填充颜色', [1, 1, 1, 1], {}),
    strokeColor: prop('描边颜色', [0, 0, 0, 1], {}),
    strokeWidth: prop('描边宽度', 0, { min: 0, max: 60 }),
    verticalScale: prop('垂直缩放', 100, { min: 10, max: 400 }),
    animators: []
  };
  return L;
}
function nullLayer(name) {
  const L = baseLayer('null', name || '空对象');
  L.nullSize = [100, 100];
  return L;
}
function solidLayer(name, color) {
  const L = baseLayer('solid', name || '纯色');
  L.solid = { color: prop('颜色', color || [0.2, 0.3, 0.5, 1], {}), width: 200, height: 200 };
  return L;
}
function adjustmentLayer(name) {
  const L = solidLayer(name || '调整层', [0, 0, 0, 0]);
  L.type = 'adjust'; L.adjustLayer = true; L.name = name || '调整层';
  return L;
}
function cameraLayer(name) {
  const L = baseLayer('camera', name || '摄像机', true);
  L.camera = {
    target: prop('目标点', [640, 360, 0], {}),
    fov: prop('视角', 35, { min: 5, max: 120 }),
    focusDist: prop('对焦距离', 800, { min: 1, max: 6000 }),
    aperture: prop('光圈', 0, { min: 0, max: 100 }),
    blurLevel: prop('模糊强度', 100, { min: 0, max: 300 }),
    dofEnabled: prop('景深', false, {})
  };
  L.transform.position.value = [640, 360, -900];
  return L;
}
function lightLayer(name, kind) {
  const L = baseLayer('light', name || '灯光', true);
  L.light = {
    kind: prop('类型', kind || 'directional', { options: ['directional', 'point'] }),
    color: prop('颜色', [1, 0.95, 0.85, 1], {}),
    intensity: prop('强度', 2.2, { min: 0, max: 20 }),
    target: prop('目标点', [640, 360, 0], {}),
    radius: prop('衰减半径', 1200, { min: 0, max: 6000 }),
    castShadow: prop('投影', true, {}),
    shadowBias: 0.02
  };
  L.transform.position.value = [400, 100, -500];
  return L;
}
function geoLayer(name) {
  const L = baseLayer('geo', name || '三维几何', true);
  L.geo = {
    source: prop('几何来源', 'text', { options: ['text', 'shape', 'node'] }),
    refLayer: prop('来源图层', '', {}),
    refNode: prop('来源节点', '', {}),
    depth: prop('挤出深度', 60, { min: 0, max: 1000 }),
    bevelSize: prop('倒角大小', 4, { min: 0, max: 60 }),
    bevelSegs: prop('倒角分段', 3, { min: 0, max: 12 }),
    bend: prop('弯曲', 0, { min: -180, max: 180 }),
    twist: prop('扭转', 0, { min: -720, max: 720 }),
    castShadow: prop('投射阴影', true, {}),
    receiveShadow: prop('接收阴影', true),
    material: {
      baseColor: prop('基础色', [0.78, 0.46, 0.16, 1], {}),
      metalness: prop('金属度', 0.95, { min: 0, max: 1 }),
      roughness: prop('粗糙度', 0.32, { min: 0.02, max: 1 }),
      emissive: prop('发光', [0.6, 0.12, 0.02, 1], {}),
      emissiveIntensity: prop('发光强度', 1.2, { min: 0, max: 20 }),
      opacity: prop('不透明度', 1, { min: 0, max: 1 })
    }
  };
  return L;
}
function particleLayer(name) {
  const L = baseLayer('particle', name || '粒子');
  L.is3D = true;
  L.particle = {
    emitter: prop('发射器类型', 'surface', { options: ['point', 'curve', 'surface'] }),
    refLayer: prop('来源几何图层', '', {}),
    rate: prop('发射速率', 120, { min: 0, max: 2000 }),
    speed: prop('初速度', 180, { min: 0, max: 3000 }),
    speedRandom: prop('速度随机', 40, { min: 0, max: 100 }),
    life: prop('寿命', 1.4, { min: 0.05, max: 20 }),
    lifeRandom: prop('寿命随机', 35, { min: 0, max: 100 }),
    drag: prop('阻力', 0.4, { min: 0, max: 10 }),
    size: prop('大小', 3.5, { min: 0.1, max: 100 }),
    sizeOverLife: prop('大小随寿命', 30, { min: 0, max: 300 }),
    colorStart: prop('起始颜色', [1, 0.85, 0.35, 1], {}),
    colorEnd: prop('结束颜色', [0.8, 0.1, 0.02, 1], {}),
    opacityEnd: prop('结束透明度', 0, { min: 0, max: 100 }),
    gravity: prop('重力', 600, { min: -3000, max: 3000 }),
    dirForce: prop('方向力', [0, 0, 0], {}),
    attract: prop('吸引/排斥', [0, 0, 0, 0], {}),
    seed: prop('随机种子', 7, { min: 0, max: 9999 }),
    collision: prop('碰撞', true, {}),
    bounce: prop('弹性', 0.42, { min: 0, max: 2 }),
    friction: prop('摩擦', 0.55, { min: 0, max: 1 }),
    collisionLifeChange: prop('碰撞改变寿命', 0, { min: -100, max: 100 }),
    subEmit: prop('次级发射', 2, { min: 0, max: 30 }),
    trail: prop('拖尾长度', 0.12, { min: 0, max: 3 }),
    trailWidth: prop('拖尾宽度', 1, { min: 0.1, max: 10 }),
    heatBursts: prop('锤击脉冲', [], {})
  };
  return L;
}
function fieldLayer(name) {
  const L = baseLayer('field', name || '空间场');
  L.is3D = true;
  L.field = {
    kind: prop('场类型', 'noise', { options: ['falloff', 'noise', 'vortex'] }),
    radius: prop('影响范围', 300, { min: 10, max: 3000 }),
    strength: prop('强度', 200, { min: -2000, max: 2000 }),
    frequency: prop('频率', 0.004, { min: 0.0001, max: 0.05, step: 0.0001 }),
    timeScale: prop('时间流速', 1, { min: 0, max: 10 }),
    falloff: prop('衰减', 70, { min: 0, max: 100 }),
    blend: prop('混合', 1, { min: 0, max: 2 })
  };
  return L;
}
function toneLayer(name) {
  const L = baseLayer('tone', name || '音色');
  L.tone = {
    kind: prop('音色', 'drum', { options: ['drum', 'bass', 'pad', 'pluck', 'bell', 'noise'] }),
    notes: prop('音符序列', [], {}),
    volume: prop('音量', 70, { min: 0, max: 100 }),
    tempo: prop('速度BPM', 120, { min: 20, max: 300 }),
    baseFreq: prop('基础频率', 110, { min: 20, max: 2000 }),
    cutoff: prop('滤波', 3000, { min: 100, max: 12000 }),
    reverb: prop('混响', 25, { min: 0, max: 100 })
  };
  return L;
}
function precompLayer(comp, name) {
  const L = baseLayer('precomp', name || comp.name);
  L.refComp = comp.id;
  L.timeRemap = { enabled: false, prop: prop('时间重映射', 0, { min: 0, max: comp.duration }) };
  L.motionBlur = true;
  return L;
}

/* 形状内容元素工厂 */
function shapeContent(type) {
  const id = uid('sh');
  switch (type) {
    case 'rect': return { id, type: 'rect', name: '矩形路径',
      size: prop('大小', [200, 200]), position: prop('位置', [0, 0]), roundness: prop('圆度', 0, { min: 0, max: 400 }) };
    case 'ellipse': return { id, type: 'ellipse', name: '椭圆路径',
      size: prop('大小', [200, 200]), position: prop('位置', [0, 0]) };
    case 'path': return { id, type: 'path', name: '路径',
      d: { animated: false, keys: [{ t: 0, paths: emptyPath() }] }, closed: true };
    case 'fill': return { id, type: 'fill', name: '填充',
      color: prop('颜色', [0.9, 0.5, 0.2, 1]), opacity: prop('不透明度', 100, { min: 0, max: 100 }),
      fillRule: prop('填充规则', 'nonzero', { options: ['nonzero', 'evenodd'] }) };
    case 'stroke': return { id, type: 'stroke', name: '描边',
      color: prop('颜色', [1, 1, 1, 1]), opacity: prop('不透明度', 100, { min: 0, max: 100 }),
      width: prop('描边宽度', 6, { min: 0, max: 400 }), cap: prop('端点', 'butt', { options: ['butt', 'round', 'square'] }),
      join: prop('拐角', 'miter', { options: ['miter', 'round', 'bevel'] }) };
    case 'trim': return { id, type: 'trim', name: '修剪路径',
      start: prop('开始', 0, { min: 0, max: 100 }), end: prop('结束', 100, { min: 0, max: 100 }),
      offset: prop('偏移', 0, { min: -360, max: 360 }), trimShapes: prop('修剪类型', 'jointly', { options: ['jointly', 'separately'] }) };
    case 'repeater': return { id, type: 'repeater', name: '重复器',
      copies: prop('副本数', 3, { min: 1, max: 100 }),
      offset: prop('偏移', 0, { min: -100, max: 100 }),
      position: prop('位置', [0, 0]), scale: prop('缩放', [100, 100]),
      rotation: prop('旋转', 0, { min: -720, max: 720 }),
      startOpacity: prop('起始不透明度', 100, { min: 0, max: 100 }),
      endOpacity: prop('结束不透明度', 100, { min: 0, max: 100 }) };
    case 'merge': return { id, type: 'merge', name: '合并',
      mode: prop('模式', 'union', { options: ['union', 'subtract', 'intersect'] }) };
    case 'group': return { id, type: 'group', name: '组', items: [] };
  }
}
function emptyPath() {
  return { closed: true, contours: [{ closed: true, pts: [], in: [], out: [] }] };
}
function rectPath(w, h, r) {
  const hw = w / 2, hh = h / 2;
  if (!r) {
    return { closed: true, contours: [{ closed: true,
      pts: [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]],
      in: [[0, 0], [0, 0], [0, 0], [0, 0]], out: [[0, 0], [0, 0], [0, 0], [0, 0]] }] };
  }
  r = Math.min(r, hw, hh);
  const k = 0.5523 * r;
  const C = [];
  const add = (x, y, ix, iy, ox, oy) => C.push([x, y]);
  const segs = [
    [[-hw + r, -hh], [0, -k], [0, 0]], [[hw - r, -hh], [0, 0], [k, 0]],
    [[hw, -hh + r], [0, 0], [0, k]], [[hw, hh - r], [0, -k], [0, 0]],
    [[hw - r, hh], [0, 0], [-k, 0]], [[-hw + r, hh], [0, 0], [0, -k]],
    [[-hw, hh - r], [0, k], [0, 0]], [[-hw, -hh + r], [0, 0], [0, -k]]
  ];
  const pts = [], ins = [], outs = [];
  for (const s of segs) { pts.push(s[0]); ins.push(s[1]); outs.push(s[2]); }
  return { closed: true, contours: [{ closed: true, pts, in: ins, out: outs }] };
}
function ellipsePath(w, h) {
  const rx = w / 2, ry = h / 2, k = 0.5523;
  const pts = [[rx, 0], [0, ry], [-rx, 0], [0, -ry]];
  const ins = [[-k * rx, 0], [0, -k * ry], [k * rx, 0], [0, k * ry]];
  const outs = [[k * rx, 0], [0, k * ry], [-k * rx, 0], [0, -k * ry]];
  return { closed: true, contours: [{ closed: true, pts, in: ins, out: outs }] };
}

/* 蒙版 */
function mask(path, name) {
  return {
    id: uid('msk'), name: name || '蒙版 1',
    inverted: false, feather: prop('蒙版羽化', 0, { min: 0, max: 500 }),
    opacity: prop('蒙版不透明度', 100, { min: 0, max: 100 }),
    expansion: prop('蒙版扩展', 0, { min: -300, max: 300 }),
    d: { animated: false, keys: [{ t: 0, paths: path || rectPath(300, 300) }] }
  };
}

/* 效果工厂 */
const EFFECT_DEFS = {
  gaussian: { name: '高斯模糊', props: { blur: [0, 100, 6], edge: ['repeat', ['repeat', 'transparent']] } },
  glow: { name: '发光', props: { radius: [0, 200, 24], intensity: [0, 10, 1.6], threshold: [0, 100, 60], color: null } },
  shadow: { name: '投影', props: { color: null, opacity: [0, 100, 55], distance: [0, 300, 18], angle: [-360, 36, 135], softness: [0, 200, 14] } },
  hueSat: { name: '色相/饱和度/亮度', props: { hue: [-180, 180, 0], saturation: [-100, 100, 0], lightness: [-100, 100, 0] } }
};
function makeEffect(type) {
  const def = EFFECT_DEFS[type];
  const e = { id: uid('fx'), type, name: def.name, enabled: true, props: {} };
  for (const k in def.props) {
    const d = def.props[k];
    if (d === null) {
      e.props[k] = prop(k, type === 'glow' ? [1, 0.7, 0.25, 1] : [0, 0, 0, 1]);
    } else if (Array.isArray(d[1])) {
      e.props[k] = prop(k, d[0], { options: d[1] });
    } else {
      e.props[k] = prop(k, d[2], { min: d[0], max: d[1] });
    }
  }
  return e;
}

/* ---------------- 合成与工程 ---------------- */

function comp(name, w, h, fps, dur) {
  return {
    id: uid('C'), name: name || '合成 1',
    width: w || 1280, height: h || 720, fps: fps || 30, duration: dur || 15,
    workIn: 0, workOut: dur || 15,
    bgColor: [0.04, 0.045, 0.055, 1],
    transparent: false,
    motionBlur: true, shutterAngle: 180, shutterPhase: -90,
    layers: [],
    graph: { nodes: [], pan: { x: 0, y: 0 }, zoom: 1 }
  };
}
function project(name) {
  return { id: uid('P'), name: name || '未命名工程', version: 1, comps: [], activeComp: null, time: 0 };
}

/* 遍历图层全部属性（用于关键帧/表达式/曲线枚举） */
const TRANSFORM_PROP_ORDER = ['anchor', 'position', 'scale', 'rotation', 'rotationX', 'rotationY', 'opacity'];
function iterProps(obj, prefix, out) {
  if (!obj || typeof obj !== 'object') return;
  if (obj.id && obj.name && 'value' in obj && 'keys' in obj) {
    out.push({ path: prefix ? prefix + '.' + obj.name : obj.name, prop: obj });
    return;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) iterProps(obj[i], prefix, out);
    return;
  }
  for (const k in obj) {
    if (k === 'id' || k === 'name') continue;
    const v = obj[k];
    if (v && typeof v === 'object') iterProps(v, prefix ? prefix + '.' + k : k, out);
  }
}
function layerAnimProps(L) {
  const out = [];
  for (const t of TRANSFORM_PROP_ORDER) iterProps(L.transform[t], '变换.' + L.transform[t].name, out);
  iterProps(L.text, '文字', out);
  iterProps(L.geo, '三维几何', out);
  iterProps(L.particle, '粒子', out);
  iterProps(L.field, '场', out);
  iterProps(L.light, '灯光', out);
  iterProps(L.camera, '摄像机', out);
  iterProps(L.tone, '音色', out);
  iterProps(L.solid, '纯色', out);
  for (const m of L.masks) iterProps(m, '蒙版.' + m.name, out);
  for (const e of L.effects) iterProps(e, '效果.' + e.name, out);
  iterShapes(L.shapes, '形状', out);
  return out;
}
function iterShapes(items, prefix, out) {
  if (!items) return;
  for (const it of items) {
    if (it.type === 'group') iterShapes(it.items, prefix + '.' + it.name, out);
    else {
      for (const k in it) {
        if (it[k] && typeof it[k] === 'object' && it[k].id && 'keys' in it[k])
          out.push({ path: prefix + '.' + it.name + '.' + it[k].name, prop: it[k] });
        if (it[k] && typeof it[k] === 'object' && it[k].animated !== undefined && it[k].keys) {
          // path d handled separately
        }
      }
    }
  }
}

/* 查找 */
function findComp(P, id) { for (const c of P.comps) if (c.id === id) return c; return null; }
function findLayer(C, id) { if (!C) return null; for (const L of C.layers) if (L.id === id) return L; return null; }
function layerIndex(C, id) { for (let i = 0; i < C.layers.length; i++) if (C.layers[i].id === id) return i; return -1; }

/* 工程中是否含任何内容 */
function compIsEmpty(C) { return !C || !C.layers.length; }

global.M = {
  uid, shortId, clamp, lerp, smooth, mixColor, deepClone, rng, hashStr,
  prop, enableAnim, disableAnim, setKey, removeKeyAt, removeKeyById,
  sampleKeys, samplePosition, cubicBezier1d, pathLength,
  shapeLayer, textLayer, nullLayer, solidLayer, adjustmentLayer, cameraLayer,
  lightLayer, geoLayer, particleLayer, fieldLayer, toneLayer, precompLayer,
  shapeContent, emptyPath, rectPath, ellipsePath, mask, makeEffect, EFFECT_DEFS,
  comp, project, iterProps, layerAnimProps, findComp, findLayer, layerIndex, compIsEmpty,
  TRANSFORM_PROP_ORDER
};
})(window);
