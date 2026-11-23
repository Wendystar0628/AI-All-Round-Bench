'use strict';
/* 公共基础：数学工具 + WebGPU 辅助。所有脚本以普通 <script> 方式加载（file:// 可用）。 */
const JW = window.JW = { errors: [] };

/* ---------------- 数学 ---------------- */
const V3 = JW.V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

const M4 = JW.M4 = {
  ident() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(a, b) { // a*b（列主序）
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = far / (near - far); m[11] = -1; m[14] = near * far / (near - far);
    return m;
  },
  ortho(l, r, b, t, n, f) {
    const m = new Float32Array(16);
    m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = 1 / (n - f);
    m[12] = (l + r) / (l - r); m[13] = (b + t) / (b - t); m[14] = n / (n - f); m[15] = 1;
    return m;
  },
  lookAt(eye, target, up) {
    const z = V3.norm(V3.sub(eye, target)), x = V3.norm(V3.cross(up, z)), y = V3.cross(z, x);
    const m = new Float32Array(16);
    m[0] = x[0]; m[1] = y[0]; m[2] = z[0];
    m[4] = x[1]; m[5] = y[1]; m[6] = z[1];
    m[8] = x[2]; m[9] = y[2]; m[10] = z[2];
    m[12] = -V3.dot(x, eye); m[13] = -V3.dot(y, eye); m[14] = -V3.dot(z, eye); m[15] = 1;
    return m;
  },
  invert(m) {
    const inv = new Float32Array(16);
    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
    let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    det = 1 / (det || 1);
    for (let i = 0; i < 16; i++) inv[i] *= det;
    return inv;
  },
  // 由平移/缩放/欧拉旋转(XYZ 顺序: R = Rz*Ry*Rx)构造模型矩阵
  trs(t, s, r) {
    r = r || [0, 0, 0];
    const cx = Math.cos(r[0]), sx = Math.sin(r[0]), cy = Math.cos(r[1]), sy = Math.sin(r[1]), cz = Math.cos(r[2]), sz = Math.sin(r[2]);
    const m = new Float32Array(16);
    m[0] = cz * cy * s[0]; m[1] = sz * cy * s[0]; m[2] = -sy * s[0];
    m[4] = (cz * sy * sx - sz * cx) * s[1]; m[5] = (sz * sy * sx + cz * cx) * s[1]; m[6] = cy * sx * s[1];
    m[8] = (cz * sy * cx + sz * sx) * s[2]; m[9] = (sz * sy * cx - cz * sx) * s[2]; m[10] = cy * cx * s[2];
    m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
    return m;
  },
};

JW.clamp = (x, a, b) => Math.min(b, Math.max(a, x));
JW.smooth = (a, b, x) => { const t = JW.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
JW.lerp = (a, b, t) => a + (b - a) * t;

/* 确定性伪随机（演示可复现） */
JW.rng = function (seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* ---------------- WebGPU 辅助 ---------------- */
const GPU = JW.GPU = {
  device: null, context: null, format: null, canvas: null,

  async init(canvas) {
    if (!navigator.gpu) throw new Error('当前浏览器不支持 WebGPU');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('未找到可用的 WebGPU 适配器');
    const want = {
      maxStorageBuffersPerShaderStage: 12,
      maxComputeInvocationsPerWorkgroup: 256,
      maxStorageBufferBindingSize: 1 << 30,
      maxBufferSize: 1 << 30,
      maxColorAttachmentBytesPerSample: 64,
    };
    const requiredLimits = {};
    for (const k in want) if (adapter.limits[k] !== undefined) requiredLimits[k] = Math.min(want[k], adapter.limits[k]);
    const requiredFeatures = ['float32-filterable'].filter(f => adapter.features.has(f));
    const device = await adapter.requestDevice({ requiredLimits, requiredFeatures });
    device.addEventListener('uncapturederror', (e) => {
      const msg = (e.error && e.error.message) || String(e.error);
      if (JW.errors.length < 8 && !/previous error/.test(msg)) JW.errors.push(msg.slice(0, 400));
      console.error('[WebGPU]', msg);
    });
    device.lost.then((info) => { JW.errors.push('device lost: ' + info.message); console.error('device lost', info.message); });
    this.device = device; this.canvas = canvas;
    this.context = canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device, format: this.format, alphaMode: 'opaque' });
    this.f32filter = requiredFeatures.includes('float32-filterable');
    return device;
  },

  shader(code, label) {
    const m = this.device.createShaderModule({ code, label });
    m.getCompilationInfo().then((info) => {
      const lines = code.split('\n');
      for (const msg of info.messages) {
        if (msg.type !== 'error') continue;
        const txt = `[WGSL ${label}] ${msg.lineNum}:${msg.linePos} ${msg.message}\n  > ${(lines[msg.lineNum - 1] || '').trim()}`;
        if (JW.errors.length < 8) JW.errors.push(txt.slice(0, 400));
        console.error(txt);
      }
    });
    return m;
  },

  buffer(size, usage, data, label) {
    size = Math.max(16, Math.ceil(size / 4) * 4);
    const b = this.device.createBuffer({ size, usage, label });
    if (data) this.device.queue.writeBuffer(b, 0, data);
    return b;
  },
  storage(size, data, label, extra) {
    return this.buffer(size, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | (extra || 0), data, label);
  },
  uniform(size, data, label) {
    return this.buffer(size, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, data, label);
  },

  compute(code, label, entry) {
    return this.device.createComputePipeline({
      label, layout: 'auto',
      compute: { module: this.shader(code, label), entryPoint: entry || 'main' },
    });
  },

  // entries: { bindingIndex: GPUBuffer | GPUTextureView | GPUSampler | {buffer,offset,size} }
  bind(pipeline, entries, group, label) {
    const list = [];
    for (const k in entries) {
      const r = entries[k];
      list.push({ binding: +k, resource: (r instanceof GPUBuffer) ? { buffer: r } : r });
    }
    return this.device.createBindGroup({ label, layout: pipeline.getBindGroupLayout(group || 0), entries: list });
  },

  tex(w, h, format, usage, label, extra) {
    return this.device.createTexture(Object.assign({ size: [Math.max(1, w), Math.max(1, h)], format, usage, label }, extra || {}));
  },
};

/* 异步回读缓冲（用于音效事件、统计、调试） */
JW.Readback = class {
  constructor(size, label) {
    this.size = size; this.busy = false; this.data = null; this.serial = 0;
    this.buf = GPU.device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ, label });
  }
  // 在 encoder 中登记拷贝；submit 之后调用 fetch()
  copy(encoder, src, srcOffset) {
    if (this.busy) return false;
    encoder.copyBufferToBuffer(src, srcOffset || 0, this.buf, 0, this.size);
    this.pending = true;
    return true;
  }
  fetch() {
    if (!this.pending || this.busy) return null;
    this.pending = false; this.busy = true;
    return this.buf.mapAsync(GPUMapMode.READ).then(() => {
      this.data = this.buf.getMappedRange().slice(0);
      this.buf.unmap(); this.busy = false; this.serial++;
      return this.data;
    }).catch(() => { this.busy = false; return null; });
  }
};

/* 一次性读取任意缓冲（调试与导出同步用） */
JW.readBuffer = async function (src, offset, size) {
  const d = GPU.device;
  const tmp = d.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = d.createCommandEncoder();
  enc.copyBufferToBuffer(src, offset, tmp, 0, size);
  d.queue.submit([enc.finish()]);
  await tmp.mapAsync(GPUMapMode.READ);
  const out = tmp.getMappedRange().slice(0);
  tmp.unmap(); tmp.destroy();
  return out;
};
