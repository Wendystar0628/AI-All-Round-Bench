import {
  Composition, Layer, LayerType, Project, Vec2, Vec3, ColorRGBA, PathData,
  ShapeItem, ShapeModifier, MaskItem, LayerEffect, MeshDeformer, PuppetPin,
  ParticleEmitter, AudioPresetKind, AudioEvent, FieldKind, PrimitiveMeshKind,
  NodeGraph, GraphNode, NodeKind, NodePort,
} from './types';
import {
  deepClone, genId, m4ComposeLayer, m4Decompose, m4Identity, m4Invert,
  m4Mul, m4Translate, m4TransformDir, compToWorld, worldToComp,
} from './math';
import { makeProp, makeKeyframe, setPropValueAtTime } from './animation';
import { EvalContext } from './expressions';

// ============================================================================
// Label Colors
// ============================================================================
const LAYER_COLORS: Record<LayerType, string> = {
  shape: '#4ea8de',
  text: '#e05a47',
  null: '#9b72cf',
  adjustment: '#d99b26',
  precomp: '#c77d55',
  camera: '#52b788',
  light: '#f4d35e',
  mesh3d: '#ff8c42',
  particle: '#ff595e',
  audio: '#38b000',
  field: '#00d2ff',
};

// ============================================================================
// Default Shapes, Masks, Effects, Deformers
// ============================================================================
export function makeRectPath(w: number, h: number): PathData {
  const hw = w * 0.5, hh = h * 0.5;
  return {
    contours: [{
      id: genId('cnt'),
      closed: true,
      vertices: [
        { x: -hw, y: -hh, inX: 0, inY: 0, outX: 0, outY: 0 },
        { x: hw, y: -hh, inX: 0, inY: 0, outX: 0, outY: 0 },
        { x: hw, y: hh, inX: 0, inY: 0, outX: 0, outY: 0 },
        { x: -hw, y: hh, inX: 0, inY: 0, outX: 0, outY: 0 },
      ],
    }],
  };
}

export function makeEllipsePath(rx: number, ry: number): PathData {
  const k = 0.55228475;
  return {
    contours: [{
      id: genId('cnt'),
      closed: true,
      vertices: [
        { x: 0, y: -ry, inX: -rx * k, inY: 0, outX: rx * k, outY: 0 },
        { x: rx, y: 0, inX: 0, inY: -ry * k, outX: 0, outY: ry * k },
        { x: 0, y: ry, inX: rx * k, inY: 0, outX: -rx * k, outY: 0 },
        { x: -rx, y: 0, inX: 0, inY: ry * k, outX: 0, outY: -ry * k },
      ],
    }],
  };
}

export function makeRingPath(outerR: number, innerR: number): PathData {
  const outer = makeEllipsePath(outerR, outerR).contours[0];
  const inner = makeEllipsePath(innerR, innerR).contours[0];
  // Reverse inner winding for hole
  inner.vertices.reverse();
  for (const v of inner.vertices) {
    const tx = v.inX, ty = v.inY;
    v.inX = v.outX; v.inY = v.outY;
    v.outX = tx; v.outY = ty;
  }
  inner.isHole = true;
  return { contours: [outer, inner] };
}

export function createShapeItem(kind: ShapeItem['kind'], name?: string): ShapeItem {
  const defaultNames: Record<ShapeItem['kind'], string> = {
    rect: '矩形',
    ellipse: '椭圆',
    path: '贝塞尔路径',
    star: '多边形星形',
  };
  return {
    id: genId('shp'),
    name: name || defaultNames[kind],
    kind,
    visible: true,
    position: makeProp('position', '图形位置', 'vec2', [0, 0]),
    size: makeProp('size', '尺寸', 'vec2', [220, 220], { min: 1, max: 4000 }),
    roundness: makeProp('roundness', '圆角', 'scalar', 0, { min: 0, max: 500 }),
    points: 5,
    innerRadius: makeProp('innerRadius', '内半径', 'scalar', 55, { min: 5, max: 1000 }),
    path: makeProp('path', '路径轮廓', 'path', kind === 'ellipse' ? makeEllipsePath(110, 110) : makeRectPath(200, 200)),
  };
}

export function createShapeModifier(type: ShapeModifier['type']): ShapeModifier {
  if (type === 'trim') {
    return {
      id: genId('mod'),
      type: 'trim',
      name: '修剪路径',
      enabled: true,
      start: makeProp('start', '起点', 'scalar', 0, { min: 0, max: 100, unit: '%' }),
      end: makeProp('end', '终点', 'scalar', 100, { min: 0, max: 100, unit: '%' }),
      offset: makeProp('offset', '偏移', 'scalar', 0, { min: -3600, max: 3600, unit: '°' }),
    };
  }
  if (type === 'repeater') {
    return {
      id: genId('mod'),
      type: 'repeater',
      name: '重复器',
      enabled: true,
      copies: makeProp('copies', '副本数', 'scalar', 4, { min: 1, max: 60, step: 1 }),
      offsetIndex: makeProp('offsetIndex', '偏移序号', 'scalar', 0, { min: -30, max: 30 }),
      repPosition: makeProp('repPosition', '偏移位移', 'vec2', [60, 0]),
      repScale: makeProp('repScale', '缩放递变', 'vec2', [100, 100]),
      repRotation: makeProp('repRotation', '旋转递变', 'scalar', 15, { unit: '°' }),
      repOpacityStart: makeProp('repOpacityStart', '起始不透明度', 'scalar', 100, { min: 0, max: 100 }),
      repOpacityEnd: makeProp('repOpacityEnd', '结束不透明度', 'scalar', 60, { min: 0, max: 100 }),
    };
  }
  return {
    id: genId('mod'),
    type: 'boolean',
    name: '布尔运算',
    enabled: true,
    boolOp: 'difference',
  };
}

export function createMask(kind: MaskItem['kind'] = 'rect', w = 320, h = 240): MaskItem {
  const path = kind === 'ellipse' ? makeEllipsePath(w * 0.5, h * 0.5) : makeRectPath(w, h);
  return {
    id: genId('msk'),
    name: kind === 'ellipse' ? '椭圆蒙版' : kind === 'path' ? '路径蒙版' : '矩形蒙版',
    enabled: true,
    kind,
    mode: 'add',
    inverted: false,
    opacity: makeProp('opacity', '蒙版不透明度', 'scalar', 100, { min: 0, max: 100, unit: '%' }),
    feather: makeProp('feather', '蒙版羽化', 'scalar', 0, { min: 0, max: 200, unit: 'px' }),
    path: makeProp('path', '蒙版路径', 'path', path),
  };
}

export function createEffect(type: LayerEffect['type']): LayerEffect {
  if (type === 'gaussianBlur') {
    return {
      id: genId('fx'),
      type: 'gaussianBlur',
      name: '高斯模糊',
      enabled: true,
      blurRadius: makeProp('blurRadius', '模糊半径', 'scalar', 12, { min: 0, max: 120, unit: 'px' }),
    };
  }
  if (type === 'glow') {
    return {
      id: genId('fx'),
      type: 'glow',
      name: '发光',
      enabled: true,
      glowThreshold: makeProp('glowThreshold', '阈值', 'scalar', 0.45, { min: 0, max: 1, step: 0.02 }),
      glowRadius: makeProp('glowRadius', '发光半径', 'scalar', 24, { min: 0, max: 120, unit: 'px' }),
      glowIntensity: makeProp('glowIntensity', '发光强度', 'scalar', 1.4, { min: 0, max: 6, step: 0.05 }),
      glowColor: makeProp('glowColor', '发光染色', 'color', [1, 0.78, 0.42, 1]),
    };
  }
  if (type === 'dropShadow') {
    return {
      id: genId('fx'),
      type: 'dropShadow',
      name: '投影',
      enabled: true,
      shadowColor: makeProp('shadowColor', '阴影颜色', 'color', [0, 0, 0, 1]),
      shadowOpacity: makeProp('shadowOpacity', '阴影不透明度', 'scalar', 70, { min: 0, max: 100, unit: '%' }),
      shadowAngle: makeProp('shadowAngle', '角度', 'scalar', 135, { min: -360, max: 360, unit: '°' }),
      shadowDistance: makeProp('shadowDistance', '距离', 'scalar', 16, { min: 0, max: 200, unit: 'px' }),
      shadowBlur: makeProp('shadowBlur', '柔和度', 'scalar', 18, { min: 0, max: 120, unit: 'px' }),
    };
  }
  return {
    id: genId('fx'),
    type: 'hsl',
    name: '色相/饱和度/亮度',
    enabled: true,
    hue: makeProp('hue', '色相', 'scalar', 0, { min: -180, max: 180, unit: '°' }),
    saturation: makeProp('saturation', '饱和度', 'scalar', 0, { min: -100, max: 100 }),
    lightness: makeProp('lightness', '亮度', 'scalar', 0, { min: -100, max: 100 }),
  };
}

export function createDeformer(type: MeshDeformer['type']): MeshDeformer {
  if (type === 'bend') {
    return {
      id: genId('def'),
      type: 'bend',
      name: '弯曲变形',
      enabled: true,
      amount: makeProp('amount', '弯曲角度', 'scalar', 35, { min: -360, max: 360, unit: '°' }),
      axis: 'y',
      centerOffset: makeProp('centerOffset', '中心偏移', 'scalar', 0, { min: -500, max: 500 }),
    };
  }
  if (type === 'twist') {
    return {
      id: genId('def'),
      type: 'twist',
      name: '扭转变形',
      enabled: true,
      amount: makeProp('amount', '扭转角度', 'scalar', 45, { min: -720, max: 720, unit: '°' }),
      axis: 'y',
      centerOffset: makeProp('centerOffset', '中心偏移', 'scalar', 0, { min: -500, max: 500 }),
    };
  }
  if (type === 'field') {
    return {
      id: genId('def'),
      type: 'field',
      name: '空间场变形',
      enabled: true,
      fieldLayerIds: [],
      fieldBlend: 'add',
      fieldStrength: makeProp('fieldStrength', '变形强度', 'scalar', 1.0, { min: -5, max: 5, step: 0.05 }),
      displaceMode: 'dent',
    };
  }
  return {
    id: genId('def'),
    type: 'puppet',
    name: '图钉变形',
    enabled: true,
    pins: [],
  };
}

export function createPuppetPin(x: number, y: number, index = 1): PuppetPin {
  return {
    id: genId('pin'),
    name: `图钉 ${index}`,
    restPos: [x, y],
    position: makeProp('position', '图钉位置', 'vec2', [x, y]),
    rotation: makeProp('rotation', '图钉旋转', 'scalar', 0, { min: -360, max: 360, unit: '°' }),
    scale: makeProp('scale', '图钉缩放', 'scalar', 100, { min: 10, max: 400, unit: '%' }),
    radius: 140,
  };
}

export function createDefaultEmitter(name = '发射器 1'): ParticleEmitter {
  return {
    id: genId('emt'),
    name,
    enabled: true,
    sourceKind: 'point',
    position: makeProp('position', '发射位置', 'vec3', [0, 0, 0]),
    rate: makeProp('rate', '发射速率', 'scalar', 60, { min: 0, max: 2000 }),
    burst: makeProp('burst', '瞬发爆发', 'scalar', 0, { min: 0, max: 1500 }),
    speed: makeProp('speed', '初速度', 'scalar', 260, { min: 0, max: 3000 }),
    speedVar: 0.35,
    direction: makeProp('direction', '主方向', 'vec3', [0, 1, 0.2]),
    spread: makeProp('spread', '扩散角', 'scalar', 45, { min: 0, max: 180, unit: '°' }),
    normalBoost: 0.8,
    inheritVelocity: 0.35,
    life: makeProp('life', '寿命', 'scalar', 1.6, { min: 0.05, max: 12, unit: 's' }),
    lifeVar: 0.3,
    sizeStart: makeProp('sizeStart', '初始大小', 'scalar', 8, { min: 0.5, max: 120 }),
    sizeEnd: makeProp('sizeEnd', '结束大小', 'scalar', 1.5, { min: 0, max: 120 }),
    colorStart: makeProp('colorStart', '初始颜色', 'color', [1.0, 0.94, 0.72, 1]),
    colorMid: makeProp('colorMid', '中期颜色', 'color', [1.0, 0.48, 0.1, 1]),
    colorEnd: makeProp('colorEnd', '消退颜色', 'color', [0.45, 0.08, 0.02, 1]),
    opacityStart: 1.0,
    opacityEnd: 0.0,
    seed: 1024,
    emissiveBoost: 2.2,
  };
}

// ============================================================================
// Layer Factory (all 11 layer types)
// ============================================================================
export function createLayer(
  comp: Composition,
  type: LayerType,
  name?: string,
  opts?: {
    sourceLayerId?: string;
    primitiveKind?: PrimitiveMeshKind;
    compId?: string;
    fieldKind?: FieldKind;
    audioPreset?: AudioPresetKind;
    lightType?: 'directional' | 'point';
    text?: string;
  }
): Layer {
  const defaultLabels: Record<LayerType, string> = {
    shape: '形状图层',
    text: '文字图层',
    null: '空对象',
    adjustment: '调整图层',
    precomp: '预合成',
    camera: '摄像机',
    light: opts?.lightType === 'point' ? '点光源' : '平行光',
    mesh3d: '三维几何',
    particle: '粒子系统',
    audio: '音色图层',
    field: '空间场',
  };

  const count = comp.layers.filter((l) => l.type === type).length + 1;
  const cx = comp.width * 0.5;
  const cy = comp.height * 0.5;
  const is3D = type === 'camera' || type === 'light' || type === 'mesh3d' || type === 'particle' || type === 'field';

  const base: Layer = {
    id: genId('lyr'),
    name: name || `${defaultLabels[type]} ${count}`,
    type,
    visible: true,
    locked: false,
    solo: false,
    is3D,
    motionBlur: type === 'mesh3d' || type === 'shape' || type === 'text' || type === 'precomp',
    labelColor: LAYER_COLORS[type],
    parentId: null,
    inPoint: 0,
    outPoint: comp.duration,
    startTime: 0,
    blendMode: 'normal',
    trackMatte: 'none',
    transform: {
      anchor: makeProp('anchor', '锚点', 'vec3', [0, 0, 0]),
      position: makeProp('position', '位置', 'vec3', is3D ? [0, 0, 0] : [cx, cy, 0]),
      scale: makeProp('scale', '缩放', 'vec3', [100, 100, 100], { unit: '%' }),
      rotation: makeProp('rotation', '旋转', 'vec3', [0, 0, 0], { unit: '°' }),
      opacity: makeProp('opacity', '不透明度', 'scalar', 100, { min: 0, max: 100, unit: '%' }),
    },
    masks: [],
    effects: [],
  };

  if (type === 'shape') {
    base.shape = {
      items: [createShapeItem('rect', '矩形 1')],
      fillEnabled: true,
      fillColor: makeProp('fillColor', '填充颜色', 'color', [0.88, 0.44, 0.16, 1]),
      fillOpacity: makeProp('fillOpacity', '填充不透明度', 'scalar', 100, { min: 0, max: 100, unit: '%' }),
      strokeEnabled: true,
      strokeColor: makeProp('strokeColor', '描边颜色', 'color', [1, 0.85, 0.6, 1]),
      strokeWidth: makeProp('strokeWidth', '描边宽度', 'scalar', 4, { min: 0, max: 120, unit: 'px' }),
      strokeOpacity: makeProp('strokeOpacity', '描边不透明度', 'scalar', 100, { min: 0, max: 100, unit: '%' }),
      strokeCap: 'round',
      strokeJoin: 'round',
      modifiers: [],
      puppetPins: [],
    };
  } else if (type === 'text') {
    base.text = {
      text: opts?.text ?? '锻',
      fontId: 'noto-serif-sc',
      fontSize: makeProp('fontSize', '字号', 'scalar', 220, { min: 12, max: 900, unit: 'px' }),
      lineHeight: makeProp('lineHeight', '行距', 'scalar', 1.25, { min: 0.6, max: 3, step: 0.05 }),
      letterSpacing: makeProp('letterSpacing', '字距', 'scalar', 8, { min: -100, max: 300, unit: 'px' }),
      align: 'center',
      fillEnabled: true,
      fillColor: makeProp('fillColor', '文字填充', 'color', [0.96, 0.89, 0.78, 1]),
      strokeEnabled: false,
      strokeColor: makeProp('strokeColor', '文字描边', 'color', [1, 0.55, 0.15, 1]),
      strokeWidth: makeProp('strokeWidth', '描边宽度', 'scalar', 3, { min: 0, max: 40, unit: 'px' }),
      writeOnEnabled: false,
      writeOnProgress: makeProp('writeOnProgress', '笔画书写进度', 'scalar', 100, { min: 0, max: 100, unit: '%' }),
      writeOnFeather: makeProp('writeOnFeather', '笔画重叠', 'scalar', 0.25, { min: 0, max: 1, step: 0.05 }),
      writeOnGlowColor: makeProp('writeOnGlowColor', '笔锋焰色', 'color', [1.0, 0.65, 0.18, 1]),
      animators: [],
      puppetPins: [],
    };
  } else if (type === 'precomp') {
    base.precomp = {
      compId: opts?.compId || '',
      timeRemapEnabled: false,
      timeRemap: makeProp('timeRemap', '时间重映射', 'scalar', 0, { min: 0, max: 120, unit: 's' }),
    };
  } else if (type === 'camera') {
    base.transform.position.value = [0, 80, 720];
    base.camera = {
      target: makeProp('target', '目标点', 'vec3', [0, 0, 0]),
      fov: makeProp('fov', '视角 FOV', 'scalar', 38, { min: 10, max: 110, unit: '°' }),
      focalDistance: makeProp('focalDistance', '对焦距离', 'scalar', 720, { min: 20, max: 5000 }),
      aperture: makeProp('aperture', '光圈景深', 'scalar', 18, { min: 0, max: 100 }),
      dofEnabled: true,
      nearClip: 10,
      farClip: 6000,
    };
  } else if (type === 'light') {
    const lt = opts?.lightType ?? 'directional';
    base.transform.position.value = lt === 'directional' ? [340, 480, 420] : [-180, 120, 220];
    base.light = {
      lightType: lt,
      color: makeProp('color', '灯光颜色', 'color', lt === 'directional' ? [1.0, 0.95, 0.88, 1] : [1.0, 0.45, 0.12, 1]),
      intensity: makeProp('intensity', '光强', 'scalar', lt === 'directional' ? 2.4 : 3.2, { min: 0, max: 20, step: 0.1 }),
      target: makeProp('target', '光照目标', 'vec3', [0, 0, 0]),
      range: makeProp('range', '作用范围', 'scalar', 900, { min: 50, max: 4000 }),
      castShadow: lt === 'directional',
      shadowBias: 0.0025,
      shadowSoftness: 2.0,
    };
  } else if (type === 'mesh3d') {
    const srcType = opts?.sourceLayerId ? 'layer' : 'primitive';
    base.mesh3d = {
      sourceType: srcType,
      sourceLayerId: opts?.sourceLayerId,
      primitiveKind: opts?.primitiveKind ?? 'box',
      primitiveSize: makeProp('primitiveSize', '实体尺寸', 'vec3', [180, 180, 180]),
      extrudeDepth: makeProp('extrudeDepth', '挤出深度', 'scalar', 68, { min: 0, max: 500 }),
      bevelSize: makeProp('bevelSize', '倒角尺寸', 'scalar', 6.5, { min: 0, max: 40, step: 0.5 }),
      bevelSegments: 3,
      curveSubdivisions: 8,
      revealProgress: makeProp('revealProgress', '三维生成进度', 'scalar', 100, { min: 0, max: 100, unit: '%' }),
      material: {
        baseColor: makeProp('baseColor', '基础色', 'color', [0.58, 0.61, 0.66, 1]),
        metallic: makeProp('metallic', '金属度', 'scalar', 0.92, { min: 0, max: 1, step: 0.02 }),
        roughness: makeProp('roughness', '粗糙度', 'scalar', 0.28, { min: 0.04, max: 1, step: 0.02 }),
        emissiveColor: makeProp('emissiveColor', '自发光色', 'color', [1.0, 0.34, 0.04, 1]),
        emissiveIntensity: makeProp('emissiveIntensity', '发光强度', 'scalar', 0, { min: 0, max: 8, step: 0.05 }),
        opacity: makeProp('opacity', '材质不透明度', 'scalar', 1, { min: 0, max: 1, step: 0.02 }),
        heatColor: makeProp('heatColor', '受击炽热色', 'color', [1.0, 0.52, 0.08, 1]),
        heatIntensity: makeProp('heatIntensity', '受击炽热强度', 'scalar', 0, { min: 0, max: 8, step: 0.1 }),
      },
      castShadow: true,
      receiveShadow: true,
      deformers: [],
      interiorSubdiv: 26,
    };
  } else if (type === 'particle') {
    base.particle = {
      emitters: [createDefaultEmitter('主发射器')],
      gravity: makeProp('gravity', '重力', 'vec3', [0, -420, 0]),
      directionalForce: makeProp('directionalForce', '方向风力', 'vec3', [0, 0, 0]),
      drag: makeProp('drag', '空气阻力', 'scalar', 0.35, { min: 0, max: 8, step: 0.05 }),
      attractors: [],
      fieldLayerIds: [],
      colliderLayerIds: [],
      restitution: makeProp('restitution', '碰撞弹性', 'scalar', 0.55, { min: 0, max: 1, step: 0.05 }),
      friction: makeProp('friction', '碰撞摩擦', 'scalar', 0.22, { min: 0, max: 1, step: 0.05 }),
      onCollisionColor: [1.0, 0.95, 0.65, 1],
      onCollisionColorMix: 0.65,
      onCollisionLifeMult: 0.8,
      subEmitOnCollision: true,
      subEmitCount: 3,
      subEmitSpeed: 130,
      subEmitLife: 0.45,
      subEmitSize: 3.5,
      subEmitColor: [1.0, 0.72, 0.22, 1],
      trailsEnabled: true,
      trailLength: makeProp('trailLength', '拖尾时长', 'scalar', 0.14, { min: 0.01, max: 1.5, step: 0.01, unit: 's' }),
      trailWidth: makeProp('trailWidth', '拖尾宽度', 'scalar', 2.8, { min: 0.5, max: 30 }),
      trailColor: makeProp('trailColor', '拖尾颜色', 'color', [1.0, 0.58, 0.16, 1]),
      trailFade: 1.6,
      maxParticles: 1800,
      simFps: 60,
    };
  } else if (type === 'audio') {
    const preset = opts?.audioPreset ?? 'forgeStrike';
    base.audio = {
      preset,
      gain: makeProp('gain', '音量增益', 'scalar', 0.85, { min: 0, max: 2, step: 0.05 }),
      pitchShift: makeProp('pitchShift', '音高偏移', 'scalar', 0, { min: -24, max: 24, step: 1, unit: 'st' }),
      filterCutoff: makeProp('filterCutoff', '滤波截止', 'scalar', 4200, { min: 100, max: 12000, unit: 'Hz' }),
      decay: makeProp('decay', '衰减时长', 'scalar', 1.4, { min: 0.05, max: 6, step: 0.05, unit: 's' }),
      reverbMix: makeProp('reverbMix', '空间混响', 'scalar', 0.35, { min: 0, max: 1, step: 0.05 }),
      muted: false,
      events: [{ id: genId('snd'), time: 0.5, duration: 1.2, pitch: 110, velocity: 0.9 }],
    };
  } else if (type === 'field') {
    const fk = opts?.fieldKind ?? 'distance';
    base.field = {
      kind: fk,
      radius: makeProp('radius', '影响半径', 'scalar', 180, { min: 10, max: 2000 }),
      falloff: makeProp('falloff', '衰减曲线', 'scalar', 1.6, { min: 0.2, max: 5, step: 0.1 }),
      strength: makeProp('strength', '场强度', 'scalar', 45, { min: -500, max: 500 }),
      direction: makeProp('direction', '场方向/轴向', 'vec3', [0, 0, -1]),
      noiseScale: makeProp('noiseScale', '噪声尺度', 'scalar', 0.012, { min: 0.001, max: 0.1, step: 0.001 }),
      noiseSpeed: makeProp('noiseSpeed', '噪声速率', 'scalar', 1.2, { min: 0, max: 10, step: 0.1 }),
      swirlAngle: makeProp('swirlAngle', '旋涡切向力', 'scalar', 1.2, { min: -5, max: 5, step: 0.1 }),
      pullInward: makeProp('pullInward', '向心拉力', 'scalar', 0.3, { min: -3, max: 3, step: 0.1 }),
      invert: false,
      showGizmo: true,
      gizmoColor: fk === 'vortex' ? [0.25, 0.85, 1.0, 0.7] : fk === 'noise' ? [0.7, 0.4, 1.0, 0.7] : [1.0, 0.55, 0.15, 0.7],
    };
  }

  return base;
}

export function createEmptyComposition(name = '新合成', width = 1280, height = 720, fps = 30, duration = 10): Composition {
  return {
    id: genId('comp'),
    name,
    width,
    height,
    fps,
    duration,
    workAreaStart: 0,
    workAreaEnd: duration,
    bgColor: [0.055, 0.06, 0.072, 1],
    bgTransparent: false,
    motionBlur: false,
    shutterAngle: 180,
    shutterPhase: -90,
    motionBlurSamples: 8,
    layers: [],
    nodeGraph: { nodes: [], edges: [] },
  };
}

export function createEmptyProject(name = '空白工程'): Project {
  const comp = createEmptyComposition('主合成', 1280, 720, 30, 10);
  return {
    version: '1.0',
    name,
    activeCompId: comp.id,
    compositions: [comp],
  };
}

// ============================================================================
// World Transform & Parenting Helpers (2.2)
// ============================================================================

export function evaluateLayerLocalTransform(
  comp: Composition,
  layer: Layer,
  time: number,
  ctx?: EvalContext
) {
  const ec = ctx ?? new EvalContext(comp);
  const anchor = ec.evaluateProp(layer, layer.transform.anchor, 'anchor', time, false) as Vec3;
  const position = ec.evaluateProp(layer, layer.transform.position, 'position', time, true) as Vec3;
  const scale = ec.evaluateProp(layer, layer.transform.scale, 'scale', time, false) as Vec3;
  const rotation = ec.evaluateProp(layer, layer.transform.rotation, 'rotation', time, false) as Vec3;
  const opacity = ec.evaluateProp(layer, layer.transform.opacity, 'opacity', time, false) as number;
  return { anchor, position, scale, rotation, opacity };
}

/**
 * Layer space convention:
 * - For 2D layers (is3D === false): positions are in comp pixels [0..W, 0..H] with +Y down;
 *   we expose BOTH 2D comp-pixel matrix AND 3D unified world matrix!
 * - For 3D layers (is3D === true): positions are in Right-Handed World Space (origin comp center, +Y up, +Z toward camera).
 */
export function getLayerLocalMatrix(
  comp: Composition,
  layer: Layer,
  time: number,
  ctx?: EvalContext
) {
  const tr = evaluateLayerLocalTransform(comp, layer, time, ctx);
  const rot: Vec3 = layer.is3D ? tr.rotation : [0, 0, tr.rotation[2]];
  const scl: Vec3 = layer.is3D ? tr.scale : [tr.scale[0], tr.scale[1], 100];
  return m4ComposeLayer(tr.position, tr.anchor, scl, rot);
}

/** Convert 2D layer position to World Space if a 3D layer parents to a 2D layer or vice versa */
export function getLayerWorldMatrix(
  comp: Composition,
  layer: Layer,
  time: number,
  ctx?: EvalContext,
  visited = new Set<string>()
): Float32Array {
  if (visited.has(layer.id)) return m4Identity();
  visited.add(layer.id);
  const local = getLayerLocalMatrix(comp, layer, time, ctx);
  if (!layer.parentId) return local;
  const parent = comp.layers.find((l) => l.id === layer.parentId);
  if (!parent) return local;
  const pMat = getLayerWorldMatrix(comp, parent, time, ctx, visited);
  return m4Mul(pMat, local);
}

/**
 * Reparent layer (set, change, or clear parent) while preserving exact current screen appearance (2.2).
 */
export function setLayerParentPreserveVisual(
  comp: Composition,
  layer: Layer,
  newParentId: string | null,
  time: number
): void {
  // Prevent self-parenting or cycles
  if (newParentId === layer.id) return;
  let cursor = newParentId;
  while (cursor) {
    if (cursor === layer.id) return;
    const p = comp.layers.find((l) => l.id === cursor);
    cursor = p?.parentId ?? null;
  }

  const ctx = new EvalContext(comp);
  const oldWorld = getLayerWorldMatrix(comp, layer, time, ctx);
  const tr = evaluateLayerLocalTransform(comp, layer, time, ctx);

  let newParentWorld = m4Identity();
  if (newParentId) {
    const newP = comp.layers.find((l) => l.id === newParentId);
    if (newP) newParentWorld = getLayerWorldMatrix(comp, newP, time, ctx);
  }
  const invParent = m4Invert(newParentWorld) ?? m4Identity();
  const desiredLocal = m4Mul(invParent, oldWorld);
  // Undo T(-anchor) on the right so decomposition yields exact T(pos)*R*S
  const trsMat = m4Mul(desiredLocal, m4Translate(tr.anchor[0], tr.anchor[1], tr.anchor[2]));
  const dec = m4Decompose(trsMat);

  layer.parentId = newParentId;
  setPropValueAtTime(layer.transform.position, time, dec.position);
  setPropValueAtTime(layer.transform.rotation, time, layer.is3D ? dec.rotation : [0, 0, dec.rotation[2]]);
  setPropValueAtTime(layer.transform.scale, time, layer.is3D ? dec.scale : [dec.scale[0], dec.scale[1], 100]);
}

/**
 * Move anchor point ONLY while keeping layer's rendered position strictly unchanged (2.2).
 */
export function moveAnchorPreserveVisual(
  comp: Composition,
  layer: Layer,
  newAnchor: Vec3,
  time: number
): void {
  const ctx = new EvalContext(comp);
  const tr = evaluateLayerLocalTransform(comp, layer, time, ctx);
  const da: Vec3 = [
    newAnchor[0] - tr.anchor[0],
    newAnchor[1] - tr.anchor[1],
    newAnchor[2] - tr.anchor[2],
  ];
  const rot: Vec3 = layer.is3D ? tr.rotation : [0, 0, tr.rotation[2]];
  const scl: Vec3 = layer.is3D ? tr.scale : [tr.scale[0], tr.scale[1], 100];
  const rsMat = m4ComposeLayer([0, 0, 0], [0, 0, 0], scl, rot);
  const dPos = m4TransformDir(rsMat, da);
  const newPos: Vec3 = [
    tr.position[0] + dPos[0],
    tr.position[1] + dPos[1],
    tr.position[2] + dPos[2],
  ];
  setPropValueAtTime(layer.transform.anchor, time, newAnchor);
  setPropValueAtTime(layer.transform.position, time, newPos);
}

/**
 * In-Place Precompose (2.10, Ctrl+Shift+C):
 * Moves selected layers into a new child Composition preserving exact visuals at ALL timestamps
 * including external parent animations, soft edges, and semi-transparency!
 */
export function precomposeLayers(
  project: Project,
  comp: Composition,
  selectedIds: string[],
  newName?: string
): { newComp: Composition; precompLayer: Layer } | null {
  if (selectedIds.length === 0) return null;
  const selSet = new Set(selectedIds);
  const orderedSelected = comp.layers.filter((l) => selSet.has(l.id));
  if (orderedSelected.length === 0) return null;

  const firstIdx = comp.layers.findIndex((l) => selSet.has(l.id));
  const subComp = createEmptyComposition(
    newName || `预合成 ${project.compositions.length + 1}`,
    comp.width,
    comp.height,
    comp.fps,
    comp.duration
  );
  subComp.bgTransparent = true; // Preserve alpha, soft edges & translucency!
  subComp.bgColor = [0, 0, 0, 0];
  subComp.motionBlur = comp.motionBlur;
  subComp.shutterAngle = comp.shutterAngle;
  subComp.shutterPhase = comp.shutterPhase;

  // Also carry over active camera & lights if any selected layer is 3D so 3D look matches identically!
  const has3D = orderedSelected.some((l) => l.is3D);

  // Collect external ancestors needed so parent animation inside precomp stays 100% identical
  const neededExternalAncestors = new Set<string>();
  const collectAncestors = (pid: string | null) => {
    let cur = pid;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (!selSet.has(cur)) neededExternalAncestors.add(cur);
      const pl = comp.layers.find((l) => l.id === cur);
      cur = pl?.parentId ?? null;
    }
  };
  for (const l of orderedSelected) collectAncestors(l.parentId);

  const movedLayers = orderedSelected.map((l) => deepClone(l));
  const proxyAncestors: Layer[] = [];
  for (const ancId of neededExternalAncestors) {
    const orig = comp.layers.find((l) => l.id === ancId);
    if (!orig) continue;
    const proxy = deepClone(orig);
    proxy.visible = false; // Invisible rig ancestor preserving parent transform identically!
    proxy.type = 'null';
    proxy.name = `[父级代理] ${orig.name}`;
    delete proxy.shape; delete proxy.text; delete proxy.mesh3d; delete proxy.particle;
    proxyAncestors.push(proxy);
  }

  // If 3D layers are precomposed without selecting camera/lights, clone camera & lights so projection/lighting match
  const envClones: Layer[] = [];
  if (has3D) {
    for (const l of comp.layers) {
      if (!selSet.has(l.id) && (l.type === 'camera' || l.type === 'light')) {
        envClones.push(deepClone(l));
      }
    }
  }

  subComp.layers = [...movedLayers, ...proxyAncestors, ...envClones];
  project.compositions.push(subComp);

  // Create the Precomp Layer in parent comp at the exact position of the topmost selected layer
  const preLayer = createLayer(comp, 'precomp', subComp.name, { compId: subComp.id });
  preLayer.is3D = false;
  preLayer.transform.position.value = [comp.width * 0.5, comp.height * 0.5, 0];
  preLayer.inPoint = Math.min(...orderedSelected.map((l) => l.inPoint));
  preLayer.outPoint = Math.max(...orderedSelected.map((l) => l.outPoint));

  // Remove selected layers from parent comp & insert precomp layer
  comp.layers = comp.layers.filter((l) => !selSet.has(l.id));
  comp.layers.splice(Math.min(firstIdx, comp.layers.length), 0, preLayer);

  return { newComp: subComp, precompLayer: preLayer };
}

// ============================================================================
// Procedural Node Factory (2.7)
// ============================================================================
export function createGraphNode(kind: NodeKind, x: number, y: number, title?: string): GraphNode {
  const specs: Record<NodeKind, { title: string; inputs: NodePort[]; outputs: NodePort[]; params: Record<string, any> }> = {
    sourceShape: {
      title: '形状源',
      inputs: [],
      outputs: [{ id: 'path', name: '路径', dataType: 'path', direction: 'out' }],
      params: { layerId: '' },
    },
    sourceText: {
      title: '文字字形源',
      inputs: [],
      outputs: [
        { id: 'path', name: '字形轮廓', dataType: 'path', direction: 'out' },
        { id: 'strokes', name: '笔画轮廓', dataType: 'path', direction: 'out' },
      ],
      params: { layerId: '' },
    },
    strokeWriteOn: {
      title: '笔画书写',
      inputs: [
        { id: 'path', name: '源路径', dataType: 'path', direction: 'in' },
        { id: 'progress', name: '进度', dataType: 'scalar', direction: 'in', defaultValue: 100 },
      ],
      outputs: [{ id: 'path', name: '书写路径', dataType: 'path', direction: 'out' }],
      params: { layerId: '', progress: 100, feather: 0.2 },
    },
    primitivePath: {
      title: '程序图形',
      inputs: [
        { id: 'size', name: '尺寸', dataType: 'scalar', direction: 'in', defaultValue: 180 },
      ],
      outputs: [{ id: 'path', name: '路径', dataType: 'path', direction: 'out' }],
      params: { shape: 'ring', width: 180, height: 180, innerRatio: 0.55, sides: 6 },
    },
    primitiveMesh: {
      title: '三维基础体',
      inputs: [],
      outputs: [{ id: 'mesh', name: '三维几何', dataType: 'mesh', direction: 'out' }],
      params: { kind: 'box', width: 200, height: 80, depth: 200 },
    },
    pathTransform: {
      title: '路径变换',
      inputs: [
        { id: 'path', name: '路径', dataType: 'path', direction: 'in' },
        { id: 'offset', name: '偏移', dataType: 'vec3', direction: 'in', defaultValue: [0, 0, 0] },
        { id: 'scale', name: '缩放', dataType: 'scalar', direction: 'in', defaultValue: 1 },
        { id: 'rotation', name: '旋转', dataType: 'scalar', direction: 'in', defaultValue: 0 },
      ],
      outputs: [{ id: 'path', name: '变换路径', dataType: 'path', direction: 'out' }],
      params: { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 },
    },
    trimPath: {
      title: '修剪路径',
      inputs: [
        { id: 'path', name: '路径', dataType: 'path', direction: 'in' },
        { id: 'start', name: '起点%', dataType: 'scalar', direction: 'in', defaultValue: 0 },
        { id: 'end', name: '终点%', dataType: 'scalar', direction: 'in', defaultValue: 100 },
      ],
      outputs: [{ id: 'path', name: '修剪结果', dataType: 'path', direction: 'out' }],
      params: { start: 0, end: 100, offset: 0 },
    },
    repeater: {
      title: '阵列重复',
      inputs: [
        { id: 'path', name: '路径', dataType: 'path', direction: 'in' },
        { id: 'copies', name: '数量', dataType: 'scalar', direction: 'in', defaultValue: 5 },
      ],
      outputs: [{ id: 'path', name: '阵列路径', dataType: 'path', direction: 'out' }],
      params: { copies: 5, dx: 45, dy: 0, rotation: 18, scaleStep: 0.94 },
    },
    booleanOp: {
      title: '布尔运算',
      inputs: [
        { id: 'a', name: '路径 A', dataType: 'path', direction: 'in' },
        { id: 'b', name: '路径 B', dataType: 'path', direction: 'in' },
      ],
      outputs: [{ id: 'path', name: '布尔结果', dataType: 'path', direction: 'out' }],
      params: { op: 'difference' },
    },
    extrude3d: {
      title: '三维挤出',
      inputs: [
        { id: 'path', name: '轮廓路径', dataType: 'path', direction: 'in' },
        { id: 'depth', name: '挤出深度', dataType: 'scalar', direction: 'in', defaultValue: 68 },
        { id: 'bevel', name: '倒角', dataType: 'scalar', direction: 'in', defaultValue: 6 },
      ],
      outputs: [{ id: 'mesh', name: '实体网格', dataType: 'mesh', direction: 'out' }],
      params: { depth: 68, bevel: 6, bevelSegments: 3, interiorSubdiv: 24 },
    },
    fieldGenerator: {
      title: '空间场生成',
      inputs: [
        { id: 'center', name: '中心点', dataType: 'vec3', direction: 'in', defaultValue: [0, 0, 0] },
        { id: 'strength', name: '强度', dataType: 'scalar', direction: 'in', defaultValue: 45 },
        { id: 'radius', name: '半径', dataType: 'scalar', direction: 'in', defaultValue: 180 },
      ],
      outputs: [{ id: 'field', name: '空间场', dataType: 'field', direction: 'out' }],
      params: { fieldKind: 'distance', layerId: '', strength: 45, radius: 180, falloff: 1.5, direction: [0, 0, -1], noiseScale: 0.015 },
    },
    fieldBlend: {
      title: '场混合',
      inputs: [
        { id: 'a', name: '场 A', dataType: 'field', direction: 'in' },
        { id: 'b', name: '场 B', dataType: 'field', direction: 'in' },
        { id: 'mix', name: '混合权重', dataType: 'scalar', direction: 'in', defaultValue: 0.5 },
      ],
      outputs: [{ id: 'field', name: '混合场', dataType: 'field', direction: 'out' }],
      params: { mode: 'add', mix: 0.5 },
    },
    deformMesh: {
      title: '网格变形',
      inputs: [
        { id: 'mesh', name: '输入网格', dataType: 'mesh', direction: 'in' },
        { id: 'field', name: '驱动场', dataType: 'field', direction: 'in' },
        { id: 'amount', name: '强度', dataType: 'scalar', direction: 'in', defaultValue: 1.0 },
      ],
      outputs: [{ id: 'mesh', name: '变形网格', dataType: 'mesh', direction: 'out' }],
      params: { mode: 'field', displaceMode: 'dent', axis: 'y', amount: 1.0 },
    },
    meshTransform: {
      title: '网格变换',
      inputs: [
        { id: 'mesh', name: '网格', dataType: 'mesh', direction: 'in' },
        { id: 'offset', name: '位移', dataType: 'vec3', direction: 'in', defaultValue: [0, 0, 0] },
      ],
      outputs: [{ id: 'mesh', name: '网格', dataType: 'mesh', direction: 'out' }],
      params: { offset: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    },
    mergeMesh: {
      title: '合并网格',
      inputs: [
        { id: 'a', name: '网格 A', dataType: 'mesh', direction: 'in' },
        { id: 'b', name: '网格 B', dataType: 'mesh', direction: 'in' },
      ],
      outputs: [{ id: 'mesh', name: '合并网格', dataType: 'mesh', direction: 'out' }],
      params: {},
    },
    scatterPoints: {
      title: '表面散布',
      inputs: [
        { id: 'mesh', name: '源网格', dataType: 'mesh', direction: 'in' },
        { id: 'instance', name: '实例体', dataType: 'mesh', direction: 'in' },
        { id: 'count', name: '点数', dataType: 'scalar', direction: 'in', defaultValue: 24 },
      ],
      outputs: [{ id: 'mesh', name: '散布实体', dataType: 'mesh', direction: 'out' }],
      params: { count: 24, size: 8, seed: 77 },
    },
    valueScalar: {
      title: '标量参数',
      inputs: [],
      outputs: [{ id: 'out', name: '数值', dataType: 'scalar', direction: 'out' }],
      params: { value: 60 },
    },
    valueVec3: {
      title: '三维向量',
      inputs: [],
      outputs: [{ id: 'out', name: '向量', dataType: 'vec3', direction: 'out' }],
      params: { value: [0, 0, 0] },
    },
    valueColor: {
      title: '颜色参数',
      inputs: [],
      outputs: [{ id: 'out', name: '颜色', dataType: 'color', direction: 'out' }],
      params: { value: [1, 0.5, 0.15, 1] },
    },
    mathOp: {
      title: '数学运算',
      inputs: [
        { id: 'a', name: 'A', dataType: 'scalar', direction: 'in', defaultValue: 1 },
        { id: 'b', name: 'B', dataType: 'scalar', direction: 'in', defaultValue: 1 },
      ],
      outputs: [{ id: 'out', name: '结果', dataType: 'scalar', direction: 'out' }],
      params: { op: 'mul' },
    },
    group: {
      title: '节点组',
      inputs: [{ id: 'in0', name: '输入', dataType: 'mesh', direction: 'in' }],
      outputs: [{ id: 'out0', name: '输出', dataType: 'mesh', direction: 'out' }],
      params: {},
    },
    output: {
      title: '场景输出',
      inputs: [
        { id: 'mesh', name: '几何输出', dataType: 'mesh', direction: 'in' },
        { id: 'field', name: '场输出', dataType: 'field', direction: 'in' },
      ],
      outputs: [
        { id: 'mesh', name: '几何', dataType: 'mesh', direction: 'out' },
        { id: 'field', name: '场', dataType: 'field', direction: 'out' },
      ],
      params: { label: '主输出' },
    },
  };

  const s = specs[kind];
  return {
    id: genId('nd'),
    kind,
    title: title || s.title,
    x,
    y,
    params: deepClone(s.params),
    inputs: deepClone(s.inputs),
    outputs: deepClone(s.outputs),
  };
}

// ============================================================================
// Undo / Redo History Manager (2.14: 1 full drag/input/wiring = 1 step)
// ============================================================================
export class HistoryManager {
  private past: string[] = [];
  private future: string[] = [];
  private maxSteps = 120;
  private txPendingSnapshot: string | null = null;

  public reset(project: Project): void {
    this.past = [JSON.stringify(project)];
    this.future = [];
    this.txPendingSnapshot = null;
  }

  /** Begin a continuous drag/edit transaction (stores state BEFORE drag) */
  public beginTransaction(project: Project): void {
    if (this.txPendingSnapshot === null) {
      this.txPendingSnapshot = JSON.stringify(project);
    }
  }

  /** Commit drag/edit transaction as ONE single undo step if anything actually changed */
  public commitTransaction(project: Project): void {
    const after = JSON.stringify(project);
    if (this.txPendingSnapshot !== null) {
      if (after !== this.txPendingSnapshot) {
        if (this.past.length === 0 || this.past[this.past.length - 1] !== this.txPendingSnapshot) {
          this.past.push(this.txPendingSnapshot);
        }
        this.past.push(after);
        if (this.past.length > this.maxSteps) this.past.shift();
        this.future = [];
      }
      this.txPendingSnapshot = null;
    } else {
      this.pushSnapshot(project);
    }
  }

  /** Push a discrete single-action snapshot */
  public pushSnapshot(project: Project): void {
    const str = JSON.stringify(project);
    if (this.past.length > 0 && this.past[this.past.length - 1] === str) return;
    this.past.push(str);
    if (this.past.length > this.maxSteps) this.past.shift();
    this.future = [];
  }

  public canUndo(): boolean { return this.past.length > 1; }
  public canRedo(): boolean { return this.future.length > 0; }

  public undo(): Project | null {
    if (!this.canUndo()) return null;
    const current = this.past.pop()!;
    this.future.push(current);
    return JSON.parse(this.past[this.past.length - 1]);
  }

  public redo(): Project | null {
    if (!this.canRedo()) return null;
    const next = this.future.pop()!;
    this.past.push(next);
    return JSON.parse(next);
  }
}

// ============================================================================
// Project File Serialization
// ============================================================================
export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export function deserializeProject(json: string): Project {
  const parsed = JSON.parse(json);
  if (!parsed || !Array.isArray(parsed.compositions) || parsed.compositions.length === 0) {
    throw new Error('无效的工程文件格式');
  }
  return parsed as Project;
}
