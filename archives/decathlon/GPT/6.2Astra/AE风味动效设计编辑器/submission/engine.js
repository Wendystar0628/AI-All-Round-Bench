const types = {
  geo: ['三维几何', 'cube', '#ec995c'],
  particle: ['粒子', 'spark', '#bf97da'],
  light: ['灯光', 'sun', '#e4cc76'],
  camera: ['摄像机', 'camera', '#80b8e6'],
  shape: ['形状', 'shape', '#8fa9e7'],
  text: ['文字', 'type', '#c997d6'],
  audio: ['音色', 'wave', '#79c1ac'],
  null: ['空对象', 'axis', '#9babb2'],
  adj: ['调整', 'sliders', '#9e98dd'],
  pre: ['预合成', 'comp', '#a397cd'],
  field: ['空间场', 'vortex', '#a4cb95'],
};
const def = {
  reflection:.37,
  dustOpacity:100,
  fontSize: 1,
  animStart: 0,
  animEnd: 100,
  animOffset: 0,
  animSoft: 8,
  animX: 0,
  animY: 0,
  animRot: 0,
  animScale: 0,
  animOpacity: 100,
  strokeWidth: 0,
  x: 0,
  y: 0,
  z: 0,
  rx: 0,
  ry: 0,
  rz: 0,
  sx: 100,
  sy: 100,
  sz: 100,
  ax: 0,
  ay: 0,
  az: 0,
  opacity: 100,
  depth: 0.47,
  bevel: 0.052,
  metal: 0.81,
  rough: 0.37,
  heat: 0.72,
  bend: 0,
  twist: 0,
  size: 1,
  spacing: 0,
  line: 1.2,
  trim: 100,
  repeat: 1,
  offset: 1,
  rate: 95,
  speed: 3,
  life: 1.45,
  drag: 0.16,
  gravity: 3.4,
  seed: 42,
  trailWidth: 0.008,
  trail: 0.085,
  intensity: 38,
  fov: 34,
  focus: 9,
  aperture: 0.03,
  tx: 0,
  ty: 1.3,
  tz: 0,
  range: 3,
  strength: 0,
  frequency: 110,
  volume: 0.16,
  blur: 0,
  glow: 0,
  hue: 0,
  shadow: 0,
  saturation: 1,
  brightness: 1,
  remap: 0,
};
let uid = 1;
function layer(type, name, extra = {}) {
  return {
    id: 'l' + uid++,
    type,
    name,
    visible: true,
    locked: false,
    in: 0,
    out: 15,
    color: '#843b21',
    p: { ...def },
    keys: {},
    expr: {},
    parent: '',
    source: '',
    shape: 'rect',
    text: '火',
    blend: '正常',
    mask: '无',
    nodes: [],
    ...extra,
    p: {
      ...def,
      ...(['text', 'shape'].includes(type)
        ? { depth: 0.012, bevel: 0.002, heat: 0, metal: 0.16, rough: 0.54 }
        : {}),
      ...extra.p,
    },
  };
}
function key(t, v, mode = 'bezier') {
  return { t, v, mode };
}
function seq(a) {
  return a.map(([t, v]) => key(t, v));
}
function comp(name = '主合成', layers = []) {
  return {
    id: 'c' + uid++,
    name,
    w: 1920,
    h: 1080,
    fps: 30,
    duration: 15,
    start: 0,
    end: 15,
    layers,
    mb: false,
    shutter: 180,
  };
}
function demo() {
  let glyph = layer('geo', '火 · 锻造字块', {
    model: 'glyph',
    material: '熔铸铜',writeMode:'笔画生长',pins:[{x:.22,y:2.89,dx:0,dy:0}],
    p: { y: -0.11 },
    keys: {
      pin0Y: seq([[0,0],[7.92,0],[8.025,-.29],[8.23,-.085],[9.90,-.085],[10.03,-.19],[10.38,-.12]]),
      heat: seq([
        [0, 0.27],
        [3, 0.74],
        [6, 0.95],
        [8.4, 1],
        [10, 0.91],
        [14, 0.04],
      ]),
      depth: seq([
        [0, 0.025],
        [3, 0.035],
        [6, 0.62],
        [15, 0.62],
      ]),
      trim: seq([
        [0, 18],
        [2.9, 100],
      ]),
      bend: seq([
        [0, 0],
        [7.94, 0],
        [8.04, 0.18],
        [8.42, 0.035],
        [9.94, 0],
        [10.04, 0.15],
        [10.45, 0.02],
      ]),
      ry: seq([
        [0, -12],
        [5, -6],
        [8.4, -3],
        [14, 6],
      ]),
    },
    nodes: [
      { id: 'n1', op: '文字轮廓', x: 35, y: 48 },
      { id: 'n2', op: '挤出实体', x: 235, y: 48, input: 'n1' },
      { id: 'n3', op: '几何输出', x: 435, y: 48, input: 'n2' },
    ],
  });
  let spark = layer('particle', '飞溅火星', {
    source: glyph.id,
    color: '#ff9c36',
    keys: {
      rate: seq([
        [0, 6],
        [5, 25],
        [7.92, 18],
        [7.99, 275],
        [8.7, 115],
        [9.88, 22],[10.00, 142],
        [11, 95],
        [12.45, 0],
      ]),
    },
  });
  let hammer = layer('geo', '锻造锤', {
    model: 'hammer',
    color: '#4d4947',
    in: 6.7,
    out: 10.6,
    p: { x: 0.55, y: 4.85, z: 0.1, size: 0.87, heat: 0.03 },
    keys: {
      rz:seq([[6.7,19],[7.62,23],[7.99,-4],[8.25,9],[9.7,17],[10,-2],[10.5,12]]),
      y: seq([
        [6.7, 5.5],
        [7.32,4.06],[7.65,4.48],
        [7.99, 3.02],
        [8.22, 4.7],
        [8.55, 5.5],
        [9.65, 4.9],
        [10.0, 3.08],
        [10.45, 5.5],
      ]),
    },
  });
  spark.impactTarget=hammer.id; spark.secondary=true;
  let base = layer('geo', '玄武岩锻台', { model: 'stage', color: '#353641', p: { heat: 0.05 } }),
    light = layer('light', '炉膛暖光', {
      color: '#ffa668',
      p: { x: -2.8, y: 4.5, z: 3, intensity: 45 },keys:{intensity:seq([[0,24],[6.5,42],[7.94,42],[8.02,72],[8.4,48],[10,52],[14,26]]),green:seq([[0,172],[9,151],[14,216]]),blue:seq([[0,112],[9,87],[14,207]])},
    }),
    cam = layer('camera', '主摄像机', {
      p: { x: 3.85, y: 3.12, z: 7.3, ty: 1.45, fov: 34.5, focus: 8.25, aperture: 0.047 },
      keys: {
        fov:seq([[0,33.5],[6,34.5],[7.63,38],[7.99,36.4],[8.4,34.5],[10.15,35.7],[14,34.2]]),
        x: seq([
          [0, 1.84],
          [5, 3.2],
          [10.3, 3.95],
          [14, 3.45],
        ]),
        ty:seq([[0,1.45],[7.92,1.45],[8.04,1.34],[8.23,1.48],[8.55,1.45],[9.94,1.45],[10.05,1.39],[10.33,1.45]]),
        z: seq([
          [0, 8.6],
          [6, 7.8],
          [8, 7.25],
          [11, 7.55],
          [14, 8.05],
        ]),
      },
    });
  let sound = layer('audio', '锻击声场', {
      instrument: '锻炉合奏',
      color: '#6db9a1',
      notes: [
        [0, 55, 2],
        [3, 82, 1.8],
        [6, 110, 1.4],
        [7.98, 55, 0.6],
        [9.98, 65, 0.7],
        [12, 82, 2],
      ],
    }),
    label = layer('text', '画面题签', {
      model: 'caption',
      text: '锻字',
      color: '#efe1c5',
      labelTop: 'FORGE STUDY',
      labelSub: 'FORGED IN FIRE',
      labelCode: 'FF — 001',
    }),
    air = layer('geo', '炉室环境', {
      model: 'air',keys:{dustOpacity:seq([[0,16],[5,34],[7.95,45],[8.08,100],[10,80],[12.8,0]])},
      expr: { heat: 'thisComp.layer("火 · 锻造字块").transform.heat' },
    });
  let c = comp('锻字 · 主合成', [glyph, spark, hammer, base, sound, light, cam, label, air]);
  c.markers = [
    { t: 0, name: '写成' },
    { t: 3, name: '成块' },
    { t: 7, name: '锻打' },
    { t: 11, name: '冷却' },
  ];
  return {
    name: '锻字 · 动效研究',
    comps: [c],
    active: c.id,
    palette: ['#e9e0ce', '#ffc164', '#ef7230', '#85422b', '#343537', '#181a1c'],
  };
}
let P = demo(),
  C = () => P.comps.find((c) => c.id === P.active) || P.comps[0],
  L = () => C().layers,
  S = new Set([L()[0].id]),
  sel = () => L().find((l) => S.has(l.id)),
  T = 8.4,
  playing = false,
  exporting = false,
  historyStack = [],
  redoStack = [],
  dirty = false,
  version = 0,
  errors = {},
  cache = new Map();
function record() {
  historyStack.push(JSON.stringify(P));
  if (historyStack.length > 80) historyStack.shift();
  redoStack = [];
  dirty = true;
  version++;
}
function restored() {
  version++;
  S = new Set([L()[0]?.id]);
  T = Math.min(T, C().duration);
  drawUI();
  refresh();
}
function undo(redo = false) {
  let a = redo ? redoStack : historyStack,
    b = redo ? historyStack : redoStack;
  if (!a.length) return;
  b.push(JSON.stringify(P));
  P = JSON.parse(a.pop());
  restored();
}
function changed() {
  version++;
  dirty = true;
  drawUI();
  refresh();
}
function basePlain(l, k, t) {
  let a = l.keys[k];
  if (!a?.length) {
    if (['red', 'green', 'blue'].includes(k) && l.p[k] === undefined)
      return (
        parseInt(
          l.color.slice(
            1 + ['red', 'green', 'blue'].indexOf(k) * 2,
            3 + ['red', 'green', 'blue'].indexOf(k) * 2,
          ),
          16,
        ) || 0
      );
    return l.p[k] ?? 0;
  }
  if (t <= a[0].t) return a[0].v;
  for (let i = 1; i < a.length; i++)
    if (t <= a[i].t) {
      let prev = a[i - 1],
        u = (t - prev.t) / (a[i].t - prev.t);
      u = timedEase(prev, a[i], u);
      return prev.v + (a[i].v - prev.v) * u;
    }
  return a.at(-1).v;
}
function val(l, k, t = T, stack = []) {
  if (!l) return 0;
  if (l.proxy) {
    let source = P.comps.flatMap((c) => c.layers).find((a) => a.id === l.proxy);
    if (source && !source.proxy) return val(source, k, t, stack);
  }
  let v = base(l, k, t),
    ex = l.expr[k];
  if (!ex) return v;
  let id = l.id + ':' + k;
  try {
    if (stack.includes(id) || stack.length > 30) throw Error('属性循环引用');
    let next = [...stack, id],
      prop = (ob, key) => {
        let names = { rotation: 'rz', opacity: 'opacity', xPosition: 'x', yPosition: 'y',zPosition:'z',xRotation:'rx',yRotation:'ry',zRotation:'rz' },
          vec = {
            position: ['x', 'y', 'z'],
            scale: ['sx', 'sy', 'sz'],
            anchorPoint: ['ax', 'ay', 'az'],
          },
          get = (tt) =>
            vec[key]
              ? vec[key].map((n) => val(ob, n, tt, next))
              : val(ob, names[key] || key, tt, next),
          known=vec[key]||Object.hasOwn(ob.p,names[key]||key)||Object.hasOwn(ob.keys,key)||Object.hasOwn(ob.expr,key)||['red','green','blue'].includes(key);
        if(!known)throw Error('图层「'+ob.name+'」没有属性「'+String(key)+'」');
        return new SampledProperty(get,t);
      },
      wrap=ob=>({transform:{readProperty:key=>prop(ob,key)}}),
      lin = (x, a, b, c, d) => c + (d - c) * Math.max(0, Math.min(1, (x - a) / (b - a))),
      loop = (mode) => {
        let a = l.keys[k];
        if (!a?.length || a.length < 2 || t < a.at(-1).t) return v;
        let start = a[0].t,
          len = a.at(-1).t - start,
          u = (t - start) / len;
        return base(
          l,
          k,
          start + len * (mode === 'pingpong' && Math.floor(u) % 2 ? 1 - (u % 1) : u % 1),
        );
      };
    const scope={time:t,value:v,Math:mathScope,PI:Math.PI,true:true,false:false,
      wiggle:(f,a)=>v+a*(Math.sin(t*f*5.73+id.length)*.72+Math.sin(t*f*10.18)*.28),
      loopOut:loop,linear:lin,ease:(x,a,b,c,d)=>{const u=lin(x,a,b,0,1);return c+(d-c)*u*u*(3-2*u)},
      thisComp:      {
        layer: (n) => {
          let o =
            P.comps.flatMap((c) => c.layers).find((a) => l.bindings?.[n] === a.id) ||
            (P.comps.find((c) => c.layers.includes(l._origin || l))?.layers || L()).find(
              (l) => l.name === n,
            );
          if (!o) throw Error('找不到图层 ' + n);
          return wrap(o);
        },
      },
      thisLayer:wrap(l),transform:wrap(l).transform,valueAtTime:tt=>base(l,k,tt)};
    const res=runMotionExpression(ex,scope);
    if (!Number.isFinite(+res)) throw Error('结果不是有效数值');
    delete errors[id];
    return +res;
  } catch (e) {
    if (stack.length) throw e;
    errors[id] = e.message;
    return v;
  }
}
function setVal(l, k, v, t = T) {
  if (l.keys[k]?.length) {
    let a = l.keys[k],
      q = a.find((o) => Math.abs(o.t - t) < 0.001);
    if (q) q.v = v;
    else a.push(key(t, v));
    a.sort((a, b) => a.t - b.t);
  } else l.p[k] = v;
}
function tc(t = T) {
  let f = Math.floor(t * C().fps + 1e-7);
  return [0, Math.floor(f / C().fps / 60), Math.floor(f / C().fps) % 60, f % C().fps]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}
const phase = (t) => (t < 3 ? '写成' : t < 7 ? '成块' : t < 11 ? '锻打' : '冷却');
function rand(seed) {
  let n = seed >>> 0;
  return () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function base(l, k, t) {
  if (l.space && ['x', 'y', 'z'].includes(k)) {
    let pos = spatialPos(l, t);
    if (pos) return pos[k];
  }
  return basePlain(l, k, t);
}
