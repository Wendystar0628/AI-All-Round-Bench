// 工程数据模型：纯 JSON 结构 + schema（属性元信息）+ 工厂函数 + 属性树
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const N = (key, label, def, o) => Object.assign({ key, label, type: 'num', def }, o || {});
  const V2 = (key, label, def, o) => Object.assign({ key, label, type: 'vec2', def }, o || {});
  const V3 = (key, label, def, o) => Object.assign({ key, label, type: 'vec3', def }, o || {});
  const C = (key, label, def, o) => Object.assign({ key, label, type: 'color', def }, o || {});
  const PTH = (key, label, o) => Object.assign({ key, label, type: 'path', def: { c: [] } }, o || {});
  const S = (key, label, kind, def, options) => ({ key, label, kind, def, options });

  const Schema = (MF.Schema = {
    transform: [
      V3('anchor', '锚点', [0, 0, 0], { spatial: true, ae: 'anchorPoint' }),
      V3('position', '位置', [0, 0, 0], { spatial: true, ae: 'position' }),
      V3('scale', '缩放', [100, 100, 100], { unit: '%', ae: 'scale', link: true }),
      N('rotX', 'X 轴旋转', 0, { unit: '°', only3D: true, ae: 'xRotation' }),
      N('rotY', 'Y 轴旋转', 0, { unit: '°', only3D: true, ae: 'yRotation' }),
      N('rotation', '旋转', 0, { unit: '°', ae: 'rotation' }),
      N('opacity', '不透明度', 100, { unit: '%', min: 0, max: 100, ae: 'opacity' }),
    ],
    mask: [PTH('path', '蒙版路径'), N('feather', '羽化', 0, { min: 0, unit: 'px' }), N('opacity', '蒙版不透明度', 100, { min: 0, max: 100, unit: '%' }), N('expansion', '扩展', 0, { unit: 'px' })],
    effects: {
      blur: { label: '高斯模糊', params: [N('radius', '模糊度', 12, { min: 0, unit: 'px' })] },
      glow: { label: '发光', params: [N('threshold', '阈值', 60, { min: 0, max: 100, unit: '%' }), N('radius', '半径', 30, { min: 0, unit: 'px' }), N('intensity', '强度', 1, { min: 0, step: 0.05 }), C('color', '色调', [1, 1, 1, 1])] },
      shadow: { label: '投影', params: [C('color', '阴影颜色', [0, 0, 0, 1]), N('opacity', '不透明度', 60, { min: 0, max: 100, unit: '%' }), N('angle', '方向', 135, { unit: '°' }), N('distance', '距离', 12, { min: 0, unit: 'px' }), N('softness', '柔和度', 12, { min: 0, unit: 'px' })] },
      hsl: { label: '色相/饱和度/亮度', params: [N('hue', '色相', 0, { unit: '°' }), N('sat', '饱和度', 0, { min: -100, max: 100 }), N('light', '亮度', 0, { min: -100, max: 100 })] },
      tint: { label: '填充着色', params: [C('color', '颜色', [1, 0.5, 0.2, 1]), N('amount', '数量', 100, { min: 0, max: 100, unit: '%' })] },
      levels: { label: '亮度/对比度', params: [N('brightness', '亮度', 0, { min: -100, max: 100 }), N('contrast', '对比度', 0, { min: -100, max: 100 })] },
      slider: { label: '滑块控制', ctl: true, params: [N('slider', '滑块', 0, { step: 0.1 })] },
      angleCtl: { label: '角度控制', ctl: true, params: [N('angle', '角度', 0, { unit: '°' })] },
      colorCtl: { label: '颜色控制', ctl: true, params: [C('color', '颜色', [1, 1, 1, 1])] },
      pointCtl: { label: '点控制', ctl: true, params: [V3('point', '点', [0, 0, 0], { spatial: true })] },
    },
    shape: {
      rect: { label: '矩形路径', cat: 'path', params: [V2('size', '大小', [200, 200]), V2('position', '位置', [0, 0], { spatial: true }), N('roundness', '圆度', 0, { min: 0 })] },
      ellipse: { label: '椭圆路径', cat: 'path', params: [V2('size', '大小', [200, 200]), V2('position', '位置', [0, 0], { spatial: true })] },
      star: { label: '多边星形', cat: 'path', params: [N('points', '点数', 5, { min: 3, step: 1 }), V2('position', '位置', [0, 0], { spatial: true }), N('rotation', '旋转', 0, { unit: '°' }), N('outer', '外径', 120, { min: 0 }), N('inner', '内径', 50, { min: 0 })], statics: [S('kind', '类型', 'enum', 'star', [['star', '星形'], ['polygon', '多边形']])] },
      path: { label: '路径', cat: 'path', params: [PTH('path', '路径')] },
      fill: { label: '填充', cat: 'style', params: [C('color', '颜色', [0.95, 0.45, 0.15, 1]), N('opacity', '不透明度', 100, { min: 0, max: 100, unit: '%' })], statics: [S('rule', '填充规则', 'enum', 'nonzero', [['nonzero', '非零环绕'], ['evenodd', '奇偶']])] },
      stroke: { label: '描边', cat: 'style', params: [C('color', '颜色', [1, 1, 1, 1]), N('opacity', '不透明度', 100, { min: 0, max: 100, unit: '%' }), N('width', '描边宽度', 4, { min: 0, unit: 'px' })], statics: [S('cap', '线段端点', 'enum', 'round', [['butt', '平头'], ['round', '圆头'], ['square', '方头']]), S('join', '线段连接', 'enum', 'round', [['miter', '斜接'], ['round', '圆角'], ['bevel', '斜面']])] },
      trim: { label: '修剪路径', cat: 'op', params: [N('start', '开始', 0, { min: 0, max: 100, unit: '%' }), N('end', '结束', 100, { min: 0, max: 100, unit: '%' }), N('offset', '偏移', 0, { unit: '°' })], statics: [S('mode', '修剪多重形状', 'enum', 'each', [['each', '同时（逐条）'], ['seq', '单独（首尾相接）']])] },
      repeater: { label: '中继器（重复器）', cat: 'op', params: [N('copies', '副本', 3, { min: 0, step: 1 }), N('offset', '偏移', 0), V2('anchor', '锚点', [0, 0], { spatial: true }), V2('position', '位置', [100, 0], { spatial: true }), V2('scale', '比例', [100, 100], { unit: '%' }), N('rotation', '旋转', 0, { unit: '°' }), N('startOpacity', '起始不透明度', 100, { min: 0, max: 100, unit: '%' }), N('endOpacity', '结束不透明度', 100, { min: 0, max: 100, unit: '%' })] },
      merge: { label: '合并路径', cat: 'op', params: [], statics: [S('mode', '模式', 'enum', 'union', [['union', '并集（相加）'], ['difference', '差集（相减）'], ['intersect', '交集'], ['xor', '排除交集']])] },
      offset: { label: '位移路径', cat: 'op', params: [N('amount', '数量', 10, { unit: 'px' })], statics: [S('join', '连接', 'enum', 'round', [['miter', '斜接'], ['round', '圆角']])] },
    },
    text: [N('size', '字号', 96, { min: 1, unit: 'px' }), N('leading', '行距', 0, { unit: 'px', hint: '0 = 自动' }), N('tracking', '字距', 0), C('fill', '填充颜色', [1, 1, 1, 1]), C('stroke', '描边颜色', [0, 0, 0, 1]), N('strokeWidth', '描边宽度', 0, { min: 0, unit: 'px' })],
    animator: [N('start', '起点', 0, { min: 0, max: 100, unit: '%' }), N('end', '终点', 100, { min: 0, max: 100, unit: '%' }), N('offset', '偏移', 0, { unit: '%' }), N('smooth', '软边', 0, { min: 0, max: 100, unit: '%' }),
      V2('position', '位置', [0, 0]), N('rotation', '旋转', 0, { unit: '°' }), V2('scale', '缩放', [100, 100], { unit: '%' }), N('opacity', '不透明度', 100, { min: 0, max: 100, unit: '%' })],
    camera: [V3('poi', '目标点', [0, 0, 0], { spatial: true, ae: 'pointOfInterest' }), N('fov', '视角', 39.6, { min: 1, max: 170, unit: '°' }), N('focus', '对焦距离', 1000, { min: 1, unit: 'px', ae: 'focusDistance' }), N('aperture', '光圈', 0, { min: 0, step: 0.5, ae: 'aperture' })],
    light: [C('color', '颜色', [1, 1, 1, 1]), N('intensity', '强度', 100, { min: 0, unit: '%' }), V3('poi', '目标点', [0, 0, 0], { spatial: true, ae: 'pointOfInterest' }), N('range', '衰减半径', 1500, { min: 1, unit: 'px' }), N('shadowDark', '阴影深度', 80, { min: 0, max: 100, unit: '%' }), N('shadowSoft', '阴影柔和', 2, { min: 0, step: 0.1 })],
    material: [C('baseColor', '基础色', [0.8, 0.8, 0.82, 1]), N('metallic', '金属度', 0.9, { min: 0, max: 1, step: 0.01 }), N('roughness', '粗糙度', 0.35, { min: 0.02, max: 1, step: 0.01 }), C('emissive', '发光颜色', [1, 0.4, 0.1, 1]), N('emissiveInt', '发光强度', 0, { min: 0, step: 0.05 }), N('opacity', '材质不透明度', 100, { min: 0, max: 100, unit: '%' }), N('heatGlow', '热度发光', 0, { min: 0, step: 0.05, hint: '由“场→热度”节点写入的顶点热度驱动' })],
    particles: [V3('gravity', '重力', [0, 900, 0]), N('drag', '阻力', 0.4, { min: 0, step: 0.01 }), V3('wind', '方向力', [0, 0, 0]), N('fieldForce', '场力强度', 800, { step: 10, unit: 'px/s²' }),
      N('bounce', '弹性', 0.45, { min: 0, max: 1, step: 0.01 }), N('friction', '摩擦', 0.3, { min: 0, max: 1, step: 0.01 }),
      N('hitLife', '碰撞后寿命倍率', 1, { min: 0, max: 2, step: 0.01 }), C('hitColor', '碰撞后颜色', [1, 0.35, 0.1, 1]), N('hitColorMix', '碰撞变色量', 0, { min: 0, max: 1, step: 0.01 }),
      N('subCount', '次级发射数量', 0, { min: 0, step: 1 }), N('subSpeed', '次级速度比例', 0.5, { min: 0, step: 0.01 }), N('subLife', '次级寿命', 0.4, { min: 0, step: 0.01, unit: 's' }), N('subSize', '次级大小比例', 0.6, { min: 0, step: 0.01 }),
      N('trailLen', '拖尾长度', 0.12, { min: 0, step: 0.01, unit: 's' }), N('trailWidth', '拖尾宽度', 1, { min: 0, step: 0.05 }), C('trailColor', '拖尾颜色', [1, 0.6, 0.2, 1]), N('trailColorMix', '拖尾着色量', 0, { min: 0, max: 1, step: 0.01 }), N('trailFade', '拖尾消退', 1, { min: 0, max: 4, step: 0.05 }),
      N('glow', '亮度', 1.5, { min: 0, step: 0.05 })],
    emitter: [V3('position', '位置', [0, 0, 0], { spatial: true }), N('rate', '速率', 60, { min: 0, unit: '/s' }), N('speed', '初速度', 300, { unit: 'px/s' }), N('speedRand', '速度随机', 0.4, { min: 0, max: 1, step: 0.01 }), V3('direction', '方向', [0, -1, 0]), N('spread', '扩散角', 40, { min: 0, max: 180, unit: '°' }), N('normalMix', '沿法线', 1, { min: 0, max: 1, step: 0.01 }), N('inherit', '继承发射器速度', 0.5, { min: 0, max: 2, step: 0.01 }),
      N('life', '寿命', 1.2, { min: 0.01, step: 0.01, unit: 's' }), N('lifeRand', '寿命随机', 0.5, { min: 0, max: 1, step: 0.01 }), N('size', '大小', 6, { min: 0, unit: 'px' }), N('sizeRand', '大小随机', 0.5, { min: 0, max: 1, step: 0.01 }), N('sizeEnd', '结束大小比例', 0.2, { min: 0, step: 0.01 }),
      C('colorA', '颜色（出生）', [1, 0.95, 0.75, 1]), C('colorB', '颜色（中段）', [1, 0.55, 0.12, 1]), C('colorC', '颜色（消亡）', [0.6, 0.08, 0.02, 1]), N('alphaStart', '起始不透明度', 100, { min: 0, max: 100, unit: '%' }), N('alphaEnd', '结束不透明度', 0, { min: 0, max: 100, unit: '%' })],
    force: [V3('position', '位置', [0, 0, 0], { spatial: true }), N('strength', '强度', 600, {}), N('radius', '作用半径', 400, { min: 1, unit: 'px' })],
    audio: [N('volume', '音量', 80, { min: 0, max: 100, unit: '%' }), N('pan', '声像', 0, { min: -100, max: 100 })],
    labels: ['#b0432b', '#c98a2b', '#8c9a3a', '#3f9c7a', '#3d8fb8', '#5a6fd6', '#9a5fc9', '#c95f97', '#8a8f98'],
    blends: [['normal', '正常'], ['add', '相加'], ['screen', '滤色'], ['multiply', '正片叠底'], ['overlay', '叠加']],
    mattes: [['none', '无'], ['alpha', 'Alpha 遮罩'], ['alphaInv', 'Alpha 反转遮罩'], ['luma', '亮度遮罩'], ['lumaInv', '亮度反转遮罩']],
    layerTypes: { shape: '形状', text: '文字', null: '空对象', adjust: '调整图层', precomp: '预合成', camera: '摄像机', light: '灯光', geo: '三维几何', particles: '粒子', audio: '音色' },
  });

  const mk = (meta) => ({ v: MF.clone(meta.def) });
  const mkProps = (list, over) => { const p = {}; for (const m of list) p[m.key] = { v: over && over[m.key] !== undefined ? MF.clone(over[m.key]) : MF.clone(m.def) }; return p; };
  const mkStatics = (list, over) => { const s = {}; for (const m of list || []) s[m.key] = over && over[m.key] !== undefined ? over[m.key] : m.def; return s; };

  const Model = (MF.Model = {
    id(project, prefix) { project.seq = (project.seq || 1) + 1; return (prefix || 'o') + project.seq.toString(36); },
    newProject() { return { app: 'MotionForge', version: 1, seq: 1, comps: [], activeComp: null, name: '未命名工程' }; },
    newComp(project, o) {
      o = o || {};
      const c = { id: Model.id(project, 'c'), name: o.name || '合成 ' + (project.comps.length + 1), w: o.w || 1920, h: o.h || 1080, fps: o.fps || 30, duration: o.duration || 10,
        workIn: 0, workOut: o.duration || 10, bg: o.bg || [0.06, 0.06, 0.07], mb: { on: false, angle: 180, phase: -90, samples: 8 },
        env: { preset: 'studio', intensity: 1, rotation: 0, exposure: 1 }, layers: [], nodes: [], markers: [] };
      project.comps.push(c); if (!project.activeComp) project.activeComp = c.id;
      return c;
    },
    getComp(project, id) { return project.comps.find((c) => c.id === id) || null; },
    getLayer(comp, id) { if (!comp || !id) return null; for (const l of comp.layers) if (l.id === id) return l; return null; },
    layerByName(comp, name) { for (const l of comp.layers) if (l.name === name) return l; return null; },
    layerIndex(comp, id) { return comp.layers.findIndex((l) => l.id === id); },
    newLayer(project, comp, type, o) {
      o = o || {};
      const is3Dtype = type === 'camera' || type === 'light' || type === 'geo' || type === 'particles';
      const cnt = comp.layers.filter((l) => l.type === type).length + 1;
      const L = { id: Model.id(project, 'L'), type, name: o.name || Schema.layerTypes[type] + ' ' + cnt, visible: true, locked: false, label: { shape: 4, text: 0, null: 8, adjust: 6, precomp: 1, camera: 7, light: 2, geo: 3, particles: 0, audio: 5 }[type] || 0,
        in: 0, out: comp.duration, start: 0, parent: null, blend: 'normal', matte: 'none', is3D: is3Dtype, mb: false, tr: mkProps(Schema.transform), masks: [], fx: [] };
      const cx = comp.w / 2, cy = comp.h / 2;
      if (type === 'shape') { L.items = []; L.tr.position.v = [cx, cy, 0]; }
      else if (type === 'text') { L.text = { s: { str: o.str || '文字', font: o.font || 'kai', align: 'center' }, p: mkProps(Schema.text), animators: [] }; L.tr.position.v = [cx, cy, 0]; }
      else if (type === 'null') { L.tr.position.v = [cx, cy, 0]; L.tr.anchor.v = [0, 0, 0]; }
      else if (type === 'adjust') { L.tr.position.v = [cx, cy, 0]; L.tr.anchor.v = [cx, cy, 0]; }
      else if (type === 'precomp') { const sc = Model.getComp(project, o.comp); L.src = { comp: o.comp, remapOn: false }; L.remap = { v: 0 }; if (sc) { L.tr.anchor.v = [sc.w / 2, sc.h / 2, 0]; L.out = Math.min(comp.duration, sc.duration); L.name = o.name || sc.name; } L.tr.position.v = [cx, cy, 0]; }
      else if (type === 'camera') { const zoom = (comp.w / 2) / Math.tan((39.6 * MF.DEG) / 2); L.cam = { p: mkProps(Schema.camera, { poi: [cx, cy, 0], focus: zoom }) }; L.tr.position.v = [cx, cy, -zoom]; }
      else if (type === 'light') { L.light = { s: { kind: o.kind || 'parallel', shadows: true }, p: mkProps(Schema.light, { poi: [cx, cy, 0] }) }; L.tr.position.v = [cx - 400, cy - 600, -700]; }
      else if (type === 'geo') { L.geo = { s: { cast: true, receive: true }, p: mkProps(Schema.material) }; }
      else if (type === 'particles') { L.ps = { s: { seed: 1, blend: 'add', rate: 120, floor: false, floorY: comp.h, maxCount: 6000, shape: 'streak' }, p: mkProps(Schema.particles), emitters: [], forces: [] }; }
      else if (type === 'audio') { L.audio = { s: { inst: o.inst || 'bell', notes: o.notes || [], attack: 0.005, decay: 0.4, tone: 0.5, reverb: 0.25 }, p: mkProps(Schema.audio) }; }
      comp.layers.unshift(L);
      return L;
    },
    newEffect(project, type, over) { const d = Schema.effects[type]; return { id: Model.id(project, 'f'), type, name: d.label, on: true, p: mkProps(d.params, over) }; },
    newMask(project, pathValue, over) { const m = { id: Model.id(project, 'm'), name: '蒙版', mode: 'add', inverted: false, p: mkProps(Schema.mask, over) }; if (pathValue) m.p.path.v = pathValue; return m; },
    newShapeItem(project, type, over, st) { const d = Schema.shape[type]; return { id: Model.id(project, 's'), type, name: d.label, on: true, p: mkProps(d.params, over), s: mkStatics(d.statics, st) }; },
    newAnimator(project, over) { return { id: Model.id(project, 'a'), name: '动画器', s: { based: 'char' }, p: mkProps(Schema.animator, over) }; },
    newEmitter(project, over, st) { return { id: Model.id(project, 'e'), name: '发射器', on: true, s: Object.assign({ type: 'point', weight: 'uniform' }, st || {}), p: mkProps(Schema.emitter, over) }; },
    newForce(project, over, st) { return { id: Model.id(project, 'g'), name: '吸引/排斥', on: true, s: Object.assign({ kind: 'attract' }, st || {}), p: mkProps(Schema.force, over) }; },

    // ---------- 属性树（时间轴/属性面板/表达式查找共用）----------
    // 返回 [{ id, label, kind:'group', children:[...], obj?, removable? } | { id, label, kind:'prop', prop, meta }]
    propTree(project, comp, L) {
      const P = (id, meta, prop, extra) => Object.assign({ kind: 'prop', id, label: meta.label, meta, prop }, extra || {});
      const G = (id, label, children, extra) => Object.assign({ kind: 'group', id, label, children }, extra || {});
      const tree = [];
      const tr = [];
      for (const m of Schema.transform) {
        if (m.only3D && !L.is3D) continue;
        if (L.type === 'audio') continue;
        if ((L.type === 'camera' || L.type === 'light') && (m.key === 'anchor' || m.key === 'scale' || m.key === 'opacity' || (L.type === 'light' && m.key !== 'position'))) continue;
        if ((L.type === 'geo' || L.type === 'particles') && m.key === 'opacity' && L.type === 'particles') { /* 粒子保留不透明度 */ }
        let meta = m;
        if (!L.is3D && m.type === 'vec3') meta = Object.assign({}, m, { dims: 2 });
        if (m.key === 'rotation' && L.is3D) meta = Object.assign({}, m, { label: L.type === 'camera' ? '滚转' : 'Z 轴旋转' });
        tr.push(P('tr.' + m.key, meta, L.tr[m.key]));
      }
      if (L.type === 'shape') tree.push(G('items', '内容', L.items.map((it) => { const d = Schema.shape[it.type]; return G('it.' + it.id, it.name, d.params.map((m) => P('it.' + it.id + '.' + m.key, m, it.p[m.key])), { obj: it, objKind: 'shapeItem', statics: d.statics }); }), { addable: 'shapeItem' }));
      if (L.type === 'text') {
        tree.push(G('text', '文本', Schema.text.map((m) => P('text.' + m.key, m, L.text.p[m.key])), { obj: L.text, objKind: 'text' }));
        tree.push(G('animators', '文字动画器', L.text.animators.map((a) => G('ta.' + a.id, a.name, Schema.animator.map((m) => P('ta.' + a.id + '.' + m.key, m, a.p[m.key])), { obj: a, objKind: 'animator' })), { addable: 'animator' }));
      }
      if (L.type === 'precomp') tree.push(G('src', '时间', [P('remap', { key: 'remap', label: '时间重映射', type: 'num', unit: 's', step: 0.01 }, L.remap, { disabled: !L.src.remapOn })], { obj: L.src, objKind: 'precompSrc' }));
      if (L.type === 'camera') tree.push(G('cam', '摄像机选项', Schema.camera.map((m) => P('cam.' + m.key, m, L.cam.p[m.key]))));
      if (L.type === 'light') tree.push(G('light', '灯光选项', Schema.light.map((m) => P('light.' + m.key, m, L.light.p[m.key])), { obj: L.light, objKind: 'light' }));
      if (L.type === 'geo') tree.push(G('mat', '材质', Schema.material.map((m) => P('mat.' + m.key, m, L.geo.p[m.key])), { obj: L.geo, objKind: 'geo' }));
      if (L.type === 'particles') {
        tree.push(G('emitters', '发射器', L.ps.emitters.map((e) => G('em.' + e.id, e.name, Schema.emitter.map((m) => P('em.' + e.id + '.' + m.key, m, e.p[m.key])), { obj: e, objKind: 'emitter' })), { addable: 'emitter' }));
        tree.push(G('ps', '物理与外观', Schema.particles.map((m) => P('ps.' + m.key, m, L.ps.p[m.key])), { obj: L.ps, objKind: 'ps' }));
        tree.push(G('forces', '吸引/排斥力', L.ps.forces.map((e) => G('fc.' + e.id, e.name, Schema.force.map((m) => P('fc.' + e.id + '.' + m.key, m, e.p[m.key])), { obj: e, objKind: 'force' })), { addable: 'force' }));
      }
      if (L.type === 'audio') tree.push(G('au', '音色', Schema.audio.map((m) => P('au.' + m.key, m, L.audio.p[m.key])), { obj: L.audio, objKind: 'audio' }));
      if (L.type !== 'audio' && L.type !== 'camera' && L.type !== 'light' && L.type !== 'null') {
        if (L.masks.length || L.type !== 'geo' && L.type !== 'particles') tree.push(G('masks', '蒙版', L.masks.map((mk_) => G('mask.' + mk_.id, mk_.name, Schema.mask.map((m) => P('mask.' + mk_.id + '.' + m.key, m, mk_.p[m.key])), { obj: mk_, objKind: 'mask' })), { addable: 'mask' }));
      }
      if (L.type !== 'audio' && L.type !== 'camera' && L.type !== 'light') {
        tree.push(G('fx', '效果', L.fx.map((f) => { const d = Schema.effects[f.type]; return G('fx.' + f.id, f.name, d.params.map((m) => P('fx.' + f.id + '.' + m.key, m, f.p[m.key])), { obj: f, objKind: 'effect' }); }), { addable: 'effect' }));
      }
      if (tr.length) tree.push(G('tr', '变换', tr));
      // 节点：该图层所消费的上游节点参数
      if ((L.type === 'geo' || L.type === 'particles') && MF.Nodes) {
        const ns = MF.Nodes.upstreamOfLayer(comp, L.id);
        if (ns.length) tree.push(G('nodes', '节点', ns.map((n) => MF.Nodes.propGroup(n)).filter((g) => g.children.length), { nodes: true }));
      }
      return tree;
    },
    // 展平属性树
    flatProps(tree, out) { out = out || []; for (const n of tree) { if (n.kind === 'prop') out.push(n); else Model.flatProps(n.children, out); } return out; },
    // 按路径查找属性描述
    findProp(project, comp, L, id) {
      if (id.startsWith('node.') || id.startsWith('pin.')) return MF.Nodes ? MF.Nodes.findProp(comp, id) : null;
      if (!L) return null;
      const all = Model.flatProps(Model.propTree(project, comp, L));
      for (const p of all) if (p.id === id) return p;
      // 2D 图层隐藏的 3D 变换属性仍可寻址
      if (id.startsWith('tr.')) { const m = Schema.transform.find((x) => 'tr.' + x.key === id); if (m && L.tr[m.key]) return { kind: 'prop', id, label: m.label, meta: m, prop: L.tr[m.key] }; }
      return null;
    },
    dims(meta, prop) { if (meta.dims) return meta.dims; if (meta.type === 'num') return 1; if (meta.type === 'vec2') return 2; if (meta.type === 'vec3') return 3; if (meta.type === 'color') return 4; return 0; },
    isAnimated(prop) { return !!(prop && prop.k); },
    hasExpr(prop) { return !!(prop && prop.x && prop.xOn !== false); },
    // 遍历图层内所有属性对象
    eachProp(project, comp, L, fn) { for (const p of Model.flatProps(Model.propTree(project, comp, L))) fn(p); },
    // 工程序列化
    serialize(project) { return JSON.stringify(project); },
    deserialize(str) { const p = JSON.parse(str); if (!p || !Array.isArray(p.comps)) throw new Error('不是有效的工程文件'); return p; },
  });
})();
