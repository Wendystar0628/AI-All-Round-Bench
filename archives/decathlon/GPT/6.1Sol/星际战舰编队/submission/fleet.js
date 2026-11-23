/* 层隙 / LACUNA — procedural voxel fleet film. All solid dimensions share a unit lattice. */
'use strict';
(()=>{
const T=THREE, TAU=Math.PI*2, DURATION=78;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)), mix=(a,b,t)=>a+(b-a)*t, smooth=(a,b,x)=>{let u=clamp((x-a)/(b-a));return u*u*(3-2*u)}, fract=x=>x-Math.floor(x);
function rand(seed){let a=seed|0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const V=(x,y,z)=>new T.Vector3(x,y,z);
const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
if(!renderer.capabilities.isWebGL2){document.getElementById('error').textContent='此作品需要 WebGL 2';document.getElementById('error').style.display='block';return}
document.body.appendChild(renderer.domElement);renderer.setPixelRatio(1);renderer.outputColorSpace=T.LinearSRGBColorSpace;renderer.toneMapping=T.NoToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
const camera=new T.PerspectiveCamera(48,1,.4,40000);
const mats={};const OMEGA=TAU/DURATION;
function material(name,color,metal=.3,rough=.6,emissive=null,intensity=0){let m=new T.MeshStandardMaterial({color,metalness:metal,roughness:rough,emissive:emissive||0,emissiveIntensity:intensity});
// The integer grid is the boundary of the merged coplanar voxel faces, not a texture.
m.onBeforeCompile=s=>{s.vertexShader='varying vec3 voxelP;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvoxelP=position;');s.fragmentShader='varying vec3 voxelP;\n'+s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec3 q=abs(fract(voxelP+0.0001)-0.5); vec3 fw=fwidth(voxelP);vec3 ed=1.-smoothstep(vec3(.474)-fw,vec3(.495)+fw,q); vec3 n=abs(normalize(cross(dFdx(voxelP),dFdy(voxelP)))); float grid=mix(ed.y*ed.z,mix(ed.x*ed.z,ed.x*ed.y,n.z),n.y+n.z); diffuseColor.rgb*=mix(.86,1.,grid);`)};
let layer={white:-3,hull:-2,gold:-4,rib:-1,cyan:-5,ice:-6,amber:-5,black:0,dark:1}[name]||0;m.polygonOffset=true;m.polygonOffsetFactor=layer*.35;m.polygonOffsetUnits=layer*.5;mats[name]=m;return m}
material('hull','#a7b8bf',.55,.46);material('white','#d5d7cd',.42,.52);material('dark','#142837',.65,.5);material('rib','#344d5b',.7,.38);material('gold','#b68443',.6,.43);material('black','#08111c',.45,.65);material('cyan','#82bbc6',.35,.3,'#2695ad',1.65);material('ice','#d9fcff',.1,.26,'#80dbed',2.6);material('amber','#f6b65e',.4,.34,'#ff861b',2.3);material('red','#e08c49',.5,.52);material('rock','#574d4d',.25,.91);material('rockLight','#8a7564',.23,.85);material('rockDark','#302c36',.2,.88);
material('glass','#5a9eae',.3,.18,'#145263',.12);Object.assign(mats.glass,{transparent:true,opacity:.16,depthWrite:false,side:T.DoubleSide});
material('gun','#487484',.55,.34,'#2695ad',.12);material('screen','#17313d',.25,.5,'#163947',.5);
// Build merged cuboidal voxel runs; dimensions and boundaries are integers throughout.
const boxBase=new T.BoxGeometry(1,1,1).toNonIndexed();
class Build{constructor(){this.data={};this.extras=[]}box(x,y,z,w,h,d,mat='hull'){x=Math.round(x);y=Math.round(y);z=Math.round(z);w=Math.max(1,Math.round(w));h=Math.max(1,Math.round(h));d=Math.max(1,Math.round(d));let a=this.data[mat]||(this.data[mat]={p:[],n:[],boxes:[]});a.boxes.push(x,y,z,w,h,d);const p=boxBase.attributes.position.array,n=boxBase.attributes.normal.array;for(let i=0;i<p.length;i+=3){a.p.push(p[i]*w+x+w*.5,p[i+1]*h+y+h*.5,p[i+2]*d+z+d*.5);a.n.push(n[i],n[i+1],n[i+2])}return this}center(x,y,z,w,h,d,m){return this.box(x-w/2,y-h/2,z-d/2,w,h,d,m)}group(){let g=new T.Group();for(let [k,a]of Object.entries(this.data)){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(a.p,3));geo.setAttribute('normal',new T.Float32BufferAttribute(a.n,3));geo.computeBoundingSphere();geo.computeBoundingBox();geo.userData.voxelRuns=new Int32Array(a.boxes);let mesh=new T.Mesh(geo,mats[k]);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.voxelSolid=true;g.add(mesh)}for(let e of this.extras)g.add(e);return g}}
function frame(b,x,y,z,w,h,d=5,th=4,mat='rib'){b.box(x-w/2,y,z,th,h,d,mat);b.box(x+w/2-th,y,z,th,h,d,mat);b.box(x-w/2,y+h-th,z,w,th,d,mat);b.box(x-w/2,y,z,w,th,d,mat)}
function floorPortal(b,x,y,z,w,h,d=5,th=4,mat='rib'){b.box(x-w/2,y,z,th,h,d,mat);b.box(x+w/2-th,y,z,th,h,d,mat);b.box(x-w/2,y+h-th,z,w,th,d,mat);b.box(x-w/2,y-2,z,w,2,d,mat);}
function forkMark(b,x,y,z,unit=1){const rows=['01000010','01100110','00100100','00111100','00011000','00011000','00011000','00011000'];for(let r=0;r<rows.length;r++)for(let c=0;c<8;c++)if(rows[r][c]==='1')b.box(x+(c-4)*unit,y,z+r*unit,unit,1,unit,r<4?'gold':'dark');}
function ringVoxel(b,r,y,th,h,mat,step=3){for(let x=-r;x<r;x+=step)for(let z=-r;z<r;z+=step){let d=Math.hypot(x+step/2,z+step/2);if(d<r&&d>r-th)b.box(x,y,z,step,h,step,mat)}}
function turret(b,x,y,z,s=1,type='pulse'){
 b.center(x,y+3*s,z,12*s,6*s,12*s,'dark');b.center(x,y+7*s,z,9*s,4*s,10*s,'gold');
 const h=new Build();h.center(0,0,0,10*s,8*s,14*s,'hull');h.center(0,4*s,2*s,8*s,2*s,8*s,'white');
 for(let a of [-1,1]){h.center(a*3*s,s,-14*s,3*s,3*s,20*s,'rib');h.center(a*3*s,s,-24*s,3*s,3*s,2*s,'gun');h.center(a*3*s,s,-7*s,4*s,4*s,3*s,'gold');}
 const rotor=h.group();rotor.position.set(x,y+12*s,z);rotor.userData={weaponType:type,muzzle:[3*s,s,-25*s],scale:s};b.extras.push(rotor);
}
function engine(b,x,y,z,w,h){for(let k=0;k<4;k++)frame(b,x,y-h/2-k*2,z+k*4,w+k*5,h+k*4,4,3,k%2?'hull':'rib');b.center(x,y,z+2,w-8,h-8,2,'black');b.center(x,y,z+5,w-12,h-12,2,'cyan');b.center(x,y,z+7,w-18,h-18,2,'ice')}
function flagship(){const b=new Build(),r=rand(871);
// Long dark keel and carved, tapering segmented armour.
for(let z=-455;z<505;z+=20){let u=(z+455)/960;let w=50+Math.sin(u*Math.PI)*108;let h=40+Math.sin(u*Math.PI)*47;b.center(0,-7,z,w,h,20,'dark');b.center(0,-h*.48,z,w*.65,10,18,'rib');}
// Paired forward blades enclose a deep axial void and the main accelerator.
for(let s of [-1,1]){
for(let z=-550;z<470;z+=30){let u=(z+550)/1020;let width=16+Math.sin(Math.PI*u)*65;let x=s*(27+Math.sin(Math.PI*u)*59);let yy=10+Math.sin(u*Math.PI)*22;
b.center(x,yy,z,width,30+Math.sin(u*Math.PI)*30,28,'hull');b.center(x,yy+18,z+2,width-10,8,24,'white');b.center(x+s*(width/2-2),yy-8,z,4,20,23,'gold');
if(z>-370&&z<400){b.center(x,yy+25,z+3,width-20,4,18,'rib');b.center(x-s*width*.25,yy+28,z+3,3,1,19,'cyan')}
// lower strata, lateral terraced masses
if(z>-360){b.center(x+s*14,-33,z+8,width+8,18,26,'rib');b.center(x+s*10,-46,z+10,width-12,7,23,'hull')}
}
for(let z=-240;z<440;z+=48){let u=(z+240)/680;let x=s*(105+Math.sin(u*Math.PI)*40);let w=42+Math.sin(u*Math.PI)*30;
if(z>=-48&&z<=192){b.center(x,-17,z,w,7,44,'rib');b.center(x+s*6,31,z,w-2,7,39,'hull');b.center(s*107,8,z,5,44,44,'dark');b.center(x+s*11,36,z+5,w-14,3,30,'white');}else{b.center(x,0,z,w,34,44,'dark');b.center(x+s*6,13,z,w-2,18,39,'hull');b.center(x+s*11,25,z+5,w-14,7,30,'white');}b.center(x+s*(w/2),-12,z+4,5,18,30,'gold');b.center(x-s*8,30,z+8,4,2,22,'cyan');
for(let k=0;k<3;k++)b.center(x+s*(w*.5+k*2),-19-k*6,z+7,5,5,26-k*4,'rib');
}
// Deep inset hangar aperture with its visible roof, floor, jambs and inner bay.
b.center(s*134,-7,104,55,4,306,'rib');b.center(s*162,28,104,3,2,214,'cyan');for(let zp of [-6,214]){b.center(s*147,10,zp,32,40,6,'hull');b.center(s*165,11,zp,2,28,2,'gold');}for(let zp of [26,76,126,176]){let boat=smallboat();boat.position.set(s*140,1,zp);boat.userData={hullBay:true,side:s,z:zp};b.extras.push(boat);b.center(s*137,-4,zp,35,1,30,'black');b.center(s*160,-3,zp,2,1,27,'amber');}b.center(s*114,30,104,25,5,306,'hull');
for(let z=-50;z<270;z+=32){b.center(s*119,11,z,12,36,5,'rib');b.center(s*125,9,z+3,2,22,2,'cyan');b.center(s*104,-4,z+14,17,2,19,'gold')}
for(let z=-340;z<390;z+=75){b.center(s*87,52,z,28,8,36,'dark');turret(b,s*88,55,z,1.35)}
// Side ribs and vent banks, a different belly silhouette.
for(let z=-330;z<470;z+=26){b.center(s*64,-43,z,15,20,9,'rib');b.center(s*59,-53,z,13,4,8,'hull');if(z%3===0)b.center(s*69,-35,z,2,5,7,'cyan')}
}

// Broad shield-like shell leaves, with a quiet ceramic field inside a stepped rim.
for(let side of [-1,1]){
 for(let n=0;n<4;n++){let z=-285+n*202, xx=side*(75+(n===1?12:0));
  for(let k=0;k<8;k++){let edge=k<3?k*3:(k>5?(7-k)*4:9);let ww=67+edge;
   b.center(xx+side*edge*.35,45+n%2*7,z+k*21,ww,9,21,'hull');
   b.center(xx+side*edge*.35,51+n%2*7,z+k*21+1,ww-9,4,19,'white');
  }
  b.center(xx+side*25,56+n%2*7,z+74,7,1,115,'gold');
  for(let k=0;k<6;k++){b.center(xx-side*19,57+n%2*7,z+41+k*10,14,1,5,'rib');b.center(xx-side*19,58+n%2*7,z+41+k*10,9,1,1,'black');}
 }
 // Sharp stepped nose cap and overhanging lateral buttresses.
 for(let k=0;k<9;k++)b.center(side*(25+k),9,-568+k*3,8+k,18+k*2,3,'white');
 for(let z=-190;z<390;z+=116){b.center(side*126,-15,z,58,14,62,'hull');b.center(side*137,-24,z+5,37,8,48,'rib');b.center(side*145,-29,z+7,22,4,33,'gold');}
}

// Main cannon: heavy foundation, two long rails, recessed luminous throat.
b.center(0,1,-305,46,46,200,'dark');b.center(0,-16,-399,36,12,155,'rib');
for(let s of [-1,1])for(let z=-492;z<-220;z+=18){b.center(s*18,5,z,12,23,16,'hull');let rail=new Build();rail.center(s*11,7,z,2,11,13,'gun');let rg=rail.group();rg.userData.chargeOrder=Math.round((-220-z)/18);b.extras.push(rg);b.center(s*20,20,z,10,5,13,'gold')}
b.center(0,4,-423,18,15,4,'ice');b.center(0,-2,-438,8,7,8,'cyan');b.center(0,5,-490,10,10,4,'cyan');
// Dorsal architecture: paired terraced legs hold a split crown over a visible void.
b.center(0,58,293,104,16,170,'hull');b.center(0,68,290,93,4,150,'dark');
for(let side of [-1,1]){for(let k=0;k<4;k++){b.center(side*(32-k*2),78+k*10,300+k*9,26-k*3,12,126-k*18,k%2?'hull':'white');b.center(side*(33-k*2),83+k*10,285+k*12,18-k*2,2,64-k*7,'gold');}b.center(side*40,110,333,15,15,63,'rib');b.center(side*47,127,347,4,46,5,'rib');b.center(side*47,148,350,8,3,25,'gold');}
b.center(0,119,331,104,12,56,'hull');b.center(0,127,331,92,5,45,'white');b.center(0,123,301,77,3,2,'cyan');b.center(0,133,333,62,8,36,'dark');
for(let side of [-1,1])b.center(side*18,141,333,24,10,32,'hull');b.center(0,149,330,73,6,30,'white');b.center(0,151,313,61,2,2,'cyan');b.center(0,105,337,15,7,47,'dark');b.center(0,108,313,11,2,2,'cyan');
// Thermal lattice and large, recessed rectangular engines.
for(let x=-90;x<=90;x+=30)for(let z=358;z<480;z+=14){b.center(x,43,z,20,6,8,'black');b.center(x,47,z,16,2,3,'rib')}
const engines=[];for(let x of [-89,-44,0,44,89]){engine(b,x,-3,504,34,44);engines.push([x,-3,529,22,30])}for(let x of [-133,133]){engine(b,x,2,416,25,28);engines.push([x,2,439,16,17])}

// Outboard split leaves: stepped, hollow shoulders silhouette against the sky.
for(let side of [-1,1]){
 for(let z=-250;z<425;z+=12){let u=(z+250)/675,xx=side*(128+102*Math.sin(u*Math.PI)),ww=19+13*Math.sin(u*Math.PI),yy=-4+7*Math.sin(u*Math.PI);
  b.center(xx,yy,z,ww,18,12,'dark');b.center(xx,yy+12,z,ww+5,7,12,'hull');b.center(xx-side*4,yy+17,z,ww-7,3,10,'white');b.center(xx-side*ww*.45,yy+8,z,2,2,9,'cyan');
  if(z%36===2)b.center(xx+side*ww*.45,yy-6,z,6,9,8,'gold');
 }
 for(let z of [-146,106,346]){let u=(z+250)/675,xx=128+102*Math.sin(u*Math.PI),span=xx-137;b.center(side*(137+span/2),-9,z,span,12,17,'rib');b.center(side*(137+span/2),-2,z,span,2,3,'gold');}
}

// Smaller one-unit machinery gives near shots a real voxel cadence.
forkMark(b,75,54,-241,3);forkMark(b,-75,54,-241,3);
for(let i=0;i<450;i++){let z=Math.floor(r()*880-390),s=r()<.5?-1:1,x=s*Math.floor(50+r()*38);if(z>170&&z<365)continue;if(z>-285&&z<480&&((z+285)%202)<170)continue;let y=50+Math.floor(r()*4);b.box(x,y,z,1+Math.floor(r()*3),1+Math.floor(r()*4),2+Math.floor(r()*8),i%8===0?'gold':'rib')}
// Broken gold bands repeat the same forward fork motif.
for(let s of [-1,1])for(let z=-190;z<120;z+=12)b.center(s*124,35,z,8,1,7,'gold');
return {model:b.group(),engines,length:1100,width:440,height:320};}
function escort(kind){let b=new Build(),front=kind==='vanguard',len=front?188:168;
for(let z=-len/2;z<len/2;z+=8){let u=(z+len/2)/len,w=(front?13:24)+Math.sin(u*Math.PI)*(front?18:22);b.center(0,0,z,w,front?15:25,8,'dark');for(let s of [-1,1]){let x=s*(w*.28+3);b.center(x,6,z,w*.46,12,7,'hull');b.center(x,13,z+1,w*.38,3,5,'white');b.center(s*(w/2),-3,z+1,3,7,5,'gold');if(z%16===0)b.center(s*5,15,z+1,1,1,5,'cyan')}}
for(let s of [-1,1]){
if(front){for(let z=-45;z<55;z+=12){b.center(s*36,2,z,34,10,10,'rib');b.center(s*42,8,z,20,3,8,'hull');for(let x=0;x<3;x++){b.center(s*(29+x*7),10,z,4,2,7,'black');b.center(s*(29+x*7),12,z-1,2,2,5,'gold')}}b.center(s*33,0,5,8,12,111,'dark');b.center(s*35,14,1,5,5,104,'hull')}
else {for(let z=-34;z<60;z+=22){b.center(s*28,0,z,20,20,18,'dark');b.center(s*29,11,z,24,5,17,'hull');b.center(s*31,15,z,17,3,13,'white')}for(let z of [-35,14,57])turret(b,s*21,18,z,.6,'ciws')}
}
for(let side of [-1,1]){for(let k=0;k<5;k++)b.center(side*(6+k),6,-len/2+4+k*4,5+k*2,8+k,7,'white');if(front){for(let z=-43;z<50;z+=12){b.center(side*43,13,z,2,2,6,'white');b.center(side*43,13,z-4,1,1,2,'gold');}}else{b.center(side*35,-7,10,9,7,65,'rib');b.center(side*39,-10,14,5,3,50,'gold');}}
forkMark(b,0,16,-15,1);b.center(0,20,35,20,12,30,'hull');b.center(0,26,26,16,2,8,'cyan');let engines=[];for(let x of [-12,12]){engine(b,x,0,len/2-2,15,17);engines.push([x,0,len/2+18,7,8])}return{model:b.group(),engines,length:len,width:front?114:90,height:65}}
function smallboat(){let b=new Build();b.center(0,0,0,8,5,23,'dark');for(let s of [-1,1]){for(let k=0;k<4;k++)b.center(s*(3+k),1,k*4-10,4,3,6,'hull');b.center(s*7,-1,4,5,3,12,'gold');b.center(s*3,0,13,3,3,2,'cyan')}b.center(0,3,-3,4,2,6,'cyan');b.center(0,1,-14,4,3,8,'white');return b.group()}
const FLAG=flagship(),GUARD=escort('guard'),VAN=escort('vanguard'),BOAT=smallboat();
function cloneModel(g){return g.clone()}
const bgVertex=`varying vec2 uvv;void main(){uvv=uv;gl_Position=vec4(position.xy,1.,1.);}`;
const bgFragment=`precision highp float;varying vec2 uvv;uniform mat4 invProj;uniform mat4 camWorld;uniform float time;
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+3.2;a*=.5;}return v;}
void main(){vec4 p=invProj*vec4(uvv*2.-1.,1.,1.);vec3 d=normalize((camWorld*vec4(normalize(p.xyz/p.w),0.)).xyz);float cloud=fbm(d*4.+3.);float band=pow(max(0.,1.-abs(d.y*.9+d.x*.38+.16)),6.);float fold=fbm(d*17.);vec3 c=vec3(.0018,.004,.012);c+=vec3(.014,.032,.065)*pow(cloud,2.)*band*4.;c+=vec3(.042,.014,.048)*pow(fold,3.)*band*1.7;
vec3 sun=normalize(vec3(-.7,.6,-.5));float sd=max(dot(d,sun),0.);c+=vec3(.38,.23,.12)*pow(sd,120.)*.3;
// A very distant dark limb, edged by a dusty violet atmosphere.
vec3 planetDir=normalize(vec3(-.82,.10,.55));float a=acos(clamp(dot(d,planetDir),-1.,1.));float edge=abs(a-.37);if(a<.37)c=mix(vec3(.004,.007,.017),vec3(.025,.027,.051),max(0.,dot(d,sun)))*(.5+cloud*.5);c+=vec3(.038,.055,.10)*exp(-edge*300.);
for(int i=0;i<2;i++){float scale=i==0?470.:900.;vec3 cell=floor(d*scale),f=fract(d*scale)-.5;float n=hash(cell+float(i)*51.);float star=pow(max(0.,1.-length(f)*2.0),12.)*step(.992,n);c+=star*mix(vec3(.4,.63,.9),vec3(1.,.73,.44),hash(cell+3.))*mix(.35,1.8,hash(cell+7.));}gl_FragColor=vec4(c,1.);}`;
function makeScene(interior=false){let scene=new T.Scene();scene.background=new T.Color('#030812');if(!interior)scene.fog=new T.FogExp2('#080e20',.000035);else scene.fog=new T.FogExp2('#07111b',.0013);scene.add(new T.HemisphereLight('#aac8e8','#1b2436',interior?.75:1.2));let sun=new T.DirectionalLight('#ffe1b3',interior?1.6:3.1);sun.position.set(-850,1300,-1100);if(!interior){sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-1150,right:1150,top:1150,bottom:-1150,near:50,far:4000});sun.shadow.bias=-.00015;sun.shadow.normalBias=.7;}scene.add(sun);let fill=new T.DirectionalLight('#56a4e7',interior?1.0:1.4);fill.position.set(250,-160,500);scene.add(fill);const bgm=new T.ShaderMaterial({vertexShader:bgVertex,fragmentShader:bgFragment,uniforms:{invProj:{value:camera.projectionMatrixInverse},camWorld:{value:camera.matrixWorld},time:{value:0}},depthWrite:false,depthTest:false});const bg=new T.Mesh(new T.PlaneGeometry(2,2),bgm);bg.frustumCulled=false;bg.renderOrder=-10000;scene.add(bg);return scene}
const exterior=makeScene(), fleet=[],plumes=[],shields=[];
const plumeVertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const plumeFrag=`varying vec2 vUv;uniform float time;uniform float power;void main(){float x=abs(vUv.x-.5)*2.,z=vUv.y;float w=(.7-.37*z)*(1.+.08*sin(z*60.-time*137.));float v=exp(-x*x/(w*w)*4.)*pow(max(0.,1.-z),1.6);float streak=.75+.25*sin(vUv.x*66.+sin(z*18.-time*75.));vec3 c=mix(vec3(.035,.25,.65),vec3(.35,1.0,1.4),pow(max(0.,1.-z),3.));gl_FragColor=vec4(c*power,v*streak*.8);}`;
const plumeMat=new T.ShaderMaterial({vertexShader:plumeVertex,fragmentShader:plumeFrag,uniforms:{time:{value:0},power:{value:1}},transparent:true,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide});
function addPlumes(parent,engines){for(let e of engines){const g=new T.Group();g.position.set(e[0],e[1],e[2]);for(let k=0;k<2;k++){let mesh=new T.Mesh(new T.PlaneGeometry(e[3]*2.2,1),plumeMat);mesh.rotation.x=Math.PI/2;if(k===1){mesh.rotation.set(0,Math.PI/2,Math.PI/2);}mesh.position.z=1/2;g.add(mesh)}parent.add(g);plumes.push({g,len:e[3]*7})}}
const shieldMat=new T.ShaderMaterial({transparent:true,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending,uniforms:{time:{value:0},amount:{value:0},reveal:{value:1}},vertexShader:`varying vec3 vp;varying vec3 vn;varying vec3 eye;void main(){vp=position;vec4 p=modelViewMatrix*vec4(position,1.);vn=normalize(normalMatrix*normal);eye=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,fragmentShader:`uniform float time;uniform float amount;uniform float reveal;varying vec3 vp;varying vec3 vn;varying vec3 eye;void main(){float f=pow(1.-abs(dot(normalize(vn),normalize(eye))),3.);float lat=acos(clamp(vp.y,-1.,1.));float lon=atan(vp.z,vp.x);float lines=pow(.5+.5*cos(lat*34.+sin(lon*8.)*.2-time*4.),38.);float lines2=pow(.5+.5*cos(lon*28.),45.)*.25;float wave=pow(.5+.5*sin(vp.z*18.-time*25.),24.);float front=-1.05+reveal*2.15;float swept=1.-smoothstep(front-.035,front+.035,vp.z);float wd=(vp.z-front)*24.;float crest=exp(-wd*wd)*(1.-smoothstep(.9,1.,reveal));float alpha=((f*.15+lines*.052+lines2*.05+wave*.025)*swept+crest*.24)*amount;gl_FragColor=vec4(vec3(.12,.62,.78)*(1.+f*.4),alpha);}`});
const shieldGeo=new T.SphereGeometry(1,72,40);
function addShip(template,pos,i){let root=new T.Group();root.position.copy(pos);root.add(cloneModel(template.model));addPlumes(root,template.engines);exterior.add(root);let m=shieldMat.clone(),shield=new T.Mesh(shieldGeo,m);shield.position.z=i?8:0;shield.scale.set(template.width*.62,template.height*.65,template.length*(i?.72:.58));root.add(shield);shields.push({mesh:shield,mat:m,index:i});let heads=[];root.traverse(o=>{if(o.userData.weaponType){let emitter=null;o.traverse(m=>{if(m.isMesh&&m.material===mats.gun){m.material=m.material.clone();emitter=m.material;}});if(o.userData.weaponType==='ciws')emitter.emissive.set('#c38c48');heads.push({g:o,emitter,type:o.userData.weaponType,target:1+heads.length%2});}});const lighting={front:{value:-template.length},strength:{value:0},crest:{value:0},width:{value:template.length*.12}},copies=new Map();root.children[0].traverse(mesh=>{if(mesh.isMesh&&[mats.hull,mats.white,mats.rib,mats.gold,mats.dark].includes(mesh.material)){let base=mesh.material,copy=copies.get(base);if(!copy){copy=base.clone();copy.onBeforeCompile=shader=>{base.onBeforeCompile(shader);Object.assign(shader.uniforms,{shieldFront:lighting.front,shieldStrength:lighting.strength,shieldCrest:lighting.crest,shieldWidth:lighting.width});shader.fragmentShader='uniform float shieldFront;uniform float shieldStrength;uniform float shieldCrest;uniform float shieldWidth;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat dd=(voxelP.z-shieldFront)/shieldWidth;float shieldBand=exp(-dd*dd);totalEmissiveRadiance+=vec3(.013,.105,.15)*shieldStrength*(.06+2.5*shieldBand*shieldCrest);');};copy.customProgramCacheKey=()=> 'lacuna-voxel-shield-reflection';copies.set(base,copy);}mesh.material=copy;}});let item={root,base:pos.clone(),i,template,heads,lighting};fleet.push(item);return item}
const flagshipItem=addShip(FLAG,V(0,0,0),0);
// Thirty-six escorts, grouped in depth and height, with intentionally open sightlines.
for(let i=0;i<36;i++){let row=Math.floor(i/6),j=i%6,s=j%2?-1:1;let x=s*(270+Math.floor(j/2)*265+row*38),z=(2-row)*470+(j%3)*104,y=((i*7)%5-2)*115;addShip(i<18?GUARD:VAN,V(x,y,z),i+1)}
fleet[29].base.set(1070,320,-850);fleet[13].base.set(310,20,-390);fleet[14].base.set(-330,-80,-300);fleet[15].base.set(550,-70,-260);fleet[25].base.set(470,100,-1020);fleet[26].base.set(-460,-40,-1110);
const hullBoats=[];flagshipItem.root.traverse(o=>{if(o.userData.hullBay)hullBoats.push(o);});
const chargeRails=[];flagshipItem.root.traverse(o=>{if(o.userData.chargeOrder!==undefined){let m=o.children[0];m.material=m.material.clone();chargeRails.push({mesh:m,order:o.userData.chargeOrder});}});
// Foreground motes drift much faster than the fleet, establishing parallax.
let dustData=[],dr=rand(983);for(let i=0;i<750;i++)dustData.push((dr()-.5)*6000,(dr()-.5)*2200,(dr()-.5)*7000);
const dustGeo=new T.BufferGeometry();dustGeo.setAttribute('position',new T.Float32BufferAttribute(dustData,3));let dust=new T.Points(dustGeo,new T.PointsMaterial({size:1.15,color:'#7a9fba',transparent:true,opacity:.55,sizeAttenuation:true}));exterior.add(dust);
const boats=[];for(let i=0;i<9;i++){let g=cloneModel(BOAT);exterior.add(g);boats.push(g);const gl=new T.PointLight('#37c9ff',45,40,2);g.add(gl);gl.position.set(0,0,15)}
const engineLight=new T.PointLight('#1bafff',18000,650,2);engineLight.position.set(0,0,560);flagshipItem.root.add(engineLight);
// INTERIORS — each room is modelled at the same one-unit resolution as the hull.
function point(scene,color,power,range,x,y,z){let l=new T.PointLight(color,power,range,2);l.position.set(x,y,z);scene.add(l);return l}
function floorTiles(b,w,len,y,z0){for(let x=-w/2;x<w/2;x+=10)for(let z=z0;z<z0+len;z+=12){b.box(x,y-2,z,10,2,12,'dark');b.box(x+1,y,z+1,8,1,10,'rib')}}
function strip(b,x,y,z,w,h,d,mat='cyan'){b.center(x,y,z,w,h,d,mat)}

const digit=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111'];
function stencil(b,num,x,y,z){let chars=String(num).padStart(2,'0');for(let k=0;k<chars.length;k++)for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(digit[+chars[k]][row*3+col]==='1')b.box(x+k*4+col,y,z+row,1,1,1,'gold');}

const hangar=makeScene(true),hB=new Build(),hangarBoats=[],hangarArms=[];
floorTiles(hB,144,390,-1,-210);hB.box(-75,-5,-210,150,4,390,'black');
for(let s of [-1,1]){
hB.box(s===-1?-78:74,0,-210,4,70,390,'dark');
for(let z=-180;z<170;z+=46){hB.center(s*54,0,z,38,3,38,'black');hB.center(s*55,1,z,34,1,2,'gold');for(let dx of [-16,16])hB.center(s*54+dx,1,z,1,1,28,'amber');hB.center(s*68,15,z,10,26,36,'rib');hB.center(s*66,32,z,16,4,36,'hull');hB.center(s*73,48,z,5,28,34,'hull');hB.center(s*72,47,z,2,2,24,'cyan');
stencil(hB,Math.round((z+180)/46)+1,s*51-4,1,z+15);let boat=cloneModel(BOAT);boat.position.set(s*51,5,z);boat.rotation.y=s*Math.PI/2;hangar.add(boat);hangarBoats.push({g:boat,p:boat.position.clone(),i:hangarBoats.length});
// Abstract service claws: two offset telescoping beams, no humanoid form.
let a=new Build();a.center(0,0,0,3,18,4,'gold');a.center(-s*6,-8,0,15,3,4,'hull');a.center(-s*12,-12,0,3,8,5,'rib');let arm=a.group();arm.position.set(s*60,29,z-12);hangar.add(arm);hangarArms.push(arm);
}
hB.center(s*32,1,-10,2,1,370,'cyan');for(let z=-185;z<165;z+=13)hB.center(s*35,1,z,2,1,5,'white');hB.center(s*63,64,-12,7,5,380,'rib');hB.center(s*53,63,-12,2,2,380,'cyan');
}
for(let z=-202;z<185;z+=48){floorPortal(hB,0,0,z,146,70,7,6,'hull');floorPortal(hB,0,0,z+5,130,62,3,2,'gold');hB.center(0,62,z,142,7,8,'rib');hB.center(0,57,z+5,100,1,2,'cyan');for(let s of [-1,1])hB.center(s*50,37,z,26,4,8,'rib')}
// Multiple apertures remain open. The near roof is solid between structural ribs.
for(let z=-190;z<175;z+=48){hB.center(0,70,z,145,3,38,'dark');hB.center(0,67,z,10,2,20,'rib')}
for(let z of [-108,84]){hB.center(0,42,z,144,5,14,'rib');hB.center(0,45,z,134,2,12,'hull');for(let side of [-1,1]){hB.center(0,49,z+side*7,140,2,1,'gold');for(let x=-60;x<=60;x+=15)hB.center(x,47,z+side*7,1,6,1,'rib');}hB.center(0,38,z+7,100,1,1,'amber');}
hangar.add(hB.group());for(let z=-180;z<180;z+=65)point(hangar,'#70c8e9',950,95,0,43,z);
const hangarFlyer=cloneModel(BOAT);hangar.add(hangarFlyer);const returnBoat=cloneModel(BOAT);returnBoat.rotation.y=Math.PI;hangar.add(returnBoat);point(hangar,'#33dfff',400,60,0,14,-50);
for(let i=0;i<5;i++){let escort=cloneModel(i%2?GUARD.model:VAN.model);escort.position.set((i-2)*260,30+(i%2)*120,-700-i*180);addPlumes(escort,(i%2?GUARD:VAN).engines);hangar.add(escort)}
const bridge=makeScene(true),bB=new Build(),screens=[],holo=[],screenScans=[];
floorTiles(bB,130,138,0,-78);bB.center(0,-5,-5,140,8,150,'black');
for(let s of [-1,1]){bB.center(s*66,28,-5,5,58,145,'dark');for(let level=0;level<2;level++){let yy=level*15+2;bB.center(s*50,yy,-6,28,4,130,'hull');bB.center(s*36,yy+4,-5,2,3,130,'gold');for(let z=-57;z<60;z+=25){bB.center(s*48,yy+6,z,18,9,12,'dark');bB.center(s*48,yy+11,z,17,1,10,'cyan');for(let k=0;k<4;k++)bB.center(s*48-6+k*4,yy+12,z,2,1,6,'rib');bB.center(s*60,yy+13,z,2,10,19,'hull');
let scr=new Build();scr.center(0,0,0,17,10,1,'dark');scr.center(0,0,1,15,8,1,'screen');scr.center(-2,3,2,10,1,1,'cyan');scr.center(5,3,2,2,1,1,'gold');for(let k=0;k<4;k++){scr.center(-6+k*3,-1+k%2,2,1,2+k%3,1,'cyan');scr.center(2,-3+k,2,6-k,1,1,k%2?'cyan':'rib');}let g=scr.group();g.position.set(s*47,yy+23,z-5);g.rotation.y=-s*.25;let scan=new Build();scan.center(0,0,3,11,1,1,'cyan');let scanNode=scan.group();g.add(scanNode);screenScans.push(scanNode);bridge.add(g);screens.push(g);
}}
for(let z=-70;z<65;z+=32){bB.center(s*61,30,z,7,60,6,'rib');bB.center(s*56,54,z,16,8,8,'hull');bB.center(s*59,30,z-4,2,38,1,'cyan')}
}
// Layered command dais, a suspended map and side galleries frame the viewing window.
for(let k=0;k<4;k++)bB.center(0,1+k*2,-9,45-k*5,3,45-k*5,k%2?'hull':'dark');bB.center(0,12,-9,29,6,29,'rib');bB.center(0,16,-9,25,2,25,'cyan');bB.center(0,18,-9,23,2,23,'black');
for(let s of [-1,1]){bB.center(s*11,29,-10,1,20,21,'glass');bB.center(s*11,30,-10,2,22,2,'gold');bB.center(s*10,41,-10,4,2,22,'hull')}
for(let z=-75;z<65;z+=34){bB.center(0,59,z,132,5,7,'hull');bB.center(0,55,z,98,2,3,'gold');bB.center(0,54,z+2,75,1,1,'cyan')}
frame(bB,0,0,-78,130,60,5,6,'hull');bB.center(0,5,-73,118,4,4,'rib');bB.center(0,58,-30,138,3,90,'dark');
bridge.add(bB.group());
// The hologram is an optical display; its tiny luminous solids still occupy unit cells.
const hb=new Build();for(let i=0;i<18;i++){let s=i%2?-1:1,x=s*(3+Math.floor(i/6)*3),z=-9+(i%6)*4;hb.center(x,23+(i%3),z,1,1,3,'cyan')}hb.center(0,25,-1,2,2,15,'cyan');const hg=hb.group();hg.position.z=-9;bridge.add(hg);holo.push(hg);
function opticalRing(radius,color){let pts=[];for(let k=0;k<=100;k++){let a=k/100*TAU;pts.push(V(Math.cos(a)*radius,0,Math.sin(a)*radius))}return new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color,transparent:true,opacity:.6,blending:T.AdditiveBlending}))}
for(let k=0;k<3;k++){let ring=opticalRing(15+k*3,'#36cbe2');ring.position.set(0,20+k*3,-9);bridge.add(ring);holo.push(ring)}
const mapRoutes=[],mapRouteGroup=new T.Group();mapRouteGroup.position.set(0,22,-9);bridge.add(mapRouteGroup);
for(let i=0;i<8;i++){let side=i%2?1:-1,lane=Math.floor(i/2),curve=new T.CatmullRomCurve3([V(side*18,0,-13+lane*7),V(side*11,3,-11+lane*4),V(side*4,6,-3+lane*3),V(side*15,1,16-lane*4)]);let pts=curve.getPoints(60),line=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:i<2?'#dba65d':'#4db5c4',transparent:true,opacity:.48,blending:T.AdditiveBlending,depthWrite:false}));mapRouteGroup.add(line);let b=new Build();b.center(0,0,0,1,1,1,i<2?'amber':'ice');let dot=b.group();mapRouteGroup.add(dot);mapRoutes.push({curve,dot,i});}
const bridgeMapLight=point(bridge,'#36dfff',1600,100,0,26,-9);point(bridge,'#53b7ed',650,80,45,35,5);point(bridge,'#53b7ed',650,80,-45,35,5);
for(let i=0;i<8;i++){let e=cloneModel(i%2?VAN.model:GUARD.model);e.position.set((i-3.5)*210,-15+(i%2)*110,-500-Math.floor(i/3)*300);addPlumes(e,(i%2?VAN:GUARD).engines);bridge.add(e)}
const core=makeScene(true),cB=new Build(),coreRings=[],coreLights=[];
// Full-height walls, pierced by repeated recessed panels.
for(let s of [-1,1]){cB.center(s*128,0,0,8,260,258,'dark');cB.center(0,0,s*128,258,260,8,'dark');for(let p=-108;p<=108;p+=36){cB.center(s*122,0,p,8,256,13,'rib');cB.center(p,0,s*122,13,256,8,'rib');cB.center(s*116,0,p,2,246,2,'gold');cB.center(p,0,s*116,2,246,2,'gold')}}
for(let y=-120;y<=120;y+=40){ringVoxel(cB,122,y,31,7,'hull',4);ringVoxel(cB,93,y+6,3,2,'gold',3);ringVoxel(cB,94,y+14,1,1,'gold',2);for(let j=0;j<24;j++){let a=j/24*TAU;cB.center(Math.round(Math.cos(a)*93),y+10,Math.round(Math.sin(a)*93),1,8,1,'rib');}ringVoxel(cB,121,y-4,5,3,'cyan',3);for(let a=0;a<4;a++){let x=Math.round(Math.cos(a*Math.PI/2)*72),z=Math.round(Math.sin(a*Math.PI/2)*72);if(a%2===0){cB.center(x,y-6,0,83,7,13,'rib');cB.center(x,y-1,0,72,1,2,'cyan')}else {cB.center(0,y-6,z,13,7,83,'rib');cB.center(0,y-1,z,2,1,72,'cyan')}}}
for(let y of [-124,124]){ringVoxel(cB,65,y,26,7,'rib',3);ringVoxel(cB,41,y+1,3,6,'gold',2);for(let side of [-1,1]){cB.center(side*60,y,0,75,7,11,'hull');cB.center(0,y,side*60,11,7,75,'hull');}}
// Central luminous stack and four massive corner columns.
for(let y=-112;y<115;y+=7){let width=8+Math.round(20*Math.pow(Math.cos(y/224*Math.PI),2));cB.center(0,y,0,4,5,4,'ice');for(let side of [-1,1])cB.center(side*(width/4+2),y,0,Math.max(3,width/2-3),5,width,y%5?'cyan':'ice');for(let s of [-1,1]){cB.center(s*24,y,0,5,2,39,'rib');cB.center(0,y,s*24,39,2,5,'rib');cB.center(s*27,y,0,1,4,22,'gold')}}
for(let x of [-18,18])for(let z of [-18,18])cB.center(x,0,z,6,236,6,'hull');
for(let k=0;k<6;k++){let b=new Build();ringVoxel(b,38+(k%2)*5,0,6,7,k%2?'gold':'hull',2);ringVoxel(b,32+(k%2)*5,-2,2,3,'cyan',2);for(let a=0;a<4;a++){let x=Math.round(Math.cos(a*Math.PI/2)*33),z=Math.round(Math.sin(a*Math.PI/2)*33);b.center(x,3,z,9,10,9,'rib');b.center(x,9,z,5,2,5,'cyan')}let g=b.group();g.position.y=-90+k*36;core.add(g);coreRings.push(g)}
const coreRadialFlow=[];for(let y=-120;y<=120;y+=40)for(let dir=0;dir<4;dir++){let b=new Build();b.center(0,0,0,3,1,3,'ice');b.center(0,0,4,2,1,2,'cyan');let g=b.group();core.add(g);coreRadialFlow.push({g,y,dir,index:coreRadialFlow.length});}
const coreBody=cB.group(),coreEmitter=mats.cyan.clone();for(let g of coreBody.children)if(g.material===mats.cyan)g.material=coreEmitter;core.add(coreBody);const coreFlow=[];for(let i=0;i<20;i++){let b=new Build();b.center(0,0,0,3,5,3,i%4?'cyan':'ice');let g=b.group();core.add(g);coreFlow.push(g);}for(let y=-90;y<=100;y+=45)coreLights.push(point(core,'#32ddeb',3500,175,0,y,0));
const energy=makeScene(true),eB=new Build(),energySlugs=[],jaws=[];
floorTiles(eB,100,390,0,-210);
for(let s of [-1,1]){eB.center(s*55,35,-15,6,76,400,'dark');eB.center(s*45,3,-15,8,5,390,'hull');eB.center(s*39,5,-15,1,1,385,'amber');eB.center(s*45,67,-15,8,7,390,'rib');eB.center(s*43,61,-15,2,2,390,'cyan');
for(let z=-180;z<180;z+=32){eB.center(s*46,26,z,7,42,24,'rib');eB.center(s*37,47,z,22,6,24,'hull');eB.center(s*37,7,z,22,6,24,'hull');for(let edge of [-1,1])eB.center(s*35,27,z+edge*11,18,38,3,'hull');eB.center(s*43,27,z,3,34,17,'black');eB.center(s*39,29,z,5,27,12,'cyan');for(let k=0;k<4;k++){eB.center(s*30,15+k*8,z+1,6,4,24,'hull');eB.center(s*27,15+k*8,z-10,2,2,4,'gold')}
let jawB=new Build();jawB.center(0,12,0,5,4,18,'hull');jawB.center(0,-12,0,5,4,18,'hull');jawB.center(0,0,7,5,28,3,'rib');jawB.center(-s*3,0,-8,6,6,4,'gold');let jaw=jawB.group();jaw.position.set(s*25,33,z);energy.add(jaw);jaws.push({g:jaw,s,z});}
}
for(let z=-174;z<180;z+=64){eB.center(0,66,z,32,8,18,'rib');for(let side of [-1,1]){eB.center(side*13,56,z,5,17,14,'hull');eB.center(side*10,56,z-8,2,11,2,'amber');eB.center(side*6,57,z,2,10,6,'cyan');}eB.center(0,51,z,15,4,11,'white');}
for(let z=-206;z<190;z+=36){floorPortal(eB,0,0,z,108,76,7,5,'hull');floorPortal(eB,0,0,z+6,94,69,2,2,'gold');eB.center(0,70,z,70,3,12,'rib');for(let x of [-17,0,17])eB.center(x,64,z,6,12,6,'dark')}
frame(eB,0,0,-214,102,76,6,10,'rib');frame(eB,0,7,-219,85,58,3,4,'cyan');frame(eB,0,13,-224,68,46,4,6,'hull');frame(eB,0,16,-230,57,40,5,4,'rib');frame(eB,0,20,-238,43,32,4,3,'cyan');for(let x=-12;x<=12;x+=8)eB.center(x,36,-245,4,22,3,'ice');
energy.add(eB.group());for(let i=0;i<24;i++){let b=new Build();b.center(0,0,0,6,6,10,'cyan');b.center(0,0,0,4,8,6,'ice');let g=b.group();energy.add(g);energySlugs.push(g)}for(let z=-190;z<190;z+=65)point(energy,'#3dcfe1',1500,95,0,34,z);
const lightVolumes=[];
function lightShaft(scene,from,to,topRadius,bottomRadius,color,opacity){let mat=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,uniforms:{time:{value:0},color:{value:new T.Color(color)},opacity:{value:opacity}},vertexShader:'varying vec2 vUv;varying vec3 vn;varying vec3 eye;void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.);vn=normalize(normalMatrix*normal);eye=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec2 vUv;varying vec3 vn;varying vec3 eye;uniform float time;uniform vec3 color;uniform float opacity;void main(){float radial=pow(abs(dot(normalize(vn),normalize(eye))),1.5);float axial=smoothstep(0.,.1,vUv.y)*(1.-smoothstep(.92,1.,vUv.y))*(.3+.7*vUv.y);float rays=.6+.4*pow(max(0.,.5+.5*cos(vUv.x*31.4159+sin(vUv.y*9.-time*4.)*.2)),12.);gl_FragColor=vec4(color,opacity*radial*axial*rays);}'});let len=from.distanceTo(to),g=new T.Mesh(new T.CylinderGeometry(topRadius,bottomRadius,len,40,1,true),mat);g.position.copy(from).add(to).multiplyScalar(.5);g.quaternion.setFromUnitVectors(V(0,1,0),from.clone().sub(to).normalize());scene.add(g);lightVolumes.push(mat);}
for(let z of [-150,-50,50,150])lightShaft(hangar,V(0,57,z),V(0,1,z),2,18,'#51b6cd',.022);
lightShaft(bridge,V(0,40,-9),V(0,19,-9),22,12,'#53cbd8',.015);
lightShaft(core,V(0,115,0),V(0,-115,0),34,34,'#1cabc5',.007);
lightShaft(energy,V(0,36,-244),V(0,36,-25),12,37,'#318aab',.012);
const coreHelices=[];for(let i=0;i<2;i++){let geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(new Float32Array(181*3),3));let g=new T.Line(geo,new T.LineBasicMaterial({color:i?'#82f9ed':'#d7fcff',transparent:true,opacity:.6,blending:T.AdditiveBlending,depthWrite:false}));g.frustumCulled=false;core.add(g);coreHelices.push(g);}
function interiorLighting(scene,ambient,key,fill,density){scene.children.find(o=>o.isHemisphereLight).intensity=ambient;let d=scene.children.filter(o=>o.isDirectionalLight);d[0].intensity=key;d[1].intensity=fill;scene.fog.density=density;}
interiorLighting(hangar,.55,1.15,.65,.0021);interiorLighting(bridge,.6,1.2,.65,.0014);interiorLighting(core,.4,.45,.3,.0018);interiorLighting(energy,.5,.8,.5,.0019);
// ASTEROIDS — each body is a set of interlocking voxel fragments. Fracture exposes real voids.
const rocks=[], rockSeed=rand(942);
material('fracture','#8b5940',.3,.8,'#ff9a39',0);
function asteroidParts(seed,r){const builds=Array.from({length:8},()=>new Build()),bases=Array.from({length:8},(_,i)=>V(i&1?1:-1,i&2?1:-1,i&4?1:-1).multiplyScalar(Math.round(r*.4)));
 function inside(x,y,z){let q=x*x/(r*r)+y*y/(r*r*.72)+z*z/(r*r*1.30);let contour=.16*Math.sin(x*.10+seed)*Math.cos(z*.08)+.12*Math.sin(y*.14+z*.085)+.08*Math.cos(x*.22-y*.12);let tunnel=Math.hypot(x-r*.15,y+r*.17)<r*.13&&z<r*.1;return q<.83+contour&&!tunnel;}
 function part(x,y,z){return (x>7*Math.sin(y*.06+seed)+4*Math.cos(z*.09)?1:0)+(y>5*Math.sin(z*.10)+3*Math.sin(x*.08)?2:0)+(z>5*Math.sin(x*.075+y*.04)?4:0);}
 let min=-Math.ceil(r/3)*3;for(let x=min;x<r;x+=3)for(let y=min;y<r;y+=3)for(let z=min;z<r;z+=3){let cx=x+1.5,cy=y+1.5,cz=z+1.5;if(!inside(cx,cy,cz))continue;let id=part(cx,cy,cz),cut=false,surface=false;for(let q of [[3,0,0],[-3,0,0],[0,3,0],[0,-3,0],[0,0,3],[0,0,-3]]){let nx=cx+q[0],ny=cy+q[1],nz=cz+q[2];if(!inside(nx,ny,nz))surface=true;else if(part(nx,ny,nz)!==id)cut=true;}if(!surface&&!cut)continue;let hash=fract(Math.sin(cx*31+cy*15+cz*51+seed)*43758.5),vein=Math.abs(Math.sin(cx*.14+cy*.17+cz*.11));let mat=cut?(vein<.15?'fracture':hash<.48?'rock':'rockLight'):hash<.13?'rockLight':hash>.9?'rockDark':'rock';let base=bases[id];builds[id].box(x-base.x,y-base.y,z-base.z,3,3,3,mat);}
 return builds.map((b,i)=>({g:b.group(),base:bases[i]}));}
const HIT=[59.4,60.9,61.55,65.5,65.63,65.76];
const targetPositions=[V(-80,20,-1780),V(255,110,-1930),V(-440,-100,-1660),V(40,-130,-2110),V(530,-20,-2200),V(-680,210,-2300)];
for(let i=0;i<14;i++){let pos=i<6?targetPositions[i]:V((rockSeed()-.5)*2400,(rockSeed()-.5)*650,-1700-rockSeed()*1800);let root=new T.Group();root.position.copy(pos);exterior.add(root);let fragments=[];let size=i===0?84:i===2?40:i<6?54+Math.floor(rockSeed()*22):32+Math.floor(rockSeed()*34);let fractureMat=mats.fracture.clone();if(i<6)fractureMat.emissive.set(['#62dce8','#ffb15e','#f4ce91','#ff873a','#ff873a','#ff873a'][i]);let parts=asteroidParts(700+i*31,size);for(let j=0;j<8;j++){let direction=V(j&1?1:-1,j&2?1:-1,j&4?1:-1),part=parts[j],base=part.base,piece=part.g;for(let mesh of piece.children)if(mesh.material===mats.fracture)mesh.material=fractureMat;piece.position.copy(base);root.add(piece);fragments.push({g:piece,base,dir:direction.normalize(),j})}rocks.push({root,pos,fragments,i,size,fractureMat})}
// Each weapon opens the same lattice differently. These are analytic animation poses, not a physics simulation.
function fragmentPose(rock,part,time){let age=rock.i<6?Math.max(0,time-HIT[rock.i]):0,pos=part.base.clone(),rot=new T.Euler(),j=part.j;if(age<=0)return{pos,rot};
 if(rock.i===0){let side=j&1?1:-1,centre=V(side*Math.round(rock.size*.4),0,0);rot.set(0,side*.03*age,side*.014*age);pos.sub(centre).applyEuler(rot).add(centre);pos.x+=side*(28*smooth(0,2.2,age)+Math.max(0,age-2.2)*5);let peel=Math.max(0,age-2.2);pos.addScaledVector(part.dir,peel*(2+j));rot.x+=peel*.03*(j%2?1:-1);rot.y+=peel*.025*(j%3-1);}
 else if(rock.i===1){let delay=[.05,9,.48,9,9,.24,9,.74][j],u=Math.max(0,age-delay);pos.addScaledVector(part.dir,u*(10+j*1.8));rot.set(u*.14*(j%2?1:-1),u*.11*(j%3-1),u*.09);}
 else if(rock.i===2){let u=Math.max(0,age-j*.06);pos.addScaledVector(part.dir,u*(15+j*1.8));rot.set(u*.24*(j%2?1:-1),u*.18*(j%3-1),u*.13);}
 else {let u=Math.max(0,age-.16-j%3*.055),travel=14*smooth(0,.35,u)+Math.pow(u,1.1)*(16+j*1.5);pos.addScaledVector(part.dir,travel);pos.y+=Math.sin(j*2.4)*u*4;rot.set(u*.18*(j%2?1:-1),u*.16*(j%3-1),u*.12*(j%2?1:-1));}
 return{pos,rot};}
function impactPoint(target,time,index){let rock=rocks[target],part=rock.fragments[(index%4)|4],pose=fragmentPose(rock,part,time),p=V(0,0,rock.size*.18).applyEuler(pose.rot).add(pose.pos);p.applyEuler(new T.Euler(Math.sin(time*.02+target)*.06,time*.008,0));return p.add(rock.pos);}
// Scene-local optical effects use smooth geometry; all projectile bodies are voxels.
function beam(start,end,radius,color,opacity=1){let g=new T.Mesh(new T.CylinderGeometry(1,1,1,12,1,true),new T.MeshBasicMaterial({color,transparent:true,opacity,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide}));exterior.add(g);setBeam(g,start,end,radius);return g}
function setBeam(g,a,b,w){let d=new T.Vector3().subVectors(b,a);g.position.copy(a).add(b).multiplyScalar(.5);g.quaternion.setFromUnitVectors(V(0,1,0),d.clone().normalize());g.scale.set(w,d.length(),w)}
const mainStart=V(0,5,-490), mainEnd=targetPositions[0];
const mainBeams=[beam(mainStart,mainEnd,3,'#d5ffff',.95),beam(mainStart,mainEnd,7,'#36eeff',.32),beam(mainStart,mainEnd,16,'#1088dd',.13)];
const chargeGroup=new T.Group();chargeGroup.position.copy(mainStart);exterior.add(chargeGroup);for(let i=0;i<3;i++){let ring=opticalRing(10+i*9,'#39efff');ring.rotation.x=Math.PI/2;chargeGroup.add(ring)}
const muzzleLight=point(exterior,'#42eaff',1,380,0,10,-470),impactLight=point(exterior,'#ffaa4d',1,500,...mainEnd.toArray());
const pulseBolts=[],ciwsBolts=[],missiles=[],muzzleFlashes=[],impactEvents=[];
function muzzle(head,side=1){let p=V(...head.g.userData.muzzle);p.x*=side;return head.g.localToWorld(p);}
function opticalFlash(color){let g=new T.Group(),m=new T.MeshBasicMaterial({color,transparent:true,blending:T.AdditiveBlending,depthWrite:false});let spark=new T.Mesh(new T.SphereGeometry(1,8,5),m);g.add(spark);let ring=opticalRing(1,color);ring.rotation.x=Math.PI/2;g.add(ring);exterior.add(g);return g;}
for(let i=0;i<80;i++){let hi=i%20,head=flagshipItem.heads[hi],target=hi%3===0?0:1,launch=60.0+Math.floor(i/20)*.72+hi*.024,end=impactPoint(target,launch+.83,hi),g=new T.Group();let c=new T.Mesh(new T.SphereGeometry(1,8,5),new T.MeshBasicMaterial({color:'#c2ffff'}));c.scale.set(2.1,2.1,5.5);g.add(c);let glow=new T.Mesh(new T.SphereGeometry(1,10,6),new T.MeshBasicMaterial({color:'#31aece',transparent:true,opacity:.23,blending:T.AdditiveBlending,depthWrite:false}));glow.scale.set(5.5,5.5,13);g.add(glow);exterior.add(g);let start=V(),trail=beam(start,V(0,0,-1),1.3,'#52ddf5',.6),hit=launch+.83;let p={g,start,end,trail,index:i,head,side:i%2?1:-1,launch,hit,target};pulseBolts.push(p);impactEvents.push({time:hit,target,size:5,kind:'pulse',offset:end.clone().sub(targetPositions[target])});}
const guardShooters=[fleet[13],fleet[14],fleet[15]];
for(let i=0;i<120;i++){let ship=guardShooters[i%3],head=ship.heads[Math.floor(i/3)%6],target=2,launch=61.1+Math.floor(i/6)*.16+i%6*.019,hit=launch+.45,end=impactPoint(target,hit,i),start=V(),g=beam(start,V(0,0,-1),.52,'#ffdfa0',.85);head.target=target;ciwsBolts.push({g,start,end,index:i,head,side:i%2?1:-1,launch,hit});impactEvents.push({time:hit,target,size:2,kind:'ciws',offset:end.clone().sub(targetPositions[target])});}
const rocketPlumeMat=plumeMat.clone();rocketPlumeMat.fragmentShader=rocketPlumeMat.fragmentShader.replace('vec3(.035,.25,.65)','vec3(.5,.08,.005)').replace('vec3(.35,1.0,1.4)','vec3(1.6,.8,.23)');
for(let i=0;i<16;i++){let launch=63.1+i*.13,ship=i<7?fleet[25]:i<13?fleet[26]:fleet[27],slot=V(i%2?-40:40,14,-43+(i%6)*12),start=ship.base.clone().add(slot),end=impactPoint(3+i%3,launch+2.4,i),b=new Build();b.center(0,0,0,3,3,10,'white');b.center(0,0,-7,1,1,4,'gold');for(let sign of [-1,1])b.center(sign*2,0,3,2,1,4,'rib');b.center(0,0,6,2,2,1,'amber');let g=b.group(),emitter=null;for(let mesh of g.children)if(mesh.material===mats.amber){mesh.material=mesh.material.clone();emitter=mesh.material;}addPlumes(g,[[0,0,7,2,2]]);let exhaust=g.children[g.children.length-1];for(let mesh of exhaust.children)mesh.material=rocketPlumeMat;exhaust.visible=false;exterior.add(g);let geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(61*3),3));let colors=[];for(let j=0;j<=60;j++){let v=.03+.97*(j/60)**1.7;colors.push(v,v*.5,v*.21);}geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));let trail=new T.Line(geo,new T.LineBasicMaterial({color:'#ffd9a8',vertexColors:true,transparent:true,opacity:.8,blending:T.AdditiveBlending,depthWrite:false}));exterior.add(trail);missiles.push({g,trail,start,end,index:i,ship,slot,launch,emitter,exhaust,hit:launch+2.4,control:start.clone().lerp(end,.42).add(V((i%2?1:-1)*130,130+i%4*23,0))});impactEvents.push({time:launch+2.4,target:3+i%3,size:13,kind:'missile',offset:end.clone().sub(targetPositions[3+i%3])});}
function missilePoint(m,u){return m.start.clone().multiplyScalar((1-u)**2).addScaledVector(m.control,2*u*(1-u)).addScaledVector(m.end,u*u);}
for(let head of [...flagshipItem.heads,...guardShooters.flatMap(f=>f.heads)]){let g=opticalFlash(head.type==='pulse'?'#a5f8ff':'#ffe0a5');muzzleFlashes.push({g,head});}
const impactSparks=impactEvents.map(e=>({g:opticalFlash(e.kind==='pulse'?'#69e8f7':'#ffc077'),e}));
const beamFlowMaterials=[];mainBeams.forEach((g,i)=>{let m=new T.ShaderMaterial({transparent:true,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,uniforms:{time:{value:0},color:{value:new T.Color(['#d5ffff','#36d5f5','#1688cc'][i])},opacity:{value:[.94,.32,.12][i]}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float time;uniform vec3 color;uniform float opacity;void main(){float flow=.79+.21*sin(vUv.y*95.-time*18.+sin(vUv.x*25.));float filaments=.83+.17*cos(vUv.x*55.+vUv.y*17.-time*8.);gl_FragColor=vec4(color*flow*filaments,opacity);}'});g.material=m;beamFlowMaterials.push(m);});
const localGunLights=[point(exterior,'#70dfe9',0,160,88,85,-340),point(exterior,'#ffd291',0,120,310,65,-390)];
const shieldLights=[point(exterior,'#3acfe8',0,440,0,35,-290),point(exterior,'#3acfe8',0,440,0,35,280)];for(let light of shieldLights)flagshipItem.root.add(light);
const hitLights=[];for(let i=0;i<6;i++)hitLights.push(point(exterior,'#ff9f44',0,320,...targetPositions[i].toArray()));
// Small, screen-facing motes gain short streaks only during the forward surge.
let speedGeo=new T.BufferGeometry(),speedPositions=new Float32Array(160*6);speedGeo.setAttribute('position',new T.Float32BufferAttribute(speedPositions,3));let speedLines=new T.LineSegments(speedGeo,new T.LineBasicMaterial({color:'#58849e',transparent:true,opacity:.28,blending:T.AdditiveBlending,depthWrite:false}));exterior.add(speedLines);speedLines.frustumCulled=false;
const flashes=[];for(let i=0;i<6;i++){let g=new T.Group();g.position.copy(targetPositions[i]);for(let k=0;k<3;k++){let m=new T.Mesh(new T.SphereGeometry(1,20,12),new T.MeshBasicMaterial({color:k?'#ff983e':'#e3ffff',transparent:true,opacity:.1,blending:T.AdditiveBlending,depthWrite:false}));g.add(m)}let shock=opticalRing(1,'#ffbe68');shock.rotation.x=Math.PI/2;g.add(shock);exterior.add(g);flashes.push(g)}
const splinters=[];let sr=rand(801),debrisTemplates=[];for(let k=0;k<4;k++){let b=new Build();b.center(0,0,0,2+k*2,2+k,3+k*2,'rock');if(k>0){b.center(k,1,-k,3,2+k,3,'rockLight');b.center(-k,-1,k,2+k,2,2+k,'rockDark');}debrisTemplates.push(b.group());}
for(let i=0;i<210;i++){let k=i%11===0?3:i%5===0?2:i%3===0?1:0,g=cloneModel(debrisTemplates[k]);exterior.add(g);splinters.push({g,target:i%6,dir:V(sr()-.5,sr()-.5,sr()-.5).normalize(),speed:(22+sr()*70)/(1+k*.3),spin:sr()*3,origin:V((sr()-.5)*65,(sr()-.5)*45,(sr()-.5)*55)});}
const shotChips=[],chipBuilder=new Build();chipBuilder.center(0,0,0,1,1,2,'rockLight');const chipTemplate=chipBuilder.group();
for(let i=0;i<impactEvents.length;i++){let e=impactEvents[i];if(e.kind==='missile'||(e.kind==='ciws'?i%3!==0:i%2!==0))continue;let g=cloneModel(chipTemplate),seed=rand(550+i);exterior.add(g);shotChips.push({g,e,dir:V(seed()-.5,seed()-.5,seed()-.5).normalize(),speed:10+seed()*26,spin:.7+seed()*2});}
const particulateGeo=new T.BufferGeometry(),particulatePos=new Float32Array(300*3),particulateAlpha=new Float32Array(300);particulateGeo.setAttribute('position',new T.BufferAttribute(particulatePos,3));particulateGeo.setAttribute('glow',new T.BufferAttribute(particulateAlpha,1));
const particulate=new T.Points(particulateGeo,new T.ShaderMaterial({transparent:true,blending:T.AdditiveBlending,depthWrite:false,vertexShader:'attribute float glow;varying float g;void main(){vec4 p=modelViewMatrix*vec4(position,1.);g=glow;gl_PointSize=clamp(500./max(1.,-p.z),1.,5.);gl_Position=projectionMatrix*p;}',fragmentShader:'varying float g;void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(1.,.57,.22,g*pow(max(0.,1.-d),2.));}'}));particulate.frustumCulled=false;exterior.add(particulate);
const nearDrifters=[];for(let k=0;k<3;k++){let b=new Build(),r=9+k*5;for(let x=-r;x<r;x+=3)for(let y=-r;y<r;y+=3)for(let z=-r;z<r;z+=3){let len=Math.hypot(x,y*.9,z*1.1);if(len<r+Math.sin(x*.7+z*.3)*2&&len>r-6)b.box(x,y,z,3,3,3,(x+y+z)%4?'rock':'rockLight');}let template=b.group();for(let j=0;j<7;j++){let g=cloneModel(template),i=k*7+j;exterior.add(g);nearDrifters.push({g,i,x:280+fract(i*.618+ .23)*1450,y:-320+fract(i*.754+.17)*720,phase:fract(i*.414+.7)});}}
// Bloom is computed from this frame's HDR render, never from prerecorded assets.
const quadScene=new T.Scene(),quadCam=new T.OrthographicCamera(-1,1,1,-1,0,1),quad=new T.Mesh(new T.PlaneGeometry(2,2),null);quadScene.add(quad);
const passVert='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const bloomMat=new T.ShaderMaterial({vertexShader:passVert,fragmentShader:`varying vec2 vUv;uniform sampler2D tex;uniform vec2 direction;uniform float threshold;void main(){vec3 c=vec3(0.);for(int i=-4;i<=4;i++){vec3 s=texture2D(tex,vUv+direction*float(i)).rgb;float l=max(s.r,max(s.g,s.b));s*=max(0.,l-threshold)/max(l,.0001);c+=s*exp(-float(i*i)/8.)*.20416;}gl_FragColor=vec4(c,1.);}`,uniforms:{tex:{value:null},direction:{value:new T.Vector2()},threshold:{value:0}}});
const composite=new T.ShaderMaterial({vertexShader:passVert,fragmentShader:`varying vec2 vUv;uniform sampler2D image;uniform sampler2D bloom1;uniform sampler2D bloom2;uniform sampler2D bloom3;uniform vec2 resolution;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}void main(){vec3 c=texture2D(image,vUv).rgb;vec3 glow=texture2D(bloom1,vUv).rgb*.32+texture2D(bloom2,vUv).rgb*.28+texture2D(bloom3,vUv).rgb*.32;c+=glow;c=aces(c*.91);c=pow(c,vec3(1./2.2));float vign=1.-.16*pow(length((vUv-.5)*vec2(1.,.8)),1.4);c*=vign;float d=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/500.;c+=d;float bar=step(.055,vUv.y)*step(vUv.y,.945);gl_FragColor=vec4(c*bar,1.);}`,uniforms:{image:{value:null},bloom1:{value:null},bloom2:{value:null},bloom3:{value:null},resolution:{value:new T.Vector2()}}});
const targetOpts={type:T.HalfFloatType,format:T.RGBAFormat,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true};let hdr=new T.WebGLRenderTarget(1,1,targetOpts);hdr.samples=4;hdr.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);let bloomTargets=[];for(let i=0;i<6;i++)bloomTargets.push(new T.WebGLRenderTarget(1,1,{...targetOpts,depthBuffer:false}));

const aoTarget=new T.WebGLRenderTarget(1,1,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false});
const aoMat=new T.ShaderMaterial({vertexShader:passVert,uniforms:{depth:{value:hdr.depthTexture},invProjection:{value:camera.projectionMatrixInverse},projection:{value:camera.projectionMatrix},radius:{value:5}},fragmentShader:`varying vec2 vUv;uniform sampler2D depth;uniform mat4 invProjection;uniform mat4 projection;uniform float radius;
vec3 pos(vec2 uv){float d=texture2D(depth,uv).x;vec4 p=invProjection*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}
void main(){float dep=texture2D(depth,vUv).x;if(dep>.99999){gl_FragColor=vec4(1.);return;}vec3 p=pos(vUv);vec3 n=normalize(cross(dFdx(p),dFdy(p)));if(dot(n,-p)<0.)n=-n;float occ=0.;float angle=fract(sin(dot(gl_FragCoord.xy,vec2(12.98,78.23)))*43758.5)*6.283;vec2 screenRadius=vec2(projection[0][0],projection[1][1])*radius/max(1.,-p.z)*.5;for(int i=0;i<16;i++){float k=(float(i)+.5)/16.;float a=float(i)*2.39996+angle;vec2 uv=vUv+vec2(cos(a),sin(a))*sqrt(k)*screenRadius;vec3 dp=pos(uv)-p;float len=length(dp);float occ1=smoothstep(.08,.6,dot(n,dp))*max(0.,1.-len/radius);occ+=occ1;}float ao=clamp(1.-occ*.25,.34,1.);gl_FragColor=vec4(vec3(ao),1.);}`});
composite.uniforms.ao={value:aoTarget.texture};
composite.fragmentShader=composite.fragmentShader.replace('uniform vec2 resolution;','uniform vec2 resolution;uniform sampler2D ao;').replace('c+=glow;c=aces',`float occ=0.;for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)occ+=texture2D(ao,vUv+vec2(float(x),float(y))*2./resolution).r/9.;c*=occ;c+=glow;c=aces`);
function resize(){let w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();hdr.setSize(w,h);aoTarget.setSize(Math.ceil(w/2),Math.ceil(h/2));for(let i=0;i<3;i++)for(let j=0;j<2;j++)bloomTargets[i*2+j].setSize(Math.max(1,w>>i+1),Math.max(1,h>>i+1));composite.uniforms.resolution.value.set(w,h)}addEventListener('resize',resize);resize();
function post(scene){renderer.setRenderTarget(hdr);renderer.clear();renderer.render(scene,camera);quad.material=aoMat;aoMat.uniforms.radius.value=scene===exterior?9:4;renderer.setRenderTarget(aoTarget);renderer.render(quadScene,quadCam);let input=hdr.texture;for(let i=0;i<3;i++){let a=bloomTargets[i*2],b=bloomTargets[i*2+1];quad.material=bloomMat;bloomMat.uniforms.tex.value=input;bloomMat.uniforms.threshold.value=i===0?1:0;bloomMat.uniforms.direction.value.set(1/a.width,0);renderer.setRenderTarget(a);renderer.render(quadScene,quadCam);bloomMat.uniforms.tex.value=a.texture;bloomMat.uniforms.threshold.value=0;bloomMat.uniforms.direction.value.set(0,1/a.height);renderer.setRenderTarget(b);renderer.render(quadScene,quadCam);input=b.texture}
quad.material=composite;composite.uniforms.image.value=hdr.texture;for(let i=0;i<3;i++)composite.uniforms['bloom'+(i+1)].value=bloomTargets[i*2+1].texture;renderer.setRenderTarget(null);renderer.render(quadScene,quadCam)}
const travelSamples=new Float64Array(2049);for(let i=1;i<=2048;i++){let t=(i-.5)/2048*DURATION;travelSamples[i]=travelSamples[i-1]+1+3.5*(smooth(70,77,t)+1-smooth(0,7,t));}
function travelPhase(t){let u=clamp(t/DURATION)*2048,i=Math.min(2047,Math.floor(u));return mix(travelSamples[i],travelSamples[i+1],u-i)/travelSamples[2048];}
// Continuous Catmull–Rom paths pass through purposeful compositions, rather than orbiting one point.
function path(points){return new T.CatmullRomCurve3(points.map(a=>V(...a)),false,'catmullrom',.28)}
const openingPath=path([[1120,510,-1220],[1050,420,-1010],[690,245,-680],[350,130,-410],[300,60,95],[220,-56,555]]);
const openingLook=path([[0,0,-10],[0,5,-10],[0,15,-90],[0,10,-30],[150,7,130],[0,-4,455]]);

const attackPath=path([[850,510,120],[650,350,-150],[440,215,-70],[560,185,-80],[620,240,-680],[430,250,-1200],[980,570,-820]]);
const attackLook=path([[0,10,-650],[0,10,-1100],[230,30,-650],[310,20,-650],[380,45,-1580],[100,0,-2000],[0,0,-100]]);
const shieldPath=path([[980,570,-820],[1290,650,-1080],[1178.333,585,-1395],[1120,510,-1220]]);
const shieldLook=path([[0,0,-100],[0,0,-10],[0,-4.1667,-10],[0,0,-10]]);
function curveVelocity(curve,u,duration){let a=Math.max(0,u-.0001),b=Math.min(1,u+.0001);return curve.getPoint(b).sub(curve.getPoint(a)).divideScalar((b-a)*duration);}
function hermitePose(curveA,curveB,t){let ua=13.5/14,ub=.5/9,u=t-68.5,u2=u*u,u3=u2*u;return curveA.getPoint(ua).multiplyScalar(2*u3-3*u2+1).addScaledVector(curveVelocity(curveA,ua,14),u3-2*u2+u).addScaledVector(curveB.getPoint(ub),-2*u3+3*u2).addScaledVector(curveVelocity(curveB,ub,9),u3-u2);}

function hermitePoint(a,b,va,vb,u,seconds){let u2=u*u,u3=u2*u;return a.clone().multiplyScalar(2*u3-3*u2+1).addScaledVector(va,seconds*(u3-2*u2+u)).addScaledVector(b,-2*u3+3*u2).addScaledVector(vb,seconds*(u3-u2));}
function sternCamera(t){let a=openingPath.getPoint(.8),la=openingLook.getPoint(.8),b=V(240,-48,410),lb=V(30,-15,370),c=V(170,15,740),lc=V(0,-3,510),vb=V(-36.1,-12.5,179.17),vlb=V(-41.7,-2.77,105.6);if(t<16.4){let u=(t-14.4)/2;cam(hermitePoint(a,b,curveVelocity(openingPath,.8,18),vb,u,2),hermitePoint(la,lb,curveVelocity(openingLook,.8,18),vlb,u,2),48);}else{let u=(t-16.4)/1.6;cam(hermitePoint(b,c,vb,V(-40,40,200),u,1.6),hermitePoint(lb,lc,vlb,V(0,0,85),u,1.6),48);}}
function cam(p,l,fov=48){camera.position.copy(p);camera.up.set(0,1,0);camera.lookAt(l);if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix()}camera.updateMatrixWorld()}
let activeScene=exterior,lastTime=0;
function shipBoost(root,t){let delay=root.userData.accelDelay||0;return smooth(71+delay,76.5+delay,t);}
function renderAt(t,draw=true){t=((t%DURATION)+DURATION)%DURATION;lastTime=t;
// Periodic motion and integrated travel keep the final frame connected to the first.
let spread=smooth(52,57,t)*(1-smooth(68,74,t)),accel=smooth(71,76.5,t),openingResidue=1-smooth(0,6,t),opticalTime=t*OMEGA;
for(let f of fleet){let i=f.i;f.root.userData.accelDelay=i?clamp((f.base.z+1500)/3000)*.9:0;f.root.position.copy(f.base);if(i){f.root.position.x+=Math.sign(f.base.x)*spread*(28+i%4*7)+Math.sin(opticalTime*2+i)*3;f.root.position.y+=Math.sin(opticalTime*3+i*2)*2;f.root.position.z+=Math.sin(opticalTime+i)*5;}f.root.rotation.y=i?Math.sin(opticalTime*2+i)*.004:Math.sin(opticalTime)*.001;f.root.updateMatrixWorld(true);
 for(let hi=0;hi<f.heads.length;hi++){let h=f.heads[hi];if(h.type==='pulse')h.target=hi%3===0?0:1;let target=impactPoint(h.target,t+.5,hi),local=f.root.worldToLocal(target.clone()).sub(h.g.position).normalize(),aim=new T.Quaternion().setFromUnitVectors(V(0,0,-1),local),amount=smooth(h.type==='pulse'?55.5:59.8,h.type==='pulse'?58.2:61.0,t)*(1-smooth(67,69,t));h.g.quaternion.identity().slerp(aim,amount);h.emitter.emissiveIntensity=.12;}
 f.root.updateMatrixWorld(true);
}
for(let p of plumes){let localBoost=shipBoost(p.g.parent,t);p.g.scale.z=p.len*(1+(localBoost+openingResidue)*1.7)*(1+.055*Math.sin(opticalTime*37+p.len));}plumeMat.uniforms.time.value=opticalTime;rocketPlumeMat.uniforms.time.value=opticalTime;plumeMat.uniforms.power.value=1+(accel+openingResidue)*.7;engineLight.intensity=18000*(1+(accel+openingResidue)*3);
for(let s of shields){let onset=69+s.index*.065,reveal=smooth(onset,onset+1.7,t),amount=smooth(onset,onset+.35,t)*(1-.65*smooth(75,78,t));if(t<7){amount=.35*(1-smooth(0,6,t));reveal=1;}s.mesh.visible=amount>.001;s.mat.uniforms.time.value=opticalTime;s.mat.uniforms.amount.value=amount;s.mat.uniforms.reveal.value=reveal;let lighting=fleet[s.index].lighting;lighting.front.value=mix(-.63,.63,reveal)*fleet[s.index].template.length;lighting.strength.value=amount;lighting.crest.value=1-smooth(.93,1,reveal);let expansion=.82+.18*reveal;const tmp=fleet[s.index].template;s.mesh.scale.set(tmp.width*.62*expansion,tmp.height*.65*expansion,tmp.length*(s.index?.72:.58)*expansion);}
for(let i=0;i<shieldLights.length;i++){let q=smooth(69+i*.4,70.2+i*.4,t)*(1-smooth(74,78,t));shieldLights[i].intensity=q*16000;}
// Bay traffic clears the roof and outer arm before climbing or turning.
for(let boat of hullBoats){let side=boat.userData.side,z=boat.userData.z;boat.position.set(side*140,1,z);boat.rotation.set(0,0,0);
 if(side===1&&z===176&&t>=10&&t<18){let x=140,y=1,zz=z,yaw=0;
  if(t<10.2)x=mix(140,150,smooth(10,10.2,t));
  else if(t<10.6){x=150;yaw=mix(0,-Math.PI/2,smooth(10.2,10.6,t));}
  else if(t<11.2){x=mix(150,178,smooth(10.6,11.2,t));yaw=-Math.PI/2;}
  else if(t<11.7){x=178;yaw=mix(-Math.PI/2,0,smooth(11.2,11.7,t));}
  else if(t<12)x=mix(178,191,smooth(11.7,12,t));
  else if(t<12.65){x=191;y=mix(1,57,smooth(12,12.65,t));}
  else{x=mix(191,285,smooth(12.65,17.5,t));y=57;zz=mix(z,-300,smooth(12.65,17.5,t));}
  boat.position.set(x,y,zz);boat.rotation.y=yaw;
 }else if(side===1&&z===76&&t>=12&&t<18){let x=197,y=57,yaw=0;
  if(t<14){x=mix(300,197,smooth(12,14,t));yaw=Math.PI/2;}
  else if(t<14.5)yaw=mix(Math.PI/2,0,smooth(14,14.5,t));
  else if(t<15.15)y=mix(57,1,smooth(14.5,15.15,t));
  else if(t<15.5){x=mix(197,178,smooth(15.15,15.5,t));y=1;}
  else if(t<16){x=178;y=1;yaw=mix(0,Math.PI/2,smooth(15.5,16,t));}
  else if(t<17){x=mix(178,155,smooth(16,17,t));y=1;yaw=Math.PI/2;}
  else if(t<17.5){x=155;y=1;yaw=mix(Math.PI/2,0,smooth(17,17.5,t));}
  else{x=mix(155,140,smooth(17.5,18,t));y=1;}
  boat.position.set(x,y,z);boat.rotation.y=yaw;
 }
}
for(let i=0;i<boats.length;i++){let a=opticalTime*3+i/9*TAU,z=640*Math.sin(a),x=280*Math.cos(a);boats[i].position.set(x,55+15*Math.sin(2*a+i),z);let dir=V(-280*Math.sin(a),30*Math.cos(2*a+i),640*Math.cos(a)).normalize();boats[i].quaternion.setFromUnitVectors(V(0,0,-1),dir);}
let progress=travelPhase(t);for(let q of nearDrifters){q.g.position.set(q.x,q.y,-3000+fract(progress+q.phase)*6000);q.g.rotation.set(opticalTime*(q.i%3+1)+q.i,opticalTime*(q.i%4+1),q.i*.3);}
for(let i=0;i<160;i++){let k=i*6,x=dustData[i*3],y=dustData[i*3+1],z=-3200+fract(progress+i*.618)*6400;speedPositions[k]=x;speedPositions[k+1]=y;speedPositions[k+2]=z;speedPositions[k+3]=x;speedPositions[k+4]=y;speedPositions[k+5]=z+3+(accel+openingResidue)*45;}speedGeo.attributes.position.needsUpdate=true;speedLines.material.opacity=.1+(accel+openingResidue)*.18;
let dp=dust.geometry.attributes.position.array;for(let i=0;i<750;i++)dp[i*3+2]=-3500+fract(dustData[i*3+2]/7000+.5+progress)*7000;dust.geometry.attributes.position.needsUpdate=true;
// The nearby intact field remains behind the camera at the loop seam, so nothing visibly reforms.
const damageHeat=new Float32Array(6);for(let e of impactEvents){let age=t-e.time;if(age>=0&&age<1)damageHeat[e.target]=Math.max(damageHeat[e.target],Math.exp(-age*(e.kind==='ciws'?12:5)));}
for(let rock of rocks){let age=rock.i<6?Math.max(0,t-HIT[rock.i]):0,heat=rock.i<6?damageHeat[rock.i]:0;let glow=0;if(age>0){if(rock.i===0)glow=2.3*Math.exp(-Math.max(0,age-2.2)*.65);else if(rock.i===1)glow=.65*Math.exp(-age*.8)+heat*1.8;else if(rock.i===2)glow=.4*Math.exp(-age)+heat*.8;else glow=2.0*Math.exp(-Math.max(0,age-.2)*.9)+heat*1.3;}rock.fractureMat.emissiveIntensity=glow;rock.root.position.copy(rock.pos);rock.root.rotation.set(Math.sin(t*.02+rock.i)*.06,t*.008,0);for(let p of rock.fragments){let pose=fragmentPose(rock,p,t);p.g.position.copy(pose.pos);p.g.rotation.copy(pose.rot);}}
let charge=smooth(55.7,58.7,t)*(1-smooth(60.8,61.6,t)),beamOn=smooth(58.8,59.0,t)*(1-smooth(61.4,62,t));chargeGroup.visible=charge>.001;chargeGroup.rotation.z=t*1.3;chargeGroup.scale.setScalar(.6+charge*.8);for(let c of chargeGroup.children)c.material.opacity=charge*.85;
let beamStrength=beamOn+(t>=61.6?.12*(1-smooth(61.9,62.2,t)):0),detachedStart=mainStart.clone().lerp(mainEnd,smooth(61.6,62.2,t));mainBeams.forEach((g,i)=>{g.visible=beamStrength>.001;setBeam(g,detachedStart,mainEnd,[2.6,6.5,15][i]*beamStrength*(1+.07*Math.sin(t*32)));});muzzleLight.intensity=charge*15000+beamOn*65000*(1-smooth(61.55,61.7,t));impactLight.intensity=beamOn*100000;
for(let rail of chargeRails){let start=55.7+rail.order*.145;rail.mesh.material.emissiveIntensity=.12+3.8*smooth(start,start+.35,t)*(1-smooth(61.3,62.1,t));}
for(let m of beamFlowMaterials)m.uniforms.time.value=t;
for(let p of pulseBolts){p.start.copy(muzzle(p.head,p.side));let u=(t-p.launch)/(p.hit-p.launch),active=u>=0&&u<1;p.g.visible=p.trail.visible=active;let pos=p.start.clone().lerp(p.end,clamp(u));p.g.position.copy(pos);p.g.quaternion.setFromUnitVectors(V(0,0,1),p.end.clone().sub(p.start).normalize());setBeam(p.trail,pos,p.start.clone().lerp(p.end,Math.max(0,u-.024)),1.3);if(t>=p.launch&&t<p.launch+.10)p.head.emitter.emissiveIntensity=3.5;}
for(let p of ciwsBolts){p.start.copy(muzzle(p.head,p.side));let u=(t-p.launch)/(p.hit-p.launch);p.g.visible=u>=0&&u<1;setBeam(p.g,p.start.clone().lerp(p.end,clamp(u)),p.start.clone().lerp(p.end,clamp(u+.008)),.52);if(t>=p.launch&&t<p.launch+.04)p.head.emitter.emissiveIntensity=3.1;}
for(let m of missiles){m.start.copy(m.ship.root.localToWorld(m.slot.clone()));m.control.copy(m.start).lerp(m.end,.42).add(V((m.index%2?1:-1)*130,130+m.index%4*23,0));let u=clamp((t-m.launch)/(m.hit-m.launch))**1.6;m.g.visible=t>=m.launch&&t<m.hit;m.exhaust.visible=t>=m.launch+.14&&t<m.hit;m.emitter.emissiveIntensity=.12+3.8*smooth(m.launch+.1,m.launch+.28,t)*(1-smooth(m.hit-.08,m.hit,t));m.g.position.copy(missilePoint(m,u));let dir=missilePoint(m,Math.min(1,u+.002)).sub(missilePoint(m,Math.max(0,u-.002))).normalize();m.g.quaternion.setFromUnitVectors(V(0,0,-1),dir);m.trail.visible=t>=m.launch&&t<m.hit+1.2;let ar=m.trail.geometry.attributes.position.array;for(let j=0;j<=60;j++){let v=missilePoint(m,mix(Math.max(0,u-.48),u,j/60));ar[j*3]=v.x;ar[j*3+1]=v.y;ar[j*3+2]=v.z;}m.trail.geometry.attributes.position.needsUpdate=true;m.trail.geometry.computeBoundingSphere();m.trail.material.opacity=(1-smooth(m.hit,m.hit+1.2,t))*.85*smooth(m.launch+.1,m.launch+.25,t);}
for(let f of muzzleFlashes){let pulse=0,records=f.head.type==='pulse'?pulseBolts:ciwsBolts;for(let p of records)if(p.head===f.head&&t>=p.launch&&t<p.launch+.12)pulse=Math.max(pulse,Math.exp(-(t-p.launch)*28));let g=f.g;g.visible=pulse>.015;g.position.copy(muzzle(f.head));g.quaternion.copy(f.head.g.getWorldQuaternion(new T.Quaternion()));g.children[0].scale.setScalar(1+pulse*(f.head.type==='pulse'?6:3));g.children[0].material.opacity=pulse;g.children[1].scale.setScalar(2+pulse*8);g.children[1].material.opacity=pulse*.7;}
localGunLights[0].intensity=1200*Math.max(0,Math.sin((t-60)*TAU*4))**8*(t>60&&t<63.8?1:0);localGunLights[1].position.copy(guardShooters[0].root.position).add(V(0,35,-35));localGunLights[1].intensity=1800*Math.max(0,Math.sin((t-61.1)*TAU*7))**8*(t>61.1&&t<64.5?1:0);
for(let q of impactSparks){let age=t-q.e.time,g=q.g;g.visible=age>=0&&age<.3;g.position.copy(targetPositions[q.e.target]).add(q.e.offset);let power=Math.exp(-Math.max(0,age)*19);g.children[0].scale.setScalar(q.e.size*(.7+Math.max(0,age)*3));g.children[0].material.opacity=power;g.children[1].scale.setScalar(q.e.size*(1+Math.max(0,age)*15));g.children[1].material.opacity=power*.7;}
for(let i=0;i<6;i++){let hit=HIT[i],age=t-hit,g=flashes[i];g.visible=age>=0&&age<4;let power=Math.exp(-Math.max(0,age)*2.2);hitLights[i].intensity=age>=0?power*95000:0;for(let j=0;j<3;j++){g.children[j].scale.setScalar((8+j*10)*(1+Math.max(0,age)*2));g.children[j].material.opacity=power*[.8,.3,.12][j]}g.children[3].scale.setScalar(15+Math.max(0,age)*95);g.children[3].material.opacity=Math.exp(-Math.max(0,age)*3.0)*.45}
for(let q of shotChips){let age=Math.max(0,t-q.e.time);q.g.visible=t>=q.e.time;q.g.position.copy(targetPositions[q.e.target]).add(q.e.offset).addScaledVector(q.dir,age*q.speed);q.g.rotation.set(age*q.spin,age*q.spin*.7,age*.3);}
for(let d of splinters){let age=Math.max(0,t-HIT[d.target]);d.g.visible=age>0;d.g.position.copy(targetPositions[d.target]).add(d.origin).addScaledVector(d.dir,age*d.speed);d.g.rotation.set(age*d.spin,age*d.spin*.7,age*.4)}
for(let i=0;i<300;i++){let target=i%6,age=t-HIT[target],a=i*2.39996,rr=(12+Math.max(0,age)*(20+i%19))*Math.sin(i*6.3);particulatePos[i*3]=targetPositions[target].x+Math.cos(a)*rr;particulatePos[i*3+1]=targetPositions[target].y+Math.sin(a)*rr;particulatePos[i*3+2]=targetPositions[target].z+Math.sin(i*4.1)*rr;particulateAlpha[i]=age>=0?Math.exp(-age*.65)*.8:0;}particulateGeo.attributes.position.needsUpdate=true;particulateGeo.attributes.glow.needsUpdate=true;
for(let m of lightVolumes)m.uniforms.time.value=opticalTime;
for(let q of coreRadialFlow){let d=31+fract(t*.18+q.index*.23)*78,a=q.dir*Math.PI/2;q.g.position.set(Math.cos(a)*d,q.y+1,Math.sin(a)*d);q.g.rotation.y=-a;}
for(let i=0;i<coreHelices.length;i++){let a=coreHelices[i].geometry.attributes.position;for(let j=0;j<=180;j++){let y=-110+j/180*220,angle=y*.095+t*(i?-.75:.75)+i*Math.PI,r=14+8*Math.cos(y/224*Math.PI);a.setXYZ(j,Math.cos(angle)*r,y,Math.sin(angle)*r);}a.needsUpdate=true;}
for(let i=0;i<screenScans.length;i++)screenScans[i].position.y=Math.sin(t*1.4+i*.6)*2.5;for(let route of mapRoutes)route.dot.position.copy(route.curve.getPoint(fract(t*.17+route.i/8)));mapRouteGroup.rotation.y=t*.12;bridgeMapLight.intensity=1450+150*Math.sin(t*.8);
// Independent interior motion continues on the same global clock.
for(let a of hangarArms)a.rotation.z=Math.sin(t*.6+a.position.z)*.13;
for(let b of hangarBoats){b.g.position.copy(b.p);if(b.i===2){let q=fract((t-18)/17);b.g.position.x=mix(b.p.x,5,smooth(0,.2,q));b.g.position.z=mix(b.p.z,-310,smooth(.2,1,q));b.g.rotation.y=mix(-Math.PI/2,0,smooth(0,.2,q));b.g.position.y=5+smooth(0,.3,q)*9}}
hangarFlyer.position.set(13+Math.sin(t*.25)*3,13,mix(130,-420,fract((t-18)/14)));hangarFlyer.rotation.z=Math.sin(t*.3)*.06;returnBoat.position.set(-21,16,-340+fract((t-18)/16)*600);
for(let g of holo)g.rotation.y=t*.12;for(let g of coreRings){g.rotation.y=t*.11*(coreRings.indexOf(g)%2?1:-1);g.rotation.z=Math.sin(t*.2+g.position.y)*.045}coreEmitter.emissiveIntensity=1.1+.27*Math.sin(t*1.2);for(let i=0;i<coreFlow.length;i++){let a=i%4*Math.PI*.5+.3;coreFlow[i].position.set(Math.cos(a)*29,-110+fract(t*.1+i/20)*220,Math.sin(a)*29);}for(let l of coreLights)l.intensity=2400*(.85+.15*Math.sin(t*1.2));
for(let i=0;i<energySlugs.length;i++){let g=energySlugs[i],s=i%2?1:-1;g.position.set(s*19,16+Math.floor(i%4/2)*29,180-fract(t*.11+i/24)*390)}for(let j of jaws)j.g.position.x=j.s*(25+Math.sin(t*1.1+j.z*.1)*3);
if(t>=68.5&&t<69.5){activeScene=exterior;cam(hermitePose(attackPath,shieldPath,t),hermitePose(attackLook,shieldLook,t),mix(56,mix(56,48,smooth(0,1,.5/9)),smooth(0,1,t-68.5)));}
else if(t<18){activeScene=exterior;if(t<14.4){let u=t/18;cam(openingPath.getPoint(u),openingLook.getPoint(u),48);}else sternCamera(t);}
else if(t<28){activeScene=hangar;let u=(t-18)/10;cam(V(mix(21,4,u),mix(18,24,u),mix(153,-122,u)),V(0,20,mix(-65,-250,u)),55)}
else if(t<37){activeScene=bridge;let u=(t-28)/9;cam(V(mix(35,-24,u),mix(30,35,u),mix(66,46,u)),V(0,19,-28-u*12),64)}
else if(t<47){activeScene=core;let u=(t-37)/10,a=mix(.58,1.18,u);let radius=83+32*smooth(.8,1,u);cam(V(Math.sin(a)*radius,mix(-76,110,smooth(0,1,u)),Math.cos(a)*radius),V(0,mix(-15,48,u),0),78-8*smooth(.8,1,u))}
else if(t<55){activeScene=energy;let u=(t-47)/8;cam(V(mix(8,-7,u),mix(24,31,u),mix(163,-78,u)),V(0,34,-242),56)}
else if(t<69){activeScene=exterior;let u=(t-55)/14;cam(attackPath.getPoint(u),attackLook.getPoint(u),56);}
else {activeScene=exterior;let u=(t-69)/9;cam(shieldPath.getPoint(u),shieldLook.getPoint(u),mix(56,48,smooth(0,1,u)));}
let surge=(accel+openingResidue)*140;for(let f of fleet)f.root.position.z-=(shipBoost(f.root,t)+openingResidue)*140*(1+f.i%5*.06);for(let g of boats)g.position.z-=surge;camera.position.z-=surge;camera.updateMatrixWorld();if(draw)post(activeScene);else activeScene.updateMatrixWorld(true);
}
let exporting=false,exportFPS=60,clockStart=performance.now(),resumeAt=0;
function animate(now){requestAnimationFrame(animate);if(!exporting)renderAt(resumeAt+(now-clockStart)/1000)}
window.videoExport={runs:['tour'],async begin(runId,{fps=60}={}){if(runId!=='tour')throw new Error('Unknown run: '+runId);exporting=true;exportFPS=fps;renderAt(0);return{frames:Math.round(DURATION*fps)}},async frame(i){if(!exporting)throw new Error('Call begin first');renderAt(i/exportFPS);renderer.getContext().finish()},end(){resumeAt=lastTime;clockStart=performance.now();exporting=false}};
window._audit={renderer,camera,exterior,hangar,bridge,core,energy,fleet,hullBoats,boats,BOAT,renderAt,getScene:()=>activeScene};window.filmInfo={duration:DURATION,ships:fleet.length,voxelUnit:1,flagshipLength:1100,rooms:4};
renderAt(0);requestAnimationFrame(animate);
})();



