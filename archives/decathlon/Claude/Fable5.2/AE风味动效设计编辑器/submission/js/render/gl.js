// WebGL2 基础：上下文、着色器程序缓存、渲染目标池、全屏通道
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});

  const VS_FULL = `#version 300 es
  in vec2 aPos; out vec2 vUV;
  void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`;

  class GLX {
    constructor(canvas) {
      const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      if (!gl) throw new Error('当前浏览器不支持 WebGL 2');
      this.gl = gl; this.canvas = canvas;
      this.extFloat = gl.getExtension('EXT_color_buffer_float');
      gl.getExtension('OES_texture_float_linear'); gl.getExtension('EXT_float_blend');
      this.maxSamples = gl.getParameter(gl.MAX_SAMPLES) || 4;
      this.samples = Math.min(8, this.maxSamples);
      this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      this.progs = new Map(); this.pool = new Map(); this.live = 0;
      this.quad = gl.createVertexArray(); gl.bindVertexArray(this.quad);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      this.msaa = new Map();
    }
    // 着色器程序（缓存 uniform 位置）
    prog(key, vs, fs, attribs) {
      let p = this.progs.get(key); if (p) return p;
      const gl = this.gl;
      const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); console.error('着色器编译失败 [' + key + ']\n' + log + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n')); throw new Error('着色器编译失败: ' + key + ' ' + log); } return s; };
      const pr = gl.createProgram(); gl.attachShader(pr, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, fs));
      (attribs || ['aPos']).forEach((a, i) => gl.bindAttribLocation(pr, i, a));
      gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('着色器链接失败: ' + key + ' ' + gl.getProgramInfoLog(pr));
      p = { p: pr, u: {} };
      const n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(pr, i); const name = info.name.replace(/\[0\]$/, ''); p.u[name] = gl.getUniformLocation(pr, info.name); }
      this.progs.set(key, p); return p;
    }
    full(key, fs) { return this.prog(key, VS_FULL, fs); }
    use(p) { this.gl.useProgram(p.p); return p; }
    // ---- 渲染目标 ----
    target(w, h, fmt) {
      w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h)); fmt = fmt || 'rgba16f';
      const key = w + 'x' + h + fmt; const list = this.pool.get(key);
      if (list && list.length) { const t = list.pop(); t.free = false; return t; }
      const gl = this.gl; const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      if (fmt === 'rgba8') gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      else if (fmt === 'depth') gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, w, h);
      else gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, w, h);
      const lin = fmt === 'depth' ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, lin); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, lin);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, fmt === 'depth' ? gl.DEPTH_ATTACHMENT : gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (fmt === 'depth') { gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); }
      this.live++;
      return { tex, fbo, w, h, fmt, key, free: false };
    }
    release(t) { if (!t || t.free) return; t.free = true; let l = this.pool.get(t.key); if (!l) this.pool.set(t.key, (l = [])); l.push(t); }
    // 清理长期未用的目标（尺寸变化后）
    trim(keepKeys) {
      const gl = this.gl;
      for (const [key, list] of this.pool) { if (keepKeys && keepKeys.has(key)) continue; while (list.length > 2) { const t = list.pop(); gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); this.live--; } }
    }
    purge() { const gl = this.gl; for (const [, list] of this.pool) for (const t of list) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); this.live--; } this.pool.clear(); for (const [, m] of this.msaa) { gl.deleteFramebuffer(m.fbo); gl.deleteRenderbuffer(m.color); if (m.ds) gl.deleteRenderbuffer(m.ds); } this.msaa.clear(); }
    // 多重采样帧缓冲（按尺寸与格式复用）
    msTarget(w, h, kind) {
      w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
      const key = w + 'x' + h + kind; let m = this.msaa.get(key); if (m) return m;
      const gl = this.gl; const s = kind === 'scene' ? Math.min(4, this.maxSamples) : this.samples;
      const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      const color = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, color);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, kind === 'scene' ? gl.RGBA16F : gl.RGBA8, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
      const ds = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, ds);
      if (kind === 'scene') { gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, gl.DEPTH_COMPONENT24, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, ds); }
      else { gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, gl.DEPTH24_STENCIL8, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, ds); }
      m = { fbo, color, ds, w, h, kind, key };
      if (this.msaa.size > 6) { const [k0, m0] = this.msaa.entries().next().value; gl.deleteFramebuffer(m0.fbo); gl.deleteRenderbuffer(m0.color); gl.deleteRenderbuffer(m0.ds); this.msaa.delete(k0); }
      this.msaa.set(key, m); return m;
    }
    bind(t) { const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null); if (t) gl.viewport(0, 0, t.w, t.h); }
    clear(t, r, g, b, a) { const gl = this.gl; this.bind(t); gl.disable(gl.SCISSOR_TEST); gl.colorMask(true, true, true, true); gl.clearColor(r || 0, g || 0, b || 0, a || 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    tex(unit, texture) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); }
    // 执行全屏通道：把 srcs 绑定到 uT0..，输出到 dst
    pass(p, dst, srcs, setU) {
      const gl = this.gl; this.bind(dst); this.use(p);
      (srcs || []).forEach((s, i) => { this.tex(i, s && s.tex ? s.tex : s); const u = p.u['uT' + i]; if (u) gl.uniform1i(u, i); });
      if (p.u.uRes && dst) gl.uniform2f(p.u.uRes, dst.w, dst.h);
      if (setU) setU(gl, p.u);
      gl.bindVertexArray(this.quad); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
    }
    blit(src, dst) { this.pass(this.full('copy', FS_COPY), dst, [src]); }
  }
  const FS_COPY = `#version 300 es
  precision highp float; in vec2 vUV; uniform sampler2D uT0; out vec4 o; void main(){ o = texture(uT0, vUV); }`;
  MF.GLX = GLX; MF.VS_FULL = VS_FULL;
})();
