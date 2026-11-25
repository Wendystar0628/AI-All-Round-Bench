// 三维场景①：B200 封装（毫米尺度）
// 两颗计算晶粒 + 8 个 HBM3e 堆栈（8 层 DRAM + 1 层基础逻辑晶粒）+ 带 LSI 硅桥的中介层 + 有机基板
// 支持：爆炸拆分、剖切截面、跨接缝的数据流、标注锚点
import * as THREE from 'three';
import { DIE_W, DIE_D, GAP, toXZ, LAYOUT } from '../floorplan.js';
import { createLoom } from './loom.js';
import { dieTextures, interposerTexture, substrateTexture, dotTexture } from '../textures.js';
import { sectionize } from '../gl.js';
import { rng } from '../util.js';

export const VOLT = new THREE.Color('#b8f24a');
export const ICE = new THREE.Color('#7ce0ff');
export const AMBER = new THREE.Color('#ffb347');

// 高度（mm），基板顶面 y = 0
const H = {
  subT: 2.4, bgaR: 0.42, c4H: 0.6, ipT: 0.7, ubH: 0.16, dieT: 0.9, baseT: 0.14, dramT: 0.085,
};
H.ipBot = H.c4H; H.ipTop = H.ipBot + H.ipT; H.dieBot = H.ipTop + H.ubH; H.dieTop = H.dieBot + H.dieT;
export const PKG_H = H;
export const HBM_W = 10.4, HBM_D = 11.0;
export const SPREAD = 7.5;
export const IP_HW = 27.4, IP_HD = 29.4, SUB_H = 40;

let _tex = null;
function textures() {
  if (_tex) return _tex;
  const die = dieTextures();
  const dieR = { map: die.map.clone(), emi: die.emi.clone() };
  for (const t of [dieR.map, dieR.emi]) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1; t.needsUpdate = true; }
  _tex = { die, dieR, ip: interposerTexture(), sub: substrateTexture(), dot: dotTexture() };
  return _tex;
}

export const pkgTextures = () => textures();

export function hbmPositions() {
  const out = [];
  for (let d = 0; d < 2; d++) for (const uc of [0.275, 0.725]) for (const side of [-1, 1]) {
    const x = toXZ(d, uc, 0)[0];
    const z = side * (DIE_D / 2 + 0.8 + HBM_D / 2);
    out.push({ x, z, die: d, side });
  }
  return out;
}

/**
 * 构建封装模型。lite=true 时用于服务器场景（无凸点、无分层、无剖切）。
 */
export function buildPackage({ lite = false, clip = null } = {}) {
  const T = textures();
  const g = new THREE.Group();
  const parts = {};
  const R = rng(7);
  const clipping = clip ? [clip] : [];
  const sec = (m, c, hh) => (lite ? m : sectionize(m, c, hh));
  const withClip = (m) => { m.clippingPlanes = clipping; m.clipShadows = true; return m; };

  // ── 材质 ──
  const M = {
    dieTop: (d) => withClip(new THREE.MeshPhysicalMaterial({
      map: d.map, emissiveMap: d.emi, emissive: 0xffffff, emissiveIntensity: 0.55,
      roughness: 0.2, metalness: 0.4, iridescence: 1, iridescenceIOR: 1.55,
      iridescenceThicknessRange: [240, 720], clearcoat: lite ? 0.2 : 0.7, clearcoatRoughness: 0.12,
    })),
    dieSide: withClip(sec(new THREE.MeshStandardMaterial({ color: 0x3b414a, roughness: 0.32, metalness: 0.6 }), '#a9b6c6', 0.3)),
    dram: withClip(sec(new THREE.MeshPhysicalMaterial({ color: 0xd8dde4, roughness: 0.7, metalness: 0.1, clearcoat: 0.05, clearcoatRoughness: 0.6, specularIntensity: 0.45 }), '#8fa0b4', 0.25)),
    ip: withClip(sec(new THREE.MeshPhysicalMaterial({ map: T.ip, roughness: 0.48, metalness: 0.3, specularIntensity: 0.5, iridescence: 0.7, iridescenceIOR: 1.4, iridescenceThicknessRange: [300, 820] }), '#7d8896', 0.35)),
    sub: withClip(sec(new THREE.MeshStandardMaterial({ map: T.sub, roughness: 0.72, metalness: 0.12 }), '#40664c', 0.4)),
    cu: withClip(sec(new THREE.MeshStandardMaterial({ color: 0xc98a52, roughness: 0.5, metalness: 0.9 }), '#f0a868', 0)),
    solder: withClip(sec(new THREE.MeshStandardMaterial({ color: 0xb9bdc3, roughness: 0.42, metalness: 0.95 }), '#cfd4da', 0)),
    cap: withClip(new THREE.MeshStandardMaterial({ color: 0x75583f, roughness: 0.5, metalness: 0.3 })),
    ring: withClip(sec(new THREE.MeshPhysicalMaterial({ color: 0x2c3036, roughness: 0.62, metalness: 1, anisotropy: 0.6 }), '#b9c0c8', 0.3)),
    bridge: withClip(new THREE.MeshStandardMaterial({ color: 0x1d2a12, emissive: VOLT, emissiveIntensity: 0.5, roughness: 0.4 })),
  };
  parts.materials = M;

  // ── 基板 ──
  const sub = new THREE.Mesh(new THREE.BoxGeometry(SUB_H * 2, H.subT, SUB_H * 2), [M.sub, M.sub, M.sub, M.sub, M.sub, M.sub]);
  sub.position.y = -H.subT / 2;
  sub.castShadow = sub.receiveShadow = !lite;
  g.add(sub);
  parts.sub = new THREE.Group(); parts.sub.add(sub); g.add(parts.sub);

  // 加强框（拉丝金属，各向异性反光）
  const ringG = new THREE.Group();
  const rw = 2.6, rh = 1.1, L = SUB_H * 2 - 1.2;
  for (const [sx, sz, w, d] of [[0, -(SUB_H - 0.6 - rw / 2), L, rw], [0, SUB_H - 0.6 - rw / 2, L, rw], [-(SUB_H - 0.6 - rw / 2), 0, rw, L - rw * 2], [SUB_H - 0.6 - rw / 2, 0, rw, L - rw * 2]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, rh, d), M.ring);
    m.position.set(sx, rh / 2, sz);
    m.castShadow = !lite;
    ringG.add(m);
  }
  parts.sub.add(ringG);

  // 表贴电容
  {
    const caps = [];
    for (let i = 0; i < 26; i++) for (const s of [-1, 1]) {
      caps.push([-30 + i * 2.4, s * (IP_HD + 3.2)]);
      caps.push([-30 + i * 2.4, s * (IP_HD + 5.6)]);
    }
    for (let i = 0; i < 22; i++) for (const s of [-1, 1]) {
      caps.push([s * (IP_HW + 3.2), -26 + i * 2.5]);
      caps.push([s * (IP_HW + 5.8), -26 + i * 2.5]);
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.55, 0.55), M.cap, caps.length);
    const o = new THREE.Object3D();
    caps.forEach(([x, z], i) => { o.position.set(x, 0.28, z); o.rotation.y = Math.abs(x) > IP_HW + 2 ? Math.PI / 2 : 0; o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    parts.sub.add(im);
  }

  // ── BGA 焊球 ──
  if (!lite) {
    const n = 36, pitch = (SUB_H * 2 - 6) / (n - 1);
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(H.bgaR, 10, 8), M.solder, n * n);
    const o = new THREE.Object3D(); let k = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      o.position.set(-SUB_H + 3 + i * pitch, 0, -SUB_H + 3 + j * pitch); o.updateMatrix(); im.setMatrixAt(k++, o.matrix);
    }
    parts.bga = new THREE.Group(); parts.bga.add(im);
    parts.bga.userData.base = -H.subT - H.bgaR * 0.8;
    g.add(parts.bga);
  }

  // ── C4 凸点 ──
  if (!lite) {
    const nx = 30, nz = 32;
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.34, H.c4H, 10), M.solder, nx * nz);
    const o = new THREE.Object3D(); let k = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      o.position.set(-IP_HW + 1.4 + (i * (IP_HW * 2 - 2.8)) / (nx - 1), 0, -IP_HD + 1.4 + (j * (IP_HD * 2 - 2.8)) / (nz - 1));
      o.updateMatrix(); im.setMatrixAt(k++, o.matrix);
    }
    im.castShadow = true;
    parts.c4 = new THREE.Group(); parts.c4.add(im);
    parts.c4.userData.base = H.c4H / 2;
    g.add(parts.c4);
  }

  // ── 中介层 + LSI 硅桥 ──
  parts.ip = new THREE.Group();
  {
    const ip = new THREE.Mesh(new THREE.BoxGeometry(IP_HW * 2, H.ipT, IP_HD * 2), M.ip);
    ip.position.y = H.ipBot + H.ipT / 2;
    ip.castShadow = ip.receiveShadow = !lite;
    parts.ip.add(ip);
  }
  parts.bridges = new THREE.Group();
  {
    const bh = 0.12;
    const add = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, bh, d), M.bridge); m.position.set(x, H.ipTop + bh / 2 - 0.02, z); parts.bridges.add(m); };
    add(0, -8, 3.2, 9); add(0, 8, 3.2, 9);
    for (const hp of hbmPositions()) add(hp.x, hp.side * (DIE_D / 2 + 0.4), 7.5, 2.6);
  }
  parts.ip.add(parts.bridges);
  g.add(parts.ip);

  // ── 微凸点 ──
  if (!lite) {
    const list = [];
    for (let d = 0; d < 2; d++) for (let i = 0; i < 22; i++) for (let j = 0; j < 28; j++) {
      const [x, z] = toXZ(d, 0.04 + (i / 21) * 0.92, 0.04 + (j / 27) * 0.92); list.push([x, z]);
    }
    for (const hp of hbmPositions()) for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) list.push([hp.x - 4 + i, hp.z - 4.2 + j * 1.05]);
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, H.ubH, 8), M.cu, list.length);
    const o = new THREE.Object3D();
    list.forEach(([x, z], k) => { o.position.set(x, 0, z); o.updateMatrix(); im.setMatrixAt(k, o.matrix); });
    parts.ub = new THREE.Group(); parts.ub.add(im);
    parts.ub.userData.base = H.ipTop + H.ubH / 2;
    g.add(parts.ub);
  }

  // ── 计算晶粒 ×2 ──
  parts.dies = new THREE.Group();
  parts.dieTops = [];
  for (let d = 0; d < 2; d++) {
    const x = d === 0 ? -(DIE_W / 2 + GAP / 2) : DIE_W / 2 + GAP / 2;
    const box = new THREE.Mesh(new THREE.BoxGeometry(DIE_W, H.dieT, DIE_D), M.dieSide);
    box.position.set(x, H.dieBot + H.dieT / 2, 0);
    box.castShadow = box.receiveShadow = !lite;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(DIE_W, DIE_D), M.dieTop(d === 0 ? T.die : T.dieR));
    top.rotation.x = -Math.PI / 2;
    top.position.set(x, H.dieTop + 0.002, 0);
    top.receiveShadow = !lite;
    parts.dies.add(box, top);
    parts.dieTops.push(top);
  }
  // 接缝：发光的细带
  {
    const m = new THREE.MeshBasicMaterial({ color: VOLT.clone().multiplyScalar(2.6), toneMapped: false });
    if (clip) m.clippingPlanes = clipping;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(GAP * 0.7, H.dieT * 0.96, DIE_D * 0.97), m);
    seam.position.set(0, H.dieBot + H.dieT / 2, 0);
    parts.seam = seam; parts.seamMat = m;
    parts.dies.add(seam);
  }
  g.add(parts.dies);

  // ── HBM3e 堆栈：1 层基础逻辑晶粒 + 8 层 DRAM（实例化）──
  parts.hbm = hbmPositions();
  {
    const layers = lite ? 1 : 9;
    const geo = new THREE.BoxGeometry(HBM_W, 1, HBM_D);
    const im = new THREE.InstancedMesh(geo, M.dram, parts.hbm.length * layers);
    const c = new THREE.Color();
    for (let s = 0; s < parts.hbm.length; s++) for (let l = 0; l < layers; l++) {
      const k = s * layers + l;
      if (lite) c.set('#24272d'); else if (l === 0) c.set('#5a4a3a'); else c.set(l % 2 ? '#2a2e35' : '#22252b');
      im.setColorAt(k, c);
    }
    im.castShadow = im.receiveShadow = !lite;
    parts.hbmIM = im; parts.hbmLayers = layers;
    g.add(im);
  }
  // TSV：贯穿 DRAM 层的竖直通孔
  if (!lite) {
    const n = parts.hbm.length * 16;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    const mat = new THREE.LineBasicMaterial({ color: VOLT.clone().multiplyScalar(1.8), transparent: true, opacity: 0, toneMapped: false });
    mat.clippingPlanes = clipping;
    parts.tsv = new THREE.LineSegments(geo, mat);
    g.add(parts.tsv);
  }

  // ── 跨接缝的数据流（粒子）──
  {
    const N = lite ? 0 : 260;
    if (N) {
      const geo = new THREE.BufferGeometry();
      const seed = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { seed[i * 3] = R(); seed[i * 3 + 1] = R(); seed[i * 3 + 2] = R(); }
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uAmt: { value: 1 }, uY: { value: H.dieTop + 0.08 }, uMap: { value: T.dot }, uScale: { value: 1 }, uColor: { value: VOLT.clone().multiplyScalar(2.2) } },
        vertexShader: /* glsl */ `
          #include <clipping_planes_pars_vertex>
          attribute vec3 aSeed; uniform float uTime, uAmt, uY, uScale; varying float vA;
          void main(){
            float dir = aSeed.x < 0.5 ? 1.0 : -1.0;
            float t = fract(uTime*(0.18+aSeed.y*0.22) + aSeed.z*7.0);
            float x = dir*mix(-9.0, 9.0, t);
            float z = (aSeed.y-0.5)*30.0;
            vec3 p = vec3(x, uY, z);
            vA = uAmt * smoothstep(0.0,0.25,t)*smoothstep(1.0,0.75,t) * (0.5+0.5*smoothstep(3.5,0.0,abs(x)));
            vec4 mv = modelViewMatrix*vec4(p,1.0);
            vec4 mvPosition = mv;
            #include <clipping_planes_vertex>
            gl_PointSize = uScale*(1.4+2.2*aSeed.z)*(300.0/-mv.z);
            gl_Position = projectionMatrix*mv;
          }`,
        clipping: true,
        fragmentShader: /* glsl */ `#include <clipping_planes_pars_fragment>
          uniform sampler2D uMap; uniform vec3 uColor; varying float vA;
          void main(){
            #include <clipping_planes_fragment>
            float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(uColor*a*vA, a*vA); }`,
      });
      mat.clippingPlanes = clipping;
      parts.flow = new THREE.Points(geo, mat);
      parts.flow.frustumCulled = false;
      parts.dies.add(parts.flow);
    }
  }

  const o = new THREE.Object3D();
  const tsvPos = parts.tsv ? parts.tsv.geometry.attributes.position.array : null;
  let lastE = -1, lastSp = -1;
  /** e: 0..1 爆炸程度；sp: 0..1 显存堆栈向外展开 */
  function setExplode(e, sp = 0) {
    if (Math.abs(e - lastE) < 1e-5 && Math.abs(sp - lastSp) < 1e-5) return;
    lastE = e; lastSp = sp;
    const lift = (k) => k * e;
    if (parts.bga) parts.bga.position.y = parts.bga.userData.base - lift(4);
    if (parts.c4) parts.c4.position.y = parts.c4.userData.base + lift(2.6);
    parts.ip.position.y = lift(5.2);
    parts.bridges.position.y = lift(0.9);
    if (parts.ub) parts.ub.position.y = parts.ub.userData.base + lift(8.2);
    parts.dies.position.y = lift(11);
    const layers = parts.hbmLayers;
    let k = 0, t = 0;
    for (const hp of parts.hbm) {
      let y = H.dieBot + lift(11);
      for (let l = 0; l < layers; l++) {
        const th = lite ? H.dieT * 0.92 : l === 0 ? H.baseT : H.dramT;
        const gap = l === 0 ? 0 : lift(1.15);
        y += gap;
        o.position.set(hp.x, y + th / 2, hp.z + hp.side * SPREAD * sp);
        o.scale.set(1, th, 1);
        o.updateMatrix();
        parts.hbmIM.setMatrixAt(k++, o.matrix);
        y += th;
      }
      if (tsvPos) {
        const y0 = H.dieBot + lift(11) + 0.02, y1 = y - 0.02;
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          const x = hp.x - 3.3 + i * 2.2, z = hp.z + hp.side * SPREAD * sp - 3.3 + j * 2.2;
          tsvPos.set([x, y0, z, x, y1, z], t); t += 6;
        }
      }
    }
    parts.hbmIM.instanceMatrix.needsUpdate = true;
    parts.hbmIM.computeBoundingSphere();
    if (parts.tsv) { parts.tsv.geometry.attributes.position.needsUpdate = true; parts.tsv.material.opacity = Math.min(1, e * 1.6) * 0.9; }
  }
  setExplode(0);

  /** 标注锚点（局部坐标，考虑爆炸偏移） */
  function anchor(name, out = new THREE.Vector3()) {
    const e = lastE;
    const hp = parts.hbm[1];
    switch (name) {
      case 'dieL': return out.set(-DIE_W * 0.55, H.dieTop + 11 * e, -DIE_D * 0.18);
      case 'dieR': return out.set(DIE_W * 0.6, H.dieTop + 11 * e, -DIE_D * 0.1);
      case 'seam': return out.set(0, H.dieTop + 11 * e, 0);
      case 'seamTop': return out.set(0, H.dieTop + 11 * e, -DIE_D / 2);
      case 'seamBot': return out.set(0, H.dieTop + 11 * e, DIE_D / 2);
      case 'hbm': return out.set(hp.x + HBM_W * 0.3, H.dieBot + 11 * e + (lite ? H.dieT : H.baseT + 8 * (H.dramT + 1.15 * e)), hp.z);
      case 'hbmBase': return out.set(hp.x - HBM_W / 2, H.dieBot + 11 * e + H.baseT / 2, hp.z + HBM_D * 0.3);
      case 'tsv': return out.set(hp.x - 1.1, H.dieBot + 11 * e + 5 * e, hp.z - 1.1);
      case 'ub': return out.set(-DIE_W * 0.9, H.ipTop + H.ubH / 2 + 8.2 * e, DIE_D * 0.45);
      case 'ip': return out.set(IP_HW * 0.92, H.ipTop + 5.2 * e, IP_HD * 0.85);
      case 'bridge': return out.set(0, H.ipTop + 5.2 * e + 0.9 * e, 8);
      case 'c4': return out.set(-IP_HW * 0.9, H.c4H / 2 + 2.6 * e, IP_HD * 0.9);
      case 'sub': return out.set(SUB_H * 0.85, 0, SUB_H * 0.7);
      case 'bga': return out.set(SUB_H * 0.7, -H.subT - 0.4 - 4 * e, SUB_H * 0.9);
      default: return out.set(0, 0, 0);
    }
  }

  return { group: g, parts, setExplode, anchor, get explode() { return lastE; }, get spread() { return lastSp; } };
}

/** 封装场景：灯光、地面网格、剖切面 */
export function createPkgScene(gl) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050607);
  scene.environment = gl.env;
  scene.environmentIntensity = 0.32;
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 2000);

  const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 200);
  const pkg = buildPackage({ clip: cutPlane });
  const root = new THREE.Group();
  root.add(pkg.group);
  scene.add(root);

  // 灯光
  const key = new THREE.DirectionalLight(0xffe2c0, 2.4);
  key.position.set(-60, 90, 40);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 260 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fd4ff, 2.2);
  rim.position.set(70, 30, -90);
  scene.add(rim);
  const fill = new THREE.HemisphereLight(0x9fb4c8, 0x0a0c08, 0.35);
  scene.add(fill);
  const sweep = new THREE.DirectionalLight(0xe8f4ff, 1.2);
  scene.add(sweep);

  // 地面：技术制图式网格，径向淡出
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uCol: { value: new THREE.Color('#6d7a86') }, uAmt: { value: 1 } },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: /* glsl */ `varying vec2 vP; uniform vec3 uCol; uniform float uAmt;
        float grid(vec2 p, float s){ vec2 g = abs(fract(p/s-0.5)-0.5)/fwidth(p/s); return 1.0-min(min(g.x,g.y),1.0); }
        void main(){
          float r = length(vP);
          float a = grid(vP, 10.0)*0.10 + grid(vP, 50.0)*0.22;
          a *= smoothstep(260.0, 40.0, r)*uAmt;
          gl_FragColor = vec4(uCol*a, a);
        }`,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -16;
  scene.add(floor);

  // 光晕：封装下方的一圈柔光，把主体从黑暗里托出来
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uAmt: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec2 vUv; uniform float uAmt, uTime; void main(){ vec2 d = vUv-0.5; float r = length(d);
      float a = exp(-r*r*18.0)*0.22 + exp(-r*r*120.0)*0.25; float seam = exp(-d.x*d.x*900.0)*exp(-d.y*d.y*16.0)*0.35;
      vec3 c = vec3(0.45,0.62,0.2)*a + vec3(0.72,0.95,0.29)*seam*(0.8+0.2*sin(uTime*1.7));
      gl_FragColor = vec4(c*uAmt, 1.0); }`,
  }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = -15.8;
  scene.add(halo);
  // 漂浮的微尘
  const motes = (() => {
    const N = 420, R = rng(77);
    const geo = new THREE.BufferGeometry();
    const sd = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) sd.set([R(), R(), R(), R()], i * 4);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
    const m = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uAmt: { value: 1 }, uMap: { value: textures().dot }, uScale: { value: 1 } },
      vertexShader: `attribute vec4 aSeed; uniform float uTime, uScale; varying float vA;
        void main(){ vec3 p = (aSeed.xyz-0.5)*vec3(220.0, 90.0, 160.0); p.y += mod(uTime*(0.6+aSeed.w*1.4) + aSeed.y*90.0, 90.0) - p.y*0.0 - 45.0 + 10.0;
          p.x += sin(uTime*0.2 + aSeed.z*20.0)*4.0;
          vec4 mv = modelViewMatrix*vec4(p,1.0); vA = (0.3+0.7*aSeed.w)*smoothstep(-500.0,-120.0,mv.z);
          gl_PointSize = uScale*(1.0+2.0*aSeed.w)*(260.0/-mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uMap; uniform float uAmt; varying float vA; void main(){ float a = texture2D(uMap, gl_PointCoord).a*vA*uAmt; gl_FragColor = vec4(vec3(0.75,0.9,0.7)*a*0.9, a); }`,
    }));
    m.frustumCulled = false;
    return m;
  })();
  scene.add(motes);

  // 剖切面可视化
  const cutVis = new THREE.Group();
  {
    const w = 92, y0 = -8, y1 = 26;
    const pts = [[-w / 2, y0], [w / 2, y0], [w / 2, y1], [-w / 2, y1], [-w / 2, y0]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: VOLT.clone().multiplyScalar(1.6), transparent: true, opacity: 0.55, toneMapped: false }));
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, y1 - y0), new THREE.MeshBasicMaterial({ color: VOLT, transparent: true, opacity: 0.012, depthWrite: false, side: THREE.DoubleSide }));
    plane.position.y = (y0 + y1) / 2;
    cutVis.add(line, plane);
    cutVis.userData = { line, plane };
  }
  pkg.group.add(cutVis);


  // ════ 数据之河（第 3 章）：全部长在封装的真实结构上 ════
  const river = (() => {
    const R2 = rng(303);
    const HB = pkg.parts.hbm;
    const sms = LAYOUT.sms;
    // 每个 SM 由同一颗晶粒、同一侧、最近的那座 HBM 堆栈供数
    const stackOf = sms.map((sm) => { let bi = 0, bd = 1e9; HB.forEach((hp, k) => { if (hp.die !== sm.die || hp.side !== (sm.z > 0 ? 1 : -1)) return; const d = Math.abs(hp.x - sm.x); if (d < bd) { bd = d; bi = k; } }); return bi; });
    const grp = new THREE.Group();
    pkg.group.add(grp);
    // 中介层上的走线（RDL）：从 HBM 脚下到晶粒的 HBM 接口，展开后露出
    const traces = HB.map((hp) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(22 * 6), 3));
      const mat = new THREE.LineBasicMaterial({ color: new THREE.Color('#ffb347').multiplyScalar(1.4), transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
      const ls = new THREE.LineSegments(geo, mat); ls.frustumCulled = false; grp.add(ls);
      return { ls, hp };
    });
    // HBM 顶面的光
    const glows = HB.map(() => { const q = new THREE.Mesh(new THREE.PlaneGeometry(HBM_W * 1.05, HBM_D * 1.05), new THREE.MeshBasicMaterial({ map: textures().dot, color: new THREE.Color('#ffb347'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); q.rotation.x = -Math.PI / 2; grp.add(q); return q; });
    // 晶粒上的 SM：空等时暗着、边缘闪琥珀色；供得上时成片亮起
    const smGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const smU = { uTime: { value: 0 }, uFeed: { value: new Array(8).fill(0) }, uAmt: { value: 0 } };
    const smIM = new THREE.InstancedMesh(smGeo, new THREE.ShaderMaterial({
      uniforms: smU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aStack, aSeed; uniform float uFeed[8]; varying vec2 vUv; varying float vF, vSeed;
        void main(){ vUv = uv; vSeed = aSeed; vF = uFeed[int(aStack + 0.5)];
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime, uAmt; varying vec2 vUv; varying float vF, vSeed;
        void main(){
          vec2 q = vUv; float e = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));
          float rim = 1.0 - smoothstep(0.0, 0.07, e);
          vec2 c = fract(q*vec2(2.0, 2.0)); float tc = step(0.55, c.x)*step(c.x, 0.92)*step(0.18, c.y)*step(c.y, 0.82)*step(q.y, 0.8);
          float busy = smoothstep(0.15 + vSeed*0.25, 0.55 + vSeed*0.3, vF);
          float fl = 0.75 + 0.25*sin(uTime*13.0 + vSeed*40.0 + q.x*7.0);
          float wait = (1.0 - busy)*pow(0.5 + 0.5*sin(uTime*1.7 + vSeed*9.0), 3.0);
          vec3 col = vec3(0.72,0.95,0.29)*(tc*1.7*fl + rim*0.6 + 0.12)*busy + vec3(1.0,0.62,0.22)*rim*wait*0.9;
          gl_FragColor = vec4(col*uAmt, 1.0);
        }`,
    }), sms.length);
    const om = new THREE.Object3D();
    const aSt = new Float32Array(sms.length), aSd = new Float32Array(sms.length);
    sms.forEach((sm, i) => { om.position.set(sm.x, H.dieTop + 0.015, sm.z); om.scale.set(sm.w, 1, sm.d); om.updateMatrix(); smIM.setMatrixAt(i, om.matrix); aSt[i] = stackOf[i]; aSd[i] = R2(); });
    smGeo.setAttribute('aStack', new THREE.InstancedBufferAttribute(aSt, 1));
    smGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSd, 1));
    smIM.frustumCulled = false;
    pkg.parts.dies.add(smIM);
    // 光点：每个 SM 一束，沿 8 个结构点走完全程（y 与拆开程度、z 与展开程度相关）
    const per = 36, back = 10, N = sms.length * (per + back);
    const P = [...Array(8)].map(() => new Float32Array(N * 4));
    const META = new Float32Array(N * 4);
    let n = 0;
    const L2Z = 0.75;
    sms.forEach((sm, i) => {
      const hp = HB[stackOf[i]], side = hp.side;
      for (let j = 0; j < per + back; j++) {
        const jx = R2() - 0.5, jz = R2() - 0.5, lane = (R2() - 0.5);
        const x0 = hp.x + jx * 6.6, z0 = hp.z + jz * 6.6;
        const xb = hp.x + jx * 7.4;
        const ze = side * (DIE_D / 2 - 0.7);
        const xl = xb + lane * 0.6;
        const pts = [
          [x0, H.dieBot + 0.8, z0, 11 + 9.2], [x0, H.dieBot + 0.07, z0, 11],
          [x0, H.ipTop + 0.04, z0, 5.2], [xb, H.ipTop + 0.04, ze, 5.2],
          [xb, H.dieTop + 0.05, ze, 11], [xl, H.dieTop + 0.05, side * L2Z, 11],
          [sm.x + lane * 0.4, H.dieTop + 0.05, side * L2Z, 11], [sm.x + lane * 0.6, H.dieTop + 0.05, sm.z + lane * 0.5, 11],
        ];
        pts.forEach((pp, k) => P[k].set(pp, n * 4));
        META.set([R2(), stackOf[i], j >= per ? 1 : 0, side], n * 4);
        n++;
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    P.forEach((arr, k) => geo.setAttribute('aP' + k, new THREE.BufferAttribute(arr, 4)));
    geo.setAttribute('aM', new THREE.BufferAttribute(META, 4));
    const U = { uTime: { value: 0 }, uFeed: { value: new Array(8).fill(0) }, uAmt: { value: 0 }, uE: { value: 0 }, uSp: { value: 0 }, uScale: { value: 1 }, uMap: { value: textures().dot } };
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aP0, aP1, aP2, aP3, aP4, aP5, aP6, aP7, aM;
        uniform float uTime, uAmt, uE, uSp, uScale; uniform float uFeed[8];
        varying float vA; varying vec3 vC;
        vec3 at(vec4 p, float spr){ return vec3(p.x, p.y + p.w*uE, p.z + spr*aM.w*${SPREAD.toFixed(1)}*uSp); }
        void main(){
          float fd = uFeed[int(aM.y + 0.5)];
          float vis = step(aM.x, mix(0.04, 1.0, fd));
          float t = fract(uTime*mix(0.05, 0.2, fd)*(0.8 + aM.x*0.4) + aM.x*23.17);
          if (aM.z > 0.5) t = 1.0 - t;
          vec3 p;
          if (t < 0.07) p = mix(at(aP0,1.), at(aP1,1.), t/0.07);
          else if (t < 0.11) p = mix(at(aP1,1.), at(aP2,1.), (t-0.07)/0.04);
          else if (t < 0.31) p = mix(at(aP2,1.), at(aP3,0.), (t-0.11)/0.2);
          else if (t < 0.35) p = mix(at(aP3,0.), at(aP4,0.), (t-0.31)/0.04);
          else if (t < 0.6) p = mix(at(aP4,0.), at(aP5,0.), (t-0.35)/0.25);
          else if (t < 0.8) p = mix(at(aP5,0.), at(aP6,0.), (t-0.6)/0.2);
          else p = mix(at(aP6,0.), at(aP7,0.), (t-0.8)/0.2);
          vA = vis*uAmt*smoothstep(0.0, 0.03, t)*smoothstep(1.0, 0.96, t)*(aM.z > 0.5 ? 0.6 : 1.0);
          vC = aM.z > 0.5 ? vec3(0.49, 0.88, 1.0) : mix(vec3(1.0, 0.68, 0.26), vec3(0.78, 1.0, 0.36), smoothstep(0.3, 0.45, t));
          vec4 mv = modelViewMatrix*vec4(p, 1.0);
          gl_PointSize = uScale*(2.0 + 2.0*aM.x)*(150.0/-mv.z);
          gl_Position = projectionMatrix*mv;
        }`,
      fragmentShader: /* glsl */ `uniform sampler2D uMap; varying float vA; varying vec3 vC;
        void main(){ float a = texture2D(uMap, gl_PointCoord).a*vA; gl_FragColor = vec4(vC*a*2.2, a); }`,
    }));
    pts.frustumCulled = false;
    grp.add(pts);
    let lastKey = '';
    const api = {
      grp, smIM, U, smU, stackOf,
      update(t, o, e, sp) {
        const amt = o.river ?? 0, feeds = o.feeds;
        grp.visible = amt > 0.001;
        smIM.visible = (o.smAct ?? amt) > 0.001;
        U.uTime.value = t; smU.uTime.value = t;
        U.uAmt.value = amt; smU.uAmt.value = o.smAct ?? amt;
        U.uE.value = e; U.uSp.value = sp;
        U.uScale.value = Math.max(0.6, gl.renderer.getPixelRatio() * (window.innerHeight / 1080));
        for (let k = 0; k < 8; k++) { const f = feeds ? feeds[k] : 0; U.uFeed.value[k] = f; smU.uFeed.value[k] = f; }
        if (!grp.visible) return;
        const key = e.toFixed(4) + '_' + sp.toFixed(4);
        traces.forEach(({ ls, hp }, k) => {
          const f = feeds ? feeds[k] : 0;
          ls.material.opacity = amt * (0.18 + 0.6 * f);
          if (key !== lastKey) {
            const arr = ls.geometry.attributes.position.array, y = H.ipTop + 0.03 + 5.2 * e;
            const zA = hp.z + hp.side * SPREAD * sp, zB = hp.side * (DIE_D / 2 - 0.7);
            for (let i = 0; i < 22; i++) { const x = hp.x - 3.7 + (i / 21) * 7.4; arr.set([x, y, zA, x, y, zB], i * 6); }
            ls.geometry.attributes.position.needsUpdate = true;
          }
          const q = glows[k];
          q.position.set(hp.x, H.dieBot + 11 * e + H.baseT + 8 * (H.dramT + 1.15 * e) + 0.05, hp.z + hp.side * SPREAD * sp);
          q.material.opacity = amt * (0.03 + 0.28 * f);
        });
        lastKey = key;
      },
    };
    return api;
  })();
  const loom = createLoom(scene, gl);
  const def = { scene, camera, pkg, root, cutPlane, cutVis, key, rim, sweep, floor, halo, motes, river, loom };
  /** 每帧：c = 剖切位置（z，mm；≥ 40 视为不剖），e = 爆炸程度 */
  def.update = (t, o = {}) => {
    const { explode = 0, cut = 200, flow = 1, seamGlow = 1, sweepAmt = 1, halo: haloAmt = 1, motes: moteAmt = 0, spread = 0 } = o;
    river.update(t, o, explode, spread);
    if (!o.loom) loom.mesh.visible = false;
    halo.material.uniforms.uAmt.value = haloAmt; halo.material.uniforms.uTime.value = t;
    motes.visible = moteAmt > 0.001;
    motes.material.uniforms.uTime.value = t; motes.material.uniforms.uAmt.value = moteAmt;
    motes.material.uniforms.uScale.value = Math.max(0.6, gl.renderer.getPixelRatio() * (window.innerHeight / 1080));
    pkg.setExplode(explode, spread);
    cutPlane.constant = cut;
    const active = cut < 38;
    cutVis.visible = active;
    cutVis.position.z = cut;
    if (pkg.parts.flow) { pkg.parts.flow.material.uniforms.uTime.value = t; pkg.parts.flow.material.uniforms.uAmt.value = flow; pkg.parts.flow.material.uniforms.uScale.value = Math.max(0.6, gl.renderer.getPixelRatio() * (window.innerHeight / 1080)); }
    pkg.parts.seamMat.color.copy(VOLT).multiplyScalar(0.6 + 2.4 * seamGlow);
    sweep.position.set(Math.sin(t * 0.3) * 80, 40, Math.cos(t * 0.3) * 60 - 20);
    sweep.intensity = 1.1 * sweepAmt;
    // 剖切面需要在世界坐标中：pkg.group 的世界矩阵变换平面
    pkg.group.updateMatrixWorld();
    cutPlane.set(new THREE.Vector3(0, 0, -1), cut);
    cutPlane.applyMatrix4(pkg.group.matrixWorld);
  };
  return def;
}
