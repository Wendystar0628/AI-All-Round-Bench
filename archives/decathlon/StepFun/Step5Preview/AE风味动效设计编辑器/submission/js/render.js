/* ============ 锻火 FORGE · render.js : WebGL2 渲染器 ============ */
(function(){
const APP=window.APP=window.APP||{};
const C=APP.core;
const G=APP.geom;
const A=APP.anim;
const P=APP.project;
const CT=APP.content;
const R=APP.render={};

/* ---------- GL 基础 ---------- */
R.init=function(canvas){
  const gl=canvas.getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:true,
    powerPreference:'high-performance'});
  if(!gl)throw new Error('此浏览器不支持 WebGL 2');
  R.gl=gl;
  R.prog={};R.fbo={};R.meshBufs={};
  R.shadowSize=2048;
  R.compileAll();
  R.compileExtra();
  return gl;
};
function sh(gl,type,src){
  let s=String(src).replace(/^\s+/,'');
  if(!/^#version/.test(s))s='#version 300 es\n'+s;
  const shader=gl.createShader(type);gl.shaderSource(shader,s);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('着色器编译失败: '+gl.getShaderInfoLog(shader)+'\n'+s);
  return shader;
}
function prog(gl,vs,fs,name){
  const p=gl.createProgram();
  gl.attachShader(p,sh(gl,gl.VERTEX_SHADER,vs));
  gl.attachShader(p,sh(gl,gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('链接失败 '+name+': '+gl.getProgramInfoLog(p));
  const o={p,u:{},a:{}};
  const nu=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
  for(let i=0;i<nu;i++){const info=gl.getActiveUniform(p,i);const nm=info.name.replace(/\[0\]$/,'');
    o.u[nm]=gl.getUniformLocation(p,info.name);}
  const na=gl.getProgramParameter(p,gl.ACTIVE_ATTRIBUTES);
  for(let i=0;i<na;i++){const info=gl.getActiveAttrib(p,i);o.a[info.name]=gl.getAttribLocation(p,info.name);}
  return o;
}
const VS_FLAT=`
precision highp float;
in vec2 aPos;
uniform mat4 uProj,uView,uModel;
out vec2 vLocal;
void main(){
  vec4 w=uModel*vec4(aPos,0.0,1.0);
  vLocal=aPos;
  gl_Position=uProj*uView*w;
}`;
const FS_FLAT=`
precision highp float;
in vec2 vLocal;
uniform vec4 uColor;
out vec4 frag;
void main(){ frag=uColor; }`;
const VS_MESH=`
precision highp float;
in vec3 aPos; in vec3 aNor; in vec2 aUV;
uniform mat4 uProj,uView,uModel;
out vec3 vN,vW; out vec2 vUV;
void main(){
  vec4 w=uModel*vec4(aPos,1.0);
  vW=w.xyz; vN=mat3(uModel)*aNor; vUV=aUV;
  gl_Position=uProj*uView*w;
}`;
const FS_MESH=`
precision highp float;
in vec3 vN,vW; in vec2 vUV;
uniform vec3 uBase,uEmis,uCam;
uniform float uMetal,uRough,uOpacity,uEmisI;
uniform int uLightCount;
uniform vec3 uLPos[6];
uniform vec3 uLCol[6];
uniform float uLInt[6];
uniform int uLCast[6];
uniform int uLKind[6];
uniform sampler2D uShadow;
uniform mat4 uLightVP;
uniform float uShadowOn;
uniform vec3 uAmbTop,uAmbBot;
out vec4 frag;
void main(){
  vec3 N=normalize(vN);
  vec3 V=normalize(uCam-vW);
  if(dot(N,V)<0.0&&uOpacity<0.999)N=-N;
  vec3 Rr=reflect(-V,N);
  float sky=clamp(Rr.y*0.5+0.5,0.0,1.0);
  vec3 env=mix(uAmbBot,uAmbTop,sky);
  env+=vec3(1.0,0.45,0.18)*pow(sky,4.0)*0.8;
  vec3 diffuse=env*uBase*(1.0-uMetal*0.85);
  vec3 spec=env*(0.04+uMetal*0.9)*1.2;
  for(int i=0;i<6;i++){
    if(i>=uLightCount)break;
    vec3 Lv=uLPos[i]-vW;
    float d=length(Lv);
    if(d<0.001)continue;
    vec3 L=Lv/d;
    float att=(uLKind[i]==1)?1.0:1.0/(1.0+0.00035*d*d);
    if(uLCast[i]==1){
      vec4 lp=uLightVP*vec4(vW,1.0);
      vec3 pr=lp.xyz/lp.w*0.5+0.5;
      if(pr.x>0.0&&pr.x<1.0&&pr.y>0.0&&pr.y<1.0&&pr.z<1.0){
        float s=0.0;
        for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
          float dd=texture(uShadow,pr.xy+vec2(float(x),float(y))/2048.0).r;
          s+=(pr.z-0.0015>dd)?0.0:1.0;
        }
        s/=9.0;
        att*=mix(0.22,1.0,s);
      }
    }
    float diff=max(dot(N,L),0.0);
    vec3 H=normalize(L+V);
    float shin=mix(16.0,220.0,1.0-uRough);
    float sp=pow(max(dot(N,H),0.0),shin)*(1.0-uRough*0.85);
    vec3 lc=uLCol[i]*uLInt[i]*att;
    diffuse+=lc*uBase*diff*(1.0-uMetal*0.6);
    spec+=lc*sp*(0.25+uMetal*2.2);
  }
  vec3 col=diffuse+spec+uEmis*uEmisI;
  frag=vec4(col,uOpacity);
}`;
const VS_QUAD=`
precision highp float;
in vec2 aPos;
out vec2 vUV;
void main(){ vUV=aPos*0.5+0.5; gl_Position=vec4(aPos,0.0,1.0); }`;
const FS_QUAD=`
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec4 uTint;
uniform vec2 uTexel;
uniform int uMode;
uniform float uAmount;
out vec4 frag;
vec4 blur9(){
  vec4 s=texture(uTex,vUV)*0.25;
  s+=texture(uTex,vUV+vec2(uTexel.x,0.0))*0.125;
  s+=texture(uTex,vUV-vec2(uTexel.x,0.0))*0.125;
  s+=texture(uTex,vUV+vec2(0.0,uTexel.y))*0.125;
  s+=texture(uTex,vUV-vec2(0.0,uTexel.y))*0.125;
  s+=texture(uTex,vUV+uTexel)*0.0625;
  s+=texture(uTex,vUV-uTexel)*0.0625;
  s+=texture(uTex,vUV+vec2(uTexel.x,-uTexel.y))*0.0625;
  s+=texture(uTex,vUV+vec2(-uTexel.x,uTexel.y))*0.0625;
  return s;
}
void main(){
  vec4 c=texture(uTex,vUV);
  if(uMode==1)c=blur9();
  else if(uMode==2){float l=dot(c.rgb,vec3(0.299,0.587,0.114));c=vec4(l,l,l,c.a);}
  else if(uMode==3){c=vec4(0.0,0.0,0.0,c.a);}
  frag=c*uTint;
}`;
const VS_PARTICLE=`
precision highp float;
in vec3 aCorner;
in vec3 aPos;
in vec4 aColor;
in vec2 aSize;
uniform mat4 uProj,uView;
out vec4 vColor; out vec2 vCorner;
void main(){
  vec4 p=uView*vec4(aPos,1.0);
  gl_Position=uProj*vec4(p.xy+aCorner.xy*aSize,p.z,1.0);
  vColor=aColor; vCorner=aCorner.xy;
}`;
const FS_PARTICLE=`
precision highp float;
in vec4 vColor; in vec2 vCorner;
out vec4 frag;
void main(){
  float d=length(vCorner);
  if(d>1.0)discard;
  float a=1.0-d;
  a*=a;
  frag=vec4(vColor.rgb,vColor.a*a);
}`;
const VS_TEX=`
precision highp float;
in vec2 aPos;
uniform mat4 uProj,uView,uModel;
out vec2 vUV;
void main(){
  vec4 w=uModel*vec4(aPos,0.0,1.0);
  vUV=aPos;
  gl_Position=uProj*uView*w;
}`;
const FS_TEX=`
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uAlpha;
uniform vec4 uUVBounds;
out vec4 frag;
void main(){
  vec2 uv=vUV*0.5+0.5;
  uv=(uv-uUVBounds.xy)/uUVBounds.zw;
  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0)discard;
  vec4 c=texture(uTex,uv);
  frag=vec4(c.rgb,c.a*uAlpha);
}`;
const FS_MASKMUL=`
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform sampler2D uMask;
uniform int uInvert;
out vec4 frag;
void main(){
  vec4 c=texture(uTex,vUV);
  float m=texture(uMask,vUV).a;
  if(uInvert==1)m=1.0-m;
  frag=vec4(c.rgb,c.a*m);
}`;
const FS_HSL=`
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec3 uHSB;
out vec4 frag;
vec3 rgb2hsv(vec3 c){
  vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);
  vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
  vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
  float d=q.x-min(q.w,q.y);
  float e=1.0e-10;
  return vec3(abs(q.z+(q.w-q.y)/(6.0*d+e)),d/(q.x+e),q.x);
}
vec3 hsv2rgb(vec3 c){
  vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);
  vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);
  return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
}
void main(){
  vec4 c=texture(uTex,vUV);
  vec3 h=rgb2hsv(c.rgb);
  h.x=fract(h.x+uHSB.x/360.0);
  h.y=clamp(h.y*(1.0+uHSB.y/100.0),0.0,1.0);
  h.z=clamp(h.z+uHSB.z/100.0,0.0,1.0);
  frag=vec4(hsv2rgb(h),c.a);
}`;
const FS_DOF=`
precision highp float;
in vec2 vUV;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uTexel;
uniform float uFocus,uAperture,uNear,uFar;
out vec4 frag;
float linearZ(float z){
  float nz=z*2.0-1.0;
  return (2.0*uNear*uFar)/(uFar+uNear-nz*(uFar-uNear));
}
void main(){
  vec4 c=texture(uColor,vUV);
  float z=texture(uDepth,vUV).r;
  if(z>=0.9999){frag=c;return;}
  float dist=linearZ(z);
  float coc=clamp(uAperture*abs(dist-uFocus)/max(dist,1.0),0.0,1.0);
  if(coc<0.012){frag=c;return;}
  vec4 sum=vec4(0.0);float wsum=0.0;
  for(int i=-5;i<=5;i++){
    for(int j=-5;j<=5;j++){
      vec2 o=vec2(float(i),float(j))*uTexel*coc*16.0;
      vec2 uv=clamp(vUV+o,vec2(0.001),vec2(0.999));
      float z2=texture(uDepth,uv).r;
      float d2=linearZ(z2);
      float c2=clamp(uAperture*abs(d2-uFocus)/max(d2,1.0),0.0,1.0);
      float w=1.0/(1.0+c2*8.0);
      sum+=texture(uColor,uv)*w;wsum+=w;
    }
  }
  frag=sum/wsum;
}`;
const FS_PRESENT=`
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uCanvas;
uniform vec2 uCenter;
uniform vec2 uComp;
uniform float uZoom;
out vec4 frag;
void main(){
  vec2 px=vUV*uCanvas;
  vec2 uv=(px-uCenter)/(uZoom*uComp)+0.5;
  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){frag=vec4(0.043,0.047,0.055,1.0);return;}
  frag=texture(uTex,uv);
}`;
R.compileAll=function(){
  const gl=R.gl;
  R.prog.flat=prog(gl,VS_FLAT,FS_FLAT,'flat');
  R.prog.mesh=prog(gl,VS_MESH,FS_MESH,'mesh');
  R.prog.quad=prog(gl,VS_QUAD,FS_QUAD,'quad');
  R.prog.part=prog(gl,VS_PARTICLE,FS_PARTICLE,'particle');
  R.quadBuf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,R.quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,-1,1,1,-1,1]),gl.STATIC_DRAW);
};
R.compileExtra=function(){
  const gl=R.gl;
  if(R.prog.tex)return;
  R.prog.tex=prog(gl,VS_TEX,FS_TEX,'tex');
  R.prog.maskMul=prog(gl,VS_QUAD,FS_MASKMUL,'maskmul');
  R.prog.hsl=prog(gl,VS_QUAD,FS_HSL,'hsl');
  R.prog.dof=prog(gl,VS_QUAD,FS_DOF,'dof');
  R.prog.present=prog(gl,VS_QUAD,FS_PRESENT,'present');
};

/* ---------- FBO ---------- */
function makeTex(gl,w,h){
  const t=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  return t;
}
function makeDepth(gl,w,h){
  const t=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  return t;
}
function makeFBO(gl,w,h,withDepth,msaa){
  const o={w,h};
  if(msaa){
    const c=gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER,c);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER,4,gl.RGBA8,w,h);
    o.msColor=c;
    if(withDepth){
      const d=gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER,d);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER,4,gl.DEPTH_COMPONENT24,w,h);
      o.msDepth=d;
    }
    const f=gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,f);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.RENDERBUFFER,o.msColor);
    if(o.msDepth)gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,o.msDepth);
    o.msFBO=f;
  }
  o.tex=makeTex(gl,w,h);
  if(withDepth)o.depth=makeDepth(gl,w,h);
  const f=gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,o.tex,0);
  if(o.depth)gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,o.depth,0);
  o.fbo=f;
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  return o;
}
function ensureFBO(gl,slot,w,h,withDepth,msaa){
  const f=R.fbo[slot];
  if(f&&f.w===w&&f.h===h)return f;
  if(f){
    try{gl.deleteFramebuffer(f.fbo);gl.deleteTexture(f.tex);if(f.depth)gl.deleteTexture(f.depth);
      if(f.msFBO)gl.deleteFramebuffer(f.msFBO);if(f.msColor)gl.deleteRenderbuffer(f.msColor);
      if(f.msDepth)gl.deleteRenderbuffer(f.msDepth);}catch(e){}
  }
  R.fbo[slot]=makeFBO(gl,w,h,withDepth,msaa);
  return R.fbo[slot];
}
function bindFBO(gl,f,ms){
  if(ms&&f.msFBO){gl.bindFramebuffer(gl.FRAMEBUFFER,f.msFBO);gl.viewport(0,0,f.w,f.h);return;}
  gl.bindFramebuffer(gl.FRAMEBUFFER,f.fbo);gl.viewport(0,0,f.w,f.h);
}
function blitMS(gl,f){
  if(!f.msFBO)return;
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,f.msFBO);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,f.fbo);
  gl.blitFramebuffer(0,0,f.w,f.h,0,0,f.w,f.h,gl.COLOR_BUFFER_BIT,gl.NEAREST);
  if(f.msDepth&&f.depth)gl.blitFramebuffer(0,0,f.w,f.h,0,0,f.w,f.h,gl.DEPTH_BUFFER_BIT,gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
}
function clearFBO(gl,f,r,g,b,a,ms){
  bindFBO(gl,f,ms);
  gl.clearColor(r,g,b,a);gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
}
function projOrtho(w,h){return C.m4ortho(-w/2,w/2,h/2,-h/2,-20000,20000);}
function projPerspYDown(fov,aspect,near,far){
  const f=1/Math.tan(fov*Math.PI/360);
  const m=new Float32Array(16);
  m[0]=f/aspect;m[5]=-f;m[11]=-1;
  m[10]=(far+near)/(near-far);m[14]=2*far*near/(near-far);
  return m;
}

/* ---------- 2D 路径 ---------- */
function unbindTex(gl){
  for(let i=0;i<4;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,null);}
  gl.activeTexture(gl.TEXTURE0);
}
function drawContours(gl,contours,pr,model,color){
  unbindTex(gl);
  const tris=G.triangulate(contours);
  if(!tris.idx.length)return;
  const pos=new Float32Array(tris.pos.length/2*3);
  for(let i=0,j=0;i<tris.pos.length;i+=2,j+=3){pos[j]=tris.pos[i];pos[j+1]=tris.pos[i+1];pos[j+2]=0;}
  let b=R.tmpBuf;
  if(!b)b=R.tmpBuf=R.gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,b);
  gl.bufferData(gl.ARRAY_BUFFER,pos,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(pr.a.aPos);
  gl.vertexAttribPointer(pr.a.aPos,3,gl.FLOAT,false,0,0);
  gl.uniform4fv(pr.u.uColor,color);
  gl.uniformMatrix4fv(pr.u.uModel,false,model);
  let ib=R.tmpIdx;
  if(!ib)ib=R.tmpIdx=R.gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,tris.idx,gl.DYNAMIC_DRAW);
  gl.drawElements(gl.TRIANGLES,tris.idx.length,gl.UNSIGNED_INT,0);
}
R.uploadMesh=function(mesh){
  const key=mesh.__id||(mesh.__id=C.uid('m'));
  let b=R.meshBufs[key];
  if(!b||b.len!==mesh.pos.length){
    b=R.meshBufs[key]={pos:R.gl.createBuffer(),nor:R.gl.createBuffer(),uv:R.gl.createBuffer(),
      idx:R.gl.createBuffer(),len:mesh.pos.length};
    R.gl.bindBuffer(R.gl.ARRAY_BUFFER,b.pos);R.gl.bufferData(R.gl.ARRAY_BUFFER,mesh.pos,R.gl.STATIC_DRAW);
    R.gl.bindBuffer(R.gl.ARRAY_BUFFER,b.nor);R.gl.bufferData(R.gl.ARRAY_BUFFER,mesh.nor,R.gl.STATIC_DRAW);
    R.gl.bindBuffer(R.gl.ARRAY_BUFFER,b.uv);R.gl.bufferData(R.gl.ARRAY_BUFFER,mesh.uv,R.gl.STATIC_DRAW);
    R.gl.bindBuffer(R.gl.ELEMENT_ARRAY_BUFFER,b.idx);R.gl.bufferData(R.gl.ELEMENT_ARRAY_BUFFER,mesh.idx,R.gl.STATIC_DRAW);
  }
  return b;
};
function drawQuad(gl,pr,tex,tint,mode,amount,texel){
  gl.useProgram(pr.p);
  gl.bindBuffer(gl.ARRAY_BUFFER,R.quadBuf);
  gl.enableVertexAttribArray(pr.a.aPos);
  gl.vertexAttribPointer(pr.a.aPos,2,gl.FLOAT,false,0,0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.uniform1i(pr.u.uTex,0);
  gl.uniform4fv(pr.u.uTint,tint||[1,1,1,1]);
  gl.uniform1i(pr.u.uMode,mode||0);
  gl.uniform1f(pr.u.uAmount,amount||0);
  if(pr.u.uTexel)gl.uniform2fv(pr.u.uTexel,texel||[1/512,1/512]);
  gl.disable(gl.DEPTH_TEST);
  gl.drawArrays(gl.TRIANGLES,0,6);
}
function setBlend(gl,mode){
  if(mode==='add'){gl.blendFunc(gl.ONE,gl.ONE);return;}
  if(mode==='screen'){gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_COLOR);return;}
  if(mode==='multiply'||mode==='overlay'){gl.blendFunc(gl.DST_COLOR,gl.ONE_MINUS_SRC_ALPHA);return;}
  gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
}

/* ---------- 主入口 ---------- */
function hasAnim(layer){
  const chk=p=>p&&p.keys&&p.keys.length>0;
  const t=layer.t;
  if(chk(t.anchor)||chk(t.pos)||chk(t.scale)||chk(t.rot)||chk(t.opacity))return true;
  for(const k in layer.props)if(chk(layer.props[k]))return true;
  if(layer.particle)return true;
  if(layer.precomp&&chk(layer.precomp.timeRemap))return true;
  for(const g of (layer.shape?layer.shape.groups:[])){
    if(chk(g.transform.pos)||chk(g.transform.rot)||chk(g.transform.scale)||chk(g.transform.opacity))return true;
    for(const it of g.items){
      if(it.type==='trim'&&(chk(it.start)||chk(it.end)||chk(it.offset)))return true;
      if(it.type==='repeater'&&(chk(it.copies)||chk(it.pos)||chk(it.rot)))return true;
      if(it.type==='path'&&it.keys&&it.keys.length>1)return true;
      if((it.type==='fill'||it.type==='stroke')&&chk(it.opacity))return true;
    }
  }
  for(const m of (layer.masks||[]))for(const k in m.props)if(chk(m.props[k]))return true;
  for(const e of (layer.effects||[]))for(const k in e.props)if(chk(e.props[k]))return true;
  if(layer.text&&layer.text.animators&&layer.text.animators.length)return true;
  if(layer.geo3d){
    if(chk(layer.geo3d.depth)||chk(layer.geo3d.bevel)||chk(layer.geo3d.deform.bend)||chk(layer.geo3d.deform.twist))return true;
    for(const p of layer.geo3d.deform.pins)if(chk(p.pos))return true;
    for(const k in layer.geo3d.material)if(chk(layer.geo3d.material[k]))return true;
  }
  return false;
}
R.renderComp=function(comp,time,opt){
  opt=opt||{};
  const gl=R.gl;
  const w=opt.w||comp.w, h=opt.h||comp.h;
  const scene=ensureFBO(gl,'scene',w,h,true,true);
  const acc=ensureFBO(gl,'acc',w,h,false,false);
  let sub=[time];
  const mbAny=comp.mb&&comp.mb.on&&comp.layers.some(l=>l.mb&&(hasAnim(l)||comp.layers.some(x=>x.type==='particle')));
  if(mbAny&&!opt.noMB){
    const fd=1/comp.fps;
    const interval=comp.mb.shutter/360*fd;
    const samples=Math.max(2,Math.min(16,Math.round(comp.mb.samples||8)));
    const phase=(comp.mb.phase||0)/360*fd;
    sub=[];
    for(let i=0;i<samples;i++)sub.push(time+phase-interval/2+interval*(i+0.5)/samples);
  }
  if(sub.length===1){
    R.renderPass(comp,sub[0],scene,opt);
    blitMS(gl,scene);
    R._lastScene=scene;
  }else{
    clearFBO(gl,acc,0,0,0,0,false);
    for(const st of sub){
      R.renderPass(comp,st,scene,opt);
      blitMS(gl,scene);
      gl.bindFramebuffer(gl.FRAMEBUFFER,acc.fbo);
      gl.viewport(0,0,w,h);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE,gl.ONE);
      drawQuad(gl,R.prog.quad,scene.tex,[1/sub.length,1/sub.length,1/sub.length,1/sub.length],0,0,[1/w,1/h]);
    }
    R._lastScene=acc;
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  let outFBO=R._lastScene;
  if(opt.dof&&opt.dof>0.01&&R._lastScene.depth){
    const dof=ensureFBO(gl,'dof',w,h,false,false);
    gl.bindFramebuffer(gl.FRAMEBUFFER,dof.fbo);gl.viewport(0,0,w,h);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
    const dp=R.prog.dof;
    gl.useProgram(dp.p);
    gl.bindBuffer(gl.ARRAY_BUFFER,R.quadBuf);
    gl.enableVertexAttribArray(dp.a.aPos);gl.vertexAttribPointer(dp.a.aPos,2,gl.FLOAT,false,0,0);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,R._lastScene.tex);gl.uniform1i(dp.u.uColor,0);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,R._lastScene.depth);gl.uniform1i(dp.u.uDepth,1);
    gl.uniform2f(dp.u.uTexel,1/w,1/h);
    gl.uniform1f(dp.u.uFocus,opt.focus||1200);
    gl.uniform1f(dp.u.uAperture,opt.dof);
    gl.uniform1f(dp.u.uNear,1);
    gl.uniform1f(dp.u.uFar,30000);
    gl.drawArrays(gl.TRIANGLES,0,6);
    outFBO=dof;R._lastScene=dof;
  }
  return outFBO;
};
function bgCol(comp){const x=C.hex2rgb(comp.bg||'#0b0c0e');return [x.r,x.g,x.b];}
R.renderPass=function(comp,time,scene,opt){
  const gl=R.gl;
  const w=scene.w,h=scene.h;
  let cam=null;
  for(const l of comp.layers){
    if(l.type==='camera'&&l.visible&&A.layerActive(l,comp,time)){cam=l;break;}
  }
  let proj,view,camPos={x:0,y:0,z:-1400};
  if(cam){
    const cm=A.cameraMatrices(cam,comp,time);
    proj=projPerspYDown(cm.fov,w/h,1,30000);
    view=cm.view;camPos=cm.pos;
  }else{
    proj=projOrtho(w,h);view=C.m4id();
  }
  R._view={proj,view,camPos,cam};
  const bc=bgCol(comp);
  clearFBO(gl,scene,bc[0],bc[1],bc[2],1,true);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  R.renderShadowMap(comp,time);
  const adjust=[];
  for(const layer of comp.layers){
    const lt=A.layerTime(layer,comp,time);
    if(lt===null)continue;
    if(layer.type==='camera')continue;
    if(layer.type==='adjust'){adjust.push(layer);continue;}
    R.renderLayer(layer,comp,time,lt,scene,opt);
  }
  blitMS(gl,scene);
  for(const al of adjust){
    const tmp=ensureFBO(gl,'adj',w,h,false,false);
    gl.bindFramebuffer(gl.FRAMEBUFFER,tmp.fbo);gl.viewport(0,0,w,h);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
    drawQuad(gl,R.prog.quad,scene.tex,null,0,0,[1/w,1/h]);
    R.applyEffects(al,comp,time,tmp,0,CT.buildEffects(al,comp,time));
    gl.bindFramebuffer(gl.FRAMEBUFFER,scene.fbo);gl.viewport(0,0,w,h);
    gl.enable(gl.BLEND);setBlend(gl,'normal');
    const op=A.evalNum(al.t.opacity,time,{comp,layer:al,time})/100;
    const tp=R.prog.tex;
    gl.useProgram(tp.p);
    gl.bindBuffer(gl.ARRAY_BUFFER,R.quadBuf);
    gl.enableVertexAttribArray(tp.a.aPos);gl.vertexAttribPointer(tp.a.aPos,2,gl.FLOAT,false,0,0);
    gl.uniformMatrix4fv(tp.u.uProj,false,projOrtho(2,2));
    gl.uniformMatrix4fv(tp.u.uView,false,C.m4id());
    gl.uniformMatrix4fv(tp.u.uModel,false,C.m4id());
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tmp.tex);gl.uniform1i(tp.u.uTex,0);
    gl.uniform1f(tp.u.uAlpha,op);gl.uniform2fv(tp.u.uTexel,[1/w,1/h]);
    gl.uniform4fv(tp.u.uUVBounds,[0,0,1,1]);
    gl.drawArrays(gl.TRIANGLES,0,6);
    gl.disable(gl.BLEND);
  }
  blitMS(gl,scene);
};

/* ---------- 阴影贴图 ---------- */
R.renderShadowMap=function(comp,time){
  const gl=R.gl;
  let dirLight=null;
  for(const l of comp.layers){
    if(l.type==='light'&&l.visible&&A.layerActive(l,comp,time)){
      if(A.evalNum(l.props.kind,time,{comp,layer:l,time})===1){dirLight=l;break;}
    }
  }
  R._shadowVP=null;
  if(!dirLight)return;
  const S=R.shadowSize;
  const fbo=ensureFBO(gl,'shadow',S,S,true,false);
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo.fbo);
  gl.viewport(0,0,S,S);
  gl.clearColor(1,1,1,1);gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  const m=A.worldMatrixAt(dirLight,comp,time);
  const dir={x:-m[8],y:-m[9],z:-m[10]};
  const pos={x:m[12],y:m[13],z:m[14]};
  let cx=0,cy=0,cz=0,rad=Math.max(comp.w,comp.h)*1.3,cnt=0;
  for(const l of comp.layers){
    if(l.type==='geo3d'||l.type==='particle'||(l.is3D&&l.type!=='camera'&&l.type!=='light')){
      const o=A.layerOrigin(l,comp,time);cx+=o.x;cy+=o.y;cz+=o.z;cnt++;
    }
  }
  if(cnt){cx/=cnt;cy/=cnt;cz/=cnt;}else{cz=0;}
  const eye={x:cx-dir.x*rad,y:cy-dir.y*rad,z:cz-dir.z*rad};
  const view=C.m4lookAt(eye.x,eye.y,eye.z,cx,cy,cz,0,-1,0);
  const proj=C.m4ortho(-rad,rad,rad,-rad,1,rad*3);
  R._shadowVP=C.m4mul(proj,view);
  const pr=R.prog.mesh;
  unbindTex(gl);
  gl.useProgram(pr.p);
  gl.uniformMatrix4fv(pr.u.uProj,false,proj);
  gl.uniformMatrix4fv(pr.u.uView,false,view);
  gl.uniform1i(pr.u.uLightCount,0);
  gl.uniform1f(pr.u.uShadowOn,0);
  gl.disable(gl.BLEND);
  for(const l of comp.layers){
    if(l.type!=='geo3d')continue;
    const lt=A.layerTime(l,comp,time);
    if(lt===null)continue;
    const data=R.getLayerData(l,comp,time);
    if(!data||!data.mesh)continue;
    const model=A.worldMatrixAt(l,comp,time);
    const b=R.uploadMesh(data.mesh);
    gl.uniformMatrix4fv(pr.u.uModel,false,model);
    gl.bindBuffer(gl.ARRAY_BUFFER,b.pos);gl.enableVertexAttribArray(pr.a.aPos);gl.vertexAttribPointer(pr.a.aPos,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,b.nor);gl.enableVertexAttribArray(pr.a.aNor);gl.vertexAttribPointer(pr.a.aNor,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,b.uv);gl.enableVertexAttribArray(pr.a.aUV);gl.vertexAttribPointer(pr.a.aUV,2,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,b.idx);
    gl.drawElements(gl.TRIANGLES,data.mesh.idx.length,gl.UNSIGNED_INT,0);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
};

/* ---------- 图层数据缓存 ---------- */
R.getLayerData=function(layer,comp,time){
  const key=comp.id+'|'+layer.id+'|'+time.toFixed(4);
  const cache=APP.app.renderCache;
  if(cache.has(key))return cache.get(key);
  let data=null;
  try{data=CT.buildLayer(layer,comp,time);}catch(e){
    if(APP.app)APP.app.lastError=e.message;
    data=null;
  }
  cache.set(key,data);
  if(cache.size>800){const k=cache.keys().next().value;cache.delete(k);}
  return data;
};

/* ---------- 图层渲染 ---------- */
R.renderLayer=function(layer,comp,time,lt,scene,opt){
  const gl=R.gl;
  const w=scene.w,h=scene.h;
  if(layer.type==='precomp'){R.renderPrecomp(layer,comp,time,scene,opt);return;}
  if(layer.type==='particle'){
    if(APP.sim)APP.sim.renderParticles(layer,comp,time,scene,opt);
    return;
  }
  if(layer.type==='audio'||layer.type==='light'||layer.type==='camera'||layer.type==='null')return;
  const data=R.getLayerData(layer,comp,time);
  if(layer.type==='geo3d'&&data&&data.mesh){
    R.renderMesh(layer,comp,time,data,scene);
    return;
  }
  if(!data||!data.ops.length)return;
  const pad=Math.max(40,Math.round(Math.max(w,h)*0.08));
  const lf=ensureFBO(gl,'layer',w+pad*2,h+pad*2,false,false);
  bindFBO(gl,lf,false);
  gl.clearColor(0,0,0,0);gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
  setBlend(gl,'normal');
  const model=A.worldMatrixAt(layer,comp,time);
  const pr=R.prog.flat;
  gl.useProgram(pr.p);
  gl.uniformMatrix4fv(pr.u.uProj,false,R._view.proj);
  gl.uniformMatrix4fv(pr.u.uView,false,R._view.view);
  const mOff=C.m4id();mOff[12]=pad;mOff[13]=pad;
  const modelP=C.m4mul(mOff,model);
  gl.uniformMatrix4fv(pr.u.uModel,false,modelP);
  for(const op of data.ops){
    const col=[op.color[0],op.color[1],op.color[2],op.opacity];
    if(op.kind==='fill'){
      drawContours(gl,op.paths.map(p=>p.pts.map(pt=>({x:pt.x,y:pt.y}))),pr,modelP,col);
    }else if(op.kind==='stroke'){
      drawContours(gl,op.rings,pr,modelP,col);
    }
  }
  if(data.masks.length)R.applyMasks(lf,data.masks,pad,comp,time);
  if(data.effects.length)R.applyEffects(layer,comp,time,lf,pad,data.effects);
  // 合成到场景
  bindFBO(gl,scene,true);
  gl.enable(gl.BLEND);gl.enable(gl.DEPTH_TEST);
  setBlend(gl,layer.blend||'normal');
  const tp=R.prog.tex;
  gl.useProgram(tp.p);
  const qb=R.quadLayerBuf(w,h);
  gl.bindBuffer(gl.ARRAY_BUFFER,qb);
  gl.enableVertexAttribArray(tp.a.aPos);
  gl.vertexAttribPointer(tp.a.aPos,2,gl.FLOAT,false,0,0);
  const modelQ=C.m4mul(mOff,model);
  gl.uniformMatrix4fv(tp.u.uProj,false,R._view.proj);
  gl.uniformMatrix4fv(tp.u.uView,false,R._view.view);
  gl.uniformMatrix4fv(tp.u.uModel,false,modelQ);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,lf.tex);
  gl.uniform1i(tp.u.uTex,0);
  gl.uniform1f(tp.u.uAlpha,data.opacity!==undefined?data.opacity:1);
  gl.uniform2fv(tp.u.uTexel,[1/lf.w,1/lf.h]);
  gl.uniform4fv(tp.u.uUVBounds,[pad/(w+pad*2),pad/(h+pad*2),1-2*pad/(w+pad*2),1-2*pad/(h+pad*2)]);
  gl.drawArrays(gl.TRIANGLES,0,6);
};
R.quadLayerBuf=function(w,h){
  const key='q'+w+'x'+h;
  if(R._qlb&&R._qlb.key===key)return R._qlb.buf;
  const gl=R.gl;
  const b=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,b);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-w/2,-h/2,w/2,-h/2,-w/2,h/2,w/2,-h/2,w/2,h/2,-w/2,h/2]),gl.STATIC_DRAW);
  R._qlb={key,buf:b};
  return b;
};

/* ---------- 三维网格 ---------- */
R.renderMesh=function(layer,comp,time,data,scene){
  const gl=R.gl;
  const pr=R.prog.mesh;
  unbindTex(gl);
  bindFBO(gl,scene,true);
  gl.enable(gl.BLEND);gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  const model=A.worldMatrixAt(layer,comp,time);
  gl.useProgram(pr.p);
  gl.uniformMatrix4fv(pr.u.uProj,false,R._view.proj);
  gl.uniformMatrix4fv(pr.u.uView,false,R._view.view);
  gl.uniformMatrix4fv(pr.u.uModel,false,model);
  const mat=data.material||{};
  gl.uniform3fv(pr.u.uBase,mat.base||[0.8,0.6,0.3]);
  gl.uniform3fv(pr.u.uEmis,mat.emissive||[0,0,0]);
  gl.uniform1f(pr.u.uEmisI,mat.emissiveI||0);
  gl.uniform1f(pr.u.uMetal,mat.metal!==undefined?mat.metal:0.8);
  gl.uniform1f(pr.u.uRough,mat.rough!==undefined?mat.rough:0.4);
  gl.uniform1f(pr.u.uOpacity,mat.opacity!==undefined?mat.opacity:1);
  gl.uniform3fv(pr.u.uCam,[R._view.camPos.x,R._view.camPos.y,R._view.camPos.z]);
  gl.uniform3fv(pr.u.uAmbTop,[0.22,0.24,0.3]);
  gl.uniform3fv(pr.u.uAmbBot,[0.05,0.05,0.07]);
  R.bindLights(comp,time,pr);
  if(R._shadowVP){
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D,R.fbo.shadow.tex);
    gl.uniform1i(pr.u.uShadow,1);
    gl.uniformMatrix4fv(pr.u.uLightVP,false,R._shadowVP);
    gl.uniform1f(pr.u.uShadowOn,1);
  }else{
    gl.uniform1f(pr.u.uShadowOn,0);
  }
  const b=R.uploadMesh(data.mesh);
  gl.bindBuffer(gl.ARRAY_BUFFER,b.pos);gl.enableVertexAttribArray(pr.a.aPos);gl.vertexAttribPointer(pr.a.aPos,3,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,b.nor);gl.enableVertexAttribArray(pr.a.aNor);gl.vertexAttribPointer(pr.a.aNor,3,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,b.uv);gl.enableVertexAttribArray(pr.a.aUV);gl.vertexAttribPointer(pr.a.aUV,2,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,b.idx);
  gl.drawElements(gl.TRIANGLES,data.mesh.idx.length,gl.UNSIGNED_INT,0);
};
R.bindLights=function(comp,time,pr){
  const gl=R.gl;
  const pos=[],col=[],inten=[],cast=[],kind=[];
  for(const l of comp.layers){
    if(l.type!=='light')continue;
    if(!A.layerActive(l,comp,time))continue;
    if(pos.length/3>=6)break;
    const kindV=A.evalNum(l.props.kind,time,{comp,layer:l,time});
    const intenV=A.evalNum(l.props.intensity,time,{comp,layer:l,time});
    const color=A.eval(l.props.color,time,{comp,layer:l,time})||[1,1,1];
    const m=A.worldMatrixAt(l,comp,time);
    if(kindV===1){
      const dx=-m[8],dy=-m[9],dz=-m[10];
      pos.push(comp.w*0.5+dx*8000,comp.h*0.5+dy*8000,-dx*8000-dy*8000);
      col.push(color[0],color[1],color[2]);inten.push(intenV);
      cast.push(A.evalNum(l.props.shadow,time,{comp,layer:l,time})>0.5?1:0);
      kind.push(1);
    }else{
      pos.push(m[12],m[13],m[14]);
      col.push(color[0],color[1],color[2]);inten.push(intenV);
      cast.push(0);kind.push(0);
    }
  }
  while(pos.length<18)pos.push(0);
  while(col.length<18)col.push(0);
  while(inten.length<6)inten.push(0);
  while(cast.length<6)cast.push(0);
  while(kind.length<6)kind.push(0);
  gl.uniform3fv(pr.u.uLPos,pos);
  gl.uniform3fv(pr.u.uLCol,col);
  gl.uniform1fv(pr.u.uLInt,inten);
  gl.uniform1iv(pr.u.uLCast,cast);
  gl.uniform1iv(pr.u.uLKind,kind);
  gl.uniform1i(pr.u.uLightCount,pos.length/3);
};

/* ---------- 预合成 ---------- */
R.renderPrecomp=function(layer,comp,time,scene,opt){
  const gl=R.gl;
  const sub=P.comp(layer.precomp.compId);
  if(!sub)return;
  const st=A.evalNum(layer.precomp.timeRemap,time,{comp,layer,time});
  const srcT=C.clamp(st,0,sub.duration);
  const f=R.renderComp(sub,srcT,{noMB:true});
  bindFBO(gl,scene,true);
  gl.enable(gl.BLEND);gl.enable(gl.DEPTH_TEST);
  setBlend(gl,layer.blend||'normal');
  const pr=R.prog.tex;
  gl.useProgram(pr.p);
  const w=sub.w,h=sub.h;
  const qb=R.quadLayerBuf(w,h);
  gl.bindBuffer(gl.ARRAY_BUFFER,qb);
  gl.enableVertexAttribArray(pr.a.aPos);
  gl.vertexAttribPointer(pr.a.aPos,2,gl.FLOAT,false,0,0);
  const model=A.worldMatrixAt(layer,comp,time);
  gl.uniformMatrix4fv(pr.u.uProj,false,R._view.proj);
  gl.uniformMatrix4fv(pr.u.uView,false,R._view.view);
  gl.uniformMatrix4fv(pr.u.uModel,false,model);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,f.tex);
  gl.uniform1i(pr.u.uTex,0);
  gl.uniform1f(pr.u.uAlpha,A.evalNum(layer.t.opacity,time,{comp,layer,time})/100);
  gl.uniform2fv(pr.u.uTexel,[1/f.w,1/f.h]);
  gl.uniform4fv(pr.u.uUVBounds,[0,0,1,1]);
  gl.drawArrays(gl.TRIANGLES,0,6);
};

/* ---------- 蒙版 ---------- */
R.applyMasks=function(fbo,masks,pad,comp,time){
  const gl=R.gl;
  const w=fbo.w,h=fbo.h;
  const mf=ensureFBO(gl,'mask',w,h,false,false);
  bindFBO(gl,mf,false);
  gl.clearColor(0,0,0,0);gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);
  setBlend(gl,'normal');
  const pr=R.prog.flat;
  gl.useProgram(pr.p);
  gl.uniformMatrix4fv(pr.u.uProj,false,projOrtho(w,h));
  gl.uniformMatrix4fv(pr.u.uView,false,C.m4id());
  const mOff=C.m4id();mOff[12]=pad;mOff[13]=pad;
  gl.uniformMatrix4fv(pr.u.uModel,false,mOff);
  for(const m of masks){
    const col=[1,1,1,m.opacity];
    drawContours(gl,[m.pts.map(p=>({x:p.x,y:p.y}))],pr,mOff,col);
  }
  const out=ensureFBO(gl,'maskout',w,h,false,false);
  gl.bindFramebuffer(gl.FRAMEBUFFER,out.fbo);gl.viewport(0,0,w,h);
  gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
  const mp=R.prog.maskMul;
  gl.useProgram(mp.p);
  gl.bindBuffer(gl.ARRAY_BUFFER,R.quadBuf);
  gl.enableVertexAttribArray(mp.a.aPos);
  gl.vertexAttribPointer(mp.a.aPos,2,gl.FLOAT,false,0,0);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,fbo.tex);gl.uniform1i(mp.u.uTex,0);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mf.tex);gl.uniform1i(mp.u.uMask,1);
  gl.uniform1i(mp.u.uInvert,masks.some(m=>m.inverted)?1:0);
  gl.drawArrays(gl.TRIANGLES,0,6);
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo.fbo);gl.viewport(0,0,w,h);
  drawQuad(gl,R.prog.quad,out.tex,null,0,0,[1/w,1/h]);
};

/* ---------- 效果 ---------- */
R.applyEffects=function(layer,comp,time,fbo,pad,effects){
  const gl=R.gl;
  const w=fbo.w,h=fbo.h;
  if(!effects||!effects.length)return;
  const A2=ensureFBO(gl,'fxA',w,h,false,false);
  const B2=ensureFBO(gl,'fxB',w,h,false,false);
  const T1=ensureFBO(gl,'fxT1',w,h,false,false);
  const T2=ensureFBO(gl,'fxT2',w,h,false,false);
  const q=R.prog.quad;
  let cur=fbo;
  const bindQuad=()=>{
    gl.bindBuffer(gl.ARRAY_BUFFER,R.quadBuf);
    gl.enableVertexAttribArray(q.a.aPos);
    gl.vertexAttribPointer(q.a.aPos,2,gl.FLOAT,false,0,0);
  };
  const pass=(srcTex,dst,mode,tint,amount,texel)=>{
    gl.bindFramebuffer(gl.FRAMEBUFFER,dst.fbo);gl.viewport(0,0,w,h);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
    gl.useProgram(q.p);bindQuad();
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,srcTex);gl.uniform1i(q.u.uTex,0);
    gl.uniform4fv(q.u.uTint,tint);
    gl.uniform1i(q.u.uMode,mode||0);
    gl.uniform1f(q.u.uAmount,amount||0);
    gl.uniform2fv(q.u.uTexel,texel||[1/w,1/h]);
    gl.drawArrays(gl.TRIANGLES,0,6);
  };
  for(const e of effects){
    const dst=(cur===A2)?B2:A2;
    if(e.type==='gaussian'){
      const r=Math.max(1,e.props.radius||10);
      pass(cur.tex,T1,1,[1,1,1,1],r,[r/w,r/h]);
      pass(T1.tex,dst,1,[1,1,1,1],r,[r/w,r/h]);
    }else if(e.type==='glow'){
      const th=e.props.threshold!==undefined?e.props.threshold:0.6;
      const radius=e.props.radius||30;
      const intensity=e.props.intensity!==undefined?e.props.intensity:1.5;
      pass(cur.tex,T1,2,[th,th,th,1],0,[1/w,1/h]);
      pass(T1.tex,T2,1,[1,1,1,1],radius,[radius/w,radius/h]);
      gl.bindFramebuffer(gl.FRAMEBUFFER,dst.fbo);gl.viewport(0,0,w,h);
      gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);setBlend(gl,'add');
      gl.useProgram(q.p);bindQuad();
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,cur.tex);gl.uniform1i(q.u.uTex,0);
      gl.uniform4fv(q.u.uTint,[1,1,1,1]);gl.uniform1i(q.u.uMode,0);gl.uniform1f(q.u.uAmount,0);
      gl.uniform2fv(q.u.uTexel,[1/w,1/h]);
      gl.drawArrays(gl.TRIANGLES,0,6);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,T2.tex);
      gl.uniform4fv(q.u.uTint,[intensity,intensity,intensity,1]);
      gl.drawArrays(gl.TRIANGLES,0,6);
      gl.disable(gl.BLEND);
    }else if(e.type==='shadow'){
      const dist=e.props.distance||20,angle=e.props.angle||135,soft=e.props.softness||20;
      const color=e.props.color||[0,0,0],op=e.props.opacity!==undefined?e.props.opacity:0.6;
      const rad=angle*Math.PI/180;
      const ox=Math.cos(rad)*dist,oy=Math.sin(rad)*dist;
      pass(cur.tex,T1,3,[color[0],color[1],color[2],op],0,[1/w,1/h]);
      pass(T1.tex,T2,1,[1,1,1,1],soft,[soft/w,soft/h]);
      gl.bindFramebuffer(gl.FRAMEBUFFER,dst.fbo);gl.viewport(0,0,w,h);
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);setBlend(gl,'normal');
      const off=R.prog.tex;
      gl.useProgram(off.p);
      gl.bindBuffer(gl.ARRAY_BUFFER,R.quadBuf);
      gl.enableVertexAttribArray(off.a.aPos);gl.vertexAttribPointer(off.a.aPos,2,gl.FLOAT,false,0,0);
      gl.uniformMatrix4fv(off.u.uProj,false,projOrtho(2,2));
      gl.uniformMatrix4fv(off.u.uView,false,C.m4id());
      const mo=C.m4id();mo[12]=ox/w;mo[13]=oy/h;
      gl.uniformMatrix4fv(off.u.uModel,false,mo);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,T2.tex);gl.uniform1i(off.u.uTex,0);
      gl.uniform1f(off.u.uAlpha,1);gl.uniform2fv(off.u.uTexel,[1/w,1/h]);
      gl.uniform4fv(off.u.uUVBounds,[0,0,1,1]);
      gl.drawArrays(gl.TRIANGLES,0,6);
      gl.uniformMatrix4fv(off.u.uModel,false,C.m4id());
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,cur.tex);
      gl.drawArrays(gl.TRIANGLES,0,6);
      gl.disable(gl.BLEND);
    }else if(e.type==='hsl'){
      const hue=e.props.hue||0,sat=e.props.saturation!==undefined?e.props.saturation:0,lum=e.props.lightness||0;
      const hp=R.prog.hsl;
      gl.bindFramebuffer(gl.FRAMEBUFFER,dst.fbo);gl.viewport(0,0,w,h);
      gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
      gl.useProgram(hp.p);
      gl.bindBuffer(gl.ARRAY_BUFFER,R.quadBuf);
      gl.enableVertexAttribArray(hp.a.aPos);gl.vertexAttribPointer(hp.a.aPos,2,gl.FLOAT,false,0,0);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,cur.tex);gl.uniform1i(hp.u.uTex,0);
      gl.uniform3f(hp.u.uHSB,hue,sat,lum);
      gl.drawArrays(gl.TRIANGLES,0,6);
    }else continue;
    cur=dst;
  }
  if(cur!==fbo){
    gl.bindFramebuffer(gl.FRAMEBUFFER,fbo.fbo);gl.viewport(0,0,w,h);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
    drawQuad(gl,q,cur.tex,null,0,0,[1/w,1/h]);
  }
};

/* ---------- 显示 ---------- */
R.present=function(fbo,canvas,view){
  const gl=R.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  const cw=canvas.width,ch=canvas.height;
  gl.viewport(0,0,cw,ch);
  gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
  const pr=R.prog.present;
  gl.useProgram(pr.p);
  gl.bindBuffer(gl.ARRAY_BUFFER,R.quadBuf);
  gl.enableVertexAttribArray(pr.a.aPos);
  gl.vertexAttribPointer(pr.a.aPos,2,gl.FLOAT,false,0,0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,fbo.tex);
  gl.uniform1i(pr.u.uTex,0);
  gl.uniform2f(pr.u.uCanvas,cw,ch);
  gl.uniform2f(pr.u.uCenter,view.ox,view.oy);
  gl.uniform2f(pr.u.uComp,fbo.w,fbo.h);
  gl.uniform1f(pr.u.uZoom,view.z);
  gl.drawArrays(gl.TRIANGLES,0,6);
};
})();
