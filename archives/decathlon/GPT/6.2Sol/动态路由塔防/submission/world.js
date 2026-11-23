"use strict";
const TAU=Math.PI*2;
const mats=new Map(),geos=new Map();
function mat(color,glow=0,metal=.26){
 const id=[color,glow,metal].join();
 if(!mats.has(id))mats.set(id,new THREE.MeshStandardMaterial({color,metalness:metal,roughness:.55,emissive:color,emissiveIntensity:glow}));
 return mats.get(id);
}
function flat(color,opacity=1){
 const id='flat'+color+opacity;
 if(!mats.has(id))mats.set(id,new THREE.MeshBasicMaterial({color,opacity,transparent:opacity<1,depthWrite:opacity===1,side:THREE.DoubleSide}));
 return mats.get(id);
}
function geo(kind,...args){
 const id=[kind,...args].join();
 if(geos.has(id))return geos.get(id);
 let out;
 if(kind==='box')out=new THREE.BoxGeometry(...args);
 if(kind==='cyl')out=new THREE.CylinderGeometry(...args);
 if(kind==='sphere')out=new THREE.SphereGeometry(...args);
 if(kind==='ico')out=new THREE.IcosahedronGeometry(...args);
 if(kind==='oct')out=new THREE.OctahedronGeometry(...args);
 if(kind==='torus')out=new THREE.TorusGeometry(...args);
 if(kind==='ring')out=new THREE.RingGeometry(...args);
 if(kind==='plane')out=new THREE.PlaneGeometry(...args);
 if(kind==='bevel'){
  const [w,h,d,r]=args,shape=new THREE.Shape(),x=w/2-r,z=d/2-r;
  shape.moveTo(-x,-z);shape.lineTo(x,-z);shape.lineTo(x,z);shape.lineTo(-x,z);shape.closePath();
  out=new THREE.ExtrudeGeometry(shape,{depth:Math.max(.005,h-r*2),bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelSegments:1,steps:1});
  out.rotateX(-Math.PI/2);out.translate(0,-h/2+r,0);
 }
 geos.set(id,out);return out;
}
function mesh(parent,g,m,x=0,y=0,z=0){
 const o=new THREE.Mesh(g,m);o.position.set(x,y,z);parent?.add(o);return o;
}
const box=(p,w,h,d,m,x,y,z)=>mesh(p,geo('box',w,h,d),m,x,y,z);
const beveled=(p,w,h,d,r,m,x,y,z)=>mesh(p,geo('bevel',w,h,d,r),m,x,y,z);
const cyl=(p,a,b,h,n,m,x,y,z)=>mesh(p,geo('cyl',a,b,h,n),m,x,y,z);
const ball=(p,r,m,x,y,z)=>mesh(p,geo('ico',r,1),m,x,y,z);
function torus(p,r,th,m,x,y,z){
 const o=mesh(p,geo('torus',r,th,5,32),m,x,y,z);o.rotation.x=Math.PI/2;return o;
}
function group(p,x=0,y=0,z=0){const o=new THREE.Group();p?.add(o);o.position.set(x,y,z);return o;}
function barBetween(p,a,b,w,h,m){
 const x=b.x-a.x,z=b.z-a.z,l=Math.hypot(x,z);
 const o=box(p,w,h,l,m,(a.x+b.x)/2,a.y,(a.z+b.z)/2);o.rotation.y=Math.atan2(x,z);return o;
}
function beam(p,a,b,rad,m){
 const from=new THREE.Vector3(a.x,a.y,a.z),to=new THREE.Vector3(b.x,b.y,b.z),v=to.clone().sub(from);
 const o=cyl(p,rad,rad,1,6,m,...from.addScaledVector(v,.5).toArray());o.scale.y=v.length();
 o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o;
}
function batch(source,target,shadows=true){
 source.updateMatrixWorld(true);const batches=new Map();
 source.traverse(o=>{
  if(!o.isMesh)return;const id=o.geometry.uuid+o.material.uuid;
  if(!batches.has(id))batches.set(id,[]);
  batches.get(id).push(o);
 });
 for(const arr of batches.values()){
  const {geometry,material}=arr[0],inst=new THREE.InstancedMesh(geometry,material,arr.length);
  arr.forEach((o,i)=>inst.setMatrixAt(i,o.matrixWorld));target.add(inst);inst.castShadow=shadows&&!material.isMeshBasicMaterial;inst.receiveShadow=shadows&&!material.isMeshBasicMaterial;
 }
}
function palette(map){
 return [
  {board:'#263c46',side:'#122632',tile:['#233a44','#2a424b','#2b3d4a'],trace:'#48717c',rail:'#18333e',route:'#386364',void:'#122d38',fog:'#0b1822'},
  {board:'#26394e',side:'#172a41',tile:['#263a54','#2b4560','#293b55'],trace:'#4a6d99',rail:'#223951',route:'#485e8b',void:'#262c5c',fog:'#11152b'},
  {board:'#403744',side:'#2b252d',tile:['#3d3540','#47404a','#38313c'],trace:'#816752',rail:'#412e2c',route:'#6c554d',void:'#352528',fog:'#1b1723'}
 ][map.env];
}
function racks(p,c,env,P){
 const {x,z,id}=c,kind=(x*3+z*7)%5,ink=mat(P.side),metal=mat(P.board),light=flat(env===2?'#f2a56f':env===1?'#93aefc':'#75d9d0');
 beveled(p,.79,.21,.76,.055,metal,x,.49,z);
 if(env===2&&kind<3){
  for(const off of [-.22,.22]){
   cyl(p,.15,.19,.62,10,ink,x+off,.87,z);
   cyl(p,.151,.151,.06,10,mat('#a07561'),x+off,1.15,z);
   cyl(p,.102,.102,.08,9,metal,x+off,1.22,z);
   box(p,.04,.25,.045,light,x+off,.9,z+.147);
  }
  beam(p,{x:x-.22,y:1.31,z},{x:x+.22,y:1.31,z},.036,metal);
 }else if(env===1&&kind<3){
  const y=.84+(id%3)*.13;
  box(p,.45,.53,.45,ink,x,y,z);
  const pylon=cyl(p,.11,.27,.56,4,metal,x,y+.40,z);pylon.rotation.y=Math.PI/4;
  box(p,.28,.058,.28,light,x,y+.71,z);
  for(let j=0;j<3;j++)box(p,.31,.013,.014,light,x,y+.1-j*.105,z+.23);
 }else{
  for(let i=0;i<2+(id%3===0?1:0);i++){
   const xx=x-.23+i*.22,h=.39+((id+i)%4)*.15;
   beveled(p,.18,h,.49,.028,ink,xx,.58+h/2,z-.06);
   box(p,.14,.024,.46,metal,xx,.61+h,z-.06);
   for(let j=0;j<4;j++){
    box(p,.111,.018,.014,metal,xx,.64+j*.076,z+.194);
    if(j!==1)box(p,.027,.013,.017,light,xx+.039,.64+j*.076,z+.205);
   }
  }
 }
}
class World{
 constructor(container,labels){
  this.host=container;this.labels=labels;this.scene=new THREE.Scene();
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.19;
  container.append(this.renderer.domElement);this.canvas=this.renderer.domElement;
  this.camera=new THREE.OrthographicCamera(-10,10,8,-8,.1,145);this.ray=new THREE.Raycaster();
  this.scene.add(new THREE.HemisphereLight('#bbdeff','#273b59',2.03));
  const sun=new THREE.DirectionalLight('#ffe2c5',2.6);sun.position.set(-7,14,10);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:44});
  sun.shadow.mapSize.set(1536,1536);sun.shadow.normalBias=.032;sun.shadow.bias=-.00015;this.scene.add(sun);
  const rim=new THREE.DirectionalLight('#69bbfc',1.55);rim.position.set(7,11,-13);this.scene.add(rim);
  this.reset();
 }
 reset(){this.cam={az:.39,el:.84,zoom:1,x:0,z:0,y:.12};}
 viewFit(aspect){return Math.max(6.64,8.55/aspect)/this.cam.zoom;}
 horizontalPosition(x,z){
  const aspect=(this.w||16)/(this.h||9),cam=this.cam;
  const projected=(x-7-cam.x)*Math.cos(cam.az)-(z-5-cam.z)*Math.sin(cam.az);
  return projected/(this.viewFit(aspect)*aspect);
 }
 project(x,y,z){
  const v=new THREE.Vector3(x-7,y,z-5).project(this.camera);
  return {x:(v.x+1)*this.w/2,y:(1-v.y)*this.h/2,visible:Math.abs(v.x)<1.09&&Math.abs(v.y)<1.08};
 }
 worldPos(px,py,y=.36){
  const b=this.canvas.getBoundingClientRect();
  this.ray.setFromCamera(new THREE.Vector2((px-b.left)/b.width*2-1,1-(py-b.top)/b.height*2),this.camera);
  const v=new THREE.Vector3();if(!this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-y),v))return null;
  return {x:v.x+7,z:v.z+5};
 }
 pick(px,py,sim,placement=false,deviceOnly=false){
  const bounds=this.canvas.getBoundingClientRect();
  if(px<bounds.left||px>bounds.right||py<bounds.top||py>bounds.bottom)return null;
  const sample=(x,y,z)=>{const p=this.project(x,y,z);return Math.hypot(px-bounds.left-p.x,py-bounds.top-p.y);};
  const tilePixels=this.h/13.28*this.cam.zoom;
  if(!placement){
   let best=null,ratio=1;
   for(const e of sim.enemies){
    if(e.dead)continue;
    const radius=clamp(tilePixels*(e.spec.boss?.58:.35),10,61);
    const d=sample(e.x,e.y+(e.spec.boss?.42:.14),e.z)/radius;
    if(d<ratio){ratio=d;best=e.uid;}
   }
   if(best!==null)return {enemy:best};
  }
  if(!placement||deviceOnly){
   let nearest=clamp(tilePixels*.43,12,62),id=null;
   for(const t of sim.towers.values()){
    const d=sample(t.x,t.y+.14,t.z);
    if(d<nearest){nearest=d;id=t.id;}
   }
   if(id!==null)return {cell:id};
  }
  this.ray.setFromCamera(new THREE.Vector2((px-bounds.left)/bounds.width*2-1,1-(py-bounds.top)/bounds.height*2),this.camera);
  let nearest=Infinity,id=null;
  for(const tile of this.pickTiles){
   const hit=this.ray.ray.intersectBox(tile.box,this.pickHit);
   if(!hit)continue;
   const depth=hit.distanceToSquared(this.ray.ray.origin);
   if(depth<nearest){nearest=depth;id=tile.id;}
  }
  return id===null?null:{cell:id};
 }
 bind(map){
  if(this.outer){
   this.outer.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.userData.unique){o.geometry.dispose();if(o.isLine)o.material.dispose();}});
   this.scene.remove(this.outer);
  }
  this.labels.replaceChildren();this.map=map;
  this.pickHit=new THREE.Vector3();
  const upper={platform:.462,obstacle:1.21,node:.50,entry:1.23,exit:map.env===1?1.68:1.53,void:-.19,link:.24,legacy:.245};
  this.pickTiles=map.cells.map(c=>{
   const x=c.x-7,z=c.z-5,top=upper[c.type];
   const box=new THREE.Box3(new THREE.Vector3(x-.48,-.23,z-.48),new THREE.Vector3(x+.48,top,z+.48));
   return {id:c.id,box};
  });this.reset();this.routesReverse=-1;this.previewId=null;this.live=new Map();
  const P=palette(map);this.scene.background=new THREE.Color(P.fog);this.scene.fog=new THREE.FogExp2(P.fog,.024);
  this.outer=group(this.scene,-7,0,-5);this.board=group(this.outer);this.routes=group(this.outer);this.units=group(this.outer);this.fx=group(this.outer);this.guide=group(this.outer);this.status=group(this.outer);this.hazardMotion=[];this.switchMotion=[];this.targets=group(this.outer);this.targetSignature='';this.airways=group(this.outer);this.airSignature=null;this.airPlan=null;this.logBeacon=null;this.skillMarks=[];
  const source=group(null),background=group(null);this.labelsList=[];this.portalMotion=[];this.hitLabels=[];this.effectMeshes=[];this.renderKey='';
  const side=mat(P.side),frame=mat(P.board),trace=flat(P.trace),halo=flat(map.color,.62),base=mat(P.rail);
  for(const c of map.cells){
   if(c.type==='void')continue;
   const {id,x,z,type}=c,plate=type==='platform'||type==='obstacle';
   beveled(source,.987,.24,.987,.048,side,x,-.25,z);
   box(source,.96,.075,.96,frame,x,-.098,z);
   if((x===0||x===14||z===0||z===10)&&id%3===0){
    box(source,.38,.065,.38,trace,x,-.35,z);
    box(source,.08,.07,.08,halo,x,-.35,z);
   }
   if(plate){
    const zone=Math.min(2,Math.floor(x/5));
    beveled(source,.94,.26,.94,.049,mat(P.tile[zone]),x,.2,z);
    beveled(source,.81,.13,.81,.036,mat(P.tile[zone]),x,.385,z);
    const dots=[[-.32,-.32],[.32,.32]];
    for(const [dx,dz] of dots){box(source,.064,.017,.064,trace,x+dx,.455,z+dz);box(source,.024,.024,.024,flat('#9db3bc',.60),x+dx,.466,z+dz);}
    box(source,.16,.017,.019,trace,x-.26,.46,z+.323);
    box(source,.019,.017,.23,trace,x+.323,.46,z-.20);
    if(type==='platform'){
     box(source,.085,.014,.018,trace,x,.46,z);box(source,.018,.014,.085,trace,x,.46,z);
     if(id%5===0){box(source,.095,.016,.067,halo,x+.31,.46,z+.15);}
    }else racks(source,c,map.env,P);
   }else{
    beveled(source,.94,.135,.94,.035,base,x,.09,z);
    const prop=type==='legacy'?mat('#6d4f3b'):mat(P.route);
    box(source,.40,.08,.40,prop,x,.185,z);
    for(const n of c.edges){
     const b=map.cells[n];const end={x:(x+b.x)/2,y:.185,z:(z+b.z)/2};
     barBetween(source,{x,y:.185,z},end,.40,.08,prop);
     const dx=b.x-x,dz=b.z-z;
     for(const sg of [-1,1]){
      const xp=x+dz*.267*sg,zp=z+dx*.267*sg;
      barBetween(source,{x:xp,y:.221,z:zp},{x:xp+dx*.48,z:zp+dz*.48},.024,.018,trace);
     }
    }
    if(type==='legacy')this.legacyCoupler(source,c,map,false);
   }
   if(type==='entry'||type==='exit'){
    const actuator=this.portal(source,c,map.env);
    this.portalMotion.push({cell:c,actuator,hoops:[],rings:[]});
    const el=document.createElement('div');el.className='map-label target-label';el.dataset.cell=id;el.style.setProperty('--mark',c.color);
    el.innerHTML='<i>'+c.letter+'</i>'+c.name;this.labels.append(el);this.labelsList.push({el,x,z,y:type==='exit'?1.94:1.25});
   }
   if(type==='node'){
    cyl(source,.40,.44,.17,8,mat('#252841'),x,.32,z);cyl(source,.31,.38,.10,8,mat('#575273'),x,.427,z);
    for(let i=0;i<4;i++){const a=i*Math.PI/2+.78;box(source,.08,.075,.08,mat('#ad99d0'),x+Math.sin(a)*.31,.49,z+Math.cos(a)*.31);}
    const el=document.createElement('div');el.className='node-label target-label';el.dataset.cell=id;this.labels.append(el);this.labelsList.push({el,x,z,y:.94,c});
   }
  }
  // Under-deck struts and bus lines surround the floating assembly.
  for(const x of [0,3,7,11,14])for(const z of [0,3,8,10]){
   const c=map.cells[key(x,z)];if(c.type==='void')continue;
   beveled(source,.56,.67,.56,.065,side,x,-.62,z);box(source,.13,.21,.13,trace,x,-1,z);
   box(source,.22,.042,.22,halo,x,-1.115,z);
  }
  for(let i=0;i<5;i++){
   const y=-.48-i*.062;
   box(source,15-i*.25,.035,.047,i===1?halo:trace,7,y,10.47-i*.055);
   box(source,.045,.035,11-i*.25,i===1?halo:trace,14.47-i*.055,y,5);
  }
  this.env(background,map,P);
  this.districts(source,background,map,P);
  this.facilities(source,background,map,P);
  batch(source,this.board);batch(background,this.board,false);
  const trackCells=map.cells.filter(c=>c.edges.length).length;
  const packetCapacity=Math.ceil(trackCells*1.75/1.55)*map.entries.length;
  this.routePackets=new THREE.InstancedMesh(geo('box',.07,.034,.21),flat('#ffffff'),packetCapacity);this.routePackets.count=0;this.routePackets.frustumCulled=false;this.outer.add(this.routePackets);
  this.bgPackets=new THREE.InstancedMesh(geo('box',.035,.025,.32),flat('#fff',.64),70);this.bgPackets.count=0;this.bgPackets.frustumCulled=false;this.outer.add(this.bgPackets);
  this.temp=new THREE.Object3D();
  this.enemyTrack=new THREE.InstancedMesh(geo('box',.047,.018,.14),flat('#ff9c83',.8),map.cells.length*4);
  this.enemyTrack.count=0;this.enemyTrack.frustumCulled=false;this.outer.add(this.enemyTrack);
  this.laneMarks=[
   new THREE.InstancedMesh(geo('box',.055,.022,.30),flat('#91f6b6',.92),map.cells.length*2),
   new THREE.InstancedMesh(geo('box',.069,.022,.095),flat('#ffce80',.92),map.cells.length*2)
  ];
  for(const layer of this.laneMarks){layer.count=0;layer.frustumCulled=false;this.outer.add(layer);}

 }
 portal(p,c,env){
  const {x,z,type,color}=c;
  const accent=type==='exit'&&c.exit===1?(env===2?'#ffd197':'#b3acff'):color;
  const glow=flat(accent),metal=mat('#42616a'),light=mat(accent,.46),dark=mat('#21343d');
  cyl(p,.48,.49,.22,8,dark,x,.38,z);
  cyl(p,.41,.46,.12,8,metal,x,.55,z);torus(p,.34,.021,glow,x,.63,z);
  if(type==='exit'){
   const main=group(this.units,x,1.22,z);
   if(env===0){
    for(let i=0;i<3;i++){
     const y=.70+i*.22;
     cyl(p,.335,.335,.15,12,dark,x,y,z);
     cyl(p,.337,.337,.037,12,metal,x,y+.064,z);
     for(const d of [-1,1]){
      box(p,.048,.044,.024,glow,x+d*.09,y-.012,z+.32);
      box(p,.081,.02,.021,light,x+d*.21,y+.032,z+.275);
     }
    }
    ball(main,.16,light,0,.12,0).scale.set(.92,1.23,.92);
    torus(main,.23,.016,glow,0,.12,0);
   }else if(env===1){
    for(const d of [-1,1]){
     beveled(p,.115,.73,.35,.025,metal,x+d*.29,1.005,z).rotation.z=d*.19;
     box(p,.065,.55,.028,glow,x+d*.32,1.03,z+.18).rotation.z=d*.19;
    }
    const prism=mesh(main,geo('oct',.27,0),light,0,.04,0);prism.scale.y=1.75;
    torus(main,.29,.019,glow,0,.063,0).rotation.set(.65,0,.36);
    cyl(p,.27,.39,.11,4,dark,x,.66,z).rotation.y=.78;
   }else{
    cyl(p,.25,.37,.36,10,dark,x,.825,z);
    cyl(p,.265,.285,.14,10,metal,x,1.08,z);
    for(let j=0;j<3;j++){
     const a=j*TAU/3+.3;
     const arm=group(p,x,.75,z);arm.rotation.y=a;
     cyl(arm,.05,.07,.47,8,metal,0,.19,.33).rotation.x=-.26;
     box(arm,.11,.06,.19,light,0,.43,.27);
     box(arm,.11,.095,.11,dark,0,.04,.335);
    }
    cyl(main,.17,.22,.23,8,light,0,.033,0);
    torus(main,.25,.023,glow,0,.14,0);
    box(main,.21,.026,.066,glow,0,.168,0);
    box(main,.066,.026,.21,glow,0,.168,0);
   }
   const surfaces=[];
   main.traverse(o=>{
    if(!o.isMesh)return;
    surfaces.push([o,o.material]);
    o.castShadow=!o.material.isMeshBasicMaterial;
    o.receiveShadow=o.castShadow;
   });
   return {main,accent,surfaces,alert:false};
  }
  const frameW=env===1?.36:.29,bodyY=env===2?.77:.84;
  for(const d of [-1,1]){
   beveled(p,.14,.63,.20,.03,metal,x+d*frameW,bodyY,z).rotation.z=env===1?d*.15:0;
   box(p,.078,.38,.027,glow,x+d*frameW,bodyY+.038,z+.11).rotation.z=env===1?d*.15:0;
  }
  if(env!==1){
   beveled(p,.65,.11,.17,.033,metal,x,1.15,z);
   box(p,.30,.027,.02,glow,x,1.21,z+.087);
  }else{
   const center=ball(p,.096,light,x,1.19,z);center.scale.y=.74;
  }
  const portal=box(p,.43,.48,.022,flat(color,.20),x,.87,z);portal.renderOrder=1;
  return null;
 }
 env(p,map,P){
  const dark=mat(P.side),coal=mat('#101922'),dim=flat(P.trace,.36),bright=flat(map.color,.38),structure=mat(P.tile[0]);
  const floor=mesh(p,geo('plane',160,120),mat(P.fog,0,.1),7,-6.38,5);floor.rotation.x=-Math.PI/2;
  for(let i=-34;i<=35;i+=2){
   box(p,.022,.008,73,dim,7+i,-6.34,5);box(p,73,.008,.022,dim,7,-6.34,5+i);
  }
  for(let i=-24;i<=24;i+=6){
   box(p,.034,.022,68,bright,7+i,-6.25,5);box(p,69,.022,.035,bright,7,-6.24,5+i);
  }
  for(let i=0;i<37;i++){
   const x=((i*13.83)%44)-14,z=((i*6.79)%36)-14;
   if(x>-2&&x<16&&z>-2&&z<12)continue;
   const y=-4.4+((i*2.322)%2.6),w=.7+i%4*.25;
   beveled(p,w,.23,w,.05,structure,x,y,z);
   box(p,w*.46,.12,w*.40,bright,x,y+.17,z);
   box(p,.09,1.6,.09,dim,x,y-1,z);
   if(i%3===0)for(let k=0;k<4;k++)box(p,.19,.30+k*.23,.34,dark,x+(k-1.5)*.24,y+.17+k*.10,z);
  }
  for(let i=0;i<9;i++){
   const x=(i-2)*2.1,y=-2.1-i%3*.37;
   box(p,.065,.041,21,dim,x,y,4.7);
   box(p,.038,.031,20,bright,x+.21,y+.04,5.4);
   box(p,25,.037,.06,dim,7,y-.21,i*1.52-.7);
  }
  if(map.env===1){
   for(let z=4.72;z<=6.72;z+=.23){
    box(p,19,.048,.079,flat(z%1>.46?'#5644ba':'#3575bb',.72),7,-.89,z);
    box(p,22,.032,.035,flat('#72a0ed',.5),7,-1.27,z+.12);
   }
   for(const x of [3,6,11])for(const z of [4.62,6.38])box(p,.83,.12,.13,flat('#7eaaf3',.65),x,.26,z);
  }
  if(map.env===2){
   beveled(p,4.98,.18,4.98,.08,dark,7,-3.84,5);
   for(let i=0;i<4;i++){
    const r=4.85-i*.55,y=-3.7+i*.52;
    box(p,r,.07,.045,dim,7,y,5-r/2);box(p,r,.07,.045,dim,7,y,5+r/2);
    box(p,.045,.07,r,dim,7-r/2,y,5);box(p,.045,.07,r,dim,7+r/2,y,5);
   }
   for(let n=0;n<9;n++){
    const v=n*.48-1.94;const m=n%2?coal:flat('#bc7742',.68);
    box(p,.33,.055,.22,m,7+v,.05,2.52).rotation.y=.3;
    box(p,.33,.055,.22,m,7+v,.05,7.48).rotation.y=.3;
    box(p,.22,.055,.33,m,4.51,.05,5+v).rotation.y=.3;
    box(p,.22,.055,.33,m,9.49,.05,5+v).rotation.y=.3;
   }
  }
 }
 drawRoutes(sim,preview){
  this.routes.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
  this.routes.clear();this.packetPaths=[];
  const geometry=group(null);
  const draw=(table,isPreview)=>{
   sim.map.entries.forEach((entry,i)=>{
    if(isPreview&&!preview.changed.includes(entry.letter)&&!preview.weighted.includes(entry.letter))return;
    const path=routePath(table,entry.id);const offset=(i-(sim.map.entries.length-1)/2)*.115;
    const pts=[];
    let timeCost=0;
    for(let j=0;j<path.length;j++){
     const c=sim.map.cells[path[j]];
     if(j)timeCost+=(table.weight(path[j-1])+table.weight(c.id))*.5;
     pts.push({x:c.x+offset,z:c.z-offset,y:isPreview?.375:.284,timeCost});
    }
    if(!isPreview)this.packetPaths.push({pts,i,timeCost});
    const color=isPreview?'#efffa3':entry.color;
    for(let j=1;j<pts.length;j++){
     const a=pts[j-1],b=pts[j];
     if(isPreview){
      for(const t of [.16,.5,.84])box(geometry,.093,.018,.17,flat(color),a.x+(b.x-a.x)*t,a.y,a.z+(b.z-a.z)*t).rotation.y=Math.atan2(b.x-a.x,b.z-a.z);
     }else{
      barBetween(geometry,a,b,.137,.023,flat(color,.23));
      barBetween(geometry,a,b,.055,.025,flat(color,.80));
      if(j%2===0){
       const at={x:(a.x+b.x)/2,y:a.y+.019,z:(a.z+b.z)/2};
       const arrow=cyl(geometry,0,.098,.145,3,flat(color,.94),at.x,at.y,at.z);
       arrow.rotation.order='YXZ';arrow.rotation.x=Math.PI/2;arrow.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);
      }
     }
    }
   });
  };
  draw(sim.route,false);if(preview?.ok)draw(preview.table,true);
  batch(geometry,this.routes,false);
 }
 drawStatus(sim){
  this.status.clear();this.hazardMotion=[];this.switchMotion=[];
  const closedNodes=sim.closed;
  for(const c of sim.map.nodes){
   const closed=closedNodes.has(c.id),tone=closed?'#ff787e':'#c3a6ff';
   torus(this.status,.38,.024,flat(tone),c.x,.49,c.z);
   for(let i=0;i<4;i++){
    const angle=Math.PI/4+i*TAU/4,dx=Math.sin(angle),dz=Math.cos(angle);
    const p=box(this.status,.131,.033,.051,flat(tone),c.x+dx*.414,.475,c.z+dz*.414);
    p.rotation.y=angle;
   }
   if(!closed){
    const rotor=group(this.status,c.x,.522,c.z);
    const gem=mesh(rotor,geo('oct',.112,0),mat(tone,.42),0,.098,0);gem.scale.y=1.44;
    for(const side of [-1,1])box(rotor,.063,.032,.189,flat('#e3d0ff',.75),side*.176,.024,0);
    this.switchMotion.push({rotor,c});
   
   }else if(sim.isolators.has(c.id)){
    cyl(this.status,.27,.32,.31,6,mat('#563045'),c.x,.61,c.z);
    box(this.status,.31,.034,.065,flat(tone),c.x,.78,c.z).rotation.y=.78;
    box(this.status,.31,.034,.065,flat(tone),c.x,.78,c.z).rotation.y=-.78;
   }
  }
  for(const id of sim.downs.keys()){
   this.legacyCoupler(this.status,sim.map.cells[id],sim.map,true);
  }
  for(const id of sim.holes.keys()){
   const c=sim.map.cells[id],motion=group(this.status,c.x,.38,c.z);
   if(sim.map.boss==='mirage'){
    const sink=cyl(this.status,.421,.359,.12,12,mat('#1a1530'),c.x,.345,c.z);
    sink.rotation.y=.4;
    torus(this.status,.414,.020,flat('#9774ff',.72),c.x,.423,c.z);
    torus(motion,.287,.018,flat('#ae82ff',.82),0,.075,0).rotation.set(1.08,0,.48);
    torus(motion,.192,.014,flat('#d9beff',.84),0,.078,0).rotation.set(1.17,.44,-.84);
    const iris=mesh(motion,geo('oct',.118,0),mat('#604db9',.54),0,.07,0);iris.scale.y=.42;
    for(const side of [-1,1])ball(motion,.035,flat('#d8bdff'),side*.33,.12,0);
   }else{
    const curb=cyl(this.status,.455,.376,.13,6,mat('#3b202f'),c.x,.365,c.z);curb.rotation.y=.4;
    for(const d of [-1,1]){
     box(this.status,.78,.055,.062,mat('#68515a'),c.x,.424,c.z+d*.31);
     box(this.status,.598,.031,.054,flat('#ff718e'),c.x,.459,c.z+d*.31);
    }
    for(const d of [-1,0,1])box(motion,.049,.022,.41,flat('#ff91a2',.84),d*.170,.080,0).rotation.y=.58;
   }
   this.hazardMotion.push({motion,id});
  }
 }
 drawGuide(sim,ui){
  this.guide.clear();
  let id=ui.pending?.id??(ui.placement?ui.hover:ui.selected?.cell);
  const preview=ui.validation?.p;
  if(preview&&!preview.ok)for(const cid of preview.bad){
   const c=sim.map.cells[cid],y=c.type==='entry'?.68:.57,ink=flat('#ff6975');
   torus(this.guide,.48,.034,ink,c.x,y,c.z);
   for(const dir of [-1,1])box(this.guide,.41,.025,.038,ink,c.x,y+.035,c.z).rotation.y=dir*Math.PI/4;
  }
  if(id==null)return;
  const c=sim.map.cells[id],t=sim.towers.get(id),color=ui.validation&&!ui.validation.ok?'#ff6975':ui.placement?'#ffd392':'#91f4d3';
  const level=c.type==='platform'?.49:c.type==='node'?.52:.32;
  const o=mesh(this.guide,geo('plane',.89,.89),flat(color,.20),c.x,level,c.z);o.rotation.x=-Math.PI/2;
  for(const dx of [-.43,.43])for(const dz of [-.43,.43]){
   box(this.guide,.16,.026,.026,flat(color),c.x+dx*.85,level+.021,c.z+dz);
   box(this.guide,.026,.026,.16,flat(color),c.x+dx,level+.021,c.z+dz*.85);
  }
  const [mode,type]=(ui.placement||'').split(':');
  const dir=(ui.pending?.dir??t?.dir??ui.dir??0)*Math.PI/180;
  const r=mode==='remove'?0:mode==='item'?ITEMS[type].r:mode==='tower'?type==='firewall'?sim.blockingReach(type,id):TOWERS[type].r:t?sim.radius(t):0;
  const sector=(mode==='tower'?type:mode?null:t?.type)==='gun';
  if(sector){
   const marker=cyl(this.guide,0,.23,.32,3,flat(color,.82),c.x+Math.sin(dir)*.6,level+.035,c.z+Math.cos(dir)*.6);
   marker.rotation.order='YXZ';marker.rotation.x=Math.PI/2;marker.rotation.y=dir;
  }
  if(mode==='tower'&&ui.validation?.ok){
   const ghost=towerModel({type,lv:1,branch:-1}).root;ghost.position.set(c.x,c.type==='platform'?1.05:.69,c.z);ghost.rotation.y=dir;
   ghost.traverse(o=>{if(o.isMesh)o.material=flat(color,.36);});this.guide.add(ghost);
  }
  if(r){
   const ext=sector?Math.acos(.12):Math.PI,angle=dir-Math.PI/2-ext,level=.514;
   const m=mesh(this.guide,new THREE.CircleGeometry(r,52,angle,2*ext),flat(color,.095),c.x,level,c.z);m.rotation.x=-Math.PI/2;m.userData.unique=true;
   const pts=[];
   for(let i=0;i<=52;i++){const a=angle+2*ext*i/52;pts.push(new THREE.Vector3(c.x+Math.cos(a)*r,level+.018,c.z-Math.sin(a)*r));}
   if(sector){pts.push(new THREE.Vector3(c.x,level+.018,c.z),pts[0]);}
   const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color,transparent:true,opacity:.73}));l.userData.unique=true;this.guide.add(l);
  }
  if(ui.validation?.area)for(const n of ui.validation.area){const q=sim.map.cells[n];box(this.guide,.63,.014,.63,flat('#b7a1ff',.31),q.x,q.type==='node'?.54:.347,q.z);}
 }
}

function towerModel(t){
 const root=group(null),head=group(root),parts=[];
 const tim=TOWERS[t.type].color,ink=mat(tim,.21),light=flat(tim),white=mat('#cbe1da',.08),metal=mat('#2e464f'),dark=mat('#17242e');
 const base=cyl(root,.365,.429,.16,8,dark,0,-.25,0);base.rotation.y=Math.PI/8;
 cyl(root,.34,.37,.105,8,metal,0,-.155,0);
 torus(root,.314,.017,light,0,-.105,0);
 for(const a of [0,Math.PI*.5,Math.PI,Math.PI*1.5]){
  const m=box(root,.10,.083,.12,ink,Math.sin(a)*.328,-.102,Math.cos(a)*.328);m.rotation.y=a;
 }
 if(t.type==='gun'){
  cyl(root,.17,.25,.16,10,metal,0,-.035,0);
  const rotor=group(head,0,.125,0);parts.push(rotor);
  beveled(rotor,.39,.29,.35,.043,white,0,0,-.102);
  box(rotor,.31,.18,.55,dark,0,.06,.19);
  for(const x of t.lv===2?[-.12,0,.12]:[-.105,.105]){
   beveled(rotor,.085,.10,.55,.023,ink,x,.103,.27);
   box(rotor,.046,.045,.024,light,x,.116,.552);
  }
  const stripe=t.branch===1?'#facb70':t.branch===0?'#c9a8ff':tim;
  box(rotor,.21,.041,.17,flat(stripe),0,.214,-.08);
  for(const x of [-.22,.22])cyl(rotor,.08,.08,.10,8,metal,x,.014,-.01).rotation.z=Math.PI/2;
 }else if(t.type==='gate'){
  for(const x of [-.28,.28]){
   const pillar=group(head,x,.04,0);
   beveled(pillar,.108,.76,.135,.023,white,0,.19,0).rotation.z=-x*.4;
   box(pillar,.044,.56,.025,light,0,.21,.076);
   box(pillar,.117,.12,.20,metal,0,.48,0);
   cyl(pillar,.095,.10,.10,8,ink,0,-.07,0).rotation.x=Math.PI/2;
   parts.push(pillar);
  }
  box(root,.50,.058,.22,metal,0,-.037,0);
  const plane=mesh(head,geo('plane',.47,.52),flat(tim,.19),0,.223,.027);
  parts.push(plane);
  for(const d of [-1,1]){
   box(head,.44,.025,.023,light,0,.229,.05).rotation.z=d*.67;
   if(t.lv===2)box(head,.40,.025,.024,white,0,.229,d*.11).rotation.z=d*.68;
  }
 }else if(t.type==='firewall'){
  for(const x of [-.265,.265]){
   beveled(root,.13,.63,.26,.029,metal,x,.14,0);
   box(root,.081,.30,.04,light,x,.19,.146);
   box(root,.15,.085,.27,white,x,.43,0);
  }
  for(let n=0;n<(t.lv===2?4:3);n++){
   const y=-.015+n*.126;
   const slat=beveled(head,.44,.107,.17,.025,n%2?metal:ink,0,y,.005);parts.push(slat);
   box(slat,.29,.025,.013,light,0,0,.088);
  }
  const crest=beveled(head,.29,.12,.20,.031,white,0,.433,.012);
  box(crest,.145,.038,.023,light,0,0,.106);
 }else if(t.type==='honey'){
  cyl(root,.275,.30,.17,12,metal,0,-.024,0);
  const lure=group(head,0,.22,0);parts.push(lure);
  const globe=ball(lure,.225,ink,0,0,0);globe.scale.y=1.30;
  cyl(lure,.106,.158,.16,10,white,0,.232,0);
  torus(lure,.216,.017,light,0,-.09,0);
  torus(lure,.211,.019,flat(t.branch===1?'#ffa68b':t.branch===0?'#ffd1f4':tim),0,.11,0);
  for(let k=0;k<5;k++){
   const a=k*TAU/5;
   const strip=box(root,.052,.31,.054,metal,Math.sin(a)*.237,.108,Math.cos(a)*.237);
   strip.rotation.set(Math.cos(a)*-.15,0,Math.sin(a)*.15);
  }
  if(t.lv===2){
   const antenna=torus(head,.327,.016,light,0,.309,0);parts.push(antenna);
   for(const x of [-.29,.29])ball(head,.059,white,x,.31,0);
  }
 }else if(t.type==='sandbox'){
  cyl(root,.255,.31,.19,4,metal,0,-.048,0);
  const core=mesh(head,geo('oct',.218,0),ink,0,.28,0);parts.push(core);
  const scan=group(head,0,.24,0);parts.push(scan);
  for(const z of [-.225,.225])box(scan,.457,.028,.032,light,0,0,z);
  for(const x of [-.225,.225])box(scan,.032,.028,.457,light,x,0,0);
  for(const x of [-.23,.23])for(const z of [-.23,.23]){
   beveled(root,.078,.42,.081,.017,metal,x,.135,z);
   box(root,.09,.065,.09,white,x,.353,z);
  }
  if(t.lv===2){
   const scan2=torus(head,.32,.016,light,0,.22,0);scan2.rotation.set(.53,.27,0);parts.push(scan2);
  }
 }else{
  cyl(root,.159,.232,.26,10,white,0,-.011,0);
  for(const d of [-1,1]){
   const arm=group(head,d*.16,.129,0);arm.rotation.z=-d*.53;parts.push(arm);
   beveled(arm,.116,.31,.145,.025,metal,0,.104,0);
   box(arm,.12,.085,.24,ink,0,.267,0);
   box(arm,.052,.03,.18,light,0,.318,0);
  }
  ball(head,.107,ink,0,.31,0);
  box(head,.26,.04,.071,light,0,.17,.146);
  box(head,.07,.16,.041,light,0,.17,.155);
  if(t.lv===2)torus(root,.41,.017,light,0,.27,0);
 }
 return {root,head,parts};
}
function enemyModel(e){
 const root=group(null),head=group(root),parts=[];
 const ink=mat(e.spec.color,.34),glow=flat(e.spec.color),black=mat('#362535'),armor=mat('#665361'),bone=mat('#cf8f85',.12);
 const eyes=flat('#fff1c5');
 if(e.type==='worm'){
  for(let i=0;i<4;i++){
   const l=group(head,0,0,.19-i*.14);parts.push(l);const s=.115-i*.011;
   ball(l,s, i===0?ink:armor,0,0,0);
   for(const d of [-1,1]){
    box(l,.105,.04,.05,i===0?glow:ink,d*.093,-.05,-.014).rotation.z=d*.44;
    box(l,.027,.022,.028,eyes,d*.045,.04,.087);
   }
  }
 }else if(e.type==='flood'){
  beveled(head,.43,.24,.39,.044,black,0,0,0);
  beveled(head,.30,.205,.23,.039,ink,0,.09,.04);
  for(const d of [-1,1]){
   const p=group(head,d*.245,-.015,.068);parts.push(p);
   ball(p,.169,armor,0,0,.0).scale.set(.69,1,1.4);
   box(p,.151,.054,.081,glow,0,.004,.151);
  }
  box(head,.18,.029,.034,eyes,0,.142,.16);
 }else if(e.type==='trojan'){
  const ghost=beveled(head,.28,.20,.31,.037,mat('#819aa1',.28),0,0,0);parts.push(ghost);
  box(ghost,.21,.016,.247,flat('#99c7c4',.70),0,.111,0);
  const core=mesh(head,geo('oct',.231,0),ink,0,.03,0);parts.push(core);
  for(const d of [-1,1])box(core,.077,.065,.20,glow,d*.146,-.021,0).rotation.z=d*.45;
 }else if(e.type==='ransom'){
  const spine=beveled(head,.24,.31,.29,.05,black,0,.061,0);spine.rotation.x=.16;
  cyl(head,.14,.21,.19,5,ink,0,.20,0);
  for(const d of [-1,1]){
   const p=group(head,d*.22,.058,-.025);parts.push(p);
   beveled(p,.145,.18,.285,.033,armor,0,0,0);
   box(p,.073,.07,.25,ink,0,0,.13);box(p,.056,.041,.016,glow,0,.021,.258);
  }
  box(head,.145,.042,.06,eyes,0,.18,.15);
 }else if(e.type==='flying'){
  const pod=mesh(head,geo('oct',.24,0),ink,0,0,0);pod.scale.set(.68,.65,1.26);
  for(const d of [-1,1]){
   const wing=group(head,d*.083,0,0);parts.push(wing);
   const o=cyl(wing,0,.283,.037,3,armor,d*.15,0,-.025);o.rotation.y=d*.77;
   box(wing,.252,.032,.032,glow,d*.148,.025,-.057).rotation.y=d*.33;
   box(wing,.062,.033,.20,black,d*.126,.046,-.006);
  }
  ball(head,.073,eyes,0,.042,.175);
 }else if(e.type==='shell'){
  const shell=cyl(head,.18,.275,.22,6,armor,0,.015,0);shell.rotation.y=.51;
  const core=ball(head,.113,ink,0,.194,0);parts.push(core);
  torus(head,.253,.022,glow,0,.083,0);
  for(let j=0;j<5;j++){const a=j*TAU/5;box(head,.061,.16,.055,ink,Math.sin(a)*.225,.045,Math.cos(a)*.225).rotation.y=a;}
 }else{
  const h=e.type==='legion'?.45:e.type==='mirage'?.70:.61;
  const core=mesh(head,geo(e.type==='legion'?'ico':'oct',.29,0),ink,0,h,0);
  if(e.type==='shadow')core.scale.y=1.56;
  parts.push(core);
  const cradle=cyl(head,.29,.41,.19,e.type==='mirage'?4:6,black,0,.22,0);cradle.rotation.y=.6;
  torus(head,.44,.023,glow,0,.326,0);
  for(let j=0;j<(e.type==='legion'?6:4);j++){
   const a=j*TAU/(e.type==='legion'?6:4),x=Math.sin(a)*.35,z=Math.cos(a)*.35;
   const arm=group(head,x,.36,z);arm.rotation.y=a;parts.push(arm);
   if(e.type==='legion'){
    beveled(arm,.19,.39,.21,.044,armor,0,.15,.05);
    box(arm,.12,.08,.24,ink,0,.34,.08);box(arm,.066,.026,.05,eyes,0,.364,.18);
   }else if(e.type==='mirage'){
    const prism=mesh(arm,geo('oct',.20,0),armor,0,.24,.05);prism.scale.y=2.1;
    box(arm,.058,.28,.058,glow,0,.26,.18);
   }else{
    beveled(arm,.10,.51,.21,.037,black,0,.22,.12).rotation.x=.44;
    beveled(arm,.10,.22,.38,.029,bone,0,.073,.19).rotation.x=-.38;
    box(arm,.037,.24,.047,glow,0,.25,.246).rotation.x=.44;
   }
  }
  if(e.type==='mirage'){
   const ring=torus(head,.56,.016,glow,0,.59,0);ring.rotation.set(.65,.35,.21);parts.push(ring);
  }
 }
 return {root,head,parts};
}
World.prototype.syncUnits=function(sim,ui,visualTime){
 const all=[...sim.towers.values(),...sim.enemies.filter(e=>!e.dead)];
 const deaths=new Map(sim.effects.filter(f=>f.model&&visualTime<f.at+f.dur).map(f=>[f.model.uid,f]));
 all.push(...Array.from(deaths.values(),f=>f.model));
 const visible=new Set(all.map(u=>u.uid));
 for(const [id,model] of this.live)if(!visible.has(id)){
  this.live.delete(id);
  model.root.removeFromParent();model.hp.remove();
 }
 for(const u of all){
  const tower=!u.spec,key=tower?u.type+u.lv+u.branch:u.type;
  let m=this.live.get(u.uid);
  if(!m||m.key!==key){
   if(m){m.root.removeFromParent();m.hp.remove();}
   m=tower?towerModel(u):enemyModel(u);
   Object.assign(m,{key,tower,angle:tower?u.dir*Math.PI/180:u.dir,hp:document.createElement('div')});
   m.root.traverse(o=>{if(o.isMesh){o.castShadow=!o.material.isMeshBasicMaterial;o.receiveShadow=!o.material.isMeshBasicMaterial;}});
   this.units.add(m.root);m.hp.className='unit-bar'+(tower?' tower':u.spec.boss?' boss':'');m.hp.innerHTML='<i></i><em class="shield-meter" hidden></em><div class="unit-flags" aria-hidden="true"><b class="flag-enc" hidden>锁</b><b class="flag-root" hidden>困</b><b class="flag-slow" hidden>缓</b></div><span></span>';
   m.meter=m.hp.querySelector('.shield-meter');m.flags=m.hp.querySelector('.unit-flags').children;
   m.hp.classList.add('target-label');m.hp.dataset[tower?'cell':'enemy']=tower?u.id:u.uid;
   this.labels.append(m.hp);this.live.set(u.uid,m);
   m.shield=torus(m.root,u.spec?.boss?.68:tower?.44:.31,.013,flat(tower?'#68f6cb':'#ffdd79',.83),0,.41,0);
   m.shield.rotation.x=1.09;
   if(tower)m.lock=torus(m.root,.33,.019,flat('#d78cff',.74),0,.34,0);
   if(u.spec?.boss)m.phaseHalo=torus(m.root,.53,.022,flat(u.spec.color,.68),0,.46,0);
   if(u.type==='shadow'){
    m.coat=[];m.head.traverse(o=>{if(o.isMesh)m.coat.push([o,o.material]);});
   }
  }
  const time=sim.time,beat=time*(tower?3.65:u.type==='worm'?13:7)+u.uid*.78,act=Math.max(0,1-(time-u.action)*4.6);
  const hit=Math.max(0,1-(time-u.hit)*5),hitKick=Math.sin(time*57)*hit*.12;
  let y=u.y;
  const stagger=tower||u.spec.boss?0:((u.uid%5)-2)*.052;
  const showX=u.x+Math.cos(u.dir||0)*stagger,showZ=u.z-Math.sin(u.dir||0)*stagger;
  if(!tower)y+=u.spec.air?(.12*Math.sin(beat*.79)):(u.type==='worm'?.025:.058)*Math.sin(beat);
  m.root.position.set(showX,y,showZ);m.root.rotation.z=hitKick;m.shield.visible=u.shield>0;
  m.shield.rotation.z=time*1.5;
  if(tower){
   m.root.rotation.y=u.dir*Math.PI/180;
   if(m.lock){m.lock.visible=u.enc>sim.time;m.lock.rotation.x=1.2+Math.sin(beat)*.42;}
   if(u.type==='gun'){
    const offset=u.aim!==undefined&&time-u.action<.92?Math.atan2(Math.sin(u.aim-m.root.rotation.y),Math.cos(u.aim-m.root.rotation.y)):Math.sin(beat*.42)*.24;
    m.head.rotation.y=offset;m.parts[0].position.z=-act*.14;m.parts[0].rotation.x=-act*.15;
   }
   if(u.type==='firewall')m.parts.forEach((l,i)=>{l.position.z=.01+act*.13*(1-i*.16);l.rotation.x=act*.49;});
   if(u.type==='gate'){
    const flex=Math.max(0,1-(time-u.hit)*4.2);
    m.parts[0].rotation.z=-flex*.16;m.parts[1].rotation.z=flex*.16;
    m.parts[2].scale.y=.96+Math.sin(beat*1.2)*.05+flex*.1;
   }
   if(u.type==='honey'){
    m.parts[0].position.y=.22+Math.sin(beat)*.035+act*.08;m.parts[0].rotation.y=beat*.34;
    if(m.parts[1])m.parts[1].rotation.x=1.05+Math.sin(beat)*.32+act*.26;
   }
   if(u.type==='sandbox'){
    m.parts[0].rotation.set(beat*.51,beat*.82,.34);
    m.parts[1].rotation.set(.56+Math.sin(beat*.67)*.57,beat*.72,act*.36);
    m.parts[1].position.y=.235+Math.sin(beat)*.055+act*.10;
   }
   if(u.type==='repair')m.parts.forEach((l,i)=>{l.rotation.z=(i?-1:1)*(.61+Math.sin(beat)*.15+act*.37);l.rotation.x=act*.34;});
  }else{
   const turn=u.turnAt===undefined?1:clamp((time-u.turnAt)/.17,0,1), arc=u.dir-(u.turnFrom??u.dir);
   m.angle=(u.turnFrom??u.dir)+Math.atan2(Math.sin(arc),Math.cos(arc))*turn*turn*(3-2*turn);m.root.rotation.y=m.angle;m.head.position.z=act*.12;m.head.rotation.x=act*.26;
   if(u.type==='worm')m.parts.forEach((l,i)=>{l.position.x=Math.sin(beat-i*.75)*.061;l.position.y=Math.cos(beat-i*.74)*.046;l.rotation.y=Math.cos(beat-i*.7)*.32;});
   if(u.type==='flood'||u.type==='ransom')m.parts.forEach((l,i)=>{
    l.rotation.x=Math.sin(beat+i*Math.PI)*.42-act*.84;l.position.z=.04+act*.15;
    if(u.type==='ransom'){
     const yaw=(u.attackBearing??m.angle)-m.angle;
     l.rotation.y=Math.atan2(Math.sin(yaw),Math.cos(yaw))*act;
    }
   });
   if(u.type==='trojan'){
    const [packet,core]=m.parts,opening=u.seen?clamp((time-(u.revealAt??time-1))/.42,0,1):0;
    packet.visible=!u.seen||opening<1;
    packet.position.set(-opening*.23,opening*.29,-opening*.14);
    packet.rotation.set(opening*.82,beat*.14,-opening*1.73);
    packet.scale.setScalar(Math.max(.05,1-opening*.87));
    core.visible=u.seen;core.rotation.y=beat*.49;core.position.y=.03+Math.sin(beat)*.037;
    core.children.forEach((wing,i)=>{const sign=i===0?-1:1;wing.rotation.z=sign*(.83-opening*.42+act*.22);wing.position.x=sign*(.084+opening*.063);});
   }
   if(u.type==='shell')m.parts[0].position.y=.18+Math.sin(beat)*.042+act*.12;
   if(u.spec.air)m.parts.forEach((l,i)=>{l.rotation.z=(i?-1:1)*Math.sin(beat*1.8)*.53;l.rotation.x=Math.cos(beat)*.16;});
   if(u.spec.boss){
    if(m.coat&&m.coatState!==u.seen){
     m.coatState=u.seen;for(const [mesh,material] of m.coat)mesh.material=u.seen?material:flat('#9282c4',.60);
    }
    m.phaseHalo.visible=u.phase>1;m.phaseHalo.rotation.set(.86+Math.sin(beat*.3)*.28,0,time*.99);
    m.phaseHalo.scale.setScalar(1+(u.phase-1)*.11);
    m.parts[0].rotation.y=time*(.9+u.phase*.55);m.parts[0].rotation.z=(u.phase-1)*.31+Math.sin(beat*.36)*.18;
    m.parts.slice(1).forEach((l,i)=>{
     l.rotation.x=Math.sin(beat*.45+i)*.24-act*.42-(u.phase-1)*.14;
     l.rotation.z=Math.cos(beat*.37+i)*(.15+.09*u.phase);
     if(l.isGroup){
      const angle=l.rotation.y,spread=.35+(u.phase-1)*.075+act*.04;
      l.position.x=Math.sin(angle)*spread;l.position.z=Math.cos(angle)*spread;
     }
    });
   }
  }
  const death=deaths.get(u.uid);
  if(death){
   const n=clamp((visualTime-death.at)/death.dur,0,1);
   m.root.position.set(death.from.x,death.from.y+n*.49,death.from.z);
   m.root.rotation.z=n*.84;m.head.rotation.x=-n*.66;
   m.parts.forEach((part,i)=>{part.rotation.z=(i%2?1:-1)*n*1.5;});
   m.root.scale.setScalar(Math.max(.001,1-n*n));
   m.hp.style.display='none';
   continue;
  }
  const p=this.project(showX,y+(tower?.52:u.spec.boss?1.09:.32),showZ);
  m.hp.style.display=p.visible?'':'none';
  const selected=tower?ui.selected?.cell===u.id:ui.selected?.enemy===u.uid;
  m.hp.classList.toggle('unit-selected',selected);
  m.hp.classList.toggle('advanced',tower&&u.lv===2);
  m.hp.style.left=p.x+'px';m.hp.style.top=p.y+'px';m.hp.classList.toggle('encrypted',tower&&u.enc>time);
  m.hp.firstChild.style.width=clamp(u.hp/u.max*100,0,100)+'%';
  m.hp.firstChild.style.background=tower?'#6fe5c8':'#ff8c7e';
  m.meter.hidden=!(u.shield>0);
  if(u.shield>0)m.meter.style.width=Math.min(100,u.shield/(tower?100:26)*100)+'%';
  const showControl=selected||u.spec?.boss||sim.enemies.length<=18;
  m.flags[0].hidden=!(tower&&u.enc>time);
  m.flags[1].hidden=!(showControl&&!tower&&u.root>time);
  m.flags[2].hidden=!(showControl&&!tower&&u.slowed>time&&u.root<=time);
  m.hp.lastChild.textContent=u.spec?.boss?u.spec.name+' · '+(['I','II','III'][u.phase-1]):
   selected?(tower?TOWERS[u.type].name:u.seen?u.spec.name:'未识别流量'):'';
 }
};
World.prototype.drawEffects=function(sim,now){
 let readouts=0,slot=0;
 const sprite=(geometry,material,x,y,z)=>{
  let o=this.effectMeshes[slot++];
  if(!o){
   o=mesh(this.fx,geometry,material);
   this.effectMeshes.push(o);
  }
  o.geometry=geometry;o.material=material;
  o.position.set(x,y,z);o.rotation.set(0,0,0);o.scale.set(1,1,1);o.visible=true;
  return o;
 };
 const vertical=new THREE.Vector3(0,1,0),axis=new THREE.Vector3();
 const trace=(a,b,rad,material)=>{
  axis.set(b.x-a.x,b.y-a.y,b.z-a.z);
  const length=axis.length();
  if(length<.001)return;
  const o=sprite(geo('cyl',1,1,1,6),material,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
  o.scale.set(rad,length,rad);
  o.quaternion.setFromUnitVectors(vertical,axis.multiplyScalar(1/length));
 };
 const spread=(p,r,col,alpha)=>{
  const o=sprite(geo('torus',1,.027,5,32),flat(col,alpha),p.x,p.y,p.z);o.rotation.x=Math.PI/2;o.scale.setScalar(r);
 };
 for(const e of sim.enemies){
  if(e.dead)continue;
  const t=sim.towers.get(e.block);
  if(t&&dist(t,e)>.13)trace({x:e.x,y:.38,z:e.z},{x:t.x,y:.43,z:t.z},.018,flat('#ff9c78',.43));
  if(e.root>now){
   const phase=(now*2.1+e.uid*.11)%1;
   spread({x:e.x,y:.325,z:e.z},.29+.09*phase,'#ffb0d7',.7);
   for(const d of [-1,1]){
    const o=sprite(geo('box',.031,.027,.116),flat('#ffb0d7',.71),e.x+d*.257,.365,e.z);
    o.rotation.y=d*(now*1.7+phase);
   }
  }
 }
 for(const f of sim.effects.slice(-145)){
  const n=(now-f.at-(f.delay||0))/f.dur;if(n<0||n>=1)continue;
  const a=f.from,b=f.to,col=f.color||'#70f0df',alpha=Math.max(.1,Math.floor((1-n)*8)/8);
  if(f.kind==='integrity'){
   if(readouts>=8)continue;
   let label=this.hitLabels[readouts];
   if(!label){
    label=document.createElement('div');label.className='impact-number';this.labels.append(label);this.hitLabels.push(label);
   }
   readouts++;
   const p=this.project(a.x,a.y+.59+n*.43,a.z);
   label.hidden=!p.visible;label.style.left=p.x+'px';label.style.top=p.y+'px';
   label.style.color=col;label.style.opacity=String(Math.min(1,(1-n)*3));
   label.textContent=(f.shielded?'◇ −':'−')+f.delta;
   continue;
  }
  if(f.kind==='shield-hit'||f.kind==='shield-break'){
   const burst=f.kind==='shield-break',r=f.radius;
   spread({...a,y:a.y+.19},r*(.86+n*.53),col,alpha);
   if(burst)for(let i=0;i<6;i++){
    const k=i*TAU/6+f.at,reach=r*(1.05+n*.88);
    const shard=sprite(geo('oct',1,0),flat(col,alpha),a.x+Math.cos(k)*reach,a.y+.18+Math.sin(Math.PI*n)*.24,a.z+Math.sin(k)*reach);
    shard.scale.set(.036*(1-n*.6),.018,.028);shard.rotation.set(i*.88,n*4,i*.7);
   }
   continue;
  }
  const isBeam=['shot','shell','heal','ransom','melee','shock','tether'].includes(f.kind);
  if(isBeam){
   const lob=f.kind==='shell',speed=lob?n:clamp(n*(f.kind==='shock'?1.8:2.8),0,1);
   const p={x:a.x+(b.x-a.x)*speed,y:a.y+(b.y-a.y)*speed+.12,z:a.z+(b.z-a.z)*speed};
   if(lob){
    p.y+=Math.sin(speed*Math.PI)*.66;
    spread({...b,y:.305},f.radius,col,.30);
   }else if(dist(a,b)>.08){
    const to={...b,y:b.y+.12};
    trace({...a,y:a.y+.12},to,f.kind==='heal'?.023:f.kind==='shock'?.065:f.kind==='tether'?.017:.026,flat(col,alpha*.74));
   }
   const orb=sprite(geo('ico',1,1),flat(col,lob?.93:alpha),p.x,p.y,p.z);
   orb.scale.setScalar((lob?.110:.067)*(1-n*.35));
   if(f.kind==='heal'){
    const w=sprite(geo('ico',1,1),flat('#d9ffe4',alpha),p.x,p.y+.115,p.z);w.scale.setScalar(.029);
   }
   if(f.kind==='shock')spread({...b,y:.36},.31+n*.65,col,alpha);
  }else if(f.kind==='burst'||f.kind==='impact'){
   const r=f.radius||.4;
   for(let i=0;i<(f.kind==='burst'?11:5);i++){
    const ang=i*2.399+f.at*1.8;
    const p=sprite(geo('oct',1,0),flat(i%3===0?'#ffe1ae':col,alpha),a.x+Math.cos(ang)*n*r,a.y+.1+Math.sin(n*Math.PI)*r*(.28+i%4*.15),a.z+Math.sin(ang)*n*r);
    p.scale.setScalar((f.kind==='burst'?.076:.042)*(1-n*.80));p.rotation.set(n*4+i,n*2,n*6);
   }
   if(f.kind==='burst')spread({...a,y:.38},(.1+n)*r,col,alpha*.75);
  }else{
   const r=f.radius||.66;
   spread({...a,y:.35},.08+r*n,col,alpha);
   spread({...a,y:.43+n*.16},.06+r*n*.85,col,alpha*.60);
  }
 }
 for(let i=readouts;i<this.hitLabels.length;i++)this.hitLabels[i].hidden=true;
 if(sim.warning&&!sim.ended){
  const c=sim.map.cells[sim.warning.id],t=1-(sim.warning.until-now)/1.7;
  const mirage=sim.warning.boss==='mirage';
  for(const id of sim.warning.ids){
   const tile=sim.map.cells[id];
   spread({...tile,y:.55},.43+.19*t,mirage?'#b88cff':'#ff644f',.87);
   spread({...tile,y:.55},.28+.20*Math.sin(t*Math.PI),mirage?'#dcc4ff':'#ffc287',.60);
   const o=sprite(geo('plane',.91,.91),flat('#ff594f',.28),tile.x,.34,tile.z);o.rotation.x=-Math.PI/2;
  }
  const msg=(mirage?'路由黑洞预警':sim.warning.ids.length>1?'区段封锁预警':'封锁预警')+' · '+Math.max(0,sim.warning.until-now).toFixed(1)+'s';
  if(!this.warnEl){this.warnEl=document.createElement('div');this.warnEl.className='node-label closed';this.labels.append(this.warnEl);}
  const p=this.project(c.x,1.1,c.z);this.warnEl.hidden=!p.visible;this.warnEl.style.left=p.x+'px';this.warnEl.style.top=p.y+'px';this.warnEl.textContent=msg;
 }else if(this.warnEl)this.warnEl.hidden=true;
 for(let i=slot;i<this.effectMeshes.length;i++)this.effectMeshes[i].visible=false;
};
World.prototype.render=function(sim,ui,time){
 const w=this.host.clientWidth,h=this.host.clientHeight;if(w<2||h<2)return;
 if(w!==this.w||h!==this.h){this.w=w;this.h=h;this.renderer.setSize(w,h,false);}
 const c=this.cam,aspect=w/h;
 const routeSignature=[sim.routeVersion,ui.placement,ui.validation?.p?ui.hover??ui.pending?.id:'',ui.validation?.p?.ok].join();
 const guideSignature=[routeSignature,ui.validation?.p?.bad.join(),ui.hover,ui.selected?.cell,ui.pending?.id,ui.pending?.dir,ui.dir,ui.validation?.ok,sim.towers.get(ui.selected?.cell)?.lv].join();
 const renderKey=[time,sim.time,sim.effectVersion,sim.logVersion,ui.selected?.enemy,ui.selected?.lane,ui.forecastNext,ui.locator?.id,ui.locator?.age,guideSignature,w,h,c.az,c.el,c.zoom,c.x,c.y,c.z].join('|');
 if(this.renderKey===renderKey)return;
 this.renderKey=renderKey;
 const fit=this.viewFit(aspect);
 this.camera.left=-fit*aspect;this.camera.right=fit*aspect;this.camera.bottom=-fit;this.camera.top=fit;
 this.camera.position.set(c.x+26*Math.sin(c.az)*Math.cos(c.el),c.y+26*Math.sin(c.el),c.z+26*Math.cos(c.az)*Math.cos(c.el));
 this.camera.lookAt(c.x,c.y,c.z);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
 this.drawTargets(sim,ui);
 this.drawAirways(sim,ui);
 this.drawEnemyTrack(sim,ui);
 this.drawLaneReport(sim,ui);
 this.drawLogBeacon(sim,ui);
 this.drawSkillTargets(sim,ui);
 if(this.routeSig!==routeSignature){this.routeSig=routeSignature;this.drawRoutes(sim,ui.validation?.p);}
 if(this.routesReverse!==sim.routeVersion){this.routesReverse=sim.routeVersion;this.drawStatus(sim);}
 if(this.guideSig!==guideSignature){
  this.guide.traverse(o=>{if(o.userData.unique){o.geometry.dispose();if(o.isLine)o.material.dispose();}});
  this.guideSig=guideSignature;this.drawGuide(sim,ui);
 }
 let count=0;
 const launch=(obj,x,y,z,angle,color,scale=1)=>{
  this.temp.position.set(x,y,z);this.temp.rotation.set(0,angle,0);this.temp.scale.set(1,1,scale);this.temp.updateMatrix();
  obj.setMatrixAt(count,this.temp.matrix);obj.setColorAt(count++,new THREE.Color(color));
 };
 for(const {pts,i,timeCost} of this.packetPaths||[]){
  if(timeCost<=0)continue;
  const inlet=sim.map.entries[i],changing=sim.lastChange+1.35>sim.time&&sim.lastChanged.includes(inlet.letter);
  for(let offset=0;offset<timeCost;offset+=1.55){
   const t=(time*1.26+offset+i*.37)%timeCost;
   let idx=1;
   while(idx<pts.length-1&&pts[idx].timeCost<=t)idx++;
   const p=pts[idx-1],q=pts[idx],weight=q.timeCost-p.timeCost,n=(t-p.timeCost)/weight;
   launch(this.routePackets,p.x+(q.x-p.x)*n,.325,p.z+(q.z-p.z)*n,Math.atan2(q.x-p.x,q.z-p.z),changing?'#eaffbc':ui.selected?.lane===i?'#f6ffde':inlet.color,weight>1?.8:1);
  }
 }
 this.routePackets.count=count;this.routePackets.instanceMatrix.needsUpdate=true;if(this.routePackets.instanceColor)this.routePackets.instanceColor.needsUpdate=true;
 count=0;
 for(let i=0;i<49;i++){
  const lane=i%9,n=((time*(.7+i%3*.39)+i*5.71)%28)-8;
  if(this.map.env===1&&i%3===0)launch(this.bgPackets,n,-.85,4.79+lane*.231,Math.PI/2,'#7397ff',2.6);
  else launch(this.bgPackets,(lane-2)*2.1+.21,-2.0-lane%3*.37,n,0,this.map.color,1.45);
 }
 this.bgPackets.count=count;this.bgPackets.instanceMatrix.needsUpdate=true;this.bgPackets.instanceColor.needsUpdate=true;
 const closedNodes=sim.closed;
 for(const l of this.labelsList){
  const p=this.project(l.x,l.y,l.z);l.el.hidden=!p.visible;
  l.el.style.left=p.x+'px';l.el.style.top=p.y+'px';
  if(l.c){
   const closed=closedNodes.has(l.c.id),lock=sim.locks.get(l.c.id)-sim.time;
   l.el.classList.toggle('closed',closed);
   const t=sim.isolators.get(l.c.id);
   l.el.textContent=l.c.code+(t?' · '+Math.ceil(t.hp)+' HP':closed?' · 隔离':lock>0?' · '+Math.ceil(lock)+'s':' · 直通');
  }
 }
 for(const {motion,id} of this.hazardMotion){
  if(sim.map.boss==='mirage')motion.rotation.y=time*2.9+id;
  else motion.position.y=.38+.032*Math.sin(time*8+id);
 }
 for(const {rotor,c} of this.switchMotion){
  rotor.rotation.y=time*1.08+c.id*.41;
  rotor.position.y=.522+Math.sin(time*2.8+c.id)*.027;
 }
 this.animatePortals(sim,time);
 this.syncUnits(sim,ui,sim.ended?time:sim.time);this.drawEffects(sim,sim.ended?time:sim.time);
 this.renderer.render(this.scene,this.camera);
};

World.prototype.districts=function(source,background,map,P){
 const color=flat(map.color,.66),light=flat(map.color,.27),iron=mat(P.board),low=mat(P.side),trim=mat(P.trace);
 const nameSets=[
  [['01','旧系统网段',.28,5.7],['02','DMZ 互联',5.0,2.75],['03','灾备环',11.7,9.7]],
  [['IX','公网流',8.42,5.47],['01','专线隧道',3.03,5.67],['02','旧专线',11.8,6.4]],
  [['OT','工业气隙',7,5.35],['01','西侧运维环',1.10,6.9],['02','安全联锁',12.8,8.65]]
 ];
 for(const [id,name,x,z] of nameSets[map.env]){
  const el=document.createElement('div');el.className='sector-label';el.style.setProperty('--district',map.color);
  el.innerHTML='<small>'+id+'</small>'+name;this.labels.append(el);this.labelsList.push({el,x,z,y:.16});
 }
 if(map.env===0){
  for(const x of [4,9]){
   beveled(source,1.74,.21,.48,.05,iron,x+.48,1.26,-.16);
   box(source,1.57,.043,.06,color,x+.48,1.34,.087);
   for(let j=0;j<7;j++)box(source,.11,.023,.22,trim,x-.08+j*.18,1.37,-.17);
   for(const dx of [-.62,.62]){
    cyl(source,.067,.094,.62,8,trim,x+.48+dx,.92,-.36);
    box(source,.13,.056,.43,light,x+.48+dx,1.40,-.17);
   }
  }
 }
 if(map.env===1){
  for(const p of [[4,5.5],[7.1,5.48],[9.8,5.50],[12.26,5.48]]){
   const [x,z]=p;
   cyl(background,.20,.31,.7,7,iron,x,-1.42,z);
   cyl(background,.25,.25,.08,8,color,x,-1.02,z);
   for(let j=0;j<3;j++)torus(background,.31+j*.10,.018,light,x,-1.01+j*.10,z);
  }
 }
 if(map.env===2){
  for(const x of [5.1,8.9])for(const z of [3.24,6.75]){
   cyl(background,.19,.31,.76,8,iron,x,-2.45,z);
   cyl(background,.34,.36,.095,10,trim,x,-2.01,z);
   torus(background,.27,.018,color,x,-1.945,z);
   for(const dx of [-.13,.13])box(background,.07,.19,.065,color,x+dx,-1.91,z);
  }
  for(const x of [5.15,8.85])for(const j of [-1,0,1]){
   box(background,.135,.15,3.65,low,x+j*.16,-1.78,5);
   box(background,.037,.022,3.67,light,x+j*.16,-1.69,5);
  }
  const center=group(background,7,-2.24,5);
  const duct=cyl(center,.49,.66,.63,8,iron,0,.22,0);duct.rotation.y=.39;
  cyl(center,.435,.50,.11,8,trim,0,.61,0);
  torus(center,.35,.040,flat('#faad63',.58),0,.71,0);
  for(let n=0;n<4;n++){
   const angle=n*TAU/4+.78;
   const leg=group(center,0,0,0);leg.rotation.y=angle;
   box(leg,.19,.23,.64,trim,0,.18,.66);box(leg,.042,.058,.38,color,0,.30,.66);
  }
 }
};




World.prototype.drawTargets=function(sim,ui){
 const mode=ui.pending?'':ui.placement;
 const [kind,type]=(mode||'').split(':');
 const cooling=kind==='item'&&(sim.cooldowns[type]||0)>sim.time;
 const nodeLocks=mode?sim.map.nodes.filter(c=>(sim.locks.get(c.id)||0)>sim.time).map(c=>c.id):[];
 const signature=[mode,sim.routeVersion,cooling,nodeLocks.join(),kind==='tower'||type==='backup'?[...sim.towers.keys()].join():''].join('|');
 if(this.targetSignature===signature)return;
 this.targetSignature=signature;
 this.targets.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
 this.targets.clear();
 if(!mode||cooling)return;
 const source=group(null),mark=flat(kind==='tower'?TOWERS[type].color:'#b9a8fc',.65),closed=sim.closed;
 for(const c of sim.map.cells){
  const tower=sim.towers.has(c.id),path=c.type==='link'||c.type==='legacy',node=c.type==='node',open=!closed.has(c.id);
  let eligible=false;
  if(kind==='tower'&&open&&!tower){
   if(type==='gate')eligible=node&&!nodeLocks.includes(c.id);
   else if(type==='firewall')eligible=path||node&&!nodeLocks.includes(c.id);
   else if(type==='honey')eligible=path;
   else eligible=c.type==='platform';
  }
  if(kind==='item'){
   if(type==='backup')eligible=tower;
   if(type==='isolate')eligible=node&&open&&!nodeLocks.includes(c.id);
   if(type==='downgrade')eligible=path||node;
  }
  if(!eligible)continue;
  const y=c.type==='platform'?.482:node?.507:.254;
  for(const d of [-1,1]){
   box(source,.137,.012,.025,mark,c.x+d*.34,y,c.z+d*.375);
   box(source,.025,.012,.137,mark,c.x+d*.375,y,c.z+d*.34);
  }
 }
 batch(source,this.targets,false);
};

World.prototype.animatePortals=function(sim,time){
 for(const {cell,actuator,hoops,rings} of this.portalMotion){
  const core=cell.type==='exit',color=actuator?.accent||cell.color,ink=flat(color,.48),fade=flat(color,.20);
  const alarm=core?clamp(1-(time-(sim.coreHits.get(cell.id)??-20))/.85,0,1):0;
  if(actuator){
   const {main,surfaces}=actuator;
   main.rotation.y=time*(this.map.env===0?.72:1.25)+cell.x;
   main.rotation.z=Math.sin(time*21)*alarm*.16;
   main.position.y=1.22+Math.sin(time*2.65+cell.x)*.038-alarm*.10;
   const alert=alarm>.16;
   if(alert!==actuator.alert){
    actuator.alert=alert;
    for(const [part,material] of surfaces)part.material=alert?mat('#ff875d',.43):material;
   }
  }
  if(!hoops.length){
   for(let i=0;i<2;i++){
    const hoop=torus(this.units,core?.44:.34,.014,i?fade:ink,cell.x,.63,cell.z);
    hoops.push(hoop);
    const plate=box(this.units,.47,.026,.03,ink,cell.x,.74,cell.z+.118);
    rings.push(plate);
   }
  }
  for(let i=0;i<hoops.length;i++){
   const phase=(time*(core?.58:.95)+i*.5+cell.id*.113)%1;
   const h=hoops[i],scan=rings[i];
   h.position.y=.63+phase*(core?1.02:.36);
   h.scale.setScalar(core?1.19-phase*.42:.92+phase*.29);
   h.visible=sim.core>0;h.material=alarm>.24?flat('#ff936e',.72):i?fade:ink;
   scan.position.y=.71+phase*.43;scan.visible=!core;
  }
 }
};


World.prototype.drawAirways=function(sim,ui){
 const selected=sim.towers.get(ui.selected?.cell);
 const planning=ui.placement==='tower:gun'||!ui.placement&&selected?.type==='gun';
 const paths=new Map();
 if(planning&&!sim.ended){
  const nextWave=Boolean(ui.forecastNext&&sim.active&&sim.wave<sim.map.waves);
  const n=Math.min(sim.map.waves,sim.wave+(sim.active&&!nextWave?0:1));
  if(this.airPlan?.wave!==n)this.airPlan={wave:n,entries:wavePlan(sim.map,n).filter(e=>e.type==='flying').map(e=>e.entry)};
  const arrivals=sim.active&&!nextWave?sim.queue.filter(e=>e.type==='flying').map(e=>e.entry):this.airPlan.entries;
  for(const i of arrivals){
   const from=sim.map.entries[i],to=sim.airExit(from);
   paths.set(i+':'+to.id,{from,to});
  }
  for(const e of sim.enemies)if(!nextWave&&e.spec.air&&!e.dead){
   const from=sim.map.entries[e.entry],to=sim.map.cells[e.dest];
   paths.set(e.entry+':'+to.id,{from,to});
  }
 }
 const sig=[...paths.keys()].join('|');
 if(this.airSignature===sig)return;
 this.airSignature=sig;
 this.airways.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
 this.airways.clear();
 document.getElementById('wirelessLegend').hidden=!paths.size;
 const source=group(null);
 for(const {from,to} of paths.values()){
  const dx=to.x-from.x,dz=to.z-from.z,length=Math.hypot(dx,dz);
  const color=flat(from.color,.42),bearing=Math.atan2(dx,dz);
  for(let step=.28;step<length-.18;step+=.49){
   const k=step/length;
   box(source,.049,.018,.235,color,from.x+k*dx,1.62,from.z+k*dz).rotation.y=bearing;
  }
 }
 batch(source,this.airways,false);
};

World.prototype.drawEnemyTrack=function(sim,ui){
 const e=sim.enemies.find(x=>!x.dead&&x.uid===ui.selected?.enemy);
 let count=0;
 if(e&&!ui.placement){
  const trail=sim.enemyTrail(e);
  const y=e.spec.air?1.65:.342;
  for(let i=1;i<trail.length;i++){
   const a=trail[i-1],b=trail[i],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);
   if(d<.10)continue;
   for(let at=.16;at<d;at+=.30){
    const k=at/d;
    this.temp.position.set(a.x+k*dx,y,a.z+k*dz);
    this.temp.rotation.set(0,Math.atan2(dx,dz),0);this.temp.scale.set(1,1,1);this.temp.updateMatrix();
    this.enemyTrack.setMatrixAt(count++,this.temp.matrix);
   }
  }
 }
 this.enemyTrack.count=count;this.enemyTrack.instanceMatrix.needsUpdate=Boolean(count);
 const legend=document.getElementById('enemyTrailLegend');
 legend.hidden=!count;
};

World.prototype.drawLogBeacon=function(sim,ui){
 if(!this.logBeacon){
  const root=group(this.outer);
  const ring=torus(root,.46,.017,flat('#e8ff95',.74),0,0,0);
  const upper=torus(root,.37,.012,flat('#e8ff95',.40),0,.075,0);
  this.logBeacon={root,ring,upper};
 }
 const {root,ring,upper}=this.logBeacon,marker=ui.locator;
 root.visible=Boolean(marker);
 if(!marker)return;
 const c=sim.map.cells[marker.id],t=marker.age;
 root.position.set(c.x,c.type==='exit'?.76:c.type==='entry'?.65:.54,c.z);
 ring.scale.setScalar(.87+t*.57);
 ring.material=flat('#e8ff95',Math.max(.13,Math.round((1-t)*7)/8));
 upper.scale.setScalar(1+(t*3%1)*.31);
 upper.position.y=.07+Math.sin(t*Math.PI)*.14;
};

World.prototype.legacyCoupler=function(layer,c,map,temporary){
 const {x,z}=c,ink=flat(temporary?'#ffc583':'#d99b56',.89);
 let dx=0,dz=1;
 if(c.edges.length){
  const n=map.cells[c.edges[0]];dx=n.x-x;dz=n.z-z;
 }
 const angle=Math.atan2(dx,dz),level=temporary?.288:.242;
 const coupler=group(layer,x,level,z);coupler.rotation.y=angle;
 for(const sign of [-1,1]){
  if(!temporary)beveled(coupler,.093,.078,.57,.016,mat('#51413e'),sign*.265,.022,0);
  for(const along of [-.20,.06,.29])box(coupler,.056,.016,.092,ink,sign*.263,.056,along);
 }
 if(!temporary){
  for(const ahead of [-.29,.29])box(coupler,.418,.014,.044,ink,0,.014,ahead);
 }else{
  for(const d of [-1,0,1])box(coupler,.298,.018,.035,ink,0,.017,d*.16).rotation.y=.66;
 }
};
World.prototype.facilities=function(source,background,map,P){
 const dark=mat(P.side),frame=mat(P.board),accent=flat(map.color,.79),muted=flat(map.color,.36);
 if(map.env===0){
  for(const [x,z] of [[4.52,-.43],[9.55,-.43],[10.55,6.58]]){
   const cabinet=group(source,x,.61,z);
   for(const d of [-1,1]){
    beveled(cabinet,.12,.60,.15,.024,frame,d*.42,.28,0);
    box(cabinet,.052,.39,.028,accent,d*.42,.30,.082);
   }
   box(cabinet,.91,.092,.18,dark,0,.59,0);
   for(let i=0;i<5;i++)box(cabinet,.092,.024,.088,muted,-.31+i*.155,.649,0);
  }
 }else if(map.env===1){
  for(const x of [3,6,11]){
   for(const d of [-1,1]){
    const strut=group(background,x+d*.47,-.7,5.5);
    beveled(strut,.11,.28,2.21,.042,frame,0,-.15,0);
    box(strut,.056,.03,2.19,muted,0,.02,0);
    for(const z of [-.95,.95]){
     beveled(strut,.25,.89,.29,.045,dark,0,-.39,z);
     box(strut,.16,.056,.15,accent,0,.07,z);
    }
   }
  }
 }else{
  const floor=group(background,7,-2.11,5);
  for(const d of [-1,1]){
   box(floor,3.78,.063,.11,frame,0,0,d*1.71);
   box(floor,.11,.063,3.44,frame,d*1.88,0,0);
   for(const k of [-1,1]){
    const x=d*1.88,z=k*1.71;
    cyl(floor,.105,.145,.43,8,dark,x,.20,z);
    cyl(floor,.14,.14,.07,8,accent,x,.43,z);
    torus(floor,.145,.012,muted,x,.49,z);
   }
  }
  for(const z of [-.47,.47])for(const d of [-1,1]){
   box(floor,1.16,.085,.112,mat('#715846'),d*1.15,.19,z);
   box(floor,1.11,.019,.042,muted,d*1.15,.243,z);
  }
 }
};

World.prototype.drawSkillTargets=function(sim,ui){
 const tower=sim.towers.get(ui.selected?.cell);
 const active=!ui.placement&&tower&&TOWERS[tower.type].skill&&tower.enc<=sim.time&&tower.skillAt<=sim.time;
 const targets=active?sim.skillTargets(tower):[];
 const legend=document.getElementById('skillLegend');
 legend.hidden=targets.length===0;
 if(targets.length)legend.style.setProperty('--ability-color',tower.type==='repair'?'#8afbd0':'#ff9bd0');
 const color=tower?.type==='repair'?'#8afbd0':'#ff9bd0';
 for(let i=0;i<targets.length;i++){
  const target=targets[i];
  let marker=this.skillMarks[i];
  if(!marker){
   const root=group(this.outer),points=[];
   for(let k=0;k<4;k++){
    const a=k*TAU/4;
    const side=group(root,Math.sin(a)*.40,0,Math.cos(a)*.40);
    side.rotation.y=a;
    points.push(box(side,.135,.018,.037,flat(color,.68),-.068,0,0));
    points.push(box(side,.036,.018,.095,flat(color,.68),0,0,-.03));
   }
   this.skillMarks.push(marker={root,points});
  }
  const platform=target.id!==undefined&&sim.map.cells[target.id].type==='platform';
  marker.root.position.set(target.x,platform?.51:target.spec?.air?target.y:.40,target.z);
  marker.root.rotation.y=sim.time*.33+target.uid*.55;
  marker.root.visible=true;
  const locked=!target.spec&&target.enc>sim.time;
  const ink=flat(locked?'#edcb7a':color,.73);
  for(const part of marker.points)part.material=ink;
 }
 for(let i=targets.length;i<this.skillMarks.length;i++)this.skillMarks[i].root.visible=false;
};

World.prototype.drawLaneReport=function(sim,ui){
 const {lane}=ui.selected||{};
 const totals=[0,0];
 if(lane!==undefined&&!ui.placement){
  const route=sim.laneReport(lane);
  for(let i=0;i<route.routeCells.length;i++){
   const c=route.routeCells[i],from=route.routeCells[i-1]||route.inlet,to=route.routeCells[i+1]||route.exit;
   const angle=Math.atan2(to.x-from.x,to.z-from.z);
   const index=route.covered.has(c.id)?0:1,layer=this.laneMarks[index];
   for(const side of [-1,1]){
    const offset=side*.278,y=c.type==='node'?.542:.346;
    this.temp.position.set(c.x+Math.cos(angle)*offset,y,c.z-Math.sin(angle)*offset);
    this.temp.rotation.set(0,angle,0);this.temp.scale.setScalar(1);this.temp.updateMatrix();
    layer.setMatrixAt(totals[index]++,this.temp.matrix);
   }
  }
 }
 for(let i=0;i<totals.length;i++){
  this.laneMarks[i].count=totals[i];
  if(totals[i])this.laneMarks[i].instanceMatrix.needsUpdate=true;
 }
 document.getElementById('laneCoveredLegend').hidden=!totals[0];
 document.getElementById('laneGapLegend').hidden=!totals[1];
};
