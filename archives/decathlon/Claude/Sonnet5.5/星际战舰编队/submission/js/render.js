'use strict';
// ---------- WebGL2 渲染器 ----------
var GLR = { gl: null, W: 0, H: 0, progs: {}, ready: false };

function glCompile(gl, type, src, defs) {
  var s = gl.createShader(type);
  if (defs) src = src.replace('#version 300 es', '#version 300 es\n' + defs);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    var log = gl.getShaderInfoLog(s);
    console.error('Shader compile error:', log, '\n', src.split('\n').map(function (l, i) { return (i + 1) + ': ' + l; }).join('\n').slice(0, 6000));
    throw new Error('shader: ' + log);
  }
  return s;
}
function glProgram(vs, fs, defs) {
  var gl = GLR.gl, p = gl.createProgram();
  gl.attachShader(p, glCompile(gl, gl.VERTEX_SHADER, vs, defs));
  gl.attachShader(p, glCompile(gl, gl.FRAGMENT_SHADER, fs, defs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); throw new Error('link: ' + gl.getProgramInfoLog(p)); }
  return { p: p, u: {}, stamp: -1 };
}
function uloc(pr, name) {
  var l = pr.u[name];
  if (l === undefined) { l = GLR.gl.getUniformLocation(pr.p, name); pr.u[name] = l; }
  return l;
}
function U1f(pr, n, v) { var l = uloc(pr, n); if (l) GLR.gl.uniform1f(l, v); }
function U1i(pr, n, v) { var l = uloc(pr, n); if (l) GLR.gl.uniform1i(l, v); }
function U2f(pr, n, a, b) { var l = uloc(pr, n); if (l) GLR.gl.uniform2f(l, a, b); }
function U3f(pr, n, a, b, c) { var l = uloc(pr, n); if (l) GLR.gl.uniform3f(l, a, b, c); }
function U4f(pr, n, a, b, c, d) { var l = uloc(pr, n); if (l) GLR.gl.uniform4f(l, a, b, c, d); }
function U3v(pr, n, v) { var l = uloc(pr, n); if (l) GLR.gl.uniform3fv(l, v); }
function UM3(pr, n, m) { var l = uloc(pr, n); if (l) GLR.gl.uniformMatrix3fv(l, false, m); }
function UM4(pr, n, m) { var l = uloc(pr, n); if (l) GLR.gl.uniformMatrix4fv(l, false, m); }

GLR.init = function (canvas) {
  var gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!gl) { document.body.innerHTML = '<p style="color:#fff;padding:20px">需要 WebGL2 支持的 Chrome。</p>'; throw new Error('no webgl2'); }
  GLR.gl = gl; GLR.canvas = canvas;
  GLR.extCBF = gl.getExtension('EXT_color_buffer_float');
  GLR.extHalf = gl.getExtension('EXT_color_buffer_half_float');
  GLR.maxSamples = gl.getParameter(gl.MAX_SAMPLES);
  var P = GLR.progs;
  P.vox = glProgram(SH.voxVS, SH.voxFS, '');
  P.voxMet = glProgram(SH.voxVS, SH.voxFS, '#define METEOR 1\n');
  P.spr = glProgram(SH.sprVS, SH.sprFS);
  P.shield = glProgram(SH.shVS, SH.shFS);
  P.cube = glProgram(SH.cubeVS, SH.cubeFS);
  P.sky = glProgram(SH.skyVS, SH.skyFS);
  P.down = glProgram(SH.fsVS, SH.downFS);
  P.up = glProgram(SH.fsVS, SH.upFS);
  P.comp = glProgram(SH.fsVS, SH.compFS);
  GLR.vaoEmpty = gl.createVertexArray();
  GLR.vaoVox = gl.createVertexArray();
  // 精灵 VAO
  GLR.vaoSpr = gl.createVertexArray();
  GLR.sprBuf = gl.createBuffer();
  GLR.sprCap = 0;
  gl.bindVertexArray(GLR.vaoSpr);
  gl.bindBuffer(gl.ARRAY_BUFFER, GLR.sprBuf);
  var strd = 16 * 4;
  [[0, 3, 0], [1, 2, 12], [2, 3, 20], [3, 4, 32], [4, 4, 48]].forEach(function (a) {
    gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, strd, a[2]); gl.vertexAttribDivisor(a[0], 1);
  });
  gl.bindVertexArray(null);
  // 碎块立方体 VAO
  GLR.vaoCube = gl.createVertexArray(); GLR.cubeBuf = gl.createBuffer(); GLR.cubeCap = 0;
  gl.bindVertexArray(GLR.vaoCube); gl.bindBuffer(gl.ARRAY_BUFFER, GLR.cubeBuf);
  [[0, 4, 0], [1, 4, 16], [2, 4, 32]].forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, 48, a[2]); gl.vertexAttribDivisor(a[0], 1); });
  gl.bindVertexArray(null);
  // 护盾球网格
  GLR.sphere = makeSphere(48, 28);
  GLR.ready = true;
  gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
};

function makeSphere(nu, nv) {
  var gl = GLR.gl, v = [], idx = [];
  for (var j = 0; j <= nv; j++) {
    var th = j / nv * Math.PI;
    for (var i = 0; i <= nu; i++) {
      var ph = i / nu * Math.PI * 2;
      v.push(Math.cos(th), Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph)); // x 轴为极轴（航向）
    }
  }
  for (var j2 = 0; j2 < nv; j2++) for (var i2 = 0; i2 < nu; i2++) {
    var a = j2 * (nu + 1) + i2, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  var vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
  var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao: vao, n: idx.length };
}

// 把网格化结果上传为模型
GLR.upload = function (mesh, extra) {
  var gl = GLR.gl;
  var m = { faces: mesh.faces, tfaces: mesh.tfaces, chunks: mesh.chunks, tchunks: mesh.tchunks, origin: mesh.origin, dims: mesh.dims, buf: null, tbuf: null };
  if (mesh.faces > 0) { m.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, m.buf); gl.bufferData(gl.ARRAY_BUFFER, mesh.data, gl.STATIC_DRAW); }
  if (mesh.tfaces > 0) { m.tbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, m.tbuf); gl.bufferData(gl.ARRAY_BUFFER, mesh.tdata, gl.STATIC_DRAW); }
  var r = 0;
  for (var i = 0; i < mesh.chunks.length; i++) { var c = mesh.chunks[i]; r = Math.max(r, vlen(c.c) + c.r); }
  for (var i2 = 0; i2 < mesh.tchunks.length; i2++) { var c2 = mesh.tchunks[i2]; r = Math.max(r, vlen(c2.c) + c2.r); }
  m.radius = r;
  if (extra) for (var k in extra) m[k] = extra[k];
  return m;
};
// 陨石分片参数纹理 (RGBA32F, 宽 = 片数, 高 = 4)
GLR.makePieceTex = function (arr, n) {
  var gl = GLR.gl, tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, n, 4, 0, gl.RGBA, gl.FLOAT, arr);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
};

// ---------- 渲染目标 ----------
GLR.resize = function (w, h) {
  var gl = GLR.gl;
  if (w === GLR.W && h === GLR.H && GLR.msFbo) return;
  GLR.W = w; GLR.H = h;
  GLR.canvas.width = w; GLR.canvas.height = h;
  // 释放旧目标
  if (GLR.msFbo) {
    gl.deleteFramebuffer(GLR.msFbo); gl.deleteRenderbuffer(GLR.msColor); gl.deleteRenderbuffer(GLR.msDepth);
    gl.deleteFramebuffer(GLR.resFbo); gl.deleteTexture(GLR.hdrTex);
    GLR.bloom.forEach(function (b) { gl.deleteFramebuffer(b.fbo); gl.deleteTexture(b.tex); });
  }
  var hdrFmt = (GLR.extCBF || GLR.extHalf) ? gl.RGBA16F : gl.RGBA8;
  GLR.hdrFmt = hdrFmt;
  var samples = Math.min(4, GLR.maxSamples);
  for (var attempt = 0; attempt < 3; attempt++) {
    if (GLR.msFbo && attempt > 0) { gl.deleteFramebuffer(GLR.msFbo); gl.deleteRenderbuffer(GLR.msColor); gl.deleteRenderbuffer(GLR.msDepth); }
    GLR.samples = samples;
    GLR.msFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, GLR.msFbo);
    GLR.msColor = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, GLR.msColor);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, hdrFmt, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, GLR.msColor);
    GLR.msDepth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, GLR.msDepth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, GLR.msDepth);
    var err = gl.getError();
    if (err === 0 && gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) break;
    console.warn('MSAA FBO retry, samples', samples, err);
    samples = samples > 2 ? 2 : (samples > 0 ? 0 : 0);
    if (samples === 0 && attempt >= 1) { hdrFmt = gl.RGBA8; GLR.hdrFmt = hdrFmt; }
  }
  GLR.hdrTex = mkTex(w, h, hdrFmt);
  GLR.resFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, GLR.resFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, GLR.hdrTex, 0);
  GLR.bloom = [];
  var bw = w, bh = h;
  for (var i = 0; i < 6; i++) {
    bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
    var t = mkTex(bw, bh, hdrFmt), f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    GLR.bloom.push({ tex: t, fbo: f, w: bw, h: bh });
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};
function mkTex(w, h, fmt) {
  var gl = GLR.gl, t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  var ifmt = fmt, type = gl.HALF_FLOAT;
  if (fmt === gl.RGBA8) type = gl.UNSIGNED_BYTE;
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, gl.RGBA, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

// ---------- 精灵批 ----------
function SpriteBatch(cap) {
  this.cap = cap || 20000; this.data = new Float32Array(this.cap * 16); this.n = 0; this.cam = [0, 0, 0];
}
SpriteBatch.prototype.reset = function (cam) { this.n = 0; this.cam = cam; };
// type: 0 柔光 1 线段 2 环 3 星芒 4 光束 5 尾焰 6 拖尾 7 弹迹 8 火花 9 爆闪
SpriteBatch.prototype.add = function (type, x, y, z, sx, sy, ax, ay, az, r, g, b, a, p1, p2, p3) {
  if (this.n >= this.cap) return;
  var d = this.data, o = this.n * 16, c = this.cam;
  d[o] = x - c[0]; d[o + 1] = y - c[1]; d[o + 2] = z - c[2]; d[o + 3] = sx; d[o + 4] = sy;
  d[o + 5] = ax; d[o + 6] = ay; d[o + 7] = az; d[o + 8] = r; d[o + 9] = g; d[o + 10] = b; d[o + 11] = a;
  d[o + 12] = type; d[o + 13] = p1 || 0; d[o + 14] = p2 || 0; d[o + 15] = p3 || 0;
  this.n++;
};
// 便捷：柔光斑
SpriteBatch.prototype.glow = function (x, y, z, size, r, g, b, a) { this.add(0, x, y, z, size, size, 0, 0, 0, r, g, b, a === undefined ? 1 : a, 0, 0, 0); };

// ---------- 绘制 ----------
function setupCamera(cam, aspect) {
  var f = cam.fov, near = cam.near || 0.4, far = cam.far || 80000;
  cam.P = m4persp(f, aspect, near, far);
  cam.Fc = 2.0 / Math.log2(far + 1);
  cam.tanY = Math.tan(f / 2); cam.tanX = cam.tanY * aspect;
  // 视图旋转（世界→视图）：行向量 right, up, -fwd
  var fw = vnorm(vsub(cam.target, cam.pos));
  var up = cam.up || [0, 1, 0];
  var r = vcross(fw, up); if (vlen(r) < 1e-6) r = [0, 0, 1]; r = vnorm(r);
  var u = vcross(r, fw);
  if (cam.roll) {
    var cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
    var r2 = vadd(vmul(r, cr), vmul(u, sr)), u2 = vsub(vmul(u, cr), vmul(r, sr)); r = r2; u = u2;
  }
  cam.right = r; cam.upv = u; cam.fwd = fw;
  cam.V = [r[0], u[0], -fw[0], r[1], u[1], -fw[1], r[2], u[2], -fw[2]]; // 列主序
}

GLR.setCommon = function (pr, frame) {
  var cam = frame.cam, env = frame.env;
  UM3(pr, 'uV', cam.V); UM4(pr, 'uP', cam.P); U1f(pr, 'uFc', cam.Fc); U1f(pr, 'uTime', frame.t);
};

GLR.applyEnv = function (pr, env) {
  U3f(pr, 'uSun', env.sun[0], env.sun[1], env.sun[2]);
  U3f(pr, 'uSunCol', env.sunCol[0], env.sunCol[1], env.sunCol[2]);
  U3f(pr, 'uSkyAmb', env.skyAmb[0], env.skyAmb[1], env.skyAmb[2]);
  U3f(pr, 'uGndAmb', env.gndAmb[0], env.gndAmb[1], env.gndAmb[2]);
  U1f(pr, 'uAmbK', env.ambK); U1f(pr, 'uFog', env.fog);
  U3f(pr, 'uFogCol', env.fogCol[0], env.fogCol[1], env.fogCol[2]);
  U1f(pr, 'uEmiK', env.emiK === undefined ? 1 : env.emiK);
  U1f(pr, 'uGlowK', env.glowK === undefined ? 1 : env.glowK);
};

var _lightBufP = new Float32Array(64), _lightBufC = new Float32Array(48);
var _grp = new Float32Array(8);

function cullSphere(cam, vc, r) {
  var z = -vc[2];
  if (z + r < cam.near) return false;
  if (Math.abs(vc[0]) - z * cam.tanX > r * Math.sqrt(1 + cam.tanX * cam.tanX)) return false;
  if (Math.abs(vc[1]) - z * cam.tanY > r * Math.sqrt(1 + cam.tanY * cam.tanY)) return false;
  return true;
}

// 绘制一个模型实例。obj: {model, R(mat3), pos, lights[], groups[], shield:{tint,k,waveX,waveW}, glowK, emiK, heatCol}
GLR.drawObj = function (obj, frame, pass) { // pass: 0 不透明 1 透明
  var gl = GLR.gl, m = obj.model, cam = frame.cam, env = frame.env;
  var buf = pass === 0 ? m.buf : m.tbuf, chunks = pass === 0 ? m.chunks : m.tchunks;
  if (!buf || !chunks.length) return 0;
  var pr = m.pieceTex ? GLR.progs.voxMet : GLR.progs.vox;
  var rel = [obj.pos[0] - cam.pos[0], obj.pos[1] - cam.pos[1], obj.pos[2] - cam.pos[2]];
  // 整体包围球剔除
  var wc = rel, vcen = m3vec(cam.V, wc);
  var rad = (obj.scale || 1) * m.radius;
  if (!cullSphere(cam, vcen, rad)) return 0;
  if (pr.stamp !== frame.stamp) { gl.useProgram(pr.p); GLR.setCommon(pr, frame); GLR.applyEnv(pr, env); pr.stamp = frame.stamp; }
  else if (GLR.curProg !== pr) gl.useProgram(pr.p);
  GLR.curProg = pr;
  // 环境覆盖（舱内）
  var e2 = obj.env || env;
  if (e2 !== GLR.curEnv) { GLR.applyEnv(pr, e2); GLR.curEnv = e2; }
  U3f(pr, 'uOrigin', m.origin[0], m.origin[1], m.origin[2]);
  UM3(pr, 'uR', obj.R); U3f(pr, 'uRel', rel[0], rel[1], rel[2]);
  U1f(pr, 'uTransPass', pass);
  U1f(pr, 'uFade', obj.fade === undefined ? 1 : obj.fade);
  U1f(pr, 'uTime', obj.timeOverride !== undefined ? obj.timeOverride : frame.t);
  // 灯光
  var nl = 0, lights = obj.lights || [], gl2 = frame.lights || [];
  var cand = [];
  function score(L) {
    var cx = L.p[0] - cam.pos[0], cy = L.p[1] - cam.pos[1], cz = L.p[2] - cam.pos[2];
    return L.r * (L.c[0] + L.c[1] + L.c[2]) / (1 + Math.sqrt(cx * cx + cy * cy + cz * cz) * 0.02);
  }
  for (var i = 0; i < lights.length; i++) { lights[i].s = score(lights[i]); cand.push(lights[i]); }
  for (var j = 0; j < gl2.length; j++) {
    var L = gl2[j], dx = L.p[0] - obj.pos[0], dy = L.p[1] - obj.pos[1], dz = L.p[2] - obj.pos[2];
    var dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dd < L.r + rad) { cand.push({ p: L.p, c: L.c, r: L.r, s: score(L) * 1.5 }); }
  }
  if (cand.length > 16) {
    cand.sort(function (a, b) { return b.s - a.s; }); cand.length = 16;
  }
  for (var k = 0; k < cand.length; k++) {
    var cl = cand[k];
    _lightBufP[k * 4] = cl.p[0] - cam.pos[0]; _lightBufP[k * 4 + 1] = cl.p[1] - cam.pos[1]; _lightBufP[k * 4 + 2] = cl.p[2] - cam.pos[2]; _lightBufP[k * 4 + 3] = cl.r;
    _lightBufC[k * 3] = cl.c[0]; _lightBufC[k * 3 + 1] = cl.c[1]; _lightBufC[k * 3 + 2] = cl.c[2];
  }
  U1i(pr, 'uNL', cand.length);
  if (cand.length) { var lp = uloc(pr, 'uLP'), lc = uloc(pr, 'uLC'); if (lp) gl.uniform4fv(lp, _lightBufP); if (lc) gl.uniform3fv(lc, _lightBufC); }
  // 分组发光
  for (var g = 0; g < 8; g++) _grp[g] = 1;
  if (obj.groups) for (var g2 in obj.groups) _grp[g2] = obj.groups[g2];
  var lg = uloc(pr, 'uGroup'); if (lg) gl.uniform1fv(lg, _grp);
  if (obj.glowK !== undefined) U1f(pr, 'uGlowK', obj.glowK); else U1f(pr, 'uGlowK', e2.glowK === undefined ? 1 : e2.glowK);
  if (obj.emiK !== undefined) U1f(pr, 'uEmiK', obj.emiK); else U1f(pr, 'uEmiK', e2.emiK === undefined ? 1 : e2.emiK);
  var sh = obj.shield;
  if (sh) { U4f(pr, 'uShieldTint', sh.tint[0], sh.tint[1], sh.tint[2], sh.k); U2f(pr, 'uWave', sh.waveX, sh.waveW); }
  else U4f(pr, 'uShieldTint', 0, 0, 0, 0);
  var hc = obj.heatCol || [1.0, 0.45, 0.12]; U3f(pr, 'uHeatCol', hc[0], hc[1], hc[2]);
  if (m.pieceTex) {
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, m.pieceTex); U1i(pr, 'uPiece', 1); gl.activeTexture(gl.TEXTURE0);
  }
  gl.bindVertexArray(GLR.vaoVox);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
  gl.vertexAttribDivisor(0, 1); gl.vertexAttribDivisor(1, 1); gl.vertexAttribDivisor(2, 1);
  var drawn = 0;
  var R = obj.R;
  for (var ci = 0; ci < chunks.length; ci++) {
    var c = chunks[ci];
    // 块包围球：局部→世界相对→视图
    var lc3 = c.c;
    var wx = R[0] * lc3[0] + R[3] * lc3[1] + R[6] * lc3[2] + rel[0], wy = R[1] * lc3[0] + R[4] * lc3[1] + R[7] * lc3[2] + rel[1], wz = R[2] * lc3[0] + R[5] * lc3[1] + R[8] * lc3[2] + rel[2];
    var vc = m3vec(cam.V, [wx, wy, wz]);
    var cr = c.r * (obj.scale || 1) + (obj.cullPad || 0);
    if (!cullSphere(cam, vc, cr)) continue;
    var off = c.start * FACE_STRIDE;
    gl.vertexAttribIPointer(0, 4, gl.UNSIGNED_SHORT, FACE_STRIDE, off);
    gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_INT, FACE_STRIDE, off + 8);
    gl.vertexAttribIPointer(2, 1, gl.UNSIGNED_INT, FACE_STRIDE, off + 12);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, c.count);
    drawn += c.count;
  }
  gl.bindVertexArray(null);
  return drawn;
};

GLR.drawSprites = function (frame, batch) {
  var gl = GLR.gl, pr = GLR.progs.spr;
  if (batch.n === 0) return;
  gl.useProgram(pr.p); GLR.curProg = pr; pr.stamp = -1;
  UM3(pr, 'uV', frame.cam.V); UM4(pr, 'uP', frame.cam.P); U1f(pr, 'uFc', frame.cam.Fc); U1f(pr, 'uTime', frame.t);
  gl.bindVertexArray(GLR.vaoSpr);
  gl.bindBuffer(gl.ARRAY_BUFFER, GLR.sprBuf);
  if (GLR.sprCap < batch.n) { GLR.sprCap = Math.max(batch.n, GLR.sprCap * 2, 4096); gl.bufferData(gl.ARRAY_BUFFER, GLR.sprCap * 64, gl.DYNAMIC_DRAW); }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.data, 0, batch.n * 16);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, batch.n);
  gl.bindVertexArray(null);
};

GLR.drawCubes = function (frame, cubes) {
  var gl = GLR.gl, pr = GLR.progs.cube;
  if (!cubes || cubes.n === 0) return;
  gl.useProgram(pr.p); GLR.curProg = pr;
  var env = frame.env;
  UM3(pr, 'uV', frame.cam.V); UM4(pr, 'uP', frame.cam.P); U1f(pr, 'uFc', frame.cam.Fc);
  U3f(pr, 'uSun', env.sun[0], env.sun[1], env.sun[2]); U3f(pr, 'uSunCol', env.sunCol[0], env.sunCol[1], env.sunCol[2]);
  U3f(pr, 'uSkyAmb', env.skyAmb[0], env.skyAmb[1], env.skyAmb[2]); U3f(pr, 'uGndAmb', env.gndAmb[0], env.gndAmb[1], env.gndAmb[2]);
  gl.bindVertexArray(GLR.vaoCube); gl.bindBuffer(gl.ARRAY_BUFFER, GLR.cubeBuf);
  if (GLR.cubeCap < cubes.n) { GLR.cubeCap = Math.max(cubes.n, GLR.cubeCap * 2, 2048); gl.bufferData(gl.ARRAY_BUFFER, GLR.cubeCap * 48, gl.DYNAMIC_DRAW); }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, cubes.data, 0, cubes.n * 12);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, cubes.n);
  gl.bindVertexArray(null);
};

GLR.drawShields = function (frame) {
  var gl = GLR.gl, pr = GLR.progs.shield, list = frame.shields;
  if (!list || !list.length) return;
  gl.useProgram(pr.p); GLR.curProg = pr;
  UM3(pr, 'uV', frame.cam.V); UM4(pr, 'uP', frame.cam.P); U1f(pr, 'uFc', frame.cam.Fc);
  gl.bindVertexArray(GLR.sphere.vao);
  gl.disable(gl.CULL_FACE);
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    var rel = [s.pos[0] - frame.cam.pos[0], s.pos[1] - frame.cam.pos[1], s.pos[2] - frame.cam.pos[2]];
    var vcen = m3vec(frame.cam.V, rel), rad = Math.max(s.radii[0], s.radii[1], s.radii[2]);
    if (!cullSphere(frame.cam, vcen, rad)) continue;
    // M = R * diag(radii)
    var R = s.R, rd = s.radii;
    var M = [R[0] * rd[0], R[1] * rd[0], R[2] * rd[0], R[3] * rd[1], R[4] * rd[1], R[5] * rd[1], R[6] * rd[2], R[7] * rd[2], R[8] * rd[2]];
    UM3(pr, 'uM', M); U3f(pr, 'uRel', rel[0], rel[1], rel[2]);
    U4f(pr, 'uS', s.k, s.p, frame.t, s.seed); U3f(pr, 'uCol', s.col[0], s.col[1], s.col[2]); U1f(pr, 'uCell', s.cell);
    gl.drawElements(gl.TRIANGLES, GLR.sphere.n, gl.UNSIGNED_INT, 0);
  }
  gl.enable(gl.CULL_FACE);
  gl.bindVertexArray(null);
};

GLR.render = function (frame) {
  var gl = GLR.gl, W = GLR.W, H = GLR.H, env = frame.env;
  frame.stamp = (GLR.stampCounter = (GLR.stampCounter || 0) + 1);
  GLR.curEnv = null;
  setupCamera(frame.cam, W / H);
  gl.bindFramebuffer(gl.FRAMEBUFFER, GLR.msFbo);
  gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 1);
  gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.BLEND);
  // 天空
  var pr = GLR.progs.sky;
  gl.useProgram(pr.p); gl.disable(gl.CULL_FACE); gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
  UM3(pr, 'uV', frame.cam.V); U2f(pr, 'uTan', frame.cam.tanX, frame.cam.tanY);
  U3f(pr, 'uSun', env.sun[0], env.sun[1], env.sun[2]); U1f(pr, 'uTime', frame.t);
  var sk = frame.sky || { k: 1, tint: [1, 1, 1] };
  U1f(pr, 'uSkyK', sk.k); U3f(pr, 'uTint', sk.tint[0], sk.tint[1], sk.tint[2]);
  var pd = env.planetDir || [0.8, -0.35, -0.5]; U3f(pr, 'uPlanetDir', pd[0], pd[1], pd[2]);
  gl.bindVertexArray(GLR.vaoEmpty); gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.enable(gl.CULL_FACE);
  GLR.progs.vox.stamp = -1; GLR.progs.voxMet.stamp = -1;
  // 不透明体素
  var stats = 0;
  var objs = frame.objects;
  for (var i = 0; i < objs.length; i++) stats += GLR.drawObj(objs[i], frame, 0);
  if (frame.cubes) GLR.drawCubes(frame, frame.cubes);
  // 透明发光体素、精灵、护盾（叠加）
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
  for (var i2 = 0; i2 < objs.length; i2++) if (objs[i2].model.tbuf) GLR.drawObj(objs[i2], frame, 1);
  gl.disable(gl.CULL_FACE);
  GLR.drawShields(frame);
  if (frame.sprites) GLR.drawSprites(frame, frame.sprites);
  gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
  GLR.stats = stats;
  // 解析 MSAA
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, GLR.msFbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, GLR.resFbo);
  gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  gl.bindVertexArray(GLR.vaoEmpty);
  // 泛光链
  var B = GLR.bloom, src = GLR.hdrTex, sw = W, sh = H;
  pr = GLR.progs.down; gl.useProgram(pr.p); U1i(pr, 'uTex', 0);
  gl.activeTexture(gl.TEXTURE0);
  for (var l = 0; l < B.length; l++) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, B[l].fbo); gl.viewport(0, 0, B[l].w, B[l].h);
    gl.bindTexture(gl.TEXTURE_2D, src); U2f(pr, 'uTexel', 1 / sw, 1 / sh); U1f(pr, 'uFirst', l === 0 ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    src = B[l].tex; sw = B[l].w; sh = B[l].h;
  }
  pr = GLR.progs.up; gl.useProgram(pr.p); U1i(pr, 'uTex', 0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  for (var l2 = B.length - 1; l2 > 0; l2--) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, B[l2 - 1].fbo); gl.viewport(0, 0, B[l2 - 1].w, B[l2 - 1].h);
    gl.bindTexture(gl.TEXTURE_2D, B[l2].tex); U2f(pr, 'uTexel', 1 / B[l2].w, 1 / B[l2].h); U1f(pr, 'uRadius', 1.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.disable(gl.BLEND);
  // 合成
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
  pr = GLR.progs.comp; gl.useProgram(pr.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, GLR.hdrTex); U1i(pr, 'uHdr', 0);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, B[0].tex); U1i(pr, 'uBloom', 2); gl.activeTexture(gl.TEXTURE0);
  var post = frame.post || {};
  U1f(pr, 'uBloomK', post.bloom === undefined ? 0.3 : post.bloom); U1f(pr, 'uExposure', post.exposure === undefined ? 1.0 : post.exposure);
  U2f(pr, 'uRes', W, H); U1f(pr, 'uTime', frame.t); U1f(pr, 'uVig', post.vig === undefined ? 0.35 : post.vig);
  U3f(pr, 'uLift', 1, 1, 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
};
