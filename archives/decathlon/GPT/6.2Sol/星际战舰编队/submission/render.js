"use strict";
const canvas = document.getElementById('film');
const gl = canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});
gl.disable(gl.DITHER);
const TAU = Math.PI*2, sin = Math.sin, cos = Math.cos;
const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,v));
const mix = (a,b,t) => a+(b-a)*t;
const smooth = (a,b,v) => {const x=clamp((v-a)/(b-a));return x*x*(3-2*x);};
const mod = (a,b) => (a%b+b)%b;
const add = (a,b) => a.map((v,i)=>v+b[i]);
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const scale = (a,b) => a.map(v=>v*b);
const lerp3 = (a,b,t) => a.map((v,i)=>mix(v,b[i],t));
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = a => scale(a,1/(Math.hypot(...a)||1));
const rgb = hex => [16,8,0].map(s=>Math.pow(((hex>>s)&255)/255,2.15));
function random(seed) {
  return () => {seed|=0;seed=seed+0x6D2B79F5|0;let n=Math.imul(seed^seed>>>15,1|seed);n=n+Math.imul(n^n>>>7,61|n)^n;return ((n^n>>>14)>>>0)/4294967296;};
}
function program(vs,fs) {
  const p=gl.createProgram();
  for(const [type,src] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]) {
    const s=gl.createShader(type);gl.shaderSource(s,'#version 300 es\nprecision highp float;\n'+src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    gl.attachShader(p,s);gl.deleteShader(s);
  }
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
  const names={};for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++) {
    const n=gl.getActiveUniform(p,i).name;names[n.replace('[0]','')]=gl.getUniformLocation(p,n);
  }
  return {p,u:names};
}
function matrix(p=[0,0,0], yaw=0, pitch=0, roll=0, dims=[1,1,1]) {
  const c=cos(yaw),s=sin(yaw),b=cos(pitch),d=sin(pitch),f=cos(roll),g=sin(roll);
  return new Float32Array([
    (c*f+s*d*g)*dims[0], b*g*dims[0],(-s*f+c*d*g)*dims[0],0,
    (-c*g+s*d*f)*dims[1], b*f*dims[1],(s*g+c*d*f)*dims[1],0,
    s*b*dims[2],-d*dims[2],c*b*dims[2],0,...p,1]);
}
function point(m,p) {
  return [0,1,2].map(i=>m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]+m[i+12]);
}
function multiply(a,b) {
  const out=new Float32Array(16);
  for(let j=0;j<4;j++) for(let i=0;i<4;i++)
    out[j*4+i]=a[i]*b[j*4]+a[i+4]*b[j*4+1]+a[i+8]*b[j*4+2]+a[i+12]*b[j*4+3];
  return out;
}
const identity=matrix();
let eye,forward,right,up,viewProjection,lens,timeNow,interior,lights;
function camera(pos,target,fov,bank=0) {
  eye=pos;forward=unit(sub(target,pos));
  const r=unit(cross(forward,[0,1,0])), u=cross(r,forward);
  right=add(scale(r,cos(bank)),scale(u,sin(bank)));
  up=add(scale(r,-sin(bank)),scale(u,cos(bank)));
  lens=Math.tan(fov*Math.PI/360);
  const bw=canvas.width/canvas.height;
  const near=0.68,far=24000;
  viewProjection=multiply(
    [1/(lens*bw),0,0,0,0,1/lens,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0],
    [right[0],up[0],-forward[0],0,right[1],up[1],-forward[1],0,right[2],up[2],-forward[2],0,-dot(right,eye),-dot(up,eye),dot(forward,eye),1]);
}
const screenVAO=gl.createVertexArray();
const fullVert=`
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}
`;
const noise=`
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1)),f.x),f.y),f.z);}
float fb(vec3 p){return n3(p)*.55+n3(p*2.06+1.7)*.26+n3(p*4.13-3.)*.13+n3(p*8.3)*.06;}
`;
const sky=program(fullVert,`
in vec2 uv;out vec4 outColor;
uniform vec3 dir,rt,up;uniform vec2 lens;
${noise}
float stars(vec3 d,float s,float p) {
  vec3 a=abs(d);
  bool xFace=a.x>a.y&&a.x>a.z;
  bool yFace=!xFace&&a.y>a.z;
  vec2 c=xFace?d.yz/a.x:(yFace?d.xz/a.y:d.xy/a.z);
  float faceId=xFace?sign(d.x)+1.:(yFace?sign(d.y)+5.:sign(d.z)+9.);
  vec2 g=c*s, i=floor(g),j=fract(g);
  vec3 id=vec3(i,faceId);
  float r=hash(id), rr=length(j-vec2(.23+.52*hash(id+1.),.23+.52*hash(id+2.)));
  float aa=max(.017,length(fwidth(g))*.53);
  float radius=.035+.029*hash(id+3.);
  return (1.-smoothstep(radius-aa,max(.02,radius+aa),rr))*step(p,r)*(.58+1.10*pow(r,17.));
}
void main(){
  vec2 p=(uv*2.-1.)*lens;
  vec3 d=normalize(dir+rt*p.x+up*p.y), sun=normalize(vec3(-.52,.68,.34));
  vec3 planet=normalize(vec3(-.63,-.12,.69));
  float s=max(0.,dot(d,sun));
  vec3 c=vec3(.0035,.0064,.015);
  float belt=dot(d,normalize(vec3(.17,.94,-.27)));
  float clouds=fb(d*6.+vec3(n3(d*4.7)*1.4));
  float neb=exp(-pow(abs(belt+.18+.23*(clouds-.5))*3.8,1.75));
  float wisps=pow(clamp((clouds-.16)*1.44,0.,1.),2.6)*neb;
  float filament=pow(1.-abs(2.*fb(d*17.+clouds*5.)-1.),9.)*wisps;
  c+=vec3(.030,.083,.138)*wisps*1.73+vec3(.19,.048,.072)*wisps*max(0.,-.35+d.z)*2.9;
  c+=vec3(.026,.073,.088)*filament*.6;
  c+=stars(d,151.,.961)*vec3(.40,.57,1.)*.24+stars(d,67.,.981)*vec3(.9,.82,.74)*.62;
  c+=vec3(1.,.63,.35)*(.028*pow(s,23.)+.22*pow(s,460.)+2.4*pow(s,54000.));
  float pd=dot(d,planet),r=.278;
  vec3 ringAxis=normalize(vec3(-.26,.87,.42));
  float ringDenom=dot(ringAxis,d);
  float ringT=dot(planet,ringAxis)/max(.001,ringDenom);
  vec3 ringPoint=d*ringT-planet;
  float ringRadius=length(ringPoint);
  float rad=sqrt(max(0.,1.-pd*pd));
  if(pd>0. && rad<r){
    vec3 n=normalize((d-planet*pd)/r-planet*sqrt(max(0.,1.-rad*rad/(r*r))));
    float day=smoothstep(-.14,.88,dot(n,sun)), edge=pow(clamp(1.+dot(n,d),0.,1.),3.);
    float latitude=dot(n,ringAxis);
    float turb=fb(n*6.7), strata=fb(vec3(latitude*13.+turb*.8,turb*2.4,n.z*1.5));
    float ether=.52+.30*sin(latitude*41.+4.*turb)+.18*sin(latitude*82.+12.*strata);
    vec3 ground=mix(vec3(.046,.072,.125),vec3(.36,.23,.22),smoothstep(.18,.83,strata*.63+ether*.37));
    c=ground*(.055+day*1.13)+edge*vec3(.11,.36,.67)*(.10+day*.68);
  }
  float ringEdge=smoothstep(.319,.342,ringRadius)*(1.-smoothstep(.487,.503,ringRadius));
    vec2 gapPosition=(ringRadius-vec2(.439,.385))*vec2(317.,236.);
  float gap=1.-dot(vec2(.76,.44),exp(-gapPosition*gapPosition));
  vec2 bandPhase=vec2(ringRadius*505.,ringRadius*844.+sin(ringRadius*85.));
  vec2 pixelSpan=fwidth(bandPhase);
  vec2 grains=sin(bandPhase)/(1.+.8*pixelSpan*pixelSpan);
  if(pd>0. && ringDenom>0. && ringEdge>0.&&(rad>=r||ringT<pd-sqrt(max(0.,r*r-rad*rad)))){
    float bands=.62+dot(grains,vec2(.17,.12));
    float lit=smoothstep(.13,.34,length(cross(ringPoint,sun)));
    if(dot(ringPoint,sun)>0.)lit=1.;
    float weight=ringEdge*gap*bands*(.34+.66*lit);
    vec3 veil=mix(vec3(.12,.19,.29),vec3(.43,.31,.21),smoothstep(.34,.49,ringRadius));
    c=mix(c,veil,weight*.53);
  }
  if(pd>0.) c+=exp(-abs(rad-r)*580.)*vec3(.16,.40,.69)*clamp(dot(normalize(d-planet*pd),sun)+.23,.08,1.);
  outColor=vec4(c,0.);
}
`);
const solid=program(`
layout(location=0) in vec3 v;layout(location=1) in vec3 n;
layout(location=2) in vec3 location;layout(location=3) in vec3 size;
layout(location=4) in vec4 tint;layout(location=5) in vec2 material;
uniform mat4 VP,M; uniform float serial;
out vec3 P,N,L;out vec4 C;out vec2 Q;out vec3 extent;out vec3 face;
void main(){
 vec4 w=M*vec4(location+v*size,1.);P=w.xyz;N=normalize(mat3(M)*n);L=v;C=tint;Q=material;extent=size;face=n;gl_Position=VP*w;
 float order=mod(float(gl_InstanceID*17)+serial*37.,127.);
 float layer=order*.000000132*min(1.,58./max(1.,gl_Position.w));
 gl_Position.z-=layer*gl_Position.w;
}`,`
in vec3 P,N,L;in vec4 C;in vec2 Q;in vec3 extent,face;out vec4 color;
uniform mat4 M;uniform vec3 eye;uniform vec4 sources[12];uniform vec3 hues[12];uniform float inside,t;
uniform mat4 sunVP;uniform highp sampler2DShadow sunDepth;uniform int shadowOn;uniform vec3 faultGlow,shieldSweep;uniform vec4 faultTrace;
uniform float deckPlane, mirrorPass;
uniform mat4 lampVP;
uniform vec4 lampSource;
uniform vec3 lampTint;
uniform highp sampler2DShadow lampDepth;
float sunlight(vec3 p,vec3 n,float facing){
 if(shadowOn==0||facing<=0.) return 1.;
 vec3 q=(sunVP*vec4(p+n*1.12,1.)).xyz*.5+.5;
 if(any(lessThan(q,vec3(.005)))||any(greaterThan(q,vec3(.995))))return 1.;
 q.z-=.00018;
 float sum=0.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
   float w=float((2-abs(x))*(2-abs(y)));
   sum+=texture(sunDepth,q+vec3(vec2(float(x),float(y))*.00050,0.))*w;
 }
 return .16+.84*sum*.0625;
}
vec3 roomLight(vec3 p,vec3 n){
 if(lampSource.w<=0.)return vec3(0.);
 vec4 clip=lampVP*vec4(p+n*.32,1.);
 if(clip.w<=.6)return vec3(0.);
 vec3 ndc=clip.xyz/clip.w;
 vec3 q=ndc*.5+.5;
 float edge=max(abs(ndc.x),abs(ndc.y));
 if(edge>=.99||abs(ndc.z)>=1.)return vec3(0.);
 q.z-=.00012;
 float shade=0.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
   shade+=texture(lampDepth,q+vec3(vec2(float(x),float(y))*.00125,0.));
 }
 vec3 d=lampSource.xyz-p;
 float distance=dot(d,d)/(lampSource.w*lampSource.w);
 float incidence=.12+.88*max(0.,dot(n,normalize(d)));
 float cone=1.-smoothstep(.48,.98,edge);
 return lampTint*(shade/9.)*cone*incidence/(1.+distance);
}
void main(){
 if(mirrorPass>.5&&P.y<=deckPlane+.02)discard;
 vec3 v=normalize(eye-P);
 vec3 sun=normalize(vec3(-.52,.68,.34)), skyFill=normalize(vec3(.5,.28,-.45));
 vec3 edge=(.5-abs(L))*extent+abs(face)*10000.;
 float ledge=min(edge.x,min(edge.y,edge.z));
 float rim=1.-smoothstep(.05,1.12+fwidth(ledge)*.32,ledge);
 vec3 adjacentFaces=sign(L)*(1.-smoothstep(vec3(.1),vec3(.82),edge));
 vec3 normal=normalize(N+mat3(M)*adjacentFaces*.49);
 vec3 surface=L*extent;
 float footprint=max(length(dFdx(P)),length(dFdy(P)));
 float nearby=1.-smoothstep(.42,1.9,footprint);
 float brushing=sin(dot(surface,vec3(1.9,1.4,4.1))+.82*sin(dot(surface,vec3(.22,.14,.13))));
 float broadWear=sin(dot(surface,vec3(.13,.09,.23)))*sin(dot(surface,vec3(.17,-.084,.14)));
 float surfaceVariation=.975+.022*broadWear+.020*Q.x*brushing*nearby;
 float direct=max(0.,dot(normal,sun)), fill=max(0.,dot(normal,skyFill));
 float lightMask=inside<.5?sunlight(P,normal,direct):1.;
 float key=direct*lightMask;
 vec3 env=mix(vec3(.071,.101,.167),vec3(.115,.135,.18),inside);
 float planetBounce=max(0.,dot(normal,normalize(vec3(-.35,-.38,.61))));
 vec3 light=env+(1.-inside)*planetBounce*vec3(.095,.058,.031) + key*vec3(1.55,1.32,1.039)*mix(1.,.16,inside)+fill*vec3(.19,.31,.49)*mix(1.,.34,inside);
 float spec=pow(max(dot(normal,normalize(v+sun)),0.),mix(12.,38.,Q.x))*(.04+Q.x*.40)*(1.-inside*.75)*lightMask;
 vec3 flash=vec3(0.);
 for(int i=0;i<12;i++){
   vec3 delta=sources[i].xyz-P;
   float r=sources[i].w;
   float att=1./(1.+dot(delta,delta)/max(r*r,1.));
   att*=att*(.25+.75*max(0.,dot(normal,normalize(delta+vec3(.001)))));
   flash+=hues[i]*att;
 }
 float fres=pow(clamp(1.-abs(dot(v,normal)),0.,1.),3.);
  vec3 reflected=reflect(-v,normal);
 float broad=pow(max(dot(reflected,skyFill),0.),6.)*.10*Q.x;
 float top=max(0.,normal.y);
 vec3 focused=roomLight(P,normal);
 vec3 base=C.rgb*light*surfaceVariation+C.rgb*(flash+focused)+flash*.017+focused*.025;
 base+=broad*vec3(.23,.37,.51)*(top*.48+.52);
 base+=vec3(.56,.69,.82)*(spec+rim*(.018+.025*key))*(.30+.70*Q.x);
 base+=env*fres*Q.x*.23;
 if(shieldSweep.y>.001){
   float axial=dot(P-M[3].xyz,M[2].xyz)*shieldSweep.z;
   float distance=abs(axial-shieldSweep.x+.018*sin(P.x*.054));
   float wave=exp(-distance*9.)+.21*exp(-abs(distance-.105)*20.);
   base+=vec3(.034,.47,.86)*shieldSweep.y*wave*(.085+Q.x*.13+C.rgb*.34)*(1.+rim*.48);
 }
 base=mix(base,base+C.rgb*C.a*(1.+Q.y*(.26*sin(t*4.133674544+dot(P,vec3(.01,.015,.009))))),step(.001,C.a));
 if(Q.y>1.9){
   float frontier=length(P-faultTrace.xyz)/max(1.,faultTrace.w);
   float traveling=1.-smoothstep(.47,1.,frontier);
   base+=faultGlow*traveling*(.76+.24*sin(dot(P,vec3(.092,.17,.12))+t*8.));
 }
 float fog=1.-exp(-length(eye-P)*mix(.00010,.00105,inside));
 float coating=abs(P.y-deckPlane)<.11&&face.y>.80&&mirrorPass<.5?max(-Q.y,0.)*(.38+.62*fres):0.;
 color=vec4(mix(base, mix(vec3(.019,.030,.049),vec3(.010,.020,.032),inside),fog*.77),coating);
}
`);
const cube=[];
for(const n of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
  const a=unit(cross(Math.abs(n[1])>.5?[0,0,1]:[0,1,0],n)),b=cross(n,a);
  for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]]) cube.push(...scale(add(n,add(scale(a,u),scale(b,v))),.5),...n);
}
function buffer(data,usage=gl.STATIC_DRAW){
  const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,usage);return b;
}
const cubeBuffer=buffer(new Float32Array(cube));
let nextBlockSerial=0;
class Blocks {
  constructor(){this.data=[];this.n=0;this.serial=nextBlockSerial++;}
  box(x,y,z,w,h,d,key){
    if(w<1||h<1||d<1)return;
    w=Math.round(w);h=Math.round(h);d=Math.round(d);
    const m=typeof key==='string'?P[key]:key;
    this.data.push(Math.round(x-w/2)+w/2,Math.round(y-h/2)+h/2,Math.round(z-d/2)+d/2,w,h,d,...m);
  }
  cut(low,high){
    const pieces=[];
    for(let i=0;i<this.data.length;i+=12){
      const record=this.data.slice(i,i+12);
      const lo=record.slice(0,3).map((v,k)=>v-record[k+3]/2);
      const hi=record.slice(0,3).map((v,k)=>v+record[k+3]/2);
      const a=lo.map((v,k)=>Math.max(v,low[k]));
      const c=hi.map((v,k)=>Math.min(v,high[k]));
      if(a.some((v,k)=>v>=c[k])){pieces.push(...record);continue;}
      const emit=(l,h)=>{
        if(l.every((v,k)=>v<h[k]))pieces.push(...l.map((v,k)=>(v+h[k])/2),...l.map((v,k)=>h[k]-v),...record.slice(6));
      };
      for(let k=0;k<3;k++){
        const h=hi.slice();h[k]=a[k];emit(lo,h);
        const l=lo.slice();l[k]=c[k];emit(l,hi);
        lo[k]=a[k];hi[k]=c[k];
      }
    }
    this.data=pieces;
  }
  build(){
    this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER,cubeBuffer);
    for(let i=0;i<2;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,24,i*12);}
    this.n=this.data.length/12;
    buffer(new Float32Array(this.data));
    let o=0;for(const [i,n] of [[2,3],[3,3],[4,4],[5,2]]) {
      gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,n,gl.FLOAT,false,48,o);gl.vertexAttribDivisor(i,1);o+=4*n;
    }
    this.data=null;return this;
  }
  draw(m=identity,materialLocation=solid.u.M){
    if(materialLocation===solid.u.M) gl.uniform1f(solid.u.serial,this.serial);
    gl.uniformMatrix4fv(materialLocation,false,m);gl.bindVertexArray(this.vao);gl.drawArraysInstanced(gl.TRIANGLES,0,36,this.n);
  }
}
const lensGlass=program(`
layout(location=0) in vec3 vertex;
layout(location=1) in vec3 norm;
layout(location=2) in vec3 at;
layout(location=3) in vec3 extent;
layout(location=4) in vec4 tint;
uniform mat4 VP,M;
out vec3 P,N,L,size;out vec4 C;
void main(){
 vec4 q=M*vec4(at+vertex*extent,1.);
 P=q.xyz;N=normalize(mat3(M)*norm);L=vertex;size=extent;C=tint;gl_Position=VP*q;
}
`,`
in vec3 P,N,L,size;in vec4 C;uniform vec3 eye;uniform float t;out vec4 color;
void main(){
  vec3 view=normalize(eye-P);
  float facing=abs(dot(view,N));
  float edge=min((.5-abs(L.x))*size.x,(.5-abs(L.y))*size.y);
  float frame=1.-smoothstep(.4,2.1,edge);
  float angular=pow(1.-facing,3.);
  float trace=exp(-abs(L.y+.28)*82.)*.18*angular;
  float reflectance=frame*.27+angular*.46+trace;
  color=vec4(C.rgb*(.19+reflectance*2.)+vec3(.028,.039,.049)*reflectance,.073+.35*reflectance);
}
`);
let windows=[];
function glassPane(model,m=identity){windows.push([model,m]);}
const shadow=program(`
layout(location=0) in vec3 vertex;
layout(location=2) in vec3 at;
layout(location=3) in vec3 extent;
uniform mat4 M,VP;
void main(){gl_Position=VP*M*vec4(at+vertex*extent,1.);}
`,`void main(){}`);
const shadowSize=2560;
function shadowBuffer(size){
  const f=gl.createFramebuffer(),t=gl.createTexture();
  gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,size,size,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,t,0);
  gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  return {f,t,w:size,h:size};
}
const shadowTarget=shadowBuffer(shadowSize),lampTarget=shadowBuffer(1280);
let sunProjection=identity,castingShadows=false;
function castSunShadows(list,enabled) {
  castingShadows=enabled;
  if(!enabled)return;
  const n=unit([-.52,.68,.34]), x=unit(cross([0,1,0],n)), y=cross(n,x);
  const anchor=[0,25,410*smooth(51,59,timeNow)*(1-smooth(65,72,timeNow))];
  const rows=[scale(x,1/1350),scale(y,1/1270),scale(n,-1/2300)];
  sunProjection=new Float32Array([
    rows[0][0],rows[1][0],rows[2][0],0,
    rows[0][1],rows[1][1],rows[2][1],0,
    rows[0][2],rows[1][2],rows[2][2],0,
    ...rows.map(axis=>-Math.round(dot(axis,anchor)*shadowSize*.5)*2/shadowSize),1
  ]);
  bind(shadowTarget);gl.clear(gl.DEPTH_BUFFER_BIT);
  const u=use(shadow);gl.uniformMatrix4fv(u.VP,false,sunProjection);
  for(const [model,m,local] of list)if(model.n&&local!==1)model.draw(m,u.M);
  bind(rasterTarget??frameTarget);
}
let lamp=null,lampProjection=identity;
function spotLight(at,aim,reach,fov,tint,roomOnly=false){
  lamp={at,aim,reach,fov,tint,roomOnly};
}
function castSpotShadows(list){
  if(!lamp)return;
  const {at,aim,fov,roomOnly}=lamp;
  const f=unit(sub(aim,at)),r=unit(cross(f,Math.abs(f[1])>.88?[0,0,1]:[0,1,0]));
  const u=cross(r,f), d=1/Math.tan(fov*Math.PI/360),near=1.1,far=565;
  lampProjection=multiply(
    [d,0,0,0,0,d,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0],
    [r[0],u[0],-f[0],0,r[1],u[1],-f[1],0,r[2],u[2],-f[2],0,-dot(r,at),-dot(u,at),dot(f,at),1]);
  bind(lampTarget);gl.clear(gl.DEPTH_BUFFER_BIT);
  const shader=use(shadow);gl.uniformMatrix4fv(shader.VP,false,lampProjection);
  for(const [model,m,local] of list)if(model.n&&(!roomOnly||local===1))model.draw(m,shader.M);
  bind(rasterTarget??frameTarget);
}
const effect=program(`
layout(location=0) in vec2 corner;
layout(location=1) in vec3 tail;layout(location=2) in vec3 head;
layout(location=3) in vec4 mode;layout(location=4) in vec3 hue;
uniform mat4 VP;uniform vec3 eye,rt,up;
out vec2 U;out vec4 M;out vec3 C;out float height;
void main(){
 vec3 p=mix(tail,head,corner.x), ray=head-tail;
 vec3 w=mode.z<.5?rt:normalize(cross(ray,eye-(tail+head)*.5)+rt*.00001);
 if(mode.z<.5) p+=up*(corner.x*2.-1.)*mode.x;
 p+=w*corner.y*mode.x;
 M=mode;U=corner;C=hue;height=p.y;gl_Position=VP*vec4(p,1.);
}`,`
in vec2 U;in vec4 M;in vec3 C;uniform float ticks,clipHeight;in float height;out vec4 color;
void main(){
 if(height<clipHeight)discard;
 float y=clamp(abs(U.y),0.,1.),x=clamp(U.x,0.,1.),k=0.;
 vec3 hue=C;
 if(M.z<.5) {
   float r=length(vec2(x*2.-1.,U.y));k=exp(-r*r*10.)*(1.-smoothstep(.61,1.,r));
 } else {
   float a=max(.06,mix(1.0,M.w,x));
   float v=y/a;
   if(M.z<1.5) {
     float core=exp(-v*v*33.), veil=exp(-v*v*5.);
     float fade=pow(1.-x,2.1)*smoothstep(0.,.055,x);
     float phase=ticks*10.086;
     float turbulence=.85+.095*sin(x*87.-phase+U.y*14.)+.055*sin(x*155.-2.*phase-U.y*45.);
     float hot=.37*exp(-v*v*21.)*(1.-smoothstep(.045,.49,x));
     hue=mix(C,vec3(.77,1.04,1.36),hot*step(M.w,.46));
     k=(core*.88+veil*.35)*fade*turbulence*(1.-smoothstep(.77,1.,y));
   } else if(M.z<2.5) {
     k=(exp(-y*y*49.)*.90+exp(-y*y*5.)*.40)*(.89+.11*sin(x*137.-M.w*21.))*(1.-smoothstep(.74,1.,y));
     k*=smoothstep(0.,.045,x)*(1.-smoothstep(.965,1.,x));
   } else {
     k=exp(-y*y*11.)*pow(max(0.,sin(x*3.14159265359)),.65)*(1.-smoothstep(.80,1.,y));
   }
 }
 color=vec4(hue*k*M.y,0.);
}
`);
const fxVAO=gl.createVertexArray();gl.bindVertexArray(fxVAO);
buffer(new Float32Array([0,-1,1,-1,1,1,0,-1,1,1,0,1]));
gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);
const fxBuffer=buffer(4,gl.DYNAMIC_DRAW);
let off=0;
for (const [i,n] of [[1,3],[2,3],[3,4],[4,3]]) {
  gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,n,gl.FLOAT,false,52,off);gl.vertexAttribDivisor(i,1);off+=4*n;
}
let fx=[];
const cyan=[.065,.68,1.28], gold=[1.34,.41,.073], ice=[.25,1.04,1.50], pale=[.68,1.15,1.62], lilac=[.72,.40,1.22];
function line(a,b,w,energy,color,kind=3,detail=1){if(w>0&&energy>0) fx.push(...a,...b,w,energy,kind,detail,...color);}
function halo(p,w,e,c){line(p,p,w,e,c,0);}
const skin=program(`
layout(location=0) in vec3 vertex;
uniform mat4 VP,M; uniform float serial;
out vec3 dir,P;void main(){dir=vertex;P=(M*vec4(vertex,1.)).xyz;gl_Position=VP*vec4(P,1.);}
`,`
in vec3 dir,P;out vec4 color;
uniform mat4 M;
uniform vec3 eye,axes,right,up;
uniform float phase,strength,t,strike;
uniform sampler2D sceneDepth;
uniform vec2 fieldSize;
uniform int optical;
vec2 hex(vec2 p) {
 vec2 s=vec2(1.,1.73205);
 vec2 a=mod(p,s)-s*.5, b=mod(p-s*.5,s)-s*.5;
 return dot(a,a)<dot(b,b)?a:b;
}
void main(){
 vec3 d=normalize(dir),n=normalize(mat3(M)*(d/(axes*axes)));
 float toward=clamp(dot(n,normalize(eye-P)),-1.,1.);
 float facing=abs(toward);
 float rim=pow(1.-facing,3.4);
 vec2 uv=vec2(atan(d.y,d.x)*3.7,d.z*23.);
 vec2 g=abs(hex(uv));
 float h=max(g.x,dot(g,vec2(.5,.866025)));
 float cell=smoothstep(.449,.50,h);
 float front=1.-phase*2.13+.055*sin(atan(d.y,d.x)*3.);
 float gate=smoothstep(front-.085,front+.12,d.z);
 float wave=exp(-abs(d.z-front)*21.);
 float current=pow(.5+.5*sin(d.z*25.-t*3.803486+sin(d.x*6.)*.67),6.);
 float seam=cell*(.009+.077*rim+.17*wave+.055*current);
  float wake=exp(-abs(d.z-front-.11)*28.)*gate;
 float arc=pow(.5+.5*cos(atan(d.y,d.x)*5.+t*.826735),5.);
 float intensity=gate*(.003+.153*rim+seam+.026*current)+wave*(.12+.17*rim+.09*arc)+wake*.13*cell;
 float age=max(0.,strike);
 float angle=acos(clamp(dot(d,normalize(vec3(.53,.18,.82))),-1.,1.));
 float speed=age*1.47;
 float impact=exp(-abs(angle-speed)*32.)*(1.-smoothstep(.46,1.18,age))*smoothstep(0.,.085,strike);
 float secondary=exp(-abs(angle-speed+.115)*41.)*.34*impact;
 if(optical>0){
   vec2 screen=gl_FragCoord.xy/fieldSize;
   if(toward<0.0||gl_FragCoord.z>texture(sceneDepth,screen).r+.000012)discard;
   float highlight=gate*(.059+.49*rim+.24*cell*current+.61*impact)+.77*wave;
   vec2 gradient=vec2(dot(n,right),dot(n,up));
   float ripple=.54+.31*cos(d.z*21.-t*4.133674544)+.15*sin(d.x*29.+d.y*13.);
   float waveShift=.0011+.0059*rim+.0043*wave+.0025*impact;
   vec2 offset=gradient*ripple*waveShift*strength*highlight;
   color=vec4(offset,0.,highlight*strength);return;
 }
 vec3 shell=mix(vec3(.014,.32,.66),vec3(.19,.84,1.0),wave*.8+rim*.1)*intensity;
 shell+=gate*(impact+secondary)*(.18+.18*cell)*vec3(.51,.71,.86);
 color=vec4(shell*strength,0.);
}
`);
const sphere=[];
for(let j=0;j<24;j++)for(let i=0;i<48;i++)for(const [a,b] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){
  const t=(i+a)/48*TAU,p=(j+b)/24*Math.PI;
    const rounded=v=>Math.sign(v)*Math.pow(Math.abs(v),.85);
  sphere.push(rounded(cos(t))*sin(p),rounded(sin(t))*sin(p),cos(p));
}
const skinVAO=gl.createVertexArray();gl.bindVertexArray(skinVAO);
buffer(new Float32Array(sphere));gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);
let shields=[];
function sphereShield(pose,axes,phase,strength,strike=-1) {
  if(phase>0 && strength>0) shields.push({pose,axes,phase,strength,strike});
}
const volume=program(fullVert,`
in vec2 uv;out vec4 color;
uniform sampler2D depthMap;
uniform vec3 eye,dir,rt,up;
uniform vec2 lens;
uniform int count;
uniform vec4 starts[7],ends[7],scatters[7];
uniform mat4 beamShadow;
uniform highp sampler2DShadow beamDepth;
uniform int beamOcclusion;
float occludedBeam(vec3 p){
 vec4 clip=beamShadow*vec4(p,1.);
 if(clip.w<=.8)return 1.;
 vec3 box=clip.xyz/clip.w;
 if(any(greaterThan(abs(box),vec3(.98))))return 1.;
 return .42+.58*texture(beamDepth,box*.5+vec3(.5,.5,.49972));
}
uniform float time;
void main(){
 vec2 plane=(uv*2.-1.)*lens;
 vec3 ray=normalize(dir+rt*plane.x+up*plane.y);
 float z=.68/(1.00002833-texture(depthMap,uv).r);
 float farZ=z/max(.18,dot(ray,dir));
 vec3 total=vec3(0.);
 for(int i=0;i<7;i++){
   if(i>=count)break;
   vec4 a=starts[i],b=ends[i],s=scatters[i];
   vec3 axis=b.xyz-a.xyz;
   float span=length(axis),sphereRad=span*.5+max(a.w,b.w)*1.25;
   vec3 rel=(a.xyz+b.xyz)*.5-eye;
   float e=dot(rel,ray),disc=sphereRad*sphereRad-dot(rel,rel)+e*e;
   if(disc<=0.)continue;
   float reach=sqrt(disc), first=max(0.,e-reach), last=min(farZ,e+reach);
   if(last<=first)continue;
   vec3 n=axis/max(span,.001);
   float lightAmp=.31+.69*pow(abs(dot(ray,n)),2.);
   float stride=(last-first)/14.;
   float integral=0.;
   for(int j=0;j<14;j++){
     vec3 p=eye+ray*(first+(float(j)+.5)*stride);
     vec3 local=p-a.xyz;
     float along=dot(local,n),h=along/max(span,.001);
     float r=mix(a.w,b.w,clamp(h,0.,1.));
     vec3 radial=local-n*along;
     float spread=dot(radial,radial)/(r*r);
     float trapped=smoothstep(-.04,.13,h)*(1.-smoothstep(.72,1.08,h));
     float dust=.84+.11*sin(dot(local,vec3(.23,.12,.17))+time*1.7)+.05*sin(dot(local,vec3(.61,.39,-.22))-time*2.4);
     float visibility=i==0&&beamOcclusion>0&&trapped>.025&&spread<1.5?occludedBeam(p):1.;
     integral+=exp2(-4.4*spread)*trapped*dust*visibility;
   }
   total+=s.rgb*(1.-exp(-integral*stride*s.a*.038))*lightAmp;
 }
 color=vec4(total,log(1.+z)*.1);
}`);
let volumes=[];
function lightVolume(from,to,beginRadius,endRadius,color,density){
  if(density>0)volumes.push({from,to,beginRadius,endRadius,color,density});
}
function drawVolumes(){
  if(!volumes.length)return;
  gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
  bind(volumeTarget);
  const u=use(volume);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,frameTarget.z);
  gl.uniform1i(u.depthMap,2);gl.uniform3fv(u.eye,eye);gl.uniform3fv(u.dir,forward);
  gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,lampTarget.t);gl.uniform1i(u.beamDepth,5);
  gl.uniform1i(u.beamOcclusion,lamp?1:0);
  gl.uniformMatrix4fv(u.beamShadow,false,lampProjection);
  gl.uniform3fv(u.rt,right);gl.uniform3fv(u.up,up);gl.uniform1f(u.time,timeNow);
  gl.uniform2f(u.lens,lens*canvas.width/canvas.height,lens);
  const start=new Float32Array(28),end=new Float32Array(28),scatters=new Float32Array(28);
  const count=Math.min(7,volumes.length);
  for(let i=0;i<count;i++){
    const {from,to,beginRadius,endRadius,color,density}=volumes[i];
    start.set([...from,beginRadius],i*4);
    end.set([...to,endRadius],i*4);
    scatters.set([...color,density],i*4);
  }
  gl.uniform1i(u.count,count);gl.uniform4fv(u.starts,start);gl.uniform4fv(u.ends,end);gl.uniform4fv(u.scatters,scatters);full();
  // Sample both images in the post pass. Sampling a depth attachment during a draw would create feedback.
  gl.activeTexture(gl.TEXTURE0);
}
const blur=program(fullVert,`
in vec2 uv;uniform sampler2D image;uniform vec2 stride;uniform float first;out vec4 color;
vec3 sampleAt(vec2 p){vec3 c=texture(image,p).rgb;return mix(c,c*smoothstep(.56,1.65,max(max(c.r,c.g),c.b)),first);}
void main(){vec3 c=sampleAt(uv)*.227027;
 c+=(sampleAt(uv+stride*1.384615)+sampleAt(uv-stride*1.384615))*.316216;
 c+=(sampleAt(uv+stride*3.230769)+sampleAt(uv-stride*3.230769))*.070270;
 color=vec4(c,1.);
}
`);
const composite=program(fullVert,`
in vec2 uv;uniform sampler2D image, glow, depthMap, volumeMap, deckMirror, shieldField;uniform vec2 px,volumeDimensions,mirrorTexel;uniform int mirrorOn;uniform float room,reflectionAmount,nativeCoverage;uniform int volumeOn,shieldFieldOn;out vec4 color;
vec3 grade(vec3 c){c=max(vec3(0.),c);return pow(1.-exp(-.94*c),vec3(.445));}
vec3 readAt(vec2 p){return grade(texture(image,p).rgb);}
float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}
float depth(vec2 p){return .68/(1.00002833-texture(depthMap,p).r);}
vec3 haze(vec2 uv){
 if(volumeOn==0)return vec3(0.);
 float z=log(1.+depth(uv))*.1;
 vec2 at=uv*volumeDimensions-.5,origin=floor(at),weight=fract(at);
 float sum=0.;vec3 scattered=vec3(0.);
 for(int y=0;y<2;y++)for(int x=0;x<2;x++){
   vec2 k=vec2(float(x),float(y)),w=mix(1.-weight,weight,k);
   vec4 f=texture(volumeMap,(origin+k+.5)/volumeDimensions);
   float wDepth=1.-smoothstep(.013,.051,abs(z-f.a));
   float q=w.x*w.y*wDepth;
   sum+=q;scattered+=f.rgb*q;
 }
 return scattered/max(.21,sum);
}
float occlusion(vec2 at){
 float z=depth(at);
 if(z>3000.)return 1.;
 float radius=clamp(mix(9200.,1880.,room)/z,3.,19.);
 float left=depth(at-vec2(px.x,0.)),right=depth(at+vec2(px.x,0.));
 float down=depth(at-vec2(0.,px.y)),top=depth(at+vec2(0.,px.y));
 vec2 slope=vec2(abs(right-z)<abs(z-left)?right-z:z-left,abs(top-z)<abs(z-down)?top-z:z-down);
 float shadow=0.,range=mix(24.,8.,room);
 for(int i=0;i<8;i++){
   float angle=float(i)*.785398;
   vec2 offset=vec2(cos(angle),sin(angle))*radius*(i%2==0?.58:1.);
   float dz=z+clamp(dot(slope,offset),-range,range)-depth(at+offset*px);
   shadow+=smoothstep(.2,range*.21,dz)*(1.-smoothstep(range*.54,range,dz));
 }
 return 1.-shadow*mix(.040,.063,room);
}
void main(){
 vec3 center=readAt(uv);
 float a=luma(readAt(uv+px*vec2(-1,-1))),b=luma(readAt(uv+px*vec2(1,-1)));
 float c=luma(readAt(uv+px*vec2(-1,1))),d=luma(readAt(uv+px*vec2(1,1)));
 float lo=min(luma(center),min(min(a,b),min(c,d))),hi=max(luma(center),max(max(a,b),max(c,d)));
 vec3 smoothColor=center;
 if(hi-lo>max(.037,hi*.13)){
 vec2 dir=vec2(-(a+b-c-d),a+c-b-d);
 dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+max((a+b+c+d)*.029,.008)),-6.,6.)*px;
 vec3 aa=.5*(readAt(uv-dir/6.)+readAt(uv+dir/6.));
 vec3 bb=.50*aa+.25*(readAt(uv-dir*.5)+readAt(uv+dir*.5));
 smoothColor=mix(center,(luma(bb)<lo||luma(bb)>hi)?aa:bb,mix(1.,.64,nativeCoverage));
 }
 vec3 bloom=texture(glow,uv).rgb;
 vec3 veil=haze(uv);
 vec4 surface=texture(image,uv);
 if(mirrorOn>0&&surface.a>.020){
   vec2 spread=mirrorTexel*vec2(1.42,2.06);
   vec3 reflected=texture(deckMirror,uv).rgb*.44;
   reflected+=(texture(deckMirror,uv+spread).rgb+texture(deckMirror,uv-spread).rgb
              +texture(deckMirror,uv+spread*vec2(1.,-1.)).rgb+texture(deckMirror,uv-spread*vec2(1.,-1.)).rgb)*.14;
   vec3 coating=min(reflected,vec3(1.55))*vec3(.66,.80,.96);
   surface.rgb=mix(surface.rgb,surface.rgb*.75+coating,surface.a*reflectionAmount);
 }
 if(shieldFieldOn>0){
   vec4 optical=texture(shieldField,uv);
   vec2 shift=round(clamp(optical.xy,vec2(-.006),vec2(.006))*65536.)/65536.;
   vec3 neighbor=texture(image,clamp(uv+shift,vec2(.0),vec2(1.))).rgb;
   float coverage=round(clamp(optical.a,0.,1.)*1024.)/1024.;
   surface.rgb=mix(surface.rgb,neighbor,min(.70,coverage*.89));
 }
 smoothColor+=grade(surface.rgb+veil)-center;
 smoothColor*=occlusion(uv); vec3 col=smoothColor+((1.-smoothColor)*grade(bloom*.29)*.65);
 float edges=1.-.23*pow(length((uv-.5)*vec2(1.16,1.13)),1.65);
 float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5;
 color=vec4(col*edges+grain*.009,1.);
}
`);
const hdr=!!gl.getExtension('EXT_color_buffer_float');
function target(w,h,depth){
  const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);
  const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texImage2D(gl.TEXTURE_2D,0,hdr?gl.RGBA16F:gl.RGBA8,w,h,0,gl.RGBA,hdr?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
  let z=null;
  if(depth) {
    z=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,z);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,z,0);
  }
  return {f,t,z,w,h};
}
function multisampleTarget(w,h){
  const color=hdr?gl.RGBA16F:gl.RGBA8;
  const counts=gl.getInternalformatParameter(gl.RENDERBUFFER,color,gl.SAMPLES);
  const depthCounts=gl.getInternalformatParameter(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,gl.SAMPLES);
  const budget=w*h<=2560*1080?4:2;
  const samples=Array.from(counts??[]).find(n=>n>1&&n<=budget&&depthCounts.includes(n));
  if(!samples)return null;
  const f=gl.createFramebuffer(), buffers=[gl.createRenderbuffer(),gl.createRenderbuffer()];
  gl.bindFramebuffer(gl.FRAMEBUFFER,f);
  for(const [i,format,attachment] of [[0,color,gl.COLOR_ATTACHMENT0],[1,gl.DEPTH_COMPONENT24,gl.DEPTH_ATTACHMENT]]){
    gl.bindRenderbuffer(gl.RENDERBUFFER,buffers[i]);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER,samples,format,w,h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,attachment,gl.RENDERBUFFER,buffers[i]);
  }
  const result={f,w,h,samples,buffers};
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE)return result;
  dropMultisample(result);
  return null;
}
function dropMultisample(o){
  if(!o)return;
  for(const b of o.buffers)gl.deleteRenderbuffer(b);
  gl.deleteFramebuffer(o.f);
}
let frameTarget,rasterTarget,bloomA,bloomB,volumeTarget,mirrorTarget,shieldTarget;
let deckPlane=-9999,reflectionAmount=0,effectsUploaded=false;
function resize(){
  const ratio=Math.min(devicePixelRatio,3840/Math.max(1,innerWidth),2160/Math.max(1,innerHeight));
  const w=Math.max(1,Math.round(innerWidth*ratio));
  const h=Math.max(1,Math.round(innerHeight*ratio));
  if(frameTarget&&canvas.width===w&&canvas.height===h)return;
  canvas.width=w;canvas.height=h;
  for(const o of [frameTarget,bloomA,bloomB,volumeTarget,mirrorTarget,shieldTarget]) if(o){gl.deleteFramebuffer(o.f);gl.deleteTexture(o.t);if(o.z)gl.deleteTexture(o.z);}
  dropMultisample(rasterTarget);
  frameTarget=target(w,h,true);
  rasterTarget=multisampleTarget(w,h);
  bloomA=target(Math.max(1,w>>2),Math.max(1,h>>2));
  bloomB=target(bloomA.w,bloomA.h);
  volumeTarget=target(Math.max(1,w>>2),Math.max(1,h>>2));
  mirrorTarget=target(Math.max(1,w>>1),Math.max(1,h>>1),true);
  shieldTarget=target(mirrorTarget.w,mirrorTarget.h);
}
function use(o){gl.useProgram(o.p);return o.u;}
function bind(o){gl.bindFramebuffer(gl.FRAMEBUFFER,o?o.f:null);gl.viewport(0,0,o?o.w:canvas.width,o?o.h:canvas.height);}
function full(){gl.bindVertexArray(screenVAO);gl.drawArrays(gl.TRIANGLES,0,3);}
function startScene(t,room,reflection=-9999,reflectStrength=1){
  deckPlane=reflection;reflectionAmount=reflectStrength;effectsUploaded=false;
  timeNow=t;interior=room;fx=[];shields=[];lights=[];windows=[];volumes=[];lamp=null;
  bind(rasterTarget??frameTarget);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.depthMask(true);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  const u=use(sky);gl.uniform3fv(u.dir,forward);gl.uniform3fv(u.rt,right);gl.uniform3fv(u.up,up);
  gl.uniform2f(u.lens,lens*canvas.width/canvas.height,lens);full();
  gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);
}
function pointLight(p,r,c,e=1){lights.push({p,r,c:scale(c,e)});}
function solids(){
  const u=use(solid);gl.uniform3fv(u.eye,eye);gl.uniformMatrix4fv(u.VP,false,viewProjection);
  gl.uniform1f(u.deckPlane,deckPlane);gl.uniform1f(u.mirrorPass,0);
  gl.uniform1f(u.inside,interior);gl.uniform1f(u.t,timeNow);
  gl.uniform3f(u.shieldSweep,0,0,0);
  const pos=new Float32Array(48),col=new Float32Array(36);
  lights.slice(0,12).forEach(({p,r,c},i)=>{pos.set([...p,r],i*4);col.set(c,i*3);});
  gl.uniform4fv(u.sources,pos);gl.uniform3fv(u.hues,col);
  gl.uniformMatrix4fv(u.sunVP,false,sunProjection);
  gl.uniform1i(u.shadowOn,castingShadows?1:0);
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,shadowTarget.t);gl.uniform1i(u.sunDepth,3);
  gl.uniformMatrix4fv(u.lampVP,false,lampProjection);
  gl.uniform4fv(u.lampSource,lamp?[...lamp.at,lamp.reach]:[0,0,0,0]);
  gl.uniform3fv(u.lampTint,lamp?.tint??[0,0,0]);
  gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,lampTarget.t);gl.uniform1i(u.lampDepth,5);
  gl.activeTexture(gl.TEXTURE0);
}
function drawEffects(vp,observer,across,vertical,clip=-9999){
  if(!fx.length)return;
  const u=use(effect);gl.uniformMatrix4fv(u.VP,false,vp);gl.uniform3fv(u.eye,observer);
  gl.uniform3fv(u.rt,across);gl.uniform3fv(u.up,vertical);gl.uniform1f(u.ticks,timeNow);
  gl.uniform1f(u.clipHeight,clip);gl.bindVertexArray(fxVAO);
  if(!effectsUploaded){
    gl.bindBuffer(gl.ARRAY_BUFFER,fxBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(fx),gl.DYNAMIC_DRAW);
    effectsUploaded=true;
  }
  gl.drawArraysInstanced(gl.TRIANGLES,0,6,fx.length/13);
}
function drawDeckReflection(list,outside){
  if(deckPlane<-9000||eye[1]<=deckPlane||reflectionAmount<=0)return;
  const flip=v=>[v[0],-v[1],v[2]];
  const observer=[eye[0],deckPlane*2-eye[1],eye[2]];
  const view=multiply(viewProjection,matrix([0,deckPlane*2,0],0,0,0,[1,-1,1]));
  bind(mirrorTarget);
  gl.depthMask(true);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  const backdrop=use(sky);
  gl.uniform3fv(backdrop.dir,flip(forward));gl.uniform3fv(backdrop.rt,flip(right));gl.uniform3fv(backdrop.up,flip(up));
  gl.uniform2f(backdrop.lens,lens*canvas.width/canvas.height,lens);full();
  gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.frontFace(gl.CW);
  const u=use(solid);
  gl.uniformMatrix4fv(u.VP,false,view);gl.uniform3fv(u.eye,observer);gl.uniform1f(u.mirrorPass,1);
  gl.uniform3f(u.shieldSweep,0,0,0);
  let grade=-1;
  for(const [model,m,local] of list)if(model.n){
    if(outside&&local!==1&&Math.hypot(m[12]-eye[0],m[13]-eye[1],m[14]-eye[2])>790)continue;
    const level=local??(outside?0:1);
    if(grade!==level){gl.uniform1f(u.inside,level);grade=level;}
    model.draw(m);
  }
  gl.uniform1f(u.mirrorPass,0);
  gl.frontFace(gl.CCW);gl.disable(gl.CULL_FACE);gl.depthMask(false);gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE,gl.ONE);drawEffects(view,observer,flip(right),flip(up),deckPlane);
  gl.disable(gl.BLEND);gl.depthMask(true);gl.enable(gl.CULL_FACE);
  bind(rasterTarget??frameTarget);
}
function drawShields(optical){
  if(!shields.length)return;
  const u=use(skin);
  gl.uniformMatrix4fv(u.VP,false,viewProjection);gl.uniform3fv(u.eye,eye);
  gl.uniform3fv(u.right,right);gl.uniform3fv(u.up,up);gl.uniform1f(u.t,timeNow);
  gl.uniform1i(u.optical,optical?1:0);gl.uniform2f(u.fieldSize,shieldTarget.w,shieldTarget.h);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,optical?frameTarget.z:null);
  gl.uniform1i(u.sceneDepth,2);gl.activeTexture(gl.TEXTURE0);
  gl.bindVertexArray(skinVAO);
  for(const {pose,axes,phase,strength,strike} of shields){
    const expand=mix(.92,1.,smooth(0,1,phase));
    gl.uniformMatrix4fv(u.M,false,multiply(pose,matrix([0,0,0],0,0,0,scale(axes,expand))));
    gl.uniform3fv(u.axes,axes);gl.uniform1f(u.phase,phase);
    gl.uniform1f(u.strength,strength);gl.uniform1f(u.strike,strike);
    gl.drawArrays(gl.TRIANGLES,0,sphere.length/3);
  }
}
function resolveScene(){
  if(!rasterTarget)return;
  const {w,h}=frameTarget;
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,rasterTarget.f);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,frameTarget.f);
  gl.blitFramebuffer(0,0,w,h,0,0,w,h,gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT,gl.NEAREST);
}
function finishScene(){
  if(windows.length){
    const u=use(lensGlass);
    gl.uniformMatrix4fv(u.VP,false,viewProjection);gl.uniform3fv(u.eye,eye);
    gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ZERO,gl.ONE);
    for(const [model,m] of windows)model.draw(m,u.M);
  }
  gl.disable(gl.CULL_FACE);gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
  drawEffects(viewProjection,eye,right,up);
  drawShields(false);
  resolveScene();
  if(hdr&&shields.length){
    bind(shieldTarget);gl.disable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT);drawShields(true);
  }
  gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.depthMask(true);
  drawVolumes();
  const u=use(blur);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(u.image,0);
  bind(bloomA);gl.bindTexture(gl.TEXTURE_2D,frameTarget.t);
  gl.uniform2f(u.stride,1.07/bloomA.w,0);gl.uniform1f(u.first,1);full();
  bind(bloomB);gl.bindTexture(gl.TEXTURE_2D,bloomA.t);
  gl.uniform2f(u.stride,0,1.12/bloomA.h);gl.uniform1f(u.first,0);full();
  bind(null);const v=use(composite);gl.uniform1i(v.image,0);gl.uniform1i(v.glow,1);gl.uniform1f(v.nativeCoverage,rasterTarget?1:0);
  gl.bindTexture(gl.TEXTURE_2D,frameTarget.t);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,bloomB.t);
  gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,volumeTarget.t);gl.uniform1i(v.volumeMap,4);
  gl.uniform1i(v.volumeOn,volumes.length>0?1:0);gl.uniform2f(v.volumeDimensions,volumeTarget.w,volumeTarget.h);
  gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,mirrorTarget.t);gl.uniform1i(v.deckMirror,6);
  gl.uniform1i(v.mirrorOn,deckPlane>-9000&&eye[1]>deckPlane&&reflectionAmount>0?1:0);
  gl.uniform2f(v.mirrorTexel,1/mirrorTarget.w,1/mirrorTarget.h);gl.uniform1f(v.reflectionAmount,reflectionAmount);
  gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,shieldTarget.t);gl.uniform1i(v.shieldField,7);
  gl.uniform1i(v.shieldFieldOn,hdr&&shields.length>0?1:0);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,frameTarget.z);gl.uniform1i(v.depthMap,2);gl.uniform1f(v.room,interior);gl.uniform2f(v.px,1/canvas.width,1/canvas.height);full();gl.activeTexture(gl.TEXTURE0);
}




























