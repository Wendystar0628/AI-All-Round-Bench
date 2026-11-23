/* ============================================================
   render.js — WebGL2 渲染器
   · 2D 形状（填充/描边，三角化）  · 3D 实体（PBR 近似 + 阴影 + 环境反射）
   · 粒子与拖尾  · 蒙版  · 效果  · 5 种混合模式  · 运动模糊  · 景深
   ============================================================ */
(function (global) {
  const AE = global.AE = global.AE || {};
  const U = AE.util;
  const R = AE.render = {};

  let gl = null, canvas = null;
  const P = {};   // programs
  const RT = {}; // render targets
  let shadowSize = 1024;
  let floatOK = false;
  let curW = 1920, curH = 1080;

  /* ---------------- 着色器 ---------------- */
  const VS_SHAPE = `#version 300 es
in vec2 aPos; in vec4 aColor; in float aReveal;
uniform mat3 uM; uniform float uReveal;
out vec4 vColor; out float vReveal;
void main(){ vec3 p = uM * vec3(aPos, 1.0); gl_Position = vec4(p.xy, 0.0, 1.0); vColor = aColor; vReveal = aReveal; }`;

  const FS_SHAPE = `#version 300 es
precision highp float;
in vec4 vColor; in float vReveal; out vec4 fragColor;
uniform float uReveal;
void main(){
  if(uReveal < 1.5){
    float e = uReveal - vReveal;
    if(e < 0.0) discard;
    float soft = clamp(e * 14.0, 0.0, 1.0);
    float a = vColor.a * soft;
    fragColor = vec4(vColor.rgb * a, a);
    return;
  }
  fragColor = vec4(vColor.rgb * vColor.a, vColor.a);
}`;

  const VS_MESH = `#version 300 es
in vec3 aPos; in vec3 aNormal; in vec2 aUV; in float aReveal;
uniform mat4 uVP; uniform mat4 uModel;
out vec3 vN; out vec3 vW; out vec4 vShadow; out vec2 vUV; out float vReveal;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  vW = wp.xyz;
  vN = mat3(uModel) * aNormal;
  vUV = aUV;
  vReveal = aReveal;
  vShadow = vec4(0.0);
  gl_Position = uVP * wp;
}`;

  const FS_MESH = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec2 vUV; in float vReveal;
out vec4 fragColor;
uniform vec3 uCamPos;
uniform vec4 uBase;        // rgb + alpha
uniform float uMetallic; uniform float uRoughness;
uniform vec3 uEmissive; uniform float uEmissiveI;
uniform vec3 uLightDir; uniform vec3 uLightColor; uniform float uLightI;
uniform vec4 uPointPos; uniform vec3 uPointColor; uniform float uPointI;
uniform vec3 uEnvTop; uniform vec3 uEnvBottom; uniform float uEnvI;
uniform sampler2D uShadowMap; uniform mat4 uShadowMat; uniform float uShadowOn;
uniform float uWire; uniform float uReveal;

float unpackDepth(vec4 v){ return dot(v, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0)); }
vec3 envSample(vec3 d){
  float t = clamp(d.y*0.5+0.5, 0.0, 1.0);
  vec3 c = mix(uEnvBottom, uEnvTop, t);
  float sun = pow(max(dot(d, -normalize(uLightDir)), 0.0), 24.0);
  return c + uLightColor * sun * 0.9;
}
void main(){
  if(uReveal < 1.5){
    if(uReveal - vReveal < 0.0) discard;
  }
  vec3 N = normalize(vN);
  vec3 V = normalize(uCamPos - vW);
  if(!gl_FrontFacing) N = -N;
  vec3 base = uBase.rgb;
  float rough = clamp(uRoughness, 0.03, 1.0);
  vec3 F0 = mix(vec3(0.04), base, uMetallic);
  vec3 diffCol = base * (1.0 - uMetallic);
  vec3 col = vec3(0.0);

  // 平行光
  {
    vec3 L = normalize(-uLightDir);
    float ndl = max(dot(N, L), 0.0);
    float shadow = 1.0;
    if(uShadowOn > 0.5){
      vec4 sp = uShadowMat * vec4(vW, 1.0);
      vec3 sc = sp.xyz / sp.w * 0.5 + 0.5;
      if(sc.x>=0.0 && sc.x<=1.0 && sc.y>=0.0 && sc.y<=1.0 && sc.z<=1.0){
        float d = unpackDepth(texture(uShadowMap, sc.xy));
        shadow = (sc.z - 0.0016 < d) ? 1.0 : 0.32;
        // 3x3 PCF
        float acc = shadow; float cnt = 1.0;
        vec2 tx = vec2(1.0/1024.0);
        for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++){
          float dd = unpackDepth(texture(uShadowMap, sc.xy + vec2(float(i),float(j))*tx));
          acc += (sc.z - 0.0016 < dd) ? 1.0 : 0.32; cnt += 1.0;
        }
        shadow = acc / cnt;
      }
    }
    vec3 H = normalize(L + V);
    float ndh = max(dot(N,H), 0.0);
    float a = rough*rough;
    float d = a*a / (3.14159*pow(ndh*ndh*(a*a-1.0)+1.0, 2.0)+1e-5);
    float fres = pow(1.0 - max(dot(H,V),0.0), 5.0);
    vec3 spec = F0 * d * fres * ndl;
    col += (diffCol/3.14159 + spec) * uLightColor * uLightI * ndl * shadow;
  }
  // 点光源
  if(uPointI > 0.001){
    vec3 L = uPointPos.xyz - vW;
    float dist = length(L); L /= max(dist, 1e-4);
    float atten = 1.0 / (1.0 + dist*dist/900000.0);
    float ndl = max(dot(N,L), 0.0);
    vec3 H = normalize(L+V);
    float ndh = max(dot(N,H),0.0);
    float a = rough*rough;
    float d = a*a/(3.14159*pow(ndh*ndh*(a*a-1.0)+1.0,2.0)+1e-5);
    float fres = pow(1.0-max(dot(H,V),0.0),5.0);
    col += (diffCol/3.14159 + F0*d*fres) * uPointColor * uPointI * ndl * atten;
  }
  // 环境反射
  {
    vec3 R = reflect(-V, N);
    vec3 env = envSample(R);
    float fres = pow(1.0 - max(dot(N,V),0.0), 5.0);
    vec3 F = F0 + (max(vec3(1.0-rough), F0) - F0) * fres;
    col += env * F * uEnvI * (1.0 - rough*0.7);
    col += diffCol * env * 0.18 * uEnvI;
  }
  col += uEmissive * uEmissiveI;
  if(uWire > 0.5){ fragColor = vec4(0.225,0.425,0.5,0.5); return; }
  fragColor = vec4(col * uBase.a, uBase.a);
}`;

  const VS_SHADOW = `#version 300 es
in vec3 aPos;
uniform mat4 uVP; uniform mat4 uModel;
void main(){ gl_Position = uVP * uModel * vec4(aPos,1.0); }`;

  const FS_SHADOW = `#version 300 es
precision highp float;
out vec4 fragColor;
void main(){ fragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }`;

  const VS_SPRITE = `#version 300 es
in vec3 aPos; in vec4 aColor; in float aSize;
uniform mat4 uVP; uniform float uScale;
out vec4 vColor;
void main(){
  vec4 cp = uVP * vec4(aPos,1.0);
  gl_Position = cp;
  gl_PointSize = max(1.0, aSize * uScale / max(cp.w, 1.0));
  vColor = aColor;
}`;

  const FS_SPRITE = `#version 300 es
precision highp float;
in vec4 vColor; out vec4 fragColor;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if(r > 0.5) discard;
  float a = vColor.a * smoothstep(0.5, 0.12, r);
  fragColor = vec4(vColor.rgb * a, a);
}`;

  const VS_TRAIL = `#version 300 es
in vec3 aPos; in vec4 aColor;
uniform mat4 uVP;
out vec4 vColor;
void main(){ gl_Position = uVP * vec4(aPos,1.0); vColor = aColor; }`;

  const FS_TRAIL = `#version 300 es
precision highp float;
in vec4 vColor; out vec4 fragColor;
void main(){ fragColor = vec4(vColor.rgb*vColor.a, vColor.a); }`;

  const VS_QUAD = `#version 300 es
in vec2 aPos; out vec2 vUV;
void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

  const FS_BLIT = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTex; uniform float uAlpha;
void main(){ vec4 c = texture(uTex, vUV); fragColor = vec4(c.rgb*uAlpha, c.a*uAlpha); }`;

  const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uSrc; uniform sampler2D uBack;
uniform int uMode; uniform float uOpacity;
vec3 screen3(vec3 b, vec3 s){ return 1.0-(1.0-b)*(1.0-s); }
vec3 overlay3(vec3 b, vec3 s){
  return mix(2.0*b*s, 1.0-2.0*(1.0-b)*(1.0-s), step(vec3(0.5), b));
}
void main(){
  // 全部纹理为预乘 alpha（rgb 已乘 a）
  vec4 s = texture(uSrc, vUV);
  vec4 b = texture(uBack, vUV);
  s.a *= uOpacity;
  vec3 bc = b.a > 0.0001 ? b.rgb / b.a : vec3(0.0);
  vec3 sc = s.a > 0.0001 ? s.rgb / s.a : vec3(0.0);
  vec3 rgb; float a;
  if(uMode == 1){ // 相加
    rgb = s.rgb + b.rgb;
    a = min(1.0, s.a + b.a);
  } else if(uMode == 2){ // 滤色
    vec3 c = screen3(bc, sc);
    rgb = c * s.a + b.rgb * (1.0 - s.a);
    a = s.a + b.a * (1.0 - s.a);
  } else if(uMode == 3){ // 正片叠底
    vec3 c = bc * sc;
    rgb = c * s.a + b.rgb * (1.0 - s.a);
    a = s.a + b.a * (1.0 - s.a);
  } else if(uMode == 4){ // 叠加
    vec3 c = overlay3(bc, sc);
    rgb = c * s.a + b.rgb * (1.0 - s.a);
    a = s.a + b.a * (1.0 - s.a);
  } else { // 正常
    rgb = s.rgb + b.rgb * (1.0 - s.a);
    a = s.a + b.a * (1.0 - s.a);
  }
  fragColor = vec4(rgb, a);
}`;

  const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  vec4 c = texture(uTex, vUV) * 0.227027;
  c += (texture(uTex, vUV + uDir*1.3846) + texture(uTex, vUV - uDir*1.3846)) * 0.316216;
  c += (texture(uTex, vUV + uDir*3.2307) + texture(uTex, vUV - uDir*3.2307)) * 0.070270;
  fragColor = c;
}`;

  const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTex; uniform float uThreshold;
void main(){
  vec4 c = texture(uTex, vUV);
  vec3 sc = c.a > 0.0001 ? c.rgb / c.a : vec3(0.0);
  float l = dot(sc, vec3(0.2126,0.7152,0.0722));
  float k = max(0.0, l - uThreshold) / max(l, 0.0001);
  fragColor = vec4(sc * k * c.a, c.a);
}`;

  const FS_HSL = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTex; uniform float uHue; uniform float uSat; uniform float uLight;
vec3 rgb2hsl(vec3 c){
  float mx = max(c.r,max(c.g,c.b)), mn = min(c.r,min(c.g,c.b));
  float h=0.0,s=0.0,l=(mx+mn)*0.5;
  if(mx!=mn){
    float d = mx-mn;
    s = l>0.5 ? d/(2.0-mx-mn) : d/(mx+mn);
    if(mx==c.r) h=(c.g-c.b)/d+(c.g<c.b?6.0:0.0);
    else if(mx==c.g) h=(c.b-c.r)/d+2.0;
    else h=(c.r-c.g)/d+4.0;
    h/=6.0;
  }
  return vec3(h,s,l);
}
float hue2rgb(float p, float q, float t){
  t = fract(t);
  if(t < 1.0/6.0) return p + (q-p)*6.0*t;
  if(t < 0.5) return q;
  if(t < 2.0/3.0) return p + (q-p)*(2.0/3.0-t)*6.0;
  return p;
}
vec3 hsl2rgb(vec3 hsl){
  float h=hsl.x,s=hsl.y,l=hsl.z;
  if(s==0.0) return vec3(l);
  float q = l<0.5 ? l*(1.0+s) : l+s-l*s;
  float p = 2.0*l-q;
  return vec3(hue2rgb(p,q,h+1.0/3.0), hue2rgb(p,q,h), hue2rgb(p,q,h-1.0/3.0));
}
void main(){
  vec4 c = texture(uTex, vUV);
  vec3 sc = c.a > 0.0001 ? c.rgb / c.a : vec3(0.0);
  vec3 hsl = rgb2hsl(sc);
  hsl.x = fract(hsl.x + uHue/360.0);
  hsl.y = clamp(hsl.y + uSat/100.0, 0.0, 1.0);
  hsl.z = clamp(hsl.z + uLight/100.0, 0.0, 1.0);
  fragColor = vec4(hsl2rgb(hsl) * c.a, c.a);
}`;

  const FS_ACCUM = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTex;
void main(){ fragColor = texture(uTex, vUV); }`;

  const FS_UNPRE = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTex; uniform float uCount;
void main(){
  vec4 c = texture(uTex, vUV);
  float n = max(uCount, 1.0);
  fragColor = vec4(c.rgb / n, clamp(c.a / n, 0.0, 1.0));
}`;

  const FS_DOF = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTex; uniform sampler2D uDepth;
uniform float uFocus; uniform float uAperture; uniform float uMaxCoc; uniform vec2 uTexel;
void main(){
  float d = texture(uDepth, vUV).r;
  float coc = clamp(abs(d - uFocus) / max(uFocus,1.0) * uAperture * 6.0, 0.0, 1.0);
  vec4 c = texture(uTex, vUV);
  if(coc > 0.02){
    vec3 acc = c.rgb; float w = 1.0;
    for(int i=0;i<12;i++){
      float a = float(i)*2.399963;
      float r = sqrt(float(i)/12.0) * coc * uMaxCoc;
      vec2 off = vec2(cos(a), sin(a)) * r * uTexel;
      vec4 s = texture(uTex, vUV + off);
      float sd = texture(uDepth, vUV + off).r;
      float sw = (abs(sd-uFocus) < abs(d-uFocus)) ? 1.0 : 0.25;
      acc += s.rgb * sw; w += sw;
    }
    c = vec4(acc/w, c.a);
  }
  fragColor = c;
}`;

  /* 蒙版：把图层按蒙版覆盖率裁切 */
  const FS_MASKAPPLY = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTex; uniform sampler2D uMask;
void main(){
  vec4 c = texture(uTex, vUV);
  float m = clamp(texture(uMask, vUV).a, 0.0, 1.0);
  fragColor = vec4(c.rgb * m, c.a * m);
}`;

  /* 蒙版覆盖率合成：add / subtract / intersect / difference */
  const FS_MASKCOMB = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uCov; uniform sampler2D uMask; uniform int uMode;
void main(){
  float c = clamp(texture(uCov, vUV).a, 0.0, 1.0);
  float m = clamp(texture(uMask, vUV).a, 0.0, 1.0);
  float r;
  if(uMode == 1) r = c * (1.0 - m);
  else if(uMode == 2) r = c * m;
  else if(uMode == 3) r = abs(c - m);
  else r = c + m * (1.0 - c);
  fragColor = vec4(r, r, r, r);
}`;

  /* 投影：取 alpha → 偏移 → 着色 */
  const FS_SHADOWFX = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTex; uniform vec2 uOffset; uniform vec4 uColor;
void main(){
  float a = texture(uTex, vUV + uOffset).a * uColor.a;
  fragColor = vec4(uColor.rgb * a, a);
}`;

  /* 提取 alpha 通道 */
  const FS_ALPHA = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTex;
void main(){ float a = texture(uTex, vUV).a; fragColor = vec4(a, a, a, a); }`;

  /* ---------------- 工具 ---------------- */
  function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      console.error('shader error', log, src.slice(0, 400));
      throw new Error('着色器编译失败: ' + log);
    }
    return s;
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compileShader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('着色器链接失败: ' + gl.getProgramInfoLog(p));
    p.u = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (t[k] = gl.getUniformLocation(p, k))) });
    return p;
  }
  function buffer(target, data, usage) {
    const b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, usage || gl.STATIC_DRAW);
    return b;
  }

  function makeTarget(w, h, opts) {
    opts = opts || {};
    const t = { w: 0, h: 0, tex: null, fbo: null, depth: null, depthTex: null, opts };
    t.resize = function (nw, nh) {
      nw = Math.max(1, Math.round(nw)); nh = Math.max(1, Math.round(nh));
      if (nw === t.w && nh === t.h && t.tex) return t;
      if (t.tex) gl.deleteTexture(t.tex);
      if (t.fbo) gl.deleteFramebuffer(t.fbo);
      if (t.depthTex) gl.deleteTexture(t.depthTex);
      t.w = nw; t.h = nh;
      t.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      const internal = (floatOK && opts.float) ? gl.RGBA16F : gl.RGBA8;
      const type = (floatOK && opts.float) ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, nw, nh, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      t.fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
      if (opts.depth) {
        t.depthTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t.depthTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, nw, nh, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t.depthTex, 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return t;
    };
    return t;
  }

  /* ---------------- 初始化 ---------------- */
  R.init = function (cv) {
    canvas = cv;
    gl = cv.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true, depth: true });
    if (!gl) throw new Error('此浏览器不支持 WebGL 2');
    floatOK = !!gl.getExtension('EXT_color_buffer_float');
    P.shape = program(VS_SHAPE, FS_SHAPE);
    P.mesh = program(VS_MESH, FS_MESH);
    P.shadow = program(VS_SHADOW, FS_SHADOW);
    P.sprite = program(VS_SPRITE, FS_SPRITE);
    P.trail = program(VS_TRAIL, FS_TRAIL);
    P.blit = program(VS_QUAD, FS_BLIT);
    P.composite = program(VS_QUAD, FS_COMPOSITE);
    P.blur = program(VS_QUAD, FS_BLUR);
    P.bright = program(VS_QUAD, FS_BRIGHT);
    P.hsl = program(VS_QUAD, FS_HSL);
    P.accum = program(VS_QUAD, FS_ACCUM);
    P.unpre = program(VS_QUAD, FS_UNPRE);
    P.dof = program(VS_QUAD, FS_DOF);
    P.maskApply = program(VS_QUAD, FS_MASKAPPLY);
    P.maskComb = program(VS_QUAD, FS_MASKCOMB);
    P.shadowFx = program(VS_QUAD, FS_SHADOWFX);
    P.alpha = program(VS_QUAD, FS_ALPHA);

    RT.layer = makeTarget(1920, 1080, {});
    RT.scene = makeTarget(1920, 1080, { float: true });
    RT.scene2 = makeTarget(1920, 1080, { float: true });
    RT.accum = makeTarget(1920, 1080, { float: true });
    RT.tmp = makeTarget(1920, 1080, { float: true });
    RT.tmp2 = makeTarget(1920, 1080, { float: true });
    RT.scene3d = makeTarget(1920, 1080, { float: true, depth: true });
    RT.shadow = makeTarget(shadowSize, shadowSize, {});
    RT.precomp = makeTarget(1920, 1080, { float: true });
    // 效果链专用暂存（与合成缓冲分离，避免自采样）
    RT.fxA = makeTarget(1920, 1080, { float: true });
    RT.fxB = makeTarget(1920, 1080, { float: true });
    RT.fxC = makeTarget(1920, 1080, { float: true });
    // 蒙版：覆盖率累积 / 单个蒙版形状 / 裁切结果
    RT.maskCov = makeTarget(1920, 1080, {});
    RT.maskCov2 = makeTarget(1920, 1080, {});
    RT.maskShape = makeTarget(1920, 1080, {});
    RT.maskLayer = makeTarget(1920, 1080, {});

    // 顶点缓冲
    R.buf = {
      shape: gl.createBuffer(),
      index: gl.createBuffer(),
      mesh: gl.createBuffer(),
      meshIdx: gl.createBuffer(),
      sprite: gl.createBuffer(),
      trail: gl.createBuffer(),
      quad: gl.createBuffer()
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, R.buf.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    return gl;
  };

  R.setSize = function (w, h) {
    curW = w; curH = h;
    for (const k of ['layer', 'scene', 'scene2', 'accum', 'tmp', 'tmp2', 'scene3d', 'fxA', 'fxB', 'fxC', 'maskCov', 'maskCov2', 'maskShape', 'maskLayer']) RT[k].resize(w, h);
    RT.precomp.resize(w, h);
  };

  R.gl = () => gl;
  R.targets = RT;
  R.programs = P;
  R.makePoolTarget = function (w, h) {
    const t = makeTarget(w || 1920, h || 1080, { float: true });
    t.resize(w || 1920, h || 1080);
    return t;
  };

  /* ---------------- 绘制辅助 ---------------- */
  function bindQuad() {
    gl.bindBuffer(gl.ARRAY_BUFFER, R.buf.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }
  function drawQuad(prog, setup) {
    gl.useProgram(prog);
    bindQuad();
    if (setup) setup(prog);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function bindTarget(t, clear) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
    if (t) gl.viewport(0, 0, t.w, t.h);
    else gl.viewport(0, 0, canvas.width, canvas.height);
    if (clear) {
      gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
      gl.clear(gl.COLOR_BUFFER_BIT | (t && t.depthTex ? gl.DEPTH_BUFFER_BIT : 0));
    }
  }

  /** 绘制 2D 三角形（顶点含颜色与显现时间） */
  function drawTri2D(verts, indices, mat, opacity, reveal) {
    if (!verts.length) return;
    gl.useProgram(P.shape);
    gl.bindBuffer(gl.ARRAY_BUFFER, R.buf.shape);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    const stride = 7 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 24);
    gl.uniformMatrix3fv(P.shape.u.uM, false, mat);
    gl.uniform1f(P.shape.u.uReveal, reveal === undefined ? 2 : reveal);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (indices && indices.length) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.buf.index);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
    } else {
      gl.drawArrays(gl.TRIANGLES, 0, verts.length / 7);
    }
  }

  /** 绘制 3D 网格 */
  function drawMesh(mesh, model, mat, opts) {
    if (!mesh.positions.length) return;
    gl.useProgram(P.mesh);
    gl.bindBuffer(gl.ARRAY_BUFFER, R.buf.mesh);
    const n = mesh.positions.length / 3;
    const data = new Float32Array(n * 9);
    const rv = mesh.reveal;
    for (let i = 0; i < n; i++) {
      data[i * 9] = mesh.positions[i * 3];
      data[i * 9 + 1] = mesh.positions[i * 3 + 1];
      data[i * 9 + 2] = mesh.positions[i * 3 + 2];
      data[i * 9 + 3] = mesh.normals[i * 3];
      data[i * 9 + 4] = mesh.normals[i * 3 + 1];
      data[i * 9 + 5] = mesh.normals[i * 3 + 2];
      data[i * 9 + 6] = mesh.uvs[i * 2] || 0;
      data[i * 9 + 7] = mesh.uvs[i * 2 + 1] || 0;
      data[i * 9 + 8] = rv ? rv[i] : 0;
    }
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const stride = 9 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 32);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.buf.meshIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mesh.indices), gl.DYNAMIC_DRAW);

    const u = P.mesh.u;
    gl.uniformMatrix4fv(u.uVP, false, mat.vp);
    gl.uniformMatrix4fv(u.uModel, false, model);
    gl.uniform3fv(u.uCamPos, mat.camPos);
    const base = U.color.hex2rgb(mat.baseColor || '#cccccc');
    gl.uniform4f(u.uBase, base[0], base[1], base[2], mat.opacity === undefined ? 1 : mat.opacity);
    gl.uniform1f(u.uMetallic, mat.metallic === undefined ? 0 : mat.metallic);
    gl.uniform1f(u.uRoughness, mat.roughness === undefined ? 0.4 : mat.roughness);
    const em = U.color.hex2rgb(mat.emissive || '#000000');
    gl.uniform3f(u.uEmissive, em[0], em[1], em[2]);
    gl.uniform1f(u.uEmissiveI, mat.emissiveIntensity || 0);
    const L = mat.light || { dir: [-0.4, -0.8, -0.5], color: [1, 1, 1], intensity: 1 };
    const ld = U.vec.norm(L.dir || [-0.4, -0.8, -0.5]);
    gl.uniform3f(u.uLightDir, ld[0], ld[1], ld[2]);
    const lc = U.color.hex2rgb(L.color || '#ffffff');
    gl.uniform3f(u.uLightColor, lc[0], lc[1], lc[2]);
    gl.uniform1f(u.uLightI, L.intensity === undefined ? 1 : L.intensity);
    const P0 = mat.point || { pos: [0, 0, 0], color: [1, 1, 1], intensity: 0 };
    gl.uniform4f(u.uPointPos, P0.pos[0], P0.pos[1], P0.pos[2], 1);
    const pc = U.color.hex2rgb(P0.color || '#ffffff');
    gl.uniform3f(u.uPointColor, pc[0], pc[1], pc[2]);
    gl.uniform1f(u.uPointI, P0.intensity || 0);
    const env = mat.env || { top: '#26313f', bottom: '#0d1218', intensity: 1 };
    const et = U.color.hex2rgb(env.top), eb = U.color.hex2rgb(env.bottom);
    gl.uniform3f(u.uEnvTop, et[0], et[1], et[2]);
    gl.uniform3f(u.uEnvBottom, eb[0], eb[1], eb[2]);
    gl.uniform1f(u.uEnvI, env.intensity === undefined ? 1 : env.intensity);
    gl.uniformMatrix4fv(u.uShadowMat, false, mat.shadowMat || IDENT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, RT.shadow.tex);
    gl.uniform1i(u.uShadowMap, 0);
    gl.uniform1f(u.uShadowOn, mat.shadowOn ? 1 : 0);
    gl.uniform1f(u.uWire, mat.wire ? 1 : 0);
    gl.uniform1f(u.uReveal, mat.reveal === undefined ? 2 : mat.reveal);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_INT, 0);
  }

  const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  /** 阴影贴图 */
  function renderShadow(scene) {
    const lights = scene.lights.filter(l => l.type === 'parallel' && l.shadow);
    if (!lights.length || !scene.shadowMeshes || !scene.shadowMeshes.length) return null;
    const L = lights[0];
    const dir = U.vec.norm(L.dir);
    const center = scene.shadowCenter || [0, 0, 0];
    const radius = scene.shadowRadius || 900;
    const eye = [center[0] - dir[0] * radius * 2, center[1] - dir[1] * radius * 2, center[2] - dir[2] * radius * 2];
    const up = Math.abs(dir[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
    const view = U.mat4.lookAt(eye, center, up);
    const proj = U.mat4.ortho(-radius, radius, -radius, radius, 10, radius * 5);
    const vp = U.mat4.multiply(proj, view);
    bindTarget(RT.shadow, [0, 0, 0, 1]);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.useProgram(P.shadow);
    gl.uniformMatrix4fv(P.shadow.u.uVP, false, vp);
    for (const m of scene.shadowMeshes) {
      gl.uniformMatrix4fv(P.shadow.u.uModel, false, m.model);
      gl.bindBuffer(gl.ARRAY_BUFFER, R.buf.mesh);
      const n = m.mesh.positions.length / 3;
      if (!m._shadowBuf) {
        m._shadowBuf = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          m._shadowBuf[i * 3] = m.mesh.positions[i * 3];
          m._shadowBuf[i * 3 + 1] = m.mesh.positions[i * 3 + 1];
          m._shadowBuf[i * 3 + 2] = m.mesh.positions[i * 3 + 2];
        }
      }
      gl.bufferData(gl.ARRAY_BUFFER, m._shadowBuf, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.buf.meshIdx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(m.mesh.indices), gl.DYNAMIC_DRAW);
      gl.drawElements(gl.TRIANGLES, m.mesh.indices.length, gl.UNSIGNED_INT, 0);
    }
    return vp;
  }

  /** 粒子 */
  function drawParticles(ps, mat) {
    if (!ps || !ps.count) return;
    const n = ps.count;
    const data = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
      data[i * 8] = ps.positions[i * 3];
      data[i * 8 + 1] = ps.positions[i * 3 + 1];
      data[i * 8 + 2] = ps.positions[i * 3 + 2];
      data[i * 8 + 3] = ps.colors[i * 4];
      data[i * 8 + 4] = ps.colors[i * 4 + 1];
      data[i * 8 + 5] = ps.colors[i * 4 + 2];
      data[i * 8 + 6] = ps.colors[i * 4 + 3];
      data[i * 8 + 7] = ps.sizes[i];
    }
    gl.useProgram(P.sprite);
    gl.bindBuffer(gl.ARRAY_BUFFER, R.buf.sprite);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28);
    gl.uniformMatrix4fv(P.sprite.u.uVP, false, mat.vp);
    gl.uniform1f(P.sprite.u.uScale, mat.pointScale);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.depthMask(true);
  }

  /** 拖尾 */
  function drawTrails(trails, mat, color, width) {
    if (!trails || !trails.length) return;
    const verts = [];
    for (const tr of trails) {
      const pts = tr.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const t = i / Math.max(1, pts.length - 1);
        const alpha = (1 - t) * 0.85;
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        const l = Math.hypot(dx, dy, dz) || 1;
        // 面向相机的横向偏移
        const vx = mat.camRight ? mat.camRight[0] : 1, vy = mat.camRight ? mat.camRight[1] : 0, vz = mat.camRight ? mat.camRight[2] : 0;
        const w = width * (1 - t);
        const ox = vy * dz - vz * dy, oy = vz * dx - vx * dz, oz = vx * dy - vy * dx;
        const ol = Math.hypot(ox, oy, oz) || 1;
        const s = w / 2;
        const nx = ox / ol * s, ny = oy / ol * s, nz = oz / ol * s;
        const c = U.color.hex2rgb(color);
        verts.push(
          a[0] + nx, a[1] + ny, a[2] + nz, c[0], c[1], c[2], alpha,
          a[0] - nx, a[1] - ny, a[2] - nz, c[0], c[1], c[2], alpha,
          b[0] + nx, b[1] + ny, b[2] + nz, c[0], c[1], c[2], alpha * 0.85,
          b[0] - nx, b[1] - ny, b[2] - nz, c[0], c[1], c[2], alpha * 0.85
        );
      }
    }
    if (!verts.length) return;
    gl.useProgram(P.trail);
    gl.bindBuffer(gl.ARRAY_BUFFER, R.buf.trail);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.uniformMatrix4fv(P.trail.u.uVP, false, mat.vp);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 7);
    gl.depthMask(true);
  }

  /* ---------------- 效果 ---------------- */
  /** 取两个与 src 均不同的暂存目标 */
  function fxScratch(src) {
    const pool = [RT.fxA, RT.fxB, RT.fxC];
    const out = [];
    for (const t of pool) if (t !== src) out.push(t);
    return out;
  }

  function applyEffects(rt, effects, layerRT) {
    if (!effects || !effects.length) return rt;
    let src = rt;
    for (const fx of effects) {
      if (!fx.enabled) continue;
      const p = fx.props || {};
      const val = k => (p[k] ? p[k].v : undefined);
      switch (fx.type) {
        case 'gaussianBlur': {
          const r = (val('blurRadius') || 0) * (curW / 1920);
          if (r > 0.2) {
            const [a, b] = fxScratch(src);
            a.resize(curW, curH);
            bindTarget(a, null);
            drawQuad(P.blur, q => {
              gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
              gl.uniform1i(q.u.uTex, 0);
              gl.uniform2f(q.u.uDir, r / curW, 0);
            });
            b.resize(curW, curH);
            bindTarget(b, null);
            drawQuad(P.blur, q => {
              gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex);
              gl.uniform1i(q.u.uTex, 0);
              gl.uniform2f(q.u.uDir, 0, r / curH);
            });
            src = b;
          }
          break;
        }
        case 'glow': {
          const r = (val('glowRadius') || 10) * (curW / 1920);
          const thr = val('glowThreshold') === undefined ? 0.55 : val('glowThreshold');
          const [a, b] = fxScratch(src);
          // 亮部提取
          a.resize(curW, curH);
          bindTarget(a, null);
          drawQuad(P.bright, q => {
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
            gl.uniform1i(q.u.uTex, 0); gl.uniform1f(q.u.uThreshold, thr);
          });
          // 两次模糊 → 覆盖回 a
          b.resize(curW, curH);
          bindTarget(b, null);
          drawQuad(P.blur, q => {
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex);
            gl.uniform1i(q.u.uTex, 0); gl.uniform2f(q.u.uDir, r / curW, 0);
          });
          bindTarget(a, null);
          drawQuad(P.blur, q => {
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, b.tex);
            gl.uniform1i(q.u.uTex, 0); gl.uniform2f(q.u.uDir, 0, r / curH);
          });
          // 原图 + 辉光（叠加）
          bindTarget(b, null);
          drawQuad(P.composite, q => {
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, a.tex);
            gl.uniform1i(q.u.uSrc, 0); gl.uniform1i(q.u.uBack, 1);
            gl.uniform1i(q.u.uMode, 1); gl.uniform1f(q.u.uOpacity, 1);
          });
          src = b;
          break;
        }
        case 'dropShadow': {
          const dist = (val('shadowDistance') || 8);
          const blur = (val('shadowBlur') || 6);
          const op = val('shadowOpacity') === undefined ? 0.6 : val('shadowOpacity');
          const col = val('shadowColor') || '#000000';
          const rgb = U.color.hex2rgb(col);
          const [a, b] = fxScratch(src);
          // alpha
          a.resize(curW, curH);
          bindTarget(a, null);
          drawQuad(P.alpha, q => {
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
            gl.uniform1i(q.u.uTex, 0);
          });
          // 模糊
          b.resize(curW, curH);
          bindTarget(b, null);
          drawQuad(P.blur, q => {
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex);
            gl.uniform1i(q.u.uTex, 0); gl.uniform2f(q.u.uDir, blur / curW, 0);
          });
          bindTarget(a, null);
          drawQuad(P.blur, q => {
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, b.tex);
            gl.uniform1i(q.u.uTex, 0); gl.uniform2f(q.u.uDir, 0, blur / curH);
          });
          // 偏移 + 着色
          bindTarget(b, null);
          drawQuad(P.shadowFx, q => {
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex);
            gl.uniform1i(q.u.uTex, 0);
            gl.uniform2f(q.u.uOffset, dist / curW, -dist / curH);
            gl.uniform4f(q.u.uColor, rgb[0], rgb[1], rgb[2], op);
          });
          // 原图叠在阴影之上
          bindTarget(a, null);
          drawQuad(P.composite, q => {
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b.tex);
            gl.uniform1i(q.u.uSrc, 0); gl.uniform1i(q.u.uBack, 1);
            gl.uniform1i(q.u.uMode, 0); gl.uniform1f(q.u.uOpacity, 1);
          });
          src = a;
          break;
        }
        case 'hsl': {
          const hue = val('hue') || 0, sat = val('saturation') || 0, light = val('lightness') || 0;
          if (hue || sat || light) {
            const [a] = fxScratch(src);
            a.resize(curW, curH);
            bindTarget(a, null);
            drawQuad(P.hsl, q => {
              gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
              gl.uniform1i(q.u.uTex, 0);
              gl.uniform1f(q.u.uHue, hue); gl.uniform1f(q.u.uSat, sat); gl.uniform1f(q.u.uLight, light);
            });
            src = a;
          }
          break;
        }
      }
    }
    return src;
  }

  /* ---------------- 合成一个场景到目标 ---------------- */
  /**
   * scene: { w,h, camera:{vp, camPos, pointScale, camRight}, lights, layers:[...], shadowMeshes }
   */
  R.renderScene = function (scene, target) {
    const w = scene.w, h = scene.h;
    RT.layer.resize(w, h);
    RT.scene.resize(w, h);
    RT.scene2.resize(w, h);
    RT.accum.resize(w, h);
    RT.tmp.resize(w, h);
    RT.tmp2.resize(w, h);
    RT.scene3d.resize(w, h);
    RT.precomp.resize(w, h);

    // 1. 阴影
    const shadowVP = renderShadow(scene);
    scene.shadowMat = shadowVP || IDENT;

    // 2. 3D 场景
    bindTarget(RT.scene3d, [0, 0, 0, 0]);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    let drew3d = false;
    const mat = {
      vp: scene.camera.vp, camPos: scene.camera.pos, pointScale: scene.camera.pointScale,
      camRight: scene.camera.right, shadowMat: scene.shadowMat
    };
    const light = scene.lights.find(l => l.type === 'parallel') || { dir: [-0.4, -0.8, -0.5], color: '#fff', intensity: 1 };
    const point = scene.lights.find(l => l.type === 'point');
    for (const item of scene.layers) {
      if (item.kind === 'solid3d') {
        drew3d = true;
        drawMesh(item.mesh, item.model, Object.assign({}, mat, {
          baseColor: item.material.baseColor, metallic: item.material.metallic, roughness: item.material.roughness,
          emissive: item.material.emissive, emissiveIntensity: item.material.emissiveIntensity,
          opacity: item.opacity, light, point: point ? { pos: point.pos, color: point.color, intensity: point.intensity } : null,
          env: scene.env, shadowOn: !!shadowVP, wire: scene.viewMode === 'wire',
          reveal: item.reveal
        }));
      } else if (item.kind === 'particle') {
        drew3d = true;
        if (item.trails) drawTrails(item.trails, mat, item.trailColor, item.trailWidth);
        drawParticles(item.particles, mat);
      }
    }
    if (drew3d) {
      // 景深
      const cam = scene.camera;
      if (cam.aperture > 0.0001 && cam.focus > 0) {
        RT.fxA.resize(w, h);
        bindTarget(RT.fxA, null);
        drawQuad(P.dof, p => {
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, RT.scene3d.tex);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, RT.scene3d.depthTex);
          gl.uniform1i(p.u.uTex, 0); gl.uniform1i(p.u.uDepth, 1);
          gl.uniform1f(p.u.uFocus, cam.focus); gl.uniform1f(p.u.uAperture, cam.aperture);
          gl.uniform1f(p.u.uMaxCoc, 14); gl.uniform2f(p.u.uTexel, 1 / w, 1 / h);
        });
        // 写回 3D 缓冲（读 fxA，写 scene3d，无自采样）
        bindTarget(RT.scene3d, null);
        drawQuad(P.blit, p => {
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, RT.fxA.tex);
          gl.uniform1i(p.u.uTex, 0); gl.uniform1f(p.u.uAlpha, 1);
        });
      }
    }

    // 3. 2D 图层
    bindTarget(RT.scene, [0, 0, 0, 0]);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    let back = RT.scene, front = RT.scene2;
    let threeDPlaced = false;

    for (const item of scene.layers) {
      if (item.kind === 'solid3d' || item.kind === 'particle') {
        if (!threeDPlaced) {
          threeDPlaced = true;
          if (drew3d) {
            const dst = back === RT.scene ? RT.scene2 : RT.scene;
            bindTarget(dst, null);
            drawQuad(P.composite, p => {
              gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, RT.scene3d.tex);
              gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, back.tex);
              gl.uniform1i(p.u.uSrc, 0); gl.uniform1i(p.u.uBack, 1);
              gl.uniform1i(p.u.uMode, 0); gl.uniform1f(p.u.uOpacity, 1);
            });
            back = dst; front = back === RT.scene ? RT.scene2 : RT.scene;
          }
        }
        continue;
      }
      if (item.kind === 'adjustment') {
        const hasFx = item.effects && item.effects.some(f => f.enabled);
        if (!hasFx) continue;
        // 调整层：作用于下方合成结果
        const src = applyEffects(back, item.effects, null);
        const dst = back === RT.scene ? RT.scene2 : RT.scene;
        bindTarget(dst, null);
        drawQuad(P.composite, p => {
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, back.tex);
          gl.uniform1i(p.u.uSrc, 0); gl.uniform1i(p.u.uBack, 1);
          gl.uniform1i(p.u.uMode, 0); gl.uniform1f(p.u.uOpacity, item.opacity);
        });
        back = dst; front = back === RT.scene ? RT.scene2 : RT.scene;
        continue;
      }
      if (item.kind === 'precomp' && item.rt) {
        const dst = back === RT.scene ? RT.scene2 : RT.scene;
        bindTarget(dst, null);
        drawQuad(P.composite, p => {
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, item.rt.tex);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, back.tex);
          gl.uniform1i(p.u.uSrc, 0); gl.uniform1i(p.u.uBack, 1);
          gl.uniform1i(p.u.uMode, modeIndex(item.blendMode)); gl.uniform1f(p.u.uOpacity, item.opacity);
        });
        back = dst; front = back === RT.scene ? RT.scene2 : RT.scene;
        continue;
      }
      if (item.kind === 'tri2d' && item.verts && item.verts.length) {
        // 渲染到 layer RT（便于加效果/蒙版）
        bindTarget(RT.layer, [0, 0, 0, 0]);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        drawTri2D(item.verts, item.indices, item.matrix, item.opacity, item.reveal);
        let src = RT.layer;
        if (item.masks && item.masks.length) src = applyMasks(item, w, h);
        src = applyEffects(src, item.effects, RT.layer);
        const dst = back === RT.scene ? RT.scene2 : RT.scene;
        bindTarget(dst, null);
        drawQuad(P.composite, p => {
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, back.tex);
          gl.uniform1i(p.u.uSrc, 0); gl.uniform1i(p.u.uBack, 1);
          gl.uniform1i(p.u.uMode, modeIndex(item.blendMode)); gl.uniform1f(p.u.uOpacity, item.opacity);
        });
        back = dst; front = back === RT.scene ? RT.scene2 : RT.scene;
      }
    }
    // 结果在 back
    return back;
  };

  function modeIndex(m) {
    const i = AE.model.BLEND_MODES.findIndex(x => x.id === m);
    return i < 0 ? 0 : i;
  }

  /** 绘制单个蒙版的形状（白色=覆盖） */
  function drawMaskShape(m) {
    const verts = [], indices = [];
    const contours = m.contours || [];
    if (!contours.length) return;
    const tri = AE.path.triangulate(contours.map(c => ({ pts: c, hole: m.mode === 'subtract' })));
    for (let i = 0; i < tri.verts.length; i += 2) {
      verts.push(tri.verts[i], tri.verts[i + 1], 1, 1, 1, 1, 0);
    }
    for (const i of tri.indices) indices.push(i);
    gl.useProgram(P.shape);
    gl.bindBuffer(gl.ARRAY_BUFFER, R.buf.shape);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    gl.uniformMatrix3fv(P.shape.u.uM, false, m.matrix);
    gl.uniform1f(P.shape.u.uReveal, 2);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.buf.index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
  }

  /** 按蒙版链裁切图层：RT.layer → RT.maskLayer */
  function applyMasks(item, w, h) {
    const masks = item.masks;
    RT.maskCov.resize(w, h);
    RT.maskCov2.resize(w, h);
    RT.maskShape.resize(w, h);
    bindTarget(RT.maskCov, [0, 0, 0, 0]);
    let cov = RT.maskCov;
    for (let i = 0; i < masks.length; i++) {
      const m = masks[i];
      bindTarget(RT.maskShape, [0, 0, 0, 0]);
      drawMaskShape(m);
      const dst = cov === RT.maskCov ? RT.maskCov2 : RT.maskCov;
      const mode = m.mode === 'subtract' ? 1 : m.mode === 'intersect' ? 2 : m.mode === 'difference' ? 3 : 0;
      bindTarget(dst, null);
      drawQuad(P.maskComb, q => {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cov.tex);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, RT.maskShape.tex);
        gl.uniform1i(q.u.uCov, 0); gl.uniform1i(q.u.uMask, 1);
        gl.uniform1i(q.u.uMode, mode);
      });
      cov = dst;
    }
    RT.maskLayer.resize(w, h);
    bindTarget(RT.maskLayer, null);
    drawQuad(P.maskApply, q => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, RT.layer.tex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, cov.tex);
      gl.uniform1i(q.u.uTex, 0); gl.uniform1i(q.u.uMask, 1);
    });
    return RT.maskLayer;
  }

  /** 把合成结果输出到屏幕（保持合成宽高比，居中留边） */
  R.present = function (tex, dstW, dstH, compW, compH, bg) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, dstW, dstH);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    // 画布底色（留边区域）
    gl.clearColor(0.031, 0.039, 0.051, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!compW || !compH) return;
    const bgc = bg ? U.color.hex2rgb(bg) : [0.04, 0.05, 0.07];
    const canvasAspect = dstW / dstH, compAspect = compW / compH;
    let w = dstW, h = dstH, x = 0, y = 0;
    if (compAspect > canvasAspect) { h = dstW / compAspect; y = (dstH - h) / 2; }
    else { w = dstH * compAspect; x = (dstW - w) / 2; }
    // 合成区域铺底色
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    gl.clearColor(bgc[0], bgc[1], bgc[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);
    // 叠加合成结果（预乘 alpha）
    gl.viewport(x, y, w, h);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    drawQuad(P.blit, p => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.tex);
      gl.uniform1i(p.u.uTex, 0); gl.uniform1f(p.u.uAlpha, 1);
    });
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, dstW, dstH);
  };

  /* ---------------- 运动模糊累加 ---------------- */
  R.beginAccum = function (dst) {
    bindTarget(dst, [0, 0, 0, 0]);
    gl.disable(gl.BLEND);
  };
  R.accumulate = function (srcTex, dst) {
    bindTarget(dst, null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    drawQuad(P.accum, p => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex.tex ? srcTex.tex : srcTex);
      gl.uniform1i(p.u.uTex, 0);
    });
    gl.disable(gl.BLEND);
  };
  R.finishAccum = function (src, dst, count) {
    bindTarget(dst, null);
    drawQuad(P.unpre, p => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex ? src.tex : src);
      gl.uniform1i(p.u.uTex, 0); gl.uniform1f(p.u.uCount, count);
    });
  };

  /** 把纹理拷贝到另一个 target */
  R.copy = function (srcTex, dst) {
    bindTarget(dst, null);
    drawQuad(P.blit, p => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex.tex ? srcTex.tex : srcTex);
      gl.uniform1i(p.u.uTex, 0); gl.uniform1f(p.u.uAlpha, 1);
    });
  };

  R.clearTarget = function (t, c) {
    bindTarget(t, c || [0, 0, 0, 0]);
  };

  R.compositeTexture = function (srcTex, backTex, dst, mode, opacity) {
    bindTarget(dst, null);
    drawQuad(P.composite, p => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex.tex ? srcTex.tex : srcTex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, backTex.tex ? backTex.tex : backTex);
      gl.uniform1i(p.u.uSrc, 0); gl.uniform1i(p.u.uBack, 1);
      gl.uniform1i(p.u.uMode, modeIndex(mode)); gl.uniform1f(p.u.uOpacity, opacity === undefined ? 1 : opacity);
    });
  };
})(window);
