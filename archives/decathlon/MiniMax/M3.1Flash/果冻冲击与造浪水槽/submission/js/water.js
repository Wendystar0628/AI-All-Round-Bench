/* water.js — GPU MPM (APIC) liquid solver driver: buffers, compute pipelines,
   particle seeding, rigid balls, and the free-surface mesh extraction. */
(function (global) {
  'use strict';

  const PSTRIDE = 32;
  const BSTRIDE = 24;

  class WaterSim {
    constructor(device, renderer) {
      this.device = device; this.renderer = renderer;
      this.nx = 52; this.ny = 16; this.nz = 20;
      this.dx = 0.035;
      this.org = [0, 0, -0.35];
      this.L = this.nx * this.dx;
      this.W = this.nz * this.dx;
      this.H = this.ny * this.dx;
      this.waterLevel = 0.30;
      this.rho0 = 1000;
      this.bulkMod = 6.0e4;
      this.foamTau = 0.85;
      this.iso = 0.5;
      this.substeps = 6;
      this.dt = 1 / 360;
      this.time = 0;
      this.waveAmp = 0.055;
      this.waveFreq = 0.85;
      this.waveOn = 0;
      this.paddleBase = 0.10;
      this.gravity = -9.81;

      this.nnodes = this.nx * this.ny * this.nz;
      this.ncells = (this.nx - 1) * (this.ny - 1) * (this.nz - 1);

      this._buildParticles();
      this._buildBuffers();
      this._buildPipelines();

      this.maxQuads = 90000;
      this.waterMesh = renderer.createDynamicMesh('water', this.maxQuads * 6, 4);
      this.waterMesh.vbuf = device.createBuffer({
        size: this.maxQuads * 6 * 32,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      });
      this.waterMesh.count = 0;
      this.waterMesh.indirect = true;
    }

    terrainH(x, z) {
      const L = this.L;
      const t = Math.min(1, Math.max(0, x / L));
      let h = 0.120 + 0.055 * t + 0.090 * U_smoothstep(0.68, 1.0, t);
      const mx = (x - 0.35 * L) / 0.115;
      const mz = z / 0.105;
      h += 0.105 * Math.exp(-0.5 * (mx * mx + mz * mz));
      h -= 0.020 * Math.exp(-0.5 * (z / 0.115) * (z / 0.115));
      return h;
    }

    _buildParticles() {
      const { nx, ny, nz, dx, org } = this;
      const pos = [];
      const off = [-0.25, 0.25];
      for (let k = 0; k < nz; k++) {
        for (let j = 0; j < ny; j++) {
          for (let i = 0; i < nx; i++) {
            const cx = org[0] + (i + 0.5) * dx;
            const cy = org[1] + (j + 0.5) * dx;
            const cz = org[2] + (k + 0.5) * dx;
            if (cy > this.waterLevel) continue;
            if (cy < this.terrainH(cx, cz) + 0.012) continue;
            for (const oz of off) for (const oy of off) for (const ox of off) {
              pos.push(cx + ox * dx, cy + oy * dx, cz + oz * dx);
            }
          }
        }
      }
      this.numParticles = pos.length / 3;
      const data = new Float32Array(this.numParticles * PSTRIDE);
      const m = this.rho0 * dx * dx * dx / 8;
      for (let p = 0; p < this.numParticles; p++) {
        const b = p * PSTRIDE;
        data[b] = pos[p * 3]; data[b + 1] = pos[p * 3 + 1]; data[b + 2] = pos[p * 3 + 2];
        data[b + 6] = 0; data[b + 7] = 0; data[b + 8] = 0;
        data[b + 9] = 0; data[b + 10] = 0; data[b + 11] = 0;
        data[b + 12] = 0; data[b + 13] = 0; data[b + 14] = 0;
        data[b + 15] = 1; data[b + 16] = 0; data[b + 17] = 0;
        data[b + 18] = 0; data[b + 19] = 1; data[b + 20] = 0;
        data[b + 21] = 0; data[b + 22] = 0; data[b + 23] = 1;
        data[b + 24] = m;
        data[b + 25] = 0;
      }
      this.initialParticles = data;
    }

    _buildBuffers() {
      const d = this.device;
      const nn = this.nnodes;
      const U = Gpu.uniform(d, 96, 'simU');
      this.simU = U;

      this.pBuf = d.createBuffer({
        size: this.numParticles * PSTRIDE * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
      d.queue.writeBuffer(this.pBuf, 0, this.initialParticles);

      this.gMass = d.createBuffer({ size: nn * 4, usage: GPUBufferUsage.STORAGE });
      this.gMom = d.createBuffer({ size: nn * 12, usage: GPUBufferUsage.STORAGE });
      this.gForce = d.createBuffer({ size: nn * 12, usage: GPUBufferUsage.STORAGE });
      this.gFoamA = d.createBuffer({ size: nn * 4, usage: GPUBufferUsage.STORAGE });
      this.gVel = d.createBuffer({ size: nn * 12, usage: GPUBufferUsage.STORAGE });
      this.gRho = d.createBuffer({ size: nn * 4, usage: GPUBufferUsage.STORAGE });
      this.gFoam = d.createBuffer({ size: nn * 4, usage: GPUBufferUsage.STORAGE });
      this.gDiv = d.createBuffer({ size: nn * 4, usage: GPUBufferUsage.STORAGE });
      this.gSolid = d.createBuffer({ size: nn * 4, usage: GPUBufferUsage.STORAGE });

      // solid mask: 1 = tank floor / terrain, 2 = glass walls
      const solid = new Uint32Array(nn);
      for (let k = 0; k < this.nz; k++) {
        for (let j = 0; j < this.ny; j++) {
          for (let i = 0; i < this.nx; i++) {
            const id = i + this.nx * (j + this.ny * k);
            const x = this.org[0] + (i + 0.5) * this.dx;
            const y = this.org[1] + (j + 0.5) * this.dx;
            const z = this.org[2] + (k + 0.5) * this.dx;
            if (i === 0 || i === this.nx - 1 || k === 0 || k === this.nz - 1) {
              solid[id] = 2;
            } else if (y < this.terrainH(x, z)) {
              solid[id] = 1;
            } else {
              solid[id] = 0;
            }
          }
        }
      }
      d.queue.writeBuffer(this.gSolid, 0, solid);

      this.ballBuf = d.createBuffer({
        size: 64 * BSTRIDE * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
      this.numBalls = 0;

      // surface extraction buffers
      this.cellVert = d.createBuffer({ size: this.ncells * 8 * 4, usage: GPUBufferUsage.STORAGE });
      this.cellFlag = d.createBuffer({ size: this.ncells * 4, usage: GPUBufferUsage.STORAGE });
      this.wVerts = d.createBuffer({ size: this.maxQuads * 6 * 8 * 4, usage: GPUBufferUsage.STORAGE });
      this.vCount = d.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      this.indirect = d.createBuffer({
        size: 16,
        usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
    }

    _buildPipelines() {
      const d = this.device;
      const bgl0 = d.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
        ]
      });
      const bgl1 = d.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
        ]
      });
      const bgl2 = d.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }
        ]
      });
      const bgl3 = d.createBindGroupLayout({
        entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }]
      });
      this.bgl0 = bgl0; this.bgl1 = bgl1; this.bgl2 = bgl2; this.bgl3 = bgl3;

      const simMod = d.createShaderModule({ code: global.WGSL_SIM, label: 'sim' });
      const pl = d.createPipelineLayout({ bindGroupLayouts: [bgl0, bgl1, bgl2, bgl3] });
      const mk = (entry) => d.createComputePipeline({ layout: pl, compute: { module: simMod, entryPoint: entry } });
      this.pClear = mk('clearGrid');
      this.pP2G = mk('p2g');
      this.pGrid = mk('gridSolve');
      this.pDiv = mk('gridDiv');
      this.pG2P = mk('g2p');
      this.pBalls = mk('stepBalls');

      this.bg0 = d.createBindGroup({
        layout: bgl0,
        entries: [
          { binding: 0, resource: { buffer: this.simU } },
          { binding: 1, resource: { buffer: this.pBuf } }
        ]
      });
      this.bg1 = d.createBindGroup({
        layout: bgl1,
        entries: [
          { binding: 0, resource: { buffer: this.gMass } },
          { binding: 1, resource: { buffer: this.gMom } },
          { binding: 2, resource: { buffer: this.gForce } },
          { binding: 3, resource: { buffer: this.gFoamA } }
        ]
      });
      this.bg2 = d.createBindGroup({
        layout: bgl2,
        entries: [
          { binding: 0, resource: { buffer: this.gVel } },
          { binding: 1, resource: { buffer: this.gRho } },
          { binding: 2, resource: { buffer: this.gFoam } },
          { binding: 3, resource: { buffer: this.gDiv } },
          { binding: 4, resource: { buffer: this.gSolid } }
        ]
      });
      this.bg3 = d.createBindGroup({
        layout: bgl3,
        entries: [{ binding: 0, resource: { buffer: this.ballBuf } }]
      });

      // surface extraction
      const sbgl0 = d.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }
        ]
      });
      const sbgl1 = d.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
        ]
      });
      const surfMod = d.createShaderModule({ code: global.WGSL_SURFACE, label: 'surface' });
      const spl = d.createPipelineLayout({ bindGroupLayouts: [sbgl0, sbgl1] });
      const mkS = (entry) => d.createComputePipeline({ layout: spl, compute: { module: surfMod, entryPoint: entry } });
      this.pCell = mkS('cellVerts');
      this.pQX = mkS('quadsX');
      this.pQY = mkS('quadsY');
      this.pQZ = mkS('quadsZ');
      this.pIndirect = mkS('writeIndirect');

      this.sbg0 = d.createBindGroup({
        layout: sbgl0,
        entries: [
          { binding: 0, resource: { buffer: this.simU } },
          { binding: 1, resource: { buffer: this.gRho } },
          { binding: 2, resource: { buffer: this.gFoam } },
          { binding: 3, resource: { buffer: this.gVel } }
        ]
      });
      this.sbg1 = d.createBindGroup({
        layout: sbgl1,
        entries: [
          { binding: 0, resource: { buffer: this.cellVert } },
          { binding: 1, resource: { buffer: this.cellFlag } },
          { binding: 2, resource: { buffer: this.wVerts } },
          { binding: 3, resource: { buffer: this.vCount } },
          { binding: 4, resource: { buffer: this.indirect } }
        ]
      });
    }

    setBalls(list) {
      // list: [{pos:[x,y,z], r, density, color:[r,g,b]}]
      this.numBalls = list.length;
      const data = new Float32Array(64 * BSTRIDE);
      for (let i = 0; i < list.length; i++) {
        const b = i * BSTRIDE;
        const s = list[i];
        data[b] = s.pos[0]; data[b + 1] = s.pos[1]; data[b + 2] = s.pos[2];
        data[b + 6] = 0; data[b + 7] = 0; data[b + 8] = 0; data[b + 9] = 1;
        data[b + 13] = s.r;
        data[b + 14] = s.density;
        data[b + 15] = i;
        data[b + 16] = s.color[0]; data[b + 17] = s.color[1]; data[b + 18] = s.color[2];
      }
      this.device.queue.writeBuffer(this.ballBuf, 0, data);
    }

    reset() {
      this.device.queue.writeBuffer(this.pBuf, 0, this.initialParticles);
      this.time = 0;
    }

    _writeUniform(dt) {
      const a = new Float32Array(24);
      a[0] = this.nx; a[1] = this.ny; a[2] = this.nz; a[3] = this.dx;
      a[4] = this.org[0]; a[5] = this.org[1]; a[6] = this.org[2]; a[7] = 0;
      a[8] = dt; a[9] = this.gravity; a[10] = this.time; a[11] = this.waveAmp;
      a[12] = this.waveFreq; a[13] = this.paddleBase; a[14] = this.waveOn; a[15] = 0;
      a[16] = this.bulkMod; a[17] = this.iso; a[18] = this.numParticles; a[19] = this.numBalls;
      a[20] = this.waterLevel; a[21] = this.foamTau; a[22] = this.rho0; a[23] = 0;
      this.device.queue.writeBuffer(this.simU, 0, a);
    }

    /* advance one simulation step (fixed dt) */
    step(dt) {
      const d = this.device;
      this.time += dt;
      this._writeUniform(dt);
      const enc = d.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setBindGroup(0, this.bg0);
      pass.setBindGroup(1, this.bg1);
      pass.setBindGroup(2, this.bg2);
      pass.setBindGroup(3, this.bg3);
      pass.setPipeline(this.pClear);
      pass.dispatchWorkgroups(Math.ceil(this.nnodes / 64));
      pass.setPipeline(this.pP2G);
      pass.dispatchWorkgroups(Math.ceil(this.numParticles / 64));
      pass.setPipeline(this.pGrid);
      pass.dispatchWorkgroups(Math.ceil(this.nnodes / 64));
      pass.setPipeline(this.pDiv);
      pass.dispatchWorkgroups(Math.ceil(this.nnodes / 64));
      pass.setPipeline(this.pG2P);
      pass.dispatchWorkgroups(Math.ceil(this.numParticles / 64));
      pass.setPipeline(this.pBalls);
      pass.dispatchWorkgroups(1);
      pass.end();
      d.queue.submit([enc.finish()]);
    }

    /* rebuild the free surface mesh */
    updateSurface() {
      const d = this.device;
      d.queue.writeBuffer(this.vCount, 0, new Uint32Array([0]));
      const enc = d.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setBindGroup(0, this.sbg0);
      pass.setBindGroup(1, this.sbg1);
      pass.setPipeline(this.pCell);
      pass.dispatchWorkgroups(Math.ceil(this.ncells / 64));
      pass.setPipeline(this.pQX);
      pass.dispatchWorkgroups(Math.ceil((this.nx - 1) * this.ny * this.nz / 64));
      pass.setPipeline(this.pQY);
      pass.dispatchWorkgroups(Math.ceil(this.nx * (this.ny - 1) * this.nz / 64));
      pass.setPipeline(this.pQZ);
      pass.dispatchWorkgroups(Math.ceil(this.nx * this.ny * (this.nz - 1) / 64));
      pass.setPipeline(this.pIndirect);
      pass.dispatchWorkgroups(1);
      pass.end();
      d.queue.submit([enc.finish()]);
    }
  }

  function U_smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  global.WaterSim = WaterSim;
})(window);
