// 后处理：HDR 颜色 -> 色调映射（ACES 拟合）-> 伽马 -> 暗角，输出到画布。两个场景共用。
const Post = {
  pipeline: null,
  layout: null,
  uniform: null,

  create() {
    const dev = GPUX.device;
    const mod = GPUX.shader(/* wgsl */ `
struct PU { size: vec4f, exposure: vec4f };
@group(0) @binding(0) var hdr: texture_2d<f32>;
@group(0) @binding(1) var<uniform> pu: PU;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let x = f32((i << 1u) & 2u) * 2.0 - 1.0;
  let y = f32(i & 2u) * 2.0 - 1.0;
  return vec4f(x, y, 0.0, 1.0);
}

fn aces(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dims = vec2i(pu.size.xy);
  let coord = clamp(vec2i(fc.xy), vec2i(0), dims - vec2i(1));
  var c = textureLoad(hdr, coord, 0).rgb;
  let uv = fc.xy / pu.size.xy;
  let q = (uv - vec2f(0.5)) * vec2f(1.0, 1.0);
  let vig = 1.0 - 0.42 * pow(clamp(length(q) * 1.25, 0.0, 1.0), 2.4);
  c = c * vig * pu.exposure.x;
  c = aces(c);
  c = pow(c, vec3f(1.0 / 2.2));
  // 极轻的颗粒感，避免大块色带
  let g = fract(sin(dot(fc.xy, vec2f(12.9898, 78.233))) * 43758.5453);
  c = c + (g - 0.5) * (1.0 / 255.0);
  return vec4f(c, 1.0);
}
`, 'post');
    this.layout = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    this.pipeline = dev.createRenderPipeline({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [this.layout] }),
      vertex: { module: mod, entryPoint: 'vs' },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format: GPUX.format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.uniform = GPUX.uniform(32, 'post-uniform');
  },

  // 把 HDR 纹理绘制到画布
  draw(encoder, hdrTex, canvasView, w, h, exposure) {
    const dev = GPUX.device;
    GPUX.write(this.uniform, new Float32Array([w, h, 1 / w, 1 / h, exposure || 1, 0, 0, 0]));
    const bg = dev.createBindGroup({
      layout: this.layout,
      entries: [
        { binding: 0, resource: hdrTex.createView() },
        { binding: 1, resource: { buffer: this.uniform } },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: canvasView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bg);
    pass.draw(3);
    pass.end();
  },
};
