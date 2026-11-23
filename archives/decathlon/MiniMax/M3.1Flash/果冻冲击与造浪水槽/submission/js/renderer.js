/* renderer.js — WebGPU forward renderer: sky, shadow map, opaque pass,
   refraction/reflection transparent pass, final tonemap blit. */
(function (global) {
  'use strict';
  const S = global.WGSL, Gpu = global.Gpu;

  const SCENE_FORMAT = 'rgba16float';
  const DEPTH_FORMAT = 'depth32float';
  const SHADOW_SIZE = 2048;

  const LAYOUT = {
    mesh: {
      arrayStride: 24,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' }
      ]
    },
    glass: {
      arrayStride: 28,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32' }
      ]
    },
    jelly: {
      arrayStride: 28,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32' }
      ]
    },
    water: {
      arrayStride: 32,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32' },
        { shaderLocation: 3, offset: 28, format: 'float32' }
      ]
    }
  };

  const INST_FLOATS = 24; // mat4(16) + color(4) + params(4)

  class Renderer {
    constructor(device, context, format) {
      this.device = device;
      this.context = context;
      this.format = format;
      this.width = 1; this.height = 1;
      this.meshId = 0;

      this.globalsData = new Float32Array(112); // 448 bytes
      this.globalsBuf = Gpu.uniform(device, 448, 'globals');
      this.instBuf = Gpu.storage(device, 1024 * INST_FLOATS * 4, 0, 'instances');
      this.instCapacity = 1024;
      this.instData = new Float32Array(this.instCapacity * INST_FLOATS);

      this._makeLayouts();
      this._makePipelines();
      this._makeShadow();
      this.resize(2, 2);
    }

    /* ---------------- layouts ---------------- */
    _makeLayouts() {
      const d = this.device;
      this.bglGlobals = d.createBindGroupLayout({
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }]
      });
      this.bglInst = d.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }
        ]
      });
      this.bglShadow = d.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } }
        ]
      });
      this.bglScene = d.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } }
        ]
      });
      this.bglTex = d.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
        ]
      });
      this.ballBuf = null;

      this.plGlobals = d.createPipelineLayout({ bindGroupLayouts: [this.bglGlobals] });
      this.plShadow = d.createPipelineLayout({ bindGroupLayouts: [this.bglGlobals, this.bglInst] });
      this.plOpaque = d.createPipelineLayout({ bindGroupLayouts: [this.bglGlobals, this.bglInst, this.bglShadow] });
      this.plTrans = d.createPipelineLayout({ bindGroupLayouts: [this.bglGlobals, this.bglInst, this.bglShadow, this.bglScene] });
      this.plBlit = d.createPipelineLayout({ bindGroupLayouts: [this.bglGlobals, this.bglTex] });

      this.bgGlobals = d.createBindGroup({
        layout: this.bglGlobals,
        entries: [{ binding: 0, resource: { buffer: this.globalsBuf } }]
      });
      this.bgInst = d.createBindGroup({
        layout: this.bglInst,
        entries: [
          { binding: 0, resource: { buffer: this.instBuf } },
          { binding: 1, resource: { buffer: this.ballBuf || this.instBuf } }
        ]
      });
    }

    setBallBuffer(buf) {
      this.ballBuf = buf;
      this.bgInst = this.device.createBindGroup({
        layout: this.bglInst,
        entries: [
          { binding: 0, resource: { buffer: this.instBuf } },
          { binding: 1, resource: { buffer: buf } }
        ]
      });
    }

    /* ---------------- pipelines ---------------- */
    _makePipelines() {
      const d = this.device;
      const mod = (code, label) => d.createShaderModule({ code, label });

      const opaqueMod = mod(S.globals + S.inst + S.env + S.shadow + S.opaqueVS + S.opaqueFS, 'opaque');
      const shadowMod = mod(S.globals + S.inst + S.shadowVS, 'shadow');
      const glassMod = mod(S.globals + S.inst + S.env + S.shadow + S.glassVS + S.glassFS, 'glass');
      const blitMod = mod(S.globals + S.blitVS + S.blitFS.replace('@group(2) @binding(0)', '@group(1) @binding(0)').replace('@group(2) @binding(1)', '@group(1) @binding(1)'), 'blit');
      this.modSky = mod(S.globals + S.env + S.blitVS.replace('fn vs', 'fn vsSky') + `
        @fragment fn fsSky(@builtin(position) fc: vec4f) -> @location(0) vec4f {
          let uv = fc.xy * G.screen.zw * 2.0 - vec2f(1.0, 1.0);
          let p = G.invViewProj * vec4f(uv.x, -uv.y, 1.0, 1.0);
          let dir = normalize(p.xyz / p.w - G.camPos.xyz);
          var c = envColor(dir);
          // gentle horizon gradient / vignette
          c = c * (1.0 - 0.25 * pow(length(uv * vec2f(0.8, 1.0)), 2.0));
          return vec4f(c * G.misc.y, 1.0);
        }`, 'sky');

      this.pipeOpaque = d.createRenderPipeline({
        layout: this.plOpaque,
        vertex: { module: opaqueMod, entryPoint: 'vs', buffers: [LAYOUT.mesh] },
        fragment: { module: opaqueMod, entryPoint: 'fs', targets: [{ format: SCENE_FORMAT }] },
        primitive: { topology: 'triangle-list', cullMode: 'back' },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' }
      });
      this.pipeGlass = d.createRenderPipeline({
        layout: this.plOpaque,
        vertex: { module: glassMod, entryPoint: 'vs', buffers: [LAYOUT.glass] },
        fragment: {
          module: glassMod, entryPoint: 'fs', targets: [{
            format: SCENE_FORMAT,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
            }
          }]
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: 'less' }
      });
      this.pipeShadow = d.createRenderPipeline({
        layout: this.plShadow,
        vertex: { module: shadowMod, entryPoint: 'vs', buffers: [LAYOUT.mesh] },
        primitive: { topology: 'triangle-list', cullMode: 'back' },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' }
      });
      this.pipeSky = d.createRenderPipeline({
        layout: this.plGlobals,
        vertex: { module: this.modSky, entryPoint: 'vsSky' },
        fragment: { module: this.modSky, entryPoint: 'fsSky', targets: [{ format: SCENE_FORMAT }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: 'always' }
      });
      this.pipeBlit = d.createRenderPipeline({
        layout: this.plBlit,
        vertex: { module: blitMod, entryPoint: 'vs' },
        fragment: { module: blitMod, entryPoint: 'fs', targets: [{ format: this.format }] },
        primitive: { topology: 'triangle-list' }
      });
      const ballMod = mod(S.globals + S.inst + global.WGSL_BALL.vs, 'ball');
      this.pipeBall = d.createRenderPipeline({
        layout: this.plOpaque,
        vertex: { module: ballMod, entryPoint: 'vsBall', buffers: [LAYOUT.mesh] },
        fragment: { module: opaqueMod, entryPoint: 'fs', targets: [{ format: SCENE_FORMAT }] },
        primitive: { topology: 'triangle-list', cullMode: 'back' },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' }
      });
    }

    _makeShadow() {
      const d = this.device;
      this.shadowTex = Gpu.texture(d, SHADOW_SIZE, SHADOW_SIZE, DEPTH_FORMAT,
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING, 'shadow');
      this.shadowView = this.shadowTex.createView();
      this.shadowSampler = d.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });
      this.bgShadow = d.createBindGroup({
        layout: this.bglShadow,
        entries: [
          { binding: 0, resource: this.shadowView },
          { binding: 1, resource: this.shadowSampler }
        ]
      });
    }

    resize(w, h) {
      const d = this.device;
      w = Math.max(2, w | 0); h = Math.max(2, h | 0);
      if (w === this.width && h === this.height && this.sceneColor) return;
      this.width = w; this.height = h;
      const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC;
      if (this.sceneColor) this.sceneColor.destroy();
      if (this.sceneCopy) this.sceneCopy.destroy();
      if (this.depthTex) this.depthTex.destroy();
      this.sceneColor = Gpu.texture(d, w, h, SCENE_FORMAT, usage, 'sceneColor');
      this.sceneCopy = Gpu.texture(d, w, h, SCENE_FORMAT, usage, 'sceneCopy');
      this.depthTex = Gpu.texture(d, w, h, DEPTH_FORMAT, GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING, 'depth');
      this.sceneColorView = this.sceneColor.createView();
      this.sceneCopyView = this.sceneCopy.createView();
      this.depthView = this.depthTex.createView();
      this.linearSampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
      this.bgScene = d.createBindGroup({
        layout: this.bglScene,
        entries: [
          { binding: 0, resource: this.sceneCopyView },
          { binding: 1, resource: this.linearSampler },
          { binding: 2, resource: this.depthView }
        ]
      });
      this.bgBlit = d.createBindGroup({
        layout: this.bglTex,
        entries: [
          { binding: 0, resource: this.sceneColorView },
          { binding: 1, resource: this.linearSampler }
        ]
      });
    }

    /* ---------------- meshes ---------------- */
    createMesh(geo, layoutName) {
      const d = this.device;
      const layout = LAYOUT[layoutName];
      const vbuf = d.createBuffer({ size: Math.max(32, geo.data.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(vbuf, 0, geo.data);
      const ibuf = d.createBuffer({ size: Math.max(4, geo.indices.byteLength), usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(ibuf, 0, geo.indices);
      return { vbuf, ibuf, count: geo.count, layout, dynamic: false, capacity: geo.data.length, id: ++this.meshId };
    }

    createDynamicMesh(layoutName, maxVerts, maxIndices) {
      const d = this.device;
      const layout = LAYOUT[layoutName];
      const vbuf = d.createBuffer({ size: maxVerts * layout.arrayStride, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      const ibuf = d.createBuffer({ size: Math.max(4, maxIndices * 4), usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
      return { vbuf, ibuf, count: 0, layout, dynamic: true, capacity: maxVerts, id: ++this.meshId };
    }

    updateMesh(mesh, data, indices, indexCount) {
      const d = this.device;
      if (data.length > mesh.capacity * (mesh.layout.arrayStride / 4)) return;
      d.queue.writeBuffer(mesh.vbuf, 0, data);
      if (indices && indices.length) d.queue.writeBuffer(mesh.ibuf, 0, indices);
      mesh.count = indexCount;
    }

    /* ---------------- instance buffer ---------------- */
    _uploadInstances(list) {
      // group by (pass, mesh) so that every draw can address its own range
      const groups = [];
      const map = new Map();
      for (const it of list) {
        const key = it.pass + '#' + it.mesh.id;
        let g = map.get(key);
        if (!g) {
          g = { mesh: it.mesh, items: [], first: 0, pass: it.pass };
          map.set(key, g); groups.push(g);
        }
        g.items.push(it);
      }
      let total = 0;
      for (const g of groups) total += g.items.length;
      if (total > this.instCapacity) {
        this.instCapacity = Math.ceil(total * 1.5);
        this.instBuf.destroy();
        this.instBuf = Gpu.storage(this.device, this.instCapacity * INST_FLOATS * 4, 0, 'instances');
        this.bgInst = this.device.createBindGroup({
          layout: this.bglInst,
          entries: [
            { binding: 0, resource: { buffer: this.instBuf } },
            { binding: 1, resource: { buffer: this.ballBuf || this.instBuf } }
          ]
        });
        this.instData = new Float32Array(this.instCapacity * INST_FLOATS);
      }
      const data = this.instData;
      let o = 0;
      for (const g of groups) {
        g.first = o / INST_FLOATS;
        for (const it of g.items) {
          data.set(it.model, o); o += 16;
          data[o++] = it.color[0]; data[o++] = it.color[1]; data[o++] = it.color[2]; data[o++] = it.color[3] === undefined ? 1 : it.color[3];
          data[o++] = it.params[0]; data[o++] = it.params[1]; data[o++] = it.params[2]; data[o++] = it.params[3];
        }
      }
      this.device.queue.writeBuffer(this.instBuf, 0, data, 0, o);
      return groups;
    }

    _drawGroups(pass, groups) {
      for (const g of groups) {
        if (!g.mesh.count) continue;
        pass.setVertexBuffer(0, g.mesh.vbuf);
        pass.setIndexBuffer(g.mesh.ibuf, 'uint32');
        pass.drawIndexed(g.mesh.count, g.items.length, 0, 0, g.first);
      }
    }

    /* ---------------- jelly / water pipelines ---------------- */
    _makeJellyPipeline() {
      const d = this.device;
      const src = global.WGSL_JELLY;
      const mod = d.createShaderModule({
        code: S.globals + S.inst + S.env + S.shadow + src.vs + src.fs,
        label: 'jelly'
      });
      this.pipeJelly = d.createRenderPipeline({
        layout: this.plTrans,
        vertex: { module: mod, entryPoint: 'vs', buffers: [LAYOUT.jelly] },
        fragment: {
          module: mod, entryPoint: 'fs', targets: [{
            format: SCENE_FORMAT,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
            }
          }]
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: 'less' }
      });
    }

    _makeShadowJelly() {
      const d = this.device;
      const src = global.WGSL_JELLY;
      const mod = d.createShaderModule({ code: S.globals + S.inst + src.shadowVS, label: 'shadowJelly' });
      this.pipeShadowJelly = d.createRenderPipeline({
        layout: this.plShadow,
        vertex: { module: mod, entryPoint: 'vs', buffers: [LAYOUT.jelly] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' }
      });
    }

    _makeWaterPipeline() {
      const d = this.device;
      const src = global.WGSL_WATER;
      const mod = d.createShaderModule({
        code: S.globals + S.inst + S.env + S.shadow + src.vs + src.fs,
        label: 'water'
      });
      this.pipeWater = d.createRenderPipeline({
        layout: this.plTrans,
        vertex: { module: mod, entryPoint: 'vs', buffers: [LAYOUT.water] },
        fragment: {
          module: mod, entryPoint: 'fs', targets: [{
            format: SCENE_FORMAT,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
            }
          }]
        },
        primitive: { topology: 'triangle-list', cullMode: 'back' },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' }
      });
    }

    /* ---------------- frame ---------------- */
    render(scene) {
      const d = this.device;
      const enc = d.createCommandEncoder();

      // one instance upload for the whole frame
      const all = [];
      for (const it of (scene.opaque || [])) all.push({ it, pass: 'opaque' });
      for (const it of (scene.jelly || [])) all.push({ it, pass: 'jelly' });
      for (const it of (scene.glass || [])) all.push({ it, pass: 'glass' });
      if (scene.water) all.push({ it: scene.water.instance, pass: 'water', mesh: scene.water.mesh });
      const flat = all.map(e => {
        const o = Object.assign({}, e.it);
        o.pass = e.pass;
        o.mesh = e.mesh || e.it.mesh;
        return o;
      });
      const groups = this._uploadInstances(flat);
      const byPass = { opaque: [], jelly: [], glass: [], water: [] };
      for (const g of groups) byPass[g.pass].push(g);

      // shadow pass
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [],
          depthStencilAttachment: {
            view: this.shadowView, depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store'
          }
        });
        pass.setPipeline(this.pipeShadow);
        pass.setBindGroup(0, this.bgGlobals);
        pass.setBindGroup(1, this.bgInst);
        this._drawGroups(pass, byPass.opaque);
        if (byPass.jelly.length) {
          if (!this.pipeShadowJelly) this._makeShadowJelly();
          pass.setPipeline(this.pipeShadowJelly);
          pass.setBindGroup(1, this.bgInst);
          this._drawGroups(pass, byPass.jelly);
        }
        pass.end();
      }

      // opaque pass
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [{ view: this.sceneColorView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0.02, g: 0.03, b: 0.05, a: 1 } }],
          depthStencilAttachment: { view: this.depthView, depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store' }
        });
        pass.setPipeline(this.pipeSky);
        pass.setBindGroup(0, this.bgGlobals);
        pass.draw(3);
        pass.setPipeline(this.pipeOpaque);
        pass.setBindGroup(0, this.bgGlobals);
        pass.setBindGroup(2, this.bgShadow);
        pass.setBindGroup(1, this.bgInst);
        this._drawGroups(pass, byPass.opaque);
        if (scene.balls && scene.balls.count > 0) {
          pass.setPipeline(this.pipeBall);
          pass.setBindGroup(0, this.bgGlobals);
          pass.setBindGroup(2, this.bgShadow);
          pass.setBindGroup(1, this.bgInst);
          pass.setVertexBuffer(0, scene.balls.mesh.vbuf);
          pass.setIndexBuffer(scene.balls.mesh.ibuf, 'uint32');
          pass.drawIndexed(scene.balls.mesh.count, scene.balls.count, 0, 0, 0);
        }
        pass.end();
      }

      // copy for refraction source
      enc.copyTextureToTexture({ texture: this.sceneColor }, { texture: this.sceneCopy }, [this.width, this.height]);

      // transparent pass
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [{ view: this.sceneColorView, loadOp: 'load', storeOp: 'store' }],
          depthStencilAttachment: { view: this.depthView, depthLoadOp: 'load', depthStoreOp: 'store' }
        });
        if (byPass.jelly.length) {
          if (!this.pipeJelly) this._makeJellyPipeline();
          pass.setPipeline(this.pipeJelly);
          pass.setBindGroup(0, this.bgGlobals);
          pass.setBindGroup(2, this.bgShadow);
          pass.setBindGroup(3, this.bgScene);
          pass.setBindGroup(1, this.bgInst);
          this._drawGroups(pass, byPass.jelly);
        }
        if (scene.water) {
          if (!this.pipeWater) this._makeWaterPipeline();
          pass.setPipeline(this.pipeWater);
          pass.setBindGroup(0, this.bgGlobals);
          pass.setBindGroup(2, this.bgShadow);
          pass.setBindGroup(3, this.bgScene);
          pass.setBindGroup(1, this.bgInst);
          pass.setVertexBuffer(0, scene.water.mesh.vbuf);
          pass.drawIndirect(scene.water.mesh.indirectBuffer, 0);
        }
        if (byPass.glass.length) {
          pass.setPipeline(this.pipeGlass);
          pass.setBindGroup(0, this.bgGlobals);
          pass.setBindGroup(2, this.bgShadow);
          pass.setBindGroup(1, this.bgInst);
          this._drawGroups(pass, byPass.glass);
        }
        pass.end();
      }

      // blit to canvas
      {
        const view = this.context.getCurrentTexture().createView();
        const pass = enc.beginRenderPass({
          colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }]
        });
        pass.setPipeline(this.pipeBlit);
        pass.setBindGroup(0, this.bgGlobals);
        pass.setBindGroup(1, this.bgBlit);
        pass.draw(3);
        pass.end();
      }

      d.queue.submit([enc.finish()]);
    }

    updateGlobals(g) {
      const a = this.globalsData;
      a.set(g.view, 0);
      a.set(g.proj, 16);
      a.set(g.viewProj, 32);
      a.set(g.invViewProj, 48);
      a.set(g.lightViewProj, 64);
      a.set(g.camPos, 80);
      a.set(g.sunDir, 84);
      a.set(g.sunColor, 88);
      a.set(g.skyTop, 92);
      a.set(g.skyBot, 96);
      a.set(g.misc, 100);
      a.set(g.screen, 104);
      a.set(g.nearFar, 108);
      a.set(g.fx, 112);
      this.device.queue.writeBuffer(this.globalsBuf, 0, a);
    }
  }

  global.Renderer = Renderer;
  global.RENDER_CONST = { SCENE_FORMAT, DEPTH_FORMAT, SHADOW_SIZE, LAYOUT, INST_FLOATS };
})(window);
