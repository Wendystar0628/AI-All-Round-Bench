/* gpu.js — WebGPU device bootstrap and small buffer/texture helpers. */
(function (global) {
  'use strict';

  const Gpu = {
    async init(canvas) {
      if (!navigator.gpu) throw new Error('当前浏览器不支持 WebGPU');
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) throw new Error('无法获取 WebGPU 适配器（显卡驱动或浏览器设置问题）');
      const device = await adapter.requestDevice();
      device.lost.then((info) => {
        if (info.reason !== 'destroyed') console.error('[gpu] device lost:', info.message);
      });
      device.addEventListener('uncapturederror', (e) => {
        console.error('[gpu] uncaptured error:', e.error && e.error.message);
      });
      const context = canvas.getContext('webgpu');
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device,
        format,
        alphaMode: 'opaque',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
      });
      return { adapter, device, context, format };
    },

    buffer(device, data, usage, label) {
      const src = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const size = Math.max(4, Math.ceil(src.byteLength / 4) * 4);
      const b = device.createBuffer({ size, usage: usage | GPUBufferUsage.COPY_DST, label: label || '' });
      if (src.byteLength) device.queue.writeBuffer(b, 0, src);
      return b;
    },

    storage(device, byteLength, extraUsage, label) {
      return device.createBuffer({
        size: Math.max(16, Math.ceil(byteLength / 4) * 4),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | (extraUsage || 0),
        label: label || ''
      });
    },

    uniform(device, byteLength, label) {
      return device.createBuffer({
        size: Math.ceil(byteLength / 4) * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: label || ''
      });
    },

    texture(device, width, height, format, usage, label, sampleCount) {
      return device.createTexture({
        size: { width: Math.max(1, width | 0), height: Math.max(1, height | 0) },
        format,
        usage,
        sampleCount: sampleCount || 1,
        label: label || ''
      });
    }
  };

  global.Gpu = Gpu;
})(window);
