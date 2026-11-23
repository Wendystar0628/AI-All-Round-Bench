'use strict';
/* =====================================================================
   core.js — WebGL2 体素渲染引擎（无依赖，file:// 可直接运行）
   ===================================================================== */

const PI = Math.PI;
const TAU = Math.PI * 2;

function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function easeInOut(t) { return t * t * (3 - 2 * t); }
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
function easeIn(t) { return t * t * t; }

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- vec3 / quat ---------------- */
const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)],
};

function quatIdentity() { return [0, 0, 0, 1]; }
function quatFromTo(a, b) {
  const d = clamp(V3.dot(a, b), -1, 1);
  if (d > 0.99999) return [0, 0, 0, 1];
  if (d < -0.99999) return [1, 0, 0, 0];
  const ax = V3.norm(V3.cross(a, b));
  return quatFromAxis(ax, Math.acos(d));
}
function quatFromAxis(ax, ang) {
  const s = Math.sin(ang * 0.5);
  return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang * 0.5)];
}
function quatMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function quatRotate(q, v) {
  const [x, y, z, w] = q;
  const cx = y * v[2] - z * v[1] + w * v[0];
  const cy = z * v[0] - x * v[2] + w * v[1];
  const cz = x * v[1] - y * v[0] + w * v[2];
  return [
    v[0] + 2 * (y * cz - z * cy),
    v[1] + 2 * (z * cx - x * cz),
    v[2] + 2 * (x * cy - y * cx),
  ];
}
function quatFromYawPitchRoll(yaw, pitch, roll) {  const cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
  const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
  const cr = Math.cos(roll * 0.5), sr = Math.sin(roll * 0.5);
  return [
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
    cr * cp * cy + sr * sp * sy,
  ];
}

/* ---------------- mat4 (column major) ---------------- */
function m4Identity() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
function m4Mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function m4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f;
  m[10] = (far + near) * nf; m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}
function m4Ortho(halfW, halfH, near, far) {
  const m = new Float32Array(16);
  m[0] = 1 / halfW; m[5] = 1 / halfH; m[10] = -2 / (far - near);
  m[12] = 0; m[13] = 0; m[14] = -(far + near) / (far - near); m[15] = 1;
  return m;
}
function m4LookAt(eye, target, up) {
  const z = V3.norm(V3.sub(eye, target));
  const x = V3.norm(V3.cross(up, z));
  const y = V3.cross(z, x);
  const m = new Float32Array(16);
  m[0] = x[0]; m[1] = y[0]; m[2] = z[0]; m[3] = 0;
  m[4] = x[1]; m[5] = y[1]; m[6] = z[1]; m[7] = 0;
  m[8] = x[2]; m[9] = y[2]; m[10] = z[2]; m[11] = 0;
  m[12] = -V3.dot(x, eye); m[13] = -V3.dot(y, eye); m[14] = -V3.dot(z, eye); m[15] = 1;
  return m;
}
function m4FromQuatPos(q, p) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const m = new Float32Array(16);
  m[0] = 1 - (yy + zz); m[1] = xy + wz; m[2] = xz - wy; m[3] = 0;
  m[4] = xy - wz; m[5] = 1 - (xx + zz); m[6] = yz + wx; m[7] = 0;
  m[8] = xz + wy; m[9] = yz - wx; m[10] = 1 - (xx + yy); m[11] = 0;
  m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; m[15] = 1;
  return m;
}
function m4Compose(pos, quat, s) {
  const m = m4FromQuatPos(quat, pos);
  const sx = s[0], sy = s[1], sz = s[2];
  for (let i = 0; i < 4; i++) { m[i] *= sx; m[4 + i] *= sy; m[8 + i] *= sz; }
  return m;
}

/* ---------------- color ---------------- */
function hexRGB(h) { return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; }
function rgb255(r, g, b) { return [r / 255, g / 255, b / 255]; }
function mixColor(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function scaleColor(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }

/* ================= GL 基础 ================= */
function glCompile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
  }
  return s;
}
function glProgram(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, glCompile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, glCompile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const inf = gl.getActiveUniform(p, i); u[inf.name.replace('[0]', '')] = gl.getUniformLocation(p, inf.name); }
  return { prog: p, u };
}

/* ================= 体素批次 ================= */
const STRIDE = 18;
const FLOATS = STRIDE;

const BOX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 iPos;
layout(location=3) in vec4 iQuat;
layout(location=4) in vec3 iScale;
layout(location=5) in vec4 iColEm;
layout(location=6) in vec4 iMisc;
uniform mat4 uProj, uView, uModel;
out vec3 vLocal; out vec3 vWorld; out vec3 vNormal; out vec4 vColEm; out vec4 vMisc;
vec3 qrot(vec4 q, vec3 v){
  vec3 qv = q.xyz;
  return v + 2.0*cross(qv, cross(qv, v) + q.w*v);
}
void main(){
  vec3 lp = iPos + aPos*iScale;
  vec3 wp = qrot(iQuat, lp);
  vec4 world = uModel * vec4(wp, 1.0);
  vLocal = lp;
  vWorld = world.xyz;
  vNormal = normalize(mat3(uModel) * qrot(iQuat, aNormal));
  vColEm = iColEm;
  vMisc = iMisc;
  gl_Position = uProj * uView * world;
}`;

const BOX_FS = `#version 300 es
precision highp float;
in vec3 vLocal; in vec3 vWorld; in vec3 vNormal; in vec4 vColEm; in vec4 vMisc;
out vec4 fragColor;
uniform vec3 uCamPos;
uniform vec3 uDirDir, uDirColor, uFillDir, uFillColor;
uniform vec3 uAmbSky, uAmbGround;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform int uNumLights;
uniform vec4 uLightPos[20];
uniform vec4 uLightCol[20];
uniform float uSeam, uJitter, uTime;
uniform int uBlend;
uniform float uClay, uAddScale;

float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x+p.y)*p.z); }

void main(){
  vec3 N = normalize(vNormal);
  float flags = vMisc.x;
  float alpha = vMisc.y;
  float seed = vMisc.z;
  float specAmt = vMisc.w;
  bool unlit   = mod(flags, 2.0) > 0.5;
  bool noSeam  = mod(floor(flags*0.5), 2.0) > 0.5;
  bool noJit   = mod(floor(flags*0.25), 2.0) > 0.5;
  bool noSpec  = mod(floor(flags*0.125), 2.0) > 0.5;

  vec3 base = vColEm.rgb;
  if (uClay > 0.5) base = vec3(0.58, 0.60, 0.63);
  if (!noJit) {
    float h = hash13(floor(vLocal) + seed*17.0);
    base *= (1.0 - uJitter) + uJitter * h * 2.0;
    float h2 = hash13(floor(vLocal*0.5) + 3.0);
    base *= 0.94 + 0.10*h2;
  }

  vec3 col;
  if (unlit) {
    col = base * (0.30 + vColEm.a * 1.7);
  } else {
    vec3 amb = mix(uAmbGround, uAmbSky, N.y*0.5 + 0.5);
    float ndl = max(dot(N, uDirDir), 0.0);
    vec3 lit = base * (amb + uDirColor * ndl);
    float ndf = max(dot(N, uFillDir), 0.0);
    lit += base * uFillColor * ndf;
    if (!noSpec) {
      vec3 V = normalize(uCamPos - vWorld);
      vec3 H = normalize(uDirDir + V);
      float sp = pow(max(dot(N, H), 0.0), 42.0);
      lit += uDirColor * sp * specAmt;
      vec3 H2 = normalize(uFillDir + V);
      float sp2 = pow(max(dot(N, H2), 0.0), 18.0);
      lit += uFillColor * sp2 * specAmt * 0.5;
    }
    for (int i = 0; i < 20; i++) {
      if (i >= uNumLights) break;
      vec3 lp = uLightPos[i].xyz;
      float rad = uLightPos[i].w;
      vec3 dv = lp - vWorld;
      float d = length(dv);
      float att = clamp(1.0 - d/rad, 0.0, 1.0); att *= att;
      float nd = max(dot(N, dv / max(d, 0.001)), 0.0);
      lit += base * uLightCol[i].rgb * (uLightCol[i].a * att * (0.12 + nd));
    }
    col = lit + base * vColEm.a;
    if (uClay > 0.5) col = lit;
  }

  if (!noSeam) {
    vec3 g = fract(vLocal);
    vec3 d = min(g, 1.0 - g);
    vec3 an = abs(N);
    float seam = 1.0;
    if (an.x > 0.5) seam = min(d.y, d.z);
    else if (an.y > 0.5) seam = min(d.x, d.z);
    else seam = min(d.x, d.y);
    float line = 1.0 - smoothstep(0.0, 0.085, seam);
    col *= 1.0 - line * uSeam;
    float rim = smoothstep(0.085, 0.13, seam) * (1.0 - smoothstep(0.13, 0.30, seam));
    col *= 1.0 + rim * uSeam * 0.55;
  }

  float dist = length(vWorld - uCamPos);
  float f = 1.0 - exp(-dist * uFogDensity);
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));

  if (uBlend == 2) fragColor = vec4(col * alpha * uAddScale, 1.0);
  else if (uBlend == 1) fragColor = vec4(col, alpha);
  else fragColor = vec4(col, 1.0);
}`;

/* cube geometry: 24 verts */
function buildCubeGeometry() {
  const p = [], n = [], idx = [];
  const faces = [
    [[1, 0, 0], [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]]],
    [[-1, 0, 0], [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]]],
    [[0, 1, 0], [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]]],
    [[0, -1, 0], [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]]],
    [[0, 0, 1], [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]]],
    [[0, 0, -1], [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]]],
  ];
  let base = 0;
  for (const [nn, vs] of faces) {
    for (const v of vs) { p.push(v[0], v[1], v[2]); n.push(nn[0], nn[1], nn[2]); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    base += 4;
  }
  return { pos: new Float32Array(p), nrm: new Float32Array(n), idx: new Uint16Array(idx) };
}

class VoxelBatch {
  constructor(gl, maxInst) {
    this.gl = gl;
    this.max = maxInst || 4096;
    this.data = new Float32Array(this.max * FLOATS);
    this.count = 0;
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    this.dirty = true;
    this._initVAO();
  }
  reset() { this.count = 0; }
  boxc(cx, cy, cz, sx, sy, sz, color, o) {
    o = o || {};
    const c = Array.isArray(color) ? color : hexRGB(color);
    const minDim = Math.min(sx, sy, sz);
    let flags = o.flags || 0;
    if (o.unlit) flags |= 1;
    if (o.noSeam || minDim < 0.85) flags |= 2;
    if (o.noJit) flags |= 4;
    if (o.noSpec) flags |= 8;
    const q = o.quat || [0, 0, 0, 1];
    this.push(cx, cy, cz, q[0], q[1], q[2], q[3], sx, sy, sz,
      c[0], c[1], c[2], (o.e || 0), flags, (o.alpha !== undefined ? o.alpha : 1),
      (o.seed !== undefined ? o.seed : 0.5), (o.spec !== undefined ? o.spec : 0.3));
    return this;
  }
  box(x0, y0, z0, x1, y1, z1, color, o) {
    o = o || {};
    if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
    if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
    if (z1 < z0) { const t = z0; z0 = z1; z1 = t; }
    return this.boxc((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2,
      Math.max(0.02, x1 - x0), Math.max(0.02, y1 - y0), Math.max(0.02, z1 - z0), color, o);
  }
  push(px, py, pz, qx, qy, qz, qw, sx, sy, sz, r, g, b, emis, flags, alpha, seed, spec) {
    if (this.count >= this.max) return;
    const o = this.count * FLOATS, d = this.data;
    d[o] = px; d[o + 1] = py; d[o + 2] = pz;
    d[o + 3] = qx; d[o + 4] = qy; d[o + 5] = qz; d[o + 6] = qw;
    d[o + 7] = sx; d[o + 8] = sy; d[o + 9] = sz;
    d[o + 10] = r; d[o + 11] = g; d[o + 12] = b; d[o + 13] = emis;
    d[o + 14] = flags; d[o + 15] = alpha; d[o + 16] = seed; d[o + 17] = spec;
    this.count++;
  }
  _initVAO() {
    const gl = this.gl;
    const geo = buildCubeGeometry();
    this.geo = geo;
    gl.bindVertexArray(this.vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, geo.pos.byteLength + geo.nrm.byteLength, gl.STATIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, geo.pos);
    gl.bufferSubData(gl.ARRAY_BUFFER, geo.pos.byteLength, geo.nrm);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, geo.pos.byteLength);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const stride = FLOATS * 4;
    const attrs = [[2, 3, 0], [3, 4, 12], [4, 3, 28], [5, 4, 40], [6, 4, 56]];
    for (const [loc, size, off] of attrs) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
      gl.vertexAttribDivisor(loc, 1);
    }
    this.ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.vbo = vb;
  }
  upload() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.count * FLOATS));
  }
  draw(prog, model, blend) {
    const gl = this.gl;
    if (this.count === 0) return;
    gl.useProgram(prog.prog);
    gl.uniformMatrix4fv(prog.u.uModel, false, model || IDENTITY);
    gl.uniform1i(prog.u.uBlend, blend);
    gl.bindVertexArray(this.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, this.count);
    gl.bindVertexArray(null);
  }}

const IDENTITY = m4Identity();

/* ================= 粒子 ================= */
const PART_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 iPos;
layout(location=2) in vec4 iCol;
layout(location=3) in vec2 iSizeRot;
uniform mat4 uProj, uView;
out vec2 vUv; out vec4 vCol;
void main(){
  vUv = aCorner;
  vCol = iCol;
  float c = cos(iSizeRot.y), s = sin(iSizeRot.y);
  vec2 rc = mat2(c, -s, s, c) * (aCorner * iSizeRot.x);
  vec4 mv = uView * vec4(iPos, 1.0);
  mv.xy += rc;
  gl_Position = uProj * mv;
}`;

const PART_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol;
out vec4 fragColor;
uniform float uSoft;
void main(){
  float d = length(vUv);
  float a = pow(max(0.0, 1.0 - d), mix(1.6, 3.0, uSoft));
  fragColor = vec4(vCol.rgb * vCol.a * a, 1.0);
}`;

/* 预计算粒子池：所有粒子都是全局时间 t 的纯函数，保证导出确定性 */
class ParticlePool {
  constructor(gl, max) {
    this.gl = gl; this.max = max;
    const F = this.F = {
      t0: new Float32Array(max), dur: new Float32Array(max),
      x: new Float32Array(max), y: new Float32Array(max), z: new Float32Array(max),
      vx: new Float32Array(max), vy: new Float32Array(max), vz: new Float32Array(max),
      drag: new Float32Array(max), s0: new Float32Array(max), s1: new Float32Array(max),
      r: new Float32Array(max), g: new Float32Array(max), b: new Float32Array(max),
      rot: new Float32Array(max), spin: new Float32Array(max), fade: new Float32Array(max),
      acc: new Float32Array(max),
    };
    this.n = 0;
    this.alive = 0;
    this.accelScale = 0;
    this.data = new Float32Array(max * 12);
    this.prog = glProgram(gl, PART_VS, PART_FS);
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    const quad = new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5]);
    const ib = new Uint16Array([0, 1, 2, 0, 2, 3]);
    gl.bindVertexArray(this.vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const st = 48;
    const attrs = [[1, 3, 0], [2, 4, 12], [3, 2, 28]];
    for (const [loc, size, off] of attrs) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, st, off);
      gl.vertexAttribDivisor(loc, 1);
    }
    this.ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ib, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }
  clear() { this.n = 0; }
  spawn(t0, dur, x, y, z, vx, vy, vz, o) {
    if (this.n >= this.max) return;
    const i = this.n++, F = this.F;
    o = o || {};
    F.t0[i] = t0; F.dur[i] = dur;
    F.x[i] = x; F.y[i] = y; F.z[i] = z;
    F.vx[i] = vx; F.vy[i] = vy; F.vz[i] = vz;
    F.drag[i] = o.drag || 0;
    F.s0[i] = o.s0; F.s1[i] = (o.s1 !== undefined) ? o.s1 : o.s0;
    F.r[i] = o.r; F.g[i] = o.g; F.b[i] = o.b;
    F.rot[i] = o.rot || 0; F.spin[i] = o.spin || 0;
    F.fade[i] = (o.fade !== undefined) ? o.fade : 1;
    F.acc[i] = o.acc || 0;
  }
  evaluate(t) {
    const F = this.F, d = this.data;
    const accS = this.accelScale;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const age = t - F.t0[i];
      if (age < 0 || age > F.dur[i]) continue;
      const k = age / F.dur[i];
      const mul = 1 + F.acc[i] * accS;
      const dr = F.drag[i] > 0.0001 ? (1 - Math.exp(-F.drag[i] * age)) / F.drag[i] : age;
      const o = w * 12;
      d[o] = F.x[i] + F.vx[i] * dr * mul;
      d[o + 1] = F.y[i] + F.vy[i] * dr * mul;
      d[o + 2] = F.z[i] + F.vz[i] * dr * mul;
      d[o + 3] = F.r[i]; d[o + 4] = F.g[i]; d[o + 5] = F.b[i];
      let a;
      const f = F.fade[i];
      if (f === 1) a = k < 0.65 ? k / 0.65 : (1 - k) / 0.35;
      else a = Math.pow(1 - k, f);
      d[o + 6] = a;
      d[o + 7] = lerp(F.s0[i], F.s1[i], k);
      d[o + 8] = F.rot[i] + F.spin[i] * age;
      d[o + 9] = 0; d[o + 10] = 0; d[o + 11] = 0;
      w++;
    }
    this.alive = w;
  }
  upload() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.alive * 12));
  }
  draw(soft) {
    const gl = this.gl;
    if (this.alive === 0) return;
    gl.uniform1f(this.prog.u.uSoft, soft);
    gl.bindVertexArray(this.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, this.alive);
    gl.bindVertexArray(null);
  }
}

/* ================= 行星 ================= */
const PLANET_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uProj, uView, uModel;
out vec3 vN; out vec3 vW;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(uModel) * aNormal);
  gl_Position = uProj * uView * w;
}`;
const PLANET_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW;
out vec4 fragColor;
uniform vec3 uCamPos, uLightDir, uColA, uColB;
uniform float uAtmo;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCamPos - vW);
  float ndl = max(dot(N, uLightDir), 0.0);
  float term = smoothstep(-0.25, 0.35, dot(N, uLightDir));
  vec3 col = mix(uColB, uColA, term) * (0.12 + 0.95 * ndl);
  // 条纹
  float band = sin(vW.y * 0.004 + sin(vW.x * 0.002) * 2.0) * 0.5 + 0.5;
  col *= 0.85 + band * 0.3;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += vec3(0.35, 0.6, 0.9) * fres * uAtmo;
  fragColor = vec4(col, 1.0);
}`;

class PlanetMesh {
  constructor(gl, r, seg) {
    this.gl = gl;
    const [W, H] = seg;
    const pos = [], nrm = [], idx = [];
    for (let j = 0; j <= H; j++) {
      const v = j / H, ph = v * PI;
      for (let i = 0; i <= W; i++) {
        const u = i / W, th = u * TAU;
        const x = Math.sin(ph) * Math.cos(th) * r, y = Math.cos(ph) * r, z = Math.sin(ph) * Math.sin(th) * r;
        pos.push(x, y, z); nrm.push(x / r, y / r, z / r);
      }
    }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const a = j * (W + 1) + i, b = a + 1, c = a + W + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    this.count = idx.length;
    this.prog = glProgram(gl, PLANET_VS, PLANET_FS);
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer(); this.ib = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, pos.length * 4 + nrm.length * 4, gl.STATIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(pos));
    gl.bufferSubData(gl.ARRAY_BUFFER, pos.length * 4, new Float32Array(nrm));
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, pos.length * 4);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }
  draw(proj, view, model, camPos, lightDir, colA, colB, atmo) {
    const gl = this.gl, p = this.prog;
    gl.useProgram(p.prog);
    gl.uniformMatrix4fv(p.u.uProj, false, proj);
    gl.uniformMatrix4fv(p.u.uView, false, view);
    gl.uniformMatrix4fv(p.u.uModel, false, model);
    gl.uniform3fv(p.u.uCamPos, camPos);
    gl.uniform3fv(p.u.uLightDir, lightDir);
    gl.uniform3fv(p.u.uColA, colA);
    gl.uniform3fv(p.u.uColB, colB);
    gl.uniform1f(p.u.uAtmo, atmo);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }
}

/* ================= 星空 ================= */
const STAR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 iPos;
layout(location=1) in vec2 iSB;
uniform mat4 uProj, uView;
out float vB;
void main(){
  vB = iSB.y;
  vec4 mv = uView * vec4(iPos, 1.0);
  gl_Position = uProj * mv;
  float d = max(1.0, -mv.z);
  gl_PointSize = iSB.x * 900.0 / d;
}`;
const STAR_FS = `#version 300 es
precision highp float;
in float vB;
out vec4 fragColor;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float a = pow(max(0.0, 1.0 - length(c)*2.0), 2.2);
  fragColor = vec4(vec3(0.82,0.88,1.0) * vB * a, 1.0);
}`;

class StarField {
  constructor(gl, count, seed, center) {
    this.gl = gl;
    const rng = mulberry32(seed);
    const c = center || [0, 0, 0];
    const data = new Float32Array(count * 5);
    for (let i = 0; i < count; i++) {
      // 均匀球壳
      const u = rng() * 2 - 1, th = rng() * TAU;
      const s = Math.sqrt(1 - u * u);
      const R = 6000 + rng() * 9000;
      data[i * 5] = c[0] + s * Math.cos(th) * R;
      data[i * 5 + 1] = c[1] + u * R;
      data[i * 5 + 2] = c[2] + s * Math.sin(th) * R;
      const b = Math.pow(rng(), 3.0);
      data[i * 5 + 3] = 0.6 + b * 2.6;
      data[i * 5 + 4] = 0.25 + b * 1.5;
    }
    this.count = count;
    this.prog = glProgram(gl, STAR_VS, STAR_FS);
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12); gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
  }
  draw() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.POINTS, 0, 1, this.count);
    gl.bindVertexArray(null);
  }
}

/* ================= 护盾 ================= */
const SHIELD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uProj, uView, uModel;
out vec3 vN; out vec3 vW; out vec2 vUv;
void main(){
  vUv = vec2(atan(aPos.z, aPos.x), aPos.y);
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(uModel) * aNormal);
  gl_Position = uProj * uView * w;
}`;
const SHIELD_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec2 vUv;
out vec4 fragColor;
uniform vec3 uCamPos;
uniform float uTime, uAct, uSeed, uGlow;
uniform vec3 uColorA, uColorB;

float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float hexDist(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0,1.73))), p.x); }
vec4 hexCell(vec2 uv){
  vec2 r = vec2(1.0, 1.73);
  vec2 h = r*0.5;
  vec2 a = mod(uv, r) - h;
  vec2 b = mod(uv - h, r) - h;
  vec2 gv = dot(a,a) < dot(b,b) ? a : b;
  float d = hexDist(gv);
  float line = smoothstep(0.48, 0.5, d);
  float core = smoothstep(0.42, 0.0, d);
  vec2 id = uv - gv;
  return vec4(line, core, hash21(id), 0.0);
}

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCamPos - vW);
  float fres = pow(1.0 - abs(dot(N, V)), 2.4);
  float t = uTime*0.7 + uSeed*13.0;
  vec2 uv = vec2(vUv.x*6.0, vUv.y*9.0);
  vec4 hx = hexCell(uv + vec2(t*0.15, t*0.05));
  float scan = sin(vUv.y*22.0 - t*2.2)*0.5+0.5;
  float ripple = sin(vUv.y*14.0 + t*3.0)*0.5+0.5;
  // 展开波：自下而上（或自前向后）推进
  float wave = smoothstep(0.0, 0.12, uAct - (vUv.y*0.5+0.5)*0.75) ;
  float waveEdge = smoothstep(0.0, 0.05, uAct - (vUv.y*0.5+0.5)*0.75) * (1.0 - smoothstep(0.05, 0.16, uAct - (vUv.y*0.5+0.5)*0.75));
  float a = fres*0.55 + hx.x*0.10 + hx.y*0.05 + scan*0.03 + ripple*0.03;
  a *= (0.25 + 0.75*uAct);
  a += waveEdge * 0.9;
  vec3 col = mix(uColorA, uColorB, fres*0.8 + hx.z*0.25);
  col += vec3(0.6,0.9,1.0) * waveEdge * 1.6;
  col *= (0.55 + uGlow);
  fragColor = vec4(col * a, 1.0);
}`;

class ShieldMesh {
  constructor(gl, seg) {
    this.gl = gl;
    seg = seg || [20, 14];
    const [W, H] = seg;
    const pos = [], nrm = [], idx = [];
    for (let j = 0; j <= H; j++) {
      const v = j / H, ph = v * PI;
      for (let i = 0; i <= W; i++) {
        const u = i / W, th = u * TAU;
        const x = Math.sin(ph) * Math.cos(th), y = Math.cos(ph), z = Math.sin(ph) * Math.sin(th);
        pos.push(x, y, z); nrm.push(x, y, z);
      }
    }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const a = j * (W + 1) + i, b = a + 1, c = a + W + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    this.count = idx.length;
    this.prog = glProgram(gl, SHIELD_VS, SHIELD_FS);
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    this.ib = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, pos.length * 4 + nrm.length * 4, gl.STATIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(pos));
    gl.bufferSubData(gl.ARRAY_BUFFER, pos.length * 4, new Float32Array(nrm));
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, pos.length * 4);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }
  draw(model, time, act, seed, glow, colA, colB, camPos) {
    const gl = this.gl, p = this.prog;
    gl.useProgram(p.prog);
    gl.uniformMatrix4fv(p.u.uProj, false, ShieldMesh.proj);
    gl.uniformMatrix4fv(p.u.uView, false, ShieldMesh.view);
    gl.uniformMatrix4fv(p.u.uModel, false, model);
    gl.uniform3fv(p.u.uCamPos, camPos);
    gl.uniform1f(p.u.uTime, time);
    gl.uniform1f(p.u.uAct, act);
    gl.uniform1f(p.u.uSeed, seed);
    gl.uniform1f(p.u.uGlow, glow);
    gl.uniform3fv(p.u.uColorA, colA);
    gl.uniform3fv(p.u.uColorB, colB);
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }
}

/* ================= 后处理 ================= */
const POST_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uRes;
void main(){ fragColor = vec4(texture(uTex, vUv).rgb, 1.0); }`;

const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uTex;
uniform float uThresh, uKnee;
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  float s = smoothstep(uThresh, uThresh + uKnee, l);
  fragColor = vec4(c * s, 1.0);
}`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uDir;
void main(){
  vec3 c = texture(uTex, vUv).rgb * 0.227027;
  c += texture(uTex, vUv + uDir*1.3846).rgb * 0.316216;
  c += texture(uTex, vUv - uDir*1.3846).rgb * 0.316216;
  c += texture(uTex, vUv + uDir*3.2308).rgb * 0.070270;
  c += texture(uTex, vUv - uDir*3.2308).rgb * 0.070270;
  fragColor = vec4(c, 1.0);
}`;

const COMP_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uScene, uBloom;
uniform float uBloomStr, uExposure, uTime, uFade;
uniform vec2 uRes;
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  vec3 b = texture(uBloom, vUv).rgb;
  c += b * uBloomStr;
  c *= uExposure;
  c = aces(c);
  c = pow(c, vec3(1.0/1.05));
  vec2 d = vUv - 0.5;
  float vig = smoothstep(0.95, 0.30, length(d)*1.25);
  c *= mix(0.62, 1.0, vig);
  float g = hash(vUv*uRes + fract(uTime)*13.0);
  c += (g - 0.5) * 0.010;
  c *= (1.0 - clamp(uFade, 0.0, 1.0));
  fragColor = vec4(c, 1.0);
}`;

const QUAD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

class Post {
  constructor(gl) {
    this.gl = gl;
    this.quadVAO = gl.createVertexArray();
    const vb = gl.createBuffer();
    gl.bindVertexArray(this.quadVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.copyP = glProgram(gl, QUAD_VS, POST_FS);
    this.brightP = glProgram(gl, QUAD_VS, BRIGHT_FS);
    this.blurP = glProgram(gl, QUAD_VS, BLUR_FS);
    this.compP = glProgram(gl, QUAD_VS, COMP_FS);
    this.fboScene = null; this.fboA = null; this.fboB = null;
    this.w = 0; this.h = 0;
  }
  resize(w, h) {
    const gl = this.gl;
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    const bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
    const mk = (ww, hh, depth) => {
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, ww, hh, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      let rb = null;
      if (depth) {
        rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, ww, hh);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { f, tex, rb };
    };
    this.scene = mk(w, h, true);
    this.a = mk(bw, bh, false);
    this.b = mk(bw, bh, false);
  }
  bindScene() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.f);
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }
  _drawQuad() { const gl = this.gl; gl.bindVertexArray(this.quadVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null); }
  run(time, bloomStr, exposure) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    // bright
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.a.f);
    gl.viewport(0, 0, this.w >> 1, this.h >> 1);
    gl.useProgram(this.brightP.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.uniform1i(this.brightP.u.uTex, 0);
    gl.uniform1f(this.brightP.u.uThresh, 1.0);
    gl.uniform1f(this.brightP.u.uKnee, 0.7);
    this._drawQuad();
    // blur
    gl.useProgram(this.blurP.prog);
    gl.uniform1i(this.blurP.u.uTex, 0);
    const bw = this.w >> 1, bh = this.h >> 1;
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.b.f); gl.viewport(0, 0, bw, bh);
      gl.bindTexture(gl.TEXTURE_2D, this.a.tex);
      gl.uniform2f(this.blurP.u.uDir, 1 / bw, 0);
      this._drawQuad();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.a.f);
      gl.bindTexture(gl.TEXTURE_2D, this.b.tex);
      gl.uniform2f(this.blurP.u.uDir, 0, 1 / bh);
      this._drawQuad();
    }
    // composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.compP.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.a.tex);
    gl.uniform1i(this.compP.u.uScene, 0);
    gl.uniform1i(this.compP.u.uBloom, 1);
    gl.uniform1f(this.compP.u.uBloomStr, bloomStr);
    gl.uniform1f(this.compP.u.uExposure, exposure);
    gl.uniform1f(this.compP.u.uTime, time);
    gl.uniform1f(this.compP.u.uFade, this.fade || 0);
    gl.uniform2f(this.compP.u.uRes, this.w, this.h);
    this._drawQuad();
    gl.activeTexture(gl.TEXTURE0);
  }
}

/* ================= 渲染器 ================= */
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 不可用');
    this.gl = gl;
    this.extCBF = gl.getExtension('EXT_color_buffer_float');
    this.boxProg = glProgram(gl, BOX_VS, BOX_FS);
    this.post = new Post(gl);
    this.lights = [];
    for (let i = 0; i < 20; i++) this.lights.push({ pos: [0, 0, 0], col: [0, 0, 0], intensity: 0, radius: 1 });
    this.camPos = [0, 0, 0];
    this.time = 0;
    this.fogColor = [0.01, 0.015, 0.03];
    this.fogDensity = 0.00012;
    this.exposure = 1.0;
    this.bloom = 0.85;
    this.dirDir = V3.norm([-0.55, 0.42, -0.72]);
    this.dirColor = [1.15, 1.05, 0.92];
    this.fillDir = V3.norm([0.6, -0.15, 0.75]);
    this.fillColor = [0.10, 0.16, 0.22];
    this.ambSky = [0.10, 0.14, 0.20];
    this.ambGround = [0.035, 0.045, 0.06];
    this.seam = 0.30;
    this.jitter = 0.10;
    this.shake = 0;
    this._shakeT = 0;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }
  resize() {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.floor(c.clientWidth * dpr), h = Math.floor(c.clientHeight * dpr);
    const maxPix = 3840 * 2160;
    if (w * h > maxPix) { const s = Math.sqrt(maxPix / (w * h)); w = Math.floor(w * s); h = Math.floor(h * s); }
    w = Math.max(2, w); h = Math.max(2, h);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.post.resize(w, h);
  }
  setEnv(o) {
    if (!o) return;
    if (o.fogColor) this.fogColor = o.fogColor;
    if (o.fogDensity !== undefined) this.fogDensity = o.fogDensity;
    if (o.exposure !== undefined) this.exposure = o.exposure;
    if (o.bloom !== undefined) this.bloom = o.bloom;
    if (o.dirDir) this.dirDir = V3.norm(o.dirDir);
    if (o.dirColor) this.dirColor = o.dirColor;
    if (o.fillDir) this.fillDir = V3.norm(o.fillDir);
    if (o.fillColor) this.fillColor = o.fillColor;
    if (o.ambSky) this.ambSky = o.ambSky;
    if (o.ambGround) this.ambGround = o.ambGround;
    if (o.seam !== undefined) this.seam = o.seam;
    if (o.jitter !== undefined) this.jitter = o.jitter;
    if (o.shake !== undefined) this.shake = o.shake;
  }
  setLight(i, pos, col, intensity, radius) {
    const L = this.lights[i];
    L.pos = pos; L.col = col; L.intensity = intensity; L.radius = radius;
  }
  clearLights() { for (const L of this.lights) L.intensity = 0; }
  applyBoxUniforms(p, proj, view) {
    const gl = this.gl, r = this;
    gl.uniformMatrix4fv(p.u.uProj, false, proj);
    gl.uniformMatrix4fv(p.u.uView, false, view);
    gl.uniform3fv(p.u.uCamPos, r.camPos);
    gl.uniform3fv(p.u.uDirDir, r.dirDir);
    gl.uniform3fv(p.u.uDirColor, r.dirColor);
    gl.uniform3fv(p.u.uFillDir, r.fillDir);
    gl.uniform3fv(p.u.uFillColor, r.fillColor);
    gl.uniform3fv(p.u.uAmbSky, r.ambSky);
    gl.uniform3fv(p.u.uAmbGround, r.ambGround);
    gl.uniform3fv(p.u.uFogColor, r.fogColor);
    gl.uniform1f(p.u.uFogDensity, r.fogDensity);
    gl.uniform1f(p.u.uSeam, r.seam);
    gl.uniform1f(p.u.uJitter, r.jitter);
    gl.uniform1f(p.u.uTime, r.time);
    gl.uniform1f(p.u.uClay, r.clay || 0);
    gl.uniform1f(p.u.uAddScale, r.addScale === undefined ? 1 : r.addScale);
    const n = Math.min(20, r.lights.length);
    const lp = new Float32Array(80), lc = new Float32Array(80);
    for (let i = 0; i < n; i++) {
      const L = r.lights[i];
      lp[i * 4] = L.pos[0]; lp[i * 4 + 1] = L.pos[1]; lp[i * 4 + 2] = L.pos[2]; lp[i * 4 + 3] = L.radius;
      lc[i * 4] = L.col[0]; lc[i * 4 + 1] = L.col[1]; lc[i * 4 + 2] = L.col[2]; lc[i * 4 + 3] = L.intensity;
    }
    gl.uniform4fv(p.u.uLightPos, lp);
    gl.uniform4fv(p.u.uLightCol, lc);
    gl.uniform1i(p.u.uNumLights, n);
  }
  drawBatches(batches, proj, view) {
    const gl = this.gl, p = this.boxProg;
    gl.useProgram(p.prog);
    this.applyBoxUniforms(p, proj, view);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    for (const b of batches) {
      if (b.opaque.count) { b.opaque.upload(); b.opaque.draw(p, b.model, 0); }
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const b of batches) {
      if (b.alpha.count) { b.alpha.upload(); b.alpha.draw(p, b.model, 1); }
    }
    gl.blendFunc(gl.ONE, gl.ONE);
    for (const b of batches) {
      if (b.add.count) { b.add.upload(); b.add.draw(p, b.model, 2); }
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
  drawParticles(ps, proj, view) {
    const gl = this.gl, p = ps.prog;
    ps.upload();
    gl.useProgram(p.prog);
    gl.uniformMatrix4fv(p.u.uProj, false, proj);
    gl.uniformMatrix4fv(p.u.uView, false, view);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    ps.draw(0.5);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
  drawStars(stars, proj, view) {
    const gl = this.gl, p = stars.prog;
    gl.useProgram(p.prog);
    gl.uniformMatrix4fv(p.u.uProj, false, proj);
    gl.uniformMatrix4fv(p.u.uView, false, view);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    stars.draw();
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
  drawShield(mesh, model, time, act, seed, glow, colA, colB, proj, view) {
    const gl = this.gl;
    ShieldMesh.proj = proj; ShieldMesh.view = view;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    mesh.draw(model, time, act, seed, glow, colA, colB, this.camPos);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
  present(time) {
    this.post.run(time, this.bloom, this.exposure);
  }
}
