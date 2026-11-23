'use strict';
/* 渲染器：两个场景共用。阴影图 → 光向吸收图 → (水槽)水面高度/焦散 → 不透明场景 → 粒子深度/厚度 → 平滑/法线 → 合成 → 玻璃 → 后期 */
(function () {
  const GPU = JW.GPU, S = JW.SH, M4 = JW.M4, V3 = JW.V3;
  const HDR = 'rgba16float', DEPTH = 'depth32float';
  const TU = GPUTextureUsage;

  function cubeMesh() {
    const v = [], idx = [];
    const faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const n of faces) {
      const a = [n[1], n[2], n[0]], b = V3.cross(n, a);
      const base = v.length / 6;
      for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        v.push((n[0] + a[0] * s + b[0] * t) * 0.5, (n[1] + a[1] * s + b[1] * t) * 0.5, (n[2] + a[2] * s + b[2] * t) * 0.5, n[0], n[1], n[2]);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return { v: new Float32Array(v), i: new Uint16Array(idx) };
  }
  function cylMesh(seg) {
    const v = [], idx = [];
    for (let s = 0; s <= seg; s++) {
      const a = s / seg * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      v.push(c * 0.5, -0.5, sn * 0.5, c, 0, sn, c * 0.5, 0.5, sn * 0.5, c, 0, sn);
    }
    for (let s = 0; s < seg; s++) { const b = s * 2; idx.push(b, b + 1, b + 3, b, b + 3, b + 2); }
    for (const y of [-0.5, 0.5]) {
      const c0 = v.length / 6;
      v.push(0, y, 0, 0, Math.sign(y), 0);
      for (let s = 0; s <= seg; s++) { const a = s / seg * Math.PI * 2; v.push(Math.cos(a) * 0.5, y, Math.sin(a) * 0.5, 0, Math.sign(y), 0); }
      for (let s = 0; s < seg; s++) { if (y > 0) idx.push(c0, c0 + 2 + s, c0 + 1 + s); else idx.push(c0, c0 + 1 + s, c0 + 2 + s); }
    }
    return { v: new Float32Array(v), i: new Uint16Array(idx) };
  }
  function terrainMesh(L, n) {
    const NXc = Math.round(L[0] / n), NZc = Math.round(L[2] / n);
    const v = [], idx = [];
    const H = JW.terrainH;
    for (let k = 0; k <= NZc; k++) for (let i = 0; i <= NXc; i++) {
      const x = i * n, z = k * n, e = 0.004;
      const hx = (H(x + e, z) - H(x - e, z)) / (2 * e), hz = (H(x, z + e) - H(x, z - e)) / (2 * e);
      const l = Math.hypot(hx, 1, hz);
      v.push(x, H(x, z), z, -hx / l, 1 / l, -hz / l);
    }
    for (let k = 0; k < NZc; k++) for (let i = 0; i < NXc; i++) {
      const a = k * (NXc + 1) + i, b = a + 1, c = a + NXc + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const skirt = (pts, nrm) => {
      for (let s = 0; s < pts.length - 1; s++) {
        const p = pts[s], q = pts[s + 1], base = v.length / 6;
        v.push(p[0], H(p[0], p[1]), p[1], ...nrm, q[0], H(q[0], q[1]), q[1], ...nrm, p[0], 0, p[1], ...nrm, q[0], 0, q[1], ...nrm);
        idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    };
    const ex = [], ex2 = [], ez = [], ez2 = [];
    for (let i = 0; i <= NXc; i++) { ex.push([i * n, L[2]]); ex2.push([i * n, 0]); }
    for (let k = 0; k <= NZc; k++) { ez.push([L[0], k * n]); ez2.push([0, k * n]); }
    skirt(ex, [0, 0, 1]); skirt(ex2, [0, 0, -1]); skirt(ez, [1, 0, 0]); skirt(ez2, [-1, 0, 0]);
    return { v: new Float32Array(v), i: new Uint32Array(idx) };
  }

  JW.Renderer = class {
    constructor(jelly, water) {
      const d = GPU.device;
      this.jelly = jelly; this.water = water;
      this.scene = 0;
      this.frameData = new Float32Array(200);
      this.fbuf = GPU.uniform(800, null, 'frame');
      this.lin = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
      this.cmp = d.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });
      this.maxInst = 96;
      this.instData = new Float32Array(this.maxInst * 24);
      this.instBuf = GPU.storage(this.maxInst * 96, null, 'inst');
      const cube = cubeMesh(), cyl = cylMesh(40), ter = terrainMesh(water.L, 0.01);
      const vb = (a) => GPU.buffer(a.byteLength, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, a);
      const ib = (a) => GPU.buffer(a.byteLength, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST, a);
      this.mesh = {
        cube: { vb: vb(cube.v), ib: ib(cube.i), n: cube.i.length, fmt: 'uint16' },
        cyl: { vb: vb(cyl.v), ib: ib(cyl.i), n: cyl.i.length, fmt: 'uint16' },
        ter: { vb: vb(ter.v), ib: ib(ter.i), n: ter.i.length, fmt: 'uint32' },
      };
      // 固定尺寸的光空间纹理
      this.shadowTex = GPU.tex(2048, 2048, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, 'shadow');
      this.absTex = GPU.tex(1024, 1024, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, 'abs');
      this.absZ = GPU.tex(1024, 1024, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, 'absZ');
      this.topTex = GPU.tex(1024, 256, 'r32float', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, 'top');
      this.topZ = GPU.tex(1024, 256, DEPTH, TU.RENDER_ATTACHMENT, 'topZ');
      this.hA = GPU.tex(1024, 256, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, 'hA');
      this.hB = GPU.tex(1024, 256, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, 'hB');
      this.causTex = GPU.tex(1024, 256, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, 'caustic');
      this.views = {};
      for (const k of ['shadowTex', 'absTex', 'absZ', 'topTex', 'topZ', 'hA', 'hB', 'causTex']) this.views[k] = this[k].createView();
      const u4 = (a) => GPU.uniform(16, new Float32Array(a));
      this.uDir = { x1: u4([1, 0, 1, 0]), y1: u4([0, 1, 1, 0]), x2: u4([1, 0, 0.55, 0]), y2: u4([0, 1, 0.55, 0]), hx: u4([1, 0, 1, 0]), hy: u4([0, 1, 0, 0]) };
      this.uTone = GPU.uniform(16);
      this.exposure = 0.62;
      this._pipelines();
      this.w = 0; this.h = 0;
    }

    _pipelines() {
      const d = GPU.device;
      const mods = new Map();
      const mod = (code, label) => { if (!mods.has(code)) mods.set(code, GPU.shader(code, label)); return mods.get(code); };
      const VBL = [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] }];
      const mk = (label, code, vsE, fsE, targets, o) => {
        o = o || {};
        const m = mod(code, label);
        const desc = {
          label, layout: 'auto',
          vertex: { module: m, entryPoint: vsE, buffers: o.buffers || [] },
          primitive: { topology: o.topology || 'triangle-list', cullMode: o.cull || 'none' },
        };
        if (fsE) desc.fragment = { module: m, entryPoint: fsE, targets: targets || [] };
        if (o.depth) desc.depthStencil = { format: DEPTH, depthWriteEnabled: o.depthWrite !== false, depthCompare: o.depthCompare || 'less', depthBias: o.bias || 0, depthBiasSlopeScale: o.slope || 0 };
        return d.createRenderPipeline(desc);
      };
      const add = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
      const bmin = { color: { operation: 'min', srcFactor: 'one', dstFactor: 'one' }, alpha: { operation: 'min', srcFactor: 'one', dstFactor: 'one' } };
      const over = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
      const P = this.P = {};
      P.floor = mk('floor', S.FLOOR, 'vs', 'fs', [{ format: HDR }], { depth: true, depthCompare: 'always' });
      P.mesh = mk('mesh', S.MESH, 'vs', 'fs', [{ format: HDR }], { depth: true, buffers: VBL, cull: 'back' });
      P.meshShadow = mk('meshShadow', S.MESH, 'vsShadow', null, null, { depth: true, buffers: VBL, bias: 2, slope: 2.0 });
      P.glassBack = mk('glassBack', S.MESH, 'vs', 'fsGlass', [{ format: HDR, blend: over }], { depth: true, depthWrite: false, buffers: VBL });
      P.terrain = mk('terrain', S.TERRAIN, 'vs', 'fs', [{ format: HDR }], { depth: true, buffers: VBL });
      P.terrainShadow = mk('terrainShadow', S.TERRAIN, 'vsShadow', null, null, { depth: true, buffers: VBL, bias: 2, slope: 2.0 });
      P.balls = mk('balls', S.BALLS, 'vs', 'fs', [{ format: HDR }], { depth: true, topology: 'triangle-strip' });
      P.ballShadow = mk('ballShadow', S.BALLS, 'vsShadow', 'fsShadow', [], { depth: true, topology: 'triangle-strip' });
      P.pDepth = mk('pDepth', S.PART, 'vsDepth', 'fsDepth', [{ format: 'r32float' }], { depth: true, topology: 'triangle-strip' });
      P.pThick = mk('pThick', S.PART, 'vsThick', 'fsThick', [{ format: HDR, blend: add }, { format: HDR, blend: add }], { topology: 'triangle-strip' });
      P.pAbs = mk('pAbs', S.PART, 'vsAbs', 'fsAbs', [{ format: HDR, blend: add }, { format: HDR, blend: bmin }], { topology: 'triangle-strip' });
      P.pTop = mk('pTop', S.PART, 'vsTop', 'fsTop', [{ format: 'r32float' }], { depth: true, topology: 'triangle-strip' });
      P.smooth = mk('smooth', S.SMOOTH, 'vs', 'fs', [{ format: 'r32float' }]);
      P.normal = mk('normal', S.NORMAL, 'vs', 'fs', [{ format: HDR }]);
      P.composite = mk('composite', S.COMPOSITE, 'vs', 'fs', [{ format: HDR }]);
      P.hblur = mk('hblur', S.HBLUR, 'vs', 'fs', [{ format: HDR }]);
      P.caustic = mk('caustic', S.CAUSTIC, 'vs', 'fs', [{ format: HDR, blend: add }]);
      P.prefilter = mk('prefilter', S.POST, 'vs', 'fsPrefilter', [{ format: HDR }]);
      P.down = mk('down', S.POST, 'vs', 'fsDown', [{ format: HDR }]);
      P.up = mk('up', S.POST, 'vs', 'fsUp', [{ format: HDR, blend: add }]);
      P.tonemap = mk('tonemap', S.TONEMAP, 'vs', 'fs', [{ format: 'rgba8unorm' }]);
      P.fxaa = mk('fxaa', S.FXAA, 'vs', 'fs', [{ format: GPU.format }]);
    }

    resize(w, h) {
      w = Math.max(16, Math.floor(w)); h = Math.max(16, Math.floor(h));
      if (w === this.w && h === this.h) return;
      this.w = w; this.h = h;
      const sc = Math.min(1, 1920 / w);
      const fw = this.fw = Math.max(8, Math.round(w * sc)), fh = this.fh = Math.max(8, Math.round(h * sc));
      const T = this.T || (this.T = {});
      for (const k in T) T[k].destroy();
      const RT = TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING;
      T.sceneColor = GPU.tex(w, h, HDR, RT, 'sceneColor');
      T.sceneDepth = GPU.tex(w, h, DEPTH, RT, 'sceneDepth');
      T.hdr = GPU.tex(w, h, HDR, RT, 'hdr');
      T.ldr = GPU.tex(w, h, 'rgba8unorm', RT, 'ldr');
      T.fRaw = GPU.tex(fw, fh, 'r32float', RT, 'fRaw');
      T.fZ = GPU.tex(fw, fh, DEPTH, TU.RENDER_ATTACHMENT, 'fZ');
      T.fA = GPU.tex(fw, fh, 'r32float', RT, 'fA');
      T.fB = GPU.tex(fw, fh, 'r32float', RT, 'fB');
      T.fN = GPU.tex(fw, fh, HDR, RT, 'fN');
      T.thA = GPU.tex(fw >> 1, fh >> 1, HDR, RT, 'thA');
      T.thB = GPU.tex(fw >> 1, fh >> 1, HDR, RT, 'thB');
      this.bloomN = 5;
      for (let i = 0; i < this.bloomN; i++) T['b' + i] = GPU.tex(Math.max(2, w >> (i + 1)), Math.max(2, h >> (i + 1)), HDR, RT, 'bloom' + i);
      const V = this.V = {};
      for (const k in T) V[k] = T[k].createView();
      this._bindGroups();
    }

    _bindGroups() {
      const P = this.P, V = this.V, LV = this.views;
      const sims = [this.jelly, this.water];
      const base = { 0: this.fbuf, 1: this.lin, 2: this.cmp, 3: LV.shadowTex, 4: LV.absTex, 5: LV.causTex, 6: LV.hB, 18: LV.absZ, 8: this.instBuf, 10: V.sceneColor, 11: V.sceneDepth, 12: V.fN, 13: V.thA, 14: V.thB };
      const pick = (pipe, keys, extra) => {
        const e = {};
        for (const k of keys) e[k] = (extra && extra[k] !== undefined) ? extra[k] : base[k];
        return GPU.bind(pipe, e);
      };
      this.G = sims.map((sim) => {
        const ex = { 7: sim.buf.balls, 9: sim.buf.pos };
        return {
          floor: pick(P.floor, [0, 1, 2, 3, 4, 5, 6, 7, 18], ex),
          mesh: pick(P.mesh, [0, 1, 2, 3, 4, 5, 6, 8, 18], ex),
          meshShadow: pick(P.meshShadow, [0, 8], ex),
          glass: pick(P.glassBack, [0, 2, 3, 8], ex),
          terrain: pick(P.terrain, [0, 1, 2, 3, 4, 5, 6, 7, 18], ex),
          terrainShadow: pick(P.terrainShadow, [0], ex),
          balls: pick(P.balls, [0, 1, 2, 3, 4, 5, 6, 7, 18], ex),
          ballShadow: pick(P.ballShadow, [0, 7], ex),
          pDepth: pick(P.pDepth, [0, 9, 11], ex),
          pThick: pick(P.pThick, [0, 9, 11], ex),
          pAbs: pick(P.pAbs, [0, 9], ex),
          pTop: pick(P.pTop, [0, 9], ex),
          composite: pick(P.composite, [0, 1, 2, 3, 7, 10, 11, 12, 13, 14], ex),
        };
      });
      const U = this.uDir;
      this.GS = {
        s1: GPU.bind(P.smooth, { 0: this.fbuf, 15: V.fRaw, 17: U.x1 }),
        s2: GPU.bind(P.smooth, { 0: this.fbuf, 15: V.fA, 17: U.y1 }),
        s3: GPU.bind(P.smooth, { 0: this.fbuf, 15: V.fB, 17: U.x2 }),
        s4: GPU.bind(P.smooth, { 0: this.fbuf, 15: V.fA, 17: U.y2 }),
        normal: GPU.bind(P.normal, { 0: this.fbuf, 15: V.fB }),
        hb1: GPU.bind(P.hblur, { 0: this.fbuf, 15: LV.topTex, 17: U.hx }),
        hb2: GPU.bind(P.hblur, { 0: this.fbuf, 15: LV.hA, 17: U.hy }),
        caustic: GPU.bind(P.caustic, { 0: this.fbuf, 15: LV.hB }),
        prefilter: GPU.bind(P.prefilter, { 1: this.lin, 15: V.hdr }),
        down: [], up: [],
        tonemap: GPU.bind(P.tonemap, { 1: this.lin, 15: V.hdr, 16: V.b0, 17: this.uTone }),
        fxaa: GPU.bind(P.fxaa, { 1: this.lin, 15: V.ldr }),
      };
      for (let i = 1; i < this.bloomN; i++) this.GS.down[i] = GPU.bind(P.down, { 1: this.lin, 15: V['b' + (i - 1)] });
      for (let i = 0; i < this.bloomN - 1; i++) this.GS.up[i] = GPU.bind(P.up, { 1: this.lin, 15: V['b' + (i + 1)] });
    }

    /* ---- 实例（盒/柱）---- */
    _inst(list, model, color, mat, rough, metal, emis, flag) {
      const o = list.n * 24, a = this.instData;
      if (list.n >= this.maxInst) return;
      a.set(model, o);
      a[o + 16] = color[0]; a[o + 17] = color[1]; a[o + 18] = color[2]; a[o + 19] = mat;
      a[o + 20] = rough; a[o + 21] = metal; a[o + 22] = emis || 0; a[o + 23] = flag || 0;
      list.n++;
    }
    _buildInstances(cam) {
      const L = { n: 0 };
      const R = this.ranges = { cube: [0, 0], cyl: [0, 0], glassBack: [0, 0], glassFront: [0, 0] };
      const box = (c, s, col, mat, rough, metal, rot, emis, flag) => this._inst(L, M4.trs(c, s, rot), col, mat, rough, metal, emis, flag);
      if (this.scene === 1) {
        const w = this.water, Lx = w.L[0], Lz = w.L[2], off = this.simOff;
        const X = (x) => x - off[0], Y = (y) => y - off[1], Z = (z) => z - off[2];
        const g = 0.012, Hg = 0.47, baseH = -off[1];
        const steel = [0.62, 0.64, 0.67], dark = [0.085, 0.09, 0.10], accent = [0.95, 0.42, 0.12];
        // 底座
        box([X(Lx / 2 - 0.17), baseH / 2 - g / 2, Z(Lz / 2)], [Lx + 0.44, baseH - g, Lz + 0.10], dark, 2, 0.55, 0.0);
        box([X(Lx / 2 - 0.17), baseH - g - 0.004, Z(Lz / 2)], [Lx + 0.46, 0.008, Lz + 0.12], steel, 1, 0.3, 1.0);
        // 造浪机构：推板 + 吊臂 + 滑车 + 连杆 + 曲柄 + 电机
        const px = w.paddle.x, pt = 0.014;
        box([X(px - pt / 2), Y(0.225), Z(Lz / 2)], [pt, 0.45, Lz - 0.006], [0.20, 0.34, 0.52], 1, 0.35, 1.0);
        box([X(px + 0.001), Y(0.225), Z(Lz / 2)], [0.003, 0.45, Lz - 0.004], [0.05, 0.05, 0.055], 2, 0.8, 0.0);
        box([X(px - pt / 2), Y(0.50), Z(0.06)], [0.02, 0.14, 0.02], steel, 1, 0.3, 1.0);
        box([X(px - pt / 2), Y(0.50), Z(Lz - 0.06)], [0.02, 0.14, 0.02], steel, 1, 0.3, 1.0);
        const cy = Y(Hg + 0.085);
        box([X(px - pt / 2), cy, Z(Lz / 2)], [0.09, 0.035, Lz + 0.07], dark, 2, 0.5, 0.0);
        // 导轨
        box([X(0.03), Y(Hg + 0.035), Z(-0.012)], [0.36, 0.014, 0.022], steel, 1, 0.25, 1.0);
        box([X(0.03), Y(Hg + 0.035), Z(Lz + 0.012)], [0.36, 0.014, 0.022], steel, 1, 0.25, 1.0);
        // 电机与曲柄
        const mx = X(-0.27), my = cy + 0.005;
        box([mx - 0.07, my - 0.02, Z(Lz / 2)], [0.20, 0.15, 0.17], dark, 2, 0.5, 0.0);
        box([mx - 0.07, my - 0.02, Z(Lz / 2) + 0.088], [0.14, 0.09, 0.006], accent, 2, 0.45, 0.0, null, 0.25);
        box([mx - 0.07, (my - 0.095 + baseH) / 2, Z(Lz / 2)], [0.07, my - 0.095 - baseH, 0.11], steel, 1, 0.3, 1.0);
        const ph = w.paddle.phase, cr = 0.055;
        const pin = [mx + 0.06 + Math.sin(ph) * cr * 0.0, my + 0.0, Z(Lz / 2) + 0.115];
        const pinP = [mx + 0.03 + Math.sin(ph) * cr, my + Math.cos(ph) * cr, Z(Lz / 2) + 0.118];
        const carr = [X(px - pt / 2 - 0.03), cy + 0.03, Z(Lz / 2) + 0.118];
        const dxr = carr[0] - pinP[0], dyr = carr[1] - pinP[1], lr = Math.hypot(dxr, dyr);
        box([(carr[0] + pinP[0]) / 2, (carr[1] + pinP[1]) / 2, carr[2]], [lr, 0.016, 0.008], steel, 1, 0.25, 1.0, [0, 0, Math.atan2(dyr, dxr)]);
        box([carr[0], carr[1] - 0.012, Z(Lz / 2) + 0.06], [0.03, 0.03, 0.13], dark, 2, 0.5, 0.0);
        R.cube = [0, L.n];
        // 圆柱：曲柄盘、销轴
        const c0 = L.n;
        this._inst(L, M4.trs([mx + 0.03, my, Z(Lz / 2) + 0.098], [0.15, 0.022, 0.15], [Math.PI / 2, 0, 0]), accent, 2, 0.4, 0.0, 0.08, 0);
        this._inst(L, M4.trs(pinP, [0.022, 0.02, 0.022], [Math.PI / 2, 0, 0]), steel, 1, 0.2, 1.0, 0, 0);
        this._inst(L, M4.trs([carr[0], carr[1], carr[2]], [0.022, 0.02, 0.022], [Math.PI / 2, 0, 0]), steel, 1, 0.2, 1.0, 0, 0);
        R.cyl = [c0, L.n];
        // 玻璃：按相机在板的内/外侧分到“水体之前/之后”两批
        const gb = [], gf = [];
        const pane = (c, s, nrm, edge) => {
          const front = V3.dot(V3.sub(cam.eye, c), nrm) > 0;
          (front ? gf : gb).push([c, s, edge]);
        };
        const gy = Y(Hg / 2 - g / 2), gh = Hg + g;
        pane([X(Lx / 2), gy, Z(Lz + g / 2)], [Lx + 2 * g, gh, g], [0, 0, 1], 0);
        pane([X(Lx / 2), gy, Z(-g / 2)], [Lx + 2 * g, gh, g], [0, 0, -1], 0);
        pane([X(Lx + g / 2), gy, Z(Lz / 2)], [g, gh, Lz], [1, 0, 0], 0);
        pane([X(-g / 2), gy, Z(Lz / 2)], [g, gh, Lz], [-1, 0, 0], 0);
        gb.push([[X(Lx / 2), Y(-g / 2), Z(Lz / 2)], [Lx, g, Lz], 0]);
        // 断面亮边：上沿与四条竖棱
        const e = 0.004, ty = Y(Hg) + e / 2;
        const rims = [
          [[X(Lx / 2), ty, Z(Lz + g / 2)], [Lx + 2 * g, e, g], [0, 0, 1]], [[X(Lx / 2), ty, Z(-g / 2)], [Lx + 2 * g, e, g], [0, 0, -1]],
          [[X(Lx + g / 2), ty, Z(Lz / 2)], [g, e, Lz], [1, 0, 0]], [[X(-g / 2), ty, Z(Lz / 2)], [g, e, Lz], [-1, 0, 0]],
        ];
        for (const r of rims) gf.push([r[0], r[1], 1]);
        for (const [sx, sz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const c = [X(sx ? Lx + g / 2 : -g / 2), gy, Z(sz ? Lz + g / 2 : -g / 2)];
          const front = V3.dot(V3.sub(cam.eye, c), [sx ? 1 : -1, 0, sz ? 1 : -1]) > 0;
          (front ? gf : gb).push([c, [g * 0.9, gh, g * 0.9], 1]);
        }
        const b0 = L.n;
        for (const p of gb) box(p[0], p[1], [1, 1, 1], 0, 0.05, 0, null, 0, p[2]);
        R.glassBack = [b0, L.n];
        const f0 = L.n;
        for (const p of gf) box(p[0], p[1], [1, 1, 1], 0, 0.05, 0, null, 0, p[2]);
        R.glassFront = [f0, L.n];
      }
      GPU.device.queue.writeBuffer(this.instBuf, 0, this.instData, 0, Math.max(24, L.n * 24));
    }

    _writeFrame(cam, opts) {
      const f = this.frameData, w = this.w, h = this.h;
      const sim = this.scene === 0 ? this.jelly : this.water;
      const aspect = w / h;
      const fov = (cam.fov || 36) * Math.PI / 180;
      const proj = M4.perspective(fov, aspect, 0.05, 60);
      const view = M4.lookAt(cam.eye, cam.target, [0, 1, 0]);
      const vp = M4.mul(proj, view);
      const toL = V3.norm([-0.46, 0.84, 0.40]);
      const ctr = this.scene === 0 ? [0, 0.15, 0] : [0, 0.3, 0];
      const Sx = this.scene === 0 ? 1.25 : 1.65;
      const lview = M4.lookAt(V3.add(ctr, V3.scale(toL, 4)), ctr, [0, 1, 0]);
      const lvp = M4.mul(M4.ortho(-Sx, Sx, -Sx, Sx, 0.1, 9), lview);
      f.set(vp, 0); f.set(view, 16); f.set(proj, 32); f.set(lvp, 48);
      f.set([cam.eye[0], cam.eye[1], cam.eye[2], 0], 64);
      f.set([toL[0], toL[1], toL[2], 3.1], 68);
      f.set([w, h, 1 / w, 1 / h], 72);
      f.set([this.fw, this.fh, 1 / this.fw, 1 / this.fh], 76);
      const ty = Math.tan(fov / 2);
      f.set([ty * aspect, ty, 0.05, 60], 80);
      const off = this.simOff;
      const rt = 0.0085;
      const vp0 = Math.pow(sim.dx / 2, 3);
      f.set([off[0], off[1], off[2], this.scene === 0 ? 0.0064 : 0.0066], 84);
      f.set([rt, vp0 / (4 / 3 * Math.PI * rt * rt * rt), this.scene === 0 ? 0.013 : 0.016, this.scene === 0 ? 0.055 : 0.035], 88);
      const W = this.water;
      f.set([W.L[0], W.L[1], W.L[2], W.waterLevel], 92);
      f.set([W.paddle.x, sim.nBalls, this.exposure, opts.time || 0], 96);
      f.set([1 / Sx, 1 / Sx, this.scene, this.scene === 1 ? 1 : 0], 100);
      if (this.scene === 0) {
        this.jelly.jellies.forEach((j, i) => { f.set([j.abs[0], j.abs[1], j.abs[2], 1.0], 104 + i * 4); f.set([j.col[0], j.col[1], j.col[2], 11], 136 + i * 4); });
      } else {
        f.set([3.9, 0.80, 0.52, 1.0], 104);
        f.set([0.10, 0.46, 0.55, 2.2], 136);
      }
      const gc = opts.groupColors || [];
      for (let i = 0; i < 8; i++) { const c = gc[i] || [1, 1, 1]; f.set([c[0], c[1], c[2], 1], 168 + i * 4); }
      GPU.device.queue.writeBuffer(this.fbuf, 0, f);
      GPU.device.queue.writeBuffer(this.uTone, 0, new Float32Array([this.exposure, 0.05, 0.42, opts.time || 0]));
    }

    setScene(id) {
      this.scene = id;
      const w = this.water;
      this.simOff = id === 0 ? this.jelly.origin.slice() : [w.L[0] / 2, -0.062, w.L[2] / 2];
    }

    render(cam, opts) {
      opts = opts || {};
      const d = GPU.device, P = this.P, V = this.V, LV = this.views, M = this.mesh;
      const sim = this.scene === 0 ? this.jelly : this.water;
      const G = this.G[this.scene], GS = this.GS, R0 = this.ranges;
      this._writeFrame(cam, opts);
      this._buildInstances(cam);
      const R = this.ranges;
      const np = sim.np, nb = sim.nBalls, isWater = this.scene === 1;
      const enc = d.createCommandEncoder();
      const drawMesh = (rp, pipe, bg, range, mesh) => {
        if (range[1] <= range[0]) return;
        rp.setPipeline(pipe); rp.setBindGroup(0, bg);
        rp.setVertexBuffer(0, mesh.vb); rp.setIndexBuffer(mesh.ib, mesh.fmt);
        rp.drawIndexed(mesh.n, range[1] - range[0], 0, 0, range[0]);
      };
      const fsq = (view, pipe, bg, load, clear) => {
        const rp = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: load ? 'load' : 'clear', storeOp: 'store', clearValue: clear || [0, 0, 0, 1] }] });
        rp.setPipeline(pipe); rp.setBindGroup(0, bg); rp.draw(3); rp.end();
      };
      // 1. 阴影
      let rp = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: LV.shadowTex, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
      drawMesh(rp, P.meshShadow, G.meshShadow, R.cube, M.cube);
      drawMesh(rp, P.meshShadow, G.meshShadow, R.cyl, M.cyl);
      if (isWater) {
        rp.setPipeline(P.terrainShadow); rp.setBindGroup(0, G.terrainShadow);
        rp.setVertexBuffer(0, M.ter.vb); rp.setIndexBuffer(M.ter.ib, M.ter.fmt); rp.drawIndexed(M.ter.n);
      }
      if (nb > 0) { rp.setPipeline(P.ballShadow); rp.setBindGroup(0, G.ballShadow); rp.draw(4, nb); }
      rp.end();
      // 2. 光向吸收
      rp = enc.beginRenderPass({ colorAttachments: [
        { view: LV.absTex, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] },
        { view: LV.absZ, loadOp: 'clear', storeOp: 'store', clearValue: [1, 1, 1, 1] }] });
      if (np > 0) { rp.setPipeline(P.pAbs); rp.setBindGroup(0, G.pAbs); rp.draw(4, np); }
      rp.end();
      // 3. 水面高度与焦散
      if (isWater) {
        rp = enc.beginRenderPass({
          colorAttachments: [{ view: LV.topTex, loadOp: 'clear', storeOp: 'store', clearValue: [-1, 0, 0, 0] }],
          depthStencilAttachment: { view: LV.topZ, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' }
        });
        rp.setPipeline(P.pTop); rp.setBindGroup(0, G.pTop); rp.draw(4, np); rp.end();
        fsq(LV.hA, P.hblur, GS.hb1);
        fsq(LV.hB, P.hblur, GS.hb2);
        rp = enc.beginRenderPass({ colorAttachments: [{ view: LV.causTex, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
        rp.setPipeline(P.caustic); rp.setBindGroup(0, GS.caustic); rp.draw(400 * 100 * 6); rp.end();
      }
      // 4. 不透明场景
      rp = enc.beginRenderPass({
        colorAttachments: [{ view: V.sceneColor, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
        depthStencilAttachment: { view: V.sceneDepth, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
      });
      rp.setPipeline(P.floor); rp.setBindGroup(0, G.floor); rp.draw(3);
      drawMesh(rp, P.mesh, G.mesh, R.cube, M.cube);
      drawMesh(rp, P.mesh, G.mesh, R.cyl, M.cyl);
      if (isWater) {
        rp.setPipeline(P.terrain); rp.setBindGroup(0, G.terrain);
        rp.setVertexBuffer(0, M.ter.vb); rp.setIndexBuffer(M.ter.ib, M.ter.fmt); rp.drawIndexed(M.ter.n);
      }
      if (nb > 0) { rp.setPipeline(P.balls); rp.setBindGroup(0, G.balls); rp.draw(4, nb); }
      drawMesh(rp, P.glassBack, G.glass, R.glassBack, M.cube);
      rp.end();
      // 5. 粒子深度 / 厚度
      rp = enc.beginRenderPass({
        colorAttachments: [{ view: V.fRaw, loadOp: 'clear', storeOp: 'store', clearValue: [1000, 0, 0, 0] }],
        depthStencilAttachment: { view: V.fZ, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' }
      });
      if (np > 0) { rp.setPipeline(P.pDepth); rp.setBindGroup(0, G.pDepth); rp.draw(4, np); }
      rp.end();
      rp = enc.beginRenderPass({ colorAttachments: [
        { view: V.thA, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] },
        { view: V.thB, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      if (np > 0) { rp.setPipeline(P.pThick); rp.setBindGroup(0, G.pThick); rp.draw(4, np); }
      rp.end();
      // 6. 平滑、法线、合成
      fsq(V.fA, P.smooth, GS.s1); fsq(V.fB, P.smooth, GS.s2); fsq(V.fA, P.smooth, GS.s3); fsq(V.fB, P.smooth, GS.s4);
      fsq(V.fN, P.normal, GS.normal);
      fsq(V.hdr, P.composite, G.composite);
      // 7. 前侧玻璃
      if (R.glassFront[1] > R.glassFront[0]) {
        rp = enc.beginRenderPass({
          colorAttachments: [{ view: V.hdr, loadOp: 'load', storeOp: 'store' }],
          depthStencilAttachment: { view: V.sceneDepth, depthReadOnly: true }
        });
        drawMesh(rp, P.glassBack, G.glass, R.glassFront, M.cube);
        rp.end();
      }
      // 8. 泛光
      fsq(V.b0, P.prefilter, GS.prefilter);
      for (let i = 1; i < this.bloomN; i++) fsq(V['b' + i], P.down, GS.down[i]);
      for (let i = this.bloomN - 2; i >= 0; i--) fsq(V['b' + i], P.up, GS.up[i], true);
      fsq(V.ldr, P.tonemap, GS.tonemap);
      fsq(GPU.context.getCurrentTexture().createView(), P.fxaa, GS.fxaa);
      d.queue.submit([enc.finish()]);
    }

    /* 把上一帧结果重新贴到画布（导出时保证画布内容与返回时刻一致） */
    present() {
      const enc = GPU.device.createCommandEncoder();
      const rp = enc.beginRenderPass({ colorAttachments: [{ view: GPU.context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
      rp.setPipeline(this.P.fxaa); rp.setBindGroup(0, this.GS.fxaa); rp.draw(3); rp.end();
      GPU.device.queue.submit([enc.finish()]);
    }
  };
})();
