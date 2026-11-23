/* WebGPU 设备与资源辅助 */
'use strict';
const GFX = {
  device: null, adapter: null, format: 'bgra8unorm',
  async init(canvas) {
    if (!navigator.gpu) throw new Error('当前浏览器不支持 WebGPU');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('无法获取 WebGPU 适配器');
    const device = await adapter.requestDevice({
      label: 'main-device',
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
        maxComputeWorkgroupsPerDimension: adapter.limits.maxComputeWorkgroupsPerDimension
      }
    });
    device.lost.then(info => { console.error('WebGPU device lost:', info.message); });
    device.addEventListener('uncapturederror', e => { console.error('WebGPU uncaptured:', e.error.message); });
    this.device = device; this.adapter = adapter;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx = canvas.getContext('webgpu');
    this.canvas = canvas;
    this.configureCanvas();
    return device;
  },
  configureCanvas() {
    this.ctx.configure({ device: this.device, format: this.format, alphaMode: 'opaque', width: this.canvas.width, height: this.canvas.height });
  },
  buffer(size, usage, label) {
    return this.device.createBuffer({ label: label || '', size: Math.max(4, Math.ceil(size / 4) * 4), usage });
  },
  storage(dataOrSize, label, extraUsage) {
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | (extraUsage || 0);
    if (typeof dataOrSize === 'number') return this.buffer(dataOrSize, usage, label);
    const b = this.buffer(dataOrSize.byteLength, usage, label);
    this.device.queue.writeBuffer(b, 0, dataOrSize);
    return b;
  },
  write(buf, data, offset) { this.device.queue.writeBuffer(buf, offset || 0, data.buffer ? data : data, data.byteOffset || 0, data.byteLength); },
  shader(code, label) {
    const m = this.device.createShaderModule({ label: label || '', code });
    return m;
  },
  computePipeline(module, entry, label) {
    return this.device.createComputePipeline({ label: label || entry, layout: 'auto', compute: { module, entryPoint: entry } });
  },
  bindGroup(pipeline, index, entries) {
    return this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(index), entries });
  },
  texture(w, h, format, usage, label) {
    return this.device.createTexture({ label: label || '', size: [w, h], format, usage });
  }
};
window.GFX = GFX;
