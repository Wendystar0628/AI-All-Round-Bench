import * as THREE from 'three';
import { P } from '../core/palette.js';
import { Builder } from '../core/builder.js';
import { KINDS } from '../core/materials.js';
import { wob } from '../core/wave.js';

// 太阳方向（指向光源）：左前上方，阴影朝右后方投向水面
export const SUN_DIR = new THREE.Vector3(-0.56, 0.78, 0.42).normalize();

export const FOG_COLOR = new THREE.Color(P.sky);

// 天空穹顶：竖向渐变 + 太阳周围的柔光晕，完全不受雾与光照影响
export function buildSky(scene) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(P.skyTop) },
      uHor: { value: new THREE.Color(P.sky) },
      uSun: { value: SUN_DIR.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w * 0.9999;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(uHor, uTop, smoothstep(0.0, 0.55, h));
        float s = max(dot(normalize(vDir), normalize(uSun)), 0.0);
        c = mix(c, vec3(1.0, 0.98, 0.9), pow(s, 60.0) * 0.5);
        c += vec3(1.0, 0.9, 0.7) * pow(s, 6.0) * 0.06;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(260, 32, 16), mat);
  dome.renderOrder = -10;
  scene.add(dome);
  return dome;
}

// 灯光：半球光（天空偏青白、地面偏青绿）+ 暖色太阳光（投影）
export function buildLights(scene) {
  const hemi = new THREE.HemisphereLight('#eefcff', '#5aa9a2', 1.05);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#ffe2ac', 2.9);
  sun.position.copy(SUN_DIR).multiplyScalar(40);
  sun.target.position.set(0, -1, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -20;
  sc.right = 20;
  sc.top = 20;
  sc.bottom = -20;
  sc.near = 4;
  sc.far = 90;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = 2;
  sun.shadow.intensity = 0.55;
  scene.add(sun);
  scene.add(sun.target);

  // 冷色补光，从相反方向柔化阴影
  const fill = new THREE.DirectionalLight('#cdeff0', 0.45);
  fill.position.set(10, 8, -6);
  scene.add(fill);

  return { hemi, sun, fill };
}

// 薄云：扁平的云团，投下淡淡的云影在底座上缓慢移动
export function buildClouds(scene) {
  const group = new THREE.Group();
  const b = new Builder();
  const blobs = [
    [-12, 0, 0, 5.2, 1.2, 3.2],
    [-7, 0.6, 1.2, 3.6, 0.9, 2.6],
    [-4, 0.2, -1.0, 4.4, 1.0, 2.9],
    [5, 0.4, 2.0, 4.8, 1.1, 3.0],
    [11, 0.2, -2.0, 3.8, 0.9, 2.5],
    [18, 0.6, 1.0, 5.6, 1.2, 3.4],
  ];
  for (const [x, y, z, rx, ry, rz] of blobs) {
    b.ell(rx, ry, rz, P.white, { x, y, z, k: 'solid' }, 16, 10);
    b.ell(rx * 0.6, ry * 0.8, rz * 0.7, P.white, { x: x + rx * 0.45, y: y + 0.6, z: z - 0.4, k: 'solid' }, 14, 8);
    b.ell(rx * 0.55, ry * 0.7, rz * 0.6, '#e4f1f2', { x: x - rx * 0.4, y: y + 0.4, z: z + 0.6, k: 'solid' }, 14, 8);
  }
  const meshes = b.finish(group);
  for (const m of meshes) {
    m.material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: KINDS.solid.mat().gradientMap, transparent: true, opacity: 0.92 });
    m.castShadow = true;
  }
  group.scale.setScalar(0.6);
  group.position.set(0, 12, -12);
  scene.add(group);
  return group;
}

export function updateClouds(group, t) {
  // 从左到右缓慢飘过上空，首尾相接
  const span = 70;
  const x = ((t * 0.42 - 20) % span + span) % span - 35;
  group.position.x = x;
  group.position.y = 12 + 0.8 * wob(t * 0.1, 5.0);
  group.position.z = -12 + 2.0 * wob(t * 0.07, 2.0);
}

// 远处海面上极淡的雾气：几条半透明的雾带在底座远端缓慢流动（时间的纯函数）
export function buildMist(scene) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#f7fdfd') } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) {
        vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1.0, 0.0)), u.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      void main() {
        vec2 p = vUv * vec2(6.0, 2.0) + vec2(uTime * 0.035, 0.0);
        float n = vn(p) * 0.6 + vn(p * 2.3 + 4.1) * 0.4;
        float band = smoothstep(0.35, 0.8, n) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
        gl_FragColor = vec4(uColor, band * 0.32);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  const group = new THREE.Group();
  const layers = [];
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(19, 2.4), mat);
    m.position.set(-1.5 + i * 3.2, -0.8 + i * 0.4, -8.9 - i * 0.5);
    group.add(m);
    layers.push(m);
  }
  scene.add(group);
  return {
    update(t) {
      mat.uniforms.uTime.value = t;
    },
  };
}
