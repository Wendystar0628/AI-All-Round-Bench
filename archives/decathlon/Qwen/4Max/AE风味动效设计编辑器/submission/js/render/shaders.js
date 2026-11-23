/* 铸帧 ForgeFrame · GLSL 着色器库 */
"use strict";
(function(){
const FF=window.FF;
const V300='#version 300 es\nprecision highp float;\n';
const S={};

S.vs2d=V300+`
layout(location=0) in vec2 aPos;
uniform mat4 uProj;
out vec2 vPos;
void main(){ vPos=aPos; gl_Position=uProj*vec4(aPos,0.0,1.0); }`;

S.fsFlat=V300+`
in vec2 vPos;
uniform vec4 uColor;
uniform int uGrad;
uniform vec2 uGradCenter;
uniform float uGradRadius;
uniform vec3 uColor2;
out vec4 o;
void main(){
  vec4 c=uColor;
  if(uGrad==1){
    float d=clamp(length(vPos-uGradCenter)/max(uGradRadius,1.0),0.0,1.0);
    c.rgb=mix(uColor.rgb,uColor2,d*d);
  } else if(uGrad==2){
    float d=clamp((vPos.y-uGradCenter.y+uGradRadius)/(2.0*uGradRadius),0.0,1.0);
    c.rgb=mix(uColor.rgb,uColor2,d);
  }
  o=c;
}`;

S.vsQuad=V300+`
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aUv;
out vec2 vUv;
void main(){ vUv=aUv; gl_Position=vec4(aPos,0.0,1.0); }`;

S.fsBlit=V300+`
in vec2 vUv;
uniform sampler2D uTex;
uniform float uOpacity;
uniform vec2 uOffset;
out vec4 o;
void main(){ o=texture(uTex,vUv-uOffset)*vec4(1.0,1.0,1.0,uOpacity); }`;

S.fsMask=V300+`
in vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uMask;
uniform int uMode; // 0 alpha 1 luma 2 alphaInv 3 lumaInv
out vec4 o;
void main(){
  vec4 c=texture(uTex,vUv);
  vec4 m=texture(uMask,vUv);
  float v=(uMode==1||uMode==3) ? dot(m.rgb,vec3(0.299,0.587,0.114)) : m.a;
  if(uMode>=2) v=1.0-v;
  o=vec4(c.rgb,c.a*clamp(v,0.0,1.0));
}`;

S.fsAdjust=V300+`
in vec2 vUv;
uniform sampler2D uBase;
uniform sampler2D uProcessed;
uniform sampler2D uMask;
uniform int uHasMask;
uniform float uOpacity;
out vec4 o;
void main(){
  vec4 b=texture(uBase,vUv);
  vec4 p=texture(uProcessed,vUv);
  float m=uHasMask==1?texture(uMask,vUv).a:1.0;
  float k=clamp(m*uOpacity,0.0,1.0);
  o=mix(b,p,k);
}`;

S.vsXblit=V300+`
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aUv;
uniform mat4 uProj;
uniform mat4 uXform;
out vec2 vUv;
void main(){ vUv=aUv; gl_Position=uProj*uXform*vec4(aPos,0.0,1.0); }`;

S.fsBlur=V300+`
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 o;
void main(){
  vec4 s=texture(uTex,vUv)*0.227027;
  s+=texture(uTex,vUv+uDir*1.3846154)*0.3162162;
  s+=texture(uTex,vUv-uDir*1.3846154)*0.3162162;
  s+=texture(uTex,vUv+uDir*3.2307692)*0.0702703;
  s+=texture(uTex,vUv-uDir*3.2307692)*0.0702703;
  o=s;
}`;

S.fsBright=V300+`
in vec2 vUv;
uniform sampler2D uTex;
uniform float uThreshold;
out vec4 o;
void main(){
  vec4 c=texture(uTex,vUv);
  float l=dot(c.rgb,vec3(0.299,0.587,0.114));
  float k=smoothstep(uThreshold,uThreshold+0.35,l);
  o=vec4(c.rgb*k,c.a*k);
}`;

S.fsGlowAdd=V300+`
in vec2 vUv;
uniform sampler2D uBase;
uniform sampler2D uGlow;
uniform float uIntensity;
uniform vec3 uTint;
out vec4 o;
void main(){
  vec4 b=texture(uBase,vUv);
  vec4 g=texture(uGlow,vUv);
  vec3 add=g.rgb*uTint*uIntensity*g.a;
  o=vec4(b.rgb+add, clamp(b.a+g.a*uIntensity*0.6,0.0,1.0));
}`;

S.fsShadowTint=V300+`
in vec2 vUv;
uniform sampler2D uTex;
uniform vec3 uColor;
uniform float uOpacity;
out vec4 o;
void main(){
  float a=texture(uTex,vUv).a;
  o=vec4(uColor,a*uOpacity);
}`;

S.fsHsl=V300+`
in vec2 vUv;
uniform sampler2D uTex;
uniform float uHue;
uniform float uSat;
uniform float uLight;
out vec4 o;
vec3 rgb2hsl(vec3 c){
  float mx=max(c.r,max(c.g,c.b)), mn=min(c.r,min(c.g,c.b));
  float l=(mx+mn)*0.5;
  if(mx==mn) return vec3(0.0,0.0,l);
  float d=mx-mn;
  float s=l>0.5?d/(2.0-mx-mn):d/(mx+mn);
  float h;
  if(mx==c.r) h=(c.g-c.b)/d+(c.g<c.b?6.0:0.0);
  else if(mx==c.g) h=(c.b-c.r)/d+2.0;
  else h=(c.r-c.g)/d+4.0;
  return vec3(h/6.0,s,l);
}
float hue2rgb(float p,float q,float t){
  if(t<0.0)t+=1.0; if(t>1.0)t-=1.0;
  if(t<1.0/6.0) return p+(q-p)*6.0*t;
  if(t<1.0/2.0) return q;
  if(t<2.0/3.0) return p+(q-p)*(2.0/3.0-t)*6.0;
  return p;
}
void main(){
  vec4 c=texture(uTex,vUv);
  vec3 hsl=rgb2hsl(c.rgb);
  hsl.x=fract(hsl.x+uHue/360.0);
  hsl.y=clamp(hsl.y*(1.0+uSat/100.0),0.0,1.0);
  hsl.z=clamp(hsl.z+uLight/200.0,0.0,1.0);
  vec3 rgb;
  if(hsl.y==0.0) rgb=vec3(hsl.z);
  else{
    float q=hsl.z<0.5?hsl.z*(1.0+hsl.y):hsl.z+hsl.y-hsl.z*hsl.y;
    float p=2.0*hsl.z-q;
    rgb=vec3(hue2rgb(p,q,hsl.x+1.0/3.0),hue2rgb(p,q,hsl.x),hue2rgb(p,q,hsl.x-1.0/3.0));
  }
  o=vec4(rgb,c.a);
}`;

S.fsOverlay=V300+`
in vec2 vUv;
uniform sampler2D uDst;
uniform sampler2D uSrc;
uniform float uOpacity;
out vec4 o;
float ov(float b,float s){
  return b<0.5 ? 2.0*b*s : 1.0-2.0*(1.0-b)*(1.0-s);
}
void main(){
  vec4 d=texture(uDst,vUv);
  vec4 s=texture(uSrc,vUv);
  s.a*=uOpacity;
  vec3 c=vec3(ov(d.r,s.r),ov(d.g,s.g),ov(d.b,s.b));
  vec3 blended=mix(s.rgb,c,d.a);
  float a=s.a+d.a*(1.0-s.a);
  vec3 rgb=(d.rgb*d.a*(1.0-s.a)+blended*s.a)/max(a,1e-4);
  o=vec4(rgb,a);
}`;

/* ---------- 3D ---------- */
S.vsMesh=V300+`
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
uniform mat4 uVP;
uniform mat4 uModel;
uniform mat4 uNormalMat;
uniform mat4 uLightVP;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vShadow;
void main(){
  vec4 w=uModel*vec4(aPos,1.0);
  vWorld=w.xyz;
  vNormal=normalize((uNormalMat*vec4(aNrm,0.0)).xyz);
  vShadow=uLightVP*w;
  gl_Position=uVP*w;
}`;

S.fsMesh=V300+`
in vec3 vWorld;
in vec3 vNormal;
in vec4 vShadow;
uniform vec3 uCamPos;
uniform vec3 uBaseColor;
uniform float uMetallic;
uniform float uRoughness;
uniform vec3 uEmissive;
uniform float uOpacity;
uniform int uNumLights;
uniform vec3 uLightPos[4];
uniform vec3 uLightDir[4];
uniform vec3 uLightColor[4];
uniform float uLightIntensity[4];
uniform int uLightType[4];
uniform sampler2D uShadowMap;
uniform int uHasShadow;
uniform float uShadowTexel;
out vec4 o;
const float PI=3.14159265359;

float shadowFactor(){
  if(uHasShadow==0) return 1.0;
  vec3 sc=vShadow.xyz/vShadow.w;
  sc=sc*0.5+0.5;
  if(sc.x<0.001||sc.x>0.999||sc.y<0.001||sc.y>0.999||sc.z>0.999) return 1.0;
  float bias=0.0018;
  float s=0.0;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
    float d=texture(uShadowMap,sc.xy+vec2(float(x),float(y))*uShadowTexel).r;
    s+= (sc.z-bias)>d ? 0.0 : 1.0;
  }
  return s/9.0;
}
vec3 envColor(vec3 d,float rough){
  // 锻造车间环境：上方冷钢青，下方炉火橙，侧面暗
  float up=d.y*0.5+0.5;
  vec3 sky=mix(vec3(0.06,0.045,0.05),vec3(0.10,0.16,0.24),up);
  float forge=pow(clamp(-d.y,0.0,1.0),2.0);
  sky+=vec3(0.85,0.32,0.08)*forge*0.9;
  float sun=pow(clamp(dot(d,normalize(vec3(0.5,0.7,0.55))),0.0,1.0),24.0);
  sky+=vec3(1.0,0.85,0.6)*sun*1.4;
  float rim=pow(clamp(dot(d,normalize(vec3(-0.7,0.15,-0.5))),0.0,1.0),10.0);
  sky+=vec3(0.2,0.45,0.7)*rim*0.5;
  vec3 blur=mix(sky,vec3(0.11,0.09,0.09),rough*0.8);
  return mix(sky,blur,rough);
}
float distGGX(float nh,float r){
  float a=r*r; float a2=a*a;
  float d=nh*nh*(a2-1.0)+1.0;
  return a2/(PI*d*d+1e-5);
}
float geoSmith(float nv,float nl,float r){
  float k=(r+1.0); k=k*k/8.0;
  float g1=nv/(nv*(1.0-k)+k);
  float g2=nl/(nl*(1.0-k)+k);
  return g1*g2;
}
void main(){
  vec3 N=normalize(vNormal);
  if(!gl_FrontFacing) N=-N;
  vec3 Vv=normalize(uCamPos-vWorld);
  float nv=max(dot(N,Vv),0.001);
  vec3 f0=mix(vec3(0.04),uBaseColor,uMetallic);
  vec3 diffColor=uBaseColor*(1.0-uMetallic);
  vec3 col=vec3(0.0);
  float sh=shadowFactor();
  for(int i=0;i<4;i++){
    if(i>=uNumLights) break;
    vec3 L; float atten=1.0;
    if(uLightType[i]==1){ L=normalize(-uLightDir[i]); }
    else{
      vec3 dv=uLightPos[i]-vWorld;
      float d=length(dv);
      L=dv/max(d,1e-4);
      atten=1.0/(1.0+0.00004*d*d);
    }
    float nl=max(dot(N,L),0.0);
    if(nl<=0.0) continue;
    vec3 H=normalize(L+Vv);
    float nh=max(dot(N,H),0.0);
    float vh=max(dot(Vv,H),0.0);
    float D=distGGX(nh,max(uRoughness,0.045));
    float G=geoSmith(nv,nl,uRoughness);
    vec3 F=f0+(1.0-f0)*pow(1.0-vh,5.0);
    vec3 spec=D*G*F/(4.0*nv*nl+1e-4);
    vec3 kd=(1.0-F)*(1.0-uMetallic);
    float sfi=(i==0)?sh:1.0;
    col+=(kd*diffColor/PI+spec)*uLightColor[i]*uLightIntensity[i]*nl*atten*sfi;
  }
  // 环境反射
  vec3 R=reflect(-Vv,N);
  vec3 env=envColor(R,uRoughness);
  vec3 F=f0+(1.0-f0)*pow(1.0-nv,5.0);
  col+=env*F*(0.55+0.45*(1.0-uRoughness));
  vec3 irr=envColor(N,1.0);
  col+=irr*diffColor*0.35;
  col+=uEmissive;
  // 色调映射
  col=col/(col+vec3(0.85))*1.35;
  o=vec4(col,uOpacity);
}`;

S.vsDepth=V300+`
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position=uLightVP*uModel*vec4(aPos,1.0); }`;
S.fsDepth=V300+`out vec4 o; void main(){ o=vec4(1.0); }`;

/* 粒子（实例化公告板） */
S.vsParticle=V300+`
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 aPos;
layout(location=2) in float aSize;
layout(location=3) in vec3 aColor;
layout(location=4) in float aAlpha;
uniform mat4 uVP;
uniform vec3 uRight;
uniform vec3 uUp;
out vec2 vUv;
out vec3 vColor;
out float vAlpha;
out float vViewZ;
uniform float uNear;
uniform float uFar;
void main(){
  vec3 w=aPos+(uRight*aCorner.x+uUp*aCorner.y)*aSize;
  vUv=aCorner;
  vColor=aColor;
  vAlpha=aAlpha;
  vec4 cp=uVP*vec4(w,1.0);
  vViewZ=cp.w;
  gl_Position=cp;
}`;
S.fsParticle=V300+`
in vec2 vUv;
in vec3 vColor;
in float vAlpha;
in float vViewZ;
uniform sampler2D uSceneDepth;
uniform float uNear;
uniform float uFar;
uniform vec2 uResolution;
uniform int uSoft;
out vec4 o;
float linZ(float d){
  float z=d*2.0-1.0;
  return (2.0*uNear*uFar)/(uFar+uNear-z*(uFar-uNear));
}
void main(){
  float d=length(vUv);
  if(d>1.0) discard;
  float a=smoothstep(1.0,0.15,d);
  float core=smoothstep(0.5,0.0,d);
  vec3 c=vColor*(1.0+core*1.6);
  float alpha=vAlpha*a;
  if(uSoft==1){
    float sd=texture(uSceneDepth,gl_FragCoord.xy/uResolution).r;
    float sz=linZ(sd);
    alpha*=clamp((sz-vViewZ)/14.0,0.0,1.0);
  }
  o=vec4(c,alpha);
}`;

S.vsTrail=V300+`
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aColor;
uniform mat4 uVP;
out vec4 vColor;
void main(){ vColor=aColor; gl_Position=uVP*vec4(aPos,1.0); }`;
S.fsTrail=V300+`
in vec4 vColor;
out vec4 o;
void main(){ o=vColor; }`;

S.fsDof=V300+`
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBlur;
uniform sampler2D uDepth;
uniform float uFocus;
uniform float uAperture;
uniform float uNear;
uniform float uFar;
out vec4 o;
float linZ(float d){
  float z=d*2.0-1.0;
  return (2.0*uNear*uFar)/(uFar+uNear-z*(uFar-uNear));
}
void main(){
  float d=texture(uDepth,vUv).r;
  float z=linZ(d);
  float coc=clamp(uAperture*abs(z-uFocus)/max(z,1.0)*10.0,0.0,1.0);
  if(d>=0.9999) coc=clamp(uAperture*0.35,0.0,1.0);
  vec4 s=texture(uScene,vUv);
  vec4 b=texture(uBlur,vUv);
  o=mix(s,b,coc);
}`;

S.fsBg=V300+`
in vec2 vUv;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uVignette;
out vec4 o;
void main(){
  float d=length((vUv-uCenter)*vec2(1.0,0.85))/max(uRadius,0.01);
  vec3 c=mix(uColorA,uColorB,clamp(d*d,0.0,1.0));
  float v=length(vUv-vec2(0.5,0.5));
  c*=1.0-uVignette*smoothstep(0.35,0.85,v);
  o=vec4(c,1.0);
}`;

FF.Shaders=S;
})();
