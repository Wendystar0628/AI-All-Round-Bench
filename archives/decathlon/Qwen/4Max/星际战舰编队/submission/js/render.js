/* WebGL2 渲染器：体素实例化 + MSAA + 泛光 + 调色合成 */
'use strict';

SF.gl = null;
SF.R = {};

SF.initRender = function (canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) { document.getElementById('boot').textContent = '需要 WebGL2 支持'; return false; }
  SF.gl = gl;
  SF.R.floatOK = !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  SF.initCubeGeo(gl);
  SF.R.progs = {};
  const P = SF.R.progs;
  P.voxel = SF.program(gl, SF.SH.voxelV, SF.SH.voxelF);
  P.bg = SF.program(gl, SF.SH.fullV, SF.SH.bgF);
  P.plume = SF.program(gl, SF.SH.plumeV, SF.SH.plumeF);
  P.beam = SF.program(gl, SF.SH.beamV, SF.SH.beamF);
  P.shield = SF.program(gl, SF.SH.shieldV, SF.SH.shieldF);
  P.bolt = SF.program(gl, SF.SH.boltV, SF.SH.boltF);
  P.spark = SF.program(gl, SF.SH.sparkV, SF.SH.sparkF);
  P.flash = SF.program(gl, SF.SH.flashV, SF.SH.flashF);
  P.dust = SF.program(gl, SF.SH.dustV, SF.SH.dustF);
  P.trail = SF.program(gl, SF.SH.trailV, SF.SH.trailF);
  P.bright = SF.program(gl, SF.SH.fullV, SF.SH.brightF);
  P.blur = SF.program(gl, SF.SH.fullV, SF.SH.blurF);
  P.comp = SF.program(gl, SF.SH.fullV, SF.SH.compF);

  SF.R.quadVAO = SF.makeQuad(gl);
  SF.R.triVAO = SF.makeTri(gl);
  SF.R.plumeMesh = SF.makeLathe(gl);
  SF.R.beamMesh = SF.makeCylinder(gl);
  SF.R.sphereMesh = SF.makeSphere(gl);
  SF.R.dynTrail = SF.makeDynBuffer(gl, 7, 6000);
  SF.R.dynFlash = SF.makeDynBuffer(gl, 8, 512);
  SF.R.dynHolo = SF.makeDynBuffer(gl, 7, 1200);
  SF.resize();
  return true;
};

/* ---------- 着色器工具 ---------- */
SF.program = function (gl, vs, fs) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s), src);
      throw new Error('shader compile');
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); throw new Error('link'); }
  p.u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    p.u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
  }
  return p;
};

SF.makeQuad = function (gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, 1, 1, 1, 1, -1, 1, 0, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return vao;
};
SF.makeTri = function (gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  gl.bindVertexArray(null);
  return vao;
};
SF.makeDynBuffer = function (gl, stride, maxVerts) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, maxVerts * stride * 4, gl.DYNAMIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, buf, stride, data: new Float32Array(maxVerts * stride), max: maxVerts };
};

/* 尾焰旋转体 */
SF.makeLathe = function (gl) {
  const seg = 14, rings = 9, verts = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const y = r / rings;
    const rad = Math.sin(Math.pow(y, 0.72) * Math.PI) * (1 - y * 0.25) + 0.06 * (1 - y);
    for (let s = 0; s <= seg; s++) {
      const a = s / seg * SF.TAU;
      verts.push(Math.cos(a) * rad, y, Math.sin(a) * rad, s / seg, y);
    }
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) {
    const a = r * (seg + 1) + s, b = a + seg + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return SF.makeMesh(gl, verts, idx, 5);
};
SF.makeCylinder = function (gl) {
  const seg = 16, verts = [], idx = [];
  for (let r = 0; r <= 1; r++) for (let s = 0; s <= seg; s++) {
    const a = s / seg * SF.TAU;
    verts.push(Math.cos(a), Math.sin(a), r, Math.cos(a), Math.sin(a), s / seg, r);
  }
  for (let s = 0; s < seg; s++) {
    const a = s, b = s + seg + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return SF.makeMesh(gl, verts, idx, 7);
};
SF.makeSphere = function (gl) {
  const la = 20, lo = 28, verts = [], idx = [];
  for (let i = 0; i <= la; i++) {
    const th = i / la * Math.PI;
    for (let j = 0; j <= lo; j++) {
      const ph = j / lo * SF.TAU;
      const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      verts.push(x, y, z, x, y, z);
    }
  }
  for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) {
    const a = i * (lo + 1) + j, b = a + lo + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return SF.makeMesh(gl, verts, idx, 6);
};
SF.makeMesh = function (gl, verts, idx, stride) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride * 4, 0);
  if (stride >= 6) { gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride * 4, 12); }
  if (stride === 5) { gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride * 4, 12); }
  if (stride === 7) { gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride * 4, 20); }
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: idx.length };
};

/* ---------- 帧缓冲 ---------- */
SF.resize = function () {
  const gl = SF.gl, canvas = gl.canvas;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = Math.floor(window.innerWidth * dpr), h = Math.floor(window.innerHeight * dpr);
  const maxPx = 3840 * 2160;
  if (w * h > maxPx) { const k = Math.sqrt(maxPx / (w * h)); w = Math.floor(w * k); h = Math.floor(h * k); }
  canvas.width = w; canvas.height = h;
  const R = SF.R;
  const fmt = R.floatOK ? gl.RGBA16F : gl.RGBA8;
  const type = R.floatOK ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  let samples = 0;
  const sup = gl.getInternalformatParameter(gl.RENDERBUFFER, fmt, gl.SAMPLES);
  if (sup && sup.length && !R.noMSAA) samples = Math.min(4, sup[0]);
  if (samples > 0) {
    R.msaa = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.msaa);
    R.msaaCol = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, R.msaaCol);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, R.msaaCol);
    R.msaaDep = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, R.msaaDep);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, R.msaaDep);
  }
  const mkTex = (ww, hh) => {
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, ww, hh, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { f, t, w: ww, h: hh };
  };
  R.resolve = mkTex(w, h);
  R.halfA = mkTex(w >> 1, h >> 1); R.halfB = mkTex(w >> 1, h >> 1);
  R.quartA = mkTex(w >> 2, h >> 2); R.quartB = mkTex(w >> 2, h >> 2);
  R.w = w; R.h = h; R.samples = samples;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

/* ---------- 视锥裁剪 ---------- */
SF.frustumPlanes = function (vp) {
  const p = [];
  const row = r => [vp[r], vp[4 + r], vp[8 + r], vp[12 + r]];
  const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
  const mk = (a, b, s) => { const v = [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s, a[3] + b[3] * s]; const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l, v[3] / l]; };
  p.push(mk(r3, r0, 1), mk(r3, r0, -1), mk(r3, r1, 1), mk(r3, r1, -1), mk(r3, r2, 1), mk(r3, r2, -1));
  return p;
};
SF.sphereVisible = function (planes, c, r) {
  for (const p of planes) if (p[0] * c[0] + p[1] * c[1] + p[2] * c[2] + p[3] < -r) return false;
  return true;
};