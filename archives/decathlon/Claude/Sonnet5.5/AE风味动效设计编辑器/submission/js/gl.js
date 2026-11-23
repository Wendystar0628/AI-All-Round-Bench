/* gl.js — WebGL2 封装：着色器程序、渲染目标池、全屏绘制 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};

  class Prog {
    constructor(gl, vs, fs, name) {
      this.gl = gl; this.name = name; this.loc = {};
      const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); console.error('着色器编译失败 [' + name + ']\n' + log + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n')); throw new Error('shader ' + name + ': ' + log); } return s; };
      const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
      this.p = gl.createProgram(); gl.attachShader(this.p, v); gl.attachShader(this.p, f); gl.linkProgram(this.p);
      if (!gl.getProgramParameter(this.p, gl.LINK_STATUS)) throw new Error('link ' + name + ': ' + gl.getProgramInfoLog(this.p));
    }
    use() { this.gl.useProgram(this.p); return this; }
    l(n) { let l = this.loc[n]; if (l === undefined) { l = this.gl.getUniformLocation(this.p, n); this.loc[n] = l; } return l; }
    f(n, v) { const l = this.l(n); if (l) this.gl.uniform1f(l, v); return this; }
    i(n, v) { const l = this.l(n); if (l) this.gl.uniform1i(l, v); return this; }
    v2(n, a) { const l = this.l(n); if (l) this.gl.uniform2f(l, a[0], a[1]); return this; }
    v3(n, a) { const l = this.l(n); if (l) this.gl.uniform3f(l, a[0], a[1], a[2]); return this; }
    v4(n, a) { const l = this.l(n); if (l) this.gl.uniform4f(l, a[0], a[1], a[2], a[3] === undefined ? 1 : a[3]); return this; }
    m4(n, m) { const l = this.l(n); if (l) this.gl.uniformMatrix4fv(l, false, m); return this; }
    m3(n, m) { const l = this.l(n); if (l) this.gl.uniformMatrix3fv(l, false, m); return this; }
    fv(n, a) { const l = this.l(n + '[0]') || this.l(n); if (l) this.gl.uniform1fv(l, a); return this; }
    v3v(n, a) { const l = this.l(n + '[0]') || this.l(n); if (l) this.gl.uniform3fv(l, a); return this; }
    v4v(n, a) { const l = this.l(n + '[0]') || this.l(n); if (l) this.gl.uniform4fv(l, a); return this; }
    iv(n, a) { const l = this.l(n + '[0]') || this.l(n); if (l) this.gl.uniform1iv(l, a); return this; }
  }

  class GLCtx {
    constructor(canvas) {
      const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', stencil: true, depth: false });
      if (!gl) throw new Error('当前浏览器不支持 WebGL 2');
      this.gl = gl; this.canvas = canvas;
      this.extFloat = gl.getExtension('EXT_color_buffer_float'); this.extHalf = gl.getExtension('EXT_color_buffer_half_float');
      gl.getExtension('OES_texture_float_linear'); gl.getExtension('EXT_float_blend');
      this.hdr = !!this.extFloat;
      this.fmt = this.hdr ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT } : { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
      this.maxSamples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 1);
      this.progs = {}; this.pool = new Map(); this.msPool = new Map(); this.inUse = 0; this.vao = gl.createVertexArray();
      this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      this.dummy2D = this._tex(1, 1, new Uint8Array([0, 0, 0, 0]));
      this.stats = { rts: 0 };
    }
    _tex(w, h, data) { const gl = this.gl; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
    prog(name, vs, fs) { let p = this.progs[name]; if (!p) { p = this.progs[name] = new Prog(this.gl, vs, fs, name); } return p; }
    // 渲染目标（RGBA16F 纹理 + FBO）
    rt(w, h, o = {}) {
      w = Math.max(1, Math.min(this.maxTex, Math.round(w))); h = Math.max(1, Math.min(this.maxTex, Math.round(h)));
      const key = w + 'x' + h + (o.fmt || ''); const list = this.pool.get(key);
      if (list && list.length) { const r = list.pop(); r.free = false; return r; }
      const gl = this.gl; const f = o.fmt === 'r32f' ? { internal: gl.R32F, format: gl.RED, type: gl.FLOAT } : o.fmt === 'rgba8' ? { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE } : this.fmt;
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, f.internal, w, h, 0, f.format, f.type, null);
      const lin = o.fmt === 'r32f' ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, lin); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, lin); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      this.stats.rts++;
      return { w, h, tex, fbo, key, free: false };
    }
    release(r) { if (!r || r.free) return; r.free = true; let l = this.pool.get(r.key); if (!l) { l = []; this.pool.set(r.key, l); } l.push(r); }
    // 多重采样目标（颜色+可选辅助颜色+深度模板）
    ms(w, h, o = {}) {
      w = Math.max(1, Math.min(this.maxTex, Math.round(w))); h = Math.max(1, Math.min(this.maxTex, Math.round(h)));
      const key = w + 'x' + h + (o.aux ? 'a' : '') + (o.nodepth ? 'n' : ''); const list = this.msPool.get(key); if (list && list.length) { const r = list.pop(); r.free = false; return r; }
      const gl = this.gl; const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      const S = this.maxSamples;
      const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, S, this.fmt.internal, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
      let rb1 = null; if (o.aux) { rb1 = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb1); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, S, this.fmt.internal, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.RENDERBUFFER, rb1); }
      const rd = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rd); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, S, gl.DEPTH24_STENCIL8, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, rd);
      const r = { w, h, fbo, rb, rb1, rd, key, free: false, aux: !!o.aux };
      this.stats.rts++; return r;
    }
    releaseMS(r) { if (!r || r.free) return; r.free = true; let l = this.msPool.get(r.key); if (!l) { l = []; this.msPool.set(r.key, l); } l.push(r); }
    // 解析多重采样到 rt（可含辅助）
    resolve(msr, rt, rtAux) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msr.fbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, rt.fbo);
      gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.blitFramebuffer(0, 0, msr.w, msr.h, 0, 0, rt.w, rt.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      if (rtAux && msr.rb1) {
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, rtAux.fbo); gl.readBuffer(gl.COLOR_ATTACHMENT1); gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        gl.blitFramebuffer(0, 0, msr.w, msr.h, 0, 0, rtAux.w, rtAux.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msr.fbo); gl.readBuffer(gl.COLOR_ATTACHMENT0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    bind(rt) { const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, rt ? rt.fbo : null); gl.viewport(0, 0, rt ? rt.w : this.canvas.width, rt ? rt.h : this.canvas.height); }
    clear(r = 0, g = 0, b = 0, a = 0) { const gl = this.gl; gl.disable(gl.SCISSOR_TEST); gl.colorMask(true, true, true, true); gl.clearColor(r, g, b, a); gl.clear(gl.COLOR_BUFFER_BIT); }
    tex(unit, t, filter) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); if (filter) { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter); } }
    fullscreen() { const gl = this.gl; gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    // 动态顶点缓冲
    dynBuf(name) { this._bufs = this._bufs || {}; let b = this._bufs[name]; if (!b) { b = this._bufs[name] = this.gl.createBuffer(); } return b; }
    trimPool() { // 释放过多的空闲目标
      let total = 0; for (const l of this.pool.values()) total += l.length; if (total < 24) return;
      const gl = this.gl; for (const [k, l] of this.pool) { while (l.length > 3) { const r = l.shift(); gl.deleteTexture(r.tex); gl.deleteFramebuffer(r.fbo); } }
    }
  }
  AE.GLCtx = GLCtx; AE.Prog = Prog;
  AE.FS_VS = `#version 300 es
out vec2 vUV; void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUV = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`;
})();
