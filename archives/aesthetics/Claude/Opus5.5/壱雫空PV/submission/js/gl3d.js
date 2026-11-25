/* Minimal WebGL2 renderer for the flat "board space" shots: textured quads (from 2D canvases),
   procedural grid floor, linear fog, premultiplied alpha. Composited into the 2D canvas. */
'use strict';
(function () {
  const PV = window.PV;
  let cv = null, gl = null, P = null, PG = null, vbo = null, vao = null;
  let VW = 1, VH = 1;
  const texCache = new Map();

  const VS = `#version 300 es
  in vec2 aPos;
  uniform mat4 uM, uV, uP;
  uniform vec4 uUV;
  out vec2 vUV; out float vDepth; out vec3 vW;
  void main(){
    vec4 wp = uM * vec4(aPos, 0.0, 1.0);
    vec4 vp = uV * wp;
    vDepth = -vp.z; vW = wp.xyz;
    gl_Position = uP * vp;
    vUV = mix(uUV.xy, uUV.zw, vec2(aPos.x + 0.5, 0.5 - aPos.y));
  }`;
  const FS = `#version 300 es
  precision highp float;
  in vec2 vUV; in float vDepth; in vec3 vW;
  uniform sampler2D uTex; uniform vec4 uTint; uniform float uUseTex; uniform float uAT;
  uniform vec3 uFog; uniform vec2 uFogR; uniform float uFogA;
  out vec4 o;
  void main(){
    vec4 c = uUseTex > 0.5 ? texture(uTex, vUV) : vec4(1.0);
    c *= uTint;
    if (c.a < uAT) discard;
    float f = clamp((vDepth - uFogR.x) / (uFogR.y - uFogR.x), 0.0, 1.0) * uFogA;
    c.rgb = mix(c.rgb, uFog * c.a, f);
    o = c;
  }`;
  const FSG = `#version 300 es
  precision highp float;
  in vec2 vUV; in float vDepth; in vec3 vW;
  uniform vec4 uTint; uniform vec4 uLine; uniform float uStep; uniform float uMajor;
  uniform vec3 uFog; uniform vec2 uFogR; uniform float uFogA;
  out vec4 o;
  float gl1(vec2 p, float w){ vec2 g = abs(fract(p - 0.5) - 0.5) / max(fwidth(p), vec2(1e-4)); return 1.0 - min(min(g.x, g.y) / w, 1.0); }
  void main(){
    vec2 p = vW.xz / uStep;
    float l = gl1(p, 1.1) * 0.55 + gl1(p / uMajor, 1.6);
    l = clamp(l, 0.0, 1.0);
    vec4 c = mix(uTint, uLine, l * uLine.a);
    c.a = uTint.a;
    c.rgb *= c.a;
    float f = clamp((vDepth - uFogR.x) / (uFogR.y - uFogR.x), 0.0, 1.0) * uFogA;
    c.rgb = mix(c.rgb, uFog * c.a, f);
    o = c;
  }`;

  function compile(vs, fs) {
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  function init() {
    if (gl) return true;
    cv = document.createElement('canvas');
    cv.width = 16; cv.height = 9;
    gl = cv.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
    if (!gl) { console.warn('WebGL2 unavailable'); return false; }
    P = compile(VS, FS); PG = compile(VS, FSG);
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    return true;
  }
  function size(w, h) {
    if (!init()) return;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    VW = w; VH = h;
  }
  function tex(key, canvas, opt = {}) {
    let t = texCache.get(key);
    if (t && !opt.update) return t;
    if (!t) t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    if (opt.mip === false) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    } else {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    texCache.set(key, t);
    return t;
  }

  // ---- mat4 (column-major) ----
  const M = {
    ident: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    mul(a, b) {
      const o = new Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
      return o;
    },
    persp(fovy, asp, n, f) {
      const t = 1 / Math.tan(fovy / 2);
      return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0];
    },
    lookAt(e, c, up = [0, 1, 0]) {
      let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; let l = Math.hypot(...z); z = z.map((v) => v / l);
      let x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]]; l = Math.hypot(...x) || 1; x = x.map((v) => v / l);
      const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
        -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1];
    },
    // translate * rotY * rotX * rotZ * scale
    trs(p, r, s) {
      const [rx, ry, rz] = r || [0, 0, 0];
      const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
      // R = Ry * Rx * Rz
      const m00 = cy * cz + sy * sx * sz, m01 = -cy * sz + sy * sx * cz, m02 = sy * cx;
      const m10 = cx * sz, m11 = cx * cz, m12 = -sx;
      const m20 = -sy * cz + cy * sx * sz, m21 = sy * sz + cy * sx * cz, m22 = cy * cx;
      const [a, b, c] = s || [1, 1, 1];
      return [m00 * a, m10 * a, m20 * a, 0, m01 * b, m11 * b, m21 * b, 0, m02 * c, m12 * c, m22 * c, 0, p[0], p[1], p[2], 1];
    },
  };

  let V = null, Pm = null, fog = { c: [0, 0, 0], r: [10, 100], a: 0 };
  let queue = [];
  function begin(bg, cam, fogOpt) {
    gl.viewport(0, 0, VW, VH);
    // bg === null: clear to transparent (a 3D layer composited over the flat picture)
    const [r, g, b] = bg ? PV.hexRgb(bg).map((v) => v / 255) : [0, 0, 0];
    gl.clearColor(r, g, b, bg ? 1 : 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    V = M.lookAt(cam.eye, cam.at, cam.up || [0, 1, 0]);
    Pm = M.persp(cam.fov || 0.9, VW / VH, cam.near || 0.1, cam.far || 400);
    fog = fogOpt ? { c: PV.hexRgb(fogOpt.color).map((v) => v / 255), r: fogOpt.range, a: fogOpt.amount == null ? 1 : fogOpt.amount } : { c: [r, g, b], r: [1e5, 1e6], a: 0 };
    queue = [];
  }
  // queue a textured/solid quad; o: {tex, uv:[u0,v0,u1,v1], tint:[r,g,b,a] (straight), at: alphaTest, blend:true, depthWrite}
  function quad(model, o) { queue.push({ model, o, grid: false }); }
  function floor(model, o) { queue.push({ model, o, grid: true }); }
  function depthOf(model) {
    const x = model[12], y = model[13], z = model[14];
    return -(V[2] * x + V[6] * y + V[10] * z + V[14]);
  }
  function flush() {
    gl.bindVertexArray(vao);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const opaque = queue.filter((q) => !q.o.blend), trans = queue.filter((q) => q.o.blend);
    trans.forEach((q) => (q.d = depthOf(q.model)));
    trans.sort((a, b) => b.d - a.d);
    const draw = (q) => {
      const o = q.o;
      const prog = q.grid ? PG : P;
      gl.useProgram(prog.p);
      const u = prog.u;
      gl.uniformMatrix4fv(u.uM, false, q.model);
      gl.uniformMatrix4fv(u.uV, false, V);
      gl.uniformMatrix4fv(u.uP, false, Pm);
      gl.uniform4fv(u.uUV, o.uv || [0, 0, 1, 1]);
      const t = o.tint || [1, 1, 1, 1];
      if (q.grid) {
        gl.uniform4f(u.uTint, t[0] * 1, t[1], t[2], t[3]);
        const lc = o.line || [1, 1, 1, 1];
        gl.uniform4f(u.uLine, lc[0], lc[1], lc[2], lc[3]);
        gl.uniform1f(u.uStep, o.step || 1);
        gl.uniform1f(u.uMajor, o.major || 5);
      } else {
        gl.uniform4f(u.uTint, t[0] * t[3], t[1] * t[3], t[2] * t[3], t[3]);
        gl.uniform1f(u.uUseTex, o.tex ? 1 : 0);
        gl.uniform1f(u.uAT, o.at == null ? 0.02 : o.at);
        if (o.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, o.tex); gl.uniform1i(u.uTex, 0); }
      }
      gl.uniform3fv(u.uFog, fog.c); gl.uniform2fv(u.uFogR, fog.r); gl.uniform1f(u.uFogA, o.noFog ? 0 : fog.a);
      if (o.a2c) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE); else gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      gl.depthMask(o.depthWrite == null ? !o.blend : o.depthWrite);
      if (o.additive) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    opaque.forEach(draw);
    trans.forEach(draw);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.depthMask(true);
    queue = [];
  }
  // project world point to logical 1920x1080 screen coords (for 2D overlays tied to 3D)
  function project(p) {
    const v = [V[0] * p[0] + V[4] * p[1] + V[8] * p[2] + V[12], V[1] * p[0] + V[5] * p[1] + V[9] * p[2] + V[13], V[2] * p[0] + V[6] * p[1] + V[10] * p[2] + V[14]];
    const x = Pm[0] * v[0], y = Pm[5] * v[1], w = -v[2];
    return { x: (x / w * 0.5 + 0.5) * PV.W, y: (0.5 - y / w * 0.5) * PV.H, z: w };
  }
  const tint = (hex, a = 1) => { const c = PV.hexRgb(hex); return [c[0] / 255, c[1] / 255, c[2] / 255, a]; };

  PV.G3 = { init, size, tex, M, begin, quad, floor, flush, project, tint, compile,
    get canvas() { return cv; }, get ok() { return !!gl; }, get gl() { return gl; },
    get view() { return V; }, get proj() { return Pm; }, get vw() { return VW; }, get vh() { return VH; } };
})();
