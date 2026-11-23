'use strict';
/* ==================================================================
   WebGL2 渲染器：体素 / 天空 / 粒子 / 尾焰 / 光束 / 护盾 / 泛光后期
   ================================================================== */

const VS_VOX = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in uint a0;
layout(location=1) in uint a1;
layout(location=2) in uint a2;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uRimDir;
uniform vec3 uRimColor;
uniform vec3 uCamPos;
uniform float uAmbient;
uniform vec4 uLightPos[8];
uniform vec4 uLightCol[8];
uniform int uLightCount;
uniform float uEmissiveScale;
uniform sampler2D uPalA;
uniform sampler2D uPalB;
out vec3 vColor;
out vec3 vEmissive;
out vec3 vWorld;
out float vAlpha;
const vec3 CORN[24] = vec3[24](
  vec3(1,0,0),vec3(1,1,0),vec3(1,1,1),vec3(1,0,1),
  vec3(0,0,0),vec3(0,0,1),vec3(0,1,1),vec3(0,1,0),
  vec3(0,1,0),vec3(0,1,1),vec3(1,1,1),vec3(1,1,0),
  vec3(0,0,0),vec3(1,0,0),vec3(1,0,1),vec3(0,0,1),
  vec3(0,0,1),vec3(1,0,1),vec3(1,1,1),vec3(0,1,1),
  vec3(0,0,0),vec3(0,1,0),vec3(1,1,0),vec3(1,0,0)
);
const vec3 NRM[6] = vec3[6](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1));
const float AOF[4] = float[4](1.0,0.70,0.46,0.28);
const float SPEC[8] = float[8](0.16,0.30,0.55,0.03,0.0,0.85,0.08,0.28);
const float SHIN[8] = float[8](22.0,40.0,90.0,6.0,1.0,140.0,14.0,48.0);
void main(){
  const int CI[6] = int[6](0,1,2,0,2,3);
  int ci = CI[gl_VertexID];
  int f = int((a1 >> 16) & 7u);
  vec3 vox = vec3(float(a0 & 0xFFFFu), float((a0>>16)&0xFFFFu), float(a1 & 0xFFFFu));
  vec3 lp = vox + CORN[f*4+ci];
  vec4 wp = uModel * vec4(lp, 1.0);
  vec3 n = normalize(mat3(uModel) * NRM[f]);
  uint col = (a1 >> 19) & 0xFFu;
  vec4 palA = texelFetch(uPalA, ivec2(int(col), 0), 0);
  vec4 palB = texelFetch(uPalB, ivec2(int(col), 0), 0);
  int matId = int(palB.r);
  float spec = SPEC[matId], shin = SHIN[matId];
  vec3 albedo = palA.rgb;
  float emis = palA.a * 1.6;
  // AO
  int ao = int((a2 >> (ci*2)) & 3u);
  float aoF = AOF[ao];
  // 烘焙光
  vec3 baked = vec3(float((a2>>8)&0xFFu), float((a2>>16)&0xFFu), float((a2>>24)&0xFFu)) * (1.0/48.0);
  // 方向光 + 半球环境
  float ndl = max(dot(n, uSunDir), 0.0);
  vec3 hemi = mix(uGroundColor, uSkyColor, n.y*0.5+0.5);
  vec3 lc = uSunColor * ndl + hemi * uAmbient + baked;
  vec3 V = normalize(uCamPos - wp.xyz);
  // 动态点光
  for (int i = 0; i < 8; i++) {
    if (i >= uLightCount) break;
    vec3 L = uLightPos[i].xyz - wp.xyz;
    float dd = length(L);
    float att = clamp(1.0 - dd / uLightPos[i].w, 0.0, 1.0);
    att *= att;
    if (att <= 0.0) continue;
    vec3 Ln = L / max(dd, 0.001);
    float nl = max(dot(n, Ln), 0.0);
    lc += uLightCol[i].rgb * uLightCol[i].a * att * nl;
    vec3 H = normalize(Ln + V);
    lc += uLightCol[i].rgb * uLightCol[i].a * att * pow(max(dot(n, H), 0.0), shin) * spec * 1.5;
  }
  vec3 c = albedo * lc * aoF;
  // 边缘轮廓光
  float rim = pow(1.0 - max(dot(n, V), 0.0), 2.6) * max(dot(n, uRimDir), 0.0);
  c += uRimColor * rim * (albedo * 1.6 + 0.06) * aoF;
  // 太阳高光
  vec3 Hs = normalize(uSunDir + V);
  c += uSunColor * pow(max(dot(n, Hs), 0.0), shin) * spec * 1.2 * aoF;
  vColor = c;
  vEmissive = albedo * emis * uEmissiveScale;
  vAlpha = palB.g / 255.0;
  vWorld = wp.xyz;
  gl_Position = uViewProj * wp;
}`;

const FS_VOX = `#version 300 es
precision highp float;
in vec3 vColor;
in vec3 vEmissive;
in vec3 vWorld;
in float vAlpha;
uniform vec3 uCamPos;
uniform float uFogDensity;
uniform vec3 uFogColor;
out vec4 fragColor;
void main(){
  vec3 c = vColor + vEmissive;
  float d = length(vWorld - uCamPos);
  float f = 1.0 - exp(-d*d*uFogDensity);
  c = mix(c, uFogColor, clamp(f, 0.0, 1.0));
  fragColor = vec4(c, vAlpha);
}`;

const VS_SKY = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID==1)?3.0:-1.0, (gl_VertexID==2)?3.0:-1.0);
  vUv = p*0.5+0.5;
  gl_Position = vec4(p, 1.0, 1.0);
}`;

const FS_SKY = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uCamRight, uCamUp, uCamFwd;
uniform float uAspect, uTanHalf;
uniform vec3 uSunDir;
uniform vec3 uNebulaA, uNebulaB, uNebulaC;
uniform float uTime;
out vec4 fragColor;

float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.yzx+33.33); return fract((p.x+p.y)*p.z); }
vec3 hash33(vec3 p){ p = fract(p*vec3(0.1031,0.1030,0.0973)); p += dot(p, p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
float noise3(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = hash13(i), b = hash13(i+vec3(1,0,0)), c = hash13(i+vec3(0,1,0)), d = hash13(i+vec3(1,1,0));
  float e = hash13(i+vec3(0,0,1)), g = hash13(i+vec3(1,0,1)), h = hash13(i+vec3(0,1,1)), k = hash13(i+vec3(1,1,1));
  return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,g,f.x), mix(h,k,f.x), f.y), f.z);
}
float fbm(vec3 p){ float s=0.0, a=0.5; for(int i=0;i<6;i++){ s+=a*noise3(p); p*=2.03; a*=0.5; } return s; }

vec3 starLayer(vec3 d, float scale, float density, float size, float bright){
  vec3 p = d * scale;
  vec3 cell = floor(p);
  vec3 h = hash33(cell);
  if (h.x > density) return vec3(0.0);
  vec3 sp = cell + 0.2 + h * 0.6;
  vec3 sd = normalize(sp);
  float ang = length(cross(d, sd));
  float s = smoothstep(size, 0.0, ang);
  float tw = 0.75 + 0.25*sin(uTime*2.0 + h.y*40.0);
  vec3 tint = mix(vec3(0.72,0.82,1.0), vec3(1.0,0.86,0.66), h.z);
  return tint * s * bright * tw * (0.3 + h.y*0.9);
}

void main(){
  vec2 ndc = vUv*2.0-1.0;
  vec3 d = normalize(uCamFwd + uCamRight*ndc.x*uAspect*uTanHalf + uCamUp*ndc.y*uTanHalf);
  // 星云
  float n1 = fbm(d*2.2 + vec3(1.3, 2.7, 0.4));
  float n2 = fbm(d*4.7 + vec3(7.1, 1.9, 3.3));
  float band = exp(-pow(dot(d, normalize(vec3(0.25, 0.92, -0.3)))*2.2, 2.0));
  vec3 col = mix(uNebulaA, uNebulaB, smoothstep(0.35, 0.78, n1)) * 0.55;
  col = mix(col, uNebulaC, smoothstep(0.5, 0.9, n2)*0.55);
  col *= 0.35 + 0.9*band;
  float dust = fbm(d*6.0 + vec3(11.0, 5.0, 2.0));
  col *= mix(0.25, 1.0, smoothstep(0.32, 0.62, dust));
  // 深空底色
  col += vec3(0.012, 0.016, 0.035);
  // 星
  vec3 st = vec3(0.0);
  st += starLayer(d, 26.0, 0.30, 0.0011, 2.2);
  st += starLayer(d, 62.0, 0.34, 0.00055, 1.1);
  st += starLayer(d, 140.0, 0.38, 0.00030, 0.55);
  col += st;
  // 主光天体
  float sd = max(dot(d, uSunDir), 0.0);
  col += vec3(1.0, 0.86, 0.62) * (pow(sd, 2200.0)*40.0 + pow(sd, 90.0)*0.9 + pow(sd, 12.0)*0.12);
  // 银河带增亮
  col += vec3(0.10, 0.12, 0.22) * band * (0.4 + 0.6*n1);
  fragColor = vec4(col, 1.0);
}`;

const VS_SPRITE = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iPosSize;   // xyz, size
layout(location=2) in vec4 iColor;     // rgb, alpha
layout(location=3) in vec4 iExtra;     // rotation, stretch, unused
uniform mat4 uViewProj;
uniform mat4 uView;
out vec2 vUv;
out vec4 vColor;
out vec2 vStretch;
void main(){
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]);
  vec3 up = vec3(uView[0][1], uView[1][1], uView[2][1]);
  float c = cos(iExtra.x), s = sin(iExtra.x);
  vec2 rc = vec2(aCorner.x*c - aCorner.y*s, aCorner.x*s + aCorner.y*c);
  vec3 p = iPosSize.xyz + right*rc.x*iPosSize.w*iExtra.y + up*rc.y*iPosSize.w;
  vUv = aCorner*2.0;
  vColor = iColor;
  vStretch = vec2(iExtra.y, 1.0);
  gl_Position = uViewProj * vec4(p, 1.0);
}`;

const FS_SPRITE = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vColor;
in vec2 vStretch;
uniform int uShape;
out vec4 fragColor;
void main(){
  vec2 q = vUv;
  float r = length(q);
  float a;
  if (uShape == 0) {
    a = smoothstep(1.0, 0.0, r);
    a *= a;
  } else if (uShape == 1) {
    a = smoothstep(1.0, 0.0, r) * (1.0 - smoothstep(0.0, 1.0, r)*0.55);
  } else if (uShape == 2) {
    // 线状光斑
    float d = abs(q.y) + q.x*q.x*0.25;
    a = smoothstep(1.0, 0.0, d) * smoothstep(1.0, -0.2, q.x);
  } else {
    a = smoothstep(1.0, 0.0, r);
  }
  fragColor = vec4(vColor.rgb * vColor.a * a, vColor.a * a);
}`;

const VS_PLUME = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in mat4 iModel;
layout(location=6) in vec4 iColor;
uniform mat4 uViewProj;
out vec2 vUv;
out vec4 vColor;
out vec3 vWorld;
void main(){
  vec4 wp = iModel * vec4(aPos, 1.0);
  vUv = aUv;
  vColor = iColor;
  vWorld = wp.xyz;
  gl_Position = uViewProj * wp;
}`;

const FS_PLUME = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vColor;
in vec3 vWorld;
uniform vec3 uCamPos;
uniform float uTime;
out vec4 fragColor;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
void main(){
  float t = vUv.x;
  float r = abs(vUv.y*2.0-1.0);
  float n = noise(vec2(t*7.0 - uTime*9.0, vUv.y*3.0 + uTime*1.7));
  float core = smoothstep(1.0, 0.0, r);
  core *= core;
  float fade = pow(1.0 - t, 1.35);
  float a = core * fade * (0.55 + 0.75*n);
  vec3 c = mix(vColor.rgb, vec3(1.0,0.98,0.92), core*0.75);
  fragColor = vec4(c * a * vColor.a, a * vColor.a);
}`;

const VS_BEAM = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec2 vUv;
out vec3 vWorld;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  vUv = aUv;
  vWorld = wp.xyz;
  gl_Position = uViewProj * wp;
}`;

const FS_BEAM = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vWorld;
uniform vec3 uCamPos;
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
out vec4 fragColor;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
void main(){
  float ang = vUv.y*6.2831853;
  float core = pow(max(0.0, cos(ang)), 3.0);
  float t = vUv.x;
  float n = noise(vec2(t*40.0 - uTime*14.0, vUv.y*8.0));
  float n2 = noise(vec2(t*13.0 - uTime*5.0, vUv.y*3.0 + 5.0));
  float body = 0.55 + 0.75*n + 0.35*n2;
  float edge = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.9, t);
  float a = (core*1.6 + 0.25) * body * edge * uIntensity;
  vec3 c = mix(uColor, vec3(1.0), core*0.85);
  fragColor = vec4(c * a, a);
}`;

const VS_SHIELD = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat4 uModelRot;
out vec3 vWorld;
out vec3 vNormal;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(uModelRot) * aNrm);
  gl_Position = uViewProj * wp;
}`;

const FS_SHIELD = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
uniform vec3 uCamPos;
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
uniform float uPhase;
out vec4 fragColor;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec3 V = normalize(uCamPos - vWorld);
  float fres = pow(1.0 - abs(dot(V, normalize(vNormal))), 2.4);
  // 流动纹路（球面坐标）
  vec3 n = normalize(vNormal);
  float u = atan(n.z, n.x)*1.6;
  float v = asin(clamp(n.y,-1.0,1.0))*2.2;
  float flow = noise(vec2(u*3.0 + uTime*0.35, v*5.0 - uTime*0.5));
  flow += noise(vec2(u*7.0 - uTime*0.7, v*3.0 + uTime*0.3))*0.5;
  flow = smoothstep(0.45, 1.0, flow);
  // 扩散波纹
  float ripple = sin(length(vWorld)*0.22 - uTime*2.2 + uPhase)*0.5+0.5;
  ripple = pow(ripple, 6.0);
  float a = pow(fres, 1.5)*0.62 + flow*0.16 + ripple*0.13;
  a *= uOpacity;
  vec3 c = mix(uColor, vec3(1.0), fres*0.55 + flow*0.25);
  fragColor = vec4(c * a * 1.15, a);
}`;

/* ---------------- 后期 ---------------- */
const VS_QUAD = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID==1)?3.0:-1.0, (gl_VertexID==2)?3.0:-1.0);
  vUv = p*0.5+0.5;
  gl_Position = vec4(p, 1.0, 1.0);
}`;

const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uThreshold;
out vec4 fragColor;
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  float l = max(max(c.r,c.g),c.b);
  float k = max(0.0, l - uThreshold) / max(l, 1e-4);
  fragColor = vec4(c * k, 1.0);
}`;

const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 fragColor;
void main(){
  vec3 s = vec3(0.0);
  float w[5] = float[5](0.2270270, 0.1945946, 0.1216216, 0.0540540, 0.0162162);
  s += texture(uTex, vUv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    s += texture(uTex, vUv + uDir*float(i)).rgb * w[i];
    s += texture(uTex, vUv - uDir*float(i)).rgb * w[i];
  }
  fragColor = vec4(s, 1.0);
}`;

const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloomA;
uniform sampler2D uBloomB;
uniform float uExposure;
uniform float uBloom;
uniform float uVignette;
uniform vec2 uTexel;
out vec4 fragColor;
vec3 aces(vec3 x){
  const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}
void main(){
  vec2 d = vUv - 0.5;
  float ca = dot(d,d) * 0.0018;
  vec3 col;
  col.r = texture(uScene, vUv + d*ca).r;
  col.g = texture(uScene, vUv).g;
  col.b = texture(uScene, vUv - d*ca).b;
  vec3 bloom = texture(uBloomA, vUv).rgb*0.65 + texture(uBloomB, vUv).rgb*0.55;
  col += bloom * uBloom;
  col = aces(col * uExposure);
  col = pow(col, vec3(1.0/2.2));
  float v = smoothstep(1.05, 0.25, length(d)*1.25);
  col *= mix(1.0, v, uVignette);
  fragColor = vec4(col, 1.0);
}`;

const FS_FXAA = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
out vec4 fragColor;
void main(){
  vec3 rgbNW = texture(uTex, vUv + vec2(-1.0,-1.0)*uTexel).rgb;
  vec3 rgbNE = texture(uTex, vUv + vec2( 1.0,-1.0)*uTexel).rgb;
  vec3 rgbSW = texture(uTex, vUv + vec2(-1.0, 1.0)*uTexel).rgb;
  vec3 rgbSE = texture(uTex, vUv + vec2( 1.0, 1.0)*uTexel).rgb;
  vec3 rgbM  = texture(uTex, vUv).rgb;
  vec3 luma = vec3(0.299, 0.587, 0.114);
  float lNW = dot(rgbNW, luma), lNE = dot(rgbNE, luma), lSW = dot(rgbSW, luma), lSE = dot(rgbSE, luma), lM = dot(rgbM, luma);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0/128.0);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, -8.0, 8.0) * uTexel;
  vec3 rgbA = 0.5 * (texture(uTex, vUv + dir*(1.0/3.0 - 0.5)).rgb + texture(uTex, vUv + dir*(2.0/3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture(uTex, vUv + dir*-0.5).rgb + texture(uTex, vUv + dir*0.5).rgb);
  float lB = dot(rgbB, luma);
  fragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
}`;

/* ================================================================== */
function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.slice(0, 400));
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no webgl2');
    this.gl = gl;
    this.hasFloat = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.progVox = program(gl, VS_VOX, FS_VOX);
    this.progSky = program(gl, VS_SKY, FS_SKY);
    this.progSprite = program(gl, VS_SPRITE, FS_SPRITE);
    this.progPlume = program(gl, VS_PLUME, FS_PLUME);
    this.progBeam = program(gl, VS_BEAM, FS_BEAM);
    this.progShield = program(gl, VS_SHIELD, FS_SHIELD);
    this.progBright = program(gl, VS_QUAD, FS_BRIGHT);
    this.progBlur = program(gl, VS_QUAD, FS_BLUR);
    this.progComp = program(gl, VS_QUAD, FS_COMPOSITE);
    this.progFXAA = program(gl, VS_QUAD, FS_FXAA);
    this.emptyVAO = gl.createVertexArray();
    this.paletteTex = this._makePaletteTex();
    this._makeMeshes();
    this._makeTargets(1, 1);
  }
  _makePaletteTex() {
    const gl = this.gl;
    const pd = buildPaletteData();
    const t1 = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pd.a);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const t2 = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pd.b);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return [t1, t2];
  }
  _makeMeshes() {
    const gl = this.gl;
    // 四边形（用于精灵，实例化）
    const quad = new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]);
    const qvao = gl.createVertexArray(); gl.bindVertexArray(qvao);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(0, 0);
    gl.bindVertexArray(null);
    this.quadVAO = qvao;
    // 圆锥（尾焰）：沿 +X，x 0..1，半径 1..0
    const cone = this._lathe([[0, 1], [0.25, 0.92], [0.55, 0.62], [0.8, 0.3], [1, 0.0]], 12, true);
    this.coneMesh = cone;
    // 圆柱（光束）：沿 +X，x 0..1，半径 1
    const cyl = this._lathe([[0, 1], [1, 1]], 20, false);
    this.cylMesh = cyl;
    // 球体（护盾）
    this.sphereMesh = this._sphere(32, 20);
  }
  _lathe(profile, segs, capStart) {
    const gl = this.gl;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < profile.length; i++) {
      const [x, r] = profile[i];
      for (let j = 0; j <= segs; j++) {
        const a = j / segs * TAU;
        pos.push(x, Math.cos(a) * r, Math.sin(a) * r);
        uv.push(x, j / segs);
      }
    }
    for (let i = 0; i < profile.length - 1; i++) {
      for (let j = 0; j < segs; j++) {
        const a = i * (segs + 1) + j, b = a + segs + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return this._mesh(pos, uv, idx);
  }
  _sphere(segs, rings) {
    const pos = [], nrm = [], uv = [], idx = [];
    for (let i = 0; i <= rings; i++) {
      const v = i / rings, th = v * Math.PI;
      for (let j = 0; j <= segs; j++) {
        const u = j / segs, ph = u * TAU;
        const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
        pos.push(x, y, z); nrm.push(x, y, z); uv.push(u, v);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j, b = a + segs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    return this._mesh(pos, uv, idx, nrm);
  }
  _mesh(pos, uv, idx, nrm) {
    const gl = this.gl;
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ub = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ub);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    if (nrm) {
      const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nrm), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
    }
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, vb, ub, ib, count: idx.length };
  }
  _makeTargets(w, h) {
    const gl = this.gl;
    this.W = w; this.H = h;
    const mk = (w, h, fmt) => {
      const type = (fmt === gl.RGBA8) ? gl.UNSIGNED_BYTE : gl.HALF_FLOAT;
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const mkFBO = (tex, depth) => {
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      let rb = null;
      if (depth) {
        rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fbo: f, rb };
    };
    const fmt = this.hasFloat ? gl.RGBA16F : gl.RGBA8;
    this.texScene = mk(w, h, fmt);
    this.fboScene = mkFBO(this.texScene, true);
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    const qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
    const ew = Math.max(1, w >> 3), eh = Math.max(1, h >> 3);
    this.texBright = mk(hw, hh, fmt); this.fboBright = mkFBO(this.texBright, false);
    this.texBlurA = mk(qw, qh, fmt); this.fboBlurA = mkFBO(this.texBlurA, false);
    this.texBlurB = mk(qw, qh, fmt); this.fboBlurB = mkFBO(this.texBlurB, false);
    this.texBlurC = mk(ew, eh, fmt); this.fboBlurC = mkFBO(this.texBlurC, false);
    this.texBlurD = mk(ew, eh, fmt); this.fboBlurD = mkFBO(this.texBlurD, false);
    this.texLDR = mk(w, h, gl.RGBA8); this.fboLDR = mkFBO(this.texLDR, false);
    this.sizes = { hw, hh, qw, qh, ew, eh };
  }
  resize(w, h) {
    if (w === this.W && h === this.H) return;
    const gl = this.gl;
    for (const t of [this.texScene, this.texBright, this.texBlurA, this.texBlurB, this.texBlurC, this.texBlurD, this.texLDR]) gl.deleteTexture(t);
    for (const f of [this.fboScene, this.fboBright, this.fboBlurA, this.fboBlurB, this.fboBlurC, this.fboBlurD, this.fboLDR]) { gl.deleteFramebuffer(f.fbo); if (f.rb) gl.deleteRenderbuffer(f.rb); }
    this._makeTargets(w, h);
  }
  beginFrame(clearColor) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboScene.fbo);
    gl.viewport(0, 0, this.W, this.H);
    gl.clearColor(clearColor[0], clearColor[1], clearColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    if (window.__frontcw) gl.frontFace(gl.CW); else gl.frontFace(gl.CCW);
    if (!window.__nocull) { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); }
  }
  endFrame(opts) {
    const gl = this.gl;
    const s = this.sizes;
    // bright
    gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBright.fbo);
    gl.viewport(0, 0, s.hw, s.hh);
    gl.useProgram(this.progBright.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texScene);
    gl.uniform1i(this.progBright.u.uTex, 0);
    gl.uniform1f(this.progBright.u.uThreshold, opts.bloomThreshold || 1.0);
    gl.bindVertexArray(this.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
    // blur quarter
    const blur = (src, dst, w, h, dx, dy) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, w, h);
      gl.useProgram(this.progBlur.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform1i(this.progBlur.u.uTex, 0);
      gl.uniform2f(this.progBlur.u.uDir, dx / w, dy / h);
      gl.bindVertexArray(this.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    blur(this.texBright, this.fboBlurA, s.qw, s.qh, 1, 0);
    blur(this.texBlurA, this.fboBlurB, s.qw, s.qh, 0, 1);
    blur(this.texBlurB, this.fboBlurC, s.ew, s.eh, 1.4, 0);
    blur(this.texBlurC, this.fboBlurD, s.ew, s.eh, 0, 1.4);
    // composite -> LDR
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboLDR.fbo);
    gl.viewport(0, 0, this.W, this.H);
    gl.useProgram(this.progComp.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texScene);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texBlurB);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.texBlurD);
    gl.uniform1i(this.progComp.u.uScene, 0);
    gl.uniform1i(this.progComp.u.uBloomA, 1);
    gl.uniform1i(this.progComp.u.uBloomB, 2);
    gl.uniform1f(this.progComp.u.uExposure, opts.exposure || 1.0);
    gl.uniform1f(this.progComp.u.uBloom, opts.bloom || 0.6);
    gl.uniform1f(this.progComp.u.uVignette, opts.vignette !== undefined ? opts.vignette : 0.55);
    gl.bindVertexArray(this.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
    // fxaa -> screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.W, this.H);
    gl.useProgram(this.progFXAA.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texLDR);
    gl.uniform1i(this.progFXAA.u.uTex, 0);
    gl.uniform2f(this.progFXAA.u.uTexel, 1 / this.W, 1 / this.H);
    gl.bindVertexArray(this.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
