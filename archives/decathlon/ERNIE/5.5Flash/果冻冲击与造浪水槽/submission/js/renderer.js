// 渲染核心：统一灯光、阴影、PBR 材质、果冻半透明材质、玻璃材质
const SHADER_PRELUDE = /* wgsl */`
struct Frame {
  viewProj : mat4x4<f32>,
  lightVP  : mat4x4<f32>,
  camPos   : vec4<f32>,
  lightDir : vec4<f32>,
  sunColor : vec4<f32>,
  skyColor : vec4<f32>,
  gndColor : vec4<f32>,
  res      : vec4<f32>,
  misc     : vec4<f32>,
  misc2    : vec4<f32>,
};
struct Obj {
  model  : mat4x4<f32>,
  color  : vec4<f32>,
  params : vec4<f32>,
  params2: vec4<f32>,
};
const PI : f32 = 3.14159265;
fn D_GGX(NoH: f32, a: f32) -> f32 {
  let a2 = a * a;
  let d = (NoH * a2 - NoH) * NoH + 1.0;
  return a2 / (PI * d * d + 1e-7);
}
fn V_Smith(NoV: f32, NoL: f32, a: f32) -> f32 {
  let k = a * 0.5;
  let gv = NoV / (NoV * (1.0 - k) + k + 1e-7);
  let gl = NoL / (NoL * (1.0 - k) + k + 1e-7);
  return gv * gl;
}
fn F_Schlick(u: f32, f0: vec3<f32>) -> vec3<f32> {
  return f0 + (vec3<f32>(1.0, 1.0, 1.0) - f0) * pow(1.0 - u, 5.0);
}
fn aces(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}
`;

const SHADOW_FN = /* wgsl */`
@group(0) @binding(1) var shadowMap : texture_depth_2d;
@group(0) @binding(2) var shadowSamp : sampler_comparison;
fn shadowAt(sc: vec4<f32>, N: vec3<f32>, L: vec3<f32>) -> f32 {
  let proj = sc.xyz / max(sc.w, 1e-5);
  let uv = vec2<f32>(proj.x * 0.5 + 0.5, 0.5 - proj.y * 0.5);
  if (uv.x <= 0.002 || uv.x >= 0.998 || uv.y <= 0.002 || uv.y >= 0.998) { return 1.0; }
  let ndl = max(dot(N, L), 0.0);
  let bias = 0.0009 + 0.0035 * (1.0 - ndl);
  var s = 0.0;
  let tx = 1.4 / 2048.0;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let o = vec2<f32>(f32(x), f32(y)) * tx;
      s = s + textureSampleCompareLevel(shadowMap, shadowSamp, uv + o, proj.z - bias);
    }
  }
  return s / 9.0;
}
`;

const SCENE_WGSL = SHADER_PRELUDE + SHADOW_FN + /* wgsl */`
@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> obj : Obj;

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) wpos : vec3<f32>,
  @location(1) nrm  : vec3<f32>,
  @location(2) sp   : vec4<f32>,
};

@vertex fn vs(@location(0) pos: vec3<f32>, @location(1) nrm: vec3<f32>) -> VSOut {
  var o: VSOut;
  let wp = obj.model * vec4<f32>(pos, 1.0);
  o.wpos = wp.xyz;
  o.nrm = normalize((obj.model * vec4<f32>(nrm, 0.0)).xyz);
  o.sp = frame.lightVP * wp;
  o.clip = frame.viewProj * wp;
  return o;
}

fn envColor(dir: vec3<f32>) -> vec3<f32> {
  let y = dir.y * 0.5 + 0.5;
  return mix(frame.gndColor.xyz, frame.skyColor.xyz, smoothstep(0.0, 1.0, y));
}

@fragment fn fs(i: VSOut) -> @location(0) vec4<f32> {
  var N = normalize(i.nrm);
  let V = normalize(frame.camPos.xyz - i.wpos);
  if (dot(N, V) < 0.0) { N = -N; }
  let L = normalize(frame.lightDir.xyz);
  let H = normalize(V + L);
  let NoL = max(dot(N, L), 0.0);
  let NoV = max(dot(N, V), 1e-4);
  let NoH = max(dot(N, H), 0.0);
  let VoH = max(dot(V, H), 0.0);

  let albedo = obj.color.rgb;
  let rough = clamp(obj.params.x, 0.045, 1.0);
  let metal = clamp(obj.params.y, 0.0, 1.0);
  let a = rough * rough;
  let f0 = mix(vec3<f32>(0.04), albedo, metal);

  let sh = shadowAt(i.sp, N, L);
  let sun = frame.sunColor.xyz * NoL * sh;
  let spec = D_GGX(NoH, a) * V_Smith(NoV, NoL, a) * F_Schlick(VoH, f0);
  let kd = (vec3<f32>(1.0) - F_Schlick(NoV, f0)) * (1.0 - metal);

  var col = (kd * albedo / PI + spec) * sun;

  // 环境光（半球）
  let amb = envColor(N);
  col = col + albedo * amb * (0.55 + 0.45 * N.y) * (1.0 - metal * 0.65);
  // 环境镜面
  let R = reflect(-V, N);
  let envSpec = envColor(R) * F_Schlick(NoV, f0) * (1.0 - rough * 0.75);
  col = col + envSpec * (0.35 + 0.65 * sh);

  // 雾
  let dist = length(frame.camPos.xyz - i.wpos);
  let fog = 1.0 - exp(-pow(dist * 0.045, 2.0));
  col = mix(col, envColor(normalize(i.wpos - frame.camPos.xyz)) * 0.5, fog * 0.55);

  return vec4<f32>(col, obj.color.a);
}
`;

const JELLY_WGSL = SHADER_PRELUDE + SHADOW_FN + /* wgsl */`
@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> obj : Obj;

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) wpos : vec3<f32>,
  @location(1) nrm  : vec3<f32>,
  @location(2) sp   : vec4<f32>,
};

@vertex fn vs(@location(0) pos: vec3<f32>, @location(1) nrm: vec3<f32>) -> VSOut {
  var o: VSOut;
  o.wpos = pos;
  o.nrm = nrm;
  o.sp = frame.lightVP * vec4<f32>(pos, 1.0);
  o.clip = frame.viewProj * vec4<f32>(pos, 1.0);
  return o;
}

@fragment fn fs(i: VSOut, @builtin(front_facing) ff: bool) -> @location(0) vec4<f32> {
  var N = normalize(i.nrm);
  let V = normalize(frame.camPos.xyz - i.wpos);
  let L = normalize(frame.lightDir.xyz);
  if (!ff) { N = -N; }
  let NoL = max(dot(N, L), 0.0);
  let NoV = max(dot(N, V), 1e-4);
  let H = normalize(V + L);
  let NoH = max(dot(N, H), 0.0);

  let sh = shadowAt(i.sp, N, L);
  let base = obj.color.rgb;
  let a = 0.16;
  let f0 = vec3<f32>(0.05);
  let spec = D_GGX(NoH, a) * V_Smith(NoV, NoL, a) * F_Schlick(max(dot(V, H), 0.0), f0);

  // 次表面：透射光
  let back = pow(max(dot(V, -L), 0.0), 2.2);
  let wrap = max(dot(N, L) * 0.5 + 0.5, 0.0);
  var col = base * (0.30 + 0.55 * wrap) * (0.55 + 0.45 * sh);
  col = col + base * back * 0.55 * sh;
  col = col + spec * frame.sunColor.xyz * 1.5 * sh;

  // 菲涅尔边缘
  let fres = pow(1.0 - NoV, 3.0);
  col = col + base * fres * 0.9 + vec3<f32>(fres * 0.10);
  // 环境
  col = col + base * vec3<f32>(0.10, 0.12, 0.16) * (0.5 + 0.5 * N.y);

  var alpha = obj.params.x;
  if (ff) { alpha = min(1.0, alpha * 1.12); } else { alpha = alpha * 0.52; col = col * 0.62; }
  alpha = clamp(alpha + fres * 0.45, 0.0, 1.0);
  return vec4<f32>(col, alpha);
}
`;

const GLASS_WGSL = SHADER_PRELUDE + SHADOW_FN + /* wgsl */`
@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> obj : Obj;

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) wpos : vec3<f32>,
  @location(1) nrm  : vec3<f32>,
  @location(2) sp   : vec4<f32>,
};

@vertex fn vs(@location(0) pos: vec3<f32>, @location(1) nrm: vec3<f32>) -> VSOut {
  var o: VSOut;
  let wp = obj.model * vec4<f32>(pos, 1.0);
  o.wpos = wp.xyz;
  o.nrm = normalize((obj.model * vec4<f32>(nrm, 0.0)).xyz);
  o.sp = frame.lightVP * wp;
  o.clip = frame.viewProj * wp;
  return o;
}

@fragment fn fs(i: VSOut) -> @location(0) vec4<f32> {
  var N = normalize(i.nrm);
  let V = normalize(frame.camPos.xyz - i.wpos);
  if (dot(N, V) < 0.0) { N = -N; }
  let L = normalize(frame.lightDir.xyz);
  let NoV = max(dot(N, V), 1e-4);
  let fres = pow(1.0 - NoV, 4.0);
  let R = reflect(-V, N);
  let env = mix(frame.gndColor.xyz, frame.skyColor.xyz, smoothstep(-0.3, 0.9, R.y));
  let spec = pow(max(dot(R, L), 0.0), 220.0) * 3.0;
  var col = env * (0.16 + 0.84 * fres) + vec3<f32>(spec);
  var alpha = obj.color.a * (0.10 + 0.75 * fres);
  // 边缘加亮
  alpha = clamp(alpha + spec * 0.5, 0.0, 0.92);
  return vec4<f32>(col, alpha);
}
`;

const BG_WGSL = SHADER_PRELUDE + /* wgsl */`
@group(0) @binding(0) var<uniform> frame : Frame;
struct VSOut { @builtin(position) clip: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o: VSOut;
  o.clip = vec4<f32>(p[vi], 0.999, 1.0);
  o.uv = p[vi] * 0.5 + 0.5;
  return o;
}
fn hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}
@fragment fn fs(i: VSOut) -> @location(0) vec4<f32> {
  let uv = i.uv;
  let y = uv.y;
  var col = mix(vec3<f32>(0.012, 0.016, 0.024), vec3<f32>(0.035, 0.045, 0.062), smoothstep(0.0, 1.0, y));
  // 顶部聚光
  let d = length((uv - vec2<f32>(0.5, 0.86)) * vec2<f32>(1.25, 1.0));
  col = col + vec3<f32>(0.10, 0.13, 0.18) * exp(-d * d * 6.0);
  // 地面反光
  let d2 = length((uv - vec2<f32>(0.5, -0.15)) * vec2<f32>(0.8, 1.6));
  col = col + vec3<f32>(0.03, 0.045, 0.07) * exp(-d2 * d2 * 3.0);
  // 细微噪点
  col = col + (hash(uv * frame.res.xy) - 0.5) * 0.006;
  return vec4<f32>(col, 1.0);
}
`;

const COMPOSITE_WGSL = SHADER_PRELUDE + /* wgsl */`
@group(0) @binding(0) var<uniform> frame : Frame;
@group(0) @binding(1) var sceneTex : texture_2d<f32>;
@group(0) @binding(2) var linSamp : sampler;
@group(0) @binding(3) var wDepth : texture_2d<f32>;
@group(0) @binding(4) var wThick : texture_2d<f32>;

struct VSOut { @builtin(position) clip: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o: VSOut;
  o.clip = vec4<f32>(p[vi], 0.0, 1.0);
  o.uv = vec2<f32>(p[vi].x * 0.5 + 0.5, 0.5 - p[vi].y * 0.5);
  return o;
}

fn depthAt(px: vec2<i32>) -> f32 {
  let s = vec2<i32>(textureDimensions(wDepth));
  let c = clamp(px, vec2<i32>(0), s - vec2<i32>(1));
  return textureLoad(wDepth, c, 0).r;
}

fn waterNormal(uv: vec2<f32>, px: vec2<i32>) -> vec3<f32> {
  let c = depthAt(px);
  let l = depthAt(px + vec2<i32>(-1, 0));
  let r = depthAt(px + vec2<i32>(1, 0));
  let d = depthAt(px + vec2<i32>(0, -1));
  let u = depthAt(px + vec2<i32>(0, 1));
  let dx = (r - l);
  let dy = (u - d);
  return normalize(vec3<f32>(-dx * 8.0, -dy * 8.0, 0.055));
}

@fragment fn fs(i: VSOut) -> @location(0) vec4<f32> {
  let uv = i.uv;
  var col = textureSampleLevel(sceneTex, linSamp, uv, 0.0).rgb;
  let texel = frame.res.zw;
  let ipx = vec2<i32>(i.clip.xy);
  let wd = depthAt(ipx);

  if (wd < 0.9999) {
    let thick = textureSampleLevel(wThick, linSamp, uv, 0.0).r;
    let foam = textureSampleLevel(wThick, linSamp, uv, 0.0).g;
    let n = waterNormal(uv, ipx);
    let V = vec3<f32>(0.0, 0.0, 1.0);
    // 反射
    let R = reflect(-V, n);
    let env = mix(frame.gndColor.xyz, frame.skyColor.xyz, smoothstep(-0.25, 0.95, R.y));
    // 折射：屏幕空间偏移
    let off = n.xy * 0.055 * clamp(thick * 0.7, 0.25, 1.6);
    var refr = textureSampleLevel(sceneTex, linSamp, uv + off, 0.0).rgb;
    // 吸收
    let absorb = exp(-vec3<f32>(0.42, 0.13, 0.10) * thick * 2.2);
    refr = refr * absorb + vec3<f32>(0.02, 0.10, 0.13) * (1.0 - absorb);
    let fres = 0.03 + 0.97 * pow(1.0 - max(n.z, 0.0), 4.0);
    var wcol = mix(refr, env, clamp(fres, 0.0, 0.92));
    // 高光
    let L = normalize(frame.lightDir.xyz);
    let H = normalize(L + V);
    let spec = pow(max(dot(n, H), 0.0), 420.0) * 4.0 + pow(max(dot(n, H), 0.0), 40.0) * 0.10;
    wcol = wcol + vec3<f32>(1.0, 0.99, 0.95) * spec;
    // 白水
    let foamMask = smoothstep(0.15, 1.1, foam);
    wcol = mix(wcol, vec3<f32>(0.90, 0.95, 1.0) * (0.55 + 0.55 * max(dot(n, L), 0.0)), foamMask * 0.92);
    // 边缘淡出
    let edge = smoothstep(0.0, 0.25, thick);
    col = mix(col, wcol, edge * 0.96);
  }

  // 色调映射
  col = aces(col * 1.05);
  col = pow(col, vec3<f32>(1.0 / 2.2));
  let dbg = frame.misc2.x;
  if (dbg > 0.5) {
    if (dbg < 1.5) {
      let dv = depthAt(ipx);
      let g = clamp(1.0 - (dv - 1.0) * 0.22, 0.0, 1.0);
      col = vec3<f32>(g);
    } else if (dbg < 2.5) {
      let tv = textureSampleLevel(wThick, linSamp, uv, 0.0).b;
      col = vec3<f32>(clamp(tv * 0.35, 0.0, 1.0));
    } else if (dbg < 3.5) {
      col = pow(aces(textureSampleLevel(sceneTex, linSamp, uv, 0.0).rgb * 1.05), vec3<f32>(1.0 / 2.2));
    }
  }
  // 暗角
  let q = (i.uv - 0.5) * vec2<f32>(frame.res.x / frame.res.y, 1.0);
  let vig = smoothstep(1.25, 0.25, length(q));
  col = col * (0.72 + 0.28 * vig);
  return vec4<f32>(col, 1.0);
}
`;

const R = {
  ready: false,
  pipelines: {},
  meshes: {},
  shadowTex: null,
  shadowView: null,
  shadowSampler: null,
  shadowSize: 2048,
  lightDir: (() => { const v = V3.norm([-0.42, 0.86, 0.38]); return v; })(),
  lightVP: new Float32Array(16),
  frameData: new Float32Array(64),
  sceneW: 1, sceneH: 1,
  targets: {},
  msaaColor: null, msaaDepth: null, resolveTex: null, depthTex: null,
  exposure: 1.0,
  time: 0,
  hdr: false,
};

function fmtFloat32(arr) { return arr; }

async function initRenderer(canvas) {
  const d = GPU.device;
  const s = GPU.sampleCount;

  // 阴影相机（正交）
  const sc = [0, 1.0, 0];
  const eye = [sc[0] + R.lightDir[0] * 8, sc[1] + R.lightDir[1] * 8, sc[2] + R.lightDir[2] * 8];
  const lv = M4.lookAt(eye, sc, [0, 1, 0]);
  const lo = M4.ortho(-3.4, 3.4, -3.4, 3.4, 1.0, 20.0);
  R.lightVP = M4.mul(lo, lv);

  R.shadowTex = d.createTexture({
    size: [R.shadowSize, R.shadowSize], dimension: '2d', format: 'depth32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING, label: 'shadow',
  });
  R.shadowView = R.shadowTex.createView();
  R.shadowSampler = d.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  R.lerpSampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

  const mk = (code, label) => d.createShaderModule({ code, label });
  const sceneMod = mk(SCENE_WGSL, 'scene');
  const jellyMod = mk(JELLY_WGSL, 'jelly');
  const glassMod = mk(GLASS_WGSL, 'glass');
  const bgMod = mk(BG_WGSL, 'bg');
  const compMod = mk(COMPOSITE_WGSL, 'composite');

  const frameBGL = d.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
    ],
  });
  const objBGL = d.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 256 } }],
  });
  const sceneLayout = d.createPipelineLayout({ bindGroupLayouts: [frameBGL, objBGL] });
  const vertBufLayout = {
    arrayStride: 24,
    attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
      { shaderLocation: 1, offset: 12, format: 'float32x3' },
    ],
  };

  R.pipelines.shadow = d.createRenderPipeline({
    layout: d.createPipelineLayout({ bindGroupLayouts: [frameBGL, objBGL] }),
    vertex: { module: sceneMod, entryPoint: 'vs', buffers: [vertBufLayout] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
  });

  R.pipelines.scene = d.createRenderPipeline({
    layout: sceneLayout,
    vertex: { module: sceneMod, entryPoint: 'vs', buffers: [vertBufLayout] },
    fragment: { module: sceneMod, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less', depthBias: 0, depthBiasSlopeScale: 0 },
    multisample: { count: s },
  });

  R.pipelines.sceneNoCull = d.createRenderPipeline({
    layout: sceneLayout,
    vertex: { module: sceneMod, entryPoint: 'vs', buffers: [vertBufLayout] },
    fragment: { module: sceneMod, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    multisample: { count: s },
  });

  R.pipelines.jelly = d.createRenderPipeline({
    layout: sceneLayout,
    vertex: { module: jellyMod, entryPoint: 'vs', buffers: [vertBufLayout] },
    fragment: {
      module: jellyMod, entryPoint: 'fs',
      targets: [{
        format: 'rgba16float',
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' },
    multisample: { count: s },
  });

  R.pipelines.glass = d.createRenderPipeline({
    layout: sceneLayout,
    vertex: { module: glassMod, entryPoint: 'vs', buffers: [vertBufLayout] },
    fragment: {
      module: glassMod, entryPoint: 'fs',
      targets: [{
        format: 'rgba16float',
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' },
    multisample: { count: s },
  });

  const bgFrameBGL = d.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  R.pipelines.bg = d.createRenderPipeline({
    layout: d.createPipelineLayout({ bindGroupLayouts: [bgFrameBGL] }),
    vertex: { module: bgMod, entryPoint: 'vs' },
    fragment: { module: bgMod, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
    multisample: { count: s },
  });
  R.bgBGL = bgFrameBGL;

  const compBGL = d.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });
  R.compBGL = compBGL;
  R.pipelines.composite = d.createRenderPipeline({
    layout: d.createPipelineLayout({ bindGroupLayouts: [compBGL] }),
    vertex: { module: compMod, entryPoint: 'vs' },
    fragment: { module: compMod, entryPoint: 'fs', targets: [{ format: GPU.format }] },
    primitive: { topology: 'triangle-list' },
  });

  R.frameBGL = frameBGL;
  R.objBGL = objBGL;
  R.vertBufLayout = vertBufLayout;
  R.sceneMod = sceneMod;

  // 网格
  R.meshes.sphere = new Mesh(makeSphere(24, 40));
  R.meshes.sphereLo = new Mesh(makeSphere(10, 16));
  R.meshes.disc = new Mesh(makeDisc(1, 96));
  R.meshes.cylinder = new Mesh(makeCylinder(0.5, 1, 96));
  R.meshes.box = new Mesh(makeBox(1, 1, 1));
  R.meshes.edges = new Mesh(makeEdgesBox(1, 1, 1, 0.012));

  R.frameUB = createBuffer(256, BUF.UNIFORM | BUF.COPY_DST, 'frame-ub');
  R.frameBG = d.createBindGroup({
    layout: frameBGL,
    entries: [
      { binding: 0, resource: { buffer: R.frameUB } },
      { binding: 1, resource: R.shadowView },
      { binding: 2, resource: R.shadowSampler },
    ],
  });
  R.bgUB = createBuffer(256, BUF.UNIFORM | BUF.COPY_DST, 'bg-ub');
  R.bgBG = d.createBindGroup({ layout: bgFrameBGL, entries: [{ binding: 0, resource: { buffer: R.bgUB } }] });

  // 阴影 pass 需要一份不指向 shadowMap 的绑定，避免同一贴图既写又采样
  const dummy = d.createTexture({ size: [1, 1], format: 'depth32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT, label: 'dummy-depth' });
  R.frameBGShadow = d.createBindGroup({
    layout: frameBGL,
    entries: [
      { binding: 0, resource: { buffer: R.frameUB } },
      { binding: 1, resource: dummy.createView() },
      { binding: 2, resource: R.shadowSampler },
    ],
  });

  R.arena = new UniformArena(256);
  R.objBG = R.arena.makeBindGroup(objBGL);

  R.ready = true;
  return R;
}

function makeEdgesBox(w, h, d, t) {
  const geos = [];
  const hw = w / 2, hh = h / 2, hd = d / 2;
  // 12 edges: 4 along x, 4 along y, 4 along z
  for (let i = 0; i < 4; i++) {
    const sy = (i & 1) ? 1 : -1, sz = (i & 2) ? 1 : -1;
    geos.push({ c: [0, sy * hh, sz * hd], s: [w + t, t, t] });
  }
  for (let i = 0; i < 4; i++) {
    const sx = (i & 1) ? 1 : -1, sz = (i & 2) ? 1 : -1;
    geos.push({ c: [sx * hw, 0, sz * hd], s: [t, h + t, t] });
  }
  for (let i = 0; i < 4; i++) {
    const sx = (i & 1) ? 1 : -1, sy = (i & 2) ? 1 : -1;
    geos.push({ c: [sx * hw, sy * hh, 0], s: [t, t, d + t] });
  }
  const pos = [], nrm = [], idx = [];
  for (const g of geos) {
    const box = makeBox(g.s[0], g.s[1], g.s[2]);
    const base = pos.length / 3;
    for (let i = 0; i < box.pos.length; i += 3) {
      pos.push(box.pos[i] + g.c[0], box.pos[i + 1] + g.c[1], box.pos[i + 2] + g.c[2]);
      nrm.push(box.nrm[i], box.nrm[i + 1], box.nrm[i + 2]);
    }
    for (let i = 0; i < box.idx.length; i++) idx.push(box.idx[i] + base);
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx) };
}

// ---- 每帧状态 ----
let CUR = null;

function beginFrame(opts = {}) {
  const d = GPU.device;
  const canvas = GPU.canvas;
  const w = canvas.width, h = canvas.height;
  R.sceneW = w; R.sceneH = h;

  // 尺寸变化 -> 重建目标
  if (R.targets.w !== w || R.targets.h !== h) {
    rebuildTargets(w, h);
  }

  const enc = d.createCommandEncoder();
  CUR = {
    enc,
    pass: null,
    phase: null,
    shadowList: [],
    drawList: [],
  };
  R.arena.begin();
  return CUR;
}

function rebuildTargets(w, h) {
  const d = GPU.device;
  const s = GPU.sampleCount;
  if (R.msaaColor) R.msaaColor.destroy();
  if (R.resolveTex) R.resolveTex.destroy();
  if (R.msaaDepth) R.msaaDepth.destroy();
  R.msaaColor = d.createTexture({ size: [w, h], sampleCount: s, format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT, label: 'msaa-color' });
  R.resolveTex = d.createTexture({ size: [w, h], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING, label: 'scene-color' });
  R.msaaDepth = createDepthTex(w, h, s, 'msaa-depth');
  R.targets.w = w; R.targets.h = h;
}

function setFrameUniforms(o) {
  // o: { viewProj, camPos, time, exposure, sunColor, skyColor, gndColor }
  const f = R.frameData;
  f.set(o.viewProj, 0);
  f.set(R.lightVP, 16);
  f[32] = o.camPos[0]; f[33] = o.camPos[1]; f[34] = o.camPos[2]; f[35] = 1;
  f[36] = R.lightDir[0]; f[37] = R.lightDir[1]; f[38] = R.lightDir[2]; f[39] = 0;
  const sun = o.sunColor || [1.0, 0.96, 0.9];
  f[40] = sun[0]; f[41] = sun[1]; f[42] = sun[2]; f[43] = 1;
  const sky = o.skyColor || [0.20, 0.26, 0.36];
  f[44] = sky[0]; f[45] = sky[1]; f[46] = sky[2]; f[47] = 1;
  const gnd = o.gndColor || [0.05, 0.045, 0.04];
  f[48] = gnd[0]; f[49] = gnd[1]; f[50] = gnd[2]; f[51] = 1;
  f[52] = R.sceneW; f[53] = R.sceneH; f[54] = 1 / R.sceneW; f[55] = 1 / R.sceneH;
  f[56] = o.time || 0; f[57] = R.sceneW / R.sceneH; f[58] = o.tanHalfFov || 0.5; f[59] = o.exposure == null ? 1 : o.exposure;
  f[60] = R.debugMode || 0; f[61] = 0; f[62] = 0; f[63] = 0;
  GPU.device.queue.writeBuffer(R.frameUB, 0, f);
  GPU.device.queue.writeBuffer(R.bgUB, 0, f);
}

function shadowPass() {
  const c = CUR;
  GPU.device.pushErrorScope('validation');
  c.pass = c.enc.beginRenderPass({
    colorAttachments: [],
    depthStencilAttachment: {
      view: R.shadowView,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  });
  c.pass.setPipeline(R.pipelines.shadow);
  c.pass.setBindGroup(0, R.frameBGShadow);
  c.phase = 'shadow';
}

function endShadow() { CUR.pass.end(); CUR.pass = null; CUR.phase = null; GPU.device.popErrorScope().then(e => { if (e) console.error('SHADOW PASS: ' + e.message); }); }

function pushShadow(mesh, model) {
  const c = CUR;
  const a = new Float32Array(64);
  a.set(model, 0);
  const off = R.arena.alloc(a);
  c.pass.setBindGroup(1, R.objBG, [off * 256]);
  mesh.draw(c.pass);
}

function beginScene() {
  const c = CUR;
  GPU.device.pushErrorScope('validation');
  c.pass = c.enc.beginRenderPass({
    colorAttachments: [{
      view: R.msaaColor.createView(),
      resolveTarget: R.resolveTex.createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear', storeOp: 'discard',
    }],
    depthStencilAttachment: {
      view: R.msaaDepth.createView(),
      depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'discard',
    },
  });
  c.pass.setPipeline(R.pipelines.bg);
  c.pass.setBindGroup(0, R.bgBG);
  c.pass.draw(3);
  c.pass.setBindGroup(0, R.frameBG);
  c.phase = 'scene';
}

function objUniform(model, color, params, params2) {
  const a = new Float32Array(64);
  a.set(model, 0);
  a[16] = color[0]; a[17] = color[1]; a[18] = color[2]; a[19] = color.length > 3 ? color[3] : 1;
  a[20] = params ? params[0] : 0.5;
  a[21] = params ? params[1] : 0.0;
  a[22] = params ? params[2] : 0;
  a[23] = params ? (params[3] || 0) : 0;
  a[24] = params2 ? params2[0] : 0;
  a[25] = params2 ? params2[1] : 0;
  a[26] = 0; a[27] = 0;
  return a;
}

function drawMesh(mesh, model, color, params, params2, pipeline) {
  const c = CUR;
  const off = R.arena.alloc(objUniform(model, color, params, params2));
  c.pass.setPipeline(pipeline || R.pipelines.scene);
  c.pass.setBindGroup(0, R.frameBG);
  c.pass.setBindGroup(1, R.objBG, [off * 256]);
  mesh.draw(c.pass);
}

function drawMeshDyn(dynVbuf, dynVcount, ibuf, icount, model, color, params, pipeline) {
  const c = CUR;
  const off = R.arena.alloc(objUniform(model, color, params));
  c.pass.setPipeline(pipeline || R.pipelines.scene);
  c.pass.setBindGroup(0, R.frameBG);
  c.pass.setBindGroup(1, R.objBG, [off * 256]);
  c.pass.setVertexBuffer(0, dynVbuf);
  c.pass.setIndexBuffer(ibuf, 'uint32');
  c.pass.drawIndexed(icount);
}

function endScene() { CUR.pass.end(); CUR.pass = null; CUR.phase = null; GPU.device.popErrorScope().then(e => { if (e) console.error('SCENE PASS: ' + e.message); }); }

async function composite() {
  const d = GPU.device;
  const c = CUR;
  if (!R.compBG || R.compBGSize !== [R.sceneW, R.sceneH]) {
    R.compBG = d.createBindGroup({
      layout: R.compBGL,
      entries: [
        { binding: 0, resource: { buffer: R.frameUB } },
        { binding: 1, resource: R.resolveTex.createView() },
        { binding: 2, resource: R.lerpSampler },
        { binding: 3, resource: R.waterDepthView },
        { binding: 4, resource: R.waterThickView },
      ],
    });
    R.compBGSize = [R.sceneW, R.sceneH];
  }
  const tex = GPU.ctx.getCurrentTexture();
  const view = tex.createView();
  const pass = c.enc.beginRenderPass({
    colorAttachments: [{ view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
  });
  pass.setPipeline(R.pipelines.composite);
  pass.setBindGroup(0, R.compBG);
  pass.draw(3);
  pass.end();
  R.lastTex = tex;
  let cap = null;
  if (R.captureReq) {
    const req = R.captureReq; R.captureReq = null;
    const w = R.sceneW, h = R.sceneH;
    const bpr = Math.ceil(w * 4 / 256) * 256;
    const buf = d.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    c.enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr, rowsPerImage: h }, [w, h, 1]);
    cap = { req, buf, bpr, w, h };
  }
  R.arena.end();
  d.queue.submit([c.enc.finish()]);
  CUR = null;
  if (cap) {
    const { req, buf, bpr, w, h } = cap;
    try {
      await buf.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(buf.getMappedRange());
      const out = new Uint8ClampedArray(w * h * 4);
      const bgra = GPU.format === 'bgra8unorm';
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const si = y * bpr + x * 4, di = (y * w + x) * 4;
          if (bgra) { out[di] = src[si + 2]; out[di + 1] = src[si + 1]; out[di + 2] = src[si]; out[di + 3] = src[si + 3]; }
          else { out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3]; }
        }
      }
      buf.unmap();
      req.resolve({ w, h, data: out });
    } catch (e) { req.resolve(null); }
    buf.destroy();
  }
}

// 请求读回下一帧像素
function requestCapture() {
  return new Promise((resolve) => { R.captureReq = { resolve }; });
}

// 读回当前帧像素（用于自检，返回 {w,h,data:Uint8Array RGBA}）
async function readPixels() {
  const d = GPU.device;
  const tex = R.lastTex;
  if (!tex) return null;
  const w = R.sceneW, h = R.sceneH;
  const bpr = Math.ceil(w * 4 / 256) * 256;
  const buf = d.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = d.createCommandEncoder();
  enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr, rowsPerImage: h }, [w, h, 1]);
  d.queue.submit([enc.finish()]);
  await buf.mapAsync(GPUMapMode.READ);
  const src = new Uint8Array(buf.getMappedRange());
  const out = new Uint8ClampedArray(w * h * 4);
  const bgra = GPU.format === 'bgra8unorm';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = y * bpr + x * 4, di = (y * w + x) * 4;
      if (bgra) { out[di] = src[si + 2]; out[di + 1] = src[si + 1]; out[di + 2] = src[si]; out[di + 3] = src[si + 3]; }
      else { out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3]; }
    }
  }
  buf.unmap();
  buf.destroy();
  return { w, h, data: out };
}

// 把像素转成字符画预览，方便无图形界面下核对构图
function asciiPreview(img, cols = 78, rows = 30) {
  if (!img) return 'no image';
  const { w, h, data } = img;
  const ramp = ' .:-=+*#%@';
  let s = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * w / cols), x1 = Math.max(x0 + 1, Math.floor((c + 1) * w / cols));
      const y0 = Math.floor(r * h / rows), y1 = Math.max(y0 + 1, Math.floor((r + 1) * h / rows));
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
        const i = (y * w + x) * 4;
        sum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114); n++;
      }
      const l = sum / n / 255;
      s += ramp[Math.min(ramp.length - 1, Math.max(0, Math.round(l * (ramp.length - 1) * 1.6)))];
    }
    s += '\n';
  }
  return s;
}

function setWaterViews(depthView, thickView) {
  R.waterDepthView = depthView;
  R.waterThickView = thickView;
  R.compBG = null;
}

function ensureWaterTargets(w, h) {
  if (R.waterTargets && R.waterTargets.w === w && R.waterTargets.h === h) return;
  const d = GPU.device;
  if (R.waterDepthTex) R.waterDepthTex.destroy();
  if (R.waterThickTex) R.waterThickTex.destroy();
  if (R.waterZ) R.waterZ.destroy();
  R.waterDepthTex = d.createTexture({ size: [w, h], format: 'r32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING, label: 'water-depth' });
  R.waterThickTex = d.createTexture({ size: [w, h], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING, label: 'water-thick' });
  R.waterZ = createDepthTex(w, h, 1, 'water-z');
  R.waterDepthView = R.waterDepthTex.createView();
  R.waterThickView = R.waterThickTex.createView();
  R.waterZView = R.waterZ.createView();
  R.waterTargets = { w, h };
  R.compBG = null;
}

function waterPasses() {
  ensureWaterTargets(R.sceneW, R.sceneH);
  const enc = CUR.enc;
  return {
    depth: () => enc.beginRenderPass({
      colorAttachments: [
        { view: R.waterDepthView, clearValue: { r: 1, g: 1, b: 1, a: 1 }, loadOp: 'clear', storeOp: 'store' },
      ],
      depthStencilAttachment: {
        view: R.waterZView,
        depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'discard',
      },
    }),
    thick: () => enc.beginRenderPass({
      colorAttachments: [
        { view: R.waterThickView, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
      ],
    }),
  };
}