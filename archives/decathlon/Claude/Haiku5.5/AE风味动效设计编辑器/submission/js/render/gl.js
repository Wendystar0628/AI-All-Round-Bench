/* WebGL2 基础设施：上下文、着色器编译、渲染目标（可选 MSAA、多个颜色附件）与几何上传。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const GL = (AE.GL = {});

  // 创建 WebGL2 上下文；返回 null 时说明浏览器不支持
  GL.create = (canvas) => {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, depth: false, stencil: false });
    if (!gl) return null;
    GL.hasFloat = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    gl.getExtension('EXT_float_blend');
    GL.maxSamples = gl.getParameter(gl.MAX_SAMPLES) || 0;
    GL.samples = Math.min(4, GL.maxSamples);
    return gl;
  };

  GL.compile = (gl, type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('着色器编译失败：' + log);
    }
    return sh;
  };
  // 创建程序，并缓存 uniform 位置
  GL.program = (gl, vs, fs, name) => {
    const prog = gl.createProgram();
    gl.attachShader(prog, GL.compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, GL.compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('程序链接失败 ' + (name || '') + '：' + gl.getProgramInfoLog(prog));
    const u = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      const nm = info.name.replace(/\[0\]$/, '');
      u[nm] = gl.getUniformLocation(prog, info.name);
    }
    return { prog, u, name };
  };
  GL.uniform = (gl, prog, name) => prog.u[name];

  // 渲染目标：colorCount 个颜色附件；samples>0 时使用多重采样渲染缓冲再解析到纹理
  // 选项：{ float: true, colors: 1, depth: false, samples: 0, depthTex: false }
  class RT {
    constructor(gl, w, h, o) {
      o = o || {};
      this.gl = gl;
      this.w = Math.max(1, w | 0);
      this.h = Math.max(1, h | 0);
      this.colorCount = o.colors || 1;
      this.float = o.float !== false && GL.hasFloat;
      this.hasDepth = !!o.depth;
      this.depthTex = !!o.depthTex;
      this.samples = o.samples || 0;
      this.textures = [];
      this.fbo = gl.createFramebuffer();
      this.msFbo = null;
      this.rbs = [];
      this.depthRb = null;
      this.depthTexture = null;
      this._alloc();
    }
    _alloc() {
      const gl = this.gl;
      const fmt = this.float ? [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT] : [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];
      // 解析用纹理及帧缓冲
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      const drawBufs = [];
      for (let i = 0; i < this.colorCount; i++) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        // 第二个附件（深度通道）使用 R32F
        const f = i === 0 ? fmt : this.float ? [gl.R32F, gl.RED, gl.FLOAT] : [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];
        if (i === 0) gl.texImage2D(gl.TEXTURE_2D, 0, f[0], this.w, this.h, 0, f[1], f[2], null);
        else gl.texImage2D(gl.TEXTURE_2D, 0, f[0], this.w, this.h, 0, f[1], f[2], null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        if (i > 0) {
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        }
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0);
        this.textures.push(tex);
        drawBufs.push(gl.COLOR_ATTACHMENT0 + i);
      }
      if (this.depthTex) {
        const dt = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, dt);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, this.w, this.h, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, dt, 0);
        this.depthTexture = dt;
      }
      gl.drawBuffers(drawBufs);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('渲染目标不完整');
      // 多重采样
      if (this.samples > 0) {
        this.msFbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFbo);
        for (let i = 0; i < this.colorCount; i++) {
          const rb = gl.createRenderbuffer();
          gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
          const f = i === 0 ? fmt : this.float ? [gl.R32F] : [gl.RGBA8];
          gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, f[0], this.w, this.h);
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.RENDERBUFFER, rb);
          this.rbs.push(rb);
        }
        if (this.hasDepth) {
          this.depthRb = gl.createRenderbuffer();
          gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRb);
          gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.DEPTH_COMPONENT24, this.w, this.h);
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRb);
        }
        gl.drawBuffers(drawBufs);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          this.samples = 0;
          this.msFbo = null;
        }
      } else if (this.hasDepth) {
        this.depthRb = gl.createRenderbuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.w, this.h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRb);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    // 绑定为绘制目标
    bind(clear) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFbo || this.fbo);
      gl.viewport(0, 0, this.w, this.h);
      if (this.msFbo) gl.drawBuffers(this.textures.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
      else gl.drawBuffers(this.textures.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
      if (clear) this.clear(clear);
    }
    clear(rgba) {
      const gl = this.gl;
      gl.clearColor(rgba[0], rgba[1], rgba[2], rgba[3]);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | (this.hasDepth ? gl.DEPTH_BUFFER_BIT : 0));
    }
    // 把多重采样内容解析到纹理
    resolve() {
      if (!this.msFbo) return;
      const gl = this.gl;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo);
      // 逐个附件解析：每次只开放一个绘制缓冲，避免不同格式互相混合
      for (let i = 0; i < this.colorCount; i++) {
        gl.readBuffer(gl.COLOR_ATTACHMENT0 + i);
        gl.drawBuffers(this.textures.map((_, j) => (j === i ? gl.COLOR_ATTACHMENT0 + j : gl.NONE)));
        gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, this.w, this.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    dispose() {
      const gl = this.gl;
      this.textures.forEach((t) => gl.deleteTexture(t));
      if (this.depthTexture) gl.deleteTexture(this.depthTexture);
      this.rbs.forEach((r) => gl.deleteRenderbuffer(r));
      if (this.depthRb) gl.deleteRenderbuffer(this.depthRb);
      gl.deleteFramebuffer(this.fbo);
      if (this.msFbo) gl.deleteFramebuffer(this.msFbo);
    }
  }
  GL.RT = RT;

  // 简单的 RT 池：按尺寸与配置复用
  GL.Pool = class {
    constructor(gl) {
      this.gl = gl;
      this.free = [];
      this.used = [];
    }
    get(w, h, o) {
      o = o || {};
      const key = (rt) => rt.w === w && rt.h === h && rt.colorCount === (o.colors || 1) && rt.hasDepth === !!o.depth && rt.depthTex === !!o.depthTex && rt.samples === (o.samples !== undefined ? o.samples : GL.samples) && rt.float === (o.float !== false && GL.hasFloat);
      const idx = this.free.findIndex(key);
      let rt;
      if (idx >= 0) rt = this.free.splice(idx, 1)[0];
      else rt = new RT(this.gl, w, h, Object.assign({ samples: GL.samples }, o));
      this.used.push(rt);
      return rt;
    }
    releaseAll() {
      this.free.push(...this.used);
      this.used = [];
    }
    release(rt) {
      const i = this.used.indexOf(rt);
      if (i >= 0) this.used.splice(i, 1);
      this.free.push(rt);
    }
    destroy() {
      this.free.concat(this.used).forEach((r) => r.dispose());
      this.free = [];
      this.used = [];
    }
  };

  // 为一次绘制上传顶点数据（pos: xyz，nrm: xyz 可选）；返回 VAO
  GL.Geo = class {
    constructor(gl) {
      this.gl = gl;
      this.vao = gl.createVertexArray();
      this.pbo = gl.createBuffer();
      this.nbo = gl.createBuffer();
      this.count = 0;
    }
    set(pos, nrm) {
      const gl = this.gl;
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pbo);
      gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      if (nrm) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.nbo);
        gl.bufferData(gl.ARRAY_BUFFER, nrm, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      } else {
        // 无法线时使用常量法线（朝向观察者的平面）
        gl.disableVertexAttribArray(1);
        gl.vertexAttrib3f(1, 0, 0, -1);
      }
      this.count = pos.length / 3;
      gl.bindVertexArray(null);
    }
    draw(mode) {
      const gl = this.gl;
      gl.bindVertexArray(this.vao);
      gl.drawArrays(mode || gl.TRIANGLES, 0, this.count);
      gl.bindVertexArray(null);
    }
  };
})();
