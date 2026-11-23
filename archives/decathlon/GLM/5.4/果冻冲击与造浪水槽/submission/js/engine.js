'use strict';
/* ---------------------------------------------------------------------------
   Gfx: WebGPU device bootstrap + resource helpers
   Mesh: vertex/index buffers, simple procedural geometry builders
   Targets: sized render targets (recreated on resize)
--------------------------------------------------------------------------- */

class Gfx {
  constructor(canvas) {
    this.canvas = canvas;
    this.device = null;
    this.context = null;
    this.format = 'bgra8unorm';
    this.width = 1;
    this.height = 1;
  }

  async init() {
    if (!navigator.gpu) throw new Error('此浏览器不支持 WebGPU');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('无法获取 GPU 适配器');
    this.adapter = adapter;
    const want = [];
    if (adapter.features.has('float32-blendable')) want.push('float32-blendable');
    if (adapter.features.has('float32-filterable')) want.push('float32-filterable');
    this.features = want;
    const limits = { maxBufferSize: 512 * 1024 * 1024 };
    const need = { maxStorageBuffersPerShaderStage: 16, maxComputeInvocationsPerWorkgroup: 256 };
    for (const k in need) {
      if ((adapter.limits[k] || 0) >= need[k]) limits[k] = need[k];
    }
    this.device = await adapter.requestDevice({ requiredFeatures: want, requiredLimits: limits });
    this.device.addEventListener('uncapturederror', (e) => {
      console.error('[WebGPU]', e.error && e.error.message);
    });
    this.context = this.canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    this.maxThreads = Math.min(1024, this.device.limits.maxComputeInvocationsPerWorkgroup || 256);
    return this;
  }

  buffer(size, usage, data) {
    const b = this.device.createBuffer({ size: Math.max(16, Math.ceil(size / 4) * 4), usage, mappedAtCreation: !!data });
    if (data) {
      const src = data instanceof Float32Array ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : data instanceof Uint32Array ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          : data instanceof Uint8Array ? data : new Uint8Array(data.buffer);
      new Uint8Array(b.getMappedRange()).set(src);
      b.unmap();
    }
    return b;
  }

  uniform(size, data) {
    return this.buffer(size, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, data);
  }

  storage(size, data) {
    return this.buffer(size, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, data);
  }

  texture(w, h, format, usage, sampleCount) {
    return this.device.createTexture({
      size: [Math.max(1, w), Math.max(1, h), 1],
      format,
      usage,
      sampleCount: sampleCount || 1,
    });
  }

  sampler(opts) {
    return this.device.createSampler(opts || {});
  }

  resize(w, h, dpr) {
    const nw = Math.max(1, Math.floor(w * dpr));
    const nh = Math.max(1, Math.floor(h * dpr));
    if (nw === this.width && nh === this.height) return false;
    this.width = nw; this.height = nh;
    this.canvas.width = nw;
    this.canvas.height = nh;
    return true;
  }

  // read back a buffer, returns ArrayBuffer
  async readback(buffer, size) {
    const rb = this.device.createBuffer({ size: Math.ceil(size / 4) * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(buffer, 0, rb, 0, size);
    this.device.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(rb.getMappedRange().slice(0));
    rb.unmap();
    rb.destroy();
    return out;
  }
}

/* ------------------------------------------------------------------ mesh */
const VTX_STRIDE = 12; // floats: pos3 normal3 color3 uv2 pad1

class MeshBuilder {
  constructor() { this.v = []; this.i = []; }
  vertex(p, n, c, u, vv) {
    this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], u, vv, 0);
    return this.v.length / VTX_STRIDE - 1;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  get empty() { return this.v.length === 0; }
  build(gfx) {
    const vdata = new Float32Array(this.v);
    const idata = new Uint32Array(this.i);
    return {
      vb: gfx.buffer(vdata.byteLength, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, vdata),
      ib: gfx.buffer(idata.byteLength, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST, idata),
      indexCount: idata.length,
      vertexCount: vdata.length / VTX_STRIDE,
    };
  }
  buildDynamic(gfx) {
    const vdata = new Float32Array(this.v);
    const idata = new Uint32Array(this.i);
    return {
      vb: gfx.buffer(vdata.byteLength, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, vdata),
      ib: gfx.buffer(idata.byteLength, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST, idata),
      indexCount: idata.length,
      vertexCount: vdata.length / VTX_STRIDE,
      maxV: vdata.length / VTX_STRIDE,
      maxI: idata.length,
    };
  }
}

/* --- primitive generators ------------------------------------------- */
const Geo = {
  // axis aligned box centered at origin
  box(mb, sx, sy, sz, color, cx = 0, cy = 0, cz = 0) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const faces = [
      // normal, tangent, bitangent
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
      [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
      [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
      [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    ];
    const half = [hx, hy, hz];
    for (const [n, t, b] of faces) {
      const base = [n[0] * hx, n[1] * hy, n[2] * hz];
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const idx = [];
      for (const [u, v] of corners) {
        const p = [base[0] + t[0] * u * hx + b[0] * v * hy,
          base[1] + t[1] * u * hx + b[1] * v * hy,
          base[2] + t[2] * u * hx + b[2] * v * hy];
        idx.push(mb.vertex([p[0] + cx, p[1] + cy, p[2] + cz], n, color, (u + 1) / 2, (v + 1) / 2));
      }
      mb.tri(idx[0], idx[1], idx[2]);
      mb.tri(idx[0], idx[2], idx[3]);
    }
  },

  sphere(mb, r, seg, rings, color, cx = 0, cy = 0, cz = 0, scale = [1, 1, 1]) {
    const grid = [];
    for (let j = 0; j <= rings; j++) {
      const v = j / rings, phi = v * Math.PI;
      const row = [];
      for (let i = 0; i <= seg; i++) {
        const u = i / seg, th = u * Math.PI * 2;
        const nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
        const p = [nx * r * scale[0] + cx, ny * r * scale[1] + cy, nz * r * scale[2] + cz];
        row.push(mb.vertex(p, [nx / scale[0], ny / scale[1], nz / scale[2]], color, u, v));
      }
      grid.push(row);
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i], d = grid[j + 1][i + 1];
        mb.tri(a, c, b); mb.tri(b, c, d);
      }
    }
  },

  // rounded box: sample the outer surface, project onto the offset surface of
  // the shrunk inner box. Gives correct smooth normals and rounded edges.
  roundedBox(mb, sx, sy, sz, rad, seg, color, cx = 0, cy = 0, cz = 0) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    rad = Math.min(rad, Math.min(hx, Math.min(hy, hz)) * 0.9);
    const ix = hx - rad, iy = hy - rad, iz = hz - rad;
    const N = seg;
    const pts = [];
    const idxOf = (i, j, k) => i * (N + 1) * (N + 1) + j * (N + 1) + k;
    const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) for (let k = 0; k <= N; k++) {
      const u = (i / N) * 2 - 1, v = (j / N) * 2 - 1, w = (k / N) * 2 - 1;
      const q = [u * hx, v * hy, w * hz];
      const c = [cl(q[0], -ix, ix), cl(q[1], -iy, iy), cl(q[2], -iz, iz)];
      let dx = q[0] - c[0], dy = q[1] - c[1], dz = q[2] - c[2];
      let dl = Math.hypot(dx, dy, dz);
      if (dl < 1e-9) { dx = u; dy = v; dz = w; dl = Math.hypot(dx, dy, dz) || 1; }
      const nx = dx / dl, ny = dy / dl, nz = dz / dl;
      pts.push([c[0] + nx * rad + cx, c[1] + ny * rad + cy, c[2] + nz * rad + cz, nx, ny, nz]);
    }
    const quad = (a, b, c, d) => {
      const P = [pts[a], pts[b], pts[c]];
      const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]];
      const e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
      const gn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const sn = [pts[a][3] + pts[b][3] + pts[c][3], pts[a][4] + pts[b][4] + pts[c][4], pts[a][5] + pts[b][5] + pts[c][5]];
      const flip = (gn[0] * sn[0] + gn[1] * sn[1] + gn[2] * sn[2]) < 0;
      const V = (i2, uu, vv) => mb.vertex([pts[i2][0], pts[i2][1], pts[i2][2]], [pts[i2][3], pts[i2][4], pts[i2][5]], color, uu, vv);
      const va = V(a, 0, 0), vb = V(b, 1, 0), vc = V(c, 1, 1), vd = V(d, 0, 1);
      if (!flip) { mb.tri(va, vb, vc); mb.tri(va, vc, vd); }
      else { mb.tri(va, vc, vb); mb.tri(va, vd, vc); }
    };
    for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
      quad(idxOf(0, j, k), idxOf(0, j, k + 1), idxOf(0, j + 1, k + 1), idxOf(0, j + 1, k));
      quad(idxOf(N, j, k), idxOf(N, j + 1, k), idxOf(N, j + 1, k + 1), idxOf(N, j, k + 1));
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) {
      quad(idxOf(i, 0, k), idxOf(i + 1, 0, k), idxOf(i + 1, 0, k + 1), idxOf(i, 0, k + 1));
      quad(idxOf(i, N, k), idxOf(i, N, k + 1), idxOf(i + 1, N, k + 1), idxOf(i + 1, N, k));
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      quad(idxOf(i, j, 0), idxOf(i, j + 1, 0), idxOf(i + 1, j + 1, 0), idxOf(i + 1, j, 0));
      quad(idxOf(i, j, N), idxOf(i + 1, j, N), idxOf(i + 1, j + 1, N), idxOf(i, j + 1, N));
    }
  },

  cylinder(mb, r, h, seg, color, cx = 0, cy = 0, cz = 0, axis = 'y') {
    const top = [], bot = [];
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      let p, n;
      if (axis === 'y') { p = [ca * r, 0, sa * r]; n = [ca, 0, sa]; }
      else if (axis === 'z') { p = [ca * r, sa * r, 0]; n = [ca, sa, 0]; }
      else { p = [0, ca * r, sa * r]; n = [0, ca, sa]; }
      const t = axis === 'y' ? [0, h / 2, 0] : (axis === 'z' ? [0, 0, h / 2] : [h / 2, 0, 0]);
      top.push(mb.vertex([p[0] + t[0] + cx, p[1] + t[1] + cy, p[2] + t[2] + cz], n, color, i / seg, 1));
      bot.push(mb.vertex([p[0] - t[0] + cx, p[1] - t[1] + cy, p[2] - t[2] + cz], n, color, i / seg, 0));
    }
    for (let i = 0; i < seg; i++) {
      mb.tri(bot[i], top[i], top[i + 1]);
      mb.tri(bot[i], top[i + 1], bot[i + 1]);
    }
  },

  // heightfield grid over [x0,x1]x[z0,z1]
  heightfield(mb, x0, x1, z0, z1, nx, nz, hFn, color, yOff = 0) {
    const idx = [];
    for (let j = 0; j <= nz; j++) {
      const row = [];
      for (let i = 0; i <= nx; i++) {
        const x = lerp(x0, x1, i / nx), z = lerp(z0, z1, j / nz);
        const y = hFn(x, z);
        // normal via central differences
        const e = 0.004;
        const hx = (hFn(x + e, z) - hFn(x - e, z)) / (2 * e);
        const hz = (hFn(x, z + e) - hFn(x, z - e)) / (2 * e);
        const n = [-hx, 1, -hz];
        const nl = Math.hypot(n[0], n[1], n[2]);
        row.push(mb.vertex([x, y + yOff, z], [n[0] / nl, n[1] / nl, n[2] / nl], color, i / nx, j / nz));
      }
      idx.push(row);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = idx[j][i], b = idx[j][i + 1], c = idx[j + 1][i], d = idx[j + 1][i + 1];
      mb.tri(a, c, b); mb.tri(b, c, d);
    }
  },

  disk(mb, r, seg, color, cx = 0, cy = 0, cz = 0, rings = 1) {
    const c = mb.vertex([cx, cy, cz], [0, 1, 0], color, 0.5, 0.5);
    const ring = [];
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2;
      ring.push(mb.vertex([cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r], [0, 1, 0], color, 0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)));
    }
    for (let i = 0; i < seg; i++) mb.tri(c, ring[i + 1], ring[i]);
  },
};
