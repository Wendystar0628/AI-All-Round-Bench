/* ============================================================
   model.js — 工程/合成/图层/属性/关键帧数据模型，撤销与存取
   ============================================================ */
(function (global) {
  'use strict';
  const { clamp, lerp, mixColor, deepClone } = U;

  /* ---------------- 值运算 ---------------- */
  const isArr = v => Array.isArray(v);
  function dims(v) { return isArr(v) ? v.length : 1; }
  function vmax(a, b) { return Math.max(dims(a), dims(b)); }
  function vget(v, i) { return isArr(v) ? (v[i] === undefined ? 0 : v[i]) : (i === 0 ? v : 0); }
  function vlerp(a, b, t) {
    if (isArr(a) || isArr(b)) { const n = vmax(a, b); const o = []; for (let i = 0; i < n; i++) o.push(lerp(vget(a, i), vget(b, i), t)); return o; }
    return lerp(a, b, t);
  }
  function vsub(a, b) { if (isArr(a) || isArr(b)) { const n = vmax(a, b); const o = []; for (let i = 0; i < n; i++) o.push(vget(a, i) - vget(b, i)); return o; } return a - b; }
  function vadd(a, b) { if (isArr(a) || isArr(b)) { const n = vmax(a, b); const o = []; for (let i = 0; i < n; i++) o.push(vget(a, i) + vget(b, i)); return o; } return a + b; }
  function vscale(a, s) { if (isArr(a)) return a.map(x => x * s); return a * s; }
  function vlen(a) { return isArr(a) ? Math.hypot(...a) : Math.abs(a); }
  function vnorm(a) { const l = vlen(a) || 1; return vscale(a, 1 / l); }
  function isColor(v) { return typeof v === 'string' && v[0] === '#'; }
  function valLerp(a, b, t, isCol) {
    if (isCol || (isColor(a) && isColor(b))) return mixColor(a, b, t);
    return vlerp(a, b, t);
  }

  /* ---------------- 属性 ---------------- */
  function newProp(v, opts) {
    const p = { v: deepClone(v), keys: [], expr: '', exprOn: false };
    if (opts) Object.assign(p, opts);
    if (opts && opts.color) p.color = true;
    return p;
  }
  function cloneProp(p) {
    const c = { v: deepClone(p.v), keys: deepClone(p.keys || []), expr: p.expr || '', exprOn: !!p.exprOn };
    if (p.color) c.color = true;
    if (p.spatial !== undefined) c.spatial = p.spatial;
    if (p.dims !== undefined) c.dims = p.dims;
    return c;
  }
  function isAnimated(p) { return (p.keys && p.keys.length > 0) || (p.exprOn && p.expr); }
  function hasKeys(p) { return p.keys && p.keys.length > 0; }

  /* ---------------- 关键帧 ---------------- */
  function newKey(t, v, ease) {
    return { t, v: deepClone(v), ease: ease || 'auto', outT: [0, 0], inT: [0, 0], outS: null, inS: null, spatial: 'auto' };
  }
  function setKey(prop, t, v, ease) {
    const keys = prop.keys;
    const eps = 1e-5;
    for (const k of keys) {
      if (Math.abs(k.t - t) < eps) { k.v = deepClone(v); if (ease) k.ease = ease; recomputeTangents(prop); return k; }
    }
    const k = newKey(t, v, ease);
    let i = 0; while (i < keys.length && keys[i].t < t) i++;
    keys.splice(i, 0, k);
    recomputeTangents(prop);
    return k;
  }
  function removeKeyAt(prop, t) {
    const i = prop.keys.findIndex(k => Math.abs(k.t - t) < 1e-5);
    if (i >= 0) { prop.keys.splice(i, 1); recomputeTangents(prop); return true; }
    return false;
  }
  function recomputeTangents(prop) {
    const keys = prop.keys;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const prev = keys[i - 1], next = keys[i + 1];
      if (k.ease === 'hold') { k.outT = [0, 0]; k.inT = [0, 0]; continue; }
      if (k.ease === 'linear') {
        const dt = next ? next.t - k.t : (prev ? k.t - prev.t : 0.3);
        const dv = next ? vsub(next.v, k.v) : (prev ? vsub(k.v, prev.v) : 0);
        k.outT = [dt / 3, vscale(dv, 1 / 3)];
        const dt2 = prev ? k.t - prev.t : dt;
        const dv2 = prev ? vsub(k.v, prev.v) : dv;
        k.inT = [-dt2 / 3, vscale(dv2, -1 / 3)];
      } else {
        const dt = next ? next.t - k.t : (prev ? k.t - prev.t : 0.3);
        k.outT = [dt / 3, 0];
        const dt2 = prev ? k.t - prev.t : dt;
        k.inT = [-dt2 / 3, 0];
      }
      // 空间切线
      if (prop.spatial) {
        const a = prev ? prev.v : (next ? next.v : k.v);
        const b = next ? next.v : (prev ? prev.v : k.v);
        if (k.spatial === 'auto') { k.outS = vscale(vsub(b, a), 1 / 6); k.inS = vscale(vsub(a, b), 1 / 6); }
        else if (k.spatial === 'linear') { k.outS = vscale(vsub(next ? next.v : k.v, k.v), 1 / 3); k.inS = vscale(vsub(prev ? prev.v : k.v, k.v), 1 / 3); }
        else if (k.spatial === 'hold') { k.outS = [0, 0, 0].slice(0, dims(k.v)); k.inS = [0, 0, 0].slice(0, dims(k.v)); }
      }
    }
  }
  function setKeyEase(prop, t, ease) {
    const k = prop.keys.find(k => Math.abs(k.t - t) < 1e-5);
    if (k) { k.ease = ease; recomputeTangents(prop); }
    return k;
  }

  /* ---------------- 贝塞尔求解 ---------------- */
  function solveX(u, x1, x2) {
    if (u <= 0) return 0; if (u >= 1) return 1;
    let p = u;
    for (let i = 0; i < 10; i++) {
      const x = 3 * (1 - p) * (1 - p) * p * x1 + 3 * (1 - p) * p * p * x2 + p * p * p;
      const d = 3 * (1 - p) * (1 - p) * x1 + 6 * (1 - p) * p * (x2 - x1) + 3 * p * p * (1 - x2);
      const err = x - u;
      if (Math.abs(err) < 1e-7) break;
      if (Math.abs(d) < 1e-9) break;
      p -= err / d; p = clamp(p, 0, 1);
    }
    return p;
  }
  function bezY(p, y1, y2) { const q = 1 - p; return 3 * q * q * p * y1 + 3 * q * p * p * y2 + p * p * p; }

  // 无空间插值的分段求值
  function evalSegment(k0, k1, t, isCol) {
    if (k0.ease === 'hold') return k0.v;
    const dt = k1.t - k0.t;
    if (dt <= 1e-9) return k1.v;
    const u = (t - k0.t) / dt;
    const x1 = clamp(k0.outT[0] / dt, 0, 1), x2 = clamp(1 + k1.inT[0] / dt, 0, 1);
    const p = solveX(u, x1, x2);
    const dv = vsub(k1.v, k0.v);
    const n = vmax(k0.v, k1.v);
    if (n === 1 && !isArr(k0.v) && !isArr(k1.v)) {
      const dvv = (typeof k1.v === 'number' ? k1.v : k1.v[0]) - (typeof k0.v === 'number' ? k0.v : k0.v[0]);
      if (Math.abs(dvv) < 1e-9) return k0.v;
      const y1 = clamp((isArr(k0.outT[1]) ? k0.outT[1][0] : k0.outT[1]) / dvv, -3, 3);
      const y2 = clamp(1 + (isArr(k1.inT[1]) ? k1.inT[1][0] : k1.inT[1]) / dvv, -3, 3);
      const val = (typeof k0.v === 'number' ? k0.v : k0.v[0]) + dvv * bezY(p, y1, y2);
      return val;
    }
    const out = [];
    for (let c = 0; c < n; c++) {
      const a = vget(k0.v, c), b = vget(k1.v, c), d = b - a;
      if (Math.abs(d) < 1e-9) { out.push(a); continue; }
      const t1 = vget(k0.outT[1], c) / d, t2 = 1 + vget(k1.inT[1], c) / d;
      out.push(a + d * bezY(p, clamp(t1, -3, 3), clamp(t2, -3, 3)));
    }
    return out;
  }

  // 空间曲线路径求值（弧长参数化，时间缓动决定沿路径的进度）
  const _spCache = new Map();
  function spatialCurve(k0, k1, prop) {
    const n = vmax(k0.v, k1.v);
    const P0 = k0.v, P3 = k1.v;
    const P1 = vadd(k0.v, k0.outS || [0, 0]);
    const P2 = vadd(k1.v, k1.inS || [0, 0]);
    const N = 48;
    const pts = [];
    let len = 0;
    for (let i = 0; i <= N; i++) {
      const t = i / N, q = 1 - t;
      const p = [];
      for (let c = 0; c < n; c++) {
        p.push(q * q * q * vget(P0, c) + 3 * q * q * t * vget(P1, c) + 3 * q * t * t * vget(P2, c) + t * t * t * vget(P3, c));
      }
      if (i > 0) { let d = 0; for (let c = 0; c < n; c++) d += (p[c] - pts[i - 1][c]) ** 2; len += Math.sqrt(d); }
      pts.push(p);
    }
    return { pts, len, n };
  }
  function sampleCurve(curve, u) {
    const target = clamp(u, 0, 1) * curve.len;
    let acc = 0;
    for (let i = 1; i < curve.pts.length; i++) {
      let d = 0; for (let c = 0; c < curve.n; c++) d += (curve.pts[i][c] - curve.pts[i - 1][c]) ** 2;
      d = Math.sqrt(d);
      if (acc + d >= target || i === curve.pts.length - 1) {
        const f = d > 1e-9 ? (target - acc) / d : 0;
        return curve.pts[i - 1].map((v, c) => lerp(v, curve.pts[i][c], f));
      }
      acc += d;
    }
    return curve.pts[curve.pts.length - 1];
  }
  function evalKeyframes(prop, t) {
    const keys = prop.keys;
    if (!keys || !keys.length) return prop.v;
    if (t <= keys[0].t) return keys[0].v;
    if (t >= keys[keys.length - 1].t) return keys[keys.length - 1].v;
    if (prop.color) {
      for (let i = 0; i < keys.length - 1; i++) {
        const k0 = keys[i], k1 = keys[i + 1];
        if (t >= k0.t && t < k1.t) {
          if (k0.ease === 'hold') return k0.v;
          const dt = k1.t - k0.t, u = (t - k0.t) / dt;
          const x1 = clamp(k0.outT[0] / dt, 0, 1), x2 = clamp(1 + k1.inT[0] / dt, 0, 1);
          const p = solveX(u, x1, x2);
          return mixColor(k0.v, k1.v, p);
        }
      }
      return keys[keys.length - 1].v;
    }
    for (let i = 0; i < keys.length - 1; i++) {
      const k0 = keys[i], k1 = keys[i + 1];
      if (t >= k0.t && t < k1.t) {
        if (k0.ease === 'hold') return k0.v;
        if (prop.spatial && k0.spatial !== 'hold' && k0.outS && k1.inS) {
          const curve = spatialCurve(k0, k1, prop);
          const dt = k1.t - k0.t, u = (t - k0.t) / dt;
          const x1 = clamp(k0.outT[0] / dt, 0, 1), x2 = clamp(1 + k1.inT[0] / dt, 0, 1);
          const p = solveX(u, x1, x2);
          return sampleCurve(curve, p);
        }
        return evalSegment(k0, k1, t, prop.color);
      }
    }
    return keys[keys.length - 1].v;
  }
  // 速度（数值求导）
  function evalVelocity(prop, t, state, layer, path) {
    const e = 1 / 120;
    const a = state ? state.getProp(layer, path, t - e) : evalKeyframes(prop, t - e);
    const b = state ? state.getProp(layer, path, t + e) : evalKeyframes(prop, t + e);
    return vscale(vsub(b, a), 1 / (2 * e));
  }

  /* ---------------- 图层工厂 ---------------- */
  let __id = 1;
  function uid(p) { return (p || 'l') + '_' + (__id++) + '_' + Math.random().toString(36).slice(2, 6); }

  function baseTransform(comp) {
    return {
      anchor: newProp([0, 0]),
      position: newProp([comp.w / 2, comp.h / 2, 0], { spatial: true, dims: 3 }),
      scale: newProp([100, 100, 100]),
      rotation: newProp(0),
      opacity: newProp(100),
      orientation: newProp([0, 0, 0]),
      xRotation: newProp(0),
      yRotation: newProp(0),
      zRotation: newProp(0)
    };
  }
  function baseLayer(comp, type, name) {
    return {
      id: uid(type), name: name || LAYER_TYPES[type].label, type,
      inPoint: 0, outPoint: comp.duration,
      enabled: true, locked: false, solo: false, collapsed: true, shy: false,
      parent: null, blend: 'normal', mb: true,
      matte: null, matteType: 'alpha', matteInvert: false,
      masks: [], effects: [], pins: [],
      transform: baseTransform(comp),
      threeD: false, showPath: false,
      material: null,
      audioLevel: newProp(0)
    };
  }
  const LAYER_TYPES = {
    shape: { label: '形状图层', icon: 'shape', cat: 'content' },
    text: { label: '文字图层', icon: 'text', cat: 'content' },
    null: { label: '空对象', icon: 'null', cat: 'content' },
    adjust: { label: '调整图层', icon: 'adjust', cat: 'content' },
    precomp: { label: '预合成', icon: 'precomp', cat: 'content' },
    solid: { label: '三维实体', icon: 'solid', cat: '3d' },
    particle: { label: '粒子', icon: 'particle', cat: 'sim' },
    field: { label: '空间场', icon: 'field', cat: 'sim' },
    camera: { label: '摄像机', icon: 'camera', cat: '3d' },
    light: { label: '灯光', icon: 'light', cat: '3d' },
    audio: { label: '音色', icon: 'audio', cat: 'content' }
  };

  function createLayer(comp, type, name) {
    const L = baseLayer(comp, type, name);
    switch (type) {
      case 'shape':
        L.shapes = [];
        L.nodeSource = null;
        break;
      case 'text':
        L.text = {
          content: '文字', fontFamily: 'Microsoft YaHei', fontStyle: 'Regular',
          fontSize: newProp(120), lineHeight: newProp(1.2), tracking: newProp(0),
          align: 'center', color: newProp('#ffffff'), fillColor: newProp('#ffffff'),
          strokeOn: false, strokeColor: newProp('#000000'), strokeWidth: newProp(2),
          animators: [], // 文字动画器
          toPathCache: null
        };
        break;
      case 'solid':
        L.solid = {
          geometry: 'box', // box|cylinder|sphere|glyph|extrude|node
          nodeSource: null, textSource: null,
          width: newProp(200), height: newProp(200), depth: newProp(40),
          bevel: newProp(4), bevelSegments: newProp(2),
          curveSegments: newProp(24),
          meshPath: newProp(null), // 路径（序列化）
          bend: newProp(0), twist: newProp(0), taper: newProp(0),
          deform: { amount: newProp(0), axis: 'y' },
          pins: []
        };
        L.threeD = true;
        L.material = {
          color: newProp('#c8c8d0', { color: true }), metallic: newProp(0.9), roughness: newProp(0.35),
          emissive: newProp('#000000', { color: true }), emissiveIntensity: newProp(0),
          opacity: newProp(1), env: newProp(1.0), normalStrength: newProp(1.0)
        };
        break;
      case 'particle':
        L.threeD = true;
        L.particles = {
          seed: newProp(7), rate: newProp(120), lifetime: newProp(1.6), lifetimeVar: newProp(0.4),
          speed: newProp(220), speedVar: newProp(0.5), size: newProp(6), sizeVar: newProp(0.4),
          sizeEnd: newProp(0.2), color: newProp('#ffcf7a', { color: true }), colorEnd: newProp('#ff3a00', { color: true }),
          opacity: newProp(1), opacityEnd: newProp(0),
          emitter: { type: 'point', source: null, radius: newProp(10), spread: newProp(0.6), dir: newProp([0, -1, 0]), alongNormal: newProp(1) },
          forces: { gravity: newProp([0, 500, 0]), drag: newProp(0.6), wind: newProp([0, 0, 0]), fields: [] },
          collision: { on: true, layers: [], bounce: newProp(0.55), friction: newProp(0.35), radius: newProp(3), onHit: { color: newProp('#ffffff', { color: true }), lifetime: newProp(0.8), emit: newProp(0) } },
          trail: { on: true, length: newProp(0.18), width: newProp(1.6), fade: newProp(1) },
          maxParticles: 4000
        };
        break;
      case 'field':
        L.field = {
          type: 'radial', // radial|noise|vortex|directional|turbulence
          radius: newProp(220), strength: newProp(1), falloff: 'smooth',
          frequency: newProp(2), speed: newProp(1), axis: newProp([0, 0, 1]),
          blend: 'add', invert: false, showGizmo: true,
          color: newProp('#39d0ff', { color: true })
        };
        break;
      case 'camera':
        L.threeD = true;
        L.camera = {
          zoom: newProp(1200), fov: newProp(40), focus: newProp(900), aperture: newProp(60),
          focusLayer: null, dof: newProp(true),
          target: newProp([comp.w / 2, comp.h / 2, 0], { spatial: true, dims: 3 }),
          targetEnable: newProp(true)
        };
        L.transform.position = newProp([comp.w / 2, comp.h / 2, -1200], { spatial: true, dims: 3 });
        break;
      case 'light':
        L.threeD = true;
        L.light = {
          kind: 'point', // point|directional|spot
          color: newProp('#ffd9a0', { color: true }), intensity: newProp(1.6),
          castShadow: newProp(true), shadowSoftness: newProp(1.5), radius: newProp(6),
          target: newProp([comp.w / 2, comp.h / 2, 0], { spatial: true, dims: 3 }),
          spotAngle: newProp(45), spotFalloff: newProp(30)
        };
        L.transform.position = newProp([comp.w * 0.35, comp.h * 0.25, -600], { spatial: true, dims: 3 });
        break;
      case 'adjust':
        break;
      case 'precomp':
        L.precomp = { compId: null, startTime: newProp(0), timeRemap: newProp(null), remapOn: false, stretch: newProp(100) };
        break;
      case 'audio':
        L.audio = {
          kind: 'sfx', // music|sfx
          volume: newProp(70), mute: false,
          pattern: 'forge', // 内置音色名
          offset: newProp(0), rate: newProp(100),
          notes: newProp(60)
        };
        break;
    }
    return L;
  }

  /* ---------------- 合成 ---------------- */
  function createComp(name, w, h, fps, duration) {
    return {
      id: uid('comp'), name: name || '合成 1', w: w || 1920, h: h || 1080,
      fps: fps || 30, duration: duration || 10, bgColor: '#0b0c10',
      workArea: [0, duration || 10],
      layers: [], fields: [], markers: [],
      mb: { on: true, shutter: 180, phase: 0, samples: 6 },
      nodes: { nodes: [], links: [], groups: [], pan: { x: 0, y: 0 }, zoom: 1 },
      cameraId: null, activeCamera: null
    };
  }
  function addLayer(comp, layer, index) {
    if (index === undefined || index < 0) comp.layers.unshift(layer);
    else comp.layers.splice(index, 0, layer);
    return layer;
  }
  function removeLayer(comp, id) {
    const i = comp.layers.findIndex(l => l.id === id);
    if (i >= 0) comp.layers.splice(i, 1);
  }
  function layerById(comp, id) { return comp.layers.find(l => l.id === id); }

  /* ---------------- 属性路径 ---------------- */
  function getPropAt(layer, path) {
    let o = layer;
    for (const k of path) { if (o == null) return undefined; o = o[k]; }
    return o;
  }
  function setPropValue(layer, path, v) {
    const p = getPropAt(layer, path);
    if (p && p.keys !== undefined) p.v = deepClone(v);
    return p;
  }
  function propLabel(path) {
    const map = {
      anchor: '锚点', position: '位置', scale: '缩放', rotation: '旋转', opacity: '不透明度',
      orientation: '方向', xRotation: 'X 旋转', yRotation: 'Y 旋转', zRotation: 'Z 旋转',
      fontSize: '字号', lineHeight: '行距', tracking: '字距', color: '颜色', content: '文本',
      width: '宽度', height: '高度', depth: '深度', bevel: '倒角', bevelSegments: '倒角分段',
      metallic: '金属度', roughness: '粗糙度', emissive: '发光颜色', emissiveIntensity: '发光强度',
      rate: '速率', lifetime: '寿命', speed: '初速度', size: '大小', seed: '随机种子',
      zoom: '缩放', fov: '视角', focus: '对焦距离', aperture: '光圈', intensity: '强度',
      radius: '半径', strength: '强度', frequency: '频率', castShadow: '投射阴影'
    };
    return map[path[path.length - 1]] || path[path.length - 1];
  }

  /* ---------------- 撤销 ---------------- */
  const Undo = {
    stack: [], index: -1, limit: 60, transaction: null, coalesceKey: null, coalesceTimer: null,
    reset() { this.stack = []; this.index = -1; },
    push(label) {
      if (this.transaction) return;
      const snap = JSON.stringify(Project);
      if (this.index >= 0 && this.stack[this.index].data === snap) return;
      this.stack = this.stack.slice(0, this.index + 1);
      this.stack.push({ data: snap, label: label || '' });
      if (this.stack.length > this.limit) this.stack.shift();
      this.index = this.stack.length - 1;
    },
    begin(label) { this.transaction = { label }; },
    end() {
      if (!this.transaction) return;
      const label = this.transaction.label; this.transaction = null;
      this.push(label);
    },
    coalesce(label, ms) {
      const now = Date.now();
      if (this.coalesceKey === label && now - this.coalesceTimer < (ms || 400)) { this.coalesceTimer = now; return; }
      this.coalesceKey = label; this.coalesceTimer = now;
      this.push(label);
    },
    undo() {
      if (this.index <= 0) return false;
      this.index--;
      Project = JSON.parse(this.stack[this.index].data);
      return true;
    },
    redo() {
      if (this.index >= this.stack.length - 1) return false;
      this.index++;
      Project = JSON.parse(this.stack[this.index].data);
      return true;
    },
    canUndo() { return this.index > 0; },
    canRedo() { return this.index < this.stack.length - 1; },
    label() { return this.index >= 0 ? this.stack[this.index].label : ''; }
  };

  /* ---------------- 工程 ---------------- */
  let Project = {
    version: 1,
    name: '未命名工程',
    comps: {},
    order: [],
    activeCompId: null,
    selection: [],
    time: 0,
    playing: false,
    loop: true,
    tool: 'select',
    view: { zoom: 1, panX: 0, panY: 0, showGrid: false, showGuides: true, showPaths: true, showFields: true, showOverlays: true, safe: false },
    ui: { rightTab: 'props', timelineTab: 'keys' }
  };

  function newProject() {
    return {
      version: 1, name: '未命名工程', comps: {}, order: [], activeCompId: null,
      selection: [], time: 0, playing: false, loop: true, tool: 'select',
      view: { zoom: 1, panX: 0, panY: 0, showGrid: false, showGuides: true, showPaths: true, showFields: true, showOverlays: true, safe: false },
      ui: { rightTab: 'props', timelineTab: 'keys' }
    };
  }
  function activeComp() { return Project.comps[Project.activeCompId] || null; }
  function setActiveComp(id) {
    if (Project.comps[id]) { Project.activeCompId = id; Project.selection = []; Project.time = 0; }
  }

  /* ---------------- 序列化 ---------------- */
  function serialize() { return JSON.stringify({ project: Project }, null, 0); }
  function deserialize(text) {
    const o = JSON.parse(text);
    if (o.project) { Project = o.project; return true; }
    return false;
  }

  global.MODEL = {
    newProp, cloneProp, isAnimated, hasKeys, setKey, removeKeyAt, setKeyEase, recomputeTangents,
    evalKeyframes, evalVelocity, evalSegment, spatialCurve, sampleCurve, solveX, bezY,
    vlerp, vadd, vsub, vscale, vlen, vnorm, vget, dims, valLerp, isColor,
    LAYER_TYPES, createLayer, createComp, addLayer, removeLayer, layerById,
    getPropAt, setPropValue, propLabel, Undo, newProject, serialize, deserialize, activeComp, setActiveComp, uid,
    get Project() { return Project; },
    set Project(v) { Project = v; }
  };
})(window);
