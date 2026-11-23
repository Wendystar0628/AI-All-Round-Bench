/* ===== core.js : 数学、WebGPU 初始化、相机、公共着色器 ===== */
'use strict';

/* ---------- 数学 ---------- */
const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
const clamp = (x, a, b) => x < a ? a : (x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const smootherstep = t => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

const M4 = {
  ident() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(a, b) { // a*b, 列主序
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  },
  perspective(fovy, aspect, near, far) { // WebGPU z∈[0,1]
    const f = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = f / aspect; o[5] = f; o[10] = far / (near - far); o[11] = -1; o[14] = far * near / (near - far);
    return o;
  },
  ortho(l, r, b, t, n, f) {
    const o = new Float32Array(16);
    o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = 1 / (n - f);
    o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = n / (n - f); o[15] = 1;
    return o;
  },
  lookAt(e, c, up) {
    const z = V3.norm(V3.sub(e, c)), x = V3.norm(V3.cross(up, z)), y = V3.cross(z, x);
    const o = new Float32Array(16);
    o[0] = x[0]; o[1] = y[0]; o[2] = z[0]; o[4] = x[1]; o[5] = y[1]; o[6] = z[1]; o[8] = x[2]; o[9] = y[2]; o[10] = z[2];
    o[12] = -V3.dot(x, e); o[13] = -V3.dot(y, e); o[14] = -V3.dot(z, e); o[15] = 1;
    return o;
  },
  invert(m) {
    const inv = new Float32Array(16);
    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
    let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    det = 1 / (det || 1);
    for (let i = 0; i < 16; i++) inv[i] *= det;
    return inv;
  },
  trs(t, s) { const m = M4.ident(); m[0] = s[0]; m[5] = s[1]; m[10] = s[2]; m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; return m; },
};

// 带种子的伪随机（可复现）
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------- WebGPU 内核 ---------- */
const GPUX = {
  device: null, ctx: null, format: 'bgra8unorm', canvas: null,
  W: 1, H: 1, dpr: 1,
  hdr: 'rgba16float', depthFmt: 'depth32float',
  errors: [],
  async init(canvas) {
    if (!navigator.gpu) throw new Error('当前浏览器不支持 WebGPU');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('未找到可用的 GPU 适配器');
    const want = ['float32-filterable', 'float32-blendable'];
    const feats = want.filter(f => adapter.features.has(f));
    const L = adapter.limits;
    const lim = {};
    ['maxStorageBuffersPerShaderStage', 'maxStorageBufferBindingSize', 'maxBufferSize', 'maxTextureDimension2D',
      'maxComputeInvocationsPerWorkgroup', 'maxComputeWorkgroupStorageSize', 'maxColorAttachmentBytesPerSample', 'maxStorageBuffersInVertexStage', 'maxStorageBuffersInFragmentStage'].forEach(k => {
        if (L[k] !== undefined) lim[k] = L[k];
      });
    this.device = await adapter.requestDevice({ requiredFeatures: feats, requiredLimits: lim });
    this.features = new Set(feats);
    this.limits = this.device.limits;
    this.device.addEventListener('uncapturederror', e => { this.errors.push(e.error.message); console.error('[WebGPU]', e.error.message); });
    this.device.lost.then(i => console.error('设备丢失', i.message));
    this.canvas = canvas;
    this.ctx = canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    return this.device;
  },
  module(code, label) {
    const m = this.device.createShaderModule({ code, label });
    m.getCompilationInfo().then(i => {
      for (const x of i.messages) if (x.type === 'error') {
        const line = code.split('\n')[x.lineNum - 1];
        console.error(`[WGSL ${label}] ${x.lineNum}:${x.linePos} ${x.message}\n  ${line}`);
        GPUX.errors.push(`WGSL ${label} ${x.lineNum}: ${x.message}`);
      }
    });
    return m;
  },
  buffer(size, usage, label) {
    return this.device.createBuffer({ size: Math.max(16, Math.ceil(size / 4) * 4), usage, label });
  },
  bufferFrom(arr, usage, label) {
    const b = this.device.createBuffer({ size: Math.max(16, Math.ceil(arr.byteLength / 4) * 4), usage: usage | GPUBufferUsage.COPY_DST, label });
    this.device.queue.writeBuffer(b, 0, arr);
    return b;
  },
  tex(w, h, format, usage, label, extra) {
    return this.device.createTexture(Object.assign({
      size: [Math.max(1, w | 0), Math.max(1, h | 0)], format, usage, label,
    }, extra || {}));
  },
  async done() { await this.device.queue.onSubmittedWorkDone(); },
};

const BU = GPUBufferUsage, TU = GPUTextureUsage, SS = GPUShaderStage;
const BALL_F = 28, BALL_B = 112; // 小球结构：7 个 vec4 = 28 个 float

// 绑定组布局小工具
const BL = {
  u: (b, vis = SS.VERTEX | SS.FRAGMENT | SS.COMPUTE) => ({ binding: b, visibility: vis, buffer: { type: 'uniform' } }),
  ro: (b, vis = SS.VERTEX | SS.FRAGMENT | SS.COMPUTE) => ({ binding: b, visibility: vis, buffer: { type: 'read-only-storage' } }),
  rw: (b, vis = SS.COMPUTE) => ({ binding: b, visibility: vis, buffer: { type: 'storage' } }),
  tex: (b, vis = SS.FRAGMENT, type = 'float', dim = '2d') => ({ binding: b, visibility: vis, texture: { sampleType: type, viewDimension: dim } }),
  depth: (b, vis = SS.FRAGMENT) => ({ binding: b, visibility: vis, texture: { sampleType: 'depth' } }),
  smp: (b, vis = SS.FRAGMENT, type = 'filtering') => ({ binding: b, visibility: vis, sampler: { type } }),
  st: (b, fmt, access = 'write-only', vis = SS.COMPUTE) => ({ binding: b, visibility: vis, storageTexture: { access, format: fmt, viewDimension: '2d' } }),
};

/* ---------- 公共 WGSL ---------- */
const WGSL_COMMON = /* wgsl */`
const PI: f32 = 3.14159265359;
struct G {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  view: mat4x4f,
  proj: mat4x4f,
  lightVP: mat4x4f,
  camPos: vec4f,    // xyz, time
  lightDir: vec4f,  // xyz 指向光源, w 强度
  screen: vec4f,    // w, h, 1/w, 1/h
  params: vec4f,    // near, far, sceneId, 0
  tank: vec4f,      // 水槽/台面 xz 半宽等
};
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var shadowTex: texture_depth_2d;
@group(0) @binding(2) var shadowSmp: sampler_comparison;
@group(0) @binding(3) var jShadowTex: texture_depth_2d;
@group(0) @binding(4) var jShadowCol: texture_2d<f32>;
@group(0) @binding(5) var linSmp: sampler;
@group(0) @binding(6) var causticTex: texture_2d<f32>;

fn hash11(p: f32) -> f32 { var x = fract(p * 0.1031); x *= x + 33.33; x *= x + x; return fract(x); }
fn hash21(p: vec2f) -> f32 { var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
fn hash31(p: vec3f) -> f32 { var p3 = fract(p * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
fn vnoise3(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3f(1,0,0)), u.x), mix(hash31(i + vec3f(0,1,0)), hash31(i + vec3f(1,1,0)), u.x), u.y),
             mix(mix(hash31(i + vec3f(0,0,1)), hash31(i + vec3f(1,0,1)), u.x), mix(hash31(i + vec3f(0,1,1)), hash31(i + vec3f(1,1,1)), u.x), u.y), u.z);
}
fn fbm3(p0: vec3f) -> f32 {
  var p = p0; var a = 0.5; var s = 0.0;
  for (var i = 0; i < 4; i++) { s += a * vnoise3(p); p = p * 2.03 + vec3f(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}

// ---- 统一的摄影棚环境：软箱、条形灯与渐变背景 ----
fn softDisc(d: vec3f, c: vec3f, size: f32, soft: f32) -> f32 {
  let ca = dot(d, c);
  return smoothstep(cos(size + soft), cos(size), ca);
}
fn softStrip(d: vec3f, c: vec3f, axis: vec3f, hw: f32, hl: f32, soft: f32) -> f32 {
  let a = dot(d, axis);
  let l = dot(d, normalize(cross(axis, cross(c, axis))));
  let ok = smoothstep(0.0, 0.35, dot(d, c));
  return ok * (1.0 - smoothstep(hw, hw + soft, abs(a))) * (1.0 - smoothstep(hl, hl + soft, abs(l - 0.0) ));
}
fn envLight(d: vec3f, rough: f32) -> vec3f {
  let up = d.y;
  let soft = 0.04 + rough * 0.7;
  var c = mix(vec3f(0.030, 0.040, 0.055), vec3f(0.17, 0.215, 0.27), smoothstep(-0.35, 0.85, up));
  // 主光软箱（左前上）
  let K = normalize(vec3f(-0.5, 0.9, 0.55));
  c += vec3f(7.0, 6.4, 5.6) * softDisc(d, K, 0.30, soft) * (1.0 - 0.55 * rough);
  // 右后冷色边缘条光
  let R1 = normalize(vec3f(0.85, 0.35, -0.5));
  c += vec3f(1.2, 2.6, 4.2) * 1.6 * softDisc(d, R1, 0.20, soft * 1.2);
  // 左侧补光条
  let F1 = normalize(vec3f(-0.95, 0.25, 0.1));
  c += vec3f(2.4, 2.8, 3.2) * 0.9 * softDisc(d, F1, 0.22, soft * 1.5);
  // 正后方暖色背景灯
  let B1 = normalize(vec3f(0.0, 0.3, -1.0));
  c += vec3f(0.9, 0.7, 0.6) * 0.55 * softDisc(d, B1, 0.30, soft * 1.5);
  // 下方地面反弹
  c += vec3f(0.10, 0.13, 0.16) * (1.0 - smoothstep(-0.8, 0.0, up));
  return c;
}
// 背景（远处的摄影棚幕布）
fn backdrop(d: vec3f) -> vec3f {
  let t = smoothstep(-0.1, 0.85, d.y);
  var c = mix(vec3f(0.030, 0.042, 0.058), vec3f(0.075, 0.105, 0.145), t);
  let back = clamp(-d.z, 0.0, 1.0);
  let q = vec2f(d.x * 1.5, (d.y - 0.10) * 2.4);
  c += vec3f(0.085, 0.125, 0.170) * exp(-dot(q, q)) * back;
  c += vec3f(0.020, 0.012, 0.010) * (1.0 - smoothstep(-0.5, 0.3, d.y));
  return c;
}

// ---- PBR ----
fn fresnelS(c: f32, f0: vec3f) -> vec3f { return f0 + (vec3f(1.0) - f0) * pow(clamp(1.0 - c, 0.0, 1.0), 5.0); }
fn fresnelR(c: f32, f0: vec3f, r: f32) -> vec3f { return f0 + (max(vec3f(1.0 - r), f0) - f0) * pow(clamp(1.0 - c, 0.0, 1.0), 5.0); }
fn ggxD(nh: f32, a: f32) -> f32 { let a2 = a * a; let d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d + 1e-6); }
fn smithV(nv: f32, nl: f32, a: f32) -> f32 {
  let k = a * 0.5;
  return 0.25 / ((nv * (1.0 - k) + k) * (nl * (1.0 - k) + k) + 1e-4);
}

fn shadowVis(wp: vec3f, n: vec3f) -> f32 {
  let p = wp + n * 0.012;
  let lp = g.lightVP * vec4f(p, 1.0);
  let uv = vec2f(lp.x * 0.5 + 0.5, 0.5 - lp.y * 0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || lp.z > 1.0) { return 1.0; }
  let ts = 1.0 / 2048.0;
  var s = 0.0;
  for (var j = -2; j <= 2; j++) {
    for (var i = -2; i <= 2; i++) {
      s += textureSampleCompareLevel(shadowTex, shadowSmp, uv + vec2f(f32(i), f32(j)) * ts * 1.4, lp.z - 0.0012);
    }
  }
  return s / 25.0;
}
// 果冻的彩色透光阴影
fn jellyShadow(wp: vec3f) -> vec3f {
  let lp = g.lightVP * vec4f(wp, 1.0);
  let uv = vec2f(lp.x * 0.5 + 0.5, 0.5 - lp.y * 0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return vec3f(1.0); }
  let ts = 1.0 / 2048.0;
  var s = 0.0;
  for (var j = -2; j <= 2; j++) {
    for (var i = -2; i <= 2; i++) {
      s += textureSampleCompareLevel(jShadowTex, shadowSmp, uv + vec2f(f32(i), f32(j)) * ts * 1.6, lp.z - 0.002);
    }
  }
  s = s / 25.0;
  let tint = textureSampleLevel(jShadowCol, linSmp, uv, 0.0).rgb;
  return mix(tint, vec3f(1.0), s);
}

fn shadeStd(albedo: vec3f, rough: f32, metal: f32, N: vec3f, V: vec3f, wp: vec3f, shadow: vec3f, ao: f32) -> vec3f {
  let L = g.lightDir.xyz;
  let H = normalize(L + V);
  let nl = max(dot(N, L), 0.0);
  let nv = max(dot(N, V), 1e-3);
  let nh = max(dot(N, H), 0.0);
  let vh = max(dot(V, H), 0.0);
  let f0 = mix(vec3f(0.04), albedo, metal);
  let a = max(rough * rough, 0.015);
  let F = fresnelS(vh, f0);
  let spec = ggxD(nh, a) * smithV(nv, nl, a) * F * nl;
  let kd = (vec3f(1.0) - F) * (1.0 - metal);
  let lc = vec3f(1.0, 0.95, 0.88) * g.lightDir.w;
  let direct = (kd * albedo / PI * nl + spec) * lc * shadow * 3.2;
  let amb = envLight(N, 1.0) * 0.55 * albedo * (1.0 - metal) * ao;
  let R = reflect(-V, N);
  let fe = fresnelR(nv, f0, rough);
  let refl = envLight(R, rough) * fe * ao * (0.55 + 0.45 * shadow.x);
  return direct + amb + refl;
}

fn aces(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

fn viewRay(uv: vec2f) -> vec3f {
  let ndc = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 1.0, 1.0);
  let w = g.invViewProj * ndc;
  return normalize(w.xyz / w.w - g.camPos.xyz);
}
fn linDepth(d: f32) -> f32 { // NDF depth -> 视空间距离
  let n = g.params.x; let f = g.params.y;
  return n * f / (f - d * (f - n));
}
`;

/* ---------- 相机 ---------- */
class Camera {
  constructor() {
    this.target = [0, 0.2, 0]; this.dist = 3; this.yaw = 0.0; this.pitch = 0.3; this.fov = 38 * Math.PI / 180;
    this.near = 0.05; this.far = 80; this.roll = 0;
  }
  set(p) { Object.assign(this, p); return this; }
  eye() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    return [this.target[0] + this.dist * cp * Math.sin(this.yaw), this.target[1] + this.dist * sp, this.target[2] + this.dist * cp * Math.cos(this.yaw)];
  }
  matrices(aspect) {
    const e = this.eye();
    const view = M4.lookAt(e, this.target, [0, 1, 0]);
    const proj = M4.perspective(this.fov, aspect, this.near, this.far);
    return { view, proj, eye: e, vp: M4.mul(proj, view) };
  }
}

/* ---------- 网格工具 ---------- */
function makeSphereMesh(nu = 48, nv = 24) {
  const pos = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, th = v * Math.PI;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, ph = u * Math.PI * 2;
      pos.push(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

// 圆角盒（带法线）：用于台面、水槽边框等
function makeBoxMesh(sx, sy, sz, bevel = 0.0, seg = 1) {
  const pos = [], nor = [], idx = [];
  const faces = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const h = [sx / 2, sy / 2, sz / 2];
  for (const [n, u, v] of faces) {
    const base = pos.length / 3;
    for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * 2 - 1, b = (j / seg) * 2 - 1;
      const p = [n[0] * h[0] + u[0] * a * h[0] + v[0] * b * h[0], n[1] * h[1] + u[1] * a * h[1] + v[1] * b * h[1], n[2] * h[2] + u[2] * a * h[2] + v[2] * b * h[2]];
      pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]);
    }
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      const o = V3.dot(V3.cross(u, v), n) > 0;
      if (o) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint32Array(idx) };
}

/* ---------- 渲染目标与后处理 ---------- */
const RT = {
  w: 0, h: 0,
  color: null, copy: null, depth: null, backDepth: null, backDepthTex: null,
  bloomA: null, bloomB: null,
};

const WGSL_POST = /* wgsl */`
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var bloomT: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;
struct PU { exposure: f32, bloom: f32, vig: f32, aa: f32, size: vec2f, tint: vec2f };
@group(0) @binding(3) var<uniform> pu: PU;
struct VOut { @builtin(position) p: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var o: VOut; let x = f32((i << 1u) & 2u); let y = f32(i & 2u);
  o.p = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0); o.uv = vec2f(x, y); return o;
}
fn aces(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}
fn lum(c: vec3f) -> f32 { return dot(c, vec3f(0.299, 0.587, 0.114)); }
fn fetchT(uv: vec2f) -> vec3f {
  var c = textureSampleLevel(src, smp, uv, 0.0).rgb;
  c += textureSampleLevel(bloomT, smp, uv, 0.0).rgb * pu.bloom;
  c = aces(c * pu.exposure);
  return pow(c, vec3f(1.0 / 2.2));
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let px = 1.0 / pu.size;
  var c = fetchT(i.uv);
  if (pu.aa > 0.5) {
    // 轻量 FXAA
    let cn = fetchT(i.uv + vec2f(0.0, -px.y)); let cs = fetchT(i.uv + vec2f(0.0, px.y));
    let cw = fetchT(i.uv + vec2f(-px.x, 0.0)); let ce = fetchT(i.uv + vec2f(px.x, 0.0));
    let ln = lum(cn); let ls = lum(cs); let lw = lum(cw); let le = lum(ce); let lm = lum(c);
    let lmin = min(lm, min(min(ln, ls), min(lw, le))); let lmax = max(lm, max(max(ln, ls), max(lw, le)));
    let range = lmax - lmin;
    if (range > max(0.04, lmax * 0.12)) {
      let dirx = -((ln + ls) - 2.0 * lm); let diry = ((lw + le) - 2.0 * lm);
      var d = vec2f(dirx, diry);
      let dr = max((ln + ls + lw + le) * 0.03125, 1.0 / 128.0);
      let rcp = 1.0 / (min(abs(d.x), abs(d.y)) + dr);
      d = clamp(d * rcp, vec2f(-4.0), vec2f(4.0)) * px;
      let a = 0.5 * (fetchT(i.uv + d * (1.0 / 3.0 - 0.5)) + fetchT(i.uv + d * (2.0 / 3.0 - 0.5)));
      c = mix(c, a, 0.85);
    }
  }
  let q = i.uv - vec2f(0.5);
  let v = 1.0 - pu.vig * smoothstep(0.25, 0.95, length(q * vec2f(1.0, 0.9)) * 1.25);
  c *= v;
  return vec4f(c, 1.0);
}
`;

const WGSL_BLOOM = /* wgsl */`
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
struct BU { dir: vec2f, thresh: f32, pad: f32 };
@group(0) @binding(2) var<uniform> bu: BU;
struct VOut { @builtin(position) p: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var o: VOut; let x = f32((i << 1u) & 2u); let y = f32(i & 2u);
  o.p = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0); o.uv = vec2f(x, y); return o;
}
@fragment fn fsDown(i: VOut) -> @location(0) vec4f {
  // 下采样 + 亮部提取
  let t = bu.dir;
  var c = vec3f(0.0);
  c += textureSampleLevel(src, smp, i.uv + vec2f(-1.0, -1.0) * t, 0.0).rgb;
  c += textureSampleLevel(src, smp, i.uv + vec2f(1.0, -1.0) * t, 0.0).rgb;
  c += textureSampleLevel(src, smp, i.uv + vec2f(-1.0, 1.0) * t, 0.0).rgb;
  c += textureSampleLevel(src, smp, i.uv + vec2f(1.0, 1.0) * t, 0.0).rgb;
  c *= 0.25;
  let l = max(c.r, max(c.g, c.b));
  let k = max(l - bu.thresh, 0.0) / max(l, 1e-4);
  return vec4f(c * k, 1.0);
}
@fragment fn fsBlur(i: VOut) -> @location(0) vec4f {
  let t = bu.dir;
  var c = textureSampleLevel(src, smp, i.uv, 0.0).rgb * 0.2270270270;
  c += textureSampleLevel(src, smp, i.uv + t * 1.3846153846, 0.0).rgb * 0.3162162162;
  c += textureSampleLevel(src, smp, i.uv - t * 1.3846153846, 0.0).rgb * 0.3162162162;
  c += textureSampleLevel(src, smp, i.uv + t * 3.2307692308, 0.0).rgb * 0.0702702703;
  c += textureSampleLevel(src, smp, i.uv - t * 3.2307692308, 0.0).rgb * 0.0702702703;
  return vec4f(c, 1.0);
}
`;

class Renderer {
  constructor() {
    this.cam = new Camera();
    this.gBuf = null; this.gData = new Float32Array(112);
    this.frameBGL = null; this.shadowSize = 2048;
    this.exposure = 0.8; this.bloom = 0.3;
    this.lightDir = V3.norm([-0.5, 0.9, 0.55]);
    this.sceneId = 0;
    this.time = 0;
    this.exporting = false;
  }
  async init(canvas) {
    const D = await GPUX.init(canvas);
    this.D = D;
    this.frameBGL = D.createBindGroupLayout({
      label: 'frameBGL', entries: [
        BL.u(0), BL.depth(1), BL.smp(2, SS.FRAGMENT, 'comparison'), BL.depth(3), BL.tex(4), BL.smp(5), BL.tex(6, SS.FRAGMENT | SS.VERTEX, 'unfilterable-float'),
      ]
    });
    this.gBuf = GPUX.buffer(112 * 4, BU.UNIFORM | BU.COPY_DST, 'globals');
    this.gBufShadow = GPUX.buffer(112 * 4, BU.UNIFORM | BU.COPY_DST, 'globalsShadow');
    this.gBufJ = GPUX.buffer(112 * 4, BU.UNIFORM | BU.COPY_DST, 'globalsJ');
    this.shadowTex = GPUX.tex(this.shadowSize, this.shadowSize, 'depth32float', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, 'shadow');
    this.jShadowTex = GPUX.tex(this.shadowSize, this.shadowSize, 'depth32float', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, 'jshadow');
    this.jShadowCol = GPUX.tex(this.shadowSize, this.shadowSize, 'rgba8unorm', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, 'jshadowcol');
    this.dummyCaustic = GPUX.tex(4, 4, 'rgba32float', TU.TEXTURE_BINDING | TU.COPY_DST, 'dummyCaustic');
    const dc = new Float32Array(4 * 4 * 4); for (let i = 0; i < 16; i++) { dc[i * 4] = -1; dc[i * 4 + 1] = 1; dc[i * 4 + 2] = 1; dc[i * 4 + 3] = 1; }
    D.queue.writeTexture({ texture: this.dummyCaustic }, dc, { bytesPerRow: 64 }, [4, 4]);
    this.causticView = this.dummyCaustic.createView();
    this.cmpSmp = D.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });
    this.linSmp = D.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.nearSmp = D.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });
    this.sphere = makeSphereMesh(48, 24);
    this.sphereVB = GPUX.bufferFrom(this.sphere.pos, BU.VERTEX, 'sphereV');
    this.sphereIB = GPUX.bufferFrom(this.sphere.idx, BU.INDEX, 'sphereI');
    this._buildPost();
    this.makeFrameBG();
    this.resize();
  }
  makeFrameBG() {
    const D = this.D;
    this.frameBG = D.createBindGroup({
      layout: this.frameBGL, entries: [
        { binding: 0, resource: { buffer: this.gBuf } },
        { binding: 1, resource: this.shadowTex.createView() },
        { binding: 2, resource: this.cmpSmp },
        { binding: 3, resource: this.jShadowTex.createView() },
        { binding: 4, resource: this.jShadowCol.createView() },
        { binding: 5, resource: this.linSmp },
        { binding: 6, resource: this.causticView },
      ]
    });
    // 阴影通道使用的帧绑定（globals 为光源相机；用占位纹理避免读写冲突）
    if (!this.dummyDepth) {
      this.dummyDepth = GPUX.tex(4, 4, 'depth32float', TU.TEXTURE_BINDING | TU.RENDER_ATTACHMENT, 'dummyDepth');
      this.dummyCol = GPUX.tex(4, 4, 'rgba8unorm', TU.TEXTURE_BINDING, 'dummyCol');
    }
    this.frameBGShadow = D.createBindGroup({
      layout: this.frameBGL, entries: [
        { binding: 0, resource: { buffer: this.gBufShadow } },
        { binding: 1, resource: this.dummyDepth.createView() },
        { binding: 2, resource: this.cmpSmp },
        { binding: 3, resource: this.dummyDepth.createView() },
        { binding: 4, resource: this.dummyCol.createView() },
        { binding: 5, resource: this.linSmp },
        { binding: 6, resource: this.causticView },
      ]
    });
  }
  setCausticView(v) { this.causticView = v || this.dummyCaustic.createView(); this.makeFrameBG(); }
  _buildPost() {
    const D = this.D;
    const m = GPUX.module(WGSL_POST, 'post');
    this.postBGL = D.createBindGroupLayout({
      entries: [BL.tex(0), BL.tex(1), BL.smp(2), BL.u(3, SS.FRAGMENT)]
    });
    this.postPipe = D.createRenderPipeline({
      layout: D.createPipelineLayout({ bindGroupLayouts: [this.postBGL] }),
      vertex: { module: m, entryPoint: 'vs' },
      fragment: { module: m, entryPoint: 'fs', targets: [{ format: GPUX.format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.postU = GPUX.buffer(48, BU.UNIFORM | BU.COPY_DST, 'postU');
    const mb = GPUX.module(WGSL_BLOOM, 'bloom');
    this.bloomBGL = D.createBindGroupLayout({ entries: [BL.tex(0), BL.smp(1), BL.u(2, SS.FRAGMENT)] });
    const bl = D.createPipelineLayout({ bindGroupLayouts: [this.bloomBGL] });
    this.bloomDown = D.createRenderPipeline({
      layout: bl, vertex: { module: mb, entryPoint: 'vs' },
      fragment: { module: mb, entryPoint: 'fsDown', targets: [{ format: GPUX.hdr }] },
    });
    this.bloomBlur = D.createRenderPipeline({
      layout: bl, vertex: { module: mb, entryPoint: 'vs' },
      fragment: { module: mb, entryPoint: 'fsBlur', targets: [{ format: GPUX.hdr }] },
    });
    this.bloomU = [0, 1, 2].map(() => GPUX.buffer(16, BU.UNIFORM | BU.COPY_DST));
  }
  /* 画布与渲染目标尺寸 */
  resize(force) {
    const canvas = GPUX.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr));
    const maxd = GPUX.limits.maxTextureDimension2D;
    w = Math.min(w, maxd); h = Math.min(h, maxd);
    const maxPix = 3840 * 2160 * 1.06;          // 4K 以内按物理分辨率渲染，更大的窗口等比缩小以保证显存
    if (w * h > maxPix) { const k = Math.sqrt(maxPix / (w * h)); w = Math.round(w * k); h = Math.round(h * k); }
    if (w === RT.w && h === RT.h && !force) return false;
    canvas.width = w; canvas.height = h;
    RT.w = w; RT.h = h; GPUX.W = w; GPUX.H = h;
    for (const k of ['color', 'copy', 'depth', 'backDepthTex', 'backDepthZ', 'bloomA', 'bloomB', 'bloomC']) if (RT[k]) RT[k].destroy();
    const U = TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING | TU.COPY_SRC | TU.COPY_DST;
    RT.color = GPUX.tex(w, h, GPUX.hdr, U, 'sceneColor');
    RT.copy = GPUX.tex(w, h, GPUX.hdr, U, 'sceneCopy');
    RT.depth = GPUX.tex(w, h, 'depth32float', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING | TU.COPY_SRC, 'sceneDepth');
    RT.backDepthTex = GPUX.tex(w, h, 'r32float', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, 'jBack');
    RT.backDepthZ = GPUX.tex(w, h, 'depth32float', TU.RENDER_ATTACHMENT, 'jBackZ');
    const bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2);
    RT.bloomA = GPUX.tex(bw, bh, GPUX.hdr, U, 'bloomA');
    RT.bloomB = GPUX.tex(bw, bh, GPUX.hdr, U, 'bloomB');
    RT.bloomC = GPUX.tex(bw, bh, GPUX.hdr, U, 'bloomC');
    RT.colorView = RT.color.createView(); RT.copyView = RT.copy.createView(); RT.depthView = RT.depth.createView();
    RT.backView = RT.backDepthTex.createView(); RT.backZView = RT.backDepthZ.createView();
    RT.bloomAView = RT.bloomA.createView(); RT.bloomBView = RT.bloomB.createView(); RT.bloomCView = RT.bloomC.createView();
    this.postBG = null;
    for (const cb of this.onResize || []) cb(w, h);
    return true;
  }
  /* 写入全局 uniform，返回矩阵 */
  updateGlobals(t) {
    const w = RT.w, h = RT.h;
    const m = this.cam.matrices(w / h);
    const inv = M4.invert(m.vp);
    // 光源视图（正交，覆盖舞台）
    const c = this.lightTarget || [0, 0.3, 0], R = this.lightRadius || 3.2;
    const L = this.lightDir;
    const le = [c[0] + L[0] * 8, c[1] + L[1] * 8, c[2] + L[2] * 8];
    const lv = M4.lookAt(le, c, [0, 1, 0]);
    const lp = M4.ortho(-R, R, -R, R, 1, 18);
    const lvp = M4.mul(lp, lv);
    this.lightVP = lvp;
    const d = this.gData;
    d.set(m.vp, 0); d.set(inv, 16); d.set(m.view, 32); d.set(m.proj, 48); d.set(lvp, 64);
    d[80] = m.eye[0]; d[81] = m.eye[1]; d[82] = m.eye[2]; d[83] = t;
    d[84] = L[0]; d[85] = L[1]; d[86] = L[2]; d[87] = 1.0;
    d[88] = w; d[89] = h; d[90] = 1 / w; d[91] = 1 / h;
    d[92] = this.cam.near; d[93] = this.cam.far; d[94] = this.sceneId; d[95] = 0;
    d[96] = this.tankInfo ? this.tankInfo[0] : 0; d[97] = this.tankInfo ? this.tankInfo[1] : 0; d[98] = this.tankInfo ? this.tankInfo[2] : 0; d[99] = this.tankInfo ? this.tankInfo[3] : 0;
    this.D.queue.writeBuffer(this.gBuf, 0, d);
    // 阴影用 globals：把 viewProj 换成光源矩阵
    const ds = d.slice();
    ds.set(lvp, 0);
    this.D.queue.writeBuffer(this.gBufShadow, 0, ds);
    this.view = m;
    return m;
  }
  /* 最终合成：HDR -> 画布 */
  finish(enc) {
    const D = this.D;
    // 泛光
    const bw = RT.bloomA.width, bh = RT.bloomA.height;
    const mkBG = (view, ubuf) => D.createBindGroup({ layout: this.bloomBGL, entries: [{ binding: 0, resource: view }, { binding: 1, resource: this.linSmp }, { binding: 2, resource: { buffer: ubuf } }] });
    D.queue.writeBuffer(this.bloomU[0], 0, new Float32Array([1 / RT.w, 1 / RT.h, 1.4, 0]));
    D.queue.writeBuffer(this.bloomU[1], 0, new Float32Array([1.5 / bw, 0, 0, 0]));
    D.queue.writeBuffer(this.bloomU[2], 0, new Float32Array([0, 1.5 / bh, 0, 0]));
    const pass = (pipe, bg, target) => {
      const p = enc.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }] });
      p.setPipeline(pipe); p.setBindGroup(0, bg); p.draw(3); p.end();
    };
    pass(this.bloomDown, mkBG(RT.colorView, this.bloomU[0]), RT.bloomAView);
    pass(this.bloomBlur, mkBG(RT.bloomAView, this.bloomU[1]), RT.bloomBView);
    pass(this.bloomBlur, mkBG(RT.bloomBView, this.bloomU[2]), RT.bloomCView);
    pass(this.bloomBlur, mkBG(RT.bloomCView, this.bloomU[1]), RT.bloomBView);
    pass(this.bloomBlur, mkBG(RT.bloomBView, this.bloomU[2]), RT.bloomAView);
    D.queue.writeBuffer(this.postU, 0, new Float32Array([this.exposure, this.bloom, 0.42, 1, RT.w, RT.h, 0, 0]));
    const bg = D.createBindGroup({
      layout: this.postBGL, entries: [
        { binding: 0, resource: RT.colorView }, { binding: 1, resource: RT.bloomAView }, { binding: 2, resource: this.linSmp }, { binding: 3, resource: { buffer: this.postU } }]
    });
    const p = enc.beginRenderPass({ colorAttachments: [{ view: GPUX.ctx.getCurrentTexture().createView(), loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }] });
    p.setPipeline(this.postPipe); p.setBindGroup(0, bg); p.draw(3); p.end();
  }
}

/* 工具：把 Float32 数组写入 GPU 缓冲 */
function writeF32(buf, arr, off = 0) { GPUX.device.queue.writeBuffer(buf, off, arr.buffer ? arr : new Float32Array(arr)); }
