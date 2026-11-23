// render.js — WebGL2 renderer: instanced voxel faces, HDR MSAA, volumetric plumes, FX batches, bloom, tonemap, FXAA
(function () {
  'use strict';
  const SF = window.SF, m4 = SF.m4, v3 = SF.v3, S = SF.shaders;

  class Batch {
    constructor(stride, cap) { this.stride = stride; this.cap = cap || 256; this.a = new Float32Array(this.cap * stride); this.n = 0; }
    reset() { this.n = 0; }
    _grow() { this.cap *= 2; const b = new Float32Array(this.cap * this.stride); b.set(this.a); this.a = b; }
    alloc() { if (this.n === this.cap) this._grow(); return (this.n++) * this.stride; }
  }
  SF.Batch = Batch;

  class Program {
    constructor(gl, vs, fs, name) {
      this.gl = gl; this.loc = {};
      const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error('shader ' + name + ': ' + gl.getShaderInfoLog(s)); } return s; };
      const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error('link ' + name + ': ' + gl.getProgramInfoLog(p));
      this.p = p;
    }
    use() { this.gl.useProgram(this.p); return this; }
    l(n) { let x = this.loc[n]; if (x === undefined) { x = this.loc[n] = this.gl.getUniformLocation(this.p, n); } return x; }
    f1(n, v) { this.gl.uniform1f(this.l(n), v); } i1(n, v) { this.gl.uniform1i(this.l(n), v); }
    f2(n, a, b) { this.gl.uniform2f(this.l(n), a, b); }
    v3(n, v) { this.gl.uniform3f(this.l(n), v[0], v[1], v[2]); }
    v4(n, v) { this.gl.uniform4f(this.l(n), v[0], v[1], v[2], v[3]); }
    m4(n, m) { this.gl.uniformMatrix4fv(this.l(n), false, m); }
    m3(n, m) { this.gl.uniformMatrix3fv(this.l(n), false, m); }
    v4a(n, a) { this.gl.uniform4fv(this.l(n), a); }
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL2 unavailable');
      this.extF = gl.getExtension('EXT_color_buffer_float');
      gl.getExtension('OES_texture_float_linear');
      this.HDR = this.extF ? gl.RGBA16F : gl.RGBA8;
      this.maxSamples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
      this.P = {
        vox: new Program(gl, S.voxVS, S.voxFS(false), 'vox'), voxT: new Program(gl, S.voxVS, S.voxFS(true), 'voxT'),
        cube: new Program(gl, S.cubeVS, S.cubeFS, 'cube'),
        skyGen: new Program(gl, S.fsVS, S.skyGenFS, 'skyGen'), sky: new Program(gl, S.fsVS, S.skyFS, 'sky'), star: new Program(gl, S.starVS, S.starFS, 'star'),
        plume: new Program(gl, S.plumeVS, S.plumeFS, 'plume'), ax: new Program(gl, S.axVS, S.axFS, 'ax'), sp: new Program(gl, S.spVS, S.spFS, 'sp'), sh: new Program(gl, S.shVS, S.shFS, 'sh'),
        bd: new Program(gl, S.fsVS, S.bloomDownFS, 'bd'), bu: new Program(gl, S.fsVS, S.bloomUpFS, 'bu'), comp: new Program(gl, S.fsVS, S.compFS, 'comp'), fxaa: new Program(gl, S.fsVS, S.fxaaFS, 'fxaa'),
      };
      // palette texture
      this.palTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.palTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, SF.palN, 4, 0, gl.RGBA, gl.FLOAT, SF.palData);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      this.emptyVAO = gl.createVertexArray();
      this._initMeshes(); this._initBatches(); this._initStars();
      this.w = 0; this.h = 0;
      this.lightPos = new Float32Array(S.NL * 4); this.lightCol = new Float32Array(S.NL * 4);
      this.sunDirSky = SF.SUN;
      this._genSky();
    }

    _initMeshes() {
      const gl = this.gl;
      // unit cube with normals
      const F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], cv = [];
      for (const n of F) {
        const a = [n[1], n[2], n[0]], b = v3.cross(n, a);
        const q = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
        for (const [s, t] of q) cv.push(0.5 * (n[0] + a[0] * s + b[0] * t), 0.5 * (n[1] + a[1] * s + b[1] * t), 0.5 * (n[2] + a[2] * s + b[2] * t), n[0], n[1], n[2]);
      }
      this.cubeVB = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeVB); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cv), gl.STATIC_DRAW);
      // plume box (positions only, +-1)
      const bv = []; for (let i = 0; i < cv.length; i += 6) bv.push(cv[i] * 2, cv[i + 1] * 2, cv[i + 2] * 2);
      this.boxVAO = gl.createVertexArray(); gl.bindVertexArray(this.boxVAO);
      const bb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bv), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
      // superellipsoid shield mesh
      const sv = [], si = [], NU = 72, NV = 40, pw = 2.7;
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
        const th = j / NV * Math.PI, ph = i / NU * Math.PI * 2;
        const d = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
        const k = 1 / Math.pow(Math.pow(Math.abs(d[0]), pw) + Math.pow(Math.abs(d[1]), pw) + Math.pow(Math.abs(d[2]), pw), 1 / pw);
        const p = [d[0] * k, d[1] * k, d[2] * k];
        const g = p.map(c => Math.sign(c) * Math.pow(Math.abs(c), pw - 1));
        sv.push(p[0], p[1], p[2], g[0], g[1], g[2]);
      }
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + NU + 1; si.push(a, b, a + 1, a + 1, b, b + 1); }
      this.shVAO = gl.createVertexArray(); gl.bindVertexArray(this.shVAO);
      const sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sv), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(si), gl.STATIC_DRAW);
      this.shCount = si.length;
      gl.bindVertexArray(null);
    }

    _mkInst(layout, withCube) {
      const gl = this.gl, vao = gl.createVertexArray(), buf = gl.createBuffer();
      gl.bindVertexArray(vao);
      let base = 0;
      if (withCube) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeVB);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12); base = 2;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const stride = layout.reduce((a, b) => a + b, 0) * 4; let off = 0;
      layout.forEach((sz, i) => { gl.enableVertexAttribArray(base + i); gl.vertexAttribPointer(base + i, sz, gl.FLOAT, false, stride, off); gl.vertexAttribDivisor(base + i, 1); off += sz * 4; });
      gl.bindVertexArray(null);
      return { vao, buf, cap: 0 };
    }
    _initBatches() {
      this.instCube = this._mkInst([4, 4, 4, 4], true);
      this.instAx = this._mkInst([3, 3, 4, 4, 4], false);
      this.instSp = this._mkInst([4, 4, 4, 4], false);
    }
    _uploadInst(inst, batch) {
      const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, inst.buf);
      const need = batch.n * batch.stride;
      if (inst.cap < need) { inst.cap = Math.max(need, inst.cap * 2, 4096); gl.bufferData(gl.ARRAY_BUFFER, inst.cap * 4, gl.DYNAMIC_DRAW); }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.a, 0, need);
    }

    _initStars() {
      const gl = this.gl, r = SF.rng(9127), N = 4200, a = new Float32Array(N * 8);
      const bn = v3.norm([0.32, 0.88, -0.30]);
      let k = 0;
      while (k < N) {
        const z = r.s(), ph = r() * 6.28318, s = Math.sqrt(1 - z * z), d = [s * Math.cos(ph), z, s * Math.sin(ph)];
        const band = Math.exp(-Math.pow(v3.dot(d, bn) * 2.2, 2));
        if (r() > 0.30 + 0.70 * band) continue;
        const m = Math.pow(r(), 5.5);
        const size = 1.25 + m * 3.4, inten = 0.25 + m * 5.0 + r() * 0.25;
        const tc = r();
        const col = tc < 0.55 ? [0.80, 0.88, 1.0] : tc < 0.85 ? [1.0, 0.95, 0.85] : [1.0, 0.75, 0.55];
        a.set([d[0], d[1], d[2], size, col[0], col[1], col[2], inten], k * 8); k++;
      }
      this.starVAO = gl.createVertexArray(); gl.bindVertexArray(this.starVAO);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
      gl.bindVertexArray(null); this.starN = N;
    }

    _genSky() {
      const gl = this.gl, SZ = 1024;
      const tex = this.skyTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
      for (let f = 0; f < 6; f++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, this.HDR, SZ, SZ, 0, gl.RGBA, this.extF ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      const faces = [
        [0, 0, -1, 0, -1, 0, 1, 0, 0], [0, 0, 1, 0, -1, 0, -1, 0, 0], [1, 0, 0, 0, 0, 1, 0, 1, 0],
        [1, 0, 0, 0, 0, -1, 0, -1, 0], [1, 0, 0, 0, -1, 0, 0, 0, 1], [-1, 0, 0, 0, -1, 0, 0, 0, -1]];
      const p = this.P.skyGen.use(); p.v3('uSunDir', this.sunDirSky);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
      gl.viewport(0, 0, SZ, SZ); gl.bindVertexArray(this.emptyVAO);
      for (let f = 0; f < 6; f++) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, tex, 0);
        p.m3('uFace', new Float32Array(faces[f])); gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb);
    }

    resize(w, h) {
      w = Math.max(16, w | 0); h = Math.max(16, h | 0);
      if (w === this.w && h === this.h) return;
      const gl = this.gl; this.w = w; this.h = h; this.canvas.width = w; this.canvas.height = h;
      const del = o => { if (!o) return; if (o.fb) gl.deleteFramebuffer(o.fb); if (o.tex) gl.deleteTexture(o.tex); if (o.rb) gl.deleteRenderbuffer(o.rb); if (o.rb2) gl.deleteRenderbuffer(o.rb2); if (o.dtex) gl.deleteTexture(o.dtex); };
      [this.msaa, this.res, this.fx, this.ldr].forEach(del); (this.bloom || []).forEach(del);
      const tex = (ifmt, fmt, type, tw, th, filt) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, tw, th, 0, fmt, type, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
      const htype = this.extF ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
      // multisampled scene
      const ms = this.msaa = { fb: gl.createFramebuffer(), rb: gl.createRenderbuffer(), rb2: gl.createRenderbuffer() };
      gl.bindFramebuffer(gl.FRAMEBUFFER, ms.fb);
      gl.bindRenderbuffer(gl.RENDERBUFFER, ms.rb); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.maxSamples, this.HDR, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, ms.rb);
      gl.bindRenderbuffer(gl.RENDERBUFFER, ms.rb2); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.maxSamples, gl.DEPTH_COMPONENT24, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, ms.rb2);
      // resolve (colour + depth textures)
      const rs = this.res = { fb: gl.createFramebuffer(), tex: tex(this.HDR, gl.RGBA, htype, w, h, gl.LINEAR), dtex: tex(gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, w, h, gl.NEAREST) };
      gl.bindFramebuffer(gl.FRAMEBUFFER, rs.fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rs.tex, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, rs.dtex, 0);
      // fx target: same colour texture, separate depth renderbuffer for testing
      const fx = this.fx = { fb: gl.createFramebuffer(), rb: gl.createRenderbuffer() };
      gl.bindFramebuffer(gl.FRAMEBUFFER, fx.fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rs.tex, 0);
      gl.bindRenderbuffer(gl.RENDERBUFFER, fx.rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fx.rb);
      // bloom chain
      this.bloom = []; let bw = w, bh = h;
      for (let i = 0; i < 6; i++) {
        bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
        const mk = () => { const o = { fb: gl.createFramebuffer(), tex: tex(this.HDR, gl.RGBA, htype, bw, bh, gl.LINEAR), w: bw, h: bh }; gl.bindFramebuffer(gl.FRAMEBUFFER, o.fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, o.tex, 0); return o; };
        const d = mk(), u = mk(); d.up = u; this.bloom.push(d);
      }
      const ld = this.ldr = { fb: gl.createFramebuffer(), tex: tex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, w, h, gl.LINEAR) };
      gl.bindFramebuffer(gl.FRAMEBUFFER, ld.fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ld.tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // upload a mesh (from SF.meshGrid) -> drawable model
    upload(mesh, keep) {
      const gl = this.gl;
      const mk = (buf, start, count) => {
        const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        const o = start * 16;
        gl.enableVertexAttribArray(0); gl.vertexAttribIPointer(0, 4, gl.UNSIGNED_SHORT, 16, o); gl.vertexAttribDivisor(0, 1);
        gl.enableVertexAttribArray(1); gl.vertexAttribIPointer(1, 4, gl.UNSIGNED_BYTE, 16, o + 8); gl.vertexAttribDivisor(1, 1);
        gl.enableVertexAttribArray(2); gl.vertexAttribIPointer(2, 4, gl.UNSIGNED_BYTE, 16, o + 12); gl.vertexAttribDivisor(2, 1);
        gl.bindVertexArray(null); return vao;
      };
      const model = { origin: mesh.origin.slice(), dims: mesh.dims.slice(), chunks: [], n: mesh.n, tn: mesh.tn };
      const o = mesh.origin, d = mesh.dims;
      model.bmin = [o[0], o[1], o[2]]; model.bmax = [o[0] + d[0], o[1] + d[1], o[2] + d[2]];
      model.center = [o[0] + d[0] / 2, o[1] + d[1] / 2, o[2] + d[2] / 2]; model.radius = 0.5 * Math.hypot(d[0], d[1], d[2]);
      if (mesh.n) {
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(mesh.buf), gl.STATIC_DRAW);
        for (const c of mesh.chunks) model.chunks.push({ vao: mk(buf, c.start, c.count), count: c.count, bmin: [o[0], o[1], c.z0], bmax: [o[0] + d[0], o[1] + d[1], c.z1] });
      }
      if (mesh.tn) {
        const tb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tb); gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(mesh.tbuf), gl.STATIC_DRAW);
        model.tvao = mk(tb, 0, mesh.tn);
      }
      return model;
    }

    _planes(vp) {
      const p = [];
      const row = i => [vp[i], vp[4 + i], vp[8 + i], vp[12 + i]];
      const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
      const add = (a, b, s) => p.push([a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2], a[3] + s * b[3]]);
      add(r3, r0, 1); add(r3, r0, -1); add(r3, r1, 1); add(r3, r1, -1); add(r3, r2, 1); add(r3, r2, -1);
      return p;
    }
    _visible(planes, m, bmin, bmax) {
      // transform box corners, test against planes
      const c = [];
      for (let k = 0; k < 8; k++) c.push(m4.pt(m, [(k & 1) ? bmax[0] : bmin[0], (k & 2) ? bmax[1] : bmin[1], (k & 4) ? bmax[2] : bmin[2]]));
      for (const pl of planes) {
        let out = true;
        for (let k = 0; k < 8; k++) if (pl[0] * c[k][0] + pl[1] * c[k][1] + pl[2] * c[k][2] + pl[3] > 0) { out = false; break; }
        if (out) return false;
      }
      return true;
    }

    _common(p, F) {
      const e = F.env;
      p.v3('uCam', F.cam.pos); p.v3('uSunDir', e.sunDir); p.v3('uSunCol', e.sunCol); p.v3('uAmbHi', e.ambHi); p.v3('uAmbLo', e.ambLo);
      p.v3('uFillDir', e.fillDir); p.v3('uFillCol', e.fillCol); p.v4('uFog', e.fog); p.f1('uPhase', F.phase); p.f1('uTime', F.time);
      p.i1('uNumLights', this.nLights); if (this.nLights) { p.v4a('uLightPos[0]', this.lightPos); p.v4a('uLightCol[0]', this.lightCol); }
    }

    render(F) {
      const gl = this.gl, w = this.w, h = this.h, P = this.P, e = F.env, cam = F.cam;
      const proj = m4.persp(cam.fov * Math.PI / 180, w / h, cam.near, cam.far);
      let view = m4.lookAt(cam.pos, cam.tgt, cam.up || [0, 1, 0]);
      if (cam.roll) { const c = Math.cos(cam.roll), s = Math.sin(cam.roll); const R = m4.ident(); R[0] = c; R[1] = s; R[4] = -s; R[5] = c; view = m4.mul(R, view); }
      const vp = m4.mul(proj, view);
      const camR = [view[0], view[4], view[8]], camU = [view[1], view[5], view[9]], camF = [-view[2], -view[6], -view[10]];
      const planes = this._planes(vp);
      // lights (pick the most influential)
      let L = F.lights || [];
      if (L.length > S.NL) {
        L = L.map(l => ({ l, s: (l.c[0] + l.c[1] + l.c[2]) * l.r * l.r / (1 + Math.pow(v3.dist(l.p, cam.pos), 2) * 0.02) })).sort((a, b) => b.s - a.s).slice(0, S.NL).map(o => o.l);
      }
      this.nLights = L.length;
      for (let i = 0; i < L.length; i++) { this.lightPos.set([L[i].p[0], L[i].p[1], L[i].p[2], L[i].r], i * 4); this.lightCol.set([L[i].c[0], L[i].c[1], L[i].c[2], 1], i * 4); }

      // ---------- opaque pass (MSAA)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaa.fb); gl.viewport(0, 0, w, h);
      gl.depthMask(true); gl.disable(gl.BLEND);
      gl.clearColor(e.fog[0], e.fog[1], e.fog[2], 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      const setVox = (p) => {
        p.use(); this._common(p, F); p.m4('uVP', vp);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.palTex); p.i1('uPal', 0);
        p.v3('uAmbInt', e.ambInt || [0.1, 0.1, 0.1]); p.v3('uGlowA', e.glowA); p.v3('uGlowB', e.glowB); p.v3('uGlowC', e.glowC); p.f1('uCore', e.core || 0);
      };
      const ZERO4 = [0, 0, 0, 0];
      const perDraw = (p, d) => {
        p.m4('uModel', d.m); p.v3('uOrigin', d.model.origin); p.v4('uDyn', d.dyn || ZERO4); p.i1('uKind', d.kind || 0);
        p.f1('uSunBake', d.sunBake === undefined ? 1 : d.sunBake); p.f1('uAmbScale', d.amb === undefined ? 1 : d.amb);
        p.v4('uShield', d.shield || ZERO4); p.v4('uCrack', d.crack || ZERO4); p.f1('uHeat', d.heat || 0); p.f1('uSeed', d.seed || 0);
      };
      const vox = P.vox; setVox(vox);
      const visT = [];
      for (const d of F.draws) {
        const md = d.model; if (!md) continue;
        let any = false, set = false;
        if (md.chunks.length === 1 || md.radius < 200) {
          if (!this._visible(planes, d.m, md.bmin, md.bmax)) continue;
          any = true;
          for (const c of md.chunks) { if (!set) { perDraw(vox, d); set = true; } gl.bindVertexArray(c.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, c.count); }
        } else {
          for (const c of md.chunks) {
            if (!this._visible(planes, d.m, c.bmin, c.bmax)) continue;
            if (!set) { perDraw(vox, d); set = true; } any = true;
            gl.bindVertexArray(c.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, c.count);
          }
        }
        if (any && md.tvao) visT.push(d);
      }
      // loose cubes
      if (F.cubes && F.cubes.n) {
        const p = P.cube.use(); this._common(p, F); p.m4('uVP', vp);
        this._uploadInst(this.instCube, F.cubes); gl.bindVertexArray(this.instCube.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, F.cubes.n);
      }
      // sky
      if (e.sky) {
        gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.disable(gl.CULL_FACE);
        const vr = view.slice(); vr[12] = vr[13] = vr[14] = 0;
        const vpr = m4.mul(proj, vr), ivp = m4.inv(vpr);
        const p = P.sky.use(); p.m4('uInvVP', ivp); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.skyTex); p.i1('uSky', 0);
        p.v3('uSunDir', this.sunDirSky); p.v3('uSunCol', [1.0, 0.92, 0.80]); p.v4('uPlanet', e.planet); p.f1('uSkyK', e.skyK === undefined ? 1 : e.skyK);
        gl.bindVertexArray(this.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        const ps = P.star.use(); ps.m4('uVPr', vpr); ps.f1('uScale', h / 1080);
        gl.bindVertexArray(this.starVAO); gl.drawArrays(gl.POINTS, 0, this.starN);
        gl.disable(gl.BLEND);
      }
      // ---------- resolve
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaa.fb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.res.fb); gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fx.fb); gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      // ---------- fx pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fx.fb); gl.viewport(0, 0, w, h);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.depthFunc(gl.LEQUAL); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      if (visT.length) {
        const p = P.voxT; setVox(p);
        for (const d of visT) { perDraw(p, d); gl.bindVertexArray(d.model.tvao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, d.model.tn); }
      }
      if (F.shields && F.shields.length) {
        const p = P.sh.use(); p.m4('uVP', vp); p.v3('uCam', cam.pos); p.f1('uPhase', F.phase);
        gl.bindVertexArray(this.shVAO); gl.enable(gl.CULL_FACE);
        for (let pass = 0; pass < 2; pass++) {
          gl.cullFace(pass === 0 ? gl.FRONT : gl.BACK); p.f1('uBack', pass === 0 ? 1 : 0);
          for (const s of F.shields) {
            if (s.sh[0] <= 0.002) continue;
            p.m4('uModel', s.m); p.v3('uRad', s.rad); p.f1('uScale', s.scale); p.v3('uColor', s.color); p.v4('uSh', s.sh);
            gl.drawElements(gl.TRIANGLES, this.shCount, gl.UNSIGNED_SHORT, 0);
          }
        }
        gl.disable(gl.CULL_FACE);
      }
      if (F.plumes && F.plumes.length) {
        const p = P.plume.use(); p.m4('uVP', vp); p.v3('uCam', cam.pos); p.v3('uCamFwd', camF); p.f2('uNF', cam.near, cam.far); p.f1('uPhase', F.phase); p.v4('uFog', e.fog);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.res.dtex); p.i1('uDepth', 0);
        gl.disable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT); gl.blendFunc(gl.ONE, gl.ONE);
        gl.bindVertexArray(this.boxVAO);
        for (const pl of F.plumes) {
          // sphere cull
          const c = m4.pt(pl.m, [0, 0, -pl.half[2] * 0.5]), rad = pl.half[2] * 0.5 + Math.max(pl.half[0], pl.half[1]) * 4;
          let out = false; for (const q of planes) { const l = Math.hypot(q[0], q[1], q[2]); if ((q[0] * c[0] + q[1] * c[1] + q[2] * c[2] + q[3]) / l < -rad) { out = true; break; } }
          if (out) continue;
          p.m4('uModel', pl.m); p.m4('uInvModel', m4.invRigid(pl.m)); p.v3('uHalf', pl.half); p.v4('uPar', pl.par); p.v3('uColIn', pl.colIn); p.v3('uColOut', pl.colOut);
          gl.drawArrays(gl.TRIANGLES, 0, 36);
        }
        gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
      if (F.axial && F.axial.n) {
        const p = P.ax.use(); p.m4('uVP', vp); p.v3('uCam', cam.pos); p.f1('uPhase', F.phase); p.f1('uTime', F.time);
        this._uploadInst(this.instAx, F.axial); gl.bindVertexArray(this.instAx.vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, F.axial.n);
      }
      if (F.sprites && F.sprites.n) {
        const p = P.sp.use(); p.m4('uVP', vp); p.v3('uCamR', camR); p.v3('uCamU', camU);
        this._uploadInst(this.instSp, F.sprites); gl.bindVertexArray(this.instSp.vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, F.sprites.n);
      }
      // ---------- bloom
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.bindVertexArray(this.emptyVAO);
      let src = this.res.tex, sw = w, sh = h;
      const bd = P.bd.use(); bd.i1('uTex', 0); gl.activeTexture(gl.TEXTURE0);
      for (let i = 0; i < this.bloom.length; i++) {
        const b = this.bloom[i]; gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb); gl.viewport(0, 0, b.w, b.h);
        gl.bindTexture(gl.TEXTURE_2D, src); bd.f2('uTexel', 1 / sw, 1 / sh); bd.f1('uFirst', i === 0 ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3); src = b.tex; sw = b.w; sh = b.h;
      }
      const bu = P.bu.use(); bu.i1('uTex', 0);
      for (let i = 0; i < this.bloom.length; i++) {
        const b = this.bloom[i]; gl.bindFramebuffer(gl.FRAMEBUFFER, b.up.fb); gl.viewport(0, 0, b.w, b.h);
        gl.bindTexture(gl.TEXTURE_2D, b.tex); bu.f2('uTexel', 1 / b.w, 1 / b.h); gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      // ---------- composite + fxaa
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.ldr.fb); gl.viewport(0, 0, w, h);
      const cp = P.comp.use(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.res.tex); cp.i1('uScene', 0);
      for (let i = 0; i < 6; i++) { gl.activeTexture(gl.TEXTURE1 + i); gl.bindTexture(gl.TEXTURE_2D, this.bloom[i].up.tex); cp.i1('uB' + i, 1 + i); }
      cp.f1('uExposure', e.exposure); cp.f1('uBloom', e.bloom); cp.f1('uFade', F.fade === undefined ? 1 : F.fade);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
      const fa = P.fxaa.use(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.ldr.tex); fa.i1('uTex', 0); fa.f2('uTexel', 1 / w, 1 / h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      this.lastVP = vp;
    }
  }
  SF.Renderer = Renderer;
})();
