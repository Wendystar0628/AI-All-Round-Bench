/* ============================================================
   model.js — 工程 / 图层 / 属性 数据模型
   属性统一结构： props[name] = { v: 默认值, tr: 关键帧轨道|null, ex: 表达式|null }
   ============================================================ */
(function (global) {
  const AE = global.AE = global.AE || {};
  const U = AE.util;
  const M = AE.model = {};

  M.BLEND_MODES = [
    { id: 'normal', label: '正常' },
    { id: 'add', label: '相加' },
    { id: 'screen', label: '滤色' },
    { id: 'multiply', label: '正片叠底' },
    { id: 'overlay', label: '叠加' }
  ];

  M.LAYER_TYPES = [
    { id: 'shape', label: '形状', icon: '形', color: '#4ea8de' },
    { id: 'text', label: '文字', icon: 'T', color: '#a98bff' },
    { id: 'null', label: '空对象', icon: '空', color: '#8d9bad' },
    { id: 'adjustment', label: '调整', icon: '调', color: '#5fd08a' },
    { id: 'precomp', label: '预合成', icon: '预', color: '#ff8a3d' },
    { id: 'camera', label: '摄像机', icon: '机', color: '#e0b341' },
    { id: 'light', label: '灯光', icon: '光', color: '#ffe066' },
    { id: 'solid3d', label: '三维几何', icon: '立', color: '#43c8c0' },
    { id: 'particle', label: '粒子', icon: '粒', color: '#ff6f91' },
    { id: 'audio', label: '音色', icon: '声', color: '#b39ddb' }
  ];

  M.typeInfo = id => M.LAYER_TYPES.find(t => t.id === id) || M.LAYER_TYPES[0];

  /* ---------------- 属性定义 ---------------- */
  const TRANSFORM_DEFS = [
    { key: 'anchor', label: '锚点', type: 'vec2', def: [0, 0] },
    { key: 'position', label: '位置', type: 'vec2', def: [960, 540] },
    { key: 'scale', label: '缩放', type: 'vec2', def: [100, 100] },
    { key: 'rotation', label: '旋转', type: 'angle', def: 0 },
    { key: 'opacity', label: '不透明度', type: 'percent', def: 100 },
    { key: 'rotationX', label: 'X 旋转', type: 'angle', def: 0, three: true },
    { key: 'rotationY', label: 'Y 旋转', type: 'angle', def: 0, three: true },
    { key: 'positionZ', label: 'Z 位置', type: 'num', def: 0, three: true }
  ];

  const MATERIAL_DEFS = [
    { key: 'baseColor', label: '基础色', type: 'color', def: '#b8c2cc' },
    { key: 'metallic', label: '金属度', type: 'percent', def: 85 },
    { key: 'roughness', label: '粗糙度', type: 'percent', def: 32 },
    { key: 'emissive', label: '自发光色', type: 'color', def: '#000000' },
    { key: 'emissiveIntensity', label: '发光强度', type: 'num', def: 0 },
    { key: 'matOpacity', label: '材质不透明度', type: 'percent', def: 100 },
    { key: 'reflections', label: '反射', type: 'bool', def: true }
  ];

  M.DEFS = {
    __transform: TRANSFORM_DEFS,
    shape: [
      { key: 'extrude', label: '挤出深度', type: 'num', def: 0, group: '几何' },
      { key: 'bevel', label: '倒角', type: 'num', def: 0, group: '几何' },
      { key: 'fillColor', label: '填充色', type: 'color', def: '#ff8a3d' }
    ].concat(MATERIAL_DEFS),
    text: [
      { key: 'fontSize', label: '字号', type: 'num', def: 120 },
      { key: 'leading', label: '行距', type: 'num', def: 1.25 },
      { key: 'tracking', label: '字距', type: 'num', def: 0 },
      { key: 'align', label: '对齐', type: 'select', def: 'center', options: [['left', '左'], ['center', '居中'], ['right', '右']] },
      { key: 'fontFamily', label: '字体', type: 'select', def: 'Microsoft YaHei', options: [['Microsoft YaHei', '微软雅黑'], ['SimHei', '黑体'], ['SimSun', '宋体'], ['KaiTi', '楷体'], ['Segoe UI', 'Segoe UI']] },
      { key: 'fontWeight', label: '字重', type: 'select', def: '700', options: [['300', '细'], ['400', '常规'], ['700', '粗'], ['900', '特粗']] },
      { key: 'extrude', label: '挤出深度', type: 'num', def: 0, group: '几何' },
      { key: 'bevel', label: '倒角', type: 'num', def: 0, group: '几何' },
      { key: 'fillColor', label: '填充色', type: 'color', def: '#ffffff' }
    ].concat(MATERIAL_DEFS),
    null: [],
    adjustment: [
      { key: 'adjType', label: '调整类型', type: 'select', def: 'hsl', options: [['hsl', '色相/饱和度'], ['exposure', '曝光'], ['curves', '曲线'], ['vibrance', '自然饱和度']] },
      { key: 'adjHue', label: '色相偏移', type: 'num', def: 0, step: 1 },
      { key: 'adjSat', label: '饱和度', type: 'num', def: 0, step: 1 },
      { key: 'adjLight', label: '亮度', type: 'num', def: 0, step: 1 },
      { key: 'adjExposure', label: '曝光', type: 'num', def: 0, step: 0.1 },
      { key: 'adjVibrance', label: '自然饱和度', type: 'num', def: 0, step: 1 }
    ],
    precomp: [
      { key: 'precompStart', label: '起始时间', type: 'num', def: 0, step: 0.1 },
      { key: 'precompScale', label: '时间缩放', type: 'num', def: 100, step: 1 },
      { key: 'precompReverse', label: '倒放', type: 'bool', def: false }
    ],
    camera: [
      { key: 'camPosition', label: '位置', type: 'vec3', def: [0, 0, -2400] },
      { key: 'camPoint', label: '目标点', type: 'vec3', def: [0, 0, 0] },
      { key: 'camFov', label: '视角', type: 'num', def: 45, min: 5, max: 120, step: 0.5 },
      { key: 'camFocus', label: '对焦距离', type: 'num', def: 1200, step: 10 },
      { key: 'camAperture', label: '光圈', type: 'num', def: 0.012, step: 0.002 },
      { key: 'camNear', label: '近裁剪', type: 'num', def: 50, step: 10 },
      { key: 'camFar', label: '远裁剪', type: 'num', def: 9000, step: 100 }
    ],
    light: [
      { key: 'lightType', label: '类型', type: 'select', def: 'parallel', options: [['parallel', '平行光'], ['point', '点光源']] },
      { key: 'lightColor', label: '颜色', type: 'color', def: '#fff2e0' },
      { key: 'lightIntensity', label: '强度', type: 'num', def: 1.4, step: 0.05 },
      { key: 'lightPos', label: '位置', type: 'vec3', def: [600, 900, 900] },
      { key: 'lightDir', label: '方向', type: 'vec3', def: [-0.4, -0.8, -0.45] },
      { key: 'lightFalloff', label: '衰减', type: 'num', def: 2000, step: 50 },
      { key: 'lightShadow', label: '投射阴影', type: 'bool', def: true }
    ],
    solid3d: [
      { key: 'extrude', label: '挤出深度', type: 'num', def: 120 },
      { key: 'bevel', label: '倒角', type: 'num', def: 8 },
      { key: 'twist', label: '扭转', type: 'num', def: 0, step: 0.5, group: '变形' },
      { key: 'bend', label: '弯曲', type: 'num', def: 0, step: 0.5, group: '变形' },
      { key: 'bendAxis', label: '弯曲轴', type: 'select', def: 'x', options: [['x', 'X'], ['y', 'Y']], group: '变形' }
    ].concat(MATERIAL_DEFS),
    particle: [
      { key: 'pRate', label: '发射速率', type: 'num', def: 120, step: 1 },
      { key: 'pLife', label: '寿命', type: 'num', def: 1.4, step: 0.05 },
      { key: 'pSpeed', label: '初速度', type: 'num', def: 320, step: 5 },
      { key: 'pSpread', label: '发散角', type: 'num', def: 35, step: 1 },
      { key: 'pDrag', label: '阻力', type: 'num', def: 0.6, step: 0.05 },
      { key: 'pGravity', label: '重力', type: 'num', def: 900, step: 10 },
      { key: 'pSize', label: '大小', type: 'num', def: 6, step: 0.5 },
      { key: 'pSizeEnd', label: '消失大小', type: 'num', def: 0.4, step: 0.1 },
      { key: 'pColor', label: '颜色', type: 'color', def: '#ffb347' },
      { key: 'pColorEnd', label: '熄灭颜色', type: 'color', def: '#ff3d00' },
      { key: 'pOpacity', label: '不透明度', type: 'percent', def: 100 },
      { key: 'pSeed', label: '随机种子', type: 'num', def: 7, step: 1 },
      { key: 'pTrail', label: '拖尾长度', type: 'num', def: 0, step: 1 },
      { key: 'pTrailWidth', label: '拖尾宽度', type: 'num', def: 3, step: 0.5 },
      { key: 'pTrailColor', label: '拖尾颜色', type: 'color', def: '#ff8a3d' },
      { key: 'pEmitter', label: '发射源', type: 'select', def: 'point', options: [['point', '点'], ['curve', '曲线'], ['surface', '几何表面']] }
    ],
    audio: [
      { key: 'sndWave', label: '波形', type: 'select', def: 'sine', options: [['sine', '正弦'], ['saw', '锯齿'], ['square', '方波'], ['noise', '噪声'], ['metal', '金属撞击']] },
      { key: 'sndFreq', label: '频率', type: 'num', def: 220, step: 1 },
      { key: 'sndFreqEnd', label: '结束频率', type: 'num', def: 110, step: 1 },
      { key: 'sndVol', label: '音量', type: 'percent', def: 70 },
      { key: 'sndAttack', label: '起音', type: 'num', def: 0.01, step: 0.005 },
      { key: 'sndDecay', label: '衰减', type: 'num', def: 0.4, step: 0.02 },
      { key: 'sndNotes', label: '音符序列', type: 'text', def: '0, 3, 7, 10' }
    ]
  };

  /* ---------------- 属性包 ---------------- */
  M.makeProps = function (defs) {
    const p = {};
    for (const d of defs) {
      p[d.key] = { v: Array.isArray(d.def) ? d.def.slice() : d.def, tr: null, ex: null };
    }
    return p;
  };

  M.getProp = function (owner, name) {
    if (!owner) return null;
    if (!owner.props) owner.props = {};
    if (!owner.props[name]) {
      const def = M.findDef(owner, name);
      owner.props[name] = { v: def && Array.isArray(def.def) ? def.def.slice() : (def ? def.def : 0), tr: null, ex: null };
    }
    return owner.props[name];
  };

  M.findDef = function (owner, name) {
    const type = owner.type || owner.ownerType;
    const list = (M.DEFS[type] || []).concat(M.DEFS.__transform || []);
    for (const d of list) {
      if (d.key === name) return d;
      if (d.defs) { for (const dd of d.defs) if (dd.key === name) return dd; }
    }
    return null;
  };

  /* ---------------- 工厂 ---------------- */
  M.createProject = function (name) {
    const comp = M.createComp('主合成', 1920, 1080, 30, 15);
    return {
      version: 1,
      name: name || '未命名工程',
      comps: [comp],
      activeComp: comp.id,
      camera: null,
      fields: []
    };
  };

  M.createComp = function (name, w, h, fps, dur) {
    return {
      id: U.uid('comp'), name: name || '合成', w: w || 1920, h: h || 1080,
      fps: fps || 30, duration: dur || 10,
      workStart: 0, workEnd: dur || 10,
      layers: [],
      motionBlur: { enabled: false, shutter: 180, phase: 50 },
      bgColor: '#0b0f14',
      grid: { enabled: true, size: 40 }
    };
  };

  M.createLayer = function (type, name, comp) {
    const info = M.typeInfo(type);
    const layer = {
      id: U.uid('layer'),
      name: name || info.label,
      label: '',
      type,
      enabled: true,
      locked: false,
      inPoint: 0,
      outPoint: comp ? comp.duration : 5,
      parent: null,
      blendMode: 'normal',
      threeD: false,
      motionBlur: false,
      props: {},
      exprs: {},
      masks: [],
      effects: [],
      nodes: null
    };
    layer.props = M.makeProps(M.DEFS[type] || []);
    const defs = (M.DEFS[type] || []).filter(d => d.key !== 'mat3d');
    for (const d of defs) layer.props[d.key] = { v: Array.isArray(d.def) ? d.def.slice() : d.def, tr: null, ex: null };
    // 三维图层默认包含三维变换
    if (type === 'solid3d' || type === 'camera' || type === 'light' || type === 'particle') layer.threeD = true;
    // 变换属性
    for (const d of TRANSFORM_DEFS) {
      if (d.three && !layer.threeD) continue;
      let def = Array.isArray(d.def) ? d.def.slice() : d.def;
      if (d.key === 'position' && comp) def = [comp.w / 2, comp.h / 2];
      layer.props[d.key] = { v: def, tr: null, ex: null };
    }
    if (type === 'shape') {
      layer.shape = {
        groups: [{
          id: U.uid('grp'), name: '组 1',
          paths: [],
          props: M.makeProps(TRANSFORM_DEFS.map(d => ({ ...d, def: d.key === 'position' ? [0, 0] : d.def })))
        }]
      };
    }
    if (type === 'text') {
      layer.text = {
        content: '文字',
        animator: {
          mode: 'chars', from: 0, to: 100, offset: 0, smoothness: 0,
          position: [0, 0], rotation: 0, scale: 100, opacity: 100,
          enabled: false, startTime: 0, endTime: 1
        }
      };
    }
    if (type === 'precomp') {
      layer.precomp = { compId: null };
    }
    if (type === 'camera') {
      layer.props.camPosition = { v: [0, 0, -2400], tr: null, ex: null };
      layer.props.camPoint = { v: [0, 0, 0], tr: null, ex: null };
    }
    if (type === 'solid3d') {
      layer.solid = { paths: [], pins: [] };
      layer.props.mat3d = { v: null, tr: null, ex: null };
      for (const d of MATERIAL_DEFS) layer.props[d.key] = { v: Array.isArray(d.def) ? d.def.slice() : d.def, tr: null, ex: null };
    }
    if (type === 'particle') {
      layer.emitter = { type: 'point', position: [0, 0, 0], follow: null, surfaceLayer: null, curvePoints: [] };
    }
    if (type === 'audio') {
      layer.sound = { events: [] };
    }
    return layer;
  };

  /* ---------------- 工具 ---------------- */
  M.layerById = function (comp, id) { return comp.layers.find(l => l.id === id); };
  M.layerByName = function (comp, name) { return comp.layers.find(l => l.name === name); };
  M.compById = function (project, id) { return project.comps.find(c => c.id === id); };
  M.activeComp = function (project) {
    return project.comps.find(c => c.id === project.activeComp) || project.comps[0];
  };
  M.layersTopFirst = function (comp) { return comp.layers.slice(); }; // 数组按 AE 顺序：索引 0 在最上层

  /** 复制图层 */
  M.duplicateLayer = function (layer) {
    const c = JSON.parse(JSON.stringify(layer));
    c.id = U.uid('layer');
    c.name = layer.name + ' 副本';
    return c;
  };

  /** 序列化（保持纯 JSON） */
  M.serialize = function (project) {
    return JSON.stringify(project, null, 1);
  };
  M.deserialize = function (json) {
    const p = typeof json === 'string' ? JSON.parse(json) : json;
    if (!p.comps || !p.comps.length) throw new Error('工程数据无效');
    // 兼容：补全缺失字段
    for (const c of p.comps) {
      c.motionBlur = c.motionBlur || { enabled: false, shutter: 180, phase: 50 };
      c.workStart = c.workStart === undefined ? 0 : c.workStart;
      c.workEnd = c.workEnd === undefined ? c.duration : c.workEnd;
      for (const l of c.layers) {
        l.props = l.props || {};
        l.masks = l.masks || [];
        l.effects = l.effects || [];
        l.exprs = l.exprs || {};
      }
    }
    return p;
  };

  M.newId = U.uid;
})(window);
