'use strict';
function lamp(x,z,rot){
 const g=group(x,SHORE,z);g.rotation.y=rot;
 cyl(0,.078,0,.179,.202,.147,'#57746d',g);
 cyl(0,.257,0,.098,.135,.287,'#5e7d76',g);
 cyl(0,1.72,0,.043,.059,3.36,'#587573',g);
 path([[0,3.28,0],[.024,3.48,0],[.232,3.653,0],[.532,3.633,0],[.645,3.509,0]],.037,'#607f7b',g,true);
 cyl(.645,3.483,0,.119,.128,.112,'#73918a',g);
 tor(.645,3.411,0,.227,.034,'#597d77',g).rotation.x=PI/2;
 const l=new T.MeshStandardMaterial({color:'#f5e0a4',emissive:'#f2c881',emissiveIntensity:.27,roughness:.3});
 cyl(.645,3.43,0,.167,.176,.056,l,g,24);
 tor(.645,3.386,0,.169,.012,'#bcc8aa',g,false).rotation.x=PI/2;
 for(let i=0;i<4;i++){
  const a=i*PI/2+.38,x=.645+Math.cos(a)*.198,z=Math.sin(a)*.198;
  beam([.645+(x-.645)*.60,3.475,.6*z],[x,3.412,z],.016,'#66837a',g,6);
 }
 lamps.push(g);
 beads.push({p:g,x:.85,y:3.389,z:.03,phase:rr(0,8)});
 return g;
}
const lamp1=lamp(-5.84,6.47,-.15),lamp2=lamp(-5.86,-4.64,-.28),lamp3=lamp(3.82,-8.01,-1.0);
path([[-5.86,4.51,-4.64],[-5.95,4.24,-1],[-5.84,4.4,6.47]],.016,'#55736f');
path([[-5.86,4.5,-4.64],[-1.6,4.14,-6.37],[3.82,4.50,-8.01]],.018,'#55736f');
path([[-5.86,4.47,-4.64],[-8.0,4.47,-5.49],[-11.38,5.02,-5.96]],.014,'#68807b');
for(const [x,z] of [[-5.84,6.47],[-5.86,-4.64],[3.82,-8.01]]){
 beam([x,4.41,z],[x,4.69,z],.019,'#547068');
 beam([x-.14,4.527,z],[x+.15,4.527,z],.021,'#547068');
 for(const xx of [-.09,.082])cyl(x+xx,4.575,z,.038,.04,.076,'#aec1b1');
}
stack(stage,-6.81,SHORE,-4.19,5,'#d7e6dd');
stack(stage,-6.05,SHORE,-4.51,3,'#74a7b5');
stack(stage,-6.59,SHORE,-3.41,2,'#e5e9d8');
stack(stage,-8.17,SHORE,-6.55,3,'#7ca2ac');
stack(stage,-7.41,SHORE,-6.44,4,'#dce4d3');
stack(stage,1.52,SHORE,-9.18,2,'#7ba7ad');
stack(stage,2.23,SHORE,-9.16,4,'#dce3d1');
stack(stage,-5.42,SHORE,11.40,2,'#789eaa');
stack(stage,-4.61,SHORE,11.64,1,'#d3e3d2');
const netFloats=[];
function netRack(x,z,rot){
 const g=group(x,SHORE,z);g.rotation.y=rot;
 for(const a of [-1,1]){
   cyl(a*1.26,1.08,0,.047,.062,2.16,'#667c75',g,9);
   beam([a*1.25,.05,-.47],[a*1.25,.87,0],.035,'#718578',g,7);
   box(a*1.25,.042,0,.27,.088,.23,'#8d8c74',g);
 }
 beam([-1.32,2.12,0],[1.32,2.12,0],.038,'#758b7f',g);
 const a=[],ids=[],n=49,k=25;
 for(let i=0;i<n;i++)for(let j=0;j<k;j++){
   const u=i/(n-1),v=j/(k-1),x=(u-.5)*2.43;
   a.push(x,2.085-v*(1.27+.38*Math.sin(u*PI))+Math.sin(u*4*PI)*v*.096,Math.sin(u*31)*v*.09+v*.19);
   const q=i*k+j;
   if(i)ids.push(q-k,q);if(j)ids.push(q-1,q);
   if(i&&j&&(i+j)%2===0)ids.push(q-k-1,q);
 }
 const geom=new T.BufferGeometry();
 geom.setAttribute('position',new T.Float32BufferAttribute(a,3));geom.setIndex(ids);
 const l=new T.LineSegments(geom,new T.LineBasicMaterial({color:'#74876d',transparent:true,opacity:.74}));g.add(l);
 cloth.push({o:l,original:geom.attributes.position.array.slice(),w:2.43,phase:2.3,net:true});
 const floats=group(0,1.98,.21,g);
 netFloats.push(floats);
 const pts=[];
 for(let i=0;i<=17;i++){const x=-1.28+i*.15,y=1.979-.73*Math.sin(i/17*PI)**.83;pts.push([x,y-1.98,0]);if(i>1&&i<17)ball(x,y-1.98,.002,.074,.048,.065,i%4===0?'#d5d5af':i%2?'#b68154':'#c69d65',floats)}
 path(pts,.024,'#927954',floats);
 return g;
}
netRack(-1.34,-9.08,.08);
netRack(-12.18,2.36,PI/2).scale.setScalar(.65);
const winchSteel=oxidizedIron('#8f7b60'),rustHoist=oxidizedIron('#a08b64');
function winch(x,z,rotation){
 const g=group(x,SHORE,z);g.rotation.y=rotation;
 box(0,.085,0,.842,.17,.72,'#828d7c',g);
 for(const s of [-1,1]){
   edge(box(s*.294,.311,0,.118,.443,.36,winchSteel,g),'#726657',.29);
   for(const z of [-.105,.105])for(const y of [.174,.449]){
    const pin=cyl(s*.358,y,z,.029,.029,.025,'#b09472',g,6,false);pin.rotation.z=PI/2;
   }
   const c=cyl(s*.229,.412,0,.218,.217,.086,winchSteel,g,16);c.rotation.z=PI/2;
   tor(s*.273,.412,0,.171,.013,'#ac9978',g,false).rotation.y=PI/2;
 }
 const spool=cyl(0,.412,0,.147,.147,.469,'#656e5c',g);spool.rotation.z=PI/2;
 for(let i=0;i<9;i++)tor(-.198+i*.049,.412,0,.161,.020,i%3?'#a58660':'#8c7857',g).rotation.y=PI/2;
 tor(.39,.412,0,.239,.027,'#8d674d',g).rotation.y=PI/2;
 for(let i=0;i<4;i++){const a=i*PI/2;beam([.39,.412,0],[.39,.412+Math.sin(a)*.239,Math.cos(a)*.239],.016,'#806653',g,7)}
 beam([.39,.57,.17],[.54,.57,.17],.04,'#686b58',g,8);
 return g;
}
winch(-5.55,-1.96,.3);
const crane=group(5.38,.85,-10.26);crane.rotation.y=.22;
cyl(0,.111,0,.321,.353,.225,'#8c8c75',crane);
cyl(0,.85,0,.072,.105,1.63,rustHoist,crane,10);
for(let i=0;i<6;i++){const a=i*TAU/6;cyl(.242*Math.cos(a),.232,.242*Math.sin(a),.034,.038,.046,winchSteel,crane,6);}
beam([0,1.63,0],[1.42,1.82,0],.069,rustHoist,crane);
beam([0,.91,0],[.95,1.735,0],.041,rustHoist,crane);
beam([1.37,1.79,0],[1.37,.978,0],.011,'#767a66',crane,6);
for(const z of [-.067,.067])cyl(1.36,1.792,z,.071,.071,.029,'#7e8b77',crane,12).rotation.x=PI/2;
beam([1.36,1.79,-.093],[1.36,1.79,.09],.024,'#b0a183',crane,6);
path([[1.37,1.02,0],[1.355,.87,0],[1.438,.85,0],[1.48,.94,0]],.019,'#756c55',crane);

const vender=group(-7.29,SHORE,1.67);vender.rotation.y=PI/2-.06;
box(0,1.01,0,1.01,2.02,.65,'#b36755',vender);
box(0,1.06,.341,.90,1.8,.065,'#a65349',vender);
box(0,.44,.381,.628,.221,.035,'#536a67',vender);
box(.30,.96,.39,.196,.221,.046,'#6e8173',vender);
box(.30,.99,.42,.119,.039,.013,'#ddcf8d',vender);
const vendingArt=canvasMat(256,248,(c,w,h)=>{
 c.fillStyle='#e9e9c5';c.fillRect(0,0,w,h);
 c.fillStyle='#54908a';c.fillRect(0,0,w,42);
 linesText(c,'冷たい飲み物',128,22,26,'#ece5c1','center',true);
 for(let j=0;j<3;j++)for(let i=0;i<7;i++){
   const x=19+i*34,y=56+j*60;
   c.fillStyle=pick(['#b78257','#718e73','#8a9e93','#c49b58','#aa715d','#7c9da2']);
   c.fillRect(x,y+4,18,35);c.fillRect(x+3,y,12,8);
   c.fillStyle='#e9dabb';c.fillRect(x+2,y+15,14,9);c.fillStyle='#8e9d8a';c.fillRect(x-2,y+44,21,5);
 }
});
const drinks=new T.MeshStandardMaterial({color:'#e7dcc2',map:vendingArt.map,emissive:'#ecd49a',emissiveMap:vendingArt.map,emissiveIntensity:.55,roughness:.28});
plane(0,1.49,.387,.77,.71,drinks,vender);
const awningIron=oxidizedIron('#84928b');
box(0,2.074,.095,1.16,.066,.905,awningIron,vender).rotation.x=.115;
for(const x of [-.38,.24])beads.push({p:vender,x,y:2.016,z:.548,phase:2.89+x*2.7});
for(let i=0;i<8;i++)box(-.533+i*.154,2.095,.095,.029,.034,.91,pick(['#9a8c72','#ac9575','#8d7660']),vender,false).rotation.x=.115;
const bucketShell=new T.LatheGeometry([
 [0,.006],[.152,.006],[.166,.019],[.213,.293],[.228,.311],[.228,.326],[.203,.325],[.195,.305],[.145,.047],[0,.039]
].map(([r,h])=>new T.Vector2(r,h)),24);
const bucketWater=new T.MeshStandardMaterial({color:'#6e9f97',roughness:.25,envMap:harborSky.texture,envMapIntensity:.64});
function bucket(x,y,z,g=stage){
 mesh(bucketShell,mat('#829a94',.61,.07),x,y,z,g);
 cyl(x,y+.129,z,.161,.161,.006,bucketWater,g,24,false);
 tor(x,y+.317,z,.218,.011,'#bcc6af',g).rotation.x=PI/2;
 tor(x,y+.061,z,.171,.009,'#8da39b',g).rotation.x=PI/2;
 for(const s of [-1,1])ball(x+s*.209,y+.234,z,.024,.028,.017,'#84958b',g);
 path([[x-.205,y+.23,z],[x-.14,y+.451,z],[x,y+.512,z],[x+.14,y+.451,z],[x+.205,y+.23,z]],.013,'#89998b',g);
}
bucket(-7.05,SHORE,2.52);
const scoop=group(-7.31,SHORE,2.61);scoop.rotation.set(-.22,.68,-.16);
beam([0,.025,0],[0,1.42,0],.028,'#a68b62',scoop);
tor(0,1.615,0,.231,.018,'#778f81',scoop);
const scoopMesh=new T.BufferGeometry();
const scoopPoints=[],scoopLinks=[],rimCount=28,netRows=9;
for(let i=0;i<=netRows;i++)for(let j=0;j<rimCount;j++){
 const a=j/rimCount*TAU+(i%2)*PI/rimCount,t=i/netRows;
 const radius=.222*(1-.89*t**1.61);
 scoopPoints.push(Math.cos(a)*radius,1.615+Math.sin(a)*radius-t*t*.104,t*.285);
 const k=i*rimCount+j;
 if(i)scoopLinks.push(k,k-rimCount,k,(i-1)*rimCount+(j+(i%2?1:rimCount-1))%rimCount);
}
scoopMesh.setAttribute('position',new T.Float32BufferAttribute(scoopPoints,3));scoopMesh.setIndex(scoopLinks);
const scoopNet=new T.LineSegments(scoopMesh,new T.LineBasicMaterial({color:'#657e71',transparent:true,opacity:.66,depthWrite:false}));
scoop.add(scoopNet);
beam([0,1.31,0],[0,1.397,0],.039,'#849481',scoop,8);

function ramp(){
 const v=new T.BufferGeometry();v.setAttribute('position',new T.Float32BufferAttribute([-5.59,SHORE,10.53,-5.59,SHORE,12.95,-.651,SHORE,10.53,-.651,SHORE,12.95,1.52,.033,10.53,1.52,.033,12.95],3));
 v.setIndex([0,1,2,1,3,2,2,3,4,3,5,4]);v.computeVertexNormals();
 const m=mesh(v,'#aab3a9',0,0,0);
 for(let i=0;i<17;i++){const f=i/16;box(-.643+2.14*f,1.032-f*.994,11.735,.024,.013,2.37,'#879c8f',stage,false)}
 for(const zz of [10.54,12.944])beam([-.67,1.033,zz],[1.51,.039,zz],.038,'#87978d',stage,6);
}
ramp();
for(const z of [11.43,12.12]){
 const skid=group(-2.83,1.042,z);
 box(0,0,0,4.29,.017,.084,'#a0a18c',skid,false);
 box(0,.010,-.016,4.23,.010,.018,'#7f9084',skid,false);
 for(const x of [-1.88,-.98,0,.98,1.90]){
  cyl(x,.023,0,.016,.016,.013,'#a6af99',skid,6,false);
 }
}
const dinghy=group(-3.79,SHORE,12.33);dinghy.rotation.y=1.49;
const cradleWood=benchOak.clone();cradleWood.color.set('#dccfae');
for(const [z,w] of [[1.30,.99],[-.97,1.18]]){
 box(0,.157,z,w,.293,.24,cradleWood,dinghy);
 box(0,.025,z,w+.012,.046,.245,'#9a8b69',dinghy);
 for(const y of [.097,.229])cyl(0,y,z+.123,.016,.016,.012,'#847f63',dinghy,8,false).rotation.x=PI/2;
}
const dinghyHull=group(0,.089,0,dinghy);
const dinghyWood=mat('#aa926a',.69).clone();
dinghyWood.onBeforeCompile=shader=>{
 shader.vertexShader='varying vec3 woodP;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nwoodP=position;');
 shader.fragmentShader='varying vec3 woodP;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec2 p=vec2(length(woodP.xy),woodP.z);
 float growth=sin(p.x*106.+sin(p.y*1.62+p.x*42.)*2.2+sin(p.y*6.5+p.x*25.)*.67);
 float aged=sin(p.x*52.-p.y*.91)*sin(p.y*4.6-p.x*13.);
 diffuseColor.rgb *= 1.-smoothstep(.37,1.,growth)*.15-max(0.,aged)*.085;
 `);
};
const ding=[[-1.69,.037,-.03],[-1.44,.42,0],[-.87,.73,-.015],[-.30,.86,-.03],[.67,.86,0],[1.28,.73,.025],[1.39,.71,.03]];
hullShape(ding,[[1.02,.235,1],[.96,.36,1],[.74,.592,.8],[.44,.701,.49],[.16,.735,.3]],dinghyWood,dinghyHull);
hullShape(ding,[[1.038,.22,1],[1.015,.287,1]],'#84a099',dinghyHull);
for(const s of [-1,1])for(const [r,h] of [[.97,.348],[.86,.464],[.69,.588],[.48,.684],[.16,.742]]){
 path(ding.map(([z,w,j])=>[s*w*r,h+j,z]),.012,pick(['#ab946c','#766951','#b19b73']),dinghyHull);
}
path(ding.map(([z,w,j])=>[0,.746+j,z]),.022,'#c0a67d',dinghyHull);
const musicTag=canvasMat(192,96,(c,w,h)=>{
 c.fillStyle='#e2d5ae';c.fillRect(0,0,w,h);c.strokeStyle='#9a8965';c.strokeRect(5,5,w-10,h-10);
 linesText(c,'音楽室',w/2,33,32,'#577873','center',true);
 linesText(c,'汐凪   2–B',w/2,68,23,'#8a7762','center');
});
const satinCase=[
 new T.MeshStandardMaterial({color:'#9daeb2',roughness:.36,metalness:.19,envMap:harborSky.texture,envMapIntensity:.56}),
 new T.MeshStandardMaterial({color:'#bbc7c5',roughness:.41,metalness:.12,envMap:harborSky.texture,envMapIntensity:.48})
];
for(const m of satinCase)m.onBeforeCompile=shader=>{
 shader.vertexShader='varying vec3 casePoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncasePoint=position;');
 shader.fragmentShader='varying vec3 casePoint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  vec2 p=casePoint.xy;
  float a=p.x*292.+sin(p.y*14.)*.88;
  float brush=cos(a)*cos(p.y*10.+p.x*11.)*(1.-smoothstep(.55,2.8,fwidth(a)));
  float wear=sin(p.x*23.+cos(p.y*19.))*sin(p.y*48.-p.x*31.);
  float polished=smoothstep(.72,.96,wear)*smoothstep(.13,.31,abs(p.x));
  diffuseColor.rgb*=.98+.066*brush+.088*polished;
 `);
};
function hardCase(x,z,rot,long){
 const g=group(x,SHORE+.017,z);g.rotation.y=rot;
 const sh=new T.Shape();
 const L=long?1.82:1.54;
 [[-.25,-L*.49],[-.33,-L*.37],[-.315,-L*.18],[-.21,.014],[-.177,L*.36],[-.117,L*.49],[.134,L*.49],[.212,L*.36],[.197,.023],[.304,-L*.20],[.325,-L*.37],[.235,-L*.49]].forEach(([a,b],i)=>i?sh.lineTo(a,b):sh.moveTo(a,b));
 const geom=new T.ExtrudeGeometry(sh,{depth:.145,bevelEnabled:true,bevelSize:.059,bevelThickness:.039,bevelSegments:2,steps:1});
 const o=mesh(geom,satinCase[long?0:1],0,.043,0,g);o.rotation.x=-PI/2;
 const pts=sh.getPoints().map(p=>[p.x,.099,-p.y]);pts.push(pts[0]);
 path(pts,.016,'#637c7b',g);
 for(const side of [-1,1])for(const [end,wx] of [[-.42,.293],[.42,.161]]){
  const trim=group(side*wx,.127,-end*L,g);trim.rotation.y=-side*.27;
  box(0,0,0,.036,.083,.125,'#839895',trim);
  for(const z of [-.037,.037])ball(side*.019,.011,z,.006,.010,.010,'#c6cbc2',trim,false);
 }
 for(const zz of [-.40,.40]){
  box(.257,.095,zz,.105,.067,.086,'#688382',g);
  box(.282,.112,zz,.067,.026,.060,'#c7cbab',g);
  box(-.174,.103,zz,.045,.043,.088,'#6e8380',g);
 }
 for(const zz of [-L*.393,L*.393]){
  for(const xx of [-.083,.086])cyl(xx,.228,zz,.018,.015,.012,'#bdc9be',g,9,false);
 }
 path([[.271,.10,-.17],[.365,.122,-.101],[.365,.122,.112],[.253,.10,.191]],.025,'#526866',g);
 for(const xx of [-.14,.09])for(const zz of [-.54,.5])box(xx,.223,zz,.037,.017,.14,'#718a88',g,false);
 for(const dx of [-.047,0,.047]){
  const guard=box(dx,.224,.215,.011,.009,.36,'#afbcb9',g,false);guard.rotation.y=.034;
 }
 const sticker=flat(-.046,.231,-.25,.23,.112,musicTag,g);sticker.rotation.z=long?-.23:.18;
}
hardCase(-3.21,8.90,.34,true);
hardCase(-2.31,9.02,.37,false);
const umbrella=group(-3.86,1.06,7.61);umbrella.rotation.set(.20,.31,-.44);
const umbGeo=new T.BufferGeometry();
const umbPos=[],umbIndices=[],N=64,M=9;
for(let j=0;j<=M;j++)for(let i=0;i<=N;i++){
 const f=j/M,a=i/N*TAU,w=.859*f*(1-.045*(1-Math.cos(a*8))*.5*Math.pow(f,4));
 umbPos.push(Math.cos(a)*w,.87-.41*f*f+.042*Math.sin(a*8)*f*f*f,Math.sin(a)*w);
 if(i&&j){const k=j*(N+1)+i;umbIndices.push(k,k-1,k-N-2,k,k-N-2,k-N-1)}
}
umbGeo.setAttribute('position',new T.Float32BufferAttribute(umbPos,3));umbGeo.setIndex(umbIndices);umbGeo.computeVertexNormals();
const umbMat=new T.MeshPhongMaterial({color:'#afe3e3',shininess:135,opacity:.31,transparent:true,depthWrite:false,side:T.DoubleSide,specular:'#edf9ec'});
mesh(umbGeo,umbMat,0,0,0,umbrella,false).renderOrder=9;
beam([0,-.19,0],[0,.965,0],.022,'#708881',umbrella);
path([[0,-.14,0],[0,-.335,0],[.05,-.40,0],[.142,-.37,0],[.168,-.27,0]],.025,'#70817c',umbrella);
for(let i=0;i<8;i++){
 const a=i*TAU/8,X=Math.cos(a),Z=Math.sin(a);
 path([[0,.864,0],[.4*X,.777,.4*Z],[.68*X,.612,.68*Z],[.861*X,.46,.861*Z]],.012,'#aec7be',umbrella);
 const pts=[];
 for(let j=0;j<=8;j++){
   const t=a+j*TAU/64,w=.859*(1-.045*(1-Math.cos(t*8))*.5);
   pts.push([Math.cos(t)*w,.46+.042*Math.sin(t*8),Math.sin(t)*w]);
 }
 path(pts,.013,'#aeccc5',umbrella);
 ball(.86*X,.455,.86*Z,.025,.031,.023,'#dcebe0',umbrella,false);
 beads.push({p:umbrella,x:.86*X,y:.454,z:.86*Z,phase:rr(0,8)});
}
for(let i=0;i<30;i++){
 const a=rr(0,TAU),f=rr(.18,.96),D=rr(.010,.017);
 ball(Math.cos(a)*.859*f,.876-.41*f*f+.042*Math.sin(a*8)*f*f*f,Math.sin(a)*.859*f,D,D*.67,D,alpha('#fcf4cf',.64),umbrella,false);
}
const warn=group(-1.52,SHORE,11.46);warn.rotation.y=.62;
for(const s of [-1,1])beam([s*.427,0,0],[s*.427,1.27,0],.035,'#738b7d',warn);
box(0,1.065,.013,1.201,.491,.066,'#839784',warn);
sign('注意 落水','汐凪漁港  ·  水辺に近づかない',0,1.065,.051,1.17,.46,warn);
const windsock=group(4.29,SHORE,-9.40);
cyl(0,1.685,0,.038,.055,3.37,'#718a7d',windsock);
beam([0,3.33,0],[.17,3.51,0],.026,'#718a7d',windsock);
const sockPivot=group(.13,3.43,0,windsock);
const sockGeo=new T.CylinderGeometry(.105,.25,1.24,20,14,true);
sockGeo.rotateZ(-PI/2);sockGeo.translate(.62,0,0);
const sockMat=canvasMat(256,144,(c,w,h)=>{
 c.fillStyle='#e4d8b5';c.fillRect(0,0,w,h);
 for(let i=0;i<3;i++){c.fillStyle='#bf6751';c.fillRect(0,i*52+10,w,24)}
},true);sockMat.side=T.DoubleSide;
const sock=mesh(sockGeo,sockMat,0,0,0,sockPivot,false);
cloth.push({o:sock,original:sockGeo.attributes.position.array.slice(),w:1.24,phase:1.7,sock:true});
tor(0,0,0,.251,.020,'#97a698',sockPivot).rotation.y=PI/2;

const catHide=vec(-3.46,1.04,13.105);
const cat=group(...catHide);
const fur='#b08559',furLight='#d2b18a',furDark='#816549';
const catBody=group(0,0,0,cat), catHead=group(.247,.214,.028,cat);
function tabbyPaint(face){
 const m=mat(fur,.91).clone();
 m.onBeforeCompile=shader=>{
  shader.uniforms.face={value:face?1:0};
  shader.vertexShader='varying vec3 tabby;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntabby=position;');
  shader.fragmentShader='varying vec3 tabby;uniform float face;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 p=tabby;
   float bands=cos(16.*p.x+5.1*p.z*p.z-2.*p.y+sin(p.y*5.5)*.54);
   float brow=cos(15.9*p.z+abs(p.x)*4.9+p.y*3.);
   float field=mix(bands,brow,face);
   float mask=smoothstep(.02,.55,p.y)*smoothstep(.52,.89,field);
   float sideMark=smoothstep(.34,.71,abs(p.z))*(1.-smoothstep(.27,.87,p.y));
   float belly=(1.-smoothstep(-.70,-.09,p.y))*(1.-smoothstep(.48,.94,abs(p.x)));
   diffuseColor.rgb*=1.-mask*mix(.23+.12*sideMark,.24,face);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.59,.395,.236),belly*.82*(1.-face));
  `);
 };
 return m;
}
const coatTabby=tabbyPaint(false), maskTabby=tabbyPaint(true), catEyes=[],catEars=[];
ball(-.023,.193,0,.283,.137,.161,coatTabby,catBody);
ball(.146,.170,0,.151,.118,.129,coatTabby,catBody);
function earShell(points,depth,bevel){
 const shape=new T.Shape();
 points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));
 shape.closePath();
 return new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,steps:1}).rotateY(PI/2);
}
const earOuter=earShell([[-.063,-.043],[.050,-.041],[.047,.031],[.029,.082],[.013,.099],[-.007,.079],[-.044,.023]],.038,.009);
const earInner=earShell([[-.040,-.026],[.032,-.026],[.032,.024],[.015,.073],[.004,.066],[-.026,.010]],.009,.0045);
for(const s of [-1,1]){
 const ear=group(-.011,.145,.072*s,catHead);
 ear.rotation.z=s<0?.16:.22;ear.rotation.y=s*.11;ear.scale.z=s;
 mesh(earOuter,fur,0,0,0,ear,true);
 mesh(earInner,'#bb927d',.042,-.006,0,ear,true);
 catEars.push(ear);
}
ball(0,.028,0,.149,.131,.124,maskTabby,catHead);
ball(.102,-.034,0,.065,.034,.061,furLight,catHead);
ico(.168,.008,0,.017,.015,.025,'#845f58',catHead,1,false);
for(const s of [-1,1]){
 const eye=group(.109,.061,s*.073,catHead);
 eye.rotation.y=-s*.24;
 ball(.004,0,0,.017,.020,.027,'#7a7954',eye,false);
 ball(.016,0,0,.011,.017,.023,'#b4b16f',eye,false);
 ball(.025,0,.003,.006,.015,.009,'#444c40',eye,false);
 ball(.030,.007,.006,.004,.004,.004,'#eee4c7',eye,false);
 catEyes.push(eye);
 ball(.125,-.012,s*.029,.051,.034,.048,furLight,catHead);
 path([[.169,-.003,0],[.174,-.021,s*.008],[.171,-.028,s*.025],[.166,-.021,s*.043]],.0028,'#84625b',catHead);
 for(let j=0;j<3;j++){
  ball(.164-j*.005,-.020+j*.008,s*(.054+j*.004),.003,.003,.003,'#a6886b',catHead,false);
  path([[.158,-.019+j*.010,s*.060],[.173,-.020+j*.016,s*.098],[.181,-.032+j*.023,s*.149]],.0019,'#e4d2b1',catHead);
 }
}
const catLegs=[];
for(const x of [-.173,.172])for(const z of [-.09,.09]){
 const g=group(x,.174,z,catBody);
 ball(0,-.088,0,.052,.103,.052,fur,g);
 ball(.027,-.172,0,.079,.04,.047,furLight,g);
 catLegs.push(g);
}
const catTail=group(-.237,.139,0,catBody);
const tailCurve=new T.CatmullRomCurve3([[0,0,0],[-.120,.026,.047],[-.230,.067,.095],[-.282,.147,.146],[-.258,.221,.184],[-.200,.246,.191]].map(p=>vec(...p)));
const tailSections=28, tailSides=8;
const tailGeo=new T.TubeGeometry(tailCurve,tailSections,.046,tailSides,false);
const tailVerts=tailGeo.attributes.position;
const tailVertex=new T.Vector3();
for(let i=0;i<=tailSections;i++){
 const u=i/tailSections,center=tailCurve.getPointAt(u);
 for(let j=0;j<=tailSides;j++){
  const k=i*(tailSides+1)+j;
  tailVertex.fromBufferAttribute(tailVerts,k).lerp(center,.66*u**1.25);
  tailVerts.setXYZ(k,tailVertex.x,tailVertex.y,tailVertex.z);
 }
}
tailGeo.computeVertexNormals();
const tailPaint=mat(fur).clone();
tailPaint.onBeforeCompile=shader=>{
 shader.vertexShader='varying float tailAlong;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntailAlong=uv.x;');
 shader.fragmentShader='varying float tailAlong;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  float ring=smoothstep(.41,.89,cos(24.*tailAlong+2.2*tailAlong*tailAlong));
  diffuseColor.rgb*=1.-max(ring*.25,smoothstep(.81,.97,tailAlong)*.26);
 `);
};
mesh(tailGeo,tailPaint,0,0,0,catTail,true);
ball(-.200,.246,.191,.016,.016,.016,furDark,catTail,true);


function makeFish(c,scale){
 const g=group();g.scale.setScalar(scale);
 ball(0,0,0,.29,.075,.087,c,g,false);
 ball(.038,-.028,0,.211,.04,.081,'#b8d0ac',g,false);
 const shape=new T.Shape();shape.moveTo(-.232,0);shape.lineTo(-.42,.104);shape.lineTo(-.394,0);shape.lineTo(-.432,-.086);shape.closePath();
 const finMat=mat(c).clone();finMat.side=T.DoubleSide;
 const tail=mesh(new T.ShapeGeometry(shape).translate(.235,0,0),finMat,-.235,0,0,g,false);
 const sp=new T.Shape();sp.moveTo(-.05,.045);sp.lineTo(-.19,.15);sp.lineTo(-.213,.036);sp.closePath();
 mesh(new T.ShapeGeometry(sp),finMat,0,0,0,g,false);
 for(const side of [-1,1]){
  ball(.189,.024,side*.063,.014,.016,.010,'#415e59',g,false);
  ball(.194,.030,side*.071,.005,.005,.004,'#c4d6b8',g,false);
 }
 fish.push({g,tail,phase:rr(0,TAU),dx:rr(-1.12,1.12),dy:rr(-.28,.29),dz:rr(-.79,.79),school:fish.length<11?0:1});
}
for(let i=0;i<23;i++)makeFish(pick(['#748e82','#87a79a','#91b1a0','#97a788','#aab597']),rr(.47,1.04));

const pierLettering=canvasMat(768,384,(c,w,h)=>{
 c.strokeStyle='#e7e2cb';c.lineWidth=8;c.setLineDash([20,10]);c.strokeRect(24,24,w-48,h-48);c.setLineDash([]);
 linesText(c,'汐 凪',w/2,140,100,'#e7e5d0','center',true);
 linesText(c,'漁  港   ・   荷さばき場',w/2,239,43,'#ece8d2','center',true);
 linesText(c,'07  /  SHIONAGI',w/2,306,25,'#f2ead3','center',true);
 c.globalCompositeOperation='destination-out';
 for(let i=0;i<2100;i++){c.fillStyle=i%2?'#0005':'#0009';c.fillRect(rr(0,w),rr(0,h),rr(.5,9),rr(.4,4))}
},false,true);
const groundLetter=flat(-11.19,1.044,10.52,3.48,1.77,pierLettering);
groundLetter.rotation.z=PI/2;
function drain(x,z,rot){
 const g=group(x,1.037,z);g.rotation.y=rot;
 box(0,.006,0,.87,.024,.357,'#677d72',g,false);
 box(0,.021,0,.801,.021,.293,'#3c5754',g,false);
 for(let i=0;i<14;i++)box(-.372+i*.057,.035,0,.021,.016,.279,i%3?'#718079':'#858e81',g,false);
}
drain(-11.85,7.83,PI/2);drain(-6.12,6.98,PI/2);drain(-9.4,1.13,PI/2);
drain(-11.9,-6.88,0);drain(-4.47,-8.05,0);drain(-3.05,10.20,0);
function curbPatch(x,z,w,h){
 const m=irreg(x,1.042,z,w,h,alpha('#52685e',.19),stage,.38);
 m.renderOrder=2;
}
for(const [x,z] of [[-13.6,11.3],[-13.6,12.45],[-7.80,7.40],[-7.8,7.8],[-6.70,-5.1],[-11.7,1.12],[1.29,-8.04],[1.82,-7.93],[-3.09,-8.0],[-10.3,13.6],[-13.3,-5.8]]){
 curbPatch(x,z,rr(.17,.65),rr(.11,.28));
 for(let i=0;i<6;i++){
  const a=rr(0,TAU),h=rr(.027,.13);
  const px=x+rr(-.14,.14),pz=z+rr(-.14,.14);
  const blade=beam([px,1.035,pz],[px+Math.cos(a)*h*.42,1.035+h,pz+Math.sin(a)*h*.42],rr(.006,.013),pick(['#7e8b57','#969b66','#81916b']),stage,5,false);
 }
}
const paletteG=group(-12.19,1.035,8.87);paletteG.rotation.y=.23;
for(let j=0;j<4;j++)box(0,.131,j*.255-.37,1.13,.059,.212,pick(['#b19d75','#aa9673','#baad88']),paletteG);
for(let j=0;j<3;j++)box(j*.46-.46,.062,0,.151,.121,1.01,'#9d906d',paletteG);
stack(paletteG,-.12,.16,-.026,3,'#a7c1bd',.72,.67);
const floatG=group(-13.05,SHORE,9.20);floatG.rotation.y=.11;
cyl(0,.108,0,.276,.261,.211,'#859280',floatG,14);
for(let j=0;j<6;j++){const o=tor(0,.066+j*.039,0,.275-.01*j,.022,pick(['#a48a66','#94845f','#af9870']),floatG);o.rotation.x=PI/2}
for(let j=0;j<7;j++){
 const x=rr(-.27,.31),z=rr(-.27,.29);
 ball(x,.34-Math.hypot(x,z)*.39,z,.085,.056,.076,pick(['#c8875d','#ded5b3','#cab279']),floatG);
}
for(const [px,pz] of [[-.85,-8.1],[-6.0,4.48],[-3.92,7.29]]){
 const g=group(px,1.036,pz);g.scale.set(.88,.60,.80);
 const ar=[];
 for(let i=0;i<50;i++){
  const t=i/49,r=.30-.21*t,a=t*TAU*3.3;
  ar.push([Math.cos(a)*r,.026+.056*t,Math.sin(a)*r]);
 }
 path(ar,.022,'#ac926b',g);
}
const mileage=group(7.82,-3.66,14.079);
const plate=box(0,0,.052,3.48,.36,.097,'#af9c74',mileage);
edge(plate,'#786f58',.45);
sign('汐凪漁港','潮見堤　｜　SHIONAGI',0,0,.104,3.37,.31,mileage,['#497570','#f1eba9','#c4b78e']);
for(const x of [-1.67,1.67])cyl(x,0,.105,.027,.026,.012,'#c7b98e',mileage,9).rotation.x=PI/2;

