/* ===== stage.js : 两个场景共用的舞台、背景、地面、小球渲染 ===== */
'use strict';

const WGSL_STAGE = /* wgsl */`
struct Obj { model: mat4x4f, albedo: vec4f, mat: vec4f, extra: vec4f };
@group(1) @binding(0) var<uniform> o: Obj;

struct VO { @builtin(position) p: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f };

@vertex fn vsMesh(@location(0) pos: vec3f, @location(1) nor: vec3f) -> VO {
  var r: VO;
  let wp = (o.model * vec4f(pos, 1.0)).xyz;
  r.wp = wp;
  r.n = normalize((o.model * vec4f(nor, 0.0)).xyz);
  r.p = g.viewProj * vec4f(wp, 1.0);
  return r;
}
@vertex fn vsShadow(@location(0) pos: vec3f) -> @builtin(position) vec4f {
  return g.viewProj * (o.model * vec4f(pos, 1.0));
}

struct VB { @builtin(position) p: vec4f };
@vertex fn vsBack(@builtin(vertex_index) i: u32) -> VB {
  var o: VB; let x = f32((i << 1u) & 2u); let y = f32(i & 2u);
  o.p = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 1.0, 1.0); return o;
}
@fragment fn fsBack(@builtin(position) p: vec4f) -> @location(0) vec4f {
  let uv = p.xy * g.screen.zw;
  return vec4f(backdrop(viewRay(uv)), 1.0);
}

// ---- 水下着色（场景二）：读取由粒子得到的水面高度/焦散图 ----
fn waterInfo(xz: vec2f) -> vec3f {
  let uv = (xz - g.tank.xy) * g.tank.zw;
  let dims = vec2f(textureDimensions(causticTex));
  let p = clamp(uv * dims - 0.5, vec2f(0.0), dims - vec2f(1.001));
  let i0 = vec2i(floor(p)); let f = fract(p);
  let a = textureLoad(causticTex, i0, 0).xyz;
  let b = textureLoad(causticTex, i0 + vec2i(1, 0), 0).xyz;
  let c = textureLoad(causticTex, i0 + vec2i(0, 1), 0).xyz;
  let d = textureLoad(causticTex, i0 + vec2i(1, 1), 0).xyz;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
fn applyUnderwater(wp: vec3f, col: vec3f, strength: f32) -> vec3f {
  if (g.params.z < 0.5) { return col; }
  let uv = (wp.xz - g.tank.xy) * g.tank.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || wp.y < -0.02) { return col; }
  let wi = waterInfo(wp.xz);
  if (wi.x < -0.5) { return col; }
  let depth = max(wi.x - wp.y, 0.0);
  if (wp.y > wi.x + 0.002) { return col; }
  let atten = exp(-depth * vec3f(1.10, 0.42, 0.22) * 0.5);
  let c = mix(1.0, min(wi.y, 2.4), strength * 0.85);
  return col * atten * c * vec3f(0.92, 1.0, 1.04) + vec3f(0.004, 0.02, 0.03) * (1.0 - atten);
}

fn tileNoise(p: vec2f) -> f32 { return fbm3(vec3f(p * 6.0, 0.7)); }

@fragment fn fsMesh(i: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var N = normalize(i.n);
  if (!ff) { N = -N; }
  let V = normalize(g.camPos.xyz - i.wp);
  let kind = i32(o.mat.y + 0.5);
  var albedo = o.albedo.rgb;
  var rough = o.albedo.a;
  var metal = o.mat.x;
  var ao = 1.0;
  var shadow = vec3f(shadowVis(i.wp, N));
  shadow *= jellyShadow(i.wp);
  var col = vec3f(0.0);
  if (kind == 1) {
    // 磨砂奶白舞台台面
    let n = fbm3(vec3f(i.wp.xz * 40.0, 0.0));
    albedo = albedo * (0.94 + 0.12 * n);
    rough = rough + 0.12 * n;
    ao = 1.0;
    // 台面边缘的柔和渐暗
    let ext = g.tank.xy;
    let e = max(abs(i.wp.x) - ext.x * 0.9, abs(i.wp.z) - ext.y * 0.9);
    ao = 1.0 - 0.25 * smoothstep(0.0, 0.1, e) * 0.0;
  } else if (kind == 2) {
    // 地面：深色光泽石面，远处融入背景
    let d = length(i.wp.xz - g.camPos.xz * 0.0);
    albedo *= 0.9 + 0.2 * fbm3(vec3f(i.wp.xz * 3.0, 1.0));
  } else if (kind == 3) {
    // 水槽底部的细砂与礁石
    let n1 = fbm3(i.wp * 22.0);
    let n2 = fbm3(i.wp * 5.0 + 3.0);
    albedo = mix(albedo * 0.7, albedo * 1.25, n1) * (0.85 + 0.3 * n2);
    rough = 0.85;
  } else if (kind == 5) {
    // 金属框
    rough = 0.28;
  }
  col = shadeStd(albedo, rough, metal, N, V, i.wp, shadow, ao);
  if (kind == 3) { col = applyUnderwater(i.wp, col, 1.0); }
  else if (kind == 1 || kind == 2 || kind == 5) { col = applyUnderwater(i.wp, col, 0.7); }
  if (kind == 2) {
    let dist = length(i.wp.xz - vec2f(0.0));
    let fogT = smoothstep(o.extra.x, o.extra.y, dist);
    col = mix(col, backdrop(-V * -1.0 * vec3f(1.0, 0.0, 1.0) * 0.0 + normalize(i.wp - g.camPos.xyz)), fogT);
  }
  return vec4f(col, 1.0);
}

// ---- 实例化小球 ----
struct Ball {
  pos: vec3f, r: f32,
  vel: vec3f, invM: f32,
  w: vec3f, dens: f32,
  q: vec4f,
  col: vec3f, kind: f32,
  aux: vec4f,
  uf: vec4f,
};
@group(1) @binding(0) var<storage, read> balls: array<Ball>;

struct VBall { @builtin(position) p: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) @interpolate(flat) id: u32, @location(3) lp: vec3f };
fn quatRot(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}
fn quatRotInv(q: vec4f, v: vec3f) -> vec3f { return quatRot(vec4f(-q.xyz, q.w), v); }

@vertex fn vsBall(@location(0) pos: vec3f, @builtin(instance_index) ii: u32) -> VBall {
  let b = balls[ii];
  var r: VBall;
  var rr = b.r;
  if (b.aux.w < -0.5) { rr = 0.0; }
  let wp = b.pos + pos * rr;
  r.wp = wp; r.n = pos; r.id = ii; r.lp = pos;
  r.p = g.viewProj * vec4f(wp, 1.0);
  return r;
}
@vertex fn vsBallShadow(@location(0) pos: vec3f, @builtin(instance_index) ii: u32) -> @builtin(position) vec4f {
  let b = balls[ii];
  var rr = b.r;
  if (b.aux.w < -0.5) { rr = 0.0; }
  return g.viewProj * vec4f(b.pos + pos * rr, 1.0);
}

fn ballMaterial(kind: i32, lp: vec3f, col: vec3f, albedo: ptr<function, vec3f>, rough: ptr<function, f32>, metal: ptr<function, f32>) {
  if (kind == 0) {          // 镜面钢球
    *albedo = vec3f(0.93, 0.94, 0.97); *rough = 0.14 + 0.05 * fbm3(lp * 30.0); *metal = 1.0;
  } else if (kind == 1) {   // 花岗岩石球
    let n = fbm3(lp * 14.0); let s = vnoise3(lp * 55.0);
    var c = mix(vec3f(0.42, 0.40, 0.38), vec3f(0.17, 0.17, 0.18), smoothstep(0.35, 0.7, n));
    c = mix(c, vec3f(0.85, 0.8, 0.74), smoothstep(0.72, 0.85, s) * 0.8);
    *albedo = c; *rough = 0.5; *metal = 0.0;
  } else if (kind == 2) {   // 黄铜球
    *albedo = vec3f(0.96, 0.74, 0.36); *rough = 0.24 + 0.06 * fbm3(lp * 25.0); *metal = 1.0;
  } else {                  // 亮漆彩球，带条纹以显出滚动
    let s = smoothstep(0.07, 0.1, abs(lp.y)) ;
    let s2 = smoothstep(0.05, 0.08, abs(lp.x + 0.0)) ;
    var c = col;
    c = mix(c * 0.5 + vec3f(0.5), c, s);
    c = mix(c, c * 0.45, (1.0 - s2) * 0.0);
    // 条纹带
    let band = smoothstep(0.30, 0.34, abs(lp.y - 0.0));
    c = mix(vec3f(1.0, 0.98, 0.95) * 0.9, col, band);
    let dot1 = 1.0 - smoothstep(0.28, 0.35, length(lp - vec3f(0.0, 0.0, 1.0)));
    c = mix(c, vec3f(0.08, 0.1, 0.14), dot1);
    *albedo = c; *rough = 0.22; *metal = 0.0;
  }
}

@fragment fn fsBall(i: VBall) -> @location(0) vec4f {
  let b = balls[i.id];
  let N = normalize(i.wp - b.pos);
  let V = normalize(g.camPos.xyz - i.wp);
  let lp = quatRotInv(b.q, N);
  var albedo = vec3f(0.5); var rough = 0.3; var metal = 0.0;
  ballMaterial(i32(b.kind + 0.5), lp, b.col, &albedo, &rough, &metal);
  var shadow = vec3f(shadowVis(i.wp, N));
  shadow *= jellyShadow(i.wp);
  // 接触 AO：靠近台面（y=0）一侧压暗
  var ao = 1.0;
  if (g.params.z < 0.5) { ao = 1.0 - 0.45 * (1.0 - smoothstep(0.0, b.r * 1.3, i.wp.y)) * (1.0 - N.y * 0.5); }
  var col = shadeStd(albedo, rough, metal, N, V, i.wp, shadow, ao);
  col = applyUnderwater(i.wp, col, 0.8);
  return vec4f(col, 1.0);
}
`;

class Stage {
  constructor(R) {
    this.R = R;
    const D = R.D;
    this.D = D;
    const code = WGSL_COMMON + WGSL_STAGE;
    this.mod = GPUX.module(code, 'stage');
    this.objBGL = D.createBindGroupLayout({ entries: [BL.u(0, SS.VERTEX | SS.FRAGMENT)] });
    this.ballBGL = D.createBindGroupLayout({ entries: [BL.ro(0, SS.VERTEX | SS.FRAGMENT)] });
    const pl = bgls => D.createPipelineLayout({ bindGroupLayouts: bgls });
    const vbufs = [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
      { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] }];
    const hdr = GPUX.hdr;
    this.backPipe = D.createRenderPipeline({
      layout: pl([R.frameBGL]), vertex: { module: this.mod, entryPoint: 'vsBack' },
      fragment: { module: this.mod, entryPoint: 'fsBack', targets: [{ format: hdr }] },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always' },
    });
    this.meshPipe = D.createRenderPipeline({
      layout: pl([R.frameBGL, this.objBGL]),
      vertex: { module: this.mod, entryPoint: 'vsMesh', buffers: vbufs },
      fragment: { module: this.mod, entryPoint: 'fsMesh', targets: [{ format: hdr }] },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
      primitive: { cullMode: 'none' },
    });
    this.meshShadowPipe = D.createRenderPipeline({
      layout: pl([R.frameBGL, this.objBGL]),
      vertex: { module: this.mod, entryPoint: 'vsShadow', buffers: [vbufs[0]] },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.0 },
      primitive: { cullMode: 'none' },
    });
    this.ballPipe = D.createRenderPipeline({
      layout: pl([R.frameBGL, this.ballBGL]),
      vertex: { module: this.mod, entryPoint: 'vsBall', buffers: [vbufs[0]] },
      fragment: { module: this.mod, entryPoint: 'fsBall', targets: [{ format: hdr }] },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
      primitive: { cullMode: 'back' },
    });
    this.ballShadowPipe = D.createRenderPipeline({
      layout: pl([R.frameBGL, this.ballBGL]),
      vertex: { module: this.mod, entryPoint: 'vsBallShadow', buffers: [vbufs[0]] },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.0 },
      primitive: { cullMode: 'back' },
    });
    this.meshes = [];
  }
  /* 创建静态网格对象 */
  makeMesh(geo, opts) {
    const D = this.D;
    const m = {
      vb: GPUX.bufferFrom(geo.pos, BU.VERTEX, 'mesh-v'),
      nb: GPUX.bufferFrom(geo.nor, BU.VERTEX, 'mesh-n'),
      ib: GPUX.bufferFrom(geo.idx, BU.INDEX, 'mesh-i'),
      count: geo.idx.length,
      ubuf: GPUX.buffer(112, BU.UNIFORM | BU.COPY_DST, 'obj'),
      shadow: opts.shadow !== false,
    };
    m.bg = D.createBindGroup({ layout: this.objBGL, entries: [{ binding: 0, resource: { buffer: m.ubuf } }] });
    this.setMeshParams(m, opts);
    this.meshes.push(m);
    return m;
  }
  setMeshParams(m, o) {
    const d = new Float32Array(28);
    d.set(o.model || M4.ident(), 0);
    d.set(o.albedo || [0.8, 0.8, 0.8, 0.5], 16);
    d.set([o.metal || 0, o.kind || 0, 0, 0], 20);
    d.set(o.extra || [0, 0, 0, 0], 24);
    GPUX.device.queue.writeBuffer(m.ubuf, 0, d);
  }
  makeBallBG(buf) { return this.D.createBindGroup({ layout: this.ballBGL, entries: [{ binding: 0, resource: { buffer: buf } }] }); }
  drawBackdrop(pass) { pass.setPipeline(this.backPipe); pass.setBindGroup(0, this.R.frameBG); pass.draw(3); }
  drawMeshes(pass, list, shadowPass) {
    pass.setPipeline(shadowPass ? this.meshShadowPipe : this.meshPipe);
    pass.setBindGroup(0, shadowPass ? this.R.frameBGShadow : this.R.frameBG);
    for (const m of list || this.meshes) {
      if (!m.visible && m.visible !== undefined) continue;
      if (shadowPass && !m.shadow) continue;
      pass.setBindGroup(1, m.bg);
      pass.setVertexBuffer(0, m.vb); if (!shadowPass) pass.setVertexBuffer(1, m.nb);
      pass.setIndexBuffer(m.ib, 'uint32');
      pass.drawIndexed(m.count);
    }
  }
  drawBalls(pass, bg, count, shadowPass) {
    pass.setPipeline(shadowPass ? this.ballShadowPipe : this.ballPipe);
    pass.setBindGroup(0, shadowPass ? this.R.frameBGShadow : this.R.frameBG);
    pass.setBindGroup(1, bg);
    pass.setVertexBuffer(0, this.R.sphereVB);
    pass.setIndexBuffer(this.R.sphereIB, 'uint32');
    if (count > 0) pass.drawIndexed(this.R.sphere.idx.length, count);
  }
}
