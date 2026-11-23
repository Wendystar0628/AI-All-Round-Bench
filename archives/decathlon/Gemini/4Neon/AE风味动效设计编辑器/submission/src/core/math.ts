import { Vec2, Vec3, Vec4, ColorRGBA } from './types';

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const EPS = 1e-6;

// ============================================================================
// ID Generator & Cloning
// ============================================================================
let _idCounter = 1;
export function genId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${(_idCounter++).toString(36)}`;
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ============================================================================
// Scalar & Color Utilities
// ============================================================================
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
}

export function rgbaToHex(c: ColorRGBA): string {
  const r = clamp(Math.round(c[0] * 255), 0, 255).toString(16).padStart(2, '0');
  const g = clamp(Math.round(c[1] * 255), 0, 255).toString(16).padStart(2, '0');
  const b = clamp(Math.round(c[2] * 255), 0, 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function hexToRgba(hex: string, alpha = 1): ColorRGBA {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) / 255,
      parseInt(clean[1] + clean[1], 16) / 255,
      parseInt(clean[2] + clean[2], 16) / 255,
      alpha,
    ];
  }
  const r = parseInt(clean.slice(0, 2), 16) / 255 || 0;
  const g = parseInt(clean.slice(2, 4), 16) / 255 || 0;
  const b = parseInt(clean.slice(4, 6), 16) / 255 || 0;
  return [r, g, b, alpha];
}

export function rgbaCss(c: ColorRGBA): string {
  return `rgba(${Math.round(clamp(c[0], 0, 1) * 255)},${Math.round(clamp(c[1], 0, 1) * 255)},${Math.round(clamp(c[2], 0, 1) * 255)},${clamp(c[3], 0, 1).toFixed(3)})`;
}

// ============================================================================
// Vec2 / Vec3 Helpers
// ============================================================================
export function v2Add(a: Vec2, b: Vec2): Vec2 { return [a[0] + b[0], a[1] + b[1]]; }
export function v2Sub(a: Vec2, b: Vec2): Vec2 { return [a[0] - b[0], a[1] - b[1]]; }
export function v2Scale(a: Vec2, s: number): Vec2 { return [a[0] * s, a[1] * s]; }
export function v2Len(a: Vec2): number { return Math.hypot(a[0], a[1]); }
export function v2Dist(a: Vec2, b: Vec2): number { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
export function v2Lerp(a: Vec2, b: Vec2, t: number): Vec2 { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; }

export function v3Add(a: Vec3, b: Vec3): Vec3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function v3Sub(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function v3Scale(a: Vec3, s: number): Vec3 { return [a[0] * s, a[1] * s, a[2] * s]; }
export function v3Dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function v3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export function v3Len(a: Vec3): number { return Math.hypot(a[0], a[1], a[2]); }
export function v3Dist(a: Vec3, b: Vec3): number { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
export function v3Norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1];
}
export function v3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// ============================================================================
// Mat4 (Column-Major Float32Array[16] matching WebGL2 / GLSL)
// ============================================================================
export type Mat4 = Float32Array;

export function m4Identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function m4Clone(a: Mat4): Mat4 {
  return new Float32Array(a);
}

export function m4Mul(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

export function m4Translate(x: number, y: number, z: number): Mat4 {
  const m = m4Identity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

export function m4Scale(x: number, y: number, z: number): Mat4 {
  const m = m4Identity();
  m[0] = x; m[5] = y; m[10] = z;
  return m;
}

export function m4RotX(rad: number): Mat4 {
  const m = m4Identity();
  const c = Math.cos(rad), s = Math.sin(rad);
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
}

export function m4RotY(rad: number): Mat4 {
  const m = m4Identity();
  const c = Math.cos(rad), s = Math.sin(rad);
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}

export function m4RotZ(rad: number): Mat4 {
  const m = m4Identity();
  const c = Math.cos(rad), s = Math.sin(rad);
  m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
  return m;
}

/**
 * AE-style layer local transform matrix:
 * M = T(pos) * Rz(rotZ) * Ry(rotY) * Rx(rotX) * S(scale/100) * T(-anchor)
 * Moving anchor alone while compensating pos keeps screen position unchanged!
 */
export function m4ComposeLayer(
  position: Vec3,
  anchor: Vec3,
  scalePct: Vec3,
  rotationDeg: Vec3
): Mat4 {
  const sx = scalePct[0] / 100;
  const sy = scalePct[1] / 100;
  const sz = scalePct[2] / 100;
  const rx = rotationDeg[0] * DEG2RAD;
  const ry = rotationDeg[1] * DEG2RAD;
  const rz = rotationDeg[2] * DEG2RAD;

  const tPos = m4Translate(position[0], position[1], position[2]);
  const rMat = m4Mul(m4Mul(m4RotZ(rz), m4RotY(ry)), m4RotX(rx));
  const sMat = m4Scale(sx, sy, sz);
  const tAnc = m4Translate(-anchor[0], -anchor[1], -anchor[2]);
  return m4Mul(m4Mul(m4Mul(tPos, rMat), sMat), tAnc);
}

/** DecomposeTRS (approximate AE Euler ZYX + Scale + Pos when anchor = 0) */
export function m4Decompose(m: Mat4): { position: Vec3; rotation: Vec3; scale: Vec3 } {
  const px = m[12], py = m[13], pz = m[14];
  let sx = Math.hypot(m[0], m[1], m[2]);
  let sy = Math.hypot(m[4], m[5], m[6]);
  let sz = Math.hypot(m[8], m[9], m[10]);

  // Check determinant sign for negative scale
  const det =
    m[0] * (m[5] * m[10] - m[6] * m[9]) -
    m[4] * (m[1] * m[10] - m[2] * m[9]) +
    m[8] * (m[1] * m[6] - m[2] * m[5]);
  if (det < 0) sx = -sx;

  const r00 = sx !== 0 ? m[0] / sx : 1;
  const r10 = sx !== 0 ? m[1] / sx : 0;
  const r20 = sx !== 0 ? m[2] / sx : 0;
  const r01 = sy !== 0 ? m[4] / sy : 0;
  const r11 = sy !== 0 ? m[5] / sy : 1;
  const r21 = sy !== 0 ? m[6] / sy : 0;
  const r22 = sz !== 0 ? m[10] / sz : 1;

  // R = Rz * Ry * Rx:
  // r20 = -sin(ry), r10 = cos(ry)*sin(rz), r00 = cos(ry)*cos(rz)
  // r21 = cos(ry)*sin(rx), r22 = cos(ry)*cos(rx)
  const sinY = clamp(-r20, -1, 1);
  const ry = Math.asin(sinY);
  let rx = 0, rz = 0;
  if (Math.abs(Math.cos(ry)) > 1e-5) {
    rx = Math.atan2(r21, r22);
    rz = Math.atan2(r10, r00);
  } else {
    rx = 0;
    rz = Math.atan2(-r01, r11);
  }

  return {
    position: [px, py, pz],
    rotation: [rx * RAD2DEG, ry * RAD2DEG, rz * RAD2DEG],
    scale: [sx * 100, sy * 100, sz * 100],
  };
}

export function m4Invert(a: Mat4): Mat4 | null {
  const out = new Float32Array(16);
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-12) return null;
  det = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

export function m4Perspective(fovYRad: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1.0 / Math.tan(fovYRad * 0.5);
  const nf = 1.0 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function m4Ortho(left: number, right: number, bottom: number, top: number, near: number, far: number): Mat4 {
  const out = new Float32Array(16);
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);
  out[0] = -2 * lr;
  out[5] = -2 * bt;
  out[10] = 2 * nf;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = (far + near) * nf;
  out[15] = 1;
  return out;
}

export function m4LookAt(eye: Vec3, center: Vec3, up: Vec3 = [0, 1, 0]): Mat4 {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz);
  if (len < 1e-8) { zx = 0; zy = 0; zz = 1; } else { zx /= len; zy /= len; zz /= len; }

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz);
  if (len < 1e-8) {
    // Fallback up vector
    const alt: Vec3 = Math.abs(zy) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    xx = alt[1] * zz - alt[2] * zy;
    xy = alt[2] * zx - alt[0] * zz;
    xz = alt[0] * zy - alt[1] * zx;
    len = Math.hypot(xx, xy, xz) || 1;
  }
  xx /= len; xy /= len; xz /= len;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  const out = new Float32Array(16);
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

export function m4TransformPoint(m: Mat4, p: Vec3): Vec3 {
  const x = p[0], y = p[1], z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}

export function m4TransformPoint4(m: Mat4, p: Vec3): Vec4 {
  const x = p[0], y = p[1], z = p[2];
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
  ];
}

export function m4TransformDir(m: Mat4, v: Vec3): Vec3 {
  const x = v[0], y = v[1], z = v[2];
  return [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z,
  ];
}

/**
 * Convert composition-space coordinates (origin top-left, +X right, +Y down, +Z toward viewer or away)
 * into our unified 3D Right-Handed World Space:
 * Origin = comp center (compW/2, compH/2, 0), +X right, +Y UP, +Z toward camera.
 */
export function compToWorld(p: Vec3, compW: number, compH: number): Vec3 {
  return [p[0] - compW * 0.5, compH * 0.5 - p[1], p[2]];
}

export function worldToComp(p: Vec3, compW: number, compH: number): Vec3 {
  return [p[0] + compW * 0.5, compH * 0.5 - p[1], p[2]];
}

/** Build default camera matching comp pixel coordinates at z=0 */
export function defaultCameraMatrices(compW: number, compH: number, fovDeg = 42): {
  eye: Vec3; target: Vec3; view: Mat4; proj: Mat4; vp: Mat4; focalDist: number;
} {
  const fovRad = fovDeg * DEG2RAD;
  const dist = (compH * 0.5) / Math.tan(fovRad * 0.5);
  const eye: Vec3 = [0, 0, dist];
  const target: Vec3 = [0, 0, 0];
  const view = m4LookAt(eye, target, [0, 1, 0]);
  const proj = m4Perspective(fovRad, compW / compH, 10, dist * 12);
  const vp = m4Mul(proj, view);
  return { eye, target, view, proj, vp, focalDist: dist };
}

/** Project world point to comp pixel coords [x, y, ndcZ, visible] */
export function projectWorldToComp(vp: Mat4, p: Vec3, compW: number, compH: number): { x: number; y: number; z: number; w: number } {
  const c = m4TransformPoint4(vp, p);
  const w = Math.abs(c[3]) < 1e-6 ? 1e-6 : c[3];
  const ndcX = c[0] / w;
  const ndcY = c[1] / w;
  const ndcZ = c[2] / w;
  return {
    x: (ndcX * 0.5 + 0.5) * compW,
    y: (0.5 - ndcY * 0.5) * compH,
    z: ndcZ,
    w: c[3],
  };
}

/** Unproject comp pixel (cx, cy) into a world-space ray { origin, dir } */
export function unprojectCompRay(invVP: Mat4, cx: number, cy: number, compW: number, compH: number): { origin: Vec3; dir: Vec3 } {
  const ndcX = (cx / compW) * 2 - 1;
  const ndcY = 1 - (cy / compH) * 2;
  const pNear = m4TransformPoint(invVP, [ndcX, ndcY, -1]);
  const pFar = m4TransformPoint(invVP, [ndcX, ndcY, 1]);
  return { origin: pNear, dir: v3Norm(v3Sub(pFar, pNear)) };
}

// ============================================================================
// Deterministic PRNG & 3D Value/Gradient Noise (for Wiggle, Fields, Particles)
// ============================================================================
export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3i(ix: number, iy: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2147483647) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Deterministic smooth 1D noise in [-1, 1] */
export function noise1D(x: number, seed = 1337): number {
  const xi = Math.floor(x);
  const xf = x - xi;
  const u = fade(xf);
  const g0 = hash3i(xi, 0, 0, seed) * 2 - 1;
  const g1 = hash3i(xi + 1, 0, 0, seed) * 2 - 1;
  const gPrev = hash3i(xi - 1, 0, 0, seed) * 2 - 1;
  const gNext = hash3i(xi + 2, 0, 0, seed) * 2 - 1;
  // Catmull-Rom / Hermite smooth interpolation for organic AE-like wiggle
  const m0 = 0.5 * (g1 - gPrev);
  const m1 = 0.5 * (gNext - g0);
  const t = xf, t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  void u;
  return clamp(h00 * g0 + h10 * m0 + h01 * g1 + h11 * m1, -1.25, 1.25);
}

/** Deterministic smooth 3D noise in [-1, 1] */
export function noise3D(x: number, y: number, z: number, seed = 42): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);

  const n000 = hash3i(xi, yi, zi, seed) * 2 - 1;
  const n100 = hash3i(xi + 1, yi, zi, seed) * 2 - 1;
  const n010 = hash3i(xi, yi + 1, zi, seed) * 2 - 1;
  const n110 = hash3i(xi + 1, yi + 1, zi, seed) * 2 - 1;
  const n001 = hash3i(xi, yi, zi + 1, seed) * 2 - 1;
  const n101 = hash3i(xi + 1, yi, zi + 1, seed) * 2 - 1;
  const n011 = hash3i(xi, yi + 1, zi + 1, seed) * 2 - 1;
  const n111 = hash3i(xi + 1, yi + 1, zi + 1, seed) * 2 - 1;

  const nx00 = lerp(n000, n100, u);
  const nx10 = lerp(n010, n110, u);
  const nx01 = lerp(n001, n101, u);
  const nx11 = lerp(n011, n111, u);
  const nxy0 = lerp(nx00, nx10, v);
  const nxy1 = lerp(nx01, nx11, v);
  return lerp(nxy0, nxy1, w);
}

/** Smooth 3D vector turbulence / curl-like noise */
export function noiseVec3(x: number, y: number, z: number, seed = 42): Vec3 {
  return [
    noise3D(x, y, z, seed),
    noise3D(x + 31.7, y + 17.3, z + 59.1, seed + 101),
    noise3D(x + 73.1, y + 41.9, z + 11.3, seed + 211),
  ];
}

// ============================================================================
// Cubic Bezier & Exact Arc-Length Reparameterization
// ============================================================================

/** Solve cubic Bezier X(u) = targetX for u in [0,1] (Newton + bisection) */
export function solveCubicBezierX(x1: number, x2: number, targetX: number): number {
  if (targetX <= 0) return 0;
  if (targetX >= 1) return 1;
  const cx1 = clamp(x1, 0, 1);
  const cx2 = clamp(x2, 0, 1);

  const sampleX = (u: number) => {
    const inv = 1 - u;
    return 3 * inv * inv * u * cx1 + 3 * inv * u * u * cx2 + u * u * u;
  };
  const sampleDX = (u: number) => {
    const inv = 1 - u;
    return 3 * inv * inv * cx1 + 6 * inv * u * (cx2 - cx1) + 3 * u * u * (1 - cx2);
  };

  let u = targetX;
  for (let i = 0; i < 6; i++) {
    const err = sampleX(u) - targetX;
    if (Math.abs(err) < 1e-6) return u;
    const d = sampleDX(u);
    if (Math.abs(d) < 1e-6) break;
    u = clamp(u - err / d, 0, 1);
  }
  // Bisection fallback guarantees monotonicity
  let lo = 0, hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = 0.5 * (lo + hi);
    if (sampleX(mid) < targetX) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export function evalCubicBezier1D(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const inv = 1 - u;
  return inv * inv * inv * p0 + 3 * inv * inv * u * p1 + 3 * inv * u * u * p2 + u * u * u * p3;
}

export function evalCubicBezier3D(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: number): Vec3 {
  const inv = 1 - u;
  const b0 = inv * inv * inv;
  const b1 = 3 * inv * inv * u;
  const b2 = 3 * inv * u * u;
  const b3 = u * u * u;
  return [
    b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
    b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
    b0 * p0[2] + b1 * p1[2] + b2 * p2[2] + b3 * p3[2],
  ];
}

export function evalCubicBezier2D(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: number): Vec2 {
  const inv = 1 - u;
  const b0 = inv * inv * inv;
  const b1 = 3 * inv * inv * u;
  const b2 = 3 * inv * u * u;
  const b3 = u * u * u;
  return [
    b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
    b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
  ];
}

export interface ArcLengthLUT {
  samples: number;
  cumLen: Float32Array;
  totalLength: number;
}

export function buildBezier3DArcLengthLUT(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, samples = 48): ArcLengthLUT {
  const cumLen = new Float32Array(samples + 1);
  let prev = p0;
  let total = 0;
  for (let i = 1; i <= samples; i++) {
    const cur = evalCubicBezier3D(p0, p1, p2, p3, i / samples);
    total += v3Dist(prev, cur);
    cumLen[i] = total;
    prev = cur;
  }
  return { samples, cumLen, totalLength: total };
}

/** Map normalized distance fraction s in [0,1] -> Bezier parameter u in [0,1] (constant speed!) */
export function arcLengthFractionToU(lut: ArcLengthLUT, sFrac: number): number {
  if (lut.totalLength < 1e-7) return clamp(sFrac, 0, 1);
  if (sFrac <= 0) return 0;
  if (sFrac >= 1) return 1;
  const target = sFrac * lut.totalLength;
  let lo = 0, hi = lut.samples;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (lut.cumLen[mid] <= target) lo = mid; else hi = mid;
  }
  const segLen = lut.cumLen[hi] - lut.cumLen[lo];
  const frac = segLen > 1e-8 ? (target - lut.cumLen[lo]) / segLen : 0;
  return (lo + frac) / lut.samples;
}

// ============================================================================
// Ray Intersection (Möller–Trumbore Ray-Triangle & Ray-Plane)
// ============================================================================
export function rayTriangleIntersect(
  origin: Vec3,
  dir: Vec3,
  v0: Vec3,
  v1: Vec3,
  v2: Vec3,
  cullBackface = false
): { t: number; u: number; v: number; normal: Vec3 } | null {
  const e1x = v1[0] - v0[0], e1y = v1[1] - v0[1], e1z = v1[2] - v0[2];
  const e2x = v2[0] - v0[0], e2y = v2[1] - v0[1], e2z = v2[2] - v0[2];
  const px = dir[1] * e2z - dir[2] * e2y;
  const py = dir[2] * e2x - dir[0] * e2z;
  const pz = dir[0] * e2y - dir[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (cullBackface ? det < 1e-8 : Math.abs(det) < 1e-8) return null;
  const invDet = 1 / det;
  const tx = origin[0] - v0[0], ty = origin[1] - v0[1], tz = origin[2] - v0[2];
  const u = (tx * px + ty * py + tz * pz) * invDet;
  if (u < -1e-5 || u > 1 + 1e-5) return null;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * invDet;
  if (v < -1e-5 || u + v > 1 + 1e-5) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  if (t < 1e-5) return null;
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  const nl = Math.hypot(nx, ny, nz) || 1;
  return { t, u, v, normal: [nx / nl, ny / nl, nz / nl] };
}

export function rayPlaneIntersect(
  origin: Vec3,
  dir: Vec3,
  planePoint: Vec3,
  planeNormal: Vec3
): Vec3 | null {
  const denom = v3Dot(dir, planeNormal);
  if (Math.abs(denom) < 1e-7) return null;
  const t = v3Dot(v3Sub(planePoint, origin), planeNormal) / denom;
  if (t < 0) return null;
  return v3Add(origin, v3Scale(dir, t));
}
