/* FLIP 流体：CPU 侧管理（缓冲、管线、步进、球耦合力读回） */
'use strict';
const FL = {
  NX: 120, NY: 42, NZ: 40, H: 0.025,
  LX: 3.0, LY: 1.05, LZ: 1.0,
  WATER_DEPTH: 0.42,
  PPC: 4,
  ITERS: 60,
  particleCount: 0,
  ready: false,
  terrainH(x, z) {
    const bx = (x - 2.15) / 0.40;
    const ridge = 0.27 * Math.exp(-bx * bx);
    const zmod = 0.52 + 0.48 * smoothstep(0.12, 0.80, z);
    const bump2 = 0.05 * Math.exp(-Math.pow((x - 1.05) / 0.30, 2)) * Math.exp(-Math.pow((z - 0.72) / 0.28, 2));
    return ridge * zmod + bump2;
  },
  offsets() {
    const { NX, NY, NZ } = this;
    const CSIZE = NX * NY * NZ, USIZE = (NX + 1) * NY * NZ, VSIZE = NX * (NY + 1) * NZ, WSIZE = NX * NY * (NZ + 1);
    const OU = 0, OV = OU + USIZE, OW = OV + VSIZE, OUO = OW + WSIZE, OVO = OUO + USIZE, OWO = OVO + VSIZE;
    const OP = OWO + WSIZE, OR = OP + CSIZE, OZ = OR + CSIZE, OAP = OZ + CSIZE, OPV = OAP + CSIZE, ODIAG = OPV + CSIZE, OTYPE = ODIAG + CSIZE, OSCAL = OTYPE + CSIZE;
    const GRID_TOTAL = OSCAL + 16;
    const OUMM = 0, OUMV = OUMM + USIZE, OVMM = OUMV + USIZE, OVMV = OVMM + VSIZE, OWMM = OVMV + VSIZE, OWMV = OWMM + WSIZE, OCM = OWMV + WSIZE, ODOTS = OCM + CSIZE;
    const ATOM_TOTAL = ODOTS + 8;
    return { CSIZE, USIZE, VSIZE, WSIZE, GRID_TOTAL, ATOM_TOTAL };
  },
  init() {
    const dev = GFX.device;
    const off = this.offsets();
    this.off = off;
    this.gridBuf = GFX.buffer(off.GRID_TOTAL * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'fluid-grid');
    this.atomBuf = GFX.buffer(off.ATOM_TOTAL * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'fluid-atom');
    this.ballsBuf = GFX.storage(32 * 32, 'fluid-balls');
    this.bforceBuf = GFX.buffer(32 * 2 * 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, 'fluid-bforce');
    this.staging = GFX.buffer(32 * 2 * 16, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ, 'fluid-staging');
    this.paramsBuf = GFX.buffer(5 * 16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'fluid-params');
    this.surfTex = GFX.texture(this.NX, this.NZ, 'rgba16float', GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING, 'surf-info');
    this.forces = new Float32Array(64 * 4);
    const initData = this.makeParticles();
    this.particleCount = initData.length / 8;
    this.partBuf = GFX.buffer(initData.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'fluid-particles');
    GFX.device.queue.writeBuffer(this.partBuf, 0, initData);
    this.module = GFX.shader(FLUID_WGSL, 'fluid-module');
    const C = GPUShaderStage.COMPUTE;
    this.fluidBGLayout = dev.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'uniform' } },
      { binding: 1, visibility: C, buffer: { type: 'storage' } },
      { binding: 2, visibility: C, buffer: { type: 'storage' } },
      { binding: 3, visibility: C, buffer: { type: 'storage' } },
      { binding: 4, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 5, visibility: C, buffer: { type: 'storage' } },
      { binding: 6, visibility: C, storageTexture: { access: 'write-only', format: 'rgba16float' } }
    ] });
    this.fluidPipeLayout = dev.createPipelineLayout({ bindGroupLayouts: [this.fluidBGLayout] });
    const entries = ['clearAll', 'p2g', 'cellType', 'normU', 'normV', 'normW', 'divergence', 'spmv', 'updateX', 'updateP', 'scalarStep', 'gradU', 'gradV', 'gradW', 'extrapU', 'extrapV', 'extrapW', 'g2p', 'advect', 'ballForces', 'surfInfoK'];
    this.pipes = {}; this.bgs = {};
    const bgEntries = [
      { binding: 0, resource: { buffer: this.paramsBuf } },
      { binding: 1, resource: { buffer: this.gridBuf } },
      { binding: 2, resource: { buffer: this.atomBuf } },
      { binding: 3, resource: { buffer: this.partBuf } },
      { binding: 4, resource: { buffer: this.ballsBuf } },
      { binding: 5, resource: { buffer: this.bforceBuf } },
      { binding: 6, resource: this.surfTex.createView() }
    ];
    for (const e of entries) {
      const p = dev.createComputePipeline({ label: 'fluid-' + e, layout: this.fluidPipeLayout, compute: { module: this.module, entryPoint: e } });
      this.pipes[e] = p;
      this.bgs[e] = dev.createBindGroup({ layout: this.fluidBGLayout, entries: bgEntries });
    }
    this.ready = true;
  },
  makeParticles() {
    const { NX, NY, NZ, H } = this;
    const rng = makeRng(20260815);
    const pts = [];
    for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const cx = (i + 0.5) * H, cy = (j + 0.5) * H, cz = (k + 0.5) * H;
      if (cy >= this.WATER_DEPTH) continue;
      if (cy < this.terrainH(cx, cz) + 0.012) continue;
      if (cx < 0.175) continue;
      for (let s = 0; s < 8; s++) {
        if (s >= this.PPC) break;
        const sx = (s & 1) ? 0.75 : 0.25, sy = (s & 2) ? 0.75 : 0.25, sz = (s & 4) ? 0.75 : 0.25;
        const jx = (rng() - 0.5) * 0.24, jy = (rng() - 0.5) * 0.24, jz = (rng() - 0.5) * 0.24;
        pts.push((i + sx + jx) * H, (j + sy + jy) * H, (k + sz + jz) * H, 0, 0, 0, 0, 1);
      }
    }
    return new Float32Array(pts);
  },
  resetParticles() {
    const data = this.makeParticles();
    GFX.device.queue.writeBuffer(this.partBuf, 0, data);
  },
  uploadBalls(balls) {
    const arr = new Float32Array(32 * 8);
    for (let i = 0; i < balls.length && i < 32; i++) {
      const b = balls[i];
      arr[i * 8] = b.x; arr[i * 8 + 1] = b.y; arr[i * 8 + 2] = b.z; arr[i * 8 + 3] = b.r;
      arr[i * 8 + 4] = b.vx; arr[i * 8 + 5] = b.vy; arr[i * 8 + 6] = b.vz; arr[i * 8 + 7] = 0;
    }
    GFX.device.queue.writeBuffer(this.ballsBuf, 0, arr);
  },
  dispatch(pass, name, count) {
    pass.setPipeline(this.pipes[name]);
    pass.setBindGroup(0, this.bgs[name]);
    pass.dispatchWorkgroups(Math.ceil(count / 128));
  },
  /* 一步流体；state: {dt, gravity, flip, damp, extraDamp, paddleX, paddleV, paddleTop, time, balls, foamGain} */
  async step(s) {
    const dev = GFX.device;
    const p = new Float32Array(20);
    p[0] = s.dt; p[1] = s.gravity; p[2] = s.flip; p[3] = s.damp;
    p[4] = this.NX; p[5] = this.NY; p[6] = this.NZ; p[7] = this.H;
    p[8] = s.paddleX; p[9] = s.paddleV; p[10] = s.paddleTop; p[11] = s.time;
    p[12] = this.particleCount; p[13] = this.PPC * 1024; p[14] = 1; p[15] = s.extraDamp || 0;
    p[16] = this.WATER_DEPTH; p[17] = s.balls.length; p[18] = this.ITERS; p[19] = s.foamGain == null ? 2.6 : s.foamGain;
    dev.queue.writeBuffer(this.paramsBuf, 0, p);
    this.uploadBalls(s.balls);
    const off = this.off;
    const enc = dev.createCommandEncoder();
    const pass = enc.beginComputePass();
    this.dispatch(pass, 'clearAll', Math.max(off.GRID_TOTAL, off.ATOM_TOTAL));
    this.dispatch(pass, 'p2g', this.particleCount);
    this.dispatch(pass, 'cellType', off.CSIZE);
    this.dispatch(pass, 'normU', off.USIZE);
    this.dispatch(pass, 'normV', off.VSIZE);
    this.dispatch(pass, 'normW', off.WSIZE);
    this.dispatch(pass, 'divergence', off.CSIZE);
    pass.setPipeline(this.pipes.scalarStep); pass.setBindGroup(0, this.bgs.scalarStep); pass.dispatchWorkgroups(1);
    for (let it = 0; it < this.ITERS; it++) {
      this.dispatch(pass, 'spmv', off.CSIZE);
      this.dispatch(pass, 'updateX', off.CSIZE);
      this.dispatch(pass, 'updateP', off.CSIZE);
      pass.setPipeline(this.pipes.scalarStep); pass.setBindGroup(0, this.bgs.scalarStep); pass.dispatchWorkgroups(1);
    }
    this.dispatch(pass, 'gradU', off.USIZE);
    this.dispatch(pass, 'gradV', off.VSIZE);
    this.dispatch(pass, 'gradW', off.WSIZE);
    for (let e = 0; e < 3; e++) {
      this.dispatch(pass, 'extrapU', off.USIZE);
      this.dispatch(pass, 'extrapV', off.VSIZE);
      this.dispatch(pass, 'extrapW', off.WSIZE);
    }
    this.dispatch(pass, 'g2p', this.particleCount);
    this.dispatch(pass, 'advect', this.particleCount);
    pass.setPipeline(this.pipes.ballForces); pass.setBindGroup(0, this.bgs.ballForces);
    pass.dispatchWorkgroups(Math.max(1, Math.ceil(s.balls.length / 64)));
    this.dispatch(pass, 'surfInfoK', this.NX * this.NZ);
    pass.end();
    enc.copyBufferToBuffer(this.bforceBuf, 0, this.staging, 0, 32 * 2 * 16);
    dev.queue.submit([enc.finish()]);
    if (s.balls.length > 0) {
      await this.staging.mapAsync(GPUMapMode.READ);
      this.forces.set(new Float32Array(this.staging.getMappedRange()));
      this.staging.unmap();
    }
  }
};
window.FL = FL;
