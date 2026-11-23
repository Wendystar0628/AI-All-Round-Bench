const R3 = THREE,
  canvas = document.querySelector('#scene'),
  gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true, alpha: true }),
  renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.17;
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(33, 16 / 9, 0.05, 150),
  V = (x, y, z) => new THREE.Vector3(x, y, z),
  matcache = new Map();
scene.background = new THREE.Color('#191819');
scene.fog = new THREE.FogExp2('#272120', 0.071);
const env = document.createElement('canvas');
env.width = 512;
env.height = 256;
let ec = env.getContext('2d'),
  eg = ec.createLinearGradient(0, 0, 0, 256);
eg.addColorStop(0, '#a79b87');
eg.addColorStop(0.45, '#51443c');
eg.addColorStop(0.5, '#241a17');
eg.addColorStop(1, '#67402a');
ec.fillStyle = eg;
ec.fillRect(0, 0, 512, 256);
for (let [x, y, w, h, c] of [
  [18, 55, 90, 36, '#ffe5bc'],
  [170, 45, 55, 54, '#ffab69'],
  [280, 53, 100, 12, '#ffedda'],
  [400, 90, 80, 15, '#ff7d34'],
  [78, 40, 5, 110, '#ffffef'],
]) {
  ec.fillStyle = c;
  ec.fillRect(x, y, w, h);
}
let et = new THREE.CanvasTexture(env);
et.colorSpace = THREE.SRGBColorSpace;
et.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = new THREE.PMREMGenerator(renderer).fromEquirectangular(et).texture;
const ambient = new THREE.HemisphereLight(0xffe5bf, 0x8a5037, 1.35);
scene.add(ambient);
const keyLight = new THREE.DirectionalLight(0xffdeb0, 2.2);
keyLight.position.set(-3, 6, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
Object.assign(keyLight.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
keyLight.shadow.bias = -0.0005;
keyLight.shadow.normalBias = 0.015;
scene.add(keyLight);
let rim = new THREE.DirectionalLight(0xff7e36, 2.3);
rim.position.set(2, 3, -4);
scene.add(rim);
const noiseGL =
  'float hash3(vec3 p){p=fract(p*.3183099+vec3(.11,.26,.41));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));} float noi(vec3 p){vec3 a=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash3(a),hash3(a+vec3(1,0,0)),f.x),mix(hash3(a+vec3(0,1,0)),hash3(a+vec3(1,1,0)),f.x),f.y),mix(mix(hash3(a+vec3(0,0,1)),hash3(a+vec3(1,0,1)),f.x),mix(hash3(a+vec3(0,1,1)),hash3(a+vec3(1,1,1)),f.x),f.y),f.z);} float fb(vec3 p){return noi(p)*.52+noi(p*2.06)*.28+noi(p*4.18)*.13+noi(p*9.)*.07;}';
function forged(l, stone = false) {
  let k = (l._instance || 'main') + l.id + stone;
  if (matcache.has(k)) return matcache.get(k);
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.8,
    roughness: 0.4,
    side: THREE.DoubleSide,
  });
  m.userData.temp = { value: 0 };
  m.onBeforeCompile = (s) => {
    s.uniforms.uHeat = m.userData.temp;
    s.vertexShader =
      'varying vec3 vForge;varying vec3 vNor;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vForge=position;vNor=normal;',
      );
    s.fragmentShader =
      'varying vec3 vForge;varying vec3 vNor;uniform float uHeat;\n' +
      noiseGL +
      '\n' +
      s.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
vec3 fp=vForge;float big=fb(fp*3.3);float grain=fb(fp*vec3(48.,57.,42.));float fine=noi(fp*210.);float crust=smoothstep(.32,.67,big*.57+grain*.43);float seam=1.-smoothstep(.009,.042,abs(fb(fp*8.+big*2.)-.48));float nz=abs(normalize(vNor).z);float edge=pow(max(0.,4.*nz*(1.-nz)),1.5);
diffuseColor.rgb*=.08+grain*.4+big*.4;
`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n roughnessFactor=clamp(roughnessFactor+(grain-.5)*.65,.12,.95);',
        )
        .replace(
          '#include <normal_fragment_maps>',
          '#include <normal_fragment_maps>\n float hgt=(grain*.0025+fine*.00028+big*.014);vec3 sx=dFdx(vViewPosition),sy=dFdy(vViewPosition);vec3 r1=cross(sy,normal),r2=cross(normal,sx);float det=dot(sx,r1);normal=normalize(abs(det)*normal+sign(det)*(dFdx(hgt)*r1+dFdy(hgt)*r2));',
        )
        .replace(
          '#include <emissivemap_fragment>',
          stone
            ? '#include <emissivemap_fragment>\n totalEmissiveRadiance+=vec3(.32,.048,.002)*seam*crust*uHeat;'
            : '#include <emissivemap_fragment>\n float hot=uHeat*uHeat*(.15+.85*pow(abs(normalize(vNor).z),.65));totalEmissiveRadiance+=hot*(vec3(.95,.083,.002)*(.035+pow(crust,3.5)*1.12)+vec3(2.7,.40,.012)*seam*(.21+crust)+vec3(1.75,.37,.015)*edge*pow(grain,1.4));',
        );
  };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s) => {
    prev(s);
    if (!stone)
      s.fragmentShader = s.fragmentShader.replace(
        '#include <opaque_fragment>',
        'vec3 reflectRay=reflect(-normalize(vViewPosition),normal);float strip=exp(-pow((reflectRay.x+reflectRay.y*.38-.52)*2.1,2.));float cold=1.-smoothstep(.05,.84,uHeat);outgoingLight+=vec3(.63,.71,.82)*cold*(.085+strip*.61)*(.55+grain*.7)*metalnessFactor;\n#include <opaque_fragment>',
      );
  };
  m.customProgramCacheKey = () => (stone ? 'stone' : 'metal');
  matcache.set(k, m);
  return m;
}
function mesh(g, m) {
  let o = new THREE.Mesh(g, m);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
const path = (d) => {
  let s = new THREE.Shape();
  for (let c of d) {
    if (c.length === 2) {
      if (!s.curves.length && s._start === undefined) {
        s.moveTo(...c);
        s._start = 1;
      } else s.lineTo(...c);
    } else s.bezierCurveTo(...c);
  }
  s.closePath();
  return s;
};
function fireShapes() {
  return [
    path([
      [-0.83, 1.43],
      [-0.96, 1.97],
      [-1.13, 2.3],
      [-1.09, 2.37],
      [-0.54, 2.2, -0.29, 1.94, -0.38, 1.61],
      [-0.47, 1.32, -0.71, 1.24, -0.83, 1.43],
    ]),
    path([
      [0.62, 1.77],
      [1.02, 2.63],
      [1.47, 2.4],
      [1.55, 2.31],
      [1.25, 2.16, 0.98, 1.82, 0.6, 1.63],
    ]),
    path([
      [-1.4, 0.09],
      [-0.48, 0.63, -0.15, 1.5, -0.1, 2.46],
      [-0.07, 2.84, -0.1, 3.01, -0.2, 3.17],
      [0.43, 3.09],
      [0.62, 2.98],
      [0.46, 2.63],
      [0.37, 1.98, 0.24, 1.25, -0.27, 0.72],
      [-0.62, 0.34, -1.02, 0.13, -1.4, 0.09],
    ]),
    path([
      [0.12, 1.83],
      [0.49, 1.26, 0.97, 0.68, 1.68, 0.43],
      [1.38, 0.29, 1.16, 0.18, 0.98, 0.08],
      [0.49, 0.48, 0.19, 1.15, 0.05, 1.6],
    ]),
  ];
}
const glyphCache = new Map();
function fontShapes(str) {
  if (glyphCache.has(str)) return glyphCache.get(str);
  let arr = [];
  if (str === '火') arr = fireShapes();
  else if ((arr = nativeGlyphShapes(str)) !== null) { /* Exact bundled font contours. */ }
  else {
    const cv = document.createElement('canvas'),
      fs = 160,
      lines = (str || '字').split('\n');
    cv.width =
      Math.max(1, Math.min(24, Math.max(...lines.map((l) => Array.from(l).length)))) * fs + 12;
    cv.height = Math.min(lines.length, 6) * 190 + 12;
    let ct = cv.getContext('2d');
    ct.font = '900 ' + fs + 'px "Microsoft YaHei","Noto Sans CJK SC",sans-serif';
    ct.fillStyle = '#fff';
    lines.slice(0, 6).forEach((s, i) => ct.fillText(s, 6, fs + i * 190));
    let w = cv.width,
      h = cv.height,
      pix = ct.getImageData(0, 0, w, h).data,
      edges = new Map(),
      inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && pix[4 * (y * w + x) + 3] > 108,
      N = w + 1,
      add = (a, b) => {
        if (!edges.has(a)) edges.set(a, []);
        edges.get(a).push(b);
      };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (inside(x, y)) {
          let a = y * N + x;
          if (!inside(x, y - 1)) add(a, a + 1);
          if (!inside(x + 1, y)) add(a + 1, a + N + 1);
          if (!inside(x, y + 1)) add(a + N + 1, a + N);
          if (!inside(x - 1, y)) add(a + N, a);
        }
    let sp = new THREE.ShapePath();
    while (edges.size) {
      let a = edges.keys().next().value,
        p = a,
        pts = [];
      do {
        pts.push([p % N, Math.floor(p / N)]);
        let b = edges.get(p);
        if (!b) break;
        let n = b.pop();
        if (!b.length) edges.delete(p);
        p = n;
      } while (p !== a);
      if (pts.length < 4) continue;
      pts.forEach(([x, y], i) => {
        let prev = pts[(i - 1 + pts.length) % pts.length],
          next = pts[(i + 1) % pts.length];
        if (i && (x - prev[0]) * (next[1] - y) === (y - prev[1]) * (next[0] - x)) return;
        sp[i ? 'lineTo' : 'moveTo']((x - w / 2) * 0.021, (h - y) * 0.021);
      });
      sp.currentPath.closePath();
    }
    arr = sp.toShapes(false);
  }
  glyphCache.set(str, arr);
  return arr;
}
function extrude(shapes, d, b) {
  return new THREE.ExtrudeGeometry(shapes, {
    depth: Math.max(0.004, d),
    bevelEnabled: b > 0.001,
    bevelSegments: 3,
    steps: 1,
    bevelSize: b,
    bevelThickness: b,
    curveSegments: 18,
  });
}
function plate(w, h, d, cut) {
  return path([
    [-w / 2 + cut, -h / 2],
    [w / 2 - cut, -h / 2],
    [w / 2, -h / 2 + cut],
    [w / 2, h / 2 - cut],
    [w / 2 - cut, h / 2],
    [-w / 2 + cut, h / 2],
    [-w / 2, h / 2 - cut],
    [-w / 2, -h / 2 + cut],
  ]);
}
function makeStage(l, m) {
  let group = new THREE.Group(),
    rng = rand(19);
  for (let [w, h, y, d, b] of [
    [22, 21, -1.32, 0.12, 0.025],
    [7.4, 4.5, -1.13, 0.28, 0.06],
    [6.85, 4.15, -0.77, 0.11, 0.025],
    [6.68, 4.04, -0.58, 0.48, 0.05],
  ]) {
    let s = mesh(extrude(plate(w, h, d, 0.43), d, b), m);
    if(d===.48)s.material=forgeDeckMaterial(l,m);
    s.rotation.x = -Math.PI / 2;
    s.position.set(0, y, 0);
    group.add(s);
  }
  let metal = new THREE.MeshStandardMaterial({ color: 0x716153, metalness: 0.84, roughness: 0.36 }),
    slit = new THREE.MeshStandardMaterial({ color: 0x201812, metalness: 0.7, roughness: 0.8 });
  for (let side of [-1, 1]) {
    for (let i = 0; i < 18; i++) {
      let bar = mesh(new THREE.BoxGeometry(0.058, 0.016, 1.2), slit);
      bar.position.set(side * (1.8 + (i % 6) * 0.17), -0.045, Math.floor(i / 6) * 1.13 - 1.1);
      group.add(bar);
    }
    for (let i = 0; i < 5; i++) {
      let bolt = mesh(new THREE.CylinderGeometry(0.073, 0.073, 0.04, 6), metal);
      bolt.position.set(i * 1.15 - 2.3, -0.042, side * 1.76);
      group.add(bolt);
    }
  }
  for (let i = 0; i < 90; i++) {
    let rock = mesh(new THREE.DodecahedronGeometry(0.016 + rng() ** 2 * 0.063, 0), m);
    rock.scale.set(1.7, 0.5, 1);
    rock.position.set((rng() - 0.5) * 6, -0.04, (rng() - 0.5) * 3.8);
    rock.rotation.y = rng() * 6;
    group.add(rock);
  }
  group.scale.set(0.8, 1, 0.81);
  return group;
}
const glowTex = (() => {
  let c = document.createElement('canvas');
  c.width = c.height = 128;
  let ct = c.getContext('2d'),
    g = ct.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,.9)');
  g.addColorStop(0.13, 'rgba(255,255,255,.55)');
  g.addColorStop(0.42, 'rgba(255,255,255,.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ct.fillStyle = g;
  ct.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
function haze(x, y, z, w, h, color, op) {
  let s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color,
      transparent: true,
      opacity: op,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  s.position.set(x, y, z);
  s.scale.set(w, h, 1);
  return s;
}
function airGroup() {
  let g = new THREE.Group(),
    r = rand(58);
  for (let i = 0; i < 32; i++) {
    let x = r() * 30 - 15,
      y = r() * 3,
      z = -5 - r() * 9;
    g.add(haze(x, y, z, 3 + r() * 8, 3 + r() * 4, i % 4 ? 0xb49378 : 0xff610e, 0.05 + r() * 0.13));
  }
  for (let i = 0; i < 12; i++) {
    let b = mesh(
      new THREE.BoxGeometry(0.25 + r() * 0.7, 4 + r() * 9, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x201e20, roughness: 0.74 }),
    );
    b.position.set((i - 6) * 2, 1, -8 - r() * 5);
    b.rotation.z = r() * 0.17;
    g.add(b);
  }
  g.add(haze(-3, 0.26, -2, 6, 3, 0xf58939, 0.27), haze(1.2, 0.29, -0.3, 4, 1.4, 0xff861c, 0.22));
  furnaceAtmosphere(g);
  return g;
}
let root,
  entries = new Map(),
  built = -1,
  sceneCam,
  angleMode = 0,
  viewScale = 1,
  gridOn = false,
  safeOn = false,
  activeTool = 'select',
  selectedHandles = false;
function shapesFor(l) {
  if (l.type === 'text' || l.model === 'glyph') return fontShapes(l.text);
  let sh = new THREE.Shape();
  if (l.shape === 'ellipse') sh.absellipse(0, 0, 1, 0.74, 0, Math.PI * 2, false, 0);
  else if (l.shape === 'path' && l.points?.length) sh = pathShape(l);
  else sh = plate(1.8, 1.4, 0, 0.015);
  return [sh];
}
function createObj(l) {
  let o = new THREE.Group(),
    m = forged(l, l.model === 'stage');
  if (l.model === 'stage') o.add(makeStage(l, m));
  else if (l.model === 'air') o.add(airGroup());
  else if (l.model === 'hammer') {
    addHammer(o,l,m);
  } else if (l.type === 'light') {
    let a =
      l.kind === '平行光'
        ? new THREE.DirectionalLight(l.color, 1)
        : new THREE.PointLight(l.color, 30, 40, 1.7);
    a.castShadow = l.cast !== false;
    a.shadow.mapSize.set(1024, 1024);
    a.shadow.normalBias = 0.012;
    a.shadow.bias = -0.0003;
    a.shadow.camera.near = 0.08;
    a.shadow.camera.far = 60;
    o.add(a);
  } else if (l.type === 'particle') {
    let g = new THREE.BufferGeometry(),
      a = new Float32Array(4800 * 3),
      cl = new Float32Array(a.length);
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    let lines = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    lines.frustumCulled = false;
    o.add(lines);
    o.userData.spark = true;
  } else if (['geo', 'text', 'shape'].includes(l.type) && l.model !== 'caption') {
    o.add(mesh(new THREE.BufferGeometry(), m));
  }
  o.userData.layer = l;
  return o;
}
function repGeometry(l, o, t) {
  let v = (k) => val(l, k, t),
    input = l.source && P.comps.flatMap((c) => c.layers).find((z) => z.id === l.source),
    src = input || l;
  let d = v('depth'),
    b = v('bevel'),
    bend = v('bend'),
    tw = v('twist');
  let nodes = expandNodes(l.nodes);
  if (nodes.length) {
    let end = nodes.find((n) => n.op === '几何输出'),
      chain = [],
      seen = new Set();
    for (let n = end; n && !seen.has(n.id); n = nodes.find((a) => a.id === n.input)) {
      chain.push(n.op);
      seen.add(n.id);
    }
    if (!chain.includes('挤出实体')) d = 0.012;
    if (end && !end.input) {
      o.children[0].visible = false;
      return;
    }
    o.children[0].visible = true;
    if (chain.includes('扭转变形'))
      tw += nodeInput(
        l,
        nodes.find((q) => q.op === '扭转变形'),
        t,
        35,
      );
    if (chain.includes('弯曲变形'))
      bend += nodeInput(
        l,
        nodes.find((q) => q.op === '弯曲变形'),
        t,
        0.23,
      );
  }
  let trim = v('trim'),
    key = [
      temporalGeometry(l, t) ? t : 0, ...(l.pins||[]).flatMap((p,i)=>['X','Y','R','S'].map(k=>v('pin'+i+k))),
      v('repeat'),
      v('offset'),
      v('strokeWidth'),
      src.id,
      src.text,
      l.shape,
      d.toFixed(3),
      b.toFixed(3),
      bend.toFixed(3),
      tw.toFixed(2),
      trim < 100 ? trim.toFixed(1) : 100,
      version,
    ].join('/');
  if (o.userData.key === key) return;
  o.userData.key = key;
  let computed = nodeGeometry(l, t, src !== l ? upstreamShapes(src, t) : vectorShapes(src, t));
  o.userData.nodeTint = computed.tint;
  if (computed.depth !== undefined) d = Math.max(0.007, computed.depth);
  let shapes=pathOps(computed.shapes,l,t);
  if(!l.ops?.some(q=>q.type==='修剪路径'))shapes=trimContours(shapes,trim,l.writeMode==='笔画生长');
  let g = extrude(shapes, d, b),
    pos = g.attributes.position,
    field = (currentInstance?.c.layers || L()).filter(
      (f) => f.type === 'field' && f.visible && (!computed.field || computed.field === f.id),
    );
  if (
    (field.length || l.pins?.some((p,i)=>p.dx||p.dy||['X','Y','R','S'].some(k=>v('pin'+i+k))) || Math.abs(bend) > 0.0001 || Math.abs(tw) > 0.001) &&
    pos.count < 80000
  ) {
    g = refineSurface(g);
    pos = g.attributes.position;
  }
  const deform=geometryWarp(l,t,computed.field);
  for(let i=0;i<pos.count;i++){
    const p=deform(pos.getX(i),pos.getY(i),pos.getZ(i));
    pos.setXYZ(i,p.x,p.y,p.z);
  }
  if (shapes.some((s) => s.charAlpha < 0.999)) {
    let boxes = shapes.map((s) => ({
        b: new THREE.Box2().setFromPoints(s.getPoints(12)),
        a: s.charAlpha ?? 1,
      })),
      colors = new Float32Array(pos.count * 4).fill(1);
    for (let i = 0; i < pos.count; i++) {
      let p = new THREE.Vector2(pos.getX(i), pos.getY(i));
      colors[i * 4 + 3] =
        boxes.find((q) =>
          q.b
            .clone()
            .expandByScalar(b + 0.001)
            .containsPoint(p),
        )?.a ?? 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    o.children[0].material.vertexColors = true;
    o.children[0].material.transparent = true;
  } else o.children[0].material.vertexColors = false;
  if (bend || tw || field.length || l.pins?.length) g.computeVertexNormals();
  o.children[0].geometry.dispose();
  o.children[0].geometry = g;
  decorateEdges(l, o, g, shapes, v, t);
  while (o.children.length > 1 && !o.children.at(-1).userData.layer) o.remove(o.children.at(-1));
  for (
    let i = 1;
    i < Math.min(32, l.ops?.some((q) => q.type === '重复器') ? 1 : Math.round(v('repeat')));
    i++
  ) {
    let copy = mesh(g, o.children[0].material);
    copy.userData.replica=true;copy.position.x = i * v('offset');
    o.add(copy);
  }
}
function evalObj(l, o, t) {
  let v = (k) => val(l, k, t);
  o.visible = l.visible && t >= l.in && t <= l.out;
  if (l.type === 'geo' || l.type === 'shape' || l.type === 'text') {
    let m = forged(l, l.model === 'stage');
    m.color.set(sampledColor(l, t));
    if (l.model === 'glyph') m.color.lerp(new THREE.Color('#606665'), 1 - Math.min(1, v('heat')));
    m.visible = !l.open;
    m.metalness = v('metal');
    m.roughness = v('rough');
    m.userData.temp.value = v('heat') + v('glow') * 0.1;
    m.opacity = v('opacity') / 100;
    m.transparent = m.opacity < 1;
    m.blending = THREE.NormalBlending;
    if (!['stage', 'air', 'hammer', 'caption'].includes(l.model)) repGeometry(l, o, t);
  }
  o.position.set(v('x'), v('y'), v('z'));
  o.rotation.set(v('rx') * 0.0174533, v('ry') * 0.0174533, v('rz') * 0.0174533);
  o.scale.set(v('sx') * 0.01 * v('size'), v('sy') * 0.01 * v('size'), v('sz') * 0.01 * v('size'));
  let anch = V(v('ax'), v('ay'), v('az')).multiply(o.scale).applyQuaternion(o.quaternion);
  o.position.sub(anch);
  if (l.model === 'air') {
    o.traverse((a) => {
      if (a.material?.uniforms?.tint) {
        a.userData.smokeBase ||= a.material.uniforms.tint.value.clone();
        a.material.uniforms.tint.value
          .copy(a.userData.smokeBase)
          .multiplyScalar(0.12 + v('heat') * 0.88);
      }
    });
    let dust = o.getObjectByName('炉尘');
    if (dust) {
      dust.visible=v('dustOpacity')>0;
      dust.position.set(t * 0.035, t * 0.047, 0);
      dust.material.opacity = Math.max(0,Math.min(1,v('dustOpacity')/100));
    }
  }
  if (['geo', 'text', 'shape'].includes(l.type))
    updateSurface(l, forged(l, l.model === 'stage'), t);
  if (o.children[0]?.isMesh) {
    o.children[0].castShadow = l.cast !== false;
    o.children[0].receiveShadow = l.receive !== false;
  }
  if (l.type === 'light') {
    o.children[0].color.set(sampledColor(l, t));
    o.children[0].intensity = v('intensity') * (l.kind === '平行光' ? 0.065 : 1);
    if (o.children[0].target) {
      const target = o.children[0].target;
      target.position.set(v('tx'), v('ty'), v('tz'));
      target.updateMatrixWorld();
    }
  }
  if(l.type==='camera'&&o.visible){
    const depth=currentInstance.path.split('/').length;
    if(!sceneCam||depth<sceneCam.depth)sceneCam={l,o,t,depth,instance:currentInstance};
  }
}
function renderScene() {
  motionFrame(renderInstances);
  captionPass();
}
