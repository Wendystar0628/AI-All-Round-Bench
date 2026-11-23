/* 星际战舰编队 — renderer (WebGL2)
 *  - solid pass : voxel-grid shaded surfaces (cell grooves + facet bevel)
 *  - sky pass   : procedural nebula / stars / primary body
 *  - beam pass  : camera-facing energy ribbons
 *  - sprite pass: billboards for rounds, sparks, flames, blasts
 *  - shield pass: fresnel shells with flowing weave
 *  - post       : bright pass -> blur -> composite -> ACES
 */
(function (global) {
  'use strict';
  const F = global.FLEET = global.FLEET || {};
  const Core = F.Core, M4 = Core.M4;

  /* ================================================================== */
  /* shaders                                                            */
  /* ================================================================== */
  const COMMON = `
float hash31(vec3 p){
  p = fract(p*0.3183099+vec3(0.11,0.17,0.13));
  p *= 17.0;
  return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
}
float fbm(vec3 p){
  float a=0.5, s=0.0;
  for(int i=0;i<5;i++){
    float n = hash31(floor(p));
    vec3 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float m = mix(mix(n, hash31(floor(p)+vec3(1,0,0)), f.x),
                  mix(hash31(floor(p)+vec3(0,1,0)), hash31(floor(p)+vec3(1,1,0)), f.x), f.y);
    s += a*m; a*=0.5; p*=2.03;
  }
  return s;
}
`;

  const SOLID_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in vec3 aMat;   // emissive, specular, ao
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform mat3 uNormalMat;
out vec3 vWorld; out vec3 vNrm; out vec3 vNL; out vec3 vCol; out vec3 vMat; out vec3 vLocal;
void main(){
  vec4 wp = uModel*vec4(aPos,1.0);
  vWorld = wp.xyz;
  vNrm = uNormalMat*aNormal;
  vNL = aNormal;
  vLocal = aPos;
  vCol = aColor; vMat = aMat;
  gl_Position = uViewProj*wp;
}`;

  const SOLID_FS = `#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vNrm; in vec3 vNL; in vec3 vCol; in vec3 vMat; in vec3 vLocal;
uniform vec3 uCamPos;
uniform vec3 uKeyDir;      // surface -> light
uniform vec3 uKeyColor;
uniform vec3 uAmbTop;
uniform vec3 uAmbBot;
uniform vec3 uRimColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform mat3 uNormalMat;
uniform float uEmissiveBoost;
uniform float uGridFade;
out vec4 outColor;
${COMMON}
void main(){
  vec3 n = normalize(vNrm);
  /* ---- voxel lattice read-back ---- */
  vec3 an = abs(vNL);
  vec3 sel = step(an.yzx, an.xyz)*step(an.zxy, an.xyz);
  vec3 f = fract(vLocal);
  vec3 d3 = min(f, 1.0-f);
  d3 = mix(d3, vec3(1.0), sel);
  float d = min(d3.x, min(d3.y, d3.z));
  float fw = fwidth(vLocal.x)+fwidth(vLocal.y)+fwidth(vLocal.z);
  float aa = clamp(fw*1.5, 0.0, 1.0);
  float groove = mix(smoothstep(0.0, 0.085, d), 1.0, aa*uGridFade);
  /* per-cell facet bevel (faded out when a cell is smaller than a pixel) */
  vec3 off = (0.5-f)*(1.0-sel);
  vec3 nb = normalize(n - uNormalMat*off*0.19*aa);
  /* per-cell tone jitter */
  vec3 cell = floor(vLocal);
  float jit = hash31(cell*1.7);
  vec3 base = vCol*(1.0+(jit-0.5)*0.07);

  vec3 V = normalize(uCamPos-vWorld);
  vec3 L = normalize(uKeyDir);
  float ndl = max(dot(nb,L),0.0);
  float wrap = max(dot(n,L)*0.5+0.5, 0.0);
  vec3 amb = mix(uAmbBot, uAmbTop, nb.y*0.5+0.5);
  float ao = vMat.z*mix(0.42,1.0,groove);
  vec3 col = base*(amb + uKeyColor*ndl*0.95 + uKeyColor*wrap*0.16)*ao;
  vec3 H = normalize(L+V);
  float sp = pow(max(dot(nb,H),0.0), mix(26.0,140.0,vMat.y))*vMat.y;
  col += uKeyColor*sp*0.22;
  float rim = pow(1.0-max(dot(nb,V),0.0),3.6);
  col += uRimColor*rim*(0.26+0.22*(1.0-groove));
  col += base*vMat.x*uEmissiveBoost*mix(0.58,1.0,groove)*mix(0.75,1.0,ao);
  float dist = length(uCamPos-vWorld);
  float fog = 1.0-exp(-dist*uFogDensity);
  col = mix(col, uFogColor, clamp(fog,0.0,1.0));
  outColor = vec4(col,1.0);
}`;

  const SKY_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
out vec3 vRay;
void main(){
  vec4 p = uInvViewProj*vec4(aPos,1.0,1.0);
  vRay = p.xyz/p.w - uCamPos;
  gl_Position = vec4(aPos,0.9999,1.0);
}`;

  const SKY_FS = `#version 300 es
precision highp float;
in vec3 vRay;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uPlanetDir;
uniform float uTime;
uniform float uNebula;
out vec4 outColor;
${COMMON}
void main(){
  vec3 rd = normalize(vRay);
  vec3 col = vec3(0.005,0.008,0.016);

  /* ---- nebula sheets ---- */
  float n1 = fbm(rd*2.3+vec3(11.0,3.0,7.0));
  float n2 = fbm(rd*4.6+vec3(-5.0,9.0,2.0));
  float n3 = fbm(rd*9.5+vec3(31.0,-8.0,17.0));
  float sheet = smoothstep(0.32,0.86,n1*0.7+n2*0.3);
  vec3 neb = mix(vec3(0.075,0.045,0.155), vec3(0.020,0.115,0.175), smoothstep(0.28,0.82,n2));
  neb = mix(neb, vec3(0.185,0.055,0.095), smoothstep(0.62,1.0,n3)*0.6);
  col += neb*sheet*uNebula;
  float knot = smoothstep(0.68,1.0,fbm(rd*4.2+vec3(70.0,20.0,40.0)));
  col += vec3(0.20,0.115,0.25)*knot*uNebula;

  /* ---- primary body: a large world lit from the side, only a crescent burns ---- */
  vec3 pc = normalize(uPlanetDir);
  float ca = dot(rd,pc);
  const float alpha = 0.185;                 // angular radius of the disc
  float ang = acos(clamp(ca,-1.0,1.0));
  float tt = ang/alpha;
  if(tt < 1.0){
    vec3 tang = rd - pc*ca;
    float tl = length(tang);
    vec3 tg = tang/max(tl,1e-5);
    float r = tl/sin(alpha);
    vec3 nrm = normalize(pc*sqrt(max(0.0,1.0-r*r)) + tg*r);
    float lam = max(dot(nrm,normalize(uKeyDir)),0.0);
    float tex = fbm(nrm*4.0)*0.62+fbm(nrm*12.0)*0.28;
    vec3 body = mix(vec3(0.055,0.052,0.047), vec3(0.235,0.170,0.112), 0.5+0.5*tex);
    vec3 lit = body*(0.012+1.30*pow(lam,1.25));
    // thin atmosphere caught on the limb, never a filled disc
    float limb = smoothstep(0.80,1.0,r)*(0.10+0.90*lam);
    lit += vec3(0.30,0.46,1.0)*limb*1.05;
    col = mix(col, lit, smoothstep(1.0,0.985,tt));
  }
  /* a soft halo hugging the limb instead of a detached ring */
  float atm = exp(-max(0.0,tt-1.0)*6.5)*smoothstep(0.94,1.0,tt);
  col += vec3(0.10,0.15,0.34)*atm*0.42*uNebula;

  /* ---- the star that lights the fleet ---- */
  vec3 sd = normalize(uKeyDir);
  float sdot = max(dot(rd,sd),0.0);
  col += vec3(1.0,0.94,0.82)*pow(sdot,2200.0)*6.0;
  col += vec3(0.55,0.45,0.34)*pow(sdot,42.0)*0.30;

  /* ---- stars ---- */
  vec3 sp = rd*260.0;
  vec3 fl = floor(sp), fr = fract(sp)-0.5;
  float h = hash31(fl);
  if(h>0.9955){
    float br = (h-0.9955)/0.0045;
    vec2 off = vec2(hash31(fl+7.1),hash31(fl+3.3))-0.5;
    float dd = length((fr.xy-off*0.6));
    float s = smoothstep(0.34,0.0,dd)*br;
    vec3 sc = mix(vec3(0.75,0.84,1.0), vec3(1.0,0.88,0.72), hash31(fl+19.0));
    col += sc*s*(0.55+0.85*br);
  }
  outColor=vec4(col,1.0);
}`;

  const BEAM_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;   // x = t along beam, y = side (-1..1), z = unused
uniform mat4 uViewProj;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uCamPos;
uniform float uRadius;
uniform float uTime;
out float vT; out float vSide; out vec3 vWorld;
void main(){
  float t = aPos.x;
  vec3 P = mix(uA,uB,t);
  vec3 dir = normalize(uB-uA+vec3(0.0,0.0001,0.0));
  vec3 toCam = normalize(uCamPos-P);
  vec3 right = normalize(cross(dir,toCam));
  float pulse = 1.0+0.16*sin(t*46.0-uTime*26.0)+0.10*sin(t*17.0+uTime*11.0);
  float r = uRadius*pulse*(1.0+0.44*exp(-t*9.0))*(1.0+0.58*exp(-(1.0-t)*8.0));
  vWorld = P + right*(aPos.y*r);
  vT = t; vSide = aPos.y;
  gl_Position = uViewProj*vec4(vWorld,1.0);
}`;

  const BEAM_FS = `#version 300 es
precision highp float;
in float vT; in float vSide; in vec3 vWorld;
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
out vec4 outColor;
void main(){
  float x = abs(vSide);
  float core = exp(-x*x*26.0);
  float glow = exp(-x*3.1)*0.55;
  float flow = 0.72+0.28*sin(vT*120.0-uTime*40.0);
  float a = (core*1.9+flow*glow)*uIntensity;
  vec3 c = uColor*(core*2.1+0.7)+vec3(1.0)*core*core*0.9;
  outColor=vec4(c*a, a);
}`;

  const SPRITE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aInst;   // xyz center, w size
layout(location=2) in vec4 aCol;    // rgb, a
layout(location=3) in vec2 aExtra;  // kind, phase
uniform mat4 uViewProj;
uniform vec3 uRight; uniform vec3 uUp;
out vec2 vUV; out vec4 vCol; out vec2 vExtra; out vec3 vWorld;
void main(){
  float s = aInst.w;
  vec3 p = aInst.xyz + uRight*(aCorner.x*s) + uUp*(aCorner.y*s);
  vUV = aCorner; vCol = aCol; vExtra = aExtra; vWorld = p;
  gl_Position = uViewProj*vec4(p,1.0);
}`;

  const SPRITE_FS = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vCol; in vec2 vExtra; in vec3 vWorld;
uniform float uTime;
out vec4 outColor;
${COMMON}
void main(){
  float r = length(vUV);
  float kind = vExtra.x;
  float a = 0.0; vec3 c = vec3(0.0);
  if(kind<0.5){                      // energy round
    a = smoothstep(1.0,0.0,r);
    a = a*a;
    c = mix(vCol.rgb, vec3(1.0), pow(smoothstep(0.45,0.0,r),2.0));
  } else if(kind<1.5){               // thruster flame
    float n = hash31(floor(vec3(vUV*6.0, vExtra.y*40.0)));
    float core = smoothstep(0.85,0.0,r);
    float flick = 0.72+0.45*n;
    a = core*core*flick;
    c = mix(vCol.rgb, vec3(1.0,0.98,0.92), core*core*0.85);
  } else if(kind<2.5){               // spark / tracer dot
    a = smoothstep(1.0,0.0,r);
    a = pow(a,4.0);
    c = mix(vCol.rgb, vec3(1.0), pow(a,2.0));
  } else if(kind<3.5){               // blast shell
    float ring = smoothstep(0.55,0.95,r)*smoothstep(1.0,0.92,r);
    float inner = smoothstep(0.75,0.0,r)*0.35;
    a = ring*1.5+inner;
    c = mix(vCol.rgb, vec3(1.0), ring*0.8);
  } else {                           // smoke / dust
    float n = fbm(vec3(vUV*3.2, vExtra.y*7.0));
    a = smoothstep(1.0,0.1,r)*(0.35+0.65*n);
    c = vCol.rgb;
  }
  if(a<=0.002) discard;
  outColor=vec4(c*vCol.a*a, a*vCol.a);
}`;

  const SHIELD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uModel; uniform mat4 uViewProj; uniform mat3 uNormalMat;
out vec3 vWorld; out vec3 vNrm; out vec3 vLocal;
void main(){
  vec4 wp = uModel*vec4(aPos,1.0);
  vWorld=wp.xyz; vNrm=normalize(uNormalMat*aNormal); vLocal=aPos;
  gl_Position=uViewProj*wp;
}`;

  const SHIELD_FS = `#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vNrm; in vec3 vLocal;
uniform vec3 uCamPos; uniform vec3 uColor; uniform float uTime; uniform float uAlpha;
uniform float uWave; uniform float uScale;
out vec4 outColor;
${COMMON}
void main(){
  vec3 n = normalize(vNrm);
  vec3 V = normalize(uCamPos-vWorld);
  float fres = pow(1.0-max(dot(n,V),0.0), 2.6);
  vec3 lp = normalize(vLocal);
  float flow = fbm(lp*3.0+vec3(0.0,uTime*0.16,uTime*0.07));
  float weave = 0.5+0.5*sin(lp.y*5.0+lp.x*3.0+uTime*1.3+flow*3.0);
  float ring = smoothstep(0.55,1.0,fract(uWave));
  float band = exp(-pow((fract(uWave)-0.5)*5.0,2.0));
  float a = (fres*0.85+0.10)*(0.35+0.65*weave)*(0.55+0.75*band);
  vec3 c = uColor*(0.8+1.4*fres)+vec3(1.0)*pow(fres,5.0)*0.7;
  outColor=vec4(c*a*uAlpha, a*uAlpha*0.9);
}`;

  const POST_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){ vUV=aPos*0.5+0.5; gl_Position=vec4(aPos,0.0,1.0); }`;

  const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; uniform float uThreshold;
out vec4 o;
void main(){
  vec3 c = texture(uTex,vUV).rgb;
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  float k = max(l-uThreshold,0.0)/max(l,1e-4);
  o = vec4(c*k,1.0);
}`;

  const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir;
out vec4 o;
void main(){
  vec3 s = texture(uTex,vUV).rgb*0.2270270;
  s += (texture(uTex,vUV+uDir*1.3846).rgb+texture(uTex,vUV-uDir*1.3846).rgb)*0.3162162;
  s += (texture(uTex,vUV+uDir*3.2308).rgb+texture(uTex,vUV-uDir*3.2308).rgb)*0.0702702;
  o=vec4(s,1.0);
}`;

  const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene; uniform sampler2D uBloom1; uniform sampler2D uBloom2;
uniform float uBloom; uniform float uExposure; uniform vec2 uRes;
out vec4 o;
vec3 aces(vec3 x){
  const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0);
}
void main(){
  vec3 c = texture(uScene,vUV).rgb;
  c += (texture(uBloom1,vUV).rgb*0.65+texture(uBloom2,vUV).rgb*0.9)*uBloom;
  c *= uExposure;
  c = aces(c);
  c = pow(c, vec3(1.0/2.2));
  vec2 q = vUV-0.5;
  float vig = 1.0-dot(q,q)*0.42;
  c *= vig;
  /* ordered dither: removes banding in the faint space gradients */
  float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453);
  c += (d-0.5)/255.0;
  o = vec4(c,1.0);
}`;

  /* ================================================================== */
  /* helpers                                                            */
  /* ================================================================== */
  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      throw new Error('shader compile failed: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(p));
      throw new Error('link failed: ' + gl.getProgramInfoLog(p));
    }
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
    }
    return { p: p, u: u };
  }

  /* ================================================================== */
  /* Renderer                                                           */
  /* ================================================================== */
  function Renderer(canvas) {
    this.canvas = canvas;
    const opts = { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: true };
    const gl = canvas.getContext('webgl2', opts);
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.float = !!gl.getExtension('EXT_color_buffer_float');
    this.linearFloat = !!gl.getExtension('OES_texture_float_linear');

    this.progSolid = program(gl, SOLID_VS, SOLID_FS);
    this.progSky = program(gl, SKY_VS, SKY_FS);
    this.progBeam = program(gl, BEAM_VS, BEAM_FS);
    this.progSprite = program(gl, SPRITE_VS, SPRITE_FS);
    this.progShield = program(gl, SHIELD_VS, SHIELD_FS);
    this.progBright = program(gl, POST_VS, BRIGHT_FS);
    this.progBlur = program(gl, POST_VS, BLUR_FS);
    this.progComposite = program(gl, POST_VS, COMPOSITE_FS);

    this.renderables = [];
    this.sprites = [];
    this.beams = [];
    this.shields = [];
    this.drawCalls = 0;
    this.tris = 0;

    this._initFullscreen();
    this._initTargets();
    this._initSprites();
    this._initBeam();
    this._initWhite();
    this.quadVAO = this._makeFullscreenVAO();
  }

  Renderer.prototype._initFullscreen = function () {
    const gl = this.gl;
    this.fsVao = gl.createVertexArray();
    gl.bindVertexArray(this.fsVao);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  };
  Renderer.prototype._makeFullscreenVAO = function () { return this.fsVao; };

  Renderer.prototype._initWhite = function () {
    const gl = this.gl;
    this.whiteTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  };

  Renderer.prototype._initSprites = function () {
    const gl = this.gl;
    this.spriteVao = gl.createVertexArray();
    gl.bindVertexArray(this.spriteVao);
    const corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.spriteInst = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteInst);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(4 * 4 * 4096), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 32, 28);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
    this.spriteData = new Float32Array(4 * 4 * 4096);
  };

  Renderer.prototype._initBeam = function () {
    const gl = this.gl;
    // strip: 2 verts per segment
    const N = 48;
    const verts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      verts.push(t, -1, 0, t, 1, 0);
    }
    this.beamVao = gl.createVertexArray();
    gl.bindVertexArray(this.beamVao);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const idx = [];
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    this.beamIndexCount = idx.length;
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  };

  Renderer.prototype._initTargets = function () {
    const gl = this.gl;
    this.sceneFbo = gl.createFramebuffer();
    this.bloomFbo = [];
    this.bloomTex = [];
    this.bloomDepth = [];
  };

  Renderer.prototype.resize = function (w, h) {
    const gl = this.gl;
    this.width = w; this.height = h;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    const mk = (fb, tex, depth) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const useF = this.float;
      gl.texImage2D(gl.TEXTURE_2D, 0, useF ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA,
        useF ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (depth) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    };
    const mkDepth = (w2, h2) => {
      const rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w2, h2);
      return rb;
    };
    if (!this.depthRb) this.depthRb = mkDepth(w, h);
    else {
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    }
    if (this.sceneTex) gl.deleteTexture(this.sceneTex);
    if (this.sceneFbo2) gl.deleteFramebuffer(this.sceneFbo2);
    this.sceneTex = gl.createTexture();
    mk(this.sceneFbo, this.sceneTex, this.depthRb);
    this.sceneFbo2 = gl.createFramebuffer();
    mk(this.sceneFbo2, this.sceneTex, null);

    const levels = 2;
    const bw = Math.max(2, w >> 1), bh = Math.max(2, h >> 1);
    const qw = Math.max(2, w >> 2), qh = Math.max(2, h >> 2);
    const dims = [[bw, bh], [qw, qh]];
    for (let i = 0; i < levels; i++) {
      if (!this.bloomFbo[i]) { this.bloomFbo[i] = gl.createFramebuffer(); this.bloomTex[i] = gl.createTexture(); }
      mk(this.bloomFbo[i], this.bloomTex[i], null);
    }
    // ping/pong for blur
    if (!this.tmpFbo) {
      this.tmpFbo = []; this.tmpTex = [];
      for (let i = 0; i < levels; i++) { this.tmpFbo[i] = gl.createFramebuffer(); this.tmpTex[i] = gl.createTexture(); }
    }
    for (let i = 0; i < levels; i++) mk(this.tmpFbo[i], this.tmpTex[i], null);
    this.bloomDims = dims;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  /* upload a VoxMesh */
  Renderer.prototype.upload = function (mesh) {
    const gl = this.gl;
    const n = mesh.vcount;
    const data = new Float32Array(n * 12);
    for (let i = 0; i < n; i++) {
      const o = i * 12;
      data[o] = mesh.pos[i * 3]; data[o + 1] = mesh.pos[i * 3 + 1]; data[o + 2] = mesh.pos[i * 3 + 2];
      data[o + 3] = mesh.nrm[i * 3]; data[o + 4] = mesh.nrm[i * 3 + 1]; data[o + 5] = mesh.nrm[i * 3 + 2];
      data[o + 6] = mesh.col[i * 3]; data[o + 7] = mesh.col[i * 3 + 1]; data[o + 8] = mesh.col[i * 3 + 2];
      data[o + 9] = mesh.mat[i * 3]; data[o + 10] = mesh.mat[i * 3 + 1]; data[o + 11] = mesh.mat[i * 3 + 2];
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const S = 48;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, S, 36);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mesh.idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const c = mesh.center();
    return {
      vao: vao, count: mesh.idx.length,
      center: c, radius: mesh.radius() || 1,
      min: mesh.min.slice(), max: mesh.max.slice()
    };
  };

  Renderer.prototype.add = function (gpu, matrix, opts) {
    const o = opts || {};
    const r = {
      gpu: gpu, m: matrix || M4.create(),
      nm: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
      visible: true, layer: o.layer || 0,
      fog: o.fog, amb: o.amb, key: o.key, emissive: o.emissive,
      grid: o.grid, tint: o.tint || null,
      center: o.center || gpu.center, radius: o.radius || gpu.radius,
      wc: new Float32Array(3),
      kind: o.kind || 'solid'
    };
    this.renderables.push(r);
    return r;
  };

  Renderer.prototype.updateNormal = function (r) {
    const m = r.m, nm = r.nm;
    nm[0] = m[0]; nm[1] = m[1]; nm[2] = m[2];
    nm[3] = m[4]; nm[4] = m[5]; nm[5] = m[6];
    nm[6] = m[8]; nm[7] = m[9]; nm[8] = m[10];
    /* the bounding centre has to follow the model matrix, otherwise every
       moved hull is culled against the origin instead of its own position */
    const c = r.center, wc = r.wc;
    wc[0] = m[0] * c[0] + m[4] * c[1] + m[8] * c[2] + m[12];
    wc[1] = m[1] * c[0] + m[5] * c[1] + m[9] * c[2] + m[13];
    wc[2] = m[2] * c[0] + m[6] * c[1] + m[10] * c[2] + m[14];
  };

  /* ================================================================== */
  Renderer.prototype.renderFrame = function (scene) {
    const gl = this.gl;
    this.drawCalls = 0; this.tris = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    /* ---- sky ---- */
    {
      const P = this.progSky;
      gl.useProgram(P.p);
      gl.depthMask(false);
      gl.bindVertexArray(this.fsVao);
      gl.uniformMatrix4fv(P.u.uInvViewProj, false, scene.invViewProj);
      gl.uniform3fv(P.u.uKeyDir, scene.keyDir);
      gl.uniform3fv(P.u.uKeyColor, scene.keyColor);
      gl.uniform3fv(P.u.uPlanetDir, scene.planetDir);
      gl.uniform1f(P.u.uTime, scene.time);
      gl.uniform1f(P.u.uNebula, scene.nebula);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthMask(true);
      this.drawCalls++;
    }

    /* ---- opaque solids ---- */
    {
      const P = this.progSolid;
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.u.uViewProj, false, scene.viewProj);
      gl.uniform3fv(P.u.uCamPos, scene.camPos);
      gl.uniform3fv(P.u.uKeyDir, scene.keyDir);
      gl.uniform3fv(P.u.uKeyColor, scene.keyColor);
      gl.uniform3fv(P.u.uAmbTop, scene.ambTop);
      gl.uniform3fv(P.u.uAmbBot, scene.ambBot);
      gl.uniform3fv(P.u.uRimColor, scene.rimColor);
      gl.uniform3fv(P.u.uFogColor, scene.fogColor);
      gl.uniform1f(P.u.uFogDensity, scene.fogDensity);
      gl.uniform1f(P.u.uEmissiveBoost, scene.emissiveBoost);
      for (const r of this.renderables) {
        if (!r.visible || r.kind !== 'solid') continue;
        this.updateNormal(r);
        if (!this._inFrustum(r, scene)) continue;
        gl.uniformMatrix4fv(P.u.uModel, false, r.m);
        gl.uniformMatrix3fv(P.u.uNormalMat, false, r.nm);
        gl.uniform3fv(P.u.uFogColor, r.fog || scene.fogColor);
        gl.uniform1f(P.u.uFogDensity, r.fogDensity !== undefined ? r.fogDensity : scene.fogDensity);
        gl.uniform3fv(P.u.uAmbTop, r.amb ? r.amb[0] : scene.ambTop);
        gl.uniform3fv(P.u.uAmbBot, r.amb ? r.amb[1] : scene.ambBot);
        gl.uniform3fv(P.u.uKeyColor, r.key || scene.keyColor);
        gl.uniform1f(P.u.uEmissiveBoost, r.emissive !== undefined ? r.emissive : scene.emissiveBoost);
        gl.uniform1f(P.u.uGridFade, r.grid !== undefined ? r.grid : 1.0);
        gl.bindVertexArray(r.gpu.vao);
        gl.drawElements(gl.TRIANGLES, r.gpu.count, gl.UNSIGNED_INT, 0);
        this.drawCalls++;
        this.tris += r.gpu.count / 3;
      }
    }

    /* ---- shields (additive, no depth write) ---- */
    if (this.shields.length) {
      const P = this.progShield;
      gl.useProgram(P.p);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      gl.uniformMatrix4fv(P.u.uViewProj, false, scene.viewProj);
      gl.uniform3fv(P.u.uCamPos, scene.camPos);
      gl.uniform1f(P.u.uTime, scene.time);
      for (const s of this.shields) {
        if (s.alpha <= 0.002) continue;
        gl.uniformMatrix4fv(P.u.uModel, false, s.m);
        gl.uniformMatrix3fv(P.u.uNormalMat, false, s.nm);
        gl.uniform3fv(P.u.uColor, s.color);
        gl.uniform1f(P.u.uAlpha, s.alpha);
        gl.uniform1f(P.u.uWave, s.wave);
        gl.uniform1f(P.u.uScale, s.scale || 1);
        gl.bindVertexArray(s.gpu.vao);
        gl.drawElements(gl.TRIANGLES, s.gpu.count, gl.UNSIGNED_INT, 0);
        this.drawCalls++;
      }
      gl.depthMask(true);
    }

    /* ---- beams (additive) ---- */
    if (this.beams.length) {
      const P = this.progBeam;
      gl.useProgram(P.p);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      gl.uniformMatrix4fv(P.u.uViewProj, false, scene.viewProj);
      gl.uniform3fv(P.u.uCamPos, scene.camPos);
      gl.uniform1f(P.u.uTime, scene.time);
      gl.bindVertexArray(this.beamVao);
      for (const b of this.beams) {
        if (b.intensity <= 0.002) continue;
        gl.uniform3fv(P.u.uA, b.a);
        gl.uniform3fv(P.u.uB, b.b);
        gl.uniform3fv(P.u.uColor, b.color);
        gl.uniform1f(P.u.uRadius, b.radius);
        gl.uniform1f(P.u.uIntensity, b.intensity);
        gl.drawElements(gl.TRIANGLES, this.beamIndexCount, gl.UNSIGNED_SHORT, 0);
        this.drawCalls++;
      }
    }

    /* ---- sprites (additive) ---- */
    if (this.sprites.length) {
      const P = this.progSprite;
      gl.useProgram(P.p);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      gl.uniformMatrix4fv(P.u.uViewProj, false, scene.viewProj);
      gl.uniform3fv(P.u.uRight, scene.camRight);
      gl.uniform3fv(P.u.uUp, scene.camUp);
      gl.uniform1f(P.u.uTime, scene.time);
      const data = this.spriteData;
      let n = 0;
      for (const s of this.sprites) {
        if (s.a <= 0.003) continue;
        if (n >= 4096) break;
        const o = n * 16;
        data[o] = s.p[0]; data[o + 1] = s.p[1]; data[o + 2] = s.p[2]; data[o + 3] = s.size;
        data[o + 4] = s.c[0]; data[o + 5] = s.c[1]; data[o + 6] = s.c[2]; data[o + 7] = s.a;
        data[o + 8] = s.kind; data[o + 9] = s.phase || 0;
        n++;
      }
      if (n > 0) {
        gl.bindVertexArray(this.spriteVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteInst);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * 16);
        gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, n);
        this.drawCalls++;
      }
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);

    /* ---- post ---- */
    this._post(scene);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  Renderer.prototype._post = function (scene) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.fsVao);
    // bright pass -> half
    {
      const P = this.progBright;
      gl.useProgram(P.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbo[0]);
      gl.viewport(0, 0, this.bloomDims[0][0], this.bloomDims[0][1]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.uniform1i(P.u.uTex, 0);
      gl.uniform1f(P.u.uThreshold, scene.bloomThreshold);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // downsample half -> quarter (reuse bright shader with threshold 0)
    {
      const P = this.progBright;
      gl.useProgram(P.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbo[1]);
      gl.viewport(0, 0, this.bloomDims[1][0], this.bloomDims[1][1]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[0]);
      gl.uniform1i(P.u.uTex, 0);
      gl.uniform1f(P.u.uThreshold, 0.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // blur each level
    const P = this.progBlur;
    gl.useProgram(P.p);
    gl.uniform1i(P.u.uTex, 0);
    for (let i = 0; i < 2; i++) {
      const [w, h] = this.bloomDims[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.tmpFbo[i]);
      gl.viewport(0, 0, w, h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[i]);
      gl.uniform2f(P.u.uDir, 1.4 / w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbo[i]);
      gl.viewport(0, 0, w, h);
      gl.bindTexture(gl.TEXTURE_2D, this.tmpTex[i]);
      gl.uniform2f(P.u.uDir, 0, 1.4 / h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // composite
    {
      const C = this.progComposite;
      gl.useProgram(C.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[0]);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[1]);
      gl.uniform1i(C.u.uScene, 0);
      gl.uniform1i(C.u.uBloom1, 1);
      gl.uniform1i(C.u.uBloom2, 2);
      gl.uniform1f(C.u.uBloom, scene.bloom);
      gl.uniform1f(C.u.uExposure, scene.exposure);
      gl.uniform2f(C.u.uRes, this.width, this.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  };

  /* frustum culling with 6 planes from viewProj */
  const _planes = new Float32Array(24);
  Renderer.prototype._inFrustum = function (r, scene) {
    const vp = scene.viewProj, c = r.wc, rad = r.radius;
    let nx, ny, nz;
    // row extraction (column-major)
    const m = vp;
    // planes: left, right, bottom, top, near, far
    const set = (i, a, b, c2, d) => {
      const l = Math.hypot(a, b, c2) || 1;
      _planes[i * 4] = a / l; _planes[i * 4 + 1] = b / l; _planes[i * 4 + 2] = c2 / l; _planes[i * 4 + 3] = d / l;
    };
    set(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);
    set(1, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
    set(2, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);
    set(3, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
    set(4, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);
    set(5, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);
    for (let i = 0; i < 6; i++) {
      const d = _planes[i * 4] * c[0] + _planes[i * 4 + 1] * c[1] + _planes[i * 4 + 2] * c[2] + _planes[i * 4 + 3];
      if (d < -rad) return false;
    }
    return true;
  };

  F.Renderer = Renderer;
})(window);
