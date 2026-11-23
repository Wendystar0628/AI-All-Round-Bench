/* GLSL ES 3.00 着色器源码。所有合成像素为预乘 Alpha。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const SH = (AE.Shaders = {});
  const HDR = '#version 300 es\nprecision highp float;\nprecision highp int;\n';

  // 2D 平面填充（已预乘颜色）
  SH.flatVS = HDR + `
layout(location=0) in vec3 aPos;
uniform mat4 uVP; uniform mat4 uModel;
void main(){ gl_Position = uVP * uModel * vec4(aPos, 1.0); }`;
  SH.flatFS = HDR + `
uniform vec4 uCol; out vec4 o;
void main(){ o = uCol; }`;

  // 3D 光照网格：颜色 0 输出 + 视深度 1 输出（用于景深）
  SH.litVS = HDR + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm;
uniform mat4 uVP; uniform mat4 uModel; uniform mat4 uView; uniform mat3 uNrmMat;
out vec3 vW; out vec3 vN; out float vD;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz; vN = normalize(uNrmMat * aNrm);
  vD = -(uView * w).z;
  gl_Position = uVP * w;
}`;
  SH.litFS = HDR + `
in vec3 vW; in vec3 vN; in float vD;
uniform vec3 uCam; uniform vec3 uBase; uniform float uMetal; uniform float uRough; uniform float uAlpha;
uniform vec3 uEmit; uniform int uLit; uniform int uAccept;
uniform int uNL; uniform vec3 uLVec[4]; uniform vec3 uLCol[4]; uniform int uLType[4]; uniform int uLCast[4]; uniform mat4 uLVP[4]; uniform float uLRad[4];
uniform sampler2D uSh0; uniform sampler2D uSh1; uniform sampler2D uSh2; uniform sampler2D uSh3;
uniform float uSDark;
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1;

vec3 envSky(vec3 d){
  float up = -d.y;
  vec3 sky = vec3(0.62, 0.66, 0.74), gnd = vec3(0.16, 0.14, 0.12), hor = vec3(0.92, 0.84, 0.76);
  vec3 c = mix(hor, sky, smoothstep(0.0, 0.7, up));
  c = mix(c, gnd, smoothstep(0.05, -0.45, up));
  vec3 sb = normalize(vec3(-0.55, -0.6, -0.55));
  c += smoothstep(0.86, 0.96, dot(d, sb)) * vec3(3.2, 3.1, 3.0);
  vec3 sb2 = normalize(vec3(0.7, -0.2, -0.4));
  c += smoothstep(0.94, 0.985, dot(d, sb2)) * vec3(1.2, 1.3, 1.5);
  return c;
}
float sampleSh(int i, vec2 uv){
  if (i == 0) return texture(uSh0, uv).r;
  if (i == 1) return texture(uSh1, uv).r;
  if (i == 2) return texture(uSh2, uv).r;
  return texture(uSh3, uv).r;
}
float shadowOf(int i, vec3 wp, vec3 n){
  vec4 lp = uLVP[i] * vec4(wp + n * 1.5, 1.0);
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float s = 0.0; float bias = 0.0015;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
    vec2 off = vec2(float(x), float(y)) / 1024.0;
    s += (p.z - bias > sampleSh(i, p.xy + off)) ? 0.0 : 1.0;
  }
  return mix(1.0 - uSDark, 1.0, s / 9.0);
}
void main(){
  vec3 V = normalize(uCam - vW);
  vec3 N = normalize(vN);
  if (dot(N, V) < 0.0) N = -N;
  if (uLit == 0) {
    vec3 c = uBase + uEmit;
    o0 = vec4(c * uAlpha, uAlpha);
    o1 = vec4(vD, 0.0, 0.0, uAlpha > 0.0 ? 1.0 : 0.0);
    return;
  }
  vec3 albedo = uBase;
  vec3 F0 = mix(vec3(0.04), albedo, uMetal);
  vec3 diffC = albedo * (1.0 - uMetal);
  float NdotV = max(dot(N, V), 0.0);
  vec3 up = vec3(0.0, -1.0, 0.0);
  float hemi = 0.5 + 0.5 * dot(N, up);
  vec3 ambD = mix(vec3(0.05, 0.045, 0.04), vec3(0.32, 0.35, 0.42), hemi) * 0.9;
  vec3 col = diffC * ambD;
  vec3 R = reflect(-V, N);
  vec3 envS = mix(envSky(R), mix(vec3(0.05), vec3(0.4), 0.5 + 0.5 * dot(R, up)), uRough);
  vec3 Fv = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);
  col += envS * Fv * (1.0 - uRough * 0.6);
  float a = max(uRough * uRough, 0.02);
  for (int i = 0; i < 4; i++) {
    if (i >= uNL) break;
    vec3 L; float att = 1.0;
    if (uLType[i] == 0) { L = normalize(uLVec[i]); }
    else { vec3 d = uLVec[i] - vW; float dl = length(d); L = d / max(dl, 1e-3); att = 1.0 / (1.0 + (dl * dl) / (uLRad[i] * uLRad[i])); }
    float NdotL = max(dot(N, L), 0.0);
    float sh = 1.0;
    if (uAccept == 1 && uLCast[i] == 1) sh = shadowOf(i, vW, N);
    if (NdotL <= 0.0) continue;
    vec3 H = normalize(L + V);
    float NdotH = max(dot(N, H), 0.0);
    float d = a * a / (3.14159 * pow(NdotH * NdotH * (a * a - 1.0) + 1.0, 2.0));
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    vec3 spec = d * F / max(4.0 * NdotV * NdotL, 1e-3);
    vec3 rad = uLCol[i] * att * sh;
    col += (diffC * (1.0 - 0.0) / 3.14159 + spec) * rad * NdotL * 3.14159 * 0.85;
  }
  col += uEmit;
  col = 1.0 - exp(-col * 1.15);
  o0 = vec4(col * uAlpha, uAlpha);
  o1 = vec4(vD, 0.0, 0.0, uAlpha > 0.0 ? 1.0 : 0.0);
}`;

  // 阴影深度
  SH.shadowVS = HDR + `
layout(location=0) in vec3 aPos;
uniform mat4 uVP; uniform mat4 uModel;
void main(){ gl_Position = uVP * uModel * vec4(aPos, 1.0); }`;
  SH.shadowFS = HDR + `
out vec4 o; void main(){ o = vec4(1.0); }`;

  // 粒子精灵（加色混合）
  SH.spriteVS = HDR + `
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; layout(location=2) in float aSize;
uniform mat4 uVP; uniform float uPx;
out vec4 vC;
void main(){
  gl_Position = uVP * vec4(aPos, 1.0);
  float d = max(gl_Position.w, 1.0);
  gl_PointSize = clamp(aSize * uPx / d, 1.0, 512.0);
  vC = aCol;
}`;
  SH.spriteFS = HDR + `
in vec4 vC; layout(location=0) out vec4 o; layout(location=1) out vec4 o1;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float a = clamp(1.0 - r, 0.0, 1.0);
  a = a * a * (3.0 - 2.0 * a) * vC.a;
  o = vec4(vC.rgb * a, a);
  o1 = vec4(0.0);
}`;

  // 全屏 / 单位方块 顶点
  SH.fullVS = HDR + `
layout(location=0) in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos; gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0); }`;
  // 图层纹理按变换放置（aPos 为单位方块，v 方向与合成像素方向相反）
  SH.quadVS = HDR + `
layout(location=0) in vec2 aPos; out vec2 vUv;
uniform mat4 uVP; uniform mat4 uModel;
void main(){ vUv = vec2(aPos.x, 1.0 - aPos.y); gl_Position = uVP * uModel * vec4(aPos, 0.0, 1.0); }`;
  SH.texFS = HDR + `
in vec2 vUv; uniform sampler2D uTex; uniform float uOpacity; out vec4 o;
void main(){ o = texture(uTex, vUv) * uOpacity; }`;

  // 图层混合：uMode 0 普通 1 相加 2 滤色 3 正片叠底 4 叠加
  SH.blendFS = HDR + `
in vec2 vUv; uniform sampler2D uSrc; uniform sampler2D uDst; uniform int uMode; uniform float uOpacity; out vec4 o;
vec3 mulB(vec3 a, vec3 b){ return a * b; }
vec3 scrB(vec3 a, vec3 b){ return a + b - a * b; }
void main(){
  vec4 s = texture(uSrc, vUv) * uOpacity;
  vec4 d = texture(uDst, vUv);
  float as = s.a, ab = d.a;
  vec3 cs = as > 0.0 ? s.rgb / as : vec3(0.0);
  vec3 cb = ab > 0.0 ? d.rgb / ab : vec3(0.0);
  vec3 B = cs;
  if (uMode == 1) B = min(cb + cs, vec3(1.0));
  else if (uMode == 2) B = scrB(cb, cs);
  else if (uMode == 3) B = mulB(cb, cs);
  else if (uMode == 4) {
    // 叠加 = 以背景决定的硬光：cb <= 0.5 时正片，否则滤色
    vec3 lo = mulB(cs, 2.0 * cb);
    vec3 hi = scrB(cs, 2.0 * cb - 1.0);
    B = mix(lo, hi, step(vec3(0.5), cb));
  }
  vec3 co = s.rgb * (1.0 - ab) + d.rgb * (1.0 - as) + as * ab * B;
  float ao = as + ab - as * ab;
  o = vec4(co, ao);
}`;
  // 相加合成（用于运动模糊累加、发光叠加等）
  SH.addFS = HDR + `
in vec2 vUv; uniform sampler2D uSrc; uniform float uWeight; out vec4 o;
void main(){ o = texture(uSrc, vUv) * uWeight; }`;

  // 可分离高斯模糊：uDir 为一步在 uv 空间的偏移，uTaps 为单侧采样数
  SH.blurFS = HDR + `
in vec2 vUv; uniform sampler2D uSrc; uniform vec2 uDir; uniform int uTaps; uniform float uSigma; out vec4 o;
void main(){
  vec4 acc = vec4(0.0); float wsum = 0.0;
  for (int i = -32; i <= 32; i++) {
    if (abs(i) > uTaps) continue;
    float fi = float(i);
    float w = exp(-(fi * fi) / (2.0 * uSigma * uSigma));
    acc += texture(uSrc, vUv + uDir * fi) * w;
    wsum += w;
  }
  o = acc / max(wsum, 1e-6);
}`;

  // 发光提取：按亮度阈值保留亮部
  SH.glowExtractFS = HDR + `
in vec2 vUv; uniform sampler2D uSrc; uniform float uThresh; uniform vec3 uTint; out vec4 o;
void main(){
  vec4 s = texture(uSrc, vUv);
  vec3 c = s.a > 0.0 ? s.rgb / s.a : vec3(0.0);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float k = smoothstep(uThresh, uThresh + 0.25, l) * s.a;
  o = vec4(c * k * uTint, k);
}`;

  // 色相 / 饱和度 / 亮度（预乘处理）
  SH.hslFS = HDR + `
in vec2 vUv; uniform sampler2D uSrc; uniform float uHue; uniform float uSat; uniform float uLight; out vec4 o;
vec3 rgb2hsl(vec3 c){
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5; float h = 0.0, s = 0.0;
  if (mx != mn) {
    float d = mx - mn;
    s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
    if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}
float hue2rgb(float p, float q, float t){
  if (t < 0.0) t += 1.0; if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}
vec3 hsl2rgb(vec3 hsl){
  if (hsl.y == 0.0) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(hue2rgb(p, q, hsl.x + 1.0/3.0), hue2rgb(p, q, hsl.x), hue2rgb(p, q, hsl.x - 1.0/3.0));
}
void main(){
  vec4 s = texture(uSrc, vUv);
  if (s.a <= 0.0) { o = s; return; }
  vec3 c = s.rgb / s.a;
  vec3 hsl = rgb2hsl(c);
  hsl.x = fract(hsl.x + uHue / 360.0);
  hsl.y = clamp(hsl.y * (1.0 + uSat / 100.0), 0.0, 1.0);
  hsl.z = clamp(hsl.z + uLight / 100.0, 0.0, 1.0);
  o = vec4(hsl2rgb(hsl) * s.a, s.a);
}`;

  // 阴影：把 alpha 按偏移与颜色做成底层
  SH.shadowFS2 = HDR + `
in vec2 vUv; uniform sampler2D uSrc; uniform vec2 uOff; uniform vec3 uCol; uniform float uOp; out vec4 o;
void main(){ float a = texture(uSrc, vUv - uOff).a * uOp; o = vec4(uCol * a, a); }`;

  // 遮罩覆盖的合并：uMode 0 相加 1 相减 2 相交
  SH.maskOpFS = HDR + `
in vec2 vUv; uniform sampler2D uAcc; uniform sampler2D uM; uniform int uMode; uniform float uInv; out vec4 o;
void main(){
  float c = texture(uAcc, vUv).a;
  float m = texture(uM, vUv).a;
  if (uInv > 0.5) m = 1.0 - m;
  float r = c;
  if (uMode == 0) r = c + m - c * m;
  else if (uMode == 1) r = c * (1.0 - m);
  else r = c * m;
  o = vec4(0.0, 0.0, 0.0, r);
}`;
  // 乘以覆盖（作用于预乘颜色）
  SH.mulAlphaFS = HDR + `
in vec2 vUv; uniform sampler2D uSrc; uniform sampler2D uCov; uniform int uMode; out vec4 o;
void main(){
  vec4 s = texture(uSrc, vUv);
  float c = texture(uCov, vUv).a;
  o = s * c;
}`;
  // 轨道遮罩：uMode 0 Alpha 1 亮度；uInv 反转
  SH.matteFS = HDR + `
in vec2 vUv; uniform sampler2D uSrc; uniform sampler2D uMatte; uniform int uMode; uniform int uInv; out vec4 o;
void main(){
  vec4 s = texture(uSrc, vUv);
  vec4 m = texture(uMatte, vUv);
  float k = uMode == 0 ? m.a : (m.a > 0.0 ? dot(m.rgb / m.a, vec3(0.299, 0.587, 0.114)) * m.a : 0.0);
  if (uInv == 1) k = 1.0 - k;
  o = s * k;
}`;

  // 景深：按视深度计算弥散圆，并做圆盘采样
  SH.dofFS = HDR + `
in vec2 vUv; uniform sampler2D uCol; uniform sampler2D uDep; uniform vec2 uTexel; uniform float uFocus; uniform float uAperture; uniform float uMaxR; out vec4 o;
void main(){
  vec4 base = texture(uCol, vUv);
  float z = texture(uDep, vUv).r;
  float cov = texture(uDep, vUv).a;
  float coc = 0.0;
  if (cov > 0.0 && z > 0.0) coc = clamp(abs(z - uFocus) / z * uAperture, 0.0, uMaxR);
  if (coc < 0.5) { o = base; return; }
  vec4 acc = vec4(0.0); float wsum = 0.0;
  const int N = 40;
  for (int i = 0; i < N; i++) {
    float fi = float(i) + 0.5;
    float r = sqrt(fi / float(N)) * coc;
    float th = fi * 2.399963;
    vec2 off = vec2(cos(th), sin(th)) * r * uTexel;
    vec4 sc = texture(uCol, vUv + off);
    float w = 1.0;
    acc += sc * w; wsum += w;
  }
  o = acc / wsum;
}`;

  // 输出到画布（预乘 Alpha）
  SH.presentFS = HDR + `
in vec2 vUv; uniform sampler2D uTex; out vec4 o;
void main(){ o = texture(uTex, vUv); }`;
})();
