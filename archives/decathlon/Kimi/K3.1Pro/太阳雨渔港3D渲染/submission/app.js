(() => {
'use strict';
const TAU = Math.PI * 2;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const lerp = (a,b,t) => a+(b-a)*t;
const smooth = t => { t=clamp(t,0,1); return t*t*(3-2*t); };
let seed = 72419;
function rnd(a=0,b=1){ seed=(seed*1664525+1013904223)>>>0; return a+(seed/4294967296)*(b-a); }

const renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.LinearToneMapping;
renderer.toneMappingExposure=1.12;
renderer.setClearColor(0xdceeed,1);
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();
scene.background=new THREE.Color(0xdceeed);
scene.fog=new THREE.FogExp2(0xdceeed,0.0045);
const world=new THREE.Group();
scene.add(world);
const camera=new THREE.OrthographicCamera(-30,30,18,-18,0.1,180);
const target=new THREE.Vector3(0,-1,0);
let camTheta=0.72, camPhi=0.68, camDist=66, viewSize=42.5;
const hemi=new THREE.HemisphereLight(0xf2ffff,0x527e78,0.68); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff2cf,0.98);
sun.position.set(-16,34,20); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-31; sun.shadow.camera.right=31; sun.shadow.camera.top=31; sun.shadow.camera.bottom=-31;
sun.shadow.camera.near=1; sun.shadow.camera.far=90; sun.shadow.bias=-0.00035; sun.shadow.normalBias=0.025;
scene.add(sun);
const fill=new THREE.DirectionalLight(0xaaddeb,0.14); fill.position.set(24,10,-20); scene.add(fill);

const gradient=new THREE.DataTexture(new Uint8Array([105,150,196,235,255]),5,1,THREE.LuminanceFormat);
gradient.minFilter=THREE.NearestFilter; gradient.magFilter=THREE.NearestFilter; gradient.needsUpdate=true;
const C={ink:0x294e54,concrete:0xb6c5c0,concrete2:0xa4b5af,white:0xeee9d7,cream:0xffeccb,teal:0x439e9a,deep:0x205e69,water:0x69c4bd,blue:0x75b7c8,dark:0x223a3e,orange:0xdd6429,yellow:0xe3b83c,red:0xc83e35,wood:0x91694c,roof:0x4f7c84,grass:0x669b78,sand:0x648e80};
function toon(color,opts={}){return new THREE.MeshToonMaterial(Object.assign({color,gradientMap:gradient},opts));}
function std(color,opts={}){return new THREE.MeshStandardMaterial(Object.assign({color,roughness:.72,metalness:0},opts));}
const concreteCv=document.createElement('canvas');concreteCv.width=concreteCv.height=512;const cx=concreteCv.getContext('2d');cx.fillStyle='#f4f4ee';cx.fillRect(0,0,512,512);for(let i=0;i<1500;i++){const x=(i*73+Math.sin(i*2.1)*31+512)%512,y=(i*151+Math.cos(i*.7)*43+512)%512;cx.fillStyle=`rgba(65,91,84,${.025+(i%5)*.012})`;cx.fillRect(x,y,1+i%2,1+(i+1)%2);}for(let i=0;i<20;i++){const x=(i*97)%512,y=(i*163)%512,g=cx.createRadialGradient(x,y,1,x,y,28+i%17);g.addColorStop(0,'rgba(83,125,115,.1)');g.addColorStop(1,'rgba(83,125,115,0)');cx.fillStyle=g;cx.fillRect(x-45,y-45,90,90);}const concreteTex=new THREE.CanvasTexture(concreteCv);concreteTex.encoding=THREE.sRGBEncoding;concreteTex.wrapS=concreteTex.wrapT=THREE.RepeatWrapping;concreteTex.repeat.set(2.5,2.5);concreteTex.anisotropy=renderer.capabilities.getMaxAnisotropy();
const M={
 concrete:std(C.concrete,{map:concreteTex,bumpMap:concreteTex,bumpScale:.025,roughness:.38}), concrete2:toon(C.concrete2), white:toon(C.white), cream:toon(C.cream),
 teal:toon(C.teal),deep:toon(C.deep),dark:std(C.dark,{roughness:.82}),orange:toon(C.orange),yellow:toon(C.yellow),
 red:toon(C.red),wood:std(C.wood,{roughness:.78}),roof:std(C.roof,{roughness:.5}),grass:toon(C.grass),
 sand:toon(C.sand),metal:std(0xb6c3c1,{roughness:.3,metalness:.32}),rust:std(0x9b6248,{roughness:.85}),
 glass:new THREE.MeshPhysicalMaterial({color:0xc4f1ed,transparent:true,opacity:.22,roughness:.08,metalness:.05,depthWrite:false,side:THREE.DoubleSide}),
 net:new THREE.LineBasicMaterial({color:0x718d82,transparent:true,opacity:.75}),
 foam:new THREE.MeshBasicMaterial({color:0xf2fff4,transparent:true,opacity:.72,depthWrite:false}),
 blackLine:new THREE.LineBasicMaterial({color:C.ink,transparent:true,opacity:.58}),
};
function mesh(g,m,p,parent=world){const o=new THREE.Mesh(g,m);if(p)o.position.set(...p);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function box(w,h,d,m,p,parent=world,edge=false){const o=mesh(new THREE.BoxGeometry(w,h,d),m,p,parent);if(edge)addEdges(o);return o;}
function cyl(rt,rb,h,seg,m,p,parent=world,edge=false){const o=mesh(new THREE.CylinderGeometry(rt,rb,h,seg),m,p,parent);if(edge)addEdges(o,25);return o;}
function sph(r,m,p,parent=world,scale){const o=mesh(new THREE.SphereGeometry(r,16,10),m,p,parent);if(scale)o.scale.set(...scale);return o;}
function ico(r,m,p,parent=world,detail=1){return mesh(new THREE.IcosahedronGeometry(r,detail),m,p,parent);}
function addEdges(o,threshold=28,color=C.ink,opacity=.68){const l=new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry,threshold),new THREE.LineBasicMaterial({color,transparent:true,opacity,toneMapped:false}));l.scale.setScalar(1.004);l.renderOrder=4;o.add(l);return l;}
function rod(a,b,r,m,parent=world,seg=8){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A);const o=cyl(r,r,d.length(),seg,m,A.clone().add(B).multiplyScalar(.5).toArray(),parent);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return o;}
function tube(points,r,m,parent=world,segments=40){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return mesh(new THREE.TubeGeometry(curve,segments,r,6,false),m,null,parent);}
function ring(r,t,m,p,parent=world,rot){const o=mesh(new THREE.TorusGeometry(r,t,7,24),m,p,parent);if(rot)o.rotation.set(...rot);return o;}
function textTex(lines,opts={}){
 const cv=document.createElement('canvas');cv.width=opts.w||512;cv.height=opts.h||256;const x=cv.getContext('2d');
 if(opts.bg){x.fillStyle=opts.bg;x.fillRect(0,0,cv.width,cv.height);}else x.clearRect(0,0,cv.width,cv.height);
 if(opts.border){x.strokeStyle=opts.border;x.lineWidth=10;x.strokeRect(7,7,cv.width-14,cv.height-14);}
 x.fillStyle=opts.color||'#34585b';x.textAlign='center';x.textBaseline='middle';
 const arr=Array.isArray(lines)?lines:[lines];const fs=opts.font||54;x.font=`${opts.bold===false?'':'bold'} ${fs}px "Yu Gothic","Microsoft YaHei",sans-serif`;
 arr.forEach((s,i)=>x.fillText(s,cv.width/2,cv.height*(i+1)/(arr.length+1),cv.width-35));
 if(opts.weather){for(let i=0;i<80;i++){x.fillStyle=`rgba(230,238,218,${rnd(.02,.13)})`;x.fillRect(rnd(0,cv.width),rnd(0,cv.height),rnd(2,24),rnd(1,5));}}
 const t=new THREE.CanvasTexture(cv);t.encoding=THREE.sRGBEncoding;t.anisotropy=renderer.capabilities.getMaxAnisotropy();return t;
}
function sign(lines,w,h,p,rot=[0,0,0],opts={},parent=world){const m=new THREE.MeshBasicMaterial({map:textTex(lines,opts),transparent:true,side:opts.bg?THREE.FrontSide:THREE.DoubleSide,toneMapped:false});const o=mesh(new THREE.PlaneGeometry(w,h),m,p,parent);o.rotation.set(...rot);o.castShadow=false;if(opts.bg){const back=mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:opts.bg,side:THREE.DoubleSide}),[0,0,-.014],o);back.castShadow=false;}return o;}
const puddleCv=document.createElement('canvas');puddleCv.width=puddleCv.height=256;const px=puddleCv.getContext('2d');px.beginPath();for(let i=0;i<=40;i++){const a=i/40*TAU,r=105+Math.sin(i*2.37)*8+Math.cos(i*.91)*5,x=128+Math.cos(a)*r,y=128+Math.sin(a)*r*.88;i?px.lineTo(x,y):px.moveTo(x,y);}px.closePath();px.clip();const pg=px.createRadialGradient(110,92,5,128,128,126);pg.addColorStop(0,'rgba(225,247,238,.86)');pg.addColorStop(.55,'rgba(151,208,202,.57)');pg.addColorStop(.88,'rgba(103,169,166,.3)');pg.addColorStop(1,'rgba(103,169,166,0)');px.fillStyle=pg;px.fillRect(0,0,256,256);px.strokeStyle='rgba(249,251,229,.58)';px.lineWidth=3;for(let i=0;i<7;i++){px.beginPath();px.moveTo(45+i%3*17,55+i*19);px.bezierCurveTo(88,48+i*19,148,70+i*17,207-i%2*28,58+i*19);px.stroke();}const puddleTex=new THREE.CanvasTexture(puddleCv);puddleTex.encoding=THREE.sRGBEncoding;puddleTex.anisotropy=renderer.capabilities.getMaxAnisotropy();
function puddle(x,z,sx,sz,y=2.415,parent=world){const m=new THREE.MeshPhysicalMaterial({color:0xe4f3ed,map:puddleTex,transparent:true,opacity:.75,roughness:.06,metalness:.12,clearcoat:1,clearcoatRoughness:.08,depthWrite:false});const o=mesh(new THREE.CircleGeometry(1,40),m,[x,y,z],parent);o.rotation.x=-Math.PI/2;o.scale.set(sx,sz,1);o.castShadow=false;return o;}

// A square, layered collectible base.
box(36.8,.65,36.8,std(0x86a9a3,{roughness:.5}),[0,-6.22,0],world,true);
box(36.3,.18,36.3,toon(0xd6ded2),[0,-5.82,0],world,true);
box(28,8.05,8,M.concrete2,[-4,-1.775,14],world,true);
box(8,8.05,28,M.concrete2,[-14,-1.775,-4],world,true);
box(28,.22,8,M.concrete,[-4,2.29,14],world,false);
box(8,.22,28,M.concrete,[-14,2.29,-4],world,false);
// Horizontal construction lifts, tide marks and individual quay blocks.
const jointMat=new THREE.LineBasicMaterial({color:0x688c88,transparent:true,opacity:.34});
function wallJointsZ(z,x0,x1){for(let y=-4.9;y<2.1;y+=1.35){const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0,y,z),new THREE.Vector3(x1,y,z)]);world.add(new THREE.Line(g,jointMat));for(let x=x0+((Math.round(y*10)&1)?1.4:0);x<x1;x+=2.8){const v=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,y,z),new THREE.Vector3(x,y+1.35,z)]);world.add(new THREE.Line(v,jointMat));}}}
function wallJointsX(x,z0,z1){for(let y=-4.9;y<2.1;y+=1.35){const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,y,z0),new THREE.Vector3(x,y,z1)]);world.add(new THREE.Line(g,jointMat));for(let z=z0+((Math.round(y*10)&1)?1.4:0);z<z1;z+=2.8){const v=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,y,z),new THREE.Vector3(x,y+1.35,z)]);world.add(new THREE.Line(v,jointMat));}}}
wallJointsZ(18.012,-18,10);wallJointsZ(9.985,-10,10);wallJointsX(10.012,10,18);wallJointsX(-9.985,-18,10);
const blockSeam=new THREE.MeshBasicMaterial({color:0x617e78,transparent:true,opacity:.3,depthWrite:false,toneMapped:false});
const blockWash=[new THREE.MeshBasicMaterial({color:0xe0e2d6,transparent:true,opacity:.09,depthWrite:false}),new THREE.MeshBasicMaterial({color:0x668781,transparent:true,opacity:.07,depthWrite:false})];
for(let row=0;row<6;row++){const y=-5.08+row*1.35;for(let col=0;col<10;col++){const x=-16.6+col*2.8;box(2.76,1.3,.012,blockWash[(row+col)%2],[x,y,18.008]);}box(28,.022,.026,blockSeam,[-4,y-.67,18.032]);for(let col=0;col<10;col++){const x=-18+col*2.8+(row%2?1.4:0);if(x<10)box(.022,1.34,.026,blockSeam,[x,y,18.034]);}for(let col=0;col<3;col++)box(.012,1.3,2.57,blockWash[(row+col)%2],[10.008,y,11.35+col*2.65]);box(.026,.022,8,blockSeam,[10.032,y-.67,14]);}
const streakMat=new THREE.MeshBasicMaterial({color:0x557e74,transparent:true,opacity:.17,depthWrite:false});
for(let i=0;i<31;i++){const x=-17.5+i*.86,h=.35+(Math.sin(i*2.37)*.5+.5)*1.15;box(.035+(i%3)*.018,h,.012,streakMat,[x,2.12-h*.5,18.045]);}
for(let i=0;i<20;i++){const x=-9.4+i*.94,h=.3+(Math.sin(i*1.77)*.5+.5)*.85;box(.04+(i%2)*.025,h,.012,streakMat,[x,2.15-h*.5,9.94]);}
const tide=std(0x618c83,{roughness:.9,transparent:true,opacity:.68});
box(20,.38,.025,tide,[0,-.28,9.96]);box(.025,.48,27.5,tide,[-9.96,-.35,-4]);
box(20,.12,.027,toon(0x91a69a),[0,.55,9.95]);box(.027,.12,27.5,toon(0x91a69a),[-9.95,.62,-4]);
// Wet top seams, aggregate and small drainage grilles.
for(let i=0;i<85;i++){let x,z;if(i<50){x=rnd(-17.7,9.7);z=rnd(10.2,17.7);}else{x=rnd(-17.7,-10.3);z=rnd(-17.7,9.7);}const s=rnd(.035,.11);const o=ico(s,toon(i%3?0x9daea7:0xe2e3d8),[x,2.415,z],world,0);o.scale.y=.12;o.castShadow=false;}
for(let x=-8;x<9;x+=2.2){box(.8,.025,.26,M.dark,[x,2.415,10.35]);for(let j=0;j<5;j++)box(.055,.015,.28,M.metal,[x-.31+j*.155,2.435,10.35]);}

// Clear water with a deliberately posterized, animated surface.
const waterUniforms={uTime:{value:0},uSun:{value:1}};
const waterMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:waterUniforms,
 vertexShader:`varying vec3 vP;uniform float uTime;void main(){vec3 p=position;vec4 w=modelMatrix*vec4(p,1.);w.y+=sin(w.x*1.25+uTime*.55)*.025+sin(w.z*1.8-uTime*.42)*.018;vP=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
 fragmentShader:`varying vec3 vP;uniform float uTime;uniform float uSun;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 void main(){vec2 p=vP.xz;p+=vec2(sin(p.y*1.7+uTime*.3),sin(p.x*1.4-uTime*.24))*.075;
 float a=sin(p.x*.46+p.y*.32+uTime*.16)+sin(p.y*.73-p.x*.19-uTime*.11);float band=floor((a+2.)*1.5)/6.;
 vec3 col=mix(vec3(.16,.51,.55),vec3(.43,.75,.69),band+.12);
 vec2 cp=vec2(p.x*1.9+p.y*.23,p.y*3.25),cell=floor(cp),fp=fract(cp);float h=hash(cell);
 float chip=step(.79,h)*step(.14,fp.x)*(1.-step(.84,fp.x))*step(.2,fp.y)*(1.-step(.72,fp.y))*step(-.25,sin(uTime*.45+h*31.));
 col=mix(col,vec3(.72,.87,.79),chip*.32);
 float stripe=step(.48,sin(p.y*8.5+sin(p.x*2.3+uTime*.4)*1.2));float nearBoat=exp(-pow((p.y-7.25)*.42,2.))*(exp(-pow((p.x+5.5)*.42,2.))+exp(-pow(p.x*.4,2.))+exp(-pow((p.x-5.5)*.42,2.)));
 float fragments=step(.3,hash(floor(vec2(p.x*3.1,p.y*5.4))));col=mix(col,vec3(.91,.95,.84),clamp(nearBoat*stripe*fragments*.9,0.,.82));col=mix(col,vec3(.12,.35,.42),nearBoat*(1.-stripe)*fragments*.3);
 float glint=step(.975,h)*step(.45,sin(uTime*.9+h*45.))*step(.25,fp.x)*(1.-step(.55,fp.x))*step(.35,fp.y)*(1.-step(.62,fp.y));col=mix(col,vec3(1.,.93,.66),glint*uSun*.72);
 gl_FragColor=vec4(col,.64);}`});
const water=mesh(new THREE.PlaneGeometry(27.85,27.85,70,70),waterMat,[4.05,.025,-4.05]);water.rotation.x=-Math.PI/2;water.castShadow=false;water.renderOrder=3;
const volumeMat=new THREE.MeshBasicMaterial({color:0x58b7b0,transparent:true,opacity:.11,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
const side1=mesh(new THREE.PlaneGeometry(28,5.75),volumeMat,[18.01,-2.85,-4]);side1.rotation.y=Math.PI/2;side1.renderOrder=5;
const side2=mesh(new THREE.PlaneGeometry(27.9,5.75),volumeMat,[4.05,-2.85,-18.01]);side2.renderOrder=5;
// Water strata on the cut faces make the square section legible.
for(let y=-5.25;y<0;y+=1.12){const m=new THREE.MeshBasicMaterial({color:0xb2e5d7,transparent:true,opacity:.16,depthWrite:false});box(.025,.022,27.9,m,[18.025,y,-4]);box(27.9,.022,.025,m,[4.05,y,-18.025]);}
box(27.8,.18,27.8,M.sand,[4.05,-5.68,-4],world,false);
for(let i=0;i<75;i++){const x=rnd(-9.4,17.5),z=rnd(-17.5,9.4);const o=ico(rnd(.12,.52),toon(i%3===0?0x90afa0:i%3===1?0x648f88:0xb0b69c),[x,-5.47,z],world,0);o.scale.set(rnd(1,1.8),rnd(.35,.7),rnd(.8,1.4));}
// Fine sand ripples visible through the cutaway.
for(let i=0;i<18;i++){const pts=[];for(let j=0;j<18;j++)pts.push([-8+j*1.4,-5.54,-16.8+i*1.45+Math.sin(j*.8+i)*.14]);tube(pts,.025,toon(0xa4baa4),world,30);}

const reflectionPatches=[];
function refl(x,z,w,d,col,op=.45){const s=new THREE.Shape();s.moveTo(-w*.5,-d*.35);s.lineTo(-w*.32,-d*.5);s.lineTo(w*.45,-d*.4);s.lineTo(w*.5,d*.25);s.lineTo(w*.1,d*.5);s.lineTo(-w*.48,d*.28);s.closePath();const m=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:op,depthWrite:false,side:THREE.DoubleSide});const o=mesh(new THREE.ShapeGeometry(s),m,[x,.065+rnd(0,.02),z]);o.rotation.x=-Math.PI/2;o.rotation.z=rnd(-.1,.1);o.castShadow=false;o.renderOrder=4;reflectionPatches.push({o,x,z,phase:rnd(0,TAU)});return o;}
[-5.6,0,5.6].forEach((x,k)=>{for(let i=0;i<7;i++)refl(x+rnd(-1.5,1.5),7.1-i*.43,rnd(.5,2.3),rnd(.15,.45),i%3===0?0xf4f4df:i%3===1?0x387e87:0x82c8c2,.45);});
for(let i=0;i<18;i++)refl(rnd(-8,16),rnd(-15,6),rnd(.15,.6),rnd(.3,1.4),i%2?0xb9e1d4:0x4d9c9e,.25);

// Barnacles, oyster shells, mooring rings and ladders on the wet wall.
for(let i=0;i<62;i++){const x=rnd(-9.4,9.4),y=rnd(-1.25,.25);const o=ico(rnd(.055,.14),toon(i%2?0xd4d4bd:0x9fae9e),[x,y,9.91],world,0);o.scale.z=.45;}
for(let i=0;i<45;i++){const z=rnd(-16.8,9),y=rnd(-1.4,.2);const o=ico(rnd(.06,.15),toon(i%2?0xd7d1b6:0x9aa99b),[-9.9,y,z],world,0);o.scale.x=.45;}
function mooringRing(x,y,z,rot=[0,0,0]){const r=ring(.23,.045,M.rust,[x,y,z],world,rot);const pin=cyl(.08,.08,.16,8,M.rust,[x,y+.24,z]);return r;}
mooringRing(-3,-.1,9.82);mooringRing(6,-.1,9.82);mooringRing(-9.82,0,-3,[0,Math.PI/2,0]);
function ladder(x,z,onX=false){const g=new THREE.Group();g.position.set(x,0,z);if(onX)g.rotation.y=Math.PI/2;world.add(g);rod([-.42,2.1,0],[-.42,-1.9,0],.055,M.rust,g);rod([.42,2.1,0],[.42,-1.9,0],.055,M.rust,g);for(let y=-1.7;y<2;y+=.42)rod([-.42,y,0],[.42,y,0],.045,M.rust,g);for(const xx of[-.42,.42])tube([[xx,2.05,0],[xx,2.35,.12],[xx,2.45,.45]],.055,M.rust,g,12);}
ladder(8.2,9.72);ladder(-9.72,-9,true);

// Concrete steps and a lower boarding platform at the inside corner.
for(let i=0;i<5;i++){box(3,.42,1.05,M.concrete,[3.1,2.18-i*.42,9.45-i*.62],world,true);}
box(3.3,.32,1.7,M.concrete,[3.1,.15,6.25],world,true);
for(const x of[1.65,4.55])rod([x,.3,6.25],[x,-2.2,6.25],.12,M.concrete2);
// Worn diagonal safety paint, generated locally and mapped around the curb.
const cautionCv=document.createElement('canvas');cautionCv.width=256;cautionCv.height=64;const cc=cautionCv.getContext('2d');cc.fillStyle='#e4b938';cc.fillRect(0,0,256,64);cc.fillStyle='#263e41';for(let i=-1;i<4;i++){const x=i*96;cc.beginPath();cc.moveTo(x,0);cc.lineTo(x+48,0);cc.lineTo(x-10,64);cc.lineTo(x-58,64);cc.closePath();cc.fill();}cc.fillStyle='rgba(213,220,199,.48)';for(let i=0;i<34;i++)cc.fillRect((i*47)%256,(i*19)%64,3+i%9,1+i%2);const cautionTex=new THREE.CanvasTexture(cautionCv);cautionTex.encoding=THREE.sRGBEncoding;cautionTex.anisotropy=renderer.capabilities.getMaxAnisotropy();const cautionMat=new THREE.MeshStandardMaterial({map:cautionTex,roughness:.48});
for(let x=-9.5,i=0;x<9.7;x+=.65,i++){box(.65,.25,.34,cautionMat,[x,2.51,10.06],world,false);if(i%3===0)box(.13,.022,.355,M.concrete2,[x+.1,2.65,10.06]);}
for(let z=-17.5;z<9.7;z+=.65)box(.34,.25,.65,cautionMat,[-10.06,2.51,z]);

// Short breakwater and distant, mist-softened breakwater.
box(10,3.7,3.2,M.concrete2,[-9,0,-16.35],world,true);
box(10,.18,3.2,M.concrete,[-9,1.93,-16.35]);
for(let x=-13.5;x<-4;x+=1.2)box(.035,.03,3.1,jointMat,[x,2.035,-16.35]);
box(23,1.05,1.2,toon(0xabc4bd),[5.8,-.02,-17.1],world,true);
for(let x=-4;x<17;x+=2.4)box(.8,.35,1.45,toon(0x9fb9b4),[x,.65,-17.1]);

// Reusable harbor clutter: slatted fish boxes really are hollow, stacked containers.
function fishCrate(x,y,z,blue=false,parent=world,s=1){const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(s);parent.add(g);const m=blue?toon(0x438ca5):toon(0xe7eee4);box(1.15,.12,.8,m,[0,.06,0],g,true);for(const zz of[-.37,.37]){for(let yy=.2;yy<.62;yy+=.2)box(1.15,.11,.07,m,[0,yy,zz],g);for(const xx of[-.52,.52])box(.08,.64,.08,m,[xx,.34,zz],g);}for(const xx of[-.54,.54])for(let yy=.2;yy<.62;yy+=.2)box(.07,.11,.68,m,[xx,yy,0],g);box(.35,.12,.012,toon(blue?0xd8e3d7:0x628f96),[0,.38,.412],g);return g;}
function gableRoof(w,d,h,m,p,parent=world){const v=[-w/2,0,-d/2,w/2,0,-d/2,0,h,-d/2,-w/2,0,d/2,w/2,0,d/2,0,h,d/2];const idx=[0,1,2,5,4,3,0,2,3,3,2,5,2,1,4,2,4,5,0,3,4,0,4,1];const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();const o=mesh(g,m,p,parent);addEdges(o,20);return o;}
const caustics=[],windTrees=[],flagMeshes=[],lightBeams=[];
const shaftMat=new THREE.MeshBasicMaterial({color:0xffd98a,transparent:true,opacity:.045,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
function lightShaft(a,b,r0,r1,parent=world){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A);const o=mesh(new THREE.CylinderGeometry(r0,r1,d.length(),12,1,true),shaftMat.clone(),A.clone().add(B).multiplyScalar(.5).toArray(),parent);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());o.castShadow=false;o.renderOrder=6;o.userData.baseOpacity=o.material.opacity;lightBeams.push(o);return o;}

// Fisheries cooperative, open toward the harbor (+X).
const warehouse=new THREE.Group();world.add(warehouse);
box(6.5,.22,7.4,std(0x9faeaa,{roughness:.35}),[-14.05,2.51,-6.35],warehouse,true);
box(.25,4.8,7.4,toon(0xb9c7b8),[-17.32,4.91,-6.35],warehouse,true);
box(6.5,4.8,.22,toon(0xc8cfba),[-14.05,4.91,-10.0],warehouse,true);
box(6.5,4.8,.22,toon(0xc8cfba),[-14.05,4.91,-2.7],warehouse,true);
// Door jambs and high header leave a broad, unobstructed opening.
for(const z of[-9.65,-3.05])box(.28,4.65,.75,toon(0xb9c7b8),[-10.86,4.85,z],warehouse,true);
box(.28,1.05,5.95,toon(0xb9c7b8),[-10.86,6.75,-6.35],warehouse,true);
// Half-raised roller shutter with individual horizontal slats.
for(let y=5.15;y<6.38;y+=.16){box(.12,.135,5.55,std(0x91a5a1,{roughness:.5,metalness:.25}),[-10.67,y,-6.35],warehouse);}
rod([-10.55,2.45,-9.25],[-10.55,6.3,-9.25],.045,M.rust,warehouse);rod([-10.55,2.45,-3.45],[-10.55,6.3,-3.45],.045,M.rust,warehouse);
const wr=gableRoof(7.3,8.15,1.45,M.roof,[-14.05,7.31,-6.35],warehouse);
// Corrugation and roof seams.
for(let z=-10.25;z<-2.3;z+=.32){rod([-17.68,7.34,z],[-14.05,8.78,z],.022,toon(0x87a5a4),warehouse,5);rod([-14.05,8.78,z],[-10.42,7.34,z],.022,toon(0x87a5a4),warehouse,5);}
sign(['汐 凪 漁 協'],4.5,.62,[-10.66,6.82,-6.35],[0,Math.PI/2,0],{bg:'#dce1c9',color:'#41676a',font:62,weather:true,border:'#879b8c'},warehouse);
// High side windows, sun shafts and caustic tracery below the roof.
for(let x=-16.2;x<-11.5;x+=1.65){box(1.25,.7,.06,M.glass,[x,6.55,-10.13],warehouse);for(const xx of[-.62,.62])box(.045,.78,.09,M.white,[x+xx,6.55,-10.17],warehouse);lightShaft([x,6.55,-9.85],[x+2.1,2.65,-5.6],.45,1.05,warehouse);}
for(let i=0;i<13;i++){const pts=[];for(let j=0;j<8;j++)pts.push([-16.3+j*.67,7.12,-9.2+i*.45+Math.sin(j*.9+i)*.15]);const o=tube(pts,.023,new THREE.MeshBasicMaterial({color:0xc9f4df,transparent:true,opacity:.23,depthWrite:false}),warehouse,24);caustics.push({o,phase:rnd(0,TAU)});}
// Interior fish-box pallets, chest freezer, scale, boots and auction board.
for(let level=0;level<4;level++)for(let k=0;k<3;k++)fishCrate(-15.85,2.64+level*.63,-8.9+k*.88,k===2&&level%2===0,warehouse,.92);
for(let level=0;level<3;level++)for(let k=0;k<2;k++)fishCrate(-15.95,2.64+level*.63,-4.4+k*.85,false,warehouse,.9);
box(1.75,1.05,1.1,M.white,[-14.1,3.13,-3.75],warehouse,true);box(1.72,.12,1.08,M.glass,[-14.1,3.72,-3.75],warehouse);box(.08,.32,.85,M.metal,[-13.22,3.16,-3.75],warehouse);
// Platform scale with a readable brass dial.
box(1.1,.14,.9,M.metal,[-12.1,2.7,-5.0],warehouse,true);rod([-12.55,2.75,-5.25],[-12.55,4.0,-5.25],.055,M.metal,warehouse);const dial=cyl(.32,.32,.12,24,M.cream,[-12.55,4.02,-5.25],warehouse,true);dial.rotation.z=Math.PI/2;sign(['20','kg'],.48,.48,[-12.465,4.02,-5.25],[0,Math.PI/2,0],{bg:'#eee7cf',color:'#455f5d',font:74,border:'#9a8058'},warehouse);rod([-12.44,4.02,-5.25],[-12.44,4.23,-5.25],.015,M.dark,warehouse);
sign(['本日 セリ価格','赤鯛  1,280','鰺　　640','鱸　　980'],2.35,1.35,[-13.85,4.35,-9.86],[0,0,0],{bg:'#334c48',color:'#e8e4c9',font:42,weather:true,border:'#9b7653'},warehouse);
// Two pairs of rubber boots hang beside the auction board.
for(let i=0;i<4;i++){const x=-12.15+i*.34;box(.25,.48,.18,toon(i<2?0x4a6660:0xd4b255),[x,4.1,-9.79],warehouse,true);box(.42,.13,.18,toon(i<2?0x4a6660:0xd4b255),[x+.08,3.91,-9.67],warehouse);rod([x,4.38,-9.78],[x,4.55,-9.9],.015,M.metal,warehouse);}
const warehouseGlow=new THREE.PointLight(0xffe4ad,.42,7.5);warehouseGlow.position.set(-13.8,5.7,-6.2);warehouse.add(warehouseGlow);
puddle(-13.4,-6.0,1.5,.8,2.635,warehouse);puddle(-15.7,-4.8,.75,.4,2.635,warehouse);
for(let i=0;i<20;i++){const o=ico(rnd(.025,.075),toon(0xe2f5e9),[rnd(-15.5,-11.4),2.68,rnd(-7,-3.4)],warehouse,0);o.scale.y=.5;}

// Glass-walled waiting room. Every interior object remains inspectable.
const waiting=new THREE.Group();world.add(waiting);
box(6.3,.22,5.3,toon(0xd6c6a6),[-14.1,2.53,5.65],waiting,true);
box(.22,3.8,5.3,toon(0xe2dfc8),[-17.2,4.48,5.65],waiting,true);
box(6.3,3.8,.2,toon(0xe2dfc8),[-14.1,4.48,3.05],waiting,true);
for(let x=-16.55;x<-11.1;x+=1.25){box(1.16,3.45,.045,M.glass,[x,4.4,8.25],waiting);box(.065,3.8,.085,M.white,[x-.61,4.42,8.25],waiting);}box(6.3,.09,.09,M.white,[-14.1,6.18,8.25],waiting);box(6.3,.09,.09,M.white,[-14.1,2.64,8.25],waiting);
const waitingGlow=new THREE.PointLight(0xffe5b5,.55,7);waitingGlow.position.set(-13.8,5.4,5.7);waiting.add(waitingGlow);
box(6.85,.26,5.9,toon(0x83a7a2),[-14.0,6.48,5.65],waiting,true);
box(1.1,.16,6.15,M.roof,[-10.55,6.15,5.65],waiting,true);
// Floor-to-ceiling panes on the quay-facing side.
for(let z=3.35;z<8.2;z+=1.18){box(.045,3.45,1.08,M.glass,[-10.93,4.4,z],waiting);box(.085,3.8,.065,M.white,[-10.88,4.42,z-.58],waiting);}
box(.09,.09,5.15,M.white,[-10.87,6.18,5.65],waiting);box(.09,.09,5.15,M.white,[-10.87,2.64,5.65],waiting);
sign(['汐 待 合 所'],3.4,.48,[-10.78,6.0,5.65],[0,Math.PI/2,0],{bg:'#e8e8d4',color:'#50757a',font:58,weather:true},waiting);
// Wooden bench with separate slats and cast-iron legs.
for(let j=0;j<4;j++)box(.62,.1,.86,M.wood,[-14.65,3.35,3.85+j*.98],waiting,true);
for(let j=0;j<3;j++)box(.12,.2,3.85,M.wood,[-15.0,3.8+j*.23,5.32],waiting,true);
for(const z of[3.95,6.7]){rod([-14.65,2.64,z],[-14.65,3.3,z],.065,M.dark,waiting);rod([-15.0,3.28,z],[-15.0,4.35,z],.055,M.dark,waiting);}
// Timetable, crooked clock and tiny station name plates.
sign(['汐凪港  発船時刻','07:20  09:10','11:40  13:25','15:10  17:30'],1.6,1.75,[-17.06,4.7,4.15],[0,Math.PI/2,-.018],{bg:'#e6dfc4',color:'#596d66',font:38,weather:true,border:'#8c9b89'},waiting);
const clock=new THREE.Group();clock.position.set(-12.5,5.18,3.18);clock.rotation.set(.12,-Math.PI/2,0);clock.scale.setScalar(1.12);waiting.add(clock);const clockFace=cyl(.48,.48,.1,32,M.cream,[0,0,0],clock,true);clockFace.rotation.z=Math.PI/2;ring(.49,.035,M.wood,[.07,0,0],clock,[0,Math.PI/2,0]);for(let i=0;i<12;i++){const a=i/12*TAU;sph(.028,M.dark,[.09,Math.cos(a)*.37,Math.sin(a)*.37],clock);}rod([.1,0,0],[.1,.26,-.09],.02,M.dark,clock);rod([.11,0,0],[.11,-.12,.27],.016,M.dark,clock);
// Old radio and a kettle share the corner table.
box(1.65,.12,.8,M.wood,[-11.85,3.25,7.25],waiting,true);for(const x of[-12.45,-11.25])for(const z of[6.98,7.52])rod([x,2.62,z],[x,3.2,z],.04,M.dark,waiting);
box(.48,.55,.95,toon(0x9a7958),[-12.08,3.57,7.25],waiting,true);box(.02,.34,.44,toon(0x4f5e58),[-11.825,3.58,7.04],waiting);for(let y=3.44;y<3.75;y+=.06)box(.02,.018,.39,M.metal,[-11.81,y,7.04],waiting);cyl(.065,.065,.035,16,M.cream,[-11.79,3.64,7.52],waiting).rotation.z=Math.PI/2;rod([-12.05,3.86,7.0],[-12.05,4.55,6.72],.012,M.metal,waiting);
cyl(.22,.26,.4,16,M.metal,[-11.28,3.53,7.35],waiting,true);cyl(.2,.24,.055,16,M.dark,[-11.28,3.76,7.35],waiting);ring(.24,.025,M.dark,[-11.28,3.84,7.35],waiting,[0,Math.PI/2,0]);rod([-11.06,3.52,7.35],[-10.99,3.68,7.35],.045,M.metal,waiting);
// A pothos catches the light beside the front glass.
cyl(.3,.22,.38,14,toon(0xb57955),[-11.65,2.82,3.65],waiting,true);
for(let i=0;i<12;i++){const a=i/12*TAU;const xx=-11.65+Math.cos(a)*.32,zz=3.65+Math.sin(a)*.3;rod([-11.65,3.0,3.65],[xx,3.45+rnd(0,.35),zz],.015,toon(0x587e58),waiting);const leaf=sph(.16,toon(i%2?0x6c9e68:0x87ae71),[xx,3.5+rnd(0,.3),zz],waiting,[.55,1,.3]);leaf.rotation.z=rnd(-1,1);}

// A glowing drinks machine under a rusty rain awning.
const vending=new THREE.Group();vending.position.set(-12.15,2.42,-1.35);world.add(vending);
box(1.05,2.55,1.45,toon(0xdde4d7),[0,1.28,0],vending,true);
const drinkCv=document.createElement('canvas');drinkCv.width=256;drinkCv.height=384;const dc=drinkCv.getContext('2d');dc.fillStyle='#e9f4df';dc.fillRect(0,0,256,384);dc.fillStyle='#527d80';dc.font='bold 26px sans-serif';dc.textAlign='center';dc.fillText('つめた〜い',128,34);for(let r=0;r<3;r++)for(let c=0;c<4;c++){dc.fillStyle=['#e79565','#74a6b4','#e4c869','#90af84'][(r+c)%4];dc.fillRect(24+c*56,61+r*73,28,48);dc.fillStyle='#f4f1da';dc.fillRect(27+c*56,73+r*73,22,10);dc.fillStyle='#668b8c';dc.fillRect(24+c*56,116+r*73,28,5);}dc.fillStyle='#527d80';dc.fillRect(20,300,216,55);dc.fillStyle='#e9c97b';dc.fillRect(157,313,52,20);const dt=new THREE.CanvasTexture(drinkCv);dt.encoding=THREE.sRGBEncoding;const dm=new THREE.MeshBasicMaterial({map:dt});const dp=mesh(new THREE.PlaneGeometry(1.22,1.93),dm,[.536,1.46,0],vending);dp.rotation.y=Math.PI/2;
box(1.65,.12,1.95,M.rust,[.15,2.82,0],vending,true);for(let z=-.8;z<.9;z+=.22)box(1.65,.035,.035,M.metal,[.15,2.9,z],vending);
const vendLight=new THREE.PointLight(0xffedbe,.65,4);vendLight.position.set(1,1.6,0);vending.add(vendLight);

// Lighthouse with red-white bands, gallery, lantern and a real small light.
const lighthouse=new THREE.Group();lighthouse.position.set(-5.7,2.03,-16.35);world.add(lighthouse);
cyl(1.12,1.35,.38,24,M.concrete,[0,.19,0],lighthouse,true);
for(let i=0;i<5;i++)cyl(.68-i*.045,.74-i*.045,1.0,24,i%2?M.red:M.white,[0,.88+i,0],lighthouse,true);
box(.05,1.0,.48,M.deep,[.7,.95,0],lighthouse,true);sign(['灯'],.34,.45,[.735,1.35,0],[0,Math.PI/2,0],{bg:'#e8e4cc',color:'#49656a',font:90},lighthouse);
for(let i=0;i<3;i++){const a=i/3*TAU;const w=box(.05,.34,.28,M.deep,[Math.cos(a)*.56,3.05+i*.72,Math.sin(a)*.56],lighthouse,true);w.rotation.y=-a;}
cyl(1.0,1.0,.18,24,M.white,[0,5.56,0],lighthouse,true);ring(.91,.035,M.dark,[0,5.96,0],lighthouse,[Math.PI/2,0,0]);
for(let i=0;i<16;i++){const a=i/16*TAU;rod([Math.cos(a)*.91,5.62,Math.sin(a)*.91],[Math.cos(a)*.91,6.02,Math.sin(a)*.91],.025,M.dark,lighthouse);}
cyl(.59,.59,1.15,20,M.glass,[0,6.17,0],lighthouse);for(let i=0;i<8;i++){const a=i/8*TAU;rod([Math.cos(a)*.58,5.62,Math.sin(a)*.58],[Math.cos(a)*.58,6.75,Math.sin(a)*.58],.035,M.white,lighthouse);}
const lampMat=new THREE.MeshBasicMaterial({color:0xffe8a3,transparent:true,opacity:.55});const lamp=sph(.27,lampMat,[0,6.15,0],lighthouse);const lampLight=new THREE.PointLight(0xffd37a,0,12);lampLight.position.set(0,6.15,0);lighthouse.add(lampLight);
cyl(0,.86,.72,24,M.red,[0,7.1,0],lighthouse,true);sph(.11,M.metal,[0,7.52,0],lighthouse);rod([0,7.48,0],[0,8.05,0],.025,M.dark,lighthouse);
const beacon=lightShaft([0,6.16,0],[10,6.16,0],.1,2.2,lighthouse);beacon.material.opacity=0;

// A small green hill and tiled-roof village in the far corner.
const hillMat=toon(0x88af8c);const hill=ico(4.8,hillMat,[11.8,.2,-11.7],world,2);hill.scale.set(1.32,.72,1.06);
const hill2=ico(3.3,toon(0x7fa885),[10.2,2.1,-12.1],world,2);hill2.scale.set(1.25,.65,1);hillMat.color.setHex(0x739f7d);
function hillY(x,z){const a=1-Math.pow((x-11.8)/6.336,2)-Math.pow((z+11.7)/5.088,2),b=1-Math.pow((x-10.2)/4.125,2)-Math.pow((z+12.1)/3.3,2);return Math.max(a>0?.2+3.456*Math.sqrt(a):.25,b>0?2.1+2.145*Math.sqrt(b):.25);}
for(let i=0;i<38;i++){const a=i*2.399,r=1.2+(i%9)*.52,x=11.8+Math.cos(a)*r,z=-11.7+Math.sin(a)*r*.72,y=hillY(x,z);if(y>1){const o=ico(.18+(i%4)*.07,toon(i%3?0x5f916e:0x94b77e),[x,y+.04,z],world,0);o.scale.set(1.5,.28,1);}}
const hillPath=new THREE.CatmullRomCurve3([new THREE.Vector3(14.5,0,-7.2),new THREE.Vector3(13.6,0,-8.8),new THREE.Vector3(11.4,0,-9.7),new THREE.Vector3(10.2,0,-11.0),new THREE.Vector3(9.1,0,-11.65)]);
for(let i=0;i<22;i++){const u=i/21,p=hillPath.getPoint(u),tan=hillPath.getTangent(u);p.y=hillY(p.x,p.z)+.08;const step=box(.68,.1,.34,toon(i%3?0xc6c7ad:0xaeb9a4),p.toArray(),world,true);step.rotation.y=Math.atan2(tan.x,tan.z);}
for(let i=0;i<20;i++){const a=rnd(0,TAU),r=rnd(2.8,6);const o=ico(rnd(.25,.65),toon(0x91a79a),[11.5+Math.cos(a)*r,rnd(-.4,.4),-11.7+Math.sin(a)*r*.75],world,0);o.scale.y=.65;}
function house(x,y,z,s=1,roofColor=0x658e99){const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(s);world.add(g);box(2.4,1.65,2.0,toon(0xe8e5cf),[0,.83,0],g,true);gableRoof(2.85,2.5,.85,toon(roofColor),[0,1.65,0],g);for(let zz=-1.1;zz<1.15;zz+=.28){rod([-1.4,1.7,zz],[0,2.52,zz],.022,toon(0x91a9a5),g,5);rod([0,2.52,zz],[1.4,1.7,zz],.022,toon(0x91a9a5),g,5);}box(.08,.85,.55,M.wood,[1.22,.45,.35],g,true);for(const zz of[-.55,.6]){box(.06,.58,.5,toon(0x8fc0c1),[1.23,1.03,zz],g,true);box(.07,.05,.55,M.white,[1.27,1.03,zz],g);}box(.55,.55,.06,toon(0x89b8bc),[.45,1.02,1.03],g,true);box(.4,.8,.06,M.wood,[-.55,.43,1.03],g,true);return g;}
house(9.0,3.25,-11.7,.88,0x628b98);house(13.2,2.65,-10.2,.82,0xb78268);house(12.1,3.2,-14.25,.72,0x698b8e);
function tree(x,y,z,s=1){const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(s);world.add(g);rod([0,0,0],[0,1.8,0],.12,M.wood,g);const crown=new THREE.Group();crown.position.y=1.7;g.add(crown);ico(.95,toon(0x679b78),[0,.4,0],crown,1);ico(.72,toon(0x7dac80),[-.58,.1,.12],crown,1);ico(.74,toon(0x8bb98b),[.55,.18,.06],crown,1);ico(.65,toon(0x75a97e),[.05,.15,-.55],crown,1);windTrees.push({crown,phase:rnd(0,TAU),z});return g;}
[[6.8,1.3,-12.8,1.1],[8.0,2.0,-15.0,.95],[15.3,1.1,-12.8,1.15],[14.7,1.5,-8.7,.9],[10.4,2.5,-9.1,.8],[16.0,.7,-15.2,.8],[7.1,1.2,-9.8,.8]].forEach(a=>tree(...a));

// Four-legged concrete wave dissipators, each modeled as a small sculpture.
const foamBits=[];
function tetrapod(x,y,z,s=1,rot=0){const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(s);g.rotation.y=rot;world.add(g);sph(.38,M.concrete2,[0,0,0],g);const dirs=[[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]];for(const d of dirs){const v=new THREE.Vector3(...d).normalize();rod(v.clone().multiplyScalar(.12).toArray(),v.clone().multiplyScalar(1.05).toArray(),.23,M.concrete2,g,10);sph(.25,M.concrete,v.clone().multiplyScalar(1.03).toArray(),g);}addEdges(g.children[0],25);return g;}
[[15.9,.0,7.8,1.15,.2],[17.0,-.6,5.8,.95,1.1],[14.4,-.4,9.0,.9,2.2],[-2.9,.1,-15.3,1.05,.4],[-2.4,-.6,-17.0,.85,1.7],[-8.2,-.5,-14.2,.8,.5]].forEach(a=>tetrapod(...a));
for(let i=0;i<38;i++){const around=i<24?[15.8,7.4]:[-3,-15.7];const o=sph(rnd(.035,.12),M.foam,[around[0]+rnd(-1.6,1.6),.13,around[1]+rnd(-1.3,1.3)],world,[1.8,.25,1]);o.castShadow=false;foamBits.push({o,phase:rnd(0,TAU),baseY:o.position.y});}

// Custom built hulls: five stations, a fine bow, white topsides and deep-teal below the waterline.
function hullBand(L,W,top,bottom,topFactor,bottomFactor,material,parent){const zs=[-L/2,-L*.32,0,L*.32,L/2],ws=[.025,W*.75,W,W*.92,W*.8];const verts=[],idx=[];for(let i=0;i<zs.length;i++){const wt=ws[i]*topFactor,wb=ws[i]*bottomFactor;verts.push(-wt,top,zs[i],-wb,bottom,zs[i],wb,bottom,zs[i],wt,top,zs[i]);}for(let i=0;i<zs.length-1;i++){const a=i*4,b=(i+1)*4;idx.push(a,b,b+1,a,b+1,a+1,a+2,b+2,b+3,a+2,b+3,a+3,a+1,b+1,b+2,a+1,b+2,a+2);}idx.push(0,1,2,0,2,3);const n=(zs.length-1)*4;idx.push(n,n+2,n+1,n,n+3,n+2);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setIndex(idx);g.computeVertexNormals();const o=mesh(g,material,null,parent);addEdges(o,32,C.ink,.62);return o;}
function deckGeometry(L,W){const s=new THREE.Shape();s.moveTo(0,-L/2);s.lineTo(W*.75,-L*.32);s.lineTo(W,0);s.lineTo(W*.92,L*.32);s.lineTo(W*.8,L/2);s.lineTo(-W*.8,L/2);s.lineTo(-W*.92,L*.32);s.lineTo(-W,0);s.lineTo(-W*.75,-L*.32);s.closePath();return new THREE.ShapeGeometry(s);}
function radarTexture(kind=0){const cv=document.createElement('canvas');cv.width=256;cv.height=192;const c=cv.getContext('2d');c.fillStyle='#163f42';c.fillRect(0,0,256,192);c.strokeStyle='#75d6a4';c.lineWidth=2;c.globalAlpha=.7;if(kind===0){for(let r=25;r<110;r+=25){c.beginPath();c.arc(105,100,r,0,TAU);c.stroke();}c.beginPath();c.moveTo(105,100);c.lineTo(188,44);c.stroke();for(let i=0;i<17;i++){c.fillStyle='#b9e9a0';c.fillRect(rnd(40,200),rnd(35,160),rnd(2,6),rnd(2,5));}c.beginPath();c.moveTo(15,100);c.lineTo(220,100);c.moveTo(105,10);c.lineTo(105,184);c.stroke();}else{c.beginPath();for(let x=0;x<235;x++){const y=90+Math.sin(x*.08)*20+Math.sin(x*.23)*7;x?c.lineTo(x+10,y):c.moveTo(x+10,y);}c.stroke();for(let i=0;i<9;i++){c.strokeStyle='#d8d77d';c.strokeRect(rnd(25,210),rnd(70,155),rnd(5,14),rnd(3,7));}}c.globalAlpha=1;c.fillStyle='#c8edb0';c.font='14px monospace';c.fillText(kind?'50m  18.4°C':'RANGE 2.0  GPS',12,181);const t=new THREE.CanvasTexture(cv);t.encoding=THREE.sRGBEncoding;return t;}
const chartCv=document.createElement('canvas');chartCv.width=512;chartCv.height=320;const ch=chartCv.getContext('2d');ch.fillStyle='#eee7ca';ch.fillRect(0,0,512,320);ch.strokeStyle='#b7c7b5';ch.lineWidth=1;for(let x=20;x<340;x+=40){ch.beginPath();ch.moveTo(x,40);ch.lineTo(x,300);ch.stroke();}for(let y=40;y<300;y+=40){ch.beginPath();ch.moveTo(12,y);ch.lineTo(338,y);ch.stroke();}ch.fillStyle='#456f73';ch.font='bold 22px "Yu Gothic",sans-serif';ch.fillText('汐凪沖  海図',18,28);ch.strokeStyle='#659b98';ch.lineWidth=4;ch.beginPath();ch.moveTo(30,280);ch.bezierCurveTo(55,205,140,245,125,160);ch.bezierCurveTo(115,105,220,125,205,45);ch.stroke();ch.lineWidth=2;for(let i=0;i<4;i++){ch.beginPath();ch.moveTo(48+i*12,286);ch.bezierCurveTo(82+i*10,220,158+i*12,250,148+i*9,164);ch.bezierCurveTo(140+i*8,125,232+i*7,120,226+i*6,50);ch.stroke();}ch.fillStyle='#698c88';ch.font='16px monospace';['18','24','50','36'].forEach((s,i)=>ch.fillText(s,170+i*31,175+i%2*47));ch.strokeStyle='#c86b58';ch.setLineDash([7,5]);ch.beginPath();ch.moveTo(72,260);ch.lineTo(240,90);ch.stroke();ch.setLineDash([]);ch.strokeStyle='#4e7779';ch.beginPath();ch.arc(70,78,27,0,TAU);ch.stroke();ch.beginPath();ch.moveTo(70,108);ch.lineTo(70,48);ch.moveTo(40,78);ch.lineTo(100,78);ch.stroke();ch.fillStyle='#4e7779';ch.fillText('N',63,45);ch.fillStyle='#d8d1b6';ch.fillRect(350,0,162,320);ch.strokeStyle='#8c9d8c';ch.strokeRect(350,0,162,320);ch.fillStyle='#4c6868';ch.font='bold 21px "Yu Gothic",sans-serif';ch.fillText('潮 汐 表',374,35);ch.font='16px monospace';['04:18  満潮','10:02  干潮','14:32  満潮','22:16  干潮'].forEach((s,i)=>ch.fillText(s,359,76+i*43));ch.fillStyle='#c27055';ch.fillRect(358,248,130,3);ch.fillStyle='#526e6c';ch.font='14px "Yu Gothic",sans-serif';ch.fillText('汐凪漁協',383,282);const chartTex=new THREE.CanvasTexture(chartCv);chartTex.encoding=THREE.sRGBEncoding;chartTex.anisotropy=renderer.capabilities.getMaxAnisotropy();
const photoCv=document.createElement('canvas');photoCv.width=192;photoCv.height=160;const ph=photoCv.getContext('2d');ph.fillStyle='#eee3c7';ph.fillRect(0,0,192,160);ph.fillStyle='#82b5b3';ph.fillRect(9,9,174,126);ph.fillStyle='#b9d6c8';ph.fillRect(9,93,174,42);for(let i=0;i<3;i++){const x=48+i*48,y=57+(i%2)*30;ph.fillStyle=i===1?'#d9b763':'#d9e2d5';ph.beginPath();ph.ellipse(x,y,28,12,-.18,0,TAU);ph.fill();ph.beginPath();ph.moveTo(x-24,y);ph.lineTo(x-41,y-12);ph.lineTo(x-40,y+12);ph.closePath();ph.fill();ph.fillStyle='#3d5e61';ph.beginPath();ph.arc(x+16,y-3,2.5,0,TAU);ph.fill();}ph.fillStyle='#526b67';ph.font='bold 16px "Yu Gothic",sans-serif';ph.fillText('大漁 · 汐凪',54,153);const photoTex=new THREE.CanvasTexture(photoCv);photoTex.encoding=THREE.sRGBEncoding;
function lifeRing(parent,x,y,z,side=1){const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=side*Math.PI/2;parent.add(g);for(let i=0;i<8;i++){const o=mesh(new THREE.TorusGeometry(.33,.075,7,5,Math.PI/4),i%2?M.white:M.orange,null,g);o.rotation.z=i*Math.PI/4;}ring(.43,.014,toon(0xd7cfb2),[0,0,0],g);return g;}
function raincoat(parent,x,y,z){const s=new THREE.Shape();s.moveTo(-.18,.48);s.lineTo(-.42,.25);s.lineTo(-.58,-.1);s.lineTo(-.43,-.18);s.lineTo(-.29,.04);s.lineTo(-.25,-.55);s.lineTo(.25,-.55);s.lineTo(.29,.04);s.lineTo(.43,-.18);s.lineTo(.58,-.1);s.lineTo(.42,.25);s.lineTo(.18,.48);s.closePath();const o=mesh(new THREE.ShapeGeometry(s),new THREE.MeshToonMaterial({color:0xe5bc43,gradientMap:gradient,side:THREE.DoubleSide}),[x,y,z],parent);addEdges(o,20);ring(.15,.035,M.yellow,[x,y+.49,z],parent);rod([x,y+.65,z],[x,y+.8,z],.015,M.metal,parent);return o;}
const boats=[];
function makeBoat(name,x,z,rot=0,style=0,detailed=true){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;world.add(g);const L=style===2?5.1:5.7,W=style===1?1.03:1.12;
 hullBand(L,W,.78,.06,1,.88,M.white,g);hullBand(L,W,.07,-.64,.89,.34,style===1?toon(0x467f91):M.deep,g);
 const deck=mesh(deckGeometry(L,W),std(0xd8d7bd,{roughness:.55}),[0,.76,0],g);deck.rotation.x=Math.PI/2;deck.material.side=THREE.DoubleSide;addEdges(deck,20);
 // Gunwale rail follows the hull rather than a rectangular approximation.
 for(const side of[-1,1]){const pts=[[0,.91,-L/2],[side*W*.75,.91,-L*.32],[side*W,.91,0],[side*W*.92,.91,L*.32],[side*W*.8,.91,L/2]];tube(pts,.035,M.white,g,35);for(let k=1;k<4;k++){const zz=-L*.32+(k-1)*L*.32;rod([side*W*.92,.75,zz],[side*W*.92,1.08,zz],.025,M.metal,g);}}
 // Cabin low walls, thin framing, and genuinely transparent windows.
 const cw=style===1?.79:.83,cz=.18,front=-.92,back=1.38;
 box(cw*2,.48,back-front,M.white,[0,1.0,cz],g,true);
 for(const xx of[-cw,cw])for(const zz of[front,back])box(.075,1.55,.075,M.white,[xx,1.65,zz],g,true);
 box(cw*2+.2,.16,back-front+.28,style===2?toon(0x6d9b9e):M.white,[0,2.47,cz],g,true);
 // Front windscreen split into two panes.
 for(const xx of[-cw*.48,cw*.48]){box(cw*.88,1.02,.035,M.glass,[xx,1.82,front],g);rod([xx,1.28,front-.025],[xx,1.75,front-.07],.014,M.dark,g);}
 for(const xx of[-cw,cw]){box(.035,1.03,1.63,M.glass,[xx,1.8,.12],g);box(.04,.06,1.72,M.white,[xx,1.27,.12],g);box(.04,.06,1.72,M.white,[xx,2.34,.12],g);}
 // Rear bulkhead leaves the middle open; the hinged door is swung outside.
 box(.38,1.3,.055,M.white,[-cw+.18,1.72,back],g,true);box(.38,1.3,.055,M.white,[cw-.18,1.72,back],g,true);
 const door=new THREE.Group();door.position.set(-cw+.37,1.05,back+.02);door.rotation.y=-.78;g.add(door);box(.72,1.25,.045,M.glass,[.36,.62,0],door,true);for(const xx of[0,.72])box(.045,1.3,.055,M.white,[xx,.62,0],door);box(.77,.06,.06,M.white,[.36,1.27,0],door);rod([.6,.55,.04],[.6,.75,.04],.018,M.metal,door);
 // Console, glowing radar and fish finder.
 box(1.3,.57,.48,toon(0x526e6c),[0,1.13,-.54],g,true);
 const screenMat=new THREE.MeshBasicMaterial({map:radarTexture(0)});box(.57,.43,.16,M.dark,[.3,1.55,-.36],g,true);const scr=mesh(new THREE.PlaneGeometry(.48,.33),screenMat,[.3,1.56,-.268],g);scr.rotation.x=-.08;
 const fishMat=new THREE.MeshBasicMaterial({map:radarTexture(1)});box(.42,.34,.14,M.dark,[-.37,1.48,-.35],g,true);mesh(new THREE.PlaneGeometry(.35,.25),fishMat,[-.37,1.49,-.272],g);
 const wheel=ring(.25,.026,M.dark,[0,1.38,-.06],g);for(let i=0;i<6;i++){const a=i/6*TAU;rod([0,1.38,-.055],[Math.cos(a)*.23,1.38+Math.sin(a)*.23,-.055],.012,M.metal,g);}rod([0,1.38,-.25],[0,1.38,-.04],.04,M.metal,g);
 // A clipboard with a drawn coastal chart and a complete tide table, visible across the cabin.
 box(.035,.58,.82,M.wood,[-.77,1.72,.18],g,true);const chart=mesh(new THREE.PlaneGeometry(.72,.47),new THREE.MeshBasicMaterial({map:chartTex,toneMapped:false}),[-.748,1.72,.18],g);chart.rotation.y=Math.PI/2;box(.03,.055,.18,M.metal,[-.725,1.995,.18],g,true);rod([-.56,1.49,-.42],[-.15,1.49,-.36],.012,M.yellow,g);
 // Thermos, enamel cup and their small shelf.
 box(.72,.07,.5,M.wood,[.42,1.03,.98],g);cyl(.12,.13,.46,14,M.metal,[.52,1.3,.98],g,true);cyl(.125,.125,.055,14,M.orange,[.52,1.34,.98],g);cyl(.12,.12,.07,14,M.orange,[.52,1.56,.98],g);cyl(.115,.1,.19,16,M.white,[.15,1.16,1.02],g,true);cyl(.12,.12,.025,16,M.deep,[.15,1.27,1.02],g);ring(.085,.018,M.white,[.26,1.18,1.02],g,[0,Math.PI/2,0]);
 raincoat(g,-.46,1.68,1.33);
 sign(['海上安全'],.26,.5,[.79,2.0,-.61],[0,Math.PI/2,0],{bg:'#efe3c6',color:'#c45d4c',font:52,border:'#c45d4c'},g);
 const catchPhoto=mesh(new THREE.PlaneGeometry(.36,.3),new THREE.MeshBasicMaterial({map:photoTex,toneMapped:false}),[.815,1.66,.75],g);catchPhoto.rotation.set(0,Math.PI/2,-.04);
 // A ceiling caustic ribbon, visible through the open cabin.
 for(let i=0;i<4;i++){const pts=[];for(let j=0;j<5;j++)pts.push([-.65+j*.32,2.365,-.5+i*.45+Math.sin(j+i)*.1]);const o=tube(pts,.018,new THREE.MeshBasicMaterial({color:0xd1f6dd,transparent:true,opacity:.3,depthWrite:false}),g,16);caustics.push({o,phase:rnd(0,TAU)});}
 const cabinGlow=new THREE.PointLight(0xa4e5c1,.16,2.2);cabinGlow.position.set(0,1.8,0);g.add(cabinGlow);const cabinBeam=lightShaft([-.55,2.28,-.78],[.2,1.0,.72],.1,.32,g);cabinBeam.material.opacity=.035;cabinBeam.userData.baseOpacity=.035;
 // Mast, antennae, radar dome, navigation lights and sunshade ironwork.
 rod([0,2.54,-.2],[0,4.0,-.2],.045,M.white,g);rod([-.58,3.32,-.2],[.58,3.32,-.2],.035,M.white,g);rod([.45,2.53,.55],[.45,4.12,.55],.016,M.dark,g);rod([-.5,2.5,.65],[-.62,3.6,.7],.016,M.dark,g);
 sph(.21,M.white,[0,3.48,-.2],g,[1.4,.65,1]);box(.65,.09,.22,M.white,[0,3.1,-.2],g,true);sph(.065,new THREE.MeshBasicMaterial({color:0xe97155}),[-.58,3.34,-.2],g);sph(.065,new THREE.MeshBasicMaterial({color:0x7ebf9c}),[.58,3.34,-.2],g);
 if(style!==1){for(const xx of[-.73,.73])rod([xx,.9,1.65],[xx,2.45,1.65],.032,M.metal,g);box(1.68,.06,1.18,toon(0x7da5a2),[0,2.45,1.85],g);}
 // Faded registration, chipped paint and rust below scuppers.
 sign([name],1.25,.28,[W*.94,.49,.8],[0,Math.PI/2,0],{color:'#53777b',font:72,weather:true},g);
 for(let i=0;i<7;i++){const zz=rnd(-1.7,2);box(.016,rnd(.08,.28),rnd(.018,.04),M.rust,[W*.92,.25,zz],g);}
 for(const side of[-1,1]){lifeRing(g,side*(W+.03),1.35,1.85,side);for(const zz of[-.6,1.15,2.05]){const tire=ring(.25,.085,M.dark,[side*(W+.13),.42,zz],g,[0,Math.PI/2,0]);tube([[side*W,.85,zz],[side*(W+.1),.67,zz],[side*(W+.13),.58,zz]],.018,toon(0xb49a72),g,10);}}
 // Bow cleat, coiled warp and a small anchor.
 rod([-.22,.86,-2.05],[.22,.86,-2.05],.04,M.metal,g);for(let i=0;i<4;i++)ring(.18+i*.035,.018,toon(0xb99b73),[0,.82,-1.65],g,[Math.PI/2,0,0]);
 rod([0,.6,-2.65],[0,-.05,-2.8],.045,M.dark,g);rod([-.22,-.02,-2.8],[.22,-.02,-2.8],.04,M.dark,g);
 const data={g,name,x,z,rot,phase:rnd(0,TAU),style,outer:boats.length===2,ropes:[]};boats.push(data);return data;
}
makeBoat('汐 102',-5.7,7.72,Math.PI/2,0);
makeBoat('凪 208',0,7.72,Math.PI/2,1);
makeBoat('白 316',5.7,7.72,Math.PI/2,0);
makeBoat('港 058',-8.15,-5.4,0,2);
// A smaller distant vessel beyond the main berths.
const distantBoat=makeBoat('遠 021',9,-15.1,Math.PI/2,1,false);distantBoat.g.scale.setScalar(.55);boats.pop();

// Bollards, fiber warps and slack water-darkened ends.
function bollard(x,z){const g=new THREE.Group();g.position.set(x,2.42,z);world.add(g);cyl(.25,.33,.12,12,M.dark,[0,.06,0],g,true);cyl(.16,.21,.62,12,M.dark,[0,.42,0],g,true);cyl(.29,.29,.14,12,M.dark,[0,.75,0],g,true);rod([-.38,.63,0],[.38,.63,0],.095,M.dark,g);return g;}
const bollardPositions=[[-8.5,10.65],[-3.1,10.65],[2.6,10.65],[8.5,10.65],[-10.65,3.0],[-10.65,-3],[-10.65,-9.1]];
bollardPositions.forEach(p=>bollard(...p));
const ropeMat=std(0xb5946c,{roughness:.95});const wetRope=std(0x716e55,{roughness:1}),mooringLines=[];
function mooringRope(boat,local,boll,outer=false){const g=new THREE.Group();world.add(g);const end=new THREE.Vector3(...local).applyMatrix4(boat.g.matrixWorld),start=new THREE.Vector3(boll[0],2.95,boll[1]);const pts=[start.toArray(),[start.x,3.05,start.z],[(start.x+end.x)*.5,1.85,(start.z+end.z)*.5],[end.x,.8,end.z]];const main=tube(pts,.04,ropeMat,g,30),wet=tube([[end.x,.65,end.z],[end.x+.12,-.1,end.z+.15],[end.x+.2,-.7,end.z+.22]],.042,wetRope,g,12);for(let i=0;i<3;i++)ring(.22+i*.018,.032,ropeMat,[boll[0],2.77+i*.09,boll[1]],g,[Math.PI/2,0,0]);boat.ropes.push(g);mooringLines.push({g,boat,local:new THREE.Vector3(...local),start,main,wet,phase:mooringLines.length*1.71});return g;}
world.updateMatrixWorld(true);
mooringRope(boats[0],[-2.2,.8,0],[-8.5,10.65]);mooringRope(boats[1],[-2.2,.8,0],[-3.1,10.65]);mooringRope(boats[2],[-2.2,.8,0],[8.5,10.65],true);mooringRope(boats[3],[-.8,.8,1.8],[-10.65,-3]);
// Independent heavy rope dropped from a rusty wall ring.
tube([[-9.75,2.7,1],[-9.2,1.8,1.1],[-8.9,.3,1.2],[-8.6,-.8,1.4]],.055,ropeMat,world,40);

// Moving wake tiles, revealed only when the outer boat is underway.
const wakeTiles=[];for(let i=0;i<34;i++){const o=refl(0,0,rnd(.25,.75),rnd(.12,.32),0xf4fff0,.65);wakeTiles.push(o);}
const journeyCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(5.7,0,7.72),new THREE.Vector3(10.5,0,4.5),new THREE.Vector3(11.7,0,-3.7),new THREE.Vector3(5.4,0,-8.5),new THREE.Vector3(-1.5,0,-5),new THREE.Vector3(-.4,0,2.8),new THREE.Vector3(5.7,0,7.72)]);

// Each boat carries a broken, flat-color reflection that follows its route without following its bob.
boats.forEach((b,bi)=>{const rg=new THREE.Group();world.add(rg);const shards=[];for(let i=0;i<10;i++){const side=i%2?1:-1,w=.34+(i%3)*.17,d=.12+(i%4)*.035,s=new THREE.Shape();s.moveTo(-w*.5,-d*.35);s.lineTo(-w*.25,-d*.55);s.lineTo(w*.48,-d*.28);s.lineTo(w*.35,d*.46);s.lineTo(-w*.42,d*.3);s.closePath();const m=new THREE.MeshBasicMaterial({color:i%3===0?0xf0f2dc:i%3===1?0x2d7781:0x83c4bb,transparent:true,opacity:.36,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});const o=mesh(new THREE.ShapeGeometry(s),m,[side*(1.0+(i%3)*.16),.085,-2.2+(i%5)*1.03],rg);o.rotation.x=-Math.PI/2;o.castShadow=false;o.renderOrder=4;shards.push(o);}b.reflection={g:rg,shards};});

// Ring-shaded quay lamps and gently sagging power lines.
const lampDrops=[];
function quayLamp(x,z,h=5.3){const g=new THREE.Group();g.position.set(x,2.42,z);world.add(g);cyl(.22,.3,.18,12,M.dark,[0,.09,0],g,true);rod([0,.1,0],[0,h-.3,0],.065,toon(0x426567),g);tube([[0,h-.35,0],[0,h,0],[.25,h+.22,0],[.65,h+.22,0]],.065,toon(0x426567),g,18);ring(.46,.065,toon(0x587a78),[.67,h+.13,0],g,[Math.PI/2,0,0]);cyl(.4,.22,.16,20,toon(0xe4e3ca),[.67,h+.06,0],g);sph(.18,new THREE.MeshBasicMaterial({color:0xffe9ae,transparent:true,opacity:.8}),[.67,h-.03,0],g,[1,.45,1]);for(let i=0;i<6;i++){const a=i/6*TAU;const d=sph(.025,new THREE.MeshBasicMaterial({color:0xffe9b0}),[.67+Math.cos(a)*.4,h+.02,Math.sin(a)*.4],g);lampDrops.push({o:d,top:d.position.y,phase:rnd(0,1),parent:g});}return [x,2.42+h+.35,z];}
const lp1=quayLamp(-8.2,14.9,5.3),lp2=quayLamp(-11.0,-12.0,5.0),lp3=quayLamp(8.6,16.1,4.9),lp4=quayLamp(-11.0,1.25,4.7);
tube([lp2,[-12,7.2,-5],lp4,[-10.8,7.0,7],lp1],.018,toon(0x49696b),world,70);
tube([lp1,[0,7.0,17],lp3],.016,toon(0x49696b),world,45);

// Drying net, individual knotted grid, cork floats and an iron rack.
const netGroup=new THREE.Group();netGroup.position.set(-10.72,2.45,.25);world.add(netGroup);
for(const z of[-1.3,1.3]){rod([0,0,z],[0,3.1,z],.055,M.rust,netGroup);rod([-.35,0,z],[.35,0,z],.045,M.rust,netGroup);}
rod([0,3.05,-1.35],[0,3.05,1.35],.05,M.rust,netGroup);
const netVerts=[];for(let j=0;j<=12;j++){const z=-1.25+j*2.5/12;for(let k=0;k<10;k++){const y1=.25+k*.25,y2=y1+.25;netVerts.push(.08*Math.sin(j+k),y1,z,.08*Math.sin(j+k+1),y2,z);}}for(let k=0;k<=10;k++){const y=.25+k*.25;for(let j=0;j<12;j++){const z1=-1.25+j*2.5/12,z2=z1+2.5/12;netVerts.push(.08*Math.sin(j+k),y,z1,.08*Math.sin(j+k+1),y,z2);}}
const netGeo=new THREE.BufferGeometry();netGeo.setAttribute('position',new THREE.Float32BufferAttribute(netVerts,3));const netLines=new THREE.LineSegments(netGeo,M.net);netGroup.add(netLines);
for(let i=0;i<13;i++){sph(.095,i%3===0?M.orange:M.cream,[0,2.82,-1.25+i*2.5/12],netGroup,[1,.8,1]);}
// Rope string with faded floats beside the rack.
tube([[-10.45,4.6,-1.4],[-9.9,3.8,.2],[-10.4,4.4,1.75]],.025,ropeMat,world,25);
for(let i=0;i<9;i++)sph(.11,i%2?M.orange:M.cream,[-10.05+Math.sin(i*.6)*.16,4.05-Math.sin(i/8*Math.PI)*.38,-1.15+i*.32],world);

// Rusty hand winch and a small working crane at the L-shaped corner.
const crane=new THREE.Group();crane.position.set(-7.9,2.45,12.1);world.add(crane);
cyl(.55,.7,.24,12,M.rust,[0,.12,0],crane,true);rod([0,.2,0],[0,3.8,0],.14,M.rust,crane);rod([0,3.35,0],[2.7,4.15,-1.4],.11,M.rust,crane);rod([0,2.0,0],[2.25,4.0,-1.18],.055,M.rust,crane);rod([2.7,4.15,-1.4],[2.7,1.0,-1.4],.025,M.dark,crane);ring(.15,.035,M.rust,[2.7,.86,-1.4],crane);const wg=ring(.48,.045,M.rust,[.35,1.25,0],crane,[0,Math.PI/2,0]);for(let i=0;i<6;i++){const a=i/6*TAU;rod([.35,1.25,0],[.35,1.25+Math.cos(a)*.45,Math.sin(a)*.45],.025,M.rust,crane);}rod([.35,1.7,0],[.7,1.7,0],.055,M.dark,crane);cyl(.32,.32,.75,16,M.rust,[0,1.15,0],crane).rotation.z=Math.PI/2;for(let i=0;i<5;i++)ring(.33,.025,ropeMat,[-.25+i*.12,1.15,0],crane,[0,Math.PI/2,0]);

// Stacks of rain-wet crates, baskets and a long-handled landing net.
for(let l=0;l<3;l++)for(let k=0;k<2;k++)fishCrate(-5.9+k*1.18,2.43+l*.63,13.3,l===1&&k===0,world);
for(let l=0;l<4;l++)fishCrate(-11.55,2.43+l*.62,-10.65,l%2===0,world,.95);
for(let l=0;l<2;l++)for(let k=0;k<3;k++)fishCrate(-15.9+k*1.15,2.43+l*.63,9.1,k===2,world,.92);
rod([-10.55,2.7,3.35],[-10.1,5.4,2.95],.035,M.wood);ring(.48,.035,M.metal,[-10.08,5.58,2.91],world,[0,.25,0]);
cyl(.32,.25,.55,16,toon(0x779a9c),[-11.0,2.72,3.25],world,true);ring(.34,.025,M.metal,[-11,3.03,3.25],world,[Math.PI/2,0,0]);tube([[-11.28,2.9,3.25],[-11.42,3.35,3.25],[-11.0,3.5,3.25],[-10.7,2.9,3.25]],.022,M.metal,world,20);

// Numbered mooring buoys, gently riding the same harbor wave.
const buoys=[];
function buoy(x,z,num,col=0xe4894d){const g=new THREE.Group();g.position.set(x,.03,z);world.add(g);sph(.34,toon(col),[0,.08,0],g,[1,.8,1]);cyl(.19,.28,.42,12,M.white,[0,.38,0],g,true);rod([0,.56,0],[0,.94,0],.035,M.rust,g);ring(.09,.02,M.rust,[0,.99,0],g,[0,Math.PI/2,0]);sign([num],.28,.19,[0,.4,.225],[0,0,0],{color:'#5c6c65',font:90,weather:true},g);buoys.push({g,x,z,phase:rnd(0,TAU)});}
buoy(12.7,2.0,'07');buoy(7.7,-3.3,'12',0xd8b956);buoy(1.9,-9.5,'03');buoy(14.8,-6.3,'18',0xcc7356);

// Sloped slipway and an overturned wooden skiff, half pulled ashore.
const ramp=box(3.25,.24,9.0,M.concrete,[8,1.21,11.5],world,true);ramp.rotation.x=-Math.atan(.27);
for(const x of[6.43,9.57]){const rail=box(.14,.28,9.0,M.concrete2,[x,1.36,11.5],world,true);rail.rotation.x=-Math.atan(.27);}
for(let i=0;i<12;i++){const z=7.3+i*.69,y=(z-7)*.27+.12;const sl=box(3.0,.025,.055,toon(0x91a6a0),[8,y,z]);sl.rotation.x=-Math.atan(.27);}
const skiff=new THREE.Group();skiff.position.set(8,3.15,13.2);skiff.rotation.set(0,.08,Math.PI);skiff.scale.setScalar(.65);world.add(skiff);hullBand(4.8,1.0,.6,-.55,1,.32,M.wood,skiff);hullBand(4.8,1.0,.62,.48,1,.97,toon(0xb08a62),skiff);for(let z=-1.5;z<2;z+=.45)rod([-.85,.63,z],[.85,.63,z],.035,toon(0x765b49),skiff);rod([0,-.56,-2.3],[0,-.56,2.3],.06,toon(0x6e5948),skiff);

// Faded harbor sign and a smaller warning at the steps.
for(const x of[-5.7,-3.5])rod([x,2.4,16.5],[x,4.7,16.5],.065,M.rust);
sign(['汐 凪 港','注 意 落 水'],2.9,1.25,[-4.6,4.12,16.48],[0,0,-.025],{bg:'#d7dbc4',color:'#4e7476',font:60,weather:true,border:'#81988c'});
sign(['足元注意','落水危険'],1.05,.7,[5.0,3.1,10.6],[0,.2,0],{bg:'#e3d166',color:'#4d5d55',font:54,weather:true,border:'#59675e'});rod([5,2.4,10.65],[5,3.5,10.65],.035,M.rust);

// Wind sock and little flags; their delay is driven by the gust front.
rod([15.7,.0,9.0],[15.7,6.8,9.0],.055,M.metal);const sock=new THREE.Group();sock.position.set(15.7,6.65,9);world.add(sock);rod([0,0,0],[.35,0,0],.035,M.metal,sock);
for(let i=0;i<6;i++){const o=cyl(.22-i*.025,.25-i*.025,.42,12,i%2?M.white:M.orange,[.45+i*.38,0,0],sock);o.rotation.z=Math.PI/2;}
const flagData=[];
function flag(x,y,z,col=0xe8c75c){rod([x,y-2,z],[x,y+.35,z],.03,M.metal);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1.0,-.12,0,0,-.58,0],3));g.setIndex([0,1,2]);g.computeVertexNormals();const o=mesh(g,new THREE.MeshToonMaterial({color:col,gradientMap:gradient,side:THREE.DoubleSide}),[x,y,z]);flagData.push({o,phase:rnd(0,TAU),z});}
flag(-4.1,5.0,-16.2,0xe4c75c);flag(-9.8,5.7,9.2,0xe2875d);flag(9.5,5.1,15.6,0xf0d374);

// Two silver instrument hard cases: one rectangular, one shaped around a guitar neck.
function instrumentCase(x,z,angle=0,contoured=false){const g=new THREE.Group();g.position.set(x,2.7,z);g.rotation.y=angle;world.add(g);const silver=std(0xcbd4d2,{roughness:.3,metalness:.18});
 if(contoured){const s=new THREE.Shape();s.moveTo(-1.15,-.3);s.quadraticCurveTo(-1.18,-.48,-.88,-.49);s.lineTo(-.55,-.47);s.quadraticCurveTo(-.22,-.44,-.04,-.28);s.lineTo(.22,-.21);s.lineTo(1.08,-.2);s.lineTo(1.28,-.28);s.lineTo(1.4,-.2);s.lineTo(1.4,.2);s.lineTo(1.28,.28);s.lineTo(1.08,.2);s.lineTo(.22,.21);s.lineTo(-.04,.28);s.quadraticCurveTo(-.22,.44,-.55,.47);s.lineTo(-.88,.49);s.quadraticCurveTo(-1.18,.48,-1.15,.3);s.closePath();const geo=new THREE.ExtrudeGeometry(s,{depth:.34,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.045,bevelThickness:.045});const o=mesh(geo,silver,[0,.18,0],g);o.rotation.x=Math.PI/2;addEdges(o,24);}else{box(2.05,.46,.78,silver,[0,0,0],g,true);box(2.07,.04,.8,M.dark,[0,-.02,0],g);box(2.06,.14,.79,silver,[0,.1,0],g,true);}
 for(const xx of[-.93,.93])for(const zz of[-.31,.31])sph(.1,silver,[xx,.19,zz],g,[1,.45,1]);for(const xx of[-.58,.58])box(.14,.17,.05,M.dark,[xx,-.02,.47],g,true);tube([[-.33,.03,.5],[-.28,-.16,.62],[.28,-.16,.62],[.33,.03,.5]],.032,M.dark,g,18);sign(['MUSIC'],.52,.16,[contoured?-.55:0,.255,0],[-Math.PI/2,0,0],{color:'#526e70',font:56},g);return g;}
instrumentCase(-2.0,14.45,.06);instrumentCase(.55,14.12,-.1,true);
puddle(-.8,12.8,2.15,.75);puddle(4.8,14.7,1.25,.65);puddle(-6.7,16.1,.8,.45);

// Transparent umbrella, complete ribs, hooked shaft and beads along the rim.
const umbrella=new THREE.Group();umbrella.position.set(4.75,3.62,11.55);umbrella.rotation.z=-.19;umbrella.rotation.x=.1;world.add(umbrella);
const umbrellaMat=new THREE.MeshPhysicalMaterial({color:0xe5f5ec,transparent:true,opacity:.28,roughness:.04,metalness:.05,depthWrite:false,side:THREE.DoubleSide});
const canopy=mesh(new THREE.SphereGeometry(1.04,24,10,0,TAU,0,Math.PI/2),umbrellaMat,[0,0,0],umbrella);canopy.scale.y=.43;canopy.castShadow=false;
ring(1.04,.018,toon(0xa9c7c2),[0,0,0],umbrella,[Math.PI/2,0,0]);
for(let i=0;i<8;i++){const a=i/8*TAU;const xx=Math.cos(a)*1.04,zz=Math.sin(a)*1.04;tube([[0,.45,0],[xx*.52,.34,zz*.52],[xx,0,zz]],.012,M.metal,umbrella,16);const bead=sph(.027,new THREE.MeshBasicMaterial({color:0xffedb5,transparent:true,opacity:.8}),[xx,-.025,zz],umbrella);lampDrops.push({o:bead,top:-.025,phase:rnd(0,1),parent:umbrella});}
rod([0,.48,0],[0,-1.08,0],.025,M.metal,umbrella);tube([[0,-1.04,0],[0,-1.24,0],[.16,-1.32,0],[.26,-1.18,0]],.035,toon(0x73918e),umbrella,18);sph(.045,M.metal,[0,.5,0],umbrella);

// Underwater life and discarded harbor objects in the clear cut face.
const seaweeds=[];
function seaweed(x,y,z,s=1){const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(s);world.add(g);for(let i=0;i<5;i++){const xx=rnd(-.2,.2),zz=rnd(-.15,.15);tube([[xx,0,zz],[xx+rnd(-.18,.18),.4,zz],[xx+rnd(-.25,.25),.9,zz+.08],[xx+rnd(-.3,.3),1.35,zz]],.035,toon(i%2?0x467e65:0x659475),g,18);}seaweeds.push({g,phase:rnd(0,TAU),x,z});}
for(let i=0;i<18;i++)seaweed(rnd(14.8,17.5),-5.45,rnd(-15,7),rnd(.55,1.15));for(let i=0;i<8;i++)seaweed(-9.65,-3.8,rnd(-12,8),rnd(.6,1));
const oldTire=ring(.63,.19,std(0x334e4c,{roughness:1}),[16.8,-4.94,-2.7],world,[.35,.2,.4]);addEdges(oldTire,30);
for(let i=0;i<25;i++){const x=11.5+i*.22,z=-6.2+Math.sin(i*.35)*.4;ring(.13,.035,M.rust,[x,-5.36,z],world,[i%2?Math.PI/2:0,i%2?0:Math.PI/2,.2]);}
// An old half-buried anchor at the end of the chain.
rod([15.9,-5.3,-5.9],[16.8,-4.75,-5.8],.075,M.rust);rod([16.45,-5.02,-6.25],[16.45,-4.78,-5.36],.07,M.rust);ring(.15,.04,M.rust,[15.85,-5.28,-5.9],world,[0,Math.PI/2,0]);
const fishes=[];
function fish(i){const g=new THREE.Group();world.add(g);const col=[0xd7c783,0x9fc9bd,0x6fa5a4,0xc5d5bd][i%4];sph(.18,toon(col),[0,0,0],g,[1.8,.75,.6]);const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.Float32BufferAttribute([-.24,0,0,-.48,.17,0,-.48,-.17,0],3));tg.setIndex([0,1,2]);tg.computeVertexNormals();mesh(tg,new THREE.MeshToonMaterial({color:col,gradientMap:gradient,side:THREE.DoubleSide}),null,g);sph(.025,M.dark,[.2,.055,.085],g);const x=rnd(12.0,17.0),y=rnd(-4.7,-1.0),z=rnd(-14.5,6.5);fishes.push({g,x,y,z,phase:rnd(0,TAU),speed:rnd(.25,.55)});}
for(let i=0;i<28;i++)fish(i);
for(let i=0;i<12;i++){fish(40+i);const f=fishes[fishes.length-1];f.x=15.6+(i%4)*.32;f.y=-2.0-(i%3)*.28;f.z=-5.2+Math.floor(i/4)*.48;f.phase=i*.23;f.speed=.34+(i%3)*.018;f.g.scale.setScalar(.78+(i%3)*.08);}
const bubbles=[];for(let i=0;i<22;i++){const r=.025+(i%4)*.012,o=sph(r,new THREE.MeshBasicMaterial({color:0xd9f4e5,transparent:true,opacity:.38,depthWrite:false}),[15.4+(i%5)*.37,-4.8,-9+(i%7)*1.7],world);o.castShadow=false;bubbles.push({o,x:o.position.x,z:o.position.z,phase:i/22});}

// A harbor cat, sheltered under the skiff, with a different little walk each outing.
const cat=new THREE.Group();world.add(cat);const catBody=new THREE.Group();cat.add(catBody);const catFur=toon(0xd9b27b),catCream=toon(0xeee0bd);
sph(.34,catFur,[0,.38,0],catBody,[1.4,.78,.72]);sph(.19,catCream,[.28,.32,0],catBody,[1.15,.7,.72]);
const catHead=new THREE.Group();catHead.position.set(.43,.57,0);catBody.add(catHead);sph(.25,catFur,[0,0,0],catHead,[1,.9,.85]);for(const z of[-.15,.15]){const ear=cyl(0,.105,.25,4,catFur,[-.03,.24,z],catHead,true);ear.rotation.z=-.12;sph(.025,M.dark,[.205,.035,z*.55],catHead);}sph(.035,toon(0xb77d6e),[.24,-.045,0],catHead);sph(.12,catCream,[.16,-.09,0],catHead,[.8,.7,1]);
for(const x of[-.23,.25])for(const z of[-.15,.15]){rod([x,.3,z],[x,.05,z],.055,catCream,catBody);sph(.07,catCream,[x+.05,.045,z],catBody,[1.25,.5,1]);}
tube([[-.38,.4,0],[-.65,.55,.08],[-.72,.85,.18],[-.55,.98,.23]],.055,catFur,catBody,22);
for(let i=0;i<3;i++){const stripe=box(.055,.03,.32,toon(0xa77e56),[-.18+i*.16,.64,0],catBody);stripe.rotation.z=-.2;}
const catPath=new THREE.CatmullRomCurve3([new THREE.Vector3(8,2.48,13.25),new THREE.Vector3(6.4,2.48,15.2),new THREE.Vector3(3.6,2.48,15.5),new THREE.Vector3(2.3,2.48,13.8),new THREE.Vector3(5.4,2.48,12.2),new THREE.Vector3(8,2.48,13.25)]);

// Gulls have articulated wings and alternating perched / gliding phases.
const gulls=[];
function gull(i){const g=new THREE.Group();world.add(g);sph(.19,M.white,[0,0,0],g,[1.55,.8,.75]);sph(.13,M.white,[.23,.1,0],g);const beak=cyl(0,.045,.18,6,M.yellow,[.39,.08,0],g);beak.rotation.z=-Math.PI/2;sph(.018,M.dark,[.28,.145,.105],g);const wings=[];for(const side of[-1,1]){const pivot=new THREE.Group();pivot.position.set(0,.06,side*.08);g.add(pivot);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([.1,0,0,-.15,.02,side*.65,-.42,0,side*.95,.12,0,side*.35],3));geo.setIndex(side>0?[0,1,3,1,2,3]:[0,3,1,1,3,2]);geo.computeVertexNormals();mesh(geo,new THREE.MeshToonMaterial({color:0xf1f0df,gradientMap:gradient,side:THREE.DoubleSide}),null,pivot);const tip=sph(.09,M.dark,[-.36,.015,side*.8],pivot,[1.8,.25,1.2]);wings.push(pivot);}for(const side of[-1,1])rod([-.05,-.1,side*.07],[.03,-.28,side*.07],.015,M.orange,g);
 const perch=i===0?new THREE.Vector3(8.5,3.42,10.65):i===1?new THREE.Vector3(-.4,2.85,7.8):new THREE.Vector3(2+i*2,.35,-4-i);
 gulls.push({g,wings,perch,phase:i*1.77,radius:5+i*1.15,height:8+i*.65,index:i});}
for(let i=0;i<7;i++)gull(i);

// Fine sunlit rain is line geometry, not a screen overlay.
const rainCount=760,rainBase=new Float32Array(rainCount*3),rainPos=new Float32Array(rainCount*6),rainColors=new Float32Array(rainCount*6);
for(let i=0;i<rainCount;i++){rainBase[i*3]=rnd(-20,20);rainBase[i*3+1]=rnd(0,25);rainBase[i*3+2]=rnd(-20,20);const c=new THREE.Color(i%3?0xe7c77f:0xf6f1d8);for(let k=0;k<2;k++){rainColors[i*6+k*3]=c.r;rainColors[i*6+k*3+1]=c.g;rainColors[i*6+k*3+2]=c.b;}}
const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));rainGeo.setAttribute('color',new THREE.BufferAttribute(rainColors,3));
const rainMat=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.38,depthWrite:false,blending:THREE.NormalBlending,toneMapped:false});const rain=new THREE.LineSegments(rainGeo,rainMat);rain.frustumCulled=false;rain.renderOrder=8;scene.add(rain);
// Sparse warm shafts above the water, with rain visibly crossing them.
const skyShafts=[lightShaft([1,18,-8],[5,.1,-1],.7,3.2),lightShaft([10,17,-14],[12,.1,-7],.45,2.3)];skyShafts.forEach(o=>o.material.opacity=.025);
// Expanding rain rings on both the harbor and the pier puddles.
const ripples=[];
for(let i=0;i<42;i++){const onLand=i>=28;let x,z,y;if(onLand){x=rnd(-8,8);z=rnd(11,17);y=2.44;}else{x=rnd(-8.8,17);z=rnd(-16.8,8.8);y=.095;}const m=new THREE.MeshBasicMaterial({color:onLand?0xe8f4df:0xe2f7e8,transparent:true,opacity:.3,depthWrite:false,side:THREE.DoubleSide});const o=mesh(new THREE.RingGeometry(.87,1,28),m,[x,y,z]);o.rotation.x=-Math.PI/2;o.castShadow=false;o.renderOrder=7;ripples.push({o,phase:rnd(0,1),speed:rnd(.35,.8),max:onLand?.24:.48});}
const gustRipples=[];for(let i=0;i<26;i++){const m=new THREE.MeshBasicMaterial({color:i%3?0xd8eee0:0x74b7b4,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});const o=mesh(new THREE.PlaneGeometry(.65+(i%4)*.19,.035),m,[0,.11,0]);o.rotation.x=-Math.PI/2;o.castShadow=false;o.renderOrder=7;o.visible=false;gustRipples.push({o,x:-8+(i%13)*2,off:(Math.floor(i/13)-.5)*2.2+Math.sin(i*2.1)*.5});}
// Thin clouds remain high-key and never turn the scene into a storm.
const clouds=[];const cloudMat=new THREE.MeshBasicMaterial({color:0xf5faf0,transparent:true,opacity:.42,depthWrite:false});
for(let i=0;i<4;i++){const g=new THREE.Group();g.position.set(-14+i*9,16+i%2*2,-12+i*3);scene.add(g);for(let j=0;j<5;j++)sph(rnd(1.5,2.5),cloudMat,[j*1.5,rnd(-.3,.3),rnd(-.7,.7)],g,[1.8,.25,1]);clouds.push({g,x:g.position.x,z:g.position.z,phase:i});}
const rainbow=new THREE.Group();world.add(rainbow);const rainbowMats=[];[0xe7a28a,0xe7cd85,0x9fc9a4,0x8db9cf].forEach((col,i)=>{const pts=[];for(let j=0;j<=70;j++){const a=j/70*Math.PI;pts.push([4+Math.cos(a)*(11.5-i*.13),1.2+Math.sin(a)*(11.5-i*.13),-16.7]);}const m=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,depthWrite:false});tube(pts,.055,m,rainbow,90);rainbowMats.push(m);});

// Small close-range workmanship: ground coils, worn berth paint and abstract puddle reflections.
function groundCoil(x,z,r=.55){const pts=[];for(let i=0;i<95;i++){const a=i/94*TAU*4.4,rr=.12+(r-.12)*i/94;pts.push([x+Math.cos(a)*rr,2.48,z+Math.sin(a)*rr]);}tube(pts,.027,ropeMat,world,100);tube([[x+r,2.48,z],[x+r+.35,2.47,z+.18],[x+r+.65,2.46,z+.1]],.028,wetRope,world,18);}
groundCoil(-4.1,11.9,.55);groundCoil(6.1,16.3,.48);groundCoil(-12.0,-11.6,.45);
[-5.7,0,5.7].forEach((x,i)=>sign(['0'+(i+1)],1.05,.52,[x,2.425,11.15],[-Math.PI/2,0,0],{color:'#ece7c9',font:112,weather:true}));
const crackMat=new THREE.MeshBasicMaterial({color:0x66827d,transparent:true,opacity:.28,depthWrite:false});
for(let i=0;i<13;i++){const x=rnd(-8,8),z=rnd(12,17);tube([[x,2.427,z],[x+.22,2.428,z+.13],[x+.41,2.427,z+.04],[x+.66,2.427,z+.25]],.009,crackMat,world,10);}
box(1.18,.12,.78,toon(0x668f9d),[-5.9,4.4,13.3],world,true);for(let i=0;i<4;i++)box(1.16,.025,.025,toon(0x9bb6b8),[-5.9,4.47,13.05+i*.15]);
const reflectedGulls=[];
function reflectedGull(x,z,scale=1){const g=new THREE.Group();g.position.set(x,2.44,z);g.scale.setScalar(scale);world.add(g);const m=new THREE.MeshBasicMaterial({color:0xf4f5df,transparent:true,opacity:.38,depthWrite:false,side:THREE.DoubleSide});for(const side of[-1,1]){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-.35,0,side*.18,-.65,0,side*.36,-.18,0,side*.06],3));geo.setIndex([0,1,3,1,2,3]);geo.computeVertexNormals();mesh(geo,m,null,g);}reflectedGulls.push(g);}
reflectedGull(-1.3,12.65,.6);reflectedGull(4.65,14.6,.4);
const puddleInk=new THREE.MeshBasicMaterial({color:0x629a9b,transparent:true,opacity:.22,depthWrite:false});const puddleWhite=new THREE.MeshBasicMaterial({color:0xf2f0db,transparent:true,opacity:.33,depthWrite:false});
for(let i=0;i<6;i++){const o=mesh(new THREE.PlaneGeometry(.55+i%2*.35,.08),i%3?puddleWhite:puddleInk,[-1.6+i*.32,2.432,12.75+i*.07]);o.rotation.x=-Math.PI/2;o.rotation.z=.12;}
for(let i=0;i<3;i++){const o=mesh(new THREE.PlaneGeometry(.045,.65+i*.18),puddleInk,[4.5+i*.19,2.432,14.55]);o.rotation.x=-Math.PI/2;}
boats.forEach((b,bi)=>{for(let i=0;i<7;i++){const side=i%2?1:-1,z=-.65+(i%4)*.55;const d=sph(.022,new THREE.MeshBasicMaterial({color:0xffedb5,transparent:true,opacity:.8}),[side*.94,2.42,z],b.g);lampDrops.push({o:d,top:2.42,phase:(i*.13+bi*.17)%1,parent:b.g});}});

// Deterministic environmental functions shared by live viewing and frame export.
function gustAt(t,z){const q=(t%30)-10;if(q<0||q>8)return 0;const front=-21+q*6.2;return Math.exp(-Math.pow((z-front)/4.5,2))*Math.sin(q/8*Math.PI);}
function journeyState(t){const q=t%72;if(q<42||q>=68)return {moving:false,p:0};return {moving:true,p:smooth((q-42)/26)};}
let exporting=false,viewerClose=false,sceneTime=0;
function updateEnvironment(t,forTour=false){
 sceneTime=t;viewerClose=viewSize<19;
 const rainLevel=.54+.18*Math.sin(t*.18-1.0),gustGlobal=gustAt(t,-2)+gustAt(t,8)*.5,gustQ=(t%30)-10,gustFront=-21+gustQ*6.2,gustEnvelope=gustQ>=0&&gustQ<=8?Math.sin(gustQ/8*Math.PI):0;
 gustRipples.forEach((r,i)=>{r.o.position.set(r.x+Math.sin(t*.7+i)*.16,.11,gustFront+r.off);r.o.visible=gustEnvelope>.02&&r.o.position.z<10.2;r.o.material.opacity=gustEnvelope*(.1+(i%3)*.045);r.o.scale.x=1+gustEnvelope*.45;});
 const rainPosAttr=rainGeo.attributes.position;const active=Math.floor(rainCount*(.58+rainLevel*.42));rainGeo.setDrawRange(0,active*2);
 for(let i=0;i<rainCount;i++){const off=rainBase[i*3+1];const y=23-((off+t*(5.5+rainLevel*2))%26);const drift=(23-y)*(.12+gustGlobal*.08);const x=rainBase[i*3]+drift;const z=rainBase[i*3+2]+drift*.16;const k=i*6;rainPos[k]=x;rainPos[k+1]=y;rainPos[k+2]=z;rainPos[k+3]=x+.18+gustGlobal*.18;rainPos[k+4]=y-.36-rainLevel*.14;rainPos[k+5]=z+.035;}
 rainPosAttr.needsUpdate=true;rainMat.opacity=.25+rainLevel*.2;
 waterUniforms.uTime.value=t;const cloudQ=t%75;const rareDark=cloudQ>62&&cloudQ<66?Math.sin((cloudQ-62)/4*Math.PI):0;const sunFactor=.94+.06*Math.sin(t*.075)-rareDark*.28;
 waterUniforms.uSun.value=sunFactor;sun.intensity=.64*sunFactor;hemi.intensity=.38+.05*sunFactor;renderer.toneMappingExposure=.84+.04*sunFactor;
 reflectionPatches.forEach(r=>{r.o.position.x=r.x+Math.sin(t*.42+r.phase)*.09;r.o.position.z=r.z+Math.sin(t*.32+r.phase)*.12;r.o.scale.x=1+Math.sin(t*.7+r.phase)*.2;r.o.material.opacity*=1;});
 foamBits.forEach(f=>{f.o.position.y=f.baseY+Math.sin(t*1.1+f.phase)*.07;f.o.scale.x=1.4+Math.sin(t*.8+f.phase)*.6;f.o.material.opacity=.52+Math.sin(t*.9+f.phase)*.18;});
 seaweeds.forEach(s=>{s.g.rotation.z=Math.sin(t*.65+s.phase)*.08+gustAt(t,s.z)*.05;s.g.rotation.x=Math.sin(t*.48+s.phase)*.035;});
 windTrees.forEach(w=>{const g=gustAt(t,w.z);w.crown.rotation.z=Math.sin(t*.65+w.phase)*.018+g*.11;w.crown.rotation.x=Math.sin(t*.53+w.phase)*.012+g*.04;});
 const netGust=gustAt(t,.25),netAttr=netGeo.attributes.position;netGroup.rotation.z=Math.sin(t*.7)*.012+netGust*.075;netLines.position.x=Math.sin(t*1.1)*.025+netGust*.16;for(let i=0;i<netAttr.count;i++){const j=i*3,w=(3.1-netVerts[j+1])/3.1;netAttr.array[j]=netVerts[j]+Math.sin(t*2.1+netVerts[j+1]*1.8+netVerts[j+2]*2.3)*(.025+netGust*.16)*w;}netAttr.needsUpdate=true;
 flagData.forEach(f=>{const g=gustAt(t,f.z);f.o.rotation.y=Math.sin(t*2+f.phase)*(.12+g*.35);f.o.rotation.z=-.08-g*.22+Math.sin(t*1.3+f.phase)*.025;});
 sock.rotation.y=-.3+Math.sin(t*.45)*.12;sock.rotation.z=-.16-gustAt(t,9)*.18+Math.sin(t*.9)*.025;
 caustics.forEach(c=>{c.o.material.opacity=(.13+.13*Math.sin(t*.65+c.phase))*sunFactor;c.o.position.x=Math.sin(t*.3+c.phase)*.05;});
 lightBeams.forEach(s=>{if(s!==beacon&&!skyShafts.includes(s))s.material.opacity=s.userData.baseOpacity*sunFactor;});skyShafts.forEach((s,i)=>s.material.opacity=(.003+.002*Math.sin(t*.12+i))*sunFactor);
 clouds.forEach(c=>{c.g.position.x=((c.x+t*.11+24)%48)-24;c.g.position.z=c.z+Math.sin(t*.03+c.phase)*.35;});
 const rainbowAlpha=smooth((.48-rainLevel)/.15)*.22;rainbowMats.forEach(m=>m.opacity=rainbowAlpha);
 lampMat.opacity=.45+rareDark*.55;lampLight.intensity=rareDark*2.8;beacon.material.opacity=rareDark*.1;beacon.rotation.y=t*.5;
 ripples.forEach(r=>{const a=(t*r.speed+r.phase)%1;r.o.scale.setScalar(.025+a*r.max);r.o.material.opacity=(1-a)*(.16+rainLevel*.3);});
 lampDrops.forEach(d=>{const a=(t*.38+d.phase)%1;d.o.position.y=d.top-a*a*1.05;d.o.visible=a>.62;d.o.scale.setScalar(.6+a*.55);});
 buoys.forEach(b=>{b.g.position.y=.03+Math.sin(t*.85+b.phase)*.075;b.g.rotation.z=Math.sin(t*.63+b.phase)*.065+gustAt(t,b.z)*.08;});
 // Cat excursions have pauses and a changing route; it always returns before heavier rain.
 const cq=t%35,trip=Math.floor(t/35);let catP=0,catMoving=false;if(cq>18&&cq<32){catP=smooth((cq-18)/14);catMoving=true;}else if(cq>=32){catP=1;}catPath.getPoint(catP%1,cat.position);if(catMoving){cat.position.x+=Math.sin(trip*2.17+catP*TAU)*.28*Math.sin(catP*Math.PI);cat.position.z+=Math.cos(trip*1.71+catP*TAU)*.42*Math.sin(catP*Math.PI);}
 if(forTour&&t>=23&&t<27){cat.position.set(8,2.48,13.25);catMoving=false;}
 if(catMoving){const tangent=catPath.getTangent(catP%1);cat.rotation.y=Math.atan2(-tangent.z,tangent.x);catBody.position.y=Math.abs(Math.sin(t*7))*.035;}else{cat.rotation.y=.2;catBody.position.y=0;}
 const nearCat=viewerClose&&camera.position.distanceTo(cat.position)<35;catHead.rotation.y=nearCat||(forTour&&t>=23&&t<27)?clamp(Math.atan2(camera.position.z-cat.position.z,camera.position.x-cat.position.x)-cat.rotation.y,-1.0,1.0):0;catHead.rotation.z=nearCat?-.12:0;
 // Gulls glide on separate ellipses. The bollard bird startles in its close-up.
 gulls.forEach(b=>{const i=b.index;let fly=i>=2;let blend=1;if(i===2){const q=(t+5)%32;fly=q<22;if(viewerClose)fly=true;}if(i<2){const q=(t+i*8)%34;fly=q>17;if(viewerClose)fly=true;if(forTour&&i===0)fly=t>=17;blend=fly?smooth((q-17)/2):smooth((34-q)/2);}const a=t*(.12+i*.012)+b.phase;const flight=new THREE.Vector3(Math.cos(a)*b.radius, b.height+Math.sin(a*.7)*1.3,Math.sin(a)*b.radius-1);if(fly){b.g.position.copy(flight);if(i<2&&blend<1)b.g.position.lerpVectors(b.perch,flight,blend);b.g.rotation.y=-a;b.wings[0].rotation.x=Math.sin(t*5.5+b.phase)*.45;b.wings[1].rotation.x=-Math.sin(t*5.5+b.phase)*.45;}else{b.g.position.copy(b.perch);if(i===2)b.g.position.y+=Math.sin(t*.85)*.05;b.g.rotation.y=.3+i;b.wings[0].rotation.x=1.1;b.wings[1].rotation.x=-1.1;}b.g.rotation.z=fly?Math.sin(a*.8)*.14:0;});
 // Fish scatter from a close camera and gradually regroup.
 fishes.forEach(f=>{const a=t*f.speed+f.phase;const scatter=viewerClose?1:0;f.g.position.set(f.x+Math.sin(a)*1.15+scatter*Math.sin(f.phase)*1.6,f.y+Math.sin(a*1.7)*.18,f.z+Math.cos(a)*.65+scatter*Math.cos(f.phase)*1.4);f.g.rotation.y=Math.atan2(Math.cos(a),-Math.sin(a));});
 bubbles.forEach(b=>{const a=(t*.13+b.phase)%1;b.o.position.set(b.x+Math.sin(t*.7+b.phase*TAU)*.08,-5.1+a*4.85,b.z);b.o.material.opacity=Math.sin(a*Math.PI)*.42;});
}
function updateBoats(t){
 const js=journeyState(t),outerPos=js.moving?journeyCurve.getPoint(js.p):new THREE.Vector3(5.7,0,7.72);
 boats.forEach((b,i)=>{let extra=0;if(b.outer&&js.moving){const tan=journeyCurve.getTangent(js.p);b.g.position.copy(outerPos);b.g.position.y=Math.sin(t*.85)*.035;b.g.rotation.y=Math.atan2(-tan.x,-tan.z);b.g.rotation.z=Math.sin(t*.9)*.018;b.g.rotation.x=Math.sin(t*.7)*.008;b.ropes.forEach(r=>r.visible=false);}else{b.g.position.x=b.x;b.g.position.z=b.z;b.g.rotation.y=b.rot;const wakeNear=js.moving?Math.max(0,1-outerPos.distanceTo(new THREE.Vector3(b.x,0,b.z))/5):0;extra=wakeNear*.08;b.g.position.y=Math.sin(t*.72+b.phase)*(.045+extra);b.g.rotation.z=Math.sin(t*.63+b.phase)*(.012+extra*.3);b.g.rotation.x=Math.sin(t*.55+b.phase)*.009;b.ropes.forEach(r=>r.visible=true);}b.g.updateMatrixWorld(true);b.reflection.g.position.set(b.g.position.x,0,b.g.position.z);b.reflection.g.rotation.y=b.g.rotation.y;b.reflection.shards.forEach((s,k)=>{s.scale.x=1+Math.sin(t*.62+k+b.phase)*.22;s.scale.y=1+Math.sin(t*.48+k)*.12;s.material.opacity=.27+.12*Math.sin(t*.55+k+b.phase);});});
 reflectionPatches.forEach((r,i)=>{if(i>=14&&i<21)r.o.visible=!js.moving;});
 mooringLines.forEach(m=>{if(!m.g.visible)return;const e=m.local.clone().applyMatrix4(m.boat.g.matrixWorld),mid=m.start.clone().lerp(e,.5);mid.y-=.22+.13*Math.sin(t*.72+m.phase);const curve=new THREE.CatmullRomCurve3([m.start,m.start.clone().add(new THREE.Vector3(0,.09,0)),mid,e]);m.main.geometry.dispose();m.main.geometry=new THREE.TubeGeometry(curve,30,.04,6,false);const wetCurve=new THREE.CatmullRomCurve3([e.clone().add(new THREE.Vector3(0,-.15,0)),e.clone().add(new THREE.Vector3(.08,-.65,.08)),e.clone().add(new THREE.Vector3(.16,-1.3,.16))]);m.wet.geometry.dispose();m.wet.geometry=new THREE.TubeGeometry(wetCurve,12,.042,6,false);});
 buoys.forEach(b=>{const d=outerPos.distanceTo(new THREE.Vector3(b.x,0,b.z)),wake=js.moving?Math.max(0,1-d/4):0;b.g.position.y+=Math.sin(t*3.1-d)*wake*.12;b.g.rotation.x=Math.sin(t*2.7-d)*wake*.16;});
 foamBits.forEach(f=>{const d=outerPos.distanceTo(f.o.position),wake=js.moving?Math.max(0,1-d/5):0;f.o.position.y+=Math.abs(Math.sin(t*3.4+d))*wake*.16;});
 // The departing vessel leaves a broken white, posterized wake.
 wakeTiles.forEach((o,i)=>{if(js.moving&&js.p>.025&&js.p<.985){const p=clamp(js.p-(i+1)*.005,0,1);const pt=journeyCurve.getPoint(p),tan=journeyCurve.getTangent(p);o.visible=true;o.position.set(pt.x+Math.sin(i*2.3)*.25,.09,pt.z+Math.cos(i*1.7)*.18);o.rotation.z=Math.atan2(tan.x,tan.z);o.scale.set(1+i*.035,1+i*.018,1);o.material.opacity=(1-i/wakeTiles.length)*.58;}else o.visible=false;});
 const q=(t*.32)%34;distantBoat.g.position.set(17-q,.02,-15.0);distantBoat.g.rotation.y=Math.PI/2;distantBoat.g.rotation.z=Math.sin(t*.6)*.015;
}

// Mouse-only miniature inspection: orbit, pan and orthographic zoom, with no interface overlay.
function applyCamera(){const aspect=innerWidth/innerHeight;camera.left=-viewSize*aspect/2;camera.right=viewSize*aspect/2;camera.top=viewSize/2;camera.bottom=-viewSize/2;const cp=Math.cos(camPhi);camera.position.set(target.x+Math.sin(camTheta)*cp*camDist,target.y+Math.sin(camPhi)*camDist,target.z+Math.cos(camTheta)*cp*camDist);camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld();}
applyCamera();
let dragging=false,dragButton=0,lastX=0,lastY=0;
renderer.domElement.addEventListener('pointerdown',e=>{if(exporting)return;dragging=true;dragButton=e.button;lastX=e.clientX;lastY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{if(!dragging||exporting)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;if(dragButton===2||e.shiftKey){const scale=viewSize/innerHeight;const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);const up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);target.addScaledVector(right,-dx*scale);target.addScaledVector(up,dy*scale);target.x=clamp(target.x,-20,20);target.y=clamp(target.y,-6,12);target.z=clamp(target.z,-20,20);}else{camTheta-=dx*.005;camPhi=clamp(camPhi+dy*.004,-.12,1.35);}applyCamera();});
renderer.domElement.addEventListener('pointerup',()=>dragging=false);renderer.domElement.addEventListener('pointercancel',()=>dragging=false);
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('wheel',e=>{if(exporting)return;e.preventDefault();viewSize=clamp(viewSize*Math.exp(e.deltaY*.001),5.2,52);applyCamera();},{passive:false});
window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));applyCamera();renderer.render(scene,camera);});

// One-minute built-in camera film. Each shot has its own deliberate framing and movement.
const TOUR_SECONDS=60;
const shots=[
 {a:0,b:7,from:{t:[0,-1,0],th:.72,ph:.68,v:42.5},to:{t:[0,-.6,-1],th:.66,ph:.64,v:41.5}},
 {a:7,b:13,from:{t:[-5,2.1,6.8],th:.92,ph:.62,v:20},to:{t:[3.4,2.0,6.6],th:1.03,ph:.58,v:19}},
 {a:13,b:18,from:{t:[8.5,3.35,10.65],th:2.75,ph:.38,v:7.5},to:{t:[8.5,3.5,10.65],th:2.68,ph:.35,v:5.6}},
 {a:18,b:23,from:{t:[-.8,3.0,13.8],th:.75,ph:.55,v:13.5},to:{t:[3.2,3.15,12.2],th:.86,ph:.51,v:12.5}},
 {a:23,b:27,from:{t:[8,3.0,13.4],th:.9,ph:.39,v:8.5},to:{t:[7.7,3.1,13.25],th:.82,ph:.36,v:7.1}},
 {a:27,b:33,from:{t:[-9.7,4.0,.2],th:1.08,ph:.52,v:13.8},to:{t:[-10.1,4.1,.25],th:.98,ph:.48,v:12.5}},
 {a:33,b:39,from:{t:[5.88,1.7,7.65],th:2.10,ph:.25,v:6.2},to:{t:[5.88,1.62,7.6],th:2.25,ph:.20,v:4.8}},
 {a:39,b:44,from:{t:[-12.2,3.95,-6.2],th:1.12,ph:.25,v:11.0},to:{t:[-13.0,3.85,-6.0],th:1.06,ph:.18,v:8.8}},
 {a:44,b:49,from:{t:[-12.4,3.85,4.3],th:1.18,ph:.22,v:9.8},to:{t:[-12.4,3.8,6.9],th:1.24,ph:.2,v:9.0}},
 {a:49,b:53,from:{t:[16.1,-2.5,-1.7],th:1.52,ph:.12,v:13.8},to:{t:[15.7,-3.0,-4.3],th:1.58,ph:.1,v:12.7}},
 {a:53,b:56,from:{t:[-5.7,4.5,-15.9],th:.73,ph:.46,v:14.5},to:{t:[-5.6,4.8,-16.0],th:.66,ph:.43,v:12.8}},
 {a:56,b:60,from:{t:[8,1.4,-1.5],th:.72,ph:.76,v:22},to:{t:[2.5,1.6,-5],th:.58,ph:.83,v:26}}
];
function setTourCamera(t){const s=shots.find(q=>t>=q.a&&t<q.b)||shots[shots.length-1];const u=smooth((t-s.a)/(s.b-s.a));target.set(lerp(s.from.t[0],s.to.t[0],u),lerp(s.from.t[1],s.to.t[1],u),lerp(s.from.t[2],s.to.t[2],u));if(s.a===56){const js=journeyState(t),p=journeyCurve.getPoint(js.p);target.x=lerp(target.x,p.x,.65);target.z=lerp(target.z,p.z,.65);}camTheta=lerp(s.from.th,s.to.th,u);camPhi=lerp(s.from.ph,s.to.ph,u);viewSize=lerp(s.from.v,s.to.v,u);applyCamera();}
function updateAll(t,tour=false){if(tour)setTourCamera(t);updateEnvironment(t,tour);updateBoats(t);if(tour&&t>=56)setTourCamera(t);scene.updateMatrixWorld();}
let tourFps=60,savedView=null,lastNow=performance.now(),liveTime=0;
window.videoExport={
 runs:['tour'],
 begin:async(runId,opts={})=>{if(runId!=='tour')throw new Error('Unknown run: '+runId);tourFps=opts.fps||60;savedView={theta:camTheta,phi:camPhi,dist:camDist,size:viewSize,target:target.clone()};exporting=true;dragging=false;updateAll(0,true);renderer.render(scene,camera);return {frames:Math.round(TOUR_SECONDS*tourFps)};},
 frame:async i=>{if(!exporting)throw new Error('videoExport.begin must be called first');const t=i/tourFps;updateAll(clamp(t,0,TOUR_SECONDS),true);renderer.render(scene,camera);await new Promise(resolve=>requestAnimationFrame(resolve));},
 end:()=>{exporting=false;if(savedView){camTheta=savedView.theta;camPhi=savedView.phi;camDist=savedView.dist;viewSize=savedView.size;target.copy(savedView.target);applyCamera();}lastNow=performance.now();renderer.render(scene,camera);}
};
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-lastNow)/1000,.05);lastNow=now;if(exporting)return;liveTime+=dt;updateAll(liveTime,false);renderer.render(scene,camera);}
updateAll(0,false);renderer.render(scene,camera);requestAnimationFrame(animate);
})();
