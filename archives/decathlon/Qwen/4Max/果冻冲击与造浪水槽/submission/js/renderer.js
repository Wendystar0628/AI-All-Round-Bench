/* WebGPU 渲染器：阴影 / 材质 / 屏幕空间水体 / 后期 */
'use strict';
class Renderer {
  constructor() {
    this.dev = GFX.device;
    this.w = 0; this.h = 0;
    this.frameData = new Float32Array(132);
    this.frameBuf = GFX.buffer(132 * 4, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'frame');
    this.splatParams = GFX.buffer(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'splat-params');
    this.blurParams = GFX.buffer(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'blur-params');
    this.linearSmp = this.dev.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.shadowSmp = this.dev.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });
    this.shadowTex = GFX.texture(2048, 2048, 'depth32float', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING, 'shadow');
    this.dummySurf = GFX.texture(2, 2, 'rgba16float', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST, 'dummy-surf');
    this.dev.queue.writeTexture({ texture: this.dummySurf }, new Uint16Array(16), { bytesPerRow: 16 }, [2, 2]);
    this.meshes = {};
    this.buildPipelines();
    this.buildMeshes();
    this.jellyGpu = new Map();
    this.instBuf = GFX.buffer(64 * 96, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'instances');
    this.instData = new Float32Array(64 * 24);
    this.lightDir = norm3([0.48, 0.72, 0.42]);
    this.rimDir = norm3([-0.55, 0.28, -0.65]);
    this.proj = M4.create(); this.view = M4.create(); this.viewProj = M4.create();
    this.invView = M4.create(); this.invViewProj = M4.create();
    this.shadowMat = M4.create();
    this.camPos = [0, 2, 5];
    this.shake = 0;
  }
  buildPipelines() {
    const dev = this.dev;
    const V = GPUShaderStage.VERTEX, F = GPUShaderStage.FRAGMENT;
    const meshMod = GFX.shader(SH.mesh, 'mesh');
    const shadowMod = GFX.shader(SH.shadow, 'shadow');
    const vbLayout = [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] }];
    const depthState = { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' };
    // 显式布局：所有网格管线 group1 一致（Draw uniform + 实例 storage）
    this.meshGroup1 = dev.createBindGroupLayout({ entries: [
      { binding: 0, visibility: V, buffer: { type: 'uniform' } },
      { binding: 1, visibility: V, buffer: { type: 'read-only-storage' } }
    ] });
    this.meshGroup0 = dev.createBindGroupLayout({ entries: [
      { binding: 0, visibility: V | F, buffer: { type: 'uniform' } },
      { binding: 1, visibility: F, texture: { sampleType: 'depth' } },
      { binding: 2, visibility: F, sampler: { type: 'comparison' } },
      { binding: 3, visibility: F, texture: { sampleType: 'float' } },
      { binding: 4, visibility: F, sampler: { type: 'filtering' } }
    ] });
    this.shadowGroup0 = dev.createBindGroupLayout({ entries: [
      { binding: 0, visibility: V, buffer: { type: 'uniform' } }
    ] });
    const meshLayout = dev.createPipelineLayout({ bindGroupLayouts: [this.meshGroup0, this.meshGroup1] });
    const shadowLayout = dev.createPipelineLayout({ bindGroupLayouts: [this.shadowGroup0, this.meshGroup1] });
    const mkMesh = (vs, blend, cull, depthWrite, label) => dev.createRenderPipeline({
      label, layout: meshLayout,
      vertex: { module: meshMod, entryPoint: vs, buffers: vbLayout },
      fragment: { module: meshMod, entryPoint: 'fsMain', targets: [{ format: 'rgba16float', blend }] },
      primitive: { topology: 'triangle-list', cullMode: cull },
      depthStencil: { ...depthState, depthWriteEnabled: depthWrite }
    });
    const blendAlpha = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } };
    this.pipeMesh = mkMesh('vsMain', undefined, 'back', true, 'mesh-opaque');
    this.pipeJelly = mkMesh('vsMain', blendAlpha, 'none', true, 'mesh-jelly');
    this.pipeGlass = mkMesh('vsMain', blendAlpha, 'none', false, 'mesh-glass');
    this.pipeInst = dev.createRenderPipeline({
      label: 'mesh-inst', layout: meshLayout,
      vertex: { module: meshMod, entryPoint: 'vsInst', buffers: vbLayout },
      fragment: { module: meshMod, entryPoint: 'fsMain', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: depthState
    });
    const mkShadow = (vs, label) => dev.createRenderPipeline({
      label, layout: shadowLayout,
      vertex: { module: shadowMod, entryPoint: vs, buffers: vbLayout },
      fragment: { module: shadowMod, entryPoint: 'fsShadow', targets: [] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' }
    });
    this.pipeShadow = mkShadow('vsShadow', 'shadow-mesh');
    this.pipeShadowInst = mkShadow('vsShadowInst', 'shadow-inst');
    const fullVS = (mod) => ({ module: mod, entryPoint: 'vsFull' });
    const bgMod = GFX.shader(SH.bg, 'bg');
    this.pipeBg = dev.createRenderPipeline({
      label: 'bg', layout: 'auto', vertex: fullVS(bgMod),
      fragment: { module: bgMod, entryPoint: 'fsBg', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always' }
    });
    const splatMod = GFX.shader(SH.splat, 'splat');
    this.pipeSplat = dev.createRenderPipeline({
      label: 'splat', layout: 'auto', vertex: { module: splatMod, entryPoint: 'vsSplat' },
      fragment: { module: splatMod, entryPoint: 'fsSplat', targets: [{ format: 'rgba16float', blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' }
    });
    const blurMod = GFX.shader(SH.blur, 'blur');
    this.pipeBlur = dev.createRenderPipeline({
      label: 'blur', layout: 'auto', vertex: fullVS(blurMod),
      fragment: { module: blurMod, entryPoint: 'fsBlur', targets: [{ format: 'r32float' }] },
      primitive: { topology: 'triangle-list' }
    });
    const waterMod = GFX.shader(SH.waterComposite, 'water');
    this.pipeWater = dev.createRenderPipeline({
      label: 'water', layout: 'auto', vertex: fullVS(waterMod),
      fragment: { module: waterMod, entryPoint: 'fsWater', targets: [{ format: 'rgba16float', blend: blendAlpha }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' }
    });
    const foamMod = GFX.shader(SH.foam, 'foam');
    this.pipeFoam = dev.createRenderPipeline({
      label: 'foam', layout: 'auto', vertex: { module: foamMod, entryPoint: 'vsFoam' },
      fragment: { module: foamMod, entryPoint: 'fsFoam', targets: [{ format: 'rgba16float', blend: blendAlpha }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less-equal' }
    });
    const postMod = GFX.shader(SH.post, 'post');
    this.pipePost = dev.createRenderPipeline({
      label: 'post', layout: 'auto', vertex: fullVS(postMod),
      fragment: { module: postMod, entryPoint: 'fsPost', targets: [{ format: GFX.format }] },
      primitive: { topology: 'triangle-list' }
    });
  }
  buildMeshes() {
    this.meshes.box = this.makeBox(1, 1, 1);
    this.meshes.sphere = this.makeSphere(1, 28, 18);
    this.meshes.plane = this.makePlane(1, 1);
    this.meshes.cyl = this.makeCylinder(1, 1, 24);
  }
  uploadMesh(verts, indices, label) {
    const v = new Float32Array(verts), ix = new Uint32Array(indices);
    const vb = GFX.buffer(v.byteLength, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, label + '-v');
    const ib = GFX.buffer(ix.byteLength, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST, label + '-i');
    GFX.device.queue.writeBuffer(vb, 0, v);
    GFX.device.queue.writeBuffer(ib, 0, ix);
    return { vb, ib, count: ix.length };
  }
  makeBox(sx, sy, sz) {
    const x = sx / 2, y = sy / 2, z = sz / 2;
    const faces = [
      { n: [1, 0, 0], v: [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]] },
      { n: [-1, 0, 0], v: [[-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]] },
      { n: [0, 1, 0], v: [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]] },
      { n: [0, -1, 0], v: [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]] },
      { n: [0, 0, 1], v: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
      { n: [0, 0, -1], v: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] }
    ];
    const verts = [], idx = [];
    for (const f of faces) {
      const b = verts.length / 6;
      for (const p of f.v) verts.push(p[0], p[1], p[2], f.n[0], f.n[1], f.n[2]);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    return this.uploadMesh(verts, idx, 'box');
  }
  makePlane(sx, sz) {
    const x = sx / 2, z = sz / 2;
    const verts = [-x, 0, -z, 0, 1, 0, x, 0, -z, 0, 1, 0, x, 0, z, 0, 1, 0, -x, 0, z, 0, 1, 0];
    return this.uploadMesh(verts, [0, 3, 2, 0, 2, 1], 'plane');
  }
  makeSphere(r, seg, rings) {
    const verts = [], idx = [];
    for (let j = 0; j <= rings; j++) {
      const phi = j / rings * Math.PI;
      for (let i = 0; i <= seg; i++) {
        const th = i / seg * Math.PI * 2;
        const nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
        verts.push(nx * r, ny * r, nz * r, nx, ny, nz);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    return this.uploadMesh(verts, idx, 'sphere');
  }
  makeCylinder(r, hgt, seg) {
    const verts = [], idx = [];
    const y0 = -hgt / 2, y1 = hgt / 2;
    for (let i = 0; i <= seg; i++) {
      const th = i / seg * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      verts.push(c * r, y0, s * r, c, 0, s);
      verts.push(c * r, y1, s * r, c, 0, s);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const cb = verts.length / 6;
    verts.push(0, y0, 0, 0, -1, 0);
    const ct = verts.length / 6;
    verts.push(0, y1, 0, 0, 1, 0);
    for (let i = 0; i <= seg; i++) {
      const th = i / seg * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      verts.push(c * r, y0, s * r, 0, -1, 0);
      verts.push(c * r, y1, s * r, 0, 1, 0);
    }
    for (let i = 0; i < seg; i++) {
      idx.push(cb, cb + 1 + i * 2 + 2, cb + 1 + i * 2);
      idx.push(ct, ct + 1 + i * 2, ct + 1 + i * 2 + 2);
    }
    return this.uploadMesh(verts, idx, 'cyl');
  }
  makeTerrain() {
    const NX = 96, NZ = 40;
    const verts = [], idx = [];
    const H = (x, z) => FL.terrainH(x, z);
    for (let k = 0; k <= NZ; k++) for (let i = 0; i <= NX; i++) {
      const x = i / NX * FL.LX, z = k / NZ * FL.LZ;
      const y = H(x, z);
      const e = 0.02;
      const dx = (H(x + e, z) - H(x - e, z)) / (2 * e);
      const dz = (H(x, z + e) - H(x, z - e)) / (2 * e);
      const n = norm3([-dx, 1, -dz]);
      verts.push(x, y, z, n[0], n[1], n[2]);
    }
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
      const a = k * (NX + 1) + i, b = a + NX + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    return this.uploadMesh(verts, idx, 'terrain');
  }
  resize(w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    const dev = this.dev;
    const destroy = (t) => { if (t) t.destroy(); };
    destroy(this.sceneColor); destroy(this.sceneDepth); destroy(this.sceneCopy);
    destroy(this.splatDepth); destroy(this.thickTex); destroy(this.blurA); destroy(this.blurB);
    const rt = (fmt, extra) => GFX.texture(w, h, fmt, GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | (extra || 0), 'rt');
    this.sceneColor = rt('rgba16float', GPUTextureUsage.COPY_SRC);
    this.sceneCopy = rt('rgba16float', GPUTextureUsage.COPY_DST);
    this.sceneDepth = rt('depth32float');
    this.splatDepth = rt('depth32float');
    this.thickTex = rt('rgba16float');
    this.blurA = GFX.texture(w, h, 'r32float', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING, 'blurA');
    this.blurB = GFX.texture(w, h, 'r32float', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING, 'blurB');
    this.rebuildBindGroups();
  }
  rebuildBindGroups() {
    const dev = this.dev;
    const fb = { binding: 0, resource: { buffer: this.frameBuf } };
    const surfView = (FL.ready ? FL.surfTex : this.dummySurf).createView();
    const meshEntries = (surf) => [fb, { binding: 1, resource: this.shadowTex.createView() }, { binding: 2, resource: this.shadowSmp }, { binding: 3, resource: surf }, { binding: 4, resource: this.linearSmp }];
    this.bgMesh = GFX.bindGroup(this.pipeMesh, 0, meshEntries(surfView));
    this.bgJelly = GFX.bindGroup(this.pipeJelly, 0, meshEntries(surfView));
    this.bgGlass = GFX.bindGroup(this.pipeGlass, 0, meshEntries(surfView));
    this.bgInst = GFX.bindGroup(this.pipeInst, 0, meshEntries(surfView));
    this.bgShadow = GFX.bindGroup(this.pipeShadow, 0, [fb]);
    this.bgShadowInst = GFX.bindGroup(this.pipeShadowInst, 0, [fb]);
    this.bgBg = GFX.bindGroup(this.pipeBg, 0, [fb]);
    this.bgPost = GFX.bindGroup(this.pipePost, 0, [fb, { binding: 1, resource: this.sceneColor.createView() }, { binding: 2, resource: this.linearSmp }]);
    if (FL.ready) {
      const partEntry = { binding: 1, resource: { buffer: FL.partBuf } };
      const spEntry = { binding: 2, resource: { buffer: this.splatParams } };
      this.bgSplat = GFX.bindGroup(this.pipeSplat, 0, [fb, partEntry, spEntry]);
      this.bgFoam = GFX.bindGroup(this.pipeFoam, 0, [fb, partEntry, spEntry]);
    }
    this.bgWater = GFX.bindGroup(this.pipeWater, 0, [fb,
      { binding: 1, resource: this.sceneCopy.createView() },
      { binding: 2, resource: this.linearSmp },
      { binding: 3, resource: this.blurB.createView() },
      { binding: 4, resource: this.thickTex.createView() }]);
    const blurBG = (srcD, srcF, out) => GFX.bindGroup(this.pipeBlur, 0, [fb,
      { binding: 1, resource: srcD.createView() }, { binding: 2, resource: srcF.createView() },
      { binding: 3, resource: { buffer: this.blurParams } }]);
    this.bgBlur1 = blurBG(this.splatDepth, this.blurB);
    this.bgBlur2 = blurBG(this.splatDepth, this.blurA);
    this.bgBlur3 = blurBG(this.splatDepth, this.blurB);
    this.bgBlur4 = blurBG(this.splatDepth, this.blurA);
    this.drawUniformBufs = new Map();
  }
  drawUniform(model, color, params, keyOverride) {
    const key = keyOverride || model; // 每个静态网格复用
    let rec = this.drawUniformBufs.get(key);
    if (!rec) {
      rec = { buf: GFX.buffer(112, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'draw'), data: new Float32Array(28), bgCache: new Map() };
      this.drawUniformBufs.set(key, rec);
    }
    const d = rec.data;
    d.set(model, 0); d.set(color, 16); d.set(params, 20); d.fill(0, 24, 28);
    GFX.device.queue.writeBuffer(rec.buf, 0, d);
    return rec;
  }
  drawBgFor(rec, pipe) {
    let bg = rec.bgCache.get(pipe);
    if (!bg) {
      bg = GFX.bindGroup(pipe, 1, [{ binding: 0, resource: { buffer: rec.buf } }, { binding: 1, resource: { buffer: this.instBuf } }]);
      rec.bgCache.set(pipe, bg);
    }
    return bg;
  }
  setCamera(cam, time, sceneId, opts) {
    const aspect = this.w / this.h;
    let eye = cam.pos.slice();
    if (this.shake > 0.001) {
      const t = time * 60;
      eye[0] += Math.sin(t * 1.3) * this.shake * 0.05;
      eye[1] += Math.sin(t * 1.7 + 2) * this.shake * 0.04;
      eye[2] += Math.cos(t * 1.1) * this.shake * 0.05;
    }
    this.camPos = eye;
    M4.perspective(this.proj, cam.fov * Math.PI / 180, aspect, 0.05, 60);
    M4.lookAt(this.view, eye, cam.target, [0, 1, 0]);
    M4.multiply(this.viewProj, this.proj, this.view);
    M4.invert(this.invView, this.view);
    M4.invert(this.invViewProj, this.viewProj);
    const center = opts.shadowCenter || [0, 0.3, 0];
    const ext = opts.shadowExtent || 3.0;
    const lp = [center[0] + this.lightDir[0] * 9, center[1] + this.lightDir[1] * 9, center[2] + this.lightDir[2] * 9];
    const lv = M4.create(), lpj = M4.create();
    M4.lookAt(lv, lp, center, [0, 1, 0]);
    M4.ortho(lpj, -ext, ext, -ext, ext, 1, 22);
    M4.multiply(this.shadowMat, lpj, lv);
    const d = this.frameData;
    d.set(this.viewProj, 0); d.set(this.view, 16); d.set(this.proj, 32);
    d.set(this.invViewProj, 48); d.set(this.invView, 64); d.set(this.shadowMat, 80);
    d.set([eye[0], eye[1], eye[2], 1], 96);
    d.set([this.lightDir[0], this.lightDir[1], this.lightDir[2], 0], 100);
    const lc = opts.lightColor || [1.25, 1.14, 1.0];
    d.set([lc[0], lc[1], lc[2], 1], 104);
    d.set([this.rimDir[0], this.rimDir[1], this.rimDir[2], 0], 108);
    const rc = opts.rimColor || (sceneId === 0 ? [0.85, 0.30, 0.62] : [0.25, 0.62, 0.95]);
    d.set([rc[0], rc[1], rc[2], 1], 112);
    d.set([time, sceneId, opts.exposure || 1.12, FL.LZ], 116);
    d.set([this.w, this.h, 1 / this.w, 1 / this.h], 120);
    const amb = opts.ambient || [0.30, 0.34, 0.42];
    d.set([amb[0], amb[1], amb[2], -FL.LZ / 2], 124);
    d.set([opts.subject ? opts.subject[0] : 0, opts.subject ? opts.subject[2] : 0, -FL.LX / 2, FL.LX], 128);
    GFX.device.queue.writeBuffer(this.frameBuf, 0, d);
  }
  updateJellyGpu(jelly) {
    let g = this.jellyGpu.get(jelly);
    if (!g) {
      g = { vb: null, ib: null, vcount: 0, icount: 0 };
      this.jellyGpu.set(jelly, g);
    }
    jelly.computeNormals();
    const n = jelly.n;
    const vdata = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      vdata[i * 6] = jelly.pos[i * 3]; vdata[i * 6 + 1] = jelly.pos[i * 3 + 1]; vdata[i * 6 + 2] = jelly.pos[i * 3 + 2];
      vdata[i * 6 + 3] = jelly.normals[i * 3]; vdata[i * 6 + 4] = jelly.normals[i * 3 + 1]; vdata[i * 6 + 5] = jelly.normals[i * 3 + 2];
    }
    if (!g.vb || g.vcount < n) {
      if (g.vb) g.vb.destroy();
      g.vb = GFX.buffer(Math.max(n, 2048) * 24, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, 'jelly-v');
      g.vcount = Math.max(n, 2048);
    }
    GFX.device.queue.writeBuffer(g.vb, 0, vdata);
    if (jelly.gpuIndexDirty || !g.ib) {
      if (g.ib) g.ib.destroy();
      g.ib = GFX.buffer(Math.max(jelly.surfIdx.byteLength, 12), GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST, 'jelly-i');
      GFX.device.queue.writeBuffer(g.ib, 0, jelly.surfIdx);
      g.icount = jelly.surfIdx.length;
      jelly.gpuIndexDirty = false;
    }
    return g;
  }
  /* scene: {camera, time, sceneId, opaque:[{mesh,model,color,params}], jellyDraws, glass:[...], balls:{count}, water, opts} */
  render(scene) {
    const dev = this.dev;
    this.resize(GFX.canvas.width, GFX.canvas.height);
    this.setCamera(scene.camera, scene.time, scene.sceneId, scene.opts || {});
    const enc = dev.createCommandEncoder();
    // ---- 阴影 ----
    {
      const pass = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: this.shadowTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
      pass.setPipeline(this.pipeShadow);
      pass.setBindGroup(0, this.bgShadow);
      for (const d of scene.opaque) {
        if (d.noShadow) continue;
        const rec = this.drawUniform(d.model, d.color, d.params);
        pass.setBindGroup(1, this.drawBgFor(rec, this.pipeShadow));
        pass.setVertexBuffer(0, d.mesh.vb); pass.setIndexBuffer(d.mesh.ib, 'uint32');
        pass.drawIndexed(d.mesh.count);
      }
      for (const j of scene.jellyDraws || []) {
        const g = this.updateJellyGpu(j.jelly);
        const rec = this.drawUniform(IDENTITY, [1, 1, 1, 1], [1, 0, 0, 1], j.jelly);
        pass.setBindGroup(1, this.drawBgFor(rec, this.pipeShadow));
        pass.setVertexBuffer(0, g.vb); pass.setIndexBuffer(g.ib, 'uint32');
        pass.drawIndexed(g.icount);
      }
      if (scene.balls && scene.balls.count > 0) {
        pass.setPipeline(this.pipeShadowInst);
        pass.setBindGroup(0, this.bgShadowInst);
        pass.setBindGroup(1, this.drawBgFor(this.drawUniform(IDENTITY, [1, 1, 1, 1], [0, 0, 0, 1], 'inst'), this.pipeShadowInst));
        const m = this.meshes.sphere;
        pass.setVertexBuffer(0, m.vb); pass.setIndexBuffer(m.ib, 'uint32');
        pass.drawIndexed(m.count, scene.balls.count);
      }
      pass.end();
    }
    // ---- 主场景 ----
    {
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: this.sceneColor.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
        depthStencilAttachment: { view: this.sceneDepth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
      });
      pass.setPipeline(this.pipeBg); pass.setBindGroup(0, this.bgBg); pass.draw(3);
      pass.setPipeline(this.pipeMesh); pass.setBindGroup(0, this.bgMesh);
      for (const d of scene.opaque) {
        const rec = this.drawUniform(d.model, d.color, d.params);
        pass.setBindGroup(1, this.drawBgFor(rec, this.pipeMesh));
        pass.setVertexBuffer(0, d.mesh.vb); pass.setIndexBuffer(d.mesh.ib, 'uint32');
        pass.drawIndexed(d.mesh.count);
      }
      if (scene.balls && scene.balls.count > 0) {
        pass.setPipeline(this.pipeInst); pass.setBindGroup(0, this.bgInst);
        pass.setBindGroup(1, this.drawBgFor(this.drawUniform(IDENTITY, [1, 1, 1, 1], [0, 0, 0, 1], 'inst'), this.pipeInst));
        const m = this.meshes.sphere;
        pass.setVertexBuffer(0, m.vb); pass.setIndexBuffer(m.ib, 'uint32');
        pass.drawIndexed(m.count, scene.balls.count);
      }
      if (scene.jellyDraws && scene.jellyDraws.length) {
        pass.setPipeline(this.pipeJelly); pass.setBindGroup(0, this.bgJelly);
        for (const j of scene.jellyDraws) {
          const g = this.updateJellyGpu(j.jelly);
          const rec = this.drawUniform(IDENTITY, j.color, [1, 0, 0, 1], j.jelly);
          pass.setBindGroup(1, this.drawBgFor(rec, this.pipeJelly));
          pass.setVertexBuffer(0, g.vb); pass.setIndexBuffer(g.ib, 'uint32');
          pass.drawIndexed(g.icount);
        }
      }
      pass.end();
    }
    // ---- 水体 ----
    if (scene.water && FL.ready) {
      const pc = FL.particleCount;
      GFX.device.queue.writeBuffer(this.splatParams, 0, new Float32Array([0.0215, 1, 0, 0]));
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [{ view: this.thickTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
          depthStencilAttachment: { view: this.splatDepth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
        });
        pass.setPipeline(this.pipeSplat); pass.setBindGroup(0, this.bgSplat);
        pass.draw(6, pc);
        pass.end();
      }
      enc.copyTextureToTexture({ texture: this.sceneColor }, { texture: this.sceneCopy }, [this.w, this.h]);
      const blurPass = (bg, out, dirx, diry, rad, mode) => {
        GFX.device.queue.writeBuffer(this.blurParams, 0, new Float32Array([dirx, diry, rad, mode]));
        const p = enc.beginRenderPass({ colorAttachments: [{ view: out.createView(), clearValue: { r: 1e6, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }] });
        p.setPipeline(this.pipeBlur); p.setBindGroup(0, bg); p.draw(3); p.end();
      };
      const rad = Math.max(3, Math.round(this.h / 1080 * 5));
      blurPass(this.bgBlur1, this.blurA, 1, 0, rad, 0);
      blurPass(this.bgBlur2, this.blurB, 0, 1, rad, 1);
      blurPass(this.bgBlur3, this.blurA, 1, 0, rad, 1);
      blurPass(this.bgBlur4, this.blurB, 0, 1, rad, 1);
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [{ view: this.sceneColor.createView(), loadOp: 'load', storeOp: 'store' }],
          depthStencilAttachment: { view: this.sceneDepth.createView(), depthLoadOp: 'load', depthStoreOp: 'store' }
        });
        pass.setPipeline(this.pipeWater); pass.setBindGroup(0, this.bgWater); pass.draw(3);
        pass.end();
      }
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [{ view: this.sceneColor.createView(), loadOp: 'load', storeOp: 'store' }],
          depthStencilAttachment: { view: this.sceneDepth.createView(), depthLoadOp: 'load', depthStoreOp: 'store' }
        });
        pass.setPipeline(this.pipeFoam); pass.setBindGroup(0, this.bgFoam);
        pass.draw(6, pc);
        if (scene.glass && scene.glass.length) {
          pass.setPipeline(this.pipeGlass); pass.setBindGroup(0, this.bgGlass);
          for (const d of scene.glass) {
            const rec = this.drawUniform(d.model, d.color, d.params);
            pass.setBindGroup(1, this.drawBgFor(rec, this.pipeGlass));
            pass.setVertexBuffer(0, d.mesh.vb); pass.setIndexBuffer(d.mesh.ib, 'uint32');
            pass.drawIndexed(d.mesh.count);
          }
        }
        pass.end();
      }
    } else if (scene.glass && scene.glass.length) {
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: this.sceneColor.createView(), loadOp: 'load', storeOp: 'store' }],
        depthStencilAttachment: { view: this.sceneDepth.createView(), depthLoadOp: 'load', depthStoreOp: 'store' }
      });
      pass.setPipeline(this.pipeGlass); pass.setBindGroup(0, this.bgGlass);
      for (const d of scene.glass) {
        const rec = this.drawUniform(d.model, d.color, d.params);
        pass.setBindGroup(1, this.drawBgFor(rec, this.pipeGlass));
        pass.setVertexBuffer(0, d.mesh.vb); pass.setIndexBuffer(d.mesh.ib, 'uint32');
        pass.drawIndexed(d.mesh.count);
      }
      pass.end();
    }
    // ---- 后期 ----
    {
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: GFX.ctx.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
      pass.setPipeline(this.pipePost); pass.setBindGroup(0, this.bgPost); pass.draw(3);
      pass.end();
    }
    dev.queue.submit([enc.finish()]);
    this.shake *= 0.90;
  }
}
const IDENTITY = M4.create();
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
window.Renderer = Renderer; window.IDENTITY = IDENTITY; window.norm3 = norm3;
