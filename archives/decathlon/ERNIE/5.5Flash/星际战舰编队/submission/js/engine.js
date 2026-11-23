(function(){
'use strict';

const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl2', {
  antialias: false,
  alpha: false,
  depth: true,
  stencil: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: false
});
if (!gl) {
  document.getElementById('loading').innerHTML = '<div class="box">需要支持 WebGL 2 的 Chrome</div>';
  throw new Error('WebGL2 unavailable');
}
const hasFloat = !!gl.getExtension('EXT_color_buffer_float');

/* ------------------------------------------------------------------ */
/* math                                                                */
/* ------------------------------------------------------------------ */
const M4 = {
  identity(){ return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
  mul(a,b){
    const o = new Float32Array(16);
    for(let c=0;c<4;c++){
      const b0=b[c*4], b1=b[c*4+1], b2=b[c*4+2], b3=b[c*4+3];
      o[c*4  ] = a[0]*b0 + a[4]*b1 + a[8 ]*b2 + a[12]*b3;
      o[c*4+1] = a[1]*b0 + a[5]*b1 + a[9 ]*b2 + a[13]*b3;
      o[c*4+2] = a[2]*b0 + a[6]*b1 + a[10]*b2 + a[14]*b3;
      o[c*4+3] = a[3]*b0 + a[7]*b1 + a[11]*b2 + a[15]*b3;
    }
    return o;
  },
  perspective(fovy, aspect, near, far){
    const f = 1/Math.tan(fovy*0.5);
    const nf = 1/(near-far);
    return new Float32Array([
      f/aspect,0,0,0,
      0,f,0,0,
      0,0,(far+near)*nf,-1,
      0,0,2*far*near*nf,0
    ]);
  },
  lookAt(eye, target, up){
    let zx=eye[0]-target[0], zy=eye[1]-target[1], zz=eye[2]-target[2];
    let l=Math.hypot(zx,zy,zz)||1; zx/=l; zy/=l; zz/=l;
    let xx=up[1]*zz-up[2]*zy, xy=up[2]*zx-up[0]*zz, xz=up[0]*zy-up[1]*zx;
    l=Math.hypot(xx,xy,xz)||1; xx/=l; xy/=l; xz/=l;
    const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
    return new Float32Array([
      xx,yx,zx,0,
      xy,yy,zy,0,
      xz,yz,zz,0,
      -(xx*eye[0]+xy*eye[1]+xz*eye[2]),
      -(yx*eye[0]+yy*eye[1]+yz*eye[2]),
      -(zx*eye[0]+zy*eye[1]+zz*eye[2]),1
    ]);
  },
  translation(x,y,z){ if(Array.isArray(x)){ z=x[2]; y=x[1]; x=x[0]; } return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]); },
  scaling(x,y,z){ return new Float32Array([x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]); },
  rotX(a){ const c=Math.cos(a),s=Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); },
  rotY(a){ const c=Math.cos(a),s=Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); },
  rotZ(a){ const c=Math.cos(a),s=Math.sin(a); return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); },
  compose(pos, rot, scale){
    let m = M4.translation(pos[0],pos[1],pos[2]);
    if(rot){
      m = M4.mul(m, M4.rotY(rot[1]||0));
      m = M4.mul(m, M4.rotX(rot[0]||0));
      m = M4.mul(m, M4.rotZ(rot[2]||0));
    }
    if(scale) m = M4.mul(m, M4.scaling(scale[0],scale[1],scale[2]));
    return m;
  },
  invert(m){
    const a00=m[0],a01=m[1],a02=m[2],a03=m[3];
    const a10=m[4],a11=m[5],a12=m[6],a13=m[7];
    const a20=m[8],a21=m[9],a22=m[10],a23=m[11];
    const a30=m[12],a31=m[13],a32=m[14],a33=m[15];
    const b00=a00*a11-a01*a10, b01=a00*a12-a02*a10, b02=a00*a13-a03*a10;
    const b03=a01*a12-a02*a11, b04=a01*a13-a03*a11, b05=a02*a13-a03*a12;
    const b06=a20*a31-a21*a30, b07=a20*a32-a22*a30, b08=a20*a33-a23*a30;
    const b09=a21*a32-a22*a31, b10=a21*a33-a23*a31, b11=a22*a33-a23*a32;
    let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
    if(!det) return M4.identity();
    det=1/det;
    return new Float32Array([
      (a11*b11-a12*b10+a13*b09)*det,
      (a02*b10-a01*b11-a03*b09)*det,
      (a31*b05-a32*b04+a33*b03)*det,
      (a22*b04-a21*b05-a23*b03)*det,
      (a12*b08-a10*b11-a13*b07)*det,
      (a00*b11-a02*b08+a03*b07)*det,
      (a32*b02-a30*b05-a33*b01)*det,
      (a20*b05-a22*b02+a23*b01)*det,
      (a10*b10-a11*b08+a13*b06)*det,
      (a01*b08-a00*b10-a03*b06)*det,
      (a30*b04-a31*b02+a33*b00)*det,
      (a21*b02-a20*b04-a23*b00)*det,
      (a11*b07-a10*b09-a12*b06)*det,
      (a00*b09-a01*b07+a02*b06)*det,
      (a31*b01-a30*b03-a32*b00)*det,
      (a20*b03-a21*b01+a22*b00)*det
    ]);
  },
  transformPoint(m,p){
    const x=p[0],y=p[1],z=p[2];
    return [
      m[0]*x+m[4]*y+m[8]*z+m[12],
      m[1]*x+m[5]*y+m[9]*z+m[13],
      m[2]*x+m[6]*y+m[10]*z+m[14]
    ];
  },
  transformDir(m,d){
    const x=d[0],y=d[1],z=d[2];
    return [
      m[0]*x+m[4]*y+m[8]*z,
      m[1]*x+m[5]*y+m[9]*z,
      m[2]*x+m[6]*y+m[10]*z
    ];
  },
  normalMat(m){
    // inverse transpose of upper-left 3x3
    const a00=m[0],a01=m[4],a02=m[8];
    const a10=m[1],a11=m[5],a12=m[9];
    const a20=m[2],a21=m[6],a22=m[10];
    const b01=a22*a11-a12*a21, b11=-a22*a10+a12*a20, b21=a21*a10-a11*a20;
    let det=a00*b01+a01*b11+a02*b21;
    if(!det) return new Float32Array([1,0,0,0,1,0,0,0,1]);
    det=1/det;
    return new Float32Array([
      b01*det, (-a22*a01+a02*a21)*det, (a12*a01-a02*a11)*det,
      b11*det, (a22*a00-a02*a20)*det, (-a12*a00+a02*a10)*det,
      b21*det, (-a21*a00+a01*a20)*det, (a11*a00-a01*a10)*det
    ]);
  }
};

/* ------------------------------------------------------------------ */
/* shader helpers                                                      */
/* ------------------------------------------------------------------ */
function compile(type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
    const log = gl.getShaderInfoLog(s);
    console.error('Shader compile error:', log, '\n', src);
    throw new Error(log);
  }
  return s;
}
function program(vs, fs){
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)){
    const log = gl.getProgramInfoLog(p);
    console.error('Program link error:', log);
    throw new Error(log);
  }
  return p;
}

/* ------------------------------------------------------------------ */
/* shaders                                                             */
/* ------------------------------------------------------------------ */
const MESH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in float aGlow;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vColor;
out float vGlow;
void main(){
  vec4 wp = uModel * vec4(aPos,1.0);
  vWorld = wp.xyz;
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  vGlow = aGlow;
  gl_Position = uViewProj * wp;
}`;

const MESH_FS = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vColor;
in float vGlow;
uniform vec3 uCam;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uPointPos[8];
uniform vec3 uPointColor[8];
uniform float uPointInt[8];
uniform vec3 uTint;
uniform float uTime;
out vec4 fragColor;
void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCam - vWorld);
  vec3 L = normalize(uLightDir);
  vec3 base = vColor * uTint;
  float ndl = max(dot(N,L),0.0);
  vec3 col = base * (uAmbient + uLightColor * ndl);
  // cool fill from the opposite side keeps shadowed voxel faces readable
  vec3 fillDir = normalize(vec3(0.38,-0.22,-0.58));
  float ndf = max(dot(N,fillDir),0.0);
  col += base * vec3(0.24,0.31,0.43) * ndf;
  col += base * vec3(0.035,0.045,0.06) * (0.5+0.5*N.y);
  vec3 H = normalize(L+V);
  float spec = pow(max(dot(N,H),0.0), 56.0);
  col += uLightColor * spec * 0.45 * (1.0 - vGlow);
  float rim = pow(1.0 - max(dot(N,V),0.0), 3.0);
  col += base * rim * 0.30 * (1.0 - vGlow*0.4);
  for(int i=0;i<8;i++){
    vec3 d = uPointPos[i] - vWorld;
    float dist2 = dot(d,d);
    float att = uPointInt[i] / (1.0 + dist2 * 0.0014);
    vec3 Lp = d * inversesqrt(max(dist2,0.0001));
    float nd = max(dot(N,Lp),0.0);
    col += base * uPointColor[i] * att * nd;
    vec3 Hp = normalize(Lp+V);
    col += uPointColor[i] * att * pow(max(dot(N,Hp),0.0), 40.0) * 0.30;
  }
  float pulse = 0.85 + 0.15 * sin(uTime*2.1 + vWorld.y*0.08 + vWorld.z*0.03);
  col += base * vGlow * 1.0 * pulse;
  float dist = length(uCam - vWorld);
  float fog = 1.0 - exp(-dist * uFogDensity);
  col = mix(col, uFogColor, clamp(fog,0.0,1.0));
  fragColor = vec4(col,1.0);
}`;

const SKY_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform mat4 uInvViewProj;
uniform vec3 uCam;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uPlanetDir;
out vec4 fragColor;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx)*0.1031);
  p3 += dot(p3, p3.yzx+33.33);
  return fract((p3.x+p3.y)*p3.z);
}
float hash13(vec3 p3){
  p3 = fract(p3*0.1031);
  p3 += dot(p3, p3.zyx+31.32);
  return fract((p3.x+p3.y)*p3.z);
}
float vnoise(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float n000=hash13(i+vec3(0,0,0));
  float n100=hash13(i+vec3(1,0,0));
  float n010=hash13(i+vec3(0,1,0));
  float n110=hash13(i+vec3(1,1,0));
  float n001=hash13(i+vec3(0,0,1));
  float n101=hash13(i+vec3(1,0,1));
  float n011=hash13(i+vec3(0,1,1));
  float n111=hash13(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),
             mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);
}
float fbm(vec3 p){
  float v=0.0, a=0.5;
  for(int i=0;i<5;i++){ v += a*vnoise(p); p = p*2.03 + vec3(1.7,9.2,3.1); a*=0.5; }
  return v;
}
void main(){
  vec2 ndc = vUv*2.0-1.0;
  vec4 p = uInvViewProj * vec4(ndc,1.0,1.0);
  vec3 dir = normalize(p.xyz/p.w - uCam);

  vec3 col = vec3(0.006,0.012,0.025);

  // deep nebula layers
  vec3 q = dir*2.2 + vec3(0.0,0.0,uTime*0.004);
  float n1 = fbm(q);
  float n2 = fbm(q*2.1 + 5.3);
  float band = smoothstep(0.25,0.85, n1*0.65 + n2*0.35);
  vec3 neb = mix(vec3(0.015,0.070,0.110), vec3(0.105,0.040,0.150), n2);
  col += neb * band * 0.95;
  float band2 = exp(-pow((dir.y*2.6 + dir.x*0.55 + 0.2),2.0)*3.5);
  col += vec3(0.045,0.055,0.095) * band2 * (0.45+0.55*n1);

  // stars, three densities
  for(int i=0;i<3;i++){
    float fi=float(i);
    float scale = 65.0 + fi*95.0;
    vec3 sp = dir*scale;
    vec3 cell = floor(sp);
    vec3 f = fract(sp);
    float h = hash13(cell + fi*19.7);
    vec3 spos = vec3(hash13(cell+1.31), hash13(cell+2.77), hash13(cell+4.13));
    float d = length(f - spos);
    float star = smoothstep(0.16,0.0,d) * step(0.972 - fi*0.006, h);
    float tw = 0.72 + 0.28*sin(uTime*(1.3+fi*0.7) + h*37.0);
    col += mix(vec3(0.65,0.82,1.0), vec3(1.0,0.88,0.72), hash13(cell+7.7))
         * star * tw * (1.0 - fi*0.18);
  }

  // sun
  vec3 sd = normalize(uSunDir);
  float sdot = max(dot(dir,sd),0.0);
  col += vec3(1.0,0.84,0.62) * pow(sdot,320.0) * 4.0;
  col += vec3(1.0,0.66,0.38) * pow(sdot,9.0) * 0.075;

  // planet with atmosphere
  vec3 pc = normalize(uPlanetDir);
  float ang = acos(clamp(dot(dir,pc),-1.0,1.0));
  float R = 0.40;
  if(ang < R*1.22){
    vec3 t1 = normalize(cross(pc, vec3(0.0,1.0,0.0)));
    vec3 t2 = cross(pc,t1);
    vec2 uv = vec2(dot(dir,t1), dot(dir,t2))/R;
    float r2 = dot(uv,uv);
    if(r2 < 1.0){
      vec3 n = normalize(t1*uv.x + t2*uv.y - pc*sqrt(max(0.0,1.0-r2)));
      float lam = max(dot(n,sd),0.0);
      float bands = 0.5+0.5*sin(n.y*16.0 + fbm(n*3.2)*5.0 + n.x*2.0);
      vec3 pcol = mix(vec3(0.10,0.17,0.23), vec3(0.38,0.48,0.53), bands);
      pcol *= (0.12 + lam*0.95);
      col = pcol;
      float rim = pow(1.0 - max(dot(n,-dir),0.0), 3.0);
      col += vec3(0.18,0.48,0.78) * rim * 0.55;
    }
    float atmo = exp(-pow((ang-R)/0.022,2.0)) * 0.55;
    col += vec3(0.18,0.48,0.78) * atmo;
  }

  // subtle dithering
  col += (hash12(gl_FragCoord.xy)-0.5)*0.0022;
  fragColor = vec4(col,1.0);
}`;

const SPRITE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 aCenter;
layout(location=2) in vec4 aColor;
layout(location=3) in vec2 aSize;
layout(location=4) in float aRot;
uniform mat4 uViewProj;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
out vec2 vUv;
out vec4 vColor;
void main(){
  float c=cos(aRot), s=sin(aRot);
  vec2 q = vec2(aCorner.x*c - aCorner.y*s, aCorner.x*s + aCorner.y*c);
  vec3 pos = aCenter + uCamRight*(q.x*aSize.x) + uCamUp*(q.y*aSize.y);
  vUv = aCorner;
  vColor = aColor;
  gl_Position = uViewProj * vec4(pos,1.0);
}`;

const SPRITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vColor;
out vec4 fragColor;
void main(){
  float d = length(vUv);
  float a = smoothstep(1.0,0.0,d);
  a = a*a*(3.0-2.0*a);
  fragColor = vec4(vColor.rgb * vColor.a * a, 1.0);
}`;

const STREAK_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 aCenter;
layout(location=2) in vec3 aDir;
layout(location=3) in vec2 aSize;
layout(location=4) in vec4 aColor;
uniform mat4 uViewProj;
uniform vec3 uCam;
out vec2 vUv;
out vec4 vColor;
void main(){
  vec3 axis = normalize(aDir);
  vec3 toCam = normalize(uCam - aCenter);
  vec3 side = cross(axis, toCam);
  side = length(side) > 0.0001 ? normalize(side) : vec3(1.0,0.0,0.0);
  vec3 pos = aCenter + axis*(aCorner.x*aSize.x*0.5) + side*(aCorner.y*aSize.y*0.5);
  vUv = aCorner;
  vColor = aColor;
  gl_Position = uViewProj * vec4(pos,1.0);
}`;

const STREAK_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vColor;
out vec4 fragColor;
void main(){
  float across = max(0.0, 1.0 - abs(vUv.y));
  float along = max(0.0, 1.0 - abs(vUv.x));
  float a = across*across * (0.25 + 0.75*along);
  fragColor = vec4(vColor.rgb * vColor.a * a, 1.0);
}`;

const BEAM_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec2 vUv;
out vec3 vNormal;
out vec3 vWorld;
void main(){
  vec4 wp = uModel * vec4(aPos,1.0);
  vWorld = wp.xyz;
  vNormal = mat3(uModel) * aNormal;
  vUv = aUv;
  gl_Position = uViewProj * wp;
}`;

const BEAM_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uCam;
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
out vec4 fragColor;
void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCam - vWorld);
  float facing = abs(dot(N,V));
  float core = pow(facing, 2.2);
  float n = 0.72 + 0.28*sin(vUv.y*55.0 - uTime*22.0 + sin(vUv.x*18.0)*2.2);
  float a = (0.12 + core*0.88) * n;
  a *= smoothstep(0.0,0.04,vUv.y) * smoothstep(1.0,0.96,vUv.y);
  a *= uIntensity;
  fragColor = vec4(uColor * a, 1.0);
}`;

const SHIELD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat3 uNormalMat;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vLocal;
void main(){
  vec4 wp = uModel * vec4(aPos,1.0);
  vWorld = wp.xyz;
  vNormal = normalize(uNormalMat * aNormal);
  vLocal = aPos;
  gl_Position = uViewProj * wp;
}`;

const SHIELD_FS = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vLocal;
uniform vec3 uCam;
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
out vec4 fragColor;
float hexline(vec2 p){
  p.x *= 1.1547;
  p.y += mod(floor(p.x),2.0)*0.5;
  vec2 f = abs(fract(p)-0.5);
  float d = max(f.x,f.y);
  return smoothstep(0.44,0.5,d);
}
void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCam - vWorld);
  float fres = pow(1.0 - abs(dot(N,V)), 2.4);
  vec2 uv = vec2(atan(vLocal.z,vLocal.x)/6.2831853, asin(clamp(vLocal.y,-1.0,1.0))/3.1415926);
  float hx = hexline(uv*vec2(26.0,13.0) + vec2(uTime*0.06,0.0));
  float bands = 0.5+0.5*sin(uv.y*34.0 - uTime*2.2);
  float ripple = 0.5+0.5*sin(length(vLocal.xz)*9.0 - uTime*3.1);
  float a = fres*0.95 + hx*0.18*bands + ripple*0.05;
  a *= uOpacity;
  fragColor = vec4(uColor * a, 1.0);
}`;

const FS_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uThreshold;
out vec4 fragColor;
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  float l = max(c.r,max(c.g,c.b));
  float k = smoothstep(uThreshold, uThreshold+0.35, l);
  fragColor = vec4(c*k,1.0);
}`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 fragColor;
void main(){
  vec3 c = texture(uTex,vUv).rgb * 0.227027;
  c += texture(uTex,vUv+uDir*1.3846).rgb * 0.316216;
  c += texture(uTex,vUv-uDir*1.3846).rgb * 0.316216;
  c += texture(uTex,vUv+uDir*3.2308).rgb * 0.070270;
  c += texture(uTex,vUv-uDir*3.2308).rgb * 0.070270;
  fragColor = vec4(c,1.0);
}`;

const COMP_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uExposure;
out vec4 fragColor;
vec3 aces(vec3 x){
  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);
}
void main(){
  vec2 uv = vUv;
  vec3 c = texture(uScene,uv).rgb;
  vec3 b = texture(uBloom,uv).rgb;
  c += b * uBloomStrength;
  c *= uExposure;
  c = aces(c);
  // gentle vignette
  vec2 q = uv-0.5;
  float vig = 1.0 - dot(q,q)*0.55;
  c *= vig;
  // subtle filmic dither
  float d = fract(sin(dot(uv,vec2(12.9898,78.233)))*43758.5453);
  c += (d-0.5)*0.0035;
  fragColor = vec4(c,1.0);
}`;

/* ------------------------------------------------------------------ */
/* programs / geometry                                                 */
/* ------------------------------------------------------------------ */
const progMesh = program(MESH_VS, MESH_FS);
const progSky = program(SKY_VS, SKY_FS);
const progSprite = program(SPRITE_VS, SPRITE_FS);
const progStreak = program(STREAK_VS, STREAK_FS);
const progBeam = program(BEAM_VS, BEAM_FS);
const progShield = program(SHIELD_VS, SHIELD_FS);
const progBright = program(FS_VS, BRIGHT_FS);
const progBlur = program(FS_VS, BLUR_FS);
const progComp = program(FS_VS, COMP_FS);

const U = {
  mesh: {
    viewProj: gl.getUniformLocation(progMesh,'uViewProj'),
    model: gl.getUniformLocation(progMesh,'uModel'),
    cam: gl.getUniformLocation(progMesh,'uCam'),
    lightDir: gl.getUniformLocation(progMesh,'uLightDir'),
    lightColor: gl.getUniformLocation(progMesh,'uLightColor'),
    ambient: gl.getUniformLocation(progMesh,'uAmbient'),
    fogColor: gl.getUniformLocation(progMesh,'uFogColor'),
    fogDensity: gl.getUniformLocation(progMesh,'uFogDensity'),
    pointPos: gl.getUniformLocation(progMesh,'uPointPos[0]'),
    pointColor: gl.getUniformLocation(progMesh,'uPointColor[0]'),
    pointInt: gl.getUniformLocation(progMesh,'uPointInt[0]'),
    tint: gl.getUniformLocation(progMesh,'uTint'),
    time: gl.getUniformLocation(progMesh,'uTime')
  },
  sky: {
    invVP: gl.getUniformLocation(progSky,'uInvViewProj'),
    cam: gl.getUniformLocation(progSky,'uCam'),
    time: gl.getUniformLocation(progSky,'uTime'),
    sun: gl.getUniformLocation(progSky,'uSunDir'),
    planet: gl.getUniformLocation(progSky,'uPlanetDir')
  },
  sprite: {
    viewProj: gl.getUniformLocation(progSprite,'uViewProj'),
    right: gl.getUniformLocation(progSprite,'uCamRight'),
    up: gl.getUniformLocation(progSprite,'uCamUp')
  },
  streak: {
    viewProj: gl.getUniformLocation(progStreak,'uViewProj'),
    cam: gl.getUniformLocation(progStreak,'uCam')
  },
  beam: {
    viewProj: gl.getUniformLocation(progBeam,'uViewProj'),
    model: gl.getUniformLocation(progBeam,'uModel'),
    cam: gl.getUniformLocation(progBeam,'uCam'),
    color: gl.getUniformLocation(progBeam,'uColor'),
    time: gl.getUniformLocation(progBeam,'uTime'),
    intensity: gl.getUniformLocation(progBeam,'uIntensity')
  },
  shield: {
    viewProj: gl.getUniformLocation(progShield,'uViewProj'),
    model: gl.getUniformLocation(progShield,'uModel'),
    normalMat: gl.getUniformLocation(progShield,'uNormalMat'),
    cam: gl.getUniformLocation(progShield,'uCam'),
    time: gl.getUniformLocation(progShield,'uTime'),
    opacity: gl.getUniformLocation(progShield,'uOpacity'),
    color: gl.getUniformLocation(progShield,'uColor')
  },
  bright: { tex: gl.getUniformLocation(progBright,'uTex'), threshold: gl.getUniformLocation(progBright,'uThreshold') },
  blur: { tex: gl.getUniformLocation(progBlur,'uTex'), dir: gl.getUniformLocation(progBlur,'uDir') },
  comp: { scene: gl.getUniformLocation(progComp,'uScene'), bloom: gl.getUniformLocation(progComp,'uBloom'),
          strength: gl.getUniformLocation(progComp,'uBloomStrength'), exposure: gl.getUniformLocation(progComp,'uExposure') }
};

// fullscreen quad
const fsVao = gl.createVertexArray();
gl.bindVertexArray(fsVao);
const fsBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, fsBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
gl.bindVertexArray(null);

function createMesh(positions, normals, colors, glows, indices){
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const mk = (data, loc, size, type, norm)=>{
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, type, !!norm, 0, 0);
    return b;
  };
  mk(positions, 0, 3, gl.FLOAT, false);
  mk(normals, 1, 3, gl.FLOAT, false);
  mk(colors, 2, 3, gl.UNSIGNED_BYTE, true);
  mk(glows, 3, 1, gl.UNSIGNED_BYTE, true);
  let ib=null, count=0, itype=gl.UNSIGNED_INT;
  if(indices){
    ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    count = indices.length;
    itype = gl.UNSIGNED_INT;
  } else {
    count = positions.length/3;
  }
  gl.bindVertexArray(null);
  return {vao, count, itype, ib};
}

function createSphere(radius, seg, rings){
  const pos=[], nor=[], idx=[];
  for(let y=0;y<=rings;y++){
    const v = y/rings, phi = v*Math.PI;
    for(let x=0;x<=seg;x++){
      const u=x/seg, th=u*Math.PI*2;
      const nx=Math.sin(phi)*Math.cos(th), ny=Math.cos(phi), nz=Math.sin(phi)*Math.sin(th);
      pos.push(nx*radius, ny*radius, nz*radius);
      nor.push(nx,ny,nz);
    }
  }
  const row=seg+1;
  for(let y=0;y<rings;y++) for(let x=0;x<seg;x++){
    const a=y*row+x, b=a+1, c=a+row, d=c+1;
    idx.push(a,c,b, b,c,d);
  }
  return createMesh(new Float32Array(pos), new Float32Array(nor), new Uint8Array(pos.length), new Uint8Array(pos.length/3), new Uint32Array(idx));
}

function createCylinder(radius, seg, len){
  const pos=[], nor=[], uv=[], idx=[];
  for(let i=0;i<=seg;i++){
    const a=i/seg*Math.PI*2, c=Math.cos(a), s=Math.sin(a);
    pos.push(c*radius, s*radius, 0, c*radius, s*radius, len);
    nor.push(c, s, 0, c, s, 0);
    uv.push(i/seg, 0, i/seg, 1);
  }
  for(let i=0;i<seg;i++){
    const a=i*2, b=a+1, c=a+2, d=a+3;
    idx.push(a,b,c, c,b,d);
  }
  const col = new Uint8Array(pos.length).fill(255);
  return {vao:null, data:{pos:new Float32Array(pos), nor:new Float32Array(nor), uv:new Float32Array(uv), idx:new Uint32Array(idx)}};
}

const sphereMesh = createSphere(1, 48, 28);
const shieldMesh = createSphere(1, 64, 40);

// dynamic sprite/streak buffers
const spriteGeo = gl.createVertexArray();
gl.bindVertexArray(spriteGeo);
const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, 1,1, -1,1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
const spriteInstBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, spriteInstBuf);
const SPRITE_FLOATS = 3+4+2+1;
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,SPRITE_FLOATS*4,0); gl.vertexAttribDivisor(1,1);
gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,4,gl.FLOAT,false,SPRITE_FLOATS*4,3*4); gl.vertexAttribDivisor(2,1);
gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,2,gl.FLOAT,false,SPRITE_FLOATS*4,7*4); gl.vertexAttribDivisor(3,1);
gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4,1,gl.FLOAT,false,SPRITE_FLOATS*4,9*4); gl.vertexAttribDivisor(4,1);
const spriteIdx = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spriteIdx);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2, 0,2,3]), gl.STATIC_DRAW);
gl.bindVertexArray(null);

const streakGeo = gl.createVertexArray();
gl.bindVertexArray(streakGeo);
const streakQuadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, streakQuadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, 1,1, -1,1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
const streakInstBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, streakInstBuf);
const STREAK_FLOATS = 3+3+2+4;
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,STREAK_FLOATS*4,0); gl.vertexAttribDivisor(1,1);
gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,3,gl.FLOAT,false,STREAK_FLOATS*4,3*4); gl.vertexAttribDivisor(2,1);
gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,2,gl.FLOAT,false,STREAK_FLOATS*4,6*4); gl.vertexAttribDivisor(3,1);
gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4,4,gl.FLOAT,false,STREAK_FLOATS*4,8*4); gl.vertexAttribDivisor(4,1);
const streakIdx = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, streakIdx);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2, 0,2,3]), gl.STATIC_DRAW);
gl.bindVertexArray(null);

// beam cylinder
const beamMesh = (()=>{
  const d = createCylinder(1, 24, 1);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const mk=(data,loc,size)=>{ const b=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,b); gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0); };
  mk(d.data.pos,0,3); mk(d.data.nor,1,3); mk(d.data.uv,2,2);
  const ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,d.data.idx,gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return {vao, count:d.data.idx.length};
})();

// dynamic cube mesh for debris/energy blocks
function createCube(){
  const p=[], n=[], c=[], g=[], idx=[];
  const faces = [
    {n:[1,0,0], v:[[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]]},
    {n:[-1,0,0],v:[[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]]},
    {n:[0,1,0], v:[[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]]},
    {n:[0,-1,0],v:[[-.5,-.5,.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]]},
    {n:[0,0,1], v:[[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]]},
    {n:[0,0,-1],v:[[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]]}
  ];
  for(const f of faces){
    const base=p.length/3;
    for(const v of f.v){ p.push(v[0],v[1],v[2]); n.push(f.n[0],f.n[1],f.n[2]); c.push(255,255,255); g.push(0); }
    idx.push(base,base+1,base+2, base,base+2,base+3);
  }
  return createMesh(new Float32Array(p), new Float32Array(n), new Uint8Array(c), new Uint8Array(g), new Uint32Array(idx));
}
const cubeMesh = createCube();

/* ------------------------------------------------------------------ */
/* framebuffers                                                        */
/* ------------------------------------------------------------------ */
let W=1, H=1;
let sceneFB=null, sceneTex=null, sceneDepth=null;
let bloomA=null, bloomB=null, bloomAW=1, bloomAH=1;

function makeTex(w,h,internal,format,type){
  const t=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texImage2D(gl.TEXTURE_2D,0,internal,w,h,0,format,type,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  return t;
}
function makeFB(tex){
  const f=gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
  return f;
}
function destroyFB(fb,tex){
  if(fb) gl.deleteFramebuffer(fb);
  if(tex) gl.deleteTexture(tex);
}
function allocTargets(w,h){
  if(sceneFB) destroyFB(sceneFB,sceneTex);
  if(sceneDepth) gl.deleteRenderbuffer(sceneDepth);
  if(bloomA) { destroyFB(bloomA.fb,bloomA.tex); destroyFB(bloomB.fb,bloomB.tex); }
  W=w; H=h;
  const internal = hasFloat ? gl.RGBA16F : gl.RGBA8;
  const type = hasFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  sceneTex = makeTex(w,h,internal,gl.RGBA,type);
  sceneFB = makeFB(sceneTex);
  sceneDepth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER,sceneDepth);
  gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,w,h);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,sceneDepth);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);

  bloomAW = Math.max(1, Math.floor(w/2));
  bloomAH = Math.max(1, Math.floor(h/2));
  const tA=makeTex(bloomAW,bloomAH,internal,gl.RGBA,type);
  const fA=makeFB(tA);
  const tB=makeTex(bloomAW,bloomAH,internal,gl.RGBA,type);
  const fB=makeFB(tB);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  bloomA={fb:fA,tex:tA}; bloomB={fb:fB,tex:tB};
}

function resize(){
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  let w = Math.max(1, Math.floor(window.innerWidth*dpr));
  let h = Math.max(1, Math.floor(window.innerHeight*dpr));
  const maxDim = 3840;
  const scale = Math.min(1, maxDim/Math.max(w,h));
  w = Math.floor(w*scale); h = Math.floor(h*scale);
  if(w===W && h===H) return;
  canvas.width=w; canvas.height=h;
  canvas.style.width='100%'; canvas.style.height='100%';
  allocTargets(w,h);
}
window.addEventListener('resize', resize);

/* ------------------------------------------------------------------ */
/* renderer state                                                      */
/* ------------------------------------------------------------------ */
const state = {
  camera: null,
  sprites: [],
  streaks: [],
  pointPos: new Float32Array(24),
  pointColor: new Float32Array(24),
  pointInt: new Float32Array(8),
  fogColor: [0.008,0.016,0.030],
  fogDensity: 0.00022,
  ambient: [0.10,0.13,0.18],
  lightDir: [0.45,0.55,-0.70],
  lightColor: [1.15,1.05,0.92]
};

function setCamera(cam){
  state.camera = cam;
  gl.useProgram(progMesh);
  gl.uniformMatrix4fv(U.mesh.viewProj,false,cam.vp);
  gl.uniform3fv(U.mesh.cam,cam.pos);
  gl.uniform3fv(U.mesh.lightDir,state.lightDir);
  gl.uniform3fv(U.mesh.lightColor,state.lightColor);
  gl.uniform3fv(U.mesh.ambient,state.ambient);
  gl.uniform3fv(U.mesh.fogColor,state.fogColor);
  gl.uniform1f(U.mesh.fogDensity,state.fogDensity);
  gl.uniform3fv(U.mesh.pointPos,state.pointPos);
  gl.uniform3fv(U.mesh.pointColor,state.pointColor);
  gl.uniform1fv(U.mesh.pointInt,state.pointInt);
  gl.uniform1f(U.mesh.time,0);
  gl.uniform3f(U.mesh.tint,1,1,1);

  gl.useProgram(progSprite);
  gl.uniformMatrix4fv(U.sprite.viewProj,false,cam.vp);
  gl.uniform3fv(U.sprite.right,cam.right);
  gl.uniform3fv(U.sprite.up,cam.up);

  gl.useProgram(progStreak);
  gl.uniformMatrix4fv(U.streak.viewProj,false,cam.vp);
  gl.uniform3fv(U.streak.cam,cam.pos);

  gl.useProgram(progSky);
  gl.uniformMatrix4fv(U.sky.invVP,false,cam.invVP);
  gl.uniform3fv(U.sky.cam,cam.pos);
  gl.uniform3fv(U.sky.sun,state.lightDir);
  gl.uniform3fv(U.sky.planet,[-0.55,0.25,0.80]);
}

function setSceneUniforms(opt){
  state.pointPos.fill(0);
  state.pointColor.fill(0);
  state.pointInt.fill(0);
  const lights = opt.lights || [];
  for(let i=0;i<Math.min(8,lights.length);i++){
    const L=lights[i];
    state.pointPos[i*3]=L.p[0]; state.pointPos[i*3+1]=L.p[1]; state.pointPos[i*3+2]=L.p[2];
    state.pointColor[i*3]=L.c[0]; state.pointColor[i*3+1]=L.c[1]; state.pointColor[i*3+2]=L.c[2];
    state.pointInt[i]=L.i;
  }
  state.fogColor = opt.fogColor || [0.008,0.016,0.030];
  state.fogDensity = opt.fogDensity !== undefined ? opt.fogDensity : 0.00022;
  state.ambient = opt.ambient || [0.10,0.13,0.18];
  state.lightDir = opt.lightDir || [0.45,0.55,-0.70];
  state.lightColor = opt.lightColor || [1.15,1.05,0.92];
}

function drawMesh(mesh, model, tint, time){
  gl.useProgram(progMesh);
  gl.uniformMatrix4fv(U.mesh.model,false,model);
  if(tint) gl.uniform3f(U.mesh.tint,tint[0],tint[1],tint[2]);
  else gl.uniform3f(U.mesh.tint,1,1,1);
  if(time!==undefined) gl.uniform1f(U.mesh.time,time);
  gl.bindVertexArray(mesh.vao);
  gl.drawElements(gl.TRIANGLES,mesh.count,mesh.itype,0);
}

function drawSky(time){
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.useProgram(progSky);
  gl.uniform1f(U.sky.time,time);
  gl.bindVertexArray(fsVao);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
}

function drawSprites(list){
  if(!list.length) return;
  const arr = new Float32Array(list.length*SPRITE_FLOATS);
  let o=0;
  for(const s of list){
    arr[o++]=s.p[0]; arr[o++]=s.p[1]; arr[o++]=s.p[2];
    arr[o++]=s.c[0]; arr[o++]=s.c[1]; arr[o++]=s.c[2]; arr[o++]=s.a;
    arr[o++]=s.s[0]; arr[o++]=s.s[1]; arr[o++]=s.rot||0;
  }
  gl.useProgram(progSprite);
  gl.bindVertexArray(spriteGeo);
  gl.bindBuffer(gl.ARRAY_BUFFER,spriteInstBuf);
  gl.bufferData(gl.ARRAY_BUFFER,arr,gl.DYNAMIC_DRAW);
  gl.drawElementsInstanced(gl.TRIANGLES,6,gl.UNSIGNED_SHORT,0,list.length);
}

function drawStreaks(list){
  if(!list.length) return;
  const arr = new Float32Array(list.length*STREAK_FLOATS);
  let o=0;
  for(const s of list){
    arr[o++]=s.p[0]; arr[o++]=s.p[1]; arr[o++]=s.p[2];
    arr[o++]=s.d[0]; arr[o++]=s.d[1]; arr[o++]=s.d[2];
    arr[o++]=s.l; arr[o++]=s.w;
    arr[o++]=s.c[0]; arr[o++]=s.c[1]; arr[o++]=s.c[2]; arr[o++]=s.a;
  }
  gl.useProgram(progStreak);
  gl.bindVertexArray(streakGeo);
  gl.bindBuffer(gl.ARRAY_BUFFER,streakInstBuf);
  gl.bufferData(gl.ARRAY_BUFFER,arr,gl.DYNAMIC_DRAW);
  gl.drawElementsInstanced(gl.TRIANGLES,6,gl.UNSIGNED_SHORT,0,list.length);
}

function drawBeam(model, color, intensity, time){
  gl.useProgram(progBeam);
  gl.uniformMatrix4fv(U.beam.viewProj,false,state.camera.vp);
  gl.uniformMatrix4fv(U.beam.model,false,model);
  gl.uniform3fv(U.beam.cam,state.camera.pos);
  gl.uniform3fv(U.beam.color,color);
  gl.uniform1f(U.beam.time,time);
  gl.uniform1f(U.beam.intensity,intensity);
  gl.bindVertexArray(beamMesh.vao);
  gl.drawElements(gl.TRIANGLES,beamMesh.count,gl.UNSIGNED_INT,0);
}

function drawShield(model, normalMat, color, opacity, time){
  gl.useProgram(progShield);
  gl.uniformMatrix4fv(U.shield.viewProj,false,state.camera.vp);
  gl.uniformMatrix4fv(U.shield.model,false,model);
  gl.uniformMatrix3fv(U.shield.normalMat,false,normalMat);
  gl.uniform3fv(U.shield.cam,state.camera.pos);
  gl.uniform3fv(U.shield.color,color);
  gl.uniform1f(U.shield.opacity,opacity);
  gl.uniform1f(U.shield.time,time);
  gl.bindVertexArray(shieldMesh.vao);
  gl.drawElements(gl.TRIANGLES,shieldMesh.count,gl.UNSIGNED_INT,0);
}

/* ------------------------------------------------------------------ */
/* post                                                               */
/* ------------------------------------------------------------------ */
function post(time){
  // bright
  gl.bindFramebuffer(gl.FRAMEBUFFER,bloomA.fb);
  gl.viewport(0,0,bloomAW,bloomAH);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.useProgram(progBright);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,sceneTex);
  gl.uniform1i(U.bright.tex,0);
  gl.uniform1f(U.bright.threshold,hasFloat?0.75:0.55);
  gl.bindVertexArray(fsVao);
  gl.drawArrays(gl.TRIANGLES,0,3);

  // blur H -> B
  gl.bindFramebuffer(gl.FRAMEBUFFER,bloomB.fb);
  gl.useProgram(progBlur);
  gl.bindTexture(gl.TEXTURE_2D,bloomA.tex);
  gl.uniform1i(U.blur.tex,0);
  gl.uniform2f(U.blur.dir,1.5/bloomAW,0);
  gl.drawArrays(gl.TRIANGLES,0,3);
  // blur V -> A
  gl.bindFramebuffer(gl.FRAMEBUFFER,bloomA.fb);
  gl.bindTexture(gl.TEXTURE_2D,bloomB.tex);
  gl.uniform2f(U.blur.dir,0,1.5/bloomAH);
  gl.drawArrays(gl.TRIANGLES,0,3);
  // second wider blur
  gl.bindFramebuffer(gl.FRAMEBUFFER,bloomB.fb);
  gl.bindTexture(gl.TEXTURE_2D,bloomA.tex);
  gl.uniform2f(U.blur.dir,3.5/bloomAW,0);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindFramebuffer(gl.FRAMEBUFFER,bloomA.fb);
  gl.bindTexture(gl.TEXTURE_2D,bloomB.tex);
  gl.uniform2f(U.blur.dir,0,3.5/bloomAH);
  gl.drawArrays(gl.TRIANGLES,0,3);

  // composite
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.viewport(0,0,W,H);
  gl.useProgram(progComp);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,sceneTex);
  gl.uniform1i(U.comp.scene,0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D,bloomA.tex);
  gl.uniform1i(U.comp.bloom,1);
  gl.uniform1f(U.comp.strength,1.15);
  gl.uniform1f(U.comp.exposure,1.0);
  gl.bindVertexArray(fsVao);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
}

function beginScene(){
  gl.bindFramebuffer(gl.FRAMEBUFFER,sceneFB);
  gl.viewport(0,0,W,H);
  gl.clearColor(0.004,0.008,0.016,1);
  gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
}

function endScene(time){
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE,gl.ONE);
  gl.depthMask(false);
  drawSprites(state.sprites);
  drawStreaks(state.streaks);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  state.sprites.length=0;
  state.streaks.length=0;
  post(time);
}

/* ------------------------------------------------------------------ */
/* exports                                                             */
/* ------------------------------------------------------------------ */
window.VE = {
  gl, M4, U, state,
  createMesh, createSphere, createCube, sphereMesh, shieldMesh, cubeMesh,
  setCamera, setSceneUniforms, drawMesh, drawSky, drawSprites, drawStreaks,
  drawBeam, drawShield, beginScene, endScene, resize,
  get size(){ return {w:W,h:H}; },
  hasFloat
};
})();
