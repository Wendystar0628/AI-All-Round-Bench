/* global JW */
var JW = JW || {};

JW.FRAME_WGSL = `
struct Frame {
  viewProj: mat4x4<f32>,
  view: mat4x4<f32>,
  proj: mat4x4<f32>,
  invView: mat4x4<f32>,
  invProj: mat4x4<f32>,
  eye: vec4<f32>,
  lightVP: mat4x4<f32>,
  lightDir: vec4<f32>,
  lightColor: vec4<f32>,
  params: vec4<f32>,
  ambient: vec4<f32>,
}
struct Model {
  m: mat4x4<f32>,
  color: vec4<f32>,
  misc: vec4<f32>,
}
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSamp: sampler_comparison;
@group(1) @binding(0) var<uniform> M: Model;

fn studio(dir: vec3<f32>) -> vec3<f32> {
  var c = mix(vec3<f32>(0.045, 0.04, 0.036), vec3<f32>(0.012, 0.016, 0.02), clamp(dir.y * 0.5 + 0.5, 0.0, 1.0));
  let l1 = normalize(vec3<f32>(-0.48, 0.78, 0.38));
  let d1 = clamp(dot(normalize(dir), l1), 0.0, 1.0);
  c = c + vec3<f32>(1.0, 0.78, 0.55) * pow(d1, 46.0) * 2.4;
  c = c + vec3<f32>(1.0, 0.72, 0.48) * pow(d1, 6.0) * 0.22;
  let l2 = normalize(vec3<f32>(0.72, 0.28, -0.55));
  let d2 = clamp(dot(normalize(dir), l2), 0.0, 1.0);
  c = c + vec3<f32>(0.45, 0.72, 0.85) * pow(d2, 28.0) * 1.5;
  if (dir.y < 0.0) { c = c + vec3<f32>(0.04, 0.03, 0.025) * (-dir.y); }
  return c;
}

fn shadowVis(world: vec3<f32>, N: vec3<f32>) -> f32 {
  let lp = F.lightVP * vec4<f32>(world + N * 0.012, 1.0);
  let p = lp.xyz / lp.w;
  let uv = vec2<f32>(p.x * 0.5 + 0.5, -p.y * 0.5 + 0.5);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { return 1.0; }
  var vis = 0.0;
  let texel = 1.0 / 2048.0;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let bias = 0.0018 + (1.0 - clamp(dot(N, F.lightDir.xyz), 0.0, 1.0)) * 0.004;
      vis = vis + textureSampleCompare(shadowMap, shadowSamp, uv + vec2<f32>(f32(x), f32(y)) * texel, p.z - bias);
    }
  }
  return vis / 9.0;
}
`;

JW.SHADOW_WGSL = `
struct Model { m: mat4x4<f32>, color: vec4<f32>, misc: vec4<f32> }
@group(0) @binding(0) var<uniform> lightVP: mat4x4<f32>;
@group(1) @binding(0) var<uniform> M: Model;
struct Vin { @location(0) p: vec3<f32> }
@vertex fn vs(in: Vin) -> @builtin(position) vec4<f32> {
  return lightVP * M.m * vec4<f32>(in.p, 1.0);
}
`;

JW.LIT_WGSL = JW.FRAME_WGSL + `
struct Vin { @location(0) p: vec3<f32>, @location(1) n: vec3<f32> }
struct Vout {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) n: vec3<f32>,
  @location(2) eyeD: f32,
}
@vertex fn vs(in: Vin) -> Vout {
  var o: Vout;
  let w = M.m * vec4<f32>(in.p, 1.0);
  o.world = w.xyz;
  o.clip = F.viewProj * w;
  o.n = mat3x3<f32>(M.m[0].xyz, M.m[1].xyz, M.m[2].xyz) * in.n;
  let vw = F.view * w;
  o.eyeD = -vw.z;
  return o;
}
struct FOut { @location(0) color: vec4<f32>, @location(1) eye: vec4<f32> }
@fragment fn fs(in: Vout) -> FOut {
  let N = normalize(in.n);
  let V = normalize(F.eye.xyz - in.world);
  let L = normalize(F.lightDir.xyz);
  let ndl = clamp(dot(N, L), 0.0, 1.0);
  let sh = shadowVis(in.world, N);
  let H = normalize(L + V);
  let rough = clamp(M.misc.x, 0.02, 1.0);
  let metal = clamp(M.misc.y, 0.0, 1.0);
  let spec = pow(clamp(dot(N, H), 0.0, 1.0), mix(160.0, 8.0, rough)) * (1.15 - rough);
  let env = studio(reflect(-V, N));
  let fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
  var base = M.color.rgb;
  // Soft table variation so the stage reads as a surface.
  let rings = sin(length(in.world.xz) * 9.0) * 0.015;
  base = base * (1.0 + rings);
  var col = base * (F.ambient.rgb + F.lightColor.rgb * ndl * sh);
  col = mix(col, env * (0.25 + 0.75 * sh), metal);
  col = col + env * fres * 0.22 * (1.0 - metal * 0.5);
  col = col + F.lightColor.rgb * spec * sh * mix(0.25, 1.0, metal + 0.2);
  col = col + M.color.rgb * M.misc.z;
  var out: FOut;
  out.color = vec4<f32>(col, 1.0);
  out.eye = vec4<f32>(in.eyeD, 0.0, 0.0, 1.0);
  return out;
}
`;

JW.SKY_WGSL = `
struct Frame {
  viewProj: mat4x4<f32>, view: mat4x4<f32>, proj: mat4x4<f32>,
  invView: mat4x4<f32>, invProj: mat4x4<f32>, eye: vec4<f32>,
  lightVP: mat4x4<f32>, lightDir: vec4<f32>, lightColor: vec4<f32>,
  params: vec4<f32>, ambient: vec4<f32>,
}
@group(0) @binding(0) var<uniform> F: Frame;
struct V { @builtin(position) clip: vec4<f32>, @location(0) dir: vec3<f32> }
@vertex fn vs(@builtin(vertex_index) vi: u32) -> V {
  var p = vec2<f32>(f32((vi << 1u) & 2u), f32(vi & 2u));
  var o: V;
  o.clip = vec4<f32>(p * 2.0 - 1.0, 1.0, 1.0);
  let ndc = vec4<f32>(o.clip.xy, 1.0, 1.0);
  var w = F.invView * F.invProj * ndc;
  o.dir = normalize(w.xyz / w.w - F.eye.xyz);
  return o;
}
struct FOut { @location(0) color: vec4<f32>, @location(1) eye: vec4<f32> }
@fragment fn fs(in: V) -> FOut {
  let d = normalize(in.dir);
  var col = mix(vec3<f32>(0.11, 0.09, 0.08), vec3<f32>(0.015, 0.018, 0.024), clamp(d.y * 1.4 + 0.15, 0.0, 1.0));
  let warm = pow(clamp(dot(d, normalize(vec3<f32>(-0.5, 0.15, 0.4))), 0.0, 1.0), 2.0);
  col = col + vec3<f32>(0.28, 0.16, 0.08) * warm;
  let cool = pow(clamp(dot(d, normalize(vec3<f32>(0.6, 0.05, -0.5))), 0.0, 1.0), 2.0);
  col = col + vec3<f32>(0.05, 0.12, 0.14) * cool;
  // Softbox panels in the distance.
  let box = pow(clamp(dot(d, normalize(vec3<f32>(-0.55, 0.62, 0.45))), 0.0, 1.0), 80.0);
  col = col + vec3<f32>(1.0, 0.86, 0.7) * box * 1.6;
  var out: FOut;
  out.color = vec4<f32>(col, 1.0);
  out.eye = vec4<f32>(40.0, 0.0, 0.0, 1.0);
  return out;
}
`;

JW.BALL_WGSL = JW.FRAME_WGSL + `
@group(1) @binding(0) var<storage, read> balls: array<vec4<f32>>;
@group(1) @binding(1) var<storage, read> infos: array<vec4<f32>>;
struct Vin { @location(0) p: vec3<f32> }
struct Vout {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) n: vec3<f32>,
  @location(2) os: vec3<f32>,
  @location(3) color: vec3<f32>,
  @location(4) eyeD: f32,
  @location(5) @interpolate(flat) matId: u32,
}
fn quatRot(q: vec4<f32>, v: vec3<f32>) -> vec3<f32> {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}
@vertex fn vs(in: Vin, @builtin(instance_index) ii: u32) -> Vout {
  var o: Vout;
  let b = balls[ii * 4u];
  let vel = balls[ii * 4u + 1u];
  let q = balls[ii * 4u + 2u];
  let info = infos[ii * 2u];
  let col = infos[ii * 2u + 1u];
  let r = info.x;
  let n = quatRot(q, normalize(in.p));
  let world = b.xyz + n * r;
  o.world = world;
  o.n = n;
  o.os = normalize(in.p);
  o.color = col.xyz;
  o.matId = u32(col.w + 0.5);
  o.clip = F.viewProj * vec4<f32>(world, 1.0);
  o.eyeD = -(F.view * vec4<f32>(world, 1.0)).z;
  return o;
}
struct FOut { @location(0) color: vec4<f32>, @location(1) eye: vec4<f32> }
@fragment fn fs(in: Vout) -> FOut {
  let N = normalize(in.n);
  let V = normalize(F.eye.xyz - in.world);
  let L = normalize(F.lightDir.xyz);
  let ndl = clamp(dot(N, L), 0.0, 1.0);
  let sh = shadowVis(in.world, N);
  let H = normalize(L + V);
  let env = studio(reflect(-V, N));
  let fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.5);
  var rough = 0.18;
  var metal = 0.92;
  var albedo = in.color;
  // Group 10 is scene-1 metal, group 11 is stone. Tank groups stay 0..4.
  if (in.matId >= 11u) { metal = 0.08; rough = 0.72; albedo = in.color; }
  else if (in.matId >= 10u) { metal = 1.0; rough = 0.16; albedo = vec3<f32>(0.74, 0.76, 0.8); }
  else { metal = 0.55; rough = 0.28; albedo = in.color; }
  let stripe = smoothstep(0.08, 0.0, abs(in.os.y - 0.22)) + smoothstep(0.05, 0.0, abs(fract(atan2(in.os.z, in.os.x) * 0.5 + 0.5) - 0.5) - 0.42);
  albedo = mix(albedo, albedo * 0.62 + vec3<f32>(0.12), clamp(stripe, 0.0, 1.0) * select(0.18, 0.5, metal > 0.8));
  let spec = pow(clamp(dot(N, H), 0.0, 1.0), mix(140.0, 10.0, rough));
  var col = albedo * (F.ambient.rgb + F.lightColor.rgb * ndl * sh);
  col = mix(col, env * (0.2 + 0.8 * sh), metal);
  col = col + env * fres * 0.35;
  col = col + vec3<f32>(1.0, 0.95, 0.9) * spec * sh * (1.1 - rough);
  var out: FOut;
  out.color = vec4<f32>(col, 1.0);
  out.eye = vec4<f32>(in.eyeD, 0.0, 0.0, 1.0);
  return out;
}
`;

JW.JELLY_WGSL = JW.FRAME_WGSL + `
struct Vin {
  @location(0) p: vec3<f32>,
  @location(1) n: vec3<f32>,
  @location(2) col: vec4<f32>,
}
struct Vout {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) n: vec3<f32>,
  @location(2) col: vec3<f32>,
  @location(3) crack: f32,
  @location(4) eyeD: f32,
}
@vertex fn vs(in: Vin) -> Vout {
  var o: Vout;
  o.world = in.p;
  o.clip = F.viewProj * vec4<f32>(in.p, 1.0);
  o.n = in.n;
  o.col = in.col.rgb;
  o.crack = in.col.a;
  o.eyeD = -(F.view * vec4<f32>(in.p, 1.0)).z;
  return o;
}
@group(0) @binding(3) var backEye: texture_2d<f32>;
@group(0) @binding(4) var linSamp: sampler;
struct FOut { @location(0) color: vec4<f32>, @location(1) eye: vec4<f32> }
@fragment fn fsBack(in: Vout) -> @location(0) vec4<f32> {
  return vec4<f32>(in.eyeD, 0.0, 0.0, 1.0);
}
@fragment fn fsFront(in: Vout) -> FOut {
  let N = normalize(in.n);
  let V = normalize(F.eye.xyz - in.world);
  let L = normalize(F.lightDir.xyz);
  let ndl = clamp(dot(N, L), 0.0, 1.0);
  let sh = shadowVis(in.world, N);
  let ndv = clamp(dot(N, V), 0.0, 1.0);
  let fres = pow(1.0 - ndv, 2.6);
  let uv = vec2<f32>(in.clip.x / F.params.x, in.clip.y / F.params.y);
  let back = textureSample(backEye, linSamp, uv).r;
  var thick = clamp(back - in.eyeD, 0.02, 0.55);
  if (back < 0.001 || back > 30.0) { thick = 0.12 + (1.0 - ndv) * 0.2; }
  let absorb = exp(-thick * vec3<f32>(1.4, 2.2, 2.4));
  var jelly = in.col * absorb;
  jelly = jelly * (0.45 + ndl * sh * 0.9) + in.col * 0.18;
  let env = studio(reflect(-V, N));
  let spec = pow(clamp(dot(N, normalize(L + V)), 0.0, 1.0), 90.0);
  var col = mix(jelly, env, fres * 0.55);
  col = col + vec3<f32>(1.0, 0.95, 0.9) * spec * sh * 0.45;
  col = col + vec3<f32>(1.0, 0.92, 0.85) * fres * 0.15;
  col = mix(col, col * vec3<f32>(0.35, 0.16, 0.12), in.crack * 0.75);
  let alpha = clamp(0.22 + thick * 1.15 + fres * 0.35, 0.28, 0.9);
  var o: FOut;
  o.color = vec4<f32>(col, alpha);
  o.eye = vec4<f32>(in.eyeD, 0.0, 0.0, 1.0);
  return o;
}
`;

JW.FLUID_DRAW_WGSL = `
struct Frame {
  viewProj: mat4x4<f32>, view: mat4x4<f32>, proj: mat4x4<f32>,
  invView: mat4x4<f32>, invProj: mat4x4<f32>, eye: vec4<f32>,
  lightVP: mat4x4<f32>, lightDir: vec4<f32>, lightColor: vec4<f32>,
  params: vec4<f32>, ambient: vec4<f32>,
}
@group(0) @binding(0) var<uniform> F: Frame;
@group(1) @binding(0) var<storage, read> parts: array<vec4<f32>>;
@group(1) @binding(1) var<uniform> extra: vec4<f32>;
struct Vout {
  @builtin(position) clip: vec4<f32>,
  @location(0) quad: vec2<f32>,
  @location(1) centerView: vec3<f32>,
  @location(2) radius: f32,
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Vout {
  var ids = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0)
  );
  let q = ids[vi];
  let p = parts[ii];
  let radius = extra.x;
  let right = F.invView[0].xyz;
  let up = F.invView[1].xyz;
  let world = p.xyz + (right * q.x + up * q.y) * radius;
  var o: Vout;
  o.clip = F.viewProj * vec4<f32>(world, 1.0);
  o.quad = q;
  o.centerView = (F.view * vec4<f32>(p.xyz, 1.0)).xyz;
  o.radius = radius;
  return o;
}
struct FOut { @builtin(frag_depth) depth: f32, @location(0) eye: vec4<f32> }
@fragment fn fsDepth(in: Vout) -> FOut {
  let r2 = dot(in.quad, in.quad);
  if (r2 > 1.0) { discard; }
  let zoff = sqrt(1.0 - r2) * in.radius;
  let viewPos = vec3<f32>(in.centerView.xy + in.quad * in.radius, in.centerView.z + zoff);
  let clip = F.proj * vec4<f32>(viewPos, 1.0);
  var o: FOut;
  o.depth = clip.z / clip.w;
  o.eye = vec4<f32>(-viewPos.z, 0.0, 0.0, 1.0);
  return o;
}
@fragment fn fsThick(in: Vout) -> @location(0) vec4<f32> {
  let r2 = dot(in.quad, in.quad);
  if (r2 > 1.0) { discard; }
  let k = 1.0 - r2;
  return vec4<f32>(k * in.radius * 1.6, 0.0, 0.0, 0.0);
}
`;

JW.FULL_WGSL = JW.FRAME_WGSL + `
@group(0) @binding(3) var sceneColor: texture_2d<f32>;
@group(0) @binding(4) var sceneEye: texture_2d<f32>;
@group(0) @binding(5) var fluidEye: texture_2d<f32>;
@group(0) @binding(6) var linSamp: sampler;
struct V { @builtin(position) clip: vec4<f32>, @location(0) uv: vec2<f32> }
@vertex fn vs(@builtin(vertex_index) vi: u32) -> V {
  var p = vec2<f32>(f32((vi << 1u) & 2u), f32(vi & 2u));
  var o: V;
  o.clip = vec4<f32>(p * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2<f32>(p.x, 1.0 - p.y);
  return o;
}
fn anchor(uv: vec2<f32>) -> f32 {
  let s = textureSampleCompare(shadowMap, shadowSamp, clamp(uv, vec2<f32>(0.001), vec2<f32>(0.999)), 0.5);
  let a = textureSample(sceneColor, linSamp, uv).r;
  let b = textureSample(sceneEye, linSamp, uv).r;
  let c = textureSample(fluidEye, linSamp, uv).r;
  return (s + a + b + c) * 1e-6;
}
fn viewFromEye(uv: vec2<f32>, eye: f32) -> vec3<f32> {
  let ndc = vec2<f32>(uv.x * 2.0 - 1.0, (1.0 - uv.y) * 2.0 - 1.0);
  var p = F.invProj * vec4<f32>(ndc, 1.0, 1.0);
  p = p / p.w;
  let dir = normalize(p.xyz);
  return dir * (eye / max(abs(dir.z), 1e-4));
}
@fragment fn fsBlur(in: V) -> @location(0) vec4<f32> {
  let dir = vec2<f32>(F.ambient.x, F.ambient.y);
  let d0 = textureSample(fluidEye, linSamp, in.uv).r;
  if (d0 > 30.0) { return vec4<f32>(d0, 0.0, 0.0, 1.0); }
  var sum = 0.0;
  var wsum = 0.0;
  for (var i = -5; i <= 5; i = i + 1) {
    let d = textureSample(fluidEye, linSamp, in.uv + dir * f32(i)).r;
    if (d > 30.0) { continue; }
    let w = exp(-f32(i * i) * 0.12) * exp(-abs(d - d0) * 18.0);
    sum = sum + d * w;
    wsum = wsum + w;
  }
  let outD = select(d0, sum / max(wsum, 1e-4), wsum > 0.0);
  return vec4<f32>(outD + anchor(in.uv), 0.0, 0.0, 1.0);
}
@fragment fn fsWater(in: V) -> @location(0) vec4<f32> {
  let scene = textureSample(sceneColor, linSamp, in.uv).rgb;
  let fd = textureSample(fluidEye, linSamp, in.uv).r;
  let sd = textureSample(sceneEye, linSamp, in.uv).r;
  if (fd > 25.0 || fd > sd + 0.015) { return vec4<f32>(scene + vec3<f32>(anchor(in.uv)), 1.0); }
  let texel = vec2<f32>(1.0 / F.params.x, 1.0 / F.params.y);
  let p = viewFromEye(in.uv, fd);
  let pr = viewFromEye(in.uv + vec2<f32>(texel.x, 0.0), textureSample(fluidEye, linSamp, in.uv + vec2<f32>(texel.x, 0.0)).r);
  let pu = viewFromEye(in.uv + vec2<f32>(0.0, texel.y), textureSample(fluidEye, linSamp, in.uv + vec2<f32>(0.0, texel.y)).r);
  var N = normalize(cross(pr - p, pu - p));
  if (dot(N, -p) < 0.0) { N = -N; }
  let Vv = normalize(-p);
  let ndv = clamp(dot(N, Vv), 0.0, 1.0);
  let fres = pow(1.0 - ndv, 4.0);
  let thick = clamp(sd - fd, 0.0, 1.5);
  let absorb = exp(-thick * vec3<f32>(1.35, 0.32, 0.22));
  let offset = N.xy * (0.03 + thick * 0.05);
  let bgUV = clamp(in.uv + offset, vec2<f32>(0.002), vec2<f32>(0.998));
  var bg = textureSample(sceneColor, linSamp, bgUV).rgb * absorb;
  bg = bg * (0.82 + pow(clamp(N.y, 0.0, 1.0), 6.0) * 0.45);
  let reflW = normalize((F.invView * vec4<f32>(reflect(-Vv, N), 0.0)).xyz);
  let env = studio(reflW);
  var col = mix(bg, env, clamp(fres * 0.78, 0.0, 0.85));
  let Lw = normalize((F.view * vec4<f32>(F.lightDir.xyz, 0.0)).xyz);
  let spec = pow(clamp(dot(N, normalize(Lw + Vv)), 0.0, 1.0), 220.0);
  col = col + vec3<f32>(1.0, 0.97, 0.92) * spec * 0.9;
  // Thin silhouettes pick up a pale edge so sheets read against the dark stage.
  col = mix(col, vec3<f32>(0.85, 0.95, 0.98), clamp(1.4 - thick * 6.0, 0.0, 0.35) * fres);
  return vec4<f32>(col, 1.0);
}
@fragment fn fsBlit(in: V) -> @location(0) vec4<f32> {
  let c = textureSample(sceneColor, linSamp, in.uv).rgb;
  // Filmic-ish curve shared by both scenes.
  let x = max(c, vec3<f32>(0.0));
  let m = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  return vec4<f32>(clamp(m, vec3<f32>(0.0), vec3<f32>(1.0)) + vec3<f32>(anchor(in.uv)), 1.0);
}
`;

JW.FOAM_WGSL = `
struct Frame {
  viewProj: mat4x4<f32>, view: mat4x4<f32>, proj: mat4x4<f32>,
  invView: mat4x4<f32>, invProj: mat4x4<f32>, eye: vec4<f32>,
  lightVP: mat4x4<f32>, lightDir: vec4<f32>, lightColor: vec4<f32>,
  params: vec4<f32>, ambient: vec4<f32>,
}
@group(0) @binding(0) var<uniform> F: Frame;
@group(1) @binding(0) var<storage, read> foamP: array<vec4<f32>>;
@group(1) @binding(1) var<storage, read> foamV: array<vec4<f32>>;
struct Vout { @builtin(position) clip: vec4<f32>, @location(0) uv: vec2<f32>, @location(1) life: f32, @location(2) ty: f32 }
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Vout {
  var ids = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0)
  );
  let q = ids[vi];
  let p = foamP[ii];
  let ty = foamV[ii].w;
  var rad = mix(0.012, 0.004, clamp(1.0 - p.w, 0.0, 1.0));
  if (ty > 1.5) { rad = 0.007; }
  let right = F.invView[0].xyz;
  let up = F.invView[1].xyz;
  let world = p.xyz + (right * q.x + up * q.y) * rad * 3.2;
  var o: Vout;
  o.clip = F.viewProj * vec4<f32>(world, 1.0);
  o.uv = q;
  o.life = p.w;
  o.ty = ty;
  return o;
}
@fragment fn fs(in: Vout) -> @location(0) vec4<f32> {
  if (in.life <= 0.02) { discard; }
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) { discard; }
  let a = (1.0 - r2) * clamp(in.life, 0.0, 1.0);
  if (in.ty > 1.5) {
    return vec4<f32>(0.75, 0.9, 1.0, a * 0.45);
  }
  return vec4<f32>(0.92, 0.96, 0.98, a * 0.72);
}
`;

JW.SPRAY_WGSL = `
struct Frame {
  viewProj: mat4x4<f32>, view: mat4x4<f32>, proj: mat4x4<f32>,
  invView: mat4x4<f32>, invProj: mat4x4<f32>, eye: vec4<f32>,
  lightVP: mat4x4<f32>, lightDir: vec4<f32>, lightColor: vec4<f32>,
  params: vec4<f32>, ambient: vec4<f32>,
}
@group(0) @binding(0) var<uniform> F: Frame;
@group(1) @binding(0) var<storage, read> parts: array<vec4<f32>>;
@group(1) @binding(1) var<storage, read> vels: array<vec4<f32>>;
struct Vout { @builtin(position) clip: vec4<f32>, @location(0) uv: vec2<f32>, @location(1) phase: f32 }
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Vout {
  var ids = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0)
  );
  let q = ids[vi];
  let p = parts[ii];
  let right = F.invView[0].xyz;
  let up = F.invView[1].xyz;
  let world = p.xyz + (right * q.x + up * q.y) * 0.014;
  var o: Vout;
  o.clip = F.viewProj * vec4<f32>(world, 1.0);
  o.uv = q;
  o.phase = p.w;
  return o;
}
@fragment fn fs(in: Vout) -> @location(0) vec4<f32> {
  if (in.phase < 0.5) { discard; }
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) { discard; }
  let a = (1.0 - r2) * 0.55;
  return vec4<f32>(0.82, 0.92, 0.98, a);
}
`;

JW.GLASS_WGSL = JW.FRAME_WGSL + `
@group(0) @binding(3) var sceneColor: texture_2d<f32>;
@group(0) @binding(6) var linSamp: sampler;
struct Vin { @location(0) p: vec3<f32>, @location(1) n: vec3<f32> }
struct Vout {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) n: vec3<f32>,
  @location(2) uv: vec2<f32>,
}
@vertex fn vs(in: Vin) -> Vout {
  var o: Vout;
  let w = M.m * vec4<f32>(in.p, 1.0);
  o.world = w.xyz;
  o.clip = F.viewProj * w;
  o.n = normalize(mat3x3<f32>(M.m[0].xyz, M.m[1].xyz, M.m[2].xyz) * in.n);
  o.uv = vec2<f32>(o.clip.x, o.clip.y);
  return o;
}
@fragment fn fs(in: Vout) -> @location(0) vec4<f32> {
  let N = normalize(in.n);
  let V = normalize(F.eye.xyz - in.world);
  let ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  let fres = pow(1.0 - ndv, 2.4);
  let uv = vec2<f32>(in.clip.x / F.params.x, in.clip.y / F.params.y);
  let bg = textureSample(sceneColor, linSamp, clamp(uv + N.xy * 0.012, vec2<f32>(0.001), vec2<f32>(0.999))).rgb;
  let env = studio(reflect(-V, N));
  var col = mix(bg, env, fres * 0.55);
  col = col + vec3<f32>(0.85, 0.95, 1.0) * pow(fres, 1.15) * 0.7;
  let sh = textureSampleCompare(shadowMap, shadowSamp, clamp(uv, vec2<f32>(0.001), vec2<f32>(0.999)), 0.5);
  col = col * (1.0 + sh * 1e-4);
  let alpha = clamp(0.03 + fres * 0.62, 0.0, 0.75);
  return vec4<f32>(col, alpha);
}
`;

function align256(n) { return Math.ceil(n / 256) * 256; }

JW.createRenderer = async function (canvas) {
  if (!navigator.gpu) throw new Error("此浏览器没有 WebGPU");
  var adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("没有可用的 GPU 适配器");
  var device = await adapter.requestDevice();
  var context = canvas.getContext("webgpu");
  var format = navigator.gpu.getPreferredCanvasFormat();
  var R = {
    device: device, context: context, format: format, canvas: canvas,
    width: 2, height: 2, meshes: {}, jelly: new Map(), shaderErr: ""
  };

  function watch(mod, name) {
    mod.getCompilationInfo().then(function (info) {
      info.messages.forEach(function (m) {
        if (m.type === "error") {
          R.shaderErr += name + " L" + m.lineNum + ": " + m.message + "\n";
          console.error(name, m.lineNum, m.message);
        }
      });
    });
  }

  var frameBuf = device.createBuffer({ size: 512, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  var frameData = new Float32Array(128);
  var modelBuf = device.createBuffer({ size: 32 * 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  var modelCPU = new ArrayBuffer(32 * 256);
  var modelViews = [];
  for (var mi = 0; mi < 32; mi++) modelViews.push(new Float32Array(modelCPU, mi * 256, 24));
  var extraBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  var lightOnly = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  var shadowTex = device.createTexture({
    size: [2048, 2048], format: "depth32float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
  });
  var shadowSamp = device.createSampler({ compare: "less", magFilter: "linear", minFilter: "linear" });
  var linSamp = device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });

  var frameLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth", viewDimension: "2d" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "comparison" } }
    ]
  });
  var frameLayoutExt = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "comparison" } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } }
    ]
  });
  // Simpler: several small layouts created with the pipelines via auto layout where possible.
  // Manual layouts below per pipeline to stay explicit.

  function pipe(label, code, buffers, targets, depth, blend, topology) {
    var mod = device.createShaderModule({ code: code, label: label });
    watch(mod, label);
    return device.createRenderPipeline({
      label: label,
      layout: "auto",
      vertex: { module: mod, entryPoint: "vs", buffers: buffers || [] },
      fragment: { module: mod, entryPoint: "fs", targets: targets },
      primitive: { topology: topology || "triangle-list", cullMode: "none" },
      depthStencil: depth || undefined
    });
  }

  var depthState = {
    format: "depth32float",
    depthWriteEnabled: true,
    depthCompare: "less"
  };
  var colorTarget = { format: format };
  var eyeTarget = { format: "rgba16float" };
  var vLit = [
    { arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }, { shaderLocation: 1, offset: 12, format: "float32x3" }] }
  ];
  var vPos = [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] }];
  var vJelly = [{
    arrayStride: 40,
    attributes: [
      { shaderLocation: 0, offset: 0, format: "float32x3" },
      { shaderLocation: 1, offset: 12, format: "float32x3" },
      { shaderLocation: 2, offset: 24, format: "float32x4" }
    ]
  }];

  // Pipelines are created after textures exist because auto layout doesn't need views,
  // but bind groups do. Create pipelines now.
  R.pipes = {};
  R.pipes.shadow = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: device.createShaderModule({ code: JW.SHADOW_WGSL }),
      entryPoint: "vs",
      buffers: vPos
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" }
  });
  watch(R.pipes.shadow.getBindGroupLayout ? { getCompilationInfo: function () { return Promise.resolve({ messages: [] }); } } : null, "shadow");

  var litMod = device.createShaderModule({ code: JW.LIT_WGSL, label: "lit" });
  var skyMod = device.createShaderModule({ code: JW.SKY_WGSL, label: "sky" });
  var ballMod = device.createShaderModule({ code: JW.BALL_WGSL, label: "ball" });
  var jellyMod = device.createShaderModule({ code: JW.JELLY_WGSL, label: "jelly" });
  var fluidMod = device.createShaderModule({ code: JW.FLUID_DRAW_WGSL, label: "fluiddraw" });
  var fullMod = device.createShaderModule({ code: JW.FULL_WGSL, label: "full" });
  var foamMod = device.createShaderModule({ code: JW.FOAM_WGSL, label: "foam" });
  var sprayMod = device.createShaderModule({ code: JW.SPRAY_WGSL, label: "spray" });
  var glassMod = device.createShaderModule({ code: JW.GLASS_WGSL, label: "glass" });
  [litMod, skyMod, ballMod, jellyMod, fluidMod, fullMod, foamMod, sprayMod, glassMod].forEach(function (m) { watch(m, m.label || "sh"); });

  function rp(label, mod, vsBuf, fsEntry, targets, depth, cull) {
    return device.createRenderPipeline({
      label: label,
      layout: "auto",
      vertex: { module: mod, entryPoint: "vs", buffers: vsBuf || [] },
      fragment: { module: mod, entryPoint: fsEntry || "fs", targets: targets },
      primitive: { topology: "triangle-list", cullMode: cull || "none" },
      depthStencil: depth
    });
  }

  var blendAlpha = {
    format: format,
    blend: {
      color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }
    }
  };
  var blendAdd = {
    format: "rgba16float",
    blend: {
      color: { srcFactor: "one", dstFactor: "one", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one", operation: "add" }
    }
  };

  R.pipes.lit = rp("lit", litMod, vLit, "fs", [colorTarget, eyeTarget], depthState, "back");
  R.pipes.sky = rp("sky", skyMod, [], "fs", [colorTarget, eyeTarget], { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" });
  R.pipes.ball = rp("ball", ballMod, vPos, "fs", [colorTarget, eyeTarget], depthState, "back");
  R.pipes.jellyBack = rp("jellyB", jellyMod, vJelly, "fsBack", [eyeTarget], { format: "depth32float", depthWriteEnabled: true, depthCompare: "greater" }, "front");
  R.pipes.jellyFront = rp("jellyF", jellyMod, vJelly, "fsFront", [blendAlpha, eyeTarget], { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" }, "back");
  R.pipes.fluidDepth = rp("fdepth", fluidMod, [], "fsDepth", [eyeTarget], { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" });
  R.pipes.blur = rp("blur", fullMod, [], "fsBlur", [eyeTarget], undefined);
  R.pipes.water = rp("water", fullMod, [], "fsWater", [{ format: format }], undefined);
  R.pipes.blit = rp("blit", fullMod, [], "fsBlit", [{ format: format }], undefined);
  R.pipes.foam = rp("foam", foamMod, [], "fs", [blendAlpha], { format: "depth32float", depthWriteEnabled: false, depthCompare: "less" });
  R.pipes.spray = rp("spray", sprayMod, [], "fs", [blendAlpha], { format: "depth32float", depthWriteEnabled: false, depthCompare: "less" });
  R.pipes.glass = rp("glass", glassMod, vLit, "fs", [blendAlpha], { format: "depth32float", depthWriteEnabled: false, depthCompare: "less" });
  R.pipes.shadow = device.createRenderPipeline({
    label: "shadow",
    layout: "auto",
    vertex: { module: device.createShaderModule({ code: JW.SHADOW_WGSL }), entryPoint: "vs", buffers: vPos },
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" }
  });
  // Jelly and balls cast shadows through a position-only stream. Separate small pipelines:
  var shJ = device.createShaderModule({ code: `
    @group(0) @binding(0) var<uniform> lightVP: mat4x4<f32>;
    struct Vin { @location(0) p: vec3<f32>, @location(1) n: vec3<f32>, @location(2) c: vec4<f32> }
    @vertex fn vs(in: Vin) -> @builtin(position) vec4<f32> { return lightVP * vec4<f32>(in.p, 1.0); }
  ` });
  R.pipes.shadowJelly = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shJ, entryPoint: "vs", buffers: vJelly },
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" }
  });
  var shB = device.createShaderModule({ code: `
    struct Frame {
      viewProj: mat4x4<f32>, view: mat4x4<f32>, proj: mat4x4<f32>,
      invView: mat4x4<f32>, invProj: mat4x4<f32>, eye: vec4<f32>,
      lightVP: mat4x4<f32>, lightDir: vec4<f32>, lightColor: vec4<f32>,
      params: vec4<f32>, ambient: vec4<f32>
    }
    @group(0) @binding(0) var<uniform> F: Frame;
    @group(1) @binding(0) var<storage, read> balls: array<vec4<f32>>;
    @group(1) @binding(1) var<storage, read> infos: array<vec4<f32>>;
    struct Vin { @location(0) p: vec3<f32> }
    fn quatRot(q: vec4<f32>, v: vec3<f32>) -> vec3<f32> {
      let t = 2.0 * cross(q.xyz, v);
      return v + q.w * t + cross(q.xyz, t);
    }
    @vertex fn vs(in: Vin, @builtin(instance_index) ii: u32) -> @builtin(position) vec4<f32> {
      let b = balls[ii * 4u];
      let q = balls[ii * 4u + 2u];
      let r = infos[ii * 2u].x;
      let n = quatRot(q, normalize(in.p));
      return F.lightVP * vec4<f32>(b.xyz + n * r, 1.0);
    }
  ` });
  R.pipes.shadowBall = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shB, entryPoint: "vs", buffers: vPos },
    primitive: { topology: "triangle-list", cullMode: "back" },
    depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" }
  });

  R.sphere = null;
  R.frameBuf = frameBuf;
  R.frameData = frameData;
  R.modelViews = modelViews;
  R.modelBuf = modelBuf;
  R.modelCPU = modelCPU;
  R.extraBuf = extraBuf;
  R.lightOnly = lightOnly;
  R.shadowTex = shadowTex;
  R.shadowSamp = shadowSamp;
  R.linSamp = linSamp;
  R.litMod = litMod;
  R.fullMod = fullMod;
  R.jellyMod = jellyMod;
  R.ballMod = ballMod;
  R.glassMod = glassMod;
  R.foamMod = foamMod;
  R.sprayMod = sprayMod;
  R.fluidMod = fluidMod;
  R.skyMod = skyMod;

  function makeBG(pipeline, entries) {
    return device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: entries });
  }

  R.resize = function () {
    var w = Math.max(2, canvas.clientWidth || window.innerWidth);
    var h = Math.max(2, canvas.clientHeight || window.innerHeight);
    if (w === R.width && h === R.height && R.sceneColor) return;
    R.width = w; R.height = h;
    canvas.width = w; canvas.height = h;
    context.configure({ device: device, format: format, alphaMode: "opaque" });
    if (R.sceneColor) R.sceneColor.destroy();
    if (R.sceneEye) R.sceneEye.destroy();
    if (R.sceneDepth) R.sceneDepth.destroy();
    if (R.fluidEye) R.fluidEye.destroy();
    if (R.fluidDepth) R.fluidDepth.destroy();
    if (R.fluidBlur) R.fluidBlur.destroy();
    if (R.jellyEye) R.jellyEye.destroy();
    if (R.jellyDepth) R.jellyDepth.destroy();
    if (R.composed) R.composed.destroy();
    var usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    R.sceneColor = device.createTexture({ size: [w, h], format: format, usage: usage });
    R.sceneEye = device.createTexture({ size: [w, h], format: "rgba16float", usage: usage });
    R.sceneDepth = device.createTexture({ size: [w, h], format: "depth32float", usage: GPUTextureUsage.RENDER_ATTACHMENT });
    R.fluidEye = device.createTexture({ size: [w, h], format: "rgba16float", usage: usage });
    R.fluidDepth = device.createTexture({ size: [w, h], format: "depth32float", usage: GPUTextureUsage.RENDER_ATTACHMENT });
    R.fluidBlur = device.createTexture({ size: [w, h], format: "rgba16float", usage: usage });
    R.jellyEye = device.createTexture({ size: [w, h], format: "rgba16float", usage: usage });
    R.jellyDepth = device.createTexture({ size: [w, h], format: "depth32float", usage: GPUTextureUsage.RENDER_ATTACHMENT });
    R.composed = device.createTexture({ size: [w, h], format: format, usage: usage });
    var scv = R.sceneColor.createView();
    var sev = R.sceneEye.createView();
    var fev = R.fluidEye.createView();
    var fbv = R.fluidBlur.createView();
    var jev = R.jellyEye.createView();
    R.bgFrame = device.createBindGroup({
      layout: R.pipes.lit.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameBuf } },
        { binding: 1, resource: shadowTex.createView() },
        { binding: 2, resource: shadowSamp }
      ]
    });
    R.bgSky = device.createBindGroup({
      layout: R.pipes.sky.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: frameBuf } }]
    });
    R.bgJelly = device.createBindGroup({
      layout: R.pipes.jellyFront.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameBuf } },
        { binding: 1, resource: shadowTex.createView() },
        { binding: 2, resource: shadowSamp },
        { binding: 3, resource: jev },
        { binding: 4, resource: linSamp }
      ]
    });
    R.bgWater = device.createBindGroup({
      layout: R.pipes.water.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameBuf } },
        { binding: 1, resource: shadowTex.createView() },
        { binding: 2, resource: shadowSamp },
        { binding: 3, resource: scv },
        { binding: 4, resource: sev },
        { binding: 5, resource: fbv },
        { binding: 6, resource: linSamp }
      ]
    });
    R.bgBlur = device.createBindGroup({
      layout: R.pipes.blur.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameBuf } },
        { binding: 1, resource: shadowTex.createView() },
        { binding: 2, resource: shadowSamp },
        { binding: 3, resource: scv },
        { binding: 4, resource: sev },
        { binding: 5, resource: fev },
        { binding: 6, resource: linSamp }
      ]
    });
    R.bgBlit = device.createBindGroup({
      layout: R.pipes.blit.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameBuf } },
        { binding: 1, resource: shadowTex.createView() },
        { binding: 2, resource: shadowSamp },
        { binding: 3, resource: R.composed.createView() },
        { binding: 4, resource: sev },
        { binding: 5, resource: fev },
        { binding: 6, resource: linSamp }
      ]
    });
    R.bgGlass = device.createBindGroup({
      layout: R.pipes.glass.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameBuf } },
        { binding: 1, resource: shadowTex.createView() },
        { binding: 2, resource: shadowSamp },
        { binding: 3, resource: R.composed.createView() },
        { binding: 6, resource: linSamp }
      ]
    });
  };

  R.uploadMesh = function (name, builder) {
    var pos = new Float32Array(builder.pos.length);
    // interleave pos+normal
    var inter = new Float32Array((builder.pos.length / 3) * 6);
    var nV = builder.pos.length / 3;
    for (var i = 0; i < nV; i++) {
      inter[i * 6] = builder.pos[i * 3];
      inter[i * 6 + 1] = builder.pos[i * 3 + 1];
      inter[i * 6 + 2] = builder.pos[i * 3 + 2];
      inter[i * 6 + 3] = builder.nor[i * 3];
      inter[i * 6 + 4] = builder.nor[i * 3 + 1];
      inter[i * 6 + 5] = builder.nor[i * 3 + 2];
    }
    var vbo = device.createBuffer({ size: inter.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(vbo, 0, inter);
    var idx = builder.idx instanceof Uint32Array ? builder.idx : Uint32Array.from(builder.idx);
    var ibo = device.createBuffer({ size: idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(ibo, 0, idx);
    // position-only for shadow
    var ponly = new Float32Array(builder.pos);
    var pbo = device.createBuffer({ size: Math.max(12, ponly.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(pbo, 0, ponly);
    R.meshes[name] = { vbo: vbo, pbo: pbo, ibo: ibo, count: idx.length };
    void pos;
  };

  R.setModel = function (slot, matrix, color, rough, metal, emit) {
    var f = modelViews[slot];
    f.set(matrix, 0);
    f[16] = color[0]; f[17] = color[1]; f[18] = color[2]; f[19] = 1;
    f[20] = rough; f[21] = metal; f[22] = emit || 0; f[23] = 0;
  };

  R.unitSphere = JW.uvSphere(14, 18, 1);
  R.uploadMesh("sphere", R.unitSphere);

  R.jellyBuf = new Map();
  R.syncJelly = function (body) {
    var surf = JW.extractSurface(body);
    var n = body.n;
    var inter = new Float32Array(n * 10);
    for (var i = 0; i < n; i++) {
      inter[i * 10] = surf.pos[i * 3];
      inter[i * 10 + 1] = surf.pos[i * 3 + 1];
      inter[i * 10 + 2] = surf.pos[i * 3 + 2];
      inter[i * 10 + 3] = surf.nor[i * 3];
      inter[i * 10 + 4] = surf.nor[i * 3 + 1];
      inter[i * 10 + 5] = surf.nor[i * 3 + 2];
      inter[i * 10 + 6] = surf.col[i * 4];
      inter[i * 10 + 7] = surf.col[i * 4 + 1];
      inter[i * 10 + 8] = surf.col[i * 4 + 2];
      inter[i * 10 + 9] = surf.col[i * 4 + 3];
    }
    var g = R.jellyBuf.get(body.id);
    if (!g || g.vcap < inter.byteLength || g.icap < surf.idx.byteLength) {
      if (g) { g.vbo.destroy(); g.ibo.destroy(); }
      g = {
        vbo: device.createBuffer({ size: Math.max(256, inter.byteLength * 2), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }),
        ibo: device.createBuffer({ size: Math.max(256, surf.idx.byteLength * 2), usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST }),
        vcap: Math.max(256, inter.byteLength * 2),
        icap: Math.max(256, surf.idx.byteLength * 2)
      };
      R.jellyBuf.set(body.id, g);
    }
    device.queue.writeBuffer(g.vbo, 0, inter);
    device.queue.writeBuffer(g.ibo, 0, surf.idx);
    g.count = surf.count;
    return g;
  };

  R.cpuBalls = device.createBuffer({ size: 40 * 16 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  R.cpuInfo = device.createBuffer({ size: 40 * 8 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

  R.writeCPUBalls = function (list) {
    var dyn = new Float32Array(Math.max(1, list.length) * 16);
    var info = new Float32Array(Math.max(1, list.length) * 8);
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var o = i * 16;
      dyn[o] = b.x; dyn[o + 1] = b.y; dyn[o + 2] = b.z;
      dyn[o + 4] = b.vx; dyn[o + 5] = b.vy; dyn[o + 6] = b.vz;
      dyn[o + 8] = b.quat.x; dyn[o + 9] = b.quat.y; dyn[o + 10] = b.quat.z; dyn[o + 11] = b.quat.w;
      var io = i * 8;
      info[io] = b.r; info[io + 1] = b.invMass; info[io + 2] = b.mass; info[io + 3] = 0.3;
      var metalGroup = b.material === "stone" ? 11 : 10;
      info[io + 4] = b.color[0]; info[io + 5] = b.color[1]; info[io + 6] = b.color[2]; info[io + 7] = metalGroup;
    }
    if (list.length) {
      device.queue.writeBuffer(R.cpuBalls, 0, dyn);
      device.queue.writeBuffer(R.cpuInfo, 0, info);
    }
    R.cpuCount = list.length;
  };

  R.render = function (state) {
    R.resize();
    if (R.shaderErr && !R._errShown) {
      console.error(R.shaderErr);
      R._errShown = true;
    }
    var cam = JW.cameraMatrices(state.camera, R.width / R.height);
    var lightDir = JW.norm({ x: -0.46, y: 0.82, z: 0.32 });
    var focus = state.scene === "tank" ? [1.3, 0.35, 0.58] : [0.0, 0.28, 0.0];
    var dist = state.scene === "tank" ? 7.5 : 5.5;
    var eyeL = [focus[0] + lightDir.x * dist, focus[1] + lightDir.y * dist, focus[2] + lightDir.z * dist];
    var lightView = JW.lookAt(eyeL, focus, [0, 1, 0]);
    var ext = state.scene === "tank" ? 1.9 : 1.35;
    var lightProj = JW.ortho(-ext, ext, -ext * 0.7, ext * 0.7, 0.5, 18);
    var lightVP = JW.mulMat(lightProj, lightView);
    var f = frameData;
    f.set(cam.viewProj, 0);
    f.set(cam.view, 16);
    f.set(cam.proj, 32);
    f.set(cam.invView, 48);
    f.set(cam.invProj, 64);
    f[80] = cam.eye[0]; f[81] = cam.eye[1]; f[82] = cam.eye[2]; f[83] = 1;
    f.set(lightVP, 84);
    f[100] = lightDir.x; f[101] = lightDir.y; f[102] = lightDir.z; f[103] = 0;
    f[104] = 1.0; f[105] = 0.93; f[106] = 0.82; f[107] = 1;
    f[108] = R.width; f[109] = R.height; f[110] = state.time || 0; f[111] = 0;
    // ambient rgb, and for blur the xy step is stuffed into a copy later
    f[112] = 0.16; f[113] = 0.17; f[114] = 0.2; f[115] = 0;
    device.queue.writeBuffer(frameBuf, 0, frameData);
    device.queue.writeBuffer(modelBuf, 0, modelCPU);
    device.queue.writeBuffer(lightOnly, 0, lightVP);
    if (state.fluid) {
      device.queue.writeBuffer(R.extraBuf, 0, new Float32Array([state.fluid.renderRadius || 0.02, state.fluid.particleCount || 0, 0, 0]));
    }

    var enc = device.createCommandEncoder();
    function flushEnc() {
      device.queue.submit([enc.finish()]);
      enc = device.createCommandEncoder();
    }
    // Shadow
    var sp = enc.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: { view: shadowTex.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" }
    });
    var shadowBG = device.createBindGroup({
      layout: R.pipes.shadow.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: lightOnly } }]
    });
    // The shadow pipeline expects group0 = lightVP only, group1 = model.
    // Write light VP into a dedicated buffer. model group uses same modelBuf.
    sp.setPipeline(R.pipes.shadow);
    sp.setBindGroup(0, shadowBG);
    state.shadowList.forEach(function (item) {
      var mesh = R.meshes[item.mesh];
      if (!mesh) return;
      var mbg = device.createBindGroup({
        layout: R.pipes.shadow.getBindGroupLayout(1),
        entries: [{ binding: 0, resource: { buffer: modelBuf, offset: item.slot * 256, size: 256 } }]
      });
      sp.setBindGroup(1, mbg);
      sp.setVertexBuffer(0, mesh.pbo);
      sp.setIndexBuffer(mesh.ibo, "uint32");
      sp.drawIndexed(mesh.count);
    });
    if (state.ballCount > 0 && state.ballBuf) {
      var sbg0 = device.createBindGroup({
        layout: R.pipes.shadowBall.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: frameBuf } }]
      });
      var sbg1 = device.createBindGroup({
        layout: R.pipes.shadowBall.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: { buffer: state.ballBuf } },
          { binding: 1, resource: { buffer: state.infoBuf } }
        ]
      });
      sp.setPipeline(R.pipes.shadowBall);
      sp.setBindGroup(0, sbg0);
      sp.setBindGroup(1, sbg1);
      sp.setVertexBuffer(0, R.meshes.sphere.pbo);
      sp.setIndexBuffer(R.meshes.sphere.ibo, "uint32");
      sp.drawIndexed(R.meshes.sphere.count, state.ballCount);
    }
    if (state.jellies && state.jellies.length) {
      var sj0 = device.createBindGroup({
        layout: R.pipes.shadowJelly.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: lightOnly } }]
      });
      sp.setPipeline(R.pipes.shadowJelly);
      sp.setBindGroup(0, sj0);
      state.jellies.forEach(function (g) {
        sp.setVertexBuffer(0, g.vbo);
        sp.setIndexBuffer(g.ibo, "uint32");
        sp.drawIndexed(g.count);
      });
    }
    sp.end();

    var pass = enc.beginRenderPass({
      colorAttachments: [
        { view: R.sceneColor.createView(), clearValue: { r: 0.02, g: 0.02, b: 0.025, a: 1 }, loadOp: "clear", storeOp: "store" },
        { view: R.sceneEye.createView(), clearValue: { r: 40, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }
      ],
      depthStencilAttachment: { view: R.sceneDepth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" }
    });
    pass.setPipeline(R.pipes.sky);
    pass.setBindGroup(0, R.bgSky);
    pass.draw(3);
    pass.setPipeline(R.pipes.lit);
    pass.setBindGroup(0, R.bgFrame);
    state.drawList.forEach(function (item) {
      var mesh = R.meshes[item.mesh];
      if (!mesh) return;
      var mbg = device.createBindGroup({
        layout: R.pipes.lit.getBindGroupLayout(1),
        entries: [{ binding: 0, resource: { buffer: modelBuf, offset: item.slot * 256, size: 256 } }]
      });
      pass.setBindGroup(1, mbg);
      pass.setVertexBuffer(0, mesh.vbo);
      pass.setIndexBuffer(mesh.ibo, "uint32");
      pass.drawIndexed(mesh.count);
    });
    if (state.ballCount > 0 && state.ballBuf) {
      var bbg = device.createBindGroup({
        layout: R.pipes.ball.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: { buffer: state.ballBuf } },
          { binding: 1, resource: { buffer: state.infoBuf } }
        ]
      });
      var b0 = device.createBindGroup({
        layout: R.pipes.ball.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: frameBuf } },
          { binding: 1, resource: shadowTex.createView() },
          { binding: 2, resource: shadowSamp }
        ]
      });
      pass.setPipeline(R.pipes.ball);
      pass.setBindGroup(0, b0);
      pass.setBindGroup(1, bbg);
      pass.setVertexBuffer(0, R.meshes.sphere.pbo);
      pass.setIndexBuffer(R.meshes.sphere.ibo, "uint32");
      pass.drawIndexed(R.meshes.sphere.count, state.ballCount);
    }
    pass.end();

    if (state.scene === "jelly") {
      var jp = enc.beginRenderPass({
        colorAttachments: [
          { view: R.jellyEye.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }
        ],
        depthStencilAttachment: { view: R.jellyDepth.createView(), depthClearValue: 0, depthLoadOp: "clear", depthStoreOp: "store" }
      });
      jp.setPipeline(R.pipes.jellyBack);
      // jellyBack layout may differ (doesn't sample backEye). Build a matching group.
      var jb0 = device.createBindGroup({
        layout: R.pipes.jellyBack.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: frameBuf } }
        ]
      });
      jp.setBindGroup(0, jb0);
      state.jellies.forEach(function (g) {
        jp.setVertexBuffer(0, g.vbo);
        jp.setIndexBuffer(g.ibo, "uint32");
        jp.drawIndexed(g.count);
      });
      jp.end();
      var jf = enc.beginRenderPass({
        colorAttachments: [
          { view: R.sceneColor.createView(), loadOp: "load", storeOp: "store" },
          { view: R.sceneEye.createView(), loadOp: "load", storeOp: "store" }
        ],
        depthStencilAttachment: { view: R.sceneDepth.createView(), depthLoadOp: "load", depthStoreOp: "store" }
      });
      jf.setPipeline(R.pipes.jellyFront);
      jf.setBindGroup(0, R.bgJelly);
      state.jellies.forEach(function (g) {
        jf.setVertexBuffer(0, g.vbo);
        jf.setIndexBuffer(g.ibo, "uint32");
        jf.drawIndexed(g.count);
      });
      jf.end();
    }

    if (state.scene === "tank" && state.fluid) {
      var fd = enc.beginRenderPass({
        colorAttachments: [
          { view: R.fluidEye.createView(), clearValue: { r: 50, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }
        ],
        depthStencilAttachment: { view: R.fluidDepth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" }
      });
      var fbg0 = device.createBindGroup({
        layout: R.pipes.fluidDepth.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: frameBuf } }]
      });
      var fbg1 = device.createBindGroup({
        layout: R.pipes.fluidDepth.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: { buffer: state.fluid.buffers.pos } },
          { binding: 1, resource: { buffer: extraBuf } }
        ]
      });
      fd.setPipeline(R.pipes.fluidDepth);
      fd.setBindGroup(0, fbg0);
      fd.setBindGroup(1, fbg1);
      fd.draw(6, state.fluid.particleCount);
      fd.end();

      // Horizontal blur into fluidBlur. Direction packed by rewriting ambient slot temporarily is messy.
      // Use params: we overload lightColor unused... blur shader reads F.ambient.xy as direction.
      // Write a second frame uniform? We'll mutate frameData ambient for the blur passes then restore.
      flushEnc();
      var horiz = frameData.slice(0);
      horiz[112] = 1 / R.width; horiz[113] = 0;
      device.queue.writeBuffer(frameBuf, 0, horiz);
      var bh = enc.beginRenderPass({
        colorAttachments: [{ view: R.fluidBlur.createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 50, g: 0, b: 0, a: 1 } }]
      });
      bh.setPipeline(R.pipes.blur);
      bh.setBindGroup(0, R.bgBlur);
      bh.draw(3);
      bh.end();
      // Vertical: sample fluidBlur — bgBlur samples fluidEye. Need a second bind group that samples fluidBlur.
      flushEnc();
      var vert = frameData.slice(0);
      vert[112] = 0; vert[113] = 1 / R.height;
      device.queue.writeBuffer(frameBuf, 0, vert);
      var bgBlur2 = device.createBindGroup({
        layout: R.pipes.blur.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: frameBuf } },
          { binding: 1, resource: shadowTex.createView() },
          { binding: 2, resource: shadowSamp },
          { binding: 3, resource: R.sceneColor.createView() },
          { binding: 4, resource: R.sceneEye.createView() },
          { binding: 5, resource: R.fluidBlur.createView() },
          { binding: 6, resource: linSamp }
        ]
      });
      var bv = enc.beginRenderPass({
        colorAttachments: [{ view: R.fluidEye.createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 50, g: 0, b: 0, a: 1 } }]
      });
      bv.setPipeline(R.pipes.blur);
      bv.setBindGroup(0, bgBlur2);
      bv.draw(3);
      bv.end();
      flushEnc();
      device.queue.writeBuffer(frameBuf, 0, frameData);

      var wp = enc.beginRenderPass({
        colorAttachments: [{ view: R.composed.createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }]
      });
      // Water should sample the vertically blurred depth which now sits in fluidEye.
      // bgWater samples fluidBlur (binding 5). After vertical, result is in fluidEye.
      var bgW = device.createBindGroup({
        layout: R.pipes.water.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: frameBuf } },
          { binding: 1, resource: shadowTex.createView() },
          { binding: 2, resource: shadowSamp },
          { binding: 3, resource: R.sceneColor.createView() },
          { binding: 4, resource: R.sceneEye.createView() },
          { binding: 5, resource: R.fluidEye.createView() },
          { binding: 6, resource: linSamp }
        ]
      });
      wp.setPipeline(R.pipes.water);
      wp.setBindGroup(0, bgW);
      wp.draw(3);
      wp.end();

      var fp = enc.beginRenderPass({
        colorAttachments: [{ view: R.composed.createView(), loadOp: "load", storeOp: "store" }],
        depthStencilAttachment: { view: R.sceneDepth.createView(), depthLoadOp: "load", depthStoreOp: "store" }
      });
      var foam0 = device.createBindGroup({
        layout: R.pipes.foam.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: frameBuf } }]
      });
      var foam1 = device.createBindGroup({
        layout: R.pipes.foam.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: { buffer: state.fluid.buffers.foamP } },
          { binding: 1, resource: { buffer: state.fluid.buffers.foamV } }
        ]
      });
      fp.setPipeline(R.pipes.foam);
      fp.setBindGroup(0, foam0);
      fp.setBindGroup(1, foam1);
      fp.draw(6, 7000);
      var spray0 = device.createBindGroup({
        layout: R.pipes.spray.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: frameBuf } }]
      });
      var spray1 = device.createBindGroup({
        layout: R.pipes.spray.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: { buffer: state.fluid.buffers.pos } },
          { binding: 1, resource: { buffer: state.fluid.buffers.vel } }
        ]
      });
      fp.setPipeline(R.pipes.spray);
      fp.setBindGroup(0, spray0);
      fp.setBindGroup(1, spray1);
      fp.draw(6, state.fluid.particleCount);
      fp.end();
    } else {
      var clearEye = enc.beginRenderPass({
        colorAttachments: [{ view: R.fluidEye.createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 50, g: 0, b: 0, a: 1 } }]
      });
      clearEye.end();
      var copy = enc.beginRenderPass({
        colorAttachments: [{ view: R.composed.createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }]
      });
      var bgCopy = device.createBindGroup({
        layout: R.pipes.water.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: frameBuf } },
          { binding: 1, resource: shadowTex.createView() },
          { binding: 2, resource: shadowSamp },
          { binding: 3, resource: R.sceneColor.createView() },
          { binding: 4, resource: R.sceneEye.createView() },
          { binding: 5, resource: R.fluidEye.createView() },
          { binding: 6, resource: linSamp }
        ]
      });
      // Reuse water shader: fluid depth is cleared to 50 so it passes scene through.
      copy.setPipeline(R.pipes.water);
      copy.setBindGroup(0, bgCopy);
      copy.draw(3);
      copy.end();
    }

    var fin = enc.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      depthStencilAttachment: { view: R.sceneDepth.createView(), depthLoadOp: "load", depthStoreOp: "store" }
    });
    fin.setPipeline(R.pipes.blit);
    fin.setBindGroup(0, R.bgBlit);
    fin.draw(3);
    if (state.scene === "tank") {
      fin.setPipeline(R.pipes.glass);
      fin.setBindGroup(0, R.bgGlass);
      state.glass.forEach(function (item) {
        var mesh = R.meshes[item.mesh];
        if (!mesh) return;
        var mbg = device.createBindGroup({
          layout: R.pipes.glass.getBindGroupLayout(1),
          entries: [{ binding: 0, resource: { buffer: modelBuf, offset: item.slot * 256, size: 256 } }]
        });
        fin.setBindGroup(1, mbg);
        fin.setVertexBuffer(0, mesh.vbo);
        fin.setIndexBuffer(mesh.ibo, "uint32");
        fin.drawIndexed(mesh.count);
      });
    }
    fin.end();
    device.queue.submit([enc.finish()]);
    return device.queue.onSubmittedWorkDone();
  };

  R.resize();
  return R;
};
