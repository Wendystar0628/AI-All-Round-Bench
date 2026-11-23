// js/gpu-core.js — Unified WebGPU Engine Core, Shared Studio Lighting & Procedural Primitives
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});

  // Shared WGSL code injected into both Scene 1 and Scene 2 render shaders
  // Guarantees 100% unified studio lighting, cyclorama backdrop, shadow PCF, PBR & ACES tonemapping
  const COMMON_STUDIO_WGSL = /* wgsl */ `
const PI: f32 = 3.14159265359;

// Key directional studio light + rim light
const KEY_DIR: vec3<f32> = vec3<f32>(0.425, 0.818, 0.388);   // normalized ~(0.5, 0.96, 0.45)
const KEY_COL: vec3<f32> = vec3<f32>(2.45, 2.34, 2.18);      // crisp warm studio key
const FILL_DIR: vec3<f32> = vec3<f32>(-0.68, 0.56, 0.47);
const FILL_COL: vec3<f32> = vec3<f32>(0.46, 0.56, 0.72);     // subtle cool skylight fill
const RIM_DIR: vec3<f32> = vec3<f32>(-0.45, 0.55, -0.70);
const RIM_COL: vec3<f32> = vec3<f32>(1.25, 1.32, 1.44);      // crisp sculptural contour rim

fn acesTonemap(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn linearToSrgb(c: vec3<f32>) -> vec3<f32> {
  return pow(max(c, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2));
}

// Analytical Architectural Studio HDRI Environment (calibrated tonal contrast so highlights, foam & translucent jewel colors pop!)
fn sampleStudioEnv(dirIn: vec3<f32>, roughness: f32) -> vec3<f32> {
  let d = normalize(dirIn);
  let up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);

  let floorBounce = vec3<f32>(0.24, 0.26, 0.30);
  let horizonCol  = vec3<f32>(0.54, 0.59, 0.65);
  let zenithCol   = vec3<f32>(0.38, 0.46, 0.58);
  var col = mix(floorBounce, horizonCol, smoothstep(0.30, 0.53, up));
  col = mix(col, zenithCol, smoothstep(0.53, 0.96, up));

  let sharp = mix(1.0, 0.14, clamp(roughness, 0.0, 1.0));
  let edge = mix(0.05, 0.36, clamp(roughness, 0.0, 1.0));

  // Overhead architectural softbox strip #1 (creates iconic crisp specular ribbons on jelly & waves!)
  let overheadBox = smoothstep(0.66 - edge, 0.84 + edge * 0.2, d.y) *
                    smoothstep(-0.62 - edge, -0.32, d.x) * smoothstep(0.62 + edge, 0.32, d.x) *
                    smoothstep(-0.48 - edge, -0.22, d.z) * smoothstep(0.48 + edge, 0.22, d.z);
  col += vec3<f32>(3.1, 3.05, 2.95) * overheadBox * (0.42 + 0.58 * sharp);

  // Key lamp specular highlight along KEY_DIR
  let keyDot = max(dot(d, KEY_DIR), 0.0);
  let keySpec = pow(keyDot, mix(140.0, 6.0, roughness * roughness));
  col += vec3<f32>(4.2, 4.0, 3.65) * keySpec * mix(1.0, 0.28, roughness);

  // Cool north studio window strip (-X)
  let sideWin = smoothstep(0.58 - edge, 0.88, -d.x) *
                smoothstep(-0.04 - edge, 0.18, d.y) * smoothstep(0.72 + edge, 0.44, d.y) *
                smoothstep(-0.55 - edge, -0.18, d.z) * smoothstep(0.65 + edge, 0.28, d.z);
  col += vec3<f32>(1.75, 1.95, 2.30) * sideWin * (0.4 + 0.6 * sharp);

  // Back-left crisp rim strip
  let rimDot = max(dot(d, RIM_DIR), 0.0);
  let rimSpec = pow(rimDot, mix(64.0, 5.0, roughness * roughness));
  col += vec3<f32>(2.1, 2.2, 2.4) * rimSpec * mix(0.95, 0.25, roughness);

  // Subtle warm right bounce accent
  let rightDot = max(dot(d, normalize(vec3<f32>(0.85, 0.28, -0.35))), 0.0);
  col += vec3<f32>(0.85, 0.76, 0.66) * pow(rightDot, mix(28.0, 3.5, roughness)) * 0.48;

  return col;
}

// Architectural Gallery Cyclorama Backdrop (balanced mid-light slate so translucent jellies, whitewater foam & glass highlights gleam!)
fn evalStudioBackdrop(rayDir: vec3<f32>, screenUV: vec2<f32>) -> vec3<f32> {
  let d = normalize(rayDir);
  let h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  let lowCol = vec3<f32>(0.36, 0.40, 0.46);
  let midCol = vec3<f32>(0.54, 0.59, 0.65);
  let topCol = vec3<f32>(0.39, 0.45, 0.54);
  var bg = mix(lowCol, midCol, smoothstep(0.32, 0.52, h));
  bg = mix(bg, topCol, smoothstep(0.52, 0.90, h));

  // Soft studio cyclorama pool light behind center subject
  let centerGlow = exp(-dot(screenUV - vec2<f32>(0.48, 0.48), screenUV - vec2<f32>(0.48, 0.48)) * 2.6);
  bg += vec3<f32>(0.15, 0.16, 0.175) * centerGlow;

  // Clean subtle photographic vignette
  let vig = 1.0 - 0.22 * dot(screenUV - vec2<f32>(0.5), screenUV - vec2<f32>(0.5)) * 2.1;
  return bg * vig;
}

fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
  return F0 + (vec3<f32>(1.0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn distributionGGX(NdotH: f32, roughness: f32) -> f32 {
  let a = max(roughness * roughness, 0.002);
  let a2 = a * a;
  let denom = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * denom * denom + 1e-6);
}

fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k + 1e-6);
}

fn evalPBRDirect(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, radiance: vec3<f32>, albedo: vec3<f32>, metallic: f32, roughness: f32) -> vec3<f32> {
  let NdotL = max(dot(N, L), 0.0);
  if (NdotL <= 0.0) { return vec3<f32>(0.0); }
  let NdotV = max(dot(N, V), 0.001);
  let H = normalize(V + L);
  let NdotH = max(dot(N, H), 0.0);
  let HdotV = max(dot(H, V), 0.0);
  let F0 = mix(vec3<f32>(0.04), albedo, metallic);
  let F = fresnelSchlick(HdotV, F0);
  let D = distributionGGX(NdotH, roughness);
  let G = geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
  let spec = (D * G * F) / max(4.0 * NdotV * NdotL, 0.001);
  let kD = (vec3<f32>(1.0) - F) * (1.0 - metallic);
  return (kD * albedo / PI + spec) * radiance * NdotL;
}

fn evalStudioPBR(N: vec3<f32>, V: vec3<f32>, albedo: vec3<f32>, metallic: f32, roughness: f32, shadowVis: f32, ao: f32) -> vec3<f32> {
  var Lo = evalPBRDirect(N, V, KEY_DIR, KEY_COL * shadowVis, albedo, metallic, roughness);
  Lo += evalPBRDirect(N, V, FILL_DIR, FILL_COL, albedo, metallic, roughness);
  Lo += evalPBRDirect(N, V, RIM_DIR, RIM_COL * (0.45 + 0.55 * shadowVis), albedo, metallic, roughness);

  // IBL specular + diffuse ambient from matching studio HDRI
  let NdotV = max(dot(N, V), 0.001);
  let F0 = mix(vec3<f32>(0.04), albedo, metallic);
  let F = F0 + (max(vec3<f32>(1.0 - roughness), F0) - F0) * pow(1.0 - NdotV, 5.0);
  let R = reflect(-V, N);
  let envSpec = sampleStudioEnv(R, roughness);
  let envDiff = sampleStudioEnv(N, 0.92);
  let kD = (vec3<f32>(1.0) - F) * (1.0 - metallic);
  let ambient = (kD * albedo * envDiff * 0.48 + F * envSpec * mix(0.88, 0.32, roughness)) * ao;
  return ambient + Lo;
}

// 9-tap soft PCF shadow sampling (uses textureSampleCompareLevel so it works in any control flow!)
fn sampleShadowPCF(shadowMap: texture_depth_2d, shadowSamp: sampler_comparison, lightSpacePos: vec4<f32>, bias: f32) -> f32 {
  let ndc = lightSpacePos.xyz / lightSpacePos.w;
  let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  let inBounds = uv.x >= 0.01 && uv.x <= 0.99 && uv.y >= 0.01 && uv.y <= 0.99 && ndc.z >= 0.0 && ndc.z <= 1.0;
  let texel = 1.0 / 2048.0;
  let refZ = clamp(ndc.z - bias, 0.0, 1.0);
  var sum = 0.0;
  for (var dx = -1; dx <= 1; dx++) {
    for (var dy = -1; dy <= 1; dy++) {
      let off = vec2<f32>(f32(dx), f32(dy)) * texel * 1.45;
      sum += textureSampleCompareLevel(shadowMap, shadowSamp, clamp(uv + off, vec2<f32>(0.0), vec2<f32>(1.0)), refZ);
    }
  }
  return select(1.0, sum / 9.0, inBounds);
}

// Subtle procedural hash noise for architectural limestone & stone grain
fn hash31(p: vec3<f32>) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

fn valueNoise3D(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i + vec3<f32>(0,0,0)), hash31(i + vec3<f32>(1,0,0)), u.x),
        mix(hash31(i + vec3<f32>(0,1,0)), hash31(i + vec3<f32>(1,1,0)), u.x), u.y),
    mix(mix(hash31(i + vec3<f32>(0,0,1)), hash31(i + vec3<f32>(1,0,1)), u.x),
        mix(hash31(i + vec3<f32>(0,1,1)), hash31(i + vec3<f32>(1,1,1)), u.x), u.y),
    u.z
  );
}
`;

  // Procedural geometry builders: returns { vertices: Float32Array (pos3, norm3, uv2), indices: Uint32Array }
  function createSphereMesh(rings, sectors) {
    const verts = [];
    const inds = [];
    for (let r = 0; r <= rings; r++) {
      const v = r / rings;
      const phi = v * Math.PI;
      const sp = Math.sin(phi), cp = Math.cos(phi);
      for (let s = 0; s <= sectors; s++) {
        const u = s / sectors;
        const theta = u * Math.PI * 2;
        const x = sp * Math.cos(theta);
        const y = cp;
        const z = sp * Math.sin(theta);
        verts.push(x, y, z, x, y, z, u, v);
      }
    }
    const stride = sectors + 1;
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < sectors; s++) {
        const a = r * stride + s;
        const b = a + stride;
        inds.push(a, a + 1, b);
        inds.push(a + 1, b + 1, b);
      }
    }
    return { vertices: new Float32Array(verts), indices: new Uint32Array(inds) };
  }

  function createBoxMesh(w, h, d, cx, cy, cz) {
    cx = cx || 0; cy = cy || 0; cz = cz || 0;
    const hw = w * 0.5, hh = h * 0.5, hd = d * 0.5;
    const faces = [
      // +Y
      { n: [0, 1, 0], pts: [[-hw, hh, -hd], [-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd]] },
      // -Y
      { n: [0, -1, 0], pts: [[-hw, -hh, hd], [-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd]] },
      // +Z
      { n: [0, 0, 1], pts: [[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]] },
      // -Z
      { n: [0, 0, -1], pts: [[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]] },
      // +X
      { n: [1, 0, 0], pts: [[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]] },
      // -X
      { n: [-1, 0, 0], pts: [[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]] }
    ];
    const verts = [];
    const inds = [];
    let base = 0;
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const f of faces) {
      for (let i = 0; i < 4; i++) {
        const p = f.pts[i];
        verts.push(p[0] + cx, p[1] + cy, p[2] + cz, f.n[0], f.n[1], f.n[2], uvs[i][0], uvs[i][1]);
      }
      inds.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base += 4;
    }
    return { vertices: new Float32Array(verts), indices: new Uint32Array(inds) };
  }

  function createCylinderXMesh(radius, length, segs) {
    // Cylinder oriented along X axis, from x = -length/2 to +length/2
    const verts = [];
    const inds = [];
    const hl = length * 0.5;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ny = Math.cos(a), nz = Math.sin(a);
      verts.push(-hl, radius * ny, radius * nz, 0, ny, nz, 0, i / segs);
      verts.push(hl, radius * ny, radius * nz, 0, ny, nz, 1, i / segs);
    }
    for (let i = 0; i < segs; i++) {
      const b = i * 2;
      inds.push(b, b + 1, b + 3, b, b + 3, b + 2);
    }
    return { vertices: new Float32Array(verts), indices: new Uint32Array(inds) };
  }

  function uploadMesh(device, mesh) {
    const vb = device.createBuffer({
      size: mesh.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(vb, 0, mesh.vertices);
    const ib = device.createBuffer({
      size: mesh.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(ib, 0, mesh.indices);
    return { vb, ib, indexCount: mesh.indices.length };
  }

  class GPUCore {
    constructor(canvas) {
      this.canvas = canvas;
      this.adapter = null;
      this.device = null;
      this.context = null;
      this.format = 'bgra8unorm';
      this.width = 1280;
      this.height = 720;
      this.shadowSize = 2048;
      this.shadowTex = null;
      this.shadowView = null;
      this.shadowSampler = null;
      this.linearSampler = null;
      this.nearestSampler = null;
      this.sphereMesh = null;
      this.resizeListeners = [];
    }

    async init() {
      if (!navigator.gpu) {
        throw new Error('当前浏览器不支持 WebGPU，请使用支持 WebGPU 的 Chrome 浏览器。');
      }
      this.adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!this.adapter) {
        throw new Error('未能获取 WebGPU 显卡适配器。');
      }

      const requiredFeatures = [];
      if (this.adapter.features.has('float32-filterable')) {
        requiredFeatures.push('float32-filterable');
      }

      this.device = await this.adapter.requestDevice({
        requiredFeatures,
        requiredLimits: {
          maxStorageBufferBindingSize: Math.min(this.adapter.limits.maxStorageBufferBindingSize, 512 * 1024 * 1024),
          maxBufferSize: Math.min(this.adapter.limits.maxBufferSize, 512 * 1024 * 1024),
          maxStorageBuffersPerShaderStage: Math.min(this.adapter.limits.maxStorageBuffersPerShaderStage, 16)
        }
      });

      this.device.addEventListener('uncapturederror', (e) => {
        console.error('WebGPU uncaptured error:', e.error ? e.error.message : e);
      });

      this.device.lost.then((info) => {
        console.error('WebGPU device lost:', info);
      });

      this.context = this.canvas.getContext('webgpu');
      this.format = navigator.gpu.getPreferredCanvasFormat();
      this.resize(true);

      // Shared 2048x2048 shadow map + samplers
      this.shadowTex = this.device.createTexture({
        size: [this.shadowSize, this.shadowSize],
        format: 'depth32float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
      });
      this.shadowView = this.shadowTex.createView();

      this.shadowSampler = this.device.createSampler({
        compare: 'less',
        magFilter: 'linear',
        minFilter: 'linear'
      });

      this.linearSampler = this.device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge'
      });

      this.nearestSampler = this.device.createSampler({
        magFilter: 'nearest',
        minFilter: 'nearest',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge'
      });

      // Shared high-res unit sphere mesh for metal/stone/density spheres
      this.sphereMesh = uploadMesh(this.device, createSphereMesh(32, 48));
      return this;
    }

    onResize(fn) {
      this.resizeListeners.push(fn);
    }

    resize(force) {
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.max(1, this.canvas.clientWidth || window.innerWidth || 1280);
      const cssH = Math.max(1, this.canvas.clientHeight || window.innerHeight || 720);
      const maxDim = this.device ? this.device.limits.maxTextureDimension2D : 8192;
      const w = Math.min(maxDim, Math.max(2, Math.round(cssW * dpr)));
      const h = Math.min(maxDim, Math.max(2, Math.round(cssH * dpr)));
      if (!force && w === this.width && h === this.height) return false;

      this.width = w;
      this.height = h;
      this.canvas.width = w;
      this.canvas.height = h;

      if (this.context && this.device) {
        this.context.configure({
          device: this.device,
          format: this.format,
          alphaMode: 'opaque'
        });
      }
      for (const fn of this.resizeListeners) fn(w, h);
      return true;
    }

    get aspect() {
      return this.width / Math.max(1, this.height);
    }
  }

  App.GPU = {
    COMMON_STUDIO_WGSL,
    createSphereMesh,
    createBoxMesh,
    createCylinderXMesh,
    uploadMesh,
    GPUCore
  };
})(window);
