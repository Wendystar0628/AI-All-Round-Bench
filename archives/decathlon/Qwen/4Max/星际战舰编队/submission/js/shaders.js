/* GLSL 着色器集合 */
'use strict';
SF.SH = {};

SF.SH.fullV = `#version 300 es
layout(location=0) in vec2 aP;
out vec2 vUv;
void main(){ vUv = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.9999, 1.0); }`;

/* ---------- 体素 ---------- */
SF.SH.voxelV = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 iPos;
layout(location=3) in vec3 iColor;
layout(location=4) in vec3 iAux;
uniform mat4 uVP, uModel;
out vec3 vN, vW, vC, vA;
void main(){
  vec4 w = uModel * vec4(aPos + iPos, 1.0);
  vW = w.xyz; vN = mat3(uModel) * aNorm; vC = iColor; vA = iAux;
  gl_Position = uVP * w;
}`;

SF.SH.voxelF = `#version 300 es
precision highp float;
in vec3 vN, vW, vC, vA;
uniform vec3 uCam, uKeyDir, uKeyCol, uAmbUp, uAmbDn, uFogCol;
uniform float uFogDen, uTime, uPulse, uHeat;
uniform vec4 uL[8];
uniform vec3 uLC[8];
uniform float uLR[8];
uniform int uLN;
out vec4 frag;
void main(){
  vec3 n = normalize(vN);
  vec3 v = normalize(uCam - vW);
  float ao = vA.x;
  float wrap = clamp((dot(n, uKeyDir) + 0.42) / 1.42, 0.0, 1.0);
  vec3 amb = mix(uAmbDn, uAmbUp, n.y * 0.5 + 0.5);
  vec3 col = vC * (uKeyCol * wrap * 1.3 + amb * 0.6) * ao;
  vec3 h = normalize(uKeyDir + v);
  float nh = max(dot(n, h), 0.0);
  col += uKeyCol * (pow(nh, 10.0) * 0.09 + pow(nh, 64.0) * 0.38) * ao;
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += vec3(0.32, 0.46, 0.6) * fres * 0.17 * ao;
  for (int i = 0; i < 8; i++) {
    if (i >= uLN) break;
    vec3 L = uL[i].xyz - vW;
    float d = length(L);
    float att = uL[i].w * pow(max(1.0 - d / uLR[i], 0.0), 2.0);
    col += vC * uLC[i] * att * max(dot(n, L / max(d, 0.001)), 0.0) * ao;
  }
  float em = vA.y * uPulse;
  float flow = 0.82 + 0.18 * sin(uTime * 2.2 + vW.y * 0.05 + vW.z * 0.017);
  col += vC * em * 2.3 * flow;
  col += vec3(1.0, 0.42, 0.13) * vA.z * uHeat * 2.6;
  float dist = length(uCam - vW);
  float f = (1.0 - exp(-dist * uFogDen)) * clamp(1.0 - em * 0.45, 0.25, 1.0);
  col = mix(col, uFogCol, f);
  frag = vec4(col, 1.0);
}`;

/* ---------- 宇宙背景 ---------- */
SF.SH.bgF = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uRight, uUp, uFwd, uKeyDir;
uniform float uTan, uAspect, uTime;
out vec4 frag;
float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = h13(i), b = h13(i + vec3(1,0,0)), c = h13(i + vec3(0,1,0)), d = h13(i + vec3(1,1,0));
  float e = h13(i + vec3(0,0,1)), g = h13(i + vec3(1,0,1)), h = h13(i + vec3(0,1,1)), k = h13(i + vec3(1,1,1));
  return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,g,f.x), mix(h,k,f.x), f.y), f.z);
}
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.13 + 7.7; a *= 0.5; } return s; }
vec3 stars(vec3 d, float scale, float thr, float gain){
  vec3 p = d * scale; vec3 id = floor(p); vec3 f = fract(p) - 0.5;
  float h = h13(id);
  if (h < thr) return vec3(0.0);
  vec3 off = vec3(h13(id + 1.7), h13(id + 9.3), h13(id + 5.1)) - 0.5;
  float dist = length(f - off * 0.6);
  float b = smoothstep(0.10, 0.0, dist) * (h - thr) / (1.0 - thr);
  float tw = 0.8 + 0.2 * sin(uTime * 1.5 + h * 40.0);
  vec3 tint = mix(vec3(0.7, 0.85, 1.0), vec3(1.0, 0.9, 0.75), h13(id + 3.3));
  return tint * b * gain * tw;
}
void main(){
  vec2 sc = vUv * 2.0 - 1.0;
  vec3 d = normalize(uFwd + uRight * sc.x * uTan * uAspect + uUp * sc.y * uTan);
  vec3 col = vec3(0.012, 0.02, 0.038);
  float n1 = fbm(d * 3.2 + vec3(2.1, 0.4, 1.3));
  float n2 = fbm(d * 2.1 + vec3(8.7, 3.1, 0.6));
  float lane = smoothstep(0.35, 0.75, fbm(d * 4.5 + 13.0));
  col += vec3(0.03, 0.14, 0.17) * smoothstep(0.42, 0.85, n1) * 0.8 * lane;
  col += vec3(0.14, 0.045, 0.13) * smoothstep(0.5, 0.92, n2) * 0.65 * lane;
  col += vec3(0.05, 0.09, 0.14) * pow(max(n1 * n2 * 2.4 - 0.4, 0.0), 2.0) * 0.5;
  col += stars(d, 130.0, 0.986, 0.9);
  col += stars(d, 240.0, 0.991, 0.6);
  col += stars(d, 420.0, 0.994, 0.38);
  float sd = max(dot(d, uKeyDir), 0.0);
  col += vec3(1.0, 0.86, 0.62) * (pow(sd, 900.0) * 6.0 + pow(sd, 48.0) * 0.28 + pow(sd, 8.0) * 0.05);
  vec3 pd = normalize(vec3(-0.55, 0.12, -0.82));
  float ca = dot(d, pd);
  float ang = acos(clamp(ca, -1.0, 1.0));
  float disk = 1.0 - smoothstep(0.155, 0.162, ang);
  if (disk > 0.0) {
    vec3 surfN = normalize(d - pd * ca + 0.0001);
    float bands = fbm(surfN * 5.0 + vec3(0.0, 3.0, 0.0));
    vec3 pc = mix(vec3(0.02, 0.05, 0.07), vec3(0.07, 0.16, 0.19), bands);
    float lit = clamp(dot(surfN, uKeyDir) * 0.8 + 0.15, 0.0, 1.0);
    float rim = smoothstep(0.155, 0.10, ang) * 0.0 + smoothstep(0.125, 0.155, ang);
    col = mix(col, pc * lit + vec3(0.12, 0.3, 0.34) * rim * 0.5, disk * 0.92);
  }
  col += (h13(vec3(gl_FragCoord.xy, 1.0)) - 0.5) / 255.0;
  frag = vec4(col, 1.0);
}`;

/* ---------- 尾焰 ---------- */
SF.SH.plumeV = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
uniform mat4 uVP, uModel;
out vec2 vUv; out vec3 vW;
void main(){ vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; vUv = aUv; gl_Position = uVP * w; }`;
SF.SH.plumeF = `#version 300 es
precision highp float;
in vec2 vUv; in vec3 vW;
uniform float uTime, uInt;
uniform vec3 uCam;
out vec4 frag;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
void main(){
  float y = clamp(vUv.y, 0.0, 1.0);
  float inv = 1.0 - y;
  float body = pow(inv, 1.7);
  float n = vn(vec2(vUv.x * 6.0, y * 9.0 - uTime * 11.0)) * 0.5
          + vn(vec2(vUv.x * 14.0 + 3.7, y * 22.0 - uTime * 19.0)) * 0.25;
  float flick = 0.82 + 0.18 * sin(uTime * 23.0 + vW.z * 0.05);
  float a = body * (0.55 + n * 0.7) * uInt * flick;
  float core = pow(inv, 4.0);
  vec3 col = mix(vec3(0.16, 0.55, 0.95), vec3(0.62, 0.95, 1.0), core) * (1.0 + core * 2.2);
  col += vec3(1.0, 0.62, 0.25) * inv * inv * 0.18 * uInt;
  frag = vec4(col * a, a);
}`;

/* ---------- 光束 ---------- */
SF.SH.beamV = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec2 aUv;
uniform mat4 uVP, uModel;
out vec3 vN, vW; out vec2 vUv;
void main(){ vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; vN = mat3(uModel) * aNorm; vUv = aUv; gl_Position = uVP * w; }`;
SF.SH.beamF = `#version 300 es
precision highp float;
in vec3 vN, vW; in vec2 vUv;
uniform vec3 uCam, uCol;
uniform float uTime, uAlpha, uCore;
out vec4 frag;
void main(){
  vec3 v = normalize(uCam - vW);
  float face = abs(dot(normalize(vN), v));
  float edge = pow(face, 0.65);
  float stripes = 0.75 + 0.25 * sin(vUv.y * 140.0 - uTime * 42.0) * sin(vUv.y * 37.0 + uTime * 17.0);
  float pulse = 0.9 + 0.1 * sin(uTime * 31.0);
  float a = edge * stripes * pulse * uAlpha;
  vec3 col = mix(uCol, vec3(1.0), uCore * 0.75) * (1.0 + uCore * 2.6);
  frag = vec4(col * a, a);
}`;

/* ---------- 护盾 ---------- */
SF.SH.shieldV = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
uniform mat4 uVP, uModel;
out vec3 vN, vW, vL;
void main(){ vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; vN = mat3(uModel) * aNorm; vL = aPos; gl_Position = uVP * w; }`;
SF.SH.shieldF = `#version 300 es
precision highp float;
in vec3 vN, vW, vL;
uniform vec3 uCam;
uniform float uTime, uInt, uWave;
out vec4 frag;
void main(){
  vec3 v = normalize(uCam - vW);
  vec3 n = normalize(vN);
  float fres = pow(clamp(1.0 - abs(dot(n, v)), 0.0, 1.0), 2.4);
  vec3 g = abs(fract(vL * vec3(7.0, 6.0, 16.0) + vec3(0.0, 0.0, -uTime * 0.35)) - 0.5);
  float line = smoothstep(0.36, 0.48, max(g.x, max(g.y, g.z)));
  float flow = 0.5 + 0.5 * sin(vL.z * 9.0 - uTime * 2.6 + vL.x * 3.0);
  float coord = vL.z * 0.5 + 0.5;
  float bd = (coord - uWave) * 5.5;
  float band = exp(-bd * bd) * step(uWave, 1.0) * (1.0 - step(1.0, uWave));
  float a = uInt * (fres * 0.5 + line * 0.085 * (0.5 + flow * 0.5) + flow * 0.03 + band * 1.5);
  vec3 col = mix(vec3(0.2, 0.75, 0.9), vec3(0.35, 1.0, 0.72), fres * 0.7 + band * 0.5);
  col += vec3(0.6, 1.0, 0.85) * band * 1.2;
  frag = vec4(col * a, a);
}`;

/* ---------- 能量弹 / 弹迹（GPU 时间驱动） ---------- */
SF.SH.boltV = `#version 300 es
layout(location=0) in vec2 aP;
layout(location=1) in vec3 iO;
layout(location=2) in vec3 iD;
layout(location=3) in vec4 iT; // t0, speed, life, size
layout(location=4) in vec3 iC;
uniform mat4 uVP;
uniform vec3 uCam, uRight, uUp;
uniform float uTime, uLen;
out vec2 vUv; out vec3 vC; out float vA;
void main(){
  float age = uTime - iT.x;
  float alive = step(0.0, age) * step(age, iT.z);
  vec3 c = iO + iD * (iT.y * age);
  vec3 toCam = normalize(uCam - c);
  vec3 side = normalize(cross(iD, toCam));
  vec3 up2 = cross(side, iD);
  float len = iT.w * uLen;
  vec3 w = c + iD * (aP.x * len) + side * (aP.y * iT.w) + up2 * (aP.y * iT.w * 0.35);
  vUv = aP; vC = iC;
  vA = alive * (1.0 - smoothstep(iT.z * 0.75, iT.z, age));
  gl_Position = uVP * vec4(w, 1.0);
}`;
SF.SH.boltF = `#version 300 es
precision highp float;
in vec2 vUv; in vec3 vC; in float vA;
out vec4 frag;
void main(){
  float d = abs(vUv.y);
  float head = smoothstep(-1.0, 0.55, vUv.x);
  float a = pow(max(1.0 - d, 0.0), 1.6) * head * vA;
  float core = pow(max(1.0 - d, 0.0), 5.0) * head;
  vec3 col = vC * (0.8 + core * 2.6) + vec3(1.0) * core * 0.9;
  frag = vec4(col * a, a);
}`;

/* ---------- 火花 ---------- */
SF.SH.sparkV = `#version 300 es
layout(location=0) in vec2 aP;
layout(location=1) in vec3 iO;
layout(location=2) in vec3 iV;
layout(location=3) in vec3 iT; // t0, life, size
layout(location=4) in vec3 iC;
layout(location=5) in float iS0;
uniform mat4 uVP;
uniform vec3 uCam, uRight, uUp;
uniform float uTime, uScroll;
out vec2 vUv; out vec3 vC; out float vA;
void main(){
  float age = uTime - iT.x;
  float alive = step(0.0, age) * step(age, iT.y);
  float k = age * (1.0 - age / iT.y * 0.45);
  vec3 c = iO + iV * k; c.z -= (uScroll - iS0);
  float s = iT.z * (1.0 - age / iT.y * 0.7);
  vec3 w = c + uRight * (aP.x * s) + uUp * (aP.y * s);
  vUv = aP; vC = iC; vA = alive * pow(clamp(1.0 - age / iT.y, 0.0, 1.0), 1.4);
  gl_Position = uVP * vec4(w, 1.0);
}`;
SF.SH.sparkF = `#version 300 es
precision highp float;
in vec2 vUv; in vec3 vC; in float vA;
out vec4 frag;
void main(){
  float d = length(vUv);
  float a = smoothstep(1.0, 0.1, d) * vA;
  frag = vec4(vC * a * 1.8, a);
}`;

/* ---------- 爆闪 ---------- */
SF.SH.flashV = `#version 300 es
layout(location=0) in vec2 aP;
layout(location=1) in vec3 iPos;
layout(location=2) in vec4 iPar; // r, alpha, hot, ring
uniform mat4 uVP;
uniform vec3 uRight, uUp;
out vec2 vUv; out vec4 vPar;
void main(){
  vec3 w = iPos + uRight * (aP.x * iPar.x) + uUp * (aP.y * iPar.x);
  vUv = aP; vPar = iPar;
  gl_Position = uVP * vec4(w, 1.0);
}`;
SF.SH.flashF = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vPar;
out vec4 frag;
void main(){
  float d = length(vUv);
  float a = 0.0; vec3 col = vec3(0.0);
  if (vPar.w > 0.5) {
    float rd = (d - 0.72) * 5.0;
    float ring = exp(-rd * rd);
    a = ring * vPar.y;
    col = mix(vec3(1.0, 0.6, 0.25), vec3(1.0, 0.95, 0.85), vPar.z) * 2.0;
  } else {
    float fall = pow(max(1.0 - d, 0.0), 2.2);
    float core = pow(max(1.0 - d, 0.0), 7.0);
    a = fall * vPar.y;
    col = mix(vec3(1.0, 0.45, 0.16), vec3(1.0, 0.97, 0.9), core * (0.4 + vPar.z * 0.6)) * (1.2 + core * 3.0);
  }
  frag = vec4(col * a, a);
}`;

/* ---------- 尘埃 ---------- */
SF.SH.dustV = `#version 300 es
layout(location=0) in vec2 aP;
layout(location=1) in vec4 iS; // x, y, z0, size
layout(location=2) in float iPh;
uniform mat4 uVP;
uniform vec3 uCam, uRight, uUp;
uniform float uTime, uTravel, uTravelTotal, uGlow;
out vec2 vUv; out float vA;
void main(){
  float z = mod(iS.z - uTravel, uTravelTotal) - uTravelTotal * 0.5;
  vec3 c = vec3(iS.x, iS.y, z);
  float dist = length(uCam - c);
  float s = iS.w * clamp(260.0 / dist, 0.3, 3.0);
  vec3 w = c + uRight * (aP.x * s) + uUp * (aP.y * s);
  vUv = aP;
  float tw = 0.6 + 0.4 * sin(uTime * 1.8 + iPh);
  vA = (0.05 + 0.09 * tw + uGlow * 0.16) * smoothstep(60.0, 260.0, dist) * (1.0 - smoothstep(2200.0, 3600.0, dist));
  gl_Position = uVP * vec4(w, 1.0);
}`;
SF.SH.dustF = `#version 300 es
precision highp float;
in vec2 vUv; in float vA;
out vec4 frag;
void main(){
  float d = length(vUv);
  float a = smoothstep(1.0, 0.2, d) * vA;
  frag = vec4(vec3(0.55, 0.75, 0.95) * a, a);
}`;

/* ---------- 动态拖尾 / 全息 ---------- */
SF.SH.trailV = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in float aA;
layout(location=3) in float aMix;
uniform mat4 uVP;
out vec2 vUv; out float vA; out float vMix;
void main(){ vUv = aUv; vA = aA; vMix = aMix; gl_Position = uVP * vec4(aPos, 1.0); }`;
SF.SH.trailF = `#version 300 es
precision highp float;
in vec2 vUv; in float vA; in float vMix;
uniform vec3 uColA, uColB;
uniform float uGain;
out vec4 frag;
void main(){
  float d = abs(vUv.y);
  float a = pow(max(1.0 - d, 0.0), 1.8) * vA;
  vec3 col = mix(uColA, uColB, vMix) * uGain;
  frag = vec4(col * a, a);
}`;

/* ---------- 后期 ---------- */
SF.SH.brightF = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uThr;
out vec4 frag;
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  frag = vec4(c * smoothstep(uThr, uThr + 0.5, l), 1.0);
}`;
SF.SH.blurF = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 frag;
void main(){
  vec3 c = texture(uTex, vUv).rgb * 0.227027;
  c += (texture(uTex, vUv + uDir * 1.3846).rgb + texture(uTex, vUv - uDir * 1.3846).rgb) * 0.3162162;
  c += (texture(uTex, vUv + uDir * 3.2308).rgb + texture(uTex, vUv - uDir * 3.2308).rgb) * 0.0702703;
  frag = vec4(c, 1.0);
}`;
SF.SH.compF = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene, uBloomA, uBloomB;
uniform float uTime, uWipe, uFade;
uniform vec2 uRes;
out vec4 frag;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  c += texture(uBloomA, vUv).rgb * 0.55 + texture(uBloomB, vUv).rgb * 0.85;
  c *= 1.06;
  c = aces(c);
  c = pow(c, vec3(0.4545));
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.55;
  c += (h21(vUv * uRes + fract(uTime) * 61.7) - 0.5) * 0.018;
  if (uWipe > 0.001) {
    float wh = uWipe * 0.52;
    float panel = clamp(step(1.0 - wh, vUv.y) + step(vUv.y, wh), 0.0, 1.0);
    float s1 = (vUv.y - (1.0 - wh)) * 80.0, s2 = (vUv.y - wh) * 80.0;
    float seam = (exp(-s1 * s1) + exp(-s2 * s2)) * uWipe;
    vec3 pc = vec3(0.015, 0.022, 0.032) * (0.8 + 0.2 * h21(floor(vUv * uRes / 9.0)));
    c = mix(c, pc, panel);
    c += vec3(0.2, 0.8, 0.95) * seam * 0.8;
  }
  c *= uFade;
  frag = vec4(c, 1.0);
}`;