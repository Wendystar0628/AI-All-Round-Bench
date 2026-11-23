// js/scene2-sim.js — Scene 2 WebGPU 3D APIC/FLIP Compute Orchestrator & Multi-Density Sphere Controller
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const { clamp, createRNG } = App.Math;
  const { GRID_COMPUTE_WGSL, PARTICLE_AND_COUPLING_WGSL } = App.Scene2WGSL;

  const NX = 104;
  const NY = 40;
  const NZ = 32;
  const CELL_H = 0.0625;
  const TANK_L = NX * CELL_H; // 6.5
  const TANK_H = NY * CELL_H; // 2.5
  const TANK_W = NZ * CELL_H; // 2.0
  const MAX_PARTICLES = 262144;
  const MAX_DIFFUSE = 65536;
  const N_SPHERES = 28;
  const CAUST_W = 208;
  const CAUST_H = 64;

  // Exact JS mirror of WGSL terrainHeight(x, z) for initial particle seeding & terrain mesh generation
  function terrainHeightJS(x, z) {
    const smoothstep = (e0, e1, v) => {
      const t = clamp((v - e0) / (e1 - e0), 0, 1);
      return t * t * (3 - 2 * t);
    };
    const dx1 = (x - 3.88) / 1.08;
    const dz1 = (z - 0.46) / 0.78;
    const ridge1 = 0.64 * Math.exp(-(dx1 * dx1 * 1.15 + dz1 * dz1 * 1.05));

    const dxA = (x - 3.55) / 0.95;
    const dzA = (z - 1.05) / 0.68;
    const apron = 0.14 * Math.exp(-(dxA * dxA + dzA * dzA));

    const dx2 = (x - 4.78) / 0.52;
    const dz2 = (z - 1.50) / 0.42;
    const mound2 = 0.32 * Math.exp(-(dx2 * dx2 + dz2 * dz2));

    const endSlope = 0.08 * smoothstep(5.4, 6.45, x);
    const leftMask = smoothstep(1.85, 2.55, x);
    return (ridge1 + apron + mound2 + endSlope) * leftMask;
  }

  class Scene2Sim {
    constructor(gpuCore) {
      this.gpu = gpuCore;
      this.device = gpuCore.device;

      this.NX = NX; this.NY = NY; this.NZ = NZ;
      this.TANK_L = TANK_L; this.TANK_H = TANK_H; this.TANK_W = TANK_W;
      this.CELL_H = CELL_H;
      this.N_SPHERES = N_SPHERES;
      this.MAX_DIFFUSE = MAX_DIFFUSE;
      this.CAUST_W = CAUST_W;
      this.CAUST_H = CAUST_H;

      this.particleCount = 0;
      this.sphereActiveCount = N_SPHERES;
      this.simTime = 0;
      this.frameSeed = 1;

      // Wavemaker state
      this.waveRunning = false;
      this.wavePhase = 0;
      this.waveEnvelope = 0;
      this.paddleBaseX = 0.48;
      this.paddleX = this.paddleBaseX;
      this.paddleVel = 0;
      this.calmTimer = 0;

      // User-adjustable parameters (Section 4.2)
      this.params = {
        waveAmplitude: 0.34,              // 0.06 (gentle swell) .. 0.44 (steep plunging breaker)
        waveFrequency: 0.62,              // 0.35 .. 1.35 Hz (0.55-0.68 Hz = ideal long shoaling breaker!)
        groupDensities: [0.35, 0.72, 1.00, 2.40] // Low, Light-Buoyant, Neutral, High
      };

      this._telemetryBusy = false;
      this._telemetryFrameSkip = 0;

      this._createBuffers();
      this._createPipelines();
      this.reset({ dropBallsImmediately: true });
    }

    _createBuffers() {
      const dev = this.device;
      const cellN = NX * NY * NZ;         // 133120
      const uN = (NX + 1) * NY * NZ;      // 134400
      const vN = NX * (NY + 1) * NZ;      // 136448
      const wN = NX * NY * (NZ + 1);      // 137280

      const mkBuf = (bytes, usage) => dev.createBuffer({
        size: Math.max(16, bytes),
        usage: usage || (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST)
      });

      this.simUniformBuf = dev.createBuffer({
        size: 128,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      this.simUniformF32 = new Float32Array(32);
      this.simUniformU32 = new Uint32Array(this.simUniformF32.buffer);

      this.particleBuf = mkBuf(MAX_PARTICLES * 32);
      this.diffuseBuf = mkBuf(MAX_DIFFUSE * 32);
      this.sphereBuf = mkBuf(N_SPHERES * 64);
      this.countersBuf = mkBuf(16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC);
      this.countersReadBuf = dev.createBuffer({
        size: 16,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
      });

      // Packed MAC grid buffers (keeps total storage buffers per compute stage <= 9!)
      this.atomicTotal = 2 * (uN + vN + wN) + cellN; // 949376
      this.atomicGridBuf = mkBuf(this.atomicTotal * 4);
      this.velGridBuf = mkBuf(2 * (uN + vN + wN) * 4);
      this.scalarGridBuf = mkBuf(3 * cellN * 4);
      this.cellTypeBuf = mkBuf(cellN * 4);

      this.surfHeightBuf = mkBuf(NX * NZ * 4);
      this.causticAccumBuf = mkBuf(CAUST_W * CAUST_H * 4);
      this.causticOutBuf = mkBuf(CAUST_W * CAUST_H * 4);

      this._zeroDiffuse = new Float32Array(MAX_DIFFUSE * 8);
      this._zeroScalars = new Float32Array(3 * cellN);
    }

    _createPipelines() {
      const dev = this.device;

      // --- Module A: Grid & Poisson Solver (only 6 storage buffers in 1 BindGroup!) ---
      const gridMod = dev.createShaderModule({ code: GRID_COMPUTE_WGSL });
      const bglA = dev.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
        ]
      });
      const plA = dev.createPipelineLayout({ bindGroupLayouts: [bglA] });
      const mkPipeA = (entry) => dev.createComputePipeline({
        layout: plA,
        compute: { module: gridMod, entryPoint: entry }
      });

      this.pipeClearGrid = mkPipeA('clearGrid');
      this.pipeP2G = mkPipeA('p2g');
      this.pipeNormClassify = mkPipeA('normalizeAndClassify');
      this.pipeForcesBounds = mkPipeA('applyForcesAndBoundaries');
      this.pipeDivergence = mkPipeA('computeDivergence');
      this.pipeSORRed = mkPipeA('pressureSOR_Red');
      this.pipeSORBlack = mkPipeA('pressureSOR_Black');
      this.pipeSubPressure = mkPipeA('subtractPressure');
      this.pipeExtrapAir = mkPipeA('extrapolateAirFaces');

      this.bgA = dev.createBindGroup({
        layout: bglA,
        entries: [
          { binding: 0, resource: { buffer: this.simUniformBuf } },
          { binding: 1, resource: { buffer: this.particleBuf } },
          { binding: 2, resource: { buffer: this.sphereBuf } },
          { binding: 3, resource: { buffer: this.atomicGridBuf } },
          { binding: 4, resource: { buffer: this.velGridBuf } },
          { binding: 5, resource: { buffer: this.scalarGridBuf } },
          { binding: 6, resource: { buffer: this.cellTypeBuf } }
        ]
      });

      // --- Module B: G2P, Advect, Diffuse, Spheres, Caustics (9 storage buffers across 2 groups) ---
      const partMod = dev.createShaderModule({ code: PARTICLE_AND_COUPLING_WGSL });
      const bglB0 = dev.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }
        ]
      });
      const bglB1 = dev.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
        ]
      });
      const plB = dev.createPipelineLayout({ bindGroupLayouts: [bglB0, bglB1] });
      const mkPipeB = (entry) => dev.createComputePipeline({
        layout: plB,
        compute: { module: partMod, entryPoint: entry }
      });

      this.pipeG2P = mkPipeB('g2pAndAdvect');
      this.pipeDiffuse = mkPipeB('stepDiffuse');
      this.pipeSpheres = mkPipeB('stepSpheres');
      this.pipeClearCaustics = mkPipeB('clearCaustics');
      this.pipeSurfHeight = mkPipeB('extractSurfaceHeight');
      this.pipeTraceCaustics = mkPipeB('traceCausticRays');
      this.pipeBlurCaustics = mkPipeB('blurCaustics');

      this.bgB0 = dev.createBindGroup({
        layout: bglB0,
        entries: [
          { binding: 0, resource: { buffer: this.simUniformBuf } },
          { binding: 1, resource: { buffer: this.particleBuf } },
          { binding: 2, resource: { buffer: this.diffuseBuf } },
          { binding: 3, resource: { buffer: this.sphereBuf } },
          { binding: 4, resource: { buffer: this.countersBuf } },
          { binding: 5, resource: { buffer: this.velGridBuf } },
          { binding: 6, resource: { buffer: this.scalarGridBuf } }
        ]
      });
      this.bgB1 = dev.createBindGroup({
        layout: bglB1,
        entries: [
          { binding: 0, resource: { buffer: this.surfHeightBuf } },
          { binding: 1, resource: { buffer: this.causticAccumBuf } },
          { binding: 2, resource: { buffer: this.causticOutBuf } }
        ]
      });
    }

    reset(opts) {
      opts = opts || {};
      this.simTime = 0;
      this.frameSeed = 1;
      this.waveRunning = !!opts.waveRunning;
      this.wavePhase = 0;
      this.waveEnvelope = 0;
      this.paddleBaseX = 0.50;
      this.paddleX = this.paddleBaseX;
      this.paddleVel = 0;
      this.calmTimer = 0;

      // Seed ~225,000 water particles cleanly at ~6 particles per fluid cell!
      const rng = createRNG(20261119);
      const pData = new Float32Array(MAX_PARTICLES * 8);
      const waterTop = 0.98;
      let count = 0;

      // 6 stratified jittered sub-cell offsets per cell
      const subOffsets = [
        [0.25, 0.25, 0.25], [0.75, 0.25, 0.75],
        [0.25, 0.55, 0.75], [0.75, 0.55, 0.25],
        [0.35, 0.85, 0.35], [0.70, 0.85, 0.70]
      ];

      for (let iz = 1; iz < NZ - 1; iz++) {
        for (let ix = 8; ix < NX - 1; ix++) {
          const cx = (ix + 0.5) * CELL_H;
          const cz = (iz + 0.5) * CELL_H;
          if (cx < this.paddleBaseX + 0.02) continue;
          const th = terrainHeightJS(cx, cz) + CELL_H;
          for (let iy = 1; iy < NY - 1; iy++) {
            const cy = (iy + 0.5) * CELL_H;
            if (cy < th || cy > waterTop) continue;
            for (let s = 0; s < 6; s++) {
              if (count >= MAX_PARTICLES) break;
              const ox = (subOffsets[s][0] + (rng() - 0.5) * 0.24) * CELL_H;
              const oy = (subOffsets[s][1] + (rng() - 0.5) * 0.20) * CELL_H;
              const oz = (subOffsets[s][2] + (rng() - 0.5) * 0.24) * CELL_H;
              const px = ix * CELL_H + ox;
              const py = iy * CELL_H + oy;
              const pz = iz * CELL_H + oz;
              if (py < terrainHeightJS(px, pz) + CELL_H * 1.04 || py > waterTop) continue;
              const o = count * 8;
              pData[o] = px; pData[o + 1] = py; pData[o + 2] = pz; pData[o + 3] = 0.0;
              pData[o + 4] = 0.0; pData[o + 5] = 0.0; pData[o + 6] = 0.0; pData[o + 7] = 1.0;
              count++;
            }
          }
        }
      }
      this.particleCount = count;
      this.device.queue.writeBuffer(this.particleBuf, 0, pData.subarray(0, count * 8));
      this.device.queue.writeBuffer(this.diffuseBuf, 0, this._zeroDiffuse);
      this.device.queue.writeBuffer(this.scalarGridBuf, 0, this._zeroScalars);
      this.device.queue.writeBuffer(this.countersBuf, 0, new Uint32Array([0, 0, 0, 0]));

      this.dropSpheres(opts.dropMode || 'staggered');

      // Run 1 calm initialization pass to populate cellDensity + smooth initial caustics at frame 0!
      this._dispatchInitialCaustics();
    }

    // Release all 28 multi-density same-size rigid spheres from above the water surface!
    dropSpheres(mode) {
      const rng = createRNG(mode === 'demo' ? 88421 : (41203 + Math.floor(this.simTime * 100)));
      const sData = new Float32Array(N_SPHERES * 16);
      const R = 0.14; // Exact same radius for all 4 density groups!

      // Place 28 spheres (7 per density group) across x = 1.25..5.45, z = 0.36..1.64
      // Staggered heights just above water (1.26 .. 2.22) with downward entry velocity so splashes start IMMEDIATELY!
      const positions = [];
      for (let i = 0; i < N_SPHERES; i++) {
        const grp = i % 4; // Interleaved groups across the tank length so every camera view shows all 4 colors!
        const rank = Math.floor(i / 4); // 0..6 along tank length

        let x, y, z, vy;
        if (mode === 'demo') {
          // Staggered dramatic drop from well above water: heavy spheres plunge fast -> big splash crowns, rebound jets & bubbles!
          const colX = 1.35 + rank * 0.62 + (grp - 1.5) * 0.14 + (rng() - 0.5) * 0.14;
          const rowZ = 0.42 + ((grp * 0.38 + (rank % 2) * 0.42 + rng() * 0.25) % 1.18);
          const baseH = 1.34 + (i % 5) * 0.22 + (grp >= 2 ? 0.14 : 0.0) + rng() * 0.12;
          x = clamp(colX, 1.15, 5.65);
          z = clamp(rowZ, 0.34, 1.66);
          y = baseH;
          vy = -3.4 - (grp === 3 ? 3.25 : grp === 2 ? 2.25 : grp === 1 ? 1.10 : 0.65) - rng() * 0.6;
        } else {
          // Interactive re-drop
          const colX = 1.30 + rank * 0.64 + (rng() - 0.5) * 0.28;
          const rowZ = 0.36 + rng() * 1.28;
          x = clamp(colX, 1.12, 5.75);
          z = clamp(rowZ, 0.32, 1.68);
          y = 1.58 + (i % 4) * 0.24 + rng() * 0.26;
          vy = -2.6 - (grp === 3 ? 3.0 : grp === 2 ? 2.0 : 0.8) - rng() * 0.5;
        }

        // Prevent initial overlap among spheres
        for (let tries = 0; tries < 10; tries++) {
          let ok = true;
          for (const p of positions) {
            if (Math.hypot(x - p[0], y - p[1], z - p[2]) < R * 2.35) {
              ok = false;
              y += 0.26;
              break;
            }
          }
          if (ok) break;
        }
        positions.push([x, y, z]);

        const o = i * 16;
        sData[o + 0] = x; sData[o + 1] = y; sData[o + 2] = z; sData[o + 3] = R;
        sData[o + 4] = (rng() - 0.5) * 0.25;
        sData[o + 5] = vy;
        sData[o + 6] = (rng() - 0.5) * 0.25;
        sData[o + 7] = grp;
        // Random clean initial orientation quaternion
        const a1 = rng() * Math.PI * 2, a2 = rng() * Math.PI;
        sData[o + 8] = Math.sin(a2) * Math.cos(a1) * 0.5;
        sData[o + 9] = Math.sin(a2) * Math.sin(a1) * 0.5;
        sData[o + 10] = Math.cos(a2) * 0.5;
        sData[o + 11] = 0.866;
        const ql = Math.hypot(sData[o + 8], sData[o + 9], sData[o + 10], sData[o + 11]);
        sData[o + 8] /= ql; sData[o + 9] /= ql; sData[o + 10] /= ql; sData[o + 11] /= ql;
        sData[o + 12] = (rng() - 0.5) * 1.5;
        sData[o + 13] = (rng() - 0.5) * 1.5;
        sData[o + 14] = (rng() - 0.5) * 1.5;
        sData[o + 15] = 0.0; // prev submerged fraction = 0 (airborne!)
      }

      this.sphereActiveCount = N_SPHERES;
      this.device.queue.writeBuffer(this.sphereBuf, 0, sData);
    }

    setWaveRunning(flag) {
      this.waveRunning = !!flag;
      if (this.waveRunning) this.calmTimer = 0;
    }

    _writeSimUniform(subDt) {
      const f = this.simUniformF32;
      const u = this.simUniformU32;
      const isActive = this.waveRunning || this.waveEnvelope > 0.02;

      f[0] = subDt;
      f[1] = this.paddleX;
      f[2] = this.paddleVel;
      // High FLIP ratio (0.975) for full-flume energetic wave propagation, plunging reef breakers & towering far-wall run-up!
      f[3] = isActive ? 0.975 : (this.calmTimer > 0.45 ? 0.87 : 0.945);
      f[4] = 5.85;
      f[5] = 0.42;
      f[6] = isActive ? 1.0 : 0.0;
      u[7] = this.frameSeed >>> 0;
      u[8] = this.particleCount >>> 0;
      u[9] = 0;
      f[10] = 1.83;
      f[11] = isActive ? 0.0001 : clamp(0.0035 + this.calmTimer * 0.010, 0.0035, 0.035);

      f[12] = this.params.groupDensities[0];
      f[13] = this.params.groupDensities[1];
      f[14] = this.params.groupDensities[2];
      f[15] = this.params.groupDensities[3];
      u[16] = this.sphereActiveCount >>> 0;

      this.device.queue.writeBuffer(this.simUniformBuf, 0, this.simUniformF32.subarray(0, 20));
    }

    _dispatchInitialCaustics() {
      this._writeSimUniform(1 / 120);
      const enc = this.device.createCommandEncoder();
      const pass = enc.beginComputePass();
      const wgX = Math.ceil((NX + 1) / 4), wgY = Math.ceil((NY + 1) / 4), wgZ = Math.ceil((NZ + 1) / 4);

      pass.setBindGroup(0, this.bgA);
      pass.setPipeline(this.pipeClearGrid);
      pass.dispatchWorkgroups(Math.ceil(this.atomicTotal / 256));
      pass.setPipeline(this.pipeP2G);
      pass.dispatchWorkgroups(Math.ceil(this.particleCount / 256));
      pass.setPipeline(this.pipeNormClassify);
      pass.dispatchWorkgroups(wgX, wgY, wgZ);

      pass.setBindGroup(0, this.bgB0);
      pass.setBindGroup(1, this.bgB1);
      pass.setPipeline(this.pipeClearCaustics);
      pass.dispatchWorkgroups(Math.ceil((CAUST_W * CAUST_H) / 256));
      pass.setPipeline(this.pipeSurfHeight);
      pass.dispatchWorkgroups(Math.ceil(NX / 8), Math.ceil(NZ / 8));
      pass.setPipeline(this.pipeTraceCaustics);
      pass.dispatchWorkgroups(Math.ceil(CAUST_W / 8), Math.ceil(CAUST_H / 8));
      pass.setPipeline(this.pipeBlurCaustics);
      pass.dispatchWorkgroups(Math.ceil(CAUST_W / 8), Math.ceil(CAUST_H / 8));
      pass.end();
      this.device.queue.submit([enc.finish()]);
    }

    step(dt, isExport) {
      if (dt <= 0) return;
      const clampedDt = Math.min(dt, 1 / 30);
      const substeps = clampedDt > 0.011 ? 2 : 1;
      const subDt = clampedDt / substeps;

      for (let s = 0; s < substeps; s++) {
        this._stepSub(subDt);
      }

      // Non-blocking audio telemetry poll in live interactive mode (skipped during deterministic videoExport)
      if (!isExport) {
        this._pollAudioTelemetry();
      }
    }

    _stepSub(subDt) {
      this.simTime += subDt;
      this.frameSeed = (this.frameSeed + 1) >>> 0;

      // Smooth wavemaker envelope & physical piston kinematics
      const targetEnv = this.waveRunning ? 1.0 : 0.0;
      const envRate = this.waveRunning ? 1.8 : 1.4;
      if (this.waveEnvelope < targetEnv) {
        this.waveEnvelope = Math.min(targetEnv, this.waveEnvelope + envRate * subDt);
      } else if (this.waveEnvelope > targetEnv) {
        this.waveEnvelope = Math.max(targetEnv, this.waveEnvelope - envRate * subDt);
      }

      if (!this.waveRunning && this.waveEnvelope < 0.02) {
        this.calmTimer += subDt;
      } else {
        this.calmTimer = 0;
      }

      const omega = 2.0 * Math.PI * this.params.waveFrequency;
      const prevPaddleX = this.paddleX;
      if (this.waveEnvelope > 1e-4) {
        this.wavePhase += omega * subDt;
        // Full-power laboratory wavemaker stroke: gentle swell at low amp -> massive plunging reef breaker & high far-wall slap at high amp!
        const physAmp = (0.04 + this.params.waveAmplitude * 0.98) * this.waveEnvelope;
        const stroke = Math.sin(this.wavePhase) - 0.14 * Math.sin(2.0 * this.wavePhase);
        this.paddleX = clamp(this.paddleBaseX + physAmp * stroke, 0.14, 1.08);
      } else {
        // Gently return paddle to neutral base position
        this.paddleX += (this.paddleBaseX - this.paddleX) * Math.min(1, subDt * 3.0);
      }
      this.paddleVel = clamp((this.paddleX - prevPaddleX) / Math.max(subDt, 1e-4), -3.2, 3.2);

      this._writeSimUniform(subDt);

      const enc = this.device.createCommandEncoder();
      const pass = enc.beginComputePass();

      const wgX = Math.ceil((NX + 1) / 4);
      const wgY = Math.ceil((NY + 1) / 4);
      const wgZ = Math.ceil((NZ + 1) / 4);
      const pGroups = Math.ceil(this.particleCount / 256);

      // --- Module A: FLIP Grid + Red-Black SOR Incompressible Pressure Projection ---
      pass.setBindGroup(0, this.bgA);

      pass.setPipeline(this.pipeClearGrid);
      pass.dispatchWorkgroups(Math.ceil(this.atomicTotal / 256));

      pass.setPipeline(this.pipeP2G);
      pass.dispatchWorkgroups(pGroups);

      pass.setPipeline(this.pipeNormClassify);
      pass.dispatchWorkgroups(wgX, wgY, wgZ);

      pass.setPipeline(this.pipeForcesBounds);
      pass.dispatchWorkgroups(wgX, wgY, wgZ);

      pass.setPipeline(this.pipeDivergence);
      pass.dispatchWorkgroups(wgX, wgY, wgZ);

      // 52 full Red+Black SOR sweeps (omega=1.82) -> propagates pressure cleanly across entire 104-cell tank for crisp plunging breakers & wall run-up!
      for (let it = 0; it < 52; it++) {
        pass.setPipeline(this.pipeSORRed);
        pass.dispatchWorkgroups(wgX, wgY, wgZ);
        pass.setPipeline(this.pipeSORBlack);
        pass.dispatchWorkgroups(wgX, wgY, wgZ);
      }

      pass.setPipeline(this.pipeSubPressure);
      pass.dispatchWorkgroups(wgX, wgY, wgZ);

      pass.setPipeline(this.pipeExtrapAir);
      pass.dispatchWorkgroups(wgX, wgY, wgZ);

      // --- Module B: G2P + Advect + Surface Height + Spheres + Diffuse Whitewater/Bubbles + Caustics ---
      pass.setBindGroup(0, this.bgB0);
      pass.setBindGroup(1, this.bgB1);

      pass.setPipeline(this.pipeSurfHeight);
      pass.dispatchWorkgroups(Math.ceil(NX / 8), Math.ceil(NZ / 8));

      pass.setPipeline(this.pipeG2P);
      pass.dispatchWorkgroups(pGroups);

      pass.setPipeline(this.pipeSpheres);
      pass.dispatchWorkgroups(1);

      pass.setPipeline(this.pipeDiffuse);
      pass.dispatchWorkgroups(Math.ceil(MAX_DIFFUSE / 256));

      pass.setPipeline(this.pipeClearCaustics);
      pass.dispatchWorkgroups(Math.ceil((CAUST_W * CAUST_H) / 256));

      pass.setPipeline(this.pipeTraceCaustics);
      pass.dispatchWorkgroups(Math.ceil(CAUST_W / 8), Math.ceil(CAUST_H / 8));

      pass.setPipeline(this.pipeBlurCaustics);
      pass.dispatchWorkgroups(Math.ceil(CAUST_W / 8), Math.ceil(CAUST_H / 8));

      pass.end();
      this.device.queue.submit([enc.finish()]);
    }

    _pollAudioTelemetry() {
      this._telemetryFrameSkip++;
      if (this._telemetryFrameSkip < 3 || this._telemetryBusy) return;
      this._telemetryFrameSkip = 0;
      this._telemetryBusy = true;

      const enc = this.device.createCommandEncoder();
      enc.copyBufferToBuffer(this.countersBuf, 0, this.countersReadBuf, 0, 16);
      this.device.queue.submit([enc.finish()]);

      this.countersReadBuf.mapAsync(GPUMapMode.READ).then(() => {
        const vals = new Uint32Array(this.countersReadBuf.getMappedRange().slice(0));
        this.countersReadBuf.unmap();
        const splashE = vals[1];
        const foamCnt = vals[2];
        const clackE = vals[3];
        // Reset event counters [1..3] while preserving ring cursor [0]
        this.device.queue.writeBuffer(this.countersBuf, 4, new Uint32Array([0, 0, 0]));

        const audio = App.Audio;
        if (splashE > 5) {
          audio.playWaterSplash(clamp(splashE / 90, 0.12, 1.0), clamp(splashE / 65, 0.5, 1.6));
        }
        if (clackE > 15) {
          audio.playRigidHit(clamp(clackE / 120, 0.08, 0.7), 'glass');
        }
        const paddleE = clamp(Math.abs(this.paddleVel) / 1.8 + (this.waveEnvelope * 0.25), 0, 1);
        const foamE = clamp(foamCnt / 420, 0, 1);
        audio.updateWaveSound(paddleE, foamE);

        this._telemetryBusy = false;
      }).catch(() => {
        this._telemetryBusy = false;
      });
    }
  }

  App.Scene2Sim = Scene2Sim;
  App.terrainHeightJS = terrainHeightJS;
})(window);
