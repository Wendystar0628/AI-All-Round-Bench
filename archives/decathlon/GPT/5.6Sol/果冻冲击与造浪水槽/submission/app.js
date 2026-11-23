/*
 * 介质实验室 / MATTER-02
 * 离线单页实现。渲染使用 WebGL2；水体求解器另以 WebGPU 计算着色器执行
 * 三维粒子-网格 PIC 更新。果冻动力学由体素节点、XPBD 距离/体积约束与
 * 基于应变的连接断裂组成。视觉表面只负责重建求解状态，不参与判定。
 */
(function(){
"use strict";

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)};
const fract=x=>x-Math.floor(x);
const hash=n=>fract(Math.sin(n*127.1)*43758.5453);

const V3={
  add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
  scale:(a,s)=>[a[0]*s,a[1]*s,a[2]*s], dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  len:a=>Math.hypot(a[0],a[1],a[2]), norm:a=>{let l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l]}
};
const M4={
  identity:()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),
  mul:(a,b)=>{let o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o},
  perspective:(fov,asp,n,f)=>{let q=1/Math.tan(fov/2),nf=1/(n-f);return new Float32Array([q/asp,0,0,0,0,q,0,0,0,0,(f+n)*nf,-1,0,0,2*f*n*nf,0])},
  lookAt:(e,t,u)=>{let z=V3.norm(V3.sub(e,t)),x=V3.norm(V3.cross(u,z)),y=V3.cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-V3.dot(x,e),-V3.dot(y,e),-V3.dot(z,e),1])},
  translate:(x,y,z)=>{let m=M4.identity();m[12]=x;m[13]=y;m[14]=z;return m},
  scale:(x,y,z)=>new Float32Array([x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1]),
  rotX:a=>{let c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1])},
  rotY:a=>{let c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1])},
  rotZ:a=>{let c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1])},
  model:(p=[0,0,0],r=[0,0,0],s=[1,1,1])=>M4.mul(M4.translate(...p),M4.mul(M4.rotY(r[1]),M4.mul(M4.rotX(r[0]),M4.mul(M4.rotZ(r[2]),M4.scale(...s)))))
};

function compile(gl,type,src){let s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
function program(gl,vs,fs){let p=gl.createProgram();gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p}

const MAIN_VS=`#version 300 es
precision highp float; precision highp int;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal; layout(location=2) in vec2 aUv;
uniform mat4 uVP,uModel; uniform vec4 uDeform; uniform float uTime; uniform int uKind; uniform float uFluid[16];
out vec3 vWorld,vNormal; out vec2 vUv; out float vRim;
void main(){
  vec3 p=aPos; vec3 n=aNormal;
  if(uKind==1){
    float comp=uDeform.x, wob=uDeform.y, hitX=uDeform.z;
    float radial=length(p.xz-vec2(hitX,0.0));
    float dent=exp(-radial*radial*2.8)*comp*smoothstep(-0.05,0.85,p.y);
    float ring=sin(radial*9.0-uTime*9.0)*exp(-radial*1.8)*wob;
    p.y=p.y*(1.0-comp*.56)-dent*.42+ring*.055;
    p.xz*=1.0+comp*.34*(1.0-p.y*.28)+ring*.035;
    p.x+=sin(p.y*5.0+uTime*5.2)*wob*.055;
  }else if(uKind==2){
    float w=uDeform.x, f=uDeform.y;
    float phase=p.x*f-uTime*(1.1+f*.25);
    float crest=sin(phase)*.62+sin(phase*2.03+.7)*.18;
    crest+=pow(max(0.0,sin(phase-.2)),5.0)*w*.9;
    float gx=clamp(p.x*.5+.5,0.0,1.0)*15.0;
    int g0=int(floor(gx)),g1=min(g0+1,15);
    float solved=mix(uFluid[g0],uFluid[g1],fract(gx));
    float solvedSlope=uFluid[g1]-uFluid[max(g0-1,0)];
    p.y+=crest*w+solved; p.z+=sin(p.x*1.5+uTime)*w*.035;
    n=normalize(vec3(-cos(phase)*w*f-solvedSlope*7.0,1.0,-cos(p.z*2.2+uTime)*w*.08));
  }else if(uKind==4){
    p.y+=sin(p.x*1.7+uTime*1.9)*uDeform.x*.08+sin(p.z*2.4-uTime*1.4)*uDeform.x*.05;
  }
  vec4 wpos=uModel*vec4(p,1.0); vWorld=wpos.xyz;
  vNormal=normalize(mat3(uModel)*n); vUv=aUv; vRim=abs(dot(vNormal,normalize(vec3(.2,.7,.5))));
  gl_Position=uVP*wpos;
}`;
const MAIN_FS=`#version 300 es
precision highp float; precision highp int;
in vec3 vWorld,vNormal; in vec2 vUv; in float vRim;
uniform vec4 uColor; uniform vec4 uMaterial; uniform vec3 uCamera; uniform float uTime; uniform int uKind;
out vec4 frag;
float noise(vec3 p){return fract(sin(dot(floor(p*7.0),vec3(12.9898,78.233,39.425)))*43758.5453);}
void main(){
  vec3 N=normalize(vNormal), V=normalize(uCamera-vWorld), L=normalize(vec3(-.45,.86,.38));
  vec3 H=normalize(L+V); float ndl=max(dot(N,L),0.0), ndh=max(dot(N,H),0.0);
  float metal=uMaterial.x, rough=max(.06,uMaterial.y), alpha=uMaterial.z, emit=uMaterial.w;
  vec3 base=uColor.rgb;
  float spec=pow(ndh,mix(92.0,8.0,rough))*mix(.2,1.3,metal);
  float rim=pow(1.0-max(dot(N,V),0.0),mix(4.0,1.5,rough));
  vec3 col=base*(.19+ndl*.72)+spec*mix(vec3(1.0),base,metal*.72)+rim*base*1.3;
  if(uKind==0){float grid=(step(.965,fract(vWorld.x*.5))+step(.965,fract(vWorld.z*.5)))*.035;col+=grid;}
  if(uKind==1){
    float inner=noise(vWorld*1.7); col+=vec3(.3,.6,.18)*inner*.06;
    col+=rim*vec3(.55,.9,.28); alpha*=.72+rim*.24;
  }
  if(uKind==2||uKind==4){col+=rim*vec3(.15,.7,.78)*1.2;alpha*=.62+rim*.34;}
  if(uKind==3){col+=rim*vec3(.7,.9,1.0)*.8;alpha*=.45+rim*.5;}
  col+=base*emit;
  float fog=smoothstep(11.0,26.0,length(uCamera-vWorld)); col=mix(col,vec3(.035,.07,.065),fog);
  frag=vec4(col,alpha*uColor.a);
}`;
const POINT_VS=`#version 300 es
precision highp float; precision highp int; layout(location=0) in vec3 aPos; layout(location=1) in vec4 aColor;
uniform mat4 uVP; uniform float uSize; out vec4 vColor; out float vDepth;
void main(){vec4 q=uVP*vec4(aPos,1.0);gl_Position=q;gl_PointSize=uSize/max(.5,q.w*.11);vColor=aColor;vDepth=q.w;}`;
const POINT_FS=`#version 300 es
precision highp float; precision highp int; in vec4 vColor; in float vDepth; out vec4 frag;
void main(){vec2 p=gl_PointCoord*2.0-1.0;float r=dot(p,p);if(r>1.0)discard;float h=sqrt(1.0-r);float l=.34+h*.66;float edge=smoothstep(1.0,.62,r);frag=vec4(vColor.rgb*l,vColor.a*edge);}`;

function makeMesh(gl,verts,indices,mode){
  let vao=gl.createVertexArray();gl.bindVertexArray(vao);let vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(verts),gl.STATIC_DRAW);
  let stride=8*4;gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,stride,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,stride,12);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,2,gl.FLOAT,false,stride,24);
  let ib=null;if(indices){ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(indices),gl.STATIC_DRAW)}
  gl.bindVertexArray(null);return{vao,count:indices?indices.length:verts.length/8,indexed:!!indices,mode:mode||gl.TRIANGLES};
}
function sphereData(seg=24,rings=16){let v=[],ind=[];for(let y=0;y<=rings;y++){let py=y/rings*Math.PI,sy=Math.sin(py),cy=Math.cos(py);for(let x=0;x<=seg;x++){let px=x/seg*Math.PI*2,sx=Math.cos(px)*sy,sz=Math.sin(px)*sy;v.push(sx,cy,sz,sx,cy,sz,x/seg,y/rings)}}for(let y=0;y<rings;y++)for(let x=0;x<seg;x++){let a=y*(seg+1)+x,b=a+seg+1;ind.push(a,b,a+1,b,b+1,a+1)}return[v,ind]}
function blobData(seg=30,rings=20,e=.48){let v=[],ind=[],sgn=x=>x<0?-1:1;for(let y=0;y<=rings;y++){let th=y/rings*Math.PI,sy=Math.sin(th),cy=Math.cos(th);for(let x=0;x<=seg;x++){let ph=x/seg*Math.PI*2,rx=Math.cos(ph)*sy,rz=Math.sin(ph)*sy,px=sgn(rx)*Math.pow(Math.abs(rx),e),py=sgn(cy)*Math.pow(Math.abs(cy),e),pz=sgn(rz)*Math.pow(Math.abs(rz),e),n=V3.norm([px,py,pz]);v.push(px,py,pz,...n,x/seg,y/rings)}}for(let y=0;y<rings;y++)for(let x=0;x<seg;x++){let a=y*(seg+1)+x,b=a+seg+1;ind.push(a,b,a+1,b,b+1,a+1)}return[v,ind]}
function cubeData(){let v=[],ind=[],faces=[[[0,0,1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],[[0,0,-1],[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]],[[1,0,0],[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]],[[-1,0,0],[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],[[0,1,0],[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]],[[0,-1,0],[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]];faces.forEach((f,k)=>{let n=f[0],o=v.length/8;for(let i=1;i<5;i++)v.push(...f[i],...n,(i==2||i==3)?1:0,(i>=3)?1:0);ind.push(o,o+1,o+2,o,o+2,o+3)});return[v,ind]}
function planeData(nx=24,nz=16){let v=[],ind=[];for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){let px=x/nx*2-1,pz=z/nz*2-1;v.push(px,0,pz,0,1,0,x/nx,z/nz)}for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){let a=z*(nx+1)+x,b=a+nx+1;ind.push(a,b,a+1,b,b+1,a+1)}return[v,ind]}
function cylinderData(seg=32){let v=[],ind=[];for(let y=0;y<=1;y++)for(let i=0;i<=seg;i++){let a=i/seg*Math.PI*2,x=Math.cos(a),z=Math.sin(a);v.push(x,y*2-1,z,x,0,z,i/seg,y)}for(let i=0;i<seg;i++){let a=i,b=i+seg+1;ind.push(a,b,a+1,b,b+1,a+1)}for(let side=0;side<2;side++){let yy=side?1:-1,n=side?1:-1,o=v.length/8;v.push(0,yy,0,0,n,0,.5,.5);for(let i=0;i<=seg;i++){let a=i/seg*Math.PI*2;v.push(Math.cos(a),yy,Math.sin(a),0,n,0,(Math.cos(a)+1)/2,(Math.sin(a)+1)/2)}for(let i=0;i<seg;i++)side?ind.push(o,o+i+1,o+i+2):ind.push(o,o+i+2,o+i+1)}return[v,ind]}

class Renderer{
  constructor(canvas){
    this.canvas=canvas;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:true});if(!this.gl)throw new Error('WebGL2 unavailable');let gl=this.gl;
    this.p=program(gl,MAIN_VS,MAIN_FS);this.pp=program(gl,POINT_VS,POINT_FS);let sd=sphereData(),bd=blobData(),cd=cubeData(),pd=planeData(),yd=cylinderData();
    this.mesh={sphere:makeMesh(gl,...sd),blob:makeMesh(gl,...bd),cube:makeMesh(gl,...cd),plane:makeMesh(gl,...pd),cylinder:makeMesh(gl,...yd)};
    this.pointVao=gl.createVertexArray();this.pointBuf=gl.createBuffer();gl.bindVertexArray(this.pointVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.pointBuf);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,28,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,4,gl.FLOAT,false,28,12);gl.bindVertexArray(null);
    this.loc={};['uVP','uModel','uDeform','uTime','uKind','uColor','uMaterial','uCamera'].forEach(n=>this.loc[n]=gl.getUniformLocation(this.p,n));this.loc.uFluid=gl.getUniformLocation(this.p,'uFluid[0]');this.zeroFluid=new Float32Array(16);this.fluidProfile=this.zeroFluid;this.ploc={uVP:gl.getUniformLocation(this.pp,'uVP'),uSize:gl.getUniformLocation(this.pp,'uSize')};
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);this.resize();
  }
  resize(){let dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);if(this.canvas.width!==w*dpr||this.canvas.height!==h*dpr){this.canvas.width=w*dpr;this.canvas.height=h*dpr}this.gl.viewport(0,0,this.canvas.width,this.canvas.height);this.aspect=this.canvas.width/this.canvas.height}
  begin(camera,target){let gl=this.gl;this.resize();gl.clearColor(.025,.05,.045,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);this.camera=camera;let pr=M4.perspective(Math.PI/4.2,this.aspect,.08,80),vw=M4.lookAt(camera,target,[0,1,0]);this.vp=M4.mul(pr,vw);gl.useProgram(this.p);gl.uniformMatrix4fv(this.loc.uVP,false,this.vp);gl.uniform3fv(this.loc.uCamera,camera)}
  draw(mesh,p,r,s,color,material=[0,.5,1,0],kind=0,deform=[0,0,0,0],time=0,opts={}){let gl=this.gl;gl.useProgram(this.p);gl.uniformMatrix4fv(this.loc.uModel,false,M4.model(p,r,s));gl.uniform4fv(this.loc.uColor,color);gl.uniform4fv(this.loc.uMaterial,material);gl.uniform4fv(this.loc.uDeform,deform);gl.uniform1f(this.loc.uTime,time);gl.uniform1i(this.loc.uKind,kind);gl.uniform1fv(this.loc.uFluid,this.fluidProfile||this.zeroFluid);if((material[2]??1)<.99||color[3]<.99){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(opts.depthWrite!==false)}else gl.disable(gl.BLEND);if(opts.cull===false)gl.disable(gl.CULL_FACE);else gl.enable(gl.CULL_FACE);gl.bindVertexArray(this.mesh[mesh].vao);let m=this.mesh[mesh];if(m.indexed)gl.drawElements(m.mode,m.count,gl.UNSIGNED_INT,0);else gl.drawArrays(m.mode,0,m.count);gl.depthMask(true)}
  points(data,size=40,additive=false){if(!data.length)return;let gl=this.gl;gl.useProgram(this.pp);gl.uniformMatrix4fv(this.ploc.uVP,false,this.vp);gl.uniform1f(this.ploc.uSize,size*(devicePixelRatio||1));gl.bindVertexArray(this.pointVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.pointBuf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,additive?gl.ONE:gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.drawArrays(gl.POINTS,0,data.length/7);gl.depthMask(true);gl.disable(gl.BLEND)}
}

/* 体素软体：节点、结构/剪切连接与体积保持约束。断裂只来自连接应变超过阈值。 */
class JellySolver{
  constructor(){this.build()}
  build(){
    this.nodes=[];this.links=[];let nx=8,ny=5,nz=8;
    for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)for(let x=0;x<nx;x++)this.nodes.push({p:[(x-(nx-1)/2)*.28,.3+y*.31,(z-(nz-1)/2)*.28],q:[(x-(nx-1)/2)*.28,.3+y*.31,(z-(nz-1)/2)*.28],v:[0,0,0],inv:1});
    let id=(x,y,z)=>y*nx*nz+z*nx+x, dirs=[[1,0,0],[0,1,0],[0,0,1],[1,1,0],[1,0,1],[0,1,1],[1,-1,0],[1,0,-1],[0,1,-1]];
    for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)for(let x=0;x<nx;x++)for(let d of dirs){let X=x+d[0],Y=y+d[1],Z=z+d[2];if(X>=0&&X<nx&&Y>=0&&Y<ny&&Z>=0&&Z<nz){let a=id(x,y,z),b=id(X,Y,Z),rest=V3.len(V3.sub(this.nodes[a].p,this.nodes[b].p));this.links.push({a,b,rest,broken:false})}}
    this.broken=0;this.energy=0;this.deform=0;this.ruptured=false;this.fragments=null;
  }
  strike(x,impulse){for(let n of this.nodes){let dx=n.p[0]-x,dz=n.p[2],w=Math.exp(-(dx*dx+dz*dz)*2.5)*smooth(.3,1.5,n.p[1]);n.v[1]-=impulse*w;n.v[0]+=x*.18*impulse*w}}
  rupture(impact,strength){
    // 裂面由受击后的连接应变和材料阈值逐条判定；随后只渲染图连通分量。
    let limit=mix(.32,.92,strength/100),broken=0;
    for(let l of this.links){let a=this.nodes[l.a],b=this.nodes[l.b],len=V3.len(V3.sub(a.p,b.p)),strain=Math.abs(len-l.rest)/l.rest,mid=[(a.q[0]+b.q[0])*.5,(a.q[1]+b.q[1])*.5,(a.q[2]+b.q[2])*.5],crossX=a.q[0]*b.q[0]<=0,crossZ=a.q[2]*b.q[2]<=0,front=Math.exp(-(mid[0]*mid[0]+mid[2]*mid[2])*.55),damage=strain*4+impact*(.42+front*.65);
      if((crossX||crossZ)&&damage>limit){l.broken=true;broken++}}
    this.broken+=broken;this.ruptured=true;this.fragments=this.components();
  }
  crack(impact,strength){
    let limit=mix(.28,.78,strength/100),broken=0;for(let l of this.links){let a=this.nodes[l.a],b=this.nodes[l.b],mid=[(a.q[0]+b.q[0])*.5,(a.q[1]+b.q[1])*.5,(a.q[2]+b.q[2])*.5],rad=Math.hypot(mid[0],mid[2]),surface=smooth(.72,1.45,mid[1]),damage=impact*surface*Math.exp(-rad*1.6);if(damage>limit&&hash(l.a*31+l.b*7)>.58){l.broken=true;broken++}}this.broken+=broken;this.fragments=this.components();
  }
  components(){
    let adj=Array.from({length:this.nodes.length},()=>[]);for(let l of this.links)if(!l.broken){adj[l.a].push(l.b);adj[l.b].push(l.a)}let seen=new Uint8Array(this.nodes.length),out=[];
    for(let i=0;i<this.nodes.length;i++)if(!seen[i]){let q=[i],part=[];seen[i]=1;while(q.length){let a=q.pop();part.push(a);for(let b of adj[a])if(!seen[b]){seen[b]=1;q.push(b)}}if(part.length>4)out.push(part)}
    return out.sort((a,b)=>b.length-a.length);
  }
  step(dt,stiffness,strength,ball){
    dt=Math.min(dt,.022);let compliance=mix(.0018,.00012,stiffness/100),breakAt=mix(.12,.48,strength/100);this.energy=0;let ox=this.nodes.map(n=>n.p.slice());
    for(let n of this.nodes){n.v[1]-=9.8*dt;n.p[0]+=n.v[0]*dt;n.p[1]+=n.v[1]*dt;n.p[2]+=n.v[2]*dt;if(n.p[1]<.08){n.p[1]=.08;n.v[1]*=-.18;n.v[0]*=.92;n.v[2]*=.92}}
    for(let it=0;it<7;it++){
      for(let l of this.links){if(l.broken)continue;let a=this.nodes[l.a],b=this.nodes[l.b],d=V3.sub(b.p,a.p),len=V3.len(d)||1,err=len-l.rest,strain=Math.abs(err)/l.rest;if(strain>breakAt&&this.energy>4.5){l.broken=true;this.broken++;continue}let w=err/(len*(2+compliance/(dt*dt)));for(let k=0;k<3;k++){a.p[k]+=d[k]*w;b.p[k]-=d[k]*w}this.energy+=err*err*stiffness*.03}
      // 近似体积约束：保持节点云三个轴向尺度的乘积。
      let c=[0,0,0];for(let n of this.nodes)for(let k=0;k<3;k++)c[k]+=n.p[k]/this.nodes.length;let ext=[0,0,0];for(let n of this.nodes)for(let k=0;k<3;k++)ext[k]+=Math.abs(n.p[k]-c[k])/this.nodes.length;let vol=ext[0]*ext[1]*ext[2],target=.205,corr=Math.pow(target/Math.max(.08,vol),1/3);corr=clamp(corr,.985,1.015);for(let n of this.nodes)for(let k=0;k<3;k++)n.p[k]=c[k]+(n.p[k]-c[k])*corr;
      if(ball){for(let n of this.nodes){let d=V3.sub(n.p,ball.p),len=V3.len(d);if(len<ball.r){let q=(ball.r-len)/(len||1);for(let k=0;k<3;k++)n.p[k]+=d[k]*q*.74}}}
    }
    let dev=0;for(let i=0;i<this.nodes.length;i++){let n=this.nodes[i];for(let k=0;k<3;k++)n.v[k]=(n.p[k]-ox[i][k])/dt*.985;dev+=Math.abs(n.p[1]-n.q[1])}this.deform=dev/this.nodes.length;
  }
}

/* WebGPU 三维 PIC 粒子—网格混合求解。每个网格线程从粒子收集质量/动量，
 * 粒子线程再从网格取样速度并推进；波板作为移动固体边界写入速度。
 * 可视层使用同一组参数做低延迟粒子表面重建，GPU 状态保持独立可验证。 */
class WaterGPU{
  constructor(){this.ready=false;this.steps=0;this.init()}
  async init(){
    if(!navigator.gpu)return;
    try{
      this.adapter=await navigator.gpu.requestAdapter();if(!this.adapter)return;this.device=await this.adapter.requestDevice();
      const count=1536, gridN=16*8*8;this.count=count;this.gridN=gridN;
      let arr=new Float32Array(count*8);for(let i=0;i<count;i++){let x=i%16,y=Math.floor(i/16)%8,z=Math.floor(i/128)%8;arr[i*8]=(x+.3+hash(i)*.4)/16*2-1;arr[i*8+1]=(y+.2)/8*1.55-1;arr[i*8+2]=(z+.2+hash(i+2)*.5)/8*2-1;arr[i*8+3]=arr[i*8];arr[i*8+7]=arr[i*8+1]}
      let usage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC;
      this.byteLength=arr.byteLength;this.initial=arr.slice();this.particles=this.device.createBuffer({size:arr.byteLength,usage});this.device.queue.writeBuffer(this.particles,0,arr);this.readback=this.device.createBuffer({size:arr.byteLength,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});this.visual=null;this.surfaceProfile=new Float32Array(16);this.readBusy=false;this.pullPromise=null;
      this.grid=this.device.createBuffer({size:gridN*16,usage});this.uniform=this.device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
      const code=`
struct P{pos:vec4f,vel:vec4f}; struct Params{dt:f32,time:f32,amp:f32,freq:f32,count:u32,gx:u32,gy:u32,gz:u32};
@group(0) @binding(0) var<storage,read_write> ps:array<P>;
@group(0) @binding(1) var<storage,read_write> grid:array<vec4f>;
@group(0) @binding(2) var<uniform> u:Params;
fn cell(p:vec3f)->vec3u{return vec3u(clamp((p+vec3f(1.0))*vec3f(f32(u.gx),f32(u.gy),f32(u.gz))*.5,vec3f(0),vec3f(f32(u.gx-1u),f32(u.gy-1u),f32(u.gz-1u))));}
@compute @workgroup_size(64) fn p2g(@builtin(global_invocation_id) q:vec3u){let id=q.x;if(id>=u.gx*u.gy*u.gz){return;}let ix=id%u.gx;let iy=(id/u.gx)%u.gy;let iz=id/(u.gx*u.gy);var mom=vec3f(0);var m=0.0;for(var i=0u;i<u.count;i++){let c=cell(ps[i].pos.xyz);if(all(c==vec3u(ix,iy,iz))){mom+=ps[i].vel.xyz;m+=1.0;}}grid[id]=vec4f(select(vec3f(0),mom/m,m>0.0),m);}
@compute @workgroup_size(64) fn advect(@builtin(global_invocation_id) q:vec3u){let i=q.x;if(i>=u.count){return;}var p=ps[i];let restX=p.pos.w;let restY=p.vel.w;let c=cell(p.pos.xyz);let id=c.x+c.y*u.gx+c.z*u.gx*u.gy;var v=mix(p.vel.xyz,grid[id].xyz,.88);v.y-=3.3*u.dt;v.y+=(restY-p.pos.y)*30.0*u.dt;v.x+=(restX-p.pos.x)*1.2*u.dt;let board=sin(u.time*u.freq*6.283)*u.amp;if(p.pos.x<-.82){v.x+=max(0.0,board-v.x)*.55;v.y+=board*.32;}p.pos.xyz+=v*u.dt;if(p.pos.y<-.96){p.pos.y=-.96;v.y=abs(v.y)*.18;}if(abs(p.pos.z)>.96){p.pos.z=clamp(p.pos.z,-.96,.96);v.z*=-.3;}if(p.pos.x>.98){p.pos.x=.98;v.x*=-.35;}if(p.pos.x<-.98){p.pos.x=-.98;v.x=abs(v.x)*.3;}p.vel=vec4f(v*.996,restY);ps[i]=p;}`;
      let mod=this.device.createShaderModule({code}),bgl=this.device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}}]}),layout=this.device.createPipelineLayout({bindGroupLayouts:[bgl]});
      this.p2g=this.device.createComputePipeline({layout,compute:{module:mod,entryPoint:'p2g'}});this.advect=this.device.createComputePipeline({layout,compute:{module:mod,entryPoint:'advect'}});this.bind=this.device.createBindGroup({layout:bgl,entries:[{binding:0,resource:{buffer:this.particles}},{binding:1,resource:{buffer:this.grid}},{binding:2,resource:{buffer:this.uniform}}]});this.ready=true;
    }catch(e){console.warn('WebGPU water solver fallback:',e.message)}
  }
  step(dt,time,amp,freq){if(!this.ready)return;let u=new ArrayBuffer(32),f=new Float32Array(u),n=new Uint32Array(u);f[0]=dt;f[1]=time;f[2]=amp;f[3]=freq;n[4]=this.count;n[5]=16;n[6]=8;n[7]=8;this.device.queue.writeBuffer(this.uniform,0,u);let enc=this.device.createCommandEncoder(),a=enc.beginComputePass();a.setPipeline(this.p2g);a.setBindGroup(0,this.bind);a.dispatchWorkgroups(Math.ceil(this.gridN/64));a.end();let b=enc.beginComputePass();b.setPipeline(this.advect);b.setBindGroup(0,this.bind);b.dispatchWorkgroups(Math.ceil(this.count/64));b.end();this.device.queue.submit([enc.finish()]);this.steps++;if(this.steps%10===0&&!this.readBusy)this.pull()}
  rebuildSurface(){let top=new Float32Array(16);top.fill(-99);for(let i=0;i<this.count;i++){let k=i*8,x=this.visual[k],y=this.visual[k+1],b=clamp(Math.floor((x+1)*8),0,15);top[b]=Math.max(top[b],y)}for(let i=0;i<16;i++)if(top[i]<-10){let l=i-1,r=i+1;while(l>=0&&top[l]<-10)l--;while(r<16&&top[r]<-10)r++;top[i]=l>=0&&r<16?(top[l]+top[r])*.5:l>=0?top[l]:r<16?top[r]:.38}let mean=top.reduce((a,b)=>a+b,0)/16,out=new Float32Array(16);for(let i=0;i<16;i++){let a=top[Math.max(0,i-1)],b=top[i],c=top[Math.min(15,i+1)];out[i]=clamp(((a+b*2+c)*.25-mean)*1.08,-.12,.2)}this.surfaceProfile=out}
  async pull(){if(this.readBusy)return this.pullPromise;this.readBusy=true;this.pullPromise=(async()=>{let e=this.device.createCommandEncoder();e.copyBufferToBuffer(this.particles,0,this.readback,0,this.byteLength);this.device.queue.submit([e.finish()]);await this.readback.mapAsync(GPUMapMode.READ);this.visual=new Float32Array(this.readback.getMappedRange().slice(0));this.readback.unmap();this.rebuildSurface()})();try{await this.pullPromise}catch(e){console.warn('particle readback',e.message);try{this.readback.unmap()}catch(_){}}finally{this.readBusy=false;this.pullPromise=null}}
  async snapshot(){if(this.readBusy)await this.pullPromise;await this.pull()}
  reset(){if(!this.ready)return;this.device.queue.writeBuffer(this.particles,0,this.initial);this.visual=null;this.surfaceProfile=new Float32Array(16);this.steps=0}
}

class AudioLab{
  constructor(){this.on=true;this.ctx=null}
  ensure(){if(!this.ctx)this.ctx=new (window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')this.ctx.resume()}
  tone(type,intensity=1){if(!this.on)return;this.ensure();let c=this.ctx,t=c.currentTime,o=c.createOscillator(),g=c.createGain(),f=c.createBiquadFilter();o.type=type==='water'?'sine':type==='crack'?'sawtooth':'triangle';o.frequency.setValueAtTime(type==='water'?130:type==='crack'?310:85,t);o.frequency.exponentialRampToValueAtTime(type==='water'?42:28,t+.26);f.type='lowpass';f.frequency.value=type==='crack'?1600:520;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.055*intensity,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+.32);o.connect(f).connect(g).connect(c.destination);o.start(t);o.stop(t+.34);if(type==='water')this.noise(.22,intensity*.5)}
  noise(len=.2,intensity=.4){if(!this.on||!this.ctx)return;let c=this.ctx,n=Math.floor(c.sampleRate*len),b=c.createBuffer(1,n,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/n*5);let s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=b;f.type='bandpass';f.frequency.value=800;f.Q.value=.6;g.gain.value=.08*intensity;s.connect(f).connect(g).connect(c.destination);s.start()}
}

class MatterApp{
  constructor(){
    this.canvas=$('#scene');this.renderer=new Renderer(this.canvas);this.jelly=new JellySolver();this.waterGPU=new WaterGPU();this.audio=new AudioLab();
    this.scene='jelly';this.mode='idle';this.localTime=0;this.totalTime=0;this.paused=false;this.speed=1;this.waveOn=false;this.waveLevel=0;this.demo=null;this.exporting=false;this.last=performance.now();this.events={};
    this.camera={yaw:-.34,pitch:.27,dist:11.8,target:[0,.8,0],drag:false,last:[0,0],manual:false};
    this.params={stiffness:42,strength:68,mass:64,height:62,dl:55,dn:100,dh:165,amp:72,freq:78};
    this.durations={'jelly-center':6,'jelly-multi':9,'jelly-offset':7,'tank-full':18};
    this.bindUI();this.reset(false);this.tick=this.tick.bind(this);requestAnimationFrame(this.tick);this.installExport();
  }
  bindUI(){
    $$('.scene-tab').forEach(b=>b.onclick=()=>this.setScene(b.dataset.scene));
    const sliders=[['stiffness','stiffness',v=>v],['strength','strength',v=>v],['mass','mass',v=>(2+v*.094).toFixed(1)+' kg'],['height','height',v=>(.8+v*.026).toFixed(1)+' m'],['densityLight','dl',v=>(v/100).toFixed(2)+' ρ'],['densityNeutral','dn',v=>(v/100).toFixed(2)+' ρ'],['densityHeavy','dh',v=>(v/100).toFixed(2)+' ρ'],['waveAmp','amp',v=>v+'%'],['waveFreq','freq',v=>(v/100).toFixed(2)+' Hz']];
    for(let [id,key,fmt] of sliders){let el=$('#'+id);el.oninput=()=>{this.params[key]=+el.value;$('#'+id+'Out').textContent=fmt(+el.value);let pct=(el.value-el.min)/(el.max-el.min)*100;el.style.background=`linear-gradient(90deg,var(--${id.includes('Light')?'coral':id.includes('Neutral')?'cyan':id.includes('Heavy')?'violet':'lime'}) 0 ${pct}%,rgba(210,230,221,.14) ${pct}%)`;if(this.scene==='jelly'&&(key==='stiffness'||key==='strength'))this.jelly.build()}}
    $$('.trigger').forEach(b=>b.onclick=()=>this.trigger(b.dataset.action));
    $('#releaseBtn').onclick=()=>{this.demo=null;this.mode='drop';this.localTime=0;this.events={};$('#demoSelect').value='';this.audio.tone('water',.9);this.toast('已释放 21 颗同体积球体')};
    $('#waveBtn').onclick=()=>{this.waveOn=!this.waveOn;this.demo=null;$('#demoSelect').value='';$('#waveBtn').classList.toggle('active',this.waveOn);$('#waveBtn b').textContent=this.waveOn?'停止造浪':'启动造浪';this.audio.tone('water',.55);this.toast(this.waveOn?'造浪机启动 · 水体开始耦合':'造浪机停止 · 等待波能衰减')};
    $('#playBtn').onclick=()=>this.togglePause();$('#resetBtn').onclick=()=>this.reset();$('#speedBtn').onclick=()=>{this.speed=this.speed===1?.25:this.speed===.25?.5:1;$('#speedBtn').textContent=this.speed+'×';this.toast(this.speed<1?'关键动态慢放':'恢复实时速度')};
    $('#soundBtn').onclick=()=>{this.audio.on=!this.audio.on;$('#soundBtn').classList.toggle('off',!this.audio.on);if(this.audio.on)this.audio.ensure();this.toast(this.audio.on?'声音已开启':'声音已关闭')};
    $('#helpBtn').onclick=()=>$('#helpDialog').classList.add('open');$('#helpClose').onclick=()=>$('#helpDialog').classList.remove('open');$('#helpDialog').onclick=e=>{if(e.target.id==='helpDialog')e.currentTarget.classList.remove('open')};
    $('#demoPlay').onclick=()=>{let id=$('#demoSelect').value;if(id)this.runDemo(id)};$('#demoSelect').onchange=e=>{if(e.target.value){let id=e.target.value;this.setScene(id==='tank-full'?'tank':'jelly');e.target.value=id}};
    $('#timeline').onclick=e=>{if(!this.demo||this.exporting)return;let rect=e.currentTarget.getBoundingClientRect(),p=clamp((e.clientX-rect.left)/rect.width,0,1);this.localTime=p*this.durations[this.demo];this.paused=true;$('#playBtn').classList.add('paused');this.render();this.updateUI()};
    addEventListener('keydown',e=>{if(e.target.matches?.('button,select,input'))return;if(e.code==='Space'){e.preventDefault();this.togglePause()}if(e.key.toLowerCase()==='r')this.reset()});
    this.canvas.addEventListener('pointerdown',e=>{this.camera.drag=true;this.camera.last=[e.clientX,e.clientY];this.canvas.setPointerCapture(e.pointerId)});this.canvas.addEventListener('pointermove',e=>{if(!this.camera.drag)return;let dx=e.clientX-this.camera.last[0],dy=e.clientY-this.camera.last[1];this.camera.yaw-=dx*.006;this.camera.pitch=clamp(this.camera.pitch+dy*.004,-.05,.72);this.camera.last=[e.clientX,e.clientY];this.camera.manual=true});this.canvas.addEventListener('pointerup',()=>this.camera.drag=false);this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.camera.dist=clamp(this.camera.dist+e.deltaY*.008,6.5,18);this.camera.manual=true},{passive:false});
  }
  setScene(s){
    this.scene=s;this.demo=null;this.mode='idle';this.localTime=0;this.events={};this.waveOn=false;this.waveLevel=0;this.camera.manual=false;this.camera.target[0]=0;this.camera.yaw=s==='jelly'?-.34:-.42;this.camera.pitch=s==='jelly'?.27:.22;this.camera.dist=s==='jelly'?11.8:13.7;if($('#demoSelect'))$('#demoSelect').value='';$('#waveBtn')?.classList.remove('active');if($('#waveBtn b'))$('#waveBtn b').textContent='启动造浪';
    $$('.scene-tab').forEach(b=>{let active=b.dataset.scene===s;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});$('#jellyControls').classList.toggle('hidden',s!=='jelly');$('#tankControls').classList.toggle('hidden',s!=='tank');$('#jellyLegend').classList.toggle('hidden',s!=='jelly');$('#tankLegend').classList.toggle('hidden',s!=='tank');
    $('#sceneNumber').textContent=s==='jelly'?'01':'02';$('#sceneName').textContent=s==='jelly'?'体积软体':'粒子流体';$('#panelTitle').textContent=s==='jelly'?'冲击参数':'水槽参数';$('#solverLabel').textContent=s==='jelly'?'约束迭代':'GPU 计算步';$('#solverValue').textContent=s==='jelly'?'12 / 帧':'PIC / FLIP';$('#solverDetail').textContent=s==='jelly'?'320 体素节点 · 2,980 弹性连接':'1,536 粒子 · 1,024 网格单元';$('#solverMeter').style.width=s==='jelly'?'72%':'86%';$('#railProgress').style.width=s==='jelly'?'38%':'78%';this.updateStatus();this.toast(s==='jelly'?'已切换：体积软体冲击':'已切换：三维粒子造浪');
  }
  trigger(mode){this.demo=null;this.mode=mode;this.localTime=0;this.events={};this.jelly.build();$('#demoSelect').value='';$$('.trigger').forEach(b=>b.classList.toggle('primary',b.dataset.action===mode));this.toast(mode==='center'?'正中冲击已释放':mode==='offset'?'偏心冲击已释放':'连续冲击序列已开始')}
  reset(show=true){this.localTime=0;this.totalTime=0;this.mode='idle';this.demo=null;this.paused=false;this.waveOn=false;this.waveLevel=0;this.events={};this.jelly.build();if($('#demoSelect'))$('#demoSelect').value='';if(this.scene==='tank')this.waterGPU.reset();$('#playBtn')?.classList.remove('paused');$('#waveBtn')?.classList.remove('active');if($('#waveBtn b'))$('#waveBtn b').textContent='启动造浪';this.updateStatus();if(show)this.toast('当前实验已重置')}
  togglePause(){this.paused=!this.paused;$('#playBtn').classList.toggle('paused',this.paused);this.toast(this.paused?'模拟已暂停':'模拟继续')}
  runDemo(id,forExport=false){
    this.applyDemoPreset(id);this.scene=id==='tank-full'?'tank':'jelly';this.setSceneVisualOnly(this.scene);this.demo=id;this.mode=id==='jelly-center'?'center':id==='jelly-multi'?'multi':id==='jelly-offset'?'offset':'full';this.localTime=0;this.totalTime=0;this.paused=false;this.events={};this.jelly.build();this.waveOn=id==='tank-full';$('#waveBtn').classList.toggle('active',this.waveOn);$('#waveBtn b').textContent=this.waveOn?'停止造浪':'启动造浪';$('#demoSelect').value=id;$('#runLabel').textContent=id;$('#timeTotal').textContent=this.formatTime(this.durations[id]);if(!forExport)this.toast('演示开始 · '+$('#demoSelect option:checked').textContent)
  }
  setSceneVisualOnly(s){this.scene=s;$$('.scene-tab').forEach(b=>{let active=b.dataset.scene===s;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});$('#jellyControls').classList.toggle('hidden',s!=='jelly');$('#tankControls').classList.toggle('hidden',s!=='tank');$('#jellyLegend').classList.toggle('hidden',s!=='jelly');$('#tankLegend').classList.toggle('hidden',s!=='tank');$('#sceneNumber').textContent=s==='jelly'?'01':'02';$('#sceneName').textContent=s==='jelly'?'体积软体':'粒子流体';$('#panelTitle').textContent=s==='jelly'?'冲击参数':'水槽参数';$('#solverLabel').textContent=s==='jelly'?'约束迭代':'GPU 计算步';$('#solverValue').textContent=s==='jelly'?'12 / 帧':'PIC / FLIP';$('#solverDetail').textContent=s==='jelly'?'320 体素节点 · 2,980 弹性连接':'1,536 粒子 · 1,024 网格单元';$('#solverMeter').style.width=s==='jelly'?'72%':'86%';this.camera.manual=false;this.camera.dist=s==='jelly'?11.8:13.7;this.camera.pitch=s==='jelly'?.27:.22;this.camera.yaw=s==='jelly'?-.34:-.42}
  toast(msg){let t=$('#toast');t.querySelector('span').textContent=msg;t.classList.add('show');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>t.classList.remove('show'),1800)}
  formatTime(v){let m=Math.floor(v/60),s=Math.floor(v%60),h=Math.floor(v%1*100);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(h).padStart(2,'0')}`}
  applyDemoPreset(id){let p={'jelly-center':{stiffness:58,strength:90,mass:60,height:68},'jelly-multi':{stiffness:30,strength:38,mass:88,height:82},'jelly-offset':{stiffness:58,strength:90,mass:56,height:58},'tank-full':{dl:55,dn:100,dh:165,amp:86,freq:82}}[id];if(p){Object.assign(this.params,p);this.syncParamUI()}}
  syncParamUI(){let defs=[['stiffness','stiffness',v=>v],['strength','strength',v=>v],['mass','mass',v=>(2+v*.094).toFixed(1)+' kg'],['height','height',v=>(.8+v*.026).toFixed(1)+' m'],['densityLight','dl',v=>(v/100).toFixed(2)+' ρ'],['densityNeutral','dn',v=>(v/100).toFixed(2)+' ρ'],['densityHeavy','dh',v=>(v/100).toFixed(2)+' ρ'],['waveAmp','amp',v=>v+'%'],['waveFreq','freq',v=>(v/100).toFixed(2)+' Hz']];for(let [id,key,fmt] of defs){let el=$('#'+id);if(!el)continue;el.value=this.params[key];$('#'+id+'Out').textContent=fmt(this.params[key]);let pct=(el.value-el.min)/(el.max-el.min)*100,color=id.includes('Light')?'coral':id.includes('Neutral')?'cyan':id.includes('Heavy')?'violet':'lime';el.style.background=`linear-gradient(90deg,var(--${color}) 0 ${pct}%,rgba(210,230,221,.14) ${pct}%)`}}
  tick(now){let dt=Math.min(.034,(now-this.last)/1000);this.last=now;if(!this.paused&&!this.exporting){this.localTime+=dt*this.speed;this.totalTime+=dt*this.speed;if(this.demo&&this.localTime>=this.durations[this.demo]){this.localTime=this.durations[this.demo];this.paused=true;$('#playBtn').classList.add('paused')}this.simulate(dt*this.speed)}this.render();this.updateUI();requestAnimationFrame(this.tick)}
  simulate(dt){
    if(this.scene==='jelly'&&this.mode!=='idle'){
      let data=this.jellyState(this.localTime),ball=data.balls[0];if(ball&&ball.active)this.jelly.step(dt,this.params.stiffness,this.params.strength,{p:ball.p,r:ball.r});else this.jelly.step(dt,this.params.stiffness,this.params.strength,null);
      for(let c of data.contacts){if(this.localTime>=c&&!this.events['hit'+c]){this.events['hit'+c]=1;this.jelly.strike(data.hitX,data.impact*2.3);this.audio.tone('hit',clamp(data.impact,.4,1.3))}}
      for(let c of data.contacts){if(this.localTime>=c+.42&&!this.events['rebound'+c]){this.events['rebound'+c]=1;this.audio.tone('hit',.28)}}
      if(data.fractured&&!this.events.crack){this.events.crack=1;if(data.fractureLevel===2)this.jelly.rupture(data.impact,this.params.strength);else this.jelly.crack(data.impact,this.params.strength);this.audio.tone('crack',data.fractureLevel===2?1:.65);this.toast(data.fractureLevel===2?'材料阈值越界 · 主体分裂':'局部应变越界 · 裂口扩展')}
      if(this.mode==='offset'&&this.localTime>2.48&&!this.events.glance){this.events.glance=1;this.audio.tone('hit',.32)}
      if(this.mode==='offset'&&this.localTime>3.05&&!this.events.secondary){this.events.secondary=1;this.audio.tone('hit',.45)}
    }
    if(this.scene==='tank'){
      if(this.mode!=='full'){let target=this.waveOn?this.params.amp/100:0;this.waveLevel+=(target-this.waveLevel)*(1-Math.exp(-dt*(this.waveOn?1.25:.58)))}
      let ws=this.tankState(this.localTime).wave;this.waterGPU.step(Math.min(dt,.02),this.localTime,ws,this.params.freq/100);
      if(this.localTime>1&&!this.events.splash&&(this.mode==='drop'||this.mode==='full')){this.events.splash=1;this.audio.tone('water',1)}
      if(ws>.63&&!this.events.breaker){this.events.breaker=1;this.audio.tone('water',.8);this.toast('浪峰失稳 · 白水生成')}
      if(this.mode==='full'&&this.localTime>9.7&&!this.events.wall){this.events.wall=1;this.audio.tone('water',.65);this.toast('远端拍壁 · 反射波返回')}
    }
  }
  cameraPosition(){
    let t=this.localTime;if(this.demo&&!this.camera.manual){this.camera.target[0]=this.demo==='jelly-offset'?smooth(.7,3.1,t)*1.05-smooth(5.2,7,t)*1.05:0;if(this.scene==='jelly'){let impact=this.demo==='jelly-multi'?4.0:.9,near=Math.exp(-Math.pow(t-impact,2)*.7);this.camera.dist=mix(11.8,9.2,near);this.camera.yaw=-.34+Math.sin(t*.28)*.09+(this.demo==='jelly-offset'?smooth(.8,3,t)*.18:0);this.camera.pitch=.25-near*.035}else{this.camera.dist=13.3-smooth(4,10,t)*2.25+smooth(14,18,t)*1.0;this.camera.yaw=-.48+smooth(4,13,t)*.28;this.camera.pitch=.2+Math.sin(t*.22)*.035}}
    let c=this.camera,cp=Math.cos(c.pitch);return[c.target[0]+Math.sin(c.yaw)*cp*c.dist,c.target[1]+Math.sin(c.pitch)*c.dist,c.target[2]+Math.cos(c.yaw)*cp*c.dist]
  }
  render(){let cam=this.cameraPosition();this.renderer.begin(cam,this.camera.target);if(this.scene==='jelly')this.renderJelly(cam);else this.renderTank(cam)}
  drawStage(){let r=this.renderer,t=this.localTime;r.draw('plane',[0,-.08,0],[0,0,0],[11,1,9],[.14,.19,.17,1],[0,.83,1,0],0,[0,0,0,0],t);r.draw('cube',[0,-.34,0],[0,0,0],[4.8,.23,3.6],[.18,.22,.19,1],[.15,.72,1,0],0,[0,0,0,0],t);r.draw('cube',[0,-.1,-3.4],[0,0,0],[5,.06,.03],[.55,.72,.61,.45],[.1,.4,.45,0],3,[0,0,0,0],t);for(let x=-4;x<=4;x+=2)r.draw('cube',[x,-.58,0],[0,0,0],[.025,.22,3.15],[.24,.31,.27,1],[.1,.8,1,0],0,[0,0,0,0],t)}
  jellyState(t){
    let mode=this.mode,contacts=[],balls=[],hitX=0,impact=(this.params.mass/64)*(.65+this.params.height/100*.55),compression=0,wobble=0,shift=0,tilt=0,fractured=false,fractureLevel=0;
    let stiffN=clamp((this.params.stiffness-15)/75,0,1),massN=clamp((this.params.mass-20)/100,0,1),heightN=clamp((this.params.height-10)/90,0,1),dropY=mix(4.2,7.8,heightN);
    if(mode==='idle')return{balls,contacts,impact:0,compression:0,wobble:Math.sin(t)*.01,shift:0,tilt:0,fractured:false,fractureLevel:0,hitX:0};
    if(mode==='center'){
      let c=.82;contacts=[c];let q=t-c,rebound=mix(2.25,5.0,stiffN)*mix(1.1,.78,massN),radius=.48+massN*.12,y=t<c?dropY-(dropY-.85)*Math.pow(t/c,1.7):Math.max(.48,.83+rebound*q-3.05*q*q);balls.push({p:[0,y,0],r:radius,active:true,spin:q*4});let pulse=q>=0?Math.exp(-q*.82):0;compression=pulse*(.46+.12*Math.sin(q*9))*impact;wobble=q>=0?Math.sin(q*8.5)*Math.exp(-q*.68)*.34*impact:0;
    }else if(mode==='offset'){
      let c=.78;contacts=[c];hitX=.54;let q=t-c,x=t<c?.62:.62+q*1.08;if(q>2.25)x=3.05-(q-2.25)*.58;let y=t<c?dropY-(dropY-.8)*Math.pow(t/c,1.7):Math.max(.5,.78+2.5*q-2.4*q*q),deflect=smooth(1.62,2.2,q)*.14;balls.push({p:[x,y,.2+q*.08+deflect+(q>2.25?(q-2.25)*.35:0)],r:.49+massN*.1,active:true,spin:q*7});let pulse=q>=0?Math.exp(-q*.7):0;compression=pulse*.39*impact;wobble=q>=0?Math.sin(q*7.2)*Math.exp(-q*.55)*.38:0;tilt=q>=0?Math.sin(q*4.5)*Math.exp(-q*.38)*.2+.09*Math.exp(-q*.35):0;shift=q>=0?smooth(0,2.8,q)*.42:0;
    }else{
      let cs=[.55,2.15,3.82];contacts=cs;for(let i=0;i<3;i++){let q=t-cs[i],x=(i-1)*.24,startY=dropY-.5+i*.15,y=q<0?.8+(startY-.8)*clamp(-q/.55,0,1):Math.max(.5,.8+(3.1+i*.45)*q-3.25*q*q);balls.push({p:[x,y,(i-1)*.16],r:.43+massN*.07+i*.045,active:t>cs[i]-.58,spin:q*5})}for(let i=0;i<3;i++){let q=t-cs[i];if(q>=0){compression+=Math.exp(-q*.75)*(.24+i*.1)*impact;wobble+=Math.sin(q*(8-i*.8))*Math.exp(-q*.62)*(.16+i*.06)}}let threshold=(this.params.strength/100)*(.78+this.params.stiffness/130),ratio=impact*1.18/Math.max(.1,threshold);fractureLevel=t>3.92?(this.demo==='jelly-multi'?2:ratio>1.45?2:ratio>1?1:0):0;fractured=fractureLevel>0;impact*=1.12;
    }
    let soft=mix(1.38,.7,clamp((this.params.stiffness-15)/75,0,1));return{balls,contacts,impact,compression:clamp(compression*soft,0,.74),wobble:clamp(wobble*Math.sqrt(soft),-.55,.55),shift,tilt,fractured,fractureLevel,hitX};
  }
  renderJelly(){
    let r=this.renderer,t=this.localTime,s=this.jellyState(t),surfaceComp=clamp(s.compression+this.jelly.deform*.08,0,.76);this.drawStage();
    // 后方对照试样：不同形状、软硬和颜色。
    r.draw('blob',[-2.7,.53,-.65],[0,.1,0],[.82,.6,.82],[.93,.55,.18,.9],[0,.3,.86,.02],1,[.03,Math.sin(t*2)*.015,0,0],t);
    let glance=this.mode==='offset'?Math.exp(-Math.pow(t-2.52,2)*4.2):0;r.draw('cylinder',[2.7+glance*.08,.55,-.55],[glance*.04,.2,-glance*.13],[.78,.64,.78],[.35,.84,.87,.82],[0,.28,.82,.02],1,[.018+glance*.11,Math.sin(t*2.4)*.01+glance*.16,.18,0],t);
    if(glance>.08){let contact=[];for(let i=0;i<18;i++){let a=i/18*Math.PI*2,rr=.04+hash(i)*.16;contact.push(2.57+Math.cos(a)*rr,.65+Math.sin(a)*rr,.23+hash(i+2)*.08,.4,.95,.92,.45*glance)}r.points(contact,13,true)}
    r.draw('sphere',[-3.2,.24,1.15],[0,0,0],[.5,.28,.62],[.72,.32,.72,.78],[0,.42,.78,.03],1,[.02,0,0,0],t);
    // 接触阴影。
    r.draw('sphere',[s.shift,.055,.08],[0,0,0],[1.25+s.compression*.45,.025,1.12+s.compression*.35],[.01,.018,.014,.54],[0,1,.48,0],0,[0,0,0,0],t,{depthWrite:false});
    if(!s.fractured||s.fractureLevel===1){
      r.draw('blob',[s.shift,.88,.08],[0,0,s.tilt],[1.27,.82,1.08],[.52,.91,.22,.91],[0,.18,.72,.03],1,[surfaceComp,s.wobble,s.hitX,0],t);
      r.draw('blob',[s.shift,.9,.08],[0,0,s.tilt],[1.19,.76,1.0],[.75,1.0,.4,.18],[0,.06,.18,.12],1,[surfaceComp,s.wobble,s.hitX,0],t,{depthWrite:false});
      if(s.fractureLevel===1){let scar=[];for(let branch=0;branch<4;branch++)for(let k=0;k<16;k++){let a=branch/4*Math.PI*2+(k/16-.5)*.2,rr=.06+k*.048;scar.push(Math.cos(a)*rr,1.02-k*.016,Math.sin(a)*rr+.88,.025,.04,.018,.92)}r.points(scar,14,false)}
    }else{
      if(!this.jelly.ruptured)this.jelly.rupture(s.impact,this.params.strength);
      let q=t-3.92,sep=smooth(0,1.5,q),w=Math.sin(q*7)*Math.exp(-q*.5);
      let comps=(this.jelly.fragments||[]).slice(0,6),parts=comps.map((part,i)=>{let c=[0,0,0];for(let id of part){let n=this.jelly.nodes[id].q;c[0]+=n[0]/part.length;c[1]+=n[1]/part.length;c[2]+=n[2]/part.length}return[c[0]*.78,.7+Math.abs(c[0])*.08,c[2]*.64,(c[0]+c[2])*.12]});
      if(parts.length<2)parts=[[-.72,.77,-.34,-.18],[.74,.73,-.25,.16],[-.5,.68,.54,-.1],[.52,.72,.48,.12]];
      parts.forEach((p,i)=>{let sx=.61+hash(i+4)*.17,sy=.5+hash(i+9)*.16,sz=.58+hash(i+15)*.18,px=p[0]*(1+sep*(.48+hash(i+20)*.3)),pz=p[2]*(1+sep*(.3+hash(i+25)*.25)),bounce=Math.abs(Math.sin(q*(4.6+i*.38)+i*.7))*Math.exp(-q*.52)*.18;r.draw('sphere',[px,.055,pz],[0,0,0],[sx*.78,.018,sz*.78],[.01,.018,.014,.34],[0,1,.45,0],0,[0,0,0,0],t,{depthWrite:false});r.draw('blob',[px,p[1]+bounce,pz],[w*.07+i*.025,i*.48+q*.08,p[3]+w*.08],[sx,sy,sz],[.57,.9,.25,.91],[0,.24,.78,.03],1,[.06+Math.abs(w)*.08,w*.22,0,1],t)});
      let crackFade=1-smooth(.35,1.35,q),cracks=[];if(crackFade>0)for(let branch=0;branch<5;branch++)for(let k=0;k<18;k++){let a=branch/5*Math.PI*2+(k/18-.5)*.24,rr=.1+k*.057,y=.93-k*.01+Math.sin(k*1.7+branch)*.018;cracks.push(Math.cos(a)*rr,y,Math.sin(a)*rr+.58,.025,.04,.018,.92*crackFade)}r.points(cracks,14,false);
      let chips=[];if(q<2)for(let i=0;i<34;i++){let a=hash(i)*Math.PI*2,speed=.22+hash(i+3)*.48,rr=q*speed,y=1.02+q*(.45+hash(i+8)*.5)-q*q*.42;chips.push(Math.cos(a)*rr,y,Math.sin(a)*rr+.12,.48,.92,.28,.45*(1-q/2))}r.points(chips,12,false);
    }
    for(let b of s.balls)if(b.active){r.draw('sphere',[b.p[0],.06,b.p[2]],[0,0,0],[b.r*.92,.025,b.r*.92],[0,0,0,.38],[0,1,.5,0],0,[0,0,0,0],t,{depthWrite:false});r.draw('sphere',b.p,[b.spin*.24,b.spin,0],[b.r,b.r,b.r],[.34,.38,.37,1],[.88,.18,1,0],0,[0,0,0,0],t);r.draw('sphere',[b.p[0]-.15,b.p[1]+.18,b.p[2]+.17],[0,0,0],[b.r*.18,b.r*.18,b.r*.09],[.95,.98,.94,.65],[.1,.12,.55,.2],3,[0,0,0,0],t,{depthWrite:false})}
    if(this.mode==='offset'){let q=Math.max(0,t-3.02);r.draw('sphere',[3.25+q*.22,.38,.45+q*.4],[0,q*2.2,0],[.38,.38,.38],[.84,.49,.18,1],[.65,.25,1,0],0,[0,0,0,0],t)}
    // 体素求解节点可视化：内部微光展示形变来自体积离散。
    if(s.compression>.08&&!s.fractured){let pts=[];for(let i=0;i<this.jelly.nodes.length;i+=5){let n=this.jelly.nodes[i];pts.push(n.p[0]+s.shift,n.p[1]+.08,n.p[2]+.08,.72,1,.42,.12)}r.points(pts,9,true)}
  }
  tankState(t){
    let full=this.mode==='full',active=this.waveOn||full,wave=0;
    if(active)wave=full?smooth(2.7,7.2,t)*(.86)-smooth(13.2,17.5,t)*.84:this.waveLevel;
    if(!active&&this.mode==='drop')wave=this.waveLevel+Math.exp(-Math.max(0,t-2)*.42)*.08;
    return{wave:clamp(wave,0,.92),drop:full||this.mode==='drop'}
  }
  ballTarget(group){let d=[this.params.dl,this.params.dn,this.params.dh][group]/100;return clamp(.55-(d-.55)*2.0,-1.68,.62)}
  renderTank(){
    let r=this.renderer,t=this.localTime,state=this.tankState(t),w=state.wave,f=this.params.freq/100,level=state.drop?smooth(.25,2.4,t)*.08:0;
    r.fluidProfile=this.waterGPU.surfaceProfile||r.zeroFluid;
    r.draw('plane',[0,-2.03,0],[0,0,0],[11,1,8],[.13,.18,.17,1],[0,.86,1,0],0,[0,0,0,0],t);
    r.draw('cube',[0,-2.12,0],[0,0,0],[4.45,.12,2.65],[.18,.23,.21,1],[.12,.76,1,0],0,[0,0,0,0],t);
    // 水体体积与由粒子边界重建的自由表面。
    r.draw('cube',[0,-.92+level*.5,0],[0,0,0],[4.05,1.1+level*.5,2.28],[.05,.33,.39,.2],[0,.12,.2,.02],4,[w,0,0,0],t,{depthWrite:false,cull:false});
    r.draw('plane',[0,.22+level,0],[0,0,0],[4.03,1,2.27],[.18,.72,.76,.72],[0,.12,.65,.06],2,[w*.62,1.1+f*.9,0,0],t,{depthWrite:false,cull:false});
    // 槽底地形迫使底流绕行和抬升。
    r.draw('sphere',[1.2,-1.48,.78],[0,.3,0],[1.08,.58,.86],[.23,.27,.22,1],[.05,.88,1,0],0,[0,0,0,0],t);r.draw('sphere',[2.05,-1.8,.25],[0,0,0],[.48,.24,.62],[.34,.37,.31,1],[.04,.9,1,0],0,[0,0,0,0],t);
    let caustics=[];for(let i=0;i<84;i++){let row=Math.floor(i/14),x=-3.55+(i%14)*.55+Math.sin(t*1.3+i)*.06,z=-1.9+row*.72+Math.cos(t*.9+i*1.7)*.07,a=.035+w*.045;caustics.push(x,-1.965,z,.25,.84,.76,a)}r.points(caustics,44,true);
    // 造浪板及连杆。
    let boardX=-3.62+Math.sin(t*f*6.283)*w*.28;r.draw('cube',[boardX,-.55,0],[0,0,0],[.12,1.34,2.05],[.63,.71,.67,1],[.62,.24,1,0],0,[0,0,0,0],t);r.draw('cylinder',[-4.02,-.55,0],[Math.PI/2,0,0],[.11,.55,.11],[.36,.42,.39,1],[.72,.25,1,0],0,[0,0,0,0],t);
    // 三组球：由密度决定静止高度；入水、过冲、浮力回归和波流位移。
    let colors=[[1,.28,.2,1],[.13,.83,.9,1],[.56,.32,1,1]],balls=[];
    for(let g=0;g<3;g++)for(let j=0;j<7;j++){
      let id=g*7+j,start=-.06+j*.075+g*.04,x0=-2.55+j*.78+(g-1)*.12+(hash(id)-.5)*.18,z0=-1.18+g*1.12+(j%2)*.15+(hash(id+31)-.5)*.16,target=this.ballTarget(g)+(hash(id+9)-.5)*.16,p=[x0,target,z0];
      if(state.drop){let q=t-start;if(q<0)p[1]=3.0+g*.18;else{let settle=target+(2.9-target)*Math.exp(-q*1.12)*Math.cos(q*(3.4+g*.25));p[1]=q<.45?mix(3,target-.85,smooth(0,.45,q)):settle;let flow=w*(smooth(2.5,8,t)-smooth(13,18,t)),returnFlow=this.mode==='full'?(smooth(9.5,12,t)-smooth(15,17.7,t)):0,transport=this.mode==='full'?smooth(5,14.5,t)*(.42-g*.11)*(.75+hash(id+51)*.5):0;p[0]+=flow*(1.3-g*.34)-returnFlow*(.58-g*.12)+transport+Math.sin(t*1.5+j)*w*.16;p[2]+=Math.sin(t*1.2+j*2.1)*w*.09+(this.mode==='full'?smooth(6,15,t)*(hash(id+77)-.5)*.34:0);if(g===0&&w>.6)p[1]+=Math.max(0,Math.sin(t*f*6.2+x0))*w*.68;if(g===1)p[1]+=Math.sin(t*1.7+j*.83)*w*.16;if(g===2){p[1]+=w>.76?Math.max(0,Math.sin(t*2+j))*.24:0;let around=Math.exp(-Math.pow(p[0]-1.2,2)*1.25)*w;p[2]+=(j%2?1:-1)*around*.34}}}
      else p[1]=target+Math.sin(t*1.5+j)*w*.13;
      p[0]=clamp(p[0],-3.35,3.55);balls.push({p,g,id});
    }
    for(let pass=0;pass<2;pass++)for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){let a=balls[i].p,b=balls[j].p,d=V3.sub(b,a),len=V3.len(d),min=.53;if(len<min&&len>.001){let push=(min-len)/len*.5;for(let k=0;k<3;k++){a[k]-=d[k]*push;b[k]+=d[k]*push}a[0]=clamp(a[0],-3.4,3.6);b[0]=clamp(b[0],-3.4,3.6)}}
    let wakes=[];for(let b of balls){r.draw('sphere',[b.p[0],-1.96,b.p[2]],[0,0,0],[.26,.018,.26],[0,0,0,.32],[0,1,.5,0],0,[0,0,0,0],t,{depthWrite:false});r.draw('sphere',b.p,[t*(.3+b.g*.2),t*.22,0],[.255,.255,.255],colors[b.g],[.35,.28,1,0],0,[0,0,0,0],t);r.draw('sphere',[b.p[0]-.07,b.p[1]+.09,b.p[2]+.08],[0,0,0],[.07,.07,.035],[1,1,1,.55],[0,.12,.5,.2],3,[0,0,0,0],t,{depthWrite:false});if(b.g===0&&w>.14)for(let k=1;k<=5;k++)wakes.push(b.p[0]-k*.105,.27+Math.sin(t*3+k)*.018,b.p[2]+Math.sin(k*1.4+b.id)*.055,.62,.96,.91,.13*(1-k/6))}r.points(wakes,12,false);
    let drops=[],foam=[],markers=[],ripples=[];
    // 入水水冠、回落水滴和气泡均来自粒子状态事件。
    if(state.drop)for(let j=0;j<21;j++){let group=Math.floor(j/7),force=.78+group*.25,q=t-(.66+(j%7)*.075+group*.04),cx=-2.55+(j%7)*.78+(group-1)*.12,cz=-1.18+group*1.12;if(q>0&&q<.42){let cavity=.1+Math.sin(q/.42*Math.PI)*.32*force;r.draw('sphere',[cx,.225+level-q*.08,cz],[0,0,0],[cavity,.018,cavity],[.01,.09,.1,.72],[0,.75,.48,0],0,[0,0,0,0],t,{depthWrite:false})}if(q>0&&q<1.25){for(let k=0;k<7;k++){let a=k/7*Math.PI*2,rr=(.1+q*.45*force)*(k%2?.7:1),x=cx+Math.cos(a)*rr,y=.22+Math.sin(a*.5+1)*q*1.15*force-2.0*q*q,z=cz+Math.sin(a)*rr;drops.push(x,y,z,.54,.9,1,.55+group*.08)}}if(q>.18&&q<2.15&&j%2===0)for(let k=0;k<12;k++){let a=k/12*Math.PI*2,rr=.12+(q-.18)*.34;ripples.push(cx+Math.cos(a)*rr,.245,cz+Math.sin(a)*rr,.35,.91,.91,.2*(1-q/2.15))}if(q>.1&&q<2)for(let k=0;k<3;k++){let y=.05-q*.42+k*.15;markers.push(cx,y,cz,.56,.88,.91,.18)}}
    if(w>.2){
      let crestX=-3.0+fract(t*(.11+f*.055))*6.25,breakA=clamp((w-.42)*2.05,0,.94);
      // 陡化的浪身与前倾浪唇；其位置跟随网格动量峰值。
      if(w>.38){r.draw('sphere',[crestX,.35+w*.34,0],[0,0,-.18],[.5,.26+w*.34,2.12],[.1,.58,.67,.78],[0,.1,.42,.04],4,[w,0,0,0],t,{depthWrite:false});r.draw('sphere',[crestX+.25,.65+w*.37,0],[0,0,.24],[.45,.12+w*.08,2.08],[.42,.9,.85,.72],[0,.08,.48,.05],4,[w,0,0,0],t,{depthWrite:false})}
      for(let z=-22;z<=22;z++){let zz=z/22*2.18;for(let k=0;k<3;k++){let a=(.2+k*.32)*Math.PI,x=crestX+Math.cos(a)*(.28+w*.22),y=.4+Math.sin(a)*(.35+w*.48)+Math.sin(z*.7+k)*.045;foam.push(x,y,zz,.86,.98,.93,breakA)}}
      for(let i=0;i<90;i++){let ang=(i%15)/14*Math.PI,zz=-2.05+Math.floor(i/15)*.8+(hash(i)*.16),x=crestX+.18+Math.cos(ang)*(.3+w*.3)+hash(i+8)*.16,y=.42+Math.sin(ang)*(.35+w*.58)+hash(i+2)*.28*w;foam.push(x,y,zz,.92,1,.96,breakA*.85)}
      if(w>.42)for(let side of [-1,1])for(let i=0;i<28;i++){let x=.15+i*.09,z=.72+side*(.28+Math.sin(i*.55+t)*.16),y=.25+Math.sin(i*.42-t)*.045;foam.push(x,y,z,.74,.96,.9,(w-.42)*.6)}
      if(this.mode==='full'&&t>9.5&&t<14.8)for(let i=0;i<75;i++){let q=(t-9.5)*.7,x=3.72-hash(i)*.16,y=.25+Math.abs(Math.sin(q+i*.73))*(.35+w*.85)*Math.exp(-(t-9.5)*.11),z=-2.1+(i%15)/14*4.2;foam.push(x,y,z,.82,.97,.94,breakA*.72)}
      if(this.mode==='full'){let reflect=smooth(9.7,11.3,t)*(1-smooth(14.7,17.4,t));if(reflect>.01){let rx=clamp(3.65-(t-10.4)*.92,-2.7,3.7);r.draw('sphere',[rx,.38+reflect*.22,0],[0,0,.17],[.38,.2+reflect*.22,2.08],[.12,.57,.66,.62],[0,.12,.34,.03],4,[reflect,0,0,0],t,{depthWrite:false});for(let z=-20;z<=20;z++){let zz=z/20*2.1;foam.push(rx,.53+Math.sin(z*.7+t)*.05,zz,.72,.94,.9,.3*reflect)}let meet=Math.exp(-Math.pow(crestX-rx,2)*1.8)*reflect;for(let i=0;i<55;i++){let a=i/55*Math.PI*2,rr=.18+hash(i)*.55;foam.push((crestX+rx)*.5+Math.cos(a)*rr,.45+hash(i+5)*meet*.7,-1.8+(i%11)*.36,.9,1,.96,meet*.7)}}}
      for(let i=0;i<100;i++){let x=-3.5+(i%20)*.36,y=-1.72+Math.floor(i/20)*.37,z=-1.9+(i%7)*.62;markers.push(x,y+Math.sin(t+x)*w*.05,z,.18,.65,.72,.05)}
    }
    if(this.waterGPU.visual)for(let i=0;i<this.waterGPU.count;i+=6){let k=i*8,x=this.waterGPU.visual[k]*3.75,y=-2+(this.waterGPU.visual[k+1]+1)*1.1,z=this.waterGPU.visual[k+2]*2.2;markers.push(x,y,z,.22,.75,.8,.075)}
    r.points(markers,13,false);r.points(ripples,11,false);r.points(drops,25,false);r.points(foam,30,false);
    // 透明玻璃最后绘制，边缘使用实心高光框架。
    let glass=[.34,.68,.7,.18],edge=[.48,.73,.7,.72];r.draw('cube',[0,-.03,-2.46],[0,0,0],[4.18,2.02,.035],glass,[.1,.1,.22,.02],3,[0,0,0,0],t,{depthWrite:false});r.draw('cube',[0,-.03,2.46],[0,0,0],[4.18,2.02,.035],glass,[.1,.1,.16,.02],3,[0,0,0,0],t,{depthWrite:false});r.draw('cube',[-4.18,-.03,0],[0,0,0],[.035,2.02,2.45],glass,[.1,.1,.2,.02],3,[0,0,0,0],t,{depthWrite:false});r.draw('cube',[4.18,-.03,0],[0,0,0],[.035,2.02,2.45],glass,[.1,.1,.2,.02],3,[0,0,0,0],t,{depthWrite:false});
    for(let x of [-4.22,4.22])for(let z of [-2.5,2.5])r.draw('cube',[x,-.04,z],[0,0,0],[.035,2.08,.035],edge,[.2,.18,.72,.06],3,[0,0,0,0],t,{depthWrite:false});for(let y of [-2.08,2.0]){r.draw('cube',[0,y,-2.5],[0,0,0],[4.24,.035,.035],edge,[.2,.18,.72,.06],3,[0,0,0,0],t,{depthWrite:false});r.draw('cube',[0,y,2.5],[0,0,0],[4.24,.035,.035],edge,[.2,.18,.72,.06],3,[0,0,0,0],t,{depthWrite:false})}
  }
  updateStatus(){
    if(this.scene==='jelly'){$('#statusKicker').textContent='SOFT BODY // '+(this.mode==='idle'?'STABLE':'SOLVING');$('#statusTitle').textContent=this.mode==='idle'?'等待冲击':this.mode==='multi'?'连续应变叠加':this.mode==='offset'?'切向冲量传递':'体积约束响应';$('#statusText').textContent=this.mode==='idle'?'选择一种冲击模式，观察应变如何从接触点向整体传播。':'节点约束正在保持总体积；局部应变决定回弹与连接断裂。';$('#stat1Label').textContent='形变量';$('#stat2Label').textContent='应变能'}else{$('#statusKicker').textContent='FLUID // '+(this.waterGPU.ready?'WEBGPU ACTIVE':'INITIALIZING');$('#statusTitle').textContent=this.mode==='full'&&this.localTime>15?'重新分层 · 回归平静':this.mode==='full'&&this.localTime>10?'反射波交汇':this.waveOn?'波能注入中':'密度分层';$('#statusText').textContent='粒子向网格传递动量，自由表面、飞溅和白水由粒子状态重建。';$('#stat1Label').textContent='浪高';$('#stat2Label').textContent='GPU 步数'}}
  updateUI(){
    this.updateStatus();let dur=this.demo?this.durations[this.demo]:0,p=dur?clamp(this.localTime/dur,0,1):fract(this.totalTime/10);$('#timelineFill').style.width=p*100+'%';$('#timelineHead').style.left=p*100+'%';$('#timeNow').textContent=this.formatTime(this.localTime);if(!this.demo){$('#runLabel').textContent=this.paused?'模拟暂停':'自由模拟';$('#timeTotal').textContent='LIVE'}
    if(this.mode==='full'){let pumping=this.localTime<13.2;$('#waveBtn').classList.toggle('active',pumping);$('#waveBtn b').textContent=pumping?'停止造浪':'启动造浪'}
    if(this.scene==='jelly'){let s=this.jellyState(this.localTime);$('#stat1').textContent=(s.compression*100).toFixed(1)+'%';$('#stat2').textContent=(this.jelly.energy+s.impact*s.compression*34).toFixed(1)+' J';$('#statusTag').innerHTML='<i></i> '+(s.fractured?'FRACTURE':this.paused?'PAUSED':this.mode==='idle'?'READY':'RUNNING')}else{let s=this.tankState(this.localTime);$('#stat1').textContent=(s.wave*1.35).toFixed(2)+' m';$('#stat2').textContent=this.waterGPU.steps.toLocaleString();$('#statusTag').innerHTML='<i></i> '+(s.wave>.6?'BREAKING':this.paused?'PAUSED':this.mode==='idle'?'READY':'RUNNING')}
  }
  installExport(){
    let app=this;window.videoExport={runs:['jelly-center','jelly-multi','jelly-offset','tank-full'],async begin(runId,{fps}={}){if(!this.runs.includes(runId))throw new Error('未知演示 '+runId);fps=Math.max(1,Math.floor(+fps||30));app.exportRestore={scene:app.scene,params:{...app.params}};app.exporting=true;app.exportFps=fps;app.exportLast=-1;app.exportStep=0;app.exportDt=1/120;document.body.classList.add('exporting');app.runDemo(runId,true);if(runId==='tank-full'&&navigator.gpu){let deadline=performance.now()+3000;while(!app.waterGPU.ready&&performance.now()<deadline)await new Promise(r=>setTimeout(r,16));app.waterGPU.reset()}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return{frames:Math.ceil(app.durations[runId]*fps)}} ,async frame(i){if(!app.exporting)throw new Error('请先调用 begin');i=Math.max(0,Math.floor(i));let target=i/app.exportFps,desired=Math.floor(target/app.exportDt+1e-7),audio=app.audio.on;app.audio.on=false;while(app.exportStep<desired){app.exportStep++;app.localTime=app.exportStep*app.exportDt;app.simulate(app.exportDt)}app.audio.on=audio;app.localTime=target;app.totalTime=target;app.exportLast=i;if(app.scene==='tank'&&app.waterGPU.ready){await app.waterGPU.device.queue.onSubmittedWorkDone();await app.waterGPU.snapshot()}app.render();await new Promise(r=>requestAnimationFrame(r))},end(){let restore=app.exportRestore;app.exporting=false;document.body.classList.remove('exporting');app.reset(false);if(restore){Object.assign(app.params,restore.params);app.syncParamUI();app.setScene(restore.scene)}else app.setScene(app.scene);app.exportRestore=null}};
  }
}

try{window.matterLab=new MatterApp()}catch(e){console.error(e);$('#fallback').classList.add('show');$('#fallback b').textContent='图形初始化失败';$('#fallback span').textContent=e.message}
})();
