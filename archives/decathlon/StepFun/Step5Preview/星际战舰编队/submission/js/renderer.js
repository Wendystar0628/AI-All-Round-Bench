// renderer.js — WebGL2 renderer: voxel instancing, additive fx, bloom, composite
(function () {
  'use strict';
  const C = window.C;

  const VOX_VS = `#version 300 es
  layout(location=0) in vec2 a_corner;
  layout(location=1) in vec3 a_pos;
  layout(location=2) in float a_face;
  layout(location=3) in vec4 a_col;
  uniform mat4 u_vp; uniform mat4 u_model;
  uniform vec3 u_fn[6]; uniform vec3 u_fu[6]; uniform vec3 u_fv[6];
  out vec3 v_n; out vec4 v_c; out vec3 v_w; out vec3 v_lp;
  void main(){
    vec3 c = a_pos + 0.5;
    int fi = int(a_face + 0.5);
    vec3 n = u_fn[fi];
    vec3 p = c + n*0.5 + u_fu[fi]*(a_corner.x-0.5) + u_fv[fi]*(a_corner.y-0.5);
    vec4 wp = u_model * vec4(p,1.0);
    v_w = wp.xyz; v_lp = p;
    v_n = normalize(mat3(u_model)*n);
    v_c = a_col;
    gl_Position = u_vp * wp;
  }`;

  const LIGHT_FS = `#version 300 es
  precision highp float;
  in vec3 v_n; in vec4 v_c; in vec3 v_w; in vec3 v_lp;
  uniform vec3 u_lightDir, u_lightCol, u_amb, u_cam, u_fogCol, u_extraLight, u_fillDir, u_fillCol;
  uniform float u_fogDens;
  out vec4 o;
  void main(){
    vec3 n = normalize(v_n);
    vec3 V = normalize(u_cam - v_w);
    float ndl = max(dot(n, u_lightDir), 0.0);
    float wrapd = max(dot(n, u_lightDir)*0.5+0.5, 0.0);
    float fdl = max(dot(n, u_fillDir), 0.0);
    vec3 base = v_c.rgb;
    float emis = v_c.a;
    vec3 lit = base * (u_amb + u_lightCol*(ndl*0.9 + wrapd*0.28) + u_fillCol*fdl + u_extraLight*max(dot(n,normalize(u_extraLight+vec3(0.001))),0.0));
    vec3 H = normalize(u_lightDir + V);
    float spec = pow(max(dot(n,H),0.0), 46.0)*0.55*(1.0-emis);
    float fres = pow(1.0 - max(dot(n,V),0.0), 4.0);
    vec3 col = mix(lit + u_lightCol*spec + base*fres*0.16, base*1.06, emis);
    float d = length(u_cam - v_w);
    float fog = 1.0 - exp(-pow(max(d-400.0,0.0)*u_fogDens, 2.2));
    col = mix(col, u_fogCol, clamp(fog,0.0,0.9));
    o = vec4(col,1.0);
  }`;

  const GLOW_VS = `#version 300 es
  layout(location=0) in vec2 a_corner;
  layout(location=1) in vec3 a_center;
  layout(location=2) in vec2 a_size;
  layout(location=3) in vec4 a_col;
  layout(location=4) in vec4 a_par;
  uniform mat4 u_vp; uniform vec3 u_cam, u_right, u_up;
  out vec2 v_uv; out vec4 v_col; out vec4 v_par;
  void main(){
    vec2 q = a_corner*2.0-1.0;
    float rot = a_par.x;
    vec2 rq = vec2(q.x*cos(rot)-q.y*sin(rot), q.x*sin(rot)+q.y*cos(rot));
    vec3 wp = a_center + u_right*(rq.x*a_size.x) + u_up*(rq.y*a_size.y);
    v_uv = a_corner; v_col = a_col; v_par = a_par;
    gl_Position = u_vp * vec4(wp,1.0);
  }`;

  const GLOW_FS = `#version 300 es
  precision highp float;
  in vec2 v_uv; in vec4 v_col; in vec4 v_par;
  uniform float u_time;
  out vec4 o;
  void main(){
    vec2 p = v_uv*2.0-1.0;
    float r = length(p);
    if(r>1.0) discard;
    float soft = v_par.y;
    float a = pow(max(1.0-r,0.0), soft);
    float core = pow(max(1.0-r,0.0), soft*3.0);
    float flick = 0.85+0.15*sin(u_time*v_par.z*13.0 + v_par.w*20.0);
    o = vec4(v_col.rgb*(a+core*1.6)*v_col.a*flick, 1.0);
  }`;

  const BEAM_VS = `#version 300 es
  layout(location=0) in vec2 a_corner;
  layout(location=1) in vec3 a_start;
  layout(location=2) in vec3 a_end;
  layout(location=3) in vec4 a_col;
  layout(location=4) in vec4 a_par;
  uniform mat4 u_vp; uniform vec3 u_cam;
  out vec2 v_uv; out vec4 v_col; out vec4 v_par; out vec3 v_w;
  void main(){
    vec3 dir = a_end - a_start;
    vec3 mid = (a_start+a_end)*0.5;
    vec3 toCam = u_cam - mid;
    vec3 side = cross(dir, toCam);
    float sl = length(side);
    side = sl > 0.0001 ? side/sl : vec3(1.0,0.0,0.0);
    float w = a_par.x;
    vec3 wp = mix(a_start,a_end,a_corner.x) + side*(a_corner.y-0.5)*w;
    v_w = wp; v_uv = a_corner; v_col = a_col; v_par = a_par;
    gl_Position = u_vp * vec4(wp,1.0);
  }`;

  const BEAM_FS = `#version 300 es
  precision highp float;
  in vec2 v_uv; in vec4 v_col; in vec4 v_par; in vec3 v_w;
  uniform float u_time;
  out vec4 o;
  void main(){
    float across = abs(v_uv.y-0.5)*2.0;
    float len = v_uv.x;
    float core = pow(max(1.0-across,0.0), 3.0);
    float halo = pow(max(1.0-across,0.0), 1.2)*0.45;
    float flow = 0.65+0.35*sin(len*v_par.y*3.14159*6.0 - u_time*v_par.z*10.0);
    float pulse = 0.8+0.2*sin(u_time*30.0*v_par.w);
    float head = smoothstep(0.0,0.06,len)*smoothstep(1.0,0.86,len);
    float a = (core*1.5+halo)*flow*pulse*head*v_col.a;
    vec3 c = mix(v_col.rgb, vec3(1.0), core*0.55);
    o = vec4(c*a, 1.0);
  }`;

  const CUBE_VS = `#version 300 es
  layout(location=0) in vec3 a_p;
  layout(location=1) in vec3 a_n;
  layout(location=2) in vec3 a_pos;
  layout(location=3) in vec3 a_r0;
  layout(location=4) in vec3 a_r1;
  layout(location=5) in vec3 a_r2;
  layout(location=6) in vec4 a_col;
  uniform mat4 u_vp;
  out vec3 v_n; out vec4 v_c; out vec3 v_w;
  void main(){
    mat3 R = mat3(a_r0,a_r1,a_r2);
    vec3 wp = a_pos + R*a_p;
    v_w = wp; v_n = R*a_n; v_c = a_col;
    gl_Position = u_vp * vec4(wp,1.0);
  }`;

  const SHIELD_VS = `#version 300 es
  layout(location=0) in vec3 a_p;
  layout(location=1) in vec3 a_n;
  layout(location=2) in vec3 a_l;
  uniform mat4 u_vp; uniform mat4 u_model;
  out vec3 v_n; out vec3 v_w; out vec3 v_l;
  void main(){
    vec4 wp = u_model*vec4(a_p,1.0);
    v_w = wp.xyz; v_l = a_l; v_n = normalize(mat3(u_model)*a_n);
    gl_Position = u_vp*wp;
  }`;

  const SHIELD_FS = `#version 300 es
  precision highp float;
  in vec3 v_n; in vec3 v_w; in vec3 v_l;
  uniform vec3 u_cam, u_col;
  uniform float u_time, u_alpha, u_flow, u_len;
  out vec4 o;
  void main(){
    vec3 V = normalize(u_cam - v_w);
    float f = 1.0 - abs(dot(normalize(v_n), V));
    float rim = pow(f, 2.2);
    float bands = sin(v_l.x*0.09 - u_time*u_flow*1.6)*0.5+0.5;
    bands = pow(bands, 3.0);
    float rings = sin((v_l.x*0.05 + u_len*0.02) - u_time*u_flow*2.4);
    rings = pow(max(rings,0.0), 6.0);
    float lat = sin(v_l.y*0.22)*sin(v_l.z*0.22);
    float grid = pow(max(abs(lat),0.0), 8.0)*0.5;
    float a = (rim*0.9 + bands*0.35 + rings*0.55 + grid*0.4) * u_alpha;
    o = vec4(u_col*a, 1.0);
  }`;

  const BG_VS = `#version 300 es
  layout(location=0) in vec2 a_xy;
  out vec2 v_uv;
  void main(){ v_uv = a_xy; gl_Position = vec4(a_xy,0.999,1.0); }`;

  const BG_FS = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform mat4 u_invVP;
  uniform vec3 u_cam;
  uniform float u_time, u_aspect;
  out vec4 o;
  float hash(vec3 p){ p = fract(p*0.3183099+vec3(0.71,0.113,0.419)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float noise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                   mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                   mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float fbm(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5;} return s; }
  void main(){
    vec2 nd = vec2(v_uv.x*u_aspect, v_uv.y);
    vec4 p = u_invVP*vec4(nd, 0.999, 1.0);
    vec3 dir = normalize(p.xyz/p.w - u_cam);
    vec3 d = dir*3.0;
    // nebula layers
    float n1 = fbm(d*0.9+vec3(0.0,0.0,u_time*0.005));
    float n2 = fbm(d*2.1+vec3(5.2,1.3,u_time*0.003));
    vec3 neb = vec3(0.055,0.10,0.17)*pow(n1,2.2)*2.2 + vec3(0.09,0.05,0.14)*pow(n2,2.6)*1.8;
    neb += vec3(0.02,0.05,0.07)*pow(fbm(d*0.4+vec3(11.0)),3.0)*1.5;
    // stars
    vec3 sp = dir*260.0;
    vec3 si = floor(sp);
    float h = hash(si);
    float star = 0.0;
    if(h > 0.985){
      vec3 fp = fract(sp)-0.5;
      float d2 = dot(fp,fp);
      star = smoothstep(0.06, 0.0, d2) * (0.4+0.6*hash(si+3.7));
    }
    // second, dimmer layer
    vec3 sp2 = dir*90.0; vec3 si2 = floor(sp2); float h2 = hash(si2+1.3);
    float star2 = h2>0.9975 ? smoothstep(0.02,0.0,length(fract(sp2)-0.5))*0.6 : 0.0;
    // main star (light source direction)
    vec3 L = normalize(vec3(-0.55,0.42,0.72));
    float sd = max(dot(dir,L),0.0);
    vec3 sun = vec3(1.0,0.86,0.66)*pow(sd, 900.0)*3.0 + vec3(0.5,0.42,0.34)*pow(sd, 22.0)*0.16;
    vec3 col = neb + vec3(star)*vec3(0.85,0.92,1.0) + vec3(star2) + sun;
    col += vec3(0.012,0.018,0.028);
    o = vec4(col,1.0);
  }`;

  const COMP_VS = `#version 300 es
  layout(location=0) in vec2 a_xy;
  out vec2 v_uv;
  void main(){ v_uv = a_xy*0.5+0.5; gl_Position = vec4(a_xy,0.0,1.0); }`;

  const COMP_FS = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_scene; uniform sampler2D u_bloom;
  uniform float u_bloomAmt, u_exposure, u_vig;
  out vec4 o;
  vec3 aces(vec3 x){
    float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
    return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0);
  }
  void main(){
    vec3 c = texture(u_scene, v_uv).rgb;
    vec3 bl = texture(u_bloom, v_uv).rgb;
    c += bl*u_bloomAmt;
    c *= u_exposure;
    c = aces(c);
    float d = length(v_uv-0.5);
    c *= 1.0 - u_vig*d*d*1.6;
    o = vec4(c,1.0);
  }`;

  const BRIGHT_FS = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_tex; uniform float u_thresh;
  out vec4 o;
  void main(){
    vec3 c = texture(u_tex, v_uv).rgb;
    float l = dot(c, vec3(0.2126,0.7152,0.0722));
    float k = max(l-u_thresh, 0.0)/max(l,0.0001);
    o = vec4(c*k, 1.0);
  }`;

  const BLUR_FS = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_tex; uniform vec2 u_dir;
  out vec4 o;
  void main(){
    vec3 s = texture(u_tex,v_uv).rgb*0.2270270270;
    vec2 o1 = u_dir*1.3846153846; vec2 o2 = u_dir*3.2307692308;
    s += (texture(u_tex,v_uv+o1).rgb + texture(u_tex,v_uv-o1).rgb)*0.3162162162;
    s += (texture(u_tex,v_uv+o2).rgb + texture(u_tex,v_uv-o2).rgb)*0.0702702703;
    o = vec4(s,1.0);
  }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s), src);
      throw new Error('shader compile');
    }
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); throw new Error('link'); }
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  const CUBE_VERTS = (function () {
    const faces = [
      { n: [-1, 0, 0], v: [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-.5, -.5, -.5]] },
      { n: [1, 0, 0], v: [[.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [.5, .5, .5], [.5, -.5, .5], [.5, -.5, -.5]] },
      { n: [0, -1, 0], v: [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [.5, -.5, .5], [-.5, -.5, .5], [-.5, -.5, -.5]] },
      { n: [0, 1, 0], v: [[-.5, .5, -.5], [-.5, .5, .5], [.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]] },
      { n: [0, 0, -1], v: [[-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5], [.5, .5, -.5], [.5, -.5, -.5], [-.5, -.5, -.5]] },
      { n: [0, 0, 1], v: [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [.5, .5, .5], [-.5, .5, .5], [-.5, -.5, .5]] }
    ];
    const out = [];
    for (const f of faces) for (const v of f.v) out.push(v[0], v[1], v[2], f.n[0], f.n[1], f.n[2]);
    return new Float32Array(out);
  })();

  function sphereMesh(rings, sectors) {
    const pos = [], nor = [], loc = [], idx = [];
    for (let i = 0; i <= rings; i++) {
      const phi = i / rings * Math.PI;
      for (let j = 0; j <= sectors; j++) {
        const th = j / sectors * Math.PI * 2;
        const x = Math.sin(phi) * Math.cos(th), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(th);
        pos.push(x, y, z); nor.push(x, y, z); loc.push(x, y, z);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < sectors; j++) {
      const a = i * (sectors + 1) + j, b = a + sectors + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), loc: new Float32Array(loc), idx: new Uint16Array(idx) };
  }

  class Renderer {
    constructor(canvas) {
      const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
      if (!gl) throw new Error('webgl2 unavailable');
      this.gl = gl; this.canvas = canvas;
      this.hasFloat = !!gl.getExtension('EXT_color_buffer_float');
      this.hasFloatLinear = !!gl.getExtension('OES_texture_float_linear');
      this.progVox = program(gl, VOX_VS, LIGHT_FS);
      this.progGlow = program(gl, GLOW_VS, GLOW_FS);
      this.progBeam = program(gl, BEAM_VS, BEAM_FS);
      this.progCube = program(gl, CUBE_VS, LIGHT_FS);
      this.progShield = program(gl, SHIELD_VS, SHIELD_FS);
      this.progBG = program(gl, BG_VS, BG_FS);
      this.progComp = program(gl, COMP_VS, COMP_FS);
      this.progBright = program(gl, COMP_VS, BRIGHT_FS);
      this.progBlur = program(gl, COMP_VS, BLUR_FS);
      this.faceData = { n: [], u: [], v: [] };
      for (let i = 0; i < 6; i++) {
        const F = window.VB.FACES[i];
        this.faceData.n.push(...F.n); this.faceData.u.push(...F.u); this.faceData.v.push(...F.v);
      }
      this.faceN = new Float32Array(this.faceData.n);
      this.faceU = new Float32Array(this.faceData.u);
      this.faceV = new Float32Array(this.faceData.v);
      // shared quad
      this.quadVAO = gl.createVertexArray();
      gl.bindVertexArray(this.quadVAO);
      const qb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, qb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      this.quadBuf = qb;
      // cube vao
      this.cubeVAO = gl.createVertexArray();
      gl.bindVertexArray(this.cubeVAO);
      const cb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, cb);
      gl.bufferData(gl.ARRAY_BUFFER, CUBE_VERTS, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(0, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12); gl.vertexAttribDivisor(1, 0);
      gl.bindVertexArray(null);
      this.cubeBuf = cb;
      // sphere
      const sm = sphereMesh(18, 26);
      this.sphereVAO = gl.createVertexArray();
      gl.bindVertexArray(this.sphereVAO);
      const sb = (arr, loc, size, divisor) => {
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(loc, divisor);
        return b;
      };
      this.spherePosBuf = sb(sm.pos, 0, 3, 0);
      this.sphereNorBuf = sb(sm.nor, 1, 3, 0);
      this.sphereLocBuf = sb(sm.loc, 2, 3, 0);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sm.idx, gl.STATIC_DRAW);
      this.sphereIdxCount = sm.idx.length;
      gl.bindVertexArray(null);
      // dynamic instance buffers
      this.bufs = {};
      this.pools = {
        glow: { data: new Float32Array(6000 * 13), n: 0, vao: null },
        beam: { data: new Float32Array(1600 * 14), n: 0, vao: null },
        cube: { data: new Float32Array(30000 * 16), n: 0, vao: null }
      };
      this.glowCount = 0; this.beamCount = 0; this.cubeCount = 0;
      this.lightDir = C.norm([-0.55, 0.42, 0.72]);
      this.lightCol = [0.88, 0.82, 0.74];
      this.amb = [0.10, 0.13, 0.20];
      this.extraLight = [0, 0, 0];
      this.fillDir = C.norm([-0.38, -0.72, 0.58]);
      this.fillCol = [0.20, 0.23, 0.30];
      this.fogCol = [0.012, 0.018, 0.030];
      this.fogDens = 0.00042;
      this.time = 0;
      this.aspect = 1;
      this.resize(canvas.clientWidth || 1280, canvas.clientHeight || 720);
    }

    resize(w, h) {
      const gl = this.gl;
      this.w = Math.max(2, w | 0); this.h = Math.max(2, h | 0);
      this.aspect = this.w / this.h;
      const c = this.canvas;
      c.width = this.w; c.height = this.h;
      const fmt = this.hasFloat ? gl.RGBA16F : gl.RGBA8;
      const type = this.hasFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
      if (!this.sceneFBO) {
        this.sceneTex = gl.createTexture();
        this.sceneFBO = gl.createFramebuffer();
        this.depthRB = gl.createRenderbuffer();
        this.bloomA = this.makeRT(fmt, type, this.w >> 1, this.h >> 1);
        this.bloomB = this.makeRT(fmt, type, this.w >> 1, this.h >> 1);
        this.brightRT = this.makeRT(fmt, type, this.w >> 2, this.h >> 2);
        this.blur1 = this.makeRT(fmt, type, this.w >> 2, this.h >> 2);
        this.blur2 = this.makeRT(fmt, type, this.w >> 2, this.h >> 2);
      }
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, this.w, this.h, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRB);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.w, this.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRB);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      for (const k of ['bloomA', 'bloomB']) this.sizeRT(this[k], fmt, type, this.w >> 1, this.h >> 1);
      for (const k of ['brightRT', 'blur1', 'blur2']) this.sizeRT(this[k], fmt, type, this.w >> 2, this.h >> 2);
    }
    makeRT(fmt, type, w, h) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, Math.max(2, w), Math.max(2, h), 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fbo, w: Math.max(2, w), h: Math.max(2, h) };
    }
    sizeRT(rt, fmt, type, w, h) {
      const gl = this.gl;
      rt.w = Math.max(2, w); rt.h = Math.max(2, h);
      gl.bindTexture(gl.TEXTURE_2D, rt.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, rt.w, rt.h, 0, gl.RGBA, type, null);
    }

    setCamera(eye, target, up, fovDeg) {
      const aspect = this.aspect;
      this.proj = C.m4.perspective(fovDeg * Math.PI / 180, aspect, 1.0, 30000);
      this.view = C.m4.lookAt(eye, target, up || [0, 1, 0]);
      this.vp = C.m4.mul(this.proj, this.view);
      this.invVP = invert4(this.vp);
      this.eye = eye;
      this.right = C.norm(C.cross(C.sub(target, eye), up || [0, 1, 0]));
      this.up = C.norm(C.cross(C.sub(eye, target), this.right));
    }

    beginScene() {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
      gl.viewport(0, 0, this.w, this.h);
      gl.clearColor(0, 0, 0, 1);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);

      // background
      const bg = this.progBG;      gl.useProgram(bg.p);
      gl.uniformMatrix4fv(bg.u.u_invVP, false, this.invVP);
      gl.uniform3fv(bg.u.u_cam, this.eye);
      gl.uniform1f(bg.u.u_time, this.time);
      gl.uniform1f(bg.u.u_aspect, this.aspect);
      gl.bindVertexArray(this.quadVAO);
      gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.depthMask(true);
    }

    drawMesh(mesh, model) {
      const gl = this.gl, P = this.progVox;
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.u.u_vp, false, this.vp);
      gl.uniformMatrix4fv(P.u.u_model, false, model);
      gl.uniform3fv(P.u.u_fn, this.faceN);
      gl.uniform3fv(P.u.u_fu, this.faceU);
      gl.uniform3fv(P.u.u_fv, this.faceV);
      gl.uniform3fv(P.u.u_lightDir, this.lightDir);
      gl.uniform3fv(P.u.u_lightCol, this.lightCol);
      gl.uniform3fv(P.u.u_amb, this.amb);
      gl.uniform3fv(P.u.u_cam, this.eye);
      gl.uniform3fv(P.u.u_fogCol, this.fogCol);
      gl.uniform3fv(P.u.u_extraLight, this.extraLight);
      gl.uniform3fv(P.u.u_fillDir, this.fillDir);
      gl.uniform3fv(P.u.u_fillCol, this.fillCol);
      gl.uniform1f(P.u.u_fogDens, this.fogDens);
      gl.bindVertexArray(mesh.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, mesh.count);
    }

    // ---- instance collection ----
    _vao(kind, stride, layout, base) {
      const gl = this.gl;
      if (this.pools[kind].vao) return this.pools[kind].vao;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      if (base === 'cube') {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
        gl.vertexAttribDivisor(0, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
        gl.vertexAttribDivisor(1, 0);
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(0, 0);
      }
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      this.pools[kind].buf = b;
      let off = 0;
      for (const L of layout) {
        gl.enableVertexAttribArray(L.loc);
        gl.vertexAttribPointer(L.loc, L.size, gl.FLOAT, false, stride, off);
        gl.vertexAttribDivisor(L.loc, 1);
        off += L.size * 4;
      }
      gl.bindVertexArray(null);
      this.pools[kind].vao = vao;
      return vao;
    }
    pushGlow(cx, cy, cz, sx, sy, r, g, b, a, rot, soft, flick, phase) {
      const d = this.pools.glow.data, i = this.pools.glow.n * 13;
      d[i] = cx; d[i + 1] = cy; d[i + 2] = cz; d[i + 3] = sx; d[i + 4] = sy;
      d[i + 5] = r; d[i + 6] = g; d[i + 7] = b; d[i + 8] = a;
      d[i + 9] = rot; d[i + 10] = soft; d[i + 11] = flick; d[i + 12] = phase;
      this.pools.glow.n++;
    }
    pushBeam(sx, sy, sz, ex, ey, ez, r, g, b, a, width, freq, speed, phase) {
      const d = this.pools.beam.data, i = this.pools.beam.n * 14;
      d[i] = sx; d[i + 1] = sy; d[i + 2] = sz; d[i + 3] = ex; d[i + 4] = ey; d[i + 5] = ez;
      d[i + 6] = r; d[i + 7] = g; d[i + 8] = b; d[i + 9] = a;
      d[i + 10] = width; d[i + 11] = freq; d[i + 12] = speed; d[i + 13] = phase;
      this.pools.beam.n++;
    }
    pushCube(px, py, pz, r00, r01, r02, r10, r11, r12, r20, r21, r22, r, g, b, a) {
      const d = this.pools.cube.data, i = this.pools.cube.n * 16;
      d[i] = px; d[i + 1] = py; d[i + 2] = pz;
      d[i + 3] = r00; d[i + 4] = r01; d[i + 5] = r02;
      d[i + 6] = r10; d[i + 7] = r11; d[i + 8] = r12;
      d[i + 9] = r20; d[i + 10] = r21; d[i + 11] = r22;
      d[i + 12] = r; d[i + 13] = g; d[i + 14] = b; d[i + 15] = a;
      this.pools.cube.n++;
    }

    flushFX() {
      const gl = this.gl;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      // cubes
      if (this.pools.cube.n) {
        const P = this.progCube;
        gl.useProgram(P.p);
        gl.uniformMatrix4fv(P.u.u_vp, false, this.vp);
        gl.uniform3fv(P.u.u_lightDir, this.lightDir);
        gl.uniform3fv(P.u.u_lightCol, this.lightCol);
        gl.uniform3fv(P.u.u_amb, this.amb);
        gl.uniform3fv(P.u.u_cam, this.eye);
        gl.uniform3fv(P.u.u_fogCol, this.fogCol);
        gl.uniform3fv(P.u.u_extraLight, this.extraLight);
        gl.uniform3fv(P.u.u_fillDir, this.fillDir);
        gl.uniform3fv(P.u.u_fillCol, this.fillCol);
        gl.uniform1f(P.u.u_fogDens, this.fogDens);
        const vao = this._vao('cube', 64, [
          { loc: 2, size: 3 }, { loc: 3, size: 3 }, { loc: 4, size: 3 }, { loc: 5, size: 3 }, { loc: 6, size: 4 }], 'cube');
        gl.bindVertexArray(vao);
        const b = this.pools.cube.buf;
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, this.pools.cube.data.subarray(0, this.pools.cube.n * 16), gl.DYNAMIC_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, this.pools.cube.n);
      }
      // glows
      if (this.pools.glow.n) {
        const P = this.progGlow;
        gl.useProgram(P.p);
        gl.uniformMatrix4fv(P.u.u_vp, false, this.vp);
        gl.uniform3fv(P.u.u_cam, this.eye);
        gl.uniform3fv(P.u.u_right, this.right);
        gl.uniform3fv(P.u.u_up, this.up);
        gl.uniform1f(P.u.u_time, this.time);
        const vao = this._vao('glow', 52, [
          { loc: 1, size: 3 }, { loc: 2, size: 2 }, { loc: 3, size: 4 }, { loc: 4, size: 4 }]);
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.pools.glow.buf);
        gl.bufferData(gl.ARRAY_BUFFER, this.pools.glow.data.subarray(0, this.pools.glow.n * 13), gl.DYNAMIC_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.pools.glow.n);
      }
      // beams
      if (this.pools.beam.n) {
        const P = this.progBeam;
        gl.useProgram(P.p);
        gl.uniformMatrix4fv(P.u.u_vp, false, this.vp);
        gl.uniform3fv(P.u.u_cam, this.eye);
        gl.uniform1f(P.u.u_time, this.time);
        const vao = this._vao('beam', 56, [
          { loc: 1, size: 3 }, { loc: 2, size: 3 }, { loc: 3, size: 4 }, { loc: 4, size: 4 }]);
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.pools.beam.buf);
        gl.bufferData(gl.ARRAY_BUFFER, this.pools.beam.data.subarray(0, this.pools.beam.n * 14), gl.DYNAMIC_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.pools.beam.n);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      this.pools.glow.n = 0; this.pools.beam.n = 0; this.pools.cube.n = 0;
    }

    drawShield(mesh, model, color, time, alpha, flow, len) {
      const gl = this.gl, P = this.progShield;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.u.u_vp, false, this.vp);
      gl.uniformMatrix4fv(P.u.u_model, false, model);
      gl.uniform3fv(P.u.u_cam, this.eye);
      gl.uniform3fv(P.u.u_col, color);
      gl.uniform1f(P.u.u_time, time);
      gl.uniform1f(P.u.u_alpha, alpha);
      gl.uniform1f(P.u.u_flow, flow);
      gl.uniform1f(P.u.u_len, len);
      gl.bindVertexArray(this.sphereVAO);
      gl.drawElements(gl.TRIANGLES, this.sphereIdxCount, gl.UNSIGNED_SHORT, 0);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    endFrame() {
      const gl = this.gl;
      // bright pass at quarter res
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.brightRT.fbo);
      gl.viewport(0, 0, this.brightRT.w, this.brightRT.h);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.useProgram(this.progBright.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.uniform1i(this.progBright.u.u_tex, 0);
      gl.uniform1f(this.progBright.u.u_thresh, 0.55);
      gl.bindVertexArray(this.quadVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      // blur ping-pong at quarter
      let src = this.brightRT.tex;
      for (let i = 0; i < 2; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blur1.fbo);
        gl.viewport(0, 0, this.blur1.w, this.blur1.h);
        this.blit(this.progBlur, src, [1.6 / this.blur1.w, 0]);
        src = this.blur1.tex;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blur2.fbo);
        gl.viewport(0, 0, this.blur2.w, this.blur2.h);
        this.blit(this.progBlur, src, [0, 1.6 / this.blur2.h]);
        src = this.blur2.tex;
      }
      // upsample blur result into bloomA (half res) via bright-style blit then composite uses half res
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.fbo);
      gl.viewport(0, 0, this.bloomA.w, this.bloomA.h);
      this.blitRaw(this.progBlur, src, [1.0 / this.bloomA.w, 0]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomB.fbo);
      gl.viewport(0, 0, this.bloomB.w, this.bloomB.h);
      this.blitRaw(this.progBlur, this.bloomA.tex, [0, 1.0 / this.bloomB.h]);
      // composite
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.w, this.h);
      const P = this.progComp;
      gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.bloomB.tex);
      gl.uniform1i(P.u.u_scene, 0);
      gl.uniform1i(P.u.u_bloom, 1);
      gl.uniform1f(P.u.u_bloomAmt, 0.62);
      gl.uniform1f(P.u.u_exposure, 1.0);
      gl.uniform1f(P.u.u_vig, 0.42);
      gl.bindVertexArray(this.quadVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.activeTexture(gl.TEXTURE0);
      gl.enable(gl.DEPTH_TEST);
    }
    blit(prog, tex, dir) {
      const gl = this.gl;
      gl.useProgram(prog.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(prog.u.u_tex, 0);
      if (dir) gl.uniform2fv(prog.u.u_dir, dir);
      gl.bindVertexArray(this.quadVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    blitRaw(prog, tex, dir) {
      const gl = this.gl;
      gl.useProgram(prog.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(prog.u.u_tex, 0);
      if (dir) gl.uniform2fv(prog.u.u_dir, dir);
      gl.bindVertexArray(this.quadVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  function invert4(m) {
    const inv = new Float32Array(16);
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return inv;
    det = 1.0 / det;
    inv[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    inv[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    inv[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    inv[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    inv[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    inv[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    inv[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    inv[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    inv[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    inv[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    inv[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    inv[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    inv[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    inv[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    inv[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    inv[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return inv;
  }

  window.Renderer = Renderer;
  window.invert4 = invert4;
})();
