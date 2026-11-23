// 场景二：造浪水槽。水体为 MLS-MPM（WebGPU 计算着色器），球为刚体并与水耦合，画面用屏幕空间液面。
const TANK = {
  NX: 60, NY: 33, NZ: 21,          // 网格单元数（h = 1/60 米）
  H: 1 / 60,
  LX: 1.0, LY: 0.55, LZ: 0.35,     // 水槽内尺寸（米）
  WH: 0.30,                        // 初始水深
  K: 1e6,                          // 体积模量（声速约 32 m/s；更小的 K 会使水体下沉、压缩不稳定）
  RHO: 1000,
  DT: 1 / 9600,                    // 子步长（CFL 约 0.2），每 1/60 秒 160 步
  G: 9.8,
  BALL_R: 0.03,
  MAX_BALLS: 12,
  RAMP_X0: 0.66, RAMP_H: 0.2,      // 远端斜坡
  BAR: [0.42, 0.5, 0.07],          // 水下礁石（x0, x1, 高度）
  PADDLE_H: 0.5,
  PADDLE_X0: 0.03,                 // 造浪板静止位置
  GROUPS: [
    { d: 0.5, color: [1.0, 0.66, 0.2] },   // 低密度：橙
    { d: 0.85, color: [0.3, 0.9, 0.72] },  // 偏低：青绿
    { d: 1.0, color: [0.95, 0.95, 0.95] }, // 中性：白
    { d: 2.5, color: [0.92, 0.22, 0.28] }, // 高密度：红
  ],
  STEP_CAP: 256,                   // 每次提交的最大子步数（TP 动态偏移的条目数）
};

// 与 WGSL terrainH 相同的地形高度
function tankTerrainH(x, z) {
  const rx = clamp((x - TANK.RAMP_X0) / Math.max(TANK.LX - TANK.RAMP_X0, 1e-4), 0, 1);
  let h = rx * TANK.RAMP_H;
  if (x > TANK.BAR[0] && x < TANK.BAR[1]) h = Math.max(h, TANK.BAR[2]);
  return h;
}

class TankScene {
  constructor() {
    this.key = 'tank';
    this.title = '场景二：造浪水槽';
    this.stepsDone = 0;
    this.events = [];
    this.ready = false;
    this.wave = { on: false, amp: 0.05, ampT: 0.05, freq: 1.0, freqT: 1.0, env: 0, phase: 0 };
    this.densities = TANK.GROUPS.map((g) => g.d);
    this.ballCursor = 0;
    this.latestBalls = null;
    this.crackTotal = 0;
  }

  async init(width, height) {
    const dev = GPUX.device;
    const T = TANK;
    this.nP = 0;
    this.nodeCount = (T.NX + 1) * (T.NY + 1) * (T.NZ + 1);

    // ---- 粒子初始化：每个单元 8 个粒子，位于水深以下、地形以上 ----
    const pos = [];
    const h = T.H;
    for (let i = 1; i < T.NX - 1; i++) {
      for (let j = 0; j < Math.round(T.WH / h); j++) {
        for (let k = 1; k < T.NZ - 1; k++) {
          for (const ox of [0.25, 0.75]) for (const oy of [0.25, 0.75]) for (const oz of [0.25, 0.75]) {
            const x = (i + ox) * h, y = (j + oy) * h, z = (k + oz) * h;
            if (y < tankTerrainH(x, z) + 1.2 * h) continue;
            pos.push(x, y, z);
          }
        }
      }
    }
    this.nP = pos.length / 3;
    this.V0 = Math.pow(h, 3) / 8;
    this.mP = T.RHO * this.V0;
    this.initPos = Float32Array.from(pos);

    // ---- 缓冲区 ----
    this.partBuf = GPUX.storage(this.nP * 80, 'parts');
    this.gridAccBuf = GPUX.storage(this.nodeCount * 16, 'gridAcc');
    this.gridVBuf = GPUX.storage(this.nodeCount * 16, 'gridV');
    this.ballsBuf = GPUX.storage(T.MAX_BALLS * 96, 'balls');
    this.ballAccBuf = GPUX.storage(T.MAX_BALLS * 24, 'ballAcc');
    this.tpBuf = dev.createBuffer({ label: 'tp-dyn', size: T.STEP_CAP * 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.camBuf = GPUX.uniform(320, 'cam');
    this.tpStaticBuf = GPUX.uniform(256, 'tp-static');
    this.reader = null;

    // ---- 管线布局 ----
    const simMod = GPUX.shader(TankWGSL.common + TankWGSL.sim, 'tank-sim');
    const rMod = GPUX.shader(TankWGSL.common + TankWGSL.render, 'tank-render');
    const CS = GPUShaderStage.COMPUTE, VS = GPUShaderStage.VERTEX, FS = GPUShaderStage.FRAGMENT;
    this.simBGL = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: CS, buffer: { type: 'uniform', hasDynamicOffset: true } },
        { binding: 1, visibility: CS, buffer: { type: 'storage' } },
        { binding: 2, visibility: CS, buffer: { type: 'storage' } },
        { binding: 3, visibility: CS, buffer: { type: 'storage' } },
        { binding: 4, visibility: CS, buffer: { type: 'storage' } },
        { binding: 5, visibility: CS, buffer: { type: 'storage' } },
      ],
    });
    const simLayout = dev.createPipelineLayout({ bindGroupLayouts: [this.simBGL] });
    const mkc = (ep) => dev.createComputePipeline({ label: ep, layout: simLayout, compute: { module: simMod, entryPoint: ep } });
    this.pP2G = mkc('p2g');
    this.pGrid = mkc('gridUpdate');
    this.pBall = mkc('ballStep');
    this.pG2P = mkc('g2p');
    this.simBG = dev.createBindGroup({
      layout: this.simBGL,
      entries: [
        { binding: 0, resource: { buffer: this.tpBuf, size: 256 } },
        { binding: 1, resource: { buffer: this.partBuf } },
        { binding: 2, resource: { buffer: this.gridAccBuf } },
        { binding: 3, resource: { buffer: this.gridVBuf } },
        { binding: 4, resource: { buffer: this.ballsBuf } },
        { binding: 5, resource: { buffer: this.ballAccBuf } },
      ],
    });

    this.bgl0 = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: VS | FS, buffer: { type: 'uniform' } },
        { binding: 1, visibility: VS | FS, buffer: { type: 'uniform' } },
        { binding: 2, visibility: VS, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: VS | FS, buffer: { type: 'read-only-storage' } },
      ],
    });
    this.bgl1 = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 1, visibility: FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 2, visibility: FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 3, visibility: FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 4, visibility: FS, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    this.bgl2 = dev.createBindGroupLayout({
      entries: [{ binding: 0, visibility: FS, texture: { sampleType: 'unfilterable-float' } }],
    });
    const bglEmpty = dev.createBindGroupLayout({ entries: [] });
    const L0 = dev.createPipelineLayout({ bindGroupLayouts: [this.bgl0] });
    const Lcomp = dev.createPipelineLayout({ bindGroupLayouts: [this.bgl0, this.bgl1] });
    const Lblur = dev.createPipelineLayout({ bindGroupLayouts: [bglEmpty, bglEmpty, this.bgl2] });
    this.rg0 = dev.createBindGroup({
      layout: this.bgl0,
      entries: [
        { binding: 0, resource: { buffer: this.camBuf } },
        { binding: 1, resource: { buffer: this.tpStaticBuf, size: 256 } },
        { binding: 2, resource: { buffer: this.partBuf } },
        { binding: 3, resource: { buffer: this.ballsBuf } },
      ],
    });
    this.emptyBG = dev.createBindGroup({ layout: bglEmpty, entries: [] });

    // ---- 渲染资源（随窗口大小重建）----
    this.buildMeshes();
    const hdr = [{ format: 'rgba16float' }];
    const depthSt = { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' };
    const ballLayout = [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }];
    const staticLayout = [{ arrayStride: 36, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
      { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32x3' },
    ] }];
    const glassLayout = [{ arrayStride: 28, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
      { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32' },
    ] }];
    const alpha = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } };
    this.pWater = dev.createRenderPipeline({
      label: 'water-depth', layout: L0,
      vertex: { module: rMod, entryPoint: 'vsWater' },
      fragment: { module: rMod, entryPoint: 'fsWater', targets: [
        { format: 'r32float' },
        { format: 'r16float', blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } },
        { format: 'r16float', blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } },
      ] },
      primitive: { topology: 'triangle-list' },
      depthStencil: depthSt,
    });
    this.pOpaqueStatic = dev.createRenderPipeline({
      label: 'opaque-static', layout: L0,
      vertex: { module: rMod, entryPoint: 'vsStatic', buffers: staticLayout },
      fragment: { module: rMod, entryPoint: 'fsStatic', targets: [{ format: 'rgba16float' }, { format: 'r32float' }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthSt,
    });
    this.pPaddle = dev.createRenderPipeline({
      label: 'paddle', layout: L0,
      vertex: { module: rMod, entryPoint: 'vsPaddle', buffers: staticLayout },
      fragment: { module: rMod, entryPoint: 'fsStatic', targets: [{ format: 'rgba16float' }, { format: 'r32float' }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthSt,
    });
    this.pOpaqueBall = dev.createRenderPipeline({
      label: 'opaque-ball', layout: L0,
      vertex: { module: rMod, entryPoint: 'vsBall', buffers: ballLayout },
      fragment: { module: rMod, entryPoint: 'fsBall', targets: [{ format: 'rgba16float' }, { format: 'r32float' }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthSt,
    });
    this.pBlur = dev.createRenderPipeline({
      label: 'blur-h', layout: Lblur,
      vertex: { module: rMod, entryPoint: 'vsFull' },
      fragment: { module: rMod, entryPoint: 'fsBlurH', targets: [{ format: 'r32float' }] },
      primitive: { topology: 'triangle-list' },
    });
    this.pBlurV = dev.createRenderPipeline({
      label: 'blur-v', layout: Lblur,
      vertex: { module: rMod, entryPoint: 'vsFull' },
      fragment: { module: rMod, entryPoint: 'fsBlurV', targets: [{ format: 'r32float' }] },
      primitive: { topology: 'triangle-list' },
    });
    this.pComp = dev.createRenderPipeline({
      label: 'comp', layout: Lcomp,
      vertex: { module: rMod, entryPoint: 'vsFull' },
      fragment: { module: rMod, entryPoint: 'fsComp', targets: hdr },
      primitive: { topology: 'triangle-list' },
    });
    this.pGlass = dev.createRenderPipeline({
      label: 'glass', layout: L0,
      vertex: { module: rMod, entryPoint: 'vsGlass', buffers: glassLayout },
      fragment: { module: rMod, entryPoint: 'fsGlass', targets: [{ format: 'rgba16float', blend: alpha }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });

    this.paramsInit();
    this.resize(width, height);
    this.resetState();
    this.ready = true;
  }

  buildMeshes() {
    const dev = GPUX.device;
    const T = TANK;
    const mk = (mesh, label) => GPUX.meshBuffers(mesh, label);
    // 地面与水槽底座（不透明）
    this.floorM = mk(makeBoxMesh([-3, -0.3, -3], [3, 0, 3], [0.07, 0.075, 0.085]), 'floor');
    this.baseM = mk(makeBoxMesh([-0.04, -0.05, -0.03], [T.LX + 0.04, 0.0, T.LZ + 0.03], [0.1, 0.11, 0.12]), 'base');
    // 背景：棋盘格墙，折射时可以看见格子的弯曲
    this.backM = mk(this.gridWallMesh(-0.6, -0.4, 1.6, 1.2, -0.22, 40, 24), 'back');
    // 地形：斜坡与礁石
    this.terrainM = mk(this.terrainMesh(), 'terrain');
    // 造浪板：本地坐标在 x∈[-0.025,0]，运行时平移到 paddleX
    this.paddleM = mk(makeBoxMesh([-0.025, 0, 0], [0, T.PADDLE_H, T.LZ], [0.55, 0.57, 0.6]), 'paddle');
    // 球
    const sph = makeSphereMesh(20, 28);
    this.sphere = mk({ data: sph.pos, idx: sph.idx }, 'sphere');
    // 玻璃：四面板 + 边框（边框标记为 edge=1）
    this.glassM = mk(this.glassMesh(), 'glass');
  }

  // 竖直网格墙（每个格子交替颜色）
  gridWallMesh(x0, y0, x1, y1, z, nx, ny) {
    const out = [];
    const idx = [];
    const ca = [0.36, 0.42, 0.46], cb = [0.1, 0.12, 0.14];
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const xa = x0 + ((x1 - x0) * i) / nx, xb = x0 + ((x1 - x0) * (i + 1)) / nx;
        const ya = y0 + ((y1 - y0) * j) / ny, yb = y0 + ((y1 - y0) * (j + 1)) / ny;
        const c = (i + j) % 2 === 0 ? ca : cb;
        const base = out.length / 9;
        out.push(xa, ya, z, 0, 0, 1, c[0], c[1], c[2], xb, ya, z, 0, 0, 1, c[0], c[1], c[2], xb, yb, z, 0, 0, 1, c[0], c[1], c[2], xa, yb, z, 0, 0, 1, c[0], c[1], c[2]);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    return { data: new Float32Array(out), idx: new Uint32Array(idx) };
  }

  // 地形网格：高度场，顶点颜色为沙石色
  terrainMesh() {
    const T = TANK;
    const nx = 60, nz = 16;
    const out = [];
    const idx = [];
    const H = (x, z) => tankTerrainH(x, z);
    for (let i = 0; i <= nx; i++) {
      for (let k = 0; k <= nz; k++) {
        const x = (T.LX * i) / nx, z = (T.LZ * k) / nz;
        const y = H(x, z);
        const e = 0.002;
        const gx = (H(x + e, z) - H(x - e, z)) / (2 * e);
        const n = Vec3.norm([-gx, 1, 0]);
        const slope = clamp(y / Math.max(T.RAMP_H, 1e-3), 0, 1);
        const c = [0.42 + 0.1 * slope, 0.36 + 0.08 * slope, 0.26 + 0.05 * slope];
        out.push(x, y, z, n[0], n[1], n[2], c[0], c[1], c[2]);
      }
    }
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        const a = i * (nz + 1) + k, b = a + nz + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return { data: new Float32Array(out), idx: new Uint32Array(idx) };
  }

  // 玻璃：前、后、左、右四面板 + 十二条边框
  glassMesh() {
    const T = TANK;
    const out = [];
    const idx = [];
    const quad = (p, n, edge) => {
      const b = out.length / 7;
      for (const q of p) out.push(q[0], q[1], q[2], n[0], n[1], n[2], edge);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    const yT = T.LY;
    const panels = [
      [[[0, 0, T.LZ], [T.LX, 0, T.LZ], [T.LX, yT, T.LZ], [0, yT, T.LZ]], [0, 0, 1]],
      [[[0, 0, 0], [T.LX, 0, 0], [T.LX, yT, 0], [0, yT, 0]], [0, 0, -1]],
      [[[0, 0, 0], [0, 0, T.LZ], [0, yT, T.LZ], [0, yT, 0]], [-1, 0, 0]],
      [[[T.LX, 0, 0], [T.LX, 0, T.LZ], [T.LX, yT, T.LZ], [T.LX, yT, 0]], [1, 0, 0]],
    ];
    for (const [p, n] of panels) quad(p, n, 0);
    // 边框：每条棱用一个细长的方块表示
    const t = 0.006;
    const boxes = [];
    const addBox = (a, b) => boxes.push([a, b]);
    const corners = [[0, 0, 0], [T.LX, 0, 0], [T.LX, 0, T.LZ], [0, 0, T.LZ], [0, yT, 0], [T.LX, yT, 0], [T.LX, yT, T.LZ], [0, yT, T.LZ]];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [a, b] of edges) {
      const A = corners[a], B = corners[b];
      const lo = [Math.min(A[0], B[0]) - t, Math.min(A[1], B[1]) - t, Math.min(A[2], B[2]) - t];
      const hi = [Math.max(A[0], B[0]) + t, Math.max(A[1], B[1]) + t, Math.max(A[2], B[2]) + t];
      addBox(lo, hi);
    }
    for (const [lo, hi] of boxes) {
      const c = [[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [lo[0], hi[1], lo[2]]];
      const faces = [
        [[lo[0], lo[1], hi[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]], [0, 0, 1]],
        [[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [lo[0], hi[1], lo[2]], [0, 0, -1]],
        [[lo[0], lo[1], lo[2]], [lo[0], lo[1], hi[2]], [lo[0], hi[1], hi[2]], [lo[0], hi[1], lo[2]], [-1, 0, 0]],
        [[hi[0], lo[1], lo[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [hi[0], hi[1], lo[2]], [1, 0, 0]],
        [[lo[0], hi[1], lo[2]], [hi[0], hi[1], lo[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]], [0, 1, 0]],
        [[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], lo[1], hi[2]], [lo[0], lo[1], hi[2]], [0, -1, 0]],
      ];
      for (const f of faces) quad(f.slice(0, 4), f[4], 1);
    }
    return { data: new Float32Array(out), idx: new Uint32Array(idx) };
  }

  paramsInit() {
    this.tpStaticData = this.tpData(0, 0);
    GPUX.write(this.tpStaticBuf, this.tpStaticData);
  }

  // 参数块（128 字节）：paddleX 与 paddleV 按子步变化
  tpData(paddleX, paddleV) {
    const T = TANK;
    const buf = new ArrayBuffer(256);
    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);
    const h = T.H;
    f.set([T.DT, h, 1 / h, T.G], 0);
    f.set([T.K, this.mP || 0, this.V0 || 0, 0.02], 4);
    u.set([T.NX, T.NY, T.NZ, this.nP], 8);
    f.set([T.LX, T.LY, T.LZ, T.WH], 12);
    f.set([paddleX, paddleV, T.PADDLE_H, 0], 16);
    f.set([T.RAMP_X0, 0, T.RAMP_H, 0], 20);
    f.set([T.BAR[0], T.BAR[1], T.BAR[2], T.BALL_R], 24);
    u.set([T.MAX_BALLS, 0, 0, 0], 28);
    return new Uint8Array(buf);
  }

  resize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const w = this.width, h = this.height;
    for (const k of ['hdrTex', 'sceneDep', 'depthTex', 'wDep', 'wThk', 'blurA', 'blurB', 'compTex']) {
      if (this[k]) this[k].destroy();
    }
    const dev = GPUX.device;
    const mk = (fmt, usage) => dev.createTexture({ size: [w, h], format: fmt, usage });
    const RA = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    this.hdrTex = mk('rgba16float', RA);
    this.sceneDep = mk('r32float', RA);
    this.depthTex = mk('depth32float', GPUTextureUsage.RENDER_ATTACHMENT);
    this.wDep = mk('r32float', RA);
    this.wThk = mk('r16float', RA);
    this.foamTex = mk('r16float', RA);
    this.blurA = mk('r32float', RA);
    this.blurB = mk('r32float', RA);
    this.compTex = mk('rgba16float', RA);
    this.wDepthTex = dev.createTexture({ size: [w, h], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.bgComp = dev.createBindGroup({
      layout: this.bgl1,
      entries: [
        { binding: 0, resource: this.hdrTex.createView() },
        { binding: 1, resource: this.sceneDep.createView() },
        { binding: 2, resource: this.blurB.createView() },
        { binding: 3, resource: this.wThk.createView() },
        { binding: 4, resource: this.foamTex.createView() },
      ],
    });
    const bgOf = (tex) => dev.createBindGroup({ layout: this.bgl2, entries: [{ binding: 0, resource: tex.createView() }] });
    this.bgBlurW = bgOf(this.wDep);
    this.bgBlurA = bgOf(this.blurA);
    this.bgBlurB = bgOf(this.blurB);
  }

  // 灯光与阴影（水槽用一盏方向光，阴影暂不使用）
  lighting() {
    if (!this._light) {
      this._light = { dir: Vec3.norm([-0.35, 0.85, 0.4]), vp: Mat4.perspective(1, 1, 0.1, 10) };
    }
    return this._light;
  }

  resetState() {
    const T = TANK;
    // 粒子
    const data = new Float32Array(this.nP * 20);
    for (let p = 0; p < this.nP; p++) {
      data.set([this.initPos[p * 3], this.initPos[p * 3 + 1], this.initPos[p * 3 + 2], 1], p * 20);
    }
    // 交错写入：每个粒子 pos(4) vel(4) c0(4) c1(4) c2(4)，其余为零
    GPUX.write(this.partBuf, data);
    GPUX.zero(this.gridAccBuf);
    GPUX.zero(this.gridVBuf);
    GPUX.zero(this.ballAccBuf);
    const balls = new Float32Array(T.MAX_BALLS * 24);
    for (let b = 0; b < T.MAX_BALLS; b++) {
      balls.set([0, -50, 0, T.BALL_R, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0.5, 0.5, 2], b * 24);
    }
    GPUX.write(this.ballsBuf, balls);
    this.stepsDone = 0;
    this.events = [];
    this.ballCursor = 0;
    this.wave = { on: false, amp: this.wave.ampT, ampT: this.wave.ampT, freq: this.wave.freqT, freqT: this.wave.freqT, env: 0, phase: 0 };
    this.latestBalls = null;
  }

  // 释放一颗球（group 为 0..3，决定密度与颜色）
  spawnBall(group, x, z, h) {
    const T = TANK;
    const slot = this.ballCursor % T.MAX_BALLS;
    this.ballCursor++;
    const r = T.BALL_R;
    const d = this.densities[group];
    const vol = (4 / 3) * Math.PI * r * r * r;
    const m = d * T.RHO * vol;
    const col = T.GROUPS[group].color;
    const y = T.WH + (h !== undefined ? h : 0.25) + r;
    const data = new Float32Array(24);
    data.set([x, y, z, r], 0);
    data.set([0, 0, 0, m], 4);
    data.set([0, 0, 0, 1], 8);
    data.set([0, 0, 0, 1], 12);
    data.set([0, 0, 0, 0], 16);
    data.set([col[0], col[1], col[2], 2], 20);
    GPUX.write(this.ballsBuf, data, slot * 96);
    return slot;
  }

  // 释放一批：每组两颗
  spawnBatch(groups, spread) {
    const rng = Rng.make(7 + this.ballCursor * 13);
    for (const g of groups) {
      for (let n = 0; n < 2; n++) {
        const x = 0.2 + rng() * 0.6;
        const z = 0.08 + rng() * (TANK.LZ - 0.16);
        this.spawnBall(g, x, z, (spread || 0.25) + rng() * 0.1);
      }
    }
  }

  scheduleAt(simTime, fn) {
    const step = Math.round(simTime / TANK.DT);
    if (step <= this.stepsDone) {
      fn();
      return;
    }
    this.events.push({ step, fn });
    this.events.sort((a, b) => a.step - b.step);
  }

  simTime() {
    return this.stepsDone * TANK.DT;
  }

  // 造浪板的每步运动：包络、相位与位置/速度
  waveStep(w, dt) {
    const T = TANK;
    const target = w.on ? 1 : 0;
    const rate = w.on ? 1 / 1.5 : 1 / 2.5;
    w.env += clamp(target - w.env, -rate * dt, rate * dt);
    // 幅度与频率逐渐过渡，避免造浪板瞬间跳动
    w.amp += clamp(w.ampT - w.amp, -0.1 * dt, 0.1 * dt);
    w.freq += clamp(w.freqT - w.freq, -0.35 * dt, 0.35 * dt);
    w.phase += 2 * Math.PI * w.freq * dt;
    const amp = w.amp * w.env;
    const X0 = T.PADDLE_X0;
    const cs = Math.cos(w.phase);
    const x = X0 + (amp * (1 - cs)) / 2;
    const v = amp * Math.PI * w.freq * Math.sin(w.phase);
    w.lastX = x;
    return { x, v };
  }

  // 推进 n 个子步（编码到一个或多个提交中）
  encodeChunk(n) {
    const dev = GPUX.device;
    const T = TANK;
    const tp = new Uint8Array(T.STEP_CAP * 256);
    const w = this.wave;
    for (let i = 0; i < n; i++) {
      const s = this.waveStep(w, T.DT);
      tp.set(this.tpData(s.x, s.v), i * 256);
    }
    GPUX.write(this.tpBuf, tp.subarray(0, n * 256));
    const enc = dev.createCommandEncoder();
    const nPg = Math.ceil(this.nP / 64);
    const nGg = Math.ceil(this.nodeCount / 64);
    for (let i = 0; i < n; i++) {
      const off = i * 256;
      const pass = (pipe, count) => {
        const p = enc.beginComputePass();
        p.setPipeline(pipe);
        p.setBindGroup(0, this.simBG, [off]);
        p.dispatchWorkgroups(count);
        p.end();
      };
      pass(this.pP2G, nPg);
      pass(this.pGrid, nGg);
      pass(this.pBall, 1);
      pass(this.pG2P, nPg);
    }
    dev.queue.submit([enc.finish()]);
  }

  advanceTo(T) {
    const target = Math.round(T / TANK.DT);
    while (this.stepsDone < target) {
      let next = target;
      if (this.events.length && this.events[0].step < target) {
        next = Math.max(this.stepsDone, this.events[0].step);
      }
      let n = next - this.stepsDone;
      while (n > 0) {
        const chunk = Math.min(n, 40);
        this.encodeChunk(chunk);
        this.stepsDone += chunk;
        n -= chunk;
      }
      while (this.events.length && this.events[0].step <= this.stepsDone) {
        this.events.shift().fn();
      }
    }
  }

  // 渲染一帧：不透明物体 -> 液面粒子 -> 模糊 -> 合成 -> 玻璃。返回 HDR 结果纹理。
  renderFrame(enc, cam, lightDir, lightVP, time) {
    const T = TANK;
    const camArr = new Float32Array(80);
    const eye = cam.eye;
    const view = Mat4.lookAt(eye, cam.target, [0, 1, 0]);
    const proj = Mat4.perspective(cam.fovy, this.width / this.height, 0.02, 60);
    camArr.set(Mat4.mul(proj, view), 0);
    camArr.set(view, 16);
    camArr.set(proj, 32);
    camArr.set(lightVP || new Float32Array(16), 48);
    camArr.set([eye[0], eye[1], eye[2], 1], 64);
    camArr.set([lightDir[0], lightDir[1], lightDir[2], 0], 68);
    camArr.set([this.width, this.height, 1 / this.width, 1 / this.height], 72);
    camArr.set([time || 0, 0, 0, 0], 76);
    GPUX.write(this.camBuf, camArr);
    // 造浪板的当前位置（用于绘制）
    const pd = this.tpData(this.wave.lastX || T.PADDLE_X0, 0);
    GPUX.write(this.tpStaticBuf, pd);

    // 不透明物体
    {
      const pass = enc.beginRenderPass({
        colorAttachments: [
          { view: this.hdrTex.createView(), clearValue: { r: 0.02, g: 0.022, b: 0.026, a: 1 }, loadOp: 'clear', storeOp: 'store' },
          { view: this.sceneDep.createView(), clearValue: { r: 1e4, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
        ],
        depthStencilAttachment: { view: this.depthTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      pass.setBindGroup(0, this.rg0, []);
      pass.setPipeline(this.pOpaqueStatic);
      this.drawMesh(pass, this.backM);
      this.drawMesh(pass, this.floorM);
      this.drawMesh(pass, this.baseM);
      this.drawMesh(pass, this.terrainM);
      pass.setPipeline(this.pPaddle);
      this.drawMesh(pass, this.paddleM);
      pass.setPipeline(this.pOpaqueBall);
      pass.setVertexBuffer(0, this.sphere.vb);
      pass.setIndexBuffer(this.sphere.ib, 'uint32');
      pass.drawIndexed(this.sphere.n, T.MAX_BALLS);
      pass.end();
    }
    // 水体粒子深度与厚度
    {
      const pass = enc.beginRenderPass({
        colorAttachments: [
          { view: this.wDep.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
          { view: this.wThk.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
          { view: this.foamTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
        ],
        depthStencilAttachment: { view: this.wDepthTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      pass.setBindGroup(0, this.rg0, []);
      pass.setPipeline(this.pWater);
      pass.draw(6, this.nP);
      pass.end();
    }
    // 液面深度双边模糊：水平、竖直各一次，共两轮（结果在 blurB）
    const blurPass = (target, bg, pipe) => {
      const p = enc.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      p.setBindGroup(0, this.emptyBG);
      p.setBindGroup(1, this.emptyBG);
      p.setBindGroup(2, bg);
      p.setPipeline(pipe);
      p.draw(3);
      p.end();
    };
    blurPass(this.blurA, this.bgBlurW, this.pBlur);
    blurPass(this.blurB, this.bgBlurA, this.pBlurV);
    blurPass(this.blurA, this.bgBlurB, this.pBlur);
    blurPass(this.blurB, this.bgBlurA, this.pBlurV);
    // 合成：水体与背景
    {
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.compTex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      pass.setBindGroup(0, this.rg0, []);
      pass.setBindGroup(1, this.bgComp);
      pass.setPipeline(this.pComp);
      pass.draw(3);
      pass.end();
    }
    // 玻璃
    {
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.compTex.createView(), loadOp: 'load', storeOp: 'store' }] });
      pass.setBindGroup(0, this.rg0, []);
      pass.setPipeline(this.pGlass);
      pass.setVertexBuffer(0, this.glassM.vb);
      pass.setIndexBuffer(this.glassM.ib, 'uint32');
      pass.drawIndexed(this.glassM.n);
      pass.end();
    }
    return this.compTex;
  }

  drawMesh(pass, m) {
    pass.setVertexBuffer(0, m.vb);
    pass.setIndexBuffer(m.ib, 'uint32');
    pass.drawIndexed(m.n);
  }

  requestReadback(enc) {
    if (!this.reader) {
      this.reader = GPUX.makeReader(TANK.MAX_BALLS * 96, 'tank-balls');
    }
    if (this.reader.busy || this.reader.pending) return;
    enc.copyBufferToBuffer(this.ballsBuf, 0, this.reader.staging, 0, TANK.MAX_BALLS * 96);
    this.reader.pending = true;
  }

  pollReadback() {
    const r = this.reader;
    if (!r) return;
    if (r.pending && !r.busy) GPUX.readerFetch(r);
    if (r.data) {
      this.latestBalls = new Float32Array(r.data, 0, TANK.MAX_BALLS * 24).slice();
      r.data = null;
    }
  }
}
