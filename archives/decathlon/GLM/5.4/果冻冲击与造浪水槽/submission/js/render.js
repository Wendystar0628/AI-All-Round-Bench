'use strict';
/* ---------------------------------------------------------------------------
   Renderer: pipelines, targets, camera, draw batching, passes
--------------------------------------------------------------------------- */

class Camera {
  constructor() {
    this.pos = [1.6, 1.1, 2.0];
    this.target = [0, 0.45, 0];
    this.fov = (42 * Math.PI) / 180;
    this.desPos = [1.6, 1.1, 2.0];
    this.desTarget = [0, 0.45, 0];
    this.desFov = (42 * Math.PI) / 180;
    this.smooth = 8.0;
    this.up = [0, 1, 0];
  }
  set(pos, target, fov) {
    if (pos) V3.copy(this.desPos, pos);
    if (target) V3.copy(this.desTarget, target);
    if (fov !== undefined) this.desFov = fov;
  }
  snap() {
    V3.copy(this.pos, this.desPos);
    V3.copy(this.target, this.desTarget);
    this.fov = this.desFov;
  }
  update(dt) {
    if (!(dt > 0) || !isFinite(dt)) dt = 0.016;
    const k = 1 - Math.exp(-this.smooth * Math.min(dt, 0.05));
    if (!isFinite(k)) return;
    this.pos[0] += (this.desPos[0] - this.pos[0]) * k;
    this.pos[1] += (this.desPos[1] - this.pos[1]) * k;
    this.pos[2] += (this.desPos[2] - this.pos[2]) * k;
    this.target[0] += (this.desTarget[0] - this.target[0]) * k;
    this.target[1] += (this.desTarget[1] - this.target[1]) * k;
    this.target[2] += (this.desTarget[2] - this.target[2]) * k;
    this.fov += (this.desFov - this.fov) * k;
  }
  orbit(dx, dy) {
    // rotate the camera position around the target
    const d = V3.sub([0, 0, 0], this.desPos, this.desTarget);
    const r = V3.len(d);
    let theta = Math.atan2(d[0], d[2]);
    let phi = Math.asin(clamp(d[1] / r, -0.95, 0.95));
    theta -= dx * 0.005;
    phi = clamp(phi + dy * 0.005, -0.2, 1.35);
    d[0] = r * Math.cos(phi) * Math.sin(theta);
    d[1] = r * Math.sin(phi);
    d[2] = r * Math.cos(phi) * Math.cos(theta);
    V3.add(this.desPos, this.desTarget, d);
  }
  pan(dx, dy) {
    // move target in the camera plane
    const f = V3.norm([0, 0, 0], V3.sub([0, 0, 0], this.desTarget, this.desPos));
    const right = V3.norm([0, 0, 0], V3.cross([0, 0, 0], f, [0, 1, 0]));
    const up = V3.cross([0, 0, 0], right, f);
    const s = V3.dist(this.desPos, this.desTarget) * 0.0012;
    for (let i = 0; i < 3; i++) {
      this.desTarget[i] += (-right[i] * dx + up[i] * dy) * s;
      this.desPos[i] += (-right[i] * dx + up[i] * dy) * s;
    }
  }
  zoom(dz) {
    const d = V3.sub([0, 0, 0], this.desPos, this.desTarget);
    const r = V3.len(d);
    const nr = clamp(r * (1 + dz * 0.001), 0.35, 12);
    V3.scale(d, d, nr / r);
    V3.add(this.desPos, this.desTarget, d);
  }
  matrices(w, h) {
    const view = M4.lookAt(new Float32Array(16), this.pos, this.target, this.up);
    const proj = M4.perspective(new Float32Array(16), this.fov, w / h, 0.02, 60);
    const viewProj = M4.mul(new Float32Array(16), proj, view);
    const invViewProj = M4.invert(new Float32Array(16), viewProj);
    const invView = M4.invert(new Float32Array(16), view);
    const fwd = V3.norm([0, 0, 0], V3.sub([0, 0, 0], this.target, this.pos));
    const right = V3.norm([0, 0, 0], V3.cross([0, 0, 0], fwd, [0, 1, 0]));
    const up = V3.cross([0, 0, 0], right, fwd);
    return { view, proj, viewProj, invViewProj, invView, fwd, right, up };
  }
}

const MAX_DRAWS = 400;

async function makeShaderModule(dev, code, label) {
  const m = dev.createShaderModule({ code, label });
  const info = await m.getCompilationInfo();
  const errs = info.messages.filter((x) => x.type === 'error');
  if (errs.length) {
    for (const e of errs) console.error(`[shader ${label}] line ${e.lineNum}:${e.linePos} ${e.message}`);
    throw new Error(`shader ${label} failed: ` + errs.map((e) => e.lineNum + ':' + e.message).join(' | '));
  }
  return m;
}

class Renderer {
  constructor(gfx) {
    this.gfx = gfx;
    this.cam = new Camera();
    this.drawData = new Float32Array(MAX_DRAWS * 64);
    this.drawCount = 0;
    this.shadowMat = M4.ident();
    this.time = 0;
    this.frame = 0;
  }

  async init() {
    const g = this.gfx;
    const dev = g.device;
    this.depthFormat = g.features && g.features.includes('float32-blendable') ? 'r32float' : 'rgba16float';
    this.samplerCmp = dev.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });
    this.samplerLin = dev.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.samplerNear = dev.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });

    this.bglGlobals = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
      ],
    });
    this.bglDraw = dev.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true } }],
    });
    this.bglJelly = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    this.globalsSize = 640;
    this.globalsBuf = g.uniform(this.globalsSize, new Float32Array(this.globalsSize / 4));
    this.drawBuf = g.uniform(MAX_DRAWS * 256, new Float32Array(MAX_DRAWS * 64));
    this.drawBindGroup = dev.createBindGroup({
      layout: this.bglDraw,
      entries: [{ binding: 0, resource: { buffer: this.drawBuf, size: 112 } }],
    });

    // shadow map
    this.shadowSize = 2048;
    this.shadowTex = g.texture(this.shadowSize, this.shadowSize, 'depth32float',
      GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);

    this.globalBindGroup = dev.createBindGroup({
      layout: this.bglGlobals,
      entries: [
        { binding: 0, resource: { buffer: this.globalsBuf } },
        { binding: 1, resource: this.shadowTex.createView() },
        { binding: 2, resource: this.samplerCmp },
      ],
    });
    this.jellyBindGroup = null; // created in setSize (needs back depth texture)

    const meshLayout = [this.bglGlobals, this.bglDraw];
    const vertex = {
      module: await makeShaderModule(dev, SH_COMMON + SH_MESH, 'mesh'),
      entryPoint: 'vs',
      buffers: [{
        arrayStride: 48,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32x3' },
          { shaderLocation: 3, offset: 36, format: 'float32x2' },
        ],
      }],
    };
    const meshFrag = { module: await makeShaderModule(dev, SH_COMMON + SH_MESH, 'mesh'), entryPoint: 'fs', targets: [{ format: 'rgba16float' }] };
    const depthOpts = { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' };

    this.pipeMesh = await dev.createRenderPipelineAsync({
      layout: dev.createPipelineLayout({ bindGroupLayouts: meshLayout }),
      vertex, fragment: meshFrag,
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: depthOpts,
    });
    this.pipeGlass = await dev.createRenderPipelineAsync({
      layout: dev.createPipelineLayout({ bindGroupLayouts: meshLayout }),
      vertex, fragment: meshFrag,
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less' },
      multisample: { count: 1 },
      blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      },
    });

    const jellyModule = await makeShaderModule(dev, SH_COMMON + SH_JELLY, 'jelly');
    const jellyLayout = dev.createPipelineLayout({ bindGroupLayouts: [this.bglJelly, this.bglDraw] });
    this.pipeJellyBackDepth = await dev.createRenderPipelineAsync({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [this.bglGlobals, this.bglDraw] }),
      vertex: { module: jellyModule, entryPoint: 'vs', buffers: vertex.buffers },
      fragment: {
        module: jellyModule, entryPoint: 'fsDepth',
        targets: [{ format: 'r32float', blend: { color: { operation: 'max', srcFactor: 'one', dstFactor: 'one' }, alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'one' } } }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'front', frontFace: 'ccw' },
    });
    this.pipeJellyFront = await dev.createRenderPipelineAsync({
      layout: jellyLayout,
      vertex: { module: jellyModule, entryPoint: 'vs', buffers: vertex.buffers },
      fragment: { module: jellyModule, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
      blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      },
    });

    const shadowModule = await makeShaderModule(dev, SH_COMMON + SH_SHADOW, 'shadow');
    this.pipeShadow = await dev.createRenderPipelineAsync({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [this.bglGlobals, this.bglDraw] }),
      vertex: { module: shadowModule, entryPoint: 'vs', buffers: vertex.buffers },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });

    const skyModule = await makeShaderModule(dev, SH_COMMON + SH_SKY, 'sky');
    this.pipeSky = await dev.createRenderPipelineAsync({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [this.bglGlobals] }),
      vertex: { module: skyModule, entryPoint: 'vs' },
      fragment: { module: skyModule, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always' },
    });

    const postModule = await makeShaderModule(dev, SH_COMMON + SH_POST, 'post');
    this.bglPost = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    this.pipePost = await dev.createRenderPipelineAsync({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [this.bglPost] }),
      vertex: { module: postModule, entryPoint: 'vs' },
      fragment: { module: postModule, entryPoint: 'fs', targets: [{ format: g.format }] },
      primitive: { topology: 'triangle-list' },
    });

    const blitModule = await makeShaderModule(dev, SH_COMMON + SH_BLIT, 'blit');
    this.pipeBlit = await dev.createRenderPipelineAsync({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [this.bglPost] }),
      vertex: { module: blitModule, entryPoint: 'vs' },
      fragment: { module: blitModule, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list' },
    });

    // ---- water / particle pipelines ----
    this.bglParticle = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
    const pModule = await makeShaderModule(dev, SH_COMMON + SH_PARTICLE, 'particle');
    this.pipeParticle = await dev.createRenderPipelineAsync({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [this.bglParticle] }),
      vertex: { module: pModule, entryPoint: 'vs' },
      fragment: {
        module: pModule, entryPoint: 'fs',
        targets: [
          { format: this.depthFormat, blend: { color: { operation: 'min', srcFactor: 'one', dstFactor: 'one' }, alpha: { operation: 'min', srcFactor: 'one', dstFactor: 'one' } } },
          { format: 'rg16float', blend: { color: { operation: 'add', srcFactor: 'one', dstFactor: 'one' }, alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one' } } },
        ],
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less' },
    });

    this.bglSmooth = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    const sModule = await makeShaderModule(dev, SH_COMMON + SH_SMOOTH, 'smooth');
    this.pipeSmooth = await dev.createRenderPipelineAsync({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [this.bglSmooth] }),
      vertex: { module: sModule, entryPoint: 'vs' },
      fragment: { module: sModule, entryPoint: 'fs', targets: [{ format: this.depthFormat }] },
      primitive: { topology: 'triangle-list' },
    });

    this.bglFoam = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
    const fModule = await makeShaderModule(dev, SH_COMMON + SH_FOAM, 'foam');
    this.pipeFoam = await dev.createRenderPipelineAsync({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [this.bglFoam] }),
      vertex: { module: fModule, entryPoint: 'vs' },
      fragment: {
        module: fModule, entryPoint: 'fs', targets: [{ format: 'rgba16float', blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } }],
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less' },
    });

    this.bglWater = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 7, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    const wModule = await makeShaderModule(dev, SH_COMMON + SH_WATER, 'water');
    this.pipeWater = await dev.createRenderPipelineAsync({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [this.bglWater] }),
      vertex: { module: wModule, entryPoint: 'vs' },
      fragment: { module: wModule, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list' },
    });

    return this;
  }

  setSize(w, h) {
    const g = this.gfx;
    if (this.w === w && this.h === h && this.sceneColor) return;
    this.w = w; this.h = h;
    const ra = GPUTextureUsage.RENDER_ATTACHMENT;
    const tb = GPUTextureUsage.TEXTURE_BINDING;
    const destroy = (t) => { if (t) t.destroy(); };
    destroy(this.sceneColor); destroy(this.sceneDepth); destroy(this.waterA); destroy(this.waterB);
    destroy(this.thick); destroy(this.foamTex); destroy(this.finalColor);
    this.sceneColor = g.texture(w, h, 'rgba16float', ra | tb);
    this.sceneDepth = g.texture(w, h, 'depth32float', ra | tb);
    this.waterA = g.texture(w, h, this.depthFormat, ra | tb);
    this.waterB = g.texture(w, h, this.depthFormat, ra | tb);
    this.thick = g.texture(w, h, 'rg16float', ra | tb);
    this.foamTex = g.texture(w, h, 'rgba16float', ra | tb);
    this.finalColor = g.texture(w, h, 'rgba16float', ra | tb);
    destroy(this.jellyBackDepth);
    this.jellyBackDepth = g.texture(w, h, 'r32float', ra | tb);
    this.jellyBindGroup = g.device.createBindGroup({
      layout: this.bglJelly,
      entries: [
        { binding: 0, resource: { buffer: this.globalsBuf } },
        { binding: 1, resource: this.shadowTex.createView() },
        { binding: 2, resource: this.samplerCmp },
        { binding: 3, resource: this.jellyBackDepth.createView() },
        { binding: 4, resource: this.samplerLin },
      ],
    });
  }

  /* ---- draw batching ---- */
  resetDraws() { this.drawCount = 0; }
  pushDraw(model, color, params, extra) {
    if (this.drawCount >= MAX_DRAWS) return 0;
    const o = this.drawCount * 64;
    const d = this.drawData;
    d.set(model, o);
    d[o + 16] = color[0]; d[o + 17] = color[1]; d[o + 18] = color[2]; d[o + 19] = color[3];
    d[o + 20] = params[0]; d[o + 21] = params[1]; d[o + 22] = params[2]; d[o + 23] = params[3];
    d[o + 24] = extra[0]; d[o + 25] = extra[1]; d[o + 26] = extra[2]; d[o + 27] = extra[3];
    this.drawCount++;
    return o * 4;
  }
  flushDraws() {
    if (this.drawCount > 0) {
      this.gfx.device.queue.writeBuffer(this.drawBuf, 0, this.drawData, 0, this.drawCount * 64);
    }
  }

  /* ---- globals ---- */
  uploadGlobals(scene) {
    const w = this.w, h = this.h;
    const m = this.cam.matrices(w, h);
    const buf = this._gbuf || (this._gbuf = new Float32Array(160));
    const setM = (off, mat) => { for (let i = 0; i < 16; i++) buf[off + i] = mat[i]; };
    setM(0, m.viewProj); setM(16, m.invViewProj); setM(32, m.view); setM(48, m.proj); setM(64, m.invView);
    const o = 80;
    buf[o + 0] = this.cam.pos[0]; buf[o + 1] = this.cam.pos[1]; buf[o + 2] = this.cam.pos[2]; buf[o + 3] = this.time;
    buf[o + 4] = m.fwd[0]; buf[o + 5] = m.fwd[1]; buf[o + 6] = m.fwd[2]; buf[o + 7] = Math.tan(this.cam.fov / 2);
    buf[o + 8] = m.right[0]; buf[o + 9] = m.right[1]; buf[o + 10] = m.right[2]; buf[o + 11] = w / h;
    buf[o + 12] = m.up[0]; buf[o + 13] = m.up[1]; buf[o + 14] = m.up[2]; buf[o + 15] = 0;
    const L = scene.light;
    buf[o + 16] = L.dir[0]; buf[o + 17] = L.dir[1]; buf[o + 18] = L.dir[2]; buf[o + 19] = L.intensity;
    buf[o + 20] = L.color[0]; buf[o + 21] = L.color[1]; buf[o + 22] = L.color[2]; buf[o + 23] = 0;
    const F = scene.fill;
    buf[o + 24] = F.dir[0]; buf[o + 25] = F.dir[1]; buf[o + 26] = F.dir[2]; buf[o + 27] = F.intensity;
    buf[o + 28] = F.color[0]; buf[o + 29] = F.color[1]; buf[o + 30] = F.color[2]; buf[o + 31] = 0;
    const R = scene.rim;
    buf[o + 32] = R.dir[0]; buf[o + 33] = R.dir[1]; buf[o + 34] = R.dir[2]; buf[o + 35] = R.intensity;
    buf[o + 36] = R.color[0]; buf[o + 37] = R.color[1]; buf[o + 38] = R.color[2]; buf[o + 39] = 0;
    buf[o + 40] = w; buf[o + 41] = h; buf[o + 42] = 1 / w; buf[o + 43] = 1 / h;
    buf[o + 44] = scene.exposure || 1.15;
    buf[o + 45] = this.time;
    buf[o + 46] = scene.particleRadius || 0.008;
    buf[o + 47] = 0;
    setM(128, this.shadowMat);
    this.gfx.device.queue.writeBuffer(this.globalsBuf, 0, buf, 0, 160);
    return m;
  }

  computeShadow(center, radius) {
    const dir = this._shadowDir || (this._shadowDir = [0, 0, 0]);
    // updated by the scene before calling
    const eye = [center[0] + dir[0] * radius * 2.2, center[1] + dir[1] * radius * 2.2, center[2] + dir[2] * radius * 2.2];
    const view = M4.lookAt(new Float32Array(16), eye, center, [0, 1, 0]);
    const proj = M4.ortho(new Float32Array(16), -radius, radius, -radius, radius, 0.05, radius * 5);
    this.shadowMat = M4.mul(new Float32Array(16), proj, view);
    return this.shadowMat;
  }

  beginShadow() {
    const enc = this.gfx.device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.shadowTex.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    pass.setPipeline(this.pipeShadow);
    pass.setBindGroup(0, this.globalBindGroup);
    pass.setBindGroup(1, this.drawBindGroup);
    return { enc, pass };
  }
}

/* fullscreen helper: draws 3 vertices with the given pipeline/bindgroup */
function drawFullscreen(pass, pipeline, bindGroup) {
  pass.setPipeline(pipeline);
  if (bindGroup) pass.setBindGroup(0, bindGroup);
  pass.draw(3, 1, 0, 0);
}
