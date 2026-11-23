import * as THREE from 'three';
import { P } from './palette.js';

// 三渲二的三阶色阶贴图：暗部、中间调、亮部
const gradData = new Uint8Array([118, 196, 255]);
export const toonGradient = new THREE.DataTexture(gradData, 3, 1, THREE.RedFormat);
toonGradient.minFilter = THREE.NearestFilter;
toonGradient.magFilter = THREE.NearestFilter;
toonGradient.generateMipmaps = false;
toonGradient.needsUpdate = true;

// 轮廓线：反转外壳法，沿视空间法线外推，线宽随距离按比例变化，近似固定屏幕宽度
export const outlineMat = new THREE.ShaderMaterial({
  uniforms: {
    uK: { value: 0.00075 },
    uColor: { value: new THREE.Color(P.outline) },
  },
  vertexShader: /* glsl */ `
    uniform float uK;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 nv = normalize(normalMatrix * normal);
      mv.xyz += nv * uK * -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    void main() {
      gl_FragColor = vec4(uColor, 1.0);
      #include <colorspace_fragment>
    }`,
  side: THREE.BackSide,
});

// 混凝土：顶面为铺装分缝，立面为分层砌块，并叠加潮位线、藻斑与雨水斑驳（在片元里程序化生成）
const concreteVert = /* glsl */ `
  varying vec3 vWP;
  varying vec3 vWN;
`;
const concreteVertBody = /* glsl */ `
  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vWN = normalize(inverseTransformDirection(transformedNormal, viewMatrix));
`;
const concreteFragHead = /* glsl */ `
  varying vec3 vWP;
  varying vec3 vWN;
  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;
const concreteFragBody = /* glsl */ `
  {
    vec3 wp = vWP;
    vec3 an = abs(normalize(vWN));
    float grime = vnoise(wp.xz * 9.0 + wp.y * 3.0) * 0.5 + vnoise(wp.xy * 23.0 + wp.z * 7.0) * 0.25;
    float mott = 0.94 + 0.10 * grime;
    vec3 tint = vec3(1.0);
    if (an.y > 0.6) {
      // 顶面：铺装分缝 + 雨后水渍
      vec2 g = fract(wp.xz / 2.5);
      float seam = smoothstep(0.012, 0.0, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y))) * 0.18;
      float wet = smoothstep(0.55, 0.9, vnoise(wp.xz * 1.7)) * 0.07;
      // 雨后湿润的地面：天光在水膜上的柔和高光（不刺眼）
      float sheen = smoothstep(0.6, 0.88, vnoise(wp.xz * 2.3 + vec2(3.1, 1.7))) * 0.09;
      tint *= mott * (1.0 - seam) * (1.0 - wet) * (1.0 + sheen);
    } else {
      // 立面：分层砌块 + 竖缝 + 潮位线
      float course = fract(wp.y / 0.5);
      float rowId = floor(wp.y / 0.5);
      float hs = an.x > 0.5 ? wp.z : wp.x;
      float jx = fract((hs + mod(rowId, 2.0) * 0.75) / 1.5);
      float seamH = smoothstep(0.03, 0.0, min(course, 1.0 - course)) * 0.22;
      float seamV = smoothstep(0.02, 0.0, min(jx, 1.0 - jx)) * 0.16;
      tint *= mott * (1.0 - seamH - seamV);
      float tideA = smoothstep(0.10, 0.0, abs(wp.y + 0.9 + (grime - 0.5) * 0.14));
      float tideB = smoothstep(0.08, 0.0, abs(wp.y + 1.7 + (grime - 0.5) * 0.2)) * 0.6;
      float algae = smoothstep(-2.2, -3.6, wp.y) * 0.25 + smoothstep(-0.6, -1.2, wp.y) * 0.15;
      vec3 stain = vec3(0.70, 0.84, 0.80);
      tint = mix(tint, tint * stain, clamp(tideA * 0.55 + tideB * 0.35, 0.0, 1.0));
      tint = mix(tint, tint * vec3(0.55, 0.78, 0.74), clamp(algae, 0.0, 0.5));
      tint *= 0.98 + 0.04 * vnoise(wp.xy * 40.0);
    }
    diffuseColor.rgb *= tint;
  }
`;

function makeConcrete(name, tintSkipWet = false) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = concreteVert + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${concreteVertBody}`);
    sh.fragmentShader = concreteFragHead + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${concreteFragBody}`);
  };
  m.customProgramCacheKey = () => name;
  return m;
}

const solidMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient });
const thinMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient, side: THREE.DoubleSide });
const concreteMat = makeConcrete('concrete');
const glassMat = new THREE.MeshToonMaterial({
  vertexColors: true,
  gradientMap: toonGradient,
  transparent: true,
  opacity: 0.24,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const glassRoofMat = new THREE.MeshToonMaterial({
  vertexColors: true,
  gradientMap: toonGradient,
  transparent: true,
  opacity: 0.14,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const waterVolMat = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.26,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const emitMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const emitGlassMat = new THREE.MeshBasicMaterial({
  vertexColors: true,
  toneMapped: false,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
  side: THREE.DoubleSide,
});

// 合并桶的种类：是否描边、是否投影、用哪种材质
export const KINDS = {
  solid: { mat: () => solidMat, cast: true, receive: true, outline: true },
  concrete: { mat: () => concreteMat, cast: true, receive: true, outline: true },
  thin: { mat: () => thinMat, cast: true, receive: true, outline: false },
  glass: { mat: () => glassMat, cast: false, receive: false, outline: false, order: 3 },
  glassRoof: { mat: () => glassRoofMat, cast: false, receive: false, outline: false, order: 3 },
  water: { mat: () => waterVolMat, cast: false, receive: false, outline: false, order: 2 },
  emit: { mat: () => emitMat, cast: false, receive: false, outline: false },
  emitGlass: { mat: () => emitGlassMat, cast: false, receive: false, outline: false, order: 4 },
  outlineMat,
};

// 画布贴图（招牌、黑板、时刻表、浮标编号等文字都在这里生成，不读取任何图片文件）
export function canvasTex(w, h, draw, opts = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  return t;
}

// 带贴图的单体材质（不参与合并）
export function texMat(map, extra = {}) {
  return new THREE.MeshToonMaterial({ map, gradientMap: toonGradient, ...extra });
}

// 纯色单体材质
export function flatMat(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient, ...extra });
}

// 把一个单体网格登记为描边对象（用于需要独立运动的部件）
const _outlineCache = new WeakMap();
export function addOutline(mesh, parent = mesh) {
  const om = new THREE.Mesh(mesh.geometry, outlineMat);
  om.matrixAutoUpdate = true;
  parent.add(om);
  _outlineCache.set(mesh, om);
  return om;
}
