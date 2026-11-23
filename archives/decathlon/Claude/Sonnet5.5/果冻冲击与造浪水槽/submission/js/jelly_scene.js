/* ===== jelly_scene.js : 场景一「重球冲击果冻」——渲染与场景逻辑 ===== */
'use strict';

const WGSL_JELLY = /* wgsl */`
struct JU { col: vec4f, p: vec4f };
@group(1) @binding(0) var<uniform> ju: JU;
@group(1) @binding(1) var sceneCopy: texture_2d<f32>;
@group(1) @binding(2) var sceneDepthT: texture_depth_2d;
@group(1) @binding(3) var backT: texture_2d<f32>;

struct VJ { @builtin(position) p: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) crack: f32, @location(3) vz: f32 };
@vertex fn vsJ(@location(0) pos: vec3f, @location(1) nor: vec3f, @location(2) crack: f32) -> VJ {
  var o: VJ;
  o.p = g.viewProj * vec4f(pos, 1.0);
  o.wp = pos; o.n = nor; o.crack = crack;
  o.vz = -(g.view * vec4f(pos, 1.0)).z;
  return o;
}
@fragment fn fsBackJ(i: VJ) -> @location(0) vec4f { return vec4f(i.vz, 0.0, 0.0, 1.0); }

// 光源视角：写入彩色透光阴影
@vertex fn vsJShadow(@location(0) pos: vec3f, @location(1) nor: vec3f, @location(2) crack: f32) -> @builtin(position) vec4f {
  return g.viewProj * vec4f(pos, 1.0);
}
@fragment fn fsJShadow() -> @location(0) vec4f {
  let c = ju.col.rgb;
  let tint = mix(vec3f(0.08), c, 0.8) * 0.9 + vec3f(0.06);
  return vec4f(tint, 1.0);
}

@fragment fn fsFrontJ(i: VJ, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var N = normalize(i.n);
  if (!ff) { N = -N; }
  let V = normalize(g.camPos.xyz - i.wp);
  let ipos = vec2i(i.p.xy);
  let uv = i.p.xy * g.screen.zw;
  let sceneZ = linDepth(textureLoad(sceneDepthT, ipos, 0));
  let backZ = textureLoad(backT, ipos, 0).x;
  let myZ = i.vz;
  let nv = max(dot(N, V), 0.0);
  let thick = max(min(backZ, sceneZ) - myZ, 0.0) / max(nv * 0.7 + 0.3, 0.3);
  let T = min(thick, 1.2);
  if (ju.p.z > 0.5 && ju.p.z < 1.5) { return vec4f(vec3f(T * 2.0), 1.0); }
  if (ju.p.z > 1.5 && ju.p.z < 2.5) { return vec4f(N * 0.5 + 0.5, 1.0); }
  if (ju.p.z > 2.5 && ju.p.z < 3.5) { return vec4f(vec3f(fract(backZ * 10.0), fract(sceneZ * 10.0), fract(myZ * 10.0)), 1.0); }
  if (ju.p.z > 3.5) { return vec4f(vec3f(fract((backZ - myZ) * 10.0)), 1.0); }
  let jcol = ju.col.rgb;
  let kAbs = ju.col.a;
  // 折射：沿折射方向走 T，再投影回屏幕取背景
  let rd = refract(-V, N, 1.0 / 1.34);
  let tp = i.wp + rd * min(T, 0.5) * 0.16;
  let cp = g.viewProj * vec4f(tp, 1.0);
  var uv2 = vec2f(cp.x / cp.w * 0.5 + 0.5, 0.5 - cp.y / cp.w * 0.5);
  uv2 = clamp(uv2, vec2f(0.001), vec2f(0.999));
  let d2 = linDepth(textureLoad(sceneDepthT, vec2i(uv2 * g.screen.xy), 0));
  if (d2 < myZ - 0.02) { uv2 = uv; }
  var bg = textureSampleLevel(sceneCopy, linSmp, uv2, 0.0).rgb;
  let sigma = (vec3f(1.0) - jcol) * kAbs + vec3f(0.35);
  let trans = exp(-sigma * T);
  var col = bg * trans;
  // 体内散射：厚处更饱和、被灯照亮
  let L = g.lightDir.xyz;
  let sh = shadowVis(i.wp, N);
  let wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
  let lightAmt = (0.35 + 0.65 * wrap) * (0.35 + 0.65 * sh);
  let sc = jcol * (1.0 - exp(-T * 4.0)) * lightAmt * ju.p.y * 1.25;
  col += sc;
  // 边缘轻微内发光（透光）
  col += jcol * pow(1.0 - nv, 2.0) * 0.16 * ju.p.y;
  // 反射与高光
  let R = reflect(-V, N);
  let rough = ju.p.x;
  let F = 0.03 + 0.97 * pow(1.0 - nv, 5.0);
  let env = envLight(R, rough);
  col = col * (1.0 - F * 0.9) + env * F * (0.55 + 0.45 * sh);
  let H = normalize(L + V);
  let a = max(rough * rough, 0.02);
  let nl = max(dot(N, L), 0.0);
  let spec = ggxD(max(dot(N, H), 0.0), a) * smithV(nv + 1e-3, nl + 1e-3, a) * nl * (0.04 + 0.96 * pow(1.0 - max(dot(V, H), 0.0), 5.0));
  col += vec3f(1.0, 0.97, 0.92) * spec * 3.6 * sh;
  // 裂口面：乳白色断面
  if (i.crack > 0.5) {
    col = mix(col, vec3f(1.0, 0.96, 0.92) * (0.35 + 0.65 * lightAmt) * mix(vec3f(1.0), jcol, 0.5), 0.45);
  }
  return vec4f(col, 1.0);
}
`;

const JELLY_PRESETS = {
  berry: { name: '红莓', color: [0.98, 0.14, 0.24], absorb: 15.0, kind: 'box', size: [0.19, 0.16, 0.19, 0.035], mu: 3200, tough: 1.95, bulk: 30 },
  lime: { name: '青柠', color: [0.40, 0.95, 0.16], absorb: 12.0, kind: 'pudding', size: [0.235, 0.175, 0.15, 0.035], mu: 9500, tough: 2.9, bulk: 30 },
  amber: { name: '琥珀', color: [1.0, 0.55, 0.06], absorb: 13.0, kind: 'cyl', size: [0.20, 0.14, 0.03], mu: 5500, tough: 2.25, bulk: 30 },
};

/* 不依赖 GPU 的场景逻辑：布置、冲击触发、推进（便于无界面数值调试） */
class JellyWorld {
  constructor() {
    this.name = 'jelly';
    this.dtPhys = 1 / 480;
    this.h = 0.046;
    this.sim = null;
    this.simTime = 0;
    this.accum = 0;
    this.params = { mass: 8, height: 0.8, kind: 0, target: 1 };
    this.jellyParams = { 0: { s: 28, t: 40 }, 1: { s: 62, t: 78 }, 2: { s: 46, t: 52 } };
    this.maxBalls = 10;
    this.ballIdCounter = 0;
    this.pending = [];            // 连续冲击的延时队列 { at, spawn }
    this.checkCounter = 0;
    this.layout = 'default';
    this.fractureCount = 0;
  }

  /* ---------- 场景布置 ---------- */
  reset(layout) {
    if (layout) this.layout = layout;
    this.sim = new JellySim(16000, 100000);
    const sim = this.sim, h = this.h;
    sim.table.x0 = -1.1; sim.table.x1 = 1.1; sim.table.z0 = -0.65; sim.table.z1 = 0.65;
    sim.maxSplitsPerCheck = this.splitK || 5;
    const L = this.layoutSpec(this.layout);
    this.bodyKeys = [];
    for (const j of L.jellies) {
      const P = JELLY_PRESETS[j.key];
      const jp = this.jellyParams[j.slot];
      const id = sim.addBody({ kind: P.kind, size: P.size, h, offset: j.pos, color: P.color, name: P.name, yaw: j.yaw || 0, mu: this.mapMu(jp.s), tough: this.mapTough(jp.t), bulk: P.bulk });
      sim.bodies[id].preset = P; sim.bodies[id].slot = j.slot; sim.bodies[id].key = j.key;
      this.bodyKeys.push(j.key);
    }
    sim.rebuildTopology();
    sim.refreshCompliance();
    this.presettle();
    this.simTime = 0; this.accum = 0; this.pending = [];
    this.ballIdCounter = 0;
    for (const b of L.balls || []) this.addBall(b);
    this.sim.events.length = 0;
    this.lastFrameBodies = null;
    this.fractureCount = 0;
  }
  presettle() {
    const s = this.sim, dt = this.dtPhys;
    s.fracOn = false;
    for (let i = 0; i < 320; i++) {
      s.substep(dt);
      for (let k = 0, n = s.n * 3; k < n; k++) s.Vl[k] *= 0.9;
    }
    s.Vl.fill(0); s.time = 0; s.fracOn = true; s.events.length = 0; s.stats.cuts = 0;
  }
  layoutSpec(name) {
    if (name === 'center') {
      return { jellies: [{ key: 'berry', slot: 0, pos: [-0.80, 0, 0.16], yaw: 0.35 }, { key: 'lime', slot: 1, pos: [0.02, 0, 0] }, { key: 'amber', slot: 2, pos: [0.82, 0, -0.10] }], balls: [] };
    }
    if (name === 'multi') {
      return { jellies: [{ key: 'berry', slot: 0, pos: [-0.82, 0, 0.12], yaw: 0.3 }, { key: 'amber', slot: 2, pos: [0.02, 0, 0] }, { key: 'lime', slot: 1, pos: [0.84, 0, -0.06] }], balls: [] };
    }
    if (name === 'offset') {
      return {
        jellies: [{ key: 'berry', slot: 0, pos: [-0.30, 0, 0.02], yaw: 0.2 }, { key: 'lime', slot: 1, pos: [-0.98, 0, -0.22] }, { key: 'amber', slot: 2, pos: [0.74, 0, 0.20] }],
        balls: [{ kind: 1, mass: 5, pos: [0.42, 0.2, 0.21], vel: [0, 0, 0] }]
      };
    }
    // 默认：三块果冻并排
    return { jellies: [{ key: 'berry', slot: 0, pos: [-0.62, 0, 0.05], yaw: 0.25 }, { key: 'lime', slot: 1, pos: [0.06, 0, 0] }, { key: 'amber', slot: 2, pos: [0.72, 0, -0.04] }], balls: [] };
  }
  mapMu(s) { return 1500 * Math.pow(22, s / 100); }
  mapTough(t) { return 1.55 + 2.0 * Math.pow(t / 100, 1.15); }
  ballRadius(mass, kind) {
    const rho = [7800, 2700, 8400][kind] || 7800;
    return Math.max(0.056, Math.cbrt(3 * mass / (4 * Math.PI * rho)));
  }
  addBall(o) {
    const kind = o.kind !== undefined ? o.kind : this.params.kind;
    const mass = o.mass !== undefined ? o.mass : this.params.mass;
    const r = o.r || this.ballRadius(mass, kind);
    const b = new RigidBall({ pos: o.pos, vel: o.vel, mass, r, kind, e: [0.38, 0.3, 0.34][kind], id: ++this.ballIdCounter, hold: o.hold, releaseAt: o.releaseAt });
    if (o.w) b.w = o.w.slice();
    this.sim.balls.push(b);
    const live = this.sim.balls.filter(x => x.active);
    if (live.length > this.maxBalls) { const old = live[0]; old.active = false; }
    return b;
  }

  /* 目标果冻的几何中心与高度 */
  jellyInfo(slot) {
    const sim = this.sim;
    const bi = sim.bodies.findIndex(b => b.slot === slot);
    if (bi < 0) return null;
    const b = sim.bodies[bi];
    let cx = 0, cz = 0, cnt = 0, top = -1e9;
    for (let v = 0; v < sim.n; v++) if (sim.Vbody[v] === bi && sim.isBnd[v]) {
      cx += sim.X[v * 3]; cz += sim.X[v * 3 + 2]; cnt++; top = Math.max(top, sim.X[v * 3 + 1]);
    }
    const R = Math.max(b.size[0], b.size[2] !== undefined && b.kind === 'box' ? b.size[2] : 0, b.kind === 'pudding' ? b.size[0] : 0);
    return { body: bi, cx: cx / Math.max(cnt, 1), cz: cz / Math.max(cnt, 1), top, radius: (b.kind === 'box' ? b.size[0] : b.size[0]) };
  }

  /* ---------- 三种冲击 ---------- */
  triggerCenter(opts = {}) {
    const ji = this.jellyInfo(opts.slot !== undefined ? opts.slot : this.params.target); if (!ji) return;
    const H = opts.height !== undefined ? opts.height : this.params.height;
    const m = opts.mass !== undefined ? opts.mass : this.params.mass;
    const kind = opts.kind !== undefined ? opts.kind : this.params.kind;
    const r = this.ballRadius(m, kind);
    this.addBall({ pos: [ji.cx, ji.top + r + H, ji.cz], mass: m, kind, vel: opts.vel || [0, 0, 0] });
  }
  triggerOffset(opts = {}) {
    const ji = this.jellyInfo(opts.slot !== undefined ? opts.slot : this.params.target); if (!ji) return;
    const H = opts.height !== undefined ? opts.height : this.params.height;
    const m = opts.mass !== undefined ? opts.mass : this.params.mass;
    const kind = opts.kind !== undefined ? opts.kind : this.params.kind;
    const r = this.ballRadius(m, kind);
    const side = opts.side || -1;
    const off = (opts.off !== undefined ? opts.off : 0.62) * ji.radius;
    const hv = opts.speed !== undefined ? opts.speed : 0.9;
    this.addBall({ pos: [ji.cx + side * off, ji.top + r + H, ji.cz + 0.04], mass: m, kind, vel: [-side * hv * 0.6, opts.vy || 0, 0] });
  }
  triggerMulti(opts = {}) {
    const ji = this.jellyInfo(opts.slot !== undefined ? opts.slot : this.params.target); if (!ji) return;
    const H = opts.height !== undefined ? opts.height : this.params.height * 0.7;
    const m = opts.mass !== undefined ? opts.mass : this.params.mass * 0.7;
    const kind = opts.kind !== undefined ? opts.kind : this.params.kind;
    const gaps = opts.gaps || [0, 0.34, 0.62, 0.86];
    const grow = opts.grow || 1.35;
    gaps.forEach((gp, i) => {
      const mm = m * Math.pow(grow, i), r = this.ballRadius(mm, kind);
      const hh = H * (1 + 0.18 * i);
      // 落到本次发射时刻 + gp 的位置
      this.pending.push({
        at: this.simTime + gp, spawn: () => {
          const ji2 = this.jellyInfo(opts.slot !== undefined ? opts.slot : this.params.target); if (!ji2) return;
          this.addBall({ pos: [ji2.cx + (i % 2 ? 0.03 : -0.02), ji2.top + r + hh, ji2.cz], mass: mm, kind: (kind + (i % 2)) % 3, vel: [0, -0.2, 0] });
        }
      });
    });
  }

  /* ---------- 参数应用 ---------- */
  applyJellyParams(slot) {
    const sim = this.sim, jp = this.jellyParams[slot];
    const bi = sim.bodies.findIndex(b => b.slot === slot); if (bi < 0) return;
    sim.setBodyMaterial(bi, this.mapMu(jp.s), sim.bodies[bi].lam / sim.bodies[bi].mu, this.mapTough(jp.t));
  }

  /* ---------- 推进 ---------- */
  stepFixed() {
    const sim = this.sim;
    for (let i = this.pending.length - 1; i >= 0; i--) if (this.simTime >= this.pending[i].at) { const p = this.pending.splice(i, 1)[0]; p.spawn(); }
    sim.substep(this.dtPhys);
    this.simTime += this.dtPhys;
    if ((++this.checkCounter | 0) % 4 === 0) { const c = sim.checkFracture(); if (c) this.fractureCount += c; }
  }
  stepN(n) { for (let i = 0; i < n; i++) this.stepFixed(); }
  stepTo(target) {
    let n = 0;
    while (this.simTime + this.dtPhys * 0.5 <= target && n < 4000) { this.stepFixed(); n++; }
  }
  advance(dt) {
    this.accum += dt;
    let n = 0; const maxN = this.maxStepsPerFrame || 24;
    while (this.accum >= this.dtPhys && n < maxN) { this.stepFixed(); this.accum -= this.dtPhys; n++; }
    if (this.accum > this.dtPhys * maxN) this.accum = 0;
  }
  drainEvents() { const e = this.sim.events.slice(); this.sim.events.length = 0; return e; }

}

class JellyScene extends JellyWorld {
  constructor(R, stage) {
    super();
    this.R = R; this.stage = stage; this.D = R.D;
    this.camDefault = { target: [0, 0.2, 0.0], dist: 2.75, yaw: 0.0, pitch: 0.42, fov: 36 * Math.PI / 180 };
    this.buildGPU();
    this.buildStage();
    this.reset();
  }

  /* ---------- GPU 资源 ---------- */
  buildGPU() {
    const D = this.D, R = this.R;
    this.mod = GPUX.module(WGSL_COMMON + WGSL_JELLY, 'jelly');
    this.jBGL = D.createBindGroupLayout({
      entries: [BL.u(0, SS.VERTEX | SS.FRAGMENT), BL.tex(1), BL.depth(2), BL.tex(3, SS.FRAGMENT, 'unfilterable-float')]
    });
    const pl = D.createPipelineLayout({ bindGroupLayouts: [R.frameBGL, this.jBGL] });
    const vb = [{ arrayStride: 32, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32' }] }];
    this.backPipe = D.createRenderPipeline({
      layout: pl, vertex: { module: this.mod, entryPoint: 'vsJ', buffers: vb },
      fragment: { module: this.mod, entryPoint: 'fsBackJ', targets: [{ format: 'r32float' }] },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
      primitive: { cullMode: 'front' },
    });
    this.frontPipe = D.createRenderPipeline({
      layout: pl, vertex: { module: this.mod, entryPoint: 'vsJ', buffers: vb },
      fragment: { module: this.mod, entryPoint: 'fsFrontJ', targets: [{ format: GPUX.hdr }] },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less' },
      primitive: { cullMode: 'back' },
    });
    this.shadowPipe = D.createRenderPipeline({
      layout: pl, vertex: { module: this.mod, entryPoint: 'vsJShadow', buffers: vb },
      fragment: { module: this.mod, entryPoint: 'fsJShadow', targets: [{ format: 'rgba8unorm' }] },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 3, depthBiasSlopeScale: 2 },
      primitive: { cullMode: 'none' },
    });
    this.maxFaces = 90000;
    this.vbuf = GPUX.buffer(this.maxFaces * 3 * 32, BU.VERTEX | BU.COPY_DST, 'jellyVB');
    this.vdata = null;
    this.ballBuf = GPUX.buffer(16 * BALL_B, BU.STORAGE | BU.COPY_DST, 'balls1');
    this.ballData = new Float32Array(16 * BALL_F);
    this.ballBG = this.stage.makeBallBG(this.ballBuf);
    this.ju = [];
    for (let i = 0; i < 4; i++) this.ju.push(GPUX.buffer(32, BU.UNIFORM | BU.COPY_DST, 'ju'));
    this.makeJBG();
    R.onResize = R.onResize || [];
    R.onResize.push(() => this.makeJBG());
  }
  makeJBG() {
    if (!this.dummyR32) this.dummyR32 = GPUX.tex(4, 4, 'r32float', TU.TEXTURE_BINDING, 'dummyR32');
    this.jbg = this.ju.map(u => this.D.createBindGroup({
      layout: this.jBGL, entries: [{ binding: 0, resource: { buffer: u } }, { binding: 1, resource: RT.copyView },
        { binding: 2, resource: RT.depth.createView({ aspect: 'depth-only' }) }, { binding: 3, resource: RT.backView }]
    }));
    // 背面/阴影通道：不读取 jBack，避免与渲染附件冲突
    this.jbgBack = this.ju.map(u => this.D.createBindGroup({
      layout: this.jBGL, entries: [{ binding: 0, resource: { buffer: u } }, { binding: 1, resource: RT.copyView },
        { binding: 2, resource: RT.depth.createView({ aspect: 'depth-only' }) }, { binding: 3, resource: this.dummyR32.createView() }]
    }));
  }

  buildStage() {
    const S = this.stage;
    this.meshes = [];
    const T = JellySim.prototype; // 仅为读取常量
    // 地面
    const ground = makeBoxMesh(80, 0.2, 80, 0);
    this.meshes.push(S.makeMesh(ground, { model: M4.trs([0, -0.28, 0], [1, 1, 1]), albedo: [0.030, 0.038, 0.048, 0.55], kind: 2, extra: [2.5, 9, 0, 0], shadow: false }));
    // 台面
    const slab = makeBoxMesh(2.44, 0.2, 1.54, 0);
    this.meshes.push(S.makeMesh(slab, { model: M4.trs([0, -0.1, 0], [1, 1, 1]), albedo: [0.46, 0.47, 0.50, 0.45], kind: 1 }));
    // 围栏
    const railX = makeBoxMesh(2.44, 0.06, 0.06, 0), railZ = makeBoxMesh(0.06, 0.06, 1.42, 0);
    const rc = [0.12, 0.14, 0.17, 0.3];
    this.meshes.push(S.makeMesh(railX, { model: M4.trs([0, 0.03, 0.68], [1, 1, 1]), albedo: rc, metal: 0.9, kind: 5 }));
    this.meshes.push(S.makeMesh(railX, { model: M4.trs([0, 0.03, -0.68], [1, 1, 1]), albedo: rc, metal: 0.9, kind: 5 }));
    this.meshes.push(S.makeMesh(railZ, { model: M4.trs([1.13, 0.03, 0], [1, 1, 1]), albedo: rc, metal: 0.9, kind: 5 }));
    this.meshes.push(S.makeMesh(railZ, { model: M4.trs([-1.13, 0.03, 0], [1, 1, 1]), albedo: rc, metal: 0.9, kind: 5 }));
  }

  /* ---------- 渲染网格 ---------- */
  buildRenderMesh() {
    const sim = this.sim, X = sim.X, Tv = sim.Tv, bf = sim.bfaces, nF = bf.length;
    const n = sim.n;
    if (!this.fn || this.fn.length < nF * 3) { this.fn = new Float32Array(nF * 3 + 3000); this.fcr = new Uint8Array(nF + 1000); this.fv = new Int32Array(nF * 3 + 3000); }
    if (!this.vnorm || this.vnorm.length < n * 3) this.vnorm = new Float32Array(sim.cap * 3);
    const fn = this.fn, fcr = this.fcr, fv = this.fv, vn = this.vnorm;
    const cnt = new Int32Array(n + 1);
    vn.fill(0, 0, n * 3);
    for (let k = 0; k < nF; k++) {
      const t = bf[k] >> 2, f = bf[k] & 3, F = TFACE[f];
      const a = Tv[t * 4 + F[0]], b = Tv[t * 4 + F[1]], c = Tv[t * 4 + F[2]];
      fv[k * 3] = a; fv[k * 3 + 1] = b; fv[k * 3 + 2] = c;
      cnt[a + 1]++; cnt[b + 1]++; cnt[c + 1]++;
      const ux = X[b * 3] - X[a * 3], uy = X[b * 3 + 1] - X[a * 3 + 1], uz = X[b * 3 + 2] - X[a * 3 + 2];
      const vx = X[c * 3] - X[a * 3], vy = X[c * 3 + 1] - X[a * 3 + 1], vz = X[c * 3 + 2] - X[a * 3 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      fn[k * 3] = nx; fn[k * 3 + 1] = ny; fn[k * 3 + 2] = nz;
      fcr[k] = sim.Crk[bf[k]];
      for (const q of [a, b, c]) { vn[q * 3] += nx; vn[q * 3 + 1] += ny; vn[q * 3 + 2] += nz; }
    }
    for (let i = 0; i < n; i++) {
      const l = Math.hypot(vn[i * 3], vn[i * 3 + 1], vn[i * 3 + 2]) || 1;
      vn[i * 3] /= l; vn[i * 3 + 1] /= l; vn[i * 3 + 2] /= l;
    }
    for (let i = 0; i < n; i++) cnt[i + 1] += cnt[i];
    const fill = cnt.slice(0, n), list = new Int32Array(nF * 3);
    for (let k = 0; k < nF; k++) for (let q = 0; q < 3; q++) list[fill[fv[k * 3 + q]]++] = k;
    const order = [];
    for (let bi = 0; bi < sim.bodies.length; bi++) order.push([]);
    for (let k = 0; k < nF; k++) order[sim.Tbody[bf[k] >> 2]].push(k);
    const need = nF * 4 * 3 * 8;
    if (!this.vdata || this.vdata.length < need) this.vdata = new Float32Array(Math.min(need + 24000, this.maxFaces * 3 * 8));
    const out = this.vdata; let o = 0; const ranges = [];
    const thr = 0.55;
    const P = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], MS = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const emit = (p, s, cr) => { out[o++] = p[0]; out[o++] = p[1]; out[o++] = p[2]; out[o++] = s[0]; out[o++] = s[1]; out[o++] = s[2]; out[o++] = cr; out[o++] = 0; };
    // 边的三次贝塞尔中点（PN 三角形，端点法线用顶点平均法线保证相邻面无缝）
    const edgeMid = (p0, n0, p1, n1, dst) => {
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
      const w01 = dx * n0[0] + dy * n0[1] + dz * n0[2], w10 = -(dx * n1[0] + dy * n1[1] + dz * n1[2]);
      // b_i = (2p0 + p1 - w01 n0)/3, b_j = (2p1 + p0 - w10 n1)/3 ; mid = (p0 + 3 b_i + 3 b_j + p1)/8
      for (let c = 0; c < 3; c++) {
        const bi = (2 * p0[c] + p1[c] - w01 * n0[c]) / 3, bj = (2 * p1[c] + p0[c] - w10 * n1[c]) / 3;
        dst[c] = (p0[c] + 3 * bi + 3 * bj + p1[c]) / 8;
      }
    };
    const GN = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let bi = 0; bi < order.length; bi++) {
      const start = o / 8;
      for (const k of order[bi]) {
        const nx = fn[k * 3], ny = fn[k * 3 + 1], nz = fn[k * 3 + 2];
        const nl = Math.hypot(nx, ny, nz) || 1;
        const fx = nx / nl, fy = ny / nl, fz = nz / nl;
        for (let q = 0; q < 3; q++) {
          const v = fv[k * 3 + q];
          P[q][0] = X[v * 3]; P[q][1] = X[v * 3 + 1]; P[q][2] = X[v * 3 + 2];
          GN[q][0] = vn[v * 3]; GN[q][1] = vn[v * 3 + 1]; GN[q][2] = vn[v * 3 + 2];
          let sx = 0, sy = 0, sz = 0;
          for (let p = cnt[v]; p < cnt[v + 1]; p++) {
            const g = list[p];
            if (fcr[g] !== fcr[k]) continue;
            const gx = fn[g * 3], gy = fn[g * 3 + 1], gz = fn[g * 3 + 2];
            const gl = Math.hypot(gx, gy, gz) || 1;
            if ((gx * fx + gy * fy + gz * fz) / gl > thr) { sx += gx; sy += gy; sz += gz; }
          }
          const sl = Math.hypot(sx, sy, sz) || 1;
          S[q][0] = sx / sl; S[q][1] = sy / sl; S[q][2] = sz / sl;
        }
        const cr = fcr[k];
        // 三条边的中点：0-1, 1-2, 2-0
        for (let e = 0; e < 3; e++) {
          const i0 = e, i1 = (e + 1) % 3;
          edgeMid(P[i0], GN[i0], P[i1], GN[i1], M[e]);
          const mx = S[i0][0] + S[i1][0], my = S[i0][1] + S[i1][1], mz = S[i0][2] + S[i1][2], ml = Math.hypot(mx, my, mz) || 1;
          MS[e][0] = mx / ml; MS[e][1] = my / ml; MS[e][2] = mz / ml;
        }
        emit(P[0], S[0], cr); emit(M[0], MS[0], cr); emit(M[2], MS[2], cr);
        emit(M[0], MS[0], cr); emit(P[1], S[1], cr); emit(M[1], MS[1], cr);
        emit(M[2], MS[2], cr); emit(M[1], MS[1], cr); emit(P[2], S[2], cr);
        emit(M[0], MS[0], cr); emit(M[1], MS[1], cr); emit(M[2], MS[2], cr);
      }
      ranges.push([start, o / 8 - start]);
    }
    this.D.queue.writeBuffer(this.vbuf, 0, out, 0, o);
    this.ranges = ranges;
  }
  uploadBalls() {
    const d = this.ballData, bs = this.sim.balls; let i = 0;
    for (const b of bs) {
      if (i >= 16) break;
      const o = i * BALL_F;
      d[o] = b.pos[0]; d[o + 1] = b.pos[1]; d[o + 2] = b.pos[2]; d[o + 3] = b.r;
      d[o + 4] = b.vel[0]; d[o + 5] = b.vel[1]; d[o + 6] = b.vel[2]; d[o + 7] = b.invM;
      d[o + 8] = b.w[0]; d[o + 9] = b.w[1]; d[o + 10] = b.w[2]; d[o + 11] = 0;
      d[o + 12] = b.q[0]; d[o + 13] = b.q[1]; d[o + 14] = b.q[2]; d[o + 15] = b.q[3];
      d[o + 16] = b.col[0]; d[o + 17] = b.col[1]; d[o + 18] = b.col[2]; d[o + 19] = b.kind;
      d[o + 20] = 0; d[o + 21] = 0; d[o + 22] = 0; d[o + 23] = b.active ? 0 : -1; d[o + 24] = d[o + 25] = d[o + 26] = d[o + 27] = 0;
      i++;
    }
    this.ballCount = i;
    this.D.queue.writeBuffer(this.ballBuf, 0, d, 0, Math.max(i, 1) * BALL_F);
  }

  /* ---------- 渲染 ---------- */
  setupView() {
    const R = this.R;
    R.sceneId = 0; R.lightTarget = [0, 0.15, 0]; R.lightRadius = 1.95; R.tankInfo = [1.1, 0.65, 0, 0];
    R.setCausticView(null);
  }
  render(enc) {
    const R = this.R, D = this.D, S = this.stage;
    this.buildRenderMesh();
    this.uploadBalls();
    R.updateGlobals(this.simTime);
    // 彩色阴影的 uniform
    const sim = this.sim;
    sim.bodies.forEach((b, i) => {
      const P = b.preset;
      D.queue.writeBuffer(this.ju[i], 0, new Float32Array([P.color[0], P.color[1], P.color[2], P.absorb, 0.22, 1.0, window.__JDBG || 0, 0]));
    });
    // ① 阴影：不透明物体
    {
      const p = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: R.shadowTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
      S.drawMeshes(p, this.meshes, true);
      S.drawBalls(p, this.ballBG, this.ballCount, true);
      p.end();
    }
    // ② 阴影：果冻的彩色透光
    {
      const p = enc.beginRenderPass({
        colorAttachments: [{ view: R.jShadowCol.createView(), loadOp: 'clear', clearValue: [1, 1, 1, 1], storeOp: 'store' }],
        depthStencilAttachment: { view: R.jShadowTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
      });
      p.setPipeline(this.shadowPipe); p.setBindGroup(0, R.frameBGShadow);
      p.setVertexBuffer(0, this.vbuf);
      sim.bodies.forEach((b, i) => { const r = this.ranges[i]; if (r[1] > 0) { p.setBindGroup(1, this.jbgBack[i]); p.draw(r[1], 1, r[0], 0); } });
      p.end();
    }
    // ③ 主场景：背景 + 台面 + 小球
    {
      const p = enc.beginRenderPass({
        colorAttachments: [{ view: RT.colorView, loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }],
        depthStencilAttachment: { view: RT.depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
      });
      S.drawBackdrop(p);
      S.drawMeshes(p, this.meshes, false);
      S.drawBalls(p, this.ballBG, this.ballCount, false);
      p.end();
    }
    // ④ 果冻（由远及近，逐个：背面厚度 → 复制场景 → 正面折射着色）
    const eye = R.view.eye;
    const idx = sim.bodies.map((b, i) => {
      let cx = 0, cy = 0, cz = 0, c = 0;
      for (let v = b.v0; v < Math.min(sim.n, b.v0 + 40); v += 3) { cx += sim.X[v * 3]; cy += sim.X[v * 3 + 1]; cz += sim.X[v * 3 + 2]; c++; }
      return { i, d: Math.hypot(cx / c - eye[0], cy / c - eye[1], cz / c - eye[2]) };
    }).sort((a, b) => b.d - a.d);
    for (const { i } of idx) {
      const r = this.ranges[i]; if (r[1] <= 0) continue;
      {
        const p = enc.beginRenderPass({
          colorAttachments: [{ view: RT.backView, loadOp: 'clear', clearValue: [1e6, 0, 0, 1], storeOp: 'store' }],
          depthStencilAttachment: { view: RT.backZView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' }
        });
        p.setPipeline(this.backPipe); p.setBindGroup(0, R.frameBG); p.setBindGroup(1, this.jbgBack[i]);
        p.setVertexBuffer(0, this.vbuf); p.draw(r[1], 1, r[0], 0); p.end();
      }
      enc.copyTextureToTexture({ texture: RT.color }, { texture: RT.copy }, [RT.w, RT.h]);
      {
        const p = enc.beginRenderPass({
          colorAttachments: [{ view: RT.colorView, loadOp: 'load', storeOp: 'store' }],
          depthStencilAttachment: { view: RT.depthView, depthReadOnly: true }
        });
        p.setPipeline(this.frontPipe); p.setBindGroup(0, R.frameBG); p.setBindGroup(1, this.jbg[i]);
        p.setVertexBuffer(0, this.vbuf); p.draw(r[1], 1, r[0], 0); p.end();
      }
    }
    R.finish(enc);
  }
}

JellyScene.prototype.statText = function () {
  const s = this.sim, v = s.volumes();
  const bi = s.bodies.findIndex(b => b.slot === this.params.target);
  let vr = '-';
  if (bi >= 0) { let v0 = 0; for (let t = s.bodies[bi].t0; t < s.m; t++) if (s.Tbody[t] === bi) v0 += s.Vol0[t]; vr = (v[bi] / v0 * 100).toFixed(1) + '%'; }
  return `模拟时间 <b>${this.simTime.toFixed(2)}</b> s　四面体 <b>${s.m}</b>　碎块 <b>${s.compCount}</b><br>最大拉伸 <b>${s.stats.maxStretch.toFixed(2)}</b>　目标体积 <b>${vr}</b>　开裂次数 <b>${this.fractureCount}</b>`;
};
JellyScene.prototype.rerun = function () { this.triggerCenter(); };


/* ---------- 预置演示（场景一）：布置与触发时序，均为模拟时间 ---------- */
const JELLY_DEMOS = {
  'jelly-center': {
    layout: 'center', slot: 1, jelly: { 1: { s: 66, t: 92 }, 0: { s: 30, t: 50 }, 2: { s: 48, t: 50 } },
    events: [{ at: 0.0, fn: w => w.triggerCenter({ slot: 1, mass: 9, kind: 0, height: 0.62, vel: [0, -1.4, 0] }) }],
  },
  'jelly-multi': {
    layout: 'multi', slot: 2, K: 8, jelly: { 2: { s: 42, t: 20 }, 0: { s: 30, t: 50 }, 1: { s: 62, t: 80 } },
    events: [
      { at: 0.0, fn: w => w.triggerCenter({ slot: 2, mass: 3.0, kind: 1, height: 0.30, vel: [0, -1.6, 0] }) },
      { at: 0.50, fn: w => w.triggerCenter({ slot: 2, mass: 5.0, kind: 0, height: 0.45, vel: [0.1, -1.4, 0] }) },
      { at: 0.98, fn: w => w.triggerCenter({ slot: 2, mass: 8.0, kind: 2, height: 0.65, vel: [-0.1, -1.4, 0] }) },
      { at: 1.45, fn: w => w.triggerCenter({ slot: 2, mass: 15.0, kind: 0, height: 1.0, vel: [0, -2.0, 0] }) },
    ],
  },
  'jelly-offset': {
    layout: 'offset', slot: 0, jelly: { 0: { s: 38, t: 100 }, 1: { s: 62, t: 90 }, 2: { s: 46, t: 90 } },
    events: [{ at: 0.0, fn: w => w.triggerOffset({ slot: 0, mass: 18, kind: 0, height: 0.18, off: 0.45, side: -1, speed: 2.0, vy: -1.0 }) }],
  },
};
