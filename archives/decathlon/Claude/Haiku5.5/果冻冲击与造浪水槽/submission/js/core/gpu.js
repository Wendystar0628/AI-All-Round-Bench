// WebGPU 设备与通用资源封装。
const GPUX = {
  device: null,
  context: null,
  format: null,
  adapterInfo: '',

  async init(canvas) {
    if (!navigator.gpu) throw new Error('当前浏览器不支持 WebGPU');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('没有可用的 WebGPU 适配器');
    const want = Math.min(adapter.limits.maxStorageBuffersPerShaderStage, 24);
    this.device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBuffersPerShaderStage: want,
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
      },
    });
    this.device.lost.then((info) => console.error('GPU 设备丢失', info.message));
    this.context = canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    const ai = adapter.info || {};
    this.adapterInfo = [ai.vendor, ai.architecture, ai.device].filter(Boolean).join(' ');
    return this.device;
  },

  // 创建存储缓冲区（默认可读写、可回读）
  storage(byteSize, label, extra) {
    const size = Math.max(16, Math.ceil(byteSize / 4) * 4);
    return this.device.createBuffer({
      label,
      size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | (extra || 0),
    });
  },

  uniform(byteSize, label) {
    return this.device.createBuffer({
      label,
      size: Math.ceil(byteSize / 16) * 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  },

  // 上传 TypedArray 到新缓冲区
  storageFrom(typed, label) {
    const buf = this.storage(typed.byteLength, label);
    this.device.queue.writeBuffer(buf, 0, typed.buffer, typed.byteOffset, typed.byteLength);
    return buf;
  },

  write(buf, typed, offset) {
    this.device.queue.writeBuffer(buf, offset || 0, typed.buffer, typed.byteOffset, typed.byteLength);
  },

  // 清零缓冲区
  zero(buf) {
    this.device.queue.writeBuffer(buf, 0, new Uint8Array(buf.size));
  },

  shader(code, label) {
    return this.device.createShaderModule({ label, code });
  },

  // 回读：把 src 复制到回读缓冲区并异步映射，返回 { ready, data }
  makeReader(byteSize, label) {
    const staging = this.device.createBuffer({
      label: label + '-staging',
      size: Math.ceil(byteSize / 4) * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    return { staging, busy: false, data: null, byteSize };
  },

  // 在编码器中加入一次回读拷贝；随后调用 readerFetch 异步取数
  readerCopy(encoder, reader, src, byteSize) {
    if (reader.busy) return false;
    encoder.copyBufferToBuffer(src, 0, reader.staging, 0, byteSize);
    reader.pending = true;
    return true;
  },

  readerFetch(reader) {
    if (!reader.pending || reader.busy) return;
    reader.pending = false;
    reader.busy = true;
    reader.staging.mapAsync(GPUMapMode.READ).then(() => {
      reader.data = reader.staging.getMappedRange().slice(0);
      reader.staging.unmap();
      reader.busy = false;
    }).catch(() => {
      reader.busy = false;
    });
  },

  // 生成 HDR 颜色/深度附件
  colorTarget(w, h, format, label) {
    return this.device.createTexture({
      label,
      size: [w, h],
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    });
  },
  depthTarget(w, h, label) {
    return this.device.createTexture({
      label,
      size: [w, h],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
  },

  // 把网格（data: Float32Array，idx: Uint32Array）上传为顶点/索引缓冲区
  meshBuffers(mesh, label) {
    const dev = this.device;
    const vb = dev.createBuffer({ label: label + '-vb', size: Math.ceil(mesh.data.byteLength / 4) * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(vb, 0, mesh.data);
    const ib = dev.createBuffer({ label: label + '-ib', size: Math.ceil(mesh.idx.byteLength / 4) * 4, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(ib, 0, mesh.idx);
    return { vb, ib, n: mesh.idx.length };
  },

  // 等待 GPU 完成已提交的工作，再让出一帧，保证画面已经呈现
  async settle(timeoutMs) {
    await this.device.queue.onSubmittedWorkDone();
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      requestAnimationFrame(finish);
      setTimeout(finish, timeoutMs || 120);
    });
  },
};

// 生成 UV 球网格（位置与法线相同，单位半径）
function makeSphereMesh(stacks, slices) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= stacks; i++) {
    const phi = (i / stacks) * Math.PI;
    for (let j = 0; j <= slices; j++) {
      const th = (j / slices) * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(th);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(th);
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * (slices + 1) + j;
      const b = a + slices + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

// 长方体的顶点（位置、法线、颜色交错，每面 4 顶点，共 24 顶点）
function makeBoxMesh(min, max, color) {
  const faces = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  ];
  const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const hs = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2];
  const out = [];
  const idx = [];
  for (const f of faces) {
    const base = out.length / 9;
    const n = f.n;
    // 面中心 + 半尺寸沿 u、v 方向的四个角
    const ctr = [c[0] + n[0] * hs[0], c[1] + n[1] * hs[1], c[2] + n[2] * hs[2]];
    const ext = (vec) => [Math.abs(vec[0]) * hs[0], Math.abs(vec[1]) * hs[1], Math.abs(vec[2]) * hs[2]];
    const eu = ext(f.u);
    const ev = ext(f.v);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [su, sv] of corners) {
      const p = [
        ctr[0] + f.u[0] * su * eu[0] + f.v[0] * sv * ev[0],
        ctr[1] + f.u[1] * su * eu[1] + f.v[1] * sv * ev[1],
        ctr[2] + f.u[2] * su * eu[2] + f.v[2] * sv * ev[2],
      ];
      out.push(p[0], p[1], p[2], n[0], n[1], n[2], color[0], color[1], color[2]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { data: new Float32Array(out), idx: new Uint32Array(idx) };
}
