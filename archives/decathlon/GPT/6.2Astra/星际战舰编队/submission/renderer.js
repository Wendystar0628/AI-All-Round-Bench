"use strict";
const cv=document.getElementById('space'),gl=cv.getContext('webgl2',{alpha:false,antialias:true,preserveDrawingBuffer:true});
gl.disable(gl.DITHER);
const TAU=Math.PI*2, clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t,sm=(a,b,v)=>{let q=clamp((v-a)/(b-a));return q*q*(3-2*q)},vp=(a,b,t)=>a.map((n,i)=>mix(n,b[i],t)),add=(a,b)=>a.map((n,i)=>n+b[i]),sub=(a,b)=>a.map((n,i)=>n-b[i]),mul=(a,s)=>a.map(n=>n*s),dot=(a,b)=>a.reduce((v,n,i)=>v+n*b[i],0),unit=a=>mul(a,1/(Math.hypot(...a)||1)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
let seed=710321;function rnd(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
const colors={};function rgb(c){return colors[c]||(colors[c]=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255))}
function program(v,f){let p=gl.createProgram();for(const [type,src] of [[gl.VERTEX_SHADER,v],[gl.FRAGMENT_SHADER,f]]){let s=gl.createShader(type);gl.shaderSource(s,'#version 300 es\nprecision highp float;\n'+src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s)}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p}
const camDef='uniform vec3 eye,rt,up,fw;uniform vec2 lens;uniform float tm;vec4 proj(vec3 w){vec3 d=w-eye;float z=dot(d,fw);return vec4(dot(d,rt)*lens.x,dot(d,up)*lens.y,z*1.00004-0.8,z);}';
let eye,rt,up,fw,lens,tm=0,inside=0,lightPos=[0,0,0],power=0,localLight=[.1,.78,.9],current;
function camera(e,t,fov=44,roll=0){eye=e;fw=unit(sub(t,e));rt=unit(cross(fw,[0,1,0]));up=cross(rt,fw);rt=add(mul(rt,Math.cos(roll)),mul(up,Math.sin(roll)));up=cross(rt,fw);let k=1/Math.tan(fov*Math.PI/360);lens=[k*cv.height/cv.width,k]}
const locs=new Map();function loc(k){let d=locs.get(current);if(!d){d={};locs.set(current,d)}if(!(k in d))d[k]=gl.getUniformLocation(current,k);return d[k]}function vec(k,a){gl.uniform3fv(loc(k),a)}function fl(k,a){gl.uniform1f(loc(k),a)}
function use(p){gl.useProgram(p);current=p;vec('eye',eye);vec('fw',fw);vec('rt',rt);vec('up',up);gl.uniform2fv(loc('lens'),lens);fl('tm',tm)}
const boxP=program(camDef+`
layout(location=0) in vec3 corner;layout(location=1) in vec3 norm;layout(location=2) in vec3 center;layout(location=3) in vec3 size;layout(location=4) in vec4 ink;
uniform vec3 off,angles;uniform float rockRadius;out vec3 w,n,local,rad,obj;flat out vec3 face;flat out vec4 paint;
vec3 rotate3(vec3 v){vec3 c=cos(angles),s=sin(angles);v.yz=mat2(c.x,s.x,-s.x,c.x)*v.yz;v.xz=mat2(c.y,s.y,-s.y,c.y)*v.xz;v.xy=mat2(c.z,s.z,-s.z,c.z)*v.xy;return v;}
void main(){face=norm;local=corner*size;rad=size*.5;obj=center+local;w=off+rotate3(obj);n=rotate3(rockRadius>0.?normalize(norm*.82+normalize(obj+.001)*.30):norm);paint=ink;gl_Position=proj(w);}`,`
in vec3 w,n,local,rad,obj;flat in vec3 face;flat in vec4 paint;out vec4 frag;uniform vec3 eye,lp,lc;uniform float interior,powr,tm,shadowRange;uniform highp sampler2DShadow shadowTex;
uniform highp sampler3D occupied;uniform vec3 occOrigin,occScale;uniform float occCell,zone,shieldTime,hullSpan,holographic,fractureAge,rockRadius,shipClass,firing,throttle;
float density(vec3 p,float lod){return textureLod(occupied,(p-occOrigin)*occScale,lod).r;}
float ambientAccess(){
 if(occCell<.1)return 1.;
 vec3 side=abs(face.x)>.5?vec3(0,1,0):vec3(1,0,0),other=cross(face,side);
 vec3 p=obj+face*occCell*.78;float total=0.;
 for(int i=0;i<3;i++){
  float span=exp2(float(i))*occCell*1.35;
  vec3 h=p+face*span*.5,dx=span*side,dy=span*other;
  total+=(density(h+dx,float(i))+density(h-dx,float(i))+density(h+dy,float(i))+density(h-dy,float(i)))*.0833;
 }
 return exp(-total*2.75);
}
vec3 fixture(vec3 p,vec3 N,vec3 color,float radius){
 vec3 d=p-w;return color*(.19+.81*max(0.,dot(N,normalize(d+.001))))/(1.+dot(d,d)/(radius*radius));
}
void main(){vec3 N=normalize(n),V=normalize(eye-w),L=normalize(vec3(-.56,.76,.36));float sun=max(0.,dot(N,L));vec3 toL=lp-w;float il=powr/(1.+dot(toL,toL));float glow=clamp(il,0.,2.)*(.32+.68*max(0.,dot(N,normalize(toL+.001))));
float shadow=1.;if(shadowRange>0.){vec3 bx=normalize(cross(vec3(0,1,0),L)),by=cross(L,bx);vec3 sc=vec3(dot(obj,bx),dot(obj,by),-dot(obj,L))/shadowRange*.5+.5;sc.z-=(.00043+.0011*(1.-sun));vec2 texel=1./vec2(textureSize(shadowTex,0));shadow=0.;for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++)shadow+=texture(shadowTex,sc+vec3(vec2(i,j)*texel,0.))/9.;}
float access=ambientAccess();sun*=.12+.88*shadow;
vec3 base=paint.rgb;float metal=smoothstep(.05,.78,dot(base,vec3(.23,.58,.19)));
vec3 hemi=mix(vec3(.25,.33,.42),vec3(.46,.54,.61),N.y*.5+.5);
vec3 col=base*(hemi*access+sun*vec3(.89,.76,.57)*mix(.72,1.,access))*mix(1.,.55,interior);
float spec=max(dot(normalize(V+L),N),0.);col+=(pow(spec,12.)*.12+pow(spec,72.)*.21)*shadow*access*(.22+metal)*(rockRadius>0.?.12:1.);
vec3 d=rad-abs(local);float edge=max(min(d.x,d.y),max(min(d.x,d.z),min(d.y,d.z)));
col+=.052*(1.-smoothstep(0.,max(.45,fwidth(edge)),edge))*(.25+base)*access;
vec3 bounce=vec3(0.);
if(zone==1.){
 vec3 u=w-vec3(-49,-27,0);float bay=152.-44.*floor((152.-u.z)/44.+.5);
 bounce+=fixture(vec3(-49.+sign(u.x)*56.,2.,bay),N,vec3(.13,.65,.81),18.);
 bounce+=fixture(vec3(-49.+sign(u.x)*20.,19.,bay+17.),N,vec3(.92,.66,.34),14.);
}else if(zone==2.){
 bounce+=fixture(vec3(0,28,-8),N,vec3(.14,.85,1.),21.);
 bounce+=fixture(vec3(sign(w.x)*52.,37.,floor(w.z/24.+.5)*24.),N,vec3(.16,.6,.72),15.);
}else if(zone==3.){
 bounce+=fixture(vec3(0,clamp(w.y,12.,240.),0),N,vec3(1.,.54,.17),53.)*(.9+.12*sin(tm*2.5-w.y*.032));
}else if(zone==4.){
 float chamber=152.-28.*floor((152.-w.z)/28.+.5);
 bounce+=fixture(vec3(sign(w.x)*30.,31.,chamber),N,vec3(1.,.56,.22),15.)*(.8+.2*cos(tm*3.+chamber*.05));
}
if(shipClass>0.){
 float tail=shipClass>2.5?-489.:-80.;
 vec3 delta=obj-vec3(tail,0.,obj.z);
 float extent=shipClass>2.5?32.:11.;
 float exhaust=exp(-abs(delta.x)/(extent*.88)-abs(delta.y)/(extent*1.16));
 bounce+=vec3(.035,.35,.49)*exhaust*(.70+1.18*throttle);
 if(shipClass>2.5){
  float j=clamp(floor((obj.x+347.)/91.+.5),0.,3.);
  float seq=tm-54.1-j*.14,flash=step(0.,seq)*(1.-step(2.59,seq))*exp(-mod(seq,.47)*17.);
  vec3 muzzle=vec3(-347.+j*91.,45.,133.-j*3.);
  bounce+=vec3(.11,.68,1.)*flash/(1.+dot(obj-muzzle,obj-muzzle)/320.);
 }else if(firing>.5&&shipClass<1.5){
  float seq=tm-57.15,flash=step(0.,seq)*(1.-step(2.69,seq))*exp(-mod(seq,.098)*27.);
  vec3 gun=obj-vec3(6.,21.,28.);bounce+=vec3(1.,.68,.26)*flash/(1.+dot(gun,gun)/54.);
 }else if(firing>.5){
  float seq=tm-58.8,j=clamp(floor(seq/.35),0.,5.);
  vec3 rack=obj-vec3(-42.+j*14.,19.,50.-j*2.5);
  float flash=step(0.,seq)*(1.-step(2.05,seq))*exp(-mod(seq,.35)*13.);
  bounce+=vec3(.98,.43,.15)*flash/(1.+dot(rack,rack)/68.);
 }
}
col+=(lc*glow*mix(1.,.43,interior)+bounce)*(.18+base)*(.4+.6*access);
if(hullSpan>0.&&shieldTime>0.){
 float sweep=exp(-pow((obj.x/hullSpan+1.-shieldTime*.92)*3.4,2.));
 col+=vec3(.04,.29,.38)*(.25+base)*sweep*access;
}
col+=base*max(0.,paint.a)*(.955+.045*sin(tm*2.+w.x*.015));
if(rockRadius>0.&&paint.a<0.&&fractureAge>=0.){
 float distance=length(obj/rockRadius-vec3(-.81,.04,.31));
 float wave=smoothstep(distance*.41,distance*.41+.21,fractureAge);
 float heat=wave*exp(-max(0.,fractureAge-distance*.41-.20)*.98);
 col+=vec3(1.,.29,.048)*heat*(.94+.15*cos(obj.y*.16+obj.z*.24));
}
float fog=smoothstep(1100.,6200.,length(eye-w));if(holographic>.5){
 if(dot(N,V)<0.)discard;
 float scan=pow(.5+.5*cos(obj.y*2.5+obj.z*.24-tm*3.),12.);
 float rim=1.-smoothstep(.08,.68,edge);
 frag=vec4(mix(vec3(.11,.48,.57),vec3(.64,1.,.96),rim*.74+scan*.19)+base*.13,.41+.50*rim);
}else frag=vec4(mix(col,vec3(.16,.23,.32),fog*.68),1.);}`);
let cube=[];for(let k=0;k<3;k++)for(let s of [-1,1])for(let [u,v] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]]){let p=[0,0,0],n=[0,0,0];p[k]=s*.5;p[(k+1)%3]=u*.5;p[(k+2)%3]=v*.5;n[k]=s;cube.push(...p,...n)}
function buffer(data){let b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);return b}const cb=buffer(cube);
function attr(i,n,stride,offset,div=0){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,n,gl.FLOAT,false,stride*4,offset*4);gl.vertexAttribDivisor(i,div)}
// Fractional occupancy of the actual merged voxels. Filtered levels supply soft contact
// shading at several distances without adding noisy samples to the image.
function occupancyTexture(dim,data){
 const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,tex);
 const levels=1+Math.floor(Math.log2(Math.max(...dim)));
 gl.texStorage3D(gl.TEXTURE_3D,levels,gl.R8,...dim);
 gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
 gl.texSubImage3D(gl.TEXTURE_3D,0,0,0,0,...dim,gl.RED,gl.UNSIGNED_BYTE,data);
 gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
 gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 for(let key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,key,gl.CLAMP_TO_EDGE);
 gl.generateMipmap(gl.TEXTURE_3D);return tex
}
const emptyVolume=occupancyTexture([1,1,1],new Uint8Array(1));
function makeOccupancy(a,cell){
 let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<a.length;i+=10)for(let j=0;j<3;j++){min[j]=Math.min(min[j],a[i+j]-a[i+j+3]/2);max[j]=Math.max(max[j],a[i+j]+a[i+j+3]/2)}
 const origin=min.map(n=>(Math.floor(n/cell)-3)*cell),dim=max.map((n,j)=>Math.ceil((n-origin[j])/cell)+4),data=new Uint8Array(dim[0]*dim[1]*dim[2]);
 for(let i=0;i<a.length;i+=10){
  let lo=[],hi=[];for(let j=0;j<3;j++){lo[j]=(a[i+j]-a[i+j+3]/2-origin[j])/cell;hi[j]=lo[j]+a[i+j+3]/cell}
  for(let z=Math.floor(lo[2]);z<hi[2];z++)for(let y=Math.floor(lo[1]);y<hi[1];y++)for(let x=Math.floor(lo[0]);x<hi[0];x++){
   let coverage=(Math.min(x+1,hi[0])-Math.max(x,lo[0]))*(Math.min(y+1,hi[1])-Math.max(y,lo[1]))*(Math.min(z+1,hi[2])-Math.max(z,lo[2]));
   let idx=x+dim[0]*(y+dim[1]*z);data[idx]=Math.min(255,data[idx]+Math.round(coverage*255));
  }
 }
 return {texture:occupancyTexture(dim,data),origin,scale:dim.map(n=>1/(cell*n)),cell}
}
class Model{constructor(){this.a=[]}box(x,y,z,l,h,w,c,e=0){l=Math.max(1,Math.round(l));h=Math.max(1,Math.round(h));w=Math.max(1,Math.round(w));this.a.push(Math.round(x-l/2)+l/2,Math.round(y-h/2)+h/2,Math.round(z-w/2)+w/2,l,h,w,...rgb(c),e)}bake(cell=0){if(cell)this.volume=makeOccupancy(this.a,cell);this.count=this.a.length/10;this.va=gl.createVertexArray();gl.bindVertexArray(this.va);gl.bindBuffer(gl.ARRAY_BUFFER,cb);attr(0,3,6,0);attr(1,3,6,3);buffer(this.a);attr(2,3,10,0,1);attr(3,3,10,3,1);attr(4,4,10,6,1);gl.bindVertexArray(null);delete this.a;return this}}
const zero=[0,0,0];function solids(){use(boxP);fl('interior',inside);fl('zone',inside?(tm<29.8||tm>=49?1:tm<36.3?2:tm<43.6?3:4):0);vec('lp',lightPos);vec('lc',localLight);fl('powr',power)}
function draw(m,p=zero,r=zero,shieldTime=-1,fractureAge=-1,activeMount=false){
 gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_3D,m.volume?.texture||emptyVolume);gl.uniform1i(loc('occupied'),5);
 fl('occCell',m.volume?.cell||0);if(m.volume){vec('occOrigin',m.volume.origin);vec('occScale',m.volume.scale)}
 fl('shipClass',m.shipClass||0);fl('firing',activeMount?1:0);fl('throttle',boost);fl('fractureAge',fractureAge);fl('rockRadius',m.radius||0);fl('shieldTime',shieldTime);fl('hullSpan',m.srange||0);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,m.shadow||blankShadow);gl.uniform1i(loc('shadowTex'),3);fl('shadowRange',m.shadow?m.srange:0);vec('off',p);vec('angles',r);gl.bindVertexArray(m.va);gl.drawArraysInstanced(gl.TRIANGLES,0,36,m.count)}
const screenV='out vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,.99999,1.);}';
const skyP=program(screenV,`in vec2 uv;out vec4 frag;uniform vec3 rt,up,fw;uniform vec2 lens;
float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fb(vec2 p){float a=.52,n=0.;for(int i=0;i<5;i++){n+=a*noise(p);p=mat2(1.7,.99,-.99,1.7)*p+9.;a*=.5;}return n;}
void main(){vec2 xy=(uv*2.-1.)/lens;vec3 dir=normalize(fw+xy.x*rt+xy.y*up);vec2 p=vec2(atan(dir.x,-dir.z),asin(dir.y));float cloud=fb(p*4.8+5.);float filament=fb(p*9.+cloud*5.);float band=exp(-pow((p.y+.13+.22*sin(p.x*2.3)+.13*(cloud-.5))*3.6,2.));vec3 col=vec3(.017,.029,.061)+cloud*vec3(.039,.056,.096)+band*(vec3(.055,.095,.13)*cloud+vec3(.12,.13,.16)*filament*filament);col+=vec3(.07,.045,.075)*smoothstep(.52,.78,cloud);
float galaxy=p.y+.33-.26*sin(p.x*1.47)-.18*(cloud-.5);float wisps=exp(-abs(galaxy)*12.)*smoothstep(.26,.69,filament);float curls=fb(vec2(p.x*4.8,p.y*16.)+vec2(filament*2.2,cloud*.85));
float ridge=galaxy+(curls-.5)*.27;
float mist=exp(-abs(ridge)*12.)*smoothstep(.27,.73,curls+filament*.21);
col+=vec3(.068,.135,.16)*mist+vec3(.21,.126,.087)*wisps*pow(cloud,1.4)+vec3(.023,.042,.058)*exp(-abs(ridge+.09)*7.);
col*=1.-.32*exp(-abs(ridge-.045)*24.)*smoothstep(.43,.70,curls);
for(int i=0;i<3;i++){float sc=155.+float(i)*160.;vec2 v=p*sc,id=floor(v);float h=hash(id+float(i)*74.);vec2 d=fract(v)-vec2(.2+.6*hash(id+3.),.2+.6*hash(id-5.));float dist=length(d);float sz=.035+.066*hash(id+1.);float aa=max(.02,min(.21,length(fwidth(v))*.4));col+=step(.913+float(i)*.025,h)*mix(vec3(.57,.79,1.),vec3(1.,.82,.55),hash(id+7.))*(1.-smoothstep(0.,sz+aa,dist))*(.28+.61*h)*(1.-.18*float(i));}
vec3 pc=normalize(vec3(-.53,-.27,-.975))*10.9;float b=dot(dir,pc),dd=dot(pc,pc)-b*b,R=1.18;vec3 rn=normalize(vec3(-.24,.94,.25));float tp=dot(pc,rn)/dot(dir,rn);vec3 q=dir*tp-pc;float rr=length(q)/R;float rings=smoothstep(1.24,1.31,rr)*(1.-smoothstep(1.94,2.03,rr))*(.48+.52*noise(vec2(rr*155.,1.)))*(1.-.8*exp(-pow((rr-1.71)*86.,2.)));float ts=b-sqrt(max(0.,R*R-dd));bool planet=b>0.&&dd<R*R;
if(planet){vec3 n=normalize(dir*ts-pc);float lat=dot(n,rn);float sw=fb(n.xy*4.+n.z*2.);float belt=lat*21.+sw*2.8+fb(n.xz*14.)*.33;float stripes=noise(vec2(belt,1.))*.67+.22*noise(vec2(belt*4.9,sw*3.))+.11*noise(vec2(belt*17.,sw*6.));float light=max(dot(n,normalize(vec3(-.56,.76,.36))),0.);vec3 surf=mix(vec3(.33,.29,.31),vec3(.76,.65,.52),stripes*.73+sw*.27);vec3 source=normalize(vec3(-.56,.76,.36));float ringT=-dot(n*R,rn)/dot(source,rn);
 float rrSun=length(n*R+ringT*source)/R;
 if(ringT>0.)light*=1.-.39*smoothstep(1.24,1.36,rrSun)*(1.-smoothstep(1.90,2.04,rrSun));
 float rim=pow(1.-max(0.,dot(n,-dir)),3.);col=surf*(.135+light*.88)+vec3(.10,.14,.19)*rim+.022;}
if(tp>0.&&(!planet||tp<ts)){vec3 sun=normalize(vec3(-.56,.76,.36));float nd=dot(q,sun);float shadow=nd<0.?smoothstep(.92,1.10,length(q-sun*nd)/R):1.;col=mix(col,vec3(.69,.65,.60)*(.65+.35*noise(vec2(rr*48.,3.)))*(.21+.79*shadow),rings*.62);}if(!planet&&b>0.)col+=vec3(.32,.39,.47)*exp(-max(0.,sqrt(max(dd,0.))-R)*240.);
frag=vec4(col*(1.-.13*dot(uv-.5,uv-.5)),1.);}`);
const empty=gl.createVertexArray();function sky(){gl.bindVertexArray(empty);gl.disable(gl.DEPTH_TEST);use(skyP);gl.drawArrays(gl.TRIANGLES,0,3);gl.enable(gl.DEPTH_TEST);gl.clear(gl.DEPTH_BUFFER_BIT)}
// Additive camera-facing energy ribbons. Width and intensity taper independently.
const rayP=program(camDef+`layout(location=0) in vec3 start;layout(location=1) in vec3 finish;layout(location=2) in vec4 widths;layout(location=3) in vec3 color;out vec2 st;out vec3 tint;flat out float mode;
void main(){float x=float((gl_VertexID==1||gl_VertexID==2||gl_VertexID==4)?1:0);float y=float((gl_VertexID==2||gl_VertexID==4||gl_VertexID==5)?1:-1);vec3 mid=mix(start,finish,x);vec3 dir=normalize(finish-start);vec3 side=normalize(cross(dir,normalize(eye-mid))+.000001);gl_Position=proj(mid+side*y*mix(widths.x,widths.y,x));st=vec2(x,y);tint=color*widths.z;mode=widths.w;}`,`in vec2 st;in vec3 tint;flat in float mode;out vec4 frag;void main(){float d=abs(st.y);float val=exp(-3.6*d*d)*(1.-smoothstep(.65,1.,d));if(mode>2.5){float r=length(vec2(st.x*2.-1.,st.y));val=exp(-4.5*r*r)*(1.-smoothstep(.72,1.,r));}else if(mode>.5&&mode<1.5)val*=pow(1.-st.x,1.7);else if(mode<.5)val*=smoothstep(0.,.045,st.x)*(1.-smoothstep(.94,1.,st.x));frag=vec4(tint*val,1.);}`);
let rays=[];function ray(a,b,w,v,c,str=1,mode=0){rays.push(...a,...b,w,v,str,mode,...rgb(c))}
function flare(p,s,c,k=1){ray(add(p,mul(rt,-s)),add(p,mul(rt,s)),s,s,c,k,3);ray(add(p,mul(rt,-s*2.5)),add(p,mul(rt,s*2.5)),s*.045,s*.045,c,k*.6,3)}
const rb=gl.createBuffer(),rv=gl.createVertexArray();gl.bindVertexArray(rv);gl.bindBuffer(gl.ARRAY_BUFFER,rb);attr(0,3,13,0,1);attr(1,3,13,3,1);attr(2,4,13,6,1);attr(3,3,13,10,1);
function energies(){if(!rays.length)return;use(rayP);gl.bindVertexArray(rv);gl.bindBuffer(gl.ARRAY_BUFFER,rb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(rays),gl.DYNAMIC_DRAW);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.depthMask(false);gl.drawArraysInstanced(gl.TRIANGLES,0,6,rays.length/13);gl.depthMask(true);gl.disable(gl.BLEND);rays=[]}
const cloudP=program(camDef+`
layout(location=0)in vec3 pos;layout(location=1)in vec2 ball;layout(location=2)in vec4 ink;
out vec2 st;out vec4 tint;flat out float seed;
void main(){
 const vec2 corners[6]=vec2[6](vec2(-1,-1),vec2(1,-1),vec2(1,1),vec2(-1,-1),vec2(1,1),vec2(-1,1));
 st=corners[gl_VertexID];seed=ball.y;tint=ink;gl_Position=proj(pos+(st.x*rt+st.y*up)*ball.x);
}`,`in vec2 st;in vec4 tint;flat in float seed;out vec4 frag;
float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float noise(vec2 p){vec2 i=floor(p),v=fract(p);v=v*v*(3.-2.*v);return mix(mix(hash(i),hash(i+vec2(1,0)),v.x),mix(hash(i+vec2(0,1)),hash(i+1.),v.x),v.y);}
void main(){float n=noise(st*2.35+seed)*.64+noise(st*5.8+seed)*.26+noise(st*13.+seed)*.1;
 float d=length(st)+(.47-n)*.65;float a=(1.-smoothstep(.16,1.,d))*(.32+.68*n)*tint.a;
 frag=vec4(tint.rgb*(.71+.45*n),a);}
`);
let clouds=[];const cloudBuffer=gl.createBuffer(),cloudVA=gl.createVertexArray();
gl.bindVertexArray(cloudVA);gl.bindBuffer(gl.ARRAY_BUFFER,cloudBuffer);attr(0,3,9,0,1);attr(1,2,9,3,1);attr(2,4,9,5,1);
function dustCloud(p,r,seed,color,opacity){if(opacity>.001)clouds.push([...p,r,seed,...color,opacity])}
function drawClouds(){
 if(!clouds.length)return;
 clouds.sort((a,b)=>(b[0]-a[0])*fw[0]+(b[1]-a[1])*fw[1]+(b[2]-a[2])*fw[2]);use(cloudP);gl.bindVertexArray(cloudVA);gl.bindBuffer(gl.ARRAY_BUFFER,cloudBuffer);
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(clouds.flat()),gl.DYNAMIC_DRAW);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 gl.drawArraysInstanced(gl.TRIANGLES,0,6,clouds.length);gl.depthMask(true);gl.disable(gl.BLEND);clouds=[];
}
const shieldP=program(camDef+`layout(location=0) in vec3 p;uniform vec3 origin,radii;out vec3 n,v,l;void main(){vec3 q=sign(p)*pow(abs(p),vec3(.64));float taper=1.-.19*smoothstep(-.35,.95,q.x);vec3 axis=radii*vec3(1.,1.,taper);vec3 w=origin+q*axis;n=normalize(sign(q)*pow(abs(q),vec3(2.13))/axis);v=eye-w;l=p;gl_Position=proj(w);}`,`in vec3 n,v,l;uniform float amp,phase;out vec4 frag;
void main(){
 float rim=pow(1.-abs(dot(normalize(n),normalize(v))),2.9);
 float wave=exp(-pow((l.x+1.-phase*.92)*5.4,2.)),az=atan(l.y,l.z);
 float fil=pow(.5+.5*cos(az*14.+l.x*3.-phase*.37),45.);
 float rib=pow(.5+.5*cos(l.x*42.+sin(az*2.)*.32),72.);
 float echo=pow(.5+.5*cos(l.x*14.-phase*2.2),13.);
 float seam=(fil*.45+rib*.84)*(.09+wave*.63+rim*.28);
 vec3 hue=mix(vec3(.11,.54,.77),vec3(.39,.99,.89),wave);
 frag=vec4(hue*amp*(.012+.81*rim+.044*echo+wave*.21+seam),1.);
}`);
let sphere=[];function sph(a,b){return [Math.cos(a)*Math.cos(b),Math.sin(b),Math.sin(a)*Math.cos(b)]}for(let i=0;i<72;i++)for(let j=0;j<32;j++)for(let [u,v] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]])sphere.push(...sph((i+u)*TAU/72,(j+v)*Math.PI/32-Math.PI/2));
const sv=gl.createVertexArray();gl.bindVertexArray(sv);buffer(sphere);attr(0,3,3,0);gl.bindVertexArray(null);
function shield(p,scale,phase,amp){vec('origin',p);vec('radii',scale);fl('phase',phase);fl('amp',amp);gl.drawArrays(gl.TRIANGLES,0,sphere.length/3)}
function depthMap(size,compare){let tx=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tx);gl.texStorage2D(gl.TEXTURE_2D,1,gl.DEPTH_COMPONENT24,size,size);for(let [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_COMPARE_MODE,compare?gl.COMPARE_REF_TO_TEXTURE:gl.NONE]])gl.texParameteri(gl.TEXTURE_2D,k,v);return tx}
const blankShadow=depthMap(1,true),shadowP=program(`layout(location=0) in vec3 corner;layout(location=2) in vec3 center;layout(location=3) in vec3 size;uniform float range;void main(){vec3 p=center+corner*size,L=normalize(vec3(-.56,.76,.36)),x=normalize(cross(vec3(0,1,0),L)),y=cross(L,x);gl_Position=vec4(vec3(dot(p,x),dot(p,y),-dot(p,L))/range,1.);}`,`void main(){}`);
function bakeShadow(m,size,range){let fb=gl.createFramebuffer();m.shadow=depthMap(size,true);m.srange=range;gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,m.shadow,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);gl.viewport(0,0,size,size);gl.clear(gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.useProgram(shadowP);gl.uniform1f(gl.getUniformLocation(shadowP,'range'),range);gl.bindVertexArray(m.va);gl.drawArraysInstanced(gl.TRIANGLES,0,36,m.count);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(fb)}
// Resolve multisampled geometry, then gather contact shade and optical bloom.
const postP=program(screenV,`in vec2 uv;out vec4 frag;uniform highp sampler2D surface,depth,halo,shieldLayer;uniform float hasShield;uniform vec2 pixels;uniform float internal;
float getZ(vec2 v){return .4/(1.00002-texture(depth,v).r);}
void main(){vec3 c=texture(surface,uv).rgb;float z=getZ(uv),oc=0.;if(z<2900.){float scale=internal>.5?4.:17.;vec2 radius=vec2(pixels.x/pixels.y,1.)*min(.045,scale/max(z,8.));for(int i=0;i<12;i++){float a=float(i)*2.39996;vec2 d=vec2(cos(a),sin(a))*radius*sqrt((float(i)+.8)/12.);float l=z-getZ(uv+d),r=z-getZ(uv-d);oc+=smoothstep(scale*.014,scale*.15,min(l,r))*(1.-smoothstep(scale*.21,scale*2.2,max(l,r)));oc+=.42*smoothstep(scale*.1,scale*.47,l)*(1.-smoothstep(scale*.52,scale*2.1,l));}}
c*=1.-min(.47,oc/12.);vec3 b=texture(halo,uv).rgb;c+=b*.44;if(hasShield>.5)c+=texture(shieldLayer,uv).rgb;c=c/(1.+max(c-.82,vec3(0.))*.83);float vignette=smoothstep(.12,.78,length((uv-.5)*vec2(.88,1.)));c*=1.-vignette*.14;frag=vec4(c,1.);}`);
const bloomP=program(screenV,`in vec2 uv;out vec4 frag;uniform sampler2D src;uniform vec2 dir;uniform float first;void main(){vec3 sum=vec3(0.);float wsum=0.;for(int i=-7;i<=7;i++){float w=exp(-float(i*i)/20.);vec3 c=texture(src,uv+dir*float(i)).rgb;if(first>.5)c*=smoothstep(.64,1.,max(c.r,max(c.g,c.b)))*smoothstep(.15,.55,max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b)));sum+=w*c;wsum+=w;}frag=vec4(sum/wsum,1.);}`);
let shieldFb,shieldTex,filmBuffer,fbSize='',filmTex,zTex,msFb,msBuf=[],bloomF=[],bloomT=[];
function surface(w,h,depth=false){let tx=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tx);gl.texStorage2D(gl.TEXTURE_2D,1,depth?gl.DEPTH_COMPONENT24:gl.RGBA8,w,h);for(let [k,v] of [[gl.TEXTURE_MIN_FILTER,depth?gl.NEAREST:gl.LINEAR],[gl.TEXTURE_MAG_FILTER,depth?gl.NEAREST:gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);return tx}
function attach(f,k,t){gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,k,gl.TEXTURE_2D,t,0)}
function lensStart(w,h){if(fbSize!==w+'x'+h){if(msFb){[msFb,filmBuffer,shieldFb,...bloomF].forEach(f=>gl.deleteFramebuffer(f));[filmTex,zTex,shieldTex,...bloomT].forEach(t=>gl.deleteTexture(t));msBuf.forEach(b=>gl.deleteRenderbuffer(b))}fbSize=w+'x'+h;msFb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,msFb);msBuf=[];for(let [fmt,att] of [[gl.RGBA8,gl.COLOR_ATTACHMENT0],[gl.DEPTH_COMPONENT24,gl.DEPTH_ATTACHMENT]]){let buf=gl.createRenderbuffer();msBuf.push(buf);gl.bindRenderbuffer(gl.RENDERBUFFER,buf);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,Math.min(4,gl.getParameter(gl.MAX_SAMPLES)),fmt,w,h);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,att,gl.RENDERBUFFER,buf)}
filmBuffer=gl.createFramebuffer();filmTex=surface(w,h);zTex=surface(w,h,true);attach(filmBuffer,gl.COLOR_ATTACHMENT0,filmTex);attach(filmBuffer,gl.DEPTH_ATTACHMENT,zTex);shieldFb=gl.createFramebuffer();shieldTex=surface(w,h);attach(shieldFb,gl.COLOR_ATTACHMENT0,shieldTex);attach(shieldFb,gl.DEPTH_ATTACHMENT,zTex);for(let i=0;i<2;i++){bloomF[i]=gl.createFramebuffer();bloomT[i]=surface(Math.ceil(w/4),Math.ceil(h/4));attach(bloomF[i],gl.COLOR_ATTACHMENT0,bloomT[i])}}
gl.bindFramebuffer(gl.FRAMEBUFFER,msFb)}
function bindSampler(k,i,t){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(loc(k),i)}
function lensFinish(w,h){gl.bindFramebuffer(gl.READ_FRAMEBUFFER,msFb);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,filmBuffer);gl.blitFramebuffer(0,0,w,h,0,0,w,h,gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT,gl.NEAREST);gl.bindFramebuffer(gl.FRAMEBUFFER,filmBuffer);drawClouds();energies();let shieldOn=!inside&&(tm<3||tm>65);if(shieldOn){gl.bindFramebuffer(gl.FRAMEBUFFER,shieldFb);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.blendEquation(gl.MAX);shields(tm);gl.blendEquation(gl.FUNC_ADD)}gl.disable(gl.DEPTH_TEST);gl.bindVertexArray(empty);gl.useProgram(bloomP);current=bloomP;gl.viewport(0,0,Math.ceil(w/4),Math.ceil(h/4));for(let i=0;i<2;i++){gl.bindFramebuffer(gl.FRAMEBUFFER,bloomF[i]);bindSampler('src',0,i?bloomT[0]:filmTex);fl('first',1-i);gl.uniform2f(loc('dir'),i?0:2.4/h,i?2.4/h:0);gl.drawArrays(gl.TRIANGLES,0,3)}
gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);gl.useProgram(postP);current=postP;bindSampler('surface',0,filmTex);bindSampler('depth',1,zTex);bindSampler('halo',2,bloomT[1]);bindSampler('shieldLayer',4,shieldTex);fl('hasShield',shieldOn?1:0);gl.uniform2f(loc('pixels'),1/w,1/h);fl('internal',inside||(tm>22.9&&tm<29.8)?1:0);gl.drawArrays(gl.TRIANGLES,0,3);gl.enable(gl.DEPTH_TEST)}

