'use strict';
// ---------- GLSL 着色器 ----------
var SH = {};

SH.voxVS = `#version 300 es
precision highp float; precision highp int;
layout(location=0) in uvec4 aPos;
layout(location=1) in uint aCol;
layout(location=2) in uint aExtra;
uniform vec3 uOrigin; uniform mat3 uR; uniform vec3 uRel; uniform mat3 uV; uniform mat4 uP;
uniform float uFc; uniform float uTime;
#ifdef METEOR
uniform sampler2D uPiece;
#endif
out vec3 vPos; out vec3 vN; out vec2 vUV; out vec3 vCol; out float vAO; out vec3 vLoc; out float vHeat;
flat out uint vCls; flat out float vSh; flat out float vEmi; flat out vec3 vGlow; flat out uint vGrp; flat out uint vHash;
const vec3 FN[6] = vec3[6](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1));
const vec3 FU[6] = vec3[6](vec3(0,1,0),vec3(0,0,1),vec3(0,0,1),vec3(1,0,0),vec3(1,0,0),vec3(0,1,0));
const vec3 FV[6] = vec3[6](vec3(0,0,1),vec3(0,1,0),vec3(1,0,0),vec3(0,0,1),vec3(0,1,0),vec3(1,0,0));
float h31(vec3 p){ p = fract(p*0.1031); p += dot(p, p.yzx+33.33); return fract((p.x+p.y)*p.z); }
vec3 rotAxis(vec3 v, vec3 ax, float a){ float c=cos(a), s=sin(a); return v*c + cross(ax,v)*s + ax*dot(ax,v)*(1.0-c); }
void main(){
  uint pk = aPos.w;
  int f = int(pk & 7u);
  uint ao = (pk >> 3) & 255u;
  float a0 = float(ao & 3u), a1 = float((ao>>2)&3u), a2 = float((ao>>4)&3u), a3 = float((ao>>6)&3u);
  bool flip = (a0 + a3) < (a1 + a2);
  int cid = gl_VertexID;
  if (flip) { int m[4] = int[4](2,0,3,1); cid = m[cid]; }
  float cu = float(cid & 1), cv = float(cid >> 1);
  vec3 n = FN[f];
  vec3 base = vec3(aPos.xyz) + max(n, vec3(0.0));
  vec3 P = base + FU[f]*cu + FV[f]*cv;
  float av = cid==0 ? a0 : (cid==1 ? a1 : (cid==2 ? a2 : a3));
  vAO = av / 3.0;
  P += uOrigin;
  vec3 nn = n;
  vHeat = 0.0;
  vec3 voxC = vec3(aPos.xyz) + uOrigin;
  vec3 colRGB = vec3(float(aCol & 255u), float((aCol>>8)&255u), float((aCol>>16)&255u)) / 255.0;
  float emi = float((aCol >> 24) & 255u) / 255.0 * 6.0;
  uint cls = (pk >> 13) & 7u;
  bool dead = false;
#ifdef METEOR
  {
    int pid = int(aExtra & 65535u);
    uint fr = (aExtra >> 16) & 255u; uint tv = (aExtra >> 24) & 255u;
    vec4 t0 = texelFetch(uPiece, ivec2(pid,0), 0);
    vec4 t1 = texelFetch(uPiece, ivec2(pid,1), 0);
    vec4 t2 = texelFetch(uPiece, ivec2(pid,2), 0);
    vec4 t3 = texelFetch(uPiece, ivec2(pid,3), 0);
    float tau = max(0.0, uTime - t0.w);
    float k = max(t1.w, 0.001);
    float sp = (1.0 - exp(-k*tau)) / k;
    vec3 c = t0.xyz;
    vec3 q = P - c;
    float ang = t2.w * sp;
    q = rotAxis(q, t2.xyz, ang); nn = rotAxis(nn, t2.xyz, ang);
    P = c + q + t1.xyz * sp;
    if (tv < 255u) { float tr = t3.x + float(tv) * t3.y; if (uTime > tr) dead = true; }
    float heat = t3.w * smoothstep(t3.z, t0.w, uTime) * (1.0 - smoothstep(t0.w, t0.w + 3.0, uTime));
    float fa = 0.0;
    if (fr == 255u) { float age = uTime - t0.w; fa = age > 0.0 ? exp(-age/1.0) : 0.0; }
    else if (fr > 0u) { float age = uTime - (t3.x + float(fr)*t3.y); fa = age > 0.0 ? exp(-age/0.9) : 0.0; }
    vHeat = heat * 0.3 + fa * 0.8;
    vGrp = 0u; vGlow = vec3(0.0);
  }
#else
  vGrp = (aExtra >> 24) & 255u;
  vGlow = vec3(float(aExtra & 255u), float((aExtra>>8)&255u), float((aExtra>>16)&255u)) / 255.0;
#endif
  vLoc = P;
  vec3 pw = uR * P + uRel;
  vPos = pw;
  vN = uR * nn;
  vUV = vec2(cu, cv);
  vec3 lin = pow(colRGB, vec3(2.2));
  uint hs = uint(h31(voxC + vec3(float(f)*0.37)) * 255.0);
  vHash = hs;
  float hv = float(hs) / 255.0;
  float varia = 1.0 + (hv - 0.5) * 0.10;
  vCol = lin * varia;
  vEmi = emi;
  vCls = cls;
  vSh = float((pk >> 11) & 3u) / 3.0;
  vec3 pv = uV * pw;
  vec4 cp = uP * vec4(pv, 1.0);
  cp.z = (log2(max(1e-6, 1.0 + cp.w)) * uFc - 1.0) * cp.w;
  if (dead) cp = vec4(2.0, 2.0, 2.0, 1.0);
  gl_Position = cp;
}
`;

SH.voxFS = `#version 300 es
precision highp float; precision highp int;
in vec3 vPos; in vec3 vN; in vec2 vUV; in vec3 vCol; in float vAO; in vec3 vLoc; in float vHeat;
flat in uint vCls; flat in float vSh; flat in float vEmi; flat in vec3 vGlow; flat in uint vGrp; flat in uint vHash;
uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSkyAmb; uniform vec3 uGndAmb; uniform float uAmbK;
uniform float uTime;
uniform int uNL; uniform vec4 uLP[16]; uniform vec3 uLC[16];
uniform float uGroup[8];
uniform float uGlowK; uniform float uFog; uniform vec3 uFogCol; uniform float uEmiK;
uniform vec4 uShieldTint; uniform vec2 uWave; // 盾色/强度；波前位置/宽度
uniform float uTransPass; uniform float uFlicker; uniform float uFade;
uniform vec3 uHeatCol;
out vec4 outColor;
float h31(vec3 p){ p = fract(p*0.1031); p += dot(p, p.yzx+33.33); return fract((p.x+p.y)*p.z); }
void main(){
  if (uFade < 0.999) { float hh = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453); if (hh > uFade) discard; }
  vec3 N = normalize(vN);
  vec3 V = normalize(-vPos);
  float dist = length(vPos);
  vec3 alb = vCol;
  // 体素边缘：近处可见，远处淡出
  vec2 uv = vUV;
  float e = min(min(uv.x, 1.0-uv.x), min(uv.y, 1.0-uv.y));
  float w = fwidth(uv.x) + fwidth(uv.y);
  float fadeE = 1.0 - smoothstep(0.12, 0.5, w);
  float edge = 1.0 - smoothstep(0.0, 0.085, e);
  float ao = mix(0.22, 1.0, vAO);
  ao = mix(1.0, ao, 1.0 - 0.6*smoothstep(0.3, 1.2, w));
  float emi = vEmi;
  if (vGrp > 0u) { float gk = uGroup[min(int(vGrp), 7)]; if (gk < 0.0) discard; emi *= gk; }
  uint cls = vCls;
  if (uTransPass > 0.5 && cls != 4u) discard;
  if (cls == 4u) {
    // 透明发光构件：叠加，保留体素边缘
    float rimf = pow(1.0 - abs(dot(N, V)), 1.5);
    float cellg = 0.55 + 0.45*(1.0 - edge*fadeE*0.8);
    vec3 c = vCol * emi * cellg * (0.45 + 0.9*rimf) * uEmiK;
    float fg = exp(-dist * uFog);
    outColor = vec4(c * fg * 0.55, 1.0);
    return;
  }
  float ndl = dot(N, uSun);
  float shadow = vSh;
  float wrap = (cls == 0u) ? 0.35 : 0.1;
  float diff = clamp((ndl + wrap)/(1.0+wrap), 0.0, 1.0);
  diff = (cls == 0u) ? mix(diff, diff*diff*(3.0-2.0*diff), 0.4) : diff;
  vec3 sun = uSunCol * diff * shadow;
  vec3 amb = mix(uGndAmb, uSkyAmb, N.y*0.5+0.5) * uAmbK;
  if (cls == 5u) amb *= 1.7;
  vec3 lighting = (sun + amb) * ao;
  // 动态灯光
  vec3 dyn = vec3(0.0);
  vec3 spec = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uNL) break;
    vec3 d = uLP[i].xyz - vPos;
    float r = uLP[i].w;
    float dd = length(d);
    if (dd > r) continue;
    vec3 ld = d / max(dd, 1e-3);
    float att = 1.0 - dd/r; att = att*att;
    float nl = clamp(dot(N, ld)*0.8 + 0.2, 0.0, 1.0);
    dyn += uLC[i] * att * nl;
    vec3 hh = normalize(ld + V);
    float ns = max(dot(N, hh), 0.0);
    spec += uLC[i] * att * (cls == 2u ? pow(ns, 40.0)*0.9 : pow(ns, 12.0)*0.12);
  }
  lighting += dyn * ao;
  vec3 col = alb * lighting;
  // 高光
  vec3 H = normalize(uSun + V);
  float nh = max(dot(N, H), 0.0);
  float sf = shadow * clamp(ndl*3.0, 0.0, 1.0);
  if (cls == 0u) {
    col += uSunCol * (pow(nh, 9.0) * 0.10 + pow(nh, 38.0)*0.10) * sf * ao;
    float fr = pow(1.0 - max(dot(N,V),0.0), 3.0);
    col += uSkyAmb * fr * 0.35 * ao * uAmbK;
  } else if (cls == 2u) {
    col += uSunCol * (pow(nh, 70.0) * 1.8 + pow(nh, 14.0)*0.2) * sf * ao;
    float fr = pow(1.0 - max(dot(N,V),0.0), 2.0);
    col += (uSkyAmb*uAmbK + vec3(0.04)) * fr * 0.9 * ao;
  } else if (cls == 1u) {
    col += uSunCol * pow(nh, 20.0) * 0.12 * sf * ao;
  } else if (cls == 5u) {
    col += uSunCol * pow(nh, 14.0) * 0.04 * sf;
  }
  col += spec * (cls == 2u ? 1.0 : 0.6);
  // 发光
  float flick = 1.0;
  if (cls == 6u) {
    float ph = float(vHash) * 0.37;
    flick = 0.78 + 0.22*sin(uTime*(1.6 + float(vHash&7u)*0.4) + ph) ;
    flick *= mix(0.85, 1.0, step(0.5, fract(float(vHash)*0.173 + floor(uTime*1.5)*0.31)));
  }
  float emiAdd = emi * flick * uEmiK;
  vec3 emiCol = alb;
  col += emiCol * emiAdd * (cls == 3u ? 1.0 : 0.5);
  // 烘焙发光溢出
  col += alb * vGlow * uGlowK * 3.5 * ao;
  // 陨石受击热
  if (vHeat > 0.0) { col += uHeatCol * vHeat * (0.6 + 0.4*(1.0-edge*fadeE)) * 1.5; }
  // 盾光
  if (uShieldTint.w > 0.0) {
    float wv = exp(-pow((vLoc.x - uWave.x)/max(uWave.y,1.0), 2.0));
    col += uShieldTint.rgb * (uShieldTint.w * (0.10 + 0.55*wv)) * (0.35 + 0.65*max(ndl, 0.0)+0.2) * (0.5 + 0.5*ao);
  }
  // 边缘线
  float edgeAmt = edge * fadeE;
  col *= mix(1.0, 0.72, edgeAmt * (cls == 3u ? 0.35 : 1.0));
  if (cls == 2u) col += uSunCol * edge * fadeE * 0.12 * shadow * (0.2 + diff);
  // 空间雾（近似散射）
  float fg = 1.0 - exp(-dist * uFog);
  col = mix(col, uFogCol, fg);
  outColor = vec4(col, 1.0);
}
`;

// ---------- 粒子/光效 ----------
SH.sprVS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aP;
layout(location=1) in vec2 aS;
layout(location=2) in vec3 aA;
layout(location=3) in vec4 aC;
layout(location=4) in vec4 aT;
uniform mat3 uV; uniform mat4 uP; uniform float uFc;
out vec2 vQ; out vec4 vC; flat out vec4 vT; out float vLen; out float vVis; out float vHalf;
void main(){
  vec2 q = vec2((gl_VertexID & 1) == 0 ? -1.0 : 1.0, (gl_VertexID >> 1) == 0 ? -1.0 : 1.0);
  vec3 pv = uV * aP;
  vec3 av = uV * aA;
  float al = length(av);
  vec3 pos;
  if (al < 1e-5) {
    pos = pv + vec3(q * aS.x, 0.0);
  } else {
    vec3 ad = av / al;
    vec3 pe = pv + ad * (q.x * aS.x);
    vec3 side = cross(ad, normalize(pe));
    float sl = length(side);
    if (sl < 1e-3) side = vec3(1,0,0) ; else side /= sl;
    pos = pe + side * (q.y * aS.y);
  }
  vQ = q; vC = aC; vT = aT; vLen = aS.x / max(aS.y, 1e-4); vHalf = aS.x;
  vVis = smoothstep(1.0, 16.0, -pos.z);
  vec4 cp = uP * vec4(pos, 1.0);
  cp.z = (log2(max(1e-6, 1.0 + cp.w)) * uFc - 1.0) * cp.w;
  gl_Position = cp;
}
`;

SH.sprFS = `#version 300 es
precision highp float;
in vec2 vQ; in vec4 vC; flat in vec4 vT; in float vLen; in float vHalf; in float vVis;
uniform float uTime;
out vec4 outColor;
float h11(float n){ return fract(sin(n*12.9898)*43758.5453); }
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x), mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y); }
void main(){
  int type = int(vT.x + 0.5);
  float r2 = dot(vQ, vQ);
  float I = 0.0; vec3 col = vC.rgb;
  float sd = vT.y;
  if (type == 0) { // 柔光圆斑
    float r = sqrt(r2); if (r > 1.0) discard;
    I = exp(-r2 * 5.0) * 0.9 + pow(1.0 - r, 3.0) * 0.5;
    I *= smoothstep(1.0, 0.8, r);
  } else if (type == 1) { // 通用线段：沿长度的头部亮、尾部淡
    float u = clamp(vQ.x*0.5+0.5, 0.0, 1.0); float v = abs(vQ.y);
    float prof = pow(clamp(u, 0.0, 1.0), vT.z);
    float across = exp(-v*v*4.5);
    float core = exp(-v*v*30.0);
    I = (across*0.6 + core*0.8) * prof * smoothstep(0.0, 0.06, u) ;
    col = mix(col, vec3(1.0), core * 0.55 * prof);
  } else if (type == 2) { // 冲击环
    float r = sqrt(r2); float w = max(vT.z, 0.02);
    I = exp(-pow((r - 0.8)/ w, 2.0)) * (1.0 - smoothstep(0.85, 1.0, r));
    col = mix(col, vec3(1.0), 0.3*I);
  } else if (type == 3) { // 星芒
    float r = sqrt(r2);
    float sx = exp(-abs(vQ.y)*24.0) * exp(-abs(vQ.x)*2.6);
    float sy = exp(-abs(vQ.x)*24.0) * exp(-abs(vQ.y)*2.6);
    I = exp(-r2*9.0)*0.8 + (sx + sy)*0.5 * vT.z + exp(-r2*40.0);
    I *= smoothstep(1.0, 0.7, r);
  } else if (type == 4) { // 光束
    float u = clamp(vQ.x*0.5+0.5, 0.0, 1.0); float v = abs(vQ.y);
    float t = uTime;
    // 沿射向流动的细纹 + 粗细脉动
    float flowU = abs(vT.w) + u * 2.0 * vHalf;
    float flow = vn(vec2(flowU*0.16 - t*vT.z*3.0, vQ.y*5.0 + sd)) ;
    float flow2 = vn(vec2(flowU*0.5 - t*vT.z*7.0, vQ.y*11.0 + sd*3.1));
    float pul = 0.86 + 0.14*sin(t*18.0 + sd) ;
    float core = exp(-v*v*38.0 / max(pul*pul, 0.1));
    float mid = exp(-v*v*7.0);
    float halo = exp(-v*v*2.2);
    float streak = mix(0.7, 1.0, flow) * mix(0.8, 1.0, flow2);
    float taper = (vT.w < 0.0) ? smoothstep(0.0, 0.02, 1.0-u) : 1.0;
    I = (core*1.5 + mid*0.7*streak + halo*0.2) * taper;
    col = mix(col, vec3(1.0), clamp(core*0.9, 0.0, 1.0));
  } else if (type == 5) { // 推进尾焰：u 从喷口(0)到末端(1)
    float u = clamp(vQ.x*0.5+0.5, 0.0, 1.0); float v = vQ.y;
    float t = uTime;
    float wid = mix(1.0, 0.18, pow(u, 0.85));
    float vv = abs(v) / max(wid, 0.02);
    float turb = vn(vec2(u*vLen*0.3 - t*vT.z*4.0, v*3.0 + sd*7.0));
    float turb2 = vn(vec2(u*vLen*0.9 - t*vT.z*9.0, v*8.0 + sd*13.0));
    float body = exp(-vv*vv*2.4) * (0.75 + 0.5*turb);
    float core = exp(-vv*vv*9.0) * exp(-u*3.2);
    float fade = pow(1.0 - u, 1.7) * smoothstep(0.0, 0.02, u);
    I = (body*0.9 * (0.7+0.5*turb2) + core*1.6) * fade;
    col = mix(col, vec3(1.0), clamp(core*0.8, 0.0, 1.0));
    I *= step(abs(v), 1.0);
  } else if (type == 6) { // 导弹/拖尾：u=0 尾端 → u=1 头部
    float u = clamp(vQ.x*0.5+0.5, 0.0, 1.0); float v = abs(vQ.y);
    float t = uTime;
    float dens = vn(vec2(u*vLen*0.22 + sd*5.0, vQ.y*2.0 + t*0.6));
    float width = mix(0.8, 1.0, u);
    float vv = v / width;
    float body = exp(-vv*vv*3.5) * pow(u, vT.z);
    float core = exp(-vv*vv*22.0) * pow(u, vT.z*1.5);
    I = (body*(0.45+0.9*dens) + core*0.9) * smoothstep(0.0, 0.04, u);
    col = mix(col, vec3(1.0), core*0.5);
  } else if (type == 7) { // 近防弹迹：断续短亮线
    float u = clamp(vQ.x*0.5+0.5, 0.0, 1.0); float v = abs(vQ.y);
    float seg = fract(u * vT.z + vT.y);
    float dash = smoothstep(0.0, 0.1, seg) * (1.0 - smoothstep(0.35, 0.5, seg));
    float across = exp(-v*v*9.0);
    I = across * dash * (0.4 + 0.6*pow(u, 1.2)) * 1.4;
    col = mix(col, vec3(1.0), across*dash*0.4);
  } else if (type == 8) { // 菱形火花/小亮点
    float r = sqrt(r2); if (r > 1.0) discard;
    I = pow(1.0 - r, 2.0);
  } else if (type == 9) { // 爆闪球：带噪声的边缘
    float r = sqrt(r2); if (r > 1.0) discard;
    float n = vn(vec2(atan(vQ.y, vQ.x)*2.0 + sd, r*3.0));
    float rr = r * (0.8 + 0.4*n);
    I = pow(max(1.0 - rr, 0.0), 1.8) * 1.3;
    col = mix(col, vec3(1.0), pow(max(1.0 - r, 0.0), 3.0));
  }
  float a = vC.a;
  outColor = vec4(col * I * a * vVis, 1.0);
}
`;

// ---------- 护盾 ----------
SH.shVS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat3 uM; uniform vec3 uRel; uniform mat3 uV; uniform mat4 uP; uniform float uFc;
out vec3 vL; out vec3 vN; out vec3 vPos;
void main(){
  vL = aPos;
  vec3 pw = uM * aPos + uRel;
  vPos = pw;
  vN = normalize(uM * aPos); // 近似
  vec3 pv = uV * pw;
  vec4 cp = uP * vec4(pv, 1.0);
  cp.z = (log2(max(1e-6, 1.0 + cp.w)) * uFc - 1.0) * cp.w;
  gl_Position = cp;
}
`;
SH.shFS = `#version 300 es
precision highp float;
in vec3 vL; in vec3 vN; in vec3 vPos;
uniform vec4 uS;   // x: 强度, y: 展开进度(0..1.4), z: 时间, w: 种子
uniform vec3 uCol; uniform float uCell; uniform vec3 uRelLight;
out vec4 outColor;
vec3 h33(vec3 p){ p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6))); return fract(sin(p)*43758.5453123); }
vec2 voro(vec3 p){
  vec3 ip = floor(p), fp = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int k=-1;k<=1;k++) for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++){
    vec3 g = vec3(float(i),float(j),float(k));
    vec3 o = h33(ip+g + uS.w*7.0);
    vec3 r = g + 0.5 + 0.5*sin(uS.z*0.5712 + 6.2831*o) - fp;
    float d = dot(r,r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d1), sqrt(d2));
}
void main(){
  vec3 n = normalize(vL);
  vec3 V = normalize(-vPos);
  float fr = 1.0 - abs(dot(normalize(vN), V));
  float rim = pow(fr, 2.4);
  vec2 vr = voro(n * uCell);
  float edge = 1.0 - smoothstep(0.0, 0.11, vr.y - vr.x);
  float cellglow = (1.0 - smoothstep(0.0, 0.5, vr.x)) * 0.10;
  // 沿曲面滑过的亮边
  float sl = 0.5 + 0.5*sin(n.x*7.0 - uS.z*2.2848 + n.y*3.0);
  float slide = pow(sl, 12.0);
  // 展开亮波：从舰首(x=+1)到舰尾(x=-1)
  float s = 0.5 - 0.5*n.x;
  float p = uS.y;
  float reveal = 1.0 - smoothstep(p - 0.35, p, s);
  float front = exp(-pow((s - p + 0.04)/0.07, 2.0));
  float after = exp(-max(0.0, p - s)*2.2); // 波后余辉
  float I = (edge*0.9 + cellglow + rim*0.55 + slide*0.5*edge) * (0.55 + 0.45*reveal) * reveal;
  I += front * (0.9 + rim*0.8);
  I += after * rim * 0.25 * reveal;
  // 稳定态细微流动
  I *= 0.82 + 0.18*sin(uS.z*1.7136 + n.y*6.0 + n.z*4.0);
  float k = uS.x;
  vec3 c = uCol * I * k;
  outColor = vec4(c, 1.0);
}
`;

// ---------- 天空 ----------
SH.skyVS = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p*2.0-1.0, 0.9999, 1.0);
}
`;
SH.skyFS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform mat3 uV; uniform vec2 uTan; uniform vec3 uSun; uniform float uTime; uniform vec3 uTint;
uniform float uSkyK; uniform vec3 uPlanetDir;
out vec4 outColor;
float h31(vec3 p){ p = fract(p*0.1031); p += dot(p, p.yzx+33.33); return fract((p.x+p.y)*p.z); }
float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x), f.y), f.z); }
float fbm(vec3 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
vec3 stars(vec3 d, float scale, float thr, float size){
  vec3 p = d * scale; vec3 ip = floor(p); vec3 fp = fract(p);
  vec3 acc = vec3(0.0);
  for (int k=-1;k<=1;k++) for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++){
    vec3 g = vec3(float(i),float(j),float(k));
    vec3 c = ip + g;
    float h = h31(c);
    if (h < thr) continue;
    vec3 o = vec3(h31(c+11.3), h31(c+27.1), h31(c+43.7));
    vec3 q = g + o - fp;
    float dd = length(q);
    float br = pow((h - thr)/(1.0 - thr), 2.2);
    float s = exp(-dd*dd/(size*size)) * (0.2 + 2.2*br);
    float tw = 0.85 + 0.15*sin(uTime*(0.5+h*2.0) + h*40.0);
    vec3 tint = mix(vec3(0.7,0.85,1.0), vec3(1.0,0.85,0.65), h31(c+5.5));
    acc += tint * s * tw;
  }
  return acc;
}
void main(){
  vec2 ndc = vUv*2.0 - 1.0;
  vec3 dv = normalize(vec3(ndc.x * uTan.x, ndc.y * uTan.y, -1.0));
  vec3 d = dv * uV; // 世界方向（uV 的转置乘）
  vec3 col = vec3(0.0);
  // 基础渐变
  float up = d.y;
  col += mix(vec3(0.004,0.006,0.016), vec3(0.008,0.012,0.03), up*0.5+0.5);
  // 星云：两层 fbm，沿一条倾斜的带分布
  vec3 bandN = normalize(vec3(0.25, 0.8, -0.35));
  float band = exp(-pow(dot(d, bandN)*2.6, 2.0));
  float n1 = fbm(d*2.2 + vec3(3.0, 1.0, 7.0));
  float n2 = fbm(d*5.0 + n1*2.0);
  float neb = smoothstep(0.35, 0.85, n1) * (0.35 + 0.9*band);
  vec3 c1 = vec3(0.10, 0.12, 0.42), c2 = vec3(0.42, 0.10, 0.36), c3 = vec3(0.08, 0.36, 0.42);
  vec3 nebc = mix(c1, c2, smoothstep(0.3, 0.8, n2));
  nebc = mix(nebc, c3, smoothstep(0.45, 0.9, fbm(d*3.1 + 13.0)));
  col += nebc * neb * 0.55;
  // 暗尘带
  float dust = smoothstep(0.5, 0.8, fbm(d*4.0 + 21.0)) * band;
  col *= 1.0 - dust*0.55;
  // 银河星点
  col += stars(d, 60.0, 0.82, 0.12) * 0.65;
  col += stars(d, 140.0, 0.90, 0.16) * 0.55;
  col += stars(d, 300.0, 0.95, 0.2) * 0.75 * (0.4 + band);
  // 密集远星
  float dense = vn(d*500.0); col += vec3(0.6,0.7,1.0) * pow(max(dense - 0.82, 0.0)*5.5, 2.0) * (0.15 + band*0.6);
  // 行星
  float ang = acos(clamp(dot(d, uPlanetDir), -1.0, 1.0));
  float prad = 0.50;
  if (ang < prad + 0.02) {
    vec3 pd = uPlanetDir;
    vec3 t1 = normalize(cross(pd, vec3(0,1,0))), t2 = cross(pd, t1);
    vec3 pr = d - pd*dot(d, pd);
    vec2 q = vec2(dot(pr, t1), dot(pr, t2)) / sin(prad);
    float rq = length(q);
    if (rq < 1.0) {
      float zz = sqrt(1.0 - rq*rq);
      vec3 nrm = normalize(t1*q.x + t2*q.y - pd*zz);
      vec3 Lp = normalize(vec3(0.74, 0.30, 0.42));
      float lit = clamp(dot(nrm, Lp)*1.2 + 0.05, 0.0, 1.0);
      float bands = sin(nrm.y*14.0 + fbm(nrm*3.0)*3.0)*0.5+0.5;
      vec3 pc = mix(vec3(0.16,0.30,0.40), vec3(0.55,0.38,0.30), bands);
      pc = mix(pc, vec3(0.7,0.62,0.5), smoothstep(0.55,0.9,fbm(nrm*6.0))*0.35);
      float limb = pow(1.0 - zz, 2.5);
      col = pc * lit * 0.66 + vec3(0.2,0.45,0.7)*limb*(0.15+lit)*1.1 + (vec3(0.025,0.045,0.085) + vec3(0.03,0.04,0.07)*bands + vec3(0.04,0.03,0.06)*fbm(nrm*9.0))*(1.0-lit);
    } else {
      float glow = exp(-(rq-1.0)*38.0);
      float litA = clamp(dot(normalize(pr), normalize(vec3(0.74, 0.30, 0.42)))*0.5+0.5, 0.0, 1.0);
      col += vec3(0.25,0.55,0.95) * glow * (0.2+1.5*litA);
    }
  }
  // 恒星
  float sd = max(dot(d, uSun), 0.0);
  float disc = smoothstep(0.99955, 0.99985, sd);
  col += vec3(1.0, 0.93, 0.78) * (disc*40.0 + pow(sd, 400.0)*6.0 + pow(sd, 40.0)*0.7 + pow(sd, 6.0)*0.06);
  col *= uTint * uSkyK;
  outColor = vec4(col, 1.0);
}
`;

// ---------- 后处理 ----------
SH.fsVS = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUv = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }
`;
SH.downFS = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uFirst;
out vec4 outColor;
vec3 smp(vec2 uv){ return texture(uTex, uv).rgb; }
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
void main(){
  vec2 t = uTexel;
  vec3 a = smp(vUv + t*vec2(-2,-2)), b = smp(vUv + t*vec2(0,-2)), c = smp(vUv + t*vec2(2,-2));
  vec3 d = smp(vUv + t*vec2(-2,0)), e = smp(vUv), f = smp(vUv + t*vec2(2,0));
  vec3 g = smp(vUv + t*vec2(-2,2)), h = smp(vUv + t*vec2(0,2)), i = smp(vUv + t*vec2(2,2));
  vec3 j = smp(vUv + t*vec2(-1,-1)), k = smp(vUv + t*vec2(1,-1)), l = smp(vUv + t*vec2(-1,1)), m = smp(vUv + t*vec2(1,1));
  vec3 r;
  if (uFirst > 0.5) {
    // Karis 加权，抑制萤火虫
    vec3 g0 = (a+b+d+e)*0.25, g1 = (b+c+e+f)*0.25, g2 = (d+e+g+h)*0.25, g3 = (e+f+h+i)*0.25, g4 = (j+k+l+m)*0.25;
    float w0 = 1.0/(1.0+luma(g0)), w1 = 1.0/(1.0+luma(g1)), w2 = 1.0/(1.0+luma(g2)), w3 = 1.0/(1.0+luma(g3)), w4 = 1.0/(1.0+luma(g4));
    r = (g0*w0*0.125 + g1*w1*0.125 + g2*w2*0.125 + g3*w3*0.125 + g4*w4*0.5) / (w0*0.125+w1*0.125+w2*0.125+w3*0.125+w4*0.5);
  } else {
    r = e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125;
  }
  if (uFirst > 0.5) { float br = max(max(r.r, r.g), r.b); r *= max(br - 0.85, 0.0) / max(br, 0.001); }
  outColor = vec4(r, 1.0);
}
`;
SH.upFS = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uRadius;
out vec4 outColor;
void main(){
  vec2 t = uTexel * uRadius;
  vec3 c = texture(uTex, vUv).rgb * 4.0;
  c += texture(uTex, vUv + vec2(-t.x, 0)).rgb * 2.0; c += texture(uTex, vUv + vec2(t.x, 0)).rgb * 2.0;
  c += texture(uTex, vUv + vec2(0, -t.y)).rgb * 2.0; c += texture(uTex, vUv + vec2(0, t.y)).rgb * 2.0;
  c += texture(uTex, vUv + vec2(-t.x,-t.y)).rgb; c += texture(uTex, vUv + vec2(t.x,-t.y)).rgb;
  c += texture(uTex, vUv + vec2(-t.x, t.y)).rgb; c += texture(uTex, vUv + vec2(t.x, t.y)).rgb;
  outColor = vec4(c / 16.0, 1.0);
}
`;
SH.compFS = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uHdr; uniform sampler2D uBloom; uniform float uBloomK; uniform float uExposure;
uniform vec2 uRes; uniform float uTime; uniform float uVig; uniform vec3 uLift;
out vec4 outColor;
vec3 aces(vec3 x){ const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
float h21(vec2 p){ p = fract(p*vec2(443.897, 441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
void main(){
  vec3 c = texture(uHdr, vUv).rgb;
  vec3 b = texture(uBloom, vUv).rgb;
  c += b * uBloomK;
  c *= uExposure;
  // 轻微冷暖分离：暗部偏青蓝、亮部偏暖
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  c = mix(c, c * uLift, 0.0);
  vec3 t = aces(c);
  // 亮部颜色过渡：高亮区保持色彩，不直接洗白
  t = mix(t, aces(c * vec3(1.0, 0.97, 0.94)), 0.0);
  vec2 q = vUv - 0.5;
  float vg = 1.0 - uVig * dot(q, q) * 1.6;
  t *= vg;
  t = pow(t, vec3(1.0/2.2));
  t += (h21(vUv*uRes + fract(uTime)*91.0) - 0.5) / 255.0 * 1.2;
  outColor = vec4(t, 1.0);
}
`;

// ---------- 碎块体素（单格立方体，实例化） ----------
SH.cubeVS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aP;
layout(location=1) in vec4 aA;
layout(location=2) in vec4 aC;
uniform mat3 uV; uniform mat4 uP; uniform float uFc;
out vec3 vN; out vec3 vCol; out float vHeat; out vec2 vUV; out vec3 vPos;
const vec3 FN[6] = vec3[6](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1));
const vec3 FU[6] = vec3[6](vec3(0,1,0),vec3(0,0,1),vec3(0,0,1),vec3(1,0,0),vec3(1,0,0),vec3(0,1,0));
const vec3 FV[6] = vec3[6](vec3(0,0,1),vec3(0,1,0),vec3(1,0,0),vec3(0,0,1),vec3(0,1,0),vec3(1,0,0));
vec3 rotAxis(vec3 v, vec3 ax, float a){ float c=cos(a), s=sin(a); return v*c + cross(ax,v)*s + ax*dot(ax,v)*(1.0-c); }
void main(){
  int f = gl_VertexID / 6; int k = gl_VertexID % 6;
  int idx[6] = int[6](0,1,2,2,1,3);
  int c = idx[k];
  float cu = float(c & 1), cv = float(c >> 1);
  vec3 n = FN[f];
  vec3 p = (n * 0.5 + (cu - 0.5) * FU[f] + (cv - 0.5) * FV[f]) * aP.w;
  p = rotAxis(p, aA.xyz, aA.w);
  vec3 nn = rotAxis(n, aA.xyz, aA.w);
  vec3 pw = aP.xyz + p;
  vPos = pw; vN = nn; vCol = aC.rgb; vHeat = aC.a; vUV = vec2(cu, cv);
  vec3 pv = uV * pw;
  vec4 cp = uP * vec4(pv, 1.0);
  cp.z = (log2(max(1e-6, 1.0 + cp.w)) * uFc - 1.0) * cp.w;
  gl_Position = cp;
}
`;
SH.cubeFS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vCol; in float vHeat; in vec2 vUV; in vec3 vPos;
uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSkyAmb; uniform vec3 uGndAmb;
out vec4 outColor;
void main(){
  vec3 N = normalize(vN);
  float nl = max(dot(N, uSun), 0.0);
  vec3 amb = mix(uGndAmb, uSkyAmb, N.y*0.5+0.5);
  vec3 col = vCol * (uSunCol * nl + amb);
  float e = min(min(vUV.x, 1.0-vUV.x), min(vUV.y, 1.0-vUV.y));
  float edge = 1.0 - smoothstep(0.0, 0.09, e);
  col *= 1.0 - 0.28*edge*(1.0 - smoothstep(0.1, 0.4, fwidth(vUV.x)+fwidth(vUV.y)));
  col += vec3(1.0, 0.42, 0.12) * vHeat * 1.9 * (0.6 + 0.4*(1.0-edge));
  outColor = vec4(col, 1.0);
}
`;
