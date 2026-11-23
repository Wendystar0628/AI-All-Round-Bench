import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { P } from '../core/palette.js';
import { Builder } from '../core/builder.js';
import { hash1, wob, WIND_DIR, WIND_ORIGIN } from '../core/wave.js';
import { BAY, WATER_Y } from './layout.js';

// 色块化水面：反射图按明度分成三档（深蓝 / 青绿 / 白），边缘利落；
// 水面在波纹、阵风前沿、雨滴与船只航迹的扰动下变形、碎裂、重组，并带有间歇的细碎粼光。
const waterShader = {
  name: 'PosterWater',
  uniforms: {
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    color: { value: null },
    uTime: { value: 0 },
    uBase: { value: new THREE.Color(P.teal) },
    uDeep: { value: new THREE.Color(P.navy) },
    uHi: { value: new THREE.Color('#eefcf8') },
    uMid: { value: new THREE.Color('#8fe0d4') },
    uRain: { value: 0.5 },
    uAmp: { value: 1 },
    uAlpha: { value: 0.78 },
    uGustT: { value: [0, 0, 0, 0] },
    uRip: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uGlint: { value: 1 },
    uWind: { value: new THREE.Vector2(WIND_DIR.x, WIND_DIR.z) },
    uWindO: { value: new THREE.Vector2(WIND_ORIGIN.x, WIND_ORIGIN.z) },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUvR;
    varying vec3 vWP;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWP = wp.xyz;
      vUvR = textureMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uRain, uAmp, uAlpha, uGlint;
    uniform float uGustT[4];
    uniform vec4 uRip[6];
    uniform vec3 uBase, uDeep, uHi, uMid;
    uniform vec2 uWind;
    uniform vec2 uWindO;
    varying vec4 vUvR;
    varying vec3 vWP;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
    float vn(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float gustEnv(float u) { return smoothstep(0.0, 0.9, u) * (1.0 - smoothstep(2.6, 4.6, u)); }
    float gustAt(vec2 p, float t) {
      float d = (p.x - uWindO.x) * uWind.x + (p.y - uWindO.y) * uWind.y;
      float g = 0.0;
      for (int i = 0; i < 4; i++) {
        float u = t - uGustT[i] - d / 5.2;
        if (u > -0.5) g = max(g, gustEnv(u));
      }
      return g;
    }
    float rainH(vec2 p, float t) {
      vec2 cp = p / 0.62;
      vec2 id = floor(cp);
      vec2 f = (fract(cp) - 0.5) * 0.62;
      float r = hash(id);
      float per = 1.3 + hash(id + 7.1) * 1.2;
      float age = fract((t + r * per) / per);
      float d = length(f);
      float ring = exp(-pow((d - age * 0.2) / 0.02, 2.0)) * (1.0 - age);
      return ring * step(0.72, r) * uRain;
    }
    float wakeH(vec2 p, float t) {
      float h = 0.0;
      for (int i = 0; i < 6; i++) {
        vec4 r = uRip[i];
        float age = t - r.z;
        if (age > 0.0 && age < 7.0) {
          float d = length(p - r.xy);
          float rad = age * 1.5;
          float ring = exp(-pow((d - rad) / 0.22, 2.0));
          h += ring * r.w * exp(-age * 0.45);
        }
      }
      return h;
    }
    float waveH(vec2 p, float t, float amp) {
      float h = 0.0;
      h += sin(dot(p, vec2(0.9, 0.3)) * 2.1 + t * 1.3) * 0.5;
      h += sin(dot(p, vec2(-0.4, 1.0)) * 3.3 - t * 1.7) * 0.32;
      h += sin(dot(p, vec2(1.3, -0.8)) * 5.7 + t * 2.3) * 0.18;
      h += (vn(p * 2.6 + vec2(t * 0.22, -t * 0.17)) - 0.5) * 0.9;
      return h * amp;
    }
    float heightAt(vec2 p, float t) {
      float g = gustAt(p, t);
      float amp = 0.035 * (1.0 + 2.2 * g) * uAmp;
      return waveH(p, t, amp) + wakeH(p, t) * 0.6 + rainH(p, t) * 0.25;
    }

    void main() {
      float t = uTime;
      vec2 p = vWP.xz;
      float e = 0.03;
      float h0 = heightAt(p, t);
      float hx = heightAt(p + vec2(e, 0.0), t);
      float hz = heightAt(p + vec2(0.0, e), t);
      vec3 n = normalize(vec3(-(hx - h0) / e * 0.9, 1.0, -(hz - h0) / e * 0.9));

      vec2 uvr = vUvR.xy / vUvR.w + n.xz * 0.02;
      vec3 refl = texture2D(tDiffuse, clamp(uvr, 0.002, 0.998)).rgb;
      float L = dot(refl, vec3(0.3, 0.59, 0.11));

      // 三档色块：暗部→深蓝，中间→青绿（基色），高光→白
      float dark = 1.0 - smoothstep(0.34, 0.37, L);
      float white = smoothstep(0.86, 0.88, L);
      vec3 tone = uBase;
      tone = mix(tone, uMid, smoothstep(0.5, 0.52, L) * (1.0 - white) * 0.6);
      tone = mix(tone, uDeep, dark * 0.9);
      tone = mix(tone, uHi, white * 0.85);

      // 细碎粼光：间歇闪烁
      float s1 = sin(dot(p, vec2(7.3, 5.1)) + t * 2.7) * sin(dot(p, vec2(-4.9, 8.7)) - t * 3.1);
      float gate = smoothstep(0.55, 0.9, vn(vec2(t * 0.35, p.x * 0.3 + p.y * 0.2)));
      float glit = smoothstep(0.975, 0.998, s1) * gate * uGlint;
      tone = mix(tone, uHi, glit * 0.95);

      // 雨滴与波峰的边缘亮线
      float rim = clamp((hx - h0) * 9.0 + 0.0, 0.0, 1.0);
      tone = mix(tone, uHi, smoothstep(0.55, 0.9, rim) * 0.35);

      gl_FragColor = vec4(tone, uAlpha);
      #include <colorspace_fragment>
    }`,
};

// 每个倒影面各自持有一份 uniforms，避免共享状态
function cloneShader() {
  return {
    name: waterShader.name,
    uniforms: THREE.UniformsUtils.clone(waterShader.uniforms),
    vertexShader: waterShader.vertexShader,
    fragmentShader: waterShader.fragmentShader,
  };
}

const reflectors = [];
const reflectBusy = { on: false };
const rtScale = 0.6;

function guardReflector(r) {
  // 镜像的渲染过程中不再嵌套渲染其他倒影面，避免递归放大开销
  const orig = r.onBeforeRender;
  r.onBeforeRender = function (renderer, scene, camera) {
    if (reflectBusy.on) return;
    reflectBusy.on = true;
    try {
      orig.call(this, renderer, scene, camera);
    } finally {
      reflectBusy.on = false;
    }
  };
}

function makeReflector(geo, opts) {
  const sh = cloneShader();
  const r = new Reflector(geo, {
    shader: sh,
    clipBias: 0.003,
    textureWidth: Math.round(window.innerWidth * window.devicePixelRatio * rtScale),
    textureHeight: Math.round(window.innerHeight * window.devicePixelRatio * rtScale),
    multisample: 0,
  });
  const u = r.material.uniforms;
  u.uBase.value = new THREE.Color(opts.base);
  u.uDeep.value = new THREE.Color(opts.deep);
  u.uHi.value = new THREE.Color(opts.hi);
  u.uMid.value = new THREE.Color(opts.mid);
  u.uAlpha.value = opts.alpha;
  u.uAmp.value = opts.amp;
  u.uGlint.value = opts.glint;
  r.userData.glint = opts.glint;
  u.uWindO.value = new THREE.Vector2(WIND_ORIGIN.x, WIND_ORIGIN.z);
  r.material.transparent = true;
  r.material.depthWrite = false;
  guardReflector(r);
  reflectors.push(r);
  return r;
}

// 港湾水面
export function buildHarbourWater(scene) {
  const w = BAY.x1 - BAY.x0 - 0.04;
  const d = BAY.z1 - BAY.z0 - 0.04;
  const geo = new THREE.PlaneGeometry(w, d, 1, 1);
  const r = makeReflector(geo, { base: P.teal, deep: P.navy, hi: '#effdf9', mid: '#8fe0d4', alpha: 0.7, amp: 1.0, glint: 1 });
  r.rotation.x = -Math.PI / 2;
  r.position.set((BAY.x0 + BAY.x1) / 2, WATER_Y, (BAY.z0 + BAY.z1) / 2);
  r.renderOrder = 1;
  r.name = 'harbourWater';
  scene.add(r);
  return r;
}

// 水洼：码头低洼处的小水面，倒映灯柱、船和海鸥
export function buildPuddle(scene, x, z, radius, amp = 0.45) {
  const geo = new THREE.CircleGeometry(radius, 36);
  const r = makeReflector(geo, { base: '#5fb0a8', deep: '#1f4f5e', hi: '#f2fffb', mid: '#8fd6cc', alpha: 0.92, amp, glint: 0.4 });
  r.rotation.x = -Math.PI / 2;
  r.position.set(x, 0.012, z);
  r.renderOrder = 2;
  scene.add(r);
  return r;
}

// 水面的扰动源：船只航迹在水面上的圆形波纹（x, z, 发出时刻, 强度），固定 6 项
export const ripBuf = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -100, 0));

export function updateReflectors(t, rain, gusts, dim = 0) {
  for (const r of reflectors) {
    const u = r.material.uniforms;
    u.uTime.value = t;
    u.uRain.value = rain;
    u.uGustT.value = gusts;
    u.uRip.value = ripBuf;
    // 云影经过时粼光一起变淡
    u.uGlint.value = r.userData.glint * (1 - 0.6 * dim);
  }
}

export function resizeReflectors() {
  const w = Math.round(window.innerWidth * window.devicePixelRatio * rtScale);
  const h = Math.round(window.innerHeight * window.devicePixelRatio * rtScale);
  for (const r of reflectors) r.getRenderTarget().setSize(w, h);
}

// 水下：碎石海床、旧轮胎、锚链与锚、海草、沉底的小件
export function buildSeabed(b) {
  // 碎石（随机大小的小石块）
  for (let i = 0; i < 220; i++) {
    const x = BAY.x0 + 0.4 + hash1(i * 2.3 + 0.1) * (BAY.x1 - BAY.x0 - 0.8);
    const z = BAY.z0 + 0.4 + hash1(i * 4.7 + 1.9) * (BAY.z1 - BAY.z0 - 0.8);
    if (x > 4.5 && x < 7.4 && z > 0.0 && z < 2.6) continue; // 避开台阶与平台
    if (x > -4.5 && x < -3.5 && z > -2.5 && z < 0.5) continue; // 避开纵臂下的铁梯
    const s = 0.08 + hash1(i * 6.1) * 0.12;
    const c = [P.seabed, '#b7ac8f', '#d4cab0', P.rock][Math.floor(hash1(i * 7.7) * 4)];
    b.ell(s * 1.15, s * 0.55, s, c, { x, y: -3.72 + s * 0.2, z, ry: hash1(i) * 3, k: 'solid' }, 9, 6);
  }
  // 沉底的旧轮胎（平躺、叠放）
  const tyre = (x, y, z, rx, ry, rz) => {
    b.tor(0.34, 0.12, '#2e3537', { x, y, z, rx, ry, rz, k: 'solid' }, 8, 18);
    b.tor(0.2, 0.03, '#596366', { x, y: y + 0.01, z, rx, ry, rz, k: 'solid' }, 6, 14);
  };
  tyre(-1.8, -3.66, -8.1, -Math.PI / 2, 0.3, 0);
  tyre(-1.6, -3.66 + 0.2, -8.0, -Math.PI / 2 + 0.2, 0.3, 0.1);
  tyre(6.6, -3.7, -8.4, -Math.PI / 2, 0.8, 0.5);
  // 锚链：一串链环沿海床蜿蜒
  const chain = [];
  for (let i = 0; i < 16; i++) {
    const u = i / 15;
    const x = 0.2 + u * 2.6;
    const z = -0.7 - Math.sin(u * Math.PI * 1.5) * 0.55 - u * 0.6;
    chain.push([x, -3.62, z]);
  }
  for (let i = 0; i < chain.length - 1; i++) {
    const [x0, y0, z0] = chain[i];
    const [x1, y1, z1] = chain[i + 1];
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const ang = Math.atan2(z1 - z0, x1 - x0);
    b.tor(0.085, 0.022, '#7f8a8e', { x: mx, y: y0 + 0.02, z: mz, rx: i % 2 ? 0 : Math.PI / 2, ry: i % 2 ? Math.PI / 2 - ang : -ang, k: 'solid' }, 6, 12);
  }
  // 锚：横杆 + 锚爪
  const ax = 3.2, az = -0.4;
  b.cyl(0.04, 0.04, 0.7, '#6b7679', { x: ax, y: -3.55, z: az, rz: Math.PI / 2, k: 'solid' }, 8);
  b.box(0.06, 0.5, 0.06, '#6b7679', { x: ax, y: -3.42, z: az, k: 'solid' });
  b.box(0.07, 0.3, 0.05, '#6b7679', { x: ax - 0.14, y: -3.72, z: az, rz: 0.5, k: 'solid' });
  b.box(0.07, 0.3, 0.05, '#6b7679', { x: ax + 0.14, y: -3.72, z: az, rz: -0.5, k: 'solid' });
  b.box(0.2, 0.1, 0.08, '#6b7679', { x: ax, y: -3.26, z: az, k: 'solid' });
  // 海床上的短草（静止）
  for (let i = 0; i < 90; i++) {
    const x = BAY.x0 + 0.5 + hash1(i * 3.9 + 4.4) * 13;
    const z = BAY.z0 + 0.5 + hash1(i * 5.1 + 2.2) * 12;
    if (x > 4.5 && x < 7.4 && z > 0.0 && z < 2.6) continue;
    if (Math.abs(x - 3.2) < 0.5 && Math.abs(z + 0.4) < 0.5) continue;
    for (let k = 0; k < 3; k++) {
      const ox = (k - 1) * 0.04;
      b.ell(0.02, 0.1, 0.012, k === 1 ? P.seaweed : P.seaweedDark, { x: x + ox, y: -3.72 + 0.1, z, rz: (k - 1) * 0.3, k: 'thin' }, 4, 4);
    }
  }
  return b;
}

// 海草丛（会随水摆动）：返回若干组，每组的根在海床上
export function makeKelpGroups(scene, specs) {
  const groups = [];
  for (const s of specs) {
    const g = new THREE.Group();
    // 默认长在海床上；s.y、s.ry 可用于贴在岸壁上的海藻
    g.position.set(s.x, s.y ?? -3.7, s.z);
    g.rotation.y = s.ry || 0;
    const b = new Builder();
    const n = s.n || 6;
    for (let i = 0; i < n; i++) {
      const u = i / Math.max(1, n - 1);
      const off = (hash1(s.x * 13 + i * 7.1) - 0.5) * 0.36;
      const ang = (hash1(s.z * 9 + i * 3.3) - 0.5) * 0.9;
      const hh = s.h * (0.6 + 0.4 * hash1(i * 2.2 + s.x));
      for (let j = 0; j < 4; j++) {
        const yy = (j + 0.5) * hh / 4;
        b.ell(0.035, hh / 8, 0.012, j % 2 ? P.seaweed : P.seaweedDark, { x: off + Math.sin(ang) * yy * 0.2, y: yy, z: (i % 2 ? 0.01 : -0.01), rz: Math.sin(ang) * 0.6 + (j - 1.5) * 0.12 * (i % 2 ? 1 : -1), k: 'thin' }, 6, 4);
      }
    }
    b.finish(g);
    scene.add(g);
    groups.push({ g, phase: s.phase || 0, amp: s.amp || 0.18 });
  }
  return groups;
}

export function updateKelp(groups, t) {
  for (const k of groups) {
    const gs = 0.25 + 0.25 * wob(t * 0.8, k.phase) + 0.45 * wob(t * 1.9, k.phase + 2);
    k.g.rotation.z = Math.sin(t * 1.1 + k.phase) * k.amp * (0.6 + gs);
    k.g.rotation.x = Math.sin(t * 0.9 + k.phase * 2.0) * k.amp * 0.4;
  }
}

// 小鱼：几群鱼沿各自的 8 字形路线游动，尾巴摆动
export function makeFish(scene, schools) {
  const fish = [];
  for (let si = 0; si < schools.length; si++) {
    const s = schools[si];
    for (let i = 0; i < s.n; i++) {
      const g = new THREE.Group();
      const bodyB = new Builder();
      // 身体：背深腹浅，背鳍、眼睛与嘴
      bodyB.ell(0.2, 0.078, 0.068, s.color, { k: 'solid' }, 10, 6);
      bodyB.ell(0.17, 0.035, 0.05, '#f6ecd6', { y: -0.04, k: 'solid' }, 8, 4);
      bodyB.ell(0.05, 0.04, 0.008, s.color, { x: -0.03, y: 0.08, k: 'solid' }, 6, 4);
      bodyB.sph(0.02, '#2a2f33', { x: 0.13, y: 0.025, z: 0.05, k: 'solid' }, 5, 4);
      bodyB.sph(0.02, '#2a2f33', { x: 0.13, y: 0.025, z: -0.05, k: 'solid' }, 5, 4);
      bodyB.finish(g);
      // 尾鳍：分叉的两片
      const tailB = new Builder();
      tailB.ell(0.05, 0.095, 0.01, s.color, { x: -0.04, y: 0.06, rz: 0.35, k: 'solid' }, 6, 4);
      tailB.ell(0.05, 0.095, 0.01, s.color, { x: -0.04, y: -0.06, rz: -0.35, k: 'solid' }, 6, 4);
      const tail = new THREE.Group();
      tail.position.set(-0.2, 0, 0);
      tailB.finish(tail);
      tailB.bins.clear();
      g.add(tail);
      g.userData.tail = tail;
      scene.add(g);
      fish.push({ g, school: si, idx: i, s });
    }
  }
  return fish;
}

// scares：每一群鱼各自的受惊程度（0–1），镜头靠近某一群时只有那一群散开
export function updateFish(fish, t, scares) {
  for (const f of fish) {
    const scare = scares[f.school] || 0;
    const s = f.s;
    const ph = f.idx * 1.9 + f.school * 3.1;
    const sp = s.speed;
    // 群体中心与个体偏移
    const cx = s.cx + s.ax * Math.sin(t * sp * 0.11 + s.ph);
    const cz = s.cz + s.az * Math.sin(t * sp * 0.07 + s.ph * 1.3) * Math.cos(t * sp * 0.05);
    const ox = Math.sin(t * sp * 0.6 + ph) * 0.6 + Math.cos(t * sp * 0.37 + ph * 2) * 0.4;
    const oz = Math.cos(t * sp * 0.5 + ph) * 0.7;
    const oy = Math.sin(t * 0.9 + ph) * 0.12;
    let x = cx + ox, z = cz + oz, y = s.cy + oy;
    // 镜头靠近时散开，之后再聚拢
    const dirx = x - cx, dirz = z - cz;
    const k = scare * 0.9;
    x += dirx * k + Math.sin(ph * 5) * k;
    z += dirz * k + Math.cos(ph * 3) * k;
    y += k * 0.2;
    f.g.position.set(x, y, z);
    // 朝向：取数值导数
    const e = 0.05;
    const nx = cx + s.ax * Math.sin((t + e) * sp * 0.11 + s.ph) + Math.sin((t + e) * sp * 0.6 + ph) * 0.6;
    const nz = cz + Math.cos((t + e) * sp * 0.5 + ph) * 0.7;
    f.g.rotation.set(0, -Math.atan2(nz - z, nx - x), 0);
    f.g.userData.tail.rotation.y = Math.sin(t * 14 + ph) * 0.45;
  }
}

export function fishSchools() {
  return [
    { n: 5, cx: 2.2, cz: -4.2, ax: 3.4, az: 2.2, cy: -2.6, speed: 1.0, ph: 0.3, color: '#f2a25a' },
    { n: 4, cx: 4.8, cz: -1.2, ax: 2.2, az: 1.6, cy: -2.1, speed: 0.8, ph: 2.1, color: '#8fd6e0' },
    { n: 4, cx: -1.0, cz: -7.2, ax: 2.5, az: 1.0, cy: -3.1, speed: 1.2, ph: 4.0, color: '#f6d56a' },
  ];
}
