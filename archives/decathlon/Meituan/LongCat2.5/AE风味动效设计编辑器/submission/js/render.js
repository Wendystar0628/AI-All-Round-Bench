/* 2D 三角形绘制 */
(function(){
'use strict';
const R = { gl:null, canvas:null };
window.Render = R;
window.R = R;

R.view = { scale:1, ox:0, oy:0, cw:1280, ch:720, compW:1280, compH:720, zoom:1 };
R.dpr = Math.min(2, window.devicePixelRatio||1);

function sh(gl,type,src){
  const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){ console.error(gl.getShaderInfoLog(s), src); throw new Error('shader: '+gl.getShaderInfoLog(s)); }
  return s;
}
function prog(gl,vs,fs){
  const p=gl.createProgram();
  gl.attachShader(p,sh(gl,gl.VERTEX_SHADER,vs));
  gl.attachShader(p,sh(gl,gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error('link: '+gl.getProgramInfoLog(p));
  const uniforms={};
  const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
  for(let i=0;i<n;i++){ const u=gl.getActiveUniform(p,i); uniforms[u.name.replace('[0]','')]=gl.getUniformLocation(p,u.name); }
  return {p,u:uniforms};
}

/* ==================== 着色器 ==================== */
const VS_FULL=`#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
uniform vec2 uScale; uniform vec2 uOff;
void main(){ vUv=aPos*0.5+0.5; gl_Position=vec4(aPos*uScale+uOff,0.0,1.0); }`;

const FS_COPY=`#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec4 uMul;
void main(){ o=texture(uTex,vUv)*uMul; }`;

const FS_BLEND=`#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uA; uniform sampler2D uB;
uniform int uMode; uniform float uOpacity; uniform float uAlphaMatte; uniform sampler2D uMatte; uniform int uUseMatte;
vec3 blendCol(vec3 a, vec3 b, int m){
  if(m==1) return a+b;                       // 相加
  if(m==2) return 1.0-(1.0-a)*(1.0-b);       // 滤色
  if(m==3) return a*b;                       // 正片叠底
  if(m==4){ vec3 r=vec3(0.0); for(int i=0;i<3;i++){ float x=a[i],y=b[i]; r[i]= x<0.5? 2.0*x*y : 1.0-2.0*(1.0-x)*(1.0-y);} return r; } // 叠加
  return b;
}
void main(){
  vec4 A=texture(uA,vUv); vec4 B=texture(uB,vUv);
  float alpha=B.a*uOpacity;
  vec3 col;
  if(uMode==0) col=B.rgb;
  else col=blendCol(A.rgb, B.rgb, uMode);
  if(uUseMatte==1){
    vec4 M=texture(uMatte,vUv);
    alpha*=M.a;
    if(uMode==0) col=B.rgb;
  }
  o=vec4(col, alpha);
}`;

const FS_BLUR=`#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uDir; uniform vec2 uTexel;
void main(){
  vec4 sum=vec4(0.0); float wsum=0.0;
  for(int i=-8;i<=8;i++){
    float f=float(i);
    float w=exp(-f*f*0.5/ (uDir.x*uDir.x*16.0+0.0001));
    sum+=texture(uTex, vUv+uDir*f*uTexel)*w; wsum+=w;
  }
  o=sum/wsum;
}`;

const FS_GLOW=`#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform sampler2D uBlur; uniform vec4 uColor; uniform float uIntensity;
void main(){
  vec4 A=texture(uTex,vUv); vec4 B=texture(uBlur,vUv);
  float a=B.a*uIntensity;
  o=vec4(uColor.rgb*a + A.rgb*A.a, A.a + a);
}`;

const FS_SHADOW=`#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform sampler2D uBlur; uniform vec4 uColor; uniform vec2 uOffset; uniform float uOpacity;
void main(){
  vec4 A=texture(uTex,vUv);
  float s=texture(uBlur, vUv+uOffset).a*uOpacity;
  float a=A.a;
  o=vec4(uColor.rgb*s, s);
}`;

const FS_POST=`#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
uniform float uHue,uSat,uBright,uVignette,uCA;
vec3 rgb2hsl(vec3 c){ float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b)); float l=(mx+mn)/2.0; float h=0.0,s=0.0; if(mx!=mn){ float d=mx-mn; s=l>0.5? d/(2.0-mx-mn): d/(mx+mn); if(mx==c.r) h=(c.g-c.b)/d+(c.g<c.b?6.0:0.0); else if(mx==c.g) h=(c.b-c.r)/d+2.0; else h=(c.r-c.g)/d+4.0; h/=6.0;} return vec3(h,s,l); }
float hslhue(float t, float p, float q){ t=fract(t); if(t<1.0/6.0) return p+(q-p)*6.0*t; if(t<0.5) return q; if(t<2.0/3.0) return p+(q-p)*(2.0/3.0-t)*6.0; return p; }
float hsl2rgb(float h,float s,float l){ if(s==0.0) return l; float q=l<0.5? l*(1.0+s): l+s-l*s; float p=2.0*l-q; return hslhue(h,p,q); }
vec3 hsl2rgb3(vec3 c){ float r=hsl2rgb(c.x+1.0/3.0,c.y,c.z), g=hsl2rgb(c.x,c.y,c.z), b=hsl2rgb(c.x-1.0/3.0,c.y,c.z); return vec3(r,g,b); }
void main(){
  vec2 uv=vUv;
  vec4 c;
  if(uCA>0.001){
    vec2 d=(uv-0.5)*uCA;
    c=vec4(texture(uTex,uv+d).r, texture(uTex,uv).g, texture(uTex,uv-d).b, texture(uTex,uv).a);
  } else c=texture(uTex,uv);
  vec3 hsl=rgb2hsl(c.rgb);
  hsl.x=fract(hsl.x+uHue);
  hsl.y=clamp(hsl.y*uSat,0.0,1.0);
  hsl.z=clamp(hsl.z+uBright,0.0,1.0);
  vec3 rgb=hsl2rgb3(hsl);
  if(uVignette>0.001){
    float v=smoothstep(0.95,0.35,length(uv-0.5));
    rgb*=mix(1.0,v,uVignette);
  }
  o=vec4(rgb,c.a);
}`;

const VS_PATH=`#version 300 es
layout(location=0) in vec2 aPos;
uniform mat4 uMat;
void main(){ gl_Position=uMat*vec4(aPos,0.0,1.0); }`;
const FS_PATH=`#version 300 es
precision highp float; out vec4 o; uniform vec4 uColor;
void main(){ o=uColor; }`;

const VS_QUAD3=`#version 300 es
layout(location=0) in vec2 aPos;
uniform mat4 uMat;
out vec2 vUv;
void main(){ vUv=aPos*0.5+0.5; gl_Position=uMat*vec4(aPos,0.0,1.0); }`;
const FS_TEX=`#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec4 uMul;
void main(){ o=texture(uTex,vUv)*uMul; }`;

const VS_MESH=`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec2 aUv;
uniform mat4 uMat; uniform mat4 uViewProj; uniform mat3 uNorm;
out vec3 vWorld; out vec3 vNor; out vec2 vUv; out float vDepth;
void main(){
  vec4 w=uMat*vec4(aPos,1.0);
  vWorld=w.xyz; vNor=normalize(uNorm*aNor); vUv=aUv;
  vec4 cp=uViewProj*w;
  vDepth=cp.w;
  gl_Position=cp;
}`;

const FS_MESH=`#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vNor; in vec2 vUv; in float vDepth;
out vec4 o;
uniform vec3 uColor; uniform float uMetal,uRough,uOpacity,uEmissiveInt,uEnvInt,uFlat;
uniform vec3 uEmissive;
uniform vec3 uCamPos;
uniform int uLightCount;
  uniform vec4 uLightPos[6];
uniform vec4 uLightColor[6];
uniform vec4 uLightDir[6];   // xyz=dir, w=cosOuter
uniform vec4 uLightParam[6]; // x=cosInner,y=intensity,z=radius,w=castShadow
uniform sampler2D uShadowMap; uniform mat4 uShadowMat; uniform int uUseShadow;
uniform sampler2D uEnv; uniform float uTime;
uniform int uDOF; uniform float uFocusDist,uAperture,uBlurLevel,uNear,uFar;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
vec3 envSample(vec3 d){
  vec2 uv=vec2(atan(d.z,d.x)/(6.2831853)+0.5, asin(clamp(d.y,-1.0,1.0))/3.1415926+0.5);
  return texture(uEnv,uv).rgb;
}
float shadowFactor(vec3 world, vec3 N){
  if(uUseShadow==0) return 1.0;
  vec4 sp=uShadowMat*vec4(world,1.0);
  vec3 sc=sp.xyz/sp.w*0.5+0.5;
  if(sc.x<0.0||sc.x>1.0||sc.y<0.0||sc.y>1.0||sc.z>1.0) return 1.0;
  float bias=0.0016;
  float d=texture(uShadowMap,sc.xy).r;
  return sc.z-bias>d ? 0.28 : 1.0;
}
vec3 shade(vec3 N, vec3 V, vec3 L, vec3 lc, vec3 albedo, float metal, float rough, vec3 emis){
  vec3 H=normalize(V+L);
  float ndl=max(dot(N,L),0.0);
  float ndh=max(dot(N,H),0.0);
  float ndv=max(dot(N,V),0.0001);
  float a=rough*rough; a=max(a,0.002);
  float a2=a*a;
  float den=ndh*ndh*(a2-1.0)+1.0;
  float D=a2/(3.1415926*den*den);
  float k=(rough+1.0)*(rough+1.0)/8.0;
  float G=ndv/(ndv*(1.0-k)+k) * ndl/(ndl*(1.0-k)+k);
  vec3 F0=mix(vec3(0.04),albedo,metal);
  vec3 F=F0+(1.0-F0)*pow(1.0-max(dot(H,V),0.0),5.0);
  vec3 spec=D*G*F/max(4.0*ndv*max(ndl,0.0001),0.0001);
  vec3 diff=(1.0-F)*(1.0-metal)*albedo/3.1415926;
  return (diff+spec)*lc*ndl + emis;
}
void main(){
  vec3 N=normalize(vNor);
  vec3 V=normalize(uCamPos-vWorld);
  vec3 albedo=uColor;
  vec3 col=vec3(0.0);
  float shadow=shadowFactor(vWorld,N);
  for(int i=0;i<6;i++){
    if(i>=uLightCount) break;
    int type=int(uLightPos[i].w+0.5);
    vec3 lp=uLightPos[i].xyz;
    vec3 L; float att=1.0; vec3 lc=uLightColor[i].rgb;
    if(type==2){ L=normalize(-uLightDir[i].xyz); }
    else{
      L=normalize(lp-vWorld);
      float dist=length(lp-vWorld);
      att=1.0/(1.0+0.0009*dist+0.00009*dist*dist);
      if(type==1){
        vec3 ld=normalize(uLightDir[i].xyz);
        float cosA=dot(-L,ld);
        float outer=uLightDir[i].w;
        float inner=uLightParam[i].x;
        float f=smoothstep(outer,inner,cosA);
        att*=f;
      }
    }
    float inten=uLightParam[i].y;
    col+=shade(N,V,L,lc*inten*att,albedo,uMetal,uRough,uEmissive*uEmissiveInt)*(type==2? shadow : 1.0);
  }
  vec3 R=reflect(-V,N);
  vec3 env=envSample(R);
  vec3 F0=mix(vec3(0.04),albedo,uMetal);
  vec3 F=F0+(1.0-F0)*pow(1.0-max(dot(N,V),0.0),5.0);
  float roughAtt=1.0-uRough*0.85;
  col+=env*F*uEnvInt*roughAtt*(0.55+0.45*max(N.y,0.0));
  col+=albedo*0.05*max(N.y,0.0);
  o=vec4(col,uOpacity);
}`;

const VS_SPRITE=`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in float aSize;
layout(location=2) in vec4 aCol;
layout(location=3) in float aRot;
uniform mat4 uViewProj; uniform vec2 uViewport;
out vec2 vLocal; out vec4 vCol; out float vRot;
void main(){
  vCol=aCol; vRot=aRot;
  vec4 cp=uViewProj*vec4(aPos,1.0);
  vLocal=vec2(0.0);
  gl_Position=cp;
  gl_PointSize=max(1.0,aSize);
}`;

const FS_SPRITE=`#version 300 es
precision highp float; out vec4 o;
in vec2 vLocal; in vec4 vCol; in float vRot;
uniform int uSoft;
void main(){
  vec2 p=gl_PointCoord*2.0-1.0;
  float d=dot(p,p);
  if(d>1.0) discard;
  float a=pow(1.0-d,1.6);
  o=vec4(vCol.rgb, vCol.a*a);
}`;

const VS_SHADOW=`#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uMat; uniform mat4 uViewProj;
void main(){ gl_Position=uViewProj*uMat*vec4(aPos,1.0); }`;
const FS_SHADOWMAP=`#version 300 es
precision highp float; out vec4 o;
uniform float uFar;
void main(){ o=vec4(vec3(gl_FragCoord.z),1.0); }`;

const VS_TRAIL=`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
uniform mat4 uViewProj;
out vec2 vUv;
void main(){ vUv=aUv; gl_Position=uViewProj*vec4(aPos,1.0); }`;
const FS_TRAIL=`#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform vec3 uColor; uniform float uOpacity;
void main(){ o=vec4(uColor, vUv.y*uOpacity); }`;

const VS_DOF=`#version 300 es
layout(location=0) in vec2 aPos; out vec2 vUv;
void main(){ vUv=aPos*0.5+0.5; gl_Position=vec4(aPos,0.0,1.0); }`;
const FS_DOF=`#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform sampler2D uDepth;
uniform float uFocus,uAperture,uMaxBlur,uNear,uFar,uAspect;
float linz(float z){ float ndc=z*2.0-1.0; return 2.0*uNear*uFar/(uFar+uNear-ndc*(uFar-uNear)); }
void main(){
  float d=linz(texture(uDepth,vUv).r);
  float coc=clamp(abs(d-uFocus)/max(uFocus,1.0)*uAperture*0.02,0.0,1.0)*uMaxBlur;
  vec4 sum=vec4(0.0); float wsum=0.0;
  for(int i=0;i<16;i++){
    float a=float(i)/16.0*6.2831853;
    for(int r=1;r<=3;r++){
      vec2 off=vec2(cos(a),sin(a))*float(r)/3.0*coc*0.02;
      sum+=texture(uTex,vUv+off); wsum+=1.0;
    }
  }
  sum+=texture(uTex,vUv); wsum+=1.0;
  o=sum/wsum;
}`;

/* ==================== 初始化 ==================== */
R.init=function(canvas){
  R.canvas=canvas;
  const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,depth:false,stencil:false,premultipliedAlpha:false,powerPreference:'high-performance'});
  if(!gl){ alert('需要 WebGL2 支持'); return false; }
  R.gl=gl;
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  R.progCopy=prog(gl,VS_FULL,FS_COPY);
  R.progBlend=prog(gl,VS_FULL,FS_BLEND);
  R.progBlur=prog(gl,VS_FULL,FS_BLUR);
  R.progGlow=prog(gl,VS_FULL,FS_GLOW);
  R.progShadow=prog(gl,VS_FULL,FS_SHADOW);
  R.progPost=prog(gl,VS_FULL,FS_POST);
  R.progPath=prog(gl,VS_PATH,FS_PATH);
  R.progQuad3=prog(gl,VS_QUAD3,FS_TEX);
  R.progMesh=prog(gl,VS_MESH,FS_MESH);
  R.progSprite=prog(gl,VS_SPRITE,FS_SPRITE);
  R.progShadowMap=prog(gl,VS_SHADOW,FS_SHADOWMAP);
  R.progDOF=prog(gl,VS_DOF,FS_DOF);
  R.progTrail=prog(gl,VS_TRAIL,FS_TRAIL);
  R.quadBuf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,R.quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1, 3,-1, -1,3]),gl.STATIC_DRAW);
  R.emptyVao=gl.createVertexArray();
  // 环境贴图
  R.envTex=R.makeEnv();
  R.fbos=new Map();
  return true;
};

R.makeEnv=function(){
  const gl=R.gl, S=64;
  const data=new Uint8Array(S*S*4);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const u=x/S, v=y/S;
    const up=1-v;
    let r,g,b;
    if(up>0.5){ const f=(up-0.5)*2; r=U.lerp(0.06,0.35,f); g=U.lerp(0.07,0.42,f); b=U.lerp(0.10,0.55,f); }
    else { const f=up*2; r=U.lerp(0.02,0.06,f); g=U.lerp(0.02,0.07,f); b=U.lerp(0.03,0.10,f); }
    const sun=Math.pow(Math.max(0,Math.cos((u-0.3)*6.28)*Math.cos((v-0.32)*3.14)),40);
    r+=sun*3; g+=sun*2.4; b+=sun*1.6;
    const i=(y*S+x)*4;
    data[i]=U.clamp(r,0,1)*255; data[i+1]=U.clamp(g,0,1)*255; data[i+2]=U.clamp(b,0,1)*255; data[i+3]=255;
  }
  const tex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,S,S,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  return tex;
};

/* ==================== FBO ==================== */
R.createFBO=function(w,h,opts={}){
  const gl=R.gl;
  const key=w+'x'+h+(opts.depth?'d':'')+(opts.float?'f':'');
  const tex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,tex);
  const ifmt=opts.float?gl.RGBA16F:gl.RGBA8;
  gl.texImage2D(gl.TEXTURE_2D,0,ifmt,w,h,0,gl.RGBA,opts.float?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const fbo=gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
  let depthTex=null;
  if(opts.depth){
    depthTex=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,depthTex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depthTex,0);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  const rec={fbo,tex,depthTex,w,h,float:!!opts.float};
  R.fbos.set(key+':'+Math.random(),rec);
  return rec;
};
R.releaseFBO=function(f){ if(!f) return; const gl=R.gl; gl.deleteFramebuffer(f.fbo); gl.deleteTexture(f.tex); if(f.depthTex) gl.deleteTexture(f.depthTex); };

R.resize=function(w,h){
  const c=R.canvas;
  c.width=Math.max(2,Math.round(w*R.dpr));
  c.height=Math.max(2,Math.round(h*R.dpr));
  R.view.cw=c.width; R.view.ch=c.height;
  R.canvas.style.width=w+'px'; R.canvas.style.height=h+'px';
};
R.setComp=function(cw,ch){ R.view.compW=cw; R.view.compH=ch; };
R.fitView=function(zoom){
  const v=R.view;
  const s=Math.min(v.cw/v.compW, v.ch/v.compH)*0.92;
  v.scale=s*(zoom||1);
  v.ox=(v.cw-v.compW*v.scale)/2;
  v.oy=(v.ch-v.compH*v.scale)/2;
  v.zoom=zoom||1;
};
R.screenToComp=function(sx,sy){
  const v=R.view;
  return [(sx*R.dpr-v.ox)/v.scale, (sy*R.dpr-v.oy)/v.scale];
};
R.compToScreen=function(cx,cy){
  const v=R.view;
  return [(cx*v.scale+v.ox)/R.dpr, (cy*v.scale+v.oy)/R.dpr];
};
/* 合成坐标 -> 裁剪坐标 */
R.matComp=function(){
  const v=R.view;
  const sx=2*v.scale/v.cw, sy=-2*v.scale/v.ch;
  return [sx,0,0,0, 0,sy,0,0, 0,0,1,0, -1+2*v.ox/v.cw, 1-2*v.oy/v.ch, 0,1];
};
R.matNdcToComp=function(){
  const v=R.view;
  return [v.compW/2,0,0,0, 0,-v.compH/2,0,0, 0,0,1,0, v.compW/2,v.compH/2,0,1];
};

R.bindFBO=function(fbo){
  const gl=R.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo? fbo.fbo : null);
  gl.viewport(0,0, fbo?fbo.w:R.view.cw, fbo?fbo.h:R.view.ch);
};
R.clearFBO=function(fbo,color,alpha){
  const gl=R.gl;
  R.bindFBO(fbo);
  gl.clearColor(color[0],color[1],color[2], alpha===undefined?1:alpha);
  gl.clear(gl.COLOR_BUFFER_BIT| (fbo&&fbo.depthTex?gl.DEPTH_BUFFER_BIT:0));
};
R.drawFullscreen=function(program){
  const gl=R.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER,R.quadBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.drawArrays(gl.TRIANGLES,0,3);
};
R.copy=function(dst,src,mul){
  const gl=R.gl, p=R.progCopy;
  R.bindFBO(dst);
  gl.useProgram(p.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,src.tex);
  gl.uniform1i(p.u.uTex,0);
  gl.uniform4fv(p.u.uMul, mul||[1,1,1,1]);
  R.drawFullscreen(p);
};

/* 2D 三角形绘制 */
R.drawTris=function(fbo,tris,mat,color,blendMode,opacity){
  const gl=R.gl;
  if(!tris||!tris.length) return;
  const buf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(tris.flat?tris.flat():tris),gl.DYNAMIC_DRAW);
  R.bindFBO(fbo);
  gl.useProgram(R.progPath.p);
  gl.uniformMatrix4fv(R.progPath.u.uMat,false,mat);
  gl.uniform4fv(R.progPath.u.uColor,[color[0],color[1],color[2], (color[3]===undefined?1:color[3])*(opacity===undefined?1:opacity)]);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.TRIANGLES,0,tris.length/2);
  gl.deleteBuffer(buf);
};
R.drawTrisTex=function(fbo,tris,mat,tex,mul){
  // tris: [[x,y,u,v],...]
  const gl=R.gl;
  const buf=gl.createBuffer();
  const arr=new Float32Array(tris.length*4);
  tris.forEach((t,i)=>{arr[i*4]=t[0];arr[i*4+1]=t[1];arr[i*4+2]=t[2]||0;arr[i*4+3]=t[3]||0;});
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,arr,gl.DYNAMIC_DRAW);
  R.bindFBO(fbo);
  gl.useProgram(R.progQuad3.p);
  gl.uniformMatrix4fv(R.progQuad3.u.uMat,false,mat);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.uniform1i(R.progQuad3.u.uTex,0);
  gl.uniform4fv(R.progQuad3.u.uMul,mul||[1,1,1,1]);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0,4,gl.FLOAT,false,0,0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.TRIANGLES,0,tris.length);
  gl.deleteBuffer(buf);
};

/* 3D 网格 */
R.drawMesh=function(fbo,mesh,modelMat,material,scene,opts={}){
  const gl=R.gl, p=R.progMesh;
  if(!mesh||!mesh.positions||!mesh.positions.length) return;
  const vao=gl.createVertexArray();
  gl.bindVertexArray(vao);
  const pb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,pb);
  gl.bufferData(gl.ARRAY_BUFFER,mesh.positions,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
  const nb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,nb);
  gl.bufferData(gl.ARRAY_BUFFER,mesh.normals,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,0,0);
  const ub=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,ub);
  gl.bufferData(gl.ARRAY_BUFFER,mesh.uvs||new Float32Array(mesh.positions.length/3*2),gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,2,gl.FLOAT,false,0,0);
  const ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.DYNAMIC_DRAW);

  R.bindFBO(fbo);
  gl.useProgram(p.p);
  gl.uniformMatrix4fv(p.u.uMat,false,modelMat);
  gl.uniformMatrix4fv(p.u.uViewProj,false,scene.viewProj);
  gl.uniformMatrix3fv(p.u.uNorm,false,U.normalMat3(modelMat));
  const c=material.color||[1,1,1];
  gl.uniform3fv(p.u.uColor,c);
  gl.uniform1f(p.u.uMetal,material.metalness||0);
  gl.uniform1f(p.u.uRough,material.roughness||0.5);
  gl.uniform1f(p.u.uOpacity,(material.opacity===undefined?100:material.opacity)/100);
  gl.uniform3fv(p.u.uEmissive,material.emissive||[0,0,0]);
  gl.uniform1f(p.u.uEmissiveInt,material.emissiveIntensity||0);
  gl.uniform1f(p.u.uEnvInt,material.envIntensity===undefined?1:material.envIntensity);
  gl.uniform1i(p.u.uFlat,material.flatShading?1:0);
  gl.uniform3fv(p.u.uCamPos,scene.camPos||[0,0,0]);
  const lc=scene.lights||[];
  gl.uniform1i(p.u.uLightCount,lc.length);
  for(let i=0;i<Math.min(6,lc.length);i++){
    const L=lc[i];
    gl.uniform4f(p.u.uLightPos[i],L.pos[0],L.pos[1],L.pos[2],L.type);
    gl.uniform4f(p.u.uLightColor[i],L.color[0],L.color[1],L.color[2],1);
    gl.uniform4f(p.u.uLightDir[i],L.dir[0],L.dir[1],L.dir[2],L.cosOuter||1);
    gl.uniform4f(p.u.uLightParam[i],L.cosInner||1,L.intensity||1,L.radius||0,L.castShadow?1:0);
  }
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,R.envTex);
  gl.uniform1i(p.u.uEnv,0);
  gl.uniform1f(p.u.uTime,scene.time||0);
  gl.uniform1i(p.u.uDOF,0);
  if(scene.shadowMap){
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,scene.shadowMap.tex);
    gl.uniform1i(p.u.uShadowMap,1);
    gl.uniformMatrix4fv(p.u.uShadowMat,false,scene.shadowMat);
    gl.uniform1i(p.u.uUseShadow,1);
  } else gl.uniform1i(p.u.uUseShadow,0);
  gl.enable(gl.DEPTH_TEST);
  if(opts.blend===false){ gl.disable(gl.BLEND); gl.depthMask(true); }
  else { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(opts.depthMask===true); }
  gl.drawElements(gl.TRIANGLES,mesh.indices.length, mesh.indices instanceof Uint32Array?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,0);
  gl.bindVertexArray(null);
  gl.deleteVertexArray(vao);
  gl.deleteBuffer(pb);gl.deleteBuffer(nb);gl.deleteBuffer(ub);gl.deleteBuffer(ib);
};

/* 阴影贴图 */
R.renderShadowMap=function(fbo,mesh,modelMat,lightMat){
  const gl=R.gl, p=R.progShadowMap;
  const vao=gl.createVertexArray(); gl.bindVertexArray(vao);
  const pb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,pb);
  gl.bufferData(gl.ARRAY_BUFFER,mesh.positions,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
  const ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.DYNAMIC_DRAW);
  R.bindFBO(fbo);
  gl.useProgram(p.p);
  gl.uniformMatrix4fv(p.u.uMat,false,modelMat);
  gl.uniformMatrix4fv(p.u.uViewProj,false,lightMat);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
  gl.clearColor(1,1,1,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.drawElements(gl.TRIANGLES,mesh.indices.length, mesh.indices instanceof Uint32Array?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,0);
  gl.bindVertexArray(null);
  gl.deleteVertexArray(vao); gl.deleteBuffer(pb); gl.deleteBuffer(ib);
};

/* 粒子精灵 */
R.drawSprites=function(fbo,particles,viewProj,viewport,opts={}){
  const gl=R.gl, p=R.progSprite;
  if(!particles||!particles.length) return;
  const vao=gl.createVertexArray(); gl.bindVertexArray(vao);
  const data=new Float32Array(particles.length*9);
  particles.forEach((pt,i)=>{
    data[i*9]=pt.pos[0];data[i*9+1]=pt.pos[1];data[i*9+2]=pt.pos[2];
    data[i*9+3]=pt.size;
    data[i*9+4]=pt.color[0];data[i*9+5]=pt.color[1];data[i*9+6]=pt.color[2];data[i*9+7]=pt.color[3]===undefined?1:pt.color[3];
    data[i*9+8]=pt.rot||0;
  });
  const buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,36,0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,1,gl.FLOAT,false,36,12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,4,gl.FLOAT,false,36,16);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,1,gl.FLOAT,false,36,32);
  R.bindFBO(fbo);
  gl.useProgram(p.p);
  gl.uniformMatrix4fv(p.u.uViewProj,false,viewProj);
  gl.uniform2f(p.u.uViewport,viewport[0],viewport[1]);
  gl.enable(gl.BLEND);
  if(opts.add){ gl.blendFunc(gl.SRC_ALPHA,gl.ONE); } else gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(false);
  gl.drawArrays(gl.POINTS,0,particles.length);
  gl.bindVertexArray(null);
  gl.deleteVertexArray(vao); gl.deleteBuffer(buf);
};

/* 全屏效果 */
R.blur=function(fbo,radius,passes=2){
  const gl=R.gl, p=R.progBlur;
  if(radius<=0.3) return;
  let src=fbo, tmp=R.createFBO(fbo.w,fbo.h);
  for(let i=0;i<passes;i++){
    R.bindFBO(tmp);
    gl.useProgram(p.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,src.tex);
    gl.uniform1i(p.u.uTex,0);
    gl.uniform2f(p.u.uDir,radius,0);
    gl.uniform2f(p.u.uTexel,1/src.w,1/src.h);
    R.drawFullscreen(p);
    R.bindFBO(src);
    gl.useProgram(p.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,tmp.tex);
    gl.uniform1i(p.u.uTex,0);
    gl.uniform2f(p.u.uDir,0,radius);
    gl.uniform2f(p.u.uTexel,1/src.w,1/src.h);
    R.drawFullscreen(p);
  }
  R.releaseFBO(tmp);
};
R.glow=function(src,blurTex,color,intensity){
  const gl=R.gl, p=R.progGlow;
  const tmp=R.createFBO(src.w,src.h);
  R.bindFBO(tmp);
  gl.useProgram(p.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,src.tex); gl.uniform1i(p.u.uTex,0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,blurTex.tex); gl.uniform1i(p.u.uBlur,1);
  gl.uniform4fv(p.u.uColor,color);
  gl.uniform1f(p.u.uIntensity,intensity===undefined?1:intensity);
  R.drawFullscreen(p);
  R.copy(src,tmp);
  R.releaseFBO(tmp);
};
R.dropShadow=function(src,alphaTex,offset,color,opacity){
  const gl=R.gl, p=R.progShadow;
  const tmp=R.createFBO(src.w,src.h);
  R.bindFBO(tmp);
  gl.useProgram(p.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,src.tex); gl.uniform1i(p.u.uTex,0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,alphaTex.tex); gl.uniform1i(p.u.uBlur,1);
  gl.uniform4fv(p.u.uColor,color);
  gl.uniform2f(p.u.uOffset,offset[0],offset[1]);
  gl.uniform1f(p.u.uOpacity,opacity);
  R.drawFullscreen(p);
  // 合成回 src（阴影在下）
  const out=R.createFBO(src.w,src.h);
  R.copy(out,tmp);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  R.copy(out,src);
  R.copy(src,out);
  R.releaseFBO(tmp); R.releaseFBO(out);
};
R.post=function(fbo,hue,sat,bright,vignette,ca){
  const gl=R.gl, p=R.progPost;
  const tmp=R.createFBO(fbo.w,fbo.h);
  R.bindFBO(tmp);
  gl.useProgram(p.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,fbo.tex); gl.uniform1i(p.u.uTex,0);
  gl.uniform1f(p.u.uHue,hue||0); gl.uniform1f(p.u.uSat,sat===undefined?1:sat);
  gl.uniform1f(p.u.uBright,bright||0); gl.uniform1f(p.u.uVignette,vignette||0);
  gl.uniform1f(p.u.uCA,ca||0);
  R.drawFullscreen(p);
  R.copy(fbo,tmp);
  R.releaseFBO(tmp);
};
R.dof=function(fbo,focus,aperture,maxBlur,near,far){
  const gl=R.gl, p=R.progDOF;
  if(!fbo.depthTex) return;
  const tmp=R.createFBO(fbo.w,fbo.h);
  R.bindFBO(tmp);
  gl.useProgram(p.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,fbo.tex); gl.uniform1i(p.u.uTex,0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,fbo.depthTex); gl.uniform1i(p.u.uDepth,1);
  gl.uniform1f(p.u.uFocus,focus); gl.uniform1f(p.u.uAperture,aperture);
  gl.uniform1f(p.u.uMaxBlur,maxBlur||1); gl.uniform1f(p.u.uNear,near); gl.uniform1f(p.u.uFar,far);
  gl.uniform1f(p.u.uAspect,fbo.w/fbo.h);
  R.drawFullscreen(p);
  R.copy(fbo,tmp);
  R.releaseFBO(tmp);
};
/* 拖尾 */
R.drawTrails=function(fbo,tris,viewProj,color,opacity){
  const gl=R.gl, p=R.progTrail;
  if(!tris||!tris.length) return;
  const vao=gl.createVertexArray(); gl.bindVertexArray(vao);
  const data=new Float32Array(tris.length*5);
  tris.forEach((t,i)=>{ data[i*5]=t[0];data[i*5+1]=t[1];data[i*5+2]=t[2];data[i*5+3]=t[3];data[i*5+4]=t[4]; });
  const buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
  R.bindFBO(fbo);
  gl.useProgram(p.p);
  gl.uniformMatrix4fv(p.u.uViewProj,false,viewProj);
  gl.uniform3fv(p.u.uColor,color);
  gl.uniform1f(p.u.uOpacity,opacity===undefined?1:opacity);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,20,0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,2,gl.FLOAT,false,20,12);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(false);
  gl.drawArrays(gl.TRIANGLES,0,tris.length);
  gl.bindVertexArray(null);
  gl.deleteVertexArray(vao); gl.deleteBuffer(buf);
};

/* 混合合成 */
R.blend=function(dst,base,top,mode,opacity,matteTex){
  const gl=R.gl, p=R.progBlend;
  const tmp=R.createFBO(top.w,top.h);
  R.bindFBO(tmp);
  gl.useProgram(p.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,base.tex); gl.uniform1i(p.u.uA,0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,top.tex); gl.uniform1i(p.u.uB,1);
  gl.uniform1i(p.u.uMode,mode||0);
  gl.uniform1f(p.u.uOpacity,opacity===undefined?1:opacity);
  if(matteTex){ gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D,matteTex.tex); gl.uniform1i(p.u.uMatte,2); gl.uniform1i(p.u.uUseMatte,1); }
  else gl.uniform1i(p.u.uUseMatte,0);
  R.drawFullscreen(p);
  R.copy(dst,tmp);
  R.releaseFBO(tmp);
};
R.fillFBO=function(fbo,color,alpha){
  const gl=R.gl;
  R.bindFBO(fbo);
  gl.clearColor(color[0],color[1],color[2],alpha===undefined?1:alpha);
  gl.clear(gl.COLOR_BUFFER_BIT);
};

})();
