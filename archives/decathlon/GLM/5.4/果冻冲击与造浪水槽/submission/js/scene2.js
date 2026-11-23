'use strict';
/* ---------------------------------------------------------------------------
   Scene 2 — multi-density balls in a transparent wave tank
--------------------------------------------------------------------------- */

const TANK = { x: 2.064, y: 0.96, z: 0.864, wall: 0.035, water: 0.42 };

const SH_INST_BALL = /* wgsl */`
@group(1) @binding(0) var<storage, read> bPos : array<vec4f>;
@group(1) @binding(1) var<storage, read> bQuat : array<vec4f>;
@group(1) @binding(2) var<storage, read> bMeta : array<vec4f>;

struct VSIn {
  @location(0) pos : vec3f,
  @location(1) nrm : vec3f,
  @location(2) col : vec3f,
  @location(3) uv  : vec2f,
};
struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0) n : vec3f,
  @location(1) wp : vec3f,
  @location(2) col : vec3f,
  @location(3) uv : vec2f,
  @location(4) lp : vec3f,
};
const GROUP_COLORS = array<vec3f, 5>(
  vec3f(1.00, 0.79, 0.29),
  vec3f(1.00, 0.54, 0.36),
  vec3f(0.36, 0.89, 0.63),
  vec3f(0.31, 0.70, 1.00),
  vec3f(0.91, 0.36, 1.00));

@vertex fn vs(i : VSIn, @builtin(instance_index) inst : u32) -> VSOut {
  var o : VSOut;
  let q = bQuat[inst];
  let p = bPos[inst].xyz;
  let r = bPos[inst].w;
  let v = i.pos * r;
  let t = 2.0 * cross(q.xyz, v);
  let rv = v + q.w * t + cross(q.xyz, t);
  let n0 = i.nrm;
  let tn = 2.0 * cross(q.xyz, n0);
  let rn = n0 + q.w * tn + cross(q.xyz, tn);
  let wp = rv + p;
  o.wp = wp;
  o.pos = G.viewProj * vec4f(wp, 1.0);
  o.n = rn;
  let gi = i32(clamp(bMeta[inst].y, 0.0, 4.0));
  o.col = GROUP_COLORS[gi];
  o.uv = i.uv;
  let sp = G.shadowMat * vec4f(wp, 1.0);
  o.lp = sp.xyz / sp.w;
  return o;
}

@group(0) @binding(1) var shadowTex : texture_depth_2d;
@group(0) @binding(2) var shadowSmp : sampler_comparison;

fn shadowAt(lp : vec3f, ndl : f32) -> f32 {
  let inside = f32(lp.x > -1.02 && lp.x < 1.02 && lp.y > -1.02 && lp.y < 1.02);
  let uv = vec2f(lp.x * 0.5 + 0.5, 0.5 - lp.y * 0.5);
  let z = lp.z - clamp(0.0016 + 0.0035 * (1.0 - ndl), 0.0, 0.006);
  var s = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      s += textureSampleCompare(shadowTex, shadowSmp, uv + vec2f(f32(x), f32(y)) / 2048.0, z);
    }
  }
  return mix(1.0, s / 9.0, inside);
}

fn D_GGX(ndoth : f32, a : f32) -> f32 {
  let a2 = a * a;
  let d = ndoth * ndoth * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-5);
}
fn V_Smith(ndotv : f32, ndotl : f32, a : f32) -> f32 {
  let k = a * 0.5;
  let gv = ndotv / (ndotv * (1.0 - k) + k);
  let gl = ndotl / (ndotl * (1.0 - k) + k);
  return gv * gl;
}

@fragment fn fs(i : VSOut) -> @location(0) vec4f {
  let N = normalize(i.n);
  let V = normalize(G.camPos.xyz - i.wp);
  let L = normalize(G.lightDir.xyz);
  let albedo = i.col;
  let rough = 0.30;
  var col = vec3f(0.0);
  let ndv = max(dot(N, V), 1e-4);
  let up = N.y * 0.5 + 0.5;
  let amb = mix(vec3f(0.030, 0.036, 0.050), vec3f(0.12, 0.15, 0.20), up);
  col += albedo * amb;
  let Rv = reflect(-V, N);
  let F0 = vec3f(0.04);
  let Fenv = fresnelSchlick(ndv, F0);
  col += envSky(Rv) * Fenv * 0.55;
  let ndl = max(dot(N, L), 0.0);
  let sh = shadowAt(i.lp, ndl);
  let H = normalize(L + V);
  let F1 = fresnelSchlick(max(dot(V, H), 0.0), F0);
  let spec = D_GGX(max(dot(N, H), 0.0), rough * rough) * V_Smith(ndv, ndl, rough * rough) * F1 / max(4.0 * ndv * ndl, 1e-4);
  let kd = (vec3f(1.0) - F1);
  col += (kd * albedo / PI + spec) * G.lightColor.rgb * G.lightDir.w * ndl * sh;
  let Fd = normalize(G.fillDir.xyz);
  let ndf = max(dot(N, Fd), 0.0);
  let Hf = normalize(Fd + V);
  let specF = D_GGX(max(dot(N, Hf), 0.0), rough * rough) * V_Smith(ndv, ndf, rough * rough) * F1 / max(4.0 * ndv * ndf, 1e-4);
  col += (kd * albedo / PI * 0.8 + specF) * G.fillColor.rgb * G.fillDir.w * ndf;
  let Rd = normalize(G.rimDir.xyz);
  col += G.rimColor.rgb * G.rimDir.w * pow(max(dot(N, normalize(Rd + V)), 0.0), 40.0) * 1.2;
  return vec4f(col, 1.0);
}
`;

class SceneTank {
  constructor(app) {
    this.app = app;
    this.time = 0;
    this.fluid = new FluidSim(app);
    this.light = { dir: [0.35, 0.80, 0.48], color: [1.0, 0.96, 0.90], intensity: 3.6 };
    this.fill = { dir: [-0.70, 0.30, 0.62], color: [0.32, 0.55, 1.0], intensity: 1.0 };
    this.rim = { dir: [0.15, 0.45, -0.88], color: [0.55, 0.82, 1.0], intensity: 1.5 };
    this.exposure = 1.10;
    this.particleRadius = 0.0085;
    this.ready = false;
  }

  async init() {
    await this.fluid.init();
    await this.build();
    this.ready = true;
    return this;
  }

  async build() {
    const g = this.app.gfx;
    const X = TANK.x, Y = TANK.y, Z = TANK.z;
    const terrain = (x, z) => this.fluid.terrainH(x, z);

    const mb = new MeshBuilder();
    Geo.heightfield(mb, 0, X, 0, Z, 110, 46, terrain, [0.16, 0.17, 0.19], 0);
    {
      const n = [0, 0, 1];
      const a = mb.vertex([0, 0, 0], n, [0.13, 0.15, 0.18], 0, 0);
      const b = mb.vertex([X, 0, 0], n, [0.13, 0.15, 0.18], 1, 0);
      const c = mb.vertex([X, Y, 0], n, [0.13, 0.15, 0.18], 1, 1);
      const d = mb.vertex([0, Y, 0], n, [0.13, 0.15, 0.18], 0, 1);
      mb.tri(a, b, c); mb.tri(a, c, d);
    }
    {
      const n = [1, 0, 0];
      const a = mb.vertex([0, 0, 0], n, [0.11, 0.13, 0.16], 0, 0);
      const b = mb.vertex([0, 0, Z], n, [0.11, 0.13, 0.16], 1, 0);
      const c = mb.vertex([0, Y, Z], n, [0.11, 0.13, 0.16], 1, 1);
      const d = mb.vertex([0, Y, 0], n, [0.11, 0.13, 0.16], 0, 1);
      mb.tri(a, b, c); mb.tri(a, c, d);
    }
    {
      const n = [-1, 0, 0];
      const a = mb.vertex([X, 0, Z], n, [0.11, 0.13, 0.16], 0, 0);
      const b = mb.vertex([X, 0, 0], n, [0.11, 0.13, 0.16], 1, 0);
      const c = mb.vertex([X, Y, 0], n, [0.11, 0.13, 0.16], 1, 1);
      const d = mb.vertex([X, Y, Z], n, [0.11, 0.13, 0.16], 0, 1);
      mb.tri(a, b, c); mb.tri(a, c, d);
    }
    this.interiorMesh = mb.build(g);

    const gb = new MeshBuilder();
    const w = TANK.wall;
    const ox = X + w, oz = Z + w, oy = Y + w * 0.5;
    const glassCol = [1, 1, 1];
    const quad = (p0, p1, p2, p3, n) => {
      const a = gb.vertex(p0, n, glassCol, 0, 0);
      const b = gb.vertex(p1, n, glassCol, 1, 0);
      const c = gb.vertex(p2, n, glassCol, 1, 1);
      const d = gb.vertex(p3, n, glassCol, 0, 1);
      gb.tri(a, b, c); gb.tri(a, c, d);
    };
    quad([-w, -w, oz], [ox, -w, oz], [ox, oy, oz], [-w, oy, oz], [0, 0, 1]);
    quad([-w, -w, -w], [ox, -w, -w], [ox, oy, -w], [-w, oy, -w], [0, 0, -1]);
    quad([-w, -w, -w], [-w, -w, oz], [-w, oy, oz], [-w, oy, -w], [-1, 0, 0]);
    quad([ox, -w, -w], [ox, -w, oz], [ox, oy, oz], [ox, oy, -w], [1, 0, 0]);
    quad([-w, oy, -w], [ox, oy, -w], [ox, oy, oz], [-w, oy, oz], [0, 1, 0]);
    this.glassMesh = gb.build(g);

    const fb = new MeshBuilder();
    const t = 0.028;
    const metal = [0.32, 0.35, 0.40];
    const e = (cx, cy, cz, sx, sy, sz) => Geo.box(fb, sx, sy, sz, metal, cx, cy, cz);
    for (const zz of [-w, oz]) {
      e(ox / 2, oy, zz, ox + t, t, t);
      e(ox / 2, -w, zz, ox + t, t, t);
      e(-w, oy / 2, zz, t, oy, t);
      e(ox, oy / 2, zz, t, oy, t);
    }
    for (const xx of [-w, ox]) {
      e(xx, oy, oz / 2, t, t, oz + t);
      e(xx, -w, oz / 2, t, t, oz + t);
      e(xx, oy / 2, -w, t, oy, t);
      e(xx, oy / 2, oz, t, oy, t);
    }
    this.frameMesh = fb.build(g);

    const pb = new MeshBuilder();
    Geo.roundedBox(pb, ox + 0.16, 0.12, oz + 0.16, 0.03, 6, [0.10, 0.11, 0.13], ox / 2, -w - 0.06, oz / 2);
    this.plinthMesh = pb.build(g);

    const fl = new MeshBuilder();
    Geo.disk(fl, 7.5, 90, [0.055, 0.065, 0.085], ox / 2, -w - 0.12, oz / 2, 1);
    this.floorMesh = fl.build(g);

    const wb = new MeshBuilder();
    Geo.roundedBox(wb, 0.035, 0.56, Z * 0.94, 0.012, 4, [0.55, 0.60, 0.68], 0, 0.28, 0);
    this.paddleMesh = wb.build(g);
    const ab = new MeshBuilder();
    Geo.box(ab, 0.10, 0.05, 0.05, [0.4, 0.45, 0.5], 0, 0.585, 0);
    this.armMesh = ab.build(g);

    const bb = new MeshBuilder();
    Geo.sphere(bb, 1.0, 36, 22, [1, 1, 1]);
    this.ballMesh = bb.build(g);

    await this.buildPipelines(g.device);
  }

  async buildPipelines(dev) {
    const R = this.app.R;
    this.bglBall = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
    this.ballBindGroup = dev.createBindGroup({
      layout: this.bglBall,
      entries: [
        { binding: 0, resource: { buffer: this.fluid.ballPos } },
        { binding: 1, resource: { buffer: this.fluid.ballQuat } },
        { binding: 2, resource: { buffer: this.fluid.ballMeta } },
      ],
    });
    const module = await makeShaderModule(dev, SH_COMMON + SH_INST_BALL, 'instball');
    this.pipeBall = await dev.createRenderPipelineAsync({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [R.bglGlobals, this.bglBall, R.bglDraw] }),
      vertex: {
        module, entryPoint: 'vs',
        buffers: [{
          arrayStride: 48,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x3' },
            { shaderLocation: 3, offset: 36, format: 'float32x2' },
          ],
        }],
      },
      fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });
    // depth-only variant for the shadow map (no fragment stage)
    this.pipeBallShadow = await dev.createRenderPipelineAsync({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [R.bglGlobals, this.bglBall, R.bglDraw] }),
      vertex: {
        module, entryPoint: 'vs',
        buffers: [{
          arrayStride: 48,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x3' },
            { shaderLocation: 3, offset: 36, format: 'float32x2' },
          ],
        }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });
  }

  setCameraHome() {
    this.app.R.cam.set([1.05, 1.55, 3.55], [1.03, 0.42, 0.34], (33 * Math.PI) / 180);
  }

  reset() {
    this.time = 0;
    this.fluid.reset();
    this.fluid.setWaving(false);
    this.setCameraHome();
  }

  releaseBalls() { this.fluid.resetBalls(); }
  settle() { this.fluid.settle(); }
  setWaveAmp(a) { this.fluid.setWaveAmp(a); }
  setWaveFreq(f) { this.fluid.setWaveFreq(f); }
  setWaving(on) {
    this.fluid.setWaving(on);
    if (on) this.app.audio.ensure();
  }
  setGroupDensity(i, v) { this.fluid.setGroupDensity(i, v); }

  update(dt) {
    this.time += dt;
    const sub = dt > 1 / 90 ? 3 : 2;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) this.fluid.step(h);
    const amp = this.fluid.params.waving ? clamp(this.fluid.params.waveAmp / 0.09, 0.2, 1) : 0;
    if (this.app.audio.ready) this.app.audio.waveLevel(amp * 0.9);
  }

  render(R, enc) {
    const g = this.app.gfx;
    const f = this.fluid;
    R._shadowDir = this.light.dir;
    R.computeShadow([TANK.x / 2, 0.35, TANK.z / 2], 1.75);

    R.resetDraws();
    const identity = M4.ident();
    const dFloor = R.pushDraw(identity, [1, 1, 1, 1], [0.55, 0.0, 1, 0], [0, 0, 0, 0]);
    const dInt = R.pushDraw(identity, [1, 1, 1, 1], [0.42, 0.05, 1, 0], [0, 0, 0, 0]);
    const dFrame = R.pushDraw(identity, [1, 1, 1, 1], [0.30, 0.85, 1, 0], [0, 0, 0, 0]);
    const dPlinth = R.pushDraw(identity, [1, 1, 1, 1], [0.35, 0.5, 1, 0], [0, 0, 0, 0]);
    const paddleX = f.paddleX !== undefined ? f.paddleX : 0.035;
    const mPaddle = M4.ident();
    mPaddle[12] = paddleX;
    const dPaddle = R.pushDraw(mPaddle, [1, 1, 1, 1], [0.22, 0.9, 1, 0], [0, 0, 0, 0]);
    const dArm = R.pushDraw(identity, [1, 1, 1, 1], [0.30, 0.9, 1, 0], [0, 0, 0, 0]);
    const dBall = R.pushDraw(identity, [1, 1, 1, 1], [0.28, 0.0, 1, 0], [0, 0, 0, 0]);
    const dGlass = R.pushDraw(identity, [0.86, 0.95, 1.0, 1], [0.05, 0.0, 1, 1], [0, 0, 0, 0]);
    R.flushDraws();

    // ---- shadow pass ----
    const sh = R.beginShadow();
    sh.pass.setPipeline(this.pipeBallShadow);
    sh.pass.setBindGroup(0, R.globalBindGroup);
    sh.pass.setBindGroup(1, this.ballBindGroup);
    sh.pass.setVertexBuffer(0, this.ballMesh.vb);
    sh.pass.setIndexBuffer(this.ballMesh.ib, 'uint32');
    sh.pass.setBindGroup(2, R.drawBindGroup, [dBall]);
    sh.pass.drawIndexed(this.ballMesh.indexCount, f.numBalls, 0, 0, 0);
    sh.pass.setPipeline(R.pipeShadow);
    sh.pass.setBindGroup(1, R.drawBindGroup, [dFrame]);
    sh.pass.setVertexBuffer(0, this.frameMesh.vb);
    sh.pass.setIndexBuffer(this.frameMesh.ib, 'uint32');
    sh.pass.setBindGroup(1, R.drawBindGroup, [dFrame]);
    sh.pass.drawIndexed(this.frameMesh.indexCount);
    sh.pass.setVertexBuffer(0, this.paddleMesh.vb);
    sh.pass.setIndexBuffer(this.paddleMesh.ib, 'uint32');
    sh.pass.setBindGroup(1, R.drawBindGroup, [dPaddle]);
    sh.pass.drawIndexed(this.paddleMesh.indexCount);
    sh.pass.end();

    // ---- main scene pass ----
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: R.sceneColor.createView(), loadOp: 'clear', storeOp: 'store',
        clearValue: { r: 0.003, g: 0.005, b: 0.009, a: 1 },
      }],
      depthStencilAttachment: {
        view: R.sceneDepth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store',
      },
    });
    drawFullscreen(pass, R.pipeSky, R.globalBindGroup);
    pass.setPipeline(R.pipeMesh);
    pass.setBindGroup(0, R.globalBindGroup);
    pass.setVertexBuffer(0, this.floorMesh.vb); pass.setIndexBuffer(this.floorMesh.ib, 'uint32');
    pass.setBindGroup(1, R.drawBindGroup, [dFloor]); pass.drawIndexed(this.floorMesh.indexCount);
    pass.setVertexBuffer(0, this.plinthMesh.vb); pass.setIndexBuffer(this.plinthMesh.ib, 'uint32');
    pass.setBindGroup(1, R.drawBindGroup, [dPlinth]); pass.drawIndexed(this.plinthMesh.indexCount);
    pass.setVertexBuffer(0, this.interiorMesh.vb); pass.setIndexBuffer(this.interiorMesh.ib, 'uint32');
    pass.setBindGroup(1, R.drawBindGroup, [dInt]); pass.drawIndexed(this.interiorMesh.indexCount);
    pass.setVertexBuffer(0, this.frameMesh.vb); pass.setIndexBuffer(this.frameMesh.ib, 'uint32');
    pass.setBindGroup(1, R.drawBindGroup, [dFrame]); pass.drawIndexed(this.frameMesh.indexCount);
    pass.setVertexBuffer(0, this.paddleMesh.vb); pass.setIndexBuffer(this.paddleMesh.ib, 'uint32');
    pass.setBindGroup(1, R.drawBindGroup, [dPaddle]); pass.drawIndexed(this.paddleMesh.indexCount);
    pass.setVertexBuffer(0, this.armMesh.vb); pass.setIndexBuffer(this.armMesh.ib, 'uint32');
    pass.setBindGroup(1, R.drawBindGroup, [dArm]); pass.drawIndexed(this.armMesh.indexCount);
    pass.setPipeline(this.pipeBall);
    pass.setBindGroup(0, R.globalBindGroup);
    pass.setBindGroup(1, this.ballBindGroup);
    pass.setVertexBuffer(0, this.ballMesh.vb);
    pass.setIndexBuffer(this.ballMesh.ib, 'uint32');
    pass.setBindGroup(2, R.drawBindGroup, [dBall]);
    pass.drawIndexed(this.ballMesh.indexCount, f.numBalls, 0, 0, 0);
    pass.end();

    // ---- water: particle depth + thickness ----
    const pbg = g.device.createBindGroup({
      layout: R.bglParticle,
      entries: [
        { binding: 0, resource: { buffer: R.globalsBuf } },
        { binding: 1, resource: { buffer: f.pPos } },
        { binding: 2, resource: { buffer: f.pVel } },
      ],
    });
    const pp = enc.beginRenderPass({
      colorAttachments: [
        { view: R.waterA.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 1e8, g: 0, b: 0, a: 0 } },
        { view: R.thick.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } },
      ],
      depthStencilAttachment: {
        view: R.sceneDepth.createView(), depthLoadOp: 'load', depthStoreOp: 'store',
      },
    });
    pp.setPipeline(R.pipeParticle);
    pp.setBindGroup(0, pbg);
    pp.draw(f.numParticles * 6, 1, 0, 0);
    pp.end();

    // ---- bilateral smoothing ----
    const mkSmooth = (srcTex, dstTex) => g.device.createBindGroup({
      layout: R.bglSmooth,
      entries: [
        { binding: 0, resource: { buffer: R.globalsBuf } },
        { binding: 1, resource: srcTex.createView() },
        { binding: 2, resource: R.samplerLin },
      ],
    });
    let src = R.waterA, dst = R.waterB;
    for (let i = 0; i < 3; i++) {
      const sp = enc.beginRenderPass({
        colorAttachments: [{ view: dst.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 1e8, g: 0, b: 0, a: 0 } }],
      });
      drawFullscreen(sp, R.pipeSmooth, mkSmooth(src, dst));
      sp.end();
      const t = src; src = dst; dst = t;
    }
    const waterDepthTex = src;

    // ---- foam ----
    const fbg = g.device.createBindGroup({
      layout: R.bglFoam,
      entries: [
        { binding: 0, resource: { buffer: R.globalsBuf } },
        { binding: 1, resource: { buffer: f.foamPos } },
        { binding: 2, resource: { buffer: f.foamVel } },
      ],
    });
    const fp = enc.beginRenderPass({
      colorAttachments: [{ view: R.foamTex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
      depthStencilAttachment: { view: R.sceneDepth.createView(), depthLoadOp: 'load', depthStoreOp: 'store' },
    });
    fp.setPipeline(R.pipeFoam);
    fp.setBindGroup(0, fbg);
    fp.draw(f.numParticles * 6, 1, 0, 0);
    fp.end();

    // ---- water composite ----
    const wbg = g.device.createBindGroup({
      layout: R.bglWater,
      entries: [
        { binding: 0, resource: { buffer: R.globalsBuf } },
        { binding: 1, resource: R.sceneColor.createView() },
        { binding: 2, resource: waterDepthTex.createView() },
        { binding: 3, resource: R.thick.createView() },
        { binding: 4, resource: R.foamTex.createView() },
        { binding: 5, resource: R.sceneDepth.createView() },
        { binding: 6, resource: R.samplerLin },
        { binding: 7, resource: R.samplerNear },
      ],
    });
    const wp = enc.beginRenderPass({
      colorAttachments: [{ view: R.finalColor.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    drawFullscreen(wp, R.pipeWater, wbg);
    wp.end();

    // ---- glass over the water ----
    const gp = enc.beginRenderPass({
      colorAttachments: [{ view: R.finalColor.createView(), loadOp: 'load', storeOp: 'store' }],
      depthStencilAttachment: { view: R.sceneDepth.createView(), depthLoadOp: 'load', depthStoreOp: 'store' },
    });
    gp.setPipeline(R.pipeGlass);
    gp.setBindGroup(0, R.globalBindGroup);
    gp.setVertexBuffer(0, this.glassMesh.vb);
    gp.setIndexBuffer(this.glassMesh.ib, 'uint32');
    gp.setBindGroup(1, R.drawBindGroup, [dGlass]);
    gp.drawIndexed(this.glassMesh.indexCount);
    gp.end();

    return { finalView: R.finalColor.createView() };
  }
}
