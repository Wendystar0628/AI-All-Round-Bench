/* renderer.js — WebGPU 前向渲染器：阴影、天空、PBR、果冻/玻璃/水材质、屏幕空间折射 */
(function () {
  const App = (window.App = window.App || {});
  const { M4, V3 } = App.util;

  const MODE = { OPAQUE: 0, JELLY: 1, GLASS: 2, WATER: 3, UNLIT: 4, EMISSIVE: 5, FLOOR: 6 };

  const WGSL_COMMON = /* wgsl */`
struct Frame {
  viewProj : mat4x4f,
  view : mat4x4f,
  proj : mat4x4f,
  invViewProj : mat4x4f,
  camPos : vec4f,
  lightDir : vec4f,
  lightColor : vec4f,
  skyColor : vec4f,
  groundColor : vec4f,
  shadowVP : mat4x4f,
  lightPos : vec4f,
  resolution : vec2f,
  time : f32,
  shadowInfo : vec4f,
};
struct Obj {
  world : mat4x4f,
  color : vec4f,
  params : vec4f,
  params2 : vec4f,
};
struct VSIn {
  @location(0) pos : vec3f,
  @location(1) nrm : vec3f,
  @location(2) uv : vec2f,
  @location(3) col : vec4f,
};
struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0) wp : vec3f,
  @location(1) nrm : vec3f,
  @location(2) uv : vec2f,
  @location(3) col : vec4f,
};

@group(0) @binding(0) var<uniform> UF : Frame;
@group(1) @binding(0) var<uniform> U : Obj;
@group(0) @binding(1) var shadowTex : texture_depth_2d;
@group(0) @binding(2) var shadowSampler : sampler_comparison;
@group(0) @binding(3) var refractTex : texture_2d<f32>;
@group(0) @binding(4) var refractSampler : sampler;

fn skyColor(dirIn : vec3f) -> vec3f {
  let dir = normalize(dirIn);
  let t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  var c = mix(UF.groundColor.rgb, UF.skyColor.rgb, pow(t, 0.72));
  let s = max(dot(dir, normalize(UF.lightDir.xyz)), 0.0);
  c += UF.lightColor.rgb * pow(s, 1200.0) * 26.0;
  c += UF.lightColor.rgb * pow(s, 12.0) * 0.12;
  // 地平线附近轻微亮带  c += UF.skyColor.rgb * 0.10 * pow(1.0 - abs(dir.y), 6.0);
  return c;
}

fn shadowFactor(wp : vec3f) -> f32 {
  let cp = UF.shadowVP * vec4f(wp, 1.0);
  let p = cp.xyz / max(cp.w, 1e-6);
  let uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  let dep = p.z - UF.shadowInfo.y;
  let inB = select(0.0, 1.0, uv.x >= 0.002 && uv.x <= 0.998 && uv.y >= 0.002 && uv.y <= 0.998 && dep < 1.0);
  let r = UF.shadowInfo.z * UF.shadowInfo.x;
  let cuv = clamp(uv, vec2f(0.001), vec2f(0.999));
  var s = 0.0;
  for (var i = -1; i <= 1; i = i + 1) {
    for (var j = -1; j <= 1; j = j + 1) {
      s += textureSampleCompare(shadowTex, shadowSampler, clamp(cuv + vec2f(f32(i), f32(j)) * r, vec2f(0.0), vec2f(1.0)), dep);
    }
  }
  return (s / 9.0) * inB;
}

@vertex fn vsMain(in : VSIn) -> VSOut {
  var o : VSOut;
  let wp = (U.world * vec4f(in.pos, 1.0)).xyz;
  o.pos = UF.viewProj * vec4f(wp, 1.0);
  o.wp = wp;
  o.nrm = (U.world * vec4f(in.nrm, 0.0)).xyz;
  o.uv = in.uv;
  o.col = in.col;
  return o;
}
`;

  const WGSL_MAIN = WGSL_COMMON + /* wgsl */`

fn pbr(N : vec3f, V : vec3f, L : vec3f, albedo : vec3f, rough : f32, metal : f32, wp : vec3f) -> vec3f {
  let ndl = max(dot(N, L), 0.0);
  let sh = shadowFactor(wp);
  let direct = UF.lightColor.rgb * ndl * sh;
  let ambCol = mix(UF.groundColor.rgb, UF.skyColor.rgb, N.y * 0.5 + 0.5);
  let ambient = ambCol * 0.13;
  let H = normalize(L + V);
  let ndh = max(dot(N, H), 0.0);
  let r = max(rough, 0.04);
  let pw = exp2(11.0 * (1.0 - r) + 1.0);
  let spec = pow(ndh, pw) * (pw + 2.0) / 8.0;
  let F0 = mix(vec3f(0.045), albedo, metal);
  let fres = F0 + (vec3f(1.0) - F0) * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  let env = skyColor(reflect(-V, N));
  var col = albedo * (direct + ambient);
  col += env * fres * (1.0 - r * 0.8) * (0.10 + 0.40 * sh);
  col += UF.lightColor.rgb * spec * fres * sh * (0.22 + 0.50 * (1.0 - r));
  return col;
}

@fragment fn fsMain(in : VSOut) -> @location(0) vec4f {
  let mode = u32(U.params.w);
  let Nraw = normalize(in.nrm);
  let V = normalize(UF.camPos.xyz - in.wp);
  var N = Nraw;
  if (dot(N, V) < 0.0) { N = -N; }
  let L = normalize(UF.lightDir.xyz);
  let albedo = in.col.rgb * U.color.rgb;
  let rough = clamp(U.params.x, 0.03, 1.0);
  let metal = clamp(U.params.y, 0.0, 1.0);
  var col : vec3f;
  var alpha = 1.0;

  if (mode == ${MODE.JELLY}u) {
    let sh = shadowFactor(in.wp);
    let ndl = max(dot(N, L), 0.0);
    let back = pow(max(dot(V, -L), 0.0), 2.2);
    let ambCol = mix(UF.groundColor.rgb, UF.skyColor.rgb, N.y * 0.5 + 0.5);
    let H = normalize(L + V);
    let ndh = max(dot(N, H), 0.0);
    let spec = pow(ndh, 190.0) * 2.4 + pow(ndh, 26.0) * 0.35;
    var c = albedo * (UF.lightColor.rgb * ndl * sh * 0.9 + ambCol * 0.55);
    c += albedo * albedo * back * UF.lightColor.rgb * 0.55 * U.params2.z;
    c += skyColor(reflect(-V, N)) * pow(1.0 - max(dot(N, V), 0.0), 2.0) * 0.55;
    c += UF.lightColor.rgb * spec * sh;
    c += albedo * 0.12;
    col = c;
    alpha = U.params.z;
  } else if (mode == ${MODE.GLASS}u) {
    let sh = shadowFactor(in.wp);
    let fres = 0.035 + 0.965 * pow(1.0 - abs(dot(N, V)), 4.0);
    let refl = skyColor(reflect(-V, N));
    let H = normalize(L + V);
    let spec = pow(max(dot(N, H), 0.0), 900.0) * 5.0;
    col = refl * fres * 1.15 + UF.lightColor.rgb * spec;
    col += vec3f(0.02, 0.035, 0.045) * (0.4 + 0.6 * N.y);
    alpha = clamp(U.params.z + fres * 0.55, 0.0, 0.92);
  } else if (mode == ${MODE.WATER}u) {
    let ndv = max(dot(N, V), 0.0);
    let fres = 0.03 + 0.97 * pow(1.0 - ndv, 3.2);
    let ndc = in.pos.xy / max(in.pos.w, 1e-6);
    var ruv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    let dist = length(UF.camPos.xyz - in.wp);
    let wob = U.params2.w;
    ruv += N.xz * (0.055 + 0.05 * wob) * clamp(1.6 / max(dist, 0.4), 0.35, 2.2);
    ruv += vec2f(sin(in.wp.x * 42.0 + UF.time * 2.1), cos(in.wp.z * 39.0 - UF.time * 1.7)) * 0.0022;
    let behind = textureSample(refractTex, refractSampler, clamp(ruv, vec2f(0.001), vec2f(0.999))).rgb;
    let depthTint = clamp(U.params2.z, 0.0, 1.0);
    var body = mix(behind * vec3f(0.62, 0.86, 0.90), vec3f(0.035, 0.22, 0.30), depthTint * 0.85);
    body += vec3f(0.02, 0.10, 0.11) * max(N.y, 0.0);
    let refl = skyColor(reflect(-V, N));
    let H = normalize(L + V);
    let spec = pow(max(dot(N, H), 0.0), 1400.0) * 9.0 + pow(max(dot(N,H),0.0), 90.0) * 0.35;
    col = mix(body, refl, fres);
    col += UF.lightColor.rgb * spec * (0.35 + 0.65 * shadowFactor(in.wp));
    let foam = clamp(in.col.a, 0.0, 1.0);
    let foamCol = vec3f(0.94, 0.97, 1.0);
    col = mix(col, foamCol, foam * 0.92);
    alpha = clamp(U.params.z + fres * 0.5 + foam * 0.55, 0.0, 0.97);
  } else if (mode == ${MODE.UNLIT}u) {
    col = albedo;
    alpha = U.params.z * in.col.a;
  } else if (mode == ${MODE.FLOOR}u) {
    let sh = shadowFactor(in.wp);
    let ndl = max(dot(N, L), 0.0);
    let ambCol = mix(UF.groundColor.rgb, UF.skyColor.rgb, N.y * 0.5 + 0.5);
    var c = albedo * (UF.lightColor.rgb * ndl * sh + ambCol * 0.38);
    let r = length(in.wp.xz);
    c *= 1.0 - 0.80 * smoothstep(0.8, 3.0, r);
    c += skyColor(reflect(-V, N)) * 0.02;
    col = c;
  } else {
    col = pbr(N, V, L, albedo, rough, metal, in.wp);
  }
  // 色调映射
  col = col / (col + vec3f(1.0));
  col = pow(col, vec3f(0.72));
  return vec4f(col, alpha);
}
`;

  const WGSL_DEPTH = /* wgsl */`
struct DFrame { shadowVP : mat4x4f, };
struct DObj { world : mat4x4f, pad0 : vec4f, pad1 : vec4f, pad2 : vec4f };
@group(0) @binding(0) var<uniform> SV : DFrame;
@group(1) @binding(0) var<uniform> SO : DObj;
struct DVIn { @location(0) pos : vec3f, };
@vertex fn vsDepth(in : DVIn) -> @builtin(position) vec4f {
  return SV.shadowVP * SO.world * vec4f(in.pos, 1.0);
}
@fragment fn fsDepth() -> @location(0) f32 { return 0.0; }
`;

  const WGSL_SKY = /* wgsl */`
struct SkyFrame {
  viewProj : mat4x4f, view : mat4x4f, proj : mat4x4f, invViewProj : mat4x4f,
  camPos : vec4f, lightDir : vec4f, lightColor : vec4f, skyColor : vec4f,
  groundColor : vec4f, shadowVP : mat4x4f, lightPos : vec4f,
  resolution : vec2f, time : f32, shadowInfo : vec4f,
};
@group(0) @binding(0) var<uniform> UF : SkyFrame;
struct SOut { @builtin(position) pos : vec4f, @location(0) ndc : vec2f };
@vertex fn vsSky(@builtin(vertex_index) vi : u32) -> SOut {
  var o : SOut;
  let p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(3.0, 1.0), vec2f(-1.0, 1.0));
  let xy = p[vi];
  o.ndc = xy;
  o.pos = vec4f(xy, 0.999999, 1.0);
  return o;
}
fn skyCol(dirIn : vec3f) -> vec3f {
  let dir = normalize(dirIn);
  let t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  var c = mix(UF.groundColor.rgb, UF.skyColor.rgb, pow(t, 0.72));
  let s = max(dot(dir, normalize(UF.lightDir.xyz)), 0.0);
  c += UF.lightColor.rgb * pow(s, 1200.0) * 26.0;
  c += UF.lightColor.rgb * pow(s, 12.0) * 0.12;
  c += UF.skyColor.rgb * 0.10 * pow(1.0 - abs(dir.y), 6.0);
  return c;
}
@fragment fn fsSky(in : SOut) -> @location(0) vec4f {
  let wp = UF.invViewProj * vec4f(in.ndc, 1.0, 1.0);
  let dir = normalize(wp.xyz / max(wp.w, 1e-6) - UF.camPos.xyz);
  var c = skyCol(dir);
  let d = length(in.ndc * vec2f(UF.resolution.x / UF.resolution.y, 1.0));
  c *= 1.0 - 0.30 * smoothstep(0.55, 1.9, d);
  c = c / (c + vec3f(1.0));
  c = pow(c, vec3f(0.72));
  return vec4f(c, 1.0);
}
`;

// ---------------- 图元 ----------------
  function primBox(w, h, d) {
    const x = w / 2, y = h / 2, z = d / 2;
    const P = [], N = [], UV = [], C = [], I = [];
    const faces = [
      [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [0, 0, 1]],
      [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1]],
      [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z], [1, 0, 0]],
      [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], [-1, 0, 0]],
      [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], [0, 1, 0]],
      [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [0, -1, 0]],
    ];
    let base = 0;
    for (const f of faces) {
      const n = f[4];
      for (let i = 0; i < 4; i++) {
        P.push(...f[i]); N.push(...n);
        UV.push((f[i][0] / w + 0.5), (f[i][2] / d + 0.5));
        C.push(1, 1, 1, 1);
      }
      I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base += 4;
    }
    return { P, N, UV, C, I };
  }

  function primSphere(r, seg) {
    seg = seg || 24;
    const P = [], N = [], UV = [], C = [], I = [];
    for (let y = 0; y <= seg; y++) {
      const v = y / seg, phi = v * Math.PI;
      for (let x = 0; x <= seg; x++) {
        const u = x / seg, theta = u * Math.PI * 2;
        const nx = Math.sin(phi) * Math.cos(theta), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(theta);
        P.push(nx * r, ny * r, nz * r); N.push(nx, ny, nz); UV.push(u, v); C.push(1, 1, 1, 1);
      }
    }
    for (let y = 0; y < seg; y++) for (let x = 0; x < seg; x++) {
      const a = y * (seg + 1) + x, b = a + seg + 1;
      I.push(a, b, a + 1, a + 1, b, b + 1);
    }
    return { P, N, UV, C, I };
  }

  function primPlane(w, d, segs) {
    segs = segs || 1;
    const P = [], N = [], UV = [], C = [], I = [];
    for (let j = 0; j <= segs; j++) for (let i = 0; i <= segs; i++) {
      const u = i / segs, v = j / segs;
      P.push((u - 0.5) * w, 0, (v - 0.5) * d);
      N.push(0, 1, 0); UV.push(u, v); C.push(1, 1, 1, 1);
    }
    for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i, b = a + segs + 1;
      I.push(a, b, a + 1, a + 1, b, b + 1);
    }
    return { P, N, UV, C, I };
  }

  function primCylinder(r, h, seg, capped) {
    seg = seg || 20;
    const P = [], N = [], UV = [], C = [], I = [];
    const hh = h / 2;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      P.push(c * r, -hh, s * r); N.push(c, 0, s); UV.push(i / seg, 0); C.push(1, 1, 1, 1);
      P.push(c * r, hh, s * r); N.push(c, 0, s); UV.push(i / seg, 1); C.push(1, 1, 1, 1);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2;
      I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    if (capped !== false) {
      let base = P.length / 3;
      P.push(0, hh, 0); N.push(0, 1, 0); UV.push(0.5, 0.5); C.push(1, 1, 1, 1);
      for (let i = 0; i <= seg; i++) {
        const t = i / seg * Math.PI * 2;
        P.push(Math.cos(t) * r, hh, Math.sin(t) * r); N.push(0, 1, 0);
        UV.push(0.5 + Math.cos(t) * 0.5, 0.5 + Math.sin(t) * 0.5); C.push(1, 1, 1, 1);
      }
      for (let i = 0; i < seg; i++) I.push(base, base + 1 + i, base + 2 + i);
      base = P.length / 3;
      P.push(0, -hh, 0); N.push(0, -1, 0); UV.push(0.5, 0.5); C.push(1, 1, 1, 1);
      for (let i = 0; i <= seg; i++) {
        const t = i / seg * Math.PI * 2;
        P.push(Math.cos(t) * r, -hh, Math.sin(t) * r); N.push(0, -1, 0);
        UV.push(0.5 + Math.cos(t) * 0.5, 0.5 + Math.sin(t) * 0.5); C.push(1, 1, 1, 1);
      }
      for (let i = 0; i < seg; i++) I.push(base, base + 2 + i, base + 1 + i);
    }
    return { P, N, UV, C, I };
  }

  function mergePrims(list) {
    const out = { P: [], N: [], UV: [], C: [], I: [] };
    let base = 0;
    for (const item of list) {
      const p = item.prim, m = item.mat;
      const col = item.color || [1, 1, 1, 1];
      const sx = Math.hypot(m[0], m[1], m[2]) || 1;
      for (let i = 0; i < p.P.length; i += 3) {
        const x = p.P[i], y = p.P[i + 1], z = p.P[i + 2];
        const nx = p.N[i], ny = p.N[i + 1], nz = p.N[i + 2];
        out.P.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
        let tx = m[0] * nx + m[4] * ny + m[8] * nz, ty = m[1] * nx + m[5] * ny + m[9] * nz, tz = m[2] * nx + m[6] * ny + m[10] * nz;
        const l = Math.hypot(tx, ty, tz) || 1;
        out.N.push(tx / l, ty / l, tz / l);
      }
      out.UV.push(...p.UV);
      for (let i = 0; i < p.P.length / 3; i++) out.C.push(col[0], col[1], col[2], col[3]);
      for (const idx of p.I) out.I.push(base + idx);
      base += p.P.length / 3;
    }
    return out;
  }

// ---------------- 渲染器 ----------------
  class Renderer {
    constructor() {
      this.ok = false;
      this.MODE = MODE;
      const q = new URLSearchParams(location.search).get('dbg') || '';
      this.DBG = q.split(',').filter(Boolean);
      this.shadowExtent = 2.0;
      this.shadowCenter = new Float32Array([0, 0.3, 0]);
      this.lightDir = new Float32Array([0.55, 0.95, 0.42]);
      V3.normalize(this.lightDir, this.lightDir);
      this.lightColor = new Float32Array([1.30, 1.22, 1.10, 1.0]);
      this.skyColor = new Float32Array([0.10, 0.15, 0.27, 1.0]);
      this.groundColor = new Float32Array([0.035, 0.045, 0.065, 1.0]);
      this._objArr = new Float32Array(28);
      this._frameArr = new Float32Array(112);
      this.drawCalls = 0;
    }

    async create(canvas) {
      if (!navigator.gpu) throw new Error('浏览器不支持 WebGPU');
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) throw new Error('未获取到 WebGPU 适配器');
      this.adapter = adapter;
      const device = await adapter.requestDevice();
      this.device = device;
      this.canvas = canvas;
      this.context = canvas.getContext('webgpu');
      this.format = navigator.gpu.getPreferredCanvasFormat();
      this.context.configure({
        device, format: this.format, alphaMode: 'opaque',
        usage: this.DBG.includes('nousage') ? undefined : (GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC),
      });
      this.limits = device.limits;
      this.alignment = Math.max(256, this.limits.minUniformBufferOffsetAlignment || 256);

      // 帧 UBO
      this.frameUBO = device.createBuffer({ size: 448, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      // 对象 UBO（动态偏移）
      this.objSlots = 512;
      this.objUBO = device.createBuffer({
        size: this.objSlots * this.alignment,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const frameBG = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
          { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        ],
      });
      const objBG = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 112 } },
        ],
      });
      this.frameBGLayout = frameBG;
      this.objBGLayout = objBG;

      const mainMod = device.createShaderModule({ code: WGSL_MAIN });
      const depthMod = device.createShaderModule({ code: WGSL_DEPTH });
      const skyMod = device.createShaderModule({ code: WGSL_SKY });
      this._mods = { mainMod, depthMod, skyMod };

      const vbLayout = [{
        arrayStride: 48,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32x2' },
          { shaderLocation: 3, offset: 32, format: 'float32x4' },
        ],
      }];
      this.vbLayout = vbLayout;

      const depthState = { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' };
      const sampleCount = this.DBG.includes('nomsaa') ? 1 : 4;
      const mkPipe = (mod, blend, cull, depthWrite) => device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [frameBG, objBG] }),
        vertex: { module: mod, entryPoint: 'vsMain', buffers: vbLayout },
        fragment: { module: mod, entryPoint: 'fsMain', targets: [{ format: this.format, blend }] },
        primitive: { topology: 'triangle-list', cullMode: cull },
        depthStencil: { ...depthState, depthWriteEnabled: depthWrite },
        multisample: { count: sampleCount },
      });

      const alphaBlend = {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      };
      this.pipeOpaque = mkPipe(mainMod, undefined, 'back', true);
      this.pipeAlpha = mkPipe(mainMod, alphaBlend, 'back', true);
      this.pipeAlphaDouble = mkPipe(mainMod, alphaBlend, 'none', true);
      this.pipeAlphaNoWrite = mkPipe(mainMod, alphaBlend, 'none', false);

      this.pipeDepth = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [this._depthFrameBG(), objBG] }),
        vertex: { module: depthMod, entryPoint: 'vsDepth', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      });

      this.skyPipe = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [this._skyBG()] }),
        vertex: { module: skyMod, entryPoint: 'vsSky' },
        fragment: { module: skyMod, entryPoint: 'fsSky', targets: [{ format: this.format }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
        multisample: { count: sampleCount },
      });

      this.flatPipe = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: device.createShaderModule({ code: `@vertex fn vs(@builtin(vertex_index)i:u32)->@builtin(position)vec4f{let p=array(vec2f(0.,0.),vec2f(2.,0.),vec2f(0.,2.));return vec4f(p[i],0.,1.);}` }), entryPoint: 'vs' },
        fragment: { module: device.createShaderModule({ code: `@fragment fn fs()->@location(0)vec4f{return vec4f(0.2,0.9,0.3,1.);}` }), entryPoint: 'fs', targets: [{ format: this.format }] },
        primitive: { topology: 'triangle-list' },
      });
      this._depthFrameUBO = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      this._depthFrameBGObj = null;
      this.shadowTex = null;
      this.shadowSize = 2048;
      this.msaaTex = null;
      this.depthTex = null;
      this.refractTex = null;
      this.ok = true;
      this.resize(canvas.width || 1280, canvas.height || 720);
      device.lost.then((info) => { if (this.onlost) this.onlost(info); });
      return this;
    }

    _depthFrameBG() {
      return this.device.createBindGroupLayout({
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
      });
    }
    _skyBG() {
      return this.device.createBindGroupLayout({
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
      });
    }

    resize(w, h) {
      w = Math.max(2, w | 0); h = Math.max(2, h | 0);
      if (this.width === w && this.height === h && this.depthTex) return;
      this.width = w; this.height = h;
      const d = this.device;
      if (this.depthTex) { this.depthTex.destroy(); this.msaaTex.destroy(); this.refractTex.destroy(); this.shadowTex.destroy(); }
      this.depthTex = d.createTexture({
        size: [w, h], format: 'depth24plus', sampleCount: this.DBG.includes('nomsaa') ? 1 : 4,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.msaaTex = d.createTexture({
        size: [w, h], format: this.format, sampleCount: this.DBG.includes('nomsaa') ? 1 : 4,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.refractTex = d.createTexture({
        size: [w, h], format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
      });
      this.shadowTex = d.createTexture({
        size: [this.shadowSize, this.shadowSize], format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      this._rebuildBindGroups();
    }

    _rebuildBindGroups() {
      const d = this.device;
      this.frameBG = d.createBindGroup({
        layout: this.frameBGLayout,
        entries: [
          { binding: 0, resource: { buffer: this.frameUBO } },
          { binding: 1, resource: this.shadowTex.createView() },
          { binding: 2, resource: d.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' }) },
          { binding: 3, resource: this.refractTex.createView() },
          { binding: 4, resource: d.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
        ],
      });
      this.objBG = d.createBindGroup({
        layout: this.objBGLayout,
        entries: [{ binding: 0, resource: { buffer: this.objUBO, size: 112 } }],
      });
      this.depthFrameBG = d.createBindGroup({
        layout: this._depthFrameBG(),
        entries: [{ binding: 0, resource: { buffer: this._depthFrameUBO } }],
      });
      this.skyBG = d.createBindGroup({
        layout: this._skyBG(),
        entries: [{ binding: 0, resource: { buffer: this.frameUBO } }],
      });
    }

    setLight(dir, color) {
      if (dir) { V3.normalize(this.lightDir, dir); }
      if (color) this.lightColor.set(color);
    }
    setAmbient(sky, ground) {
      if (sky) this.skyColor.set(sky);
      if (ground) this.groundColor.set(ground);
    }

    // ---------------- 网格 ----------------
    createMesh(data, opts) {
      opts = opts || {};
      const d = this.device;
      const n = data.P.length / 3;
      const inter = new Float32Array(n * 12);
      for (let i = 0; i < n; i++) {
        inter[i * 12 + 0] = data.P[i * 3];
        inter[i * 12 + 1] = data.P[i * 3 + 1];
        inter[i * 12 + 2] = data.P[i * 3 + 2];
        inter[i * 12 + 3] = data.N[i * 3];
        inter[i * 12 + 4] = data.N[i * 3 + 1];
        inter[i * 12 + 5] = data.N[i * 3 + 2];
        inter[i * 12 + 6] = data.UV ? data.UV[i * 2] : 0;
        inter[i * 12 + 7] = data.UV ? data.UV[i * 2 + 1] : 0;
        inter[i * 12 + 8] = data.C ? data.C[i * 4] : 1;
        inter[i * 12 + 9] = data.C ? data.C[i * 4 + 1] : 1;
        inter[i * 12 + 10] = data.C ? data.C[i * 4 + 2] : 1;
        inter[i * 12 + 11] = data.C ? data.C[i * 4 + 3] : 1;
      }
      const vb = d.createBuffer({ size: Math.max(inter.byteLength, 1), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(vb, 0, inter);
      let ib = null, ic = 0;
      if (data.I && data.I.length) {
        const idx = new Uint32Array(data.I);
        ic = idx.length;
        ib = d.createBuffer({ size: Math.max(idx.byteLength, 4), usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
        d.queue.writeBuffer(ib, 0, idx);
      }
      return { vb, ib, count: ic, verts: n, dynamic: false, maxVerts: n, maxIndices: ic, interleaved: inter };
    }

    createDynamicMesh(maxVerts, maxIndices) {
      const d = this.device;
      const vb = d.createBuffer({
        size: Math.max(maxVerts * 48, 1),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      const ib = d.createBuffer({
        size: Math.max(maxIndices * 4, 4),
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
      return { vb, ib, count: 0, verts: 0, dynamic: true, maxVerts, maxIndices, interleaved: new Float32Array(maxVerts * 12) };
    }

    updateDynamicMesh(mesh, verts, indices) {
      const d = this.device;
      if (verts) d.queue.writeBuffer(mesh.vb, 0, verts);
      if (indices) {
        d.queue.writeBuffer(mesh.ib, 0, indices);
        mesh.count = indices.length;
      }
    }

    createGPUMesh(maxVerts, maxIndices) {
      const d = this.device;
      const vb = d.createBuffer({
        size: Math.max(maxVerts * 48, 1),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      const ib = d.createBuffer({
        size: Math.max(maxIndices * 4, 4),
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
      });
      return { vb, ib, count: 0, gpu: true, maxVerts, maxIndices };
    }

    // ---------------- 帧 ----------------
    begin(camera) {
      const d = this.device;
      this.camera = camera;
      this._slot = 0;
      this.drawCalls = 0;
      const a = this.width / this.height;
      camera.update(a, 1 / 60);
      const f = this._frameArr;
      f.set(camera.viewProj, 0);
      f.set(camera.view, 16);
      f.set(camera.proj, 32);
      f.set(camera.invViewProj, 48);
      f[64] = camera.position[0]; f[65] = camera.position[1]; f[66] = camera.position[2]; f[67] = 0;
      f[68] = this.lightDir[0]; f[69] = this.lightDir[1]; f[70] = this.lightDir[2]; f[71] = 0;
      f[72] = this.lightColor[0]; f[73] = this.lightColor[1]; f[74] = this.lightColor[2]; f[75] = this.lightColor[3];
      f[76] = this.skyColor[0]; f[77] = this.skyColor[1]; f[78] = this.skyColor[2]; f[79] = this.skyColor[3];
      f[80] = this.groundColor[0]; f[81] = this.groundColor[1]; f[82] = this.groundColor[2]; f[83] = this.groundColor[3];
      // 阴影矩阵
      const c = this.shadowCenter;
      const ext = this.shadowExtent;
      const eye = new Float32Array([c[0] + this.lightDir[0] * 6, c[1] + this.lightDir[1] * 6, c[2] + this.lightDir[2] * 6]);
      const lv = M4.lookAt(M4.create(), eye, c, [0, 1, 0]);
      const lp = M4.ortho(M4.create(), -ext, ext, -ext, ext, 0.5, 12);
      const svp = M4.multiply(M4.create(), lp, lv);
      f.set(svp, 84);
      f[100] = eye[0]; f[101] = eye[1]; f[102] = eye[2]; f[103] = 0;
      f[104] = this.width; f[105] = this.height;
      f[106] = this.time || 0;
      f[107] = 1 / this.shadowSize; f[108] = 0.0016; f[109] = 1.0; f[110] = 0.6;
      d.queue.writeBuffer(this.frameUBO, 0, f);
      d.queue.writeBuffer(this._depthFrameUBO, 0, svp);

      this.encoder = d.createCommandEncoder();
      if (!this.DBG.includes('noshadow')) this._beginShadow();
      window.__dbg = window.__dbg || {}; window.__dbg.begins = (window.__dbg.begins || 0) + 1;
      return this.encoder;
    }

    setTime(t) { this.time = t; }

    _beginShadow() {
      this.shadowView = this.shadowTex.createView();
      this.shadowPass = this.encoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: {
          view: this.shadowView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store',
        },
      });
      this.shadowPass.setPipeline(this.pipeDepth);
      this.shadowPass.setBindGroup(0, this.depthFrameBG);
    }

    endShadow() { if (this.shadowPass) { this.shadowPass.end(); this.shadowPass = null; } }

    _nextSlot() {
      const i = this._slot++;
      if (i >= this.objSlots) throw new Error('对象 UBO 槽位不足');
      return i * this.alignment;
    }

    beginMain() {
      const d = this.device;
      this.canvasView = this.context.getCurrentTexture().createView();
      this.msaaView = this.msaaTex.createView();
      this.depthView = this.depthTex.createView();
      window.__dbg = window.__dbg || {}; window.__dbg.mains = (window.__dbg.mains || 0) + 1;
      const noMsaa = this.DBG.includes('nomsaa');
      this.mainPass = this.encoder.beginRenderPass({
        colorAttachments: [{
          view: noMsaa ? this.canvasView : this.msaaView,
          resolveTarget: noMsaa ? undefined : this.canvasView,
          clearValue: this.DBG.includes('red') ? { r: 1, g: 0.1, b: 0.1, a: 1 } : { r: 0.03, g: 0.04, b: 0.06, a: 1 },
          loadOp: 'clear', storeOp: 'store',
        }],
        depthStencilAttachment: { view: this.depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      this.mainPass.setBindGroup(0, this.frameBG);
      // 天空
      this.mainPass.setPipeline(this.skyPipe);
      this.mainPass.setBindGroup(0, this.skyBG);
      this.mainPass.draw(3);
      this.mainPass.setBindGroup(0, this.frameBG);
      if (this.DBG.includes('flat')) {
        this.mainPass.setPipeline(this.flatPipe);
        this.mainPass.draw(3);
      }
      return this.mainPass;
    }

    finishMainAndCopy() {
      const d = this.device;
      this.mainPass.end();
      d.queue.writeBuffer(this.frameUBO, 0, this._frameArr);
      // 将已渲染的场景拷贝到折射纹理
      if (!this.DBG.includes('nocopy')) {
        this.encoder.copyTextureToTexture(
          { texture: this.context.getCurrentTexture() },
          { texture: this.refractTex },
          { width: this.width, height: this.height, depthOrArrayLayers: 1 }
        );
      }
    }

    beginTransparent() {
      if (this.DBG.includes('notrans')) return null;
      const d = this.device;
      this.transPass = this.encoder.beginRenderPass({
        colorAttachments: [{
          view: this.msaaView,
          resolveTarget: this.canvasView,
          loadOp: 'load', storeOp: 'store',
        }],
        depthStencilAttachment: { view: this.depthView, depthLoadOp: 'load', depthStoreOp: 'store' },
      });
      this.transPass.setBindGroup(0, this.frameBG);
      return this.transPass;
    }

    end() {
      if (this.transPass) this.transPass.end();
      const probe = this.DBG.includes('probe');
      let pb = null;
      if (probe && !this._probing) {
        this._probing = true;
        pb = this.device.createBuffer({ size: 4 * 32 * 32, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        this.encoder.copyTextureToBuffer(
          { texture: this.context.getCurrentTexture() },
          { buffer: pb, bytesPerRow: 4 * 32, rowsPerImage: 32 },
          { width: 32, height: 32, depthOrArrayLayers: 1 }
        );
      }
      this.device.queue.submit([this.encoder.finish()]);
      window.__dbg = window.__dbg || {}; window.__dbg.submits = (window.__dbg.submits || 0) + 1;
      if (pb) {
        pb.mapAsync(GPUMapMode.READ).then(() => {
          const a = new Uint8Array(pb.getMappedRange());
          let s = [0, 0, 0];
          for (let i = 0; i < a.length; i += 4) { s[0] += a[i]; s[1] += a[i + 1]; s[2] += a[i + 2]; }
          window.__probe = { avg: s.map(x => Math.round(x / (a.length / 4))), t: this.time };
          pb.unmap();
        }).catch(e => { window.__probe = { err: String(e) }; });
      }
    }

    // ---------------- 绘制 ----------------
    _writeObj(world, color, params, params2) {
      const a = this._objArr;
      if (world) a.set(world, 0); else M4.identity(a);
      a[16] = color[0]; a[17] = color[1]; a[18] = color[2]; a[19] = color[3];
      a[20] = params[0]; a[21] = params[1]; a[22] = params[2]; a[23] = params[3];
      a[24] = params2 ? params2[0] : 0; a[25] = params2 ? params2[1] : 0; a[26] = params2 ? params2[2] : 0; a[27] = params2 ? params2[3] : 0;
      const off = this._nextSlot();
      this.device.queue.writeBuffer(this.objUBO, off, a);
      return off;
    }

    drawMesh(pass, mesh, world, color, params, params2, pipeline) {
      if (this.DBG.includes('skyonly')) return;
      const off = this._writeObj(world, color, params, params2);
      pass.setPipeline(pipeline || (params[2] < 0.999 ? this.pipeAlpha : this.pipeOpaque));
      pass.setBindGroup(1, this.objBG, [off]);
      pass.setVertexBuffer(0, mesh.vb);
      if (mesh.ib) {
        pass.setIndexBuffer(mesh.ib, 'uint32');
        pass.drawIndexed(mesh.count || mesh.gpuIndexCount || 0, 1, 0, 0, 0);
      } else {
        pass.draw(mesh.verts, 1);
      }
      this.drawCalls++;
    }

    drawMeshRaw(pass, mesh, world, color, params, params2, pipeline) {
      const off = this._writeObj(world, color, params, params2);
      pass.setPipeline(pipeline);
      pass.setBindGroup(1, this.objBG, [off]);
      pass.setVertexBuffer(0, mesh.vb);
      pass.setIndexBuffer(mesh.ib, 'uint32');
      pass.drawIndexed(mesh.count, 1, 0, 0, 0);
      this.drawCalls++;
    }

    drawMeshIndirect(pass, mesh, world, color, params, params2, pipeline) {
      const off = this._writeObj(world, color, params, params2);
      pass.setPipeline(pipeline);
      pass.setBindGroup(1, this.objBG, [off]);
      pass.setVertexBuffer(0, mesh.vb);
      pass.drawIndexedIndirect(mesh.ib, 0);
      this.drawCalls++;
    }

    drawShadowMesh(mesh, world) {
      if (this.DBG.includes('skyonly')) return;
      const a = this._objArr;
      if (world) a.set(world, 0); else M4.identity(a);
      const off = this._nextSlot();
      this.device.queue.writeBuffer(this.objUBO, off, a);
      this.shadowPass.setBindGroup(1, this.objBG, [off]);
      this.shadowPass.setVertexBuffer(0, mesh.vb);
      if (mesh.ib) {
        this.shadowPass.setIndexBuffer(mesh.ib, 'uint32');
        this.shadowPass.drawIndexed(mesh.count, 1, 0, 0, 0);
      } else {
        this.shadowPass.draw(mesh.verts, 1);
      }
    }
  }

  App.Renderer = Renderer;
  App.PRIM = { primBox, primSphere, primPlane, primCylinder, mergePrims };
  App.RENDER_MODE = MODE;
})();
