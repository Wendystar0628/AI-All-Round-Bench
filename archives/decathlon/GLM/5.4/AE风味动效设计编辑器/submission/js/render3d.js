/* ============================================================
   render3d.js — WebGL2 渲染核心：FBO、全屏 pass、特效、三维网格
   ============================================================ */
(function (global) {
  'use strict';

  const R = { gl: null, canvas: null, RS: 1, w: 0, h: 0 };
  let quadVAO = null;
  const progs = {};

  /* ---------------- 基础 ---------------- */
  function compile(vsSrc, fsSrc) {
    const gl = R.gl;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) throw new Error('VS: ' + gl.getShaderInfoLog(vs));
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) throw new Error('FS: ' + gl.getShaderInfoLog(fs));
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(p));
    p._u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); p._u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name); }
    return p;
  }

  const VS_QUAD = `#version 300 es
  layout(location=0) in vec2 aPos;
  out vec2 vUV;
  void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

  const FS_BLIT = `#version 300 es
  precision highp float;
  in vec2 vUV; out vec4 o;
  uniform sampler2D uSrc;
  uniform sampler2D uDst;
  uniform float uOpacity;
  uniform int uBlend;
  uniform vec3 uTint;
  uniform int uUseDst;
  uniform int uPremul;
  void main(){
    vec4 s = texture(uSrc, vUV);
    vec3 sc = s.rgb * uTint;
    float a = s.a * uOpacity;
    vec3 res;
    if(uUseDst == 0){ res = uPremul==1 ? s.rgb : sc; o = vec4(res, uPremul==1 ? s.a*uOpacity : a); return; }
    else {
      vec3 d = texture(uDst, vUV).rgb;
      if(uBlend == 0) res = mix(d, sc, a);
      else if(uBlend == 1) res = d + (uPremul==1 ? sc : sc*a);
      else if(uBlend == 2) res = 1.0 - (1.0-d)*(1.0-sc*a);
      else if(uBlend == 3) res = d*sc*a + d*(1.0-a);
      else if(uBlend == 4) { vec3 o1 = 2.0*d*sc; vec3 o2 = 1.0-2.0*(1.0-d)*(1.0-sc); res = mix(o1,o2,step(0.5,d)); res = mix(d,res,a); }
      else res = mix(d, sc, a);
    }
    o = vec4(res, 1.0);
  }`;

  const FS_BLUR = `#version 300 es
  precision highp float;
  in vec2 vUV; out vec4 o;
  uniform sampler2D uTex; uniform vec2 uDir; uniform vec2 uTexel; uniform float uRadius;
  void main(){
    if(uRadius < 0.2){ o = texture(uTex, vUV); return; }
    float sigma = max(uRadius*0.45, 0.5);
    float sum = 0.0; vec4 acc = vec4(0.0);
    int N = int(min(uRadius*2.5, 40.0));
    for(int i=-40;i<=40;i++){
      if(i < -N || i > N) continue;
      float x = float(i);
      float w = exp(-(x*x)/(2.0*sigma*sigma));
      vec4 s = texture(uTex, vUV + uDir*uTexel*x);
      acc += s*w; sum += w;
    }
    o = acc/sum;
  }`;

  const FS_BRIGHT = `#version 300 es
  precision highp float;
  in vec2 vUV; out vec4 o;
  uniform sampler2D uTex; uniform float uThreshold; uniform float uIntensity;
  void main(){
    vec4 s = texture(uTex, vUV);
    float l = max(max(s.r,s.g),s.b);
    float k = smoothstep(uThreshold, uThreshold+0.35, l);
    o = vec4(s.rgb*k*uIntensity, s.a*k);
  }`;

  const FS_ADD = `#version 300 es
  precision highp float;
  in vec2 vUV; out vec4 o;
  uniform sampler2D uA; uniform sampler2D uB; uniform float uAmount; uniform vec3 uTint;
  void main(){
    vec4 a = texture(uA, vUV); vec4 b = texture(uB, vUV);
    o = vec4(a.rgb + b.rgb*uTint*uAmount, max(a.a, b.a*uAmount));
  }`;

  const FS_SHADOW = `#version 300 es
  precision highp float;
  in vec2 vUV; out vec4 o;
  uniform sampler2D uSrc; uniform sampler2D uShad; uniform vec2 uOff; uniform float uOpacity; uniform vec3 uColor;
  void main(){
    vec4 s = texture(uSrc, vUV);
    vec4 sh = texture(uShad, vUV - uOff);
    vec3 col = uColor * sh.a * uOpacity;
    o = vec4(col, sh.a*uOpacity);
  }`;

  const FS_OVER = `#version 300 es
  precision highp float;
  in vec2 vUV; out vec4 o;
  uniform sampler2D uA; uniform sampler2D uB; uniform float uOpacity;
  void main(){
    vec4 a = texture(uA, vUV); vec4 b = texture(uB, vUV);
    vec3 rgb = mix(a.rgb, b.rgb, b.a*uOpacity) + b.rgb*b.a*uOpacity*0.0;
    float alpha = max(a.a, b.a*uOpacity);
    // 先画阴影再画主体
    vec3 res = a.rgb*a.a + b.rgb*b.a*uOpacity;
    float al = a.a + b.a*uOpacity*(1.0-a.a);
    o = vec4(al>0.001 ? res/al : vec3(0.0), al);
  }`;

  const FS_HSB = `#version 300 es
  precision highp float;
  in vec2 vUV; out vec4 o;
  uniform sampler2D uTex; uniform float uHue; uniform float uSat; uniform float uBri;
  vec3 rgb2hsv(vec3 c){ vec4 K = vec4(0.0,-1.0/3.0,2.0/3.0,-1.0); vec4 p = mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q = mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d = q.x-min(q.w,q.y); float e=1.0e-10; return vec3(abs(q.z+(q.w-q.y)/(6.0*d+e)),d/(q.x+e),q.x); }
  vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0,2.0/3.0,1.0/3.0,3.0); vec3 p = abs(fract(c.xxx+K.xyz)*6.0-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y); }
  void main(){
    vec4 s = texture(uTex, vUV);
    vec3 hsv = rgb2hsv(s.rgb);
    hsv.x = fract(hsv.x + uHue);
    hsv.y = clamp(hsv.y*uSat, 0.0, 1.0);
    hsv.z = clamp(hsv.z*uBri, 0.0, 1.0);
    o = vec4(hsv2rgb(hsv), s.a);
  }`;

  const FS_DOF = `#version 300 es
  precision highp float;
  in vec2 vUV; out vec4 o;
  uniform sampler2D uColor; uniform sampler2D uDepth;
  uniform float uFocus; uniform float uAperture; uniform float uMaxBlur; uniform vec2 uTexel;
  uniform float uNear; uniform float uFar;
  float linDepth(float d){ float z = d*2.0-1.0; return (2.0*uNear*uFar)/(uFar+uNear-z*(uFar-uNear)); }
  void main(){
    vec4 base = texture(uColor, vUV);
    float d = texture(uDepth, vUV).r;
    if(d >= 0.99999){ o = base; return; }
    float dist = linDepth(d);
    float coc = clamp(abs(dist-uFocus)/max(uFocus,1.0)*uAperture*uMaxBlur, 0.0, uMaxBlur);
    if(coc < 0.6){ o = base; return; }
    vec4 acc = vec4(0.0); float wsum = 0.0;
    const int N = 12;
    for(int i=0;i<N;i++){
      float a = float(i)*2.399963;
      float r = sqrt(float(i)/float(N))*coc;
      vec2 off = vec2(cos(a),sin(a))*r*uTexel;
      vec4 s = texture(uColor, vUV+off);
      float sd = texture(uDepth, vUV+off).r;
      float scoc = sd>=0.99999?coc:clamp(abs(linDepth(sd)-uFocus)/max(uFocus,1.0)*uAperture*uMaxBlur,0.0,uMaxBlur);
      float w = 1.0/(1.0+scoc*0.35);
      acc += s*w; wsum += w;
    }
    o = acc/wsum;
  }`;

  const VS_MESH = `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec3 aNorm;
  layout(location=2) in vec2 aUV;
  uniform mat4 uModel, uView, uProj, uLightVP;
  uniform mat3 uNormalMat;
  out vec3 vWPos; out vec3 vNorm; out vec2 vUV; out vec4 vLightPos;
  void main(){
    vec4 wp = uModel * vec4(aPos,1.0);
    vWPos = wp.xyz;
    vNorm = normalize(uNormalMat * aNorm);
    vUV = aUV;
    vLightPos = uLightVP * wp;
    gl_Position = uProj * uView * wp;
  }`;

  const FS_MESH = `#version 300 es
  precision highp float;
  in vec3 vWPos; in vec3 vNorm; in vec2 vUV; in vec4 vLightPos;
  out vec4 o;
  uniform vec3 uCamPos;
  uniform vec3 uBaseColor; uniform float uMetallic; uniform float uRough; uniform float uOpacity;
  uniform vec3 uEmissive; uniform float uEmissiveInt;
  uniform float uEnvInt;
  uniform vec3 uLightDir; uniform vec3 uLightColor; uniform float uLightInt;
  uniform vec3 uPointPos; uniform vec3 uPointColor; uniform float uPointInt;
  uniform sampler2D uShadow; uniform float uShadowOn; uniform float uShadowSoft;
  uniform samplerCube uEnv;
  uniform float uAmbient;
  uniform float uUseUV;
  uniform float uScale;
  const float PI = 3.14159265;
  float D_GGX(float NdotH, float a){ float a2=a*a; float d=NdotH*NdotH*(a2-1.0)+1.0; return a2/(PI*d*d+1e-6); }
  float G_Smith(float NdotV, float NdotL, float r){ float k=(r+1.0); k=k*k/8.0; float g1=NdotV/(NdotV*(1.0-k)+k); float g2=NdotL/(NdotL*(1.0-k)+k); return g1*g2; }
  vec3 F0(float m, vec3 base){ return mix(vec3(0.04), base, m); }
  float shadowCalc(vec3 n, vec3 l){
    if(uShadowOn < 0.5) return 1.0;
    vec3 p = vLightPos.xyz / vLightPos.w * 0.5 + 0.5;
    if(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0||p.z>1.0) return 1.0;
    float bias = max(0.0018*(1.0-dot(n,l)), 0.0006);
    float s = 0.0;
    vec2 ts = vec2(1.0/2048.0);
    float r = uShadowSoft;
    for(int x=-2;x<=2;x++) for(int y=-2;y<=2;y++){
      float d = texture(uShadow, p.xy + vec2(float(x),float(y))*ts*r).r;
      s += (p.z-bias > d) ? 0.0 : 1.0;
    }
    return s/25.0;
  }
  void main(){
    vec3 N = normalize(vNorm);
    vec3 V = normalize(uCamPos - vWPos);
    if(dot(N,V) < 0.0) N = -N;
    vec3 base = uBaseColor;
    vec3 F0v = F0(uMetallic, base);
    float a = max(uRough*uRough, 0.02);
    vec3 col = vec3(0.0);
    // 方向光
    vec3 L1 = normalize(-uLightDir);
    float ndl1 = max(dot(N,L1), 0.0);
    float sh = shadowCalc(N, L1);
    vec3 H1 = normalize(L1+V);
    float ndh1 = max(dot(N,H1),0.0);
    float ndv = max(dot(N,V),1e-4);
    float D1 = D_GGX(ndh1,a); float G1 = G_Smith(ndv,ndl1,uRough);
    vec3 F1 = F0v + (1.0-F0v)*pow(1.0-max(dot(H1,V),0.0),5.0);
    vec3 spec1 = D1*G1*F1/(4.0*ndv*ndl1+1e-4);
    vec3 kd1 = (1.0-F1)*(1.0-uMetallic);
    col += (kd1*base/PI + spec1) * uLightColor * uLightInt * ndl1 * sh;
    // 点光
    vec3 Lv = uPointPos - vWPos; float dist = length(Lv); vec3 L2 = Lv/max(dist,1e-3);
    float att = 1.0/(1.0+0.00002*dist*dist);
    float ndl2 = max(dot(N,L2),0.0);
    vec3 H2 = normalize(L2+V);
    float ndh2 = max(dot(N,H2),0.0);
    float D2 = D_GGX(ndh2,a); float G2 = G_Smith(ndv,ndl2,uRough);
    vec3 F2 = F0v + (1.0-F0v)*pow(1.0-max(dot(H2,V),0.0),5.0);
    vec3 spec2 = D2*G2*F2/(4.0*ndv*ndl2+1e-4);
    vec3 kd2 = (1.0-F2)*(1.0-uMetallic);
    col += (kd2*base/PI + spec2) * uPointColor * uPointInt * ndl2 * att;
    // 环境
    vec3 Rv = reflect(-V,N);
    vec3 env = texture(uEnv, Rv).rgb;
    vec3 irr = texture(uEnv, N).rgb;
    col += env * (F0v*0.75 + base*0.35) * uEnvInt * uAmbient;
    col += irr * base * (1.0-uMetallic) * 0.35 * uEnvInt * uAmbient;
    col += uEmissive * uEmissiveInt;
    float alpha = uOpacity;
    o = vec4(col*alpha*uScale, alpha*uScale);
  }`;

  const VS_DEPTH = `#version 300 es
  layout(location=0) in vec3 aPos;
  uniform mat4 uModel, uLightVP;
  void main(){ gl_Position = uLightVP * (uModel * vec4(aPos,1.0)); }`;

  const FS_DEPTH = `#version 300 es
  precision highp float; out vec4 o;
  void main(){ o = vec4(1.0); }`;

  const VS_PARTICLE = `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec4 aColor;
  layout(location=2) in float aSize;
  layout(location=3) in vec3 aVel;
  uniform mat4 uVP; uniform float uPointScale; uniform vec3 uCamRight; uniform vec3 uCamUp; uniform float uScale;
  out vec4 vColor; out vec2 vLocal;
  void main(){
    vec4 p = uVP * vec4(aPos,1.0);
    gl_Position = p;
    float w = p.w;
    vec3 vel = aVel;
    float sp = length(vel);
    vec3 dir = sp>1e-4 ? vel/sp : vec3(0.0,1.0,0.0);
    vec3 right = normalize(cross(dir, uCamRight+vec3(1e-4)));
    vec3 up = cross(right, dir);
    vLocal = vec2(aColor.a>1.5?1.0:0.0, 0.0);
    vColor = vec4(aColor.rgb, min(aColor.a,1.0)*uScale);
    gl_PointSize = max(1.0, aSize * uPointScale / max(w,1.0));
  }`;

  const FS_PARTICLE = `#version 300 es
  precision highp float;
  in vec4 vColor; out vec4 o;
  void main(){
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d)*2.0;
    float a = smoothstep(1.0, 0.0, r);
    a = pow(a, 1.5);
    o = vec4(vColor.rgb * a * vColor.a, a*vColor.a);
  }`;

  const VS_TRAIL = `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec4 aColor;
  uniform mat4 uVP; uniform float uScale;
  out vec4 vColor;
  void main(){ gl_Position = uVP * vec4(aPos,1.0); vColor = vec4(aColor.rgb*uScale, aColor.a*uScale); }`;
  const FS_TRAIL = `#version 300 es
  precision highp float; in vec4 vColor; out vec4 o;
  void main(){ o = vColor; }`;

  const FS_BG = `#version 300 es
  precision highp float;
  in vec2 vUV; out vec4 o;
  uniform vec3 uColA; uniform vec3 uColB; uniform float uTime; uniform float uAspect; uniform float uVignette;
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y); }
  void main(){
    vec2 p = vUV - 0.5; p.x *= uAspect;
    float r = length(p);
    vec3 c = mix(uColA, uColB, smoothstep(0.1, 0.85, r));
    float n = noise(vUV*vec2(3.0,2.0))*0.5 + noise(vUV*7.0)*0.25;
    c += (n-0.35)*0.035;
    c *= 1.0 - uVignette*smoothstep(0.35,0.95,r);
    o = vec4(c,1.0);
  }`;

  /* ---------------- 初始化 ---------------- */
  function init(canvas) {
    R.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'
    });
    if (!gl) throw new Error('无法创建 WebGL2 上下文');
    R.gl = gl;
    // 全屏四边形
    quadVAO = gl.createVertexArray();
    gl.bindVertexArray(quadVAO);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    progs.blit = compile(VS_QUAD, FS_BLIT);
    progs.blur = compile(VS_QUAD, FS_BLUR);
    progs.bright = compile(VS_QUAD, FS_BRIGHT);
    progs.add = compile(VS_QUAD, FS_ADD);
    progs.shadow = compile(VS_QUAD, FS_SHADOW);
    progs.over = compile(VS_QUAD, FS_OVER);
    progs.hsb = compile(VS_QUAD, FS_HSB);
    progs.dof = compile(VS_QUAD, FS_DOF);
    progs.mesh = compile(VS_MESH, FS_MESH);
    progs.depth = compile(VS_DEPTH, FS_DEPTH);
    progs.particle = compile(VS_PARTICLE, FS_PARTICLE);
    progs.trail = compile(VS_TRAIL, FS_TRAIL);
    progs.bg = compile(VS_QUAD, FS_BG);
    progs.blitRect = compile(`#version 300 es
      layout(location=0) in vec2 aPos;
      out vec2 vUV;
      uniform vec4 uRect; uniform vec2 uTarget;
      void main(){
        vUV = aPos*0.5+0.5;
        vec2 p = vec2(uRect.x + vUV.x*uRect.z, uRect.y + (1.0-vUV.y)*uRect.w);
        gl_Position = vec4(p.x/uTarget.x*2.0-1.0, 1.0-p.y/uTarget.y*2.0, 0.0, 1.0);
      }`, FS_BLIT);
    R.envTex = makeEnvMap();
    gl.bindVertexArray(null);
    return R;
  }

  function makeEnvMap() {
    const gl = R.gl;
    const S = 48;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
    const faces = [];
    for (let f = 0; f < 6; f++) {
      const data = new Uint8Array(S * S * 4);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = (x + 0.5) / S * 2 - 1, v = (y + 0.5) / S * 2 - 1;
        let d;
        if (f === 0) d = [1, -v, -u]; else if (f === 1) d = [-1, -v, u];
        else if (f === 2) d = [u, 1, v]; else if (f === 3) d = [u, -1, -v];
        else if (f === 4) d = [u, -v, 1]; else d = [-u, -v, -1];
        const l = Math.hypot(...d); d = d.map(x => x / l);
        // 基础环境：上亮下暗
        let r = 0.02 + 0.05 * Math.max(0, d[1]), g = 0.02 + 0.05 * Math.max(0, d[1]), b = 0.03 + 0.06 * Math.max(0, d[1]);
        // 三块柔光箱
        const boxes = [
          { d: [0.3, 0.9, 0.2], c: [1.0, 0.95, 0.85], i: 2.2, s: 0.55 },
          { d: [-0.85, 0.25, 0.3], c: [0.35, 0.6, 1.0], i: 1.2, s: 0.4 },
          { d: [0.7, 0.1, -0.8], c: [1.0, 0.45, 0.15], i: 1.4, s: 0.35 }
        ];
        for (const bx of boxes) {
          const dd = d[0] * bx.d[0] + d[1] * bx.d[1] + d[2] * bx.d[2];
          const k = Math.pow(Math.max(0, dd), 1 / (bx.s * bx.s)) * bx.i;
          r += bx.c[0] * k; g += bx.c[1] * k; b += bx.c[2] * k;
        }
        // 地平线暖光
        const hz = Math.exp(-Math.abs(d[1]) * 14) * 0.5;
        r += hz * 0.5; g += hz * 0.25; b += hz * 0.1;
        const i = (y * S + x) * 4;
        data[i] = Math.min(255, r * 255); data[i + 1] = Math.min(255, g * 255); data[i + 2] = Math.min(255, b * 255); data[i + 3] = 255;
      }
      faces.push(data);
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.RGBA, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    return tex;
  }

  /* ---------------- FBO ---------------- */
  function createFBO(w, h, opts = {}) {
    const gl = R.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let depthTex = null;
    if (opts.depth) {
      depthTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, depthTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, depthTex, w, h };
  }
  function resizeFBO(f, w, h, opts) {
    if (f.w === w && f.h === h) return f;
    destroyFBO(f);
    return createFBO(w, h, opts || { depth: !!f.depthTex });
  }
  function destroyFBO(f) {
    const gl = R.gl;
    gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex); if (f.depthTex) gl.deleteTexture(f.depthTex);
  }

  /* ---------------- 纹理 ---------------- */
  const texCache = new Map();
  function texFromCanvas(canvas, key) {
    const gl = R.gl;
    let t = key && texCache.get(key);
    if (!t) { t = gl.createTexture(); if (key) texCache.set(key, t); }
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    return t;
  }

  /* ---------------- 全屏 pass ---------------- */
  function drawQuad(prog) {
    const gl = R.gl;
    gl.useProgram(prog);
    gl.bindVertexArray(quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
  function bindTarget(f) {
    const gl = R.gl;
    if (f) { gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb); gl.viewport(0, 0, f.w, f.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, R.canvas.width, R.canvas.height); }
  }
  function clearTarget(f, r = 0, g = 0, b = 0, a = 1) {
    const gl = R.gl;
    bindTarget(f);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }
  function blit(target, srcTex, opts = {}) {
    const gl = R.gl;
    bindTarget(target);
    const p = progs.blit;
    gl.useProgram(p);
    if (opts.glBlend === 'premul') { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
    else if (opts.glBlend === 'add') { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); }
    else gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex); gl.uniform1i(p._u.uSrc, 0);
    if (opts.dstTex) {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, opts.dstTex); gl.uniform1i(p._u.uDst, 1);
      gl.uniform1i(p._u.uUseDst, 1);
    } else gl.uniform1i(p._u.uUseDst, 0);
    gl.uniform1f(p._u.uOpacity, opts.opacity === undefined ? 1 : opts.opacity);
    gl.uniform1i(p._u.uBlend, BLEND_ID[opts.blend || 'normal'] || 0);
    const t = opts.tint || [1, 1, 1];
    gl.uniform3f(p._u.uTint, t[0], t[1], t[2]);
    gl.uniform1i(p._u.uPremul, (opts.premul || opts.glBlend) ? 1 : 0);
    drawQuad(p);
    gl.disable(gl.BLEND);
  }
  const BLEND_ID = { normal: 0, add: 1, screen: 2, multiply: 3, overlay: 4 };

  function blurPass(srcTex, w, h, radius, tempA, tempB) {
    const gl = R.gl;
    const p = progs.blur;
    // 水平
    tempA = resizeFBO(tempA, w, h);
    bindTarget(tempA);
    gl.useProgram(p);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex); gl.uniform1i(p._u.uTex, 0);
    gl.uniform2f(p._u.uDir, 1, 0); gl.uniform2f(p._u.uTexel, 1 / w, 1 / h); gl.uniform1f(p._u.uRadius, radius);
    drawQuad(p);
    // 垂直
    tempB = resizeFBO(tempB, w, h);
    bindTarget(tempB);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tempA.tex); gl.uniform1i(p._u.uTex, 0);
    gl.uniform2f(p._u.uDir, 0, 1); gl.uniform1f(p._u.uRadius, radius);
    drawQuad(p);
    return tempB;
  }

  /* ---------------- 图层特效 ---------------- */
  // 输入 fbo（图层内容），返回应用特效后的 fbo
  function applyEffects(src, effects, w, h, temp) {
    const gl = R.gl;
    let cur = src;
    for (const fx of effects) {
      if (!fx.enabled) continue;
      const P = (k, d) => fx.params[k] !== undefined ? (fx.params[k].v !== undefined ? fx.params[k].v : fx.params[k]) : d;
      if (fx.type === 'blur') {
        const rad = Math.max(0, P('amount', 10)) * R.RS;
        if (rad < 0.3) continue;
        temp.a = resizeFBO(temp.a || createFBO(1, 1), w, h);
        temp.b = resizeFBO(temp.b || createFBO(1, 1), w, h);
        cur = blurPass(cur.tex, w, h, rad, temp.a, temp.b);
      } else if (fx.type === 'glow') {
        const thresh = P('threshold', 0.5), inten = P('intensity', 1), rad = P('radius', 24) * R.RS;
        temp.a = resizeFBO(temp.a || createFBO(1, 1), w, h);
        temp.b = resizeFBO(temp.b || createFBO(1, 1), w, h);
        // 亮部
        bindTarget(temp.a);
        gl.useProgram(progs.bright);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.tex); gl.uniform1i(progs.bright._u.uTex, 0);
        gl.uniform1f(progs.bright._u.uThreshold, thresh);
        gl.uniform1f(progs.bright._u.uIntensity, 1);
        drawQuad(progs.bright);
        const blurred = blurPass(temp.a.tex, w, h, rad, temp.b, temp.c || (temp.c = createFBO(1, 1)));
        temp.c = blurred;
        // 相加
        temp.d = resizeFBO(temp.d || createFBO(1, 1), w, h);
        bindTarget(temp.d);
        gl.useProgram(progs.add);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.tex); gl.uniform1i(progs.add._u.uA, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, blurred.tex); gl.uniform1i(progs.add._u.uB, 1);
        gl.uniform1f(progs.add._u.uAmount, inten);
        gl.uniform3f(progs.add._u.uTint, 1, 1, 1);
        drawQuad(progs.add);
        cur = temp.d;
      } else if (fx.type === 'shadow') {
        const dist = P('distance', 12) * R.RS, ang = P('angle', 120) * Math.PI / 180;
        const soft = P('softness', 12) * R.RS, op = P('opacity', 0.7);
        const col = U.hex2rgb(P('color', '#000000'));
        temp.a = resizeFBO(temp.a || createFBO(1, 1), w, h);
        // 阴影层：把源 alpha 变成纯色
        bindTarget(temp.a);
        gl.useProgram(progs.shadow);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.tex); gl.uniform1i(progs.shadow._u.uSrc, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, cur.tex); gl.uniform1i(progs.shadow._u.uShad, 1);
        gl.uniform2f(progs.shadow._u.uOff, -Math.cos(ang) * dist / w, Math.sin(ang) * dist / h);
        gl.uniform1f(progs.shadow._u.uOpacity, op);
        gl.uniform3f(progs.shadow._u.uColor, col[0], col[1], col[2]);
        drawQuad(progs.shadow);
        const blurred = blurPass(temp.a.tex, w, h, Math.max(soft, 0.1), temp.b, temp.c || (temp.c = createFBO(1, 1)));
        // 叠加：先阴影后源
        temp.d = resizeFBO(temp.d || createFBO(1, 1), w, h);
        bindTarget(temp.d);
        gl.useProgram(progs.over);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, blurred.tex); gl.uniform1i(progs.over._u.uA, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, cur.tex); gl.uniform1i(progs.over._u.uB, 1);
        gl.uniform1f(progs.over._u.uOpacity, 1);
        drawQuad(progs.over);
        cur = temp.d;
      } else if (fx.type === 'hsb') {
        temp.a = resizeFBO(temp.a || createFBO(1, 1), w, h);
        bindTarget(temp.a);
        gl.useProgram(progs.hsb);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.tex); gl.uniform1i(progs.hsb._u.uTex, 0);
        gl.uniform1f(progs.hsb._u.uHue, (P('hue', 0) || 0) / 360);
        gl.uniform1f(progs.hsb._u.uSat, P('saturation', 1));
        gl.uniform1f(progs.hsb._u.uBri, P('brightness', 1));
        drawQuad(progs.hsb);
        cur = temp.a;
      } else if (fx.type === 'fill') {
        temp.a = resizeFBO(temp.a || createFBO(1, 1), w, h);
        bindTarget(temp.a);
        const p2 = progs.blit;
        gl.useProgram(p2);
        gl.disable(gl.BLEND);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.tex); gl.uniform1i(p2._u.uSrc, 0);
        gl.uniform1i(p2._u.uUseDst, 0);
        gl.uniform1f(p2._u.uOpacity, 1);
        const c = U.hex2rgb(P('color', '#ffffff'));
        gl.uniform3f(p2._u.uTint, c[0], c[1], c[2]);
        drawQuad(p2);
        cur = temp.a;
      }
    }
    return cur;
  }

  /* ---------------- 三维网格 ---------------- */
  function createMesh(verts, norms, uvs, idx) {
    const gl = R.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    let vb2 = null, vb3 = null;
    if (norms) {
      vb2 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb2);
      gl.bufferData(gl.ARRAY_BUFFER, norms, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    }
    if (uvs) {
      vb3 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb3);
      gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
    }
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: idx.length, vb, vb2, vb3, ib };
  }
  function deleteMesh(m) {
    if (!m) return;
    const gl = R.gl;
    gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vb); if (m.vb2) gl.deleteBuffer(m.vb2); if (m.vb3) gl.deleteBuffer(m.vb3); gl.deleteBuffer(m.ib);
  }
  function drawMesh(mesh, model, view, proj, lightVP, normalMat, mat, lights, opts = {}) {
    const gl = R.gl;
    const p = progs.mesh;
    gl.useProgram(p);
    gl.uniformMatrix4fv(p._u.uModel, false, model);
    gl.uniformMatrix4fv(p._u.uView, false, view);
    gl.uniformMatrix4fv(p._u.uProj, false, proj);
    gl.uniformMatrix4fv(p._u.uLightVP, false, lightVP);
    gl.uniformMatrix3fv(p._u.uNormalMat, false, normalMat);
    gl.uniform3fv(p._u.uCamPos, lights.camPos);
    gl.uniform3fv(p._u.uBaseColor, mat.baseColor);
    gl.uniform1f(p._u.uMetallic, mat.metallic);
    gl.uniform1f(p._u.uRough, mat.roughness);
    gl.uniform1f(p._u.uOpacity, mat.opacity);
    gl.uniform3fv(p._u.uEmissive, mat.emissive);
    gl.uniform1f(p._u.uEmissiveInt, mat.emissiveInt);
    gl.uniform1f(p._u.uEnvInt, mat.envInt);
    gl.uniform3fv(p._u.uLightDir, lights.dir);
    gl.uniform3fv(p._u.uLightColor, lights.color);
    gl.uniform1f(p._u.uLightInt, lights.intensity);
    gl.uniform3fv(p._u.uPointPos, lights.pointPos);
    gl.uniform3fv(p._u.uPointColor, lights.pointColor);
    gl.uniform1f(p._u.uPointInt, lights.pointIntensity);
    gl.uniform1f(p._u.uShadowOn, lights.shadowOn ? 1 : 0);
    gl.uniform1f(p._u.uShadowSoft, lights.shadowSoft || 1);
    gl.uniform1f(p._u.uAmbient, lights.ambient);
    gl.uniform1f(p._u.uUseUV, 0);
    gl.uniform1f(p._u.uScale, opts.scale === undefined ? 1 : opts.scale);
    if (lights.shadowTex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, lights.shadowTex); gl.uniform1i(p._u.uShadow, 0); }
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_CUBE_MAP, R.envTex); gl.uniform1i(p._u.uEnv, 1);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  /* ---------------- 三维场景绘制 ---------------- */
  // scene: { meshes:[{mesh, model, mat, transparent}], lights, camera, particles, trails }
  function renderScene(scene, target, opts = {}) {
    const gl = R.gl;
    const w = target.w, h = target.h;
    const cam = scene.camera;
    const aspect = w / h;
    const proj = U.M4.perspective(cam.fov, aspect, cam.near, cam.far);
    const view = cam.matrix;
    // 阴影贴图
    let shadowTex = null, lightVP = U.M4.ident();
    const shadowCaster = scene.lights.find(l => l.castShadow && l.shadowOn !== false);
    if (shadowCaster) {
      if (!R.shadowFBO) R.shadowFBO = createFBO(2048, 2048, { depth: true });
      const sc = scene.shadowCenter || [0, 0, 0];
      const d = shadowCaster.dir;
      const dist = scene.shadowRadius || 900;
      const eye = [sc[0] + d[0] * dist, sc[1] + d[1] * dist, sc[2] + d[2] * dist];
      const lv = U.M4.lookAt(eye, sc, [0, 1, 0]);
      const lp = U.M4.mul(U.M4.translation(0, 0, 0), ortho(-dist, dist, -dist, dist, 0.1, dist * 2.5));
      lightVP = U.M4.mul(lp, lv);
      shadowCaster.lightVP = lightVP;
      // 渲染深度
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.shadowFBO.fb);
      gl.viewport(0, 0, 2048, 2048);
      gl.clearColor(1, 1, 1, 1);
      gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(progs.depth);
      gl.uniformMatrix4fv(progs.depth._u.uLightVP, false, lightVP);
      for (const m of scene.meshes) {
        if (m.noShadow) continue;
        gl.uniformMatrix4fv(progs.depth._u.uModel, false, m.model);
        gl.bindVertexArray(m.mesh.vao);
        gl.drawElements(gl.TRIANGLES, m.mesh.count, gl.UNSIGNED_INT, 0);
      }
      gl.bindVertexArray(null);
      shadowTex = R.shadowFBO.depthTex;
    }
    // 主 pass
    bindTarget(target);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    const sorted = scene.meshes.slice().sort((a, b) => {
      if (a.transparent !== b.transparent) return a.transparent ? 1 : -1;
      return b.depth - a.depth;
    });
    const light = {
      dir: scene.lights[0] ? scene.lights[0].dir : [0.3, -0.8, 0.5],
      color: scene.lights[0] ? scene.lights[0].color : [1, 1, 1],
      intensity: scene.lights[0] ? scene.lights[0].intensity : 1,
      pointPos: scene.pointLight ? scene.pointLight.pos : [0, 0, 0],
      pointColor: scene.pointLight ? scene.pointLight.color : [1, 1, 1],
      pointIntensity: scene.pointLight ? scene.pointLight.intensity : 0,
      shadowOn: !!shadowTex, shadowTex, shadowSoft: shadowCaster ? shadowCaster.softness : 1,
      ambient: scene.ambient === undefined ? 1 : scene.ambient,
      camPos: cam.eye
    };
    for (const m of sorted) {
      const nm = normalMat3(m.model);
      if (m.transparent) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
      else { gl.disable(gl.BLEND); gl.depthMask(true); }
      drawMesh(m.mesh, m.model, view, proj, lightVP, nm, m.mat, light, m.opts);
    }
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    // 粒子
    if (scene.particles && scene.particles.count > 0) {
      gl.useProgram(progs.particle);
      const vp = U.M4.mul(proj, view);
      gl.uniformMatrix4fv(progs.particle._u.uVP, false, vp);
      gl.uniform1f(progs.particle._u.uPointScale, (h / 2) / Math.tan(cam.fov / 2));
      const fwd = [view[2], view[6], view[10]];
      gl.uniform3f(progs.particle._u.uCamRight, view[0], view[4], view[8]);
      gl.uniform3f(progs.particle._u.uCamUp, view[1], view[5], view[9]);
      gl.uniform1f(progs.particle._u.uScale, scene.mbScale === undefined ? 1 : scene.mbScale);
      gl.bindVertexArray(scene.particles.vao);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false);
      gl.drawArrays(gl.POINTS, 0, scene.particles.count);
      gl.depthMask(true);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }
    if (scene.trails && scene.trails.count > 0) {
      gl.useProgram(progs.trail);
      const vp = U.M4.mul(proj, view);
      gl.uniformMatrix4fv(progs.trail._u.uVP, false, vp);
      gl.uniform1f(progs.trail._u.uScale, scene.mbScale === undefined ? 1 : scene.mbScale);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false);
      gl.bindVertexArray(scene.trails.vao);
      gl.drawArrays(gl.TRIANGLES, 0, scene.trails.count);
      gl.depthMask(true);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }
    gl.disable(gl.DEPTH_TEST);
    return target;
  }

  function normalMat3(m) {
    // 上 3x3 的逆转置
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C || 1e-9;
    const inv = 1 / det;
    return new Float32Array([
      A * inv, -(b * i - c * h) * inv, (b * f - c * e) * inv,
      B * inv, (a * i - c * g) * inv, -(a * f - c * d) * inv,
      C * inv, -(a * h - b * g) * inv, (a * e - b * d) * inv
    ]);
  }
  function ortho(l, r, b, t, n, f) {
    const m = U.M4.ident();
    m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
    m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n);
    return m;
  }

  /* ---------------- 粒子几何上传 ---------------- */
  function uploadParticles(arr) {
    const gl = R.gl;
    if (!R._partVAO) {
      R._partVAO = gl.createVertexArray();
      gl.bindVertexArray(R._partVAO);
      R._partVB = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, R._partVB);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 44, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 44, 28);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 44, 32);
      gl.bindVertexArray(null);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, R._partVB);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
    return { vao: R._partVAO, count: arr.length / 11 };
  }
  function uploadTrails(arr) {
    const gl = R.gl;
    if (!R._trailVAO) {
      R._trailVAO = gl.createVertexArray();
      gl.bindVertexArray(R._trailVAO);
      R._trailVB = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, R._trailVB);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
      gl.bindVertexArray(null);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, R._trailVB);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
    return { vao: R._trailVAO, count: arr.length / 7 };
  }

  /* ---------------- 背景与输出 ---------------- */
  function drawBackground(target, comp, time) {
    const gl = R.gl;
    bindTarget(target);
    const p = progs.bg;
    gl.useProgram(p);
    gl.disable(gl.BLEND);
    const a = U.hex2rgb(comp.bgColor || '#0b0c10');
    const b = U.hex2rgb(comp.bgColor2 || '#05060a');
    gl.uniform3f(p._u.uColA, a[0], a[1], a[2]);
    gl.uniform3f(p._u.uColB, b[0], b[1], b[2]);
    gl.uniform1f(p._u.uTime, time);
    gl.uniform1f(p._u.uAspect, target.w / target.h);
    gl.uniform1f(p._u.uVignette, 0.55);
    drawQuad(p);
  }
  function present(tex) {
    const gl = R.gl;
    bindTarget(null);
    gl.disable(gl.BLEND);
    gl.useProgram(progs.blit);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(progs.blit._u.uSrc, 0);
    gl.uniform1i(progs.blit._u.uUseDst, 0);
    gl.uniform1i(progs.blit._u.uPremul, 0);
    gl.uniform1f(progs.blit._u.uOpacity, 1);
    gl.uniform3f(progs.blit._u.uTint, 1, 1, 1);
    drawQuad(progs.blit);
  }

  function uploadTo(f, canvas) {
    const gl = R.gl;
    gl.bindTexture(gl.TEXTURE_2D, f.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  }
  function blitRect(target, srcTex, rect, opts = {}) {
    const gl = R.gl;
    bindTarget(target);
    const p = progs.blitRect;
    gl.useProgram(p);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex); gl.uniform1i(p._u.uSrc, 0);
    if (opts.dstTex) {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, opts.dstTex); gl.uniform1i(p._u.uDst, 1);
      gl.uniform1i(p._u.uUseDst, 1);
    } else gl.uniform1i(p._u.uUseDst, 0);
    gl.uniform1f(p._u.uOpacity, opts.opacity === undefined ? 1 : opts.opacity);
    gl.uniform1i(p._u.uBlend, BLEND_ID[opts.blend || 'normal'] || 0);
    const t = opts.tint || [1, 1, 1];
    gl.uniform3f(p._u.uTint, t[0], t[1], t[2]);
    gl.uniform1i(p._u.uPremul, opts.premul ? 1 : 0);
    gl.uniform4f(p._u.uRect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform2f(p._u.uTarget, target.w, target.h);
    drawQuad(p);
  }
  R.init = init;
  R.createFBO = createFBO;
  R.resizeFBO = resizeFBO;
  R.destroyFBO = destroyFBO;
  R.texFromCanvas = texFromCanvas;
  R.blit = blit;
  R.blurPass = blurPass;
  R.applyEffects = applyEffects;
  R.createMesh = createMesh;
  R.deleteMesh = deleteMesh;
  R.renderScene = renderScene;
  R.uploadParticles = uploadParticles;
  R.uploadTrails = uploadTrails;
  R.drawBackground = drawBackground;
  R.present = present;
  R.bindTarget = bindTarget;
  R.clearTarget = clearTarget;
  R.drawQuad = drawQuad;
  R.progs = progs;
  R.blitRect = blitRect;
  R.uploadTo = uploadTo;
  R.BLEND_ID = BLEND_ID;
  global.R = R;
})(window);
