// WebGPU 基础设施：设备、缓冲、纹理、管线、uniform 分配器
const GPU = {
  device: null, ctx: null, format: null, canvas: null,
  sampleCount: 4,
};

async function initGPU(canvas) {
  const buildLimits = (a) => {
    const r = {};
    if (a.limits.maxStorageBuffersPerShaderStage > 8) r.maxStorageBuffersPerShaderStage = Math.min(16, a.limits.maxStorageBuffersPerShaderStage);
    if (a.limits.maxStorageBufferBindingSize < 268435456) r.maxStorageBufferBindingSize = 268435456;
    if (a.limits.maxBufferSize < 268435456) r.maxBufferSize = 268435456;
    return r;
  };
  let adapter = await navigator.gpu.requestAdapter();
  if (!adapter) adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('无法获取 GPU 适配器');
  let device = await adapter.requestDevice(buildLimits(adapter));
  if (device.limits.maxStorageBuffersPerShaderStage < 10) {
    try {
      const a2 = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (a2) {
        const d2 = await a2.requestDevice(buildLimits(a2));
        if (d2.limits.maxStorageBuffersPerShaderStage >= device.limits.maxStorageBuffersPerShaderStage) device = d2;
      }
    } catch (e) { /* keep */ }
  }
  GPU.device = device;
  GPU.canvas = canvas;
  GPU.ctx = canvas.getContext('webgpu');
  GPU.format = navigator.gpu.getPreferredCanvasFormat();
  GPU.ctx.configure({ device, format: GPU.format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  device.lost.then((i) => console.warn('GPU device lost', i.message));
  let errCount = 0;
  device.addEventListener('uncapturederror', (e) => {
    if (errCount++ < 6) console.error('GPU ERROR: ' + e.error.message);
  });
  return device;
}

function makeShaderModule(code, label) {
  const m = GPU.device.createShaderModule({ code, label });
  return m;
}

function createBuffer(size, usage, label) {
  return GPU.device.createBuffer({ size: Math.max(16, size), usage, label });
}

const BUF = {
  MAP_READ: GPUBufferUsage.MAP_READ,
  COPY_DST: GPUBufferUsage.COPY_DST,
  COPY_SRC: GPUBufferUsage.COPY_SRC,
  VERTEX: GPUBufferUsage.VERTEX,
  INDEX: GPUBufferUsage.INDEX,
  UNIFORM: GPUBufferUsage.UNIFORM,
  STORAGE: GPUBufferUsage.STORAGE,
  INDIRECT: GPUBufferUsage.INDIRECT,
};

// ---- 动态 uniform 分配器 ----
class UniformArena {
  constructor(minSize = 256) {
    this.minSize = minSize;
    this.cap = 1 << 20;
    this.buffer = createBuffer(this.cap, BUF.UNIFORM | BUF.COPY_DST | BUF.COPY_SRC, 'uniform-arena');
    this.f32 = new Float32Array(this.cap / 4);
    this.offset = 0;
    this.bindGroup = null;
  }
  ensure(extraBytes) {
    if (this.offset + extraBytes > this.cap) {
      this.grow(Math.max(this.cap * 2, this.offset + extraBytes));
    }
  }
  grow(newCap) {
    const nb = createBuffer(newCap, BUF.UNIFORM | BUF.COPY_DST | BUF.COPY_SRC, 'uniform-arena');
    const enc = GPU.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.buffer, 0, nb, 0, this.offset);
    GPU.device.queue.submit([enc.finish()]);
    this.buffer.destroy();
    this.buffer = nb;
    this.cap = newCap;
    this.f32 = new Float32Array(this.cap / 4);
    this.bindGroup = null;
  }
  begin() { this.offset = 0; }
  alloc(data) {
    const bytes = Math.max(this.minSize, (data.byteLength + 255) & ~255);
    this.ensure(bytes);
    const off = this.offset;
    this.f32.set(data, off / 4);
    this.offset += bytes;
    return off / this.minSize; // 以 256 字节为单位的动态索引
  }
  end() {
    if (this.offset > 0) GPU.device.queue.writeBuffer(this.buffer, 0, this.f32, 0, this.offset / 4);
  }
  makeBindGroup(layout) {
    this.bindGroup = GPU.device.createBindGroup({
      layout,
      entries: [{ binding: 0, resource: { buffer: this.buffer, offset: 0, size: this.minSize } }],
    });
    return this.bindGroup;
  }
}

// ---- 纹理辅助 ----
function createTex(size, format, usage, label, mip = 1, count = 1) {
  const d = GPU.device;
  const dim = count > 1 ? '2d' : '2d';
  return d.createTexture({
    size: count > 1 ? [size[0], size[1], count] : [size[0], size[1]],
    dimension: dim,
    format, usage, mipLevelCount: mip, sampleCount: 1, label,
  });
}
function createDepthTex(w, h, sampleCount = 1, label = 'depth') {
  return GPU.device.createTexture({
    size: [w, h], dimension: '2d', sampleCount,
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | (sampleCount === 1 ? GPUTextureUsage.TEXTURE_BINDING : 0),
    label,
  });
}

// ---- 网格生成 ----
function makeSphere(lat = 26, lon = 40) {
  const pos = [], nrm = [], idx = [];
  for (let y = 0; y <= lat; y++) {
    const v = y / lat, theta = v * Math.PI;
    const st = Math.sin(theta), ct = Math.cos(theta);
    for (let x = 0; x <= lon; x++) {
      const u = x / lon, phi = u * Math.PI * 2;
      const nx = st * Math.cos(phi), ny = ct, nz = st * Math.sin(phi);
      pos.push(nx, ny, nz); nrm.push(nx, ny, nz);
    }
  }
  for (let y = 0; y < lat; y++) {
    for (let x = 0; x < lon; x++) {
      const a = y * (lon + 1) + x, b = a + lon + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx) };
}

function makeCylinder(radius, height, seg = 64, caps = true) {
  const pos = [], nrm = [], idx = [];
  const hy = height / 2;
  // side
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const cx = Math.cos(a), sz = Math.sin(a);
    pos.push(cx * radius, -hy, sz * radius); nrm.push(cx, 0, sz);
    pos.push(cx * radius, hy, sz * radius); nrm.push(cx, 0, sz);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, c, d, b);
  }
  if (caps) {
    for (let side = 0; side < 2; side++) {
      const y = side === 0 ? -hy : hy, ny = side === 0 ? -1 : 1;
      const base = pos.length / 3;
      pos.push(0, y, 0); nrm.push(0, ny, 0);
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const cx = Math.cos(a), sz = Math.sin(a);
        pos.push(cx * radius, y, sz * radius); nrm.push(0, ny, 0);
      }
      for (let i = 0; i < seg; i++) {
        const a = base + 1 + i, b = base + 2 + i;
        if (side === 0) idx.push(base, b, a); else idx.push(base, a, b);
      }
    }
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx) };
}

function makeBox(w, h, d) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const faces = [
    [[1, 0, 0], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]],
    [[-1, 0, 0], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]],
    [[0, 1, 0], [-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]],
    [[0, -1, 0], [-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]],
    [[0, 0, 1], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]],
    [[0, 0, -1], [hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]],
  ];
  const pos = [], nrm = [], idx = [];
  for (const [n, a, b, c, dd] of faces) {
    const base = pos.length / 3;
    for (const v of [a, b, c, dd]) { pos.push(v[0], v[1], v[2]); nrm.push(n[0], n[1], n[2]); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx) };
}

function makeDisc(radius, seg = 72) {
  const pos = [], nrm = [], idx = [];
  pos.push(0, 0, 0); nrm.push(0, 1, 0);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pos.push(Math.cos(a) * radius, 0, Math.sin(a) * radius); nrm.push(0, 1, 0);
  }
  for (let i = 1; i <= seg; i++) idx.push(0, i + 1, i);
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx) };
}

class Mesh {
  constructor(geo) {
    const d = GPU.device;
    const vcount = geo.pos.length / 3;
    const inter = new Float32Array(vcount * 6);
    for (let i = 0; i < vcount; i++) {
      inter[i * 6] = geo.pos[i * 3]; inter[i * 6 + 1] = geo.pos[i * 3 + 1]; inter[i * 6 + 2] = geo.pos[i * 3 + 2];
      inter[i * 6 + 3] = geo.nrm[i * 3]; inter[i * 6 + 4] = geo.nrm[i * 3 + 1]; inter[i * 6 + 5] = geo.nrm[i * 3 + 2];
    }
    this.vbuf = d.createBuffer({ size: inter.byteLength, usage: BUF.VERTEX | BUF.COPY_DST, label: 'mesh-vb' });
    d.queue.writeBuffer(this.vbuf, 0, inter);
    this.ibuf = d.createBuffer({ size: Math.max(4, geo.idx.byteLength), usage: BUF.INDEX | BUF.COPY_DST, label: 'mesh-ib' });
    d.queue.writeBuffer(this.ibuf, 0, geo.idx);
    this.icount = geo.idx.length;
  }
  draw(pass, dynamicVbuf = null, dynamicVcount = null) {
    const vb = dynamicVbuf || this.vbuf;
    const n = dynamicVcount == null ? this.icount : dynamicVcount;
    pass.setVertexBuffer(0, vb);
    pass.setIndexBuffer(this.ibuf, 'uint32');
    pass.drawIndexed(n);
  }
}