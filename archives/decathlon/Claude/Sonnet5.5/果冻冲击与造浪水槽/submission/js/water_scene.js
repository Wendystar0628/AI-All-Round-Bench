/* ===== water_scene.js : 场景二「多密度球与造浪水槽」——渲染与场景逻辑 ===== */
'use strict';

const WGSL_WATER_RENDER = /* wgsl */`
struct Particle { x: vec3f, foam: f32, v: vec3f, rho: f32, C: mat3x3f };
struct WU {
  p0: vec4f,   // drawRadius, thickRadius, filterWorldRadius, thickCalib
  p1: vec4f,   // sigma.rgb, foamK
  p2: vec4f,   // LX LY LZ time
  p3: vec4f,   // dir.xy, depthTol, 0
};
@group(1) @binding(0) var<uniform> wu: WU;
@group(1) @binding(1) var<storage, read> parts: array<Particle>;

const QUAD = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
struct VQ { @builtin(position) p: vec4f, @location(0) uv: vec2f, @location(1) vpos: vec3f, @location(2) foam: f32, @location(3) rad: f32 };
@vertex fn vsP(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VQ {
  let pt = parts[ii];
  var o: VQ;
  let corner = QUAD[vi];
  let spray = 1.0 - smoothstep(0.12, 0.5, pt.rho);
  let rad = wu.p0.x * mix(1.0, 0.5, spray);
  let vp = (g.view * vec4f(pt.x, 1.0)).xyz;
  o.p = g.proj * vec4f(vp + vec3f(corner * rad, 0.0), 1.0);
  o.uv = corner; o.vpos = vp; o.foam = pt.foam; o.rad = rad;
  return o;
}
struct FO { @location(0) c: vec4f, @builtin(frag_depth) d: f32 };
@fragment fn fsDepth(i: VQ) -> FO {
  let r2 = dot(i.uv, i.uv);
  if (r2 > 1.0) { discard; }
  let h = sqrt(1.0 - r2) * i.rad;
  let clip = g.proj * vec4f(i.vpos.xy + i.uv * i.rad, i.vpos.z + h, 1.0);
  var o: FO;
  o.c = vec4f(-i.vpos.z - h, i.foam, 0.0, 1.0);
  o.d = clip.z / clip.w;
  return o;
}
@vertex fn vsT(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VQ {
  let pt = parts[ii];
  var o: VQ;
  let corner = QUAD[vi];
  let spray = 1.0 - smoothstep(0.12, 0.5, pt.rho);
  let rad = wu.p0.y * mix(1.0, 0.5, spray);
  let vp = (g.view * vec4f(pt.x, 1.0)).xyz;
  o.p = g.proj * vec4f(vp + vec3f(corner * rad, 0.0), 1.0);
  if (spray > 0.9) { o.p = vec4f(2.0, 2.0, 2.0, 1.0); }
  o.uv = corner; o.vpos = vp; o.foam = pt.foam; o.rad = rad;
  return o;
}
@fragment fn fsThick(i: VQ) -> @location(0) vec4f {
  let r2 = dot(i.uv, i.uv);
  if (r2 > 1.0) { discard; }
  let chord = 2.0 * sqrt(1.0 - r2) * i.rad * wu.p0.w * (wu.p0.y / i.rad) * (wu.p0.y / i.rad);
  return vec4f(chord, chord * i.foam, 0.0, 0.0);
}

// ---- 深度双边平滑 ----
@group(1) @binding(0) var<uniform> su: WU;
struct VF { @builtin(position) p: vec4f };
@vertex fn vsFull(@builtin(vertex_index) i: u32) -> VF {
  var o: VF; let x = f32((i << 1u) & 2u); let y = f32(i & 2u);
  o.p = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0); return o;
}
@group(2) @binding(0) var srcT: texture_2d<f32>;
@fragment fn fsSmooth(f: VF) -> @location(0) vec4f {
  let ip = vec2i(f.p.xy);
  let c = textureLoad(srcT, ip, 0);
  if (c.x > 1e5) { return c; }
  let dims = vec2i(textureDimensions(srcT));
  let projS = g.proj[1][1] * g.screen.y * 0.5;
  let rpx = clamp(su.p0.z * projS / c.x, 1.5, 22.0);
  let R = i32(ceil(rpx));
  let dir = vec2i(i32(su.p3.x), i32(su.p3.y));
  var sd = 0.0; var sf = 0.0; var sw = 0.0;
  let tol = su.p3.z;
  for (var k = -R; k <= R; k++) {
    let q = clamp(ip + dir * k, vec2i(0), dims - vec2i(1));
    let s = textureLoad(srcT, q, 0);
    if (s.x > 1e5) { continue; }
    let dz = (s.x - c.x) / tol;
    let wk = exp(-f32(k * k) / (rpx * rpx * 0.5)) * exp(-dz * dz);
    sd += s.x * wk; sf += s.y * wk; sw += wk;
  }
  return vec4f(sd / sw, sf / sw, 0.0, 1.0);
}

// ---- 合成：折射、吸收、反射、白水 ----
@group(2) @binding(1) var thickT: texture_2d<f32>;
@group(2) @binding(2) var sceneCopyT: texture_2d<f32>;
@group(2) @binding(3) var sceneDepthT: texture_depth_2d;
fn fwd() -> vec3f { return -vec3f(g.view[0][2], g.view[1][2], g.view[2][2]); }
fn wposAt(ip: vec2i, z: f32) -> vec3f {
  let uv = (vec2f(ip) + 0.5) * g.screen.zw;
  let r = viewRay(uv);
  return g.camPos.xyz + r * (z / dot(r, fwd()));
}
@fragment fn fsWater(f: VF) -> @location(0) vec4f {
  let ip = vec2i(f.p.xy);
  let dims = vec2i(textureDimensions(srcT));
  let sd = textureLoad(srcT, ip, 0);
  if (sd.x > 1e5) { discard; }
  let sceneZ = linDepth(textureLoad(sceneDepthT, ip, 0));
  if (sceneZ < sd.x - 0.006) { discard; }
  let z0 = sd.x;
  let P = wposAt(ip, z0);
  // 法线：取变化较小的一侧差分
  let zl = textureLoad(srcT, clamp(ip + vec2i(-1, 0), vec2i(0), dims - vec2i(1)), 0).x;
  let zr = textureLoad(srcT, clamp(ip + vec2i(1, 0), vec2i(0), dims - vec2i(1)), 0).x;
  let zu = textureLoad(srcT, clamp(ip + vec2i(0, -1), vec2i(0), dims - vec2i(1)), 0).x;
  let zd = textureLoad(srcT, clamp(ip + vec2i(0, 1), vec2i(0), dims - vec2i(1)), 0).x;
  var dpx = wposAt(ip + vec2i(1, 0), zr) - P;
  if (zr > 1e5 || (abs(zl - z0) < abs(zr - z0) && zl < 1e5)) { dpx = P - wposAt(ip + vec2i(-1, 0), zl); }
  var dpy = wposAt(ip + vec2i(0, 1), zd) - P;
  if (zd > 1e5 || (abs(zu - z0) < abs(zd - z0) && zu < 1e5)) { dpy = P - wposAt(ip + vec2i(0, -1), zu); }
  var N = normalize(cross(dpx, dpy));
  let V = normalize(g.camPos.xyz - P);
  if (dot(N, V) < 0.0) { N = -N; }
  let edge = clamp((max(abs(zl - z0), max(abs(zr - z0), max(abs(zu - z0), abs(zd - z0)))) - 0.01) * 12.0, 0.0, 1.0);
  N = normalize(mix(N, V, edge * 0.6));
  let nv = clamp(dot(N, V), 0.0, 1.0);
  let tk = textureLoad(thickT, ip, 0);
  let th = clamp(tk.x, 0.0, 1.6);
  let foamAmt = clamp(1.0 - exp(-tk.y * wu.p1.w), 0.0, 1.0);
  // 折射
  let uv = (vec2f(ip) + 0.5) * g.screen.zw;
  let rd = refract(-V, N, 1.0 / 1.33);
  let tp = P + rd * min(th, 0.45) * 0.8;
  let cp = g.viewProj * vec4f(tp, 1.0);
  var uv2 = vec2f(cp.x / cp.w * 0.5 + 0.5, 0.5 - cp.y / cp.w * 0.5);
  uv2 = clamp(uv2, vec2f(0.002), vec2f(0.998));
  let sz2 = linDepth(textureLoad(sceneDepthT, vec2i(uv2 * g.screen.xy), 0));
  if (sz2 < z0 - 0.03) { uv2 = uv; }
  let bg = textureSampleLevel(sceneCopyT, linSmp, uv2, 0.0).rgb;
  let sigma = wu.p1.xyz;
  let trans = exp(-sigma * th);
  // 体内散射：越近水面越亮
  let lvl = clamp(P.y / max(wu.p2.y * 0.5, 0.1), 0.0, 1.2);
  let L = g.lightDir.xyz;
  let lit = 0.45 + 0.55 * clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
  let body = vec3f(0.020, 0.150, 0.215) * (1.0 - exp(-th * 2.2)) * lit * (0.45 + 0.55 * lvl) * 1.1;
  var col = bg * trans + body;
  // 反射与高光
  let F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  let R = reflect(-V, N);
  let env = envLight(R, 0.015);
  col = col * (1.0 - 0.6 * F) + env * F * 1.3;
  let H = normalize(L + V);
  let a = 0.045;
  let nl = max(dot(N, L), 0.0);
  col += vec3f(1.0, 0.97, 0.9) * ggxD(max(dot(N, H), 0.0), a) * smithV(nv + 1e-3, nl + 1e-3, a) * nl * 0.9 * g.lightDir.w;
  // 白水
  let fcol = vec3f(0.92, 0.97, 1.0) * (0.35 + 0.75 * clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0));
  let fa = max(foamAmt, sd.y * 0.55);
  col = mix(col, fcol, clamp(fa, 0.0, 1.0) * 0.92);
  return vec4f(col, 1.0);
}

// ---- 玻璃水槽 ----
struct Obj { model: mat4x4f, albedo: vec4f, mat: vec4f, extra: vec4f };
@group(1) @binding(0) var<uniform> o: Obj;
struct VG { @builtin(position) p: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f };
@fragment fn fsGlass(i: VG, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let L3 = o.extra.xyz;
  if (i.wp.y > L3.y + 0.004) { discard; }
  var N = normalize(i.n);
  if (!ff) { N = -N; }
  let V = normalize(g.camPos.xyz - i.wp);
  let nv = clamp(dot(N, V), 0.0, 1.0);
  let F = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
  let R = reflect(-V, N);
  var col = envLight(R, 0.02) * (0.25 + F * 1.2);
  // 玻璃的边缘：到最近两条边的距离
  let p = i.wp;
  let d0 = min(p.x - (-0.012), L3.x + 0.012 - p.x);
  let d1 = min(p.y, L3.y - p.y);
  let d2 = min(p.z - (-0.012), L3.z + 0.012 - p.z);
  let a0 = abs(N.x); let a1 = abs(N.y); let a2 = abs(N.z);
  var de = 1.0;
  if (a0 > 0.5) { de = min(d1, d2); } else if (a1 > 0.5) { de = min(d0, d2); } else { de = min(d0, d1); }
  let rim = exp(-pow(max(de, 0.0) / 0.0075, 2.0));
  let rim2 = exp(-pow(max(de - 0.014, 0.0) / 0.004, 2.0)) * 0.3;
  let tintEdge = vec3f(0.28, 0.85, 0.78);
  col += tintEdge * rim * 0.9 + vec3f(1.0) * rim * 0.35 + tintEdge * rim2;
  let ga = clamp(0.035 + F * 0.9 + rim * 0.55 + rim2 * 0.1, 0.0, 0.92);
  let tint = mix(vec3f(0.85, 0.97, 0.93), col, 0.5);
  return vec4f(col * 1.0 + tint * 0.0, ga);
}
`;

class TankScene {
  constructor(R, stage) {
    this.R = R; this.stage = stage; this.D = R.D;
    this.name = 'tank';
    this.sim = new WaterSim(R);
    this.cfg = WATER_CFG;
    this.dtPhys = WATER_CFG.dt;
    this.simTime = 0;
    this.camDefault = { target: [1.2, 0.28, 0.22], dist: 3.5, yaw: 0.12, pitch: 0.2, fov: 36 * Math.PI / 180 };
    this.groups = [
      { name: '轻球', dens: 0.35, col: [1.0, 0.24, 0.10], css: '#ff3d1a' },
      { name: '半浮', dens: 0.72, col: [1.0, 0.78, 0.08], css: '#ffc414' },
      { name: '中性', dens: 1.0, col: [0.10, 0.85, 0.42], css: '#1ad96b' },
      { name: '较重', dens: 1.9, col: [0.16, 0.50, 1.0], css: '#2980ff' },
      { name: '很重', dens: 3.8, col: [0.64, 0.30, 0.96], css: '#a34df5' },
    ];
    this.ballR = 0.04;
    this.nBalls = 20;
    this.releaseCounter = 0;
    this.ballState = null; this.ballMapping = false;
    this.layout = 'default';
    this.buildGPU();
    this.buildMeshes();
    this.reset();
  }

  /* ---------- 渲染管线 ---------- */
  buildGPU() {
    const D = this.D, R = this.R;
    this.mod = GPUX.module(WGSL_COMMON + WGSL_WATER_RENDER, 'waterRender');
    const hdr = GPUX.hdr;
    this.wuBuf = GPUX.buffer(64, BU.UNIFORM | BU.COPY_DST, 'WU');
    this.wuBufH = GPUX.buffer(64, BU.UNIFORM | BU.COPY_DST, 'WU-H');
    this.wuBufV = GPUX.buffer(64, BU.UNIFORM | BU.COPY_DST, 'WU-V');
    this.partBGL = D.createBindGroupLayout({ entries: [BL.u(0, SS.VERTEX | SS.FRAGMENT), BL.ro(1, SS.VERTEX)] });
    this.uBGL = D.createBindGroupLayout({ entries: [BL.u(0, SS.VERTEX | SS.FRAGMENT)] });
    this.texBGL1 = D.createBindGroupLayout({ entries: [BL.tex(0, SS.FRAGMENT, 'unfilterable-float')] });
    this.compBGL = D.createBindGroupLayout({
      entries: [BL.tex(0, SS.FRAGMENT, 'unfilterable-float'), BL.tex(1), BL.tex(2), BL.depth(3)]
    });
    const fb = R.frameBGL;
    const pl = bgls => D.createPipelineLayout({ bindGroupLayouts: bgls });
    this.depthPipe = D.createRenderPipeline({
      layout: pl([fb, this.partBGL]),
      vertex: { module: this.mod, entryPoint: 'vsP' },
      fragment: { module: this.mod, entryPoint: 'fsDepth', targets: [{ format: 'rg32float' }] },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.thickPipe = D.createRenderPipeline({
      layout: pl([fb, this.partBGL]),
      vertex: { module: this.mod, entryPoint: 'vsT' },
      fragment: {
        module: this.mod, entryPoint: 'fsThick', targets: [{
          format: 'rgba16float', blend: { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } }
        }]
      },
    });
    this.smoothPipe = D.createRenderPipeline({
      layout: pl([fb, this.uBGL, this.texBGL1]),
      vertex: { module: this.mod, entryPoint: 'vsFull' },
      fragment: { module: this.mod, entryPoint: 'fsSmooth', targets: [{ format: 'rg32float' }] },
    });
    this.compPipe = D.createRenderPipeline({
      layout: pl([fb, this.partBGL0 || this.uBGL, this.compBGL]),
      vertex: { module: this.mod, entryPoint: 'vsFull' },
      fragment: { module: this.mod, entryPoint: 'fsWater', targets: [{ format: hdr }] },
    });
    this.glassPipe = D.createRenderPipeline({
      layout: pl([fb, this.stage.objBGL]),
      vertex: { module: this.stage.mod, entryPoint: 'vsMesh', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }, { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] }] },
      fragment: {
        module: this.mod, entryPoint: 'fsGlass', targets: [{
          format: hdr, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } }
        }]
      },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less' },
      primitive: { cullMode: 'none' },
    });
    this.makeWBG();
    R.onResize = R.onResize || [];
    R.onResize.push(() => this.makeWBG());
  }
  makeWBG() {
    const D = this.D, sim = this.sim;
    if (this.wTex) for (const k of ['rawA', 'rawB', 'thick', 'z']) this.wTex[k].destroy();
    const w = RT.w, h = RT.h;
    const U = TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING;
    this.wTex = {
      rawA: GPUX.tex(w, h, 'rg32float', U, 'wA'), rawB: GPUX.tex(w, h, 'rg32float', U, 'wB'),
      thick: GPUX.tex(w, h, 'rgba16float', U, 'wThick'), z: GPUX.tex(w, h, 'depth32float', TU.RENDER_ATTACHMENT, 'wZ'),
    };
    this.wView = {};
    for (const k in this.wTex) this.wView[k] = this.wTex[k].createView();
    const partBG = u => D.createBindGroup({ layout: this.partBGL, entries: [{ binding: 0, resource: { buffer: u } }, { binding: 1, resource: { buffer: sim.partBuf } }] });
    this.partBG = partBG(this.wuBuf);
    this.uBG = [this.wuBufH, this.wuBufV].map(u => D.createBindGroup({ layout: this.uBGL, entries: [{ binding: 0, resource: { buffer: u } }] }));
    this.uBGMain = D.createBindGroup({ layout: this.uBGL, entries: [{ binding: 0, resource: { buffer: this.wuBuf } }] });
    this.texBG = { A: D.createBindGroup({ layout: this.texBGL1, entries: [{ binding: 0, resource: this.wView.rawA }] }), B: D.createBindGroup({ layout: this.texBGL1, entries: [{ binding: 0, resource: this.wView.rawB }] }) };
    this.compBG = D.createBindGroup({
      layout: this.compBGL, entries: [{ binding: 0, resource: this.wView.rawA }, { binding: 1, resource: this.wView.thick }, { binding: 2, resource: RT.copyView },
        { binding: 3, resource: RT.depth.createView({ aspect: 'depth-only' }) }]
    });
    this.compBGB = D.createBindGroup({
      layout: this.compBGL, entries: [{ binding: 0, resource: this.wView.rawB }, { binding: 1, resource: this.wView.thick }, { binding: 2, resource: RT.copyView },
        { binding: 3, resource: RT.depth.createView({ aspect: 'depth-only' }) }]
    });
  }

  /* ---------- 静态网格：地面、基座、地形、玻璃、造浪板 ---------- */
  buildMeshes() {
    const S = this.stage, C = this.cfg;
    this.meshes = [];
    const ground = makeBoxMesh(80, 0.2, 80, 0);
    this.meshes.push(S.makeMesh(ground, { model: M4.trs([C.LX / 2, -0.26, C.LZ / 2], [1, 1, 1]), albedo: [0.030, 0.038, 0.048, 0.55], kind: 2, extra: [2.5, 9, 0, 0], shadow: false }));
    // 基座：奶白台面，与场景一统一
    const bench = makeBoxMesh(C.LX + 0.9, 0.16, C.LZ + 0.9, 0);
    this.meshes.push(S.makeMesh(bench, { model: M4.trs([C.LX / 2, -0.081, C.LZ / 2], [1, 1, 1]), albedo: [0.46, 0.47, 0.50, 0.45], kind: 1 }));
    // 地形网格（槽底、沙滩、横脊与礁石）
    const nx = 121, nz = 23, step = 0.02;
    const pos = new Float32Array(nx * nz * 3), nor = new Float32Array(nx * nz * 3), idx = [];
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      const x = i * step, z = Math.min(k * step, C.LZ) * (k === nz - 1 ? 1 : 1);
      const zz = k === nz - 1 ? C.LZ : k * step;
      const h = terrainHeight(x, zz), e = 0.01;
      const hx = (terrainHeight(x + e, zz) - terrainHeight(Math.max(x - e, 0), zz)) / (2 * e), hz = (terrainHeight(x, zz + e) - terrainHeight(x, Math.max(zz - e, 0))) / (2 * e);
      const n = V3.norm([-hx, 1, -hz]);
      const o = (k * nx + i) * 3;
      pos[o] = x; pos[o + 1] = h; pos[o + 2] = zz; nor[o] = n[0]; nor[o + 1] = n[1]; nor[o + 2] = n[2];
    }
    for (let k = 0; k < nz - 1; k++) for (let i = 0; i < nx - 1; i++) {
      const a = k * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    this.terrMesh = S.makeMesh({ pos, nor, idx: new Uint32Array(idx) }, { albedo: [0.34, 0.27, 0.19, 0.9], kind: 3 });
    this.meshes.push(this.terrMesh);
    // 造浪板与推杆
    this.paddleGeo = makeBoxMesh(1, 1, 1, 0);
    this.paddleMesh = S.makeMesh(this.paddleGeo, { albedo: [0.22, 0.30, 0.38, 0.25], metal: 0.5, kind: 5 });
    this.ramMesh = S.makeMesh(this.paddleGeo, { albedo: [0.30, 0.33, 0.38, 0.38], metal: 0.9, kind: 5 });
    this.meshes.push(this.paddleMesh, this.ramMesh);
    // 水槽框：顶部横杆与四根立柱
    const metal = [0.55, 0.58, 0.62, 0.3];
    const rail = (sx, sy, sz, x, y, z, col, m) => this.meshes.push(S.makeMesh(makeBoxMesh(sx, sy, sz, 0), { model: M4.trs([x, y, z], [1, 1, 1]), albedo: col || metal, metal: m === undefined ? 0.9 : m, kind: 5 }));
    const t = 0.012;
    rail(C.LX + 0.06, 0.03, 0.03, C.LX / 2, C.LY + 0.012, -0.018);
    rail(C.LX + 0.06, 0.03, 0.03, C.LX / 2, C.LY + 0.012, C.LZ + 0.018);
    rail(0.03, 0.03, C.LZ + 0.06, -0.018, C.LY + 0.012, C.LZ / 2);
    rail(0.03, 0.03, C.LZ + 0.06, C.LX + 0.018, C.LY + 0.012, C.LZ / 2);
    for (const [x, z] of [[-0.018, -0.018], [C.LX + 0.018, -0.018], [-0.018, C.LZ + 0.018], [C.LX + 0.018, C.LZ + 0.018]]) rail(0.03, C.LY + 0.04, 0.03, x, C.LY / 2 - 0.006, z, [0.08, 0.09, 0.11, 0.4], 0.3);
    // 底框
    rail(C.LX + 0.06, 0.03, 0.03, C.LX / 2, -0.012, -0.018, [0.08, 0.09, 0.11, 0.4], 0.3);
    rail(C.LX + 0.06, 0.03, 0.03, C.LX / 2, -0.012, C.LZ + 0.018, [0.08, 0.09, 0.11, 0.4], 0.3);
    // 玻璃（透明，最后绘制）
    this.glassMesh = S.makeMesh(makeBoxMesh(C.LX + 0.024, C.LY + 0.02, C.LZ + 0.024, 0), { model: M4.trs([C.LX / 2, C.LY / 2 + 0.005, C.LZ / 2], [1, 1, 1]), albedo: [1, 1, 1, 1], extra: [C.LX, C.LY, C.LZ, 0], shadow: false });
    // 小球缓冲（渲染用）
    this.ballBG = S.makeBallBG(this.sim.ballBuf);
  }
  updatePaddleMesh() {
    const S = this.stage, C = this.cfg, p = this.sim.paddle;
    const th = C.paddleThick;
    S.setMeshParams(this.paddleMesh, { model: M4.trs([p.x - th / 2, C.LY / 2, C.LZ / 2], [th, C.LY, C.LZ - 0.004]), albedo: [0.16, 0.18, 0.21, 0.30], metal: 0.85, kind: 5 });
    const len = Math.max(p.x - th, 0.02);
    S.setMeshParams(this.ramMesh, { model: M4.trs([len / 2 - 0.004, C.LY / 2, C.LZ / 2], [len, C.LY - 0.01, C.LZ - 0.006]), albedo: [0.14, 0.15, 0.18, 0.38], metal: 0.9, kind: 5 });
  }

  /* ---------- 小球 ---------- */
  ballData(releaseTime, seedBase) {
    const rng = mulberry32(7771 + (seedBase | 0) * 977);
    const n = this.nBalls, d = new Float32Array(this.cfg.maxBalls * BALL_F);
    const R = this.ballR, lvl = this.cfg.level;
    for (let i = 0; i < this.cfg.maxBalls; i++) {
      const o = i * BALL_F;
      if (i >= n) { d[o + 23] = -1; continue; }
      const col = i % 5, row = Math.floor(i / 5);
      const gi = (col + row) % 5, grp = this.groups[gi];
      const x = 0.30 + col * 0.118 + (rng() - 0.5) * 0.04;
      const z = 0.075 + row * 0.1 + (rng() - 0.5) * 0.03;
      const y = lvl + 0.10 + (col + row * 0.5) * 0.085 + rng() * 0.03;
      d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = R;
      d[o + 4] = (rng() - 0.5) * 0.3; d[o + 5] = 0; d[o + 6] = (rng() - 0.5) * 0.2; d[o + 7] = 1;
      d[o + 8] = (rng() - 0.5) * 4; d[o + 9] = (rng() - 0.5) * 4; d[o + 10] = (rng() - 0.5) * 4; d[o + 11] = grp.dens;
      d[o + 12] = 0; d[o + 13] = 0; d[o + 14] = 0; d[o + 15] = 1;
      d[o + 16] = grp.col[0]; d[o + 17] = grp.col[1]; d[o + 18] = grp.col[2]; d[o + 19] = 3;
      d[o + 20] = releaseTime + (i % 5) * 0.12 + Math.floor(i / 5) * 0.05 + rng() * 0.06; d[o + 21] = gi; d[o + 22] = 0; d[o + 23] = 0;
    }
    return d;
  }
  releaseBalls(delay = 0.05) {
    const sim = this.sim;
    this.releaseCounter++;
    const d = this.ballData(sim.time + delay, this.releaseCounter);
    this.D.queue.writeBuffer(sim.ballBuf, 0, d);
    this.D.queue.writeBuffer(sim.ballBufB, 0, d);
    sim.nballs = this.nBalls;
    this.events.push({ type: 'release' });
  }
  setGroupDensity(gi, dens) {
    this.groups[gi].dens = dens;
    const sim = this.sim;
    for (let i = 0; i < this.nBalls; i++) {
      if (((i % 5) + Math.floor(i / 5)) % 5 === gi) {
        this.D.queue.writeBuffer(sim.ballBuf, i * BALL_B + 44, new Float32Array([dens]));
        this.D.queue.writeBuffer(sim.ballBufB, i * BALL_B + 44, new Float32Array([dens]));
      }
    }
  }

  /* ---------- 重置与推进 ---------- */
  reset(layout) {
    this.events = [];
    const sim = this.sim;
    sim.reset();
    this.simTime = 0; this.accum = 0;
    sim.nballs = this.nBalls;
    const d = this.ballData(0.2, 0);
    this.D.queue.writeBuffer(sim.ballBuf, 0, d);
    this.D.queue.writeBuffer(sim.ballBufB, 0, d);
    // 预沉降：让静水先平静（球仍在空中保持）
    sim.visc = 2.0;
    sim.step(900);
    sim.visc = 0.0;
    sim.time = 0; sim.substeps = 0;
    // 速度清零
    this.zeroVelocities();
    sim.paddle.x = this.cfg.paddleX0; sim.paddle.v = 0; sim.paddle.phase = 0; sim.paddle.amp = 0;
    this.releaseCounter = 0;
    const d2 = this.ballData(0.15, 0);
    this.D.queue.writeBuffer(sim.ballBuf, 0, d2); this.D.queue.writeBuffer(sim.ballBufB, 0, d2);
    this.prevBalls = null;
  }
  zeroVelocities() {
    const sim = this.sim, D = this.D;
    // 用一个小计算清零更直接：重写粒子速度——这里通过读回再写回会很慢，所以运行若干带强黏性的子步已足够平静
    sim.visc = 6.0; sim.step(120); sim.visc = 0;
  }
  rerun() { this.sim.params.running = true; this.releaseBalls(); }
  advance(dt) {
    this.accum += dt;
    const sub = Math.floor(this.accum / this.dtPhys);
    const cap = this.maxSubPerFrame || 44;
    const n = Math.min(sub, cap);
    if (n > 0) { this.sim.step(n); this.accum -= n * this.dtPhys; }
    if (sub > cap) this.accum = 0;
    this.simTime = this.sim.time;
  }
  stepN(n) { if (n > 0) this.sim.step(n); this.simTime = this.sim.time; }
  stepTo(target) {
    const sim = this.sim;
    const n = Math.floor((target - sim.time) / this.dtPhys + 1e-6);
    if (n > 0) sim.step(n);
    this.simTime = sim.time;
  }
  drainEvents() { const e = this.events; this.events = []; return e; }

  /* ---------- 渲染 ---------- */
  setupView() {
    const R = this.R, C = this.cfg;
    R.sceneId = 1; R.lightTarget = [C.LX / 2, 0.25, C.LZ / 2]; R.lightRadius = 2.0; R.tankInfo = [0, 0, 1 / C.LX, 1 / C.LZ];
    R.setCausticView(this.sim.causticTex.createView());
  }
  render(enc) {
    const R = this.R, D = this.D, S = this.stage, sim = this.sim, C = this.cfg;
    this.updatePaddleMesh();
    R.updateGlobals(sim.time);
    sim.surfaceMaps(enc);
    // 阴影（小球与地形）
    {
      const p = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: R.shadowTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
      S.drawMeshes(p, this.meshes, true);
      S.drawBalls(p, this.ballBG, this.nBalls, true);
      p.end();
    }
    // 清空果冻阴影图
    {
      const p = enc.beginRenderPass({
        colorAttachments: [{ view: R.jShadowCol.createView(), loadOp: 'clear', clearValue: [1, 1, 1, 1], storeOp: 'store' }],
        depthStencilAttachment: { view: R.jShadowTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
      });
      p.end();
    }
    // 不透明场景
    {
      const p = enc.beginRenderPass({
        colorAttachments: [{ view: RT.colorView, loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }],
        depthStencilAttachment: { view: RT.depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
      });
      S.drawBackdrop(p);
      S.drawMeshes(p, this.meshes, false);
      S.drawBalls(p, this.ballBG, this.nBalls, false);
      p.end();
    }
    this.drawWater(enc);
    // 玻璃
    {
      const p = enc.beginRenderPass({
        colorAttachments: [{ view: RT.colorView, loadOp: 'load', storeOp: 'store' }],
        depthStencilAttachment: { view: RT.depthView, depthReadOnly: true }
      });
      const m = this.glassMesh;
      p.setPipeline(this.glassPipe); p.setBindGroup(0, R.frameBG); p.setBindGroup(1, m.bg);
      p.setVertexBuffer(0, m.vb); p.setVertexBuffer(1, m.nb); p.setIndexBuffer(m.ib, 'uint32'); p.drawIndexed(m.count);
      p.end();
    }
    R.finish(enc);
    this.pollBalls(enc);
  }
  drawWater(enc) {
    const R = this.R, D = this.D, sim = this.sim, C = this.cfg;
    const dxp = C.dx;
    const rDraw = dxp * 0.80, rThick = dxp * 0.85;
    const Vp = C.dx ** 3 / C.ppc;
    const calib = Vp / (4 / 3 * Math.PI * rThick ** 3);
    const sigma = [1.05, 0.40, 0.17];
    const mk = (dx, dy) => new Float32Array([rDraw, rThick, 0.028, calib, sigma[0], sigma[1], sigma[2], 14, C.LX, C.LY, C.LZ, sim.time, dx, dy, 0.035, 0]);
    D.queue.writeBuffer(this.wuBuf, 0, mk(0, 0));
    D.queue.writeBuffer(this.wuBufH, 0, mk(1, 0));
    D.queue.writeBuffer(this.wuBufV, 0, mk(0, 1));
    const np = sim.np;
    // 深度
    {
      const p = enc.beginRenderPass({
        colorAttachments: [{ view: this.wView.rawA, loadOp: 'clear', clearValue: [1e6, 0, 0, 1], storeOp: 'store' }],
        depthStencilAttachment: { view: this.wView.z, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' }
      });
      p.setPipeline(this.depthPipe); p.setBindGroup(0, R.frameBG); p.setBindGroup(1, this.partBG); p.draw(6, np); p.end();
    }
    // 厚度
    {
      const p = enc.beginRenderPass({ colorAttachments: [{ view: this.wView.thick, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
      p.setPipeline(this.thickPipe); p.setBindGroup(0, R.frameBG); p.setBindGroup(1, this.partBG); p.draw(6, np); p.end();
    }
    // 双边平滑（A→B→A→B→A）
    const sm = (srcBG, dstView, ubg) => {
      const p = enc.beginRenderPass({ colorAttachments: [{ view: dstView, loadOp: 'clear', clearValue: [1e6, 0, 0, 1], storeOp: 'store' }] });
      p.setPipeline(this.smoothPipe); p.setBindGroup(0, R.frameBG); p.setBindGroup(1, ubg); p.setBindGroup(2, srcBG); p.draw(3); p.end();
    };
    const iters = this.smoothIters || 2;
    for (let i = 0; i < iters; i++) {
      sm(this.texBG.A, this.wView.rawB, this.uBG[0]);
      sm(this.texBG.B, this.wView.rawA, this.uBG[1]);
    }
    // 复制场景色，然后合成
    enc.copyTextureToTexture({ texture: RT.color }, { texture: RT.copy }, [RT.w, RT.h]);
    {
      const p = enc.beginRenderPass({ colorAttachments: [{ view: RT.colorView, loadOp: 'load', storeOp: 'store' }] });
      p.setPipeline(this.compPipe); p.setBindGroup(0, R.frameBG); p.setBindGroup(1, this.uBGMain); p.setBindGroup(2, this.compBG); p.draw(3); p.end();
    }
  }

  /* 读回小球状态（用于音效与界面）：复制命令随本帧提交，提交后再映射 */
  pollBalls(enc) {
    if (this.ballMapping || this.noPoll) return;
    enc.copyBufferToBuffer(this.sim.ballBuf, 0, this.sim.ballRead, 0, this.cfg.maxBalls * BALL_B);
    this.ballMapping = true; this.needMap = true;
  }
  afterSubmit() {
    if (!this.needMap) return;
    this.needMap = false;
    const sim = this.sim;
    sim.ballRead.mapAsync(GPUMapMode.READ).then(() => {
      const a = new Float32Array(sim.ballRead.getMappedRange().slice(0));
      sim.ballRead.unmap();
      this.consumeBalls(a);
      this.ballMapping = false;
    }).catch(() => { this.ballMapping = false; });
  }
  consumeBalls(a) {
    const prev = this.ballState; this.ballState = a;
    if (!prev) return;
    for (let i = 0; i < this.nBalls; i++) {
      const o = i * BALL_F;
      if (a[o + 23] < -0.5) continue;
      const vy0 = prev[o + 5], vy1 = a[o + 5], y = a[o + 1], r = a[o + 3];
      const phi0 = prev[o + 22], phi1 = a[o + 22];
      const sp = Math.hypot(prev[o + 4], prev[o + 5], prev[o + 6]);
      if (phi0 < 0.25 && phi1 >= 0.25 && sp > 0.6) this.events.push({ type: 'splash', speed: sp, dens: a[o + 11], x: a[o], z: a[o + 2] });
      const dv = Math.hypot(a[o + 4] - prev[o + 4], a[o + 5] - prev[o + 5], a[o + 6] - prev[o + 6]);
      if (dv > 0.9 && phi1 < 0.9) this.events.push({ type: 'hit', speed: dv, what: 'ball' });
    }
    this.events.push({ type: 'wave', amp: this.sim.paddle.amp, foam: this.foamLevel || 0, running: this.sim.params.running });
  }
}

/* ---------- 界面 ---------- */
TankScene.prototype.buildSide = function (App) {
  const S = this, sim = this.sim, el = $('#side');
  const P = sim.params;
  el.innerHTML = `
    <h3>造浪装置</h3>
    ${App.slider('tAmp', '幅度（推出平缓长波 → 破碎浪）', 0, 100, 1, Math.round(P.amp * 100), v => v + '')}
    ${App.slider('tFreq', '频率（改变浪的间距）', 0.5, 1.7, 0.01, P.freq, v => v.toFixed(2) + ' Hz')}
    <div class="btnrow"><button class="btn cool" id="tStart">开始造浪</button><button class="btn" id="tStop">停止造浪</button></div>
    <div class="sep"></div>
    <h3>小球密度（水 = 1.00）</h3>
    ${this.groups.map((g, i) => `<div class="row"><label><span><span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${g.css};margin-right:6px"></span>${g.name}</span><em id="tD${i}v">${g.dens.toFixed(2)}</em></label><input type="range" id="tD${i}" min="0.1" max="5" step="0.05" value="${g.dens}"></div>`).join('')}
    <div class="btnrow"><button class="btn cool" id="tRelease">再次释放小球</button></div>
    <div class="note">低于 1 的球上浮，等于 1 的球悬在水中，高于 1 的球下沉。波浪从造浪板长出，越往前越陡，遇到浅滩翻卷破碎成白水。左键拖动旋转，右键平移，滚轮缩放。</div>`;
  App.bindSlider('tAmp', v => v + '', v => { P.amp = v / 100; });
  App.bindSlider('tFreq', v => v.toFixed(2) + ' Hz', v => { P.freq = v; });
  $('#tStart').onclick = () => { App.audio && App.audio.unlock(); P.running = true; $('#tStart').classList.add('on'); $('#tStop').classList.remove('on'); };
  $('#tStop').onclick = () => { P.running = false; $('#tStop').classList.add('on'); $('#tStart').classList.remove('on'); };
  $('#tRelease').onclick = () => { App.audio && App.audio.unlock(); S.releaseBalls(); };
  this.groups.forEach((g, i) => App.bindSlider('tD' + i, v => v.toFixed(2), v => S.setGroupDensity(i, v)));
};
TankScene.prototype.statText = function () {
  const sim = this.sim;
  return `模拟时间 <b>${sim.time.toFixed(2)}</b> s　水粒子 <b>${(sim.np / 1000).toFixed(0)}k</b><br>造浪板 <b>${(sim.paddle.amp / WATER_CFG.ampMax * 100).toFixed(0)}%</b>　${sim.params.running ? '造浪中' : '已停止'}`;
};
