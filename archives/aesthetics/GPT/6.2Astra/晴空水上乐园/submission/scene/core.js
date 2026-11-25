'use strict';
// All coordinates are in metres. The two modelling grids are 1/4 and 1/8 metre.
const T=THREE, TAU=Math.PI*2, PI=Math.PI;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), mix=(a,b,t)=>a+(b-a)*t;
const frac=x=>x-Math.floor(x), snap=(x,g=.25)=>Math.round(x/g)*g;
const smooth=(a,b,x)=>{let p=clamp((x-a)/(b-a),0,1);return p*p*(3-2*p)};
let seed=47923;
function rnd(a=0,b=1){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return a+(b-a)*seed/4294967296}
const choice=a=>a[Math.floor(rnd(0,a.length))];
function hash2(x,z){let h=Math.imul(x|0,374761393)+Math.imul(z|0,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295}
const vec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const C={white:0xfff8e7, snow:0xfffef3,cream:0xfbe9bf, sand:0xf3dca6, wood:0xd8b181, teak:0xbc8a62, walnut:0x916e5b, navy:0x225870, ink:0x13485e,blue:0x29afd3,sky:0x67d4e7,ice:0xbdebee,deep:0x168cb5,sea:0x25c6ce,mint:0x73dcb9,leaf:0x73b775, green:0x409f78, lime:0xa7d979,yellow:0xffcf48,butter:0xffe58a,orange:0xf9a24e, coral:0xf58170,pink:0xf695b1,berry:0xdc718f,lilac:0xb7a1dc,glass:0x7fcad7,metal:0xabcccb,foam:0xecfffa};
const scene=new T.Scene();
const canvas=document.getElementById('scene');
const renderer=new T.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.outputColorSpace=T.SRGBColorSpace;
renderer.getContext().disable(renderer.getContext().DITHER);
renderer.setClearColor(0xb8e7f0);
renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate=false; renderer.shadowMap.needsUpdate=true;
const camera=new T.PerspectiveCamera(46,1,.35,4800);
scene.fog=new T.FogExp2(0xb7dfef,.00074);
scene.add(new T.HemisphereLight(0xe7f5ff,0xb3d3e2,1.60));
const sun=new T.DirectionalLight(0xfff3d9,2.30);
sun.position.set(145,240,115);sun.target.position.set(0,0,-8);scene.add(sun,sun.target);
sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-202,right:204,top:174,bottom:-167,near:40,far:570});sun.shadow.bias=-.00018;sun.shadow.normalBias=.10;sun.shadow.radius=2;
const fill=new T.DirectionalLight(0xc4efff,.24);fill.position.set(-4,3,-8);scene.add(fill);
const clockTime={value:0};
const colorCache=new Map();
function color(h){if(!colorCache.has(h))colorCache.set(h,new T.Color(h));return colorCache.get(h)}
function tinted(h,f){const r=Math.min(255,Math.round((h>>16)*f)),g=Math.min(255,Math.round(((h>>8)&255)*f)),b=Math.min(255,Math.round((h&255)*f));return (r<<16)|(g<<8)|b}
const mat={solid:new T.MeshLambertMaterial(),wet:new T.MeshPhongMaterial({shininess:59,specular:0x638e98}),leaf:new T.MeshLambertMaterial(),glass:new T.MeshPhongMaterial({color:0xe1ffff,transparent:true,opacity:.20,depthWrite:false,shininess:90,specular:0xffffff}),spray:new T.MeshPhongMaterial({color:0xd8ffff,transparent:true,opacity:.74,depthWrite:false,shininess:66}),far:new T.MeshLambertMaterial()};
function finishMaterial(m,wind=false){
 m.onBeforeCompile=s=>{
 s.uniforms.uParkTime=clockTime;
 s.vertexShader='varying vec3 vParkPos; uniform float uParkTime;\n'+s.vertexShader;
 s.vertexShader=s.vertexShader.replace('#include <project_vertex>',`
 vec4 pw=vec4(transformed,1.);
 #ifdef USE_INSTANCING
 pw=instanceMatrix*pw;
 #endif
 pw=modelMatrix*pw;
 vParkPos=pw.xyz;
 `+(wind?`pw.x+=.085*sin(pw.z*.17+uParkTime*1.25)+.04*sin(pw.y*.8+uParkTime);pw.z+=.06*sin(pw.x*.21+uParkTime*1.46);vec4 mvPosition=viewMatrix*pw;gl_Position=projectionMatrix*mvPosition;`:'#include <project_vertex>'));
 s.fragmentShader='varying vec3 vParkPos; uniform float uParkTime;\n'+s.fragmentShader;
 s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec3 cell=floor((vParkPos+.002)*4.);
 float fleck=fract(sin(dot(mod(cell,271.),vec3(31.37,17.17,5.83)))*1513.9);
 vec3 df=fwidth(vParkPos);
 float grain=1.-smoothstep(.08,.65,max(df.x,max(df.y,df.z)));
 diffuseColor.rgb*=1.+(fleck-.5)*.047*grain;
 float cloudShade=smoothstep(.52,.96,.50+.25*sin(vParkPos.x*.024+vParkPos.z*.012+uParkTime*.021)+.25*sin(vParkPos.z*.037-uParkTime*.017));
 diffuseColor.rgb*=mix(vec3(1.),vec3(.918,.955,.985),cloudShade);`);
 };
 m.customProgramCacheKey=()=>wind?'breeze-grain':'voxel-grain';
}
finishMaterial(mat.solid);finishMaterial(mat.wet);finishMaterial(mat.leaf,true);finishMaterial(mat.glass);
const batches=new Map(),cube=new T.BoxGeometry(1,1,1),helper=new T.Object3D();
let capture=null;
function box(x,y,z,w,h,d,c=C.white,k='solid',grid=.25){
 const x0=snap(x-w/2,grid),y0=snap(y-h/2,grid),z0=snap(z-d/2,grid);
 const x1=Math.max(x0+grid,snap(x+w/2,grid)),y1=Math.max(y0+grid,snap(y+h/2,grid)),z1=Math.max(z0+grid,snap(z+d/2,grid));
 let list=capture;
 if(!list){const key=k+'_'+Math.floor(x/48)+'_'+Math.floor(z/48);let b=batches.get(key);if(!b){b={k,a:[]};batches.set(key,b)}list=b.a}
 list.push((x0+x1)*.5,(y0+y1)*.5,(z0+z1)*.5,x1-x0,y1-y0,z1-z0,c);
}
function slab(x,z,w,d,bottom,top,c,k='solid'){box(x,(bottom+top)/2,z,w,top-bottom,d,c,k)}
function column(x,z,y0,y1,width,c=C.white,k='solid'){if(y1<=y0)return;box(x,(y0+y1)/2,z,width,y1-y0,width,c,k)}
function flushBoxes(){
 for(const {k,a} of batches.values()){
 const m=new T.InstancedMesh(cube,mat[k],a.length/7);
 for(let i=0;i<a.length;i+=7){helper.position.set(a[i],a[i+1],a[i+2]);helper.rotation.set(0,0,0);helper.scale.set(a[i+3],a[i+4],a[i+5]);helper.updateMatrix();m.setMatrixAt(i/7,helper.matrix);m.setColorAt(i/7,color(a[i+6]))}
 m.computeBoundingSphere();m.castShadow=k!=='glass'&&k!=='far'&&k!=='spray';m.receiveShadow=k!=='far';scene.add(m);
 }
 batches.clear();
}
function beam(x1,y1,z1,x2,y2,z2,width,c,k='solid',step=.5){
 const dx=x2-x1,dy=y2-y1,dz=z2-z1;
 if([dx,dy,dz].filter(v=>Math.abs(v)>.04).length<=1){box((x1+x2)/2,(y1+y2)/2,(z1+z2)/2,Math.abs(dx)+width,Math.abs(dy)+width,Math.abs(dz)+width,c,k,.125);return}
 const n=Math.ceil(Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dz))/step);
 for(let j=0;j<n;j++){let t=(j+.5)/n;box(x1+dx*t,y1+dy*t,z1+dz*t,Math.abs(dx)/n+width,Math.abs(dy)/n+width,Math.abs(dz)/n+width,c,k,.125)}
}
function oval(x,y,z,rx,rz,h,c,k='solid',step=.5){
 const n=Math.ceil(rz*2/step);
 for(let j=0;j<n;j++){const zz=(j+.5)*2*rz/n-rz;const ww=snap(2*rx*Math.sqrt(Math.max(0,1-(zz/rz)**2)),.25);if(ww>.01)box(x,y,z+zz,ww,h,2*rz/n,c,k)}
}
function ellipseRing(x,y,z,rx,rz,th,h,c,k='solid',step=.5){
 const n=Math.ceil(2*rz/step);
 for(let j=0;j<n;j++){const zz=(j+.5)*rz*2/n-rz,ex=rx*Math.sqrt(Math.max(0,1-(zz/rz)**2)),ex2=Math.abs(zz)>=rz-th?0:(rx-th)*Math.sqrt(Math.max(0,1-(zz/(rz-th))**2));
 if(ex2<.15) box(x,y,z+zz,2*ex,h,2*rz/n,c,k);else for(let side of [-1,1])box(x+side*(ex+ex2)/2,y,z+zz,ex-ex2,h,2*rz/n,c,k)}
}
function orb(x,y,z,rx,ry,rz,c,k='solid',step=.5){
 const ny=Math.max(2,Math.ceil(ry*2/step));
 for(let i=0;i<ny;i++){const dy=(i+.5)*ry*2/ny-ry,sc=Math.sqrt(Math.max(0,1-(dy/ry)**2));oval(x,y+dy,z,rx*sc,rz*sc,ry*2/ny,c,k,step)}
}
function faceHoop(x,y,z,r,th,dep,c,k='wet'){
 for(let yy=-r+.125;yy<r;yy+=.25){const a=Math.sqrt(Math.max(0,r*r-yy*yy)),b=Math.sqrt(Math.max(0,(r-th)**2-yy*yy));
 if(b<.1)box(x,y+yy,z,2*a,.25,dep,c,k);else for(let s of [-1,1])box(x+s*(a+b)*.5,y+yy,z,a-b,.25,dep,c,k)}
}
function guard(x1,z1,x2,z2,y,c=C.white,height=1.5){
 const l=Math.hypot(x2-x1,z2-z1),n=Math.max(1,Math.round(l/2.7));
 for(let i=0;i<=n;i++){const f=i/n;column(mix(x1,x2,f),mix(z1,z2,f),y,y+height,.25,c)}
 for(const h of [height*.45,height])beam(x1,y+h,z1,x2,y+h,z2,.17,c,'solid',.5);
}
function staircase(x,z,y,w,n,run,rise,dir=1,c=C.cream){
 for(let i=0;i<n;i++){slab(x,z+dir*(i+.5)*run,w,run,Math.min(y,y+n*rise)-.25,y+(i+1)*rise,c)}
}
class Faces{
 constructor(){this.p=[];this.n=[];this.c=[];this.i=[]}
 quad(a,b,c,d,n,col){
 const id=this.p.length/3,co=color(col);this.p.push(...a,...b,...c,...d);
 for(let j=0;j<4;j++){this.n.push(Math.round(n[0]*127),Math.round(n[1]*127),Math.round(n[2]*127));this.c.push(Math.round(co.r*255),Math.round(co.g*255),Math.round(co.b*255))}
 this.i.push(id,id+1,id+2,id,id+2,id+3);
 }
 geo(){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new T.Int8BufferAttribute(this.n,3,true));g.setAttribute('color',new T.Uint8BufferAttribute(this.c,3,true));g.setIndex(this.i);g.computeBoundingSphere();return g}
 mesh(k='wet',target=scene){if(!this.i.length)return;const m=mat[k].clone();m.vertexColors=true;finishMaterial(m,k==='leaf');const obj=new T.Mesh(this.geo(),m);obj.castShadow=k!=='glass'&&k!=='far';obj.receiveShadow=true;target.add(obj);return obj}
}
// Sparse writes into a local voxel volume, followed by greedy surface meshing.
class VoxelForm{
 constructor(lo,hi,unit=.25){
 this.g=unit;this.lo=lo.map(v=>Math.floor(v/unit)*unit-unit*2);
 this.dim=hi.map((v,i)=>Math.ceil((v-this.lo[i])/unit)+3);
 this.str=[1,this.dim[0],this.dim[0]*this.dim[1]];
 this.cells=new Uint8Array(this.str[2]*this.dim[2]);this.live=[];this.palette=[0];this.colors=new Map();
 }
 paint(hex){let id=this.colors.get(hex);if(id)return id;id=this.palette.length;this.palette.push(hex);this.colors.set(hex,id);return id}
 dot(x,y,z,id){const g=this.g,lo=this.lo,ix=Math.floor((x-lo[0])/g),iy=Math.floor((y-lo[1])/g),iz=Math.floor((z-lo[2])/g);
 if(ix<1||iy<1||iz<1||ix>=this.dim[0]-1||iy>=this.dim[1]-1||iz>=this.dim[2]-1)return;
 const i=ix+iy*this.str[1]+iz*this.str[2];if(!this.cells[i])this.live.push(i);this.cells[i]=id;if(this.norms)this.norms[i]=this.ref;
 }
 finish(k='wet',target=scene){
 const cells=this.cells,str=this.str,dim=this.dim,live=this.live,flags=new Uint8Array(cells.length),out=new Faces();
 live.sort((a,b)=>a-b);
 for(const i of live){let f=0;for(let a=0;a<3;a++){if(!cells[i+str[a]])f|=1<<(a*2);if(!cells[i-str[a]])f|=2<<(a*2)}flags[i]=f}
 for(const i of live){if(!flags[i])continue;
 const origin=[i%dim[0],Math.floor(i/dim[0])%dim[1],Math.floor(i/str[2])],id=cells[i];
 for(let d=0;d<6;d++){const bit=1<<d;if(!(flags[i]&bit))continue;
 const a=d>>1,u=(a+1)%3,v=(a+2)%3,du=str[u],dv=str[v],sg=(d&1)?-1:1;
 let w=1,h=1;while((flags[i+w*du]&bit)&&cells[i+w*du]===id)w++;
 rows:while(true){for(let j=0;j<w;j++){const t=i+h*dv+j*du;if(!(flags[t]&bit)||cells[t]!==id)break rows}h++}
 for(let b=0;b<h;b++)for(let j=0;j<w;j++)flags[i+j*du+b*dv]&=~bit;
 const p=origin.map((q,b)=>this.lo[b]+this.g*q);if(sg>0)p[a]+=this.g;
 const q=p.slice(),r=p.slice(),s=p.slice();q[u]+=w*this.g;r[u]+=w*this.g;r[v]+=h*this.g;s[v]+=h*this.g;
 const n=[0,0,0];n[a]=sg;
 if(this.norms){const val=this.norms[i],rn=[((val>>16)&255)/127-1,((val>>8)&255)/127-1,(val&255)/127-1],weight=rn[a]*sg<0?-.65:.65;
 for(let k=0;k<3;k++)n[k]=n[k]*.35+rn[k]*weight;
 const length=Math.hypot(...n)||1;for(let k=0;k<3;k++)n[k]/=length}
 if(sg>0)out.quad(p,q,r,s,n,this.palette[id]);else out.quad(p,s,r,q,n,this.palette[id]);
 }}
 return out.mesh(k,target);
 }
}
const assets=new Map(),actors=new Map();
function template(name,draw,material){if(assets.has(name))return name;const old=capture;capture=[];draw();const src=capture;capture=old;
 const f=new Faces();
 for(let i=0;i<src.length;i+=7){const [x,y,z,w,h,d,col]=src.slice(i,i+7),lo=[x-w/2,y-h/2,z-d/2],hi=[x+w/2,y+h/2,z+d/2];for(let a=0;a<3;a++){const u=(a+1)%3,v=(a+2)%3;for(const sign of [-1,1]){const p=lo.slice();if(sign>0)p[a]=hi[a];const q=p.slice(),r=p.slice(),s=p.slice();q[u]=hi[u];r[u]=hi[u];r[v]=hi[v];s[v]=hi[v];const n=[0,0,0];n[a]=sign;if(sign>0)f.quad(p,q,r,s,n,col);else f.quad(p,s,r,q,n,col)}}}
 const geometry=f.geo();if(material)geometry.userData.actorMaterial=material;assets.set(name,geometry);return name;
}
function actor(name,fn){if(!actors.has(name))actors.set(name,{items:[]});actors.get(name).items.push(fn)}
const actorMat=new T.MeshPhongMaterial({vertexColors:true,shininess:34,specular:0x789a9c});
function setupActors(){
 for(const [name,batch] of actors){
  const geometry=assets.get(name),material=geometry.userData.actorMaterial||actorMat;
  const mesh=new T.InstancedMesh(geometry,material,batch.items.length);
  if(material.userData.instanceFade){
   batch.fade=new T.InstancedBufferAttribute(new Float32Array(batch.items.length).fill(1),1);
   batch.fade.setUsage(T.DynamicDrawUsage);geometry.setAttribute('instanceFade',batch.fade);
  }
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;mesh.receiveShadow=true;
  if(material.transparent)mesh.renderOrder=4;batch.mesh=mesh;scene.add(mesh);
 }
}
function animateActors(t){
 for(const batch of actors.values()){
  for(let i=0;i<batch.items.length;i++){
   helper.position.set(0,0,0);helper.rotation.set(0,0,0,'XYZ');helper.scale.setScalar(1);helper.userData.opacity=1;
   batch.items[i](t,helper);helper.updateMatrix();batch.mesh.setMatrixAt(i,helper.matrix);
   if(batch.fade)batch.fade.setX(i,helper.userData.opacity);
  }
  batch.mesh.instanceMatrix.needsUpdate=true;if(batch.fade)batch.fade.needsUpdate=true;
 }
}
function floatRing(c=C.yellow,type='ring'){const key='float'+c+type;return template(key,()=>{
 const rx=type==='double'?1.05:type==='raft'?1.65:1.0,rz=type==='double'?1.85:rx;
 if(type==='bed'){for(let j=0;j<5;j++){box((j-2)*.32,0,0,.34,.28,3.1,j%2?c:tinted(c,1.07),'wet',.125);box((j-2)*.32,.18,-1.15,.34,.32,.59,C.cream,'wet',.125)}box(0,.17,1.15,1.55,.125,.25,C.white,'wet',.125);return}
 if(type==='mat'){for(let j=0;j<10;j++)box(0,j>7?(j-7)*.125:0,(j-5)*.25,1.25,.25,.25,j===1||j===7?C.white:c,'wet',.125);return}
 const step=.125;for(let z=-rz+.0625;z<rz;z+=step){const w=rx*Math.sqrt(Math.max(0,1-(z/rz)**2)),v=Math.abs(z)>rz*.55?0:rx*.55*Math.sqrt(1-(z/(rz*.55))**2);
 for(let s of [-1,1]){const co=Math.abs(z/rz)>.58&&Math.abs(z/rz)<.84?C.snow:c;box(s*(v+w)*.5,0,z,w-v,rx*.34,step,co,'wet',.125);if(w-v>.3)box(s*(v+w)*.5,rx*.19,z,w-v-.17,.125,step,co,'wet',.125)}}
 if(type==='double')box(0,0,0,1.95,.36,.47,c,'wet',.125);
 if(type==='raft')oval(0,-.125,0,rx*.65,rz*.65,.25,C.cream,'wet',.25);
 for(const s of [-1,1])box(s*rx*.8,.24,0,.125,.125,.5,C.ink,'wet',.125);
 })}
function canvasTexture(w,h,paint){
 const el=document.createElement('canvas');el.width=w;el.height=h;const ctx=el.getContext('2d');paint(ctx,w,h);const tex=new T.CanvasTexture(el);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return tex;
}
function emblem(ctx,x,y,r,fg='#fff9df',gold='#ffd052'){
 ctx.save();ctx.translate(x,y);ctx.scale(r/50,r/50);ctx.fillStyle=gold;ctx.beginPath();ctx.arc(10,-12,17,0,TAU);ctx.fill();
 ctx.fillStyle=fg;ctx.beginPath();ctx.moveTo(-43,18);ctx.bezierCurveTo(-26,14,-24,-17,-5,-22);ctx.bezierCurveTo(3,-25,11,-21,13,-18);ctx.bezierCurveTo(-7,-18,-8,7,8,13);ctx.bezierCurveTo(19,18,31,12,40,5);ctx.bezierCurveTo(36,24,16,32,0,24);ctx.bezierCurveTo(-20,12,-26,27,-43,18);ctx.fill();
 ctx.beginPath();ctx.moveTo(-38,30);ctx.bezierCurveTo(-13,20,2,48,36,24);ctx.lineWidth=5;ctx.strokeStyle=fg;ctx.lineCap='round';ctx.stroke();ctx.restore();
}
function plaque(x,y,z,w,h,paint,rot=0,res=640){const tex=canvasTexture(res,Math.max(48,Math.round(res*h/w)),paint);const m=new T.MeshBasicMaterial({map:tex,side:T.FrontSide,toneMapped:false});const p=new T.Mesh(new T.PlaneGeometry(w,h),m);p.position.set(x+.165*Math.sin(rot),y,z+.165*Math.cos(rot));p.rotation.y=rot;scene.add(p);return p}
function lettering(x,y,z,w,h,title,sub,bg='#1485a4',fg='#fff9df',rot=0,num=''){
 return plaque(x,y,z,w,h,(g,W,H)=>{g.fillStyle=bg;g.fillRect(0,0,W,H);const left=num?W*.22:W*.055;
 if(num){g.fillStyle='#ffda61';g.fillRect(0,0,W*.17,H);g.fillStyle='#23566a';g.font='900 '+H*.42+'px Arial';g.textAlign='center';g.fillText(num,W*.085,H*.66)}
 g.fillStyle=fg;g.textAlign='left';g.font='900 '+H*(sub?.45:.53)+'px "Microsoft YaHei", Arial, sans-serif';g.fillText(title,left,H*(sub?.56:.70),W-left-W*.05);if(sub){g.font='700 '+H*.16+'px Arial';g.fillText(sub,left,H*.84,W-left-W*.05)}},rot)
}
const curves=[];
function spline(points){return new T.CatmullRomCurve3(points.map(p=>vec(...p)),false,'centripetal',.5)}
function tablePath(curve,step=.3){
 curve.arcLengthDivisions=850;const len=curve.getLength(),n=Math.max(8,Math.ceil(len/step)),p=curve.getSpacedPoints(n),t=[],r=[],up=[];
 const groundUp=vec(0,1,0);
 for(let i=0;i<=n;i++){const d=p[Math.min(n,i+1)].clone().sub(p[Math.max(0,i-1)]).normalize();let side=vec().crossVectors(d,groundUp);if(side.lengthSq()<.003)side.copy(i?r[i-1]:vec(1,0,0));else side.normalize();if(i&&side.dot(r[i-1])<0)side.negate();const u=vec().crossVectors(side,d).normalize();t.push(d);r.push(side);up.push(u)}
 const path={p,t,r,up,len,n,at(f,out=vec()){const x=clamp(f,0,.999999)*n,j=Math.floor(x);return out.copy(p[j]).lerp(p[j+1],x-j)}};return path;
}
const perFrame=[];
