(() => {
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const CELL = 1.48, UP = new THREE.Vector3(0,1,0);
const COLORS = {A:0x55efd5,B:0xf0ad5e,C:0xb58af4};
const CSS_COLORS = {A:'#55efd5',B:'#f0ad5e',C:'#b58af4'};
const ICONS = {firewall:'firewall',honey:'honey',gate:'gate',interceptor:'interceptor',sandbox:'sandbox',repair:'repair',worm:'worm',flood:'flood',trojan:'trojan',ransom:'ransom',hotspot:'hotspot',packer:'packer',boss:'boss',isolate:'isolate',downgrade:'downgrade',backup:'backup'};
const TOWERS = {
 firewall:{name:'防火墙',role:'阻挡 · 链路 / 节点',cost:90,intel:0,hp:260,range:1.25,desc:'在链路上阻挡最多 2 个单位容量并还击。部署于交换节点时隔离节点，同时拦截相邻链路。',upgrade:120,skill:null},
 honey:{name:'蜜罐',role:'诱敌阻挡 · 仅链路',cost:70,intel:0,hp:145,range:2.4,desc:'伪造应答吸引附近地面攻塔单位，替其他塔承受攻击。免疫加密；主动「诱捕」困住被诱来的敌人。',upgrade:80,skill:'诱捕'},
 gate:{name:'网闸',role:'节点隔离 · 不攻击',cost:55,intel:2,hp:380,range:0,desc:'低成本、高耐久的节点隔离设备。改变路由但不攻击；遭受洪泛团冲击时尤其脆弱。',upgrade:70,skill:null},
 interceptor:{name:'拦截器',role:'定向远程 · 对地 / 对空',cost:110,intel:0,hp:150,range:4.4,desc:'仅攻击朝向扇区内的目标，优先拦截最接近出口者。二级可选择贯穿弹道或压制减速。',upgrade:105,skill:null},
 sandbox:{name:'沙箱',role:'检测 · 地面范围攻击',cost:125,intel:0,hp:165,range:3.05,desc:'持续检测范围内伪装和潜伏目标，显形后进行范围攻击。可伤及未显形木马，但会触发其载荷。',upgrade:110,skill:null},
 repair:{name:'修复进程',role:'治疗 · 解除加密',cost:95,intel:0,hp:175,range:3.25,desc:'持续恢复范围内其他受损塔的生命。主动「冗余切换」提供护盾并解除附近友塔加密。',upgrade:95,skill:'冗余切换'}
};
const ENEMIES = {
 worm:{name:'蠕虫',icon:'worm',hp:58,speed:1.0,damage:10,reward:9,leak:6,desc:'被阻挡时持续近战攻塔；首次经过直通交换节点复制一个不再复制的同伴。'},
 flood:{name:'洪泛团',icon:'flood',hp:230,speed:.56,damage:27,reward:22,leak:12,desc:'占用 3 点阻挡容量。主动向被隔离节点的可通行一侧移动，重击隔离设备，打通后重新寻路。'},
 trojan:{name:'木马',icon:'trojan',hp:105,speed:.8,damage:8,reward:17,leak:9,desc:'伪装成正常数据包，显形前无法被远程单体主动选中。未显形就被范围攻击消灭时释放载荷，伤害附近塔。'},
 ransom:{name:'勒索者',icon:'ransom',hp:130,speed:.65,damage:9,reward:21,leak:10,desc:'移动中远程攻击范围内设备，优先选择蜜罐。命中造成伤害并施加 4 秒加密，使塔停止攻击、治疗与技能。'},
 hotspot:{name:'伪热点',icon:'hotspot',hp:80,speed:1.18,damage:0,reward:16,leak:8,desc:'沿无线层从入口直飞出口，不受地面道路和阻挡影响。仅拦截器能够主动攻击。'},
 packer:{name:'加壳器',icon:'packer',hp:165,speed:.62,damage:5,reward:24,leak:11,desc:'周期性为附近同伴添加可打破的护盾。自身防御有限，是群体推进中的优先支援目标。'},
 boss:{name:'核心威胁',icon:'boss',hp:1900,speed:.34,damage:35,reward:200,leak:35,desc:'每张地图最终波的核心威胁，拥有独立阶段和改变道路的能力。'}
};
const ITEMS = {
 isolate:{name:'应急隔离器',icon:'isolate',cost:3,currency:'intel',cd:18,target:'直通交换节点',desc:'临时隔离一个直通节点，持续 14 秒。具有 150 点耐久，会被冲毁，不产生持续情报。'},
 downgrade:{name:'协议降级',icon:'downgrade',cost:2,currency:'intel',cd:16,target:'链路区域 · 半径 2 格',desc:'范围内链路暂时使用旧协议 12 秒：地面敌人减速、木马显形，所有地面路线按新速度重新收敛。'},
 backup:{name:'备份还原',icon:'backup',cost:65,currency:'cpu',cd:14,target:'一座受损友塔',desc:'恢复目标 45% 最大生命并解除加密。不能复活已经摧毁的设备。'}
};
const BOSS_NAMES = ['万傀','蜃楼','蛰影'];
const MAP_META = [
 {name:'分段内网',en:'SEGMENTED INTRANET',kind:'企业内网',waves:14,code:'SECTOR 01',desc:'门户网站与邮件网关接入 DMZ。利用办公网段、业务网段和外围灾备环，在核心数据库前重新分配攻防压力。',features:['DMZ 互联','旧协议链路','外围灾备环'],entries:[{id:'A',name:'门户网站'},{id:'B',name:'邮件网关'}],cores:[{id:'X',name:'核心数据库'}],boss:'万傀'},
 {name:'骨干流域',en:'BACKBONE BASIN',kind:'跨网骨干',waves:15,code:'SECTOR 02',desc:'互联网、分支专线与云端互联跨越高危公网流。双活数据中心互为备份，汇聚节点的得失会重写交战分布。',features:['公网流','专线隧道','双活数据中心'],entries:[{id:'A',name:'互联网'},{id:'C',name:'分支专线'},{id:'B',name:'云端互联'}],cores:[{id:'X',name:'数据中心 X'},{id:'Y',name:'数据中心 Y'}],boss:'蜃楼'},
 {name:'气隙深层',en:'AIRGAP DEPTHS',kind:'工控网络',waves:16,code:'SECTOR 03',desc:'三侧远程接入围绕中央气隙部署。狭窄运维环与老工控总线彼此牵制，过程控制与安全联锁核心都需要守住。',features:['中央气隙','运维环','双核心联锁'],entries:[{id:'A',name:'运维跳板机'},{id:'B',name:'办公网下行'},{id:'C',name:'供应商远程维护'}],cores:[{id:'X',name:'过程控制核心'},{id:'Y',name:'安全联锁核心'}],boss:'蛰影'}
];
function key(x,z){return `${x},${z}`}
function pathCells(set,coords){for(const [x,z] of coords)set.add(key(x,z))}
function lineCells(set,x1,z1,x2,z2){if(x1===x2){for(let z=Math.min(z1,z2);z<=Math.max(z1,z2);z++)set.add(key(x1,z))}else{for(let x=Math.min(x1,x2);x<=Math.max(x1,x2);x++)set.add(key(x,z1))}}
function makeMap(index){
 let w=index===0?13:14,h=index===0?11:(index===1?11:12), links=new Set(), nodes=[], old=new Set(), platforms=[], entries={}, cores={};
 const L=(x1,z1,x2,z2)=>lineCells(links,x1,z1,x2,z2);
 if(index===0){
  L(1,0,1,10);L(11,0,11,10);L(1,2,11,2);L(1,5,11,5);L(1,8,11,8);L(1,9,11,9);L(6,2,6,10);L(1,10,6,10);L(6,10,11,10);
  nodes=[[1,3],[6,5],[11,5],[6,6],[6,8]];
  for(let z=6;z<=9;z++){old.add(key(1,z));old.add(key(11,z))}for(let x=2;x<=4;x++)old.add(key(x,8));
  platforms=[[3,0],[4,1],[8,1],[9,0],[3,3],[4,4],[8,4],[9,3],[3,6],[4,7],[8,7],[9,6],[3,10],[9,10]];
  entries={A:{x:1,z:0},B:{x:11,z:0}};cores={X:{x:6,z:10}};
 }else if(index===1){
  L(1,0,1,3);L(12,0,12,3);L(6,0,6,8);L(1,3,12,3);L(2,2,10,2);L(2,3,2,9);L(10,3,10,8);L(2,6,10,6);L(2,8,10,8);L(3,6,3,9);L(10,8,10,9);L(2,9,3,9);
  nodes=[[2,4],[6,3],[6,6],[6,8],[3,8]];
  for(let z=2;z<=8;z++)old.add(key(6,z));
  platforms=[[0,1],[3,1],[8,0],[10,1],[0,5],[4,4],[8,5],[12,5],[5,7],[8,7],[5,9],[7,9],[12,9]];
  entries={A:{x:1,z:0},C:{x:6,z:0},B:{x:12,z:0}};cores={X:{x:3,z:9},Y:{x:10,z:9}};
 }else{
  L(1,0,1,2);L(12,0,12,2);L(6,0,6,2);L(1,2,12,2);L(2,1,11,1);L(2,2,2,10);L(11,2,11,10);L(4,1,4,10);L(9,1,9,10);L(2,4,4,4);L(9,4,11,4);L(2,7,4,7);L(9,7,11,7);L(2,9,11,9);L(2,10,4,10);L(9,10,11,10);L(3,9,3,10);L(10,9,10,10);
  nodes=[[2,4],[2,7],[4,4],[4,7],[11,4],[11,7],[6,2],[3,9],[10,9]];
  for(let z=3;z<=8;z++){old.add(key(4,z));old.add(key(9,z))}for(let x=5;x<=8;x++)old.add(key(x,9));old.add(key(2,10));old.add(key(11,10));
  platforms=[[0,0],[3,0],[9,0],[13,1],[0,4],[3,5],[6,3],[7,6],[10,5],[13,6],[1,8],[6,10],[7,11],[12,9]];
  entries={A:{x:1,z:0},B:{x:12,z:0},C:{x:6,z:0}};cores={X:{x:3,z:10},Y:{x:10,z:10}};
 }
 const cells=[];
 for(let z=0;z<h;z++)for(let x=0;x<w;x++){
  let type=links.has(key(x,z))?'link':'empty';
  if(nodes.some(n=>n[0]===x&&n[1]===z))type='node';
  if(platforms.some(n=>n[0]===x&&n[1]===z))type='platform';
  let entry=Object.keys(entries).find(id=>entries[id].x===x&&entries[id].z===z);
  let core=Object.keys(cores).find(id=>cores[id].x===x&&cores[id].z===z);
  if(entry)type='entry';if(core)type='core';
  cells.push({x,z,key:key(x,z),type,old:old.has(key(x,z)),entry,core,tower:null,blockedUntil:0,cooldownUntil:0,mesh:null});
 }
 return {index,w,h,cells,entries,cores,nodes:nodes.map(n=>key(...n)),meta:MAP_META[index]};
}
const state={screen:'menu',mapIndex:0,map:null,running:false,paused:false,speed:1,time:0,realTime:0,wave:0,waveActive:false,nextWave:0,cpu:360,intel:8,core:100,selected:null,hover:null,dragType:null,pending:null,itemMode:null,itemCooldown:{isolate:0,downgrade:0,backup:0},enemies:[],towers:[],projectiles:[],effects:[],telegraphs:[],spawnQueue:[],routes:{},previewRoutes:null,degraded:[],bossLocks:[],kills:0,leaks:0,lost:0,reroutes:0,earned:0,startTime:0,lastFrame:0,demo:null,exportMode:false,exportFps:30,exportLastFrame:-1,shake:0,idCounter:1,routeDirty:true,intelTimer:0,musicTimer:0};
let scene,camera,renderer,world,boardGroup,unitGroup,effectGroup,routeGroup,decorGroup,ghostGroup,raycaster,mouse,groundPlane;
let cameraRig={theta:-.58,phi:.83,radius:24,target:new THREE.Vector3(0,0,0),desiredTarget:new THREE.Vector3(),desiredRadius:24};
let pointer={x:0,y:0,down:false,button:0,lastX:0,lastY:0,moved:false};
let materials={},shared={},animated=[],routePackets=[],ambientParticles=[],ambientTraffic=[],protocolScans=[];
function rng(seed){let s=seed|0;return()=>{s=Math.imul(48271,s)%2147483647;return(s&2147483647)/2147483647}}
let random=rng(713);
function mat(color,opts={}){const m=new THREE.MeshStandardMaterial({color,roughness:opts.roughness??.55,metalness:opts.metalness??.5,emissive:opts.emissive||0x000000,emissiveIntensity:opts.emissiveIntensity??.5,transparent:!!opts.transparent,opacity:opts.opacity??1,side:opts.side||THREE.FrontSide,depthWrite:opts.depthWrite??true});m.color.convertSRGBToLinear();m.emissive.convertSRGBToLinear();return m}
function circuitTexture(kind){
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.fillStyle=kind==='old'?'#e0d7c8':kind==='empty'?'#c1cdcf':'#e1e9e7';ctx.fillRect(0,0,256,256);ctx.strokeStyle=kind==='old'?'rgba(103,73,43,.42)':'rgba(35,83,88,.32)';ctx.lineWidth=2;ctx.strokeRect(10,10,236,236);ctx.lineWidth=1;
 for(let i=0;i<12;i++){const x=24+((i*47)%190),y=24+((i*71)%190);ctx.beginPath();ctx.moveTo(x,18);ctx.lineTo(x,y);ctx.lineTo(Math.min(234,x+28+(i%3)*13),y);ctx.lineTo(Math.min(234,x+28+(i%3)*13),Math.min(238,y+24));ctx.stroke();ctx.fillStyle='rgba(29,68,72,.42)';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill()}
 if(kind==='empty'){for(let i=0;i<9;i++){ctx.fillStyle='rgba(24,49,55,.28)';ctx.fillRect(58,64+i*13,140,4)}}
 if(kind==='platform'){ctx.strokeStyle='rgba(35,92,94,.5)';ctx.lineWidth=4;ctx.strokeRect(24,24,208,208);for(const x of [28,228])for(const y of [28,228]){ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.stroke()}}
 if(kind==='old'){ctx.strokeStyle='rgba(130,78,35,.5)';for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(30+i*35,230);ctx.lineTo(60+i*35,200);ctx.stroke()}}
 ctx.fillStyle='rgba(29,67,72,.5)';ctx.font='10px monospace';ctx.fillText({link:'LINK / L7',node:'SWITCH',old:'LEGACY',platform:'REMOTE',empty:'FACILITY'}[kind]||'LINK',20,238);
 const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return tex;
}
function applySurfaceTextures(){for(const k of ['link','node','old','platform','empty']){materials[k].map=circuitTexture(k);materials[k].needsUpdate=true}}
function mesh(geo,material,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;if(parent)parent.add(m);return m}
function box(parent,sx,sy,sz,material,x=0,y=0,z=0){return mesh(new THREE.BoxGeometry(sx,sy,sz),material,parent,x,y,z)}
function cyl(parent,rt,rb,h,material,x=0,y=0,z=0,n=12){return mesh(new THREE.CylinderGeometry(rt,rb,h,n),material,parent,x,y,z)}
function sphere(parent,r,material,x=0,y=0,z=0,detail=1){return mesh(new THREE.IcosahedronGeometry(r,detail),material,parent,x,y,z)}
function torus(parent,r,t,material,x=0,y=0,z=0){const m=mesh(new THREE.TorusGeometry(r,t,6,32),material,parent,x,y,z);m.rotation.x=Math.PI/2;return m}
function worldPos(cell,y=0){return new THREE.Vector3((cell.x-(state.map?.w-1||12)/2)*CELL,y,(cell.z-(state.map?.h-1||10)/2)*CELL)}
function getCell(x,z){return state.map?.cells.find(c=>c.x===x&&c.z===z)}
function icon(id,cls=''){return `<svg class="${cls}"><use href="#i-${ICONS[id]||id}"/></svg>`}
function initThree(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0x06141c);scene.fog=new THREE.FogExp2(0x06141c,.018);
 camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,180);
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;$('#scene').appendChild(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0x8dc8c7,0x050b12,.65));const sun=new THREE.DirectionalLight(0xd7fff5,1.35);sun.position.set(-10,22,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;sun.shadow.bias=-.0008;scene.add(sun);
 const rim=new THREE.DirectionalLight(0x2988bb,.48);rim.position.set(12,6,-12);scene.add(rim);const warm=new THREE.PointLight(0xf0a45f,.45,35);warm.position.set(-8,5,-5);scene.add(warm);
 world=new THREE.Group();scene.add(world);boardGroup=new THREE.Group();routeGroup=new THREE.Group();unitGroup=new THREE.Group();effectGroup=new THREE.Group();decorGroup=new THREE.Group();ghostGroup=new THREE.Group();world.add(boardGroup,routeGroup,unitGroup,effectGroup,decorGroup,ghostGroup);
 raycaster=new THREE.Raycaster();mouse=new THREE.Vector2();groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
 materials={link:mat(0x16343c,{metalness:.65,roughness:.48}),node:mat(0x22444b,{metalness:.7}),old:mat(0x423b31,{metalness:.4,roughness:.8}),platform:mat(0x1b3c46,{metalness:.75}),empty:mat(0x0b2029,{metalness:.5,roughness:.8}),edge:mat(0x244b54,{emissive:0x173b42,emissiveIntensity:.25}),cyan:mat(0x59e4ce,{emissive:0x1db9a4,emissiveIntensity:1.2,metalness:.35}),dark:mat(0x102832,{metalness:.8}),white:mat(0xc2d8d5,{metalness:.55,roughness:.32}),amber:mat(0xe8a45a,{emissive:0xa45b20,emissiveIntensity:.65}),violet:mat(0xa879dc,{emissive:0x6a36a5,emissiveIntensity:.8}),red:mat(0xe2545d,{emissive:0x9d202b,emissiveIntensity:.65}),blue:mat(0x58a9df,{emissive:0x236ea8,emissiveIntensity:.8}),green:mat(0x6be5a0,{emissive:0x28945c,emissiveIntensity:.8}),glass:mat(0x55d9da,{transparent:true,opacity:.18,depthWrite:false,emissive:0x1c8e91,emissiveIntensity:.7})};
 applySurfaceTextures();shared={tile:new THREE.BoxGeometry(CELL*.93,.18,CELL*.93),smallBox:new THREE.BoxGeometry(.18,.18,.18),packet:new THREE.OctahedronGeometry(.075),sphere:new THREE.IcosahedronGeometry(.1,1)};
 buildEnvironment();buildMap(0,true);updateCamera(1);
 renderer.domElement.addEventListener('pointerdown',onPointerDown);window.addEventListener('pointermove',onPointerMove);window.addEventListener('pointerup',onPointerUp);renderer.domElement.addEventListener('wheel',onWheel,{passive:false});renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
 window.addEventListener('resize',onResize);
}
function clearGroup(group){while(group.children.length){const o=group.children.pop();o.traverse?.(n=>{if(n.geometry&&!Object.values(shared).includes(n.geometry))n.geometry.dispose?.();if(n.material&&!Object.values(materials).includes(n.material)){if(Array.isArray(n.material))n.material.forEach(m=>m.dispose());else n.material.dispose?.()}})}}
function buildEnvironment(){
 const base=box(decorGroup,65,.3,65,mat(0x071921,{roughness:.9}),0,-3.1,0);base.receiveShadow=true;
 for(let i=0;i<4;i++){const grid=new THREE.GridHelper(65,45,i===0?0x17424a:0x12323d,i===0?0x12323a:0x0e2831);grid.position.y=-2.85-i*.75;grid.material.transparent=true;grid.material.opacity=.24-i*.035;decorGroup.add(grid)}
 const pgeo=new THREE.BufferGeometry(),positions=[];for(let i=0;i<380;i++)positions.push((random()-.5)*65,random()*15-2,(random()-.5)*65);pgeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));const points=new THREE.Points(pgeo,new THREE.PointsMaterial({color:0x4aaca9,size:.035,transparent:true,opacity:.45}));decorGroup.add(points);ambientParticles.push(points);
 for(let i=0;i<25;i++){const a=random()*Math.PI*2,r=14+random()*20,x=Math.cos(a)*r,z=Math.sin(a)*r;const cluster=new THREE.Group();cluster.position.set(x,-1.6-random()*2,z);for(let j=0;j<3+random()*5;j++){box(cluster,.25+random()*.5,.15+random()*1.8,.25+random()*.5,materials.dark,(random()-.5)*1.8,0,(random()-.5)*1.8)}const dot=sphere(cluster,.06,materials.cyan,0,.6,0);dot.castShadow=false;decorGroup.add(cluster)}
 for(let i=0;i<14;i++){const a=i/14*Math.PI*2,r=17+(i%4)*3,A=new THREE.Vector3(Math.cos(a)*r,-.7+(i%3)*.35,Math.sin(a)*r),B=new THREE.Vector3(Math.cos(a+.7)*(r+5),-.5+((i+1)%3)*.3,Math.sin(a+.7)*(r+5));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([A,B]),new THREE.LineBasicMaterial({color:i%3===0?0x8b6fc4:0x2a8c91,transparent:true,opacity:.22}));decorGroup.add(line);for(let j=0;j<2;j++){const p=mesh(shared.packet,new THREE.MeshBasicMaterial({color:i%3===0?0xc29aff:0x63e9d9,toneMapped:false}),decorGroup);p.castShadow=false;ambientTraffic.push({mesh:p,a:A,b:B,offset:i*.17+j*.5,speed:.035+(i%4)*.008})}}
 for(let i=0;i<4;i++){const scan=box(decorGroup,24,.012,.07,new THREE.MeshBasicMaterial({color:0x45b7b4,transparent:true,opacity:.22,toneMapped:false}),0,-2.68-i*.19,0);scan.castShadow=false;protocolScans.push({mesh:scan,offset:i*.23})}
}
function buildMap(index,idle=false){
 clearGroup(boardGroup);clearGroup(routeGroup);clearGroup(unitGroup);clearGroup(effectGroup);clearGroup(ghostGroup);routePackets=[];animated=[];
 state.map=makeMap(index);state.mapIndex=index;const map=state.map;
 const baseW=map.w*CELL+1.2,baseH=map.h*CELL+1.2;
 box(boardGroup,baseW,.5,baseH,mat(index===2?0x101e25:0x0a222b,{metalness:.8,roughness:.55}),0,-.42,0);
 const under=box(boardGroup,baseW*.94,.22,baseH*.94,materials.dark,0,-.8,0);under.rotation.y=.001;
 for(const cell of map.cells){
  const g=new THREE.Group(),p=worldPos(cell);g.position.copy(p);boardGroup.add(g);cell.mesh=g;
  let material=cell.type==='platform'?materials.platform:cell.type==='node'?materials.node:cell.old?materials.old:(cell.type==='empty'?materials.empty:materials.link);
  const tile=mesh(shared.tile,material,g,0,cell.type==='platform'?.25:0,0);tile.userData.cell=cell;cell.hit=tile;
  if(cell.type==='platform'){box(g,CELL*.75,.38,CELL*.75,materials.dark,0,.02,0);for(const sx of [-1,1])for(const sz of [-1,1])cyl(g,.035,.035,.1,materials.cyan,sx*CELL*.32,.42,sz*CELL*.32,6)}
  if(cell.type==='empty'){tile.scale.set(.92,.45,.92);tile.position.y=-.13}
  if(cell.old&&(cell.type==='link'||cell.type==='node')){for(let i=-1;i<=1;i++)box(g,CELL*.65,.018,.025,materials.amber,0,.105,i*.22)}
  if(cell.type==='node')buildNodeVisual(cell,g);
  if(cell.entry)buildEntry(cell,g);
  if(cell.core)buildCore(cell,g);
  if(cell.type==='empty'&&((cell.x*7+cell.z*11+index)%5===0))buildObstacle(cell,g);
 }
 buildMapDecor(index);
 fitCamera(idle);state.routeDirty=true;updateRoutes();
}
function buildNodeVisual(cell,g){
 const ring=torus(g,.42,.035,materials.cyan,0,.14,0);ring.userData.spin=.25;animated.push(ring);cell.ring=ring;
 cyl(g,.3,.36,.13,materials.dark,0,.16,0,8);const n=box(g,.32,.18,.32,materials.white,0,.28,0);n.rotation.y=Math.PI/4;
 for(let i=0;i<4;i++){const a=i*Math.PI/2;box(g,.09,.05,.09,materials.cyan,Math.cos(a)*.45,.14,Math.sin(a)*.45)}
 cell.statusLight=sphere(g,.075,materials.cyan,0,.47,0);
}
function buildEntry(cell,g){
 const color=COLORS[cell.entry],m=mat(color,{emissive:color,emissiveIntensity:.85});
 const gate=new THREE.Group();gate.position.y=.15;g.add(gate);for(const s of [-1,1]){box(gate,.15,.9,.18,materials.dark,s*.49,.45,0);box(gate,.08,.6,.1,m,s*.49,.48,.02)}box(gate,1.12,.14,.24,materials.dark,0,.9,0);box(gate,.82,.035,.12,m,0,.92,.03);
 const ring=torus(g,.58,.025,m,0,.14,0);ring.userData.spin=.4;animated.push(ring);
 cell.label=makeLabel(`${cell.entry}  ${state.map.meta.entries.find(e=>e.id===cell.entry).name}`,CSS_COLORS[cell.entry]);cell.label.position.set(0,1.55,0);g.add(cell.label);
}
function buildCore(cell,g){
 const core=new THREE.Group();core.position.y=.12;g.add(core);cyl(core,.58,.68,.25,materials.dark,0,.12,0,8);cyl(core,.4,.48,.35,materials.white,0,.38,0,8);const crystal=sphere(core,.34,materials.blue,0,.88,0,1);crystal.scale.y=1.4;animated.push(crystal);crystal.userData.float=.12;
 for(let i=0;i<3;i++){const ring=torus(core,.48+i*.09,.022,materials.cyan,0,.72+i*.17,0);ring.rotation.x=Math.PI/2+(i-1)*.35;ring.userData.spin=(i%2?1:-1)*.6;animated.push(ring)}
 const light=new THREE.PointLight(0x55b9ff,1.4,4);light.position.y=1;core.add(light);cell.label=makeLabel(`${cell.core==='X'&&state.mapIndex===0?'中枢':cell.core}  ${state.map.meta.cores.find(e=>e.id===cell.core).name}`,'#76c9ff');cell.label.position.set(0,1.75,0);g.add(cell.label);
}
function buildObstacle(cell,g){
 const style=state.mapIndex;if(style===0){for(let i=0;i<2;i++){const rack=box(g,.38,.65+random()*.5,.55,materials.dark,(i-.5)*.48,.3,0);for(let j=0;j<4;j++)box(g,.25,.025,.012,materials.cyan,(i-.5)*.48,.18+j*.12,.282)}}else if(style===1){cyl(g,.26,.33,.75,materials.dark,0,.25,0,10);torus(g,.3,.025,materials.amber,0,.5,0)}else{box(g,.85,.35,.85,materials.dark,0,.1,0);for(let i=0;i<3;i++)cyl(g,.08,.08,.65,materials.white,(i-1)*.23,.4,0,8)}
}
function buildMapDecor(index){
 if(index===0){
  for(const x of [-1,1]){const g=new THREE.Group();g.position.set(x*(state.map.w*CELL/2+1.25),0,0);for(let z=-5;z<=5;z+=2){box(g,.78,1.28,.96,materials.dark,0,.18,z);box(g,.64,1.12,.035,materials.edge,0,.2,.49+z);for(let j=0;j<6;j++){box(g,.5,.09,.045,materials.white,-.03,-.25+j*.17,.52+z);box(g,.12,.025,.018,materials.dark,-.17,-.25+j*.17,.55+z)}const fan=torus(g,.24,.025,materials.white,0,.84,z);fan.userData.spin=1.4;animated.push(fan);const led=sphere(g,.045,new THREE.MeshBasicMaterial({color:z%4?0x62efcf:0xf0ad5e}),.23,.48,.54+z);led.userData.blink=z*.3;animated.push(led)}box(g,.09,.09,12,materials.amber,-x*.46,-.25,0);boardGroup.add(g)}
  const dmz=makeLabel('DMZ  /  业务隔离区','#70d9cd',.55);dmz.position.set(0,.85,worldPos({x:6,z:2}).z);boardGroup.add(dmz);
 }else if(index===1){
  const flowZ=(4-(state.map.h-1)/2)*CELL,flow=box(boardGroup,state.map.w*CELL+3,.035,1.0,mat(0xb7653c,{transparent:true,opacity:.19,depthWrite:false,emissive:0xb64b28,emissiveIntensity:1}),0,-.12,flowZ);flow.userData.flow=true;animated.push(flow);
  for(let j=0;j<3;j++)box(boardGroup,state.map.w*CELL+3,.012,.025,new THREE.MeshBasicMaterial({color:j===1?0xe9a060:0x64c5c7,transparent:true,opacity:.48,toneMapped:false}),0,-.05,flowZ+(j-1)*.3);
  for(let i=0;i<12;i++){const p=mesh(shared.packet,new THREE.MeshBasicMaterial({color:i%2?0xf3b36c:0x78ddd5,toneMapped:false}),boardGroup,0,.08,flowZ+(i%3-1)*.28);p.userData.publicFlow=i/12;animated.push(p)}
  for(const x of [2,6,10]){const p=worldPos({x,z:4});for(let j=0;j<4;j++){const ring=torus(boardGroup,.62,.025,x===6?materials.amber:(j%2?materials.amber:materials.cyan),p.x,.15+j*.18,p.z);ring.rotation.x=0;ring.userData.spin=x===6?-.35:.35;animated.push(ring)}for(const s of [-1,1])box(boardGroup,.09,.85,.12,materials.white,p.x+s*.66,.4,p.z);box(boardGroup,1.4,.09,.18,x===6?materials.amber:materials.cyan,p.x,.86,p.z)}
 }else{
  const gap=box(boardGroup,4*CELL,.12,5*CELL,mat(0x05090e,{metalness:.1,roughness:1}),0,-.02,.3*CELL);gap.receiveShadow=true;
  for(const x of [-2.05,2.05]){const wall=box(boardGroup,.035,1.0,5*CELL,materials.glass,x*CELL,.5,.3*CELL);wall.castShadow=false;box(boardGroup,.1,.12,5*CELL,materials.amber,x*CELL,.04,.3*CELL)}
  for(let z=3;z<=8;z++){const p=worldPos({x:5,z});box(boardGroup,.04,.75,4*CELL,materials.glass,p.x-.2,.38,p.z)}
  for(let i=0;i<12;i++){const z=(3-(state.map.h-1)/2)*CELL+i*.55;for(const x of [-2.08,2.08]){const stripe=box(boardGroup,.15,.025,.28,i%2?materials.amber:materials.dark,x*CELL,.14,z);stripe.rotation.y=.45}}
  const label=makeLabel('AIR GAP  /  物理气隙','#e9b568',.65);label.position.set(0,1.15,.3*CELL);boardGroup.add(label);
  for(const x of [-1,1])for(const z of [-3,1,4]){const g=new THREE.Group();g.position.set(x*(state.map.w*CELL/2+.9),0,z);cyl(g,.3,.38,.8,materials.dark,0,.25,0,12);for(let j=0;j<3;j++)torus(g,.32,.025,materials.white,0,.05+j*.22,0);const valve=torus(g,.25,.035,materials.amber,0,.75,0);valve.rotation.x=0;valve.userData.spin=.25;animated.push(valve);box(g,.12,.12,.9,materials.white,0,.05,.55);boardGroup.add(g)}
 }
}
function makeLabel(text,color='#a9d8d3',scale=1){
 const c=document.createElement('canvas');c.width=512;c.height=80;const ctx=c.getContext('2d');ctx.fillStyle='rgba(4,18,25,.82)';ctx.fillRect(5,8,502,58);ctx.strokeStyle=color;ctx.globalAlpha=.45;ctx.strokeRect(5.5,8.5,501,57);ctx.globalAlpha=1;ctx.fillStyle=color;ctx.font='500 25px Microsoft YaHei, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,37);const texture=new THREE.CanvasTexture(c);texture.encoding=THREE.sRGBEncoding;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));sprite.scale.set(3.5*scale,.55*scale,1);sprite.renderOrder=20;return sprite;
}
function fitCamera(idle=false){
 if(!state.map)return;const span=Math.max(state.map.w,state.map.h)*CELL;cameraRig.radius=span*(innerWidth<1200?1.5:1.38);cameraRig.desiredRadius=cameraRig.radius;cameraRig.target.set(0,0,0);cameraRig.desiredTarget.set(0,0,0);cameraRig.theta=state.mapIndex===1?-.45:-.58;cameraRig.phi=.81;if(idle){cameraRig.theta=-.78;cameraRig.phi=.92;cameraRig.radius*=1.08}
}
function updateCamera(dt){
 if(state.screen==='menu'){cameraRig.theta+=dt*.018;cameraRig.target.lerp(new THREE.Vector3(1,0,0),Math.min(1,dt*2))}
 else{cameraRig.target.lerp(cameraRig.desiredTarget,Math.min(1,dt*4));cameraRig.radius+= (cameraRig.desiredRadius-cameraRig.radius)*Math.min(1,dt*4)}
 const r=cameraRig.radius,phi=cameraRig.phi,theta=cameraRig.theta;camera.position.set(cameraRig.target.x+r*Math.sin(phi)*Math.cos(theta),cameraRig.target.y+r*Math.cos(phi),cameraRig.target.z+r*Math.sin(phi)*Math.sin(theta));
 if(state.shake>0){camera.position.x+=(random()-.5)*state.shake;camera.position.y+=(random()-.5)*state.shake;state.shake=Math.max(0,state.shake-dt*1.8)}camera.lookAt(cameraRig.target);
}
function onResize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)}

function createHealthBar(parent,y,color=0x65edcf,width=1){
 const group=new THREE.Group();group.position.y=y;parent.add(group);
 const back=new THREE.Sprite(new THREE.SpriteMaterial({color:0x061116,depthTest:false,depthWrite:false}));back.scale.set(width,.075,1);back.renderOrder=30;group.add(back);
 const front=new THREE.Sprite(new THREE.SpriteMaterial({color,depthTest:false,depthWrite:false}));front.scale.set(width*.94,.042,1);front.position.z=.002;front.renderOrder=31;group.add(front);
 group.userData={front,width:width*.94};return group;
}
function createTowerVisual(type,level=1,branch=null){
 const g=new THREE.Group(),parts={spin:[],recoil:null,arms:[],head:null};g.userData.parts=parts;
 const base=cyl(g,.48,.55,.18,materials.dark,0,.09,0,8);cyl(g,.38,.43,.08,materials.white,0,.2,0,8);
 if(type==='firewall'){
  for(const s of [-1,1]){const p=box(g,.25,.85,.35,materials.white,s*.34,.62,0);box(g,.12,.58,.37,materials.cyan,s*.34,.66,.015);parts.arms.push(p)}
  box(g,.58,.14,.22,materials.dark,0,.93,0);const core=sphere(g,.16,materials.amber,0,.61,0);parts.head=core;
  if(level>1){box(g,1.12,.12,.45,materials.dark,0,1.12,0);for(const s of [-1,1])cyl(g,.055,.055,.35,materials.cyan,s*.52,1.24,0,6)}
 }else if(type==='honey'){
  const gem=sphere(g,.37,materials.violet,0,.68,0,1);gem.scale.y=1.35;parts.head=gem;
  for(let i=0;i<3;i++){const ring=torus(g,.43+i*.09,.018,materials.violet,0,.62,0);ring.rotation.x=Math.PI/2+(i-1)*.45;parts.spin.push(ring)}
  for(let i=0;i<4;i++){const a=i*Math.PI/2;const orb=sphere(g,.07,materials.white,Math.cos(a)*.48,.5,Math.sin(a)*.48);parts.arms.push(orb)}
  if(branch==='snare'){for(let i=0;i<6;i++){const a=i*Math.PI/3;const spike=cyl(g,0,.07,.35,materials.violet,Math.cos(a)*.52,.35,Math.sin(a)*.52,5);spike.rotation.z=Math.cos(a)*.7}}
  if(branch==='mirror'){const gem2=sphere(g,.19,materials.violet,.42,.85,0);parts.spin.push(gem2)}
 }else if(type==='gate'){
  for(const s of [-1,1]){box(g,.24,1.0,.36,materials.amber,s*.38,.65,0);box(g,.1,.65,.39,materials.dark,s*.38,.65,0)}
  box(g,.92,.18,.36,materials.white,0,1.14,0);const lock=box(g,.32,.38,.18,materials.amber,0,.62,.22);parts.head=lock;torus(g,.17,.035,materials.amber,0,.9,.22).rotation.x=0;
  if(level>1){for(const s of [-1,1])box(g,.17,.2,.58,materials.amber,s*.5,1.08,0)}
 }else if(type==='interceptor'){
  cyl(g,.31,.4,.35,materials.blue,0,.38,0,10);const head=new THREE.Group();head.position.y=.62;g.add(head);parts.head=head;
  box(head,.65,.26,.52,materials.white,0,.08,0);box(head,.22,.2,.85,materials.dark,0,.15,.42);const barrel=cyl(head,.065,.09,1.0,materials.blue,0,.15,.75,8);barrel.rotation.x=Math.PI/2;parts.recoil=barrel;
  cyl(head,.045,.045,.16,materials.cyan,0,.15,1.25,8).rotation.x=Math.PI/2;
  if(branch==='pierce'){const b2=barrel.clone();b2.position.x=.18;barrel.position.x=-.18;head.add(b2);box(head,.48,.08,.3,materials.blue,0,.38,0)}
  if(branch==='suppress'){const dish=cyl(head,.3,.08,.12,materials.blue,0,.45,0,16);dish.rotation.x=Math.PI/2;torus(head,.24,.025,materials.cyan,0,.45,.08).rotation.x=0}
  if(level>1&&!branch)for(const s of [-1,1])box(g,.16,.35,.35,materials.blue,s*.38,.44,0);
 }else if(type==='sandbox'){
  const chamber=sphere(g,.4,materials.glass,0,.68,0,2);chamber.scale.y=.8;parts.head=chamber;
  const core=sphere(g,.18,materials.amber,0,.68,0);parts.arms.push(core);
  for(let i=0;i<2;i++){const ring=torus(g,.48+i*.1,.025,i?materials.cyan:materials.amber,0,.68,0);ring.rotation.x=Math.PI/2+(i?-.55:.55);parts.spin.push(ring)}
  if(level>1){for(let i=0;i<3;i++){const a=i*Math.PI*2/3;const sensor=sphere(g,.09,materials.cyan,Math.cos(a)*.57,1.03,Math.sin(a)*.57);parts.arms.push(sensor)}}
 }else if(type==='repair'){
  cyl(g,.3,.4,.52,materials.white,0,.45,0,10);const core=sphere(g,.22,materials.green,0,.86,0);parts.head=core;
  const cross=new THREE.Group();cross.position.y=.88;g.add(cross);box(cross,.12,.55,.12,materials.green,0,0,0);box(cross,.55,.12,.12,materials.green,0,0,0);parts.spin.push(cross);
  for(let i=0;i<2;i++){const ring=torus(g,.43+i*.13,.02,materials.green,0,.66+i*.2,0);ring.rotation.x=Math.PI/2+(i?-.4:.4);parts.spin.push(ring)}
  if(level>1){for(const s of [-1,1]){const arm=box(g,.16,.5,.18,materials.white,s*.43,.48,0);parts.arms.push(arm)}}
 }
 const shield=sphere(g,.7,new THREE.MeshBasicMaterial({color:0x69cde8,transparent:true,opacity:0,wireframe:true,depthWrite:false}),0,.65,0,2);shield.visible=false;g.userData.shield=shield;
 const encrypt=torus(g,.62,.035,materials.violet,0,.85,0);encrypt.visible=false;g.userData.encrypt=encrypt;parts.spin.push(encrypt);
 g.userData.health=createHealthBar(g,1.65,0x65edcf,1.05);const status=makeLabel('加密 / ENCRYPTED','#d49aff',.27);status.position.set(0,1.9,0);status.visible=false;g.add(status);g.userData.status=status;
 const select=torus(g,.69,.025,new THREE.MeshBasicMaterial({color:0x8ffff0,transparent:true,opacity:.9,depthWrite:false}),0,.07,0);select.visible=false;g.userData.select=select;
 return g;
}
function createEnemyVisual(type,mapIndex=0){
 const g=new THREE.Group(),parts={segments:[],legs:[],spin:[],head:null,rotors:[]};g.userData.parts=parts;
 if(type==='worm'){
  for(let i=0;i<5;i++){const s=sphere(g,.19+(4-i)*.016,i===0?materials.red:mat(i%2?0x9f3843:0xc44750,{metalness:.35}),0,.3,-i*.24,1);s.scale.y=.8;parts.segments.push(s);if(i<4)for(const side of [-1,1]){const leg=box(g,.23,.035,.05,materials.red,side*.22,.2,-i*.24);leg.rotation.z=side*.4;parts.legs.push(leg)}}
  for(const s of [-1,1]){const ant=cyl(g,.012,.025,.36,materials.red,s*.09,.56,.08,5);ant.rotation.z=s*.35}
 }else if(type==='flood'){
  box(g,.72,.5,.65,materials.red,0,.54,0);box(g,.54,.22,.7,materials.dark,0,.86,0);for(const s of [-1,1]){box(g,.18,.28,.72,materials.amber,s*.43,.55,0);for(const z of [-1,1]){const leg=box(g,.16,.45,.16,materials.dark,s*.37,.23,z*.25);parts.legs.push(leg)}}
  for(let i=0;i<3;i++)box(g,.11,.1,.03,materials.amber,(i-1)*.18,.57,.34);parts.head=g.children[1];
 }else if(type==='trojan'){
  const body=box(g,.58,.45,.72,materials.white,0,.42,0);body.rotation.y=Math.PI/4;parts.head=body;
  const wrap=box(g,.62,.12,.76,materials.cyan,0,.42,0);wrap.rotation.y=Math.PI/4;parts.spin.push(wrap);
  const mane=[];for(let i=0;i<4;i++){const spike=cyl(g,0,.06,.3,materials.red,(i-1.5)*.12,.83,-.12,5);spike.visible=false;mane.push(spike)}g.userData.mane=mane;
  for(const s of [-1,1]){const eye=sphere(g,.045,materials.red,s*.14,.53,.36);eye.visible=false;parts.legs.push(eye)}
 }else if(type==='ransom'){
  const body=sphere(g,.38,materials.violet,0,.57,0,1);body.scale.z=1.2;parts.head=body;
  const lock=box(g,.32,.35,.2,materials.dark,0,.62,.33);box(g,.13,.17,.04,materials.red,0,.62,.45);
  for(let i=0;i<4;i++){const a=(i/4)*Math.PI*2+.7;const leg=new THREE.Group();leg.position.set(Math.cos(a)*.3,.42,Math.sin(a)*.3);g.add(leg);const l=box(leg,.09,.55,.09,materials.dark,0,-.15,0);l.rotation.z=Math.cos(a)*.8;parts.legs.push(leg)}
  const gun=cyl(g,.06,.09,.52,materials.violet,.3,.66,.3,8);gun.rotation.x=Math.PI/2;parts.spin.push(gun);
 }else if(type==='hotspot'){
  const body=sphere(g,.3,materials.red,0,.15,0,1);body.scale.y=.45;parts.head=body;
  for(let i=0;i<4;i++){const a=i*Math.PI/2;box(g,.07,.06,.7,materials.dark,Math.sin(a)*.32,.12,Math.cos(a)*.32).rotation.y=a;const rotor=torus(g,.25,.022,materials.red,Math.sin(a)*.65,.18,Math.cos(a)*.65);parts.rotors.push(rotor)}
  const beam=cyl(g,.03,.18,.65,new THREE.MeshBasicMaterial({color:0xff6874,transparent:true,opacity:.17,depthWrite:false}),0,-.28,0,12);beam.castShadow=false;
 }else if(type==='packer'){
  const core=sphere(g,.29,materials.amber,0,.5,0,1);parts.head=core;
  for(let i=0;i<3;i++){const ring=torus(g,.46+i*.06,.035,materials.violet,0,.5,0);ring.rotation.x=Math.PI/2+i*.65;parts.spin.push(ring)}
  for(let i=0;i<6;i++){const a=i*Math.PI/3;const plate=box(g,.25,.34,.08,materials.white,Math.cos(a)*.46,.5,Math.sin(a)*.46);plate.rotation.y=-a;parts.legs.push(plate)}
 }else if(type==='boss'){
  if(mapIndex===0){
   cyl(g,.75,.95,.45,materials.dark,0,.55,0,10);const head=sphere(g,.62,materials.red,0,1.08,0,2);head.scale.y=.65;parts.head=head;
   for(let i=0;i<8;i++){const a=i*Math.PI/4;const leg=new THREE.Group();leg.position.set(Math.cos(a)*.65,.6,Math.sin(a)*.65);leg.rotation.y=-a;g.add(leg);box(leg,.16,.16,1.15,materials.red,0,0,.45);box(leg,.13,.65,.13,materials.dark,0,-.28,.95);parts.legs.push(leg)}
   for(let i=0;i<3;i++){const ring=torus(g,.75+i*.15,.035,materials.red,0,1.0+i*.18,0);ring.rotation.x=Math.PI/2+(i-1)*.35;parts.spin.push(ring)}const swarm=new THREE.Group();for(let i=0;i<6;i++){const a=i*Math.PI/3;const puppet=box(swarm,.2,.2,.2,i%2?materials.violet:materials.red,Math.cos(a)*1.35,1.05+(i%2)*.25,Math.sin(a)*1.35);puppet.rotation.y=a}swarm.visible=false;g.add(swarm);parts.swarm=swarm;
  }else if(mapIndex===1){
   const core=sphere(g,.72,materials.violet,0,1.0,0,2);core.scale.y=1.25;parts.head=core;
   for(let i=0;i<4;i++){const ring=torus(g,.85+i*.14,.04,i%2?materials.red:materials.violet,0,1,0);ring.rotation.x=Math.PI/2+i*.42;parts.spin.push(ring)}
   for(let i=0;i<6;i++){const a=i*Math.PI/3;const fin=box(g,.22,.8,.48,materials.white,Math.cos(a)*.9,1,Math.sin(a)*.9);fin.rotation.y=-a;fin.rotation.z=.35;parts.legs.push(fin)}const storm=new THREE.Group();for(let i=0;i<8;i++){const a=i*Math.PI/4;const shard=sphere(storm,.13,i%2?materials.red:materials.violet,Math.cos(a)*1.5,1+(i%3)*.22,Math.sin(a)*1.5,0);shard.scale.y=2}storm.visible=false;g.add(storm);parts.storm=storm;
  }else{
   cyl(g,.6,.9,.8,materials.dark,0,.65,0,6);const head=sphere(g,.58,materials.red,0,1.28,0,1);head.scale.set(.8,1.25,.8);parts.head=head;
   for(const s of [-1,1]){const arm=new THREE.Group();arm.position.set(s*.7,1.0,0);g.add(arm);box(arm,.25,.9,.3,materials.red,s*.2,-.15,0).rotation.z=s*-.45;const claw=box(arm,.35,.22,.45,materials.dark,s*.42,-.52,.1);parts.legs.push(arm)}
   for(let i=0;i<4;i++){const blade=box(g,.16,1.15,.38,materials.white,0,1.1,0);blade.rotation.z=Math.PI/4;blade.rotation.y=i*Math.PI/2;parts.spin.push(blade)}
  }
  const alarm=new THREE.PointLight(0xff435e,2,5);alarm.position.y=1.4;g.add(alarm);
 }
 const h=type==='boss'?2.25:(type==='hotspot'?.85:1.25);g.userData.health=createHealthBar(g,h,type==='boss'?0xff6574:0xff8b78,type==='boss'?1.9:.85);
 const shield=sphere(g,type==='boss'?1.3:.65,new THREE.MeshBasicMaterial({color:0xa583ff,transparent:true,opacity:0,wireframe:true,depthWrite:false}),0,type==='boss'?1:.45,0,2);g.userData.shield=shield;
 const detect=torus(g,type==='boss'?1.15:.55,.025,materials.amber,0,.08,0);detect.visible=false;g.userData.detect=detect;
 return g;
}
function towerCapacity(t){if(t.type==='firewall')return t.level===2?3:2;if(t.type==='honey')return t.branch==='snare'?3:2;return 0}
function isNodeBlocked(cell,time=state.time,extra=null){
 if(!cell)return false;if(extra===cell.key)return true;if(state.bossLocks.some(l=>l.key===cell.key&&l.until>time))return true;
 if(cell.type==='node'&&cell.tower&&(cell.tower.type==='gate'||cell.tower.type==='firewall')&&cell.tower.hp>0)return true;
 if(cell.emergencyUntil>time)return true;return false;
}
function isOldCell(cell,time=state.time){return !!cell?.old||state.degraded.some(d=>d.key===cell?.key&&d.until>time)}
function targetCores(entryId,extra=null){
 const ids=Object.keys(state.map.cores);
 if(ids.length===1)return ids;
 if(state.mapIndex===1){if(entryId==='A')return['X'];if((getCell(6,6)&&isNodeBlocked(getCell(6,6),state.time,extra)))return['Y'];return['X']}
 if(state.mapIndex===2){if(entryId==='A')return['X'];if(entryId==='B')return['Y'];return['X','Y']}
 return ids;
}
function findPath(start,entryId,extra=null,time=state.time,via=null,skipPolicy=false){
 if(!start)return null;
 if(!via&&!skipPolicy){
  let waypoint=null;
  if(state.mapIndex===1&&(entryId==='C'||entryId==='B')&&!isNodeBlocked(getCell(6,6),time,extra)){
   const oldGate=getCell(6,3),convergence=getCell(6,6),southGate=getCell(6,8);
   if(start.z<=3&&start!==oldGate&&!isNodeBlocked(oldGate,time,extra))waypoint=oldGate;
   else if(start.z<=6&&start!==convergence)waypoint=convergence;
   else if(start.z>=6&&start.z<8&&start!==southGate&&!isNodeBlocked(southGate,time,extra))waypoint=southGate;
  }
  if(state.mapIndex===2&&entryId==='C'){
   const upper=getCell(4,4),lower=getCell(4,7);
   if(start.z<4&&start!==upper&&!isNodeBlocked(upper,time,extra))waypoint=upper;
   else if(start.z>=4&&start.z<7&&start!==lower&&!isNodeBlocked(lower,time,extra)&&!isNodeBlocked(upper,time,extra))waypoint=lower;
  }
  if(waypoint){const first=findPath(start,entryId,extra,time,waypoint,true);if(first){const rest=findPath(waypoint,entryId,extra,time);if(rest)return first.concat(rest.slice(1))}}
 }
 const targets=via?[via]:targetCores(entryId,extra).map(id=>state.map.cores[id]);const dist=new Map(),prev=new Map(),open=[];dist.set(start.key,0);open.push({cell:start,cost:0});let end=null;
 const order=[[0,1],[-1,0],[1,0],[0,-1]];
 while(open.length){open.sort((a,b)=>a.cost-b.cost);const cur=open.shift();if(cur.cost!==dist.get(cur.cell.key))continue;
  if(targets.some(t=>t.x===cur.cell.x&&t.z===cur.cell.z)){end=cur.cell;break}
  for(const [dx,dz] of order){const n=getCell(cur.cell.x+dx,cur.cell.z+dz);if(!n)continue;if(!['link','node','entry','core'].includes(n.type))continue;if(isNodeBlocked(n,time,extra)&&n!==start)continue;
   const step=isOldCell(n,time)?1.85:1,nc=cur.cost+step;if(nc<(dist.get(n.key)??Infinity)){dist.set(n.key,nc);prev.set(n.key,cur.cell);open.push({cell:n,cost:nc})}
  }
 }
 if(!end)return null;const path=[];let c=end;while(c){path.unshift(c);if(c===start)break;c=prev.get(c.key)}return path;
}
function samePath(a,b){if(!a||!b||a.length!==b.length)return false;return a.every((c,i)=>c.key===b[i].key)}
function calculateRoutes(extra=null){const result={};for(const entry of state.map.meta.entries){const e=state.map.entries[entry.id],cell=getCell(e.x,e.z);result[entry.id]={path:findPath(cell,entry.id,extra),changed:false}}return result}
function validateRoutes(extra=null){const routes=calculateRoutes(extra);for(const e of state.map.meta.entries)if(!routes[e.id].path)return{ok:false,reason:`入口 ${e.id}「${e.name}」将失去到中枢的连通`};for(const enemy of state.enemies){if(enemy.type==='hotspot'||enemy.dead)continue;const c=nearestCell(enemy.pos);if(!findPath(c,enemy.entry,extra))return{ok:false,reason:`${ENEMIES[enemy.type].name} 在 ${c.x+1}-${c.z+1} 链路将被封死`}}return{ok:true,routes}}
function updateRoutes(){
 if(!state.map)return;const next=calculateRoutes();for(const [id,r] of Object.entries(next)){r.changed=!!state.routes[id]&&!samePath(state.routes[id].path,r.path);if(r.changed&&state.running)routeNotice(id)}state.routes=next;state.routeDirty=false;drawRoutes();
 for(const enemy of state.enemies){if(enemy.type==='hotspot'||enemy.dead||enemy.trapped>0)continue;rerouteEnemy(enemy)}updateForecast();
}
function routeNotice(entryId){const entry=state.map.entries[entryId],p=worldPos(entry,1.65),label=makeLabel(`${entryId} ↻ 路由收敛`,CSS_COLORS[entryId],.5);label.position.copy(p);effectGroup.add(label);state.effects.push({mesh:label,life:1.8,max:1.8,type:'routeLabel'});ringEffect(worldPos(entry),COLORS[entryId],1.15,.65)}
function rerouteEnemy(enemy){
 const start=nearestCell(enemy.pos),path=findPath(start,enemy.entry);if(!path)return;enemy.path=path;enemy.pathIndex=Math.min(1,path.length-1);enemy.routeVersion=(enemy.routeVersion||0)+1;
}
function drawRoutes(){
 clearGroup(routeGroup);routePackets=[];
 for(const [id,r] of Object.entries(state.routes)){if(!r.path)continue;drawPath(r.path,COLORS[id],false,r.changed);for(let i=0;i<2;i++){const p=mesh(shared.packet,new THREE.MeshBasicMaterial({color:COLORS[id]}),routeGroup);p.castShadow=false;routePackets.push({mesh:p,path:r.path,offset:i*.47+random(),entry:id})}}
 if(state.previewRoutes){for(const [id,r] of Object.entries(state.previewRoutes)){if(r.path&&r.changed)drawPath(r.path,0xffffff,true,true)}}
 routeGroup.traverse(o=>{if(o.material)o.material.toneMapped=false});
}
function drawPath(path,color,dashed,changed){
 const pts=path.map(c=>worldPos(c,.18));const geo=new THREE.BufferGeometry().setFromPoints(pts);const material=dashed?new THREE.LineDashedMaterial({color,dashSize:.22,gapSize:.15,transparent:true,opacity:.95,depthTest:false}):new THREE.LineBasicMaterial({color,transparent:true,opacity:changed?.95:.65,depthTest:false});const line=new THREE.Line(geo,material);line.computeLineDistances();line.renderOrder=8;routeGroup.add(line);
 if(!dashed){for(let i=1;i<path.length;i++){const a=worldPos(path[i-1],.145),b=worldPos(path[i],.145),dir=b.clone().sub(a),len=dir.length();const trace=mesh(new THREE.CylinderGeometry(.026,.026,len,5),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.5,depthWrite:false}),routeGroup);trace.position.copy(a).add(b).multiplyScalar(.5);trace.quaternion.setFromUnitVectors(UP,dir.normalize());trace.castShadow=false;trace.renderOrder=7}for(let i=1;i<path.length-1;i+=2){const a=worldPos(path[i-1],.2),b=worldPos(path[i],.2),dir=b.clone().sub(a).normalize();const cone=mesh(new THREE.ConeGeometry(.085,.24,5),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthTest:false}),routeGroup,b.x,.24,b.z);cone.quaternion.setFromUnitVectors(UP,dir);cone.castShadow=false;cone.renderOrder=9}}
}
function nearestCell(pos){let best=null,d=Infinity;for(const c of state.map.cells){if(!['link','node','entry','core'].includes(c.type))continue;const p=worldPos(c),dd=(p.x-pos.x)**2+(p.z-pos.z)**2;if(dd<d){d=dd;best=c}}return best}
function pathPoint(path,t){if(!path||path.length<2)return worldPos(path?.[0]||{x:0,z:0},.2);const n=path.length-1,v=((t%1)+1)%1*n,i=Math.min(n-1,Math.floor(v)),f=v-i;return worldPos(path[i],.25).lerp(worldPos(path[i+1],.25),f)}

function resetGame(index){
 state.mapIndex=index;state.running=true;state.paused=false;state.speed=1;state.time=0;state.wave=0;state.waveActive=false;state.nextWave=0;state.cpu=360;state.intel=8;state.core=100;state.selected=null;state.dragType=null;state.pending=null;state.itemMode=null;state.itemCooldown={isolate:0,downgrade:0,backup:0};state.enemies=[];state.towers=[];state.projectiles=[];state.effects=[];state.telegraphs=[];state.spawnQueue=[];state.routes={};state.previewRoutes=null;state.degraded=[];state.bossLocks=[];state.kills=0;state.leaks=0;state.lost=0;state.reroutes=0;state.earned=0;state.startTime=0;state.shake=0;state.intelTimer=0;state.demo=null;state.exportMode=false;state.idCounter=1;state.uiTimer=0;state.manualPaused=false;state.seenEnemies=new Set();random=rng(713+index);
 buildMap(index);audio.setMap(index);showScreen('game');updateHUD();updateForecast();selectObject(null);closeRouteConfirm();$('#reportModal').classList.add('hidden');$('#pauseModal').classList.add('hidden');$('#bossBar').classList.add('hidden');document.body.classList.remove('demo-mode','export-mode');$('#demoOverlay').classList.add('hidden');$('#demoCursor').classList.add('hidden');
 $('#eventLog').innerHTML='';$('#toastStack').innerHTML='';logEvent('守护进程已载入，等待布防指令');logEvent('所有入口业务连通性校验通过');
}
function showScreen(name){
 state.screen=name;$('#menuScreen').classList.toggle('hidden',name!=='menu');$('#mapScreen').classList.toggle('hidden',name!=='maps');$('#gameHUD').classList.toggle('hidden',name!=='game');$('#globalHeader').classList.toggle('hidden',name==='game');
 if(name==='menu'){state.running=false;state.demo=null;document.body.classList.remove('demo-mode');buildMap(state.mapIndex,true)}
 if(name==='maps'){state.running=false;buildMap(state.mapIndex,true)}
}
function waveComposition(wave,index){
 const list=[];const entries=state.map.meta.entries.map(e=>e.id);const add=(type,entry,count,gap=.75,start=0)=>{for(let i=0;i<count;i++)list.push({type,entry,time:start+i*gap})};
 const n=Math.max(2,3+Math.floor(wave*.5)-(entries.length>2?2:0));entries.forEach((e,i)=>add('worm',e,n+i%2,.72,i*.25));
 if(wave>=2)add('trojan',entries[wave%entries.length],1+Math.floor(wave/4),1.3,2);
 if(wave>=3)add('ransom',entries[(wave+1)%entries.length],1+Math.floor(wave/5),2.4,4);
 if(wave>=4)add('flood',entries[wave%entries.length],Math.min(3,1+Math.floor(wave/6)),3.4,5);
 if(wave>=5)add('hotspot',entries[(wave+2)%entries.length],1+Math.floor(wave/5),1.4,3);
 if(wave>=6)add('packer',entries[wave%entries.length],1+Math.floor(wave/8),4,6);
 if((index===1&&wave===10)||(index===2&&wave===11)){entries.forEach((e,i)=>{add('flood',e,2,1.7,1+i*.3);add('worm',e,5,.6,2);add('packer',e,1,1,3)});list.push({special:'洪峰'})}
 if(wave===state.map.meta.waves){add('boss',entries[0],1,1,4);entries.forEach((e,i)=>{add('worm',e,5,.55,7);add(index===2?'trojan':'ransom',e,2,2,9)})}
 return list.sort((a,b)=>a.time-b.time);
}
function startWave(){
 if(!state.running||state.waveActive||state.wave>=state.map.meta.waves||state.demo)return;
 state.wave++;state.waveActive=true;state.nextWave=0;state.spawnTime=0;state.spawnQueue=waveComposition(state.wave,state.mapIndex).filter(s=>s.type);const special=(state.mapIndex===1&&state.wave===10)||(state.mapIndex===2&&state.wave===11);
 logEvent(special?'洪峰警报：全部入口出现高并发恶意流量':`第 ${state.wave} 波攻击已进入自治域`,special?'danger':'warn');toast(special?'洪峰警报 · 三入口同时出兵':`第 ${state.wave} 波 · 流量特征已更新`,special?'danger':'');audio.sfx(special?'alarm':'wave');updateForecast();updateHUD();
 if(state.wave===state.map.meta.waves)toast(`${state.map.meta.boss} 正在接近 · 最终防御进程`,'danger');
}
function spawnEnemy(type,entryId,opts={}){
 const def=ENEMIES[type],entry=state.map.entries[entryId]||state.map.entries.A,cell=getCell(entry.x,entry.z),scale=1+Math.max(0,state.wave-1)*.055;
 const e={id:state.idCounter++,type,entry:entryId,hp:def.hp*(type==='boss'?(1+state.mapIndex*.35):scale),maxHp:0,shield:0,pos:worldPos(cell,type==='hotspot'?2.65:.26),path:null,pathIndex:1,speed:def.speed,damage:def.damage,dead:false,revealed:type!=='trojan',clone:!!opts.clone,cloned:!!opts.clone,blockedBy:null,attackTimer:random(),supportTimer:1+random(),slow:0,trapped:0,encrypted:0,routeVersion:0,progress:0,skillTimer:5,phase:1,spawnedMinions:false,assault:null,animOffset:random()*6.28,lastCell:cell,hitFlash:0};
 e.maxHp=e.hp;if(opts.pos)e.pos.copy(opts.pos);e.mesh=createEnemyVisual(type,state.mapIndex);unitGroup.add(e.mesh);e.mesh.position.copy(e.pos);e.mesh.userData.enemy=e;
 if(type==='hotspot'){const targets=targetCores(entryId);const target=state.map.cores[targets[0]];e.flightFrom=e.pos.clone();e.flightTo=worldPos(target,2.65);e.flightDistance=e.flightFrom.distanceTo(e.flightTo);e.flightProgress=opts.pos?0:0}else{e.path=findPath(nearestCell(e.pos),entryId);e.pathIndex=Math.min(1,e.path?.length-1||0)}
 state.enemies.push(e);if(!state.demo&&!opts.clone&&!state.seenEnemies.has(type)&&type!=='boss'){state.seenEnemies.add(type);const hint={worm:'被阻挡时近战，直通节点会触发一次复制',trojan:'沙箱、旧链路或阻挡可使其显形',flood:'占用 3 点容量，会主动冲击附近隔离节点',ransom:'远程伤害并加密设备，优先攻击蜜罐',hotspot:'无线层直飞中枢，仅拦截器能够对付',packer:'为附近同伴补充护盾，建议优先击破'}[type];toast(`新威胁识别 · ${def.name}｜${hint}`,'warn');logEvent(`威胁档案更新：${def.name} · ${hint}`,'warn');audio.sfx('alarm')}if(type==='boss'){$('#bossBar').classList.remove('hidden');$('#bossName').textContent=BOSS_NAMES[state.mapIndex];logEvent(`核心威胁 ${BOSS_NAMES[state.mapIndex]} 已入场`,'danger');audio.sfx('boss');state.shake=.22;ringEffect(e.pos,0xff526b,3,1.2);const pillar=cyl(effectGroup,.45,.85,5,new THREE.MeshBasicMaterial({color:0xff526b,transparent:true,opacity:.2,depthWrite:false}),e.pos.x,2.5,e.pos.z,20);pillar.castShadow=false;state.effects.push({mesh:pillar,life:1.1,max:1.1,type:'beam'})}
 return e;
}
function nearestExitProgress(e){
 if(e.type==='hotspot')return 1-e.pos.distanceTo(e.flightTo)/Math.max(1,e.flightDistance);
 return e.pathIndex/Math.max(1,(e.path?.length||2)-1);
}
function updateBattle(dt){
 state.time+=dt;if(state.waveActive||state.demo){state.cpu=Math.min(999,state.cpu+dt*2.4);state.earned+=dt*2.4;}
 for(const k of Object.keys(state.itemCooldown))state.itemCooldown[k]=Math.max(0,state.itemCooldown[k]-dt);
 const defended=(state.waveActive||state.demo)?state.map.cells.filter(c=>c.type==='node'&&c.tower&&isNodeBlocked(c)):[];state.intelTimer=defended.length?state.intelTimer+dt:0;if(state.intelTimer>=12){state.intelTimer=0;state.intel+=Math.min(2,defended.length);logEvent(`隔离节点稳定运行，回收 ${Math.min(2,defended.length)} 点情报`)}
 if(state.waveActive){state.spawnTime+=dt;while(state.spawnQueue.length&&state.spawnQueue[0].time<=state.spawnTime){const s=state.spawnQueue.shift();spawnEnemy(s.type,s.entry)}}
 updateTelegraphs();updateEnemies(dt);updateTowers(dt);updateProjectiles(dt);updateEffects(dt);updateTemporaryTerrain();
 if(state.routeDirty)updateRoutes();
 state.enemies=state.enemies.filter(e=>!e.dead);state.towers=state.towers.filter(t=>!t.dead);
 if(state.waveActive&&!state.spawnQueue.length&&!state.enemies.length){
  state.waveActive=false;state.cpu=Math.min(999,state.cpu+45);state.intel+=2;logEvent(`第 ${state.wave} 波已遏制 · 回收 45 算力 / 2 情报`);
  if(state.wave>=state.map.meta.waves){endGame(true)}else{state.nextWave=10;toast('攻击波已遏制 · 获得 10 秒加固窗口')}
 }
 if(!state.waveActive&&state.nextWave>0&&!state.demo){state.nextWave-=dt;if(state.nextWave<=0)startWave()}
 updateHUDThrottled();
}
function updateEnemies(dt){
 for(const t of state.towers)t.blocked=[];
 const ordered=[...state.enemies].sort((a,b)=>nearestExitProgress(b)-nearestExitProgress(a));
 for(const e of ordered){
  if(e.dead)continue;e.attackTimer-=dt;e.supportTimer-=dt;e.slow=Math.max(0,e.slow-dt);e.trapped=Math.max(0,e.trapped-dt);e.hitFlash=Math.max(0,e.hitFlash-dt);
  if(e.type==='hotspot'){updateFlying(e,dt);animateEnemy(e,dt);continue}
  if(!e.path||!e.path.length){rerouteEnemy(e);continue}
  const current=nearestCell(e.pos);if(current!==e.lastCell){onEnemyCell(e,current);e.lastCell=current}
  if(isOldCell(current))e.onOld=true;else e.onOld=false;
  if(e.type==='trojan'&&e.onOld)revealEnemy(e,'旧链路检测');
  if(e.type==='packer'&&e.supportTimer<=0){e.supportTimer=2.5;let count=0;for(const ally of state.enemies){if(ally!==e&&!ally.dead&&ally.type!=='hotspot'&&ally.pos.distanceTo(e.pos)<2.7){ally.shield=Math.min(65,ally.shield+24);count++}}if(count)ringEffect(e.pos,0xae82ff,2.5,.65)}
  if(e.type==='boss')updateBoss(e,dt);
  if(e.trapped>0){e.blockedBy=null;animateEnemy(e,dt);continue}
  let blocker=null;
  if(e.type!=='boss'||true){
   const candidates=state.towers.filter(t=>!t.dead&&(t.type==='firewall'||t.type==='honey')&&towerCapacity(t)>0);
   candidates.sort((a,b)=>(a.type==='honey'?-1:0)-(b.type==='honey'?-1:0)||a.pos.distanceTo(e.pos)-b.pos.distanceTo(e.pos));
   for(const t of candidates){const dist=t.pos.distanceTo(e.pos);const interaction=t.cell.type==='node'&&t.type==='firewall'?CELL*1.3:(t.type==='honey'?.85:.72);if(dist<interaction){
     const used=t.blocked.reduce((s,x)=>s+(x.type==='flood'?3:1),0),need=e.type==='flood'?3:1;if(used+need<=towerCapacity(t)){blocker=t;t.blocked.push(e);break}
    if(t.type==='honey'&&dist<2.35&&['worm','flood','ransom','trojan'].includes(e.type))e.luredBy=t;
   }}
  }
  e.blockedBy=blocker;if(blocker){if(e.type==='trojan')revealEnemy(e,'物理阻挡');if(e.attackTimer<=0){e.attackTimer=e.type==='flood'?1.45:.9;enemyHitTower(e,blocker,e.type==='flood'&&blocker.cell.type==='node'?48:e.damage)}animateEnemy(e,dt);continue}
  if(e.type==='flood'){
   let assault=e.assault;if(!assault||!assault.cell||!isNodeBlocked(assault.cell)){
    assault=null;let best=null;const nodes=state.map.cells.filter(c=>c.type==='node'&&isNodeBlocked(c)).sort((a,b)=>worldPos(a).distanceTo(e.pos)-worldPos(b).distanceTo(e.pos));
    for(const c of nodes){const man=Math.abs(c.x-current.x)+Math.abs(c.z-current.z);if(man>3)continue;if(man<=1){assault={cell:c,approach:current};break}for(const [dx,dz] of [[0,1],[-1,0],[1,0],[0,-1]]){const n=getCell(c.x+dx,c.z+dz);if(!n||!['link','node','entry','core'].includes(n.type)||isNodeBlocked(n))continue;const p=findPath(current,e.entry,null,state.time,n,true);if(p&&(!best||p.length<best.path.length))best={cell:c,approach:n,path:p}}if(assault)break}
    if(!assault&&best)assault=best;e.assault=assault;
   }
   if(assault&&isNodeBlocked(assault.cell)){const man=Math.abs(assault.cell.x-current.x)+Math.abs(assault.cell.z-current.z);if(man<=1){if(e.attackTimer<=0){e.attackTimer=1.45;const target=assault.cell.tower;if(target)enemyHitTower(e,target,48);else damageEmergency(assault.cell,65);shockwave(worldPos(assault.cell,.3),0xff8b62)}animateEnemy(e,dt);continue}else{if(!e.path||e.path[e.path.length-1]!==assault.approach){e.path=findPath(current,e.entry,null,state.time,assault.approach,true);e.pathIndex=1}if(!e.path){e.assault=null}}}
  }
  if(e.type==='ransom'&&e.attackTimer<=0){
   const targets=state.towers.filter(t=>!t.dead&&t.pos.distanceTo(e.pos)<3.5);targets.sort((a,b)=>(b.type==='honey')-(a.type==='honey')||a.pos.distanceTo(e.pos)-b.pos.distanceTo(e.pos));if(targets[0]){e.attackTimer=1.65;fireProjectile(e,targets[0],e.damage,'ransom');e.mesh.userData.parts.head.rotation.x=.25}
  }
  if(e.type==='trojan'&&e.attackTimer<=0){const near=state.towers.find(t=>t.pos.distanceTo(e.pos)<1.0);if(near){e.attackTimer=1.2;enemyHitTower(e,near,e.damage)}}
  moveGroundEnemy(e,dt);
  animateEnemy(e,dt);
 }
}
function moveGroundEnemy(e,dt){
 if(!e.path||e.pathIndex>=e.path.length){if(e.type==='flood'&&e.assault&&isNodeBlocked(e.assault.cell))return;leakEnemy(e);return}
 const next=e.path[e.pathIndex],target=worldPos(next,.26),delta=target.clone().sub(e.pos);delta.y=0;const dist=delta.length();
 let speed=e.speed*(e.onOld?.56:1)*(e.slow>0?.55:1);if(e.type==='boss'&&e.phase===2)speed*=.85;
 if(dist<.045){e.pos.x=target.x;e.pos.z=target.z;e.pathIndex++;if(e.pathIndex>=e.path.length&&!(e.type==='flood'&&e.assault&&isNodeBlocked(e.assault.cell)))leakEnemy(e);return}
 const dir=delta.normalize(),step=Math.min(dist,speed*dt);e.pos.addScaledVector(dir,step);e.pos.y=.26+Math.sin(state.time*5+e.animOffset)*.025;
 const desired=Math.atan2(dir.x,dir.z);e.mesh.rotation.y=lerpAngle(e.mesh.rotation.y,desired,Math.min(1,dt*7));e.progress=nearestExitProgress(e);
}
function updateFlying(e,dt){
 const dir=e.flightTo.clone().sub(e.pos),dist=dir.length();if(dist<.15){leakEnemy(e);return}dir.normalize();e.pos.addScaledVector(dir,e.speed*(e.slow>0?.55:1)*dt);e.pos.y=2.55+Math.sin(state.time*4+e.animOffset)*.18;e.mesh.rotation.y=lerpAngle(e.mesh.rotation.y,Math.atan2(dir.x,dir.z),dt*5);e.progress=nearestExitProgress(e);
}
function onEnemyCell(e,cell){
 if(e.type==='worm'&&!e.cloned&&cell.type==='node'&&!isNodeBlocked(cell)){
  e.cloned=true;const clone=spawnEnemy('worm',e.entry,{pos:e.pos.clone().add(new THREE.Vector3(.15,0,.15)),clone:true});clone.hp*=.72;clone.maxHp=clone.hp;clone.mesh.scale.setScalar(.82);ringEffect(e.pos,0xff6673,1.1,.5);logEvent('蠕虫通过直通节点复制出同伴','warn');
 }
}
function revealEnemy(e,source){if(e.revealed)return;e.revealed=true;e.mesh.userData.detect.visible=true;if(e.mesh.userData.mane)e.mesh.userData.mane.forEach(m=>m.visible=true);if(e.type==='trojan'){e.mesh.userData.parts.head.material=materials.red;e.mesh.userData.parts.spin.forEach(m=>m.material=materials.red)}logEvent(`${e.type==='boss'?'蛰影':'木马'}已被 ${source} 显形`)}
function updateTowers(dt){
 for(const t of state.towers){
  if(t.dead)continue;t.cooldown-=dt;t.skillCooldown=Math.max(0,t.skillCooldown-dt);t.encrypted=Math.max(0,t.encrypted-dt);t.animTime+=dt;t.recoil=Math.max(0,t.recoil-dt*4);
  animateTower(t,dt);if(t.encrypted>0)continue;
  if(t.type==='repair'){
   if(t.cooldown<=0){const targets=state.towers.filter(a=>a!==t&&!a.dead&&a.hp<a.maxHp&&a.pos.distanceTo(t.pos)<towerRange(t));targets.sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp);if(targets[0]){t.cooldown=.48;const amount=t.level===2?15:9;healTower(targets[0],amount);beamEffect(t.pos.clone().add(new THREE.Vector3(0,1,0)),targets[0].pos.clone().add(new THREE.Vector3(0,.65,0)),0x65efa5,.32)}}continue;
  }
  if(t.type==='gate')continue;
  if(t.type==='sandbox'){
   let detected=0;for(const e of state.enemies){if(!e.dead&&e.type!=='hotspot'&&e.pos.distanceTo(t.pos)<towerRange(t)*.72&&!e.revealed){revealEnemy(e,'沙箱检测');detected++}}
   if(t.cooldown<=0){const targets=state.enemies.filter(e=>!e.dead&&e.type!=='hotspot'&&e.pos.distanceTo(t.pos)<towerRange(t));if(targets.length){t.cooldown=t.level===2?.95:1.35;for(const e of targets)damageEnemy(e,t.level===2?24:17,t,'aoe');ringEffect(t.pos,0xf2bc6c,towerRange(t),.45);t.recoil=1;audio.sfx('sandbox')}}continue;
  }
  if(t.type==='firewall'||t.type==='honey'){
   if(t.cooldown<=0&&t.blocked?.length){const e=t.blocked.find(x=>!x.dead);if(e){t.cooldown=t.type==='firewall'?.65:1.0;const dmg=t.type==='firewall'?(t.level===2?20:13):(t.branch==='mirror'?13:5);damageEnemy(e,dmg,t,'melee');beamEffect(t.pos.clone().add(new THREE.Vector3(0,.65,0)),e.pos.clone().add(new THREE.Vector3(0,.35,0)),t.type==='honey'?0xb785ff:0x65ead5,.14);t.recoil=1}}continue;
  }
  if(t.type==='interceptor'&&t.cooldown<=0){
   const targets=state.enemies.filter(e=>validInterceptorTarget(t,e));targets.sort((a,b)=>nearestExitProgress(b)-nearestExitProgress(a));if(targets[0]){t.cooldown=t.level===2?.62:.82;fireProjectile(t,targets[0],t.level===2?38:28,'interceptor',t.branch);t.recoil=1;audio.sfx('shoot')}
  }
 }
}
function towerRange(t){if(t.type==='firewall'&&t.cell.type==='node')return CELL*1.3;return TOWERS[t.type].range+(t.level===2?(t.type==='interceptor'?.6:.25):0)}
function validInterceptorTarget(t,e){
 if(e.dead||(!e.revealed&&(e.type==='trojan'||(e.type==='boss'&&state.mapIndex===2))))return false;
 const delta=e.pos.clone().sub(t.pos),dist=delta.length();if(dist>towerRange(t))return false;delta.y=0;delta.normalize();const forward=new THREE.Vector3(Math.sin(t.direction),0,Math.cos(t.direction));return forward.dot(delta)>(t.branch==='suppress'?.15:.42);
}
function fireProjectile(source,target,damage,kind,branch=null){
 const from=source.pos.clone().add(new THREE.Vector3(0,source.type==='boss'?1.1:.85,0)),to=target.pos.clone().add(new THREE.Vector3(0,target.type==='hotspot'?0:.45,0));const color=kind==='ransom'?0xd878ff:branch==='suppress'?0x70d8ff:0x65f3df;
 const m=sphere(effectGroup,kind==='ransom'?.09:.065,new THREE.MeshBasicMaterial({color}),from.x,from.y,from.z);m.castShadow=false;state.projectiles.push({mesh:m,source,target,damage,kind,branch,speed:kind==='ransom'?8:13,life:2});beamEffect(from,to,color,.08);
}
function updateProjectiles(dt){
 for(const p of state.projectiles){if(p.dead)continue;p.life-=dt;if(p.life<=0||!p.target||p.target.dead){p.dead=true;removeMesh(p.mesh);continue}const target=p.target.pos.clone().add(new THREE.Vector3(0,p.target.type==='hotspot'?0:.45,0)),delta=target.sub(p.mesh.position),dist=delta.length();if(dist<p.speed*dt+.12){if(p.kind==='ransom'){applyTowerDamage(p.target,p.damage,p.source);if(p.target.type!=='honey')p.target.encrypted=Math.max(p.target.encrypted,4);ringEffect(p.target.pos,0xc77aff,.7,.35)}else{damageEnemy(p.target,p.damage,p.source,'projectile');if(p.branch==='suppress')p.target.slow=2.5;if(p.branch==='pierce'){const others=state.enemies.filter(e=>e!==p.target&&!e.dead&&e.pos.distanceTo(p.target.pos)<1.25).slice(0,2);for(const e of others)damageEnemy(e,p.damage*.65,p.source,'projectile')}}hitEffect(p.mesh.position,p.kind==='ransom'?0xda83ff:0x75f7e2);p.dead=true;removeMesh(p.mesh)}else p.mesh.position.addScaledVector(delta.normalize(),p.speed*dt)}
 state.projectiles=state.projectiles.filter(p=>!p.dead);
}
function enemyHitTower(e,t,damage){
 applyTowerDamage(t,damage,e);t.hitFlash=.2;beamEffect(e.pos.clone().add(new THREE.Vector3(0,.45,0)),t.pos.clone().add(new THREE.Vector3(0,.65,0)),e.type==='flood'?0xffa362:0xff6470,.18);t.mesh.userData.parts.head&&(t.mesh.userData.parts.head.rotation.z=.12);audio.sfx('hit');
}
function applyTowerDamage(t,amount,source){
 if(!t||t.dead)return;if(t.shield>0){const absorb=Math.min(t.shield,amount);t.shield-=absorb;amount-=absorb}if(amount<=0)return;
 t.hp-=amount;t.hitFlash=.2;updateHealthBar(t);if(t.hp<=0)destroyTower(t,source);
}
function healTower(t,amount){if(t.dead)return;t.hp=Math.min(t.maxHp,t.hp+amount);updateHealthBar(t);hitEffect(t.pos.clone().add(new THREE.Vector3(0,1,0)),0x64efaa)}
function destroyTower(t,source){
 if(t.dead)return;t.dead=true;t.hp=0;const c=t.cell;c.tower=null;state.lost++;if(c.type==='node'){c.cooldownUntil=state.time+5;state.routeDirty=true;state.reroutes++;logEvent(`${c.x+1}-${c.z+1} 节点设备被摧毁，旁路恢复直通`,'danger');toast('节点隔离失效 · 路由正在重新收敛','danger')}else logEvent(`${t.name} 已被摧毁`,'danger');
 explosion(t.pos,0xff775f,1.25);removeMesh(t.mesh);if(state.selected===t)selectObject(null);audio.sfx('destroy');state.shake=Math.max(state.shake,.13);
}
function damageEnemy(e,amount,source,kind){
 if(!e||e.dead)return;if(e.type==='boss'&&state.mapIndex===2&&e.phase===2)amount*=.48;
 if(e.shield>0){const a=Math.min(e.shield,amount);e.shield-=a;amount-=a}e.hp-=amount;e.hitFlash=.15;updateHealthBar(e);
 if(e.hp<=0)killEnemy(e,source,kind);
}
function killEnemy(e,source,kind){
 if(e.dead)return;e.dead=true;state.kills++;state.cpu=Math.min(999,state.cpu+ENEMIES[e.type].reward);state.earned+=ENEMIES[e.type].reward;if(['flood','ransom','packer','boss'].includes(e.type))state.intel+=e.type==='boss'?4:1;
 if(e.type==='trojan'&&!e.revealed&&kind==='aoe'){for(const t of state.towers)if(t.pos.distanceTo(e.pos)<2.0)applyTowerDamage(t,28,e);explosion(e.pos,0xff985f,1.7);logEvent('未显形木马释放载荷，附近设备受损','danger')}
 explosion(e.pos,e.type==='boss'?0xff486d:0xff796b,e.type==='boss'?2.4:.75);removeMesh(e.mesh);if(state.selected===e)selectObject(null);if(e.type==='boss'){$('#bossBar').classList.add('hidden');logEvent(`${BOSS_NAMES[state.mapIndex]} 已终止`,'');state.shake=.35}audio.sfx(e.type==='boss'?'bossDown':'kill');
}
function leakEnemy(e){if(e.dead)return;e.dead=true;state.leaks++;state.core=Math.max(0,state.core-ENEMIES[e.type].leak);explosion(e.pos,0xff5e70,1);removeMesh(e.mesh);logEvent(`${ENEMIES[e.type].name} 抵达中枢 · 完整度 -${ENEMIES[e.type].leak}%`,'danger');toast(`中枢遭到写入 · 完整度 ${Math.ceil(state.core)}%`,'danger');audio.sfx('leak');state.shake=.22;if(state.core<=0)endGame(false)}
function updateHealthBar(o){if(!o.mesh?.userData.health)return;const h=o.mesh.userData.health,ratio=Math.max(0,o.hp/o.maxHp),front=h.userData.front;front.scale.x=h.userData.width*ratio;front.position.x=-(h.userData.width-front.scale.x)/2;front.material.color.setHex(ratio<.3?0xff5c64:ratio<.6?0xf1b35f:o.type&&TOWERS[o.type]?0x65edcf:0xff8b78)}
function animateTower(t,dt){
 const p=t.mesh.userData.parts;for(const [i,m] of p.spin.entries()){m.rotation.z+=dt*(i%2?-.7:.7)}if(p.head&&t.type!=='gate'){p.head.rotation.y+=dt*.25}if(p.recoil&&t.recoil>0)p.recoil.position.z=.75-t.recoil*.12;if(t.type==='firewall')p.arms.forEach(m=>m.position.x=Math.sign(m.position.x)*(.34-t.recoil*.07));if(t.type==='honey')p.arms.forEach((m,i)=>{const a=state.time*1.4+i*Math.PI/2;m.position.x=Math.cos(a)*.48;m.position.z=Math.sin(a)*.48;m.position.y=.5+Math.sin(a*2)*.08});
 t.mesh.position.y=t.baseY+Math.sin(state.time*2+t.id)*.012;t.mesh.userData.shield.visible=t.shield>0;t.mesh.userData.shield.material.opacity=t.shield>0?.13+.05*Math.sin(state.time*5):0;t.mesh.userData.shield.rotation.y+=dt*.4;t.mesh.userData.encrypt.visible=t.encrypted>0;t.mesh.userData.status.visible=t.encrypted>0;
 if(t.hitFlash>0){t.hitFlash-=dt;t.mesh.rotation.z=Math.sin(state.time*50)*.025}else t.mesh.rotation.z*=.8;
 updateHealthBar(t);
}
function animateEnemy(e,dt){
 if(!e.mesh)return;e.mesh.position.copy(e.pos);const p=e.mesh.userData.parts,t=state.time*5+e.animOffset;
 for(const [i,s] of p.segments.entries()){s.position.x=Math.sin(t-i*.7)*.07;s.position.y=.3+Math.abs(Math.sin(t-i*.6))*.05}
 for(const [i,l] of p.legs.entries()){l.rotation.x=Math.sin(t+i*1.7)*.22}
 for(const [i,r] of p.spin.entries()){r.rotation.z+=dt*(i%2?-.9:.9)}for(const r of p.rotors)r.rotation.z+=dt*12;if(p.swarm?.visible){p.swarm.rotation.y+=dt*1.1;p.swarm.children.forEach((m,i)=>m.position.y=1.05+(i%2)*.25+Math.sin(t+i)*.12)}if(p.storm?.visible){p.storm.rotation.y-=dt*1.7;p.storm.rotation.z+=dt*.35}
 if(p.head){p.head.rotation.y+=dt*(e.type==='boss'?.22:.08);if(e.type==='ransom')p.head.rotation.x*=.85}if(e.hitFlash>0)e.mesh.rotation.z=Math.sin(state.time*48)*.09;else if(e.type==='hotspot')e.mesh.rotation.z=Math.sin(t*.45)*.08;else e.mesh.rotation.z*=.78;
 e.mesh.userData.shield.visible=e.shield>0;e.mesh.userData.shield.material.opacity=e.shield>0?.12+.04*Math.sin(state.time*7):0;e.mesh.userData.shield.rotation.y+=dt*.45;
 updateHealthBar(e);
}
function removeMesh(m){if(!m)return;m.parent?.remove(m)}
function beamEffect(a,b,color,life=.18){
 const d=b.clone().sub(a),len=d.length();if(len<.01)return;const m=mesh(new THREE.CylinderGeometry(.018,.035,len,5),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,depthWrite:false}),effectGroup);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(UP,d.normalize());m.castShadow=false;state.effects.push({mesh:m,life,max:life,type:'beam'});
}
function ringEffect(pos,color,radius=1,life=.5){const m=torus(effectGroup,.3,.025,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false}),pos.x,.18,pos.z);m.castShadow=false;state.effects.push({mesh:m,life,max:life,type:'ring',radius})}
function hitEffect(pos,color){const m=sphere(effectGroup,.13,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9}),pos.x,pos.y,pos.z);m.castShadow=false;state.effects.push({mesh:m,life:.28,max:.28,type:'hit'})}
function explosion(pos,color,size=1){ringEffect(pos,color,size*1.5,.55);for(let i=0;i<Math.min(14,6+size*4);i++){const m=mesh(shared.smallBox,new THREE.MeshBasicMaterial({color,transparent:true}),effectGroup,pos.x,pos.y+.4,pos.z);m.scale.setScalar(.35+random()*.5);m.castShadow=false;state.effects.push({mesh:m,life:.6+random()*.35,max:.9,type:'debris',velocity:new THREE.Vector3((random()-.5)*3,random()*2.5,(random()-.5)*3).multiplyScalar(size)})}}
function shockwave(pos,color){ringEffect(pos,color,1.5,.4);state.shake=Math.max(state.shake,.1)}
function updateEffects(dt){for(const e of state.effects){e.life-=dt;const r=Math.max(0,e.life/e.max);if(e.type==='ring'){const s=1+(1-r)*e.radius/.3;e.mesh.scale.setScalar(s);e.mesh.material.opacity=r*.8}else if(e.type==='routeLabel'){e.mesh.position.y+=dt*.22;e.mesh.material.opacity=Math.min(1,r*2)}else if(e.type==='debris'){e.mesh.position.addScaledVector(e.velocity,dt);e.velocity.y-=dt*4;e.mesh.rotation.x+=dt*5;e.mesh.material.opacity=r}else{e.mesh.material.opacity=r;e.mesh.scale.setScalar(e.type==='hit'?1+(1-r)*2:1)}if(e.life<=0){removeMesh(e.mesh);e.dead=true}}state.effects=state.effects.filter(e=>!e.dead)}
function updateTemporaryTerrain(){
 let dirty=false;for(const d of state.degraded)if(d.until<=state.time&&!d.done){d.done=true;const c=state.map.cells.find(c=>c.key===d.key);if(c?.degradeMesh){removeMesh(c.degradeMesh);c.degradeMesh=null}dirty=true}state.degraded=state.degraded.filter(d=>!d.done);
 for(const l of state.bossLocks)if(l.until<=state.time&&!l.done){l.done=true;removeMesh(l.mesh);dirty=true;logEvent('临时路由阻断已消退，链路恢复')}state.bossLocks=state.bossLocks.filter(l=>!l.done);
 for(const c of state.map.cells){if(c.emergencyUntil&&c.emergencyUntil<=state.time){c.emergencyUntil=0;c.cooldownUntil=state.time+5;if(c.emergencyMesh){removeMesh(c.emergencyMesh);c.emergencyMesh=null}dirty=true;logEvent('应急隔离器有效期结束，节点恢复直通')}}
 if(dirty){state.routeDirty=true;state.reroutes++}
}
function lerpAngle(a,b,t){let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;if(d<-Math.PI)d+=Math.PI*2;return a+d*t}

function updateBoss(e,dt){
 const ratio=e.hp/e.maxHp;
 if(state.mapIndex===2){const phase=ratio>.66?1:ratio>.33?2:3;if(phase!==e.phase){e.phase=phase;state.shake=.22;ringEffect(e.pos,phase===2?0xb77fff:0xff526b,3.2,1);logEvent(`蛰影进入「${phase===2?'提权':'破坏'}」阶段`,'danger');toast(`蛰影阶段转换 · ${phase===2?'提权：护甲强化并释放木马':'破坏：准备锁死运维环'}`,'danger');audio.sfx('boss');e.mesh.userData.parts.spin.forEach(m=>m.material=phase===2?materials.violet:materials.red);e.mesh.userData.parts.legs.forEach((a,i)=>a.rotation.z=(i?1:-1)*(phase-1)*.35);if(e.mesh.userData.parts.head)e.mesh.userData.parts.head.material=phase===2?materials.violet:materials.red;if(phase===2){for(let i=0;i<4;i++)spawnEnemy('trojan',e.entry,{pos:e.pos.clone().add(new THREE.Vector3((i-1.5)*.25,0,-.4))})}}}
 if(state.mapIndex===0&&ratio<.58&&!e.spawnedMinions){e.spawnedMinions=true;const parts=e.mesh.userData.parts;parts.swarm.visible=true;parts.head.material=materials.violet;parts.legs.forEach((l,i)=>l.rotation.z=(i%2?1:-1)*.25);for(let i=0;i<8;i++)spawnEnemy('worm',e.entry,{pos:e.pos.clone().add(new THREE.Vector3((random()-.5)*1.2,0,(random()-.5)*1.2)),clone:true});logEvent('万傀展开傀儡阵列，释放僵尸蠕虫群','danger');toast('万傀阶段 II · 傀儡阵列展开','danger');ringEffect(e.pos,0xb779ff,3,1)}
 if(state.mapIndex===1&&ratio<.6&&!e.storm){e.storm=true;const parts=e.mesh.userData.parts;parts.storm.visible=true;parts.head.material=materials.red;parts.legs.forEach(f=>f.rotation.z=.65);for(const t of state.towers)if(t.pos.distanceTo(e.pos)<5)t.shield=0;ringEffect(e.pos,0xba73ff,5,1.2);logEvent('蜃楼进入路由风暴阶段，附近设备护盾被削弱','danger');toast('蜃楼阶段 II · 路由风暴','danger');audio.sfx('boss')}
 $('#bossPhase').textContent=state.mapIndex===2?['潜伏','提权','破坏'][e.phase-1]:`阶段 ${ratio<(state.mapIndex===0?.58:.6)?'II':'I'}`;$('#bossSkill').textContent=e.skillTimer>0?`技能蓄能 ${Math.ceil(e.skillTimer)}s`:'正在选择目标';
 e.skillTimer-=dt;if(e.skillTimer>0)return;
 if(state.mapIndex===0){
  const isolated=state.map.cells.filter(c=>c.type==='node'&&isNodeBlocked(c));const target=isolated.sort((a,b)=>worldPos(a).distanceTo(e.pos)-worldPos(b).distanceTo(e.pos))[0];
  if(target){e.skillTimer=9;createTelegraph(target,2.2,'洪峰 · 节点冲击',()=>{if(target.tower)applyTowerDamage(target.tower,95,e);else damageEmergency(target,180);shockwave(worldPos(target),0xff5468);logEvent('万傀「洪峰」冲击隔离节点','danger')})}else e.skillTimer=3;
 }else if(state.mapIndex===1){
  const target=findSafeBossLock(e);if(target){e.skillTimer=11;createTelegraph(target,2.4,'伪路由 · 黑洞预警',()=>activateBossLock(target,6,'伪路由黑洞'));logEvent('蜃楼正在广播伪路由，注意预警位置','warn')}else e.skillTimer=3;
 }else{
  if(e.phase===3){const target=findSafeBossLock(e);if(target){e.skillTimer=10;createTelegraph(target,2.5,'破坏 · 运维环锁死',()=>activateBossLock(target,7,'运维环锁死'))}else e.skillTimer=3}else e.skillTimer=4;
 }
}
function findSafeBossLock(e){
 const candidates=[];if(e.path){for(let i=e.pathIndex+1;i<Math.min(e.path.length-1,e.pathIndex+5);i++)candidates.push(e.path[i])}
 for(const r of Object.values(state.routes))if(r.path)for(const c of r.path.slice(2,-2))candidates.push(c);
 const unique=[...new Set(candidates)].filter(c=>c&&!c.entry&&!c.core&&!isNodeBlocked(c)&&!state.telegraphs.some(t=>t.cell===c));
 return unique.find(c=>validateRoutes(c.key).ok)||null;
}
function createTelegraph(cell,delay,label,action){
 const pos=worldPos(cell,.2),ring=torus(effectGroup,.55,.045,new THREE.MeshBasicMaterial({color:0xff4e67,transparent:true,opacity:.9,depthWrite:false}),pos.x,.24,pos.z);const labelSprite=makeLabel(label,'#ff7b83',.8);labelSprite.position.set(pos.x,1.8,pos.z);effectGroup.add(labelSprite);
 state.telegraphs.push({cell,triggerAt:state.time+delay,ring,labelSprite,action,label});logEvent(`地形变更预警：${label}`,'warn');audio.sfx('alarm');
}
function updateTelegraphs(){
 for(const t of state.telegraphs){const remain=t.triggerAt-state.time;t.ring.rotation.z+=.06;t.ring.scale.setScalar(1+Math.sin(state.time*8)*.18);t.labelSprite.material.opacity=.65+.35*Math.sin(state.time*6);if(remain<=0&&!t.done){t.done=true;t.action();removeMesh(t.ring);removeMesh(t.labelSprite)}}state.telegraphs=state.telegraphs.filter(t=>!t.done);
}
function activateBossLock(cell,duration,label){
 if(!validateRoutes(cell.key).ok){logEvent('Boss 路由阻断已避开唯一连通路径');return}
 state.bossLocks.push({key:cell.key,until:state.time+duration,mesh:null});const pos=worldPos(cell);const g=new THREE.Group();g.position.copy(pos);effectGroup.add(g);const disk=cyl(g,.58,.68,.08,new THREE.MeshBasicMaterial({color:0x09030f}),0,.18,0,24);for(let i=0;i<3;i++){const r=torus(g,.35+i*.12,.025,i%2?materials.red:materials.violet,0,.25+i*.13,0);r.userData.spin=.8;animated.push(r)}state.bossLocks[state.bossLocks.length-1].mesh=g;state.routeDirty=true;state.reroutes++;ringEffect(pos,0xff526e,1.8,.6);logEvent(`${label}已生效，地面流量重新寻路`,'danger');
}
function damageEmergency(cell,amount){
 if(!cell.emergencyUntil||cell.emergencyUntil<=state.time)return;cell.emergencyHP-=amount;const h=cell.emergencyMesh?.userData.health;if(h){const ratio=Math.max(0,cell.emergencyHP/150);h.userData.front.scale.x=h.userData.width*ratio;h.userData.front.position.x=-(h.userData.width-h.userData.front.scale.x)/2}if(cell.emergencyHP<=0){cell.emergencyUntil=0;cell.cooldownUntil=state.time+5;if(cell.emergencyMesh){removeMesh(cell.emergencyMesh);cell.emergencyMesh=null}state.routeDirty=true;state.reroutes++;explosion(worldPos(cell),0xffa462,1);logEvent('应急隔离器被冲毁，节点旁路直通','danger')}
}
function validatePlacement(type,cell){
 if(!cell)return{ok:false,reason:'未选择有效地块'};const def=TOWERS[type];if(cell.tower)return{ok:false,reason:'此位置已有防御设备'};
 const valid=type==='gate'?cell.type==='node':type==='honey'?cell.type==='link':type==='firewall'?['link','node'].includes(cell.type):cell.type==='platform';
 if(!valid)return{ok:false,reason:type==='gate'?'网闸只能部署在交换节点':type==='honey'?'蜜罐只能部署在普通链路':type==='firewall'?'防火墙仅可部署于链路或交换节点':'远程与支援设备只能部署在抬高的设备平台'};
 if(cell.type==='node'&&cell.cooldownUntil>state.time)return{ok:false,reason:`节点旁路稳定中，${Math.ceil(cell.cooldownUntil-state.time)} 秒后可再次隔离`};
 if(state.cpu<def.cost)return{ok:false,reason:`算力不足，需要 ${def.cost}`};if(state.intel<def.intel)return{ok:false,reason:`情报不足，需要 ${def.intel}`};
 if(cell.type==='node'){const check=validateRoutes(cell.key);if(!check.ok)return check;return{ok:true,routes:check.routes}}
 return{ok:true};
}
function previewPlacement(type,cell){
 const check=validatePlacement(type,cell);if(!check.ok){toast(check.reason,'warn');audio.sfx('error');return false}
 if(type==='interceptor'){state.pending={kind:'orientation',type,cell,mesh:createTowerVisual(type),direction:0};const p=worldPos(cell,.4);state.pending.mesh.position.copy(p);ghostGroup.add(state.pending.mesh);showRange(cell,TOWERS.interceptor.range);$('#placementHint').innerHTML='<b>设置拦截器朝向</b> · 移动鼠标瞄准，左键确认，Esc 取消';$('#placementHint').classList.remove('hidden');return true}
 if(cell.type==='node'){
  state.pending={kind:'tower',type,cell,cost:TOWERS[type].cost,intel:TOWERS[type].intel,mesh:createTowerVisual(type)};const p=worldPos(cell,.15);state.pending.mesh.position.copy(p);ghostGroup.add(state.pending.mesh);state.previewRoutes=check.routes;for(const [id,r]of Object.entries(state.previewRoutes))r.changed=!samePath(state.routes[id]?.path,r.path);drawRoutes();showRouteConfirm();return true;
 }
 return deployTower(type,cell);
}
function deployTower(type,cell,direction=0,free=false){
 const check=validatePlacement(type,cell);if(!check.ok){if(!free){toast(check.reason,'warn');return null}}
 const def=TOWERS[type],t={id:state.idCounter++,type,name:def.name,cell,level:1,branch:null,hp:def.hp,maxHp:def.hp,shield:0,encrypted:0,cooldown:random()*.3,skillCooldown:0,direction,blocked:[],dead:false,animTime:random()*5,recoil:0,hitFlash:0,spent:def.cost};
 if(!free){state.cpu-=def.cost;state.intel-=def.intel}else t.spent=0;
 const y=cell.type==='platform'?.42:.13;t.baseY=y;t.pos=worldPos(cell,y);t.mesh=createTowerVisual(type);t.mesh.position.copy(t.pos);t.mesh.rotation.y=direction;t.mesh.userData.tower=t;unitGroup.add(t.mesh);cell.tower=t;state.towers.push(t);
 if(cell.type==='node'){state.routeDirty=true;state.reroutes++;logEvent(`${def.name}隔离 ${cell.x+1}-${cell.z+1} 节点，路由已收敛`)}else logEvent(`${def.name}已部署至 ${cell.x+1}-${cell.z+1}`);
 ringEffect(t.pos,type==='honey'?0xbb84ff:0x67edd8,1.2,.55);audio.sfx('deploy');updateHUD();return t;
}
function confirmPending(){
 const p=state.pending;if(!p)return;if(p.kind==='orientation'){const t=deployTower(p.type,p.cell,p.direction);if(t){removeMesh(p.mesh);state.pending=null;clearGhost();$('#placementHint').classList.add('hidden');selectObject(t)}return}
 if(p.kind==='tower'){const t=deployTower(p.type,p.cell);if(t){removeMesh(p.mesh);state.pending=null;state.previewRoutes=null;closeRouteConfirm();drawRoutes();selectObject(t)}}
 if(p.kind==='isolate'){useEmergency(p.cell)}
}
function closeRouteConfirm(){state.pending=null;state.previewRoutes=null;$('#routeConfirm').classList.add('hidden');clearGhost();if(state.map)drawRoutes()}
function showRouteConfirm(){
 const p=state.pending,routes=state.previewRoutes;const changed=Object.entries(routes).filter(([id,r])=>r.changed).map(([id])=>id);
 $('#routeConfirm').innerHTML=`<h3>路由变更预览</h3><p>白色虚线为确认后的新路线；当前路线保留显示。道路连通性已通过校验。</p><div class="route-diff">${Object.keys(routes).map(id=>`<span class="${routes[id].changed?'changed':''}">入口 ${id} ${routes[id].changed?'→ 重新收敛':'→ 保持原路'}</span>`).join('')}<span>消耗 ${TOWERS[p.type].cost} 算力${TOWERS[p.type].intel?` / ${TOWERS[p.type].intel} 情报`:''}</span></div><div class="actions"><button class="ghost-button" id="cancelRoute">取消</button><button class="primary-button" id="confirmRoute">确认隔离 · ${changed.join(' / ')}</button></div>`;
 $('#routeConfirm').classList.remove('hidden');$('#confirmRoute').onclick=confirmPending;$('#cancelRoute').onclick=closeRouteConfirm;
}
function upgradeTower(t,branch=null){
 if(!t||t.dead||t.level>=2||t.encrypted>0)return;if((t.type==='honey'||t.type==='interceptor')&&!branch){selectObject(t);return}
 const def=TOWERS[t.type],cost=def.upgrade,intel=branch?3:0;if(state.cpu<cost||state.intel<intel){toast('升级资源不足','warn');return}state.cpu-=cost;state.intel-=intel;t.level=2;t.branch=branch;t.maxHp=Math.round(t.maxHp*1.35);t.hp=Math.min(t.maxHp,t.hp+t.maxHp*.35);t.spent+=cost;
 const pos=t.pos.clone(),rot=t.direction;removeMesh(t.mesh);t.mesh=createTowerVisual(t.type,2,branch);t.mesh.position.copy(pos);t.mesh.rotation.y=rot;t.mesh.userData.tower=t;unitGroup.add(t.mesh);ringEffect(pos,branch?0xc38bff:0x69f4dc,1.5,.7);logEvent(`${t.name}升至 2 级${branch?` · ${branchName(t)}`:''}`);audio.sfx('upgrade');selectObject(t);updateHUD();
}
function branchName(t){return t.branch==='snare'?'禁锢协议':t.branch==='mirror'?'镜像应答':t.branch==='pierce'?'贯穿弹道':t.branch==='suppress'?'压制协议':''}
function useSkill(t){
 if(!t||t.dead||t.encrypted>0){toast('设备已加密，无法释放技能','warn');return}if(t.skillCooldown>0){toast(`技能冷却 ${Math.ceil(t.skillCooldown)} 秒`,'warn');return}
 if(t.type==='honey'){const targets=state.enemies.filter(e=>!e.dead&&e.type!=='hotspot'&&e.pos.distanceTo(t.pos)<2.8&&(e.luredBy===t||e.blockedBy===t));for(const e of targets){e.trapped=t.branch==='snare'?5:3;revealEnemy(e,'诱捕');ringEffect(e.pos,0xc18aff,.6,.7)}t.skillCooldown=16;logEvent(`蜜罐释放诱捕，困住 ${targets.length} 个目标`);ringEffect(t.pos,0xc18aff,2.8,.8);audio.sfx('skill')}
 if(t.type==='repair'){const targets=state.towers.filter(a=>!a.dead&&a.pos.distanceTo(t.pos)<3.8);for(const a of targets){a.shield=Math.min(80,a.shield+(t.level===2?55:38));a.encrypted=0;beamEffect(t.pos.clone().add(new THREE.Vector3(0,1,0)),a.pos.clone().add(new THREE.Vector3(0,.6,0)),0x75f4bd,.6)}t.skillCooldown=18;ringEffect(t.pos,0x75f4bd,3.8,1);logEvent(`冗余切换完成 · ${targets.length} 座设备获得护盾并解除加密`);audio.sfx('skill')}
 selectObject(t);
}
function sellTower(t){if(!t||t.dead)return;const refund=Math.floor(t.spent*.55);state.cpu=Math.min(999,state.cpu+refund);t.dead=true;t.cell.tower=null;if(t.cell.type==='node'){t.cell.cooldownUntil=state.time+5;state.routeDirty=true;state.reroutes++}removeMesh(t.mesh);ringEffect(t.pos,0x7f9ba4,1,.4);logEvent(`${t.name}已撤下，回收 ${refund} 算力`);selectObject(null);audio.sfx('click')}
function activateItem(id){
 const item=ITEMS[id];if(state.itemCooldown[id]>0){toast(`协议冷却 ${Math.ceil(state.itemCooldown[id])} 秒`,'warn');return}if(state[item.currency]<item.cost){toast(`${item.currency==='cpu'?'算力':'情报'}不足`,'warn');return}state.itemMode=state.itemMode===id?null:id;state.dragType=null;clearGhost();$$('.item-card').forEach(c=>c.classList.toggle('active',c.dataset.item===state.itemMode));$('#placementHint').innerHTML=state.itemMode?`<b>${item.name}</b> · 投放位置：${item.target} · 左键确认，Esc 取消`:'';$('#placementHint').classList.toggle('hidden',!state.itemMode);
}
function useItemAt(cell){
 const id=state.itemMode;if(!id||!cell)return;if(id==='isolate'){
  if(cell.type!=='node'||isNodeBlocked(cell)){toast('请选择一个直通交换节点','warn');return}if(cell.cooldownUntil>state.time){toast(`节点旁路稳定中，还需 ${Math.ceil(cell.cooldownUntil-state.time)} 秒`,'warn');return}const check=validateRoutes(cell.key);if(!check.ok){toast(check.reason,'danger');return}
  state.pending={kind:'isolate',cell};state.previewRoutes=check.routes;for(const [k,r]of Object.entries(check.routes))r.changed=!samePath(state.routes[k]?.path,r.path);drawRoutes();
  $('#routeConfirm').innerHTML=`<h3>应急隔离 · 路由预览</h3><p>临时隔离 14 秒 / 150 耐久。不会产生持续情报。</p><div class="route-diff">${Object.entries(check.routes).map(([k,r])=>`<span class="${r.changed?'changed':''}">入口 ${k} ${r.changed?'→ 改道':'→ 保持'}</span>`).join('')}</div><div class="actions"><button class="ghost-button" id="cancelRoute">取消</button><button class="primary-button" id="confirmRoute">投放隔离器</button></div>`;$('#routeConfirm').classList.remove('hidden');$('#confirmRoute').onclick=confirmPending;$('#cancelRoute').onclick=closeRouteConfirm;return;
 }
 if(id==='downgrade'){
  if(!['link','node'].includes(cell.type)){toast('协议降级只能投放在链路上','warn');return}const affected=state.map.cells.filter(c=>['link','node'].includes(c.type)&&Math.hypot(c.x-cell.x,c.z-cell.z)<=2.05);if(!affected.length)return;
  state.intel-=ITEMS[id].cost;state.itemCooldown[id]=ITEMS[id].cd;for(const c of affected){state.degraded.push({key:c.key,until:state.time+12});if(!c.degradeMesh){const p=worldPos(c);c.degradeMesh=box(effectGroup,CELL*.82,.025,CELL*.82,new THREE.MeshBasicMaterial({color:0xe3a459,transparent:true,opacity:.17,depthWrite:false}),p.x,.16,p.z)}}state.routeDirty=true;state.reroutes++;ringEffect(worldPos(cell),0xf1b66c,3.1,.9);logEvent(`协议降级覆盖 ${affected.length} 段链路，通行速度权重已更新`,'warn');toast('旧协议生效 · 地面减速 / 伪装显形 / 路线重选');audio.sfx('skill');cancelItem();return;
 }
 if(id==='backup'){const t=cell.tower;if(!t||t.hp>=t.maxHp&&t.encrypted<=0){toast('请选择受损或已加密的友塔','warn');return}state.cpu-=ITEMS[id].cost;state.itemCooldown[id]=ITEMS[id].cd;healTower(t,t.maxHp*.45);t.encrypted=0;ringEffect(t.pos,0x76efbd,1.3,.7);logEvent(`${t.name}备份还原完成，生命恢复并解除加密`);audio.sfx('skill');cancelItem();selectObject(t)}
}
function useEmergency(cell){
 if(!state.pending||state.pending.kind!=='isolate')return;if(state.intel<3){toast('情报不足','warn');return}state.intel-=3;state.itemCooldown.isolate=18;cell.emergencyUntil=state.time+14;cell.emergencyHP=150;const g=createTowerVisual('gate');g.scale.setScalar(.75);g.position.copy(worldPos(cell,.13));effectGroup.add(g);cell.emergencyMesh=g;state.routeDirty=true;state.reroutes++;logEvent(`应急隔离器已投放至 ${cell.x+1}-${cell.z+1}，有效期 14 秒`,'warn');audio.sfx('deploy');state.pending=null;state.previewRoutes=null;closeRouteConfirm();cancelItem();
}
function cancelItem(){state.itemMode=null;$$('.item-card').forEach(c=>c.classList.remove('active'));$('#placementHint').classList.add('hidden');clearGhost()}
function clearGhost(){clearGroup(ghostGroup)}
function showRange(cell,range,direction=null,threshold=.42){const old=ghostGroup.children.filter(o=>o.userData.range);old.forEach(removeMesh);if(!cell)return;const p=worldPos(cell,cell.type==='platform'?.45:.16),ring=torus(ghostGroup,range,.018,new THREE.MeshBasicMaterial({color:0x78ead7,transparent:true,opacity:.45,depthTest:false,toneMapped:false}),p.x,p.y,p.z);ring.userData.range=true;ring.castShadow=false;if(direction!==null){const half=Math.acos(threshold),vertices=[0,0,0],indices=[],segments=36;for(let i=0;i<=segments;i++){const a=-half+i/segments*half*2;vertices.push(Math.sin(a)*range,0,Math.cos(a)*range)}for(let i=1;i<=segments;i++)indices.push(0,i,i+1);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();const sector=mesh(geo,new THREE.MeshBasicMaterial({color:0x5de9db,transparent:true,opacity:.13,side:THREE.DoubleSide,depthWrite:false,depthTest:false,toneMapped:false}),ghostGroup,p.x,p.y+.015,p.z);sector.rotation.y=direction;sector.userData.range=true;sector.renderOrder=6;sector.castShadow=false}}
function detectionRing(cell,range){const p=worldPos(cell,cell.type==='platform'?.48:.19),ring=torus(ghostGroup,range,.022,new THREE.MeshBasicMaterial({color:0xf0b665,transparent:true,opacity:.7,depthTest:false,toneMapped:false}),p.x,p.y,p.z);ring.userData.range=true;ring.castShadow=false}
function previewDowngrade(cell){if(!cell)return;showRange(cell,CELL*2.05);for(const c of state.map.cells.filter(c=>['link','node'].includes(c.type)&&Math.hypot(c.x-cell.x,c.z-cell.z)<=2.05)){const p=worldPos(c),mark=box(ghostGroup,CELL*.82,.025,CELL*.82,new THREE.MeshBasicMaterial({color:0xf0b364,transparent:true,opacity:.22,depthWrite:false,toneMapped:false}),p.x,.18,p.z);mark.userData.range=true;mark.castShadow=false}}
function demoDragGhost(type,cell){clearGhost();const g=createTowerVisual(type);g.position.copy(worldPos(cell,.15));g.traverse(o=>{if(o.material){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.48}});ghostGroup.add(g);ringEffect(worldPos(cell),COLORS.A,.9,.6)}
function selectObject(obj){
 if(state.selected?.mesh?.userData.select)state.selected.mesh.userData.select.visible=false;state.selected=obj;ghostGroup.children.filter(o=>o.userData.range).forEach(removeMesh);const panel=$('#selectionPanel');if(!obj){panel.classList.add('hidden');return}if(obj.mesh?.userData.select)obj.mesh.userData.select.visible=true;
 if(obj.type&&TOWERS[obj.type]){renderTowerSelection(obj);if(TOWERS[obj.type].range)showRange(obj.cell,towerRange(obj),obj.type==='interceptor'?obj.direction:null,obj.branch==='suppress'?.15:.42);if(obj.type==='sandbox')detectionRing(obj.cell,towerRange(obj)*.72)}else if(obj.type&&ENEMIES[obj.type])renderEnemySelection(obj);else if(obj.x!==undefined)renderCellSelection(obj);
}
function renderTowerSelection(t){
 const def=TOWERS[t.type],ratio=Math.max(0,t.hp/t.maxHp*100);let branches='';if(t.level===1&&(t.type==='honey'||t.type==='interceptor')){branches=`<div class="branch-actions">${t.type==='honey'?`<button class="branch-button" data-branch="snare"><b>禁锢协议</b><span>诱捕延长至 5 秒，阻挡容量 +1</span></button><button class="branch-button" data-branch="mirror"><b>镜像应答</b><span>伪造反击，提升诱敌战斗能力</span></button>`:`<button class="branch-button" data-branch="pierce"><b>贯穿弹道</b><span>命中贯穿附近两个目标</span></button><button class="branch-button" data-branch="suppress"><b>压制协议</b><span>扩大扇区，命中减速 2.5 秒</span></button>`}</div>`}
 $('#selectionPanel').innerHTML=`<div class="selection-head">${icon(t.type)}<div><h3>${t.name}</h3><small>${def.role}${t.branch?` · ${branchName(t)}`:''}</small></div><div class="level-pips"><i class="on"></i><i class="${t.level===2?'on':''}"></i></div></div><div class="health-row"><div><span>设备生命</span><b>${Math.ceil(t.hp)} / ${t.maxHp}</b></div><div class="health-bar"><i style="width:${ratio}%"></i></div></div><div class="status-tags"><span class="status-tag">${t.cell.type==='node'?'节点隔离中':t.cell.type==='platform'?'远程平台':'链路设备'}</span>${t.encrypted>0?`<span class="status-tag encrypted">加密 ${t.encrypted.toFixed(1)}s</span>`:''}${t.shield>0?`<span class="status-tag">护盾 ${Math.ceil(t.shield)}</span>`:''}</div><p class="selection-desc">${def.desc}${t.branch==='pierce'?' 当前贯穿弹道会命中两个额外目标。':t.branch==='suppress'?' 当前压制协议扩大攻击扇区并使目标减速。':t.branch==='snare'?' 当前禁锢协议延长诱捕并增加阻挡容量。':t.branch==='mirror'?' 当前镜像应答强化伪造反击。':''}</p><div class="selection-stats"><div><b>${def.range?towerRange(t).toFixed(1):'—'}</b><small>作用范围</small></div><div><b>${towerCapacity(t)||'—'}</b><small>阻挡容量</small></div><div><b>${t.level}</b><small>设备等级</small></div></div>${branches}<div class="selection-actions">${t.level===1&&!((t.type==='honey'||t.type==='interceptor'))?`<button class="primary-button" id="upgradeTower">升至 2 级 · ${def.upgrade} 算力</button>`:''}${def.skill?`<button class="primary-button" id="skillTower">${def.skill}${t.skillCooldown>0?` · ${Math.ceil(t.skillCooldown)}s`:''}</button>`:''}<button class="danger-button" id="sellTower">撤下 · 返还 ${Math.floor(t.spent*.55)}</button></div>`;
 $('#selectionPanel').classList.remove('hidden');$('#upgradeTower')&&($('#upgradeTower').onclick=()=>upgradeTower(t));$$('[data-branch]').forEach(b=>b.onclick=()=>upgradeTower(t,b.dataset.branch));$('#skillTower')&&($('#skillTower').onclick=()=>useSkill(t));$('#sellTower').onclick=()=>sellTower(t);
}
function renderEnemySelection(e){
 const def=ENEMIES[e.type],name=e.type==='boss'?BOSS_NAMES[state.mapIndex]:def.name;$('#selectionPanel').innerHTML=`<div class="selection-head">${icon(def.icon)}<div><h3>${name}</h3><small>${e.entry} 入口 · ${e.type==='hotspot'?'无线层飞行':'地面恶意进程'}</small></div></div><div class="health-row"><div><span>威胁生命</span><b>${Math.ceil(e.hp)} / ${Math.ceil(e.maxHp)}</b></div><div class="health-bar"><i style="width:${Math.max(0,e.hp/e.maxHp*100)}%;background:var(--red)"></i></div></div><div class="status-tags">${!e.revealed?'<span class="status-tag encrypted">伪装 / 潜伏</span>':'<span class="status-tag">已显形</span>'}${e.shield>0?`<span class="status-tag">护盾 ${Math.ceil(e.shield)}</span>`:''}${e.blockedBy?`<span class="status-tag">被 ${e.blockedBy.name} 阻挡</span>`:''}${e.slow>0?'<span class="status-tag">压制减速</span>':''}</div><p class="selection-desc">${def.desc}</p><div class="selection-stats"><div><b>${Math.ceil(e.hp)}</b><small>当前生命</small></div><div><b>${e.damage}</b><small>攻塔强度</small></div><div><b>${def.leak}%</b><small>中枢损伤</small></div></div>`;$('#selectionPanel').classList.remove('hidden');
}
function renderCellSelection(c){
 const names={node:'交换节点',link:c.old?'旧链路':'网络链路',platform:'设备平台',empty:'数据设施 / 障碍',entry:'网络入口',core:'核心中枢'};const status=c.type==='node'?(isNodeBlocked(c)?'已隔离 · 道路截断':'设备旁路 · 直通'):c.old?'旧协议 · 地面减速与显形':'正常业务通行';
 $('#selectionPanel').innerHTML=`<div class="selection-head">${icon(c.type==='node'?'gate':'core')}<div><h3>${names[c.type]}</h3><small>网格坐标 ${c.x+1}-${c.z+1}</small></div></div><div class="status-tags"><span class="status-tag">${status}</span>${isOldCell(c)?'<span class="status-tag">旧协议生效</span>':''}${c.emergencyUntil>state.time?`<span class="status-tag">隔离器 ${Math.ceil(c.emergencyHP)}/150 · ${Math.ceil(c.emergencyUntil-state.time)}s</span>`:''}${c.cooldownUntil>state.time?`<span class="status-tag">旁路稳定 ${Math.ceil(c.cooldownUntil-state.time)}s</span>`:''}</div><p class="selection-desc">${c.type==='node'?'部署防火墙、网闸或应急隔离器可截断此格。任何操作均需维持所有入口和地面敌人的连通。':c.type==='platform'?'抬高平台，用于部署拦截器、沙箱和修复进程，敌人不能通行。':c.old?'保留旧协议的道路。地面敌人通行速度降低，伪装木马显形，寻路会将较低速度计入成本。':'链路承载恶意程序与正常业务。防火墙和蜜罐不会截断道路。'}</p>`;$('#selectionPanel').classList.remove('hidden');
}

function eventPointer(e){const r=renderer.domElement.getBoundingClientRect();mouse.x=(e.clientX-r.left)/r.width*2-1;mouse.y=-(e.clientY-r.top)/r.height*2+1;raycaster.setFromCamera(mouse,camera);pointer.x=e.clientX;pointer.y=e.clientY}
function pickCell(e){eventPointer(e);const hits=raycaster.intersectObjects(state.map.cells.map(c=>c.hit).filter(Boolean),false);return hits[0]?.object.userData.cell||null}
function pickUnit(e){eventPointer(e);const hits=raycaster.intersectObjects(unitGroup.children,true);for(const h of hits){let o=h.object;while(o&&o!==unitGroup){if(o.userData.tower&&!o.userData.tower.dead)return o.userData.tower;if(o.userData.enemy&&!o.userData.enemy.dead)return o.userData.enemy;o=o.parent}}return null}
function groundPoint(e){eventPointer(e);const p=new THREE.Vector3();return raycaster.ray.intersectPlane(groundPlane,p)?p:null}
function onPointerDown(e){
 audio.init();if(state.screen!=='game'||state.demo)return;if(e.button===1){e.preventDefault();pointer.down=true;pointer.button=1;pointer.lastX=e.clientX;pointer.lastY=e.clientY;pointer.moved=false;return}
 if(e.button!==0)return;pointer.down=true;pointer.button=0;pointer.lastX=e.clientX;pointer.lastY=e.clientY;pointer.moved=false;
 if(state.pending?.kind==='orientation'){confirmPending();return}
 const cell=pickCell(e);if(state.itemMode){useItemAt(cell);return}
}
function onPointerMove(e){
 if(state.screen!=='game')return;const dx=e.clientX-pointer.lastX,dy=e.clientY-pointer.lastY;if(pointer.down&&Math.abs(dx)+Math.abs(dy)>2)pointer.moved=true;
 if(pointer.down&&pointer.button===1){if(e.shiftKey){const scale=cameraRig.radius*.0016;const right=new THREE.Vector3().setFromMatrixColumn(camera.matrix,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrix,1);cameraRig.desiredTarget.addScaledVector(right,-dx*scale).addScaledVector(up,dy*scale);cameraRig.target.copy(cameraRig.desiredTarget)}else{cameraRig.theta-=dx*.006;cameraRig.phi=Math.max(.28,Math.min(1.25,cameraRig.phi-dy*.005))}pointer.lastX=e.clientX;pointer.lastY=e.clientY;return}
 if(state.pending?.kind==='orientation'){const p=groundPoint(e);if(p){const center=worldPos(state.pending.cell);state.pending.direction=Math.atan2(p.x-center.x,p.z-center.z);state.pending.mesh.rotation.y=state.pending.direction;showRange(state.pending.cell,TOWERS.interceptor.range,state.pending.direction)}return}
 if(state.itemMode&&!state.pending){const cell=pickCell(e);if(cell!==state.hover){state.hover=cell;clearGhost();if(cell){if(state.itemMode==='downgrade')previewDowngrade(cell);else if(state.itemMode==='isolate'&&cell.type==='node')showRange(cell,.82);else if(state.itemMode==='backup'&&cell.tower)showRange(cell,1.0)}}return}
 if(state.dragType){const cell=pickCell(e);if(cell!==state.hover){state.hover=cell;clearGhost();if(cell){const g=createTowerVisual(state.dragType);g.position.copy(worldPos(cell,cell.type==='platform'?.42:.14));g.traverse(o=>{if(o.material){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.55}});g.userData.dragGhost=true;ghostGroup.add(g);showRange(cell,TOWERS[state.dragType].range)}}return}
 if(!pointer.down){const cell=pickCell(e);state.hover=cell}
}
function onPointerUp(e){
 if(state.screen!=='game'||state.demo){pointer.down=false;return}
 if(state.dragType&&pointer.button!==1){const cell=pickCell(e),type=state.dragType;state.dragType=null;clearGhost();previewPlacement(type,cell);pointer.down=false;return}
 if(pointer.button===0&&!pointer.moved&&e.target===renderer.domElement&&!state.itemMode&&!state.pending){const unit=pickUnit(e);if(unit)selectObject(unit);else selectObject(pickCell(e))}
 pointer.down=false;
}
function onWheel(e){if(state.screen!=='game')return;e.preventDefault();cameraRig.desiredRadius=Math.max(9,Math.min(38,cameraRig.desiredRadius*(e.deltaY>0?1.08:.92)))}
function updateForecast(){
 if(!state.map)return;const wave=Math.min(state.map.meta.waves,state.wave+1),comp=waveComposition(wave,state.mapIndex);$('#forecastList').innerHTML=state.map.meta.entries.map(entry=>{
  const threats=comp.filter(s=>s.entry===entry.id),counts={};threats.forEach(s=>counts[s.type]=(counts[s.type]||0)+1);const path=state.routes[entry.id]?.path,target=path?.length?state.map.cells.find(c=>c===path[path.length-1]):null;
  return `<div class="forecast-entry ${state.routes[entry.id]?.changed?'rerouted':''}"><div><span class="entry-badge" style="color:${CSS_COLORS[entry.id]}">${entry.id}</span><b>${entry.name}</b><span class="route-target">→ ${target?.core||'中枢'}${state.routes[entry.id]?.changed?' · 改道':''}</span></div><div class="threat-chips">${Object.entries(counts).slice(0,4).map(([type,n])=>`<span class="threat-chip">${icon(ENEMIES[type].icon)}${ENEMIES[type].name} ×${n}</span>`).join('')||'<span class="threat-chip empty">等待流量预报</span>'}</div></div>`}).join('');
}
function updateHUDThrottled(){state.uiTimer=(state.uiTimer||0)+1;if(state.uiTimer%12===0)updateHUD()}
function updateHUD(){
 if(!state.map)return;$('#sectorCode').textContent=state.map.meta.code;$('#sectorName').textContent=state.map.meta.name;$('#cpuValue').textContent=Math.floor(state.cpu);$('#intelValue').textContent=Math.floor(state.intel);$('#coreValue').textContent=`${Math.ceil(state.core)}%`;$('#coreBar').style.width=state.core+'%';$('#coreBar').style.background=state.core<35?'var(--red)':'var(--blue)';$('#waveValue').textContent=String(state.wave).padStart(2,'0');$('#waveTotal').textContent=state.map.meta.waves;$('#waveState').textContent=state.waveActive?(state.spawnQueue.length?'入侵进行中':'清除残余威胁'):(state.nextWave>0?`${Math.ceil(state.nextWave)}s 后接敌`:'布防阶段');$('#pauseBtn use').setAttribute('href',state.paused?'#i-play':'#i-pause');$('#speedBtn').textContent=state.speed+'×';
 const start=$('#startWaveBtn');start.style.display=state.waveActive||state.wave>=state.map.meta.waves||state.demo?'none':'';start.innerHTML=state.nextWave>0?`提前迎敌 +${Math.ceil(state.nextWave)*2} 算力 ${icon('play')}`:`启动第 ${state.wave+1} 波 ${icon('play')}`;
 $('#objectiveText').textContent=state.waveActive?`${state.enemies.filter(e=>!e.dead).length} 个活跃威胁 · 维持业务连通并守住中枢`:'部署设备，维持各入口到中枢的业务连通';
 $$('.tower-card').forEach(c=>{const d=TOWERS[c.dataset.type];c.classList.toggle('disabled',state.cpu<d.cost||state.intel<d.intel)});$$('.item-card').forEach(c=>{const id=c.dataset.item,d=ITEMS[id],cd=state.itemCooldown[id];c.classList.toggle('disabled',state[d.currency]<d.cost&&cd<=0);let overlay=c.querySelector('.cooldown');if(cd>0){if(!overlay){overlay=document.createElement('i');overlay.className='cooldown';c.appendChild(overlay)}overlay.textContent=`${Math.ceil(cd)}s`}else overlay?.remove()});
 if(state.selected&&state.uiTimer%24===0&&!state.paused){const o=state.selected;if(!o.dead){const bar=$('#selectionPanel .health-bar i'),value=$('#selectionPanel .health-row b');if(bar)bar.style.width=Math.max(0,o.hp/o.maxHp*100)+'%';if(value)value.textContent=`${Math.ceil(o.hp)} / ${Math.ceil(o.maxHp)}`;if(TOWERS[o.type]){const skill=$('#skillTower');if(skill){skill.textContent=`${TOWERS[o.type].skill}${o.skillCooldown>0?` · ${Math.ceil(o.skillCooldown)}s`:''}`;skill.disabled=o.skillCooldown>0||o.encrypted>0}const tags=$('#selectionPanel .status-tags');let enc=tags?.querySelector('.encrypted');if(o.encrypted>0){if(!enc&&tags){enc=document.createElement('span');enc.className='status-tag encrypted';tags.appendChild(enc)}if(enc)enc.textContent=`加密 ${o.encrypted.toFixed(1)}s`}else enc?.remove()}}}
 const boss=state.enemies.find(e=>e.type==='boss'&&!e.dead);if(boss){$('#bossHealth').style.width=Math.max(0,boss.hp/boss.maxHp*100)+'%'}
}
function buildTowerCards(){
 $('#towerCards').innerHTML=Object.entries(TOWERS).map(([id,t],i)=>`<div class="tower-card" data-type="${id}" tabindex="0"><svg><use href="#i-${ICONS[id]}"/></svg><b>${t.name}</b><span class="role">${t.role.split('·')[0]}</span><div class="tower-cost"><span>${icon('cpu')}${t.cost}</span>${t.intel?`<span>${icon('intel')}${t.intel}</span>`:''}</div><span class="hotkey">0${i+1}</span></div>`).join('');
 $$('.tower-card').forEach(card=>{card.addEventListener('pointerdown',e=>{if(state.demo)return;e.preventDefault();audio.init();state.dragType=card.dataset.type;state.pending=null;state.itemMode=null;pointer.button=0;pointer.down=false;state.hover=null;clearGhost();$('#placementHint').innerHTML=`拖放 <b>${TOWERS[state.dragType].name}</b> 到有效地块 · Esc 取消`;$('#placementHint').classList.remove('hidden')});card.addEventListener('mouseenter',e=>showCardTooltip(e,TOWERS[card.dataset.type].name,TOWERS[card.dataset.type].desc));card.addEventListener('mouseleave',hideTooltip)});
 $('#itemCards').innerHTML=Object.entries(ITEMS).map(([id,d])=>`<button class="item-card" data-item="${id}">${icon(d.icon)}<div><b>${d.name}</b><small>${d.target} · ${d.cd}s 冷却</small></div><span>${icon(d.currency)}${d.cost}</span></button>`).join('');$$('.item-card').forEach(c=>{c.onclick=()=>activateItem(c.dataset.item);c.onmouseenter=e=>showCardTooltip(e,ITEMS[c.dataset.item].name,ITEMS[c.dataset.item].desc);c.onmouseleave=hideTooltip});
}
function showCardTooltip(e,title,text){const tip=$('#tooltip');tip.innerHTML=`<b>${title}</b>${text}`;tip.classList.remove('hidden');tip.style.left=Math.min(innerWidth-275,e.clientX-270)+'px';tip.style.top=Math.min(innerHeight-160,e.clientY+10)+'px'}
function hideTooltip(){$('#tooltip').classList.add('hidden')}
function logEvent(text,kind=''){const log=$('#eventLog');if(!log)return;const p=document.createElement('p');p.className=kind;p.textContent=`${formatTime(state.time)} ${text}`;log.prepend(p);while(log.children.length>6)log.lastChild.remove()}
function toast(text,kind=''){const t=document.createElement('div');t.className='toast '+kind;t.textContent=text;$('#toastStack').appendChild(t);if(state.exportMode){t.dataset.until=state.time+2.6;return}setTimeout(()=>{t.style.opacity=0;t.style.transform='translateY(-8px)';t.style.transition='.3s';setTimeout(()=>t.remove(),300)},2600)}
function formatTime(s){const m=Math.floor(s/60),ss=Math.floor(s%60);return`${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`}
function togglePause(force){if(!state.running)return;state.paused=force===undefined?!state.paused:force;$('#pauseModal').classList.toggle('hidden',!state.paused);updateHUD();audio.sfx('click')}
function endGame(victory){if(!state.running)return;state.running=false;state.paused=true;const score=Math.max(0,Math.round(state.core*50+state.kills*35+state.wave*180-state.lost*80-state.leaks*40));$('#reportTitle').textContent=victory?'事件报告 · 威胁已遏制':'事件报告 · 中枢已失陷';$('#reportDesc').textContent=victory?`${state.map.meta.name}全部 ${state.map.meta.waves} 波恶意流量已清除。业务链路保持连通，守护进程完成本轮防御。`:`中枢完整度归零，汐域已启动灾难恢复。重新调整隔离节点和火力覆盖，再次执行防御。`;$('#reportSeal').style.color=victory?'var(--cyan)':'var(--red)';$('#reportStats').innerHTML=[['遏制威胁',state.kills],['中枢完整度',Math.ceil(state.core)+'%'],['路由收敛',state.reroutes],['设备损失',state.lost]].map(([a,b])=>`<div><b>${b}</b><span>${a}</span></div>`).join('');const grade=!victory?'D':state.core>85&&state.lost<4?'S':state.core>65?'A':'B';$('#reportGrade').textContent=grade;$('#reportScore').textContent=String(score).padStart(6,'0');$('#reportModal').classList.remove('hidden');audio.sfx(victory?'victory':'bossDown')}
function buildSectorList(){
 $('#sectorList').innerHTML=MAP_META.map((m,i)=>`<article class="sector-card"><span class="sector-num">0${i+1}</span><span class="tag">${m.kind} / ${m.code}</span><h3>${m.name}</h3><span class="en">${m.en}</span><div class="sector-diagram"><svg viewBox="0 0 240 90"><path d="${i===0?'M20 12v66h80V12h80v66h40M20 44h200M100 44h40V12m0 32v34':i===1?'M20 12v25h80v42h60V37h60M20 62h80m60 0h60M55 12v50m140-50v50M20 37h200':'M20 10v70h80V35h90V10M40 10v40h40m70 0h70V10M100 35v45h50M20 55h80'}" fill="none" stroke="currentColor" stroke-width="1.5"/><g fill="#0d343a">${[20,60,100,140,180,220].map((x,j)=>`<circle cx="${x}" cy="${j%2?55:35}" r="5" stroke="currentColor"/>`).join('')}</g></svg></div><p>${m.desc}</p><div class="sector-features">${m.features.map(f=>`<span>${f}</span>`).join('')}<span>${m.waves} 波</span></div><button class="primary-button" data-launch="${i}">进入${m.name} ${icon('arrow')}</button></article>`).join('');$$('[data-launch]').forEach(b=>b.onclick=()=>{audio.init();resetGame(+b.dataset.launch)})
}
const MANUAL={
 towers:()=>({title:'设备手册',sub:'所有设备均有生命值；二级升级会改变模型与实战能力。',cards:Object.entries(TOWERS).map(([id,t])=>({icon:id,name:t.name,role:t.role,desc:t.desc,meta:`<span>${t.cost} 算力</span>${t.intel?t.intel+' 情报':''} · 初始耐久 ${t.hp}`}))}),
 enemies:()=>({title:'威胁档案',sub:'恶意程序不只前往中枢，也会攻击、加密并摧毁防守设备。',cards:[...Object.entries(ENEMIES).filter(([id])=>id!=='boss').map(([id,e])=>({icon:e.icon,name:e.name,role:`生命 ${e.hp} · 中枢损伤 ${e.leak}%`,desc:e.desc,enemy:true,meta:`<span>回收 ${e.reward} 算力</span>`})),...MAP_META.map((m,i)=>({icon:'boss',name:m.boss,role:`${m.name} · 最终波 Boss`,desc:['群体控制核心。「洪峰」预警后重创隔离设备；生命降低后释放蠕虫群。','路由欺骗核心。「伪路由」预警后制造临时黑洞，改变可选道路；低生命发动路由风暴。','潜伏时需检测才能被单体拦截选中；提权强化护甲并释放木马；破坏阶段预警后锁死运维环。'][i],enemy:true,boss:true,meta:'<span>独立阶段模型</span>地形变化前预警'}))]}),
 items:()=>({title:'应急协议',sub:'投放位置和范围在确认前可见；冷却统一受暂停与速度控制。',cards:Object.entries(ITEMS).map(([id,d])=>({icon:id,name:d.name,role:d.target,desc:d.desc,meta:`<span>${d.cost} ${d.currency==='cpu'?'算力':'情报'}</span>冷却 ${d.cd} 秒`})).concat([{icon:'intel',name:'资源约束',role:'算力与情报不可互换',desc:'算力随时间增长并通过消灭敌人回收；情报来自波次、重点威胁和持续守住隔离节点。撤下返还 55% 已投入算力，被摧毁不返还。',meta:'<span>谨慎选择改道代价</span>'}])}),
 systems:()=>({title:'地形、路由与状态',sub:'操作说明与实时规则保持一致。',rows:[['链路与设备平台','链路承载敌人和业务流量，防火墙与蜜罐在其上阻挡但不截断道路。抬高的平台部署拦截器、沙箱和修复进程，敌人不能通行。'],['交换节点与旁路','防火墙、网闸和应急隔离器会截断节点。设备被摧毁、撤下或隔离器失效后恢复直通；再次隔离有 5 秒稳定间隔。'],['旧链路与协议降级','旧协议使地面敌人速度降至 56%，木马显形。寻路按 1.85 倍通行成本计算，降级开始和结束都会实时重新寻路。'],['路由预览与连通','节点操作前显示各入口白色虚线新路线。会封死任一入口或地面敌人的操作会被拒绝，不消耗资源。改道时敌人从当前位置连续转向。'],['检测、护盾与加密','沙箱、旧链路、阻挡与诱捕使伪装显形。护盾优先吸收伤害。勒索者的加密使塔停止攻击、治疗和释放技能，但不解除阻挡或隔离；修复技能和备份还原可解除。'],['镜头与快捷键','中键拖动环绕，Shift + 中键平移，滚轮缩放，R 回到默认视角。左键点选或拖放部署；空格暂停，1—6 选择设备，Esc 取消当前操作。'],['胜负与波次','敌人进入出口使中枢完整度下降，归零失败。完成本图全部攻击波即胜利。结算事件报告统计击杀、完整度、改道和设备损失。']]})
};
function renderManual(tab='towers'){$$('#manualTabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));const d=MANUAL[tab]();$('#manualContent').innerHTML=`<div class="manual-intro"><h3>${d.title}</h3><p>${d.sub}</p></div>${d.cards?`<div class="manual-grid">${d.cards.map(c=>`<article class="manual-card ${c.enemy?'enemy':''} ${c.boss?'boss':''}">${icon(c.icon)}<h4>${c.name}</h4><span class="manual-role">${c.role}</span><p>${c.desc}</p><div class="manual-meta">${c.meta||''}</div></article>`).join('')}</div>`:d.rows.map(r=>`<div class="system-row"><h4>${r[0]}</h4><p>${r[1]}</p></div>`).join('')}`}
const audio={ctx:null,master:null,muted:false,volume:.45,ambient:[],nextBeat:0,beat:0,
 init(){if(this.ctx){this.ctx.resume?.();return}try{this.ctx=new(window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=this.volume;this.master.connect(this.ctx.destination);const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=420;filter.connect(this.master);for(let i=0;i<3;i++){const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=i===0?'sine':'triangle';o.frequency.value=[55,82.4,110][i];g.gain.value=[.025,.012,.008][i];o.connect(g);g.connect(filter);o.start();this.ambient.push({o,g})}this.nextBeat=this.ctx.currentTime}catch(e){}},
 setVolume(v){this.volume=+v;if(this.master)this.master.gain.setTargetAtTime(this.muted?0:this.volume,this.ctx.currentTime,.05);$('#volume').value=v;$('#pauseVolume').value=v},
 setMap(i){if(!this.ctx)return;const bases=[[55,82.4,110],[48,72,96],[43.6,65.4,87.3]][i];this.ambient.forEach((a,j)=>a.o.frequency.setTargetAtTime(bases[j],this.ctx.currentTime,1))},
 update(){if(!this.ctx||this.ctx.state!=='running'||this.muted)return;const now=this.ctx.currentTime;if(now>=this.nextBeat){this.nextBeat=now+(state.screen==='game'?.48:1.15);const scale=state.mapIndex===2?[0,3,7,10]:state.mapIndex===1?[0,5,7,12]:[0,4,7,11],base=state.mapIndex===2?110:146.8,f=base*Math.pow(2,scale[this.beat++%scale.length]/12);this.tone(f,.12,'sine',.018);if(this.beat%4===0)this.tone(55,.08,'sine',.04)}},
 tone(freq,duration,type='sine',gain=.06,slide=1){if(!this.ctx||this.muted)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain(),now=this.ctx.currentTime;o.type=type;o.frequency.setValueAtTime(freq,now);o.frequency.exponentialRampToValueAtTime(Math.max(20,freq*slide),now+duration);g.gain.setValueAtTime(gain,now);g.gain.exponentialRampToValueAtTime(.0001,now+duration);o.connect(g);g.connect(this.master);o.start(now);o.stop(now+duration+.02)},
 sfx(kind){if(!this.ctx)return;const sounds={click:[420,.05,'sine',.035,1.2],deploy:[180,.24,'triangle',.08,2],upgrade:[320,.35,'sine',.07,2],shoot:[720,.07,'square',.018,.45],hit:[110,.09,'sawtooth',.035,.5],kill:[250,.12,'triangle',.025,1.6],destroy:[95,.4,'sawtooth',.07,.3],error:[150,.18,'square',.035,.8],wave:[220,.35,'triangle',.05,1.8],alarm:[180,.55,'sawtooth',.055,1.6],boss:[65,.8,'sawtooth',.08,.5],bossDown:[140,.8,'triangle',.08,.3],leak:[90,.45,'square',.06,.55],skill:[280,.5,'sine',.06,2.4],sandbox:[190,.16,'triangle',.025,1.3],victory:[330,.8,'sine',.07,2]};const s=sounds[kind]||sounds.click;this.tone(...s);if(kind==='victory')setTimeout(()=>this.tone(660,.6,'sine',.05,1.5),250)}
};

const DEMO_DEFS={
 'demo-1':{map:0,duration:18,title:'实战演示 01 · 分段取舍'},
 'demo-2':{map:1,duration:20,title:'实战演示 02 · 旁路直通'},
 'demo-3':{map:2,duration:20,title:'实战演示 03 · 蛰影现身'}
};
function demoTower(type,x,z,direction=0){return deployTower(type,getCell(x,z),direction,true)}
function demoEnemy(type,entry,x,z,hpScale=1){const e=spawnEnemy(type,entry,{pos:worldPos({x,z},type==='hotspot'?2.65:.26)});e.hp*=hpScale;e.maxHp=e.hp;if(type!=='hotspot'){e.path=findPath(nearestCell(e.pos),entry)||findPath(getCell(state.map.entries[entry].x,state.map.entries[entry].z),entry);e.pathIndex=Math.min(1,e.path.length-1)}return e}
function startDemo(id,exporting=false){
 const def=DEMO_DEFS[id];if(!def)return;resetGame(def.map);state.demo={id,time:0,duration:def.duration,events:[],cursor:null,subtitle:'',exporting};state.exportMode=exporting;state.exportLastFrame=-1;state.paused=false;state.speed=1;state.wave=id==='demo-1'?7:id==='demo-2'?10:16;state.waveActive=true;state.cpu=520;state.intel=12;document.body.classList.add('demo-mode');document.body.classList.toggle('export-mode',exporting);$('#demoOverlay').classList.remove('hidden');$('#demoTitle').textContent=def.title;$('#demoCursor').classList.remove('hidden');$('#bossBar').classList.toggle('hidden',id!=='demo-3');audio.setMap(def.map);
 if(id==='demo-1')setupDemo1();if(id==='demo-2')setupDemo2();if(id==='demo-3')setupDemo3();
 updateRoutes();updateForecast();updateHUD();logEvent(`演示 ${def.title} 已开始 · 随时可退出`);updateDemo(0);renderer.render(scene,camera);
}
function demoAt(time,action){state.demo.events.push({time,action,done:false})}
function setupDemo1(){
 demoTower('interceptor',3,3,.7);demoTower('interceptor',4,4,0);demoTower('sandbox',4,7);demoTower('repair',3,6);demoTower('interceptor',8,4,-1.2);demoTower('firewall',6,7);demoTower('firewall',10,5);
 demoEnemy('worm','A',1,1);demoEnemy('worm','A',1,2);demoEnemy('trojan','A',1,1.4);demoEnemy('worm','A',2,2);demoEnemy('ransom','A',1,0);
 demoEnemy('flood','B',10,5,1.2);demoEnemy('worm','B',9,5);demoEnemy('worm','B',8,5);demoEnemy('packer','B',11,4);demoEnemy('ransom','B',11,3);
 state.spawnQueue=[{time:8,type:'worm',entry:'A'},{time:9,type:'worm',entry:'B'},{time:11,type:'trojan',entry:'A'},{time:12,type:'flood',entry:'B'},{time:14,type:'worm',entry:'A'}];state.spawnTime=0;
 demoAt(2.4,()=>demoDragGhost('gate',getCell(1,3)));demoAt(4.8,()=>{const cell=getCell(1,3);clearGhost();previewPlacement('gate',cell);state.demo.cursorLabel='释放 · 预览新路线'});demoAt(7.0,()=>{confirmPending();state.demo.cursorLabel='确认隔离';toast('A 入口路线改变 · 敌人从当前位置折向 DMZ')});demoAt(12.5,()=>{const t=state.towers.find(t=>t.type==='repair');if(t)useSkill(t)});
}
function setupDemo2(){
 const gate=demoTower('gate',6,6);gate.hp=95;gate.maxHp=380;demoTower('firewall',2,5);demoTower('interceptor',0,5,Math.PI/2);demoTower('interceptor',4,4,-1.4);demoTower('sandbox',5,7);demoTower('repair',5,9);demoTower('interceptor',8,7,2.4);demoTower('firewall',9,8);
 demoEnemy('flood','C',6,5,1.3);demoEnemy('worm','C',6,4);demoEnemy('worm','C',6,3);demoEnemy('packer','C',6,2);demoEnemy('flood','B',11,3);demoEnemy('ransom','B',12,2);demoEnemy('worm','B',10,3);
 demoEnemy('ransom','A',1,2);demoEnemy('worm','A',2,4);demoEnemy('worm','A',2,5);demoEnemy('trojan','A',2,6);demoEnemy('hotspot','A',1,1);demoEnemy('hotspot','B',12,1);
 state.spawnQueue=[{time:8,type:'flood',entry:'C'},{time:9,type:'worm',entry:'B'},{time:10,type:'worm',entry:'A'},{time:12,type:'packer',entry:'B'},{time:14,type:'ransom',entry:'C'},{time:15,type:'worm',entry:'A'}];state.spawnTime=0;
 demoAt(3.4,()=>{const g=getCell(6,6).tower,f=state.enemies.find(e=>e.type==='flood');if(g){applyTowerDamage(g,999,f);toast('洪泛团冲垮网闸 · C / B 旁路直通','danger')}});
 demoAt(5.0,()=>{activateItem('downgrade');state.demo.cursorLabel='选择协议降级'});demoAt(6.2,()=>previewDowngrade(getCell(2,6)));demoAt(8.0,()=>{useItemAt(getCell(2,6));state.demo.cursorLabel='确认投放 · A 路线旧协议'});demoAt(13.0,()=>{const r=state.towers.find(t=>t.type==='repair');if(r)useSkill(r)});
}
function setupDemo3(){
 demoTower('firewall',2,6);demoTower('gate',4,7);demoTower('repair',1,8);demoTower('interceptor',0,4,1.9);demoTower('interceptor',6,10,-2.2);demoTower('interceptor',10,5,1.57);demoTower('firewall',10,8);
 const boss=demoEnemy('boss','A',2,3.3,1.0);boss.revealed=false;boss.skillTimer=99;boss.hp=boss.maxHp*.72;boss.phase=1;
 demoEnemy('ransom','A',2,4,1.3);demoEnemy('flood','A',4,6);demoEnemy('trojan','C',4,3);demoEnemy('packer','C',4,2);demoEnemy('worm','C',3,2);demoEnemy('flood','B',11,6);demoEnemy('ransom','B',11,4);demoEnemy('worm','B',10,8);
 state.spawnQueue=[{time:6,type:'trojan',entry:'C'},{time:8,type:'worm',entry:'A'},{time:10,type:'flood',entry:'B'},{time:12,type:'ransom',entry:'C'},{time:14,type:'worm',entry:'A'}];state.spawnTime=0;
 demoAt(1.4,()=>{demoTower('sandbox',3,5);logEvent('沙箱上线，开始扫描潜伏信号')});demoAt(2.2,()=>{if(boss.revealed){ringEffect(boss.pos,0xf1b968,2.4,1);toast('沙箱完成检测 · 潜伏目标已显形')}else toast('沙箱正在分析潜伏信号','warn')});
 demoAt(3.2,()=>{const c=getCell(2,5);createTelegraph(c,2.2,'蛰影 · 锁死前方运维环',()=>activateBossLock(c,7,'运维环锁死'))});
 demoAt(8.0,()=>{const r=state.towers.filter(t=>t.type==='repair')[0];if(r){selectObject(r);state.demo.cursorLabel='选中修复进程'}for(const t of state.towers)if(t.pos.distanceTo(boss.pos)<4)t.encrypted=4});
 demoAt(10.3,()=>{const r=state.towers.filter(t=>t.type==='repair')[0];if(r){useSkill(r);state.demo.cursorLabel='释放冗余切换'}});
 demoAt(13.2,()=>{if(!boss.dead){boss.hp=boss.maxHp*.55;boss.phase=1;toast('蛰影进入提权阶段 · 护甲强化','danger')}});
}
function updateDemo(dt){
 const d=state.demo;if(!d)return;if(d.finished){updateDemoUI();return}d.time=Math.min(d.duration,d.time+dt);state.spawnTime=d.time;
 for(const ev of d.events)if(!ev.done&&d.time>=ev.time){ev.done=true;ev.action()}
 if(dt>0)updateBattle(dt);
 updateDemoCamera(dt);updateDemoUI();if(d.time>=d.duration&&!d.finished){d.finished=true;state.waveActive=false;state.spawnQueue=[];if(!d.exporting)toast('演示结束 · 可退出后进入本图亲自部署')}
}
function updateDemoCamera(dt){
 const d=state.demo;if(!d)return;let cell={x:6,z:5},radius=16;
 if(d.id==='demo-1'){
  if(d.time<2.5){cell={x:6,z:5};radius=23}else if(d.time<8){cell={x:2.3,z:2.6};radius=13}else if(d.time<14){cell={x:6,z:5};radius=14}else{cell={x:6,z:5};radius=22}
 }else if(d.id==='demo-2'){
  if(d.time<2.5){cell={x:6.5,z:5};radius=23}else if(d.time<6.5){cell={x:6,z:5};radius=13}else if(d.time<12){cell={x:2.5,z:5.5};radius=12}else{cell={x:6,z:5};radius=20}
 }else{
  if(d.time<2){cell={x:6,z:5};radius=24}else if(d.time<8){cell={x:2.5,z:4.5};radius=12}else if(d.time<13){cell={x:3,z:5.5};radius=11}else{cell={x:6,z:6};radius=18}
 }
 cameraRig.desiredTarget.copy(worldPos(cell,0));cameraRig.desiredRadius=radius;cameraRig.theta+=dt*(d.id==='demo-2'?.035:.018);
}
function subtitleFor(id,t){
 if(id==='demo-1')return t<2.4?'分段内网 · 办公网段与业务网段在 DMZ 交汇':t<4.8?'拖放网闸到西边界节点，先观察各入口的新路线':t<7?'白色虚线：A 将折向 DMZ 互联，与 B 汇流':t<10?'确认隔离。场上敌人从当前位置重新寻路，不穿越截断节点':t<14?'汇流提升沙箱效率，也让防火墙承受更大的阻挡压力':'改道争取了火力窗口；修复进程释放冗余切换，维持受损防线';
 if(id==='demo-2')return t<3?'骨干流域洪峰 · C、B 经旧专线汇流，A 正遭遇压制':t<5?'洪泛团重击汇聚节点，网闸被冲垮':t<8?'旁路恢复直通，C、B 重新收敛；同时对 A 投放协议降级':t<12?'旧协议使木马显形并减速，寻路也计入更慢的通行成本':'双活中心分担压力。守方遏制部分流量，敌方仍在冲击另一侧防线';
 return t<2?'气隙深层第 16 波 · 蛰影潜伏在运维环':t<3.2?'沙箱检测使潜伏目标显形，远程拦截开始生效':t<5.5?'破坏预警：蛰影即将锁死前方运维环':t<8?'道路锁死，各入口同步改道；勒索者加密了关键设备':t<10.3?'选中修复进程，准备释放冗余切换':t<13?'护盾吸收冲击并解除加密，隔离与阻挡始终保持':'蛰影进入提权阶段。两侧核心仍有压力，防线暂时维持';
}
function projectToScreen(pos){const p=pos.clone().project(camera);return{x:(p.x*.5+.5)*innerWidth,y:(-.5*p.y+.5)*innerHeight}}
function updateDemoUI(){
 const d=state.demo;if(!d)return;$$('#toastStack .toast[data-until]').forEach(t=>{if(+t.dataset.until<=d.time)t.remove()});$('#demoTime').textContent=`${formatTime(d.time)} / ${formatTime(d.duration)}`;$('#demoProgress').style.width=d.time/d.duration*100+'%';const subtitle=subtitleFor(d.id,d.time);if(d.subtitle!==subtitle){d.subtitle=subtitle;$('#demoSubtitle').textContent=subtitle}
 let cursor=null,label='';
 if(d.id==='demo-1'){
  if(d.time>=2.4&&d.time<4.8){const a=elementCenter($('.tower-card[data-type=gate]')),b=projectToScreen(worldPos(getCell(1,3),.4)),f=(d.time-2.4)/2.4;cursor=lerp2(a,b,ease(f));label=f>.15?'网闸 · 拖动中':''}else if(d.time>=4.8&&d.time<7){cursor=projectToScreen(worldPos(getCell(1,3),.4));label=d.time>6.3?'确认隔离':'预览路线'}else cursor=null;
 }else if(d.id==='demo-2'){
  if(d.time>=4.8&&d.time<8){const a=elementCenter($('.item-card[data-item=downgrade]')),b=projectToScreen(worldPos(getCell(2,6),.3)),f=(d.time-4.8)/3.2;cursor=lerp2(a,b,ease(f));label='协议降级'}else cursor=null;
 }else{
  if(d.time>=7.5&&d.time<10.3){const r=state.towers.filter(t=>t.type==='repair')[0],a=r?projectToScreen(r.pos):{x:innerWidth/2,y:innerHeight/2},b=elementCenter($('#skillTower')),f=(d.time-7.5)/2.8;cursor=f<.55?a:lerp2(a,b,(f-.55)/.45);label=f<.55?'修复进程':'冗余切换'}else cursor=null;
 }
 const el=$('#demoCursor');if(cursor){el.classList.remove('hidden');el.style.left=cursor.x+'px';el.style.top=cursor.y+'px';el.querySelector('span').textContent=d.cursorLabel||label;el.classList.toggle('down',!!label)}else el.classList.add('hidden');
}
function elementCenter(el){if(!el)return{x:innerWidth*.8,y:innerHeight*.5};const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}}
function lerp2(a,b,t){return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}}
function ease(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)}
function exitDemo(){state.demo=null;state.exportMode=false;state.paused=false;$('#pauseModal').classList.add('hidden');document.body.classList.remove('demo-mode','export-mode');$('#demoOverlay').classList.add('hidden');$('#demoCursor').classList.add('hidden');showScreen('maps')}
window.videoExport={runs:['demo-1','demo-2','demo-3'],
 async begin(runId,{fps=30}={}){if(!DEMO_DEFS[runId])throw new Error('Unknown runId');startDemo(runId,true);state.exportFps=fps;state.exportLastFrame=-1;return{frames:Math.floor(DEMO_DEFS[runId].duration*fps)+1}},
 async frame(i){if(!state.demo||!state.exportMode)throw new Error('Call begin first');const target=i/state.exportFps;if(i<state.exportLastFrame)throw new Error('Frames must be sequential');if(i===0&&state.exportLastFrame===-1){updateCamera(0);renderer.render(scene,camera)}else{let guard=0;while(state.demo.time<target-1e-7&&guard++<10000){const dt=Math.min(1/state.exportFps,target-state.demo.time);updateDemo(dt);updateSceneVisuals(dt);updateCamera(dt)}state.demo.time=Math.min(state.demo.duration,target);updateDemoUI();renderer.render(scene,camera)}state.exportLastFrame=i;return true},
 end(){if(state.exportMode)exitDemo()}
};
function bindUI(){
 buildTowerCards();buildSectorList();renderManual();const closeManual=()=>{ $('#manualModal').classList.add('hidden');if(state.manualPaused){state.manualPaused=false;state.paused=false;updateHUD()} };
 $('#enterMaps').onclick=()=>{audio.init();showScreen('maps')};$('#openDemos').onclick=()=>{showScreen('maps');setTimeout(()=>$('.demo-section').scrollIntoView({behavior:'smooth'}),50)};
 $$('[data-back=menu]').forEach(b=>b.onclick=()=>showScreen('menu'));$$('.map-card').forEach(card=>{card.addEventListener('click',e=>{const i=+card.dataset.map;$$('.map-card').forEach(c=>c.classList.toggle('active',c===card));state.mapIndex=i;$('#menuMapName').textContent=MAP_META[i].name;$('#menuMapCode').textContent=MAP_META[i].code;$('#menuLoad').innerHTML=[38.4,61.7,47.2][i]+'<small>%</small>';buildMap(i,true);if(e.target.closest('.map-launch'))resetGame(i)})});
 $$('[data-demo]').forEach(b=>b.onclick=()=>{audio.init();startDemo(b.dataset.demo)});$('#exitDemo').onclick=exitDemo;
 $('#manualBtn').onclick=()=>{state.manualPaused=false;$('#manualModal').classList.remove('hidden');renderManual();audio.sfx('click')};$('#battleManual').onclick=()=>{state.manualPaused=state.running&&!state.paused;state.paused=true;$('#manualModal').classList.remove('hidden');renderManual();audio.sfx('click')};$$('.close-modal').forEach(b=>b.onclick=closeManual);$$('#manualTabs button').forEach(b=>b.onclick=()=>renderManual(b.dataset.tab));$('#manualModal').addEventListener('click',e=>{if(e.target===$('#manualModal'))closeManual()});
 $('#gameMenuBtn').onclick=()=>togglePause(true);$('#pauseBtn').onclick=()=>togglePause();$('#resumeBtn').onclick=()=>togglePause(false);$('#speedBtn').onclick=()=>{state.speed=state.speed===1?2:state.speed===2?3:1;updateHUD();audio.sfx('click')};$('#cameraBtn').onclick=()=>fitCamera();
 $('#restartBtn').onclick=()=>resetGame(state.mapIndex);$('#pauseMenuBtn').onclick=()=>{if(state.demo)exitDemo();else{$('#pauseModal').classList.add('hidden');showScreen('maps')}};$('#reportRestart').onclick=()=>resetGame(state.mapIndex);$('#reportMenu').onclick=()=>{$('#reportModal').classList.add('hidden');showScreen('maps')};$('#startWaveBtn').onclick=()=>{if(state.nextWave>0){state.cpu+=Math.ceil(state.nextWave)*2;state.nextWave=0}startWave()};$('#clearLog').onclick=()=>$('#eventLog').innerHTML='';
 $('#muteBtn').onclick=()=>{audio.init();audio.muted=!audio.muted;audio.setVolume(audio.volume);$('.volume-wrap').classList.toggle('muted',audio.muted);$('#muteBtn').style.color=audio.muted?'var(--red)':''};$('#volume').oninput=e=>audio.setVolume(e.target.value);$('#pauseVolume').oninput=e=>audio.setVolume(e.target.value);
 $('#fullscreenBtn').onclick=()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.()};
 window.addEventListener('keydown',e=>{audio.init();const manualOpen=!$('#manualModal').classList.contains('hidden');if(e.code==='Space'&&state.screen==='game'&&!manualOpen){e.preventDefault();togglePause()}if(e.key.toLowerCase()==='r'&&state.screen==='game'&&!manualOpen)fitCamera();if(e.key.toLowerCase()==='h'&&state.screen==='game')$('#battleManual').click();if(e.key==='Escape'){if(manualOpen)closeManual();else if(state.demo)exitDemo();else if(state.pending)closeRouteConfirm();else if(state.itemMode||state.dragType){state.dragType=null;cancelItem()}else selectObject(null)}if(state.screen==='game'&&!state.demo&&!manualOpen&&/^[1-6]$/.test(e.key)){state.dragType=Object.keys(TOWERS)[+e.key-1];clearGhost();toast(`已选择 ${TOWERS[state.dragType].name} · 点击有效地块部署`)}});
 document.addEventListener('pointerdown',()=>audio.init(),{once:true});
}
function updateSceneVisuals(dt){
 state.realTime+=dt;const t=state.screen==='game'?state.time:state.realTime;
 for(const m of animated){if(!m.parent)continue;if(m.userData.spin)m.rotation.z+=dt*m.userData.spin;if(m.userData.float)m.position.y=.88+Math.sin(t*1.7)*m.userData.float;if(m.userData.flow)m.material.opacity=.16+.07*Math.sin(t*2);if(m.userData.blink!==undefined)m.visible=Math.sin(t*4+m.userData.blink)>-.45;if(m.userData.publicFlow!==undefined){const span=state.map.w*CELL+3;m.position.x=((t*.12+m.userData.publicFlow)%1)*span-span/2;m.rotation.y+=dt*3}}
 for(const p of routePackets){if(!p.mesh.parent)continue;p.mesh.position.copy(pathPoint(p.path,t*.035+p.offset));p.mesh.position.y=.25+Math.sin(t*4+p.offset)*.04}
 for(const p of ambientParticles)p.rotation.y+=dt*.003;for(const p of ambientTraffic){p.mesh.position.copy(p.a).lerp(p.b,(t*p.speed+p.offset)%1);p.mesh.rotation.y+=dt*2}for(const s of protocolScans){s.mesh.position.z=((t*.035+s.offset)%1)*44-22;s.mesh.material.opacity=.12+.12*Math.sin(t*2+s.offset*8)}
 for(const c of state.map?.cells||[]){if(c.ring){const blocked=isNodeBlocked(c);c.ring.material=blocked?materials.red:materials.cyan;c.statusLight.material=blocked?materials.red:materials.cyan;c.ring.scale.setScalar(blocked?1.08+Math.sin(t*5)*.06:1)}if(c.degradeMesh)c.degradeMesh.material.opacity=.12+.07*Math.sin(t*4)}
}
let uiClock=0;
function frameLoop(now){
 requestAnimationFrame(frameLoop);const realDt=Math.min(.05,(now-(state.lastFrame||now))/1000);state.lastFrame=now;
 if(!state.exportMode){
  if(state.demo){if(!state.paused){const dt=realDt*state.speed;updateDemo(dt);updateCamera(dt)}}else if(state.running&&!state.paused&&state.screen==='game'){const dt=realDt*state.speed;updateBattle(dt);updateCamera(realDt)}else updateCamera(realDt);
  updateSceneVisuals(state.paused&&state.screen==='game'?0:realDt);audio.update();uiClock+=realDt;if(uiClock>1){uiClock=0;$('#clock').textContent='SESSION '+formatTime(state.realTime)+'.00'}
  renderer.render(scene,camera);
 }
}
initThree();bindUI();updateHUD();setTimeout(()=>{$('#boot').style.opacity=0;setTimeout(()=>$('#boot').remove(),700)},650);requestAnimationFrame(frameLoop);
})();
