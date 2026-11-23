/* ============================================================
   core.js — 全局基础：随机、噪声、贴图、材质、渲染器、灯光、轨道控制
   ============================================================ */
(function () {
'use strict';
const H = window.H = {};
THREE.ColorManagement.enabled = true;

/* ---------- 确定性随机 ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    let r = (t ^ (t >>> 14)) >>> 0;
    return r / 4294967296;
  };
}
const rnd = mulberry32(20240615);
const R = () => rnd();
const RR = (a, b) => a + (b - a) * R();
const RI = (a, b) => Math.floor(RR(a, b + 1));
const pick = arr => arr[Math.floor(R() * arr.length)];
H.R = R; H.RR = RR; H.RI = RI; H.pick = pick;
H.mulberry32 = mulberry32;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
H.clamp = clamp;
function lerp(a, b, t) { return a + (b - a) * t; }
H.lerp = lerp;
function smooth(t) { return t * t * (3 - 2 * t); }
H.smoothstep = (e0, e1, x) => smooth(clamp((x - e0) / (e1 - e0), 0, 1));
H.easeInOut = t => t * t * t * (t * (t * 6 - 15) + 10);
H.easeOut = t => 1 - Math.pow(1 - t, 3);
H.easeIn = t => t * t * t;
H.pingpong = (t, p) => { const m = ((t % p) + p) % p; return m < p / 2 ? m / (p / 2) : 1 - (m - p / 2) / (p / 2); };

/* ---------- 2D value noise ---------- */
function makeNoise2D(seed) {
  const r = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => {
    switch (h & 3) {
      case 0: return x + y; case 1: return -x + y;
      case 2: return x - y; default: return -x - y;
    }
  };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  return function (x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    return lerp(lerp(grad(aa, x, y), grad(ba, x - 1, y), u),
                lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u), v) * 0.7071;
  };
}
H.makeNoise2D = makeNoise2D;
const noiseA = makeNoise2D(11), noiseB = makeNoise2D(23), noiseC = makeNoise2D(37);
H.fbm = function (x, y, n, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * n(x * f, y * f); f *= 2.03; amp *= 0.5; }
  return v;
};
H.noiseA = noiseA; H.noiseB = noiseB; H.noiseC = noiseC;

/* ---------- Canvas 贴图工厂 ---------- */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
H.makeCanvas = makeCanvas;
function texFromCanvas(c, rx, ry, srgb) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  t.anisotropy = 4;
  if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
H.texFromCanvas = texFromCanvas;

/* 粗糙水泥 */
function concreteCanvas(base, seed) {
  const n = makeNoise2D(seed);
  const [c, g] = makeCanvas(256, 256);
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    const v = H.fbm(x * 0.06, y * 0.06, n, 4);
    const d = base + v * 22 + (R() - 0.5) * 8;
    img.data[i] = d + 4; img.data[i + 1] = d + 6; img.data[i + 2] = d + 8; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // 水渍、裂缝
  g.globalAlpha = 0.10;
  for (let k = 0; k < 26; k++) {
    g.fillStyle = k % 2 ? '#5e6b6e' : '#8b9799';
    g.beginPath();
    g.ellipse(RR(0, 256), RR(0, 256), RR(6, 34), RR(4, 20), R() * 3, 0, 7);
    g.fill();
  }
  g.globalAlpha = 0.35;
  g.strokeStyle = '#4d585c'; g.lineWidth = 1;
  for (let k = 0; k < 7; k++) {
    g.beginPath();
    let x = RR(0, 256), y = RR(0, 256);
    g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += RR(-18, 18); y += RR(-4, 20); g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 1;
  return c;
}
H.concreteCanvas = concreteCanvas;

/* 岸壁砌块：砌缝+潮痕 */
function quayWallCanvas() {
  const [c, g] = makeCanvas(512, 512);
  g.fillStyle = '#9aa4a6'; g.fillRect(0, 0, 512, 512);
  const n = makeNoise2D(91);
  for (let y = 0; y < 512; y += 4) for (let x = 0; x < 512; x += 4) {
    const v = H.fbm(x * 0.03, y * 0.03, n, 3);
    g.fillStyle = `rgba(${120 + v * 30},${128 + v * 30},${130 + v * 30},0.35)`;
    g.fillRect(x, y, 4, 4);
  }
  // 砌块缝
  g.strokeStyle = '#5f6a6d'; g.lineWidth = 3;
  const rowH = 52;
  for (let y = 0; y <= 512; y += rowH) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke();
    const off = (Math.round(y / rowH) % 2) * 46;
    for (let x = -off; x <= 512; x += 92) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + rowH); g.stroke();
    }
  }
  // 潮位线（深青带）
  const tides = [0.62, 0.72, 0.80];
  tides.forEach((ty, i) => {
    const grd = g.createLinearGradient(0, 512 * ty - 26, 0, 512 * ty + 26);
    grd.addColorStop(0, 'rgba(38,78,84,0)');
    grd.addColorStop(0.5, `rgba(34,72,78,${0.22 - i * 0.05})`);
    grd.addColorStop(1, 'rgba(38,78,84,0)');
    g.fillStyle = grd; g.fillRect(0, 512 * ty - 26, 512, 52);
  });
  // 底部深浸
  const grd2 = g.createLinearGradient(0, 400, 0, 512);
  grd2.addColorStop(0, 'rgba(28,58,64,0)');
  grd2.addColorStop(1, 'rgba(24,52,58,0.55)');
  g.fillStyle = grd2; g.fillRect(0, 400, 512, 112);
  return c;
}
H.quayWallCanvas = quayWallCanvas;

/* 黄黑斜纹警示条 */
function hazardCanvas() {
  const [c, g] = makeCanvas(128, 32);
  g.fillStyle = '#1d1d22'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#f2c12e';
  for (let x = -32; x < 160; x += 32) {
    g.beginPath();
    g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 48, 0); g.lineTo(x + 32, 0);
    g.closePath(); g.fill();
  }
  // 磨损
  const n = makeNoise2D(55);
  g.globalAlpha = 0.25; g.fillStyle = '#cfd6d6';
  for (let k = 0; k < 60; k++) {
    if (n(R() * 8, R() * 8) > 0.1) g.fillRect(RR(0, 128), RR(0, 32), RR(2, 8), RR(1, 3));
  }
  g.globalAlpha = 1;
  return c;
}
H.hazardCanvas = hazardCanvas;

/* 瓦片屋顶 */
function roofCanvas() {
  const [c, g] = makeCanvas(256, 128);
  g.fillStyle = '#5b4a52'; g.fillRect(0, 0, 256, 128);
  for (let y = 0; y < 128; y += 16) {
    for (let x = 0; x < 256; x += 24) {
      const o = (Math.round(y / 16) % 2) * 12;
      g.fillStyle = `rgb(${74 + (R() - 0.5) * 14},${58 + (R() - 0.5) * 10},${66 + (R() - 0.5) * 10})`;
      g.beginPath();
      g.moveTo(x - o, y); g.arc(x + 12 - o, y, 12, Math.PI, 0);
      g.lineTo(x + 24 - o, y + 16); g.lineTo(x - o, y + 16); g.closePath(); g.fill();
    }
  }
  g.strokeStyle = 'rgba(30,24,28,0.5)'; g.lineWidth = 1.5;
  for (let y = 0; y < 128; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  return c;
}
H.roofCanvas = roofCanvas;

/* 草地/山坡 */
function grassCanvas() {
  const n = makeNoise2D(77);
  const [c, g] = makeCanvas(256, 256);
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    const v = H.fbm(x * 0.05, y * 0.05, n, 4);
    img.data[i] = 86 + v * 34; img.data[i + 1] = 128 + v * 44; img.data[i + 2] = 78 + v * 26; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
H.grassCanvas = grassCanvas;

/* 告示牌画布（港名 + 注意落水） */
function signCanvas() {
  const [c, g] = makeCanvas(512, 256);
  g.fillStyle = '#e8e4d8'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#3f7d86'; g.lineWidth = 12; g.strokeRect(12, 12, 488, 232);
  g.fillStyle = '#2c5b63';
  g.font = 'bold 92px "Yu Gothic","Hiragino Kaku Gothic ProN","Meiryo",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('ひだまり港', 256, 92);
  g.font = 'bold 46px "Yu Gothic","Meiryo",sans-serif';
  g.fillText('転落注意', 256, 188);
  // 褪色斑驳
  const n = makeNoise2D(131);
  g.globalAlpha = 0.16; g.fillStyle = '#ffffff';
  for (let k = 0; k < 400; k++) {
    if (n(k * 0.7, R() * 20) > 0) g.fillRect(RR(0, 512), RR(0, 256), RR(2, 10), RR(2, 6));
  }
  g.globalAlpha = 1;
  return c;
}
H.signCanvas = signCanvas;

/* ---------- 三渲二材质 ---------- */
const steps = new Uint8Array([95, 165, 225, 255]);
const gradData = new Uint8Array(steps.length * 4);
for (let i = 0; i < steps.length; i++) { gradData[i * 4] = gradData[i * 4 + 1] = gradData[i * 4 + 2] = steps[i]; gradData[i * 4 + 3] = 255; }
const toonGrad = new THREE.DataTexture(gradData, steps.length, 1, THREE.RGBAFormat);
toonGrad.minFilter = THREE.NearestFilter; toonGrad.magFilter = THREE.NearestFilter;
toonGrad.needsUpdate = true;
H.toonGrad = toonGrad;

function toon(color, opts) {
  const m = new THREE.MeshToonMaterial(Object.assign({
    color: color,
    gradientMap: toonGrad,
  }, opts || {}));
  return m;
}
H.toon = toon;

const MAT = H.MAT = {
  concrete: toon(0xaab4b6, { map: texFromCanvas(concreteCanvas(168, 5), 2.4, 2.4) }),
  concreteDark: toon(0x8b9597, { map: texFromCanvas(concreteCanvas(140, 9), 2, 2) }),
  quayWall: toon(0xffffff, { map: texFromCanvas(quayWallCanvas(), 3, 1) }),
  hazard: toon(0xffffff, { map: texFromCanvas(hazardCanvas(), 1, 1) }),
  white: toon(0xf2f0ea),
  whiteWarm: toon(0xe9e4d8),
  hull: toon(0xf4f2ec),
  hullBlue: toon(0xd8e6ea),
  roof: toon(0xffffff, { map: texFromCanvas(roofCanvas(), 2, 2) }),
  grass: toon(0xffffff, { map: texFromCanvas(grassCanvas(), 3, 3) }),
  dark: toon(0x2c3134),
  iron: toon(0x33383c, { roughness: 0.9 }),
  rust: toon(0x8a5a38),
  rope: toon(0xb9712e),
  ropeWet: toon(0x7d4a1c),
  wood: toon(0x9c7146),
  woodDark: toon(0x6e4e30),
  red: toon(0xc8473b),
  yellow: toon(0xe8b93a),
  orange: toon(0xe8782e),
  blue: toon(0x3f7fa8),
  teal: toon(0x4f9a96),
  green: toon(0x4e8a52),
  leaf: toon(0x559057),
  leafDark: toon(0x3c6e42),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xbfe4ea, roughness: 0.12, metalness: 0,
    transmission: 0.6, thickness: 0.3, transparent: true, opacity: 0.32,
    side: THREE.DoubleSide, depthWrite: false,
  }),
  glassDark: new THREE.MeshPhysicalMaterial({
    color: 0x9fcdd6, roughness: 0.2, transparent: true, opacity: 0.4,
    side: THREE.DoubleSide, depthWrite: false,
  }),
};
H.MAT = MAT;

/* 描边：倒勾法线 BackSide 壳 */
function outline(geo, color, thick) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: color || 0x26383f, side: THREE.BackSide,
  }));
  m.scale.setScalar(thick || 1.045);
  m.castShadow = false; m.receiveShadow = false;
  m.userData.isOutline = true;
  return m;
}
H.outline = outline;

/* 带描边的 mesh */
function toonMesh(geo, mat, oc, ot, noOut) {
  const grp = new THREE.Group();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  grp.add(m);
  if (!noOut) {
    const o = outline(geo, oc, ot);
    grp.add(o);
  }
  grp.userData.mesh = m;
  return grp;
}
H.toonMesh = toonMesh;

function box(w, h, d, mat, oc, noOut) {
  return toonMesh(new THREE.BoxGeometry(w, h, d), mat, oc, 1.04, noOut);
}
H.box = box;
function cyl(rt, rb, h, seg, mat, oc, noOut) {
  return toonMesh(new THREE.CylinderGeometry(rt, rb, h, seg || 16), mat, oc, 1.035, noOut);
}
H.cyl = cyl;
function sph(r, mat, oc, ws, hs, noOut) {
  return toonMesh(new THREE.SphereGeometry(r, ws || 18, hs || 14), mat, oc, 1.04, noOut);
}
H.sph = sph;

/* ---------- 渲染器 / 场景 / 相机 ---------- */
const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
container.appendChild(renderer.domElement);
H.renderer = renderer;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xdceef2, 0.0052);
H.scene = scene;

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(52, 34, 62);
H.camera = camera;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------- 灯光（高调、通透、低对比） ---------- */
const hemi = new THREE.HemisphereLight(0xeaf6fb, 0x39606a, 1.45);
scene.add(hemi);
H.hemi = hemi;

const sun = new THREE.DirectionalLight(0xfff2d0, 2.15);
sun.position.set(42, 60, 26);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -58; sc.right = 58; sc.top = 58; sc.bottom = -58;
sc.near = 5; sc.far = 160;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.025;
scene.add(sun);
H.sun = sun;

// 冷色补光，阴影保持深青
const fill = new THREE.DirectionalLight(0xbfdce8, 0.5);
fill.position.set(-40, 24, -30);
scene.add(fill);

/* 太阳可视圆盘（薄云在它前面经过） */
const sunDiscMat = new THREE.MeshBasicMaterial({
  color: 0xfff7df, transparent: true, opacity: 0.9, depthWrite: false,
  fog: false,
});
const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(7, 40), sunDiscMat);
sunDisc.position.copy(sun.position).setLength(170);
sunDisc.lookAt(0, 0, 0);
scene.add(sunDisc);
H.sunDisc = sunDisc;

/* ---------- 自研轨道控制 ---------- */
const ctrl = {
  target: new THREE.Vector3(0, 1.5, 0),
  sph: new THREE.Spherical().setFromVector3(camera.position.clone().sub(new THREE.Vector3(0, 1.5, 0))),
  tSph: null, enabled: true,
};
ctrl.sph.theta = Math.atan2(camera.position.x - ctrl.target.x, camera.position.z - ctrl.target.z);
ctrl.tSph = ctrl.sph.clone();
H.ctrl = ctrl;

let dragging = false, lastX = 0, lastY = 0, moved = 0;
const dom = renderer.domElement;
dom.addEventListener('pointerdown', e => {
  if (!ctrl.enabled) return;
  dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
  dom.setPointerCapture(e.pointerId);
});
dom.addEventListener('pointermove', e => {
  if (!dragging || !ctrl.enabled) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
  ctrl.tSph.theta -= dx * 0.0062;
  ctrl.tSph.phi = clamp(ctrl.tSph.phi - dy * 0.0052, 0.18, 1.46);
});
dom.addEventListener('pointerup', () => { dragging = false; });
dom.addEventListener('wheel', e => {
  if (!ctrl.enabled) return;
  e.preventDefault();
  ctrl.tSph.radius = clamp(ctrl.tSph.radius * (1 + Math.sign(e.deltaY) * 0.09), 12, 150);
}, { passive: false });
// 触摸双指缩放
const pinch = { d: 0 };
dom.addEventListener('touchstart', e => {
  if (e.touches.length === 2)
    pinch.d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
}, { passive: true });
dom.addEventListener('touchmove', e => {
  if (!ctrl.enabled || e.touches.length !== 2) return;
  const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  ctrl.tSph.radius = clamp(ctrl.tSph.radius * (pinch.d / d), 12, 150);
  pinch.d = d;
}, { passive: true });

/* ---------- 全局时间 / 更新注册 ---------- */
H.updaters = [];
H.onUpdate = fn => H.updaters.push(fn);

H.time = 0;       // 仿真时间（秒）
H.dt = 0;
H.exportMode = false;

/* 事件时钟：周期环境事件统一走这里（确定性） */
const Events = H.Events = {
  gusts: [],     // 阵风事件
};
(function planEvents() {
  // 阵风：每 22~40 秒一阵，从东边海上吹来
  let t = 9;
  while (t < 4000) { Events.gusts.push(t); t += RR(22, 40); }
})();

/* 阵风强度包络（事件中心附近 1） */
H.gustEnvelope = function (t) {
  let g = 0;
  for (const ts of Events.gusts) {
    const d = (t - ts) / 7;
    g += Math.exp(-d * d * 2.4);
  }
  return Math.min(g, 1);
};

/* ---------- 初始化顺序标记 ---------- */
H.ready = false;

})();
