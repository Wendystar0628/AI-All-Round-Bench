// 场景一：重球冲击果冻。
// 仿真：四面体有限元 + 焊接断裂 + 刚球（全部在 WebGPU 计算着色器上运行）。
const JELLY_CELL = 0.012;               // 体素边长（米）
const JELLY_DT = 1e-4;                 // 子步长（秒）
const JELLY_RHO = 1000;                // 果冻密度
const JELLY_NU = 0.45;                 // 泊松比（近似不可压缩，体积基本不变）
const JELLY_MAX_BALLS = 6;
const JELLY_VISC = 5.0;                // 应变率粘度（Pa·s）
const BALL_STRIDE = 96;                // 每个球的状态 6 个 vec4
const JELLY_CRACK_IDX = 48;            // 裂纹计数在 ballAcc 中的下标（与着色器 CRACK_IDX 一致）
const TABLE_TOP = 0.5;
const TABLE_BOX = { min: [-0.55, 0, -0.42], max: [0.55, TABLE_TOP, 0.42] };
const STAGE_FLOOR = { min: [-3, -0.3, -3], max: [3, 0, 3] };

const JELLY_SHAPE_DEFS = [
  // 正中/连击用的主果冻：软，中等结实
  { id: 'cherry', kind: 'cyl', c: [0, TABLE_TOP + 0.007, 0], r: 0.12, h: 0.14, mat: 0, E: 2.2e4, S: 1.8e4 },
  // 右侧较硬的方块果冻：不易开裂，形状是方的
  { id: 'mint', kind: 'box', c: [-0.33, TABLE_TOP + 0.007, 0.05], size: [0.2, 0.14, 0.2], mat: 1, E: 3.5e4, S: 3.0e4 },
  // 小圆顶果冻：中等软硬
  { id: 'lemon', kind: 'dome', c: [0.33, TABLE_TOP + 0.007, -0.1], rad: [0.1, 0.1, 0.1], mat: 2, E: 3.5e4, S: 2.0e4 },
];

class JellyScene {
  constructor() {
    this.key = 'jelly';
    this.title = '场景一：重球冲击果冻';
    this.params = { soft: 0.6, firm: 0.5, mass: 3.0, height: 0.4, radius: 0.055, material: 'stone' };
    this.stepsDone = 0;
    this.events = [];
    this.ballCursor = 0;
    this.ready = false;
    this.latestBalls = null;
    this.crackTotal = 0;
    this.lastCrackReported = 0;
  }

  async init(width, height) {
    const dev = GPUX.device;
    const M = JellyMesh.build(JELLY_SHAPE_DEFS, JELLY_CELL);
    this.M = M;
    this.nT = M.nTets;
    this.nV = M.nVerts;
    this.nN = M.nNodes;
    this.groups = { shapes: M.shapes };

    // ---- 仿真缓冲区 ----
    this.vposBuf = GPUX.storage(this.nV * 16, 'vpos');
    this.vvelBuf = GPUX.storage(this.nV * 16, 'vvel');
    this.vforceBuf = GPUX.storage(this.nV * 16, 'vforce');
    this.vnodeBuf = GPUX.storageFrom(M.vnode, 'vnode');
    this.tetDinvBuf = GPUX.storageFrom(M.dinv, 'tetDinv');
    // 每个四面体 2 个 vec4（材料参数 + 焊接参数）
    this.tetParamBuf = GPUX.storage(this.nT * 32, 'tetPar');
    // 每个面 4 个 u32：邻居面编号（或 NONE）+ 3 个配对顶点
    const fi = new Uint32Array(this.nT * 16);
    for (let e = 0; e < this.nT * 4; e++) {
      fi[e * 4] = M.faceNbr[e];
      for (let k = 0; k < 3; k++) fi[e * 4 + 1 + k] = M.facePartner[e * 3 + k];
    }
    this.faceInfoBuf = GPUX.storageFrom(fi, 'faceInfo');
    this.faceBrokenBuf = GPUX.storage(this.nT * 16, 'faceBroken');
    this.faceStressBuf = GPUX.storage(this.nT * 16, 'faceStress');
    this.faceVisBuf = GPUX.storage(this.nT * 16, 'faceVis');
    this.ballsBuf = GPUX.storage(JELLY_MAX_BALLS * BALL_STRIDE, 'balls');
    // 球的冲量累加器（每球 6 个）+ 末尾的裂纹计数（CRACK_IDX = 48）
    this.ballAccBuf = GPUX.storage(64 * 4, 'ballAcc');
    this.nodeAccBuf = GPUX.storage(this.nN * 12, 'nodeAcc');
    this.nodeNrmBuf = GPUX.storage(this.nN * 16, 'nodeNrm');
    this.tetMatBuf = GPUX.storageFrom(M.tetMat, 'tetMat');
    this.paramBuf = GPUX.uniform(96, 'params');

    // ---- 渲染缓冲区 ----
    this.camBuf = GPUX.uniform(256, 'cam');
    this.camLightBuf = GPUX.uniform(256, 'camLight');
    this.buildMeshes();

    // ---- 管线 ----
    const simMod = GPUX.shader(JellyWGSL.common + JellyWGSL.sim, 'jelly-sim');
    const rMod = GPUX.shader(JellyWGSL.common + JellyWGSL.render, 'jelly-render');
    const sb = GPUShaderStage.COMPUTE;
    const simEntries = [];
    simEntries.push({ binding: 0, visibility: sb, buffer: { type: 'uniform' } });
    // 1..14 为 storage 缓冲区（阶段上限 16），其中只读的是 vnode、tetDinv、faceInfo
    const ro = [4, 5, 7];
    for (let b = 1; b <= 14; b++) {
      const type = ro.includes(b) ? 'read-only-storage' : 'storage';
      simEntries.push({ binding: b, visibility: sb, buffer: { type } });
    }
    this.simBGL = dev.createBindGroupLayout({ entries: simEntries });
    this.simLayout = dev.createPipelineLayout({ bindGroupLayouts: [this.simBGL] });
    const mk = (ep) => dev.createComputePipeline({ label: ep, layout: this.simLayout, compute: { module: simMod, entryPoint: ep } });
    this.pipeTet = mk('tetForce');
    this.pipeCrack = mk('faceCrack');
    this.pipeVert = mk('vertexStep');
    this.pipeBall = mk('ballStep');
    this.pipeNrmAcc = mk('nrmAccum');
    this.pipeNrmFin = mk('nrmFinal');

    this.simBG = dev.createBindGroup({
      layout: this.simBGL,
      entries: [
        { binding: 0, resource: { buffer: this.paramBuf } },
        { binding: 1, resource: { buffer: this.vposBuf } },
        { binding: 2, resource: { buffer: this.vvelBuf } },
        { binding: 3, resource: { buffer: this.vforceBuf } },
        { binding: 4, resource: { buffer: this.vnodeBuf } },
        { binding: 5, resource: { buffer: this.tetDinvBuf } },
        { binding: 6, resource: { buffer: this.tetParamBuf } },
        { binding: 7, resource: { buffer: this.faceInfoBuf } },
        { binding: 8, resource: { buffer: this.faceBrokenBuf } },
        { binding: 9, resource: { buffer: this.faceStressBuf } },
        { binding: 10, resource: { buffer: this.faceVisBuf } },
        { binding: 11, resource: { buffer: this.ballsBuf } },
        { binding: 12, resource: { buffer: this.ballAccBuf } },
        { binding: 13, resource: { buffer: this.nodeAccBuf } },
        { binding: 14, resource: { buffer: this.nodeNrmBuf } },
      ],
    });

    const vs = GPUShaderStage.VERTEX;
    const fs = GPUShaderStage.FRAGMENT;
    this.rBGL0 = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: vs | fs, buffer: { type: 'uniform' } },
        { binding: 1, visibility: vs | fs, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: vs | fs, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: vs | fs, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: vs | fs, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: vs | fs, buffer: { type: 'read-only-storage' } },
        { binding: 6, visibility: vs | fs, buffer: { type: 'read-only-storage' } },
      ],
    });
    this.rBGL1 =dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: fs, texture: { sampleType: 'depth' } },
        { binding: 1, visibility: fs, sampler: { type: 'comparison' } },
      ],
    });
    const rLayout0 = dev.createPipelineLayout({ bindGroupLayouts: [this.rBGL0] });
    const rLayout01 = dev.createPipelineLayout({ bindGroupLayouts: [this.rBGL0, this.rBGL1] });
    this.shadowSampler = dev.createSampler({ compare: 'less' });
    this.rBG0 = dev.createBindGroup({
      layout: this.rBGL0,
      entries: [
        { binding: 0, resource: { buffer: this.camBuf } },
        { binding: 1, resource: { buffer: this.vposBuf } },
        { binding: 2, resource: { buffer: this.vnodeBuf } },
        { binding: 3, resource: { buffer: this.faceVisBuf } },
        { binding: 4, resource: { buffer: this.nodeNrmBuf } },
        { binding: 5, resource: { buffer: this.tetMatBuf } },
        { binding: 6, resource: { buffer: this.ballsBuf } },
      ],
    });
    this.rBG0s = dev.createBindGroup({
      layout: this.rBGL0,
      entries: [
        { binding: 0, resource: { buffer: this.camLightBuf } },
        { binding: 1, resource: { buffer: this.vposBuf } },
        { binding: 2, resource: { buffer: this.vnodeBuf } },
        { binding: 3, resource: { buffer: this.faceVisBuf } },
        { binding: 4, resource: { buffer: this.nodeNrmBuf } },
        { binding: 5, resource: { buffer: this.tetMatBuf } },
        { binding: 6, resource: { buffer: this.ballsBuf } },
      ],
    });

    this.shadowSize = 2048;
    this.shadowTex = dev.createTexture({
      label: 'shadow',
      size: [this.shadowSize, this.shadowSize],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.rBG1 = dev.createBindGroup({
      layout: this.rBGL1,
      entries: [
        { binding: 0, resource: this.shadowTex.createView() },
        { binding: 1, resource: this.shadowSampler },
      ],
    });

    const vertBufLayout = (stride, attrs) => [{ arrayStride: stride, attributes: attrs }];
    const boxLayout = vertBufLayout(36, [
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
      { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32x3' },
    ]);
    const ballLayout = vertBufLayout(12, [{ shaderLocation: 0, offset: 0, format: 'float32x3' }]);
    const depthState = { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' };
    const shadowLayout = rLayout0;
    this.pShadowJelly = dev.createRenderPipeline({
      label: 'sh-jelly', layout: shadowLayout,
      vertex: { module: rMod, entryPoint: 'vsJelly' },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthState,
    });
    this.pShadowBall = dev.createRenderPipeline({
      label: 'sh-ball', layout: shadowLayout,
      vertex: { module: rMod, entryPoint: 'vsBall', buffers: ballLayout },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthState,
    });
    this.pShadowStatic = dev.createRenderPipeline({
      label: 'sh-static', layout: shadowLayout,
      vertex: { module: rMod, entryPoint: 'vsStatic', buffers: boxLayout },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthState,
    });
    const hdrTarget = [{ format: 'rgba16float' }];
    this.pJelly = dev.createRenderPipeline({
      label: 'jelly', layout: rLayout01,
      vertex: { module: rMod, entryPoint: 'vsJelly' },
      fragment: { module: rMod, entryPoint: 'fsJelly', targets: hdrTarget },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthState,
    });
    this.pBall = dev.createRenderPipeline({
      label: 'ball', layout: rLayout01,
      vertex: { module: rMod, entryPoint: 'vsBall', buffers: ballLayout },
      fragment: { module: rMod, entryPoint: 'fsBall', targets: hdrTarget },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthState,
    });
    this.pStatic = dev.createRenderPipeline({
      label: 'static', layout: rLayout01,
      vertex: { module: rMod, entryPoint: 'vsStatic', buffers: boxLayout },
      fragment: { module: rMod, entryPoint: 'fsStatic', targets: hdrTarget },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthState,
    });

    this.paramsStatic = {
      dt: JELLY_DT,
      gravity: 9.8,
      damping: Math.exp(-5.0 * JELLY_DT),
      vrad: JELLY_CELL * 0.5,
      restitution: 0.15,
      friction: 0.5,
      weldDamp: 0.4,
      ballRest: 0.4,
    };
    this.writeParams();
    this.resize(width, height);
    this.resetState();
    this.ready = true;
  }

  buildMeshes() {
    const dev = GPUX.device;
    const floor = makeBoxMesh(STAGE_FLOOR.min, STAGE_FLOOR.max, [0.085, 0.085, 0.095]);
    const table = makeBoxMesh(TABLE_BOX.min, TABLE_BOX.max, [0.62, 0.5, 0.4]);
    const sph = makeSphereMesh(24, 32);
    this.vertBuf = {
      floor: GPUX.meshBuffers(floor, 'floor'),
      table: GPUX.meshBuffers(table, 'table'),
    };
    this.sphere = GPUX.meshBuffers({ data: sph.pos, idx: sph.idx }, 'sphere');
  }

  resize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    if (this.hdrTex) this.hdrTex.destroy();
    if (this.depthTex) this.depthTex.destroy();
    this.hdrTex = GPUX.colorTarget(this.width, this.height, 'rgba16float', 'jelly-hdr');
    this.depthTex = GPUX.depthTarget(this.width, this.height, 'jelly-depth');
  }

  writeParams() {
    const p = this.paramsStatic;
    const buf = new ArrayBuffer(96);
    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);
    f[0] = p.dt;
    f[1] = p.gravity;
    f[2] = p.damping;
    f[3] = p.vrad;
    u[4] = this.nT;
    u[5] = this.nV;
    u[6] = JELLY_MAX_BALLS;
    u[7] = this.nN;
    f[8] = p.restitution;
    f[9] = p.friction;
    f[10] = p.weldDamp;
    f[11] = p.ballRest;
    f.set([TABLE_BOX.min[0], TABLE_BOX.min[1], TABLE_BOX.min[2], 0], 12);
    f.set([TABLE_BOX.max[0], TABLE_BOX.max[1], TABLE_BOX.max[2], 0], 16);
    GPUX.write(this.paramBuf, new Uint8Array(buf));
  }

  // 由 soft / firm 滑条得到的材料倍率
  materialMul() {
    return {
      E: Math.pow(2, (0.6 - this.params.soft) * 2),
      S: Math.pow(2, (this.params.firm - 0.5) * 2),
    };
  }

  // 软硬、结实程度变化时，更新每个四面体的材料参数（不改变网格）
  writeMaterials() {
    const M = this.M;
    const mul = this.materialMul();
    // 每个四面体两个 vec4：[V0, mu, lambda, 断裂应力] 与 [焊接刚度, E, 粘度, 外壳标记]
    const pa = new Float32Array(this.nT * 8);
    for (let t = 0; t < this.nT; t++) {
      const sh = M.shapes[M.tetShape[t]];
      const E = sh.E * mul.E;
      const nu = JELLY_NU;
      const mu = E / (2 * (1 + nu));
      const lam = (E * nu) / ((1 + nu) * (1 - 2 * nu));
      pa.set([M.V0[t], mu, lam, sh.S * mul.S], t * 8);
      // 焊接刚度取 2·E·边长；粘度取固定的 5 Pa·s（显式积分下粘性项过大会发散，故不随 E 放大）
      pa.set([2 * E * JELLY_CELL, E, JELLY_VISC, M.tetShell[t]], t * 8 + 4);
    }
    GPUX.write(this.tetParamBuf, pa);
  }

  // 回到初始状态：果冻静止在台面上，球全部隐藏
  resetState() {
    const M = this.M;
    const pos = new Float32Array(this.nV * 4);
    const mass = new Float32Array(this.nV);
    for (let t = 0; t < this.nT; t++) {
      const m = (JELLY_RHO * M.V0[t]) / 4;
      for (let k = 0; k < 4; k++) {
        const v = t * 4 + k;
        pos[v * 4] = M.rest[v * 3];
        pos[v * 4 + 1] = M.rest[v * 3 + 1];
        pos[v * 4 + 2] = M.rest[v * 3 + 2];
        pos[v * 4 + 3] = m;
      }
    }
    GPUX.write(this.vposBuf, pos);
    GPUX.zero(this.vvelBuf);
    GPUX.zero(this.vforceBuf);
    GPUX.zero(this.faceBrokenBuf);
    GPUX.zero(this.faceStressBuf);
    GPUX.zero(this.faceVisBuf);
    GPUX.zero(this.ballAccBuf);
    GPUX.zero(this.nodeAccBuf);
    GPUX.zero(this.nodeNrmBuf);
    this.writeMaterials();
    const balls = new Float32Array(JELLY_MAX_BALLS * 24);
    for (let b = 0; b < JELLY_MAX_BALLS; b++) {
      balls.set([0, -50, 0, 0.05, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0.5, 0.5, 1], b * 24);
    }
    GPUX.write(this.ballsBuf, balls);
    this.stepsDone = 0;
    this.events = [];
    this.ballCursor = 0;
    this.crackTotal = 0;
    this.lastCrackReported = 0;
    this.latestBalls = null;
    this.prevBallInfo = null;
  }

  // 清除台面上所有球（用于连击演示：每次新冲击前撤去上一颗已经停留的球）
  clearBalls() {
    const balls = new Float32Array(JELLY_MAX_BALLS * 24);
    for (let b = 0; b < JELLY_MAX_BALLS; b++) {
      balls.set([0, -50, 0, 0.05, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0.5, 0.5, 1], b * 24);
    }
    GPUX.write(this.ballsBuf, balls);
  }

  // 放下一颗球：h 为球底到台面的高度，vx/vz 为水平初速
  spawnBall(opt) {
    const slot = this.ballCursor % JELLY_MAX_BALLS;
    this.ballCursor++;
    const r = opt.radius !== undefined ? opt.radius : this.params.radius;
    const m = opt.mass !== undefined ? opt.mass : this.params.mass;
    const h = opt.h !== undefined ? opt.h : this.params.height;
    const mat = opt.material || this.params.material;
    const metal = mat === 'metal';
    const color = metal ? [0.86, 0.87, 0.9, 0] : [0.58, 0.53, 0.5, 1];
    const x = opt.x || 0;
    const z = opt.z || 0;
    const y = TABLE_TOP + h + r;
    const data = new Float32Array(24);
    data.set([x, y, z, r], 0);
    data.set([opt.vx || 0, opt.vy || 0, opt.vz || 0, m], 4);
    data.set([0, 0, 0, 1], 8);
    data.set([0, 0, 0, 1], 12);
    data.set([0, 0, 0, 0], 16);
    data.set(color, 20);
    GPUX.write(this.ballsBuf, data, slot * BALL_STRIDE);
    return slot;
  }

  // 在指定模拟时刻执行事件（时刻量化到子步）
  scheduleAt(simTime, fn) {
    const step = Math.round(simTime / JELLY_DT);
    if (step <= this.stepsDone) {
      fn();
      return;
    }
    this.events.push({ step, fn });
    this.events.sort((a, b) => a.step - b.step);
  }

  simTime() {
    return this.stepsDone * JELLY_DT;
  }

  encodeSteps(enc, n) {
    const dev = GPUX.device;
    const dt = (pipe, count) => {
      const p = enc.beginComputePass();
      p.setPipeline(pipe);
      p.setBindGroup(0, this.simBG);
      p.dispatchWorkgroups(count);
      p.end();
    };
    const nTetGroups = Math.ceil(this.nT / 64);
    const nFaceGroups = Math.ceil((this.nT * 4) / 64);
    const nVertGroups = Math.ceil(this.nV / 64);
    for (let i = 0; i < n; i++) {
      dt(this.pipeTet, nTetGroups);
      dt(this.pipeCrack, nFaceGroups);
      dt(this.pipeVert, nVertGroups);
      dt(this.pipeBall, 1);
    }
  }

  // 推进到模拟时刻 T（秒）。事件在对应子步边界处执行。
  advanceTo(T) {
    const dev = GPUX.device;
    const target = Math.round(T / JELLY_DT);
    while (this.stepsDone < target) {
      let next = target;
      if (this.events.length && this.events[0].step < target) {
        next = Math.max(this.stepsDone, this.events[0].step);
      }
      let n = next - this.stepsDone;
      while (n > 0) {
        const chunk = Math.min(n, 300);
        const enc = dev.createCommandEncoder();
        this.encodeSteps(enc, chunk);
        dev.queue.submit([enc.finish()]);
        this.stepsDone += chunk;
        n -= chunk;
      }
      while (this.events.length && this.events[0].step <= this.stepsDone) {
        const ev = this.events.shift();
        ev.fn();
      }
    }
  }

  // 更新法向、阴影和主画面，并把 HDR 结果留在 hdrTex 中
  renderFrame(enc, cam, lightDir, lightVP, time) {
    const dev = GPUX.device;
    // 法向：节点法向由可见面累加
    {
      const p = enc.beginComputePass();
      p.setBindGroup(0, this.simBG);
      p.setPipeline(this.pipeNrmAcc);
      p.dispatchWorkgroups(Math.ceil(this.nT / 64));
      p.setPipeline(this.pipeNrmFin);
      p.dispatchWorkgroups(Math.ceil(this.nN / 64));
      p.end();
    }
    const camArr = new Float32Array(64);
    CamPack.build(camArr, cam.eye, cam.target, cam.fovy, this.width / this.height, lightDir, lightVP, this.width, this.height, time);
    GPUX.write(this.camBuf, camArr);
    // 光源视角的深度（用于阴影）：把 viewProj 换成 lightVP
    const lightArr = new Float32Array(64);
    lightArr.set(lightVP, 0);
    GPUX.write(this.camLightBuf, lightArr);

    // 阴影
    {
      const pass = enc.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: this.shadowTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      pass.setBindGroup(0, this.rBG0s);
      pass.setPipeline(this.pShadowStatic);
      pass.setVertexBuffer(0, this.vertBuf.table.vb);
      pass.setIndexBuffer(this.vertBuf.table.ib, 'uint32');
      pass.drawIndexed(this.vertBuf.table.n);
      pass.setPipeline(this.pShadowJelly);
      pass.draw(this.nT * 12);
      pass.setPipeline(this.pShadowBall);
      pass.setVertexBuffer(0, this.sphere.vb);
      pass.setIndexBuffer(this.sphere.ib, 'uint32');
      pass.drawIndexed(this.sphere.n, JELLY_MAX_BALLS);
      pass.end();
    }

    // 主画面
    {
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: this.hdrTex.createView(), clearValue: { r: 0.03, g: 0.03, b: 0.035, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
        depthStencilAttachment: { view: this.depthTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      pass.setBindGroup(0, this.rBG0);
      pass.setBindGroup(1, this.rBG1);
      pass.setPipeline(this.pStatic);
      pass.setVertexBuffer(0, this.vertBuf.floor.vb);
      pass.setIndexBuffer(this.vertBuf.floor.ib, 'uint32');
      pass.drawIndexed(this.vertBuf.floor.n);
      pass.setVertexBuffer(0, this.vertBuf.table.vb);
      pass.setIndexBuffer(this.vertBuf.table.ib, 'uint32');
      pass.drawIndexed(this.vertBuf.table.n);
      pass.setPipeline(this.pBall);
      pass.setVertexBuffer(0, this.sphere.vb);
      pass.setIndexBuffer(this.sphere.ib, 'uint32');
      pass.drawIndexed(this.sphere.n, JELLY_MAX_BALLS);
      pass.setPipeline(this.pJelly);
      pass.draw(this.nT * 12);
      pass.end();
    }
    return this.hdrTex;
  }

  // 异步回读球状态与裂纹计数（用于声音）
  requestReadback(enc) {
    if (!this.reader) {
      this.reader = GPUX.makeReader(JELLY_MAX_BALLS * BALL_STRIDE + 16, 'jelly-state');
    }
    if (this.reader.busy || this.reader.pending) return;
    enc.copyBufferToBuffer(this.ballsBuf, 0, this.reader.staging, 0, JELLY_MAX_BALLS * BALL_STRIDE);
    enc.copyBufferToBuffer(this.ballAccBuf, JELLY_CRACK_IDX * 4, this.reader.staging, JELLY_MAX_BALLS * BALL_STRIDE, 4);
    this.reader.pending = true;
  }

  pollReadback() {
    const r = this.reader;
    if (!r) return;
    if (r.pending && !r.busy) {
      GPUX.readerFetch(r);
    }
    if (r.data) {
      const f = new Float32Array(r.data, 0, JELLY_MAX_BALLS * 24);
      const u = new Uint32Array(r.data, JELLY_MAX_BALLS * BALL_STRIDE, 1);
      this.latestBalls = f.slice();
      this.crackTotal = u[0];
      r.data = null;
    }
  }
}
