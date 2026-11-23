import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PAL = {
  skyTop: 0xa8d4dd,
  skyHorizon: 0xf2f7f2,
  concrete: 0xcfcec6,
  concreteDark: 0xb4b3aa,
  concreteWet: 0x9fb0ad,
  quayTop: 0xd6d5cc,
  curb: 0xc4c3ba,
  stripeYellow: 0xe8b923,
  stripeBlack: 0x2e2e2c,
  ironBlack: 0x2b2f31,
  rust: 0x8a5a3c,
  rope: 0xb08a5a,
  ropeWet: 0x5f4a33,
  hullWhite: 0xf2efe6,
  hullShade: 0xd8d5cb,
  deckWood: 0xa8896a,
  wood: 0x8f6f4e,
  woodDark: 0x64482f,
  cabinWhite: 0xeceadf,
  accentRed: 0xd95b43,
  lifeOrange: 0xe8702c,
  brass: 0xc99a4a,
  glassBlue: 0xbfe0e2,
  waterSurface: 0x6fc0b8,
  waterDeep: 0x1f6a74,
  waterLight: 0x9fd8cf,
  seabed: 0x8f9a7c,
  rock: 0x7d8278,
  foliage1: 0x4f8f5b,
  foliage2: 0x6aa868,
  foliage3: 0x3c7a4e,
  roofTile: 0x4c6070,
  wallPlaster: 0xe9e4d6,
  lighthouseRed: 0xd0513c,
  lighthouseWhite: 0xf0ece0,
  vendingGlow: 0xfff2cf,
  rainbowHint: 0xffffff,
  umbrella: 0xdff2f2,
  catOrange: 0xd98d45,
  signWood: 0x7a6248,
};

export const QUAY_Y = 0;
export const WATER_Y = -1.5;
export const BASE_BOTTOM = -7.5;
export const HALF = 32;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash1(n) {
  n = Math.imul(n ^ (n >>> 16), 2246822507);
  n = Math.imul(n ^ (n >>> 13), 3266489909);
  return ((n ^= n >>> 16) >>> 0) / 4294967296;
}

export function hash2(x, y) {
  return hash1((x * 73856093) ^ (y * 19349663));
}

export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm2(x, y, oct = 3) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f); amp *= 0.5; f *= 2.03; }
  return s;
}

let _grad = null;
export function toonGradient() {
  if (_grad) return _grad;
  const data = new Uint8Array([90, 140, 195, 255]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  _grad = tex;
  return tex;
}

const _toonCache = new Map();
export function toon(color, opts = {}) {
  const key = color + '|' + JSON.stringify(opts);
  if (!opts.nocache && _toonCache.has(key)) return _toonCache.get(key);
  const m = new THREE.MeshToonMaterial({
    color, gradientMap: toonGradient(),
    transparent: !!opts.opacity && opts.opacity < 1,
    opacity: opts.opacity !== undefined ? opts.opacity : 1,
    side: opts.side || THREE.FrontSide,
    map: opts.map || null,
    emissive: opts.emissive || 0x000000,
    emissiveIntensity: opts.emissiveIntensity || 1,
    alphaTest: opts.alphaTest || 0,
  });
  if (!opts.nocache) _toonCache.set(key, m);
  return m;
}

export function flat(color, opts = {}) {
  return new THREE.MeshBasicMaterial({
    color, side: opts.side || THREE.FrontSide,
    transparent: !!opts.opacity && opts.opacity < 1,
    opacity: opts.opacity !== undefined ? opts.opacity : 1,
    map: opts.map || null,
    depthWrite: opts.depthWrite !== false,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: opts.fog !== false,
  });
}

const OUTLINE_COLORS = new Map();
function outlineMat(color, width) {
  const key = color + '_' + width;
  if (OUTLINE_COLORS.has(key)) return OUTLINE_COLORS.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uWidth: { value: width } },
    vertexShader: `
      uniform float uWidth;
      void main(){
        vec3 p = position + normalize(normal) * uWidth;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      void main(){ gl_FragColor = vec4(uColor, 1.0); }`,
    side: THREE.BackSide,
  });
  OUTLINE_COLORS.set(key, m);
  return m;
}

export function addOutline(mesh, width = 0.04, color = 0x25323a) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat(color, width));
  o.isOutline = true;
  mesh.add(o);
  return o;
}

export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = opts.anisotropy || 4;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
  return t;
}

export function box(w, h, d, mat, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  return m;
}

export function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}

export function sph(r, mat, x = 0, y = 0, z = 0, ws = 10, hs = 8) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);
  m.position.set(x, y, z);
  return m;
}

export function shadowify(root, cast = true, receive = true) {
  root.traverse((o) => { if (o.isMesh && !o.isOutline) { o.castShadow = cast; o.receiveShadow = receive; } });
  return root;
}

export function group(...children) {
  const g = new THREE.Group();
  for (const c of children) if (c) g.add(c);
  return g;
}

export function easeInOut(t) { return t * t * (3 - 2 * t); }
export function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function lerp(a, b, t) { return a + (b - a) * t; }

export const GLSL_NOISE = `
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn2(vec2 p){
  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  float a=h21(i), b=h21(i+vec2(1,0)), c=h21(i+vec2(0,1)), d=h21(i+vec2(1,1));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
`;
