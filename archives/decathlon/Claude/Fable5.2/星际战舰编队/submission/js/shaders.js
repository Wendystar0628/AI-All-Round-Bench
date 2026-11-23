// shaders.js — GLSL sources
(function () {
  'use strict';
  const SF = window.SF;
  const S = SF.shaders = {};
  const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D; precision highp samplerCube;
`;
  const NL = 14;
  const COMMON = `
#define NL ${NL}
uniform vec3 uCam;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmbHi; uniform vec3 uAmbLo; uniform vec3 uFillDir; uniform vec3 uFillCol;
uniform vec4 uLightPos[NL]; uniform vec4 uLightCol[NL]; uniform int uNumLights;
uniform vec4 uFog; uniform float uPhase; uniform float uTime;
float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float vnoise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),f.x),mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x),mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x),f.y),f.z); }
// value noise periodic along z with period pz (lattice units)
float vnoiseZ(vec3 p, float pz){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); float z0=mod(i.z,pz), z1=mod(i.z+1.0,pz);
  return mix(mix(mix(hash13(vec3(i.xy,z0)),hash13(vec3(i.x+1.0,i.y,z0)),f.x),mix(hash13(vec3(i.x,i.y+1.0,z0)),hash13(vec3(i.x+1.0,i.y+1.0,z0)),f.x),f.y),
             mix(mix(hash13(vec3(i.xy,z1)),hash13(vec3(i.x+1.0,i.y,z1)),f.x),mix(hash13(vec3(i.x,i.y+1.0,z1)),hash13(vec3(i.x+1.0,i.y+1.0,z1)),f.x),f.y),f.z); }
vec3 dynLights(vec3 P, vec3 N, vec3 V, float rough, float spec, float ao, out vec3 specOut){
  vec3 acc = vec3(0.0); specOut = vec3(0.0);
  for (int i=0;i<NL;i++){ if (i>=uNumLights) break;
    vec3 Lv = uLightPos[i].xyz - P; float d2 = dot(Lv,Lv); float r = uLightPos[i].w;
    float att = 1.0/(1.0 + d2/(r*r)); att *= att;
    vec3 Ln = Lv*inversesqrt(d2+1e-4); float nl = max(dot(N,Ln),0.0);
    acc += uLightCol[i].rgb * att * (nl*0.9+0.1) ;
    vec3 Hh = normalize(Ln+V); float sh = mix(120.0, 10.0, rough);
    specOut += uLightCol[i].rgb * att * pow(max(dot(N,Hh),0.0), sh) * spec * nl * 1.5;
  }
  return acc * mix(1.0, ao, 0.6);
}
`;

  // ------------------------------------------------------------ voxel faces
  S.voxVS = HEAD + `
layout(location=0) in uvec4 aP; layout(location=1) in uvec4 aD1; layout(location=2) in uvec4 aD2;
uniform mat4 uVP; uniform mat4 uModel; uniform vec3 uOrigin;
out vec2 vUV; out vec3 vWorld; out vec3 vLocal;
flat out vec4 vAO; flat out ivec3 vInfo; flat out vec4 vBake; flat out vec3 vCell;
void main(){
  int d = int(aP.w & 7u); int vid = gl_VertexID;
  float ua = float(vid & 1), ub = float(vid >> 1);
  if ((d & 1) == 1) { float t = ua; ua = ub; ub = t; }
  int ax = d >> 1; vec3 N, A, B;
  if (ax==0){ N=vec3(1,0,0); A=vec3(0,1,0); B=vec3(0,0,1);} else if (ax==1){ N=vec3(0,1,0); A=vec3(0,0,1); B=vec3(1,0,0);} else { N=vec3(0,0,1); A=vec3(1,0,0); B=vec3(0,1,0);}
  vec3 cell = vec3(aP.xyz) + uOrigin;
  vec3 p = cell + A*ua + B*ub + (((d&1)==1) ? vec3(0.0) : N);
  vUV = vec2(ua, ub); vLocal = p; vCell = cell;
  vec4 w = uModel * vec4(p, 1.0); vWorld = w.xyz;
  uint ao = aD1.x;
  vAO = vec4(float(ao & 3u), float((ao>>2) & 3u), float((ao>>4) & 3u), float((ao>>6) & 3u)) / 3.0;
  vInfo = ivec3(int(aD1.y), d, int((aP.w >> 3) & 31u));
  vec4 bk = vec4(float(aD1.z), float(aD1.w), float(aD2.x), float(aD2.y)) / 255.0;
  vBake = vec4(bk.x, bk.yzw*bk.yzw*2.0);
  gl_Position = uVP * w;
}`;

  S.voxFS = (transparent) => HEAD + (transparent ? '#define TRANSP 1\n' : '') + COMMON + `
in vec2 vUV; in vec3 vWorld; in vec3 vLocal;
flat in vec4 vAO; flat in ivec3 vInfo; flat in vec4 vBake; flat in vec3 vCell;
uniform mat4 uModel; uniform sampler2D uPal;
uniform vec3 uGlowA; uniform vec3 uGlowB; uniform vec3 uGlowC;
uniform vec4 uDyn; uniform int uKind; uniform float uSunBake; uniform float uAmbScale;
uniform vec3 uAmbInt; uniform vec4 uShield; uniform vec4 uCrack; uniform float uHeat; uniform float uCore; uniform float uSeed;
out vec4 oCol;
float animK(int a, vec3 c, float hv, int dir){
  if (a==0) return 1.0;
  if (a==1) return 0.70 + 0.30*sin(6.28318*(uPhase*31.0 + hash13(floor(c/24.0))));
  if (a==2) return uDyn.x;
  if (a==3) { float front = mix(250.0, 545.0, uDyn.y); float lit = smoothstep(front+5.0, front-5.0, c.z);
              return 0.05 + lit*(0.9 + 1.6*uDyn.z) * (0.85+0.15*sin(c.z*0.9 - uTime*30.0)); }
  if (a==4) return 0.22 + 0.9*pow(0.5+0.5*sin(6.28318*(c.z/26.0 - uPhase*156.0)), 5.0);
  if (a==5) return 0.22 + 0.9*pow(0.5+0.5*sin(6.28318*(c.y/22.0 - uPhase*117.0 + hash13(floor(c.xzz/9.0)))), 5.0);
  if (a==6) { int ax = dir >> 1; float u = ax==0 ? c.z : c.x; float v = ax==1 ? c.z : c.y;
    float line = hash13(vec3(floor(v), floor(u/20.0), 1.0)); float len = 2.0 + floor(line*7.0);
    float beat = floor(uPhase*117.0 + line*9.0);
    float seg = hash13(vec3(floor((u + beat*step(0.7,line))/len), floor(v), floor(line*4.0) + beat*step(line,0.25)));
    float gap = step(0.18, hash13(vec3(floor(v), 7.0, floor(u/20.0))));
    return 0.05 + 1.25*step(0.60, seg)*gap*(0.55 + 0.45*hash13(vec3(floor(u/len), floor(v), 3.0))); }
  if (a==7) return step(0.5, hash13(floor(c/vec3(1.0,1.0,2.0))));
  if (a==8) return 0.10 + 3.4*uDyn.z;
  if (a==9) return 0.18 + 1.0*pow(0.5+0.5*sin(6.28318*(c.z/36.0 + uPhase*117.0*uDyn.w)), 6.0);
  if (a==10) return uCore*(0.78 + 0.22*sin(c.y*0.35 - 6.28318*uPhase*78.0 + sin(c.x*0.5+c.z*0.4)));
  if (a==11) return uDyn.x;
  if (a==12) return 0.8 + 0.2*sin(6.28318*(uPhase*156.0 + hv));
  if (a==13) return 0.22 + 0.9*pow(0.5+0.5*sin(6.28318*(length(c.xz)/24.0 - uPhase*117.0)), 5.0);
  return 1.0;
}
void main(){
  int mat = vInfo.x, dir = vInfo.y, edge = vInfo.z & 15; bool interior = (vInfo.z & 16) != 0;
  vec4 p0 = texelFetch(uPal, ivec2(mat,0), 0), p1 = texelFetch(uPal, ivec2(mat,1), 0), p2 = texelFetch(uPal, ivec2(mat,2), 0);
  vec3 alb = p0.rgb; float rough = p0.a; vec3 emis = p1.rgb; int anim = int(p1.a+0.5); float spec = p2.r, ambK = p2.g, alpha = p2.b;
  int ax = dir >> 1; vec3 Nl, Al, Bl;
  if (ax==0){ Nl=vec3(1,0,0); Al=vec3(0,1,0); Bl=vec3(0,0,1);} else if (ax==1){ Nl=vec3(0,1,0); Al=vec3(0,0,1); Bl=vec3(1,0,0);} else { Nl=vec3(0,0,1); Al=vec3(1,0,0); Bl=vec3(0,1,0);}
  if ((dir&1)==1) Nl = -Nl;
  mat3 R = mat3(uModel);
  vec2 fw = fwidth(vUV); float fp = max(fw.x, fw.y);
  float lod = clamp(1.15 - fp*2.4, 0.0, 1.0);
  float ao = mix(mix(vAO.x, vAO.y, vUV.x), mix(vAO.w, vAO.z, vUV.x), vUV.y);
  ao = mix(0.30, 1.0, ao*ao*(3.0-2.0*ao));
  vec2 e2 = min(vUV, 1.0 - vUV);
  float seam = 1.0 - smoothstep(0.0, 0.085, min(e2.x, e2.y));
  vec3 bev = vec3(0.0); float bw = 0.17;
  if ((edge&1)!=0) bev -= Al*(1.0 - smoothstep(0.0, bw, vUV.x));
  if ((edge&2)!=0) bev += Al*(1.0 - smoothstep(0.0, bw, 1.0-vUV.x));
  if ((edge&4)!=0) bev -= Bl*(1.0 - smoothstep(0.0, bw, vUV.y));
  if ((edge&8)!=0) bev += Bl*(1.0 - smoothstep(0.0, bw, 1.0-vUV.y));
  float bevAmt = min(length(bev), 1.0);
  vec3 Nf = normalize(R*Nl);
  vec3 N = normalize(R*(Nl + bev*1.1*lod));
  float hv = hash13(vCell + float(mat)*7.31 + uSeed);
  alb *= 0.90 + 0.20*hv;
  alb *= 1.0 - seam*0.30*lod*(1.0-bevAmt);
  vec3 V = normalize(uCam - vWorld);
  float sunVis = mix(1.0, vBake.x, uSunBake);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 lit = uSunCol * ndl * sunVis;
  vec3 amb = (mix(uAmbLo, uAmbHi, N.y*0.5+0.5) + uFillCol*max(dot(N,uFillDir),0.0)) * uAmbScale;
  bool isInt = ambK < 0.5;
  if (isInt) { amb = uAmbInt*(0.75 + 0.25*N.y); lit = lit*0.9 + amb*ao; } else lit += amb * ao;
  float dynC = uDyn.x;
  if (uKind==1) dynC = vLocal.z > 150.0 ? (0.04 + uDyn.y*(1.0+uDyn.z)) : uDyn.x;
  else if (uKind==3) dynC = uCore;
  else if (uKind==4) dynC = 0.1 + 3.2*uDyn.z;
  vec3 bk = vBake.yzw/(1.0 + vBake.yzw*0.55);
  if (isInt) bk.x = bk.x*0.5/(1.0 + bk.x*0.9);
  lit += (uGlowA*bk.x + uGlowB*bk.y + uGlowC*bk.z*dynC) * mix(1.0, ao, 0.5);
  vec3 spL; lit += dynLights(vWorld, N, V, rough, spec, ao, spL);
  lit += uShield.rgb * (0.45 + 0.55*abs(Nf.y)) * ao;
  vec3 col = alb * lit;
  vec3 Hh = normalize(uSunDir + V); float sh = exp2(mix(8.0, 2.5, rough)) * mix(1.0, 2.5, bevAmt*lod);
  float sp = pow(max(dot(N,Hh),0.0), sh) * spec * (sh+8.0)/25.0;
  sp *= mix(1.0, 1.6, bevAmt*lod);
  col += uSunCol * sp * sunVis * ndl + spL;
  float fr = pow(clamp(1.0 - dot(N,V), 0.0, 1.0), 4.0);
  col += amb * fr * spec * 0.9 * ao;
  float ak = animK(anim, vCell, hv, dir);
  vec3 em = emis * ak;
  if (interior) {
    float dC = distance(vLocal, uCrack.xyz);
    float h = uHeat * smoothstep(uCrack.w, uCrack.w*0.55 - 6.0, dC);
    float nl = vnoise(vCell*0.085 + uSeed*3.1)*0.7 + hash13(floor(vCell*0.5)+3.0)*0.3;
    float ember = smoothstep(0.80 - 0.80*h, 1.02 - 0.45*h, nl + 0.12);
    em += vec3(3.4, 1.05, 0.22) * (h*0.35 + 0.95*ember*sqrt(h)) * (0.7 + 0.6*hash13(floor(vCell*0.5)+3.0)) + vec3(1.2,0.25,0.05)*h*h*seam;
    col *= 0.7;
  }
#ifdef TRANSP
  float fa = clamp(alpha + fr*0.5 + bevAmt*0.25, 0.0, 0.95);
  vec3 outc = col*fa + em;
  float dist = distance(uCam, vWorld);
  float fg = 1.0 - exp(-dist*uFog.a);
  oCol = vec4(mix(outc, uFog.rgb*fa, fg), fa);
#else
  col += em;
  float dist = distance(uCam, vWorld);
  float fg = 1.0 - exp(-dist*uFog.a);
  col = mix(col, uFog.rgb, fg);
  oCol = vec4(col, 1.0);
#endif
}`;

  // ------------------------------------------------------------ loose voxel cubes (debris, floaters)
  S.cubeVS = HEAD + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aM0; layout(location=3) in vec4 aM1; layout(location=4) in vec4 aM2; layout(location=5) in vec4 aCol;
uniform mat4 uVP;
out vec3 vWorld; out vec3 vN; out vec4 vCol; out vec3 vL;
void main(){
  // rows: aM0.xyz = right*s, aM1.xyz = up*s, aM2.xyz = fwd*s ; translation in .w
  mat3 Rm = mat3(aM0.xyz, aM1.xyz, aM2.xyz);
  vec3 w = Rm*aPos + vec3(aM0.w, aM1.w, aM2.w);
  vWorld = w; vN = normalize(Rm*aNrm); vCol = aCol; vL = aPos;
  gl_Position = uVP*vec4(w,1.0);
}`;
  S.cubeFS = HEAD + COMMON + `
in vec3 vWorld; in vec3 vN; in vec4 vCol; in vec3 vL;
out vec4 oCol;
void main(){
  vec3 N = normalize(vN), V = normalize(uCam - vWorld);
  vec3 a = abs(vL); float e = max(max(min(a.x,a.y), min(a.y,a.z)), min(a.x,a.z));
  float edge = smoothstep(0.40, 0.5, e);
  vec3 alb = vCol.rgb * (1.0 - edge*0.25);
  vec3 lit = uSunCol*max(dot(N,uSunDir),0.0) + mix(uAmbLo,uAmbHi,N.y*0.5+0.5) + uFillCol*max(dot(N,uFillDir),0.0);
  vec3 spL; lit += dynLights(vWorld, N, V, 0.8, 0.1, 1.0, spL);
  vec3 col = alb*lit + vCol.rgb*vCol.a*vec3(3.4,1.05,0.22)*4.0;
  float dist = distance(uCam, vWorld); col = mix(col, uFog.rgb, 1.0-exp(-dist*uFog.a));
  oCol = vec4(col,1.0);
}`;

  // ------------------------------------------------------------ sky
  S.fsVS = HEAD + `
out vec2 vUV;
void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); vUV = p; gl_Position = vec4(p*2.0-1.0, 1.0, 1.0); }`;

  const SKYFN = `
float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float vnoise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),f.x),mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x),mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<6;i++){ v+=a*vnoise(p); p=p*2.02+vec3(13.1,7.7,3.3); a*=0.5; } return v; }
`;
  // nebula baked once into a cube map
  S.skyGenFS = HEAD + SKYFN + `
in vec2 vUV; uniform mat3 uFace; uniform vec3 uSunDir;
out vec4 oCol;
void main(){
  vec3 d = normalize(uFace*vec3(vUV*2.0-1.0, 1.0));
  vec3 w = d*1.5 + 0.9*vec3(fbm(d*1.9+3.0), fbm(d*1.9+11.0), fbm(d*1.9+19.0));
  float n1 = fbm(w*1.25 + 2.0);
  float n2 = fbm(w*2.6 + 31.0);
  float n3 = fbm(d*5.0 + 57.0);
  vec3 bn = normalize(vec3(0.32, 0.88, -0.30));
  float band = exp(-pow(dot(d,bn)*2.0, 2.0));
  float neb = smoothstep(0.40, 0.80, n1) * (0.22 + 0.95*band);
  float lanes = smoothstep(0.34, 0.62, n2);
  vec3 teal = vec3(0.018, 0.115, 0.150), viol = vec3(0.105, 0.040, 0.170), warm = vec3(0.36, 0.14, 0.05), deep = vec3(0.004,0.007,0.016);
  float hueMix = smoothstep(0.35, 0.68, fbm(d*1.4 + 77.0));
  vec3 col = deep + deep*2.0*n3;
  col += neb * mix(teal, viol, hueMix) * (0.35 + 1.5*lanes) ;
  col += pow(neb,2.0) * lanes * mix(vec3(0.05,0.30,0.34), vec3(0.30,0.10,0.34), hueMix) * 0.55 * smoothstep(0.5,0.8,n3+0.15);
  float sd = max(dot(d, uSunDir), 0.0);
  col += warm * (pow(sd, 5.0)*0.20 + pow(sd, 24.0)*0.35) * (0.5 + n1);
  // unresolved star dust along the band
  col += vec3(0.010,0.013,0.020) * band * (0.4 + n3);
  oCol = vec4(col, 1.0);
}`;

  S.skyFS = HEAD + SKYFN + `
in vec2 vUV; uniform mat4 uInvVP; uniform samplerCube uSky; uniform vec3 uSunDir; uniform vec3 uSunCol;
uniform vec4 uPlanet; // dir xyz, angular radius
uniform float uSkyK; uniform vec2 uPix;
out vec4 oCol;
void main(){
  vec4 h = uInvVP*vec4(vUV*2.0-1.0, 1.0, 1.0); vec3 d = normalize(h.xyz/h.w);
  vec3 col = texture(uSky, d).rgb;
  float sd = dot(d, uSunDir);
  // sun disc + corona
  float ang = acos(clamp(sd,-1.0,1.0));
  col += uSunCol * (smoothstep(0.0125, 0.0095, ang)*18.0 + exp(-ang*38.0)*1.6 + exp(-ang*9.0)*0.12);
  // planet
  vec3 pc = uPlanet.xyz; float rho = uPlanet.w;
  float ca = dot(d, pc); float pa = acos(clamp(ca,-1.0,1.0));
  float rr = pa/rho;
  if (rr < 1.25) {
    vec3 T1 = normalize(cross(pc, vec3(0.0,1.0,0.0))), T2 = cross(T1, pc);
    vec3 off = d - pc*ca; vec2 q = vec2(dot(off,T1), dot(off,T2))/sin(rho);
    float r2 = dot(q,q);
    float aa = fwidth(rr)*1.5 + 1e-4;
    float disc = 1.0 - smoothstep(1.0-aa, 1.0+aa, rr);
    float zz = sqrt(max(1.0 - r2, 0.0));
    vec3 n = normalize(q.x*T1 + q.y*T2 - zz*pc);
    float lam = dot(n, uSunDir);
    vec3 axis = normalize(vec3(0.25, 0.95, 0.18));
    float lat = dot(n, axis);
    float bands = fbm(vec3(lat*7.0, lat*2.0 + fbm(n*3.0)*0.6, 1.7));
    float storm = fbm(n*6.0 + vec3(0.0, lat*4.0, 0.0));
    vec3 pcol = mix(vec3(0.10,0.17,0.22), vec3(0.34,0.40,0.42), smoothstep(0.3,0.7,bands));
    pcol = mix(pcol, vec3(0.42,0.33,0.26), smoothstep(0.55,0.8,storm)*0.45);
    float day = smoothstep(-0.12, 0.35, lam);
    vec3 pl = pcol * (day*1.15*vec3(1.0,0.93,0.82) + 0.012);
    float rim = pow(1.0 - zz, 3.0);
    pl += vec3(0.20,0.50,0.62) * rim * (0.25 + 1.3*smoothstep(-0.3,0.4,lam));
    col = mix(col, pl, disc);
    float halo = exp(-max(rr-1.0,0.0)*38.0) * (1.0-disc);
    col += vec3(0.10,0.30,0.40) * halo * (0.2 + smoothstep(-0.4,0.5,dot(normalize(off), uSunDir)));
  }
  oCol = vec4(col*uSkyK, 1.0);
}`;

  S.starVS = HEAD + `
layout(location=0) in vec4 aDir; layout(location=1) in vec4 aCol;
uniform mat4 uVPr; uniform float uScale;
out vec4 vCol; out float vSize;
void main(){ vec4 p = uVPr*vec4(aDir.xyz, 1.0); gl_Position = p.xyww; float s = aDir.w*uScale; vSize = s; gl_PointSize = max(s, 1.6); vCol = vec4(aCol.rgb*aCol.a*min(1.0, s*s/2.56), 1.0); }`;
  S.starFS = HEAD + `
in vec4 vCol; in float vSize; out vec4 oCol;
void main(){ vec2 q = gl_PointCoord*2.0-1.0; float r2 = dot(q,q); float a = exp(-r2*3.2) * (1.0 - smoothstep(0.7,1.0,r2)); oCol = vec4(vCol.rgb*a, 0.0); }`;

  // ------------------------------------------------------------ engine plume (ray-marched box)
  S.plumeVS = HEAD + `
layout(location=0) in vec3 aPos;
uniform mat4 uVP; uniform mat4 uModel; uniform vec3 uHalf; // hx, hy, length
out vec3 vWorld;
void main(){ vec3 p = vec3(aPos.x*uHalf.x*3.2, aPos.y*uHalf.y*3.2, -(aPos.z*0.5+0.5)*uHalf.z + (aPos.z < 0.0 ? uHalf.x*0.6 : 0.0)); vec4 w = uModel*vec4(p,1.0); vWorld = w.xyz; gl_Position = uVP*w; }`;
  S.plumeFS = HEAD + `
in vec3 vWorld;
uniform vec3 uCam; uniform mat4 uInvModel; uniform vec3 uHalf; uniform vec4 uPar; // inner, outer, coreLen, seed
uniform vec3 uColIn; uniform vec3 uColOut; uniform sampler2D uDepth; uniform vec2 uNF; uniform vec3 uCamFwd; uniform float uPhase; uniform vec4 uFog;
out vec4 oCol;
float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float vnoiseZ(vec3 p, float pz){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); float z0=mod(i.z,pz), z1=mod(i.z+1.0,pz);
  return mix(mix(mix(hash13(vec3(i.xy,z0)),hash13(vec3(i.x+1.0,i.y,z0)),f.x),mix(hash13(vec3(i.x,i.y+1.0,z0)),hash13(vec3(i.x+1.0,i.y+1.0,z0)),f.x),f.y),
             mix(mix(hash13(vec3(i.xy,z1)),hash13(vec3(i.x+1.0,i.y,z1)),f.x),mix(hash13(vec3(i.x,i.y+1.0,z1)),hash13(vec3(i.x+1.0,i.y+1.0,z1)),f.x),f.y),f.z); }
void main(){
  vec3 rdW = normalize(vWorld - uCam);
  vec3 ro = (uInvModel*vec4(uCam,1.0)).xyz, rd = mat3(uInvModel)*rdW;
  vec3 bmin = vec3(-uHalf.x*3.2, -uHalf.y*3.2, -uHalf.z), bmax = vec3(uHalf.x*3.2, uHalf.y*3.2, uHalf.x*0.6);
  rd += vec3(1e-5)*(vec3(1.0) - step(vec3(1e-5), abs(rd)));
  vec3 inv = 1.0/rd; vec3 t0 = (bmin-ro)*inv, t1 = (bmax-ro)*inv; vec3 tmn = min(t0,t1), tmx = max(t0,t1);
  float tn = max(max(tmn.x,tmn.y),max(tmn.z,0.0)), tf = min(min(tmx.x,tmx.y),tmx.z);
  float dz = texelFetch(uDepth, ivec2(gl_FragCoord.xy), 0).r;
  float zl = 2.0*uNF.x*uNF.y/(uNF.y+uNF.x - (dz*2.0-1.0)*(uNF.y-uNF.x));
  float ts = zl/max(dot(rdW,uCamFwd),1e-3);
  tf = min(tf, ts);
  if (tf <= tn) discard;
  const int NS = 22; float dt = (tf-tn)/float(NS);
  float jit = hash13(vec3(gl_FragCoord.xy, 1.0));
  vec3 acc = vec3(0.0);
  float flow = uPhase*uPar.w;
  for (int i=0;i<NS;i++){
    vec3 p = ro + rd*(tn + (float(i)+0.5)*dt);
    float w = clamp(-p.z/uHalf.z, 0.0, 0.9999);
    float pre = smoothstep(uHalf.x*0.6, 0.0, p.z);
    float taper = mix(1.0, 0.46, pow(w, 0.55));
    vec2 q = p.xy/(uHalf.xy*taper);
    float r2 = dot(q*q, q*q); r2 = sqrt(r2);           // squarish profile near the nozzle
    r2 = mix(r2, dot(q,q), smoothstep(0.0,0.35,w));
    float nz = vnoiseZ(vec3(q*2.4 + 5.0, w*uHalf.z/uHalf.x*0.55 + flow), 32.0);
    float outer = exp(-r2*2.3) * pow(1.0-w, 1.7) * (0.45 + 1.1*nz);
    float cl = uPar.z;
    float wi = clamp(w/cl, 0.0, 1.0);
    float inner = exp(-r2*9.0) * pow(1.0-wi, 1.35) * (1.0 + 0.55*cos(wi*26.0)*exp(-wi*3.0));
    float edgeS = exp(-pow(r2-1.25,2.0)*5.0) * pow(1.0-w,3.0) * smoothstep(0.55,0.9,nz) * 0.5;
    acc += (uColOut*(outer*uPar.y + edgeS*uPar.y) + uColIn*inner*uPar.x*2.6) * pre;
  }
  float scale = dt/uHalf.x;
  vec3 col = acc*scale*1.35;
  col = max(col, vec3(0.0)); col = col/(1.0 + 0.10*col);
  float dist = distance(uCam, vWorld);
  col *= exp(-dist*uFog.a);
  oCol = vec4(col, 0.0);
}`;

  // ------------------------------------------------------------ axial billboards (beams, bolts, tracers, trails, holo lines)
  S.axVS = HEAD + `
layout(location=0) in vec3 aP0; layout(location=1) in vec3 aP1; layout(location=2) in vec4 aW; layout(location=3) in vec4 aCol; layout(location=4) in vec4 aPar;
uniform mat4 uVP; uniform vec3 uCam;
out vec2 vST; out vec4 vCol; out vec4 vPar; out float vLen; out vec2 vWid;
void main(){
  float s = float(gl_VertexID & 1)*2.0-1.0, l = float(gl_VertexID >> 1);
  vec3 ax = aP1 - aP0; float len = length(ax); vec3 an = ax/max(len,1e-4);
  vec3 mid = mix(aP0, aP1, l);
  vec3 side = cross(an, uCam - mid); float sl = length(side); side = sl > 1e-4 ? side/sl : vec3(1,0,0);
  float w = mix(aW.x, aW.y, l);
  float ext = aW.z; // cap extension (in widths)
  vec3 p = mid + side*s*w + an*(l*2.0-1.0)*w*ext;
  vST = vec2(s, l); vCol = aCol; vPar = aPar; vLen = len; vWid = vec2(w, ext);
  gl_Position = uVP*vec4(p,1.0);
}`;
  S.axFS = HEAD + `
in vec2 vST; in vec4 vCol; in vec4 vPar; in float vLen; in vec2 vWid;
uniform float uPhase; uniform float uTime;
out vec4 oCol;
float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float n1(float x){ float i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f); return mix(hash11(i),hash11(i+1.0),f); }
void main(){
  int ty = int(vPar.x+0.5); float s = vST.x, l = vST.y; float s2 = s*s;
  vec3 col; float a = 0.0;
  if (ty==0) { // heavy beam: white core, cyan sheath, blue haze, flowing filaments
    float u = l*vLen;
    float fil = n1(u*0.045 - uTime*9.0 + vPar.y) * n1(u*0.013 - uTime*4.0 + s*3.0);
    float core = exp(-s2*90.0);
    float mid = exp(-s2*14.0) * (0.75 + 0.7*fil);
    float haze = exp(-s2*3.0) * 0.20;
    float strand = exp(-pow(abs(s)-0.22-0.06*sin(u*0.05-uTime*14.0),2.0)*400.0) * 0.5 * n1(u*0.03 - uTime*11.0);
    col = vec3(1.0,1.0,1.0)*core*6.0 + vCol.rgb*(mid*2.2 + haze + strand*1.5);
    float endF = smoothstep(0.0, vPar.z, l) * (1.0 - smoothstep(1.0-vPar.w, 1.0, l));
    col *= vCol.a * endF;
  } else if (ty==1) { // pulse bolt: l=1 head
    float head = exp(-(pow((l-0.86)/0.11,2.0) + s2*5.5));
    float tail = pow(l, 2.4) * exp(-s2*(9.0 + 30.0*(1.0-l))) * step(l, 0.93);
    float core = exp(-(pow((l-0.86)/0.07,2.0) + s2*40.0));
    col = vCol.rgb*(head*1.6 + tail*0.9) + vec3(1.0)*core*3.5;
    col *= vCol.a;
  } else if (ty==2) { // tracer
    float body = exp(-s2*7.0) * smoothstep(0.0,0.15,l) * (0.35+0.65*l);
    col = (vCol.rgb*body + vec3(1.0)*exp(-s2*40.0)*l*l*0.9) * vCol.a;
  } else if (ty==3) { // exhaust / smoke trail segment (premultiplied)
    float nz = n1(vPar.y*0.11 + l*vPar.z) ;
    float body = exp(-s2*3.2) * (0.55 + 0.75*nz);
    a = clamp(body*vCol.a*0.55, 0.0, 1.0)*vPar.w;
    col = vCol.rgb*body*vCol.a;
  } else { // thin emissive line
    col = vCol.rgb * exp(-s2*4.0) * vCol.a;
  }
  oCol = vec4(col, a);
}`;

  // ------------------------------------------------------------ sprites
  S.spVS = HEAD + `
layout(location=0) in vec4 aPos; layout(location=1) in vec4 aAxis; layout(location=2) in vec4 aCol; layout(location=3) in vec4 aPar;
uniform mat4 uVP; uniform vec3 uCamR; uniform vec3 uCamU;
out vec2 vQ; out vec4 vCol; out vec4 vPar;
void main(){
  vec2 q = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1))*2.0-1.0;
  float sz = aPos.w; vec3 R = uCamR, U = uCamU;
  if (dot(aAxis.xyz,aAxis.xyz) > 0.01) { vec3 n = normalize(aAxis.xyz); R = normalize(cross(abs(n.y)>0.9?vec3(1,0,0):vec3(0,1,0), n)); U = cross(n, R); }
  float c = cos(aAxis.w), s = sin(aAxis.w); vec2 qr = vec2(q.x*c - q.y*s, q.x*s + q.y*c);
  vec3 p = aPos.xyz + (R*qr.x + U*qr.y)*sz;
  vQ = q; vCol = aCol; vPar = aPar;
  gl_Position = uVP*vec4(p,1.0);
}`;
  S.spFS = HEAD + `
in vec2 vQ; in vec4 vCol; in vec4 vPar;
out vec4 oCol;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),f.x),f.y); }
void main(){
  int ty = int(vPar.x+0.5); float r2 = dot(vQ,vQ); float r = sqrt(r2);
  vec3 col = vec3(0.0); float a = 0.0;
  float win = 1.0 - smoothstep(0.82, 1.0, r);
  if (ty==0) { col = vCol.rgb * exp(-r2*vPar.y) * vCol.a * win; }
  else if (ty==1) { // flare: core + cross streaks
    float core = exp(-r2*28.0)*2.2 + exp(-r2*5.0)*0.55;
    float st = exp(-abs(vQ.y)*34.0)*exp(-abs(vQ.x)*2.6) + exp(-abs(vQ.x)*34.0)*exp(-abs(vQ.y)*3.4)*0.6;
    col = (vCol.rgb*(core + st*0.9) + vec3(1.0)*exp(-r2*110.0)*2.5) * vCol.a * win;
  } else if (ty==2) { // ring / shock front
    float rr = vPar.y, th = vPar.z;
    float ring = exp(-pow((r-rr)/th,2.0));
    col = vCol.rgb * ring * vCol.a * win;
  } else if (ty==3) { // dust / smoke puff (premultiplied alpha)
    float nz = n2(vQ*2.2 + vPar.z*17.0)*0.6 + n2(vQ*5.0 + vPar.z*7.0)*0.4;
    float d = exp(-r2*2.6) * smoothstep(0.15, 0.75, nz + 0.35 - r*0.35) * win;
    a = clamp(d*vCol.a, 0.0, 1.0);
    col = vCol.rgb*a + vPar.yyy*vec3(3.2,1.2,0.3)*d*exp(-r2*4.0);
  } else { // hard spark
    col = vCol.rgb * (exp(-r2*9.0) + exp(-r2*60.0)*2.0) * vCol.a * win;
  }
  oCol = vec4(col, a);
}`;

  // ------------------------------------------------------------ shields
  S.shVS = HEAD + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm;
uniform mat4 uVP; uniform mat4 uModel; uniform vec3 uRad; uniform float uScale;
out vec3 vObj; out vec3 vWorld; out vec3 vN;
void main(){ vObj = aPos; vec3 p = aPos*uRad*uScale; vec4 w = uModel*vec4(p,1.0); vWorld = w.xyz; vN = mat3(uModel)*normalize(aNrm/uRad); gl_Position = uVP*w; }`;
  S.shFS = HEAD + `
in vec3 vObj; in vec3 vWorld; in vec3 vN;
uniform vec3 uCam; uniform vec3 uColor; uniform vec4 uSh; // appear, wavePos(+1 bow..-1 stern), stable, seed
uniform float uPhase; uniform float uBack; uniform vec3 uRad;
out vec4 oCol;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  vec3 N = normalize(vN), V = normalize(uCam - vWorld);
  float nv = abs(dot(N,V)); float fr = pow(clamp(1.0-nv, 0.0, 1.0), 3.2);
  float z = vObj.z; float ang = atan(vObj.y, vObj.x);
  float appear = uSh.x, wz = uSh.y;
  // stepped chevron ribs flowing aft, split along the keel/dorsal seam (the fleet's slot motif)
  float split = abs(vObj.x);
  float chev = z*9.0*uRad.z/600.0 + 0.9*floor(abs(sin(ang))*5.0)/5.0;
  float ribPhase = chev*3.0 - uPhase*39.0;
  float rib = pow(1.0 - abs(fract(ribPhase)*2.0-1.0), 14.0);
  float seamLine = exp(-split*split*900.0);
  float gap = smoothstep(0.02, 0.07, split);
  // tiles (plates of light) that switch on behind the deployment wave
  vec2 tile = vec2(floor(ang*7.0/3.14159), floor(chev*1.5));
  float th = hash12(tile + uSh.w);
  float behind = smoothstep(wz-0.05, wz+0.30, z);
  float tileOn = smoothstep(th*0.8, th*0.8+0.25, behind*appear*1.6);
  vec2 tuv = vec2(fract(ang*7.0/3.14159), fract(chev*1.5));
  float tEdge = max(smoothstep(0.42,0.5,abs(tuv.x-0.5)), smoothstep(0.40,0.5,abs(tuv.y-0.5)));
  float band = exp(-pow((z-wz)*5.0,2.0)) * (1.0 - uSh.z);
  float ripple = 0.5+0.5*sin(z*26.0 - uPhase*6.28318*47.0 + sin(ang*3.0)*1.5);
  float flick = 0.75 + 0.5*th;
  float slide = pow(max(0.0, sin(ang*2.0 + z*5.0 - uPhase*6.28318*21.0)), 28.0);
  float I = fr*(0.55 + 0.28*ripple) + rib*gap*(0.055+0.42*fr) + tEdge*0.036*flick*gap + seamLine*0.26 + slide*(0.05+0.35*fr) + 0.003;
  I *= tileOn;
  I += band*(0.9 + 1.4*fr + rib*0.8) * appear;
  I *= mix(1.0, 0.30, uBack);
  vec3 col = uColor*I + vec3(1.0)*pow(fr,3.0)*0.25*tileOn + vec3(1.0)*band*band*0.35*appear;
  col *= appear;
  oCol = vec4(col, 0.0);
}`;

  // ------------------------------------------------------------ post
  S.bloomDownFS = HEAD + `
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uFirst;
out vec4 oCol;
vec3 pre(vec3 c){ if (uFirst < 0.5) return c; if (c.r != c.r || c.g != c.g || c.b != c.b) return vec3(0.0); c = clamp(c, vec3(0.0), vec3(60.0)); float b = max(c.r,max(c.g,c.b)); float k = max(b-0.95,0.0); k = k*k/(k+0.6); return c*(k/max(b,1e-4)); }
void main(){
  vec3 a = pre(texture(uTex, vUV + uTexel*vec2(-1.0,-1.0)).rgb), b = pre(texture(uTex, vUV + uTexel*vec2(1.0,-1.0)).rgb);
  vec3 c = pre(texture(uTex, vUV + uTexel*vec2(-1.0,1.0)).rgb), d = pre(texture(uTex, vUV + uTexel*vec2(1.0,1.0)).rgb);
  vec3 e = pre(texture(uTex, vUV).rgb);
  vec3 f = pre(texture(uTex, vUV + uTexel*vec2(-2.0,0.0)).rgb), g = pre(texture(uTex, vUV + uTexel*vec2(2.0,0.0)).rgb);
  vec3 h = pre(texture(uTex, vUV + uTexel*vec2(0.0,-2.0)).rgb), i = pre(texture(uTex, vUV + uTexel*vec2(0.0,2.0)).rgb);
  oCol = vec4((a+b+c+d)*0.125 + e*0.25 + (f+g+h+i)*0.0625, 1.0);
}`;
  S.bloomUpFS = HEAD + `
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uTexel;
out vec4 oCol;
void main(){
  vec3 s = texture(uTex, vUV).rgb*4.0;
  s += (texture(uTex, vUV+uTexel*vec2(1,0)).rgb + texture(uTex, vUV+uTexel*vec2(-1,0)).rgb + texture(uTex, vUV+uTexel*vec2(0,1)).rgb + texture(uTex, vUV+uTexel*vec2(0,-1)).rgb)*2.0;
  s += texture(uTex, vUV+uTexel*vec2(1,1)).rgb + texture(uTex, vUV+uTexel*vec2(-1,1)).rgb + texture(uTex, vUV+uTexel*vec2(1,-1)).rgb + texture(uTex, vUV+uTexel*vec2(-1,-1)).rgb;
  oCol = vec4(s/16.0, 1.0);
}`;
  S.compFS = HEAD + `
in vec2 vUV; uniform sampler2D uScene; uniform sampler2D uB0; uniform sampler2D uB1; uniform sampler2D uB2; uniform sampler2D uB3; uniform sampler2D uB4; uniform sampler2D uB5;
uniform float uExposure; uniform float uBloom; uniform float uFade; uniform vec2 uRes;
out vec4 oCol;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  vec3 c = texture(uScene, vUV).rgb; if (c.r != c.r || c.g != c.g || c.b != c.b) c = vec3(0.0); c = max(c, vec3(0.0));
  vec3 b = texture(uB0,vUV).rgb*0.30 + texture(uB1,vUV).rgb*0.24 + texture(uB2,vUV).rgb*0.18 + texture(uB3,vUV).rgb*0.13 + texture(uB4,vUV).rgb*0.09 + texture(uB5,vUV).rgb*0.06;
  c = c + b*uBloom;
  c *= uExposure;
  // gentle hue-preserving shoulder before ACES so saturated glows keep a coloured rim
  float l = max(c.r, max(c.g, c.b));
  c = mix(c, vec3(l), smoothstep(2.5, 14.0, l)*0.55);
  c = aces(c*0.78);
  vec2 q = vUV-0.5; float vig = 1.0 - dot(q,q)*0.55; c *= vig;
  c = pow(c, vec3(1.0/2.2));
  c *= uFade;
  c += (hash12(gl_FragCoord.xy) - 0.5)/255.0;
  oCol = vec4(c, dot(c, vec3(0.299,0.587,0.114)));
}`;
  S.fxaaFS = HEAD + `
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uTexel;
out vec4 oCol;
void main(){
  vec3 rgbM = texture(uTex, vUV).rgb;
  float lM = texture(uTex, vUV).a;
  float lNW = texture(uTex, vUV + uTexel*vec2(-1.0,-1.0)).a, lNE = texture(uTex, vUV + uTexel*vec2(1.0,-1.0)).a;
  float lSW = texture(uTex, vUV + uTexel*vec2(-1.0,1.0)).a, lSE = texture(uTex, vUV + uTexel*vec2(1.0,1.0)).a;
  float lMin = min(lM, min(min(lNW,lNE), min(lSW,lSE))), lMax = max(lM, max(max(lNW,lNE), max(lSW,lSE)));
  if (lMax - lMin < max(0.035, lMax*0.10)) { oCol = vec4(rgbM, 1.0); return; }
  vec2 dir = vec2(-((lNW+lNE)-(lSW+lSE)), ((lNW+lSW)-(lNE+lSE)));
  float dr = max((lNW+lNE+lSW+lSE)*0.03125, 1.0/128.0);
  float rc = 1.0/(min(abs(dir.x),abs(dir.y)) + dr);
  dir = clamp(dir*rc, vec2(-6.0), vec2(6.0))*uTexel;
  vec3 A = 0.5*(texture(uTex, vUV + dir*(1.0/3.0-0.5)).rgb + texture(uTex, vUV + dir*(2.0/3.0-0.5)).rgb);
  vec3 B = A*0.5 + 0.25*(texture(uTex, vUV + dir*-0.5).rgb + texture(uTex, vUV + dir*0.5).rgb);
  float lB = dot(B, vec3(0.299,0.587,0.114));
  oCol = vec4((lB < lMin || lB > lMax) ? A : B, 1.0);
}`;
  S.NL = NL;
})();
